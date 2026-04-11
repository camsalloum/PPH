/**
 * ============================================================================
 * CUSTOMER MASTER API ROUTES
 * ============================================================================
 * 
 * REST API endpoints for Customer Master Data module.
 * All routes are prefixed with /api/customer-master/:division
 * 
 * Created: December 23, 2025
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const CustomerMasterService = require('../services/CustomerMasterService');
const { authenticate } = require('../middleware/auth');
const requireAnyRole = require('../middleware/requireAnyRole');

const SENIOR_LEVEL = 6;
const CRM_SENIOR_ROLES = ['manager', 'sales_manager', 'sales_coordinator'];

// Cache for service instances by division
const serviceCache = {};

/**
 * Get or create service instance for division
 */
function getService(division) {
  if (!serviceCache[division]) {
    serviceCache[division] = new CustomerMasterService(division);
  }
  return serviceCache[division];
}

// Customer master data is restricted to CRM full-access roles.
router.use(
  authenticate,
  requireAnyRole(['admin'], { minLevel: SENIOR_LEVEL, minLevelRoles: CRM_SENIOR_ROLES })
);

// ============================================================================
// CUSTOMER ENDPOINTS
// ============================================================================

/**
 * GET /:division/customers
 * Get all customers with pagination and filters
 */
router.get('/:division/customers', async (req, res) => {
  try {
    const { division } = req.params;
    const {
      search,
      customerGroup,
      territory,
      isActive,
      salesRep,
      limit,
      offset,
      sortBy,
      sortOrder
    } = req.query;

    const service = getService(division);
    const result = await service.getAllCustomers({
      search,
      customerGroup,
      territory,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      salesRep,
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0,
      sortBy,
      sortOrder
    });

    res.json({
      success: true,
      data: result.customers,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.offset + result.limit < result.total
      }
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * GET /:division/customers/:customerCode
 * Get a single customer by code
 */
router.get('/:division/customers/:customerCode', async (req, res) => {
  try {
    const { division, customerCode } = req.params;
    const service = getService(division);
    const customer = await service.getCustomerByCode(customerCode);

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    // Also get aliases
    const aliases = await service.getAliasesForCustomer(customerCode);

    res.json({
      success: true,
      data: {
        ...customer,
        aliases
      }
    });
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /:division/customers
 * Create a new customer
 */
router.post('/:division/customers', async (req, res) => {
  try {
    const { division } = req.params;
    const customerData = req.body;
    
    // Add created_by from request (would come from auth middleware in production)
    customerData.created_by = req.body.created_by || req.headers['x-user'] || 'API';

    const service = getService(division);
    const customer = await service.createCustomer(customerData);

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: customer
    });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * PUT /:division/customers/:customerCode
 * Update a customer
 */
router.put('/:division/customers/:customerCode', async (req, res) => {
  try {
    const { division, customerCode } = req.params;
    const updates = req.body;
    const updatedBy = req.body.updated_by || req.headers['x-user'] || 'API';

    const service = getService(division);
    const customer = await service.updateCustomer(customerCode, updates, updatedBy);

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    res.json({
      success: true,
      message: 'Customer updated successfully',
      data: customer
    });
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * DELETE /:division/customers/:customerCode
 * Deactivate a customer (soft delete)
 */
router.delete('/:division/customers/:customerCode', async (req, res) => {
  try {
    const { division, customerCode } = req.params;
    const updatedBy = req.headers['x-user'] || 'API';

    const service = getService(division);
    const customer = await service.deactivateCustomer(customerCode, updatedBy);

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    res.json({
      success: true,
      message: 'Customer deactivated successfully',
      data: customer
    });
  } catch (error) {
    console.error('Error deactivating customer:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /:division/customers/:customerCode/merge
 * Merge a customer into another
 */
router.post('/:division/customers/:customerCode/merge', async (req, res) => {
  try {
    const { division, customerCode } = req.params;
    const { targetCode } = req.body;
    const mergedBy = req.headers['x-user'] || 'API';

    if (!targetCode) {
      return res.status(400).json({
        success: false,
        error: 'Target customer code is required'
      });
    }

    const service = getService(division);
    const customer = await service.mergeCustomer(customerCode, targetCode, mergedBy);

    res.json({
      success: true,
      message: `Customer ${customerCode} merged into ${targetCode}`,
      data: customer
    });
  } catch (error) {
    console.error('Error merging customer:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================================================
// ALIAS ENDPOINTS
// ============================================================================

/**
 * GET /:division/customers/:customerCode/aliases
 * Get all aliases for a customer
 */
router.get('/:division/customers/:customerCode/aliases', async (req, res) => {
  try {
    const { division, customerCode } = req.params;
    const service = getService(division);
    const aliases = await service.getAliasesForCustomer(customerCode);

    res.json({
      success: true,
      data: aliases
    });
  } catch (error) {
    console.error('Error fetching aliases:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /:division/customers/:customerCode/aliases
 * Add an alias to a customer
 */
router.post('/:division/customers/:customerCode/aliases', async (req, res) => {
  try {
    const { division, customerCode } = req.params;
    const aliasData = req.body;
    aliasData.created_by = req.body.created_by || req.headers['x-user'] || 'API';

    const service = getService(division);
    const alias = await service.addAlias(customerCode, aliasData);

    res.status(201).json({
      success: true,
      message: 'Alias added successfully',
      data: alias
    });
  } catch (error) {
    console.error('Error adding alias:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * PUT /:division/aliases/:aliasId/verify
 * Verify an alias
 */
router.put('/:division/aliases/:aliasId/verify', async (req, res) => {
  try {
    const { division, aliasId } = req.params;
    const verifiedBy = req.headers['x-user'] || 'API';

    const service = getService(division);
    const alias = await service.verifyAlias(aliasId, verifiedBy);

    res.json({
      success: true,
      message: 'Alias verified successfully',
      data: alias
    });
  } catch (error) {
    console.error('Error verifying alias:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * PUT /:division/customers/:customerCode/aliases/:aliasId/primary
 * Set an alias as primary
 */
router.put('/:division/customers/:customerCode/aliases/:aliasId/primary', async (req, res) => {
  try {
    const { division, customerCode, aliasId } = req.params;
    const service = getService(division);
    const alias = await service.setPrimaryAlias(customerCode, aliasId);

    res.json({
      success: true,
      message: 'Primary alias set successfully',
      data: alias
    });
  } catch (error) {
    console.error('Error setting primary alias:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * GET /:division/lookup/:name
 * Look up a customer by name (including aliases)
 */
router.get('/:division/lookup/:name', async (req, res) => {
  try {
    const { division, name } = req.params;
    const service = getService(division);
    const customer = await service.findCustomerByAlias(decodeURIComponent(name));

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    console.error('Error looking up customer:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================================================
// MERGE CODE ENDPOINTS
// ============================================================================

/**
 * POST /:division/merge-codes/generate
 * Generate a new merge code
 */
router.post('/:division/merge-codes/generate', async (req, res) => {
  try {
    const { division } = req.params;
    const service = getService(division);
    const mergeCode = await service.generateMergeCode();

    res.json({
      success: true,
      data: { merge_code: mergeCode }
    });
  } catch (error) {
    console.error('Error generating merge code:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /:division/merge-rules/:ruleId/assign-code
 * Assign merge code to a specific rule
 */
router.post('/:division/merge-rules/:ruleId/assign-code', async (req, res) => {
  try {
    const { division, ruleId } = req.params;
    const service = getService(division);
    const rule = await service.assignMergeCodeToRule(ruleId);

    res.json({
      success: true,
      message: 'Merge code assigned successfully',
      data: rule
    });
  } catch (error) {
    console.error('Error assigning merge code:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /:division/merge-rules/assign-all-codes
 * Assign merge codes to all rules without one
 */
router.post('/:division/merge-rules/assign-all-codes', async (req, res) => {
  try {
    const { division } = req.params;
    const service = getService(division);
    const result = await service.assignMergeCodesToAllRules();

    res.json({
      success: true,
      message: `Assigned merge codes to ${result.count} rules`,
      data: result
    });
  } catch (error) {
    console.error('Error assigning merge codes:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================================================
// STATISTICS ENDPOINTS
// ============================================================================

/**
 * GET /:division/statistics
 * Get customer statistics for the division
 */
router.get('/:division/statistics', async (req, res) => {
  try {
    const { division } = req.params;
    const service = getService(division);
    const stats = await service.getStatistics();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================================================
// MIGRATION ENDPOINTS
// ============================================================================

/**
 * GET /:division/migration/unique-customers
 * Get unique customer names from all data sources
 */
router.get('/:division/migration/unique-customers', async (req, res) => {
  try {
    const { division } = req.params;
    const service = getService(division);
    const customers = await service.getUniqueCustomerNamesFromSources();

    res.json({
      success: true,
      count: customers.length,
      data: customers
    });
  } catch (error) {
    console.error('Error fetching unique customers:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * GET /:division/migration/merged-customers
 * Get merged customer names from merge rules
 */
router.get('/:division/migration/merged-customers', async (req, res) => {
  try {
    const { division } = req.params;
    const service = getService(division);
    const customers = await service.getMergedCustomerNames();

    res.json({
      success: true,
      count: customers.length,
      data: customers
    });
  } catch (error) {
    console.error('Error fetching merged customers:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /:division/migration/create-from-merge-rule
 * Create customer master entry from a merge rule
 */
router.post('/:division/migration/create-from-merge-rule', async (req, res) => {
  try {
    const { division } = req.params;
    const { mergeRule } = req.body;
    const createdBy = req.headers['x-user'] || 'MIGRATION';

    if (!mergeRule || !mergeRule.merged_customer) {
      return res.status(400).json({
        success: false,
        error: 'Merge rule with merged_customer is required'
      });
    }

    const service = getService(division);
    const customer = await service.createCustomerFromMergeRule(mergeRule, createdBy);

    res.status(201).json({
      success: true,
      message: 'Customer created from merge rule',
      data: customer
    });
  } catch (error) {
    console.error('Error creating customer from merge rule:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;
