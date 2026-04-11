/**
 * @fileoverview AEBF Forecast P&L Routes
 * @module routes/aebf/forecast-pl
 * @description Handles Forecast P&L simulation based on forecast sales data
 * 
 * The Forecast P&L simulates financial P&L figures using:
 * - Sales, Sales Volume, Material, MoRM from forecast sales (fp_product_group_projections)
 * - All other P&L lines = Apply % of sales from Budget year to forecast sales
 * 
 * Data Sources:
 * - Actual: fp_pl_data (data_type = 'Actual')
 * - Budget: fp_pl_data (data_type = 'Budget')
 * - Forecast: Sales/Material/MoRM from projections, other items from % of Budget sales
 * 
 * @requires express
 * @requires ../services/plDataService For P&L actual/budget data
 * 
 * @routes
 * - GET  /forecast-pl-years/:division - Get available forecast years
 * - POST /forecast-pl-data - Get Forecast P&L data
 * - POST /save-forecast-pl - Save Forecast P&L to database
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { cacheMiddleware, CacheTTL, invalidateCache } = require('../../middleware/cache');
const { getPoolForDivision, getTableNames, isValidDivision, getValidDivisions } = require('./shared');
const { asyncHandler, successResponse } = require('../../middleware/aebfErrorHandler');
const { queryLimiter } = require('../../middleware/rateLimiter');
const plDataService = require('../../services/plDataService');

// Month name to number mapping
const MONTH_TO_NUMBER = {
  'January': 1, 'February': 2, 'March': 3, 'April': 4,
  'May': 5, 'June': 6, 'July': 7, 'August': 8,
  'September': 9, 'October': 10, 'November': 11, 'December': 12
};

const NUMBER_TO_MONTH = Object.fromEntries(
  Object.entries(MONTH_TO_NUMBER).map(([k, v]) => [v, k])
);

/**
 * P&L Line Items Configuration
 * Matches the P&L ledgers shown in the dashboard table view
 */
const PL_LINE_ITEMS = [
  // Sales Section
  { key: 'sales', label: 'Sales', source: 'forecast', isInput: true },
  { key: 'sales_volume_kg', label: 'Sales volume (kg)', source: 'forecast', isInput: true },
  { key: 'production_volume_kg', label: 'Production volume (kg)', source: 'actual_only', isInput: true, isHidden: true },
  
  // Cost Section
  { key: 'cost_of_sales', label: 'Cost of Sales', source: 'calculated', formula: 'material + dir_cost_goods_sold' },
  { key: 'material', label: 'Material', source: 'forecast', isInput: true },
  { key: 'morm', label: 'Margin over Material', source: 'forecast', isInput: true },
  
  // Direct Costs Section
  { key: 'labour', label: 'Labour', source: 'pct_of_sales', isInput: true },
  { key: 'depreciation', label: 'Depreciation', source: 'pct_of_sales', isInput: true },
  { key: 'electricity', label: 'Electricity', source: 'pct_of_sales', isInput: true },
  { key: 'others_mfg_overheads', label: 'Others Mfg. overheads', source: 'pct_of_sales', isInput: true },
  { key: 'actual_direct_cost', label: 'Actual Direct Cost Spent', source: 'calculated', formula: 'labour + depreciation + electricity + others_mfg_overheads' },
  { key: 'dir_cost_stock_adj', label: 'Dir.Cost in Stock/Stock Adj.', source: 'zero', isInput: false },
  { key: 'dir_cost_goods_sold', label: 'Dir.Cost of goods sold', source: 'calculated', formula: 'actual_direct_cost + dir_cost_stock_adj' },
  { key: 'direct_cost_pct_of_cogs', label: 'Direct cost as % of C.O.G.S', source: 'calculated', formula: '(dir_cost_goods_sold / cost_of_sales) * 100', isPct: true },
  
  // Gross Profit Section
  { key: 'gross_profit', label: 'Gross profit (after Depn.)', source: 'calculated', formula: 'sales - cost_of_sales' },
  { key: 'gross_profit_before_depn', label: 'Gross profit (before Depn.)', source: 'calculated', formula: 'gross_profit + depreciation' },
  
  // Selling & Admin Expenses
  { key: 'selling_expenses', label: 'Selling expenses', source: 'pct_of_sales', isInput: true },
  { key: 'transportation', label: 'Transportation', source: 'pct_of_sales', isInput: true },
  { key: 'admin_mgmt_fee_total', label: 'Administration & Management Fee', source: 'pct_of_sales', isInput: true },
  { key: 'bank_interest', label: 'Bank Interest', source: 'pct_of_sales', isInput: true },
  { key: 'bank_charges', label: 'Bank charges', source: 'pct_of_sales', isInput: true },
  { key: 'rd_preproduction', label: 'R & D, pre-production w/o', source: 'pct_of_sales', isInput: true },
  { key: 'stock_provision_adj', label: 'Stock Provision/Adjustment', source: 'pct_of_sales', isInput: true },
  { key: 'bad_debts', label: 'Bad debts', source: 'pct_of_sales', isInput: true },
  { key: 'other_income', label: 'Other Income', source: 'pct_of_sales', isInput: true },
  { key: 'other_provision', label: 'Other Provision', source: 'pct_of_sales', isInput: true },
  { key: 'total_below_gp_expenses', label: 'Total Below GP Expenses', source: 'calculated' },
  
  // Total Expenses
  { key: 'total_expenses', label: 'Total Expenses', source: 'calculated', formula: 'actual_direct_cost + total_below_gp_expenses' },
  
  // Net Profit Section
  { key: 'net_profit', label: 'Net Profit', source: 'calculated', formula: 'gross_profit - total_below_gp_expenses' },
  { key: 'ebit', label: 'EBIT', subtitle: 'Profit from operations', source: 'calculated', formula: 'net_profit + bank_interest' },
  { key: 'ebitda', label: 'EBITDA', subtitle: 'Cash profit', source: 'calculated', formula: 'net_profit + depreciation + bank_interest + rd_preproduction + other_provision' }
];

/**
 * GET /forecast-pl-years/:division
 * Get available forecast years (years that have FORECAST data in projections table)
 * 
 * @route GET /api/aebf/forecast-pl-years/:division
 * @param {string} division - Division (FP)
 * @returns {object} 200 - List of available forecast years
 */
router.get('/forecast-pl-years/:division', queryLimiter, asyncHandler(async (req, res) => {
  const { division } = req.params;
  
  if (!division || !(await isValidDivision(division))) {
    const validDivisions = await getValidDivisions();
    return res.status(400).json({ success: false, error: `Valid division (${validDivisions.join(' or ')}) is required` });
  }
  
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  // Get distinct years that have FORECAST data in projections table
  const query = `
    SELECT DISTINCT year
    FROM ${tables.productGroupProjections}
    WHERE UPPER(division_code) = UPPER($1)
      AND UPPER(type) = 'FORECAST'
    ORDER BY year DESC
  `;
  
  const result = await divisionPool.query(query, [division]);
  const years = result.rows.map(r => r.year);
  
  successResponse(res, { years });
}));

/**
 * POST /forecast-pl-data
 * Get Forecast P&L data
 * Combines actual P&L, budget P&L, and forecast sales data for BOTH forecast years
 * 
 * @route POST /api/aebf/forecast-pl-data
 * @body {string} division - Division (FP)
 * @body {number} baseYear - Base year (Actual year) - same concept as Forecast Sales
 * @returns {object} 200 - P&L data with actual, budget, and both forecast years
 */
