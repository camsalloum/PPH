const { pool } = require('./config');
const { getDivisionPool } = require('../utils/divisionDatabaseManager');
const logger = require('../utils/logger');
const productGroupService = require('../services/productGroupService');
const salesRepGroupsService = require('../services/salesRepGroupsService');

// Budget data uses separate tables starting from this year
const BUDGET_CUTOFF_YEAR = 2025;

/**
 * Helper function to find if a sales rep belongs to a group
 * Returns the group name if found, otherwise null
 */
async function findGroupForSalesRep(salesRepName) {
  if (!salesRepName) return null;
  
  try {
    const groups = await salesRepGroupsService.getGroupsForDivision('FP');
    const normalizedRep = String(salesRepName).trim().toUpperCase();
    
    for (const [groupName, members] of Object.entries(groups)) {
      const normalizedMembers = members.map(m => String(m).trim().toUpperCase());
      if (normalizedMembers.includes(normalizedRep)) {
        logger.debug(`Found group "${groupName}" for sales rep "${salesRepName}"`);
        return groupName; // Return the group name as stored
      }
    }
    return null;
  } catch (error) {
    logger.error(`Error finding group for sales rep "${salesRepName}":`, error);
    return null;
  }
}

class UniversalSalesByCountryService {
  
  /**
   * Get the appropriate database pool for a division
   * Uses division-specific pool for HC, TF, etc., and default pool for FP
   */
  static getPool(division) {
    if (!division || division.toUpperCase() === 'FP') {
      return pool; // Use default FP pool for backwards compatibility
    }
    return getDivisionPool(division.toUpperCase());
  }
  
  // Utility function to convert names to proper case
  static toProperCase(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  }
  
