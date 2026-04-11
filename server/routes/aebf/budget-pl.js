/**
 * @fileoverview AEBF Budget P&L Routes
 * @module routes/aebf/budget-pl
 * @description Handles Budget P&L simulation based on divisional product group budget
 * 
 * The Budget P&L simulates financial P&L figures using:
 * - Sales, Sales Volume, MoRM from divisional budget
 * - Material = Sales - MoRM
 * - All other P&L lines = Apply actual % of sales to budget sales
 * 
 * @requires express
 * @requires ../services/plDataService For P&L actual data
 * 
 * @routes
 * - POST /budget-pl-data - Get Budget P&L simulation data
 * - GET  /budget-pl-years/:division - Get available budget years
 * - POST /export-budget-pl-html - Export Budget P&L as HTML
 * - POST /import-budget-pl-html - Import Budget P&L from HTML
 * - POST /save-budget-pl - Save Budget P&L to database
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
 * Only these ledgers are shown in the Budget P&L simulation
 */
const PL_LINE_ITEMS = [
  // Sales Section
  { key: 'sales', label: 'Sales', source: 'budget', budgetMetric: 'AMOUNT', isInput: true },
  { key: 'sales_volume_kg', label: 'Sales volume (kg)', source: 'budget', budgetMetric: 'KGS', isInput: true },
  { key: 'production_volume_kg', label: 'Production volume (kg)', source: 'actual_only', isInput: true, isHidden: true },
  
  // Cost Section
  { key: 'cost_of_sales', label: 'Cost of Sales', source: 'calculated', formula: 'material + dir_cost_goods_sold' },
  { key: 'material', label: 'Material', source: 'calculated', formula: 'sales - morm', isInput: true },
  { key: 'morm', label: 'Margin over Material', source: 'budget', budgetMetric: 'MORM', isInput: true },
  
  // Direct Costs Section
  { key: 'labour', label: 'Labour', source: 'pct_of_sales', isInput: true },
  { key: 'depreciation', label: 'Depreciation', source: 'pct_of_sales', isInput: true },
  { key: 'electricity', label: 'Electricity', source: 'pct_of_sales', isInput: true },
  { key: 'others_mfg_overheads', label: 'Others Mfg. overheads', source: 'pct_of_sales', isInput: true },
  { key: 'actual_direct_cost', label: 'Actual Direct Cost Spent', source: 'calculated', formula: 'labour + depreciation + electricity + others_mfg_overheads' },
  { key: 'dir_cost_stock_adj', label: 'Dir.Cost in Stock/Stock Adj.', source: 'zero_in_budget', isInput: false },  // Always 0 in budget - its % becomes Material Variance default
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
  { key: 'total_below_gp_expenses', label: 'Total Below GP Expenses', source: 'calculated', formula: 'other_income + bad_debts + stock_provision_adj + total_finance_cost + admin_mgmt_fee_total + transportation + selling_expenses + other_provision' },
  
  // Total Expenses
  { key: 'total_expenses', label: 'Total Expenses', source: 'calculated', formula: 'actual_direct_cost + total_below_gp_expenses' },
  
  // Net Profit Section
  { key: 'net_profit', label: 'Net Profit', source: 'calculated', formula: 'gross_profit - total_below_gp_expenses' },
  { key: 'ebit', label: 'EBIT', subtitle: 'Profit from operations', source: 'calculated', formula: 'net_profit + bank_interest' },
  { key: 'ebitda', label: 'EBITDA', subtitle: 'Cash profit', source: 'calculated', formula: 'net_profit + depreciation + bank_interest + rd_preproduction + other_provision' }
];

/**
 * GET /budget-pl-years/:division
 * Get available budget years from budget_unified table
 * 
 * @route GET /api/aebf/budget-pl-years/:division
 * @param {string} division - Division (FP)
 * @returns {object} 200 - List of available budget years
 */
router.get('/budget-pl-years/:division', queryLimiter, asyncHandler(async (req, res) => {
  const { division } = req.params;
  
  if (!division || !(await isValidDivision(division))) {
    const validDivisions = await getValidDivisions();
    return res.status(400).json({ success: false, error: `Valid division (${validDivisions.join(' or ')}) is required` });
  }
  
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  // Get distinct budget years from budget_unified table (product group budget data)
  const query = `
    SELECT DISTINCT budget_year
    FROM ${tables.budgetUnified}
    WHERE UPPER(division_code) = UPPER($1)
    ORDER BY budget_year DESC
  `;
  
  const result = await divisionPool.query(query, [division]);
  const years = result.rows.map(r => r.budget_year);
  
  successResponse(res, { years });
}));

/**
 * POST /budget-pl-data
 * Get Budget P&L simulation data
 * Combines actual P&L data with simulated budget from divisional budget
 * 
 * @route POST /api/aebf/budget-pl-data
 * @body {string} division - Division (FP)
 * @body {number} budgetYear - Budget year to simulate
 * @returns {object} 200 - P&L data with actual and budget rows for each line item
 */
