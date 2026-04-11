/**
 * AEBF Shared Utilities
 * Common functions and helpers used across AEBF routes
 */

const { getDivisionPool, pool: mainPool } = require('../../utils/divisionDatabaseManager');
const { Pool } = require('pg');

// Only FP is supported; other division codes fall back to FP
const SUPPORTED_DIVISIONS = new Set(['fp']);

// Cache for valid divisions (refreshed on demand)
let cachedDivisions = null;
let cachedDivisionNames = {}; // Cache for division names { 'FP': 'Flexible Packaging Division', ... }
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute cache

// Fallback division names when database lookup fails
const DIVISION_NAME_FALLBACKS = {
  'FP': 'Flexible Packaging Division',
  'BF': 'Blow Films Division',
  'IP': 'Industrial Packaging Division',
  'CP': 'Consumer Products Division'
};

// Platform pool for reading company_divisions (lazy initialized)
let platformPool = null;

function getPlatformPool() {
  if (!platformPool) {
    platformPool = new Pool({
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      password: process.env.DB_PASSWORD || '',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.PLATFORM_DB_NAME || 'propackhub_platform',
      max: 5,
      idleTimeoutMillis: 30000
    });
  }
  return platformPool;
}

/**
 * Get division name from division code (dynamically from Company Info settings)
 * Reads from propackhub_platform.company_divisions table
 * @param {string} divisionCode - Division code (e.g., 'FP')
 * @returns {Promise<string>} Division name (e.g., 'Flexible Packaging Division')
 */
async function getDivisionName(divisionCode) {
  const code = (divisionCode || 'FP').toUpperCase();
  const now = Date.now();
  
  // Return cached value if still valid
  if (cachedDivisionNames[code] && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedDivisionNames[code];
  }

  try {
    // Try reading from platform database company_divisions table
    const pool = getPlatformPool();
    const result = await pool.query(`
      SELECT division_code, division_name 
      FROM company_divisions 
      WHERE is_active = true
    `);
    
    if (result.rows.length > 0) {
      // Update cache for all divisions
      result.rows.forEach(row => {
        if (row.division_code && row.division_name) {
          cachedDivisionNames[row.division_code.toUpperCase()] = row.division_name;
        }
      });
      cacheTimestamp = now;
      
      if (cachedDivisionNames[code]) {
        console.log(`[getDivisionName] Found '${code}' = '${cachedDivisionNames[code]}' from company_divisions`);
        return cachedDivisionNames[code];
      }
    }
  } catch (error) {
    console.error('[getDivisionName] Error fetching from company_divisions:', error.message);
  }

  // Fallback: Try old company_settings approach
  try {
    const result = await mainPool.query(`
      SELECT setting_value FROM company_settings WHERE setting_key = 'divisions'
    `);
    
    if (result.rows.length > 0 && result.rows[0].setting_value) {
      const divisions = result.rows[0].setting_value;
      if (Array.isArray(divisions)) {
        divisions.forEach(d => {
          if (d.code && d.name) {
            cachedDivisionNames[d.code.toUpperCase()] = d.name;
          }
        });
        cacheTimestamp = now;
        
        if (cachedDivisionNames[code]) {
          return cachedDivisionNames[code];
        }
      }
    }
  } catch (error) {
    // Silently ignore - table may not exist
  }
  
  // Final fallback to known division names
  console.log(`[getDivisionName] Using fallback for '${code}'`);
  return DIVISION_NAME_FALLBACKS[code] || code;
}

/**
 * Get valid divisions from company_settings (with caching)
 * @returns {Promise<string[]>} Array of valid division codes
 */
async function getValidDivisions() {
  const now = Date.now();
  
  // Return cached value if still valid
  if (cachedDivisions && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedDivisions;
  }

  try {
    const result = await mainPool.query(`
      SELECT setting_value FROM company_settings WHERE setting_key = 'divisions'
    `);
    
    if (result.rows.length > 0 && result.rows[0].setting_value) {
      const divisions = result.rows[0].setting_value;
      if (Array.isArray(divisions)) {
        cachedDivisions = divisions
          .map(d => String(d.code || '').toUpperCase())
          .filter(code => code && SUPPORTED_DIVISIONS.has(code.toLowerCase()));
        if (cachedDivisions.length === 0) {
          cachedDivisions = ['FP'];
        }
        cacheTimestamp = now;
        return cachedDivisions;
      }
    }
  } catch (error) {
    console.error('Error fetching divisions:', error.message);
  }
  
  // Fallback to FP only if query fails
  return ['FP'];
}

/**
 * Synchronously get cached divisions (for initialization)
 * @returns {string[]} Array of valid division codes (may be stale)
 */
function getValidDivisionsSync() {
  return cachedDivisions || ['FP'];
}

/**
 * Check if a division code is valid
 * @param {string} divisionCode - Division code to check
 * @returns {Promise<boolean>} True if valid
 */
async function isValidDivision(divisionCode) {
  const validDivisions = await getValidDivisions();
  return validDivisions.includes(divisionCode.toUpperCase());
}

