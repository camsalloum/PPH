/**
 * Migration: Add sales_rep_group_id to employees table and update crm_sales_reps VIEW
 * Enables direct group mapping instead of fuzzy ILIKE name matching.
 * NOTE: crm_sales_reps is a VIEW in the AUTH database (authPool) over employees.
 */

const { authPool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await authPool.connect();
  try {
    await client.query('BEGIN');

    // Add column to the underlying employees table
    await client.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS sales_rep_group_id INTEGER`);

    // Drop and recreate the crm_sales_reps VIEW to include the new column
    // (CREATE OR REPLACE cannot reorder/add columns in existing views)
    await client.query(`DROP VIEW IF EXISTS crm_sales_reps`);
    await client.query(`
      CREATE VIEW crm_sales_reps AS
      SELECT
        e.id AS employee_id,
        e.full_name,
        e.user_id,
        u.email,
        d.name AS designation,
        d.department,
        e.group_members,
        e.sales_rep_group_id,
        CASE WHEN e.group_members IS NOT NULL THEN 'GROUP' ELSE 'INDIVIDUAL' END AS type
      FROM employees e
      JOIN users u ON e.user_id = u.id
      JOIN designations d ON e.designation_id = d.id
      WHERE e.status = 'Active'
        AND e.user_id IS NOT NULL
        AND LOWER(d.department) = 'sales'
    `);

    await client.query('COMMIT');
    logger.info('Migration crm-007: employees.sales_rep_group_id added, crm_sales_reps VIEW updated');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration crm-007 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await authPool.connect();
  try {
    await client.query('BEGIN');
    // Restore original VIEW without sales_rep_group_id
    await client.query(`
      CREATE OR REPLACE VIEW crm_sales_reps AS
      SELECT
        e.id AS employee_id,
        e.full_name,
        e.user_id,
        u.email,
        d.name AS designation,
        d.department,
        e.group_members,
        CASE WHEN e.group_members IS NOT NULL THEN 'GROUP' ELSE 'INDIVIDUAL' END AS type
      FROM employees e
      JOIN users u ON e.user_id = u.id
      JOIN designations d ON e.designation_id = d.id
      WHERE e.status = 'Active'
        AND e.user_id IS NOT NULL
        AND LOWER(d.department) = 'sales'
    `);
    await client.query(`ALTER TABLE employees DROP COLUMN IF EXISTS sales_rep_group_id`);
    await client.query('COMMIT');
    logger.info('Migration crm-007: rolled back');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
