/**
 * FP Performance & Budget Routes
 * Handles FP-specific performance metrics, budgets, and country data
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const fpDataService = require('../database/FPDataService');
const productPerformanceService = require('../database/ProductPerformanceService');
const UniversalSalesByCountryService = require('../database/UniversalSalesByCountryService');

// Use cached sales rep config instead of reading file on every request
const { loadSalesRepConfig } = require('../utils/salesRepConfigCache');

// POST /yearly-budget - Get yearly budget total
router.post('/yearly-budget', async (req, res) => {
  try {
    const { salesRep, year, valuesType } = req.body;
    
    if (!salesRep || !year || !valuesType) {
      return res.status(400).json({ 
        success: false, 
        error: 'salesRep, year, and valuesType are required' 
      });
    }
    
    logger.info('Getting yearly budget', { salesRep, year, valuesType });
    
    const config = loadSalesRepConfig();
    const fpConfig = config.FP || { groups: {} };
    
    let yearlyBudgetTotal;
    
    if (fpConfig.groups && fpConfig.groups[salesRep]) {
      const groupMembers = fpConfig.groups[salesRep];
      yearlyBudgetTotal = await fpDataService.getYearlyBudget(salesRep, year, valuesType, groupMembers);
    } else {
      yearlyBudgetTotal = await fpDataService.getYearlyBudget(salesRep, year, valuesType);
    }
    
    logger.info('Yearly budget retrieved', { total: yearlyBudgetTotal });
    
    res.json({
      success: true,
      data: yearlyBudgetTotal
    });
    
  } catch (error) {
    logger.error('Error getting yearly budget', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve yearly budget' });
  }
});

// POST /sales-by-country - Get sales by country
router.post('/sales-by-country', async (req, res) => {
  try {
    const { salesRep, year, months, dataType = 'Actual' } = req.body;
    
    if (!salesRep || !year || !months || !Array.isArray(months) || months.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'salesRep, year, and months (array) are required' 
      });
    }
    
    logger.info('Getting sales by country', { salesRep, year, months, dataType });
    
    const config = loadSalesRepConfig();
    const fpConfig = config.FP || { groups: {} };
    
    let countrySalesData;
    
    if (fpConfig.groups && fpConfig.groups[salesRep]) {
      const groupMembers = fpConfig.groups[salesRep];
      countrySalesData = await fpDataService.getSalesByCountry(salesRep, year, months, dataType, groupMembers);
    } else {
      countrySalesData = await fpDataService.getSalesByCountry(salesRep, year, months, dataType);
    }
    
    logger.info('Sales by country retrieved', { countries: countrySalesData.length });
    
    res.json({
      success: true,
      data: countrySalesData
    });
    
  } catch (error) {
    logger.error('Error getting sales by country', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve sales by country' });
  }
});

// GET /countries - Get countries from database
router.get('/countries', async (req, res) => {
  try {
    logger.info('Getting countries from database');
    
    const countries = await fpDataService.getCountriesFromDatabase();
    
    logger.info('Countries retrieved', { count: countries.length });
    
    res.json({
      success: true,
      data: countries
    });
    
  } catch (error) {
    logger.error('Error getting countries', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve countries' });
  }
});

// GET /countries-by-sales-rep - Get countries by sales rep
router.get('/countries-by-sales-rep', async (req, res) => {
  try {
    const { salesRep } = req.query;
    
    if (!salesRep) {
      return res.status(400).json({ 
        success: false, 
        error: 'salesRep parameter is required' 
      });
    }
    
    logger.info('Getting countries by sales rep', { salesRep });
    
    const config = loadSalesRepConfig();
    const fpConfig = config.FP || { groups: {} };
    
    let countries;
    
    if (fpConfig.groups && fpConfig.groups[salesRep]) {
      const groupMembers = fpConfig.groups[salesRep];
      countries = await fpDataService.getCountriesBySalesRep(salesRep, groupMembers);
    } else {
      countries = await fpDataService.getCountriesBySalesRep(salesRep);
    }
    
    logger.info('Countries by sales rep retrieved', { count: countries.length });
    
    res.json({
      success: true,
      data: countries
    });
    
  } catch (error) {
    logger.error('Error getting countries by sales rep', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve countries' });
  }
});

// POST /product-performance - Get comprehensive product performance data
router.post('/product-performance', async (req, res) => {
  try {
    const { currentPeriod, comparisonPeriod } = req.body;
    
    // Validate current period
    if (!currentPeriod || !currentPeriod.year || !currentPeriod.months || !currentPeriod.type) {
      return res.status(400).json({
        success: false,
        error: 'currentPeriod with year, months array, and type is required'
      });
    }
    
    if (!Array.isArray(currentPeriod.months) || currentPeriod.months.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'currentPeriod.months must be a non-empty array'
      });
    }
    
    logger.info('Fetching product performance data', { currentPeriod, comparisonPeriod });
    
    const data = await productPerformanceService.getComprehensiveProductPerformance(
      currentPeriod,
      comparisonPeriod
    );
    
    logger.info('Product performance data retrieved', {
      products: data.products.length,
      processCategories: Object.keys(data.processCategories).length,
      materialCategories: Object.keys(data.materialCategories).length
    });
    
    res.json({
      success: true,
      data,
      meta: {
        currentPeriod: productPerformanceService.formatPeriod(currentPeriod),
        comparisonPeriod: comparisonPeriod ? productPerformanceService.formatPeriod(comparisonPeriod) : null,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('Error fetching product performance', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve product performance data',
      message: error.message
    });
  }
});

// GET /all-customers - Get all customers for division
router.get('/all-customers', async (req, res) => {
  try {
    const { division } = req.query;
    
    if (!division) {
      return res.status(400).json({ 
        success: false, 
        error: 'division parameter is required' 
      });
    }
    
    logger.info('Getting all customers', { division });
    
    const customers = await UniversalSalesByCountryService.getAllCustomers(division);
    
    logger.info('All customers retrieved', { count: customers.length });
    
    res.json({
      success: true,
      data: customers
    });
    
  } catch (error) {
    logger.error('Error getting all customers', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve customers' });
  }
});

module.exports = router;
