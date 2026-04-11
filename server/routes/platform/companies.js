/**
 * ============================================================================
 * PLATFORM COMPANIES ROUTES
 * ============================================================================
 * 
 * REST API for managing companies (tenants) in the SaaS platform.
 * These routes are for platform administrators only.
 * 
 * Created: December 28, 2025
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const CompanyService = require('../../services/CompanyService');
const { requirePlatformAdmin, requireCompanyAdmin } = require('../../middleware/companyContext');
const logger = require('../../utils/logger');

// ============================================================================
// COMPANY CRUD
// ============================================================================

/**
 * GET /api/platform/companies
 * List all companies (platform admin only)
 */
router.get('/', requirePlatformAdmin, async (req, res) => {
  try {
    const { search, status, planId, isActive, limit, offset } = req.query;

    const result = await CompanyService.getAllCompanies({
      search,
      status,
      planId: planId ? parseInt(planId) : undefined,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0,
    });

    res.json({
      success: true,
      data: result.companies,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.offset + result.limit < result.total,
      },
    });
  } catch (error) {
    logger.error('[Companies] Error listing companies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/platform/companies/:id
 * Get a single company by ID or code
 */
router.get('/:id', requirePlatformAdmin, async (req, res) => {
  try {
    const company = await CompanyService.getCompany(req.params.id);

    if (!company) {
      return res.status(404).json({
        success: false,
        error: 'Company not found',
      });
    }

    res.json({
      success: true,
      data: company,
    });
  } catch (error) {
    logger.error('[Companies] Error getting company:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/platform/companies
 * Create a new company
 */
router.post('/', requirePlatformAdmin, async (req, res) => {
  try {
    const company = await CompanyService.createCompany(
      req.body,
      req.user?.user_id
    );

    res.status(201).json({
      success: true,
      data: company,
      message: 'Company created successfully. Database provisioning queued.',
    });
  } catch (error) {
    logger.error('[Companies] Error creating company:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/platform/companies/:id
 * Update a company
 */
router.put('/:id', requirePlatformAdmin, async (req, res) => {
  try {
    const company = await CompanyService.updateCompany(
      parseInt(req.params.id),
      req.body,
      req.user?.user_id
    );

    res.json({
      success: true,
      data: company,
      message: 'Company updated successfully',
    });
  } catch (error) {
    logger.error('[Companies] Error updating company:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================================
// DIVISION MANAGEMENT
// ============================================================================

/**
 * GET /api/platform/companies/:id/divisions
 * Get divisions for a company
 */
router.get('/:id/divisions', async (req, res) => {
  try {
    const divisions = await CompanyService.getDivisions(parseInt(req.params.id));

    res.json({
      success: true,
      data: divisions,
    });
  } catch (error) {
    logger.error('[Companies] Error getting divisions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/platform/companies/:id/divisions
 * Add a division to a company
 */
router.post('/:id/divisions', requireCompanyAdmin, async (req, res) => {
  try {
    const { division_code, division_name } = req.body;

    if (!division_code || !division_name) {
      return res.status(400).json({
        success: false,
        error: 'Division code and name are required',
      });
    }

    const division = await CompanyService.addDivision(
      parseInt(req.params.id),
      division_code,
      division_name,
      req.user?.user_id
    );

    res.status(201).json({
      success: true,
      data: division,
      message: 'Division added successfully. Table provisioning queued.',
    });
  } catch (error) {
    logger.error('[Companies] Error adding division:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/platform/companies/:companyId/divisions/:divisionId
 * Update a division
 */
router.put('/:companyId/divisions/:divisionId', requireCompanyAdmin, async (req, res) => {
  try {
    const division = await CompanyService.updateDivision(
      parseInt(req.params.divisionId),
      req.body,
      req.user?.user_id
    );

    res.json({
      success: true,
      data: division,
      message: 'Division updated successfully',
    });
  } catch (error) {
    logger.error('[Companies] Error updating division:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================================
// USER MANAGEMENT
// ============================================================================

/**
 * GET /api/platform/companies/:id/users
 * Get users for a company
 */
router.get('/:id/users', requireCompanyAdmin, async (req, res) => {
  try {
    const { search, role, isActive, limit, offset } = req.query;

    const users = await CompanyService.getCompanyUsers(parseInt(req.params.id), {
      search,
      role,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0,
    });

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    logger.error('[Companies] Error getting users:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/platform/companies/:id/users
 * Create a user for a company
 */
router.post('/:id/users', requireCompanyAdmin, async (req, res) => {
  try {
    const user = await CompanyService.createUser(
      parseInt(req.params.id),
      req.body,
      req.user?.user_id
    );

    res.status(201).json({
      success: true,
      data: user,
      message: 'User created successfully',
    });
  } catch (error) {
    logger.error('[Companies] Error creating user:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================================
// SUBSCRIPTION
// ============================================================================

/**
 * PUT /api/platform/companies/:id/subscription
 * Update company subscription
 */
router.put('/:id/subscription', requirePlatformAdmin, async (req, res) => {
  try {
    const { plan_id, status, end_date } = req.body;

    const company = await CompanyService.updateSubscription(
      parseInt(req.params.id),
      plan_id,
      status,
      end_date,
      req.user?.user_id
    );

    res.json({
      success: true,
      data: company,
      message: 'Subscription updated successfully',
    });
  } catch (error) {
    logger.error('[Companies] Error updating subscription:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================================
// DATA SYNC ENDPOINTS
// ============================================================================

/**
 * POST /api/platform/companies/:id/sync
 * Sync company data from tenant's AUTH database (source of truth)
 * This pulls company_name and divisions from the tenant's company_settings table
 */
router.post('/:id/sync', requirePlatformAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const CompanySyncService = require('../../services/CompanySyncService');
    
    // Get company details to find auth database name
    const company = await CompanyService.getCompanyById(parseInt(id));
    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    if (!company.auth_database_name) {
      return res.status(400).json({ 
        success: false, 
        error: 'Company has no auth_database_name configured' 
      });
    }

    // Sync from tenant's AUTH database (where company_settings lives)
    const result = await CompanySyncService.syncCompanyFromTenant(
      company.company_code,
      company.auth_database_name
    );

    res.json({
      success: true,
      message: `Synced company data for ${result.company_name}`,
      data: result,
    });
  } catch (error) {
    logger.error('[Companies] Error syncing company:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/platform/companies/sync-all
 * Sync all companies from their tenant databases
 */
router.post('/sync-all', requirePlatformAdmin, async (req, res) => {
  try {
    const CompanySyncService = require('../../services/CompanySyncService');
    const results = await CompanySyncService.syncAllCompanies();

    res.json({
      success: true,
      message: `Synced ${results.synced} companies`,
      data: results,
    });
  } catch (error) {
    logger.error('[Companies] Error syncing all companies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
