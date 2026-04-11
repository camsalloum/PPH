/**
 * @fileoverview AEBF HTML Budget Routes
 * @module routes/aebf/html-budget
 * @description Handles HTML budget form operations with customer data aggregation and merging
 * 
 * @requires express
 * @requires DivisionMergeRulesService For customer merging logic
 * @requires salesRepBudgetService For saving budget data
 * 
 * @routes
 * - POST /html-budget-customers-all  - Get aggregated customer data for all sales reps
 * - POST /html-budget-customers      - Get customer data for specific sales rep
 * - POST /save-html-budget           - Save HTML budget using saveLiveSalesRepBudget service
 * - POST /export-html-budget-form    - Export HTML budget form (placeholder)
 * - POST /import-budget-html         - Import HTML budget data (placeholder)
 * - GET  /html-budget-actual-years   - Get available actual years
 * 
 * @features
 * - One-time index creation per division (ensureHtmlBudgetIndexes)
 * - Column verification for material, process, uploaded_filename, uploaded_at
 * - Integration with DivisionMergeRulesService for customer merging
 * - Aggregation across multiple sales reps
 * - Automatic table schema management
 * 
 * @validation All routes use express-validator middleware
 * @errorHandling Centralized error handler with database verification
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { cacheMiddleware, CacheTTL, invalidateCache } = require('../../middleware/cache');
const { getPoolForDivision, getTableNames } = require('./shared');
const DivisionMergeRulesService = require('../../database/DivisionMergeRulesService');
const { saveLiveSalesRepBudget } = require('../../services/salesRepBudgetService');
const { asyncHandler, successResponse, ErrorCreators } = require('../../middleware/aebfErrorHandler');
const validationRules = require('../../middleware/aebfValidation');
const { queryLimiter } = require('../../middleware/rateLimiter');

// Track if indexes have been created per division
const htmlBudgetIndexesCreated = new Set();

/**
 * @deprecated - This function was for the old sales_rep_budget table.
 * Now all budget writes go to budget_unified table which has these columns already.
 * Keeping as no-op for backward compatibility until all callers are removed.
 */
async function ensureSalesRepBudgetColumns(division = 'FP') {
  // No-op - budgetUnified table has all required columns
  return;
}

/**
 * Ensure HTML budget indexes exist
 */
async function ensureHtmlBudgetIndexes(division = 'FP') {
  const divisionCode = (division || 'FP').split('-')[0].toUpperCase();
  
  if (htmlBudgetIndexesCreated.has(divisionCode)) return;
  
  try {
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    await divisionPool.query(`
      CREATE INDEX IF NOT EXISTS idx_${divisionCode.toLowerCase()}_html_budget_customers 
      ON public.${tables.actualData}(division, year, type, salesrepname, customername, countryname, productgroup, month) 
      WHERE type = 'Actual' AND values_type = 'KGS';
    `);
    
    await divisionPool.query(`ANALYZE public.${tables.actualData};`);
    
    htmlBudgetIndexesCreated.add(divisionCode);
    logger.info(`✅ HTML Budget indexes created for ${divisionCode}`);
  } catch (error) {
    logger.error(`⚠️ Error creating HTML budget indexes:`, error.message);
  }
}

/**
 * POST /html-budget-customers-all
 * Get aggregated customer actual sales data for all sales reps
 * 
 * @route POST /api/aebf/html-budget-customers-all
 * @body {string} division - Division (FP)
 * @body {number} actualYear - Actual year for data retrieval
 * @body {array} salesReps - Array of sales rep names
 * @returns {object} 200 - Aggregated customer data across all sales reps
 */
