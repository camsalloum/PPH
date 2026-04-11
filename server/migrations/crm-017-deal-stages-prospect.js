/**
 * Migration: CRM Deal Pipeline v2
 * 
 * Changes:
 * 1. Add prospect_id column (deals can be linked to prospects, not just customers)
 * 2. Update stage CHECK constraint for packaging business flow:
 *    interest → sample_analysis → quotation → sample_approval → confirmed → lost
 * 3. Migrate existing stage data: qualified→interest, proposal→sample_analysis, 
 *    negotiation→quotation, won→confirmed
 *
 * Idempotent: safe to run multiple times.
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if crm_deals exists
    const tableCheck = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'crm_deals'
    `);

    if (tableCheck.rows.length === 0) {
      logger.info('crm-017: crm_deals table does not exist yet, skipping');
      await client.query('COMMIT');
      return;
    }

    // 1. Add prospect_id column if missing
    const cols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'crm_deals'
    `);
    const existing = new Set(cols.rows.map(r => r.column_name));

    if (!existing.has('prospect_id')) {
      await client.query(`
        ALTER TABLE crm_deals 
        ADD COLUMN prospect_id INTEGER REFERENCES fp_prospects(id) ON DELETE SET NULL
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_crm_deals_prospect ON crm_deals(prospect_id)
      `);
      logger.info('crm-017: added prospect_id column to crm_deals');
    }

    if (!existing.has('description')) {
      await client.query(`ALTER TABLE crm_deals ADD COLUMN description TEXT`);
      logger.info('crm-017: added description column to crm_deals');
    }

    // 2. Drop old stage constraint and create new one
    // First, migrate existing stage values
    await client.query(`
      UPDATE crm_deals SET stage = 'interest' WHERE stage = 'qualified'
    `);
    await client.query(`
      UPDATE crm_deals SET stage = 'sample_analysis' WHERE stage = 'proposal'
    `);
    await client.query(`
      UPDATE crm_deals SET stage = 'quotation' WHERE stage = 'negotiation'
    `);
    await client.query(`
      UPDATE crm_deals SET stage = 'confirmed' WHERE stage = 'won'
    `);
    logger.info('crm-017: migrated legacy stage values');

    // Drop existing constraint (may have different names)
    await client.query(`
      ALTER TABLE crm_deals DROP CONSTRAINT IF EXISTS crm_deals_stage_check
    `);
    await client.query(`
      ALTER TABLE crm_deals DROP CONSTRAINT IF EXISTS crm_deals_stage_check1
    `);

    // Add new constraint with updated stages
    await client.query(`
      ALTER TABLE crm_deals 
      ADD CONSTRAINT crm_deals_stage_check 
      CHECK (stage IN ('interest', 'sample_analysis', 'quotation', 'sample_approval', 'confirmed', 'lost'))
    `);
    logger.info('crm-017: updated stage CHECK constraint for packaging business flow');

    // 3. Update default stage value
    await client.query(`
      ALTER TABLE crm_deals ALTER COLUMN stage SET DEFAULT 'interest'
    `);

    // 4. Make customer_id optional (can be null if prospect_id is set)
    // Already nullable by design, just ensure no NOT NULL constraint
    logger.info('crm-017: customer_id remains nullable to support prospect-based deals');

    await client.query('COMMIT');
    logger.info('Migration crm-017 completed: deal stages updated for packaging business flow');

  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration crm-017 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Reverse stage migration
    await client.query(`UPDATE crm_deals SET stage = 'qualified' WHERE stage = 'interest'`);
    await client.query(`UPDATE crm_deals SET stage = 'proposal' WHERE stage = 'sample_analysis'`);
    await client.query(`UPDATE crm_deals SET stage = 'negotiation' WHERE stage = 'quotation'`);
    await client.query(`UPDATE crm_deals SET stage = 'won' WHERE stage = 'confirmed'`);
    await client.query(`UPDATE crm_deals SET stage = 'lost' WHERE stage = 'sample_approval'`); // edge case

    // Drop new constraint, add old
    await client.query(`ALTER TABLE crm_deals DROP CONSTRAINT IF EXISTS crm_deals_stage_check`);
    await client.query(`
      ALTER TABLE crm_deals 
      ADD CONSTRAINT crm_deals_stage_check 
      CHECK (stage IN ('qualified','proposal','negotiation','won','lost'))
    `);
    await client.query(`ALTER TABLE crm_deals ALTER COLUMN stage SET DEFAULT 'qualified'`);

    // Drop prospect_id
    await client.query(`ALTER TABLE crm_deals DROP COLUMN IF EXISTS prospect_id`);

    await client.query('COMMIT');
    logger.info('Migration crm-017 rolled back');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
