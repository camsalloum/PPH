/**
 * @fileoverview AEBF Actual Data Routes
 * @module routes/aebf/actual
 * @description Handles all actual data operations including retrieval, upload, analysis, and export
 * 
 * @requires express
 * @requires multer File upload middleware for Excel files
 * @requires child_process For PowerShell script execution
 * 
 * @routes
 * - GET  /actual                 - Retrieve paginated actual data with comprehensive filters
 * - GET  /summary                - Get summary statistics by type and values_type
 * - GET  /year-summary           - Get year-specific summary with search
 * - GET  /filter-options         - Get all unique filter values
 * - GET  /distinct/:field        - Get distinct values for specific field
 * - GET  /export                 - Export data to CSV (max 10,000 records)
 * - GET  /available-months       - Get available actual months for estimation
 * - POST /upload-actual          - Upload Excel file via PowerShell processing
 * - POST /analyze-file           - Analyze Excel file to extract year/month combinations
 * 
 * @features
 * - Month name recognition (JANUARY/JAN → 1)
 * - Multi-field search with intelligent matching
 * - PowerShell integration for Excel processing
 * - Selective year/month upload support
 * - CSV export with comprehensive filtering
 * - Real-time file analysis
 * 
 * @validation All routes use express-validator middleware
 * @errorHandling Centralized error handler with standardized responses
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const logger = require('../../utils/logger');
const { getPoolForDivision, getTableNames, extractDivisionCode, getValidDivisionsSync } = require('./shared');
const { asyncHandler, ErrorCreators, successResponse } = require('../../middleware/aebfErrorHandler');
const validationRules = require('../../middleware/aebfValidation');
const { queryLimiter, uploadLimiter, exportLimiter } = require('../../middleware/rateLimiter');
const { cacheMiddleware, CacheTTL, invalidateCache } = require('../../middleware/cache');
const { paginationHelper, buildPaginationSQL, buildPaginationMeta } = require('../../middleware/pagination');
const { autoRegisterSalesReps } = require('../../services/salesRepAutoRegister');
const { pool } = require('../../database/config');

// Helper function to refresh unified stats after upload
async function refreshUnifiedStats() {
  try {
    const result = await pool.query('SELECT * FROM refresh_unified_stats()');
    return result.rows[0] || { customers_updated: 0, reps_updated: 0, pgs_updated: 0, mv_refreshed: 0 };
  } catch (err) {
    // Log but don't fail - this is a non-critical operation
    console.warn('Warning: refresh_unified_stats() failed:', err.message);
    return { error: err.message };
  }
}

// Helper function to recalculate customer active status (non-blocking)
async function recalculateCustomerStatus() {
  try {
    const result = await pool.query('SELECT * FROM recalculate_customer_active_status()');
    const { now_active, now_inactive } = result.rows[0];
    logger.info(`🔄 Customer status recalculated: ${now_active} active, ${now_inactive} inactive`);
    return { active: now_active, inactive: now_inactive };
  } catch (error) {
    logger.warn('Customer status recalculation warning:', error.message);
    return null;
  }
}

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `aebf-upload-${timestamp}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls') {
      return cb(new Error('Only Excel files are allowed'));
    }
    cb(null, true);
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max
  }
});

/**
 * GET /actual
 * Retrieve actual data with comprehensive filtering and pagination
 * 
 * @route GET /api/aebf/actual
 * @query {string} division - Division (FP)
 * @query {number} [page=1] - Page number
 * @query {number} [pageSize=100] - Records per page (max 1000)
 * @query {number} [year] - Filter by year
 * @query {number} [month] - Filter by month
 * @query {string} [values_type] - Filter by values type (AMOUNT, KGS, MORM)
 * @query {string} [salesrepname] - Filter by sales rep
 * @query {string} [customername] - Filter by customer
 * @query {string} [countryname] - Filter by country
 * @query {string} [productgroup] - Filter by product group
 * @query {string} [sortBy=year] - Sort field
 * @query {string} [sortOrder=desc] - Sort direction (asc/desc)
 * @query {string} [search] - Search term
 * @query {string} [types] - Comma-separated types to filter
 * @returns {object} 200 - Paginated actual data
 */
