/**
 * CRM Daily Digest Job
 *
 * Sends a daily email to each sales rep summarizing:
 *   - Overdue tasks
 *   - Tasks due today
 *   - Follow-up activities scheduled for today
 *
 * Designed to run once per day via setInterval or external cron.
 */

const { pool, authPool } = require('../database/config');
const logger = require('../utils/logger');
const { sendEmail } = require('../services/emailService');

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://app.propackhub.com';

/**
 * Build and send digest emails for all reps with pending items.
 */
async function runDailyDigest() {
  logger.info('CRM Daily Digest: starting...');
  try {
    // 1. Overdue + due-today tasks grouped by assignee
    const taskRes = await pool.query(`
      SELECT
        t.assignee_id,
        t.title,
        t.due_date,
        t.priority,
        CASE WHEN t.due_date < CURRENT_DATE THEN 'overdue' ELSE 'today' END AS urgency
      FROM crm_tasks t
      WHERE t.status = 'open'
        AND t.due_date <= CURRENT_DATE
        AND t.assignee_id IS NOT NULL
      ORDER BY t.assignee_id, t.due_date
    `);

    // 2. Today's follow-up activities
    const actRes = await pool.query(`
      SELECT
        a.rep_id,
        a.outcome_note,
        a.type,
        c.customer_name
      FROM crm_activities a
      LEFT JOIN fp_customer_unified c ON c.customer_id = a.customer_id
      WHERE a.next_action_date = CURRENT_DATE
        AND a.rep_id IS NOT NULL
      ORDER BY a.rep_id
    `);

    // Group by user
    const byUser = {};

    for (const row of taskRes.rows) {
      const uid = row.assignee_id;
      if (!byUser[uid]) byUser[uid] = { overdue: [], today: [], followUps: [] };
      if (row.urgency === 'overdue') byUser[uid].overdue.push(row);
      else byUser[uid].today.push(row);
    }

    for (const row of actRes.rows) {
      const uid = row.rep_id;
      if (!byUser[uid]) byUser[uid] = { overdue: [], today: [], followUps: [] };
      byUser[uid].followUps.push(row);
    }

    const userIds = Object.keys(byUser).map(Number);
    if (userIds.length === 0) {
      logger.info('CRM Daily Digest: no pending items for any rep');
      return;
    }

    // Fetch emails
    const usersRes = await authPool.query(
      `SELECT id, email, full_name FROM users WHERE id = ANY($1)`,
      [userIds]
    );
    const userMap = {};
    for (const u of usersRes.rows) userMap[u.id] = u;

    // Send emails
    let sent = 0;
    for (const [uid, data] of Object.entries(byUser)) {
      const user = userMap[Number(uid)];
      if (!user?.email) continue;

      const html = buildDigestHtml(user.full_name, data);
      try {
        await sendEmail({
          to: user.email,
          subject: `CRM Daily Digest — ${data.overdue.length} overdue, ${data.today.length} due today`,
          html,
        });
        sent++;
      } catch (err) {
        logger.warn(`CRM Daily Digest: failed to send to ${user.email}`, err.message);
      }
    }

    logger.info(`CRM Daily Digest: sent ${sent} emails`);
  } catch (err) {
    logger.error('CRM Daily Digest: job failed', err);
  }
}

/**
 * Build HTML for the digest email.
 */
function buildDigestHtml(name, { overdue, today, followUps }) {
  const taskRow = (t) =>
    `<tr>
      <td style="padding:4px 8px">${t.title}</td>
      <td style="padding:4px 8px">${t.due_date || '—'}</td>
      <td style="padding:4px 8px">${t.priority || 'medium'}</td>
    </tr>`;

  const overdueSection = overdue.length > 0
    ? `<h3 style="color:#f5222d">⚠️ Overdue Tasks (${overdue.length})</h3>
       <table border="1" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
         <tr style="background:#fff1f0"><th style="padding:4px 8px">Task</th><th style="padding:4px 8px">Due</th><th style="padding:4px 8px">Priority</th></tr>
         ${overdue.map(taskRow).join('')}
       </table>`
    : '';

  const todaySection = today.length > 0
    ? `<h3 style="color:#1890ff">📋 Due Today (${today.length})</h3>
       <table border="1" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
         <tr style="background:#e6f7ff"><th style="padding:4px 8px">Task</th><th style="padding:4px 8px">Due</th><th style="padding:4px 8px">Priority</th></tr>
         ${today.map(taskRow).join('')}
       </table>`
    : '';

  const followUpSection = followUps.length > 0
    ? `<h3 style="color:#fa8c16">📞 Follow-ups Today (${followUps.length})</h3>
       <ul>${followUps.map(f => `<li>${f.type || 'follow_up'}: ${f.customer_name || 'N/A'} — ${f.outcome_note || ''}</li>`).join('')}</ul>`
    : '';

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px">
      <h2>Good morning, ${name || 'Team'}!</h2>
      <p>Here's your CRM summary for today:</p>
      ${overdueSection}
      ${todaySection}
      ${followUpSection}
      ${!overdue.length && !today.length && !followUps.length ? '<p>✅ All clear — no pending items!</p>' : ''}
      <p style="margin-top:16px"><a href="${APP_URL}/crm">Open CRM Dashboard</a></p>
    </div>
  `;
}

module.exports = { runDailyDigest };
