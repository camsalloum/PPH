/**
 * Migration: CRM Tasks & Follow-ups
 * Table: crm_tasks — scheduled follow-up items with due dates and priority
 *
 * Idempotent: creates the table if missing, adds missing columns if table exists.
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tableCheck = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'crm_tasks'
    `);

    if (tableCheck.rows.length === 0) {
      await client.query(`
        CREATE TABLE crm_tasks (
          id            SERIAL PRIMARY KEY,
          title         VARCHAR(255) NOT NULL,
          description   TEXT,
          due_date      DATE NOT NULL,
          priority      VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
          status        VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed')),
          assignee_id   INTEGER NOT NULL,
          assignee_name VARCHAR(255),
          customer_id   INTEGER REFERENCES fp_customer_unified(customer_id) ON DELETE SET NULL,
          prospect_id   INTEGER,
          completed_at  TIMESTAMPTZ,
          created_by    INTEGER NOT NULL,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      logger.info('Migration crm-002: crm_tasks table created');
    } else {
      const cols = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'crm_tasks'
      `);
      const existing = new Set(cols.rows.map(r => r.column_name));

      if (!existing.has('customer_id')) {
        await client.query(`ALTER TABLE crm_tasks ADD COLUMN customer_id INTEGER`);
        try {
          await client.query(`
            ALTER TABLE crm_tasks ADD CONSTRAINT crm_tasks_customer_id_fkey
              FOREIGN KEY (customer_id) REFERENCES fp_customer_unified(customer_id) ON DELETE SET NULL
          `);
        } catch (fkErr) {
          logger.warn('crm-002: could not add customer_id FK:', fkErr.message);
        }
      }
      if (!existing.has('prospect_id'))   await client.query(`ALTER TABLE crm_tasks ADD COLUMN prospect_id INTEGER`);
      if (!existing.has('assignee_name')) await client.query(`ALTER TABLE crm_tasks ADD COLUMN assignee_name VARCHAR(255)`);
      if (!existing.has('completed_at'))  await client.query(`ALTER TABLE crm_tasks ADD COLUMN completed_at TIMESTAMPTZ`);

      logger.info('Migration crm-002: crm_tasks columns verified/added');
    }

    await client.query(`CREATE INDEX IF NOT EXISTS idx_crm_tasks_assignee ON crm_tasks(assignee_id, status, due_date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_crm_tasks_customer ON crm_tasks(customer_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_crm_tasks_prospect ON crm_tasks(prospect_id)`);

    await client.query('COMMIT');
    logger.info('Migration crm-002: complete');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration crm-002 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  await pool.query('DROP TABLE IF EXISTS crm_tasks CASCADE');
  logger.info('Migration crm-002: crm_tasks dropped');
}

module.exports = { up, down };
