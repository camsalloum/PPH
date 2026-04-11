/**
 * Product Group Projections Routes
 * Unified API endpoints for managing ESTIMATE and FORECAST data
 * 
 * Used by:
 * - EstimateTab: Save and retrieve estimates (type='ESTIMATE')
 * - ForecastTab: Save and retrieve forecasts (type='FORECAST')
 * 
 * Table: fp_product_group_projections (unified table)
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { getPoolForDivision, getTableNames } = require('./shared');

/**
 * GET /api/aebf/projections/:division/:year
 * Get all projections for a division and year
 * @query type - Optional: 'ESTIMATE' or 'FORECAST' to filter
 */
router.get('/:division/:year', async (req, res) => {
  try {
    const { division, year } = req.params;
    const { type } = req.query;
    const pool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    let query = `
      SELECT 
        pgcombine,
        month_no,
        type,
        amount,
        qty_kgs,
        morm,
        sls_per_kg,
        rm_per_kg
      FROM ${tables.productGroupProjections}
      WHERE UPPER(division_code) = UPPER($1) AND year = $2
    `;
    const params = [division.toUpperCase(), parseInt(year)];
    
    if (type) {
      query += ` AND UPPER(type) = UPPER($3)`;
      params.push(type);
    }
    
    query += ` ORDER BY pgcombine, month_no`;
    
    const result = await pool.query(query, params);
    
    // Group by product group with monthly data
    const projections = {};
    result.rows.forEach(row => {
      if (!projections[row.pgcombine]) {
        projections[row.pgcombine] = {
          type: row.type,
          months: {},
          totals: { amount: 0, qty_kgs: 0, morm: 0 }
        };
      }
      
      const monthKey = row.month_no || 'yearly';
      projections[row.pgcombine].months[monthKey] = {
        amount: parseFloat(row.amount) || 0,
        qty_kgs: parseFloat(row.qty_kgs) || 0,
        morm: parseFloat(row.morm) || 0,
        sls_per_kg: parseFloat(row.sls_per_kg) || 0,
        rm_per_kg: parseFloat(row.rm_per_kg) || 0
      };
      projections[row.pgcombine].totals.amount += parseFloat(row.amount) || 0;
      projections[row.pgcombine].totals.qty_kgs += parseFloat(row.qty_kgs) || 0;
      projections[row.pgcombine].totals.morm += parseFloat(row.morm) || 0;
    });
    
    res.json({
      success: true,
      data: projections,
      year: parseInt(year),
      division: division.toUpperCase()
    });
    
  } catch (error) {
    logger.error('Error fetching projections', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch projections' });
  }
});

/**
 * GET /api/aebf/projections/:division/:year/totals
 * Get yearly totals per product group (for ForecastTab)
 * @query type - Optional: 'ESTIMATE' or 'FORECAST'
 */
router.get('/:division/:year/totals', async (req, res) => {
  try {
    const { division, year } = req.params;
    const { type } = req.query;
    const pool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    let query = `
      SELECT 
        pgcombine,
        type,
        SUM(amount) as amount,
        SUM(qty_kgs) as kgs,
        SUM(morm) as morm,
        MAX(sls_per_kg) as sls_per_kg,
        MAX(rm_per_kg) as rm_per_kg
      FROM ${tables.productGroupProjections}
      WHERE UPPER(division_code) = UPPER($1) AND year = $2
    `;
    const params = [division.toUpperCase(), parseInt(year)];
    
    if (type) {
      query += ` AND UPPER(type) = UPPER($3)`;
      params.push(type);
    }
    
    query += ` GROUP BY pgcombine, type ORDER BY pgcombine`;
    
    const result = await pool.query(query, params);
    
    // Convert to object keyed by product group
    const totals = {};
    result.rows.forEach(row => {
      const kgs = parseFloat(row.kgs) || 0;
      const sales = parseFloat(row.amount) || 0;
      const morm = parseFloat(row.morm) || 0;
      
      totals[row.pgcombine] = {
        type: row.type,
        kgs,
        sales,
        morm,
        slsPerKg: parseFloat(row.sls_per_kg) || (kgs > 0 ? sales / kgs : 0),
        rmPerKg: parseFloat(row.rm_per_kg) || (kgs > 0 ? (sales - morm) / kgs : 0),
        mormPerKg: kgs > 0 ? morm / kgs : 0,
        mormPercent: sales > 0 ? (morm / sales) * 100 : 0
      };
    });
    
    res.json({
      success: true,
      data: totals,
      year: parseInt(year),
      division: division.toUpperCase()
    });
    
  } catch (error) {
    logger.error('Error fetching projection totals', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch totals' });
  }
});

/**
 * POST /api/aebf/projections/save
 * Save projections (upsert) - works for both ESTIMATE and FORECAST
 */
router.post('/save', async (req, res) => {
  const pool = getPoolForDivision(req.body.division);
  const client = await pool.connect();
  
  try {
    const { division, year, type, projections, createdBy } = req.body;
    const tables = getTableNames(division);
    
    if (!division || !year || !type || !projections) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: division, year, type, projections'
      });
    }
    
    if (!['ESTIMATE', 'FORECAST'].includes(type.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Type must be ESTIMATE or FORECAST'
      });
    }
    
    await client.query('BEGIN');
    
    let upsertCount = 0;
    
    // Handle both formats:
    // ESTIMATE: { pgcombine: { months: { 1: {amount, qty_kgs, morm}, ... } } }
    // FORECAST: { pgcombine: { kgs, slsPerKg, rmPerKg } } (yearly, no month)
    for (const [pgcombine, pgData] of Object.entries(projections)) {
      
      if (type.toUpperCase() === 'ESTIMATE' && pgData.months) {
        // Monthly estimates - use upsert
        for (const [monthNo, values] of Object.entries(pgData.months)) {
          const upsertQuery = `
            INSERT INTO ${tables.productGroupProjections} 
              (division_code, year, month_no, pgcombine, type, amount, qty_kgs, morm, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (division_code, year, month_no, pgcombine, type)
            DO UPDATE SET 
              amount = EXCLUDED.amount,
              qty_kgs = EXCLUDED.qty_kgs,
              morm = EXCLUDED.morm,
              updated_at = CURRENT_TIMESTAMP
          `;
          
          await client.query(upsertQuery, [
            division.toUpperCase(),
            parseInt(year),
            parseInt(monthNo),
            pgcombine,
            type.toUpperCase(),
            values.amount || 0,
            values.qty_kgs || 0,
            values.morm || 0,
            createdBy || 'system'
          ]);
          
          upsertCount++;
        }
      } else {
        // Yearly forecast (no month_no) - delete first then insert (NULL doesn't work with ON CONFLICT)
        const kgs = pgData.kgs || 0;
        const slsPerKg = pgData.slsPerKg || 0;
        const rmPerKg = pgData.rmPerKg || 0;
        
        // For Services Charges or items with direct sales/morm, use provided values
        // Otherwise calculate from kgs * slsPerKg
        let sales, morm;
        if (pgData.sales !== undefined && pgData.morm !== undefined) {
          // Direct values provided (e.g., Services Charges where MoRM = Sales)
          sales = pgData.sales || 0;
          morm = pgData.morm || 0;
        } else {
          // Calculate from kgs and per-kg rates
          sales = kgs * slsPerKg;
          const mormPerKg = slsPerKg - rmPerKg;
          morm = kgs * mormPerKg;
        }
        
        // Delete existing record if any
        await client.query(`
          DELETE FROM ${tables.productGroupProjections}
          WHERE division_code = $1 AND year = $2 AND month_no IS NULL AND pgcombine = $3 AND type = $4
        `, [division.toUpperCase(), parseInt(year), pgcombine, type.toUpperCase()]);
        
        // Insert new record
        const insertQuery = `
          INSERT INTO ${tables.productGroupProjections} 
            (division_code, year, month_no, pgcombine, type, qty_kgs, amount, morm, sls_per_kg, rm_per_kg, created_by)
          VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, $10)
        `;
        
        await client.query(insertQuery, [
          division.toUpperCase(),
          parseInt(year),
          pgcombine,
          type.toUpperCase(),
          kgs,
          sales,
          morm,
          slsPerKg,
          rmPerKg,
          createdBy || 'system'
        ]);
        
        upsertCount++;
      }
    }
    
    await client.query('COMMIT');
    
    logger.info(`✅ Saved ${upsertCount} ${type} records for ${division} ${year}`);
    
    res.json({
      success: true,
      message: `Saved ${upsertCount} ${type.toLowerCase()} records`,
      year: parseInt(year),
      division: division.toUpperCase(),
      type: type.toUpperCase()
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error saving projections', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to save projections' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/aebf/projections/:division/:year
 * Delete projections for a division and year
 * @query type - Required: 'ESTIMATE' or 'FORECAST'
 * @query months - Optional: comma-separated month numbers (for estimates)
 */
router.delete('/:division/:year', async (req, res) => {
  try {
    const { division, year } = req.params;
    const { type, months } = req.query;
    const pool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'Type parameter is required (ESTIMATE or FORECAST)'
      });
    }
    
    let query = `
      DELETE FROM ${tables.productGroupProjections}
      WHERE UPPER(division_code) = UPPER($1) 
        AND year = $2 
        AND UPPER(type) = UPPER($3)
    `;
    const params = [division.toUpperCase(), parseInt(year), type.toUpperCase()];
    
    if (months) {
      const monthArray = months.split(',').map(m => parseInt(m.trim()));
      query += ` AND month_no = ANY($4)`;
      params.push(monthArray);
    }
    
    const result = await pool.query(query, params);
    
    logger.info(`🗑️ Deleted ${result.rowCount} ${type} records for ${division} ${year}`);
    
    res.json({
      success: true,
      message: `Deleted ${result.rowCount} ${type.toLowerCase()} records`,
      deletedCount: result.rowCount
    });
    
  } catch (error) {
    logger.error('Error deleting projections', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete projections' });
  }
});

/**
 * GET /api/aebf/projections/:division/years
 * Get list of years that have projections
 * @query type - Optional: 'ESTIMATE' or 'FORECAST'
 */
router.get('/:division/years', async (req, res) => {
  try {
    const { division } = req.params;
    const { type } = req.query;
    const pool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    let query = `
      SELECT year, type, COUNT(DISTINCT pgcombine) as product_group_count
      FROM ${tables.productGroupProjections}
      WHERE UPPER(division_code) = UPPER($1)
    `;
    const params = [division.toUpperCase()];
    
    if (type) {
      query += ` AND UPPER(type) = UPPER($2)`;
      params.push(type);
    }
    
    query += ` GROUP BY year, type ORDER BY year DESC, type`;
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows.map(row => ({
        year: row.year,
        type: row.type,
        productGroupCount: parseInt(row.product_group_count)
      })),
      division: division.toUpperCase()
    });
    
  } catch (error) {
    logger.error('Error fetching projection years', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch years' });
  }
});

