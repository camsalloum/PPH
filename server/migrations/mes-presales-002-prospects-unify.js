/**
 * MES Pre-Sales Migration #002
 * Unify new-customer capture into fp_prospects
 * - Adds contact fields to fp_prospects (mobile, telephone, contact_name, email, source)
 * - Adds prospect_id FK to mes_presales_inquiries
 * - Drops mes_presales_customer_registrations (no production data yet)
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const { pool } = require('../database/config');

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔧 Starting MES Pre-Sales migration #002...');
    await client.query('BEGIN');

    // 1. Add contact/source fields to fp_prospects
    await client.query(`
      ALTER TABLE fp_prospects
        ADD COLUMN IF NOT EXISTS mobile_number    VARCHAR(50),
        ADD COLUMN IF NOT EXISTS telephone_number VARCHAR(50),
        ADD COLUMN IF NOT EXISTS contact_name     VARCHAR(150),
        ADD COLUMN IF NOT EXISTS contact_email    VARCHAR(150),
        ADD COLUMN IF NOT EXISTS source           VARCHAR(50) DEFAULT 'budget',
        ADD COLUMN IF NOT EXISTS approval_status  VARCHAR(20) DEFAULT 'pending'
                                  CHECK (approval_status IN ('pending','approved','rejected')),
        ADD COLUMN IF NOT EXISTS approved_by      VARCHAR(120),
        ADD COLUMN IF NOT EXISTS approved_at      TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
    `);
    console.log('  ✅ fp_prospects — contact + source + approval columns added');

    // 2. Add prospect_id FK to mes_presales_inquiries
    await client.query(`
      ALTER TABLE mes_presales_inquiries
        ADD COLUMN IF NOT EXISTS prospect_id INTEGER REFERENCES fp_prospects(id) ON DELETE SET NULL;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mpi_prospect_id ON mes_presales_inquiries(prospect_id);
    `);
    console.log('  ✅ mes_presales_inquiries — prospect_id FK added');

    // 3. Drop the now-redundant registration table (no data yet)
    await client.query(`DROP TABLE IF EXISTS mes_presales_customer_registrations CASCADE;`);
    console.log('  ✅ mes_presales_customer_registrations — dropped');

    await client.query('COMMIT');
    console.log('\n✅ Migration #002 completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration #002 failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

runMigration();
