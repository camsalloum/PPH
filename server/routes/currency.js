/**
 * @fileoverview Currency Management Routes
 * @description API endpoints for managing currencies and exchange rates
 */

const express = require('express');
const router = express.Router();
const { authPool } = require('../database/config');
const { authenticate, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const currencyService = require('../utils/currencyService');

/**
 * GET /api/currency/list
 * Get all available currencies
 */
router.get('/list', async (req, res) => {
  try {
    const currencies = await currencyService.getCurrencies();
    res.json({
      success: true,
      currencies
    });
  } catch (error) {
    logger.error('Error fetching currencies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/currency/base
 * Get the company's base currency
 */
router.get('/base', async (req, res) => {
  try {
    const baseCurrency = await currencyService.getBaseCurrency();
    res.json({
      success: true,
      currency: baseCurrency
    });
  } catch (error) {
    logger.error('Error fetching base currency:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/currency/rate/:from/:to
 * Get exchange rate between two currencies
 * @param from - Source currency code
 * @param to - Target currency code
 * @query date - Optional date for historical rate (YYYY-MM-DD)
 */
router.get('/rate/:from/:to', async (req, res) => {
  try {
    const { from, to } = req.params;
    const { date } = req.query;
    
    const parsedDate = date ? new Date(date) : null;
    const rate = await currencyService.getExchangeRate(from, to, parsedDate);
    
    if (rate === null) {
      return res.status(404).json({
        success: false,
        error: `No exchange rate found for ${from} to ${to}`
      });
    }
    
    res.json({
      success: true,
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      rate,
      date: parsedDate || new Date(),
      inverse: 1 / rate
    });
  } catch (error) {
    logger.error('Error fetching exchange rate:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/currency/rates
 * Get all exchange rates for a base currency
 * @query base - Base currency (default: company base currency)
 */
router.get('/rates', async (req, res) => {
  try {
    const { base } = req.query;
    const baseCurrency = base || (await currencyService.getBaseCurrency()).code || 'AED';
    const currencies = await currencyService.getCurrencies();
    
    const rates = {};
    for (const curr of currencies) {
      if (curr.code !== baseCurrency) {
        // Rates are stored as: currencyCode → baseCurrency
        // So we query: getExchangeRate(curr.code, baseCurrency)
        const rate = await currencyService.getExchangeRate(curr.code, baseCurrency);
        if (rate !== null) {
          // Get the effective date for this rate
          try {
            const rateHistory = await currencyService.getExchangeRateHistory(curr.code, baseCurrency, 1);
            const effectiveDate = rateHistory && rateHistory.length > 0 && rateHistory[0].effective_date
              ? new Date(rateHistory[0].effective_date).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0];
            
            rates[curr.code] = {
              rate,
              name: curr.name,
              symbol: curr.symbol,
              effectiveDate
            };
          } catch (dateError) {
            // If we can't get the date, use today's date
            rates[curr.code] = {
              rate,
              name: curr.name,
              symbol: curr.symbol,
              effectiveDate: new Date().toISOString().split('T')[0]
            };
          }
        }
      }
    }
    
    res.json({
      success: true,
      base: baseCurrency,
      rates,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching exchange rates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/currency/rate
 * Save or update an exchange rate (Admin only)
 * @body from - Source currency
 * @body to - Target currency
 * @body rate - Exchange rate
 * @body effectiveDate - When rate becomes effective
 * @body source - Rate source (default: 'manual')
 */
router.post('/rate', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { from, to, rate, effectiveDate, source = 'manual' } = req.body;
    
    if (!from || !to || !rate || !effectiveDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: from, to, rate, effectiveDate'
      });
    }
    
    await currencyService.saveExchangeRate(
      from, 
      to, 
      parseFloat(rate), 
      new Date(effectiveDate),
      source,
      req.user.userId
    );
    
    // Also save the inverse rate
    await currencyService.saveExchangeRate(
      to,
      from,
      1 / parseFloat(rate),
      new Date(effectiveDate),
      source,
      req.user.userId
    );
    
    res.json({
      success: true,
      message: `Exchange rate saved: ${from} to ${to} = ${rate}`
    });
  } catch (error) {
    logger.error('Error saving exchange rate:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/currency/history/:from/:to
 * Get exchange rate history for a currency pair
 * @param from - Source currency
 * @param to - Target currency
 * @query limit - Max records (default: 30)
 */
router.get('/history/:from/:to', async (req, res) => {
  try {
    const { from, to } = req.params;
    const { limit = 30 } = req.query;
    
    const history = await currencyService.getExchangeRateHistory(from, to, parseInt(limit));
    
    res.json({
      success: true,
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      history
    });
  } catch (error) {
    logger.error('Error fetching rate history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/currency/convert
 * Convert an amount between currencies
 * @body amount - Amount to convert
 * @body from - Source currency
 * @body to - Target currency
 * @body date - Optional date for historical conversion
 */
router.post('/convert', async (req, res) => {
  try {
    const { amount, from, to, date } = req.body;
    
    if (amount === undefined || !from || !to) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: amount, from, to'
      });
    }
    
    const result = await currencyService.convertCurrency(
      parseFloat(amount),
      from,
      to,
      date ? new Date(date) : null
    );
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error converting currency:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/currency/add
 * Add a new currency (Admin only)
 */
router.post('/add', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { code, name, symbol, country, decimalPlaces = 2, displayOrder = 999 } = req.body;
    
    if (!code || !name || !symbol) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: code, name, symbol'
      });
    }
    
    await authPool.query(`
      INSERT INTO currencies (code, name, symbol, country, decimal_places, display_order)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (code) DO UPDATE SET
        name = $2, symbol = $3, country = $4, decimal_places = $5, 
        display_order = $6, updated_at = NOW()
    `, [code.toUpperCase(), name, symbol, country, decimalPlaces, displayOrder]);
    
    res.json({
      success: true,
      message: `Currency ${code} added/updated successfully`
    });
  } catch (error) {
    logger.error('Error adding currency:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/currency/refresh
 * Refresh exchange rates from external API (Admin only)
 * @query base - Base currency (default: company base currency)
 */
router.post('/refresh', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { base } = req.query;
    const baseCurrency = base || (await currencyService.getBaseCurrency()).code || 'AED';
    
    const majorCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR', 'SAR', 'KWD', 'QAR', 'BHD', 'OMR', 'PKR', 'EGP', 'TRY', 'CHF', 'CAD', 'AUD', 'NZD', 'SGD', 'HKD'];
    const currenciesToFetch = majorCurrencies.filter(c => c !== baseCurrency);
    
    const axios = require('axios');
    const API_KEY = process.env.EXCHANGE_RATE_API_KEY || '';
    const API_URL = process.env.EXCHANGE_RATE_API_URL || `https://api.exchangerate-api.com/v4/latest/${baseCurrency}`;
    
    let fetchedRates = {};
    
    try {
      const response = await axios.get(API_URL, {
        timeout: 15000,
        headers: API_KEY ? { 'apikey': API_KEY } : {},
        validateStatus: (status) => status >= 200 && status < 500
      });
      
      if (response.data && response.data.rates) {
        fetchedRates = response.data.rates;
        logger.info(`✅ Fetched ${Object.keys(fetchedRates).length} exchange rates from external API`);
      } else {
        logger.warn('External API returned no rates or an unexpected format.', { data: response.data });
        return res.status(response.status).json({
          success: false,
          error: response.data?.error || 'External API returned no rates or an unexpected format.'
        });
      }
    } catch (apiError) {
      logger.error('Error fetching from external API:', apiError.message);
      return res.status(500).json({
        success: false,
        error: `Could not fetch rates from external API: ${apiError.message}. Please configure EXCHANGE_RATE_API_KEY or use manual entry.`
      });
    }
    
    if (Object.keys(fetchedRates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Could not fetch rates from external API. Please configure EXCHANGE_RATE_API_KEY or use manual entry.'
      });
    }
    
    const today = new Date().toISOString().split('T')[0];
    let savedCount = 0;
    let failedCurrencies = [];
    
    for (const currencyCode of currenciesToFetch) {
      if (fetchedRates[currencyCode]) {
        const rateFromAPI = parseFloat(fetchedRates[currencyCode]);
        
        if (isNaN(rateFromAPI) || rateFromAPI === 0) {
          logger.warn(`Invalid rate received for ${currencyCode}: ${fetchedRates[currencyCode]}`);
          failedCurrencies.push(`${currencyCode} (invalid rate)`);
          continue;
        }
        
        // External API (exchangerate-api.com) returns: 1 baseCurrency = X currencyCode
        // Example: { "USD": 0.2723 } means 1 AED = 0.2723 USD
        // We need to save: currencyCode → baseCurrency
        // So: 1 USD = 1/0.2723 AED = 3.6725 AED
        const rateToSave = 1 / rateFromAPI;
        
        try {
          await currencyService.saveExchangeRate(
            currencyCode,
            baseCurrency,
            rateToSave,
            new Date(today),
            'api',
            req.user.userId
          );
          savedCount++;
        } catch (saveError) {
          logger.warn(`Failed to save rate for ${currencyCode}:`, saveError.message);
          failedCurrencies.push(`${currencyCode} (save error)`);
        }
      } else {
        failedCurrencies.push(`${currencyCode} (not in API response)`);
      }
    }
    
    let message = `Refreshed ${savedCount} exchange rates from external API.`;
    if (failedCurrencies.length > 0) {
      message += ` Failed for: ${failedCurrencies.join(', ')}.`;
    }
    
    res.json({
      success: true,
      message,
      base: baseCurrency,
      ratesUpdated: savedCount,
      failedCurrencies,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error refreshing exchange rates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
