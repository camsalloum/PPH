/**
 * CRM Activities — Log calls, visits, emails, meetings, notes per inquiry
 * Base path: /api/mes/presales/inquiries/:inquiryId/activities
 */
const {
  pool, authenticate, logger, logAudit,
  DIVISION,
  getSalesRepGroup, isAdminOrMgmt, checkInquiryOwnership, actorName, logActivity,
} = require('./_helpers');

const VALID_TYPES = ['call', 'visit', 'email', 'meeting', 'whatsapp', 'note'];
const VALID_OUTCOMES = ['interested', 'follow_up', 'not_interested', 'sample_requested', 'quote_requested', 'no_answer', 'other'];

module.exports = function (router) {

  // ── GET /inquiries/:inquiryId/activities ──────────────────────────────────
  router.get('/inquiries/:inquiryId/activities', authenticate, async (req, res) => {
    try {
      const { inquiryId } = req.params;

      // Ownership check
      if (!isAdminOrMgmt(req.user)) {
        const allowed = await checkInquiryOwnership(req.user, inquiryId);
        if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const { page = 1, limit = 50 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      const result = await pool.query(
        `SELECT * FROM crm_activities
         WHERE inquiry_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [inquiryId, parseInt(limit), offset]
      );

      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('CRM Activities: fetch error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── POST /inquiries/:inquiryId/activities ─────────────────────────────────
  router.post('/inquiries/:inquiryId/activities', authenticate, async (req, res) => {
    try {
      const { inquiryId } = req.params;
      const {
        activity_type, subject, description, outcome,
        next_action_date, next_action_note,
        contact_name, contact_phone, duration_minutes,
      } = req.body;

      if (!activity_type || !VALID_TYPES.includes(activity_type)) {
        return res.status(400).json({
          success: false,
          error: `activity_type is required. Must be one of: ${VALID_TYPES.join(', ')}`,
        });
      }

      if (outcome && !VALID_OUTCOMES.includes(outcome)) {
        return res.status(400).json({
          success: false,
          error: `Invalid outcome. Must be one of: ${VALID_OUTCOMES.join(', ')}`,
        });
      }

      // Ownership check
      if (!isAdminOrMgmt(req.user)) {
        const allowed = await checkInquiryOwnership(req.user, inquiryId);
        if (!allowed) return res.status(403).json({ success: false, error: 'Access denied' });
      }

      // Get inquiry's prospect_id for cross-linking
      const inqRes = await pool.query(
        'SELECT prospect_id FROM mes_presales_inquiries WHERE id = $1',
        [inquiryId]
      );
      const prospectId = inqRes.rows[0]?.prospect_id || null;

      const result = await pool.query(
        `INSERT INTO crm_activities (
           inquiry_id, prospect_id, activity_type, subject, description,
           outcome, next_action_date, next_action_note,
           contact_name, contact_phone, duration_minutes,
           created_by, created_by_name
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [
          inquiryId, prospectId, activity_type,
          subject || null, description || null,
          outcome || null, next_action_date || null, next_action_note || null,
          contact_name || null, contact_phone || null, duration_minutes || null,
          req.user.id, actorName(req.user),
        ]
      );

      // Also log in inquiry activity timeline
      logActivity(inquiryId, 'crm_activity_logged', {
        activity_type,
        subject: subject || activity_type,
        outcome,
      }, req.user);

      logger.info(`CRM Activity logged: ${activity_type} for inquiry #${inquiryId} by ${actorName(req.user)}`);

      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('CRM Activities: create error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── DELETE /inquiries/:inquiryId/activities/:id ───────────────────────────
  router.delete('/inquiries/:inquiryId/activities/:id', authenticate, async (req, res) => {
    try {
      const { inquiryId, id } = req.params;

      // Only the creator or admin can delete
      const existing = await pool.query(
        'SELECT * FROM crm_activities WHERE id = $1 AND inquiry_id = $2',
        [id, inquiryId]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Activity not found' });
      }

      const activity = existing.rows[0];
      if (activity.created_by !== req.user.id && !isAdminOrMgmt(req.user)) {
        return res.status(403).json({ success: false, error: 'Only the creator or admin can delete this activity' });
      }

      await pool.query('DELETE FROM crm_activities WHERE id = $1', [id]);

      res.json({ success: true, message: 'Activity deleted' });
    } catch (err) {
      logger.error('CRM Activities: delete error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /activities/upcoming — Follow-up reminders ────────────────────────
  router.get('/activities/upcoming', authenticate, async (req, res) => {
    try {
      const { days = 7 } = req.query;

      let groupFilter = null;
      if (!isAdminOrMgmt(req.user)) {
        const repGroup = await getSalesRepGroup(req.user.id);
        if (!repGroup) return res.json({ success: true, data: [] });
        groupFilter = repGroup.groupId;
      }

      const conditions = [`a.next_action_date IS NOT NULL`, `a.next_action_date <= CURRENT_DATE + $1::integer`];
      const params = [parseInt(days)];
      let p = 2;

      if (groupFilter) {
        conditions.push(`i.sales_rep_group_id = $${p++}`);
        params.push(groupFilter);
      }

      const result = await pool.query(
        `SELECT a.*, i.inquiry_number, i.customer_name, i.inquiry_stage
         FROM crm_activities a
         JOIN mes_presales_inquiries i ON i.id = a.inquiry_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY a.next_action_date ASC
         LIMIT 50`,
        params
      );

      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('CRM Activities: upcoming error', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });
};
