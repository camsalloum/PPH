/**
 * Budget Draft API Routes
 * Handles draft budget operations for live React version
 */

const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { pool, authPool } = require('../database/config');
const { getDivisionPool } = require('../utils/divisionDatabaseManager');

/**
 * Helper function to extract division code from full division name
 * e.g., "FP-UAE" -> "fp", "PP-KSA" -> "pp"
 */
function extractDivisionCode(division) {
  if (!division) return 'fp'; // Default to FP for backward compatibility
  return division.split('-')[0].toLowerCase();
}

/**
 * Helper function to get the correct database pool for a division
 */
function getPoolForDivision(division) {
  const divisionCode = extractDivisionCode(division);
  return getDivisionPool(divisionCode.toUpperCase());
}

/**
 * Helper function to get table names for a division
 * ALL tables are division-prefixed
 */
function getTableNames(division) {
  const code = extractDivisionCode(division);
  return {
    salesRepBudget: `${code}_sales_rep_budget`,
    budgetUnifiedDraft: `${code}_budget_unified_draft`,
    budgetUnified: `${code}_budget_unified`,
    pricingRounding: `${code}_product_group_pricing_rounding`,
    materialPercentages: `${code}_material_percentages`
  };
}

/**
 * Helper function to get division name from division code
 * Looks up the full division name from company_settings based on code
 * Falls back to using the code if lookup fails
 */
async function getDivisionName(divisionCode) {
  try {
    const result = await authPool.query(`
      SELECT setting_value 
      FROM company_settings 
      WHERE setting_key = 'divisions'
    `);
    
    if (result.rows.length > 0 && result.rows[0].setting_value) {
      const divisions = result.rows[0].setting_value; // JSONB type, already parsed
      const division = divisions.find(d => d.code === divisionCode);
      if (division && division.name) {
        return division.name;
      }
    }
  } catch (error) {
    logger.warn(`⚠️ Could not lookup division name for ${divisionCode}:`, error.message);
  }
  
  // Fallback to code if lookup fails
  return divisionCode;
}

// ============================================================================
// SAVE DRAFT (Auto-save from live React version)
// ============================================================================