/**
 * POST /api/aebf/projections/calculate-pg-estimate
 * Calculate product group level estimates from actual data averages
 * Returns data grouped by product group and month for review before saving
 */
router.post('/calculate-pg-estimate', async (req, res) => {
  try {
    const { division, year, baseYear, selectedMonths } = req.body;
    
    // year = target year for estimates
    // baseYear = source year for actual data (optional, defaults to year)
    const targetYear = parseInt(year);
    const sourceYear = baseYear ? parseInt(baseYear) : targetYear;
    
    if (!division || !year) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: division and year are required'
      });
    }
    
    if (!selectedMonths || !Array.isArray(selectedMonths) || selectedMonths.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Please select at least one month to estimate. No months were selected.'
      });
    }
    
    const pool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    logger.info('📊 Calculate PG estimate request:', { division, targetYear, sourceYear, selectedMonths });
    
    // IMPORTANT: Use admin_division_code to include both FP and BF data when querying for FP
    // FP division in company_info maps to both FP and BF oracle division codes
    // admin_division_code groups them together (both FP and BF have admin_division_code = 'FP')
    
    // Get all actual months from the SOURCE year (baseYear) in fp_actualcommon
    const allMonthsQuery = `
      SELECT DISTINCT month_no
      FROM ${tables.actualcommon}
      WHERE UPPER(admin_division_code) = UPPER($1) AND year = $2
      ORDER BY month_no
    `;
    
    const allMonthsResult = await pool.query(allMonthsQuery, [division.toUpperCase(), sourceYear]);
    const allActualMonths = allMonthsResult.rows.map(row => row.month_no);
    
    logger.info(`📅 All actual months from ${sourceYear} in fp_actualcommon:`, allActualMonths);
    
    // Check if there's any actual data for the source year
    if (allActualMonths.length === 0) {
      return res.status(400).json({
        success: false,
        error: `No actual data found for base year ${sourceYear} in fp_actualcommon. Please select a different base year.`
      });
    }
    
    // Base period months = all actual months minus selected months (months to estimate)
    // When using a different base year, use ALL months from base year as the source
    const basePeriodMonths = sourceYear !== targetYear 
      ? allActualMonths  // Use all months from base year when estimating a different year
      : allActualMonths.filter(m => !selectedMonths.includes(m));  // Same year: exclude selected months
    
    if (basePeriodMonths.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No base period months available. You cannot select ALL actual months for estimation - at least one month must be used as the base period.'
      });
    }
    
    logger.info('📊 Base period months:', basePeriodMonths);
    logger.info('🎯 Estimate months for target year:', selectedMonths);
    
    // Get product group totals from base period (from SOURCE year in fp_actualcommon)
    // Use admin_division_code to include both FP and BF data
    // Exclude product groups from exclusion table
    const pgTotalsQuery = `
      SELECT 
        a.pgcombine,
        SUM(a.qty_kgs) as total_kgs,
        SUM(a.amount) as total_amount,
        SUM(a.morm) as total_morm
      FROM ${tables.actualcommon} a
      LEFT JOIN ${tables.productGroupExclusions} e 
        ON UPPER(e.division_code) = UPPER($1) 
        AND LOWER(e.product_group) = LOWER(a.pgcombine)
      WHERE UPPER(a.admin_division_code) = UPPER($1) 
        AND a.year = $2 
        AND a.month_no = ANY($3)
        AND e.id IS NULL  -- Exclude excluded product groups
      GROUP BY a.pgcombine
      ORDER BY a.pgcombine
    `;
    
    const pgResult = await pool.query(pgTotalsQuery, [
      division.toUpperCase(),
      sourceYear,  // Use source year for actual data
      basePeriodMonths
    ]);
    
    logger.info(`✅ Found ${pgResult.rows.length} product groups from ${sourceYear} base period`);
    
    // Calculate monthly averages per product group
    const productGroupEstimates = {};
    const monthCount = basePeriodMonths.length;
    
    pgResult.rows.forEach(row => {
      const avgKgs = parseFloat(row.total_kgs) / monthCount;
      const avgAmount = parseFloat(row.total_amount) / monthCount;
      const avgMorm = parseFloat(row.total_morm) / monthCount;
      
      productGroupEstimates[row.pgcombine] = {
        months: {}
      };
      
      // Create estimates for each selected month
      selectedMonths.sort((a, b) => a - b).forEach(month => {
        productGroupEstimates[row.pgcombine].months[month] = {
          amount: Math.round(avgAmount),
          qty_kgs: Math.round(avgKgs),
          morm: Math.round(avgMorm)
        };
      });
    });
    
    // Calculate summary totals
    const summaryTotals = {
      estimatedKgs: 0,
      estimatedAmount: 0,
      estimatedMorm: 0
    };
    
    Object.values(productGroupEstimates).forEach(pg => {
      Object.values(pg.months).forEach(monthData => {
        summaryTotals.estimatedKgs += monthData.qty_kgs;
        summaryTotals.estimatedAmount += monthData.amount;
        summaryTotals.estimatedMorm += monthData.morm;
      });
    });
    
    res.json({
      success: true,
      data: {
        estimates: productGroupEstimates,
        targetYear,
        sourceYear,
        basePeriodMonths,
        estimatedMonths: selectedMonths.sort((a, b) => a - b),
        baseMonthCount: monthCount,
        productGroupCount: Object.keys(productGroupEstimates).length,
        summaryTotals
      }
    });
    
  } catch (error) {
    logger.error('Error calculating PG estimates', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to calculate estimates' });
  }
});

/**
 * POST /api/aebf/projections/export-excel
 * Export ESTIMATE data by product group to Excel - Same format as divisional budget
 * Data comes from fp_product_group_projections table (ESTIMATE type)
 */
