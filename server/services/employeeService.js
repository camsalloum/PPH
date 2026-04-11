/**
 * Employee Service
 * Manages employees, designations, groups, hierarchy
 * All operations dynamically linked to divisions
 */

const { authPool } = require('../database/config');
const logger = require('../utils/logger');

class EmployeeService {
  // ===================== DESIGNATIONS =====================

  async getDesignations(filters = {}) {
    try {
      let query = `SELECT * FROM designations WHERE 1=1`;
      const params = [];
      let paramCount = 1;

      if (filters.department) {
        query += ` AND department = $${paramCount++}`;
        params.push(filters.department);
      }
      if (filters.isActive !== undefined) {
        query += ` AND is_active = $${paramCount++}`;
        params.push(filters.isActive);
      }

      query += ` ORDER BY level DESC, name`;
      const result = await authPool.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting designations:', error);
      throw error;
    }
  }

  async createDesignation(data) {
    try {
      const result = await authPool.query(
        `INSERT INTO designations (name, description, department, level, access_level)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [data.name, data.description, data.department, data.level || 3, data.access_level || 'user']
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating designation:', error);
      throw error;
    }
  }

  async updateDesignation(id, data) {
    try {
      const result = await authPool.query(
        `UPDATE designations 
         SET name = COALESCE($2, name),
             description = COALESCE($3, description),
             department = COALESCE($4, department),
             level = COALESCE($5, level),
             is_active = COALESCE($6, is_active),
             access_level = COALESCE($7, access_level)
         WHERE id = $1
         RETURNING *`,
        [id, data.name, data.description, data.department, data.level, data.is_active, data.access_level]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating designation:', error);
      throw error;
    }
  }

  async deleteDesignation(id) {
    try {
      await authPool.query('DELETE FROM designations WHERE id = $1', [id]);
      return true;
    } catch (error) {
      logger.error('Error deleting designation:', error);
      throw error;
    }
  }

  // ===================== EMPLOYEES =====================

  async getEmployees(filters = {}) {
    try {
      let query = `
        SELECT e.*,
               e.full_name as employee_name,
               d.name as designation_name,
               d.level as designation_level,
               dept.name as department_name,
               br.name as branch_name,
               u.email as user_email,
               u.role as user_role,
               r.full_name as reports_to_name,
               COALESCE(
                 (SELECT json_agg(json_build_object('code', ed.division_code, 'is_primary', ed.is_primary, 'access_level', ed.access_level))
                  FROM employee_divisions ed WHERE ed.employee_id = e.id), '[]'
               ) as divisions
        FROM employees e
        LEFT JOIN designations d ON e.designation_id = d.id
        LEFT JOIN departments dept ON e.department_id = dept.id
        LEFT JOIN branches br ON e.branch_id = br.id
        LEFT JOIN users u ON e.user_id = u.id
        LEFT JOIN employees r ON e.reports_to = r.id
        WHERE 1=1
      `;
      const params = [];
      let paramCount = 1;

      if (filters.status) {
        query += ` AND e.status = $${paramCount++}`;
        params.push(filters.status);
      }
      if (filters.department_id) {
        query += ` AND e.department_id = $${paramCount++}`;
        params.push(filters.department_id);
      }
      if (filters.divisionCode) {
        query += ` AND EXISTS (SELECT 1 FROM employee_divisions ed WHERE ed.employee_id = e.id AND ed.division_code = $${paramCount++})`;
        params.push(filters.divisionCode);
      }
      if (filters.reportsTo) {
        query += ` AND e.reports_to = $${paramCount++}`;
        params.push(filters.reportsTo);
      }
      if (filters.search) {
        query += ` AND (e.full_name ILIKE $${paramCount} OR e.employee_code ILIKE $${paramCount} OR u.email ILIKE $${paramCount++})`;
        params.push(`%${filters.search}%`);
      }

      query += ` ORDER BY e.full_name`;
      const result = await authPool.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting employees:', error);
      throw error;
    }
  }

  async getEmployeeById(id) {
    try {
      const result = await authPool.query(
        `SELECT e.*,
                e.full_name as employee_name,
                d.name as designation_name,
                u.email as user_email,
                u.role as user_role,
                r.full_name as reports_to_name,
                (SELECT json_agg(json_build_object('code', ed.division_code, 'is_primary', ed.is_primary))
                 FROM employee_divisions ed WHERE ed.employee_id = e.id) as divisions
         FROM employees e
         LEFT JOIN designations d ON e.designation_id = d.id
         LEFT JOIN users u ON e.user_id = u.id
         LEFT JOIN employees r ON e.reports_to = r.id
         WHERE e.id = $1`,
        [id]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting employee:', error);
      throw error;
    }
  }

  async getEmployeeByUserId(userId) {
    try {
      const result = await authPool.query(
        `SELECT e.*, 
                (SELECT json_agg(division_code) FROM employee_divisions WHERE employee_id = e.id) as divisions
         FROM employees e WHERE e.user_id = $1`,
        [userId]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting employee by user:', error);
      throw error;
    }
  }

  async createEmployee(data) {
    const client = await authPool.connect();
    try {
      await client.query('BEGIN');

      // Generate employee code
      const codeResult = await client.query(
        `SELECT 'EMP' || LPAD((COALESCE(MAX(CAST(SUBSTRING(employee_code FROM 4) AS INT)), 0) + 1)::TEXT, 4, '0') as code
         FROM employees WHERE employee_code LIKE 'EMP%'`
      );
      const employeeCode = codeResult.rows[0]?.code || 'EMP0001';

      // Note: full_name is a GENERATED column - do not insert it directly

      // Validate hierarchy if reports_to is set
      if (data.reports_to && data.designation_id) {
        await this._validateHierarchy(client, data.reports_to, data.designation_id);
      }

      // Create employee
      const result = await client.query(
        `INSERT INTO employees (
           user_id, employee_code, first_name, middle_name, last_name,
           gender, date_of_birth, personal_email, phone, photo_url,
           designation_id, department_id, branch_id, date_of_joining, employment_type,
           reports_to, status, group_members
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING *`,
        [
          data.user_id, employeeCode, data.first_name, data.middle_name, data.last_name,
          data.gender, data.date_of_birth, data.personal_email, data.phone, data.photo_url,
          data.designation_id, data.department_id, data.branch_id, data.date_of_joining, data.employment_type || 'Full-time',
          data.reports_to, data.status || 'Active',
          data.group_members ? JSON.stringify(data.group_members) : null
        ]
      );

      const employee = result.rows[0];

      let divisionsToAssign = Array.isArray(data.divisions) ? data.divisions : [];
      if (divisionsToAssign.length === 0 && data.user_id) {
        const inheritedDivisions = await client.query(
          `SELECT division FROM user_divisions WHERE user_id = $1 ORDER BY id ASC`,
          [data.user_id]
        );
        divisionsToAssign = inheritedDivisions.rows.map((row) => row.division).filter(Boolean);
      }

      // Add divisions
      if (divisionsToAssign.length > 0) {
        for (let i = 0; i < divisionsToAssign.length; i++) {
          const div = divisionsToAssign[i];
          const divCode = typeof div === 'string' ? div : div.code;
          const isPrimary = typeof div === 'string' ? (i === 0) : div.is_primary;
          await client.query(
            `INSERT INTO employee_divisions (employee_id, division_code, is_primary)
             VALUES ($1, $2, $3)
             ON CONFLICT (employee_id, division_code) DO UPDATE SET is_primary = $3`,
            [employee.id, divCode, isPrimary]
          );
        }
      }

      await client.query('COMMIT');
      return this.getEmployeeById(employee.id);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating employee:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Validate hierarchy: manager's designation level must be > employee's
  async _validateHierarchy(client, reportsTo, designationId, excludeEmployeeId = null) {
    if (!reportsTo || !designationId) return; // skip if either is missing
    
    const [empDesig, mgrResult] = await Promise.all([
      client.query('SELECT level FROM designations WHERE id = $1', [designationId]),
      client.query(
        'SELECT e.id, d.level, d.name as designation_name FROM employees e LEFT JOIN designations d ON e.designation_id = d.id WHERE e.id = $1',
        [reportsTo]
      )
    ]);
    
    const empLevel = empDesig.rows[0]?.level;
    const mgrLevel = mgrResult.rows[0]?.level;
    
    if (empLevel && mgrLevel && mgrLevel <= empLevel) {
      const mgrName = mgrResult.rows[0]?.designation_name || 'Unknown';
      throw new Error(
        `Hierarchy violation: Manager designation "${mgrName}" (level ${mgrLevel}) must be higher than employee designation level ${empLevel}`
      );
    }
  }

  async updateEmployee(id, data) {
    const client = await authPool.connect();
    try {
      await client.query('BEGIN');

      // Validate hierarchy if reports_to or designation changed
      if (data.reports_to || data.designation_id) {
        await this._validateHierarchy(client, data.reports_to, data.designation_id, id);
      }

      await client.query(
        `UPDATE employees SET
           first_name = COALESCE($2, first_name),
           middle_name = $3,
           last_name = $4,
           gender = COALESCE($5, gender),
           date_of_birth = $6,
           personal_email = $7,
           phone = $8,
           photo_url = $9,
           designation_id = $10,
           department_id = $11,
           branch_id = $12,
           date_of_joining = $13,
           date_of_leaving = $14,
           employment_type = COALESCE($15, employment_type),
           reports_to = $16,
           status = COALESCE($17, status),
           user_id = $18,
           group_members = $19,
           company_email = $20,
           sales_rep_name = $21,
           updated_at = NOW()
         WHERE id = $1`,
        [
          id, data.first_name, data.middle_name, data.last_name,
          data.gender, data.date_of_birth, data.personal_email, data.phone, data.photo_url,
          data.designation_id, data.department_id, data.branch_id, data.date_of_joining, data.date_of_leaving,
          data.employment_type, data.reports_to, data.status,
          data.user_id !== undefined ? data.user_id : null,
          data.group_members ? JSON.stringify(data.group_members) : null,
          data.company_email !== undefined ? data.company_email : null,
          data.sales_rep_name !== undefined ? data.sales_rep_name : null
        ]
      );

      // Sync designation → user role if designation changed and employee has a linked user
      if (data.designation_id) {
        const empResult = await client.query(
          'SELECT user_id FROM employees WHERE id = $1', [id]
        );
        const userId = data.user_id !== undefined ? data.user_id : empResult.rows[0]?.user_id;
        if (userId) {
          const desigResult = await client.query(
            'SELECT access_level FROM designations WHERE id = $1', [data.designation_id]
          );
          const accessLevel = desigResult.rows[0]?.access_level;
          if (accessLevel) {
            await client.query(
              'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2',
              [accessLevel, userId]
            );
            logger.info(`Synced user ${userId} role to '${accessLevel}' from designation ${data.designation_id}`);
          }
        }
      }

      // Update divisions if provided
      if (data.divisions !== undefined) {
        await client.query('DELETE FROM employee_divisions WHERE employee_id = $1', [id]);
        for (let i = 0; i < data.divisions.length; i++) {
          const div = data.divisions[i];
          const divCode = typeof div === 'string' ? div : div.code;
          const isPrimary = typeof div === 'string' ? (i === 0) : div.is_primary;
          await client.query(
            `INSERT INTO employee_divisions (employee_id, division_code, is_primary) VALUES ($1, $2, $3)`,
            [id, divCode, isPrimary]
          );
        }
      }

      await client.query('COMMIT');
      return this.getEmployeeById(id);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating employee:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteEmployee(id) {
    try {
      await authPool.query('DELETE FROM employees WHERE id = $1', [id]);
      return true;
    } catch (error) {
      logger.error('Error deleting employee:', error);
      throw error;
    }
  }

  // ===================== BULK IMPORT =====================

  async bulkImportEmployees(employees, divisionCode) {
    const client = await authPool.connect();
    let imported = 0;
    let skipped = 0;
    const errors = [];

    try {
      await client.query('BEGIN');

      for (const emp of employees) {
        try {
          // Generate employee code
          const codeResult = await client.query(
            `SELECT 'EMP' || LPAD((COALESCE(MAX(CAST(SUBSTRING(employee_code FROM 4) AS INT)), 0) + 1)::TEXT, 4, '0') as code
             FROM employees WHERE employee_code LIKE 'EMP%'`
          );
          const employeeCode = codeResult.rows[0]?.code || 'EMP0001';

          // Insert employee
          const result = await client.query(
            `INSERT INTO employees (
               employee_code, first_name, middle_name, last_name,
               gender, date_of_birth, date_of_joining,
               designation_id, department_id, branch_id,
               reports_to, status, company_email, personal_email,
               cell_number, employment_type
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             RETURNING id`,
            [
              employeeCode,
              emp.first_name,
              emp.middle_name || null,
              emp.last_name,
              emp.gender || 'Male',
              emp.date_of_birth || null,
              emp.date_of_joining || null,
              emp.designation_id || null,
              emp.department_id || null,
              emp.branch_id || null,
              emp.reports_to || null,
              emp.status || 'Active',
              emp.company_email || null,
              emp.personal_email || null,
              emp.cell_number || null,
              emp.employment_type || 'Full-time'
            ]
          );

          const employeeId = result.rows[0].id;

          // Link to division
          if (divisionCode) {
            await client.query(
              `INSERT INTO employee_divisions (employee_id, division_code, is_primary)
               VALUES ($1, $2, true)
               ON CONFLICT (employee_id, division_code) DO NOTHING`,
              [employeeId, divisionCode]
            );
          }

          imported++;
        } catch (rowError) {
          logger.error(`Error importing row: ${emp.first_name} ${emp.last_name}`, rowError);
          errors.push(`${emp.first_name} ${emp.last_name}: ${rowError.message}`);
          skipped++;
        }
      }

      await client.query('COMMIT');
      logger.info(`Bulk import complete: ${imported} imported, ${skipped} skipped`);
      return { imported, skipped, errors };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Bulk import failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ===================== HIERARCHY / ORG CHART =====================

  async getOrgChart(divisionCode = null) {
    try {
      let query = `
        SELECT e.id, e.full_name, e.employee_code, e.reports_to, e.photo_url,
               d.name as designation, COALESCE(dept.name, e.department) as department,
               (SELECT json_agg(division_code) FROM employee_divisions WHERE employee_id = e.id) as divisions
        FROM employees e
        LEFT JOIN designations d ON e.designation_id = d.id
        LEFT JOIN departments dept ON e.department_id = dept.id
        WHERE e.status = 'Active'
      `;
      const params = [];

      if (divisionCode) {
        query += ` AND EXISTS (SELECT 1 FROM employee_divisions ed WHERE ed.employee_id = e.id AND ed.division_code = $1)`;
        params.push(divisionCode);
      }

      query += ` ORDER BY d.level DESC, e.full_name`;

      const result = await authPool.query(query, params);

      // Build tree structure
      const employees = result.rows;
      const employeeMap = new Map(employees.map(e => [e.id, { ...e, children: [] }]));
      const roots = [];

      employees.forEach(emp => {
        const node = employeeMap.get(emp.id);
        if (emp.reports_to && employeeMap.has(emp.reports_to)) {
          employeeMap.get(emp.reports_to).children.push(node);
        } else {
          roots.push(node);
        }
      });

      return roots;
    } catch (error) {
      logger.error('Error getting org chart:', error);
      throw error;
    }
  }

  async getDirectReports(employeeId) {
    try {
      const result = await authPool.query(
        `SELECT e.*, d.name as designation
         FROM employees e
         LEFT JOIN designations d ON e.designation_id = d.id
         WHERE e.reports_to = $1 AND e.status = 'Active'
         ORDER BY e.full_name`,
        [employeeId]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting direct reports:', error);
      throw error;
    }
  }

  // ===================== EMPLOYEE GROUPS =====================

  async getEmployeeGroups(divisionCode = null) {
    try {
      let query = `
        SELECT g.*,
               COALESCE(
                 (SELECT json_agg(json_build_object('id', e.id, 'name', e.full_name, 'employee_code', e.employee_code))
                  FROM employee_group_members gm
                  JOIN employees e ON gm.employee_id = e.id
                  WHERE gm.group_id = g.id), '[]'
               ) as members,
               (SELECT COUNT(*) FROM employee_group_members WHERE group_id = g.id) as member_count
        FROM employee_groups g
        WHERE g.is_active = true
      `;
      const params = [];

      if (divisionCode) {
        query += ` AND (g.division_code = $1 OR g.division_code IS NULL)`;
        params.push(divisionCode);
      }

      query += ` ORDER BY g.name`;
      const result = await authPool.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting employee groups:', error);
      throw error;
    }
  }

  async createEmployeeGroup(data) {
    try {
      const result = await authPool.query(
        `INSERT INTO employee_groups (name, description, division_code)
         VALUES ($1, $2, $3) RETURNING *`,
        [data.name, data.description, data.division_code]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating employee group:', error);
      throw error;
    }
  }

  async updateEmployeeGroup(id, data) {
    try {
      const result = await authPool.query(
        `UPDATE employee_groups 
         SET name = COALESCE($2, name),
             description = COALESCE($3, description),
             division_code = $4,
             is_active = COALESCE($5, is_active)
         WHERE id = $1 RETURNING *`,
        [id, data.name, data.description, data.division_code, data.is_active]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating employee group:', error);
      throw error;
    }
  }

  async addToGroup(groupId, employeeIds) {
    const client = await authPool.connect();
    try {
      await client.query('BEGIN');
      for (const empId of employeeIds) {
        await client.query(
          `INSERT INTO employee_group_members (group_id, employee_id) VALUES ($1, $2)
           ON CONFLICT (group_id, employee_id) DO NOTHING`,
          [groupId, empId]
        );
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error adding to group:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async removeFromGroup(groupId, employeeId) {
    try {
      await authPool.query(
        'DELETE FROM employee_group_members WHERE group_id = $1 AND employee_id = $2',
        [groupId, employeeId]
      );
      return true;
    } catch (error) {
      logger.error('Error removing from group:', error);
      throw error;
    }
  }

  async deleteEmployeeGroup(id) {
    try {
      await authPool.query('DELETE FROM employee_groups WHERE id = $1', [id]);
      return true;
    } catch (error) {
      logger.error('Error deleting group:', error);
      throw error;
    }
  }

  // ===================== DEPARTMENTS =====================

  async getDepartments(filters = {}) {
    try {
      let query = `SELECT * FROM departments WHERE 1=1`;
      const params = [];
      let paramCount = 1;

      if (filters.isActive !== undefined) {
        query += ` AND is_active = $${paramCount++}`;
        params.push(filters.isActive);
      }

      query += ` ORDER BY name`;
      const result = await authPool.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting departments:', error);
      throw error;
    }
  }

  async createDepartment(data) {
    try {
      const result = await authPool.query(
        `INSERT INTO departments (name, description, parent_id)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [data.name, data.description, data.parent_id || null]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating department:', error);
      throw error;
    }
  }

  async updateDepartment(id, data) {
    try {
      const result = await authPool.query(
        `UPDATE departments 
         SET name = COALESCE($2, name),
             description = COALESCE($3, description),
             parent_id = $4,
             is_active = COALESCE($5, is_active),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [id, data.name, data.description, data.parent_id, data.is_active]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating department:', error);
      throw error;
    }
  }

  async deleteDepartment(id) {
    try {
      await authPool.query('DELETE FROM departments WHERE id = $1', [id]);
      return true;
    } catch (error) {
      logger.error('Error deleting department:', error);
      throw error;
    }
  }

  // ===================== BRANCHES =====================

  async getBranches(filters = {}) {
    try {
      let query = `SELECT * FROM branches WHERE 1=1`;
      const params = [];
      let paramCount = 1;

      if (filters.isActive !== undefined) {
        query += ` AND is_active = $${paramCount++}`;
        params.push(filters.isActive);
      }

      query += ` ORDER BY name`;
      const result = await authPool.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting branches:', error);
      throw error;
    }
  }

  async createBranch(data) {
    try {
      const result = await authPool.query(
        `INSERT INTO branches (name, description, address)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [data.name, data.description, data.address]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating branch:', error);
      throw error;
    }
  }

  async updateBranch(id, data) {
    try {
      const result = await authPool.query(
        `UPDATE branches 
         SET name = COALESCE($2, name),
             description = COALESCE($3, description),
             address = COALESCE($4, address),
             is_active = COALESCE($5, is_active),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [id, data.name, data.description, data.address, data.is_active]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating branch:', error);
      throw error;
    }
  }

  async deleteBranch(id) {
    try {
      await authPool.query('DELETE FROM branches WHERE id = $1', [id]);
      return true;
    } catch (error) {
      logger.error('Error deleting branch:', error);
      throw error;
    }
  }

  /**
   * Get user with 'General Manager' designation
   * Used for budget submission email feature
   */
  async getGeneralManagerEmail() {
    try {
      // First try to find user linked to employee with General Manager designation
      const result = await authPool.query(`
        SELECT u.email, u.name, e.full_name
        FROM users u
        JOIN employees e ON e.user_id = u.id
        JOIN designations d ON e.designation_id = d.id
        WHERE LOWER(d.name) = 'general manager'
          AND e.status = 'Active'
          AND u.is_active = TRUE
        ORDER BY d.level DESC
        LIMIT 1
      `);

      if (result.rows.length > 0) {
        return {
          email: result.rows[0].email,
          name: result.rows[0].full_name || result.rows[0].name
        };
      }

      // Fallback: try to find user with 'General Manager' in designation field directly
      const fallbackResult = await authPool.query(`
        SELECT email, name, designation
        FROM users
        WHERE LOWER(designation) LIKE '%general manager%'
          AND is_active = TRUE
        ORDER BY id
        LIMIT 1
      `);

      if (fallbackResult.rows.length > 0) {
        return {
          email: fallbackResult.rows[0].email,
          name: fallbackResult.rows[0].name
        };
      }

      return null;
    } catch (error) {
      logger.error('Error getting General Manager email:', error);
      throw error;
    }
  }
}

module.exports = new EmployeeService();
