/**
 * MES Master Data — Process Rates Routes
 * Mounted at /api/mes/master-data/processes
 * Includes process-machine mapping management.
 */

const { pool } = require('../../../database/config');
const { authenticate } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');

const MGMT_ROLES = ['admin', 'sales_manager'];
function isAdminOrMgmt(user) {
  return MGMT_ROLES.includes(user?.role);
}

module.exports = function (router) {

  // ─── GET /processes — List with machine counts ────────────────────────────
  router.get('/processes', authenticate, async (req, res) => {
    try {
      const { department, search } = req.query;
      const params = [];
      const conditions = ['p.is_active = true'];
      let idx = 1;

      if (department) {
        conditions.push(`p.department = $${idx++}`);
        params.push(department);
      }
      if (search) {
        conditions.push(`(p.process_name ILIKE $${idx} OR p.process_code ILIKE $${idx})`);
        params.push(`%${search}%`);
        idx++;
      }

      const sql = `
        SELECT p.*,
          (SELECT COUNT(*) FROM mes_process_machine_map pm WHERE pm.process_id = p.id) AS machine_count
        FROM mes_processes p
        WHERE ${conditions.join(' AND ')}
        ORDER BY p.sequence_order
      `;
      const { rows } = await pool.query(sql, params);
      res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('GET /processes error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch processes' });
    }
  });

  // ─── GET /processes/:id — Detail with machine assignments ─────────────────
  router.get('/processes/:id', authenticate, async (req, res) => {
    try {
      const pResult = await pool.query('SELECT * FROM mes_processes WHERE id = $1', [req.params.id]);
      if (!pResult.rows.length) return res.status(404).json({ success: false, error: 'Process not found' });

      const mResult = await pool.query(`
        SELECT pm.*, m.machine_code, m.machine_name, m.department, m.standard_speed AS machine_speed
        FROM mes_process_machine_map pm
        JOIN mes_machines m ON m.id = pm.machine_id
        WHERE pm.process_id = $1
        ORDER BY m.machine_code
      `, [req.params.id]);

      res.json({
        success: true,
        data: { ...pResult.rows[0], machines: mResult.rows }
      });
    } catch (err) {
      logger.error('GET /processes/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch process' });
    }
  });

  // ─── POST /processes — Create (admin/manager only) ────────────────────────
  router.post('/processes', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const {
        process_code, process_name, department, sequence_order,
        speed_unit, default_speed, default_setup_time_min, default_waste_pct,
        startup_waste_pct, edge_trim_pct, conversion_waste_pct,
        hourly_rate, setup_cost, min_order_charge, parameters_schema
      } = req.body;

      if (!process_code || !process_name || !department || !speed_unit) {
        return res.status(400).json({ success: false, error: 'process_code, process_name, department, speed_unit are required' });
      }

      const { rows } = await pool.query(`
        INSERT INTO mes_processes (
          process_code, process_name, department, sequence_order,
          speed_unit, default_speed, default_setup_time_min, default_waste_pct,
          startup_waste_pct, edge_trim_pct, conversion_waste_pct,
          hourly_rate, setup_cost, min_order_charge, parameters_schema
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        RETURNING *
      `, [
        process_code, process_name, department, sequence_order ?? 0,
        speed_unit, default_speed, default_setup_time_min ?? 30, default_waste_pct ?? 3,
        startup_waste_pct ?? 0, edge_trim_pct ?? 0, conversion_waste_pct ?? 0,
        hourly_rate ?? 100, setup_cost ?? 0, min_order_charge ?? 0,
        JSON.stringify(parameters_schema || [])
      ]);

      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ success: false, error: 'Process code already exists' });
      logger.error('POST /processes error:', err);
      res.status(500).json({ success: false, error: 'Failed to create process' });
    }
  });

  // ─── PUT /processes/:id — Update process ──────────────────────────────────
  router.put('/processes/:id', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const {
        process_name, department, sequence_order,
        speed_unit, default_speed, default_setup_time_min, default_waste_pct,
        startup_waste_pct, edge_trim_pct, conversion_waste_pct,
        hourly_rate, setup_cost, min_order_charge, parameters_schema
      } = req.body;

      const { rows } = await pool.query(`
        UPDATE mes_processes SET
          process_name = $1, department = $2, sequence_order = $3,
          speed_unit = $4, default_speed = $5, default_setup_time_min = $6, default_waste_pct = $7,
          startup_waste_pct = $8, edge_trim_pct = $9, conversion_waste_pct = $10,
          hourly_rate = $11, setup_cost = $12, min_order_charge = $13,
          parameters_schema = $14, updated_at = NOW()
        WHERE id = $15
        RETURNING *
      `, [
        process_name, department, sequence_order,
        speed_unit, default_speed, default_setup_time_min, default_waste_pct,
        startup_waste_pct, edge_trim_pct, conversion_waste_pct,
        hourly_rate, setup_cost, min_order_charge,
        JSON.stringify(parameters_schema || []),
        req.params.id
      ]);

      if (!rows.length) return res.status(404).json({ success: false, error: 'Process not found' });
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('PUT /processes/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to update process' });
    }
  });

  // ─── PUT /processes/:id/machines — Replace machine assignments ────────────
  router.put('/processes/:id/machines', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const { machines } = req.body;
      // machines: [{ machine_id, is_default, effective_speed, notes }]
      if (!Array.isArray(machines)) {
        return res.status(400).json({ success: false, error: 'machines array is required' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Remove existing mappings
        await client.query('DELETE FROM mes_process_machine_map WHERE process_id = $1', [req.params.id]);

        // Insert new ones
        for (const m of machines) {
          await client.query(`
            INSERT INTO mes_process_machine_map (process_id, machine_id, is_default, effective_speed, notes)
            VALUES ($1, $2, $3, $4, $5)
          `, [req.params.id, m.machine_id, m.is_default || false, m.effective_speed, m.notes]);
        }

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }

      // Return updated process with machines
      const result = await pool.query(`
        SELECT pm.*, m.machine_code, m.machine_name, m.department, m.standard_speed AS machine_speed
        FROM mes_process_machine_map pm
        JOIN mes_machines m ON m.id = pm.machine_id
        WHERE pm.process_id = $1
        ORDER BY m.machine_code
      `, [req.params.id]);

      res.json({ success: true, data: result.rows });
    } catch (err) {
      logger.error('PUT /processes/:id/machines error:', err);
      res.status(500).json({ success: false, error: 'Failed to update machine assignments' });
    }
  });

  // ─── DELETE /processes/:id — Soft delete ──────────────────────────────────
  router.delete('/processes/:id', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const { rows } = await pool.query(
        'UPDATE mes_processes SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id',
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'Process not found' });
      res.json({ success: true, message: 'Process deactivated' });
    } catch (err) {
      logger.error('DELETE /processes/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to deactivate process' });
    }
  });

};
