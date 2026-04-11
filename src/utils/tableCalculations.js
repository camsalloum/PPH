/**
 * Shared Table Calculation Utilities
 * 
 * SINGLE SOURCE OF TRUTH for all table calculations used by:
 * - Live components (CustomersKgsTable, ProductGroupsKgsTable, etc.)
 * - HTML exports (SalesRepHTMLExport)
 * 
 * This ensures calculations are ALWAYS in sync between live and export.
 */

/**
 * Get the correct delta label based on column types
 * @param {Object} fromCol - The "from" column object
 * @param {Object} toCol - The "to" column object
 * @returns {string} - 'YoY', 'Vs Bgt', 'Vs Est', 'Vs Fcst', or 'Δ'
 */
export const getDeltaLabel = (fromCol, toCol) => {
  if (!fromCol || !toCol) return 'Δ';
  
  const fromType = (fromCol.type || '').toLowerCase();
  const toType = (toCol.type || '').toLowerCase();
  
  // YoY = Actual vs Actual
  if (fromType === 'actual' && toType === 'actual') {
    return 'YoY';
  }
  
  // Actual vs Budget
  if ((fromType === 'actual' && toType === 'budget') || 
      (fromType === 'budget' && toType === 'actual')) {
    return 'Vs Bgt';
  }
  
  // Actual vs Estimate
  if ((fromType === 'actual' && toType === 'estimate') || 
      (fromType === 'estimate' && toType === 'actual')) {
    return 'Vs Est';
  }
  
  // Actual vs Forecast
  if ((fromType === 'actual' && toType === 'forecast') || 
      (fromType === 'forecast' && toType === 'actual')) {
    return 'Vs Fcst';
  }
  
  // Budget vs Estimate
  if ((fromType === 'budget' && toType === 'estimate') || 
      (fromType === 'estimate' && toType === 'budget')) {
    return 'Bgt vs Est';
  }
  
  return 'Δ';
};

/**
 * Calculate delta percentage with correct financial formula
 * 
 * CRITICAL: For Actual vs Budget/Estimate/Forecast comparisons:
 * Always calculate as (Actual - Reference) / Reference
 * This ensures correct sign (negative when under budget)
 * 
 * @param {number} fromValue - Value from the "from" column
 * @param {number} toValue - Value from the "to" column  
 * @param {string} fromType - Type of "from" column ('Actual', 'Budget', 'Estimate', 'Forecast')
 * @param {string} toType - Type of "to" column
 * @returns {Object} - { arrow, value, color, rawDelta }
 */
export const calculateDelta = (fromValue, toValue, fromType, toType) => {
  if (typeof fromValue !== 'number' || typeof toValue !== 'number') {
    return { arrow: '➖', value: '-', color: '#6b7280', rawDelta: 0 };
  }
  
  // Normalize types
  const normalizedFromType = (fromType || '').toLowerCase();
  const normalizedToType = (toType || '').toLowerCase();
  
  // Determine which value is "Actual" and which is "Reference" (Budget/Estimate/Forecast)
  const isFromActual = normalizedFromType === 'actual';
  const isToActual = normalizedToType === 'actual';
  const isFromReference = ['budget', 'estimate', 'forecast'].includes(normalizedFromType);
  const isToReference = ['budget', 'estimate', 'forecast'].includes(normalizedToType);
  
  let actualValue, referenceValue;
  
  if (isFromActual && isToReference) {
    // Columns: [Actual] → [Budget/Est/Fcst]
    // fromValue is Actual, toValue is Reference
    actualValue = fromValue;
    referenceValue = toValue;
  } else if (isFromReference && isToActual) {
    // Columns: [Budget/Est/Fcst] → [Actual]
    // fromValue is Reference, toValue is Actual
    actualValue = toValue;
    referenceValue = fromValue;
  } else {
    // YoY (Actual vs Actual) or other comparisons
    // Standard formula: (newer - older) / older
    // toValue is "newer", fromValue is "older"
    actualValue = toValue;
    referenceValue = fromValue;
  }
  
  // Handle zero reference (NEW indicator)
  if (referenceValue === 0) {
    if (actualValue > 0) {
      return { arrow: '🆕', value: 'NEW', color: '#059669', rawDelta: 100 };
    }
    return { arrow: '➖', value: '—', color: '#6b7280', rawDelta: 0 };
  }
  
  // Calculate percentage
  const delta = ((actualValue - referenceValue) / Math.abs(referenceValue)) * 100;
  const absDelta = Math.abs(delta);
  
  // Determine arrow and color
  let arrow, color;
  if (delta > 0) {
    arrow = '▲';
    color = '#059669'; // Green
  } else if (delta < 0) {
    arrow = '▼';
    color = '#dc2626'; // Red
  } else {
    arrow = '➖';
    color = '#6b7280'; // Gray
  }
  
  // Format value
  let formattedValue;
  if (absDelta >= 999.9) {
    formattedValue = '999+%';
  } else if (absDelta >= 99.99) {
    formattedValue = Math.round(absDelta) + '%';
  } else if (absDelta >= 10) {
    formattedValue = absDelta.toFixed(1) + '%';
  } else {
    formattedValue = absDelta.toFixed(2) + '%';
  }
  
  return { arrow, value: formattedValue, color, rawDelta: delta };
};

/**
 * Build extended columns array with delta columns between data columns
 * @param {Array} columnOrder - Array of column objects
 * @returns {Array} - Extended columns with delta columns inserted
 */
export const buildExtendedColumns = (columnOrder) => {
  if (!columnOrder || columnOrder.length === 0) return [];
  
  const extendedColumns = [];
  
  for (let i = 0; i < columnOrder.length; i++) {
    const col = columnOrder[i];
    
    // Add data column
    extendedColumns.push({
      ...col,
      columnType: 'data',
      dataIndex: i
    });
    
    // Add delta column between consecutive data columns
    if (i < columnOrder.length - 1) {
      const fromCol = columnOrder[i];
      const toCol = columnOrder[i + 1];
      extendedColumns.push({
        columnType: 'delta',
        fromDataIndex: i,
        toDataIndex: i + 1,
        fromColumn: fromCol,
        toColumn: toCol,
        fromType: fromCol.type,
        toType: toCol.type,
        deltaLabel: getDeltaLabel(fromCol, toCol)
      });
    }
  }
  
  return extendedColumns;
};

/**
 * Format value in MT (Metric Tons)
 * @param {number} value - Value in KG
 * @returns {string} - Formatted MT value
 */
export const formatMT = (value) => {
  if (typeof value !== 'number') return '-';
  if (value === 0) return '0.0';
  
  const mtValue = value / 1000;
  
  if (mtValue < 1) {
    return mtValue.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
  
  return mtValue.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
};

/**
 * Format currency amount with K/M suffixes
 * @param {number} value - Currency value
 * @returns {string} - Formatted currency string
 */
export const formatCurrencyShort = (value) => {
  if (typeof value !== 'number') return '-';
  if (value === 0) return '0';
  
  const absValue = Math.abs(value);
  
  if (absValue >= 1000000) {
    return (value / 1000000).toFixed(1) + 'M';
  }
  if (absValue >= 1000) {
    return (value / 1000).toFixed(1) + 'K';
  }
  
  return value.toFixed(0);
};

/**
 * Convert text to Proper Case (Xxxx Xxxx)
 * @param {string} str - Input string
 * @returns {string} - Proper cased string
 */
export const toProperCase = (str) => {
  if (!str) return '';
  return str.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
};
