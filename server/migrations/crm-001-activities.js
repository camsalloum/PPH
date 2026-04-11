/**
 * Migration: CRM Activity Logging
 * Table: crm_activities — sales rep daily activity log (calls, visits, WhatsApp, email, follow-ups)
 *
 * Idempotent: creates the table if missing, adds missing columns if table exists.
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if table exists
    const tableCheck = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'crm_activities'
    `);

    if (tableCheck.rows.length === 0) {
      // Table doesn't exist — create it fresh
      await client.query(`
        CREATE TABLE crm_activities (
          id            SERIAL PRIMARY KEY,
          type          VARCHAR(30),
          customer_id   INTEGER REFERENCES fp_customer_unified(customer_id) ON DELETE SET NULL,
          prospect_id   INTEGER,
          rep_id        INTEGER,
          rep_name      VARCHAR(255),
          activity_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          duration_mins INTEGER,
          outcome_note  TEXT,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      logger.info('Migration crm-001: crm_activities table created');
    } else {
      // Table exists — ensure all CRM columns are present
      const cols = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'crm_activities'
      `);
      const existing = new Set(cols.rows.map(r => r.column_name));

      if (!existing.has('customer_id')) {
        await client.query(`ALTER TABLE crm_activities ADD COLUMN customer_id INTEGER`);
        // Try adding FK — may fail if fp_customer_unified doesn't exist yet
        try {
          await client.query(`
            ALTER TABLE crm_activities ADD CONSTRAINT crm_activities_customer_id_fkey
              FOREIGN KEY (customer_id) REFERENCES fp_customer_unified(customer_id) ON DELETE SET NULL
          `);
        } catch (fkErr) {
          logger.warn('crm-001: could not add customer_id FK (table may not exist yet):', fkErr.message);
        }
        logger.info('Migration crm-001: added customer_id column');
      }
      if (!existing.has('type'))          await client.query(`ALTER TABLE crm_activities ADD COLUMN type VARCHAR(30)`);
      if (!existing.has('prospect_id'))   await client.query(`ALTER TABLE crm_activities ADD COLUMN prospect_id INTEGER`);
      if (!existing.has('rep_id'))        await client.query(`ALTER TABLE crm_activities ADD COLUMN rep_id INTEGER`);
      if (!existing.has('rep_name'))      await client.query(`ALTER TABLE crm_activities ADD COLUMN rep_name VARCHAR(255)`);
      if (!existing.has('activity_date')) await client.query(`ALTER TABLE crm_activities ADD COLUMN activity_date TIMESTAMPTZ DEFAULT NOW()`);
      if (!existing.has('duration_mins')) await client.query(`ALTER TABLE crm_activities ADD COLUMN duration_mins INTEGER`);
      if (!existing.has('outcome_note'))  await client.query(`ALTER TABLE crm_activities ADD COLUMN outcome_note TEXT`);
      if (!existing.has('created_at'))    await client.query(`ALTER TABLE crm_activities ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW()`);

      logger.info('Migration crm-001: crm_activities columns verified/added');
    }

    await client.query(`CREATE INDEX IF NOT EXISTS idx_crm_act_rep   ON crm_activities(rep_id, activity_date DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_crm_act_cust  ON crm_activities(customer_id, activity_date DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_crm_act_prosp ON crm_activities(prospect_id, activity_date DESC)`);

    await client.query('COMMIT');
    logger.info('Migration crm-001: complete');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration crm-001 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  await pool.query('DROP TABLE IF EXISTS crm_activities CASCADE');
  logger.info('Migration crm-001: crm_activities dropped');
}

module.exports = { up, down };
