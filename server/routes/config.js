/**
 * Dynamic Configuration Routes
 * 
 * Endpoints for managing material columns and pricing configurations
 * 
 * Base URL: /api/config
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const PricingConfigService = require('../database/PricingConfigService');
const MaterialGroupService = require('../database/MaterialGroupService');
const MaterialConditionService = require('../database/MaterialConditionService');
const MaterialColumnService = require('../services/MaterialColumnService');
const { isValidDivision } = require('../database/divisionValidator');

// ============================================================================
// MATERIAL COLUMN CONFIGURATION (ACTIVELY USED)
// ============================================================================
// Note: material_config table was removed - it was an abandoned migration
// MaterialPercentageManager uses hardcoded material list instead
// material_column_config is the correct table (32 rows, actively used)

// ============================================================================
// PRICING CONFIGURATION ENDPOINTS
// ============================================================================

/**
 * GET /api/config/pricing-fields/:division
 * Get all active pricing fields for a division
 * 
 * Example: GET /api/config/pricing-fields/fp
 * Response: {
 *   "success": true,
 *   "division": "fp",
 *   "count": 3,
 *   "data": [
 *     {
 *       "id": 1,
 *       "division": "fp",
 *       "field_code": "ASP",
 *       "field_name": "asp_round",
 *       "display_name": "ASP Rounding",
 *       "description": "Average Selling Price rounding value",
 *       "min_value": 0,
 *       "max_value": 1000,
 *       "is_active": true,
 *       "display_order": 1,
 *       "created_at": "2026-01-08...",
 *       "updated_at": "2026-01-08..."
 *     },
 *     ...
 *   ]
 * }
 */
router.get('/pricing-fields/:division', async (req, res) => {
  try {
    const { division } = req.params;
    
    if (!(await isValidDivision(division))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid division. Division must be configured in Company Settings.'
      });
    }

    const fields = await PricingConfigService.getPricingFields(division.toLowerCase());
    
    res.json({
      success: true,
      division: division.toLowerCase(),
      count: fields.length,
      data: fields
    });
  } catch (error) {
    logger.error('Error fetching pricing fields:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pricing fields'
    });
  }
});

/**
 * GET /api/config/pricing-fields/:division/codes
 * Get just the pricing field codes as array
 * 
 * Example: GET /api/config/pricing-fields/fp/codes
 * Response: {
 *   "success": true,
 *   "codes": ["ASP", "MORM", "RM"]
 * }
 */
router.get('/pricing-fields/:division/codes', async (req, res) => {
  try {
    const { division } = req.params;
    
    if (!(await isValidDivision(division))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid division. Division must be configured in Company Settings.'
      });
    }

    const codes = await PricingConfigService.getPricingFieldCodes(division.toLowerCase());
    
    res.json({
      success: true,
      division: division.toLowerCase(),
      codes
    });
  } catch (error) {
    logger.error('Error fetching pricing field codes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pricing field codes'
    });
  }
});

/**
 * GET /api/config/pricing-fields/:division/names
 * Get just the field names (database column names)
 * 
 * Example: GET /api/config/pricing-fields/fp/names
 * Response: {
 *   "success": true,
 *   "names": ["asp_round", "morm_round", "rm_round"]
 * }
 */
router.get('/pricing-fields/:division/names', async (req, res) => {
  try {
    const { division } = req.params;
    
    if (!(await isValidDivision(division))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid division. Division must be configured in Company Settings.'
      });
    }

    const names = await PricingConfigService.getPricingFieldNames(division.toLowerCase());
    
    res.json({
      success: true,
      division: division.toLowerCase(),
      names
    });
  } catch (error) {
    logger.error('Error fetching pricing field names:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pricing field names'
    });
  }
});

/**
 * GET /api/config/pricing-fields/:division/:fieldCode
 * Get a specific pricing field by code
 */
