/**
 * Period Helper Utilities
 * Shared utilities for converting period configurations to month arrays
 */

/**
 * Month name to number mapping
 */
const MONTH_MAP = {
  'January': 1, 'February': 2, 'March': 3, 'April': 4,
  'May': 5, 'June': 6, 'July': 7, 'August': 8,
  'September': 9, 'October': 10, 'November': 11, 'December': 12
};

/**
 * Quarter to months mapping
 */
const QUARTER_MAP = {
  'Q1': [1, 2, 3],
  'Q2': [4, 5, 6],
  'Q3': [7, 8, 9],
  'Q4': [10, 11, 12]
};

/**
 * Half-year to months mapping
 */
const HALF_YEAR_MAP = {
  'HY1': [1, 2, 3, 4, 5, 6],
  'HY2': [7, 8, 9, 10, 11, 12]
};

/**
 * Full year months array
 */
const FULL_YEAR_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * Convert a column/period configuration to an array of month numbers
 * @param {Object} column - Column configuration object with year, month, type properties
 * @returns {Array<number>} Array of month numbers (1-12)
 */
export function convertPeriodToMonths(column) {
  if (!column) return [1];
  
  // If months array is already provided, use it
  if (column.months && Array.isArray(column.months)) {
    return column.months;
  }
  
  // Handle quarter periods
  if (QUARTER_MAP[column.month]) {
    return QUARTER_MAP[column.month];
  }
  
  // Handle half-year periods
  if (HALF_YEAR_MAP[column.month]) {
    return HALF_YEAR_MAP[column.month];
  }
  
  // Handle full year
  if (column.month === 'Year' || column.month === 'FY') {
    return FULL_YEAR_MONTHS;
  }
  
  // Handle month names
  if (MONTH_MAP[column.month]) {
    return [MONTH_MAP[column.month]];
  }
  
  // Handle numeric month (if somehow passed as number)
  if (typeof column.month === 'number' && column.month >= 1 && column.month <= 12) {
    return [column.month];
  }
  
  // Default fallback
  console.warn(`Unable to convert period to months:`, column);
  return [1];
}

/**
 * Format custom range display names from internal format to user-friendly format
 * Converts "CUSTOM_JANUARY_FEBRUARY_MARCH..." to "Jan-Mar"
 * @param {string} displayName - The raw display name
 * @returns {string} Formatted display name
 */
export function formatCustomRangeDisplay(displayName) {
  if (!displayName) return '';
  
  // Remove "CUSTOM_" prefix if present
  let cleanName = displayName.replace(/^CUSTOM_/i, '');
  
  // Split by underscore and get month names
  const parts = cleanName.split('_');
  
  // If it's a simple month list, create abbreviated range
  if (parts.length > 2 && parts.every(p => /^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)$/i.test(p))) {
    const monthAbbr = {
      'JANUARY': 'Jan', 'FEBRUARY': 'Feb', 'MARCH': 'Mar', 'APRIL': 'Apr',
      'MAY': 'May', 'JUNE': 'Jun', 'JULY': 'Jul', 'AUGUST': 'Aug',
      'SEPTEMBER': 'Sep', 'OCTOBER': 'Oct', 'NOVEMBER': 'Nov', 'DECEMBER': 'Dec'
    };
    
    const firstMonth = monthAbbr[parts[0].toUpperCase()] || parts[0];
    const lastMonth = monthAbbr[parts[parts.length - 1].toUpperCase()] || parts[parts.length - 1];
    
    return `${firstMonth}-${lastMonth}`;
  }
  
  // Otherwise, just return cleaned up version
  return cleanName.replace(/_/g, ' ');
}

/**
 * Format a period for display (with custom range support)
 * @param {Object} column - Column configuration object
 * @returns {string} Formatted period name
 */
export function formatPeriodDisplay(column) {
  if (!column) return '';
  
  const parts = [];
  
  if (column.year) {
    parts.push(column.year);
  }
  
  if (column.isCustomRange && column.displayName) {
    parts.push(formatCustomRangeDisplay(column.displayName));
  } else if (column.month) {
    parts.push(column.month);
  }
  
  if (column.type) {
    parts.push(column.type);
  }
  
  return parts.join(' ');
}

/**
 * Get a unique key for a period/column
 * @param {Object} column - Column configuration object
 * @returns {string} Unique key
 */
export function getPeriodKey(column) {
  if (!column) return 'unknown';
  
  // Use column.id if available (from standard configs)
  if (column.id) {
    return column.id;
  }
  
  // Otherwise construct a key
  return `${column.year}-${column.month}-${column.type}`;
}

/**
 * Validate if a period configuration is valid
 * @param {Object} column - Column configuration object
 * @returns {boolean} True if valid
 */
export function isValidPeriod(column) {
  if (!column || typeof column !== 'object') return false;
  
  // Must have year
  if (!column.year || typeof column.year !== 'number') return false;
  
  // Must have month or months array
  if (!column.month && !column.months) return false;
  
  // Must have type
  if (!column.type) return false;
  
  return true;
}




















