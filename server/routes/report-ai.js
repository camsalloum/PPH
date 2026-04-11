/**
 * AI Report API Routes
 * Handles AI-powered comprehensive division report generation and feedback
 */

const express = require('express');
const router = express.Router();
const divisionReportAIService = require('../services/DivisionReportAIService');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * POST /api/report-ai/:division/generate
 * Generate comprehensive AI report for a division
 */
router.post('/:division/generate', optionalAuthenticate, async (req, res) => {
  const { division } = req.params;
  const { basePeriod, compPeriod, options = {} } = req.body;

  try {
    // Validate required parameters
    if (!basePeriod || !basePeriod.year || !basePeriod.months) {
      return res.status(400).json({
        success: false,
        error: 'basePeriod with year and months is required'
      });
    }

    logger.info(`AI report generation requested for ${division}`, {
      basePeriod,
      compPeriod,
      userId: req.user?.id
    });

    // Debug logging
    console.log('📊 AI Report Request:', JSON.stringify({ division, basePeriod, compPeriod }, null, 2));

    const periods = {
      basePeriod: {
        year: parseInt(basePeriod.year),
        months: Array.isArray(basePeriod.months) ? basePeriod.months : [basePeriod.months],
        type: basePeriod.type || 'Actual'
      },
      compPeriod: compPeriod ? {
        year: parseInt(compPeriod.year),
        months: Array.isArray(compPeriod.months) ? compPeriod.months : [compPeriod.months],
        type: compPeriod.type || 'Actual'
      } : null
    };

    const report = await divisionReportAIService.generateComprehensiveReport(
      division,
      periods,
      options
    );

    console.log('📊 AI Report Generated:', {
      division,
      hasExecutiveSummary: !!report.executiveSummary,
      hasPLAnalysis: !!report.plAnalysis,
      healthScore: report.executiveSummary?.healthScore
    });

    res.json({
      success: true,
      data: report
    });

  } catch (error) {
    logger.error(`AI report generation error for ${division}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate AI report'
    });
  }
});

/**
 * GET /api/report-ai/:division/quick
 * Generate quick executive summary (faster, less detailed)
 */
router.get('/:division/quick', optionalAuthenticate, async (req, res) => {
  const { division } = req.params;
  const { year, months, type = 'Actual' } = req.query;

  try {
    if (!year || !months) {
      return res.status(400).json({
        success: false,
        error: 'year and months query parameters are required'
      });
    }

    const periods = {
      basePeriod: {
        year: parseInt(year),
        months: months.split(','),
        type
      },
      compPeriod: null
    };

    logger.info(`Quick AI report requested for ${division}`, { periods });

    const report = await divisionReportAIService.generateComprehensiveReport(
      division,
      periods,
      { quickMode: true }
    );

    // Return only executive summary for quick mode
    res.json({
      success: true,
      data: {
        executiveSummary: report.executiveSummary,
        riskAlerts: report.riskAlerts,
        recommendations: report.recommendations.slice(0, 3),
        metadata: report.metadata
      }
    });

  } catch (error) {
    logger.error(`Quick AI report error for ${division}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate quick AI report'
    });
  }
});

/**
 * POST /api/report-ai/:division/feedback
 * Record user feedback on an insight or recommendation
 */
