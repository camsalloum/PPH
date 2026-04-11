/**
 * Presales QC Equipment — equipment registry + equipment-used per analysis
 */
const {
  pool, authenticate, logger,
  isAdminOrMgmt, canAccessQCDashboard,
} = require('./_helpers');

module.exports = function (router) {

  // ── GET /qc/equipment ──────────────────────────────────────────────────────
  router.get('/qc/equipment', authenticate, async (req, res) => {
    try {
      if (!canAccessQCDashboard(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      const result = await pool.query(
        `SELECT * FROM mes_qc_equipment WHERE is_active = true ORDER BY name ASC`
      );
      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('MES QC: error listing equipment', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── POST /qc/equipment ─────────────────────────────────────────────────────
  router.post('/qc/equipment', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) {
      return res.status(403).json({ success: false, error: 'Management role required' });
    }
    try {
      const {
        name, model, serial_number, manufacturer,
        calibration_date, calibration_due, calibration_certificate,
        location, notes
      } = req.body;

      if (!name) return res.status(400).json({ success: false, error: 'Equipment name is required' });

      const result = await pool.query(
        `INSERT INTO mes_qc_equipment
         (name, model, serial_number, manufacturer,
          calibration_date, calibration_due, calibration_certificate,
          location, notes, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [name, model || null, serial_number || null, manufacturer || null,
         calibration_date || null, calibration_due || null, calibration_certificate || null,
         location || null, notes || null, req.user?.id || null,
         req.user?.name || req.user?.username || 'System']
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('MES QC: error creating equipment', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── PATCH /qc/equipment/:id ────────────────────────────────────────────────
  router.patch('/qc/equipment/:id', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) {
      return res.status(403).json({ success: false, error: 'Management role required' });
    }
    try {
      const fields = [
        'name', 'model', 'serial_number', 'manufacturer',
        'calibration_date', 'calibration_due', 'calibration_certificate',
        'location', 'notes', 'is_active'
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

      sets.push(`updated_at = NOW()`);
      vals.push(req.params.id);

      const result = await pool.query(
        `UPDATE mes_qc_equipment SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, vals
      );
      if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Equipment not found' });

      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('MES QC: error updating equipment', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── GET /qc/equipment-used/:analysisId ─────────────────────────────────────
  router.get('/qc/equipment-used/:analysisId', authenticate, async (req, res) => {
    try {
      if (!canAccessQCDashboard(req.user)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      const { analysisId } = req.params;
      const result = await pool.query(
        `SELECT eu.*, e.name AS equipment_name, e.model, e.serial_number, e.calibration_due
         FROM mes_qc_equipment_used eu
         JOIN mes_qc_equipment e ON e.id = eu.equipment_id
         WHERE eu.analysis_id = $1
         ORDER BY eu.created_at ASC`,
        [analysisId]
      );
      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('MES QC: error fetching equipment used', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── POST /qc/equipment-used ────────────────────────────────────────────────
  router.post('/qc/equipment-used', authenticate, async (req, res) => {
    if (!canAccessQCDashboard(req.user)) {
      return res.status(403).json({ success: false, error: 'QC access required' });
    }
    try {
      const { analysis_id, equipment_id, used_for, measurement_value, measurement_unit, notes } = req.body;

      if (!analysis_id || !equipment_id) {
        return res.status(400).json({ success: false, error: 'analysis_id and equipment_id are required' });
      }

      const result = await pool.query(
        `INSERT INTO mes_qc_equipment_used
         (analysis_id, equipment_id, used_for, measurement_value, measurement_unit, notes, used_by, used_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [analysis_id, equipment_id, used_for || null,
         measurement_value || null, measurement_unit || null, notes || null,
         req.user?.id || null, req.user?.name || req.user?.username || 'System']
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      logger.error('MES QC: error recording equipment used', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

};
