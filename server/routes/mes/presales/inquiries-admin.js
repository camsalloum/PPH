/**
 * Presales Inquiries — clearance, presales-phase override, kanban positioning
 * Split from inquiries.js for ≤300 line enforcement (Phase 6)
 */
const {
  pool, authenticate, logger,
  notifyUsers,
  DIVISION,
  getSalesRepGroup, isAdminOrMgmt,
  actorName, logActivity,
} = require('./_helpers');

module.exports = function (router) {

  // ── PATCH /inquiries/:id/clearance ─────────────────────────────────────────
  router.patch('/inquiries/:id/clearance', authenticate, async (req, res) => {
    try {
      const CLEARANCE_ROLES = ['admin', 'manager', 'sales_manager', 'sales_coordinator'];
      const userLevel = Number(req.user?.designation_level) || 0;
      if (!CLEARANCE_ROLES.includes(req.user?.role) || userLevel < 6) {
        return res.status(403).json({ success: false, error: 'Clearance requires designation level 6 or above.' });
      }

      const { id } = req.params;
      const { cleared } = req.body;

      if (cleared) {
        await pool.query(
          `UPDATE mes_presales_inquiries
           SET presales_cleared = TRUE,
               clearance_by = $1, clearance_by_name = $2, clearance_at = NOW(),
               presales_phase = 'cleared', status = 'converted',
               inquiry_stage = 'cse_approved'
           WHERE id = $3`,
          [req.user?.id, actorName(req.user), id]
        );
        await logActivity(id, 'presales_cleared', { cleared_by: actorName(req.user) }, req.user);
        try {
          const ownerRes = await pool.query(
            `SELECT created_by, inquiry_number FROM mes_presales_inquiries WHERE id = $1`, [id]
          );
          const ownerId = ownerRes.rows[0]?.created_by || null;
          const inqNum = ownerRes.rows[0]?.inquiry_number || `#${id}`;
          if (ownerId) {
            await notifyUsers(
              [ownerId],
              {
                type: 'presales_cleared',
                title: `Pre-sales clearance granted — ${inqNum}`,
                message: `Cleared by ${actorName(req.user)}. Inquiry is now converted.`,
                link: `/crm/inquiries/${id}`,
                referenceType: 'inquiry',
                referenceId: parseInt(id),
              },
              { excludeUserIds: [req.user?.id] }
            );
          }
        } catch (notifyErr) {
          logger.warn('MES PreSales: presales_cleared notification failed', notifyErr.message);
        }
      } else {
        await pool.query(
          `UPDATE mes_presales_inquiries
           SET presales_cleared = FALSE, clearance_by = NULL, clearance_by_name = NULL, clearance_at = NULL,
               presales_phase = 'clearance'
           WHERE id = $1`,
          [id]
        );
        await logActivity(id, 'presales_clearance_revoked', {}, req.user);
      }

      res.json({ success: true, data: { cleared } });
    } catch (err) {
      logger.error('MES PreSales: error updating clearance', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── PATCH /inquiries/:id/presales-phase ────────────────────────────────────
  router.patch('/inquiries/:id/presales-phase', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) {
      return res.status(403).json({ success: false, error: 'Management role required' });
    }
    try {
      const { id } = req.params;
      const { phase } = req.body;
      const allowed = ['inquiry', 'sample_qc', 'moq_review', 'material_check', 'clearance', 'cleared'];
      if (!allowed.includes(phase)) {
        return res.status(400).json({ success: false, error: `phase must be one of: ${allowed.join(', ')}` });
      }
      await pool.query('UPDATE mes_presales_inquiries SET presales_phase = $1 WHERE id = $2', [phase, id]);
      await logActivity(id, 'presales_phase_changed', { phase }, req.user);
      res.json({ success: true, data: { phase } });
    } catch (err) {
      logger.error('MES PreSales: error updating presales phase', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── PATCH /inquiries/:id/kanban-position ───────────────────────────────────
  router.patch('/inquiries/:id/kanban-position', authenticate, async (req, res) => {
    try {
      const { id } = req.params;
      const { kanban_position } = req.body;
      if (kanban_position == null || isNaN(Number(kanban_position))) {
        return res.status(400).json({ success: false, error: 'kanban_position is required (number)' });
      }

      const existing = await pool.query(
        'SELECT id, sales_rep_group_id FROM mes_presales_inquiries WHERE id = $1', [id]
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

      await pool.query(
        `UPDATE mes_presales_inquiries SET kanban_position = $1, updated_at = NOW() WHERE id = $2`,
        [Number(kanban_position), id]
      );
      res.json({ success: true });
    } catch (err) {
      logger.error('MES: error updating kanban position', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

};
