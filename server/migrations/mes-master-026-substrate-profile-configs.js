/**
 * Migration: mes-master-026-substrate-profile-configs
 * Creates persistent Item Master substrate profile configuration table.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_substrate_profile_configs (
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

        created_by              INTEGER,
        updated_by              INTEGER,
        created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT chk_substrate_cfg_material_class
          CHECK (material_class IN ('films','adhesives','chemicals','additives','coating','packing_materials','mounting_tapes')),
        CONSTRAINT chk_substrate_cfg_price_control
          CHECK (price_control IN ('MAP','STD')),
        CONSTRAINT chk_substrate_cfg_mrp_type
          CHECK (mrp_type IN ('PD','ND','VB')),
        CONSTRAINT chk_substrate_cfg_solid_pct
          CHECK (solid_pct IS NULL OR (solid_pct >= 0 AND solid_pct <= 100)),
        CONSTRAINT chk_substrate_cfg_planned_lead_time
          CHECK (planned_lead_time_days IS NULL OR planned_lead_time_days >= 0)
      )
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_mes_substrate_profile_configs_key
      ON mes_substrate_profile_configs (material_class, cat_desc, appearance)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mes_substrate_profile_configs_class
      ON mes_substrate_profile_configs (material_class)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mes_substrate_profile_configs_cat_desc
      ON mes_substrate_profile_configs (cat_desc)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mes_substrate_profile_configs_mapped_keys
      ON mes_substrate_profile_configs
      USING GIN (mapped_material_keys)
    `);

    await client.query('COMMIT');
    console.log('Migration mes-master-026 complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { up };
