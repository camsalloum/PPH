/**
 * Authorization Workflow Service
 * Handles approval requests and authorization rule enforcement
 * Part of: User Management Module Implementation - Phase 5
 * Date: December 25, 2025
 */

const { authPool } = require('../database');
const logger = require('../utils/logger');

class AuthorizationService {
  /**
   * Get authorization rules with filters
   */
  async getRules(filters = {}) {
    try {
      let query = `
        SELECT 
          ar.*,
          r_approving.label AS approving_role_name,
          r_applies.label AS applies_to_role_name,
          d_approving.name AS approving_designation_name,
          d_applies.name AS applies_to_designation_name,
          e.full_name AS approving_employee_name
        FROM authorization_rules ar
        LEFT JOIN roles r_approving ON ar.approving_role_id = r_approving.id
        LEFT JOIN roles r_applies ON ar.applies_to_role_id = r_applies.id
        LEFT JOIN designations d_approving ON ar.approving_designation_id = d_approving.id
        LEFT JOIN designations d_applies ON ar.applies_to_designation_id = d_applies.id
        LEFT JOIN employees e ON ar.approving_employee_id = e.id
        WHERE 1=1
      `;

      const params = [];
      if (filters.divisionCode) {
        params.push(filters.divisionCode);
        query += ` AND (ar.division_code = $${params.length} OR ar.division_code IS NULL)`;
      }
      if (filters.transactionType) {
        params.push(filters.transactionType);
        query += ` AND ar.transaction_type = $${params.length}`;
      }
      if (filters.isActive !== undefined) {
        params.push(filters.isActive);
        query += ` AND ar.is_active = $${params.length}`;
      }

      query += ` ORDER BY ar.priority, ar.transaction_type`;

      const result = await authPool.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting authorization rules:', error);
      throw error;
    }
  }