router.post('/export-excel', async (req, res) => {
  const ExcelJS = require('exceljs');
  const { division, year } = req.body;
  
  if (!division || !year) {
    return res.status(400).json({ success: false, error: 'Division and year are required' });
  }
  
  try {
    const pool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    // Get pricing data for Material/Process info (from pricingRounding + materialPercentages)
    const pricingQuery = `
      SELECT 
        TRIM(p.product_group) as product_group,
        COALESCE(m.material, '') as material,
        COALESCE(m.process, '') as process
      FROM ${tables.pricingRounding} p
      LEFT JOIN ${tables.materialPercentages} m 
        ON UPPER(TRIM(p.product_group)) = UPPER(TRIM(m.product_group))
      WHERE UPPER(p.division) = UPPER($1)
        AND p.product_group IS NOT NULL
        AND TRIM(p.product_group) != ''
    `;
    const pricingResult = await pool.query(pricingQuery, [division]);
    const pricingData = {};
    pricingResult.rows.forEach(row => {
      pricingData[row.product_group.toLowerCase().trim()] = {
        material: row.material || 'Unspecified',
        process: row.process || 'Unspecified'
      };
    });
    
    // Fetch material percentages for substrate calculation
    let materialPercentagesData = {};
    try {
      const mpResult = await pool.query(`SELECT * FROM ${tables.materialPercentages}`);
      mpResult.rows.forEach(row => {
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
    } catch (mpErr) {
      logger.warn('Could not fetch material percentages for Excel export:', mpErr.message);
    }
    
    // Get ALL product groups from budget in order (source of truth)
    const budgetPgQuery = `
      SELECT pgcombine, MIN(id) as first_id
      FROM ${tables.budgetUnified}
      WHERE pgcombine IS NOT NULL AND TRIM(pgcombine) != ''
      GROUP BY pgcombine
      ORDER BY MIN(id)
    `;
    const budgetPgResult = await pool.query(budgetPgQuery);
    const budgetProductGroups = budgetPgResult.rows.map(row => row.pgcombine);
    
    // Get ESTIMATE data from product_group_projections (NOT actualcommon!)
    const estimateQuery = `
      SELECT 
        pgcombine,
        SUM(qty_kgs) as kgs,
        SUM(amount) as sales,
        SUM(morm) as morm
      FROM ${tables.productGroupProjections}
      WHERE UPPER(division_code) = $1
        AND year = $2
        AND UPPER(type) = 'ESTIMATE'
      GROUP BY pgcombine
    `;
    const estimateResult = await pool.query(estimateQuery, [division.toUpperCase(), parseInt(year)]);
    
    // Create lookup map for ESTIMATE data
    const estimateDataMap = {};
    estimateResult.rows.forEach(row => {
      estimateDataMap[row.pgcombine] = {
        kgs: parseFloat(row.kgs) || 0,
        sales: parseFloat(row.sales) || 0,
        morm: parseFloat(row.morm) || 0
      };
    });
    
    // Combine all PGs from budget and estimates, then sort alphabetically
    // with "Others" second-to-last and "Services Charges" last
    const allPGs = new Set([...budgetProductGroups, ...Object.keys(estimateDataMap).filter(pg => pg)]);
    const allProductGroups = Array.from(allPGs).sort((a, b) => {
      const pgA = (a || '').toUpperCase().trim();
      const pgB = (b || '').toUpperCase().trim();
      
      // Services Charges always last
      if (pgA === 'SERVICES CHARGES') return 1;
      if (pgB === 'SERVICES CHARGES') return -1;
      
      // Others always second-to-last
      if (pgA === 'OTHERS') return 1;
      if (pgB === 'OTHERS') return -1;
      
      // Everything else alphabetical
      return a.localeCompare(b);
    });
    
    logger.info(`[Excel Export] Budget PGs: ${budgetProductGroups.length}, Estimate PGs: ${Object.keys(estimateDataMap).length}, Total: ${allProductGroups.length}`);
    
    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IPD Budget System';
    workbook.created = new Date();
    
    const ws = workbook.addWorksheet('Estimate Data', {
      views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }]
    });
    
    // Colors (same as divisional budget)
    const headerBgColor = 'FF1677FF';
    const headerFontColor = 'FFFFFFFF';
    const productGroupBgColor = 'FF87CEEB';
    const kgsBgColor = 'FFE3F2FD';
    const salesBgColor = 'FFE8F5E9';
    const mormBgColor = 'FFFFF3E0';
    const priceBgColor = 'FFF3E5F5';
    const pctBgColor = 'FFFCE4EC';
    const grandTotalBgColor = 'FF4CAF50';
    
    // Metrics
    const metrics = ['KGS', 'SALES', 'MORM', 'SLS/KG', 'RM/KG', 'MORM/KG', 'MORM %', '% of Sls'];
    
    // Helper for column letters
    const colLetter = (col) => {
      let letter = '';
      while (col > 0) {
        col--;
        letter = String.fromCharCode(65 + (col % 26)) + letter;
        col = Math.floor(col / 26);
      }
      return letter;
    };
    
    const applyBorder = (cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
      };
    };
    
    // ========== ROW 1: TITLE ==========
    ws.addRow([`${division} ESTIMATE ${year} - Sales by Product Group`]);
    ws.mergeCells(1, 1, 1, 2);
    ws.getRow(1).font = { bold: true, size: 14, color: { argb: headerFontColor } };
    ws.getRow(1).height = 30;
    ws.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBgColor } };
    ws.getCell('B1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBgColor } };
    
    // ========== ROW 2: HEADER ==========
    ws.addRow(['Product Groups Names', 'Total']);
    const row2 = ws.getRow(2);
    row2.font = { bold: true };
    row2.height = 25;
    row2.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 1; c <= 2; c++) {
      row2.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBgColor } };
      row2.getCell(c).font = { bold: true, color: { argb: headerFontColor } };
      applyBorder(row2.getCell(c));
    }
    
    // Set column widths
    ws.getColumn(1).width = 28;
    ws.getColumn(2).width = 18;
    
    // ========== DATA ROWS ==========
    let currentRow = 3;
    const kgsRows = [];
    const salesRows = [];
    const mormRows = [];
    
    // Track rows by Material and Process for summary sections
    const materialRowRefs = {};  // { materialName: { kgs: [rows], sales: [rows], morm: [rows] } }
    const processRowRefs = {};   // { processName: { kgs: [rows], sales: [rows], morm: [rows] } }
    
    // Store KGS data per product group for substrate calculation
    const productGroupKgsData = {};
    
    // Track cells that need % of Sls formula update after we know grand total row
    const pctOfSlsCells = [];
    
    allProductGroups.forEach((pg, pgIdx) => {
      const data = estimateDataMap[pg] || { kgs: 0, sales: 0, morm: 0 };
      const kgs = data.kgs;
      const sales = data.sales;
      const morm = data.morm;
      
      // Get Material/Process for this product group
      const pgKey = pg.toLowerCase().trim();
      const pricing = pricingData[pgKey] || { material: 'Unspecified', process: 'Unspecified' };
      const material = (pricing.material || 'Unspecified').trim();
      const process = (pricing.process || 'Unspecified').trim();
      
      // Check if this is Services Charges (special handling - only SALES, MORM, MORM %)
      const isServicesCharges = pg.toUpperCase().trim() === 'SERVICES CHARGES';
      
      // Store KGS for substrate calculation
      productGroupKgsData[pg] = kgs;
      
      // Initialize material/process tracking (skip for Services Charges)
      if (!isServicesCharges) {
        if (!materialRowRefs[material]) materialRowRefs[material] = { kgs: [], sales: [], morm: [] };
        if (!processRowRefs[process]) processRowRefs[process] = { kgs: [], sales: [], morm: [] };
      }
      
      // Product Group Name Row
      const pgRow = ws.addRow([pg]);
      pgRow.getCell(1).font = { bold: true };
      pgRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isServicesCharges ? 'FF9C27B0' : productGroupBgColor } };
      if (isServicesCharges) pgRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.mergeCells(currentRow, 1, currentRow, 2);
      applyBorder(pgRow.getCell(1));
      applyBorder(pgRow.getCell(2));
      currentRow++;
      
      // For Services Charges: only SALES, MORM, MORM %
      if (isServicesCharges) {
        const scSalesRowNum = currentRow;
        const scMormRowNum = currentRow + 1;
        
        // SALES row
        const salesRow = ws.addRow(['SALES']);
        salesRow.getCell(2).value = Math.round(sales);
        salesRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: salesBgColor } };
        salesRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: salesBgColor } };
        salesRow.getCell(2).alignment = { horizontal: 'right' };
        salesRow.getCell(2).numFmt = '#,##0';
        applyBorder(salesRow.getCell(1));
        applyBorder(salesRow.getCell(2));
        salesRows.push(currentRow);
        currentRow++;
        
        // MORM row
        const mormRow = ws.addRow(['MORM']);
        mormRow.getCell(2).value = Math.round(morm);
        mormRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: mormBgColor } };
        mormRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: mormBgColor } };
        mormRow.getCell(2).alignment = { horizontal: 'right' };
        mormRow.getCell(2).numFmt = '#,##0';
        applyBorder(mormRow.getCell(1));
        applyBorder(mormRow.getCell(2));
        mormRows.push(currentRow);
        currentRow++;
        
        // MORM % row
        const mormPctRow = ws.addRow(['MORM %']);
        mormPctRow.getCell(2).value = { formula: `IF(B${scSalesRowNum}=0,0,B${scMormRowNum}/B${scSalesRowNum}*100)` };
        mormPctRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pctBgColor } };
        mormPctRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pctBgColor } };
        mormPctRow.getCell(2).alignment = { horizontal: 'right' };
        mormPctRow.getCell(2).numFmt = '0.00';
        applyBorder(mormPctRow.getCell(1));
        applyBorder(mormPctRow.getCell(2));
        currentRow++;
        
        // Empty row after
        ws.addRow([]);
        currentRow++;
        return; // Skip to next product group
      }
      
      // Track rows for regular product groups
      const kgsRowNum = currentRow;
      const salesRowNum = currentRow + 1;
      const mormRowNum = currentRow + 2;
      const slsKgRowNum = currentRow + 3;
      const mormKgRowNum = currentRow + 5;
      
      kgsRows.push(kgsRowNum);
      salesRows.push(salesRowNum);
      mormRows.push(mormRowNum);
      
      // Track by material/process
      materialRowRefs[material].kgs.push(kgsRowNum);
      materialRowRefs[material].sales.push(salesRowNum);
      materialRowRefs[material].morm.push(mormRowNum);
      processRowRefs[process].kgs.push(kgsRowNum);
      processRowRefs[process].sales.push(salesRowNum);
      processRowRefs[process].morm.push(mormRowNum);
      
      // Metric rows with formulas
      metrics.forEach((metric, metricIdx) => {
        const dataRow = ws.addRow([metric]);
        let value;
        let bgColor;
        
        switch (metric) {
          case 'KGS':
            value = Math.round(kgs);
            bgColor = kgsBgColor;
            break;
          case 'SALES':
            value = Math.round(sales);
            bgColor = salesBgColor;
            break;
          case 'MORM':
            value = Math.round(morm);
            bgColor = mormBgColor;
            break;
          case 'SLS/KG':
            // Formula: SALES/KGS
            dataRow.getCell(2).value = { formula: `IF(B${kgsRowNum}=0,0,B${salesRowNum}/B${kgsRowNum})` };
            bgColor = priceBgColor;
            break;
          case 'RM/KG':
            // Formula: SLS/KG - MORM/KG
            dataRow.getCell(2).value = { formula: `IF(B${kgsRowNum}=0,0,B${slsKgRowNum}-B${mormKgRowNum})` };
            bgColor = priceBgColor;
            break;
          case 'MORM/KG':
            // Formula: MORM/KGS
            dataRow.getCell(2).value = { formula: `IF(B${kgsRowNum}=0,0,B${mormRowNum}/B${kgsRowNum})` };
            bgColor = priceBgColor;
            break;
          case 'MORM %':
            // Formula: MORM/SALES * 100
            dataRow.getCell(2).value = { formula: `IF(B${salesRowNum}=0,0,B${mormRowNum}/B${salesRowNum}*100)` };
            bgColor = pctBgColor;
            break;
          case '% of Sls':
            // Will be updated later with grand total reference
            dataRow.getCell(2).value = 0; // Placeholder, updated after grand totals
            pctOfSlsCells.push({ row: currentRow, salesRow: salesRowNum });
            bgColor = pctBgColor;
            break;
        }
        
        // Set value if not formula
        if (value !== undefined && !dataRow.getCell(2).value) {
          dataRow.getCell(2).value = value;
        }
        
        // Apply styling
        dataRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        dataRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        dataRow.getCell(2).alignment = { horizontal: 'right' };
        dataRow.getCell(2).numFmt = metric.includes('%') ? '0.00' : '#,##0.00';
        applyBorder(dataRow.getCell(1));
        applyBorder(dataRow.getCell(2));
        
        currentRow++;
      });
      
      // Add empty row between product groups
      ws.addRow([]);
      currentRow++;
    });
    
    // ========== GRAND TOTAL SECTION ==========
    const gtRow = ws.addRow(['GRAND TOTAL']);
    gtRow.getCell(1).font = { bold: true, color: { argb: headerFontColor } };
    gtRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: grandTotalBgColor } };
    ws.mergeCells(currentRow, 1, currentRow, 2);
    applyBorder(gtRow.getCell(1));
    applyBorder(gtRow.getCell(2));
    currentRow++;
    
    const gtKgsRowNum = currentRow;
    const gtSalesRowNum = currentRow + 1;
    const gtMormRowNum = currentRow + 2;
    const gtSlsKgRowNum = currentRow + 3;
    const gtMormKgRowNum = currentRow + 5;
    
    metrics.forEach((metric, idx) => {
      const dataRow = ws.addRow([metric]);
      let bgColor = grandTotalBgColor;
      
      switch (metric) {
        case 'KGS':
          dataRow.getCell(2).value = { formula: kgsRows.map(r => `B${r}`).join('+') };
          break;
        case 'SALES':
          dataRow.getCell(2).value = { formula: salesRows.map(r => `B${r}`).join('+') };
          break;
        case 'MORM':
          dataRow.getCell(2).value = { formula: mormRows.map(r => `B${r}`).join('+') };
          break;
        case 'SLS/KG':
          dataRow.getCell(2).value = { formula: `IF(B${gtKgsRowNum}=0,0,B${gtSalesRowNum}/B${gtKgsRowNum})` };
          break;
        case 'RM/KG':
          // RM/KG = SLS/KG - MORM/KG
          dataRow.getCell(2).value = { formula: `IF(B${gtKgsRowNum}=0,0,B${gtSlsKgRowNum}-B${gtMormKgRowNum})` };
          break;
        case 'MORM/KG':
          dataRow.getCell(2).value = { formula: `IF(B${gtKgsRowNum}=0,0,B${gtMormRowNum}/B${gtKgsRowNum})` };
          break;
        case 'MORM %':
          dataRow.getCell(2).value = { formula: `IF(B${gtSalesRowNum}=0,0,B${gtMormRowNum}/B${gtSalesRowNum}*100)` };
          break;
        case '% of Sls':
          dataRow.getCell(2).value = 100;
          break;
      }
      
      dataRow.getCell(1).font = { bold: true, color: { argb: headerFontColor } };
      dataRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: grandTotalBgColor } };
      dataRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: grandTotalBgColor } };
      dataRow.getCell(2).font = { bold: true, color: { argb: headerFontColor } };
      dataRow.getCell(2).alignment = { horizontal: 'right' };
      dataRow.getCell(2).numFmt = metric.includes('%') ? '0.00' : '#,##0.00';
      applyBorder(dataRow.getCell(1));
      applyBorder(dataRow.getCell(2));
      
      currentRow++;
    });
    
    // Now update all % of Sls cells with formula referencing grand total sales
    pctOfSlsCells.forEach(({ row, salesRow }) => {
      ws.getCell(row, 2).value = { formula: `IF(B${gtSalesRowNum}=0,0,B${salesRow}/B${gtSalesRowNum}*100)` };
    });
    
    // ========== MATERIAL GROUP SECTION ==========
    const materialBgColor = 'FFFFD700';
    const totalBgColor = 'FFE6FFE6';
    const materialNames = Object.keys(materialRowRefs).filter(m => m !== 'Unspecified').sort();
    
    // Helper to build SUM formula for multiple non-contiguous rows
    const buildSumFormula = (rows) => {
      if (rows.length === 0) return '0';
      return rows.map(r => `B${r}`).join('+');
    };
    
    if (materialNames.length > 0) {
      ws.addRow([]);
      currentRow++;
      
      // Material Group header
      const matGroupHeader = ws.addRow(['MATERIAL GROUP']);
      matGroupHeader.getCell(1).font = { bold: true, size: 12, color: { argb: headerFontColor } };
      matGroupHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: materialBgColor } };
      ws.mergeCells(currentRow, 1, currentRow, 2);
      applyBorder(matGroupHeader.getCell(1));
      applyBorder(matGroupHeader.getCell(2));
      currentRow++;
      
      materialNames.forEach((matName) => {
        const refs = materialRowRefs[matName];
        
        // Material name header row
        const matNameRow = ws.addRow([matName]);
        matNameRow.getCell(1).font = { bold: true };
        matNameRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: materialBgColor } };
        ws.mergeCells(currentRow, 1, currentRow, 2);
        applyBorder(matNameRow.getCell(1));
        applyBorder(matNameRow.getCell(2));
        currentRow++;
        
        const matKgsRowNum = currentRow;
        const matSalesRowNum = currentRow + 1;
        const matMormRowNum = currentRow + 2;
        
        // KGS, SALES, MORM rows
        ['KGS', 'SALES', 'MORM'].forEach((metric, idx) => {
          const dataRow = ws.addRow([metric]);
          const refRows = metric === 'KGS' ? refs.kgs : (metric === 'SALES' ? refs.sales : refs.morm);
          dataRow.getCell(2).value = { formula: buildSumFormula(refRows) };
          
          const bgColor = metric === 'KGS' ? kgsBgColor : (metric === 'SALES' ? salesBgColor : mormBgColor);
          dataRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
          dataRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
          dataRow.getCell(2).alignment = { horizontal: 'right' };
          dataRow.getCell(2).numFmt = '#,##0';
          applyBorder(dataRow.getCell(1));
          applyBorder(dataRow.getCell(2));
          currentRow++;
        });
        
        // SLS/KG
        const slsKgRow = ws.addRow(['SLS/KG']);
        slsKgRow.getCell(2).value = { formula: `IF(B${matKgsRowNum}=0,0,B${matSalesRowNum}/B${matKgsRowNum})` };
        slsKgRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: priceBgColor } };
        slsKgRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: priceBgColor } };
        slsKgRow.getCell(2).alignment = { horizontal: 'right' };
        slsKgRow.getCell(2).numFmt = '#,##0.00';
        applyBorder(slsKgRow.getCell(1));
        applyBorder(slsKgRow.getCell(2));
        currentRow++;
        
        // MORM/KG
        const mormKgRow = ws.addRow(['MORM/KG']);
        mormKgRow.getCell(2).value = { formula: `IF(B${matKgsRowNum}=0,0,B${matMormRowNum}/B${matKgsRowNum})` };
        mormKgRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: priceBgColor } };
        mormKgRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: priceBgColor } };
        mormKgRow.getCell(2).alignment = { horizontal: 'right' };
        mormKgRow.getCell(2).numFmt = '#,##0.00';
        applyBorder(mormKgRow.getCell(1));
        applyBorder(mormKgRow.getCell(2));
        currentRow++;
        
        // MORM %
        const mormPctRow = ws.addRow(['MORM %']);
        mormPctRow.getCell(2).value = { formula: `IF(B${matSalesRowNum}=0,0,B${matMormRowNum}/B${matSalesRowNum}*100)` };
        mormPctRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pctBgColor } };
        mormPctRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pctBgColor } };
        mormPctRow.getCell(2).alignment = { horizontal: 'right' };
        mormPctRow.getCell(2).numFmt = '0.00';
        applyBorder(mormPctRow.getCell(1));
        applyBorder(mormPctRow.getCell(2));
        currentRow++;
        
        // Empty row between materials
        ws.addRow([]);
        currentRow++;
      });
    }
    
    // ========== MATERIAL CONDITION SECTION ==========
    const processBgColor = 'FF98FB98';
    const processNames = Object.keys(processRowRefs).filter(p => p !== 'Unspecified').sort();
    
    if (processNames.length > 0) {
      ws.addRow([]);
      currentRow++;
      
      // Material Condition header
      const procSummaryHeader = ws.addRow(['MATERIAL CONDITION']);
      procSummaryHeader.getCell(1).font = { bold: true, size: 12, color: { argb: headerFontColor } };
      procSummaryHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: processBgColor } };
      ws.mergeCells(currentRow, 1, currentRow, 2);
      applyBorder(procSummaryHeader.getCell(1));
      applyBorder(procSummaryHeader.getCell(2));
      currentRow++;
      
      processNames.forEach((procName) => {
        const refs = processRowRefs[procName];
        
        // Process name header row
        const procNameRow = ws.addRow([procName]);
        procNameRow.getCell(1).font = { bold: true };
        procNameRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: processBgColor } };
        ws.mergeCells(currentRow, 1, currentRow, 2);
        applyBorder(procNameRow.getCell(1));
        applyBorder(procNameRow.getCell(2));
        currentRow++;
        
        const procKgsRowNum = currentRow;
        const procSalesRowNum = currentRow + 1;
        const procMormRowNum = currentRow + 2;
        
        // KGS, SALES, MORM rows
        ['KGS', 'SALES', 'MORM'].forEach((metric, idx) => {
          const dataRow = ws.addRow([metric]);
          const refRows = metric === 'KGS' ? refs.kgs : (metric === 'SALES' ? refs.sales : refs.morm);
          dataRow.getCell(2).value = { formula: buildSumFormula(refRows) };
          
          const bgColor = metric === 'KGS' ? kgsBgColor : (metric === 'SALES' ? salesBgColor : mormBgColor);
          dataRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
          dataRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
          dataRow.getCell(2).alignment = { horizontal: 'right' };
          dataRow.getCell(2).numFmt = '#,##0';
          applyBorder(dataRow.getCell(1));
          applyBorder(dataRow.getCell(2));
          currentRow++;
        });
        
        // SLS/KG
        const slsKgRow = ws.addRow(['SLS/KG']);
        slsKgRow.getCell(2).value = { formula: `IF(B${procKgsRowNum}=0,0,B${procSalesRowNum}/B${procKgsRowNum})` };
        slsKgRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: priceBgColor } };
        slsKgRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: priceBgColor } };
        slsKgRow.getCell(2).alignment = { horizontal: 'right' };
        slsKgRow.getCell(2).numFmt = '#,##0.00';
        applyBorder(slsKgRow.getCell(1));
        applyBorder(slsKgRow.getCell(2));
        currentRow++;
        
        // MORM/KG
        const mormKgRow = ws.addRow(['MORM/KG']);
        mormKgRow.getCell(2).value = { formula: `IF(B${procKgsRowNum}=0,0,B${procMormRowNum}/B${procKgsRowNum})` };
        mormKgRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: priceBgColor } };
        mormKgRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: priceBgColor } };
        mormKgRow.getCell(2).alignment = { horizontal: 'right' };
        mormKgRow.getCell(2).numFmt = '#,##0.00';
        applyBorder(mormKgRow.getCell(1));
        applyBorder(mormKgRow.getCell(2));
        currentRow++;
        
        // MORM %
        const mormPctRow = ws.addRow(['MORM %']);
        mormPctRow.getCell(2).value = { formula: `IF(B${procSalesRowNum}=0,0,B${procMormRowNum}/B${procSalesRowNum}*100)` };
        mormPctRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pctBgColor } };
        mormPctRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pctBgColor } };
        mormPctRow.getCell(2).alignment = { horizontal: 'right' };
        mormPctRow.getCell(2).numFmt = '0.00';
        applyBorder(mormPctRow.getCell(1));
        applyBorder(mormPctRow.getCell(2));
        currentRow++;
        
        // Empty row between processes
        ws.addRow([]);
        currentRow++;
      });
    }
    
    // ========== SUBSTRATED MT USED OR REQUIRED SECTION ==========
    const substrateTypes = ['PE', 'PP', 'PET', 'Alu', 'Paper', 'PVC/PET', 'Mix'];
    const substrateBgColor = 'FF1976D2';
    const substrateLightBgColor = 'FFE3F2FD';
    
    if (Object.keys(materialPercentagesData).length > 0) {
      ws.addRow([]);
      currentRow++;
      
      // Substrate Header Row
      const subHeaderRow = ws.addRow(['SUBSTRATED MT USED OR REQUIRED']);
      subHeaderRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      subHeaderRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: substrateBgColor } };
      ws.mergeCells(currentRow, 1, currentRow, 2);
      applyBorder(subHeaderRow.getCell(1));
      applyBorder(subHeaderRow.getCell(2));
      currentRow++;
      
      // Calculate substrate requirements
      substrateTypes.forEach(subType => {
        const subRow = ws.addRow([subType]);
        
        let substrateTotal = 0;
        
        // Sum substrate requirements from all product groups
        allProductGroups.forEach(pg => {
          const kgs = productGroupKgsData[pg] || 0;
          if (kgs > 0) {
            const pgKey = pg.toLowerCase().trim();
            const percentages = materialPercentagesData[pgKey];
            if (percentages) {
              const pct = percentages[subType] || 0;
              // Convert KGS to MT (÷1000) then apply percentage
              substrateTotal += (kgs / 1000) * pct / 100;
            }
          }
        });
        
        subRow.getCell(2).value = Math.round(substrateTotal);
        
        // Apply styling
        subRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: substrateLightBgColor } };
        subRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: substrateLightBgColor } };
        subRow.getCell(2).alignment = { horizontal: 'right' };
        subRow.getCell(2).numFmt = '#,##0';
        applyBorder(subRow.getCell(1));
        applyBorder(subRow.getCell(2));
        currentRow++;
      });
    }
    
    // Generate filename
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 5).replace(/:/g, '');  // HH:mm only
    const filename = `ESTIMATE_Divisional_${division.toUpperCase()}_${year}_${dateStr}_${timeStr}.xlsx`;
    
    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Write to response
    await workbook.xlsx.write(res);
    res.end();
    
    logger.info(`✅ Exported ESTIMATE Excel for ${division} ${year}: ${filename}`);
    
  } catch (error) {
    logger.error('Error exporting ESTIMATE Excel', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to export Excel' });
  }
});

