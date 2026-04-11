/**
 * Product Learning Service
 * 
 * Analyzes product performance and lifecycle stages.
 * Learns patterns to predict product trajectory and recommend actions.
 * 
 * Features:
 * - Product lifecycle classification (Introduction → Growth → Maturity → Decline)
 * - Sales velocity analysis
 * - Cross-sell/upsell pattern detection
 * - Product cannibalization detection
 * - Seasonal product patterns
 * 
 * IMPORTANT: All queries use PGCombine (resolved product groups) only!
 * Raw product groups are resolved via fp_raw_product_groups and fp_item_group_overrides.
 * 
 * @version 1.1
 * @date December 28, 2025 - Updated to use DataFilteringHelper
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');
const DataFilteringHelper = require('./DataFilteringHelper');

class ProductLearningService {

  /**
   * Get table prefix for division
   */
  getDivisionPrefix(divisionCode) {
    return divisionCode.toLowerCase().split('-')[0];
  }

  // ===========================================================================
  // PRODUCT LIFECYCLE CLASSIFICATION
  // ===========================================================================

  /**
   * Classify products into lifecycle stages
   * Based on revenue growth rate and market share trends
   * Uses PGCombine (resolved product groups) only
   */
  async classifyProductLifecycle(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const tables = DataFilteringHelper.getTableNames(divisionCode);
    const pg = DataFilteringHelper.getProductGroupSQL(divisionCode);

    try {
      // Get product performance over time using PGCombine
      // NOTE: fp_actualcommon uses: amount, qty_kgs, customer_name, pgcombine
      const productTrends = await pool.query(`
        WITH product_periods AS (
          SELECT 
            ${pg.pgCombineExpr} as productgroup,
            d.year,
            SUM(d.amount) as revenue,
            SUM(d.qty_kgs) as volume,
            COUNT(DISTINCT d.customer_name) as customer_count
          FROM ${tables.actualData} d
          ${pg.joins}
          WHERE ${pg.filterCondition}
          GROUP BY ${pg.pgCombineExpr}, d.year
          ORDER BY ${pg.pgCombineExpr}, d.year
        ),
        product_growth AS (
          SELECT 
            p1.productgroup,
            p1.year as current_year,
            p1.revenue as current_revenue,
            p1.volume as current_volume,
            p1.customer_count as current_customers,
            p2.revenue as prev_revenue,
            p2.volume as prev_volume,
            CASE 
              WHEN p2.revenue > 0 THEN ((p1.revenue - p2.revenue) / p2.revenue) * 100
              ELSE NULL 
            END as revenue_growth,
            CASE 
              WHEN p2.volume > 0 THEN ((p1.volume - p2.volume) / p2.volume) * 100
              ELSE NULL 
            END as volume_growth
          FROM product_periods p1
          LEFT JOIN product_periods p2 
            ON p1.productgroup = p2.productgroup 
            AND p1.year = p2.year + 1
        )
        SELECT 
          productgroup,
          current_year,
          current_revenue,
          current_volume,
          current_customers,
          revenue_growth,
          volume_growth,
          AVG(revenue_growth) OVER (PARTITION BY productgroup ORDER BY current_year ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) as avg_growth_3yr
        FROM product_growth
        WHERE current_year >= EXTRACT(YEAR FROM CURRENT_DATE) - 2
        ORDER BY productgroup, current_year DESC
      `);

      // Group by product and classify
      const productMap = new Map();
      for (const row of productTrends.rows) {
        if (!productMap.has(row.productgroup)) {
          productMap.set(row.productgroup, []);
        }
        productMap.get(row.productgroup).push(row);
      }

      const classifications = [];
      for (const [productGroup, periods] of productMap) {
        const latest = periods[0];
        const classification = this.determineLifecycleStage(periods);
        
        classifications.push({
          productGroup,
          stage: classification.stage,
          confidence: classification.confidence,
          indicators: classification.indicators,
          currentRevenue: parseFloat(latest?.current_revenue) || 0,
          currentVolume: parseFloat(latest?.current_volume) || 0,
          customerCount: parseInt(latest?.current_customers) || 0,
          recentGrowth: parseFloat(latest?.revenue_growth) || 0,
          avgGrowth3yr: parseFloat(latest?.avg_growth_3yr) || 0,
          recommendation: this.getLifecycleRecommendation(classification.stage)
        });
      }

      // Store classifications
      await this.storeLifecycleClassifications(divisionCode, classifications);

      logger.info(`Classified ${classifications.length} products for ${divisionCode}`);

      return {
        success: true,
        products: classifications,
        summary: {
          introduction: classifications.filter(c => c.stage === 'introduction').length,
          growth: classifications.filter(c => c.stage === 'growth').length,
          maturity: classifications.filter(c => c.stage === 'maturity').length,
          decline: classifications.filter(c => c.stage === 'decline').length
        }
      };

    } catch (error) {
      logger.error('Failed to classify product lifecycle:', error);
      throw error;
    }
  }

  /**
   * Determine lifecycle stage based on growth patterns
   */
  determineLifecycleStage(periods) {
    if (periods.length === 0) {
      return { stage: 'unknown', confidence: 0, indicators: ['No data'] };
    }

    const latest = periods[0];
    const recentGrowth = parseFloat(latest.revenue_growth) || 0;
    const avgGrowth = parseFloat(latest.avg_growth_3yr) || 0;
    const indicators = [];

    // Introduction: New or small with potential
    if (periods.length === 1 || (parseFloat(latest.current_revenue) < 50000 && recentGrowth > 0)) {
      indicators.push('New product or limited history');
      if (recentGrowth > 0) indicators.push('Positive initial traction');
      return { stage: 'introduction', confidence: 0.7, indicators };
    }

    // Growth: High positive growth
    if (recentGrowth > 15 && avgGrowth > 10) {
      indicators.push(`Strong growth: ${recentGrowth.toFixed(1)}% YoY`);
      indicators.push(`3-year avg: ${avgGrowth.toFixed(1)}%`);
      return { stage: 'growth', confidence: 0.85, indicators };
    }

    // Decline: Negative growth
    if (recentGrowth < -10 && avgGrowth < -5) {
      indicators.push(`Declining: ${recentGrowth.toFixed(1)}% YoY`);
      indicators.push(`3-year avg: ${avgGrowth.toFixed(1)}%`);
      return { stage: 'decline', confidence: 0.8, indicators };
    }

    // Maturity: Stable or slow growth
    indicators.push(`Stable growth: ${recentGrowth.toFixed(1)}% YoY`);
    indicators.push('Established market position');
    return { stage: 'maturity', confidence: 0.75, indicators };
  }

  /**
   * Get recommendation based on lifecycle stage
   */
  getLifecycleRecommendation(stage) {
    const recommendations = {
      introduction: 'Focus on market education, trial programs, and early adopter feedback',
      growth: 'Invest in scaling production, expand distribution, and build brand awareness',
      maturity: 'Optimize costs, defend market share, and explore product extensions',
      decline: 'Consider phase-out, harvest remaining value, or product refresh',
      unknown: 'Gather more data to understand product trajectory'
    };
    return recommendations[stage] || recommendations.unknown;
  }

  /**
   * Store lifecycle classifications
   */
  async storeLifecycleClassifications(divisionCode, classifications) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_product_lifecycle`;

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id SERIAL PRIMARY KEY,
          product_group VARCHAR(100),
          stage VARCHAR(20),
          confidence DECIMAL(5,2),
          indicators JSONB,
          current_revenue DECIMAL(20,2),
          current_volume DECIMAL(20,2),
          customer_count INTEGER,
          recent_growth DECIMAL(10,2),
          avg_growth_3yr DECIMAL(10,2),
          recommendation TEXT,
          classified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Clear old classifications
      await pool.query(`DELETE FROM ${table} WHERE classified_at < CURRENT_DATE`);

      // Insert new classifications
      for (const product of classifications) {
        await pool.query(`
          INSERT INTO ${table} (
            product_group, stage, confidence, indicators,
            current_revenue, current_volume, customer_count,
            recent_growth, avg_growth_3yr, recommendation
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          product.productGroup,
          product.stage,
          product.confidence,
          JSON.stringify(product.indicators),
          product.currentRevenue,
          product.currentVolume,
          product.customerCount,
          product.recentGrowth,
          product.avgGrowth3yr,
          product.recommendation
        ]);
      }

      return { success: true };
    } catch (error) {
      logger.error('Failed to store lifecycle classifications:', error);
      throw error;
    }
  }

  // ===========================================================================
  // PRODUCT VELOCITY ANALYSIS
  // ===========================================================================

  /**
   * Analyze product sales velocity
   * Uses PGCombine (resolved product groups) only
   */
  async analyzeProductVelocity(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const tables = DataFilteringHelper.getTableNames(divisionCode);
    const pg = DataFilteringHelper.getProductGroupSQL(divisionCode);

    try {
      // NOTE: fp_actualcommon uses: amount, qty_kgs, customer_name, pgcombine
      const velocity = await pool.query(`
        WITH monthly_sales AS (
          SELECT 
            ${pg.pgCombineExpr} as productgroup,
            d.year,
            d.month,
            SUM(d.amount) as revenue,
            SUM(d.qty_kgs) as volume,
            COUNT(DISTINCT d.customer_name) as buyers
          FROM ${tables.actualData} d
          ${pg.joins}
          WHERE d.year >= EXTRACT(YEAR FROM CURRENT_DATE) - 1
            AND ${pg.filterCondition}
          GROUP BY ${pg.pgCombineExpr}, d.year, d.month
        )
        SELECT 
          productgroup,
          COUNT(*) as active_months,
          AVG(revenue) as avg_monthly_revenue,
          STDDEV(revenue) as revenue_volatility,
          AVG(volume) as avg_monthly_volume,
          AVG(buyers) as avg_monthly_buyers,
          MAX(revenue) as peak_revenue,
          MIN(revenue) as trough_revenue
        FROM monthly_sales
        GROUP BY productgroup
        HAVING COUNT(*) >= 3
        ORDER BY AVG(revenue) DESC
      `);

      const analysis = velocity.rows.map(row => {
        const avgRevenue = parseFloat(row.avg_monthly_revenue) || 0;
        const volatility = parseFloat(row.revenue_volatility) || 0;
        const cv = avgRevenue > 0 ? (volatility / avgRevenue) : 0;
        
        return {
          productGroup: row.productgroup,
          activeMonths: parseInt(row.active_months),
          avgMonthlyRevenue: avgRevenue,
          avgMonthlyVolume: parseFloat(row.avg_monthly_volume) || 0,
          avgMonthlyBuyers: parseFloat(row.avg_monthly_buyers) || 0,
          volatilityCoefficient: cv,
          velocityScore: this.calculateVelocityScore(avgRevenue, cv, parseFloat(row.avg_monthly_buyers)),
          classification: cv < 0.3 ? 'Steady' : cv < 0.6 ? 'Moderate' : 'Volatile'
        };
      });

      logger.info(`Analyzed velocity for ${analysis.length} products in ${divisionCode}`);

      return {
        success: true,
        products: analysis,
        summary: {
          steady: analysis.filter(p => p.classification === 'Steady').length,
          moderate: analysis.filter(p => p.classification === 'Moderate').length,
          volatile: analysis.filter(p => p.classification === 'Volatile').length
        }
      };

    } catch (error) {
      logger.error('Failed to analyze product velocity:', error);
      throw error;
    }
  }

  /**
   * Calculate velocity score (higher = better)
   */
  calculateVelocityScore(avgRevenue, volatilityCoeff, avgBuyers) {
    // Score based on revenue, stability, and customer breadth
    const revenueScore = Math.min(100, (avgRevenue / 100000) * 30);
    const stabilityScore = Math.max(0, 30 - (volatilityCoeff * 30));
    const breadthScore = Math.min(40, avgBuyers * 4);
    return revenueScore + stabilityScore + breadthScore;
  }

  // ===========================================================================
  // CROSS-SELL PATTERN DETECTION
  // ===========================================================================

  /**
   * Detect cross-sell patterns between products
   * Uses PGCombine (resolved product groups) only
   */
  async detectCrossSellPatterns(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const tables = DataFilteringHelper.getTableNames(divisionCode);
    const pg = DataFilteringHelper.getProductGroupSQL(divisionCode);

    try {
      // Find products frequently bought together by same customer
      // NOTE: fp_actualcommon uses customer_name (not customername)
      const patterns = await pool.query(`
        WITH customer_products AS (
          SELECT DISTINCT
            d.customer_name,
            ${pg.pgCombineExpr} as productgroup
          FROM ${tables.actualData} d
          ${pg.joins}
          WHERE d.year >= EXTRACT(YEAR FROM CURRENT_DATE) - 1
            AND ${pg.filterCondition}
        ),
        product_pairs AS (
          SELECT 
            a.productgroup as product_a,
            b.productgroup as product_b,
            COUNT(DISTINCT a.customer_name) as shared_customers
          FROM customer_products a
          JOIN customer_products b 
            ON a.customer_name = b.customer_name 
            AND a.productgroup < b.productgroup
          GROUP BY a.productgroup, b.productgroup
          HAVING COUNT(DISTINCT a.customer_name) >= 3
        ),
        product_totals AS (
          SELECT 
            productgroup,
            COUNT(DISTINCT customer_name) as total_customers
          FROM customer_products
          GROUP BY productgroup
        )
        SELECT 
          pp.product_a,
          pp.product_b,
          pp.shared_customers,
          pa.total_customers as product_a_customers,
          pb.total_customers as product_b_customers,
          ROUND(pp.shared_customers::DECIMAL / LEAST(pa.total_customers, pb.total_customers) * 100, 1) as affinity_pct
        FROM product_pairs pp
        JOIN product_totals pa ON pp.product_a = pa.productgroup
        JOIN product_totals pb ON pp.product_b = pb.productgroup
        WHERE pp.shared_customers::DECIMAL / LEAST(pa.total_customers, pb.total_customers) >= 0.2
        ORDER BY pp.shared_customers DESC
        LIMIT 50
      `);

      const crossSellPatterns = patterns.rows.map(row => ({
        productA: row.product_a,
        productB: row.product_b,
        sharedCustomers: parseInt(row.shared_customers),
        affinityPercent: parseFloat(row.affinity_pct),
        recommendation: parseFloat(row.affinity_pct) > 50 
          ? 'Strong bundle opportunity' 
          : 'Cross-sell potential'
      }));

      // Store patterns
      await this.storeCrossSellPatterns(divisionCode, crossSellPatterns);

      logger.info(`Detected ${crossSellPatterns.length} cross-sell patterns for ${divisionCode}`);

      return {
        success: true,
        patterns: crossSellPatterns,
        topOpportunities: crossSellPatterns.slice(0, 10)
      };

    } catch (error) {
      logger.error('Failed to detect cross-sell patterns:', error);
      throw error;
    }
  }

  /**
   * Store cross-sell patterns
   */
  async storeCrossSellPatterns(divisionCode, patterns) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_product_crosssell`;

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id SERIAL PRIMARY KEY,
          product_a VARCHAR(100),
          product_b VARCHAR(100),
          shared_customers INTEGER,
          affinity_percent DECIMAL(5,2),
          recommendation VARCHAR(100),
          detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.query(`DELETE FROM ${table} WHERE detected_at < CURRENT_DATE`);

      for (const pattern of patterns) {
        await pool.query(`
          INSERT INTO ${table} (product_a, product_b, shared_customers, affinity_percent, recommendation)
          VALUES ($1, $2, $3, $4, $5)
        `, [pattern.productA, pattern.productB, pattern.sharedCustomers, pattern.affinityPercent, pattern.recommendation]);
      }

      return { success: true };
    } catch (error) {
      logger.error('Failed to store cross-sell patterns:', error);
      throw error;
    }
  }

  // ===========================================================================
  // SEASONAL PRODUCT PATTERNS
  // ===========================================================================

  /**
   * Detect seasonal patterns for products
   * Uses PGCombine (resolved product groups) only
   */
  async detectSeasonalPatterns(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const tables = DataFilteringHelper.getTableNames(divisionCode);
    const pg = DataFilteringHelper.getProductGroupSQL(divisionCode);

    try {
      // NOTE: fp_actualcommon uses amount (not values with values_type)
      const seasonal = await pool.query(`
        WITH monthly_avg AS (
          SELECT 
            ${pg.pgCombineExpr} as productgroup,
            d.month,
            AVG(d.amount) as avg_revenue
          FROM ${tables.actualData} d
          ${pg.joins}
          WHERE d.year >= EXTRACT(YEAR FROM CURRENT_DATE) - 2
            AND ${pg.filterCondition}
          GROUP BY ${pg.pgCombineExpr}, d.month
        ),
        product_baseline AS (
          SELECT 
            productgroup,
            AVG(avg_revenue) as overall_avg
          FROM monthly_avg
          GROUP BY productgroup
          HAVING AVG(avg_revenue) > 0
        )
        SELECT 
          m.productgroup,
          m.month,
          m.avg_revenue,
          b.overall_avg,
          (m.avg_revenue / NULLIF(b.overall_avg, 0) - 1) * 100 as seasonal_index
        FROM monthly_avg m
        JOIN product_baseline b ON m.productgroup = b.productgroup
        ORDER BY m.productgroup, m.month
      `);

      // Group by product
      const productSeasonality = new Map();
      for (const row of seasonal.rows) {
        if (!productSeasonality.has(row.productgroup)) {
          productSeasonality.set(row.productgroup, { months: [], overall_avg: parseFloat(row.overall_avg) });
        }
        productSeasonality.get(row.productgroup).months.push({
          month: parseInt(row.month),
          index: parseFloat(row.seasonal_index) || 0
        });
      }

      const patterns = [];
      for (const [productGroup, data] of productSeasonality) {
        const indices = data.months.map(m => m.index);
        const maxVariation = Math.max(...indices) - Math.min(...indices);
        const peakMonth = data.months.reduce((a, b) => a.index > b.index ? a : b);
        const lowMonth = data.months.reduce((a, b) => a.index < b.index ? a : b);

        patterns.push({
          productGroup,
          isHighlySeasonal: maxVariation > 50,
          seasonalityScore: maxVariation,
          peakMonth: peakMonth.month,
          peakIndex: peakMonth.index,
          lowMonth: lowMonth.month,
          lowIndex: lowMonth.index,
          monthlyIndices: data.months
        });
      }

      logger.info(`Detected seasonal patterns for ${patterns.length} products in ${divisionCode}`);

      return {
        success: true,
        products: patterns,
        highlySeasonal: patterns.filter(p => p.isHighlySeasonal).map(p => p.productGroup)
      };

    } catch (error) {
      logger.error('Failed to detect seasonal patterns:', error);
      throw error;
    }
  }

  // ===========================================================================
  // RUN ALL
  // ===========================================================================

  /**
   * Run full product learning
   */
  async runAllLearning(divisionCode) {
    const results = {
      lifecycle: null,
      velocity: null,
      crossSell: null,
      seasonality: null
    };

    try {
      results.lifecycle = await this.classifyProductLifecycle(divisionCode);
    } catch (e) {
      logger.error('Lifecycle classification failed:', e);
      results.lifecycle = { success: false, error: e.message };
    }

    try {
      results.velocity = await this.analyzeProductVelocity(divisionCode);
    } catch (e) {
      logger.error('Velocity analysis failed:', e);
      results.velocity = { success: false, error: e.message };
    }

    try {
      results.crossSell = await this.detectCrossSellPatterns(divisionCode);
    } catch (e) {
      logger.error('Cross-sell detection failed:', e);
      results.crossSell = { success: false, error: e.message };
    }

    try {
      results.seasonality = await this.detectSeasonalPatterns(divisionCode);
    } catch (e) {
      logger.error('Seasonality detection failed:', e);
      results.seasonality = { success: false, error: e.message };
    }

    logger.info(`Completed product learning for ${divisionCode}`);
    return results;
  }

  // ===========================================================================
  // GETTERS
  // ===========================================================================

  /**
   * Get product lifecycle data
   */
  async getProductLifecycle(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_product_lifecycle`;

    try {
      const result = await pool.query(`
        SELECT * FROM ${table}
        ORDER BY current_revenue DESC
      `);
      return result.rows;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get cross-sell patterns
   */
  async getCrossSellPatterns(divisionCode, limit = 20) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_product_crosssell`;

    try {
      const result = await pool.query(`
        SELECT * FROM ${table}
        ORDER BY shared_customers DESC
        LIMIT $1
      `, [limit]);
      return result.rows;
    } catch (error) {
      return [];
    }
  }
}

module.exports = new ProductLearningService();