router.post('/budget-pl-data', queryLimiter, cacheMiddleware({ ttl: CacheTTL.MEDIUM }), asyncHandler(async (req, res) => {
  const { division, budgetYear } = req.body;
  
  if (!division || !budgetYear) {
    return res.status(400).json({ success: false, error: 'Division and budgetYear are required' });
  }
  
  const actualYear = parseInt(budgetYear) - 1;
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  logger.info(`Fetching Budget P&L data for ${division}, budget year ${budgetYear}, actual year ${actualYear}`);
  
  // 1. Get actual P&L data from pl_data table (with calculated fields)
  let actualPLData;
  try {
    actualPLData = await plDataService.getPLData(division.toUpperCase(), { 
      year: actualYear, 
      dataType: 'Actual' 
    });
  } catch (error) {
    logger.warn(`No actual P&L data for ${division} ${actualYear}:`, error.message);
    actualPLData = [];
  }
  
  // Organize actual data by month
  const actualByMonth = {};
  const actualYearTotals = {};
  
  actualPLData.forEach(row => {
    const monthNum = MONTH_TO_NUMBER[row.month];
    if (monthNum) {
      // Calculate MoRM (Margin over Material) = Sales - Material
      row.morm = (parseFloat(row.sales) || 0) - (parseFloat(row.material) || 0);
      
      actualByMonth[monthNum] = row;
      
      // Accumulate year totals
      PL_LINE_ITEMS.forEach(item => {
        if (!actualYearTotals[item.key]) actualYearTotals[item.key] = 0;
        const val = parseFloat(row[item.key]) || 0;
        if (!item.isPct && !item.isPerKg) {
          actualYearTotals[item.key] += val;
        }
      });
    }
  });
  
  // Calculate actual year total sales for % calculation
  const actualYearSales = actualYearTotals['sales'] || 0;
  
  // 2. Get budget data aggregated by month from budget_unified (product group totals)
  // IMPORTANT: Only use DIVISIONAL budget type - not SALES_REP (which would double-count)
  const budgetQuery = `
    SELECT 
      month_no,
      SUM(COALESCE(qty_kgs::numeric, 0)) as total_kgs,
      SUM(COALESCE(amount::numeric, 0)) as total_sales,
      SUM(COALESCE(morm::numeric, 0)) as total_morm
    FROM ${tables.budgetUnified}
    WHERE UPPER(division_code) = UPPER($1)
      AND budget_year = $2
      AND budget_type = 'DIVISIONAL'
    GROUP BY month_no
    ORDER BY month_no
  `;
  
  const budgetResult = await divisionPool.query(budgetQuery, [division, parseInt(budgetYear)]);
  
  // Organize budget data by month
  const budgetByMonth = {};
  for (let m = 1; m <= 12; m++) {
    budgetByMonth[m] = { sales: 0, sales_volume_kg: 0, morm: 0 };
  }
  
  budgetResult.rows.forEach(row => {
    const month = parseInt(row.month_no);
    if (month >= 1 && month <= 12) {
      budgetByMonth[month] = {
        sales: parseFloat(row.total_sales) || 0,
        sales_volume_kg: parseFloat(row.total_kgs) || 0,
        morm: parseFloat(row.total_morm) || 0
      };
    }
  });
  
  // Calculate budget year totals
  const budgetYearTotals = { sales: 0, sales_volume_kg: 0, morm: 0, material: 0 };
  for (let m = 1; m <= 12; m++) {
    budgetYearTotals.sales += budgetByMonth[m].sales;
    budgetYearTotals.sales_volume_kg += budgetByMonth[m].sales_volume_kg;
    budgetYearTotals.morm += budgetByMonth[m].morm;
  }
  budgetYearTotals.material = budgetYearTotals.sales - budgetYearTotals.morm;
  
  // 3. Check if there's saved Budget P&L data in pl_data table
  let savedBudgetPLData = [];
  let hasSavedBudgetData = false;
  let savedMaterialVariancePct = 0;  // Material variance from database
  try {
    savedBudgetPLData = await plDataService.getPLData(division.toUpperCase(), { 
      year: parseInt(budgetYear), 
      dataType: 'Budget' 
    });
    hasSavedBudgetData = savedBudgetPLData && savedBudgetPLData.length > 0;
    if (hasSavedBudgetData) {
      // Get saved material variance from first row (same for all months)
      savedMaterialVariancePct = parseFloat(savedBudgetPLData[0]?.material_variance_pct) || 0;
      logger.info(`Found ${savedBudgetPLData.length} saved Budget P&L records for ${division} ${budgetYear}, variance: ${savedMaterialVariancePct}%`);
    }
  } catch (error) {
    logger.warn(`No saved Budget P&L data for ${division} ${budgetYear}:`, error.message);
  }
  
  // 4. Calculate yearly % of sales for pct_of_sales items (used for default calculation)
  // Uses Year Total Item / Year Total Sales (weighted average - months without data contribute 0)
  const actualYearSalesForPct = actualYearTotals.sales || 0;
  const yearlyPctOfSales = {};
  PL_LINE_ITEMS.filter(item => item.source === 'pct_of_sales').forEach(item => {
    const actualYearValue = actualYearTotals[item.key] || 0;
    yearlyPctOfSales[item.key] = actualYearSalesForPct > 0 ? actualYearValue / actualYearSalesForPct : 0;
  });
  
  // 4. Calculate budget values for all P&L lines
  // For items with source='pct_of_sales', use YEARLY % (not monthly) applied to budget sales
  const calculateBudgetPL = (month) => {
    const budgetBase = budgetByMonth[month];
    const budgetSales = budgetBase.sales;
    
    const budgetRow = {};
    
    PL_LINE_ITEMS.forEach(item => {
      if (item.source === 'budget') {
        // Directly from divisional budget
        if (item.budgetMetric === 'AMOUNT') {
          budgetRow[item.key] = budgetBase.sales;
        } else if (item.budgetMetric === 'KGS') {
          budgetRow[item.key] = budgetBase.sales_volume_kg;
        } else if (item.budgetMetric === 'MORM') {
          budgetRow[item.key] = budgetBase.morm;
        }
      } else if (item.source === 'calculated' && item.formula === 'sales - morm') {
        // Material = Sales - MoRM
        budgetRow[item.key] = budgetBase.sales - budgetBase.morm;
      } else if (item.source === 'actual_only' || item.source === 'zero_in_budget') {
        // Production volume or dir_cost_stock_adj - keep at 0 for budget
        budgetRow[item.key] = 0;
      } else if (item.source === 'pct_of_sales') {
        // Apply YEARLY % of sales to budget sales for this month
        const pct = yearlyPctOfSales[item.key] || 0;
        budgetRow[item.key] = budgetSales * pct;
      }
    });
    
    // Now calculate derived fields
    const num = (key) => parseFloat(budgetRow[key]) || 0;
    
    // Actual Direct Cost
    budgetRow.actual_direct_cost = num('labour') + num('depreciation') + num('electricity') + num('others_mfg_overheads');
    
    // Dir.Cost of goods sold
    budgetRow.dir_cost_goods_sold = num('actual_direct_cost') + num('dir_cost_stock_adj');
    
    // Cost of Sales
    budgetRow.cost_of_sales = num('material') + num('dir_cost_goods_sold');
    
    // Material % of Sales
    budgetRow.material_pct_of_sales = budgetBase.sales > 0 ? (num('material') / budgetBase.sales) * 100 : 0;
    
    // Direct cost % of COGS
    budgetRow.direct_cost_pct_of_cogs = num('cost_of_sales') > 0 ? (num('dir_cost_goods_sold') / num('cost_of_sales')) * 100 : 0;
    
    // Gross Profit
    budgetRow.gross_profit = budgetBase.sales - num('cost_of_sales');
    budgetRow.gross_profit_pct = budgetBase.sales > 0 ? (num('gross_profit') / budgetBase.sales) * 100 : 0;
    
    // Gross Profit before Depn
    budgetRow.gross_profit_before_depn = num('gross_profit') + num('depreciation');
    budgetRow.gross_profit_before_depn_pct = budgetBase.sales > 0 ? (num('gross_profit_before_depn') / budgetBase.sales) * 100 : 0;
    
    // Note: selling_expenses and admin_mgmt_fee_total are already calculated from pct_of_sales above
    // Do NOT overwrite them with sub-component sums as those don't exist in the data
    
    // Finance costs
    budgetRow.total_finance_cost = num('bank_interest') + num('bank_charges') + num('rd_preproduction');
    
    // Total Below GP Expenses (matches table view formula exactly)
    // Formula: other_income + bad_debts + stock_provision_adj + total_finance_cost + admin_mgmt_fee_total + transportation + selling_expenses + other_provision
    // Note: other_income is stored as NEGATIVE in DB (so adding it reduces expenses)
    budgetRow.total_below_gp_expenses = num('other_income') + num('bad_debts') + num('stock_provision_adj') + 
                                         num('total_finance_cost') + num('admin_mgmt_fee_total') + 
                                         num('transportation') + num('selling_expenses') + num('other_provision');
    
    // Net Profit
    budgetRow.net_profit = num('gross_profit') - num('total_below_gp_expenses');
    budgetRow.net_profit_pct = budgetBase.sales > 0 ? (num('net_profit') / budgetBase.sales) * 100 : 0;
    
    // EBIT
    budgetRow.ebit = num('net_profit') + num('bank_interest');
    budgetRow.ebit_pct = budgetBase.sales > 0 ? (num('ebit') / budgetBase.sales) * 100 : 0;
    
    // EBITDA
    budgetRow.ebitda = num('net_profit') + num('depreciation') + num('bank_interest') + num('rd_preproduction') + num('other_provision');
    budgetRow.ebitda_pct = budgetBase.sales > 0 ? (num('ebitda') / budgetBase.sales) * 100 : 0;
    
    // Total Expenses
    budgetRow.total_expenses = num('actual_direct_cost') + num('total_below_gp_expenses');
    budgetRow.total_expenses_per_kg = num('production_volume_kg') > 0 ? num('total_expenses') / num('production_volume_kg') : 0;
    
    return budgetRow;
  };
  
  // Build monthly budget data
  // If forceRecalculate=true (from Refresh button), always recalculate from divisional budget
  // Otherwise, use saved Budget P&L data if it exists
  const budgetPLByMonth = {};
  const { forceRecalculate } = req.body; // Check if forcing recalculation
  
  if (forceRecalculate || !hasSavedBudgetData) {
    // Recalculate from divisional budget (either forced or no saved data)
    for (let m = 1; m <= 12; m++) {
      budgetPLByMonth[m] = calculateBudgetPL(m);
    }
    logger.info(`${forceRecalculate ? 'Forced' : 'Default'} recalculation of Budget P&L from divisional budget for ${division} ${budgetYear}`);
  } else {
    // Use saved budget data - organize by month
    const savedByMonth = {};
    savedBudgetPLData.forEach(row => {
      const monthNum = MONTH_TO_NUMBER[row.month];
      if (monthNum) {
        // Map database columns to budget keys
        savedByMonth[monthNum] = {
          ...row,
          // Map override columns back to normal names
          selling_expenses: row.selling_expenses_override || row.selling_expenses || 0,
          admin_mgmt_fee_total: row.admin_mgmt_fee_override || row.admin_mgmt_fee_total || 0,
          // Calculate MoRM from Sales - Material
          morm: (parseFloat(row.sales) || 0) - (parseFloat(row.material) || 0)
        };
      }
    });
    
    // Build budget with saved values, then recalculate derived fields
    for (let m = 1; m <= 12; m++) {
      const savedRow = savedByMonth[m] || {};
      const budgetBase = budgetByMonth[m]; // Contains sales, sales_volume_kg, morm from divisional budget
      
      // Start with saved values for input fields
      const budgetRow = {
        sales: parseFloat(savedRow.sales) || budgetBase.sales || 0,
        sales_volume_kg: parseFloat(savedRow.sales_volume_kg) || budgetBase.sales_volume_kg || 0,
        morm: parseFloat(savedRow.morm) || budgetBase.morm || 0
      };
      
      // Apply saved values for all P&L items
      PL_LINE_ITEMS.forEach(item => {
        if (item.source === 'pct_of_sales' || item.isInput) {
          if (item.key === 'selling_expenses') {
            budgetRow[item.key] = parseFloat(savedRow.selling_expenses_override) || parseFloat(savedRow.selling_expenses) || 0;
          } else if (item.key === 'admin_mgmt_fee_total') {
            budgetRow[item.key] = parseFloat(savedRow.admin_mgmt_fee_override) || parseFloat(savedRow.admin_mgmt_fee_total) || 0;
          } else {
            budgetRow[item.key] = parseFloat(savedRow[item.key]) || 0;
          }
        }
      });
      
      // Material = Sales - MoRM (use saved Material if available)
      budgetRow.material = parseFloat(savedRow.material) || (budgetRow.sales - budgetRow.morm);
      
      // Now recalculate derived fields
      const num = (key) => parseFloat(budgetRow[key]) || 0;
      const budgetSales = budgetRow.sales;
      
      budgetRow.actual_direct_cost = num('labour') + num('depreciation') + num('electricity') + num('others_mfg_overheads');
      budgetRow.dir_cost_goods_sold = num('actual_direct_cost') + num('dir_cost_stock_adj');
      budgetRow.cost_of_sales = num('material') + num('dir_cost_goods_sold');
      budgetRow.material_pct_of_sales = budgetSales > 0 ? (num('material') / budgetSales) * 100 : 0;
      budgetRow.direct_cost_pct_of_cogs = num('cost_of_sales') > 0 ? (num('dir_cost_goods_sold') / num('cost_of_sales')) * 100 : 0;
      budgetRow.gross_profit = budgetSales - num('cost_of_sales');
      budgetRow.gross_profit_pct = budgetSales > 0 ? (num('gross_profit') / budgetSales) * 100 : 0;
      budgetRow.gross_profit_before_depn = num('gross_profit') + num('depreciation');
      budgetRow.gross_profit_before_depn_pct = budgetSales > 0 ? (num('gross_profit_before_depn') / budgetSales) * 100 : 0;
      budgetRow.total_finance_cost = num('bank_interest') + num('bank_charges') + num('rd_preproduction');
      budgetRow.total_below_gp_expenses = num('other_income') + num('bad_debts') + num('stock_provision_adj') + 
                                           num('total_finance_cost') + num('admin_mgmt_fee_total') + 
                                           num('transportation') + num('selling_expenses') + num('other_provision');
      budgetRow.net_profit = num('gross_profit') - num('total_below_gp_expenses');
      budgetRow.net_profit_pct = budgetSales > 0 ? (num('net_profit') / budgetSales) * 100 : 0;
      budgetRow.ebit = num('net_profit') + num('bank_interest');
      budgetRow.ebit_pct = budgetSales > 0 ? (num('ebit') / budgetSales) * 100 : 0;
      budgetRow.ebitda = num('net_profit') + num('depreciation') + num('bank_interest') + num('rd_preproduction') + num('other_provision');
      budgetRow.ebitda_pct = budgetSales > 0 ? (num('ebitda') / budgetSales) * 100 : 0;
      budgetRow.total_expenses = num('actual_direct_cost') + num('total_below_gp_expenses');
      budgetRow.total_expenses_per_kg = num('production_volume_kg') > 0 ? num('total_expenses') / num('production_volume_kg') : 0;
      
      budgetPLByMonth[m] = budgetRow;
    }
    
    logger.info(`Using saved Budget P&L data for ${division} ${budgetYear}`);
  }
  
  // Calculate budget year totals (sum monthly values for non-% items)
  const budgetPLYearTotals = {};
  PL_LINE_ITEMS.forEach(item => {
    if (!item.isPct && !item.isPerKg) {
      budgetPLYearTotals[item.key] = 0;
      for (let m = 1; m <= 12; m++) {
        budgetPLYearTotals[item.key] += parseFloat(budgetPLByMonth[m][item.key]) || 0;
      }
    }
  });
  
  // Recalculate % items for year totals
  const totalSales = budgetPLYearTotals.sales || 0;
  budgetPLYearTotals.material_pct_of_sales = totalSales > 0 ? (budgetPLYearTotals.material / totalSales) * 100 : 0;
  budgetPLYearTotals.direct_cost_pct_of_cogs = budgetPLYearTotals.cost_of_sales > 0 ? (budgetPLYearTotals.dir_cost_goods_sold / budgetPLYearTotals.cost_of_sales) * 100 : 0;
  budgetPLYearTotals.gross_profit_pct = totalSales > 0 ? (budgetPLYearTotals.gross_profit / totalSales) * 100 : 0;
  budgetPLYearTotals.gross_profit_before_depn_pct = totalSales > 0 ? (budgetPLYearTotals.gross_profit_before_depn / totalSales) * 100 : 0;
  budgetPLYearTotals.net_profit_pct = totalSales > 0 ? (budgetPLYearTotals.net_profit / totalSales) * 100 : 0;
  budgetPLYearTotals.ebit_pct = totalSales > 0 ? (budgetPLYearTotals.ebit / totalSales) * 100 : 0;
  budgetPLYearTotals.ebitda_pct = totalSales > 0 ? (budgetPLYearTotals.ebitda / totalSales) * 100 : 0;
  budgetPLYearTotals.total_expenses_per_kg = budgetPLYearTotals.production_volume_kg > 0 ? budgetPLYearTotals.total_expenses / budgetPLYearTotals.production_volume_kg : 0;
  
  // Calculate Budget's own % of Sales ratios (for use when editing saved budget)
  // These ratios preserve the budget's own proportions instead of using Actual year ratios
  const budgetPctOfSales = {};
  PL_LINE_ITEMS.filter(item => item.source === 'pct_of_sales').forEach(item => {
    const budgetYearValue = budgetPLYearTotals[item.key] || 0;
    budgetPctOfSales[item.key] = totalSales > 0 ? (budgetYearValue / totalSales) * 100 : 0;
  });
  
  // Recalculate actual year % items
  actualYearTotals.material_pct_of_sales = actualYearSales > 0 ? (actualYearTotals.material / actualYearSales) * 100 : 0;
  actualYearTotals.direct_cost_pct_of_cogs = actualYearTotals.cost_of_sales > 0 ? (actualYearTotals.dir_cost_goods_sold / actualYearTotals.cost_of_sales) * 100 : 0;
  actualYearTotals.gross_profit_pct = actualYearSales > 0 ? (actualYearTotals.gross_profit / actualYearSales) * 100 : 0;
  actualYearTotals.gross_profit_before_depn_pct = actualYearSales > 0 ? (actualYearTotals.gross_profit_before_depn / actualYearSales) * 100 : 0;
  actualYearTotals.net_profit_pct = actualYearSales > 0 ? (actualYearTotals.net_profit / actualYearSales) * 100 : 0;
  actualYearTotals.ebit_pct = actualYearSales > 0 ? (actualYearTotals.ebit / actualYearSales) * 100 : 0;
  actualYearTotals.ebitda_pct = actualYearSales > 0 ? (actualYearTotals.ebitda / actualYearSales) * 100 : 0;
  actualYearTotals.total_expenses_per_kg = actualYearTotals.production_volume_kg > 0 ? actualYearTotals.total_expenses / actualYearTotals.production_volume_kg : 0;
  
  successResponse(res, {
    division: division.toUpperCase(),
    actualYear,
    budgetYear: parseInt(budgetYear),
    lineItems: PL_LINE_ITEMS.filter(item => !item.isHelper && !item.isHidden), // Exclude helper and hidden items from display
    actualByMonth,
    actualYearTotals,
    budgetByMonth: budgetPLByMonth,
    budgetYearTotals: budgetPLYearTotals,
    hasSavedBudgetData,  // Let frontend know if using saved data or calculated defaults
    savedMaterialVariancePct,  // Material variance % from database (0 if not saved)
    budgetPctOfSales  // Budget's own % of Sales ratios (for editing saved budget)
  });
}));

