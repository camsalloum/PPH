/**
 * Alert Configuration Module
 * 
 * Provides webhook integrations for PagerDuty, Slack, and email alerts
 * for production monitoring and incident response.
 * 
 * @module config/alerting
 */

const https = require('https');
const http = require('http');

/**
 * Alert severity levels
 */
const SEVERITY = {
  CRITICAL: 'critical',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

/**
 * Alert configuration from environment
 */
const config = {
  pagerduty: {
    enabled: process.env.PAGERDUTY_ENABLED === 'true',
    routingKey: process.env.PAGERDUTY_ROUTING_KEY,
    apiUrl: 'https://events.pagerduty.com/v2/enqueue'
  },
  slack: {
    enabled: process.env.SLACK_ALERTS_ENABLED === 'true',
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
    channel: process.env.SLACK_ALERT_CHANNEL || '#alerts'
  },
  email: {
    enabled: process.env.EMAIL_ALERTS_ENABLED === 'true',
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT || 587,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    fromAddress: process.env.ALERT_FROM_EMAIL,
    toAddresses: (process.env.ALERT_TO_EMAILS || '').split(',').filter(Boolean)
  },
  // Rate limiting to prevent alert storms
  rateLimiting: {
    enabled: true,
    windowMs: 60000, // 1 minute
    maxAlertsPerWindow: 10,
    cooldownMs: 300000 // 5 minute cooldown after hitting limit
  }
};

// In-memory rate limiting state
const alertState = {
  counts: {},
  lastReset: Date.now(),
  inCooldown: false,
  cooldownUntil: 0
};

/**
 * Check if alerts are rate limited
 * @returns {boolean}
 */
function isRateLimited() {
  if (!config.rateLimiting.enabled) return false;
  
  const now = Date.now();
  
  // Check cooldown
  if (alertState.inCooldown) {
    if (now < alertState.cooldownUntil) {
      return true;
    }
    alertState.inCooldown = false;
  }
  
  // Reset window if needed
  if (now - alertState.lastReset > config.rateLimiting.windowMs) {
    alertState.counts = {};
    alertState.lastReset = now;
  }
  
  return false;
}

/**
 * Record an alert for rate limiting
 * @param {string} alertType 
 */
function recordAlert(alertType) {
  if (!config.rateLimiting.enabled) return;
  
  alertState.counts[alertType] = (alertState.counts[alertType] || 0) + 1;
  
  const totalAlerts = Object.values(alertState.counts).reduce((a, b) => a + b, 0);
  
  if (totalAlerts >= config.rateLimiting.maxAlertsPerWindow) {
    alertState.inCooldown = true;
    alertState.cooldownUntil = Date.now() + config.rateLimiting.cooldownMs;
    console.warn('[Alerting] Rate limit reached, entering cooldown');
  }
}

/**
 * Send HTTP request
 * @param {string} url 
 * @param {Object} data 
 * @param {Object} headers 
 * @returns {Promise<Object>}
 */
function sendHttpRequest(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const lib = isHttps ? https : http;
    
    const payload = JSON.stringify(data);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers
      }
    };
    
    const req = lib.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Send alert to PagerDuty
 * @param {Object} alert 
 * @returns {Promise<Object>}
 */
