/*
 * Migration mes-master-022 — Non-Resin Material Specs Store
 *
 * Creates a persistent store for non-resin material parameter sets
 * keyed by material_class + material_key (normalized main item / description).
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

async function run() {
  const client = await pool.connect();
  try {
    console.log('Starting MES migration #022 — Non-Resin Material Specs Store...');
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_non_resin_material_specs (
        id                  SERIAL PRIMARY KEY,
        material_class      VARCHAR(40) NOT NULL,
        material_key        TEXT NOT NULL,

        mainitem            TEXT,
        maindescription     TEXT,
        catlinedesc         TEXT,
        mainunit            TEXT,

        parameters_json     JSONB NOT NULL DEFAULT '{}'::JSONB,
        notes               TEXT,
        status              VARCHAR(20) NOT NULL DEFAULT 'draft',
        user_locked_fields  TEXT[] NOT NULL DEFAULT '{}'::TEXT[],

        created_by          INTEGER,
        updated_by          INTEGER,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT chk_non_resin_material_class
          CHECK (material_class IN ('films','adhesives','chemicals','additives','coating','packing_materials','mounting_tapes')),
        CONSTRAINT chk_non_resin_status
          CHECK (status IN ('draft','review','verified')),
        CONSTRAINT uq_non_resin_material_specs
          UNIQUE (material_class, material_key)
      );
    `);
    console.log('  + mes_non_resin_material_specs table created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_non_resin_specs_class
      ON mes_non_resin_material_specs(material_class)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_non_resin_specs_catline
      ON mes_non_resin_material_specs(catlinedesc)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_non_resin_specs_params_gin
      ON mes_non_resin_material_specs
      USING GIN (parameters_json)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_non_resin_specs_locked_fields
      ON mes_non_resin_material_specs
      USING GIN (user_locked_fields)
    `);
    console.log('  + indexes created');

    await client.query('COMMIT');
    console.log('Migration #022 completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration #022 failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
