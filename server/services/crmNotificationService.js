/**
 * CRM Notification Service — triggers email + in-app notifications for CRM events.
 *
 * Events:
 *   - Task assigned to another rep → email + in-app
 *   - Deal moved to won/lost → notify manager
 *   - Prospect approved/rejected → notify assigned rep
 *   - Overdue task count → returned via my-stats for badge
 */

const { pool, authPool } = require('../database/config');
const logger = require('../utils/logger');
const { sendEmail } = require('./emailService');
const { createNotification, notifyRoleUsers } = require('./notificationService');

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://app.propackhub.com';

/**
 * Notify a rep when a task is assigned to them by someone else.
 */
async function notifyTaskAssigned({ task, assigneeId, assignerName }) {
  if (!assigneeId) return;
  try {
    // In-app notification
    await createNotification({
      userId: assigneeId,
      type: 'crm_task_assigned',
      title: `New task: ${task.title}`,
      message: `${assignerName || 'Someone'} assigned you a task due ${task.due_date || 'soon'}`,
      link: '/crm',
      referenceType: 'crm_task',
      referenceId: task.id,
    });

    // Email
    const userRes = await authPool.query('SELECT email, full_name FROM users WHERE id = $1', [assigneeId]);
    const user = userRes.rows[0];
    if (user?.email) {
      await sendEmail({
        to: user.email,
        subject: `CRM Task Assigned: ${task.title}`,
        html: `
          <h3>New Task Assigned</h3>
          <p><strong>${task.title}</strong></p>
          <p>Due: ${task.due_date || 'Not set'}</p>
          <p>Priority: ${task.priority || 'medium'}</p>
          <p>Assigned by: ${assignerName || 'System'}</p>
          ${task.description ? `<p>Details: ${task.description}</p>` : ''}
          <p><a href="${APP_URL}/crm">Open CRM</a></p>
        `,
      });
    }
  } catch (err) {
    logger.warn('crmNotificationService.notifyTaskAssigned failed', err.message);
  }
}

/**
 * Notify managers when a deal moves to won or lost.
 */
async function notifyDealClosed({ deal, stage, repName, closeReason }) {
  try {
    const stageLabel = stage === 'won' ? '🏆 Won' : '❌ Lost';
    await notifyRoleUsers(
      ['manager', 'sales_manager'],
      {
        type: 'crm_deal_closed',
        title: `Deal ${stageLabel}: ${deal.title}`,
        message: `${repName || 'A rep'} moved "${deal.title}" to ${stage}. ${closeReason ? 'Reason: ' + closeReason : ''}`,
        link: '/crm',
        referenceType: 'crm_deal',
        referenceId: deal.id,
      }
    );
  } catch (err) {
    logger.warn('crmNotificationService.notifyDealClosed failed', err.message);
  }
}

/**
 * Notify the assigned sales rep when their prospect is approved or rejected.
 */
async function notifyProspectStatusChange({ prospect, newStatus, changedByName }) {
  if (!prospect?.sales_rep_group) return;
  try {
    // Find the rep user_id from the group name
    const groupRes = await pool.query(
      `SELECT id FROM sales_rep_groups WHERE LOWER(TRIM(group_name)) = LOWER(TRIM($1)) LIMIT 1`,
      [prospect.sales_rep_group]
    );
    if (groupRes.rows.length === 0) return;

    const repRes = await authPool.query(
      `SELECT user_id FROM crm_sales_reps WHERE group_id = $1`,
      [groupRes.rows[0].id]
    );
    const repUserIds = repRes.rows.map(r => r.user_id).filter(Boolean);
    if (repUserIds.length === 0) return;

    const statusLabel = newStatus === 'approved' ? '✅ Approved' : newStatus === 'rejected' ? '❌ Rejected' : newStatus;

    for (const userId of repUserIds) {
      await createNotification({
        userId,
        type: 'crm_prospect_status',
        title: `Prospect ${statusLabel}: ${prospect.customer_name}`,
        message: `${changedByName || 'Management'} ${newStatus} prospect "${prospect.customer_name}"`,
        link: '/crm/prospects',
        referenceType: 'prospect',
        referenceId: prospect.id,
      });
    }
  } catch (err) {
    logger.warn('crmNotificationService.notifyProspectStatusChange failed', err.message);
  }
}

/**
 * Notify rep(s) when a customer or prospect is assigned to their group.
 */
async function notifyLeadAssigned({ entityType, entityName, entityId, groupId, assignerName }) {
  if (!groupId) return;
  try {
    const repRes = await authPool.query(
      'SELECT user_id FROM crm_sales_reps WHERE group_id = $1',
      [groupId]
    );
    const repUserIds = repRes.rows.map(r => r.user_id).filter(Boolean);
    if (repUserIds.length === 0) return;

    const label = entityType === 'customer' ? 'Customer' : 'Prospect';
    for (const userId of repUserIds) {
      await createNotification({
        userId,
        type: 'crm_lead_assigned',
        title: `${label} assigned: ${entityName}`,
        message: `${assignerName || 'Management'} assigned ${label.toLowerCase()} "${entityName}" to your group`,
        link: entityType === 'customer' ? `/crm/customers/${entityId}` : '/crm/prospects',
        referenceType: entityType,
        referenceId: entityId,
      });
    }
  } catch (err) {
    logger.warn('crmNotificationService.notifyLeadAssigned failed', err.message);
  }
}

/**
 * Notify the assigned rep when their prospect converts to a real customer.
 */
async function notifyProspectConverted({ prospect }) {
  if (!prospect?.sales_rep_group) return;
  try {
    const groupRes = await pool.query(
      `SELECT id FROM sales_rep_groups WHERE LOWER(TRIM(group_name)) = LOWER(TRIM($1)) LIMIT 1`,
      [prospect.sales_rep_group]
    );
    if (groupRes.rows.length === 0) return;

    const repRes = await authPool.query(
      `SELECT user_id FROM crm_sales_reps WHERE group_id = $1`,
      [groupRes.rows[0].id]
    );
    const repUserIds = repRes.rows.map(r => r.user_id).filter(Boolean);

    for (const userId of repUserIds) {
      await createNotification({
        userId,
        type: 'crm_prospect_converted',
        title: `🎉 Prospect converted: ${prospect.customer_name}`,
        message: `"${prospect.customer_name}" placed their first order and is now an active customer!`,
        link: '/crm/prospects',
        referenceType: 'prospect',
        referenceId: prospect.prospect_id || prospect.id,
      });
    }
  } catch (err) {
    logger.warn('crmNotificationService.notifyProspectConverted failed', err.message);
  }
}

module.exports = {
  notifyTaskAssigned,
  notifyDealClosed,
  notifyProspectStatusChange,
  notifyLeadAssigned,
  notifyProspectConverted,
};
