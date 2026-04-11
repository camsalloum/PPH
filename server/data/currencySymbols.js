/**
 * Currency Symbols - Centralized currency symbol definitions
 * 
 * This module provides SVG and text-based currency symbols for use
 * in both server-side HTML generation and frontend components.
 * 
 * @module data/currencySymbols
 */

/**
 * UAE Dirham (AED) SVG Path Data
 * ViewBox: 0 0 344.84 299.91
 */
const UAE_DIRHAM_PATH = 'M342.14,140.96l2.7,2.54v-7.72c0-17-11.92-30.84-26.56-30.84h-23.41C278.49,36.7,222.69,0,139.68,0c-52.86,0-59.65,0-109.71,0,0,0,15.03,12.63,15.03,52.4v52.58h-27.68c-5.38,0-10.43-2.08-14.61-6.01l-2.7-2.54v7.72c0,17.01,11.92,30.84,26.56,30.84h18.44s0,29.99,0,29.99h-27.68c-5.38,0-10.43-2.07-14.61-6.01l-2.7-2.54v7.71c0,17,11.92,30.82,26.56,30.82h18.44s0,54.89,0,54.89c0,38.65-15.03,50.06-15.03,50.06h109.71c85.62,0,139.64-36.96,155.38-104.98h32.46c5.38,0,10.43,2.07,14.61,6l2.7,2.54v-7.71c0-17-11.92-30.83-26.56-30.83h-18.9c.32-4.88.49-9.87.49-15s-.18-10.11-.51-14.99h28.17c5.37,0,10.43,2.07,14.61,6.01ZM89.96,15.01h45.86c61.7,0,97.44,27.33,108.1,89.94l-153.96.02V15.01ZM136.21,284.93h-46.26v-89.98l153.87-.02c-9.97,56.66-42.07,88.38-107.61,90ZM247.34,149.96c0,5.13-.11,10.13-.34,14.99l-157.04.02v-29.99l157.05-.02c.22,4.84.33,9.83.33,15Z';

/**
 * UAE Dirham SVG ViewBox dimensions
 */
const UAE_DIRHAM_VIEWBOX = '0 0 344.84 299.91';

/**
 * Get UAE Dirham as inline SVG HTML string
 * @param {object} options - Styling options
 * @param {string} options.width - Width (default: '1em')
 * @param {string} options.height - Height (default: '1em')
 * @param {string} options.marginRight - Right margin (default: '0.2em')
 * @param {string} options.verticalAlign - Vertical alignment (default: '-0.1em')
 * @param {string} options.fill - Fill color (default: 'currentColor')
 * @returns {string} Inline SVG HTML string
 */
function getUAEDirhamSVG(options = {}) {
  const {
    width = '1em',
    height = '1em',
    marginRight = '0.2em',
    verticalAlign = '-0.1em',
    fill = 'currentColor'
  } = options;
  
  return `<svg class="uae-dirham-symbol" viewBox="${UAE_DIRHAM_VIEWBOX}" xmlns="http://www.w3.org/2000/svg" fill="${fill}" style="display: inline-block; vertical-align: ${verticalAlign}; width: ${width}; height: ${height}; margin-right: ${marginRight};"><path d="${UAE_DIRHAM_PATH}"/></svg>`;
}

/**
 * Get UAE Dirham as a compact inline SVG (for tight spaces)
 * @returns {string} Inline SVG HTML string with smaller margins
 */
function getUAEDirhamSVGCompact() {
  return getUAEDirhamSVG({ marginRight: '0.1em' });
}

/**
 * Get UAE Dirham as a larger SVG (for headers/titles)
 * @returns {string} Inline SVG HTML string with larger size
 */
function getUAEDirhamSVGLarge() {
  return getUAEDirhamSVG({ width: '1.2em', height: '1.2em', marginRight: '0.3em' });
}

/**
 * Currency symbols mapping by code
 * For non-AED currencies, use text symbols
 */