/**
 * POST /export-budget-pl-html
 * Export Budget P&L as HTML file for offline editing
 * 
 * @route POST /api/aebf/export-budget-pl-html
 * @body {string} division - Division (FP)
 * @body {number} budgetYear - Budget year
 * @body {object} data - P&L data to export
 * @returns {html} - HTML file for download
 */
router.post('/export-budget-pl-html', asyncHandler(async (req, res) => {
  const { division, budgetYear, actualYear, lineItems, actualByMonth, actualYearTotals, budgetByMonth, budgetYearTotals } = req.body;
  
  if (!division || !budgetYear) {
    return res.status(400).json({ success: false, error: 'Division and budgetYear are required' });
  }
  
  logger.info(`Generating Budget P&L HTML for ${division}, budget year ${budgetYear}`);
  
  // Generate the HTML content
  const htmlContent = generateBudgetPLHtml({
    division,
    actualYear: actualYear || (parseInt(budgetYear) - 1),
    budgetYear: parseInt(budgetYear),
    lineItems: lineItems || PL_LINE_ITEMS.filter(item => !item.isHelper && !item.isHidden),
    actualByMonth: actualByMonth || {},
    actualYearTotals: actualYearTotals || {},
    budgetByMonth: budgetByMonth || {},
    budgetYearTotals: budgetYearTotals || {}
  });
  
  // Generate filename
  const now = new Date();
  const dateStr = String(now.getDate()).padStart(2, '0') + String(now.getMonth() + 1).padStart(2, '0') + now.getFullYear();
  const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
  const filename = `BUDGET_PL_${division}_${budgetYear}_${dateStr}_${timeStr}.html`;
  
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(htmlContent);
}));

