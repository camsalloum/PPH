/**
 * Presales NCR — Non-Conformance Reports CRUD + stats
 */
const {
  pool, authenticate, logger,
  canAccessQCDashboard, isAdminOrMgmt, logActivity,
} = require('./_helpers');

module.exports = function (router) {

  // ── GET /ncr ───────────────────────────────────────────────────────────────
  router.get('/ncr', authenticate, async (req, res) => {
    try {
      if (!canAccessQCDashboard(req.user) && !isAdminOrMgmt(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 200);
      const offset = (page - 1) * limit;

      const params = [];
      const conditions = [];
      let idx = 1;

      if (req.query.status) {
        conditions.push(`n.status = $${idx++}`);
        params.push(req.query.status);
      }
      if (req.query.inquiry_id) {
        conditions.push(`n.inquiry_id = $${idx++}`);
        params.push(parseInt(req.query.inquiry_id, 10));
      }
      if (req.query.sample_id) {
        conditions.push(`n.sample_id = $${idx++}`);
        params.push(parseInt(req.query.sample_id, 10));
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const countRes = await pool.query(`SELECT COUNT(*) AS total FROM mes_ncr_reports n ${where}`, params);

      const listRes = await pool.query(
        `SELECT n.*, i.inquiry_number, s.sample_number
         FROM mes_ncr_reports n
         LEFT JOIN mes_presales_inquiries i ON i.id = n.inquiry_id
         LEFT JOIN mes_presales_samples s ON s.id = n.sample_id
         ${where}
         ORDER BY n.created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset]
      );

      res.json({
        success: true,
        data: listRes.rows,
        pagination: { page, limit, total: parseInt(countRes.rows[0]?.total, 10) || 0 },
      });
    } catch (err) {
      logger.error('MES NCR: error listing NCR reports', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /ncr/stats ─────────────────────────────────────────────────────────
  router.get('/ncr/stats', authenticate, async (req, res) => {
    try {
      if (!canAccessQCDashboard(req.user) && !isAdminOrMgmt(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      const result = await pool.query(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'open') AS open,
           COUNT(*) FILTER (WHERE status = 'investigating') AS investigating,
           COUNT(*) FILTER (WHERE status = 'resolved') AS resolved,
           COUNT(*) FILTER (WHERE status = 'closed') AS closed,
           COUNT(*) FILTER (WHERE severity = 'critical') AS critical,
           COUNT(*) FILTER (WHERE severity = 'major') AS major,
           COUNT(*) FILTER (WHERE severity = 'minor') AS minor
         FROM mes_ncr_reports`
      );
      res.json({ success: true, data: result.rows[0] || {} });
    } catch (err) {
      logger.error('MES NCR: error fetching NCR stats', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /ncr/:id ───────────────────────────────────────────────────────────
  router.get('/ncr/:id', authenticate, async (req, res) => {
    try {
      if (!canAccessQCDashboard(req.user) && !isAdminOrMgmt(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      const result = await pool.query(
        `SELECT n.*, i.inquiry_number, i.customer_name, s.sample_number, s.product_group
         FROM mes_ncr_reports n
         LEFT JOIN mes_presales_inquiries i ON i.id = n.inquiry_id
         LEFT JOIN mes_presales_samples s ON s.id = n.sample_id
         WHERE n.id = $1`,
        [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'NCR not found' });

      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('MES NCR: error fetching NCR detail', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── POST /ncr ──────────────────────────────────────────────────────────────
  router.post('/ncr', authenticate, async (req, res) => {
    if (!canAccessQCDashboard(req.user) && !isAdminOrMgmt(req.user)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    try {
      const {
        sample_id, title, description, severity = 'minor',
        category, root_cause, corrective_action, preventive_action, notes,
      } = req.body;

      if (!title) return res.status(400).json({ success: false, error: 'Title is required' });

      let inquiryId = req.body.inquiry_id || null;
      if (!inquiryId && sample_id) {
        const sampleRes = await pool.query('SELECT inquiry_id FROM mes_presales_samples WHERE id = $1', [sample_id]);
        if (sampleRes.rows.length > 0) inquiryId = sampleRes.rows[0].inquiry_id;
      }

      const ncrNumberRes = await pool.query(`SELECT generate_ncr_number($1) AS ncr_number`, [process.env.DIVISION || 'FP']);
      const ncrNumber = ncrNumberRes.rows[0]?.ncr_number;

      const result = await pool.query(
        `INSERT INTO mes_ncr_reports
         (ncr_number, inquiry_id, sample_id, title, description, severity,
          category, root_cause, corrective_action, preventive_action, notes,
          status, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'open',$12,$13) RETURNING *`,
        [ncrNumber, inquiryId, sample_id || null, title, description || null,
         severity, category || null, root_cause || null,
         corrective_action || null, preventive_action || null, notes || null,
         req.user?.id || null, req.user?.name || req.user?.username || 'System']
      );

      if (inquiryId) {
        logActivity(inquiryId, 'ncr_created', {
          ncr_number: ncrNumber, title, severity,
        }, req.user);
      }

      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('MES NCR: error creating NCR', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── PATCH /ncr/:id ─────────────────────────────────────────────────────────
  router.patch('/ncr/:id', authenticate, async (req, res) => {
    if (!canAccessQCDashboard(req.user) && !isAdminOrMgmt(req.user)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    try {
      const ncrId = req.params.id;
      const fields = [
        'title', 'description', 'severity', 'category',
        'root_cause', 'corrective_action', 'preventive_action', 'notes', 'status',
      ];
      const sets = [];
      const vals = [];
      let idx = 1;

      for (const f of fields) {
        if (req.body[f] !== undefined) {
          sets.push(`${f} = $${idx++}`);
          vals.push(req.body[f]);
        }
      }
      if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

      if (req.body.status && ['resolved', 'closed'].includes(req.body.status)) {
        sets.push(`verified_by = $${idx++}`);       vals.push(req.user?.id);
        sets.push(`verified_by_name = $${idx++}`);   vals.push(req.user?.name || req.user?.username || 'System');
        sets.push(`verified_at = $${idx++}`);         vals.push(new Date());
      }

      sets.push(`updated_at = NOW()`);
      vals.push(ncrId);

      const result = await pool.query(
        `UPDATE mes_ncr_reports SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, vals
      );
      if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'NCR not found' });

      const ncr = result.rows[0];
      if (ncr.inquiry_id) {
        logActivity(ncr.inquiry_id, 'ncr_updated', {
          ncr_number: ncr.ncr_number, status: ncr.status,
        }, req.user);
      }

      res.json({ success: true, data: ncr });
    } catch (err) {
      logger.error('MES NCR: error updating NCR', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

};