router.get('/actual', 
  queryLimiter, 
  cacheMiddleware({ ttl: CacheTTL.MEDIUM }), 
  paginationHelper,
  validationRules.getActual, 
  asyncHandler(async (req, res) => {
  const {
    division,
    page = 1,
    pageSize = 100,
    year,
    month,
    values_type,
    salesrepname,
    customername,
    countryname,
    productgroup,
    sortBy = 'year',
    sortOrder = 'desc',
    search,
    types
  } = req.query;
    
    const limit = Math.min(parseInt(pageSize) || 100, 1000);
    const offset = (parseInt(page) - 1) * limit;
    
    const conditions = ['UPPER(d.division) = $1'];
    const params = [division.toUpperCase()];
    let paramIndex = 2;
    
    // Handle type or types parameter
    if (types) {
      const typeArray = types.split(',').map(t => t.trim().toUpperCase());
      const typePlaceholders = typeArray.map((_, idx) => `$${paramIndex + idx}`).join(', ');
      conditions.push(`UPPER(d.type) IN (${typePlaceholders})`);
      params.push(...typeArray);
      paramIndex += typeArray.length;
    } else {
      conditions.push("UPPER(d.type) = 'ACTUAL'");
    }
    
    if (year) {
      conditions.push(`d.year = $${paramIndex}`);
      params.push(parseInt(year));
      paramIndex++;
    }
    
    if (month) {
      conditions.push(`d.month = $${paramIndex}`);
      params.push(parseInt(month));
      paramIndex++;
    }
    
    if (values_type) {
      conditions.push(`UPPER(d.values_type) = $${paramIndex}`);
      params.push(values_type.toUpperCase());
      paramIndex++;
    }
    
    if (salesrepname) {
      conditions.push(`UPPER(d.salesrepname) = $${paramIndex}`);
      params.push(salesrepname.toUpperCase());
      paramIndex++;
    }
    
    if (customername) {
      // Use customer_name_unified for merged customer names
      conditions.push(`UPPER(d.customer_name_unified) LIKE $${paramIndex}`);
      params.push(`%${customername.toUpperCase()}%`);
      paramIndex++;
    }
    
    if (countryname) {
      conditions.push(`UPPER(d.countryname) = $${paramIndex}`);
      params.push(countryname.toUpperCase());
      paramIndex++;
    }
    
    if (productgroup) {
      // Use pg_combine for standardized product groups
      conditions.push(`UPPER(d.pg_combine) LIKE $${paramIndex}`);
      params.push(`%${productgroup.toUpperCase()}%`);
      paramIndex++;
    }
    
    // Global search with month name recognition
    if (search) {
      const searchUpper = search.toUpperCase().trim();
      const searchPattern = `%${searchUpper}%`;
      
      const monthMap = {
        'JANUARY': 1, 'JAN': 1,
        'FEBRUARY': 2, 'FEB': 2,
        'MARCH': 3, 'MAR': 3,
        'APRIL': 4, 'APR': 4,
        'MAY': 5,
        'JUNE': 6, 'JUN': 6,
        'JULY': 7, 'JUL': 7,
        'AUGUST': 8, 'AUG': 8,
        'SEPTEMBER': 9, 'SEP': 9, 'SEPT': 9,
        'OCTOBER': 10, 'OCT': 10,
        'NOVEMBER': 11, 'NOV': 11,
        'DECEMBER': 12, 'DEC': 12
      };
      
      const monthNumber = monthMap[searchUpper];
      
      if (monthNumber) {
        conditions.push(`d.month = $${paramIndex}`);
        params.push(monthNumber);
      } else {
        // Note: material is not in fp_data_excel, it's looked up from material_percentages via JOIN
        conditions.push(`(
          UPPER(d.customername) LIKE $${paramIndex} OR 
          UPPER(d.countryname) LIKE $${paramIndex} OR 
          UPPER(d.productgroup) LIKE $${paramIndex} OR
          UPPER(d.salesrepname) LIKE $${paramIndex}
        )`);
        params.push(searchPattern);
      }
      paramIndex++;
    }
    
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    // SINGLE SOURCE OF TRUTH: Query fp_actualcommon (same as DivisionalBudgetTab)
    // This ensures Estimate tab shows actual data, not mixed fp_data_excel records
    
    // Step 1: Get year completion metadata for "ACTUAL" vs "ESTIMATE" labels
    const yearMetadataQuery = `
      SELECT 
        year,
        COUNT(DISTINCT month_no) as month_count,
        ROUND((COUNT(DISTINCT month_no)::numeric / 12 * 100), 0) as completion_percent,
        CASE WHEN COUNT(DISTINCT month_no) = 12 THEN 'ACTUAL' ELSE 'ESTIMATE' END as status
      FROM ${tables.actualcommon}
      WHERE UPPER(admin_division_code) = UPPER($1)
      GROUP BY year
      ORDER BY year DESC
    `;
    
    const yearMetadataResult = await divisionPool.query(yearMetadataQuery, [division]);
    const yearMetadata = {};
    console.log(`[DEBUG] yearMetadataQuery for division '${division}':`, yearMetadataQuery);
    console.log(`[DEBUG] yearMetadataResult rows:`, yearMetadataResult.rows);
    yearMetadataResult.rows.forEach(row => {
      yearMetadata[row.year] = {
        monthCount: parseInt(row.month_count), // Convert string to number
        completionPercent: parseInt(row.completion_percent),
        status: row.status
      };
    });
    
    // Step 2: Query fp_actualcommon directly (not fp_data_excel)
    // NOTE: fp_actualcommon is denormalized with only product group data
    // Columns: year, month_no, amount, qty_kgs, morm, pgcombine, admin_division_code
    // Exclude product groups from fp_product_group_exclusions table
    let actualcommonConditions = [
      'UPPER(a.admin_division_code) = UPPER($1)',
      'a.pgcombine IS NOT NULL',
      "TRIM(a.pgcombine) != ''",
      'e.product_group IS NULL'  // Exclude rows that match exclusion table
    ];
    let actualcommonParams = [division];
    let actualParamIndex = 2;
    
    if (year) {
      actualcommonConditions.push(`a.year = $${actualParamIndex}`);
      actualcommonParams.push(parseInt(year));
      actualParamIndex++;
    }
    
    if (month) {
      actualcommonConditions.push(`a.month_no = $${actualParamIndex}`);
      actualcommonParams.push(parseInt(month));
      actualParamIndex++;
    }
    
    if (productgroup) {
      actualcommonConditions.push(`UPPER(a.pgcombine) LIKE $${actualParamIndex}`);
      actualcommonParams.push(`%${productgroup.toUpperCase()}%`);
      actualParamIndex++;
    }
    
    // Global search - search in pgcombine only since that's what's available
    if (search) {
      const searchUpper = search.toUpperCase().trim();
      const searchPattern = `%${searchUpper}%`;
      actualcommonConditions.push(`UPPER(a.pgcombine) LIKE $${actualParamIndex}`);
      actualcommonParams.push(searchPattern);
      actualParamIndex++;
    }
    
    const actualcommonWhereClause = actualcommonConditions.join(' AND ');
    const validSortFields = ['year', 'month_no', 'amount', 'qty_kgs', 'morm', 'pgcombine'];
    const sortField = validSortFields.includes(sortBy) ? `a.${sortBy}` : 'a.year';
    const sortDirection = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    
    // Count query with exclusion JOIN
    const countQuery = `
      SELECT COUNT(*) as total
      FROM ${tables.actualcommon} a
      LEFT JOIN ${tables.productGroupExclusions} e
        ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
        AND UPPER(e.division_code) = UPPER($1)
      WHERE ${actualcommonWhereClause}
    `;
    const countResult = await divisionPool.query(countQuery, actualcommonParams);
    const total = parseInt(countResult.rows[0].total);
    
    // Add limit and offset to params BEFORE building query
    actualcommonParams.push(limit, offset);
    const limitParamIndex = actualParamIndex;
    const offsetParamIndex = actualParamIndex + 1;
    
    // Main data query with exclusion JOIN
    const dataQuery = `
      SELECT 
        ROW_NUMBER() OVER (ORDER BY a.year DESC, a.month_no DESC, a.pgcombine) as id,
        a.year, 
        a.month_no as month, 
        a.pgcombine as productgroup,
        a.amount, 
        a.qty_kgs, 
        a.morm,
        'Actual' as type, 
        'Oracle' as sourcesheet
      FROM ${tables.actualcommon} a
      LEFT JOIN ${tables.productGroupExclusions} e
        ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
        AND UPPER(e.division_code) = UPPER($1)
      WHERE ${actualcommonWhereClause}
      ORDER BY ${sortField} ${sortDirection}
      LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
    `;
    
    const dataResult = await divisionPool.query(dataQuery, actualcommonParams);
    
    // Attach year status to each record
    const enrichedData = dataResult.rows.map(row => ({
      ...row,
      yearStatus: yearMetadata[row.year]?.status || 'ESTIMATE'
    }));
    
    const appliedFilters = { division };
    if (year) appliedFilters.year = year;
    if (month) appliedFilters.month = month;
    if (values_type) appliedFilters.values_type = values_type;
    if (salesrepname) appliedFilters.salesrepname = salesrepname;
    if (customername) appliedFilters.customername = customername;
    if (countryname) appliedFilters.countryname = countryname;
    if (productgroup) appliedFilters.productgroup = productgroup;
    if (search) appliedFilters.search = search;
    if (sortBy) appliedFilters.sortBy = sortBy;
    if (sortOrder) appliedFilters.sortOrder = sortOrder;
  
  console.log(`[DEBUG] Sending yearMetadata to frontend:`, yearMetadata);
  
  successResponse(res, {
    data: enrichedData,
    yearMetadata: yearMetadata,  // Include year status (ACTUAL vs ESTIMATE)
    pagination: {
      total,
      page: parseInt(page),
      pageSize: limit,
      totalPages: Math.ceil(total / limit)
    },
    filters: appliedFilters
  });
}));