/**
 * POST /api/aebf/projections/export-forecast-excel
 * Export FORECAST data by product group to Excel
 * Shows: Base Year (ACTUAL), Budget Year, Forecast Years
 * Data comes from fp_product_group_projections table (FORECAST type) and budget/actual
 */
router.post('/export-forecast-excel', async (req, res) => {
  const ExcelJS = require('exceljs');
  const { division, baseYear, forecastProjections1, forecastProjections2, hasEdits } = req.body;
  
  if (!division || !baseYear) {
    return res.status(400).json({ success: false, error: 'Division and baseYear are required' });
  }
  
  try {
    const pool = getPoolForDivision(division);
    const tables = getTableNames(division);
    
    const budgetYear = parseInt(baseYear) + 1;
    const forecastYear1 = parseInt(baseYear) + 2;
    const forecastYear2 = parseInt(baseYear) + 3;
    
    // Log if frontend sent edited values
    if (hasEdits) {
      logger.info(`[Export Forecast Excel] Division: ${division}, Base: ${baseYear}, WITH FRONTEND EDITS`);
    }
    
    // Get pricing data for Material/Process info
    const pricingQuery = `
      SELECT 
        TRIM(p.product_group) as product_group,
        COALESCE(m.material, '') as material,
        COALESCE(m.process, '') as process
      FROM ${tables.pricingRounding} p
      LEFT JOIN ${tables.materialPercentages} m 
        ON UPPER(TRIM(p.product_group)) = UPPER(TRIM(m.product_group))
      WHERE UPPER(p.division) = UPPER($1)
        AND p.product_group IS NOT NULL
        AND TRIM(p.product_group) != ''
    `;
    const pricingResult = await pool.query(pricingQuery, [division]);
    const pricingData = {};
    pricingResult.rows.forEach(row => {
      pricingData[row.product_group.toLowerCase().trim()] = {
        material: row.material || 'Unspecified',
        process: row.process || 'Unspecified'
      };
    });
    
    // Fetch material percentages for substrate calculation
    let materialPercentagesData = {};
    try {
      const mpResult = await pool.query(`SELECT * FROM ${tables.materialPercentages}`);
      mpResult.rows.forEach(row => {
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
    } catch (mpErr) {
      logger.warn('Could not fetch material percentages:', mpErr.message);
    }
    
    // 1. Get Base Year ACTUAL data from actualcommon (with exclusion filter like frontend)
    const actualQuery = `
      SELECT 
        a.pgcombine,
        SUM(a.qty_kgs) as kgs,
        SUM(a.amount) as sales,
        SUM(a.morm) as morm
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
    `;
    const actualResult = await pool.query(actualQuery, [division.toUpperCase(), parseInt(baseYear)]);
    const actualData = {};
    actualResult.rows.forEach(row => {
      if (row.pgcombine) {
        actualData[row.pgcombine] = {
          kgs: parseFloat(row.kgs) || 0,
          sales: parseFloat(row.sales) || 0,
          morm: parseFloat(row.morm) || 0
        };
      }
    });
    logger.info(`[Forecast Export] Actual data for ${baseYear}: ${actualResult.rows.length} rows, keys: ${Object.keys(actualData).slice(0,5).join(', ')}`);
    
    // 2. Get Budget data from budget_unified (no status filter - same as frontend)
    const budgetQuery = `
      SELECT 
        pgcombine,
        SUM(qty_kgs) as kgs,
        SUM(amount) as sales,
        SUM(morm) as morm
      FROM ${tables.budgetUnified}
      WHERE UPPER(division_code) = UPPER($1) 
        AND budget_year = $2
        AND pgcombine IS NOT NULL
        AND TRIM(pgcombine) != ''
      GROUP BY pgcombine
    `;
    const budgetResult = await pool.query(budgetQuery, [division, budgetYear]);
    const budgetData = {};
    budgetResult.rows.forEach(row => {
      if (row.pgcombine) {
        const sales = parseFloat(row.sales) || 0;
        let morm = parseFloat(row.morm) || 0;
        
        // For Services Charges, MORM = SALES (100% margin) if MORM is 0
        if (row.pgcombine.toUpperCase().trim() === 'SERVICES CHARGES' && morm === 0 && sales > 0) {
          morm = sales;
        }
        
        budgetData[row.pgcombine] = {
          kgs: parseFloat(row.kgs) || 0,
          sales,
          morm
        };
      }
    });
    logger.info(`[Forecast Export] Budget data for ${budgetYear}: ${budgetResult.rows.length} rows, keys: ${Object.keys(budgetData).slice(0,5).join(', ')}`);
    
    // 3. Get Forecast data from product_group_projections
    const forecastQuery = `
      SELECT 
        pgcombine, year,
        SUM(qty_kgs) as kgs,
        SUM(amount) as sales,
        SUM(morm) as morm
      FROM ${tables.productGroupProjections}
      WHERE UPPER(division_code) = $1 
        AND year IN ($2, $3)
        AND UPPER(type) = 'FORECAST'
      GROUP BY pgcombine, year
    `;
    const forecastResult = await pool.query(forecastQuery, [division.toUpperCase(), forecastYear1, forecastYear2]);
    let forecast1Data = {};
    let forecast2Data = {};
    forecastResult.rows.forEach(row => {
      const data = {
        kgs: parseFloat(row.kgs) || 0,
        sales: parseFloat(row.sales) || 0,
        morm: parseFloat(row.morm) || 0
      };
      if (parseInt(row.year) === forecastYear1) {
        forecast1Data[row.pgcombine] = data;
      } else {
        forecast2Data[row.pgcombine] = data;
      }
    });
    
    // ALWAYS use frontend values when provided - ensures Excel matches screen exactly
    if (forecastProjections1) {
      logger.info(`[Export Forecast Excel] Using ${Object.keys(forecastProjections1).length} frontend forecast1 values`);
      // Frontend sends pgcombine as key with {kgs, sales, morm} values
      Object.entries(forecastProjections1).forEach(([pgcombine, data]) => {
        forecast1Data[pgcombine] = {
          kgs: parseFloat(data.kgs) || 0,
          sales: parseFloat(data.sales) || 0,
          morm: parseFloat(data.morm) || 0
        };
      });
    }
    
    if (forecastProjections2) {
      logger.info(`[Export Forecast Excel] Using ${Object.keys(forecastProjections2).length} frontend forecast2 values`);
      Object.entries(forecastProjections2).forEach(([pgcombine, data]) => {
        forecast2Data[pgcombine] = {
          kgs: parseFloat(data.kgs) || 0,
          sales: parseFloat(data.sales) || 0,
          morm: parseFloat(data.morm) || 0
        };
      });
    }
    
    // Combine all product groups
    const allPGs = new Set([
      ...Object.keys(actualData),
      ...Object.keys(budgetData),
      ...Object.keys(forecast1Data),
      ...Object.keys(forecast2Data)
    ]);
    
    // Sort alphabetically with Others second-to-last, Services Charges last
    // (Same sorting logic as Estimate export)
    const allProductGroups = Array.from(allPGs).filter(pg => pg).sort((a, b) => {
      const pgA = (a || '').toUpperCase().trim();
      const pgB = (b || '').toUpperCase().trim();
      
      // Services Charges always last
      if (pgA === 'SERVICES CHARGES') return 1;
      if (pgB === 'SERVICES CHARGES') return -1;
      
      // Others always second-to-last
      if (pgA === 'OTHERS') return 1;
      if (pgB === 'OTHERS') return -1;
      
      // Everything else alphabetical
      return a.localeCompare(b);
    });
    
    logger.info(`[Forecast Export] PGs: ${allProductGroups.length}, Years: ${baseYear}-${forecastYear2}, Last 3: ${allProductGroups.slice(-3).join(', ')}`);
    
    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IPD Budget System';
    workbook.created = new Date();
    
    const ws = workbook.addWorksheet('Forecast Data', {
      views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }]
    });
    
    // Colors
    const headerBgColor = 'FF1677FF';
    const headerFontColor = 'FFFFFFFF';
    const productGroupBgColor = 'FF87CEEB';
    const kgsBgColor = 'FFE3F2FD';
    const salesBgColor = 'FFE8F5E9';
    const mormBgColor = 'FFFFF3E0';
    const priceBgColor = 'FFF3E5F5';
    const pctBgColor = 'FFFCE4EC';
    const grandTotalBgColor = 'FF4CAF50';
    const actualBgColor = 'FF81C784';
    const budgetBgColor = 'FF64B5F6';
    const forecastBgColor = 'FFFFB74D';
    
    const metrics = ['KGS', 'SALES', 'MORM', 'SLS/KG', 'RM/KG', 'MORM/KG', 'MORM %'];
    const years = [
      { year: parseInt(baseYear), label: `FY ${baseYear} (ACTUAL)`, data: actualData, color: actualBgColor },
      { year: budgetYear, label: `FY ${budgetYear} (Budget)`, data: budgetData, color: budgetBgColor },
      { year: forecastYear1, label: `FY ${forecastYear1} (Forecast)`, data: forecast1Data, color: forecastBgColor },
      { year: forecastYear2, label: `FY ${forecastYear2} (Forecast)`, data: forecast2Data, color: forecastBgColor }
    ];
    
    const applyBorder = (cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
      };
    };
    
    // ========== ROW 1: TITLE ==========
    ws.addRow([`${division} FORECAST ${baseYear}-${forecastYear2} - Sales by Product Group`]);
    ws.mergeCells(1, 1, 1, years.length + 1);
    ws.getRow(1).font = { bold: true, size: 14, color: { argb: headerFontColor } };
    ws.getRow(1).height = 30;
    ws.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 1; c <= years.length + 1; c++) {
      ws.getCell(1, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBgColor } };
    }
    
    // ========== ROW 2: HEADER ==========
    const headerRow = ['Product Group / Metric', ...years.map(y => y.label)];
    ws.addRow(headerRow);
    const row2 = ws.getRow(2);
    row2.font = { bold: true };
    row2.height = 25;
    row2.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 1; c <= years.length + 1; c++) {
      row2.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBgColor } };
      row2.getCell(c).font = { bold: true, color: { argb: headerFontColor } };
      applyBorder(row2.getCell(c));
    }
    
    // Set column widths
    ws.getColumn(1).width = 28;
    for (let c = 2; c <= years.length + 1; c++) {
      ws.getColumn(c).width = 18;
    }
    
    // ========== DATA ROWS ==========
    let currentRow = 3;
    const kgsRowRefs = { actual: [], budget: [], forecast1: [], forecast2: [] };
    const salesRowRefs = { actual: [], budget: [], forecast1: [], forecast2: [] };
    const mormRowRefs = { actual: [], budget: [], forecast1: [], forecast2: [] };
    
    // Track rows by Material and Process
    const materialRowRefs = {};
    const processRowRefs = {};
    const productGroupKgsData = {};
    
    allProductGroups.forEach((pg) => {
      const isServicesCharges = pg.toUpperCase().trim() === 'SERVICES CHARGES';
      
      // Get Material/Process
      const pgKey = pg.toLowerCase().trim();
      const pricing = pricingData[pgKey] || { material: 'Unspecified', process: 'Unspecified' };
      const material = (pricing.material || 'Unspecified').trim();
      const process = (pricing.process || 'Unspecified').trim();
      
      // Initialize tracking
      if (!isServicesCharges) {
        if (!materialRowRefs[material]) materialRowRefs[material] = { kgs: [], sales: [], morm: [] };
        if (!processRowRefs[process]) processRowRefs[process] = { kgs: [], sales: [], morm: [] };
      }
      
      // Product Group Name Row
      const pgRow = ws.addRow([pg]);
      pgRow.getCell(1).font = { bold: true };
      pgRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isServicesCharges ? 'FF9C27B0' : productGroupBgColor } };
      if (isServicesCharges) pgRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.mergeCells(currentRow, 1, currentRow, years.length + 1);
      applyBorder(pgRow.getCell(1));
      currentRow++;
      
      // For Services Charges: only SALES, MORM, MORM %
      const metricsToShow = isServicesCharges ? ['SALES', 'MORM', 'MORM %'] : metrics;
      
      // Track row numbers for this PG's metrics
      const kgsRowNum = currentRow;
      const salesRowNum = isServicesCharges ? currentRow : currentRow + 1;
      const mormRowNum = isServicesCharges ? currentRow + 1 : currentRow + 2;
      const slsKgRowNum = isServicesCharges ? null : currentRow + 3;
      const mormKgRowNum = isServicesCharges ? null : currentRow + 5;
      
      metricsToShow.forEach((metric) => {
        const dataRow = ws.addRow([metric]);
        
        years.forEach((yearInfo, yearIdx) => {
          const col = yearIdx + 2;
          const colLetter = String.fromCharCode(64 + col);
          const pgData = yearInfo.data[pg] || { kgs: 0, sales: 0, morm: 0 };
          
          switch (metric) {
            case 'KGS':
              dataRow.getCell(col).value = Math.round(pgData.kgs);
              break;
            case 'SALES':
              dataRow.getCell(col).value = Math.round(pgData.sales);
              break;
            case 'MORM':
              dataRow.getCell(col).value = Math.round(pgData.morm);
              break;
            case 'SLS/KG':
              // Formula: SALES/KGS
              dataRow.getCell(col).value = { formula: `IF(${colLetter}${kgsRowNum}=0,0,${colLetter}${salesRowNum}/${colLetter}${kgsRowNum})` };
              break;
            case 'RM/KG':
              // Formula: SLS/KG - MORM/KG
              dataRow.getCell(col).value = { formula: `IF(${colLetter}${kgsRowNum}=0,0,${colLetter}${slsKgRowNum}-${colLetter}${mormKgRowNum})` };
              break;
            case 'MORM/KG':
              // Formula: MORM/KGS
              dataRow.getCell(col).value = { formula: `IF(${colLetter}${kgsRowNum}=0,0,${colLetter}${mormRowNum}/${colLetter}${kgsRowNum})` };
              break;
            case 'MORM %':
              // Formula: MORM/SALES * 100
              dataRow.getCell(col).value = { formula: `IF(${colLetter}${salesRowNum}=0,0,${colLetter}${mormRowNum}/${colLetter}${salesRowNum}*100)` };
              break;
          }
          
          dataRow.getCell(col).alignment = { horizontal: 'right' };
          dataRow.getCell(col).numFmt = metric.includes('%') ? '0.00' : (metric.includes('/KG') ? '#,##0.00' : '#,##0');
          applyBorder(dataRow.getCell(col));
        });
        
        // Apply row styling based on metric
        let bgColor;
        switch (metric) {
          case 'KGS': bgColor = kgsBgColor; break;
          case 'SALES': bgColor = salesBgColor; break;
          case 'MORM': bgColor = mormBgColor; break;
          case 'SLS/KG': case 'RM/KG': case 'MORM/KG': bgColor = priceBgColor; break;
          case 'MORM %': bgColor = pctBgColor; break;
        }
        dataRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        applyBorder(dataRow.getCell(1));
        
        // Track KGS/SALES/MORM rows for grand totals (exclude Services Charges from KGS)
        if (metric === 'KGS' && !isServicesCharges) {
          kgsRowRefs.actual.push(currentRow);
          kgsRowRefs.budget.push(currentRow);
          kgsRowRefs.forecast1.push(currentRow);
          kgsRowRefs.forecast2.push(currentRow);
          materialRowRefs[material]?.kgs.push(currentRow);
          processRowRefs[process]?.kgs.push(currentRow);
        }
        if (metric === 'SALES') {
          salesRowRefs.actual.push(currentRow);
          salesRowRefs.budget.push(currentRow);
          salesRowRefs.forecast1.push(currentRow);
          salesRowRefs.forecast2.push(currentRow);
          if (!isServicesCharges) {
            materialRowRefs[material]?.sales.push(currentRow);
            processRowRefs[process]?.sales.push(currentRow);
          }
        }
        if (metric === 'MORM') {
          mormRowRefs.actual.push(currentRow);
          mormRowRefs.budget.push(currentRow);
          mormRowRefs.forecast1.push(currentRow);
          mormRowRefs.forecast2.push(currentRow);
          if (!isServicesCharges) {
            materialRowRefs[material]?.morm.push(currentRow);
            processRowRefs[process]?.morm.push(currentRow);
          }
        }
        
        currentRow++;
      });
      
      // Store KGS for substrate - all years
      if (!productGroupKgsData[pg]) productGroupKgsData[pg] = {};
      productGroupKgsData[pg].actual = actualData[pg]?.kgs || 0;
      productGroupKgsData[pg].budget = budgetData[pg]?.kgs || 0;
      productGroupKgsData[pg].forecast1 = forecast1Data[pg]?.kgs || 0;
      productGroupKgsData[pg].forecast2 = forecast2Data[pg]?.kgs || 0;
      
      // Empty row
      ws.addRow([]);
      currentRow++;
    });
    
    // ========== GRAND TOTAL SECTION ==========
    const gtRow = ws.addRow(['GRAND TOTAL']);
    gtRow.getCell(1).font = { bold: true, color: { argb: headerFontColor } };
    gtRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: grandTotalBgColor } };
    ws.mergeCells(currentRow, 1, currentRow, years.length + 1);
    applyBorder(gtRow.getCell(1));
    currentRow++;
    
    const gtKgsRowNum = currentRow;
    const gtSalesRowNum = currentRow + 1;
    const gtMormRowNum = currentRow + 2;
    const gtSlsKgRowNum = currentRow + 3;
    const gtMormKgRowNum = currentRow + 5;
    
    // Helper to build sum formula
    const buildSum = (rows, col) => rows.map(r => `${String.fromCharCode(64 + col)}${r}`).join('+');
    
    metrics.forEach((metric) => {
      const dataRow = ws.addRow([metric]);
      
      years.forEach((yearInfo, yearIdx) => {
        const col = yearIdx + 2;
        const colLetter = String.fromCharCode(64 + col);
        const rowRefs = yearIdx === 0 ? 'actual' : (yearIdx === 1 ? 'budget' : (yearIdx === 2 ? 'forecast1' : 'forecast2'));
        
        switch (metric) {
          case 'KGS':
            dataRow.getCell(col).value = { formula: buildSum(kgsRowRefs[rowRefs], col) };
            break;
          case 'SALES':
            dataRow.getCell(col).value = { formula: buildSum(salesRowRefs[rowRefs], col) };
            break;
          case 'MORM':
            dataRow.getCell(col).value = { formula: buildSum(mormRowRefs[rowRefs], col) };
            break;
          case 'SLS/KG':
            dataRow.getCell(col).value = { formula: `IF(${colLetter}${gtKgsRowNum}=0,0,${colLetter}${gtSalesRowNum}/${colLetter}${gtKgsRowNum})` };
            break;
          case 'RM/KG':
            dataRow.getCell(col).value = { formula: `IF(${colLetter}${gtKgsRowNum}=0,0,${colLetter}${gtSlsKgRowNum}-${colLetter}${gtMormKgRowNum})` };
            break;
          case 'MORM/KG':
            dataRow.getCell(col).value = { formula: `IF(${colLetter}${gtKgsRowNum}=0,0,${colLetter}${gtMormRowNum}/${colLetter}${gtKgsRowNum})` };
            break;
          case 'MORM %':
            dataRow.getCell(col).value = { formula: `IF(${colLetter}${gtSalesRowNum}=0,0,${colLetter}${gtMormRowNum}/${colLetter}${gtSalesRowNum}*100)` };
            break;
        }
        
        dataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: grandTotalBgColor } };
        dataRow.getCell(col).font = { bold: true, color: { argb: headerFontColor } };
        dataRow.getCell(col).alignment = { horizontal: 'right' };
        dataRow.getCell(col).numFmt = metric.includes('%') ? '0.00' : (metric.includes('/KG') ? '#,##0.00' : '#,##0');
        applyBorder(dataRow.getCell(col));
      });
      
      dataRow.getCell(1).font = { bold: true, color: { argb: headerFontColor } };
      dataRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: grandTotalBgColor } };
      applyBorder(dataRow.getCell(1));
      currentRow++;
    });
    
    // ========== MATERIAL GROUP SECTION ==========
    const materialBgColor = 'FFFFD700';
    const materialNames = Object.keys(materialRowRefs).filter(m => m !== 'Unspecified').sort();
    
    if (materialNames.length > 0) {
      ws.addRow([]);
      currentRow++;
      
      const matSummaryHeader = ws.addRow(['MATERIAL GROUP']);
      matSummaryHeader.getCell(1).font = { bold: true, size: 12, color: { argb: headerFontColor } };
      matSummaryHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: materialBgColor } };
      ws.mergeCells(currentRow, 1, currentRow, years.length + 1);
      applyBorder(matSummaryHeader.getCell(1));
      currentRow++;
      
      materialNames.forEach((matName) => {
        const refs = materialRowRefs[matName];
        
        const matNameRow = ws.addRow([matName]);
        matNameRow.getCell(1).font = { bold: true };
        matNameRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: materialBgColor } };
        ws.mergeCells(currentRow, 1, currentRow, years.length + 1);
        applyBorder(matNameRow.getCell(1));
        currentRow++;
        
        ['KGS', 'SALES', 'MORM'].forEach((metric) => {
          const dataRow = ws.addRow([metric]);
          const refRows = metric === 'KGS' ? refs.kgs : (metric === 'SALES' ? refs.sales : refs.morm);
          
          years.forEach((_, yearIdx) => {
            const col = yearIdx + 2;
            dataRow.getCell(col).value = { formula: buildSum(refRows, col) };
            const bgColor = metric === 'KGS' ? kgsBgColor : (metric === 'SALES' ? salesBgColor : mormBgColor);
            dataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
            dataRow.getCell(col).alignment = { horizontal: 'right' };
            dataRow.getCell(col).numFmt = '#,##0';
            applyBorder(dataRow.getCell(col));
          });
          
          const bgColor = metric === 'KGS' ? kgsBgColor : (metric === 'SALES' ? salesBgColor : mormBgColor);
          dataRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
          applyBorder(dataRow.getCell(1));
          currentRow++;
        });
        
        ws.addRow([]);
        currentRow++;
      });
    }
    
    // ========== MATERIAL CONDITION SECTION ==========
    const processBgColor = 'FF98FB98';
    const processNames = Object.keys(processRowRefs).filter(p => p !== 'Unspecified').sort();
    
    if (processNames.length > 0) {
      ws.addRow([]);
      currentRow++;
      
      const procSummaryHeader = ws.addRow(['MATERIAL CONDITION']);
      procSummaryHeader.getCell(1).font = { bold: true, size: 12, color: { argb: headerFontColor } };
      procSummaryHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: processBgColor } };
      ws.mergeCells(currentRow, 1, currentRow, years.length + 1);
      applyBorder(procSummaryHeader.getCell(1));
      currentRow++;
      
      processNames.forEach((procName) => {
        const refs = processRowRefs[procName];
        
        const procNameRow = ws.addRow([procName]);
        procNameRow.getCell(1).font = { bold: true };
        procNameRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: processBgColor } };
        ws.mergeCells(currentRow, 1, currentRow, years.length + 1);
        applyBorder(procNameRow.getCell(1));
        currentRow++;
        
        ['KGS', 'SALES', 'MORM'].forEach((metric) => {
          const dataRow = ws.addRow([metric]);
          const refRows = metric === 'KGS' ? refs.kgs : (metric === 'SALES' ? refs.sales : refs.morm);
          
          years.forEach((_, yearIdx) => {
            const col = yearIdx + 2;
            dataRow.getCell(col).value = { formula: buildSum(refRows, col) };
            const bgColor = metric === 'KGS' ? kgsBgColor : (metric === 'SALES' ? salesBgColor : mormBgColor);
            dataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
            dataRow.getCell(col).alignment = { horizontal: 'right' };
            dataRow.getCell(col).numFmt = '#,##0';
            applyBorder(dataRow.getCell(col));
          });
          
          const bgColor = metric === 'KGS' ? kgsBgColor : (metric === 'SALES' ? salesBgColor : mormBgColor);
          dataRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
          applyBorder(dataRow.getCell(1));
          currentRow++;
        });
        
        ws.addRow([]);
        currentRow++;
      });
    }
    
    // ========== SUBSTRATED MT USED OR REQUIRED SECTION ==========
    const substrateTypes = ['PE', 'PP', 'PET', 'Alu', 'Paper', 'PVC/PET', 'Mix'];
    const substrateBgColor = 'FF1976D2';
    const substrateLightBgColor = 'FFE3F2FD';
    const yearKeys = ['actual', 'budget', 'forecast1', 'forecast2'];
    
    if (Object.keys(materialPercentagesData).length > 0) {
      ws.addRow([]);
      currentRow++;
      
      const subHeaderRow = ws.addRow(['SUBSTRATED MT USED OR REQUIRED']);
      subHeaderRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      subHeaderRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: substrateBgColor } };
      ws.mergeCells(currentRow, 1, currentRow, years.length + 1);
      applyBorder(subHeaderRow.getCell(1));
      currentRow++;
      
      substrateTypes.forEach(subType => {
        const subRow = ws.addRow([subType]);
        
        // Calculate substrate for each year column
        yearKeys.forEach((yearKey, yearIdx) => {
          const col = yearIdx + 2;
          let substrateTotal = 0;
          
          allProductGroups.forEach(pg => {
            const kgs = productGroupKgsData[pg]?.[yearKey] || 0;
            if (kgs > 0) {
              const pgKey = pg.toLowerCase().trim();
              const percentages = materialPercentagesData[pgKey];
              if (percentages) {
                const pct = percentages[subType] || 0;
                substrateTotal += (kgs / 1000) * pct / 100;
              }
            }
          });
          
          subRow.getCell(col).value = Math.round(substrateTotal);
          subRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: substrateLightBgColor } };
          subRow.getCell(col).alignment = { horizontal: 'right' };
          subRow.getCell(col).numFmt = '#,##0';
          applyBorder(subRow.getCell(col));
        });
        
        subRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: substrateLightBgColor } };
        applyBorder(subRow.getCell(1));
        currentRow++;
      });
    }
    
    // Generate filename
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 5).replace(/:/g, '');
    const filename = `FORECAST_Divisional_${division.toUpperCase()}_${baseYear}-${forecastYear2}_${dateStr}_${timeStr}.xlsx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    await workbook.xlsx.write(res);
    res.end();
    
    logger.info(`✅ Exported FORECAST Excel for ${division} ${baseYear}-${forecastYear2}: ${filename}`);
    
  } catch (error) {
    logger.error('Error exporting FORECAST Excel', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to export Excel' });
  }
});

module.exports = router;
