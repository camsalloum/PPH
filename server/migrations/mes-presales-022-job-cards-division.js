/**
 * Migration #022 — Job Cards Division Isolation
 *
 * Adds division column to mes_job_cards and backfills legacy rows to FP.
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

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔧 Starting MES Pre-Sales migration #022 — Job Card Division Isolation...\n');

    await client.query(`
      ALTER TABLE mes_job_cards
      ADD COLUMN IF NOT EXISTS division VARCHAR(10)
    `);
    console.log('  ✅ mes_job_cards.division — ensured');

    await client.query(`
      UPDATE mes_job_cards
      SET division = 'FP'
      WHERE division IS NULL OR TRIM(division) = ''
    `);
    console.log('  ✅ mes_job_cards.division — backfilled to FP');

    await client.query(`
      ALTER TABLE mes_job_cards
      ALTER COLUMN division SET DEFAULT 'FP'
    `);
    await client.query(`
      ALTER TABLE mes_job_cards
      ALTER COLUMN division SET NOT NULL
    `);
    console.log('  ✅ mes_job_cards.division — default/not-null enforced');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_jobcard_division
      ON mes_job_cards(division)
    `);
    console.log('  ✅ idx_jobcard_division — created');

    await client.query('COMMIT');
    console.log('\n✅ Migration #022 complete.\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration #022 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
