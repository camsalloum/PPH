/**
 * Data Validator for Financial Data
 * 
 * This utility provides validation functions for financial data to ensure
 * data integrity and prevent calculation errors.
 */

/**
 * Validates if a value is a valid number
 * @param {any} value - The value to validate
 * @returns {boolean} True if valid number, false otherwise
 */
export const isValidNumber = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return !isNaN(value) && isFinite(value);
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/,/g, ''));
    return !isNaN(parsed) && isFinite(parsed);
  }
  return false;
};

/**
 * Validates if a value is a valid positive number
 * @param {any} value - The value to validate
 * @returns {boolean} True if valid positive number, false otherwise
 */
export const isValidPositiveNumber = (value) => {
  if (!isValidNumber(value)) return false;
  const num = typeof value === 'number' ? value : parseFloat(value.replace(/,/g, ''));
  return num >= 0;
};

/**
 * Validates if a column object has required properties
 * @param {Object} column - The column object to validate
 * @returns {boolean} True if valid column, false otherwise
 */
export const isValidColumn = (column) => {
  if (!column || typeof column !== 'object') return false;
  return typeof column.year === 'number' && 
         typeof column.type === 'string' && 
         column.type.length > 0;
};

/**
 * Validates if a row index is valid
 * @param {any} rowIndex - The row index to validate
 * @returns {boolean} True if valid row index, false otherwise
 */
export const isValidRowIndex = (rowIndex) => {
  return typeof rowIndex === 'number' && 
         rowIndex >= 0 && 
         rowIndex < 1000; // Reasonable upper limit
};

/**
 * Validates financial data structure
 * @param {Array} divisionData - The division data array to validate
 * @returns {Object} Validation result with isValid flag and errors array
 */
export const validateFinancialData = (divisionData) => {
  const errors = [];
  
  if (!Array.isArray(divisionData)) {
    errors.push('Division data must be an array');
    return { isValid: false, errors };
  }
  
  if (divisionData.length === 0) {
    errors.push('Division data cannot be empty');
    return { isValid: false, errors };
  }
  
  // Check if required rows exist
  const requiredRows = [3, 4, 5, 7, 8]; // Sales, Cost of Sales, Material, Sales Volume, Production Volume
  requiredRows.forEach(rowIndex => {
    if (!divisionData[rowIndex] || !Array.isArray(divisionData[rowIndex])) {
      errors.push(`Required row ${rowIndex} is missing or invalid`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validates column order array
 * @param {Array} columnOrder - The column order array to validate
 * @returns {Object} Validation result with isValid flag and errors array
 */
export const validateColumnOrder = (columnOrder) => {
  const errors = [];
  
  if (!Array.isArray(columnOrder)) {
    errors.push('Column order must be an array');
    return { isValid: false, errors };
  }
  
  if (columnOrder.length === 0) {
    errors.push('Column order cannot be empty');
    return { isValid: false, errors };
  }
  
  columnOrder.forEach((column, index) => {
    if (!isValidColumn(column)) {
      errors.push(`Column at index ${index} is invalid`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validates calculation inputs
 * @param {Object} inputs - The calculation inputs to validate
 * @param {Array} requiredFields - Array of required field names
 * @returns {Object} Validation result with isValid flag and errors array
 */
export const validateCalculationInputs = (inputs, requiredFields = []) => {
  const errors = [];
  
  if (!inputs || typeof inputs !== 'object') {
    errors.push('Calculation inputs must be an object');
    return { isValid: false, errors };
  }
  
  requiredFields.forEach(field => {
    if (!(field in inputs)) {
      errors.push(`Required field '${field}' is missing`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Safe division function that prevents division by zero
 * @param {number} numerator - The numerator
 * @param {number} denominator - The denominator
 * @param {number} defaultValue - Default value if division by zero (default: 0)
 * @returns {number} Result of division or default value
 */
export const safeDivide = (numerator, denominator, defaultValue = 0) => {
  if (!isValidNumber(numerator) || !isValidNumber(denominator)) {
    return defaultValue;
  }
  
  const num = typeof numerator === 'number' ? numerator : parseFloat(numerator.replace(/,/g, ''));
  const den = typeof denominator === 'number' ? denominator : parseFloat(denominator.replace(/,/g, ''));
  
  if (den === 0) {
    return defaultValue;
  }
  
  return num / den;
};

/**
 * Safe percentage calculation
 * @param {number} value - The value to calculate percentage for
 * @param {number} total - The total value
 * @param {number} defaultValue - Default value if calculation fails (default: 0)
 * @returns {number} Percentage value
 */
export const safePercentage = (value, total, defaultValue = 0) => {
  const result = safeDivide(value, total, defaultValue);
  return result * 100;
};

/**
 * Data Validator Class
 * Main class for comprehensive data validation
 */
export class DataValidator {
  
  /**
   * Validates all inputs for P&L table calculations
   * @param {Object} inputs - All calculation inputs
   * @returns {Object} Comprehensive validation result
   */
  static validatePLInputs(inputs) {
    const errors = [];
    const warnings = [];
    
    // Validate basic structure
    if (!inputs || typeof inputs !== 'object') {
      errors.push('Inputs must be an object');
      return { isValid: false, errors, warnings };
    }
    
    // Validate division data
    if (inputs.divisionData) {
      const dataValidation = validateFinancialData(inputs.divisionData);
      if (!dataValidation.isValid) {
        errors.push(...dataValidation.errors);
      }
    }
    
    // Validate column order
    if (inputs.columnOrder) {
      const columnValidation = validateColumnOrder(inputs.columnOrder);
      if (!columnValidation.isValid) {
        errors.push(...columnValidation.errors);
      }
    }
    
    // Validate individual values
    if (inputs.values) {
      Object.entries(inputs.values).forEach(([key, value]) => {
        if (!isValidNumber(value) && value !== '' && value !== null) {
          warnings.push(`Value for '${key}' may not be a valid number: ${value}`);
        }
      });
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Validates formula calculation inputs
   * @param {string} formulaType - The formula type
   * @param {Object} values - The values for calculation
   * @returns {Object} Validation result
   */
  static validateFormulaInputs(formulaType, values) {
    const errors = [];
    
    if (!formulaType || typeof formulaType !== 'string') {
      errors.push('Formula type must be a non-empty string');
    }
    
    if (!values || typeof values !== 'object') {
      errors.push('Values must be an object');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export default DataValidator;




















