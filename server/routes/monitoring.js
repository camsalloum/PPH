/**
 * @fileoverview Monitoring and observability routes
 * @module routes/monitoring
 * @description Health checks, metrics, and system status endpoints
 * 
 * Routes:
 * - GET /health - Quick health check
 * - GET /health/deep - Deep health check with all components
 * - GET /metrics - System metrics
 * - GET /ready - Readiness probe (Kubernetes)
 * - GET /live - Liveness probe (Kubernetes)
 * - GET /errors - Error statistics
 * 
 * @created 2024-12-06
 */

const express = require('express');
const router = express.Router();

const { 
  healthCheckMiddleware, 
  metricsEndpoint,
  readinessProbe,
  livenessProbe 
} = require('../middleware/monitoring');
const { getErrorStats, getRecentErrors } = require('../services/errorTracking');
const logger = require('../utils/logger');

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Quick health check
 *     description: Returns basic health status of the service
 *     tags: [Monitoring]
 *     security: []
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthCheck'
 */
router.get('/health', healthCheckMiddleware());

/**
 * @swagger
 * /api/health/deep:
 *   get:
 *     summary: Deep health check
 *     description: Returns detailed health status of all components (database, cache, memory, CPU)
 *     tags: [Monitoring]
 *     security: []
 *     responses:
 *       200:
 *         description: All components healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthCheckDeep'
 *       207:
 *         description: Service degraded (some components unhealthy)
 *       503:
 *         description: Service unhealthy
 */
router.get('/health/deep', healthCheckMiddleware());

/**
 * @swagger
 * /api/metrics:
 *   get:
 *     summary: System metrics
 *     description: Returns performance and usage metrics including request counts, memory usage, and error rates
 *     tags: [Monitoring]
 *     security: []
 *     responses:
 *       200:
 *         description: Metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Metrics'
 */
router.get('/metrics', metricsEndpoint);

/**
 * @swagger
 * /api/ready:
 *   get:
 *     summary: Readiness probe
 *     description: Kubernetes readiness probe - checks if service is ready to receive traffic
 *     tags: [Monitoring]
 *     security: []
 *     responses:
 *       200:
 *         description: Service is ready
 *       503:
 *         description: Service is not ready
 */
router.get('/ready', readinessProbe());

/**
 * @swagger
 * /api/live:
 *   get:
 *     summary: Liveness probe
 *     description: Kubernetes liveness probe - checks if service is alive
 *     tags: [Monitoring]
 *     security: []
 *     responses:
 *       200:
 *         description: Service is alive
 */
router.get('/live', livenessProbe);

/**
 * @swagger
 * /api/errors:
 *   get:
 *     summary: Error statistics
 *     description: Returns aggregated error statistics for the last hour
 *     tags: [Monitoring]
 *     security: []
 *     responses:
 *       200:
 *         description: Error statistics retrieved successfully
 */

/**
 * GET /errors - Error statistics
 * Returns error tracking statistics
 */
router.get('/errors', async (req, res) => {
  try {
    const stats = getErrorStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get error stats', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve error statistics'
    });
  }
});

/**
 * GET /errors/recent - Recent errors
 * Returns list of recent errors with filters
 * Query params:
 * - limit: Number of errors to return (default: 50)
 * - category: Filter by category
 * - severity: Filter by severity
 */
router.get('/errors/recent', async (req, res) => {
  try {
    const { limit, category, severity } = req.query;
    const options = {
      limit: limit ? parseInt(limit) : 50,
      category: category || null,
      severity: severity || null
    };
    
    const errors = getRecentErrors(options);
    
    res.json({
      success: true,
      count: errors.length,
      data: errors
    });
  } catch (error) {
    logger.error('Failed to get recent errors', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve recent errors'
    });
  }
});

module.exports = router;
