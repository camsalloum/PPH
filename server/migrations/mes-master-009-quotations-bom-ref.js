/**
 * Migration: mes-master-009-quotations-bom-ref
 *
 * Adds bom_version_id FK column to mes_quotations so that
 * estimations persist the BOM version they were created from.
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
    console.log('🔧 Starting MES Master Data migration #009 — Quotations BOM Reference...\n');

    // Add bom_version_id column if not already present
    const colCheck = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'mes_quotations' AND column_name = 'bom_version_id'
    `);

    if (colCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE mes_quotations
        ADD COLUMN bom_version_id INTEGER REFERENCES mes_bom_versions(id)
      `);
      console.log('  ✅ mes_quotations.bom_version_id — added');
    } else {
      console.log('  ⏭️  mes_quotations.bom_version_id — already exists');
    }

    // Index for lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quotations_bom_version
      ON mes_quotations(bom_version_id)
      WHERE bom_version_id IS NOT NULL
    `);
    console.log('  ✅ Index idx_quotations_bom_version — created');

    await client.query('COMMIT');
    console.log('\n✅ Migration mes-master-009 complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration mes-master-009 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
