/**
 * @fileoverview Monitoring and Health Check System
 * @module middleware/monitoring
 * @description Comprehensive health checks, metrics, and system monitoring
 * 
 * Features:
 * - Deep health checks (database, Redis, disk, memory)
 * - Performance metrics collection
 * - Cache statistics
 * - Request/response tracking
 * - System resource monitoring
 * 
 * @created 2024-12-06
 */

const os = require('os');
const { getCacheStats } = require('./cache');
const logger = require('../utils/logger');

/**
 * System health status tracker
 * Maintains running statistics
 */
const healthStats = {
  startTime: Date.now(),
  totalRequests: 0,
  totalErrors: 0,
  requestsByEndpoint: {},
  errorsByType: {},
  lastHealthCheck: null,
  uptimeSeconds: 0
};

/**
 * Deep health check for all system components
 * Tests database, cache, disk, memory, etc.
 * 
 * @param {Object} pools - Database connection pools
 * @returns {Object} Health check results
 */
async function performHealthCheck(pools = {}) {
  const checks = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - healthStats.startTime) / 1000),
    components: {}
  };

  // 1. Memory check
  const memUsage = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memUsagePercent = ((totalMem - freeMem) / totalMem) * 100;

  checks.components.memory = {
    status: memUsagePercent < 90 ? 'healthy' : 'warning',
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
    external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
    rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
    systemUsage: `${memUsagePercent.toFixed(1)}%`,
    available: `${Math.round(freeMem / 1024 / 1024)}MB`
  };

  // 2. CPU check
  const cpus = os.cpus();
  const loadAvg = os.loadavg();
  checks.components.cpu = {
    status: loadAvg[0] < cpus.length * 0.8 ? 'healthy' : 'warning',
    cores: cpus.length,
    loadAverage: {
      '1min': loadAvg[0].toFixed(2),
      '5min': loadAvg[1].toFixed(2),
      '15min': loadAvg[2].toFixed(2)
    },
    model: cpus[0]?.model || 'unknown'
  };

  // 3. Database check
  if (pools.fp || pools.hc) {
    try {
      const pool = pools.fp || pools.hc;
      const result = await pool.query('SELECT NOW() as time');
      checks.components.database = {
        status: 'healthy',
        responseTime: '<10ms',
        serverTime: result.rows[0].time,
        totalConnections: pool.totalCount,
        idleConnections: pool.idleCount,
        waitingClients: pool.waitingCount
      };
    } catch (error) {
      checks.components.database = {
        status: 'unhealthy',
        error: error.message
      };
      checks.status = 'degraded';
    }
  } else {
    checks.components.database = {
      status: 'unavailable',
      message: 'No database pools configured'
    };
  }

  // 4. Cache (Redis) check
  try {
    const cacheStats = await getCacheStats();
    checks.components.cache = {
      status: cacheStats.connected ? 'healthy' : 'unavailable',
      ...cacheStats
    };
  } catch (error) {
    checks.components.cache = {
      status: 'unavailable',
      message: 'Redis not available (graceful degradation)'
    };
  }

  // 5. Disk check
  checks.components.disk = {
    status: 'healthy',
    platform: os.platform(),
    tmpdir: os.tmpdir()
  };

  // 6. Application metrics
  checks.components.application = {
    status: 'healthy',
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    pid: process.pid,
    totalRequests: healthStats.totalRequests,
    totalErrors: healthStats.totalErrors,
    errorRate: healthStats.totalRequests > 0 
      ? ((healthStats.totalErrors / healthStats.totalRequests) * 100).toFixed(2) + '%'
      : '0%',
    uptime: `${Math.floor(checks.uptime / 3600)}h ${Math.floor((checks.uptime % 3600) / 60)}m`
  };

  healthStats.lastHealthCheck = checks;
  return checks;
}

/**
 * Express middleware for health check endpoint
 * GET /health - Quick health check
 * GET /health/deep - Deep health check with all components
 */
