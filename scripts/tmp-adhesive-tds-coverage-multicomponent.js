const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const { extractBySchema, buildLabelRegex } = require('../server/utils/schema-pdf-parser');

const definitions = [
  { field_key: 'appearance', label: 'Appearance', unit: null, field_type: 'text' },
  { field_key: 'carrying_solvent', label: 'Carrying Solvent', unit: null, field_type: 'text' },
  { field_key: 'functionality', label: 'Functionality', unit: null, field_type: 'text' },
  { field_key: 'solids_pct', label: 'Solids', unit: null, field_type: 'number', min: 10, max: 100 },
  { field_key: 'viscosity_cps', label: 'Viscosity', unit: null, field_type: 'number', min: 10, max: 20000 },
  { field_key: 'density_g_cm3', label: 'Density', unit: null, field_type: 'number', min: 0.7, max: 1.5 },
  { field_key: 'mix_ratio', label: 'Mix Ratio', unit: null, field_type: 'text' },
  { field_key: 'pot_life_min', label: 'Pot Life', unit: null, field_type: 'number', min: 1, max: 600 },
  { field_key: 'bond_strength', label: 'Bond Strength', unit: 'N/15mm', field_type: 'number', min: 0.5, max: 30 },
  { field_key: 'cure_time_hours', label: 'Cure Time', unit: 'hours', field_type: 'number', min: 0.5, max: 168 },
  { field_key: 'application_temp_c', label: 'Application Temp', unit: 'C', field_type: 'number', min: 20, max: 120 },
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

async function readPdfText(filePath) {
  const buf = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: new Uint8Array(buf), verbosity: 0 });
  await parser.load();
  const parsed = await parser.getText();
  return (parsed.pages || []).map((p) => p.text || '').join('\n');
}

function normalizeText(v) {
  return String(v || '').trim();
}

function normalizePdfText(raw) {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ');
}

function normalizeMaterialKey(v) {
  return normalizeText(v).toLowerCase();
}

function toPlainNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  let text = String(raw)
    .trim()
    .replace(/[<>~]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^0-9,\.\-+]/g, '');

  if (!text) return null;

  const hasComma = text.includes(',');
  const hasDot = text.includes('.');

  if (hasComma && hasDot) {
    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    const decimalSep = lastComma > lastDot ? ',' : '.';
    if (decimalSep === ',') {
      text = text.replace(/\./g, '').replace(/,/g, '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (hasComma) {
    if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) {
      text = text.replace(/,/g, '');
    } else if (/^[+-]?\d+,\d{1,3}$/.test(text)) {
      text = text.replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (hasDot) {
    if (/^[+-]?\d{1,3}(\.\d{3})+$/.test(text)) {
      text = text.replace(/\./g, '');
    }
  }

  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function extractLikelyItemCodes(rawText, limit = 8) {
  const text = String(rawText || '');
  const codeRe = /\b([A-Z]{1,5}\d{2,6}[A-Z]?)\b/g;
  const blocked = new Set(['ASTM', 'ISO', 'DIN', 'EN', 'TDS', 'PDF', 'DATA']);
  const counts = new Map();

  let m;
  while ((m = codeRe.exec(text)) !== null) {
    const token = String(m[1] || '').toUpperCase();
    if (!token || blocked.has(token)) continue;
    if (/^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([token]) => token);
}

function detectCombinedComponentLayout(rawText, fileName = '') {
  const text = String(rawText || '');
  const name = String(fileName || '');
  const likelyCodes = extractLikelyItemCodes(text, 10);

  let pairMatch = text.match(/\b([A-Z]{1,5}\d{2,6}[A-Z]?)\s*(?:\+|AND|\/)\s*([A-Z]{1,5}\d{2,6}[A-Z]?)\b/i);
  if (!pairMatch) {
    pairMatch = name.match(/([A-Z]{1,5}\d{2,6}[A-Z]?)\s*(?:\+|AND|\/)\s*([A-Z]{1,5}\d{2,6}[A-Z]?)/i);
  }

  let codeA = pairMatch ? String(pairMatch[1]).toUpperCase() : null;
  let codeB = pairMatch ? String(pairMatch[2]).toUpperCase() : null;

  if (!codeA && likelyCodes.length) codeA = likelyCodes[0];
  if (!codeB) {
    const alt = likelyCodes.find((token) => token && token !== codeA);
    if (alt) codeB = alt;
  }

  const shared = [];
  const partA = [];
  const partB = [];
  let state = 'shared';

  const lines = text.split(/\r?\n/);
  lines.forEach((line) => {
    const lower = String(line || '').toLowerCase();
    const marksA = /\b(part|component)\s*a\b/.test(lower)
      || (/\bresin\b/.test(lower) && !/\bhard(?:e)?n/.test(lower));
    const marksB = /\b(part|component)\s*b\b/.test(lower)
      || /\bhard(?:e)?n(?:er)?\b/.test(lower);

    if (marksA && !marksB) state = 'a';
    else if (marksB) state = 'b';

    if (state === 'a') partA.push(line);
    else if (state === 'b') partB.push(line);
    else shared.push(line);
  });

  const hasExplicitMarkers = partA.length > 0 && partB.length > 0;
  const hasTwoCodes = !!(codeA && codeB && codeA !== codeB);

  return {
    isMulti: hasTwoCodes || hasExplicitMarkers,
    hasExplicitMarkers,
    likelyCodes,
    componentA: {
      code: codeA,
      sectionText: partA.join('\n'),
    },
    componentB: {
      code: codeB,
      sectionText: partB.join('\n'),
    },
    sharedText: shared.join('\n'),
  };
}

function extractColumnNumericCandidate(chunk) {
  const raw = String(chunk || '').trim();
  if (!raw) return null;

  const toleranceMain = raw.match(/([<>~]?\s*-?\d+(?:[.,]\d+)?)\s*(?:\+\/-|\+-|\+\s*\/\s*-)\s*-?\d+(?:[.,]\d+)?/i);
  if (toleranceMain) {
    const val = toPlainNumber(toleranceMain[1]);
    if (Number.isFinite(val)) return val;
  }

  const cleaned = raw
    .replace(/\b(?:at\s*)?-?\d+(?:[.,]\d+)?\s*(?:deg\.?\s*)?[CF]\b/gi, ' ')
    .replace(/\btemp(?:erature)?\s*[:=-]?\s*-?\d+(?:[.,]\d+)?\b/gi, ' ');

  const rangeStart = cleaned.match(/([<>~]?\s*-?\d+(?:[.,]\d+)?)\s*(?:-|to)\s*-?\d+(?:[.,]\d+)?/i);
  if (rangeStart) {
    const val = toPlainNumber(rangeStart[1]);
    if (Number.isFinite(val)) return val;
  }

  const first = cleaned.match(/([<>~]?\s*-?\d+(?:[.,]\d+)?)/);
  if (!first) return null;
  return toPlainNumber(first[1]);
}

function selectTwoNumericCandidates(values, def, sourceText = '') {
  const source = (Array.isArray(values) ? values : []).filter((n) => Number.isFinite(n));
  if (!source.length) return [];

  const minBound = def?.min != null ? Number(def.min) : null;
  const maxBound = def?.max != null ? Number(def.max) : null;
  const unit = normalizeText(def?.unit).toLowerCase();
  const key = normalizeMaterialKey(def?.field_key || '');
  const textProbe = String(sourceText || '').toLowerCase();
  const isPctField = unit.includes('%') || key.includes('pct') || key.includes('percent') || /%/.test(textProbe);
  const text = String(sourceText || '');
  const hasToleranceToken = /(?:\+\/-|\+-|\+\s*\/\s*-|\btol(?:erance)?\b)/i.test(text);
  const hasRangeToken = /\d+\s*-\s*\d+|\bto\b|\bmin(?:imum)?\b|\bmax(?:imum)?\b|\brange\b/i.test(text);
  const rangeMatchCount = (
    text.match(/([<>~]?\s*-?\d+(?:[.,]\d+)?)\s*(?:-|to)\s*-?\d+(?:[.,]\d+)?/gi) || []
  ).length;
  let filtered = source;

  if (isPctField) {
    const pct = source.filter((n) => n >= 0 && n <= 100);
    if (pct.length >= 2) filtered = pct;
  } else if (unit.includes('g/cm') || key.includes('density')) {
    const density = source.filter((n) => n > 0 && n < 20);
    if (density.length >= 2) filtered = density;
  } else if (unit.includes('cps') || unit.includes('cp') || key.includes('viscosity')) {
    const visc = source.filter((n) => n > 0 && n < 500000);
    if (visc.length >= 2) filtered = visc;
  }

  if (Number.isFinite(minBound)) filtered = filtered.filter((n) => n >= minBound * 0.5);
  if (Number.isFinite(maxBound)) filtered = filtered.filter((n) => n <= maxBound * 2);

  if (!filtered.length) return [];

  if (filtered.length > 2) {
    if (isPctField && hasToleranceToken) {
      const nonTinyPct = filtered.filter((n) => Math.abs(n) > 5 && n >= 0 && n <= 100);
      if (nonTinyPct.length >= 2) {
        return [nonTinyPct[0], nonTinyPct[nonTinyPct.length - 1]];
      }
    }
    return [];
  }

  if (filtered.length === 2) {
    if (hasToleranceToken) {
      const percentCount = (text.match(/%/g) || []).length;
      const hasTinyValue = filtered.some((n) => Math.abs(n) <= 5);
      if (isPctField && percentCount >= 3 && !hasTinyValue) return filtered.slice(0, 2);
      if (hasTinyValue) {
        const principal = filtered.find((n) => Math.abs(n) > 5);
        return Number.isFinite(principal) ? [principal] : [filtered[0]];
      }
      return [filtered[0]];
    }

    if (hasRangeToken) {
      if (rangeMatchCount >= 2) return filtered.slice(0, 2);
      return [filtered[0]];
    }
  }

  return filtered.slice(0, 2);
}

function extractTwoColumnBySchema(rawText, paramDefs = []) {
  const componentA = {};
  const componentB = {};

  if (!rawText || !Array.isArray(paramDefs) || !paramDefs.length) {
    return { componentA, componentB };
  }

  const lines = String(rawText).split(/\r?\n/);

  for (const def of paramDefs) {
    if (!def?.field_key || !def?.label) continue;
    if (def.field_type === 'json_array') continue;

    const labelRegexes = buildLabelRegex(def.label);
    let matchedLine = null;
    let labelEndIndex = 0;

    for (const line of lines) {
      let matched = false;
      for (const labelRe of labelRegexes) {
        const m = labelRe.exec(line);
        if (!m) continue;
        matchedLine = line;
        labelEndIndex = (m.index || 0) + String(m[0] || '').length;
        matched = true;
        break;
      }
      if (matched) break;
    }

    if (!matchedLine) continue;

    const afterLabel = String(matchedLine)
      .slice(labelEndIndex)
      .replace(/^[\s:=\-]+/, '')
      .trim();
    if (!afterLabel) continue;

    if (def.field_type === 'text') {
      continue;
    }

    const columnParts = afterLabel
      .split(/\s{2,}|\t+|\s*\|\s*/)
      .map((v) => normalizeText(v))
      .filter(Boolean);

    if (columnParts.length >= 2) {
      const columnNumbers = columnParts
        .map((part) => extractColumnNumericCandidate(part))
        .filter((n) => Number.isFinite(n));

      const selectedColumns = selectTwoNumericCandidates(columnNumbers, def, afterLabel);
      if (selectedColumns.length >= 2) {
        componentA[def.field_key] = selectedColumns[0];
        componentB[def.field_key] = selectedColumns[1];
        continue;
      }
    }

    const rangeStarts = Array.from(
      afterLabel.matchAll(/([<>~]?\s*-?\d+(?:[.,]\d+)?)\s*(?:-|to)\s*-?\d+(?:[.,]\d+)?/gi)
    )
      .map((m) => toPlainNumber(m[1]))
      .filter((n) => Number.isFinite(n));

    if (rangeStarts.length >= 2) {
      const selectedRanges = selectTwoNumericCandidates(rangeStarts.slice(0, 2), def, afterLabel);
      if (selectedRanges.length >= 2) {
        componentA[def.field_key] = selectedRanges[0];
        componentB[def.field_key] = selectedRanges[1];
        continue;
      }
    }

    const numericTokens = Array.from(afterLabel.matchAll(/[-+]?\d+(?:[.,]\d+)?/g))
      .map((m) => toPlainNumber(m[0]))
      .filter((n) => Number.isFinite(n));

    const selected = selectTwoNumericCandidates(numericTokens, def, afterLabel);
    if (selected.length >= 2) {
      componentA[def.field_key] = selected[0];
      componentB[def.field_key] = selected[1];
    }
  }

  return { componentA, componentB };
}

function hasCapturedValue(v) {
  return v !== undefined && v !== null && String(v).trim() !== '';
}

async function scanPdfs(baseDir) {
  const pdfs = listPdfs(baseDir);
  const summary = Object.fromEntries(
    definitions.map((d) => [d.field_key, { label: d.label, mentioned: 0, captured: 0 }])
  );

  const perRecord = [];
  let splitDocs = 0;

  for (const pdfPath of pdfs) {
    const rel = path.relative(baseDir, pdfPath).replace(/\\/g, '/');

    try {
      const text = normalizePdfText(await readPdfText(pdfPath));
      const layout = detectCombinedComponentLayout(text, rel);
      const twoColumn = extractTwoColumnBySchema(text, definitions);

      const sharedExtracted = extractBySchema(layout.sharedText || text, definitions);
      const partAExtracted = extractBySchema(layout.componentA.sectionText || '', definitions);
      const partBExtracted = extractBySchema(layout.componentB.sectionText || '', definitions);

      const hasTwoColumnSignal = Object.keys(twoColumn.componentA || {}).length > 0
        && Object.keys(twoColumn.componentB || {}).length > 0;

      const numericFieldKeys = new Set(
        definitions
          .filter((d) => d?.field_type === 'number' && d?.field_key)
          .map((d) => d.field_key)
      );

      const sharedAllowList = new Set([
        'mix_ratio',
        'pot_life_min',
        'bond_strength',
        'cure_time_hours',
        'application_temp_c',
      ]);

      const sectionA = layout.hasExplicitMarkers ? partAExtracted : {};
      const sectionB = layout.hasExplicitMarkers ? partBExtracted : {};

      const sharedForA = Object.fromEntries(
        Object.entries(sharedExtracted || {}).filter(([k]) => sharedAllowList.has(k))
      );
      const sharedForB = Object.fromEntries(
        Object.entries(sharedExtracted || {}).filter(([k]) => sharedAllowList.has(k))
      );

      if (!layout.hasExplicitMarkers && hasTwoColumnSignal) {
        for (const key of numericFieldKeys) {
          delete sharedForA[key];
          delete sharedForB[key];
        }
      }

      const componentAExtracted = {
        ...sharedForA,
        ...sectionA,
        ...(twoColumn.componentA || {}),
      };

      const componentBExtracted = {
        ...sharedForB,
        ...sectionB,
        ...(twoColumn.componentB || {}),
      };

      const countNonShared = (obj) => Object.keys(obj || {}).filter((k) => !sharedAllowList.has(k)).length;
      const hasMeaningfulComponents = countNonShared(componentAExtracted) > 0 && countNonShared(componentBExtracted) > 0;
      const isMulti = hasTwoColumnSignal || layout.hasExplicitMarkers || (layout.isMulti && hasMeaningfulComponents);

      const singleExtracted = extractBySchema(text, definitions);

      const records = [];
      if (isMulti) {
        splitDocs += 1;
        records.push({
          record: `${rel}::A(${layout.componentA.code || 'PartA'})`,
          sourceText: layout.componentA.sectionText || text,
          extracted: componentAExtracted,
        });
        records.push({
          record: `${rel}::B(${layout.componentB.code || 'PartB'})`,
          sourceText: layout.componentB.sectionText || text,
          extracted: componentBExtracted,
        });
      } else {
        records.push({
          record: rel,
          sourceText: text,
          extracted: singleExtracted,
        });
      }

      for (const row of records) {
        const capturedPairs = [];
        for (const def of definitions) {
          const regs = buildLabelRegex(def.label);
          const mentioned = regs.some((r) => r.test(row.sourceText || ''));
          const captured = hasCapturedValue(row.extracted[def.field_key]);

          if (mentioned) summary[def.field_key].mentioned += 1;
          if (captured) {
            summary[def.field_key].captured += 1;
            capturedPairs.push(`${def.field_key}=${row.extracted[def.field_key]}`);
          }
        }

        perRecord.push({
          record: row.record,
          captured: capturedPairs,
        });
      }
    } catch (err) {
      perRecord.push({
        record: rel,
        captured: [`ERROR=${err.message}`],
      });
    }
  }

  console.log('=== MULTI-COMPONENT COVERAGE SUMMARY ===');
  console.log(`PDF files scanned: ${pdfs.length}`);
  console.log(`Files split into A/B components: ${splitDocs}`);
  console.log(`Total analyzed records: ${perRecord.length}`);
  console.table(
    Object.entries(summary).map(([field_key, stats]) => ({
      field_key,
      label: stats.label,
      mentioned_count: stats.mentioned,
      captured_count: stats.captured,
    }))
  );

  console.log('\n=== PER RECORD CAPTURED VALUES ===');
  perRecord.forEach((row) => {
    console.log(`${row.record}: [${row.captured.join(', ') || '-'}]`);
  });
}

const targetDir = path.join(process.cwd(), 'Product Groups data', 'Adhesives');
scanPdfs(targetDir).catch((err) => {
  console.error(err);
  process.exit(1);
});
