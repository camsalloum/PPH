/**
 * Migration: crm_customer_packaging_profile table
 * Stores FP-specific packaging profile data per customer for cross-sell identification.
 * Idempotent: creates table if missing, adds missing columns if table exists.
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tableCheck = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'crm_customer_packaging_profile'
    `);

    if (tableCheck.rows.length === 0) {
      await client.query(`
        CREATE TABLE crm_customer_packaging_profile (
          id                  SERIAL PRIMARY KEY,
          customer_id         INTEGER NOT NULL UNIQUE REFERENCES fp_customer_unified(customer_id),
          current_suppliers   TEXT,
          packaging_categories TEXT,
          converting_equipment TEXT,
          food_safety_certs   TEXT,
          annual_volume_est   VARCHAR(100),
          sustainability_reqs TEXT,
          created_at          TIMESTAMPTZ DEFAULT NOW(),
          updated_at          TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      logger.info('Migration crm-010: crm_customer_packaging_profile table created');
    } else {
      const cols = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'crm_customer_packaging_profile'
      `);
      const existing = new Set(cols.rows.map(r => r.column_name));

      if (!existing.has('current_suppliers'))    await client.query(`ALTER TABLE crm_customer_packaging_profile ADD COLUMN current_suppliers TEXT`);
      if (!existing.has('packaging_categories')) await client.query(`ALTER TABLE crm_customer_packaging_profile ADD COLUMN packaging_categories TEXT`);
      if (!existing.has('converting_equipment')) await client.query(`ALTER TABLE crm_customer_packaging_profile ADD COLUMN converting_equipment TEXT`);
      if (!existing.has('food_safety_certs'))    await client.query(`ALTER TABLE crm_customer_packaging_profile ADD COLUMN food_safety_certs TEXT`);
      if (!existing.has('annual_volume_est'))    await client.query(`ALTER TABLE crm_customer_packaging_profile ADD COLUMN annual_volume_est VARCHAR(100)`);
      if (!existing.has('sustainability_reqs'))  await client.query(`ALTER TABLE crm_customer_packaging_profile ADD COLUMN sustainability_reqs TEXT`);

      logger.info('Migration crm-010: crm_customer_packaging_profile columns verified/added');
    }

    await client.query('COMMIT');
    logger.info('Migration crm-010: complete');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration crm-010 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  await pool.query('DROP TABLE IF EXISTS crm_customer_packaging_profile CASCADE');
  logger.info('Migration crm-010: crm_customer_packaging_profile dropped');
}

module.exports = { up, down };