/**
 * POST /import-budget-pl-html
 * Import Budget P&L from HTML file
 * Parses the HTML to extract budget values
 * 
 * @route POST /api/aebf/import-budget-pl-html
 * @body {string} htmlContent - Raw HTML content
 * @body {string} division - Division to validate against
 * @returns {object} 200 - Parsed budget data
 */
router.post('/import-budget-pl-html', asyncHandler(async (req, res) => {
  const { htmlContent, division } = req.body;
  
  if (!htmlContent) {
    return res.status(400).json({ success: false, error: 'HTML content is required' });
  }
  
  logger.info(`Importing Budget P&L HTML for ${division || 'unknown'}`);
  
  // Parse the HTML to extract budget data
  const parsedData = parseBudgetPLHtml(htmlContent, division);
  
  if (!parsedData.success) {
    return res.status(400).json({ success: false, error: parsedData.error });
  }
  
  successResponse(res, parsedData);
}));

/**
 * POST /save-budget-pl
 * Save Budget P&L overrides to database
 * 
 * NOTE: The P&L budget is derived from divisional product group budget.
 * This endpoint saves user-edited overrides that modify the calculated values.
 * 
 * @route POST /api/aebf/save-budget-pl
 * @body {string} division - Division (FP)
 * @body {number} budgetYear - Budget year
 * @body {object} editedValues - Edited budget values keyed by "month-key"
 * @returns {object} 200 - Save confirmation
 */
router.post('/save-budget-pl', asyncHandler(async (req, res) => {
  const { division, budgetYear, editedValues, fullBudgetData, materialVariancePct } = req.body;
  
  if (!division || !budgetYear) {
    return res.status(400).json({ success: false, error: 'Division and budgetYear are required' });
  }
  
  // We need fullBudgetData - the complete monthly budget values (not just edits)
  if (!fullBudgetData || Object.keys(fullBudgetData).length === 0) {
    return res.status(400).json({ success: false, error: 'No budget data to save' });
  }
  
  // Material variance % (default to 0 if not provided)
  const variancePct = parseFloat(materialVariancePct) || 0;
  
  logger.info(`Saving Budget P&L for ${division}, year ${budgetYear}`, {
    months: Object.keys(fullBudgetData).length,
    materialVariancePct: variancePct
  });
  
  // Use the main pool for pl_data tables (they're in main db, not division-specific)
  const { pool } = require('../../database/config');
  const tableName = `${division.toLowerCase()}_pl_data`; // division-specific pl_data table
  
  try {
    // Start transaction
    await pool.query('BEGIN');
    
    // Delete existing Budget data for this year
    await pool.query(
      `DELETE FROM ${tableName} WHERE year = $1 AND data_type = 'Budget'`,
      [parseInt(budgetYear)]
    );
    
    // Input columns that can be saved (from plRowMapping)
    const inputColumns = [
      'sales', 'material', 'sales_volume_kg', 'production_volume_kg',
      'labour', 'depreciation', 'electricity', 'others_mfg_overheads',
      'dir_cost_stock_adj', 'dir_cost_sewa',
      'sales_manpower_cost', 'sales_incentive', 'sales_office_rent', 'sales_travel',
      'advt_promotion', 'other_selling_expenses',
      'transportation',
      'admin_manpower_cost', 'telephone_fax', 'other_admin_cost',
      'selling_expenses_override', 'administration_override', 'admin_mgmt_fee_override',
      'bank_interest', 'bank_charges', 'rd_preproduction',
      'stock_provision_adj', 'bad_debts', 'other_income', 'other_provision'
    ];
    
    // Map budget P&L keys to database columns (some are stored differently)
    const keyToColumnMap = {
      'selling_expenses': 'selling_expenses_override',
      'admin_mgmt_fee_total': 'admin_mgmt_fee_override',
      'morm': null  // MoRM is calculated, not stored
    };
    
    // Insert budget data for each month
    let insertedCount = 0;
    for (let month = 1; month <= 12; month++) {
      const monthData = fullBudgetData[month];
      if (!monthData) continue;
      
      const monthName = NUMBER_TO_MONTH[month];
      
      // Build column list and values (include material_variance_pct)
      const columns = ['year', 'month', 'data_type', 'material_variance_pct'];
      const values = [parseInt(budgetYear), monthName, 'Budget', variancePct];
      
      inputColumns.forEach(col => {
        // Check if there's a mapping for budget keys
        let budgetKey = col;
        if (col === 'selling_expenses_override') budgetKey = 'selling_expenses';
        if (col === 'admin_mgmt_fee_override') budgetKey = 'admin_mgmt_fee_total';
        
        const value = monthData[budgetKey] || 0;
        columns.push(col);
        values.push(value);
      });
      
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const insertQuery = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
      
      await pool.query(insertQuery, values);
      insertedCount++;
    }
    
    // Commit transaction
    await pool.query('COMMIT');
    
    // Invalidate all related caches to ensure Dashboard and other components get fresh data
    invalidateCache(`/budget-pl-data`);
    invalidateCache(`aebf:*`);  // All AEBF caches
    invalidateCache(`pl:*`);   // All P&L caches (if any)
    
    logger.info(`Budget P&L saved: ${insertedCount} months for ${division} ${budgetYear}`);
    
    successResponse(res, { 
      message: `Budget P&L saved successfully (${insertedCount} months)`,
      division,
      budgetYear,
      savedCount: insertedCount
    });
    
  } catch (error) {
    await pool.query('ROLLBACK');
    logger.error('Error saving Budget P&L:', error);
    throw error;
  }
}));

/**
 * Generate Budget P&L HTML content
 * Creates a downloadable HTML file with the same structure as Divisional Budget
 */