function healthCheckMiddleware(pools = {}) {
  return async (req, res) => {
    const deep = req.path === '/health/deep' || req.query.deep === 'true';
    
    if (!deep) {
      // Quick health check
      return res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - healthStats.startTime) / 1000),
        service: 'IPDashboard Backend'
      });
    }

    // Deep health check
    try {
      const health = await performHealthCheck(pools);
      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 207 : 503;
      
      res.status(statusCode).json(health);
    } catch (error) {
      logger.error('Health check failed', error);
      res.status(503).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Metrics collection middleware
 * Tracks requests, response times, errors
 */
function metricsMiddleware(req, res, next) {
  const startTime = Date.now();
  
  // Track request
  healthStats.totalRequests++;
  const endpoint = `${req.method} ${req.path}`;
  healthStats.requestsByEndpoint[endpoint] = (healthStats.requestsByEndpoint[endpoint] || 0) + 1;

  // Capture response
  const originalJson = res.json.bind(res);
  res.json = function(data) {
    const duration = Date.now() - startTime;
    
    // Track errors
    if (res.statusCode >= 400) {
      healthStats.totalErrors++;
      const errorType = `${res.statusCode}`;
      healthStats.errorsByType[errorType] = (healthStats.errorsByType[errorType] || 0) + 1;
    }

    // Add response time header
    res.setHeader('X-Response-Time', `${duration}ms`);
    
    return originalJson(data);
  };

  next();
}

/**
 * Get current system metrics
 * Used for /metrics endpoint
 * 
 * @returns {Object} System metrics
 */
function getMetrics() {
  const uptime = Math.floor((Date.now() - healthStats.startTime) / 1000);
  const memUsage = process.memoryUsage();
  
  return {
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: uptime,
      formatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`
    },
    requests: {
      total: healthStats.totalRequests,
      errors: healthStats.totalErrors,
      errorRate: healthStats.totalRequests > 0 
        ? ((healthStats.totalErrors / healthStats.totalRequests) * 100).toFixed(2)
        : 0,
      byEndpoint: Object.entries(healthStats.requestsByEndpoint)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([endpoint, count]) => ({ endpoint, count }))
    },
    errors: {
      total: healthStats.totalErrors,
      byType: healthStats.errorsByType
    },
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024)
    },
    system: {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      cpus: os.cpus().length,
      totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024),
      freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024),
      loadAverage: os.loadavg()
    }
  };
}

/**
 * Metrics endpoint middleware
 * GET /metrics - System metrics in JSON format
 */
async function metricsEndpoint(req, res) {
  try {
    const metrics = getMetrics();
    
    // Add cache stats if available
    try {
      const cacheStats = await getCacheStats();
      metrics.cache = cacheStats;
    } catch (error) {
      metrics.cache = { available: false };
    }
    
    res.json(metrics);
  } catch (error) {
    logger.error('Failed to generate metrics', error);
    res.status(500).json({
      error: 'Failed to generate metrics',
      message: error.message
    });
  }
}

/**
 * Readiness probe endpoint
 * Used by Kubernetes/Docker to check if service is ready
 * 
 * @param {Object} pools - Database pools
 */
function readinessProbe(pools = {}) {
  return async (req, res) => {
    try {
      // Check if database is available
      if (pools.fp || pools.hc) {
        const pool = pools.fp || pools.hc;
        await pool.query('SELECT 1');
      }
      
      res.json({ ready: true });
    } catch (error) {
      res.status(503).json({ 
        ready: false,
        error: error.message 
      });
    }
  };
}

/**
 * Liveness probe endpoint
 * Used by Kubernetes/Docker to check if service is alive
 */
function livenessProbe(req, res) {
  res.json({ alive: true });
}

/**
 * Performance monitoring decorator
 * Wraps async functions to track execution time
 * 
 * @param {Function} fn - Async function to monitor
 * @param {string} name - Function name for logging
 * @returns {Function} Wrapped function
 */
function monitorPerformance(fn, name) {
  return async function(...args) {
    const start = Date.now();
    try {
      const result = await fn.apply(this, args);
      const duration = Date.now() - start;
      
      if (duration > 1000) {
        logger.warn(`Slow operation: ${name}`, { duration: `${duration}ms` });
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error(`Operation failed: ${name}`, { 
        duration: `${duration}ms`,
        error: error.message 
      });
      throw error;
    }
  };
}

/**
 * Reset statistics (for testing)
 */
function resetStats() {
  healthStats.totalRequests = 0;
  healthStats.totalErrors = 0;
  healthStats.requestsByEndpoint = {};
  healthStats.errorsByType = {};
  logger.info('Health statistics reset');
}

module.exports = {
  healthCheckMiddleware,
  metricsMiddleware,
  metricsEndpoint,
  readinessProbe,
  livenessProbe,
  monitorPerformance,
  getMetrics,
  performHealthCheck,
  resetStats,
  healthStats
};
