/**
 * Sales Rep Learning Service
 * 
 * AI-powered sales rep analysis and coaching recommendations.
 * 
 * Features:
 * - Sales rep clustering (performance groups)
 * - Strength/weakness pattern detection
 * - Coaching recommendation generation
 * - Performance prediction
 * 
 * IMPORTANT: This service reads from behavior history tables
 * which are populated by DataCaptureService using:
 * - Canonical sales rep names (alias-resolved)
 * - PGCombine product groups (not raw)
 * - Merged customer names
 * 
 * @version 1.1
 * @date December 28, 2025 - Documents data filtering dependency
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

class SalesRepLearningService {
  
  /**
   * Get table prefix for division
   */
  getDivisionPrefix(divisionCode) {
    return divisionCode.toLowerCase().split('-')[0];
  }

  // ===========================================================================
  // SALES REP CLUSTERING
  // ===========================================================================

  /**
   * Cluster sales reps by performance patterns
   * 
   * Clusters:
   * - Star Performers: Top quartile, consistent high performance
   * - Consistent Achievers: Meet targets regularly
   * - Growth Potential: Improving trend but not yet top tier
   * - Underperformers: Below targets, declining
   * - New/Establishing: Less than 6 months history
   */
  async clusterSalesReps(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const historyTable = `${prefix}_salesrep_behavior_history`;
    const clustersTable = `${prefix}_salesrep_clusters`;

    try {
      // Calculate performance metrics for each rep
      const metricsResult = await pool.query(`
        WITH rep_stats AS (
          SELECT 
            salesrep_name,
            COUNT(*) as months_active,
            SUM(total_sales) as total_sales,
            AVG(total_sales) as avg_monthly_sales,
            AVG(budget_achievement_pct) as avg_budget_achievement,
            STDDEV(total_sales) as sales_volatility,
            AVG(customer_count) as avg_customers,
            AVG(new_customer_count) as avg_new_customers,
            SUM(lost_customer_count) as total_lost_customers
          FROM ${historyTable}
          WHERE salesrep_name IS NOT NULL
          GROUP BY salesrep_name
        ),
        recent_trend AS (
          SELECT 
            salesrep_name,
            AVG(total_sales) as recent_avg
          FROM ${historyTable}
          WHERE (year * 12 + month) >= (EXTRACT(YEAR FROM CURRENT_DATE) * 12 + EXTRACT(MONTH FROM CURRENT_DATE) - 3)
          GROUP BY salesrep_name
        )
        SELECT 
          rs.*,
          COALESCE(rt.recent_avg, 0) as recent_avg,
          CASE WHEN rs.avg_monthly_sales > 0 
            THEN (COALESCE(rt.recent_avg, 0) - rs.avg_monthly_sales) / rs.avg_monthly_sales * 100 
            ELSE 0 
          END as trend_pct
        FROM rep_stats rs
        LEFT JOIN recent_trend rt ON rs.salesrep_name = rt.salesrep_name
      `);

      if (metricsResult.rows.length === 0) {
        return { clustered: 0, clusters: {} };
      }

      // Calculate percentiles
      const allSales = metricsResult.rows.map(r => parseFloat(r.avg_monthly_sales) || 0);
      const allBudget = metricsResult.rows.map(r => parseFloat(r.avg_budget_achievement) || 0);
      
      const salesP75 = this.percentile(allSales, 0.75);
      const salesP50 = this.percentile(allSales, 0.50);
      const salesP25 = this.percentile(allSales, 0.25);
      const budgetP75 = this.percentile(allBudget, 0.75);

      const clusterCounts = {
        'Star Performers': 0,
        'Consistent Achievers': 0,
        'Growth Potential': 0,
        'Underperformers': 0,
        'New/Establishing': 0
      };

      for (const row of metricsResult.rows) {
        const avgSales = parseFloat(row.avg_monthly_sales) || 0;
        const budgetAchiev = parseFloat(row.avg_budget_achievement) || 0;
        const monthsActive = parseInt(row.months_active) || 0;
        const volatility = parseFloat(row.sales_volatility) || 0;
        const trend = parseFloat(row.trend_pct) || 0;

        let cluster = 'Consistent Achievers';
        let similarity = 0.5;

        // Clustering logic
        if (monthsActive < 6) {
          cluster = 'New/Establishing';
          similarity = 0.7;
        } else if (avgSales >= salesP75 && budgetAchiev >= budgetP75) {
          cluster = 'Star Performers';
          similarity = 0.85;
        } else if (budgetAchiev >= 90 || avgSales >= salesP50) {
          cluster = 'Consistent Achievers';
          similarity = 0.7;
        } else if (trend > 10 || avgSales >= salesP25) {
          cluster = 'Growth Potential';
          similarity = 0.6;
        } else {
          cluster = 'Underperformers';
          similarity = 0.65;
        }

        // Feature vector
        const featureVector = {
          avgMonthlySales: avgSales,
          budgetAchievement: budgetAchiev,
          monthsActive,
          volatility,
          trend,
          avgCustomers: parseFloat(row.avg_customers) || 0,
          newCustomerRate: parseFloat(row.avg_new_customers) || 0,
          salesPercentile: avgSales >= salesP75 ? 4 : avgSales >= salesP50 ? 3 : avgSales >= salesP25 ? 2 : 1
        };

        // Store cluster assignment
        await pool.query(`
          INSERT INTO ${clustersTable} (
            salesrep_name, cluster_id, cluster_name,
            similarity_score, feature_vector
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (salesrep_name)
          DO UPDATE SET
            cluster_id = EXCLUDED.cluster_id,
            cluster_name = EXCLUDED.cluster_name,
            similarity_score = EXCLUDED.similarity_score,
            feature_vector = EXCLUDED.feature_vector,
            last_clustered = CURRENT_TIMESTAMP
        `, [
          row.salesrep_name,
          Object.keys(clusterCounts).indexOf(cluster) + 1,
          cluster,
          similarity,
          JSON.stringify(featureVector)
        ]);

        clusterCounts[cluster]++;
      }

      logger.info(`Clustered ${metricsResult.rows.length} sales reps for ${divisionCode}`, clusterCounts);

      return {
        clustered: metricsResult.rows.length,
        clusters: clusterCounts
      };

    } catch (error) {
      logger.error('Failed to cluster sales reps:', error);
      throw error;
    }
  }

  percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.floor(p * sorted.length);
    return sorted[index] || 0;
  }

  // ===========================================================================
  // PATTERN LEARNING (Strengths/Weaknesses)
  // ===========================================================================

  /**
   * Learn patterns for a sales rep (strengths and weaknesses)
   */
  async learnPatterns(divisionCode, salesrepName) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const historyTable = `${prefix}_salesrep_behavior_history`;
    const dataTable = `${prefix}_actualcommon`;
    const patternsTable = `${prefix}_salesrep_learned_patterns`;

    try {
      // Get rep's history
      const historyResult = await pool.query(`
        SELECT * FROM ${historyTable}
        WHERE salesrep_name = $1
        ORDER BY year DESC, month DESC
      `, [salesrepName]);

      if (historyResult.rows.length < 6) {
        return { patterns: [], reason: 'Insufficient history' };
      }

      const history = historyResult.rows;
      const patterns = [];

      // Pattern 1: Customer retention ability
      const totalNew = history.reduce((sum, r) => sum + (parseInt(r.new_customer_count) || 0), 0);
      const totalLost = history.reduce((sum, r) => sum + (parseInt(r.lost_customer_count) || 0), 0);
      const retentionRatio = totalNew > 0 ? (totalNew - totalLost) / totalNew : 0;
      
      if (retentionRatio > 0.5) {
        patterns.push({
          type: 'strength',
          key: 'customer_retention',
          value: retentionRatio,
          confidence: Math.min(1, history.length / 12)
        });
      } else if (retentionRatio < 0) {
        patterns.push({
          type: 'weakness',
          key: 'customer_retention',
          value: retentionRatio,
          confidence: Math.min(1, history.length / 12)
        });
      }

      // Pattern 2: Consistency
      const avgSales = history.reduce((sum, r) => sum + parseFloat(r.total_sales), 0) / history.length;
      const variance = history.reduce((sum, r) => sum + Math.pow(parseFloat(r.total_sales) - avgSales, 2), 0) / history.length;
      const cv = avgSales > 0 ? Math.sqrt(variance) / avgSales : 0; // Coefficient of variation
      
      if (cv < 0.2) {
        patterns.push({
          type: 'strength',
          key: 'consistency',
          value: 1 - cv,
          confidence: 0.7
        });
      } else if (cv > 0.5) {
        patterns.push({
          type: 'weakness',
          key: 'consistency',
          value: cv,
          confidence: 0.7
        });
      }

      // Pattern 3: Budget achievement tendency
      const avgBudgetAchiev = history.reduce((sum, r) => sum + (parseFloat(r.budget_achievement_pct) || 0), 0) / history.length;
      
      if (avgBudgetAchiev >= 100) {
        patterns.push({
          type: 'strength',
          key: 'budget_achievement',
          value: avgBudgetAchiev,
          confidence: 0.8
        });
      } else if (avgBudgetAchiev < 80) {
        patterns.push({
          type: 'weakness',
          key: 'budget_achievement',
          value: avgBudgetAchiev,
          confidence: 0.8
        });
      }

      // Pattern 4: Growth trend
      if (history.length >= 6) {
        const recent3 = history.slice(0, 3).reduce((sum, r) => sum + parseFloat(r.total_sales), 0);
        const older3 = history.slice(3, 6).reduce((sum, r) => sum + parseFloat(r.total_sales), 0);
        const growthTrend = older3 > 0 ? (recent3 - older3) / older3 : 0;
        
        if (growthTrend > 0.15) {
          patterns.push({
            type: 'strength',
            key: 'growth_trend',
            value: growthTrend,
            confidence: 0.6
          });
        } else if (growthTrend < -0.15) {
          patterns.push({
            type: 'weakness',
            key: 'declining_trend',
            value: growthTrend,
            confidence: 0.6
          });
        }
      }

      // Store patterns
      for (const pattern of patterns) {
        await pool.query(`
          INSERT INTO ${patternsTable} (
            salesrep_name, pattern_type, pattern_key,
            pattern_value, confidence, samples_used
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (salesrep_name, pattern_type, pattern_key)
          DO UPDATE SET
            pattern_value = EXCLUDED.pattern_value,
            confidence = EXCLUDED.confidence,
            samples_used = EXCLUDED.samples_used,
            last_updated = CURRENT_TIMESTAMP
        `, [
          salesrepName,
          pattern.type,
          pattern.key,
          pattern.value,
          pattern.confidence,
          history.length
        ]);
      }

      return { patterns };

    } catch (error) {
      logger.error('Failed to learn patterns:', error);
      throw error;
    }
  }

  /**
   * Learn patterns for all sales reps
   */
  async learnAllPatterns(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const historyTable = `${prefix}_salesrep_behavior_history`;

    try {
      const repsResult = await pool.query(`
        SELECT DISTINCT salesrep_name
        FROM ${historyTable}
        WHERE salesrep_name IS NOT NULL
      `);

      let learned = 0;
      for (const row of repsResult.rows) {
        const result = await this.learnPatterns(divisionCode, row.salesrep_name);
        if (result.patterns && result.patterns.length > 0) {
          learned++;
        }
      }

      logger.info(`Learned patterns for ${learned} sales reps in ${divisionCode}`);
      return { learned };

    } catch (error) {
      logger.error('Failed to learn all patterns:', error);
      throw error;
    }
  }

  // ===========================================================================
  // COACHING RECOMMENDATIONS
  // ===========================================================================

  /**
   * Generate coaching recommendations for a sales rep
   */
  async generateCoachingRecommendations(divisionCode, salesrepName) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const patternsTable = `${prefix}_salesrep_learned_patterns`;
    const clustersTable = `${prefix}_salesrep_clusters`;
    const coachingTable = `${prefix}_salesrep_coaching_history`;

    try {
      // Get patterns
      const patternsResult = await pool.query(`
        SELECT * FROM ${patternsTable}
        WHERE salesrep_name = $1
        ORDER BY pattern_type, confidence DESC
      `, [salesrepName]);

      // Get cluster
      const clusterResult = await pool.query(`
        SELECT * FROM ${clustersTable}
        WHERE salesrep_name = $1
      `, [salesrepName]);

      const patterns = patternsResult.rows;
      const cluster = clusterResult.rows[0];
      const recommendations = [];

      // Generate recommendations based on weaknesses
      const weaknesses = patterns.filter(p => p.pattern_type === 'weakness');
      
      for (const weakness of weaknesses) {
        let recommendation = null;
        let priority = 5;

        switch (weakness.pattern_key) {
          case 'customer_retention':
            recommendation = 'Focus on customer relationship building. Consider scheduling regular check-ins with existing customers and implementing a structured follow-up process.';
            priority = 8;
            break;
          case 'consistency':
            recommendation = 'Work on sales pipeline management to achieve more consistent monthly results. Consider weekly activity targets to maintain momentum throughout the month.';
            priority = 6;
            break;
          case 'budget_achievement':
            recommendation = 'Review budget targets and create an action plan to close the gap. Focus on higher-value opportunities and upselling to existing customers.';
            priority = 9;
            break;
          case 'declining_trend':
            recommendation = 'Analyze recent performance decline. Identify lost accounts and market changes. Consider territory review and new customer acquisition strategies.';
            priority = 10;
            break;
        }

        if (recommendation) {
          recommendations.push({
            text: recommendation,
            type: weakness.pattern_key,
            priority,
            basedOn: weakness
          });
        }
      }

      // Cluster-based recommendations
      if (cluster) {
        switch (cluster.cluster_name) {
          case 'Growth Potential':
            recommendations.push({
              text: 'You show promising growth trends. Focus on scaling your successful strategies and consider mentorship from top performers.',
              type: 'cluster_coaching',
              priority: 4
            });
            break;
          case 'Underperformers':
            recommendations.push({
              text: 'Performance improvement needed. Request additional training and consider shadowing a Star Performer to learn best practices.',
              type: 'cluster_coaching',
              priority: 9
            });
            break;
          case 'New/Establishing':
            recommendations.push({
              text: 'As a new team member, focus on learning the product portfolio and building customer relationships. Pair with experienced reps for onboarding.',
              type: 'cluster_coaching',
              priority: 5
            });
            break;
        }
      }

      // Store recommendations
      for (const rec of recommendations) {
        await pool.query(`
          INSERT INTO ${coachingTable} (
            salesrep_name, recommendation_text, recommendation_type, priority
          ) VALUES ($1, $2, $3, $4)
        `, [
          salesrepName,
          rec.text,
          rec.type,
          rec.priority
        ]);
      }

      return { recommendations };

    } catch (error) {
      logger.error('Failed to generate coaching recommendations:', error);
      throw error;
    }
  }

  // ===========================================================================
  // SALES REP PROFILE
  // ===========================================================================

  /**
   * Get comprehensive sales rep profile
   */
  async getRepProfile(divisionCode, salesrepName) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const historyTable = `${prefix}_salesrep_behavior_history`;
    const patternsTable = `${prefix}_salesrep_learned_patterns`;
    const clustersTable = `${prefix}_salesrep_clusters`;
    const coachingTable = `${prefix}_salesrep_coaching_history`;

    try {
      // Get history summary
      const historyResult = await pool.query(`
        SELECT 
          COUNT(*) as months_active,
          SUM(total_sales) as total_sales,
          AVG(total_sales) as avg_monthly,
          AVG(budget_achievement_pct) as avg_budget_achievement,
          SUM(customer_count) as total_customers_served,
          SUM(new_customer_count) as total_new_customers,
          SUM(lost_customer_count) as total_lost_customers
        FROM ${historyTable}
        WHERE salesrep_name = $1
      `, [salesrepName]);

      // Get patterns
      const patternsResult = await pool.query(`
        SELECT * FROM ${patternsTable}
        WHERE salesrep_name = $1
        ORDER BY pattern_type, confidence DESC
      `, [salesrepName]);

      // Get cluster
      const clusterResult = await pool.query(`
        SELECT * FROM ${clustersTable}
        WHERE salesrep_name = $1
      `, [salesrepName]);

      // Get recent coaching
      const coachingResult = await pool.query(`
        SELECT * FROM ${coachingTable}
        WHERE salesrep_name = $1
        ORDER BY created_at DESC
        LIMIT 5
      `, [salesrepName]);

      const history = historyResult.rows[0];
      const patterns = patternsResult.rows;
      const cluster = clusterResult.rows[0];
      const coaching = coachingResult.rows;

      return {
        salesrepName,
        summary: {
          monthsActive: parseInt(history.months_active) || 0,
          totalSales: parseFloat(history.total_sales) || 0,
          avgMonthlySales: parseFloat(history.avg_monthly) || 0,
          avgBudgetAchievement: parseFloat(history.avg_budget_achievement) || 0,
          customersServed: parseInt(history.total_customers_served) || 0,
          newCustomers: parseInt(history.total_new_customers) || 0,
          lostCustomers: parseInt(history.total_lost_customers) || 0
        },
        cluster: cluster ? {
          name: cluster.cluster_name,
          similarity: parseFloat(cluster.similarity_score),
          features: cluster.feature_vector
        } : null,
        strengths: patterns.filter(p => p.pattern_type === 'strength').map(p => ({
          key: p.pattern_key,
          value: parseFloat(p.pattern_value),
          confidence: parseFloat(p.confidence)
        })),
        weaknesses: patterns.filter(p => p.pattern_type === 'weakness').map(p => ({
          key: p.pattern_key,
          value: parseFloat(p.pattern_value),
          confidence: parseFloat(p.confidence)
        })),
        recentCoaching: coaching.map(c => ({
          recommendation: c.recommendation_text,
          type: c.recommendation_type,
          priority: c.priority,
          wasFollowed: c.was_followed,
          outcomePositive: c.outcome_positive,
          createdAt: c.created_at
        }))
      };

    } catch (error) {
      logger.error('Failed to get rep profile:', error);
      throw error;
    }
  }

  // ===========================================================================
  // LEARNING ORCHESTRATION
  // ===========================================================================

  /**
   * Run all sales rep learning processes
   */
  async runAllLearning(divisionCode) {
    logger.info(`Starting sales rep learning cycle for ${divisionCode}`);

    const results = {
      clustering: null,
      patterns: null
    };

    try {
      results.clustering = await this.clusterSalesReps(divisionCode);
    } catch (error) {
      logger.error('Clustering failed:', error);
      results.clustering = { error: error.message };
    }

    try {
      results.patterns = await this.learnAllPatterns(divisionCode);
    } catch (error) {
      logger.error('Pattern learning failed:', error);
      results.patterns = { error: error.message };
    }

    logger.info(`Completed sales rep learning cycle for ${divisionCode}`, results);
    return results;
  }

  // ===========================================================================
  // DATA ACCESS METHODS
  // ===========================================================================

  /**
   * Get all sales rep clusters for a division
   * @returns {Array} Array of { salesrep_name, cluster_id, cluster_name, similarity_score }
   */
  async getAllClusters(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_salesrep_clusters`;

    try {
      const result = await pool.query(`
        SELECT salesrep_name, cluster_id, cluster_name, similarity_score, last_clustered
        FROM ${table}
        ORDER BY cluster_name, salesrep_name
      `);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get clusters:', error);
      return [];
    }
  }

  /**
   * Get cluster summary with counts
   */
  async getClusterSummary(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_salesrep_clusters`;

    try {
      const result = await pool.query(`
        SELECT cluster_name, COUNT(*) as rep_count
        FROM ${table}
        GROUP BY cluster_name
        ORDER BY rep_count DESC
      `);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get cluster summary:', error);
      return [];
    }
  }
}

module.exports = new SalesRepLearningService();
