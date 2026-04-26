/**
 * Schema-Driven PDF Parser
 * Extracts parameter values from TDS PDF text using mes_parameter_definitions.
 * Works for ALL categories — resins, substrates, adhesives, chemicals, etc.
 *
 * Usage:
 *   const { extractBySchema } = require('./schema-pdf-parser');
 *   const results = extractBySchema(pdfText, paramDefinitions);
 */
'use strict';

// ── Unit pattern map: unit string → regex fragment for matching ──────
const UNIT_PATTERNS = {
  'g/10min':  '(?:g\\s*/\\s*10\\s*min|g/10min)',
  'g/cm3':    '(?:g\\s*/\\s*cm[3³])',
  'g/cm³':    '(?:g\\s*/\\s*cm[3³])',
  'kg/m3':    '(?:kg\\s*/\\s*m[3³])',
  'kg/m³':    '(?:kg\\s*/\\s*m[3³])',
  'um':       '(?:µm|μm|mic(?:ron)?)',
  'µm':       '(?:µm|μm|mic(?:ron)?)',
  'mic':      '(?:µm|μm|mic(?:ron)?)',
  'mm':       '(?:mm(?!\\w))',
  'C':        '(?:°\\s*C|°C|deg\\.?\\s*C)',
  '°C':       '(?:°\\s*C|°C|deg\\.?\\s*C)',
  'MPa':      '(?:MPa|mpa|N\\s*/\\s*mm[2²])',
  '%':        '(?:%)',
  'g':        '(?:g(?!\\w))',
  'N':        '(?:N(?!\\w))',
  'N/mm':     '(?:N\\s*/\\s*mm)',
  'N/15mm':   '(?:N\\s*/\\s*15\\s*mm)',
  'N/25mm':   '(?:N\\s*/\\s*25\\s*mm)',
  'cps':      '(?:cps|mPa\\.?\\s*s?|cp|cP)',
  'cP':       '(?:cps|mPa\\.?\\s*s?|cp|cP)',
  'dyne':     '(?:dyne(?:\\s*/\\s*cm)?)',
  'dyne/cm':  '(?:dyne\\s*/\\s*cm|dyne)',
  'GU':       '(?:GU|gu|gloss\\s*units?)',
  'g/m2':     '(?:g\\s*/\\s*m[2²]|gsm)',
  'g/m²':     '(?:g\\s*/\\s*m[2²]|gsm)',
  'kN/m':     '(?:kN\\s*/\\s*m)',
  'kPa':      '(?:kPa|kpa)',
  'mN':       '(?:mN)',
  'sec':      '(?:sec(?:onds?)?|s(?!\\w))',
  'sec/100ml':'(?:sec\\s*/\\s*100\\s*ml)',
  'm2/kg':    '(?:m[2²]\\s*/\\s*kg)',
  'm²/kg':    '(?:m[2²]\\s*/\\s*kg)',
  'cc/m2/24h':'(?:cc\\s*/\\s*m[2²]\\s*/\\s*(?:24\\s*h|day))',
  'cc/m²/day':'(?:cc\\s*/\\s*m[2²]\\s*/\\s*(?:24\\s*h|day))',
  'g/m2/24h': '(?:g\\s*/\\s*m[2²]\\s*/\\s*(?:24\\s*h|day))',
  'g/m²/day': '(?:g\\s*/\\s*m[2²]\\s*/\\s*(?:24\\s*h|day))',
  'mg/m2':    '(?:mg\\s*/\\s*m[2²])',
  'mg/m²':    '(?:mg\\s*/\\s*m[2²])',
  'min':      '(?:min(?:utes?)?)',
  'hours':    '(?:hours?|hrs?)',
  'no/m²':    '(?:no\\.?\\s*/\\s*m[2²]|pinholes?\\s*/\\s*m[2²])',
};

