/**
 * Dashboard Routes
 * Handles customer and amount dashboard data
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const UniversalSalesByCountryService = require('../database/UniversalSalesByCountryService');
const salesRepGroupsService = require('../services/salesRepGroupsService');

// Helper functions for sales rep groups - now use database-backed service
const isSalesRepGroup = salesRepGroupsService.isSalesRepGroupSync;
const getGroupMembers = salesRepGroupsService.getGroupMembersSync;

// POST /customer-universal - Get customer dashboard data (KGS)
router.post('/customer-universal', async (req, res) => {
  try {
    const { division, salesRep, periods = [] } = req.body;
    
    if (!division || !salesRep) {
      return res.status(400).json({ 
        success: false, 
        error: 'division and salesRep are required' 
      });
    }
    
    logger.info('Getting customer dashboard data', { division, salesRep, periodsCount: periods.length });
    
    // Get customers for sales rep or group
    let customers;
    const isGroup = isSalesRepGroup(division, salesRep);
    
    if (isGroup) {
      const groupMembers = getGroupMembers(division, salesRep);
      logger.info('Fetching customers for group', { group: salesRep, members: groupMembers });
      customers = await UniversalSalesByCountryService.getCustomersBySalesRep(division, salesRep, groupMembers);
    } else {
      customers = await UniversalSalesByCountryService.getCustomersBySalesRep(division, salesRep);
    }
    
    // Get batch customer sales data for all periods
    const dashboardData = {};
    
    for (const customer of customers) {
      dashboardData[customer] = {};
      
      for (const period of periods) {
        const { year, month, type = 'Actual' } = period;
        
        let salesData;
        if (isGroup) {
          const groupMembers = getGroupMembers(division, salesRep);
          salesData = await UniversalSalesByCountryService.getCustomerSalesDataForGroup(
            division, groupMembers, customer, 'KGS', year, month, type
          );
        } else {
          salesData = await UniversalSalesByCountryService.getCustomerSalesDataByValueType(
            division, salesRep, customer, 'KGS', year, month, type
          );
        }
        
        dashboardData[customer][`${year}-${month}-${type}`] = salesData;
      }
    }
    
    logger.info('Customer dashboard data retrieved', { 
      customersCount: customers.length, 
      isGroup 
    });
    
    res.json({
      success: true,
      data: {
        salesRep,
        customers,
        dashboardData,
        isGroup
      }
    });
    
  } catch (error) {
    logger.error('Error getting customer dashboard data', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve customer dashboard data',
      message: error.message
    });
  }
});

// POST /amount - Get customer dashboard data (AMOUNT for percentage calculations)
router.post('/amount', async (req, res) => {
  try {
    const { division, salesRep, periods = [] } = req.body;
    
    if (!division || !salesRep) {
      return res.status(400).json({ 
        success: false, 
        error: 'division and salesRep are required' 
      });
    }
    
    logger.info('Getting customer AMOUNT data', { division, salesRep, periodsCount: periods.length });
    
    // Get customers for sales rep or group
    let customers;
    const isGroup = isSalesRepGroup(division, salesRep);
    
    if (isGroup) {
      const groupMembers = getGroupMembers(division, salesRep);
      logger.info('Fetching AMOUNT customers for group', { group: salesRep, members: groupMembers });
      customers = await UniversalSalesByCountryService.getCustomersBySalesRep(division, salesRep, groupMembers);
    } else {
      customers = await UniversalSalesByCountryService.getCustomersBySalesRep(division, salesRep);
    }
    
    // Get batch customer sales data for all periods (AMOUNT values)
    const dashboardData = {};
    
    for (const customer of customers) {
      dashboardData[customer] = {};
      
      for (const period of periods) {
        const { year, month, type = 'Actual' } = period;
        
        let salesData;
        if (isGroup) {
          const groupMembers = getGroupMembers(division, salesRep);
          salesData = await UniversalSalesByCountryService.getCustomerSalesDataForGroup(
            division, groupMembers, customer, 'AMOUNT', year, month, type
          );
        } else {
          salesData = await UniversalSalesByCountryService.getCustomerSalesDataByValueType(
            division, salesRep, customer, 'AMOUNT', year, month, type
          );
        }
        
        dashboardData[customer][`${year}-${month}-${type}`] = salesData;
      }
    }
    
    logger.info('Customer AMOUNT data retrieved', { 
      customersCount: customers.length, 
      isGroup 
    });
    
    // Debug log first customer data
    if (customers.length > 0) {
      logger.debug('First customer data sample', {
        customer: customers[0],
        data: dashboardData[customers[0]]
      });
    }
    
    res.json({
      success: true,
      data: {
        salesRep,
        customers,
        dashboardData,
        isGroup
      }
    });
    
  } catch (error) {
    logger.error('Error getting customer AMOUNT data', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve customer AMOUNT data',
      message: error.message
    });
  }
});

module.exports = router;
