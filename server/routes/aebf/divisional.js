/**
 * @fileoverview AEBF Divisional Budget Routes
 * @module routes/aebf/divisional
 * @description Handles divisional-level budget operations via service layer integration
 * 
 * @requires express
 * @requires divisionalBudgetService For business logic delegation
 * 
 * @routes
 * - POST   /divisional-html-budget-data           - Get divisional budget via getDivisionalBudgetInfo
 * - POST   /export-divisional-html-budget-form    - Export divisional form (placeholder)
 * - POST   /import-divisional-budget-html         - Import divisional HTML (placeholder)
 * - POST   /save-divisional-budget                - Save via saveDivisionalBudget service
 * - DELETE /delete-divisional-budget/:division/:budgetYear - Delete divisional budget
 * 
 * @pattern Service Layer Integration
 * - All business logic delegated to divisionalBudgetService
 * - Thin controller layer for request/response handling
 * - Clean separation of concerns
 * 
 * @validation All routes use express-validator middleware
 * @errorHandling Centralized error handler with service error propagation
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { cacheMiddleware, CacheTTL, invalidateCache } = require('../../middleware/cache');
const { getPoolForDivision, getTableNames } = require('./shared');
const { saveDivisionalBudget, getDivisionalBudgetInfo } = require('../../services/divisionalBudgetService');
const { asyncHandler, successResponse } = require('../../middleware/aebfErrorHandler');
const validationRules = require('../../middleware/aebfValidation');
const { queryLimiter } = require('../../middleware/rateLimiter');
const { generateDivisionalBudgetHtml } = require('../../utils/divisionalHtmlExport');

/**
 * POST /divisional-html-budget-data
 * Get divisional budget data - aggregated actual data by product group with pricing
 * Returns actual year data for display and any existing budget data for budgetYear
 * 
 * @route POST /api/aebf/divisional-html-budget-data
 * @body {string} division - Division (FP)
 * @body {number} actualYear - Year to get actual data from
 * @returns {object} 200 - Divisional budget data with tableData, pricingData, budgetData
 */
router.post('/divisional-html-budget-data', queryLimiter, cacheMiddleware({ ttl: CacheTTL.MEDIUM }), asyncHandler(async (req, res) => {
  const { division, actualYear, budgetYear: requestedBudgetYear } = req.body;
  
  logger.info('📊 Divisional budget data request:', {
    division,
    actualYear,
    requestedBudgetYear,
    rawBody: req.body
  });
  
  if (!division || !actualYear) {
    return res.status(400).json({ 
      success: false, 
      error: 'Division and actualYear are required' 
    });
  }
  
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  // Determine budget year: use requested, or default to actualYear + 1
  // Determine budget year: prefer same year, then actualYear + 1, then latest available
  let budgetYear = requestedBudgetYear ? parseInt(requestedBudgetYear) : parseInt(actualYear);
  
  logger.info(`📅 Budget year determined: ${budgetYear} (requested: ${requestedBudgetYear})`);
  
  // Check if the budget year exists in fp_budget_unified
  if (!requestedBudgetYear) {
    const budgetYearCheckQuery = `
      SELECT DISTINCT budget_year FROM ${tables.budgetUnified}
      WHERE UPPER(division_code) = UPPER($1)
      ORDER BY budget_year DESC
    `;
    const budgetYears = await divisionPool.query(budgetYearCheckQuery, [division]);
    
    if (budgetYears.rows.length > 0) {
      // First try: use same year as actual year
      const sameYearExists = budgetYears.rows.some(row => row.budget_year === parseInt(actualYear));
      
      if (sameYearExists) {
        budgetYear = parseInt(actualYear);
        logger.info(`Using same year budget: ${budgetYear}`);
      } else {
        // Second try: actualYear + 1
        const nextYear = parseInt(actualYear) + 1;
        const nextYearExists = budgetYears.rows.some(row => row.budget_year === nextYear);
        
        if (nextYearExists) {
          budgetYear = nextYear;
          logger.info(`Same year budget not found, using next year: ${budgetYear}`);
        } else {
          // Fallback: use the latest available budget year
          budgetYear = budgetYears.rows[0].budget_year;
          logger.info(`Budget year ${nextYear} not found, using latest available: ${budgetYear}`);
        }
      }
    }
  }
  
  // 1. Get aggregated actual data by product group from fp_actualcommon (excluding only excluded PGs from exclusion table)
  // Query uses admin_division_code which is denormalized from company_divisions mapping
  // This simplifies the query (no array filtering) and improves performance
  // IMPORTANT: Excludes 'Services Charges' because it's handled separately (no KGS, only AMOUNT/MORM)
  const actualQuery = `
    SELECT 
      a.pgcombine as product_group,
      CAST(a.month_no AS TEXT) as month,
      'AMOUNT' as values_type,
      SUM(a.amount) as total_values
    FROM ${tables.actualcommon} a
    LEFT JOIN ${tables.productGroupExclusions} e
      ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
      AND UPPER(e.division_code) = $1
    WHERE UPPER(a.admin_division_code) = UPPER($1)
      AND a.year = $2
      AND a.pgcombine IS NOT NULL
      AND TRIM(a.pgcombine) != ''
      AND UPPER(TRIM(a.pgcombine)) != 'SERVICES CHARGES'
      AND e.product_group IS NULL
    GROUP BY a.pgcombine, a.month_no
    
    UNION ALL
    
    SELECT 
      a.pgcombine as product_group,
      CAST(a.month_no AS TEXT) as month,
      'KGS' as values_type,
      SUM(a.qty_kgs) as total_values
    FROM ${tables.actualcommon} a
    LEFT JOIN ${tables.productGroupExclusions} e
      ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
      AND UPPER(e.division_code) = $1
    WHERE UPPER(a.admin_division_code) = UPPER($1)
      AND a.year = $2
      AND a.pgcombine IS NOT NULL
      AND TRIM(a.pgcombine) != ''
      AND UPPER(TRIM(a.pgcombine)) != 'SERVICES CHARGES'
      AND e.product_group IS NULL
    GROUP BY a.pgcombine, a.month_no
    
    UNION ALL
    
    SELECT 
      a.pgcombine as product_group,
      CAST(a.month_no AS TEXT) as month,
      'MORM' as values_type,
      SUM(a.morm) as total_values
    FROM ${tables.actualcommon} a
    LEFT JOIN ${tables.productGroupExclusions} e
      ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
      AND UPPER(e.division_code) = $1
    WHERE UPPER(a.admin_division_code) = UPPER($1)
      AND a.year = $2
      AND a.pgcombine IS NOT NULL
      AND TRIM(a.pgcombine) != ''
      AND UPPER(TRIM(a.pgcombine)) != 'SERVICES CHARGES'
      AND e.product_group IS NULL
    GROUP BY a.pgcombine, a.month_no
    
    ORDER BY product_group, month
  `;
  
  const actualResult = await divisionPool.query(actualQuery, [division, parseInt(actualYear)]);
  
  // Build table data structure - convert KGS to MT (divide by 1000)
  const productGroupsMap = {};
  actualResult.rows.forEach(row => {
    const pgName = row.product_group;
    if (!productGroupsMap[pgName]) {
      productGroupsMap[pgName] = {
        productGroup: pgName,
        monthlyActual: {}
      };
    }
    const month = row.month;
    if (!productGroupsMap[pgName].monthlyActual[month]) {
      productGroupsMap[pgName].monthlyActual[month] = { AMOUNT: 0, MT: 0, MORM: 0 };
    }
    const value = parseFloat(row.total_values) || 0;
    if (row.values_type === 'KGS') {
      // Convert KGS to MT
      productGroupsMap[pgName].monthlyActual[month].MT = value / 1000;
    } else {
      productGroupsMap[pgName].monthlyActual[month][row.values_type] = value;
    }
  });
  
  // tableData will be built after merging budget product groups below
  
  // 1b. Get Services Charges separately from fp_actualcommon (has Amount/MoRM but no KGS)
  const servicesChargesQuery = `
    SELECT 
      CAST(month_no AS TEXT) as month,
      'AMOUNT' as values_type,
      SUM(amount) as total_values
    FROM ${tables.actualcommon}
    WHERE UPPER(admin_division_code) = UPPER($1)
      AND year = $2
      AND UPPER(TRIM(pgcombine)) = 'SERVICES CHARGES'
    GROUP BY month_no
    
    UNION ALL
    
    SELECT 
      CAST(month_no AS TEXT) as month,
      'MORM' as values_type,
      SUM(morm) as total_values
    FROM ${tables.actualcommon}
    WHERE UPPER(admin_division_code) = UPPER($1)
      AND year = $2
      AND UPPER(TRIM(pgcombine)) = 'SERVICES CHARGES'
    GROUP BY month_no
    
    ORDER BY month
  `;
  
  const servicesResult = await divisionPool.query(servicesChargesQuery, [division, parseInt(actualYear)]);
  
  // Build Services Charges data
  const servicesChargesData = {
    productGroup: 'Services Charges',
    isServiceCharges: true, // Flag for frontend to handle differently
    monthlyActual: {}
  };
  
  servicesResult.rows.forEach(row => {
    const month = row.month;
    if (!servicesChargesData.monthlyActual[month]) {
      servicesChargesData.monthlyActual[month] = { AMOUNT: 0, MT: 0, MORM: 0 };
    }
    const value = parseFloat(row.total_values) || 0;
    servicesChargesData.monthlyActual[month][row.values_type] = value;
  });
  
  // 2. Get pricing data (asp_round = Amount per KG, morm_round = MoRM per KG)
  // Pricing logic:
  // - For 2025 and earlier: Use pricing from actualYear (preserves existing data)
  // - For 2026 onwards: Use pricing from previous year (budgetYear - 1)
  //   Example: 2026 budget uses 2025 pricing (rounded from 2024 actuals)
  let pricingYear;
  if (budgetYear <= 2025) {
    // Legacy behavior: use actual year pricing for existing 2025 budgets
    pricingYear = parseInt(actualYear);
  } else {
    // New behavior: use previous year's pricing for 2026+ budgets
    pricingYear = budgetYear - 1;
  }
  
  const pricingQuery = `
    SELECT 
      TRIM(p.product_group) as product_group,
      p.asp_round,
      p.morm_round,
      COALESCE(m.material, '') as material,
      COALESCE(m.process, '') as process
    FROM ${tables.pricingRounding} p
    LEFT JOIN ${tables.materialPercentages} m 
      ON UPPER(TRIM(p.product_group)) = UPPER(TRIM(m.product_group))
    WHERE UPPER(p.division) = UPPER($1)
      AND p.year = $2
      AND p.product_group IS NOT NULL
      AND TRIM(p.product_group) != ''
  `;
  
  let pricingResult = await divisionPool.query(pricingQuery, [division, parseInt(pricingYear)]);
  
  // If no pricing data for target year, use the most recent year available
  if (pricingResult.rows.length === 0) {
    const latestYearQuery = `
      SELECT MAX(year) as latest_year 
      FROM ${tables.pricingRounding} 
      WHERE UPPER(division) = UPPER($1)
    `;
    const latestYearResult = await divisionPool.query(latestYearQuery, [division]);
    if (latestYearResult.rows[0]?.latest_year) {
      const originalPricingYear = pricingYear;
      pricingYear = latestYearResult.rows[0].latest_year;
      pricingResult = await divisionPool.query(pricingQuery, [division, parseInt(pricingYear)]);
      logger.info(`No pricing data for year ${originalPricingYear}, using most recent: ${pricingYear}`, { division, budgetYear, originalPricingYear, pricingYear });
    }
  }
  
  const pricingData = {};
  pricingResult.rows.forEach(row => {
    pricingData[row.product_group] = {
      asp: parseFloat(row.asp_round) || 0,  // Amount per KG
      morm: parseFloat(row.morm_round) || 0, // MoRM per KG
      material: row.material || '',
      process: row.process || ''
    };
  });
  
  // 3. Get existing budget data from fp_budget_unified (aggregate by pgcombine + month)
  // DIVISIONAL BUDGET LOGIC:
  // - Only load records where budget_type = 'DIVISIONAL'
  // - Load APPROVED first as base data
  // - Then overlay DRAFT records on top (for items user is editing)
  // - This allows partial editing while preserving approved data for untouched items
  let budgetData = {};
  let budgetDataDetailed = {}; // Store Amount and MoRM separately
  let servicesChargesBudget = {};
  let budgetStatus = 'no-data'; // Track if we loaded draft or approved data
  try {
    // First, check for DIVISIONAL DRAFT records (user working on divisional budget)
    const draftCheckQuery = `
      SELECT COUNT(*) as draft_count
      FROM ${tables.budgetUnified}
      WHERE UPPER(division_code) = UPPER($1)
        AND budget_year = $2
        AND budget_status = 'draft'
        AND budget_type = 'DIVISIONAL'
    `;
    
    const draftCheckResult = await divisionPool.query(draftCheckQuery, [division, budgetYear]);
    const hasDraft = parseInt(draftCheckResult.rows[0].draft_count) > 0;
    
    // NEW LOGIC: Load both approved and draft, with draft taking priority
    // - Always load approved first (base data)
    // - Draft records will override approved for specific pgcombine+month combinations
    // This allows editing specific items without losing the rest of the approved budget
    budgetStatus = hasDraft ? 'draft' : 'approved';
    
    // Get regular product group budgets aggregated from fp_budget_unified (stored as KGS, convert to MT)
    // Filter out excluded product groups
    // NEW: Load both approved AND draft, with draft taking priority per pgcombine+month
    // Uses a subquery to aggregate first, then picks draft over approved
    const budgetQuery = `
      WITH aggregated AS (
        SELECT 
          b.pgcombine as product_group,
          b.month_no,
          b.budget_status,
          SUM(b.qty_kgs) as total_kgs,
          SUM(b.amount) as total_amount,
          SUM(b.morm) as total_morm
        FROM ${tables.budgetUnified} b
        LEFT JOIN ${tables.productGroupExclusions} e
          ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
          AND UPPER(e.division_code) = UPPER($1)
        WHERE UPPER(b.division_code) = UPPER($1)
          AND b.budget_year = $2
          AND b.pgcombine IS NOT NULL
          AND TRIM(b.pgcombine) != ''
          AND UPPER(TRIM(b.pgcombine)) != 'SERVICES CHARGES'
          AND e.product_group IS NULL
          AND b.budget_type = 'DIVISIONAL'
          AND b.budget_status IN ('approved', 'draft')
        GROUP BY b.pgcombine, b.month_no, b.budget_status
      )
      SELECT DISTINCT ON (product_group, month_no)
        product_group, month_no, budget_status, total_kgs, total_amount, total_morm
      FROM aggregated
      ORDER BY product_group, month_no, 
        CASE WHEN budget_status = 'draft' THEN 0 ELSE 1 END
    `;
    
    const budgetResult = await divisionPool.query(budgetQuery, [division, budgetYear]);
    
    // Store budget data with MT, Amount, and MoRM
    budgetResult.rows.forEach(row => {
      const key = `${row.product_group}|${row.month_no}`;
      // Convert KGS to MT for display (user enters in MT)
      // Round to 1 decimal place for consistency with actual data formatting
      budgetData[key] = Math.round((parseFloat(row.total_kgs) || 0) / 1000 * 10) / 10;
      
      // Store Amount and MoRM values
      budgetDataDetailed[key] = {
        mt: Math.round((parseFloat(row.total_kgs) || 0) / 1000 * 10) / 10,
        amount: parseFloat(row.total_amount) || 0,
        morm: parseFloat(row.total_morm) || 0
      };
      
      // IMPORTANT: Add product groups from budget that don't exist in actuals
      // This ensures all budget product groups appear in the table
      const pgName = row.product_group;
      if (!productGroupsMap[pgName]) {
        productGroupsMap[pgName] = {
          productGroup: pgName,
          monthlyActual: {} // Empty actuals for budget-only product groups
        };
      }
    });
    
    // Get Services Charges budget from fp_budget_unified (aggregate AMOUNT and MORM)
    // NEW: Load both approved AND draft, with draft taking priority per month
    const servicesBudgetQuery = `
      WITH aggregated AS (
        SELECT 
          b.month_no,
          b.budget_status,
          SUM(b.amount) as total_amount,
          SUM(b.morm) as total_morm
        FROM ${tables.budgetUnified} b
        WHERE UPPER(b.division_code) = UPPER($1)
          AND b.budget_year = $2
          AND UPPER(TRIM(b.pgcombine)) = 'SERVICES CHARGES'
          AND b.budget_type = 'DIVISIONAL'
          AND b.budget_status IN ('approved', 'draft')
        GROUP BY b.month_no, b.budget_status
      )
      SELECT DISTINCT ON (month_no)
        month_no, budget_status, total_amount, total_morm
      FROM aggregated
      ORDER BY month_no,
        CASE WHEN budget_status = 'draft' THEN 0 ELSE 1 END
    `;
    
    const servicesBudgetResult = await divisionPool.query(servicesBudgetQuery, [division, budgetYear]);
    
    servicesBudgetResult.rows.forEach(row => {
      // Services Charges budget keys: "Services Charges|month_no|AMOUNT"
      const amountKey = `Services Charges|${row.month_no}|AMOUNT`;
      const mormKey = `Services Charges|${row.month_no}|MORM`;
      // Database stores full value, frontend expects value in k (thousands)
      // Divide by 1000 to convert from full AED to k for frontend display
      // Round to 1 decimal place for consistency with actual data formatting
      servicesChargesBudget[amountKey] = Math.round((parseFloat(row.total_amount) || 0) / 1000 * 10) / 10;
      servicesChargesBudget[mormKey] = Math.round((parseFloat(row.total_morm) || 0) / 1000 * 10) / 10;
    });
    
    if (budgetResult.rows.length === 0 && servicesBudgetResult.rows.length === 0) {
      budgetStatus = 'no-data';
    }
  } catch (error) {
    // If budget table is empty or no data for this year, just return empty budget - no error
    logger.info(`No budget data found for year ${budgetYear}: ${error.message}`);
    budgetStatus = 'error';
  }
  
  // Build final tableData array after merging actuals and budget product groups
  // Sort alphabetically with "Others" second-to-last and "Services Charges" last
  const tableData = Object.values(productGroupsMap).sort((a, b) => {
    const pgA = (a.productGroup || '').toUpperCase().trim();
    const pgB = (b.productGroup || '').toUpperCase().trim();
    
    // Services Charges always last
    if (pgA === 'SERVICES CHARGES') return 1;
    if (pgB === 'SERVICES CHARGES') return -1;
    
    // Others always second-to-last
    if (pgA === 'OTHERS') return 1;
    if (pgB === 'OTHERS') return -1;
    
    // Everything else alphabetical
    return a.productGroup.localeCompare(b.productGroup);
  });
  
  // Check if Services Charges has any data (actual or from pricing table)
  const hasServicesChargesData = Object.keys(servicesChargesData.monthlyActual).length > 0 || 
    pricingData['Services Charges'] !== undefined;
  
  successResponse(res, { 
    data: tableData, 
    servicesChargesData: hasServicesChargesData ? servicesChargesData : null,
    pricingData, 
    pricingYear, // Include the year of pricing data being used
    budgetData,
    budgetDataDetailed, // Include Amount and MoRM for existing budgets
    servicesChargesBudget,
    budgetStatus, // 'draft', 'approved', or 'no-data'
    actualYear: parseInt(actualYear),
    budgetYear
  });
}));

