/**
 * P&L Row Mapping Configuration
 * Maps Excel row indices to database column names
 * 
 * Excel Structure:
 * - Row 0: Year headers
 * - Row 1: Month headers  
 * - Row 2: Type headers (Actual/Estimate/Budget)
 * - Row 3+: Data rows
 * 
 * IMPORTANT: Only INPUT fields are stored in the database.
 * All calculated fields (blue rows in Excel) are computed by the API.
 */

// Input fields ONLY - these are stored in the database
// NO calculated fields should be in this mapping
const PL_ROW_MAPPING = {
  // Row index -> database column name (0-indexed, Excel is 1-indexed)
  // Excel Row N = Array index N-1
  3: 'sales',                    // Excel Row 4
  5: 'material',                 // Excel Row 6
  7: 'sales_volume_kg',          // Excel Row 8
  8: 'production_volume_kg',     // Excel Row 9
  9: 'labour',                   // Excel Row 10
  10: 'depreciation',            // Excel Row 11
  12: 'electricity',             // Excel Row 13
  13: 'others_mfg_overheads',    // Excel Row 14
  15: 'dir_cost_stock_adj',      // Excel Row 16
  17: 'dir_cost_sewa',           // Excel Row 18
  24: 'sales_manpower_cost',     // Excel Row 25
  25: 'sales_incentive',         // Excel Row 26
  26: 'sales_office_rent',       // Excel Row 27
  27: 'sales_travel',            // Excel Row 28
  28: 'advt_promotion',          // Excel Row 29
  29: 'other_selling_expenses',  // Excel Row 30
  32: 'transportation',          // Excel Row 33
  34: 'admin_manpower_cost',     // Excel Row 35
  35: 'telephone_fax',           // Excel Row 36
  37: 'other_admin_cost',        // Excel Row 38
  // Override fields: Budget data has values directly in calculated rows
  // These are imported but calculation takes precedence if > 0
  31: 'selling_expenses_override',    // Excel Row 32 - Budget has total here
  38: 'administration_override',      // Excel Row 39 - Budget has total here  
  40: 'admin_mgmt_fee_override',      // Excel Row 41 - Budget has total here
  42: 'bank_interest',           // Excel Row 43
  43: 'bank_charges',            // Excel Row 44
  44: 'rd_preproduction',        // Excel Row 45
  48: 'stock_provision_adj',     // Excel Row 49
  49: 'bad_debts',               // Excel Row 50
  50: 'other_income',            // Excel Row 51
  51: 'other_provision'          // Excel Row 52
};

// Calculated fields - computed by API, NOT stored in database
// All "blue" rows from Excel are calculated from the input fields above
const PL_CALCULATED_FIELDS = {
  4: 'cost_of_sales',              // Material + Dir.Cost of goods sold
  6: 'material_pct_of_sales',      // Material / Sales * 100
  14: 'actual_direct_cost',        // Labour + Depreciation + Electricity + Others Mfg
  16: 'dir_cost_goods_sold',       // Actual Direct Cost + Dir.Cost Stock Adj
  18: 'direct_cost_pct_of_cogs',   // Dir.Cost Goods Sold / Cost of Sales * 100
  19: 'gross_profit',              // Sales - Cost of Sales
  20: 'gross_profit_pct',          // Gross Profit / Sales * 100
  21: 'gross_profit_before_depn',  // Gross Profit + Depreciation
  22: 'gross_profit_before_depn_pct', // GP Before Depn / Sales * 100
  31: 'selling_expenses',          // Sum of rows 24-29
  38: 'administration',            // Admin Manpower + Telephone + Other Admin + Admin Mgmt Fee
  46: 'total_finance_cost',        // Bank Interest + Bank Charges + R&D Pre-production
  52: 'total_below_gp_expenses',   // Selling + Transport + Admin + Finance + Stock Prov + Bad Debts + Other Income + Other Provision
  54: 'net_profit',                // Gross Profit - Total Below GP Expenses  
  55: 'net_profit_pct',            // Net Profit / Sales * 100
  // EBIT = Net Profit + Bank Interest (Earnings Before Interest and Taxes)
  // Note: This is row index for display purposes, actual calc is Net Profit + Bank Interest
  'ebit': 'ebit',                  // Net Profit + Bank Interest
  'ebit_pct': 'ebit_pct',          // EBIT / Sales * 100
  56: 'ebitda',                    // Net Profit + Depreciation + Bank Interest + Bank Charges
  57: 'ebitda_pct',                // EBITDA / Sales * 100
  59: 'total_expenses',            // Cost of Sales + Total Below GP Expenses
  60: 'total_expenses_per_kg'      // Total Expenses / Production Volume
};

// Row labels for display/debugging
const PL_ROW_LABELS = {
  3: 'Sales',
  4: 'Cost of Sales',
  5: 'Material',
  6: 'Material cost as % of Sales',
  7: 'Sales volume (kg)',
  8: 'Production volume (kg)',
  9: 'Labour',
  10: 'Depreciation',
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
  24: 'Sales ManpowerCost',
  25: 'Sales Man Incentive',
  26: 'Sales Office Rent',
  27: 'Sales Travel and AirFare',
  28: 'Advt / Exbn / Other Promotion',
  29: 'Other Selling Expenses',
  31: 'Selling expenses',
  32: 'Transportation',
  34: 'Administration Man Power Cost',
  35: 'Telephone / Fax',
  37: 'Other Administration Cost',
  38: 'Administration',
  40: 'Administration & Management Fee',
  42: 'Bank interest',
  43: 'Bank charges',
  44: 'R & D, pre-production w/o',
  46: 'Total FinanceCost & Amortization',
  48: 'Adj to Stock Prov.-Divn/Stock Valuation',
  49: 'Bad debts',
  50: 'Other Income',
  51: 'Other Provision',
  52: 'Total Below GP Expenses',
  54: 'Net Profit',
  55: 'Net Profit %',
  56: 'EBITDA',
  57: 'EBITDA %',
  59: 'Total Expenses',
  60: 'Total Expenses /Kg'
};

// Get list of input column names (for INSERT statements)
const getInputColumns = () => Object.values(PL_ROW_MAPPING);

// Get row index from column name
const getRowIndexByColumn = (columnName) => {
  for (const [rowIndex, colName] of Object.entries(PL_ROW_MAPPING)) {
    if (colName === columnName) return parseInt(rowIndex);
  }
  return null;
};

module.exports = {
  PL_ROW_MAPPING,
  PL_CALCULATED_FIELDS,
  PL_ROW_LABELS,
  getInputColumns,
  getRowIndexByColumn
};