router.get('/pricing-fields/:division/:fieldCode', async (req, res) => {
  try {
    const { division, fieldCode } = req.params;
    
    if (!(await isValidDivision(division))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid division. Division must be configured in Company Settings.'
      });
    }

    const field = await PricingConfigService.getPricingFieldByCode(
      division.toLowerCase(),
      fieldCode.toUpperCase()
    );
    
    if (!field) {
      return res.status(404).json({
        success: false,
        error: `Pricing field ${fieldCode} not found for division ${division}`
      });
    }

    res.json({
      success: true,
      data: field
    });
  } catch (error) {
    logger.error('Error fetching pricing field:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pricing field'
    });
  }
});

/**
 * POST /api/config/pricing-fields/:division/validate
 * Validate a value against a pricing field's constraints
 * 
 * Request Body: {
 *   "field_code": "ASP",
 *   "value": 500
 * }
 * Response: {
 *   "success": true,
 *   "isValid": true
 * }
 */
router.post('/pricing-fields/:division/validate', async (req, res) => {
  try {
    const { division } = req.params;
    const { field_code, value } = req.body;
    
    if (!(await isValidDivision(division))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid division. Division must be configured in Company Settings.'
      });
    }

    if (!field_code) {
      return res.status(400).json({
        success: false,
        error: 'field_code is required'
      });
    }

    const validation = await PricingConfigService.validatePricingValue(
      division.toLowerCase(),
      field_code.toUpperCase(),
      value
    );
    
    res.json({
      success: validation.isValid,
      isValid: validation.isValid,
      error: validation.error
    });
  } catch (error) {
    logger.error('Error validating pricing value:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate pricing value'
    });
  }
});

/**
 * POST /api/config/pricing-fields/:division
 * Add a new pricing field
 * 
 * Request Body: {
 *   "field_code": "NEWFIELD",
 *   "field_name": "new_field_round",
 *   "display_name": "New Field Rounding",
 *   "min_value": 0,
 *   "max_value": 2000,
 *   "description": "Optional description",
 *   "display_order": 4
 * }
 */
router.post('/pricing-fields/:division', async (req, res) => {
  try {
    const { division } = req.params;
    const fieldData = req.body;
    
    if (!(await isValidDivision(division))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid division. Division must be configured in Company Settings.'
      });
    }

    // Validate required fields
    if (!fieldData.field_code || !fieldData.field_name || !fieldData.display_name) {
      return res.status(400).json({
        success: false,
        error: 'Required fields: field_code, field_name, display_name'
      });
    }

    const field = await PricingConfigService.addPricingField(division.toLowerCase(), fieldData);
    
    res.status(201).json({
      success: true,
      message: `Pricing field ${fieldData.field_code} added successfully`,
      data: field
    });
  } catch (error) {
    logger.error('Error adding pricing field:', error);
    res.status(500).json({
      success: false,
      error: `Failed to add pricing field: ${error.message}`
    });
  }
});

/**
 * PUT /api/config/pricing-fields/:division/:fieldCode
 * Update a pricing field
 */
router.put('/pricing-fields/:division/:fieldCode', async (req, res) => {
  try {
    const { division, fieldCode } = req.params;
    const updates = req.body;
    
    if (!(await isValidDivision(division))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid division. Division must be configured in Company Settings.'
      });
    }

    const field = await PricingConfigService.updatePricingField(
      division.toLowerCase(),
      fieldCode.toUpperCase(),
      updates
    );
    
    res.json({
      success: true,
      message: `Pricing field ${fieldCode} updated successfully`,
      data: field
    });
  } catch (error) {
    logger.error('Error updating pricing field:', error);
    res.status(500).json({
      success: false,
      error: `Failed to update pricing field: ${error.message}`
    });
  }
});

/**
 * DELETE /api/config/pricing-fields/:division/:fieldCode
 * Remove a pricing field (soft delete)
 */
