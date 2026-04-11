/**
 * Presales QC — inbox, stats, batch-receive
 * Split from qc.js for ≤300 line enforcement (Phase 6)
 */
const {
  pool, authenticate, logger,
  notifyUsers,
  DIVISION, QC_NOTIFY_ROLES,
  canAccessQCDashboard,
  actorName, logActivity, getInquiryOwner,
} = require('./_helpers');

module.exports = function (router) {

  // ── GET /qc/inbox ──────────────────────────────────────────────────────────
  router.get('/qc/inbox', authenticate, async (req, res) => {
    try {
      if (!canAccessQCDashboard(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const allowedStatuses = ['sent_to_qc', 'received_by_qc', 'testing', 'tested', 'approved', 'rejected'];
      const rawStatuses = (req.query.status || 'sent_to_qc')
        .toString().split(',').map(s => s.trim()).filter(Boolean);
      const statuses = rawStatuses.filter(s => allowedStatuses.includes(s));
      if (statuses.length === 0) {
        return res.status(400).json({ success: false, error: `Invalid status filter. Allowed: ${allowedStatuses.join(', ')}` });
      }

      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
      const offset = (page - 1) * limit;

      const totalRes = await pool.query(
        `SELECT COUNT(*) AS total FROM mes_presales_samples s
         JOIN mes_presales_inquiries i ON i.id = s.inquiry_id
         WHERE s.status = ANY($1::text[]) AND i.division = $2`,
        [statuses, DIVISION]
      );

      const listRes = await pool.query(
        `SELECT
           s.id, s.sample_number,
           i.id AS inquiry_id, i.inquiry_number, i.customer_name, i.customer_country, i.priority,
           s.product_group, s.sample_type, s.description, s.status,
           s.created_at, s.created_by_name, s.received_at, s.received_by_qc_name,
           CASE WHEN s.status IN ('sent_to_qc','received_by_qc','testing','tested','approved','rejected') THEN s.updated_at ELSE NULL END AS submitted_at,
           COALESCE(att.attachment_count, 0) AS attachment_count,
           NULL::text AS cse_status
         FROM mes_presales_samples s
         JOIN mes_presales_inquiries i ON i.id = s.inquiry_id
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS attachment_count
           FROM inquiry_attachments a
           WHERE a.inquiry_id = s.inquiry_id AND (a.sample_id = s.id OR a.sample_id IS NULL)
         ) att ON TRUE
         WHERE s.status = ANY($1::text[]) AND i.division = $2
         ORDER BY
           CASE i.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,
           s.updated_at DESC
         LIMIT $3 OFFSET $4`,
        [statuses, DIVISION, limit, offset]
      );

      res.json({
        success: true,
        data: listRes.rows,
        pagination: { page, limit, total: parseInt(totalRes.rows[0].total, 10) || 0 },
      });
    } catch (err) {
      logger.error('MES PreSales: error fetching QC inbox', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /qc/stats ──────────────────────────────────────────────────────────
  router.get('/qc/stats', authenticate, async (req, res) => {
    try {
      if (!canAccessQCDashboard(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      const statsRes = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'sent_to_qc') AS pending_receipt,
           COUNT(*) FILTER (WHERE status = 'received_by_qc') AS received,
           COUNT(*) FILTER (WHERE status = 'testing') AS testing,
           COUNT(*) FILTER (WHERE status IN ('tested','approved','rejected') AND DATE(updated_at) = CURRENT_DATE) AS completed_today,
           COUNT(*) FILTER (WHERE status IN ('tested','approved','rejected') AND updated_at >= NOW() - INTERVAL '7 days') AS completed_this_week
         FROM mes_presales_samples`
      );
      res.json({ success: true, data: statsRes.rows[0] || {} });
    } catch (err) {
      logger.error('MES PreSales: error fetching QC stats', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── POST /qc/batch-receive ─────────────────────────────────────────────────
  router.post('/qc/batch-receive', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!canAccessQCDashboard(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const sampleIds = Array.isArray(req.body?.sample_ids)
        ? req.body.sample_ids.map(id => parseInt(id, 10)).filter(id => Number.isInteger(id) && id > 0)
        : [];
      if (sampleIds.length === 0) {
        return res.status(400).json({ success: false, error: 'sample_ids must be a non-empty array of numbers' });
      }

      await client.query('BEGIN');

      const updateRes = await client.query(
        `UPDATE mes_presales_samples
         SET status = 'received_by_qc',
             received_by_qc_user = $1, received_by_qc_name = $2,
             received_at = NOW(), updated_at = NOW()
         WHERE id = ANY($3::int[]) AND status = 'sent_to_qc'
         RETURNING id, inquiry_id, sample_number`,
        [req.user?.id || null, actorName(req.user), sampleIds]
      );

      const byInquiry = updateRes.rows.reduce((acc, s) => {
        if (!acc[s.inquiry_id]) acc[s.inquiry_id] = [];
        acc[s.inquiry_id].push(s.sample_number);
        return acc;
      }, {});

      for (const inquiryId of Object.keys(byInquiry).map(id => parseInt(id, 10))) {
        await logActivity(inquiryId, 'qc_batch_received', {
          sample_count: byInquiry[inquiryId]?.length || 0,
          samples: byInquiry[inquiryId] || [],
        }, req.user, client);

        await client.query(
          `UPDATE mes_presales_inquiries SET inquiry_stage = 'qc_received', stage_changed_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND inquiry_stage = 'qc_in_progress'`,
          [inquiryId]
        );
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        data: { received_count: updateRes.rows.length, sample_ids: updateRes.rows.map(r => r.id) },
      });

      // Notify the Sales rep(s) who created each inquiry that QC received their samples
      (async () => {
        try {
          for (const inquiryId of Object.keys(byInquiry).map(id => parseInt(id, 10))) {
            const owner = await getInquiryOwner(inquiryId);
            if (owner?.created_by) {
              await notifyUsers(
                [owner.created_by],
                {
                  type: 'sar_received_by_qc',
                  title: `QC received your samples — ${owner.inquiry_number}`,
                  message: `${byInquiry[inquiryId]?.length || 0} sample(s) received by ${actorName(req.user)}`,
                  link: `/mes/inquiries/${inquiryId}`,
                  referenceType: 'inquiry',
                  referenceId: inquiryId,
                },
              );
            }
          }
        } catch (notifyErr) {
          logger.warn('MES PreSales: QC-receive sales notification failed', notifyErr.message);
        }
      })();
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('MES PreSales: error in QC batch receive', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

};