router.post('/forecast-pl-data', queryLimiter, cacheMiddleware({ ttl: CacheTTL.SHORT }), asyncHandler(async (req, res) => {
  const { division, baseYear, forceRecalculate } = req.body;
  
  if (!division || !baseYear) {
    return res.status(400).json({ success: false, error: 'Division and baseYear are required' });
  }
  
  // Years follow Forecast Sales pattern:
  // Actual = baseYear, Budget = baseYear + 1, Forecast1 = baseYear + 2, Forecast2 = baseYear + 3
  const actualYear = parseInt(baseYear);
  const budgetYear = parseInt(baseYear) + 1;
  const fcstYear1 = parseInt(baseYear) + 2;
  const fcstYear2 = parseInt(baseYear) + 3;
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  logger.info(`Fetching Forecast P&L data for ${division}, base year ${actualYear}, budget year ${budgetYear}, forecast years ${fcstYear1} & ${fcstYear2}`);
  
  // 1. Get actual P&L data from pl_data table
  let actualPLData = [];
  try {
    actualPLData = await plDataService.getPLData(division.toUpperCase(), { 
      year: actualYear, 
      dataType: 'Actual' 
    });
  } catch (error) {
    logger.warn(`No actual P&L data for ${division} ${actualYear}:`, error.message);
  }
  
  // Organize actual data by month
  const actualByMonth = {};
  const actualYearTotals = {};
  
  actualPLData.forEach(row => {
    const monthNum = MONTH_TO_NUMBER[row.month];
    if (monthNum) {
      row.morm = (parseFloat(row.sales) || 0) - (parseFloat(row.material) || 0);
      actualByMonth[monthNum] = row;
      
      // Accumulate year totals
      PL_LINE_ITEMS.forEach(item => {
        if (!actualYearTotals[item.key]) actualYearTotals[item.key] = 0;
        const val = parseFloat(row[item.key]) || 0;
        if (!item.isPct) {
          actualYearTotals[item.key] += val;
        }
      });
    }
  });
  
  // 2. Get budget P&L data from pl_data table
  let budgetPLData = [];
  try {
    budgetPLData = await plDataService.getPLData(division.toUpperCase(), { 
      year: budgetYear, 
      dataType: 'Budget' 
    });
  } catch (error) {
    logger.warn(`No budget P&L data for ${division} ${budgetYear}:`, error.message);
  }
  
  // Organize budget data by month
  const budgetByMonth = {};
  const budgetYearTotals = {};
  
  budgetPLData.forEach(row => {
    const monthNum = MONTH_TO_NUMBER[row.month];
    if (monthNum) {
      row.morm = (parseFloat(row.sales) || 0) - (parseFloat(row.material) || 0);
      budgetByMonth[monthNum] = row;
      
      // Accumulate year totals
      PL_LINE_ITEMS.forEach(item => {
        if (!budgetYearTotals[item.key]) budgetYearTotals[item.key] = 0;
        const val = parseFloat(row[item.key]) || 0;
        if (!item.isPct) {
          budgetYearTotals[item.key] += val;
        }
      });
    }
  });
  
  // 3. Get forecast sales data from projections table for BOTH forecast years
  const forecastSalesQuery = `
    SELECT 
      year,
      SUM(COALESCE(qty_kgs::numeric, 0)) as total_kgs,
      SUM(COALESCE(amount::numeric, 0)) as total_sales,
      SUM(COALESCE(morm::numeric, 0)) as total_morm
    FROM ${tables.productGroupProjections}
    WHERE UPPER(division_code) = UPPER($1)
      AND year IN ($2, $3)
      AND UPPER(type) = 'FORECAST'
    GROUP BY year
  `;
  
  const forecastSalesResult = await divisionPool.query(forecastSalesQuery, [division, fcstYear1, fcstYear2]);
  
  // Helper function to build forecast totals for a year
  const buildForecastTotals = (yearData) => {
    const totals = {
      sales: parseFloat(yearData?.total_sales) || 0,
      sales_volume_kg: parseFloat(yearData?.total_kgs) || 0,
      morm: parseFloat(yearData?.total_morm) || 0
    };
    totals.material = totals.sales - totals.morm;
    return totals;
  };
  
  // Get totals for each forecast year
  const fcst1Data = forecastSalesResult.rows.find(r => r.year === fcstYear1);
  const fcst2Data = forecastSalesResult.rows.find(r => r.year === fcstYear2);
  
  const forecastSalesTotals1 = buildForecastTotals(fcst1Data);
  const forecastSalesTotals2 = buildForecastTotals(fcst2Data);
  
  // For monthly distribution, use budget's monthly distribution pattern (proportional)
  const budgetYearSales = budgetYearTotals.sales || 1; // Avoid division by zero
  
  const buildForecastByMonth = (forecastTotals) => {
    const byMonth = {};
    for (let m = 1; m <= 12; m++) {
      const budgetMonthData = budgetByMonth[m] || {};
      const budgetMonthSales = parseFloat(budgetMonthData.sales) || 0;
      const proportion = budgetMonthSales / budgetYearSales;
      
      byMonth[m] = {
        sales: forecastTotals.sales * proportion,
        sales_volume_kg: forecastTotals.sales_volume_kg * proportion,
        morm: forecastTotals.morm * proportion,
        material: forecastTotals.material * proportion
      };
    }
    return byMonth;
  };
  
  const forecastByMonth1 = buildForecastByMonth(forecastSalesTotals1);
  const forecastByMonth2 = buildForecastByMonth(forecastSalesTotals2);
  
  // 4. Calculate % of sales from Budget year (to use as default for Forecast)
  const budgetYearSalesForPct = budgetYearTotals.sales || 0;
  const budgetPctOfSales = {};
  
  PL_LINE_ITEMS.filter(item => item.source === 'pct_of_sales').forEach(item => {
    const budgetYearValue = budgetYearTotals[item.key] || 0;
    budgetPctOfSales[item.key] = budgetYearSalesForPct > 0 ? budgetYearValue / budgetYearSalesForPct : 0;
  });
  
  // 5. Check if there's saved Forecast P&L data for BOTH years
  let savedForecastPLData1 = [];
  let savedForecastPLData2 = [];
  let hasSavedForecastData1 = false;
  let hasSavedForecastData2 = false;
  let savedMaterialVariancePct1 = 0;  // Material variance for Forecast Year 1
  let savedMaterialVariancePct2 = 0;  // Material variance for Forecast Year 2
  
  try {
    savedForecastPLData1 = await plDataService.getPLData(division.toUpperCase(), { 
      year: fcstYear1, 
      dataType: 'Forecast' 
    });
    hasSavedForecastData1 = savedForecastPLData1 && savedForecastPLData1.length > 0;
    if (hasSavedForecastData1) {
      savedMaterialVariancePct1 = parseFloat(savedForecastPLData1[0]?.material_variance_pct) || 0;
      logger.info(`Found ${savedForecastPLData1.length} saved Forecast P&L records for ${division} ${fcstYear1}, variance: ${savedMaterialVariancePct1}%`);
    }
  } catch (error) {
    logger.warn(`No saved Forecast P&L data for ${division} ${fcstYear1}:`, error.message);
  }
  
  try {
    savedForecastPLData2 = await plDataService.getPLData(division.toUpperCase(), { 
      year: fcstYear2, 
      dataType: 'Forecast' 
    });
    hasSavedForecastData2 = savedForecastPLData2 && savedForecastPLData2.length > 0;
    if (hasSavedForecastData2) {
      savedMaterialVariancePct2 = parseFloat(savedForecastPLData2[0]?.material_variance_pct) || 0;
      logger.info(`Found ${savedForecastPLData2.length} saved Forecast P&L records for ${division} ${fcstYear2}, variance: ${savedMaterialVariancePct2}%`);
    }
  } catch (error) {
    logger.warn(`No saved Forecast P&L data for ${division} ${fcstYear2}:`, error.message);
  }
  
  // 6. Calculate forecast P&L values for a given forecast month data
  const calculateForecastPL = (forecastByMonth, month) => {
    const forecastBase = forecastByMonth[month];
    const forecastSales = forecastBase.sales;
    
    const forecastRow = {};
    
    PL_LINE_ITEMS.forEach(item => {
      if (item.source === 'forecast') {
        // Directly from forecast sales data
        if (item.key === 'sales') {
          forecastRow[item.key] = forecastBase.sales;
        } else if (item.key === 'sales_volume_kg') {
          forecastRow[item.key] = forecastBase.sales_volume_kg;
        } else if (item.key === 'morm') {
          forecastRow[item.key] = forecastBase.morm;
        } else if (item.key === 'material') {
          forecastRow[item.key] = forecastBase.material;
        }
      } else if (item.source === 'pct_of_sales') {
        // Apply Budget's % of sales to forecast sales
        const pct = budgetPctOfSales[item.key] || 0;
        forecastRow[item.key] = forecastSales * pct;
      } else if (item.source === 'actual_only' || item.source === 'zero') {
        forecastRow[item.key] = 0;
      }
    });
    
    // Calculate derived fields
    const num = (key) => parseFloat(forecastRow[key]) || 0;
    
    // Actual Direct Cost
    forecastRow.actual_direct_cost = num('labour') + num('depreciation') + num('electricity') + num('others_mfg_overheads');
    
    // Dir.Cost of goods sold
    forecastRow.dir_cost_goods_sold = num('actual_direct_cost') + num('dir_cost_stock_adj');
    
    // Cost of Sales
    forecastRow.cost_of_sales = num('material') + num('dir_cost_goods_sold');
    
    // Gross Profit
    forecastRow.gross_profit = forecastBase.sales - num('cost_of_sales');
    forecastRow.gross_profit_before_depn = num('gross_profit') + num('depreciation');
    
    // Finance costs
    forecastRow.total_finance_cost = num('bank_interest') + num('bank_charges') + num('rd_preproduction');
    
    // Total Below GP Expenses
    forecastRow.total_below_gp_expenses = num('other_income') + num('bad_debts') + num('stock_provision_adj') + 
                                          num('total_finance_cost') + num('admin_mgmt_fee_total') + 
                                          num('transportation') + num('selling_expenses') + num('other_provision');
    
    // Net Profit
    forecastRow.net_profit = num('gross_profit') - num('total_below_gp_expenses');
    
    // EBIT
    forecastRow.ebit = num('net_profit') + num('bank_interest');
    
    // EBITDA
    forecastRow.ebitda = num('net_profit') + num('depreciation') + num('bank_interest') + num('rd_preproduction') + num('other_provision');
    
    // Total Expenses
    forecastRow.total_expenses = num('actual_direct_cost') + num('total_below_gp_expenses');
    
    return forecastRow;
  };
  
  // Build monthly forecast data for BOTH years
  const buildForecastPLByMonth = (forecastByMonth, savedData, hasSaved, forceRecalc) => {
    const plByMonth = {};
    
    if (forceRecalc || !hasSaved) {
      // Calculate from forecast sales + budget %
      for (let m = 1; m <= 12; m++) {
        plByMonth[m] = calculateForecastPL(forecastByMonth, m);
      }
    } else {
      // Use saved data
      savedData.forEach(row => {
        const monthNum = MONTH_TO_NUMBER[row.month];
        if (monthNum) {
          row.morm = (parseFloat(row.sales) || 0) - (parseFloat(row.material) || 0);
          plByMonth[monthNum] = row;
        }
      });
      // Fill any missing months
      for (let m = 1; m <= 12; m++) {
        if (!plByMonth[m]) {
          plByMonth[m] = calculateForecastPL(forecastByMonth, m);
        }
      }
    }
    return plByMonth;
  };
  
  const forecastPLByMonth1 = buildForecastPLByMonth(forecastByMonth1, savedForecastPLData1, hasSavedForecastData1, forceRecalculate);
  const forecastPLByMonth2 = buildForecastPLByMonth(forecastByMonth2, savedForecastPLData2, hasSavedForecastData2, forceRecalculate);
  
  // Calculate year totals for all data types
  const calculateYearTotals = (byMonth) => {
    const totals = {};
    for (let m = 1; m <= 12; m++) {
      const monthData = byMonth[m] || {};
      PL_LINE_ITEMS.forEach(item => {
        if (!totals[item.key]) totals[item.key] = 0;
        const val = parseFloat(monthData[item.key]) || 0;
        if (!item.isPct) {
          totals[item.key] += val;
        }
      });
    }
    
    // Calculate derived fields from summed totals
    const num = (key) => parseFloat(totals[key]) || 0;
    
    // Actual Direct Cost
    totals.actual_direct_cost = num('labour') + num('depreciation') + num('electricity') + num('others_mfg_overheads');
    
    // Dir.Cost of goods sold
    totals.dir_cost_goods_sold = num('actual_direct_cost') + num('dir_cost_stock_adj');
    
    // Cost of Sales
    totals.cost_of_sales = num('material') + num('dir_cost_goods_sold');
    
    // Direct Cost as % of COGS
    totals.direct_cost_pct_of_cogs = totals.cost_of_sales > 0 
      ? (totals.dir_cost_goods_sold / totals.cost_of_sales) * 100 
      : 0;
    
    // Gross Profit
    totals.gross_profit = num('sales') - totals.cost_of_sales;
    totals.gross_profit_before_depn = totals.gross_profit + num('depreciation');
    
    // Finance costs
    totals.total_finance_cost = num('bank_interest') + num('bank_charges') + num('rd_preproduction');
    
    // Total Below GP Expenses  
    totals.total_below_gp_expenses = num('other_income') + num('bad_debts') + num('stock_provision_adj') + 
                                      totals.total_finance_cost + num('admin_mgmt_fee_total') + 
                                      num('transportation') + num('selling_expenses') + num('other_provision');
    
    // Net Profit
    totals.net_profit = totals.gross_profit - totals.total_below_gp_expenses;
    
    // EBIT
    totals.ebit = totals.net_profit + num('bank_interest');
    
    // EBITDA
    totals.ebitda = totals.net_profit + num('depreciation') + num('bank_interest') + num('rd_preproduction') + num('other_provision');
    
    // Total Expenses
    totals.total_expenses = totals.actual_direct_cost + totals.total_below_gp_expenses;
    
    return totals;
  };
  
  // Re-calculate actualYearTotals with derived fields
  const actualYearTotalsCalc = calculateYearTotals(actualByMonth);
  
  // Re-calculate budgetYearTotals with derived fields
  const budgetYearTotalsCalc = calculateYearTotals(budgetByMonth);
  
  const forecastYearTotals1 = calculateYearTotals(forecastPLByMonth1);
  const forecastYearTotals2 = calculateYearTotals(forecastPLByMonth2);
  
  // Calculate actual year % of sales
  const actualYearSales = actualYearTotalsCalc.sales || 0;
  const actualPctOfSales = {};
  PL_LINE_ITEMS.filter(item => item.source === 'pct_of_sales').forEach(item => {
    const actualYearValue = actualYearTotalsCalc[item.key] || 0;
    actualPctOfSales[item.key] = actualYearSales > 0 ? actualYearValue / actualYearSales : 0;
  });
  
  // Calculate forecast year % of sales for both years (for display)
  const calculateForecastPct = (totals) => {
    const pct = {};
    const sales = totals.sales || 0;
    PL_LINE_ITEMS.filter(item => item.source === 'pct_of_sales').forEach(item => {
      const value = totals[item.key] || 0;
      pct[item.key] = sales > 0 ? value / sales : 0;
    });
    return pct;
  };
  
  const forecastPctOfSales1 = calculateForecastPct(forecastYearTotals1);
  const forecastPctOfSales2 = calculateForecastPct(forecastYearTotals2);
  
  // Build response with BOTH forecast years
  successResponse(res, {
    division: division.toUpperCase(),
    actualYear,
    budgetYear,
    forecastYear1: fcstYear1,
    forecastYear2: fcstYear2,
    actualByMonth,
    actualYearTotals: actualYearTotalsCalc,
    actualPctOfSales,
    budgetByMonth,
    budgetYearTotals: budgetYearTotalsCalc,
    budgetPctOfSales,
    // Forecast Year 1 (Base+2)
    forecastByMonth1: forecastPLByMonth1,
    forecastYearTotals1,
    forecastPctOfSales1,
    forecastSalesTotals1,
    hasSavedForecastData1,
    savedMaterialVariancePct1,  // Material variance % from database
    // Forecast Year 2 (Base+3)
    forecastByMonth2: forecastPLByMonth2,
    forecastYearTotals2,
    forecastPctOfSales2,
    forecastSalesTotals2,
    hasSavedForecastData2,
    savedMaterialVariancePct2,  // Material variance % from database
    lineItems: PL_LINE_ITEMS
  });
}));

