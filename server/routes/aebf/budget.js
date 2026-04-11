/**
 * @fileoverview AEBF Budget Routes
 * @module routes/aebf/budget
 * @description Handles budget operations including uploads, estimates calculation, and sales rep recaps
 * 
 * @requires express
 * @requires multer File upload middleware for Excel files
 * @requires child_process For PowerShell script execution
 * 
 * @routes
 * - GET  /budget                   - Retrieve paginated budget data with search
 * - POST /upload-budget            - Upload budget Excel file via PowerShell
 * - POST /calculate-estimate       - Calculate estimates from actual base period
 * - POST /save-estimate            - Save estimates with proportional distribution
 * - GET  /budget-years             - Get available budget years from sales_rep_budget table
 * - POST /budget-sales-rep-recap   - Get sales rep budget totals (Amount, KGS, MoRM)
 * 
 * @algorithms
 * - Proportional Distribution: Calculates dimension share of base period total, applies to monthly estimate
 * - Simple Averaging: Total÷Months for uniform distribution
 * - Base Period Exclusion: Excludes selected months from actual base calculations
 * 
 * @features
 * - Transaction handling for data consistency
 * - Batch inserts (500 records per batch)
 * - PowerShell integration for Excel processing
 * - Multi-dimensional estimate distribution
 * - Sales rep performance recaps
 * 
 * @validation All routes use express-validator middleware
 * @errorHandling Centralized error handler with transaction rollback
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const logger = require('../../utils/logger');
const { getPoolForDivision, getTableNames, extractDivisionCode } = require('./shared');
const { asyncHandler, successResponse, ErrorCreators } = require('../../middleware/aebfErrorHandler');
const validationRules = require('../../middleware/aebfValidation');
const { queryLimiter, uploadLimiter } = require('../../middleware/rateLimiter');
const { cacheMiddleware, CacheTTL, invalidateCache } = require('../../middleware/cache');
const { autoRegisterSalesReps } = require('../../services/salesRepAutoRegister');

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
    cb(null, `aebf-budget-${timestamp}${ext}`);
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
 * GET /budget
 * Retrieve Budget data with pagination and filters
 * 
 * @route GET /api/aebf/budget
 * @query {string} division - Division (FP)
 * @query {number} [year] - Filter by year
 * @query {number} [month] - Filter by month
 * @query {string} [search] - Search across multiple fields
 * @query {number} [page=1] - Page number
 * @query {number} [pageSize=50] - Records per page
 * @returns {object} 200 - Paginated budget data with summary
 */
