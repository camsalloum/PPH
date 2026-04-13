/**
 * Migration: mes-master-039-resin-param-definitions
 * Seeds the 14 resin TDS fields into mes_parameter_definitions so resins
 * become schema-driven like all other material classes.
 *
 * Prerequisite: mes-master-031-parameter-definitions (creates the table)
 */

'use strict';

const { pool } = require('../database/config');

const RESIN_PARAMS = [
  { field_key: 'mfr_190_2_16',          label: 'MFR 190/2.16',            unit: 'g/10min', display_group: 'Rheology',  sort_order: 1 },
  { field_key: 'mfr_190_5_0',           label: 'MFR 190/5.0',             unit: 'g/10min', display_group: 'Rheology',  sort_order: 2 },
  { field_key: 'hlmi_190_21_6',         label: 'HLMI 190/21.6',           unit: 'g/10min', display_group: 'Rheology',  sort_order: 3 },
  { field_key: 'mfr_230_2_16_pp',       label: 'MFR 230/2.16 PP',         unit: 'g/10min', display_group: 'Rheology',  sort_order: 4 },
  { field_key: 'melt_flow_ratio',       label: 'Melt Flow Ratio',         unit: '—',       display_group: 'Rheology',  sort_order: 5 },
  { field_key: 'density',               label: 'Density',                  unit: 'g/cm³',   display_group: 'Physical',   sort_order: 10 },
  { field_key: 'bulk_density',          label: 'Bulk Density',             unit: 'g/cm³',   display_group: 'Physical',   sort_order: 11 },
  { field_key: 'crystalline_melting_point', label: 'Melting Point',        unit: '°C',      display_group: 'Thermal',    sort_order: 20 },
  { field_key: 'vicat_softening_point', label: 'Vicat Softening Point',    unit: '°C',      display_group: 'Thermal',    sort_order: 21 },
  { field_key: 'heat_deflection_temp',  label: 'HDT',                      unit: '°C',      display_group: 'Thermal',    sort_order: 22 },
  { field_key: 'tensile_strength_break',label: 'Tensile Strength at Break',unit: 'MPa',     display_group: 'Mechanical', sort_order: 30 },
  { field_key: 'elongation_break',      label: 'Elongation at Break',      unit: '%',       display_group: 'Mechanical', sort_order: 31 },
  { field_key: 'brittleness_temp',      label: 'Brittleness Temperature',  unit: '°C',      display_group: 'Mechanical', sort_order: 32 },
  { field_key: 'flexural_modulus',      label: 'Flexural Modulus',         unit: 'MPa',     display_group: 'Mechanical', sort_order: 33 },
];

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let inserted = 0;
    for (const p of RESIN_PARAMS) {
      const exists = await client.query(
        `SELECT id FROM mes_parameter_definitions
          WHERE material_class = 'resins' AND field_key = $1 AND profile IS NULL`,
        [p.field_key]
      );

      if (exists.rows.length) {
        // Update label/unit/display_group/sort_order in case they changed
        await client.query(`
          UPDATE mes_parameter_definitions
          SET label = $1, unit = $2, display_group = $3, sort_order = $4, updated_at = NOW()
          WHERE id = $5
        `, [p.label, p.unit, p.display_group, p.sort_order, exists.rows[0].id]);
        continue;
      }

      await client.query(`
        INSERT INTO mes_parameter_definitions
          (material_class, profile, field_key, label, unit, field_type, is_core, sort_order, display_group)
        VALUES ('resins', NULL, $1, $2, $3, 'number', true, $4, $5)
      `, [p.field_key, p.label, p.unit, p.sort_order, p.display_group]);

      inserted++;
    }

    await client.query('COMMIT');
    console.log(`Migration mes-master-039 complete. Inserted ${inserted}, updated ${RESIN_PARAMS.length - inserted} resin param definitions.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration mes-master-039 failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  await pool.query(`DELETE FROM mes_parameter_definitions WHERE material_class = 'resins' AND profile IS NULL`);
  console.log('Migration mes-master-039 rolled back (resin param definitions removed).');
}

module.exports = { up, down };

if (require.main === module) {
  up().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}