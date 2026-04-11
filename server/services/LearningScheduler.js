/**
 * Learning Scheduler
 * 
 * Schedules automatic learning runs at specific intervals.
 * Default: Runs at 2 AM every day
 * 
 * Features:
 * - Daily full learning cycle
 * - Hourly quick predictions (optional)
 * - Manual trigger support
 * - Graceful shutdown
 * - Dynamic division loading from company_settings
 * 
 * @version 2.0
 * @date December 27, 2025
 */

const logger = require('../utils/logger');
const autoLearningService = require('../services/AutoLearningService');
const { getActiveDivisions } = require('../database/DynamicDivisionConfig');

class LearningScheduler {
  constructor() {
    this.dailyTimer = null;
    this.hourlyTimer = null;
    this.divisions = []; // Will be loaded dynamically from DB
    this.isEnabled = process.env.AUTO_LEARNING_ENABLED !== 'false';
    this.dailyHour = parseInt(process.env.AUTO_LEARNING_HOUR) || 2; // 2 AM default
    this.enableHourlyQuick = process.env.AUTO_LEARNING_HOURLY === 'true';
  }

  /**
   * Load divisions from database
   */
  async loadDivisions() {
    try {
      this.divisions = await getActiveDivisions();
      logger.info(`LearningScheduler: Loaded ${this.divisions.length} divisions: ${this.divisions.join(', ')}`);
    } catch (error) {
      logger.error('LearningScheduler: Failed to load divisions, defaulting to FP', error);
      this.divisions = ['FP'];
    }
  }

  /**
   * Start the scheduler
   */
  async start() {
    if (!this.isEnabled) {
      logger.info('LearningScheduler: Disabled by environment setting');
      return;
    }

    // Load divisions from database
    await this.loadDivisions();

    logger.info(`LearningScheduler: Starting (daily at ${this.dailyHour}:00, hourly quick: ${this.enableHourlyQuick})`);

    // Calculate time until next daily run
    this.scheduleDailyRun();

    // Schedule hourly quick learning if enabled
    if (this.enableHourlyQuick) {
      this.scheduleHourlyQuick();
    }

    logger.info('LearningScheduler: Started successfully');
  }

  /**
   * Schedule the daily full learning run
   */
  scheduleDailyRun() {
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setHours(this.dailyHour, 0, 0, 0);
    
    // If we've passed today's scheduled time, run tomorrow
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const msUntilRun = nextRun.getTime() - now.getTime();
    const hoursUntil = Math.round(msUntilRun / (1000 * 60 * 60) * 10) / 10;

    logger.info(`LearningScheduler: Next daily run in ${hoursUntil} hours at ${nextRun.toISOString()}`);

    this.dailyTimer = setTimeout(async () => {
      await this.runDailyLearning();
      // Schedule next run after this one completes
      this.scheduleDailyRun();
    }, msUntilRun);
  }

  /**
   * Schedule hourly quick learning
   */
  scheduleHourlyQuick() {
    this.hourlyTimer = setInterval(async () => {
      await this.runQuickLearning();
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Run full daily learning for all divisions
   */
  async runDailyLearning() {
    logger.info('LearningScheduler: Starting daily learning cycle');
    
    // Refresh divisions from DB in case they changed
    await this.loadDivisions();

    for (const division of this.divisions) {
      try {
        logger.info(`LearningScheduler: Running full learning for ${division}`);
        const result = await autoLearningService.runFullLearning(division);
        
        if (result.success) {
          logger.info(`LearningScheduler: ${division} completed successfully in ${result.durationMs}ms`);
        } else {
          logger.warn(`LearningScheduler: ${division} completed with errors`, result.errors);
        }

        // Small delay between divisions
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        logger.error(`LearningScheduler: Failed for ${division}`, error);
      }
    }

    logger.info('LearningScheduler: Daily learning cycle complete');
  }

  /**
   * Run quick learning (predictions only)
   */
  async runQuickLearning() {
    for (const division of this.divisions) {
      try {
        const shouldRun = await autoLearningService.shouldRunLearning(division);
        
        if (shouldRun.shouldRun) {
          logger.info(`LearningScheduler: Quick learning needed for ${division} - ${shouldRun.reason}`);
          await autoLearningService.runQuickLearning(division);
        }
      } catch (error) {
        logger.error(`LearningScheduler: Quick learning failed for ${division}`, error);
      }
    }
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.dailyTimer) {
      clearTimeout(this.dailyTimer);
      this.dailyTimer = null;
    }
    if (this.hourlyTimer) {
      clearInterval(this.hourlyTimer);
      this.hourlyTimer = null;
    }
    logger.info('LearningScheduler: Stopped');
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isEnabled: this.isEnabled,
      dailyHour: this.dailyHour,
      hourlyQuickEnabled: this.enableHourlyQuick,
      divisions: this.divisions,
      isRunning: this.dailyTimer !== null
    };
  }
}

// Export singleton
module.exports = new LearningScheduler();