/**
 * POST /export-divisional-html-budget-form
 * Export divisional budget HTML form with actual data and editable budget fields
 * Now generates a dynamic HTML with embedded JavaScript for live calculations
 * 
 * @route POST /api/aebf/export-divisional-html-budget-form
 * @body {string} division - Division (FP)
 * @body {number} actualYear - Actual year for reference data
 * @body {array} tableData - Table data with product groups and actual values
 * @body {object} budgetData - Current budget values
 * @body {object} servicesChargesData - Services Charges actual data
 * @body {object} servicesChargesBudget - Services Charges budget data
 * @body {object} pricingData - Pricing data for Amount/MoRM calculations
 * @body {object} materialPercentages - Material percentages for substrate calculation
 * @returns {html} - Dynamic HTML form file for download
 */
router.post('/export-divisional-html-budget-form', asyncHandler(async (req, res) => {
  const { 
    division, 
    actualYear, 
    tableData, 
    budgetData, 
    servicesChargesData, 
    servicesChargesBudget, 
    pricingData,
    materialPercentages,
    currency = { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' } 
  } = req.body;
  
  if (!division || !actualYear) {
    return res.status(400).json({ success: false, error: 'Division and actualYear are required' });
  }
  
  const budgetYear = parseInt(actualYear) + 1;
  
  // Fetch material percentages from database if not provided
  let materialPercentagesData = materialPercentages || {};
  if (!materialPercentages || Object.keys(materialPercentages).length === 0) {
    try {
      const divisionCode = division.toLowerCase();
      const pool = getPoolForDivision(divisionCode);
      const tableName = `${divisionCode}_material_percentages`;
      logger.info(`Fetching material percentages from ${tableName}`);
      const result = await pool.query(`SELECT * FROM ${tableName}`);
      logger.info(`Material percentages rows fetched: ${result.rows.length}`);
      result.rows.forEach(row => {
        const key = row.product_group.toLowerCase().trim();
        materialPercentagesData[key] = {
          PE: parseFloat(row.pe_percentage) || 0,
          PP: parseFloat(row.bopp_percentage) || 0,
          PET: parseFloat(row.pet_percentage) || 0,
          Alu: parseFloat(row.alu_percentage) || 0,
          Paper: parseFloat(row.paper_percentage) || 0,
          'PVC/PET': parseFloat(row.pvc_pet_percentage) || 0,
          Mix: parseFloat(row.mix_percentage) || 0
        };
      });
      logger.info(`Material percentages loaded: ${Object.keys(materialPercentagesData).length} product groups`);
    } catch (err) {
      logger.warn('Could not fetch material percentages for HTML export:', err.message);
    }
  }
  
  logger.info(`Generating dynamic divisional budget HTML for ${division}, budget year ${budgetYear}`);
  
  // Generate the dynamic HTML using the generator
  const htmlContent = generateDivisionalBudgetHtml({
    division,
    actualYear: parseInt(actualYear),
    budgetYear,
    tableData: tableData || [],
    budgetData: budgetData || {},
    servicesChargesData,
    servicesChargesBudget: servicesChargesBudget || {},
    pricingData: pricingData || {},
    materialPercentages: materialPercentagesData,
    currency
  });
  
  // Generate filename with timestamp (no seconds, just HH:mm)
  const now = new Date();
  const dateStr = String(now.getDate()).padStart(2, '0') + String(now.getMonth() + 1).padStart(2, '0') + now.getFullYear();
  const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
  const filename = `BUDGET_Divisional_${division}_${budgetYear}_${dateStr}_${timeStr}.html`;
  
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(htmlContent);
}));

/**
 * POST /export-divisional-budget-excel
 * Export divisional budget to Excel in "Sales by Product Group" format
 * 
 * Structure per Product Group:
 * - Product Group Name row with Material + Process info
 * - KGS row (monthly values + total)
 * - SALES row (KGS × SLS/KG) + total
 * - MORM row (KGS × MORM/KG) + total
 * - SLS/KG row (selling price per kg - same for all months)
 * - RM/KG row (raw material cost = SLS/KG - MORM/KG)
 * - MORM/KG row (margin per kg - same for all months)
 * - MORM % row (MORM/SALES per month, each month has own %)
 * 
 * Footer: Grand totals for KGS, SALES, MORM with weighted avg for per-kg metrics
 * 
 * @route POST /api/aebf/export-divisional-budget-excel
 * @body {string} division - Division (FP)
 * @body {number} budgetYear - Budget year
 * @body {array} tableData - Table data with product groups and actual values
 * @body {object} budgetData - Current budget values (MT per product group per month)
 * @body {object} servicesChargesData - Services Charges actual data
 * @body {object} servicesChargesBudget - Services Charges budget data
 * @body {object} pricingData - Pricing data with asp, morm, material, process
 * @returns {xlsx} - Excel file for download
 */
router.post('/export-divisional-budget-excel', asyncHandler(async (req, res) => {
  const ExcelJS = require('exceljs');
  const { 
    division, 
    budgetYear, 
    tableData, 
    budgetData, 
    servicesChargesData, 
    servicesChargesBudget, 
    pricingData,
    currency = { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' }
  } = req.body;
  
  if (!division || !budgetYear) {
    return res.status(400).json({ success: false, error: 'Division and budgetYear are required' });
  }
  
  // Fetch material percentages from database for substrate calculation
  let materialPercentagesData = {};
  try {
    const divisionCode = division.toLowerCase();
    const pool = getPoolForDivision(divisionCode);
    const tableName = `${divisionCode}_material_percentages`;
    logger.info(`[Excel Export] Fetching material percentages from ${tableName}`);
    const result = await pool.query(`SELECT * FROM ${tableName}`);
    logger.info(`[Excel Export] Material percentages rows fetched: ${result.rows.length}`);
    result.rows.forEach(row => {
      const key = row.product_group.toLowerCase().trim();
      materialPercentagesData[key] = {
        PE: parseFloat(row.pe_percentage) || 0,
        PP: parseFloat(row.bopp_percentage) || 0,
        PET: parseFloat(row.pet_percentage) || 0,
        Alu: parseFloat(row.alu_percentage) || 0,
        Paper: parseFloat(row.paper_percentage) || 0,
        'PVC/PET': parseFloat(row.pvc_pet_percentage) || 0,
        Mix: parseFloat(row.mix_percentage) || 0
      };
    });
    logger.info(`[Excel Export] Material percentages loaded: ${Object.keys(materialPercentagesData).length} product groups`);
  } catch (err) {
    logger.warn('Could not fetch material percentages for Excel export:', err.message);
  }
  
  logger.info(`Generating Divisional Budget Excel for ${division}, budget year ${budgetYear}`);
  
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IPD Budget System';
  workbook.created = new Date();
  
  const ws = workbook.addWorksheet('Sales by Product Group', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }]
  });
  
  // Get unique product groups from tableData, sorted with Others second-to-last, Services Charges last
  const uniquePGs = [...new Set((tableData || []).map(row => row.productGroup).filter(Boolean))];
  const productGroups = uniquePGs.sort((a, b) => {
    const aName = (a || '').toUpperCase().trim();
    const bName = (b || '').toUpperCase().trim();
    
    // Services Charges always last
    if (aName === 'SERVICES CHARGES') return 1;
    if (bName === 'SERVICES CHARGES') return -1;
    
    // "Other" or "Others" second to last (just before Services Charges)
    const isAOther = aName === 'OTHER' || aName === 'OTHERS';
    const isBOther = bName === 'OTHER' || bName === 'OTHERS';
    if (isAOther && !isBOther) return 1;
    if (isBOther && !isAOther) return -1;
    
    // Alphabetical for all others
    return a.localeCompare(b);
  });
  
  // Month short names
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  // Helper to get column letter from index (1=A, 2=B, ... 16=P)
  const colLetter = (col) => {
    let letter = '';
    while (col > 0) {
      col--;
      letter = String.fromCharCode(65 + (col % 26)) + letter;
      col = Math.floor(col / 26);
    }
    return letter;
  };
  
  // Helper to find pricing (case-insensitive) with proper RM/KG calculation
  const findPricing = (productGroup) => {
    if (!productGroup || !pricingData) return { asp: 0, morm: 0, rmPerKg: 0, material: '', process: '' };
    const normalizedKey = productGroup.toLowerCase().trim();
    
    let pricing = null;
    if (pricingData[normalizedKey]) {
      pricing = pricingData[normalizedKey];
    } else {
      for (const key of Object.keys(pricingData)) {
        if (key.toLowerCase().trim() === normalizedKey) {
          pricing = pricingData[key];
          break;
        }
      }
    }
    
    if (!pricing) return { asp: 0, morm: 0, rmPerKg: 0, material: '', process: '' };
    
    const asp = parseFloat(pricing.asp) || parseFloat(pricing.sellingPrice) || 0;
    const morm = parseFloat(pricing.morm) || 0;
    const rmPerKg = asp - morm;
    
    return {
      asp,
      morm,
      rmPerKg,
      material: pricing.material || '',
      process: pricing.process || ''
    };
  };
  
  // Metrics for each product group (in display order)
  // Row order: KGS, SALES, MORM, SLS/KG, RM/KG, MORM/KG, MORM %, % of Sls
  const metrics = ['KGS', 'SALES', 'MORM', 'SLS/KG', 'RM/KG', 'MORM/KG', 'MORM %', '% of Sls'];
  
  // Colors
  const headerBgColor = 'FF1677FF';
  const headerFontColor = 'FFFFFFFF';
  const productGroupBgColor = 'FF87CEEB';
  const materialBgColor = 'FFFFD700';
  const processBgColor = 'FF98FB98';
  const kgsBgColor = 'FFE3F2FD';
  const salesBgColor = 'FFE8F5E9';
  const mormBgColor = 'FFFFF3E0';
  const priceBgColor = 'FFF3E5F5';
  const pctBgColor = 'FFFCE4EC';
  const totalBgColor = 'FFE6FFE6';
  const grandTotalBgColor = 'FF4CAF50';
  const materialGroupBgColor = 'FFFFF176';  // Amber for MATERIAL GROUP section
  const materialConditionBgColor = 'FF81C784';   // Green for MATERIAL CONDITION section
  
  // COLUMN LAYOUT: A=Names, B-M=Jan-Dec, N=Total (NO Material/Process columns)
  const MONTH_START_COL = 2;  // Column B = January
  const TOTAL_COL = 14;       // Column N = Total
  const serviceChargesBgColor = 'FFCE93D8';   // Purple for services
  
  // ========== FIRST PASS: Build product group data and group by Material/Process ==========
  const productGroupDataMap = {};
  const materialGroups = {};  // { materialName: [pg1, pg2, ...] }
  const processGroups = {};   // { processName: [pg1, pg2, ...] }
  
  // Filter out product groups with zero budget (no KGS)
  const productGroupsWithBudget = [];
  
  productGroups.forEach(pg => {
    const pricing = findPricing(pg);
    const monthlyKgs = [];
    let totalKgs = 0;
    
    for (let month = 1; month <= 12; month++) {
      const budgetKey = `${pg}|${month}`;
      const budgetMT = parseFloat((budgetData[budgetKey] || '').toString().replace(/,/g, '')) || 0;
      const kgs = budgetMT * 1000;
      monthlyKgs.push(kgs);
      totalKgs += kgs;
    }
    
    // Skip product groups with zero total KGS (no budget)
    if (totalKgs === 0) {
      logger.info(`Skipping product group "${pg}" - no budget data (zero KGS)`);
      return;
    }
    
    productGroupsWithBudget.push(pg);
    
    productGroupDataMap[pg] = {
      pricing,
      monthlyKgs
    };
    
    // Group by Material
    const material = (pricing.material || 'Unspecified').trim();
    if (!materialGroups[material]) materialGroups[material] = [];
    materialGroups[material].push(pg);
    
    // Group by Process
    const process = (pricing.process || 'Unspecified').trim();
    if (!processGroups[process]) processGroups[process] = [];
    processGroups[process].push(pg);
  });
  
  // Use filtered list for export
  const filteredProductGroups = productGroupsWithBudget;
  
  // ========== ROW 1: TITLE ==========
  ws.addRow([`${division} Divisional Budget ${budgetYear} - Sales by Product Group`]);
  ws.mergeCells(1, 1, 1, TOTAL_COL);
  ws.getRow(1).font = { bold: true, size: 14, color: { argb: headerFontColor } };
  ws.getRow(1).height = 30;
  ws.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBgColor } };
  
  // ========== ROW 2: HEADER ==========
  // Columns: Product Groups Names | Jan-Dec | Total (NO Material/Process columns)
  const headerRow = ['Product Groups Names'];
  monthNames.forEach(m => headerRow.push(m));
  headerRow.push('Total');
  ws.addRow(headerRow);
  
  const row2 = ws.getRow(2);
  row2.font = { bold: true };
  row2.height = 25;
  row2.alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 1; c <= TOTAL_COL; c++) {
    row2.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBgColor } };
    row2.getCell(c).font = { bold: true, color: { argb: headerFontColor } };
    row2.getCell(c).border = {
      top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
    };
  }
  
  // Set column widths
  ws.getColumn(1).width = 28;  // Product Groups Names
  for (let c = 2; c <= 13; c++) {
    ws.getColumn(c).width = 12; // Month columns (B-M = Jan-Dec)
  }
  ws.getColumn(14).width = 14; // Total column (N)
  
  // ========== DATA ROWS: Each product group with metrics ==========
  let currentRow = 3;
  
  // Track row numbers for grand total formulas and % of Sales calculation
  const kgsRows = [];
  const salesRows = [];
  const mormRows = [];
  
  // Track rows by Material and Process for summary sections
  const materialRowRefs = {};  // { materialName: { kgs: [rows], sales: [rows], morm: [rows] } }
  const processRowRefs = {};   // { processName: { kgs: [rows], sales: [rows], morm: [rows] } }
  
  const applyBorder = (cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
    };
  };
  
  // Helper to build SUM formula for multiple non-contiguous rows
  const buildSumFormula = (rows, col) => {
    if (rows.length === 0) return '0';
    const colL = colLetter(col);
    // Create formula like: D4+D12+D20 for all KGS rows
    return rows.map(r => `${colL}${r}`).join('+');
  };
  
  // We need Total SALES row numbers for % of Sls calculation - will be filled after grand totals
  let gtSalesRowNum = 0;
  
  // Track cells that need % of Sls formula update after we know gtSalesRowNum
  const pctOfSlsCells = [];  // Array of { row, salesRow } for later formula update
  
  filteredProductGroups.forEach((pg, pgIdx) => {
    const pgData = productGroupDataMap[pg];
    const pricing = pgData.pricing;
    const material = (pricing.material || 'Unspecified').trim();
    const process = (pricing.process || 'Unspecified').trim();
    
    // Initialize material/process tracking
    if (!materialRowRefs[material]) materialRowRefs[material] = { kgs: [], sales: [], morm: [] };
    if (!processRowRefs[process]) processRowRefs[process] = { kgs: [], sales: [], morm: [] };
    
    // Product Group Name Row (merged across all columns)
    const pgRow = ws.addRow([pg]);
    pgRow.getCell(1).font = { bold: true };
    pgRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: productGroupBgColor } };
    
    // Merge all columns for product group header
    ws.mergeCells(currentRow, 1, currentRow, TOTAL_COL);
    
    for (let c = 1; c <= TOTAL_COL; c++) applyBorder(pgRow.getCell(c));
    currentRow++;
    
    // Track row numbers for this product group
    const rowRefs = {};
    
    // Add metric rows with FORMULAS
    metrics.forEach((metric) => {
      const dataRow = ws.addRow([metric]);
      rowRefs[metric] = currentRow;
      
      // Track rows for grand totals and material/process summaries
      if (metric === 'KGS') {
        kgsRows.push(currentRow);
        materialRowRefs[material].kgs.push(currentRow);
        processRowRefs[process].kgs.push(currentRow);
      }
      if (metric === 'SALES') {
        salesRows.push(currentRow);
        materialRowRefs[material].sales.push(currentRow);
        processRowRefs[process].sales.push(currentRow);
      }
      if (metric === 'MORM') {
        mormRows.push(currentRow);
        materialRowRefs[material].morm.push(currentRow);
        processRowRefs[process].morm.push(currentRow);
      }
      
      // Add month values/formulas (columns D-O = 4-15)
      for (let m = 0; m < 12; m++) {
        const col = MONTH_START_COL + m;
        const colL = colLetter(col);
        
        // Row order: KGS(0), SALES(1), MORM(2), SLS/KG(3), RM/KG(4), MORM/KG(5), MORM%(6), %ofSls(7)
        // When on SALES row: KGS is rowRefs['KGS'], SLS/KG is currentRow+2
        // When on MORM row: KGS is rowRefs['KGS'], MORM/KG is currentRow+3
        // When on RM/KG row: SLS/KG is rowRefs['SLS/KG'], MORM/KG is currentRow+1
        
        switch (metric) {
          case 'KGS':
            // KGS = MT × 1000 (input value)
            dataRow.getCell(col).value = pgData.monthlyKgs[m];
            break;
            
          case 'SALES':
            // SALES = KGS × SLS/KG
            // KGS is at rowRefs['KGS'], SLS/KG is 2 rows ahead (currentRow+2)
            dataRow.getCell(col).value = { formula: `${colL}${rowRefs['KGS']}*${colL}${currentRow + 2}` };
            break;
            
          case 'MORM':
            // MORM = KGS × MORM/KG
            // KGS is at rowRefs['KGS'], MORM/KG is 3 rows ahead (currentRow+3)
            dataRow.getCell(col).value = { formula: `${colL}${rowRefs['KGS']}*${colL}${currentRow + 3}` };
            break;
            
          case 'SLS/KG':
            // SLS/KG = constant price
            dataRow.getCell(col).value = pricing.asp;
            break;
            
          case 'RM/KG':
            // RM/KG = SLS/KG - MORM/KG
            // SLS/KG is at rowRefs['SLS/KG'], MORM/KG is 1 row ahead (currentRow+1)
            dataRow.getCell(col).value = { formula: `${colL}${rowRefs['SLS/KG']}-${colL}${currentRow + 1}` };
            break;
            
          case 'MORM/KG':
            // MORM/KG = constant price
            dataRow.getCell(col).value = pricing.morm;
            break;
            
          case 'MORM %':
            // MORM % = MORM / SALES (formula)
            dataRow.getCell(col).value = { formula: `IF(${colL}${rowRefs['SALES']}=0,0,${colL}${rowRefs['MORM']}/${colL}${rowRefs['SALES']})` };
            break;
            
          case '% of Sls':
            // % of Sls = This PG's SALES / Total SALES for this month
            // Leave cell with 0 for now - we'll fill formulas after we know gtSalesRowNum
            dataRow.getCell(col).value = 0;  // Placeholder
            break;
        }
      }
      
      // Total column (P = column 16) with SUM formulas
      const totalColL = colLetter(TOTAL_COL);
      const startColL = colLetter(MONTH_START_COL);
      const endColL = colLetter(MONTH_START_COL + 11);
      
      switch (metric) {
        case 'KGS':
        case 'SALES':
        case 'MORM':
          dataRow.getCell(TOTAL_COL).value = { formula: `SUM(${startColL}${currentRow}:${endColL}${currentRow})` };
          break;
          
        case 'SLS/KG':
        case 'MORM/KG':
          dataRow.getCell(TOTAL_COL).value = metric === 'SLS/KG' ? pricing.asp : pricing.morm;
          break;
          
        case 'RM/KG':
          dataRow.getCell(TOTAL_COL).value = { formula: `${totalColL}${rowRefs['SLS/KG']}-${totalColL}${currentRow + 1}` };
          break;
          
        case 'MORM %':
          dataRow.getCell(TOTAL_COL).value = { formula: `IF(${totalColL}${rowRefs['SALES']}=0,0,${totalColL}${rowRefs['MORM']}/${totalColL}${rowRefs['SALES']})` };
          break;
          
        case '% of Sls':
          // Total % of Sls = PG Total SALES / Grand Total SALES - placeholder for now
          dataRow.getCell(TOTAL_COL).value = 0;  // Will be filled in later
          break;
      }
      
      // Determine row color based on metric
      let bgColor;
      switch (metric) {
        case 'KGS': bgColor = kgsBgColor; break;
        case 'SALES': bgColor = salesBgColor; break;
        case 'MORM': bgColor = mormBgColor; break;
        case 'SLS/KG':
        case 'RM/KG':
        case 'MORM/KG': bgColor = priceBgColor; break;
        case 'MORM %':
        case '% of Sls': bgColor = pctBgColor; break;
        default: bgColor = 'FFFFFFFF';
      }
      
      // Apply styling
      for (let c = 1; c <= TOTAL_COL; c++) {
        dataRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        applyBorder(dataRow.getCell(c));
        if (c > 1) {
          dataRow.getCell(c).alignment = { horizontal: 'right' };
        }
      }
      
      // Number formatting
      for (let c = MONTH_START_COL; c <= TOTAL_COL; c++) {
        if (metric === 'KGS') {
          dataRow.getCell(c).numFmt = '#,##0';
        } else if (metric === 'SALES' || metric === 'MORM') {
          dataRow.getCell(c).numFmt = '#,##0';
        } else if (metric === 'SLS/KG' || metric === 'RM/KG' || metric === 'MORM/KG') {
          dataRow.getCell(c).numFmt = '#,##0.00';
        } else if (metric === 'MORM %' || metric === '% of Sls') {
          dataRow.getCell(c).numFmt = '0.00%';
        }
      }
      
      // Total column highlight
      dataRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
      dataRow.getCell(TOTAL_COL).font = { bold: true };
      
      currentRow++;
    });
    
    // Track this product group's % of Sls row for later formula update
    // rowRefs['% of Sls'] is the row number, rowRefs['SALES'] is the SALES row
    pctOfSlsCells.push({ row: rowRefs['% of Sls'], salesRow: rowRefs['SALES'] });
    
    // Add empty row between product groups (except after last one)
    if (pgIdx < filteredProductGroups.length - 1) {
      ws.addRow([]);
      currentRow++;
    }
  });
  
  // ========== SERVICES CHARGES SECTION (with SALES, MORM, MORM %) ==========
  const hasServicesCharges = servicesChargesData || (servicesChargesBudget && Object.keys(servicesChargesBudget).length > 0);
  let scSalesRowNum = 0;
  let scMormRowNum = 0;
  
  if (hasServicesCharges) {
    ws.addRow([]);
    currentRow++;
    
    // Services Charges header
    const scHeaderRow = ws.addRow(['Services Charges']);
    scHeaderRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    scHeaderRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9C27B0' } };
    ws.mergeCells(currentRow, 1, currentRow, TOTAL_COL);
    for (let c = 1; c <= TOTAL_COL; c++) applyBorder(scHeaderRow.getCell(c));
    currentRow++;
    
    // Get monthly Services Charges amounts
    const scMonthlyAmounts = [];
    for (let month = 1; month <= 12; month++) {
      const scAmountKey = `Services Charges|${month}|AMOUNT`;
      const scAmountInK = parseFloat((servicesChargesBudget[scAmountKey] || '').toString().replace(/,/g, '')) || 0;
      scMonthlyAmounts.push(scAmountInK * 1000);
    }
    
    // SALES row for Services Charges (same as Amount - services are revenue)
    scSalesRowNum = currentRow;
    const scSalesRow = ws.addRow(['SALES']);
    for (let m = 0; m < 12; m++) {
      scSalesRow.getCell(MONTH_START_COL + m).value = scMonthlyAmounts[m];
    }
    scSalesRow.getCell(TOTAL_COL).value = { formula: `SUM(${colLetter(MONTH_START_COL)}${currentRow}:${colLetter(MONTH_START_COL + 11)}${currentRow})` };
    salesRows.push(currentRow);  // Include in grand total SALES
    for (let c = 1; c <= TOTAL_COL; c++) {
      scSalesRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: salesBgColor } };
      applyBorder(scSalesRow.getCell(c));
      if (c > 1) {
        scSalesRow.getCell(c).alignment = { horizontal: 'right' };
        scSalesRow.getCell(c).numFmt = '#,##0';
      }
    }
    scSalesRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
    scSalesRow.getCell(TOTAL_COL).font = { bold: true };
    currentRow++;
    
    // MORM row for Services Charges (100% margin - no material cost)
    scMormRowNum = currentRow;
    const scMormRow = ws.addRow(['MORM']);
    for (let m = 0; m < 12; m++) {
      // MORM = SALES (100% margin for services)
      const colL = colLetter(MONTH_START_COL + m);
      scMormRow.getCell(MONTH_START_COL + m).value = { formula: `${colL}${scSalesRowNum}` };
    }
    scMormRow.getCell(TOTAL_COL).value = { formula: `SUM(${colLetter(MONTH_START_COL)}${currentRow}:${colLetter(MONTH_START_COL + 11)}${currentRow})` };
    mormRows.push(currentRow);  // Include in grand total MORM
    for (let c = 1; c <= TOTAL_COL; c++) {
      scMormRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: mormBgColor } };
      applyBorder(scMormRow.getCell(c));
      if (c > 1) {
        scMormRow.getCell(c).alignment = { horizontal: 'right' };
        scMormRow.getCell(c).numFmt = '#,##0';
      }
    }
    scMormRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
    scMormRow.getCell(TOTAL_COL).font = { bold: true };
    currentRow++;
    
    // MORM % row for Services Charges
    const scMormPctRow = ws.addRow(['MORM %']);
    for (let m = 0; m < 12; m++) {
      const col = MONTH_START_COL + m;
      const colL = colLetter(col);
      scMormPctRow.getCell(col).value = { formula: `IF(${colL}${scSalesRowNum}=0,0,${colL}${scMormRowNum}/${colL}${scSalesRowNum})` };
    }
    scMormPctRow.getCell(TOTAL_COL).value = { formula: `IF(${colLetter(TOTAL_COL)}${scSalesRowNum}=0,0,${colLetter(TOTAL_COL)}${scMormRowNum}/${colLetter(TOTAL_COL)}${scSalesRowNum})` };
    for (let c = 1; c <= TOTAL_COL; c++) {
      scMormPctRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pctBgColor } };
      applyBorder(scMormPctRow.getCell(c));
      if (c > 1) {
        scMormPctRow.getCell(c).alignment = { horizontal: 'right' };
        scMormPctRow.getCell(c).numFmt = '0.00%';
      }
    }
    scMormPctRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
    scMormPctRow.getCell(TOTAL_COL).font = { bold: true };
    currentRow++;
  }
  
  // ========== GRAND TOTALS SECTION ==========
  ws.addRow([]);
  currentRow++;
  
  // Grand Total Header
  const gtHeaderRow = ws.addRow(['GRAND TOTALS']);
  gtHeaderRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  gtHeaderRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: grandTotalBgColor } };
  ws.mergeCells(currentRow, 1, currentRow, TOTAL_COL);
  for (let c = 1; c <= TOTAL_COL; c++) applyBorder(gtHeaderRow.getCell(c));
  currentRow++;
  
  // Grand Total KGS - SUM of all product group KGS rows
  const gtKgsRowNum = currentRow;
  const gtKgsRow = ws.addRow(['Total KGS']);
  for (let m = 0; m < 12; m++) {
    const col = MONTH_START_COL + m;
    gtKgsRow.getCell(col).value = { formula: buildSumFormula(kgsRows, col) };
  }
  // Total column = SUM of months
  gtKgsRow.getCell(TOTAL_COL).value = { formula: `SUM(${colLetter(MONTH_START_COL)}${currentRow}:${colLetter(MONTH_START_COL + 11)}${currentRow})` };
  for (let c = 1; c <= TOTAL_COL; c++) {
    gtKgsRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: kgsBgColor } };
    gtKgsRow.getCell(c).font = { bold: true };
    applyBorder(gtKgsRow.getCell(c));
    if (c >= 2) {
      gtKgsRow.getCell(c).numFmt = '#,##0';
      gtKgsRow.getCell(c).alignment = { horizontal: 'right' };
    }
  }
  gtKgsRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
  currentRow++;
  
  // Grand Total SALES - SUM of all product group SALES rows
  gtSalesRowNum = currentRow;  // This was declared earlier with let
  const gtSalesRow = ws.addRow(['Total SALES']);
  for (let m = 0; m < 12; m++) {
    const col = MONTH_START_COL + m;
    gtSalesRow.getCell(col).value = { formula: buildSumFormula(salesRows, col) };
  }
  gtSalesRow.getCell(TOTAL_COL).value = { formula: `SUM(${colLetter(MONTH_START_COL)}${currentRow}:${colLetter(MONTH_START_COL + 11)}${currentRow})` };
  for (let c = 1; c <= TOTAL_COL; c++) {
    gtSalesRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: salesBgColor } };
    gtSalesRow.getCell(c).font = { bold: true };
    applyBorder(gtSalesRow.getCell(c));
    if (c >= 2) {
      gtSalesRow.getCell(c).numFmt = '#,##0';
      gtSalesRow.getCell(c).alignment = { horizontal: 'right' };
    }
  }
  gtSalesRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
  currentRow++;
  
  // Grand Total MORM - SUM of all product group MORM rows
  const gtMormRowNum = currentRow;
  const gtMormRow = ws.addRow(['Total MORM']);
  for (let m = 0; m < 12; m++) {
    const col = MONTH_START_COL + m;
    gtMormRow.getCell(col).value = { formula: buildSumFormula(mormRows, col) };
  }
  gtMormRow.getCell(TOTAL_COL).value = { formula: `SUM(${colLetter(MONTH_START_COL)}${currentRow}:${colLetter(MONTH_START_COL + 11)}${currentRow})` };
  for (let c = 1; c <= TOTAL_COL; c++) {
    gtMormRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: mormBgColor } };
    gtMormRow.getCell(c).font = { bold: true };
    applyBorder(gtMormRow.getCell(c));
    if (c >= 2) {
      gtMormRow.getCell(c).numFmt = '#,##0';
      gtMormRow.getCell(c).alignment = { horizontal: 'right' };
    }
  }
  gtMormRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
  currentRow++;
  
  // Grand Total MORM % = Total MORM / Total SALES (with formulas)
  const gtMormPctRow = ws.addRow(['Total MORM %']);
  for (let m = 0; m < 12; m++) {
    const col = MONTH_START_COL + m;
    const colL = colLetter(col);
    gtMormPctRow.getCell(col).value = { formula: `IF(${colL}${gtSalesRowNum}=0,0,${colL}${gtMormRowNum}/${colL}${gtSalesRowNum})` };
  }
  // Total MORM % = Total MORM / Total SALES
  gtMormPctRow.getCell(TOTAL_COL).value = { formula: `IF(${colLetter(TOTAL_COL)}${gtSalesRowNum}=0,0,${colLetter(TOTAL_COL)}${gtMormRowNum}/${colLetter(TOTAL_COL)}${gtSalesRowNum})` };
  for (let c = 1; c <= TOTAL_COL; c++) {
    gtMormPctRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pctBgColor } };
    gtMormPctRow.getCell(c).font = { bold: true };
    applyBorder(gtMormPctRow.getCell(c));
    if (c >= 2) {
      gtMormPctRow.getCell(c).numFmt = '0.00%';
      gtMormPctRow.getCell(c).alignment = { horizontal: 'right' };
    }
  }
  gtMormPctRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
  currentRow++;
  
  // Weighted Average SLS/KG = Total SALES / Total KGS (with formulas)
  const gtSlsKgRow = ws.addRow(['SLS/KG']);
  for (let m = 0; m < 12; m++) {
    const col = MONTH_START_COL + m;
    const colL = colLetter(col);
    gtSlsKgRow.getCell(col).value = { formula: `IF(${colL}${gtKgsRowNum}=0,0,${colL}${gtSalesRowNum}/${colL}${gtKgsRowNum})` };
  }
  gtSlsKgRow.getCell(TOTAL_COL).value = { formula: `IF(${colLetter(TOTAL_COL)}${gtKgsRowNum}=0,0,${colLetter(TOTAL_COL)}${gtSalesRowNum}/${colLetter(TOTAL_COL)}${gtKgsRowNum})` };
  for (let c = 1; c <= TOTAL_COL; c++) {
    gtSlsKgRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: priceBgColor } };
    gtSlsKgRow.getCell(c).font = { bold: true };
    applyBorder(gtSlsKgRow.getCell(c));
    if (c >= 2) {
      gtSlsKgRow.getCell(c).numFmt = '#,##0.00';
      gtSlsKgRow.getCell(c).alignment = { horizontal: 'right' };
    }
  }
  gtSlsKgRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
  currentRow++;
  
  // RM/KG = (SALES - MORM) / KGS
  const gtRmKgRow = ws.addRow(['RM/KG']);
  for (let m = 0; m < 12; m++) {
    const col = MONTH_START_COL + m;
    const colL = colLetter(col);
    gtRmKgRow.getCell(col).value = { formula: `IF(${colL}${gtKgsRowNum}=0,0,(${colL}${gtSalesRowNum}-${colL}${gtMormRowNum})/${colL}${gtKgsRowNum})` };
  }
  gtRmKgRow.getCell(TOTAL_COL).value = { formula: `IF(${colLetter(TOTAL_COL)}${gtKgsRowNum}=0,0,(${colLetter(TOTAL_COL)}${gtSalesRowNum}-${colLetter(TOTAL_COL)}${gtMormRowNum})/${colLetter(TOTAL_COL)}${gtKgsRowNum})` };
  for (let c = 1; c <= TOTAL_COL; c++) {
    gtRmKgRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: priceBgColor } };
    gtRmKgRow.getCell(c).font = { bold: true };
    applyBorder(gtRmKgRow.getCell(c));
    if (c >= 2) {
      gtRmKgRow.getCell(c).numFmt = '#,##0.00';
      gtRmKgRow.getCell(c).alignment = { horizontal: 'right' };
    }
  }
  gtRmKgRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
  currentRow++;
  
  // Weighted Average MORM/KG = Total MORM / Total KGS (with formulas)
  const gtMormKgRow = ws.addRow(['MORM/KG']);
  for (let m = 0; m < 12; m++) {
    const col = MONTH_START_COL + m;
    const colL = colLetter(col);
    gtMormKgRow.getCell(col).value = { formula: `IF(${colL}${gtKgsRowNum}=0,0,${colL}${gtMormRowNum}/${colL}${gtKgsRowNum})` };
  }
  gtMormKgRow.getCell(TOTAL_COL).value = { formula: `IF(${colLetter(TOTAL_COL)}${gtKgsRowNum}=0,0,${colLetter(TOTAL_COL)}${gtMormRowNum}/${colLetter(TOTAL_COL)}${gtKgsRowNum})` };
  for (let c = 1; c <= TOTAL_COL; c++) {
    gtMormKgRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: priceBgColor } };
    gtMormKgRow.getCell(c).font = { bold: true };
    applyBorder(gtMormKgRow.getCell(c));
    if (c >= 2) {
      gtMormKgRow.getCell(c).numFmt = '#,##0.00';
      gtMormKgRow.getCell(c).alignment = { horizontal: 'right' };
    }
  }
  gtMormKgRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
  // ========== MATERIAL GROUP SECTION ==========
  const materialNames = Object.keys(materialRowRefs).filter(m => m !== 'Unspecified').sort();
  const materialGroupRowRefs = {};  // Track MATERIAL GROUP rows for potential use
  
  if (materialNames.length > 0) {
    ws.addRow([]);
    
    // For each material (PE, Non-PE, etc.), show KGS, SALES, MORM, SLS/KG, RM/KG, MORM/KG, MORM % totals
    materialNames.forEach((matName) => {
      const refs = materialRowRefs[matName];
      materialGroupRowRefs[matName] = {};
      
      // Material name header row - use row.number for actual Excel row
      const matNameRow = ws.addRow([matName, '', '']);
      const matHeaderRowNum = matNameRow.number;
      matNameRow.getCell(1).font = { bold: true };
      matNameRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: materialBgColor } };
      ws.mergeCells(matHeaderRowNum, 1, matHeaderRowNum, TOTAL_COL);
      for (let c = 1; c <= TOTAL_COL; c++) applyBorder(matNameRow.getCell(c));
      
      // KGS row for this material - use row.number
      const matKgsRow = ws.addRow(['KGS']);
      const matKgsRowNum = matKgsRow.number;
      materialGroupRowRefs[matName].kgs = matKgsRowNum;
      for (let m = 0; m < 12; m++) {
        const col = MONTH_START_COL + m;
        matKgsRow.getCell(col).value = { formula: buildSumFormula(refs.kgs, col) };
      }
      matKgsRow.getCell(TOTAL_COL).value = { formula: `SUM(${colLetter(MONTH_START_COL)}${matKgsRowNum}:${colLetter(MONTH_START_COL + 11)}${matKgsRowNum})` };
      for (let c = 1; c <= TOTAL_COL; c++) {
        matKgsRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: kgsBgColor } };
        applyBorder(matKgsRow.getCell(c));
        if (c > 1) {
          matKgsRow.getCell(c).alignment = { horizontal: 'right' };
          matKgsRow.getCell(c).numFmt = '#,##0';
        }
      }
      matKgsRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
      matKgsRow.getCell(TOTAL_COL).font = { bold: true };
      
      // SALES row for this material - use row.number
      const matSalesRow = ws.addRow(['SALES']);
      const matSalesRowNum = matSalesRow.number;
      materialGroupRowRefs[matName].sales = matSalesRowNum;
      for (let m = 0; m < 12; m++) {
        const col = MONTH_START_COL + m;
        matSalesRow.getCell(col).value = { formula: buildSumFormula(refs.sales, col) };
      }
      matSalesRow.getCell(TOTAL_COL).value = { formula: `SUM(${colLetter(MONTH_START_COL)}${matSalesRowNum}:${colLetter(MONTH_START_COL + 11)}${matSalesRowNum})` };
      for (let c = 1; c <= TOTAL_COL; c++) {
        matSalesRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: salesBgColor } };
        applyBorder(matSalesRow.getCell(c));
        if (c > 1) {
          matSalesRow.getCell(c).alignment = { horizontal: 'right' };
          matSalesRow.getCell(c).numFmt = '#,##0';
        }
      }
      matSalesRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
      matSalesRow.getCell(TOTAL_COL).font = { bold: true };
      
      // MORM row for this material - use row.number
      const matMormRow = ws.addRow(['MORM']);
      const matMormRowNum = matMormRow.number;
      materialGroupRowRefs[matName].morm = matMormRowNum;
      for (let m = 0; m < 12; m++) {
        const col = MONTH_START_COL + m;
        matMormRow.getCell(col).value = { formula: buildSumFormula(refs.morm, col) };
      }
      matMormRow.getCell(TOTAL_COL).value = { formula: `SUM(${colLetter(MONTH_START_COL)}${matMormRowNum}:${colLetter(MONTH_START_COL + 11)}${matMormRowNum})` };
      for (let c = 1; c <= TOTAL_COL; c++) {
        matMormRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: mormBgColor } };
        applyBorder(matMormRow.getCell(c));
        if (c > 1) {
          matMormRow.getCell(c).alignment = { horizontal: 'right' };
          matMormRow.getCell(c).numFmt = '#,##0';
        }
      }
      matMormRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
      matMormRow.getCell(TOTAL_COL).font = { bold: true };
      
      // SLS/KG row for this material = SALES / KGS
      const matSlsKgRow = ws.addRow(['SLS/KG']);
      for (let m = 0; m < 12; m++) {
        const col = MONTH_START_COL + m;
        const colL = colLetter(col);
        matSlsKgRow.getCell(col).value = { formula: `IF(${colL}${matKgsRowNum}=0,0,${colL}${matSalesRowNum}/${colL}${matKgsRowNum})` };
      }
      matSlsKgRow.getCell(TOTAL_COL).value = { formula: `IF(${colLetter(TOTAL_COL)}${matKgsRowNum}=0,0,${colLetter(TOTAL_COL)}${matSalesRowNum}/${colLetter(TOTAL_COL)}${matKgsRowNum})` };
      for (let c = 1; c <= TOTAL_COL; c++) {
        matSlsKgRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: priceBgColor } };
        applyBorder(matSlsKgRow.getCell(c));
        if (c > 1) {
          matSlsKgRow.getCell(c).alignment = { horizontal: 'right' };
          matSlsKgRow.getCell(c).numFmt = '#,##0.00';
        }
      }
      matSlsKgRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
      matSlsKgRow.getCell(TOTAL_COL).font = { bold: true };
      
      // RM/KG row for this material = (SALES - MORM) / KGS
      const matRmKgRow = ws.addRow(['RM/KG']);
      for (let m = 0; m < 12; m++) {
        const col = MONTH_START_COL + m;
        const colL = colLetter(col);
        matRmKgRow.getCell(col).value = { formula: `IF(${colL}${matKgsRowNum}=0,0,(${colL}${matSalesRowNum}-${colL}${matMormRowNum})/${colL}${matKgsRowNum})` };
      }
      matRmKgRow.getCell(TOTAL_COL).value = { formula: `IF(${colLetter(TOTAL_COL)}${matKgsRowNum}=0,0,(${colLetter(TOTAL_COL)}${matSalesRowNum}-${colLetter(TOTAL_COL)}${matMormRowNum})/${colLetter(TOTAL_COL)}${matKgsRowNum})` };
      for (let c = 1; c <= TOTAL_COL; c++) {
        matRmKgRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: priceBgColor } };
        applyBorder(matRmKgRow.getCell(c));
        if (c > 1) {
          matRmKgRow.getCell(c).alignment = { horizontal: 'right' };
          matRmKgRow.getCell(c).numFmt = '#,##0.00';
        }
      }
      matRmKgRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
      matRmKgRow.getCell(TOTAL_COL).font = { bold: true };
      
      // MORM/KG row for this material = MORM / KGS
      const matMormKgRow = ws.addRow(['MORM/KG']);
      for (let m = 0; m < 12; m++) {
        const col = MONTH_START_COL + m;
        const colL = colLetter(col);
        matMormKgRow.getCell(col).value = { formula: `IF(${colL}${matKgsRowNum}=0,0,${colL}${matMormRowNum}/${colL}${matKgsRowNum})` };
      }
      matMormKgRow.getCell(TOTAL_COL).value = { formula: `IF(${colLetter(TOTAL_COL)}${matKgsRowNum}=0,0,${colLetter(TOTAL_COL)}${matMormRowNum}/${colLetter(TOTAL_COL)}${matKgsRowNum})` };
      for (let c = 1; c <= TOTAL_COL; c++) {
        matMormKgRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: priceBgColor } };
        applyBorder(matMormKgRow.getCell(c));
        if (c > 1) {
          matMormKgRow.getCell(c).alignment = { horizontal: 'right' };
          matMormKgRow.getCell(c).numFmt = '#,##0.00';
        }
      }
      matMormKgRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
      matMormKgRow.getCell(TOTAL_COL).font = { bold: true };
      
      // MORM % row for this material = MORM / SALES
      const matMormPctRow = ws.addRow(['MORM %']);
      for (let m = 0; m < 12; m++) {
        const col = MONTH_START_COL + m;
        const colL = colLetter(col);
        matMormPctRow.getCell(col).value = { formula: `IF(${colL}${matSalesRowNum}=0,0,${colL}${matMormRowNum}/${colL}${matSalesRowNum})` };
      }
      matMormPctRow.getCell(TOTAL_COL).value = { formula: `IF(${colLetter(TOTAL_COL)}${matSalesRowNum}=0,0,${colLetter(TOTAL_COL)}${matMormRowNum}/${colLetter(TOTAL_COL)}${matSalesRowNum})` };
      for (let c = 1; c <= TOTAL_COL; c++) {
        matMormPctRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pctBgColor } };
        applyBorder(matMormPctRow.getCell(c));
        if (c > 1) {
          matMormPctRow.getCell(c).alignment = { horizontal: 'right' };
          matMormPctRow.getCell(c).numFmt = '0.00%';
        }
      }
      matMormPctRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
      matMormPctRow.getCell(TOTAL_COL).font = { bold: true };
      
      // % of Sls row for this material = Material SALES / Grand Total SALES
      const matPctSlsRow = ws.addRow(['% of Sls']);
      for (let m = 0; m < 12; m++) {
        const col = MONTH_START_COL + m;
        const colL = colLetter(col);
        matPctSlsRow.getCell(col).value = { formula: `IF(${colL}${gtSalesRowNum}=0,0,${colL}${matSalesRowNum}/${colL}${gtSalesRowNum})` };
      }
      matPctSlsRow.getCell(TOTAL_COL).value = { formula: `IF(${colLetter(TOTAL_COL)}${gtSalesRowNum}=0,0,${colLetter(TOTAL_COL)}${matSalesRowNum}/${colLetter(TOTAL_COL)}${gtSalesRowNum})` };
      for (let c = 1; c <= TOTAL_COL; c++) {
        matPctSlsRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pctBgColor } };
        applyBorder(matPctSlsRow.getCell(c));
        if (c > 1) {
          matPctSlsRow.getCell(c).alignment = { horizontal: 'right' };
          matPctSlsRow.getCell(c).numFmt = '0.00%';
        }
      }
      matPctSlsRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
      matPctSlsRow.getCell(TOTAL_COL).font = { bold: true };
      currentRow++;
    });
  }
  
  // ========== MATERIAL CONDITION SECTION ==========
  const processNames = Object.keys(processRowRefs).filter(p => p !== 'Unspecified').sort();
  const materialConditionRowRefs = {};
  
  if (processNames.length > 0) {
    ws.addRow([]);
    
    // For each process (Printed, Unprinted, etc.), show KGS, SALES, MORM, SLS/KG, RM/KG, MORM/KG, MORM % totals
    processNames.forEach((procName) => {
      const refs = processRowRefs[procName];
      materialConditionRowRefs[procName] = {};
      
      // Process name header row - use row.number for actual Excel row
      const procNameRow = ws.addRow([procName, '', '']);
      const procHeaderRowNum = procNameRow.number;
      procNameRow.getCell(1).font = { bold: true };
      procNameRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: processBgColor } };
      ws.mergeCells(procHeaderRowNum, 1, procHeaderRowNum, TOTAL_COL);
      for (let c = 1; c <= TOTAL_COL; c++) applyBorder(procNameRow.getCell(c));
      
      // KGS row for this process - use row.number
      const procKgsRow = ws.addRow(['KGS']);
      const procKgsRowNum = procKgsRow.number;
      materialConditionRowRefs[procName].kgs = procKgsRowNum;
      for (let m = 0; m < 12; m++) {
        const col = MONTH_START_COL + m;
        procKgsRow.getCell(col).value = { formula: buildSumFormula(refs.kgs, col) };
      }
      procKgsRow.getCell(TOTAL_COL).value = { formula: `SUM(${colLetter(MONTH_START_COL)}${procKgsRowNum}:${colLetter(MONTH_START_COL + 11)}${procKgsRowNum})` };
      for (let c = 1; c <= TOTAL_COL; c++) {
        procKgsRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: kgsBgColor } };
        applyBorder(procKgsRow.getCell(c));
        if (c > 1) {
          procKgsRow.getCell(c).alignment = { horizontal: 'right' };
          procKgsRow.getCell(c).numFmt = '#,##0';
        }
      }
      procKgsRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
      procKgsRow.getCell(TOTAL_COL).font = { bold: true };
      
      // SALES row for this process - use row.number
      const procSalesRow = ws.addRow(['SALES']);
      const procSalesRowNum = procSalesRow.number;
      materialConditionRowRefs[procName].sales = procSalesRowNum;
      for (let m = 0; m < 12; m++) {
        const col = MONTH_START_COL + m;
        procSalesRow.getCell(col).value = { formula: buildSumFormula(refs.sales, col) };
      }
      procSalesRow.getCell(TOTAL_COL).value = { formula: `SUM(${colLetter(MONTH_START_COL)}${procSalesRowNum}:${colLetter(MONTH_START_COL + 11)}${procSalesRowNum})` };
      for (let c = 1; c <= TOTAL_COL; c++) {
        procSalesRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: salesBgColor } };
        applyBorder(procSalesRow.getCell(c));
        if (c > 1) {
          procSalesRow.getCell(c).alignment = { horizontal: 'right' };
          procSalesRow.getCell(c).numFmt = '#,##0';
        }
      }
      procSalesRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
      procSalesRow.getCell(TOTAL_COL).font = { bold: true };
      
      // MORM row for this process - use row.number
      const procMormRow = ws.addRow(['MORM']);
      const procMormRowNum = procMormRow.number;
      materialConditionRowRefs[procName].morm = procMormRowNum;
      for (let m = 0; m < 12; m++) {
        const col = MONTH_START_COL + m;
        procMormRow.getCell(col).value = { formula: buildSumFormula(refs.morm, col) };
      }
      procMormRow.getCell(TOTAL_COL).value = { formula: `SUM(${colLetter(MONTH_START_COL)}${procMormRowNum}:${colLetter(MONTH_START_COL + 11)}${procMormRowNum})` };
      for (let c = 1; c <= TOTAL_COL; c++) {
        procMormRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: mormBgColor } };
        applyBorder(procMormRow.getCell(c));
        if (c > 1) {
          procMormRow.getCell(c).alignment = { horizontal: 'right' };
          procMormRow.getCell(c).numFmt = '#,##0';
        }
      }
      procMormRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
      procMormRow.getCell(TOTAL_COL).font = { bold: true };
      
      // SLS/KG row for this process = SALES / KGS
      const procSlsKgRow = ws.addRow(['SLS/KG']);
      for (let m = 0; m < 12; m++) {
        const col = MONTH_START_COL + m;
        const colL = colLetter(col);
        procSlsKgRow.getCell(col).value = { formula: `IF(${colL}${procKgsRowNum}=0,0,${colL}${procSalesRowNum}/${colL}${procKgsRowNum})` };
      }
      procSlsKgRow.getCell(TOTAL_COL).value = { formula: `IF(${colLetter(TOTAL_COL)}${procKgsRowNum}=0,0,${colLetter(TOTAL_COL)}${procSalesRowNum}/${colLetter(TOTAL_COL)}${procKgsRowNum})` };
      for (let c = 1; c <= TOTAL_COL; c++) {
        procSlsKgRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: priceBgColor } };
        applyBorder(procSlsKgRow.getCell(c));
        if (c > 1) {
          procSlsKgRow.getCell(c).alignment = { horizontal: 'right' };
          procSlsKgRow.getCell(c).numFmt = '#,##0.00';
        }
      }
      procSlsKgRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
      procSlsKgRow.getCell(TOTAL_COL).font = { bold: true };
      
      // RM/KG row for this process = (SALES - MORM) / KGS
      const procRmKgRow = ws.addRow(['RM/KG']);
      for (let m = 0; m < 12; m++) {
        const col = MONTH_START_COL + m;
        const colL = colLetter(col);
        procRmKgRow.getCell(col).value = { formula: `IF(${colL}${procKgsRowNum}=0,0,(${colL}${procSalesRowNum}-${colL}${procMormRowNum})/${colL}${procKgsRowNum})` };
      }
      procRmKgRow.getCell(TOTAL_COL).value = { formula: `IF(${colLetter(TOTAL_COL)}${procKgsRowNum}=0,0,(${colLetter(TOTAL_COL)}${procSalesRowNum}-${colLetter(TOTAL_COL)}${procMormRowNum})/${colLetter(TOTAL_COL)}${procKgsRowNum})` };
      for (let c = 1; c <= TOTAL_COL; c++) {
        procRmKgRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: priceBgColor } };
        applyBorder(procRmKgRow.getCell(c));
        if (c > 1) {
          procRmKgRow.getCell(c).alignment = { horizontal: 'right' };
          procRmKgRow.getCell(c).numFmt = '#,##0.00';
        }
      }
      procRmKgRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
      procRmKgRow.getCell(TOTAL_COL).font = { bold: true };
      
      // MORM/KG row for this process = MORM / KGS
      const procMormKgRow = ws.addRow(['MORM/KG']);
      for (let m = 0; m < 12; m++) {
        const col = MONTH_START_COL + m;
        const colL = colLetter(col);
        procMormKgRow.getCell(col).value = { formula: `IF(${colL}${procKgsRowNum}=0,0,${colL}${procMormRowNum}/${colL}${procKgsRowNum})` };
      }
      procMormKgRow.getCell(TOTAL_COL).value = { formula: `IF(${colLetter(TOTAL_COL)}${procKgsRowNum}=0,0,${colLetter(TOTAL_COL)}${procMormRowNum}/${colLetter(TOTAL_COL)}${procKgsRowNum})` };
      for (let c = 1; c <= TOTAL_COL; c++) {
        procMormKgRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: priceBgColor } };
        applyBorder(procMormKgRow.getCell(c));
        if (c > 1) {
          procMormKgRow.getCell(c).alignment = { horizontal: 'right' };
          procMormKgRow.getCell(c).numFmt = '#,##0.00';
        }
      }
      procMormKgRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
      procMormKgRow.getCell(TOTAL_COL).font = { bold: true };
      
      // MORM % row for this process = MORM / SALES
      const procMormPctRow = ws.addRow(['MORM %']);
      for (let m = 0; m < 12; m++) {
        const col = MONTH_START_COL + m;
        const colL = colLetter(col);
        procMormPctRow.getCell(col).value = { formula: `IF(${colL}${procSalesRowNum}=0,0,${colL}${procMormRowNum}/${colL}${procSalesRowNum})` };
      }
      procMormPctRow.getCell(TOTAL_COL).value = { formula: `IF(${colLetter(TOTAL_COL)}${procSalesRowNum}=0,0,${colLetter(TOTAL_COL)}${procMormRowNum}/${colLetter(TOTAL_COL)}${procSalesRowNum})` };
      for (let c = 1; c <= TOTAL_COL; c++) {
        procMormPctRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pctBgColor } };
        applyBorder(procMormPctRow.getCell(c));
        if (c > 1) {
          procMormPctRow.getCell(c).alignment = { horizontal: 'right' };
          procMormPctRow.getCell(c).numFmt = '0.00%';
        }
      }
      procMormPctRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
      procMormPctRow.getCell(TOTAL_COL).font = { bold: true };
      
      // % of Sls row for this process = Process SALES / Grand Total SALES
      const procPctSlsRow = ws.addRow(['% of Sls']);
      for (let m = 0; m < 12; m++) {
        const col = MONTH_START_COL + m;
        const colL = colLetter(col);
        procPctSlsRow.getCell(col).value = { formula: `IF(${colL}${gtSalesRowNum}=0,0,${colL}${procSalesRowNum}/${colL}${gtSalesRowNum})` };
      }
      procPctSlsRow.getCell(TOTAL_COL).value = { formula: `IF(${colLetter(TOTAL_COL)}${gtSalesRowNum}=0,0,${colLetter(TOTAL_COL)}${procSalesRowNum}/${colLetter(TOTAL_COL)}${gtSalesRowNum})` };
      for (let c = 1; c <= TOTAL_COL; c++) {
        procPctSlsRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pctBgColor } };
        applyBorder(procPctSlsRow.getCell(c));
        if (c > 1) {
          procPctSlsRow.getCell(c).alignment = { horizontal: 'right' };
          procPctSlsRow.getCell(c).numFmt = '0.00%';
        }
      }
      procPctSlsRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
      procPctSlsRow.getCell(TOTAL_COL).font = { bold: true };
    });
  }
  
  // ========== SUBSTRATED MT USED OR REQUIRED SECTION ==========
  const substrateTypes = ['PE', 'PP', 'PET', 'Alu', 'Paper', 'PVC/PET', 'Mix'];
  const substrateBgColor = 'FF1976D2';  // Blue for substrate header
  const substrateLightBgColor = 'FFE3F2FD';  // Light blue for substrate rows
  
  logger.info(`[Excel Export] materialPercentagesData keys: ${Object.keys(materialPercentagesData).length}`);
  logger.info(`[Excel Export] filteredProductGroups: ${filteredProductGroups.length}`);
  
  // Only show substrate section if we have material percentages data
  if (Object.keys(materialPercentagesData).length > 0) {
    ws.addRow([]);
    
    // Substrate Header Row
    const subHeaderRow = ws.addRow(['SUBSTRATED MT USED OR REQUIRED']);
    const subHeaderRowNum = subHeaderRow.number;
    subHeaderRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    subHeaderRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: substrateBgColor } };
    ws.mergeCells(subHeaderRowNum, 1, subHeaderRowNum, TOTAL_COL);
    for (let c = 1; c <= TOTAL_COL; c++) applyBorder(subHeaderRow.getCell(c));
    
    // Calculate substrate requirements for each month
    // We need to sum (productGroup KGS × substrate percentage / 100) for each substrate type
    // Product group data is stored in productGroupDataMap
    
    substrateTypes.forEach(subType => {
      const subRow = ws.addRow([subType]);
      
      // Calculate monthly values
      for (let m = 0; m < 12; m++) {
        let monthSubstrateTotal = 0;
        
        // Sum substrate requirements from all product groups
        filteredProductGroups.forEach(pg => {
          const pgData = productGroupDataMap[pg];
          if (pgData) {
            const monthlyKgs = pgData.monthlyKgs[m] || 0;  // KGS (not MT)
            const pgKey = pg.toLowerCase().trim();
            const percentages = materialPercentagesData[pgKey];
            if (percentages) {
              const pct = percentages[subType] || 0;
              // Convert KGS to MT (÷1000) then apply percentage
              monthSubstrateTotal += (monthlyKgs / 1000) * pct / 100;
            }
          }
        });
        
        subRow.getCell(MONTH_START_COL + m).value = Math.round(monthSubstrateTotal);
      }
      
      // Total column = SUM of months
      const subRowNum = subRow.number;
      subRow.getCell(TOTAL_COL).value = { formula: `SUM(${colLetter(MONTH_START_COL)}${subRowNum}:${colLetter(MONTH_START_COL + 11)}${subRowNum})` };
      
      // Apply styling
      for (let c = 1; c <= TOTAL_COL; c++) {
        subRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: substrateLightBgColor } };
        applyBorder(subRow.getCell(c));
        if (c > 1) {
          subRow.getCell(c).alignment = { horizontal: 'right' };
          subRow.getCell(c).numFmt = '#,##0';  // No decimals for substrate MT
        }
      }
      subRow.getCell(TOTAL_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalBgColor } };
      subRow.getCell(TOTAL_COL).font = { bold: true };
    });
  }
  
  
  // ========== NOW UPDATE ALL % of Sls FORMULAS with actual gtSalesRowNum ==========
  // We now know gtSalesRowNum, so we can fill in the % of Sls formulas
  pctOfSlsCells.forEach(({ row, salesRow }) => {
    // Update month columns (D-O = 4-15)
    for (let m = 0; m < 12; m++) {
      const col = MONTH_START_COL + m;
      const colL = colLetter(col);
      ws.getCell(row, col).value = { formula: `IF(${colL}${gtSalesRowNum}=0,0,${colL}${salesRow}/${colL}${gtSalesRowNum})` };
    }
    // Update total column (P = 16)
    const totalColL = colLetter(TOTAL_COL);
    ws.getCell(row, TOTAL_COL).value = { formula: `IF(${totalColL}${gtSalesRowNum}=0,0,${totalColL}${salesRow}/${totalColL}${gtSalesRowNum})` };
  });
  
  // Generate filename
  const now = new Date();
  const dateStr = String(now.getDate()).padStart(2, '0') + String(now.getMonth() + 1).padStart(2, '0') + now.getFullYear();
  const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
  const filename = `BUDGET_Divisional_${division}_${budgetYear}_${dateStr}_${timeStr}.xlsx`;
  
  // Write to buffer and send
  const buffer = await workbook.xlsx.writeBuffer();
  
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}));

