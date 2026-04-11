/**
 * Migration: Add competitor_notes column to fp_customer_unified and fp_prospects
 * P4-4: Competitor Intel Capture
 */
const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  try {
    await pool.query(`
      ALTER TABLE fp_customer_unified
        ADD COLUMN IF NOT EXISTS competitor_notes TEXT;
    `);
    
    await pool.query(`
      ALTER TABLE fp_prospects
        ADD COLUMN IF NOT EXISTS competitor_notes TEXT;
    `);
    
    logger.info('Migration crm-011-competitor-notes: completed successfully');
    return { success: true };
  } catch (error) {
    logger.error('Migration crm-011-competitor-notes failed:', error);
    throw error;
  }
}

module.exports = { up };
