/**
 * Migration: CRM Notes
 * Table: crm_notes — free-text notes attached to customers or prospects
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS crm_notes (
        id          SERIAL PRIMARY KEY,
        body        TEXT NOT NULL,
        record_type VARCHAR(20) NOT NULL CHECK (record_type IN ('customer','prospect')),
        record_id   INTEGER NOT NULL,
        author_id   INTEGER NOT NULL,
        author_name VARCHAR(255),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_crm_notes_record ON crm_notes(record_type, record_id, created_at DESC)`);

    await client.query('COMMIT');
    logger.info('Migration crm-003: crm_notes table created');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration crm-003 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  await pool.query('DROP TABLE IF EXISTS crm_notes CASCADE');
  logger.info('Migration crm-003: crm_notes dropped');
}

module.exports = { up, down };
