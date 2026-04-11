import React from 'react';
import UAEDirhamSymbol from '../dashboard/UAEDirhamSymbol';

/**
 * CurrencySymbol Component
 * Renders the appropriate currency symbol - uses SVG for AED, text for others
 * 
 * IMPORTANT: This component inherits font-size and color from its parent by default.
 * The SVG uses em units and fill="currentColor" so it scales and colors automatically.
 * Only pass style overrides when you need to deviate from the parent's styling.
 * 
 * @param {string} code - Currency code (e.g., 'AED', 'USD', 'EUR')
 * @param {string} symbol - Text symbol to display (fallback for non-AED currencies)
 * @param {object} style - Custom styles (optional - inherits from parent by default)
 * @param {string} className - Additional CSS classes
 */

// Hardcoded reliable currency symbols
const CURRENCY_SYMBOLS = {
  'AED': 'AED', // Will use SVG
  'USD': '$',
  'EUR': '€',
  'GBP': '£',
  'SAR': '﷼',
  'KWD': 'د.ك',
  'QAR': '﷼',
  'BHD': '.د.ب',
  'OMR': '﷼',
  'JOD': 'د.ا',
  'LBP': 'ل.ل',
  'SYP': '£S',
  'IQD': 'ع.د',
  'YER': '﷼',
  'ILS': '₪',
  'IRR': '﷼',
  'TRY': '₺',
  'CHF': 'CHF',
  'JPY': '¥',
  'CNY': '¥',
  'INR': '₹',
  'PKR': '₨',
  'BDT': '৳',
  'LKR': 'Rs',
  'NPR': '₨',
  'AUD': 'A$',
  'NZD': 'NZ$',
  'SGD': 'S$',
  'HKD': 'HK$',
  'MYR': 'RM',
  'THB': '฿',
  'IDR': 'Rp',
  'PHP': '₱',
  'VND': '₫',
  'KRW': '₩',
  'TWD': 'NT$',
  'CAD': 'C$',
  'MXN': '$',
  'BRL': 'R$',
  'ARS': '$',
  'CLP': '$',
  'COP': '$',
  'PEN': 'S/',
  'SEK': 'kr',
  'NOK': 'kr',
  'DKK': 'kr',
  'PLN': 'zł',
  'CZK': 'Kč',
  'HUF': 'Ft',
  'RON': 'lei',
  'RUB': '₽',
  'UAH': '₴',
  'EGP': 'E£',
  'ZAR': 'R',
  'NGN': '₦',
  'KES': 'KSh',
  'GHS': 'GH₵',
  'MAD': 'د.م.',
  'TND': 'د.ت',
  'DZD': 'د.ج',
  'LYD': 'ل.د',
  'SDG': 'ج.س.',
  'ETB': 'Br',
  'TZS': 'TSh',
  'UGX': 'USh',
  'RWF': 'FRw',
  'XOF': 'CFA',
  'XAF': 'FCFA',
  'AOA': 'Kz',
  'MZN': 'MT',
  'ZMW': 'ZK',
  'BWP': 'P',
  'MUR': '₨'
};

const CurrencySymbol = ({ 
  code = 'AED', 
  symbol, 
  size,
  style = {}, 
  className = ''
}) => {
  // Normalize code to uppercase
  const normalizedCode = (code || 'AED').toUpperCase().trim();
  
  // For AED, always use the SVG
  // SVG uses fill="currentColor" and em units - inherits color and scales with font-size
  if (normalizedCode === 'AED') {
    return (
      <UAEDirhamSymbol 
        className={className}
        style={{ ...(size ? { fontSize: size } : {}), ...style }}  // Let it inherit, only override if explicitly passed
      />
    );
  }
  
  // For other currencies, use text symbol
  // Inherits font-size, color, font-weight from parent automatically
  const displaySymbol = symbol || CURRENCY_SYMBOLS[normalizedCode] || normalizedCode;
  
  return (
    <span 
      className={`currency-symbol ${className}`}
      style={{ 
        // Inherit all text properties from parent
        fontSize: 'inherit',
        fontWeight: 'inherit',
        color: 'inherit',
        lineHeight: 'inherit',
        ...(size ? { fontSize: size } : {}),
        ...style 
      }}
    >
      {displaySymbol}
    </span>
  );
};

/**
 * Helper function to get the symbol for a currency code
 * Returns the SVG component for AED, text symbol for others
 */
export const getCurrencySymbolElement = (code, options = {}) => {
  return <CurrencySymbol code={code} {...options} />;
};

/**
 * Helper function to get text symbol (for non-React contexts)
 * Returns 'AED' for UAE Dirham (since SVG can't be represented as text)
 */
export const getCurrencySymbolText = (code) => {
  return CURRENCY_SYMBOLS[code] || code;
};

/**
 * Check if a currency code should use SVG symbol
 */
export const usesSVGSymbol = (code) => {
  return code === 'AED';
};

export { CURRENCY_SYMBOLS };
export default CurrencySymbol;