const CURRENCY_SYMBOLS = {
  'AED': { symbol: 'د.إ', name: 'UAE Dirham', useSVG: true },
  'USD': { symbol: '$', name: 'US Dollar', useSVG: false },
  'EUR': { symbol: '€', name: 'Euro', useSVG: false },
  'GBP': { symbol: '£', name: 'British Pound', useSVG: false },
  'SAR': { symbol: '﷼', name: 'Saudi Riyal', useSVG: false },
  'KWD': { symbol: 'د.ك', name: 'Kuwaiti Dinar', useSVG: false },
  'QAR': { symbol: '﷼', name: 'Qatari Riyal', useSVG: false },
  'BHD': { symbol: '.د.ب', name: 'Bahraini Dinar', useSVG: false },
  'OMR': { symbol: '﷼', name: 'Omani Rial', useSVG: false },
  'JOD': { symbol: 'د.ا', name: 'Jordanian Dinar', useSVG: false },
  'LBP': { symbol: 'ل.ل', name: 'Lebanese Pound', useSVG: false },
  'IQD': { symbol: 'ع.د', name: 'Iraqi Dinar', useSVG: false },
  'TRY': { symbol: '₺', name: 'Turkish Lira', useSVG: false },
  'CHF': { symbol: 'CHF', name: 'Swiss Franc', useSVG: false },
  'JPY': { symbol: '¥', name: 'Japanese Yen', useSVG: false },
  'CNY': { symbol: '¥', name: 'Chinese Yuan', useSVG: false },
  'INR': { symbol: '₹', name: 'Indian Rupee', useSVG: false },
  'PKR': { symbol: '₨', name: 'Pakistani Rupee', useSVG: false },
  'AUD': { symbol: 'A$', name: 'Australian Dollar', useSVG: false },
  'NZD': { symbol: 'NZ$', name: 'New Zealand Dollar', useSVG: false },
  'SGD': { symbol: 'S$', name: 'Singapore Dollar', useSVG: false },
  'HKD': { symbol: 'HK$', name: 'Hong Kong Dollar', useSVG: false },
  'MYR': { symbol: 'RM', name: 'Malaysian Ringgit', useSVG: false },
  'THB': { symbol: '฿', name: 'Thai Baht', useSVG: false },
  'IDR': { symbol: 'Rp', name: 'Indonesian Rupiah', useSVG: false },
  'PHP': { symbol: '₱', name: 'Philippine Peso', useSVG: false },
  'VND': { symbol: '₫', name: 'Vietnamese Dong', useSVG: false },
  'KRW': { symbol: '₩', name: 'South Korean Won', useSVG: false },
  'TWD': { symbol: 'NT$', name: 'New Taiwan Dollar', useSVG: false },
  'CAD': { symbol: 'C$', name: 'Canadian Dollar', useSVG: false },
  'MXN': { symbol: '$', name: 'Mexican Peso', useSVG: false },
  'BRL': { symbol: 'R$', name: 'Brazilian Real', useSVG: false },
  'ZAR': { symbol: 'R', name: 'South African Rand', useSVG: false },
  'EGP': { symbol: 'E£', name: 'Egyptian Pound', useSVG: false },
  'NGN': { symbol: '₦', name: 'Nigerian Naira', useSVG: false }
};

/**
 * Get currency symbol HTML based on currency code
 * Uses SVG for AED, text for other currencies
 * 
 * @param {string|object} currency - Currency code (e.g., 'AED') or currency object with code property
 * @param {object} options - Styling options for SVG
 * @returns {string} HTML string for currency symbol
 */
function getCurrencySymbolHtml(currency, options = {}) {
  // Handle both string code and object with code property
  const code = typeof currency === 'string' ? currency : (currency?.code || 'AED');
  const upperCode = code.toUpperCase();
  
  // For AED, use the SVG
  if (upperCode === 'AED') {
    return getUAEDirhamSVG(options);
  }
  
  // For other currencies, use text symbol
  const currencyInfo = CURRENCY_SYMBOLS[upperCode];
  const symbol = currencyInfo?.symbol || currency?.symbol || code;
  
  const marginRight = options.marginRight || '0.15em';
  return `<span style="font-weight: inherit; margin-right: ${marginRight};">${symbol}</span>`;
}

/**
 * Get CSS styles for UAE Dirham SVG symbol
 * Include this in your HTML <style> section
 * @returns {string} CSS styles
 */
function getUAEDirhamCSS() {
  return `
.uae-dirham-symbol {
  display: inline-block;
  vertical-align: -0.1em;
  width: 1em;
  height: 1em;
  fill: currentColor;
}
.uae-dirham-symbol.small {
  width: 0.9em;
  height: 0.9em;
}
.uae-dirham-symbol.large {
  width: 1.2em;
  height: 1.2em;
}
`;
}

module.exports = {
  // SVG Data
  UAE_DIRHAM_PATH,
  UAE_DIRHAM_VIEWBOX,
  
  // SVG Generators
  getUAEDirhamSVG,
  getUAEDirhamSVGCompact,
  getUAEDirhamSVGLarge,
  
  // Currency mapping
  CURRENCY_SYMBOLS,
  
  // Universal currency symbol getter
  getCurrencySymbolHtml,
  
  // CSS helper
  getUAEDirhamCSS
};
