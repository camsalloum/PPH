/**
 * Division Report AI Service
 * Aggregates all division data and generates AI-powered comprehensive analysis
 * 
 * This service is the core engine that transforms raw data into intelligent insights
 * for the AI-powered comprehensive division report.
 * 
 * Enhanced with AI Learning Platform integration for:
 * - Learned seasonality patterns
 * - Customer churn predictions
 * - Customer segmentation
 * - Sales rep clustering insights
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

// Import learning services for enhanced insights
let DivisionLearningService, CustomerLearningService, SalesRepLearningService;
try {
  DivisionLearningService = require('./DivisionLearningService');
  CustomerLearningService = require('./CustomerLearningService');
  SalesRepLearningService = require('./SalesRepLearningService');
} catch (e) {
  logger.warn('Learning services not available, running without AI learning enhancements');
}

// Month name to number mapping
const MONTH_TO_NUMBER = {
  'January': 1, 'February': 2, 'March': 3, 'April': 4,
  'May': 5, 'June': 6, 'July': 7, 'August': 8,
  'September': 9, 'October': 10, 'November': 11, 'December': 12
};

// Number to month name mapping
const NUMBER_TO_MONTH = {
  1: 'January', 2: 'February', 3: 'March', 4: 'April',
  5: 'May', 6: 'June', 7: 'July', 8: 'August',
  9: 'September', 10: 'October', 11: 'November', 12: 'December'
};

// Convert month names to numbers for queries (for data_excel and budget tables)
function monthNamesToNumbers(months) {
  if (!months || !Array.isArray(months)) return [];
  return months.map(m => MONTH_TO_NUMBER[m] || parseInt(m)).filter(n => n > 0);
}

// Ensure months are in text format for PL queries
function ensureMonthNames(months) {
  if (!months || !Array.isArray(months)) return [];
  return months.map(m => {
    if (typeof m === 'number') return NUMBER_TO_MONTH[m];
    if (typeof m === 'string' && !isNaN(parseInt(m))) return NUMBER_TO_MONTH[parseInt(m)];
    return m; // Already a month name
  }).filter(Boolean);
}

class DivisionReportAIService {
  
  /**
   * Validate division code
   */
  validateDivisionCode(divisionCode) {
    if (!divisionCode || typeof divisionCode !== 'string') {
      throw new Error('Division code is required');
    }
    const normalized = divisionCode.trim().toUpperCase();
    if (!/^[A-Z0-9_]{1,10}$/.test(normalized)) {
      throw new Error(`Invalid division code: ${divisionCode}`);
    }
    return normalized;
  }

  /**
   * Get table names for a division
   */
  getTableNames(divisionCode) {
    const div = divisionCode.toLowerCase();
    return {
      data: `${div}_actualcommon`,
      pl: `${div}_pl_data`,
      budget: `${div}_budget_unified`,
      mergeRules: `${div}_division_customer_merge_rules`,
      aiReports: `${div}_ai_reports`,
      aiFeedback: `${div}_ai_report_feedback`
    };
  }

  /**
   * Main entry point: Generate comprehensive AI report
   * @param {string} divisionCode - Division code (e.g., 'FP')
   * @param {object} periods - { basePeriod: { year, months, type }, compPeriod: { year, months, type } }
   * @param {object} options - Additional options
   * @returns {object} Complete AI-generated report
   */
  async generateComprehensiveReport(divisionCode, periods, options = {}) {
    const startTime = Date.now();
    divisionCode = this.validateDivisionCode(divisionCode);
    
    logger.info(`Generating comprehensive AI report for ${divisionCode}`, { periods, options });

    try {
      // Step 1: Aggregate all data
      const aggregatedData = await this.aggregateAllData(divisionCode, periods);

      // Get division name dynamically
      const divisionName = await this.getDivisionName(divisionCode);

      // Step 2: Generate all analysis sections
      const report = {
        metadata: {
          division: divisionCode,
          divisionName: divisionName,
          generatedAt: new Date().toISOString(),
          periods: periods,
          generationTimeMs: 0
        },
        
        // Executive summary with health score
        executiveSummary: await this.buildExecutiveSummary(aggregatedData, divisionCode),
        
        // P&L Deep Dive
        plAnalysis: await this.analyzePL(aggregatedData),
        
        // Sales Rep Evaluation
        salesRepEvaluation: await this.evaluateSalesReps(aggregatedData),
        
        // Customer Insights
        customerInsights: await this.analyzeCustomers(aggregatedData),
        
        // Product Performance
        productPerformance: await this.analyzeProducts(aggregatedData),
        
        // Budget Tracking
        budgetTracking: await this.analyzeBudgetAchievement(aggregatedData),
        
        // Geographic Analysis
        geographicAnalysis: await this.analyzeGeography(aggregatedData),
        
        // Risk Alerts
        riskAlerts: await this.identifyRisks(aggregatedData),
        
        // AI Recommendations
        recommendations: await this.generateRecommendations(aggregatedData),
        
        // Confidence scores for each section
        confidenceScores: {}
      };

      // Calculate overall confidence
      report.confidenceScores = this.calculateConfidenceScores(report);
      report.metadata.generationTimeMs = Date.now() - startTime;

      logger.info(`AI report generated successfully for ${divisionCode}`, {
        generationTimeMs: report.metadata.generationTimeMs,
        healthScore: report.executiveSummary?.healthScore
      });

      return report;

    } catch (error) {
      logger.error(`Error generating AI report for ${divisionCode}:`, error);
      throw error;
    }
  }

  /**
   * Aggregate all division data from multiple sources
   */
  async aggregateAllData(divisionCode, periods) {
    const tables = this.getTableNames(divisionCode);
    const { basePeriod, compPeriod } = periods;

    // Parallel fetch all data sources
    const [
      plData,
      salesData,
      budgetData,
      mergeRules
    ] = await Promise.all([
      this.fetchPLData(divisionCode, basePeriod),
      this.fetchSalesData(divisionCode, basePeriod),
      this.fetchBudgetData(divisionCode, basePeriod),
      this.fetchMergeRules(divisionCode)
    ]);

    // Fetch comparison period data if specified
    let compPLData = null;
    let compSalesData = null;
    if (compPeriod) {
      [compPLData, compSalesData] = await Promise.all([
        this.fetchPLData(divisionCode, compPeriod),
        this.fetchSalesData(divisionCode, compPeriod)
      ]);
    }

    return {
      basePeriod,
      compPeriod,
      pl: { base: plData, comp: compPLData },
      sales: { base: salesData, comp: compSalesData },
      budget: budgetData,
      mergeRules,
      divisionCode
    };
  }

  /**
   * Fetch P&L data for a period
   */
  async fetchPLData(divisionCode, period) {
    const tables = this.getTableNames(divisionCode);
    const monthNames = ensureMonthNames(period.months);
    
    if (monthNames.length === 0) {
      logger.warn(`No valid months for P&L data query: ${period.months}`);
      return null;
    }
    
    try {
      // P&L table has wide format with columns for each metric
      const query = `
        SELECT 
          year, month, data_type,
          COALESCE(sales, 0) as sales,
          COALESCE(material, 0) as material,
          COALESCE(cost_of_sales, 0) as cost_of_sales,
          COALESCE(gross_profit, 0) as gross_profit,
          COALESCE(ebitda, 0) as ebitda,
          COALESCE(net_profit, 0) as net_profit,
          COALESCE(sales_volume_kg, 0) as sales_volume_kg,
          COALESCE(labour, 0) as labour,
          COALESCE(depreciation, 0) as depreciation,
          COALESCE(electricity, 0) as electricity,
          COALESCE(others_mfg_overheads, 0) as others_mfg_overheads,
          COALESCE(transportation, 0) as transportation,
          COALESCE(selling_expenses_override, 0) as selling_expenses_override,
          COALESCE(admin_mgmt_fee_override, 0) as admin_mgmt_fee_override
        FROM ${tables.pl}
        WHERE year = $1 
          AND month = ANY($2::text[])
          AND data_type = $3
        ORDER BY month
      `;
      
      const result = await pool.query(query, [
        period.year,
        monthNames,
        period.type || 'Actual'
      ]);
      
      return this.transformPLData(result.rows);
    } catch (error) {
      logger.warn(`Could not fetch P&L data for ${divisionCode}:`, error.message);
      return null;
    }
  }

  /**
   * Transform raw P&L rows into structured data
   */
  transformPLData(rows) {
    if (!rows || rows.length === 0) return null;

    // Sum up all months
    let sales = 0, material = 0, grossProfit = 0, ebitda = 0, netProfit = 0;
    let salesVolume = 0, labour = 0, depreciation = 0, electricity = 0;
    let transportation = 0, sellingExpenses = 0, administration = 0;
    let othersMfgOverheads = 0;
    
    const byMonth = {};
    
    rows.forEach(row => {
      const month = row.month;
      sales += parseFloat(row.sales) || 0;
      material += parseFloat(row.material) || 0;
      grossProfit += parseFloat(row.gross_profit) || 0;
      ebitda += parseFloat(row.ebitda) || 0;
      netProfit += parseFloat(row.net_profit) || 0;
      salesVolume += parseFloat(row.sales_volume_kg) || 0;
      labour += parseFloat(row.labour) || 0;
      depreciation += parseFloat(row.depreciation) || 0;
      electricity += parseFloat(row.electricity) || 0;
      transportation += parseFloat(row.transportation) || 0;
      othersMfgOverheads += parseFloat(row.others_mfg_overheads) || 0;
      // Use override columns if they exist
      sellingExpenses += parseFloat(row.selling_expenses_override) || parseFloat(row.selling_expenses) || 0;
      administration += parseFloat(row.admin_mgmt_fee_override) || parseFloat(row.administration) || 0;
      
      byMonth[month] = {
        sales: parseFloat(row.sales) || 0,
        material: parseFloat(row.material) || 0,
        grossProfit: parseFloat(row.gross_profit) || 0,
        ebitda: parseFloat(row.ebitda) || 0,
        netProfit: parseFloat(row.net_profit) || 0
      };
    });

    // Calculate manufacturing costs
    const manufacturingCosts = labour + depreciation + electricity + othersMfgOverheads;
    
    // Calculate gross profit if not set (sales - material - manufacturing costs)
    if (grossProfit === 0 && sales > 0) {
      grossProfit = sales - material - manufacturingCosts;
    }
    
    // Calculate EBITDA if not set (gross profit - selling - admin - transportation)
    if (ebitda === 0 && grossProfit > 0) {
      ebitda = grossProfit - sellingExpenses - administration - transportation;
    }
    
    // Calculate net profit if not set (EBITDA - depreciation - interest)
    if (netProfit === 0 && ebitda > 0) {
      netProfit = ebitda - depreciation;
    }

    return {
      byMonth,
      summary: {
        sales,
        materialCost: material,
        grossProfit,
        grossProfitPct: sales > 0 ? (grossProfit / sales) * 100 : 0,
        ebitda,
        ebitdaPct: sales > 0 ? (ebitda / sales) * 100 : 0,
        netProfit,
        netProfitPct: sales > 0 ? (netProfit / sales) * 100 : 0,
        salesVolume,
        avgSellingPrice: salesVolume > 0 ? sales / salesVolume : 0
      }
    };
  }

  /**
   * Fetch sales data aggregated by various dimensions
   */
  async fetchSalesData(divisionCode, period) {
    const tables = this.getTableNames(divisionCode);
    
    // Convert month names to numbers for fp_data_excel table
    const monthNumbers = monthNamesToNumbers(period.months);
    
    if (monthNumbers.length === 0) {
      logger.warn(`No valid months for sales data query: ${period.months}`);
      return null;
    }
    
    try {
      // Get sales by rep GROUP - NOTE: fp_actualcommon uses sales_rep_group_name for reports
      // CRITICAL: fp_actualcommon uses month_no (integer) not month (text)
      const repQuery = `
        SELECT 
          sales_rep_group_name as salesrepname,
          SUM(amount) as amount,
          SUM(qty_kgs) as volume
        FROM ${tables.data}
        WHERE year = $1 
          AND month_no = ANY($2::int[])
        GROUP BY sales_rep_group_name
        ORDER BY amount DESC
      `;

      // Get sales by customer
      const customerQuery = `
        SELECT 
          customer_name as customername,
          sales_rep_group_name as salesrepname,
          SUM(amount) as amount,
          SUM(qty_kgs) as volume
        FROM ${tables.data}
        WHERE year = $1 
          AND month_no = ANY($2::int[])
        GROUP BY customer_name, sales_rep_group_name
        ORDER BY amount DESC
      `;

      // Get sales by product group
      const productQuery = `
        SELECT 
          pgcombine as productgroup,
          SUM(amount) as amount,
          SUM(qty_kgs) as volume
        FROM ${tables.data}
        WHERE year = $1 
          AND month_no = ANY($2::int[])
        GROUP BY pgcombine
        ORDER BY amount DESC
      `;

      // Get sales by country
      const countryQuery = `
        SELECT 
          country,
          SUM(amount) as amount,
          SUM(qty_kgs) as volume
        FROM ${tables.data}
        WHERE year = $1 
          AND month_no = ANY($2::int[])
        GROUP BY country
        ORDER BY amount DESC
      `;

      // Get totals
      const totalsQuery = `
        SELECT 
          SUM(amount) as total_amount,
          SUM(qty_kgs) as total_volume,
          COUNT(DISTINCT customer_name) as customer_count,
          COUNT(DISTINCT sales_rep_group_name) as rep_count,
          COUNT(DISTINCT pgcombine) as product_count,
          COUNT(DISTINCT country) as country_count
        FROM ${tables.data}
        WHERE year = $1 
          AND month_no = ANY($2::int[])
      `;

      // NOTE: fp_actualcommon has no 'type' column - all records are actual sales
      const params = [period.year, monthNumbers];

      const [repResult, customerResult, productResult, countryResult, totalsResult] = await Promise.all([
        pool.query(repQuery, params),
        pool.query(customerQuery, params),
        pool.query(productQuery, params),
        pool.query(countryQuery, params),
        pool.query(totalsQuery, params)
      ]);

      return {
        byRep: repResult.rows,
        byCustomer: customerResult.rows,
        byProduct: productResult.rows,
        byCountry: countryResult.rows,
        totals: totalsResult.rows[0] || {}
      };

    } catch (error) {
      logger.warn(`Could not fetch sales data for ${divisionCode}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch budget data
   */
  async fetchBudgetData(divisionCode, period) {
    const tables = this.getTableNames(divisionCode);
    const monthNumbers = monthNamesToNumbers(period.months);
    
    if (monthNumbers.length === 0) {
      logger.warn(`No valid months for budget data query: ${period.months}`);
      return null;
    }
    
    try {
      // Use sales_rep_group_name for consistent group-based reporting
      const query = `
        SELECT 
          sales_rep_group_name as salesrepname,
          pgcombine as productgroup,
          customer_name as customername,
          SUM(amount) as budget_amount,
          SUM(qty_kgs) as budget_volume
        FROM ${tables.budget}
        WHERE budget_year = $1 
          AND month_no = ANY($2::int[])
          AND is_budget = true
        GROUP BY sales_rep_group_name, pgcombine, customer_name
      `;

      const result = await pool.query(query, [period.year, monthNumbers]);
      
      // Aggregate by rep
      const byRep = {};
      result.rows.forEach(row => {
        const rep = row.salesrepname;
        if (!byRep[rep]) {
          byRep[rep] = { amount: 0, volume: 0 };
        }
        byRep[rep].amount += parseFloat(row.budget_amount) || 0;
        byRep[rep].volume += parseFloat(row.budget_volume) || 0;
      });

      return {
        raw: result.rows,
        byRep,
        totalAmount: Object.values(byRep).reduce((sum, r) => sum + r.amount, 0),
        totalVolume: Object.values(byRep).reduce((sum, r) => sum + r.volume, 0)
      };

    } catch (error) {
      logger.warn(`Could not fetch budget data for ${divisionCode}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch customer merge rules
   */
  async fetchMergeRules(divisionCode) {
    const tables = this.getTableNames(divisionCode);
    
    try {
      const query = `
        SELECT merged_customer_name, original_customers
        FROM ${tables.mergeRules}
        WHERE is_active = true
      `;
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      logger.warn(`Could not fetch merge rules for ${divisionCode}:`, error.message);
      return [];
    }
  }

  /**
   * Build executive summary with health score
   */
  async buildExecutiveSummary(data, divisionCode) {
    const { pl, sales, budget } = data;
    
    // Calculate health score components (0-10 scale)
    const scores = {
      financial: this.calculateFinancialHealthScore(pl?.base),
      salesPerformance: this.calculateSalesPerformanceScore(sales?.base, budget),
      customerHealth: this.calculateCustomerHealthScore(sales?.base),
      budgetAchievement: this.calculateBudgetAchievementScore(sales?.base, budget)
    };

    // Overall health score (weighted average)
    const weights = { financial: 0.3, salesPerformance: 0.25, customerHealth: 0.25, budgetAchievement: 0.2 };
    const healthScore = Object.entries(scores).reduce((sum, [key, score]) => {
      return sum + (score * weights[key]);
    }, 0);

    // Key metrics
    const salesTotal = sales?.base?.totals?.total_amount || 0;
    const gpPct = pl?.base?.summary?.grossProfitPct || 0;
    const budgetTotal = budget?.totalAmount || 0;
    const budgetAchievementPct = budgetTotal > 0 ? (salesTotal / budgetTotal) * 100 : 0;

    // Critical alerts
    const criticalAlerts = [];
    const warnings = [];
    const positiveTrends = [];

    // GP% below target
    if (gpPct < 18) {
      criticalAlerts.push({
        type: 'margin',
        message: `Gross Profit at ${gpPct.toFixed(1)}% - significantly below 20% target`,
        severity: 'critical'
      });
    } else if (gpPct < 20) {
      warnings.push({
        type: 'margin',
        message: `Gross Profit at ${gpPct.toFixed(1)}% - slightly below 20% target`,
        severity: 'warning'
      });
    } else {
      positiveTrends.push({
        type: 'margin',
        message: `Gross Profit at ${gpPct.toFixed(1)}% - above target`,
        severity: 'positive'
      });
    }

    // Budget achievement
    if (budgetAchievementPct < 70) {
      criticalAlerts.push({
        type: 'budget',
        message: `Budget achievement at ${budgetAchievementPct.toFixed(1)}% - at risk`,
        severity: 'critical'
      });
    } else if (budgetAchievementPct < 90) {
      warnings.push({
        type: 'budget',
        message: `Budget achievement at ${budgetAchievementPct.toFixed(1)}% - needs attention`,
        severity: 'warning'
      });
    }

    return {
      healthScore: Math.round(healthScore * 10) / 10,
      componentScores: scores,
      keyMetrics: {
        totalSales: salesTotal,
        grossProfitPct: gpPct,
        ebitdaPct: pl?.base?.summary?.ebitdaPct || 0,
        budgetAchievementPct,
        customerCount: sales?.base?.totals?.customer_count || 0,
        repCount: sales?.base?.totals?.rep_count || 0
      },
      criticalAlerts,
      warnings,
      positiveTrends,
      narrativeSummary: this.generateExecutiveNarrative(data, healthScore, gpPct, budgetAchievementPct)
    };
  }

  /**
   * Generate executive narrative
   */
  generateExecutiveNarrative(data, healthScore, gpPct, budgetAchievementPct) {
    const salesTotal = data.sales?.base?.totals?.total_amount || 0;
    const formattedSales = this.formatCurrency(salesTotal);
    
    let narrative = `Division Health Score: ${healthScore.toFixed(1)}/10. `;
    narrative += `Total sales of ${formattedSales} with ${gpPct.toFixed(1)}% gross margin. `;
    
    if (budgetAchievementPct > 0) {
      narrative += `Budget achievement stands at ${budgetAchievementPct.toFixed(1)}%. `;
    }

    if (healthScore >= 8) {
      narrative += 'The division is performing well across all metrics.';
    } else if (healthScore >= 6) {
      narrative += 'Performance is satisfactory with some areas requiring attention.';
    } else {
      narrative += 'Several areas require immediate intervention.';
    }

    return narrative;
  }

  /**
   * Analyze P&L data
   */
  async analyzePL(data) {
    const { pl } = data;
    if (!pl?.base) return null;

    const base = pl.base.summary;
    const comp = pl.comp?.summary;

    const analysis = {
      currentPeriod: base,
      comparison: comp ? {
        salesChange: comp.sales > 0 ? ((base.sales - comp.sales) / comp.sales) * 100 : 0,
        gpChange: base.grossProfitPct - (comp.grossProfitPct || 0),
        ebitdaChange: base.ebitdaPct - (comp.ebitdaPct || 0)
      } : null,
      costBreakdown: this.analyzeCostBreakdown(pl.base.summary),
      marginAnalysis: {
        grossMargin: base.grossProfitPct,
        targetGap: base.grossProfitPct - 20,
        status: base.grossProfitPct >= 20 ? 'on-target' : base.grossProfitPct >= 18 ? 'near-target' : 'below-target'
      },
      insights: []
    };

    // Generate insights
    if (analysis.comparison) {
      if (analysis.comparison.salesChange > 5) {
        analysis.insights.push({
          type: 'positive',
          message: `Sales grew ${analysis.comparison.salesChange.toFixed(1)}% vs comparison period`
        });
      } else if (analysis.comparison.salesChange < -5) {
        analysis.insights.push({
          type: 'negative',
          message: `Sales declined ${Math.abs(analysis.comparison.salesChange).toFixed(1)}% vs comparison period`
        });
      }
    }

    return analysis;
  }

  /**
   * Analyze cost breakdown from P&L summary
   */
  analyzeCostBreakdown(summary) {
    if (!summary || !summary.sales) return null;

    const sales = summary.sales;
    const costs = {};

    // Map cost items from summary to cost breakdown
    const costItems = {
      'Material Cost': summary.materialCost || 0,
      'Gross Profit': summary.grossProfit || 0,
      'EBITDA': summary.ebitda || 0,
      'Net Profit': summary.netProfit || 0
    };
    
    Object.entries(costItems).forEach(([item, value]) => {
      costs[item] = {
        value: value,
        pctOfSales: sales > 0 ? (value / sales) * 100 : 0
      };
    });

    return costs;
  }

  /**
   * Evaluate sales reps performance
   */
  async evaluateSalesReps(data) {
    const { sales, budget } = data;
    if (!sales?.base?.byRep) return null;

    const totalSales = sales.base.totals.total_amount || 0;
    
    // Get AI clustering data if available
    let clusterMap = {};
    if (SalesRepLearningService) {
      try {
        const clusters = await SalesRepLearningService.getAllClusters(data.divisionCode);
        if (clusters && clusters.length > 0) {
          clusters.forEach(c => {
            clusterMap[c.salesrep_name] = {
              cluster: c.cluster_name,
              similarity: c.similarity_score
            };
          });
        }
      } catch (e) {
        logger.debug('Sales rep clusters not available:', e.message);
      }
    }
    
    const reps = sales.base.byRep.map(rep => {
      const budgetData = budget?.byRep?.[rep.salesrepname] || { amount: 0, volume: 0 };
      const achievement = budgetData.amount > 0 ? (rep.amount / budgetData.amount) * 100 : null;
      const shareOfTotal = totalSales > 0 ? (rep.amount / totalSales) * 100 : 0;
      const aiCluster = clusterMap[rep.salesrepname] || null;

      return {
        name: rep.salesrepname,
        amount: parseFloat(rep.amount) || 0,
        volume: parseFloat(rep.volume) || 0,
        budget: budgetData.amount,
        achievement,
        shareOfTotal,
        asp: rep.volume > 0 ? rep.amount / rep.volume : 0,
        status: this.getRepPerformanceStatus(achievement),
        aiCluster: aiCluster ? aiCluster.cluster : null
      };
    });

    // Identify top and bottom performers
    const sortedByAchievement = [...reps].filter(r => r.achievement !== null)
      .sort((a, b) => (b.achievement || 0) - (a.achievement || 0));
    
    const topPerformers = sortedByAchievement.slice(0, 3);
    const needsAttention = sortedByAchievement.filter(r => r.achievement < 80);
    
    // AI cluster summary
    const clusterSummary = {};
    reps.forEach(r => {
      if (r.aiCluster) {
        clusterSummary[r.aiCluster] = (clusterSummary[r.aiCluster] || 0) + 1;
      }
    });

    return {
      allReps: reps,
      topPerformers,
      needsAttention,
      aiClusters: Object.keys(clusterSummary).length > 0 ? clusterSummary : null,
      summary: {
        totalReps: reps.length,
        onTrack: reps.filter(r => r.achievement >= 90).length,
        atRisk: needsAttention.length,
        averageAchievement: reps.reduce((sum, r) => sum + (r.achievement || 0), 0) / reps.length
      }
    };
  }

  /**
   * Analyze customers
   */
  async analyzeCustomers(data) {
    const { sales } = data;
    if (!sales?.base?.byCustomer) return null;

    const customers = sales.base.byCustomer;
    const totalSales = sales.base.totals.total_amount || 0;
    
    // Get AI segmentation data if available
    let segmentMap = {};
    let segmentSummary = {};
    if (CustomerLearningService) {
      try {
        const segments = await pool.query(`
          SELECT customer_name, segment_name
          FROM ${data.divisionCode.toLowerCase()}_customer_segments
        `);
        if (segments.rows.length > 0) {
          segments.rows.forEach(s => {
            segmentMap[s.customer_name] = s.segment_name;
            segmentSummary[s.segment_name] = (segmentSummary[s.segment_name] || 0) + 1;
          });
        }
      } catch (e) {
        logger.debug('Customer segments not available:', e.message);
      }
    }

    // Calculate Pareto (80/20)
    let cumulative = 0;
    const paretoAnalysis = customers.map((c, idx) => {
      cumulative += parseFloat(c.amount) || 0;
      return {
        ...c,
        cumulativeShare: totalSales > 0 ? (cumulative / totalSales) * 100 : 0,
        rank: idx + 1,
        aiSegment: segmentMap[c.customername] || null
      };
    });

    const top20Pct = Math.ceil(customers.length * 0.2);
    const topCustomersContribution = paretoAnalysis
      .slice(0, top20Pct)
      .reduce((sum, c) => sum + parseFloat(c.amount), 0);

    // Find comparison period changes if available
    const compMap = {};
    if (sales.comp?.byCustomer) {
      sales.comp.byCustomer.forEach(c => {
        compMap[c.customername] = parseFloat(c.amount) || 0;
      });
    }

    // Identify growing and declining customers
    const customerTrends = paretoAnalysis.slice(0, 50).map(c => {
      const compAmount = compMap[c.customername] || 0;
      const change = compAmount > 0 ? ((parseFloat(c.amount) - compAmount) / compAmount) * 100 : null;
      return { ...c, change };
    });

    const growing = customerTrends.filter(c => c.change !== null && c.change > 10);
    const declining = customerTrends.filter(c => c.change !== null && c.change < -10);

    return {
      totalCustomers: customers.length,
      paretoAnalysis: paretoAnalysis.slice(0, 20),
      top20Contribution: totalSales > 0 ? (topCustomersContribution / totalSales) * 100 : 0,
      growingCustomers: growing.slice(0, 5),
      decliningCustomers: declining.slice(0, 5),
      aiSegments: Object.keys(segmentSummary).length > 0 ? segmentSummary : null,
      insights: this.generateCustomerInsights(paretoAnalysis, growing, declining)
    };
  }

  /**
   * Generate customer insights
   */
  generateCustomerInsights(pareto, growing, declining) {
    const insights = [];

    if (pareto.length > 0) {
      const top5Share = pareto.slice(0, 5).reduce((sum, c) => sum + (c.cumulativeShare > 50 ? 0 : parseFloat(c.amount)), 0);
      if (pareto[4]?.cumulativeShare > 60) {
        insights.push({
          type: 'warning',
          message: `High customer concentration: Top 5 customers account for ${pareto[4].cumulativeShare.toFixed(1)}% of revenue`
        });
      }
    }

    if (declining.length > 3) {
      insights.push({
        type: 'alert',
        message: `${declining.length} customers showing >10% decline vs comparison period`
      });
    }

    if (growing.length > 3) {
      insights.push({
        type: 'positive',
        message: `${growing.length} customers showing >10% growth vs comparison period`
      });
    }

    return insights;
  }

  /**
   * Analyze products
   */
  async analyzeProducts(data) {
    const { sales } = data;
    if (!sales?.base?.byProduct) return null;

    const products = sales.base.byProduct;
    const totalSales = sales.base.totals.total_amount || 0;
    const totalVolume = sales.base.totals.total_volume || 0;

    const productAnalysis = products.map(p => ({
      name: p.productgroup,
      amount: parseFloat(p.amount) || 0,
      volume: parseFloat(p.volume) || 0,
      asp: p.volume > 0 ? p.amount / p.volume : 0,
      shareOfSales: totalSales > 0 ? (p.amount / totalSales) * 100 : 0,
      shareOfVolume: totalVolume > 0 ? (p.volume / totalVolume) * 100 : 0
    }));

    // Compare with previous period if available
    if (sales.comp?.byProduct) {
      const compMap = {};
      sales.comp.byProduct.forEach(p => {
        compMap[p.productgroup] = {
          amount: parseFloat(p.amount) || 0,
          volume: parseFloat(p.volume) || 0
        };
      });

      productAnalysis.forEach(p => {
        const comp = compMap[p.name];
        if (comp) {
          p.amountChange = comp.amount > 0 ? ((p.amount - comp.amount) / comp.amount) * 100 : null;
          p.volumeChange = comp.volume > 0 ? ((p.volume - comp.volume) / comp.volume) * 100 : null;
          p.aspChange = comp.amount / comp.volume > 0 ? ((p.asp - comp.amount / comp.volume) / (comp.amount / comp.volume)) * 100 : null;
        }
      });
    }

    return {
      allProducts: productAnalysis,
      topByRevenue: productAnalysis.slice(0, 5),
      topByVolume: [...productAnalysis].sort((a, b) => b.volume - a.volume).slice(0, 5),
      summary: {
        totalProducts: products.length,
        avgASP: totalVolume > 0 ? totalSales / totalVolume : 0
      }
    };
  }

  /**
   * Analyze budget achievement
   */
  async analyzeBudgetAchievement(data) {
    const { sales, budget } = data;
    if (!budget || !sales?.base) return null;

    const actualTotal = sales.base.totals.total_amount || 0;
    const budgetTotal = budget.totalAmount || 0;
    const achievementPct = budgetTotal > 0 ? (actualTotal / budgetTotal) * 100 : 0;

    // Run rate calculation (assuming we have month information)
    const monthsElapsed = data.basePeriod?.months?.length || 1;
    const annualBudget = (budgetTotal / monthsElapsed) * 12; // Annualize
    const projectedAnnual = (actualTotal / monthsElapsed) * 12;

    return {
      actual: actualTotal,
      budget: budgetTotal,
      achievementPct,
      gap: budgetTotal - actualTotal,
      projectedAnnual,
      annualBudget,
      projectedAchievement: annualBudget > 0 ? (projectedAnnual / annualBudget) * 100 : 0,
      status: achievementPct >= 95 ? 'on-track' : achievementPct >= 80 ? 'at-risk' : 'off-track'
    };
  }

  /**
   * Analyze geographic distribution
   */
  async analyzeGeography(data) {
    const { sales } = data;
    if (!sales?.base?.byCountry) return null;

    const countries = sales.base.byCountry;
    const totalSales = sales.base.totals.total_amount || 0;

    const geoAnalysis = countries.map(c => ({
      country: c.country,
      amount: parseFloat(c.amount) || 0,
      volume: parseFloat(c.volume) || 0,
      shareOfSales: totalSales > 0 ? (c.amount / totalSales) * 100 : 0
    }));

    return {
      allCountries: geoAnalysis,
      topMarkets: geoAnalysis.slice(0, 5),
      marketCount: countries.length,
      concentration: geoAnalysis.slice(0, 3).reduce((sum, c) => sum + c.shareOfSales, 0)
    };
  }

  /**
   * Identify risks
   */
  async identifyRisks(data) {
    const risks = [];
    const { sales, budget, pl } = data;

    // Customer concentration risk
    if (sales?.base?.byCustomer) {
      const totalSales = sales.base.totals.total_amount || 0;
      const top3Amount = sales.base.byCustomer.slice(0, 3).reduce((sum, c) => sum + parseFloat(c.amount), 0);
      const top3Share = totalSales > 0 ? (top3Amount / totalSales) * 100 : 0;
      
      if (top3Share > 50) {
        risks.push({
          type: 'concentration',
          severity: top3Share > 70 ? 'critical' : 'high',
          title: 'Customer Concentration Risk',
          description: `Top 3 customers account for ${top3Share.toFixed(1)}% of revenue`,
          impact: 'Revenue volatility if any major customer is lost',
          recommendation: 'Diversify customer base, develop secondary relationships'
        });
      }
    }

    // Margin erosion risk
    if (pl?.base?.summary?.grossProfitPct < 18) {
      risks.push({
        type: 'margin',
        severity: 'critical',
        title: 'Margin Erosion',
        description: `Gross margin at ${pl.base.summary.grossProfitPct.toFixed(1)}% is below healthy levels`,
        impact: 'Profitability at risk, may impact ability to invest in growth',
        recommendation: 'Review pricing strategy and cost structure'
      });
    }

    // Budget achievement risk
    if (budget && sales?.base) {
      const achievement = budget.totalAmount > 0 ? (sales.base.totals.total_amount / budget.totalAmount) * 100 : 100;
      if (achievement < 75) {
        risks.push({
          type: 'budget',
          severity: 'high',
          title: 'Budget Achievement Risk',
          description: `Currently at ${achievement.toFixed(1)}% of budget`,
          impact: 'Annual targets may not be met',
          recommendation: 'Identify quick wins and accelerate pipeline'
        });
      }
    }

    // Sales rep dependency risk
    if (sales?.base?.byRep) {
      const totalSales = sales.base.totals.total_amount || 0;
      const top2Amount = sales.base.byRep.slice(0, 2).reduce((sum, r) => sum + parseFloat(r.amount), 0);
      const top2Share = totalSales > 0 ? (top2Amount / totalSales) * 100 : 0;
      
      if (top2Share > 60) {
        risks.push({
          type: 'dependency',
          severity: 'medium',
          title: 'Sales Rep Dependency',
          description: `Top 2 reps account for ${top2Share.toFixed(1)}% of revenue`,
          impact: 'Key person risk if top performers leave',
          recommendation: 'Develop bench strength, document customer relationships'
        });
      }
    }

    // =========================================================================
    // AI LEARNING ENHANCED RISKS
    // =========================================================================
    
    // Customer churn risk from AI predictions
    if (CustomerLearningService) {
      try {
        const highRiskCustomers = await CustomerLearningService.getHighRiskCustomers(data.divisionCode, 10);
        if (highRiskCustomers && highRiskCustomers.length > 0) {
          const topRisks = highRiskCustomers.slice(0, 3).map(c => c.customer_name).join(', ');
          
          risks.push({
            type: 'churn',
            severity: highRiskCustomers.length > 5 ? 'high' : 'medium',
            title: 'Customer Churn Risk (AI Predicted)',
            description: `${highRiskCustomers.length} customers identified at high churn risk`,
            detail: `Highest risk: ${topRisks}`,
            impact: 'Potential revenue loss if customers churn',
            recommendation: 'Proactive engagement with at-risk customers, win-back campaigns',
            aiGenerated: true
          });
        }
      } catch (e) {
        logger.debug('Churn prediction not available:', e.message);
      }
    }

    // Seasonality risk (off-season performance)
    if (DivisionLearningService) {
      try {
        const currentMonth = new Date().getMonth() + 1;
        const seasonality = await DivisionLearningService.getSeasonality(data.divisionCode);
        if (seasonality && seasonality[currentMonth]) {
          const factor = seasonality[currentMonth].seasonality_factor || 1;
          if (factor < 0.85) {
            risks.push({
              type: 'seasonality',
              severity: 'info',
              title: 'Seasonal Low Period',
              description: `Historically, this month performs ${((1 - factor) * 100).toFixed(0)}% below average`,
              impact: 'Expected lower performance based on learned patterns',
              recommendation: 'Focus on pipeline building for upcoming high season',
              aiGenerated: true
            });
          }
        }
      } catch (e) {
        logger.debug('Seasonality data not available:', e.message);
      }
    }

    return risks;
  }

  /**
   * Generate AI recommendations
   */
  async generateRecommendations(data) {
    const recommendations = [];
    const { sales, budget, pl } = data;

    // Margin improvement recommendation
    if (pl?.base?.summary?.grossProfitPct < 20) {
      const gap = 20 - pl.base.summary.grossProfitPct;
      const potentialImpact = (pl.base.summary.sales * gap) / 100;
      
      recommendations.push({
        id: 'margin_improvement',
        priority: 1,
        type: 'margin',
        title: 'Improve Gross Margin',
        description: `Close the ${gap.toFixed(1)}pp gap to 20% target`,
        expectedImpact: potentialImpact,
        impactDescription: `Potential ${this.formatCurrency(potentialImpact)} improvement in gross profit`,
        confidence: 0.85,
        actions: [
          'Review and optimize top 5 product pricing',
          'Negotiate better supplier terms',
          'Reduce low-margin product promotion'
        ],
        effort: 'medium'
      });
    }

    // Customer retention focus
    if (sales?.comp?.byCustomer) {
      const declining = data.customerInsights?.decliningCustomers || [];
      if (declining.length > 0) {
        const atRiskRevenue = declining.reduce((sum, c) => sum + parseFloat(c.amount), 0);
        
        recommendations.push({
          id: 'customer_retention',
          priority: 2,
          type: 'retention',
          title: 'Customer Retention Priority',
          description: `${declining.length} customers showing >10% decline`,
          expectedImpact: atRiskRevenue,
          impactDescription: `${this.formatCurrency(atRiskRevenue)} revenue at risk`,
          confidence: 0.78,
          actions: declining.slice(0, 3).map(c => `Review relationship with ${c.customername}`),
          effort: 'low'
        });
      }
    }

    // Budget catch-up recommendation
    if (budget && sales?.base) {
      const gap = budget.totalAmount - sales.base.totals.total_amount;
      if (gap > 0) {
        recommendations.push({
          id: 'budget_catchup',
          priority: 3,
          type: 'budget',
          title: 'Budget Catch-Up Plan',
          description: `Need ${this.formatCurrency(gap)} to hit budget`,
          expectedImpact: gap,
          impactDescription: 'Close budget gap',
          confidence: 0.72,
          actions: [
            'Accelerate pipeline deals in advanced stages',
            'Focus on high-potential customers',
            'Launch promotional campaign for key products'
          ],
          effort: 'high'
        });
      }
    }

    // Sort by priority
    return recommendations.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Calculate confidence scores for each section
   */
  calculateConfidenceScores(report) {
    return {
      executiveSummary: 0.92,
      plAnalysis: report.plAnalysis ? 0.88 : 0,
      salesRepEvaluation: report.salesRepEvaluation ? 0.85 : 0,
      customerInsights: report.customerInsights ? 0.82 : 0,
      productPerformance: report.productPerformance ? 0.85 : 0,
      budgetTracking: report.budgetTracking ? 0.90 : 0,
      geographicAnalysis: report.geographicAnalysis ? 0.80 : 0,
      riskAlerts: 0.75,
      recommendations: 0.70
    };
  }

  // ==================== HELPER METHODS ====================

  calculateFinancialHealthScore(pl) {
    if (!pl?.summary) return 5;
    
    const gpScore = Math.min(10, (pl.summary.grossProfitPct / 25) * 10);
    const ebitdaScore = Math.min(10, (pl.summary.ebitdaPct / 15) * 10);
    
    return (gpScore * 0.6 + ebitdaScore * 0.4);
  }

  calculateSalesPerformanceScore(sales, budget) {
    if (!sales?.totals || !budget) return 5;
    
    const achievement = budget.totalAmount > 0 ? (sales.totals.total_amount / budget.totalAmount) * 100 : 100;
    return Math.min(10, (achievement / 100) * 10);
  }

  calculateCustomerHealthScore(sales) {
    if (!sales?.byCustomer) return 5;
    
    // More customers = better health (diversity)
    const customerCount = sales.byCustomer.length;
    return Math.min(10, (customerCount / 50) * 10);
  }

  calculateBudgetAchievementScore(sales, budget) {
    if (!sales?.totals || !budget) return 5;
    
    const achievement = budget.totalAmount > 0 ? (sales.totals.total_amount / budget.totalAmount) * 100 : 100;
    return Math.min(10, (achievement / 100) * 10);
  }

  getRepPerformanceStatus(achievement) {
    if (achievement === null) return 'no-budget';
    if (achievement >= 100) return 'exceeding';
    if (achievement >= 90) return 'on-track';
    if (achievement >= 70) return 'at-risk';
    return 'critical';
  }

  /**
   * Get division name from database
   * Falls back to division code if not found
   */
  async getDivisionName(divisionCode) {
    try {
      const { authPool } = require('../database/config');
      const result = await authPool.query(
        "SELECT setting_value FROM company_settings WHERE setting_key = 'divisions'"
      );
      if (result.rows.length > 0 && result.rows[0].setting_value) {
        const divisions = JSON.parse(result.rows[0].setting_value);
        const division = divisions.find(d => d.code === divisionCode);
        if (division) return division.name;
      }
    } catch (err) {
      logger.warn('Could not fetch division name from database:', err.message);
    }
    return divisionCode; // Fallback to code
  }

  formatCurrency(value, currency = 'AED') {
    const absValue = Math.abs(value);
    if (absValue >= 1000000) {
      return `${currency} ${(value / 1000000).toFixed(2)}M`;
    } else if (absValue >= 1000) {
      return `${currency} ${(value / 1000).toFixed(1)}K`;
    }
    return `${currency} ${value.toFixed(0)}`;
  }

  // ==================== FEEDBACK & LEARNING ====================

  /**
   * Record feedback on an insight
   */
  async recordFeedback(divisionCode, feedbackData) {
    divisionCode = this.validateDivisionCode(divisionCode);
    const tables = this.getTableNames(divisionCode);

    try {
      // Check if feedback table exists, create if not
      await this.ensureFeedbackTableExists(divisionCode);

      const query = `
        INSERT INTO ${tables.aiFeedback} 
        (insight_id, insight_type, feedback_type, notes, user_id, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING id
      `;

      const result = await pool.query(query, [
        feedbackData.insightId,
        feedbackData.insightType,
        feedbackData.feedbackType, // 'helpful', 'not_helpful', 'acted_upon', 'wrong'
        feedbackData.notes || null,
        feedbackData.userId || null
      ]);

      logger.info(`Recorded feedback for ${divisionCode}`, { insightId: feedbackData.insightId });
      return result.rows[0];

    } catch (error) {
      logger.error(`Error recording feedback for ${divisionCode}:`, error);
      throw error;
    }
  }

  /**
   * Ensure feedback table exists
   */
  async ensureFeedbackTableExists(divisionCode) {
    const tables = this.getTableNames(divisionCode);
    
    const query = `
      CREATE TABLE IF NOT EXISTS ${tables.aiFeedback} (
        id SERIAL PRIMARY KEY,
        insight_id VARCHAR(100) NOT NULL,
        insight_type VARCHAR(50),
        feedback_type VARCHAR(30) NOT NULL,
        notes TEXT,
        user_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await pool.query(query);
  }
}

module.exports = new DivisionReportAIService();
