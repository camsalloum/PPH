/**
 * Prometheus Metrics Exporter
 * Exposes metrics in Prometheus format for scraping
 */

// Metrics storage
const metrics = {
  // Counters
  http_requests_total: {},
  http_errors_total: {},
  
  // Gauges
  http_request_duration_seconds: { sum: 0, count: 0, buckets: {} },
  nodejs_heap_size_bytes: 0,
  nodejs_external_memory_bytes: 0,
  nodejs_active_handles: 0,
  nodejs_active_requests: 0,
  
  // Info
  app_info: {
    version: process.env.npm_package_version || '1.0.0',
    node_version: process.version,
    start_time: Date.now()
  }
};

// Histogram buckets for response time (in seconds)
const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/**
 * Initialize duration buckets
 */
function initDurationBuckets() {
  metrics.http_request_duration_seconds.buckets = {};
  DURATION_BUCKETS.forEach(bucket => {
    metrics.http_request_duration_seconds.buckets[bucket] = 0;
  });
  metrics.http_request_duration_seconds.buckets['+Inf'] = 0;
}
initDurationBuckets();

/**
 * Record an HTTP request
 * @param {string} method - HTTP method
 * @param {string} path - Request path
 * @param {number} statusCode - Response status code
 * @param {number} duration - Request duration in milliseconds
 */
function recordRequest(method, path, statusCode, duration) {
  const labels = `method="${method}",path="${normalizePath(path)}",status="${statusCode}"`;
  
  // Increment request counter
  if (!metrics.http_requests_total[labels]) {
    metrics.http_requests_total[labels] = 0;
  }
  metrics.http_requests_total[labels]++;
  
  // Record errors
  if (statusCode >= 400) {
    const errorLabels = `method="${method}",status="${statusCode}"`;
    if (!metrics.http_errors_total[errorLabels]) {
      metrics.http_errors_total[errorLabels] = 0;
    }
    metrics.http_errors_total[errorLabels]++;
  }
  
  // Record duration
  const durationSec = duration / 1000;
  metrics.http_request_duration_seconds.sum += durationSec;
  metrics.http_request_duration_seconds.count++;
  
  // Update histogram buckets
  for (const bucket of DURATION_BUCKETS) {
    if (durationSec <= bucket) {
      metrics.http_request_duration_seconds.buckets[bucket]++;
    }
  }
  metrics.http_request_duration_seconds.buckets['+Inf']++;
}

/**
 * Normalize path to prevent high cardinality
 * @param {string} path - Original path
 * @returns {string} Normalized path
 */
function normalizePath(path) {
  // Remove query string
  const cleanPath = path.split('?')[0];
  
  // Replace numeric IDs with :id
  return cleanPath
    .replace(/\/\d+/g, '/:id')
    .replace(/\/[a-f0-9-]{36}/gi, '/:uuid'); // UUIDs
}

/**
 * Update Node.js runtime metrics
 */
function updateRuntimeMetrics() {
  const memUsage = process.memoryUsage();
  metrics.nodejs_heap_size_bytes = memUsage.heapUsed;
  metrics.nodejs_external_memory_bytes = memUsage.external;
  
  // Active handles and requests (Node.js internals)
  if (process._getActiveHandles) {
    metrics.nodejs_active_handles = process._getActiveHandles().length;
  }
  if (process._getActiveRequests) {
    metrics.nodejs_active_requests = process._getActiveRequests().length;
  }
}

/**
 * Generate Prometheus-formatted metrics output
 * @returns {string} Prometheus metrics text
 */
function generateMetrics() {
  updateRuntimeMetrics();
  
  const lines = [];
  
  // Application info
  lines.push('# HELP app_info Application information');
  lines.push('# TYPE app_info gauge');
  lines.push(`app_info{version="${metrics.app_info.version}",node_version="${metrics.app_info.node_version}"} 1`);
  
  // Uptime
  lines.push('# HELP app_uptime_seconds Application uptime in seconds');
  lines.push('# TYPE app_uptime_seconds gauge');
  lines.push(`app_uptime_seconds ${(Date.now() - metrics.app_info.start_time) / 1000}`);
  
  // HTTP requests total
  lines.push('# HELP http_requests_total Total number of HTTP requests');
  lines.push('# TYPE http_requests_total counter');
  for (const [labels, value] of Object.entries(metrics.http_requests_total)) {
    lines.push(`http_requests_total{${labels}} ${value}`);
  }
  
  // HTTP errors total
  lines.push('# HELP http_errors_total Total number of HTTP errors');
  lines.push('# TYPE http_errors_total counter');
  for (const [labels, value] of Object.entries(metrics.http_errors_total)) {
    lines.push(`http_errors_total{${labels}} ${value}`);
  }
  
  // HTTP request duration histogram
  lines.push('# HELP http_request_duration_seconds HTTP request duration in seconds');
  lines.push('# TYPE http_request_duration_seconds histogram');
  for (const [bucket, count] of Object.entries(metrics.http_request_duration_seconds.buckets)) {
    const le = bucket === '+Inf' ? '+Inf' : bucket;
    lines.push(`http_request_duration_seconds_bucket{le="${le}"} ${count}`);
  }
  lines.push(`http_request_duration_seconds_sum ${metrics.http_request_duration_seconds.sum}`);
  lines.push(`http_request_duration_seconds_count ${metrics.http_request_duration_seconds.count}`);
  
  // Node.js memory
  lines.push('# HELP nodejs_heap_size_bytes Node.js heap size in bytes');
  lines.push('# TYPE nodejs_heap_size_bytes gauge');
  lines.push(`nodejs_heap_size_bytes ${metrics.nodejs_heap_size_bytes}`);
  
  lines.push('# HELP nodejs_external_memory_bytes Node.js external memory in bytes');
  lines.push('# TYPE nodejs_external_memory_bytes gauge');
  lines.push(`nodejs_external_memory_bytes ${metrics.nodejs_external_memory_bytes}`);
  
  // Node.js handles
  lines.push('# HELP nodejs_active_handles Number of active handles');
  lines.push('# TYPE nodejs_active_handles gauge');
  lines.push(`nodejs_active_handles ${metrics.nodejs_active_handles}`);
  
  lines.push('# HELP nodejs_active_requests Number of active requests');
  lines.push('# TYPE nodejs_active_requests gauge');
  lines.push(`nodejs_active_requests ${metrics.nodejs_active_requests}`);
  
  return lines.join('\n') + '\n';
}

/**
 * Express middleware to collect metrics
 */
function metricsMiddleware(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    recordRequest(req.method, req.path, res.statusCode, duration);
  });
  
  next();
}

/**
 * Express route handler for /metrics endpoint
 */
function metricsEndpoint(req, res) {
  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(generateMetrics());
}

/**
 * Reset all metrics (useful for testing)
 */
function resetMetrics() {
  metrics.http_requests_total = {};
  metrics.http_errors_total = {};
  metrics.http_request_duration_seconds = { sum: 0, count: 0, buckets: {} };
  initDurationBuckets();
}

module.exports = {
  recordRequest,
  generateMetrics,
  metricsMiddleware,
  metricsEndpoint,
  resetMetrics,
  metrics
};
