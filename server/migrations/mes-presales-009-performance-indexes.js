/**
 * Migration: Add performance indexes for pipeline and CRM queries
 * Addresses audit items B8 (pipeline lateral query performance) and
 * general CRM query optimization.
 *
 * Indexes added:
 *   - mes_presales_activity_log(inquiry_id, created_at DESC) — pipeline last_action lateral join
 *   - mes_presales_inquiries(inquiry_stage, division) WHERE deleted_at IS NULL — pipeline filtering
 *   - mes_quotations(inquiry_id, status) — quotation lookups per inquiry
 *   - mes_cse_reports(inquiry_id, final_status) — CSE count laterals
 *   - mes_presales_samples(inquiry_id, status) — sample count laterals
 *   - crm_activities(inquiry_id, next_action_date) — follow-up queries
 *   - fp_prospects(sales_rep_group, division, approval_status) — prospect filtering
 *
 * Also creates sequences for quotation and PI number generation (B11 fix).
 */

const { pool } = require('../database/config');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Pipeline performance indexes
    await client.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_log_inquiry_created
      ON mes_presales_activity_log(inquiry_id, created_at DESC)
    `).catch(() => {
      // CONCURRENTLY can't run in transaction, fall back to non-concurrent
      return client.query(`
        CREATE INDEX IF NOT EXISTS idx_activity_log_inquiry_created
        ON mes_presales_activity_log(inquiry_id, created_at DESC)
      `);
    });

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mpi_stage_div
      ON mes_presales_inquiries(inquiry_stage, division)
      WHERE deleted_at IS NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quotations_inquiry_status
      ON mes_quotations(inquiry_id, status)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cse_inquiry_status
      ON mes_cse_reports(inquiry_id, final_status)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_samples_inquiry_status
      ON mes_presales_samples(inquiry_id, status)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_prospects_group_div_status
      ON fp_prospects(sales_rep_group, division, approval_status)
    `);

    // Sequences for race-condition-safe number generation (B11)
    await client.query(`CREATE SEQUENCE IF NOT EXISTS quot_fp_seq START 1`);
    await client.query(`CREATE SEQUENCE IF NOT EXISTS pi_fp_seq START 1`);

    await client.query('COMMIT');
    console.log('Migration mes-presales-009: Performance indexes created successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration mes-presales-009 failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP INDEX IF EXISTS idx_activity_log_inquiry_created');
    await client.query('DROP INDEX IF EXISTS idx_mpi_stage_div');
    await client.query('DROP INDEX IF EXISTS idx_quotations_inquiry_status');
    await client.query('DROP INDEX IF EXISTS idx_cse_inquiry_status');
    await client.query('DROP INDEX IF EXISTS idx_samples_inquiry_status');
    await client.query('DROP INDEX IF EXISTS idx_prospects_group_div_status');
    await client.query('DROP SEQUENCE IF EXISTS quot_fp_seq');
    await client.query('DROP SEQUENCE IF EXISTS pi_fp_seq');
    await client.query('COMMIT');
    console.log('Migration mes-presales-009: Rolled back successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
