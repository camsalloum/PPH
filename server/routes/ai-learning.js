/**
 * AI Learning Routes
 * 
 * API endpoints for AI learning platform features:
 * - Data capture and backfill
 * - Division learning (seasonality, thresholds)
 * - Customer learning (churn, segmentation, CLV)
 * - Sales rep learning (clustering, patterns, coaching)
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

// Import services
const dataCaptureService = require('../services/DataCaptureService');
const divisionLearningService = require('../services/DivisionLearningService');
const customerLearningService = require('../services/CustomerLearningService');
const salesRepLearningService = require('../services/SalesRepLearningService');
const autoLearningService = require('../services/AutoLearningService');
const plLearningService = require('../services/PLLearningService');
const causalityEngine = require('../services/CausalityEngine');
const prescriptiveEngine = require('../services/PrescriptiveEngine');
const productLearningService = require('../services/ProductLearningService');
const feedbackLearningService = require('../services/FeedbackLearningService');
const supplyChainIntelligenceService = require('../services/SupplyChainIntelligenceService');
const financialHealthService = require('../services/FinancialHealthService');

// ===========================================================================
// DATA CAPTURE ENDPOINTS
// ===========================================================================

/**
 * POST /api/ai-learning/:division/capture
 * Capture metrics for a specific period
 */