/**
 * Extract division code from full division name
 * @param {string} division - Full division name (e.g., "FP-UAE")
 * @returns {string} Division code (e.g., "fp")
 */
function extractDivisionCode(division) {
  if (!division) return 'fp';
  const code = String(division).trim().split('-')[0].toLowerCase().replace(/[^a-z]/g, '');
  if (!code || !SUPPORTED_DIVISIONS.has(code)) return 'fp';
  return code;
}

/**
 * Get the correct database pool for a division
 * @param {string} division - Division name
 * @returns {Pool} PostgreSQL pool
 */
function getPoolForDivision(division) {
  const divisionCode = extractDivisionCode(division);
  return getDivisionPool(divisionCode.toUpperCase());
}

/**
 * Get table names for a division
 * @param {string} division - Division name
 * @returns {Object} Table names object
 */
function getTableNames(division) {
  const code = extractDivisionCode(division);
  return {
    // DEPRECATED: dataExcel removed - use actualcommon instead
    actualcommon: `${code}_actualcommon`,
    budgetUnified: `${code}_budget_unified`,
    materialPercentages: `${code}_material_percentages`,
    rawProductGroups: `${code}_raw_product_groups`,
    itemGroupOverrides: `${code}_item_group_overrides`,
    productGroupExclusions: `${code}_product_group_exclusions`,
    productGroupProjections: `${code}_product_group_projections`,  // Unified: ESTIMATE + FORECAST
    divisionalBudget: `${code}_divisional_budget`,
    salesRepBudget: `${code}_sales_rep_budget`,
    budgetUnifiedDraft: `${code}_budget_unified_draft`,
    pricingRounding: `${code}_product_group_pricing_rounding`,
    customerMergeRules: `${code}_customer_merge_rules`,
    mergeRuleSuggestions: `${code}_merge_rule_suggestions`,
    mergeRuleNotifications: `${code}_merge_rule_notifications`,
    mergeRuleRejections: `${code}_merge_rule_rejections`,
    databaseUploadLog: `${code}_database_upload_log`,
    customerSimilarityCache: `${code}_customer_similarity_cache`,
    budgetBulkImport: `${code}_budget_bulk_import`,
    plData: `${code}_pl_data`,  // P&L data table for Budget/Forecast P&L
    prospects: `${code}_prospects`,  // Prospects table for new customers from budget imports
    divisionMergeRules: `${code}_division_customer_merge_rules`  // Division merge rules
  };
}

/**
 * Build WHERE clause for query filters
 * @param {Object} filters - Filter parameters
 * @returns {Object} { whereClause, params }
 */
function buildWhereClause(filters) {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (filters.division) {
    conditions.push(`division = $${paramIndex++}`);
    params.push(filters.division);
  }

  if (filters.year) {
    conditions.push(`year = $${paramIndex++}`);
    params.push(filters.year);
  }

  if (filters.month) {
    conditions.push(`month = $${paramIndex++}`);
    params.push(filters.month);
  }

  if (filters.values_type) {
    conditions.push(`values_type = $${paramIndex++}`);
    params.push(filters.values_type);
  }

  if (filters.salesrepname) {
    conditions.push(`salesrepname = $${paramIndex++}`);
    params.push(filters.salesrepname);
  }

  if (filters.customername) {
    conditions.push(`customername ILIKE $${paramIndex++}`);
    params.push(`%${filters.customername}%`);
  }

  if (filters.countryname) {
    conditions.push(`countryname = $${paramIndex++}`);
    params.push(filters.countryname);
  }

  if (filters.productgroup) {
    conditions.push(`productgroup = $${paramIndex++}`);
    params.push(filters.productgroup);
  }

  if (filters.search) {
    conditions.push(`(
      customername ILIKE $${paramIndex} OR 
      countryname ILIKE $${paramIndex} OR 
      productgroup ILIKE $${paramIndex}
    )`);
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  return { whereClause, params, nextParamIndex: paramIndex };
}

/**
 * Validate pagination parameters
 * @param {number} page - Page number
 * @param {number} pageSize - Page size
 * @returns {Object} Validated pagination params
 */
function validatePagination(page, pageSize) {
  const validPage = Math.max(1, parseInt(page) || 1);
  const validPageSize = Math.min(1000, Math.max(1, parseInt(pageSize) || 100));
  const offset = (validPage - 1) * validPageSize;
  
  return { page: validPage, pageSize: validPageSize, offset };
}

/**
 * Calculate pagination metadata
 * @param {number} total - Total records
 * @param {number} page - Current page
 * @param {number} pageSize - Page size
 * @returns {Object} Pagination metadata
 */
function calculatePagination(total, page, pageSize) {
  return {
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    hasNextPage: page < Math.ceil(total / pageSize),
    hasPreviousPage: page > 1
  };
}

module.exports = {
  getDivisionName,
  getValidDivisions,
  getValidDivisionsSync,
  isValidDivision,
  extractDivisionCode,
  getPoolForDivision,
  getTableNames,
  buildWhereClause,
  validatePagination,
  calculatePagination
};
