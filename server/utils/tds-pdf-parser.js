/**
 * tds-pdf-parser.js
 *
 * Strict resin-scope parser for supplier TDS PDFs.
 * Extracts only approved resin technical parameters and optional test methods.
 */

'use strict';

function parseNumber(raw) {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).replace(/[<>~=]/g, '').trim();
  const v = parseFloat(cleaned);
  return Number.isFinite(v) ? v : null;
}

function pickFirstValue(text, regexes) {
  for (const re of regexes) {
    const m = re.exec(text);
    if (!m) continue;
    const v = parseNumber(m[1]);
    if (v !== null) return v;
  }
  return null;
}

function pickLine(lines, regex) {
  return lines.find((line) => regex.test(line)) || '';
}

function findMethod(snippet) {
  const m = String(snippet || '').match(/((?:ASTM|ISO|DIN)\s*[A-Z]?\s*[\dA-Z\-\/.]+)/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

function extractMethodNear(text, regexes) {
  for (const re of regexes) {
    const m = re.exec(text);
    if (!m) continue;
    // Prefer method AFTER the match (same line/nearby), then before
    const afterStart = m.index + m[0].length;
    const afterEnd = Math.min(text.length, afterStart + 160);
    const afterMethod = findMethod(text.slice(afterStart, afterEnd));
    if (afterMethod) return afterMethod;
    // Fallback: check before the match
    const beforeStart = Math.max(0, m.index - 80);
    const beforeMethod = findMethod(text.slice(beforeStart, m.index));
    if (beforeMethod) return beforeMethod;
  }
  return null;
}

function parseLastCelsius(line) {
  const hits = [...String(line || '').matchAll(/([<>]?\s*-?\d+\.?\d*)\s*°?\s*[Cc]/g)];
  if (!hits.length) return null;
  return parseNumber(hits[hits.length - 1][1]);
}

function parseMpa(line) {
  const text = String(line || '');
  const pair = text.match(/([<>]?\s*-?\d+\.?\d*)\s*\/\s*([<>]?\s*-?\d+\.?\d*)\s*mpa/i);
  if (pair) return parseNumber(pair[1]);

  const mpa = text.match(/([<>]?\s*-?\d+\.?\d*)\s*mpa/i);
  if (mpa) return parseNumber(mpa[1]);

  const psi = text.match(/([<>]?\s*-?\d+\.?\d*)\s*psi/i);
  if (psi) {
    const v = parseNumber(psi[1]);
    return v === null ? null : parseFloat((v * 0.00689476).toFixed(2));
  }

  return null;
}

function parsePercent(line) {
  const text = String(line || '');
  const pair = text.match(/([<>]?\s*-?\d+\.?\d*)\s*\/\s*([<>]?\s*-?\d+\.?\d*)\s*%/i);
  if (pair) return parseNumber(pair[1]);
  const m = text.match(/([<>]?\s*-?\d+\.?\d*)\s*%/i);
  return m ? parseNumber(m[1]) : null;
}

function parseBulkDensity(line) {
  const text = String(line || '');
  const kg = text.match(/([<>]?\s*-?\d+\.?\d*)\s*kg\s*\/\s*m[3³]/i);
  if (kg) return parseNumber(kg[1]);

  const gcm = text.match(/([<>]?\s*-?\d+\.?\d*)\s*g\s*\/\s*cm[3³]/i);
  if (gcm) {
    const v = parseNumber(gcm[1]);
    return v === null ? null : parseFloat((v * 1000).toFixed(2));
  }

  return null;
}

const FILM_PARAMETER_FIELDS = new Set();

function getFieldDomain() {
  return 'resin_core';
}

function extractFromText(raw) {
  if (!raw || typeof raw !== 'string') return {};

  const t = raw.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');
  const lines = t.split('\n').map((line) => line.trim()).filter(Boolean);
  const out = {};

  out.mfr_190_2_16 = pickFirstValue(t, [
    /(?:mfr|mfi|melt\s*(?:flow\s*(?:rate|index)?|index))[^\n]{0,140}?(?:190\s*\/?\s*2\.16|190[^\d]{0,8}2\.16)[^\n]{0,40}?([<>]?\s*-?\d+\.?\d*)\s*(?:g\s*\/\s*10\s*min|g\/10min)/i,
    /(?:190\s*\/?\s*2\.16|190[^\d]{0,8}2\.16)[^\n]{0,40}?([<>]?\s*-?\d+\.?\d*)\s*(?:g\s*\/\s*10\s*min|g\/10min)/i,
  ]);

  out.mfr_190_5_0 = pickFirstValue(t, [
    /(?:mfr|mfi|melt\s*(?:flow\s*(?:rate|index)?|index))[^\n]{0,140}?(?:190\s*\/?\s*5(?:\.0+)?|190[^\d]{0,8}5(?:\.0+)?)[^\n]{0,40}?([<>]?\s*-?\d+\.?\d*)\s*(?:g\s*\/\s*10\s*min|g\/10min)/i,
    /(?:190\s*\/?\s*5(?:\.0+)?|190[^\d]{0,8}5(?:\.0+)?)[^\n]{0,40}?([<>]?\s*-?\d+\.?\d*)\s*(?:g\s*\/\s*10\s*min|g\/10min)/i,
  ]);

  out.hlmi_190_21_6 = pickFirstValue(t, [
    /(?:hlmi|high\s*load\s*melt\s*index)[^\n]{0,140}?(?:190\s*\/?\s*21\.6|190[^\d]{0,8}21\.6)[^\n]{0,40}?([<>]?\s*-?\d+\.?\d*)\s*(?:g\s*\/\s*10\s*min|g\/10min)/i,
    /(?:190\s*\/?\s*21\.6|190[^\d]{0,8}21\.6)[^\n]{0,40}?([<>]?\s*-?\d+\.?\d*)\s*(?:g\s*\/\s*10\s*min|g\/10min)/i,
  ]);

  out.mfr_230_2_16_pp = pickFirstValue(t, [
    /(?:mfr|mfi|melt\s*(?:flow\s*(?:rate|index)?|index))[^\n]{0,140}?(?:230\s*\/?\s*2\.16|230[^\d]{0,8}2\.16)[^\n]{0,40}?([<>]?\s*-?\d+\.?\d*)\s*(?:g\s*\/\s*10\s*min|g\/10min)/i,
    /(?:230\s*\/?\s*2\.16|230[^\d]{0,8}2\.16)[^\n]{0,40}?([<>]?\s*-?\d+\.?\d*)\s*(?:g\s*\/\s*10\s*min|g\/10min)/i,
  ]);

  const densityKg = pickFirstValue(t, [
    /density[^\n]{0,30}?([<>]?\s*-?\d{3,4}\.?\d*)\s*kg\s*\/\s*m[3³]/i,
  ]);
  if (densityKg !== null) {
    out.density = Math.round(densityKg);
  } else {
    const densityGcm = pickFirstValue(t, [
      /density[^\n]{0,30}?([<>]?\s*-?\d\.?\d{2,4})\s*g\s*\/\s*cm[3³]/i,
    ]);
    if (densityGcm !== null) out.density = Math.round(densityGcm * 1000);
  }

  const crystallineLine =
    pickLine(lines, /crystalline\s+melting\s+(?:point|temp(?:erature)?)/i) ||
    pickLine(lines, /(?:peak\s+)?melting\s+(?:point|temp(?:erature)?)/i);
  const crystalline = parseLastCelsius(crystallineLine);
  if (crystalline !== null) out.crystalline_melting_point = crystalline;

  const vicatLine = pickLine(lines, /vicat\s+(?:softening\s+)?(?:point|temp(?:erature)?)/i);
  const vicat = parseLastCelsius(vicatLine);
  if (vicat !== null) out.vicat_softening_point = vicat;

  const hdtLine = pickLine(lines, /(?:heat\s*deflection\s*(?:temp(?:erature)?|point)|\bhdt\b)/i);
  const hdt = parseLastCelsius(hdtLine);
  if (hdt !== null) out.heat_deflection_temp = hdt;

  const tensileBreakLine = pickLine(lines, /tensile\s+(?:strength|stress)\s+at\s+break/i);
  const tensileBreak = parseMpa(tensileBreakLine);
  if (tensileBreak !== null) out.tensile_strength_break = tensileBreak;

  const elongBreakLine = pickLine(lines, /(?:elongation|strain)(?:\s+at)?\s+break/i);
  const elongBreak = parsePercent(elongBreakLine);
  if (elongBreak !== null) out.elongation_break = elongBreak;

  const brittlenessLine = pickLine(lines, /brittleness\s*(?:temp(?:erature)?)?/i);
  const brittleness = parseLastCelsius(brittlenessLine);
  if (brittleness !== null) out.brittleness_temp = brittleness;

  const bulkLine = pickLine(lines, /bulk\s+density/i);
  const bulk = parseBulkDensity(bulkLine);
  if (bulk !== null) out.bulk_density = bulk;

  const flexuralLine = pickLine(lines, /flexural\s+modulus/i);
  const flexural = parseMpa(flexuralLine);
  if (flexural !== null) out.flexural_modulus = flexural;

  if (out.mfr_190_2_16 && out.hlmi_190_21_6 && out.mfr_190_2_16 > 0) {
    out.melt_flow_ratio = parseFloat((out.hlmi_190_21_6 / out.mfr_190_2_16).toFixed(2));
  }

  if (out.mfr_190_2_16 !== undefined) {
    const method = extractMethodNear(t, [/(?:190\s*\/?\s*2\.16|190[^\d]{0,8}2\.16)/i, /(?:mfr|mfi|melt\s*flow)/i]);
    if (method) out.mfr_190_2_16_test_method = method;
  }

  if (out.mfr_190_5_0 !== undefined) {
    const method = extractMethodNear(t, [/(?:190\s*\/?\s*5(?:\.0+)?|190[^\d]{0,8}5(?:\.0+)?)/i]);
    if (method) out.mfr_190_5_0_test_method = method;
  }

  if (out.hlmi_190_21_6 !== undefined) {
    const method = extractMethodNear(t, [/(?:190\s*\/?\s*21\.6|190[^\d]{0,8}21\.6)/i, /hlmi/i]);
    if (method) out.hlmi_190_21_6_test_method = method;
  }

  if (out.mfr_230_2_16_pp !== undefined) {
    const method = extractMethodNear(t, [/(?:230\s*\/?\s*2\.16|230[^\d]{0,8}2\.16)/i]);
    if (method) out.mfr_230_2_16_pp_test_method = method;
  }

  if (out.density !== undefined) {
    const method = extractMethodNear(t, [/density/i]);
    if (method) out.density_test_method = method;
  }

  if (out.crystalline_melting_point !== undefined) {
    const method = findMethod(crystallineLine) || extractMethodNear(t, [/crystalline\s+melting|melting\s+(?:point|temperature)/i]);
    if (method) out.crystalline_melting_point_test_method = method;
  }

  if (out.vicat_softening_point !== undefined) {
    const method = findMethod(vicatLine) || extractMethodNear(t, [/vicat/i]);
    if (method) out.vicat_softening_point_test_method = method;
  }

  if (out.heat_deflection_temp !== undefined) {
    const method = findMethod(hdtLine) || extractMethodNear(t, [/(?:heat\s*deflection|\bhdt\b)/i]);
    if (method) out.heat_deflection_temp_test_method = method;
  }

  if (out.tensile_strength_break !== undefined) {
    const method = findMethod(tensileBreakLine) || extractMethodNear(t, [/tensile\s+(?:strength|stress)\s+at\s+break/i]);
    if (method) out.tensile_strength_break_test_method = method;
  }

  if (out.elongation_break !== undefined) {
    const method = findMethod(elongBreakLine) || extractMethodNear(t, [/elongation(?:\s+at)?\s+break/i]);
    if (method) out.elongation_break_test_method = method;
  }

  if (out.brittleness_temp !== undefined) {
    const method = findMethod(brittlenessLine) || extractMethodNear(t, [/brittleness/i]);
    if (method) out.brittleness_temp_test_method = method;
  }

  if (out.bulk_density !== undefined) {
    const method = findMethod(bulkLine) || extractMethodNear(t, [/bulk\s+density/i]);
    if (method) out.bulk_density_test_method = method;
  }

  if (out.flexural_modulus !== undefined) {
    const method = findMethod(flexuralLine) || extractMethodNear(t, [/flexural\s+modulus/i]);
    if (method) out.flexural_modulus_test_method = method;
  }

  return out;
}

const FIELD_LABELS = {
  mfr_190_2_16: { label: 'MFR 190/2.16 (g/10 min)', numeric: true },
  mfr_190_2_16_test_method: { label: 'MFR 190/2.16 Test Method', numeric: false },
  mfr_190_5_0: { label: 'MFR 190/5.0 (g/10 min)', numeric: true },
  mfr_190_5_0_test_method: { label: 'MFR 190/5.0 Test Method', numeric: false },
  hlmi_190_21_6: { label: 'HLMI 190/21.6 (g/10 min)', numeric: true },
  hlmi_190_21_6_test_method: { label: 'HLMI 190/21.6 Test Method', numeric: false },
  mfr_230_2_16_pp: { label: 'MFR 230/2.16 (PP) (g/10 min)', numeric: true },
  mfr_230_2_16_pp_test_method: { label: 'MFR 230/2.16 (PP) Test Method', numeric: false },

  melt_flow_ratio: { label: 'Melt Flow Ratio', numeric: true },

  density: { label: 'Density (kg/m3)', numeric: true },
  density_test_method: { label: 'Density Test Method', numeric: false },

  crystalline_melting_point: { label: 'Crystalline Melting Point (C)', numeric: true },
  crystalline_melting_point_test_method: { label: 'Crystalline Melting Point Test Method', numeric: false },
  vicat_softening_point: { label: 'Vicat Softening Point (C)', numeric: true },
  vicat_softening_point_test_method: { label: 'Vicat Softening Point Test Method', numeric: false },
  heat_deflection_temp: { label: 'Heat Deflection Temp (C)', numeric: true },
  heat_deflection_temp_test_method: { label: 'Heat Deflection Temp Test Method', numeric: false },

  tensile_strength_break: { label: 'Tensile Strength at Break (MPa)', numeric: true },
  tensile_strength_break_test_method: { label: 'Tensile Strength at Break Test Method', numeric: false },
  elongation_break: { label: 'Elongation at Break (%)', numeric: true },
  elongation_break_test_method: { label: 'Elongation at Break Test Method', numeric: false },

  brittleness_temp: { label: 'Brittleness Temp (C)', numeric: true },
  brittleness_temp_test_method: { label: 'Brittleness Temp Test Method', numeric: false },
  bulk_density: { label: 'Bulk Density (kg/m3)', numeric: true },
  bulk_density_test_method: { label: 'Bulk Density Test Method', numeric: false },
  flexural_modulus: { label: 'Flexural Modulus (MPa)', numeric: true },
  flexural_modulus_test_method: { label: 'Flexural Modulus Test Method', numeric: false },
};

function splitExtractedByDomain(extracted) {
  const resinCore = {};
  for (const [field, value] of Object.entries(extracted || {})) {
    if (field in FIELD_LABELS) resinCore[field] = value;
  }
  return { resinCore, filmParameters: {} };
}

function diffWithRecord(extracted, dbRecord, lockedFields, options = {}) {
  const diff = [];
  const locked = Array.isArray(lockedFields) ? lockedFields : (dbRecord?.user_locked_fields || []);
  const forcedDomain = options?.domain || 'resin_core';
  const allowedFields = Array.isArray(options?.allowedFields)
    ? new Set(options.allowedFields)
    : (options?.allowedFields instanceof Set ? options.allowedFields : null);

  for (const [field, extractedValue] of Object.entries(extracted || {})) {
    if (!(field in FIELD_LABELS)) continue;
    if (allowedFields && !allowedFields.has(field)) continue;

    const current = dbRecord?.[field];
    const isEmpty = current === null || current === undefined || current === '';

    if (!isEmpty) {
      const curVal = typeof current === 'number' ? current : String(current).trim();
      const extVal = typeof extractedValue === 'number' ? extractedValue : String(extractedValue).trim();
      if (String(curVal) === String(extVal)) continue;
    }

    diff.push({
      field,
      label: FIELD_LABELS[field].label,
      currentValue: isEmpty ? null : current,
      extractedValue,
      isEmpty,
      isLocked: locked.includes(field),
      domain: forcedDomain,
    });
  }

  return diff;
}

module.exports = {
  extractFromText,
  diffWithRecord,
  FIELD_LABELS,
  FILM_PARAMETER_FIELDS,
  getFieldDomain,
  splitExtractedByDomain,
};
