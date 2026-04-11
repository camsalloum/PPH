/**
 * Prescriptive Engine
 * 
 * Decision support and "What-If" simulation engine.
 * Recommends specific actions and simulates their outcomes.
 * 
 * Features:
 * - Action recommendations with predicted impact
 * - What-if scenario simulation
 * - Priority-ranked action plans
 * - ROI estimation for proposed actions
 * 
 * @version 1.0
 * @date December 27, 2025
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');
const DivisionLearningService = require('./DivisionLearningService');
const CustomerLearningService = require('./CustomerLearningService');
const SalesRepLearningService = require('./SalesRepLearningService');

class PrescriptiveEngine {
  
  /**
   * Get table prefix for division
   */
  getDivisionPrefix(divisionCode) {
    return divisionCode.toLowerCase().split('-')[0];
  }

  // ===========================================================================
  // ACTION RECOMMENDATIONS
  // ===========================================================================

  /**
   * Generate prioritized action recommendations
   * Combines insights from all learning services
   */
  async generateActionPlan(divisionCode) {
    const actions = [];

    try {
      // 1. Churn prevention actions
      const churnActions = await this.getChurnPreventionActions(divisionCode);
      actions.push(...churnActions);

      // 2. Sales rep optimization actions
      const repActions = await this.getSalesRepActions(divisionCode);
      actions.push(...repActions);

      // 3. Revenue growth actions
      const growthActions = await this.getGrowthActions(divisionCode);
      actions.push(...growthActions);

      // 4. Risk mitigation actions
      const riskActions = await this.getRiskMitigationActions(divisionCode);
      actions.push(...riskActions);

      // Sort by priority and expected impact
      actions.sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return (b.expectedImpact?.revenue || 0) - (a.expectedImpact?.revenue || 0);
      });

      // Store action plan
      await this.storeActionPlan(divisionCode, actions);

      logger.info(`Generated action plan for ${divisionCode}: ${actions.length} actions`);

      return {
        success: true,
        totalActions: actions.length,
        byPriority: {
          critical: actions.filter(a => a.priority === 'critical').length,
          high: actions.filter(a => a.priority === 'high').length,
          medium: actions.filter(a => a.priority === 'medium').length,
          low: actions.filter(a => a.priority === 'low').length
        },
        actions: actions.slice(0, 20),
        estimatedTotalImpact: actions.reduce((sum, a) => sum + (a.expectedImpact?.revenue || 0), 0)
      };

    } catch (error) {
      logger.error('Failed to generate action plan:', error);
      throw error;
    }
  }

  /**
   * Get churn prevention actions
   */
  async getChurnPreventionActions(divisionCode) {
    const actions = [];

    try {
      const highRiskCustomers = await CustomerLearningService.getHighRiskCustomers(divisionCode, 10);
      
      for (const customer of highRiskCustomers) {
        const probability = parseFloat(customer.churn_probability) || 0;
        const estimatedRevenue = parseFloat(customer.estimated_ltv) || 10000;

        actions.push({
          id: `churn_${customer.customer_name}`,
          type: 'churn_prevention',
          priority: probability > 0.8 ? 'critical' : probability > 0.6 ? 'high' : 'medium',
          title: `Prevent churn: ${customer.customer_name}`,
          description: `Customer has ${(probability * 100).toFixed(0)}% churn risk. Immediate outreach recommended.`,
          targetEntity: customer.customer_name,
          expectedImpact: {
            revenue: estimatedRevenue * probability, // Revenue at risk
            metric: 'revenue_preserved',
            confidence: 0.7
          },
          suggestedActions: [
            'Schedule personal visit or call within 7 days',
            'Review recent orders for quality issues',
            'Prepare retention offer or discount',
            'Assign dedicated account manager if none'
          ],
          effort: 'low',
          timeToValue: '1-2 weeks'
        });
      }
    } catch (e) {
      logger.warn('Could not get churn prevention actions:', e.message);
    }

    return actions;
  }

  /**
   * Get sales rep optimization actions
   */
  async getSalesRepActions(divisionCode) {
    const actions = [];

    try {
      const clusters = await SalesRepLearningService.getAllClusters(divisionCode);
      
      // Find underperformers
      const underperformers = clusters.filter(c => c.cluster_name === 'Underperformers');
      for (const rep of underperformers) {
        actions.push({
          id: `coach_${rep.salesrep_name}`,
          type: 'sales_rep_coaching',
          priority: 'high',
          title: `Coach: ${rep.salesrep_name}`,
          description: 'Performance below cluster average. Targeted coaching recommended.',
          targetEntity: rep.salesrep_name,
          expectedImpact: {
            revenue: 50000, // Estimated improvement potential
            metric: 'revenue_increase',
            confidence: 0.5
          },
          suggestedActions: [
            'Schedule weekly 1:1 coaching sessions',
            'Shadow top performer for a week',
            'Review pipeline and conversion rates',
            'Set specific improvement targets'
          ],
          effort: 'medium',
          timeToValue: '1-3 months'
        });
      }

      // Find growth potential reps
      const growthPotential = clusters.filter(c => c.cluster_name === 'Growth Potential');
      for (const rep of growthPotential.slice(0, 3)) {
        actions.push({
          id: `grow_${rep.salesrep_name}`,
          type: 'sales_rep_development',
          priority: 'medium',
          title: `Develop: ${rep.salesrep_name}`,
          description: 'Shows growth potential. Investment in development recommended.',
          targetEntity: rep.salesrep_name,
          expectedImpact: {
            revenue: 30000,
            metric: 'revenue_increase',
            confidence: 0.6
          },
          suggestedActions: [
            'Assign higher-value accounts',
            'Provide advanced sales training',
            'Include in key customer meetings',
            'Set stretch targets with incentives'
          ],
          effort: 'medium',
          timeToValue: '2-4 months'
        });
      }
    } catch (e) {
      logger.warn('Could not get sales rep actions:', e.message);
    }

    return actions;
  }

  /**
   * Get revenue growth actions
   */
  async getGrowthActions(divisionCode) {
    const actions = [];
    const prefix = this.getDivisionPrefix(divisionCode);

    try {
      // Find high-value customers with growth potential
      const growthCustomers = await pool.query(`
        SELECT 
          s.customer_name,
          s.segment_name,
          COALESCE(clv.predicted_ltv, 0) as predicted_ltv
        FROM ${prefix}_customer_segments s
        LEFT JOIN ${prefix}_customer_lifetime_value clv 
          ON s.customer_name = clv.customer_name
        WHERE s.segment_name IN ('Potential Loyalist', 'Champions', 'Loyal')
        ORDER BY clv.predicted_ltv DESC NULLS LAST
        LIMIT 10
      `);

      for (const customer of growthCustomers.rows) {
        const ltv = parseFloat(customer.predicted_ltv) || 20000;
        
        if (customer.segment_name === 'Potential Loyalist') {
          actions.push({
            id: `grow_${customer.customer_name}`,
            type: 'revenue_growth',
            priority: 'medium',
            title: `Cross-sell to ${customer.customer_name}`,
            description: `Potential Loyalist with LTV $${ltv.toFixed(0)}. Expand product portfolio.`,
            targetEntity: customer.customer_name,
            expectedImpact: {
              revenue: ltv * 0.2, // 20% additional revenue
              metric: 'revenue_increase',
              confidence: 0.6
            },
            suggestedActions: [
              'Analyze current product purchases',
              'Identify cross-sell opportunities',
              'Prepare tailored bundle offer',
              'Schedule product introduction meeting'
            ],
            effort: 'medium',
            timeToValue: '1-2 months'
          });
        } else if (customer.segment_name === 'Champions' && ltv > 50000) {
          actions.push({
            id: `expand_${customer.customer_name}`,
            type: 'key_account_expansion',
            priority: 'high',
            title: `Expand: ${customer.customer_name}`,
            description: `Champion customer with high LTV. Strategic expansion opportunity.`,
            targetEntity: customer.customer_name,
            expectedImpact: {
              revenue: ltv * 0.3,
              metric: 'revenue_increase',
              confidence: 0.7
            },
            suggestedActions: [
              'Request annual business review meeting',
              'Explore new business units/locations',
              'Propose volume-based partnership agreement',
              'Involve senior leadership'
            ],
            effort: 'high',
            timeToValue: '3-6 months'
          });
        }
      }
    } catch (e) {
      logger.warn('Could not get growth actions:', e.message);
    }

    return actions;
  }

  /**
   * Get risk mitigation actions
   */
  async getRiskMitigationActions(divisionCode) {
    const actions = [];
    const prefix = this.getDivisionPrefix(divisionCode);

    try {
      // Check customer concentration
      // NOTE: fp_actualcommon uses: customer_name, amount columns
      const concentration = await pool.query(`
        SELECT 
          customer_name,
          SUM(amount) as revenue
        FROM ${prefix}_actualcommon
        WHERE year >= EXTRACT(YEAR FROM CURRENT_DATE) - 1
        GROUP BY customer_name
        ORDER BY revenue DESC
        LIMIT 5
      `);

      const totalRevenue = concentration.rows.reduce((sum, r) => sum + parseFloat(r.revenue || 0), 0);
      const top5Revenue = concentration.rows.slice(0, 5).reduce((sum, r) => sum + parseFloat(r.revenue || 0), 0);
      const top5Pct = totalRevenue > 0 ? (top5Revenue / totalRevenue) * 100 : 0;

      if (top5Pct > 50) {
        actions.push({
          id: 'concentration_risk',
          type: 'risk_mitigation',
          priority: 'high',
          title: 'Reduce Customer Concentration',
          description: `Top 5 customers represent ${top5Pct.toFixed(0)}% of revenue. Diversification needed.`,
          targetEntity: 'portfolio',
          expectedImpact: {
            revenue: 0,
            metric: 'risk_reduction',
            confidence: 0.8
          },
          suggestedActions: [
            'Intensify new customer acquisition',
            'Set max revenue % per customer policy',
            'Develop secondary customers in same segments',
            'Create early warning system for key accounts'
          ],
          effort: 'high',
          timeToValue: '6-12 months'
        });
      }

      // Check single product dependency
      // NOTE: fp_actualcommon uses: pgcombine, amount columns
      const productConcentration = await pool.query(`
        SELECT 
          pgcombine as productgroup,
          SUM(amount) as revenue
        FROM ${prefix}_actualcommon
        WHERE year >= EXTRACT(YEAR FROM CURRENT_DATE) - 1
          AND pgcombine IS NOT NULL
        GROUP BY pgcombine
        ORDER BY revenue DESC
        LIMIT 1
      `);

      if (productConcentration.rows.length > 0) {
        const topProduct = productConcentration.rows[0];
        const topProductPct = totalRevenue > 0 
          ? (parseFloat(topProduct.revenue || 0) / totalRevenue) * 100 
          : 0;

        if (topProductPct > 40) {
          actions.push({
            id: 'product_concentration',
            type: 'risk_mitigation',
            priority: 'medium',
            title: 'Diversify Product Portfolio',
            description: `${topProduct.productgroup} represents ${topProductPct.toFixed(0)}% of revenue.`,
            targetEntity: 'portfolio',
            expectedImpact: {
              revenue: 0,
              metric: 'risk_reduction',
              confidence: 0.7
            },
            suggestedActions: [
              'Promote underperforming product groups',
              'Bundle products to encourage diversification',
              'Train sales team on full portfolio',
              'Set balanced product mix targets'
            ],
            effort: 'medium',
            timeToValue: '3-6 months'
          });
        }
      }
    } catch (e) {
      logger.warn('Could not get risk mitigation actions:', e.message);
    }

    return actions;
  }

  // ===========================================================================
  // WHAT-IF SIMULATION
  // ===========================================================================

  /**
   * Simulate what-if scenarios
   */
  async simulateScenario(divisionCode, scenario) {
    const prefix = this.getDivisionPrefix(divisionCode);

    try {
      // Get baseline metrics
      // NOTE: fp_actualcommon uses: amount, customer_name, qty_kgs columns
      const baseline = await pool.query(`
        SELECT 
          SUM(amount) as revenue,
          COUNT(DISTINCT customer_name) as customers,
          SUM(qty_kgs) as volume
        FROM ${prefix}_actualcommon
        WHERE year = EXTRACT(YEAR FROM CURRENT_DATE)
      `);

      const baseRevenue = parseFloat(baseline.rows[0]?.revenue) || 0;
      const baseCustomers = parseInt(baseline.rows[0]?.customers) || 0;
      const baseVolume = parseFloat(baseline.rows[0]?.volume) || 0;

      let simulatedRevenue = baseRevenue;
      let simulatedCustomers = baseCustomers;
      let simulatedVolume = baseVolume;
      const impacts = [];

      // Apply scenario changes
      if (scenario.priceChange) {
        const priceImpact = (scenario.priceChange / 100) * baseRevenue;
        // Price elasticity: 10% price increase = ~5% volume decrease
        const volumeImpact = -(scenario.priceChange * 0.5 / 100) * baseVolume;
        
        simulatedRevenue += priceImpact;
        simulatedVolume += volumeImpact;
        
        impacts.push({
          factor: 'Price Change',
          change: `${scenario.priceChange > 0 ? '+' : ''}${scenario.priceChange}%`,
          revenueImpact: priceImpact,
          volumeImpact
        });
      }

      if (scenario.customerGrowth) {
        const newCustomerRevenue = (baseRevenue / baseCustomers) * (baseCustomers * scenario.customerGrowth / 100);
        simulatedRevenue += newCustomerRevenue;
        simulatedCustomers += Math.round(baseCustomers * scenario.customerGrowth / 100);
        
        impacts.push({
          factor: 'Customer Growth',
          change: `+${scenario.customerGrowth}%`,
          revenueImpact: newCustomerRevenue,
          customersAdded: Math.round(baseCustomers * scenario.customerGrowth / 100)
        });
      }

      if (scenario.churnReduction) {
        // Assume 10% annual churn baseline
        const baseChurnRate = 0.10;
        const revenuePreserved = baseRevenue * baseChurnRate * (scenario.churnReduction / 100);
        simulatedRevenue += revenuePreserved;
        
        impacts.push({
          factor: 'Churn Reduction',
          change: `-${scenario.churnReduction}% churn rate`,
          revenueImpact: revenuePreserved
        });
      }

      if (scenario.productMixShift) {
        // Shifting to higher margin products
        const marginImpact = baseRevenue * (scenario.productMixShift / 100) * 0.05; // 5% margin per 10% shift
        simulatedRevenue += marginImpact;
        
        impacts.push({
          factor: 'Product Mix Optimization',
          change: `${scenario.productMixShift}% shift to premium`,
          revenueImpact: marginImpact
        });
      }

      const totalImpact = simulatedRevenue - baseRevenue;
      const percentChange = baseRevenue > 0 ? (totalImpact / baseRevenue) * 100 : 0;

      logger.info(`Simulated scenario for ${divisionCode}: ${percentChange.toFixed(1)}% impact`);

      return {
        success: true,
        baseline: {
          revenue: baseRevenue,
          customers: baseCustomers,
          volume: baseVolume
        },
        simulated: {
          revenue: simulatedRevenue,
          customers: simulatedCustomers,
          volume: simulatedVolume
        },
        impacts,
        totalImpact,
        percentChange,
        confidence: 0.6 // Simulation confidence
      };

    } catch (error) {
      logger.error('Failed to simulate scenario:', error);
      throw error;
    }
  }

  // ===========================================================================
  // STORAGE
  // ===========================================================================

  /**
   * Store action plan
   */
  async storeActionPlan(divisionCode, actions) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_action_plans`;

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id SERIAL PRIMARY KEY,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          action_count INTEGER,
          actions JSONB,
          estimated_impact DECIMAL(15,2)
        )
      `);

      await pool.query(`
        INSERT INTO ${table} (action_count, actions, estimated_impact)
        VALUES ($1, $2, $3)
      `, [
        actions.length,
        JSON.stringify(actions.slice(0, 50)),
        actions.reduce((sum, a) => sum + (a.expectedImpact?.revenue || 0), 0)
      ]);

      return { success: true };
    } catch (error) {
      logger.error('Failed to store action plan:', error);
      throw error;
    }
  }

  /**
   * Get latest action plan
   */
  async getLatestActionPlan(divisionCode) {
    const prefix = this.getDivisionPrefix(divisionCode);
    const table = `${prefix}_action_plans`;

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

  // ===========================================================================
  // RUN ALL
  // ===========================================================================

  /**
   * Run full prescriptive analysis
   */
  async runFullAnalysis(divisionCode) {
    const results = {
      actionPlan: null,
      baselineScenario: null
    };

    try {
      results.actionPlan = await this.generateActionPlan(divisionCode);
    } catch (e) {
      results.actionPlan = { success: false, error: e.message };
    }

    try {
      // Run baseline scenario simulation
      results.baselineScenario = await this.simulateScenario(divisionCode, {
        priceChange: 5,
        customerGrowth: 10,
        churnReduction: 20
      });
    } catch (e) {
      results.baselineScenario = { success: false, error: e.message };
    }

    logger.info(`Completed prescriptive analysis for ${divisionCode}`);
    return results;
  }
}

module.exports = new PrescriptiveEngine();
