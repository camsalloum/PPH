const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const { extractBySchema, buildLabelRegex } = require('../server/utils/schema-pdf-parser');

const definitions = [
    { field_key: 'solids_pct', label: 'Solids', unit: null, field_type: 'number', min: 10, max: 100 },
    { field_key: 'viscosity_cps', label: 'Viscosity', unit: null, field_type: 'number', min: 10, max: 20000 },
    { field_key: 'density_g_cm3', label: 'Density', unit: null, field_type: 'number', min: 0.7, max: 1.5 },
    { field_key: 'mix_ratio', label: 'Mix Ratio', unit: null, field_type: 'text' },
    { field_key: 'pot_life_min', label: 'Pot Life', unit: null, field_type: 'number', min: 1, max: 600 },
    { field_key: 'bond_strength', label: 'Bond Strength', unit: 'N/15mm', field_type: 'number', min: 0.5, max: 30 },
    { field_key: 'cure_time_hours', label: 'Cure Time', unit: 'hours', field_type: 'number', min: 0.5, max: 168 },
    { field_key: 'application_temp_c', label: 'Application Temp', unit: '°C', field_type: 'number', min: 20, max: 120 },
];

function listPdfs(dir, out = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) listPdfs(p, out);
        else if (/\.pdf$/i.test(e.name)) out.push(p);
    }
    return out;
}

function hasCapturedValue(v) {
    return v !== undefined && v !== null && String(v).trim() !== '';
}

async function readPdfText(filePath) {
    const buf = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: new Uint8Array(buf), verbosity: 0 });
    await parser.load();
    const parsed = await parser.getText();
    return (parsed.pages || []).map((p) => p.text || '').join('\n');
}

async function scanPdfs(baseDir) {
    const pdfs = listPdfs(baseDir);
    const summary = Object.fromEntries(
        definitions.map((d) => [d.field_key, { label: d.label, mentioned: 0, captured: 0 }])
    );

    const perFile = [];

    for (const pdfPath of pdfs) {
        try {
            const text = await readPdfText(pdfPath);
            const extracted = extractBySchema(text, definitions);

            const capturedPairs = [];
            for (const def of definitions) {
                const regs = buildLabelRegex(def.label);
                const mentioned = regs.some((r) => r.test(text));
                const captured = hasCapturedValue(extracted[def.field_key]);

                if (mentioned) summary[def.field_key].mentioned += 1;
                if (captured) {
                    summary[def.field_key].captured += 1;
                    capturedPairs.push(`${def.field_key}=${extracted[def.field_key]}`);
                }
            }

            perFile.push({
                file: path.relative(baseDir, pdfPath).replace(/\\/g, '/'),
                captured: capturedPairs,
            });
        } catch (err) {
            perFile.push({
                file: path.relative(baseDir, pdfPath).replace(/\\/g, '/'),
                captured: [`ERROR=${err.message}`],
            });
        }
    }

    console.log('=== COVERAGE SUMMARY ===');
    console.table(
        Object.entries(summary).map(([field_key, stats]) => ({
            field_key,
            label: stats.label,
            mentioned_count: stats.mentioned,
            captured_count: stats.captured,
        }))
    );

    console.log('\n=== PER FILE CAPTURED VALUES ===');
    perFile.forEach((row) => {
        console.log(`${row.file}: [${row.captured.join(', ') || '-'}]`);
    });
}

const targetDir = path.join(process.cwd(), 'Product Groups data', 'Adhesives');
scanPdfs(targetDir).catch((err) => {
    console.error(err);
    process.exit(1);
});
