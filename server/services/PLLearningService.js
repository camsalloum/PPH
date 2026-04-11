/**
 * P&L Learning Service
 * 
 * Learns from P&L data to provide:
 * - Margin trend predictions
 * - Cost anomaly detection
 * - Expense pattern analysis
 * - Profitability forecasting
 * - Product mix optimization insights
 * 
 * IMPORTANT: All queries use filtered data:
 * - PGCombine product groups (not raw)
 * - Excludes unmapped products
 * 
 * @version 1.1
 * @date December 28, 2025 - Updated to use DataFilteringHelper
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');
const DataFilteringHelper = require('./DataFilteringHelper');

class PLLearningService {
  
  /**
   * Get table prefix for division
   */
  getDivisionPrefix(divisionCode) {
    return divisionCode.toLowerCase().split('-')[0];
  }

  // ===========================================================================
  // MARGIN INTELLIGENCE
  // ===========================================================================

  /**
   * Analyze margin trends and predict future margins
   * Uses historical GP%, manufacturing cost %, and expense ratios
   * Applies PGCombine filtering to exclude unmapped products
   */
  async analyzeMarginTrends(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const tables = DataFilteringHelper.getTableNames(divisionCode);
    const pg = DataFilteringHelper.getProductGroupSQL(divisionCode);

    try {
      // Get historical P&L data with proper filtering
      // NOTE: fp_actualcommon uses 'amount' column directly (no values_type)
      const historicalData = await pool.query(`
        SELECT 
          d.year, d.month,
          SUM(d.amount) as total_sales,
          0 as manufacturing_cost,
          0 as gross_profit
        FROM ${tables.actualData} d
        ${pg.joins}
        WHERE ${pg.filterCondition}
        GROUP BY d.year, d.month
        ORDER BY d.year, d.month
      `);

      if (historicalData.rows.length < 6) {
        return { success: false, reason: 'Insufficient data for margin analysis' };
      }

      // Calculate margin metrics per period
      const marginMetrics = historicalData.rows.map(row => ({
        year: row.year,
        month: row.month,
        totalSales: parseFloat(row.total_sales) || 0,
        manufacturingCost: parseFloat(row.manufacturing_cost) || 0,
        grossProfit: parseFloat(row.gross_profit) || 0,
        gpPct: row.total_sales > 0 
          ? ((row.total_sales - row.manufacturing_cost) / row.total_sales) * 100 
          : 0
      }));

      // Calculate trend using linear regression
      const n = marginMetrics.length;
      const gpValues = marginMetrics.map(m => m.gpPct);
      const avgGP = gpValues.reduce((a, b) => a + b, 0) / n;
      
      // Simple trend: compare last 3 months to previous 3 months
      const recent = gpValues.slice(-3);
      const previous = gpValues.slice(-6, -3);
      
      const recentAvg = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
      const previousAvg = previous.length > 0 ? previous.reduce((a, b) => a + b, 0) / previous.length : 0;
      
      const trend = recentAvg - previousAvg;
      const trendDirection = trend > 1 ? 'improving' : trend < -1 ? 'declining' : 'stable';

      // Store margin intelligence
      await this.storeMarginIntelligence(divisionCode, {
        avgGP,
        recentAvg,
        previousAvg,
        trend,
        trendDirection,
        periodsAnalyzed: n
      });

      logger.info(`Analyzed margin trends for ${divisionCode}: ${trendDirection} (${trend.toFixed(2)}%)`);

      return {
        success: true,
        avgGrossMargin: avgGP,
        recentMargin: recentAvg,
        previousMargin: previousAvg,
        trend: trend,
        trendDirection,
        periodsAnalyzed: n,
        prediction: {
          nextMonthGP: recentAvg + (trend * 0.5), // Conservative prediction
          confidence: Math.min(0.9, 0.5 + (n / 24) * 0.4) // More data = more confidence
        }
      };

    } catch (error) {
      logger.error('Failed to analyze margin trends:', error);
      throw error;
    }
  }

  /**
   * Store margin intelligence for tracking
   */
  async storeMarginIntelligence(divisionCode, intelligence) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_margin_intelligence`;

    try {
      // Create table if not exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id SERIAL PRIMARY KEY,
          analysis_date DATE DEFAULT CURRENT_DATE,
          avg_gp_pct DECIMAL(10,4),
          recent_gp_pct DECIMAL(10,4),
          previous_gp_pct DECIMAL(10,4),
          trend_value DECIMAL(10,4),
          trend_direction VARCHAR(20),
          periods_analyzed INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.query(`
        INSERT INTO ${table} (
          avg_gp_pct, recent_gp_pct, previous_gp_pct,
          trend_value, trend_direction, periods_analyzed
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        intelligence.avgGP,
        intelligence.recentAvg,
        intelligence.previousAvg,
        intelligence.trend,
        intelligence.trendDirection,
        intelligence.periodsAnalyzed
      ]);

      return { success: true };
    } catch (error) {
      logger.error('Failed to store margin intelligence:', error);
      throw error;
    }
  }

  // ===========================================================================
  // COST ANOMALY DETECTION
  // ===========================================================================

  /**
   * Detect anomalies in cost categories
   * Flags unusual spikes or dips in expenses
   * Applies PGCombine filtering
   */
  async detectCostAnomalies(divisionCode, year, month) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const tables = DataFilteringHelper.getTableNames(divisionCode);
    const pg = DataFilteringHelper.getProductGroupSQL(divisionCode);

    try {
      // Get expense data - fp_actualcommon may not have expense data
      // This is a simplified version since actual expense tracking may use separate tables
      const expenseData = await pool.query(`
        SELECT 
          d.pgcombine as category,
          d.year, d.month,
          SUM(d.amount) as total_expense
        FROM ${tables.actualData} d
        ${pg.joins}
        WHERE d.amount < 0
          AND ${pg.filterCondition}
        GROUP BY d.pgcombine, d.year, d.month
        ORDER BY d.pgcombine, d.year, d.month
      `);

      const anomalies = [];
      
      // Group by category
      const categoryData = {};
      for (const row of expenseData.rows) {
        if (!categoryData[row.category]) {
          categoryData[row.category] = [];
        }
        categoryData[row.category].push({
          year: row.year,
          month: row.month,
          expense: Math.abs(parseFloat(row.total_expense) || 0)
        });
      }

      // Detect anomalies using z-score
      for (const [category, data] of Object.entries(categoryData)) {
        if (data.length < 6) continue;

        const expenses = data.map(d => d.expense);
        const mean = expenses.reduce((a, b) => a + b, 0) / expenses.length;
        const stdDev = Math.sqrt(
          expenses.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / expenses.length
        );

        // Check each period
        for (const period of data) {
          if (stdDev === 0) continue;
          
          const zScore = (period.expense - mean) / stdDev;
          
          if (Math.abs(zScore) > 2) {
            anomalies.push({
              category,
              year: period.year,
              month: period.month,
              expense: period.expense,
              mean,
              zScore,
              anomalyType: zScore > 0 ? 'spike' : 'drop',
              severity: Math.abs(zScore) > 3 ? 'high' : 'medium',
              pctDeviation: ((period.expense - mean) / mean) * 100
            });
          }
        }
      }

      // Store anomalies
      if (anomalies.length > 0) {
        await this.storeCostAnomalies(divisionCode, anomalies);
      }

      logger.info(`Detected ${anomalies.length} cost anomalies for ${divisionCode}`);

      return {
        success: true,
        detected: anomalies.length,
        anomalies: anomalies.slice(0, 20) // Return top 20
      };

    } catch (error) {
      logger.error('Failed to detect cost anomalies:', error);
      throw error;
    }
  }

  /**
   * Store detected cost anomalies
   */
  async storeCostAnomalies(divisionCode, anomalies) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_cost_anomalies`;

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id SERIAL PRIMARY KEY,
          category VARCHAR(100),
          year INTEGER,
          month INTEGER,
          expense_amount DECIMAL(15,2),
          expected_amount DECIMAL(15,2),
          z_score DECIMAL(10,4),
          anomaly_type VARCHAR(20),
          severity VARCHAR(20),
          pct_deviation DECIMAL(10,2),
          detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          acknowledged BOOLEAN DEFAULT FALSE
        )
      `);

      for (const anomaly of anomalies) {
        await pool.query(`
          INSERT INTO ${table} (
            category, year, month, expense_amount, expected_amount,
            z_score, anomaly_type, severity, pct_deviation
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT DO NOTHING
        `, [
          anomaly.category,
          anomaly.year,
          anomaly.month,
          anomaly.expense,
          anomaly.mean,
          anomaly.zScore,
          anomaly.anomalyType,
          anomaly.severity,
          anomaly.pctDeviation
        ]);
      }

      return { success: true };
    } catch (error) {
      logger.error('Failed to store cost anomalies:', error);
      throw error;
    }
  }

  // ===========================================================================
  // PROFITABILITY PREDICTION
  // ===========================================================================

  /**
   * Predict next period profitability based on trends
   * Applies PGCombine filtering
   */
  async predictProfitability(divisionCode, targetYear, targetMonth) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const tables = DataFilteringHelper.getTableNames(divisionCode);
    const pg = DataFilteringHelper.getProductGroupSQL(divisionCode);

    try {
      // Get historical sales with proper filtering
      // NOTE: fp_actualcommon uses 'amount' column
      const history = await pool.query(`
        SELECT 
          d.year, d.month,
          SUM(d.amount) as total_amount
        FROM ${tables.actualData} d
        ${pg.joins}
        WHERE ${pg.filterCondition}
        GROUP BY d.year, d.month
        ORDER BY d.year, d.month
      `);

      if (history.rows.length < 12) {
        return { success: false, reason: 'Need at least 12 months for prediction' };
      }

      // Calculate moving averages
      const amounts = history.rows.map(r => parseFloat(r.total_amount) || 0);
      const ma3 = this.movingAverage(amounts, 3);
      const ma6 = this.movingAverage(amounts, 6);

      // Simple prediction: weighted average of recent trends
      const lastMA3 = ma3[ma3.length - 1] || 0;
      const lastMA6 = ma6[ma6.length - 1] || 0;
      const trend = (lastMA3 - lastMA6) / Math.max(lastMA6, 1);

      // Apply seasonality if available
      let seasonalFactor = 1;
      const sameMonthData = history.rows.filter(r => r.month === targetMonth);
      if (sameMonthData.length >= 2) {
        const sameMonthAvg = sameMonthData.reduce((sum, r) => sum + parseFloat(r.total_amount), 0) / sameMonthData.length;
        const overallAvg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        seasonalFactor = sameMonthAvg / Math.max(overallAvg, 1);
      }

      const predictedAmount = lastMA3 * (1 + trend * 0.5) * seasonalFactor;

      // Store prediction
      await this.storePLPrediction(divisionCode, targetYear, targetMonth, {
        predictedAmount,
        trend,
        seasonalFactor,
        confidence: Math.min(0.85, 0.5 + (history.rows.length / 36) * 0.35)
      });

      logger.info(`Predicted ${divisionCode} profitability for ${targetYear}-${targetMonth}: ${predictedAmount.toFixed(2)}`);

      return {
        success: true,
        targetYear,
        targetMonth,
        predictedAmount,
        trend: trend * 100,
        seasonalFactor,
        basedOnPeriods: history.rows.length
      };

    } catch (error) {
      logger.error('Failed to predict profitability:', error);
      throw error;
    }
  }

  /**
   * Calculate moving average
   */
  movingAverage(data, window) {
    const result = [];
    for (let i = window - 1; i < data.length; i++) {
      const sum = data.slice(i - window + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / window);
    }
    return result;
  }

  /**
   * Store P&L prediction
   */
  async storePLPrediction(divisionCode, year, month, prediction) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_pl_predictions`;

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id SERIAL PRIMARY KEY,
          target_year INTEGER,
          target_month INTEGER,
          predicted_amount DECIMAL(15,2),
          trend_pct DECIMAL(10,4),
          seasonal_factor DECIMAL(10,4),
          confidence DECIMAL(5,4),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          actual_amount DECIMAL(15,2),
          verified_at TIMESTAMP,
          UNIQUE(target_year, target_month)
        )
      `);

      await pool.query(`
        INSERT INTO ${table} (
          target_year, target_month, predicted_amount,
          trend_pct, seasonal_factor, confidence
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (target_year, target_month)
        DO UPDATE SET
          predicted_amount = EXCLUDED.predicted_amount,
          trend_pct = EXCLUDED.trend_pct,
          seasonal_factor = EXCLUDED.seasonal_factor,
          confidence = EXCLUDED.confidence,
          created_at = CURRENT_TIMESTAMP
      `, [
        year, month,
        prediction.predictedAmount,
        prediction.trend * 100,
        prediction.seasonalFactor,
        prediction.confidence
      ]);

      return { success: true };
    } catch (error) {
      logger.error('Failed to store P&L prediction:', error);
      throw error;
    }
  }

  // ===========================================================================
  // PRODUCT MIX OPTIMIZATION
  // ===========================================================================

  /**
   * Analyze product mix for margin optimization
   * Uses PGCombine (resolved product groups) only
   */
  async analyzeProductMix(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const tables = DataFilteringHelper.getTableNames(divisionCode);
    const pg = DataFilteringHelper.getProductGroupSQL(divisionCode);

    try {
      // Get product group performance with proper filtering
      // NOTE: fp_actualcommon uses: amount, qty_kgs, customer_name, pgcombine
      const productData = await pool.query(`
        SELECT 
          ${pg.pgCombineExpr} as productgroup,
          SUM(d.amount) as total_revenue,
          SUM(d.qty_kgs) as total_volume,
          COUNT(DISTINCT d.customer_name) as customer_count,
          COUNT(DISTINCT d.year || '-' || d.month) as periods_active
        FROM ${tables.actualData} d
        ${pg.joins}
        WHERE ${pg.filterCondition}
        GROUP BY ${pg.pgCombineExpr}
        ORDER BY total_revenue DESC
      `);

      if (productData.rows.length === 0) {
        return { success: false, reason: 'No product data available' };
      }

      // Calculate metrics
      const totalRevenue = productData.rows.reduce((sum, r) => sum + parseFloat(r.total_revenue || 0), 0);
      
      const analysis = productData.rows.map(product => {
        const revenue = parseFloat(product.total_revenue) || 0;
        const volume = parseFloat(product.total_volume) || 0;
        const asp = volume > 0 ? revenue / volume : 0;
        const revenueShare = totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0;

        return {
          productGroup: product.productgroup,
          revenue,
          volume,
          asp,
          revenueShare,
          customerCount: parseInt(product.customer_count) || 0,
          periodsActive: parseInt(product.periods_active) || 0,
          recommendation: this.getProductRecommendation(revenueShare, asp)
        };
      });

      // Store analysis
      await this.storeProductMixAnalysis(divisionCode, analysis);

      logger.info(`Analyzed product mix for ${divisionCode}: ${analysis.length} products`);

      return {
        success: true,
        totalRevenue,
        productCount: analysis.length,
        topProducts: analysis.slice(0, 10),
        recommendations: analysis.filter(p => p.recommendation !== 'maintain').slice(0, 5)
      };

    } catch (error) {
      logger.error('Failed to analyze product mix:', error);
      throw error;
    }
  }

  /**
   * Get recommendation based on product performance
   */
  getProductRecommendation(revenueShare, asp) {
    if (revenueShare > 20 && asp > 0) return 'maintain'; // Core product
    if (revenueShare < 1 && asp < 5) return 'review_discontinue'; // Low performer
    if (revenueShare < 5 && asp > 10) return 'grow_potential'; // High margin, low volume
    if (revenueShare > 10 && asp < 3) return 'increase_price'; // High volume, low margin
    return 'maintain';
  }

  /**
   * Store product mix analysis
   */
  async storeProductMixAnalysis(divisionCode, analysis) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_product_mix_analysis`;

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id SERIAL PRIMARY KEY,
          product_group VARCHAR(100),
          revenue DECIMAL(20,2),
          volume DECIMAL(20,2),
          asp DECIMAL(15,4),
          revenue_share DECIMAL(15,6),
          customer_count INTEGER,
          recommendation VARCHAR(50),
          analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Clear old analysis
      await pool.query(`DELETE FROM ${table} WHERE analyzed_at < CURRENT_DATE`);

      // Insert new analysis
      for (const product of analysis) {
        await pool.query(`
          INSERT INTO ${table} (
            product_group, revenue, volume, asp,
            revenue_share, customer_count, recommendation
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          product.productGroup,
          product.revenue,
          product.volume,
          product.asp,
          product.revenueShare,
          product.customerCount,
          product.recommendation
        ]);
      }

      return { success: true };
    } catch (error) {
      logger.error('Failed to store product mix analysis:', error);
      throw error;
    }
  }

  // ===========================================================================
  // RUN ALL P&L LEARNING
  // ===========================================================================

  /**
   * Run all P&L learning algorithms
   */
  async runAllLearning(divisionCode) {
    const results = {
      marginAnalysis: null,
      costAnomalies: null,
      profitPrediction: null,
      productMix: null
    };

    try {
      // Margin analysis
      try {
        results.marginAnalysis = await this.analyzeMarginTrends(divisionCode);
      } catch (e) {
        logger.error('Margin analysis failed:', e);
        results.marginAnalysis = { success: false, error: e.message };
      }

      // Cost anomalies
      try {
        const now = new Date();
        results.costAnomalies = await this.detectCostAnomalies(divisionCode, now.getFullYear(), now.getMonth() + 1);
      } catch (e) {
        logger.error('Cost anomaly detection failed:', e);
        results.costAnomalies = { success: false, error: e.message };
      }

      // Profitability prediction
      try {
        const now = new Date();
        const nextMonth = now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2;
        const nextYear = nextMonth === 1 ? now.getFullYear() + 1 : now.getFullYear();
        results.profitPrediction = await this.predictProfitability(divisionCode, nextYear, nextMonth);
      } catch (e) {
        logger.error('Profit prediction failed:', e);
        results.profitPrediction = { success: false, error: e.message };
      }

      // Product mix analysis
      try {
        results.productMix = await this.analyzeProductMix(divisionCode);
      } catch (e) {
        logger.error('Product mix analysis failed:', e);
        results.productMix = { success: false, error: e.message };
      }

      logger.info(`Completed P&L learning for ${divisionCode}`);
      return results;

    } catch (error) {
      logger.error('P&L learning failed:', error);
      throw error;
    }
  }

  // ===========================================================================
  // GETTERS
  // ===========================================================================

  /**
   * Get latest margin intelligence
   */
  async getMarginIntelligence(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_margin_intelligence`;

    try {
      const result = await pool.query(`
        SELECT * FROM ${table}
        ORDER BY created_at DESC
        LIMIT 1
      `);
      return result.rows[0] || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get recent cost anomalies
   */
  async getCostAnomalies(divisionCode, limit = 20) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_cost_anomalies`;

    try {
      const result = await pool.query(`
        SELECT * FROM ${table}
        WHERE acknowledged = FALSE
        ORDER BY severity DESC, detected_at DESC
        LIMIT $1
      `, [limit]);
      return result.rows;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get P&L predictions
   */
  async getPLPredictions(divisionCode, limit = 6) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_pl_predictions`;

    try {
      const result = await pool.query(`
        SELECT * FROM ${table}
        ORDER BY target_year DESC, target_month DESC
        LIMIT $1
      `, [limit]);
      return result.rows;
    } catch (error) {
      return [];
    }
  }
}

module.exports = new PLLearningService();