router.post('/save-draft', async (req, res) => {
  logger.info('💾 Save draft request received:', {
    division: req.body.division,
    salesRep: req.body.salesRep,
    budgetYear: req.body.budgetYear,
    budgetDataKeys: Object.keys(req.body.budgetData || {}).length,
    customRowsCount: (req.body.customRows || []).length
  });
  
  try {
    const { division, salesRep, budgetYear, customRows, budgetData } = req.body;
    
    if (!division || !salesRep || !budgetYear) {
      logger.error('❌ Missing required fields:', { division, salesRep, budgetYear });
      return res.status(400).json({
        success: false,
        error: 'division, salesRep, and budgetYear are required'
      });
    }
    
    logger.info('📋 Sample budget data entries:', Object.entries(budgetData || {}).slice(0, 3));
    
    // Get division-specific pool and table names
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    const divisionCode = extractDivisionCode(division);
    logger.info('📋 Using table:', tables.budgetUnifiedDraft);
    const client = await divisionPool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Delete existing draft for this sales rep/division/year
      await client.query(`
        DELETE FROM ${tables.budgetUnifiedDraft}
        WHERE UPPER(division_code) = UPPER($1) 
        AND UPPER(sales_rep_name) = UPPER($2) 
        AND budget_year = $3
      `, [divisionCode, salesRep, budgetYear]);
      
      // Insert new draft data (only KGS values)
      let insertedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      const invalidCustomers = []; // Track invalid customer names for notification
      
      const entries = Object.entries(budgetData || {});
      logger.info(`📝 Processing ${entries.length} budget entries...`);
      
      for (const [key, value] of entries) {
        // Allow zero values for budget reset functionality
        if (value === null || value === undefined || value === '') {
          skippedCount++;
          continue;
        }
        const numValue = parseFloat(value.toString().replace(/,/g, ''));
        if (isNaN(numValue)) {
          skippedCount++;
          continue;
        }
        
        // Parse key to extract customer, country, productGroup, month
        // Key format: "customer|country|productGroup|month" (standardized)
        let customer, country, productGroup, month;
        
        if (key.includes('|')) {
          // Standardized format: "customer|country|productGroup|month"
          const parts = key.split('|');
          if (parts.length !== 4) {
            logger.warn(`⚠️ Invalid key format: ${key}`);
            skippedCount++;
            continue;
          }
          
          customer = parts[0];
          country = parts[1];
          productGroup = parts[2];
          month = parseInt(parts[3]);
        } else if (key.startsWith('custom_')) {
          // Legacy format for custom rows: "custom_rowId_month"
          const parts = key.split('_');
          month = parseInt(parts[parts.length - 1]);
          
          const rowId = parts[1];
          const row = customRows?.find(r => r.id.toString() === rowId);
          if (!row || !row.customer || !row.country || !row.productGroup) {
            logger.warn(`⚠️ Custom row not found or incomplete: ${rowId}`);
            skippedCount++;
            continue;
          }
          customer = row.customer;
          country = row.country;
          productGroup = row.productGroup;
        } else {
          // Unknown format
          logger.warn(`⚠️ Unknown key format: ${key}`);
          skippedCount++;
          continue;
        }
        
        if (isNaN(month) || month < 1 || month > 12) {
          logger.warn(`⚠️ Invalid month: ${month} for key ${key}`);
          skippedCount++;
          continue;
        }
        if (!customer || !country || !productGroup) {
          logger.warn(`⚠️ Missing required fields for key ${key}:`, { customer, country, productGroup });
          skippedCount++;
          continue;
        }
        
        // Validate customer name is not a placeholder
        const customerLower = customer.trim().toLowerCase();
        const invalidCustomerPatterns = ['select customer', 'select', 'customer', 'choose customer', 'new customer', 'type or select', 'enter customer', 'add customer'];
        if (invalidCustomerPatterns.includes(customerLower) || customerLower.startsWith('select')) {
          logger.warn(`⚠️ Invalid customer name (placeholder): ${customer}`);
          if (!invalidCustomers.includes(customer)) {
            invalidCustomers.push(customer);
          }
          skippedCount++;
          continue;
        }
        
        const kgsValue = parseFloat(value.toString().replace(/,/g, '')) * 1000; // MT to KGS
        
        // Allow zero values for budget reset functionality
        // Only skip if NaN (already checked above, but double-check after conversion)
        if (isNaN(kgsValue)) {
          skippedCount++;
          continue;
        }
        
        // Get the full division name from company settings (not just the code)
        const divisionName = await getDivisionName(divisionCode);
        
        try {
          await client.query(`
            INSERT INTO ${tables.budgetUnifiedDraft} (
              division_name, division_code, budget_year, month_no, sales_rep_name,
              customer_name, country, pgcombine, qty_kgs, budget_status, budget_type, is_budget,
              created_at, updated_at, last_auto_save
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', 'SALES_REP', true,
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (division_code, budget_year, month_no, sales_rep_name, customer_name, pgcombine)
            DO UPDATE SET 
              qty_kgs = EXCLUDED.qty_kgs, 
              country = EXCLUDED.country,
              updated_at = CURRENT_TIMESTAMP,
              last_auto_save = CURRENT_TIMESTAMP
          `, [divisionName, divisionCode, budgetYear, month, salesRep, customer, country, productGroup, kgsValue]);
          
          insertedCount++;
        } catch (insertError) {
          errorCount++;
          logger.error(`❌ Error inserting record for key ${key}:`, {
            error: insertError.message,
            code: insertError.code,
            detail: insertError.detail,
            params: { division, divisionCode, budgetYear, month, salesRep, customer, country, productGroup, kgsValue }
          });
          // Continue processing other records
        }
      }
      
      logger.info(`✅ Draft save complete: inserted=${insertedCount}, skipped=${skippedCount}, errors=${errorCount}`);
      
      await client.query('COMMIT');
      
      const result = {
        success: true,
        message: invalidCustomers.length > 0 
          ? `Draft saved with warnings: ${invalidCustomers.length} invalid customer name(s) were skipped`
          : 'Draft saved successfully',
        recordsSaved: insertedCount,
        recordsSkipped: skippedCount,
        recordsWithErrors: errorCount,
        invalidCustomers: invalidCustomers, // Return list of invalid customers for notification
        savedAt: new Date().toISOString()
      };
      
      logger.info('✅ Sending success response:', result);
      res.json(result);
      
    } catch (error) {
      logger.error('❌ Error in transaction:', error);
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    logger.error('❌ Error saving draft:', error);
    logger.error('Error stack:', error.stack);
    logger.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
      table: error.table
    });
    res.status(500).json({
      success: false,
      error: error.message,
      errorCode: error.code,
      errorDetail: error.detail
    });
  }
});

// ============================================================================
// LOAD DRAFT
// ============================================================================

