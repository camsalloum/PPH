/**
 * Migration mes-master-042 — Adhesive Formulation Components
 *
 * Adds a dedicated table to store custom adhesive formulation recipes per custom group.
 * Components can reference items from any Oracle category (e.g., Ethyl Acetate from Chemicals).
 *
 * Run: node server/migrations/mes-master-042-adhesive-formulations.js
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

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('Starting migration #042 — Adhesive Formulation Components...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_adhesive_formulation_components (
        id                  SERIAL PRIMARY KEY,
        group_id            INTEGER NOT NULL REFERENCES mes_item_category_groups(id) ON DELETE CASCADE,
        item_key            TEXT NOT NULL,
        component_role      VARCHAR(30) NOT NULL DEFAULT 'other',
        parts               NUMERIC(10,4) NOT NULL DEFAULT 0,
        solids_pct          NUMERIC(6,2),
        unit_price_override NUMERIC(12,4),
        sort_order          INTEGER NOT NULL DEFAULT 0,
        notes               TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_adhesive_formulation_component UNIQUE (group_id, item_key),
        CONSTRAINT chk_adhesive_formulation_role CHECK (
          component_role IN ('resin', 'hardener', 'catalyst', 'solvent', 'other')
        ),
        CONSTRAINT chk_adhesive_formulation_parts CHECK (parts >= 0),
        CONSTRAINT chk_adhesive_formulation_solids CHECK (
          solids_pct IS NULL OR (solids_pct >= 0 AND solids_pct <= 100)
        ),
        CONSTRAINT chk_adhesive_formulation_price CHECK (
          unit_price_override IS NULL OR unit_price_override >= 0
        )
      )
    `);
    console.log('  + mes_adhesive_formulation_components created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_adhesive_formulation_group
      ON mes_adhesive_formulation_components (group_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_adhesive_formulation_item_key
      ON mes_adhesive_formulation_components (item_key)
    `);
    console.log('  + indexes created');

    await client.query('COMMIT');
    console.log('Migration #042 completed.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration #042 failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS mes_adhesive_formulation_components');
    await client.query('COMMIT');
    console.log('Migration #042 rolled back.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration #042 rollback failed:', err.message);
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
