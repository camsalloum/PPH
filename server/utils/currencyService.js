/**
 * @fileoverview Currency Service for Multi-Currency Support
 * @description Provides exchange rate lookups, currency conversions, and currency utilities
 * 
 * FUTURE-READY FEATURES:
 * - Exchange rate management (manual + API integration ready)
 * - Multi-currency budget reporting
 * - Historical rate tracking
 * - Currency conversion utilities
 */

const { authPool } = require('../database/config');
const logger = require('./logger');

/**
 * Default currencies mapping (fallback when DB not available)
 */
const DEFAULT_CURRENCIES = {
  AED: { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', country: 'United Arab Emirates' },
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', country: 'United States' },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', country: 'European Union' },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '£', country: 'United Kingdom' },
  SAR: { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', country: 'Saudi Arabia' },
  KWD: { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'د.ك', country: 'Kuwait' },
  QAR: { code: 'QAR', name: 'Qatari Riyal', symbol: '﷼', country: 'Qatar' },
  INR: { code: 'INR', name: 'Indian Rupee', symbol: '₹', country: 'India' },
};

/**
 * Fixed exchange rates (AED is base, rates as of 2025)
 * These are used as fallback when DB rates not available
 */
const DEFAULT_RATES = {
  'AED-USD': 0.272294,  // AED to USD (fixed peg)
  'USD-AED': 3.6725,    // USD to AED
  'AED-EUR': 0.251,
  'EUR-AED': 3.984,
  'AED-GBP': 0.215,
  'GBP-AED': 4.651,
  'AED-SAR': 1.0204,
  'SAR-AED': 0.98,
  'AED-KWD': 0.0835,
  'KWD-AED': 11.976,
  'AED-INR': 22.73,
  'INR-AED': 0.044,
};

/**
 * Get all active currencies from database
 * @returns {Promise<Array>} List of currency objects
 */
async function getCurrencies() {
  try {
    const result = await authPool.query(`
      SELECT code, name, symbol, country, decimal_places, is_active, display_order
      FROM currencies
      WHERE is_active = true
      ORDER BY display_order, code
    `);
    return result.rows;
  } catch (error) {
    logger.warn('Could not fetch currencies from DB, using defaults:', error.message);
    return Object.values(DEFAULT_CURRENCIES);
  }
}

/**
 * Get a specific currency by code
 * @param {string} code - Currency code (e.g., 'AED', 'USD')
 * @returns {Promise<object|null>} Currency object or null
 */
async function getCurrency(code) {
  if (!code) return null;
  
  try {
    const result = await authPool.query(`
      SELECT code, name, symbol, country, decimal_places
      FROM currencies
      WHERE code = $1
    `, [code.toUpperCase()]);
    
    return result.rows[0] || DEFAULT_CURRENCIES[code.toUpperCase()] || null;
  } catch (error) {
    logger.warn(`Could not fetch currency ${code} from DB:`, error.message);
    return DEFAULT_CURRENCIES[code.toUpperCase()] || null;
  }
}

/**
 * Get exchange rate between two currencies
 * @param {string} fromCurrency - Source currency code
 * @param {string} toCurrency - Target currency code
 * @param {Date} [date] - Optional date for historical rate (defaults to latest)
 * @returns {Promise<number>} Exchange rate (multiply from by rate to get to)
 */
