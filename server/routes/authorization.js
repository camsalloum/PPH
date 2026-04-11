/**
 * Authorization Rules Routes
 * API endpoints for approval workflows and authorization rules
 * All dynamically linked to divisions
 */

const express = require('express');
const router = express.Router();
const { authPool } = require('../database/config');
const { authenticate, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

// All routes require authentication
router.use(authenticate);

// ===================== AUTHORIZATION RULES =====================

/**
 * GET /api/authorization/rules
 * Get all authorization rules
 */
router.get('/rules', async (req, res) => {
  try {
    const { divisionCode, transactionType, isActive } = req.query;
    
    let query = `
      SELECT ar.*,
        r.label AS approving_role_name,
        e.full_name AS approving_employee_name,
        d.name AS approving_designation_name,
        r2.label AS applies_to_role_name
      FROM authorization_rules ar
      LEFT JOIN roles r ON ar.approving_role_id = r.id
      LEFT JOIN employees e ON ar.approving_employee_id = e.id
      LEFT JOIN designations d ON ar.approving_designation_id = d.id
      LEFT JOIN roles r2 ON ar.applies_to_role_id = r2.id
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;
    
    if (divisionCode) {
      query += ` AND ar.division_code = $${paramIdx++}`;
      params.push(divisionCode);
    }
    if (transactionType) {
      query += ` AND ar.transaction_type = $${paramIdx++}`;
      params.push(transactionType);
    }
    if (isActive !== undefined) {
      query += ` AND ar.is_active = $${paramIdx++}`;
      params.push(isActive === 'true');
    }
    
    query += ' ORDER BY ar.priority ASC, ar.name';
    
    const result = await authPool.query(query, params);
    res.json({ success: true, rules: result.rows });
  } catch (error) {
    logger.error('Get authorization rules error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/authorization/transaction-types
 * Get available transaction types for authorization
 */
router.get('/transaction-types', async (req, res) => {
  try {
    const transactionTypes = [
      { value: 'sales_order', label: 'Sales Order', description: 'Sales orders approval' },
      { value: 'budget', label: 'Budget', description: 'Budget submissions' },
      { value: 'discount', label: 'Discount', description: 'Discount approvals' },
      { value: 'expense', label: 'Expense', description: 'Expense claims' },
      { value: 'refund', label: 'Refund', description: 'Refund requests' },
      { value: 'credit_limit', label: 'Credit Limit', description: 'Credit limit changes' },
      { value: 'price_change', label: 'Price Change', description: 'Price modifications' },
      { value: 'new_customer', label: 'New Customer', description: 'New customer creation' }
    ];
    res.json({ success: true, transactionTypes });
  } catch (error) {
    logger.error('Get transaction types error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/authorization/rules/:id
 * Get a specific authorization rule
 */
router.get('/rules/:id', async (req, res) => {
  try {
    const result = await authPool.query(`
      SELECT ar.*,
        r.label AS approving_role_name,
        e.full_name AS approving_employee_name,
        d.name AS approving_designation_name,
        r2.label AS applies_to_role_name
      FROM authorization_rules ar
      LEFT JOIN roles r ON ar.approving_role_id = r.id
      LEFT JOIN employees e ON ar.approving_employee_id = e.id
      LEFT JOIN designations d ON ar.approving_designation_id = d.id
      LEFT JOIN roles r2 ON ar.applies_to_role_id = r2.id
      WHERE ar.id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    
    res.json({ success: true, rule: result.rows[0] });
  } catch (error) {
    logger.error('Get authorization rule error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/authorization/rules
 * Create an authorization rule (admin only)
 */
router.post('/rules', requireRole('admin'), async (req, res) => {
  try {
    const { 
      name, 
      divisionCode, 
      transactionType, 
      basedOn, 
      conditionOperator, 
      conditionValue,
      approvingRoleId,
      approvingEmployeeId,
      approvingDesignationId,
      appliesToRoleId,
      appliesToDesignationId,
      priority
    } = req.body;
    
    const result = await authPool.query(`
      INSERT INTO authorization_rules (
        name, division_code, transaction_type, based_on, condition_operator, 
        condition_value, approving_role_id, approving_employee_id, approving_designation_id,
        applies_to_role_id, applies_to_designation_id, priority
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      name, 
      divisionCode, 
      transactionType, 
      basedOn || 'amount', 
      conditionOperator || '>=', 
      conditionValue,
      approvingRoleId,
      approvingEmployeeId,
      approvingDesignationId,
      appliesToRoleId,
      appliesToDesignationId,
      priority || 100
    ]);
    
    res.json({ success: true, rule: result.rows[0] });
  } catch (error) {
    logger.error('Create authorization rule error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/authorization/rules/:id
 * Update an authorization rule (admin only)
 */
router.put('/rules/:id', requireRole('admin'), async (req, res) => {
  try {
    const { 
      name, 
      transactionType,
      basedOn, 
      conditionOperator, 
      conditionValue,
      approvingRoleId,
      approvingEmployeeId,
      approvingDesignationId,
      appliesToRoleId,
      priority,
      isActive
    } = req.body;
    
    const result = await authPool.query(`
      UPDATE authorization_rules 
      SET name = COALESCE($1, name),
          transaction_type = COALESCE($2, transaction_type),
          based_on = COALESCE($3, based_on),
          condition_operator = COALESCE($4, condition_operator),
          condition_value = COALESCE($5, condition_value),
          approving_role_id = COALESCE($6, approving_role_id),
          approving_employee_id = COALESCE($7, approving_employee_id),
          approving_designation_id = COALESCE($8, approving_designation_id),
          applies_to_role_id = COALESCE($9, applies_to_role_id),
          priority = COALESCE($10, priority),
          is_active = COALESCE($11, is_active),
          updated_at = NOW()
      WHERE id = $12
      RETURNING *
    `, [name, transactionType, basedOn, conditionOperator, conditionValue, approvingRoleId, approvingEmployeeId, approvingDesignationId, appliesToRoleId, priority, isActive, req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    
    res.json({ success: true, rule: result.rows[0] });
  } catch (error) {
    logger.error('Update authorization rule error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/authorization/rules/:id
 * Delete an authorization rule (admin only)
 */
router.delete('/rules/:id', requireRole('admin'), async (req, res) => {
  try {
    // Check if rule has pending approvals
    const pending = await authPool.query(
      "SELECT COUNT(*) FROM approval_requests WHERE rule_id = $1 AND status = 'pending'",
      [req.params.id]
    );
    
    if (parseInt(pending.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete rule with pending approvals' });
    }
    
    await authPool.query('DELETE FROM authorization_rules WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Rule deleted' });
  } catch (error) {
    logger.error('Delete authorization rule error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ===================== CHECK AUTHORIZATION =====================

/**
 * POST /api/authorization/check
 * Check if a transaction requires authorization based on rules
 */
router.post('/check', async (req, res) => {
  try {
    const { transactionType, divisionCode, amount, discountPercent, quantity, userRoleId, userDesignationId } = req.body;
    
    // Get applicable rules for this transaction type and division
    let query = `
      SELECT * FROM authorization_rules 
      WHERE transaction_type = $1 
        AND (division_code = $2 OR division_code IS NULL)
        AND is_active = true
    `;
    const params = [transactionType, divisionCode];
    
    // Filter by who this applies to
    if (userRoleId) {
      query += ` AND (applies_to_role_id IS NULL OR applies_to_role_id = $3)`;
      params.push(userRoleId);
    }
    
    query += ' ORDER BY priority ASC';
    
    const rules = await authPool.query(query, params);
    
    // Evaluate each rule
    const matchedRules = [];
    for (const rule of rules.rows) {
      let valueToCheck;
      switch (rule.based_on) {
        case 'amount':
          valueToCheck = parseFloat(amount) || 0;
          break;
        case 'discount_percent':
          valueToCheck = parseFloat(discountPercent) || 0;
          break;
        case 'quantity':
          valueToCheck = parseFloat(quantity) || 0;
          break;
        default:
          valueToCheck = parseFloat(amount) || 0;
      }
      
      const threshold = parseFloat(rule.condition_value);
      let matches = false;
      
      switch (rule.condition_operator) {
        case '>':
          matches = valueToCheck > threshold;
          break;
        case '>=':
          matches = valueToCheck >= threshold;
          break;
        case '<':
          matches = valueToCheck < threshold;
          break;
        case '<=':
          matches = valueToCheck <= threshold;
          break;
        case '=':
          matches = valueToCheck === threshold;
          break;
        default:
          matches = valueToCheck >= threshold;
      }
      
      if (matches) {
        matchedRules.push(rule);
      }
    }
    
    const requiresApproval = matchedRules.length > 0;
    
    res.json({ 
      success: true, 
      requiresApproval,
      matchedRules: matchedRules.map(r => ({
        id: r.id,
        name: r.name,
        transactionType: r.transaction_type,
        basedOn: r.based_on,
        threshold: r.condition_value,
        approvingRoleId: r.approving_role_id,
        approvingEmployeeId: r.approving_employee_id,
        approvingDesignationId: r.approving_designation_id
      }))
    });
  } catch (error) {
    logger.error('Check authorization error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===================== APPROVAL REQUESTS =====================

/**
 * GET /api/authorization/approvals
 * Get approval requests
 */
router.get('/approvals', async (req, res) => {
  try {
    const { status, divisionCode, transactionType, requestedBy } = req.query;
    
    let query = `
      SELECT ar.*, 
        rule.name AS rule_name,
        e.full_name AS requested_by_name
      FROM approval_requests ar
      LEFT JOIN authorization_rules rule ON ar.authorization_rule_id = rule.id
      LEFT JOIN employees e ON ar.requested_by = e.id
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;
    
    if (status) {
      query += ` AND ar.status = $${paramIdx++}`;
      params.push(status);
    }
    if (divisionCode) {
      query += ` AND ar.division_code = $${paramIdx++}`;
      params.push(divisionCode);
    }
    if (transactionType) {
      query += ` AND ar.transaction_type = $${paramIdx++}`;
      params.push(transactionType);
    }
    if (requestedBy) {
      query += ` AND ar.requested_by = $${paramIdx++}`;
      params.push(requestedBy);
    }
    
    query += ' ORDER BY ar.created_at DESC';
    
    const result = await authPool.query(query, params);
    res.json({ success: true, approvals: result.rows });
  } catch (error) {
    logger.error('Get approval requests error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/authorization/approvals/my-pending
 * Get approval requests pending for current user
 */
router.get('/approvals/my-pending', async (req, res) => {
  try {
    // Get user's role and employee info
    const userResult = await authPool.query(`
      SELECT u.role, e.id AS employee_id, e.designation_id
      FROM users u
      LEFT JOIN employees e ON e.user_id = u.id
      WHERE u.id = $1
    `, [req.user.id]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const { role, employee_id, designation_id } = userResult.rows[0];
    
    // Get role ID
    const roleResult = await authPool.query('SELECT id FROM roles WHERE value = $1', [role]);
    const roleId = roleResult.rows.length > 0 ? roleResult.rows[0].id : null;
    
    // Get pending approvals where user can approve
    let query = `
      SELECT ar.*, 
        rule.name AS rule_name,
        e.full_name AS requested_by_name
      FROM approval_requests ar
      JOIN authorization_rules rule ON ar.authorization_rule_id = rule.id
      JOIN employees e ON ar.requested_by = e.id
      WHERE ar.status = 'pending'
        AND (
          rule.approving_role_id = $1
          OR rule.approving_employee_id = $2
          OR rule.approving_designation_id = $3
        )
      ORDER BY ar.created_at DESC
    `;
    
    const result = await authPool.query(query, [roleId, employee_id, designation_id]);
    res.json({ success: true, approvals: result.rows });
  } catch (error) {
    logger.error('Get my pending approvals error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/authorization/approvals
 * Create an approval request
 */
router.post('/approvals', async (req, res) => {
  try {
    const { ruleId, transactionType, transactionId, divisionCode, transactionData, notes } = req.body;
    
    const result = await authPool.query(`
      INSERT INTO approval_requests (
        authorization_rule_id, transaction_type, transaction_id, division_code, 
        request_details, requested_by, request_amount
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [ruleId, transactionType, transactionId, divisionCode, JSON.stringify(transactionData || {}), req.user.id, transactionData?.amount || 0]);
    
    res.json({ success: true, approval: result.rows[0] });
  } catch (error) {
    logger.error('Create approval request error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/authorization/approvals/:id/approve
 * Approve a request
 */
router.put('/approvals/:id/approve', async (req, res) => {
  try {
    const { comments } = req.body;
    
    const request = await authPool.query(
      "SELECT status FROM approval_requests WHERE id = $1",
      [req.params.id]
    );
    
    if (request.rows.length === 0) {
      return res.status(404).json({ error: 'Approval request not found' });
    }
    
    if (request.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Request is not pending' });
    }
    
    const result = await authPool.query(`
      UPDATE approval_requests 
      SET status = 'approved',
          approved_by = $1,
          approval_date = NOW(),
          approval_notes = $2,
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [req.user.id, comments, req.params.id]);
    
    res.json({ success: true, approval: result.rows[0] });
  } catch (error) {
    logger.error('Approve request error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/authorization/approvals/:id/reject
 * Reject a request
 */
router.put('/approvals/:id/reject', async (req, res) => {
  try {
    const { comments } = req.body;
    
    if (!comments) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }
    
    const request = await authPool.query(
      "SELECT status FROM approval_requests WHERE id = $1",
      [req.params.id]
    );
    
    if (request.rows.length === 0) {
      return res.status(404).json({ error: 'Approval request not found' });
    }
    
    if (request.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Request is not pending' });
    }
    
    const result = await authPool.query(`
      UPDATE approval_requests 
      SET status = 'rejected',
          approved_by = $1,
          approval_date = NOW(),
          approval_notes = $2,
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [req.user.id, comments, req.params.id]);
    
    res.json({ success: true, approval: result.rows[0] });
  } catch (error) {
    logger.error('Reject request error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ===================== APPROVAL DELEGATIONS =====================

/**
 * GET /api/authorization/delegations
 * Get current user's delegations
 */
router.get('/delegations', async (req, res) => {
  try {
    const result = await authPool.query(`
      SELECT ad.*, 
        tu.name AS to_user_name, tu.email AS to_user_email
      FROM approval_delegations ad
      JOIN users tu ON ad.to_user_id = tu.id
      WHERE ad.from_user_id = $1
      ORDER BY ad.created_at DESC
    `, [req.user.id]);
    
    res.json({ success: true, delegations: result.rows });
  } catch (error) {
    logger.error('Get delegations error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/authorization/delegations
 * Create or update approval delegation
 */
router.post('/delegations', async (req, res) => {
  try {
    const { toUserId, startDate, endDate, reason } = req.body;
    
    if (!toUserId || !startDate || !endDate) {
      return res.status(400).json({ error: 'toUserId, startDate, and endDate are required' });
    }
    
    if (parseInt(toUserId) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delegate to yourself' });
    }
    
    // Deactivate existing delegations
    await authPool.query(
      'UPDATE approval_delegations SET is_active = FALSE WHERE from_user_id = $1',
      [req.user.id]
    );
    
    // Create new delegation
    const result = await authPool.query(`
      INSERT INTO approval_delegations (from_user_id, to_user_id, start_date, end_date, reason)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [req.user.id, toUserId, startDate, endDate, reason || null]);
    
    res.json({ success: true, delegation: result.rows[0] });
  } catch (error) {
    logger.error('Create delegation error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/authorization/delegations/:id
 * Cancel a delegation
 */
router.delete('/delegations/:id', async (req, res) => {
  try {
    const result = await authPool.query(`
      UPDATE approval_delegations 
      SET is_active = FALSE 
      WHERE id = $1 AND from_user_id = $2
      RETURNING id
    `, [req.params.id, req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Delegation not found or not yours' });
    }
    
    res.json({ success: true, message: 'Delegation cancelled' });
  } catch (error) {
    logger.error('Cancel delegation error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ===================== APPROVAL HISTORY =====================

/**
 * GET /api/authorization/approvals/:id/history
 * Get approval status history
 */
router.get('/approvals/:id/history', async (req, res) => {
  try {
    const result = await authPool.query(`
      SELECT ash.*, u.name AS changed_by_name
      FROM approval_status_history ash
      LEFT JOIN users u ON ash.changed_by = u.id
      WHERE ash.approval_request_id = $1
      ORDER BY ash.created_at ASC
    `, [req.params.id]);
    
    res.json({ success: true, history: result.rows });
  } catch (error) {
    logger.error('Get approval history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===================== APPROVAL NOTIFICATIONS =====================

/**
 * GET /api/authorization/notifications
 * Get current user's approval notifications
 */
router.get('/notifications', async (req, res) => {
  try {
    const result = await authPool.query(`
      SELECT an.*, 
        ar.transaction_type, ar.transaction_id, ar.status AS request_status,
        ar.request_amount, ar.created_at AS request_date
      FROM approval_notifications an
      JOIN approval_requests ar ON an.approval_request_id = ar.id
      WHERE an.recipient_user_id = $1
      ORDER BY an.created_at DESC
      LIMIT 50
    `, [req.user.id]);
    
    res.json({ success: true, notifications: result.rows });
  } catch (error) {
    logger.error('Get notifications error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/authorization/notifications/:id/read
 * Mark notification as read
 */
router.put('/notifications/:id/read', async (req, res) => {
  try {
    await authPool.query(`
      UPDATE approval_notifications 
      SET read_at = NOW() 
      WHERE id = $1 AND recipient_user_id = $2
    `, [req.params.id, req.user.id]);
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Mark notification read error:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
