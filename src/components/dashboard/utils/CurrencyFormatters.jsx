import React from 'react';
import CurrencySymbol from '../CurrencySymbol';

/**
 * Format currency with symbol for display
 * Uses dynamic CurrencySymbol component that respects company currency setting
 * @param {number} value - The numeric value to format
 * @param {Object} options - Formatting options
 * @param {number} options.dp - Decimal places (default: 2)
 * @param {boolean} options.useSymbol - Whether to use symbol (default: true)
 * @returns {JSX.Element} Formatted currency with symbol
 */
export const formatAEDSymbol = (value, options = {}) => {
  const { dp = 2, useSymbol = true } = options;
  
  if (value == null || isNaN(value)) {
    return (
      <>
        {useSymbol && <CurrencySymbol />}
        0.00
      </>
    );
  }
  
  const formatted = value.toFixed(dp);
  return (
    <>
      {useSymbol && <CurrencySymbol />}
      {formatted}
    </>
  );
};

/**
 * Format currency per kg with symbol
 * Uses dynamic CurrencySymbol component that respects company currency setting
 * @param {number} value - The numeric value to format
 * @param {Object} options - Formatting options
 * @param {number} options.dp - Decimal places (default: 2)
 * @param {boolean} options.useSymbol - Whether to use symbol (default: true)
 * @returns {JSX.Element} Formatted currency per kg with symbol
 */
export const formatAEDPerKg = (value, options = {}) => {
  const { dp = 2, useSymbol = true } = options;
  
  if (value == null || isNaN(value)) {
    return (
      <>
        {useSymbol && <CurrencySymbol />}
        0.00/kg
      </>
    );
  }
  
  const formatted = value.toFixed(dp);
  return (
    <>
      {useSymbol && <CurrencySymbol />}
      {formatted}/kg
    </>
  );
};

/**
 * Format large currency values with M/K suffixes
 * Uses dynamic CurrencySymbol component that respects company currency setting
 * @param {number} value - The numeric value to format
 * @param {Object} options - Formatting options
 * @param {boolean} options.useSymbol - Whether to use symbol (default: true)
 * @returns {JSX.Element} Formatted currency with M/K suffixes
 */
export const formatAEDLarge = (value, options = {}) => {
  const { useSymbol = true } = options;
  
  if (value == null || isNaN(value)) {
    return (
      <>
        {useSymbol && <CurrencySymbol />}
        0.00M
      </>
    );
  }
  
  let formatted;
  if (Math.abs(value) >= 1000000) {
    formatted = (value / 1000000).toFixed(2) + 'M';
  } else if (Math.abs(value) >= 1000) {
    formatted = (value / 1000).toFixed(2) + 'K';
  } else {
    formatted = value.toFixed(2);
  }
  
  return (
    <>
      {useSymbol && <CurrencySymbol />}
      {formatted}
    </>
  );
};
