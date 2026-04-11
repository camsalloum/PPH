/**
 * AEBF Shared Helpers
 * Common utility functions used across all AEBF route modules
 */

const { getDivisionPool } = require('../../utils/divisionDatabaseManager');
const logger = require('../../utils/logger');

/**
 * Helper function to extract division code from full division name
 * e.g., "FP-UAE" -> "fp", "PP-KSA" -> "pp"
 */
const SUPPORTED_DIVISIONS = new Set(['fp']);

function extractDivisionCode(division) {
  if (!division) return 'fp'; // Default to FP for backward compatibility
  const code = String(division).trim().split('-')[0].toLowerCase().replace(/[^a-z]/g, '');
  if (!code || !SUPPORTED_DIVISIONS.has(code)) return 'fp';
  return code;
}

/**
 * Helper function to get the correct database pool for a division
 * Uses division-specific database (e.g., fp_database, pp_database)
 */
function getPoolForDivision(division) {
  const divisionCode = extractDivisionCode(division);
  return getDivisionPool(divisionCode.toUpperCase());
}

/**
 * Helper function to get table names for a division
 * Main tables: fp_actualcommon (all actual sales), fp_budget_unified (all budget/forecast)
 * Support tables: per-division material_percentages, etc.
 */
function getTableNames(division) {
  const code = extractDivisionCode(division);
  return {
    // Main data tables (shared - use admin_division_code filter)
    actualcommon: 'fp_actualcommon',
    budgetUnified: 'fp_budget_unified',
    // Support tables (per-division prefix)
    materialPercentages: `${code}_material_percentages`,
    rawProductGroups: `${code}_raw_product_groups`,
    budgetUnifiedDraft: `${code}_budget_unified_draft`,
    pricingRounding: `${code}_product_group_pricing_rounding`,
    customerMergeRules: `${code}_customer_merge_rules`,
    mergeRuleSuggestions: `${code}_merge_rule_suggestions`,
    mergeRuleNotifications: `${code}_merge_rule_notifications`,
    mergeRuleRejections: `${code}_merge_rule_rejections`,
    databaseUploadLog: `${code}_database_upload_log`,
    customerSimilarityCache: `${code}_customer_similarity_cache`,
    budgetBulkImport: `${code}_budget_bulk_import`,
    // Legacy tables (deprecated - kept for backward compatibility)
    dataExcel: `${code}_data_excel`,       // DEPRECATED: use actualcommon
    divisionalBudget: `${code}_divisional_budget`,  // DEPRECATED: use budgetUnified
    salesRepBudget: `${code}_sales_rep_budget`      // DEPRECATED: use budgetUnified
  };
}

/**
 * Validate division parameter (async version for dynamic validation)
 * @returns {Promise<boolean>} True if valid, false if invalid (response already sent)
 */
async function validateDivision(division, res) {
  if (!division) {
    res.status(400).json({
      success: false,
      error: 'Division parameter is required'
    });
    return false;
  }
  
  // Get valid divisions from database
  const { getValidDivisions } = require('./shared');
  const validDivisions = await getValidDivisions();
  
  if (!validDivisions.includes(division.toUpperCase())) {
    res.status(400).json({
      success: false,
      error: `Invalid division. Must be one of: ${validDivisions.join(', ')}`
    });
    return false;
  }
  
  return true;
}

module.exports = {
  extractDivisionCode,
  getPoolForDivision,
  getTableNames,
  validateDivision
};
