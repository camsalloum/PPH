/**
 * MES Notification Service
 *
 * Consolidates common notification + activity logging patterns used across
 * presales route modules into a single reusable service.
 *
 * Usage:
 *   const { standardNotify, notifyStageChange } = require('../../services/mesNotificationService');
 */

const logger = require('../../config/logger');

/**
 * Send a standard notification to a set of users + optionally to role-based users,
 * then log the activity on the inquiry.
 *
 * @param {object}   opts
 * @param {number}   opts.inquiryId        – parent inquiry ID
 * @param {string}   opts.eventType        – e.g. 'quotation_approved', 'qc_submitted'
 * @param {string}   opts.title            – notification title
 * @param {string}   opts.message          – notification body
 * @param {string}   [opts.link]           – deep link, e.g. `/crm/inquiries/${id}`
 * @param {number[]} [opts.userIds=[]]     – direct user IDs to notify
 * @param {string[]} [opts.roles=[]]       – role names to notify
 * @param {object}   [opts.extraData={}]   – extra data for activity log
 * @param {object}   opts.user             – acting user (req.user)
 * @param {object}   [opts.client]         – PG client (optional, for transactional logging)
 * @param {Function} opts.notifyUsers      – notifyUsers function from notificationService
 * @param {Function} [opts.notifyRoleUsers] – notifyRoleUsers function (optional)
 * @param {Function} opts.logActivity      – logActivity function from _helpers
 */
async function standardNotify(opts) {
  const {
    inquiryId, eventType, title, message, link,
    userIds = [], roles = [], extraData = {},
    user, client,
    notifyUsers, notifyRoleUsers, logActivity,
  } = opts;

  // 1. Log activity
  try {
    await logActivity(inquiryId, eventType, extraData, user, client);
  } catch (err) {
    logger.warn(`MES Notify: activity log failed for ${eventType}:`, err.message);
  }

  // 2. Notify specific users
  if (userIds.length > 0 && notifyUsers) {
    try {
      await notifyUsers(userIds, {
        type: eventType,
        title,
        message,
        link: link || `/crm/inquiries/${inquiryId}`,
        referenceType: 'inquiry',
        referenceId: inquiryId,
      }, { excludeUserIds: [user?.id] });
    } catch (err) {
      logger.warn(`MES Notify: user notification failed for ${eventType}:`, err.message);
    }
  }

  // 3. Notify role-based users
  if (roles.length > 0 && notifyRoleUsers) {
    try {
      await notifyRoleUsers(roles, {
        type: eventType,
        title,
        message,
        link: link || `/crm/inquiries/${inquiryId}`,
        referenceType: 'inquiry',
        referenceId: inquiryId,
      }, { excludeUserIds: [user?.id] });
    } catch (err) {
      logger.warn(`MES Notify: role notification failed for ${eventType}:`, err.message);
    }
  }
}

/**
 * Convenience: notify about a lifecycle stage change.
 *
 * @param {object} opts  – same as standardNotify but auto-builds title/message
 * @param {string} opts.inquiryNumber – e.g. 'INQ-FP-2026-00001'
 * @param {string} opts.fromStage
 * @param {string} opts.toStage
 */
async function notifyStageChange(opts) {
  const { inquiryNumber, fromStage, toStage, ...rest } = opts;
  await standardNotify({
    ...rest,
    title: `${inquiryNumber} — stage changed`,
    message: `${fromStage} → ${toStage}`,
    extraData: { ...rest.extraData, from_stage: fromStage, to_stage: toStage },
  });
}

module.exports = {
  standardNotify,
  notifyStageChange,
};