/**
 * GET /summary
 * Get summary statistics aggregated by type and values_type
 * 
 * @route GET /api/aebf/summary
 * @query {string} division - Division (FP)
 * @query {string} [type] - Filter by type
 * @returns {object} 200 - Summary statistics
 */
router.get('/summary', queryLimiter, cacheMiddleware({ ttl: CacheTTL.MEDIUM }), validationRules.getSummary, asyncHandler(async (req, res) => {
  const { division, type } = req.query;
  
  // Use admin_division_code for fp_actualcommon (supports FP combining Oracle FP + BF)
  const conditions = ['UPPER(d.admin_division_code) = $1'];
  const params = [division.toUpperCase()];
  
  if (type) {
    conditions.push("UPPER(d.type) = $2");
    params.push(type.toUpperCase());
  }
  
  const whereClause = conditions.join(' AND ');
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  // Use fp_actualcommon - main actual sales data table
  const summaryQuery = `
    SELECT 
      d.type,
      d.values_type,
      COUNT(*) as record_count,
      SUM(d.values) as total_values,
      AVG(d.values) as avg_values,
      MIN(d.values) as min_values,
      MAX(d.values) as max_values
    FROM fp_actualcommon d
    WHERE ${whereClause}
    GROUP BY d.type, d.values_type
    ORDER BY d.values_type
  `;
  
  const result = await divisionPool.query(summaryQuery, params);
  
  successResponse(res, { summary: result.rows });
}));

/**
 * GET /year-summary
 * Get year-specific summary statistics with optional search
 * 
 * @route GET /api/aebf/year-summary
 * @query {string} division - Division (FP)
 * @query {string} [type] - Filter by type
 * @query {number} [year] - Filter by year
 * @query {string} [search] - Search term
 * @returns {object} 200 - Year-specific summary
 */
