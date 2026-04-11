/**
 * Migration: CRM Calls
 * Table: crm_calls — phone call logs with direction and duration
 * Status: planned → held → not_held → canceled
 *
 * Idempotent: creates table if missing, adds missing columns if table exists.
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tableCheck = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'crm_calls'
    `);

    if (tableCheck.rows.length === 0) {
      await client.query(`
        CREATE TABLE crm_calls (
          id              SERIAL PRIMARY KEY,
          name            VARCHAR(255) NOT NULL,
          description     TEXT,
          date_start      TIMESTAMPTZ NOT NULL,
          duration_mins   INTEGER DEFAULT 5,
          direction       VARCHAR(10) NOT NULL DEFAULT 'outbound'
                            CHECK (direction IN ('inbound','outbound')),
          status          VARCHAR(20) NOT NULL DEFAULT 'planned'
                            CHECK (status IN ('planned','held','not_held','canceled')),
          customer_id     INTEGER REFERENCES fp_customer_unified(customer_id) ON DELETE SET NULL,
          prospect_id     INTEGER,
          deal_id         INTEGER,
          assigned_to_id  INTEGER NOT NULL,
          assigned_to_name VARCHAR(255),
          outcome_note    TEXT,
          reminders       JSONB DEFAULT '[]',
          created_by      INTEGER NOT NULL,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await client.query(`CREATE INDEX idx_crm_calls_assigned ON crm_calls(assigned_to_id)`);
      await client.query(`CREATE INDEX idx_crm_calls_date ON crm_calls(date_start)`);
      await client.query(`CREATE INDEX idx_crm_calls_status ON crm_calls(status)`);
      await client.query(`CREATE INDEX idx_crm_calls_customer ON crm_calls(customer_id)`);

      logger.info('Migration crm-013: crm_calls table created');
    } else {
      const cols = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'crm_calls'
      `);
      const existing = new Set(cols.rows.map(r => r.column_name));

      if (!existing.has('deal_id'))     await client.query(`ALTER TABLE crm_calls ADD COLUMN deal_id INTEGER`);
      if (!existing.has('reminders'))   await client.query(`ALTER TABLE crm_calls ADD COLUMN reminders JSONB DEFAULT '[]'`);
      if (!existing.has('prospect_id')) await client.query(`ALTER TABLE crm_calls ADD COLUMN prospect_id INTEGER`);
      logger.info('Migration crm-013: crm_calls table already exists, checked columns');
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration crm-013 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  await pool.query('DROP TABLE IF EXISTS crm_calls CASCADE');
}

module.exports = { up, down };
