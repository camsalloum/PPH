/**
 * Unified User Management Service
 * Handles user-employee linking, sales hierarchy, and territory access
 * Part of: User Management Module Implementation
 * Date: December 25, 2025
 */

const { authPool } = require('../database/config');
const logger = require('../utils/logger');

class UnifiedUserService {
  // ============================================================
  // PHASE 1: USER-EMPLOYEE LINKING
  // ============================================================

  /**
   * Get users with their employee link status
   */
  async getUsersWithLinkStatus() {
    try {
      const result = await authPool.query(`
        SELECT 
          u.id AS user_id,
          u.email,
          u.name AS user_name,
          u.role,
          u.is_active,
          u.created_at AS user_created,
          e.id AS employee_id,
          e.employee_code,
          e.full_name AS employee_name,
          e.designation_id,
          d.name AS designation_name,
          e.department,
          e.status AS employee_status,
          e.photo_url,
          CASE 
            WHEN e.id IS NOT NULL THEN 'linked'
            ELSE 'unlinked'
          END AS link_status
        FROM users u
        LEFT JOIN employees e ON u.employee_id = e.id OR u.id = e.user_id
        LEFT JOIN designations d ON e.designation_id = d.id
        ORDER BY u.created_at DESC
      `);
      return result.rows;
    } catch (error) {
      logger.error('Error getting users with link status:', error);
      throw error;
    }
  }

  /**
   * Get unlinked users (users without employee profiles)
   */
  async getUnlinkedUsers() {
    try {
      const result = await authPool.query(`
        SELECT 
          u.id,
          u.email,
          u.name,
          u.role,
          u.is_active,
          u.created_at
        FROM users u
        WHERE u.employee_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.id)
        ORDER BY u.name
      `);
      return result.rows;
    } catch (error) {
      logger.error('Error getting unlinked users:', error);
      throw error;
    }
  }

  /**
   * Get unlinked employees (employees without user accounts)
   */
  async getUnlinkedEmployees() {
    try {
      const result = await authPool.query(`
        SELECT 
          e.id,
          e.employee_code,
          e.first_name,
          e.last_name,
          e.full_name,
          e.personal_email,
          e.department,
          e.designation_id,
          d.name AS designation_name,
          e.status
        FROM employees e
        LEFT JOIN designations d ON e.designation_id = d.id
        WHERE e.user_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.employee_id = e.id)
        ORDER BY e.full_name
      `);
      return result.rows;
    } catch (error) {
      logger.error('Error getting unlinked employees:', error);
      throw error;
    }
  }