// ── Label aliases: common alternative names for parameters ───────────
const LABEL_ALIASES = {
  'density':          ['density', 'specific\\s*gravity'],
  'thickness':        ['thickness', 'gauge', 'caliper'],
  'tensile md':       ['tensile\\s*(?:strength\\s*)?(?:md|machine)', 'tensile\\s*stress.*md'],
  'tensile td':       ['tensile\\s*(?:strength\\s*)?(?:td|transverse)', 'tensile\\s*stress.*td'],
  'elongation md':    ['elongation.*md', 'elongation.*machine', 'strain.*break.*md', 'strain.*md'],
  'elongation td':    ['elongation.*td', 'elongation.*transverse', 'strain.*break.*td', 'strain.*td'],
  'cof static':       ['cof\\s*(?:static)?', 'coefficient.*friction.*static', 'static.*cof'],
  'cof kinetic':      ['cof\\s*(?:kinetic|dynamic)', 'coefficient.*friction.*(?:kinetic|dynamic)', '(?:kinetic|dynamic).*cof'],
  'corona':           ['corona', 'surface\\s*(?:tension|energy|treatment)', 'dyne\\s*level'],
  'haze':             ['haze'],
  'gloss':            ['gloss'],
  'yield':            ['yield'],
  'otr':              ['otr', 'oxygen\\s*transmission'],
  'wvtr':             ['wvtr', 'water\\s*vap(?:ou?r)?\\s*transmission', 'moisture\\s*vap(?:ou?r)?\\s*transmission'],
  'dart drop':        ['dart\\s*(?:drop|impact)', 'falling\\s*dart'],
  'seal strength':    ['seal\\s*strength', 'heat\\s*seal\\s*strength'],
  'tear md':          ['(?:elmendorf\\s*)?tear.*md', 'tear\\s*strength.*md'],
  'tear td':          ['(?:elmendorf\\s*)?tear.*td', 'tear\\s*strength.*td'],
  'shrinkage md':     ['shrinkage.*md', 'shrink.*md'],
  'shrinkage td':     ['shrinkage.*td', 'shrink.*td'],
  'puncture':         ['puncture', 'puncture\\s*resistance'],
  'mfr':              ['mfr', 'mfi', 'melt\\s*(?:flow\\s*(?:rate|index)?|index)'],
  'vicat':            ['vicat'],
  'melting point':    ['(?:crystalline\\s*)?melting\\s*(?:point|temp)'],
  'flexural modulus': ['flexural\\s*modulus', '1%\\s*secant\\s*modulus'],
  'bulk density':     ['bulk\\s*density'],
  'brittleness':      ['brittleness'],
  'solids':           ['solid(?:s)?\\s*(?:content)?'],
  'viscosity':        ['viscosity'],
  'mix ratio':        ['mix(?:ing)?\\s*ratio'],
  'pot life':         ['pot\\s*life', 'working\\s*time'],
  'appearance':       ['appearance', 'visual\\s*appearance', 'physical\\s*appearance'],
  'carrying solvent': ['carrying\\s*solvent', 'solvent\\s*(?:system|type|base)', '(?:diluent|solvent)\\s*used'],
  'purity':           ['purity'],
  'boiling point':    ['boiling\\s*point'],
  'flash point':      ['flash\\s*point'],
  'grammage':         ['grammage', 'basis\\s*weight'],
  'burst strength':   ['burst(?:ing)?\\s*strength'],
  'brightness':       ['brightness'],
  'opacity':          ['opacity'],
  'optical density':  ['optical\\s*density', 'o\\.\\s*d\\.', 'light\\s*transmission'],
  'moisture':         ['moisture(?:\\s*content)?', 'water\\s*content', 'water\\s*uptake', 'regain'],
  'cobb 60':          ['cobb\\s*(?:60)?', 'water\\s*absorption.*60'],
  'porosity':         ['porosity', 'gurley(?:\\s*number)?', 'air\\s*permeability.*gurley'],
  'adhesion':         ['adhesion', 'peel\\s*(?:strength|adhesion)'],
  'coat weight':      ['coat(?:ing)?\\s*weight', 'dry\\s*coat\\s*weight'],
  'cure temp':        ['cure\\s*temp', 'curing\\s*temp'],
  'dosage':           ['dosage', 'loading', 'addition\\s*rate'],
  'carrier resin':    ['carrier\\s*resin', 'base\\s*resin'],
  'active content':   ['active\\s*(?:content|ingredient)'],
  'alloy':            ['alloy'],
  'temper':           ['temper'],
  'bond strength':    ['bond\\s*strength', 'peel\\s*strength', 'lamination\\s*strength'],
  'cure time':        ['cure\\s*time', 'curing\\s*time'],
  'application temp': ['application\\s*temp', 'apply\\s*temp'],
  'evaporation rate': ['evaporation\\s*rate', 'evap\\.?\\s*rate'],
  'residue':          ['residue', 'non-volatile\\s*residue'],
  'solubility':       ['solubility', 'miscibility'],
  'adhesion':         ['adhesion', 'peel\\s*(?:strength|adhesion)', 'tape\\s*test'],
  'blocking':         ['blocking', 'block(?:ing)?\\s*tendency'],
  'pinhole':          ['pinhole', 'pin\\s*hole'],
  'surface clean':    ['surface\\s*clean', 'oil\\s*level', 'wetting\\s*tension'],
  'stiffness':        ['stiffness', 'taber\\s*stiffness', 'rigidity'],
  'curl':             ['curl', 'curl\\s*tendency'],
  'dead fold':        ['dead\\s*fold'],
  'carrier mfi':      ['carrier\\s*(?:mfi|mfr)', 'base\\s*resin\\s*(?:mfi|mfr)'],
  'dispersion':       ['dispersion', 'dispersion\\s*rating'],
  'sit':              ['sit', 'seal\\s*init(?:iation)?\\s*temp'],
  'hot tack':         ['hot\\s*tack'],
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildLabelRegex(label) {
  const normalized = label.toLowerCase().trim();
  // Check aliases first
  for (const [key, patterns] of Object.entries(LABEL_ALIASES)) {
    if (normalized.includes(key) || key.includes(normalized.split(' ')[0])) {
      return patterns.map(p => new RegExp(p, 'i'));
    }
  }
  // Fallback: escape the label and allow flexible whitespace
  const escaped = escapeRegex(normalized).replace(/\s+/g, '\\s+');
  return [new RegExp(escaped, 'i')];
}

function buildUnitRegex(unit) {
  if (!unit || unit === '-') return null;
  const pattern = UNIT_PATTERNS[unit] || UNIT_PATTERNS[unit.toLowerCase()];
  if (pattern) return new RegExp(pattern, 'i');
  // Fallback: literal match
  return new RegExp(escapeRegex(unit), 'i');
}

/**
 * Extract a numeric value near a label match, optionally followed by a unit.
 * Searches within a window of text around the label match.
 */
function extractNumericNearLabel(text, labelRegexes, unitRegex, fieldKey = '') {
  for (const labelRe of labelRegexes) {
    const match = labelRe.exec(text);
    if (!match) continue;

    // Get a window of text after the label match and prefer same-line parsing.
    const start = match.index;
    const window = text.slice(start, start + 320);
    const sameLine = window.slice(match[0].length).split(/[\n\r]/)[0] || '';

    // Strategy 1: label ... number unit (on same line or nearby)
    if (unitRegex) {
      const source = sameLine || window;

      // Prefer principal value in tolerance expressions (e.g., "70 +/- 2%" -> 70).
      const withTolerance = new RegExp(
        '([<>≤≥~]?\\s*-?\\d[\\d,.]*)\\s*(?:\\+\\s*\\/\\s*-|\\+\\s*-|±)\\s*\\d[\\d,.]*\\s*' + unitRegex.source,
        'i'
      );
      const tolMatch = withTolerance.exec(source);
      if (tolMatch) {
        const tolVal = toNumber(tolMatch[1]);
        if (Number.isFinite(tolVal)) return { value: tolVal, method: findTestMethod(source) };
      }

      const withUnit = new RegExp(
        '([<>≤≥~]?\\s*-?\\d[\\d,.]*)\\s*' + unitRegex.source,
        'i'
      );
      const m = withUnit.exec(source);
      if (m) {
        const val = toNumber(m[1]);
        // Find test method AFTER the value, not before
        const afterValue = source.slice(m.index + m[0].length);
        if (Number.isFinite(val)) return { value: val, method: findTestMethod(afterValue) || findTestMethod(source) };
      }
    }

    // Strategy 2: label ... number (no unit)
    const numOnly = /([<>≤≥~]?\s*-?\d[\d,.]*)/g;
    // Skip the label text itself and ignore temperature tokens like 25°C.
    const afterLabel = window
      .slice(match[0].length)
      .replace(/\b(?:at\s*)?-?\d+(?:[.,]\d+)?\s*(?:°\s*)?(?:deg\.?\s*)?[CF](?:elsius|ahrenheit)?\b/gi, ' ')
      .replace(/\btemp(?:erature)?\s*[:=-]?\s*-?\d+(?:[.,]\d+)?\b/gi, ' ');

    const source = sameLine && sameLine.trim().length > 0 ? sameLine : afterLabel;
    const candidates = [];
    let m2;
    while ((m2 = numOnly.exec(source)) !== null) {
      const token = m2[1];
      const tail = source.slice(m2.index + token.length, m2.index + token.length + 10);
      const head = source.slice(Math.max(0, m2.index - 12), m2.index);

      // Ignore temperature-like numbers when unit is absent (e.g. "at 25 C").
      if (!unitRegex) {
        if (/(?:°\s*[CF]\b|deg\.?\s*[CF]\b)/i.test(tail)) continue;
        if (/\b(?:at|temp|temperature)\s*$/i.test(head)) continue;
      }

      const val = toNumber(token);
      if (!Number.isFinite(val)) continue;

      const context = source.slice(Math.max(0, m2.index - 28), m2.index + token.length + 28);
      let score = 1;

      // For viscosity without explicit unit, avoid tiny values commonly from temp context.
      if (!unitRegex && /viscosity/i.test(fieldKey) && val < 50) continue;
      if (/viscosity/i.test(fieldKey) && /\b(?:cps?|cp|mPa\.?\s*s?)\b/i.test(context)) score += 1;

      if (/pot_life/i.test(fieldKey)) {
        const hasTimeUnit = /\b(?:sec|seconds?|min|minutes?|h|hr|hrs|hour|hours)\b/i.test(context);
        const hasPotLifePhrase = /\bpot\s*life\b/i.test(context);
        if (!hasTimeUnit && !hasPotLifePhrase) continue;
        if (hasTimeUnit) score += 3;
        if (hasPotLifePhrase) score += 2;
        if (val > 120 && !/\b(?:min|minutes?)\b/i.test(context)) score -= 2;
      }

      if (/cure_time/i.test(fieldKey)) {
        if (/\b(?:hour|hours|hr|hrs|h)\b/i.test(context)) score += 2;
        if (/\b(?:min|minutes?)\b/i.test(context)) score += 1;
      }

      candidates.push({ value: val, index: m2.index, score, context });
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => (b.score - a.score) || (a.index - b.index));
      const best = candidates[0];
      let val = best.value;

      if (/pot_life/i.test(fieldKey)) {
        if (/\b(?:hour|hours|hr|hrs|h)\b/i.test(best.context)) {
          val = val * 60;
        } else if (/\b(?:sec|seconds?)\b/i.test(best.context)) {
          val = val / 60;
        }
      } else if (/cure_time/i.test(fieldKey) && /\b(?:min|minutes?)\b/i.test(best.context)) {
        val = val / 60;
      }

      return { value: val, method: findTestMethod(source) };
    }
  }
  return null;
}