router.get('/year-summary', queryLimiter, cacheMiddleware({ ttl: CacheTTL.MEDIUM }), validationRules.getYearSummary, asyncHandler(async (req, res) => {
  const { division, year, search, type } = req.query;
  
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  const normalizedType = (type || 'ACTUAL').toUpperCase();

  if (normalizedType === 'BUDGET') {
    let conditions = [
      'UPPER(b.division_code) = UPPER($1)',
      'b.pgcombine IS NOT NULL',
      "TRIM(b.pgcombine) != ''",
      'e.product_group IS NULL'
    ];
    const queryParams = [division];
    let paramIndex = 2;

    if (year) {
      conditions.push(`b.budget_year = $${paramIndex}`);
      queryParams.push(parseInt(year));
      paramIndex++;
    }

    if (search && search.trim()) {
      const searchPattern = `%${search.trim().toUpperCase()}%`;
      conditions.push(`(
        UPPER(b.customer_name) LIKE $${paramIndex} OR
        UPPER(b.sales_rep_name) LIKE $${paramIndex} OR
        UPPER(b.country) LIKE $${paramIndex} OR
        UPPER(b.pgcombine) LIKE $${paramIndex}
      )`);
      queryParams.push(searchPattern);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const summaryQuery = `
      SELECT 'AMOUNT' as values_type, COUNT(*) as record_count, SUM(b.amount) as total_values
      FROM ${tables.budgetUnified} b
      LEFT JOIN ${tables.productGroupExclusions} e
        ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
        AND UPPER(e.division_code) = UPPER($1)
      WHERE ${whereClause}
      
      UNION ALL
      
      SELECT 'KGS' as values_type, COUNT(*) as record_count, SUM(b.qty_kgs) as total_values
      FROM ${tables.budgetUnified} b
      LEFT JOIN ${tables.productGroupExclusions} e
        ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
        AND UPPER(e.division_code) = UPPER($1)
      WHERE ${whereClause}
      
      UNION ALL
      
      SELECT 'MORM' as values_type, COUNT(*) as record_count, SUM(b.morm) as total_values
      FROM ${tables.budgetUnified} b
      LEFT JOIN ${tables.productGroupExclusions} e
        ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
        AND UPPER(e.division_code) = UPPER($1)
      WHERE ${whereClause}
    `;

    const result = await divisionPool.query(summaryQuery, queryParams);
    return successResponse(res, { summary: result.rows });
  }

  // Default: Actual summary from fp_actualcommon with exclusions
  let conditions = [
    'UPPER(a.admin_division_code) = UPPER($1)',
    'a.pgcombine IS NOT NULL',
    "TRIM(a.pgcombine) != ''",
    'e.product_group IS NULL'
  ];
  const queryParams = [division];
  let paramIndex = 2;
  
  if (year) {
    conditions.push(`a.year = $${paramIndex}`);
    queryParams.push(parseInt(year));
    paramIndex++;
  }
  
  if (search && search.trim()) {
    const searchPattern = `%${search.trim().toUpperCase()}%`;
    conditions.push(`UPPER(a.pgcombine) LIKE $${paramIndex}`);
    queryParams.push(searchPattern);
    paramIndex++;
  }
  
  const whereClause = conditions.join(' AND ');
  
  const summaryQuery = `
    SELECT 'AMOUNT' as values_type, COUNT(*) as record_count, SUM(a.amount) as total_values
    FROM ${tables.actualcommon} a
    LEFT JOIN ${tables.productGroupExclusions} e
      ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
      AND UPPER(e.division_code) = UPPER($1)
    WHERE ${whereClause}
    
    UNION ALL
    
    SELECT 'KGS' as values_type, COUNT(*) as record_count, SUM(a.qty_kgs) as total_values
    FROM ${tables.actualcommon} a
    LEFT JOIN ${tables.productGroupExclusions} e
      ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
      AND UPPER(e.division_code) = UPPER($1)
    WHERE ${whereClause}
    
    UNION ALL
    
    SELECT 'MORM' as values_type, COUNT(*) as record_count, SUM(a.morm) as total_values
    FROM ${tables.actualcommon} a
    LEFT JOIN ${tables.productGroupExclusions} e
      ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
      AND UPPER(e.division_code) = UPPER($1)
    WHERE ${whereClause}
  `;
  
  const result = await divisionPool.query(summaryQuery, queryParams);
  
  successResponse(res, { summary: result.rows });
}));

/**
 * GET /filter-options
 * Get all unique values for filterable columns
 * 
 * @route GET /api/aebf/filter-options
 * @query {string} division - Division (FP)
 * @query {string} [type] - Filter by type
 * @returns {object} 200 - Filter options with all unique values
 */
router.get('/filter-options', queryLimiter, cacheMiddleware({ ttl: CacheTTL.LONG }), validationRules.getFilterOptions, asyncHandler(async (req, res) => {
  const { division, type } = req.query;
  
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  // Query fp_actualcommon for filter options (actual data)
  // For Budget type, query fp_budget_unified instead
  if (type && type.toUpperCase() === 'BUDGET') {
    const filterOptionsQuery = `
      SELECT 
        ARRAY_AGG(DISTINCT budget_year ORDER BY budget_year DESC) FILTER (WHERE budget_year IS NOT NULL) as years
      FROM ${tables.budgetUnified}
      WHERE UPPER(division_code) = UPPER($1)
    `;
    
    const result = await divisionPool.query(filterOptionsQuery, [division]);
    const row = result.rows[0];
    
    const filterOptions = {
      year: row.years || [],
      month: [],
      salesrepname: [],
      customername: [],
      countryname: [],
      productgroup: [],
      material: [],
      values_type: []
    };
    
    return successResponse(res, { filterOptions });
  }
  
  // For Actual type, query fp_actualcommon
  const filterOptionsQuery = `
    SELECT 
      ARRAY_AGG(DISTINCT year ORDER BY year DESC) FILTER (WHERE year IS NOT NULL) as years,
      ARRAY_AGG(DISTINCT month_no ORDER BY month_no) FILTER (WHERE month_no IS NOT NULL) as months,
      ARRAY_AGG(DISTINCT division_code ORDER BY division_code) FILTER (WHERE division_code IS NOT NULL) as divisions,
      ARRAY_AGG(DISTINCT pgcombine ORDER BY pgcombine) FILTER (WHERE pgcombine IS NOT NULL) as productgroups
    FROM ${tables.actualcommon}
    WHERE UPPER(admin_division_code) = UPPER($1)
  `;
  
  const result = await divisionPool.query(filterOptionsQuery, [division]);
  const row = result.rows[0];
  
  // Get year metadata (month count, ACTUAL vs ESTIMATE status)
  // Excludes product groups from fp_product_group_exclusions table only
  const yearMetadataQuery = `
    SELECT 
      a.year,
      COUNT(DISTINCT a.month_no) as month_count,
      ROUND((COUNT(DISTINCT a.month_no)::numeric / 12 * 100), 0) as completion_percent,
      CASE WHEN COUNT(DISTINCT a.month_no) = 12 THEN 'ACTUAL' ELSE 'ESTIMATE' END as status
    FROM ${tables.actualcommon} a
    LEFT JOIN ${tables.productGroupExclusions} e
      ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
      AND UPPER(e.division_code) = UPPER($1)
    WHERE UPPER(a.admin_division_code) = UPPER($1)
      AND a.pgcombine IS NOT NULL
      AND TRIM(a.pgcombine) != ''
      AND e.product_group IS NULL
    GROUP BY a.year
    ORDER BY a.year DESC
  `;
  
  const yearMetadataResult = await divisionPool.query(yearMetadataQuery, [division]);
  const yearMetadata = {};
  yearMetadataResult.rows.forEach(row => {
    yearMetadata[row.year] = {
      monthCount: parseInt(row.month_count),
      completionPercent: parseInt(row.completion_percent),
      status: row.status
    };
  });
  
  const filterOptions = {
    year: row.years || [],
    month: row.months || [],
    salesrepname: [],
    customername: [],
    countryname: [],
    productgroup: row.productgroups || [],
    material: [],
    values_type: []
  };
  
  successResponse(res, { filterOptions, yearMetadata });
}));

/**
 * GET /distinct/:field
 * Get distinct values for a specific field
 * 
 * @route GET /api/aebf/distinct/:field
 * @param {string} field - Field name to get distinct values for
 * @query {string} division - Division (FP)
 * @query {string} [type] - Filter by type
 * @returns {object} 200 - Distinct values for the field
 */
router.get('/distinct/:field', queryLimiter, cacheMiddleware({ ttl: CacheTTL.LONG }), validationRules.getDistinct, asyncHandler(async (req, res) => {
  const { field } = req.params;
  const { division, type } = req.query;
  
  // Use admin_division_code for fp_actualcommon (supports FP combining Oracle FP + BF)
  const conditions = ['UPPER(admin_division_code) = $1'];
  const params = [division.toUpperCase()];
  
  if (type) {
    conditions.push("UPPER(type) = $2");
    params.push(type.toUpperCase());
  }
  
  const whereClause = conditions.join(' AND ');
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  // Use fp_actualcommon - main actual sales data table
  const distinctQuery = `
    SELECT DISTINCT ${field}
    FROM fp_actualcommon
    WHERE ${whereClause} AND ${field} IS NOT NULL
    ORDER BY ${field}
  `;
  
  const result = await divisionPool.query(distinctQuery, params);
  
  successResponse(res, {
    field,
    values: result.rows.map(row => row[field])
  });
}));

/**
 * GET /export
 * Export actual data in CSV format (max 10,000 records)
 * 
 * @route GET /api/aebf/export
 * @query {string} division - Division (FP)
 * @query {number} [year] - Filter by year
 * @query {number} [month] - Filter by month
 * @query {string} [values_type] - Filter by value type
 * @query {string} [types] - Comma-separated types filter
 * @query {string} [search] - Search across multiple fields
 * @query {string} [sortBy=year] - Field to sort by
 * @query {string} [sortOrder=desc] - Sort direction
 * @returns {file} 200 - CSV file download
 */
router.get('/export', exportLimiter, validationRules.exportData, asyncHandler(async (req, res) => {
  const {
    division, year, month, salesrepname, customername,
    countryname, productgroup, sortBy = 'year', sortOrder = 'desc',
    search
  } = req.query;
    
    // All column references prefixed with 'd.' for fp_actualcommon table
    const conditions = ['UPPER(d.admin_division_code) = $1'];
    const params = [division.toUpperCase()];
    let paramIndex = 2;
    
    if (year) {
      conditions.push(`d.year = $${paramIndex}`);
      params.push(parseInt(year));
      paramIndex++;
    }
    
    if (month) {
      conditions.push(`d.month_no = $${paramIndex}`);
      params.push(parseInt(month));
      paramIndex++;
    }
    
    if (salesrepname) {
      conditions.push(`UPPER(d.sales_rep_name) = $${paramIndex}`);
      params.push(salesrepname.toUpperCase());
      paramIndex++;
    }
    
    if (customername) {
      conditions.push(`UPPER(d.customer_name) LIKE $${paramIndex}`);
      params.push(`%${customername.toUpperCase()}%`);
      paramIndex++;
    }
    
    if (countryname) {
      conditions.push(`UPPER(d.country) = $${paramIndex}`);
      params.push(countryname.toUpperCase());
      paramIndex++;
    }
    
    if (productgroup) {
      conditions.push(`UPPER(d.pgcombine) LIKE $${paramIndex}`);
      params.push(`%${productgroup.toUpperCase()}%`);
      paramIndex++;
    }
    
    if (search) {
      const searchUpper = search.toUpperCase().trim();
      const searchPattern = `%${searchUpper}%`;
      
      const monthMap = {
        'JANUARY': 1, 'JAN': 1, 'FEBRUARY': 2, 'FEB': 2, 'MARCH': 3, 'MAR': 3,
        'APRIL': 4, 'APR': 4, 'MAY': 5, 'JUNE': 6, 'JUN': 6, 'JULY': 7, 'JUL': 7,
        'AUGUST': 8, 'AUG': 8, 'SEPTEMBER': 9, 'SEP': 9, 'SEPT': 9,
        'OCTOBER': 10, 'OCT': 10, 'NOVEMBER': 11, 'NOV': 11, 'DECEMBER': 12, 'DEC': 12
      };
      
      const monthNumber = monthMap[searchUpper];
      
      if (monthNumber) {
        conditions.push(`d.month_no = $${paramIndex}`);
        params.push(monthNumber);
      } else {
        conditions.push(`(
          UPPER(d.customer_name) LIKE $${paramIndex} OR 
          UPPER(d.country) LIKE $${paramIndex} OR 
          UPPER(d.pgcombine) LIKE $${paramIndex} OR
          UPPER(d.sales_rep_name) LIKE $${paramIndex}
        )`);
        params.push(searchPattern);
      }
      paramIndex++;
    }
    
    const whereClause = conditions.join(' AND ');
    
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    // Get ALL product groups from budget in order (source of truth for PG list)
    const budgetPgQuery = `
      SELECT pgcombine, MIN(id) as first_id
      FROM ${tables.budgetUnified}
      WHERE pgcombine IS NOT NULL AND TRIM(pgcombine) != ''
      GROUP BY pgcombine
      ORDER BY MIN(id)
    `;
    const budgetPgResult = await divisionPool.query(budgetPgQuery);
    const allProductGroups = budgetPgResult.rows.map(row => row.pgcombine);
    
    // Get actual data aggregated by product group
    const actualQuery = `
      SELECT 
        d.pgcombine,
        SUM(d.qty_kgs) as kgs,
        SUM(d.amount) as sales,
        SUM(d.morm) as morm,
        SUM(d.material_value) as material_value
      FROM ${tables.actualcommon} d
      WHERE UPPER(d.admin_division_code) = $1
        ${year ? 'AND d.year = $2' : ''}
      GROUP BY d.pgcombine
    `;
    const actualParams = year ? [division.toUpperCase(), parseInt(year)] : [division.toUpperCase()];
    const actualResult = await divisionPool.query(actualQuery, actualParams);
    
    // Create lookup map for actual data
    const actualDataMap = {};
    actualResult.rows.forEach(row => {
      actualDataMap[row.pgcombine] = {
        kgs: parseFloat(row.kgs) || 0,
        sales: parseFloat(row.sales) || 0,
        morm: parseFloat(row.morm) || 0,
        material_value: parseFloat(row.material_value) || 0
      };
    });
    
    // Build export rows for ALL product groups from budget (in order)
    const exportRows = allProductGroups.map(pg => {
      const data = actualDataMap[pg] || { kgs: 0, sales: 0, morm: 0, material_value: 0 };
      const kgs = data.kgs;
      const sales = data.sales;
      const morm = data.morm;
      const material_value = data.material_value;
      
      return {
        'Product Group': pg,
        'KGS': Math.round(kgs),
        'Sales': Math.round(sales),
        'MoRM': Math.round(morm),
        'Sls/Kg': kgs > 0 ? (sales / kgs).toFixed(2) : '0.00',
        'RM/Kg': kgs > 0 ? (material_value / kgs).toFixed(2) : '0.00',
        'MoRM/Kg': kgs > 0 ? (morm / kgs).toFixed(2) : '0.00',
        'MoRM %': sales > 0 ? (morm / sales * 100).toFixed(1) : '0.0'
      };
    });
    
    if (exportRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No product groups found'
      });
    }
    
    const headers = ['Product Group', 'KGS', 'Sales', 'MoRM', 'Sls/Kg', 'RM/Kg', 'MoRM/Kg', 'MoRM %'];
    const csvRows = [
      headers.join('\t'),  // Tab-separated for Excel
      ...exportRows.map(row => 
        headers.map(header => {
          const value = row[header];
          if (value === null || value === undefined) return '';
          return String(value);
        }).join('\t')
      )
    ];
    
    const csv = csvRows.join('\n');
    
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const dateTime = `${dateStr}-${timeStr}`;
    
    let filename = `Actual-Sales-${division.toUpperCase()}`;
    if (year) filename += `-${year}`;
    filename += `-${dateTime}.xls`;  // Excel-compatible tab-separated
    
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
}));

