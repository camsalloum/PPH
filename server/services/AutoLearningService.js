/**
 * Automatic Learning Service
 * 
 * Triggers AI learning automatically when data changes.
 * This service watches for data updates and runs appropriate learning algorithms.
 * 
 * TRIGGER POINTS:
 * 1. After Excel data sync (fp_data_excel table updates)
 * 2. After budget submission
 * 3. Daily scheduled run (cron job)
 * 4. Manual trigger via API
 * 
 * WHAT IT LEARNS:
 * - Captures behavioral snapshots (division, sales rep, customer, product)
 * - Updates seasonality patterns
 * - Recalculates dynamic thresholds
 * - Re-clusters sales reps
 * - Re-segments customers
 * - Updates churn predictions
 * - Refreshes CLV calculations
 * 
 * @version 1.0
 * @date December 27, 2025
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');
const DataCaptureService = require('./DataCaptureService');
const DivisionLearningService = require('./DivisionLearningService');
const CustomerLearningService = require('./CustomerLearningService');
const SalesRepLearningService = require('./SalesRepLearningService');
const PLLearningService = require('./PLLearningService');
const CausalityEngine = require('./CausalityEngine');
const PrescriptiveEngine = require('./PrescriptiveEngine');
const ProductLearningService = require('./ProductLearningService');
const SupplyChainIntelligenceService = require('./SupplyChainIntelligenceService');
const FinancialHealthService = require('./FinancialHealthService');

class AutoLearningService {
  
  constructor() {
    this.isRunning = false;
    this.lastRunTime = null;
    this.runHistory = [];
  }

  /**
   * Main entry point - run all learning algorithms for a division
   * Called after data sync or on schedule
   */
  async runFullLearning(divisionCode, options = {}) {
    if (this.isRunning) {
      logger.warn('AutoLearning: Already running, skipping...');
      return { success: false, reason: 'already_running' };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const results = {
      divisionCode,
      startedAt: new Date().toISOString(),
      tasks: {},
      errors: []
    };

    try {
      logger.info(`AutoLearning: Starting full learning cycle for ${divisionCode}`);

      // Get current period
      const now = new Date();
      const currentYear = options.year || now.getFullYear();
      const currentMonth = options.month || now.getMonth() + 1;

      // 1. Capture current period snapshot (if not already captured)
      try {
        await this.captureCurrentPeriod(divisionCode, currentYear, currentMonth);
        results.tasks.snapshotCapture = 'success';
      } catch (e) {
        logger.error('AutoLearning: Snapshot capture failed', e);
        results.tasks.snapshotCapture = 'failed';
        results.errors.push({ task: 'snapshotCapture', error: e.message });
      }

      // 2. Update seasonality patterns (needs at least 12 months of data)
      try {
        const seasonality = await DivisionLearningService.learnSeasonality(divisionCode);
        results.tasks.seasonality = { status: 'success', monthsLearned: seasonality?.patterns?.length || 0 };
      } catch (e) {
        logger.error('AutoLearning: Seasonality learning failed', e);
        results.tasks.seasonality = 'failed';
        results.errors.push({ task: 'seasonality', error: e.message });
      }

      // 3. Update dynamic thresholds
      try {
        const thresholds = await DivisionLearningService.learnThresholds(divisionCode);
        results.tasks.thresholds = { status: 'success', count: thresholds?.length || 0 };
      } catch (e) {
        logger.error('AutoLearning: Threshold update failed', e);
        results.tasks.thresholds = 'failed';
        results.errors.push({ task: 'thresholds', error: e.message });
      }

      // 4. Re-cluster sales reps
      try {
        const clusters = await SalesRepLearningService.clusterSalesReps(divisionCode);
        results.tasks.salesRepClusters = { status: 'success', repsProcessed: clusters?.clustered || 0 };
      } catch (e) {
        logger.error('AutoLearning: Sales rep clustering failed', e);
        results.tasks.salesRepClusters = 'failed';
        results.errors.push({ task: 'salesRepClusters', error: e.message });
      }

      // 5. Learn sales rep patterns
      try {
        const patterns = await SalesRepLearningService.learnAllPatterns(divisionCode);
        results.tasks.salesRepPatterns = { status: 'success', patternsLearned: patterns?.learned || 0 };
      } catch (e) {
        logger.error('AutoLearning: Pattern learning failed', e);
        results.tasks.salesRepPatterns = 'failed';
        results.errors.push({ task: 'salesRepPatterns', error: e.message });
      }

      // 6. Re-segment customers
      try {
        const segments = await CustomerLearningService.segmentCustomers(divisionCode);
        results.tasks.customerSegments = { status: 'success', customersSegmented: segments?.processed || 0 };
      } catch (e) {
        logger.error('AutoLearning: Customer segmentation failed', e);
        results.tasks.customerSegments = 'failed';
        results.errors.push({ task: 'customerSegments', error: e.message });
      }

      // 7. Update churn predictions
      try {
        const churn = await CustomerLearningService.predictChurn(divisionCode);
        results.tasks.churnPredictions = { status: 'success', predictions: churn?.predicted || 0 };
      } catch (e) {
        logger.error('AutoLearning: Churn prediction failed', e);
        results.tasks.churnPredictions = 'failed';
        results.errors.push({ task: 'churnPredictions', error: e.message });
      }

      // 8. Recalculate CLV
      try {
        const clv = await CustomerLearningService.calculateAllCLV(divisionCode);
        results.tasks.customerCLV = { status: 'success', calculated: clv?.calculated || 0 };
      } catch (e) {
        logger.error('AutoLearning: CLV calculation failed', e);
        results.tasks.customerCLV = 'failed';
        results.errors.push({ task: 'customerCLV', error: e.message });
      }

      // 9. Detect anomalies
      try {
        const anomalies = await CustomerLearningService.detectAnomalies(divisionCode, currentYear, currentMonth);
        results.tasks.anomalyDetection = { status: 'success', detected: anomalies?.detected || 0 };
      } catch (e) {
        logger.error('AutoLearning: Anomaly detection failed', e);
        results.tasks.anomalyDetection = 'failed';
        results.errors.push({ task: 'anomalyDetection', error: e.message });
      }

      // 10. Generate division prediction
      try {
        const prediction = await DivisionLearningService.predictMonthly(divisionCode, currentYear, currentMonth + 1);
        results.tasks.divisionPrediction = { status: 'success', predicted: prediction?.success ? 1 : 0 };
      } catch (e) {
        logger.error('AutoLearning: Division prediction failed', e);
        results.tasks.divisionPrediction = 'failed';
        results.errors.push({ task: 'divisionPrediction', error: e.message });
      }

      // 11. P&L Intelligence Analysis (margin trends, cost anomalies)
      try {
        const plAnalysis = await PLLearningService.runAllLearning(divisionCode);
        results.tasks.plIntelligence = { 
          status: 'success', 
          marginTrends: plAnalysis?.marginTrends?.success ? 1 : 0,
          costAnomalies: plAnalysis?.costAnomalies?.anomalies?.length || 0,
          profitPredictions: plAnalysis?.profitability?.success ? 1 : 0
        };
      } catch (e) {
        logger.error('AutoLearning: P&L analysis failed', e);
        results.tasks.plIntelligence = 'failed';
        results.errors.push({ task: 'plIntelligence', error: e.message });
      }

      // 12. Causality Analysis (why analysis, correlations)
      try {
        const causalAnalysis = await CausalityEngine.runAllAnalysis(divisionCode);
        results.tasks.causalityAnalysis = { 
          status: 'success',
          salesDrivers: causalAnalysis?.salesDrivers?.success ? 1 : 0,
          churnCauses: causalAnalysis?.churnCauses?.success ? 1 : 0,
          correlationsFound: causalAnalysis?.correlations?.correlations?.length || 0
        };
      } catch (e) {
        logger.error('AutoLearning: Causality analysis failed', e);
        results.tasks.causalityAnalysis = 'failed';
        results.errors.push({ task: 'causalityAnalysis', error: e.message });
      }

      // 13. Prescriptive Analysis (action recommendations)
      try {
        const prescriptiveAnalysis = await PrescriptiveEngine.runFullAnalysis(divisionCode);
        results.tasks.prescriptiveAnalysis = { 
          status: 'success',
          actionsGenerated: prescriptiveAnalysis?.actionPlan?.totalActions || 0,
          estimatedImpact: prescriptiveAnalysis?.actionPlan?.estimatedTotalImpact || 0
        };
      } catch (e) {
        logger.error('AutoLearning: Prescriptive analysis failed', e);
        results.tasks.prescriptiveAnalysis = 'failed';
        results.errors.push({ task: 'prescriptiveAnalysis', error: e.message });
      }

      // 14. Product Learning (lifecycle, velocity, cross-sell, seasonality)
      try {
        const productAnalysis = await ProductLearningService.runAllLearning(divisionCode);
        results.tasks.productLearning = { 
          status: 'success',
          lifecycleClassified: productAnalysis?.lifecycle?.classified || 0,
          crossSellPatterns: productAnalysis?.crossSell?.patterns || 0,
          velocityAnalyzed: productAnalysis?.velocity?.analyzed || 0
        };
      } catch (e) {
        logger.error('AutoLearning: Product learning failed', e);
        results.tasks.productLearning = 'failed';
        results.errors.push({ task: 'productLearning', error: e.message });
      }

      // 15. Supply Chain Intelligence (demand forecast, inventory optimization)
      try {
        const supplyChainAnalysis = await SupplyChainIntelligenceService.runAllAnalysis(divisionCode);
        results.tasks.supplyChain = { 
          status: 'success',
          forecastsGenerated: supplyChainAnalysis?.demandForecast?.forecasts || 0,
          inventoryRecommendations: supplyChainAnalysis?.inventoryOptimization?.recommendations || 0,
          stockOutRisks: supplyChainAnalysis?.stockOutRisk?.atRiskProducts || 0
        };
      } catch (e) {
        logger.error('AutoLearning: Supply chain analysis failed', e);
        results.tasks.supplyChain = 'failed';
        results.errors.push({ task: 'supplyChain', error: e.message });
      }

      // 16. Financial Health Analysis (cash flow, credit risk, concentration)
      try {
        const financialAnalysis = await FinancialHealthService.runAllAnalysis(divisionCode);
        results.tasks.financialHealth = { 
          status: 'success',
          cashFlowPredictions: financialAnalysis?.cashFlow?.predictions?.length || 0,
          creditScoresCalculated: financialAnalysis?.creditRisk?.scored || 0,
          concentrationIndex: financialAnalysis?.concentration?.hhiIndex || 0
        };
      } catch (e) {
        logger.error('AutoLearning: Financial analysis failed', e);
        results.tasks.financialHealth = 'failed';
        results.errors.push({ task: 'financialHealth', error: e.message });
      }

      results.completedAt = new Date().toISOString();
      results.durationMs = Date.now() - startTime;
      results.success = results.errors.length === 0;

      // Log result
      await this.logLearningRun(results);

      logger.info(`AutoLearning: Completed for ${divisionCode} in ${results.durationMs}ms`);
      return results;

    } catch (error) {
      logger.error('AutoLearning: Critical failure', error);
      results.errors.push({ task: 'critical', error: error.message });
      results.success = false;
      return results;
    } finally {
      this.isRunning = false;
      this.lastRunTime = new Date();
    }
  }

  /**
   * Capture snapshots for current period
   */
  async captureCurrentPeriod(divisionCode, year, month) {
    // DataCaptureService is a singleton, not a constructor
    // Capture all entity types for current period
    await DataCaptureService.backfillHistoricalData(divisionCode, year, month, year, month);
    
    logger.info(`AutoLearning: Captured snapshots for ${year}-${month}`);
    return { success: true };
  }

  /**
   * Quick learning - only update predictions (faster, for real-time)
   */
  async runQuickLearning(divisionCode) {
    const results = { tasks: {} };
    
    try {
      // Just update churn predictions and anomaly detection
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const churn = await CustomerLearningService.predictChurn(divisionCode);
      results.tasks.churnPredictions = churn?.predicted || 0;

      const anomalies = await CustomerLearningService.detectAnomalies(divisionCode, year, month);
      results.tasks.anomalies = anomalies?.detected || 0;

      return { success: true, results };
    } catch (error) {
      logger.error('AutoLearning: Quick learning failed', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log learning run to database for audit trail
   */
  async logLearningRun(results) {
    try {
      const prefix = results.divisionCode.toLowerCase().split('-')[0];
      
      // Store in a learning_runs table (create if not exists)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${prefix}_learning_runs (
          id SERIAL PRIMARY KEY,
          started_at TIMESTAMP,
          completed_at TIMESTAMP,
          duration_ms INTEGER,
          success BOOLEAN,
          tasks JSONB,
          errors JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.query(`
        INSERT INTO ${prefix}_learning_runs (started_at, completed_at, duration_ms, success, tasks, errors)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        results.startedAt,
        results.completedAt,
        results.durationMs,
        results.success,
        JSON.stringify(results.tasks),
        JSON.stringify(results.errors)
      ]);

      this.runHistory.push({
        time: results.completedAt,
        success: results.success,
        duration: results.durationMs
      });

      // Keep only last 100 runs in memory
      if (this.runHistory.length > 100) {
        this.runHistory.shift();
      }
    } catch (error) {
      logger.error('AutoLearning: Failed to log run', error);
    }
  }

  /**
   * Get learning status and history
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      recentRuns: this.runHistory.slice(-10)
    };
  }

  /**
   * Trigger learning after data sync (called from data import routes)
   */
  async onDataSync(divisionCode, syncType) {
    logger.info(`AutoLearning: Data sync detected - ${syncType} for ${divisionCode}`);
    
    // Run learning asynchronously (don't block the sync)
    setImmediate(async () => {
      try {
        await this.runFullLearning(divisionCode);
      } catch (error) {
        logger.error('AutoLearning: Post-sync learning failed', error);
      }
    });

    return { triggered: true, message: 'Learning will run in background' };
  }

  /**
   * Check if learning should run based on data freshness
   */
  async shouldRunLearning(divisionCode) {
    try {
      const prefix = divisionCode.toLowerCase().split('-')[0];
      
      // Check last learning run
      const lastRun = await pool.query(`
        SELECT MAX(completed_at) as last_run
        FROM ${prefix}_learning_runs
        WHERE success = true
      `);

      if (!lastRun.rows[0]?.last_run) {
        return { shouldRun: true, reason: 'No previous learning run' };
      }

      const lastRunTime = new Date(lastRun.rows[0].last_run);
      const hoursSinceLastRun = (Date.now() - lastRunTime.getTime()) / (1000 * 60 * 60);

      // Check if data has changed since last run
      const dataCheck = await pool.query(`
        SELECT MAX(recorded_at) as last_capture
        FROM ${prefix}_division_behavior_history
      `);

      const lastCaptureTime = dataCheck.rows[0]?.last_capture 
        ? new Date(dataCheck.rows[0].last_capture)
        : null;

      // Run if more than 24 hours since last run
      if (hoursSinceLastRun > 24) {
        return { shouldRun: true, reason: 'More than 24 hours since last learning' };
      }

      // Run if new data captured after last learning run
      if (lastCaptureTime && lastCaptureTime > lastRunTime) {
        return { shouldRun: true, reason: 'New data available since last learning' };
      }

      return { shouldRun: false, reason: 'Learning is up to date' };
    } catch (error) {
      logger.error('AutoLearning: Check failed', error);
      return { shouldRun: true, reason: 'Check failed, running as precaution' };
    }
  }
}

// Export singleton instance
module.exports = new AutoLearningService();