/**
 * Extract a text value near a label match.
 */
function extractTextNearLabel(text, labelRegexes) {
  for (const labelRe of labelRegexes) {
    const match = labelRe.exec(text);
    if (!match) continue;
    const afterLabel = text.slice(match.index + match[0].length, match.index + match[0].length + 220);
    const ratioWindow = text.slice(match.index + match[0].length, match.index + match[0].length + 700);
    const firstLine = afterLabel
      .replace(/^[\s:=\-]+/, '')
      .split(/[\n\r]/)[0]
      .trim();

    // Prefer ratio-like text when present (e.g., "100 parts by weight : 3 parts by weight").
    const ratioLike = ratioWindow.match(/\b(-?\d+(?:[.,]\d+)?)\s*parts?\s*by\s*weight\b[^\n\r]{0,120}\b(-?\d+(?:[.,]\d+)?)\s*parts?\s*by\s*weight\b/i)
      || ratioWindow.match(/(?:^|[^A-Za-z0-9])(-?\d+(?:[.,]\d+)?)\s*(?:[:\/]|to)\s*(-?\d+(?:[.,]\d+)?)(?:$|[^A-Za-z0-9])/i);
    if (ratioLike) {
      return { value: ratioLike[0].trim() };
    }

    // Use first meaningful segment before separators used for notes/test methods.
    const cleaned = firstLine
      .split(/\s{2,}|\|/)[0]
      .replace(/^[-,:;]+|[-,:;]+$/g, '')
      .trim();
    if (cleaned && cleaned.length > 0 && cleaned.length < 120) return { value: cleaned };
  }
  return null;
}

function toNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return null;

  let text = String(raw)
    .trim()
    .replace(/[<>≤≥~]/g, '')
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

function normalizeNumericToken(raw) {
  const n = toNumber(raw);
  if (!Number.isFinite(n)) return null;
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(6))).replace(/\.0+$/, '');
}

function normalizeMixRatioText(raw) {
  const text = String(raw || '').trim();
  if (!text) return text;

  const byWeight = text.match(/\b(-?\d+(?:[.,]\d+)?)\s*parts?\s*by\s*weight\b[^\n\r]{0,120}\b(-?\d+(?:[.,]\d+)?)\s*parts?\s*by\s*weight\b/i);
  if (byWeight) {
    const left = normalizeNumericToken(byWeight[1]);
    const right = normalizeNumericToken(byWeight[2]);
    if (left && right) return `${left}:${right}`;
  }

  const direct = text.match(/(?:^|[^A-Za-z0-9])(-?\d+(?:[.,]\d+)?)\s*(?:[:\/]|to)\s*(-?\d+(?:[.,]\d+)?)(?:$|[^A-Za-z0-9])/i);
  if (direct) {
    const left = normalizeNumericToken(direct[1]);
    const right = normalizeNumericToken(direct[2]);
    if (left && right) return `${left}:${right}`;
  }

  return null;
}

