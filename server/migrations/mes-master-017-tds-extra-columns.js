/**
 * Migration mes-master-017 — TDS Extra Columns
 *
 * Adds columns identified from real supplier PDFs (Borouge FB5600, ExxonMobil HMA):
 *   - escr_value         VARCHAR(50)   e.g. ">72 Hours", "<1 hr"
 *   - escr_condition     VARCHAR(120)  e.g. "10% Igepal, 50°C, ASTM D1693-B"
 *   - puncture_force     DECIMAL(8,2)  N   (Borouge Puncture Resistance, force)
 *   - puncture_energy    DECIMAL(8,3)  J   (Borouge Puncture Resistance, energy)
 *   - secant_modulus_td  DECIMAL(8,1)  MPa (Borouge gives MD and TD separately)
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
    console.log('🚀 Starting MES migration #017 — TDS Extra Columns...\n');

    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE mes_material_tds
        ADD COLUMN IF NOT EXISTS escr_value        VARCHAR(50),
        ADD COLUMN IF NOT EXISTS escr_condition    VARCHAR(120),
        ADD COLUMN IF NOT EXISTS puncture_force    DECIMAL(8,2),
        ADD COLUMN IF NOT EXISTS puncture_energy   DECIMAL(8,3),
        ADD COLUMN IF NOT EXISTS secant_modulus_td DECIMAL(8,1);
    `);
    console.log('  ✓ 5 columns added to mes_material_tds');

    await client.query('COMMIT');
    console.log('\n✓ Migration mes-master-017 complete.');
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
