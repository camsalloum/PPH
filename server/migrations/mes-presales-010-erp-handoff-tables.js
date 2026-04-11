/**
 * Migration: ERP / Production Plan Handoff tables
 * Creates tables for order handoff tracking (DB only, no Oracle connection yet).
 *
 * Tables:
 *   mes_order_handoffs       — one row per confirmed PI → production handoff
 *   mes_production_plans     — production planning entries linked to handoffs
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Order Handoffs ─────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_order_handoffs (
        id                SERIAL PRIMARY KEY,
        inquiry_id        INTEGER NOT NULL REFERENCES mes_presales_inquiries(id),
        pi_id             INTEGER REFERENCES mes_proforma_invoices(id),
        customer_name     VARCHAR(255) NOT NULL,
        customer_country  VARCHAR(100),
        product_groups    JSONB DEFAULT '[]',
        total_qty_kgs     NUMERIC(14,2),
        total_amount      NUMERIC(14,2),
        currency          VARCHAR(10) DEFAULT 'USD',
        po_number         VARCHAR(100),
        po_date           DATE,
        so_number         VARCHAR(100),          -- future: Oracle SO#
        erp_status        VARCHAR(30) DEFAULT 'pending',
                          -- pending | submitted | confirmed | failed
        handoff_notes     TEXT,
        handed_off_by     INTEGER,
        handed_off_at     TIMESTAMPTZ DEFAULT NOW(),
        erp_submitted_at  TIMESTAMPTZ,
        erp_confirmed_at  TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── Production Plans ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_production_plans (
        id                SERIAL PRIMARY KEY,
        handoff_id        INTEGER NOT NULL REFERENCES mes_order_handoffs(id),
        inquiry_id        INTEGER NOT NULL REFERENCES mes_presales_inquiries(id),
        product_group     VARCHAR(150),
        planned_qty_kgs   NUMERIC(14,2),
        planned_start     DATE,
        planned_end       DATE,
        priority          VARCHAR(20) DEFAULT 'normal',
        status            VARCHAR(30) DEFAULT 'draft',
                          -- draft | scheduled | in_production | completed | cancelled
        assigned_to       VARCHAR(255),
        notes             TEXT,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_handoffs_inquiry ON mes_order_handoffs(inquiry_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_handoffs_erp_status ON mes_order_handoffs(erp_status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_prod_plans_handoff ON mes_production_plans(handoff_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_prod_plans_status ON mes_production_plans(status)`);

    await client.query('COMMIT');
    logger.info('Migration 010: ERP handoff tables created');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration 010 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  await pool.query('DROP TABLE IF EXISTS mes_production_plans CASCADE');
  await pool.query('DROP TABLE IF EXISTS mes_order_handoffs CASCADE');
  logger.info('Migration 010: ERP handoff tables dropped');
}

module.exports = { up, down };