/**
 * POST /save-forecast-pl
 * Save Forecast P&L data to fp_pl_data table
 * 
 * @route POST /api/aebf/save-forecast-pl
 * @body {string} division - Division (FP)
 * @body {number} forecastYear - Forecast year
 * @body {object} monthlyData - P&L data for each month
 * @returns {object} 200 - Success message
 */
router.post('/save-forecast-pl', queryLimiter, asyncHandler(async (req, res) => {
  const { division, forecastYear, monthlyData, materialVariancePct } = req.body;
  
  if (!division || !forecastYear || !monthlyData) {
    return res.status(400).json({ success: false, error: 'Division, forecastYear, and monthlyData are required' });
  }
  
  // Material variance % (default to 0 if not provided)
  const variancePct = parseFloat(materialVariancePct) || 0;
  
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  logger.info(`Saving Forecast P&L for ${division} ${forecastYear}, materialVariancePct: ${variancePct}%`);
  
  const client = await divisionPool.connect();
  try {
    await client.query('BEGIN');
    
    // Delete existing Forecast P&L data for this year
    await client.query(`
      DELETE FROM ${tables.plData}
      WHERE year = $1 AND data_type = 'Forecast'
    `, [parseInt(forecastYear)]);
    
    // Insert new data for each month
    let insertedCount = 0;
    for (let month = 1; month <= 12; month++) {
      const monthData = monthlyData[month];
      if (!monthData) continue;
      
      const monthName = NUMBER_TO_MONTH[month];
      
      await client.query(`
        INSERT INTO ${tables.plData} (
          year, month, data_type, material_variance_pct,
          sales, material, sales_volume_kg,
          labour, depreciation, electricity, others_mfg_overheads,
          dir_cost_stock_adj, gross_profit,
          transportation, 
          bank_interest, bank_charges, rd_preproduction, stock_provision_adj,
          bad_debts, other_income, other_provision, net_profit, ebitda,
          selling_expenses_override, admin_mgmt_fee_override
        ) VALUES (
          $1, $2, 'Forecast', $3,
          $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12,
          $13,
          $14, $15, $16, $17,
          $18, $19, $20, $21, $22,
          $23, $24
        )
      `, [
        parseInt(forecastYear),
        monthName,
        variancePct,
        monthData.sales || 0,
        monthData.material || 0,
        monthData.sales_volume_kg || 0,
        monthData.labour || 0,
        monthData.depreciation || 0,
        monthData.electricity || 0,
        monthData.others_mfg_overheads || 0,
        monthData.dir_cost_stock_adj || 0,
        monthData.gross_profit || 0,
        monthData.transportation || 0,
        monthData.bank_interest || 0,
        monthData.bank_charges || 0,
        monthData.rd_preproduction || 0,
        monthData.stock_provision_adj || 0,
        monthData.bad_debts || 0,
        monthData.other_income || 0,
        monthData.other_provision || 0,
        monthData.net_profit || 0,
        monthData.ebitda || 0,
        monthData.selling_expenses || 0,
        monthData.admin_mgmt_fee_total || 0
      ]);
      
      insertedCount++;
    }
    
    await client.query('COMMIT');
    
    // Invalidate cache - use wildcard pattern to match all forecast-pl cache entries
    invalidateCache('aebf:*forecast-pl*');
    invalidateCache('aebf:*');
    
    logger.info(`Saved ${insertedCount} Forecast P&L records for ${division} ${forecastYear}`);
    
    successResponse(res, { 
      message: `Forecast P&L saved successfully (${insertedCount} months)`,
      insertedCount
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

/**
 * POST /export-forecast-pl-excel
 * Export Forecast Sales + P&L to Excel with two linked sheets
 * 
 * Sheet 1: Sales by Product Group (same format as Divisional Budget export)
 *          - Product Group Name row, then metrics (KGS, SALES, MORM, etc.)
 *          - Columns: Product Group Names | Year1 | Year2 | Year3 | Year4 (not months)
 * 
 * Sheet 2: P&L (same format as Budget P&L export)
 *          - Ledger rows with 3 sub-columns per year (Amount | % of Sls | /Kg)
 *          - Links to Sheet 1 for Sales & Material totals
 * 
 * @route POST /api/aebf/export-forecast-pl-excel
 */
router.post('/export-forecast-pl-excel', queryLimiter, asyncHandler(async (req, res) => {
  const ExcelJS = require('exceljs');
  const { division, baseYear, forecastYearTotals1, forecastYearTotals2, materialVariancePct1, materialVariancePct2, hasEdits } = req.body;
  
  if (!division || !baseYear) {
    return res.status(400).json({ success: false, error: 'Division and baseYear are required' });
  }
  
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  const budgetYear = parseInt(baseYear) + 1;
  const fcstYear1 = parseInt(baseYear) + 2;
  const fcstYear2 = parseInt(baseYear) + 3;
  const prevYear = parseInt(baseYear) - 1;
  
  // Log if frontend sent edited values
  if (hasEdits) {
    logger.info(`[Export Forecast P&L Excel] Division: ${division}, Base: ${baseYear}, WITH FRONTEND EDITS (MaterialVar1: ${materialVariancePct1}%, MaterialVar2: ${materialVariancePct2}%)`);
  } else {
    logger.info(`[Export Forecast P&L Excel] Division: ${division}, Base: ${baseYear}, Forecast: ${fcstYear1}-${fcstYear2}`);
  }
  
  // ========== FETCH ALL DATA ==========

  // 1. Get Product Group Sales data for all 5 years (same as forecast sales export)
  // Previous Year ACTUAL (baseYear - 1)
  const prevActualQuery = `
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
  const prevActualResult = await divisionPool.query(prevActualQuery, [division.toUpperCase(), prevYear]);
  const prevActualSalesData = {};
  prevActualResult.rows.forEach(row => {
    if (row.pgcombine) {
      prevActualSalesData[row.pgcombine] = {
        kgs: parseFloat(row.kgs) || 0,
        sales: parseFloat(row.sales) || 0,
        morm: parseFloat(row.morm) || 0
      };
    }
  });

  // Base Year ACTUAL
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
  const actualResult = await divisionPool.query(actualQuery, [division.toUpperCase(), parseInt(baseYear)]);
  const actualSalesData = {};
  actualResult.rows.forEach(row => {
    if (row.pgcombine) {
      actualSalesData[row.pgcombine] = {
        kgs: parseFloat(row.kgs) || 0,
        sales: parseFloat(row.sales) || 0,
        morm: parseFloat(row.morm) || 0
      };
    }
  });
  
  // Budget data
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
  const budgetResult = await divisionPool.query(budgetQuery, [division, budgetYear]);
  const budgetSalesData = {};
  budgetResult.rows.forEach(row => {
    if (row.pgcombine) {
      const sales = parseFloat(row.sales) || 0;
      let morm = parseFloat(row.morm) || 0;
      if (row.pgcombine.toUpperCase().trim() === 'SERVICES CHARGES' && morm === 0 && sales > 0) {
        morm = sales;
      }
      budgetSalesData[row.pgcombine] = {
        kgs: parseFloat(row.kgs) || 0,
        sales,
        morm
      };
    }
  });
  
  // Forecast data from projections table
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
  const forecastResult = await divisionPool.query(forecastQuery, [division.toUpperCase(), fcstYear1, fcstYear2]);
  const forecast1SalesData = {};
  const forecast2SalesData = {};
  forecastResult.rows.forEach(row => {
    const data = {
      kgs: parseFloat(row.kgs) || 0,
      sales: parseFloat(row.sales) || 0,
      morm: parseFloat(row.morm) || 0
    };
    if (parseInt(row.year) === fcstYear1) {
      forecast1SalesData[row.pgcombine] = data;
    } else {
      forecast2SalesData[row.pgcombine] = data;
    }
  });
  
  // 2. Get P&L data for Actual, Budget, and Forecast years
  const prevActualPLData = await plDataService.getPLData(division.toUpperCase(), { year: prevYear, dataType: 'Actual' });
  const actualPLData = await plDataService.getPLData(division.toUpperCase(), { year: parseInt(baseYear), dataType: 'Actual' });
  const budgetPLData = await plDataService.getPLData(division.toUpperCase(), { year: budgetYear, dataType: 'Budget' });
  let forecast1PLData = [];
  let forecast2PLData = [];
  
  try {
    forecast1PLData = await plDataService.getPLData(division.toUpperCase(), { year: fcstYear1, dataType: 'Forecast' });
  } catch (e) { /* No saved forecast */ }
  try {
    forecast2PLData = await plDataService.getPLData(division.toUpperCase(), { year: fcstYear2, dataType: 'Forecast' });
  } catch (e) { /* No saved forecast */ }
  
  // Calculate P&L year totals helper
  const sumPLData = (plData) => {
    const totals = {};
    plData.forEach(row => {
      PL_LINE_ITEMS.forEach(item => {
        if (!totals[item.key]) totals[item.key] = 0;
        const val = parseFloat(row[item.key]) || 0;
        if (!item.isPct) totals[item.key] += val;
      });
    });
    // Calculate MORM (Margin Over Raw Material) = Sales - Material
    // This field doesn't exist in the database - must be calculated
    totals.morm = (totals.sales || 0) - (totals.material || 0);
    return totals;
  };
  
  const prevActualPLTotals = sumPLData(prevActualPLData);
  const actualPLTotals = sumPLData(actualPLData);
  const budgetPLTotals = sumPLData(budgetPLData);
  
  // Calculate budget % of sales for forecast P&L items
  const budgetPLSales = budgetPLTotals.sales || 0;
  const budgetPctOfSales = {};
  PL_LINE_ITEMS.filter(item => item.source === 'pct_of_sales').forEach(item => {
    const val = budgetPLTotals[item.key] || 0;
    budgetPctOfSales[item.key] = budgetPLSales > 0 ? val / budgetPLSales : 0;
  });
  
  // Build forecast P&L totals (from saved data or calculate)
  const buildForecastPLTotals = (savedData, forecastSalesData) => {
    if (savedData && savedData.length > 0) {
      return sumPLData(savedData);
    }
    // Calculate from sales + budget %
    const totalSales = Object.values(forecastSalesData).reduce((s, d) => s + d.sales, 0);
    const totalMorm = Object.values(forecastSalesData).reduce((s, d) => s + d.morm, 0);
    const totalMaterial = totalSales - totalMorm;
    
    const totals = {
      sales: totalSales,
      material: totalMaterial,
      morm: totalMorm
    };
    
    // Apply budget % to forecast sales
    PL_LINE_ITEMS.filter(item => item.source === 'pct_of_sales').forEach(item => {
      totals[item.key] = totalSales * (budgetPctOfSales[item.key] || 0);
    });
    
    return totals;
  };
  
  // ALWAYS use frontend-provided values when available - ensures Excel matches screen exactly
  let forecast1PLTotals, forecast2PLTotals;
  
  if (forecastYearTotals1) {
    // Frontend sent values - use them directly to ensure Excel matches screen
    forecast1PLTotals = forecastYearTotals1;
    logger.info(`[Export] Using frontend-provided forecast year 1 totals`);
  } else {
    forecast1PLTotals = buildForecastPLTotals(forecast1PLData, forecast1SalesData);
    logger.info(`[Export] Calculated forecast year 1 totals (no frontend values provided)`);
  }
  
  if (forecastYearTotals2) {
    // Frontend sent values - use them directly to ensure Excel matches screen
    forecast2PLTotals = forecastYearTotals2;
    logger.info(`[Export] Using frontend-provided forecast year 2 totals`);
  } else {
    forecast2PLTotals = buildForecastPLTotals(forecast2PLData, forecast2SalesData);
    logger.info(`[Export] Calculated forecast year 2 totals (no frontend values provided)`);
  }
  
  // Combine all product groups, sort with Services Charges last, Others second-to-last
  const allPGs = new Set([
    ...Object.keys(prevActualSalesData),
    ...Object.keys(actualSalesData),
    ...Object.keys(budgetSalesData),
    ...Object.keys(forecast1SalesData),
    ...Object.keys(forecast2SalesData)
  ]);
  const allProductGroups = Array.from(allPGs).filter(pg => pg && pg.trim() !== '').sort((a, b) => {
    const pgA = (a || '').toUpperCase().trim();
    const pgB = (b || '').toUpperCase().trim();
    
    // Services Charges always last
    if (pgA === 'SERVICES CHARGES') return 1;
    if (pgB === 'SERVICES CHARGES') return -1;
    
    // "Other" or "Others" second to last (just before Services Charges)
    const isAOther = pgA === 'OTHER' || pgA === 'OTHERS';
    const isBOther = pgB === 'OTHER' || pgB === 'OTHERS';
    if (isAOther && !isBOther) return 1;
    if (isBOther && !isAOther) return -1;
    
    // Alphabetical for all others
    return a.localeCompare(b);
  });
  
  logger.info(`[Export] PGs: ${allProductGroups.length}, Years: ${prevYear}-${fcstYear2}`);
  
  // ========== CREATE WORKBOOK ==========
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IPD Budget System';
  workbook.created = new Date();
  
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
  
  // Colors - matching Divisional Budget export
  const headerBgColor = 'FF1677FF';
  const headerFontColor = 'FFFFFFFF';
  const productGroupBgColor = 'FF87CEEB';
  const kgsBgColor = 'FFE3F2FD';
  const salesBgColor = 'FFE8F5E9';
  const mormBgColor = 'FFFFF3E0';
  const priceBgColor = 'FFF3E5F5';
  const pctBgColor = 'FFFCE4EC';
  const totalBgColor = 'FFE6FFE6';
  const grandTotalBgColor = 'FF4CAF50';
  
  // ========== SHEET 1: SALES BY PRODUCT GROUP (Divisional Budget format) ==========
  // Layout: PG Name row, then 8 metric rows (KGS, SALES, MORM, SLS/KG, RM/KG, MORM/KG, MORM %, % of Sls)
  // Columns: Product Groups Names | Actual | Budget | Forecast1 | Forecast2 | Total
  
  const salesSheet = workbook.addWorksheet('Sales by Product Group', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }]
  });
  
  const years = [
    { year: prevYear, label: `${prevYear} Actual`, data: prevActualSalesData },
    { year: parseInt(baseYear), label: `${baseYear} Actual`, data: actualSalesData },
    { year: budgetYear, label: `${budgetYear} Budget`, data: budgetSalesData },
    { year: fcstYear1, label: `${fcstYear1} Fcst`, data: forecast1SalesData },
    { year: fcstYear2, label: `${fcstYear2} Fcst`, data: forecast2SalesData }
  ];
  
  const metrics = ['KGS', 'SALES', 'MORM', 'SLS/KG', 'RM/KG', 'MORM/KG', 'MORM %', '% of Sls'];
  const YEAR_COLS = years.length; // 4 years
  const LAST_COL = 1 + YEAR_COLS; // Last column (1=names, 2-5=years)
  
  // ========== ROW 1: TITLE ==========
  salesSheet.addRow([`${division.toUpperCase()} Actual & Forecast Sales - ${prevYear}-${fcstYear2} - by Product Group`]);
  salesSheet.mergeCells(1, 1, 1, LAST_COL);
  salesSheet.getRow(1).font = { bold: true, size: 14, color: { argb: headerFontColor } };
  salesSheet.getRow(1).height = 30;
  salesSheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 1; c <= LAST_COL; c++) {
    salesSheet.getCell(1, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBgColor } };
    applyBorder(salesSheet.getCell(1, c));
  }
  
  // ========== ROW 2: HEADER with period-specific colors ==========
  const headerRow = ['Product Groups Names'];
  years.forEach(y => headerRow.push(y.label));
  salesSheet.addRow(headerRow);
  
  // Year colors for Sales sheet - 5 colors for 5 years (same as P&L)
  const salesYearColors = ['FFD6EAF8', 'FFE3F2FD', 'FFDCEDC8', 'FFFFF3E0', 'FFFCD5B4']; // Light lavender, Light blue, light green, light yellow, light coral
  
  const row2 = salesSheet.getRow(2);
  row2.font = { bold: true };
  row2.height = 25;
  row2.alignment = { horizontal: 'center', vertical: 'middle' };
  // First column (Product Groups Names) - blue header
  row2.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBgColor } };
  row2.getCell(1).font = { bold: true, color: { argb: headerFontColor } };
  applyBorder(row2.getCell(1));
  // Year columns - period-specific colors
  for (let c = 2; c <= LAST_COL; c++) {
    const yearIdx = c - 2;
    row2.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: salesYearColors[yearIdx % salesYearColors.length] } };
    row2.getCell(c).font = { bold: true };
    applyBorder(row2.getCell(c));
  }
  
  // Set column widths
  salesSheet.getColumn(1).width = 28;
  for (let c = 2; c <= LAST_COL; c++) {
    salesSheet.getColumn(c).width = 14;
  }
  
  // ========== DATA ROWS: Each product group with metrics ==========
  let currentRow = 3;
  
  // Track row numbers for grand total formulas
  const kgsRows = [];
  const salesRows = [];
  const mormRows = [];
  
  allProductGroups.forEach((pg) => {
    // Product Group Name Row
    const pgRow = salesSheet.addRow([pg]);
    pgRow.getCell(1).font = { bold: true };
    pgRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: productGroupBgColor } };
    salesSheet.mergeCells(currentRow, 1, currentRow, LAST_COL);
    for (let c = 1; c <= LAST_COL; c++) applyBorder(pgRow.getCell(c));
    currentRow++;
    
    // Track row numbers for this product group
    const rowRefs = {};
    
    // Add metric rows
    metrics.forEach((metric) => {
      const dataRow = salesSheet.addRow([metric]);
      rowRefs[metric] = currentRow;
      
      // Track rows for grand totals
      if (metric === 'KGS') kgsRows.push(currentRow);
      if (metric === 'SALES') salesRows.push(currentRow);
      if (metric === 'MORM') mormRows.push(currentRow);
      
      // Add year columns
      for (let yIdx = 0; yIdx < YEAR_COLS; yIdx++) {
        const col = 2 + yIdx;
        const colL = colLetter(col);
        const y = years[yIdx];
        const data = y.data[pg] || { kgs: 0, sales: 0, morm: 0 };
        
        // Unified color by year (period) - 5 colors for 5 years
        const metricYearColors = ['FFD6EAF8', 'FFE3F2FD', 'FFDCEDC8', 'FFFFF3E0', 'FFFCD5B4']; // Light lavender, Light blue, light green, light yellow, light coral
        const yearBgColor = metricYearColors[yIdx % metricYearColors.length];
        
        switch (metric) {
          case 'KGS':
            dataRow.getCell(col).value = data.kgs;
            dataRow.getCell(col).numFmt = '#,##0';
            dataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
            break;
            
          case 'SALES':
            dataRow.getCell(col).value = data.sales;
            dataRow.getCell(col).numFmt = '#,##0';
            dataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
            break;
            
          case 'MORM':
            dataRow.getCell(col).value = data.morm;
            dataRow.getCell(col).numFmt = '#,##0';
            dataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
            break;
            
          case 'SLS/KG':
            // SLS/KG = SALES / KGS
            dataRow.getCell(col).value = { formula: `IF(${colL}${rowRefs['KGS']}=0,0,${colL}${rowRefs['SALES']}/${colL}${rowRefs['KGS']})` };
            dataRow.getCell(col).numFmt = '#,##0.00';
            dataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
            break;
            
          case 'RM/KG':
            // RM/KG = (SALES - MORM) / KGS
            dataRow.getCell(col).value = { formula: `IF(${colL}${rowRefs['KGS']}=0,0,(${colL}${rowRefs['SALES']}-${colL}${rowRefs['MORM']})/${colL}${rowRefs['KGS']})` };
            dataRow.getCell(col).numFmt = '#,##0.00';
            dataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
            break;
            
          case 'MORM/KG':
            // MORM/KG = MORM / KGS
            dataRow.getCell(col).value = { formula: `IF(${colL}${rowRefs['KGS']}=0,0,${colL}${rowRefs['MORM']}/${colL}${rowRefs['KGS']})` };
            dataRow.getCell(col).numFmt = '#,##0.00';
            dataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
            break;
            
          case 'MORM %':
            // MORM % = MORM / SALES
            dataRow.getCell(col).value = { formula: `IF(${colL}${rowRefs['SALES']}=0,0,${colL}${rowRefs['MORM']}/${colL}${rowRefs['SALES']})` };
            dataRow.getCell(col).numFmt = '0.00%';
            dataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
            break;
            
          case '% of Sls':
            // % of Sls = This PG SALES / Total SALES (will be updated after grand total row)
            dataRow.getCell(col).value = 0; // Placeholder
            dataRow.getCell(col).numFmt = '0.00%';
            dataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
            break;
        }
        
        applyBorder(dataRow.getCell(col));
      }
      
      currentRow++;
    });
  });
  
  // ========== GRAND TOTAL ROWS (one row per metric) ==========
  const grandTotalStartRow = currentRow;
  const gtLabelRow = salesSheet.addRow(['Grand Total']);
  gtLabelRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: grandTotalBgColor } };
  gtLabelRow.getCell(1).font = { bold: true, color: { argb: headerFontColor } };
  salesSheet.mergeCells(currentRow, 1, currentRow, LAST_COL);
  for (let c = 1; c <= LAST_COL; c++) applyBorder(gtLabelRow.getCell(c));
  currentRow++;
  
  // Helper to build SUM formula for non-contiguous rows
  const buildSumFormula = (rows, col) => {
    if (rows.length === 0) return '0';
    return rows.map(r => `${colLetter(col)}${r}`).join('+');
  };
  
  // Track grand total row numbers for P&L sheet linking
  const gtRowRefs = {};
  
  // Unified colors by period (year) for grand totals - 5 years
  const yearColors = ['FFD6EAF8', 'FFE3F2FD', 'FFDCEDC8', 'FFFFF3E0', 'FFFCD5B4']; // Light lavender, Light blue, light green, light yellow, light coral
  
  // Add grand total metric rows
  metrics.forEach((metric) => {
    const gtDataRow = salesSheet.addRow([metric]);
    gtDataRow.getCell(1).font = { bold: true }; // Make metric label bold
    gtRowRefs[metric] = currentRow;
    
    // Add year columns
    for (let yIdx = 0; yIdx < YEAR_COLS; yIdx++) {
      const col = 2 + yIdx;
      const colL = colLetter(col);
      const yearBgColor = yearColors[yIdx % yearColors.length];
      
      switch (metric) {
        case 'KGS':
          gtDataRow.getCell(col).value = { formula: buildSumFormula(kgsRows, col) };
          gtDataRow.getCell(col).numFmt = '#,##0';
          gtDataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
          break;
          
        case 'SALES':
          gtDataRow.getCell(col).value = { formula: buildSumFormula(salesRows, col) };
          gtDataRow.getCell(col).numFmt = '#,##0';
          gtDataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
          break;
          
        case 'MORM':
          gtDataRow.getCell(col).value = { formula: buildSumFormula(mormRows, col) };
          gtDataRow.getCell(col).numFmt = '#,##0';
          gtDataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
          break;
          
        case 'SLS/KG':
          // Total SLS/KG = Total SALES / Total KGS
          gtDataRow.getCell(col).value = { formula: `IF(${colL}${gtRowRefs['KGS']}=0,0,${colL}${gtRowRefs['SALES']}/${colL}${gtRowRefs['KGS']})` };
          gtDataRow.getCell(col).numFmt = '#,##0.00';
          gtDataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
          break;
          
        case 'RM/KG':
          // Total RM/KG = (Total SALES - Total MORM) / Total KGS
          gtDataRow.getCell(col).value = { formula: `IF(${colL}${gtRowRefs['KGS']}=0,0,(${colL}${gtRowRefs['SALES']}-${colL}${gtRowRefs['MORM']})/${colL}${gtRowRefs['KGS']})` };
          gtDataRow.getCell(col).numFmt = '#,##0.00';
          gtDataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
          break;
          
        case 'MORM/KG':
          // Total MORM/KG = Total MORM / Total KGS
          gtDataRow.getCell(col).value = { formula: `IF(${colL}${gtRowRefs['KGS']}=0,0,${colL}${gtRowRefs['MORM']}/${colL}${gtRowRefs['KGS']})` };
          gtDataRow.getCell(col).numFmt = '#,##0.00';
          gtDataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
          break;
          
        case 'MORM %':
          // Total MORM % = Total MORM / Total SALES
          gtDataRow.getCell(col).value = { formula: `IF(${colL}${gtRowRefs['SALES']}=0,0,${colL}${gtRowRefs['MORM']}/${colL}${gtRowRefs['SALES']})` };
          gtDataRow.getCell(col).numFmt = '0.00%';
          gtDataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
          break;
          
        case '% of Sls':
          // Total % of Sls = 100%
          gtDataRow.getCell(col).value = 1;
          gtDataRow.getCell(col).numFmt = '0.00%';
          gtDataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
          break;
      }
      
      gtDataRow.getCell(col).font = { bold: true };
      applyBorder(gtDataRow.getCell(col));
    }
    
    currentRow++;
  });
  
  // Now update % of Sls formulas for each PG
  // Loop through all SALES rows and find corresponding % of Sls row (6 rows below)
  salesRows.forEach(salesRow => {
    const pctSlsRow = salesRow + 6; // % of Sls is 6 rows after SALES (SALES, MORM, SLS/KG, RM/KG, MORM/KG, MORM %, % of Sls)
    for (let yIdx = 0; yIdx < YEAR_COLS; yIdx++) {
      const col = 2 + yIdx;
      const colL = colLetter(col);
      const pctCell = salesSheet.getCell(pctSlsRow, col);
      pctCell.value = { formula: `IF(${colL}${gtRowRefs['SALES']}=0,0,${colL}${salesRow}/${colL}${gtRowRefs['SALES']})` };
    }
  });
  
  // ========== SHEET 2: P&L (Budget P&L format) ==========
  // Layout: Ledger | Year1 (Amount | % of Sls | /Kg) | Year2 ... | Total (Amount | % of Sls | /Kg)
  
  const plSheet = workbook.addWorksheet('P&L', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }]
  });
  
  // P&L line items
  const plItems = PL_LINE_ITEMS.filter(item => !item.isHelper && !item.isHidden);
  
  // Yearly P&L data (defined early for PL_LAST_COL calculation)
  const plYears = [
    { year: prevYear, label: `${prevYear} Actual`, data: prevActualPLTotals },
    { year: parseInt(baseYear), label: `${baseYear} Actual`, data: actualPLTotals },
    { year: budgetYear, label: `${budgetYear} Budget`, data: budgetPLTotals },
    { year: fcstYear1, label: `${fcstYear1} Fcst`, data: forecast1PLTotals },
    { year: fcstYear2, label: `${fcstYear2} Fcst`, data: forecast2PLTotals }
  ];
  
  // Column index helper: each year has 3 columns (Amount, % of Sls, /Kg)
  const getColIdx = (yIdx, subCol) => {
    const yearBase = 2 + yIdx * 3;
    const subOffset = subCol === 'amount' ? 0 : (subCol === 'pct' ? 1 : 2);
    return yearBase + subOffset;
  };
  
  // Last column (no more Total columns)
  const PL_LAST_COL = 1 + (plYears.length * 3); // Ledger + 5 years × 3 cols = 16
  
  // Row mapping
  const plRowMap = {};
  plItems.forEach((item, idx) => {
    plRowMap[item.key] = 4 + idx;
  });
  
  // Calculated item keys
  const CALCULATED_ITEMS = ['cost_of_sales', 'actual_direct_cost', 'dir_cost_goods_sold', 'direct_cost_pct_of_cogs',
    'gross_profit', 'gross_profit_before_depn', 'total_below_gp_expenses', 'total_expenses', 'net_profit', 'ebit', 'ebitda'];
  
  // Items that are % of Sales items
  const PCT_OF_SALES_ITEMS = ['morm', 'labour', 'depreciation', 'electricity', 'others_mfg_overheads',
    'selling_expenses', 'transportation', 'admin_mgmt_fee_total', 'bank_interest', 'bank_charges',
    'rd_preproduction', 'stock_provision_adj', 'bad_debts', 'other_income', 'other_provision'];
  
  // FORMULA BUILDER - Creates Excel formulas for calculated items
  const getCalculatedFormula = (itemKey, amtColLetter) => {
    const ref = (key) => `${amtColLetter}${plRowMap[key]}`;
    
    switch (itemKey) {
      case 'cost_of_sales':
        return `${ref('material')}+${ref('dir_cost_goods_sold')}`;
      case 'actual_direct_cost':
        return `${ref('labour')}+${ref('depreciation')}+${ref('electricity')}+${ref('others_mfg_overheads')}`;
      case 'dir_cost_goods_sold':
        return `${ref('actual_direct_cost')}+${ref('dir_cost_stock_adj')}`;
      case 'direct_cost_pct_of_cogs':
        return `IF(${ref('cost_of_sales')}=0,0,${ref('dir_cost_goods_sold')}/${ref('cost_of_sales')})`;
      case 'gross_profit':
        return `${ref('sales')}-${ref('cost_of_sales')}`;
      case 'gross_profit_before_depn':
        return `${ref('gross_profit')}+${ref('depreciation')}`;
      case 'total_below_gp_expenses':
        return `${ref('selling_expenses')}+${ref('transportation')}+${ref('admin_mgmt_fee_total')}+${ref('bank_interest')}+${ref('bank_charges')}+${ref('rd_preproduction')}+${ref('stock_provision_adj')}+${ref('bad_debts')}+${ref('other_income')}+${ref('other_provision')}`;
      case 'total_expenses':
        return `${ref('actual_direct_cost')}+${ref('total_below_gp_expenses')}`;
      case 'net_profit':
        return `${ref('gross_profit')}-${ref('total_below_gp_expenses')}`;
      case 'ebit':
        return `${ref('net_profit')}+${ref('bank_interest')}`;
      case 'ebitda':
        return `${ref('net_profit')}+${ref('depreciation')}+${ref('bank_interest')}+${ref('rd_preproduction')}+${ref('other_provision')}`;
      default:
        return null;
    }
  };
  
  // Border styles
  const mediumBorder = { style: 'medium', color: { argb: 'FF000000' } };
  const thinBorder = { style: 'thin', color: { argb: 'FF000000' } };
  const dottedBorder = { style: 'dotted', color: { argb: 'FF888888' } };
  
  // Header border - thick outer border
  const headerBorder = { top: mediumBorder, left: mediumBorder, bottom: mediumBorder, right: mediumBorder };
  // Data border - dotted lines for cleaner look
  const dataBorder = { top: dottedBorder, left: dottedBorder, bottom: dottedBorder, right: dottedBorder };
  
  // Year colors for P&L sheet - 5 colors for 5 years (define early for headers)
  const plYearColors = ['FFD6EAF8', 'FFE3F2FD', 'FFDCEDC8', 'FFFFF3E0', 'FFFCD5B4']; // Light lavender, Light blue, light green, light yellow, light coral
  
  // ROW 1: Title - includes all years and says 'Actual & Forecast'
  const plTitleRow = plSheet.addRow([`${division.toUpperCase()} Actual & Forecast P&L - ${prevYear}-${fcstYear2} (AED)`]);
  for (let c = 1; c <= PL_LAST_COL; c++) {
    plTitleRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    // Top and sides thick, bottom thin (internal)
    plTitleRow.getCell(c).border = { 
      top: mediumBorder, 
      left: c === 1 ? mediumBorder : thinBorder, 
      bottom: thinBorder, 
      right: c === PL_LAST_COL ? mediumBorder : thinBorder 
    };
  }
  plSheet.mergeCells(1, 1, 1, PL_LAST_COL);
  plSheet.getRow(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  plSheet.getRow(1).height = 30;
  plSheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
  
  // ROW 2: Year names header with period-specific colors
  const plYearHeaderRow = plSheet.addRow([]);
  plYearHeaderRow.getCell(1).value = 'Ledgers';
  plYearHeaderRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  plYearHeaderRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  plYearHeaderRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  plYearHeaderRow.getCell(1).border = { top: thinBorder, left: mediumBorder, bottom: thinBorder, right: thinBorder };
  
  let plColIdx = 2;
  for (let yIdx = 0; yIdx < plYears.length; yIdx++) {
    const yearBgColor = plYearColors[yIdx % plYearColors.length];
    const isLastYear = yIdx === plYears.length - 1;
    plYearHeaderRow.getCell(plColIdx).value = plYears[yIdx].label;
    plYearHeaderRow.getCell(plColIdx).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
    plYearHeaderRow.getCell(plColIdx).font = { bold: true };
    plYearHeaderRow.getCell(plColIdx).alignment = { horizontal: 'center' };
    plYearHeaderRow.getCell(plColIdx).border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
    plYearHeaderRow.getCell(plColIdx + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
    plYearHeaderRow.getCell(plColIdx + 1).border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
    plYearHeaderRow.getCell(plColIdx + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
    plYearHeaderRow.getCell(plColIdx + 2).border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: isLastYear ? mediumBorder : thinBorder };
    plSheet.mergeCells(2, plColIdx, 2, plColIdx + 2);
    plColIdx += 3;
  }
  
  plYearHeaderRow.height = 24;
  
  // ROW 3: Sub-headers (Amount, % of Sls, Per Kg) - match year period colors - BOTTOM of header section with thick border
  const plSubHeaderRow = plSheet.addRow([]);
  plSubHeaderRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  plSubHeaderRow.getCell(1).border = { top: thinBorder, left: mediumBorder, bottom: mediumBorder, right: thinBorder };
  plSheet.mergeCells(2, 1, 3, 1);
  
  plColIdx = 2;
  for (let yIdx = 0; yIdx < plYears.length; yIdx++) {
    const yearBgColor = plYearColors[yIdx % plYearColors.length];
    const isLastYear = yIdx === plYears.length - 1;
    // Amount
    plSubHeaderRow.getCell(plColIdx).value = 'Amount';
    plSubHeaderRow.getCell(plColIdx).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
    plSubHeaderRow.getCell(plColIdx).font = { bold: true, size: 9 };
    plSubHeaderRow.getCell(plColIdx).alignment = { horizontal: 'center' };
    plSubHeaderRow.getCell(plColIdx).border = { top: thinBorder, left: thinBorder, bottom: mediumBorder, right: thinBorder };
    plColIdx++;
    // % of Sls
    plSubHeaderRow.getCell(plColIdx).value = '% of Sls';
    plSubHeaderRow.getCell(plColIdx).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
    plSubHeaderRow.getCell(plColIdx).font = { bold: true, size: 9 };
    plSubHeaderRow.getCell(plColIdx).alignment = { horizontal: 'center' };
    plSubHeaderRow.getCell(plColIdx).border = { top: thinBorder, left: thinBorder, bottom: mediumBorder, right: thinBorder };
    plColIdx++;
    // Per Kg
    plSubHeaderRow.getCell(plColIdx).value = 'Per Kg';
    plSubHeaderRow.getCell(plColIdx).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
    plSubHeaderRow.getCell(plColIdx).font = { bold: true, size: 9 };
    plSubHeaderRow.getCell(plColIdx).alignment = { horizontal: 'center' };
    plSubHeaderRow.getCell(plColIdx).border = { top: thinBorder, left: thinBorder, bottom: mediumBorder, right: isLastYear ? mediumBorder : thinBorder };
    plColIdx++;
  }
  
  plSubHeaderRow.height = 22;
  
  // Set column widths
  plSheet.getColumn(1).width = 38;
  for (let c = 2; c <= PL_LAST_COL; c++) {
    plSheet.getColumn(c).width = 11;
  }
  
  // DATA ROWS - one row per ledger item
  plItems.forEach((item) => {
    const plDataRow = plSheet.addRow([]);
    const rowNum = plRowMap[item.key];
    
    // Bold items list (from user's screenshot)
    const boldItems = ['sales', 'cost_of_sales', 'morm', 'dir_cost_goods_sold', 'gross_profit', 
                       'total_below_gp_expenses', 'total_expenses', 'net_profit', 'ebit', 'ebitda'];
    const isBold = boldItems.includes(item.key);
    
    const isCalculated = CALCULATED_ITEMS.includes(item.key);
    const isPctOfSalesItem = PCT_OF_SALES_ITEMS.includes(item.key);
    const isPctItem = item.key === 'direct_cost_pct_of_cogs';
    const isVolumeItem = item.key.includes('volume');
    const salesRow = plRowMap.sales;
    const kgRow = plRowMap.sales_volume_kg;
    const cogsRow = plRowMap.cost_of_sales;
    
    // Column A: Ledger label - left edge has medium border
    plDataRow.getCell(1).value = item.label;
    plDataRow.getCell(1).font = { bold: isBold };
    plDataRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    plDataRow.getCell(1).border = { top: dottedBorder, left: mediumBorder, bottom: dottedBorder, right: dottedBorder };
    
    // For each year
    for (let yIdx = 0; yIdx < plYears.length; yIdx++) {
      const y = plYears[yIdx];
      const amtCol = getColIdx(yIdx, 'amount');
      const pctCol = getColIdx(yIdx, 'pct');
      const kgCol = getColIdx(yIdx, 'kg');
      const amtLetter = colLetter(amtCol);
      const pctLetter = colLetter(pctCol);
      const salesAmtRef = `${colLetter(getColIdx(yIdx, 'amount'))}${salesRow}`;
      const kgAmtRef = `${colLetter(getColIdx(yIdx, 'amount'))}${kgRow}`;
      const cogsRef = `${amtLetter}${cogsRow}`;
      const amtRef = `${amtLetter}${rowNum}`;
      
      // Unified background color for this year
      const yearBgColor = plYearColors[yIdx % plYearColors.length];
      const isLastYear = yIdx === plYears.length - 1;
      
      // ====== AMOUNT COLUMN ======
      // For Actual and Budget years, use database values; for Forecast only, use formulas linking to PG sheet
      const isActualYear = y.label.includes('Actual');
      const isBudgetYear = y.label.includes('Budget');
      const isForecastYear = y.label.includes('Fcst');
      
      if (item.key === 'sales') {
        if (isForecastYear) {
          // Forecast: Link to Sales sheet - SALES row from grand total
          plDataRow.getCell(amtCol).value = { formula: `'Sales by Product Group'!${colLetter(2 + yIdx)}${gtRowRefs['SALES']}` };
        } else {
          // Actual/Budget: use database value
          plDataRow.getCell(amtCol).value = Math.round(y.data[item.key] || 0);
        }
      } else if (item.key === 'morm') {
        if (isForecastYear) {
          // Forecast: Use frontend value directly (includes variance adjustment)
          // Don't use formula - Product Group sheet doesn't have variance applied
          plDataRow.getCell(amtCol).value = Math.round(y.data['morm'] || 0);
        } else {
          // Actual/Budget: use database value
          plDataRow.getCell(amtCol).value = Math.round(y.data[item.key] || 0);
        }
      } else if (item.key === 'material') {
        if (isForecastYear) {
          // Forecast: Use frontend value directly (includes variance adjustment)
          // Don't use formula - Product Group sheet doesn't have variance applied
          plDataRow.getCell(amtCol).value = Math.round(y.data['material'] || 0);
        } else {
          // Actual/Budget: use database value for material
          plDataRow.getCell(amtCol).value = Math.round(y.data['material'] || 0);
        }
      } else if (isCalculated) {
        if (isForecastYear) {
          // Forecast: Calculated items use formula
          const formula = getCalculatedFormula(item.key, amtLetter);
          if (formula) {
            plDataRow.getCell(amtCol).value = { formula };
          } else {
            plDataRow.getCell(amtCol).value = Math.round(y.data[item.key] || 0);
          }
        } else {
          // Actual/Budget: use database value, not formula
          plDataRow.getCell(amtCol).value = Math.round(y.data[item.key] || 0);
        }
      } else if (item.key === 'dir_cost_stock_adj') {
        // Dir.Cost in Stock/Stock Adj. - use actual data for Actual/Budget years, 0 for Forecast
        plDataRow.getCell(amtCol).value = isForecastYear ? 0 : Math.round(y.data[item.key] || 0);
      } else {
        // Regular value items (sales_volume_kg, pct of sales items)
        plDataRow.getCell(amtCol).value = Math.round(y.data[item.key] || 0);
      }
      
      plDataRow.getCell(amtCol).numFmt = isPctItem ? '0.00%' : '#,##0';
      plDataRow.getCell(amtCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
      plDataRow.getCell(amtCol).alignment = { horizontal: 'right' };
      plDataRow.getCell(amtCol).border = dataBorder;
      if (isBold) plDataRow.getCell(amtCol).font = { bold: true };
      
      // ====== % OF SALES COLUMN ======
      if (item.key === 'sales') {
        plDataRow.getCell(pctCol).value = 1;
      } else if (isPctItem) {
        plDataRow.getCell(pctCol).value = '—';
      } else {
        plDataRow.getCell(pctCol).value = { formula: `IF(${salesAmtRef}=0,0,${amtRef}/${salesAmtRef})` };
      }
      plDataRow.getCell(pctCol).numFmt = '0.00%';
      plDataRow.getCell(pctCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
      plDataRow.getCell(pctCol).alignment = { horizontal: 'center' };
      plDataRow.getCell(pctCol).border = dataBorder;
      if (isBold) plDataRow.getCell(pctCol).font = { bold: true };
      
      // ====== /KG COLUMN ======
      if (isVolumeItem || isPctItem) {
        plDataRow.getCell(kgCol).value = '—';
      } else {
        plDataRow.getCell(kgCol).value = { formula: `IF(${kgAmtRef}=0,0,${amtRef}/${kgAmtRef})` };
      }
      plDataRow.getCell(kgCol).numFmt = '0.00';
      plDataRow.getCell(kgCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yearBgColor } };
      plDataRow.getCell(kgCol).alignment = { horizontal: 'center' };
      // Last column gets medium right border
      plDataRow.getCell(kgCol).border = isLastYear 
        ? { top: dottedBorder, left: dottedBorder, bottom: dottedBorder, right: mediumBorder }
        : dataBorder;
      if (isBold) plDataRow.getCell(kgCol).font = { bold: true };
    }
  });
  
  // Generate filename
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '');
  const filename = `FORECAST_PL_${division.toUpperCase()}_${prevYear}-${fcstYear2}_${dateStr}_${timeStr}.xlsx`;
  
  // Set response headers
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  
  // Write to response
  await workbook.xlsx.write(res);
  
  logger.info(`[Export] Forecast P&L Excel generated: ${filename}`);
}));

module.exports = router;
