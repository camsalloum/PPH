/**
 * P&L Data Transform Utility
 * Transforms database records back to Excel-like 2D array format
 * that computeCellValue() expects
 * 
 * IMPORTANT: Only INPUT fields are stored in the database.
 * All calculated fields (blue rows in Excel) are computed by the API.
 */

// Mapping of database column names to Excel row indices
// Includes both stored (input) fields and calculated fields from the API
const DB_COLUMN_TO_ROW = {
  // INPUT fields (stored in database)
  sales: 3,
  material: 5,
  sales_volume_kg: 7,
  production_volume_kg: 8,
  labour: 9,
  depreciation: 10,
  electricity: 12,
  others_mfg_overheads: 13,
  dir_cost_stock_adj: 15,
  dir_cost_sewa: 17,
  sales_manpower_cost: 24,
  sales_incentive: 25,
  sales_office_rent: 26,
  sales_travel: 27,
  advt_promotion: 28,
  other_selling_expenses: 29,
  transportation: 32,
  admin_manpower_cost: 34,
  telephone_fax: 35,
  other_admin_cost: 37,
  // Note: Row 38 (Administration) = Admin Manpower + Telephone/Fax (CALCULATED)
  // Note: Row 40 (Admin & Mgmt Fee) = Other Admin + Administration (CALCULATED)
  bank_interest: 42,
  bank_charges: 43,
  rd_preproduction: 44,
  stock_provision_adj: 48,
  bad_debts: 49,
  other_income: 50,
  other_provision: 51,
  
  // CALCULATED fields (computed by API, not stored in DB)
  cost_of_sales: 4,              // Material + Dir.Cost of goods sold
  material_pct_of_sales: 6,      // Material / Sales * 100
  actual_direct_cost: 14,        // Labour + Depreciation + Electricity + Others Mfg
  dir_cost_goods_sold: 16,       // Actual Direct Cost + Dir.Cost Stock Adj
  direct_cost_pct_of_cogs: 18,   // Dir.Cost Goods Sold / Cost of Sales * 100
  gross_profit: 19,              // Sales - Cost of Sales
  gross_profit_pct: 20,          // Gross Profit / Sales * 100
  gross_profit_before_depn: 21,  // Gross Profit + Depreciation
  gross_profit_before_depn_pct: 22, // GP Before Depn / Sales * 100
  selling_expenses: 31,          // Sum of rows 24-29
  administration: 38,            // Admin Manpower + Telephone/Fax
  admin_mgmt_fee_total: 40,      // Other Admin + Administration (Excel Row 41)
  total_finance_cost: 46,        // Bank Interest + Bank Charges + R&D Pre-production
  total_below_gp_expenses: 52,   // Selling + Transport + Admin&MgmtFee + Finance + Provisions
  net_profit: 54,                // Gross Profit - Total Below GP Expenses
  net_profit_pct: 55,            // Net Profit / Sales * 100
  ebitda: 56,                    // Net Profit + Depreciation + Bank Interest + R&D + Other Provision
  ebitda_pct: 57,                // EBITDA / Sales * 100
  total_expenses: 59,            // Cost of Sales + Total Below GP Expenses
  total_expenses_per_kg: 60      // Total Expenses / Production Volume
  // Note: EBIT and EBIT % are calculated but not mapped to a specific row (used in reports only)
};