  // Month mapping for period handling
  static monthMapping = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12
  };

  // Quarter and half-year mappings
  static quarterMonths = {
    'Q1': [1, 2, 3],
    'Q2': [4, 5, 6],
    'Q3': [7, 8, 9],
    'Q4': [10, 11, 12]
  };

  static halfYearMonths = {
    'HY1': [1, 2, 3, 4, 5, 6],
    'HY2': [7, 8, 9, 10, 11, 12]
  };

  static fullYearMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  /**
   * ULTRA-FAST method: Get ALL sales rep divisional data in a single optimized SQL query
   * This replaces hundreds of individual queries with ONE super-efficient query
   */
  static async getSalesRepDivisionalUltraFast(division, salesReps, columns) {
    try {
      // Initialize result structure - will be populated from query results
      const ultraFastData = {};
      
      logger.info(`🔍 ULTRA-FAST DIVISIONAL: Processing ${columns.length} columns`);
      
      const divisionPool = this.getPool(division);
      const tableName = this.getTableName(division);
      const budgetTableName = this.getBudgetTableName(division);
      const upperDivision = division.toUpperCase();
      
      // Group columns by type and year to batch queries
      const budgetColumns = [];
      const actualColumns = [];
      const estimateColumns = [];
      
      for (const column of columns) {
        const dataType = (column.type || 'Actual').toUpperCase();
        if (this.shouldUseBudgetTable(column)) {
          budgetColumns.push(column);
        } else if (dataType.includes('ESTIMATE') || dataType.includes('FORECAST')) {
          estimateColumns.push(column);
        } else {
          actualColumns.push(column);
        }
      }
      
      // Build parallel query promises
      const queryPromises = [];
      
      // PARALLEL: Query all Budget columns at once
      // NOTE: Budget query does NOT filter by sales rep - gets ALL sales rep groups
      for (const column of budgetColumns) {
        const monthsArray = this.getMonthsForColumn(column);
        const year = parseInt(column.year);
        const monthPlaceholders = monthsArray.map((_, idx) => `$${3 + idx}`).join(', ');
        
        const budgetQuery = `
          SELECT 
            TRIM(UPPER(sales_rep_group_name)) as salesrepname,
            SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_value 
          FROM ${budgetTableName}
          WHERE UPPER(division_code) = $1
          AND budget_year = $2
          AND UPPER(budget_type) = 'SALES_REP'
          AND is_budget = true
          AND month_no IN (${monthPlaceholders})
          AND sales_rep_group_name IS NOT NULL
          GROUP BY TRIM(UPPER(sales_rep_group_name))
        `;
        
        queryPromises.push(
          divisionPool.query(budgetQuery, [upperDivision, year, ...monthsArray])
            .then(result => ({ type: 'budget', column, rows: result.rows }))
        );
      }
      
      // PARALLEL: Query all Actual columns at once
      // NOTE: Actual query does NOT filter by sales rep - gets ALL sales rep groups
      // This is DIVISIONAL view - we want ALL sales reps grouped by sales_rep_group_name
      for (const column of actualColumns) {
        const monthsArray = this.getMonthsForColumn(column);
        const year = parseInt(column.year);
        const monthPlaceholders = monthsArray.map((_, idx) => `$${3 + idx}`).join(', ');
        
        const actualQuery = `
          SELECT 
            TRIM(UPPER(d.sales_rep_group_name)) as salesrepname,
            SUM(d.amount) as total_value 
          FROM ${tableName} d
          LEFT JOIN fp_product_group_exclusions e
            ON UPPER(TRIM(d.pgcombine)) = UPPER(TRIM(e.product_group))
            AND UPPER(TRIM(e.division_code)) = 'FP'
          WHERE UPPER(d.admin_division_code) = $1
          AND d.year = $2
          AND d.month_no IN (${monthPlaceholders})
          AND e.product_group IS NULL
          AND d.sales_rep_group_name IS NOT NULL
          GROUP BY TRIM(UPPER(d.sales_rep_group_name))
        `;
        
        queryPromises.push(
          divisionPool.query(actualQuery, [upperDivision, year, ...monthsArray])
            .then(result => ({ type: 'actual', column, rows: result.rows }))
        );
      }
      
      // PARALLEL: Query all Estimate columns (both Actual + Estimate parts)
      // NOTE: Does NOT filter by sales rep - gets ALL sales rep groups
      for (const column of estimateColumns) {
        const monthsArray = this.getMonthsForColumn(column);
        const year = parseInt(column.year);
        const monthPlaceholders = monthsArray.map((_, idx) => `$${3 + idx}`).join(', ');
        
        // Actual part - no sales rep filter
        const actualQuery = `
          SELECT 
            TRIM(UPPER(d.sales_rep_group_name)) as salesrepname,
            SUM(d.amount) as total_value 
          FROM ${tableName} d
          LEFT JOIN fp_product_group_exclusions e
            ON UPPER(TRIM(d.pgcombine)) = UPPER(TRIM(e.product_group))
            AND UPPER(TRIM(e.division_code)) = 'FP'
          WHERE UPPER(d.admin_division_code) = $1
          AND d.year = $2
          AND d.month_no IN (${monthPlaceholders})
          AND e.product_group IS NULL
          AND d.sales_rep_group_name IS NOT NULL
          GROUP BY TRIM(UPPER(d.sales_rep_group_name))
        `;
        
        queryPromises.push(
          divisionPool.query(actualQuery, [upperDivision, year, ...monthsArray])
            .then(result => ({ type: 'estimate-actual', column, rows: result.rows }))
        );
        
        // Estimate part from budget table - no sales rep filter
        const budgetMonthPlaceholders = monthsArray.map((_, idx) => `$${3 + idx}`).join(', ');
        
        const estimateQuery = `
          SELECT 
            TRIM(UPPER(sales_rep_group_name)) as salesrepname,
            SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_value 
          FROM ${budgetTableName}
          WHERE UPPER(division_code) = $1
          AND budget_year = $2
          AND UPPER(budget_type) = 'ESTIMATE'
          AND month_no IN (${budgetMonthPlaceholders})
          AND sales_rep_group_name IS NOT NULL
          GROUP BY TRIM(UPPER(sales_rep_group_name))
        `;
        
        queryPromises.push(
          divisionPool.query(estimateQuery, [upperDivision, year, ...monthsArray])
            .then(result => ({ type: 'estimate-budget', column, rows: result.rows }))
        );
      }
      
      // Execute ALL queries in parallel
      logger.info(`🚀 ULTRA-FAST DIVISIONAL: Executing ${queryPromises.length} queries in parallel`);
      const results = await Promise.all(queryPromises);
      logger.info(`⚡ ULTRA-FAST DIVISIONAL: All ${results.length} queries completed`);
      
      // Process results - build ultraFastData from query results (not from input salesReps)
      for (const { type, column, rows } of results) {
        const columnKey = column.columnKey;
        
        rows.forEach(row => {
          const salesRep = row.salesrepname;
          const value = parseFloat(row.total_value) || 0;
          
          // Initialize sales rep if not exists
          if (!ultraFastData[salesRep]) {
            ultraFastData[salesRep] = {};
            columns.forEach(col => { ultraFastData[salesRep][col.columnKey] = 0; });
          }
          
          if (type === 'budget') {
            ultraFastData[salesRep][columnKey] = value;
          } else if (type === 'actual') {
            ultraFastData[salesRep][columnKey] = value;
          } else if (type === 'estimate-actual') {
            // Add to existing value (will combine with estimate-budget)
            ultraFastData[salesRep][columnKey] = (ultraFastData[salesRep][columnKey] || 0) + value;
          } else if (type === 'estimate-budget') {
            // Add estimate portion to existing actual
            ultraFastData[salesRep][columnKey] = (ultraFastData[salesRep][columnKey] || 0) + value;
          }
        });
      }
      
      logger.info(`⚡ ULTRA-FAST DIVISIONAL: Returning data for ${Object.keys(ultraFastData).length} sales rep groups`);
      return ultraFastData;
      
    } catch (error) {
      logger.error('❌ Error in ULTRA-FAST sales rep divisional query:', error);
      throw error;
    }
  }

  /**
   * ULTRA-FAST method: Get ALL sales by customer data with optimized queries
   * Returns data grouped by column key with customer -> value mapping
   */
  static async getSalesByCustomerUltraFast(division, columns) {
    try {
      // Result structure: { columnKey: [{ customer: 'name', value: 123 }, ...] }
      const ultraFastData = {};
      
      // Query each column period separately (same pattern as sales rep)
      for (const column of columns) {
        const monthsArray = this.getMonthsForColumn(column);
        const year = parseInt(column.year);
        const dataType = column.type || 'Actual';
        const columnKey = column.columnKey || `${column.year}-${column.month}-${column.type}`;
        
        // Handle Estimate / Forecast hybrid (combine Actual + Estimate/Forecast)
        const normalizedDataType = dataType.toUpperCase();
        const isEstimateType = normalizedDataType.includes('ESTIMATE') || normalizedDataType.includes('FORECAST');
        const isBudgetType = normalizedDataType === 'BUDGET';
        
        // For Budget type with year >= BUDGET_CUTOFF_YEAR, use fp_budget_unified
        // NOTE: Customer-level budget data is stored with budget_type = 'SALES_REP' (not 'BUDGET')
        // 'BUDGET' type is for divisional totals only, 'SALES_REP' has customer breakdowns
        if (this.shouldUseBudgetTable(column)) {
          const budgetTableName = this.getBudgetTableName(division);
          
          const budgetQuery = `
            SELECT 
              INITCAP(LOWER(MIN(TRIM(customer_name)))) as customername,
              SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_value 
            FROM ${budgetTableName}
            WHERE UPPER(division_code) = $1
            AND budget_year = $2
            AND UPPER(budget_type) = 'SALES_REP'
            AND month_no IN (${monthsArray.map((_, idx) => `$${3 + idx}`).join(', ')})
            AND customer_name IS NOT NULL
            AND TRIM(customer_name) != ''
            GROUP BY LOWER(TRIM(customer_name))
            ORDER BY total_value DESC
          `;
          
          const params = [division.toUpperCase(), year, ...monthsArray];
          
          logger.info(`🚀 Querying BUDGET Sales by Customer for ${columnKey}: year=${year}, months=${monthsArray}`);
          
          const divisionPool = this.getPool(division);
          const result = await divisionPool.query(budgetQuery, params);
          
          logger.info(`⚡ Got ${result.rows.length} customers with BUDGET data for ${columnKey}`);
          
          ultraFastData[columnKey] = result.rows.map(row => ({
            customer: row.customername,
            value: parseFloat(row.total_value) || 0
          }));
          continue;
        }
        
        // Standard Actual/Estimate query - with PG_COMBINE exclusion filter using LEFT JOIN!
        const tableName = this.getTableName(division);
        
        // Step 1: Query ACTUAL data from fp_actualcommon with LEFT JOIN exclusion
        const actualQuery = `
          SELECT 
            INITCAP(LOWER(MIN(TRIM(d.customer_name)))) as customername,
            SUM(d.amount) as total_value 
          FROM ${tableName} d
          LEFT JOIN fp_product_group_exclusions e
            ON UPPER(TRIM(d.pgcombine)) = UPPER(TRIM(e.product_group))
            AND UPPER(TRIM(e.division_code)) = 'FP'
          WHERE UPPER(d.admin_division_code) = $1
          AND d.year = $2
          AND d.month_no IN (${monthsArray.map((_, idx) => `$${3 + idx}`).join(', ')})
          AND e.product_group IS NULL
          AND d.customer_name IS NOT NULL
          AND TRIM(d.customer_name) != ''
          GROUP BY LOWER(TRIM(d.customer_name))
          ORDER BY total_value DESC
        `;
        
        const actualParams = [division.toUpperCase(), year, ...monthsArray];
        
        logger.info(`🚀 Querying ACTUAL Sales by Customer for ${columnKey}: year=${year}, months=${monthsArray}`);
        
        const divisionPool = this.getPool(division);
        const actualResult = await divisionPool.query(actualQuery, actualParams);
        
        logger.info(`⚡ Got ${actualResult.rows.length} customers with ACTUAL data for ${columnKey}`);
        
        // Create a map to combine actual + estimate
        const customerMap = new Map();
        actualResult.rows.forEach(row => {
          customerMap.set(row.customername.toLowerCase(), {
            customer: row.customername,
            value: parseFloat(row.total_value) || 0
          });
        });
        
        // Step 2: If ESTIMATE type, also query ESTIMATE data and ADD to actual
        if (isEstimateType) {
          const budgetTableName = this.getBudgetTableName(division);
          const estimateQuery = `
            SELECT 
              INITCAP(LOWER(MIN(TRIM(customer_name)))) as customername,
              SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_value 
            FROM ${budgetTableName}
            WHERE UPPER(division_code) = $1
            AND budget_year = $2
            AND UPPER(budget_type) = 'ESTIMATE'
            AND month_no IN (${monthsArray.map((_, idx) => `$${3 + idx}`).join(', ')})
            AND customer_name IS NOT NULL
            AND TRIM(customer_name) != ''
            GROUP BY LOWER(TRIM(customer_name))
          `;
          
          const estimateParams = [division.toUpperCase(), year, ...monthsArray];
          
          logger.info(`🚀 Querying ESTIMATE Sales by Customer for ${columnKey}`);
          
          const estimateResult = await divisionPool.query(estimateQuery, estimateParams);
          
          logger.info(`⚡ Got ${estimateResult.rows.length} customers with ESTIMATE data for ${columnKey}`);
          
          // Add estimate data to actual data
          estimateResult.rows.forEach(row => {
            const customerKey = row.customername.toLowerCase();
            const estimateValue = parseFloat(row.total_value) || 0;
            
            if (customerMap.has(customerKey)) {
              customerMap.get(customerKey).value += estimateValue;
            } else {
              customerMap.set(customerKey, {
                customer: row.customername,
                value: estimateValue
              });
            }
          });
        }
        
        // Convert map to array and sort by value descending
        ultraFastData[columnKey] = Array.from(customerMap.values())
          .sort((a, b) => b.value - a.value);
        
        logger.info(`⚡ Final ${columnKey}: ${ultraFastData[columnKey].length} customers (ACTUAL${isEstimateType ? ' + ESTIMATE' : ''})`);
      }
      
      logger.info(`⚡ ULTRA-FAST Processed sales by customer data across ${columns.length} columns`);
      return ultraFastData;
      
    } catch (error) {
      logger.error('❌ Error in ULTRA-FAST sales by customer query:', error);
      throw error;
    }
  }

  /**
   * ULTRA-FAST method: Get ALL sales rep reports data at once
   * Returns data for ALL sales reps across ALL columns in one batch
   */
  static async getSalesRepReportsUltraFast(division, salesReps, columns) {
    try {
      const tableName = this.getTableName(division);
      
      // Result structure: { salesRep: { kgs: {...}, amount: {...}, customers: [...] } }
      const ultraFastData = {};
      
      // Initialize structure for all sales reps
      salesReps.forEach(salesRep => {
        const upperSalesRep = String(salesRep).trim().toUpperCase();
        ultraFastData[upperSalesRep] = {
          kgs: {},
          amount: {},
          morm: {},
          customers: []
        };
        
        // Initialize column data
        columns.forEach(column => {
          const columnKey = column.columnKey;
          ultraFastData[upperSalesRep].kgs[columnKey] = {};
          ultraFastData[upperSalesRep].amount[columnKey] = {};
          ultraFastData[upperSalesRep].morm[columnKey] = {};
        });
      });
      
      // Query each column period separately
      for (const column of columns) {
        const monthsArray = this.getMonthsForColumn(column);
        const year = parseInt(column.year);
        const dataType = column.type || 'Actual';
        const columnKey = column.columnKey;
        
        // Handle Estimate / Forecast hybrid (combine Actual + Estimate/Forecast)
        const normalizedDataType = dataType.toUpperCase();
        const isEstimateType = normalizedDataType.includes('ESTIMATE') || normalizedDataType.includes('FORECAST');
        
        const divisionPool = this.getPool(division);
        
        // For Budget type with year >= BUDGET_CUTOFF_YEAR, use fp_budget_unified
        if (this.shouldUseBudgetTable(column)) {
          const budgetTableName = this.getBudgetTableName(division);
          const salesRepPlaceholders = salesReps.map((_, index) => `$${3 + index}`).join(', ');
          const monthPlaceholders = monthsArray.map((_, idx) => `$${3 + salesReps.length + idx}`).join(', ');
          
          const budgetQuery = `
            SELECT 
              TRIM(UPPER(sales_rep_group_name)) as groupname,
              pgcombine as productgroup,
              customer_name as customername,
              SUM(amount) as amount_value,
              SUM(qty_kgs) as kgs_value,
              SUM(morm) as morm_value
            FROM ${budgetTableName}
            WHERE UPPER(division_code) = $1
            AND budget_year = $2
            AND UPPER(budget_type) = 'SALES_REP'
            AND is_budget = true
            AND TRIM(UPPER(sales_rep_group_name)) IN (${salesRepPlaceholders})
            AND month_no IN (${monthPlaceholders})
            AND sales_rep_group_name IS NOT NULL
            GROUP BY TRIM(UPPER(sales_rep_group_name)), pgcombine, customer_name
          `;
          
          const budgetParams = [
            division.toUpperCase(),
            year,
            ...salesReps.map(rep => String(rep).trim().toUpperCase()),
            ...monthsArray
          ];
          
          logger.info(`🚀 Querying BUDGET sales rep reports for ${columnKey}: year=${year}, months=${monthsArray}`);
          
          const result = await divisionPool.query(budgetQuery, budgetParams);
          
          logger.info(`⚡ Got ${result.rows.length} BUDGET rows for ${columnKey}`);
          
          // Process budget results
          result.rows.forEach(row => {
            const groupName = row.groupname;
            const productGroup = row.productgroup;
            const customer = row.customername;
            const amountValue = parseFloat(row.amount_value) || 0;
            const kgsValue = parseFloat(row.kgs_value) || 0;
            const mormValue = parseFloat(row.morm_value) || 0;
            
            // Add group if doesn't exist
            if (!ultraFastData[groupName]) {
              ultraFastData[groupName] = {
                kgs: {},
                amount: {},
                morm: {},
                customers: []
              };
              columns.forEach(col => {
                ultraFastData[groupName].kgs[col.columnKey] = {};
                ultraFastData[groupName].amount[col.columnKey] = {};
                ultraFastData[groupName].morm[col.columnKey] = {};
              });
            }
            
            // Store KGS
            if (!ultraFastData[groupName].kgs[columnKey][productGroup]) {
              ultraFastData[groupName].kgs[columnKey][productGroup] = 0;
            }
            ultraFastData[groupName].kgs[columnKey][productGroup] += kgsValue;
            
            // Store AMOUNT
            if (!ultraFastData[groupName].amount[columnKey][productGroup]) {
              ultraFastData[groupName].amount[columnKey][productGroup] = 0;
            }
            ultraFastData[groupName].amount[columnKey][productGroup] += amountValue;
            
            // Store MORM
            if (!ultraFastData[groupName].morm[columnKey][productGroup]) {
              ultraFastData[groupName].morm[columnKey][productGroup] = 0;
            }
            ultraFastData[groupName].morm[columnKey][productGroup] += mormValue;
            
            // Track customer data - CRITICAL: Use case-insensitive comparison to prevent duplicates
            if (customer) {
              const normalizedCustomer = String(customer).trim().toUpperCase();
              const existingCustomer = ultraFastData[groupName].customers.find(c => 
                String(c.name).trim().toUpperCase() === normalizedCustomer && c.columnKey === columnKey
              );
              if (existingCustomer) {
                existingCustomer.kgs = (existingCustomer.kgs || 0) + kgsValue;
                existingCustomer.amount = (existingCustomer.amount || 0) + amountValue;
                existingCustomer.morm = (existingCustomer.morm || 0) + mormValue;
              } else {
                ultraFastData[groupName].customers.push({
                  name: customer, // Keep original case for display
                  columnKey,
                  kgs: kgsValue,
                  amount: amountValue,
                  morm: mormValue
                });
              }
            }
          });
          continue; // Skip to next column
        }
        
        // Standard Actual query from fp_actualcommon
        // Build placeholders for sales reps
        const salesRepPlaceholders = salesReps.map((_, index) => `$${index + 1}`).join(', ');
        const monthPlaceholders = monthsArray.map((_, idx) => `$${salesReps.length + 3 + idx}`).join(', ');
        
        // Query ACTUAL data from fp_actualcommon
        // FIXED: d.customer_name not d.customername
        const actualQuery = `
          SELECT 
            TRIM(UPPER(d.sales_rep_group_name)) as salesrepname,
            d.pgcombine as productgroup,
            d.customer_name as customername,
            SUM(d.amount) as amount_value,
            SUM(d.qty_kgs) as kgs_value,
            SUM(d.morm) as morm_value
          FROM ${tableName} d
          WHERE TRIM(UPPER(d.sales_rep_group_name)) IN (${salesRepPlaceholders}) 
          AND UPPER(d.admin_division_code) = $${salesReps.length + 1}
          AND d.year = $${salesReps.length + 2}
          AND d.month_no IN (${monthPlaceholders})
          AND d.sales_rep_group_name IS NOT NULL
          GROUP BY TRIM(UPPER(d.sales_rep_group_name)), d.pgcombine, d.customer_name
        `;
        
        const actualParams = [
          ...salesReps.map(rep => String(rep).trim().toUpperCase()), 
          division.toUpperCase(),
          year, 
          ...monthsArray
        ];
        
        logger.info(`🚀 Querying ACTUAL sales rep reports for ${columnKey}: year=${year}, months=${monthsArray}`);
        
        const actualResult = await divisionPool.query(actualQuery, actualParams);
        
        logger.info(`⚡ Got ${actualResult.rows.length} ACTUAL rows for ${columnKey}`);
        
        // Organize ACTUAL results by sales rep, product group
        actualResult.rows.forEach(row => {
          const salesRep = row.salesrepname;
          const productGroup = row.productgroup;
          const customer = row.customername;
          const amountValue = parseFloat(row.amount_value) || 0;
          const kgsValue = parseFloat(row.kgs_value) || 0;
          const mormValue = parseFloat(row.morm_value) || 0;
          
          if (!ultraFastData[salesRep]) return;
          
          // Store KGS
          if (!ultraFastData[salesRep].kgs[columnKey][productGroup]) {
            ultraFastData[salesRep].kgs[columnKey][productGroup] = 0;
          }
          ultraFastData[salesRep].kgs[columnKey][productGroup] += kgsValue;
          
          // Store AMOUNT
          if (!ultraFastData[salesRep].amount[columnKey][productGroup]) {
            ultraFastData[salesRep].amount[columnKey][productGroup] = 0;
          }
          ultraFastData[salesRep].amount[columnKey][productGroup] += amountValue;
          
          // Store MORM
          if (!ultraFastData[salesRep].morm[columnKey][productGroup]) {
            ultraFastData[salesRep].morm[columnKey][productGroup] = 0;
          }
          ultraFastData[salesRep].morm[columnKey][productGroup] += mormValue;
          
          // Also track customer data - CRITICAL: Use case-insensitive comparison to prevent duplicates
          if (customer) {
            const normalizedCustomer = String(customer).trim().toUpperCase();
            const existingCustomer = ultraFastData[salesRep].customers.find(c => 
              String(c.name).trim().toUpperCase() === normalizedCustomer && c.columnKey === columnKey
            );
            if (existingCustomer) {
              existingCustomer.kgs = (existingCustomer.kgs || 0) + kgsValue;
              existingCustomer.amount = (existingCustomer.amount || 0) + amountValue;
              existingCustomer.morm = (existingCustomer.morm || 0) + mormValue;
            } else {
              ultraFastData[salesRep].customers.push({
                name: customer, // Keep original case for display
                columnKey,
                kgs: kgsValue,
                amount: amountValue,
                morm: mormValue
              });
            }
          }
        });
        
        // If ESTIMATE type, also query from fp_budget_unified and ADD to actual
        if (isEstimateType) {
          const budgetTableName = this.getBudgetTableName(division);
          const budgetMonthPlaceholders = monthsArray.map((_, idx) => `$${3 + salesReps.length + idx}`).join(', ');
          const budgetSalesRepPlaceholders = salesReps.map((_, idx) => `$${3 + idx}`).join(', ');
          
          const estimateQuery = `
            SELECT 
              TRIM(UPPER(sales_rep_group_name)) as salesrepname,
              pgcombine as productgroup,
              customer_name as customername,
              SUM(amount) as amount_value,
              SUM(qty_kgs) as kgs_value,
              SUM(morm) as morm_value
            FROM ${budgetTableName}
            WHERE UPPER(division_code) = $1
            AND budget_year = $2
            AND UPPER(budget_type) = 'ESTIMATE'
            AND TRIM(UPPER(sales_rep_group_name)) IN (${budgetSalesRepPlaceholders})
            AND month_no IN (${budgetMonthPlaceholders})
            AND sales_rep_group_name IS NOT NULL
            GROUP BY TRIM(UPPER(sales_rep_group_name)), pgcombine, customer_name
          `;
          
          const estimateParams = [
            division.toUpperCase(),
            year,
            ...salesReps.map(rep => String(rep).trim().toUpperCase()),
            ...monthsArray
          ];
          
          logger.info(`🚀 Querying ESTIMATE sales rep reports for ${columnKey}`);
          
          const estimateResult = await divisionPool.query(estimateQuery, estimateParams);
          
          logger.info(`⚡ Got ${estimateResult.rows.length} ESTIMATE rows for ${columnKey}`);
          
          // ADD estimate data to actual data
          estimateResult.rows.forEach(row => {
            const salesRep = row.salesrepname;
            const productGroup = row.productgroup;
            const customer = row.customername;
            const amountValue = parseFloat(row.amount_value) || 0;
            const kgsValue = parseFloat(row.kgs_value) || 0;
            const mormValue = parseFloat(row.morm_value) || 0;
            
            if (!ultraFastData[salesRep]) {
              // Add new sales rep if exists in estimate but not in actual
              ultraFastData[salesRep] = {
                kgs: {},
                amount: {},
                morm: {},
                customers: []
              };
              columns.forEach(col => {
                ultraFastData[salesRep].kgs[col.columnKey] = {};
                ultraFastData[salesRep].amount[col.columnKey] = {};
                ultraFastData[salesRep].morm[col.columnKey] = {};
              });
            }
            
            // Add KGS
            if (!ultraFastData[salesRep].kgs[columnKey][productGroup]) {
              ultraFastData[salesRep].kgs[columnKey][productGroup] = 0;
            }
            ultraFastData[salesRep].kgs[columnKey][productGroup] += kgsValue;
            
            // Add AMOUNT
            if (!ultraFastData[salesRep].amount[columnKey][productGroup]) {
              ultraFastData[salesRep].amount[columnKey][productGroup] = 0;
            }
            ultraFastData[salesRep].amount[columnKey][productGroup] += amountValue;
            
            // Add MORM
            if (!ultraFastData[salesRep].morm[columnKey][productGroup]) {
              ultraFastData[salesRep].morm[columnKey][productGroup] = 0;
            }
            ultraFastData[salesRep].morm[columnKey][productGroup] += mormValue;
            
            // Add customer data - CRITICAL: Use case-insensitive comparison to prevent duplicates
            if (customer) {
              const normalizedCustomer = String(customer).trim().toUpperCase();
              const existingCustomer = ultraFastData[salesRep].customers.find(c => 
                String(c.name).trim().toUpperCase() === normalizedCustomer && c.columnKey === columnKey
              );
              if (existingCustomer) {
                existingCustomer.kgs = (existingCustomer.kgs || 0) + kgsValue;
                existingCustomer.amount = (existingCustomer.amount || 0) + amountValue;
                existingCustomer.morm = (existingCustomer.morm || 0) + mormValue;
              } else {
                ultraFastData[salesRep].customers.push({
                  name: customer, // Keep original case for display
                  columnKey,
                  kgs: kgsValue,
                  amount: amountValue,
                  morm: mormValue
                });
              }
            }
          });
        }
      }
      
      logger.info(`⚡ ULTRA-FAST Processed sales rep reports for ${Object.keys(ultraFastData).length} sales reps across ${columns.length} columns`);
      return ultraFastData;
      
    } catch (error) {
      logger.error('❌ Error in ULTRA-FAST sales rep reports query:', error);
      throw error;
    }
  }

  /**
   * Helper method to get months array for a column
   */
  static getMonthsForColumn(column) {
    // PRIORITY 1: Check if column has explicit months array (for custom ranges like Jan-Oct, Nov-Dec)
    if (column.months && Array.isArray(column.months) && column.months.length > 0) {
      // Normalize to numeric month values (handles "January", "Q1", etc.)
      return this.normalizeMonths(column.months);
    }

    // PRIORITY 2: Check for standard period names
    if (column.month === 'Q1') return [1, 2, 3];
    if (column.month === 'Q2') return [4, 5, 6];
    if (column.month === 'Q3') return [7, 8, 9];
    if (column.month === 'Q4') return [10, 11, 12];
    if (column.month === 'HY1') return [1, 2, 3, 4, 5, 6];
    if (column.month === 'HY2') return [7, 8, 9, 10, 11, 12];
    if (column.month === 'Year' || column.month === 'FY') return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

    // PRIORITY 3: Handle month names (e.g., 'January', 'February')
    const monthNum = this.monthMapping[column.month];
    if (monthNum) return [monthNum];
    
    // PRIORITY 4: Handle numeric month strings (e.g., '01', '02', '1', '12')
    const numericMonth = parseInt(column.month, 10);
    if (!isNaN(numericMonth) && numericMonth >= 1 && numericMonth <= 12) {
      return [numericMonth];
    }
    
    // Default to January if nothing matched
    return [1];
  }

  /**
   * Normalize an input array of months/periods into an array of month numbers (1-12)
   * Accepts values like 'January', 'HY1', 'Q1', 1, '1'.
   */
  static normalizeMonths(months) {
    const asArray = Array.isArray(months) ? months : [months];
    const expanded = [];
    for (const m of asArray) {
      if (typeof m === 'number') {
        expanded.push(m);
      } else if (typeof m === 'string') {
        const trimmed = m.trim();
        // Quarter
        if (this.quarterMonths[trimmed]) {
          expanded.push(...this.quarterMonths[trimmed]);
          continue;
        }
        // Half-year
        if (this.halfYearMonths[trimmed]) {
          expanded.push(...this.halfYearMonths[trimmed]);
          continue;
        }
        // Full year keyword (FY or Year)
        if (/^(fy|year)$/i.test(trimmed)) {
          expanded.push(...this.fullYearMonths);
          continue;
        }
        // Month name
        if (this.monthMapping[trimmed]) {
          expanded.push(this.monthMapping[trimmed]);
          continue;
        }
        // Numeric string
        const asNum = Number(trimmed);
        if (!Number.isNaN(asNum) && asNum >= 1 && asNum <= 12) {
          expanded.push(asNum);
          continue;
        }
      }
    }
    // Deduplicate and sort for stable queries
    return Array.from(new Set(expanded)).sort((a, b) => a - b);
  }

  /**
   * Get months array based on period selection
   */
  static getMonthsArray(period) {
    if (period === 'FY' || period === 'Year') {
      return this.fullYearMonths;
    } else if (this.quarterMonths[period]) {
      return this.quarterMonths[period];
    } else if (this.halfYearMonths[period]) {
      return this.halfYearMonths[period];
    } else if (this.monthMapping[period]) {
      return [this.monthMapping[period]];
    } else {
      // Default to full year if period not recognized
      return this.fullYearMonths;
    }
  }

  /**
   * Get excluded product groups from fp_product_group_exclusions table
   * This is the single source of truth for exclusions across all services
   */
  static async getExcludedProductGroups(divisionCode = 'FP') {
    try {
      const result = await pool.query(
        'SELECT product_group FROM fp_product_group_exclusions WHERE UPPER(division_code) = UPPER($1)',
        [divisionCode]
      );
      const excluded = result.rows.map(r => r.product_group);
      if (excluded.length > 0) {
        logger.info(`📋 Dynamic exclusions for ${divisionCode}: ${excluded.join(', ')}`);
      }
      return excluded;
    } catch (e) {
      logger.warn('⚠️ Could not fetch product group exclusions, using defaults:', e.message);
      return ['Raw Materials', 'N/A']; // Fallback defaults
    }
  }

  /**
   * Get table name for a division (dynamic - supports any division)
   * Now returns fp_actualcommon with product group exclusion filtering
   * Uses admin_division_code to get both Oracle FP and BF data
   */
  static getTableName(division) {
    if (!division) {
      throw new Error('Division is required');
    }
    // Use fp_actualcommon directly (not deprecated view)
    // This table is joined with filters in each query
    return 'fp_actualcommon';
  }

  /**
   * Get budget table name for a division
   * Now uses fp_budget_unified instead of legacy {division}_sales_rep_budget
   */
  static getBudgetTableName(division) {
    if (!division) {
      throw new Error('Division is required for budget table');
    }
    // Use unified budget table for all budget types
    return 'fp_budget_unified';
  }

  /**
   * Check if this column should use budget table
   * Supports both object form { type, year } and separate params (dataType, year)
   */
  static shouldUseBudgetTable(columnOrType, yearParam = null) {
    let dataType, year;
    
    if (typeof columnOrType === 'object' && columnOrType !== null) {
      // Object form: { type, year }
      dataType = (columnOrType.type || 'Actual').toUpperCase();
      year = parseInt(columnOrType.year);
    } else {
      // Separate params form: (dataType, year)
      dataType = (columnOrType || 'Actual').toUpperCase();
      year = parseInt(yearParam);
    }
    
    return dataType === 'BUDGET' && year >= BUDGET_CUTOFF_YEAR;
  }

  /**
   * Get countries for a specific division
   */
  static async getCountriesByDivision(division) {
    try {
      const tableName = this.getTableName(division);
      
      const query = `
        SELECT DISTINCT INITCAP(LOWER(TRIM(countryname))) as country, salesrepname
        FROM ${tableName}
        WHERE countryname IS NOT NULL 
        AND TRIM(countryname) != ''
        ORDER BY INITCAP(LOWER(TRIM(countryname)))
      `;
      
      logger.info(`🔍 Executing query: ${query}`);
      const divisionPool = this.getPool(division);
      const result = await divisionPool.query(query);
      logger.info(`📊 Found ${result.rows.length} countries in database`);
      logger.info(`📋 Countries:`, result.rows.map(row => row.country));
      
      return result.rows.map(row => ({
        country: row.country,
        salesrepname: row.salesrepname
      }));
    } catch (error) {
      logger.error(`Error fetching countries for division ${division}:`, error);
      throw error;
    }
  }

  /**
   * Get unique sales reps for a specific division
   */
  static async getSalesRepsByDivision(division) {
    try {
      const tableName = this.getTableName(division);
      
      const query = `
        SELECT DISTINCT salesrepname
        FROM ${tableName}
        WHERE salesrepname IS NOT NULL 
        ORDER BY salesrepname
      `;
      
      logger.info(`🔍 Executing sales reps query: ${query}`);
      const divisionPool = this.getPool(division);
      const result = await divisionPool.query(query);
      logger.info(`📊 Found ${result.rows.length} sales reps in database`);
      
      return result.rows.map(row => this.toProperCase(row.salesrepname));
      
    } catch (error) {
      logger.error(`Error getting sales reps for division ${division}:`, error);
      throw error;
    }
  }

  /**
   * Get sales by country for a specific division, sales rep, year, months (array), and data type
   */
  static async getSalesByCountry(division, salesRep, year, months, dataType = 'Actual', groupMembers = null) {
    try {
      const divisionPool = this.getPool(division);
      
      // Normalize months to numeric values (1-12)
      const monthsArray = this.normalizeMonths(months);
      
      // Check if we should use Budget table
      if (this.shouldUseBudgetTable(dataType, year)) {
        const budgetTableName = this.getBudgetTableName(division);
        if (budgetTableName) {
          logger.info(`getSalesByCountry: Using budget table ${budgetTableName} for year ${year}, type ${dataType}`);
          
          let budgetQuery, budgetParams;
          const monthPlaceholders = monthsArray.map((_, idx) => `$${3 + idx}`).join(', ');

          // Check if salesRep is a group name (even if groupMembers not provided)
          let isGroupName = false;
          if (salesRep && !groupMembers) {
            try {
              const groupCheck = await divisionPool.query(
                `SELECT id FROM sales_rep_groups WHERE group_name = $1 AND division = $2`,
                [salesRep, division.toUpperCase()]
              );
              isGroupName = groupCheck.rows.length > 0;
              if (isGroupName) {
                logger.info(`Detected group name "${salesRep}" - will use sales_rep_group_name filter (budget)`);
              }
            } catch (err) {
              logger.debug('Could not check if salesRep is group name (budget):', err.message);
            }
          }
          
          if (groupMembers && groupMembers.length > 0) {
            // It's a group - for budget data, use sales_rep_group_name (the group name), NOT individual member names
            // salesRep contains the group name like "Riad & Nidal"
            budgetQuery = `
              SELECT INITCAP(LOWER(TRIM(b.country))) as countryname, 
                     SUM(b.amount) as total_value 
              FROM ${budgetTableName} b
              LEFT JOIN fp_product_group_exclusions e
                ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
                AND UPPER(TRIM(e.division_code)) = UPPER($1)
              WHERE UPPER(b.division_code) = UPPER($1)
              AND UPPER(b.budget_type) = 'SALES_REP'
              AND budget_year = $2
              AND month_no IN (${monthPlaceholders})
              AND TRIM(UPPER(b.sales_rep_group_name)) = TRIM(UPPER($${3 + monthsArray.length}))
              AND b.country IS NOT NULL
              AND TRIM(b.country) != ''
              AND e.product_group IS NULL
              GROUP BY INITCAP(LOWER(TRIM(b.country)))
              ORDER BY total_value DESC
            `;
            budgetParams = [division, year, ...monthsArray, salesRep];
          } else if (isGroupName) {
            budgetQuery = `
              SELECT INITCAP(LOWER(TRIM(b.country))) as countryname, 
                     SUM(b.amount) as total_value 
              FROM ${budgetTableName} b
              LEFT JOIN fp_product_group_exclusions e
                ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
                AND UPPER(TRIM(e.division_code)) = UPPER($1)
              WHERE UPPER(b.division_code) = UPPER($1)
              AND UPPER(b.budget_type) = 'SALES_REP'
              AND budget_year = $2
              AND month_no IN (${monthPlaceholders})
              AND b.sales_rep_group_name = $${3 + monthsArray.length}
              AND b.country IS NOT NULL
              AND TRIM(b.country) != ''
              AND e.product_group IS NULL
              GROUP BY INITCAP(LOWER(TRIM(b.country)))
              ORDER BY total_value DESC
            `;
            budgetParams = [division, year, ...monthsArray, salesRep];
          } else if (salesRep && String(salesRep).trim() !== '' && String(salesRep).trim().toUpperCase() !== 'ALL') {
            // Individual sales rep or any other name - for budget data, use sales_rep_group_name
            budgetQuery = `
              SELECT INITCAP(LOWER(TRIM(b.country))) as countryname, 
                     SUM(b.amount) as total_value 
              FROM ${budgetTableName} b
              LEFT JOIN fp_product_group_exclusions e
                ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
                AND UPPER(TRIM(e.division_code)) = UPPER($1)
              WHERE UPPER(b.division_code) = UPPER($1)
              AND UPPER(b.budget_type) = 'SALES_REP'
              AND budget_year = $2
              AND month_no IN (${monthPlaceholders})
              AND TRIM(UPPER(b.sales_rep_group_name)) = TRIM(UPPER($${3 + monthsArray.length}))
              AND b.country IS NOT NULL
              AND TRIM(b.country) != ''
              AND e.product_group IS NULL
              GROUP BY INITCAP(LOWER(TRIM(b.country)))
              ORDER BY total_value DESC
            `;
            budgetParams = [division, year, ...monthsArray, salesRep];
          } else {
            // Aggregate across all sales reps
            budgetQuery = `
              SELECT INITCAP(LOWER(TRIM(b.country))) as countryname, 
                     SUM(b.amount) as total_value 
              FROM ${budgetTableName} b
              LEFT JOIN fp_product_group_exclusions e
                ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
                AND UPPER(TRIM(e.division_code)) = UPPER($1)
              WHERE UPPER(b.division_code) = UPPER($1)
              AND UPPER(b.budget_type) = 'SALES_REP'
              AND budget_year = $2
              AND month_no IN (${monthPlaceholders})
              AND b.country IS NOT NULL
              AND TRIM(b.country) != ''
              AND e.product_group IS NULL
              GROUP BY INITCAP(LOWER(TRIM(b.country)))
              ORDER BY total_value DESC
            `;
            budgetParams = [division, year, ...monthsArray];
          }
          
          const result = await divisionPool.query(budgetQuery, budgetParams);
          return result.rows.map(row => ({
            country: row.countryname,
            value: parseFloat(row.total_value || 0)
          }));
        }
      }
      
      // Standard query from fp_actualcommon - with PG_COMBINE filter!
      const tableName = this.getTableName(division);
      let query, params;
      
      // Handle "Estimate" or "FY Estimate" type - query both Actual and Estimate
      const normalizedDataType = dataType.toUpperCase();
      const isEstimateType = normalizedDataType.includes('ESTIMATE') || normalizedDataType.includes('FORECAST');
      
      // Check if salesRep is a group name (even if groupMembers not provided)
      let isGroupName = false;
      if (salesRep && !groupMembers) {
        try {
          const groupCheck = await divisionPool.query(
            `SELECT id FROM sales_rep_groups WHERE group_name = $1 AND division = $2`,
            [salesRep, division.toUpperCase()]
          );
          isGroupName = groupCheck.rows.length > 0;
          if (isGroupName) {
            logger.info(`Detected group name "${salesRep}" - will use sales_rep_group_name filter`);
          }
        } catch (err) {
          logger.debug('Could not check if salesRep is group name:', err.message);
        }
      }
      
      if ((groupMembers && groupMembers.length > 0) || isGroupName) {
        // It's a group - use sales_rep_group_name
        const monthPlaceholders = monthsArray.map((_, idx) => {
          if (isGroupName) {
            return `$${3 + idx}`;  // salesRep, year, ...months
          } else {
            return `$${groupMembers.length + 2 + idx}`;  // members..., year, ...months
          }
        }).join(', ');
        
        // FIXED: fp_actualcommon has no data_type column (only actual data)
        
        if (isGroupName) {
          // Use sales_rep_group_name directly - FIXED: use country, amount direct column
          const groupNameToUse = salesRep;
          query = `
            SELECT INITCAP(LOWER(TRIM(d.country))) as country_name,
                   COALESCE(mc.region, 'Unassigned') as country_region,
                   SUM(d.amount) as total_value 
            FROM ${tableName} d
            LEFT JOIN master_countries mc
              ON LOWER(TRIM(d.country)) = LOWER(TRIM(mc.country_name))
            LEFT JOIN fp_product_group_exclusions e
              ON UPPER(TRIM(d.pgcombine)) = UPPER(TRIM(e.product_group))
              AND UPPER(TRIM(e.division_code)) = UPPER('${division.toUpperCase()}')
            WHERE d.sales_rep_group_name = $1
            AND UPPER(d.admin_division_code) = '${division.toUpperCase()}'
            AND d.year = $2
            AND d.month_no IN (${monthPlaceholders})
            AND d.country IS NOT NULL
            AND TRIM(d.country) != ''
            AND e.product_group IS NULL
            GROUP BY INITCAP(LOWER(TRIM(d.country))), mc.region
            ORDER BY total_value DESC
          `;
          params = [groupNameToUse, year, ...monthsArray];
        } else if (groupMembers && groupMembers.length > 0) {
          // Use group names for members - UNIFIED: use sales_rep_group_name
          const placeholders = groupMembers.map((_, index) => `$${index + 1}`).join(', ');
          query = `
            SELECT INITCAP(LOWER(TRIM(d.country))) as country_name,
                   COALESCE(mc.region, 'Unassigned') as country_region,
                   SUM(d.amount) as total_value 
            FROM ${tableName} d
            LEFT JOIN master_countries mc
              ON LOWER(TRIM(d.country)) = LOWER(TRIM(mc.country_name))
            LEFT JOIN fp_product_group_exclusions e
              ON UPPER(TRIM(d.pgcombine)) = UPPER(TRIM(e.product_group))
              AND UPPER(TRIM(e.division_code)) = UPPER('${division.toUpperCase()}')
            WHERE TRIM(UPPER(d.sales_rep_group_name)) IN (${placeholders}) 
            AND UPPER(d.admin_division_code) = '${division.toUpperCase()}'
            AND d.year = $${groupMembers.length + 1}
            AND d.month_no IN (${monthPlaceholders})
            AND d.country IS NOT NULL
            AND TRIM(d.country) != ''
            AND e.product_group IS NULL
            GROUP BY INITCAP(LOWER(TRIM(d.country))), mc.region
            ORDER BY total_value DESC
          `;
          params = [...groupMembers.map(n => String(n).trim().toUpperCase()), year, ...monthsArray];
        }
      } else if (salesRep && String(salesRep).trim() !== '' && String(salesRep).trim().toUpperCase() !== 'ALL') {
        // Individual sales rep - UNIFIED: use sales_rep_group_name
        const monthPlaceholders = monthsArray.map((_, idx) => `$${3 + idx}`).join(', ');
        
        query = `
          SELECT INITCAP(LOWER(TRIM(d.country))) as country_name,
                 COALESCE(mc.region, 'Unassigned') as country_region,
                 SUM(d.amount) as total_value 
          FROM ${tableName} d
          LEFT JOIN master_countries mc
            ON LOWER(TRIM(d.country)) = LOWER(TRIM(mc.country_name))
          LEFT JOIN fp_product_group_exclusions e
            ON UPPER(TRIM(d.pgcombine)) = UPPER(TRIM(e.product_group))
            AND UPPER(TRIM(e.division_code)) = UPPER('${division.toUpperCase()}')
          WHERE TRIM(UPPER(d.sales_rep_group_name)) = $1 
          AND UPPER(d.admin_division_code) = '${division.toUpperCase()}'
          AND d.year = $2
          AND d.month_no IN (${monthPlaceholders})
          AND d.country IS NOT NULL
          AND TRIM(d.country) != ''
          AND e.product_group IS NULL
          GROUP BY INITCAP(LOWER(TRIM(d.country))), mc.region
          ORDER BY total_value DESC
        `;
        params = [String(salesRep).trim().toUpperCase(), year, ...monthsArray];
      } else {
        // Aggregate across all sales reps
        const monthPlaceholders = monthsArray.map((_, idx) => `$${2 + idx}`).join(', ');
        
        query = `
          SELECT INITCAP(LOWER(TRIM(d.country))) as country_name,
                 COALESCE(mc.region, 'Unassigned') as country_region,
                 SUM(d.amount) as total_value 
          FROM ${tableName} d
          LEFT JOIN master_countries mc
            ON LOWER(TRIM(d.country)) = LOWER(TRIM(mc.country_name))
          LEFT JOIN fp_product_group_exclusions e
            ON UPPER(TRIM(d.pgcombine)) = UPPER(TRIM(e.product_group))
            AND UPPER(TRIM(e.division_code)) = UPPER('${division.toUpperCase()}')
          WHERE UPPER(d.admin_division_code) = '${division.toUpperCase()}'
          AND d.year = $1
          AND d.month_no IN (${monthPlaceholders})
          AND d.country IS NOT NULL
          AND TRIM(d.country) != ''
          AND e.product_group IS NULL
          GROUP BY INITCAP(LOWER(TRIM(d.country))), mc.region
          ORDER BY total_value DESC
        `;
        params = [year, ...monthsArray];
      }
      
      const result = await divisionPool.query(query, params);
      return result.rows.map(row => ({
        country: row.country_name,
        region: row.country_region || 'Unassigned',
        value: parseFloat(row.total_value || 0)
      }));
    } catch (error) {
      logger.error(`Error fetching sales by country for division ${division}:`, error);
      throw error;
    }
  }

  /**
   * Get total Amount by country for a division and year (ignores months/type) - with PG_COMBINE filter!
   */
  static async getSalesByCountryAmountByYear(division, year) {
    const tableName = this.getTableName(division);
    
    // FIXED: fp_actualcommon uses country column and direct amount column
    const query = `
      SELECT INITCAP(LOWER(TRIM(d.country))) as countryname, SUM(d.amount) AS total_value
      FROM ${tableName} d
      WHERE UPPER(d.admin_division_code) = UPPER($2)
        AND d.year = $1
        AND d.country IS NOT NULL
        AND TRIM(d.country) != ''
      GROUP BY INITCAP(LOWER(TRIM(d.country)))
      ORDER BY total_value DESC
    `;
    const params = [year, division];
    const divisionPool = this.getPool(division);
    const result = await divisionPool.query(query, params);
    return result.rows.map(r => ({ country: r.countryname, value: parseFloat(r.total_value || 0) }));
  }

  /**
   * Get countries for a specific sales rep in a division
   */
  static async getCountriesBySalesRep(division, salesRep, groupMembers = null) {
    try {
      const tableName = this.getTableName(division);
      let query, params;
      
      if (groupMembers && groupMembers.length > 0) {
        // It's a group - get countries for all members
        const placeholders = groupMembers.map((_, index) => `$${index + 1}`).join(', ');
        query = `
          SELECT DISTINCT INITCAP(LOWER(TRIM(countryname))) as country
          FROM ${tableName}
          WHERE salesrepname IN (${placeholders})
          AND division = '${division}'
          AND countryname IS NOT NULL
          AND TRIM(countryname) != ''
          ORDER BY INITCAP(LOWER(TRIM(countryname)))
        `;
        params = groupMembers;
      } else {
        // Individual sales rep
        query = `
          SELECT DISTINCT INITCAP(LOWER(TRIM(countryname))) as country
          FROM ${tableName}
          WHERE salesrepname = $1
          AND division = '${division}'
          AND countryname IS NOT NULL
          AND TRIM(countryname) != ''
          ORDER BY INITCAP(LOWER(TRIM(countryname)))
        `;
        params = [salesRep];
      }
      
      const divisionPool = this.getPool(division);
        const result = await divisionPool.query(query, params);
      return result.rows.map(row => ({
        country: row.country
      }));
    } catch (error) {
      logger.error(`Error fetching countries for sales rep in division ${division}:`, error);
      throw error;
    }
  }

  /**
   * Get sales data for a specific country
   */
  static async getCountrySalesData(division, country, year, months, dataType = 'Actual', valueType = 'KGS') {
    try {
      const tableName = this.getTableName(division);
      const monthsArray = this.normalizeMonths(months);
      
      const monthPlaceholders = monthsArray.map((_, idx) => `$${3 + idx}`).join(', ');
      // FIXED: fp_actualcommon columns - sales_rep_name, customer_name, country, direct value columns
      const valueColumn = valueType === 'KGS' ? 'qty_kgs' : valueType === 'MORM' ? 'morm' : 'amount';
      const query = `
        SELECT 
          d.sales_rep_name,
          d.customer_name,
          d.pgcombine as productgroup,
          d.material,
          d.process,
          SUM(d.${valueColumn}) as total_value
        FROM ${tableName} d
        WHERE d.country = $1
        AND UPPER(d.admin_division_code) = UPPER($2)
        AND d.year = $3
        AND d.month_no IN (${monthPlaceholders})
        AND d.pgcombine IS NOT NULL
        AND LOWER(TRIM(d.pgcombine)) != 'not in pg'
        GROUP BY d.sales_rep_name, d.customer_name, d.pgcombine, d.material, d.process
        ORDER BY total_value DESC
      `;
      
      const params = [country, division, year, ...monthsArray];
      const divisionPool = this.getPool(division);
        const result = await divisionPool.query(query, params);
      
      return result.rows.map(row => ({
        salesRep: row.sales_rep_name,
        customer: row.customer_name,
        productGroup: row.productgroup,
        material: row.material,
        process: row.process,
        value: parseFloat(row.total_value || 0)
      }));
    } catch (error) {
      logger.error(`Error fetching country sales data for division ${division}:`, error);
      throw error;
    }
  }

  /**
   * Get all unique countries from database for a division
   */
  static async getAllCountries(division) {
    try {
      const tableName = this.getTableName(division);
      
      const query = `
        SELECT DISTINCT countryname 
        FROM ${tableName}
        WHERE countryname IS NOT NULL 
        AND TRIM(countryname) != ''
        AND countryname != '(blank)'
        ORDER BY countryname
      `;
      
      const divisionPool = this.getPool(division);
      const result = await divisionPool.query(query);
      return result.rows.map(row => row.countryname);
    } catch (error) {
      logger.error(`Error fetching all countries for division ${division}:`, error);
      throw error;
    }
  }

  /**
   * Get sales reps for a specific division
   */
  static async getSalesRepsByDivision(division) {
    try {
      const tableName = this.getTableName(division);
      
      const query = `
        SELECT DISTINCT salesrepname
        FROM ${tableName}
        WHERE salesrepname IS NOT NULL
        AND TRIM(salesrepname) != ''
        ORDER BY salesrepname
      `;
      
      const divisionPool = this.getPool(division);
      const result = await divisionPool.query(query);
      return result.rows.map(row => row.salesrepname);
    } catch (error) {
      logger.error(`Error fetching sales reps for division ${division}:`, error);
      throw error;
    }
  }

  /**
   * Get summary statistics for a division
   */
  static async getDivisionSummary(division) {
    try {
      const tableName = this.getTableName(division);
      
      const query = `
        SELECT 
          COUNT(*) as total_records,
          COUNT(DISTINCT salesrepname) as unique_sales_reps,
          COUNT(DISTINCT customername) as unique_customers,
          COUNT(DISTINCT countryname) as unique_countries,
          MIN(year) as min_year,
          MAX(year) as max_year,
          SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) as total_kgs,
          SUM(CASE WHEN values_type = 'Amount' THEN values ELSE 0 END) as total_amount
        FROM ${tableName}
      `;
      
      const divisionPool = this.getPool(division);
      const result = await divisionPool.query(query);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error fetching division summary for ${division}:`, error);
      throw error;
    }
  }

  /**
   * Get all unique customers from all customer-containing tables for a division
   * Includes: actualcommon, budget_unified, budget_unified_draft
   */
  static async getAllCustomers(division) {
    try {
      const code = (division || 'FP').split('-')[0].toLowerCase();
      const dataTable = `${code}_actualcommon`;  // Use actualcommon not data_excel
      const budgetTable = `${code}_budget_unified`;
      const draftTable = `${code}_budget_unified_draft`;
      
      const query = `
        SELECT DISTINCT customer as customer
        FROM (
          SELECT customer_name as customer FROM ${dataTable}
          WHERE customer_name IS NOT NULL AND TRIM(customer_name) != ''
          UNION
          SELECT customer_name as customer FROM ${budgetTable}
          WHERE customer_name IS NOT NULL AND TRIM(customer_name) != ''
          UNION
          SELECT customer_name as customer FROM ${draftTable}
          WHERE customer_name IS NOT NULL AND TRIM(customer_name) != ''
        ) all_customers
        ORDER BY customer
      `;
      
      const divisionPool = this.getPool(division);
      const result = await divisionPool.query(query);
      return result.rows.map(row => row.customer);
    } catch (error) {
      logger.error(`Error fetching customers for division ${division}:`, error);
      throw error;
    }
  }

  /**
   * Get customers by sales rep for a specific division
   * UNION: Includes customers from both actual data AND budget-only customers
   */
  static async getCustomersBySalesRep(division, salesRep, groupMembers = null) {
    try {
      const tableName = this.getTableName(division);
      const budgetTableName = 'fp_budget_unified'; // All divisions use same budget table
      let query, params;
      
      // FIXED: fp_actualcommon customer column is 'customer_name' not 'customername'
      const customerColumn = 'customer_name';
      
      // UNIFIED FIX: Always use the salesRep (group name or individual name) directly
      // Since we're querying by sales_rep_group_name column which stores group names, not individual names
      // The groupMembers parameter is now ignored - we use salesRep directly
      query = `
        SELECT DISTINCT customer FROM (
          SELECT ${customerColumn} as customer
          FROM ${tableName}
          WHERE TRIM(UPPER(sales_rep_group_name)) = TRIM(UPPER($1))
          AND UPPER(admin_division_code) = '${division.toUpperCase()}'
          AND ${customerColumn} IS NOT NULL
          AND TRIM(${customerColumn}) != ''
          UNION
          SELECT DISTINCT customer_name as customer
          FROM ${budgetTableName}
          WHERE TRIM(UPPER(sales_rep_group_name)) = TRIM(UPPER($1))
          AND UPPER(TRIM(division_code)) = '${division.toUpperCase()}'
          AND UPPER(budget_type) = 'SALES_REP'
          AND customer_name IS NOT NULL
          AND TRIM(customer_name) != ''
        ) all_customers
        ORDER BY customer
      `;
      params = [salesRep];
      
      const divisionPool = this.getPool(division);
        const result = await divisionPool.query(query, params);
      return result.rows.map(row => row.customer);
    } catch (error) {
      logger.error(`Error fetching customers for sales rep ${salesRep} in division ${division}:`, error);
      throw error;
    }
  }

  /**
   * Get sales by customer for a specific division, sales rep, year, months (array), and data type - with PG_COMBINE filter!
   */
  static async getSalesByCustomer(division, salesRep, year, months, dataType = 'Actual', groupMembers = null, valueType = 'AMOUNT') {
    try {
      const divisionPool = this.getPool(division);
      
      // Check if we should use budget table for Budget data year >= 2025
      if (this.shouldUseBudgetTable(dataType, year)) {
        // Customer-level budget data is stored with budget_type='SALES_REP', not 'BUDGET'
        return await this.getSalesByCustomerFromBudgetTable(division, salesRep, year, months, groupMembers, valueType, divisionPool, 'SALES_REP');
      }
      
      const tableName = this.getTableName(division);
      let query, params;
      
      // Normalize months to numeric values (1-12)
      const monthsArray = this.normalizeMonths(months);
      
      // Handle "Estimate" type - combine Actual + Estimate
      const normalizedDataType = dataType.toUpperCase();
      const isEstimateType = normalizedDataType.includes('ESTIMATE') || normalizedDataType.includes('FORECAST');
      
      // Determine which value column to use based on valueType
      // fp_actualcommon has: amount (AED), qty_kgs (KGS)
      const valueColumn = valueType === 'KGS' ? 'qty_kgs' : 'amount';
      
      // fp_actualcommon only has ACTUAL data, columns: customer_name, sales_rep_name, admin_division_code, month_no, amount, qty_kgs
      // IMPORTANT: sales_rep_group_name in fp_actualcommon stores the GROUP NAME (e.g., "Riad & Nidal"), 
      // NOT individual member names. So we should filter by salesRep (the group name passed to us)
      // All queries use LEFT JOIN exclusion pattern for consistency
      
      // For both groups and individuals, use the salesRep parameter directly (which is the group name)
      if (salesRep && String(salesRep).trim() !== '' && String(salesRep).trim().toUpperCase() !== 'ALL') {
        const monthPlaceholders = monthsArray.map((_, idx) => `$${4 + idx}`).join(', ');
        
        query = `
          SELECT INITCAP(LOWER(MIN(TRIM(d.customer_name)))) as customername, SUM(d.${valueColumn}) as total_value 
          FROM ${tableName} d
          LEFT JOIN fp_product_group_exclusions e
            ON UPPER(TRIM(d.pgcombine)) = UPPER(TRIM(e.product_group))
            AND UPPER(TRIM(e.division_code)) = 'FP'
          WHERE TRIM(UPPER(d.sales_rep_group_name)) = TRIM(UPPER($1))
          AND UPPER(d.admin_division_code) = $2
          AND d.year = $3::INTEGER
          AND d.month_no IN (${monthPlaceholders})
          AND e.product_group IS NULL
          AND d.customer_name IS NOT NULL
          AND TRIM(d.customer_name) != ''
          GROUP BY LOWER(TRIM(d.customer_name))
          ORDER BY total_value DESC
        `;
        params = [salesRep, division.toUpperCase(), year, ...monthsArray];
      } else {
        // All sales reps
        const monthPlaceholders = monthsArray.map((_, idx) => `$${3 + idx}`).join(', ');
        
        query = `
          SELECT INITCAP(LOWER(MIN(TRIM(d.customer_name)))) as customername, SUM(d.${valueColumn}) as total_value 
          FROM ${tableName} d
          LEFT JOIN fp_product_group_exclusions e
            ON UPPER(TRIM(d.pgcombine)) = UPPER(TRIM(e.product_group))
            AND UPPER(TRIM(e.division_code)) = 'FP'
          WHERE UPPER(d.admin_division_code) = $1
          AND d.year = $2::INTEGER
          AND d.month_no IN (${monthPlaceholders})
          AND e.product_group IS NULL
          AND d.customer_name IS NOT NULL
          AND TRIM(d.customer_name) != ''
          GROUP BY LOWER(TRIM(d.customer_name))
          ORDER BY total_value DESC
        `;
        params = [division.toUpperCase(), year, ...monthsArray];
      }
      
      const result = await divisionPool.query(query, params);
      
      // If ESTIMATE type, also fetch from fp_budget_unified and add
      if (isEstimateType) {
        const budgetData = await this.getSalesByCustomerFromBudgetTable(division, salesRep, year, months, groupMembers, valueType, divisionPool, 'ESTIMATE');
        
        // Merge actual + estimate data
        const customerMap = new Map();
        result.rows.forEach(row => {
          customerMap.set(row.customername.toLowerCase(), parseFloat(row.total_value || 0));
        });
        
        budgetData.forEach(item => {
          const key = item.customer.toLowerCase();
          customerMap.set(key, (customerMap.get(key) || 0) + item.value);
        });
        
        return Array.from(customerMap.entries())
          .map(([name, value]) => ({ customer: name, value }))
          .sort((a, b) => b.value - a.value);
      }
      
      return result.rows.map(row => ({
        customer: row.customername,
        value: parseFloat(row.total_value || 0)
      }));
    } catch (error) {
      logger.error(`Error fetching sales by customer for division ${division}:`, error);
      throw error;
    }
  }

  /**
   * Get sales by customer from budget table (fp_budget_unified)
   * Used for Budget data year >= 2025
   */
  static async getSalesByCustomerFromBudgetTable(division, salesRep, year, months, groupMembers, valueType, divisionPool, budgetType = 'BUDGET') {
    try {
      const budgetTableName = this.getBudgetTableName(division);
      const monthsArray = this.normalizeMonths(months);
      
      // Determine which value column to use based on valueType
      // fp_budget_unified has: amount (AED), qty_kgs (KGS)
      const valueColumn = valueType === 'KGS' ? 'qty_kgs' : 'amount';
      
      logger.info(`📊 Fetching ${budgetType} data from ${budgetTableName} for year ${year}, months [${monthsArray.join(', ')}], valueType: ${valueType}, column: ${valueColumn}`);
      
      let query, params;
      
      // UNIFIED: Always use sales_rep_group_name for consistency
      // The fp_budget_unified table stores the GROUP NAME in sales_rep_group_name column
      // So we should use salesRep (the group name) directly, NOT the individual member names
      
      if (salesRep && String(salesRep).trim() !== '' && String(salesRep).trim().toUpperCase() !== 'ALL') {
        // Use the group name (salesRep) to filter - works for both groups and individuals
        const monthPlaceholders = monthsArray.map((_, idx) => `$${5 + idx}`).join(', ');
        
        query = `
          SELECT INITCAP(LOWER(MIN(TRIM(customer_name)))) as customername, SUM(${valueColumn}) as total_value 
          FROM ${budgetTableName}
          WHERE UPPER(division_code) = $1
          AND budget_year = $2
          AND UPPER(budget_type) = $3
          AND TRIM(UPPER(sales_rep_group_name)) = TRIM(UPPER($4))
          AND month_no IN (${monthPlaceholders})
          AND customer_name IS NOT NULL
          AND TRIM(customer_name) != ''
          GROUP BY LOWER(TRIM(customer_name))
          ORDER BY total_value DESC
        `;
        params = [division.toUpperCase(), year, budgetType, salesRep, ...monthsArray];
      } else {
        // All sales reps
        const monthPlaceholders = monthsArray.map((_, idx) => `$${4 + idx}`).join(', ');
        
        query = `
          SELECT INITCAP(LOWER(MIN(TRIM(customer_name)))) as customername, SUM(${valueColumn}) as total_value 
          FROM ${budgetTableName}
          WHERE UPPER(division_code) = $1
          AND budget_year = $2
          AND UPPER(budget_type) = $3
          AND month_no IN (${monthPlaceholders})
          AND customer_name IS NOT NULL
          AND TRIM(customer_name) != ''
          GROUP BY LOWER(TRIM(customer_name))
          ORDER BY total_value DESC
        `;
        params = [division.toUpperCase(), year, budgetType, ...monthsArray];
      }
      
      logger.info(`📋 Budget query: ${query.substring(0, 200)}...`);
      const result = await divisionPool.query(query, params);
      logger.info(`✅ Found ${result.rows.length} customers from budget table`);
      
      return result.rows.map(row => ({
        customer: row.customername,
        value: parseFloat(row.total_value || 0)
      }));
    } catch (error) {
      logger.error(`Error fetching sales by customer from budget table for division ${division}:`, error);
      throw error;
    }
  }

  /**
   * Get customer sales data for a specific customer and period
   */
  static async getCustomerSalesData(division, customer, year, months, dataType = 'Actual', valueType = 'KGS') {
    try {
      const tableName = this.getTableName(division);
      const monthsArray = this.normalizeMonths(months);
      
      const monthPlaceholders = monthsArray.map((_, idx) => `$${4 + idx}`).join(', ');
      // FIXED: fp_actualcommon - use sales_rep_name, customer_name, direct value columns
      const valueColumn = valueType === 'KGS' ? 'qty_kgs' : valueType === 'MORM' ? 'morm' : 'amount';
      const query = `
        SELECT 
          d.sales_rep_name,
          d.customer_name,
          d.pgcombine as productgroup,
          d.material,
          d.process,
          SUM(d.${valueColumn}) as total_value
        FROM ${tableName} d
        WHERE d.customer_name = $1
        AND UPPER(d.admin_division_code) = UPPER($2)
        AND d.year = $3
        AND d.month_no IN (${monthPlaceholders})
        AND d.pgcombine IS NOT NULL
        AND LOWER(TRIM(d.pgcombine)) != 'not in pg'
        GROUP BY d.sales_rep_name, d.customer_name, d.pgcombine, d.material, d.process
        ORDER BY total_value DESC
      `;
      
      const params = [customer, division, parseInt(year), ...monthsArray];
      const divisionPool = this.getPool(division);
        const result = await divisionPool.query(query, params);
      
      return result.rows.map(row => ({
        salesRep: row.sales_rep_name,
        customer: row.customer_name,
        productGroup: row.productgroup,
        material: row.material,
        process: row.process,
        value: parseFloat(row.total_value || 0)
      }));
    } catch (error) {
      logger.error(`Error fetching customer sales data for division ${division}:`, error);
      throw error;
    }
  }

  /**
   * Get customer sales data by value type for a specific sales rep
   */
  static async getCustomerSalesDataByValueType(division, salesRep, customer, valueType, year, month, dataType = 'Actual') {
    try {
      const tableName = this.getTableName(division);
      const monthNum = this.monthMapping[month] || parseInt(month) || 1;

      // Handle "Estimate" or "FY Estimate" type - query both Actual and Estimate
      const normalizedDataType = dataType.toUpperCase();
      const isEstimateType = normalizedDataType.includes('ESTIMATE') || normalizedDataType.includes('FORECAST');

      const typeCondition = isEstimateType
        ? `AND UPPER(type) IN ('ACTUAL', 'ESTIMATE')`
        : `AND UPPER(type) = UPPER($5)`;

      const query = `
        SELECT SUM(values) as total_value
        FROM ${tableName}
        WHERE TRIM(UPPER(salesrepname)) = TRIM(UPPER($1))
        AND customername = $2
        AND year = $3
        AND month = $4
        ${typeCondition}
        AND UPPER(values_type) = UPPER($6)
      `;

      const params = isEstimateType
        ? [salesRep, customer, parseInt(year), monthNum, valueType]
        : [salesRep, customer, parseInt(year), monthNum, dataType, valueType];

      const divisionPool = this.getPool(division);
        const result = await divisionPool.query(query, params);

      return parseFloat(result.rows[0]?.total_value || 0);
    } catch (error) {
      logger.error(`Error fetching customer sales data by value type for division ${division}:`, error);
      throw error;
    }
  }

  /**
   * Get customer sales data for a group of sales reps
   */
  static async getCustomerSalesDataForGroup(division, groupMembers, customer, valueType, year, month, dataType = 'Actual') {
    try {
      const tableName = this.getTableName(division);
      const monthNum = this.monthMapping[month] || parseInt(month) || 1;
      const placeholders = groupMembers.map((_, index) => `$${index + 1}`).join(', ');

      // Handle "Estimate" or "FY Estimate" type - query both Actual and Estimate
      const normalizedDataType = dataType.toUpperCase();
      const isEstimateType = normalizedDataType.includes('ESTIMATE') || normalizedDataType.includes('FORECAST');

      const typeCondition = isEstimateType
        ? `AND UPPER(type) IN ('ACTUAL', 'ESTIMATE')`
        : `AND UPPER(type) = UPPER($${groupMembers.length + 4})`;

      const query = `
        SELECT SUM(values) as total_value
        FROM ${tableName}
        WHERE TRIM(UPPER(salesrepname)) IN (${placeholders})
        AND customername = $${groupMembers.length + 1}
        AND year = $${groupMembers.length + 2}
        AND month = $${groupMembers.length + 3}
        ${typeCondition}
        AND UPPER(values_type) = UPPER($${groupMembers.length + 5})
      `;

      const params = isEstimateType
        ? [
            ...groupMembers.map(n => String(n).trim().toUpperCase()),
            customer,
            parseInt(year),
            monthNum,
            valueType
          ]
        : [
            ...groupMembers.map(n => String(n).trim().toUpperCase()),
            customer,
            parseInt(year),
            monthNum,
            dataType,
            valueType
          ];

      const divisionPool = this.getPool(division);
        const result = await divisionPool.query(query, params);
      return parseFloat(result.rows[0]?.total_value || 0);
    } catch (error) {
      logger.error(`Error fetching customer sales data for group in division ${division}:`, error);
      throw error;
    }
  }

  /**
   * Get all product groups for a division (no sales rep filter)
   */
  static async getProductGroups(division) {
    try {
      const tableName = this.getTableName(division);
      const query = `
        SELECT DISTINCT INITCAP(LOWER(productgroup)) as productgroup
        FROM ${tableName}
        WHERE productgroup IS NOT NULL
        AND TRIM(productgroup) != ''
        ORDER BY productgroup
      `;
      
      const divisionPool = this.getPool(division);
      const result = await divisionPool.query(query);
      return result.rows.map(row => row.productgroup);
    } catch (error) {
      logger.error(`Error fetching all product groups for division ${division}:`, error);
      throw error;
    }
  }

  /**
   * Get product groups for a specific sales rep in a division
   * Uses productGroupService for proper resolution and exclusion filtering
   */
  static async getProductGroupsBySalesRep(division, salesRep, groupMembers = null) {
    try {
      // Delegate to productGroupService for proper resolution
      // UNIFIED FIX: Always use salesRep (group name or individual name) directly
      // Since productGroupService uses sales_rep_group_name column which has group names
      const productGroupService = require('../services/productGroupService');
      return await productGroupService.getProductGroupsBySalesRep(division, [salesRep]);
    } catch (error) {
      logger.error(`Error fetching product groups for sales rep ${salesRep} in division ${division}:`, error);
      throw error;
    }
  }

  /**
   * SUPER-OPTIMIZED: Get sales rep product group data with TRUE batch queries
   * Instead of querying each period separately, this batches ALL periods by year
   * Returns data in format: { "ProductGroup|ValueType|ColumnKey": value }
   */
  static async getSalesRepProductGroupUltraFast(division, salesReps, productGroups, columns) {
    try {
      const startTime = Date.now();
      const tableName = this.getTableName(division);
      const budgetTableName = this.getBudgetTableName(division);
      const ultraFastData = {};
      const divisionPool = this.getPool(division);
      
      // Initialize all combinations to 0
      productGroups.forEach(pg => {
        ['KGS', 'Amount', 'MoRM'].forEach(valueType => {
          columns.forEach(col => {
            const key = `${pg}|${valueType}|${col.columnKey}`;
            ultraFastData[key] = 0;
          });
        });
      });
      
      // Group columns by type (Actual vs Budget) and year
      const actualColumns = [];
      const budgetColumns = [];
      
      columns.forEach(col => {
        const year = parseInt(col.year);
        const dataType = (col.type || 'Actual').toUpperCase();
        const isBudgetType = dataType === 'BUDGET';
        const useBudgetTable = isBudgetType && year >= BUDGET_CUTOFF_YEAR;
        
        if (useBudgetTable) {
          budgetColumns.push({ ...col, year, monthsArray: this.getMonthsForColumn(col) });
        } else {
          actualColumns.push({ ...col, year, monthsArray: this.getMonthsForColumn(col) });
        }
      });
      
      const salesRepPlaceholders = salesReps.map((_, index) => `$${index + 1}`).join(', ');
      const salesRepParams = salesReps.map(rep => String(rep).trim().toUpperCase());
      
      // ============ BATCH ACTUAL DATA QUERY ============
      if (actualColumns.length > 0) {
        const yearGroups = {};
        actualColumns.forEach(col => {
          if (!yearGroups[col.year]) yearGroups[col.year] = [];
          yearGroups[col.year].push(col);
        });
        
        for (const [year, cols] of Object.entries(yearGroups)) {
          const allMonths = new Set();
          cols.forEach(col => col.monthsArray.forEach(m => allMonths.add(m)));
          const monthsArray = Array.from(allMonths).sort((a, b) => a - b);
          
          const monthPlaceholders = monthsArray.map((_, idx) => `$${salesRepParams.length + 3 + idx}`).join(', ');
          
          // Query ALL months for this year, grouped by pgcombine, year, month
          // UNIFIED: Use sales_rep_group_name for consistency - works for both individuals and groups
          const query = `
            SELECT 
              d.pgcombine as productgroup,
              d.year,
              d.month_no,
              SUM(d.qty_kgs) as kgs,
              SUM(d.amount) as amount,
              SUM(d.morm) as morm
            FROM ${tableName} d
            WHERE TRIM(UPPER(d.sales_rep_group_name)) IN (${salesRepPlaceholders}) 
            AND UPPER(d.admin_division_code) = UPPER($${salesRepParams.length + 1})
            AND d.year = $${salesRepParams.length + 2}
            AND d.month_no IN (${monthPlaceholders})
            AND d.pgcombine IS NOT NULL
            AND LOWER(d.pgcombine) != 'not in pg'
            GROUP BY d.pgcombine, d.year, d.month_no
          `;
          
          const params = [...salesRepParams, division, parseInt(year), ...monthsArray];
          const result = await divisionPool.query(query, params);
          
          // Map results back to column keys
          result.rows.forEach(row => {
            const pg = row.productgroup;
            const rowMonth = row.month_no;
            const kgs = parseFloat(row.kgs) || 0;
            const amount = parseFloat(row.amount) || 0;
            const morm = parseFloat(row.morm) || 0;
            
            cols.forEach(col => {
              if (col.monthsArray.includes(rowMonth)) {
                ultraFastData[`${pg}|KGS|${col.columnKey}`] = (ultraFastData[`${pg}|KGS|${col.columnKey}`] || 0) + kgs;
                ultraFastData[`${pg}|Amount|${col.columnKey}`] = (ultraFastData[`${pg}|Amount|${col.columnKey}`] || 0) + amount;
                ultraFastData[`${pg}|MoRM|${col.columnKey}`] = (ultraFastData[`${pg}|MoRM|${col.columnKey}`] || 0) + morm;
              }
            });
          });
          
          logger.info(`⚡ BATCH: ${result.rows.length} actual PG rows for year ${year}, ${cols.length} columns`);
        }
      }
      
      // ============ BATCH BUDGET DATA QUERY ============
      // CRITICAL FIX: Always use salesReps array (which contains individual member names)
      // Do NOT use group name - budget table has individual sales rep names, not group names
      if (budgetColumns.length > 0) {
        const yearGroups = {};
        budgetColumns.forEach(col => {
          if (!yearGroups[col.year]) yearGroups[col.year] = [];
          yearGroups[col.year].push(col);
        });
        
        for (const [year, cols] of Object.entries(yearGroups)) {
          const allMonths = new Set();
          cols.forEach(col => col.monthsArray.forEach(m => allMonths.add(m)));
          const monthsArray = Array.from(allMonths).sort((a, b) => a - b);
          
          // UNIFIED: Use sales_rep_group_name consistently for all budget queries
          // Both 2025 and 2026 have sales_rep_group_name populated
          const monthPlaceholders = monthsArray.map((_, idx) => `$${salesRepParams.length + 2 + idx}`).join(', ');
          const query = `
            SELECT 
              pgcombine as productgroup,
              month_no,
              SUM(qty_kgs) as kgs,
              SUM(amount) as amount,
              SUM(morm) as morm
            FROM fp_budget_unified
            WHERE TRIM(UPPER(sales_rep_group_name)) IN (${salesRepPlaceholders})
            AND budget_year = $${salesRepParams.length + 1}
            AND month_no IN (${monthPlaceholders})
            AND UPPER(budget_type) = 'SALES_REP'
            AND is_budget = true
            AND pgcombine IS NOT NULL
            GROUP BY pgcombine, month_no
          `;
          const params = [...salesRepParams, parseInt(year), ...monthsArray];
          
          const result = await divisionPool.query(query, params);
          
          result.rows.forEach(row => {
            const pg = row.productgroup;
            const rowMonth = row.month_no;
            const kgs = parseFloat(row.kgs) || 0;
            const amount = parseFloat(row.amount) || 0;
            const morm = parseFloat(row.morm) || 0;
            
            cols.forEach(col => {
              if (col.monthsArray.includes(rowMonth)) {
                ultraFastData[`${pg}|KGS|${col.columnKey}`] = (ultraFastData[`${pg}|KGS|${col.columnKey}`] || 0) + kgs;
                ultraFastData[`${pg}|Amount|${col.columnKey}`] = (ultraFastData[`${pg}|Amount|${col.columnKey}`] || 0) + amount;
                ultraFastData[`${pg}|MoRM|${col.columnKey}`] = (ultraFastData[`${pg}|MoRM|${col.columnKey}`] || 0) + morm;
              }
            });
          });
          
          logger.info(`⚡ BATCH: ${result.rows.length} budget PG rows for year ${year}, ${cols.length} columns`);
        }
      }
      
      const duration = Date.now() - startTime;
      logger.info(`✅ SUPER-BATCH Product Group complete: ${Object.keys(ultraFastData).length} data points in ${duration}ms`);
      return ultraFastData;
      
    } catch (error) {
      logger.error('Error in SUPER-BATCH product group query:', { error: error.message });
      throw error;
    }
  }

  /**
   * SUPER-OPTIMIZED: Get customer sales data with TRUE batch queries
   * Instead of querying each period separately (36+ queries), this batches:
   * - All ACTUAL data periods into 1-2 queries (grouped by year)
   * - All BUDGET data periods into 1-2 queries (grouped by year)
   * Returns data in format: { "CustomerName|ColumnKey": value }
   */
  static async getCustomerSalesUltraFast(division, salesReps, customers, columns, valueType = 'KGS') {
    try {
      const startTime = Date.now();
      const tableName = this.getTableName(division);
      const budgetTableName = this.getBudgetTableName(division);
      const ultraFastData = {};
      const divisionPool = this.getPool(division);
      
      // Normalize valueType
      const normalizedValueType = (valueType || 'KGS').toUpperCase();
      const actualValueColumn = normalizedValueType === 'KGS' ? 'qty_kgs' 
        : normalizedValueType === 'MORM' ? 'morm' 
        : 'amount';
      const budgetValueColumn = actualValueColumn;
      
      // Group columns by type (Actual vs Budget) and year for batch queries
      const actualColumns = [];
      const budgetColumns = [];
      
      columns.forEach(col => {
        const year = parseInt(col.year);
        const dataType = (col.type || 'Actual').toUpperCase();
        const isBudgetType = dataType === 'BUDGET';
        const useBudgetTable = isBudgetType && year >= BUDGET_CUTOFF_YEAR;
        
        if (useBudgetTable) {
          budgetColumns.push({ ...col, year, monthsArray: this.getMonthsForColumn(col) });
        } else {
          actualColumns.push({ ...col, year, monthsArray: this.getMonthsForColumn(col) });
        }
      });
      
      const salesRepPlaceholders = salesReps.map((_, index) => `$${index + 1}`).join(', ');
      const salesRepParams = salesReps.map(rep => String(rep).trim().toUpperCase());
      
      // ============ BATCH ACTUAL DATA QUERY ============
      if (actualColumns.length > 0) {
        // Group actual columns by year
        const yearGroups = {};
        actualColumns.forEach(col => {
          if (!yearGroups[col.year]) yearGroups[col.year] = [];
          yearGroups[col.year].push(col);
        });
        
        // Build ONE query per year with all months
        for (const [year, cols] of Object.entries(yearGroups)) {
          // Collect all unique months for this year
          const allMonths = new Set();
          cols.forEach(col => col.monthsArray.forEach(m => allMonths.add(m)));
          const monthsArray = Array.from(allMonths).sort((a, b) => a - b);
          
          const monthPlaceholders = monthsArray.map((_, idx) => `$${salesRepParams.length + 3 + idx}`).join(', ');
          
          // Query ALL months for this year in ONE query, grouped by year, month
          // UNIFIED: Use sales_rep_group_name for consistency
          // FIXED: Use INITCAP to normalize customer name casing
          const query = `
            SELECT 
              INITCAP(LOWER(MIN(TRIM(d.customer_name)))) as customername,
              d.year,
              d.month_no,
              SUM(d.${actualValueColumn}) as total_value 
            FROM ${tableName} d
            LEFT JOIN fp_product_group_exclusions e
              ON UPPER(TRIM(d.pgcombine)) = UPPER(TRIM(e.product_group))
              AND UPPER(TRIM(e.division_code)) = 'FP'
            WHERE TRIM(UPPER(d.sales_rep_group_name)) IN (${salesRepPlaceholders}) 
            AND UPPER(d.admin_division_code) = UPPER($${salesRepParams.length + 1})
            AND d.year = $${salesRepParams.length + 2}
            AND d.month_no IN (${monthPlaceholders})
            AND e.product_group IS NULL
            AND d.customer_name IS NOT NULL
            AND TRIM(d.customer_name) != ''
            GROUP BY LOWER(TRIM(d.customer_name)), d.year, d.month_no
          `;
          
          const params = [...salesRepParams, division, parseInt(year), ...monthsArray];
          const result = await divisionPool.query(query, params);
          
          // Map results back to column keys
          result.rows.forEach(row => {
            const customer = row.customername;
            const rowYear = row.year;
            const rowMonth = row.month_no;
            const value = parseFloat(row.total_value) || 0;
            
            // Find which columns this data point belongs to
            cols.forEach(col => {
              if (col.monthsArray.includes(rowMonth)) {
                const key = `${customer}|${col.columnKey}`;
                ultraFastData[key] = (ultraFastData[key] || 0) + value;
              }
            });
          });
          
          logger.info(`⚡ BATCH: ${result.rows.length} actual customer rows for year ${year}, ${cols.length} columns`);
        }
      }
      
      // ============ BATCH BUDGET DATA QUERY ============
      // UNIFIED: Use sales_rep_group_name consistently for all budget queries
      if (budgetColumns.length > 0) {
        // Group budget columns by year
        const yearGroups = {};
        budgetColumns.forEach(col => {
          if (!yearGroups[col.year]) yearGroups[col.year] = [];
          yearGroups[col.year].push(col);
        });
        
        for (const [year, cols] of Object.entries(yearGroups)) {
          const allMonths = new Set();
          cols.forEach(col => col.monthsArray.forEach(m => allMonths.add(m)));
          const monthsArray = Array.from(allMonths).sort((a, b) => a - b);
          
          // UNIFIED: Use sales_rep_group_name consistently
          // FIXED: Use INITCAP to normalize customer name casing
          const monthPlaceholders = monthsArray.map((_, idx) => `$${salesRepParams.length + 2 + idx}`).join(', ');
          const query = `
            SELECT 
              INITCAP(LOWER(MIN(TRIM(customer_name)))) as customername,
              budget_year as year,
              month_no,
              SUM(${budgetValueColumn}) as total_value 
            FROM ${budgetTableName}
            WHERE TRIM(UPPER(sales_rep_group_name)) IN (${salesRepPlaceholders})
            AND budget_year = $${salesRepParams.length + 1}
            AND month_no IN (${monthPlaceholders})
            AND UPPER(budget_type) = 'SALES_REP'
            AND is_budget = true
            AND customer_name IS NOT NULL
            AND TRIM(customer_name) != ''
            GROUP BY LOWER(TRIM(customer_name)), budget_year, month_no
          `;
          const params = [...salesRepParams, parseInt(year), ...monthsArray];
          
          const result = await divisionPool.query(query, params);
          
          // Map results back to column keys
          result.rows.forEach(row => {
            const customer = row.customername;
            const rowMonth = row.month_no;
            const value = parseFloat(row.total_value) || 0;
            
            cols.forEach(col => {
              if (col.monthsArray.includes(rowMonth)) {
                const key = `${customer}|${col.columnKey}`;
                ultraFastData[key] = (ultraFastData[key] || 0) + value;
              }
            });
          });
          
          logger.info(`⚡ BATCH: ${result.rows.length} budget customer rows for year ${year}, ${cols.length} columns`);
        }
      }
      
      const duration = Date.now() - startTime;
      logger.info(`✅ SUPER-BATCH Customer ${valueType} complete: ${Object.keys(ultraFastData).length} data points in ${duration}ms (was 36+ queries, now 2-4)`);
      return ultraFastData;
      
    } catch (error) {
      logger.error('Error in SUPER-BATCH customer query:', { error: error.message });
      throw error;
    }
  }
}

module.exports = UniversalSalesByCountryService;




