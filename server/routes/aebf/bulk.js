/**
 * @fileoverview AEBF Bulk Operations Routes
 * @module routes/aebf/bulk
 * @description Manages bulk import operations with batch tracking and lifecycle management
 * 
 * @requires express
 * @requires shared For database pool and table management
 * 
 * @routes
 * - POST   /bulk-import              - Create bulk import batch with unique batch_id
 * - GET    /bulk-batches             - List all batches for division (limit 50, sorted by created_at DESC)
 * - GET    /bulk-batch/:batchId      - Get specific batch details with record count
 * - DELETE /bulk-batch/:batchId      - Delete batch and all associated records
 * - POST   /bulk-finalize/:batchId   - Mark batch as FINALIZED (immutable state)
 * - GET    /bulk-export/:batchId     - Export batch to CSV with headers
 * 
 * @features
 * - Transaction handling for atomic batch creation
 * - Unique batch_id generation (timestamp-based)
 * - Status tracking (PENDING, FINALIZED)
 * - Batch lifecycle management
 * - CSV export with comprehensive data
 * - Cascading delete support
 * 
 * @validation All routes use express-validator middleware
 * @errorHandling Centralized error handler with transaction rollback
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { getPoolForDivision, getTableNames, getDivisionName } = require('./shared');
const { asyncHandler, successResponse } = require('../../middleware/aebfErrorHandler');
const validationRules = require('../../middleware/aebfValidation');
const { queryLimiter, exportLimiter } = require('../../middleware/rateLimiter');

/**
 * Round a number to 2 decimal places to avoid floating-point precision issues
 * This ensures values like 65 stay as 65.00 and don't become 65.01
 */
const roundTo2 = (val) => Math.round((parseFloat(val) || 0) * 100) / 100;

/**
 * Ensure prospects table exists - auto-create if missing
 * This table stores new customers from budget imports (not in actual data or customer master)
 */
async function ensureProspectsTableExists(divisionPool, division) {
  const tables = getTableNames(division);
  const tableName = tables.prospects;

  try {
    const check = await divisionPool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    `, [tableName]);

    if (check.rows.length === 0) {
      logger.info(`📊 Creating prospects table: ${tableName}`);

      await divisionPool.query(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id SERIAL PRIMARY KEY,
          customer_name VARCHAR(255) NOT NULL,
          country VARCHAR(100),
          sales_rep_group VARCHAR(255),
          division VARCHAR(50) NOT NULL,
          source_batch_id VARCHAR(100),
          budget_year INTEGER,
          status VARCHAR(50) DEFAULT 'prospect',
          converted_to_customer BOOLEAN DEFAULT false,
          converted_at TIMESTAMP,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(customer_name, division, country, sales_rep_group)
        )
      `);

      await divisionPool.query(`CREATE INDEX IF NOT EXISTS idx_${division.toLowerCase()}_prospects_status ON ${tableName}(status)`);
      await divisionPool.query(`CREATE INDEX IF NOT EXISTS idx_${division.toLowerCase()}_prospects_customer ON ${tableName}(customer_name)`);
      await divisionPool.query(`CREATE INDEX IF NOT EXISTS idx_${division.toLowerCase()}_prospects_division ON ${tableName}(division)`);

      logger.info(`✅ Created prospects table: ${tableName}`);
    }
  } catch (error) {
    logger.error(`Error ensuring prospects table exists: ${error.message}`);
  }
}

/**
 * Ensure bulk import table exists - auto-create if missing
 */