// Row labels from Excel (first column)
// These are the labels that appear in column 0 of the Excel data
const ROW_LABELS = {
  0: 'Year',
  1: 'Month',
  2: 'Type',
  3: 'Sales',
  4: 'Cost of Sales',
  5: 'Material',
  6: 'Material cost as % of Sales',
  7: 'Sales volume (kg)',
  8: 'Production volume (kg)',
  9: 'Labour',
  10: 'Depreciation',
  11: '', // Empty row
  12: 'Electricity',
  13: 'Others Mfg. overheads',
  14: 'Actual Direct Cost Spent',
  15: 'Dir.Cost in Stock/Stock Adj.',
  16: 'Dir.Cost of goods sold',
  17: 'Dir.Cost of goods sold (SEWA)',
  18: 'Direct cost as % of C.O.G.S',
  19: 'Gross profit (after Depn.)',
  20: 'Gross profit (after Depn.) %',
  21: 'Gross profit (before Depn.)',
  22: 'Gross profit (before Depn.) %',
  23: '', // Empty row
  24: 'Sales ManpowerCost',
  25: 'Sales Man Incentive',
  26: 'Sales Office Rent',
  27: 'Sales Travel and AirFare',
  28: 'Advt / Exbn / Other Promotion',
  29: 'Other Selling Expenses',
  30: '', // Empty row
  31: 'Selling expenses',
  32: 'Transportation',
  33: '', // Empty row
  34: 'Administration Man Power Cost',
  35: 'Telephone / Fax',
  36: '', // Empty row
  37: 'Other Administration Cost',
  38: 'Administration',
  39: '', // Empty row
  40: 'Administration & Management Fee',
  41: '', // Empty row
  42: 'Bank interest',
  43: 'Bank charges',
  44: 'R & D, pre-production w/o',
  45: '', // Empty row
  46: 'Total FinanceCost & Amortization',
  47: '', // Empty row
  48: 'Adj to Stock Prov.-Divn/Stock Valuation',
  49: 'Bad debts',
  50: 'Other Income',
  51: 'Other Provision',
  52: 'Total Below GP Expenses',
  53: '', // Empty row
  54: 'Net Profit',
  55: 'Net Profit %',
  56: 'EBITDA',
  57: 'EBITDA %',
  58: '', // Empty row
  59: 'Total Expenses',
  60: 'Total Expenses /Kg'
};

/**
 * Transform database records to Excel-like 2D array
 * The Excel format has:
 * - Row 0: Years (e.g., [null, 2024, 2024, 2025, ...])
 * - Row 1: Months (e.g., [null, 'January', 'February', ...])
 * - Row 2: Types (e.g., [null, 'Actual', 'Actual', 'Budget', ...])
 * - Row 3+: Data rows (e.g., [label, value1, value2, ...])
 * 
 * @param {Array} dbRecords - Array of database records
 * @returns {Array} - 2D array in Excel format
 */
export function transformDbToExcelFormat(dbRecords) {
  if (!dbRecords || dbRecords.length === 0) {
    return [];
  }

  // Sort records for consistent column order: by year, month (as they appear in calendar), type
  const monthOrder = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const typeOrder = ['Actual', 'Estimate', 'Budget'];
  
  const sortedRecords = [...dbRecords].sort((a, b) => {
    // Sort by year first
    if (a.year !== b.year) return a.year - b.year;
    // Then by month
    const monthA = monthOrder.indexOf(a.month);
    const monthB = monthOrder.indexOf(b.month);
    if (monthA !== monthB) return monthA - monthB;
    // Then by type
    const typeA = typeOrder.indexOf(a.data_type);
    const typeB = typeOrder.indexOf(b.data_type);
    return typeA - typeB;
  });

  // Initialize result array with enough rows (at least 61 rows for all P&L data)
  const maxRow = 61;
  const result = Array.from({ length: maxRow }, () => []);

  // Column 0: Labels
  for (let row = 0; row < maxRow; row++) {
    result[row][0] = ROW_LABELS[row] || '';
  }

  // Each database record becomes a column
  sortedRecords.forEach((record, colIndex) => {
    const col = colIndex + 1; // Column 0 is labels
    
    // Header rows
    result[0][col] = record.year;
    result[1][col] = record.month;
    result[2][col] = record.data_type;
    
    // Data rows - map database columns to row indices
    for (const [columnName, rowIndex] of Object.entries(DB_COLUMN_TO_ROW)) {
      if (record[columnName] !== undefined && record[columnName] !== null) {
        result[rowIndex][col] = record[columnName];
      } else {
        result[rowIndex][col] = 0;
      }
    }
    
    // Initialize empty rows with 0
    for (let row = 3; row < maxRow; row++) {
      if (result[row][col] === undefined) {
        result[row][col] = 0;
      }
    }
    
    // All calculated fields (blue rows in Excel) are now pre-computed by the API
    // No need to recalculate here - they're already included in DB_COLUMN_TO_ROW mapping
  });

  return result;
}

/**
 * Get the inverse mapping (row index to db column name)
 * @returns {Object} - Map of row index to column name
 */
export function getRowToColumnMap() {
  const result = {};
  for (const [columnName, rowIndex] of Object.entries(DB_COLUMN_TO_ROW)) {
    result[rowIndex] = columnName;
  }
  return result;
}

/**
 * Get list of stored row indices
 * @returns {Array} - Array of row indices that are stored in database
 */
export function getStoredRowIndices() {
  return Object.values(DB_COLUMN_TO_ROW);
}

export { DB_COLUMN_TO_ROW, ROW_LABELS };
