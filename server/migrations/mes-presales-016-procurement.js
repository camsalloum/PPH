/**
 * Migration: Material Procurement Flow
 *
 * Creates three tables for the full procurement chain:
 *   1. mes_purchase_requisitions  — PR raised from Job Card BOM
 *   2. mes_supplier_purchase_orders — SPO linked to approved PR
 *   3. mes_stock_receipts — goods receipt against SPO
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ─── 1. mes_purchase_requisitions ────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_purchase_requisitions (
        id                SERIAL PRIMARY KEY,
        pr_number         VARCHAR(30) NOT NULL UNIQUE,
        job_card_id       INTEGER REFERENCES mes_job_cards(id),
        inquiry_id        INTEGER REFERENCES mes_presales_inquiries(id),
        material_details  JSONB NOT NULL DEFAULT '[]'::jsonb,
        total_amount      NUMERIC(14,2),
        notes             TEXT,
        status            VARCHAR(30) DEFAULT 'pending'
          CHECK (status IN ('pending','approved','rejected','cancelled')),
        requested_by      INTEGER,
        approved_by       INTEGER,
        approved_at       TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_pr_job_card ON mes_purchase_requisitions(job_card_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pr_status ON mes_purchase_requisitions(status)`);

    // ─── 2. mes_supplier_purchase_orders ─────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_supplier_purchase_orders (
        id                  SERIAL PRIMARY KEY,
        po_number           VARCHAR(30) NOT NULL UNIQUE,
        pr_id               INTEGER REFERENCES mes_purchase_requisitions(id),
        supplier_name       VARCHAR(255) NOT NULL,
        supplier_contact    VARCHAR(255),
        supplier_email      VARCHAR(255),
        line_items          JSONB NOT NULL DEFAULT '[]'::jsonb,
        total_amount        NUMERIC(14,2),
        currency            VARCHAR(10) DEFAULT 'AED',
        expected_delivery   DATE,
        notes               TEXT,
        status              VARCHAR(30) DEFAULT 'draft'
          CHECK (status IN ('draft','approved','sent','partially_received','received','cancelled')),
        approved_by         INTEGER,
        approved_at         TIMESTAMPTZ,
        sent_at             TIMESTAMPTZ,
        created_by          INTEGER,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_spo_pr ON mes_supplier_purchase_orders(pr_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_spo_status ON mes_supplier_purchase_orders(status)`);

    // ─── 3. mes_stock_receipts ───────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_stock_receipts (
        id                    SERIAL PRIMARY KEY,
        spo_id                INTEGER REFERENCES mes_supplier_purchase_orders(id),
        job_card_id           INTEGER REFERENCES mes_job_cards(id),
        received_quantities   JSONB NOT NULL DEFAULT '[]'::jsonb,
        quality_notes         TEXT,
        received_by           INTEGER,
        received_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_receipt_spo ON mes_stock_receipts(spo_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_receipt_job_card ON mes_stock_receipts(job_card_id)`);

    await client.query('COMMIT');
    logger.info('Migration 016: procurement tables (PR, SPO, stock receipts) created');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration 016 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS mes_stock_receipts CASCADE');
    await client.query('DROP TABLE IF EXISTS mes_supplier_purchase_orders CASCADE');
    await client.query('DROP TABLE IF EXISTS mes_purchase_requisitions CASCADE');
    await client.query('COMMIT');
    logger.info('Migration 016: procurement tables reverted');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
