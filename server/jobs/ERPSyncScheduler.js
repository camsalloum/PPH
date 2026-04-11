/**
 * ERP Sync Job Scheduler
 * 
 * Automated cron job for periodic Oracle ERP synchronization
 * Runs based on configurable schedule (default: every 4 hours)
 * 
 * Features:
 * - Configurable intervals via environment variables
 * - Retry logic with exponential backoff
 * - Graceful error handling
 * - Timezone support
 * - Detailed logging
 */

const cron = require('node-cron');
const OracleERPSyncService = require('../services/OracleERPSyncService');
const { authPool } = require('../database/config');
const logger = require('../utils/logger');

const parseSettingValue = (value, fallback = null) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      return value;
    }
  }
  return value;
};

const isValidIanaTimezone = (timezone) => {
  if (!timezone || typeof timezone !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }
};

class ERPSyncScheduler {
  constructor() {
    this.job = null;
    this.isRunning = false;

    // Configuration from environment variables
    this.config = {
      enabled: process.env.ERP_SYNC_ENABLED === 'true',
      intervalHours: parseInt(process.env.ERP_SYNC_INTERVAL_HOURS || '4'),
      syncMode: process.env.ERP_SYNC_MODE || 'incremental', // 'incremental' or 'full'
      retryAttempts: parseInt(process.env.ERP_SYNC_RETRY_ATTEMPTS || '3'),
      timezone: process.env.ERP_SYNC_TIMEZONE || null
    };
  }

  async resolveTimezone() {
    const envTimezone = typeof process.env.ERP_SYNC_TIMEZONE === 'string'
      ? process.env.ERP_SYNC_TIMEZONE.trim()
      : null;

    if (envTimezone) {
      if (isValidIanaTimezone(envTimezone)) {
        this.config.timezone = envTimezone;
        return;
      }

      logger.warn(`Invalid ERP_SYNC_TIMEZONE value "${envTimezone}". Falling back to company settings.`);
    }

    try {
      const result = await authPool.query(
        `SELECT setting_value
           FROM company_settings
          WHERE setting_key = 'company_timezone'
          LIMIT 1`
      );

      const settingValue = result.rows?.[0]?.setting_value;
      const parsed = parseSettingValue(settingValue, null);
      const timezoneFromSettings = typeof parsed === 'string'
        ? parsed
        : parsed?.timezone || null;

      if (timezoneFromSettings && isValidIanaTimezone(timezoneFromSettings)) {
        this.config.timezone = timezoneFromSettings;
        return;
      }

      if (timezoneFromSettings) {
        logger.warn(`Invalid company timezone "${timezoneFromSettings}". Falling back to Asia/Dubai.`);
      }
    } catch (error) {
      logger.warn(`Could not load company timezone from settings: ${error.message}`);
    }

    this.config.timezone = 'Asia/Dubai';
  }

  /**
   * Get cron schedule expression based on interval hours
   */
  getCronSchedule() {
    const hours = this.config.intervalHours;

    // Cron format: minute hour day month weekday
    switch (hours) {
      case 1:
        return '0 * * * *'; // Every hour
      case 2:
        return '0 */2 * * *'; // Every 2 hours
      case 4:
        return '0 */4 * * *'; // Every 4 hours
      case 6:
        return '0 */6 * * *'; // Every 6 hours
      case 8:
        return '0 */8 * * *'; // Every 8 hours
      case 12:
        return '0 */12 * * *'; // Every 12 hours
      case 24:
        return '0 0 * * *'; // Daily at midnight
      default:
        return '0 */4 * * *'; // Default: Every 4 hours
    }
  }

