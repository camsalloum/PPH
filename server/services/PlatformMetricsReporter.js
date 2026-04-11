/**
 * ============================================================================
 * PLATFORM METRICS REPORTER SERVICE
 * ============================================================================
 * 
 * This service runs on the TENANT side to report metrics to the SaaS platform.
 * It collects local metrics (users, divisions, storage) and pushes them to
 * the platform API.
 * 
 * Security: Uses API Key + Secret for authentication
 * 
 * Schedule: Should run periodically (e.g., every hour or on user changes)
 * 
 * Created: December 28, 2025
 * ============================================================================
 */

const axios = require('axios');
const { pool, authPool } = require('../database/config');
const logger = require('../utils/logger');

class PlatformMetricsReporter {
  constructor() {
    // Platform API configuration
    this.platformUrl = process.env.PLATFORM_URL || 'http://localhost:5000';
    this.apiKey = process.env.PLATFORM_API_KEY;
    this.apiSecret = process.env.PLATFORM_API_SECRET;
    
    // Report interval (default: 1 hour)
    this.reportInterval = parseInt(process.env.METRICS_REPORT_INTERVAL) || 3600000;
    this.intervalId = null;
  }

  /**
   * Initialize the reporter
   */
  async init() {
    if (!this.apiKey || !this.apiSecret) {
      logger.warn('[MetricsReporter] Platform API credentials not configured. Metrics reporting disabled.');
      return false;
    }
    
    logger.info('[MetricsReporter] Initialized with platform URL:', this.platformUrl);
    return true;
  }

  /**
   * Collect metrics from local databases
   */
  async collectMetrics() {
    const metrics = {
      active_user_count: 0,
      total_user_count: 0,
      division_count: 0,
      storage_used_mb: 0,
      monthly_active_users: 0,
      data_records_count: 0,
      last_activity_at: null,
    };

    try {
      // Count users from auth database
      const usersResult = await authPool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE is_active = TRUE) as active_users,
          COUNT(*) as total_users,
          MAX(last_login) as last_activity
        FROM users
      `);
      
      if (usersResult.rows[0]) {
        metrics.active_user_count = parseInt(usersResult.rows[0].active_users) || 0;
        metrics.total_user_count = parseInt(usersResult.rows[0].total_users) || 0;
        metrics.last_activity_at = usersResult.rows[0].last_activity;
      }

      // Count divisions from auth database
      const divisionsResult = await authPool.query(`
        SELECT COUNT(*) as count FROM divisions WHERE is_active = TRUE
      `);
      
      if (divisionsResult.rows[0]) {
        metrics.division_count = parseInt(divisionsResult.rows[0].count) || 0;
      }

      // Count monthly active users (users who logged in this month)
      const mauResult = await authPool.query(`
        SELECT COUNT(*) as count 
        FROM users 
        WHERE is_active = TRUE 
          AND last_login >= DATE_TRUNC('month', CURRENT_DATE)
      `);
      
      if (mauResult.rows[0]) {
        metrics.monthly_active_users = parseInt(mauResult.rows[0].count) || 0;
      }

      // Estimate storage (sum of relevant tables)
      // This is a rough estimate - in production you might use pg_database_size
      try {
        const storageResult = await pool.query(`
          SELECT 
            pg_database_size(current_database()) / (1024 * 1024) as size_mb
        `);
        
        if (storageResult.rows[0]) {
          metrics.storage_used_mb = parseInt(storageResult.rows[0].size_mb) || 0;
        }
      } catch (err) {
        logger.warn('[MetricsReporter] Could not get storage size:', err.message);
      }

      // Count data records (example: count customers)
      try {
        const recordsResult = await pool.query(`
          SELECT 
            (SELECT COUNT(*) FROM fp_customer_master) as customer_count
        `);
        
        if (recordsResult.rows[0]) {
          metrics.data_records_count = parseInt(recordsResult.rows[0].customer_count) || 0;
        }
      } catch (err) {
        logger.warn('[MetricsReporter] Could not get record counts:', err.message);
      }

      logger.info('[MetricsReporter] Collected metrics:', metrics);
      return metrics;

    } catch (error) {
      logger.error('[MetricsReporter] Error collecting metrics:', error);
      throw error;
    }
  }

  /**
   * Report metrics to the platform
   */
  async reportMetrics() {
    if (!this.apiKey || !this.apiSecret) {
      logger.debug('[MetricsReporter] Skipping report - credentials not configured');
      return;
    }

    try {
      const metrics = await this.collectMetrics();

      const response = await axios.post(
        `${this.platformUrl}/api/platform/tenant-metrics/report`,
        metrics,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
            'X-API-Secret': this.apiSecret,
          },
          timeout: 10000,
        }
      );

      if (response.data.success) {
        logger.info('[MetricsReporter] Successfully reported metrics to platform');
      } else {
        logger.warn('[MetricsReporter] Platform returned error:', response.data.error);
      }

      return response.data;

    } catch (error) {
      if (error.response) {
        logger.error('[MetricsReporter] Platform API error:', error.response.status, error.response.data);
      } else if (error.request) {
        logger.error('[MetricsReporter] Platform unreachable:', error.message);
      } else {
        logger.error('[MetricsReporter] Report error:', error.message);
      }
      throw error;
    }
  }

  /**
   * Get subscription status from platform
   */
  async getSubscriptionStatus() {
    if (!this.apiKey || !this.apiSecret) {
      return null;
    }

    try {
      const response = await axios.get(
        `${this.platformUrl}/api/platform/tenant-metrics/my-status`,
        {
          headers: {
            'X-API-Key': this.apiKey,
            'X-API-Secret': this.apiSecret,
          },
          timeout: 10000,
        }
      );

      return response.data;

    } catch (error) {
      logger.error('[MetricsReporter] Error getting subscription status:', error.message);
      return null;
    }
  }

  /**
   * Start periodic reporting
   */
  startPeriodicReporting() {
    if (!this.apiKey || !this.apiSecret) {
      logger.warn('[MetricsReporter] Cannot start periodic reporting - credentials not configured');
      return;
    }

    // Report immediately
    this.reportMetrics().catch(err => {
      logger.error('[MetricsReporter] Initial report failed:', err.message);
    });

    // Then report periodically
    this.intervalId = setInterval(() => {
      this.reportMetrics().catch(err => {
        logger.error('[MetricsReporter] Periodic report failed:', err.message);
      });
    }, this.reportInterval);

    logger.info(`[MetricsReporter] Started periodic reporting every ${this.reportInterval / 1000}s`);
  }

  /**
   * Stop periodic reporting
   */
  stopPeriodicReporting() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('[MetricsReporter] Stopped periodic reporting');
    }
  }
}

// Export singleton instance
const reporter = new PlatformMetricsReporter();

module.exports = reporter;
