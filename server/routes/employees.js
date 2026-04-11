/**
 * Employee Routes
 * API endpoints for employees, designations, groups, org chart
 * All dynamically linked to divisions
 */

const express = require('express');
const router = express.Router();
const employeeService = require('../services/employeeService');
const unifiedUserService = require('../services/unifiedUserService');
const { authenticate, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

// All routes require authentication
router.use(authenticate);

// ===================== DESIGNATIONS =====================

/**
 * GET /api/employees/designations
 * Get all designations (job titles)
 */
router.get('/designations', async (req, res) => {
  try {
    const { department, isActive } = req.query;
    const designations = await employeeService.getDesignations({
      department,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined
    });
    res.json({ success: true, designations });
  } catch (error) {
    logger.error('Get designations error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/employees/designations
 * Create a new designation (admin only)
 */
router.post('/designations', requireRole('admin'), async (req, res) => {
  try {
    const designation = await employeeService.createDesignation(req.body);
    res.json({ success: true, designation });
  } catch (error) {
    logger.error('Create designation error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/employees/designations/:id
 * Update a designation (admin only)
 */
router.put('/designations/:id', requireRole('admin'), async (req, res) => {
  try {
    const designation = await employeeService.updateDesignation(req.params.id, req.body);
    res.json({ success: true, designation });
  } catch (error) {
    logger.error('Update designation error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/employees/designations/:id
 * Delete a designation (admin only)
 */
router.delete('/designations/:id', requireRole('admin'), async (req, res) => {
  try {
    await employeeService.deleteDesignation(req.params.id);
    res.json({ success: true, message: 'Designation deleted' });
  } catch (error) {
    logger.error('Delete designation error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ===================== DEPARTMENTS =====================

/**
 * GET /api/employees/departments
 * Get all departments
 */
router.get('/departments', async (req, res) => {
  try {
    const { isActive } = req.query;
    const departments = await employeeService.getDepartments({
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined
    });
    res.json({ success: true, departments });
  } catch (error) {
    logger.error('Get departments error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/employees/departments
 * Create a new department (admin only)
 */
router.post('/departments', requireRole('admin'), async (req, res) => {
  try {
    const department = await employeeService.createDepartment(req.body);
    res.json({ success: true, department });
  } catch (error) {
    logger.error('Create department error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/employees/departments/:id
 * Update a department (admin only)
 */
router.put('/departments/:id', requireRole('admin'), async (req, res) => {
  try {
    const department = await employeeService.updateDepartment(req.params.id, req.body);
    res.json({ success: true, department });
  } catch (error) {
    logger.error('Update department error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/employees/departments/:id
 * Delete a department (admin only)
 */
router.delete('/departments/:id', requireRole('admin'), async (req, res) => {
  try {
    await employeeService.deleteDepartment(req.params.id);
    res.json({ success: true, message: 'Department deleted' });
  } catch (error) {
    logger.error('Delete department error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ===================== BRANCHES =====================

/**
 * GET /api/employees/branches
 * Get all branches
 */
router.get('/branches', async (req, res) => {
  try {
    const { isActive } = req.query;
    const branches = await employeeService.getBranches({
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined
    });
    res.json({ success: true, branches });
  } catch (error) {
    logger.error('Get branches error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/employees/branches
 * Create a new branch (admin only)
 */
router.post('/branches', requireRole('admin'), async (req, res) => {
  try {
    const branch = await employeeService.createBranch(req.body);
    res.json({ success: true, branch });
  } catch (error) {
    logger.error('Create branch error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/employees/branches/:id
 * Update a branch (admin only)
 */
router.put('/branches/:id', requireRole('admin'), async (req, res) => {
  try {
    const branch = await employeeService.updateBranch(req.params.id, req.body);
    res.json({ success: true, branch });
  } catch (error) {
    logger.error('Update branch error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/employees/branches/:id
 * Delete a branch (admin only)
 */
router.delete('/branches/:id', requireRole('admin'), async (req, res) => {
  try {
    await employeeService.deleteBranch(req.params.id);
    res.json({ success: true, message: 'Branch deleted' });
  } catch (error) {
    logger.error('Delete branch error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ===================== EMPLOYEES =====================

/**
 * GET /api/employees
 * Get all employees with filters
 */
router.get('/', async (req, res) => {
  try {
    const { status, department_id, divisionCode, reportsTo, search } = req.query;
    const employees = await employeeService.getEmployees({
      status,
      department_id: department_id ? parseInt(department_id) : undefined,
      divisionCode,
      reportsTo: reportsTo ? parseInt(reportsTo) : undefined,
      search
    });
    res.json({ success: true, employees });
  } catch (error) {
    logger.error('Get employees error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/employees/me
 * Get current user's employee profile
 */
router.get('/me', async (req, res) => {
  try {
    const employee = await employeeService.getEmployeeByUserId(req.user.id);
    res.json({ success: true, employee });
  } catch (error) {
    logger.error('Get my employee error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/employees/org-chart
 * Get organization chart (hierarchy tree)
 */
router.get('/org-chart', async (req, res) => {
  try {
    const { divisionCode } = req.query;
    const orgChart = await employeeService.getOrgChart(divisionCode);
    res.json({ success: true, orgChart });
  } catch (error) {
    logger.error('Get org chart error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/employees/:id
 * Get employee by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const employee = await employeeService.getEmployeeById(req.params.id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json({ success: true, employee });
  } catch (error) {
    logger.error('Get employee error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/employees/:id/reports
 * Get direct reports for an employee
 */
router.get('/:id/reports', async (req, res) => {
  try {
    const reports = await employeeService.getDirectReports(req.params.id);
    res.json({ success: true, reports });
  } catch (error) {
    logger.error('Get direct reports error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/employees/bulk-import
 * Bulk import employees from Excel (admin only)
 */
router.post('/bulk-import', requireRole('admin'), async (req, res) => {
  try {
    const { employees, divisionCode } = req.body;
    
    if (!employees || !Array.isArray(employees) || employees.length === 0) {
      return res.status(400).json({ error: 'No employees provided' });
    }

    const result = await employeeService.bulkImportEmployees(employees, divisionCode);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Bulk import error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/employees
 * Create a new employee (admin only)
 */
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const employee = await employeeService.createEmployee(req.body);
    res.json({ success: true, employee });
  } catch (error) {
    logger.error('Create employee error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/employees/:id
 * Update an employee (admin only)
 */
router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const employee = await employeeService.updateEmployee(req.params.id, req.body);
    res.json({ success: true, employee });
  } catch (error) {
    logger.error('Update employee error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/employees/:id
 * Delete an employee (admin only)
 */
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    await employeeService.deleteEmployee(req.params.id);
    res.json({ success: true, message: 'Employee deleted' });
  } catch (error) {
    logger.error('Delete employee error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ===================== EMPLOYEE GROUPS =====================

/**
 * GET /api/employees/groups
 * Get employee groups
 */
router.get('/groups/list', async (req, res) => {
  try {
    const { divisionCode } = req.query;
    const groups = await employeeService.getEmployeeGroups(divisionCode);
    res.json({ success: true, groups });
  } catch (error) {
    logger.error('Get groups error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/employees/groups
 * Create an employee group (admin only)
 */
router.post('/groups', requireRole('admin'), async (req, res) => {
  try {
    const group = await employeeService.createEmployeeGroup(req.body);
    res.json({ success: true, group });
  } catch (error) {
    logger.error('Create group error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/employees/groups/:id
 * Update an employee group (admin only)
 */
router.put('/groups/:id', requireRole('admin'), async (req, res) => {
  try {
    const group = await employeeService.updateEmployeeGroup(req.params.id, req.body);
    res.json({ success: true, group });
  } catch (error) {
    logger.error('Update group error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/employees/groups/:id/members
 * Add employees to a group (admin only)
 */
router.post('/groups/:id/members', requireRole('admin'), async (req, res) => {
  try {
    const { employeeIds } = req.body;
    await employeeService.addToGroup(req.params.id, employeeIds);
    res.json({ success: true, message: 'Members added' });
  } catch (error) {
    logger.error('Add to group error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/employees/groups/:id/members/:employeeId
 * Remove an employee from a group (admin only)
 */
router.delete('/groups/:id/members/:employeeId', requireRole('admin'), async (req, res) => {
  try {
    await employeeService.removeFromGroup(req.params.id, req.params.employeeId);
    res.json({ success: true, message: 'Member removed' });
  } catch (error) {
    logger.error('Remove from group error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/employees/groups/:id
 * Delete an employee group (admin only)
 */
router.delete('/groups/:id', requireRole('admin'), async (req, res) => {
  try {
    await employeeService.deleteEmployeeGroup(req.params.id);
    res.json({ success: true, message: 'Group deleted' });
  } catch (error) {
    logger.error('Delete group error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/employees/general-manager
 * Get General Manager email for budget submission
 * Returns email of user with General Manager designation
 */
router.get('/general-manager', async (req, res) => {
  try {
    const gm = await employeeService.getGeneralManagerEmail();
    if (gm) {
      res.json({ success: true, ...gm });
    } else {
      res.json({ success: false, message: 'No General Manager found' });
    }
  } catch (error) {
    logger.error('Get General Manager error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