/**
 * POST /upload-actual
 * Upload actual data Excel file and process via PowerShell script
 * 
 * @route POST /api/aebf/upload-actual
 * @body {string} division - Division (FP)
 * @body {string} uploadMode - Upload mode (upsert or replace)
 * @body {string} uploadedBy - User performing the upload
 * @body {string} [selectiveMode] - Enable selective year/month upload
 * @body {string} [selectedYearMonths] - JSON array of selected year-month combinations
 * @file {file} file - Excel file to upload
 * @returns {object} 200 - Upload success with processing details
 */
// Custom validation middleware that works with multer multipart/form-data
const validateUploadFields = (req, res, next) => {
  // Multer has already parsed the form data into req.body
  const { division, uploadMode, uploadedBy } = req.body;
  const errors = [];
  
  // Get valid divisions (sync - cached)
  const validDivisions = getValidDivisionsSync();
  
  if (!division || !division.trim()) {
    errors.push({ param: 'division', msg: 'Division is required' });
  } else if (!validDivisions.includes(division.toUpperCase())) {
    errors.push({ param: 'division', msg: `Division must be one of: ${validDivisions.join(', ')}` });
  }
  
  if (!uploadMode || !uploadMode.trim()) {
    errors.push({ param: 'uploadMode', msg: 'Upload mode is required' });
  } else if (!['upsert', 'replace'].includes(uploadMode.toLowerCase())) {
    errors.push({ param: 'uploadMode', msg: 'Upload mode must be one of: upsert, replace' });
  }
  
  if (!uploadedBy || !uploadedBy.trim()) {
    errors.push({ param: 'uploadedBy', msg: 'Uploaded by is required' });
  } else if (uploadedBy.trim().length < 1 || uploadedBy.trim().length > 100) {
    errors.push({ param: 'uploadedBy', msg: 'Uploaded by must be between 1 and 100 characters' });
  }
  
  if (errors.length > 0) {
    logger.warn('Upload validation failed:', { errors, body: req.body });
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      message: errors.map(e => `${e.param}: ${e.msg}`).join('; '),
      details: errors
    });
  }
  
  next();
};

