/**
 * Migration: CRM Deal Sync — add source column to crm_deal_stage_history
 * for tracking whether stage changes came from user action or MES sync.
 *
 * NOTE: The `note TEXT` column already exists (from crm-004-deals.js).
 */
const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE crm_deal_stage_history
        ADD COLUMN IF NOT EXISTS source VARCHAR(30) DEFAULT 'manual'
    `);

    await client.query('COMMIT');
    logger.info('Migration crm-015: source column added to crm_deal_stage_history');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration crm-015 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  await pool.query('ALTER TABLE crm_deal_stage_history DROP COLUMN IF EXISTS source');
  logger.info('Migration crm-015: source column dropped from crm_deal_stage_history');
}

module.exports = { up, down };
