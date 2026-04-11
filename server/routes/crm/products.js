/**
 * CRM Products Routes
 *
 * Endpoints:
 *   GET /products      — list product groups
 *   PUT /products/:id  — update product group CRM parameters
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { pool } = require('../../database/config');
const { authenticate } = require('../../middleware/auth');

const FULL_ACCESS_ROLES = ['admin', 'manager', 'sales_manager', 'sales_coordinator'];

// GET /api/crm/products
router.get('/products', authenticate, async (req, res) => {
  try {
    const { active_only } = req.query;
    
    logger.info('CRM: Fetching product groups from crm_product_groups');
    
    let query = `
      SELECT 
        id, source_id, product_group, material, process,
        is_active, display_order, description,
        min_order_qty, min_order_value, lead_time_days,
        commission_rate, monthly_target, target_margin_pct, price_floor,
        sales_notes, internal_notes,
        created_at, updated_at, synced_at
      FROM crm_product_groups
    `;
    
    if (active_only === 'true') {
      query += ` WHERE is_active = true`;
    }
    
    query += ` ORDER BY display_order, product_group`;
    
    const result = await pool.query(query);
    
    logger.info(`CRM: Found ${result.rows.length} product groups`);
    
    res.json({ success: true, data: result.rows, total: result.rows.length });
  } catch (error) {
    logger.error('Error fetching CRM product groups:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch product groups', message: error.message });
  }
});

// PUT /api/crm/products/:id
router.put('/products/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied — admin or manager role required' });
    }

    const { 
      is_active, display_order, description,
      min_order_qty, min_order_value, lead_time_days,
      commission_rate, monthly_target, target_margin_pct, price_floor,
      sales_notes, internal_notes 
    } = req.body;
    
    logger.info(`CRM: Updating product group ID: ${id}`, req.body);
    
    const result = await pool.query(`
      UPDATE crm_product_groups SET
        is_active = COALESCE($2, is_active),
        display_order = COALESCE($3, display_order),
        description = COALESCE($4, description),
        min_order_qty = COALESCE($5, min_order_qty),
        min_order_value = COALESCE($6, min_order_value),
        lead_time_days = COALESCE($7, lead_time_days),
        commission_rate = COALESCE($8, commission_rate),
        monthly_target = COALESCE($9, monthly_target),
        target_margin_pct = COALESCE($10, target_margin_pct),
        price_floor = COALESCE($11, price_floor),
        sales_notes = COALESCE($12, sales_notes),
        internal_notes = COALESCE($13, internal_notes),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, is_active, display_order, description,
        min_order_qty, min_order_value, lead_time_days,
        commission_rate, monthly_target, target_margin_pct, price_floor,
        sales_notes, internal_notes]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Product group not found' });
    }
    
    logger.info(`CRM: Product group ${id} updated successfully`);
    res.json({ success: true, data: result.rows[0], message: 'Product group updated successfully' });
  } catch (error) {
    logger.error('Error updating product group:', error);
    res.status(500).json({ success: false, error: 'Failed to update product group', message: error.message });
  }
});

// GET /api/crm/products/:id/config — fetch per-group specification config
router.get('/products/:id/config', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT * FROM crm_product_group_config WHERE product_group_id = $1`, [id]
    );
    res.json({ success: true, data: result.rows[0] || null });
  } catch (error) {
    logger.error('Error fetching product group config:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch config' });
  }
});

// PUT /api/crm/products/:id/config — upsert per-group specification config
router.put('/products/:id/config', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const {
      available_dimensions, default_dimensions,
      available_units, default_unit,
      available_materials, available_processes, available_machines,
      notes,
    } = req.body;

    const result = await pool.query(`
      INSERT INTO crm_product_group_config
        (product_group_id, available_dimensions, default_dimensions,
         available_units, default_unit,
         available_materials, available_processes, available_machines, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (product_group_id) DO UPDATE SET
        available_dimensions = COALESCE($2, crm_product_group_config.available_dimensions),
        default_dimensions   = COALESCE($3, crm_product_group_config.default_dimensions),
        available_units      = COALESCE($4, crm_product_group_config.available_units),
        default_unit         = COALESCE($5, crm_product_group_config.default_unit),
        available_materials  = COALESCE($6, crm_product_group_config.available_materials),
        available_processes  = COALESCE($7, crm_product_group_config.available_processes),
        available_machines   = COALESCE($8, crm_product_group_config.available_machines),
        notes                = COALESCE($9, crm_product_group_config.notes),
        updated_at           = NOW()
      RETURNING *
    `, [
      id,
      available_dimensions ? JSON.stringify(available_dimensions) : null,
      default_dimensions ? JSON.stringify(default_dimensions) : null,
      available_units ? JSON.stringify(available_units) : null,
      default_unit || null,
      available_materials ? JSON.stringify(available_materials) : null,
      available_processes ? JSON.stringify(available_processes) : null,
      available_machines ? JSON.stringify(available_machines) : null,
      notes || null,
    ]);

    logger.info(`CRM: Product group ${id} config updated`);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating product group config:', error);
    res.status(500).json({ success: false, error: 'Failed to update config' });
  }
});

module.exports = router;