async function ensureBulkImportTableExists(divisionPool, division) {
  const tables = getTableNames(division);
  const tableName = tables.budgetBulkImport;

  try {
    // Check if table exists
    const check = await divisionPool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    `, [tableName]);

    if (check.rows.length === 0) {
      logger.info(`📊 Creating missing table: ${tableName}`);

      // Create the table - column names must match INSERT statements in this file
      await divisionPool.query(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id SERIAL PRIMARY KEY,
          batch_id VARCHAR(100) NOT NULL,
          division VARCHAR(50) NOT NULL DEFAULT '${division.toUpperCase()}',
          budget_year INTEGER NOT NULL,
          sales_rep VARCHAR(255),
          customer VARCHAR(255),
          country VARCHAR(100),
          product_group VARCHAR(255),
          material VARCHAR(255),
          process VARCHAR(255),
          month_1 NUMERIC(15,2) DEFAULT 0,
          month_2 NUMERIC(15,2) DEFAULT 0,
          month_3 NUMERIC(15,2) DEFAULT 0,
          month_4 NUMERIC(15,2) DEFAULT 0,
          month_5 NUMERIC(15,2) DEFAULT 0,
          month_6 NUMERIC(15,2) DEFAULT 0,
          month_7 NUMERIC(15,2) DEFAULT 0,
          month_8 NUMERIC(15,2) DEFAULT 0,
          month_9 NUMERIC(15,2) DEFAULT 0,
          month_10 NUMERIC(15,2) DEFAULT 0,
          month_11 NUMERIC(15,2) DEFAULT 0,
          month_12 NUMERIC(15,2) DEFAULT 0,
          total_kg NUMERIC(15,2) DEFAULT 0,
          total_amount NUMERIC(15,2) DEFAULT 0,
          total_morm NUMERIC(15,2) DEFAULT 0,
          source_file VARCHAR(255),
          status VARCHAR(50) NOT NULL DEFAULT 'draft',
          is_prospect BOOLEAN DEFAULT false,
          error_message TEXT,
          imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          imported_by VARCHAR(255),
          finalized_at TIMESTAMP,
          finalized_by VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Add is_prospect column if it doesn't exist (for existing tables)
      await divisionPool.query(`
        ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS is_prospect BOOLEAN DEFAULT false
      `).catch(() => {});

      // Create indexes
      await divisionPool.query(`CREATE INDEX IF NOT EXISTS idx_${division.toLowerCase()}_bulk_batch_id ON ${tableName}(batch_id)`);
      await divisionPool.query(`CREATE INDEX IF NOT EXISTS idx_${division.toLowerCase()}_bulk_status ON ${tableName}(status)`);
      await divisionPool.query(`CREATE INDEX IF NOT EXISTS idx_${division.toLowerCase()}_bulk_imported_at ON ${tableName}(imported_at DESC)`);
      await divisionPool.query(`CREATE INDEX IF NOT EXISTS idx_${division.toLowerCase()}_bulk_sales_rep ON ${tableName}(sales_rep)`);

      logger.info(`✅ Created table: ${tableName}`);
    }
  } catch (error) {
    logger.error(`Error ensuring bulk import table exists: ${error.message}`);
  }
}

/**
 * POST /bulk-import
 * Import multiple sales rep budget files at once
 * 
 * @route POST /api/aebf/bulk-import
 * @body {string} division - Division (FP)
 * @body {array} files - Array of file objects with htmlContent, salesRep, budgetYear, filename
 * @body {boolean} saveToFinal - Whether to save to final budget table
 * @returns {object} 200 - Import result with batch_id and counts
 */
router.post('/bulk-import', queryLimiter, asyncHandler(async (req, res) => {
  logger.info('📦 Bulk import request received');
  
  const { files, saveToFinal, division } = req.body;

  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ success: false, error: 'No files provided' });
  }

  if (!division) {
    return res.status(400).json({ success: false, error: 'Division is required' });
  }

  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  const client = await divisionPool.connect();

  // Helper function to convert string to Proper Case (Title Case)
  const toProperCase = (str) => {
    if (!str) return '';
    return str.toString().trim().toLowerCase().replace(/(?:^|\s|[-/])\w/g, (match) => match.toUpperCase());
  };

  try {
    // Generate batch ID
    const batchId = `BULK_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const status = saveToFinal ? 'final' : 'draft';
    const importedAt = new Date().toISOString();

    logger.info(`📦 Processing ${files.length} files, batch: ${batchId}, status: ${status}`);

    // Ensure tables exist before starting transaction
    await ensureProspectsTableExists(divisionPool, division);

    await client.query('BEGIN');

    let totalImported = 0;
    const importedSalesReps = [];
    const errors = [];

    for (const file of files) {
      try {
        const { htmlContent, salesRep: rawSalesRep, budgetYear, filename } = file;

        // Normalize sales rep name to Proper Case for consistent storage
        const salesRep = toProperCase(rawSalesRep);

        if (!htmlContent) {
          errors.push({ filename, error: 'No content' });
          continue;
        }

        // Extract budget data from HTML (handle newlines in the data)
        const budgetDataMatch = htmlContent.match(/const savedBudget\s*=\s*(\[[\s\S]*?\]);/);
        if (!budgetDataMatch) {
          errors.push({ filename, error: 'No budget data found' });
          continue;
        }

        let budgetData;
        try {
          budgetData = JSON.parse(budgetDataMatch[1]);
        } catch (e) {
          errors.push({ filename, error: 'Invalid budget data format' });
          continue;
        }
        
        if (!Array.isArray(budgetData) || budgetData.length === 0) {
          errors.push({ filename, error: 'Empty budget data' });
          continue;
        }
        
        // Get pricing map for amount/morm calculations
        // Pricing is based on ACTUAL year (budgetYear - 1), not budget year
        // e.g., Budget 2026 uses pricing from 2025
        const pricingYear = budgetYear - 1;
        let pricingResult = await client.query(
          `SELECT LOWER(TRIM(product_group)) as product_group, 
                  COALESCE(asp_round, 0) as selling_price, 
                  COALESCE(morm_round, 0) as morm 
           FROM ${tables.pricingRounding}
           WHERE year = $1`,
          [pricingYear]
        );
        
        // If no pricing for actual year, fallback to most recent year
        if (pricingResult.rows.length === 0) {
          logger.warn(`No pricing data for year ${pricingYear}, falling back to most recent year`);
          pricingResult = await client.query(
            `SELECT LOWER(TRIM(product_group)) as product_group, 
                    COALESCE(asp_round, 0) as selling_price, 
                    COALESCE(morm_round, 0) as morm 
             FROM ${tables.pricingRounding}
             WHERE year = (SELECT MAX(year) FROM ${tables.pricingRounding})`
          );
        }
        
        logger.info(`📊 Loaded pricing data for year ${pricingYear}: ${pricingResult.rows.length} product groups`);

        const pricingMap = {};
        pricingResult.rows.forEach(row => {
          pricingMap[row.product_group] = {
            sellingPrice: parseFloat(row.selling_price) || 0,
            morm: parseFloat(row.morm) || 0
          };
        });
        
        // Get existing customers from BOTH actual data AND customer master for prospect detection
        // 1. From actual sales data (fp_actualcommon)
        const existingFromActualResult = await client.query(`
          SELECT DISTINCT LOWER(TRIM(customer_name)) as customer_name
          FROM ${tables.actualcommon}
          WHERE customer_name IS NOT NULL AND TRIM(customer_name) != ''
        `);
        
        // 2. From customer master table (fp_customer_master) - check if table exists first
        const divisionCode = division.split('-')[0].replace(/[^a-zA-Z]/g, '').toLowerCase();
        const customerMasterTable = `${divisionCode}_customer_master`;
        let existingFromMasterResult = { rows: [] };
        
        // Check if customer master table exists before querying (to avoid aborting transaction)
        const tableExistsResult = await client.query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = $1
          ) as exists
        `, [customerMasterTable]);
        
        if (tableExistsResult.rows[0]?.exists) {
          existingFromMasterResult = await client.query(`
            SELECT DISTINCT LOWER(TRIM(customer_name)) as customer_name
            FROM ${customerMasterTable}
            WHERE customer_name IS NOT NULL AND TRIM(customer_name) != ''
              AND is_active = true
          `);
        } else {
          logger.warn(`📋 Customer master table ${customerMasterTable} not found, using only actual data`);
        }
        
        // Combine both sources
        const existingCustomers = new Set([
          ...existingFromActualResult.rows.map(r => r.customer_name),
          ...existingFromMasterResult.rows.map(r => r.customer_name)
        ]);
        logger.info(`📋 Loaded ${existingCustomers.size} existing customers for prospect detection (actual: ${existingFromActualResult.rows.length}, master: ${existingFromMasterResult.rows.length})`);

        // Group records by customer/country/productGroup and aggregate monthly values
        const groupedData = {};
        for (const record of budgetData) {
          // CRITICAL: Normalize all text fields with trim + proper case for consistent storage
          const customer = toProperCase(record.customer || '');
          const country = toProperCase(record.country || '');
          const productGroup = toProperCase(record.productGroup || '');
          const month = parseInt(record.month) || 0;
          const value = parseFloat(record.value) || 0;
          
          const key = `${customer}|||${country}|||${productGroup}`;
          if (!groupedData[key]) {
            groupedData[key] = {
              customer,
              country,
              productGroup,
              months: {}
            };
          }
          if (month >= 1 && month <= 12) {
            groupedData[key].months[month] = value;
          }
        }
        
        // Insert each grouped budget record
        for (const key of Object.keys(groupedData)) {
          const record = groupedData[key];
          const customer = record.customer;
          const country = record.country;
          const productGroup = record.productGroup;
          
          // Check if customer is a prospect (not in existing actual data)
          const isProspect = !existingCustomers.has((customer || '').toLowerCase().trim());

          // Get monthly values - use roundTo2 to prevent floating-point precision errors
          const months = {};
          let totalKG = 0;
          for (let m = 1; m <= 12; m++) {
            const val = roundTo2(record.months[m] || 0);
            months[m] = val;
            totalKG += val;
          }
          totalKG = roundTo2(totalKG);

          // Calculate amount and morm - round results to prevent floating-point errors
          const pricing = pricingMap[(productGroup || '').toLowerCase()] || { sellingPrice: 0, morm: 0 };
          const totalAmount = roundTo2(totalKG * pricing.sellingPrice);
          const totalMoRM = roundTo2(totalKG * pricing.morm);

          // Insert into bulk import table
          await client.query(
            `INSERT INTO ${tables.budgetBulkImport} 
             (batch_id, division, sales_rep, budget_year, customer, country, product_group,
              month_1, month_2, month_3, month_4, month_5, month_6,
              month_7, month_8, month_9, month_10, month_11, month_12,
              total_kg, total_amount, total_morm, status, is_prospect, source_file, imported_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)`,
            [
              batchId, division, salesRep, budgetYear, customer, country, productGroup,
              months[1], months[2], months[3], months[4], months[5], months[6],
              months[7], months[8], months[9], months[10], months[11], months[12],
              totalKG, totalAmount, totalMoRM, status, isProspect, filename, importedAt
            ]
          );

          if (isProspect) {
            logger.info(`🆕 Prospect customer detected: "${customer}"`);
            
            // Insert prospect into prospects table (upsert - ignore if already exists)
            // UNIQUE constraint: (customer_name, division, country, sales_rep_group)
            await client.query(`
              INSERT INTO ${tables.prospects} 
                (customer_name, country, sales_rep_group, division, source_batch_id, budget_year, status)
              VALUES ($1, $2, $3, $4, $5, $6, 'prospect')
              ON CONFLICT (customer_name, division, country, sales_rep_group) DO UPDATE SET
                updated_at = CURRENT_TIMESTAMP,
                source_batch_id = EXCLUDED.source_batch_id,
                budget_year = EXCLUDED.budget_year
            `, [customer, country, salesRep, division, batchId, budgetYear]);
          }

          totalImported++;
        }
        
        if (!importedSalesReps.includes(salesRep)) {
          importedSalesReps.push(salesRep);
        }
        
        logger.info(`✅ Imported ${Object.keys(groupedData).length} records for ${salesRep}`);
        
      } catch (fileError) {
        logger.error(`❌ Error processing file:`, fileError);
        errors.push({ filename: file.filename, error: fileError.message });
      }
    }
    
    // If saving to final, also copy to the budgetUnified table
    if (saveToFinal && totalImported > 0) {
      // Get all records from this batch
      const batchRecords = await client.query(
        `SELECT * FROM ${tables.budgetBulkImport} WHERE batch_id = $1`,
        [batchId]
      );
      
      const divisionCode = division.split('-')[0].replace(/[^a-zA-Z]/g, '').toUpperCase();
      const divisionName = await getDivisionName(divisionCode); // Dynamic from company_settings
      
      for (const record of batchRecords.rows) {
        // Delete existing budget for this sales rep/customer/country/product from budgetUnified
        await client.query(
          `DELETE FROM ${tables.budgetUnified} 
           WHERE UPPER(sales_rep_name) = UPPER($1) AND UPPER(customer_name) = UPPER($2) 
           AND UPPER(country) = UPPER($3) AND UPPER(pgcombine) = UPPER($4) 
           AND budget_year = $5 AND is_budget = true AND budget_type = 'SALES_REP'`,
          [record.sales_rep, record.customer, record.country, record.product_group, record.budget_year]
        );
        
        // Insert into budgetUnified table - one row per month with KGS, Amount, MoRM
        // CRITICAL: sales_rep_name in bulk import is actually the GROUP name (e.g., "Riad & Nidal")
        // so we set BOTH sales_rep_name and sales_rep_group_name to the same value
        for (let month = 1; month <= 12; month++) {
          const kgValue = roundTo2(parseFloat(record[`month_${month}`]) || 0);

          if (kgValue > 0) {
            // Calculate amount and morm for this month based on totals ratio - round to prevent floating-point errors
            const totalKg = parseFloat(record.total_kg) || 1;
            const monthAmount = roundTo2(kgValue * (parseFloat(record.total_amount) / totalKg));
            const monthMoRM = roundTo2(kgValue * (parseFloat(record.total_morm) / totalKg));

            await client.query(
              `INSERT INTO ${tables.budgetUnified}
               (division_name, division_code, budget_year, month_no, sales_rep_name, sales_rep_group_name, customer_name, 
                country, pgcombine, qty_kgs, amount, morm, material, process, 
                is_budget, budget_type, budget_status, created_at, updated_at, uploaded_at, created_by, data_source)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 
                       true, 'SALES_REP', 'draft', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'bulk_import', 'BULK_IMPORT')`,
              [
                divisionName, divisionCode, record.budget_year, month,
                record.sales_rep, record.sales_rep, // Both sales_rep_name and sales_rep_group_name = group name
                record.customer, record.country, record.product_group,
                kgValue, monthAmount, monthMoRM, 
                record.material || '', record.process || ''
              ]
            );
          }
        }
      }
      
      logger.info(`✅ Copied ${totalImported} records to budgetUnified table`);
    }
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      batchId,
      importedCount: totalImported,
      salesReps: importedSalesReps,
      status,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

/**
 * GET /bulk-batches
 * List all bulk import batches for division (limit 50, sorted by created_at DESC)
 * 
 * @route GET /api/aebf/bulk-batches
 * @query {string} division - Division (FP)
 * @returns {object} 200 - Array of batch records
 */
router.get('/bulk-batches', validationRules.bulkBatches, asyncHandler(async (req, res) => {
  const { division } = req.query;
    
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    // Ensure table exists
    await ensureBulkImportTableExists(divisionPool, division);

    const query = `
      SELECT
        batch_id,
        division,
        budget_year,
        status,
        MIN(imported_at) as imported_at,
        COUNT(DISTINCT sales_rep) as sales_rep_count,
        ARRAY_AGG(DISTINCT sales_rep) as sales_reps,
        COUNT(*) as record_count
      FROM ${tables.budgetBulkImport}
      WHERE division = $1
      GROUP BY batch_id, division, budget_year, status
      ORDER BY MIN(imported_at) DESC
    `;
    
    const result = await divisionPool.query(query, [division]);
    
    res.json({ success: true, batches: result.rows });
}));

/**
 * GET /bulk-batch/:batchId
 * Get specific bulk batch details with all records
 * 
 * @route GET /api/aebf/bulk-batch/:batchId
 * @param {string} batchId - Unique batch identifier
 * @query {string} division - Division (FP)
 * @returns {object} 200 - Batch details with records
 */
router.get('/bulk-batch/:batchId', validationRules.bulkBatch, asyncHandler(async (req, res) => {
  const { batchId } = req.params;
  const { division } = req.query;
    
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    // Get batch info
    const batchInfo = await divisionPool.query(
      `SELECT batch_id, division, budget_year, status, MIN(imported_at) as imported_at
       FROM ${tables.budgetBulkImport}
       WHERE batch_id = $1
       GROUP BY batch_id, division, budget_year, status`,
      [batchId]
    );
    
    if (batchInfo.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Batch not found' });
    }
    
    // Get all records
    const records = await divisionPool.query(
      `SELECT * FROM ${tables.budgetBulkImport} WHERE batch_id = $1 ORDER BY sales_rep, customer`,
      [batchId]
    );
    
    res.json({
      success: true,
      batch: batchInfo.rows[0],
      data: records.rows  // Changed from 'records' to 'data' to match frontend expectation
    });
}));

/**
 * DELETE /bulk-batch/:batchId
 * Delete a bulk import batch and all associated records
 * 
 * @route DELETE /api/aebf/bulk-batch/:batchId
 * @param {string} batchId - Unique batch identifier
 * @query {string} division - Division (FP)
 * @returns {object} 200 - Deletion confirmation
 */
router.delete('/bulk-batch/:batchId', validationRules.bulkBatch, asyncHandler(async (req, res) => {
  const { batchId } = req.params;
  const { division } = req.query;
    
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    const deleteQuery = `
      DELETE FROM ${tables.budgetBulkImport}
      WHERE batch_id = $1 AND UPPER(division) = UPPER($2)
    `;
    
    const result = await divisionPool.query(deleteQuery, [batchId, division]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Batch not found'
      });
    }
    
    successResponse(res, {
      message: 'Batch deleted successfully',
      batchId
    });
}));

/**
 * POST /bulk-finalize/:batchId
 * Mark batch as FINALIZED (immutable state)
 * 
 * @route POST /api/aebf/bulk-finalize/:batchId
 * @param {string} batchId - Unique batch identifier
 * @body {string} division - Division (FP)
 * @returns {object} 200 - Finalized batch details
 */
router.post('/bulk-finalize/:batchId', validationRules.bulkFinalize, asyncHandler(async (req, res) => {
  const { batchId } = req.params;
  const { division } = req.body;
    
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  const client = await divisionPool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get all records from this batch
    const batchRecords = await client.query(
      `SELECT * FROM ${tables.budgetBulkImport} WHERE batch_id = $1 AND UPPER(division) = UPPER($2)`,
      [batchId, division]
    );
    
    if (batchRecords.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Batch not found'
      });
    }
    
    let copiedCount = 0;
    
    const divisionCode = division.split('-')[0].replace(/[^a-zA-Z]/g, '').toLowerCase();
    const divisionName = await getDivisionName(divisionCode.toUpperCase()); // Dynamic from company_settings
    
    // Save FULL customer-level data to fp_budget_unified with BULK_IMPORT flag
    // Each record includes customer, country, and is linked to sales_rep_group_name
    
    // First, delete any existing BULK_IMPORT data for this sales rep group + year
    const firstRecord = batchRecords.rows[0];
    const salesRepGroupName = firstRecord?.sales_rep || '';
    const budgetYear = firstRecord?.budget_year;
    
    await client.query(
      `DELETE FROM ${tables.budgetUnified} 
       WHERE UPPER(sales_rep_group_name) = UPPER($1) 
       AND budget_year = $2 
       AND is_budget = true 
       AND budget_type = 'SALES_REP'
       AND data_source = 'BULK_IMPORT'`,
      [salesRepGroupName, budgetYear]
    );
    
    // Insert each record with customer-level detail
    for (const record of batchRecords.rows) {
      // Insert monthly data for each customer
      for (let month = 1; month <= 12; month++) {
        const kgValue = roundTo2(record[`month_${month}`] || 0);

        if (kgValue > 0) {
          // Calculate proportional amount and morm for this month
          const totalKg = parseFloat(record.total_kg) || 0;
          const totalAmount = parseFloat(record.total_amount) || 0;
          const totalMorm = parseFloat(record.total_morm) || 0;
          
          const monthAmount = totalKg > 0 ? roundTo2(kgValue * (totalAmount / totalKg)) : 0;
          const monthMoRM = totalKg > 0 ? roundTo2(kgValue * (totalMorm / totalKg)) : 0;

          await client.query(
            `INSERT INTO ${tables.budgetUnified}
             (division_name, division_code, budget_year, month_no, 
              sales_rep_name, sales_rep_group_name, customer_name, country, 
              pgcombine, qty_kgs, amount, morm, material, process, 
              is_budget, budget_type, budget_status, is_prospect, 
              created_at, updated_at, uploaded_at, created_by, data_source)
             VALUES ($1, $2, $3, $4, 
                     '', $5, $6, $7,
                     $8, $9, $10, $11, $12, $13,
                     true, 'SALES_REP', 'draft', $14, 
                     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'bulk_finalize', 'BULK_IMPORT')`,
            [
              divisionName, divisionCode.toUpperCase(), record.budget_year, month,
              record.sales_rep, // sales_rep_group_name
              record.customer || '', record.country || '',
              record.product_group || '',
              kgValue, monthAmount, monthMoRM,
              record.material || '', record.process || '',
              record.is_prospect || false
            ]
          );
          
          copiedCount++;
        }
      }
    }
    
    // Update batch status to finalized
    await client.query(
      `UPDATE ${tables.budgetBulkImport}
       SET status = 'final'
       WHERE batch_id = $1 AND UPPER(division) = UPPER($2)`,
      [batchId, division]
    );
    
    await client.query('COMMIT');
    
    logger.info(`✅ Finalized batch ${batchId}: aggregated ${copiedCount} sales rep + product group combinations to budgetUnified as BULK_IMPORT`);
    
    successResponse(res, {
      success: true,
      message: 'Batch finalized successfully. Data saved as Management Allocation (aggregated by Product Group).',
      recordCount: copiedCount,
      batchId
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

/**
 * GET /bulk-export/:batchId
 * Export batch as merged HTML in Sales Rep format
 * 
 * @route GET /api/aebf/bulk-export/:batchId
 * @param {string} batchId - Unique batch identifier
 * @query {string} division - Division (FP)
 * @returns {file} 200 - HTML file download
 */
router.get('/bulk-export/:batchId', exportLimiter, validationRules.bulkBatch, asyncHandler(async (req, res) => {
  const { batchId } = req.params;
  const { division } = req.query;
    
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  // Get all records from batch
  const query = `
    SELECT *
    FROM ${tables.budgetBulkImport}
    WHERE batch_id = $1 AND UPPER(division) = UPPER($2)
    ORDER BY sales_rep, customer, product_group
  `;
  
  const result = await divisionPool.query(query, [batchId, division]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Batch not found'
    });
  }
  
  const budgetYear = result.rows[0]?.budget_year || new Date().getFullYear() + 1;
  const actualYear = budgetYear - 1;
  const divisionUpper = (division || 'FP').toUpperCase();
  
  // Get unique sales reps
  const salesReps = [...new Set(result.rows.map(r => r.sales_rep))];
  
  // Get pricing data - use ACTUAL year (budgetYear - 1) for pricing
  // e.g., Budget 2026 uses pricing from 2025
  const pricingYear = actualYear;
  let pricingResult = await divisionPool.query(
    `SELECT LOWER(TRIM(product_group)) as product_group, 
            COALESCE(asp_round, 0) as selling_price, 
            COALESCE(morm_round, 0) as morm 
     FROM ${tables.pricingRounding}
     WHERE year = $1`,
    [pricingYear]
  );
  
  // Fallback to most recent year if no pricing for actual year
  if (pricingResult.rows.length === 0) {
    logger.warn(`No pricing data for year ${pricingYear}, falling back to most recent year`);
    pricingResult = await divisionPool.query(
      `SELECT LOWER(TRIM(product_group)) as product_group, 
              COALESCE(asp_round, 0) as selling_price, 
              COALESCE(morm_round, 0) as morm 
       FROM ${tables.pricingRounding}
       WHERE year = (SELECT MAX(year) FROM ${tables.pricingRounding})`
    );
  }
  
  logger.info(`📊 Loaded pricing data for year ${pricingYear}: ${pricingResult.rows.length} product groups`);

  const pricingMap = {};
  pricingResult.rows.forEach(row => {
    pricingMap[row.product_group] = {
      sellingPrice: parseFloat(row.selling_price) || 0,
      morm: parseFloat(row.morm) || 0
    };
  });
  
  // Get unique product groups from data
  const productGroups = [...new Set(result.rows.map(r => r.product_group).filter(Boolean))].sort();
  
  // Build table data in Sales Rep format (combine all records)
  const tableData = result.rows.map(row => ({
    customer: row.customer || '',
    country: row.country || '',
    productGroup: row.product_group || '',
    months: {
      1: parseFloat(row.month_1) || 0,
      2: parseFloat(row.month_2) || 0,
      3: parseFloat(row.month_3) || 0,
      4: parseFloat(row.month_4) || 0,
      5: parseFloat(row.month_5) || 0,
      6: parseFloat(row.month_6) || 0,
      7: parseFloat(row.month_7) || 0,
      8: parseFloat(row.month_8) || 0,
      9: parseFloat(row.month_9) || 0,
      10: parseFloat(row.month_10) || 0,
      11: parseFloat(row.month_11) || 0,
      12: parseFloat(row.month_12) || 0
    },
    salesRep: row.sales_rep || ''
  }));
  
  // Generate HTML
  const { generateMergedBulkHtml } = require('../../utils/bulkHtmlExport');
  const html = generateMergedBulkHtml({
    division: divisionUpper,
    budgetYear,
    actualYear,
    salesReps,
    tableData,
    pricingMap,
    productGroups,
    batchId
  });
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="MERGED_BUDGET_${divisionUpper}_${budgetYear}_${batchId}.html"`);
  res.send(html);
}));

