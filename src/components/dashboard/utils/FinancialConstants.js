/**
 * Financial Constants for P&L Table
 * 
 * This file contains all the row indices and formula constants used in the financial table.
 * Centralizing these values improves maintainability and reduces magic numbers.
 */

// Row indices for financial data
export const FINANCIAL_ROWS = {
  SALES: 3,
  COST_OF_SALES: 4,
  MATERIAL: 5,
  SALES_VOLUME: 7,
  PRODUCTION_VOLUME: 8,
  ROW_9: 9,
  ROW_10: 10,
  ROW_12: 12,
  ROW_13: 13,
  ROW_15: 15,
  ROW_31: 31,
  ROW_32: 32,
  ROW_40: 40,
  ROW_42: 42,
  ROW_43: 43,
  ROW_44: 44,
  ROW_49: 49,
  ROW_50: 50,
  ROW_51: 51,
  ROW_54: 54,
  ROW_56: 56
};

// Formula identifiers
export const FORMULA_TYPES = {
  SALES_MINUS_MATERIAL: 'sales-material',
  SALES_MINUS_COST_OF_SALES: 'sales-cost-of-sales',
  SUM_9_10_12_13: 'sum9-10-12-13',
  SUM_14_15: 'sum14-15',
  PERCENT_16_4: 'percent16-4',
  CALC_19_3_4: 'calc19-3-4',
  CALC_21_19_10: 'calc21-19-10',
  SUM_31_TO_51: 'sum-31-32-40-42-43-44-49-50-51',
  SUM_14_52: 'sum-14-52',
  SUM_54_10_42_44_51: 'sum-54-10-42-44-51',
  SUM_54_42: 'sum-54-42',
  // New formulas based on actual P&L structure
  DIRECT_COST_OF_GOODS_SOLD: 'direct-cost-of-goods-sold',
  DIRECT_COST_PERCENT_OF_COGS: 'direct-cost-percent-of-cogs',
  GROSS_PROFIT_BEFORE_DEPN: 'gross-profit-before-depn',
  TOTAL_EXPENSES: 'total-expenses',
  NET_PROFIT: 'net-profit',
  EBIT: 'ebit',
  EBITDA: 'ebitda'
};

// Row labels for dynamic display
export const ROW_LABELS = {
  SALES: 'Sales',
  SALES_VOLUME: 'Sales volume (kg)',
  PRODUCTION_VOLUME: 'Production volume (kg)',
  COST_OF_SALES: 'Cost of Sales',
  MATERIAL: 'Material',
  MARGIN_OVER_MATERIAL: 'Margin over Material',
  ROW_14_SUM: 'Row 14 (Sum)',
  ROW_16_SUM: 'Row 16 (Sum)',
  ROW_18_PERCENT: 'Row 18 (%)',
  ROW_19_CALC: 'Row 19 (Sales-Material)',
  ROW_21_CALC: 'Row 21 (Row19+Row10)',
  ROW_52_SUM: 'Row 52 (Sum)',
  ROW_59_SUM: 'Row 59 (Row14+Row52)',
  ROW_54_CALC: 'Row 54 (Row19-Row52)',
  EBIT: 'EBIT',
  EBITDA: 'Row 56 (EBITDA)'
};

// Color schemes for columns - includes gradient for 135-degree diagonal effect
export const COLOR_SCHEMES = [
  { name: 'blue', label: 'Blue', primary: '#288cfa', secondary: '#103766', light: '#E3F2FD', isDark: true, gradientFrom: '#3b82f6', gradientTo: '#1e40af' },
  { name: 'green', label: 'Green', primary: '#2E865F', secondary: '#C6F4D6', light: '#E8F5E9', isDark: true, gradientFrom: '#059669', gradientTo: '#047857' },
  { name: 'yellow', label: 'Yellow', primary: '#FFD700', secondary: '#FFFDE7', light: '#FFFDE7', isDark: false, gradientFrom: '#fbbf24', gradientTo: '#d97706' },
  { name: 'orange', label: 'Orange', primary: '#FF6B35', secondary: '#FFE0B2', light: '#FFF3E0', isDark: false, gradientFrom: '#f97316', gradientTo: '#ea580c' },
  { name: 'boldContrast', label: 'Bold Contrast', primary: '#003366', secondary: '#E6EEF5', light: '#E6EEF5', isDark: true, gradientFrom: '#1e3a5f', gradientTo: '#0f172a' }
];

// Default column colors based on month/type
export const DEFAULT_COLORS = {
  QUARTER: { backgroundColor: '#FF6B35', color: '#000000' },
  JANUARY: { backgroundColor: '#FFD700', color: '#000000' },
  YEAR: { backgroundColor: '#288cfa', color: '#FFFFFF' },
  BUDGET: { backgroundColor: '#2E865F', color: '#FFFFFF' },
  DEFAULT: { backgroundColor: '#288cfa', color: '#FFFFFF' }
};

// Default cell background colors
export const DEFAULT_CELL_COLORS = {
  QUARTER: '#FFF3E0',
  JANUARY: '#FFFDE7',
  YEAR: '#E3F2FD',
  BUDGET: '#E8F5E9',
  DEFAULT: '#E3F2FD'
};
