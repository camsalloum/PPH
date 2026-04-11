/**
 * Migration: mes-master-010-defaults-bom-ref
 *
 * Adds default_bom_version_id to mes_estimation_product_defaults so that
 * opening an estimation for a product group auto-selects the active BOM version.
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
    console.log('🔧 Starting MES Master Data migration #010 — Defaults BOM Reference...\n');

    // Check if the table exists first (it comes from presales migration 018)
    const tblCheck = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'mes_estimation_product_defaults'
    `);

    if (tblCheck.rows.length === 0) {
      console.log('  ⏭️  mes_estimation_product_defaults table not found — skipping (run presales migration 018 first)');
      await client.query('COMMIT');
      console.log('\n✅ Migration mes-master-010 complete (no-op).');
      return;
    }

    const colCheck = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'mes_estimation_product_defaults' AND column_name = 'default_bom_version_id'
    `);

    if (colCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE mes_estimation_product_defaults
        ADD COLUMN default_bom_version_id INTEGER REFERENCES mes_bom_versions(id)
      `);
      console.log('  ✅ mes_estimation_product_defaults.default_bom_version_id — added');
    } else {
      console.log('  ⏭️  default_bom_version_id already exists');
    }

    await client.query('COMMIT');
    console.log('\n✅ Migration mes-master-010 complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration mes-master-010 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