router.delete('/pricing-fields/:division/:fieldCode', async (req, res) => {
  try {
    const { division, fieldCode } = req.params;
    
    if (!(await isValidDivision(division))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid division. Division must be configured in Company Settings.'
      });
    }

    const success = await PricingConfigService.removePricingField(
      division.toLowerCase(),
      fieldCode.toUpperCase()
    );
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: `Pricing field ${fieldCode} not found`
      });
    }

    res.json({
      success: true,
      message: `Pricing field ${fieldCode} removed successfully`
    });
  } catch (error) {
    logger.error('Error removing pricing field:', error);
    res.status(500).json({
      success: false,
      error: `Failed to remove pricing field: ${error.message}`
    });
  }
});

// ============================================================================
// MATERIAL GROUP CONFIGURATION ENDPOINTS (for MATERIAL column dropdown)
// ============================================================================

/**
 * GET /api/config/material-groups/:division
 * Get all material groups for a division (e.g., PE, Non PE, Other)
 */
router.get('/material-groups/:division', async (req, res) => {
  try {
    const { division } = req.params;
    
    if (!(await isValidDivision(division))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid division. Division must be configured in Company Settings.'
      });
    }

    const groups = await MaterialGroupService.getMaterialGroups(division.toLowerCase());
    
    res.json({
      success: true,
      division: division.toLowerCase(),
      count: groups.length,
      data: groups
    });
  } catch (error) {
    logger.error('Error fetching material groups:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch material groups'
    });
  }
});

/**
 * GET /api/config/material-groups
 * Get all unique material group names across all divisions
 */
router.get('/material-groups', async (req, res) => {
  try {
    const groups = await MaterialGroupService.getAllMaterialGroups();
    
    res.json({
      success: true,
      data: groups
    });
  } catch (error) {
    logger.error('Error fetching all material groups:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch material groups'
    });
  }
});

/**
 * POST /api/config/material-groups/:division
 * Create a new material group for a division
 */
router.post('/material-groups/:division', async (req, res) => {
  try {
    const { division } = req.params;
    const { group_code, group_name, display_name, description } = req.body;
    
    if (!(await isValidDivision(division))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid division. Division must be configured in Company Settings.'
      });
    }

    if (!group_code || !group_name || !display_name) {
      return res.status(400).json({
        success: false,
        error: 'group_code, group_name, and display_name are required'
      });
    }

    // Check if already exists
    const exists = await MaterialGroupService.exists(division.toLowerCase(), group_code);
    if (exists) {
      return res.status(409).json({
        success: false,
        error: 'Material group already exists in this division'
      });
    }

    const newGroup = await MaterialGroupService.createMaterialGroup(division.toLowerCase(), {
      group_code,
      group_name,
      display_name,
      description
    });
    
    res.status(201).json({
      success: true,
      message: 'Material group created successfully',
      data: newGroup
    });
  } catch (error) {
    logger.error('Error creating material group:', error);
    res.status(500).json({
      success: false,
      error: `Failed to create material group: ${error.message}`
    });
  }
});

/**
 * PUT /api/config/material-groups/:division/:groupCode
 * Update a material group name
 */
router.put('/material-groups/:division/:groupCode', async (req, res) => {
  try {
    const { division, groupCode } = req.params;
    const { newDisplayName, newGroupCode } = req.body;
    
    if (!(await isValidDivision(division))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid division. Division must be configured in Company Settings.'
      });
    }

    if (!newDisplayName) {
      return res.status(400).json({
        success: false,
        error: 'newDisplayName is required'
      });
    }

    const updated = await MaterialGroupService.updateMaterialGroup(division.toLowerCase(), groupCode, {
      group_name: newDisplayName,
      display_name: newDisplayName
    });
    
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Material group not found'
      });
    }
    
    logger.info(`Material group updated: ${groupCode} → ${newDisplayName}`);
    res.json({
      success: true,
      message: `Material group renamed to "${newDisplayName}"`,
      data: updated
    });
  } catch (error) {
    logger.error('Error updating material group:', error);
    res.status(500).json({
      success: false,
      error: `Failed to update material group: ${error.message}`
    });
  }
});