router.post('/html-budget-customers-all', queryLimiter, cacheMiddleware({ ttl: CacheTTL.MEDIUM }), validationRules.htmlBudgetCustomersAll, asyncHandler(async (req, res) => {
  const { division, actualYear, salesReps } = req.body;
  
  await ensureHtmlBudgetIndexes(division);
  
  // Helper functions  
  const norm = (s) => (s || '').toString().trim().toLowerCase();
  const toProperCase = (str) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s|[-/])\w/g, (match) => match.toUpperCase());
  };
    
  const mergeRules = await DivisionMergeRulesService.listRules(division);
  const activeMergeRules = mergeRules.filter(r => r.status === 'ACTIVE' && r.is_active === true);
  
  // Build customer merge map
  const customerMergeMap = new Map();
  activeMergeRules.forEach(rule => {
    const mergedName = rule.merged_customer_name;
    const originalCustomers = Array.isArray(rule.original_customers) 
      ? rule.original_customers 
      : (typeof rule.original_customers === 'string' 
          ? JSON.parse(rule.original_customers) 
          : []);
    originalCustomers.forEach(original => {
      customerMergeMap.set(norm(original), mergedName);
    });
  });
    
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  // Query Actual sales data for all sales reps from actualcommon - exclude excluded product groups
  // LEFT JOIN item_group_overrides to apply individual item remaps (for edge cases where pgcombine isn't set)
  // IMPORTANT: Use admin_division_code to include both FP and BF data when querying for FP
  const query = `
    SELECT 
      TRIM(d.sales_rep_name) as salesrep,
      TRIM(d.customer_name) as customer,
      TRIM(d.country) as country,
      COALESCE(igo.pg_combine, d.pgcombine) as productgroup,
      d.month_no as month,
      SUM(d.qty_kgs) / 1000.0 as mt_value,
      SUM(d.amount) as amount_value,
      SUM(d.morm) as morm_value
    FROM public.${tables.actualcommon} d
    LEFT JOIN public.${tables.itemGroupOverrides} igo
      ON LOWER(TRIM(d.item_group_desc)) = LOWER(TRIM(igo.item_group_description))
    LEFT JOIN public.${tables.productGroupExclusions} e
      ON UPPER(TRIM(COALESCE(igo.pg_combine, d.pgcombine))) = UPPER(TRIM(e.product_group))
      AND UPPER(e.division_code) = UPPER($1)
    WHERE UPPER(d.admin_division_code) = UPPER($1)
      AND d.year = $2
      AND TRIM(UPPER(d.sales_rep_name)) = ANY($3::text[])
      AND d.customer_name IS NOT NULL
      AND TRIM(d.customer_name) != ''
      AND d.country IS NOT NULL
      AND TRIM(d.country) != ''
      AND d.pgcombine IS NOT NULL
      AND TRIM(d.pgcombine) != ''
      AND UPPER(TRIM(d.pgcombine)) != 'SERVICES CHARGES'
      AND e.product_group IS NULL
    GROUP BY TRIM(d.sales_rep_name), TRIM(d.customer_name), TRIM(d.country), COALESCE(igo.pg_combine, d.pgcombine), d.month_no
    ORDER BY TRIM(d.sales_rep_name), TRIM(d.customer_name), TRIM(d.country), COALESCE(igo.pg_combine, d.pgcombine), d.month_no
  `;
  
  // Normalize salesReps to uppercase for matching
  const normalizedSalesReps = salesReps.map(sr => (sr || '').toString().trim().toUpperCase());
  
  const result = await divisionPool.query(query, [
    division,
    parseInt(actualYear),
    normalizedSalesReps
  ]);
  
  // Transform to table structure with monthlyActual per salesRep
  const customerMap = {};
  result.rows.forEach(row => {
    const normalizedCustomer = norm(row.customer);
    const displayCustomerName = customerMergeMap.get(normalizedCustomer) || toProperCase(row.customer);
    const displayCountry = toProperCase(row.country);
    // productgroup already contains pg_combine from the query
    const displayProductGroup = row.productgroup;
    // Convert salesRep to Proper Case for consistent display
    const displaySalesRep = toProperCase(row.salesrep);
    
    // Key includes salesRep for "All Sales Reps" mode
    const key = `${displaySalesRep}|${displayCustomerName}|${displayCountry}|${displayProductGroup}`;
    if (!customerMap[key]) {
      customerMap[key] = {
        salesRep: displaySalesRep,
        customer: displayCustomerName,
        country: displayCountry,
        productGroup: displayProductGroup,
        monthlyActual: {},
        monthlyActualAmount: {},
        monthlyActualMorm: {},
      };
    }
    const existingMt = customerMap[key].monthlyActual[row.month] || 0;
    const existingAmount = customerMap[key].monthlyActualAmount[row.month] || 0;
    const existingMorm = customerMap[key].monthlyActualMorm[row.month] || 0;
    customerMap[key].monthlyActual[row.month] = existingMt + (parseFloat(row.mt_value) || 0);
    customerMap[key].monthlyActualAmount[row.month] = existingAmount + (parseFloat(row.amount_value) || 0);
    customerMap[key].monthlyActualMorm[row.month] = existingMorm + (parseFloat(row.morm_value) || 0);
  });
  
  // Convert to array with all 12 months
  let data = Object.values(customerMap).map(item => {
    const monthlyActual = {};
    const monthlyActualAmount = {};
    const monthlyActualMorm = {};
    for (let month = 1; month <= 12; month++) {
      monthlyActual[month] = item.monthlyActual[month] || 0;
      monthlyActualAmount[month] = item.monthlyActualAmount[month] || 0;
      monthlyActualMorm[month] = item.monthlyActualMorm[month] || 0;
    }
    return { ...item, monthlyActual, monthlyActualAmount, monthlyActualMorm };
  });
  
  // Load budget data for ALL sales reps (not filtered by salesReps param)
  // This ensures we show budgets for all reps in the division
  // Uses sales_rep_group_name column (budget data stored with group name only)
  const budgetYear = parseInt(actualYear) + 1;
  logger.info(`📊 Loading budget data for ALL sales reps / ${budgetYear}`);
  
  const budgetQuery = `
    SELECT 
      TRIM(sales_rep_group_name) as salesrep,
      TRIM(customer_name) as customer,
      TRIM(country) as country,
      TRIM(pgcombine) as productgroup,
      month_no as month,
      SUM(qty_kgs) / 1000.0 as mt_value
    FROM ${tables.budgetUnified}
    WHERE UPPER(division_code) = UPPER($1)
      AND budget_year = $2
      AND UPPER(budget_type) = 'SALES_REP'
      AND COALESCE(data_source, 'SALES_REP_IMPORT') = 'SALES_REP_IMPORT'
    GROUP BY TRIM(sales_rep_group_name), TRIM(customer_name), TRIM(country), TRIM(pgcombine), month_no
    ORDER BY TRIM(sales_rep_group_name), TRIM(customer_name), TRIM(country), TRIM(pgcombine), month_no
  `;
  
  const budgetResult = await divisionPool.query(budgetQuery, [division, budgetYear]);
  logger.info(`✅ Found ${budgetResult.rows.length} budget records (all sales reps)`);
  
  // Build budget map and track budget-only customers
  const budgetMap = {};
  const budgetOnlyCustomers = new Set();
  
  budgetResult.rows.forEach(row => {
    // Apply proper case formatting and merge rules to budget data
    const budgetSalesRep = toProperCase(row.salesrep);
    const normalizedCustomer = norm(row.customer);
    const budgetCustomer = customerMergeMap.get(normalizedCustomer) || toProperCase(row.customer);
    const budgetCountry = toProperCase(row.country);
    const budgetProductGroup = toProperCase(row.productgroup);
    
    // Use salesRep|customer|country|productGroup|month format for "All Sales Reps" mode
    // This is the only format needed - frontend handles the lookup
    const keyWithSalesRep = `${budgetSalesRep}|${budgetCustomer}|${budgetCountry}|${budgetProductGroup}|${row.month}`;
    budgetMap[keyWithSalesRep] = (budgetMap[keyWithSalesRep] || 0) + (parseFloat(row.mt_value) || 0);
    
    // Track customer keys for budget-only customers
    const customerKey = `${budgetSalesRep}|${budgetCustomer}|${budgetCountry}|${budgetProductGroup}`;
    budgetOnlyCustomers.add(customerKey);
  });
  
  // Add budget-only customers (those with budget but no actuals)
  budgetOnlyCustomers.forEach(customerKey => {
    const normalizedBudgetKey = customerKey.toLowerCase();
    const exists = data.some(item => {
      const itemKey = `${item.salesRep}|${item.customer}|${item.country}|${item.productGroup}`.toLowerCase();
      return itemKey === normalizedBudgetKey;
    });
    
    if (!exists) {
      const [salesRep, customer, country, productGroup] = customerKey.split('|');
      const monthlyActual = {};
      for (let month = 1; month <= 12; month++) {
        monthlyActual[month] = 0;
      }
      data.push({
        salesRep,
        customer,
        country,
        productGroup,
        monthlyActual,
        monthlyActualAmount: {},
        monthlyActualMorm: {},
      });
    }
  });
  
  // Sort data: alphabetically, but Others second-to-last and Services Charges last
  data.sort((a, b) => {
    const repCompare = (a.salesRep || '').localeCompare(b.salesRep || '');
    if (repCompare !== 0) return repCompare;
    const nameCompare = a.customer.localeCompare(b.customer);
    if (nameCompare !== 0) return nameCompare;
    const countryCompare = a.country.localeCompare(b.country);
    if (countryCompare !== 0) return countryCompare;
    
    // Product group sorting: alphabetical, Others second-to-last, Services Charges last
    const pgA = (a.productGroup || '').toUpperCase();
    const pgB = (b.productGroup || '').toUpperCase();
    const isServicesA = pgA.includes('SERVICE') && pgA.includes('CHARGE');
    const isServicesB = pgB.includes('SERVICE') && pgB.includes('CHARGE');
    const isOthersA = pgA === 'OTHERS' || pgA === 'OTHER';
    const isOthersB = pgB === 'OTHERS' || pgB === 'OTHER';
    
    if (isServicesA && !isServicesB) return 1;
    if (!isServicesA && isServicesB) return -1;
    if (isOthersA && !isOthersB && !isServicesB) return 1;
    if (!isOthersA && isOthersB && !isServicesA) return -1;
    return a.productGroup.localeCompare(b.productGroup);
  });
  
  // Load pricing data
  const pricingYear = parseInt(actualYear);
  const pricingQuery = `
    SELECT 
      TRIM(product_group) as product_group,
      COALESCE(asp_round, 0) as selling_price,
      COALESCE(morm_round, 0) as morm
    FROM ${tables.pricingRounding}
    WHERE UPPER(division) = UPPER($1) AND year = $2
  `;
  const pricingResult = await divisionPool.query(pricingQuery, [division, pricingYear]);
  
  const pricingMap = {};
  pricingResult.rows.forEach(row => {
    pricingMap[row.product_group.toLowerCase()] = {
      sellingPrice: parseFloat(row.selling_price) || 0,
      morm: parseFloat(row.morm) || 0
    };
  });
  
  logger.info(`📊 Total rows in response: ${data.length} (all sales reps combined), pricing: ${Object.keys(pricingMap).length} product groups`);
  
  // Load budget totals from fp_budget_unified (only SALES_REP_IMPORT, excludes BULK_IMPORT)
  const budgetTotalsQuery = `
    SELECT 
      SUM(qty_kgs) as total_kgs,
      SUM(amount) as total_amount,
      SUM(morm) as total_morm
    FROM ${tables.budgetUnified}
    WHERE UPPER(division_code) = UPPER($1)
      AND budget_year = $2
      AND UPPER(budget_type) = 'SALES_REP'
      AND COALESCE(data_source, 'SALES_REP_IMPORT') = 'SALES_REP_IMPORT'
  `;
  const budgetTotalsResult = await divisionPool.query(budgetTotalsQuery, [division, budgetYear]);
  
  const budgetTotals = {
    kgs: parseFloat(budgetTotalsResult.rows[0]?.total_kgs) || 0,
    amount: parseFloat(budgetTotalsResult.rows[0]?.total_amount) || 0,
    morm: parseFloat(budgetTotalsResult.rows[0]?.total_morm) || 0
  };
  logger.info(`📊 Budget totals (from budgetUnified, full): KGS=${budgetTotals.kgs}, Amount=${budgetTotals.amount}, MORM=${budgetTotals.morm}`);
  
  // Return in legacy format for frontend compatibility
  res.json({
    success: true,
    data,
    budgetData: budgetMap,
    pricingData: pricingMap,
    pricingYear,
    actualYear: parseInt(actualYear),
    salesReps,
    isAllSalesReps: true,
    budgetTotals, // Include stored totals for accurate Amount/MORM display
  });
}));

