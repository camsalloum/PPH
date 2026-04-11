/**
 * CRM Service — shared helpers used across CRM route files.
 *
 * Extracted from server/routes/crm/index.js to support the route split.
 *
 * Exports:
 *   - resolveRepGroup(userId)  — maps a user to their sales rep group
 *   - getCustomerSearchNames(customerCode, customerName) — gets all names for a customer (including merged originals)
 */

const { pool, authPool } = require('../database/config');
const logger = require('../utils/logger');

/**
 * Resolve a user's sales rep group.
 *
 * Uses direct ID lookup when `sales_rep_group_id` is populated on the
 * crm_sales_reps record; falls back to fuzzy ILIKE matching otherwise.
 *
 * @param {number} userId
 * @returns {Object|null} { fullName, firstName, type, groupMembers, groupId, groupName } or null
 */
async function resolveRepGroup(userId) {
  const repRes = await authPool.query(
    `SELECT full_name, group_members, type, sales_rep_group_id FROM crm_sales_reps WHERE user_id = $1`,
    [userId]
  );
  if (repRes.rows.length === 0) return null;
  const rep = repRes.rows[0];
  const firstName = rep.full_name.split(' ')[0];

  // Direct mapping first — no fuzzy matching needed
  if (rep.sales_rep_group_id) {
    const grpRes = await pool.query(
      `SELECT id, group_name FROM sales_rep_groups WHERE id = $1`,
      [rep.sales_rep_group_id]
    );
    if (grpRes.rows.length) {
      return {
        fullName:     rep.full_name,
        firstName,
        type:         rep.type,
        groupMembers: rep.group_members,
        groupId:      grpRes.rows[0].id,
        groupName:    grpRes.rows[0].group_name,
      };
    }
  }

  // Fuzzy fallback — REMOVE once all reps have sales_rep_group_id populated
  const grpRes = await pool.query(
    `SELECT id, group_name FROM sales_rep_groups WHERE division = 'FP' AND group_name ILIKE $1 ORDER BY id LIMIT 1`,
    [`%${firstName}%`]
  );
  return {
    fullName:     rep.full_name,
    firstName,
    type:         rep.type,
    groupMembers: rep.group_members,
    groupId:      grpRes.rows[0]?.id   ?? null,
    groupName:    grpRes.rows[0]?.group_name ?? rep.full_name,
  };
}

/**
 * Get all customer names for a customer (including merged originals).
 * Returns array of lowercased, trimmed customer names to search in fp_data_excel.
 *
 * @param {string} customerCode
 * @param {string} customerName
 * @returns {string[]}
 */
async function getCustomerSearchNames(customerCode, customerName) {
  const names = [customerName.toLowerCase().trim()];

  try {
    // Check if this customer has merge rules
    const mergeResult = await pool.query(`
      SELECT original_customers 
      FROM fp_division_customer_merge_rules 
      WHERE master_customer_code = $1 AND is_active = true
    `, [customerCode]);

    if (mergeResult.rows.length > 0 && mergeResult.rows[0].original_customers) {
      const originals = mergeResult.rows[0].original_customers;
      for (const orig of originals) {
        names.push(orig.toLowerCase().trim());
      }
    }
  } catch (err) {
    logger.warn('Could not fetch merge rules:', err.message);
  }

  return names;
}

module.exports = { resolveRepGroup, getCustomerSearchNames };
