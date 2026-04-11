/**
 * Migration: Dispatch Tracking & Delivery Feedback
 *
 * Adds dispatch columns to mes_presales_inquiries and creates
 * mes_delivery_feedback table for post-delivery customer feedback.
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ─── 1. Dispatch columns on mes_presales_inquiries ───────────────────────
    await client.query(`
      ALTER TABLE mes_presales_inquiries
        ADD COLUMN IF NOT EXISTS transporter_name VARCHAR(255)
    `);
    await client.query(`
      ALTER TABLE mes_presales_inquiries
        ADD COLUMN IF NOT EXISTS awb_number VARCHAR(100)
    `);
    await client.query(`
      ALTER TABLE mes_presales_inquiries
        ADD COLUMN IF NOT EXISTS dispatch_date DATE
    `);
    await client.query(`
      ALTER TABLE mes_presales_inquiries
        ADD COLUMN IF NOT EXISTS expected_delivery_date DATE
    `);

    // ─── 2. mes_delivery_feedback ────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_delivery_feedback (
        id                  SERIAL PRIMARY KEY,
        inquiry_id          INTEGER NOT NULL REFERENCES mes_presales_inquiries(id),
        satisfaction_rating SMALLINT NOT NULL CHECK (satisfaction_rating BETWEEN 1 AND 5),
        feedback_text       TEXT,
        reorder_likelihood  VARCHAR(10) CHECK (reorder_likelihood IN ('yes','maybe','no')),
        created_by          INTEGER,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ─── 3. Index on inquiry_id ──────────────────────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_feedback_inquiry
        ON mes_delivery_feedback(inquiry_id)
    `);

    await client.query('COMMIT');
    logger.info('Migration 014: dispatch columns + mes_delivery_feedback created');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration 014 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS mes_delivery_feedback CASCADE');
    await client.query('ALTER TABLE mes_presales_inquiries DROP COLUMN IF EXISTS transporter_name');
    await client.query('ALTER TABLE mes_presales_inquiries DROP COLUMN IF EXISTS awb_number');
    await client.query('ALTER TABLE mes_presales_inquiries DROP COLUMN IF EXISTS dispatch_date');
    await client.query('ALTER TABLE mes_presales_inquiries DROP COLUMN IF EXISTS expected_delivery_date');
    await client.query('COMMIT');
    logger.info('Migration 014: dispatch columns + mes_delivery_feedback reverted');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
