/**
 * Sales Data Routes
 * Handles sales data retrieval for product groups and sales reps
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const fpDataService = require('../database/FPDataService');
const UniversalSalesByCountryService = require('../database/UniversalSalesByCountryService');

// Use cached sales rep config instead of reading file on every request
const { 
  loadSalesRepConfig, 
  isSalesRepGroup, 
  getGroupMembers,
  SALES_REP_CONFIG_PATH
} = require('../utils/salesRepConfigCache');

// GET /sales-data - Legacy endpoint for Sales.xlsx reference
router.get('/sales-data', (req, res) => {
  try {
    const XLSX = require('xlsx');
    const salesFilePath = path.join(__dirname, '..', 'data', 'Sales.xlsx');
    
    if (!fs.existsSync(salesFilePath)) {
      return res.json({ success: true, data: [] });
    }

    const workbook = XLSX.readFile(salesFilePath);
    const salesData = [];
    
    workbook.SheetNames.forEach(sheetName => {
      try {
        const worksheet = workbook.Sheets[sheetName];
        let data, rawData;
        
        if (sheetName.includes('-Countries')) {
          data = XLSX.utils.sheet_to_json(worksheet);
          rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        } else {
          data = XLSX.utils.sheet_to_json(worksheet);
        }
        
        salesData.push({
          sheetName: sheetName,
          data: data,
          rawData: rawData
        });
      } catch (sheetError) {
        logger.error('Error processing sheet', { sheetName, error: sheetError.message });
      }
    });
    
    res.json({ success: true, data: salesData });
    
  } catch (error) {
    logger.error('Error retrieving sales data', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve sales data' });
  }
});

// GET /fp/sales-data - Get sales data for FP division (legacy endpoint)
router.get('/fp/sales-data', async (req, res) => {
  try {
    const { salesRep, productGroup, valueType, year, month, dataType = 'actual' } = req.query;
    
    if (!salesRep || !productGroup || !year || !month) {
      return res.status(400).json({ 
        success: false, 
        error: 'salesRep, productGroup, year, and month are required' 
      });
    }
    
    const config = loadSalesRepConfig();
    const fpConfig = config.FP || { groups: {} };
    
    let salesData;
    
    if (fpConfig.groups && fpConfig.groups[salesRep]) {
      // Group data
      const groupMembers = fpConfig.groups[salesRep];
      
      if (valueType) {
        salesData = 0;
        for (const member of groupMembers) {
          const memberData = await fpDataService.getSalesDataByValueType(member, productGroup, valueType, year, month, dataType);
          salesData += memberData;
        }
      } else {
        salesData = await fpDataService.getSalesDataForGroup(groupMembers, productGroup, dataType, year, month);
      }
    } else {
      // Individual sales rep data
      if (valueType) {
        salesData = await fpDataService.getSalesDataByValueType(salesRep, productGroup, valueType, year, month, dataType);
      } else {
        salesData = await fpDataService.getSalesData(salesRep, productGroup, dataType, year, month);
      }
    }
    
    res.json({ success: true, data: salesData });
  } catch (error) {
    logger.error('Error fetching FP sales data', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch sales data' });
  }
});

// GET /fp/sales-reps-from-db - Get sales reps from database
router.get('/fp/sales-reps-from-db', async (req, res) => {
  try {
    logger.info('Getting sales reps from fp_data table');
    
    const pool = require('../database/config');
    const client = await pool.connect();
    
    const salesRepsResult = await client.query(`
      SELECT DISTINCT salesrepname 
      FROM fp_data 
      WHERE salesrepname IS NOT NULL 
      AND TRIM(salesrepname) != ''
      AND salesrepname != '(blank)'
      ORDER BY salesrepname
    `);
    
    const salesReps = salesRepsResult.rows.map(row => row.salesrepname);
    
    client.release();
    
    logger.info('Sales reps retrieved from database', { count: salesReps.length });
    res.json({ success: true, data: salesReps });
    
  } catch (error) {
    logger.error('Error getting sales reps from database', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve sales representatives' });
  }
});

// POST /sales-rep-complete-data - OPTIMIZED: Unified batch API endpoint for complete sales rep data
// Returns KGS + Amount + MoRM + Customer data in a single response
// FIXED: Now uses UniversalSalesByCountryService ultra-fast queries instead of old fpDataService
router.post('/sales-rep-complete-data', async (req, res) => {
  try {
    const { division, salesRep, periods = [], asIndividual = false } = req.body;
    
    if (!division || !salesRep) {
      return res.status(400).json({ 
        success: false, 
        message: 'division and salesRep are required' 
      });
    }
    
    logger.info(`🚀 Getting complete data for sales rep: ${salesRep} in division: ${division}${asIndividual ? ' (as individual)' : ''}`);
    
    // Check if salesRep is actually a group name
    // CRITICAL FIX: If asIndividual flag is set, treat as individual even if it matches a group name
    const isGroup = asIndividual ? false : isSalesRepGroup(division, salesRep);
    let productGroups, customers;
    let salesRepsToQuery = [];
    
    if (isGroup) {
      // It's a group - get product groups and customers using the GROUP NAME directly
      // Since all queries now use sales_rep_group_name column which stores the group name
      logger.info(`Fetching complete data for group '${salesRep}'`);
      
      // UNIFIED: Pass the group NAME to all queries - no need to iterate over members
      // The database stores the group name in sales_rep_group_name column
      salesRepsToQuery = [salesRep];  // Use group name directly
      
      // Get product groups and customers for the GROUP (by group name, not individual members)
      productGroups = await UniversalSalesByCountryService.getProductGroupsBySalesRep(division, salesRep);
      customers = await UniversalSalesByCountryService.getCustomersBySalesRep(division, salesRep);
      
      logger.info(`Group '${salesRep}': Found ${productGroups.length} product groups, ${customers.length} customers`);
    } else {
      // It's an individual sales rep - their sales_rep_group_name = their own name
      salesRepsToQuery = [salesRep];
      productGroups = await UniversalSalesByCountryService.getProductGroupsBySalesRep(division, salesRep);
      customers = await UniversalSalesByCountryService.getCustomersBySalesRep(division, salesRep);
    }
    
    // ULTRA-FAST: Build columns array from periods for batch query
    const columns = periods.map((period, idx) => ({
      year: period.year,
      month: String(period.month).padStart(2, '0'),
      months: period.months || null,
      type: period.type || 'Actual',
      columnKey: `${period.year}-${String(period.month).padStart(2, '0')}-${period.type || 'Actual'}`
    }));
    
    logger.info(`🚀 ULTRA-FAST: Querying ${salesRepsToQuery.length} sales reps across ${columns.length} periods`);
    
    // Use ULTRA-FAST method to get ALL sales rep data in ONE batch query
    const ultraFastData = await UniversalSalesByCountryService.getSalesRepProductGroupUltraFast(
      division,
      salesRepsToQuery,
      productGroups,
      columns
    );
    
    // Prepare dashboard data structure from ultra-fast results
    const dashboardData = {};
    const customerData = {};
    const valueTypes = ['KGS', 'Amount', 'MoRM'];
    
    // Initialize dashboard data structure
    for (const productGroup of productGroups) {
      dashboardData[productGroup] = {};
      for (const valueType of valueTypes) {
        dashboardData[productGroup][valueType] = {};
        
        // Fill in data from ultra-fast results
        columns.forEach(col => {
          const key = `${productGroup}|${valueType}|${col.columnKey}`;
          const value = ultraFastData[key] || 0;
          dashboardData[productGroup][valueType][col.columnKey] = value;
        });
      }
    }
    
    // ULTRA-FAST: Get customer data in ONE batch query
    const customerColumns = columns.map(col => ({
      ...col,
      columnKey: `${col.year}-${col.month}-${col.type}`
    }));
    
    // Get customer KGS data
    const customerUltraFastData = await UniversalSalesByCountryService.getCustomerSalesUltraFast(
      division,
      salesRepsToQuery,
      customers,
      customerColumns,
      'KGS'  // Explicitly pass KGS
    );
    
    // Get customer AMOUNT data (for Customers - Sales Amount table)
    const customerAmountUltraFastData = await UniversalSalesByCountryService.getCustomerSalesUltraFast(
      division,
      salesRepsToQuery,
      customers,
      customerColumns,
      'Amount'  // Get Amount data too
    );
    
    // CRITICAL FIX: Extract ALL unique customers from BOTH KGS and Amount data
    // This ensures Budget-only customers (like "Al Ain Food & Beverages") are included
    const allCustomersFromKgs = new Set();
    const allCustomersFromAmount = new Set();
    
    // Extract customers from KGS ultra-fast data keys (format: "customer|columnKey")
    Object.keys(customerUltraFastData).forEach(key => {
      const customer = key.split('|')[0];
      if (customer) allCustomersFromKgs.add(customer);
    });
    
    // Extract customers from Amount ultra-fast data keys
    Object.keys(customerAmountUltraFastData).forEach(key => {
      const customer = key.split('|')[0];
      if (customer) allCustomersFromAmount.add(customer);
    });
    
    // Combine all customers (KGS + Amount unique customers)
    const allKgsCustomers = Array.from(allCustomersFromKgs);
    const allAmountCustomers = Array.from(allCustomersFromAmount);
    
    logger.info(`📊 Customer counts - Original: ${customers.length}, From KGS data: ${allKgsCustomers.length}, From Amount data: ${allAmountCustomers.length}`);
    
    // Fill customer data from ultra-fast results (KGS - use all KGS customers)
    for (const customer of allKgsCustomers) {
      customerData[customer] = {};
      customerColumns.forEach(col => {
        const key = `${customer}|${col.columnKey}`;
        customerData[customer][col.columnKey] = customerUltraFastData[key] || 0;
      });
    }
    
    // Fill customer AMOUNT data (use all Amount customers, including Budget-only customers)
    const customerAmountData = {};
    for (const customer of allAmountCustomers) {
      customerAmountData[customer] = {};
      customerColumns.forEach(col => {
        const key = `${customer}|${col.columnKey}`;
        customerAmountData[customer][col.columnKey] = customerAmountUltraFastData[key] || 0;
      });
    }
    
    // Use the original customers list for the response (maintains backwards compatibility)
    // But the data now includes all customers from both KGS and Amount queries
    logger.info(`✅ ULTRA-FAST retrieved complete data: ${productGroups.length} product groups, ${allKgsCustomers.length} KGS customers, ${allAmountCustomers.length} Amount customers`);
    
    res.json({
      success: true,
      data: {
        salesRep,
        productGroups,
        customers,
        dashboardData,
        customerData,          // KGS customer data (existing)
        customerAmountData,    // NEW: Amount customer data for Customers - Sales Amount table
        isGroup
      },
      message: `ULTRA-FAST retrieved complete data for ${salesRep} in ${division} division`
    });
    
  } catch (error) {
    logger.error('Error getting complete sales rep data', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to retrieve complete sales rep data', message: error.message });
  }
});

// POST /sales-rep-dashboard-universal - Universal sales rep dashboard
router.post('/sales-rep-dashboard-universal', async (req, res) => {
  try {
    const { division, salesRep, valueTypes = ['KGS', 'Amount'], periods = [] } = req.body;
    
    if (!division || !salesRep) {
      return res.status(400).json({ 
        success: false, 
        error: 'division and salesRep are required' 
      });
    }
    
    logger.info('Getting dashboard data', { division, salesRep, valueTypes, periods: periods.length });
    
    const isGroup = isSalesRepGroup(division, salesRep);
    let productGroups;
    
    if (isGroup) {
      const groupMembers = getGroupMembers(division, salesRep);
      const allProductGroups = new Set();
      
      for (const member of groupMembers) {
        try {
          const memberProductGroups = await UniversalSalesByCountryService.getProductGroupsBySalesRep(division, member);
          memberProductGroups.forEach(pg => allProductGroups.add(pg));
        } catch (memberError) {
          logger.warn('Failed to fetch product groups for member', { member, error: memberError.message });
        }
      }
      productGroups = Array.from(allProductGroups);
    } else {
      productGroups = await UniversalSalesByCountryService.getProductGroupsBySalesRep(division, salesRep);
    }
    
    // Build dashboard data
    const dashboardData = {};
    
    for (const productGroup of productGroups) {
      dashboardData[productGroup] = {};
      
      for (const valueType of valueTypes) {
        dashboardData[productGroup][valueType] = {};
        
        for (const period of periods) {
          const { year, month, type = 'Actual' } = period;
          
          let salesData;
          if (isGroup) {
            const groupMembers = getGroupMembers(division, salesRep);
            salesData = 0;
            for (const member of groupMembers) {
              // All divisions use fpDataService with dynamic table names
              const memberData = await fpDataService.getSalesDataByValueType(member, productGroup, valueType, year, month, type);
              salesData += memberData;
            }
          } else {
            // All divisions use fpDataService with dynamic table names
            salesData = await fpDataService.getSalesDataByValueType(salesRep, productGroup, valueType, year, month, type);
          }
          
          dashboardData[productGroup][valueType][`${year}-${month}-${type}`] = salesData;
        }
      }
    }
    
    logger.info('Dashboard data retrieved', { productGroups: productGroups.length });
    
    res.json({
      success: true,
      data: {
        salesRep,
        productGroups,
        dashboardData,
        isGroup
      }
    });
    
  } catch (error) {
    logger.error('Error getting sales rep dashboard data', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve dashboard data' });
  }
});

// POST /fp/sales-rep-dashboard - Legacy FP dashboard (backward compatibility)
router.post('/fp/sales-rep-dashboard', async (req, res) => {
  try {
    const { salesRep, valueTypes = ['KGS', 'Amount'], periods = [] } = req.body;
    
    if (!salesRep) {
      return res.status(400).json({ 
        success: false, 
        error: 'salesRep is required' 
      });
    }
    
    const config = loadSalesRepConfig();
    const fpConfig = config.FP || { groups: {} };
    
    let productGroups;
    
    if (fpConfig.groups && fpConfig.groups[salesRep]) {
      const groupMembers = fpConfig.groups[salesRep];
      const allProductGroups = new Set();
      
      for (const member of groupMembers) {
        try {
          const memberProductGroups = await fpDataService.getProductGroupsBySalesRep(member);
          memberProductGroups.forEach(pg => allProductGroups.add(pg));
        } catch (memberError) {
          logger.warn('Failed to fetch product groups for member', { member, error: memberError.message });
        }
      }
      productGroups = Array.from(allProductGroups);
    } else {
      productGroups = await fpDataService.getProductGroupsBySalesRep(salesRep);
    }
    
    const dashboardData = {};
    
    for (const productGroup of productGroups) {
      dashboardData[productGroup] = {};
      
      for (const valueType of valueTypes) {
        dashboardData[productGroup][valueType] = {};
        
        for (const period of periods) {
          const { year, month, type = 'Actual' } = period;
          
          let salesData;
          if (fpConfig.groups && fpConfig.groups[salesRep]) {
            const groupMembers = fpConfig.groups[salesRep];
            salesData = await fpDataService.getSalesDataForGroup(groupMembers, productGroup, valueType, year, month, type);
          } else {
            salesData = await fpDataService.getSalesDataByValueType(salesRep, productGroup, valueType, year, month, type);
          }
          
          dashboardData[productGroup][valueType][`${year}-${month}-${type}`] = salesData;
        }
      }
    }
    
    res.json({
      success: true,
      data: {
        salesRep,
        productGroups,
        dashboardData,
        isGroup: !!(fpConfig.groups && fpConfig.groups[salesRep])
      }
    });
    
  } catch (error) {
    logger.error('Error getting FP sales rep dashboard data', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve dashboard data' });
  }
});

// POST /fp/customer-dashboard - Legacy FP customer dashboard
router.post('/fp/customer-dashboard', async (req, res) => {
  try {
    const { salesRep, periods = [] } = req.body;
    
    if (!salesRep) {
      return res.status(400).json({ 
        success: false, 
        error: 'salesRep is required' 
      });
    }
    
    const config = loadSalesRepConfig();
    const fpConfig = config.FP || { groups: {} };
    
    let customers;
    
    if (fpConfig.groups && fpConfig.groups[salesRep]) {
      const groupMembers = fpConfig.groups[salesRep];
      customers = await fpDataService.getCustomersForGroup(groupMembers);
    } else {
      customers = await fpDataService.getCustomersBySalesRep(salesRep);
    }
    
    const dashboardData = {};
    
    for (const customer of customers) {
      dashboardData[customer] = {};
      
      for (const period of periods) {
        const { year, month, type = 'Actual' } = period;
        
        let salesData;
        if (fpConfig.groups && fpConfig.groups[salesRep]) {
          const groupMembers = fpConfig.groups[salesRep];
          salesData = await fpDataService.getCustomerSalesDataForGroup(groupMembers, customer, 'KGS', year, month, type);
        } else {
          salesData = await fpDataService.getCustomerSalesDataByValueType(salesRep, customer, 'KGS', year, month, type);
        }
        
        dashboardData[customer][`${year}-${month}-${type}`] = salesData;
      }
    }
    
    res.json({
      success: true,
      data: {
        salesRep,
        customers,
        dashboardData,
        isGroup: !!(fpConfig.groups && fpConfig.groups[salesRep])
      }
    });
    
  } catch (error) {
    logger.error('Error getting FP customer dashboard data', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve customer dashboard data' });
  }
});

module.exports = router;