router.get('/budget', queryLimiter, cacheMiddleware({ ttl: CacheTTL.LONG }), validationRules.getBudget, asyncHandler(async (req, res) => {
  const { division, year, month, search, page, pageSize } = req.query;
  
  logger.info('📊 Get budget data request:', { division, year, month, search, page, pageSize });
  
    const tables = getTableNames(division);
    const divisionPool = getPoolForDivision(division);
    
    // Build WHERE clause - using fp_budget_unified table
    let whereClause = 'UPPER(b.division_code) = UPPER($1)';
    const params = [division.toUpperCase()];
    let paramIndex = 2;
    
    if (year) {
      whereClause += ` AND b.budget_year = $${paramIndex}`;
      params.push(parseInt(year));
      paramIndex++;
    }
    
    if (month) {
      whereClause += ` AND b.month_no = $${paramIndex}`;
      params.push(parseInt(month));
      paramIndex++;
    }
    
    if (search) {
      whereClause += ` AND (
        UPPER(b.customer_name) LIKE $${paramIndex} OR
        UPPER(b.sales_rep_name) LIKE $${paramIndex} OR
        UPPER(b.country) LIKE $${paramIndex} OR
        UPPER(b.pgcombine) LIKE $${paramIndex}
      )`;
      params.push(`%${search.toUpperCase()}%`);
      paramIndex++;
    }
    
    const currentPage = parseInt(page) || 1;
    const limit = parseInt(pageSize) || 50;
    const offset = (currentPage - 1) * limit;
    
    // Count query - using fp_budget_unified
    const countQuery = `
      SELECT COUNT(*) 
      FROM ${tables.budgetUnified} b
      LEFT JOIN ${tables.productGroupExclusions} e
        ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
        AND UPPER(e.division_code) = UPPER($1)
      WHERE ${whereClause}
        AND b.pgcombine IS NOT NULL
        AND TRIM(b.pgcombine) != ''
        AND e.product_group IS NULL
    `;
    const countResult = await divisionPool.query(countQuery, params);
    const totalRecords = parseInt(countResult.rows[0].count);
    
    // Data query from fp_budget_unified
    const query = `
      SELECT 
        b.id, 
        b.division_code as division, 
        b.budget_type as type, 
        b.budget_year as year, 
        b.month_no as month, 
        b.customer_name as customername, 
        b.sales_rep_name as salesrepname, 
        b.country as countryname, 
        b.pgcombine as productgroup,
        COALESCE(b.material, m.material, '') as material,
        COALESCE(b.process, m.process, '') as process,
        b.qty_kgs as kgs,
        b.amount,
        b.morm,
        b.updated_at, 
        b.created_by as uploaded_by
      FROM ${tables.budgetUnified} b
      LEFT JOIN ${tables.materialPercentages} m 
        ON LOWER(TRIM(b.pgcombine)) = LOWER(TRIM(m.product_group))
      LEFT JOIN ${tables.productGroupExclusions} e
        ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
        AND UPPER(e.division_code) = UPPER($1)
      WHERE ${whereClause}
        AND b.pgcombine IS NOT NULL
        AND TRIM(b.pgcombine) != ''
        AND e.product_group IS NULL
      ORDER BY b.budget_year DESC, b.month_no, b.customer_name
      LIMIT ${limit} OFFSET ${offset}
    `;
    
    const result = await divisionPool.query(query, params);
    
    // Transform rows to include values_type format for backward compatibility
    const transformedRows = [];
    result.rows.forEach(row => {
      // Create separate rows for KGS, AMOUNT, MORM to maintain legacy format
      if (row.kgs) {
        transformedRows.push({ ...row, values_type: 'KGS', values: row.kgs });
      }
      if (row.amount) {
        transformedRows.push({ ...row, values_type: 'AMOUNT', values: row.amount });
      }
      if (row.morm) {
        transformedRows.push({ ...row, values_type: 'MORM', values: row.morm });
      }
    });
    
    const summary = {
      totalAmount: result.rows.reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0),
      totalKgs: result.rows.reduce((sum, row) => sum + (parseFloat(row.kgs) || 0), 0),
      totalMorm: result.rows.reduce((sum, row) => sum + (parseFloat(row.morm) || 0), 0),
      recordCount: result.rows.length
    };
    
    logger.info(`✅ Found ${result.rows.length} budget records (page ${currentPage} of ${Math.ceil(totalRecords / limit)})`);
    
    successResponse(res, {
      data: transformedRows,
      summary,
      pagination: {
        page: currentPage,
        pageSize: limit,
        total: totalRecords
      }
    });
}));

/**
 * POST /upload-budget
 * Upload budget Excel file and process via PowerShell script
 * 
 * @route POST /api/aebf/upload-budget
 * @body {string} division - Division (FP)
 * @body {string} [uploadMode=replace] - Upload mode (upsert or replace)
 * @body {string} uploadedBy - User performing the upload
 * @body {string} [selectedYearMonths] - Selective year-month combinations
 * @file {file} file - Excel file to upload
 * @returns {object} 200 - Upload success with processing details
 */
// Debug middleware to log incoming request before multer processes it
const debugUploadRequest = (req, res, next) => {
  logger.info('📥 Incoming upload request:', {
    contentType: req.headers['content-type'],
    hasBody: !!req.body,
    bodyKeys: req.body ? Object.keys(req.body) : [],
    method: req.method
  });
  next();
};