// Debug middleware to log incoming request before multer processes it
const debugUploadRequest = (req, res, next) => {
  logger.info('📥 Incoming actual upload request:', {
    contentType: req.headers['content-type'],
    hasBody: !!req.body,
    bodyKeys: req.body ? Object.keys(req.body) : [],
    method: req.method
  });
  next();
};

router.post('/upload-actual', uploadLimiter, debugUploadRequest, upload.single('file'), validateUploadFields, asyncHandler(async (req, res) => {
  // Debug: Log req.file and req.body after multer processing
  logger.info('📤 After multer - actual request data:', {
    hasFile: !!req.file,
    fileName: req.file?.originalname,
    body: req.body
  });
  
  // Check if file was uploaded
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded. Please select an Excel file to upload.',
      hint: 'Make sure Content-Type is multipart/form-data'
    });
  }
  
  const { division, uploadMode, uploadedBy, currency } = req.body;
  
  const filePath = req.file.path;
  
  logger.info('📤 Upload request received:', {
    division,
    uploadMode,
    uploadedBy,
    currency: currency || 'AED',
    fileName: req.file.originalname,
    fileSize: req.file.size
  });
    
    const scriptPath = path.join(__dirname, '../../../scripts/transform-actual-to-sql.ps1');
    
    if (!fs.existsSync(scriptPath)) {
      return res.status(500).json({
        success: false,
        error: 'Transform script not found'
      });
    }
    
    logger.info('🔄 Executing PowerShell script...');
    
    const psArgs = [
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-ExcelPath', filePath,
      '-Currency', currency || 'AED',
      '-Division', division.toUpperCase(),
      '-UploadMode', uploadMode.toLowerCase(),
      '-UploadedBy', uploadedBy
    ];
    
    if (req.body.selectiveMode === 'true' && req.body.selectedYearMonths) {
      try {
        const selectedYearMonths = JSON.parse(req.body.selectedYearMonths);
        if (Array.isArray(selectedYearMonths) && selectedYearMonths.length > 0) {
          psArgs.push('-SelectiveYearMonths', selectedYearMonths.join(','));
          logger.info('📅 Selective mode enabled:', selectedYearMonths);
        }
      } catch (parseError) {
        logger.warn('Failed to parse selectedYearMonths:', parseError);
        // Continue without selective mode if parsing fails
      }
    }
    
    const psProcess = spawn('powershell.exe', psArgs);
    
    let stdout = '';
    let stderr = '';
    let responseSent = false;
    
    // Set timeout for PowerShell process (10 minutes = 600000ms)
    const PROCESS_TIMEOUT = 600000; // 10 minutes
    const timeoutId = setTimeout(() => {
      if (!responseSent) {
        responseSent = true;
        logger.error('⏱️  PowerShell script timeout after 10 minutes');
        
        // Kill the process
        try {
          psProcess.kill('SIGTERM');
          // Force kill after 5 seconds if still running
          setTimeout(() => {
            try {
              psProcess.kill('SIGKILL');
            } catch (e) {
              logger.error('Failed to force kill process:', e);
            }
          }, 5000);
        } catch (err) {
          logger.error('Failed to kill process:', err);
        }
        
        // Clean up file
        try {
          fs.unlinkSync(filePath);
          logger.info('✅ Cleaned up uploaded file after timeout');
        } catch (err) {
          logger.error('⚠️  Failed to clean up file:', err);
        }
        
        res.status(504).json({
          success: false,
          error: 'Upload timeout: The process took longer than 10 minutes. The file may be too large or the database is slow. Please try with a smaller file or check database performance.',
          timeout: true
        });
      }
    }, PROCESS_TIMEOUT);
    
    psProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      logger.info(output);
    });
    
    psProcess.stderr.on('data', (data) => {
      const error = data.toString();
      stderr += error;
      logger.error(error);
    });
    
    psProcess.on('close', (code) => {
      clearTimeout(timeoutId);
      
      if (responseSent) {
        logger.warn('Process closed but response already sent (timeout)');
        return;
      }
      
      responseSent = true;
      logger.info(`PowerShell script exited with code ${code}`);
      
      try {
        fs.unlinkSync(filePath);
        logger.info('✅ Cleaned up uploaded file');
      } catch (err) {
        logger.error('⚠️  Failed to clean up file:', err);
      }
      
      if (code === 0) {
        const recordsMatch = stdout.match(/Total records processed: (\d+)/);
        const recordsAffected = recordsMatch ? parseInt(recordsMatch[1]) : 0;
        
        // Invalidate cache after successful upload
        invalidateCache('aebf:*').catch(err => 
          logger.warn('Cache invalidation warning:', err.message)
        );
        
        // Auto-register new sales reps to master table (non-blocking)
        autoRegisterSalesReps(division, 'Actual')
          .then(regResult => {
            if (regResult.added > 0) {
              logger.info(`🆕 Auto-registered ${regResult.added} new sales reps to master table`);
            }
          })
          .catch(err => {
            logger.warn('Auto-registration warning:', err.message);
          });
        
        // Recalculate customer active status after new data import (non-blocking)
        recalculateCustomerStatus().catch(err => {
          logger.warn('Customer status recalculation warning:', err.message);
        });
        
        // Refresh unified data stats after upload (non-blocking)
        refreshUnifiedStats()
          .then(unifiedResult => {
            if (unifiedResult.customers_updated || unifiedResult.reps_updated) {
              logger.info(`📊 Unified stats refreshed: ${unifiedResult.customers_updated} customers, ${unifiedResult.reps_updated} reps, ${unifiedResult.pgs_updated} PGs, ${unifiedResult.mv_refreshed} MVs`);
            }
          })
          .catch(err => {
            logger.warn('Unified stats refresh warning:', err.message);
          });
        
        res.json({
          success: true,
          message: 'Upload completed successfully',
          division: division.toUpperCase(),
          uploadMode,
          uploadedBy,
          recordsAffected,
          output: stdout,
          logFile: stdout.match(/Log file: (.+)/)?.[1]
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'PowerShell script failed',
          details: stderr || stdout,
          exitCode: code
        });
      }
    });
    
    psProcess.on('error', (error) => {
      clearTimeout(timeoutId);
      
      if (responseSent) {
        logger.warn('Process error but response already sent');
        return;
      }
      
      responseSent = true;
      logger.error('❌ Failed to start PowerShell script:', error);
      
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        logger.error('Failed to clean up file:', err);
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to execute transform script',
        details: error.message
      });
    });
}));

