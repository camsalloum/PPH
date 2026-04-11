/**
 * Data Capture Service
 * 
 * Captures and records behavioral data for AI learning.
 * This service is the foundation for all machine learning features.
 * 
 * Captures:
 * - Division-level monthly performance snapshots
 * - Sales rep behavioral patterns
 * - Customer interaction history
 * - Product performance metrics
 * 
 * IMPORTANT: All data capture uses the 3-layer filtering:
 * 1. Product Groups: Raw → PGCombine (excludes unmapped)
 * 2. Sales Reps: Alias → Canonical Name
 * 3. Customers: Raw → Merged Customer Name
 * 
 * @version 1.1
 * @date December 28, 2025 - Updated to use DataFilteringHelper
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');
const DataFilteringHelper = require('./DataFilteringHelper');

class DataCaptureService {
  
  /**
   * Get table prefix for division
   */
  getDivisionPrefix(divisionCode) {
    return divisionCode.toLowerCase().split('-')[0];
  }

  // ===========================================================================
  // DIVISION BEHAVIOR CAPTURE
  // ===========================================================================

  /**
   * Record monthly division performance snapshot
   * Should be called at end of each month (or can backfill historical data)
   */
  async recordDivisionSnapshot(divisionCode, year, month, metrics) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_division_behavior_history`;

    try {
      await pool.query(`
        INSERT INTO ${table} (
          year, month,
          total_sales, total_volume, total_margin_pct,
          customer_count, product_count, salesrep_count,
          avg_order_value, budget_achievement_pct
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (year, month) 
        DO UPDATE SET
          total_sales = EXCLUDED.total_sales,
          total_volume = EXCLUDED.total_volume,
          total_margin_pct = EXCLUDED.total_margin_pct,
          customer_count = EXCLUDED.customer_count,
          product_count = EXCLUDED.product_count,
          salesrep_count = EXCLUDED.salesrep_count,
          avg_order_value = EXCLUDED.avg_order_value,
          budget_achievement_pct = EXCLUDED.budget_achievement_pct,
          recorded_at = CURRENT_TIMESTAMP
      `, [
        year, month,
        metrics.totalSales || 0,
        metrics.totalVolume || 0,
        metrics.marginPct || 0,
        metrics.customerCount || 0,
        metrics.productCount || 0,
        metrics.salesrepCount || 0,
        metrics.avgOrderValue || 0,
        metrics.budgetAchievementPct || 0
      ]);

      logger.info(`Recorded division snapshot: ${divisionCode} ${year}-${month}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to record division snapshot:', error);
      throw error;
    }
  }

  /**
   * Capture current division metrics from live data
   * Aggregates from fp_actualcommon table for the given period
   * Uses filtered data (PGCombine, sales rep groups, merged customers)
   * 
   * NOTE: fp_actualcommon column names (snake_case):
   *   - customer_name (not customername)
   *   - sales_rep_name (not salesrepname)
   *   - amount (not values with values_type='AMOUNT')
   *   - qty_kgs (not values with values_type='KGS')
   *   - pgcombine (pre-resolved product group)
   *   - No 'type' column - all records are actual sales
   */
  async captureDivisionMetrics(divisionCode, year, month) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const tables = DataFilteringHelper.getTableNames(divisionCode);
    const pg = DataFilteringHelper.getProductGroupSQL(divisionCode);
    // Use pre-calculated sales_rep_group_name column directly (no runtime resolution needed)
    const salesRepExpr = 'd.sales_rep_group_name';
    const customerExpr = await DataFilteringHelper.buildCustomerResolutionSQL(divisionCode, 'd.customer_name');
    const budgetTable = `${prefix}_budget_unified`;

    try {
      // Get sales/volume metrics with proper filtering
      // fp_actualcommon uses 'amount' and 'qty_kgs' columns directly
      const salesResult = await pool.query(`
        SELECT 
          COALESCE(SUM(d.amount), 0) as total_sales,
          COALESCE(SUM(d.qty_kgs), 0) as total_volume,
          COUNT(DISTINCT ${customerExpr}) as customer_count,
          COUNT(DISTINCT ${pg.pgCombineExpr}) as product_count,
          COUNT(DISTINCT ${salesRepExpr}) as salesrep_count
        FROM ${tables.actualData} d
        ${pg.joins}
        WHERE d.year = $1 AND d.month = $2
          AND ${pg.filterCondition}
      `, [year, month]);

      // Get budget for comparison from budgetUnified
      const budgetResult = await pool.query(`
        SELECT COALESCE(SUM(amount), 0) as total_budget
        FROM ${budgetTable}
        WHERE budget_year = $1 AND month_no = $2 AND is_budget = true
      `, [year, month]);

      const sales = salesResult.rows[0];
      const budget = budgetResult.rows[0]?.total_budget || 0;
      
      const budgetAchievement = budget > 0 
        ? (parseFloat(sales.total_sales) / parseFloat(budget)) * 100 
        : 0;

      // Calculate avg order value (sales / customer count)
      const avgOrderValue = parseInt(sales.customer_count) > 0 
        ? parseFloat(sales.total_sales) / parseInt(sales.customer_count) 
        : 0;

      const metrics = {
        totalSales: parseFloat(sales.total_sales),
        totalVolume: parseFloat(sales.total_volume),
        marginPct: 0, // Would need P&L data
        customerCount: parseInt(sales.customer_count),
        productCount: parseInt(sales.product_count),
        salesrepCount: parseInt(sales.salesrep_count),
        avgOrderValue: avgOrderValue,
        budgetAchievementPct: budgetAchievement
      };

      // Record the snapshot
      await this.recordDivisionSnapshot(divisionCode, year, month, metrics);

      return metrics;
    } catch (error) {
      logger.error('Failed to capture division metrics:', error);
      throw error;
    }
  }

  // ===========================================================================
  // SALES REP BEHAVIOR CAPTURE
  // ===========================================================================

  /**
   * Record sales rep monthly performance
   */
  async recordSalesRepSnapshot(divisionCode, salesrepName, year, month, metrics) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_salesrep_behavior_history`;

    try {
      await pool.query(`
        INSERT INTO ${table} (
          salesrep_name, year, month,
          total_sales, total_volume, customer_count, product_count,
          avg_deal_size, new_customer_count, lost_customer_count,
          budget_achievement_pct
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (salesrep_name, year, month)
        DO UPDATE SET
          total_sales = EXCLUDED.total_sales,
          total_volume = EXCLUDED.total_volume,
          customer_count = EXCLUDED.customer_count,
          product_count = EXCLUDED.product_count,
          avg_deal_size = EXCLUDED.avg_deal_size,
          new_customer_count = EXCLUDED.new_customer_count,
          lost_customer_count = EXCLUDED.lost_customer_count,
          budget_achievement_pct = EXCLUDED.budget_achievement_pct,
          recorded_at = CURRENT_TIMESTAMP
      `, [
        salesrepName, year, month,
        metrics.totalSales || 0,
        metrics.totalVolume || 0,
        metrics.customerCount || 0,
        metrics.productCount || 0,
        metrics.avgDealSize || 0,
        metrics.newCustomerCount || 0,
        metrics.lostCustomerCount || 0,
        metrics.budgetAchievementPct || 0
      ]);

      logger.debug(`Recorded sales rep snapshot: ${salesrepName} ${year}-${month}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to record sales rep snapshot:', error);
      throw error;
    }
  }

  /**
   * Capture all sales reps' metrics for a given period
   * Uses sales rep groups (same as dashboard) for aggregation
   * 
   * NOTE: fp_actualcommon column names:
   *   - sales_rep_name, customer_name, amount, qty_kgs, pgcombine
   */
  async captureAllSalesRepMetrics(divisionCode, year, month) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const tables = DataFilteringHelper.getTableNames(divisionCode);
    const pg = DataFilteringHelper.getProductGroupSQL(divisionCode);
    // Use pre-calculated sales_rep_group_name column directly (no runtime resolution needed)
    const salesRepExpr = 'd.sales_rep_group_name';
    const budgetTable = `${prefix}_budget_unified`;

    try {
      // Get sales metrics per rep using canonical names and filtered product groups
      const salesResult = await pool.query(`
        SELECT 
          ${salesRepExpr} as salesrep_name,
          COALESCE(SUM(d.amount), 0) as total_sales,
          COALESCE(SUM(d.qty_kgs), 0) as total_volume,
          COUNT(DISTINCT d.customer_name) as customer_count,
          COUNT(DISTINCT ${pg.pgCombineExpr}) as product_count
        FROM ${tables.actualData} d
        ${pg.joins}
        WHERE d.year = $1 AND d.month = $2 AND d.sales_rep_group_name IS NOT NULL
          AND ${pg.filterCondition}
        GROUP BY ${salesRepExpr}
      `, [year, month]);

      // Get previous month for new/lost customer comparison
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;

      const prevCustomersResult = await pool.query(`
        SELECT 
          ${salesRepExpr} as salesrep_name,
          ARRAY_AGG(DISTINCT d.customer_name) as customers
        FROM ${tables.actualData} d
        ${pg.joins}
        WHERE d.year = $1 AND d.month = $2 AND d.sales_rep_group_name IS NOT NULL
          AND ${pg.filterCondition}
        GROUP BY ${salesRepExpr}
      `, [prevYear, prevMonth]);

      const currentCustomersResult = await pool.query(`
        SELECT 
          ${salesRepExpr} as salesrep_name,
          ARRAY_AGG(DISTINCT d.customer_name) as customers
        FROM ${tables.actualData} d
        ${pg.joins}
        WHERE d.year = $1 AND d.month = $2 AND d.sales_rep_group_name IS NOT NULL
          AND ${pg.filterCondition}
        GROUP BY ${salesRepExpr}
      `, [year, month]);

      // Build lookup maps
      const prevCustomers = {};
      prevCustomersResult.rows.forEach(r => {
        prevCustomers[r.salesrep_name] = new Set(r.customers || []);
      });

      const currCustomers = {};
      currentCustomersResult.rows.forEach(r => {
        currCustomers[r.salesrep_name] = new Set(r.customers || []);
      });

      // Get budgets per rep GROUP from budgetUnified (use sales_rep_group_name for consistency)
      const budgetResult = await pool.query(`
        SELECT 
          sales_rep_group_name as sales_rep_name,
          COALESCE(SUM(amount), 0) as budget
        FROM ${budgetTable}
        WHERE budget_year = $1 AND month_no = $2 AND is_budget = true
        GROUP BY sales_rep_group_name
      `, [year, month]);

      const budgets = {};
      budgetResult.rows.forEach(r => {
        budgets[r.sales_rep_name] = parseFloat(r.budget);
      });

      // Record each rep's metrics
      let recorded = 0;
      for (const row of salesResult.rows) {
        const repName = row.salesrep_name;
        const budget = budgets[repName] || 0;
        const sales = parseFloat(row.total_sales);

        // Calculate new and lost customers
        const prev = prevCustomers[repName] || new Set();
        const curr = currCustomers[repName] || new Set();
        const newCustomers = [...curr].filter(c => !prev.has(c)).length;
        const lostCustomers = [...prev].filter(c => !curr.has(c)).length;

        const metrics = {
          totalSales: sales,
          totalVolume: parseFloat(row.total_volume),
          customerCount: parseInt(row.customer_count),
          productCount: parseInt(row.product_count),
          avgDealSize: parseFloat(row.avg_deal_size),
          newCustomerCount: newCustomers,
          lostCustomerCount: lostCustomers,
          budgetAchievementPct: budget > 0 ? (sales / budget) * 100 : 0
        };

        await this.recordSalesRepSnapshot(divisionCode, repName, year, month, metrics);
        recorded++;
      }

      logger.info(`Captured ${recorded} sales rep snapshots for ${divisionCode} ${year}-${month}`);
      return { recorded };
    } catch (error) {
      logger.error('Failed to capture sales rep metrics:', error);
      throw error;
    }
  }

  // ===========================================================================
  // CUSTOMER BEHAVIOR CAPTURE
  // ===========================================================================

  /**
   * Record customer monthly behavior
   */
  async recordCustomerSnapshot(divisionCode, customerName, salesrepName, year, month, metrics) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_customer_behavior_history`;

    try {
      await pool.query(`
        INSERT INTO ${table} (
          customer_name, salesrep_name, year, month,
          total_sales, total_volume, product_count,
          order_frequency, avg_order_size, days_since_last_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (customer_name, year, month)
        DO UPDATE SET
          salesrep_name = EXCLUDED.salesrep_name,
          total_sales = EXCLUDED.total_sales,
          total_volume = EXCLUDED.total_volume,
          product_count = EXCLUDED.product_count,
          order_frequency = EXCLUDED.order_frequency,
          avg_order_size = EXCLUDED.avg_order_size,
          days_since_last_order = EXCLUDED.days_since_last_order,
          recorded_at = CURRENT_TIMESTAMP
      `, [
        customerName, salesrepName, year, month,
        metrics.totalSales || 0,
        metrics.totalVolume || 0,
        metrics.productCount || 0,
        metrics.orderFrequency || 0,
        metrics.avgOrderSize || 0,
        metrics.daysSinceLastOrder || 0
      ]);

      return { success: true };
    } catch (error) {
      logger.error('Failed to record customer snapshot:', error);
      throw error;
    }
  }

  /**
   * Capture all customers' metrics for a given period
   * Uses merged customer names after merge rule resolution
   * 
   * NOTE: fp_actualcommon column names:
   *   - customer_name, sales_rep_group_name, amount, qty_kgs, pgcombine
   */
  async captureAllCustomerMetrics(divisionCode, year, month) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const tables = DataFilteringHelper.getTableNames(divisionCode);
    const pg = DataFilteringHelper.getProductGroupSQL(divisionCode);
    // Use pre-calculated sales_rep_group_name column directly
    const salesRepExpr = 'd.sales_rep_group_name';
    const customerExpr = await DataFilteringHelper.buildCustomerResolutionSQL(divisionCode, 'd.customer_name');

    try {
      const result = await pool.query(`
        SELECT 
          ${customerExpr} as customer_name,
          MAX(${salesRepExpr}) as salesrep_name,
          COALESCE(SUM(d.amount), 0) as total_sales,
          COALESCE(SUM(d.qty_kgs), 0) as total_volume,
          COUNT(DISTINCT ${pg.pgCombineExpr}) as product_count
        FROM ${tables.actualData} d
        ${pg.joins}
        WHERE d.year = $1 AND d.month = $2 AND d.customer_name IS NOT NULL
          AND ${pg.filterCondition}
        GROUP BY ${customerExpr}
      `, [year, month]);

      let recorded = 0;
      for (const row of result.rows) {
        const metrics = {
          totalSales: parseFloat(row.total_sales),
          totalVolume: parseFloat(row.total_volume),
          productCount: parseInt(row.product_count),
          orderFrequency: parseInt(row.order_count), // Orders in this period
          avgOrderSize: parseFloat(row.avg_order_size),
          daysSinceLastOrder: 0 // Would need date-level data
        };

        await this.recordCustomerSnapshot(
          divisionCode, 
          row.customer_name, 
          row.salesrep_name,
          year, month, 
          metrics
        );
        recorded++;
      }

      logger.info(`Captured ${recorded} customer snapshots for ${divisionCode} ${year}-${month}`);
      return { recorded };
    } catch (error) {
      logger.error('Failed to capture customer metrics:', error);
      throw error;
    }
  }

  // ===========================================================================
  // PRODUCT METRICS CAPTURE
  // ===========================================================================

  /**
   * Record product group monthly metrics
   */
  async recordProductSnapshot(divisionCode, productGroup, year, month, metrics) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_product_metrics_history`;

    try {
      await pool.query(`
        INSERT INTO ${table} (
          product_group, year, month,
          total_sales, total_volume, customer_count,
          avg_selling_price, budget_variance_pct, yoy_growth_pct
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (product_group, year, month)
        DO UPDATE SET
          total_sales = EXCLUDED.total_sales,
          total_volume = EXCLUDED.total_volume,
          customer_count = EXCLUDED.customer_count,
          avg_selling_price = EXCLUDED.avg_selling_price,
          budget_variance_pct = EXCLUDED.budget_variance_pct,
          yoy_growth_pct = EXCLUDED.yoy_growth_pct,
          recorded_at = CURRENT_TIMESTAMP
      `, [
        productGroup, year, month,
        metrics.totalSales || 0,
        metrics.totalVolume || 0,
        metrics.customerCount || 0,
        metrics.avgSellingPrice || 0,
        metrics.budgetVariancePct || 0,
        metrics.yoyGrowthPct || 0
      ]);

      return { success: true };
    } catch (error) {
      logger.error('Failed to record product snapshot:', error);
      throw error;
    }
  }

  /**
   * Capture all product groups' metrics for a given period
   * Uses PGCombine (resolved product groups) only
   * 
   * NOTE: fp_actualcommon uses: amount, qty_kgs, pgcombine, customer_name
   */
  async captureAllProductMetrics(divisionCode, year, month) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const tables = DataFilteringHelper.getTableNames(divisionCode);
    const pg = DataFilteringHelper.getProductGroupSQL(divisionCode);

    try {
      // Get previous month for growth calculation
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;

      const prevResult = await pool.query(`
        SELECT 
          ${pg.pgCombineExpr} as product_group,
          COALESCE(SUM(d.amount), 0) as total_sales
        FROM ${tables.actualData} d
        ${pg.joins}
        WHERE d.year = $1 AND d.month = $2
          AND ${pg.filterCondition}
        GROUP BY ${pg.pgCombineExpr}
      `, [prevYear, prevMonth]);

      const prevSales = {};
      prevResult.rows.forEach(r => {
        prevSales[r.product_group] = parseFloat(r.total_sales);
      });

      // Current month metrics with PGCombine
      const result = await pool.query(`
        SELECT 
          ${pg.pgCombineExpr} as product_group,
          COALESCE(SUM(d.amount), 0) as total_sales,
          COALESCE(SUM(d.qty_kgs), 0) as total_volume,
          COUNT(DISTINCT d.customer_name) as customer_count,
          CASE WHEN SUM(d.qty_kgs) > 0 
            THEN SUM(d.amount) / SUM(d.qty_kgs) 
            ELSE 0 END as avg_price
        FROM ${tables.actualData} d
        ${pg.joins}
        WHERE d.year = $1 AND d.month = $2
          AND ${pg.filterCondition}
        GROUP BY ${pg.pgCombineExpr}
      `, [year, month]);

      let recorded = 0;
      for (const row of result.rows) {
        const currentSales = parseFloat(row.total_sales);
        const previousSales = prevSales[row.product_group] || 0;
        const yoyGrowth = previousSales > 0 
          ? ((currentSales - previousSales) / previousSales) * 100 
          : 0;

        const metrics = {
          totalSales: currentSales,
          totalVolume: parseFloat(row.total_volume),
          customerCount: parseInt(row.customer_count),
          avgSellingPrice: parseFloat(row.avg_price),
          budgetVariancePct: 0, // Would need product-level budget
          yoyGrowthPct: yoyGrowth
        };

        await this.recordProductSnapshot(divisionCode, row.product_group, year, month, metrics);
        recorded++;
      }

      logger.info(`Captured ${recorded} product snapshots for ${divisionCode} ${year}-${month}`);
      return { recorded };
    } catch (error) {
      logger.error('Failed to capture product metrics:', error);
      throw error;
    }
  }

  // ===========================================================================
  // BULK CAPTURE - Historical Data Backfill
  // ===========================================================================

  /**
   * Capture all metrics for a given period
   * Used for both real-time capture and historical backfill
   */
  async captureAllMetrics(divisionCode, year, month) {
    logger.info(`Starting full metrics capture for ${divisionCode} ${year}-${month}`);

    const results = {
      division: await this.captureDivisionMetrics(divisionCode, year, month),
      salesReps: await this.captureAllSalesRepMetrics(divisionCode, year, month),
      customers: await this.captureAllCustomerMetrics(divisionCode, year, month),
      products: await this.captureAllProductMetrics(divisionCode, year, month)
    };

    logger.info(`Completed full metrics capture for ${divisionCode} ${year}-${month}`, results);
    return results;
  }

  /**
   * Backfill historical data for a range of periods
   * @param {string} divisionCode 
   * @param {number} startYear 
   * @param {number} startMonth 
   * @param {number} endYear 
   * @param {number} endMonth 
   */
  async backfillHistoricalData(divisionCode, startYear, startMonth, endYear, endMonth) {
    logger.info(`Starting historical backfill for ${divisionCode} from ${startYear}-${startMonth} to ${endYear}-${endMonth}`);

    const results = [];
    let year = startYear;
    let month = startMonth;

    while (year < endYear || (year === endYear && month <= endMonth)) {
      try {
        const result = await this.captureAllMetrics(divisionCode, year, month);
        results.push({ year, month, ...result });
      } catch (error) {
        logger.error(`Failed to capture metrics for ${year}-${month}:`, error);
        results.push({ year, month, error: error.message });
      }

      // Next month
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }

    logger.info(`Completed historical backfill: ${results.length} periods processed`);
    return results;
  }

  // ===========================================================================
  // AI REPORT FEEDBACK CAPTURE
  // ===========================================================================

  /**
   * Record feedback on an AI-generated insight
   */
  async recordInsightFeedback(divisionCode, insightId, insightType, feedbackType, userId, reportDate) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_insight_feedback`;

    try {
      await pool.query(`
        INSERT INTO ${table} (
          insight_id, insight_type, feedback_type, division, user_id, report_date
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [insightId, insightType, feedbackType, divisionCode, userId, reportDate]);

      logger.info(`Recorded insight feedback: ${insightId} = ${feedbackType}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to record insight feedback:', error);
      throw error;
    }
  }

  /**
   * Record a recommendation and its outcome
   */
  async recordRecommendation(divisionCode, recommendation) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_ai_recommendations`;

    try {
      const result = await pool.query(`
        INSERT INTO ${table} (
          recommendation_type, entity_type, entity_name,
          priority_score, confidence, recommendation_text,
          supporting_evidence, expected_impact_value, expected_impact_pct,
          effort_level, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `, [
        recommendation.type,
        recommendation.entityType,
        recommendation.entityName,
        recommendation.priorityScore || 0.5,
        recommendation.confidence || 0.5,
        recommendation.text,
        JSON.stringify(recommendation.evidence || []),
        recommendation.expectedImpactValue || 0,
        recommendation.expectedImpactPct || 0,
        recommendation.effortLevel || 'MEDIUM',
        recommendation.expiresAt || null
      ]);

      return { success: true, id: result.rows[0].id };
    } catch (error) {
      logger.error('Failed to record recommendation:', error);
      throw error;
    }
  }

  /**
   * Update recommendation outcome
   */
  async updateRecommendationOutcome(divisionCode, recommendationId, outcome) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_ai_recommendations`;

    try {
      await pool.query(`
        UPDATE ${table}
        SET 
          acted_upon = TRUE,
          acted_upon_at = CURRENT_TIMESTAMP,
          acted_upon_by = $2,
          outcome_measured = $3,
          outcome_positive = $4,
          outcome_notes = $5,
          measured_at = CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE NULL END
        WHERE id = $1
      `, [
        recommendationId,
        outcome.actedBy,
        outcome.measured || false,
        outcome.positive,
        outcome.notes || null
      ]);

      return { success: true };
    } catch (error) {
      logger.error('Failed to update recommendation outcome:', error);
      throw error;
    }
  }

  // ===========================================================================
  // MODEL PERFORMANCE TRACKING
  // ===========================================================================

  /**
   * Record model performance metrics after a prediction
   */
  async recordModelPerformance(divisionCode, modelName, metrics) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_model_performance`;

    try {
      await pool.query(`
        INSERT INTO ${table} (
          model_name, model_version,
          accuracy, precision_score, recall_score, f1_score,
          mae, rmse, mape,
          samples_tested, training_samples
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        modelName,
        metrics.version || 1,
        metrics.accuracy || null,
        metrics.precision || null,
        metrics.recall || null,
        metrics.f1 || null,
        metrics.mae || null,
        metrics.rmse || null,
        metrics.mape || null,
        metrics.samplesTested || 0,
        metrics.trainingSamples || 0
      ]);

      logger.info(`Recorded model performance: ${modelName} v${metrics.version}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to record model performance:', error);
      throw error;
    }
  }
}

module.exports = new DataCaptureService();
