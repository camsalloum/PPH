/**
 * Migration mes-master-034 — Parameter Definitions Overhaul
 * Adds param_type + test_conditions columns.
 * Fixes all units, adds missing params, corrects min/max, adds test conditions.
 * Run: node server/migrations/mes-master-034-param-overhaul.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Unit standardization map: old → new
const UNIT_FIXES = {
  'g/cm3': 'g/cm³', 'g/cm³': 'g/cm³',
  'kg/m3': 'kg/m³', 'kg/m³': 'kg/m³',
  'um': 'µm', 'mic': 'µm', 'µm': 'µm',
  'g/m2': 'g/m²', 'gsm': 'g/m²', 'g/m²': 'g/m²',
  'cps': 'cP', 'cp': 'cP', 'mPa.s': 'cP',
  'dyne': 'dyne/cm', 'dyne/cm': 'dyne/cm',
  'cc/m2/24h': 'cc/m²/day', 'cc/m²/24h': 'cc/m²/day',
  'g/m2/24h': 'g/m²/day', 'g/m²/24h': 'g/m²/day',
  'mg/m2': 'mg/m²',
  'sec/100ml': 'sec/100ml',
  'C': '°C',
  'N/15mm': 'N/15mm', 'N/25mm': 'N/25mm',
  'kN/m': 'kN/m', 'kPa': 'kPa', 'mN': 'mN',
  'GU': 'GU', 'gu': 'GU',
};

// Test conditions by field pattern
const TEST_CONDITIONS = {
  cof_static: '23°C, 50% RH, ASTM D1894 (static)',
  cof_kinetic: '23°C, 50% RH, ASTM D1894 (kinetic)',
  cof: '23°C, 50% RH, ASTM D1894',
  wvtr_g_m2_day: '38°C, 90% RH',
  otr_cc_m2_day: '23°C, 0% RH',
  viscosity_cps: '25°C, Brookfield',
  seal_strength_n_15mm: '23°C, 0.5s dwell, 0.3 MPa',
  seal_init_temp_c: '0.5s dwell, 0.3 MPa, 1 N/15mm threshold',
  hot_tack_temp_c: '0.5s dwell, 0.3 MPa',
  hot_tack_strength_n_15mm: '0.5s dwell, 0.3 MPa',
  dart_drop_g: 'Method A, 660mm drop height',
  haze_pct: 'ASTM D1003, 50µm film',
  gloss_60: '60° angle',
  corona_dyne: 'Treated side',
  density: '23°C',
  density_g_cm3: '23°C',
  mfr_190_2_16: '190°C / 2.16 kg',
  mfr_190_5_0: '190°C / 5.0 kg',
  hlmi_190_21_6: '190°C / 21.6 kg',
  mfr_230_2_16_pp: '230°C / 2.16 kg',
  vicat_softening_point: 'Method A, 10N, 50°C/h',
  heat_deflection_temp: '0.45 MPa, edgewise',
  tensile_strength_break: '23°C, 50mm/min',
  elongation_break: '23°C, 50mm/min',
  flexural_modulus: '23°C, 2mm/min',
  burst_strength_kpa: 'Mullen burst',
  grammage_gsm: 'Conditioned, 23°C 50% RH',
  moisture_content_pct: '105°C oven method',
  moisture_pct: '105°C oven method',
  solids_pct: '105°C, 2h',
  coat_weight_gsm: 'Gravimetric method',
};

// New parameters to add per category
const NEW_PARAMS = {
  additives: [
    { k:'carrier_mfi',l:'Carrier MFI',u:'g/10min',t:'number',s:0.1,min:0.1,max:50,g:'Composition',pt:'input',tc:'190°C / 2.16 kg' },
    { k:'compatibility',l:'Compatibility',u:'-',t:'text',ml:40,g:'Composition',pt:'input' },
    { k:'dispersion_rating',l:'Dispersion Rating',u:'-',t:'text',ml:20,g:'Composition',pt:'input' },
  ],
  adhesives: [
    { k:'bond_strength',l:'Bond Strength',u:'N/15mm',t:'number',s:0.1,min:0.5,max:30,g:'Properties',pt:'input',tc:'23°C, 24h cure, T-peel' },
    { k:'cure_time_hours',l:'Cure Time',u:'hours',t:'number',s:0.5,min:0.5,max:168,g:'Properties',pt:'input',tc:'23°C' },
    { k:'application_temp_c',l:'Application Temp',u:'°C',t:'number',s:1,min:20,max:120,g:'Properties',pt:'input' },
  ],
  chemicals: [
    { k:'evaporation_rate',l:'Evaporation Rate',u:'-',t:'number',s:0.01,min:0.01,max:20,g:'Chemical',pt:'input',tc:'vs n-Butyl Acetate = 1' },
    { k:'residue_pct',l:'Residue',u:'%',t:'number',s:0.01,min:0,max:5,g:'Chemical',pt:'input' },
    { k:'solubility',l:'Solubility',u:'-',t:'text',ml:60,g:'Chemical',pt:'input' },
  ],
  coating: [
    { k:'adhesion_tape_test',l:'Adhesion (Tape Test)',u:'-',t:'text',ml:20,g:'Properties',pt:'input',tc:'ASTM D3359, cross-cut' },
    { k:'cof_after_coating',l:'COF After Coating',u:'-',t:'number',s:0.01,min:0.05,max:1.5,g:'Properties',pt:'input',tc:'23°C, 50% RH' },
    { k:'blocking_tendency',l:'Blocking Tendency',u:'-',t:'text',ml:20,g:'Properties',pt:'input' },
  ],
};

// New params for substrate profiles
const NEW_FILM_PARAMS = {
  films_bopp: [
    { k:'sit_c',l:'SIT',u:'°C',t:'number',s:1,min:90,max:160,g:'Surface & Sealing',pt:'input',tc:'0.5s dwell, 0.3 MPa' },
    { k:'hot_tack_n_15mm',l:'Hot Tack',u:'N/15mm',t:'number',s:0.1,min:0.5,max:10,g:'Surface & Sealing',pt:'input' },
  ],
  films_alu_foil: [
    { k:'pinhole_density',l:'Pinhole Density',u:'no/m²',t:'number',s:1,min:0,max:500,g:'Mechanical',pt:'input' },
    { k:'surface_cleanliness',l:'Surface Cleanliness',u:'mg/m²',t:'number',s:0.1,min:0,max:10,g:'Other',pt:'input',tc:'Wetting tension / oil level' },
  ],
  films_alu_pap: [
    { k:'dead_fold_rating',l:'Dead Fold Rating',u:'-',t:'text',ml:20,g:'Other',pt:'input',tc:'Pass/Fail or 1-5 scale' },
    { k:'stiffness',l:'Stiffness',u:'mN',t:'number',s:1,min:10,max:500,g:'Mechanical',pt:'input',tc:'Taber stiffness' },
    { k:'curl_tendency',l:'Curl Tendency',u:'-',t:'text',ml:20,g:'Other',pt:'input' },
  ],
};

// Corona split: add untreated side for all film profiles
const CORONA_UNTREATED = { k:'corona_untreated_dyne',l:'Corona (Untreated Side)',u:'dyne/cm',t:'number',s:1,min:28,max:50,g:'Surface & Sealing',pt:'input' };

// Calculated fields
const CALCULATED_FIELDS = ['yield_m2_per_kg', 'melt_flow_ratio'];

async function run() {
  const client = await pool.connect();
  try {
    console.log('Starting migration #034 — Parameter Overhaul...');
    await client.query('BEGIN');

    // 1. Add new columns
    await client.query(`
      ALTER TABLE mes_parameter_definitions
        ADD COLUMN IF NOT EXISTS param_type VARCHAR(20) NOT NULL DEFAULT 'input',
        ADD COLUMN IF NOT EXISTS test_conditions VARCHAR(200)
    `);
    console.log('  + columns added (param_type, test_conditions)');

    // 2. Fix all units
    let unitFixes = 0;
    for (const [oldUnit, newUnit] of Object.entries(UNIT_FIXES)) {
      if (oldUnit === newUnit) continue;
      const r = await client.query(
        'UPDATE mes_parameter_definitions SET unit = $1 WHERE unit = $2',
        [newUnit, oldUnit]
      );
      unitFixes += r.rowCount;
    }
    console.log('  + ' + unitFixes + ' unit fixes applied');

    // 3. Set test_conditions
    let tcFixes = 0;
    for (const [fieldKey, tc] of Object.entries(TEST_CONDITIONS)) {
      const r = await client.query(
        'UPDATE mes_parameter_definitions SET test_conditions = $1 WHERE field_key = $2 AND test_conditions IS NULL',
        [tc, fieldKey]
      );
      tcFixes += r.rowCount;
    }
    console.log('  + ' + tcFixes + ' test conditions set');

    // 4. Mark calculated fields
    for (const fk of CALCULATED_FIELDS) {
      await client.query("UPDATE mes_parameter_definitions SET param_type = 'calculated' WHERE field_key = $1", [fk]);
    }
    console.log('  + calculated fields marked');

    // 5. Fix specific values
    // Additives moisture max → 0.2%
    await client.query("UPDATE mes_parameter_definitions SET max_value = 0.2 WHERE material_class = 'additives' AND field_key = 'moisture_pct'");

    // 6. Add new parameters for base categories
    let added = 0;
    for (const [matClass, params] of Object.entries(NEW_PARAMS)) {
      const maxOrder = await client.query(
        "SELECT COALESCE(MAX(sort_order), 0) as m FROM mes_parameter_definitions WHERE material_class = $1 AND profile IS NULL",
        [matClass]
      );
      let order = parseInt(maxOrder.rows[0].m) + 1;
      for (const p of params) {
        const exists = await client.query(
          "SELECT id FROM mes_parameter_definitions WHERE material_class = $1 AND field_key = $2 AND profile IS NULL",
          [matClass, p.k]
        );
        if (exists.rows.length) continue;
        await client.query(`
          INSERT INTO mes_parameter_definitions
            (material_class, profile, field_key, label, unit, field_type, step, min_value, max_value, max_length,
             is_required, sort_order, display_width, display_group, has_test_method, param_type, test_conditions)
          VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, false, $10, 4, $11, $12, $13, $14)
        `, [matClass, p.k, p.l, p.u||null, p.t, p.s||null, p.min||null, p.max||null, p.ml||null,
            order++, p.g||null, p.t==='number', p.pt||'input', p.tc||null]);
        added++;
      }
    }

    // 7. Add new film profile params
    for (const [profile, params] of Object.entries(NEW_FILM_PARAMS)) {
      const maxOrder = await client.query(
        "SELECT COALESCE(MAX(sort_order), 0) as m FROM mes_parameter_definitions WHERE material_class = 'films' AND profile = $1",
        [profile]
      );
      let order = parseInt(maxOrder.rows[0].m) + 1;
      for (const p of params) {
        const exists = await client.query(
          "SELECT id FROM mes_parameter_definitions WHERE material_class = 'films' AND profile = $1 AND field_key = $2",
          [profile, p.k]
        );
        if (exists.rows.length) continue;
        await client.query(`
          INSERT INTO mes_parameter_definitions
            (material_class, profile, field_key, label, unit, field_type, step, min_value, max_value, max_length,
             is_required, sort_order, display_width, display_group, has_test_method, param_type, test_conditions)
          VALUES ('films', $1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10, 4, $11, $12, $13, $14)
        `, [profile, p.k, p.l, p.u||null, p.t, p.s||null, p.min||null, p.max||null, p.ml||null,
            order++, p.g||null, p.t==='number', p.pt||'input', p.tc||null]);
        added++;
      }
    }

    // 8. Add corona untreated side to all film profiles that have corona_dyne
    const coronaProfiles = await client.query(
      "SELECT DISTINCT profile FROM mes_parameter_definitions WHERE field_key = 'corona_dyne' AND material_class = 'films' AND profile IS NOT NULL"
    );
    for (const row of coronaProfiles.rows) {
      const exists = await client.query(
        "SELECT id FROM mes_parameter_definitions WHERE material_class = 'films' AND profile = $1 AND field_key = $2",
        [row.profile, CORONA_UNTREATED.k]
      );
      if (exists.rows.length) continue;
      // Rename existing corona_dyne label to include "(Treated Side)"
      await client.query(
        "UPDATE mes_parameter_definitions SET label = 'Corona (Treated Side)' WHERE material_class = 'films' AND profile = $1 AND field_key = 'corona_dyne'",
        [row.profile]
      );
      const maxO = await client.query("SELECT COALESCE(MAX(sort_order),0) as m FROM mes_parameter_definitions WHERE material_class='films' AND profile=$1", [row.profile]);
      await client.query(`
        INSERT INTO mes_parameter_definitions
          (material_class, profile, field_key, label, unit, field_type, step, min_value, max_value,
           is_required, sort_order, display_width, display_group, has_test_method, param_type, test_conditions)
        VALUES ('films', $1, $2, $3, $4, 'number', $5, $6, $7, false, $8, 4, $9, true, 'input', NULL)
      `, [row.profile, CORONA_UNTREATED.k, CORONA_UNTREATED.l, CORONA_UNTREATED.u,
          CORONA_UNTREATED.s, CORONA_UNTREATED.min, CORONA_UNTREATED.max,
          parseInt(maxO.rows[0].m)+1, CORONA_UNTREATED.g]);
      added++;
    }

    console.log('  + ' + added + ' new parameters added');

    await client.query('COMMIT');

    // Final count
    const total = await client.query('SELECT COUNT(*) FROM mes_parameter_definitions');
    console.log('\nMigration #034 completed. Total definitions: ' + total.rows[0].count);
  } catch(e) {
    await client.query('ROLLBACK');
    console.error('Migration #034 failed:', e.message);
    process.exit(1);
  } finally { client.release(); await pool.end(); }
}
run();