/**
 * Find the nearest ASTM/ISO/DIN test method reference in a text window.
 */
function findTestMethod(text) {
  const m = String(text || '').match(/((?:ASTM|ISO|DIN|EN)\s*[A-Z]?\s*[\dA-Z\-\/.]+)/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

/**
 * Handle density conversion: g/cm³ → kg/m³ if the DB stores in kg/m³
 */
function handleDensityConversion(fieldKey, value, unit) {
  if (!fieldKey.includes('density') || !value) return value;
  // If unit is kg/m3 and value < 10, it's probably in g/cm3 — convert
  if (unit === 'kg/m3' && value < 10) return Math.round(value * 1000);
  return value;
}

/**
 * Main extraction function.
 * @param {string} pdfText - Raw text extracted from PDF
 * @param {Array} paramDefs - Array of parameter definitions from mes_parameter_definitions
 *   Each: { field_key, label, unit, field_type, min, max, step }
 * @returns {Object} - { [field_key]: value, [field_key + '_test_method']: method }
 */
function extractBySchema(pdfText, paramDefs) {
  if (!pdfText || !Array.isArray(paramDefs) || !paramDefs.length) return {};

  // Normalize Unicode dashes (en-dash, em-dash, minus sign) to ASCII hyphen so
  // numeric ranges like "100\u20131000" parse correctly. (PB-05, 2026-04-25)
  const text = pdfText
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ');
  const results = {};

  for (const def of paramDefs) {
    const { field_key, label, unit, field_type } = def;
    if (!field_key || !label) continue;

    // Skip json_array types (like shrink_curve) and calculated fields
    if (field_type === 'json_array') continue;
    if (def.param_type === 'calculated') continue;

    const labelRegexes = buildLabelRegex(label);
    const unitRegex = buildUnitRegex(unit);

    if (field_type === 'text') {
      const result = extractTextNearLabel(text, labelRegexes);
      if (result) {
        let val = result.value;
        if (field_key === 'mix_ratio') {
          val = normalizeMixRatioText(val);
          if (!val) continue;
        }
        results[field_key] = val;
      }
      continue;
    }

    // Numeric extraction
    const result = extractNumericNearLabel(text, labelRegexes, unitRegex, field_key);
    if (result) {
      let val = result.value;

      // Density conversion
      val = handleDensityConversion(field_key, val, unit);

      // Validate against min/max if defined.
      // When unit is missing (common for adhesive DB defs), be stricter to avoid
      // contamination from unrelated numbers in dense TDS tables.
      const min = def.min != null ? Number(def.min) : null;
      const max = def.max != null ? Number(def.max) : null;
      const hasUnit = !!(unit && String(unit).trim() && String(unit).trim() !== '-');
      const strictByField = /solids|viscosity|density|pot_life|bond_strength|cure_time|application_temp/i.test(field_key);
      const strictRange = !hasUnit || strictByField;
      if (strictRange) {
        if (min !== null && val < min) continue;
        if (max !== null && val > max) continue;
      } else {
        if (min !== null && val < min * 0.5) continue;
        if (max !== null && val > max * 2) continue;
      }

      results[field_key] = val;

      // Test method: validate against test_method_options if defined
      if (result.method) {
        const options = Array.isArray(def.test_method_options) ? def.test_method_options : [];
        if (options.length > 0) {
          // Find best match: exact or partial (e.g. "ASTM D1238" matches "ASTM D1238/A")
          const extracted = result.method.toUpperCase().replace(/\s+/g, '');
          const matched = options.find(opt => {
            const o = opt.toUpperCase().replace(/\s+/g, '');
            return o === extracted || extracted.startsWith(o) || o.startsWith(extracted);
          });
          if (matched) {
            results[field_key + '_test_method'] = matched; // normalize to canonical form
          } else {
            // Keep extracted method but flag as unrecognized
            results[field_key + '_test_method'] = result.method;
            results[field_key + '_test_method_unrecognized'] = true;
          }
        } else {
          results[field_key + '_test_method'] = result.method;
        }
      }
    }
  }

  return results;
}

/**
 * Build a diff between extracted values and existing DB record.
 * @param {Object} extracted - Output from extractBySchema
 * @param {Object} existing - Current DB values (parameters_json or typed columns)
 * @param {Array} lockedFields - Fields locked by user (won't be overwritten)
 * @returns {Array} - Array of { field, label, old, new, locked, changed }
 */
function diffExtractedWithExisting(extracted, existing, lockedFields = [], paramDefs = []) {
  const locked = new Set(Array.isArray(lockedFields) ? lockedFields : []);
  const defMap = new Map(paramDefs.map(d => [d.field_key, d]));
  const diff = [];

  for (const [field, newVal] of Object.entries(extracted)) {
    // Skip internal flags and test method fields (handled with parent)
    if (field.endsWith('_test_method') || field.endsWith('_test_method_unrecognized')) continue;
    const oldVal = existing?.[field] ?? null;
    const isLocked = locked.has(field);
    const changed = oldVal !== newVal && !isLocked;
    const methodField = field + '_test_method';
    const methodUnrecognized = !!extracted[field + '_test_method_unrecognized'];
    const def = defMap.get(field);
    diff.push({
      field,
      label: def?.label || field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      unit: def?.unit || null,
      old: oldVal,
      new: newVal,
      method: extracted[methodField] || null,
      methodUnrecognized,
      testConditions: def?.test_conditions || null,
      locked: isLocked,
      changed,
    });
  }

  return diff;
}

module.exports = {
  extractBySchema,
  diffExtractedWithExisting,
  buildLabelRegex,
  buildUnitRegex,
  UNIT_PATTERNS,
  LABEL_ALIASES,
};
