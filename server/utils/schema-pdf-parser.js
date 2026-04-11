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
  'cps':      '(?:cps|mPa\\.?\\s*s|cp|cP)',
  'cP':       '(?:cps|mPa\\.?\\s*s|cp|cP)',
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
  'purity':           ['purity'],
  'boiling point':    ['boiling\\s*point'],
  'flash point':      ['flash\\s*point'],
  'grammage':         ['grammage', 'basis\\s*weight'],
  'burst strength':   ['burst(?:ing)?\\s*strength'],
  'brightness':       ['brightness'],
  'opacity':          ['opacity'],
  'moisture':         ['moisture(?:\\s*content)?'],
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
function extractNumericNearLabel(text, labelRegexes, unitRegex) {
  for (const labelRe of labelRegexes) {
    const match = labelRe.exec(text);
    if (!match) continue;

    // Get a window of ~200 chars after the label match
    const start = match.index;
    const window = text.slice(start, start + 300);

    // Strategy 1: label ... number unit (on same line or nearby)
    if (unitRegex) {
      const withUnit = new RegExp(
        '([<>≤≥~]?\\s*-?\\d+[,.]?\\d*)\\s*' + unitRegex.source,
        'i'
      );
      const m = withUnit.exec(window);
      if (m) {
        const val = parseFloat(m[1].replace(/[<>≤≥~\s]/g, '').replace(',', '.'));
        // Find test method AFTER the value, not before
        const afterValue = window.slice(m.index + m[0].length);
        if (Number.isFinite(val)) return { value: val, method: findTestMethod(afterValue) || findTestMethod(window) };
      }
    }

    // Strategy 2: label ... number (no unit, just first number after label)
    const numOnly = /([<>≤≥~]?\s*-?\d+[,.]?\d*)/;
    // Skip the label text itself, look for number after it
    const afterLabel = window.slice(match[0].length);
    const m2 = numOnly.exec(afterLabel);
    if (m2) {
      const val = parseFloat(m2[1].replace(/[<>≤≥~\s]/g, '').replace(',', '.'));
      if (Number.isFinite(val)) return { value: val, method: findTestMethod(window) };
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
    const afterLabel = text.slice(match.index + match[0].length, match.index + match[0].length + 100);
    // Take the first non-empty token after the label
    const cleaned = afterLabel.replace(/^[\s:=]+/, '').split(/[\n\r]/)[0].trim();
    if (cleaned && cleaned.length > 0 && cleaned.length < 80) return { value: cleaned };
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

  const text = pdfText.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');
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
      if (result) results[field_key] = result.value;
      continue;
    }

    // Numeric extraction
    const result = extractNumericNearLabel(text, labelRegexes, unitRegex);
    if (result) {
      let val = result.value;

      // Density conversion
      val = handleDensityConversion(field_key, val, unit);

      // Validate against min/max if defined
      const min = def.min != null ? Number(def.min) : null;
      const max = def.max != null ? Number(def.max) : null;
      if (min !== null && val < min * 0.5) continue; // way out of range, skip
      if (max !== null && val > max * 2) continue;   // way out of range, skip

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
