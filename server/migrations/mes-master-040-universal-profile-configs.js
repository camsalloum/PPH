/**
 * Migration: mes-master-040-universal-profile-configs
 * Renames mes_substrate_profile_configs → mes_material_profile_configs,
 * relaxes the material_class constraint to allow 'resins' and all future classes,
 * and adds a generic params_override JSONB column.
 *
 * Prerequisite: mes-master-026-substrate-profile-configs (creates the original table)
 */

'use strict';

const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'fp_database',
  user: process.env.DB_USER || 'postgres',
  password: String(process.env.DB_PASSWORD ?? ''),
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const ALL_MATERIAL_CLASSES = [
  'resins', 'substrates', 'adhesives', 'chemicals',
  'additives', 'coating', 'packing_materials', 'mounting_tapes',
];

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Rename legacy table if it exists.
    await client.query(`
      ALTER TABLE IF EXISTS mes_substrate_profile_configs
      RENAME TO mes_material_profile_configs
    `);
    console.log('  + Ensured table name mes_material_profile_configs');

    // 2. If mes-master-026 was never run, bootstrap the universal table directly.
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_material_profile_configs (
        id                      SERIAL PRIMARY KEY,
        material_class          VARCHAR(40) NOT NULL,
        cat_desc                TEXT NOT NULL,
        appearance              TEXT NOT NULL DEFAULT '',

        supplier_name           VARCHAR(200),
        resin_type              VARCHAR(120),
        alloy_code              VARCHAR(80),

        density_g_cm3           NUMERIC(12, 4),
        solid_pct               NUMERIC(8, 3),
        micron_thickness        NUMERIC(12, 4),
        width_mm                NUMERIC(12, 4),
        yield_m2_per_kg         NUMERIC(14, 5),
        roll_length_m           NUMERIC(14, 4),
        core_diameter_mm        NUMERIC(12, 4),

        price_control           VARCHAR(10) NOT NULL DEFAULT 'MAP',
        market_ref_price        NUMERIC(14, 4),
        market_price_date       DATE,
        map_price               NUMERIC(14, 4),
        standard_price          NUMERIC(14, 4),
        last_po_price           NUMERIC(14, 4),

        mrp_type                VARCHAR(10) NOT NULL DEFAULT 'PD',
        reorder_point           NUMERIC(14, 4),
        safety_stock_kg         NUMERIC(14, 4),
        planned_lead_time_days  INTEGER,

        mapped_material_keys    TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
        params_override         JSONB NOT NULL DEFAULT '{}'::jsonb,

        created_by              INTEGER,
        updated_by              INTEGER,
        created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT chk_material_cfg_price_control
          CHECK (price_control IN ('MAP','STD')),
        CONSTRAINT chk_material_cfg_mrp_type
          CHECK (mrp_type IN ('PD','ND','VB')),
        CONSTRAINT chk_material_cfg_solid_pct
          CHECK (solid_pct IS NULL OR (solid_pct >= 0 AND solid_pct <= 100)),
        CONSTRAINT chk_material_cfg_planned_lead_time
          CHECK (planned_lead_time_days IS NULL OR planned_lead_time_days >= 0)
      )
    `);
    console.log('  + Ensured mes_material_profile_configs exists');

    // 3. Drop old/new material_class constraints before re-adding universal check.
    await client.query(`
      ALTER TABLE mes_material_profile_configs
      DROP CONSTRAINT IF EXISTS chk_substrate_cfg_material_class
    `);
    await client.query(`
      ALTER TABLE mes_material_profile_configs
      DROP CONSTRAINT IF EXISTS mes_substrate_profile_configs_material_class_check
    `);
    await client.query(`
      ALTER TABLE mes_material_profile_configs
      DROP CONSTRAINT IF EXISTS mes_material_profile_configs_material_class_check
    `);
    // Try the generic auto-named check constraint too
    try {
      const { rows } = await client.query(`
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'mes_material_profile_configs'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%material_class%'
      `);
      for (const row of rows) {
        await client.query(`ALTER TABLE mes_material_profile_configs DROP CONSTRAINT IF EXISTS ${row.conname}`);
      }
    } catch (_) { /* ignore if no constraints found */ }

    // 4. Add new relaxed constraint
    await client.query(`
      ALTER TABLE mes_material_profile_configs
      ADD CONSTRAINT mes_material_profile_configs_material_class_check
      CHECK (material_class IN (${ALL_MATERIAL_CLASSES.map(c => `'${c}'`).join(', ')}))
    `);
    console.log('  + Added relaxed material_class constraint');

    // 5. Ensure params_override JSONB column exists
    await client.query(`
      ALTER TABLE mes_material_profile_configs
      ADD COLUMN IF NOT EXISTS params_override JSONB DEFAULT '{}'::jsonb
    `);
    console.log('  + Added params_override JSONB column');

    // 6. Rename unique index if it exists.
    try {
      await client.query(`
        ALTER INDEX IF EXISTS uq_mes_substrate_profile_configs_key
        RENAME TO uq_mes_material_profile_configs_key
      `);
    } catch (_) { /* old index may exist while new one already exists */ }
    console.log('  + Renamed unique index');

    // 7. Rename other indexes
    const indexRenames = [
      ['idx_mes_substrate_profile_configs_class', 'idx_mes_material_profile_configs_class'],
      ['idx_mes_substrate_profile_configs_cat_desc', 'idx_mes_material_profile_configs_cat_desc'],
      ['idx_mes_substrate_profile_configs_mapped_keys', 'idx_mes_material_profile_configs_mapped_keys'],
    ];
    for (const [oldName, newName] of indexRenames) {
      try {
        await client.query(`ALTER INDEX IF EXISTS ${oldName} RENAME TO ${newName}`);
      } catch (_) { /* index may not exist */ }
    }
    console.log('  + Renamed indexes');

    // 8. Ensure canonical indexes exist.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_mes_material_profile_configs_key
      ON mes_material_profile_configs (material_class, cat_desc, appearance)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mes_material_profile_configs_class
      ON mes_material_profile_configs (material_class)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mes_material_profile_configs_cat_desc
      ON mes_material_profile_configs (cat_desc)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mes_material_profile_configs_mapped_keys
      ON mes_material_profile_configs
      USING GIN (mapped_material_keys)
    `);
    console.log('  + Ensured canonical indexes');

    await client.query('COMMIT');
    console.log('Migration mes-master-040 complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration mes-master-040 failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`ALTER TABLE mes_material_profile_configs DROP COLUMN IF EXISTS params_override`);
    await client.query(`ALTER TABLE IF EXISTS mes_material_profile_configs RENAME TO mes_substrate_profile_configs`);

    await client.query('COMMIT');
    console.log('Migration mes-master-040 rolled back.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration mes-master-040 rollback failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { up, down };

if (require.main === module) {
  up()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error(e);
      await pool.end();
      process.exit(1);
    });
}