/**
 * Migration: mes-master-025-non-resin-supplier
 * Adds supplier_name column to mes_non_resin_material_specs.
 * Allows users to associate a spec with a specific supplier.
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

    // Add supplier_name column (nullable — not all items have a known supplier)
    const colCheck = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'mes_non_resin_material_specs' AND column_name = 'supplier_name'
    `);
    if (!colCheck.rows.length) {
      await client.query(`
        ALTER TABLE mes_non_resin_material_specs
        ADD COLUMN supplier_name VARCHAR(200)
      `);
      console.log('  ✔ Added supplier_name column');
    } else {
      console.log('  ⊘ supplier_name column already exists');
    }

    // Index for supplier-based lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_non_resin_supplier_name
      ON mes_non_resin_material_specs (supplier_name)
      WHERE supplier_name IS NOT NULL
    `);
    console.log('  ✔ supplier_name index created');

    await client.query('COMMIT');
    console.log('Migration mes-master-025 complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  up().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { up };