/**
 * POST /analyze-file
 * Analyze Excel file to extract year/month combinations before upload
 * 
 * @route POST /api/aebf/analyze-file
 * @file {file} file - Excel file to analyze
 * @returns {object} 200 - Year/month combinations with record counts
 */
router.post('/analyze-file', uploadLimiter, upload.single('file'), validationRules.analyzeFile, asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ErrorCreators.validationError('No file uploaded');
  }
  
  const filePath = req.file.path;
  logger.info('📊 Analyzing file:', filePath);
  
  const XLSX = require('xlsx');
  const workbook = XLSX.readFile(filePath);
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(firstSheet);
    
    const yearMonthMap = new Map();
    
    data.forEach(row => {
      if (row.year && row.month && row.customername) {
        const key = `${row.year}-${row.month}`;
        if (yearMonthMap.has(key)) {
          yearMonthMap.set(key, yearMonthMap.get(key) + 1);
        } else {
          yearMonthMap.set(key, 1);
        }
      }
    });
    
    const yearMonths = Array.from(yearMonthMap.entries())
      .map(([key, count]) => {
        const [year, month] = key.split('-').map(Number);
        return { year, month, count };
      })
      .sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.month - b.month;
      });
    
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      logger.error('Failed to clean up file:', err);
    }
    
    successResponse(res, {
      yearMonths,
      totalRecords: data.length,
      totalPeriods: yearMonths.length
    });
}));

