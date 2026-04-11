/**
 * Universal/Division-Agnostic Routes
 * Handles routes that work across multiple divisions
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { getDivisionPool } = require('../utils/divisionDatabaseManager');
const UniversalSalesByCountryService = require('../database/UniversalSalesByCountryService');
const productGroupService = require('../services/productGroupService');

// Use cached sales rep config instead of reading file on every request
const { 
  loadSalesRepConfig, 
  isSalesRepGroup, 
  getGroupMembers,
  SALES_REP_CONFIG_PATH
} = require('../utils/salesRepConfigCache');

// GET / - Home route
router.get('/', (req, res) => {
  res.json({ message: 'IPDashboard API - v2.0' });
});

// GET /db/test - Test database connection
router.get('/db/test', async (req, res) => {
  try {
    const { pool } = require('../database/config');
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      success: true, 
      message: 'Database connection successful', 
      timestamp: result.rows[0].now 
    });
  } catch (error) {
    logger.error('Database test failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Database connection failed' });
  }
});

// GET /division-info - Get division information
router.get('/division-info', async (req, res) => {
  try {
    const { division } = req.query;
    
    if (!division) {
      return res.status(400).json({ success: false, error: 'Division parameter is required' });
    }
    
    // Dynamic division info based on naming convention
    const prefix = division.toLowerCase();
    const divisionData = {
      division: division.toUpperCase(),
      status: 'active', // All configured divisions are active
      database: `${prefix}_database`,
      table: `${prefix}_actualcommon`
    };
    
    res.json({ success: true, data: divisionData });
  } catch (error) {
    logger.error('Error fetching division info', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch division info' });
  }
});

// GET /product-groups-universal - Get product groups across divisions (resolved to PGCombine)
// NOTE: PPH, FILM, FOIL etc are sub-divisions of FP - all data lives in fp_database with fp_ table prefix
// The admin_division_code column differentiates between sub-divisions
router.get('/product-groups-universal', async (req, res) => {
  try {
    const { division, salesRep } = req.query;
    
    if (!division) {
      return res.status(400).json({ success: false, error: 'Division parameter is required' });
    }
    
    // IMPORTANT: All FP sub-divisions (PPH, FILM, FOIL, BF) use fp_database and fp_ table prefix
    // The division code is used to filter via admin_division_code column, not for database/table selection
    const divisionPool = getDivisionPool('FP'); // Always use FP pool - sub-divisions are filtered by column
    
    // Tables always use fp_ prefix since all sub-divisions share the same tables
    const tables = {
      actualcommon: 'fp_actualcommon',
      productGroupExclusions: 'fp_product_group_exclusions'
    };
    
    let query;
    let params;
    
    if (salesRep) {
      // Get product groups for specific sales rep
      query = `
        SELECT DISTINCT pgcombine
        FROM ${tables.actualcommon} a
        LEFT JOIN ${tables.productGroupExclusions} e
          ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
          AND UPPER(e.division_code) = UPPER($1)
        WHERE UPPER(a.admin_division_code) = UPPER($1)
          AND UPPER(a.sales_rep_name) = UPPER($2)
          AND a.pgcombine IS NOT NULL
          AND TRIM(a.pgcombine) != ''
          AND UPPER(TRIM(a.pgcombine)) != 'SERVICES CHARGES'
          AND e.product_group IS NULL
        ORDER BY pgcombine
      `;
      params = [division, salesRep];
    } else {
      // Get all product groups for division
      query = `
        SELECT DISTINCT pgcombine
        FROM ${tables.actualcommon} a
        LEFT JOIN ${tables.productGroupExclusions} e
          ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
          AND UPPER(e.division_code) = UPPER($1)
        WHERE UPPER(a.admin_division_code) = UPPER($1)
          AND a.pgcombine IS NOT NULL
          AND TRIM(a.pgcombine) != ''
          AND UPPER(TRIM(a.pgcombine)) != 'SERVICES CHARGES'
          AND e.product_group IS NULL
        ORDER BY pgcombine
      `;
      params = [division];
    }
    
    const result = await divisionPool.query(query, params);
    const productGroups = result.rows.map(row => row.pgcombine);
    
    logger.info(`[product-groups-universal] Returned ${productGroups.length} product groups for division ${division}`);
    
    // Return in format expected by frontend (array of objects with pgcombine)
    const data = productGroups.map(pg => ({ pgcombine: pg, productgroup: pg }));
    
    res.json({ success: true, data, productGroups });
  } catch (error) {
    logger.error('Error fetching universal product groups', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch product groups' });
  }
});

// GET /sales-reps-universal - Get sales reps across divisions
router.get('/sales-reps-universal', async (req, res) => {
  try {
    const { division } = req.query;
    
    if (!division) {
      return res.status(400).json({ success: false, error: 'Division parameter is required' });
    }
    
    // Use fp_actualcommon as the single source of truth
    // Filter by admin_division_code to get only sales reps for the specified division
    const { pool } = require('../database/config');
    
    // Get distinct sales rep names for the specified division
    const result = await pool.query(`
      SELECT DISTINCT UPPER(TRIM(sales_rep_name)) as salesrepname
      FROM fp_actualcommon 
      WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
        AND sales_rep_name IS NOT NULL 
        AND TRIM(sales_rep_name) != ''
      ORDER BY salesrepname
    `, [division]);
    
    // Return just the names as an array of strings
    const salesRepNames = result.rows.map(row => row.salesrepname);
    logger.info(`Fetched ${salesRepNames.length} sales reps for division ${division}`);
    res.json({ success: true, data: salesRepNames });
  } catch (error) {
    logger.error('Error fetching universal sales reps', { error: error.message, division: req.query.division });
    res.status(500).json({ success: false, error: 'Failed to fetch sales reps' });
  }
});

// POST /sales-rep-dashboard-universal - Get sales rep dashboard (universal)
router.post('/sales-rep-dashboard-universal', async (req, res) => {
  try {
    const { division, salesRep, filters } = req.body;
    
    if (!division || !salesRep) {
      return res.status(400).json({ success: false, error: 'Division and sales rep are required' });
    }
    
    const pool = await getDivisionPool(division);
    
    // Build query based on filters - use fp_actualcommon
    let query = `
      SELECT *
      FROM fp_actualcommon
      WHERE UPPER(TRIM(admin_division_code)) = UPPER($1)
        AND TRIM(UPPER(sales_rep_name)) = TRIM(UPPER($2))
    `;
    const params = [division, salesRep];
    
    const result = await pool.query(query, params);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching universal sales rep dashboard', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard data' });
  }
});

// POST /customer-dashboard-universal - Get customer dashboard (universal) - KGS values
router.post('/customer-dashboard-universal', async (req, res) => {
  try {
    const { division, salesRep, periods = [] } = req.body;
    
    if (!division || !salesRep) {
      return res.status(400).json({ 
        success: false, 
        message: 'division and salesRep are required' 
      });
    }
    
    logger.info(`🔍 Getting customer dashboard data for sales rep: ${salesRep} in division: ${division}`);
    
    // Check if salesRep is actually a group name
    const isGroup = isSalesRepGroup(division, salesRep);
    
    // UNIFIED FIX: Always use salesRep (the group name or individual name) directly
    // Since all queries now use sales_rep_group_name column which stores group names
    const salesRepsToQuery = [salesRep];
    
    if (isGroup) {
      logger.info(`Fetching customers for group '${salesRep}'`);
    }
    
    // Get list of all customers for this sales rep/group (uses sales_rep_group_name)
    const customers = await UniversalSalesByCountryService.getCustomersBySalesRep(
      division, 
      salesRep
    );
    
    // Build columns array for ultra-fast query
    const columns = periods.map(period => ({
      year: period.year,
      month: period.month,
      type: period.type || 'Actual',
      columnKey: `${period.year}-${period.month}-${period.type || 'Actual'}`
    }));
    
    // Get ultra-fast customer sales data (KGS) - uses sales_rep_group_name
    const ultraFastData = await UniversalSalesByCountryService.getCustomerSalesUltraFast(
      division,
      salesRepsToQuery,
      customers,
      columns
    );
    
    // Convert ultra-fast format to dashboard format
    const dashboardData = {};
    customers.forEach(customer => {
      dashboardData[customer] = {};
      columns.forEach(col => {
        const key = `${customer}|${col.columnKey}`;
        dashboardData[customer][col.columnKey] = ultraFastData[key] || 0;
      });
    });
    
    logger.info(`✅ Retrieved customer dashboard data for ${customers.length} customers`);
    
    res.json({
      success: true,
      data: {
        salesRep,
        customers,
        dashboardData,
        isGroup
      },
      message: `Retrieved customer dashboard data for ${salesRep} in ${division} division`
    });
    
  } catch (error) {
    logger.error('❌ Error getting customer dashboard data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve customer dashboard data',
      message: error.message
    });
  }
});

// POST /customer-dashboard-amount - Get customer dashboard with amount calculation
router.post('/customer-dashboard-amount', async (req, res) => {
  try {
    const { division, salesRep, periods = [] } = req.body;
    
    if (!division || !salesRep) {
      return res.status(400).json({ 
        success: false, 
        message: 'division and salesRep are required' 
      });
    }
    
    logger.info(`🔍 Getting customer AMOUNT data for sales rep: ${salesRep} in division: ${division}`);
    
    // Check if salesRep is actually a group name
    const isGroup = isSalesRepGroup(division, salesRep);
    
    // UNIFIED FIX: Always use salesRep (the group name or individual name) directly
    // Since all queries now use sales_rep_group_name column which stores group names
    const salesRepsToQuery = [salesRep];
    
    if (isGroup) {
      logger.info(`Fetching AMOUNT customers for group '${salesRep}'`);
    }
    
    // Get list of all customers for this sales rep/group (uses sales_rep_group_name)
    const customers = await UniversalSalesByCountryService.getCustomersBySalesRep(
      division, 
      salesRep
    );
    
    // Build columns array for ultra-fast query
    const columns = periods.map(period => ({
      year: period.year,
      month: period.month,
      type: period.type || 'Actual',
      columnKey: `${period.year}-${period.month}-${period.type || 'Actual'}`
    }));
    
    // Get ultra-fast customer sales data (AMOUNT) - uses sales_rep_group_name
    const ultraFastData = await UniversalSalesByCountryService.getCustomerSalesUltraFast(
      division,
      salesRepsToQuery,
      customers,
      columns,
      'AMOUNT'
    );
    
    // Convert ultra-fast format to dashboard format
    const dashboardData = {};
    customers.forEach(customer => {
      dashboardData[customer] = {};
      columns.forEach(col => {
        const key = `${customer}|${col.columnKey}`;
        dashboardData[customer][col.columnKey] = ultraFastData[key] || 0;
      });
    });
    
    logger.info(`✅ Retrieved customer AMOUNT data for ${customers.length} customers`);
    
    // Debug: Log first customer's data to verify AMOUNT values
    if (customers.length > 0) {
      const firstCustomer = customers[0];
      logger.info(`🔍 DEBUG - First customer data:`, {
        customer: firstCustomer,
        data: dashboardData[firstCustomer]
      });
    }
    
    res.json({
      success: true,
      data: {
        salesRep,
        customers,
        dashboardData,
        isGroup
      },
      message: `Retrieved customer AMOUNT data for ${salesRep} in ${division} division`
    });
    
  } catch (error) {
    logger.error('❌ Error getting customer AMOUNT data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve customer AMOUNT data',
      message: error.message
    });
  }
});

module.exports = router;