  /**
   * Link a user to an employee
   */
  async linkUserToEmployee(userId, employeeId, performedBy) {
    const client = await authPool.connect();
    try {
      await client.query('BEGIN');

      // Check if employee is already linked
      const empCheck = await client.query(
        'SELECT user_id FROM employees WHERE id = $1',
        [employeeId]
      );
      if (empCheck.rows[0]?.user_id && empCheck.rows[0].user_id !== userId) {
        throw new Error(`Employee is already linked to user ID ${empCheck.rows[0].user_id}`);
      }

      // Check if user is already linked
      const userCheck = await client.query(
        'SELECT employee_id FROM users WHERE id = $1',
        [userId]
      );
      if (userCheck.rows[0]?.employee_id && userCheck.rows[0].employee_id !== employeeId) {
        throw new Error(`User is already linked to employee ID ${userCheck.rows[0].employee_id}`);
      }

      // Update both tables
      await client.query(
        'UPDATE users SET employee_id = $1 WHERE id = $2',
        [employeeId, userId]
      );
      await client.query(
        'UPDATE employees SET user_id = $1 WHERE id = $2',
        [userId, employeeId]
      );

      // Log the action
      await client.query(`
        INSERT INTO user_employee_link_log (user_id, employee_id, action, performed_by, details)
        VALUES ($1, $2, 'linked', $3, $4)
      `, [userId, employeeId, performedBy, JSON.stringify({ manual: true })]);

      await client.query('COMMIT');

      logger.info(`Linked user ${userId} to employee ${employeeId} by user ${performedBy}`);
      return { success: true, userId, employeeId };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error linking user to employee:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Unlink a user from their employee
   */
  async unlinkUser(userId, performedBy) {
    const client = await authPool.connect();
    try {
      await client.query('BEGIN');

      // Get current employee
      const userResult = await client.query(
        'SELECT employee_id FROM users WHERE id = $1',
        [userId]
      );
      const employeeId = userResult.rows[0]?.employee_id;

      if (!employeeId) {
        throw new Error('User is not linked to any employee');
      }

      // Update both tables
      await client.query(
        'UPDATE users SET employee_id = NULL WHERE id = $1',
        [userId]
      );
      await client.query(
        'UPDATE employees SET user_id = NULL WHERE id = $1',
        [employeeId]
      );

      // Log the action
      await client.query(`
        INSERT INTO user_employee_link_log (user_id, employee_id, action, performed_by)
        VALUES ($1, $2, 'unlinked', $3)
      `, [userId, employeeId, performedBy]);

      await client.query('COMMIT');

      logger.info(`Unlinked user ${userId} from employee ${employeeId} by user ${performedBy}`);
      return { success: true, userId, employeeId };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error unlinking user:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create employee profile from user
   */
  async createEmployeeFromUser(userId, employeeData, performedBy) {
    const client = await authPool.connect();
    try {
      await client.query('BEGIN');

      // Get user data
      const userResult = await client.query(
        'SELECT id, email, name FROM users WHERE id = $1',
        [userId]
      );
      const user = userResult.rows[0];
      if (!user) {
        throw new Error('User not found');
      }

      // Check if already linked
      const existingLink = await client.query(
        'SELECT employee_id FROM users WHERE id = $1 AND employee_id IS NOT NULL',
        [userId]
      );
      if (existingLink.rows.length > 0) {
        throw new Error('User already has an employee profile');
      }

      // Parse name into first/last
      const nameParts = (employeeData.full_name || user.name || '').split(' ');
      const firstName = employeeData.first_name || nameParts[0] || '';
      const lastName = employeeData.last_name || nameParts.slice(1).join(' ') || '';

      // Generate employee code
      const codeResult = await client.query(`
        SELECT COALESCE(MAX(CAST(SUBSTRING(employee_code FROM 4) AS INTEGER)), 0) + 1 AS next_code
        FROM employees WHERE employee_code LIKE 'EMP%'
      `);
      const nextCode = codeResult.rows[0]?.next_code || 1;
      const employeeCode = `EMP${String(nextCode).padStart(4, '0')}`;

      // Create employee
      const insertResult = await client.query(`
        INSERT INTO employees (
          user_id, employee_code, first_name, last_name, personal_email,
          designation_id, department, date_of_joining, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `, [
        userId,
        employeeCode,
        firstName,
        lastName,
        user.email,
        employeeData.designation_id || null,
        employeeData.department || null,
        employeeData.date_of_joining || new Date().toISOString().split('T')[0],
        'Active'
      ]);

      const employeeId = insertResult.rows[0].id;

      // Update user with employee link
      await client.query(
        'UPDATE users SET employee_id = $1 WHERE id = $2',
        [employeeId, userId]
      );

      // Log the action
      await client.query(`
        INSERT INTO user_employee_link_log (user_id, employee_id, action, performed_by, details)
        VALUES ($1, $2, 'auto_created', $3, $4)
      `, [userId, employeeId, performedBy, JSON.stringify({ from_user: true })]);

      await client.query('COMMIT');

      logger.info(`Created employee ${employeeId} from user ${userId} by user ${performedBy}`);
      return { success: true, employeeId, employeeCode };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating employee from user:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get link status summary
   */
  async getLinkStatusSummary() {
    try {
      const result = await authPool.query(`
        SELECT 
          (SELECT COUNT(*) FROM users) AS total_users,
          (SELECT COUNT(*) FROM employees) AS total_employees,
          (SELECT COUNT(*) FROM users u WHERE u.employee_id IS NOT NULL 
            OR EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.id)) AS linked_users,
          (SELECT COUNT(*) FROM users u WHERE u.employee_id IS NULL 
            AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.id)) AS unlinked_users,
          (SELECT COUNT(*) FROM employees e WHERE e.user_id IS NULL 
            AND NOT EXISTS (SELECT 1 FROM users u WHERE u.employee_id = e.id)) AS unlinked_employees
      `);
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting link status summary:', error);
      throw error;
    }
  }

  // ============================================================
  // PHASE 2: SALES PERSON MANAGEMENT
  // ============================================================

  /**
   * Get sales persons with hierarchy
   */
  async getSalesPersons(filters = {}) {
    try {
      let query = `
        SELECT 
          sp.id,
          sp.name,
          sp.division_code,
          sp.level,
          sp.parent_id,
          parent_sp.name AS parent_name,
          sp.employee_id,
          e.full_name AS employee_name,
          sp.user_id,
          u.email AS user_email,
          sp.commission_rate,
          sp.territory_id,
          t.name AS territory_name,
          sp.is_enabled,
          sp.is_group,
          sp.email,
          sp.phone,
          sp.status,
          ARRAY_AGG(DISTINCT spt.territory_id) FILTER (WHERE spt.territory_id IS NOT NULL) AS assigned_territories
        FROM sales_persons sp
        LEFT JOIN sales_persons parent_sp ON sp.parent_id = parent_sp.id
        LEFT JOIN employees e ON sp.employee_id = e.id
        LEFT JOIN users u ON sp.user_id = u.id
        LEFT JOIN territories t ON sp.territory_id = t.id
        LEFT JOIN sales_person_territories spt ON sp.id = spt.sales_person_id
        WHERE 1=1
      `;

      const params = [];
      if (filters.divisionCode) {
        params.push(filters.divisionCode);
        query += ` AND sp.division_code = $${params.length}`;
      }
      if (filters.isEnabled !== undefined) {
        params.push(filters.isEnabled);
        query += ` AND sp.is_enabled = $${params.length}`;
      }
      if (filters.parentId) {
        params.push(filters.parentId);
        query += ` AND sp.parent_id = $${params.length}`;
      }

      query += ` GROUP BY sp.id, parent_sp.name, e.full_name, u.email, t.name
                 ORDER BY sp.level, sp.name`;

      const result = await authPool.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting sales persons:', error);
      throw error;
    }
  }

  /**
   * Get sales hierarchy as tree
   */
  async getSalesHierarchy(divisionCode) {
    try {
      const result = await authPool.query(`
        WITH RECURSIVE sales_tree AS (
          SELECT 
            sp.id, sp.name, sp.level, sp.parent_id, sp.division_code,
            sp.is_group, sp.is_enabled, sp.commission_rate,
            e.full_name AS employee_name, e.photo_url,
            0 AS depth,
            ARRAY[sp.id] AS path
          FROM sales_persons sp
          LEFT JOIN employees e ON sp.employee_id = e.id
          WHERE sp.parent_id IS NULL AND ($1::VARCHAR IS NULL OR sp.division_code = $1)
          
          UNION ALL
          
          SELECT 
            sp.id, sp.name, sp.level, sp.parent_id, sp.division_code,
            sp.is_group, sp.is_enabled, sp.commission_rate,
            e.full_name AS employee_name, e.photo_url,
            st.depth + 1 AS depth,
            st.path || sp.id
          FROM sales_persons sp
          LEFT JOIN employees e ON sp.employee_id = e.id
          INNER JOIN sales_tree st ON sp.parent_id = st.id
        )
        SELECT * FROM sales_tree ORDER BY path
      `, [divisionCode || null]);

      return this.buildTree(result.rows);
    } catch (error) {
      logger.error('Error getting sales hierarchy:', error);
      throw error;
    }
  }

  /**
   * Build tree from flat data
   */
  buildTree(rows) {
    const map = {};
    const roots = [];

    rows.forEach(row => {
      map[row.id] = { ...row, children: [] };
    });

    rows.forEach(row => {
      if (row.parent_id && map[row.parent_id]) {
        map[row.parent_id].children.push(map[row.id]);
      } else {
        roots.push(map[row.id]);
      }
    });

    return roots;
  }

  /**
   * Create sales person
   */
  async createSalesPerson(data, createdBy) {
    try {
      const result = await authPool.query(`
        INSERT INTO sales_persons (
          name, division_code, level, parent_id, employee_id, user_id,
          commission_rate, territory_id, is_enabled, is_group, email, phone, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `, [
        data.name,
        data.division_code,
        data.level || 1,
        data.parent_id || null,
        data.employee_id || null,
        data.user_id || null,
        data.commission_rate || 0,
        data.territory_id || null,
        data.is_enabled !== false,
        data.is_group || false,
        data.email || null,
        data.phone || null,
        data.status || 'Active'
      ]);

      logger.info(`Created sales person ${result.rows[0].id} by user ${createdBy}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating sales person:', error);
      throw error;
    }
  }

  /**
   * Update sales person
   */
  async updateSalesPerson(id, data, updatedBy) {
    try {
      const setClauses = [];
      const params = [id];
      let paramIndex = 2;

      const allowedFields = [
        'name', 'division_code', 'level', 'parent_id', 'employee_id', 'user_id',
        'commission_rate', 'territory_id', 'is_enabled', 'is_group', 'email', 'phone', 'status'
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
        UPDATE sales_persons SET ${setClauses.join(', ')}
        WHERE id = $1
        RETURNING *
      `, params);

      if (result.rows.length === 0) {
        throw new Error('Sales person not found');
      }

      logger.info(`Updated sales person ${id} by user ${updatedBy}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating sales person:', error);
      throw error;
    }
  }

  /**
   * Assign territories to sales person
   */
  async assignTerritories(salesPersonId, territoryIds, assignedBy) {
    const client = await authPool.connect();
    try {
      await client.query('BEGIN');

      // Remove existing assignments
      await client.query(
        'DELETE FROM sales_person_territories WHERE sales_person_id = $1',
        [salesPersonId]
      );

      // Add new assignments
      for (let i = 0; i < territoryIds.length; i++) {
        await client.query(`
          INSERT INTO sales_person_territories (sales_person_id, territory_id, is_primary, assigned_by)
          VALUES ($1, $2, $3, $4)
        `, [salesPersonId, territoryIds[i], i === 0, assignedBy]);
      }

      await client.query('COMMIT');

      logger.info(`Assigned ${territoryIds.length} territories to sales person ${salesPersonId}`);
      return { success: true, count: territoryIds.length };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error assigning territories:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================
  // PHASE 3: ORG CHART DATA
  // ============================================================

  /**
   * Get enhanced org chart data with roles
   */
  async getEnhancedOrgChart(divisionCode = null) {
    try {
      const result = await authPool.query(`
        WITH RECURSIVE emp_tree AS (
          SELECT 
            e.id, e.full_name, e.first_name, e.last_name, e.photo_url,
            e.designation_id, d.name AS designation_name, d.level AS designation_level,
            COALESCE(dep.name, e.department) AS department, e.reports_to, e.status,
            u.id AS user_id, u.role AS system_role, u.email,
            0 AS depth,
            ARRAY[e.id] AS path
          FROM employees e
          LEFT JOIN designations d ON e.designation_id = d.id
          LEFT JOIN departments dep ON e.department_id = dep.id
          LEFT JOIN users u ON e.user_id = u.id
          WHERE e.reports_to IS NULL AND e.status = 'Active'
          
          UNION ALL
          
          SELECT 
            e.id, e.full_name, e.first_name, e.last_name, e.photo_url,
            e.designation_id, d.name AS designation_name, d.level AS designation_level,
            COALESCE(dep.name, e.department) AS department, e.reports_to, e.status,
            u.id AS user_id, u.role AS system_role, u.email,
            et.depth + 1 AS depth,
            et.path || e.id
          FROM employees e
          LEFT JOIN designations d ON e.designation_id = d.id
          LEFT JOIN departments dep ON e.department_id = dep.id
          LEFT JOIN users u ON e.user_id = u.id
          INNER JOIN emp_tree et ON e.reports_to = et.id
          WHERE e.status = 'Active'
        )
        SELECT 
          et.*,
          COALESCE(
            ARRAY_AGG(DISTINCT ed.division_code) FILTER (WHERE ed.division_code IS NOT NULL),
            ARRAY[]::VARCHAR[]
          ) AS divisions,
          (SELECT COUNT(*) FROM employees sub WHERE sub.reports_to = et.id AND sub.status = 'Active') AS direct_reports_count
        FROM emp_tree et
        LEFT JOIN employee_divisions ed ON et.id = ed.employee_id
        WHERE $1::VARCHAR IS NULL 
          OR et.id IN (SELECT employee_id FROM employee_divisions WHERE division_code = $1)
        GROUP BY et.id, et.full_name, et.first_name, et.last_name, et.photo_url,
                 et.designation_id, et.designation_name, et.designation_level,
                 et.department, et.reports_to, et.status,
                 et.user_id, et.system_role, et.email, et.depth, et.path
        ORDER BY et.path
      `, [divisionCode]);

      return this.buildTree(result.rows.map(row => ({
        ...row,
        parent_id: row.reports_to
      })));
    } catch (error) {
      logger.error('Error getting enhanced org chart:', error);
      throw error;
    }
  }

  /**
   * Get employee details for org chart popup
   */
  async getEmployeeOrgDetails(employeeId) {
    try {
      const result = await authPool.query(`
        SELECT 
          e.*,
          d.name AS designation_name,
          d.level AS designation_level,
          u.id AS user_id,
          u.email,
          u.role AS system_role,
          mgr.full_name AS manager_name,
          ARRAY_AGG(DISTINCT ed.division_code) FILTER (WHERE ed.division_code IS NOT NULL) AS divisions,
          ARRAY_AGG(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL) AS territories,
          (SELECT COUNT(*) FROM user_permissions up WHERE up.user_id = u.id) AS permission_count,
          (SELECT COUNT(*) FROM employees sub WHERE sub.reports_to = e.id AND sub.status = 'Active') AS direct_reports
        FROM employees e
        LEFT JOIN designations d ON e.designation_id = d.id
        LEFT JOIN users u ON e.user_id = u.id
        LEFT JOIN employees mgr ON e.reports_to = mgr.id
        LEFT JOIN employee_divisions ed ON e.id = ed.employee_id
        LEFT JOIN employee_territories et ON e.id = et.employee_id
        LEFT JOIN territories t ON et.territory_id = t.id
        WHERE e.id = $1
        GROUP BY e.id, d.name, d.level, u.id, u.email, u.role, mgr.full_name
      `, [employeeId]);

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting employee org details:', error);
      throw error;
    }
  }

  // ============================================================
  // PHASE 7: TERRITORY-BASED ACCESS
  // ============================================================

  /**
   * Get user's accessible territories
   */
  async getUserTerritories(userId) {
    try {
      const result = await authPool.query(`
        SELECT * FROM get_user_territories($1)
      `, [userId]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting user territories:', error);
      throw error;
    }
  }

  /**
   * Check if user has access to territory
   */
  async userHasTerritoryAccess(userId, territoryId) {
    try {
      const result = await authPool.query(`
        SELECT user_has_territory_access($1, $2) AS has_access
      `, [userId, territoryId]);
      return result.rows[0]?.has_access || false;
    } catch (error) {
      logger.error('Error checking territory access:', error);
      throw error;
    }
  }

  /**
   * Assign territories to employee
   */
  async assignEmployeeTerritories(employeeId, territoryIds, assignedBy) {
    const client = await authPool.connect();
    try {
      await client.query('BEGIN');

      // Remove existing assignments
      await client.query(
        'DELETE FROM employee_territories WHERE employee_id = $1',
        [employeeId]
      );

      // Add new assignments
      for (let i = 0; i < territoryIds.length; i++) {
        await client.query(`
          INSERT INTO employee_territories (employee_id, territory_id, is_primary, assigned_by)
          VALUES ($1, $2, $3, $4)
        `, [employeeId, territoryIds[i], i === 0, assignedBy]);
      }

      // Clear cache
      await client.query(
        'DELETE FROM user_territory_access_cache WHERE user_id = (SELECT user_id FROM employees WHERE id = $1)',
        [employeeId]
      );

      await client.query('COMMIT');

      logger.info(`Assigned ${territoryIds.length} territories to employee ${employeeId}`);
      return { success: true, count: territoryIds.length };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error assigning employee territories:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================
  // SALES REP SYNC FROM DATA
  // ============================================================

  /**
   * Sync sales reps from actual/budget data to sales_persons table
   * This creates the "closed loop" where data imports populate sales persons
   * who can then be linked to users and assigned permissions
   * 
   * @param {string} divisionCode - Division code (e.g., 'FP')
   * @returns {Promise<{added: number, skipped: number, existing: number, newReps: string[]}>}
   */
  async syncSalesRepsFromData(divisionCode) {
    const { getDivisionPool } = require('../utils/divisionDatabaseManager');
    
    const client = await authPool.connect();
    const results = {
      added: 0,
      skipped: 0,
      existing: 0,
      errors: [],
      newReps: [],
      allReps: []
    };

    try {
      const divCode = divisionCode.toUpperCase();
      const divisionPool = getDivisionPool(divCode);
      const tableName = `${divCode.toLowerCase()}_actualcommon`;

      logger.info(`🔄 Syncing sales reps from ${tableName} to sales_persons...`);

      // Step 1: Get distinct sales rep names from division data table
      const dataResult = await divisionPool.query(`
        SELECT DISTINCT TRIM(salesrepname) as name
        FROM ${tableName}
        WHERE salesrepname IS NOT NULL 
          AND TRIM(salesrepname) != ''
        ORDER BY name
      `);

      const dataNames = dataResult.rows.map(r => r.name);
      results.allReps = dataNames;
      logger.info(`Found ${dataNames.length} distinct sales reps in ${tableName}`);

      if (dataNames.length === 0) {
        logger.info('No sales reps to sync');
        return results;
      }

      // Step 2: Get existing sales_persons for this division
      const existingResult = await client.query(`
        SELECT id, name, LOWER(TRIM(name)) as name_lower
        FROM sales_persons
        WHERE division_code = $1 OR division_code IS NULL
      `, [divCode]);

      const existingNamesLower = new Set(existingResult.rows.map(r => r.name_lower));
      results.existing = existingResult.rows.length;

      // Step 3: Find names that don't exist in sales_persons
      const newNames = [];
      for (const name of dataNames) {
        const nameLower = name.toLowerCase().trim();
        if (existingNamesLower.has(nameLower)) {
          results.skipped++;
        } else {
          newNames.push(name);
        }
      }

      logger.info(`${newNames.length} new sales reps to add, ${results.skipped} already exist`);

      // Step 4: Insert new sales persons
      if (newNames.length > 0) {
        await client.query('BEGIN');

        for (const name of newNames) {
          try {
            await client.query(`
              INSERT INTO sales_persons (name, division_code, level, is_enabled, status, is_group)
              VALUES ($1, $2, 1, true, 'Active', false)
              ON CONFLICT DO NOTHING
            `, [name, divCode]);

            results.added++;
            results.newReps.push(name);
            logger.info(`  ✅ Added sales person: ${name}`);
          } catch (err) {
            results.errors.push(`Failed to add ${name}: ${err.message}`);
            logger.warn(`  ⚠️ Failed: ${name} - ${err.message}`);
          }
        }

        await client.query('COMMIT');
      }

      logger.info(`✅ Sync complete: ${results.added} added, ${results.skipped} skipped`);
      return results;

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Sync from data failed:', error);
      results.errors.push(error.message);
      return results;
    } finally {
      client.release();
    }
  }

  /**
   * Get sales persons that are NOT linked to any user
   * These are candidates for linking to existing users or creating new user accounts
   */
  async getUnlinkedSalesPersons(divisionCode = null) {
    try {
      let query = `
        SELECT 
          sp.id,
          sp.name,
          sp.division_code,
          sp.email,
          sp.phone,
          sp.status,
          sp.created_at
        FROM sales_persons sp
        WHERE sp.user_id IS NULL
          AND sp.employee_id IS NULL
          AND sp.is_group = false
      `;

      const params = [];
      if (divisionCode) {
        params.push(divisionCode);
        query += ` AND sp.division_code = $${params.length}`;
      }

      query += ` ORDER BY sp.name`;

      const result = await authPool.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting unlinked sales persons:', error);
      throw error;
    }
  }

  /**
   * Link a sales person to a user (and optionally create employee profile)
   */
  async linkSalesPersonToUser(salesPersonId, userId, createEmployee = false, adminUserId = null) {
    const client = await authPool.connect();
    try {
      await client.query('BEGIN');

      // Get sales person details
      const spResult = await client.query(
        'SELECT * FROM sales_persons WHERE id = $1',
        [salesPersonId]
      );
      if (spResult.rows.length === 0) {
        throw new Error('Sales person not found');
      }
      const salesPerson = spResult.rows[0];

      // Get user details
      const userResult = await client.query(
        'SELECT * FROM users WHERE id = $1',
        [userId]
      );
      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }
      const user = userResult.rows[0];

      let employeeId = null;

      // Create employee profile if requested
      if (createEmployee) {
        const nameParts = salesPerson.name.split(' ');
        const firstName = nameParts[0] || salesPerson.name;
        const lastName = nameParts.slice(1).join(' ') || '';

        const empResult = await client.query(`
          INSERT INTO employees (
            user_id, first_name, last_name, personal_email, 
            department, status, created_at
          ) VALUES ($1, $2, $3, $4, 'Sales', 'Active', NOW())
          RETURNING id
        `, [userId, firstName, lastName, user.email]);

        employeeId = empResult.rows[0].id;

        // Link user to employee
        await client.query(
          'UPDATE users SET employee_id = $1 WHERE id = $2',
          [employeeId, userId]
        );
      }

      // Link sales person to user (and employee if created)
      await client.query(`
        UPDATE sales_persons 
        SET user_id = $1, 
            employee_id = $2,
            email = COALESCE(email, $3),
            updated_at = NOW()
        WHERE id = $4
      `, [userId, employeeId, user.email, salesPersonId]);

      // Log the linkage
      await client.query(`
        INSERT INTO user_employee_link_log (user_id, employee_id, action, performed_by, details)
        VALUES ($1, $2, 'sales_person_linked', $3, $4)
      `, [userId, employeeId, adminUserId, JSON.stringify({ 
        sales_person_id: salesPersonId, 
        sales_person_name: salesPerson.name 
      })]);

      await client.query('COMMIT');

      logger.info(`Linked sales person ${salesPersonId} to user ${userId}`);
      return { 
        success: true, 
        salesPersonId, 
        userId, 
        employeeId 
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error linking sales person to user:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================
  // AUDIT LOG
  // ============================================================

  /**
   * Get permission audit log
   */
  async getAuditLog(filters = {}) {
    try {
      let query = `
        SELECT 
          pal.*,
          admin.name AS admin_name,
          admin.email AS admin_email,
          target.name AS target_name,
          target.email AS target_email
        FROM permission_audit_log pal
        LEFT JOIN users admin ON pal.admin_user_id = admin.id
        LEFT JOIN users target ON pal.target_user_id = target.id
        WHERE 1=1
      `;

      const params = [];
      if (filters.userId) {
        params.push(filters.userId);
        query += ` AND pal.target_user_id = $${params.length}`;
      }
      if (filters.action) {
        params.push(filters.action);
        query += ` AND pal.action = $${params.length}`;
      }
      if (filters.fromDate) {
        params.push(filters.fromDate);
        query += ` AND pal.created_at >= $${params.length}`;
      }
      if (filters.toDate) {
        params.push(filters.toDate);
        query += ` AND pal.created_at <= $${params.length}`;
      }

      query += ` ORDER BY pal.created_at DESC LIMIT 500`;

      const result = await authPool.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting audit log:', error);
      throw error;
    }
  }
}

module.exports = new UnifiedUserService();