  /**
   * Start the scheduler
   */
  async start() {
    if (!this.config.enabled) {
      logger.info('⏸️  ERP Sync Job: DISABLED');
      logger.info('   To enable: Set ERP_SYNC_ENABLED=true in .env');
      return;
    }

    await this.resolveTimezone();

    const schedule = this.getCronSchedule();

    logger.info('\n' + '═'.repeat(80));
    logger.info('🚀 ERP SYNC SCHEDULER STARTED');
    logger.info('═'.repeat(80));
    logger.info(`   Status: ENABLED`);
    logger.info(`   Schedule: Every ${this.config.intervalHours} hour(s)`);
    logger.info(`   Cron: ${schedule}`);
    logger.info(`   Sync Mode: ${this.config.syncMode.toUpperCase()}`);
    logger.info(`   Retry Attempts: ${this.config.retryAttempts}`);
    logger.info(`   Timezone: ${this.config.timezone}`);
    logger.info('═'.repeat(80) + '\n');

    // Schedule the job
    this.job = cron.schedule(schedule, async () => {
      await this.runSync();
    }, {
      scheduled: true,
      timezone: this.config.timezone
    });

    logger.info('✅ Cron scheduler initialized');

    // Optional: Run initial sync on startup (disabled by default)
    // Uncomment the line below to sync immediately on server start
    // this.runSync();
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.job) {
      this.job.stop();
      logger.info('⏹️  ERP Sync Job: STOPPED');
    }
  }

  /**
   * Run sync with retry logic
   */
  async runSync() {
    if (this.isRunning) {
      logger.warn('⚠️  Sync already running, skipping this scheduled run');
      return;
    }

    this.isRunning = true;
    const startTime = new Date();

    logger.info('\n' + '═'.repeat(80));
    logger.info(`🔄 SCHEDULED SYNC TRIGGERED`);
    logger.info(`   Time: ${startTime.toLocaleString()}`);
    logger.info(`   Mode: ${this.config.syncMode.toUpperCase()}`);
    logger.info('═'.repeat(80));

    let attempt = 0;
    let success = false;
    let lastError = null;

    // Retry loop
    while (attempt < this.config.retryAttempts && !success) {
      attempt++;

      try {
        if (attempt > 1) {
          logger.info(`\n🔄 Retry attempt ${attempt}/${this.config.retryAttempts}...`);
          // Exponential backoff: 2s, 4s, 8s, etc.
          const waitTime = Math.pow(2, attempt - 1) * 1000;
          await this.sleep(waitTime);
        }

        const result = await OracleERPSyncService.syncToPostgreSQL(this.config.syncMode);

        if (result.success) {
          success = true;

          const endTime = new Date();
          const duration = ((endTime - startTime) / 1000).toFixed(2);

          logger.info('\n' + '═'.repeat(80));
          logger.info('✅ SCHEDULED SYNC COMPLETED SUCCESSFULLY');
          logger.info('═'.repeat(80));
          logger.info(`   Rows Fetched: ${result.rowsFetched.toLocaleString()}`);
          logger.info(`   Rows Inserted: ${result.rowsInserted.toLocaleString()}`);
          logger.info(`   Rows Updated: ${result.rowsUpdated.toLocaleString()}`);
          logger.info(`   Rows Skipped: ${result.rowsSkipped.toLocaleString()}`);
          logger.info(`   Total Duration: ${duration}s`);
          logger.info(`   Next sync: ${this.getNextRunTime()}`);
          logger.info('═'.repeat(80) + '\n');
        }

      } catch (error) {
        lastError = error;
        logger.error(`❌ Sync attempt ${attempt} failed:`, error.message);

        if (attempt === this.config.retryAttempts) {
          logger.error(`\n❌ SCHEDULED SYNC FAILED AFTER ${this.config.retryAttempts} ATTEMPTS`);
          logger.error(`   Error: ${lastError.message}`);
          logger.error(`   Next retry: ${this.getNextRunTime()}\n`);
        }
      }
    }

    this.isRunning = false;
  }

  /**
   * Sleep helper for retry delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate next run time
   */
  getNextRunTime() {
    const now = new Date();
    const nextRun = new Date(now.getTime() + this.config.intervalHours * 3600000);
    return nextRun.toLocaleString();
  }
}

// Create singleton instance
const scheduler = new ERPSyncScheduler();

module.exports = {
  startERPSyncJob: async () => scheduler.start(),
  stopERPSyncJob: () => scheduler.stop(),
  scheduler: scheduler
};
