/**
 * Migration mes-master-031 — Parameter Definitions Registry
 * Seeds all parameter schemas from hardcoded NON_RESIN_PARAM_RULES.
 * Run: node server/migrations/mes-master-031-parameter-definitions.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// All param definitions extracted from tds.js NON_RESIN_PARAM_RULES
const DEFS = {
  films: [
    { key:'thickness_mic',label:'Thickness',unit:'mic',type:'number',step:0.1,required:true,min:5,max:300 },
    { key:'width_mm',label:'Width',unit:'mm',type:'number',step:1,required:true,min:50,max:3000 },
    { key:'density_g_cm3',label:'Density',unit:'g/cm3',type:'number',step:0.001,min:0.8,max:1.5 },
    { key:'cof',label:'COF',unit:'-',type:'number',step:0.001,required:true,min:0.05,max:1.5 },
    { key:'corona_dyne',label:'Corona',unit:'dyne',type:'number',step:1,min:30,max:60 },
  ],
  films_alu_foil: [
    { key:'alloy',label:'Alloy',type:'text',required:true,maxLength:40 },
    { key:'temper',label:'Temper',type:'text',required:true,maxLength:20 },
  ],
  films_bopp: [
    { key:'thickness_mic',label:'Thickness',unit:'um',type:'number',step:0.1,required:true,min:10,max:60 },
    { key:'density_g_cm3',label:'Density',unit:'g/cm3',type:'number',step:0.001,required:true,min:0.89,max:0.93 },
  ],
  adhesives: [
    { key:'appearance',label:'Appearance',unit:'-',type:'text',maxLength:120 },
    { key:'carrying_solvent',label:'Carrying Solvent',unit:'-',type:'text',maxLength:120 },
    { key:'functionality',label:'Functionality',unit:'-',type:'text',maxLength:40 },
    { key:'solids_pct',label:'Solids',unit:'%',type:'number',step:0.1,required:true,min:10,max:100 },
    { key:'viscosity_cps',label:'Viscosity',unit:'cps',type:'number',step:1,required:true,min:10,max:20000 },
    { key:'density_g_cm3',label:'Density',unit:'g/cm3',type:'number',step:0.001,min:0.7,max:1.5 },
    { key:'mix_ratio',label:'Mix Ratio',unit:'-',type:'text',required:true,maxLength:30 },
    { key:'pot_life_min',label:'Pot Life',unit:'min',type:'number',step:1,min:1,max:600 },
  ],
  chemicals: [
    { key:'purity_pct',label:'Purity',unit:'%',type:'number',step:0.1,required:true,min:50,max:100 },
    { key:'density_g_cm3',label:'Density',unit:'g/cm3',type:'number',step:0.001,required:true,min:0.6,max:2 },
    { key:'boiling_point_c',label:'Boiling Point',unit:'C',type:'number',step:1,min:-50,max:350 },
    { key:'flash_point_c',label:'Flash Point',unit:'C',type:'number',step:1,min:-100,max:250 },
    { key:'viscosity_cps',label:'Viscosity',unit:'cps',type:'number',step:1,min:0,max:20000 },
  ],
  additives: [
    { key:'dosage_pct',label:'Dosage',unit:'%',type:'number',step:0.01,required:true,min:0.01,max:20 },
    { key:'carrier_resin',label:'Carrier Resin',type:'text',required:true,maxLength:100 },
    { key:'active_content_pct',label:'Active Content',unit:'%',type:'number',step:0.1,min:0,max:100 },
    { key:'moisture_pct',label:'Moisture',unit:'%',type:'number',step:0.1,min:0,max:10 },
    { key:'ash_pct',label:'Ash',unit:'%',type:'number',step:0.1,min:0,max:60 },
  ],
  coating: [
    { key:'solids_pct',label:'Solids',unit:'%',type:'number',step:0.1,required:true,min:5,max:100 },
    { key:'viscosity_cps',label:'Viscosity',unit:'cps',type:'number',step:1,required:true,min:10,max:20000 },
    { key:'coat_weight_gsm',label:'Coat Weight',unit:'g/m2',type:'number',step:0.1,required:true,min:0.1,max:30 },
    { key:'gloss_60deg',label:'Gloss 60',unit:'GU',type:'number',step:1,min:0,max:120 },
    { key:'cure_temp_c',label:'Cure Temp',unit:'C',type:'number',step:1,min:20,max:250 },
  ],
  packing_materials: [
    { key:'length_mm',label:'Length',unit:'mm',type:'number',step:1,required:true,min:10,max:5000 },
    { key:'width_mm',label:'Width',unit:'mm',type:'number',step:1,required:true,min:10,max:3000 },
    { key:'gsm',label:'GSM',unit:'g/m2',type:'number',step:1,required:true,min:30,max:1000 },
    { key:'burst_strength',label:'Burst Strength',unit:'kPa',type:'number',step:1,min:50,max:3000 },
    { key:'moisture_pct',label:'Moisture',unit:'%',type:'number',step:0.1,min:0,max:20 },
  ],
  mounting_tapes: [
    { key:'thickness_um',label:'Thickness',unit:'um',type:'number',step:1,required:true,min:20,max:3000 },
    { key:'adhesion_n_25mm',label:'Adhesion',unit:'N/25mm',type:'number',step:0.1,required:true,min:0.1,max:100 },
    { key:'tensile_n_25mm',label:'Tensile',unit:'N/25mm',type:'number',step:0.1,required:true,min:0.1,max:500 },
    { key:'elongation_pct',label:'Elongation',unit:'%',type:'number',step:1,min:1,max:1500 },
    { key:'temp_resistance_c',label:'Temp Resistance',unit:'C',type:'number',step:1,min:-40,max:260 },
  ],
  films_cpp: [
    { key:'thickness_mic',label:'Thickness',unit:'um',type:'number',step:0.1,required:true,min:15,max:100 },
    { key:'density_g_cm3',label:'Density',unit:'g/cm3',type:'number',step:0.001,required:true,min:0.89,max:0.92 },
    { key:'seal_init_temp_c',label:'SIT',unit:'C',type:'number',step:1,required:true,min:90,max:160 },
    { key:'cof_static',label:'COF Static',unit:'-',type:'number',step:0.001,min:0.1,max:1.0 },
    { key:'cof_kinetic',label:'COF Kinetic',unit:'-',type:'number',step:0.001,min:0.05,max:0.8 },
  ],
  films_pet: [
    { key:'thickness_mic',label:'Thickness',unit:'um',type:'number',step:0.1,required:true,min:6,max:50 },
    { key:'density_g_cm3',label:'Density',unit:'g/cm3',type:'number',step:0.001,required:true,min:1.33,max:1.41 },
    { key:'corona_dyne',label:'Corona',unit:'dyne/cm',type:'number',step:1,min:38,max:56 },
    { key:'optical_density',label:'Optical Density',unit:'-',type:'number',step:0.1,min:1.5,max:3.5 },
  ],
  films_pa: [
    { key:'thickness_mic',label:'Thickness',unit:'um',type:'number',step:0.1,required:true,min:10,max:50 },
    { key:'density_g_cm3',label:'Density',unit:'g/cm3',type:'number',step:0.001,required:true,min:1.10,max:1.16 },
    { key:'puncture_resistance_n_mm',label:'Puncture',unit:'N/mm',type:'number',step:0.1,min:5,max:40 },
    { key:'moisture_content_pct',label:'Moisture Content',unit:'%',type:'number',step:0.1,min:0,max:5 },
  ],
  films_pe: [
    { key:'thickness_mic',label:'Thickness',unit:'um',type:'number',step:0.1,required:true,min:15,max:200 },
    { key:'density_g_cm3',label:'Density',unit:'g/cm3',type:'number',step:0.001,required:true,min:0.90,max:0.97 },
    { key:'mfi_g_10min',label:'MFI',unit:'g/10min',type:'number',step:0.1,min:0.1,max:30 },
    { key:'dart_drop_g',label:'Dart Drop',unit:'g',type:'number',step:1,min:50,max:1000 },
  ],
  films_pvc: [
    { key:'thickness_mic',label:'Thickness',unit:'um',type:'number',step:0.1,required:true,min:10,max:100 },
    { key:'density_g_cm3',label:'Density',unit:'g/cm3',type:'number',step:0.001,required:true,min:1.25,max:1.45 },
    { key:'shrinkage_md_pct_max',label:'Max Shrinkage MD',unit:'%',type:'number',step:0.1,required:true,min:5,max:80 },
    { key:'shrinkage_td_pct_max',label:'Max Shrinkage TD',unit:'%',type:'number',step:0.1,required:true,min:1,max:30 },
  ],
  films_pap: [
    { key:'grammage_gsm',label:'Grammage',unit:'g/m2',type:'number',step:0.1,required:true,min:20,max:200 },
    { key:'thickness_mic',label:'Caliper',unit:'um',type:'number',step:1,min:20,max:300 },
    { key:'burst_strength_kpa',label:'Burst Strength',unit:'kPa',type:'number',step:1,min:50,max:800 },
    { key:'brightness_pct',label:'Brightness',unit:'%',type:'number',step:0.1,min:40,max:100 },
  ],
  films_alu_pap: [
    { key:'total_thickness_mic',label:'Total Thickness',unit:'um',type:'number',step:1,required:true,min:40,max:150 },
    { key:'alu_thickness_mic',label:'Alu Thickness',unit:'um',type:'number',step:1,min:5,max:20 },
    { key:'paper_grammage_gsm',label:'Paper Grammage',unit:'g/m2',type:'number',step:1,min:20,max:100 },
    { key:'dead_fold',label:'Dead Fold',type:'text',maxLength:40 },
  ],
};

async function run() {
  const client = await pool.connect();
  try {
    console.log('Starting migration #031...');
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_parameter_definitions (
        id SERIAL PRIMARY KEY,
        material_class VARCHAR(40) NOT NULL,
        profile VARCHAR(40),
        field_key VARCHAR(80) NOT NULL,
        label VARCHAR(100) NOT NULL,
        unit VARCHAR(30),
        field_type VARCHAR(20) NOT NULL DEFAULT 'number',
        step DECIMAL,
        min_value DECIMAL,
        max_value DECIMAL,
        max_length INT,
        is_required BOOLEAN NOT NULL DEFAULT false,
        sort_order INT NOT NULL DEFAULT 0,
        is_core BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_param_def UNIQUE (material_class, field_key, profile)
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_param_def_unique ON mes_parameter_definitions(material_class, field_key, COALESCE(profile, '_'))`);
    await client.query('CREATE INDEX IF NOT EXISTS idx_param_def_class ON mes_parameter_definitions(material_class)');
    console.log('  + table created');

    let count = 0;
    for (const [classKey, params] of Object.entries(DEFS)) {
      const parts = classKey.split('_');
      const isProfile = classKey.startsWith('films_') && classKey !== 'films';
      const matClass = isProfile ? 'films' : classKey;
      const profile = isProfile ? classKey : null;
      for (let i = 0; i < params.length; i++) {
        const p = params[i];
        await client.query(`
          INSERT INTO mes_parameter_definitions
            (material_class, profile, field_key, label, unit, field_type, step, min_value, max_value, max_length, is_required, sort_order)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT (material_class, field_key, profile) DO UPDATE SET
            label=EXCLUDED.label, unit=EXCLUDED.unit, field_type=EXCLUDED.field_type,
            step=EXCLUDED.step, min_value=EXCLUDED.min_value, max_value=EXCLUDED.max_value,
            max_length=EXCLUDED.max_length, is_required=EXCLUDED.is_required, sort_order=EXCLUDED.sort_order,
            updated_at=NOW()
        `, [matClass, profile, p.key, p.label, p.unit||null, p.type||'number',
            p.step||null, p.min||null, p.max||null, p.maxLength||null, !!p.required, i+1]);
        count++;
      }
    }
    await client.query('COMMIT');
    console.log('  + ' + count + ' definitions seeded');
    console.log('Migration #031 completed.');
  } catch(e) {
    await client.query('ROLLBACK');
    console.error('Migration #031 failed:', e.message);
    process.exit(1);
  } finally { client.release(); await pool.end(); }
}
run();
