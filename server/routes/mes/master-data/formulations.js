/**
 * MES Master Data — Formulations Routes
 * Mounted at /api/mes/master-data/formulations
 *
 * CRUD for formulations, formulation_components, formulation_results.
 * A12 percentage validation is enforced by DB trigger (check_formulation_pct).
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
  // FORMULATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── GET /formulations — List ─────────────────────────────────────────────
  router.get('/formulations', authenticate, async (req, res) => {
    try {
      const { product_group_id, status, search } = req.query;
      const params = [];
      const conditions = ['f.is_active = true'];
      let idx = 1;

      if (product_group_id) {
        conditions.push(`f.product_group_id = $${idx++}`);
        params.push(parseInt(product_group_id, 10));
      }
      if (status) {
        conditions.push(`f.status = $${idx++}`);
        params.push(status);
      }
      if (search) {
        conditions.push(`f.formulation_name ILIKE $${idx}`);
        params.push(`%${search}%`);
        idx++;
      }

      const sql = `
        SELECT f.*,
               pg.product_group AS product_group_name,
               (SELECT COUNT(*) FROM mes_formulation_components fc
                WHERE fc.formulation_id = f.id AND fc.is_active = true) AS component_count
        FROM mes_formulations f
        LEFT JOIN crm_product_groups pg ON pg.id = f.product_group_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY f.product_group_id, f.formulation_name
      `;
      const { rows } = await pool.query(sql, params);
      res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('GET /formulations error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch formulations' });
    }
  });

  // ─── GET /formulations/:id — Detail with components ───────────────────────
  router.get('/formulations/:id', authenticate, async (req, res) => {
    try {
      const fRes = await pool.query(
        `SELECT f.*, pg.product_group AS product_group_name
         FROM mes_formulations f
         LEFT JOIN crm_product_groups pg ON pg.id = f.product_group_id
         WHERE f.id = $1`,
        [req.params.id]
      );
      if (!fRes.rows.length) return res.status(404).json({ success: false, error: 'Formulation not found' });

      const cRes = await pool.query(
        `SELECT fc.*, im.item_name, im.item_code
         FROM mes_formulation_components fc
         LEFT JOIN mes_item_master im ON im.id = fc.item_id
         WHERE fc.formulation_id = $1 AND fc.is_active = true
         ORDER BY fc.percentage DESC`,
        [req.params.id]
      );

      const data = fRes.rows[0];
      data.components = cRes.rows;
      res.json({ success: true, data });
    } catch (err) {
      logger.error('GET /formulations/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch formulation' });
    }
  });

  // ─── POST /formulations — Create ──────────────────────────────────────────
  router.post('/formulations', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const {
        product_group_id, bom_version_id, formulation_name,
        version, target_properties, status, notes
      } = req.body;

      if (!product_group_id || !formulation_name) {
        return res.status(400).json({ success: false, error: 'product_group_id and formulation_name are required' });
      }

      const sql = `
        INSERT INTO mes_formulations
          (product_group_id, bom_version_id, formulation_name,
           version, target_properties, status, notes, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING *
      `;
      const { rows } = await pool.query(sql, [
        parseInt(product_group_id, 10), bom_version_id || null,
        formulation_name, version || 1,
        target_properties ? JSON.stringify(target_properties) : null,
        status || 'draft', notes || null, req.user?.id || null
      ]);
      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('POST /formulations error:', err);
      res.status(500).json({ success: false, error: 'Failed to create formulation' });
    }
  });

  // ─── PUT /formulations/:id — Update ───────────────────────────────────────
  router.put('/formulations/:id', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const fields = [];
      const params = [];
      let idx = 1;

      const allowed = [
        'product_group_id', 'bom_version_id', 'formulation_name',
        'version', 'target_properties', 'status', 'notes'
      ];
      for (const f of allowed) {
        if (req.body[f] !== undefined) {
          fields.push(`${f} = $${idx++}`);
          params.push(f === 'target_properties' ? JSON.stringify(req.body[f]) : req.body[f]);
        }
      }
      if (!fields.length) return res.status(400).json({ success: false, error: 'No fields to update' });

      fields.push(`updated_at = NOW()`);
      params.push(req.params.id);

      const sql = `UPDATE mes_formulations SET ${fields.join(', ')} WHERE id = $${idx} AND is_active = true RETURNING *`;
      const { rows } = await pool.query(sql, params);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Formulation not found' });
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('PUT /formulations/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to update formulation' });
    }
  });

  // ─── DELETE /formulations/:id — Soft delete ───────────────────────────────
  router.delete('/formulations/:id', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const { rows } = await pool.query(
        'UPDATE mes_formulations SET is_active = false, updated_at = NOW() WHERE id = $1 AND is_active = true RETURNING id',
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'Formulation not found' });
      res.json({ success: true, message: 'Formulation deactivated' });
    } catch (err) {
      logger.error('DELETE /formulations/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete formulation' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FORMULATION COMPONENTS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── GET /formulations/:id/components — List components ───────────────────
  router.get('/formulations/:id/components', authenticate, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT fc.*, im.item_name, im.item_code
         FROM mes_formulation_components fc
         LEFT JOIN mes_item_master im ON im.id = fc.item_id
         WHERE fc.formulation_id = $1 AND fc.is_active = true
         ORDER BY fc.percentage DESC`,
        [req.params.id]
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('GET /formulations/:id/components error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch components' });
    }
  });

  // ─── POST /formulations/:id/components — Add component ────────────────────
  // A12: DB trigger enforces SUM(percentage) <= 100%
  router.post('/formulations/:id/components', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const { resin_type, percentage, item_id, melt_index, density, purpose } = req.body;

      if (!resin_type || percentage === undefined) {
        return res.status(400).json({ success: false, error: 'resin_type and percentage are required' });
      }

      const sql = `
        INSERT INTO mes_formulation_components
          (formulation_id, resin_type, percentage, item_id, melt_index, density, purpose)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING *
      `;
      const { rows } = await pool.query(sql, [
        req.params.id, resin_type, parseFloat(percentage),
        item_id || null, melt_index ? parseFloat(melt_index) : null,
        density ? parseFloat(density) : null, purpose || null
      ]);
      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      // A12 trigger raises 'Total component percentage exceeds 100%'
      if (err.message && err.message.includes('exceeds 100%')) {
        return res.status(400).json({ success: false, error: 'Total component percentage would exceed 100%' });
      }
      logger.error('POST /formulations/:id/components error:', err);
      res.status(500).json({ success: false, error: 'Failed to add component' });
    }
  });

  // ─── PUT /formulations/components/:id — Update component ──────────────────
  router.put('/formulations/components/:id', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const fields = [];
      const params = [];
      let idx = 1;

      const allowed = ['resin_type', 'percentage', 'item_id', 'melt_index', 'density', 'purpose'];
      for (const f of allowed) {
        if (req.body[f] !== undefined) {
          fields.push(`${f} = $${idx++}`);
          params.push(req.body[f]);
        }
      }
      if (!fields.length) return res.status(400).json({ success: false, error: 'No fields to update' });

      params.push(req.params.id);
      const sql = `UPDATE mes_formulation_components SET ${fields.join(', ')} WHERE id = $${idx} AND is_active = true RETURNING *`;
      const { rows } = await pool.query(sql, params);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Component not found' });
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      if (err.message && err.message.includes('exceeds 100%')) {
        return res.status(400).json({ success: false, error: 'Total component percentage would exceed 100%' });
      }
      logger.error('PUT /formulations/components/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to update component' });
    }
  });

  // ─── DELETE /formulations/components/:id — Soft delete ────────────────────
  router.delete('/formulations/components/:id', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const { rows } = await pool.query(
        'UPDATE mes_formulation_components SET is_active = false WHERE id = $1 AND is_active = true RETURNING id',
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'Component not found' });
      res.json({ success: true, message: 'Component deactivated' });
    } catch (err) {
      logger.error('DELETE /formulations/components/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete component' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FORMULATION RESULTS (QC test results)
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── GET /formulations/:id/results — List test results ────────────────────
  router.get('/formulations/:id/results', authenticate, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT fr.*
         FROM mes_formulation_results fr
         WHERE fr.formulation_id = $1 AND fr.is_active = true
         ORDER BY fr.tested_at DESC`,
        [req.params.id]
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('GET /formulations/:id/results error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch formulation results' });
    }
  });

  // ─── POST /formulations/:id/results — Record test result ──────────────────
  router.post('/formulations/:id/results', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const { production_order_id, actual_properties, pass_fail, tested_by, tested_at, notes } = req.body;

      if (!actual_properties || pass_fail === undefined) {
        return res.status(400).json({ success: false, error: 'actual_properties and pass_fail are required' });
      }

      const sql = `
        INSERT INTO mes_formulation_results
          (formulation_id, production_order_id, actual_properties, pass_fail, tested_by, tested_at, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING *
      `;
      const { rows } = await pool.query(sql, [
        req.params.id, production_order_id || null,
        JSON.stringify(actual_properties), pass_fail,
        tested_by || null, tested_at || new Date().toISOString(),
        notes || null
      ]);
      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('POST /formulations/:id/results error:', err);
      res.status(500).json({ success: false, error: 'Failed to record test result' });
    }
  });

};
