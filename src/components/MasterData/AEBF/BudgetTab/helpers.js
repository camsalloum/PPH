/**
 * Budget Tab - Shared Helper Functions
 * Utility functions used across BudgetTab components
 */

/**
 * Format number as MT (Metric Tonnes)
 * @param {number} value - Value in KGS
 * @returns {string} Formatted MT string
 */
export const formatMT = (value) => {
  const mt = (Number(value) || 0) / 1000;
  if (Math.abs(mt) >= 1000) {
    return `${(mt / 1000).toFixed(1)}k MT`;
  }
  return `${mt.toFixed(1)} MT`;
};

/**
 * Format number as AED currency
 * @param {number} value - Amount value
 * @returns {string} Formatted AED string
 */
export const formatAed = (value) => {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(2)}M`;
  } else if (Math.abs(n) >= 1_000) {
    return `${(n / 1_000).toFixed(1)}k`;
  }
  return n.toFixed(0);
};

/**
 * Format sales rep name for display
 * @param {string} name - Raw sales rep name
 * @returns {string} Formatted name
 */
export const formatSalesRepLabel = (name = '') => {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Month name mapping for search
 */
export const MONTH_MAP = {
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

/**
 * Month short names array
 */
export const MONTH_SHORT_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Full month names array
 */
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Parse numeric value from string (handles commas, whitespace)
 * @param {string|number} value - Value to parse
 * @returns {number} Parsed number
 */
export const parseNumericValue = (value) => {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  return parseFloat(String(value).replace(/,/g, '').trim()) || 0;
};

/**
 * Generate unique key for budget data storage
 * @param {object} row - Row data with customer, country, productGroup
 * @param {number} month - Month number (1-12)
 * @returns {string} Unique key
 */
export const generateBudgetKey = (row, month) => {
  if (row.id && row.isCustom) {
    return `custom_${row.id}_${month}`;
  }
  return `${row.customer}|${row.country}|${row.productGroup}|${month}`;
};

/**
 * Format number with thousand separators
 * @param {number} value - Number to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted string
 */
export const formatNumber = (value, decimals = 0) => {
  const n = Number(value) || 0;
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

/**
 * Calculate percentage change
 * @param {number} current - Current value
 * @param {number} previous - Previous/base value
 * @returns {number} Percentage change
 */
export const calculatePercentChange = (current, previous) => {
  if (!previous || previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
};

/**
 * Check if admin user (placeholder)
 * TODO: Replace with proper user role system
 */
export const IS_ADMIN = true;

/**
 * Message keys for import notifications
 */
export const DIVISIONAL_IMPORT_MESSAGE_KEY = 'divisionalHtmlImport';
export const SALES_REP_IMPORT_MESSAGE_KEY = 'salesRepHtmlImport';
