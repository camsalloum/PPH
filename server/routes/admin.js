/**
 * Admin Routes
 * Handles administrative operations like division sync
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { syncAllTablesToAllDivisions } = require('../utils/divisionDatabaseManager');
const { getActiveDivisions, getAllDivisions } = require('../database/DynamicDivisionConfig');
const { authenticate, requireRole } = require('../middleware/auth');

// POST /sync-divisions - Sync tables across all divisions (Admin only)
router.post('/sync-divisions', authenticate, requireRole('admin'), async (req, res) => {
  try {
    logger.info('Starting division sync...');
    const result = await syncAllTablesToAllDivisions();
    
    logger.info('Division sync completed', { tablesCreated: result.synced });
    res.json({ 
      success: true, 
      message: 'Division sync completed', 
      tablesCreated: result.synced 
    });
  } catch (error) {
    logger.error('Error syncing divisions', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to sync divisions' });
  }
});

// GET /divisions - Get all active divisions (Admin only)
router.get('/divisions', authenticate, requireRole('admin'), async (req, res) => {
  try {
    // Get divisions dynamically from company_settings database
    const divisions = await getAllDivisions();
    res.json({ success: true, data: divisions });
  } catch (error) {
    logger.error('Error fetching divisions', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch divisions' });
  }
});

// POST /recalculate-customer-status - Recalculate is_active for all customers (Admin only)
router.post('/recalculate-customer-status', authenticate, requireRole('admin'), async (req, res) => {
  const { pool } = require('../database/config');
  
  try {
    logger.info('Starting customer active status recalculation...');
    
    // Call the PostgreSQL function
    const result = await pool.query('SELECT * FROM recalculate_customer_active_status()');
    
    const { customers_updated, now_active, now_inactive } = result.rows[0];
    
    logger.info('Customer status recalculation completed', { 
      active: now_active, 
      inactive: now_inactive 
    });
    
    res.json({ 
      success: true, 
      message: 'Customer status recalculated successfully',
      stats: {
        totalCustomers: customers_updated,
        active: now_active,
        inactive: now_inactive
      }
    });
  } catch (error) {
    logger.error('Error recalculating customer status', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to recalculate customer status',
      details: error.message
    });
  }
});

module.exports = router;