router.post('/upload-budget', uploadLimiter, debugUploadRequest, upload.single('file'), validationRules.uploadBudget, asyncHandler(async (req, res) => {
  const { division, uploadMode, uploadedBy, selectedYearMonths, currency } = req.body;
  
  // Debug: Log req.file and req.body after multer processing
  logger.info('📤 After multer - request data:', {
    hasFile: !!req.file,
    fileName: req.file?.originalname,
    body: req.body
  });
  
  // Check if file was received
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded. Please ensure you are uploading a valid Excel file.',
      hint: 'Make sure Content-Type is multipart/form-data'
    });
  }
  
  const filePath = req.file.path;
  
  // Default currency to AED if not provided
  const currencyCode = currency || 'AED';
  
  logger.info('📤 Budget upload request received:', {
    division,
    uploadMode: uploadMode || 'replace',
    uploadedBy,
    selectedYearMonths,
    currency: currencyCode,
    fileName: req.file.originalname,
    fileSize: req.file.size
  });
  
  const mode = uploadMode ? uploadMode.toLowerCase() : 'replace';
    
    const scriptPath = path.join(__dirname, '../../../scripts/transform-budget-to-sql.ps1');
    
    if (!fs.existsSync(scriptPath)) {
      return res.status(500).json({
        success: false,
        error: 'Budget transform script not found'
      });
    }
    
    logger.info('🔄 Executing Budget PowerShell script...');
    
    const psArgs = [
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-ExcelPath', filePath,
      '-Division', division.toUpperCase(),
      '-UploadMode', mode,
      '-UploadedBy', uploadedBy,
      '-Currency', currencyCode
    ];
    
    if (selectedYearMonths) {
      psArgs.push('-SelectiveYearMonths', selectedYearMonths);
    }
    
    const psProcess = spawn('powershell.exe', psArgs);
    
    let stdout = '';
    let stderr = '';
    
    psProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      logger.info(output);
    });
    
    psProcess.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      logger.error(output);
    });
    
    psProcess.on('close', (code) => {
      try {
        fs.unlinkSync(filePath);
        logger.info('🗑️ Cleaned up uploaded file');
      } catch (err) {
        logger.error('Failed to clean up file:', err);
      }
      
      if (code === 0) {
        logger.info('✅ Budget upload completed successfully');
        
        // Invalidate cache after successful upload
        invalidateCache('aebf:*').catch(err => 
          logger.warn('Cache invalidation warning:', err.message)
        );
        
        // Auto-register new sales reps to master table (non-blocking)
        autoRegisterSalesReps(division, 'Budget')
          .then(regResult => {
            if (regResult.added > 0) {
              logger.info(`🆕 Auto-registered ${regResult.added} new sales reps to master table`);
            }
          })
          .catch(err => {
            logger.warn('Auto-registration warning:', err.message);
          });
        
        // Sync budget unified table (non-blocking)
        getPoolForDivision(division).query('SELECT refresh_budget_unified_stats()')
          .then(() => {
            logger.info('✅ Budget unified table synced after upload');
          })
          .catch(err => {
            logger.warn('⚠️ Budget unified sync failed (non-critical):', err.message);
          });
        
        res.json({
          success: true,
          message: 'Budget data uploaded successfully',
          output: stdout,
          mode: mode
        });
      } else {
        logger.error('❌ Budget upload failed with exit code:', code);
        res.status(500).json({
          success: false,
          error: 'Budget upload failed',
          details: stderr || stdout,
          exitCode: code
        });
      }
    });
    
    psProcess.on('error', (error) => {
      logger.error('❌ PowerShell process error:', error);
      
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        logger.error('Failed to clean up file:', err);
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to execute budget transform script',
        details: error.message
      });
    });
}));

/**
 * DELETE /clear-estimates
 * Clear all estimate records for a specific year
 * 
 * @route DELETE /api/aebf/clear-estimates
 * @query {string} division - Division (FP)
 * @query {number} year - Year to clear estimates for
 * @returns {object} 200 - Delete result with count
 */