async function getExchangeRate(fromCurrency, toCurrency, date = null) {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  
  // Same currency = rate of 1
  if (from === to) return 1.0;
  
  try {
    let query, params;
    
    if (date) {
      // Get rate effective on specific date
      query = `
        SELECT rate FROM exchange_rates
        WHERE from_currency = $1 AND to_currency = $2
          AND effective_date <= $3
        ORDER BY effective_date DESC
        LIMIT 1
      `;
      params = [from, to, date];
    } else {
      // Get latest rate
      query = `
        SELECT rate FROM exchange_rates
        WHERE from_currency = $1 AND to_currency = $2
        ORDER BY effective_date DESC
        LIMIT 1
      `;
      params = [from, to];
    }
    
    const result = await authPool.query(query, params);
    
    if (result.rows.length > 0) {
      return parseFloat(result.rows[0].rate);
    }
    
    // Try reverse rate
    const reverseQuery = date ? 
      `SELECT rate FROM exchange_rates WHERE from_currency = $1 AND to_currency = $2 AND effective_date <= $3 ORDER BY effective_date DESC LIMIT 1` :
      `SELECT rate FROM exchange_rates WHERE from_currency = $1 AND to_currency = $2 ORDER BY effective_date DESC LIMIT 1`;
    
    const reverseResult = await authPool.query(reverseQuery, date ? [to, from, date] : [to, from]);
    
    if (reverseResult.rows.length > 0) {
      return 1.0 / parseFloat(reverseResult.rows[0].rate);
    }
    
    // Fallback to default rates
    const key = `${from}-${to}`;
    if (DEFAULT_RATES[key]) {
      return DEFAULT_RATES[key];
    }
    
    // Try reverse default rate
    const reverseKey = `${to}-${from}`;
    if (DEFAULT_RATES[reverseKey]) {
      return 1.0 / DEFAULT_RATES[reverseKey];
    }
    
    logger.warn(`No exchange rate found for ${from} to ${to}`);
    return null;
  } catch (error) {
    logger.error('Error fetching exchange rate:', error.message);
    
    // Use default rates as fallback
    const key = `${from}-${to}`;
    return DEFAULT_RATES[key] || null;
  }
}

/**
 * Convert amount from one currency to another
 * @param {number} amount - Amount to convert
 * @param {string} fromCurrency - Source currency code
 * @param {string} toCurrency - Target currency code
 * @param {Date} [date] - Optional date for historical conversion
 * @returns {Promise<object>} Conversion result with amount and rate used
 */
async function convertCurrency(amount, fromCurrency, toCurrency, date = null) {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return { amount: 0, rate: 1, fromCurrency, toCurrency };
  }
  
  const rate = await getExchangeRate(fromCurrency, toCurrency, date);
  
  if (rate === null) {
    throw new Error(`No exchange rate available for ${fromCurrency} to ${toCurrency}`);
  }
  
  return {
    originalAmount: amount,
    convertedAmount: amount * rate,
    rate,
    fromCurrency: fromCurrency.toUpperCase(),
    toCurrency: toCurrency.toUpperCase(),
    date: date || new Date()
  };
}

/**
 * Save or update an exchange rate
 * @param {string} fromCurrency - Source currency
 * @param {string} toCurrency - Target currency
 * @param {number} rate - Exchange rate
 * @param {Date} effectiveDate - When rate becomes effective
 * @param {string} source - Rate source ('manual', 'api', etc.)
 * @param {number} userId - User making the change
 */
async function saveExchangeRate(fromCurrency, toCurrency, rate, effectiveDate, source = 'manual', userId = null) {
  try {
    await authPool.query(`
      INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_date, source, created_by, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (from_currency, to_currency, effective_date)
      DO UPDATE SET rate = $3, source = $5, updated_at = NOW()
    `, [fromCurrency.toUpperCase(), toCurrency.toUpperCase(), rate, effectiveDate, source, userId]);
    
    logger.info(`Exchange rate saved: ${fromCurrency} to ${toCurrency} = ${rate} (effective ${effectiveDate})`);
    return true;
  } catch (error) {
    logger.error('Error saving exchange rate:', error.message);
    throw error;
  }
}

/**
 * Get exchange rate history for a currency pair
 * @param {string} fromCurrency - Source currency
 * @param {string} toCurrency - Target currency
 * @param {number} limit - Max records to return
 * @returns {Promise<Array>} Rate history
 */