/**
 * DELETE /api/config/material-groups/:division/:groupCode
 * Remove a material group from a division
 */
router.delete('/material-groups/:division/:groupCode', async (req, res) => {
  try {
    const { division, groupCode } = req.params;
    
    if (!(await isValidDivision(division))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid division. Division must be configured in Company Settings.'
      });
    }

    const deleted = await MaterialGroupService.deleteMaterialGroup(division.toLowerCase(), groupCode);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Material group not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Material group removed successfully',
      data: deleted
    });
  } catch (error) {
    logger.error('Error removing material group:', error);
    res.status(500).json({
      success: false,
      error: `Failed to remove material group: ${error.message}`
    });
  }
});

// ============================================================================
// MATERIAL CONDITION CONFIGURATION ENDPOINTS (for Material Condition column dropdown)
// ============================================================================

/**
 * GET /api/config/material-conditions/:division
 * Get all material conditions for a division (e.g., Plain, Printed)
 */
router.get('/material-conditions/:division', async (req, res) => {
  try {
    const { division } = req.params;
    
    if (!(await isValidDivision(division))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid division. Division must be configured in Company Settings.'
      });
    }

    const conditions = await MaterialConditionService.getMaterialConditions(division.toLowerCase());
    
    res.json({
      success: true,
      division: division.toLowerCase(),
      count: conditions.length,
      data: conditions
    });
  } catch (error) {
    logger.error('Error fetching material conditions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch material conditions'
    });
  }
});

/**
 * GET /api/config/material-conditions
 * Get all unique material condition names across all divisions
 */
router.get('/material-conditions', async (req, res) => {
  try {
    const conditions = await MaterialConditionService.getAllMaterialConditions();
    
    res.json({
      success: true,
      data: conditions
    });
  } catch (error) {
    logger.error('Error fetching all material conditions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch material conditions'
    });
  }
});

/**
 * POST /api/config/material-conditions/:division
 * Create a new material condition for a division
 */
router.post('/material-conditions/:division', async (req, res) => {
  try {
    const { division } = req.params;
    const { condition_code, condition_name, display_name, description } = req.body;
    
    if (!(await isValidDivision(division))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid division. Division must be configured in Company Settings.'
      });
    }

    if (!condition_code || !condition_name || !display_name) {
      return res.status(400).json({
        success: false,
        error: 'condition_code, condition_name, and display_name are required'
      });
    }

    // Check if already exists
    const exists = await MaterialConditionService.exists(division.toLowerCase(), condition_code);
    if (exists) {
      return res.status(409).json({
        success: false,
        error: 'Material condition already exists in this division'
      });
    }

    const newCondition = await MaterialConditionService.createMaterialCondition(division.toLowerCase(), {
      condition_code,
      condition_name,
      display_name,
      description
    });
    
    res.status(201).json({
      success: true,
      message: 'Material condition created successfully',
      data: newCondition
    });
  } catch (error) {
    logger.error('Error creating material condition:', error);
    res.status(500).json({
      success: false,
      error: `Failed to create material condition: ${error.message}`
    });
  }
});

/**
 * PUT /api/config/material-conditions/:division/:conditionCode
 * Update a material condition name
 */
router.put('/material-conditions/:division/:conditionCode', async (req, res) => {
  try {
    const { division, conditionCode } = req.params;
    const { newDisplayName, newConditionCode } = req.body;
    
    if (!(await isValidDivision(division))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid division. Division must be configured in Company Settings.'
      });
    }

    if (!newDisplayName) {
      return res.status(400).json({
        success: false,
        error: 'newDisplayName is required'
      });
    }

    const updated = await MaterialConditionService.updateMaterialCondition(division.toLowerCase(), conditionCode, {
      condition_name: newDisplayName,
      display_name: newDisplayName
    });
    
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Material condition not found'
      });
    }
    
    logger.info(`Material condition updated: ${conditionCode} → ${newDisplayName}`);
    res.json({
      success: true,
      message: `Material condition renamed to "${newDisplayName}"`,
      data: updated
    });
  } catch (error) {
    logger.error('Error updating material condition:', error);
    res.status(500).json({
      success: false,
      error: `Failed to update material condition: ${error.message}`
    });
  }
});

