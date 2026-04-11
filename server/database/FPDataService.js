const { pool, authPool } = require('./config');
const logger = require('../utils/logger');
const unifiedProductGroupService = require('../services/UnifiedProductGroupService');
const salesRepGroupsService = require('../services/salesRepGroupsService');

// Budget structure cutoff year - starting from this year, budget data is stored in separate tables
const BUDGET_CUTOFF_YEAR = 2025;

// Use fp_actualcommon as the unified source - following 'avoid views' architecture
const UNIFIED_TABLE = 'fp_actualcommon';
const DIVISION_CODE = 'FP';

const VALUE_COLUMN_MAP = {
  KGS: 'qty_kgs',
  AMOUNT: 'amount',
  MORM: 'morm',
  SALES: 'amount'
};

function resolveValueColumn(valueType) {
  if (!valueType) return 'amount';
  const key = String(valueType).trim().toUpperCase();
  return VALUE_COLUMN_MAP[key] || 'amount';
}

function normalizeDataType(dataType) {
  return String(dataType || 'Actual').trim().toUpperCase();
}

function resolveBudgetType(normalizedDataType) {
  if (normalizedDataType.includes('FORECAST')) return 'FORECAST';
  if (normalizedDataType.includes('ESTIMATE')) return 'ESTIMATE';
  if (normalizedDataType === 'BUDGET') return 'SALES_REP';
  return null;
}

async function resolveGroupName(salesRepName, groupMembers = null) {
  if (groupMembers && Array.isArray(groupMembers) && groupMembers.length > 0) {
    const groupName = await findGroupForSalesRep(groupMembers[0]);
    if (groupName) return groupName;
  }
  const groupName = await findGroupForSalesRep(salesRepName);
  return groupName || null;
}

// Cache for excluded product groups
let excludedPGCache = null;
let excludedPGCacheTime = 0;
const EXCLUSION_CACHE_TTL = 60000; // 1 minute

/**
 * Get excluded product groups from fp_product_group_exclusions
 * @returns {Promise<string[]>} Array of excluded product group names (lowercase)
 */
async function getExcludedProductGroups() {
  const now = Date.now();
  if (excludedPGCache && (now - excludedPGCacheTime) < EXCLUSION_CACHE_TTL) {
    return excludedPGCache;
  }
  try {
    const result = await pool.query(
      `SELECT LOWER(TRIM(product_group)) as pg FROM fp_product_group_exclusions WHERE UPPER(division_code) = 'FP'`
    );
    excludedPGCache = result.rows.map(r => r.pg);
    excludedPGCacheTime = now;
    return excludedPGCache;
  } catch (error) {
    logger.warn('Could not fetch product group exclusions:', error.message);
    return [];
  }
}

/**
 * Find the group name for a sales rep (for budget lookup)
 * @param {string} salesRepName - Individual sales rep name
 * @returns {Promise<string|null>} Group name if found, null otherwise
 */
async function findGroupForSalesRep(salesRepName) {
  try {
    const groups = await salesRepGroupsService.getGroupsForDivision('FP');
    const normalizedRep = String(salesRepName).trim().toUpperCase();
    
    for (const [groupName, members] of Object.entries(groups)) {
      const normalizedMembers = members.map(m => String(m).trim().toUpperCase());
      if (normalizedMembers.includes(normalizedRep)) {
        return groupName; // Return the group name as stored (mixed case)
      }
    }
    return null;
  } catch (error) {
    logger.warn('Could not find group for sales rep:', error.message);
    return null;
  }
}

class FPDataService {
  constructor() {
    this.pool = pool;
    this.authPool = authPool;
    this.unifiedService = unifiedProductGroupService;
    this.rawProductGroupsCacheTTL = 5 * 60 * 1000;
    this.rawProductGroupsCache = {
      distinct: new Map(),
      mappings: new Map(),
      overrides: null,
      overridesAt: 0
    };
  }

  _getRawProductGroupsCache(map, key) {
    const now = Date.now();
    const cached = map.get(key);
    if (!cached) return null;
    if (now - cached.timestamp > this.rawProductGroupsCacheTTL) {
      map.delete(key);
      return null;
    }
    return cached.data;
  }

