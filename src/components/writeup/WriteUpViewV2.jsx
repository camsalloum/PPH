// components/writeup/WriteUpViewV2.jsx
/**
 * WriteUp V2 - AI-Powered Text Analysis
 * 
 * Generates intelligent textual analysis using the SAME data as dashboard cards.
 * This ensures consistency - same exclusions, merge rules, and filters applied.
 * 
 * Data Flow:
 *   1. Read period selection from FilterContext
 *   2. Use useAggregatedDashboardData hook to fetch from same sources as cards
 *   3. Generate AI-style insights locally
 *   4. Display narrative text sections (no charts/tables)
 *   5. Support PDF export
 */

import React, { useRef, useState, useCallback, useMemo } from 'react';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useDivisionNames } from '../../utils/useDivisionNames';
import useAggregatedDashboardData from '../../hooks/useAggregatedDashboardData';
// html2pdf.js is a CJS/UMD module — loaded dynamically at call site to avoid ESM default-export crash
import './WriteUpViewV2.css';

export default function WriteUpViewV2() {
  const reportRef = useRef(null);
  const [report, setReport] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const { selectedDivision } = useExcelData();
  const { companyCurrency } = useCurrency();
  const { divisionNames } = useDivisionNames();
  const currencyCode = companyCurrency?.code || 'AED';

  // Use the aggregated dashboard data hook (same sources as cards)
  const { 
    aggregateData, 
    loading, 
    error: hookError,
    basePeriod,
    compPeriod,
    dataGenerated 
  } = useAggregatedDashboardData();

  // Format currency helper
  const formatCurrency = useCallback((value) => {
    const n = Number(value) || 0;
    if (Math.abs(n) >= 1_000_000) return `${currencyCode} ${(n / 1_000_000).toFixed(2)}M`;
    if (Math.abs(n) >= 1_000) return `${currencyCode} ${(n / 1_000).toFixed(1)}K`;
    return `${currencyCode} ${n.toFixed(0)}`;
  }, [currencyCode]);

  /**
   * Generate AI-style insights from the aggregated data
   */
  const generateInsights = useCallback((data) => {
    if (!data) return null;

    const { pl, products, salesReps, customers, countries, budget, metadata } = data;
    const current = pl?.current;
    const changes = pl?.changes;

    // Calculate health score (0-10 scale)
    let healthScore = 5; // Base score
    
    // GP% contribution (target: 15%+)
    if (current?.grossProfitPct >= 20) healthScore += 2;
    else if (current?.grossProfitPct >= 15) healthScore += 1.5;
    else if (current?.grossProfitPct >= 10) healthScore += 0.5;
    else if (current?.grossProfitPct < 5) healthScore -= 1;

    // Budget achievement contribution
    if (budget?.achievement >= 100) healthScore += 2;
    else if (budget?.achievement >= 90) healthScore += 1;
    else if (budget?.achievement >= 80) healthScore += 0.5;
    else if (budget?.achievement < 70) healthScore -= 1;

    // Growth contribution (if we have comparison)
    if (changes?.salesChange > 10) healthScore += 1;
    else if (changes?.salesChange > 0) healthScore += 0.5;
    else if (changes?.salesChange < -10) healthScore -= 1;

    healthScore = Math.max(1, Math.min(10, healthScore));

    // Generate critical alerts
    const criticalAlerts = [];
    const warnings = [];
    const positiveTrends = [];

    if (current?.grossProfitPct < 10) {
      criticalAlerts.push({
        message: `Gross Profit at ${current.grossProfitPct.toFixed(1)}% - significantly below 15% target`
      });
    } else if (current?.grossProfitPct < 15) {
      warnings.push({
        message: `Gross Profit at ${current.grossProfitPct.toFixed(1)}% - below 15% target`
      });
    }

    if (budget?.achievement < 80 && budget?.budget > 0) {
      criticalAlerts.push({
        message: `Budget achievement at ${budget.achievement.toFixed(1)}% - significantly behind target`
      });
    } else if (budget?.achievement < 90 && budget?.budget > 0) {
      warnings.push({
        message: `Budget achievement at ${budget.achievement.toFixed(1)}% - monitoring needed`
      });
    }

    if (changes?.salesChange < -10) {
      criticalAlerts.push({
        message: `Sales declined ${Math.abs(changes.salesChange).toFixed(1)}% vs comparison period`
      });
    } else if (changes?.salesChange < 0) {
      warnings.push({
        message: `Sales declined ${Math.abs(changes.salesChange).toFixed(1)}% vs comparison period`
      });
    }

    if (changes?.salesChange > 10) {
      positiveTrends.push({
        message: `Strong sales growth of ${changes.salesChange.toFixed(1)}% vs comparison period`
      });
    }

    if (budget?.achievement >= 100) {
      positiveTrends.push({
        message: `Budget target achieved at ${budget.achievement.toFixed(1)}%`
      });
    }

    if (current?.grossProfitPct >= 18) {
      positiveTrends.push({
        message: `Healthy gross margin at ${current.grossProfitPct.toFixed(1)}%`
      });
    }

    // Generate narrative summary
    const narrativeParts = [];
    narrativeParts.push(`Division Health Score: ${healthScore.toFixed(1)}/10.`);
    narrativeParts.push(`Total sales of ${formatCurrency(current?.sales || 0)} with ${(current?.grossProfitPct || 0).toFixed(1)}% gross margin.`);
    
    if (budget?.budget > 0) {
      narrativeParts.push(`Budget achievement stands at ${(budget?.achievement || 0).toFixed(1)}%.`);
    }

    if (healthScore >= 7) {
      narrativeParts.push('The division is performing well across key metrics.');
    } else if (healthScore >= 5) {
      narrativeParts.push('Performance is satisfactory with some areas requiring attention.');
    } else {
      narrativeParts.push('Immediate attention needed on underperforming areas.');
    }

    // Generate P&L insights
    const plInsights = [];
    if (current) {
      if (current.grossProfitPct < 15) {
        plInsights.push(`Gross margin of ${current.grossProfitPct.toFixed(1)}% is below target. Review pricing and material costs.`);
      }
      if (current.ebitdaPct < 8) {
        plInsights.push(`EBITDA margin at ${current.ebitdaPct.toFixed(1)}% indicates operational cost pressures.`);
      }
      if (changes && changes.gpPctChange < -2) {
        plInsights.push(`Gross margin declined ${Math.abs(changes.gpPctChange).toFixed(1)} percentage points vs prior period.`);
      }
      if (current.asp && current.asp > 0) {
        plInsights.push(`Average selling price is ${formatCurrency(current.asp)}/kg.`);
      }
    }

    // Generate risk alerts
    const riskAlerts = [];
    
    // Customer concentration risk
    if (customers?.paretoAnalysis?.length > 0) {
      const top3Share = customers.paretoAnalysis.slice(0, 3).reduce((sum, c) => sum + (c.shareOfSales || 0), 0);
      if (top3Share > 50) {
        riskAlerts.push({
          severity: 'warning',
          title: 'Customer Concentration Risk',
          description: `Top 3 customers account for ${top3Share.toFixed(1)}% of sales.`,
          recommendation: 'Consider diversifying customer base to reduce dependency risk.'
        });
      }
    }

    // Underperforming reps risk
    if (salesReps?.needsAttention?.length >= 3) {
      riskAlerts.push({
        severity: 'warning',
        title: 'Sales Team Performance',
        description: `${salesReps.needsAttention.length} sales reps are below 80% of target.`,
        recommendation: 'Review individual rep performance and provide targeted support.'
      });
    }

    // GP risk
    if (current?.grossProfitPct < 10) {
      riskAlerts.push({
        severity: 'critical',
        title: 'Margin Pressure',
        description: `Gross profit margin at ${current.grossProfitPct.toFixed(1)}% is critically low.`,
        recommendation: 'Urgent review of pricing strategy and cost structure needed.'
      });
    }

    // Generate recommendations
    const recommendations = [];
    
    if (current?.grossProfitPct < 15) {
      recommendations.push({
        title: 'Improve Gross Margin',
        description: 'Focus on higher-margin products and review material sourcing costs.',
        priority: 'high',
        impactDescription: 'Each 1% improvement in GP adds significant bottom-line value.'
      });
    }

    if (budget?.achievement < 90 && budget?.budget > 0) {
      recommendations.push({
        title: 'Accelerate Sales Pipeline',
        description: 'Review sales pipeline and identify quick-win opportunities to close budget gap.',
        priority: 'high',
        impactDescription: `Need ${formatCurrency(budget.budget - budget.actual)} additional sales to meet budget.`
      });
    }

    if (products?.topProducts?.length > 0) {
      const topProduct = products.topProducts[0];
      recommendations.push({
        title: 'Leverage Top Performer',
        description: `${topProduct.name} is the top revenue generator. Consider expanding this product line.`,
        priority: 'medium',
        impactDescription: `Currently contributing ${(topProduct.shareOfSales || 0).toFixed(1)}% of total sales.`
      });
    }

    if (salesReps?.topPerformers?.length > 0) {
      recommendations.push({
        title: 'Replicate Success Patterns',
        description: 'Analyze practices of top-performing sales reps and share across the team.',
        priority: 'medium',
        impactDescription: 'Knowledge transfer can improve overall team performance.'
      });
    }

    return {
      metadata: {
        ...metadata,
        generationTimeMs: Date.now()
      },
      executiveSummary: {
        healthScore,
        keyMetrics: {
          totalSales: current?.sales || 0,
          grossProfitPct: current?.grossProfitPct || 0,
          budgetAchievementPct: budget?.achievement || 0,
          customerCount: customers?.totalCustomers || 0,
          repCount: salesReps?.repCount || 0
        },
        narrativeSummary: narrativeParts.join(' '),
        criticalAlerts,
        warnings,
        positiveTrends
      },
      plAnalysis: {
        currentPeriod: current ? {
          sales: current.sales,
          materialCost: current.materialCost,
          grossProfit: current.grossProfit,
          grossProfitPct: current.grossProfitPct,
          ebitda: current.ebitda,
          ebitdaPct: current.ebitdaPct,
          netProfit: current.netProfit,
          netProfitPct: current.netProfitPct
        } : null,
        comparisonPeriod: pl?.comparison,
        changes,
        insights: plInsights
      },
      budgetTracking: {
        actual: budget?.actual || 0,
        budget: budget?.budget || 0,
        achievementPct: budget?.achievement || 0,
        gap: budget?.gap || 0
      },
      salesReps: {
        summary: {
          totalReps: salesReps?.repCount || 0,
          onTrack: salesReps?.reps?.filter(r => r.achievement >= 80).length || 0,
          averageAchievement: salesReps?.avgAchievement || 0
        },
        topPerformers: salesReps?.topPerformers?.map(rep => ({
          name: rep.name,
          amount: rep.sales,
          achievement: rep.achievement
        })) || [],
        needsAttention: salesReps?.needsAttention?.map(rep => ({
          name: rep.name,
          achievement: rep.achievement
        })) || []
      },
      customers: {
        totalCustomers: customers?.totalCustomers || 0,
        top20Contribution: customers?.top20Contribution || 0,
        paretoAnalysis: customers?.paretoAnalysis?.map(c => ({
          customername: c.name,
          amount: c.sales,
          shareOfSales: c.shareOfSales,
          cumulativeShare: c.cumulativeShare
        })) || [],
        concentrationRisk: customers?.paretoAnalysis?.length > 0 && 
          customers.paretoAnalysis.slice(0, 3).reduce((sum, c) => sum + (c.shareOfSales || 0), 0) > 50
            ? `Top 3 customers represent ${customers.paretoAnalysis.slice(0, 3).reduce((sum, c) => sum + (c.shareOfSales || 0), 0).toFixed(1)}% of sales`
            : null
      },
      products: {
        summary: {
          totalProducts: products?.productCount || 0,
          avgASP: products?.avgASP || 0
        },
        topByRevenue: products?.topProducts?.map(p => ({
          name: p.name,
          amount: p.sales,
          shareOfSales: p.shareOfSales
        })) || []
      },
      countries: {
        totalCountries: countries?.countryCount || 0,
        topCountries: countries?.topCountries?.map(c => ({
          name: c.name,
          amount: c.sales,
          shareOfSales: c.shareOfSales
        })) || []
      },
      riskAlerts,
      recommendations
    };
  }, [formatCurrency]);

  /**
   * Main generate function - aggregates data then generates insights
   */
  const generateAnalysis = useCallback(async () => {
    if (!selectedDivision) {
      setError('Please select a division first');
      return;
    }

    if (!dataGenerated) {
      setError('Please generate data first by clicking the Generate button');
      return;
    }

    setGenerating(true);
    setError(null);
    setReport(null);

    try {
      console.log('📊 Starting AI Analysis with dashboard data...');
      
      // Aggregate data from same sources as dashboard cards
      const aggregatedData = await aggregateData();
      
      if (!aggregatedData) {
        throw new Error('Failed to aggregate dashboard data');
      }

      // Generate AI insights from the aggregated data
      const insights = generateInsights(aggregatedData);
      
      if (!insights) {
        throw new Error('Failed to generate insights');
      }

      setReport(insights);
      console.log('✅ AI Analysis generated successfully from dashboard data');

    } catch (err) {
      console.error('❌ Error generating analysis:', err);
      setError(err.message || 'Failed to generate analysis');
    } finally {
      setGenerating(false);
    }
  }, [selectedDivision, dataGenerated, aggregateData, generateInsights]);

  // Export to PDF
  const exportPdf = useCallback(async () => {
    if (!reportRef.current || !report) return;

    const divisionName = divisionNames[selectedDivision] || selectedDivision;
    const filename = `AI_Analysis_${divisionName}_${new Date().toISOString().split('T')[0]}`;

    const opt = {
      margin: [15, 15, 15, 15],
      filename: `${filename}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
      const html2pdfMod = await import('html2pdf.js');
      const html2pdf = html2pdfMod.default ?? html2pdfMod;
      await html2pdf().set(opt).from(reportRef.current).save();
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to export PDF');
    }
  }, [report, selectedDivision, divisionNames]);

  // Get health score color
  const getHealthColor = (score) => {
    if (score >= 8) return '#22c55e';
    if (score >= 6) return '#eab308';
    return '#ef4444';
  };

  // Get period label for display
  const getPeriodLabel = () => {
    if (!basePeriod) return 'No Period Selected';
    const monthDisplay = basePeriod.displayName || basePeriod.month || 'Year';
    return `${monthDisplay} ${basePeriod.year} (${basePeriod.type || 'Actual'})`;
  };

  const divisionName = divisionNames[selectedDivision] || selectedDivision;
  const exec = report?.executiveSummary;
  const pl = report?.plAnalysis;
  const budget = report?.budgetTracking;
  const risks = report?.riskAlerts || [];
  const recommendations = report?.recommendations || [];
  const salesReps = report?.salesReps;
  const customers = report?.customers;
  const products = report?.products;

  const isLoading = loading || generating;

  return (
    <div className="writeup-container">
      {/* Toolbar */}
      <div className="writeup-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button 
            className="btn primary" 
            onClick={generateAnalysis}
            disabled={isLoading || !selectedDivision || !dataGenerated}
          >
            {isLoading ? '⏳ Analyzing...' : '🤖 Generate AI Analysis'}
          </button>
          <button className="btn" onClick={exportPdf} disabled={!report}>
            📄 Export PDF
          </button>
        </div>
        <div style={{ color: '#6b7280', fontSize: '14px' }}>
          {selectedDivision ? `${divisionName} | ${getPeriodLabel()}` : 'Select a division'}
        </div>
      </div>

      {/* Error Display */}
      {(error || hookError) && (
        <div style={{ 
          padding: '15px 20px', 
          background: '#fef2f2', 
          border: '1px solid #fecaca',
          borderRadius: '8px',
          color: '#dc2626',
          margin: '20px 0'
        }}>
          ❌ {error || hookError}
        </div>
      )}

      {/* Initial State - Instructions */}
      {!report && !isLoading && !error && (
        <div style={{ padding: '60px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>🤖</div>
          <h2 style={{ color: '#1f2937', marginBottom: '15px' }}>AI-Powered Text Analysis</h2>
          <p style={{ color: '#6b7280', fontSize: '16px', maxWidth: '500px', margin: '0 auto 30px' }}>
            Generate intelligent interpretation and analysis of your divisional data. 
            Uses the <strong>same data as your dashboard cards</strong> - with all exclusions and filters applied.
          </p>
          
          <div style={{ 
            background: '#f0f9ff', 
            border: '2px solid #0ea5e9', 
            borderRadius: '12px', 
            padding: '25px', 
            maxWidth: '550px', 
            margin: '0 auto',
            textAlign: 'left'
          }}>
            <h4 style={{ color: '#0369a1', marginTop: 0, marginBottom: '15px' }}>📋 What you'll get:</h4>
            <ul style={{ lineHeight: '2', margin: 0, paddingLeft: '20px', color: '#374151' }}>
              <li><strong>Executive Summary</strong> with Health Score</li>
              <li><strong>P&L Analysis</strong> - Sales, GP%, EBITDA interpretation</li>
              <li><strong>Performance Insights</strong> - Sales reps, customers, products</li>
              <li><strong>Risk Alerts</strong> - Issues requiring attention</li>
              <li><strong>AI Recommendations</strong> - Actionable next steps</li>
            </ul>
          </div>

          {!dataGenerated && (
            <div style={{ 
              marginTop: '20px', 
              padding: '15px', 
              background: '#fef3c7', 
              borderRadius: '8px',
              color: '#92400e'
            }}>
              ⚠️ Please click "Generate" in the period panel first to load dashboard data.
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div style={{ padding: '80px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px', animation: 'pulse 1.5s infinite' }}>🤖</div>
          <h3 style={{ color: '#1f2937' }}>Analyzing {divisionName} Data...</h3>
          <p style={{ color: '#6b7280' }}>Aggregating data from dashboard cards and generating insights</p>
        </div>
      )}

      {/* Report Content */}
      {report && (
        <div ref={reportRef} className="writeup-report">
          
          {/* Header */}
          <div className="report-header">
            <h1>🤖 AI Analysis Report</h1>
            <p className="report-subtitle">{divisionName} | {getPeriodLabel()}</p>
            <p className="report-generated">Generated from Dashboard Data: {new Date().toLocaleString()}</p>
          </div>

          {/* Health Score & Key Metrics */}
          {exec && (
            <section className="report-section">
              <h2>📊 Executive Summary</h2>
              
              <div className="metrics-row">
                <div className="health-score-box" style={{ borderColor: getHealthColor(exec.healthScore || 0) }}>
                  <div className="health-value" style={{ color: getHealthColor(exec.healthScore || 0) }}>
                    {(exec.healthScore || 0).toFixed(1)}
                  </div>
                  <div className="health-label">Health Score</div>
                </div>
                
                <div className="metric-box">
                  <div className="metric-value">{formatCurrency(exec.keyMetrics?.totalSales || 0)}</div>
                  <div className="metric-label">Total Sales</div>
                </div>
                
                <div className="metric-box">
                  <div className="metric-value">{(exec.keyMetrics?.grossProfitPct || 0).toFixed(1)}%</div>
                  <div className="metric-label">Gross Profit %</div>
                </div>
                
                <div className="metric-box">
                  <div className="metric-value">{(exec.keyMetrics?.budgetAchievementPct || 0).toFixed(1)}%</div>
                  <div className="metric-label">Budget Achievement</div>
                </div>
              </div>

              {exec.narrativeSummary && (
                <div className="narrative-box">
                  <p>{exec.narrativeSummary}</p>
                </div>
              )}

              {/* Critical Alerts */}
              {exec.criticalAlerts?.length > 0 && (
                <div className="alerts-section">
                  <h4>🔴 Critical Alerts</h4>
                  {exec.criticalAlerts.map((alert, i) => (
                    <div key={i} className="alert-item critical">{alert.message}</div>
                  ))}
                </div>
              )}

              {/* Warnings */}
              {exec.warnings?.length > 0 && (
                <div className="alerts-section">
                  <h4>🟡 Warnings</h4>
                  {exec.warnings.map((alert, i) => (
                    <div key={i} className="alert-item warning">{alert.message}</div>
                  ))}
                </div>
              )}

              {/* Positive Trends */}
              {exec.positiveTrends?.length > 0 && (
                <div className="alerts-section">
                  <h4>🟢 Positive Trends</h4>
                  {exec.positiveTrends.map((trend, i) => (
                    <div key={i} className="alert-item positive">{trend.message}</div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* P&L Analysis */}
          {pl?.currentPeriod && (
            <section className="report-section">
              <h2>💰 P&L Analysis</h2>
              
              <div className="pl-summary">
                <div className="pl-row">
                  <span className="pl-label">Sales</span>
                  <span className="pl-value">{formatCurrency(pl.currentPeriod.sales)}</span>
                </div>
                <div className="pl-row">
                  <span className="pl-label">Material Cost</span>
                  <span className="pl-value negative">({formatCurrency(pl.currentPeriod.materialCost)})</span>
                </div>
                <div className="pl-row highlight">
                  <span className="pl-label">Gross Profit</span>
                  <span className="pl-value">{formatCurrency(pl.currentPeriod.grossProfit)} ({(pl.currentPeriod.grossProfitPct || 0).toFixed(1)}%)</span>
                </div>
                <div className="pl-row">
                  <span className="pl-label">EBITDA</span>
                  <span className="pl-value">{formatCurrency(pl.currentPeriod.ebitda)} ({(pl.currentPeriod.ebitdaPct || 0).toFixed(1)}%)</span>
                </div>
                <div className="pl-row">
                  <span className="pl-label">Net Profit</span>
                  <span className="pl-value">{formatCurrency(pl.currentPeriod.netProfit)} ({(pl.currentPeriod.netProfitPct || 0).toFixed(1)}%)</span>
                </div>
              </div>

              {pl.insights?.length > 0 && (
                <div className="insights-list">
                  <h4>Key Observations:</h4>
                  <ul>
                    {pl.insights.map((insight, i) => (
                      <li key={i}>{insight}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {/* Budget Tracking */}
          {budget && budget.budget > 0 && (
            <section className="report-section">
              <h2>🎯 Budget Performance</h2>
              
              <div className="budget-summary">
                <div className="budget-row">
                  <span>Actual:</span>
                  <span className="value">{formatCurrency(budget.actual)}</span>
                </div>
                <div className="budget-row">
                  <span>Budget:</span>
                  <span className="value">{formatCurrency(budget.budget)}</span>
                </div>
                <div className="budget-row highlight">
                  <span>Achievement:</span>
                  <span className={`value ${(budget.achievementPct || 0) >= 100 ? 'positive' : 'negative'}`}>
                    {(budget.achievementPct || 0).toFixed(1)}%
                  </span>
                </div>
                <div className="budget-row">
                  <span>Gap:</span>
                  <span className={`value ${(budget.gap || 0) >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(budget.gap)}
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* Sales Reps Performance */}
          {salesReps?.topPerformers?.length > 0 && (
            <section className="report-section">
              <h2>👥 Sales Team Performance</h2>
              
              <p className="section-summary">
                {salesReps.summary?.totalReps || 0} sales reps, 
                {' '}{salesReps.summary?.onTrack || 0} on track, 
                Average achievement: {(salesReps.summary?.averageAchievement || 0).toFixed(1)}%
              </p>
              
              <div className="performers-grid">
                <div className="performers-column">
                  <h4>🏆 Top Performers</h4>
                  {salesReps.topPerformers.slice(0, 5).map((rep, i) => (
                    <div key={i} className="performer-item positive">
                      <span className="rank">{i + 1}.</span>
                      <span className="name">{rep.name}</span>
                      <span className="value">{formatCurrency(rep.amount)}</span>
                      <span className="pct">{rep.achievement ? `(${rep.achievement.toFixed(0)}%)` : ''}</span>
                    </div>
                  ))}
                </div>
                
                {salesReps.needsAttention?.length > 0 && (
                  <div className="performers-column">
                    <h4>⚠️ Needs Attention</h4>
                    {salesReps.needsAttention.slice(0, 5).map((rep, i) => (
                      <div key={i} className="performer-item warning">
                        <span className="name">{rep.name}</span>
                        <span className="value">{(rep.achievement || 0).toFixed(0)}% of target</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Customer Insights */}
          {customers?.paretoAnalysis?.length > 0 && (
            <section className="report-section">
              <h2>🏢 Customer Analysis</h2>
              
              <p className="section-summary">
                Top 20% of customers contribute {(customers.top20Contribution || 0).toFixed(1)}% of revenue.
                Total {customers.totalCustomers || 0} active customers this period.
              </p>
              
              <div className="top-list">
                <h4>Top Customers by Sales</h4>
                {customers.paretoAnalysis.slice(0, 5).map((cust, i) => (
                  <div key={i} className="list-item">
                    <span className="rank">{i + 1}.</span>
                    <span className="name">{cust.customername}</span>
                    <span className="value">{formatCurrency(cust.amount)}</span>
                    <span className="pct">({(cust.cumulativeShare || 0).toFixed(1)}% cumulative)</span>
                  </div>
                ))}
              </div>

              {customers.concentrationRisk && (
                <div className="insight-box warning">
                  <strong>Concentration Risk:</strong> {customers.concentrationRisk}
                </div>
              )}
            </section>
          )}

          {/* Product Performance */}
          {products?.topByRevenue?.length > 0 && (
            <section className="report-section">
              <h2>📦 Product Performance</h2>
              
              <p className="section-summary">
                {products.summary?.totalProducts || 0} product groups, 
                Avg ASP: {formatCurrency(products.summary?.avgASP || 0)}/kg
              </p>
              
              <div className="top-list">
                <h4>Top Products by Revenue</h4>
                {products.topByRevenue.slice(0, 5).map((prod, i) => (
                  <div key={i} className="list-item">
                    <span className="rank">{i + 1}.</span>
                    <span className="name">{prod.name}</span>
                    <span className="value">{formatCurrency(prod.amount)}</span>
                    <span className="pct">({(prod.shareOfSales || 0).toFixed(1)}%)</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Risk Alerts */}
          {risks.length > 0 && (
            <section className="report-section">
              <h2>⚠️ Risk Alerts</h2>
              
              {risks.map((risk, i) => (
                <div key={i} className={`risk-card ${risk.severity}`}>
                  <div className="risk-header">
                    <span className={`severity-badge ${risk.severity}`}>
                      {risk.severity === 'critical' ? '🔴' : '🟡'} {risk.severity}
                    </span>
                    <strong>{risk.title}</strong>
                  </div>
                  <p className="risk-description">{risk.description}</p>
                  {risk.recommendation && (
                    <p className="risk-recommendation">
                      <strong>Recommendation:</strong> {risk.recommendation}
                    </p>
                  )}
                </div>
              ))}
            </section>
          )}

          {/* AI Recommendations */}
          {recommendations.length > 0 && (
            <section className="report-section">
              <h2>💡 AI Recommendations</h2>
              
              {recommendations.map((rec, i) => (
                <div key={i} className="recommendation-card">
                  <div className="rec-header">
                    <span className="rec-number">{i + 1}</span>
                    <strong>{rec.title}</strong>
                    {rec.priority && (
                      <span className={`priority-badge ${rec.priority}`}>{rec.priority}</span>
                    )}
                  </div>
                  <p className="rec-description">{rec.description}</p>
                  {rec.impactDescription && (
                    <p className="rec-impact">
                      <strong>Expected Impact:</strong> {rec.impactDescription}
                    </p>
                  )}
                </div>
              ))}
            </section>
          )}

          {/* Footer */}
          <div className="report-footer">
            <p>Report generated by PEBI AI Analysis Engine</p>
            <p>Data source: Dashboard Cards (with exclusions and filters applied)</p>
          </div>
        </div>
      )}
    </div>
  );
}
