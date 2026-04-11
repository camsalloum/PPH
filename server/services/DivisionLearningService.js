/**
 * Division Learning Service
 * 
 * AI-powered learning for division-level patterns and predictions.
 * 
 * Features:
 * - Seasonality pattern detection from historical data
 * - Dynamic threshold optimization
 * - Division profile learning
 * - Monthly prediction generation
 * 
 * IMPORTANT: This service reads from behavior history tables
 * which are populated by DataCaptureService using:
 * - PGCombine product groups (not raw)
 * - Canonical sales rep names (alias-resolved)
 * - Merged customer names
 * 
 * @version 1.1
 * @date December 28, 2025 - Documents data filtering dependency
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

class DivisionLearningService {
  
  /**
   * Get table prefix for division
   */
  getDivisionPrefix(divisionCode) {
    return divisionCode.toLowerCase().split('-')[0];
  }

  // ===========================================================================
  // SEASONALITY LEARNING
  // ===========================================================================

  /**
   * Learn seasonality patterns from historical data
   * Uses simple averaging approach with confidence based on sample size
   * 
   * @param {string} divisionCode 
   * @param {number} minYearsHistory - Minimum years of data required (default: 2)
   */
  async learnSeasonality(divisionCode, minYearsHistory = 2) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const historyTable = `${prefix}_division_behavior_history`;
    const seasonalityTable = `${prefix}_learned_seasonality`;

    try {
      // Get all historical data grouped by month
      const result = await pool.query(`
        SELECT 
          month,
          COUNT(*) as years_count,
          AVG(total_sales) as avg_sales,
          STDDEV(total_sales) as stddev_sales,
          AVG(total_volume) as avg_volume,
          STDDEV(total_volume) as stddev_volume
        FROM ${historyTable}
        WHERE total_sales > 0
        GROUP BY month
        ORDER BY month
      `);

      if (result.rows.length < 12) {
        logger.warn(`Not enough monthly data for ${divisionCode}. Have ${result.rows.length} months.`);
        return { success: false, reason: 'Insufficient data' };
      }

      // Calculate overall average
      const overallResult = await pool.query(`
        SELECT 
          AVG(total_sales) as overall_avg_sales,
          AVG(total_volume) as overall_avg_volume
        FROM ${historyTable}
        WHERE total_sales > 0
      `);

      const overallAvgSales = parseFloat(overallResult.rows[0].overall_avg_sales) || 1;
      const overallAvgVolume = parseFloat(overallResult.rows[0].overall_avg_volume) || 1;

      // Calculate seasonality factors for each month
      const seasonalityFactors = [];
      for (const row of result.rows) {
        const yearsCount = parseInt(row.years_count);
        const avgSales = parseFloat(row.avg_sales);
        const avgVolume = parseFloat(row.avg_volume);
        const stddevSales = parseFloat(row.stddev_sales) || 0;

        // Calculate seasonality factor (ratio to overall average)
        const salesFactor = avgSales / overallAvgSales;
        const volumeFactor = avgVolume / overallAvgVolume;
        const combinedFactor = (salesFactor + volumeFactor) / 2;

        // Confidence based on:
        // - Number of years of data (more years = higher confidence)
        // - Lower stddev = higher confidence (more consistent pattern)
        const yearsConfidence = Math.min(1, yearsCount / 5); // Max confidence at 5 years
        const consistencyConfidence = avgSales > 0 
          ? Math.max(0, 1 - (stddevSales / avgSales)) 
          : 0;
        const confidence = (yearsConfidence * 0.6) + (consistencyConfidence * 0.4);

        seasonalityFactors.push({
          month: row.month,
          seasonalityFactor: combinedFactor,
          salesFactor,
          volumeFactor,
          confidence: Math.min(1, Math.max(0, confidence)),
          samplesUsed: yearsCount
        });
      }

      // Update seasonality table
      for (const sf of seasonalityFactors) {
        await pool.query(`
          INSERT INTO ${seasonalityTable} (
            month, seasonality_factor, sales_factor, volume_factor,
            confidence, samples_used, last_trained
          ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
          ON CONFLICT (month) 
          DO UPDATE SET
            seasonality_factor = EXCLUDED.seasonality_factor,
            sales_factor = EXCLUDED.sales_factor,
            volume_factor = EXCLUDED.volume_factor,
            confidence = EXCLUDED.confidence,
            samples_used = EXCLUDED.samples_used,
            last_trained = CURRENT_TIMESTAMP
        `, [
          sf.month,
          sf.seasonalityFactor,
          sf.salesFactor,
          sf.volumeFactor,
          sf.confidence,
          sf.samplesUsed
        ]);
      }

      logger.info(`Learned seasonality for ${divisionCode}: ${seasonalityFactors.length} months`);

      return {
        success: true,
        seasonalityFactors,
        message: `Learned from ${result.rows.reduce((sum, r) => sum + parseInt(r.years_count), 0)} monthly observations`
      };

    } catch (error) {
      logger.error('Failed to learn seasonality:', error);
      throw error;
    }
  }

  /**
   * Get learned seasonality factors
   */
  async getSeasonality(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_learned_seasonality`;

    try {
      const result = await pool.query(`
        SELECT * FROM ${table}
        ORDER BY month
      `);

      return result.rows.map(r => ({
        month: r.month,
        factor: parseFloat(r.seasonality_factor),
        salesFactor: parseFloat(r.sales_factor),
        volumeFactor: parseFloat(r.volume_factor),
        confidence: parseFloat(r.confidence),
        samplesUsed: r.samples_used,
        lastTrained: r.last_trained
      }));
    } catch (error) {
      logger.error('Failed to get seasonality:', error);
      return [];
    }
  }

  /**
   * Apply seasonality factor to a prediction
   */
  async adjustForSeasonality(divisionCode, baseValue, month) {
    const seasonality = await this.getSeasonality(divisionCode);
    const monthData = seasonality.find(s => s.month === month);

    if (!monthData || monthData.confidence < 0.3) {
      return baseValue; // Not enough confidence
    }

    return baseValue * monthData.factor;
  }

  // ===========================================================================
  // DYNAMIC THRESHOLD LEARNING
  // ===========================================================================

  /**
   * Learn optimal thresholds from historical patterns
   * Analyzes what "normal" variance looks like for this division
   */
  async learnThresholds(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const historyTable = `${prefix}_division_behavior_history`;
    const thresholdsTable = `${prefix}_learned_thresholds`;

    try {
      // Analyze month-over-month changes
      const momResult = await pool.query(`
        WITH monthly_data AS (
          SELECT 
            year, month, total_sales, total_volume,
            LAG(total_sales) OVER (ORDER BY year, month) as prev_sales,
            LAG(total_volume) OVER (ORDER BY year, month) as prev_volume
          FROM ${historyTable}
          WHERE total_sales > 0
          ORDER BY year, month
        )
        SELECT 
          AVG(CASE WHEN prev_sales > 0 THEN (total_sales - prev_sales) / prev_sales * 100 END) as avg_mom_change,
          STDDEV(CASE WHEN prev_sales > 0 THEN (total_sales - prev_sales) / prev_sales * 100 END) as stddev_mom_change,
          PERCENTILE_CONT(0.1) WITHIN GROUP (
            ORDER BY CASE WHEN prev_sales > 0 THEN (total_sales - prev_sales) / prev_sales * 100 END
          ) as p10_change,
          PERCENTILE_CONT(0.9) WITHIN GROUP (
            ORDER BY CASE WHEN prev_sales > 0 THEN (total_sales - prev_sales) / prev_sales * 100 END
          ) as p90_change,
          COUNT(*) as sample_count
        FROM monthly_data
        WHERE prev_sales > 0
      `);

      const mom = momResult.rows[0];
      const sampleCount = parseInt(mom.sample_count) || 0;

      if (sampleCount < 12) {
        logger.warn(`Not enough data for threshold learning: ${sampleCount} samples`);
        return { success: false, reason: 'Insufficient data' };
      }

      // Calculate learned thresholds
      const avgChange = parseFloat(mom.avg_mom_change) || 0;
      const stddevChange = parseFloat(mom.stddev_mom_change) || 15;
      const p10 = parseFloat(mom.p10_change) || -15;
      const p90 = parseFloat(mom.p90_change) || 15;

      // Thresholds to learn
      const thresholds = [
        {
          type: 'underperformance_volume_pct',
          value: Math.min(-5, p10), // At least -5%, but use P10 if worse
          baseline: -15
        },
        {
          type: 'underperformance_amount_pct',
          value: Math.min(-5, p10),
          baseline: -15
        },
        {
          type: 'growth_volume_pct',
          value: Math.max(5, p90), // At least +5%, but use P90 if better
          baseline: 10
        },
        {
          type: 'growth_amount_pct',
          value: Math.max(5, p90),
          baseline: 10
        },
        {
          type: 'yoy_decline_trigger',
          value: avgChange - (2 * stddevChange), // 2 stddev below average
          baseline: -10
        },
        {
          type: 'yoy_growth_trigger',
          value: avgChange + (2 * stddevChange), // 2 stddev above average
          baseline: 15
        }
      ];

      // Calculate confidence based on sample size
      const confidence = Math.min(1, sampleCount / 36); // Full confidence at 3 years

      // Update thresholds table
      for (const t of thresholds) {
        await pool.query(`
          UPDATE ${thresholdsTable}
          SET 
            threshold_value = $2,
            confidence = $3,
            samples_used = $4,
            is_active = $5,
            learned_at = CURRENT_TIMESTAMP
          WHERE threshold_type = $1
        `, [
          t.type,
          t.value,
          confidence,
          sampleCount,
          confidence >= 0.5 // Only activate if confidence >= 50%
        ]);
      }

      logger.info(`Learned thresholds for ${divisionCode}: ${thresholds.length} thresholds updated`);

      return {
        success: true,
        thresholds,
        confidence,
        samplesUsed: sampleCount
      };

    } catch (error) {
      logger.error('Failed to learn thresholds:', error);
      throw error;
    }
  }

  /**
   * Get current thresholds (learned if active, baseline otherwise)
   */
  async getThresholds(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_learned_thresholds`;

    try {
      const result = await pool.query(`
        SELECT 
          threshold_type,
          CASE WHEN is_active THEN threshold_value ELSE baseline_value END as value,
          is_active as is_learned,
          confidence,
          samples_used,
          learned_at
        FROM ${table}
      `);

      const thresholds = {};
      result.rows.forEach(r => {
        thresholds[r.threshold_type] = {
          value: parseFloat(r.value),
          isLearned: r.is_learned,
          confidence: parseFloat(r.confidence),
          samplesUsed: r.samples_used,
          learnedAt: r.learned_at
        };
      });

      return thresholds;
    } catch (error) {
      logger.error('Failed to get thresholds:', error);
      // Return default thresholds
      return {
        underperformance_volume_pct: { value: -15, isLearned: false },
        underperformance_amount_pct: { value: -15, isLearned: false },
        growth_volume_pct: { value: 10, isLearned: false },
        growth_amount_pct: { value: 10, isLearned: false },
        yoy_decline_trigger: { value: -10, isLearned: false },
        yoy_growth_trigger: { value: 15, isLearned: false }
      };
    }
  }

  // ===========================================================================
  // DIVISION PROFILE
  // ===========================================================================

  /**
   * Get comprehensive learned division profile
   */
  async getDivisionProfile(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const historyTable = `${prefix}_division_behavior_history`;

    try {
      // Get basic statistics
      const statsResult = await pool.query(`
        SELECT 
          COUNT(*) as months_of_data,
          MIN(year || '-' || LPAD(month::text, 2, '0')) as first_month,
          MAX(year || '-' || LPAD(month::text, 2, '0')) as last_month,
          AVG(total_sales) as avg_monthly_sales,
          AVG(total_volume) as avg_monthly_volume,
          AVG(customer_count) as avg_customers,
          AVG(salesrep_count) as avg_reps,
          AVG(product_count) as avg_products,
          AVG(budget_achievement_pct) as avg_budget_achievement
        FROM ${historyTable}
        WHERE total_sales > 0
      `);

      const stats = statsResult.rows[0];

      // Get trend
      const trendResult = await pool.query(`
        WITH yearly_data AS (
          SELECT 
            year,
            SUM(total_sales) as yearly_sales,
            SUM(total_volume) as yearly_volume
          FROM ${historyTable}
          WHERE total_sales > 0
          GROUP BY year
          ORDER BY year
        )
        SELECT 
          year,
          yearly_sales,
          LAG(yearly_sales) OVER (ORDER BY year) as prev_sales,
          CASE WHEN LAG(yearly_sales) OVER (ORDER BY year) > 0 
            THEN (yearly_sales - LAG(yearly_sales) OVER (ORDER BY year)) / 
                 LAG(yearly_sales) OVER (ORDER BY year) * 100 
            ELSE 0 
          END as yoy_growth
        FROM yearly_data
      `);

      const yearlyGrowth = trendResult.rows
        .filter(r => r.yoy_growth !== null)
        .map(r => ({
          year: r.year,
          sales: parseFloat(r.yearly_sales),
          yoyGrowth: parseFloat(r.yoy_growth)
        }));

      // Get seasonality
      const seasonality = await this.getSeasonality(divisionCode);

      // Get thresholds
      const thresholds = await this.getThresholds(divisionCode);

      // Identify peak and low months
      const sortedSeasonality = [...seasonality].sort((a, b) => b.factor - a.factor);
      const peakMonths = sortedSeasonality.slice(0, 3).map(s => s.month);
      const lowMonths = sortedSeasonality.slice(-3).map(s => s.month);

      return {
        divisionCode,
        dataRange: {
          firstMonth: stats.first_month,
          lastMonth: stats.last_month,
          monthsOfData: parseInt(stats.months_of_data)
        },
        averages: {
          monthlySales: parseFloat(stats.avg_monthly_sales) || 0,
          monthlyVolume: parseFloat(stats.avg_monthly_volume) || 0,
          customers: Math.round(parseFloat(stats.avg_customers) || 0),
          salesReps: Math.round(parseFloat(stats.avg_reps) || 0),
          products: Math.round(parseFloat(stats.avg_products) || 0),
          budgetAchievement: parseFloat(stats.avg_budget_achievement) || 0
        },
        yearlyGrowth,
        seasonality: {
          peakMonths,
          lowMonths,
          factors: seasonality
        },
        thresholds,
        learningStatus: {
          seasonalityLearned: seasonality.some(s => s.confidence > 0.5),
          thresholdsLearned: Object.values(thresholds).some(t => t.isLearned)
        }
      };

    } catch (error) {
      logger.error('Failed to get division profile:', error);
      throw error;
    }
  }

  // ===========================================================================
  // PREDICTIONS
  // ===========================================================================

  /**
   * Generate sales prediction for a future month
   */
  async predictMonthly(divisionCode, targetYear, targetMonth) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const historyTable = `${prefix}_division_behavior_history`;
    const predictionsTable = `${prefix}_division_predictions`;

    try {
      // Get historical data for the same month in previous years
      const sameMonthResult = await pool.query(`
        SELECT 
          year, month, total_sales, total_volume
        FROM ${historyTable}
        WHERE month = $1 AND year < $2
        ORDER BY year DESC
        LIMIT 5
      `, [targetMonth, targetYear]);

      if (sameMonthResult.rows.length === 0) {
        return { success: false, reason: 'No historical data for this month' };
      }

      // Get recent trend (last 6 months)
      const trendResult = await pool.query(`
        SELECT 
          total_sales,
          total_volume
        FROM ${historyTable}
        ORDER BY year DESC, month DESC
        LIMIT 6
      `);

      // Calculate base prediction from same-month historical average
      const sameMonthAvgSales = sameMonthResult.rows.reduce(
        (sum, r) => sum + parseFloat(r.total_sales), 0
      ) / sameMonthResult.rows.length;

      // Calculate recent trend multiplier
      const recentSales = trendResult.rows.map(r => parseFloat(r.total_sales));
      const recentAvg = recentSales.reduce((a, b) => a + b, 0) / recentSales.length;
      const oldestRecent = recentSales[recentSales.length - 1] || recentAvg;
      const trendMultiplier = oldestRecent > 0 ? recentAvg / oldestRecent : 1;

      // Apply seasonality
      const seasonality = await this.getSeasonality(divisionCode);
      const monthSeasonality = seasonality.find(s => s.month === targetMonth);
      const seasonalityFactor = monthSeasonality?.factor || 1;

      // Combined prediction
      const predictedSales = sameMonthAvgSales * trendMultiplier * seasonalityFactor;

      // Store prediction
      await pool.query(`
        INSERT INTO ${predictionsTable} (
          prediction_type, target_year, target_month,
          predicted_value, model_version
        ) VALUES ('sales', $1, $2, $3, 1)
      `, [targetYear, targetMonth, predictedSales]);

      logger.info(`Generated prediction for ${divisionCode} ${targetYear}-${targetMonth}: ${predictedSales.toFixed(2)}`);

      return {
        success: true,
        prediction: {
          type: 'sales',
          targetYear,
          targetMonth,
          predictedValue: predictedSales,
          sameMonthHistorical: sameMonthAvgSales,
          trendMultiplier,
          seasonalityFactor,
          confidence: Math.min(1, sameMonthResult.rows.length / 3) * 
                      (monthSeasonality?.confidence || 0.5)
        }
      };

    } catch (error) {
      logger.error('Failed to generate prediction:', error);
      throw error;
    }
  }

  /**
   * Verify past predictions against actuals
   */
  async verifyPredictions(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const historyTable = `${prefix}_division_behavior_history`;
    const predictionsTable = `${prefix}_division_predictions`;

    try {
      // Find predictions that now have actuals
      const unverifiedResult = await pool.query(`
        SELECT p.id, p.target_year, p.target_month, p.predicted_value, p.prediction_type
        FROM ${predictionsTable} p
        WHERE p.verified_at IS NULL
          AND EXISTS (
            SELECT 1 FROM ${historyTable} h
            WHERE h.year = p.target_year AND h.month = p.target_month
          )
      `);

      let verified = 0;
      for (const pred of unverifiedResult.rows) {
        // Get actual value
        const actualResult = await pool.query(`
          SELECT total_sales, total_volume
          FROM ${historyTable}
          WHERE year = $1 AND month = $2
        `, [pred.target_year, pred.target_month]);

        if (actualResult.rows.length > 0) {
          const actual = pred.prediction_type === 'sales' 
            ? parseFloat(actualResult.rows[0].total_sales)
            : parseFloat(actualResult.rows[0].total_volume);
          
          const predicted = parseFloat(pred.predicted_value);
          const errorPct = actual > 0 
            ? ((predicted - actual) / actual) * 100 
            : 0;

          await pool.query(`
            UPDATE ${predictionsTable}
            SET actual_value = $2, error_pct = $3, verified_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [pred.id, actual, errorPct]);

          verified++;
        }
      }

      logger.info(`Verified ${verified} predictions for ${divisionCode}`);
      return { verified };

    } catch (error) {
      logger.error('Failed to verify predictions:', error);
      throw error;
    }
  }

  // ===========================================================================
  // LEARNING ORCHESTRATION
  // ===========================================================================

  /**
   * Run all learning processes for a division
   */
  async runAllLearning(divisionCode) {
    logger.info(`Starting learning cycle for ${divisionCode}`);

    const results = {
      seasonality: null,
      thresholds: null,
      predictions: null
    };

    try {
      // Learn seasonality
      results.seasonality = await this.learnSeasonality(divisionCode);
    } catch (error) {
      logger.error('Seasonality learning failed:', error);
      results.seasonality = { success: false, error: error.message };
    }

    try {
      // Learn thresholds
      results.thresholds = await this.learnThresholds(divisionCode);
    } catch (error) {
      logger.error('Threshold learning failed:', error);
      results.thresholds = { success: false, error: error.message };
    }

    try {
      // Verify past predictions
      results.predictions = await this.verifyPredictions(divisionCode);
    } catch (error) {
      logger.error('Prediction verification failed:', error);
      results.predictions = { success: false, error: error.message };
    }

    logger.info(`Completed learning cycle for ${divisionCode}`, results);
    return results;
  }
}

module.exports = new DivisionLearningService();
