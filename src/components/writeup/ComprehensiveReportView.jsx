/**
 * ComprehensiveReportView.jsx
 * AI-Powered Comprehensive Division Report
 * 
 * Generates intelligent, data-driven reports covering:
 * - Executive Summary with Health Score
 * - P&L Analysis
 * - Sales Rep Evaluation
 * - Customer Insights
 * - Product Performance
 * - Budget Tracking
 * - Geographic Analysis
 * - Risk Alerts
 * - AI Recommendations
 */

import React, { useState, useCallback, useRef } from 'react';
import { useFilter } from '../../contexts/FilterContext';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useDivisionNames } from '../../utils/useDivisionNames';
import { authClient } from '../../utils/authClient';
// html2pdf.js is a CJS/UMD module — loaded dynamically at call site to avoid ESM default-export crash
import './ComprehensiveReportView.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// Tab configuration
const REPORT_TABS = [
  { id: 'executive', label: '📊 Executive', icon: '📊' },
  { id: 'pl', label: '💰 P&L', icon: '💰' },
  { id: 'salesreps', label: '👥 Sales Reps', icon: '👥' },
  { id: 'customers', label: '🏢 Customers', icon: '🏢' },
  { id: 'products', label: '📦 Products', icon: '📦' },
  { id: 'budget', label: '🎯 Budget', icon: '🎯' },
  { id: 'geography', label: '🌍 Geography', icon: '🌍' },
  { id: 'risks', label: '⚠️ Risks', icon: '⚠️' },
  { id: 'actions', label: '💡 Actions', icon: '💡' }
];

