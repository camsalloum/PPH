/**
 * Migration: mes-presales-019-phase5-qc-enhancements.js
 * Phase 5 QC enhancements:
 *   - Add has_safety_warning column to mes_cse_reports
 *   - Add disposition column to mes_presales_samples
 */
const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add has_safety_warning to CSE reports (for solvent retention auto-warning)
    await client.query(`
      ALTER TABLE mes_cse_reports
      ADD COLUMN IF NOT EXISTS has_safety_warning BOOLEAN DEFAULT FALSE
    `);

    // Add disposition column to samples (retain/return/dispose)
    await client.query(`
      ALTER TABLE mes_presales_samples
      ADD COLUMN IF NOT EXISTS disposition VARCHAR(20) DEFAULT NULL
        CHECK (disposition IS NULL OR disposition IN ('retain', 'return', 'dispose'))
    `);

    await client.query('COMMIT');
    logger.info('Migration mes-presales-019: Phase 5 QC enhancements applied');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration mes-presales-019 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE mes_cse_reports DROP COLUMN IF EXISTS has_safety_warning');
    await client.query('ALTER TABLE mes_presales_samples DROP COLUMN IF EXISTS disposition');
    await client.query('COMMIT');
    logger.info('Migration mes-presales-019: rollback complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
