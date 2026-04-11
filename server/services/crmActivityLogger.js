/**
 * CRM Activity Logger — shared service for logging activities from any module.
 * Used by both CRM routes and PreSales routes to write to crm_activities.
 *
 * Usage:
 *   const { logCRMActivity } = require('../services/crmActivityLogger');
 *   await logCRMActivity({ type: 'call', customerId: 123, repId: 1, repName: 'John', note: 'Discussed pricing' });
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

/**
 * Log a CRM activity.
 * @param {Object} opts
 * @param {string}  opts.type         — 'call','visit','whatsapp','email','follow_up' (CRM types)
 * @param {number}  [opts.customerId] — fp_customer_unified.id
 * @param {number}  [opts.prospectId] — fp_prospects.id
 * @param {number}  [opts.inquiryId]  — mes_presales_inquiries.id
 * @param {number}  opts.repId        — user id of the rep
 * @param {string}  [opts.repName]    — display name
 * @param {string}  [opts.note]       — outcome_note
 * @param {number}  [opts.durationMins] — duration in minutes
 * @returns {Object|null} created row or null on error
 */
async function logCRMActivity({ type, customerId, prospectId, inquiryId, repId, repName, note, durationMins }) {
  try {
    const result = await pool.query(
      `INSERT INTO crm_activities (type, customer_id, prospect_id, inquiry_id, rep_id, rep_name, outcome_note, duration_mins)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        type || 'follow_up',
        customerId || null,
        prospectId || null,
        inquiryId || null,
        repId,
        repName || null,
        note || null,
        durationMins || null,
      ]
    );
    return result.rows[0] || null;
  } catch (err) {
    // Non-critical — don't crash the caller
    logger.warn('crmActivityLogger: failed to log activity', { error: err.message, type, customerId, inquiryId });
    return null;
  }
}

module.exports = { logCRMActivity };