  /**
   * Create an authorization rule
   */
  async createRule(data, createdBy) {
    try {
      const result = await authPool.query(`
        INSERT INTO authorization_rules (
          name, division_code, transaction_type, based_on,
          condition_operator, condition_value,
          approving_role_id, approving_employee_id, approving_designation_id,
          applies_to_role_id, applies_to_designation_id,
          priority, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `, [
        data.name,
        data.division_code || null,
        data.transaction_type,
        data.based_on,
        data.condition_operator || '>=',
        data.condition_value,
        data.approving_role_id || null,
        data.approving_employee_id || null,
        data.approving_designation_id || null,
        data.applies_to_role_id || null,
        data.applies_to_designation_id || null,
        data.priority || 100,
        data.is_active !== false
      ]);

      logger.info(`Created authorization rule ${result.rows[0].id} by user ${createdBy}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating authorization rule:', error);
      throw error;
    }
  }

  /**
   * Update an authorization rule
   */
  async updateRule(id, data, updatedBy) {
    try {
      const setClauses = [];
      const params = [id];
      let paramIndex = 2;

      const allowedFields = [
        'name', 'division_code', 'transaction_type', 'based_on',
        'condition_operator', 'condition_value',
        'approving_role_id', 'approving_employee_id', 'approving_designation_id',
        'applies_to_role_id', 'applies_to_designation_id',
        'priority', 'is_active'
      ];

      allowedFields.forEach(field => {
        if (data[field] !== undefined) {
          setClauses.push(`${field} = $${paramIndex}`);
          params.push(data[field]);
          paramIndex++;
        }
      });

      if (setClauses.length === 0) {
        throw new Error('No fields to update');
      }

      setClauses.push('updated_at = NOW()');

      const result = await authPool.query(`
        UPDATE authorization_rules SET ${setClauses.join(', ')}
        WHERE id = $1
        RETURNING *
      `, params);

      if (result.rows.length === 0) {
        throw new Error('Rule not found');
      }

      logger.info(`Updated authorization rule ${id} by user ${updatedBy}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating authorization rule:', error);
      throw error;
    }
  }

  /**
   * Delete an authorization rule
   */
  async deleteRule(id, deletedBy) {
    try {
      const result = await authPool.query(
        'DELETE FROM authorization_rules WHERE id = $1 RETURNING id',
        [id]
      );

      if (result.rows.length === 0) {
        throw new Error('Rule not found');
      }

      logger.info(`Deleted authorization rule ${id} by user ${deletedBy}`);
      return { success: true };
    } catch (error) {
      logger.error('Error deleting authorization rule:', error);
      throw error;
    }
  }

  /**
   * Check if a transaction requires approval and create request if needed
   * @param {Object} transaction - The transaction to check
   * @param {number} userId - The user submitting the transaction
   * @returns {Object} { requiresApproval: boolean, approvalRequest?: object }
   */
  async checkAndCreateApproval(transaction, userId) {
    const client = await authPool.connect();
    try {
      await client.query('BEGIN');

      // Get user's role and designation
      const userResult = await client.query(`
        SELECT 
          u.id, u.role,
          e.designation_id,
          d.level AS designation_level
        FROM users u
        LEFT JOIN employees e ON u.employee_id = e.id
        LEFT JOIN designations d ON e.designation_id = d.id
        WHERE u.id = $1
      `, [userId]);

      const user = userResult.rows[0];
      if (!user) {
        throw new Error('User not found');
      }

      // Find matching authorization rules
      const rulesResult = await client.query(`
        SELECT ar.*
        FROM authorization_rules ar
        WHERE ar.is_active = TRUE
          AND ar.transaction_type = $1
          AND (ar.division_code IS NULL OR ar.division_code = $2)
          AND (
            (ar.applies_to_role_id IS NULL OR ar.applies_to_role_id = (
              SELECT id FROM roles WHERE value = $3
            ))
            AND
            (ar.applies_to_designation_id IS NULL OR ar.applies_to_designation_id = $4)
          )
        ORDER BY ar.priority
      `, [
        transaction.type,
        transaction.division_code,
        user.role,
        user.designation_id
      ]);

      // Check each rule
      for (const rule of rulesResult.rows) {
        let value = 0;
        if (rule.based_on === 'amount') {
          value = transaction.amount || 0;
        } else if (rule.based_on === 'discount_percent') {
          value = transaction.discount_percent || 0;
        } else if (rule.based_on === 'quantity') {
          value = transaction.quantity || 0;
        }

        // Check if condition is met
        let conditionMet = false;
        switch (rule.condition_operator) {
          case '>=':
            conditionMet = value >= rule.condition_value;
            break;
          case '>':
            conditionMet = value > rule.condition_value;
            break;
          case '<=':
            conditionMet = value <= rule.condition_value;
            break;
          case '<':
            conditionMet = value < rule.condition_value;
            break;
          case '=':
            conditionMet = value === rule.condition_value;
            break;
        }

        if (conditionMet) {
          // Create approval request
          const approvalResult = await client.query(`
            INSERT INTO approval_requests (
              transaction_type, transaction_id, division_code,
              requested_by, request_amount, request_details,
              authorization_rule_id, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
            RETURNING *
          `, [
            transaction.type,
            transaction.id,
            transaction.division_code,
            userId,
            transaction.amount,
            JSON.stringify(transaction),
            rule.id
          ]);

          const approvalRequest = approvalResult.rows[0];

          // Log status change
          await client.query(`
            INSERT INTO approval_status_history (
              approval_request_id, from_status, to_status, changed_by
            ) VALUES ($1, NULL, 'pending', $2)
          `, [approvalRequest.id, userId]);

          // Create notifications for approvers
          await this.createApprovalNotifications(client, approvalRequest.id, rule);

          await client.query('COMMIT');

          logger.info(`Created approval request ${approvalRequest.id} for ${transaction.type} ${transaction.id}`);

          return {
            requiresApproval: true,
            approvalRequest,
            rule: {
              id: rule.id,
              name: rule.name,
              condition: `${rule.based_on} ${rule.condition_operator} ${rule.condition_value}`
            }
          };
        }
      }

      await client.query('COMMIT');
      return { requiresApproval: false };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error checking authorization:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create notifications for approvers
   */
  async createApprovalNotifications(client, approvalRequestId, rule) {
    try {
      let approverIds = [];

      // Find approvers based on rule configuration
      if (rule.approving_employee_id) {
        const empResult = await client.query(
          'SELECT user_id FROM employees WHERE id = $1 AND user_id IS NOT NULL',
          [rule.approving_employee_id]
        );
        if (empResult.rows[0]) {
          approverIds.push(empResult.rows[0].user_id);
        }
      }

      if (rule.approving_role_id) {
        const roleResult = await client.query(`
          SELECT u.id FROM users u
          INNER JOIN roles r ON r.value = u.role
          WHERE r.id = $1 AND u.is_active = TRUE
        `, [rule.approving_role_id]);
        approverIds = [...approverIds, ...roleResult.rows.map(r => r.id)];
      }

      if (rule.approving_designation_id) {
        const desigResult = await client.query(`
          SELECT e.user_id FROM employees e
          WHERE e.designation_id = $1 AND e.user_id IS NOT NULL AND e.status = 'Active'
        `, [rule.approving_designation_id]);
        approverIds = [...approverIds, ...desigResult.rows.map(r => r.user_id)];
      }

      // Check for delegations
      const delegations = await client.query(`
        SELECT to_user_id, from_user_id FROM approval_delegations
        WHERE is_active = TRUE
          AND CURRENT_DATE BETWEEN start_date AND end_date
          AND from_user_id = ANY($1)
      `, [approverIds]);

      // Replace delegated users
      for (const del of delegations.rows) {
        const idx = approverIds.indexOf(del.from_user_id);
        if (idx !== -1) {
          approverIds[idx] = del.to_user_id;
        }
      }

      // Remove duplicates
      approverIds = [...new Set(approverIds)];

      // Create notifications
      for (const userId of approverIds) {
        await client.query(`
          INSERT INTO approval_notifications (
            approval_request_id, recipient_user_id, notification_type
          ) VALUES ($1, $2, 'both')
        `, [approvalRequestId, userId]);
      }

      return approverIds.length;
    } catch (error) {
      logger.error('Error creating approval notifications:', error);
      throw error;
    }
  }

  /**
   * Get pending approval requests for a user
   */
  async getPendingApprovals(userId) {
    try {
      const result = await authPool.query(`
        SELECT 
          ar.*,
          rule.name AS rule_name,
          requester.full_name AS requester_name,
          requester_user.email AS requester_email,
          n.id AS notification_id,
          n.read_at
        FROM approval_requests ar
        INNER JOIN approval_notifications n ON ar.id = n.approval_request_id
        LEFT JOIN authorization_rules rule ON ar.authorization_rule_id = rule.id
        LEFT JOIN users requester_user ON ar.requested_by = requester_user.id
        LEFT JOIN employees requester ON requester_user.employee_id = requester.id
        WHERE n.recipient_user_id = $1
          AND ar.status = 'pending'
        ORDER BY ar.created_at DESC
      `, [userId]);

      return result.rows;
    } catch (error) {
      logger.error('Error getting pending approvals:', error);
      throw error;
    }
  }

  /**
   * Get all approval requests (admin view)
   */
  async getAllApprovalRequests(filters = {}) {
    try {
      let query = `
        SELECT 
          ar.*,
          rule.name AS rule_name,
          requester.full_name AS requester_name,
          requester_user.email AS requester_email,
          approver.full_name AS approver_name
        FROM approval_requests ar
        LEFT JOIN authorization_rules rule ON ar.authorization_rule_id = rule.id
        LEFT JOIN users requester_user ON ar.requested_by = requester_user.id
        LEFT JOIN employees requester ON requester_user.employee_id = requester.id
        LEFT JOIN users approver_user ON ar.approved_by = approver_user.id
        LEFT JOIN employees approver ON approver_user.employee_id = approver.id
        WHERE 1=1
      `;

      const params = [];
      if (filters.status) {
        params.push(filters.status);
        query += ` AND ar.status = $${params.length}`;
      }
      if (filters.transactionType) {
        params.push(filters.transactionType);
        query += ` AND ar.transaction_type = $${params.length}`;
      }
      if (filters.divisionCode) {
        params.push(filters.divisionCode);
        query += ` AND ar.division_code = $${params.length}`;
      }

      query += ` ORDER BY ar.created_at DESC LIMIT 500`;

      const result = await authPool.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting all approval requests:', error);
      throw error;
    }
  }

  /**
   * Approve a request
   */
  async approveRequest(requestId, approverUserId, notes = '') {
    const client = await authPool.connect();
    try {
      await client.query('BEGIN');

      // Verify user can approve this request
      const canApprove = await this.canUserApprove(client, requestId, approverUserId);
      if (!canApprove) {
        throw new Error('You are not authorized to approve this request');
      }

      // Get current request
      const requestResult = await client.query(
        'SELECT * FROM approval_requests WHERE id = $1 AND status = $2',
        [requestId, 'pending']
      );

      if (requestResult.rows.length === 0) {
        throw new Error('Request not found or already processed');
      }

      // Update request
      await client.query(`
        UPDATE approval_requests SET
          status = 'approved',
          approved_by = (SELECT id FROM employees WHERE user_id = $1),
          approval_date = NOW(),
          approval_notes = $2,
          updated_at = NOW()
        WHERE id = $3
      `, [approverUserId, notes, requestId]);

      // Log status change
      await client.query(`
        INSERT INTO approval_status_history (
          approval_request_id, from_status, to_status, changed_by, notes
        ) VALUES ($1, 'pending', 'approved', $2, $3)
      `, [requestId, approverUserId, notes]);

      // Mark notification as read
      await client.query(`
        UPDATE approval_notifications SET read_at = NOW()
        WHERE approval_request_id = $1 AND recipient_user_id = $2
      `, [requestId, approverUserId]);

      await client.query('COMMIT');

      logger.info(`Approval request ${requestId} approved by user ${approverUserId}`);
      return { success: true, status: 'approved' };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error approving request:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reject a request
   */
  async rejectRequest(requestId, rejecterUserId, notes = '') {
    const client = await authPool.connect();
    try {
      await client.query('BEGIN');

      // Verify user can reject this request
      const canApprove = await this.canUserApprove(client, requestId, rejecterUserId);
      if (!canApprove) {
        throw new Error('You are not authorized to reject this request');
      }

      // Update request
      await client.query(`
        UPDATE approval_requests SET
          status = 'rejected',
          approved_by = (SELECT id FROM employees WHERE user_id = $1),
          approval_date = NOW(),
          approval_notes = $2,
          updated_at = NOW()
        WHERE id = $3
      `, [rejecterUserId, notes, requestId]);

      // Log status change
      await client.query(`
        INSERT INTO approval_status_history (
          approval_request_id, from_status, to_status, changed_by, notes
        ) VALUES ($1, 'pending', 'rejected', $2, $3)
      `, [requestId, rejecterUserId, notes]);

      await client.query('COMMIT');

      logger.info(`Approval request ${requestId} rejected by user ${rejecterUserId}`);
      return { success: true, status: 'rejected' };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error rejecting request:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if user can approve a request
   */
  async canUserApprove(client, requestId, userId) {
    // Admin can approve anything
    const adminCheck = await client.query(
      'SELECT role FROM users WHERE id = $1',
      [userId]
    );
    if (adminCheck.rows[0]?.role === 'admin') {
      return true;
    }

    // Check if user has a notification for this request
    const notifCheck = await client.query(`
      SELECT 1 FROM approval_notifications
      WHERE approval_request_id = $1 AND recipient_user_id = $2
    `, [requestId, userId]);

    return notifCheck.rows.length > 0;
  }

  /**
   * Create or update approval delegation
   */
  async createDelegation(fromUserId, toUserId, startDate, endDate, reason = '') {
    try {
      if (fromUserId === toUserId) {
        throw new Error('Cannot delegate to yourself');
      }

      const result = await authPool.query(`
        INSERT INTO approval_delegations (
          from_user_id, to_user_id, start_date, end_date, reason
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (from_user_id) 
        DO UPDATE SET 
          to_user_id = $2,
          start_date = $3,
          end_date = $4,
          reason = $5,
          is_active = TRUE
        RETURNING *
      `, [fromUserId, toUserId, startDate, endDate, reason]);

      logger.info(`Created delegation from user ${fromUserId} to ${toUserId}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating delegation:', error);
      throw error;
    }
  }

  /**
   * Cancel delegation
   */
  async cancelDelegation(fromUserId) {
    try {
      await authPool.query(`
        UPDATE approval_delegations SET is_active = FALSE
        WHERE from_user_id = $1
      `, [fromUserId]);

      logger.info(`Cancelled delegation for user ${fromUserId}`);
      return { success: true };
    } catch (error) {
      logger.error('Error cancelling delegation:', error);
      throw error;
    }
  }

  /**
   * Get approval history for a request
   */
  async getApprovalHistory(requestId) {
    try {
      const result = await authPool.query(`
        SELECT 
          ash.*,
          u.name AS changed_by_name,
          u.email AS changed_by_email
        FROM approval_status_history ash
        LEFT JOIN users u ON ash.changed_by = u.id
        WHERE ash.approval_request_id = $1
        ORDER BY ash.created_at
      `, [requestId]);

      return result.rows;
    } catch (error) {
      logger.error('Error getting approval history:', error);
      throw error;
    }
  }
}

module.exports = new AuthorizationService();
