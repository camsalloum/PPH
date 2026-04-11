/**
 * MES Master Data — Machine Master Routes
 * Mounted at /api/mes/master-data/machines
 */

const { pool } = require('../../../database/config');
const { authenticate } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');

const MGMT_ROLES = ['admin', 'sales_manager'];
function isAdminOrMgmt(user) {
  return MGMT_ROLES.includes(user?.role);
}

module.exports = function (router) {

  // ─── GET /machines — List with filters ────────────────────────────────────
  router.get('/machines', authenticate, async (req, res) => {
    try {
      const { department, status, search } = req.query;
      const params = [];
      const conditions = ['m.is_active = true'];
      let p = 1;

      if (department) {
        conditions.push(`m.department = $${p++}`);
        params.push(department);
      }
      if (status) {
        conditions.push(`m.status = $${p++}`);
        params.push(status);
      }
      if (search) {
        conditions.push(`(m.machine_name ILIKE $${p} OR m.machine_code ILIKE $${p})`);
        params.push(`%${search}%`);
        p++;
      }

      const sql = `
        SELECT * FROM mes_machines m
        WHERE ${conditions.join(' AND ')}
        ORDER BY m.department, m.machine_code
      `;
      const { rows } = await pool.query(sql, params);
      res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('GET /machines error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch machines' });
    }
  });

  // ─── GET /machines/:id — Single machine ───────────────────────────────────
  router.get('/machines/:id', authenticate, async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM mes_machines WHERE id = $1', [req.params.id]);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Machine not found' });
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('GET /machines/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch machine' });
    }
  });

  // ─── POST /machines — Create (admin/manager only) ────────────────────────
  router.post('/machines', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const {
        machine_code, machine_name, department, machine_type,
        max_web_width_mm, min_web_width_mm, number_of_colors, number_of_layers,
        standard_speed, speed_unit, max_speed,
        hourly_rate, setup_cost, setup_waste_pct, running_waste_pct,
        efficiency_pct, availability_pct, quality_pct,
        shifts_per_day, hours_per_shift,
        lamination_modes, sealing_type,
        manufacturer, model, year_installed, technical_specs,
        status, cost_centre_code
      } = req.body;

      if (!machine_code || !machine_name || !department || !speed_unit) {
        return res.status(400).json({ success: false, error: 'machine_code, machine_name, department, speed_unit are required' });
      }

      const { rows } = await pool.query(`
        INSERT INTO mes_machines (
          machine_code, machine_name, department, machine_type,
          max_web_width_mm, min_web_width_mm, number_of_colors, number_of_layers,
          standard_speed, speed_unit, max_speed,
          hourly_rate, setup_cost, setup_waste_pct, running_waste_pct,
          efficiency_pct, availability_pct, quality_pct,
          shifts_per_day, hours_per_shift,
          lamination_modes, sealing_type,
          manufacturer, model, year_installed, technical_specs,
          status, cost_centre_code,
          created_by
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11,
          $12, $13, $14, $15,
          $16, $17, $18,
          $19, $20,
          $21, $22,
          $23, $24, $25, $26,
          $27, $28,
          $29
        ) RETURNING *
      `, [
        machine_code, machine_name, department, machine_type,
        max_web_width_mm, min_web_width_mm, number_of_colors, number_of_layers,
        standard_speed, speed_unit, max_speed,
        hourly_rate ?? 100, setup_cost ?? 0, setup_waste_pct ?? 3, running_waste_pct ?? 2,
        efficiency_pct ?? 80, availability_pct ?? 90, quality_pct ?? 98,
        shifts_per_day ?? 3, hours_per_shift ?? 8,
        JSON.stringify(lamination_modes || []), sealing_type,
        manufacturer, model, year_installed, JSON.stringify(technical_specs || {}),
        status || 'operational', cost_centre_code,
        req.user.id
      ]);

      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ success: false, error: 'Machine code already exists' });
      }
      logger.error('POST /machines error:', err);
      res.status(500).json({ success: false, error: 'Failed to create machine' });
    }
  });

  // ─── PUT /machines/:id — Full update ─────────────────────────────────────
  router.put('/machines/:id', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const {
        machine_name, department, machine_type,
        max_web_width_mm, min_web_width_mm, number_of_colors, number_of_layers,
        standard_speed, speed_unit, max_speed,
        hourly_rate, setup_cost, setup_waste_pct, running_waste_pct,
        efficiency_pct, availability_pct, quality_pct,
        shifts_per_day, hours_per_shift,
        lamination_modes, sealing_type,
        manufacturer, model, year_installed, technical_specs,
        cost_centre_code
      } = req.body;

      const { rows } = await pool.query(`
        UPDATE mes_machines SET
          machine_name = $1, department = $2, machine_type = $3,
          max_web_width_mm = $4, min_web_width_mm = $5, number_of_colors = $6, number_of_layers = $7,
          standard_speed = $8, speed_unit = $9, max_speed = $10,
          hourly_rate = $11, setup_cost = $12, setup_waste_pct = $13, running_waste_pct = $14,
          efficiency_pct = $15, availability_pct = $16, quality_pct = $17,
          shifts_per_day = $18, hours_per_shift = $19,
          lamination_modes = $20, sealing_type = $21,
          manufacturer = $22, model = $23, year_installed = $24, technical_specs = $25,
          cost_centre_code = $26,
          updated_at = NOW()
        WHERE id = $27
        RETURNING *
      `, [
        machine_name, department, machine_type,
        max_web_width_mm, min_web_width_mm, number_of_colors, number_of_layers,
        standard_speed, speed_unit, max_speed,
        hourly_rate, setup_cost, setup_waste_pct, running_waste_pct,
        efficiency_pct, availability_pct, quality_pct,
        shifts_per_day, hours_per_shift,
        JSON.stringify(lamination_modes || []), sealing_type,
        manufacturer, model, year_installed, JSON.stringify(technical_specs || {}),
        cost_centre_code,
        req.params.id
      ]);

      if (!rows.length) return res.status(404).json({ success: false, error: 'Machine not found' });
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('PUT /machines/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to update machine' });
    }
  });

  // ─── PATCH /machines/:id/status — Update status only ─────────────────────
  router.patch('/machines/:id/status', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const { status } = req.body;
      const allowed = ['operational', 'maintenance', 'decommissioned'];
      if (!allowed.includes(status)) {
        return res.status(400).json({ success: false, error: `Status must be one of: ${allowed.join(', ')}` });
      }

      const { rows } = await pool.query(
        'UPDATE mes_machines SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [status, req.params.id]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'Machine not found' });
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('PATCH /machines/:id/status error:', err);
      res.status(500).json({ success: false, error: 'Failed to update status' });
    }
  });

  // ─── DELETE /machines/:id — Soft delete ───────────────────────────────────
  router.delete('/machines/:id', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const { rows } = await pool.query(
        'UPDATE mes_machines SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id',
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'Machine not found' });
      res.json({ success: true, message: 'Machine deactivated' });
    } catch (err) {
      logger.error('DELETE /machines/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to deactivate machine' });
    }
  });

};
