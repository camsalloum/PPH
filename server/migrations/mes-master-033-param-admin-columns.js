/**
 * Migration mes-master-033 — Parameter Admin Columns
 * Adds layout/admin columns to mes_parameter_definitions.
 * Seeds display_group, has_test_method, and test_method_options.
 * Run: node server/migrations/mes-master-033-param-admin-columns.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// display_group assignments by field_key pattern
const GROUP_RULES = [
  // Resins
  { match: /^mfr_|^hlmi_|^melt_flow_ratio/, group: 'Rheology' },
  { match: /^density$|^crystalline_melting|^vicat_|^heat_deflection|^melting_point/, group: 'Thermal' },
  { match: /^tensile_|^elongation_|^flexural_|^brittleness_|^bulk_density/, group: 'Mechanical' },
  // Films - Physical
  { match: /^thickness_|^density_g_cm3$|^yield_m2_per_kg$|^grammage_|^total_thickness_|^alu_thickness_|^paper_grammage_|^total_grammage_/, group: 'Physical' },
  // Films - Mechanical
  { match: /^tensile_strength_|^elongation_|^tear_|^puncture_|^dart_|^burst_|^seal_strength_|^hot_tack_/, group: 'Mechanical' },
  // Films - Optical
  { match: /^haze_|^gloss_|^optical_density$|^brightness_|^opacity_/, group: 'Optical' },
  // Films - Barrier
  { match: /^otr_|^wvtr_|^solvent_retention_/, group: 'Barrier' },
  // Films - Surface & Sealing
  { match: /^cof_|^corona_|^seal_init_|^seal_temp_|^seal_range_|^hot_tack_temp_|^surface_type$|^treatment_side$/, group: 'Surface & Sealing' },
  // Films - Shrinkage
  { match: /^shrinkage_|^shrink_/, group: 'Shrinkage' },
  // Films - Other
  { match: /^moisture_|^smoothness_|^porosity_|^cobb_|^dead_fold$|^surface_finish$|^thermoformability$/, group: 'Other' },
  // Non-film categories
  { match: /^solids_|^viscosity_|^mix_ratio$|^pot_life_|^coat_weight_|^cure_temp_|^gloss_60deg$/, group: 'Properties' },
  { match: /^purity_|^boiling_point_|^flash_point_/, group: 'Chemical' },
  { match: /^dosage_|^carrier_resin$|^active_content_|^ash_|^moisture_pct$/, group: 'Composition' },
  { match: /^length_|^width_|^gsm$|^burst_strength$/, group: 'Dimensions' },
  { match: /^adhesion_|^tensile_n_|^elongation_pct$|^temp_resistance_/, group: 'Performance' },
  // Alu foil
  { match: /^alloy$|^temper$|^silicon_|^iron_|^copper_|^manganese_|^magnesium_|^zinc_|^titanium_/, group: 'Composition' },
  { match: /^thickness_min_|^thickness_max_|^thickness_tolerance_|^width_tolerance_/, group: 'Dimensions' },
  { match: /^tensile_strength_min_|^tensile_strength_max_|^elongation_min_/, group: 'Mechanical' },
  { match: /^core_id_|^max_coil_od_/, group: 'Coil Geometry' },
  { match: /^chemical_test_method$|^mechanical_test_method$|^gauge_test_method$|^pinhole_test_method$/, group: 'Test Methods' },
];

// test_method_options by field_key
const TEST_METHODS = {
  mfr_190_2_16:          ['ASTM D1238', 'ISO 1133'],
  mfr_190_5_0:           ['ASTM D1238', 'ISO 1133'],
  hlmi_190_21_6:         ['ASTM D1238', 'ISO 1133'],
  mfr_230_2_16_pp:       ['ASTM D1238', 'ISO 1133'],
  density:               ['ASTM D792', 'ASTM D1505', 'ISO 1183', 'ASTM D4883'],
  density_g_cm3:         ['ASTM D792', 'ASTM D1505', 'ISO 1183'],
  crystalline_melting_point: ['DSC', 'ISO 11357'],
  vicat_softening_point: ['ASTM D1525', 'ISO 306'],
  heat_deflection_temp:  ['ASTM D648', 'ISO 75'],
  tensile_strength_break:['ASTM D882', 'ASTM D638', 'ISO 527-3'],
  tensile_strength_md_mpa:['ASTM D882', 'ISO 527-3'],
  tensile_strength_td_mpa:['ASTM D882', 'ISO 527-3'],
  elongation_break:      ['ASTM D882', 'ISO 527-3'],
  elongation_md_pct:     ['ASTM D882', 'ISO 527-3'],
  elongation_td_pct:     ['ASTM D882', 'ISO 527-3'],
  flexural_modulus:      ['ASTM D790', 'ISO 178'],
  dart_drop_g:           ['ASTM D1709', 'ISO 7765-1'],
  tear_strength_md_mn:   ['ASTM D1922', 'ASTM D1004', 'ISO 6383'],
  tear_strength_td_mn:   ['ASTM D1922', 'ASTM D1004', 'ISO 6383'],
  haze_pct:              ['ASTM D1003', 'ISO 14782'],
  gloss_60:              ['ASTM D2457', 'ISO 2813'],
  cof_static:            ['ASTM D1894', 'ISO 8295'],
  cof_kinetic:           ['ASTM D1894', 'ISO 8295'],
  corona_dyne:           ['ASTM D2578'],
  otr_cc_m2_day:         ['ASTM D3985', 'ASTM F2622', 'ISO 15105-2'],
  wvtr_g_m2_day:         ['ASTM F1249', 'ASTM E96', 'ISO 15106-3'],
  seal_strength_n_15mm:  ['ASTM F88', 'ASTM F2029'],
  vicat_softening_point: ['ASTM D1525', 'ISO 306'],
  burst_strength_kpa:    ['ASTM D774', 'ISO 2758'],
  grammage_gsm:          ['ISO 536', 'ASTM D646'],
  brightness_pct:        ['ISO 2470', 'TAPPI T452'],
  opacity_pct:           ['ISO 2471', 'TAPPI T425'],
  porosity_sec:          ['ISO 5636-5', 'TAPPI T460'],
  smoothness_sec:        ['ISO 5627', 'TAPPI T479'],
  cobb_60_g_m2:          ['ISO 535', 'TAPPI T441'],
};

function getGroup(fieldKey) {
  for (const rule of GROUP_RULES) {
    if (rule.match.test(fieldKey)) return rule.group;
  }
  return null;
}

async function run() {
  const client = await pool.connect();
  try {
    console.log('Starting migration #033 — Parameter Admin Columns...');
    await client.query('BEGIN');

    // Add new columns
    await client.query(`
      ALTER TABLE mes_parameter_definitions
        ADD COLUMN IF NOT EXISTS display_width       INT NOT NULL DEFAULT 8,
        ADD COLUMN IF NOT EXISTS display_group       VARCHAR(40),
        ADD COLUMN IF NOT EXISTS display_row         INT,
        ADD COLUMN IF NOT EXISTS placeholder         VARCHAR(100),
        ADD COLUMN IF NOT EXISTS help_text           VARCHAR(200),
        ADD COLUMN IF NOT EXISTS has_test_method     BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS test_method_options TEXT[] NOT NULL DEFAULT '{}'::TEXT[]
    `);
    console.log('  + columns added');

    // Fetch all definitions
    const { rows } = await client.query('SELECT id, field_key, field_type FROM mes_parameter_definitions');
    let updated = 0;

    for (const row of rows) {
      const group = getGroup(row.field_key);
      const methods = TEST_METHODS[row.field_key] || [];
      const hasMethod = row.field_type === 'number' && !row.field_key.endsWith('_test_method');

      await client.query(`
        UPDATE mes_parameter_definitions
        SET display_group = $1,
            has_test_method = $2,
            test_method_options = $3
        WHERE id = $4
      `, [group, hasMethod, methods, row.id]);
      updated++;
    }
    console.log(`  + ${updated} rows updated with display_group, has_test_method, test_method_options`);

    // Set display_width for common field types
    // Text fields get narrower width
    await client.query(`UPDATE mes_parameter_definitions SET display_width = 12 WHERE field_type = 'text' AND max_length IS NOT NULL AND max_length <= 40`);
    await client.query(`UPDATE mes_parameter_definitions SET display_width = 24 WHERE field_type = 'text' AND max_length IS NOT NULL AND max_length > 40`);
    // Small numeric fields
    await client.query(`UPDATE mes_parameter_definitions SET display_width = 6 WHERE field_type = 'number' AND field_key IN ('thickness_mic','density_g_cm3','haze_pct','gloss_60','corona_dyne','cof_static','cof_kinetic')`);
    // Standard numeric fields stay at 8 (default)
    console.log('  + display_width defaults set');

    await client.query('COMMIT');
    console.log('Migration #033 completed.');
  } catch(e) {
    await client.query('ROLLBACK');
    console.error('Migration #033 failed:', e.message);
    process.exit(1);
  } finally { client.release(); await pool.end(); }
}
run();
