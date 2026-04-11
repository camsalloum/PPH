/**
 * @fileoverview AEBF Reports Routes
 * @module routes/aebf/reports
 * @description Generates analytical reports for budget and actual data with pricing integration
 * 
 * @requires express
 * @requires shared For database pool and table management
 * 
 * @routes
 * - GET  /budget-sales-reps      - Get distinct sales reps with budget data
 * - POST /budget-product-groups  - Product group breakdown with pricing (supports __ALL__)
 * - POST /actual-product-groups  - Actual product group breakdown with month range
 * 
 * @features
 * - Pricing data join from pricingRounding and materialPercentages tables
 * - Previous year pricing lookup (budgetYear - 1)
 * - __ALL__ aggregation across all sales reps
 * - Product group filtering (excludes SERVICES CHARGES)
 * - Month range support for actual data
 * - Sales rep performance analytics
 * 
 * @validation All routes use express-validator middleware
 * @errorHandling Centralized error handler with query optimization
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { cacheMiddleware, CacheTTL } = require('../../middleware/cache');
const { getPoolForDivision, getTableNames } = require('./shared');
const { asyncHandler, successResponse } = require('../../middleware/aebfErrorHandler');
const validationRules = require('../../middleware/aebfValidation');
const { queryLimiter } = require('../../middleware/rateLimiter');

/**
 * GET /budget-sales-reps
 * Get all distinct sales reps with budget data for a year
 * 
 * @route GET /api/aebf/budget-sales-reps
 * @query {string} division - Division (FP)
 * @query {number} budgetYear - Budget year
 * @returns {object} 200 - Array of sales rep names
 */
router.get('/budget-sales-reps', queryLimiter, cacheMiddleware({ ttl: CacheTTL.LONG }), validationRules.getBudgetSalesReps, asyncHandler(async (req, res) => {
  const { division, budgetYear } = req.query;
    
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    // Use fp_budget_unified instead of salesRepBudget
    // Check both sales_rep_name and sales_rep_group_name (BULK_IMPORT uses group_name)
    const query = `
      SELECT DISTINCT COALESCE(NULLIF(TRIM(sales_rep_name), ''), sales_rep_group_name) as salesrep
      FROM ${tables.budgetUnified}
      WHERE UPPER(division_code) = UPPER($1)
        AND budget_year = $2
        AND UPPER(budget_type) = 'SALES_REP'
        AND (
          (sales_rep_name IS NOT NULL AND TRIM(sales_rep_name) != '')
          OR (sales_rep_group_name IS NOT NULL AND TRIM(sales_rep_group_name) != '')
        )
      ORDER BY salesrep
    `;
    
    const result = await divisionPool.query(query, [division, parseInt(budgetYear)]);
    const salesReps = result.rows.map(row => row.salesrep);
    
    // Return in legacy format (not using successResponse wrapper)
    res.json({ success: true, salesReps });
}));

/**
 * POST /budget-product-groups
 * Get product group breakdown with pricing for sales rep budget (supports __ALL__)
 * Uses fp_budget_unified with budget_type = 'SALES_REP'
 * 
 * @route POST /api/aebf/budget-product-groups
 * @body {string} division - Division (FP)
 * @body {number} budgetYear - Budget year
 * @body {string} [salesRep] - Sales rep name (use __ALL__ for all reps)
 * @returns {object} 200 - Product groups with KGS, Amount, MoRM, RM, Material, Process
 */