/**
 * POST /import-divisional-budget-html
 * Import divisional budget from HTML file
 * Parses the HTML to extract budget values and saves to database
 * 
 * @route POST /api/aebf/import-divisional-budget-html
 * @body {string} htmlContent - The HTML content to parse
 * @body {boolean} forceUpdate - If true, update existing records without confirmation
 * @returns {object} 200 - Import result with record counts
 */
router.post('/import-divisional-budget-html', asyncHandler(async (req, res) => {
  const { htmlContent, forceUpdate, confirmReplace } = req.body;
  const shouldForceUpdate = forceUpdate || confirmReplace;
  
  if (!htmlContent) {
    return res.status(400).json({ success: false, error: 'htmlContent is required' });
  }
  
  // Parse metadata from HTML
  const divisionMatch = htmlContent.match(/<meta\s+name="division"\s+content="([^"]+)"/i);
  const actualYearMatch = htmlContent.match(/<meta\s+name="actualYear"\s+content="(\d+)"/i);
  const budgetYearMatch = htmlContent.match(/<meta\s+name="budgetYear"\s+content="(\d+)"/i);
  
  if (!divisionMatch || !budgetYearMatch) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid HTML file - missing division or budgetYear metadata. Please use a file exported from this system.' 
    });
  }
  
  const division = divisionMatch[1];
  const budgetYear = parseInt(budgetYearMatch[1]);
  const actualYear = actualYearMatch ? parseInt(actualYearMatch[1]) : budgetYear - 1;
  
  // Parse budget values - handle both input elements and static TD elements
  // Structure: actual-row with data-pg="ProductGroup" followed by budget-row with 12 monthly values
  const parsedRecords = [];
  const servicesChargesRecords = [];
  
  // Method 1: Parse from input elements (unfilled/editable HTML)
  const inputPattern = /<input[^>]*data-group="([^"]+)"[^>]*data-month="(\d+)"[^>]*value="([^"]*)"[^>]*\/?>/gi;
  let match;
  
  while ((match = inputPattern.exec(htmlContent)) !== null) {
    const productGroup = match[1];
    const month = parseInt(match[2]);
    const value = match[3].trim();
    
    // Check if this is a Services Charges input with AMOUNT metric
    const isServicesCharges = productGroup.toUpperCase() === 'SERVICES CHARGES';
    const hasAmountMetric = match[0].includes('data-metric="AMOUNT"');
    
    if (isServicesCharges && hasAmountMetric) {
      if (value && !isNaN(parseFloat(value))) {
        servicesChargesRecords.push({
          month,
          amountValue: Math.round(parseFloat(value) * 1000)
        });
      }
    } else if (!isServicesCharges && value && !isNaN(parseFloat(value))) {
      parsedRecords.push({
        productGroup,
        month,
        value: Math.round(parseFloat(value) * 1000) // Convert MT to KGS
      });
    }
  }
  
  // Method 2: Parse from static HTML (filled/saved HTML with static TD elements)
  // Pattern: <tr class="actual-row" data-pg="ProductGroup"> followed by <tr class="budget-row">
  if (parsedRecords.length === 0) {
    const actualRowPattern = /<tr[^>]*class="actual-row"[^>]*data-pg="([^"]+)"[^>]*>[\s\S]*?<\/tr>\s*<tr[^>]*class="budget-row"[^>]*(?:data-pg="[^"]*")?[^>]*>([\s\S]*?)<\/tr>/gi;
    
    while ((match = actualRowPattern.exec(htmlContent)) !== null) {
      const productGroup = match[1];
      const budgetRowContent = match[2];
      
      // Skip Services Charges - handled separately
      if (productGroup.toUpperCase() === 'SERVICES CHARGES') continue;
      
      // Extract monthly values from TD elements (first 12 TDs are months)
      // Handle both plain text and formatted text in static HTML
      const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let tdMatch;
      let month = 1;
      
      while ((tdMatch = tdPattern.exec(budgetRowContent)) !== null && month <= 12) {
        let tdContent = tdMatch[1].trim();
        // Strip HTML tags to get plain value
        let value = tdContent.replace(/<[^>]*>/g, '').trim().replace(/,/g, '');
        // Skip if empty or zero
        if (value && !isNaN(parseFloat(value)) && parseFloat(value) !== 0) {
          parsedRecords.push({
            productGroup,
            month,
            value: Math.round(parseFloat(value) * 1000) // Convert MT to KGS
          });
        }
        month++;
      }
    }
  }
  
  // Parse Services Charges from static HTML if not found in inputs
  if (servicesChargesRecords.length === 0) {
    // Look for Services Charges budget row - now has proper class
    const scPattern = /<tr[^>]*class="[^"]*services-charges-budget-row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
    const scMatch = scPattern.exec(htmlContent);
    
    if (scMatch) {
      const scRowContent = scMatch[1];
      // Updated pattern to handle:
      // 1. Input elements: <input ... value="100" ...>
      // 2. Static spans: <span ...>100</span> <span>k</span>
      // 3. Plain text: 100
      const tdPattern = /<td[^>]*>(?:<div[^>]*>)?(?:<input[^>]*value="([^"]*)"[^>]*>|<span[^>]*>([^<]*)<\/span>|([^<\s][^<]*))/gi;
      let tdMatch;
      let month = 1;
      
      while ((tdMatch = tdPattern.exec(scRowContent)) !== null && month <= 12) {
        // Get value from input value, span content, or plain text
        const value = (tdMatch[1] || tdMatch[2] || tdMatch[3] || '').trim().replace(/,/g, '');
        if (value && !isNaN(parseFloat(value)) && parseFloat(value) !== 0) {
          servicesChargesRecords.push({
            month,
            amountValue: Math.round(parseFloat(value) * 1000)
          });
        }
        month++;
      }
    }
  }
  
  if (parsedRecords.length === 0 && servicesChargesRecords.length === 0) {
    return res.status(400).json({ 
      success: false, 
      error: 'No valid budget values found in the HTML file. Please fill in at least one budget value.' 
    });
  }
  
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  // Check for existing budget
  const existingResult = await divisionPool.query(`
    SELECT COUNT(*) as count, MAX(uploaded_at) as last_upload
    FROM ${tables.divisionalBudget}
    WHERE UPPER(division) = UPPER($1) AND year = $2
  `, [division, budgetYear]);
  
  const existingCount = parseInt(existingResult.rows[0]?.count || 0);
  const lastUpload = existingResult.rows[0]?.last_upload;
  
  // If existing budget found and no forceUpdate/confirmReplace, ask for confirmation
  if (existingCount > 0 && !shouldForceUpdate) {
    return successResponse(res, {
      needsConfirmation: true,
      existingBudget: {
        recordCount: existingCount,
        lastUpload
      },
      metadata: {
        division,
        budgetYear,
        actualYear
      },
      recordsToImport: parsedRecords.length + servicesChargesRecords.length
    });
  }
  
  // Proceed with import using the existing save function
  const result = await saveDivisionalBudget(divisionPool, {
    division,
    budgetYear,
    records: parsedRecords
  });
  
  // Save Services Charges records (AMOUNT and MORM) using upsert
  let servicesChargesCount = 0;
  if (servicesChargesRecords.length > 0) {
    // Insert new Services Charges records
    for (const record of servicesChargesRecords) {
      // Insert AMOUNT record with ON CONFLICT
      await divisionPool.query(`
        INSERT INTO ${tables.divisionalBudget} 
        (division, year, month, product_group, metric, value, material, process, uploaded_filename, uploaded_at)
        VALUES ($1, $2, $3, 'Services Charges', 'AMOUNT', $4, '', '', 'Divisional_HTML_Import', NOW())
        ON CONFLICT (UPPER(division), year, month, product_group, UPPER(metric))
        DO UPDATE SET value = EXCLUDED.value, uploaded_filename = EXCLUDED.uploaded_filename, uploaded_at = NOW()
      `, [division, budgetYear, record.month, record.amountValue]);
      
      // Insert MORM record (same as AMOUNT for Services Charges - 100% margin)
      await divisionPool.query(`
        INSERT INTO ${tables.divisionalBudget} 
        (division, year, month, product_group, metric, value, material, process, uploaded_filename, uploaded_at)
        VALUES ($1, $2, $3, 'Services Charges', 'MORM', $4, '', '', 'Divisional_HTML_Import', NOW())
        ON CONFLICT (UPPER(division), year, month, product_group, UPPER(metric))
        DO UPDATE SET value = EXCLUDED.value, uploaded_filename = EXCLUDED.uploaded_filename, uploaded_at = NOW()
      `, [division, budgetYear, record.month, record.amountValue]);
      
      servicesChargesCount++;;
    }
  }
  
  // Calculate Services Charges total (sum of amountValue)
  const servicesChargesTotal = servicesChargesRecords.reduce((sum, r) => sum + (r.amountValue || 0), 0);
  
  // Invalidate cache
  invalidateCache('aebf:*').catch(err => 
    logger.warn('Cache invalidation warning:', err.message)
  );
  
  // Calculate combined totals including Services Charges
  const budgetTotals = result.budgetTotals || { volumeMT: 0, volumeKGS: 0, amount: 0, morm: 0 };
  const combinedTotals = {
    volumeMT: budgetTotals.volumeMT,
    volumeKGS: budgetTotals.volumeKGS,
    amount: budgetTotals.amount + servicesChargesTotal,
    morm: budgetTotals.morm + servicesChargesTotal, // Services Charges MoRM = 100% of Amount
    servicesCharges: servicesChargesTotal
  };
  
  successResponse(res, {
    success: true,
    metadata: {
      division,
      budgetYear,
      actualYear
    },
    recordsInserted: result.recordsInserted,
    recordsProcessed: result.recordsProcessed,
    servicesChargesRecords: servicesChargesCount,
    budgetTotals: combinedTotals,
    skippedRecords: result.skippedRecords,
    validationErrors: result.validationErrors,
    warnings: result.warnings || [],
    pricingYear: result.pricingYear
  });
}));

