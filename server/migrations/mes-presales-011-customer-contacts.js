/**
 * Migration: Customer Contact Management — multi-contact support
 *
 * Table: fp_customer_contacts — multiple contacts per customer
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS fp_customer_contacts (
        id              SERIAL PRIMARY KEY,
        customer_id     INTEGER NOT NULL,
        contact_name    VARCHAR(255) NOT NULL,
        designation     VARCHAR(150),
        email           VARCHAR(255),
        phone           VARCHAR(50),
        whatsapp        VARCHAR(50),
        is_primary      BOOLEAN DEFAULT false,
        is_active       BOOLEAN DEFAULT true,
        notes           TEXT,
        created_by      INTEGER,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_cust_contacts_cid ON fp_customer_contacts(customer_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cust_contacts_active ON fp_customer_contacts(customer_id, is_active)`);

    await client.query('COMMIT');
    logger.info('Migration 011: fp_customer_contacts table created');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration 011 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  await pool.query('DROP TABLE IF EXISTS fp_customer_contacts CASCADE');
  logger.info('Migration 011: fp_customer_contacts dropped');
}

module.exports = { up, down };