router.delete('/clear-estimates', queryLimiter, asyncHandler(async (req, res) => {
  const { division, year } = req.query;
  
  if (!division || !year) {
    return res.status(400).json({
      success: false,
      error: 'Division and year are required'
    });
  }
  
  logger.info('🗑️ Clear estimates request:', { division, year });
  
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  // Get count before delete
  const countQuery = `
    SELECT COUNT(*) as count
    FROM public.${tables.actualData}
    WHERE UPPER(division) = $1 AND UPPER(type) = 'ESTIMATE' AND year = $2
  `;
  const countResult = await divisionPool.query(countQuery, [division.toUpperCase(), parseInt(year)]);
  const existingCount = parseInt(countResult.rows[0].count);
  
  if (existingCount === 0) {
    return successResponse(res, {
      deletedCount: 0,
      message: 'No estimate records found for this year'
    });
  }
  
  // Delete all estimates for the year
  const deleteQuery = `
    DELETE FROM public.${tables.actualData}
    WHERE UPPER(division) = $1 AND UPPER(type) = 'ESTIMATE' AND year = $2
  `;
  const deleteResult = await divisionPool.query(deleteQuery, [division.toUpperCase(), parseInt(year)]);
  
  logger.info(`🗑️ Deleted ${deleteResult.rowCount} estimate records for ${division} ${year}`);
  
  successResponse(res, {
    deletedCount: deleteResult.rowCount,
    message: `Successfully cleared ${deleteResult.rowCount} estimate records for ${year}`
  });
}));

/**
 * POST /calculate-estimate
 * Calculate estimates based on actual data using proportional distribution
 * 
 * @route POST /api/aebf/calculate-estimate
 * @body {string} division - Division (FP)
 * @body {number} year - Year to calculate estimates for
 * @body {array} selectedMonths - Months to estimate
 * @body {string} createdBy - User creating the estimate
 * @returns {object} 200 - Calculated estimates with monthly aggregates
 */
router.post('/calculate-estimate', queryLimiter, validationRules.calculateEstimate, asyncHandler(async (req, res) => {
  const { division, year, selectedMonths, createdBy } = req.body;
  
  logger.info('📊 Calculate estimate request:', { division, year, selectedMonths, createdBy });
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    const allMonthsQuery = `
      SELECT DISTINCT month
      FROM public.${tables.actualData}
      WHERE UPPER(division) = $1 AND UPPER(type) = 'ACTUAL' AND year = $2
      ORDER BY month
    `;
    
    const allMonthsResult = await divisionPool.query(allMonthsQuery, [division.toUpperCase(), year]);
    const allActualMonths = allMonthsResult.rows.map(row => row.month);
    
    logger.info('📅 All Actual months:', allActualMonths);
    
    const basePeriodMonths = allActualMonths.filter(m => !selectedMonths.includes(m));
    
    if (basePeriodMonths.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No base period months available for calculation. All Actual months are selected for estimation.'
      });
    }
    
    logger.info('📊 Base period months (for averaging):', basePeriodMonths);
    logger.info('🎯 Estimate months:', selectedMonths);
    
    // INNER JOIN to exclude unmapped products and is_unmapped = true
    const totalsQuery = `
      SELECT 
        d.values_type,
        SUM(d.values) as total_value,
        COUNT(*) as record_count
      FROM public.${tables.actualData} d
      INNER JOIN public.${tables.rawProductGroups} rpg 
        ON LOWER(TRIM(d.productgroup)) = LOWER(TRIM(rpg.raw_product_groups))
        AND (rpg.is_unmapped IS NULL OR rpg.is_unmapped = FALSE)
      WHERE UPPER(d.division) = $1 
        AND UPPER(d.type) = 'ACTUAL' 
        AND d.year = $2 
        AND d.month = ANY($3)
      GROUP BY d.values_type
      ORDER BY d.values_type
    `;
    
    const totalsResult = await divisionPool.query(totalsQuery, [
      division.toUpperCase(),
      year,
      basePeriodMonths
    ]);
    
    logger.info(`✅ Base period totals:`, totalsResult.rows);
    
    const monthlyAverages = {};
    totalsResult.rows.forEach(row => {
      const avgPerMonth = parseFloat(row.total_value) / basePeriodMonths.length;
      monthlyAverages[row.values_type] = {
        average: Math.round(avgPerMonth),
        totalRecords: parseInt(row.record_count)
      };
    });
    
    logger.info('📊 Monthly averages (Simple method - Total÷Months):', monthlyAverages);
    
    const monthlyAggregates = [];
    
    for (const month of selectedMonths.sort((a, b) => a - b)) {
      monthlyAggregates.push({
        month,
        amount: monthlyAverages['AMOUNT']?.average || 0,
        kgs: monthlyAverages['KGS']?.average || 0,
        morm: monthlyAverages['MORM']?.average || 0,
        recordCount: Math.round((monthlyAverages['AMOUNT']?.totalRecords || 0) / basePeriodMonths.length)
      });
    }
    
    logger.info('📈 Monthly aggregates calculated:', monthlyAggregates);
    
    successResponse(res, {
      estimates: monthlyAggregates,
      basePeriodMonths,
      estimatedMonths: selectedMonths.sort((a, b) => a - b),
      baseMonthCount: basePeriodMonths.length
    });
}));

