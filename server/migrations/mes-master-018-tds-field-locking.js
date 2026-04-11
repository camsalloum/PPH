/**
 * Migration mes-master-018 — TDS Field-Level Locking
 *
 * Adds user_locked_fields TEXT[] to mes_material_tds.
 *
 * Purpose:
 *   When a user explicitly sets a value (via PDF apply or manual form save),
 *   the field name is added to this array. Any future automated process
 *   (ERP sync, bulk re-import, re-seed) must SKIP fields present in this array.
 *   This protects data the user has intentionally verified from being overwritten.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('🚀 Starting MES migration #018 — TDS Field-Level Locking...\n');
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE mes_material_tds
        ADD COLUMN IF NOT EXISTS user_locked_fields TEXT[] NOT NULL DEFAULT '{}';
    `);
    console.log('  ✓ user_locked_fields TEXT[] added to mes_material_tds');

    // Index for fast containment queries (future sync processes can filter by this)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mes_material_tds_locked_fields
        ON mes_material_tds USING GIN (user_locked_fields);
    `);
    console.log('  ✓ GIN index created on user_locked_fields');

    await client.query('COMMIT');
    console.log('\n✓ Migration mes-master-018 complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
