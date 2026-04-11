/**
 * Customer Learning Service
 * 
 * AI-powered customer analysis and prediction.
 * 
 * Features:
 * - Churn probability prediction
 * - Customer segmentation (K-means style clustering)
 * - Customer lifetime value estimation
 * - Anomaly detection
 * 
 * IMPORTANT: This service reads from behavior history tables
 * which are populated by DataCaptureService using:
 * - Merged customer names (customer merge rules applied)
 * - Canonical sales rep names (alias-resolved)
 * - PGCombine product groups (not raw)
 * 
 * @version 1.1
 * @date December 28, 2025 - Documents data filtering dependency
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

class CustomerLearningService {
  
  /**
   * Get table prefix for division
   */
  getDivisionPrefix(divisionCode) {
    return divisionCode.toLowerCase().split('-')[0];
  }

  // ===========================================================================
  // CHURN PREDICTION
  // ===========================================================================

  /**
   * Calculate churn probability for a customer
   * Uses rule-based scoring with learned weights
   * 
   * Risk factors:
   * - Declining sales trend
   * - Reduced order frequency
   * - Fewer products ordered
   * - Long time since last order
   * - Below historical average
   */
  async predictChurn(divisionCode, customerName) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const historyTable = `${prefix}_customer_behavior_history`;

    try {
      // Get customer's recent history (last 12 months)
      const historyResult = await pool.query(`
        SELECT *
        FROM ${historyTable}
        WHERE customer_name = $1
        ORDER BY year DESC, month DESC
        LIMIT 12
      `, [customerName]);

      if (historyResult.rows.length < 3) {
        return {
          customerName,
          churnProbability: 0.5, // Unknown
          riskLevel: 'UNKNOWN',
          reason: 'Insufficient history'
        };
      }

      const history = historyResult.rows;
      const riskFactors = [];
      let riskScore = 0;

      // Factor 1: Sales trend (compare recent 3 months to previous 3 months)
      if (history.length >= 6) {
        const recent3 = history.slice(0, 3).reduce((sum, r) => sum + parseFloat(r.total_sales), 0);
        const prev3 = history.slice(3, 6).reduce((sum, r) => sum + parseFloat(r.total_sales), 0);
        
        if (prev3 > 0) {
          const salesDecline = (prev3 - recent3) / prev3;
          if (salesDecline > 0.5) {
            riskScore += 0.3;
            riskFactors.push({ factor: 'declining_sales', severity: 'HIGH', value: `${(salesDecline * 100).toFixed(0)}% decline` });
          } else if (salesDecline > 0.25) {
            riskScore += 0.15;
            riskFactors.push({ factor: 'declining_sales', severity: 'MEDIUM', value: `${(salesDecline * 100).toFixed(0)}% decline` });
          } else if (salesDecline > 0.1) {
            riskScore += 0.05;
            riskFactors.push({ factor: 'declining_sales', severity: 'LOW', value: `${(salesDecline * 100).toFixed(0)}% decline` });
          }
        }
      }

      // Factor 2: Volume trend
      if (history.length >= 6) {
        const recent3Vol = history.slice(0, 3).reduce((sum, r) => sum + parseFloat(r.total_volume), 0);
        const prev3Vol = history.slice(3, 6).reduce((sum, r) => sum + parseFloat(r.total_volume), 0);
        
        if (prev3Vol > 0) {
          const volumeDecline = (prev3Vol - recent3Vol) / prev3Vol;
          if (volumeDecline > 0.5) {
            riskScore += 0.2;
            riskFactors.push({ factor: 'declining_volume', severity: 'HIGH', value: `${(volumeDecline * 100).toFixed(0)}% decline` });
          } else if (volumeDecline > 0.25) {
            riskScore += 0.1;
            riskFactors.push({ factor: 'declining_volume', severity: 'MEDIUM', value: `${(volumeDecline * 100).toFixed(0)}% decline` });
          }
        }
      }

      // Factor 3: Product diversity decline
      const recentProducts = history[0]?.product_count || 0;
      const avgProducts = history.reduce((sum, r) => sum + (r.product_count || 0), 0) / history.length;
      if (avgProducts > 0 && recentProducts < avgProducts * 0.5) {
        riskScore += 0.15;
        riskFactors.push({ factor: 'reduced_products', severity: 'MEDIUM', value: `${recentProducts} vs avg ${avgProducts.toFixed(0)}` });
      }

      // Factor 4: Recent activity gap
      const mostRecent = history[0];
      const currentDate = new Date();
      const mostRecentDate = new Date(mostRecent.year, mostRecent.month - 1);
      const monthsGap = (currentDate.getFullYear() - mostRecentDate.getFullYear()) * 12 +
                        (currentDate.getMonth() - mostRecentDate.getMonth());
      
      if (monthsGap >= 3) {
        riskScore += 0.3;
        riskFactors.push({ factor: 'no_recent_orders', severity: 'HIGH', value: `${monthsGap} months inactive` });
      } else if (monthsGap >= 2) {
        riskScore += 0.15;
        riskFactors.push({ factor: 'no_recent_orders', severity: 'MEDIUM', value: `${monthsGap} months inactive` });
      }

      // Factor 5: Below historical average (for longer history)
      if (history.length >= 6) {
        const recentAvg = history.slice(0, 3).reduce((sum, r) => sum + parseFloat(r.total_sales), 0) / 3;
        const historicalAvg = history.reduce((sum, r) => sum + parseFloat(r.total_sales), 0) / history.length;
        
        if (historicalAvg > 0 && recentAvg < historicalAvg * 0.5) {
          riskScore += 0.1;
          riskFactors.push({ factor: 'below_historical', severity: 'MEDIUM', value: `${((recentAvg / historicalAvg) * 100).toFixed(0)}% of historical avg` });
        }
      }

      // Clamp risk score
      const churnProbability = Math.min(1, Math.max(0, riskScore));
      
      // Determine risk level
      let riskLevel = 'LOW';
      if (churnProbability >= 0.7) riskLevel = 'HIGH';
      else if (churnProbability >= 0.4) riskLevel = 'MEDIUM';

      return {
        customerName,
        churnProbability,
        riskLevel,
        riskFactors,
        historyMonths: history.length
      };

    } catch (error) {
      logger.error('Failed to predict churn:', error);
      throw error;
    }
  }

  /**
   * Calculate and store churn predictions for all customers
   */
  async predictAllChurn(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const historyTable = `${prefix}_customer_behavior_history`;
    const churnTable = `${prefix}_customer_churn_predictions`;

    try {
      // Get all unique customers
      const customersResult = await pool.query(`
        SELECT DISTINCT customer_name
        FROM ${historyTable}
        WHERE customer_name IS NOT NULL
      `);

      let predicted = 0;
      let highRisk = 0;
      let mediumRisk = 0;

      for (const row of customersResult.rows) {
        const prediction = await this.predictChurn(divisionCode, row.customer_name);
        
        if (prediction.riskLevel !== 'UNKNOWN') {
          // Store prediction
          await pool.query(`
            INSERT INTO ${churnTable} (
              customer_name, churn_probability, risk_level,
              top_risk_factors, prediction_horizon_days, prediction_date
            ) VALUES ($1, $2, $3, $4, 90, CURRENT_DATE)
            ON CONFLICT (customer_name, prediction_date)
            DO UPDATE SET
              churn_probability = EXCLUDED.churn_probability,
              risk_level = EXCLUDED.risk_level,
              top_risk_factors = EXCLUDED.top_risk_factors,
              predicted_at = CURRENT_TIMESTAMP
          `, [
            prediction.customerName,
            prediction.churnProbability,
            prediction.riskLevel,
            JSON.stringify(prediction.riskFactors)
          ]);

          predicted++;
          if (prediction.riskLevel === 'HIGH') highRisk++;
          else if (prediction.riskLevel === 'MEDIUM') mediumRisk++;
        }
      }

      logger.info(`Predicted churn for ${divisionCode}: ${predicted} customers, ${highRisk} high risk, ${mediumRisk} medium risk`);

      return {
        totalPredicted: predicted,
        highRisk,
        mediumRisk,
        lowRisk: predicted - highRisk - mediumRisk
      };

    } catch (error) {
      logger.error('Failed to predict all churn:', error);
      throw error;
    }
  }

  /**
   * Get high-risk customers
   */
  async getHighRiskCustomers(divisionCode, limit = 20) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const churnTable = `${prefix}_customer_churn_predictions`;

    try {
      // Get latest predictions (regardless of date)
      const result = await pool.query(`
        SELECT 
          customer_name, churn_probability, risk_level,
          top_risk_factors, predicted_at
        FROM ${churnTable}
        WHERE risk_level IN ('HIGH', 'MEDIUM')
        ORDER BY churn_probability DESC
        LIMIT $1
      `, [limit]);

      return result.rows.map(r => ({
        customer_name: r.customer_name,
        churnProbability: parseFloat(r.churn_probability),
        riskLevel: r.risk_level,
        riskFactors: r.top_risk_factors,
        predictedAt: r.predicted_at
      }));

    } catch (error) {
      logger.error('Failed to get high risk customers:', error);
      return [];
    }
  }

  // ===========================================================================
  // CUSTOMER SEGMENTATION (K-Means style)
  // ===========================================================================

  /**
   * Segment customers based on behavior patterns
   * Uses simplified K-means approach
   * 
   * Segments:
   * - Champions: High value, frequent, recent
   * - Loyal: Consistent moderate value
   * - Potential Loyalist: Growing customers
   * - At Risk: Previously good, now declining
   * - Hibernating: Low recent activity
   * - New: Less than 3 months history
   */
  async segmentCustomers(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const historyTable = `${prefix}_customer_behavior_history`;
    const segmentsTable = `${prefix}_customer_segments`;

    try {
      // Calculate RFM-style metrics for each customer
      const rfmResult = await pool.query(`
        WITH customer_stats AS (
          SELECT 
            customer_name,
            COUNT(*) as months_active,
            SUM(total_sales) as total_lifetime_sales,
            AVG(total_sales) as avg_monthly_sales,
            MAX(year * 12 + month) as last_active_month,
            MIN(year * 12 + month) as first_active_month,
            STDDEV(total_sales) as sales_volatility
          FROM ${historyTable}
          WHERE customer_name IS NOT NULL
          GROUP BY customer_name
        ),
        current_month AS (
          SELECT EXTRACT(YEAR FROM CURRENT_DATE) * 12 + EXTRACT(MONTH FROM CURRENT_DATE) as month_num
        )
        SELECT 
          cs.*,
          cm.month_num - cs.last_active_month as months_since_last,
          cs.last_active_month - cs.first_active_month + 1 as tenure_months
        FROM customer_stats cs
        CROSS JOIN current_month cm
      `);

      if (rfmResult.rows.length === 0) {
        return { segmented: 0, segments: {} };
      }

      // Calculate percentiles for normalization
      const allSales = rfmResult.rows.map(r => parseFloat(r.total_lifetime_sales));
      const allFreq = rfmResult.rows.map(r => parseInt(r.months_active));
      
      const salesP75 = this.percentile(allSales, 0.75);
      const salesP50 = this.percentile(allSales, 0.50);
      const salesP25 = this.percentile(allSales, 0.25);
      const freqP50 = this.percentile(allFreq, 0.50);

      const segmentCounts = {
        'Champions': 0,
        'Loyal': 0,
        'Potential Loyalist': 0,
        'At Risk': 0,
        'Hibernating': 0,
        'New': 0
      };

      // Segment each customer
      for (const row of rfmResult.rows) {
        const sales = parseFloat(row.total_lifetime_sales);
        const avgSales = parseFloat(row.avg_monthly_sales);
        const monthsActive = parseInt(row.months_active);
        const monthsSinceLast = parseInt(row.months_since_last);
        const tenure = parseInt(row.tenure_months);

        let segment = 'Loyal';
        let probability = 0.5;

        // Segmentation logic
        if (tenure < 3) {
          segment = 'New';
          probability = 0.8;
        } else if (monthsSinceLast >= 6) {
          segment = 'Hibernating';
          probability = 0.7;
        } else if (monthsSinceLast >= 3 && sales >= salesP50) {
          segment = 'At Risk';
          probability = 0.6;
        } else if (sales >= salesP75 && monthsSinceLast <= 1 && monthsActive >= freqP50) {
          segment = 'Champions';
          probability = 0.85;
        } else if (sales >= salesP50 && monthsActive >= freqP50) {
          segment = 'Loyal';
          probability = 0.7;
        } else if (tenure >= 3 && sales < salesP50 && monthsSinceLast <= 2) {
          segment = 'Potential Loyalist';
          probability = 0.55;
        }

        // Feature vector for future ML
        const featureVector = {
          totalSales: sales,
          avgMonthlySales: avgSales,
          monthsActive,
          monthsSinceLast,
          tenure,
          salesPercentile: sales >= salesP75 ? 4 : sales >= salesP50 ? 3 : sales >= salesP25 ? 2 : 1
        };

        // Store segment
        await pool.query(`
          INSERT INTO ${segmentsTable} (
            customer_name, segment_id, segment_name,
            segment_probability, feature_vector
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (customer_name)
          DO UPDATE SET
            segment_id = EXCLUDED.segment_id,
            segment_name = EXCLUDED.segment_name,
            segment_probability = EXCLUDED.segment_probability,
            feature_vector = EXCLUDED.feature_vector,
            last_segmented = CURRENT_TIMESTAMP
        `, [
          row.customer_name,
          Object.keys(segmentCounts).indexOf(segment) + 1,
          segment,
          probability,
          JSON.stringify(featureVector)
        ]);

        segmentCounts[segment]++;
      }

      logger.info(`Segmented ${rfmResult.rows.length} customers for ${divisionCode}`, segmentCounts);

      return {
        segmented: rfmResult.rows.length,
        segments: segmentCounts
      };

    } catch (error) {
      logger.error('Failed to segment customers:', error);
      throw error;
    }
  }

  /**
   * Calculate percentile
   */
  percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.floor(p * sorted.length);
    return sorted[index] || 0;
  }

  /**
   * Get customers by segment
   */
  async getCustomersBySegment(divisionCode, segmentName, limit = 50) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const segmentsTable = `${prefix}_customer_segments`;
    const historyTable = `${prefix}_customer_behavior_history`;

    try {
      const result = await pool.query(`
        SELECT 
          s.customer_name,
          s.segment_name,
          s.segment_probability,
          s.feature_vector,
          COALESCE(h.total_sales, 0) as recent_sales
        FROM ${segmentsTable} s
        LEFT JOIN LATERAL (
          SELECT SUM(total_sales) as total_sales
          FROM ${historyTable}
          WHERE customer_name = s.customer_name
            AND (year * 12 + month) >= (EXTRACT(YEAR FROM CURRENT_DATE) * 12 + EXTRACT(MONTH FROM CURRENT_DATE) - 3)
        ) h ON TRUE
        WHERE s.segment_name = $1
        ORDER BY h.total_sales DESC NULLS LAST
        LIMIT $2
      `, [segmentName, limit]);

      return result.rows;

    } catch (error) {
      logger.error('Failed to get customers by segment:', error);
      return [];
    }
  }

  // ===========================================================================
  // CUSTOMER LIFETIME VALUE
  // ===========================================================================

  /**
   * Get all customer segments (for dashboard)
   */
  async getAllSegments(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const segmentsTable = `${prefix}_customer_segments`;

    try {
      const result = await pool.query(`
        SELECT 
          customer_name,
          segment_name,
          segment_probability,
          segmented_at
        FROM ${segmentsTable}
        ORDER BY segment_name, customer_name
      `);

      return result.rows;

    } catch (error) {
      logger.error('Failed to get all segments:', error);
      return [];
    }
  }

  /**
   * Calculate customer lifetime value prediction
   */
  async calculateCLV(divisionCode, customerName) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const historyTable = `${prefix}_customer_behavior_history`;

    try {
      const result = await pool.query(`
        SELECT 
          COUNT(*) as months_active,
          SUM(total_sales) as total_sales,
          AVG(total_sales) as avg_monthly,
          MIN(year * 12 + month) as first_month,
          MAX(year * 12 + month) as last_month
        FROM ${historyTable}
        WHERE customer_name = $1
      `, [customerName]);

      const stats = result.rows[0];
      const monthsActive = parseInt(stats.months_active) || 0;
      
      if (monthsActive < 3) {
        return { clv: 0, confidence: 'LOW', reason: 'Insufficient history' };
      }

      const avgMonthly = parseFloat(stats.avg_monthly) || 0;
      const tenure = parseInt(stats.last_month) - parseInt(stats.first_month) + 1;
      
      // Simple CLV: Average monthly × expected remaining lifetime
      // Assuming 24-month projection with retention decay
      const projectionMonths = 24;
      const retentionRate = Math.min(0.95, monthsActive / tenure); // Infer from activity
      
      let clv = 0;
      for (let m = 1; m <= projectionMonths; m++) {
        clv += avgMonthly * Math.pow(retentionRate, m);
      }

      // Confidence bands
      const clvLow = clv * 0.7;
      const clvHigh = clv * 1.3;

      return {
        customerName,
        predictedCLV: clv,
        clvLow,
        clvHigh,
        avgMonthlyValue: avgMonthly,
        customerAgeMonths: tenure,
        impliedRetentionRate: retentionRate,
        confidence: tenure >= 12 ? 'HIGH' : tenure >= 6 ? 'MEDIUM' : 'LOW'
      };

    } catch (error) {
      logger.error('Failed to calculate CLV:', error);
      throw error;
    }
  }

  /**
   * Calculate and store CLV for all customers
   */
  async calculateAllCLV(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const historyTable = `${prefix}_customer_behavior_history`;
    const clvTable = `${prefix}_customer_lifetime_value`;

    try {
      const customersResult = await pool.query(`
        SELECT DISTINCT customer_name
        FROM ${historyTable}
        WHERE customer_name IS NOT NULL
      `);

      let calculated = 0;
      for (const row of customersResult.rows) {
        const clv = await this.calculateCLV(divisionCode, row.customer_name);
        
        if (clv.predictedCLV > 0) {
          await pool.query(`
            INSERT INTO ${clvTable} (
              customer_name, predicted_clv,
              clv_confidence_low, clv_confidence_high,
              customer_age_months, avg_monthly_value, growth_rate
            ) VALUES ($1, $2, $3, $4, $5, $6, 0)
            ON CONFLICT (customer_name) DO UPDATE SET
              predicted_clv = EXCLUDED.predicted_clv,
              clv_confidence_low = EXCLUDED.clv_confidence_low,
              clv_confidence_high = EXCLUDED.clv_confidence_high,
              customer_age_months = EXCLUDED.customer_age_months,
              avg_monthly_value = EXCLUDED.avg_monthly_value,
              calculated_at = CURRENT_TIMESTAMP
          `, [
            row.customer_name,
            clv.predictedCLV,
            clv.clvLow,
            clv.clvHigh,
            clv.customerAgeMonths,
            clv.avgMonthlyValue
          ]);
          calculated++;
        }
      }

      logger.info(`Calculated CLV for ${calculated} customers in ${divisionCode}`);
      return { calculated };

    } catch (error) {
      logger.error('Failed to calculate all CLV:', error);
      throw error;
    }
  }

  // ===========================================================================
  // ANOMALY DETECTION
  // ===========================================================================

  /**
   * Detect anomalies in customer behavior
   */
  async detectAnomalies(divisionCode, year, month) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const historyTable = `${prefix}_customer_behavior_history`;
    const anomaliesTable = `${prefix}_customer_anomalies`;

    try {
      // Find customers with significant deviations from their normal
      const anomalyResult = await pool.query(`
        WITH customer_stats AS (
          SELECT 
            customer_name,
            AVG(total_sales) as avg_sales,
            STDDEV(total_sales) as stddev_sales,
            AVG(total_volume) as avg_volume,
            STDDEV(total_volume) as stddev_volume
          FROM ${historyTable}
          WHERE (year * 12 + month) < ($1 * 12 + $2)
          GROUP BY customer_name
          HAVING COUNT(*) >= 3
        ),
        current_data AS (
          SELECT customer_name, total_sales, total_volume
          FROM ${historyTable}
          WHERE year = $1 AND month = $2
        )
        SELECT 
          cd.customer_name,
          cd.total_sales as actual_sales,
          cs.avg_sales as expected_sales,
          cs.stddev_sales,
          cd.total_volume as actual_volume,
          cs.avg_volume as expected_volume,
          (cd.total_sales - cs.avg_sales) / NULLIF(cs.stddev_sales, 0) as z_score_sales,
          (cd.total_volume - cs.avg_volume) / NULLIF(cs.stddev_volume, 0) as z_score_volume
        FROM current_data cd
        JOIN customer_stats cs ON cd.customer_name = cs.customer_name
        WHERE ABS((cd.total_sales - cs.avg_sales) / NULLIF(cs.stddev_sales, 0)) > 2
           OR ABS((cd.total_volume - cs.avg_volume) / NULLIF(cs.stddev_volume, 0)) > 2
      `, [year, month]);

      let detected = 0;
      for (const row of anomalyResult.rows) {
        const zScoreSales = parseFloat(row.z_score_sales) || 0;
        const zScoreVolume = parseFloat(row.z_score_volume) || 0;

        // Determine anomaly type
        let anomalyType = 'unusual_activity';
        if (zScoreSales > 2) anomalyType = 'sales_spike';
        else if (zScoreSales < -2) anomalyType = 'sales_drop';
        else if (zScoreVolume > 2) anomalyType = 'volume_spike';
        else if (zScoreVolume < -2) anomalyType = 'volume_drop';

        // Severity
        const maxZ = Math.max(Math.abs(zScoreSales), Math.abs(zScoreVolume));
        const severity = maxZ > 3 ? 'HIGH' : maxZ > 2.5 ? 'MEDIUM' : 'LOW';

        // Deviation percentage
        const deviationPct = parseFloat(row.expected_sales) > 0
          ? ((parseFloat(row.actual_sales) - parseFloat(row.expected_sales)) / parseFloat(row.expected_sales)) * 100
          : 0;

        await pool.query(`
          INSERT INTO ${anomaliesTable} (
            customer_name, anomaly_type, anomaly_severity,
            expected_value, actual_value, deviation_pct
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          row.customer_name,
          anomalyType,
          severity,
          row.expected_sales,
          row.actual_sales,
          deviationPct
        ]);

        detected++;
      }

      logger.info(`Detected ${detected} anomalies for ${divisionCode} ${year}-${month}`);
      return { detected, anomalies: anomalyResult.rows };

    } catch (error) {
      logger.error('Failed to detect anomalies:', error);
      throw error;
    }
  }

  // ===========================================================================
  // LEARNING ORCHESTRATION
  // ===========================================================================

  /**
   * Run all customer learning processes
   */
  async runAllLearning(divisionCode) {
    logger.info(`Starting customer learning cycle for ${divisionCode}`);

    const results = {
      churn: null,
      segmentation: null,
      clv: null,
      anomalies: null
    };

    try {
      results.churn = await this.predictAllChurn(divisionCode);
    } catch (error) {
      logger.error('Churn prediction failed:', error);
      results.churn = { error: error.message };
    }

    try {
      results.segmentation = await this.segmentCustomers(divisionCode);
    } catch (error) {
      logger.error('Segmentation failed:', error);
      results.segmentation = { error: error.message };
    }

    try {
      results.clv = await this.calculateAllCLV(divisionCode);
    } catch (error) {
      logger.error('CLV calculation failed:', error);
      results.clv = { error: error.message };
    }

    // Anomaly detection for current month
    const now = new Date();
    try {
      results.anomalies = await this.detectAnomalies(divisionCode, now.getFullYear(), now.getMonth() + 1);
    } catch (error) {
      logger.error('Anomaly detection failed:', error);
      results.anomalies = { error: error.message };
    }

    logger.info(`Completed customer learning cycle for ${divisionCode}`, results);
    return results;
  }
}

module.exports = new CustomerLearningService();