function generateBudgetPLHtml({ division, actualYear, budgetYear, lineItems, actualByMonth, actualYearTotals, budgetByMonth, budgetYearTotals }) {
  const formatNumber = (num, isPct = false, isPerKg = false) => {
    if (num === null || num === undefined || isNaN(num)) return '0';
    if (isPct) return Math.round(num) + '%';
    if (isPerKg) return Math.round(num);
    return Math.round(num).toLocaleString('en-US');
  };
  
  // Build table rows
  let tableRowsHtml = '';
  
  lineItems.forEach(item => {
    const isPct = item.isPct;
    const isPerKg = item.isPerKg;
    const isCalculated = item.source === 'calculated';
    const rowClass = isCalculated ? 'calculated-row' : 'data-row';
    
    // Actual row
    let actualCells = '';
    for (let m = 1; m <= 12; m++) {
      const value = actualByMonth[m]?.[item.key] || 0;
      actualCells += `<td>${formatNumber(value, isPct, isPerKg)}</td>`;
    }
    const actualTotal = actualYearTotals[item.key] || 0;
    
    tableRowsHtml += `
      <tr class="actual-row ${rowClass}" data-key="${item.key}">
        <td rowspan="2">${item.label}</td>
        ${actualCells}
        <td class="total-cell">${formatNumber(actualTotal, isPct, isPerKg)}</td>
      </tr>`;
    
    // Budget row
    let budgetCells = '';
    for (let m = 1; m <= 12; m++) {
      const value = budgetByMonth[m]?.[item.key] || 0;
      budgetCells += `<td>${formatNumber(value, isPct, isPerKg)}</td>`;
    }
    const budgetTotal = budgetYearTotals[item.key] || 0;
    
    tableRowsHtml += `
      <tr class="budget-row ${rowClass}">
        ${budgetCells}
        <td class="total-cell">${formatNumber(budgetTotal, isPct, isPerKg)}</td>
      </tr>`;
  });
  
  return `<!DOCTYPE html>
<!-- IPD_BUDGET_SYSTEM_v1.0 :: TYPE=BUDGET_PL :: DO_NOT_EDIT_THIS_LINE -->
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="division" content="${division}">
  <meta name="actualYear" content="${actualYear}">
  <meta name="budgetYear" content="${budgetYear}">
  <meta name="exportType" content="budget_pl">
  <title>Budget P&L - ${division} - ${budgetYear}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
    .header { background: #1a365d; color: #fff; padding: 16px 20px; margin-bottom: 16px; border-radius: 4px; }
    .header h1 { margin-bottom: 8px; font-size: 20px; }
    .header-info { display: flex; gap: 30px; flex-wrap: wrap; font-size: 13px; color: #e2e8f0; }
    .header-info strong { color: #fff; }
    
    .table-container { background: #fff; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: auto; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
    
    thead th { background-color: #1a365d; color: #fff; padding: 10px 8px; border: 1px solid #2d4a6f; text-align: center; font-weight: 600; }
    thead th:first-child { position: sticky; left: 0; z-index: 10; width: 200px; }
    
    tbody td { padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; }
    tbody td:first-child { position: sticky; left: 0; z-index: 5; background-color: #f8fafc; font-weight: 600; text-align: left; border-right: 2px solid #cbd5e1; }
    
    /* Actual rows - light blue theme */
    tr.actual-row td { background-color: #eff6ff; color: #1e40af; }
    tr.actual-row td:first-child { background-color: #dbeafe; }
    tr.actual-row td.total-cell { background-color: #bfdbfe; font-weight: 700; text-align: center; }
    
    /* Budget rows - light amber/yellow theme */
    tr.budget-row td { background-color: #fffbeb; color: #92400e; }
    tr.budget-row td:first-child { background-color: #fef3c7; }
    tr.budget-row td.total-cell { background-color: #fde68a; font-weight: 700; text-align: center; }
    
    /* Calculated rows - slightly darker */
    tr.calculated-row.actual-row td { background-color: #dbeafe; font-weight: 600; }
    tr.calculated-row.actual-row td:first-child { background-color: #bfdbfe; }
    tr.calculated-row.actual-row td.total-cell { background-color: #93c5fd; }
    
    tr.calculated-row.budget-row td { background-color: #fef3c7; font-weight: 600; }
    tr.calculated-row.budget-row td:first-child { background-color: #fde68a; }
    tr.calculated-row.budget-row td.total-cell { background-color: #fcd34d; }
    
    /* Row hover effect */
    tbody tr:hover td { filter: brightness(0.95); }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 Budget P&L - ${division}</h1>
    <div class="header-info">
      <div><strong>Division:</strong> ${division}</div>
      <div><strong>Actual Year:</strong> ${actualYear}</div>
      <div><strong>Budget Year:</strong> ${budgetYear}</div>
    </div>
  </div>
  
  <div style="margin-bottom: 12px; padding: 12px 16px; background: #fff; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <div style="display: flex; gap: 24px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="display: inline-block; width: 16px; height: 16px; background-color: #eff6ff; border: 1px solid #3b82f6;"></span>
        <span style="color: #1e40af;">Actual ${actualYear}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="display: inline-block; width: 16px; height: 16px; background-color: #fffbeb; border: 1px solid #f59e0b;"></span>
        <span style="color: #92400e;">Budget ${budgetYear}</span>
      </div>
    </div>
  </div>
  
  <div class="table-container">
    <table>
      <colgroup>
        <col style="width: 200px;">
        ${Array(12).fill('<col style="width: 80px;">').join('')}
        <col style="width: 100px;">
      </colgroup>
      <thead>
        <tr>
          <th rowspan="2" style="font-size: 14px; font-weight: 700;">P&L Ledgers</th>
          <th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th>
          <th>7</th><th>8</th><th>9</th><th>10</th><th>11</th><th>12</th>
          <th>Year Total</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml}
      </tbody>
    </table>
  </div>
  
  <script id="savedBudgetPLData">
  /* BUDGET PL DATA FOR DATABASE IMPORT */
  const budgetPLMetadata = {
    "division": "${division}",
    "actualYear": ${actualYear},
    "budgetYear": ${budgetYear},
    "savedAt": "${new Date().toISOString()}",
    "dataFormat": "budget_pl_import"
  };
  const savedBudgetPL = ${JSON.stringify(budgetYearTotals)};
  </script>
</body>
</html>`;
}

/**
 * Parse Budget P&L HTML to extract data
 */
function parseBudgetPLHtml(htmlContent, expectedDivision) {
  try {
    // Check for signature
    const signaturePattern = /<!--\s*IPD_BUDGET_SYSTEM_v[\d.]+\s*::\s*TYPE=BUDGET_PL\s*::/;
    if (!signaturePattern.test(htmlContent)) {
      return { success: false, error: 'Invalid file format. This is not a Budget P&L HTML file.' };
    }
    
    // Extract metadata
    const divisionMatch = htmlContent.match(/name="division"\s+content="([^"]+)"/);
    const actualYearMatch = htmlContent.match(/name="actualYear"\s+content="(\d+)"/);
    const budgetYearMatch = htmlContent.match(/name="budgetYear"\s+content="(\d+)"/);
    
    const division = divisionMatch ? divisionMatch[1] : null;
    const actualYear = actualYearMatch ? parseInt(actualYearMatch[1]) : null;
    const budgetYear = budgetYearMatch ? parseInt(budgetYearMatch[1]) : null;
    
    if (!division || !budgetYear) {
      return { success: false, error: 'Could not extract metadata from HTML file.' };
    }
    
    if (expectedDivision && division.toUpperCase() !== expectedDivision.toUpperCase()) {
      return { success: false, error: `Division mismatch. File is for ${division}, but you selected ${expectedDivision}.` };
    }
    
    // Extract saved data from script tag
    const scriptMatch = htmlContent.match(/const savedBudgetPL = ({[^;]+});/);
    let budgetData = {};
    if (scriptMatch) {
      try {
        budgetData = JSON.parse(scriptMatch[1]);
      } catch (e) {
        logger.warn('Could not parse savedBudgetPL data:', e.message);
      }
    }
    
    return {
      success: true,
      division,
      actualYear,
      budgetYear,
      budgetData
    };
  } catch (error) {
    return { success: false, error: 'Failed to parse HTML file: ' + error.message };
  }
}

/**
 * POST /export-budget-pl-excel
 * Export BUDGET P&L as Excel file - SINGLE SHEET with editable % of Sls
 * 
 * STRUCTURE:
 * - Ledger | Month 1 (Amount | % of Sls | /Kg) | Month 2 ... | Year Total
 * - % of Sls = FIXED values (user can edit in Excel to simulate)
 * - Amount = FORMULA: Budget Sales × % of Sls (for pct_of_sales items)
 * - /Kg = FORMULA: Amount / Sales Volume Kg
 * 
 * @route POST /api/aebf/export-budget-pl-excel
 * @body {string} division - Division (FP)
 * @body {number} budgetYear - Budget year
 * @body {object} data - P&L data to export
 * @returns {xlsx} - Excel file for download
 */