export default function ComprehensiveReportView() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('executive');
  const [feedbackSent, setFeedbackSent] = useState({});
  const reportRef = useRef(null);

  const { selectedDivision } = useExcelData();
  const { columnOrder, basePeriodIndex } = useFilter();
  const { companyCurrency } = useCurrency();
  const { divisionNames } = useDivisionNames();
  const currencyCode = companyCurrency?.code || 'AED';

  // Format currency
  const formatCurrency = useCallback((value) => {
    const n = Number(value) || 0;
    if (Math.abs(n) >= 1000000) return `${currencyCode} ${(n / 1000000).toFixed(2)}M`;
    if (Math.abs(n) >= 1000) return `${currencyCode} ${(n / 1000).toFixed(1)}K`;
    return `${currencyCode} ${n.toFixed(0)}`;
  }, [currencyCode]);

  // Generate AI Report
  const generateReport = useCallback(async () => {
    if (!selectedDivision) {
      setError('Please select a division first');
      return;
    }

    setLoading(true);
    setError(null);
    setReport(null);

    try {
      // Get period info from filter context
      const periods = columnOrder || [];
      const basePeriod = periods[basePeriodIndex] || periods[0];

      if (!basePeriod) {
        throw new Error('No period selected. Please select a period in the dashboard.');
      }

      // Helper to expand period month to actual month names
      const expandMonths = (period) => {
        // If period has a months array, use it
        if (period.months && Array.isArray(period.months)) {
          return period.months;
        }
        
        // Handle special period types
        const month = period.month;
        const fullYear = ['January', 'February', 'March', 'April', 'May', 'June', 
                         'July', 'August', 'September', 'October', 'November', 'December'];
        
        if (month === 'FY') return fullYear;
        if (month === 'HY1') return fullYear.slice(0, 6);
        if (month === 'HY2') return fullYear.slice(6);
        if (month === 'Q1') return ['January', 'February', 'March'];
        if (month === 'Q2') return ['April', 'May', 'June'];
        if (month === 'Q3') return ['July', 'August', 'September'];
        if (month === 'Q4') return ['October', 'November', 'December'];
        
        // Single month
        return [month];
      };

      // Build period parameters with properly expanded months
      const basePeriodParams = {
        year: basePeriod.year,
        months: expandMonths(basePeriod),
        type: basePeriod.type || 'Actual'
      };

      // Get comparison period (next in list or last one)
      let compPeriodParams = null;
      if (periods.length > 1) {
        const compIndex = basePeriodIndex < periods.length - 1 ? basePeriodIndex + 1 : 0;
        const compPeriod = periods[compIndex];
        if (compPeriod && compPeriod.id !== basePeriod.id) {
          compPeriodParams = {
            year: compPeriod.year,
            months: expandMonths(compPeriod),
            type: compPeriod.type || 'Actual'
          };
        }
      }


      const response = await authClient.fetch(`/api/report-ai/${selectedDivision}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          basePeriod: basePeriodParams,
          compPeriod: compPeriodParams,
          options: {}
        })
      });


      // authClient.fetch returns parsed JSON directly
      if (response.success && response.report) {
        setReport(response.report);
      } else if (response.success && response.data) {
        setReport(response.data);
      } else {
        throw new Error(response.error || 'Failed to generate report - no data returned');
      }

    } catch (err) {
      console.error('❌ Error generating report:', err);
      setError(err.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  }, [selectedDivision, columnOrder, basePeriodIndex]);

  // Send feedback on an insight
  const sendFeedback = useCallback(async (insightId, insightType, feedbackType) => {
    try {
      await authClient.fetch(`/api/report-ai/${selectedDivision}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          insightId,
          insightType,
          feedbackType
        })
      });
      
      setFeedbackSent(prev => ({ ...prev, [insightId]: feedbackType }));
    } catch (err) {
      console.error('Error sending feedback:', err);
    }
  }, [selectedDivision]);

  // Export report to PDF or Word
  const exportReport = useCallback(async (format) => {
    if (!reportRef.current || !report) {
      console.error('No report to export');
      return;
    }

    const divisionName = divisionNames[selectedDivision] || selectedDivision;
    const filename = `AI_Report_${divisionName}_${new Date().toISOString().split('T')[0]}`;

    if (format === 'pdf') {
      // Configure PDF options
      const opt = {
        margin: [10, 10, 10, 10],
        filename: `${filename}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          logging: false
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4', 
          orientation: 'portrait'
        }
      };

      try {
        // Clone the element to modify for export
        const element = reportRef.current.cloneNode(true);
        
        // Remove buttons and interactive elements from clone
        element.querySelectorAll('.generate-btn, .export-btn, .tab-btn, .feedback-buttons').forEach(el => el.remove());
        
        // Generate PDF (dynamic import avoids ESM/CJS default-export crash)
        const html2pdfMod = await import('html2pdf.js');
        const html2pdf = html2pdfMod.default ?? html2pdfMod;
        await html2pdf().set(opt).from(element).save();
      } catch (err) {
        console.error('❌ PDF export failed:', err);
        alert('Failed to export PDF. Please try again.');
      }
    } else if (format === 'word') {
      // Generate HTML content for Word
      try {
        const htmlContent = generateWordContent();
        const blob = new Blob([htmlContent], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}.doc`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('❌ Word export failed:', err);
        alert('Failed to export Word document. Please try again.');
      }
    }
  }, [report, selectedDivision, divisionNames]);

  // Generate Word-compatible HTML content
  const generateWordContent = useCallback(() => {
    if (!report) return '';
    
    const divisionName = divisionNames[selectedDivision] || selectedDivision;
    const exec = report.executiveSummary;
    const pl = report.plAnalysis;
    const budget = report.budgetTracking;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>AI-Powered Comprehensive Report - ${divisionName}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #1e40af; border-bottom: 2px solid #1e40af; padding-bottom: 10px; }
          h2 { color: #374151; margin-top: 30px; }
          h3 { color: #6b7280; }
          .metric { display: inline-block; margin: 10px 20px 10px 0; }
          .metric-value { font-size: 24px; font-weight: bold; color: #1e40af; }
          .metric-label { font-size: 12px; color: #6b7280; }
          .alert { padding: 10px; margin: 5px 0; border-radius: 4px; }
          .alert-critical { background: #fee2e2; border-left: 4px solid #dc2626; }
          .alert-warning { background: #fef3c7; border-left: 4px solid #f59e0b; }
          .alert-positive { background: #d1fae5; border-left: 4px solid #10b981; }
          table { border-collapse: collapse; width: 100%; margin: 15px 0; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background: #f3f4f6; }
        </style>
      </head>
      <body>
        <h1>🤖 AI-Powered Comprehensive Report</h1>
        <p><strong>Division:</strong> ${divisionName}</p>
        <p><strong>Generated:</strong> ${new Date(report.metadata?.generatedAt).toLocaleString()}</p>
        
        <h2>📊 Executive Summary</h2>
        <div class="metric">
          <div class="metric-value">${exec?.healthScore?.toFixed(1) || '-'}/10</div>
          <div class="metric-label">Health Score</div>
        </div>
        <div class="metric">
          <div class="metric-value">${formatCurrency(exec?.keyMetrics?.totalSales || 0)}</div>
          <div class="metric-label">Total Sales</div>
        </div>
        <div class="metric">
          <div class="metric-value">${exec?.keyMetrics?.grossProfitPct?.toFixed(1) || '-'}%</div>
          <div class="metric-label">Gross Profit %</div>
        </div>
        <div class="metric">
          <div class="metric-value">${exec?.keyMetrics?.budgetAchievementPct?.toFixed(1) || '-'}%</div>
          <div class="metric-label">Budget Achievement</div>
        </div>
        
        <p>${exec?.narrativeSummary || ''}</p>
        
        ${exec?.criticalAlerts?.length > 0 ? `
          <h3>🔴 Critical Alerts</h3>
          ${exec.criticalAlerts.map(a => `<div class="alert alert-critical">${a.message}</div>`).join('')}
        ` : ''}
        
        ${exec?.warnings?.length > 0 ? `
          <h3>🟡 Warnings</h3>
          ${exec.warnings.map(a => `<div class="alert alert-warning">${a.message}</div>`).join('')}
        ` : ''}
        
        ${exec?.positiveTrends?.length > 0 ? `
          <h3>🟢 Positive Trends</h3>
          ${exec.positiveTrends.map(a => `<div class="alert alert-positive">${a.message}</div>`).join('')}
        ` : ''}
        
        <h2>💰 P&L Analysis</h2>
        <table>
          <tr><th>Metric</th><th>Value</th></tr>
          <tr><td>Sales</td><td>${formatCurrency(pl?.currentPeriod?.sales || 0)}</td></tr>
          <tr><td>Material Cost</td><td>${formatCurrency(pl?.currentPeriod?.materialCost || 0)}</td></tr>
          <tr><td>Gross Profit</td><td>${formatCurrency(pl?.currentPeriod?.grossProfit || 0)}</td></tr>
          <tr><td>Gross Profit %</td><td>${pl?.currentPeriod?.grossProfitPct?.toFixed(1) || '-'}%</td></tr>
          <tr><td>EBITDA</td><td>${formatCurrency(pl?.currentPeriod?.ebitda || 0)}</td></tr>
          <tr><td>EBITDA %</td><td>${pl?.currentPeriod?.ebitdaPct?.toFixed(1) || '-'}%</td></tr>
        </table>
        
        ${budget ? `
          <h2>🎯 Budget Tracking</h2>
          <table>
            <tr><th>Metric</th><th>Value</th></tr>
            <tr><td>Actual</td><td>${formatCurrency(budget.actual || 0)}</td></tr>
            <tr><td>Budget</td><td>${formatCurrency(budget.budget || 0)}</td></tr>
            <tr><td>Achievement</td><td>${budget.achievementPct?.toFixed(1) || '-'}%</td></tr>
            <tr><td>Gap</td><td>${formatCurrency(budget.gap || 0)}</td></tr>
          </table>
        ` : ''}
        
        ${report.riskAlerts?.length > 0 ? `
          <h2>⚠️ Risk Alerts</h2>
          ${report.riskAlerts.map(r => `
            <div class="alert alert-${r.severity === 'critical' ? 'critical' : 'warning'}">
              <strong>${r.title}</strong><br>
              ${r.description}<br>
              <em>Recommendation: ${r.recommendation}</em>
            </div>
          `).join('')}
        ` : ''}
        
        ${report.recommendations?.length > 0 ? `
          <h2>💡 AI Recommendations</h2>
          ${report.recommendations.map((r, idx) => `
            <div style="margin: 10px 0; padding: 10px; background: #f3f4f6; border-radius: 4px;">
              <strong>${idx + 1}. ${r.title}</strong><br>
              ${r.description}<br>
              <em>Expected Impact: ${r.impactDescription}</em>
            </div>
          `).join('')}
        ` : ''}
        
        <hr>
        <p style="color: #6b7280; font-size: 12px;">
          Report generated by AI-Powered Analysis System
        </p>
      </body>
      </html>
    `;
  }, [report, selectedDivision, divisionNames, formatCurrency]);

  // Render health score gauge
  const renderHealthScore = (score) => {
    const color = score >= 8 ? '#22c55e' : score >= 6 ? '#eab308' : '#ef4444';
    const percentage = (score / 10) * 100;
    
    return (
      <div className="health-score-container">
        <div className="health-score-gauge">
          <svg viewBox="0 0 100 60" className="gauge-svg">
            <path
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="8"
            />
            <path
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeDasharray={`${percentage * 1.26} 126`}
              strokeLinecap="round"
            />
          </svg>
          <div className="health-score-value" style={{ color }}>
            {score.toFixed(1)}
          </div>
          <div className="health-score-label">Health Score</div>
        </div>
      </div>
    );
  };

  // Render feedback buttons
  const renderFeedbackButtons = (insightId, insightType) => {
    const sent = feedbackSent[insightId];
    
    if (sent) {
      return (
        <span className="feedback-sent">
          {sent === 'helpful' ? '👍 Thanks!' : sent === 'acted_upon' ? '✅ Noted!' : '📝 Noted'}
        </span>
      );
    }
    
    return (
      <div className="feedback-buttons">
        <button 
          className="feedback-btn helpful"
          onClick={() => sendFeedback(insightId, insightType, 'helpful')}
          title="This was helpful"
        >
          👍
        </button>
        <button 
          className="feedback-btn not-helpful"
          onClick={() => sendFeedback(insightId, insightType, 'not_helpful')}
          title="Not helpful"
        >
          👎
        </button>
        <button 
          className="feedback-btn acted"
          onClick={() => sendFeedback(insightId, insightType, 'acted_upon')}
          title="I acted on this"
        >
          ✅
        </button>
      </div>
    );
  };

  // Render Executive Summary tab
  const renderExecutiveSummary = () => {
    
    const exec = report?.executiveSummary;
    if (!exec) return <div className="tab-empty">No executive data available. Check console for details.</div>;

    return (
      <div className="executive-summary">
        {renderHealthScore(exec.healthScore)}

        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-value">{formatCurrency(exec.keyMetrics?.totalSales)}</div>
            <div className="metric-label">Total Sales</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{exec.keyMetrics?.grossProfitPct?.toFixed(1)}%</div>
            <div className="metric-label">Gross Profit %</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{exec.keyMetrics?.budgetAchievementPct?.toFixed(1)}%</div>
            <div className="metric-label">Budget Achievement</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{exec.keyMetrics?.customerCount || 0}</div>
            <div className="metric-label">Active Customers</div>
          </div>
        </div>

        <div className="narrative-summary">
          <p>{exec.narrativeSummary}</p>
        </div>

        {exec.criticalAlerts?.length > 0 && (
          <div className="alerts-section">
            <h4>🔴 Critical Alerts ({exec.criticalAlerts.length})</h4>
            {exec.criticalAlerts.map((alert, idx) => (
              <div key={idx} className="alert-item critical">
                <span className="alert-message">{alert.message}</span>
                {renderFeedbackButtons(`alert_${idx}`, 'alert')}
              </div>
            ))}
          </div>
        )}

        {exec.warnings?.length > 0 && (
          <div className="alerts-section">
            <h4>🟡 Warnings ({exec.warnings.length})</h4>
            {exec.warnings.map((alert, idx) => (
              <div key={idx} className="alert-item warning">
                <span className="alert-message">{alert.message}</span>
                {renderFeedbackButtons(`warning_${idx}`, 'warning')}
              </div>
            ))}
          </div>
        )}

        {exec.positiveTrends?.length > 0 && (
          <div className="alerts-section">
            <h4>🟢 Positive Trends ({exec.positiveTrends.length})</h4>
            {exec.positiveTrends.map((trend, idx) => (
              <div key={idx} className="alert-item positive">
                <span className="alert-message">{trend.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Render P&L Analysis tab
  const renderPLAnalysis = () => {
    const pl = report?.plAnalysis;
    if (!pl) return <div className="tab-empty">No P&L data available</div>;

    return (
      <div className="pl-analysis">
        <div className="section-header">
          <h3>P&L Summary</h3>
          <span className={`status-badge ${pl.marginAnalysis?.status}`}>
            {pl.marginAnalysis?.status?.replace('-', ' ')}
          </span>
        </div>

        <div className="pl-metrics">
          <div className="pl-metric">
            <span className="label">Sales</span>
            <span className="value">{formatCurrency(pl.currentPeriod?.sales)}</span>
          </div>
          <div className="pl-metric">
            <span className="label">Material Cost</span>
            <span className="value">{formatCurrency(pl.currentPeriod?.materialCost)}</span>
          </div>
          <div className="pl-metric">
            <span className="label">Gross Profit</span>
            <span className="value">{formatCurrency(pl.currentPeriod?.grossProfit)}</span>
            <span className="pct">{pl.currentPeriod?.grossProfitPct?.toFixed(1)}%</span>
          </div>
          <div className="pl-metric">
            <span className="label">EBITDA</span>
            <span className="value">{formatCurrency(pl.currentPeriod?.ebitda)}</span>
            <span className="pct">{pl.currentPeriod?.ebitdaPct?.toFixed(1)}%</span>
          </div>
        </div>

        {pl.comparison && (
          <div className="comparison-section">
            <h4>vs Comparison Period</h4>
            <div className="comparison-metrics">
              <div className={`change-indicator ${pl.comparison.salesChange >= 0 ? 'positive' : 'negative'}`}>
                Sales: {pl.comparison.salesChange >= 0 ? '↑' : '↓'} {Math.abs(pl.comparison.salesChange).toFixed(1)}%
              </div>
              <div className={`change-indicator ${pl.comparison.gpChange >= 0 ? 'positive' : 'negative'}`}>
                GP%: {pl.comparison.gpChange >= 0 ? '↑' : '↓'} {Math.abs(pl.comparison.gpChange).toFixed(1)}pp
              </div>
            </div>
          </div>
        )}

        {pl.insights?.length > 0 && (
          <div className="insights-section">
            <h4>Key Insights</h4>
            {pl.insights.map((insight, idx) => (
              <div key={idx} className={`insight-item ${insight.type}`}>
                {insight.message}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Render Sales Rep Evaluation tab
  const renderSalesReps = () => {
    const reps = report?.salesRepEvaluation;
    if (!reps) return <div className="tab-empty">No sales rep data available</div>;

    return (
      <div className="sales-reps-analysis">
        <div className="summary-stats">
          <div className="stat">
            <span className="value">{reps.summary?.totalReps || 0}</span>
            <span className="label">Total Reps</span>
          </div>
          <div className="stat">
            <span className="value green">{reps.summary?.onTrack || 0}</span>
            <span className="label">On Track</span>
          </div>
          <div className="stat">
            <span className="value red">{reps.summary?.atRisk || 0}</span>
            <span className="label">At Risk</span>
          </div>
        </div>

        {reps.topPerformers?.length > 0 && (
          <div className="rep-section">
            <h4>🏆 Top Performers</h4>
            <div className="rep-list">
              {reps.topPerformers.map((rep, idx) => (
                <div key={idx} className="rep-card top">
                  <div className="rep-name">{rep.name}</div>
                  <div className="rep-stats">
                    <span>{formatCurrency(rep.amount)}</span>
                    <span className="achievement">{rep.achievement?.toFixed(0)}% of budget</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {reps.needsAttention?.length > 0 && (
          <div className="rep-section">
            <h4>⚠️ Needs Attention</h4>
            <div className="rep-list">
              {reps.needsAttention.map((rep, idx) => (
                <div key={idx} className="rep-card attention">
                  <div className="rep-name">{rep.name}</div>
                  <div className="rep-stats">
                    <span>{formatCurrency(rep.amount)}</span>
                    <span className="achievement low">{rep.achievement?.toFixed(0)}% of budget</span>
                  </div>
                  {renderFeedbackButtons(`rep_${rep.name}`, 'sales_rep')}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render Customer Insights tab
  const renderCustomers = () => {
    const customers = report?.customerInsights;
    if (!customers) return <div className="tab-empty">No customer data available</div>;

    return (
      <div className="customer-insights">
        <div className="summary-stats">
          <div className="stat">
            <span className="value">{customers.totalCustomers || 0}</span>
            <span className="label">Total Customers</span>
          </div>
          <div className="stat">
            <span className="value">{customers.top20Contribution?.toFixed(1)}%</span>
            <span className="label">Top 20% Revenue</span>
          </div>
        </div>

        {customers.paretoAnalysis?.length > 0 && (
          <div className="customer-section">
            <h4>📊 Top Customers (Pareto)</h4>
            <div className="customer-table">
              <div className="table-header">
                <span>Rank</span>
                <span>Customer</span>
                <span>Revenue</span>
                <span>Cumulative</span>
              </div>
              {customers.paretoAnalysis.slice(0, 10).map((cust, idx) => (
                <div key={idx} className="table-row">
                  <span>#{cust.rank}</span>
                  <span className="customer-name">{cust.customername}</span>
                  <span>{formatCurrency(cust.amount)}</span>
                  <span>{cust.cumulativeShare?.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {customers.insights?.length > 0 && (
          <div className="insights-list">
            {customers.insights.map((insight, idx) => (
              <div key={idx} className={`insight-card ${insight.type}`}>
                {insight.message}
                {renderFeedbackButtons(`cust_insight_${idx}`, 'customer')}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Render Products tab
  const renderProducts = () => {
    const products = report?.productPerformance;
    if (!products) return <div className="tab-empty">No product data available</div>;

    return (
      <div className="product-performance">
        <div className="summary-stats">
          <div className="stat">
            <span className="value">{products.summary?.totalProducts || 0}</span>
            <span className="label">Product Groups</span>
          </div>
          <div className="stat">
            <span className="value">{formatCurrency(products.summary?.avgASP || 0)}</span>
            <span className="label">Avg. Selling Price</span>
          </div>
        </div>

        {products.topByRevenue?.length > 0 && (
          <div className="product-section">
            <h4>💰 Top by Revenue</h4>
            <div className="product-list">
              {products.topByRevenue.map((prod, idx) => (
                <div key={idx} className="product-card">
                  <div className="product-name">{prod.name}</div>
                  <div className="product-stats">
                    <span>{formatCurrency(prod.amount)}</span>
                    <span>{prod.shareOfSales?.toFixed(1)}% share</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render Budget tab
  const renderBudget = () => {
    const budget = report?.budgetTracking;
    if (!budget) return <div className="tab-empty">No budget data available</div>;

    return (
      <div className="budget-tracking">
        <div className={`budget-status ${budget.status}`}>
          <h3>{budget.status === 'on-track' ? '✅' : budget.status === 'at-risk' ? '⚠️' : '🔴'} Budget Status</h3>
          <span className="status-label">{budget.status?.replace('-', ' ').toUpperCase()}</span>
        </div>

        <div className="budget-metrics">
          <div className="budget-metric">
            <span className="label">Actual</span>
            <span className="value">{formatCurrency(budget.actual)}</span>
          </div>
          <div className="budget-metric">
            <span className="label">Budget</span>
            <span className="value">{formatCurrency(budget.budget)}</span>
          </div>
          <div className="budget-metric">
            <span className="label">Achievement</span>
            <span className={`value ${budget.achievementPct >= 90 ? 'green' : budget.achievementPct >= 70 ? 'yellow' : 'red'}`}>
              {budget.achievementPct?.toFixed(1)}%
            </span>
          </div>
          <div className="budget-metric">
            <span className="label">Gap</span>
            <span className={`value ${budget.gap > 0 ? 'red' : 'green'}`}>
              {formatCurrency(budget.gap)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Render Geography tab
  const renderGeography = () => {
    const geo = report?.geographicAnalysis;
    if (!geo) return <div className="tab-empty">No geographic data available</div>;

    return (
      <div className="geographic-analysis">
        <div className="summary-stats">
          <div className="stat">
            <span className="value">{geo.marketCount || 0}</span>
            <span className="label">Markets</span>
          </div>
          <div className="stat">
            <span className="value">{geo.concentration?.toFixed(1)}%</span>
            <span className="label">Top 3 Concentration</span>
          </div>
        </div>

        {geo.topMarkets?.length > 0 && (
          <div className="markets-section">
            <h4>🌍 Top Markets</h4>
            <div className="markets-list">
              {geo.topMarkets.map((market, idx) => (
                <div key={idx} className="market-card">
                  <span className="country">{market.country}</span>
                  <span className="amount">{formatCurrency(market.amount)}</span>
                  <span className="share">{market.shareOfSales?.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render Risks tab
  const renderRisks = () => {
    const risks = report?.riskAlerts;
    if (!risks || risks.length === 0) {
      return <div className="tab-empty">No risks identified - looking good! 🎉</div>;
    }

    return (
      <div className="risk-alerts">
        <h3>Identified Risks ({risks.length})</h3>
        {risks.map((risk, idx) => (
          <div key={idx} className={`risk-card ${risk.severity}`}>
            <div className="risk-header">
              <span className={`severity-badge ${risk.severity}`}>{risk.severity}</span>
              <span className="risk-title">{risk.title}</span>
            </div>
            <p className="risk-description">{risk.description}</p>
            <div className="risk-details">
              <div><strong>Impact:</strong> {risk.impact}</div>
              <div><strong>Recommendation:</strong> {risk.recommendation}</div>
            </div>
            {renderFeedbackButtons(`risk_${idx}`, 'risk')}
          </div>
        ))}
      </div>
    );
  };

  // Render Actions/Recommendations tab
  const renderActions = () => {
    const recs = report?.recommendations;
    if (!recs || recs.length === 0) {
      return <div className="tab-empty">No recommendations at this time</div>;
    }

    return (
      <div className="recommendations">
        <h3>AI Recommendations</h3>
        <p className="subtitle">Ranked by expected impact × confidence</p>

        {recs.map((rec, idx) => (
          <div key={idx} className={`recommendation-card priority-${rec.priority}`}>
            <div className="rec-header">
              <span className="priority">#{rec.priority}</span>
              <span className="rec-title">{rec.title}</span>
              <span className="confidence">{(rec.confidence * 100).toFixed(0)}% confidence</span>
            </div>
            <p className="rec-description">{rec.description}</p>
            
            {rec.expectedImpact > 0 && (
              <div className="expected-impact">
                <strong>Expected Impact:</strong> {rec.impactDescription || formatCurrency(rec.expectedImpact)}
              </div>
            )}

            {rec.actions?.length > 0 && (
              <div className="action-list">
                <strong>Actions:</strong>
                <ul>
                  {rec.actions.map((action, actionIdx) => (
                    <li key={actionIdx}>{action}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rec-footer">
              <span className={`effort ${rec.effort}`}>Effort: {rec.effort}</span>
              {renderFeedbackButtons(rec.id, 'recommendation')}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render current tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'executive': return renderExecutiveSummary();
      case 'pl': return renderPLAnalysis();
      case 'salesreps': return renderSalesReps();
      case 'customers': return renderCustomers();
      case 'products': return renderProducts();
      case 'budget': return renderBudget();
      case 'geography': return renderGeography();
      case 'risks': return renderRisks();
      case 'actions': return renderActions();
      default: return renderExecutiveSummary();
    }
  };

  return (
    <div className="comprehensive-report-container" ref={reportRef}>
      <div className="report-header">
        <div className="header-left">
          <h2>🤖 AI-Powered Comprehensive Report</h2>
          <span className="division-badge">{divisionNames[selectedDivision] || selectedDivision}</span>
        </div>
        <div className="header-right">
          {report && (
            <>
              <button
                className="export-btn"
                onClick={() => exportReport('pdf')}
                disabled={loading}
              >
                📄 Export PDF
              </button>
              <button
                className="export-btn"
                onClick={() => exportReport('word')}
                disabled={loading}
              >
                📝 Export Word
              </button>
            </>
          )}
          <button
            className="generate-btn"
            onClick={generateReport}
            disabled={loading}
          >
            {loading ? '⏳ Generating...' : '✨ Generate Report'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          ❌ {error}
        </div>
      )}

      {!report && !loading && !error && (
        <div className="welcome-message">
          <div className="welcome-icon">📊</div>
          <h3>AI-Powered Division Intelligence</h3>
          <p>
            Generate a comprehensive report that analyzes your division's performance across
            all dimensions: P&L, sales reps, customers, products, budget, and more.
          </p>
          <div className="feature-list">
            <div className="feature">📈 Health Score & Executive Summary</div>
            <div className="feature">💰 P&L Deep Dive Analysis</div>
            <div className="feature">👥 Sales Rep Performance Evaluation</div>
            <div className="feature">🏢 Customer Insights & Pareto Analysis</div>
            <div className="feature">📦 Product Performance Metrics</div>
            <div className="feature">🎯 Budget Tracking & Projections</div>
            <div className="feature">⚠️ Risk Identification</div>
            <div className="feature">💡 AI-Powered Recommendations</div>
          </div>
          <p className="instruction">
            Click <strong>"Generate Report"</strong> to start. Make sure you have selected a period in the dashboard.
          </p>
        </div>
      )}

      {loading && (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Analyzing division data...</p>
          <p className="loading-sub">This may take a few seconds</p>
        </div>
      )}

      {report && (
        <>
          <div className="report-meta">
            <span>Generated: {new Date(report.metadata?.generatedAt).toLocaleString()}</span>
            <span>•</span>
            <span>{report.metadata?.generationTimeMs}ms</span>
          </div>

          <div className="report-tabs">
            {REPORT_TABS.map(tab => (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="tab-content">
            {renderTabContent()}
          </div>
        </>
      )}
    </div>
  );
}