router.post('/budget-product-groups', cacheMiddleware({ ttl: CacheTTL.MEDIUM }), validationRules.budgetProductGroups, asyncHandler(async (req, res) => {
  const { division, budgetYear, salesRep } = req.body;
    
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    let query;
    let params;
    
    if (!salesRep || salesRep === '__ALL__') {
      // Query from fp_budget_unified with budget_type = 'SALES_REP'
      // LEFT JOIN productGroupExclusions to filter out excluded product groups
      query = `
        SELECT 
          b.pgcombine as product_group,
          SUM(b.qty_kgs) as total_kgs,
          SUM(b.amount) as total_amount,
          SUM(b.morm) as total_morm
        FROM ${tables.budgetUnified} b
        LEFT JOIN ${tables.productGroupExclusions} e
          ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
          AND UPPER(e.division_code) = UPPER($1)
        WHERE UPPER(b.division_code) = UPPER($1)
          AND b.budget_year = $2
          AND UPPER(b.budget_type) = 'SALES_REP'
          AND b.pgcombine IS NOT NULL
          AND TRIM(b.pgcombine) != ''
          AND UPPER(TRIM(b.pgcombine)) != 'SERVICES CHARGES'
          AND e.product_group IS NULL
        GROUP BY b.pgcombine
      `;
      params = [division, parseInt(budgetYear)];
    } else {
      // Query from fp_budget_unified with budget_type = 'SALES_REP' for specific sales rep
      // Check both sales_rep_name and sales_rep_group_name for compatibility
      query = `
        SELECT 
          b.pgcombine as product_group,
          SUM(b.qty_kgs) as total_kgs,
          SUM(b.amount) as total_amount,
          SUM(b.morm) as total_morm
        FROM ${tables.budgetUnified} b
        LEFT JOIN ${tables.productGroupExclusions} e
          ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
          AND UPPER(e.division_code) = UPPER($1)
        WHERE UPPER(b.division_code) = UPPER($1)
          AND b.budget_year = $2
          AND (
            UPPER(TRIM(b.sales_rep_name)) = UPPER(TRIM($3))
            OR UPPER(TRIM(b.sales_rep_group_name)) = UPPER(TRIM($3))
          )
          AND UPPER(b.budget_type) = 'SALES_REP'
          AND b.pgcombine IS NOT NULL
          AND TRIM(b.pgcombine) != ''
          AND UPPER(TRIM(b.pgcombine)) != 'SERVICES CHARGES'
          AND e.product_group IS NULL
        GROUP BY b.pgcombine
      `;
      params = [division, parseInt(budgetYear), salesRep];
    }
    
    const result = await divisionPool.query(query, params);
    
    const productGroupsMap = {};
    
    result.rows.forEach(row => {
      const pgName = row.product_group;
      productGroupsMap[pgName] = {
        name: pgName,
        KGS: parseFloat(row.total_kgs) || 0,
        Amount: parseFloat(row.total_amount) || 0,
        MoRM: parseFloat(row.total_morm) || 0
      };
    });
    
    const pricingYear = parseInt(budgetYear) - 1;
    const pricingQuery = `
      SELECT 
        TRIM(p.product_group) as product_group,
        p.rm_round,
        p.morm_round,
        COALESCE(m.material, '') as material,
        COALESCE(m.process, '') as process
      FROM ${tables.pricingRounding} p
      LEFT JOIN ${tables.materialPercentages} m 
        ON UPPER(TRIM(p.product_group)) = UPPER(TRIM(m.product_group))
        AND m.material IS NOT NULL 
        AND TRIM(m.material) != ''
      WHERE UPPER(p.division) = UPPER($1)
        AND p.year = $2
        AND p.product_group IS NOT NULL
        AND TRIM(p.product_group) != ''
    `;
    
    const pricingResult = await divisionPool.query(pricingQuery, [division, pricingYear]);
    
    const pricingMap = {};
    pricingResult.rows.forEach(row => {
      pricingMap[row.product_group] = {
        rm: parseFloat(row.rm_round) || 0,
        morm: parseFloat(row.morm_round) || 0,
        material: row.material || '',
        process: row.process || ''
      };
    });
    
    const productGroups = Object.values(productGroupsMap).map(pg => {
      const pricing = pricingMap[pg.name] || { rm: 0, morm: 0, material: '', process: '' };
      return {
        name: pg.name,
        KGS: pg.KGS,
        Amount: pg.Amount,
        MoRM: pg.MoRM,
        RM: pricing.rm,
        Material: pricing.material,
        Process: pricing.process
      };
    });
    
    // Sort product groups: alphabetical, Others second-to-last, Services Charges last
    productGroups.sort((a, b) => {
      const aName = (a.name || '').toUpperCase();
      const bName = (b.name || '').toUpperCase();
      
      // Services Charges always last
      if (aName === 'SERVICES CHARGES') return 1;
      if (bName === 'SERVICES CHARGES') return -1;
      
      // Others second-to-last
      if (aName === 'OTHERS') return 1;
      if (bName === 'OTHERS') return -1;
      
      // Alphabetical for the rest
      return aName.localeCompare(bName);
    });
    
    // Return in legacy format (not using successResponse wrapper)
    res.json({
      success: true,
      productGroups,
      budgetYear: parseInt(budgetYear),
      salesRep: salesRep || '__ALL__'
    });
}));

/**
 * POST /actual-product-groups
 * Get product group breakdown with pricing for actual data (supports month range)
 * Uses fp_actualcommon which already has pgcombine
 * 
 * @route POST /api/aebf/actual-product-groups
 * @body {string} division - Division (FP)
 * @body {number} actualYear - Actual year
 * @body {string} [salesRep] - Sales rep name (use __ALL__ for all reps)
 * @body {number} [fromMonth] - Start month for range
 * @body {number} [toMonth] - End month for range
 * @returns {object} 200 - Product groups with KGS, Amount, MoRM, RM, Material, Process
 */
