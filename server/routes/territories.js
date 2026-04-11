/**
 * Territories and Sales Hierarchy Routes
 * API endpoints for territory management, sales persons, and targets
 * All dynamically linked to divisions
 */

const express = require('express');
const router = express.Router();
const { authPool } = require('../database/config');
const { authenticate, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

// All routes require authentication
router.use(authenticate);

// ===================== TERRITORIES =====================

/**
 * GET /api/territories
 * Get all territories with optional filters
 */
router.get('/', async (req, res) => {
  try {
    const { divisionCode, parentId, isActive } = req.query;
    
    let query = `
      SELECT t.*, p.name AS parent_name,
        (SELECT COUNT(*) FROM territories c WHERE c.parent_id = t.id) AS child_count,
        (SELECT COUNT(*) FROM sales_persons sp WHERE sp.territory_id = t.id) AS sales_person_count
      FROM territories t
      LEFT JOIN territories p ON t.parent_id = p.id
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;
    
    if (divisionCode) {
      query += ` AND t.division_code = $${paramIdx++}`;
      params.push(divisionCode);
    }
    if (parentId) {
      query += ` AND t.parent_id = $${paramIdx++}`;
      params.push(parentId);
    }
    if (isActive !== undefined) {
      query += ` AND t.is_active = $${paramIdx++}`;
      params.push(isActive === 'true');
    }
    
    query += ' ORDER BY t.lft, t.name';
    
    const result = await authPool.query(query, params);
    res.json({ success: true, territories: result.rows });
  } catch (error) {
    logger.error('Get territories error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/territories/tree
 * Get territory tree structure
 */
router.get('/tree', async (req, res) => {
  try {
    const { divisionCode } = req.query;
    
    let query = `
      SELECT t.*, 
        (SELECT COUNT(*) FROM sales_persons sp WHERE sp.territory_id = t.id) AS sales_person_count
      FROM territories t
      WHERE is_active = true
    `;
    const params = [];
    
    if (divisionCode) {
      query += ' AND division_code = $1';
      params.push(divisionCode);
    }
    
    query += ' ORDER BY lft';
    
    const result = await authPool.query(query, params);
    
    // Build tree structure
    const buildTree = (items, parentId = null) => {
      return items
        .filter(item => item.parent_id === parentId)
        .map(item => ({
          ...item,
          children: buildTree(items, item.id)
        }));
    };
    
    const tree = buildTree(result.rows);
    res.json({ success: true, tree });
  } catch (error) {
    logger.error('Get territory tree error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/territories/:id
 * Get a specific territory
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await authPool.query(`
      SELECT t.*, p.name AS parent_name,
        (SELECT json_agg(row_to_json(sp.*)) FROM sales_persons sp WHERE sp.territory_id = t.id) AS sales_persons
      FROM territories t
      LEFT JOIN territories p ON t.parent_id = p.id
      WHERE t.id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Territory not found' });
    }
    
    res.json({ success: true, territory: result.rows[0] });
  } catch (error) {
    logger.error('Get territory error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/territories
 * Create a new territory (admin only)
 */
router.post('/', requireRole('admin'), async (req, res) => {
  const client = await authPool.connect();
  try {
    await client.query('BEGIN');
    
    const { name, code, divisionCode, parentId, description } = req.body;
    
    // Get the next left/right values for nested set
    let lft, rgt;
    if (parentId) {
      const parent = await client.query('SELECT rgt FROM territories WHERE id = $1', [parentId]);
      if (parent.rows.length === 0) {
        throw new Error('Parent territory not found');
      }
      lft = parent.rows[0].rgt;
      rgt = lft + 1;
      
      // Make room for the new node
      await client.query('UPDATE territories SET rgt = rgt + 2 WHERE rgt >= $1', [lft]);
      await client.query('UPDATE territories SET lft = lft + 2 WHERE lft > $1', [lft]);
    } else {
      const maxRgt = await client.query('SELECT COALESCE(MAX(rgt), 0) AS max_rgt FROM territories WHERE division_code = $1', [divisionCode]);
      lft = maxRgt.rows[0].max_rgt + 1;
      rgt = lft + 1;
    }
    
    const result = await client.query(`
      INSERT INTO territories (name, code, division_code, parent_id, description, lft, rgt)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [name, code, divisionCode, parentId, description, lft, rgt]);
    
    await client.query('COMMIT');
    res.json({ success: true, territory: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Create territory error:', error);
    res.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/territories/:id
 * Update a territory (admin only)
 */
router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, code, description, isActive } = req.body;
    
    const result = await authPool.query(`
      UPDATE territories 
      SET name = COALESCE($1, name),
          code = COALESCE($2, code),
          description = COALESCE($3, description),
          is_active = COALESCE($4, is_active),
          updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [name, code, description, isActive, req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Territory not found' });
    }
    
    res.json({ success: true, territory: result.rows[0] });
  } catch (error) {
    logger.error('Update territory error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/territories/:id
 * Delete a territory (admin only)
 */
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const client = await authPool.connect();
  try {
    await client.query('BEGIN');
    
    // Get the territory's left and right values
    const territory = await client.query('SELECT lft, rgt FROM territories WHERE id = $1', [req.params.id]);
    if (territory.rows.length === 0) {
      throw new Error('Territory not found');
    }
    
    const { lft, rgt } = territory.rows[0];
    const width = rgt - lft + 1;
    
    // Check if it has sales persons
    const hasSalesPersons = await client.query(
      'SELECT COUNT(*) FROM sales_persons WHERE territory_id IN (SELECT id FROM territories WHERE lft BETWEEN $1 AND $2)',
      [lft, rgt]
    );
    
    if (parseInt(hasSalesPersons.rows[0].count) > 0) {
      throw new Error('Cannot delete territory with assigned sales persons');
    }
    
    // Delete the territory and all children
    await client.query('DELETE FROM territories WHERE lft BETWEEN $1 AND $2', [lft, rgt]);
    
    // Adjust the remaining nodes
    await client.query('UPDATE territories SET rgt = rgt - $1 WHERE rgt > $2', [width, rgt]);
    await client.query('UPDATE territories SET lft = lft - $1 WHERE lft > $2', [width, rgt]);
    
    await client.query('COMMIT');
    res.json({ success: true, message: 'Territory deleted' });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Delete territory error:', error);
    res.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
});

// ===================== SALES PERSONS =====================

/**
 * GET /api/territories/sales-persons/list
 * Get all sales persons
 */
router.get('/sales-persons/list', async (req, res) => {
  try {
    const { divisionCode, territoryId, isEnabled } = req.query;
    
    let query = `
      SELECT sp.*, 
        e.first_name, e.last_name, e.full_name, e.employee_code,
        t.name AS territory_name, t.code,
        p.name AS parent_name,
        (SELECT COUNT(*) FROM sales_persons c WHERE c.parent_id = sp.id) AS team_size
      FROM sales_persons sp
      LEFT JOIN employees e ON sp.employee_id = e.id
      LEFT JOIN territories t ON sp.territory_id = t.id
      LEFT JOIN sales_persons p ON sp.parent_id = p.id
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;
    
    if (divisionCode) {
      query += ` AND sp.division_code = $${paramIdx++}`;
      params.push(divisionCode);
    }
    if (territoryId) {
      query += ` AND sp.territory_id = $${paramIdx++}`;
      params.push(territoryId);
    }
    if (isEnabled !== undefined) {
      query += ` AND sp.is_enabled = $${paramIdx++}`;
      params.push(isEnabled === 'true');
    }
    
    query += ' ORDER BY sp.lft, sp.name';
    
    const result = await authPool.query(query, params);
    res.json({ success: true, salesPersons: result.rows });
  } catch (error) {
    logger.error('Get sales persons error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/territories/sales-persons/tree
 * Get sales person hierarchy as tree
 */
router.get('/sales-persons/tree', async (req, res) => {
  try {
    const { divisionCode } = req.query;
    
    let query = `
      SELECT sp.*, 
        e.first_name, e.last_name, e.full_name, e.employee_code, e.photo_url,
        t.name AS territory_name
      FROM sales_persons sp
      LEFT JOIN employees e ON sp.employee_id = e.id
      LEFT JOIN territories t ON sp.territory_id = t.id
      WHERE sp.is_enabled = true
    `;
    const params = [];
    
    if (divisionCode) {
      query += ' AND sp.division_code = $1';
      params.push(divisionCode);
    }
    
    query += ' ORDER BY sp.lft';
    
    const result = await authPool.query(query, params);
    
    // Build tree structure
    const buildTree = (items, parentId = null) => {
      return items
        .filter(item => item.parent_id === parentId)
        .map(item => ({
          ...item,
          children: buildTree(items, item.id)
        }));
    };
    
    const tree = buildTree(result.rows);
    res.json({ success: true, tree });
  } catch (error) {
    logger.error('Get sales person tree error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/territories/sales-persons
 * Create a sales person (admin only)
 */
router.post('/sales-persons', requireRole('admin'), async (req, res) => {
  const client = await authPool.connect();
  try {
    await client.query('BEGIN');
    
    const { name, employeeId, territoryId, divisionCode, parentId, commissionRate } = req.body;
    
    // Get next left/right for nested set
    let lft, rgt;
    if (parentId) {
      const parent = await client.query('SELECT rgt FROM sales_persons WHERE id = $1', [parentId]);
      if (parent.rows.length === 0) {
        throw new Error('Parent sales person not found');
      }
      lft = parent.rows[0].rgt;
      rgt = lft + 1;
      
      await client.query('UPDATE sales_persons SET rgt = rgt + 2 WHERE rgt >= $1', [lft]);
      await client.query('UPDATE sales_persons SET lft = lft + 2 WHERE lft > $1', [lft]);
    } else {
      const maxRgt = await client.query('SELECT COALESCE(MAX(rgt), 0) AS max_rgt FROM sales_persons WHERE division_code = $1', [divisionCode]);
      lft = maxRgt.rows[0].max_rgt + 1;
      rgt = lft + 1;
    }
    
    const result = await client.query(`
      INSERT INTO sales_persons (name, employee_id, territory_id, division_code, parent_id, commission_rate, lft, rgt)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [name, employeeId, territoryId, divisionCode, parentId, commissionRate || 0, lft, rgt]);
    
    await client.query('COMMIT');
    res.json({ success: true, salesPerson: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Create sales person error:', error);
    res.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/territories/sales-persons/:id
 * Update a sales person (admin only)
 */
router.put('/sales-persons/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, territoryId, commissionRate, isEnabled } = req.body;
    
    const result = await authPool.query(`
      UPDATE sales_persons 
      SET name = COALESCE($1, name),
          territory_id = COALESCE($2, territory_id),
          commission_rate = COALESCE($3, commission_rate),
          is_enabled = COALESCE($4, is_enabled),
          updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [name, territoryId, commissionRate, isEnabled, req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sales person not found' });
    }
    
    res.json({ success: true, salesPerson: result.rows[0] });
  } catch (error) {
    logger.error('Update sales person error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/territories/sales-persons/:id
 * Delete a sales person (admin only)
 */
router.delete('/sales-persons/:id', requireRole('admin'), async (req, res) => {
  const client = await authPool.connect();
  try {
    await client.query('BEGIN');
    
    // Get the sales person's left and right values
    const sp = await client.query('SELECT lft, rgt FROM sales_persons WHERE id = $1', [req.params.id]);
    if (sp.rows.length === 0) {
      throw new Error('Sales person not found');
    }
    
    const { lft, rgt } = sp.rows[0];
    const width = rgt - lft + 1;
    
    // Check if it has children
    if (width > 2) {
      throw new Error('Cannot delete sales person with team members. Reassign them first.');
    }
    
    // Delete sales targets
    await client.query('DELETE FROM sales_targets WHERE sales_person_id = $1', [req.params.id]);
    
    // Delete the sales person
    await client.query('DELETE FROM sales_persons WHERE id = $1', [req.params.id]);
    
    // Adjust remaining nodes
    await client.query('UPDATE sales_persons SET rgt = rgt - $1 WHERE rgt > $2', [width, rgt]);
    await client.query('UPDATE sales_persons SET lft = lft - $1 WHERE lft > $2', [width, rgt]);
    
    await client.query('COMMIT');
    res.json({ success: true, message: 'Sales person deleted' });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Delete sales person error:', error);
    res.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
});

// ===================== SALES TARGETS =====================

/**
 * GET /api/territories/targets/list
 * Get sales targets
 */
router.get('/targets/list', async (req, res) => {
  try {
    const { salesPersonId, territoryId, fiscalYear, divisionCode } = req.query;
    
    let query = `
      SELECT st.*, 
        sp.name AS sales_person_name,
        e.full_name AS employee_name,
        t.name AS territory_name
      FROM sales_targets st
      LEFT JOIN sales_persons sp ON st.sales_person_id = sp.id
      LEFT JOIN employees e ON st.employee_id = e.id
      LEFT JOIN territories t ON st.territory_id = t.id
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;
    
    if (salesPersonId) {
      query += ` AND st.sales_person_id = $${paramIdx++}`;
      params.push(salesPersonId);
    }
    if (territoryId) {
      query += ` AND st.territory_id = $${paramIdx++}`;
      params.push(territoryId);
    }
    if (fiscalYear) {
      query += ` AND st.fiscal_year = $${paramIdx++}`;
      params.push(fiscalYear);
    }
    if (divisionCode) {
      query += ` AND st.division_code = $${paramIdx++}`;
      params.push(divisionCode);
    }
    
    query += ' ORDER BY st.fiscal_year DESC, st.period_value DESC';
    
    const result = await authPool.query(query, params);
    res.json({ success: true, targets: result.rows });
  } catch (error) {
    logger.error('Get sales targets error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/territories/targets
 * Create/update sales targets (admin only)
 */
router.post('/targets', requireRole('admin'), async (req, res) => {
  try {
    const { salesPersonId, employeeId, territoryId, divisionCode, fiscalYear, periodType, periodValue, targetAmount, targetQty, targetCurrency, itemGroup } = req.body;
    
    const result = await authPool.query(`
      INSERT INTO sales_targets (sales_person_id, employee_id, territory_id, division_code, fiscal_year, period_type, period_value, target_amount, target_qty, target_currency, item_group)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [salesPersonId, employeeId, territoryId, divisionCode, fiscalYear, periodType || 'monthly', periodValue, targetAmount || 0, targetQty || 0, targetCurrency || 'AED', itemGroup]);
    
    res.json({ success: true, target: result.rows[0] });
  } catch (error) {
    logger.error('Create sales target error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/territories/targets/:id
 * Update a sales target (admin only)
 */
router.put('/targets/:id', requireRole('admin'), async (req, res) => {
  try {
    const { targetAmount, targetQty, targetCurrency } = req.body;
    
    const result = await authPool.query(`
      UPDATE sales_targets 
      SET target_amount = COALESCE($1, target_amount),
          target_qty = COALESCE($2, target_qty),
          target_currency = COALESCE($3, target_currency),
          updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [targetAmount, targetQty, targetCurrency, req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Target not found' });
    }
    
    res.json({ success: true, target: result.rows[0] });
  } catch (error) {
    logger.error('Update sales target error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/territories/targets/:id
 * Delete a sales target (admin only)
 */
router.delete('/targets/:id', requireRole('admin'), async (req, res) => {
  try {
    await authPool.query('DELETE FROM sales_targets WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Target deleted' });
  } catch (error) {
    logger.error('Delete sales target error:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