router.post('/export-budget-pl-excel', asyncHandler(async (req, res) => {
  const ExcelJS = require('exceljs');
  const { division, budgetYear, actualYear, lineItems, budgetByMonth, budgetYearTotals } = req.body;
  
  if (!division || !budgetYear) {
    return res.status(400).json({ success: false, error: 'Division and budgetYear are required' });
  }
  
  logger.info(`Generating Budget P&L Excel for ${division}, budget year ${budgetYear}`);
  
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IPD Budget System';
  workbook.created = new Date();
  
  // Items to export
  const items = lineItems || PL_LINE_ITEMS.filter(item => !item.isHelper && !item.isHidden);
  
  // Helper to get column letter from column index (1=A, 2=B, etc.)
  const colLetter = (col) => {
    let letter = '';
    while (col > 0) {
      col--;
      letter = String.fromCharCode(65 + (col % 26)) + letter;
      col = Math.floor(col / 26);
    }
    return letter;
  };
  
  // Calculated item keys - these need Excel formulas (not based on % of Sales)
  const CALCULATED_ITEMS = ['cost_of_sales', 'actual_direct_cost', 'dir_cost_goods_sold', 'direct_cost_pct_of_cogs', 
    'gross_profit', 'gross_profit_before_depn', 'total_below_gp_expenses', 'total_expenses', 'net_profit', 'ebit', 'ebitda'];
  
  // Items that are simulated as % of Sales (Amount = Sales × %)
  // Note: 'morm' (Margin over Material) is included - Material = Sales - MoRM
  // Note: 'dir_cost_stock_adj' is excluded - its % becomes Material Variance, Amount is always 0 in budget
  const PCT_OF_SALES_ITEMS = ['morm', 'labour', 'depreciation', 'electricity', 'others_mfg_overheads',
    'selling_expenses', 'transportation', 'admin_mgmt_fee_total', 'bank_interest', 'bank_charges', 
    'rd_preproduction', 'stock_provision_adj', 'bad_debts', 'other_income', 'other_provision'];
  
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
  
  // Calculate yearly % of Sales for each pct_of_sales item
  // This is the FIXED value users can edit in Excel
  const yearlyPctOfSales = {};
  const totalBudgetSales = Object.values(budgetByMonth || {}).reduce((sum, m) => sum + (m?.sales || 0), 0);
  
  PCT_OF_SALES_ITEMS.forEach(key => {
    const totalValue = Object.values(budgetByMonth || {}).reduce((sum, m) => sum + (m?.[key] || 0), 0);
    yearlyPctOfSales[key] = totalBudgetSales > 0 ? totalValue / totalBudgetSales : 0;
  });
  
  // =====================================================
  // SINGLE SHEET: DETAILED VIEW
  // Layout: Ledger | Month 1 (Amount | % of Sls | /Kg) | Month 2 ... | Year Total
  // % of Sls = FIXED (editable), Amount = Sales × % (formula)
  // =====================================================
  const ws = workbook.addWorksheet(`Budget P&L ${budgetYear}`, {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }]  // Freeze rows 1-3 (title, month, subheader)
  });
  
  // Row mapping (Row 1=title, Row 2=month, Row 3=subheader, Row 4+=data)
  const rowMap = {};
  items.forEach((item, idx) => {
    rowMap[item.key] = 4 + idx;
  });
  
  // Column index helper: each month has 3 columns (Amount, % of Sls, /Kg)
  // Column 1 = Ledgers, then each month has 3 columns
  const getColIdx = (m, subCol) => {
    const monthBase = 2 + (m - 1) * 3;
    const subOffset = subCol === 'amount' ? 0 : (subCol === 'pct' ? 1 : 2);
    return monthBase + subOffset;
  };
  
  // Total columns (after 12 months × 3 cols = 36 cols + 1 ledger col = starts at col 38)
  const TOTAL_AMT_COL = 38;
  const TOTAL_PCT_COL = 39;
  const TOTAL_KG_COL = 40;
  
  /**
   * FORMULA BUILDER - Creates Excel formulas for calculated items
   * Calculated items derive their Amount from other rows (not % of Sales)
   */
  const getCalculatedFormula = (itemKey, amtColLetter) => {
    const ref = (key) => `${amtColLetter}${rowMap[key]}`;
    
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
  
  // ROW 1: Title - Merged, left aligned, dark blue background (same as Year Total)
  const titleRow = ws.addRow([`${division} Budget P&L - Year ${budgetYear} (AED)`]);
  // Fill ALL cells BEFORE merging (ExcelJS quirk with large column ranges)
  for (let c = 1; c <= TOTAL_KG_COL; c++) {
    titleRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };  // Dark blue (same as Year Total)
  }
  ws.mergeCells(1, 1, 1, TOTAL_KG_COL);  // Merge across all columns
  ws.getRow(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };  // White text
  ws.getRow(1).height = 30;
  ws.getRow(1).alignment = { horizontal: 'left', vertical: 'middle' };
  
  // ROW 2: Month names header
  const monthHeaderRow = ws.addRow([]);
  // Column A will be merged with row 3 for "Ledgers" - value must be in top cell (A2)
  monthHeaderRow.getCell(1).value = 'Ledgers';
  monthHeaderRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  monthHeaderRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };  // Dark blue (same as title)
  monthHeaderRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  let colIdx = 2;
  for (let m = 1; m <= 12; m++) {
    monthHeaderRow.getCell(colIdx).value = MONTH_NAMES[m - 1];
    monthHeaderRow.getCell(colIdx).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } };  // Medium blue
    monthHeaderRow.getCell(colIdx).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    monthHeaderRow.getCell(colIdx).alignment = { horizontal: 'center' };
    // Also fill the other 2 cells of this month
    monthHeaderRow.getCell(colIdx + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } };
    monthHeaderRow.getCell(colIdx + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } };
    ws.mergeCells(2, colIdx, 2, colIdx + 2);
    colIdx += 3;
  }
  // Year Total header
  monthHeaderRow.getCell(TOTAL_AMT_COL).value = 'Year Total';
  monthHeaderRow.getCell(TOTAL_AMT_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };  // Dark blue
  monthHeaderRow.getCell(TOTAL_AMT_COL).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  monthHeaderRow.getCell(TOTAL_AMT_COL).alignment = { horizontal: 'center' };
  monthHeaderRow.getCell(TOTAL_PCT_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  monthHeaderRow.getCell(TOTAL_KG_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  ws.mergeCells(2, TOTAL_AMT_COL, 2, TOTAL_KG_COL);
  monthHeaderRow.height = 24;
  
  // ROW 3: Sub-headers (Amount, % of Sls, /Kg) with distinct colors
  const subHeaderRow = ws.addRow([]);
  // A3 is part of merged A2:A3 - just fill it
  subHeaderRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };  // Dark blue (same as title)
  ws.mergeCells(2, 1, 3, 1);  // Merge A2:A3 for "Ledgers"
  colIdx = 2;
  for (let m = 1; m <= 12; m++) {
    // Amount - light blue
    subHeaderRow.getCell(colIdx).value = 'Amount';
    subHeaderRow.getCell(colIdx).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDAEEF3' } };  // Very light blue
    subHeaderRow.getCell(colIdx).font = { bold: true, size: 9 };
    subHeaderRow.getCell(colIdx).alignment = { horizontal: 'center' };
    colIdx++;
    // % of Sls - yellow (editable)
    subHeaderRow.getCell(colIdx).value = '% of Sls';
    subHeaderRow.getCell(colIdx).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };  // Light yellow
    subHeaderRow.getCell(colIdx).font = { bold: true, size: 9 };
    subHeaderRow.getCell(colIdx).alignment = { horizontal: 'center' };
    colIdx++;
    // /Kg - light green
    subHeaderRow.getCell(colIdx).value = 'Per Kg';
    subHeaderRow.getCell(colIdx).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };  // Light green
    subHeaderRow.getCell(colIdx).font = { bold: true, size: 9 };
    subHeaderRow.getCell(colIdx).alignment = { horizontal: 'center' };
    colIdx++;
  }
  // Year Total sub-headers
  subHeaderRow.getCell(TOTAL_AMT_COL).value = 'Amount';
  subHeaderRow.getCell(TOTAL_AMT_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB4C6E7' } };  // Medium light blue
  subHeaderRow.getCell(TOTAL_AMT_COL).font = { bold: true, size: 9 };
  subHeaderRow.getCell(TOTAL_AMT_COL).alignment = { horizontal: 'center' };
  subHeaderRow.getCell(TOTAL_PCT_COL).value = '% of Sls';
  subHeaderRow.getCell(TOTAL_PCT_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD966' } };  // Gold yellow
  subHeaderRow.getCell(TOTAL_PCT_COL).font = { bold: true, size: 9 };
  subHeaderRow.getCell(TOTAL_PCT_COL).alignment = { horizontal: 'center' };
  subHeaderRow.getCell(TOTAL_KG_COL).value = 'Per Kg';
  subHeaderRow.getCell(TOTAL_KG_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6E0B4' } };  // Medium light green
  subHeaderRow.getCell(TOTAL_KG_COL).font = { bold: true, size: 9 };
  subHeaderRow.getCell(TOTAL_KG_COL).alignment = { horizontal: 'center' };
  subHeaderRow.height = 22;
  
  // Set column widths
  ws.getColumn(1).width = 38;  // Ledgers column - wider for long names
  for (let c = 2; c <= TOTAL_KG_COL; c++) {
    ws.getColumn(c).width = 11;
  }
  
  // DATA ROWS - one row per ledger item
  items.forEach((item) => {
    const dataRow = ws.addRow([]);
    const rowNum = rowMap[item.key];
    const isCalculated = CALCULATED_ITEMS.includes(item.key);
    const isPctOfSalesItem = PCT_OF_SALES_ITEMS.includes(item.key);
    const isPctItem = item.key === 'direct_cost_pct_of_cogs';
    const isVolumeItem = item.key.includes('volume');
    const salesRow = rowMap.sales;
    const kgRow = rowMap.sales_volume_kg;
    const cogsRow = rowMap.cost_of_sales;
    
    // Background colors - matching header color scheme
    const amtBgColor = isCalculated ? 'FFD6DCE5' : 'FFF2F8FF';  // Light blue-gray for calculated, very light blue for input
    const pctBgColor = isPctOfSalesItem ? 'FFFFF9E6' : (isCalculated ? 'FFFFEFD6' : 'FFFFF9E6');  // Light yellow tones
    const kgBgColor = isCalculated ? 'FFE2EFDA' : 'FFF5FAF0';  // Light green tones
    
    // Column A: Ledger label
    dataRow.getCell(1).value = item.label;
    dataRow.getCell(1).font = { bold: isCalculated };
    dataRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isCalculated ? 'FFE7E6E6' : 'FFFFFFFF' } };
    
    for (let m = 1; m <= 12; m++) {
      const amtCol = getColIdx(m, 'amount');
      const pctCol = getColIdx(m, 'pct');
      const kgCol = getColIdx(m, 'kg');
      const amtLetter = colLetter(amtCol);
      const pctLetter = colLetter(pctCol);
      const salesAmtRef = `${colLetter(getColIdx(m, 'amount'))}${salesRow}`;
      const kgAmtRef = `${colLetter(getColIdx(m, 'amount'))}${kgRow}`;
      const cogsRef = `${amtLetter}${cogsRow}`;
      const amtRef = `${amtLetter}${rowNum}`;
      const pctRef = `${pctLetter}${rowNum}`;
      
      // ====== AMOUNT COLUMN ======
      if (isCalculated) {
        // Calculated items: Amount = formula based on other rows
        const formula = getCalculatedFormula(item.key, amtLetter);
        if (formula) {
          dataRow.getCell(amtCol).value = { formula };
        } else {
          dataRow.getCell(amtCol).value = Math.round(budgetByMonth?.[m]?.[item.key] || 0);
        }
      } else if (item.key === 'material') {
        // Material: Use frontend value directly (includes variance adjustment)
        // Don't use formula - variance % would not be applied
        dataRow.getCell(amtCol).value = Math.round(budgetByMonth?.[m]?.['material'] || 0);
      } else if (item.key === 'dir_cost_stock_adj') {
        // Dir.Cost in Stock/Stock Adj. is always 0 in budget
        // Its % of Sales from actual year is used as Material Variance default
        dataRow.getCell(amtCol).value = 0;
      } else if (isPctOfSalesItem) {
        // % of Sales items: Amount is editable (user can change it directly)
        // Use the value from budgetByMonth (which may include user edits)
        const amount = Math.round(budgetByMonth?.[m]?.[item.key] || 0);
        dataRow.getCell(amtCol).value = amount;
      } else {
        // Direct input items (sales, sales_volume_kg): fixed values
        dataRow.getCell(amtCol).value = Math.round(budgetByMonth?.[m]?.[item.key] || 0);
      }
      
      // Format: percentage for direct_cost_pct_of_cogs, otherwise whole numbers
      dataRow.getCell(amtCol).numFmt = isPctItem ? '0.00%' : '#,##0';
      dataRow.getCell(amtCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: amtBgColor } };
      dataRow.getCell(amtCol).alignment = { horizontal: 'right' };
      
      // ====== % OF SALES COLUMN ======
      if (item.key === 'sales') {
        dataRow.getCell(pctCol).value = 1;  // Sales is always 100%
      } else if (isPctItem) {
        dataRow.getCell(pctCol).value = '—';  // Not applicable - already a percentage
      } else if (item.key === 'dir_cost_stock_adj') {
        // Dir.Cost in Stock/Stock Adj.: Amount is 0, % calculated from 0/Sales = 0
        dataRow.getCell(pctCol).value = { formula: `IF(${salesAmtRef}=0,0,${amtRef}/${salesAmtRef})` };
      } else if (isPctOfSalesItem) {
        // FORMULA - recalculates when user edits Amount
        // % of Sales = Amount / Sales (so when user changes amount, % updates automatically)
        dataRow.getCell(pctCol).value = { formula: `IF(${salesAmtRef}=0,0,${amtRef}/${salesAmtRef})` };
      } else if (isCalculated) {
        // Calculated items: % = Amount / Sales (formula)
        dataRow.getCell(pctCol).value = { formula: `IF(${salesAmtRef}=0,0,${amtRef}/${salesAmtRef})` };
      } else {
        // Other input items (material, sales_volume_kg): % = Amount / Sales
        dataRow.getCell(pctCol).value = { formula: `IF(${salesAmtRef}=0,0,${amtRef}/${salesAmtRef})` };
      }
      dataRow.getCell(pctCol).numFmt = '0.00%';
      dataRow.getCell(pctCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pctBgColor } };
      dataRow.getCell(pctCol).alignment = { horizontal: 'center' };
      
      // ====== /KG COLUMN ======
      if (isVolumeItem || isPctItem) {
        dataRow.getCell(kgCol).value = '—';  // Not applicable
      } else {
        dataRow.getCell(kgCol).value = { formula: `IF(${kgAmtRef}=0,0,${amtRef}/${kgAmtRef})` };
      }
      dataRow.getCell(kgCol).numFmt = '0.00';
      dataRow.getCell(kgCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: kgBgColor } };
      dataRow.getCell(kgCol).alignment = { horizontal: 'center' };
    }
    
    // ====== YEAR TOTAL COLUMNS ======
    const totalAmtBgColor = isCalculated ? 'FFB4C6E7' : 'FFDCE6F1';  // Stronger blue for totals
    const totalPctBgColor = 'FFFFD966';  // Gold yellow
    const totalKgBgColor = isCalculated ? 'FFC6E0B4' : 'FFD9EAD3';  // Stronger green for totals
    
    // Build list of all monthly Amount column references for SUM
    const amtCols = [];
    for (let m = 1; m <= 12; m++) {
      amtCols.push(`${colLetter(getColIdx(m, 'amount'))}${rowNum}`);
    }
    const totalAmtLetter = colLetter(TOTAL_AMT_COL);
    const totalSalesRef = `${totalAmtLetter}${salesRow}`;
    const totalKgRef = `${totalAmtLetter}${kgRow}`;
    const totalCogsRef = `${totalAmtLetter}${cogsRow}`;
    const totalAmtRef = `${totalAmtLetter}${rowNum}`;
    
    // Year Total Amount
    if (isPctItem) {
      // % of COGS - recalculate from year totals
      const totalDirCostRef = `${totalAmtLetter}${rowMap.dir_cost_goods_sold}`;
      dataRow.getCell(TOTAL_AMT_COL).value = { formula: `IF(${totalCogsRef}=0,0,${totalDirCostRef}/${totalCogsRef})` };
      dataRow.getCell(TOTAL_AMT_COL).numFmt = '0.00%';
    } else {
      // Sum of all monthly amounts
      dataRow.getCell(TOTAL_AMT_COL).value = { formula: `${amtCols.join('+')}` };
      dataRow.getCell(TOTAL_AMT_COL).numFmt = '#,##0';
    }
    dataRow.getCell(TOTAL_AMT_COL).font = { bold: true };
    dataRow.getCell(TOTAL_AMT_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalAmtBgColor } };
    dataRow.getCell(TOTAL_AMT_COL).alignment = { horizontal: 'right' };
    
    // Year Total % of Sales
    if (item.key === 'sales') {
      dataRow.getCell(TOTAL_PCT_COL).value = 1;
    } else if (isPctItem) {
      dataRow.getCell(TOTAL_PCT_COL).value = '—';
    } else {
      dataRow.getCell(TOTAL_PCT_COL).value = { formula: `IF(${totalSalesRef}=0,0,${totalAmtRef}/${totalSalesRef})` };
    }
    dataRow.getCell(TOTAL_PCT_COL).numFmt = '0.00%';
    dataRow.getCell(TOTAL_PCT_COL).font = { bold: true };
    dataRow.getCell(TOTAL_PCT_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalPctBgColor } };
    dataRow.getCell(TOTAL_PCT_COL).alignment = { horizontal: 'center' };
    
    // Year Total /Kg
    if (isVolumeItem || isPctItem) {
      dataRow.getCell(TOTAL_KG_COL).value = '—';
    } else {
      dataRow.getCell(TOTAL_KG_COL).value = { formula: `IF(${totalKgRef}=0,0,${totalAmtRef}/${totalKgRef})` };
    }
    dataRow.getCell(TOTAL_KG_COL).numFmt = '0.00';
    dataRow.getCell(TOTAL_KG_COL).font = { bold: true };
    dataRow.getCell(TOTAL_KG_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalKgBgColor } };
    dataRow.getCell(TOTAL_KG_COL).alignment = { horizontal: 'center' };
  });
  
  // Add borders to all cells
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber >= 1) {
      row.eachCell({ includeEmpty: false }, (cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFB4B4B4' } },
          left: { style: 'thin', color: { argb: 'FFB4B4B4' } },
          bottom: { style: 'thin', color: { argb: 'FFB4B4B4' } },
          right: { style: 'thin', color: { argb: 'FFB4B4B4' } }
        };
      });
    }
  });
  
  // Generate filename
  const now = new Date();
  const dateStr = String(now.getDate()).padStart(2, '0') + String(now.getMonth() + 1).padStart(2, '0') + now.getFullYear();
  const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
  const filename = `BUDGET_PL_${division}_${budgetYear}_${dateStr}_${timeStr}.xlsx`;
  
  // Set response headers
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  
  // Write to response
  await workbook.xlsx.write(res);
  res.end();
}));