router.get('/load-draft/:division/:salesRep/:budgetYear', async (req, res) => {
  try {
    const { division, salesRep, budgetYear } = req.params;
    
    // Get division-specific pool and table names
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    const divisionCode = extractDivisionCode(division);
    
    const result = await divisionPool.query(`
      SELECT 
        division_name as division,
        budget_year,
        month_no as month,
        sales_rep_name as salesrepname,
        customer_name as customername,
        country as countryname,
        pgcombine as productgroup,
        qty_kgs as values,
        updated_at
      FROM ${tables.budgetUnifiedDraft}
      WHERE UPPER(division_code) = UPPER($1) 
      AND UPPER(sales_rep_name) = UPPER($2) 
      AND budget_year = $3
      ORDER BY customer_name, country, pgcombine, month_no
    `, [divisionCode, salesRep, parseInt(budgetYear)]);
    
    res.json({
      success: true,
      draftData: result.rows,
      hasDraft: result.rows.length > 0,
      lastSaved: result.rows.length > 0 ? result.rows[0].updated_at : null
    });
    
  } catch (error) {
    logger.error('Error loading draft:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// SUBMIT FINAL BUDGET (Convert draft to final with calculations)
// ============================================================================

router.post('/submit-final', async (req, res) => {
  logger.info('📤 Submit final budget request received:', req.body);
  let client = null;
  
  try {
    const { division, salesRep, budgetYear } = req.body;
    
    if (!division || !salesRep || !budgetYear) {
      logger.error('❌ Missing required fields');
      return res.status(400).json({
        success: false,
        error: 'division, salesRep, and budgetYear are required'
      });
    }
    
    logger.info('✅ Validating request:', { division, salesRep, budgetYear });
    
    // Get division-specific pool
    const divisionPool = getPoolForDivision(division);
    client = await divisionPool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get division code
      const divisionCode = division.split('-')[0].toLowerCase();
      logger.info('📋 Division code:', divisionCode);
      
      // Fetch material/process data
      const materialTableName = `${divisionCode}_material_percentages`;
      logger.info('📋 Material table:', materialTableName);
      
      let materialProcessResult;
      try {
        materialProcessResult = await client.query(`
          SELECT product_group, material, process 
          FROM ${materialTableName}
        `);
        logger.info(`✅ Found ${materialProcessResult.rows.length} material/process records`);
      } catch (tableError) {
        logger.error('❌ Error querying material table:', tableError);
        throw new Error(`Material percentages table not found: ${materialTableName}. Please ensure the table exists for division ${division}.`);
      }
      
      const materialProcessMap = {};
      materialProcessResult.rows.forEach(row => {
        materialProcessMap[row.product_group.toLowerCase()] = {
          material: row.material || '',
          process: row.process || ''
        };
      });
      
      // Fetch pricing data (previous year)
      const pricingYear = budgetYear - 1;
      logger.info(`📊 Fetching pricing data for division: ${divisionCode}, year: ${pricingYear}`);
      
      // Get division-specific table names
      const tables = getTableNames(division);
      
      let pricingResult;
      try {
        pricingResult = await client.query(`
          SELECT product_group, asp_round, morm_round
          FROM ${tables.pricingRounding}
          WHERE UPPER(division) = UPPER($1) AND year = $2
        `, [divisionCode, pricingYear]);
        logger.info(`✅ Found ${pricingResult.rows.length} pricing records`);
      } catch (pricingError) {
        logger.error('❌ Error querying pricing table:', pricingError);
        throw new Error(`Pricing table query failed: ${pricingError.message}. Please ensure the ${tables.pricingRounding} table exists.`);
      }
      
      const pricingMap = {};
      pricingResult.rows.forEach(row => {
        pricingMap[row.product_group.toLowerCase()] = {
          sellingPrice: row.asp_round ? parseFloat(row.asp_round) : null,
          morm: row.morm_round ? parseFloat(row.morm_round) : null
        };
      });
      
      // Check pricing data availability
      const warnings = [];
      if (Object.keys(pricingMap).length === 0) {
        warnings.push(`No pricing data found for year ${pricingYear}. Only KGS records will be created.`);
        logger.warn(`⚠️ No pricing data available for year ${pricingYear}`);
      }
      
      // Get draft data from budgetUnifiedDraft
      logger.info('🔍 Fetching draft data for:', { division, salesRep, budgetYear });
      const draftResult = await client.query(`
        SELECT 
          division_name,
          division_code,
          budget_year,
          month_no,
          sales_rep_name,
          customer_name,
          country,
          pgcombine,
          qty_kgs
        FROM ${tables.budgetUnifiedDraft}
        WHERE UPPER(division_code) = UPPER($1) 
        AND UPPER(sales_rep_name) = UPPER($2) 
        AND budget_year = $3
      `, [divisionCode, salesRep, budgetYear]);
      
      logger.info(`📊 Found ${draftResult.rows.length} draft records`);
      
      if (draftResult.rows.length === 0) {
        logger.error('❌ No draft data found');
        await client.query('ROLLBACK');
        // Don't release here - let finally block handle it
        return res.status(400).json({
          success: false,
          error: 'No draft data found to submit. Please enter budget values and wait for auto-save (every 30 seconds) before submitting.'
        });
      }
      
      // Delete existing final budget from budgetUnified
      await client.query(`
        DELETE FROM ${tables.budgetUnified}
        WHERE UPPER(division_code) = UPPER($1) 
        AND UPPER(sales_rep_name) = UPPER($2) 
        AND budget_year = $3
        AND is_budget = true
        AND budget_type = 'SALES_REP'
      `, [divisionCode, salesRep, budgetYear]);
      
      // Insert final budget to budgetUnified (single row with KGS, Amount, MoRM)
      let insertedCount = 0;
      let totalKGS = 0, totalAmount = 0, totalMoRM = 0;
      const invalidCustomers = []; // Track invalid customer names
      
      logger.info(`📝 Processing ${draftResult.rows.length} draft records...`);
      
      // Log first few rows for debugging
      if (draftResult.rows.length > 0) {
        logger.info('📋 Sample draft row:', {
          division_name: draftResult.rows[0].division_name,
          division_code: draftResult.rows[0].division_code,
          budget_year: draftResult.rows[0].budget_year,
          month_no: draftResult.rows[0].month_no,
          sales_rep_name: draftResult.rows[0].sales_rep_name,
          customer_name: draftResult.rows[0].customer_name,
          country: draftResult.rows[0].country,
          pgcombine: draftResult.rows[0].pgcombine,
          qty_kgs: draftResult.rows[0].qty_kgs
        });
      }
      
      for (let i = 0; i < draftResult.rows.length; i++) {
        const draftRow = draftResult.rows[i];
        
        try {
          const productGroupKey = (draftRow.pgcombine || '').toLowerCase();
          const materialProcess = materialProcessMap[productGroupKey] || { material: '', process: '' };
          const pricing = pricingMap[productGroupKey] || { sellingPrice: null, morm: null };
          
          const kgsValue = parseFloat(draftRow.qty_kgs) || 0;
          
          // Allow zero values - users may want to clear/reset budgets
          // Only skip if value is NaN or missing required fields
          if (isNaN(kgsValue)) {
            logger.warn(`⚠️ Skipping record ${i + 1}: Invalid KGS value (${draftRow.qty_kgs})`);
            continue;
          }
          
          if (!draftRow.customer_name || !draftRow.country || !draftRow.pgcombine) {
            logger.warn(`⚠️ Skipping record ${i + 1}: Missing required fields`, draftRow);
            continue;
          }
          
          // Validate customer name is not a placeholder
          const customerLower = draftRow.customer_name.trim().toLowerCase();
          const invalidCustomerPatterns = ['select customer', 'select', 'customer', 'choose customer', 'new customer', 'type or select', 'enter customer', 'add customer'];
          if (invalidCustomerPatterns.includes(customerLower) || customerLower.startsWith('select')) {
            logger.warn(`⚠️ Skipping record ${i + 1}: Invalid customer name (placeholder): ${draftRow.customer_name}`);
            if (!invalidCustomers.includes(draftRow.customer_name)) {
              invalidCustomers.push(draftRow.customer_name);
            }
            continue;
          }
          
          // Calculate Amount and MoRM from KGS
          const amountValue = pricing.sellingPrice !== null ? kgsValue * pricing.sellingPrice : null;
          const mormValue = pricing.morm !== null ? kgsValue * pricing.morm : null;
          
          // Get the full division name from company settings (not just the code)
          const divisionName = await getDivisionName(divisionCode);
          
          // Insert single row with KGS, Amount, MoRM to budgetUnified
          try {
            await client.query(`
              INSERT INTO ${tables.budgetUnified} (
                division_name, division_code, budget_year, month_no, sales_rep_name,
                customer_name, country, pgcombine,
                qty_kgs, amount, morm, material, process,
                is_budget, budget_type, budget_status,
                created_at, updated_at, uploaded_at, created_by
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 
                        true, 'SALES_REP', 'approved', 
                        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'submit_final')
            `, [divisionName, divisionCode, budgetYear, draftRow.month_no, salesRep, 
                draftRow.customer_name, draftRow.country, draftRow.pgcombine, 
                kgsValue, amountValue, mormValue,
                materialProcess.material, materialProcess.process]);
            insertedCount++;
            totalKGS += kgsValue;
            if (amountValue !== null) totalAmount += amountValue;
            if (mormValue !== null) totalMoRM += mormValue;
          } catch (insertError) {
            logger.error(`❌ Error inserting record ${i + 1}:`, insertError);
            logger.error('Insert parameters:', {
              division, divisionCode, budgetYear, month_no: draftRow.month_no, salesRep,
              customer: draftRow.customer_name, country: draftRow.country,
              productGroup: draftRow.pgcombine, kgsValue, amountValue, mormValue,
              material: materialProcess.material, process: materialProcess.process
            });
            throw insertError; // Re-throw to be caught by outer catch
          }
        } catch (rowError) {
          logger.error(`❌ Error processing draft row ${i + 1}:`, rowError);
          logger.error('Row data:', draftRow);
          // Continue with next row instead of failing completely
        }
      }
      
      logger.info(`✅ Processed all records: ${insertedCount} rows inserted to budgetUnified`);
      
      // Validate that at least some records were inserted
      if (insertedCount === 0) {
        logger.error('❌ No records were inserted. All rows may have failed validation.');
        await client.query('ROLLBACK');
        // Don't release here - let finally block handle it
        return res.status(400).json({
          success: false,
          error: 'No records were inserted. Please check that your budget data has valid customer, country, and product group values.'
        });
      }
      
      await client.query('COMMIT');
      
      // Sync budget unified table (non-blocking - continue even if it fails)
      try {
        await client.query('SELECT refresh_budget_unified_stats()');
        logger.info('✅ Budget unified table synced after submit');
      } catch (syncError) {
        logger.warn('⚠️ Budget unified sync failed (non-critical):', syncError.message);
      }
      
      logger.info('✅ Budget submitted successfully:', {
        kgs: insertedKGS,
        amount: insertedAmount,
        morm: insertedMoRM,
        total: insertedCount,
        totalKGS,
        totalAmount,
        totalMoRM
      });
      
      res.json({
        success: true,
        message: invalidCustomers.length > 0 
          ? `Budget submitted with warnings: ${invalidCustomers.length} invalid customer name(s) were skipped`
          : 'Budget submitted successfully',
        recordsInserted: insertedCount,
        valueTotals: {
          kgs: totalKGS,
          amount: totalAmount,
          morm: totalMoRM
        },
        pricingYear,
        warnings: warnings.length > 0 ? warnings : undefined,
        invalidCustomers: invalidCustomers.length > 0 ? invalidCustomers : undefined
      });
      
    } catch (error) {
      logger.error('❌ Database error in submit-final:', error);
      logger.error('Error stack:', error.stack);
      try { await client.query('ROLLBACK'); } catch (rbErr) { logger.error('Rollback failed:', rbErr); }
      throw error;
    }
    
  } catch (error) {
    logger.error('❌ Error submitting final budget:', error);
    logger.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
      table: error.table,
      column: error.column
    });
    
    // Provide more detailed error message
    let errorMessage = error.message || 'Failed to submit budget.';
    
    // Add SQL-specific error details if available
    if (error.code) {
      errorMessage += ` (Error Code: ${error.code})`;
    }
    if (error.detail) {
      errorMessage += ` Details: ${error.detail}`;
    }
    if (error.constraint) {
      errorMessage += ` Constraint: ${error.constraint}`;
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      errorCode: error.code,
      errorDetail: error.detail,
      errorConstraint: error.constraint,
      errorTable: error.table,
      errorColumn: error.column
    });
  }
  finally {
    try {
      if (client && typeof client.release === 'function') {
        client.release();
      }
    } catch (releaseErr) {
      logger.error('Error releasing DB client in submit-final finally block:', releaseErr);
    }
  }
});