router.post('/:division/capture', authenticate, async (req, res) => {
  const { division } = req.params;
  const { year, month } = req.body;

  try {
    if (!year || !month) {
      return res.status(400).json({ success: false, error: 'year and month required' });
    }

    const result = await dataCaptureService.captureAllMetrics(division, year, month);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Capture error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ai-learning/:division/backfill
 * Backfill historical data
 */
router.post('/:division/backfill', authenticate, async (req, res) => {
  const { division } = req.params;
  const { startYear, startMonth, endYear, endMonth } = req.body;

  try {
    const result = await dataCaptureService.backfillHistoricalData(
      division, startYear, startMonth, endYear, endMonth
    );
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Backfill error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================================================
// DIVISION LEARNING ENDPOINTS
// ===========================================================================

/**
 * POST /api/ai-learning/:division/learn/seasonality
 * Learn seasonality patterns
 */
router.post('/:division/learn/seasonality', authenticate, async (req, res) => {
  const { division } = req.params;

  try {
    const result = await divisionLearningService.learnSeasonality(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Seasonality learning error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/seasonality
 * Get learned seasonality
 */
router.get('/:division/seasonality', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await divisionLearningService.getSeasonality(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Get seasonality error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ai-learning/:division/learn/thresholds
 * Learn optimal thresholds
 */
router.post('/:division/learn/thresholds', authenticate, async (req, res) => {
  const { division } = req.params;

  try {
    const result = await divisionLearningService.learnThresholds(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Threshold learning error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/thresholds
 * Get current thresholds
 */
router.get('/:division/thresholds', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await divisionLearningService.getThresholds(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Get thresholds error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/profile
 * Get division profile
 */
router.get('/:division/profile', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await divisionLearningService.getDivisionProfile(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ai-learning/:division/predict
 * Generate prediction for a future month
 */
router.post('/:division/predict', authenticate, async (req, res) => {
  const { division } = req.params;
  const { year, month } = req.body;

  try {
    const result = await divisionLearningService.predictMonthly(division, year, month);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Prediction error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================================================
// CUSTOMER LEARNING ENDPOINTS
// ===========================================================================

/**
 * POST /api/ai-learning/:division/customers/churn
 * Predict churn for all customers
 */
router.post('/:division/customers/churn', authenticate, async (req, res) => {
  const { division } = req.params;

  try {
    const result = await customerLearningService.predictAllChurn(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Churn prediction error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/customers/churn/:customer
 * Get churn prediction for specific customer
 */
router.get('/:division/customers/churn/:customer', async (req, res) => {
  const { division, customer } = req.params;

  try {
    const result = await customerLearningService.predictChurn(division, customer);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Individual churn prediction error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/customers/high-risk
 * Get high-risk customers
 */
router.get('/:division/customers/high-risk', async (req, res) => {
  const { division } = req.params;
  const limit = parseInt(req.query.limit) || 20;

  try {
    const result = await customerLearningService.getHighRiskCustomers(division, limit);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('High risk customers error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ai-learning/:division/customers/segment
 * Segment all customers
 */
router.post('/:division/customers/segment', authenticate, async (req, res) => {
  const { division } = req.params;

  try {
    const result = await customerLearningService.segmentCustomers(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Segmentation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/customers/segments/:segment
 * Get customers by segment
 */
router.get('/:division/customers/segments/:segment', async (req, res) => {
  const { division, segment } = req.params;
  const limit = parseInt(req.query.limit) || 50;

  try {
    const result = await customerLearningService.getCustomersBySegment(division, segment, limit);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Get segment customers error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/customers/segments
 * Get all customer segments (for dashboard)
 */
router.get('/:division/customers/segments', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await customerLearningService.getAllSegments(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Get all segments error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ai-learning/:division/customers/clv
 * Calculate CLV for all customers
 */
router.post('/:division/customers/clv', authenticate, async (req, res) => {
  const { division } = req.params;

  try {
    const result = await customerLearningService.calculateAllCLV(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('CLV calculation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/customers/clv/:customer
 * Get CLV for specific customer
 */
router.get('/:division/customers/clv/:customer', async (req, res) => {
  const { division, customer } = req.params;

  try {
    const result = await customerLearningService.calculateCLV(division, customer);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Individual CLV error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================================================
// SALES REP LEARNING ENDPOINTS
// ===========================================================================

/**
 * POST /api/ai-learning/:division/salesreps/cluster
 * Cluster all sales reps
 */
router.post('/:division/salesreps/cluster', authenticate, async (req, res) => {
  const { division } = req.params;

  try {
    const result = await salesRepLearningService.clusterSalesReps(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Clustering error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/salesreps/clusters
 * Get all sales rep clusters (for dashboard)
 */
router.get('/:division/salesreps/clusters', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await salesRepLearningService.getAllClusters(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Get all clusters error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ai-learning/:division/salesreps/patterns
 * Learn patterns for all sales reps
 */
router.post('/:division/salesreps/patterns', authenticate, async (req, res) => {
  const { division } = req.params;

  try {
    const result = await salesRepLearningService.learnAllPatterns(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Pattern learning error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/salesreps/:rep/profile
 * Get sales rep profile
 */
router.get('/:division/salesreps/:rep/profile', async (req, res) => {
  const { division, rep } = req.params;

  try {
    const result = await salesRepLearningService.getRepProfile(division, rep);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Get rep profile error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ai-learning/:division/salesreps/:rep/coaching
 * Generate coaching recommendations
 */
router.post('/:division/salesreps/:rep/coaching', authenticate, async (req, res) => {
  const { division, rep } = req.params;

  try {
    const result = await salesRepLearningService.generateCoachingRecommendations(division, rep);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Coaching generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================================================
// FULL LEARNING CYCLE ENDPOINTS
// ===========================================================================

/**
 * POST /api/ai-learning/:division/learn/all
 * Run full learning cycle for division
 */
router.post('/:division/learn/all', authenticate, async (req, res) => {
  const { division } = req.params;

  try {
    logger.info(`Starting full learning cycle for ${division}`);

    const results = {
      division: await divisionLearningService.runAllLearning(division),
      customers: await customerLearningService.runAllLearning(division),
      salesReps: await salesRepLearningService.runAllLearning(division)
    };

    res.json({ 
      success: true, 
      data: results,
      message: 'Full learning cycle completed'
    });

  } catch (error) {
    logger.error('Full learning cycle error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/status
 * Get learning status for division
 */
router.get('/:division/status', async (req, res) => {
  const { division } = req.params;

  try {
    const profile = await divisionLearningService.getDivisionProfile(division);
    const autoStatus = autoLearningService.getStatus();
    
    res.json({
      success: true,
      data: {
        division,
        dataRange: profile.dataRange,
        learningStatus: profile.learningStatus,
        hasSeasonality: profile.seasonality?.factors?.length > 0,
        hasThresholds: Object.keys(profile.thresholds || {}).length > 0,
        autoLearning: autoStatus
      }
    });

  } catch (error) {
    logger.error('Status check error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================================================
// AUTO LEARNING ENDPOINTS (NEW)
// ===========================================================================

/**
 * POST /api/ai-learning/:division/auto/run
 * Trigger full automatic learning cycle
 */
router.post('/:division/auto/run', authenticate, async (req, res) => {
  const { division } = req.params;
  const { year, month } = req.body;

  try {
    logger.info(`Manual trigger: Full auto-learning for ${division}`);
    
    const result = await autoLearningService.runFullLearning(division, { year, month });
    
    res.json({ 
      success: result.success,
      data: result
    });

  } catch (error) {
    logger.error('Auto-learning error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ai-learning/:division/auto/quick
 * Trigger quick learning (predictions only)
 */
router.post('/:division/auto/quick', authenticate, async (req, res) => {
  const { division } = req.params;

  try {
    const result = await autoLearningService.runQuickLearning(division);
    res.json(result);

  } catch (error) {
    logger.error('Quick learning error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/auto/status
 * Get auto-learning status
 */
router.get('/:division/auto/status', async (req, res) => {
  const { division } = req.params;

  try {
    const status = autoLearningService.getStatus();
    const shouldRun = await autoLearningService.shouldRunLearning(division);
    
    res.json({
      success: true,
      data: {
        ...status,
        shouldRun: shouldRun.shouldRun,
        reason: shouldRun.reason
      }
    });

  } catch (error) {
    logger.error('Auto status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ai-learning/:division/auto/notify-sync
 * Called after data sync to trigger learning
 */
router.post('/:division/auto/notify-sync', authenticate, async (req, res) => {
  const { division } = req.params;
  const { syncType } = req.body;

  try {
    const result = await autoLearningService.onDataSync(division, syncType || 'manual');
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Sync notification error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================================================
// P&L LEARNING ENDPOINTS
// ===========================================================================

/**
 * POST /api/ai-learning/:division/pl/analyze
 * Run full P&L analysis
 */
router.post('/:division/pl/analyze', authenticate, async (req, res) => {
  const { division } = req.params;

  try {
    const result = await plLearningService.runAllLearning(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('P&L analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/pl/margins
 * Get margin trends
 */
router.get('/:division/pl/margins', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await plLearningService.analyzeMarginTrends(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Margin trends error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/pl/anomalies
 * Get cost anomalies
 */
router.get('/:division/pl/anomalies', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await plLearningService.detectCostAnomalies(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Cost anomalies error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/pl/profitability
 * Get profitability predictions
 */
router.get('/:division/pl/profitability', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await plLearningService.predictProfitability(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Profitability prediction error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/pl/product-mix
 * Get product mix analysis
 */
router.get('/:division/pl/product-mix', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await plLearningService.analyzeProductMix(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Product mix error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================================================
// CAUSALITY ENGINE ENDPOINTS
// ===========================================================================

/**
 * POST /api/ai-learning/:division/causality/analyze
 * Run full causality analysis
 */
router.post('/:division/causality/analyze', authenticate, async (req, res) => {
  const { division } = req.params;

  try {
    const result = await causalityEngine.runAllAnalysis(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Causality analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/causality/sales-drivers
 * Get sales drivers analysis
 */
router.get('/:division/causality/sales-drivers', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await causalityEngine.analyzeSalesDrivers(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Sales drivers error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/causality/churn-causes
 * Get churn causes analysis
 */
router.get('/:division/causality/churn-causes', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await causalityEngine.analyzeChurnCauses(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Churn causes error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/causality/margin-causes
 * Get margin causes analysis
 */
router.get('/:division/causality/margin-causes', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await causalityEngine.analyzeMarginCauses(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Margin causes error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/causality/correlations
 * Get cross-domain correlations
 */
router.get('/:division/causality/correlations', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await causalityEngine.findCorrelations(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Correlations error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================================================
// PRESCRIPTIVE ENGINE ENDPOINTS
// ===========================================================================

/**
 * POST /api/ai-learning/:division/prescriptive/analyze
 * Run full prescriptive analysis
 */
router.post('/:division/prescriptive/analyze', authenticate, async (req, res) => {
  const { division } = req.params;

  try {
    const result = await prescriptiveEngine.runFullAnalysis(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Prescriptive analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/prescriptive/actions
 * Get action recommendations
 */
router.get('/:division/prescriptive/actions', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await prescriptiveEngine.generateActionPlan(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Action plan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ai-learning/:division/prescriptive/simulate
 * Simulate what-if scenario
 */
router.post('/:division/prescriptive/simulate', authenticate, async (req, res) => {
  const { division } = req.params;
  const scenario = req.body;

  try {
    if (!scenario || Object.keys(scenario).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Scenario parameters required. Available: priceChange, customerGrowth, churnReduction, productMixShift'
      });
    }

    const result = await prescriptiveEngine.simulateScenario(division, scenario);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Simulation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/prescriptive/latest
 * Get latest action plan
 */
router.get('/:division/prescriptive/latest', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await prescriptiveEngine.getLatestActionPlan(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Latest action plan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================================================
// PRODUCT LEARNING ENDPOINTS
// ===========================================================================

/**
 * POST /api/ai-learning/:division/product/analyze
 * Run all product learning analysis
 */
router.post('/:division/product/analyze', authenticate, async (req, res) => {
  const { division } = req.params;

  try {
    const result = await productLearningService.runAllLearning(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Product analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/product/lifecycle
 * Get product lifecycle classifications
 */
router.get('/:division/product/lifecycle', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await productLearningService.classifyProductLifecycle(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Product lifecycle error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/product/velocity
 * Get product velocity analysis
 */
router.get('/:division/product/velocity', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await productLearningService.analyzeProductVelocity(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Product velocity error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/product/crosssell
 * Get cross-sell patterns
 */
router.get('/:division/product/crosssell', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await productLearningService.detectCrossSellPatterns(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Cross-sell patterns error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/product/seasonality
 * Get product seasonality patterns
 */
router.get('/:division/product/seasonality', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await productLearningService.detectSeasonalPatterns(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Product seasonality error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================================================
// FEEDBACK LEARNING ENDPOINTS
// ===========================================================================

/**
 * POST /api/ai-learning/:division/feedback/recommendation
 * Record feedback on a recommendation
 */
router.post('/:division/feedback/recommendation', authenticate, async (req, res) => {
  const { division } = req.params;
  const { recommendationId, recommendationType, action, modifiedValues, userId } = req.body;

  try {
    if (!recommendationId || !recommendationType || !action) {
      return res.status(400).json({
        success: false,
        error: 'recommendationId, recommendationType, and action are required'
      });
    }

    const result = await feedbackLearningService.recordRecommendationFeedback(
      division, recommendationId, recommendationType, action, modifiedValues, userId
    );
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Recommendation feedback error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ai-learning/:division/feedback/outcome
 * Record actual outcome of recommendation
 */
router.post('/:division/feedback/outcome', authenticate, async (req, res) => {
  const { division } = req.params;
  const { feedbackId, actualResult, success } = req.body;

  try {
    if (!feedbackId) {
      return res.status(400).json({
        success: false,
        error: 'feedbackId is required'
      });
    }

    const result = await feedbackLearningService.recordOutcome(
      division, feedbackId, actualResult, success
    );
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Outcome recording error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ai-learning/:division/feedback/insight
 * Record feedback on an insight (thumbs up/down)
 */
router.post('/:division/feedback/insight', authenticate, async (req, res) => {
  const { division } = req.params;
  const { insightId, insightType, helpful, comment, userId } = req.body;

  try {
    if (!insightId || !insightType || helpful === undefined) {
      return res.status(400).json({
        success: false,
        error: 'insightId, insightType, and helpful are required'
      });
    }

    const result = await feedbackLearningService.recordInsightFeedback(
      division, insightId, insightType, helpful, comment, userId
    );
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Insight feedback error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ai-learning/:division/feedback/learn
 * Run feedback learning to adjust weights
 */
router.post('/:division/feedback/learn', authenticate, async (req, res) => {
  const { division } = req.params;

  try {
    const result = await feedbackLearningService.learnFromFeedback(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Feedback learning error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/feedback/analytics
 * Get feedback analytics
 */
router.get('/:division/feedback/analytics', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await feedbackLearningService.runFullLearning(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Feedback analytics error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================================================
// SUPPLY CHAIN INTELLIGENCE ENDPOINTS
// ===========================================================================

/**
 * POST /api/ai-learning/:division/supply-chain/analyze
 * Run all supply chain analysis
 */
router.post('/:division/supply-chain/analyze', authenticate, async (req, res) => {
  const { division } = req.params;

  try {
    const result = await supplyChainIntelligenceService.runAllAnalysis(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Supply chain analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/supply-chain/forecast
 * Get demand forecasts
 */
router.get('/:division/supply-chain/forecast', async (req, res) => {
  const { division } = req.params;
  const { months } = req.query;

  try {
    const horizonMonths = months ? parseInt(months) : 3;
    const result = await supplyChainIntelligenceService.forecastDemand(division, horizonMonths);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Demand forecast error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/supply-chain/inventory
 * Get inventory optimization recommendations
 */
router.get('/:division/supply-chain/inventory', async (req, res) => {
  const { division } = req.params;
  const { leadTime } = req.query;

  try {
    const leadTimeDays = leadTime ? parseInt(leadTime) : 14;
    const result = await supplyChainIntelligenceService.optimizeInventoryLevels(division, leadTimeDays);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Inventory optimization error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/supply-chain/stockout-risk
 * Get stock-out risk predictions
 */
router.get('/:division/supply-chain/stockout-risk', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await supplyChainIntelligenceService.predictStockOutRisk(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Stock-out risk error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================================================
// FINANCIAL HEALTH ENDPOINTS
// ===========================================================================

/**
 * POST /api/ai-learning/:division/financial/analyze
 * Run all financial health analysis
 */
router.post('/:division/financial/analyze', authenticate, async (req, res) => {
  const { division } = req.params;

  try {
    const result = await financialHealthService.runAllAnalysis(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Financial analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/financial/cashflow
 * Get cash flow predictions
 */
router.get('/:division/financial/cashflow', async (req, res) => {
  const { division } = req.params;
  const { months } = req.query;

  try {
    const horizonMonths = months ? parseInt(months) : 3;
    const result = await financialHealthService.predictCashFlow(division, horizonMonths);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Cash flow prediction error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/financial/credit-scores
 * Get customer credit risk scores
 */
router.get('/:division/financial/credit-scores', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await financialHealthService.calculateCreditRiskScores(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Credit scores error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/financial/concentration
 * Get revenue concentration analysis
 */
router.get('/:division/financial/concentration', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await financialHealthService.analyzeRevenueConcentration(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Concentration analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai-learning/:division/financial/profitability
 * Get segment profitability analysis
 */
router.get('/:division/financial/profitability', async (req, res) => {
  const { division } = req.params;

  try {
    const result = await financialHealthService.analyzeSegmentProfitability(division);
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Segment profitability error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
