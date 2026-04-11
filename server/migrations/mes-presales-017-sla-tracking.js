/**
 * Migration: SLA Tracking — add sent_to_qc_at to inquiries for SLA breach detection
 */
const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE mes_presales_inquiries
        ADD COLUMN IF NOT EXISTS sent_to_qc_at TIMESTAMPTZ
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inquiries_sent_to_qc
        ON mes_presales_inquiries(sent_to_qc_at)
        WHERE sent_to_qc_at IS NOT NULL
    `);

    // Backfill from earliest sample sent_to_qc_at per inquiry
    await client.query(`
      UPDATE mes_presales_inquiries i
      SET sent_to_qc_at = sub.earliest
      FROM (
        SELECT inquiry_id, MIN(sent_to_qc_at) AS earliest
        FROM mes_presales_samples
        WHERE sent_to_qc_at IS NOT NULL
        GROUP BY inquiry_id
      ) sub
      WHERE i.id = sub.inquiry_id AND i.sent_to_qc_at IS NULL
    `);

    await client.query('COMMIT');
    logger.info('Migration 017: sent_to_qc_at added to inquiries with backfill');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration 017 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  await pool.query('ALTER TABLE mes_presales_inquiries DROP COLUMN IF EXISTS sent_to_qc_at');
  logger.info('Migration 017: sent_to_qc_at dropped from inquiries');
}

module.exports = { up, down };
