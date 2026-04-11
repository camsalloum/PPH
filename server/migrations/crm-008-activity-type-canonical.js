/**
 * Migration: Canonicalise crm_activities type column
 * Copies activity_type values into type where type is NULL.
 * Going forward, all inserts should write to `type` (the canonical column).
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Make activity_type nullable (new inserts use `type` column instead)
    await client.query(`ALTER TABLE crm_activities ALTER COLUMN activity_type DROP NOT NULL`);
    const result = await client.query(`
      UPDATE crm_activities
      SET type = activity_type
      WHERE type IS NULL AND activity_type IS NOT NULL
    `);
    await client.query('COMMIT');
    logger.info(`Migration crm-008: activity_type made nullable, canonicalised ${result.rowCount} rows`);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration crm-008 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  // No rollback needed — the data was already in activity_type and we only filled NULLs
  logger.info('Migration crm-008: No rollback action (data-only migration)');
}

module.exports = { up, down };
