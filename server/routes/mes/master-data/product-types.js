/**
 * MES Master Data — Product Types Routes
 * Mounted at /api/mes/master-data/product-types
 */

const { pool } = require('../../../database/config');
const { authenticate } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');

const MGMT_ROLES = ['admin', 'sales_manager'];
function isAdminOrMgmt(user) {
  return MGMT_ROLES.includes(user?.role);
}

module.exports = function (router) {

  // ─── GET /product-types — List all active ─────────────────────────────────
  router.get('/product-types', authenticate, async (req, res) => {
    try {
      const { category, search } = req.query;
      const params = [];
      const conditions = ['pt.is_active = true'];
      let idx = 1;

      if (category) {
        conditions.push(`pt.category = $${idx++}`);
        params.push(category);
      }
      if (search) {
        conditions.push(`(pt.type_name ILIKE $${idx} OR pt.type_code ILIKE $${idx})`);
        params.push(`%${search}%`);
        idx++;
      }

      const sql = `
        SELECT * FROM mes_product_types pt
        WHERE ${conditions.join(' AND ')}
        ORDER BY pt.category, pt.type_code
      `;
      const { rows } = await pool.query(sql, params);
      res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('GET /product-types error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch product types' });
    }
  });

  // ─── GET /product-types/:id ───────────────────────────────────────────────
  router.get('/product-types/:id', authenticate, async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM mes_product_types WHERE id = $1', [req.params.id]);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Product type not found' });
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('GET /product-types/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch product type' });
    }
  });

  // ─── POST /product-types — Create ────────────────────────────────────────
  router.post('/product-types', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const {
        type_code, type_name, category,
        waste_factor_pct, handle_allowance_factor,
        dimension_fields,
        has_gusset, has_handle, has_bottom_seal,
        calc_formula_key, layflat_formula_key,
        calculation_basis
      } = req.body;

      if (!type_code || !type_name || !category || !calc_formula_key || !layflat_formula_key) {
        return res.status(400).json({ success: false, error: 'type_code, type_name, category, calc_formula_key, layflat_formula_key are required' });
      }

      const validBasis = ['KG', 'M2', 'PCS'];
      if (calculation_basis && !validBasis.includes(calculation_basis)) {
        return res.status(400).json({ success: false, error: `calculation_basis must be one of: ${validBasis.join(', ')}` });
      }

      const { rows } = await pool.query(`
        INSERT INTO mes_product_types (
          type_code, type_name, category,
          waste_factor_pct, handle_allowance_factor,
          dimension_fields,
          has_gusset, has_handle, has_bottom_seal,
          calc_formula_key, layflat_formula_key,
          calculation_basis
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *
      `, [
        type_code, type_name, category,
        waste_factor_pct ?? 3, handle_allowance_factor,
        JSON.stringify(dimension_fields || []),
        has_gusset || false, has_handle || false, has_bottom_seal || false,
        calc_formula_key, layflat_formula_key,
        calculation_basis || 'KG'
      ]);

      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ success: false, error: 'Type code already exists' });
      logger.error('POST /product-types error:', err);
      res.status(500).json({ success: false, error: 'Failed to create product type' });
    }
  });

  // ─── PUT /product-types/:id — Update ─────────────────────────────────────
  router.put('/product-types/:id', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const {
        type_name, category,
        waste_factor_pct, handle_allowance_factor,
        dimension_fields,
        has_gusset, has_handle, has_bottom_seal,
        calc_formula_key, layflat_formula_key,
        calculation_basis
      } = req.body;

      const { rows } = await pool.query(`
        UPDATE mes_product_types SET
          type_name = $1, category = $2,
          waste_factor_pct = $3, handle_allowance_factor = $4,
          dimension_fields = $5,
          has_gusset = $6, has_handle = $7, has_bottom_seal = $8,
          calc_formula_key = $9, layflat_formula_key = $10,
          calculation_basis = $11
        WHERE id = $12
        RETURNING *
      `, [
        type_name, category,
        waste_factor_pct, handle_allowance_factor,
        JSON.stringify(dimension_fields || []),
        has_gusset, has_handle, has_bottom_seal,
        calc_formula_key, layflat_formula_key,
        calculation_basis,
        req.params.id
      ]);

      if (!rows.length) return res.status(404).json({ success: false, error: 'Product type not found' });
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('PUT /product-types/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to update product type' });
    }
  });

  // ─── DELETE /product-types/:id — Soft delete ──────────────────────────────
  router.delete('/product-types/:id', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const { rows } = await pool.query(
        'UPDATE mes_product_types SET is_active = false WHERE id = $1 RETURNING id',
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'Product type not found' });
      res.json({ success: true, message: 'Product type deactivated' });
    } catch (err) {
      logger.error('DELETE /product-types/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to deactivate product type' });
    }
  });

};