router.post('/:division/feedback', authenticate, async (req, res) => {
  const { division } = req.params;
  const { insightId, insightType, feedbackType, notes, outcome } = req.body;

  try {
    if (!insightId || !feedbackType) {
      return res.status(400).json({
        success: false,
        error: 'insightId and feedbackType are required'
      });
    }

    // Valid feedback types
    const validFeedbackTypes = ['helpful', 'not_helpful', 'acted_upon', 'wrong', 'ignored'];
    if (!validFeedbackTypes.includes(feedbackType)) {
      return res.status(400).json({
        success: false,
        error: `feedbackType must be one of: ${validFeedbackTypes.join(', ')}`
      });
    }

    logger.info(`Recording feedback for ${division}`, {
      insightId,
      feedbackType,
      userId: req.user?.id
    });

    const result = await divisionReportAIService.recordFeedback(division, {
      insightId,
      insightType,
      feedbackType,
      notes,
      outcome,
      userId: req.user?.id
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error(`Feedback recording error for ${division}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to record feedback'
    });
  }
});

/**
 * POST /api/report-ai/:division/recommendation/:id/outcome
 * Record outcome of acting on a recommendation
 */
router.post('/:division/recommendation/:id/outcome', authenticate, async (req, res) => {
  const { division, id } = req.params;
  const { outcome, actualImpact, notes } = req.body;

  try {
    if (!outcome) {
      return res.status(400).json({
        success: false,
        error: 'outcome is required (positive, negative, neutral)'
      });
    }

    logger.info(`Recording recommendation outcome for ${division}`, {
      recommendationId: id,
      outcome,
      userId: req.user?.id
    });

    const result = await divisionReportAIService.recordFeedback(division, {
      insightId: id,
      insightType: 'recommendation',
      feedbackType: 'outcome_recorded',
      notes: JSON.stringify({ outcome, actualImpact, notes }),
      userId: req.user?.id
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error(`Outcome recording error for ${division}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to record outcome'
    });
  }
});

/**
 * GET /api/report-ai/:division/history
 * Get history of generated reports (for learning/tracking)
 */
router.get('/:division/history', authenticate, async (req, res) => {
  const { division } = req.params;
  const { limit = 10 } = req.query;

  try {
    // For now, return empty array - will be populated as reports are generated
    res.json({
      success: true,
      data: [],
      message: 'Report history tracking coming soon'
    });

  } catch (error) {
    logger.error(`History fetch error for ${division}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch report history'
    });
  }
});

/**
 * GET /api/report-ai/:division/insights-stats
 * Get statistics on insights and feedback
 */
router.get('/:division/insights-stats', authenticate, async (req, res) => {
  const { division } = req.params;

  try {
    // Return placeholder stats - will be populated from feedback data
    res.json({
      success: true,
      data: {
        totalReportsGenerated: 0,
        feedbackReceived: 0,
        helpfulRate: 0,
        actedUponRate: 0,
        topInsightTypes: [],
        improvementTrend: []
      },
      message: 'Insights statistics coming as feedback accumulates'
    });

  } catch (error) {
    logger.error(`Stats fetch error for ${division}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch insights stats'
    });
  }
});

// ===========================================================================
// DATA CAPTURE ENDPOINTS (for AI Learning)
// ===========================================================================

const dataCaptureService = require('../services/DataCaptureService');

/**
 * POST /api/report-ai/:division/capture/all
 * Capture all metrics for a given period
 */
router.post('/:division/capture/all', authenticate, async (req, res) => {
  const { division } = req.params;
  const { year, month } = req.body;

  try {
    if (!year || !month) {
      return res.status(400).json({
        success: false,
        error: 'year and month are required'
      });
    }

    logger.info(`Starting full metrics capture for ${division} ${year}-${month}`);
    
    const result = await dataCaptureService.captureAllMetrics(division, year, month);

    res.json({
      success: true,
      data: result,
      message: `Captured metrics for ${division} ${year}-${month}`
    });

  } catch (error) {
    logger.error(`Metrics capture error for ${division}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to capture metrics'
    });
  }
});

/**
 * POST /api/report-ai/:division/capture/backfill
 * Backfill historical data for a range of periods
 */
router.post('/:division/capture/backfill', authenticate, async (req, res) => {
  const { division } = req.params;
  const { startYear, startMonth, endYear, endMonth } = req.body;

  try {
    if (!startYear || !startMonth || !endYear || !endMonth) {
      return res.status(400).json({
        success: false,
        error: 'startYear, startMonth, endYear, and endMonth are required'
      });
    }

    logger.info(`Starting historical backfill for ${division}`);
    
    const result = await dataCaptureService.backfillHistoricalData(
      division, 
      parseInt(startYear), 
      parseInt(startMonth), 
      parseInt(endYear), 
      parseInt(endMonth)
    );

    res.json({
      success: true,
      data: result,
      message: `Backfilled ${result.length} periods for ${division}`
    });

  } catch (error) {
    logger.error(`Backfill error for ${division}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to backfill historical data'
    });
  }
});

/**
 * POST /api/report-ai/:division/recommendations
 * Record a new AI recommendation
 */
router.post('/:division/recommendations', authenticate, async (req, res) => {
  const { division } = req.params;
  const recommendation = req.body;

  try {
    const result = await dataCaptureService.recordRecommendation(division, recommendation);

    res.json({
      success: true,
      data: result,
      message: 'Recommendation recorded'
    });

  } catch (error) {
    logger.error(`Recommendation recording error:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to record recommendation'
    });
  }
});

/**
 * PUT /api/report-ai/:division/recommendations/:id/outcome
 * Update recommendation outcome
 */
router.put('/:division/recommendations/:id/outcome', authenticate, async (req, res) => {
  const { division, id } = req.params;
  const outcome = req.body;

  try {
    outcome.actedBy = req.user?.email || 'anonymous';
    const result = await dataCaptureService.updateRecommendationOutcome(division, id, outcome);

    res.json({
      success: true,
      data: result,
      message: 'Recommendation outcome updated'
    });

  } catch (error) {
    logger.error(`Recommendation update error:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update recommendation'
    });
  }
});

module.exports = router;