/**
 * POST /save-estimate
 * Save approved estimates to database with proportional distribution
 * 
 * @route POST /api/aebf/save-estimate
 * @body {string} division - Division (FP)
 * @body {number} year - Year for estimates
 * @body {object} estimates - Estimates object with month keys
 * @body {string} approvedBy - User approving the estimates
 * @returns {object} 200 - Save success with record counts
 */
router.post('/save-estimate', queryLimiter, validationRules.saveEstimate, asyncHandler(async (req, res) => {
  const { division, year, estimates, approvedBy } = req.body;
  
  logger.info('💾 Save estimate request:', { division, year, estimateMonths: Object.keys(estimates), approvedBy });
  
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  const client = await divisionPool.connect();
  
  try {
    await client.query('BEGIN');
    
    const months = Object.keys(estimates).map(Number).sort((a, b) => a - b);
    logger.info('📅 Saving estimates for months:', months);
    
    const basePeriodQuery = `
      SELECT DISTINCT month
      FROM public.${tables.actualData}
      WHERE UPPER(division) = $1 AND UPPER(type) = 'ACTUAL' AND year = $2
      ORDER BY month
    `;
    
    const basePeriodResult = await client.query(basePeriodQuery, [division.toUpperCase(), year]);
    const allActualMonths = basePeriodResult.rows.map(row => row.month);
    const basePeriodMonths = allActualMonths.filter(m => !months.includes(m));
    
    if (basePeriodMonths.length === 0) {
      throw new Error('No base period months available');
    }
    
    logger.info('📊 Base period months:', basePeriodMonths);
    
    const dimensionQuery = `
      SELECT 
        salesrepname, customername, countryname, productgroup,
        values_type, SUM(values) as total_value
      FROM public.${tables.actualData}
      WHERE UPPER(division) = $1 AND UPPER(type) = 'ACTUAL' AND year = $2 AND month = ANY($3)
      GROUP BY salesrepname, customername, countryname, productgroup, values_type
    `;
    
    const dimensionResult = await client.query(dimensionQuery, [division.toUpperCase(), year, basePeriodMonths]);
    
    logger.info(`✅ Found ${dimensionResult.rows.length} dimension combinations to replicate`);
    
    const deleteQuery = `
      DELETE FROM public.${tables.actualData}
      WHERE UPPER(division) = $1 AND UPPER(type) = 'ESTIMATE' AND year = $2 AND month = ANY($3)
    `;
    
    const deleteResult = await client.query(deleteQuery, [division.toUpperCase(), year, months]);
    logger.info(`🗑️ Deleted ${deleteResult.rowCount} existing estimate records`);
    
    const totalsByType = { AMOUNT: 0, KGS: 0, MORM: 0 };
    
    dimensionResult.rows.forEach(row => {
      const valuesType = row.values_type;
      if (totalsByType[valuesType] !== undefined) {
        totalsByType[valuesType] += parseFloat(row.total_value) || 0;
      }
    });
    
    logger.info(`📊 Base period totals by values_type:`, totalsByType);
    
    let totalInserted = 0;
    const batchSize = 500;
    
    for (const month of months) {
      const monthEstimates = estimates[month];
      const recordsForMonth = [];
      
      dimensionResult.rows.forEach(row => {
        const basePeriodTotal = totalsByType[row.values_type];
        const dimensionTotal = parseFloat(row.total_value) || 0;
        const monthlyEstimateTotal = row.values_type === 'AMOUNT' ? monthEstimates.amount :
                                     row.values_type === 'KGS' ? monthEstimates.kgs :
                                     monthEstimates.morm;
        
        const proportion = basePeriodTotal > 0 ? dimensionTotal / basePeriodTotal : 0;
        const dimensionMonthlyValue = monthlyEstimateTotal * proportion;
        
        recordsForMonth.push({
          division: division.toUpperCase(),
          year, month, type: 'Estimate',
          salesrepname: row.salesrepname, customername: row.customername,
          countryname: row.countryname, productgroup: row.productgroup,
          sourcesheet: 'Calculated', values_type: row.values_type,
          values: dimensionMonthlyValue, uploaded_by: approvedBy
        });
      });
      
      for (let i = 0; i < recordsForMonth.length; i += batchSize) {
        const batch = recordsForMonth.slice(i, i + batchSize);
        
        const insertQuery = `
          INSERT INTO public.${tables.actualData} (
            division, year, month, type, salesrepname, customername, countryname,
            productgroup, sourcesheet, values_type, values, uploaded_by, updated_at
          ) VALUES ${batch.map((_, idx) => {
            const base = idx * 12;
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, NOW())`;
          }).join(', ')}
        `;
        
        const insertValues = batch.flatMap(record => [
          record.division, record.year, record.month, record.type,
          record.salesrepname, record.customername, record.countryname,
          record.productgroup,
          record.sourcesheet, record.values_type, record.values, record.uploaded_by
        ]);
        
        const insertResult = await client.query(insertQuery, insertValues);
        totalInserted += insertResult.rowCount;
      }
      
      logger.info(`✅ Inserted ${recordsForMonth.length} records for month ${month}`);
    }
    
    await client.query('COMMIT');
    
    logger.info(`✅ Total inserted: ${totalInserted} estimate records`);
    
    successResponse(res, {
      recordsInserted: totalInserted,
      months,
      message: `Successfully saved estimates for ${months.length} months`
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

/**
 * GET /budget/:division/product-groups
 * Get product groups in budget order (by first occurrence in budget_unified)
 * 
 * @route GET /api/aebf/budget/:division/product-groups
 * @param {string} division - Division code (FP)
 * @returns {object} 200 - List of product groups in budget order
 */
router.get('/budget/:division/product-groups', queryLimiter, cacheMiddleware({ ttl: CacheTTL.LONG }), asyncHandler(async (req, res) => {
  const { division } = req.params;
  
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  // Get product groups ordered alphabetically with Others second-to-last, Services Charges last
  const query = `
    SELECT DISTINCT pgcombine
    FROM ${tables.budgetUnified}
    WHERE pgcombine IS NOT NULL
  `;
  
  const result = await divisionPool.query(query);
  
  // Sort alphabetically with special handling for Others and Services Charges
  const sortedData = result.rows
    .map(row => ({ pgcombine: row.pgcombine }))
    .sort((a, b) => {
      const pgA = (a.pgcombine || '').toUpperCase().trim();
      const pgB = (b.pgcombine || '').toUpperCase().trim();
      
      // Services Charges always last
      if (pgA === 'SERVICES CHARGES') return 1;
      if (pgB === 'SERVICES CHARGES') return -1;
      
      // Others always second-to-last
      if (pgA === 'OTHERS') return 1;
      if (pgB === 'OTHERS') return -1;
      
      // Everything else alphabetical
      return a.pgcombine.localeCompare(b.pgcombine);
    });
  
  res.json({
    success: true,
    data: sortedData
  });
}));

/**
 * GET /budget-years
 * Get available budget years from fp_budget_unified table (SALES_REP type only)
 * 
 * @route GET /api/aebf/budget-years
 * @query {string} division - Division (FP)
 * @returns {object} 200 - Available budget years with SALES_REP budget data
 */
router.get('/budget-years', queryLimiter, cacheMiddleware({ ttl: CacheTTL.VERY_LONG }), validationRules.getBudgetYears, asyncHandler(async (req, res) => {
  const { division } = req.query;
    
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    // Only show years with SALES_REP budget data (from Bulk Import)
    const query = `
      SELECT DISTINCT budget_year
      FROM ${tables.budgetUnified}
      WHERE UPPER(division_code) = UPPER($1)
        AND budget_year IS NOT NULL
        AND UPPER(budget_type) = 'SALES_REP'
      ORDER BY budget_year DESC
    `;
    
    const result = await divisionPool.query(query, [division]);
    const years = result.rows.map(row => row.budget_year);
    
    // Return in legacy format (not using successResponse wrapper)
    res.json({ success: true, years });
}));

/**
 * POST /budget-sales-rep-recap
 * Get sales rep budget recap with totals by value type
 * Uses fp_budget_unified with budget_type = 'SALES_REP'
 * 
 * @route POST /api/aebf/budget-sales-rep-recap
 * @body {string} division - Division (FP)
 * @body {number} budgetYear - Budget year
 * @body {string} salesRep - Sales rep name
 * @returns {object} 200 - Budget recap with Amount, KGS, and MoRM totals
 */
router.post('/budget-sales-rep-recap', queryLimiter, validationRules.budgetSalesRepRecap, asyncHandler(async (req, res) => {
  const { division, budgetYear, salesRep } = req.body;
    
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    // Check both sales_rep_name and sales_rep_group_name (BULK_IMPORT uses group_name)
    const query = `
      SELECT 
        SUM(b.qty_kgs) as total_kgs,
        SUM(b.amount) as total_amount,
        SUM(b.morm) as total_morm,
        COUNT(*) as record_count
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
    `;
    
    const result = await divisionPool.query(query, [division, parseInt(budgetYear), salesRep]);
    
    // Build recap in legacy format (array of objects with values_type, total_values, record_count)
    const row = result.rows[0] || {};
    const recordCount = parseInt(row.record_count) || 0;
    
    const recapMap = {
      'AMOUNT': { values_type: 'Amount', total_values: parseFloat(row.total_amount) || 0, record_count: recordCount },
      'KGS': { values_type: 'KGS', total_values: parseFloat(row.total_kgs) || 0, record_count: recordCount },
      'MORM': { values_type: 'MoRM', total_values: parseFloat(row.total_morm) || 0, record_count: recordCount }
    };
    
    const recap = [
      recapMap['AMOUNT'],
      recapMap['KGS'],
      recapMap['MORM']
    ];
    
    // Return in legacy format (not using successResponse wrapper)
    res.json({
      success: true,
      recap,
      salesRep,
      budgetYear: parseInt(budgetYear)
    });
}));

/**
 * GET /export-budget
 * Export budget data in CSV format (max 10,000 records)
 * 
 * @route GET /api/aebf/export-budget
 * @query {string} division - Division (FP)
 * @query {number} [year] - Filter by year
 * @query {number} [month] - Filter by month
 * @query {string} [values_type] - Filter by value type
 * @query {string} [search] - Search across multiple fields
 * @query {string} [sortBy=year] - Field to sort by
 * @query {string} [sortOrder=desc] - Sort direction
 * @returns {file} 200 - CSV file download
 */
router.get('/export-budget', queryLimiter, validationRules.exportData, asyncHandler(async (req, res) => {
  const {
    division, year, month, values_type, salesrepname, customername,
    countryname, productgroup, sortBy = 'year', sortOrder = 'desc',
    search
  } = req.query;
  
  logger.info('📥 Export budget request:', { division, year, month, search });
  
  const tables = getTableNames(division);
  const divisionPool = getPoolForDivision(division);
  
  // Build WHERE clause - using fp_budget_unified
  const conditions = ['UPPER(b.division_code) = $1'];
  const params = [division.toUpperCase()];
  let paramIndex = 2;
  
  if (year) {
    conditions.push(`b.budget_year = $${paramIndex}`);
    params.push(parseInt(year));
    paramIndex++;
  }
  
  if (month) {
    conditions.push(`b.month_no = $${paramIndex}`);
    params.push(parseInt(month));
    paramIndex++;
  }
  
  if (salesrepname) {
    conditions.push(`UPPER(b.sales_rep_name) = $${paramIndex}`);
    params.push(salesrepname.toUpperCase());
    paramIndex++;
  }
  
  if (customername) {
    conditions.push(`UPPER(b.customer_name) LIKE $${paramIndex}`);
    params.push(`%${customername.toUpperCase()}%`);
    paramIndex++;
  }
  
  if (countryname) {
    conditions.push(`UPPER(b.country) = $${paramIndex}`);
    params.push(countryname.toUpperCase());
    paramIndex++;
  }
  
  if (productgroup) {
    conditions.push(`UPPER(b.pgcombine) LIKE $${paramIndex}`);
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
      conditions.push(`b.month_no = $${paramIndex}`);
      params.push(monthNumber);
    } else {
      conditions.push(`(
        UPPER(b.customer_name) LIKE $${paramIndex} OR 
        UPPER(b.country) LIKE $${paramIndex} OR 
        UPPER(b.pgcombine) LIKE $${paramIndex} OR
        UPPER(b.sales_rep_name) LIKE $${paramIndex}
      )`);
      params.push(searchPattern);
    }
    paramIndex++;
  }
  
  const whereClause = conditions.join(' AND ');
  
  // Map sort fields to new column names
  const sortFieldMap = {
    'year': 'budget_year',
    'month': 'month_no',
    'customername': 'customer_name',
    'countryname': 'country',
    'productgroup': 'pgcombine',
    'salesrepname': 'sales_rep_name'
  };
  const sortField = sortFieldMap[sortBy] || 'budget_year';
  const sortDirection = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const orderByClause = `ORDER BY b.${sortField} ${sortDirection}, b.id DESC`;
  
  // Query from fp_budget_unified
  const exportQuery = `
    SELECT 
      b.division_code as division, 
      b.budget_year as year, 
      b.month_no as month, 
      b.budget_type as type, 
      b.sales_rep_name as salesrepname, 
      b.customer_name as customername,
      b.country as countryname, 
      b.pgcombine as productgroup,
      COALESCE(b.material, m.material, '') as material, 
      COALESCE(b.process, m.process, '') as process, 
      b.qty_kgs as kgs,
      b.amount,
      b.morm,
      b.updated_at, 
      b.created_by as uploaded_by
    FROM ${tables.budgetUnified} b
    LEFT JOIN ${tables.materialPercentages} m 
      ON LOWER(TRIM(b.pgcombine)) = LOWER(TRIM(m.product_group))
    LEFT JOIN ${tables.productGroupExclusions} e
      ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
      AND UPPER(e.division_code) = UPPER($1)
    WHERE ${whereClause}
      AND b.pgcombine IS NOT NULL
      AND TRIM(b.pgcombine) != ''
      AND e.product_group IS NULL
    ${orderByClause}
    LIMIT 10000
  `;
  
  const result = await divisionPool.query(exportQuery, params);
  
  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'No data found for export'
    });
  }
  
  // Generate CSV
  const headers = Object.keys(result.rows[0]);
  const csvRows = [
    headers.join(','),
    ...result.rows.map(row => 
      headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',')
    )
  ];
  
  const csv = csvRows.join('\n');
  
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const filename = `budget_${division}_${dateStr}_${timeStr}.csv`;
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
  
  logger.info(`✅ Exported ${result.rows.length} budget records to ${filename}`);
}));

module.exports = router;
