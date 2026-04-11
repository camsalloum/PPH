/**
 * Routing Routes — CRUD for mes_product_group_routing
 * Mounted at /api/mes/master-data/routing/*
 */

const { pool } = require('../../../database/config');
const { authenticate } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');

function isAdminOrMgmt(user) {
  const mgmtRoles = ['admin', 'manager', 'sales_manager', 'sales_coordinator'];
  return mgmtRoles.includes(user.role) && (user.designation_level || 0) >= 6;
}

module.exports = function (router) {

  // GET /routing?product_group_id=X&bom_version_id=Y
  router.get('/routing', authenticate, async (req, res) => {
    try {
      const { product_group_id, bom_version_id } = req.query;
      const conditions = [];
      const params = [];

      if (product_group_id) { params.push(product_group_id); conditions.push(`r.product_group_id = $${params.length}`); }
      if (bom_version_id)   { params.push(bom_version_id);   conditions.push(`(r.bom_version_id = $${params.length} OR r.bom_version_id IS NULL)`); }

      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

      const { rows } = await pool.query(`
        SELECT r.*,
               p.process_name, p.process_code, p.department, p.speed_unit, p.default_speed,
               p.hourly_rate, p.setup_time_min AS process_setup_min,
               p.default_waste_pct AS process_waste_pct,
               m.machine_name, m.machine_code
        FROM mes_product_group_routing r
        JOIN mes_processes p ON p.id = r.process_id
        LEFT JOIN mes_machines m ON m.id = r.machine_id
        ${where}
        ORDER BY r.sequence_order
      `, params);
      res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('GET /routing error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch routing' });
    }
  });

  // POST /routing — add routing step
  router.post('/routing', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      const {
        product_group_id, bom_version_id, process_id, machine_id,
        sequence_order, estimated_speed, setup_time_min, waste_pct,
        hourly_rate_override, is_optional, notes,
      } = req.body;

      if (!product_group_id || !process_id || !sequence_order) {
        return res.status(400).json({ success: false, error: 'product_group_id, process_id, and sequence_order required' });
      }

      const { rows } = await pool.query(`
        INSERT INTO mes_product_group_routing (
          product_group_id, bom_version_id, process_id, machine_id,
          sequence_order, estimated_speed, setup_time_min, waste_pct,
          hourly_rate_override, is_optional, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
      `, [
        product_group_id, bom_version_id || null, process_id, machine_id || null,
        sequence_order, estimated_speed || null, setup_time_min || null, waste_pct || null,
        hourly_rate_override || null, is_optional || false, notes || null,
      ]);
      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('POST /routing error:', err);
      res.status(500).json({ success: false, error: 'Failed to add routing step' });
    }
  });

  // PUT /routing/:id — update step
  router.put('/routing/:id', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      const { id } = req.params;
      const {
        process_id, machine_id, sequence_order, estimated_speed,
        setup_time_min, waste_pct, hourly_rate_override, is_optional, notes,
      } = req.body;

      const { rows } = await pool.query(`
        UPDATE mes_product_group_routing SET
          process_id = COALESCE($2, process_id),
          machine_id = $3,
          sequence_order = COALESCE($4, sequence_order),
          estimated_speed = $5,
          setup_time_min = $6,
          waste_pct = $7,
          hourly_rate_override = $8,
          is_optional = COALESCE($9, is_optional),
          notes = $10,
          updated_at = NOW()
        WHERE id = $1 RETURNING *
      `, [id, process_id, machine_id, sequence_order, estimated_speed,
          setup_time_min, waste_pct, hourly_rate_override, is_optional, notes]);

      if (!rows.length) return res.status(404).json({ success: false, error: 'Routing step not found' });
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('PUT /routing/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to update routing step' });
    }
  });

  // DELETE /routing/:id — hard delete (routing steps don't need soft delete)
  router.delete('/routing/:id', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      const { rows } = await pool.query('DELETE FROM mes_product_group_routing WHERE id = $1 RETURNING id', [req.params.id]);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });
      res.json({ success: true, message: 'Routing step removed' });
    } catch (err) {
      logger.error('DELETE /routing/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete routing step' });
    }
  });

  // PUT /routing/bulk — replace all routing for a PG+BOM version
  router.put('/routing/bulk', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      const { product_group_id, bom_version_id, steps } = req.body;
      if (!product_group_id || !Array.isArray(steps)) {
        return res.status(400).json({ success: false, error: 'product_group_id and steps[] required' });
      }

      await client.query('BEGIN');

      // Delete existing steps for this PG+BOM
      if (bom_version_id) {
        await client.query('DELETE FROM mes_product_group_routing WHERE product_group_id = $1 AND bom_version_id = $2', [product_group_id, bom_version_id]);
      } else {
        await client.query('DELETE FROM mes_product_group_routing WHERE product_group_id = $1 AND bom_version_id IS NULL', [product_group_id]);
      }

      // Insert new steps
      for (const step of steps) {
        await client.query(`
          INSERT INTO mes_product_group_routing (
            product_group_id, bom_version_id, process_id, machine_id,
            sequence_order, estimated_speed, setup_time_min, waste_pct,
            hourly_rate_override, is_optional, notes
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `, [
          product_group_id, bom_version_id || null, step.process_id, step.machine_id || null,
          step.sequence_order, step.estimated_speed || null, step.setup_time_min || null,
          step.waste_pct || null, step.hourly_rate_override || null, step.is_optional || false,
          step.notes || null,
        ]);
      }

      await client.query('COMMIT');

      const { rows } = await pool.query(`
        SELECT r.*, p.process_name, p.process_code, m.machine_name
        FROM mes_product_group_routing r
        JOIN mes_processes p ON p.id = r.process_id
        LEFT JOIN mes_machines m ON m.id = r.machine_id
        WHERE r.product_group_id = $1 AND r.bom_version_id IS NOT DISTINCT FROM $2
        ORDER BY r.sequence_order
      `, [product_group_id, bom_version_id || null]);

      res.json({ success: true, data: rows });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('PUT /routing/bulk error:', err);
      res.status(500).json({ success: false, error: 'Bulk routing update failed' });
    } finally {
      client.release();
    }
  });
};
