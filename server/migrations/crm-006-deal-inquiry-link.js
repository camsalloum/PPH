/**
 * Migration: Link CRM deals to PreSales inquiries
 * Adds optional inquiry_id FK on crm_deals so a deal can reference the inquiry it came from.
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS inquiry_id INTEGER`);

    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_deals_inquiry_id_fkey') THEN
          ALTER TABLE crm_deals ADD CONSTRAINT crm_deals_inquiry_id_fkey
            FOREIGN KEY (inquiry_id) REFERENCES mes_presales_inquiries(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_crm_deals_inquiry ON crm_deals(inquiry_id)`);

    await client.query('COMMIT');
    logger.info('Migration crm-006: crm_deals.inquiry_id added');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration crm-006 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP INDEX IF EXISTS idx_crm_deals_inquiry');
    await client.query('ALTER TABLE crm_deals DROP CONSTRAINT IF EXISTS crm_deals_inquiry_id_fkey');
    await client.query('ALTER TABLE crm_deals DROP COLUMN IF EXISTS inquiry_id');
    await client.query('COMMIT');
    logger.info('Migration crm-006: rolled back');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