/**
 * POST /import-budget-pl-excel
 * Import Budget P&L from Excel file - reads % of Sls values and recalculates budget
 * 
 * @route POST /api/aebf/import-budget-pl-excel
 * @body {file} file - Excel file to import (multipart/form-data)
 * @body {string} division - Division (FP)
 * @body {number} budgetYear - Budget year
 * @returns {object} - Updated budget data
 */
router.post('/import-budget-pl-excel', asyncHandler(async (req, res) => {
  const ExcelJS = require('exceljs');
  const multer = require('multer');
  const upload = multer({ storage: multer.memoryStorage() }).single('file');
  
  // Handle file upload
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: 'File upload failed: ' + err.message });
    }
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    
    const { division, budgetYear } = req.body;
    
    if (!division || !budgetYear) {
      return res.status(400).json({ success: false, error: 'Division and budgetYear are required' });
    }
    
    logger.info(`Importing Budget P&L Excel for ${division}, budget year ${budgetYear}`);
    
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      
      // Find the Budget P&L sheet (first sheet)
      const ws = workbook.getWorksheet(1);
      if (!ws) {
        return res.status(400).json({ success: false, error: 'Excel file has no worksheets' });
      }
      
      // Items configuration
      const items = PL_LINE_ITEMS.filter(item => !item.isHelper && !item.isHidden);
      
      // Items that are simulated as % of Sales (includes morm - Margin over Material)
      // Note: 'dir_cost_stock_adj' is excluded - its % becomes Material Variance, Amount is always 0 in budget
      const PCT_OF_SALES_ITEMS = ['morm', 'labour', 'depreciation', 'electricity', 'others_mfg_overheads',
        'selling_expenses', 'transportation', 'admin_mgmt_fee_total', 'bank_interest', 'bank_charges', 
        'rd_preproduction', 'stock_provision_adj', 'bad_debts', 'other_income', 'other_provision'];
      
      // Build row mapping (Row 4+ = data rows)
      const rowMap = {};
      items.forEach((item, idx) => {
        rowMap[item.key] = 4 + idx;
      });
      
      // Column helper (same as export)
      const getColIdx = (m, subCol) => {
        const monthBase = 2 + (m - 1) * 3;
        const subOffset = subCol === 'amount' ? 0 : (subCol === 'pct' ? 1 : 2);
        return monthBase + subOffset;
      };
      
      // Helper to read cell value (handles formulas and direct values)
      const readCellValue = (rowNum, colIdx) => {
        const cell = ws.getCell(rowNum, colIdx);
        if (cell.value === null || cell.value === undefined || cell.value === '—') {
          return 0;
        }
        if (typeof cell.value === 'object' && cell.value.result !== undefined) {
          return cell.value.result || 0;
        }
        if (typeof cell.value === 'number') {
          return cell.value;
        }
        return 0;
      };
      
      // Read AMOUNT values directly from Excel for all items
      // The user edits Amount columns, and we import those values directly
      const newBudgetByMonth = {};
      
      // Items to read Amount values for
      const amountItems = ['sales', 'sales_volume_kg', 'morm', ...PCT_OF_SALES_ITEMS];
      
      for (let m = 1; m <= 12; m++) {
        newBudgetByMonth[m] = {};
        
        for (const itemKey of amountItems) {
          const rowNum = rowMap[itemKey];
          if (!rowNum) continue;
          
          const amtCol = getColIdx(m, 'amount');
          const value = readCellValue(rowNum, amtCol);
          newBudgetByMonth[m][itemKey] = value;
        }
        
        // Material = Sales - MoRM (calculated from imported values)
        const sales = newBudgetByMonth[m].sales || 0;
        const morm = newBudgetByMonth[m].morm || 0;
        newBudgetByMonth[m].material = sales - morm;
        
        // Calculate derived items for completeness
        const labour = newBudgetByMonth[m].labour || 0;
        const depreciation = newBudgetByMonth[m].depreciation || 0;
        const electricity = newBudgetByMonth[m].electricity || 0;
        const othersMfgOverheads = newBudgetByMonth[m].others_mfg_overheads || 0;
        const dirCostStockAdj = 0; // Always 0 in budget
        const material = newBudgetByMonth[m].material || 0;
        
        // Actual Direct Cost
        newBudgetByMonth[m].actual_direct_cost = labour + depreciation + electricity + othersMfgOverheads;
        
        // Dir.Cost of goods sold
        newBudgetByMonth[m].dir_cost_goods_sold = newBudgetByMonth[m].actual_direct_cost + dirCostStockAdj;
        
        // Cost of Sales
        newBudgetByMonth[m].cost_of_sales = material + newBudgetByMonth[m].dir_cost_goods_sold;
        
        // Gross Profit
        newBudgetByMonth[m].gross_profit = sales - newBudgetByMonth[m].cost_of_sales;
        
        // Gross Profit before Depreciation
        newBudgetByMonth[m].gross_profit_before_depn = newBudgetByMonth[m].gross_profit + depreciation;
        
        // Below GP expenses
        const sellingExpenses = newBudgetByMonth[m].selling_expenses || 0;
        const transportation = newBudgetByMonth[m].transportation || 0;
        const adminMgmtFee = newBudgetByMonth[m].admin_mgmt_fee_total || 0;
        const bankInterest = newBudgetByMonth[m].bank_interest || 0;
        const bankCharges = newBudgetByMonth[m].bank_charges || 0;
        const rdPreproduction = newBudgetByMonth[m].rd_preproduction || 0;
        const stockProvisionAdj = newBudgetByMonth[m].stock_provision_adj || 0;
        const badDebts = newBudgetByMonth[m].bad_debts || 0;
        const otherIncome = newBudgetByMonth[m].other_income || 0;
        const otherProvision = newBudgetByMonth[m].other_provision || 0;
        
        newBudgetByMonth[m].total_below_gp_expenses = sellingExpenses + transportation + adminMgmtFee + 
          bankInterest + bankCharges + rdPreproduction + stockProvisionAdj + badDebts + otherIncome + otherProvision;
        
        // Total Expenses
        newBudgetByMonth[m].total_expenses = newBudgetByMonth[m].actual_direct_cost + newBudgetByMonth[m].total_below_gp_expenses;
        
        // Net Profit
        newBudgetByMonth[m].net_profit = newBudgetByMonth[m].gross_profit - newBudgetByMonth[m].total_below_gp_expenses;
        
        // EBIT
        newBudgetByMonth[m].ebit = newBudgetByMonth[m].net_profit + bankInterest;
        
        // EBITDA
        newBudgetByMonth[m].ebitda = newBudgetByMonth[m].net_profit + depreciation + bankInterest + rdPreproduction + otherProvision;
        
        // Direct cost % of COGS
        newBudgetByMonth[m].direct_cost_pct_of_cogs = newBudgetByMonth[m].cost_of_sales > 0 
          ? newBudgetByMonth[m].dir_cost_goods_sold / newBudgetByMonth[m].cost_of_sales 
          : 0;
      }
      
      logger.info(`Imported Amount values for ${Object.keys(newBudgetByMonth).length} months`);
      
      // Return the imported budget data
      res.json({
        success: true,
        message: 'Excel imported successfully',
        data: {
          division,
          budgetYear: parseInt(budgetYear),
          budgetByMonth: newBudgetByMonth
        }
      });
      
    } catch (parseError) {
      logger.error('Error parsing Excel file:', parseError);
      return res.status(400).json({ success: false, error: 'Failed to parse Excel file: ' + parseError.message });
    }
  });
}));

module.exports = router;