  _setRawProductGroupsCache(map, key, data) {
    map.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  invalidateRawProductGroupsCache(division = 'FP') {
    const key = String(division || 'FP').toUpperCase();
    this.rawProductGroupsCache.distinct.delete(key);
    this.rawProductGroupsCache.mappings.delete(key);
    this.rawProductGroupsCache.overrides = null;
    this.rawProductGroupsCache.overridesAt = 0;
  }

  // Existing methods (keeping for compatibility)
  async getProductGroups() {
    try {
      const query = `
        SELECT DISTINCT INITCAP(LOWER(a.pgcombine)) as productgroup
        FROM fp_actualcommon a
        LEFT JOIN fp_product_group_exclusions e
          ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
          AND UPPER(TRIM(e.division_code)) = 'FP'
        WHERE UPPER(TRIM(a.admin_division_code)) = 'FP'
          AND a.pgcombine IS NOT NULL
          AND LOWER(a.pgcombine) != 'not in pg'
          AND e.product_group IS NULL
        ORDER BY productgroup
      `;
      const result = await this.pool.query(query);
      return result.rows.map(row => row.productgroup);
    } catch (error) {
      logger.error('Error fetching product groups:', error);
      throw error;
    }
  }

  async getProductGroupsBySalesRep(salesRep) {
    try {
      const query = `
        SELECT DISTINCT INITCAP(LOWER(a.pgcombine)) as productgroup
        FROM fp_actualcommon a
        LEFT JOIN fp_product_group_exclusions e
          ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
          AND UPPER(TRIM(e.division_code)) = 'FP'
        WHERE UPPER(TRIM(a.admin_division_code)) = 'FP'
          AND TRIM(UPPER(a.sales_rep_name)) = TRIM(UPPER($1))
          AND a.pgcombine IS NOT NULL
          AND LOWER(a.pgcombine) != 'not in pg'
          AND e.product_group IS NULL
        ORDER BY productgroup
      `;
      const result = await this.pool.query(query, [salesRep]);
      return result.rows.map(row => row.productgroup);
    } catch (error) {
      logger.error('Error fetching product groups by sales rep:', error);
      throw error;
    }
  }

  async getSalesData(salesRep, productGroup, valueType, year, month) {
    try {
      // Check if product group is excluded
      const excludedPGs = await getExcludedProductGroups();
      if (excludedPGs.includes(String(productGroup).toLowerCase().trim())) {
        return 0;
      }

      const normalizedType = normalizeDataType(valueType);
      const isDataType = ['ACTUAL', 'ESTIMATE', 'BUDGET', 'FORECAST', 'FY ESTIMATE'].includes(normalizedType);
      const dataType = isDataType ? normalizedType : 'ACTUAL';
      const valueColumn = resolveValueColumn(isDataType ? 'AMOUNT' : valueType);

      const query = `
        SELECT COALESCE(SUM(${valueColumn}), 0) as total_value
        FROM ${UNIFIED_TABLE}
        WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
          AND TRIM(UPPER(sales_rep_name)) = TRIM(UPPER($2))
          AND UPPER(TRIM(pgcombine)) = UPPER(TRIM($3))
          AND year = $4
          AND month_no = $5
      `;

      const result = await this.pool.query(query, [DIVISION_CODE, salesRep, productGroup, year, month]);
      return parseFloat(result.rows[0]?.total_value || 0);
    } catch (error) {
      logger.error('Error fetching sales data:', error);
      throw error;
    }
  }

  /**
   * Get sales data by value type for a specific sales rep, product group, and period
   * For Budget type with year >= BUDGET_CUTOFF_YEAR, queries fp_sales_rep_budget table
   * For Actual/Estimate, uses unified view with pg_combine for proper product group resolution
   */
  async getSalesDataByValueType(salesRep, productGroup, valueType, year, month, dataType = 'Actual') {
    try {
      // Check if product group is excluded (applies to actual data)
      const excludedPGs = await getExcludedProductGroups();
      if (excludedPGs.includes(String(productGroup).toLowerCase().trim())) {
        return 0;
      }

      const normalizedDataType = normalizeDataType(dataType);
      const valueColumn = resolveValueColumn(valueType);
      const isBudgetType = normalizedDataType === 'BUDGET';
      const isEstimateType = normalizedDataType.includes('ESTIMATE') || normalizedDataType.includes('FORECAST');

      if (isBudgetType) {
        return await this._getSalesRepBudgetData(salesRep, productGroup, valueColumn, year, month, 'SALES_REP');
      }

      const resolvedGroupName = await resolveGroupName(salesRep);
      const actualQuery = `
        SELECT COALESCE(SUM(${valueColumn}), 0) as total_value
        FROM ${UNIFIED_TABLE}
        WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
          AND TRIM(UPPER(${resolvedGroupName ? 'sales_rep_group_name' : 'sales_rep_name'})) = TRIM(UPPER($2))
          AND UPPER(TRIM(pgcombine)) = UPPER(TRIM($3))
          AND year = $4
          AND month_no = $5
      `;

      const actualResult = await this.pool.query(actualQuery, [DIVISION_CODE, resolvedGroupName || salesRep, productGroup, year, month]);
      let total = parseFloat(actualResult.rows[0]?.total_value || 0);

      if (isEstimateType) {
        const estimateType = normalizedDataType.includes('FORECAST') ? 'FORECAST' : 'ESTIMATE';
        const estimateResult = await this.pool.query(
          `
            SELECT COALESCE(SUM(${valueColumn}), 0) as total_value
            FROM fp_budget_unified
            WHERE UPPER(TRIM(division_code)) = UPPER($1)
              AND budget_year = $2
              AND month_no = $3
              AND TRIM(UPPER(sales_rep_group_name)) = TRIM(UPPER($4))
              AND UPPER(TRIM(pgcombine)) = UPPER(TRIM($5))
              AND UPPER(budget_type) = $6
          `,
          [DIVISION_CODE, year, month, salesRep, productGroup, estimateType]
        );
        total += parseFloat(estimateResult.rows[0]?.total_value || 0);
      }

      return total;
    } catch (error) {
      logger.error('Error fetching sales data by value type:', error);
      throw error;
    }
  }

  /**
   * Get budget data from fp_budget_unified table
   * Uses GROUP name for budget lookup (budget stored with group names, not individual rep names)
   * @private
   */
  async _getSalesRepBudgetData(salesRep, productGroup, valueColumn, year, month, budgetType = 'SALES_REP') {
    try {
      // First try to find budget with the given name directly (may be a group name)
      let budgetName = salesRep;
      
      // Try to find if this is an individual rep that belongs to a group
      const groupName = await findGroupForSalesRep(salesRep);
      if (groupName) {
        logger.debug(`Found group "${groupName}" for sales rep "${salesRep}"`);
        budgetName = groupName;
      }
      
      // Query using the resolved budget name (group name if found, otherwise sales rep name)
      // Budget data is stored with sales_rep_group_name column
      // For FY (month = 13), sum all months (1-12) since budget data is stored monthly
      const isFY = month === 13 || month === '13' || month === 'FY';
      const monthCondition = isFY 
        ? 'month_no BETWEEN 1 AND 12'  // Sum all months for FY
        : 'month_no = $3';             // Specific month
      
      const query = `
        SELECT COALESCE(SUM(${valueColumn}), 0) as total_value
        FROM fp_budget_unified
        WHERE UPPER(TRIM(division_code)) = UPPER($1)
          AND budget_year = $2
          AND ${monthCondition}
          AND TRIM(UPPER(sales_rep_group_name)) = TRIM(UPPER(${isFY ? '$3' : '$4'}))
          AND UPPER(TRIM(pgcombine)) = UPPER(TRIM(${isFY ? '$4' : '$5'}))
          AND UPPER(budget_type) = ${isFY ? '$5' : '$6'}
          AND (CASE WHEN UPPER(${isFY ? '$5' : '$6'}) IN ('DIVISIONAL','SALES_REP') THEN is_budget = true ELSE true END)
      `;

      const params = isFY 
        ? [DIVISION_CODE, year, budgetName, productGroup, budgetType]
        : [DIVISION_CODE, year, month, budgetName, productGroup, budgetType];
      
      const result = await this.pool.query(query, params);
      const value = parseFloat(result.rows[0]?.total_value || 0);
      
      // Return 0 if no budget exists (do NOT fall back to divisional)
      return value;
    } catch (error) {
      logger.error('Error fetching sales rep budget data:', error);
      return 0; // Return 0 instead of throwing to avoid breaking the dashboard
    }
  }

  /**
   * Get sales data for a group of sales reps
   * For Budget type with year >= BUDGET_CUTOFF_YEAR, queries fp_sales_rep_budget table
   * Uses unified view with pg_combine for proper product group resolution
   */
  async getSalesDataForGroup(groupMembers, productGroup, valueType, year, month, dataType = 'Actual') {
    try {
      // Check if product group is excluded (applies to actual data)
      const excludedPGs = await getExcludedProductGroups();
      if (excludedPGs.includes(String(productGroup).toLowerCase().trim())) {
        return 0;
      }

      const normalizedDataType = normalizeDataType(dataType);
      const valueColumn = resolveValueColumn(valueType);
      const isBudgetType = normalizedDataType === 'BUDGET';
      const isEstimateType = normalizedDataType.includes('ESTIMATE') || normalizedDataType.includes('FORECAST');

      if (isBudgetType) {
        return await this._getSalesRepBudgetDataForGroup(groupMembers, productGroup, valueColumn, year, month, 'SALES_REP');
      }

      const resolvedGroupName = await resolveGroupName(groupMembers?.[0], groupMembers);
      const query = `
        SELECT COALESCE(SUM(${valueColumn}), 0) as total_value
        FROM ${UNIFIED_TABLE}
        WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
          AND TRIM(UPPER(sales_rep_group_name)) = TRIM(UPPER($2))
          AND UPPER(TRIM(pgcombine)) = UPPER(TRIM($3))
          AND year = $4
          AND month_no = $5
      `;

      const params = [
        DIVISION_CODE,
        resolvedGroupName || groupMembers?.[0],
        productGroup,
        year,
        month
      ];

      const result = await this.pool.query(query, params);
      let total = parseFloat(result.rows[0]?.total_value || 0);

      if (isEstimateType) {
        const estimateType = normalizedDataType.includes('FORECAST') ? 'FORECAST' : 'ESTIMATE';
        const budgetResult = await this._getSalesRepBudgetDataForGroup(groupMembers, productGroup, valueColumn, year, month, estimateType);
        total += budgetResult;
      }

      return total;
    } catch (error) {
      logger.error('Error fetching sales data for group:', error);
      throw error;
    }
  }

  /**
   * Get budget data from fp_budget_unified table for a group of sales reps
   * Budget is stored with the GROUP name, so we need to find which group these members belong to
   * @private
   */
  async _getSalesRepBudgetDataForGroup(groupMembers, productGroup, valueColumn, year, month, budgetType = 'SALES_REP') {
    try {
      // For FY (month = 13), sum all months (1-12) since budget data is stored monthly
      const isFY = month === 13 || month === '13' || month === 'FY';
      
      // Budget is stored with GROUP name, not individual member names
      // Try to find the group name from the first member
      let budgetName = null;
      if (groupMembers && groupMembers.length > 0) {
        const groupName = await findGroupForSalesRep(groupMembers[0]);
        if (groupName) {
          budgetName = groupName;
          logger.debug(`Found group "${groupName}" for member "${groupMembers[0]}", using for budget lookup`);
        }
      }
      
      if (!budgetName) {
        // Fall back to searching by member names using sales_rep_group_name
        // Budget data has sales_rep_group_name populated, not sales_rep_name
        const placeholders = groupMembers.map((_, index) => `$${index + 2}`).join(', ');
        const monthCondition = isFY 
          ? 'month_no BETWEEN 1 AND 12'
          : `month_no = $${groupMembers.length + 4}`;
        
        const query = `
          SELECT COALESCE(SUM(${valueColumn}), 0) as total_value
          FROM fp_budget_unified
          WHERE UPPER(TRIM(division_code)) = UPPER($1)
            AND TRIM(UPPER(sales_rep_group_name)) IN (${placeholders})
            AND UPPER(TRIM(pgcombine)) = UPPER(TRIM($${groupMembers.length + 2}))
            AND budget_year = $${groupMembers.length + 3}
            AND ${monthCondition}
            AND UPPER(budget_type) = $${isFY ? groupMembers.length + 4 : groupMembers.length + 5}
            AND (CASE WHEN UPPER($${isFY ? groupMembers.length + 4 : groupMembers.length + 5}) IN ('DIVISIONAL','SALES_REP') THEN is_budget = true ELSE true END)
        `;

        const params = isFY
          ? [
              DIVISION_CODE,
              ...groupMembers.map(n => String(n).trim().toUpperCase()),
              productGroup,
              year,
              budgetType
            ]
          : [
              DIVISION_CODE,
              ...groupMembers.map(n => String(n).trim().toUpperCase()),
              productGroup,
              year,
              month,
              budgetType
            ];

        const result = await this.pool.query(query, params);
        const value = parseFloat(result.rows[0]?.total_value || 0);
        return value;
      }
      
      // Query by group name (sales_rep_group_name)
      const monthCondition = isFY 
        ? 'month_no BETWEEN 1 AND 12'
        : 'month_no = $5';
      
      const query = `
        SELECT COALESCE(SUM(${valueColumn}), 0) as total_value
        FROM fp_budget_unified
        WHERE UPPER(TRIM(division_code)) = UPPER($1)
          AND TRIM(UPPER(sales_rep_group_name)) = TRIM(UPPER($2))
          AND UPPER(TRIM(pgcombine)) = UPPER(TRIM($3))
          AND budget_year = $4
          AND ${monthCondition}
          AND UPPER(budget_type) = ${isFY ? '$5' : '$6'}
          AND (CASE WHEN UPPER(${isFY ? '$5' : '$6'}) IN ('DIVISIONAL','SALES_REP') THEN is_budget = true ELSE true END)
      `;

      const params = isFY
        ? [DIVISION_CODE, budgetName, productGroup, year, budgetType]
        : [DIVISION_CODE, budgetName, productGroup, year, month, budgetType];
      
      const result = await this.pool.query(query, params);
      const value = parseFloat(result.rows[0]?.total_value || 0);
      return value;
    } catch (error) {
      logger.error('Error fetching sales rep budget data for group:', error);
      return 0;
    }
  }

  /**
   * Get divisional budget data by product group with pre-resolved value column
   * @private
   */
  async _getDivisionalBudgetByValueColumn(productGroup, valueColumn, year, month) {
    try {
      const query = `
        SELECT COALESCE(SUM(b.${valueColumn}), 0) as total_value
        FROM fp_budget_unified b
        LEFT JOIN fp_product_group_exclusions e
          ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
          AND UPPER(TRIM(e.division_code)) = 'FP'
        WHERE UPPER(TRIM(b.division_code)) = UPPER($1)
          AND b.budget_year = $2
          AND b.month_no = $3
          AND UPPER(TRIM(b.pgcombine)) = UPPER(TRIM($4))
          AND UPPER(b.budget_type) = 'DIVISIONAL'
          AND b.is_budget = true
          AND e.product_group IS NULL
      `;

      const result = await this.pool.query(query, [DIVISION_CODE, year, month, productGroup]);
      return parseFloat(result.rows[0]?.total_value || 0);
    } catch (error) {
      logger.error('Error fetching divisional budget data by value column:', error);
      return 0;
    }
  }

  /**
   * Get divisional budget data by product group (for year >= BUDGET_CUTOFF_YEAR)
   * Used when no sales rep filter is applied (divisional dashboard)
   * @param {string} productGroup - Product group name
   * @param {string} valueType - KGS, Amount, or MoRM
   * @param {number} year - Budget year
   * @param {number} month - Month (1-12)
   * @returns {number} Total budget value
   */
  async getDivisionalBudgetData(productGroup, valueType, year, month) {
    try {
      const valueColumn = resolveValueColumn(valueType);
      const query = `
        SELECT COALESCE(SUM(b.${valueColumn}), 0) as total_value
        FROM fp_budget_unified b
        LEFT JOIN fp_product_group_exclusions e
          ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
          AND UPPER(TRIM(e.division_code)) = 'FP'
        WHERE UPPER(TRIM(b.division_code)) = UPPER($1)
          AND b.budget_year = $2
          AND b.month_no = $3
          AND UPPER(TRIM(b.pgcombine)) = UPPER(TRIM($4))
          AND UPPER(b.budget_type) = 'DIVISIONAL'
          AND b.is_budget = true
          AND e.product_group IS NULL
      `;

      const result = await this.pool.query(query, [DIVISION_CODE, year, month, productGroup]);
      return parseFloat(result.rows[0]?.total_value || 0);
    } catch (error) {
      logger.error('Error fetching divisional budget data:', error);
      return 0;
    }
  }

  /**
   * Get budget data by product group with automatic year-based routing
   * For year < BUDGET_CUTOFF_YEAR: aggregates from fp_data_excel
   * For year >= BUDGET_CUTOFF_YEAR: uses fp_divisional_budget
   * @param {string} productGroup - Product group name
   * @param {string} valueType - KGS, Amount, or MoRM
   * @param {number} year - Budget year
   * @param {number} month - Month (1-12)
   * @returns {number} Total budget value
   */
  async getBudgetByProductGroup(productGroup, valueType, year, month) {
    try {
      return await this.getDivisionalBudgetData(productGroup, valueType, year, month);
    } catch (error) {
      logger.error('Error fetching budget by product group:', error);
      return 0;
    }
  }

  /**
   * Get all product groups from divisional budget for a specific year
   * @param {number} year - Budget year
   * @returns {string[]} Array of product group names
   */
  async getProductGroupsFromDivisionalBudget(year) {
    try {
      const query = `
        SELECT DISTINCT INITCAP(LOWER(product_group)) as productgroup 
        FROM fp_divisional_budget 
        WHERE year = $1 AND product_group IS NOT NULL AND product_group != ''
        ORDER BY productgroup
      `;
      
      const result = await this.pool.query(query, [year]);
      return result.rows.map(row => row.productgroup);
    } catch (error) {
      logger.error('Error fetching product groups from divisional budget:', error);
      return [];
    }
  }

  /**
   * Get aggregated actual data across all sales reps for a product group
   * Used for division-level dashboard view
   * Uses unified view with pg_combine for proper product group resolution
   * @param {string} productGroup - Product group name
   * @param {string} valueType - KGS, Amount, or MoRM
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {number} Total value aggregated across all sales reps
   */
  async getAggregatedActualData(productGroup, valueType, year, month) {
    try {
      // Check if product group is excluded
      const excludedPGs = await getExcludedProductGroups();
      if (excludedPGs.includes(String(productGroup).toLowerCase().trim())) {
        return 0;
      }

      const valueColumn = resolveValueColumn(valueType);
      const query = `
        SELECT COALESCE(SUM(${valueColumn}), 0) as total_value
        FROM ${UNIFIED_TABLE}
        WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
          AND UPPER(TRIM(pgcombine)) = UPPER(TRIM($2))
          AND year = $3
          AND month_no = $4
      `;

      const result = await this.pool.query(query, [DIVISION_CODE, productGroup, year, month]);
      return parseFloat(result.rows[0]?.total_value || 0);
    } catch (error) {
      logger.error('Error fetching aggregated actual data:', error);
      return 0;
    }
  }

  /**
   * Get customers by sales rep
   * UNION: Includes customers from both actual data AND budget-only customers
   */
  async getCustomersBySalesRep(salesRep) {
    try {
      // Check if this rep belongs to a group (for budget lookup)
      let budgetName = salesRep;
      const groupName = await findGroupForSalesRep(salesRep);
      if (groupName) {
        budgetName = groupName;
      }
      
      const result = await this.pool.query(
        `SELECT DISTINCT customername FROM (
           SELECT customer_name_unified as customername
           FROM ${UNIFIED_TABLE}
           WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
             AND TRIM(UPPER(sales_rep_name)) = TRIM(UPPER($2))
             AND customer_name_unified IS NOT NULL
             AND TRIM(customer_name_unified) != ''
           UNION
           SELECT DISTINCT customer_name as customername
           FROM fp_budget_unified
           WHERE UPPER(TRIM(division_code)) = UPPER($1)
             AND TRIM(UPPER(sales_rep_group_name)) = TRIM(UPPER($3))
             AND UPPER(budget_type) = 'SALES_REP'
             AND customer_name IS NOT NULL
             AND TRIM(customer_name) != ''
         ) all_customers
         ORDER BY customername`,
        [DIVISION_CODE, salesRep, budgetName]
      );
      return result.rows.map(row => row.customername);
    } catch (error) {
      logger.error('Error fetching customers by sales rep:', error);
      throw error;
    }
  }

  /**
   * Get customers for a group of sales reps
   * UNION: Includes customers from both actual data AND budget-only customers
   */
  async getCustomersForGroup(groupMembers) {
    try {
      // Get group name for budget lookup
      let budgetName = null;
      if (groupMembers && groupMembers.length > 0) {
        const groupName = await findGroupForSalesRep(groupMembers[0]);
        if (groupName) {
          budgetName = groupName;
        }
      }
      
      const placeholders = groupMembers.map((_, index) => `$${index + 2}`).join(', ');
      const query = `
        SELECT DISTINCT customername FROM (
          SELECT customer_name_unified as customername
          FROM ${UNIFIED_TABLE}
          WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
            AND TRIM(UPPER(sales_rep_name)) IN (${placeholders})
            AND customer_name_unified IS NOT NULL
            AND TRIM(customer_name_unified) != ''
          ${budgetName ? `
          UNION
          SELECT DISTINCT customer_name as customername
          FROM fp_budget_unified
          WHERE UPPER(TRIM(division_code)) = UPPER($1)
            AND TRIM(UPPER(sales_rep_group_name)) = TRIM(UPPER($${groupMembers.length + 2}))
            AND UPPER(budget_type) = 'SALES_REP'
            AND customer_name IS NOT NULL
            AND TRIM(customer_name) != ''` : ''}
        ) all_customers
        ORDER BY customername
      `;
      
      const params = budgetName
        ? [DIVISION_CODE, ...groupMembers.map(n => String(n).trim().toUpperCase()), budgetName]
        : [DIVISION_CODE, ...groupMembers.map(n => String(n).trim().toUpperCase())];
      const result = await this.pool.query(query, params);
      return result.rows.map(row => row.customername);
    } catch (error) {
      logger.error('Error fetching customers for group:', error);
      throw error;
    }
  }

  /**
   * Get customer sales data by value type for a specific sales rep
   * Uses unified view with customer_name_unified for proper customer name resolution
   */
  async getCustomerSalesDataByValueType(salesRep, customer, valueType, year, month, dataType = 'Actual') {
    try {
      const normalizedDataType = normalizeDataType(dataType);
      const valueColumn = resolveValueColumn(valueType);
      const isBudgetType = normalizedDataType === 'BUDGET';
      const isEstimateType = normalizedDataType.includes('ESTIMATE') || normalizedDataType.includes('FORECAST');

      if (isBudgetType) {
        const budgetResult = await this.pool.query(
          `
            SELECT COALESCE(SUM(${valueColumn}), 0) as total_value
            FROM fp_budget_unified
            WHERE UPPER(TRIM(division_code)) = UPPER($1)
              AND budget_year = $2
              AND month_no = $3
              AND TRIM(UPPER(sales_rep_group_name)) = TRIM(UPPER($4))
              AND UPPER(TRIM(customer_name)) = UPPER(TRIM($5))
              AND UPPER(budget_type) = 'SALES_REP'
          `,
          [DIVISION_CODE, year, month, salesRep, customer]
        );
        return parseFloat(budgetResult.rows[0]?.total_value || 0);
      }

      const actualResult = await this.pool.query(
        `
          SELECT COALESCE(SUM(${valueColumn}), 0) as total_value
          FROM ${UNIFIED_TABLE}
          WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
            AND TRIM(UPPER(sales_rep_name)) = TRIM(UPPER($2))
            AND customer_name_unified = $3
            AND year = $4
            AND month_no = $5
        `,
        [DIVISION_CODE, salesRep, customer, year, month]
      );

      let total = parseFloat(actualResult.rows[0]?.total_value || 0);

      if (isEstimateType) {
        const estimateType = normalizedDataType.includes('FORECAST') ? 'FORECAST' : 'ESTIMATE';
        const estimateResult = await this.pool.query(
          `
            SELECT COALESCE(SUM(${valueColumn}), 0) as total_value
            FROM fp_budget_unified
            WHERE UPPER(TRIM(division_code)) = UPPER($1)
              AND budget_year = $2
              AND month_no = $3
              AND TRIM(UPPER(sales_rep_group_name)) = TRIM(UPPER($4))
              AND UPPER(TRIM(customer_name)) = UPPER(TRIM($5))
              AND UPPER(budget_type) = $6
          `,
          [DIVISION_CODE, year, month, salesRep, customer, estimateType]
        );
        total += parseFloat(estimateResult.rows[0]?.total_value || 0);
      }

      return total;
    } catch (error) {
      logger.error('Error fetching customer sales data by value type:', error);
      throw error;
    }
  }

  /**
   * Get customer sales data for a group of sales reps
   * Uses unified view with customer_name_unified for proper customer name resolution
   * For budget queries: uses sales_rep_group_name column (budget stored by group name only)
   */
  async getCustomerSalesDataForGroup(groupMembers, customer, valueType, year, month, dataType = 'Actual') {
    try {
      const normalizedDataType = normalizeDataType(dataType);
      const valueColumn = resolveValueColumn(valueType);
      const budgetType = resolveBudgetType(normalizedDataType);

      // For budget queries, get the group name (budget data stored with group name only)
      let groupName = null;
      if (groupMembers && groupMembers.length > 0) {
        groupName = await findGroupForSalesRep(groupMembers[0]);
      }

      const placeholders = groupMembers.map((_, index) => `$${index + 2}`).join(', ');
      const actualQuery = `
        SELECT COALESCE(SUM(${valueColumn}), 0) as total_value
        FROM ${UNIFIED_TABLE}
        WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
          AND TRIM(UPPER(sales_rep_name)) IN (${placeholders})
          AND customer_name_unified = $${groupMembers.length + 2}
          AND year = $${groupMembers.length + 3}
          AND month_no = $${groupMembers.length + 4}
      `;

      const params = [
        DIVISION_CODE,
        ...groupMembers.map(n => String(n).trim().toUpperCase()),
        customer,
        year,
        month
      ];

      const result = await this.pool.query(actualQuery, params);
      let total = parseFloat(result.rows[0]?.total_value || 0);

      // Use group name for budget queries (budget data has sales_rep_group_name populated, not sales_rep_name)
      const budgetSalesRepName = groupName || (groupMembers.length > 0 ? groupMembers[0] : null);

      if (budgetType && normalizedDataType !== 'BUDGET' && budgetSalesRepName) {
        const budgetQuery = `
          SELECT COALESCE(SUM(${valueColumn}), 0) as total_value
          FROM fp_budget_unified
          WHERE UPPER(TRIM(division_code)) = UPPER($1)
            AND TRIM(UPPER(sales_rep_group_name)) = TRIM(UPPER($2))
            AND UPPER(TRIM(customer_name)) = UPPER(TRIM($3))
            AND budget_year = $4
            AND month_no = $5
            AND UPPER(budget_type) = $6
        `;

        const budgetParams = [
          DIVISION_CODE,
          budgetSalesRepName,
          customer,
          year,
          month,
          budgetType
        ];

        const budgetResult = await this.pool.query(budgetQuery, budgetParams);
        total += parseFloat(budgetResult.rows[0]?.total_value || 0);
      }

      if (normalizedDataType === 'BUDGET' && budgetSalesRepName) {
        const budgetQuery = `
          SELECT COALESCE(SUM(${valueColumn}), 0) as total_value
          FROM fp_budget_unified
          WHERE UPPER(TRIM(division_code)) = UPPER($1)
            AND TRIM(UPPER(sales_rep_group_name)) = TRIM(UPPER($2))
            AND UPPER(TRIM(customer_name)) = UPPER(TRIM($3))
            AND budget_year = $4
            AND month_no = $5
            AND UPPER(budget_type) = 'SALES_REP'
        `;

        const budgetParams = [
          DIVISION_CODE,
          budgetSalesRepName,
          customer,
          year,
          month
        ];

        const budgetResult = await this.pool.query(budgetQuery, budgetParams);
        total = parseFloat(budgetResult.rows[0]?.total_value || 0);
      }

      return total;
    } catch (error) {
      logger.error('Error fetching customer sales data for group:', error);
      throw error;
    }
  }

  // NEW: Master Data Methods

  /**
   * Get unique product groups from unified view, excluding specified categories
   * Uses pg_combine for proper product group resolution
   */
  async getProductGroupsForMasterData() {
    try {
      // First get excluded categories from config
      const excludedCategories = await this.getExcludedProductGroups();
      
      // Build query with exclusions and case-insensitive filtering using actual common
      let query = `
        SELECT DISTINCT pgcombine as productgroup 
        FROM ${UNIFIED_TABLE} 
        WHERE pgcombine IS NOT NULL 
        AND TRIM(pgcombine) != ''
        AND UPPER(TRIM(admin_division_code)) = UPPER('${DIVISION_CODE}')
        AND LOWER(pgcombine) NOT IN (${excludedCategories.map(cat => `LOWER('${cat}')`).join(', ')})
        ORDER BY productgroup
      `;
      
      const result = await this.pool.query(query);
      
      // Format product group names to proper case
      return result.rows.map(row => this.formatProductGroupName(row.productgroup));
    } catch (error) {
      logger.error('Error fetching product groups for master data:', error);
      throw error;
    }
  }

  /**
   * Get available years (descending) from fp_actualcommon
   * Uses direct table query for best performance
   */
  async getProductGroupPricingYears() {
    try {
      const result = await this.pool.query(`
        SELECT DISTINCT year
        FROM ${UNIFIED_TABLE}
        WHERE year IS NOT NULL
        ORDER BY year DESC
      `);
      return result.rows.map(row => row.year);
    } catch (error) {
      logger.error('Error fetching product group pricing years:', error);
      throw error;
    }
  }

  // NOTE: getProductGroupPricingAverages is defined at the end of this class
  // It queries fp_actualcommon directly for year-specific pricing data

  /**
   * Format product group name to proper case
   * Handles spaces, hyphens, and slashes consistently with other normalization
   */
  formatProductGroupName(name) {
    if (!name) return name;
    
    // Use regex to handle spaces, hyphens, and slashes (consistent with main toProperCase)
    return name.toString().trim().toLowerCase()
      .replace(/(?:^|\s|[-/])\w/g, (match) => match.toUpperCase());
  }

  /**
   * Get excluded product groups from config
   */
  async getExcludedProductGroups() {
    try {
      const result = await this.pool.query(
        'SELECT config_value FROM fp_master_config WHERE config_key = $1',
        ['excluded_product_groups']
      );
      
      if (result.rows.length > 0) {
        return result.rows[0].config_value;
      }
      
      // Default exclusions if config not found
      return ['Service Charges', 'Others', 'Other', 'Miscellaneous', 'Service', 'Charges'];
    } catch (error) {
      logger.error('Error fetching excluded product groups:', error);
      return ['Service Charges', 'Others', 'Other', 'Miscellaneous', 'Service', 'Charges'];
    }
  }

  /**
   * Get active product groups from master mapping table (ONE SOURCE OF TRUTH)
   * Performance: Single query to 15 rows instead of scanning 50,529 rows
   * Exclusions are managed dynamically via Raw Product Groups page (fp_raw_product_groups.is_unmapped)
   * NOTE: Uses division-specific table in fp_database (not ip_auth_database)
   */
  async getActiveProductGroups() {
    try {
      // ONE SOURCE OF TRUTH: Read active product groups from fp_raw_product_groups (in fp_database)
      const result = await this.pool.query(`
        SELECT DISTINCT INITCAP(LOWER(TRIM(pg_combine))) as product_group
        FROM fp_raw_product_groups
        WHERE is_unmapped = false 
          AND pg_combine IS NOT NULL
          AND TRIM(pg_combine) != ''
        ORDER BY product_group
      `);
      
      return result.rows.map(r => r.product_group);
    } catch (error) {
      logger.error('Error fetching active product groups:', error);
      throw error;
    }
  }

  /**
   * Get all material percentages for all product groups
   * Returns data for ALL active product groups (from actual data), initializing missing ones
   */
  async getMaterialPercentages() {
    try {
      // Get active product groups from actual data (excluding configured exclusions)
      const activeGroups = await this.getActiveProductGroups();
      
      // Get existing material percentages from database
      const result = await this.pool.query(
        'SELECT * FROM fp_material_percentages ORDER BY product_group'
      );
      
      const existingData = {};
      result.rows.forEach(row => {
        const normalizedGroup = row.product_group.toLowerCase().trim();
        existingData[normalizedGroup] = row;
      });
      
      // Build complete list with all active groups
      const completeData = activeGroups.map(productGroup => {
        const normalizedGroup = productGroup.toLowerCase().trim();
        
        if (existingData[normalizedGroup]) {
          // Return existing data
          return existingData[normalizedGroup];
        } else {
          // Return empty row for new product group (not yet saved)
          return {
            product_group: productGroup,
            pe_percentage: 0,
            bopp_percentage: 0,
            pet_percentage: 0,
            alu_percentage: 0,
            paper_percentage: 0,
            pvc_pet_percentage: 0,
            mix_percentage: 0,
            material: '',
            process: ''
          };
        }
      });
      
      return completeData;
    } catch (error) {
      logger.error('Error fetching material percentages:', error);
      throw error;
    }
  }

  /**
   * Get material percentages for a specific product group
   */
  async getMaterialPercentage(productGroup) {
    try {
      const result = await this.pool.query(
        'SELECT * FROM fp_material_percentages WHERE product_group = $1',
        [productGroup]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error fetching material percentage:', error);
      throw error;
    }
  }

  /**
   * Create or update material percentages for a product group
   */
  async saveMaterialPercentage(productGroup, percentages, material = '', process = '') {
    try {
      // Delegate to unified ProductGroupMasterService for FP division
      const ProductGroupMasterService = require('../services/ProductGroupMasterService');
      
      // Get material column mapping from config (display_name -> column_code)
      const columnConfigResult = await this.authPool.query(`
        SELECT display_name, column_code 
        FROM material_column_config 
        WHERE division = 'fp' AND is_active = TRUE
        ORDER BY display_name
      `);
      
      // Build mapping: any case variation of display_name or column_code -> database column
      const columnMapping = {};
      columnConfigResult.rows.forEach(row => {
        const fieldName = row.column_code.toLowerCase() + '_percentage'; // e.g., 'bopp_percentage'
        
        // Map all case variations of display_name (PP, pp, Pp, pP)
        const displayName = row.display_name;
        columnMapping[displayName.toUpperCase()] = fieldName;
        columnMapping[displayName.toLowerCase()] = fieldName;
        columnMapping[displayName] = fieldName; // Original case
        
        // Map all case variations of column_code (BOPP, bopp, Bopp, bOpp)
        const columnCode = row.column_code;
        columnMapping[columnCode.toUpperCase()] = fieldName;
        columnMapping[columnCode.toLowerCase()] = fieldName;
        columnMapping[columnCode] = fieldName; // Original case
      });
      
      // Build data object with all material percentages
      const data = { material, process };
      
      // Map incoming percentages to database column names
      Object.keys(percentages).forEach(key => {
        const fieldName = columnMapping[key];
        if (fieldName) {
          data[fieldName] = parseFloat(percentages[key]) || 0;
        }
      });
      
      // Format the product group name to proper case
      const formattedProductGroup = this.formatProductGroupName(productGroup);
      
      // Use ProductGroupMasterService to save to unified table
      const result = await ProductGroupMasterService.saveProductGroupMaster('FP', formattedProductGroup, data);
      
      return result;
    } catch (error) {
      logger.error('Error saving material percentage:', error);
      throw error;
    }
  }

  /**
   * Initialize material percentages for all product groups (set all to 0%)
   */
  async initializeMaterialPercentages() {
    try {
      const productGroups = await this.getProductGroupsForMasterData();
      
      for (const productGroup of productGroups) {
        // Check if already exists
        const existing = await this.getMaterialPercentage(productGroup);
        if (!existing) {
          await this.saveMaterialPercentage(productGroup, {
            pe: 0,
            bopp: 0,
            pet: 0,
            alu: 0,
            paper: 0,
            pvc_pet: 0
          });
        }
      }
      
      return productGroups;
    } catch (error) {
      logger.error('Error initializing material percentages:', error);
      throw error;
    }
  }

  /**
   * Save multiple material percentages at once
   * @param {Array} percentages - Array of {productGroup, pe, bopp, pet, alu, paper, pvc_pet, material, process}
   */
  async saveMaterialPercentages(percentages) {
    try {
      const results = [];
      for (const item of percentages) {
        const result = await this.saveMaterialPercentage(
          item.productGroup || item.product_group,
          {
            PE: item.pe || item.pe_percentage || 0,
            BOPP: item.bopp || item.bopp_percentage || 0,
            PET: item.pet || item.pet_percentage || 0,
            Alu: item.alu || item.alu_percentage || 0,
            Paper: item.paper || item.paper_percentage || 0,
            'PVC/PET': item.pvc_pet || item.pvc_pet_percentage || 0
          },
          item.material || '',
          item.process || ''
        );
        results.push(result);
      }
      return results;
    } catch (error) {
      logger.error('Error saving material percentages:', error);
      throw error;
    }
  }

  /**
   * Delete material percentage for a product group
   */
  async deleteMaterialPercentage(productGroup) {
    try {
      const result = await this.pool.query(
        'DELETE FROM fp_material_percentages WHERE product_group = $1 RETURNING *',
        [productGroup]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error deleting material percentage:', error);
      throw error;
    }
  }

  /**
   * Get master config value
   */
  async getMasterConfig(key) {
    try {
      const result = await this.pool.query(
        'SELECT config_value FROM fp_master_config WHERE config_key = $1',
        [key]
      );
      return result.rows[0]?.config_value || null;
    } catch (error) {
      logger.error('Error fetching master config:', error);
      throw error;
    }
  }

  /**
   * Set master config value
   */
  async setMasterConfig(key, value, description = null) {
    try {
      const query = `
        INSERT INTO fp_master_config (config_key, config_value, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (config_key) 
        DO UPDATE SET 
          config_value = EXCLUDED.config_value,
          description = EXCLUDED.description,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      
      const result = await this.pool.query(query, [key, value, description]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error setting master config:', error);
      throw error;
    }
  }

  /**
   * Get yearly budget total for a specific sales rep and year
   */
  async getYearlyBudget(salesRep, year, valuesType, groupMembers = null) {
    try {
      let query;
      let params;

      // Note: fp_actualcommon contains ACTUAL sales data, not budget
      // For budget queries for old years, should use fp_divisional_budget or separate budget table
      // This query will return ACTUAL sales totals, not budget
      // UNIFIED: Use sales_rep_group_name consistently
      if (groupMembers && Array.isArray(groupMembers)) {
        // It's a group - get yearly ACTUAL sales for all members
        const placeholders = groupMembers.map((_, index) => `$${index + 1}`).join(', ');
        query = `
          SELECT SUM(${valuesType === 'KGS' ? 'qty_kgs' : valuesType === 'Amount' ? 'amount' : 'morm'}) as total_value 
          FROM ${UNIFIED_TABLE}
          WHERE TRIM(UPPER(sales_rep_group_name)) IN (${placeholders}) 
          AND year = $${groupMembers.length + 1}
        `;
        params = [
          ...groupMembers.map(n => String(n).trim().toUpperCase()),
          year
        ];
      } else {
        // It's an individual sales rep - get yearly ACTUAL sales
        query = `
          SELECT SUM(${valuesType === 'KGS' ? 'qty_kgs' : valuesType === 'Amount' ? 'amount' : 'morm'}) as total_value 
          FROM ${UNIFIED_TABLE}
          WHERE TRIM(UPPER(sales_rep_group_name)) = TRIM(UPPER($1)) 
          AND year = $2
        `;
        params = [salesRep, year];
      }

      const result = await this.pool.query(query, params);
      const totalValue = parseFloat(result.rows[0]?.total_value || 0);
      
      logger.info(`📊 Yearly budget query result for ${salesRep} (${year}, ${valuesType}): ${totalValue}`);
      
      return totalValue;
    } catch (error) {
      logger.error('Error fetching yearly budget:', error);
      throw error;
    }
  }

  /**
   * Get all distinct countries from unified view
   */
  async getCountries() {
    try {
      const result = await this.pool.query(
        `SELECT DISTINCT INITCAP(LOWER(country)) as country 
         FROM ${UNIFIED_TABLE} 
         WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
         AND country IS NOT NULL AND TRIM(country) != '' 
         ORDER BY country`,
        [DIVISION_CODE]
      );
      return result.rows.map(row => row.country);
    } catch (error) {
      logger.error('Error fetching countries:', error);
      throw error;
    }
  }

  /**
   * Get countries from database (for compatibility)
   */
  async getCountriesFromDatabase() {
    return this.getCountries();
  }

  /**
   * Get countries by sales rep
   * Uses unified view for proper data resolution
   */
  async getCountriesBySalesRep(salesRep, groupMembers = null) {
    try {
      let query;
      let params;

      if (groupMembers && Array.isArray(groupMembers)) {
        const placeholders = groupMembers.map((_, index) => `$${index + 2}`).join(', ');
        query = `
          SELECT DISTINCT INITCAP(LOWER(country)) as country 
          FROM ${UNIFIED_TABLE} 
          WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
          AND TRIM(UPPER(sales_rep_name)) IN (${placeholders}) 
          AND country IS NOT NULL 
          AND TRIM(country) != '' 
          ORDER BY country
        `;
        params = [DIVISION_CODE, ...groupMembers.map(n => String(n).trim().toUpperCase())];
      } else {
        query = `
          SELECT DISTINCT INITCAP(LOWER(country)) as country 
          FROM ${UNIFIED_TABLE} 
          WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
          AND TRIM(UPPER(sales_rep_name)) = TRIM(UPPER($2)) 
          AND country IS NOT NULL 
          AND TRIM(country) != '' 
          ORDER BY country
        `;
        params = [DIVISION_CODE, salesRep];
      }

      const result = await this.pool.query(query, params);
      return result.rows.map(row => row.country);
    } catch (error) {
      logger.error('Error fetching countries by sales rep:', error);
      throw error;
    }
  }

  /**
   * Get all distinct customers from unified view
   * Uses customer_name_unified for proper customer name resolution
   */
  async getAllCustomers() {
    try {
      // Use unified view for actual data customers
      const result = await this.pool.query(`
        SELECT DISTINCT customer_name_unified as customername 
        FROM ${UNIFIED_TABLE} 
        WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
        AND customer_name_unified IS NOT NULL 
        AND TRIM(customer_name_unified) != ''
        ORDER BY customername
      `, [DIVISION_CODE]);
      return result.rows.map(row => row.customername);
    } catch (error) {
      logger.error('Error fetching all customers:', error);
      throw error;
    }
  }

  /**
   * Get all distinct sales reps from unified view
   */
  async getSalesReps() {
    try {
      const result = await this.pool.query(
        `SELECT DISTINCT INITCAP(LOWER(sales_rep_name)) as salesrepname 
         FROM ${UNIFIED_TABLE} 
         WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
         AND sales_rep_name IS NOT NULL AND TRIM(sales_rep_name) != '' 
         ORDER BY salesrepname`,
        [DIVISION_CODE]
      );
      return result.rows.map(row => row.salesrepname);
    } catch (error) {
      logger.error('Error fetching sales reps:', error);
      throw error;
    }
  }

  /**
   * Test master data connection
   */
  async testMasterDataConnection() {
    try {
      const result = await this.pool.query(`SELECT COUNT(*) as count FROM ${UNIFIED_TABLE}`);
      return { connected: true, recordCount: parseInt(result.rows[0].count) };
    } catch (error) {
      logger.error('Error testing master data connection:', error);
      throw error;
    }
  }

  /**
   * Get sales by country
   * Uses unified view for proper data resolution
   */
  async getSalesByCountry(salesRep, year, months, dataType = 'Actual', groupMembers = null) {
    try {
      const normalizedDataType = normalizeDataType(dataType);
      const isEstimateType = normalizedDataType.includes('ESTIMATE') || normalizedDataType.includes('FORECAST');
      const budgetType = resolveBudgetType(normalizedDataType);
      
      let query;
      let params;

      if (groupMembers && Array.isArray(groupMembers)) {
        const repPlaceholders = groupMembers.map((_, index) => `$${index + 2}`).join(', ');
        const monthPlaceholders = months.map((_, index) => `$${groupMembers.length + 3 + index}`).join(', ');

        query = `
          SELECT 
            INITCAP(LOWER(country)) as country,
            SUM(amount) as total_amount,
            SUM(qty_kgs) as total_kgs
          FROM ${UNIFIED_TABLE}
          WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
          AND TRIM(UPPER(sales_rep_name)) IN (${repPlaceholders})
          AND year = $${groupMembers.length + 2}
          AND month_no IN (${monthPlaceholders})
          AND country IS NOT NULL
          GROUP BY country
          ORDER BY total_amount DESC
        `;
        
        params = [DIVISION_CODE, ...groupMembers.map(n => String(n).trim().toUpperCase()), year, ...months];
      } else {
        const monthPlaceholders = months.map((_, index) => `$${4 + index}`).join(', ');

        query = `
          SELECT 
            INITCAP(LOWER(country)) as country,
            SUM(amount) as total_amount,
            SUM(qty_kgs) as total_kgs
          FROM ${UNIFIED_TABLE}
          WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
          AND TRIM(UPPER(sales_rep_name)) = TRIM(UPPER($2))
          AND year = $3
          AND month_no IN (${monthPlaceholders})
          AND country IS NOT NULL
          GROUP BY country
          ORDER BY total_amount DESC
        `;
        
        params = [DIVISION_CODE, salesRep, year, ...months];
      }

      let result = await this.pool.query(query, params);

      if (normalizedDataType === 'BUDGET') {
        // Budget queries use sales_rep_group_name column (budget data stored with group name only)
        const budgetQuery = `
          SELECT 
            INITCAP(LOWER(country)) as country,
            SUM(amount) as total_amount,
            SUM(qty_kgs) as total_kgs
          FROM fp_budget_unified
          WHERE UPPER(TRIM(division_code)) = UPPER($1)
            AND budget_year = $2
            AND month_no = ANY($3)
            AND UPPER(budget_type) = 'SALES_REP'
            AND TRIM(UPPER(sales_rep_group_name)) = TRIM(UPPER($4))
            AND country IS NOT NULL 
          GROUP BY country 
          ORDER BY total_amount DESC
        `;

        const budgetParams = [DIVISION_CODE, year, months, salesRep];
        const budgetResult = await this.pool.query(budgetQuery, budgetParams);
        result = budgetResult;
      } else if (isEstimateType && budgetType) {
        // Estimate/Forecast queries also use sales_rep_group_name
        const estimateQuery = `
          SELECT 
            INITCAP(LOWER(country)) as country,
            SUM(amount) as total_amount,
            SUM(qty_kgs) as total_kgs
          FROM fp_budget_unified
          WHERE UPPER(TRIM(division_code)) = UPPER($1)
            AND budget_year = $2
            AND month_no = ANY($3)
            AND UPPER(budget_type) = $4
            AND TRIM(UPPER(sales_rep_group_name)) = TRIM(UPPER($5))
            AND country IS NOT NULL 
          GROUP BY country 
          ORDER BY total_amount DESC
        `;

        const estimateParams = [DIVISION_CODE, year, months, budgetType, salesRep];
        const estimateResult = await this.pool.query(estimateQuery, estimateParams);

        const combined = new Map();
        result.rows.forEach(row => {
          combined.set(row.country, { country: row.country, total_amount: parseFloat(row.total_amount) || 0, total_kgs: parseFloat(row.total_kgs) || 0 });
        });
        estimateResult.rows.forEach(row => {
          const existing = combined.get(row.country) || { country: row.country, total_amount: 0, total_kgs: 0 };
          existing.total_amount += parseFloat(row.total_amount) || 0;
          existing.total_kgs += parseFloat(row.total_kgs) || 0;
          combined.set(row.country, existing);
        });
        result = { rows: Array.from(combined.values()) };
      }

      // If we synthesized rows (Map), ensure ordering by total_amount desc
      result.rows.sort((a, b) => (parseFloat(b.total_amount) || 0) - (parseFloat(a.total_amount) || 0));
      return result.rows;
    } catch (error) {
      logger.error('Error fetching sales by country:', error);
      throw error;
    }
  }

  // ============================================
  // Raw Product Groups Management
  // ============================================

  /**
   * Get all unique raw product groups with their item group descriptions
   * Get distinct raw product groups from master mapping table (ONE SOURCE OF TRUTH)
   * Performance: 3368x faster - queries 15 rows instead of 50,529 rows
   */
  async getDistinctRawProductGroups(division = 'FP') {
    try {
      const cacheKey = String(division || 'FP').toUpperCase();
      const cached = this._getRawProductGroupsCache(this.rawProductGroupsCache.distinct, cacheKey);
      if (cached) return cached;

      const startTime = Date.now();

      // Step 1: Get raw product groups from fp_database (division-specific table)
      const mappingsResult = await this.pool.query(
        `SELECT 
           raw_product_group,
           pg_combine,
           is_unmapped
         FROM fp_raw_product_groups
         ORDER BY raw_product_group`
      );
      
      // Step 2: Get item group descriptions from fp_actualcommon grouped by product_group
      // Column names: product_group, item_group_desc
      const itemDescsResult = await this.pool.query(
        `SELECT 
           product_group,
           ARRAY_AGG(DISTINCT item_group_desc ORDER BY item_group_desc) as item_group_descriptions
         FROM fp_actualcommon
         WHERE item_group_desc IS NOT NULL 
           AND TRIM(item_group_desc) != ''
           AND product_group IS NOT NULL
           AND TRIM(product_group) != ''
         GROUP BY product_group`
      );
      
      // Step 3: Create lookup map for item descriptions
      const itemDescsMap = new Map();
      itemDescsResult.rows.forEach(row => {
        itemDescsMap.set(row.product_group.toLowerCase().trim(), row.item_group_descriptions);
      });
      
      // Step 4: Merge the data
      const mergedData = mappingsResult.rows.map(mapping => ({
        raw_product_group: mapping.raw_product_group,
        pg_combine: mapping.pg_combine,
        is_unmapped: mapping.is_unmapped,
        item_group_descriptions: itemDescsMap.get(mapping.raw_product_group.toLowerCase().trim()) || []
      }));

      this._setRawProductGroupsCache(this.rawProductGroupsCache.distinct, cacheKey, mergedData);

      logger.info('Raw product groups distinct loaded', {
        durationMs: Date.now() - startTime,
        rows: mergedData.length,
        division: cacheKey
      });
      
      return mergedData;
    } catch (error) {
      logger.error('Error fetching distinct raw product groups:', error);
      throw error;
    }
  }

  /**
   * Get all raw product group mappings
   */
  async getRawProductGroupMappings(division = 'FP') {
    try {
      const cacheKey = String(division || 'FP').toUpperCase();
      const cached = this._getRawProductGroupsCache(this.rawProductGroupsCache.mappings, cacheKey);
      if (cached) return cached;
      
      const result = await this.pool.query(
        `SELECT id, raw_product_group, pg_combine, is_unmapped, is_excluded, material, process, created_at, updated_at 
         FROM fp_raw_product_groups 
         ORDER BY raw_product_group`
      );
      this._setRawProductGroupsCache(this.rawProductGroupsCache.mappings, cacheKey, result.rows);
      return result.rows;
    } catch (error) {
      if (error && error.code === '42P01') {
        logger.info('fp_raw_product_groups table not yet created, returning empty array');
        return [];
      }
      logger.error('Error fetching raw product group mappings:', error);
      throw error;
    }
  }

  /**
   * Get available PGCombine options from fp_material_percentages
   */
  async getPGCombineOptions() {
    try {
      const result = await this.pool.query(
        `SELECT DISTINCT product_group as pg_combine, material, process 
         FROM fp_material_percentages 
         ORDER BY product_group`
      );
      return result.rows;
    } catch (error) {
      logger.error('Error fetching PGCombine options:', error);
      throw error;
    }
  }

  /**
   * Save or update a raw product group mapping
   */
  async saveRawProductGroupMapping(rawProductGroup, pgCombine, division = 'FP') {
    try {
      const result = await this.pool.query(
        `INSERT INTO fp_raw_product_groups (raw_product_group, pg_combine)
         VALUES ($1, $2)
         ON CONFLICT (raw_product_group) 
         DO UPDATE SET pg_combine = $2, updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [rawProductGroup, pgCombine]
      );
      this.invalidateRawProductGroupsCache(division);
      return result.rows[0];
    } catch (error) {
      logger.error('Error saving raw product group mapping:', error);
      throw error;
    }
  }

  /**
   * Save multiple raw product group mappings
   */
  async saveRawProductGroupMappings(mappings, division = 'FP') {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      const results = [];
      for (const mapping of mappings) {
        const isUnmapped = mapping.isUnmapped === true;
        const result = await client.query(
          `INSERT INTO fp_raw_product_groups (raw_product_group, pg_combine, is_unmapped)
           VALUES ($1, $2, $3)
           ON CONFLICT (raw_product_group) 
           DO UPDATE SET pg_combine = $2, is_unmapped = $3, updated_at = CURRENT_TIMESTAMP
           RETURNING *`,
          [mapping.rawProductGroup, mapping.pgCombine, isUnmapped]
        );
        results.push(result.rows[0]);
      }
      
      await client.query('COMMIT');
      this.invalidateRawProductGroupsCache(division);
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error saving raw product group mappings:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete a raw product group mapping
   */
  async deleteRawProductGroupMapping(id) {
    try {
      const result = await this.pool.query(
        'DELETE FROM fp_raw_product_groups WHERE id = $1 RETURNING *',
        [id]
      );
      this.invalidateRawProductGroupsCache('FP');
      return result.rows[0];
    } catch (error) {
      logger.error('Error deleting raw product group mapping:', error);
      throw error;
    }
  }

  /**
   * Add a new PGCombine to material percentages (creates empty entry)
   */
  async addPGCombine(pgCombine, material = '', process = '') {
    try {
      const result = await this.pool.query(
        `INSERT INTO fp_material_percentages (product_group, material, process, pe_percentage, bopp_percentage, pet_percentage, alu_percentage, paper_percentage, pvc_pet_percentage, mix_percentage)
         VALUES ($1, $2, $3, 0, 0, 0, 0, 0, 0, 0)
         ON CONFLICT (product_group) DO NOTHING
         RETURNING *`,
        [pgCombine, material, process]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error adding PGCombine:', error);
      throw error;
    }
  }

  /**
   * Sync PGCombine values to material percentages table
   * - Adds new PGCombines that don't exist (excludes "Not in PG")
   * - Removes PGCombines that are no longer in the list (optional, controlled by removeOrphans)
   */
  async syncPGCombinesToMaterialPercentages(pgCombines, removeOrphans = true) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Filter out "Not in PG" - should not be synced to material percentages
      const filteredPGCombines = pgCombines.filter(pg => 
        pg && pg.trim().toLowerCase() !== 'not in pg'
      );
      
      // Get existing PGCombines
      const existingResult = await client.query('SELECT product_group FROM fp_material_percentages');
      const existingSet = new Set(existingResult.rows.map(r => r.product_group));
      const newSet = new Set(filteredPGCombines);
      
      // Add new PGCombines
      let addedCount = 0;
      for (const pg of filteredPGCombines) {
        if (!existingSet.has(pg)) {
          await client.query(
            `INSERT INTO fp_material_percentages (product_group, material, process, pe_percentage, bopp_percentage, pet_percentage, alu_percentage, paper_percentage, pvc_pet_percentage, mix_percentage)
             VALUES ($1, '', '', 0, 0, 0, 0, 0, 0, 0)
             ON CONFLICT (product_group) DO NOTHING`,
            [pg]
          );
          addedCount++;
        }
      }
      
      // Remove orphan PGCombines (no longer in the mapping)
      let removedCount = 0;
      if (removeOrphans) {
        for (const existing of existingSet) {
          if (!newSet.has(existing)) {
            await client.query('DELETE FROM fp_material_percentages WHERE product_group = $1', [existing]);
            removedCount++;
          }
        }
      }
      
      await client.query('COMMIT');
      logger.info('PGCombines synced to material percentages', { added: addedCount, removed: removedCount });
      return { added: addedCount, removed: removedCount };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error syncing PGCombines to material percentages:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // Item Group Description Overrides
  // ============================================

  /**
   * Get all item group description overrides
   */
  async getItemGroupOverrides() {
    try {
      const now = Date.now();
      if (
        this.rawProductGroupsCache.overrides &&
        now - this.rawProductGroupsCache.overridesAt <= this.rawProductGroupsCacheTTL
      ) {
        return this.rawProductGroupsCache.overrides;
      }

      const result = await this.pool.query(
        `SELECT id, item_group_description, pg_combine, original_product_group, created_at, updated_at 
         FROM fp_item_group_overrides 
         ORDER BY item_group_description`
      );
      this.rawProductGroupsCache.overrides = result.rows;
      this.rawProductGroupsCache.overridesAt = now;
      return result.rows;
    } catch (error) {
      logger.error('Error fetching item group overrides:', error);
      throw error;
    }
  }

  /**
   * Save or update an item group description override
   */
  async saveItemGroupOverride(itemGroupDescription, pgCombine, originalProductGroup = null) {
    try {
      const result = await this.pool.query(
        `INSERT INTO fp_item_group_overrides (item_group_description, pg_combine, original_product_group, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (item_group_description) 
         DO UPDATE SET pg_combine = $2, updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [itemGroupDescription, pgCombine, originalProductGroup]
      );
      this.invalidateRawProductGroupsCache('FP');
      return result.rows[0];
    } catch (error) {
      logger.error('Error saving item group override:', error);
      throw error;
    }
  }

  /**
   * Delete an item group description override
   */
  async deleteItemGroupOverride(itemGroupDescription) {
    try {
      const result = await this.pool.query(
        'DELETE FROM fp_item_group_overrides WHERE item_group_description = $1 RETURNING *',
        [itemGroupDescription]
      );
      this.invalidateRawProductGroupsCache('FP');
      return result.rows[0];
    } catch (error) {
      logger.error('Error deleting item group override:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UNIFIED PRODUCT GROUP MASTER METHODS (New Architecture)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get all product group master data (material % + pricing)
   * UNIFIED: Single source of truth
   */
  async getAllProductGroupMaster() {
    return await this.unifiedService.getAllProductGroupMaster();
  }

  /**
   * Get single product group master data
   */
  async getProductGroupMaster(productGroup) {
    return await this.unifiedService.getProductGroupMaster(productGroup);
  }

  /**
   * Save product group master data (material % + pricing)
   * UNIFIED: Saves all data in one call
   */
  async saveProductGroupMaster(productGroup, data) {
    return await this.unifiedService.saveProductGroupMaster(productGroup, data);
  }

  /**
   * Refresh actual pricing from fp_actualcommon
   */
  async refreshActualPricing(year = null) {
    return await this.unifiedService.refreshActualPricing(year);
  }

  /**
   * Add material column (dynamic, no ALTER TABLE)
   */
  async addMaterialColumn(columnData) {
    return await this.unifiedService.addMaterialColumn(columnData);
  }

  /**
   * Remove material column (soft delete)
   */
  async removeMaterialColumn(column_code) {
    return await this.unifiedService.removeMaterialColumn(column_code);
  }

  /**
   * Get material columns configuration
   */
  async getMaterialColumnsConfig() {
    return await this.unifiedService.getMaterialColumns();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BACKWARD COMPATIBILITY METHODS (Delegate to unified service)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get material percentages (backward compatible)
   * @deprecated Use getAllProductGroupMaster() instead
   */
  async getMaterialPercentages() {
    const data = await this.getAllProductGroupMaster();
    return data.map(row => ({
      product_group: row.product_group,
      pe_percentage: row.pe_percentage,
      bopp_percentage: row.bopp_percentage,
      pet_percentage: row.pet_percentage,
      alu_percentage: row.alu_percentage,
      paper_percentage: row.paper_percentage,
      pvc_pet_percentage: row.pvc_pet_percentage,
      mix_percentage: row.mix_percentage,
      material: row.material,
      process: row.process,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
  }

  /**
   * Save material percentage (backward compatible)
   * @deprecated Use saveProductGroupMaster() instead
   */
  async saveMaterialPercentage(productGroup, percentages, material = '', process = '') {
    return await this.saveProductGroupMaster(productGroup, {
      percentages,
      material,
      process
    });
  }

  /**
   * Get product group pricing averages - queries fp_actualcommon directly for year-specific data
   * This properly calculates averages from actual sales data for any year
   */
  async getProductGroupPricingAverages(year) {
    if (!year) {
      throw new Error('Year is required to fetch product group pricing averages');
    }

    try {
      // Get excluded PGCombines from fp_raw_product_groups where is_unmapped=true
      const excludedResult = await this.pool.query(`
        SELECT DISTINCT LOWER(TRIM(pg_combine)) as pg_combine
        FROM fp_raw_product_groups
        WHERE is_unmapped = true AND pg_combine IS NOT NULL
      `);
      const excludedPGCombines = excludedResult.rows.map(r => r.pg_combine);

      // Build exclusion clause
      let excludeClause = "AND LOWER(TRIM(pgcombine)) != 'not in pg'";
      if (excludedPGCombines.length > 0) {
        const placeholders = excludedPGCombines.map((_, i) => `$${i + 2}`).join(', ');
        excludeClause += ` AND LOWER(TRIM(pgcombine)) NOT IN (${placeholders})`;
      }

      // Query fp_actualcommon directly for year-specific pricing averages
      const query = `
        WITH monthly_data AS (
          SELECT 
            INITCAP(LOWER(TRIM(pgcombine))) AS product_group,
            year,
            month_no,
            SUM(qty_kgs) AS total_kgs,
            SUM(amount) AS total_amount,
            SUM(morm) AS total_morm
          FROM ${UNIFIED_TABLE}
          WHERE year = $1
            AND month_no IS NOT NULL
            AND pgcombine IS NOT NULL
            AND TRIM(pgcombine) != ''
            ${excludeClause}
          GROUP BY pgcombine, year, month_no
        )
        SELECT 
          product_group,
          SUM(total_kgs) AS total_kgs,
          SUM(total_amount) AS total_amount,
          SUM(total_morm) AS total_morm,
          COUNT(*) FILTER (WHERE total_kgs > 0) AS months_with_data
        FROM monthly_data
        GROUP BY product_group
        ORDER BY product_group
      `;

      const params = [year, ...excludedPGCombines];
      const result = await this.pool.query(query, params);

      return result.rows.map(row => {
        const totalKgs = parseFloat(row.total_kgs) || 0;
        const totalAmount = parseFloat(row.total_amount) || 0;
        const totalMorm = parseFloat(row.total_morm) || 0;
        return {
          productGroup: row.product_group,
          avgSellingPrice: totalKgs > 0 ? totalAmount / totalKgs : 0,
          avgMarginOverRM: totalKgs > 0 ? totalMorm / totalKgs : 0,
          monthsWithData: parseInt(row.months_with_data, 10) || 0
        };
      });
    } catch (error) {
      logger.error('Error fetching product group pricing averages:', error);
      throw error;
    }
  }
}


module.exports = new FPDataService();