/**
 * POST /html-budget-customers
 * Get customer actual sales data for a specific sales rep
 * Includes merge rules, budget data, and pricing data
 * 
 * @route POST /api/aebf/html-budget-customers
 * @body {string} division - Division (FP)
 * @body {number} actualYear - Actual year for data retrieval
 * @body {string} salesRep - Sales rep name
 * @returns {object} 200 - Customer data with monthlyActual, budgetData, pricingData
 */
router.post('/html-budget-customers', queryLimiter, validationRules.htmlBudgetCustomers, asyncHandler(async (req, res) => {
  const { division, actualYear, salesRep } = req.body;
  
  await ensureHtmlBudgetIndexes(division);
  
  // Helper functions
  const norm = (s) => (s || '').toString().trim().toLowerCase();
  const toProperCase = (str) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s|[-/])\w/g, (match) => match.toUpperCase());
  };
  
  // Check if salesRep is a group (use database-backed service)
  const salesRepGroupsService = require('../../services/salesRepGroupsService');
  
  const isGroup = salesRepGroupsService.isSalesRepGroupSync(division, salesRep);
  const groupMembers = isGroup ? salesRepGroupsService.getGroupMembersSync(division, salesRep) : [];
  const salesRepsToQuery = isGroup 
    ? groupMembers.map(r => r.toString().trim().toUpperCase())
    : [salesRep.toString().trim().toUpperCase()];
  
  // For budget queries, also include the group name itself (budget is saved with group name)
  const budgetSalesRepsToQuery = isGroup
    ? [...salesRepsToQuery, salesRep.toString().trim().toUpperCase()]
    : salesRepsToQuery;
  
  if (salesRepsToQuery.length === 0) {
    return res.json({ success: true, data: [] });
  }
  
  // Fetch merge rules for the division
  const mergeRules = await DivisionMergeRulesService.listRules(division);
  const activeMergeRules = mergeRules.filter(r => r.status === 'ACTIVE' && r.is_active === true);
  
  // Build customer merge map
  const customerMergeMap = new Map();
  activeMergeRules.forEach(rule => {
    const mergedName = rule.merged_customer_name;
    const originalCustomers = Array.isArray(rule.original_customers) 
      ? rule.original_customers 
      : (typeof rule.original_customers === 'string' 
          ? JSON.parse(rule.original_customers) 
          : []);
    originalCustomers.forEach(original => {
      customerMergeMap.set(norm(original), mergedName);
    });
  });
  
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  // Query Actual sales data from actualcommon with KGS, AMOUNT, and MORM - use pgcombine for product group
  // LEFT JOIN item_group_overrides to apply individual item remaps (for edge cases)
  // IMPORTANT: Use admin_division_code to include both FP and BF data when querying for FP
  // FP division in company_info maps to both FP and BF oracle division codes
  const query = `
    SELECT
      TRIM(d.customer_name) as customer,
      TRIM(d.country) as country,
      COALESCE(igo.pg_combine, d.pgcombine) as productgroup,
      d.month_no as month,
      SUM(d.qty_kgs) / 1000.0 as mt_value,
      SUM(d.amount) as amount_value,
      SUM(d.morm) as morm_value
    FROM public.${tables.actualcommon} d
    LEFT JOIN public.${tables.itemGroupOverrides} igo
      ON LOWER(TRIM(d.item_group_desc)) = LOWER(TRIM(igo.item_group_description))
    LEFT JOIN public.${tables.productGroupExclusions} e
      ON UPPER(TRIM(COALESCE(igo.pg_combine, d.pgcombine))) = UPPER(TRIM(e.product_group))
      AND UPPER(e.division_code) = UPPER($1)
    WHERE UPPER(d.admin_division_code) = UPPER($1)
      AND d.year = $2
      AND TRIM(UPPER(d.sales_rep_name)) = ANY($3::text[])
      AND d.customer_name IS NOT NULL AND TRIM(d.customer_name) != ''
      AND d.country IS NOT NULL AND TRIM(d.country) != ''
      AND d.pgcombine IS NOT NULL AND TRIM(d.pgcombine) != ''
      AND UPPER(TRIM(d.pgcombine)) != 'SERVICES CHARGES'
      AND e.product_group IS NULL
    GROUP BY TRIM(d.customer_name), TRIM(d.country), COALESCE(igo.pg_combine, d.pgcombine), d.month_no
    ORDER BY TRIM(d.customer_name), TRIM(d.country), COALESCE(igo.pg_combine, d.pgcombine), d.month_no
  `;
  
  const result = await divisionPool.query(query, [division, parseInt(actualYear), salesRepsToQuery]);
  
  // Transform to table structure with monthlyActual
  const customerMap = {};
  result.rows.forEach(row => {
    const normalizedCustomer = norm(row.customer);
    const displayCustomerName = customerMergeMap.get(normalizedCustomer) || toProperCase(row.customer);
    const displayCountry = toProperCase(row.country);
    // productgroup already contains pg_combine from the query
    const displayProductGroup = row.productgroup;
    
    const key = `${displayCustomerName}|${displayCountry}|${displayProductGroup}`;
    if (!customerMap[key]) {
      customerMap[key] = {
        customer: displayCustomerName,
        country: displayCountry,
        productGroup: displayProductGroup,
        monthlyActual: {},
        monthlyActualAmount: {},
        monthlyActualMorm: {},
      };
    }
    const existingMt = customerMap[key].monthlyActual[row.month] || 0;
    const existingAmount = customerMap[key].monthlyActualAmount[row.month] || 0;
    const existingMorm = customerMap[key].monthlyActualMorm[row.month] || 0;
    customerMap[key].monthlyActual[row.month] = existingMt + (parseFloat(row.mt_value) || 0);
    customerMap[key].monthlyActualAmount[row.month] = existingAmount + (parseFloat(row.amount_value) || 0);
    customerMap[key].monthlyActualMorm[row.month] = existingMorm + (parseFloat(row.morm_value) || 0);
  });
  
  // Convert to array with all 12 months
  const data = Object.values(customerMap).map(item => {
    const monthlyActual = {};
    const monthlyActualAmount = {};
    const monthlyActualMorm = {};
    for (let month = 1; month <= 12; month++) {
      monthlyActual[month] = item.monthlyActual[month] || 0;
      monthlyActualAmount[month] = item.monthlyActualAmount[month] || 0;
      monthlyActualMorm[month] = item.monthlyActualMorm[month] || 0;
    }
    return { ...item, monthlyActual, monthlyActualAmount, monthlyActualMorm };
  });
  
  // Load budget data from budgetUnified table (only SALES_REP_IMPORT, excludes BULK_IMPORT)
  // Uses sales_rep_group_name column (budget data stored with group name only)
  const budgetYear = parseInt(actualYear) + 1;
  const budgetQuery = `
    SELECT 
      TRIM(customer_name) as customer,
      TRIM(country) as country,
      TRIM(pgcombine) as productgroup,
      month_no as month,
      qty_kgs / 1000.0 as mt_value
    FROM ${tables.budgetUnified}
    WHERE UPPER(division_code) = UPPER($1)
      AND budget_year = $2
      AND UPPER(TRIM(sales_rep_group_name)) = ANY($3::text[])
      AND UPPER(budget_type) = 'SALES_REP'
      AND COALESCE(data_source, 'SALES_REP_IMPORT') = 'SALES_REP_IMPORT'
    ORDER BY TRIM(customer_name), TRIM(country), TRIM(pgcombine), month_no
  `;
  
  // Use budgetSalesRepsToQuery which includes group name for budget lookup
  const budgetResult = await divisionPool.query(budgetQuery, [division, budgetYear, budgetSalesRepsToQuery]);
  
  // Build budget map and track budget-only customers
  const budgetMap = {};
  const budgetOnlyCustomers = new Set();
  
  budgetResult.rows.forEach(row => {
    const normalizedCustomer = norm(row.customer);
    const displayCustomerName = customerMergeMap.get(normalizedCustomer) || toProperCase(row.customer);
    const displayCountry = toProperCase(row.country);
    const displayProductGroup = toProperCase(row.productgroup);
    
    const key = `${displayCustomerName}|${displayCountry}|${displayProductGroup}|${row.month}`;
    budgetMap[key] = parseFloat(row.mt_value) || 0;
    budgetOnlyCustomers.add(`${displayCustomerName}|${displayCountry}|${displayProductGroup}`);
  });
  
  // Add budget-only customers to data array
  budgetOnlyCustomers.forEach(customerKey => {
    const normalizedBudgetKey = customerKey.toLowerCase();
    const exists = data.some(item => {
      const itemKey = `${item.customer}|${item.country}|${item.productGroup}`.toLowerCase();
      return itemKey === normalizedBudgetKey;
    });
    
    if (!exists) {
      const [customer, country, productGroup] = customerKey.split('|');
      const monthlyActual = {};
      for (let month = 1; month <= 12; month++) {
        monthlyActual[month] = 0;
      }
      data.push({ customer, country, productGroup, monthlyActual });
    }
  });
  
  // Sort data: alphabetically, but Others second-to-last and Services Charges last
  data.sort((a, b) => {
    const nameCompare = a.customer.localeCompare(b.customer);
    if (nameCompare !== 0) return nameCompare;
    const countryCompare = a.country.localeCompare(b.country);
    if (countryCompare !== 0) return countryCompare;
    
    // Product group sorting: alphabetical, Others second-to-last, Services Charges last
    const pgA = (a.productGroup || '').toUpperCase();
    const pgB = (b.productGroup || '').toUpperCase();
    const isServicesA = pgA.includes('SERVICE') && pgA.includes('CHARGE');
    const isServicesB = pgB.includes('SERVICE') && pgB.includes('CHARGE');
    const isOthersA = pgA === 'OTHERS' || pgA === 'OTHER';
    const isOthersB = pgB === 'OTHERS' || pgB === 'OTHER';
    
    if (isServicesA && !isServicesB) return 1;
    if (!isServicesA && isServicesB) return -1;
    if (isOthersA && !isOthersB && !isServicesB) return 1;
    if (!isOthersA && isOthersB && !isServicesA) return -1;
    return a.productGroup.localeCompare(b.productGroup);
  });
  
  // Load pricing data
  const pricingYear = parseInt(actualYear);
  const pricingQuery = `
    SELECT 
      TRIM(product_group) as product_group,
      COALESCE(asp_round, 0) as selling_price,
      COALESCE(morm_round, 0) as morm
    FROM ${tables.pricingRounding}
    WHERE UPPER(division) = UPPER($1) AND year = $2
  `;
  const pricingResult = await divisionPool.query(pricingQuery, [division, pricingYear]);
  
  const pricingMap = {};
  pricingResult.rows.forEach(row => {
    pricingMap[row.product_group.toLowerCase()] = {
      sellingPrice: parseFloat(row.selling_price) || 0,
      morm: parseFloat(row.morm) || 0
    };
  });
  
  // Load budget totals from fp_budget_unified (only SALES_REP_IMPORT, excludes BULK_IMPORT)
  // Uses sales_rep_group_name column (budget data stored with group name only)
  const budgetTotalsQuery = `
    SELECT 
      SUM(qty_kgs) as total_kgs,
      SUM(amount) as total_amount,
      SUM(morm) as total_morm
    FROM ${tables.budgetUnified}
    WHERE UPPER(division_code) = UPPER($1)
      AND budget_year = $2
      AND UPPER(TRIM(sales_rep_group_name)) = ANY($3::text[])
      AND UPPER(budget_type) = 'SALES_REP'
      AND COALESCE(data_source, 'SALES_REP_IMPORT') = 'SALES_REP_IMPORT'
  `;
  const budgetTotalsResult = await divisionPool.query(budgetTotalsQuery, [division, budgetYear, budgetSalesRepsToQuery]);
  
  const budgetTotals = {
    kgs: parseFloat(budgetTotalsResult.rows[0]?.total_kgs) || 0,
    amount: parseFloat(budgetTotalsResult.rows[0]?.total_amount) || 0,
    morm: parseFloat(budgetTotalsResult.rows[0]?.total_morm) || 0
  };
  
  // Return in legacy format for frontend compatibility
  res.json({
    success: true,
    data,
    budgetData: budgetMap,
    pricingData: pricingMap,
    pricingYear,
    salesRep,
    isGroup: !!isGroup,
    budgetTotals, // Include stored totals for accurate Amount/MORM display
  });
}));

