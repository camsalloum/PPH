/**
 * Metrics Route for Prometheus Scraping
 * 
 * Exposes /metrics endpoint for Prometheus to scrape
 * server performance metrics and health data.
 * 
 * @module routes/metrics
 */

const express = require('express');
const router = express.Router();

// Try to import prometheus middleware
let prometheusMiddleware;
try {
  prometheusMiddleware = require('../middleware/prometheus');
} catch (e) {
  console.warn('[Metrics] Prometheus middleware not available:', e.message);
}

// Try to import db health utilities
let dbHealth;
try {
  dbHealth = require('../utils/dbHealth');
} catch (e) {
  console.warn('[Metrics] Database health utilities not available:', e.message);
}

/**
 * @swagger
 * /api/metrics:
 *   get:
 *     summary: Get Prometheus metrics
 *     description: Returns metrics in Prometheus format for scraping
 *     tags: [Monitoring]
 *     security: []
 *     responses:
 *       200:
 *         description: Prometheus metrics
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: |
 *                 # HELP http_requests_total Total HTTP requests
 *                 # TYPE http_requests_total counter
 *                 http_requests_total{method="GET",path="/api/health",status="200"} 42
 */
router.get('/', async (req, res) => {
  try {
    let metricsOutput = '';
    
    // Get Prometheus metrics if available
    if (prometheusMiddleware && typeof prometheusMiddleware.getMetrics === 'function') {
      metricsOutput = prometheusMiddleware.getMetrics();
    } else {
      // Fallback basic metrics
      const used = process.memoryUsage();
      const uptime = process.uptime();
      
      metricsOutput = `# HELP nodejs_memory_heap_used_bytes Node.js heap memory used
# TYPE nodejs_memory_heap_used_bytes gauge
nodejs_memory_heap_used_bytes ${used.heapUsed}

# HELP nodejs_memory_heap_total_bytes Node.js total heap memory
# TYPE nodejs_memory_heap_total_bytes gauge
nodejs_memory_heap_total_bytes ${used.heapTotal}

# HELP nodejs_memory_external_bytes Node.js external memory
# TYPE nodejs_memory_external_bytes gauge
nodejs_memory_external_bytes ${used.external}

# HELP nodejs_memory_rss_bytes Node.js resident set size
# TYPE nodejs_memory_rss_bytes gauge
nodejs_memory_rss_bytes ${used.rss}

# HELP process_uptime_seconds Process uptime in seconds
# TYPE process_uptime_seconds gauge
process_uptime_seconds ${uptime}

# HELP nodejs_version_info Node.js version info
# TYPE nodejs_version_info gauge
nodejs_version_info{version="${process.version}"} 1
`;
    }
    
    // Add database metrics if available
    if (dbHealth && typeof dbHealth.getPoolStatus === 'function') {
      try {
        const poolStatus = await dbHealth.getPoolStatus();
        metricsOutput += `
# HELP db_pool_total_connections Total database pool connections
# TYPE db_pool_total_connections gauge
db_pool_total_connections ${poolStatus.total || 0}

# HELP db_pool_idle_connections Idle database pool connections
# TYPE db_pool_idle_connections gauge
db_pool_idle_connections ${poolStatus.idle || 0}

# HELP db_pool_waiting_connections Waiting database pool connections
# TYPE db_pool_waiting_connections gauge
db_pool_waiting_connections ${poolStatus.waiting || 0}
`;
      } catch (dbErr) {
        metricsOutput += `
# HELP db_connection_error Database connection error
# TYPE db_connection_error gauge
db_connection_error 1
`;
      }
    }
    
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(metricsOutput);
  } catch (error) {
    console.error('[Metrics] Error generating metrics:', error);
    res.status(500).send('# Error generating metrics\n');
  }
});

/**
 * @swagger
 * /api/metrics/health:
 *   get:
 *     summary: Detailed health metrics
 *     description: Returns detailed health metrics including database status
 *     tags: [Monitoring]
 *     security: []
 *     responses:
 *       200:
 *         description: Health metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 uptime:
 *                   type: number
 *                   example: 3600.5
 *                 memory:
 *                   type: object
 *                 database:
 *                   type: object
 */
router.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || 'development'
  };
  
  // Check database health if available
  if (dbHealth && typeof dbHealth.checkDatabaseHealth === 'function') {
    try {
      health.database = await dbHealth.checkDatabaseHealth();
    } catch (error) {
      health.database = { status: 'error', message: error.message };
      health.status = 'degraded';
    }
  }
  
  // Check memory thresholds
  const heapUsedPercent = (health.memory.heapUsed / health.memory.heapTotal) * 100;
  if (heapUsedPercent > 90) {
    health.status = 'degraded';
    health.warnings = health.warnings || [];
    health.warnings.push(`High memory usage: ${heapUsedPercent.toFixed(1)}%`);
  }
  
  res.json(health);
});

/**
 * @swagger
 * /api/metrics/summary:
 *   get:
 *     summary: Get metrics summary in JSON format
 *     description: Returns a JSON summary of current metrics
 *     tags: [Monitoring]
 *     security: []
 *     responses:
 *       200:
 *         description: Metrics summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.get('/summary', async (req, res) => {
  try {
    const summary = {
      timestamp: new Date().toISOString(),
      process: {
        uptime: process.uptime(),
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      },
      memory: {
        heapUsed: process.memoryUsage().heapUsed,
        heapTotal: process.memoryUsage().heapTotal,
        external: process.memoryUsage().external,
        rss: process.memoryUsage().rss,
        heapUsedPercent: ((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100).toFixed(2) + '%'
      },
      cpu: process.cpuUsage()
    };
    
    // Add request stats if prometheus middleware available
    if (prometheusMiddleware && typeof prometheusMiddleware.getStats === 'function') {
      summary.requests = prometheusMiddleware.getStats();
    }
    
    // Add database pool status if available
    if (dbHealth && typeof dbHealth.getPoolStatus === 'function') {
      try {
        summary.database = await dbHealth.getPoolStatus();
      } catch (e) {
        summary.database = { error: e.message };
      }
    }
    
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate metrics summary', message: error.message });
  }
});

module.exports = router;