async function getExchangeRateHistory(fromCurrency, toCurrency, limit = 30) {
  try {
    const result = await authPool.query(`
      SELECT rate, effective_date, source, created_at
      FROM exchange_rates
      WHERE from_currency = $1 AND to_currency = $2
      ORDER BY effective_date DESC
      LIMIT $3
    `, [fromCurrency.toUpperCase(), toCurrency.toUpperCase(), limit]);
    
    return result.rows;
  } catch (error) {
    logger.error('Error fetching rate history:', error.message);
    return [];
  }
}

/**
 * Get company's base currency from settings
 * @returns {Promise<object>} Base currency object
 */
async function getBaseCurrency() {
  try {
    const result = await authPool.query(`
      SELECT setting_value FROM company_settings
      WHERE setting_key = 'company_currency'
    `);
    
    if (result.rows.length > 0) {
      const currency = JSON.parse(result.rows[0].setting_value);
      return currency;
    }
    
    // Default to AED
    return DEFAULT_CURRENCIES.AED;
  } catch (error) {
    logger.warn('Could not fetch base currency, defaulting to AED:', error.message);
    return DEFAULT_CURRENCIES.AED;
  }
}

/**
 * Convert budget data to a specific currency for reporting
 * @param {Array} budgetData - Array of budget records
 * @param {string} targetCurrency - Currency to convert to
 * @param {string} sourceCurrency - Original currency (default: from each record or base)
 * @returns {Promise<Array>} Budget data with converted amounts
 */
async function convertBudgetDataToCurrency(budgetData, targetCurrency, sourceCurrency = null) {
  if (!budgetData || budgetData.length === 0) return budgetData;
  
  const baseCurrency = sourceCurrency || (await getBaseCurrency()).code || 'AED';
  
  // Get conversion rate once (assuming all data is in same currency)
  const rate = await getExchangeRate(baseCurrency, targetCurrency);
  
  if (rate === null) {
    throw new Error(`Cannot convert budget data: no rate for ${baseCurrency} to ${targetCurrency}`);
  }
  
  return budgetData.map(record => ({
    ...record,
    // Convert value fields
    value: record.value ? record.value * rate : record.value,
    amount: record.amount ? record.amount * rate : record.amount,
    morm: record.morm ? record.morm * rate : record.morm,
    // Keep original values
    original_value: record.value,
    original_amount: record.amount,
    original_morm: record.morm,
    // Add conversion metadata
    original_currency: baseCurrency,
    converted_currency: targetCurrency,
    conversion_rate: rate
  }));
}

/**
 * Format amount with currency symbol
 * @param {number} amount - Amount to format
 * @param {string} currencyCode - Currency code
 * @param {object} options - Formatting options
 * @returns {string} Formatted amount with symbol
 */
function formatCurrencyAmount(amount, currencyCode, options = {}) {
  const { decimals = 2, abbreviated = false, showCode = false } = options;
  const currency = DEFAULT_CURRENCIES[currencyCode] || { symbol: currencyCode };
  
  let value = amount || 0;
  let suffix = '';
  
  if (abbreviated) {
    if (Math.abs(value) >= 1000000000) {
      value = value / 1000000000;
      suffix = 'B';
    } else if (Math.abs(value) >= 1000000) {
      value = value / 1000000;
      suffix = 'M';
    } else if (Math.abs(value) >= 1000) {
      value = value / 1000;
      suffix = 'K';
    }
  }
  
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }) + suffix;
  
  return showCode ? 
    `${currency.symbol}${formatted} ${currencyCode}` :
    `${currency.symbol}${formatted}`;
}

module.exports = {
  // Currency lookups
  getCurrencies,
  getCurrency,
  getBaseCurrency,
  
  // Exchange rates
  getExchangeRate,
  saveExchangeRate,
  getExchangeRateHistory,
  
  // Conversions
  convertCurrency,
  convertBudgetDataToCurrency,
  formatCurrencyAmount,
  
  // Constants
  DEFAULT_CURRENCIES,
  DEFAULT_RATES
};