/**
 * POST /save-html-budget
 * Save HTML budget data using saveLiveSalesRepBudget service
 * 
 * @route POST /api/aebf/save-html-budget
 * @body {string} division - Division (FP)
 * @body {number} budgetYear - Budget year
 * @body {string} salesRep - Sales rep name
 * @body {array} budgetData - Array of budget records
 * @returns {object} 200 - Save result with record counts
 */
router.post('/save-html-budget', queryLimiter, validationRules.saveHtmlBudget, asyncHandler(async (req, res) => {
  const { division, budgetYear, salesRep, budgetData } = req.body;
  
  await ensureSalesRepBudgetColumns(division);
  
  const divisionPool = getPoolForDivision(division);
  const result = await saveLiveSalesRepBudget(divisionPool, {
    division,
    budgetYear,
    salesRep,
    records: budgetData
  });
    
    // Invalidate cache after saving
    invalidateCache('aebf:*').catch(err => 
      logger.warn('Cache invalidation warning:', err.message)
    );
    
    // Sync budget unified table (non-blocking)
    divisionPool.query('SELECT refresh_budget_unified_stats()')
      .then(() => {
        logger.info('✅ Budget unified table synced after HTML budget save');
      })
      .catch(err => {
        logger.warn('⚠️ Budget unified sync failed (non-critical):', err.message);
      });
    
    successResponse(res, result);
}));