router.post('/actual-product-groups', cacheMiddleware({ ttl: CacheTTL.SHORT }), validationRules.actualProductGroups, asyncHandler(async (req, res) => {
  const { division, actualYear, salesRep, fromMonth, toMonth } = req.body;
    
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    let query;
    let params;
    
    if (!salesRep || salesRep === '__ALL__') {
      // Query from fp_actualcommon which has pgcombine
      // LEFT JOIN productGroupExclusions to filter out excluded product groups
      query = `
        SELECT 
          a.pgcombine as product_group,
          SUM(a.qty_kgs) as total_kgs,
          SUM(a.amount) as total_amount,
          SUM(a.morm) as total_morm
        FROM ${tables.actualcommon} a
        LEFT JOIN ${tables.productGroupExclusions} e
          ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
          AND UPPER(e.division_code) = UPPER($1)
        WHERE UPPER(a.admin_division_code) = UPPER($1)
          AND a.year = $2
          AND a.pgcombine IS NOT NULL
          AND TRIM(a.pgcombine) != ''
          AND UPPER(TRIM(a.pgcombine)) != 'SERVICES CHARGES'
          AND e.product_group IS NULL
      `;
      params = [division, parseInt(actualYear)];
    } else {
      // Query from fp_actualcommon for specific sales rep
      query = `
        SELECT 
          a.pgcombine as product_group,
          SUM(a.qty_kgs) as total_kgs,
          SUM(a.amount) as total_amount,
          SUM(a.morm) as total_morm
        FROM ${tables.actualcommon} a
        LEFT JOIN ${tables.productGroupExclusions} e
          ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
          AND UPPER(e.division_code) = UPPER($1)
        WHERE UPPER(a.admin_division_code) = UPPER($1)
          AND a.year = $2
          AND UPPER(TRIM(a.sales_rep_name)) = UPPER(TRIM($3))
          AND a.pgcombine IS NOT NULL
          AND TRIM(a.pgcombine) != ''
          AND UPPER(TRIM(a.pgcombine)) != 'SERVICES CHARGES'
          AND e.product_group IS NULL
      `;
      params = [division, parseInt(actualYear), salesRep];
    }
    
    if (fromMonth && toMonth) {
      query += ` AND a.month_no BETWEEN $${params.length + 1} AND $${params.length + 2}`;
      params.push(parseInt(fromMonth), parseInt(toMonth));
    }
    
    query += ' GROUP BY a.pgcombine';
    
    const result = await divisionPool.query(query, params);
    
    const productGroupsMap = {};
    
    result.rows.forEach(row => {
      const pgName = row.product_group;
      productGroupsMap[pgName] = {
        name: pgName,
        KGS: parseFloat(row.total_kgs) || 0,
        AMOUNT: parseFloat(row.total_amount) || 0,
        MORM: parseFloat(row.total_morm) || 0
      };
    });
    
    const pricingQuery = `
      SELECT 
        TRIM(p.product_group) as product_group,
        p.rm_round,
        p.morm_round,
        COALESCE(m.material, '') as material,
        COALESCE(m.process, '') as process
      FROM ${tables.pricingRounding} p
      LEFT JOIN ${tables.materialPercentages} m 
        ON UPPER(TRIM(p.product_group)) = UPPER(TRIM(m.product_group))
        AND m.material IS NOT NULL 
        AND TRIM(m.material) != ''
      WHERE UPPER(p.division) = UPPER($1)
        AND p.year = $2
        AND p.product_group IS NOT NULL
        AND TRIM(p.product_group) != ''
    `;
    
    const pricingResult = await divisionPool.query(pricingQuery, [division, parseInt(actualYear)]);
    
    const pricingMap = {};
    pricingResult.rows.forEach(row => {
      pricingMap[row.product_group] = {
        rm: parseFloat(row.rm_round) || 0,
        morm: parseFloat(row.morm_round) || 0,
        material: row.material || '',
        process: row.process || ''
      };
    });
    
    const productGroups = Object.values(productGroupsMap).map(pg => {
      const pricing = pricingMap[pg.name] || { rm: 0, morm: 0, material: '', process: '' };
      return {
        name: pg.name,
        KGS: pg.KGS,
        Amount: pg.AMOUNT,
        MoRM: pg.MORM,
        RM: pricing.rm,
        Material: pricing.material,
        Process: pricing.process
      };
    });
    
    // Sort product groups: alphabetical, Others second-to-last, Services Charges last
    productGroups.sort((a, b) => {
      const aName = (a.name || '').toUpperCase();
      const bName = (b.name || '').toUpperCase();
      
      // Services Charges always last
      if (aName === 'SERVICES CHARGES') return 1;
      if (bName === 'SERVICES CHARGES') return -1;
      
      // Others second-to-last
      if (aName === 'OTHERS') return 1;
      if (bName === 'OTHERS') return -1;
      
      // Alphabetical for the rest
      return aName.localeCompare(bName);
    });
    
    // Return in legacy format (not using successResponse wrapper)
    res.json({
      success: true,
      productGroups,
      actualYear: parseInt(actualYear),
      salesRep: salesRep || '__ALL__',
      fromMonth: fromMonth ? parseInt(fromMonth) : null,
      toMonth: toMonth ? parseInt(toMonth) : null
    });
}));

module.exports = router;