// ============================================================================
// DELETE DRAFT
// ============================================================================

router.delete('/delete-draft/:division/:salesRep/:budgetYear', async (req, res) => {
  try {
    const { division, salesRep, budgetYear } = req.params;
    
    // Get division-specific pool and table names
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    const divisionCode = extractDivisionCode(division);
    
    const result = await divisionPool.query(`
      DELETE FROM ${tables.budgetUnifiedDraft}
      WHERE UPPER(division_code) = UPPER($1) 
      AND UPPER(sales_rep_name) = UPPER($2) 
      AND budget_year = $3
    `, [divisionCode, salesRep, parseInt(budgetYear)]);
    
    res.json({
      success: true,
      message: 'Draft deleted successfully',
      recordsDeleted: result.rowCount
    });
    
  } catch (error) {
    logger.error('Error deleting draft:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /delete-all-budget/:division/:budgetYear
 * Delete ALL budget data for a division and year (all sales reps)
 */
router.delete('/delete-all-budget/:division/:budgetYear', async (req, res) => {
  logger.info('🗑️ DELETE ALL budget request received:', req.params);
  try {
    const { division, budgetYear } = req.params;
    
    logger.info(`Deleting ALL budget for: Division=${division}, Year=${budgetYear}`);
    
    // Get division-specific pool and table names
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    const divisionCode = extractDivisionCode(division);
    
    // Delete from budgetUnified (SALES_REP type) and draft tables - ALL sales reps
    const finalResult = await divisionPool.query(`
      DELETE FROM ${tables.budgetUnified}
      WHERE UPPER(division_code) = UPPER($1) 
      AND budget_year = $2
      AND is_budget = true
      AND budget_type = 'SALES_REP'
    `, [divisionCode, parseInt(budgetYear)]);
    
    logger.info(`✅ Deleted ${finalResult.rowCount} records from ${tables.budgetUnified}`);
    
    const draftResult = await divisionPool.query(`
      DELETE FROM ${tables.budgetUnifiedDraft}
      WHERE UPPER(division_code) = UPPER($1) 
      AND budget_year = $2
    `, [divisionCode, parseInt(budgetYear)]);
    
    logger.info(`✅ Deleted ${draftResult.rowCount} records from ${tables.budgetUnifiedDraft}`);
    
    const totalDeleted = finalResult.rowCount + draftResult.rowCount;
    logger.info(`✅ Total deleted: ${totalDeleted} records for ALL sales reps`);
    
    res.json({
      success: true,
      message: `All budget data for ${budgetYear} deleted successfully`,
      deletedCount: totalDeleted,
      finalRecords: finalResult.rowCount,
      draftRecords: draftResult.rowCount
    });
    
  } catch (error) {
    logger.error('❌ Error deleting all budget:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.delete('/delete-final/:division/:salesRep/:budgetYear', async (req, res) => {
  logger.info('🗑️ DELETE budget request received:', req.params);
  try {
    const { division, salesRep, budgetYear } = req.params;
    
    logger.info(`Deleting budget for: Division=${division}, SalesRep=${salesRep}, Year=${budgetYear}`);
    
    // Get division-specific pool and table names
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    const divisionCode = extractDivisionCode(division);
    
    // Delete from budgetUnified (SALES_REP type) and draft tables
    const finalResult = await divisionPool.query(`
      DELETE FROM ${tables.budgetUnified}
      WHERE UPPER(division_code) = UPPER($1) 
      AND UPPER(sales_rep_name) = UPPER($2) 
      AND budget_year = $3
      AND is_budget = true
      AND budget_type = 'SALES_REP'
    `, [divisionCode, salesRep, parseInt(budgetYear)]);
    
    logger.info(`✅ Deleted ${finalResult.rowCount} records from ${tables.budgetUnified}`);
    
    const draftResult = await divisionPool.query(`
      DELETE FROM ${tables.budgetUnifiedDraft}
      WHERE UPPER(division_code) = UPPER($1) 
      AND UPPER(sales_rep_name) = UPPER($2) 
      AND budget_year = $3
    `, [divisionCode, salesRep, parseInt(budgetYear)]);
    
    logger.info(`✅ Deleted ${draftResult.rowCount} records from ${tables.budgetUnifiedDraft}`);
    
    const totalDeleted = finalResult.rowCount + draftResult.rowCount;
    logger.info(`✅ Total deleted: ${totalDeleted} records`);
    
    res.json({
      success: true,
      message: 'Budget deleted successfully',
      deletedCount: totalDeleted,
      finalRecords: finalResult.rowCount,
      draftRecords: draftResult.rowCount
    });
    
  } catch (error) {
    logger.error('❌ Error deleting final budget:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// DIVISIONAL BUDGET DRAFT ENDPOINTS
// ============================================================================

/**
 * Helper function to get divisional draft table name
 */
function getDivisionalDraftTable(division) {
  const code = extractDivisionCode(division);
  return `${code}_divisional_budget_draft`;
}

/**
 * POST /save-divisional-draft
 * Save divisional budget draft to fp_budget_unified with budget_status='draft'
 * Uses unified table as single source of truth
 */
router.post('/save-divisional-draft', async (req, res) => {
  logger.info('💾 Save divisional draft request received:', {
    division: req.body.division,
    budgetYear: req.body.budgetYear,
    budgetDataKeys: Object.keys(req.body.budgetData || {}).length,
    servicesChargesKeys: Object.keys(req.body.servicesChargesBudget || {}).length
  });
  
  try {
    const { division, budgetYear, budgetData, servicesChargesBudget } = req.body;
    
    if (!division || !budgetYear) {
      logger.error('❌ Missing required fields:', { division, budgetYear });
      return res.status(400).json({
        success: false,
        error: 'division and budgetYear are required'
      });
    }
    
    // Get the full division name from company settings
    const divisionName = await getDivisionName(division);
    logger.info(`📋 Division mapping: ${division} → ${divisionName}`);
    
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    logger.info('📋 Using unified table:', tables.budgetUnified);
    
    const client = await divisionPool.connect();
    
    try {
      await client.query('BEGIN');
      
      // IMPORTANT: Fetch pricing data to calculate Amount and MoRM
      // Use budgetYear - 1 for pricing (2026 budget uses 2025 pricing)
      const pricingYear = budgetYear <= 2025 ? parseInt(budgetYear) : parseInt(budgetYear) - 1;
      logger.info(`📊 Fetching pricing for Amount/MoRM calculation: year ${pricingYear}`);
      
      let pricingMap = {};
      try {
        const pricingResult = await client.query(`
          SELECT product_group, asp_round, morm_round
          FROM ${tables.pricingRounding}
          WHERE UPPER(division) = UPPER($1) AND year = $2
        `, [division, pricingYear]);
        
        pricingResult.rows.forEach(row => {
          pricingMap[row.product_group.toLowerCase().trim()] = {
            asp: parseFloat(row.asp_round) || 0,  // Amount per KG
            morm: parseFloat(row.morm_round) || 0  // MoRM per KG
          };
        });
        logger.info(`✅ Loaded pricing for ${Object.keys(pricingMap).length} product groups`);
      } catch (pricingError) {
        logger.warn(`⚠️ Could not load pricing: ${pricingError.message}. Amount/MoRM will be 0.`);
      }
      
      // IMPORTANT: We use UPSERT to handle both new entries and updates to existing records
      // The unique index idx_budget_unique_divisional prevents duplicates on (pgcombine, month_no, budget_year, division_code)
      // So we need ON CONFLICT DO UPDATE to modify existing records (whether draft or approved)
      
      let insertedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      
      // Process regular product group budget data
      // Key format: "productGroup|month"
      const entries = Object.entries(budgetData || {});
      logger.info(`📝 Processing ${entries.length} budget entries...`);
      
      for (const [key, value] of entries) {
        if (value === null || value === undefined || value === '') {
          skippedCount++;
          continue;
        }
        
        const numValue = parseFloat(value.toString().replace(/,/g, ''));
        if (isNaN(numValue) || numValue === 0) {
          skippedCount++;
          continue;
        }
        
        // Parse key: "productGroup|month"
        const parts = key.split('|');
        if (parts.length !== 2) {
          logger.warn(`⚠️ Invalid key format: ${key}`);
          skippedCount++;
          continue;
        }
        
        const productGroup = parts[0];
        const month = parseInt(parts[1]);
        
        if (isNaN(month) || month < 1 || month > 12) {
          logger.warn(`⚠️ Invalid month: ${month} for key ${key}`);
          skippedCount++;
          continue;
        }
        
        // Convert MT to KGS (multiply by 1000)
        const kgsValue = numValue * 1000;
        
        // Calculate Amount and MoRM from pricing
        const pricing = pricingMap[productGroup.toLowerCase().trim()] || { asp: 0, morm: 0 };
        const amountValue = kgsValue * pricing.asp;  // KGS × ASP (per kg)
        const mormValue = kgsValue * pricing.morm;   // KGS × MoRM (per kg)
        
        try {
          // Use UPSERT: Insert new record OR update existing one
          // This handles the case where approved records already exist
          // IMPORTANT: Do NOT downgrade 'approved' status back to 'draft'
          // Set budget_type = 'DIVISIONAL' for divisional budget
          const result = await client.query(`
            INSERT INTO ${tables.budgetUnified} (
              division_name, division_code, budget_year, month_no,
              pgcombine, qty_kgs, amount, morm, budget_status, budget_type, is_budget,
              created_at, updated_at, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', 'DIVISIONAL', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system')
            ON CONFLICT (pgcombine, month_no, budget_year, division_code) 
            WHERE is_budget = true AND budget_type = 'DIVISIONAL'
            DO UPDATE SET 
              qty_kgs = EXCLUDED.qty_kgs,
              amount = EXCLUDED.amount,
              morm = EXCLUDED.morm,
              updated_at = CURRENT_TIMESTAMP
            RETURNING (xmax = 0) as inserted
          `, [divisionName, division, budgetYear, month, productGroup, kgsValue.toString(), amountValue.toString(), mormValue.toString()]);
          
          if (result.rows[0]?.inserted) {
            insertedCount++;
          } else {
            updatedCount++;
          }
        } catch (insertError) {
          logger.error(`❌ Error upserting record for key ${key}:`, insertError.message);
        }
      }
      
      // Process Services Charges budget data (if any)
      // Key format: "Services Charges|month|AMOUNT"
      const servicesEntries = Object.entries(servicesChargesBudget || {});
      for (const [key, value] of servicesEntries) {
        if (value === null || value === undefined || value === '') {
          continue;
        }
        
        const numValue = parseFloat(value.toString().replace(/,/g, ''));
        if (isNaN(numValue) || numValue === 0) {
          continue;
        }
        
        const parts = key.split('|');
        if (parts.length !== 3 || parts[0] !== 'Services Charges') {
          continue;
        }
        
        const month = parseInt(parts[1]);
        
        if (isNaN(month) || month < 1 || month > 12) {
          continue;
        }
        
        // Convert k to actual value (multiply by 1000)
        const amountValue = numValue * 1000;
        // For Services Charges, MORM = SALES (100% margin)
        const mormValue = amountValue;
        
        try {
          // Use UPSERT for Services Charges too - budget_type = 'DIVISIONAL'
          const result = await client.query(`
            INSERT INTO ${tables.budgetUnified} (
              division_name, division_code, budget_year, month_no,
              pgcombine, qty_kgs, amount, morm, budget_status, budget_type, is_budget,
              created_at, updated_at, created_by
            ) VALUES ($1, $2, $3, $4, 'Services Charges', '0', $5, $6, 'draft', 'DIVISIONAL', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system')
            ON CONFLICT (pgcombine, month_no, budget_year, division_code) 
            WHERE is_budget = true AND budget_type = 'DIVISIONAL'
            DO UPDATE SET 
              amount = EXCLUDED.amount,
              morm = EXCLUDED.morm,
              updated_at = CURRENT_TIMESTAMP
            RETURNING (xmax = 0) as inserted
          `, [divisionName, division, budgetYear, month, amountValue.toString(), mormValue.toString()]);
          
          if (result.rows[0]?.inserted) {
            insertedCount++;
          } else {
            updatedCount++;
          }
        } catch (insertError) {
          logger.error(`❌ Error upserting Services Charges record:`, insertError.message);
        }
      }
      
      await client.query('COMMIT');
      
      const totalSaved = insertedCount + updatedCount;
      logger.info(`✅ Divisional draft saved for ${division}, Budget Year ${budgetYear}: ${insertedCount} inserted, ${updatedCount} updated`);
      
      res.json({
        success: true,
        message: `Draft saved successfully (${totalSaved} records: ${insertedCount} new, ${updatedCount} updated)`,
        recordsSaved: totalSaved,
        recordsInserted: insertedCount,
        recordsUpdated: updatedCount,
        recordsSkipped: skippedCount,
        division,
        budgetYear,
        savedAt: new Date().toISOString()
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`❌ Error saving divisional draft for ${division}:`, error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to save draft',
        details: error.message 
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error(`❌ Error in save-divisional-draft for ${division}:`, error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to save draft',
      details: error.message 
    });
  }
});

/**
 * GET /load-divisional-draft/:division/:budgetYear
 * Load divisional budget draft from unified table
 */
router.get('/load-divisional-draft/:division/:budgetYear', async (req, res) => {
  try {
    const { division, budgetYear } = req.params;
    
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    // Query draft records from unified table
    const result = await divisionPool.query(`
      SELECT 
        pgcombine,
        month_no,
        qty_kgs,
        amount
      FROM ${tables.budgetUnified}
      WHERE division_code = $1
      AND budget_year = $2
      AND budget_status = 'draft'
      AND budget_type = 'DIVISIONAL'
      AND is_budget = true
      ORDER BY month_no, pgcombine
    `, [division, parseInt(budgetYear)]);
    
    if (result.rows.length === 0) {
      return res.json({
        success: true,
        hasDraft: false,
        budgetData: {},
        servicesChargesBudget: {},
        message: 'No draft records found'
      });
    }
    
    // Convert database rows to frontend format
    const budgetData = {};
    const servicesChargesBudget = {};
    
    for (const row of result.rows) {
      const pgcombine = row.pgcombine;
      const monthNo = row.month_no;
      const qtyKgs = parseFloat(row.qty_kgs) || 0;
      const amount = parseFloat(row.amount) || 0;
      
      if (pgcombine === 'Services Charges') {
        // Services Charges stored as amount in 'k' (thousands)
        const key = `Services Charges|${monthNo}|AMOUNT`;
        servicesChargesBudget[key] = (amount / 1000).toFixed(2);
      } else {
        // Regular product groups stored as MT (qty_kgs / 1000)
        const key = `${pgcombine}|${monthNo}`;
        budgetData[key] = (qtyKgs / 1000).toFixed(3);
      }
    }
    
    res.json({
      success: true,
      hasDraft: true,
      budgetData,
      servicesChargesBudget,
      recordCount: result.rows.length,
      budgetYear: parseInt(budgetYear),
      loadedAt: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('❌ Error loading divisional draft:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load draft',
      details: error.message
    });
  }
});

/**
 * POST /submit-divisional-final
 * Submit divisional draft as final budget (change status from draft to approved)
 */
router.post('/submit-divisional-final', async (req, res) => {
  try {
    const { division, budgetYear } = req.body;
    
    if (!division || !budgetYear) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: division, budgetYear'
      });
    }
    
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    // Update budget_status from 'draft' to 'approved' for divisional level records
    const result = await divisionPool.query(`
      UPDATE ${tables.budgetUnified}
      SET budget_status = 'approved',
          updated_at = CURRENT_TIMESTAMP
      WHERE UPPER(division_code) = UPPER($1)
        AND budget_year = $2
        AND budget_status = 'draft'
        AND budget_type = 'DIVISIONAL'
    `, [division, parseInt(budgetYear)]);
    
    logger.info(`✅ Divisional draft promoted to approved: ${result.rowCount} records for ${division} ${budgetYear}`);
    
    res.json({
      success: true,
      message: `Divisional budget submitted successfully (${result.rowCount} records)`,
      recordsPromoted: result.rowCount,
      division,
      budgetYear,
      submittedAt: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('❌ Error submitting divisional final:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit final budget',
      details: error.message
    });
  }
});

/**
 * POST /edit-divisional-budget
 * Enable editing of approved budget (change status from approved to draft)
 */
router.post('/edit-divisional-budget', async (req, res) => {
  try {
    const { division, budgetYear } = req.body;
    
    if (!division || !budgetYear) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: division, budgetYear'
      });
    }
    
    const divisionPool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    // Update budget_status from 'approved' to 'draft' for divisional level records
    const result = await divisionPool.query(`
      UPDATE ${tables.budgetUnified}
      SET budget_status = 'draft',
          updated_at = CURRENT_TIMESTAMP
      WHERE UPPER(division_code) = UPPER($1)
        AND budget_year = $2
        AND budget_status = 'approved'
        AND budget_type = 'DIVISIONAL'
    `, [division, parseInt(budgetYear)]);
    
    logger.info(`✏️ Divisional budget unlocked for editing: ${result.rowCount} records for ${division} ${budgetYear}`);
    
    res.json({
      success: true,
      message: `Divisional budget unlocked for editing (${result.rowCount} records)`,
      recordsUnlocked: result.rowCount,
      division,
      budgetYear,
      unlockedAt: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('❌ Error unlocking divisional budget for editing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unlock budget for editing',
      details: error.message
    });
  }
});

/**
 * DELETE /delete-divisional-draft/:division/:budgetYear
 * Delete divisional budget draft
 */
router.delete('/delete-divisional-draft/:division/:budgetYear', async (req, res) => {
  try {
    const { division, budgetYear } = req.params;
    
    const divisionPool = getPoolForDivision(division);
    const draftTable = getDivisionalDraftTable(division);
    
    const result = await divisionPool.query(`
      DELETE FROM ${draftTable}
      WHERE UPPER(division) = UPPER($1) 
      AND budget_year = $2
    `, [division, parseInt(budgetYear)]);
    
    res.json({
      success: true,
      message: 'Divisional draft deleted successfully',
      recordsDeleted: result.rowCount
    });
    
  } catch (error) {
    logger.error('Error deleting divisional draft:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

