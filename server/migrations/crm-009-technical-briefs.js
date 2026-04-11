/**
 * Migration: crm_technical_briefs table
 * Stores structured pre-inquiry product interest details that reps build
 * incrementally before converting to a formal pre-sales inquiry.
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
      WHERE table_schema = 'public' AND table_name = 'crm_technical_briefs'
    `);

    if (tableCheck.rows.length === 0) {
      await client.query(`
        CREATE TABLE crm_technical_briefs (
          id                   SERIAL PRIMARY KEY,
          customer_id          INTEGER NOT NULL REFERENCES fp_customer_unified(customer_id),
          created_by           INTEGER NOT NULL,
          product_description  VARCHAR(500) NOT NULL,
          product_category     VARCHAR(100),
          substrate_interest   VARCHAR(255),
          approx_dimensions    VARCHAR(100),
          print_colors         VARCHAR(100),
          barrier_requirements TEXT,
          annual_volume_est    VARCHAR(100),
          target_price_range   VARCHAR(100),
          current_supplier     VARCHAR(255),
          decision_timeline    VARCHAR(100),
          next_step_agreed     TEXT,
          status               VARCHAR(30) DEFAULT 'draft'
                                 CHECK (status IN ('draft','submitted','converted')),
          inquiry_id           INTEGER,
          created_at           TIMESTAMPTZ DEFAULT NOW(),
          updated_at           TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      logger.info('Migration crm-009: crm_technical_briefs table created');
    } else {
      const cols = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'crm_technical_briefs'
      `);
      const existing = new Set(cols.rows.map(r => r.column_name));

      if (!existing.has('customer_id'))          await client.query(`ALTER TABLE crm_technical_briefs ADD COLUMN customer_id INTEGER`);
      if (!existing.has('created_by'))           await client.query(`ALTER TABLE crm_technical_briefs ADD COLUMN created_by INTEGER`);
      if (!existing.has('product_description'))  await client.query(`ALTER TABLE crm_technical_briefs ADD COLUMN product_description VARCHAR(500)`);
      if (!existing.has('product_category'))     await client.query(`ALTER TABLE crm_technical_briefs ADD COLUMN product_category VARCHAR(100)`);
      if (!existing.has('substrate_interest'))   await client.query(`ALTER TABLE crm_technical_briefs ADD COLUMN substrate_interest VARCHAR(255)`);
      if (!existing.has('approx_dimensions'))    await client.query(`ALTER TABLE crm_technical_briefs ADD COLUMN approx_dimensions VARCHAR(100)`);
      if (!existing.has('print_colors'))         await client.query(`ALTER TABLE crm_technical_briefs ADD COLUMN print_colors VARCHAR(100)`);
      if (!existing.has('barrier_requirements')) await client.query(`ALTER TABLE crm_technical_briefs ADD COLUMN barrier_requirements TEXT`);
      if (!existing.has('annual_volume_est'))    await client.query(`ALTER TABLE crm_technical_briefs ADD COLUMN annual_volume_est VARCHAR(100)`);
      if (!existing.has('target_price_range'))   await client.query(`ALTER TABLE crm_technical_briefs ADD COLUMN target_price_range VARCHAR(100)`);
      if (!existing.has('current_supplier'))     await client.query(`ALTER TABLE crm_technical_briefs ADD COLUMN current_supplier VARCHAR(255)`);
      if (!existing.has('decision_timeline'))    await client.query(`ALTER TABLE crm_technical_briefs ADD COLUMN decision_timeline VARCHAR(100)`);
      if (!existing.has('next_step_agreed'))     await client.query(`ALTER TABLE crm_technical_briefs ADD COLUMN next_step_agreed TEXT`);
      if (!existing.has('status'))               await client.query(`ALTER TABLE crm_technical_briefs ADD COLUMN status VARCHAR(30) DEFAULT 'draft'`);
      if (!existing.has('inquiry_id'))           await client.query(`ALTER TABLE crm_technical_briefs ADD COLUMN inquiry_id INTEGER`);
      if (!existing.has('created_at'))           await client.query(`ALTER TABLE crm_technical_briefs ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW()`);
      if (!existing.has('updated_at'))           await client.query(`ALTER TABLE crm_technical_briefs ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW()`);

      logger.info('Migration crm-009: crm_technical_briefs columns verified/added');
    }

    await client.query(`CREATE INDEX IF NOT EXISTS idx_tech_brief_customer   ON crm_technical_briefs(customer_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tech_brief_created_by ON crm_technical_briefs(created_by)`);

    await client.query('COMMIT');
    logger.info('Migration crm-009: complete');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration crm-009 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  await pool.query('DROP TABLE IF EXISTS crm_technical_briefs CASCADE');
  logger.info('Migration crm-009: crm_technical_briefs dropped');
}

module.exports = { up, down };
