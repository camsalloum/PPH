/**
 * Analytics Routes
 * Handles geographic distribution, customer insights, and advanced analytics
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { validateDivision } = require('../database/DynamicDivisionConfig');
const GeographicDistributionService = require('../database/GeographicDistributionService');
const CustomerInsightsService = require('../database/CustomerInsightsService');
const UniversalSalesByCountryService = require('../database/UniversalSalesByCountryService');

const pool = require('../database/config');

// POST /geographic-distribution - Get geographic distribution data
router.post('/geographic-distribution', async (req, res) => {
  try {
    const { division = 'FP', year, months, type = 'Actual', includeComparison = false } = req.body;
    
    if (!year || !months || !Array.isArray(months)) {
      return res.status(400).json({
        success: false,
        error: 'year and months (array) are required'
      });
    }
    
    logger.info('Getting geographic distribution', { division, year, months, type, includeComparison });
    
    const yearNumber = parseInt(year);
    if (isNaN(yearNumber) || yearNumber < 2020 || yearNumber > 2035) {
      return res.status(400).json({
        success: false,
        error: `Invalid year: ${year}. Year must be between 2020 and 2035.`
      });
    }
    
    if (!Array.isArray(months) || months.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Months must be a non-empty array'
      });
    }
    
    const geographicService = new GeographicDistributionService(division);
    const data = await geographicService.getGeographicDistributionData({
      division,
      year: yearNumber,
      months,
      type,
      includeComparison
    });
    
    logger.info('Geographic distribution retrieved', {
      totalSales: data.totalSales,
      countries: data.countrySales?.length || 0
    });
    
    res.json({
      success: true,
      data,
      meta: {
        division,
        year,
        months,
        type,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('Error getting geographic distribution', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve geographic distribution data',
      message: error.message
    });
  }
});

// POST /customer-insights-db - Get customer insights with merge rules
router.post('/customer-insights-db', async (req, res) => {
  try {
    const { division = 'FP', year, months, type = 'Actual' } = req.body;
    
    if (!year || !months || !Array.isArray(months) || months.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'year and months (array) are required'
      });
    }
    
    logger.info('Getting customer insights', { division, year, months, type });
    
    validateDivision(division);
    
    const insights = await CustomerInsightsService.getCustomerInsights(division, year, months, type);
    
    logger.info('Customer insights retrieved', {
      totalCustomers: insights.totalCustomers,
      topCustomer: insights.topCustomer
    });
    
    res.json({
      success: true,
      data: insights,
      meta: {
        division,
        year,
        months,
        type,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('Error getting customer insights', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve customer insights data',
      message: error.message
    });
  }
});

// GET /all-countries - Get all countries from master data
router.get('/all-countries', async (req, res) => {
  const client = await pool.connect();
  try {
    logger.info('Fetching all countries from master data');

    const query = `
      SELECT DISTINCT country
      FROM fp_sales_data
      WHERE country IS NOT NULL AND country != ''
      ORDER BY country ASC
    `;

    const result = await client.query(query);
    const countries = result.rows.map(row => row.country);

    logger.info('All countries retrieved', { count: countries.length });

    res.json({
      success: true,
      data: countries
    });

  } catch (error) {
    logger.error('Error fetching all countries', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve countries',
      message: error.message
    });
  } finally {
    client.release();
  }
});

// POST /country-sales-data-db - Get country sales data for specific period
router.post('/country-sales-data-db', async (req, res) => {
  try {
    const { division, country, year, months, dataType = 'Actual', valueType = 'KGS' } = req.body;
    
    if (!division || !country || !year || !months) {
      return res.status(400).json({
        success: false,
        error: 'division, country, year, and months are required'
      });
    }
    
    logger.info('Getting country sales data', { division, country, year, months, dataType, valueType });
    
    validateDivision(division);
    
    const salesData = await UniversalSalesByCountryService.getCountrySalesData(
      division, country, year, months, dataType, valueType
    );
    
    logger.info('Country sales data retrieved', { salesData });
    
    res.json({
      success: true,
      data: salesData
    });
    
  } catch (error) {
    logger.error('Error getting country sales data', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve country sales data',
      message: error.message
    });
  }
});

// POST /customer-sales-data-db - Get customer sales data
router.post('/customer-sales-data-db', async (req, res) => {
  try {
    const { division, customer, year, months, dataType = 'Actual', valueType = 'AMOUNT' } = req.body;
    
    if (!division || !customer || !year || !months) {
      return res.status(400).json({
        success: false,
        error: 'division, customer, year, and months are required'
      });
    }
    
    logger.info('Getting customer sales data', { division, customer, year, months, dataType, valueType });
    
    validateDivision(division);
    
    const salesData = await UniversalSalesByCountryService.getCustomerSalesData(
      division, customer, year, months, dataType, valueType
    );
    
    logger.info('Customer sales data retrieved', { salesData });
    
    res.json({
      success: true,
      data: salesData
    });
    
  } catch (error) {
    logger.error('Error getting customer sales data', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve customer sales data',
      message: error.message
    });
  }
});

// GET /customer-sales-rep-mapping - Get customer to sales rep mapping
router.get('/customer-sales-rep-mapping', async (req, res) => {
  try {
    const { division, customer } = req.query;
    
    if (!division || !customer) {
      return res.status(400).json({
        success: false,
        error: 'division and customer parameters are required'
      });
    }
    
    logger.info('Getting customer sales rep mapping', { division, customer });
    
    validateDivision(division);
    
    const mapping = await UniversalSalesByCountryService.getCustomerSalesRepMapping(division, customer);
    
    logger.info('Customer sales rep mapping retrieved', { mapping });
    
    res.json({
      success: true,
      data: mapping
    });
    
  } catch (error) {
    logger.error('Error getting customer sales rep mapping', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve customer sales rep mapping',
      message: error.message
    });
  }
});

module.exports = router;
