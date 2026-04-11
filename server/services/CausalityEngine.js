/**
 * Causality Engine
 * 
 * Cross-domain analysis to understand WHY things happen.
 * Identifies causal relationships between different business dimensions.
 * 
 * Features:
 * - Sales vs Customer behavior correlation
 * - Sales Rep activity vs Results correlation
 * - Product mix vs Margin correlation
 * - Seasonality impact analysis
 * - Customer concentration risk causality
 * 
 * @version 1.0
 * @date December 27, 2025
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

class CausalityEngine {
  
  /**
   * Get table prefix for division
   */
  getDivisionPrefix(divisionCode) {
    return divisionCode.toLowerCase().split('-')[0];
  }

  // ===========================================================================
  // SALES DRIVER ANALYSIS
  // ===========================================================================

  /**
   * Identify what's driving sales changes
   * Analyzes correlation between various factors and sales performance
   */
  async analyzeSalesDrivers(divisionCode, year, month) {
    const prefix = this.getDivisionPrefix(divisionCode);

    try {
      // Get current period sales
      // NOTE: fp_actualcommon uses: amount, qty_kgs, customer_name, pgcombine, sales_rep_group_name
      const currentPeriod = await pool.query(`
        SELECT 
          SUM(amount) as total_sales,
          SUM(qty_kgs) as total_volume,
          COUNT(DISTINCT customer_name) as active_customers,
          COUNT(DISTINCT pgcombine) as active_products,
          COUNT(DISTINCT sales_rep_group_name) as active_reps
        FROM ${prefix}_actualcommon
        WHERE year = $1 AND month = $2
      `, [year, month]);

      // Get previous period for comparison
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      
      const previousPeriod = await pool.query(`
        SELECT 
          SUM(amount) as total_sales,
          SUM(qty_kgs) as total_volume,
          COUNT(DISTINCT customer_name) as active_customers,
          COUNT(DISTINCT pgcombine) as active_products,
          COUNT(DISTINCT sales_rep_group_name) as active_reps
        FROM ${prefix}_actualcommon
        WHERE year = $1 AND month = $2
      `, [prevYear, prevMonth]);

      const current = currentPeriod.rows[0];
      const previous = previousPeriod.rows[0];

      // Calculate changes
      const salesChange = this.calculateChange(current.total_sales, previous.total_sales);
      const volumeChange = this.calculateChange(current.total_volume, previous.total_volume);
      const customerChange = this.calculateChange(current.active_customers, previous.active_customers);
      const productChange = this.calculateChange(current.active_products, previous.active_products);
      const repChange = this.calculateChange(current.active_reps, previous.active_reps);

      // Identify primary drivers
      const drivers = [];

      // Customer count correlation
      if (Math.abs(customerChange) > 5) {
        const correlation = this.calculateCorrelation(customerChange, salesChange);
        if (Math.abs(correlation) > 0.5) {
          drivers.push({
            factor: 'Customer Base',
            change: customerChange,
            impact: correlation > 0 ? 'positive' : 'negative',
            strength: Math.abs(correlation),
            explanation: customerChange > 0 
              ? `Customer base grew by ${customerChange.toFixed(1)}%, contributing to sales ${salesChange > 0 ? 'increase' : 'holding steady'}`
              : `Customer base declined by ${Math.abs(customerChange).toFixed(1)}%, likely causing sales pressure`
          });
        }
      }

      // Volume vs Sales (price effect)
      if (Math.abs(salesChange - volumeChange) > 5) {
        const priceEffect = salesChange - volumeChange;
        drivers.push({
          factor: 'Price Effect',
          change: priceEffect,
          impact: priceEffect > 0 ? 'positive' : 'negative',
          strength: Math.min(1, Math.abs(priceEffect) / 20),
          explanation: priceEffect > 0 
            ? `Average selling price increased, adding ${priceEffect.toFixed(1)}% to revenue growth`
            : `Average selling price decreased, reducing revenue by ${Math.abs(priceEffect).toFixed(1)}%`
        });
      }

      // Product mix effect
      if (Math.abs(productChange) > 10) {
        drivers.push({
          factor: 'Product Mix',
          change: productChange,
          impact: productChange > 0 ? 'potential_positive' : 'potential_negative',
          strength: 0.5,
          explanation: productChange > 0 
            ? `${Math.abs(productChange).toFixed(0)}% more product groups active - diversification`
            : `${Math.abs(productChange).toFixed(0)}% fewer product groups - concentration risk`
        });
      }

      // Store analysis
      await this.storeCausalAnalysis(divisionCode, year, month, {
        salesChange,
        drivers,
        metrics: { current, previous }
      });

      logger.info(`Analyzed sales drivers for ${divisionCode} ${year}-${month}: ${drivers.length} factors identified`);

      return {
        success: true,
        period: { year, month },
        salesChange,
        volumeChange,
        drivers,
        summary: this.generateDriverSummary(salesChange, drivers)
      };

    } catch (error) {
      logger.error('Failed to analyze sales drivers:', error);
      throw error;
    }
  }

  /**
   * Calculate percentage change
   */
  calculateChange(current, previous) {
    const curr = parseFloat(current) || 0;
    const prev = parseFloat(previous) || 0;
    if (prev === 0) return curr > 0 ? 100 : 0;
    return ((curr - prev) / prev) * 100;
  }

  /**
   * Simple correlation calculation
   */
  calculateCorrelation(change1, change2) {
    // Simplified: if both move same direction with similar magnitude, high correlation
    if (change1 === 0 || change2 === 0) return 0;
    const sameDirection = (change1 > 0 && change2 > 0) || (change1 < 0 && change2 < 0);
    const magnitude = Math.min(Math.abs(change1), Math.abs(change2)) / Math.max(Math.abs(change1), Math.abs(change2));
    return sameDirection ? magnitude : -magnitude;
  }

  /**
   * Generate summary of drivers
   */
  generateDriverSummary(salesChange, drivers) {
    if (drivers.length === 0) {
      return salesChange > 0 
        ? 'Sales growth appears organic with no single dominant driver'
        : 'Sales decline has multiple contributing factors';
    }

    const topDriver = drivers.sort((a, b) => b.strength - a.strength)[0];
    return `Primary driver: ${topDriver.factor} (${topDriver.change > 0 ? '+' : ''}${topDriver.change.toFixed(1)}% change)`;
  }

  // ===========================================================================
  // CUSTOMER BEHAVIOR CAUSALITY
  // ===========================================================================

  /**
   * Analyze what causes customer churn
   */
  async analyzeChurnCauses(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);

    try {
      // Get churned vs active customer profiles
      const churnedCustomers = await pool.query(`
        SELECT 
          c.customer_name,
          c.churn_probability,
          c.top_risk_factors as risk_factors,
          h.total_sales,
          h.order_frequency,
          h.avg_order_size
        FROM ${prefix}_customer_churn_predictions c
        LEFT JOIN ${prefix}_customer_behavior_history h 
          ON c.customer_name = h.customer_name
          AND (h.year * 12 + h.month) = (
            SELECT MAX(year * 12 + month) 
            FROM ${prefix}_customer_behavior_history 
            WHERE customer_name = c.customer_name
          )
        WHERE c.risk_level = 'high'
        ORDER BY c.churn_probability DESC
        LIMIT 50
      `);

      // Analyze common patterns
      const riskFactors = {};
      let totalChurned = 0;

      for (const customer of churnedCustomers.rows) {
        totalChurned++;
        const factors = customer.risk_factors || {};
        for (const [factor, value] of Object.entries(factors)) {
          if (!riskFactors[factor]) {
            riskFactors[factor] = { count: 0, avgValue: 0 };
          }
          riskFactors[factor].count++;
          riskFactors[factor].avgValue += parseFloat(value) || 0;
        }
      }

      // Calculate factor importance
      const causes = Object.entries(riskFactors).map(([factor, data]) => ({
        factor,
        frequency: (data.count / Math.max(totalChurned, 1)) * 100,
        avgValue: data.avgValue / Math.max(data.count, 1),
        importance: (data.count / Math.max(totalChurned, 1)) // Simple importance = frequency
      })).sort((a, b) => b.importance - a.importance);

      logger.info(`Analyzed churn causes for ${divisionCode}: ${causes.length} factors`);

      return {
        success: true,
        customersAnalyzed: totalChurned,
        topCauses: causes.slice(0, 5),
        recommendations: this.generateChurnRecommendations(causes)
      };

    } catch (error) {
      logger.error('Failed to analyze churn causes:', error);
      throw error;
    }
  }

  /**
   * Generate recommendations based on churn causes
   */
  generateChurnRecommendations(causes) {
    const recommendations = [];

    for (const cause of causes.slice(0, 3)) {
      if (cause.factor === 'declining_revenue') {
        recommendations.push({
          cause: cause.factor,
          action: 'Implement proactive outreach program for customers with declining orders',
          priority: 'high'
        });
      } else if (cause.factor === 'low_frequency') {
        recommendations.push({
          cause: cause.factor,
          action: 'Create incentive program for infrequent buyers',
          priority: 'medium'
        });
      } else if (cause.factor === 'single_product') {
        recommendations.push({
          cause: cause.factor,
          action: 'Cross-sell campaigns to diversify customer purchases',
          priority: 'medium'
        });
      }
    }

    return recommendations;
  }

  // ===========================================================================
  // MARGIN CAUSALITY
  // ===========================================================================

  /**
   * Analyze what's affecting margins
   */
  async analyzeMarginCauses(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);

    try {
      // Get product group contribution to margin
      // NOTE: fp_actualcommon uses pgcombine, amount, qty_kgs columns
      const productMargins = await pool.query(`
        SELECT 
          pgcombine as productgroup,
          SUM(amount) as revenue,
          SUM(qty_kgs) as volume
        FROM ${prefix}_actualcommon
        WHERE pgcombine IS NOT NULL
        GROUP BY pgcombine
        ORDER BY revenue DESC
        LIMIT 20
      `);

      const products = productMargins.rows.map(p => ({
        productGroup: p.productgroup,
        revenue: parseFloat(p.revenue) || 0,
        volume: parseFloat(p.volume) || 0,
        asp: (parseFloat(p.volume) || 0) > 0 
          ? (parseFloat(p.revenue) || 0) / parseFloat(p.volume)
          : 0
      }));

      // Calculate overall ASP
      const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0);
      const totalVolume = products.reduce((sum, p) => sum + p.volume, 0);
      const overallASP = totalVolume > 0 ? totalRevenue / totalVolume : 0;

      // Identify margin contributors
      const marginContributors = products.map(p => ({
        ...p,
        revenueShare: totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0,
        aspVsAvg: overallASP > 0 ? ((p.asp - overallASP) / overallASP) * 100 : 0,
        marginImpact: p.asp > overallASP ? 'positive' : 'negative'
      })).sort((a, b) => Math.abs(b.aspVsAvg) - Math.abs(a.aspVsAvg));

      // Find biggest positive and negative contributors
      const positiveContributors = marginContributors.filter(p => p.marginImpact === 'positive');
      const negativeContributors = marginContributors.filter(p => p.marginImpact === 'negative');

      logger.info(`Analyzed margin causes for ${divisionCode}`);

      return {
        success: true,
        overallASP,
        positiveContributors: positiveContributors.slice(0, 5),
        negativeContributors: negativeContributors.slice(0, 5),
        recommendations: [
          positiveContributors.length > 0 
            ? `Focus on growing ${positiveContributors[0].productGroup} - ${positiveContributors[0].aspVsAvg.toFixed(1)}% above avg ASP`
            : null,
          negativeContributors.length > 0 
            ? `Review pricing for ${negativeContributors[0].productGroup} - ${Math.abs(negativeContributors[0].aspVsAvg).toFixed(1)}% below avg ASP`
            : null
        ].filter(Boolean)
      };

    } catch (error) {
      logger.error('Failed to analyze margin causes:', error);
      throw error;
    }
  }

  // ===========================================================================
  // CROSS-DOMAIN CORRELATIONS
  // ===========================================================================

  /**
   * Find correlations between different business dimensions
   */
  async findCorrelations(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);

    try {
      // Get historical data by month
      // NOTE: fp_actualcommon uses: amount, qty_kgs, customer_name, sales_rep_group_name, pgcombine
      const monthlyData = await pool.query(`
        SELECT 
          year, month,
          SUM(amount) as sales,
          SUM(qty_kgs) as volume,
          COUNT(DISTINCT customer_name) as customers,
          COUNT(DISTINCT sales_rep_group_name) as reps,
          COUNT(DISTINCT pgcombine) as products
        FROM ${prefix}_actualcommon
        GROUP BY year, month
        ORDER BY year, month
      `);

      if (monthlyData.rows.length < 12) {
        return { success: false, reason: 'Insufficient data for correlation analysis' };
      }

      const data = monthlyData.rows.map(r => ({
        period: `${r.year}-${r.month}`,
        sales: parseFloat(r.sales) || 0,
        volume: parseFloat(r.volume) || 0,
        customers: parseInt(r.customers) || 0,
        reps: parseInt(r.reps) || 0,
        products: parseInt(r.products) || 0
      }));

      // Calculate correlations
      const correlations = [
        {
          factors: ['customers', 'sales'],
          correlation: this.calculatePearsonCorrelation(
            data.map(d => d.customers),
            data.map(d => d.sales)
          ),
          interpretation: 'Customer count vs Sales revenue'
        },
        {
          factors: ['reps', 'sales'],
          correlation: this.calculatePearsonCorrelation(
            data.map(d => d.reps),
            data.map(d => d.sales)
          ),
          interpretation: 'Active sales reps vs Sales revenue'
        },
        {
          factors: ['products', 'sales'],
          correlation: this.calculatePearsonCorrelation(
            data.map(d => d.products),
            data.map(d => d.sales)
          ),
          interpretation: 'Product diversity vs Sales revenue'
        },
        {
          factors: ['volume', 'sales'],
          correlation: this.calculatePearsonCorrelation(
            data.map(d => d.volume),
            data.map(d => d.sales)
          ),
          interpretation: 'Volume vs Revenue (pricing consistency)'
        }
      ];

      // Sort by correlation strength
      correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

      logger.info(`Found ${correlations.length} correlations for ${divisionCode}`);

      return {
        success: true,
        periodsAnalyzed: data.length,
        correlations,
        insights: correlations.slice(0, 2).map(c => ({
          finding: `${c.interpretation}: ${c.correlation > 0 ? 'positive' : 'negative'} correlation (${Math.abs(c.correlation).toFixed(2)})`,
          strength: Math.abs(c.correlation) > 0.7 ? 'strong' : Math.abs(c.correlation) > 0.4 ? 'moderate' : 'weak'
        }))
      };

    } catch (error) {
      logger.error('Failed to find correlations:', error);
      throw error;
    }
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  calculatePearsonCorrelation(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 3) return 0;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    if (denominator === 0) return 0;
    return numerator / denominator;
  }

  // ===========================================================================
  // STORAGE
  // ===========================================================================

  /**
   * Store causal analysis
   */
  async storeCausalAnalysis(divisionCode, year, month, analysis) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_causal_analysis`;

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id SERIAL PRIMARY KEY,
          year INTEGER,
          month INTEGER,
          sales_change DECIMAL(10,4),
          drivers JSONB,
          metrics JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(year, month)
        )
      `);

      await pool.query(`
        INSERT INTO ${table} (year, month, sales_change, drivers, metrics)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (year, month)
        DO UPDATE SET
          sales_change = EXCLUDED.sales_change,
          drivers = EXCLUDED.drivers,
          metrics = EXCLUDED.metrics,
          created_at = CURRENT_TIMESTAMP
      `, [
        year, month,
        analysis.salesChange,
        JSON.stringify(analysis.drivers),
        JSON.stringify(analysis.metrics)
      ]);

      return { success: true };
    } catch (error) {
      logger.error('Failed to store causal analysis:', error);
      throw error;
    }
  }

  // ===========================================================================
  // RUN ALL CAUSALITY ANALYSIS
  // ===========================================================================

  /**
   * Run all causality analysis
   */
  async runAllAnalysis(divisionCode) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const results = {
      salesDrivers: null,
      churnCauses: null,
      marginCauses: null,
      correlations: null
    };

    try {
      results.salesDrivers = await this.analyzeSalesDrivers(divisionCode, year, month);
    } catch (e) {
      results.salesDrivers = { success: false, error: e.message };
    }

    try {
      results.churnCauses = await this.analyzeChurnCauses(divisionCode);
    } catch (e) {
      results.churnCauses = { success: false, error: e.message };
    }

    try {
      results.marginCauses = await this.analyzeMarginCauses(divisionCode);
    } catch (e) {
      results.marginCauses = { success: false, error: e.message };
    }

    try {
      results.correlations = await this.findCorrelations(divisionCode);
    } catch (e) {
      results.correlations = { success: false, error: e.message };
    }

    logger.info(`Completed causality analysis for ${divisionCode}`);
    return results;
  }
}

module.exports = new CausalityEngine();
