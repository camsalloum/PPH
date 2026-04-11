/**
 * Presales Analytics — lost-reasons, SLA overview, QC analytics, audit trail, admin audit
 */
const {
  pool, authenticate, logger,
  DIVISION,
  isAdminOrMgmt, canAccessQCDashboard,
} = require('./_helpers');

module.exports = function (router) {

  // ── GET /analytics/lost-reasons ────────────────────────────────────────────
  router.get('/analytics/lost-reasons', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) {
        return res.status(403).json({ success: false, error: 'Management access required' });
      }

      const from = req.query.from || null;
      const to = req.query.to || null;

      const dateFilter = from && to
        ? `AND i.closed_at BETWEEN $1 AND $2`
        : from
          ? `AND i.closed_at >= $1`
          : to
            ? `AND i.closed_at <= $1`
            : '';

      const dateParams = [from, to].filter(Boolean);

      const byCategoryRes = await pool.query(
        `SELECT
           COALESCE(i.lost_reason_category, 'Uncategorized') AS category,
           COUNT(*) AS count,
           ARRAY_AGG(DISTINCT i.lost_reason) FILTER (WHERE i.lost_reason IS NOT NULL) AS reasons
         FROM mes_presales_inquiries i
         WHERE i.status = 'lost' AND i.division = '${DIVISION}'
         ${dateFilter}
         GROUP BY COALESCE(i.lost_reason_category, 'Uncategorized')
         ORDER BY count DESC`,
        dateParams
      );

      const byCompetitorRes = await pool.query(
        `SELECT
           COALESCE(i.lost_to_competitor, 'Unknown') AS competitor,
           COUNT(*) AS count
         FROM mes_presales_inquiries i
         WHERE i.status = 'lost' AND i.division = '${DIVISION}'
         ${dateFilter}
         GROUP BY COALESCE(i.lost_to_competitor, 'Unknown')
         ORDER BY count DESC`,
        dateParams
      );

      const winLossRes = await pool.query(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'won') AS won,
           COUNT(*) FILTER (WHERE status = 'lost') AS lost,
           COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
           COUNT(*) FILTER (WHERE status = 'new') AS new_inquiries
         FROM mes_presales_inquiries
         WHERE division = '${DIVISION}'
         ${dateFilter.replace(/i\./g, '')}`,
        dateParams
      );

      res.json({
        success: true,
        data: {
          by_category: byCategoryRes.rows,
          by_competitor: byCompetitorRes.rows,
          win_loss: winLossRes.rows[0] || {},
        },
      });
    } catch (err) {
      logger.error('MES Analytics: error fetching lost-reasons', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /qc/sla-overview ───────────────────────────────────────────────────
  router.get('/qc/sla-overview', authenticate, async (req, res) => {
    try {
      if (!canAccessQCDashboard(req.user) && !isAdminOrMgmt(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const samplesRes = await pool.query(
        `SELECT
           s.id, s.sample_number, s.status, s.sla_due_at, s.sla_stage,
           i.inquiry_number, i.customer_name, i.priority,
           CASE
             WHEN s.sla_due_at IS NULL THEN 'no_sla'
             WHEN s.sla_due_at < NOW() THEN 'breached'
             WHEN s.sla_due_at < NOW() + INTERVAL '1 hour' THEN 'warning'
             ELSE 'ok'
           END AS sla_status
         FROM mes_presales_samples s
         JOIN mes_presales_inquiries i ON i.id = s.inquiry_id
         WHERE s.status IN ('sent_to_qc','received_by_qc','testing')
           AND s.sla_due_at IS NOT NULL
           AND i.deleted_at IS NULL
         ORDER BY s.sla_due_at ASC`
      );

      const cseRes = await pool.query(
        `SELECT
           c.id, c.cse_number, c.status, c.sla_due_at,
           c.customer_name, c.sample_number, c.inquiry_number,
           CASE
             WHEN c.sla_due_at IS NULL THEN 'no_sla'
             WHEN c.sla_due_at < NOW() THEN 'breached'
             WHEN c.sla_due_at < NOW() + INTERVAL '2 hours' THEN 'warning'
             ELSE 'ok'
           END AS sla_status
         FROM mes_cse_reports c
         WHERE c.status IN ('pending_qc_manager','pending_production')
           AND c.sla_due_at IS NOT NULL
         ORDER BY c.sla_due_at ASC`
      );

      const overdueSamples = samplesRes.rows.filter(s => s.sla_status === 'breached').length;
      const overdueCses = cseRes.rows.filter(c => c.sla_status === 'breached').length;

      res.json({
        success: true,
        data: {
          samples: samplesRes.rows,
          cse_reports: cseRes.rows,
          summary: {
            overdue_samples: overdueSamples,
            overdue_cses: overdueCses,
            total_tracked_samples: samplesRes.rows.length,
            total_tracked_cses: cseRes.rows.length,
          },
        },
      });
    } catch (err) {
      logger.error('MES SLA: error fetching SLA overview', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /qc/analytics ──────────────────────────────────────────────────────
  router.get('/qc/analytics', authenticate, async (req, res) => {
    try {
      if (!canAccessQCDashboard(req.user) && !isAdminOrMgmt(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const passRateRes = await pool.query(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE qc_result = 'pass') AS pass_count,
           COUNT(*) FILTER (WHERE qc_result = 'fail') AS fail_count,
           COUNT(*) FILTER (WHERE qc_result = 'conditional') AS conditional_count,
           ROUND(
             (COUNT(*) FILTER (WHERE qc_result = 'pass'))::numeric /
             NULLIF(COUNT(*) FILTER (WHERE qc_result IS NOT NULL), 0) * 100, 1
           ) AS pass_rate
         FROM mes_presales_samples
         WHERE qc_result IS NOT NULL`
      );

      const turnaroundRes = await pool.query(
        `SELECT
           ROUND(AVG(EXTRACT(EPOCH FROM (qc_completed_at - received_at)) / 3600)::numeric, 1) AS avg_hours,
           ROUND(MIN(EXTRACT(EPOCH FROM (qc_completed_at - received_at)) / 3600)::numeric, 1) AS min_hours,
           ROUND(MAX(EXTRACT(EPOCH FROM (qc_completed_at - received_at)) / 3600)::numeric, 1) AS max_hours
         FROM mes_presales_samples
         WHERE qc_completed_at IS NOT NULL AND received_at IS NOT NULL`
      );

      const overdueRes = await pool.query(
        `SELECT COUNT(*) AS overdue_count
         FROM mes_presales_samples
         WHERE sla_due_at IS NOT NULL AND sla_due_at < NOW()
           AND status IN ('sent_to_qc','received_by_qc','testing')`
      );

      const byProductGroupRes = await pool.query(
        `SELECT
           product_group,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE qc_result = 'pass') AS pass_count,
           COUNT(*) FILTER (WHERE qc_result = 'fail') AS fail_count
         FROM mes_presales_samples
         WHERE qc_result IS NOT NULL
         GROUP BY product_group
         ORDER BY total DESC`
      );

      const dailyRes = await pool.query(
        `SELECT
           DATE(qc_completed_at) AS date,
           COUNT(*) AS completed
         FROM mes_presales_samples
         WHERE qc_completed_at IS NOT NULL AND qc_completed_at >= NOW() - INTERVAL '30 days'
         GROUP BY DATE(qc_completed_at)
         ORDER BY date ASC`
      );

      res.json({
        success: true,
        data: {
          pass_rate: passRateRes.rows[0]?.pass_rate != null ? Number(passRateRes.rows[0].pass_rate) : null,
          total_tested: parseInt(passRateRes.rows[0]?.total || 0, 10),
          pass_count: parseInt(passRateRes.rows[0]?.pass_count || 0, 10),
          fail_count: parseInt(passRateRes.rows[0]?.fail_count || 0, 10),
          conditional_count: parseInt(passRateRes.rows[0]?.conditional_count || 0, 10),
          avg_turnaround_hours: turnaroundRes.rows[0]?.avg_hours != null ? Number(turnaroundRes.rows[0].avg_hours) : null,
          min_turnaround_hours: turnaroundRes.rows[0]?.min_hours != null ? Number(turnaroundRes.rows[0].min_hours) : null,
          max_turnaround_hours: turnaroundRes.rows[0]?.max_hours != null ? Number(turnaroundRes.rows[0].max_hours) : null,
          overdue_count: parseInt(overdueRes.rows[0]?.overdue_count || 0, 10),
          by_product_group: byProductGroupRes.rows,
          daily_completions: dailyRes.rows,
        },
      });
    } catch (err) {
      logger.error('MES QC: error fetching analytics', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /inquiries/:id/audit-trail ─────────────────────────────────────────
  router.get('/inquiries/:id/audit-trail', authenticate, async (req, res) => {
    try {
      const inquiryId = parseInt(req.params.id, 10);
      if (!Number.isInteger(inquiryId) || inquiryId <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid inquiry id' });
      }

      const inquiryAudit = await pool.query(
        `SELECT * FROM admin_audit_log
         WHERE table_name = 'mes_presales_inquiries' AND record_id = $1
         ORDER BY created_at ASC`,
        [inquiryId]
      );

      const sampleIdsRes = await pool.query(
        `SELECT id FROM mes_presales_samples WHERE inquiry_id = $1`, [inquiryId]
      );
      const sampleIds = sampleIdsRes.rows.map(r => r.id);

      let sampleAudit = { rows: [] };
      if (sampleIds.length > 0) {
        sampleAudit = await pool.query(
          `SELECT * FROM admin_audit_log
           WHERE table_name = 'mes_presales_samples' AND record_id = ANY($1::int[])
           ORDER BY created_at ASC`,
          [sampleIds]
        );
      }

      const cseIdsRes = await pool.query(
        `SELECT id FROM mes_cse_reports WHERE inquiry_id = $1`, [inquiryId]
      );
      const cseIds = cseIdsRes.rows.map(r => r.id);

      let cseAudit = { rows: [] };
      if (cseIds.length > 0) {
        cseAudit = await pool.query(
          `SELECT * FROM admin_audit_log
           WHERE table_name = 'mes_cse_reports' AND record_id = ANY($1::int[])
           ORDER BY created_at ASC`,
          [cseIds]
        );
      }

      res.json({
        success: true,
        data: {
          inquiry: inquiryAudit.rows,
          samples: sampleAudit.rows,
          cse_reports: cseAudit.rows,
        },
      });
    } catch (err) {
      logger.error('MES Audit: error fetching audit trail', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /admin/audit-log ───────────────────────────────────────────────────
  router.get('/admin/audit-log', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
      }

      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
      const offset = (page - 1) * limit;

      const params = [];
      const conditions = [];
      let idx = 1;

      if (req.query.table_name) {
        conditions.push(`table_name = $${idx++}`);
        params.push(req.query.table_name);
      }
      if (req.query.action) {
        conditions.push(`action = $${idx++}`);
        params.push(req.query.action);
      }
      if (req.query.user_id) {
        conditions.push(`user_id = $${idx++}`);
        params.push(parseInt(req.query.user_id, 10));
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const countRes = await pool.query(`SELECT COUNT(*) AS total FROM admin_audit_log ${where}`, params);
      const listRes = await pool.query(
        `SELECT * FROM admin_audit_log ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset]
      );

      res.json({
        success: true,
        data: listRes.rows,
        pagination: { page, limit, total: parseInt(countRes.rows[0]?.total, 10) || 0 },
      });
    } catch (err) {
      logger.error('MES Audit: error fetching admin audit log', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

};
