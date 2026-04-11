/**
 * Migration: Quotation Approval Workflow
 *
 * Adds:
 *  1. parent_quotation_id + version_number columns to mes_quotations
 *  2. mes_quotation_approvals table for approval audit trail
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ─── 1. Add versioning columns to mes_quotations ─────────────────────────
    await client.query(`
      ALTER TABLE mes_quotations
        ADD COLUMN IF NOT EXISTS parent_quotation_id INTEGER REFERENCES mes_quotations(id),
        ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1
    `);

    // ─── 2. mes_quotation_approvals ──────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_quotation_approvals (
        id              SERIAL PRIMARY KEY,
        quotation_id    INTEGER NOT NULL REFERENCES mes_quotations(id) ON DELETE CASCADE,
        action          VARCHAR(30) NOT NULL
                        CHECK (action IN ('submitted','approved','rejected','revision_requested')),
        actor_id        INTEGER,
        actor_name      VARCHAR(120),
        notes           TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quot_approvals_quot
        ON mes_quotation_approvals(quotation_id)
    `);

    await client.query('COMMIT');
    logger.info('Migration 012: quotation workflow columns + approvals table created');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration 012 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS mes_quotation_approvals CASCADE');
    await client.query('ALTER TABLE mes_quotations DROP COLUMN IF EXISTS parent_quotation_id');
    await client.query('ALTER TABLE mes_quotations DROP COLUMN IF EXISTS version_number');
    await client.query('COMMIT');
    logger.info('Migration 012: quotation workflow reverted');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
