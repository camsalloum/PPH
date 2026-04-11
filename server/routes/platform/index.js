/**
 * ============================================================================
 * PLATFORM ROUTES INDEX
 * ============================================================================
 * 
 * Central router for all platform administration routes.
 * These routes manage the SaaS platform itself.
 * 
 * Created: December 28, 2025
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const poolManager = require('../../database/multiTenantPool');
const CompanyService = require('../../services/CompanyService');
const logger = require('../../utils/logger');

// Import sub-routers
const companiesRouter = require('./companies');
const authRouter = require('./auth');
const tenantMetricsRouter = require('./tenantMetrics');

// Mount sub-routers
router.use('/companies', companiesRouter);
router.use('/auth', authRouter);
router.use('/tenant-metrics', tenantMetricsRouter);

// ============================================================================
// PLATFORM HEALTH & INFO
// ============================================================================

/**
 * GET /api/platform/health
 * Platform health check
 */
router.get('/health', async (req, res) => {
  try {
    // Check platform database connection
    await poolManager.platformQuery('SELECT 1');

    res.json({
      success: true,
      module: 'Platform',
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      module: 'Platform',
      status: 'unhealthy',
      error: error.message,
    });
  }
});

/**
 * GET /api/platform/stats
 * Platform statistics (platform admin only)
 */
router.get('/stats', async (req, res) => {
  try {
    // Verify platform admin token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const platformAuthService = require('../../services/platformAuthService');
    const token = authHeader.substring(7);
    const decoded = await platformAuthService.verifyToken(token);

    if (!decoded.isPlatformAdmin) {
      return res.status(403).json({ error: 'Platform admin access required' });
    }

    const stats = await CompanyService.getPlatformStats();
    const poolStats = poolManager.getStats();

    res.json({
      success: true,
      data: {
        ...stats,
        database_pools: poolStats,
      },
    });
  } catch (error) {
    logger.error('[Platform] Error getting stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/platform/plans
 * Get subscription plans
 */
router.get('/plans', async (req, res) => {
  try {
    const plans = await CompanyService.getPlans();

    res.json({
      success: true,
      data: plans,
    });
  } catch (error) {
    logger.error('[Platform] Error getting plans:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/platform/pools
 * Get database pool statistics (platform admin only)
 */
router.get('/pools', async (req, res) => {
  try {
    // Verify platform admin token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const platformAuthService = require('../../services/platformAuthService');
    const token = authHeader.substring(7);
    const decoded = await platformAuthService.verifyToken(token);

    if (!decoded.isPlatformAdmin) {
      return res.status(403).json({ error: 'Platform admin access required' });
    }

    const stats = poolManager.getStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('[Platform] Error getting pool stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
