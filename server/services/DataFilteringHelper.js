/**
 * ============================================================================
 * DATA FILTERING HELPER
 * ============================================================================
 * 
 * Provides SQL building blocks for applying the 3-layer data filtering:
 * 
 * 1. PRODUCT GROUPS: Raw → fp_raw_product_groups → PGCombine → fp_material_percentages
 *    - ItemGroupDescription overrides via fp_item_group_overrides
 *    - Excludes unmapped products (is_unmapped = true or pg_combine is NULL)
 *    - "Raw Materials" and "Not in PG" are excluded
 * 
 * 2. SALES REPS: Raw Name → sales_rep_groups → Group Name
 *    - Uses sales_rep_groups + sales_rep_group_members tables
 *    - Same grouping as the main dashboard
 *    - Ungrouped reps keep their original names
 * 
 * 3. CUSTOMERS: Raw Name → customer_merge_rules → Merged Customer Name
 *    - Uses division_customer_merge_rules table
 *    - customer_group array contains all aliases
 * 
 * Usage: All AI Learning services should use these helpers when querying data
 * 
 * Created: December 28, 2025
 * Updated: December 28, 2025 - Changed sales rep to use groups instead of aliases
 * ============================================================================
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

class DataFilteringHelper {
  
  /**
   * Get column name mappings for fp_actualcommon table
   * This maps the old fp_data_excel column names to the new fp_actualcommon column names
   * IMPORTANT: For reports, use sales_rep_group_name (not sales_rep_name) for aggregated data!
   */
  static getColumnNames() {
    return {
      // Column mappings from old schema to new schema
      customername: 'customer_name',
      salesrepname: 'sales_rep_name',         // Individual rep (for detailed queries only)
      salesrepgroupname: 'sales_rep_group_name', // Group name (USE THIS for reports!)
      productgroup: 'product_group',
      pgcombine: 'pgcombine',
      countryname: 'country',
      year: 'year',
      month: 'month',
      // Value columns - fp_actualcommon uses separate columns instead of values_type
      amount: 'amount',
      volume: 'qty_kgs',
      // No 'type' column in fp_actualcommon - all records are actual sales
      // The old WHERE type = 'Actual' is not needed
    };
  }

  /**
   * Get table names for a division
   */
  static getTableNames(divisionCode) {
    const prefix = divisionCode.toLowerCase().split('-')[0];
    return {
      prefix,
      actualData: `${prefix}_actualcommon`,  // Changed from dataExcel to actualData, using fp_actualcommon
      rawProductGroups: `${prefix}_raw_product_groups`,
      itemGroupOverrides: `${prefix}_item_group_overrides`,
      materialPercentages: `${prefix}_material_percentages`,
      customerMergeRules: `${prefix}_division_customer_merge_rules`,
      budgetUnified: `${prefix}_budget_unified`,
      budgetUnifiedDraft: `${prefix}_budget_unified_draft`
    };
  }

  // ===========================================================================
  // PRODUCT GROUP RESOLUTION
  // ===========================================================================

  /**
   * Get SQL for product group resolution
   * 
   * NOTE: fp_actualcommon already has 'pgcombine' column pre-resolved!
   * No JOINs needed - just use the pgcombine column directly.
   * 
   * Usage:
   *   SELECT ${pg.pgCombineExpr} as product_group, ...
   *   FROM ${tables.actualData} d
   *   ${pg.joins}  -- empty for fp_actualcommon since pgcombine is pre-resolved
   *   WHERE ${pg.filterCondition}
   * 
   * @param {string} divisionCode - Division code
   * @param {string} dataAlias - Alias for the data table (default: 'd')
   * @returns {object} { joins, pgCombineExpr, filterCondition }
   */
  static getProductGroupSQL(divisionCode, dataAlias = 'd') {
    // fp_actualcommon already has pgcombine column pre-resolved
    // No JOINs needed!
    const joins = '';
    
    // Expression to get PGCombine - use the pre-resolved column
    const pgCombineExpr = `${dataAlias}.pgcombine`;
    
    // Filter to exclude invalid product groups (no leading AND - caller adds it)
    const filterCondition = `${dataAlias}.pgcombine IS NOT NULL AND LOWER(TRIM(${dataAlias}.pgcombine)) NOT IN ('raw materials', 'not in pg', 'services charges')`;
    
    return { joins, pgCombineExpr, filterCondition };
  }

  /**
   * Get list of valid PGCombine values from material_percentages
   * These are the ONLY product groups that should be included in calculations
   */
  static async getValidProductGroups(divisionCode) {
    const tables = this.getTableNames(divisionCode);
    
    try {
      const result = await pool.query(`
        SELECT DISTINCT INITCAP(LOWER(TRIM(product_group))) as product_group
        FROM ${tables.materialPercentages}
        WHERE product_group IS NOT NULL
          AND TRIM(product_group) != ''
        ORDER BY product_group
      `);
      
      return result.rows.map(r => r.product_group);
    } catch (error) {
      logger.error(`Failed to get valid product groups for ${divisionCode}:`, error);
      throw error;
    }
  }

  /**
   * Get SQL for strict product group filtering (only those in material_percentages)
   * Use this when you need to ensure only valid PGCombines are included
   */
  static getStrictProductGroupSQL(divisionCode, dataAlias = 'd') {
    const tables = this.getTableNames(divisionCode);
    const basic = this.getProductGroupSQL(divisionCode, dataAlias);
    
    // Add join to material_percentages for strict filtering
    const strictJoins = `${basic.joins}
      INNER JOIN ${tables.materialPercentages} mp
        ON LOWER(TRIM(${basic.pgCombineExpr})) = LOWER(TRIM(mp.product_group))
    `;
    
    return {
      joins: strictJoins,
      pgCombineExpr: basic.pgCombineExpr,
      materialExpr: 'mp.material',
      processExpr: 'mp.process',
      filterCondition: basic.filterCondition
    };
  }

  // ===========================================================================
  // SALES REP RESOLUTION (Using Groups - same as Dashboard)
  // ===========================================================================

  // Cache for sales rep groups (refreshed when needed)
  static salesRepGroupsCache = null;
  static salesRepGroupsCacheTime = 0;
  static CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Load sales rep groups from database
   * Uses the same tables as the dashboard (sales_rep_groups + sales_rep_group_members)
   * 
   * @param {string} divisionCode - Division code (e.g., 'FP')
   * @returns {Promise<Object>} Map of groupName -> [member1, member2, ...]
   */
  static async loadSalesRepGroups(divisionCode) {
    const now = Date.now();
    const cacheKey = divisionCode.toUpperCase();
    
    // Check cache
    if (this.salesRepGroupsCache && 
        this.salesRepGroupsCache[cacheKey] && 
        (now - this.salesRepGroupsCacheTime) < this.CACHE_TTL) {
      return this.salesRepGroupsCache[cacheKey];
    }
    
    try {
      const result = await pool.query(`
        SELECT g.group_name, 
               COALESCE(json_agg(m.member_name ORDER BY m.member_name) FILTER (WHERE m.member_name IS NOT NULL), '[]') as members
        FROM sales_rep_groups g
        LEFT JOIN sales_rep_group_members m ON g.id = m.group_id
        WHERE g.is_active = true AND UPPER(g.division) = $1
        GROUP BY g.id, g.group_name
      `, [divisionCode.toUpperCase()]);
      
      const groups = {};
      result.rows.forEach(row => {
        groups[row.group_name] = row.members || [];
      });
      
      // Update cache
      if (!this.salesRepGroupsCache) this.salesRepGroupsCache = {};
      this.salesRepGroupsCache[cacheKey] = groups;
      this.salesRepGroupsCacheTime = now;
      
      logger.info(`Loaded ${Object.keys(groups).length} sales rep groups for ${divisionCode}`);
      return groups;
    } catch (error) {
      logger.error(`Failed to load sales rep groups for ${divisionCode}:`, error);
      return {};
    }
  }

  /**
   * Build a SQL CASE expression for sales rep → group resolution
   * Maps each member to their group name, standalone reps keep their name
   * 
   * @param {string} divisionCode - Division code
   * @param {string} columnName - Column name containing sales rep name (default: 'salesrepname')
   * @returns {Promise<string>} SQL CASE expression
   */
  static async buildSalesRepGroupSQL(divisionCode, columnName = 'salesrepname') {
    const groups = await this.loadSalesRepGroups(divisionCode);
    
    if (Object.keys(groups).length === 0) {
      // No groups defined - just use trimmed name
      return `TRIM(${columnName})`;
    }
    
    // Build member -> group mapping
    const memberToGroup = {};
    Object.entries(groups).forEach(([groupName, members]) => {
      members.forEach(member => {
        memberToGroup[member.toLowerCase().trim()] = groupName;
      });
    });
    
    if (Object.keys(memberToGroup).length === 0) {
      return `TRIM(${columnName})`;
    }
    
    // Build CASE WHEN expression
    const cases = Object.entries(memberToGroup).map(([member, groupName]) => {
      const escapedMember = member.replace(/'/g, "''");
      const escapedGroup = groupName.replace(/'/g, "''");
      return `WHEN LOWER(TRIM(${columnName})) = '${escapedMember}' THEN '${escapedGroup}'`;
    });
    
    return `CASE ${cases.join(' ')} ELSE TRIM(${columnName}) END`;
  }

  /**
   * Get SQL expression for resolving sales rep name to group name
   * SYNC version using cached data (for backward compatibility)
   * Falls back to just TRIM if cache not loaded
   * 
   * @param {string} columnName - Column name containing sales rep name (default: 'salesrepname')
   * @returns {string} SQL expression that resolves to group name
   */
  static getSalesRepResolutionExpr(columnName = 'salesrepname') {
    // Use cached groups if available
    // Note: For sync access, we need pre-loaded cache
    // The caller should use buildSalesRepGroupSQL for async queries
    return `TRIM(${columnName})`;
  }

  /**
   * Get list of unique group/salesrep names that should be tracked
   * @param {string} divisionCode - Division code
   * @returns {Promise<string[]>} Array of group names (for grouped reps) and individual names (for ungrouped)
   */
  static async getTrackableSalesReps(divisionCode) {
    const groups = await this.loadSalesRepGroups(divisionCode);
    const tables = this.getTableNames(divisionCode);
    
    // Get all distinct sales reps from data
    const result = await pool.query(`
      SELECT DISTINCT TRIM(salesrepname) as name
      FROM ${tables.actualData}
      WHERE salesrepname IS NOT NULL AND TRIM(salesrepname) != ''
    `);
    
    const allReps = result.rows.map(r => r.name);
    
    // Build set of grouped members
    const groupedMembers = new Set();
    Object.values(groups).forEach(members => {
      members.forEach(m => groupedMembers.add(m.toLowerCase().trim()));
    });
    
    // Return: group names + ungrouped individual reps
    const trackable = new Set(Object.keys(groups));
    allReps.forEach(rep => {
      if (!groupedMembers.has(rep.toLowerCase().trim())) {
        trackable.add(rep);
      }
    });
    
    return Array.from(trackable).sort();
  }

  // ===========================================================================
  // CUSTOMER RESOLUTION (Using Division Customer Merge Rules - same as Dashboard)
  // ===========================================================================

  /**
   * Get SQL JOINs for customer merge resolution
   * Returns the JOIN and expression for getting merged customer names
   * Uses the division-prefixed customer merge rules table (e.g., fp_division_customer_merge_rules)
   * 
   * @param {string} divisionCode - Division code
   * @param {string} dataAlias - Alias for the data table (default: 'd')
   * @param {string} customerColumn - Column name containing customer name (default: 'customername')
   */
  static getCustomerMergeSQL(divisionCode, dataAlias = 'd', customerColumn = 'customername') {
    const tables = this.getTableNames(divisionCode);
    
    // Uses the division-prefixed table (e.g., fp_division_customer_merge_rules)
    const join = `
      LEFT JOIN ${tables.customerMergeRules} cmr 
        ON cmr.is_active = true
        AND TRIM(LOWER(${dataAlias}.${customerColumn})) = ANY(
          SELECT TRIM(LOWER(jsonb_array_elements_text(cmr.original_customers)))
        )
    `;
    
    // Expression to get merged customer name
    const mergedCustomerExpr = `COALESCE(cmr.merged_customer_name, TRIM(${dataAlias}.${customerColumn}))`;
    
    return { join, mergedCustomerExpr };
  }

  /**
   * Get SQL for customer merge using subquery (simpler for small datasets)
   */
  static getCustomerMergeSubquerySQL(divisionCode) {
    const tables = this.getTableNames(divisionCode);
    
    return `
      SELECT 
        cmr.merged_customer_name,
        jsonb_array_elements_text(cmr.original_customers) as alias_name
      FROM ${tables.customerMergeRules} cmr
      WHERE cmr.is_active = true
    `;
  }

  /**
   * Build a customer name resolution CASE expression
   * Maps original customer names to merged customer names
   * Uses the division-prefixed customer merge rules table
   * 
   * @param {string} divisionCode - Division code
   * @returns {Promise<string>} SQL CASE expression
   */
  static async buildCustomerResolutionSQL(divisionCode, columnName = 'customername') {
    const tables = this.getTableNames(divisionCode);
    
    try {
      const result = await pool.query(`
        SELECT 
          merged_customer_name,
          jsonb_array_elements_text(original_customers) as alias_name
        FROM ${tables.customerMergeRules}
        WHERE is_active = true AND status = 'ACTIVE'
      `);
      
      if (result.rows.length === 0) {
        logger.info(`No customer merge rules found for ${divisionCode}, using raw names`);
        return `TRIM(${columnName})`;
      }
      
      logger.info(`Loaded ${result.rows.length} customer merge mappings for ${divisionCode}`);
      
      // Build CASE WHEN expression
      const cases = result.rows.map(row => {
        const escapedAlias = row.alias_name.replace(/'/g, "''");
        const escapedMerged = row.merged_customer_name.replace(/'/g, "''");
        return `WHEN LOWER(TRIM(${columnName})) = '${escapedAlias.toLowerCase()}' THEN '${escapedMerged}'`;
      });
      
      return `CASE ${cases.join(' ')} ELSE TRIM(${columnName}) END`;
    } catch (error) {
      logger.error(`Failed to build customer resolution SQL for ${divisionCode}:`, error);
      // Fallback to just trimming
      return `TRIM(${columnName})`;
    }
  }

  // ===========================================================================
  // COMBINED FILTERING
  // ===========================================================================

  /**
   * Get complete SQL for data queries with all 3 filters applied
   * Returns everything needed for a filtered SELECT
   * 
   * @param {string} divisionCode - Division code
   * @param {object} options - { useStrictProductGroups, resolveSalesReps, resolveCustomers }
   * @returns {object} { tables, joins, expressions, filters }
   */
  static async getFullFilteredQuerySQL(divisionCode, options = {}) {
    const {
      useStrictProductGroups = false,
      resolveSalesReps = true,
      resolveCustomers = true
    } = options;
    
    const tables = this.getTableNames(divisionCode);
    let joins = '';
    const expressions = {};
    const filters = [];
    
    // Product group resolution
    if (useStrictProductGroups) {
      const pg = this.getStrictProductGroupSQL(divisionCode);
      joins += pg.joins;
      expressions.productGroup = pg.pgCombineExpr;
      expressions.material = pg.materialExpr;
      expressions.process = pg.processExpr;
      filters.push(pg.filterCondition);
    } else {
      const pg = this.getProductGroupSQL(divisionCode);
      joins += pg.joins;
      expressions.productGroup = pg.pgCombineExpr;
      filters.push(pg.filterCondition);
    }
    
    // Sales rep resolution
    // NOTE: fp_actualcommon uses sales_rep_group_name for reports (aggregated), sales_rep_name for detailed
    if (resolveSalesReps) {
      expressions.salesRep = this.getSalesRepResolutionExpr('d.sales_rep_group_name');
    } else {
      expressions.salesRep = 'TRIM(d.sales_rep_group_name)';
    }
    
    // Customer resolution
    // NOTE: fp_actualcommon uses customer_name column
    if (resolveCustomers) {
      expressions.customer = await this.buildCustomerResolutionSQL(divisionCode, 'd.customer_name');
    } else {
      expressions.customer = 'TRIM(d.customer_name)';
    }
    
    return {
      tables,
      joins,
      expressions,
      filters,
      filterClause: filters.length > 0 ? `AND ${filters.join(' AND ')}` : ''
    };
  }

  // ===========================================================================
  // HELPER QUERIES FOR AI LEARNING
  // ===========================================================================

  /**
   * Get aggregated sales data with all filters applied
   * This is the standard query pattern for AI learning services
   * NOTE: fp_actualcommon uses: pgcombine, sales_rep_group_name, customer_name, country, amount, qty_kgs
   */
  static async getFilteredSalesData(divisionCode, year, month, options = {}) {
    const tables = this.getTableNames(divisionCode);
    const pg = this.getProductGroupSQL(divisionCode);
    
    const query = `
      SELECT 
        ${pg.pgCombineExpr} as product_group,
        d.sales_rep_group_name as salesrep_name,
        d.customer_name,
        d.year,
        d.month,
        d.country as countryname,
        SUM(d.amount) as amount,
        SUM(d.qty_kgs) as kgs,
        0 as morm
      FROM ${tables.actualData} d
      ${pg.joins}
      WHERE d.year = $1
        AND d.month = $2
        ${pg.filterCondition ? 'AND ' + pg.filterCondition : ''}
      GROUP BY 
        ${pg.pgCombineExpr},
        d.sales_rep_group_name,
        d.customer_name,
        d.year,
        d.month,
        d.country
    `;
    
    return await pool.query(query, [year, month]);
  }

  /**
   * Get aggregated data grouped by product group only
   * NOTE: fp_actualcommon uses: pgcombine, amount, qty_kgs, customer_name
   */
  static async getFilteredProductData(divisionCode, year) {
    const tables = this.getTableNames(divisionCode);
    const pg = this.getProductGroupSQL(divisionCode);
    
    const query = `
      SELECT 
        ${pg.pgCombineExpr} as product_group,
        d.year,
        d.month,
        SUM(d.amount) as amount,
        SUM(d.qty_kgs) as kgs,
        COUNT(DISTINCT d.customer_name) as customer_count
      FROM ${tables.actualData} d
      ${pg.joins}
      WHERE d.year = $1
        ${pg.filterCondition ? 'AND ' + pg.filterCondition : ''}
      GROUP BY ${pg.pgCombineExpr}, d.year, d.month
      ORDER BY ${pg.pgCombineExpr}, d.year, d.month
    `;
    
    return await pool.query(query, [year]);
  }

  /**
   * Get aggregated data grouped by sales rep GROUP only
   * NOTE: fp_actualcommon uses: sales_rep_group_name, amount, qty_kgs, customer_name, pgcombine
   */
  static async getFilteredSalesRepData(divisionCode, year, month) {
    const tables = this.getTableNames(divisionCode);
    const pg = this.getProductGroupSQL(divisionCode);
    
    const query = `
      SELECT 
        d.sales_rep_group_name as salesrep_name,
        SUM(d.amount) as total_sales,
        SUM(d.qty_kgs) as total_volume,
        COUNT(DISTINCT d.customer_name) as customer_count,
        COUNT(DISTINCT ${pg.pgCombineExpr}) as product_count
      FROM ${tables.actualData} d
      ${pg.joins}
      WHERE d.year = $1
        AND d.month = $2
        AND d.sales_rep_group_name IS NOT NULL
        ${pg.filterCondition ? 'AND ' + pg.filterCondition : ''}
      GROUP BY d.sales_rep_group_name
    `;
    
    return await pool.query(query, [year, month]);
  }

  /**
   * Get aggregated data grouped by customer only (with merge resolution)
   * NOTE: fp_actualcommon uses: customer_name, sales_rep_group_name, amount, qty_kgs, pgcombine
   */
  static async getFilteredCustomerData(divisionCode, year, month) {
    const tables = this.getTableNames(divisionCode);
    const pg = this.getProductGroupSQL(divisionCode);
    
    const query = `
      SELECT 
        d.customer_name,
        MAX(d.sales_rep_group_name) as salesrep_name,
        SUM(d.amount) as total_sales,
        SUM(d.qty_kgs) as total_volume,
        COUNT(DISTINCT ${pg.pgCombineExpr}) as product_count
      FROM ${tables.actualData} d
      ${pg.joins}
      WHERE d.year = $1
        AND d.month = $2
        AND d.customer_name IS NOT NULL
        ${pg.filterCondition ? 'AND ' + pg.filterCondition : ''}
      GROUP BY d.customer_name
    `;
    
    return await pool.query(query, [year, month]);
  }
}

module.exports = DataFilteringHelper;
