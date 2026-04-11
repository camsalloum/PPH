/**
 * P&L Data API Routes
 * Handles P&L data operations: refresh, query, status
 */

const express = require('express');
const router = express.Router();
const plDataService = require('../services/plDataService');
const { authenticate, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * POST /api/pl/:division/refresh
 * Refresh P&L data from Excel file
 * Admin only
 */
router.post('/:division/refresh', authenticate, requireRole('admin'), async (req, res) => {
  const { division } = req.params;
  const userId = req.user.id;
  
  try {
    logger.info(`P&L refresh requested for division ${division} by user ${userId}`);
    
    const result = await plDataService.refreshPLData(division.toUpperCase(), userId);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error(`P&L refresh error for ${division}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/pl/:division/data
 * Get P&L data with optional filters
 * Public endpoint - read-only financial data
 */
router.get('/:division/data', async (req, res) => {
  const { division } = req.params;
  const { year, month, dataType } = req.query;
  
  try {
    const filters = {};
    if (year) filters.year = parseInt(year);
    if (month) filters.month = month;
    if (dataType) filters.dataType = dataType;
    
    const data = await plDataService.getPLData(division.toUpperCase(), filters);
    
    // Allow browser to cache unfiltered P&L data for 2 minutes
    if (!year && !month && !dataType) {
      res.set('Cache-Control', 'private, max-age=120');
    }

    res.json({
      success: true,
      data: data,
      count: data.length
    });
  } catch (error) {
    logger.error(`Get P&L data error for ${division}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/pl/:division/periods
 * Get available periods (years, months, types)
 */
router.get('/:division/periods', authenticate, async (req, res) => {
  const { division } = req.params;
  
  try {
    const periods = await plDataService.getAvailablePeriods(division.toUpperCase());
    
    res.json({
      success: true,
      periods: periods
    });
  } catch (error) {
    logger.error(`Get periods error for ${division}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/pl/:division/status
 * Get last refresh status
 */
router.get('/:division/status', authenticate, async (req, res) => {
  const { division } = req.params;
  
  try {
    const status = await plDataService.getRefreshStatus(division.toUpperCase());
    
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    logger.error(`Get status error for ${division}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/pl/:division/history
 * Get refresh history (audit log)
 * Admin only
 */
router.get('/:division/history', authenticate, requireRole('admin'), async (req, res) => {
  const { division } = req.params;
  const { limit } = req.query;
  
  try {
    const history = await plDataService.getRefreshHistory(
      division.toUpperCase(), 
      limit ? parseInt(limit) : 10
    );
    
    res.json({
      success: true,
      history: history
    });
  } catch (error) {
    logger.error(`Get history error for ${division}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
