/**
 * server/routes/erp-periods.js
 * 
 * API endpoints for period data (years, months, types)
 * Used by frontend FilterContext to populate dropdowns
 * 
 * Created: January 6, 2026
 */

const express = require('express');
const router = express.Router();
const PeriodDataService = require('../services/PeriodDataService');
const { authenticate, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * GET /api/periods/all
 * Returns all period data (years from fp_actualcommon, months & types hardcoded)
 * 
 * No authentication required - used by frontend on initial load
 */
// ── In-memory cache for /periods/all (rarely changes, 5-min TTL) ──
let _periodsCache = {};          // keyed by division||'__ALL__'
const PERIODS_CACHE_TTL = 5 * 60 * 1000;

router.get('/all', async (req, res) => {
  try {
    const { pool } = require('../database/config');

    const { division } = req.query;
    const cacheKey = division ? division.toUpperCase() : '__ALL__';

    // ── Serve from cache if fresh ──
    const cached = _periodsCache[cacheKey];
    if (cached && (Date.now() - cached.ts < PERIODS_CACHE_TTL)) {
      return res.json(cached.payload);
    }

    const actualParams = division ? [division] : [];
    const budgetParams = division ? [division] : [];
    const forecastParams = division ? [division] : [];

    const actualWhere = division
      ? 'WHERE year IS NOT NULL AND UPPER(admin_division_code) = UPPER($1)'
      : 'WHERE year IS NOT NULL';
    const budgetWhere = division
      ? 'WHERE budget_year IS NOT NULL AND UPPER(division_code) = UPPER($1)'
      : 'WHERE budget_year IS NOT NULL';
    const forecastWhere = division
      ? "WHERE year IS NOT NULL AND UPPER(division_code) = UPPER($1) AND UPPER(type) = 'FORECAST'"
      : "WHERE year IS NOT NULL AND UPPER(type) = 'FORECAST'";

    // ── Run all 3 DISTINCT queries IN PARALLEL instead of sequentially ──
    const [actualResult, budgetResult, forecastResult] = await Promise.all([
      pool.query(`SELECT DISTINCT year FROM fp_actualcommon ${actualWhere} ORDER BY year DESC`, actualParams),
      pool.query(`SELECT DISTINCT budget_year AS year FROM fp_budget_unified ${budgetWhere} ORDER BY budget_year DESC`, budgetParams)
        .catch(err => { logger.warn(`[PERIODS] ⚠️ Budget years query failed: ${err.message}`); return { rows: [] }; }),
      pool.query(`SELECT DISTINCT year FROM fp_product_group_projections ${forecastWhere} ORDER BY year DESC`, forecastParams)
        .catch(err => { logger.warn(`[PERIODS] ⚠️ Forecast years query failed: ${err.message}`); return { rows: [] }; })
    ]);

    const actualYears   = actualResult.rows.map(r => r.year).filter(y => y != null);
    const budgetYears   = budgetResult.rows.map(r => r.year).filter(y => y != null);
    const forecastYears = forecastResult.rows.map(r => r.year).filter(y => y != null);

    const years = [...new Set([...actualYears, ...budgetYears, ...forecastYears])].sort((a, b) => b - a);
    
    // Hardcoded periods: Monthly, Quarterly, H1, H2, FY
    const standardPeriods = ['FY', 'H1', 'H2', 'Q1', 'Q2', 'Q3', 'Q4'];
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const allPeriods = [...standardPeriods, ...monthNames];
    
    // Hardcoded types
    const types = ['Actual', 'Estimate', 'Budget', 'Forecast'];
    
    logger.info(`[PERIODS] ✅ Returning ${years.length} years (actual + budget): ${years.join(', ')}`);
    
    const payload = {
      success: true,
      data: {
        years: years,
        months: allPeriods,
        types: types,
        source: {
          years: 'fp_actualcommon.year (actual) + fp_budget_unified.budget_year (budget) + fp_product_group_projections.year (forecast)',
          months: 'Hardcoded: Monthly, Quarterly (Q1-Q4), Half-yearly (H1, H2), Full Year (FY)',
          types: 'Hardcoded: Actual, Estimate, Budget, Forecast'
        }
      }
    };

    // ── Populate cache ──
    _periodsCache[cacheKey] = { payload, ts: Date.now() };

    res.json(payload);
  } catch (error) {
    logger.error(`Error fetching period data: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch period data',
      message: error.message
    });
  }
});

/**
 * GET /api/periods/years
 * Returns only available years from Oracle
 */
router.get('/years', authenticate, async (req, res) => {
  try {
    const years = await PeriodDataService.getAvailableYears();
    
    res.json({
      success: true,
      data: {
        years,
        count: years.length,
        min: Math.min(...years),
        max: Math.max(...years),
        source: 'Oracle ERP (fp_raw_data.year1)',
        cacheAge: PeriodDataService.getCacheAge()
      }
    });
  } catch (error) {
    logger.error(`Error fetching years: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available years',
      message: error.message
    });
  }
});

/**
 * GET /api/periods/months
 * Returns hardcoded months and standard periods
 */
router.get('/months', authenticate, (req, res) => {
  try {
    const months = PeriodDataService.getAvailableMonths();
    
    res.json({
      success: true,
      data: {
        months,
        count: months.length,
        source: 'Hardcoded (months 1-12 + standard periods: FY, HY1-2, Q1-4)',
        format: 'monthno (numeric or code) + name (display text)'
      }
    });
  } catch (error) {
    logger.error(`Error fetching months: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available months',
      message: error.message
    });
  }
});

/**
 * GET /api/periods/types
 * Returns hardcoded types (AEBF)
 */
router.get('/types', authenticate, (req, res) => {
  try {
    const types = PeriodDataService.getAvailableTypes();
    
    res.json({
      success: true,
      data: {
        types,
        count: types.length,
        source: 'Hardcoded (Actual, Estimate, Budget, Forecast)'
      }
    });
  } catch (error) {
    logger.error(`Error fetching types: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available types',
      message: error.message
    });
  }
});

/**
 * POST /api/periods/refresh
 * Manually refresh the period cache (admin only)
 * Useful after new Oracle data is synced
 */
router.post('/refresh', authenticate, requireRole('admin'), async (req, res) => {
  try {
    await PeriodDataService.refreshCache();
    
    res.json({
      success: true,
      message: 'Period cache refreshed successfully',
      data: {
        years: PeriodDataService.periodCache.years,
        cacheAge: PeriodDataService.getCacheAge()
      }
    });
  } catch (error) {
    logger.error(`Error refreshing period cache: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh period cache',
      message: error.message
    });
  }
});

/**
 * POST /api/periods/validate
 * Validate if a year/month/type is available
 */
router.post('/validate', authenticate, (req, res) => {
  try {
    const { year, month, type } = req.body;
    
    const validation = {
      year: year ? PeriodDataService.isYearAvailable(year) : null,
      month: month ? PeriodDataService.isMonthAvailable(month) : null,
      type: type ? PeriodDataService.isTypeAvailable(type) : null
    };

    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    logger.error(`Error validating period: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to validate period',
      message: error.message
    });
  }
});

module.exports = router;

