/**
 * Unified User Management Routes
 * API endpoints for user-employee linking, sales hierarchy, and org chart
 * Part of: User Management Module Implementation
 * Date: December 25, 2025
 */

const express = require('express');
const router = express.Router();
const unifiedUserService = require('../services/unifiedUserService');
const { authenticate, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

// All routes require authentication
router.use(authenticate);

// ============================================================
// PHASE 1: USER-EMPLOYEE LINKING
// ============================================================

/**
 * GET /api/unified-users
 * Get all users with their employee link status
 */
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const users = await unifiedUserService.getUsersWithLinkStatus();
    res.json({ success: true, users });
  } catch (error) {
    logger.error('Get unified users error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/unified-users/link-summary
 * Get summary of linked/unlinked users and employees
 */
router.get('/link-summary', requireRole('admin'), async (req, res) => {
  try {
    const summary = await unifiedUserService.getLinkStatusSummary();
    res.json({ success: true, summary });
  } catch (error) {
    logger.error('Get link summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/unified-users/unlinked-users
 * Get users without employee profiles
 */
router.get('/unlinked-users', requireRole('admin'), async (req, res) => {
  try {
    const users = await unifiedUserService.getUnlinkedUsers();
    res.json({ success: true, users });
  } catch (error) {
    logger.error('Get unlinked users error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/unified-users/unlinked-employees
 * Get employees without user accounts
 */
router.get('/unlinked-employees', requireRole('admin'), async (req, res) => {
  try {
    const employees = await unifiedUserService.getUnlinkedEmployees();
    res.json({ success: true, employees });
  } catch (error) {
    logger.error('Get unlinked employees error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/unified-users/:userId/link-employee
 * Link a user to an existing employee
 */
router.post('/:userId/link-employee', requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { employeeId } = req.body;

    if (!employeeId) {
      return res.status(400).json({ error: 'Employee ID is required' });
    }

    const result = await unifiedUserService.linkUserToEmployee(
      parseInt(userId),
      parseInt(employeeId),
      req.user.id
    );

    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Link user to employee error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/unified-users/:userId/create-employee
 * Create an employee profile from a user
 */
router.post('/:userId/create-employee', requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const employeeData = req.body;

    const result = await unifiedUserService.createEmployeeFromUser(
      parseInt(userId),
      employeeData,
      req.user.id
    );

    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Create employee from user error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/unified-users/:userId/unlink
 * Unlink a user from their employee
 */
router.post('/:userId/unlink', requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await unifiedUserService.unlinkUser(
      parseInt(userId),
      req.user.id
    );

    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Unlink user error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================================
// PHASE 2: SALES PERSONS
// ============================================================

/**
 * GET /api/unified-users/sales-persons
 * Get all sales persons with filters
 */
router.get('/sales-persons', async (req, res) => {
  try {
    const { divisionCode, isEnabled, parentId } = req.query;
    const salesPersons = await unifiedUserService.getSalesPersons({
      divisionCode,
      isEnabled: isEnabled === 'true' ? true : isEnabled === 'false' ? false : undefined,
      parentId: parentId ? parseInt(parentId) : undefined
    });
    res.json({ success: true, salesPersons });
  } catch (error) {
    logger.error('Get sales persons error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/unified-users/sales-persons/hierarchy
 * Get sales team hierarchy as tree
 */
router.get('/sales-persons/hierarchy', async (req, res) => {
  try {
    const { divisionCode } = req.query;
    const hierarchy = await unifiedUserService.getSalesHierarchy(divisionCode);
    res.json({ success: true, hierarchy });
  } catch (error) {
    logger.error('Get sales hierarchy error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/unified-users/sales-persons
 * Create a new sales person
 */
router.post('/sales-persons', requireRole('admin'), async (req, res) => {
  try {
    const salesPerson = await unifiedUserService.createSalesPerson(
      req.body,
      req.user.id
    );
    res.json({ success: true, salesPerson });
  } catch (error) {
    logger.error('Create sales person error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/unified-users/sales-persons/:id
 * Update a sales person
 */
router.put('/sales-persons/:id', requireRole('admin'), async (req, res) => {
  try {
    const salesPerson = await unifiedUserService.updateSalesPerson(
      parseInt(req.params.id),
      req.body,
      req.user.id
    );
    res.json({ success: true, salesPerson });
  } catch (error) {
    logger.error('Update sales person error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/unified-users/sales-persons/:id/territories
 * Assign territories to sales person
 */
router.post('/sales-persons/:id/territories', requireRole('admin'), async (req, res) => {
  try {
    const { territoryIds } = req.body;

    if (!Array.isArray(territoryIds)) {
      return res.status(400).json({ error: 'territoryIds must be an array' });
    }

    const result = await unifiedUserService.assignTerritories(
      parseInt(req.params.id),
      territoryIds,
      req.user.id
    );
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Assign territories error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================================
// PHASE 3: ORG CHART
// ============================================================

/**
 * GET /api/unified-users/org-chart
 * Get enhanced org chart with roles
 */
router.get('/org-chart', async (req, res) => {
  try {
    const { divisionCode } = req.query;
    const orgChart = await unifiedUserService.getEnhancedOrgChart(divisionCode);
    res.json({ success: true, orgChart });
  } catch (error) {
    logger.error('Get org chart error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/unified-users/org-chart/employee/:id
 * Get employee details for org chart popup
 */
router.get('/org-chart/employee/:id', async (req, res) => {
  try {
    const details = await unifiedUserService.getEmployeeOrgDetails(parseInt(req.params.id));
    if (!details) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json({ success: true, employee: details });
  } catch (error) {
    logger.error('Get employee org details error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// PHASE 7: TERRITORY ACCESS
// ============================================================

/**
 * GET /api/unified-users/my-territories
 * Get current user's accessible territories
 */
router.get('/my-territories', async (req, res) => {
  try {
    const territories = await unifiedUserService.getUserTerritories(req.user.id);
    res.json({ success: true, territories });
  } catch (error) {
    logger.error('Get my territories error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/unified-users/:userId/territories
 * Get a user's accessible territories (admin)
 */
router.get('/:userId/territories', requireRole('admin'), async (req, res) => {
  try {
    const territories = await unifiedUserService.getUserTerritories(parseInt(req.params.userId));
    res.json({ success: true, territories });
  } catch (error) {
    logger.error('Get user territories error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/unified-users/employees/:employeeId/territories
 * Assign territories to employee
 */
router.post('/employees/:employeeId/territories', requireRole('admin'), async (req, res) => {
  try {
    const { territoryIds } = req.body;

    if (!Array.isArray(territoryIds)) {
      return res.status(400).json({ error: 'territoryIds must be an array' });
    }

    const result = await unifiedUserService.assignEmployeeTerritories(
      parseInt(req.params.employeeId),
      territoryIds,
      req.user.id
    );
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Assign employee territories error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================================
// AUDIT LOG
// ============================================================

/**
 * GET /api/unified-users/audit-log
 * Get permission audit log
 */
router.get('/audit-log', requireRole('admin'), async (req, res) => {
  try {
    const { userId, action, fromDate, toDate } = req.query;
    const log = await unifiedUserService.getAuditLog({
      userId: userId ? parseInt(userId) : undefined,
      action,
      fromDate,
      toDate
    });
    res.json({ success: true, log });
  } catch (error) {
    logger.error('Get audit log error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
