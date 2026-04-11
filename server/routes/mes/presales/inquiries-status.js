/**
 * Presales Inquiries — status changes, stats, activity history
 * Split from inquiries.js for ≤300 line enforcement (Phase 6)
 */
const {
  pool, authenticate, logger, logAudit,
  DIVISION,
  getSalesRepGroup, isAdminOrMgmt, checkInquiryOwnership,
  actorName, logActivity,
} = require('./_helpers');

module.exports = function (router) {

  // ── PATCH /inquiries/:id/status ────────────────────────────────────────────
  router.patch('/inquiries/:id/status', authenticate, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, lost_reason, converted_to_so,
              lost_reason_category, lost_reason_notes, lost_to_competitor } = req.body;

      const VALID_STATUSES = ['new', 'in_progress', 'customer_registered', 'qualified', 'converted', 'lost', 'on_hold'];
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
      }

      const existing = await pool.query(
        'SELECT * FROM mes_presales_inquiries WHERE id = $1 AND division = $2 AND deleted_at IS NULL', [id, DIVISION]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Inquiry not found' });
      }

      if (!isAdminOrMgmt(req.user)) {
        const repGroup = await getSalesRepGroup(req.user.id);
        if (!repGroup || repGroup.groupId !== existing.rows[0].sales_rep_group_id) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
      }

      // Guard: cannot mark as lost if there are active (non-rejected, non-lost) quotations
      if (status === 'lost') {
        const activeQuots = await pool.query(
          `SELECT COUNT(*) FROM mes_quotations WHERE inquiry_id = $1 AND status NOT IN ('rejected', 'lost', 'cancelled')`,
          [id]
        );
        if (parseInt(activeQuots.rows[0].count) > 0) {
          return res.status(400).json({
            success: false,
            error: `Cannot mark as lost — there are ${activeQuots.rows[0].count} active quotation(s). Cancel or reject them first.`,
          });
        }
      }

      const oldStatus = existing.rows[0].status;
      const updated = await pool.query(
        `UPDATE mes_presales_inquiries
         SET status              = $1,
             lost_reason         = COALESCE($2, lost_reason),
             converted_to_so     = COALESCE($3, converted_to_so),
             lost_reason_category = CASE WHEN $1 = 'lost' THEN COALESCE($6, lost_reason_category) ELSE lost_reason_category END,
             lost_reason_notes   = CASE WHEN $1 = 'lost' THEN COALESCE($7, lost_reason_notes)   ELSE lost_reason_notes   END,
             lost_to_competitor  = CASE WHEN $1 = 'lost' THEN COALESCE($8, lost_to_competitor)  ELSE lost_to_competitor  END,
             lost_at             = CASE WHEN $1 = 'lost' AND lost_at IS NULL THEN NOW() ELSE lost_at END,
             updated_at          = NOW()
         WHERE id = $4 AND division = $5
         RETURNING *`,
        [status, lost_reason || null, converted_to_so || null, id, DIVISION,
         lost_reason_category || null, lost_reason_notes || null, lost_to_competitor || null]
      );

      logActivity(id, 'status_changed', { from: oldStatus, to: status, lost_reason, lost_reason_category }, req.user);
      logAudit(pool, 'mes_presales_inquiries', id, 'updated', existing.rows[0], updated.rows[0], req.user);

      // Lifecycle stage sync — keep inquiry_stage consistent with status (BUG-11 fix)
      if (status === 'lost') {
        pool.query(`UPDATE mes_presales_inquiries SET inquiry_stage = 'lost', stage_changed_at = NOW() WHERE id = $1`, [id]).catch(() => {});
      } else if (status === 'on_hold') {
        pool.query(`UPDATE mes_presales_inquiries SET inquiry_stage = 'on_hold', stage_changed_at = NOW() WHERE id = $1`, [id]).catch(() => {});
      } else if (status === 'new') {
        pool.query(`UPDATE mes_presales_inquiries SET inquiry_stage = 'new_inquiry', stage_changed_at = NOW() WHERE id = $1`, [id]).catch(() => {});
      } else if (status === 'converted') {
        pool.query(`UPDATE mes_presales_inquiries SET inquiry_stage = 'order_confirmed', stage_changed_at = NOW() WHERE id = $1`, [id]).catch(() => {});
      }
      // in_progress / customer_registered / qualified: don't change inquiry_stage
      // (many possible stages map to in_progress; keep current lifecycle position)

      res.json({ success: true, data: updated.rows[0] });
    } catch (err) {
      logger.error('MES PreSales: error updating inquiry status', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /stats ─────────────────────────────────────────────────────────────
  router.get('/stats', authenticate, async (req, res) => {
    try {
      let groupFilter = null;

      if (!isAdminOrMgmt(req.user)) {
        const repGroup = await getSalesRepGroup(req.user.id);
        if (!repGroup) return res.json({ success: true, data: {} });
        groupFilter = repGroup.groupId;
      }

      const params = [DIVISION];
      let whereClause = 'WHERE division = $1 AND deleted_at IS NULL';
      if (groupFilter) {
        whereClause += ' AND sales_rep_group_id = $2';
        params.push(groupFilter);
      }

      const STAGNANT_THRESHOLDS = {
        new: 3, in_progress: 7, customer_registered: 14, qualified: 10, on_hold: 21,
      };

      const statsRes = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'new')                  AS new_count,
           COUNT(*) FILTER (WHERE status = 'in_progress')          AS in_progress_count,
           COUNT(*) FILTER (WHERE status = 'customer_registered')  AS registered_count,
           COUNT(*) FILTER (WHERE status = 'qualified')            AS qualified_count,
           COUNT(*) FILTER (WHERE status = 'converted')            AS converted_count,
           COUNT(*) FILTER (WHERE status = 'lost')                 AS lost_count,
           COUNT(*) FILTER (WHERE status = 'on_hold')              AS on_hold_count,
           COUNT(*) FILTER (WHERE inquiry_date >= CURRENT_DATE - INTERVAL '7 days') AS this_week,
           COUNT(*) FILTER (WHERE inquiry_date >= DATE_TRUNC('month', CURRENT_DATE)) AS this_month,
           COUNT(*) FILTER (WHERE status NOT IN ('converted', 'lost'))  AS open_count,
           COUNT(*) FILTER (
             WHERE status = 'new'                 AND updated_at < NOW() - INTERVAL '3 days'
             OR    status = 'in_progress'         AND updated_at < NOW() - INTERVAL '7 days'
             OR    status = 'customer_registered' AND updated_at < NOW() - INTERVAL '14 days'
             OR    status = 'qualified'           AND updated_at < NOW() - INTERVAL '10 days'
             OR    status = 'on_hold'             AND updated_at < NOW() - INTERVAL '21 days'
           ) AS stagnant_count
         FROM mes_presales_inquiries ${whereClause}`,
        params
      );

      res.json({ success: true, data: { ...statsRes.rows[0], stagnant_thresholds: STAGNANT_THRESHOLDS } });
    } catch (err) {
      logger.error('MES PreSales: error fetching stats', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /inquiries/:id/history ─────────────────────────────────────────────
  router.get('/inquiries/:id/history', authenticate, async (req, res) => {
    try {
      const { id } = req.params;
      const canAccess = await checkInquiryOwnership(req.user, id);
      if (!canAccess) return res.status(403).json({ success: false, error: 'Access denied' });
      const result = await pool.query(
        `SELECT * FROM mes_presales_activity_log
         WHERE inquiry_id = $1
         ORDER BY created_at DESC`,
        [id]
      );
      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('MES PreSales: error fetching history', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

};
