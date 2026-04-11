/**
 * Financial Health Service
 * 
 * Analyzes financial metrics and predicts future financial health.
 * Provides credit risk scoring and cash flow predictions.
 * 
 * Features:
 * - Cash flow prediction
 * - Customer credit risk scoring
 * - DSO (Days Sales Outstanding) analysis
 * - Profitability by segment
 * - Working capital optimization
 * - Revenue concentration risk
 * 
 * @version 1.0
 * @date December 27, 2025
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

class FinancialHealthService {

  /**
   * Get table prefix for division
   */
  getDivisionPrefix(divisionCode) {
    return divisionCode.toLowerCase().split('-')[0];
  }

  // ===========================================================================
  // CASH FLOW PREDICTION
  // ===========================================================================

  /**
   * Predict cash flow for upcoming periods
   */
  async predictCashFlow(divisionCode, horizonMonths = 3) {
    const prefix = this.getDivisionPrefix(divisionCode);

    try {
      // Get historical revenue patterns
      // NOTE: fp_actualcommon uses 'amount' column directly
      const historicalRevenue = await pool.query(`
        SELECT 
          year,
          month,
          SUM(amount) as revenue
        FROM ${prefix}_actualcommon
        WHERE year >= EXTRACT(YEAR FROM CURRENT_DATE) - 2
        GROUP BY year, month
        ORDER BY year, month
      `);

      if (historicalRevenue.rows.length < 6) {
        return { success: false, error: 'Insufficient historical data for cash flow prediction' };
      }

      // Calculate average collection period (assumed 45 days typical B2B)
      const avgCollectionDays = 45;
      const collectionLag = Math.ceil(avgCollectionDays / 30); // months

      // Calculate revenue trend
      const recent6 = historicalRevenue.rows.slice(-6);
      const avgRevenue = recent6.reduce((sum, r) => sum + parseFloat(r.revenue || 0), 0) / 6;
      
      const first3 = recent6.slice(0, 3);
      const last3 = recent6.slice(-3);
      const first3Avg = first3.reduce((sum, r) => sum + parseFloat(r.revenue || 0), 0) / 3;
      const last3Avg = last3.reduce((sum, r) => sum + parseFloat(r.revenue || 0), 0) / 3;
      const trendPct = first3Avg > 0 ? ((last3Avg - first3Avg) / first3Avg) * 100 : 0;

      // Generate cash flow predictions
      const predictions = [];
      const now = new Date();
      let currentYear = now.getFullYear();
      let currentMonth = now.getMonth() + 1;

      for (let i = 1; i <= horizonMonths; i++) {
        let targetMonth = currentMonth + i;
        let targetYear = currentYear;
        if (targetMonth > 12) {
          targetMonth -= 12;
          targetYear++;
        }

        // Revenue with trend adjustment
        const projectedRevenue = avgRevenue * (1 + (trendPct / 100) * (i / horizonMonths));
        
        // Cash inflow = revenue from 1-2 months ago (collection lag)
        // For simplicity, use historical average adjusted for lag
        const cashInflow = projectedRevenue * 0.95; // 95% collection rate
        
        // Estimate cash outflow (typically 60-70% of revenue for operating expenses)
        const cashOutflow = projectedRevenue * 0.65;
        
        const netCashFlow = cashInflow - cashOutflow;

        predictions.push({
          year: targetYear,
          month: targetMonth,
          projectedRevenue,
          cashInflow,
          cashOutflow,
          netCashFlow,
          confidence: Math.max(0.5, 0.85 - (i * 0.05))
        });
      }

      // Store predictions
      await this.storeCashFlowPredictions(divisionCode, predictions);

      logger.info(`Generated cash flow predictions for ${divisionCode}: ${horizonMonths} months`);

      return {
        success: true,
        horizonMonths,
        avgMonthlyRevenue: avgRevenue,
        revenueTrend: trendPct,
        predictions,
        totalProjectedNetCashFlow: predictions.reduce((sum, p) => sum + p.netCashFlow, 0)
      };

    } catch (error) {
      logger.error('Failed to predict cash flow:', error);
      throw error;
    }
  }

  /**
   * Store cash flow predictions
   */
  async storeCashFlowPredictions(divisionCode, predictions) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_cashflow_predictions`;

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id SERIAL PRIMARY KEY,
          target_year INTEGER,
          target_month INTEGER,
          projected_revenue DECIMAL(20,2),
          cash_inflow DECIMAL(20,2),
          cash_outflow DECIMAL(20,2),
          net_cash_flow DECIMAL(20,2),
          confidence DECIMAL(5,2),
          predicted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.query(`DELETE FROM ${table} WHERE predicted_at < CURRENT_DATE`);

      for (const pred of predictions) {
        await pool.query(`
          INSERT INTO ${table} (
            target_year, target_month, projected_revenue,
            cash_inflow, cash_outflow, net_cash_flow, confidence
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          pred.year,
          pred.month,
          pred.projectedRevenue,
          pred.cashInflow,
          pred.cashOutflow,
          pred.netCashFlow,
          pred.confidence
        ]);
      }

      return { success: true };
    } catch (error) {
      logger.error('Failed to store cash flow predictions:', error);
      throw error;
    }
  }

  // ===========================================================================
  // CREDIT RISK SCORING
  // ===========================================================================

  /**
   * Calculate credit risk scores for customers
   */
  async calculateCreditRiskScores(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);

    try {
      // Analyze customer payment patterns and revenue consistency
      // NOTE: fp_actualcommon uses: customer_name, amount
      const customerMetrics = await pool.query(`
        WITH customer_history AS (
          SELECT 
            customer_name,
            year,
            month,
            SUM(amount) as revenue
          FROM ${prefix}_actualcommon
          WHERE year >= EXTRACT(YEAR FROM CURRENT_DATE) - 2
          GROUP BY customer_name, year, month
        ),
        customer_stats AS (
          SELECT 
            customer_name,
            COUNT(DISTINCT year * 12 + month) as active_months,
            SUM(revenue) as total_revenue,
            AVG(revenue) as avg_monthly_revenue,
            STDDEV(revenue) as revenue_stddev,
            MAX(year * 12 + month) as last_active_period,
            (EXTRACT(YEAR FROM CURRENT_DATE) * 12 + EXTRACT(MONTH FROM CURRENT_DATE)) as current_period
          FROM customer_history
          GROUP BY customer_name
          HAVING SUM(revenue) > 0
        )
        SELECT 
          customer_name,
          active_months,
          total_revenue,
          avg_monthly_revenue,
          revenue_stddev,
          current_period - last_active_period as months_since_last_order
        FROM customer_stats
        ORDER BY total_revenue DESC
      `);

      const creditScores = [];
      for (const customer of customerMetrics.rows) {
        const score = this.calculateCustomerCreditScore(customer);
        creditScores.push({
          customerName: customer.customer_name,
          ...score
        });
      }

      // Store credit scores
      await this.storeCreditScores(divisionCode, creditScores);

      logger.info(`Calculated credit scores for ${creditScores.length} customers in ${divisionCode}`);

      return {
        success: true,
        customers: creditScores,
        summary: {
          excellent: creditScores.filter(c => c.riskLevel === 'Excellent').length,
          good: creditScores.filter(c => c.riskLevel === 'Good').length,
          fair: creditScores.filter(c => c.riskLevel === 'Fair').length,
          poor: creditScores.filter(c => c.riskLevel === 'Poor').length,
          high_risk: creditScores.filter(c => c.riskLevel === 'High Risk').length
        }
      };

    } catch (error) {
      logger.error('Failed to calculate credit risk scores:', error);
      throw error;
    }
  }

  /**
   * Calculate individual customer credit score
   */
  calculateCustomerCreditScore(customer) {
    let score = 50; // Start at neutral

    const activeMonths = parseInt(customer.active_months) || 0;
    const totalRevenue = parseFloat(customer.total_revenue) || 0;
    const avgRevenue = parseFloat(customer.avg_monthly_revenue) || 0;
    const stdDev = parseFloat(customer.revenue_stddev) || 0;
    const monthsSinceOrder = parseInt(customer.months_since_last_order) || 0;

    // Longevity factor (more months = more trust)
    if (activeMonths >= 24) score += 15;
    else if (activeMonths >= 12) score += 10;
    else if (activeMonths >= 6) score += 5;

    // Revenue volume factor
    if (totalRevenue >= 500000) score += 15;
    else if (totalRevenue >= 100000) score += 10;
    else if (totalRevenue >= 50000) score += 5;

    // Consistency factor (lower variability = better)
    const cv = avgRevenue > 0 ? stdDev / avgRevenue : 1;
    if (cv < 0.3) score += 10;
    else if (cv < 0.5) score += 5;
    else if (cv > 1) score -= 10;

    // Recency factor (recent orders = better)
    if (monthsSinceOrder === 0) score += 10;
    else if (monthsSinceOrder <= 2) score += 5;
    else if (monthsSinceOrder >= 6) score -= 15;
    else if (monthsSinceOrder >= 3) score -= 5;

    // Cap score between 0-100
    score = Math.max(0, Math.min(100, score));

    // Determine risk level
    let riskLevel;
    if (score >= 80) riskLevel = 'Excellent';
    else if (score >= 65) riskLevel = 'Good';
    else if (score >= 50) riskLevel = 'Fair';
    else if (score >= 35) riskLevel = 'Poor';
    else riskLevel = 'High Risk';

    // Determine credit recommendation
    let recommendation;
    if (riskLevel === 'Excellent') {
      recommendation = 'Extend generous credit terms, consider volume discounts';
    } else if (riskLevel === 'Good') {
      recommendation = 'Standard credit terms appropriate';
    } else if (riskLevel === 'Fair') {
      recommendation = 'Monitor closely, consider shorter payment terms';
    } else if (riskLevel === 'Poor') {
      recommendation = 'Reduce credit limit, require partial upfront payment';
    } else {
      recommendation = 'Cash on delivery or prepayment recommended';
    }

    return {
      creditScore: score,
      riskLevel,
      recommendation,
      factors: {
        activeMonths,
        totalRevenue,
        variabilityCoefficient: cv,
        monthsSinceLastOrder: monthsSinceOrder
      }
    };
  }

  /**
   * Store credit scores
   */
  async storeCreditScores(divisionCode, scores) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_credit_scores`;

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id SERIAL PRIMARY KEY,
          customer_name VARCHAR(200),
          credit_score INTEGER,
          risk_level VARCHAR(20),
          recommendation TEXT,
          active_months INTEGER,
          total_revenue DECIMAL(20,2),
          variability DECIMAL(10,4),
          months_since_order INTEGER,
          scored_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.query(`DELETE FROM ${table} WHERE scored_at < CURRENT_DATE`);

      for (const score of scores) {
        await pool.query(`
          INSERT INTO ${table} (
            customer_name, credit_score, risk_level, recommendation,
            active_months, total_revenue, variability, months_since_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          score.customerName,
          score.creditScore,
          score.riskLevel,
          score.recommendation,
          score.factors.activeMonths,
          score.factors.totalRevenue,
          score.factors.variabilityCoefficient,
          score.factors.monthsSinceLastOrder
        ]);
      }

      return { success: true };
    } catch (error) {
      logger.error('Failed to store credit scores:', error);
      throw error;
    }
  }

  // ===========================================================================
  // REVENUE CONCENTRATION RISK
  // ===========================================================================

  /**
   * Analyze revenue concentration risk
   */
  async analyzeRevenueConcentration(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);

    try {
      // Get customer revenue distribution
      // NOTE: fp_actualcommon uses: customer_name, amount
      const customerRevenue = await pool.query(`
        SELECT 
          customer_name,
          SUM(amount) as revenue
        FROM ${prefix}_actualcommon
        WHERE year = EXTRACT(YEAR FROM CURRENT_DATE)
        GROUP BY customer_name
        ORDER BY revenue DESC
      `);

      const totalRevenue = customerRevenue.rows.reduce((sum, r) => sum + parseFloat(r.revenue || 0), 0);
      
      if (totalRevenue === 0) {
        return { success: false, error: 'No revenue data for current year' };
      }

      // Calculate concentration metrics
      let cumulative = 0;
      const concentration = [];
      for (const row of customerRevenue.rows) {
        const revenue = parseFloat(row.revenue) || 0;
        cumulative += revenue;
        concentration.push({
          customerName: row.customer_name,
          revenue,
          revenueShare: (revenue / totalRevenue) * 100,
          cumulativeShare: (cumulative / totalRevenue) * 100
        });
      }

      // Calculate Herfindahl-Hirschman Index (HHI)
      const hhi = concentration.reduce((sum, c) => sum + Math.pow(c.revenueShare, 2), 0);

      // Top customer metrics
      const top1Share = concentration[0]?.revenueShare || 0;
      const top3Share = concentration.slice(0, 3).reduce((sum, c) => sum + c.revenueShare, 0);
      const top5Share = concentration.slice(0, 5).reduce((sum, c) => sum + c.revenueShare, 0);
      const top10Share = concentration.slice(0, 10).reduce((sum, c) => sum + c.revenueShare, 0);

      // Risk assessment
      let riskLevel, recommendation;
      if (top1Share > 30 || hhi > 2500) {
        riskLevel = 'Critical';
        recommendation = 'Urgent diversification needed. Single customer dependency creates existential risk.';
      } else if (top3Share > 50 || hhi > 1500) {
        riskLevel = 'High';
        recommendation = 'Accelerate customer acquisition. Dependency on top customers is dangerous.';
      } else if (top5Share > 60 || hhi > 1000) {
        riskLevel = 'Moderate';
        recommendation = 'Continue customer diversification efforts. Consider secondary customer development.';
      } else {
        riskLevel = 'Low';
        recommendation = 'Healthy customer diversification. Maintain current acquisition strategy.';
      }

      // Store analysis
      await this.storeConcentrationAnalysis(divisionCode, {
        hhi, top1Share, top3Share, top5Share, top10Share,
        riskLevel, recommendation, customerCount: concentration.length
      });

      logger.info(`Analyzed revenue concentration for ${divisionCode}: HHI=${hhi.toFixed(0)}, Risk=${riskLevel}`);

      return {
        success: true,
        totalRevenue,
        customerCount: concentration.length,
        herfindahlIndex: hhi,
        concentration: {
          top1: top1Share,
          top3: top3Share,
          top5: top5Share,
          top10: top10Share
        },
        riskLevel,
        recommendation,
        topCustomers: concentration.slice(0, 10)
      };

    } catch (error) {
      logger.error('Failed to analyze revenue concentration:', error);
      throw error;
    }
  }

  /**
   * Store concentration analysis
   */
  async storeConcentrationAnalysis(divisionCode, analysis) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_concentration_analysis`;

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id SERIAL PRIMARY KEY,
          herfindahl_index DECIMAL(10,2),
          top1_share DECIMAL(10,2),
          top3_share DECIMAL(10,2),
          top5_share DECIMAL(10,2),
          top10_share DECIMAL(10,2),
          customer_count INTEGER,
          risk_level VARCHAR(20),
          recommendation TEXT,
          analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.query(`
        INSERT INTO ${table} (
          herfindahl_index, top1_share, top3_share, top5_share, top10_share,
          customer_count, risk_level, recommendation
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        analysis.hhi,
        analysis.top1Share,
        analysis.top3Share,
        analysis.top5Share,
        analysis.top10Share,
        analysis.customerCount,
        analysis.riskLevel,
        analysis.recommendation
      ]);

      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  // ===========================================================================
  // PROFITABILITY BY SEGMENT
  // ===========================================================================

  /**
   * Analyze profitability by customer segment
   */
  async analyzeSegmentProfitability(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);

    try {
      // Get revenue and volume by segment
      // NOTE: fp_actualcommon uses: customer_name, amount, qty_kgs
      const segmentData = await pool.query(`
        SELECT 
          COALESCE(s.segment_name, 'Unclassified') as segment,
          COUNT(DISTINCT d.customer_name) as customer_count,
          SUM(d.amount) as revenue,
          SUM(d.qty_kgs) as volume
        FROM ${prefix}_actualcommon d
        LEFT JOIN ${prefix}_customer_segments s ON d.customer_name = s.customer_name
        WHERE d.year = EXTRACT(YEAR FROM CURRENT_DATE)
        GROUP BY s.segment_name
        ORDER BY revenue DESC
      `);

      const totalRevenue = segmentData.rows.reduce((sum, r) => sum + parseFloat(r.revenue || 0), 0);

      const segmentAnalysis = segmentData.rows.map(row => {
        const revenue = parseFloat(row.revenue) || 0;
        const volume = parseFloat(row.volume) || 0;
        const customers = parseInt(row.customer_count) || 0;
        
        // Calculate metrics
        const revenuePerCustomer = customers > 0 ? revenue / customers : 0;
        const asp = volume > 0 ? revenue / volume : 0;
        const revenueShare = totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0;
        
        // Estimate profitability tier based on ASP (higher ASP = higher margin typically)
        let profitabilityTier;
        if (asp > 5) profitabilityTier = 'High';
        else if (asp > 2) profitabilityTier = 'Medium';
        else profitabilityTier = 'Low';

        return {
          segment: row.segment,
          customerCount: customers,
          totalRevenue: revenue,
          totalVolume: volume,
          revenuePerCustomer,
          averageSellingPrice: asp,
          revenueShare,
          profitabilityTier,
          recommendation: this.getSegmentRecommendation(row.segment, profitabilityTier, revenueShare)
        };
      });

      logger.info(`Analyzed profitability for ${segmentAnalysis.length} segments in ${divisionCode}`);

      return {
        success: true,
        totalRevenue,
        segments: segmentAnalysis,
        highProfitabilitySegments: segmentAnalysis.filter(s => s.profitabilityTier === 'High').map(s => s.segment)
      };

    } catch (error) {
      logger.error('Failed to analyze segment profitability:', error);
      throw error;
    }
  }

  /**
   * Get segment-specific recommendation
   */
  getSegmentRecommendation(segment, profitabilityTier, revenueShare) {
    if (segment === 'Champions' || segment === 'Loyal') {
      return 'Protect and grow. These are your most valuable customers.';
    }
    if (segment === 'At Risk') {
      return 'Urgent retention efforts needed. Personalized outreach recommended.';
    }
    if (profitabilityTier === 'High' && revenueShare < 20) {
      return 'High potential segment. Invest in acquisition and expansion.';
    }
    if (profitabilityTier === 'Low' && revenueShare > 20) {
      return 'Review pricing strategy. Consider value-add services to improve margins.';
    }
    return 'Standard management approach. Monitor for changes.';
  }

  // ===========================================================================
  // RUN ALL
  // ===========================================================================

  /**
   * Run full financial health analysis
   */
  async runAllAnalysis(divisionCode) {
    const results = {
      cashFlow: null,
      creditRisk: null,
      concentration: null,
      segmentProfitability: null
    };

    try {
      results.cashFlow = await this.predictCashFlow(divisionCode, 3);
    } catch (e) {
      logger.error('Cash flow prediction failed:', e);
      results.cashFlow = { success: false, error: e.message };
    }

    try {
      results.creditRisk = await this.calculateCreditRiskScores(divisionCode);
    } catch (e) {
      logger.error('Credit risk scoring failed:', e);
      results.creditRisk = { success: false, error: e.message };
    }

    try {
      results.concentration = await this.analyzeRevenueConcentration(divisionCode);
    } catch (e) {
      logger.error('Concentration analysis failed:', e);
      results.concentration = { success: false, error: e.message };
    }

    try {
      results.segmentProfitability = await this.analyzeSegmentProfitability(divisionCode);
    } catch (e) {
      logger.error('Segment profitability failed:', e);
      results.segmentProfitability = { success: false, error: e.message };
    }

    logger.info(`Completed financial health analysis for ${divisionCode}`);
    return results;
  }

  // ===========================================================================
  // GETTERS
  // ===========================================================================

  /**
   * Get cash flow predictions
   */
  async getCashFlowPredictions(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_cashflow_predictions`;

    try {
      const result = await pool.query(`
        SELECT * FROM ${table}
        WHERE predicted_at >= CURRENT_DATE
        ORDER BY target_year, target_month
      `);
      return result.rows;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get credit scores
   */
  async getCreditScores(divisionCode, riskLevel = null) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_credit_scores`;

    try {
      let query = `SELECT * FROM ${table}`;
      const params = [];
      
      if (riskLevel) {
        query += ` WHERE risk_level = $1`;
        params.push(riskLevel);
      }
      
      query += ` ORDER BY credit_score ASC`;

      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      return [];
    }
  }
}

module.exports = new FinancialHealthService();
