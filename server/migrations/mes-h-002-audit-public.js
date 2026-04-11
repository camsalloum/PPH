/**
 * MES Sprint 4B Migration
 * H-005: CSE Public Share Token
 * H-008: Audit Trail Table
 *
 * Run: node server/migrations/mes-h-002-audit-public.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT)  || 5432,
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'fp_database',
});

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔧 Starting MES Sprint 4B migration (H-005 + H-008)...');

    // ─────────────────────────────────────────────────────────
    // H-005: CSE public share token
    // ─────────────────────────────────────────────────────────
    await client.query(`
      ALTER TABLE mes_cse_reports
        ADD COLUMN IF NOT EXISTS public_token        VARCHAR(80)  UNIQUE,
        ADD COLUMN IF NOT EXISTS public_token_exp    TIMESTAMP,
        ADD COLUMN IF NOT EXISTS public_shared_by    INTEGER,
        ADD COLUMN IF NOT EXISTS public_shared_at    TIMESTAMP
    `);
    console.log('  ✅ mes_cse_reports — public share token columns added');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cse_public_token ON mes_cse_reports(public_token)
        WHERE public_token IS NOT NULL
    `);

    // ─────────────────────────────────────────────────────────
    // H-008: Application-level audit log
    // Records field-level changes to key MES tables
    // ─────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_audit_log (
        id            SERIAL PRIMARY KEY,
        table_name    VARCHAR(100) NOT NULL,
        record_id     INTEGER      NOT NULL,
        action        VARCHAR(20)  NOT NULL
                        CHECK (action IN ('created','updated','deleted')),
        changed_fields TEXT[],          -- array of field names that changed
        old_data      JSONB,            -- snapshot before change
        new_data      JSONB,            -- snapshot after change
        user_id       INTEGER,
        user_name     VARCHAR(255),
        user_role     VARCHAR(50),
        created_at    TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('  ✅ mes_audit_log created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_table_record ON mes_audit_log(table_name, record_id);
      CREATE INDEX IF NOT EXISTS idx_audit_created_at   ON mes_audit_log(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_user         ON mes_audit_log(user_id);
    `);

    await client.query('COMMIT');
    console.log('✅ Sprint 4B migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Sprint 4B migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

up().catch(() => process.exit(1));