/**
 * POST /export-html-budget-form
 * Export HTML budget form data - generates interactive HTML file
 * 
 * @route POST /api/aebf/export-html-budget-form
 * @body {string} division - Division (FP)
 * @body {number} actualYear - Actual year (budget year is actualYear + 1)
 * @body {string} salesRep - Sales rep name
 * @body {array} tableData - Table data for export
 * @body {array} customRowsData - Custom rows data
 * @body {object} budgetData - Budget data
 * @body {array} mergedCustomers - Merged customers list
 * @body {array} countries - Countries list
 * @body {array} productGroups - Product groups list
 * @returns {object} 200 - HTML content for download
 */
router.post('/export-html-budget-form', validationRules.htmlBudgetCustomers, asyncHandler(async (req, res) => {
  const { 
    division, 
    actualYear, 
    salesRep,
    tableData = [],
    customRowsData = [],
    budgetData = {},
    mergedCustomers = [],
    countries = [],
    productGroups = [],
    currency = { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' } // Default to AED
  } = req.body;
  
  const budgetYear = actualYear + 1;
  const divisionCode = (division || 'FP').split('-')[0].toUpperCase();
  
  logger.info(`[export-html-budget-form] Generating HTML for ${salesRep}, ${divisionCode}, Budget Year ${budgetYear}`);
  
  // Get pricing data from database
  let pricingData = {};
  try {
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    const pricingResult = await divisionPool.query(`
      SELECT 
        LOWER(TRIM(product_group)) as product_group,
        COALESCE(asp_round, 0) as selling_price,
        COALESCE(morm_round, 0) as morm
      FROM public.${tables.pricingRounding}
      WHERE UPPER(division) = UPPER($1)
        AND year = $2
        AND product_group IS NOT NULL
        AND TRIM(product_group) != ''
    `, [divisionCode, parseInt(actualYear)]);
    
    pricingResult.rows.forEach(row => {
      pricingData[row.product_group] = {
        sellingPrice: parseFloat(row.selling_price) || 0,
        morm: parseFloat(row.morm) || 0
      };
    });
    
    logger.debug(`[export-html-budget-form] Loaded ${Object.keys(pricingData).length} pricing records`);
  } catch (error) {
    logger.warn(`[export-html-budget-form] Could not load pricing data: ${error.message}`);
  }
  
  // Generate the HTML
  const { generateSalesRepHtmlExport } = require('../../utils/salesRepHtmlExport');
  
  const htmlContent = await generateSalesRepHtmlExport({
    division: divisionCode,
    actualYear,
    salesRep,
    tableData,
    customRowsData,
    budgetData,
    mergedCustomers,
    countries,
    productGroups,
    pricingData,
    currency
  });
  
  // Return raw HTML with proper content type for blob download
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${divisionCode}_Budget_${budgetYear}_${salesRep.replace(/[^a-zA-Z0-9]/g, '_')}.html"`);
  res.send(htmlContent);
}));

/**
 * POST /import-budget-html
 * Import HTML budget data - parses HTML file and saves to database
 * Based on original implementation from aebf-legacy.js
 * 
 * @route POST /api/aebf/import-budget-html
 * @body {string} htmlContent - HTML content to parse
 * @body {string} currentDivision - Current selected division for validation
 * @body {string} currentSalesRep - Current selected sales rep for validation (optional)
 * @returns {object} 200 - Import result with record counts and totals
 */
router.post('/import-budget-html', validationRules.importHtmlBudget, asyncHandler(async (req, res) => {
  const { htmlContent, currentDivision, currentSalesRep } = req.body;
  
  logger.info('[import-budget-html] Request received, HTML length: ' + htmlContent.length);
  
  // ============================================================================
  // VALIDATION STEP 0: File Signature Check
  // ============================================================================
  const signaturePattern = /<!--\s*IPD_BUDGET_SYSTEM_v[\d.]+\s*::\s*TYPE=(SALES_REP_BUDGET|DIVISIONAL_BUDGET)\s*::/;
  const signatureMatch = htmlContent.match(signaturePattern);
  
  if (!signatureMatch) {
    logger.warn('[import-budget-html] File missing IPD Budget System signature - may be legacy or modified file');
  } else if (signatureMatch[1] !== 'SALES_REP_BUDGET') {
    throw ErrorCreators.validationError('Wrong file type. This appears to be a Divisional Budget file. Please use the Divisional Budget import instead.');
  } else {
    logger.info('[import-budget-html] Valid IPD Budget System signature detected');
  }
  
  // ============================================================================
  // VALIDATION STEP 1: Extract and Parse Data from savedBudgetData script
  // ============================================================================
  let metadata = null;
  let budgetData = null;
  
  // Look for <script id="savedBudgetData"> containing budgetMetadata and savedBudget
  const scriptTagMatch = htmlContent.match(/<script[^>]*id=["']savedBudgetData["'][^>]*>([\s\S]*?)<\/script>/i);
  
  if (scriptTagMatch && scriptTagMatch[1]) {
    const scriptContent = scriptTagMatch[1];
    
    // Extract budgetMetadata and savedBudget from the script content
    const metaMatch = scriptContent.match(/const\s+budgetMetadata\s*=\s*(\{[\s\S]*?\});/);
    const dataMatch = scriptContent.match(/const\s+savedBudget\s*=\s*(\[[\s\S]*?\]);/);
    
    if (metaMatch && dataMatch) {
      try {
        metadata = JSON.parse(metaMatch[1]);
      } catch (e) {
        logger.error('[import-budget-html] Failed to parse budgetMetadata:', e.message);
        throw ErrorCreators.validationError('Failed to parse budget metadata from file.');
      }
      
      try {
        budgetData = JSON.parse(dataMatch[1]);
      } catch (e) {
        logger.error('[import-budget-html] Failed to parse savedBudget:', e.message);
        throw ErrorCreators.validationError('Failed to parse budget data from file.');
      }
    }
  }
  
  // Fallback: try older format without script id
  if (!metadata || !budgetData) {
    const metadataMatch = htmlContent.match(/const budgetMetadata = (\{[\s\S]*?\});/);
    const budgetDataMatch = htmlContent.match(/const savedBudget = (\[[\s\S]*?\]);/);
    
    if (metadataMatch && budgetDataMatch) {
      try {
        metadata = JSON.parse(metadataMatch[1]);
        budgetData = JSON.parse(budgetDataMatch[1]);
      } catch (e) {
        logger.error('[import-budget-html] Failed to parse fallback format:', e.message);
      }
    }
  }
  
  if (!metadata || !budgetData) {
    throw ErrorCreators.validationError('Invalid HTML file format. Missing budget metadata or saved budget data. Please re-export using the in-app "Save Final" button.');
  }
  
  logger.info('[import-budget-html] Parsed metadata:', { division: metadata.division, salesRep: metadata.salesRep, budgetYear: metadata.budgetYear });
  logger.info('[import-budget-html] Budget records count:', budgetData.length);
  
  // ============================================================================
  // VALIDATION STEP 2: Division Mismatch Check
  // ============================================================================
  if (currentDivision && metadata.division) {
    const currentDivisionNormalized = currentDivision.trim().toUpperCase();
    const fileDivisionNormalized = metadata.division.trim().toUpperCase();
    
    if (currentDivisionNormalized !== fileDivisionNormalized) {
      throw ErrorCreators.validationError(
        `Division Mismatch!\n\nYou are in division: ${currentDivision}\nBut this file is for: ${metadata.division}\n\nPlease switch to the correct division and try again.`
      );
    }
  }
  
  // ============================================================================
  // VALIDATION STEP 3: Check for Draft File
  // ============================================================================
  const draftCheck = htmlContent.match(/const draftMetadata = ({[^;]+});/);
  if (draftCheck) {
    try {
      const draftMeta = JSON.parse(draftCheck[1]);
      if (draftMeta.isDraft === true) {
        throw ErrorCreators.validationError('Cannot upload draft file! This is a work-in-progress draft. Please open the file, complete your budget, and click "Save Final" before uploading.');
      }
    } catch (e) {
      if (e.message.includes('Cannot upload draft')) throw e;
      logger.debug('[import-budget-html] Draft check parse error (ignored):', e.message);
    }
  }
  
  // ============================================================================
  // VALIDATION STEP 4: Validate Metadata Structure
  // ============================================================================
  const validationErrors = [];
  
  if (!metadata.division || typeof metadata.division !== 'string') {
    validationErrors.push('Invalid or missing division');
  }
  if (!metadata.salesRep || typeof metadata.salesRep !== 'string') {
    validationErrors.push('Invalid or missing sales rep name');
  }
  if (!metadata.budgetYear || typeof metadata.budgetYear !== 'number' || metadata.budgetYear < 2020 || metadata.budgetYear > 2100) {
    validationErrors.push('Invalid or missing budget year (must be between 2020-2100)');
  }
  // Accept both v1.0 and v1.1 (v1.1 adds currency support)
  if (!metadata.version || !['1.0', '1.1'].includes(metadata.version)) {
    validationErrors.push('Unsupported file version. Please re-export from the system.');
  }
  if (!metadata.dataFormat || metadata.dataFormat !== 'budget_import') {
    validationErrors.push('Invalid data format. This file may not be a budget export.');
  }
  
  // Extract currency info (default to AED for v1.0 files)
  const fileCurrency = metadata.currency || { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' };
  logger.info('[import-budget-html] File currency:', fileCurrency.code);
  
  if (validationErrors.length > 0) {
    throw ErrorCreators.validationError('File validation failed:\n' + validationErrors.join('\n'));
  }
  
  // ============================================================================
  // VALIDATION STEP 5: Validate Budget Data Structure
  // ============================================================================
  if (!Array.isArray(budgetData)) {
    throw ErrorCreators.validationError('Invalid budget data format. Expected an array of records.');
  }
  if (budgetData.length === 0) {
    throw ErrorCreators.validationError('No budget data found in file. The file appears to be empty.');
  }
  if (budgetData.length > 10000) {
    throw ErrorCreators.validationError(`Too many records (${budgetData.length}). Maximum allowed is 10,000.`);
  }
  
  // ============================================================================
  // VALIDATION STEP 6: Validate Individual Records
  // ============================================================================
  const recordErrors = [];
  const validRecords = [];
  
  // Helper function to check for placeholder/invalid customer names
  const isInvalidCustomerName = (customer) => {
    if (!customer || typeof customer !== 'string') return true;
    const normalized = customer.trim().toLowerCase();
    if (!normalized) return true;
    const invalidPatterns = [
      'select customer', 'select', 'customer', 'choose customer', 
      'new customer', 'type or select', 'enter customer', 'add customer'
    ];
    if (invalidPatterns.includes(normalized)) return true;
    if (normalized.startsWith('select')) return true;
    return false;
  };
  
  budgetData.forEach((record, index) => {
    const errors = [];
    
    if (!record.customer || typeof record.customer !== 'string' || record.customer.trim() === '') {
      errors.push('Missing or invalid customer name');
    } else if (isInvalidCustomerName(record.customer)) {
      errors.push(`Invalid customer name "${record.customer}" - please enter a real customer name, not a placeholder`);
    }
    if (!record.country || typeof record.country !== 'string' || record.country.trim() === '') {
      errors.push('Missing or invalid country');
    }
    if (!record.productGroup || typeof record.productGroup !== 'string' || record.productGroup.trim() === '') {
      errors.push('Missing or invalid product group');
    }
    if (!record.month || typeof record.month !== 'number' || record.month < 1 || record.month > 12) {
      errors.push('Invalid month (must be 1-12)');
    }
    if (record.value === undefined || record.value === null) {
      errors.push('Missing value');
    } else if (typeof record.value !== 'number' || isNaN(record.value)) {
      errors.push('Invalid value (must be a number)');
    } else if (record.value < 0) {
      errors.push('Negative values not allowed');
    } else if (record.value === 0) {
      errors.push('Zero values not allowed');
    } else if (record.value > 1000000000) {
      errors.push('Value too large (max 1 billion KGS)');
    }
    
    if (errors.length > 0) {
      recordErrors.push({ index: index + 1, customer: record.customer || 'Unknown', month: record.month || 'Unknown', errors });
    } else {
      validRecords.push(record);
    }
  });
  
  // If more than 10% of records have errors, reject the file
  const errorRate = recordErrors.length / budgetData.length;
  if (errorRate > 0.1) {
    throw ErrorCreators.validationError(`Too many invalid records (${recordErrors.length} out of ${budgetData.length}). Please check your file and try again.`);
  }
  
  if (recordErrors.length > 0) {
    logger.warn(`[import-budget-html] Skipping ${recordErrors.length} invalid records out of ${budgetData.length}`);
  }
  
  logger.info(`[import-budget-html] Validation passed: ${validRecords.length} valid records`);
  
  // ============================================================================
  // Save to Database
  // ============================================================================
  await ensureSalesRepBudgetColumns(metadata.division);
  
  const divisionPool = getPoolForDivision(metadata.division);
  const tables = getTableNames(metadata.division);
  
  // ============================================================================
  // VALIDATION STEP 7: Compare against Management Allocation targets
  // ============================================================================
  const allocationWarnings = [];
  
  try {
    // Get Management Allocation targets (BULK_IMPORT data) for this sales rep
    // Uses sales_rep_group_name column (budget data stored with group name only)
    const allocationQuery = `
      SELECT UPPER(TRIM(pgcombine)) as product_group, SUM(qty_kgs) as target_kgs
      FROM ${tables.budgetUnified}
      WHERE UPPER(sales_rep_group_name) = UPPER($1)
        AND budget_year = $2
        AND is_budget = true
        AND data_source = 'BULK_IMPORT'
      GROUP BY UPPER(TRIM(pgcombine))
    `;
    
    const allocationResult = await divisionPool.query(allocationQuery, [metadata.salesRep, metadata.budgetYear]);
    
    if (allocationResult.rows.length > 0) {
      // Build map of allocation targets per product group
      const targetMap = {};
      allocationResult.rows.forEach(row => {
        targetMap[row.product_group] = parseFloat(row.target_kgs) || 0;
      });
      
      // Calculate import totals per product group
      const importTotals = {};
      validRecords.forEach(record => {
        const pg = (record.productGroup || '').toUpperCase().trim();
        importTotals[pg] = (importTotals[pg] || 0) + (record.value || 0);
      });
      
      // Compare import totals vs targets
      const allProductGroups = new Set([...Object.keys(targetMap), ...Object.keys(importTotals)]);
      
      for (const pg of allProductGroups) {
        const target = targetMap[pg] || 0;
        const imported = importTotals[pg] || 0;
        
        if (target > 0 && Math.abs(imported - target) > 0.5) { // Allow 0.5 KGS tolerance
          const diffKgs = imported - target;
          const diffMT = (diffKgs / 1000).toFixed(3);
          const diffPct = ((diffKgs / target) * 100).toFixed(1);
          
          if (imported === 0) {
            allocationWarnings.push({
              productGroup: pg,
              type: 'MISSING',
              message: `Product group "${pg}" has allocation target of ${(target/1000).toFixed(3)} MT but no data was imported`
            });
          } else if (imported < target) {
            allocationWarnings.push({
              productGroup: pg,
              type: 'UNDER',
              message: `Product group "${pg}" is ${Math.abs(diffMT)} MT UNDER allocation target (Imported: ${(imported/1000).toFixed(3)} MT, Target: ${(target/1000).toFixed(3)} MT, ${Math.abs(diffPct)}% short)`
            });
          } else if (imported > target) {
            allocationWarnings.push({
              productGroup: pg,
              type: 'OVER',
              message: `Product group "${pg}" is ${diffMT} MT OVER allocation target (Imported: ${(imported/1000).toFixed(3)} MT, Target: ${(target/1000).toFixed(3)} MT, ${diffPct}% over)`
            });
          }
        }
      }
      
      if (allocationWarnings.length > 0) {
        logger.warn(`[import-budget-html] Allocation validation warnings for ${metadata.salesRep}:`, allocationWarnings);
      } else {
        logger.info(`[import-budget-html] ✅ Import totals match allocation targets for ${metadata.salesRep}`);
      }
    } else {
      logger.info(`[import-budget-html] No Management Allocation targets found for ${metadata.salesRep} in ${metadata.budgetYear}`);
    }
  } catch (allocError) {
    logger.warn(`[import-budget-html] Could not validate against allocation targets:`, allocError.message);
  }
  
  // Check existing budget
  // Uses sales_rep_group_name column (budget data stored with group name only)
  const existingQuery = `
    SELECT COUNT(*) as count, MAX(uploaded_at) as last_upload
    FROM ${tables.budgetUnified}
    WHERE UPPER(division_code) = UPPER($1)
      AND UPPER(sales_rep_group_name) = UPPER($2)
      AND budget_year = $3
      AND UPPER(budget_type) = 'SALES_REP'
  `;
  
  const existingResult = await divisionPool.query(existingQuery, [metadata.division, metadata.salesRep, metadata.budgetYear]);
  const existingBudget = {
    recordCount: parseInt(existingResult.rows[0]?.count || 0, 10),
    lastUpload: existingResult.rows[0]?.last_upload
  };
  
  // Values in savedBudget are already in KGS (MT * 1000 from export)
  // Store them directly without additional conversion
  const normalizedRecords = validRecords.map(r => ({
    customer: r.customer,
    country: r.country,
    productGroup: r.productGroup,
    month: r.month,
    value: r.value  // Already in KGS - no conversion needed
  }));
  
  // Save using the service
  const result = await saveLiveSalesRepBudget(divisionPool, {
    division: metadata.division,
    budgetYear: metadata.budgetYear,
    salesRep: metadata.salesRep,
    records: normalizedRecords
  });
  
  // Calculate totals
  const pricingYear = metadata.budgetYear - 1;
  const pricingQuery = `
    SELECT LOWER(TRIM(product_group)) as product_group, COALESCE(asp_round, 0) as selling_price, COALESCE(morm_round, 0) as morm
    FROM ${tables.pricingRounding}
    WHERE UPPER(division) = UPPER($1) AND year = $2 AND product_group IS NOT NULL
  `;
  const pricingResult = await divisionPool.query(pricingQuery, [metadata.division, pricingYear]);
  const pricingMap = {};
  pricingResult.rows.forEach(row => {
    pricingMap[row.product_group] = { sellingPrice: parseFloat(row.selling_price) || 0, morm: parseFloat(row.morm) || 0 };
  });
  
  let totalMT = 0, totalAmount = 0, totalMoRM = 0;
  normalizedRecords.forEach(record => {
    totalMT += record.value / 1000;  // Convert KGS to MT for display
    const pricing = pricingMap[(record.productGroup || '').toLowerCase().trim()] || { sellingPrice: 0, morm: 0 };
    totalAmount += record.value * pricing.sellingPrice;
    totalMoRM += record.value * pricing.morm;
  });
  
  // Invalidate cache
  invalidateCache('aebf:*').catch(err => logger.warn('Cache invalidation warning:', err.message));
  
  // Sync budget unified table (non-blocking)
  divisionPool.query('SELECT refresh_budget_unified_stats()')
    .then(() => {
      logger.info('✅ Budget unified table synced after HTML budget import');
    })
    .catch(err => {
      logger.warn('⚠️ Budget unified sync failed (non-critical):', err.message);
    });
  
  // Return response directly (not wrapped in successResponse) to match frontend expectations
  res.json({
    success: true,
    message: allocationWarnings.length > 0 
      ? 'Budget imported successfully with allocation warnings' 
      : 'Budget imported successfully',
    metadata: { division: metadata.division, salesRep: metadata.salesRep, budgetYear: metadata.budgetYear },
    existingBudget,
    recordsDeleted: existingBudget.recordCount,
    recordsInserted: { total: normalizedRecords.length, kgs: result?.insertedKGS || normalizedRecords.length, amount: result?.insertedAmount || normalizedRecords.length, morm: result?.insertedMoRM || normalizedRecords.length },
    totals: { mt: totalMT, amount: totalAmount, morm: totalMoRM },
    pricingYear,
    skippedRecords: recordErrors.length,
    errors: recordErrors.slice(0, 10),
    warnings: [],
    allocationWarnings: allocationWarnings // Compare against Management Allocation targets
  });
}));

/**
 * GET /html-budget-actual-years
 * Get available actual years from fp_actualcommon
 * 
 * @route GET /api/aebf/html-budget-actual-years
 * @query {string} division - Division (FP)
 * @returns {object} 200 - Available actual years from fp_actualcommon
 */
router.get('/html-budget-actual-years', cacheMiddleware({ ttl: CacheTTL.LONG }), validationRules.health, asyncHandler(async (req, res) => {
  const { division } = req.query;
    
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  // Query fp_actualcommon for actual years
  const query = `
    SELECT DISTINCT year
    FROM ${tables.actualcommon}
    WHERE UPPER(admin_division_code) = UPPER($1)
    ORDER BY year DESC
  `;
  
  const result = await divisionPool.query(query, [division]);
  const years = result.rows.map(row => row.year);
  
  successResponse(res, { years });
}));

/**
 * GET /html-budget-budget-years
 * Get available budget years (existing from database + future years for planning)
 * 
 * @route GET /api/aebf/html-budget-budget-years
 * @query {string} division - Division (FP)
 * @returns {object} 200 - Available budget years (existing + future planning years)
 */
router.get('/html-budget-budget-years', cacheMiddleware({ ttl: CacheTTL.LONG }), validationRules.health, asyncHandler(async (req, res) => {
  const { division } = req.query;
    
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  // Query fp_budget_unified for existing budget years
  const query = `
    SELECT DISTINCT budget_year as year
    FROM ${tables.budgetUnified}
    WHERE UPPER(division_code) = UPPER($1)
    ORDER BY budget_year DESC
  `;
  
  const result = await divisionPool.query(query, [division]);
  const existingYears = result.rows.map(row => parseInt(row.year));
  
  // Add future years for budget planning (current year + next 3 years)
  const currentYear = new Date().getFullYear();
  const futureYears = [];
  for (let i = 0; i <= 3; i++) {
    futureYears.push(currentYear + i);
  }
  
  // Combine existing and future years, remove duplicates, and sort descending
  const allYears = [...new Set([...existingYears, ...futureYears])].sort((a, b) => b - a);
  
  successResponse(res, { years: allYears });
}));

module.exports = router;