/**
 * DELETE /api/config/material-conditions/:division/:conditionCode
 * Remove a material condition from a division
 */
router.delete('/material-conditions/:division/:conditionCode', async (req, res) => {
  try {
    const { division, conditionCode } = req.params;
    
    if (!(await isValidDivision(division))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid division. Division must be configured in Company Settings.'
      });
    }

    const deleted = await MaterialConditionService.deleteMaterialCondition(division.toLowerCase(), conditionCode);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Material condition not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Material condition removed successfully',
      data: deleted
    });
  } catch (error) {
    logger.error('Error removing material condition:', error);
    res.status(500).json({
      success: false,
      error: `Failed to remove material condition: ${error.message}`
    });
  }
});

// ============================================================================
// MATERIAL COLUMN CONFIGURATION ENDPOINTS
// ============================================================================

/**
 * GET /api/config/material-columns/:division
 * Get all active material columns for a division
 */
router.get('/material-columns/:division', async (req, res) => {
  try {
    const { division } = req.params;
    
    if (!(await isValidDivision(division))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid division. Division must be configured in Company Settings.'
      });
    }

    const columns = await MaterialColumnService.getMaterialColumns(division.toLowerCase());
    
    res.json({
      success: true,
      division: division.toLowerCase(),
      count: columns.length,
      data: columns
    });
  } catch (error) {
    logger.error('Error fetching material columns:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch material columns'
    });
  }
});

/**
 * GET /api/config/material-columns
 * Get all material columns across all divisions
 */
router.get('/material-columns', async (req, res) => {
  try {
    const columns = await MaterialColumnService.getAllMaterialColumnsWithDivision();
    
    res.json({
      success: true,
      count: columns.length,
      data: columns
    });
  } catch (error) {
    logger.error('Error fetching all material columns:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch all material columns'
    });
  }
});

/**
 * POST /api/config/material-columns/:division
 * Create a new material column for a division
 */
router.post('/material-columns/:division', async (req, res) => {
  try {
    const { division } = req.params;
    const { column_code, column_name, display_name, description } = req.body;
    
    if (!(await isValidDivision(division))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid division. Division must be configured in Company Settings.'
      });
    }

    if (!column_code || !column_name) {
      return res.status(400).json({
        success: false,
        error: 'column_code and column_name are required'
      });
    }

    const newColumn = await MaterialColumnService.createMaterialColumn(division.toLowerCase(), {
      column_code,
      column_name,
      display_name: display_name || column_name,
      description
    });
    
    res.status(201).json({
      success: true,
      message: 'Material column added successfully',
      data: newColumn
    });
  } catch (error) {
    logger.error('Error adding material column:', error);
    res.status(500).json({
      success: false,
      error: `Failed to add material column: ${error.message}`
    });
  }
});

/**
 * DELETE /api/config/material-columns/:division/:columnCode
 * Delete a material column for a division
 */
router.delete('/material-columns/:division/:columnCode', async (req, res) => {
  try {
    const { division, columnCode } = req.params;
    
    if (!(await isValidDivision(division))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid division. Division must be configured in Company Settings.'
      });
    }

    const deleted = await MaterialColumnService.deleteMaterialColumn(division.toLowerCase(), columnCode);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Material column not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Material column removed successfully',
      data: deleted
    });
  } catch (error) {
    logger.error('Error removing material column:', error);
    res.status(500).json({
      success: false,
      error: `Failed to remove material column: ${error.message}`
    });
  }
});

module.exports = router;