/**
 * GET /available-months
 * Get available actual months for estimation purposes
 * 
 * @route GET /api/aebf/available-months
 * @query {string} division - Division (FP)
 * @query {number} year - Year to get months for
 * @returns {object} 200 - Available months array
 */
router.get('/available-months', queryLimiter, cacheMiddleware({ ttl: CacheTTL.LONG }), validationRules.getAvailableMonths, asyncHandler(async (req, res) => {
  const { division, year } = req.query;
  
  logger.info('📅 Get available months request:', { division, year });
  
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  // Use fp_actualcommon with admin_division_code (supports FP combining Oracle FP + BF)
  const query = `
    SELECT DISTINCT month
    FROM fp_actualcommon
    WHERE UPPER(admin_division_code) = $1 AND UPPER(type) = 'ACTUAL' AND year = $2
    ORDER BY month
  `;
  
  const result = await divisionPool.query(query, [division.toUpperCase(), parseInt(year)]);
  const months = result.rows.map(row => row.month);
  
  logger.info(`✅ Found ${months.length} Actual months:`, months);
  
  successResponse(res, { months });
}));

/**
 * GET /product-group-totals
 * Get yearly totals by product group from fp_actualcommon
 * Used by ForecastTab for base year data
 * 
 * @route GET /api/aebf/product-group-totals
 * @query {string} division - Division (FP)
 * @query {number} year - Year to fetch totals for
 * @returns {object} 200 - Product group totals with calculated metrics
 */
router.get('/product-group-totals', queryLimiter, cacheMiddleware({ ttl: CacheTTL.MEDIUM }), asyncHandler(async (req, res) => {
  const { division, year } = req.query;
  
  if (!division || !year) {
    return res.status(400).json({ success: false, error: 'Division and year are required' });
  }
  
  logger.info('📊 Get product group totals request:', { division, year });
  
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  const query = `
    SELECT 
      a.pgcombine,
      SUM(a.amount) as total_amount,
      SUM(a.qty_kgs) as total_kgs,
      SUM(a.morm) as total_morm
    FROM ${tables.actualcommon} a
    LEFT JOIN ${tables.productGroupExclusions} e
      ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
      AND UPPER(e.division_code) = UPPER($1)
    WHERE UPPER(a.admin_division_code) = UPPER($1)
      AND a.year = $2
      AND a.pgcombine IS NOT NULL
      AND TRIM(a.pgcombine) != ''
      AND e.product_group IS NULL
    GROUP BY a.pgcombine
    ORDER BY a.pgcombine
  `;
  
  const result = await divisionPool.query(query, [division.toUpperCase(), parseInt(year)]);
  
  // Transform to object keyed by product group with calculated metrics
  const productGroups = {};
  result.rows.forEach(row => {
    const kgs = parseFloat(row.total_kgs) || 0;
    const sales = parseFloat(row.total_amount) || 0;
    const morm = parseFloat(row.total_morm) || 0;
    
    productGroups[row.pgcombine] = {
      kgs,
      sales,
      morm,
      slsPerKg: kgs > 0 ? sales / kgs : 0,
      rmPerKg: kgs > 0 ? (sales - morm) / kgs : 0,
      mormPerKg: kgs > 0 ? morm / kgs : 0,
      mormPercent: sales > 0 ? (morm / sales) * 100 : 0
    };
  });
  
  logger.info(`✅ Found ${Object.keys(productGroups).length} product groups for year ${year}`);
  
  successResponse(res, { productGroups, year: parseInt(year), division: division.toUpperCase() });
}));

module.exports = router;
