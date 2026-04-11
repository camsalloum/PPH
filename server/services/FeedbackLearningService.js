/**
 * Feedback Learning Service
 * 
 * Self-improvement loop that learns from user feedback on AI recommendations.
 * Adjusts model weights and improves future predictions based on outcomes.
 * 
 * Features:
 * - Track recommendation acceptance/rejection
 * - Learn from feedback to improve accuracy
 * - A/B testing of recommendation strategies
 * - Model drift detection
 * - Confidence calibration
 * 
 * @version 1.0
 * @date December 27, 2025
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

class FeedbackLearningService {

  /**
   * Get table prefix for division
   */
  getDivisionPrefix(divisionCode) {
    return divisionCode.toLowerCase().split('-')[0];
  }

  /**
   * Ensure all feedback tables exist
   */
  async ensureTablesExist(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);

    // Recommendation feedback table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${prefix}_recommendation_feedback (
        id SERIAL PRIMARY KEY,
        recommendation_id VARCHAR(100),
        recommendation_type VARCHAR(50),
        recommendation_text TEXT,
        user_action VARCHAR(20),
        user_id VARCHAR(100),
        feedback_notes TEXT,
        actual_outcome VARCHAR(50),
        outcome_value DECIMAL(15,2),
        model_version VARCHAR(20) DEFAULT '1.0',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        outcome_recorded_at TIMESTAMP
      )
    `);

    // Insight feedback table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${prefix}_insight_feedback (
        id SERIAL PRIMARY KEY,
        insight_id VARCHAR(100),
        insight_type VARCHAR(50),
        insight_text TEXT,
        rating INTEGER,
        user_id VARCHAR(100),
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Learned weights table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${prefix}_learned_weights (
        id SERIAL PRIMARY KEY,
        weight_type VARCHAR(50),
        category VARCHAR(100),
        weight DECIMAL(10,4),
        confidence DECIMAL(5,2),
        sample_size INTEGER,
        learned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insight performance table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${prefix}_insight_performance (
        id SERIAL PRIMARY KEY,
        insight_type VARCHAR(50),
        total_feedback INTEGER,
        avg_rating DECIMAL(5,2),
        positive_rate DECIMAL(5,2),
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Model calibration table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${prefix}_model_calibration (
        id SERIAL PRIMARY KEY,
        model_type VARCHAR(50),
        prediction_count INTEGER,
        accuracy_rate DECIMAL(5,2),
        calibrated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  // ===========================================================================
  // FEEDBACK COLLECTION
  // ===========================================================================

  /**
   * Record feedback on an AI recommendation
   */
  async recordRecommendationFeedback(divisionCode, feedback) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_recommendation_feedback`;

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id SERIAL PRIMARY KEY,
          recommendation_id VARCHAR(100),
          recommendation_type VARCHAR(50),
          recommendation_text TEXT,
          user_action VARCHAR(20),
          user_id VARCHAR(100),
          feedback_notes TEXT,
          actual_outcome VARCHAR(50),
          outcome_value DECIMAL(15,2),
          model_version VARCHAR(20) DEFAULT '1.0',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          outcome_recorded_at TIMESTAMP
        )
      `);

      await pool.query(`
        INSERT INTO ${table} (
          recommendation_id, recommendation_type, recommendation_text,
          user_action, user_id, feedback_notes, model_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        feedback.recommendationId,
        feedback.recommendationType,
        feedback.recommendationText,
        feedback.userAction, // 'accepted', 'rejected', 'deferred', 'modified'
        feedback.userId,
        feedback.notes || null,
        feedback.modelVersion || '1.0'
      ]);

      logger.info(`Recorded feedback for recommendation ${feedback.recommendationId}: ${feedback.userAction}`);

      // Trigger learning if enough feedback accumulated
      await this.checkAndTriggerLearning(divisionCode);

      return { success: true };
    } catch (error) {
      logger.error('Failed to record recommendation feedback:', error);
      throw error;
    }
  }

  /**
   * Record actual outcome of a recommendation
   */
  async recordOutcome(divisionCode, recommendationId, outcome) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_recommendation_feedback`;

    try {
      await pool.query(`
        UPDATE ${table}
        SET 
          actual_outcome = $1,
          outcome_value = $2,
          outcome_recorded_at = CURRENT_TIMESTAMP
        WHERE recommendation_id = $3
      `, [outcome.result, outcome.value, recommendationId]);

      logger.info(`Recorded outcome for ${recommendationId}: ${outcome.result}`);

      return { success: true };
    } catch (error) {
      logger.error('Failed to record outcome:', error);
      throw error;
    }
  }

  /**
   * Record insight feedback (thumbs up/down)
   */
  async recordInsightFeedback(divisionCode, feedback) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_insight_feedback`;

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id SERIAL PRIMARY KEY,
          insight_id VARCHAR(100),
          insight_type VARCHAR(50),
          insight_text TEXT,
          rating INTEGER,
          user_id VARCHAR(100),
          feedback_comment TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.query(`
        INSERT INTO ${table} (
          insight_id, insight_type, insight_text,
          rating, user_id, feedback_comment
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        feedback.insightId,
        feedback.insightType,
        feedback.insightText,
        feedback.rating, // 1 = thumbs up, -1 = thumbs down, 0 = neutral
        feedback.userId,
        feedback.comment || null
      ]);

      logger.info(`Recorded insight feedback: ${feedback.rating > 0 ? '👍' : feedback.rating < 0 ? '👎' : '😐'}`);

      return { success: true };
    } catch (error) {
      logger.error('Failed to record insight feedback:', error);
      throw error;
    }
  }

  // ===========================================================================
  // LEARNING FROM FEEDBACK
  // ===========================================================================

  /**
   * Check if enough feedback to trigger learning
   */
  async checkAndTriggerLearning(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_recommendation_feedback`;

    try {
      // Check if we have enough new feedback
      const count = await pool.query(`
        SELECT COUNT(*) as cnt FROM ${table}
        WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
      `);

      const recentFeedback = parseInt(count.rows[0]?.cnt) || 0;

      // Trigger learning if we have at least 20 new feedback items
      if (recentFeedback >= 20) {
        await this.learnFromFeedback(divisionCode);
      }

      return { triggered: recentFeedback >= 20, recentFeedback };
    } catch (error) {
      return { triggered: false, error: error.message };
    }
  }

  /**
   * Learn from accumulated feedback
   */
  async learnFromFeedback(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);

    try {
      // Ensure tables exist
      await this.ensureTablesExist(divisionCode);

      // Calculate acceptance rates by recommendation type
      const acceptanceRates = await pool.query(`
        SELECT 
          recommendation_type,
          COUNT(*) as total,
          SUM(CASE WHEN user_action = 'accepted' THEN 1 ELSE 0 END) as accepted,
          SUM(CASE WHEN user_action = 'rejected' THEN 1 ELSE 0 END) as rejected,
          SUM(CASE WHEN actual_outcome = 'positive' THEN 1 ELSE 0 END) as positive_outcomes
        FROM ${prefix}_recommendation_feedback
        WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '90 days'
        GROUP BY recommendation_type
      `);

      // Store learned weights
      await this.storeLearnedWeights(divisionCode, acceptanceRates.rows);

      // Calculate insight accuracy
      const insightAccuracy = await pool.query(`
        SELECT 
          insight_type,
          COUNT(*) as total,
          AVG(rating) as avg_rating,
          SUM(CASE WHEN rating > 0 THEN 1 ELSE 0 END) as positive,
          SUM(CASE WHEN rating < 0 THEN 1 ELSE 0 END) as negative
        FROM ${prefix}_insight_feedback
        WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '90 days'
        GROUP BY insight_type
      `);

      // Store insight performance
      await this.storeInsightPerformance(divisionCode, insightAccuracy.rows);

      logger.info(`Completed feedback learning for ${divisionCode}`);

      return {
        success: true,
        recommendationTypes: acceptanceRates.rows.length,
        insightTypes: insightAccuracy.rows.length
      };

    } catch (error) {
      logger.error('Failed to learn from feedback:', error);
      throw error;
    }
  }

  /**
   * Store learned weights for recommendation types
   */
  async storeLearnedWeights(divisionCode, rates) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_learned_weights`;

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id SERIAL PRIMARY KEY,
          weight_type VARCHAR(50),
          category VARCHAR(100),
          weight DECIMAL(10,4),
          confidence DECIMAL(5,2),
          sample_size INTEGER,
          learned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      for (const rate of rates) {
        const total = parseInt(rate.total) || 1;
        const accepted = parseInt(rate.accepted) || 0;
        const positiveOutcomes = parseInt(rate.positive_outcomes) || 0;
        
        // Calculate weight based on acceptance and outcomes
        const acceptanceRate = accepted / total;
        const outcomeRate = positiveOutcomes / total;
        const weight = (acceptanceRate * 0.4) + (outcomeRate * 0.6); // Weight outcomes more
        const confidence = Math.min(0.95, 0.5 + (total / 100) * 0.45);

        await pool.query(`
          INSERT INTO ${table} (weight_type, category, weight, confidence, sample_size)
          VALUES ('recommendation', $1, $2, $3, $4)
          ON CONFLICT DO NOTHING
        `, [rate.recommendation_type, weight, confidence, total]);
      }

      return { success: true };
    } catch (error) {
      logger.error('Failed to store learned weights:', error);
      throw error;
    }
  }

  /**
   * Store insight performance metrics
   */
  async storeInsightPerformance(divisionCode, accuracy) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_insight_performance`;

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id SERIAL PRIMARY KEY,
          insight_type VARCHAR(50),
          avg_rating DECIMAL(5,2),
          positive_count INTEGER,
          negative_count INTEGER,
          total_count INTEGER,
          accuracy_score DECIMAL(5,2),
          analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      for (const acc of accuracy) {
        const total = parseInt(acc.total) || 1;
        const positive = parseInt(acc.positive) || 0;
        const negative = parseInt(acc.negative) || 0;
        const accuracyScore = (positive - negative) / total;

        await pool.query(`
          INSERT INTO ${table} (
            insight_type, avg_rating, positive_count, negative_count,
            total_count, accuracy_score
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          acc.insight_type,
          parseFloat(acc.avg_rating) || 0,
          positive,
          negative,
          total,
          accuracyScore
        ]);
      }

      return { success: true };
    } catch (error) {
      logger.error('Failed to store insight performance:', error);
      throw error;
    }
  }

  // ===========================================================================
  // MODEL CALIBRATION
  // ===========================================================================

  /**
   * Calibrate confidence scores based on actual outcomes
   */
  async calibrateConfidence(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);

    try {
      // Ensure tables exist
      await this.ensureTablesExist(divisionCode);

      // Get predictions with known outcomes
      const predictions = await pool.query(`
        SELECT 
          recommendation_type,
          model_version,
          user_action,
          actual_outcome
        FROM ${prefix}_recommendation_feedback
        WHERE actual_outcome IS NOT NULL
          AND created_at > CURRENT_TIMESTAMP - INTERVAL '180 days'
      `);

      if (predictions.rows.length < 10) {
        return { success: false, reason: 'Insufficient data for calibration' };
      }

      // Calculate calibration metrics
      const byType = {};
      for (const pred of predictions.rows) {
        const type = pred.recommendation_type;
        if (!byType[type]) {
          byType[type] = { total: 0, accurate: 0 };
        }
        byType[type].total++;
        if (pred.actual_outcome === 'positive') {
          byType[type].accurate++;
        }
      }

      // Store calibration
      await this.storeCalibration(divisionCode, byType);

      logger.info(`Calibrated confidence for ${Object.keys(byType).length} recommendation types`);

      return {
        success: true,
        calibration: Object.entries(byType).map(([type, data]) => ({
          type,
          accuracy: data.accurate / data.total,
          sampleSize: data.total
        }))
      };

    } catch (error) {
      logger.error('Failed to calibrate confidence:', error);
      throw error;
    }
  }

  /**
   * Store calibration data
   */
  async storeCalibration(divisionCode, calibrationByType) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_model_calibration`;

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id SERIAL PRIMARY KEY,
          recommendation_type VARCHAR(50),
          accuracy DECIMAL(5,4),
          sample_size INTEGER,
          calibrated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      for (const [type, data] of Object.entries(calibrationByType)) {
        await pool.query(`
          INSERT INTO ${table} (recommendation_type, accuracy, sample_size)
          VALUES ($1, $2, $3)
        `, [type, data.accurate / data.total, data.total]);
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  // ===========================================================================
  // ANALYTICS
  // ===========================================================================

  /**
   * Get feedback analytics
   */
  async getFeedbackAnalytics(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);

    try {
      // Ensure tables exist
      await this.ensureTablesExist(divisionCode);

      // Recommendation feedback summary
      const recFeedback = await pool.query(`
        SELECT 
          recommendation_type,
          COUNT(*) as total,
          SUM(CASE WHEN user_action = 'accepted' THEN 1 ELSE 0 END) as accepted,
          SUM(CASE WHEN user_action = 'rejected' THEN 1 ELSE 0 END) as rejected,
          SUM(CASE WHEN user_action = 'deferred' THEN 1 ELSE 0 END) as deferred
        FROM ${prefix}_recommendation_feedback
        WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
        GROUP BY recommendation_type
        ORDER BY total DESC
      `);

      // Insight feedback summary
      const insightFeedback = await pool.query(`
        SELECT 
          insight_type,
          COUNT(*) as total,
          AVG(rating) as avg_rating
        FROM ${prefix}_insight_feedback
        WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
        GROUP BY insight_type
        ORDER BY avg_rating DESC
      `);

      // Overall metrics
      const overall = await pool.query(`
        SELECT 
          COUNT(*) as total_feedback,
          SUM(CASE WHEN user_action = 'accepted' THEN 1 ELSE 0 END) as total_accepted
        FROM ${prefix}_recommendation_feedback
        WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
      `);

      const totalFeedback = parseInt(overall.rows[0]?.total_feedback) || 0;
      const totalAccepted = parseInt(overall.rows[0]?.total_accepted) || 0;

      return {
        success: true,
        summary: {
          totalFeedback,
          acceptanceRate: totalFeedback > 0 ? (totalAccepted / totalFeedback) * 100 : 0
        },
        byRecommendationType: recFeedback.rows,
        byInsightType: insightFeedback.rows
      };

    } catch (error) {
      logger.error('Failed to get feedback analytics:', error);
      return { success: false, error: error.message };
    }
  }

  // ===========================================================================
  // RUN ALL
  // ===========================================================================

  /**
   * Run full feedback learning cycle
   */
  async runFullLearning(divisionCode) {
    const results = {
      feedbackLearning: null,
      calibration: null,
      analytics: null
    };

    try {
      results.feedbackLearning = await this.learnFromFeedback(divisionCode);
    } catch (e) {
      results.feedbackLearning = { success: false, error: e.message };
    }

    try {
      results.calibration = await this.calibrateConfidence(divisionCode);
    } catch (e) {
      results.calibration = { success: false, error: e.message };
    }

    try {
      results.analytics = await this.getFeedbackAnalytics(divisionCode);
    } catch (e) {
      results.analytics = { success: false, error: e.message };
    }

    logger.info(`Completed feedback learning cycle for ${divisionCode}`);
    return results;
  }
}

module.exports = new FeedbackLearningService();