async function sendToPagerDuty(alert) {
  if (!config.pagerduty.enabled || !config.pagerduty.routingKey) {
    return { skipped: true, reason: 'PagerDuty not configured' };
  }
  
  const severity = {
    [SEVERITY.CRITICAL]: 'critical',
    [SEVERITY.ERROR]: 'error',
    [SEVERITY.WARNING]: 'warning',
    [SEVERITY.INFO]: 'info'
  }[alert.severity] || 'error';
  
  const payload = {
    routing_key: config.pagerduty.routingKey,
    event_action: 'trigger',
    dedup_key: alert.dedupKey || `${alert.source}-${alert.title}-${Date.now()}`,
    payload: {
      summary: alert.title,
      source: alert.source || 'IPD API Server',
      severity,
      timestamp: new Date().toISOString(),
      custom_details: {
        description: alert.description,
        environment: process.env.NODE_ENV,
        hostname: process.env.HOSTNAME,
        ...alert.metadata
      }
    }
  };
  
  try {
    const result = await sendHttpRequest(config.pagerduty.apiUrl, payload);
    return { success: true, ...result };
  } catch (error) {
    console.error('[Alerting] PagerDuty error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send alert to Slack
 * @param {Object} alert 
 * @returns {Promise<Object>}
 */
async function sendToSlack(alert) {
  if (!config.slack.enabled || !config.slack.webhookUrl) {
    return { skipped: true, reason: 'Slack not configured' };
  }
  
  const colorMap = {
    [SEVERITY.CRITICAL]: '#FF0000',
    [SEVERITY.ERROR]: '#E01E5A',
    [SEVERITY.WARNING]: '#ECB22E',
    [SEVERITY.INFO]: '#36A64F'
  };
  
  const emojiMap = {
    [SEVERITY.CRITICAL]: '🚨',
    [SEVERITY.ERROR]: '❌',
    [SEVERITY.WARNING]: '⚠️',
    [SEVERITY.INFO]: 'ℹ️'
  };
  
  const payload = {
    channel: config.slack.channel,
    username: 'IPD Alert Bot',
    icon_emoji: ':robot_face:',
    attachments: [{
      color: colorMap[alert.severity] || '#808080',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${emojiMap[alert.severity] || '📢'} ${alert.title}`,
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: alert.description
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `*Environment:* ${process.env.NODE_ENV || 'development'}`
            },
            {
              type: 'mrkdwn',
              text: `*Source:* ${alert.source || 'API Server'}`
            },
            {
              type: 'mrkdwn',
              text: `*Time:* ${new Date().toISOString()}`
            }
          ]
        }
      ]
    }]
  };
  
  // Add metadata as fields if present
  if (alert.metadata && Object.keys(alert.metadata).length > 0) {
    payload.attachments[0].blocks.push({
      type: 'section',
      fields: Object.entries(alert.metadata).slice(0, 10).map(([key, value]) => ({
        type: 'mrkdwn',
        text: `*${key}:*\n${String(value).substring(0, 100)}`
      }))
    });
  }
  
  // Add action buttons for critical alerts
  if (alert.severity === SEVERITY.CRITICAL) {
    payload.attachments[0].blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '📊 View Dashboard',
            emoji: true
          },
          url: process.env.DASHBOARD_URL || 'http://localhost:3000/dashboard'
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '📋 View Logs',
            emoji: true
          },
          url: process.env.LOGS_URL || 'http://localhost:3000/logs'
        }
      ]
    });
  }
  
  try {
    const result = await sendHttpRequest(config.slack.webhookUrl, payload);
    return { success: true, ...result };
  } catch (error) {
    console.error('[Alerting] Slack error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Main alert function - sends to all configured channels
 * @param {Object} options Alert options
 * @param {string} options.title Alert title
 * @param {string} options.description Alert description
 * @param {string} options.severity Alert severity (critical, error, warning, info)
 * @param {string} [options.source] Alert source
 * @param {string} [options.dedupKey] Deduplication key for PagerDuty
 * @param {Object} [options.metadata] Additional metadata
 * @param {Array<string>} [options.channels] Specific channels to use (pagerduty, slack, email)
 * @returns {Promise<Object>}
 */
async function sendAlert(options) {
  const {
    title,
    description,
    severity = SEVERITY.ERROR,
    source = 'IPD API Server',
    dedupKey,
    metadata = {},
    channels = ['pagerduty', 'slack']
  } = options;
  
  // Check rate limiting
  if (isRateLimited()) {
    console.warn('[Alerting] Alert suppressed due to rate limiting:', title);
    return { 
      suppressed: true, 
      reason: 'Rate limited',
      cooldownUntil: alertState.cooldownUntil 
    };
  }
  
  recordAlert(severity);
  
  const alert = {
    title,
    description,
    severity,
    source,
    dedupKey,
    metadata: {
      ...metadata,
      alertTime: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV
    }
  };
  
  const results = {};
  
  // Send to configured channels
  const promises = [];
  
  if (channels.includes('pagerduty')) {
    promises.push(
      sendToPagerDuty(alert).then(r => results.pagerduty = r)
    );
  }
  
  if (channels.includes('slack')) {
    promises.push(
      sendToSlack(alert).then(r => results.slack = r)
    );
  }
  
  await Promise.allSettled(promises);
  
  console.log('[Alerting] Alert sent:', {
    title,
    severity,
    results: Object.fromEntries(
      Object.entries(results).map(([k, v]) => [k, v.success || v.skipped ? 'OK' : 'FAILED'])
    )
  });
  
  return results;
}

/**
 * Convenience functions for different severity levels
 */
const alert = {
  critical: (title, description, options = {}) => 
    sendAlert({ ...options, title, description, severity: SEVERITY.CRITICAL }),
  
  error: (title, description, options = {}) => 
    sendAlert({ ...options, title, description, severity: SEVERITY.ERROR }),
  
  warning: (title, description, options = {}) => 
    sendAlert({ ...options, title, description, severity: SEVERITY.WARNING }),
  
  info: (title, description, options = {}) => 
    sendAlert({ ...options, title, description, severity: SEVERITY.INFO })
};

/**
 * Predefined alert templates for common scenarios
 */
const templates = {
  serverDown: (metadata = {}) => alert.critical(
    'Server Health Check Failed',
    'The API server is not responding to health checks. Immediate investigation required.',
    { metadata, channels: ['pagerduty', 'slack'] }
  ),
  
  databaseConnectionLost: (metadata = {}) => alert.critical(
    'Database Connection Lost',
    'Unable to connect to the database. Application may be experiencing data access issues.',
    { metadata, channels: ['pagerduty', 'slack'] }
  ),
  
  highErrorRate: (errorRate, threshold, metadata = {}) => alert.error(
    'High Error Rate Detected',
    `Error rate (${errorRate.toFixed(2)}%) has exceeded threshold (${threshold}%). Check application logs for details.`,
    { metadata: { errorRate, threshold, ...metadata }, channels: ['slack'] }
  ),
  
  highResponseTime: (avgTime, threshold, metadata = {}) => alert.warning(
    'High Response Time Detected',
    `Average response time (${avgTime}ms) has exceeded threshold (${threshold}ms). Consider scaling or optimization.`,
    { metadata: { avgTime, threshold, ...metadata }, channels: ['slack'] }
  ),
  
  memoryUsageHigh: (usagePercent, metadata = {}) => alert.warning(
    'High Memory Usage',
    `Memory usage at ${usagePercent.toFixed(1)}%. Consider restarting or scaling the application.`,
    { metadata: { usagePercent, ...metadata }, channels: ['slack'] }
  ),
  
  authenticationFailures: (count, window, metadata = {}) => alert.warning(
    'Multiple Authentication Failures',
    `${count} failed authentication attempts detected in the last ${window} minutes.`,
    { metadata: { failureCount: count, windowMinutes: window, ...metadata }, channels: ['slack'] }
  ),
  
  deploymentComplete: (version, metadata = {}) => alert.info(
    'Deployment Completed',
    `Successfully deployed version ${version} to ${process.env.NODE_ENV || 'development'}.`,
    { metadata: { version, ...metadata }, channels: ['slack'] }
  ),
  
  scheduledMaintenance: (startTime, duration, metadata = {}) => alert.info(
    'Scheduled Maintenance',
    `Scheduled maintenance starting at ${startTime} for approximately ${duration}.`,
    { metadata: { startTime, duration, ...metadata }, channels: ['slack'] }
  )
};

/**
 * Express middleware for automatic error alerting
 * @param {Object} options Middleware options
 * @returns {Function} Express middleware
 */
function alertOnError(options = {}) {
  const {
    minSeverity = 500,
    excludePaths = ['/health', '/metrics'],
    includeStackTrace = process.env.NODE_ENV !== 'production'
  } = options;
  
  return (err, req, res, next) => {
    // Skip certain paths
    if (excludePaths.some(p => req.path.startsWith(p))) {
      return next(err);
    }
    
    // Only alert for server errors by default
    const statusCode = err.status || err.statusCode || 500;
    if (statusCode < minSeverity) {
      return next(err);
    }
    
    // Send alert asynchronously
    alert.error(
      `API Error: ${statusCode} ${err.message || 'Unknown Error'}`,
      includeStackTrace ? err.stack : err.message,
      {
        metadata: {
          path: req.path,
          method: req.method,
          statusCode,
          userId: req.user?.id,
          requestId: req.requestId
        }
      }
    ).catch(alertErr => {
      console.error('[Alerting] Failed to send error alert:', alertErr.message);
    });
    
    next(err);
  };
}

/**
 * Health check monitor - periodically checks system health and alerts on issues
 */
class HealthMonitor {
  constructor(options = {}) {
    this.checkInterval = options.checkInterval || 60000; // 1 minute
    this.healthEndpoint = options.healthEndpoint || 'http://localhost:3000/api/health';
    this.consecutiveFailures = 0;
    this.failureThreshold = options.failureThreshold || 3;
    this.intervalId = null;
  }
  
  start() {
    if (this.intervalId) return;
    
    this.intervalId = setInterval(() => this.check(), this.checkInterval);
    console.log('[HealthMonitor] Started monitoring');
  }
  
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[HealthMonitor] Stopped monitoring');
    }
  }
  
  async check() {
    try {
      const response = await new Promise((resolve, reject) => {
        const req = http.get(this.healthEndpoint, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve({ statusCode: res.statusCode, body }));
        });
        req.on('error', reject);
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error('Health check timeout'));
        });
      });
      
      if (response.statusCode === 200) {
        this.consecutiveFailures = 0;
        return true;
      }
      
      throw new Error(`Health check returned ${response.statusCode}`);
    } catch (error) {
      this.consecutiveFailures++;
      
      console.error(`[HealthMonitor] Check failed (${this.consecutiveFailures}/${this.failureThreshold}):`, error.message);
      
      if (this.consecutiveFailures >= this.failureThreshold) {
        await templates.serverDown({
          consecutiveFailures: this.consecutiveFailures,
          lastError: error.message
        });
      }
      
      return false;
    }
  }
}

module.exports = {
  sendAlert,
  alert,
  templates,
  alertOnError,
  HealthMonitor,
  SEVERITY,
  config
};
