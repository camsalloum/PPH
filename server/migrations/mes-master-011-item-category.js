/**
 * Migration mes-master-011 — Add category column to mes_item_master
 *
 * Adds a `category` column sourced from fp_actualrmdata.category
 * (Oracle ERP category values: Resins, Films, Adhesives, Chemicals,
 *  Additives, Coating HSL/Wax, Packing Materials, Mounting Tapes, etc.)
 *
 * UI usage deferred — column exists in DB; will be shown/filtered in
 * a future sprint once populated via Sync-from-Oracle feature.
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

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔧 Starting MES migration #011 — Item Master category column...\n');

    // Add category column (idempotent — skips if already exists)
    await client.query(`
      ALTER TABLE mes_item_master
      ADD COLUMN IF NOT EXISTS category VARCHAR(100)
    `);
    console.log('  ✅ category column — added to mes_item_master');

    // Index for filtering/joining with fp_actualrmdata
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_item_master_category
        ON mes_item_master(category)
    `);
    console.log('  ✅ idx_item_master_category — index created');

    await client.query('COMMIT');
    console.log('\n✅ Migration mes-master-011 complete.\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration mes-master-011 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