/**
 * GET /finalized-budgets
 * List all finalized sales rep budgets in fp_budget_unified (for management/deletion)
 * 
 * @route GET /api/aebf/finalized-budgets
 * @query {string} division - Division (FP)
 * @query {number} budgetYear - Optional: filter by budget year
 * @returns {object} 200 - List of finalized budgets grouped by sales rep
 */
router.get('/finalized-budgets', asyncHandler(async (req, res) => {
  const { division, budgetYear } = req.query;
  
  if (!division) {
    return res.status(400).json({ success: false, error: 'Division is required' });
  }
  
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  let query = `
    SELECT 
      sales_rep_group_name,
      budget_year,
      data_source,
      COUNT(*) as record_count,
      SUM(qty_kgs) / 1000.0 as total_mt,
      SUM(amount) as total_amount,
      MIN(created_at) as first_import,
      MAX(updated_at) as last_updated
    FROM ${tables.budgetUnified}
    WHERE UPPER(division_code) = UPPER($1)
      AND budget_type = 'SALES_REP'
      AND sales_rep_group_name IS NOT NULL
      AND TRIM(sales_rep_group_name) != ''
  `;
  
  const params = [division];
  
  if (budgetYear) {
    query += ` AND budget_year = $2`;
    params.push(parseInt(budgetYear));
  }
  
  query += `
    GROUP BY sales_rep_group_name, budget_year, data_source
    ORDER BY budget_year DESC, sales_rep_group_name ASC
  `;
  
  const result = await divisionPool.query(query, params);
  
  successResponse(res, {
    budgets: result.rows.map(row => ({
      salesRepGroupName: row.sales_rep_group_name,
      budgetYear: row.budget_year,
      dataSource: row.data_source,
      recordCount: parseInt(row.record_count),
      totalMT: parseFloat(row.total_mt) || 0,
      totalAmount: parseFloat(row.total_amount) || 0,
      firstImport: row.first_import,
      lastUpdated: row.last_updated
    }))
  });
}));

