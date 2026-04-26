/**
 * MES Migration 056 — Schema Admin Audit Log
 * Phase 8 of MATERIAL_SPECS_AND_PARSER_CONSOLIDATED_FIX_PLAN_2026-04-24.md
 *
 * Records every CREATE/UPDATE/DELETE on mes_parameter_definitions and
 * mes_category_mapping with a full before/after JSONB snapshot so schema
 * changes are traceable.
 *
 * Idempotent: safe to re-run.
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
    console.log('▶ MES migration 056 — schema admin audit log');
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_schema_admin_audit (
        id           BIGSERIAL PRIMARY KEY,
        entity_type  VARCHAR(40)  NOT NULL,   -- 'parameter_definition' | 'category_mapping'
        entity_id    INT,                     -- nullable for DELETE-after-cleanup
        action       VARCHAR(20)  NOT NULL,   -- 'create' | 'update' | 'delete'
        actor_id     INT,
        actor_email  VARCHAR(200),
        actor_role   VARCHAR(40),
        before_json  JSONB,
        after_json   JSONB,
        diff_summary TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_entity ON mes_schema_admin_audit(entity_type, entity_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_actor  ON mes_schema_admin_audit(actor_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_when   ON mes_schema_admin_audit(created_at DESC)`);

    await client.query('COMMIT');
    console.log('✓ migration 056 applied');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ migration 056 failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrate().then(() => pool.end()).catch(() => { pool.end(); process.exit(1); });
}

module.exports = { migrate };
