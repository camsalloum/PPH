/**
 * Supply Chain Intelligence Service
 * 
 * Analyzes demand patterns and provides inventory optimization insights.
 * Predicts future demand based on historical patterns and external factors.
 * 
 * Features:
 * - Demand forecasting (time series analysis)
 * - Inventory level optimization
 * - Lead time analysis
 * - Stock-out risk prediction
 * - Reorder point calculation
 * - Seasonal demand adjustment
 * 
 * @version 1.0
 * @date December 27, 2025
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

class SupplyChainIntelligenceService {

  /**
   * Get table prefix for division
   */
  getDivisionPrefix(divisionCode) {
    return divisionCode.toLowerCase().split('-')[0];
  }

  // ===========================================================================
  // DEMAND FORECASTING
  // ===========================================================================

  /**
   * Generate demand forecast for products
   * Uses moving average + seasonal adjustment
   */
  async forecastDemand(divisionCode, horizonMonths = 3) {
    const prefix = this.getDivisionPrefix(divisionCode);

    try {
      // Get historical monthly demand by product
      // NOTE: fp_actualcommon uses: product_group, qty_kgs, amount, pgcombine
      const historicalDemand = await pool.query(`
        WITH monthly_demand AS (
          SELECT 
            pgcombine as productgroup,
            year,
            month,
            SUM(qty_kgs) as volume,
            SUM(amount) as revenue
          FROM ${prefix}_actualcommon
          WHERE pgcombine IS NOT NULL
            AND pgcombine != ''
          GROUP BY pgcombine, year, month
        ),
        with_lag AS (
          SELECT 
            productgroup,
            year,
            month,
            volume,
            revenue,
            LAG(volume, 12) OVER (PARTITION BY productgroup ORDER BY year, month) as volume_ly,
            AVG(volume) OVER (PARTITION BY productgroup ORDER BY year, month ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING) as ma3
          FROM monthly_demand
        )
        SELECT * FROM with_lag
        WHERE year >= EXTRACT(YEAR FROM CURRENT_DATE) - 2
        ORDER BY productgroup, year, month
      `);

      // Group by product
      const productDemand = new Map();
      for (const row of historicalDemand.rows) {
        if (!productDemand.has(row.productgroup)) {
          productDemand.set(row.productgroup, []);
        }
        productDemand.get(row.productgroup).push({
          year: parseInt(row.year),
          month: parseInt(row.month),
          volume: parseFloat(row.volume) || 0,
          revenue: parseFloat(row.revenue) || 0,
          volumeLY: parseFloat(row.volume_ly) || 0,
          ma3: parseFloat(row.ma3) || 0
        });
      }

      // Generate forecasts
      const forecasts = [];
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      for (const [productGroup, history] of productDemand) {
        if (history.length < 6) continue; // Need minimum history

        const forecast = this.calculateProductForecast(productGroup, history, currentYear, currentMonth, horizonMonths);
        if (forecast) {
          forecasts.push(forecast);
        }
      }

      // Store forecasts
      await this.storeDemandForecasts(divisionCode, forecasts);

      logger.info(`Generated demand forecasts for ${forecasts.length} products in ${divisionCode}`);

      return {
        success: true,
        horizonMonths,
        products: forecasts,
        totalForecastedVolume: forecasts.reduce((sum, f) => sum + f.forecastedVolume, 0)
      };

    } catch (error) {
      logger.error('Failed to forecast demand:', error);
      throw error;
    }
  }

  /**
   * Calculate forecast for a single product
   */
  calculateProductForecast(productGroup, history, currentYear, currentMonth, horizonMonths) {
    const recent = history.slice(-6);
    if (recent.length === 0) return null;

    // Calculate base forecast using moving average
    const avgVolume = recent.reduce((sum, h) => sum + h.volume, 0) / recent.length;
    const avgRevenue = recent.reduce((sum, h) => sum + h.revenue, 0) / recent.length;

    // Calculate trend
    const first3 = recent.slice(0, 3);
    const last3 = recent.slice(-3);
    const first3Avg = first3.reduce((sum, h) => sum + h.volume, 0) / first3.length;
    const last3Avg = last3.reduce((sum, h) => sum + h.volume, 0) / last3.length;
    const trendPct = first3Avg > 0 ? ((last3Avg - first3Avg) / first3Avg) * 100 : 0;

    // Calculate seasonality index (if we have last year data)
    const withLY = recent.filter(h => h.volumeLY > 0);
    let seasonalityFactor = 1;
    if (withLY.length > 0) {
      const avgLY = withLY.reduce((sum, h) => sum + h.volumeLY, 0) / withLY.length;
      if (avgLY > 0) {
        seasonalityFactor = last3Avg / avgLY;
      }
    }

    // Generate monthly forecasts
    const monthlyForecasts = [];
    for (let i = 1; i <= horizonMonths; i++) {
      let targetMonth = currentMonth + i;
      let targetYear = currentYear;
      if (targetMonth > 12) {
        targetMonth -= 12;
        targetYear++;
      }

      // Apply trend and seasonality
      const baseVolume = avgVolume * (1 + (trendPct / 100) * (i / horizonMonths));
      const adjustedVolume = baseVolume * Math.max(0.5, Math.min(1.5, seasonalityFactor));

      monthlyForecasts.push({
        year: targetYear,
        month: targetMonth,
        forecastedVolume: adjustedVolume,
        confidence: Math.max(0.5, 0.85 - (i * 0.05)) // Confidence decreases with horizon
      });
    }

    return {
      productGroup,
      avgMonthlyVolume: avgVolume,
      avgMonthlyRevenue: avgRevenue,
      trendPercent: trendPct,
      seasonalityFactor,
      forecastedVolume: monthlyForecasts.reduce((sum, m) => sum + m.forecastedVolume, 0),
      monthlyForecasts,
      riskLevel: trendPct < -10 ? 'declining' : trendPct > 10 ? 'growing' : 'stable'
    };
  }

  /**
   * Store demand forecasts
   */
  async storeDemandForecasts(divisionCode, forecasts) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_demand_forecasts`;

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id SERIAL PRIMARY KEY,
          product_group VARCHAR(100),
          target_year INTEGER,
          target_month INTEGER,
          forecasted_volume DECIMAL(20,2),
          confidence DECIMAL(5,2),
          trend_percent DECIMAL(10,2),
          seasonality_factor DECIMAL(10,4),
          forecast_date DATE DEFAULT CURRENT_DATE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Clear old forecasts
      await pool.query(`DELETE FROM ${table} WHERE forecast_date < CURRENT_DATE - INTERVAL '7 days'`);

      for (const forecast of forecasts) {
        for (const monthly of forecast.monthlyForecasts) {
          await pool.query(`
            INSERT INTO ${table} (
              product_group, target_year, target_month,
              forecasted_volume, confidence, trend_percent, seasonality_factor
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            forecast.productGroup,
            monthly.year,
            monthly.month,
            monthly.forecastedVolume,
            monthly.confidence,
            forecast.trendPercent,
            forecast.seasonalityFactor
          ]);
        }
      }

      return { success: true };
    } catch (error) {
      logger.error('Failed to store demand forecasts:', error);
      throw error;
    }
  }

  // ===========================================================================
  // INVENTORY OPTIMIZATION
  // ===========================================================================

  /**
   * Calculate optimal inventory levels
   */
  async optimizeInventoryLevels(divisionCode, leadTimeDays = 14) {
    const prefix = this.getDivisionPrefix(divisionCode);

    try {
      // Get demand variability by product
      // NOTE: fp_actualcommon uses: pgcombine, qty_kgs
      const demandStats = await pool.query(`
        WITH monthly_demand AS (
          SELECT 
            pgcombine as productgroup,
            year,
            month,
            SUM(qty_kgs) as volume
          FROM ${prefix}_actualcommon
          WHERE pgcombine IS NOT NULL
            AND year >= EXTRACT(YEAR FROM CURRENT_DATE) - 1
          GROUP BY pgcombine, year, month
        )
        SELECT 
          productgroup,
          AVG(volume) as avg_monthly_demand,
          STDDEV(volume) as demand_stddev,
          MAX(volume) as peak_demand,
          MIN(volume) as min_demand,
          COUNT(*) as periods
        FROM monthly_demand
        GROUP BY productgroup
        HAVING COUNT(*) >= 3
      `);

      const recommendations = [];
      const safetyStockMultiplier = 1.65; // 95% service level
      const leadTimeMonths = leadTimeDays / 30;

      for (const row of demandStats.rows) {
        const avgDemand = parseFloat(row.avg_monthly_demand) || 0;
        const stdDev = parseFloat(row.demand_stddev) || 0;
        const peak = parseFloat(row.peak_demand) || 0;

        // Calculate reorder point
        const leadTimeDemand = avgDemand * leadTimeMonths;
        const safetyStock = safetyStockMultiplier * stdDev * Math.sqrt(leadTimeMonths);
        const reorderPoint = leadTimeDemand + safetyStock;

        // Calculate economic order quantity (simplified EOQ)
        const annualDemand = avgDemand * 12;
        const orderingCost = 100; // Assumed fixed cost per order
        const holdingCost = 0.2; // 20% of product value per year
        const avgUnitCost = 10; // Assumed average unit cost
        const eoq = Math.sqrt((2 * annualDemand * orderingCost) / (holdingCost * avgUnitCost));

        // Demand variability coefficient
        const cv = avgDemand > 0 ? stdDev / avgDemand : 0;

        recommendations.push({
          productGroup: row.productgroup,
          avgMonthlyDemand: avgDemand,
          demandVariability: cv,
          variabilityLevel: cv < 0.3 ? 'Low' : cv < 0.6 ? 'Medium' : 'High',
          safetyStock: Math.round(safetyStock),
          reorderPoint: Math.round(reorderPoint),
          suggestedOrderQuantity: Math.round(eoq),
          peakDemand: peak,
          recommendation: this.getInventoryRecommendation(cv, avgDemand)
        });
      }

      // Store recommendations
      await this.storeInventoryRecommendations(divisionCode, recommendations);

      logger.info(`Generated inventory recommendations for ${recommendations.length} products in ${divisionCode}`);

      return {
        success: true,
        products: recommendations,
        summary: {
          highVariability: recommendations.filter(r => r.variabilityLevel === 'High').length,
          mediumVariability: recommendations.filter(r => r.variabilityLevel === 'Medium').length,
          lowVariability: recommendations.filter(r => r.variabilityLevel === 'Low').length
        }
      };

    } catch (error) {
      logger.error('Failed to optimize inventory levels:', error);
      throw error;
    }
  }

  /**
   * Get inventory recommendation text
   */
  getInventoryRecommendation(cv, avgDemand) {
    if (cv > 0.6) {
      return 'High demand variability - consider buffer stock or make-to-order strategy';
    } else if (cv > 0.3) {
      return 'Moderate variability - standard safety stock recommended';
    } else if (avgDemand < 100) {
      return 'Low volume, stable demand - minimize inventory, quick replenishment';
    } else {
      return 'Stable high-volume product - optimize for efficiency';
    }
  }

  /**
   * Store inventory recommendations
   */
  async storeInventoryRecommendations(divisionCode, recommendations) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_inventory_recommendations`;

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id SERIAL PRIMARY KEY,
          product_group VARCHAR(100),
          avg_monthly_demand DECIMAL(20,2),
          demand_variability DECIMAL(10,4),
          variability_level VARCHAR(20),
          safety_stock DECIMAL(20,2),
          reorder_point DECIMAL(20,2),
          suggested_order_qty DECIMAL(20,2),
          recommendation TEXT,
          analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.query(`DELETE FROM ${table} WHERE analyzed_at < CURRENT_DATE`);

      for (const rec of recommendations) {
        await pool.query(`
          INSERT INTO ${table} (
            product_group, avg_monthly_demand, demand_variability,
            variability_level, safety_stock, reorder_point,
            suggested_order_qty, recommendation
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          rec.productGroup,
          rec.avgMonthlyDemand,
          rec.demandVariability,
          rec.variabilityLevel,
          rec.safetyStock,
          rec.reorderPoint,
          rec.suggestedOrderQuantity,
          rec.recommendation
        ]);
      }

      return { success: true };
    } catch (error) {
      logger.error('Failed to store inventory recommendations:', error);
      throw error;
    }
  }

  // ===========================================================================
  // STOCK-OUT RISK
  // ===========================================================================

  /**
   * Predict stock-out risk
   */
  async predictStockOutRisk(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);

    try {
      // Analyze products with declining trends or high variability
      // NOTE: fp_actualcommon uses: pgcombine, qty_kgs
      const riskAnalysis = await pool.query(`
        WITH recent_demand AS (
          SELECT 
            pgcombine as productgroup,
            year,
            month,
            SUM(qty_kgs) as volume
          FROM ${prefix}_actualcommon
          WHERE pgcombine IS NOT NULL
            AND year >= EXTRACT(YEAR FROM CURRENT_DATE) - 1
          GROUP BY pgcombine, year, month
        ),
        demand_trends AS (
          SELECT 
            productgroup,
            AVG(volume) as avg_volume,
            STDDEV(volume) as std_volume,
            MAX(CASE WHEN year = EXTRACT(YEAR FROM CURRENT_DATE) THEN volume END) as latest_volume
          FROM recent_demand
          GROUP BY productgroup
          HAVING COUNT(*) >= 3
        )
        SELECT 
          productgroup,
          avg_volume,
          std_volume,
          latest_volume,
          CASE 
            WHEN avg_volume > 0 THEN std_volume / avg_volume 
            ELSE 0 
          END as cv
        FROM demand_trends
        ORDER BY cv DESC
      `);

      const risks = riskAnalysis.rows.map(row => {
        const cv = parseFloat(row.cv) || 0;
        const avgVolume = parseFloat(row.avg_volume) || 0;
        const latestVolume = parseFloat(row.latest_volume) || 0;
        
        // Risk score based on variability and recent demand spike
        let riskScore = cv * 50; // Base risk from variability
        if (latestVolume > avgVolume * 1.5) {
          riskScore += 25; // Demand spike risk
        }
        riskScore = Math.min(100, riskScore);

        return {
          productGroup: row.productgroup,
          riskScore,
          riskLevel: riskScore > 70 ? 'High' : riskScore > 40 ? 'Medium' : 'Low',
          avgVolume,
          latestVolume,
          variability: cv,
          recommendation: riskScore > 70 
            ? 'Increase safety stock immediately'
            : riskScore > 40 
            ? 'Monitor closely, consider buffer increase'
            : 'Current levels adequate'
        };
      });

      logger.info(`Analyzed stock-out risk for ${risks.length} products in ${divisionCode}`);

      return {
        success: true,
        products: risks,
        highRiskCount: risks.filter(r => r.riskLevel === 'High').length,
        mediumRiskCount: risks.filter(r => r.riskLevel === 'Medium').length
      };

    } catch (error) {
      logger.error('Failed to predict stock-out risk:', error);
      throw error;
    }
  }

  // ===========================================================================
  // RUN ALL
  // ===========================================================================

  /**
   * Run full supply chain intelligence
   */
  async runAllAnalysis(divisionCode) {
    const results = {
      demandForecast: null,
      inventoryOptimization: null,
      stockOutRisk: null
    };

    try {
      results.demandForecast = await this.forecastDemand(divisionCode, 3);
    } catch (e) {
      logger.error('Demand forecasting failed:', e);
      results.demandForecast = { success: false, error: e.message };
    }

    try {
      results.inventoryOptimization = await this.optimizeInventoryLevels(divisionCode, 14);
    } catch (e) {
      logger.error('Inventory optimization failed:', e);
      results.inventoryOptimization = { success: false, error: e.message };
    }

    try {
      results.stockOutRisk = await this.predictStockOutRisk(divisionCode);
    } catch (e) {
      logger.error('Stock-out risk prediction failed:', e);
      results.stockOutRisk = { success: false, error: e.message };
    }

    logger.info(`Completed supply chain intelligence for ${divisionCode}`);
    return results;
  }

  // ===========================================================================
  // GETTERS
  // ===========================================================================

  /**
   * Get demand forecasts
   */
  async getDemandForecasts(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_demand_forecasts`;

    try {
      const result = await pool.query(`
        SELECT * FROM ${table}
        WHERE forecast_date = CURRENT_DATE
        ORDER BY product_group, target_year, target_month
      `);
      return result.rows;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get inventory recommendations
   */
  async getInventoryRecommendations(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_inventory_recommendations`;

    try {
      const result = await pool.query(`
        SELECT * FROM ${table}
        ORDER BY demand_variability DESC
      `);
      return result.rows;
    } catch (error) {
      return [];
    }
  }
}

module.exports = new SupplyChainIntelligenceService();
