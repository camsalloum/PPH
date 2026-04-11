/**
 * Presales QC Templates — test template CRUD (soft-delete)
 */
const {
  pool, authenticate, logger,
  isAdminOrMgmt,
} = require('./_helpers');

module.exports = function (router) {

  // ── GET /qc/templates ──────────────────────────────────────────────────────
  router.get('/qc/templates', authenticate, async (req, res) => {
    try {
      const { product_group } = req.query;
      let query = `SELECT * FROM mes_qc_templates WHERE is_active = true`;
      const params = [];
      if (product_group) {
        query += ` AND (product_groups @> $1::jsonb OR product_groups IS NULL OR product_groups = '[]'::jsonb)`;
        params.push(JSON.stringify([product_group]));
      }
      query += ` ORDER BY name ASC`;
      const result = await pool.query(query, params);
      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('MES QC: error listing templates', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── POST /qc/templates ─────────────────────────────────────────────────────
  router.post('/qc/templates', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) {
      return res.status(403).json({ success: false, error: 'Management role required' });
    }
    try {
      const { name, description, test_category, test_parameters, product_groups } = req.body;
      if (!name) return res.status(400).json({ success: false, error: 'Template name is required' });

      const result = await pool.query(
        `INSERT INTO mes_qc_templates
         (name, description, test_category, test_parameters, product_groups, created_by, created_by_name)
         VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7) RETURNING *`,
        [name, description || null, test_category || null,
         JSON.stringify(Array.isArray(test_parameters) ? test_parameters : []),
         JSON.stringify(Array.isArray(product_groups) ? product_groups : []),
         req.user?.id || null, req.user?.name || req.user?.username || 'System']
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('MES QC: error creating template', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── PATCH /qc/templates/:id ────────────────────────────────────────────────
  router.patch('/qc/templates/:id', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) {
      return res.status(403).json({ success: false, error: 'Management role required' });
    }
    try {
      const fields = ['name', 'description', 'test_category', 'is_active'];
      const sets = [];
      const vals = [];
      let idx = 1;

      for (const f of fields) {
        if (req.body[f] !== undefined) {
          sets.push(`${f} = $${idx++}`);
          vals.push(req.body[f]);
        }
      }

      if (req.body.product_groups !== undefined) {
        sets.push(`product_groups = $${idx++}::jsonb`);
        vals.push(JSON.stringify(Array.isArray(req.body.product_groups) ? req.body.product_groups : []));
      }

      if (req.body.test_parameters !== undefined) {
        sets.push(`test_parameters = $${idx++}::jsonb`);
        vals.push(JSON.stringify(Array.isArray(req.body.test_parameters) ? req.body.test_parameters : []));
      }

      if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

      sets.push(`updated_at = NOW()`);
      vals.push(req.params.id);

      const result = await pool.query(
        `UPDATE mes_qc_templates SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, vals
      );
      if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Template not found' });

      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('MES QC: error updating template', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── DELETE /qc/templates/:id (soft-delete) ─────────────────────────────────
  router.delete('/qc/templates/:id', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) {
      return res.status(403).json({ success: false, error: 'Management role required' });
    }
    try {
      const result = await pool.query(
        `UPDATE mes_qc_templates SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id`,
        [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Template not found' });

      res.json({ success: true });
    } catch (err) {
      logger.error('MES QC: error soft-deleting template', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

};
