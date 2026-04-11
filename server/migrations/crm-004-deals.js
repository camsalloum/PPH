/**
 * Migration: CRM Deal Pipeline
 * Tables: crm_deals + crm_deal_stage_history
 * Stages: qualified → proposal → negotiation → won → lost
 *
 * Idempotent: creates tables if missing, adds missing columns if tables exist.
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // --- crm_deals ---
    const dealsCheck = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'crm_deals'
    `);

    if (dealsCheck.rows.length === 0) {
      // Create without FK on contact_id first — fp_customer_contacts may not exist yet
      await client.query(`
        CREATE TABLE crm_deals (
          id                  SERIAL PRIMARY KEY,
          title               VARCHAR(255) NOT NULL,
          customer_id         INTEGER REFERENCES fp_customer_unified(customer_id) ON DELETE SET NULL,
          contact_id          INTEGER,
          stage               VARCHAR(30) NOT NULL DEFAULT 'qualified'
                                CHECK (stage IN ('qualified','proposal','negotiation','won','lost')),
          estimated_value     DECIMAL(18,2),
          currency            VARCHAR(10) DEFAULT 'AED',
          expected_close_date DATE NOT NULL,
          assigned_rep_id     INTEGER NOT NULL,
          assigned_rep_name   VARCHAR(255),
          close_reason        TEXT,
          created_by          INTEGER NOT NULL,
          created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      // Try to add FK to fp_customer_contacts if it exists
      try {
        await client.query(`
          ALTER TABLE crm_deals ADD CONSTRAINT crm_deals_contact_id_fkey
            FOREIGN KEY (contact_id) REFERENCES fp_customer_contacts(id) ON DELETE SET NULL
        `);
      } catch (fkErr) {
        logger.warn('crm-004: fp_customer_contacts not yet available, contact_id FK skipped:', fkErr.message);
      }
      logger.info('Migration crm-004: crm_deals table created');
    } else {
      const cols = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'crm_deals'
      `);
      const existing = new Set(cols.rows.map(r => r.column_name));

      if (!existing.has('customer_id')) {
        await client.query(`ALTER TABLE crm_deals ADD COLUMN customer_id INTEGER`);
        try {
          await client.query(`
            ALTER TABLE crm_deals ADD CONSTRAINT crm_deals_customer_id_fkey
              FOREIGN KEY (customer_id) REFERENCES fp_customer_unified(customer_id) ON DELETE SET NULL
          `);
        } catch (fkErr) {
          logger.warn('crm-004: could not add customer_id FK:', fkErr.message);
        }
      }
      if (!existing.has('contact_id')) {
        await client.query(`ALTER TABLE crm_deals ADD COLUMN contact_id INTEGER`);
        try {
          await client.query(`
            ALTER TABLE crm_deals ADD CONSTRAINT crm_deals_contact_id_fkey
              FOREIGN KEY (contact_id) REFERENCES fp_customer_contacts(id) ON DELETE SET NULL
          `);
        } catch (fkErr) {
          logger.warn('crm-004: could not add contact_id FK:', fkErr.message);
        }
      }
      if (!existing.has('stage'))               await client.query(`ALTER TABLE crm_deals ADD COLUMN stage VARCHAR(30) NOT NULL DEFAULT 'qualified'`);
      if (!existing.has('estimated_value'))      await client.query(`ALTER TABLE crm_deals ADD COLUMN estimated_value DECIMAL(18,2)`);
      if (!existing.has('currency'))             await client.query(`ALTER TABLE crm_deals ADD COLUMN currency VARCHAR(10) DEFAULT 'AED'`);
      if (!existing.has('expected_close_date'))  await client.query(`ALTER TABLE crm_deals ADD COLUMN expected_close_date DATE`);
      if (!existing.has('assigned_rep_id'))      await client.query(`ALTER TABLE crm_deals ADD COLUMN assigned_rep_id INTEGER`);
      if (!existing.has('assigned_rep_name'))    await client.query(`ALTER TABLE crm_deals ADD COLUMN assigned_rep_name VARCHAR(255)`);
      if (!existing.has('close_reason'))         await client.query(`ALTER TABLE crm_deals ADD COLUMN close_reason TEXT`);
      if (!existing.has('created_by'))           await client.query(`ALTER TABLE crm_deals ADD COLUMN created_by INTEGER`);
      if (!existing.has('created_at'))           await client.query(`ALTER TABLE crm_deals ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW()`);
      if (!existing.has('updated_at'))           await client.query(`ALTER TABLE crm_deals ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW()`);

      logger.info('Migration crm-004: crm_deals columns verified/added');
    }

    // --- crm_deal_stage_history ---
    const histCheck = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'crm_deal_stage_history'
    `);

    if (histCheck.rows.length === 0) {
      await client.query(`
        CREATE TABLE crm_deal_stage_history (
          id         SERIAL PRIMARY KEY,
          deal_id    INTEGER NOT NULL REFERENCES crm_deals(id) ON DELETE CASCADE,
          from_stage VARCHAR(30),
          to_stage   VARCHAR(30) NOT NULL,
          changed_by INTEGER NOT NULL,
          changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          note       TEXT
        )
      `);
      logger.info('Migration crm-004: crm_deal_stage_history table created');
    } else {
      const cols = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'crm_deal_stage_history'
      `);
      const existing = new Set(cols.rows.map(r => r.column_name));

      if (!existing.has('deal_id'))    await client.query(`ALTER TABLE crm_deal_stage_history ADD COLUMN deal_id INTEGER`);
      if (!existing.has('from_stage')) await client.query(`ALTER TABLE crm_deal_stage_history ADD COLUMN from_stage VARCHAR(30)`);
      if (!existing.has('to_stage'))   await client.query(`ALTER TABLE crm_deal_stage_history ADD COLUMN to_stage VARCHAR(30)`);
      if (!existing.has('changed_by')) await client.query(`ALTER TABLE crm_deal_stage_history ADD COLUMN changed_by INTEGER`);
      if (!existing.has('changed_at')) await client.query(`ALTER TABLE crm_deal_stage_history ADD COLUMN changed_at TIMESTAMPTZ DEFAULT NOW()`);
      if (!existing.has('note'))       await client.query(`ALTER TABLE crm_deal_stage_history ADD COLUMN note TEXT`);

      logger.info('Migration crm-004: crm_deal_stage_history columns verified/added');
    }

    await client.query(`CREATE INDEX IF NOT EXISTS idx_crm_deals_rep   ON crm_deals(assigned_rep_id, stage)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_crm_deals_cust  ON crm_deals(customer_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_crm_deals_close ON crm_deals(expected_close_date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_crm_deal_hist   ON crm_deal_stage_history(deal_id, changed_at DESC)`);

    await client.query('COMMIT');
    logger.info('Migration crm-004: complete');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration crm-004 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  await pool.query('DROP TABLE IF EXISTS crm_deal_stage_history CASCADE');
  await pool.query('DROP TABLE IF EXISTS crm_deals CASCADE');
  logger.info('Migration crm-004: crm_deals tables dropped');
}

module.exports = { up, down };
