/**
 * Presales Checks — MOQ checks + Material availability checks
 */
const {
  pool, authenticate, logger,
  isAdminOrMgmt, actorName, logActivity,
} = require('./_helpers');

module.exports = function (router) {

  // ═══════════════════════════ MOQ CHECKS ═══════════════════════════════════

  // GET /inquiries/:id/moq-checks
  router.get('/inquiries/:id/moq-checks', authenticate, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT m.*, s.sample_number
         FROM mes_presales_moq_checks m
         LEFT JOIN mes_presales_samples s ON s.id = m.sample_id
         WHERE m.inquiry_id = $1 ORDER BY m.created_at ASC`,
        [req.params.id]
      );
      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('MES PreSales: error fetching MOQ checks', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // POST /inquiries/:id/moq-checks
  router.post('/inquiries/:id/moq-checks', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) {
      return res.status(403).json({ success: false, error: 'Management role required' });
    }
    try {
      const { id } = req.params;
      const {
        sample_id, product_group, customer_qty, moq_required, unit,
        meets_moq, production_capacity, production_days,
        tooling_available, tooling_notes, feasibility_status, notes
      } = req.body;

      const result = await pool.query(
        `INSERT INTO mes_presales_moq_checks
         (inquiry_id, sample_id, product_group, customer_qty, moq_required, unit,
          meets_moq, production_capacity, production_days,
          tooling_available, tooling_notes, feasibility_status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [id, sample_id || null, product_group, customer_qty, moq_required, unit || 'Kgs',
         meets_moq, production_capacity, production_days,
         tooling_available, tooling_notes, feasibility_status || 'pending', notes]
      );

      await logActivity(id, 'moq_check_added', {
        product_group, customer_qty, moq_required, meets_moq,
        feasibility_status: feasibility_status || 'pending',
      }, req.user);

      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('MES PreSales: error creating MOQ check', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // PATCH /moq-checks/:checkId
  router.patch('/moq-checks/:checkId', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) {
      return res.status(403).json({ success: false, error: 'Management role required' });
    }
    try {
      const { checkId } = req.params;
      const fields = ['sample_id','product_group','customer_qty','moq_required','unit',
                      'meets_moq','production_capacity','production_days',
                      'tooling_available','tooling_notes','feasibility_status','notes'];
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

      if (req.body.feasibility_status && req.body.feasibility_status !== 'pending') {
        sets.push(`verified_by = $${idx++}`);     vals.push(req.user?.id);
        sets.push(`verified_by_name = $${idx++}`); vals.push(actorName(req.user));
        sets.push(`verified_at = $${idx++}`);      vals.push(new Date());
      }
      sets.push(`updated_at = $${idx++}`); vals.push(new Date());
      vals.push(checkId);

      const result = await pool.query(
        `UPDATE mes_presales_moq_checks SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, vals
      );
      if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Check not found' });

      if (result.rows[0]?.inquiry_id) {
        logActivity(result.rows[0].inquiry_id, 'moq_check_updated', { check_id: parseInt(checkId) }, req.user);
      }

      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('MES PreSales: error updating MOQ check', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // DELETE /moq-checks/:checkId
  router.delete('/moq-checks/:checkId', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) {
      return res.status(403).json({ success: false, error: 'Management role required' });
    }
    try {
      await pool.query('DELETE FROM mes_presales_moq_checks WHERE id = $1', [req.params.checkId]);
      res.json({ success: true });
    } catch (err) {
      logger.error('MES PreSales: error deleting MOQ check', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // PATCH /inquiries/:id/moq-status
  router.patch('/inquiries/:id/moq-status', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) {
      return res.status(403).json({ success: false, error: 'Management role required' });
    }
    try {
      const { id } = req.params;
      const { moq_status } = req.body;
      const allowed = ['pending', 'verified', 'failed', 'partial'];
      if (!allowed.includes(moq_status)) {
        return res.status(400).json({ success: false, error: `moq_status must be one of: ${allowed.join(', ')}` });
      }
      await pool.query('UPDATE mes_presales_inquiries SET moq_status = $1 WHERE id = $2', [moq_status, id]);
      await logActivity(id, 'moq_status_changed', { moq_status }, req.user);

      if (moq_status === 'verified') {
        await pool.query(`UPDATE mes_presales_inquiries SET presales_phase = 'material_check' WHERE id = $1 AND presales_phase = 'moq_review'`, [id]);
      }

      res.json({ success: true, data: { moq_status } });
    } catch (err) {
      logger.error('MES PreSales: error updating MOQ status', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ═══════════════════════ MATERIAL CHECKS ═══════════════════════════════════

  // GET /inquiries/:id/material-checks
  router.get('/inquiries/:id/material-checks', authenticate, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT * FROM mes_presales_material_checks WHERE inquiry_id = $1 ORDER BY created_at ASC`,
        [req.params.id]
      );
      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('MES PreSales: error fetching material checks', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // POST /inquiries/:id/material-checks
  router.post('/inquiries/:id/material-checks', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) {
      return res.status(403).json({ success: false, error: 'Management role required' });
    }
    try {
      const { id } = req.params;
      const {
        material_type, material_name, specification, required_qty, available_qty,
        unit, is_available, supplier, lead_time_days, estimated_cost, currency,
        status, notes
      } = req.body;

      const result = await pool.query(
        `INSERT INTO mes_presales_material_checks
         (inquiry_id, material_type, material_name, specification, required_qty,
          available_qty, unit, is_available, supplier, lead_time_days,
          estimated_cost, currency, status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [id, material_type, material_name, specification, required_qty,
         available_qty, unit || 'Kgs', is_available, supplier, lead_time_days,
         estimated_cost, currency || 'AED', status || 'pending', notes]
      );

      await logActivity(id, 'material_check_added', {
        material_type, material_name, status: status || 'pending',
      }, req.user);

      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('MES PreSales: error creating material check', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // PATCH /material-checks/:checkId
  router.patch('/material-checks/:checkId', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) {
      return res.status(403).json({ success: false, error: 'Management role required' });
    }
    try {
      const { checkId } = req.params;
      const fields = ['material_type','material_name','specification','required_qty',
                      'available_qty','unit','is_available','supplier','lead_time_days',
                      'estimated_cost','currency','status','notes'];
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

      if (req.body.status && req.body.status !== 'pending') {
        sets.push(`checked_by = $${idx++}`);     vals.push(req.user?.id);
        sets.push(`checked_by_name = $${idx++}`); vals.push(actorName(req.user));
        sets.push(`checked_at = $${idx++}`);      vals.push(new Date());
      }
      sets.push(`updated_at = $${idx++}`); vals.push(new Date());
      vals.push(checkId);

      const result = await pool.query(
        `UPDATE mes_presales_material_checks SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, vals
      );
      if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Check not found' });

      if (result.rows[0]?.inquiry_id) {
        logActivity(result.rows[0].inquiry_id, 'material_check_updated', { check_id: parseInt(checkId) }, req.user);
      }

      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('MES PreSales: error updating material check', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // DELETE /material-checks/:checkId
  router.delete('/material-checks/:checkId', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) {
      return res.status(403).json({ success: false, error: 'Management role required' });
    }
    try {
      await pool.query('DELETE FROM mes_presales_material_checks WHERE id = $1', [req.params.checkId]);
      res.json({ success: true });
    } catch (err) {
      logger.error('MES PreSales: error deleting material check', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // PATCH /inquiries/:id/material-status
  router.patch('/inquiries/:id/material-status', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) {
      return res.status(403).json({ success: false, error: 'Management role required' });
    }
    try {
      const { id } = req.params;
      const { material_status } = req.body;
      const allowed = ['pending', 'available', 'partial', 'not_available', 'ordered'];
      if (!allowed.includes(material_status)) {
        return res.status(400).json({ success: false, error: `material_status must be one of: ${allowed.join(', ')}` });
      }
      await pool.query('UPDATE mes_presales_inquiries SET material_status = $1 WHERE id = $2', [material_status, id]);
      await logActivity(id, 'material_status_changed', { material_status }, req.user);

      if (material_status === 'available') {
        await pool.query(`UPDATE mes_presales_inquiries SET presales_phase = 'clearance' WHERE id = $1 AND presales_phase = 'material_check'`, [id]);
      }

      res.json({ success: true, data: { material_status } });
    } catch (err) {
      logger.error('MES PreSales: error updating material status', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

};