/**
 * POST /save-divisional-budget
 * Save divisional budget via saveDivisionalBudget service
 * 
 * @route POST /api/aebf/save-divisional-budget
 * @body {string} division - Division (FP)
 * @body {number} budgetYear - Budget year
 * @body {array} records - Array of budget records (regular product groups)
 * @body {array} servicesChargesRecords - Array of Services Charges records (optional)
 * @returns {object} 200 - Save result with record counts
 */
router.post('/save-divisional-budget', validationRules.saveDivisionalBudget, asyncHandler(async (req, res) => {
  const { division, budgetYear, records, servicesChargesRecords } = req.body;
  
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  // Save regular product group budget records
  const result = await saveDivisionalBudget(divisionPool, {
    division,
    budgetYear,
    records: records || []
  });
  
  // Save Services Charges records separately (stored as AMOUNT, not KGS) using upsert
  let servicesChargesCount = 0;
  if (servicesChargesRecords && servicesChargesRecords.length > 0) {
    // Insert new Services Charges records
    for (const record of servicesChargesRecords) {
      // Insert AMOUNT record with ON CONFLICT
      await divisionPool.query(`
        INSERT INTO ${tables.divisionalBudget} 
        (division, year, month, product_group, metric, value, material, process, uploaded_filename, uploaded_at)
        VALUES ($1, $2, $3, $4, $5, $6, '', '', 'Divisional_Live_Save', NOW())
        ON CONFLICT (UPPER(division), year, month, product_group, UPPER(metric))
        DO UPDATE SET value = EXCLUDED.value, uploaded_filename = EXCLUDED.uploaded_filename, uploaded_at = NOW()
      `, [
        division.toUpperCase(),
        parseInt(budgetYear),
        record.month,
        'Services Charges',
        'AMOUNT',
        record.value
      ]);
      
      // Also insert MORM record (100% of Amount for Services Charges)
      await divisionPool.query(`
        INSERT INTO ${tables.divisionalBudget} 
        (division, year, month, product_group, metric, value, material, process, uploaded_filename, uploaded_at)
        VALUES ($1, $2, $3, $4, $5, $6, '', '', 'Divisional_Live_Save', NOW())
        ON CONFLICT (UPPER(division), year, month, product_group, UPPER(metric))
        DO UPDATE SET value = EXCLUDED.value, uploaded_filename = EXCLUDED.uploaded_filename, uploaded_at = NOW()
      `, [
        division.toUpperCase(),
        parseInt(budgetYear),
        record.month,
        'Services Charges',
        'MORM',
        record.value  // MoRM = 100% of Amount
      ]);
      
      servicesChargesCount++;
    }
    
    logger.info(`Saved ${servicesChargesCount} Services Charges records for ${division} ${budgetYear}`);
  }
  
  // Invalidate cache after saving
  invalidateCache('aebf:*').catch(err => 
    logger.warn('Cache invalidation warning:', err.message)
  );
  
  successResponse(res, {
    ...result,
    servicesChargesRecords: servicesChargesCount
  });
}));

