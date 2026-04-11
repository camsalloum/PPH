/**
 * MES Master Data — Scheduling Routes
 * Mounted at /api/mes/master-data/scheduling
 *
 * CRUD for production_orders, production_schedule, machine_downtime.
 */

const { pool } = require('../../../database/config');
const { authenticate } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');

const MGMT_ROLES = ['admin', 'sales_manager'];
function isAdminOrMgmt(user) {
  return MGMT_ROLES.includes(user?.role);
}

module.exports = function (router) {

  // ═══════════════════════════════════════════════════════════════════════════
  // PRODUCTION ORDERS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── GET /scheduling/orders — List ────────────────────────────────────────
  router.get('/scheduling/orders', authenticate, async (req, res) => {
    try {
      const { status, priority, product_group_id, search } = req.query;
      const params = [];
      const conditions = ['po.is_active = true'];
      let idx = 1;

      if (status) {
        conditions.push(`po.status = $${idx++}`);
        params.push(status);
      }
      if (priority) {
        conditions.push(`po.priority = $${idx++}`);
        params.push(parseInt(priority, 10));
      }
      if (product_group_id) {
        conditions.push(`po.product_group_id = $${idx++}`);
        params.push(parseInt(product_group_id, 10));
      }
      if (search) {
        conditions.push(`po.notes ILIKE $${idx}`);
        params.push(`%${search}%`);
        idx++;
      }

      const sql = `
        SELECT po.*,
               pg.product_group AS product_group_name
        FROM mes_production_orders po
        LEFT JOIN crm_product_groups pg ON pg.id = po.product_group_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY po.priority ASC, po.due_date ASC
      `;
      const { rows } = await pool.query(sql, params);
      res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('GET /scheduling/orders error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch production orders' });
    }
  });

  // ─── GET /scheduling/orders/:id ───────────────────────────────────────────
  router.get('/scheduling/orders/:id', authenticate, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT po.*, pg.product_group AS product_group_name
         FROM mes_production_orders po
         LEFT JOIN crm_product_groups pg ON pg.id = po.product_group_id
         WHERE po.id = $1`,
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'Production order not found' });
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('GET /scheduling/orders/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch production order' });
    }
  });

  // ─── POST /scheduling/orders — Create ─────────────────────────────────────
  router.post('/scheduling/orders', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const {
        job_card_id, inquiry_id, product_group_id, bom_version_id,
        order_qty, quantity_unit, priority, due_date, status, notes
      } = req.body;

      if (!product_group_id || !order_qty) {
        return res.status(400).json({ success: false, error: 'product_group_id and order_qty are required' });
      }

      const sql = `
        INSERT INTO mes_production_orders
          (job_card_id, inquiry_id, product_group_id, bom_version_id,
           order_qty, quantity_unit, priority, due_date, status, notes, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *
      `;
      const { rows } = await pool.query(sql, [
        job_card_id || null, inquiry_id || null, parseInt(product_group_id, 10),
        bom_version_id || null, parseFloat(order_qty), quantity_unit || 'KG',
        parseInt(priority, 10) || 3, due_date || null, status || 'planned',
        notes || null, req.user?.id || null
      ]);
      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('POST /scheduling/orders error:', err);
      res.status(500).json({ success: false, error: 'Failed to create production order' });
    }
  });

  // ─── PUT /scheduling/orders/:id — Update ──────────────────────────────────
  router.put('/scheduling/orders/:id', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const fields = [];
      const params = [];
      let idx = 1;

      const allowed = [
        'job_card_id', 'inquiry_id', 'product_group_id', 'bom_version_id',
        'order_qty', 'quantity_unit', 'priority', 'due_date', 'status', 'notes'
      ];
      for (const f of allowed) {
        if (req.body[f] !== undefined) {
          fields.push(`${f} = $${idx++}`);
          params.push(req.body[f]);
        }
      }
      if (!fields.length) return res.status(400).json({ success: false, error: 'No fields to update' });

      fields.push(`updated_at = NOW()`);
      params.push(req.params.id);

      const sql = `UPDATE mes_production_orders SET ${fields.join(', ')} WHERE id = $${idx} AND is_active = true RETURNING *`;
      const { rows } = await pool.query(sql, params);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Production order not found' });
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('PUT /scheduling/orders/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to update production order' });
    }
  });

  // ─── DELETE /scheduling/orders/:id — Soft delete ──────────────────────────
  router.delete('/scheduling/orders/:id', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const { rows } = await pool.query(
        'UPDATE mes_production_orders SET is_active = false, updated_at = NOW() WHERE id = $1 AND is_active = true RETURNING id',
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'Production order not found' });
      res.json({ success: true, message: 'Production order deactivated' });
    } catch (err) {
      logger.error('DELETE /scheduling/orders/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete production order' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PRODUCTION SCHEDULE
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── GET /scheduling/schedule — List (optionally by order) ────────────────
  router.get('/scheduling/schedule', authenticate, async (req, res) => {
    try {
      const { production_order_id, machine_id, status } = req.query;
      const params = [];
      const conditions = ['ps.is_active = true'];
      let idx = 1;

      if (production_order_id) {
        conditions.push(`ps.production_order_id = $${idx++}`);
        params.push(parseInt(production_order_id, 10));
      }
      if (machine_id) {
        conditions.push(`ps.machine_id = $${idx++}`);
        params.push(parseInt(machine_id, 10));
      }
      if (status) {
        conditions.push(`ps.status = $${idx++}`);
        params.push(status);
      }

      const sql = `
        SELECT ps.*,
               m.machine_name, m.machine_code,
               p.process_name
        FROM mes_production_schedule ps
        LEFT JOIN mes_machines m ON m.id = ps.machine_id
        LEFT JOIN mes_processes p ON p.id = ps.process_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY ps.production_order_id, ps.sequence_order
      `;
      const { rows } = await pool.query(sql, params);
      res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('GET /scheduling/schedule error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch production schedule' });
    }
  });

  // ─── POST /scheduling/schedule — Create schedule entry ────────────────────
  router.post('/scheduling/schedule', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const {
        production_order_id, process_id, machine_id, sequence_order,
        scheduled_start, scheduled_end, planned_qty, planned_waste_pct,
        operator_id, notes
      } = req.body;

      if (!production_order_id || !process_id || !machine_id) {
        return res.status(400).json({ success: false, error: 'production_order_id, process_id, machine_id are required' });
      }

      const sql = `
        INSERT INTO mes_production_schedule
          (production_order_id, process_id, machine_id, sequence_order,
           scheduled_start, scheduled_end, planned_qty, planned_waste_pct,
           operator_id, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
      `;
      const { rows } = await pool.query(sql, [
        parseInt(production_order_id, 10), parseInt(process_id, 10),
        parseInt(machine_id, 10), parseInt(sequence_order, 10) || 1,
        scheduled_start || null, scheduled_end || null,
        planned_qty ? parseFloat(planned_qty) : null,
        planned_waste_pct ? parseFloat(planned_waste_pct) : null,
        operator_id || null, notes || null
      ]);
      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('POST /scheduling/schedule error:', err);
      res.status(500).json({ success: false, error: 'Failed to create schedule entry' });
    }
  });

  // ─── PUT /scheduling/schedule/:id — Update ────────────────────────────────
  router.put('/scheduling/schedule/:id', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const fields = [];
      const params = [];
      let idx = 1;

      const allowed = [
        'process_id', 'machine_id', 'sequence_order',
        'scheduled_start', 'scheduled_end', 'actual_start', 'actual_end',
        'planned_qty', 'actual_qty', 'planned_waste_pct', 'actual_waste_pct',
        'status', 'operator_id', 'notes'
      ];
      for (const f of allowed) {
        if (req.body[f] !== undefined) {
          fields.push(`${f} = $${idx++}`);
          params.push(req.body[f]);
        }
      }
      if (!fields.length) return res.status(400).json({ success: false, error: 'No fields to update' });

      fields.push(`updated_at = NOW()`);
      params.push(req.params.id);

      const sql = `UPDATE mes_production_schedule SET ${fields.join(', ')} WHERE id = $${idx} AND is_active = true RETURNING *`;
      const { rows } = await pool.query(sql, params);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Schedule entry not found' });
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('PUT /scheduling/schedule/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to update schedule entry' });
    }
  });

  // ─── DELETE /scheduling/schedule/:id — Soft delete ────────────────────────
  router.delete('/scheduling/schedule/:id', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const { rows } = await pool.query(
        'UPDATE mes_production_schedule SET is_active = false, updated_at = NOW() WHERE id = $1 AND is_active = true RETURNING id',
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'Schedule entry not found' });
      res.json({ success: true, message: 'Schedule entry deactivated' });
    } catch (err) {
      logger.error('DELETE /scheduling/schedule/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete schedule entry' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MACHINE DOWNTIME
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── GET /scheduling/downtime — List ──────────────────────────────────────
  router.get('/scheduling/downtime', authenticate, async (req, res) => {
    try {
      const { machine_id, reason, open_only } = req.query;
      const params = [];
      const conditions = ['md.is_active = true'];
      let idx = 1;

      if (machine_id) {
        conditions.push(`md.machine_id = $${idx++}`);
        params.push(parseInt(machine_id, 10));
      }
      if (reason) {
        conditions.push(`md.reason = $${idx++}`);
        params.push(reason);
      }
      if (open_only === 'true') {
        conditions.push('md.end_time IS NULL');
      }

      const sql = `
        SELECT md.*,
               m.machine_name, m.machine_code
        FROM mes_machine_downtime md
        LEFT JOIN mes_machines m ON m.id = md.machine_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY md.start_time DESC
      `;
      const { rows } = await pool.query(sql, params);
      res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('GET /scheduling/downtime error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch machine downtime' });
    }
  });

  // ─── POST /scheduling/downtime — Log downtime ────────────────────────────
  router.post('/scheduling/downtime', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const { machine_id, start_time, end_time, reason, notes } = req.body;

      if (!machine_id || !start_time || !reason) {
        return res.status(400).json({ success: false, error: 'machine_id, start_time, reason are required' });
      }

      const sql = `
        INSERT INTO mes_machine_downtime (machine_id, start_time, end_time, reason, notes, created_by)
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING *
      `;
      const { rows } = await pool.query(sql, [
        parseInt(machine_id, 10), start_time, end_time || null,
        reason, notes || null, req.user?.id || null
      ]);
      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('POST /scheduling/downtime error:', err);
      res.status(500).json({ success: false, error: 'Failed to log downtime' });
    }
  });

  // ─── PUT /scheduling/downtime/:id — Update (e.g. close downtime) ─────────
  router.put('/scheduling/downtime/:id', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const fields = [];
      const params = [];
      let idx = 1;

      const allowed = ['start_time', 'end_time', 'reason', 'notes'];
      for (const f of allowed) {
        if (req.body[f] !== undefined) {
          fields.push(`${f} = $${idx++}`);
          params.push(req.body[f]);
        }
      }
      if (!fields.length) return res.status(400).json({ success: false, error: 'No fields to update' });

      params.push(req.params.id);
      const sql = `UPDATE mes_machine_downtime SET ${fields.join(', ')} WHERE id = $${idx} AND is_active = true RETURNING *`;
      const { rows } = await pool.query(sql, params);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Downtime record not found' });
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('PUT /scheduling/downtime/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to update downtime' });
    }
  });

  // ─── DELETE /scheduling/downtime/:id — Soft delete ────────────────────────
  router.delete('/scheduling/downtime/:id', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const { rows } = await pool.query(
        'UPDATE mes_machine_downtime SET is_active = false WHERE id = $1 AND is_active = true RETURNING id',
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'Downtime record not found' });
      res.json({ success: true, message: 'Downtime record deactivated' });
    } catch (err) {
      logger.error('DELETE /scheduling/downtime/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete downtime' });
    }
  });

};
