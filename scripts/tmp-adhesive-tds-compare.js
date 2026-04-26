const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse'); 
const { pool } = require('../server/database/config');
const { extractBySchema, buildLabelRegex } = require('../server/utils/schema-pdf-parser');

async function getPdfText(pdfPath) {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    return data.text;
}

function listPdfs(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listPdfs(p, out);
    else if (/\.pdf$/i.test(e.name)) out.push(p);
  }
  return out;
}

(async () => {
  const baseDir = path.join(process.cwd(), 'Product Groups data', 'Adhesives');
  const pdfs = listPdfs(baseDir);

  const q = await pool.query(`
    SELECT field_key, label, unit, field_type, min_value AS min, max_value AS max
    FROM mes_parameter_definitions
    WHERE material_class = 'adhesives' AND profile IS NULL
    ORDER BY sort_order ASC
  `);
  const defs = q.rows;

  const summary = Object.fromEntries(defs.map(d => [d.field_key, { label: d.label, mentioned: 0, captured: 0 }]));
  const perFile = [];

  for (const pdfPath of pdfs) {
    let text = '';
    try {
        text = await getPdfText(pdfPath);
    } catch (err) {
        console.error(`Error parsing ${pdfPath}: ${err.message}`);
        continue;
    }

    const extracted = extractBySchema(text, defs);

    const mentioned = [];
    const captured = [];

    for (const d of defs) {
      const regs = buildLabelRegex(d.label);
      const hasLabel = regs.some(r => r.test(text));
      const val = extracted[d.field_key];
      const hasValue = val !== undefined && val !== null && String(val).trim() !== '';

      if (hasLabel) {
        mentioned.push(d.field_key);
        summary[d.field_key].mentioned += 1;
      }
      if (hasValue) {
        captured.push(`${d.field_key}=${val}`);
        summary[d.field_key].captured += 1;
      }
    }

    perFile.push({
      file: path.relative(baseDir, pdfPath),
      mentioned,
      captured
    });
  }

  console.log('=== Adhesives DB parameter defs ===');
  console.table(defs.map(d => ({ field_key: d.field_key, label: d.label, unit: d.unit, type: d.field_type })));

  console.log('\n=== Coverage summary across PDFs ===');
  console.table(Object.entries(summary).map(([k,v]) => ({ field_key: k, label: v.label, mentioned_in_files: v.mentioned, captured_in_files: v.captured })));

  console.log('\n=== Per-file details ===');
  for (const f of perFile) {
    if (f.file.includes('MB655') || f.file.includes('CT85') || perFile.indexOf(f) < 3) {
        console.log(`\n[${f.file}]`);
        console.log('mentioned:', f.mentioned.join(', ') || '-');
        console.log('captured :', f.captured.join(', ') || '-');
    }
  }

  await pool.end();
})().catch(async (e) => {
  console.error(e);
  try { await pool.end(); } catch {}
  process.exit(1);
});