/**
 * DELETE /delete-divisional-budget/:division/:budgetYear
 * Delete divisional budget for specified division and year
 * 
 * @route DELETE /api/aebf/delete-divisional-budget/:division/:budgetYear
 * @param {string} division - Division (FP)
 * @param {number} budgetYear - Budget year
 * @returns {object} 200 - Deletion result with record count
 */
router.delete('/delete-divisional-budget/:division/:budgetYear', validationRules.deleteDivisionalBudget, asyncHandler(async (req, res) => {
  const { division, budgetYear } = req.params;
  
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  // Delete from fp_budget_unified - only divisional level records (budget_type = 'DIVISIONAL')
  const deleteQuery = `
    DELETE FROM ${tables.budgetUnified}
    WHERE UPPER(division_code) = UPPER($1) 
      AND budget_year = $2
      AND budget_type = 'DIVISIONAL'
      AND is_budget = true
  `;
  
  const result = await divisionPool.query(deleteQuery, [division, parseInt(budgetYear)]);
  
  // Invalidate cache after deletion
  invalidateCache('aebf:*').catch(err => 
    logger.warn('Cache invalidation warning:', err.message)
  );
  
  successResponse(res, {
    message: `Deleted ${result.rowCount} divisional budget records`,
    division,
    budgetYear: parseInt(budgetYear),
    recordsDeleted: result.rowCount,
    deletedCount: result.rowCount
  });
}));

module.exports = router;
