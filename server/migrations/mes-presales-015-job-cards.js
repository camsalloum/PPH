/**
 * Migration: Job Cards
 *
 * Creates mes_job_cards table for production job cards linked to inquiries
 * and customers, with BOM material requirements and approval tracking.
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ─── 1. mes_job_cards ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_job_cards (
        id                      SERIAL PRIMARY KEY,
        job_number              VARCHAR(30) NOT NULL UNIQUE,
        inquiry_id              INTEGER REFERENCES mes_presales_inquiries(id),
        customer_id             INTEGER REFERENCES fp_customer_unified(customer_id),
        customer_name           VARCHAR(255),
        product_specs           JSONB,
        quantity                NUMERIC(14,2),
        quantity_unit           VARCHAR(20),
        required_delivery_date  DATE,
        material_requirements   JSONB,
        material_status         VARCHAR(30) DEFAULT 'pending'
          CHECK (material_status IN ('pending','partially_ordered','ordered','available')),
        status                  VARCHAR(30) DEFAULT 'draft'
          CHECK (status IN ('draft','approved','in_production','completed','cancelled')),
        approved_by             INTEGER,
        approved_at             TIMESTAMPTZ,
        created_by              INTEGER,
        created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ─── 2. Index on inquiry_id ──────────────────────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_jobcard_inquiry
        ON mes_job_cards(inquiry_id)
    `);

    // ─── 3. Index on status ──────────────────────────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_jobcard_status
        ON mes_job_cards(status)
    `);

    await client.query('COMMIT');
    logger.info('Migration 015: mes_job_cards table created');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration 015 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS mes_job_cards CASCADE');
    await client.query('COMMIT');
    logger.info('Migration 015: mes_job_cards reverted');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
