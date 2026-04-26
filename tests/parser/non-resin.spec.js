/**
 * Non-resin parser smoke tests
 * Phase 9 of MATERIAL_SPECS_AND_PARSER_CONSOLIDATED_FIX_PLAN_2026-04-24.md
 *
 * Asserts that detectCombinedComponentLayout and extractTwoColumnBySchema
 * behave correctly on the four canonical adhesive PDFs.
 *
 * Plain Node script (no jest/mocha needed). Run from PPH/:
 *   node tests/parser/non-resin.spec.js
 * Exit code 0 = all green, 1 = any failure.
 */
const fs = require('fs');
const path = require('path');

const tdsModule = require('../../server/routes/mes/master-data/tds');
const { detectCombinedComponentLayout, extractTwoColumnBySchema } = tdsModule.__testOnly || {};

const FIX = path.join(__dirname, '..', 'fixtures', 'tds-pdfs', 'adhesives');
const fixtures = [
  { name: 'henkel-loctite-LA7796-LA6154', expectMulti: true,  minComponents: 2, expectedCodes: ['LA7796', 'LA6154'] },
  { name: 'brilliant-H214-A75',          expectMulti: true,  minComponents: 2, expectedCodes: ['H214', 'A75'] },
  { name: 'sp-MB655-CT85',               expectMulti: true,  minComponents: 2, expectedCodes: ['MB655', 'CT85'] },
  { name: 'ecolad-SB940-SB527',          expectMulti: true,  minComponents: 2, expectedCodes: ['SB940', 'SB527'] },
];

// Minimal adhesive parameter schema used by extractTwoColumnBySchema
const adhesiveSchema = [
  { field_key: 'viscosity_mpas', label: 'Viscosity', unit: 'mPa.s', field_type: 'number' },
  { field_key: 'solid_content_pct', label: 'Solid Content', unit: '%', field_type: 'number' },
  { field_key: 'density_kg_m3', label: 'Density', unit: 'kg/m³', field_type: 'number' },
  { field_key: 'pot_life_min', label: 'Pot Life', unit: 'min', field_type: 'number' },
  { field_key: 'mix_ratio', label: 'Mix Ratio', unit: '', field_type: 'text' },
];

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; failures.push({ name, detail }); console.log('  ✗', name, detail || ''); }
}

console.log('Non-resin parser smoke tests\n============================');

if (!detectCombinedComponentLayout || !extractTwoColumnBySchema) {
  console.error('FATAL: parser helpers not exported from tds.js (__testOnly missing).');
  process.exit(1);
}

for (const fx of fixtures) {
  const txtPath = path.join(FIX, fx.name + '.txt');
  if (!fs.existsSync(txtPath)) {
    console.log('\n[SKIP]', fx.name, '— fixture missing:', txtPath);
    continue;
  }
  const text = fs.readFileSync(txtPath, 'utf8');
  console.log('\n[' + fx.name + '] (' + text.length + ' chars)');

  // Test 1: layout detector returns expected shape
  let layout;
  try {
    layout = detectCombinedComponentLayout(text);
  } catch (err) {
    failed++;
    failures.push({ name: fx.name + ' / layout', detail: err.message });
    console.log('  ✗ layout detector threw:', err.message);
    continue;
  }
  check(fx.name + ' / layout returns object', layout && typeof layout === 'object',
    'got: ' + typeof layout);
  check(fx.name + ' / layout is multi-component',
    layout && layout.isMulti === fx.expectMulti,
    'expected isMulti=' + fx.expectMulti + ', got: ' + (layout ? layout.isMulti : 'null'));
  check(fx.name + ' / detected component codes',
    layout && fx.expectedCodes.every(code => (layout.likelyCodes || []).includes(code)
      || layout.componentA?.code === code || layout.componentB?.code === code),
    'got codes: ' + (layout ? [layout.componentA?.code, layout.componentB?.code, ...(layout.likelyCodes || [])].filter(Boolean).join(',') : 'null'));

  // Test 2: two-column schema extractor returns rows
  let extracted;
  try {
    extracted = extractTwoColumnBySchema(text, adhesiveSchema);
  } catch (err) {
    failed++;
    failures.push({ name: fx.name + ' / schema-extract', detail: err.message });
    console.log('  ✗ schema extractor threw:', err.message);
    continue;
  }
  check(fx.name + ' / schema extractor returns object',
    extracted && typeof extracted === 'object',
    'got: ' + typeof extracted);
  const componentsWithValues = ['componentA', 'componentB']
    .filter(key => extracted && extracted[key] && Object.keys(extracted[key]).length > 0).length;
  check(fx.name + ' / schema extractor returns values for both components',
    componentsWithValues >= fx.minComponents,
    'componentA=' + Object.keys(extracted?.componentA || {}).join(',') + '; componentB=' + Object.keys(extracted?.componentB || {}).join(','));
}

console.log('\n============================');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
if (failed) {
  console.log('\nFailures:');
  for (const f of failures) console.log('  •', f.name, '—', f.detail || '(see above)');
  process.exit(1);
}
process.exit(0);
