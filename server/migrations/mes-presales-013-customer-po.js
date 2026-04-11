/**
 * Migration: Customer Purchase Orders
 *
 * Creates mes_customer_purchase_orders table for capturing customer PO details
 * linked to inquiries and quotations.
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ─── 1. mes_customer_purchase_orders ─────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_customer_purchase_orders (
        id                      SERIAL PRIMARY KEY,
        po_number               VARCHAR(100) NOT NULL,
        po_date                 DATE NOT NULL,
        inquiry_id              INTEGER REFERENCES mes_presales_inquiries(id),
        quotation_id            INTEGER REFERENCES mes_quotations(id),
        po_value                NUMERIC(14,2),
        currency                VARCHAR(10) DEFAULT 'AED',
        delivery_address        TEXT,
        requested_delivery_date DATE,
        po_document_path        VARCHAR(500),
        status                  VARCHAR(30) DEFAULT 'confirmed',
        created_by              INTEGER,
        created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ─── 2. Index on inquiry_id ──────────────────────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cust_po_inquiry
        ON mes_customer_purchase_orders(inquiry_id)
    `);

    await client.query('COMMIT');
    logger.info('Migration 013: mes_customer_purchase_orders table created');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration 013 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS mes_customer_purchase_orders CASCADE');
    await client.query('COMMIT');
    logger.info('Migration 013: mes_customer_purchase_orders reverted');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
