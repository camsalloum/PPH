/**
 * SLA Breach Checker — runs every 30 minutes to detect overdue QC samples,
 * stale CSE approvals, and stagnant inquiries.
 *
 * A sample is "breached" when:
 *   sent_to_qc_at + SLA_HOURS < NOW()  AND  no analysis submitted for that sample
 *
 * Notifies QC Manager and Manager roles via SSE + email for critical breaches.
 */
const { pool, authPool } = require('../database/config');
const logger = require('../utils/logger');
const { notifyRoleUsers, notifyUsers } = require('../services/notificationService');
const { sendCriticalEventEmail } = require('../services/emailService');

const SLA_HOURS = 48; // configurable SLA threshold

async function checkSlaBreaches() {
  try {
    const result = await pool.query(`
      SELECT s.id AS sample_id, s.sample_number, s.inquiry_id,
             s.sent_to_qc_at, i.inquiry_number, i.customer_name,
             EXTRACT(EPOCH FROM (NOW() - s.sent_to_qc_at)) / 3600 AS hours_elapsed
      FROM mes_presales_samples s
      JOIN mes_presales_inquiries i ON i.id = s.inquiry_id
      LEFT JOIN mes_qc_analyses a ON a.sample_id = s.id
      WHERE s.sent_to_qc_at IS NOT NULL
        AND s.sent_to_qc_at + INTERVAL '${SLA_HOURS} hours' < NOW()
        AND a.id IS NULL
        AND s.status IN ('sent_to_qc', 'received_by_qc', 'testing')
        AND i.division = 'FP'
      ORDER BY s.sent_to_qc_at ASC
    `);

    // Clean up stale notifications for samples no longer breached (deleted, resolved, analysis submitted)
    const activeSampleIds = result.rows.map(r => r.sample_id);
    if (activeSampleIds.length > 0) {
      await pool.query(
        `DELETE FROM mes_notifications
         WHERE type IN ('lab_result_pending', 'sla_breach')
           AND reference_type = 'sample'
           AND reference_id IS NOT NULL
           AND reference_id::text NOT IN (${activeSampleIds.map((_, i) => `$${i + 1}`).join(',')})
           AND is_read = FALSE`,
        activeSampleIds.map(String)
      ).catch(() => {});
    } else {
      // No breaches at all — clear all pending lab result notifications
      await pool.query(
        `DELETE FROM mes_notifications WHERE type IN ('lab_result_pending', 'sla_breach') AND reference_type = 'sample' AND is_read = FALSE`
      ).catch(() => {});
    }

    if (!result.rows.length) return;

    logger.warn(`SLA Breach: ${result.rows.length} samples overdue`);

    for (const row of result.rows) {
      const hoursOver = Math.round(row.hours_elapsed - SLA_HOURS);
      const daysOver = Math.floor(hoursOver / 24);
      const delayText = daysOver >= 1 ? `${daysOver}d overdue` : `${hoursOver}h overdue`;
      // Remove any previous unread notification for this sample before re-creating with fresh delay text
      await pool.query(
        `DELETE FROM mes_notifications
         WHERE type IN ('lab_result_pending', 'sla_breach')
           AND is_read = FALSE
           AND (
             (reference_type = 'sample' AND reference_id::text = $1)
             OR
             (reference_type IS NULL AND message ILIKE $2)
           )`,
        [String(row.sample_id), `%${row.sample_number}%`]
      ).catch(() => {});
      await notifyRoleUsers(['qc_manager', 'manager', 'admin'], {
        type: 'lab_result_pending',
        title: `Lab Result Pending — ${row.customer_name}`,
        message: `Sample ${row.sample_number} (${row.inquiry_number}) has no analysis submitted · ${delayText}`,
        link: `/mes/presales/inquiries/${row.inquiry_id}`,
        referenceType: 'sample',
        referenceId: String(row.sample_id),
      }).catch(() => {});
    }

    // Log breaches to activity log
    for (const row of result.rows) {
      await pool.query(
        `INSERT INTO mes_presales_activity_log (inquiry_id, action, details, user_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [row.inquiry_id, 'sla_breach_detected', JSON.stringify({ sample_id: row.sample_id, sample_number: row.sample_number, hours_elapsed: Math.round(row.hours_elapsed) }), 'System']
      ).catch(() => {});
    }

    // ── Phase 6.2: CSE approval SLA check ────────────────────────────────────
    const CSE_APPROVAL_SLA_HOURS = 72; // 3 days for manager to review
    const cseResult = await pool.query(`
      SELECT c.id, c.cse_number, c.status, c.inquiry_id, c.created_by,
             i.inquiry_number, i.customer_name,
             EXTRACT(EPOCH FROM (NOW() - c.updated_at)) / 3600 AS hours_elapsed
      FROM mes_cse_reports c
      JOIN mes_presales_inquiries i ON i.id = c.inquiry_id
      WHERE c.status IN ('pending_qc_manager', 'pending_production')
        AND c.updated_at + INTERVAL '${CSE_APPROVAL_SLA_HOURS} hours' < NOW()
        AND i.division = 'FP'
      ORDER BY c.updated_at ASC
    `);

    for (const row of cseResult.rows) {
      const hoursOver = Math.round(row.hours_elapsed - CSE_APPROVAL_SLA_HOURS);
      const daysOver = Math.floor(hoursOver / 24);
      const delayText = daysOver >= 1 ? `${daysOver}d overdue` : `${hoursOver}h overdue`;
      const targetRoles = row.status === 'pending_qc_manager'
        ? ['qc_manager', 'manager', 'admin']
        : ['production_manager', 'manager', 'admin'];

      await pool.query(
        `DELETE FROM mes_notifications
         WHERE type = 'cse_approval_overdue' AND is_read = FALSE
           AND reference_type = 'cse' AND reference_id::text = $1`,
        [String(row.id)]
      ).catch(() => {});

      await notifyRoleUsers(targetRoles, {
        type: 'cse_approval_overdue',
        title: `CSE Approval Overdue — ${row.customer_name}`,
        message: `CSE ${row.cse_number} (${row.inquiry_number}) awaiting ${row.status === 'pending_qc_manager' ? 'QC Manager' : 'Production Manager'} approval · ${delayText}`,
        link: `/mes/qc/cse/${row.id}`,
        referenceType: 'cse',
        referenceId: String(row.id),
      }).catch(() => {});
    }

    if (cseResult.rows.length > 0) {
      logger.warn(`SLA Breach: ${cseResult.rows.length} CSE(s) overdue for approval`);
    }

    // ── G12: Email for SLA breaches (once daily, not every 30 min) ───────────
    // Only send email summaries when hour is 8 AM (UTC) to avoid flooding
    const currentHour = new Date().getUTCHours();
    if (currentHour === 8 || currentHour === 4) { // 8AM UTC or 4AM UTC (= 8AM GST)
      const allBreaches = [...result.rows.map(r => ({
        type: 'QC Sample',
        ref: r.sample_number,
        inquiry: r.inquiry_number,
        customer: r.customer_name,
        hours: Math.round(r.hours_elapsed),
      })), ...cseResult.rows.map(r => ({
        type: 'CSE Approval',
        ref: r.cse_number,
        inquiry: r.inquiry_number,
        customer: r.customer_name,
        hours: Math.round(r.hours_elapsed),
      }))];

      if (allBreaches.length > 0) {
        const rows = allBreaches.map(b =>
          `<tr><td style="padding:6px 10px;">${b.type}</td><td style="padding:6px 10px;">${b.ref}</td><td style="padding:6px 10px;">${b.inquiry}</td><td style="padding:6px 10px;">${b.customer}</td><td style="padding:6px 10px;color:#ff4d4f;font-weight:bold;">${Math.floor(b.hours / 24)}d ${b.hours % 24}h</td></tr>`
        ).join('');

        const mgrEmails = await authPool.query(
          `SELECT email FROM users WHERE role IN ('qc_manager','production_manager','manager','admin') AND COALESCE(is_active,TRUE)=TRUE AND email IS NOT NULL`
        );
        const emails = mgrEmails.rows.map(r => r.email).filter(Boolean);
        if (emails.length > 0) {
          await sendCriticalEventEmail({
            to: emails,
            eventType: 'sla_breach_summary',
            title: `SLA Breach Summary — ${allBreaches.length} item(s) overdue`,
            body: `<p>${allBreaches.length} items are past their SLA deadline:</p>
              <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e8e8e8;">
                <thead><tr style="background:#fafafa;"><th style="padding:6px 10px;text-align:left;">Type</th><th style="padding:6px 10px;text-align:left;">Ref</th><th style="padding:6px 10px;text-align:left;">Inquiry</th><th style="padding:6px 10px;text-align:left;">Customer</th><th style="padding:6px 10px;text-align:left;">Overdue</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>`,
            ctaLabel: 'Open Dashboard',
            ctaUrl: `${process.env.APP_URL || ''}/mes/qc/dashboard`,
            color: '#ff4d4f',
          }).catch(e => logger.warn('SLA breach email failed:', e.message));
        }
      }
    }

    // ── G13: Stagnant inquiry check ──────────────────────────────────────────
    const STAGNANT_THRESHOLDS = {
      new_inquiry: 3,
      sar_pending: 7,
      qc_received: 5,
      qc_in_progress: 7,
      cse_pending: 5,
      cse_approved: 14,
      estimation: 10,
      quoted: 14,
      negotiating: 21,
      price_accepted: 7,
      preprod_sample: 14,
      preprod_sent: 21,
    };

    const stagnantResult = await pool.query(`
      SELECT id, inquiry_number, customer_name, inquiry_stage, created_by,
             EXTRACT(DAY FROM (NOW() - stage_changed_at)) AS days_in_stage
      FROM mes_presales_inquiries
      WHERE division = 'FP'
        AND deleted_at IS NULL
        AND inquiry_stage NOT IN ('delivered', 'closed', 'lost', 'on_hold')
        AND stage_changed_at IS NOT NULL
      ORDER BY stage_changed_at ASC
    `);

    let stagnantCount = 0;
    for (const row of stagnantResult.rows) {
      const threshold = STAGNANT_THRESHOLDS[row.inquiry_stage];
      if (!threshold || row.days_in_stage < threshold) continue;
      stagnantCount++;

      // Clean + recreate notification
      await pool.query(
        `DELETE FROM mes_notifications
         WHERE type = 'stagnant_inquiry' AND is_read = FALSE
           AND reference_type = 'inquiry' AND reference_id::text = $1`,
        [String(row.id)]
      ).catch(() => {});

      const daysText = `${Math.round(row.days_in_stage)} days in ${row.inquiry_stage.replace(/_/g, ' ')}`;
      // Notify inquiry owner
      if (row.created_by) {
        await notifyUsers([row.created_by], {
          type: 'stagnant_inquiry',
          title: `Stagnant Inquiry — ${row.customer_name}`,
          message: `${row.inquiry_number} · ${daysText}`,
          link: `/mes/presales/inquiries/${row.id}`,
          referenceType: 'inquiry',
          referenceId: String(row.id),
        }).catch(() => {});
      }
      // Also notify coordinators
      await notifyRoleUsers(['sales_coordinator', 'sales_manager'], {
        type: 'stagnant_inquiry',
        title: `Stagnant Inquiry — ${row.customer_name}`,
        message: `${row.inquiry_number} · ${daysText}`,
        link: `/mes/presales/inquiries/${row.id}`,
        referenceType: 'inquiry',
        referenceId: String(row.id),
      }, { excludeUserIds: row.created_by ? [row.created_by] : [] }).catch(() => {});
    }

    if (stagnantCount > 0) {
      logger.warn(`Stagnant inquiries: ${stagnantCount} past threshold`);
    }

  } catch (err) {
    logger.error('SLA Breach Checker failed:', err);
  }
}

module.exports = { checkSlaBreaches, SLA_HOURS };