/**
 * DELETE /finalized-budget
 * Delete finalized budget data for a specific sales rep + year
 * 
 * @route DELETE /api/aebf/finalized-budget
 * @query {string} division - Division (FP)
 * @query {string} salesRepGroupName - Sales rep group name
 * @query {number} budgetYear - Budget year
 * @query {string} dataSource - Optional: BULK_IMPORT or SALES_REP_IMPORT (default: all)
 * @returns {object} 200 - Deletion confirmation
 */
router.delete('/finalized-budget', asyncHandler(async (req, res) => {
  const { division, salesRepGroupName, budgetYear, dataSource } = req.query;
  
  if (!division || !salesRepGroupName || !budgetYear) {
    return res.status(400).json({ 
      success: false, 
      error: 'Division, salesRepGroupName, and budgetYear are required' 
    });
  }
  
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  let query = `
    DELETE FROM ${tables.budgetUnified}
    WHERE UPPER(division_code) = UPPER($1)
      AND UPPER(TRIM(sales_rep_group_name)) = UPPER(TRIM($2))
      AND budget_year = $3
      AND budget_type = 'SALES_REP'
  `;
  
  const params = [division, salesRepGroupName, parseInt(budgetYear)];
  
  // Optionally filter by data source
  if (dataSource) {
    query += ` AND data_source = $4`;
    params.push(dataSource);
  }
  
  const result = await divisionPool.query(query, params);
  
  logger.info(`🗑️ Deleted ${result.rowCount} records for ${salesRepGroupName} / ${budgetYear} (data_source: ${dataSource || 'all'})`);
  
  successResponse(res, {
    message: `Deleted ${result.rowCount} budget records`,
    deletedCount: result.rowCount,
    salesRepGroupName,
    budgetYear: parseInt(budgetYear),
    dataSource: dataSource || 'all'
  });
}));

module.exports = router;
