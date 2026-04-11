/**
 * Migration: CRM Meetings
 * Table: crm_meetings — scheduled meetings/visits with attendees
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
      WHERE table_schema = 'public' AND table_name = 'crm_meetings'
    `);

    if (tableCheck.rows.length === 0) {
      await client.query(`
        CREATE TABLE crm_meetings (
          id              SERIAL PRIMARY KEY,
          name            VARCHAR(255) NOT NULL,
          description     TEXT,
          date_start      TIMESTAMPTZ NOT NULL,
          date_end        TIMESTAMPTZ,
          duration_mins   INTEGER DEFAULT 30,
          location        VARCHAR(500),
          status          VARCHAR(20) NOT NULL DEFAULT 'planned'
                            CHECK (status IN ('planned','held','not_held','canceled')),
          customer_id     INTEGER REFERENCES fp_customer_unified(customer_id) ON DELETE SET NULL,
          prospect_id     INTEGER,
          deal_id         INTEGER,
          assigned_to_id  INTEGER NOT NULL,
          assigned_to_name VARCHAR(255),
          attendees       JSONB DEFAULT '[]',
          reminders       JSONB DEFAULT '[]',
          created_by      INTEGER NOT NULL,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await client.query(`CREATE INDEX idx_crm_meetings_assigned ON crm_meetings(assigned_to_id)`);
      await client.query(`CREATE INDEX idx_crm_meetings_date ON crm_meetings(date_start)`);
      await client.query(`CREATE INDEX idx_crm_meetings_status ON crm_meetings(status)`);
      await client.query(`CREATE INDEX idx_crm_meetings_customer ON crm_meetings(customer_id)`);

      logger.info('Migration crm-012: crm_meetings table created');
    } else {
      const cols = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'crm_meetings'
      `);
      const existing = new Set(cols.rows.map(r => r.column_name));

      if (!existing.has('deal_id'))     await client.query(`ALTER TABLE crm_meetings ADD COLUMN deal_id INTEGER`);
      if (!existing.has('reminders'))   await client.query(`ALTER TABLE crm_meetings ADD COLUMN reminders JSONB DEFAULT '[]'`);
      if (!existing.has('prospect_id')) await client.query(`ALTER TABLE crm_meetings ADD COLUMN prospect_id INTEGER`);
      logger.info('Migration crm-012: crm_meetings table already exists, checked columns');
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration crm-012 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  await pool.query('DROP TABLE IF EXISTS crm_meetings CASCADE');
}

module.exports = { up, down };
