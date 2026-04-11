/**
 * AI Learning Dashboard
 * 
 * Displays AI learning status, predictions, and insights.
 * Allows admins to trigger learning cycles manually.
 * 
 * Features:
 * - Learning status overview
 * - High-risk churn customers
 * - Sales rep clusters visualization
 * - Customer segments breakdown
 * - Run learning button (admin only)
 * 
 * @version 1.0
 * @date December 27, 2025
 */

import React, { useState, useEffect, useCallback } from 'react';
import { authClient } from '../../utils/authClient';
import './AILearningDashboard.css';

const AILearningDashboard = ({ division = 'FP' }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [learningStatus, setLearningStatus] = useState(null);
  const [churnRisks, setChurnRisks] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [segments, setSegments] = useState([]);
  const [seasonality, setSeasonality] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  
  // New state for additional panels
  const [prescriptiveActions, setPrescriptiveActions] = useState([]);
  const [supplyChain, setSupplyChain] = useState(null);
  const [financialHealth, setFinancialHealth] = useState(null);
  const [productInsights, setProductInsights] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch all AI learning data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch learning status
      const statusRes = await authClient.fetch(`/api/ai-learning/${division}/auto/status`);
      if (statusRes.success) {
        setLearningStatus(statusRes.data);
      }

      // Fetch high-risk churn customers
      try {
        const churnRes = await authClient.fetch(`/api/ai-learning/${division}/customers/high-risk`);
        if (churnRes.success) {
          setChurnRisks(churnRes.data || []);
        }
      } catch (e) {
        console.warn('Churn data not available:', e.message);
      }

      // Fetch sales rep clusters
      try {
        const clusterRes = await authClient.fetch(`/api/ai-learning/${division}/salesreps/clusters`);
        if (clusterRes.success) {
          setClusters(clusterRes.data || []);
        }
      } catch (e) {
        console.warn('Cluster data not available:', e.message);
      }

      // Fetch customer segments
      try {
        const segmentRes = await authClient.fetch(`/api/ai-learning/${division}/customers/segments`);
        if (segmentRes.success) {
          setSegments(segmentRes.data || []);
        }
      } catch (e) {
        console.warn('Segment data not available:', e.message);
      }

      // Fetch seasonality
      try {
        const seasonRes = await authClient.fetch(`/api/ai-learning/${division}/seasonality`);
        if (seasonRes.success) {
          setSeasonality(seasonRes.data);
        }
      } catch (e) {
        console.warn('Seasonality data not available:', e.message);
      }

      // Fetch prescriptive actions
      try {
        const actionsRes = await authClient.fetch(`/api/ai-learning/${division}/prescriptive/latest`);
        if (actionsRes.success && actionsRes.data?.actions) {
          setPrescriptiveActions(actionsRes.data.actions);
        }
      } catch (e) {
        console.warn('Prescriptive actions not available:', e.message);
      }

      // Fetch supply chain insights
      try {
        const supplyRes = await authClient.fetch(`/api/ai-learning/${division}/supply-chain/stockout-risk`);
        if (supplyRes.success) {
          setSupplyChain(supplyRes.data);
        }
      } catch (e) {
        console.warn('Supply chain data not available:', e.message);
      }

      // Fetch financial health
      try {
        const finRes = await authClient.fetch(`/api/ai-learning/${division}/financial/concentration`);
        if (finRes.success) {
          setFinancialHealth(finRes.data);
        }
      } catch (e) {
        console.warn('Financial health data not available:', e.message);
      }

      // Fetch product insights
      try {
        const prodRes = await authClient.fetch(`/api/ai-learning/${division}/product/crosssell`);
        if (prodRes.success) {
          setProductInsights(prodRes.data);
        }
      } catch (e) {
        console.warn('Product insights not available:', e.message);
      }

    } catch (err) {
      console.error('Failed to fetch AI learning data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [division]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Run full learning cycle
  const handleRunLearning = async () => {
    if (isRunning) return;

    setIsRunning(true);
    setRunResult(null);

    try {
      const response = await authClient.fetch(`/api/ai-learning/${division}/auto/run`, {
        method: 'POST'
      });
      setRunResult(response);
      
      // Refresh data after learning completes
      await fetchData();
    } catch (err) {
      setRunResult({ success: false, error: err.message });
    } finally {
      setIsRunning(false);
    }
  };

  // Get cluster color
  const getClusterColor = (clusterName) => {
    const colors = {
      'Star Performers': '#22c55e',
      'Consistent Achievers': '#3b82f6',
      'Growth Potential': '#f59e0b',
      'New/Establishing': '#8b5cf6',
      'Underperformers': '#ef4444'
    };
    return colors[clusterName] || '#6b7280';
  };

  // Get segment color
  const getSegmentColor = (segmentName) => {
    const colors = {
      'Champions': '#22c55e',
      'Loyal': '#3b82f6',
      'Potential Loyalist': '#06b6d4',
      'New': '#8b5cf6',
      'At Risk': '#f59e0b',
      'Hibernating': '#ef4444'
    };
    return colors[segmentName] || '#6b7280';
  };

  // Get risk level color
  const getRiskColor = (riskLevel) => {
    if (riskLevel === 'high') return '#ef4444';
    if (riskLevel === 'medium') return '#f59e0b';
    return '#22c55e';
  };

  if (loading) {
    return (
      <div className="ai-dashboard-loading">
        <div className="spinner"></div>
        <p>Loading AI Learning Data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ai-dashboard-error">
        <h3>⚠️ Error Loading AI Data</h3>
        <p>{error}</p>
        <button onClick={fetchData}>Retry</button>
      </div>
    );
  }

  return (
    <div className="ai-learning-dashboard">
      {/* Header */}
      <div className="ai-dashboard-header">
        <div className="header-left">
          <h2>🧠 AI Learning Dashboard</h2>
          <span className="division-badge">{division} Division</span>
        </div>
        <div className="header-right">
          <button 
            className={`run-learning-btn ${isRunning ? 'running' : ''}`}
            onClick={handleRunLearning}
            disabled={isRunning}
          >
            {isRunning ? (
              <>
                <span className="btn-spinner"></span>
                Running Learning...
              </>
            ) : (
              <>
                🔄 Run Learning Now
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="ai-tab-nav">
        <button 
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Overview
        </button>
        <button 
          className={`tab-btn ${activeTab === 'actions' ? 'active' : ''}`}
          onClick={() => setActiveTab('actions')}
        >
          ⚡ Actions ({prescriptiveActions.length})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'supply' ? 'active' : ''}`}
          onClick={() => setActiveTab('supply')}
        >
          📦 Supply Chain
        </button>
        <button 
          className={`tab-btn ${activeTab === 'financial' ? 'active' : ''}`}
          onClick={() => setActiveTab('financial')}
        >
          💰 Financial Health
        </button>
        <button 
          className={`tab-btn ${activeTab === 'products' ? 'active' : ''}`}
          onClick={() => setActiveTab('products')}
        >
          🛍️ Products
        </button>
      </div>

      {/* Run Result */}
      {runResult && (
        <div className={`run-result ${runResult.success ? 'success' : 'error'}`}>
          {runResult.success ? (
            <p>✅ Learning completed in {runResult.durationMs}ms</p>
          ) : (
            <p>❌ Learning failed: {runResult.error}</p>
          )}
        </div>
      )}

      {/* Status Overview */}
      <div className="ai-status-grid">
        <div className="status-card">
          <div className="status-icon">📊</div>
          <div className="status-content">
            <h4>Learning Status</h4>
            <p className={learningStatus?.isRunning ? 'running' : 'idle'}>
              {learningStatus?.isRunning ? 'Running...' : 'Idle'}
            </p>
          </div>
        </div>
        
        <div className="status-card">
          <div className="status-icon">🕐</div>
          <div className="status-content">
            <h4>Last Run</h4>
            <p>{learningStatus?.lastRunTime 
              ? new Date(learningStatus.lastRunTime).toLocaleString()
              : 'Never'
            }</p>
          </div>
        </div>

        <div className="status-card">
          <div className="status-icon">⚡</div>
          <div className="status-content">
            <h4>Should Run</h4>
            <p className={learningStatus?.shouldRun ? 'yes' : 'no'}>
              {learningStatus?.shouldRun ? 'Yes' : 'Up to Date'}
            </p>
          </div>
        </div>

        <div className="status-card">
          <div className="status-icon">📈</div>
          <div className="status-content">
            <h4>Recent Runs</h4>
            <p>{learningStatus?.recentRuns?.length || 0}</p>
          </div>
        </div>
      </div>

      {/* ==================== OVERVIEW TAB ==================== */}
      {activeTab === 'overview' && (
      <div className="ai-content-grid">
        
        {/* Churn Risk Alerts */}
        <div className="ai-panel churn-panel">
          <h3>⚠️ Churn Risk Alerts</h3>
          <p className="panel-subtitle">Customers at risk of churning</p>
          
          {churnRisks.length > 0 ? (
            <div className="churn-list">
              {churnRisks.slice(0, 10).map((customer, idx) => (
                <div key={idx} className="churn-item">
                  <div className="churn-info">
                    <span className="customer-name">{customer.customer_name}</span>
                    <span 
                      className="risk-badge"
                      style={{ backgroundColor: getRiskColor(customer.risk_level) }}
                    >
                      {customer.risk_level}
                    </span>
                  </div>
                  <div className="churn-score">
                    <div 
                      className="score-bar"
                      style={{ width: `${customer.churn_probability * 100}%` }}
                    ></div>
                    <span>{Math.round(customer.churn_probability * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-data">No high-risk customers detected</p>
          )}
        </div>

        {/* Sales Rep Clusters */}
        <div className="ai-panel clusters-panel">
          <h3>👥 Sales Rep Clusters</h3>
          <p className="panel-subtitle">Performance-based grouping</p>
          
          {clusters.length > 0 ? (
            <div className="cluster-chart">
              {Object.entries(
                clusters.reduce((acc, rep) => {
                  acc[rep.cluster_name] = (acc[rep.cluster_name] || 0) + 1;
                  return acc;
                }, {})
              ).map(([name, count]) => (
                <div key={name} className="cluster-bar-container">
                  <div className="cluster-label">
                    <span 
                      className="cluster-dot"
                      style={{ backgroundColor: getClusterColor(name) }}
                    ></span>
                    {name}
                  </div>
                  <div className="cluster-bar-wrapper">
                    <div 
                      className="cluster-bar"
                      style={{ 
                        width: `${(count / clusters.length) * 100}%`,
                        backgroundColor: getClusterColor(name)
                      }}
                    ></div>
                    <span className="cluster-count">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-data">No cluster data available</p>
          )}
        </div>

        {/* Customer Segments */}
        <div className="ai-panel segments-panel">
          <h3>🎯 Customer Segments</h3>
          <p className="panel-subtitle">RFM-based segmentation</p>
          
          {segments.length > 0 ? (
            <div className="segment-grid">
              {Object.entries(
                segments.reduce((acc, cust) => {
                  acc[cust.segment_name] = (acc[cust.segment_name] || 0) + 1;
                  return acc;
                }, {})
              ).map(([name, count]) => (
                <div 
                  key={name} 
                  className="segment-tile"
                  style={{ borderColor: getSegmentColor(name) }}
                >
                  <div 
                    className="segment-icon"
                    style={{ backgroundColor: getSegmentColor(name) }}
                  >
                    {count}
                  </div>
                  <span className="segment-name">{name}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-data">No segment data available</p>
          )}
        </div>

        {/* Seasonality */}
        <div className="ai-panel seasonality-panel">
          <h3>📅 Seasonality Patterns</h3>
          <p className="panel-subtitle">Monthly performance factors</p>
          
          {seasonality?.factors?.length > 0 ? (
            <div className="seasonality-chart">
              {seasonality.factors.map((factor, idx) => (
                <div key={idx} className="month-bar-container">
                  <span className="month-label">
                    {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][idx]}
                  </span>
                  <div className="month-bar-wrapper">
                    <div 
                      className="month-bar"
                      style={{ 
                        height: `${Math.max(20, factor * 80)}%`,
                        backgroundColor: factor > 1 ? '#22c55e' : factor < 0.9 ? '#ef4444' : '#3b82f6'
                      }}
                    ></div>
                  </div>
                  <span className="month-value">{(factor * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-data">No seasonality data available</p>
          )}
        </div>
      </div>
      )}

      {/* Quick Stats Footer */}
      <div className="ai-quick-stats">
        <div className="quick-stat">
          <span className="stat-value">{clusters.length}</span>
          <span className="stat-label">Sales Reps Analyzed</span>
        </div>
        <div className="quick-stat">
          <span className="stat-value">{segments.length}</span>
          <span className="stat-label">Customers Segmented</span>
        </div>
        <div className="quick-stat">
          <span className="stat-value">{churnRisks.length}</span>
          <span className="stat-label">At-Risk Customers</span>
        </div>
        <div className="quick-stat">
          <span className="stat-value">{prescriptiveActions.length}</span>
          <span className="stat-label">Recommended Actions</span>
        </div>
      </div>

      {/* ==================== ACTIONS TAB ==================== */}
      {activeTab === 'actions' && (
        <div className="ai-tab-content">
          <div className="ai-panel full-width actions-panel">
            <h3>⚡ Prescriptive Actions</h3>
            <p className="panel-subtitle">AI-recommended actions to improve performance</p>
            
            {prescriptiveActions.length > 0 ? (
              <div className="actions-list">
                {prescriptiveActions.map((action, idx) => (
                  <div key={idx} className={`action-item priority-${action.priority}`}>
                    <div className="action-header">
                      <span className="action-category">{action.category}</span>
                      <span className={`action-priority priority-${action.priority}`}>
                        {action.priority} Priority
                      </span>
                    </div>
                    <h4 className="action-title">{action.action}</h4>
                    <div className="action-meta">
                      <span className="action-impact">
                        💰 Estimated Impact: ${(action.estimatedImpact || 0).toLocaleString()}
                      </span>
                      {action.target && (
                        <span className="action-target">🎯 {action.target}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-data">No prescriptive actions available. Run learning to generate recommendations.</p>
            )}
          </div>
        </div>
      )}

      {/* ==================== SUPPLY CHAIN TAB ==================== */}
      {activeTab === 'supply' && (
        <div className="ai-tab-content">
          <div className="ai-panel full-width supply-panel">
            <h3>📦 Supply Chain Intelligence</h3>
            <p className="panel-subtitle">Stock-out risk and inventory optimization</p>
            
            {supplyChain?.products?.length > 0 ? (
              <>
                <div className="supply-summary">
                  <div className="supply-stat risk-high">
                    <span className="stat-number">{supplyChain.highRiskCount || 0}</span>
                    <span className="stat-label">High Risk</span>
                  </div>
                  <div className="supply-stat risk-medium">
                    <span className="stat-number">{supplyChain.mediumRiskCount || 0}</span>
                    <span className="stat-label">Medium Risk</span>
                  </div>
                  <div className="supply-stat risk-low">
                    <span className="stat-number">{(supplyChain.products?.length || 0) - (supplyChain.highRiskCount || 0) - (supplyChain.mediumRiskCount || 0)}</span>
                    <span className="stat-label">Low Risk</span>
                  </div>
                </div>
                <div className="supply-list">
                  {supplyChain.products.slice(0, 10).map((product, idx) => (
                    <div key={idx} className={`supply-item risk-${product.riskLevel?.toLowerCase()}`}>
                      <div className="supply-product">
                        <span className="product-name">{product.productGroup}</span>
                        <span className={`risk-badge ${product.riskLevel?.toLowerCase()}`}>
                          {product.riskLevel}
                        </span>
                      </div>
                      <div className="supply-details">
                        <span>Risk Score: {Math.round(product.riskScore)}%</span>
                        <span>Variability: {(product.variability * 100).toFixed(1)}%</span>
                      </div>
                      <p className="supply-recommendation">{product.recommendation}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="no-data">No supply chain data available. Run learning to analyze inventory.</p>
            )}
          </div>
        </div>
      )}

      {/* ==================== FINANCIAL TAB ==================== */}
      {activeTab === 'financial' && (
        <div className="ai-tab-content">
          <div className="ai-panel full-width financial-panel">
            <h3>💰 Financial Health</h3>
            <p className="panel-subtitle">Revenue concentration and customer dependency</p>
            
            {financialHealth ? (
              <>
                <div className="financial-summary">
                  <div className="financial-stat">
                    <span className="stat-number">${((financialHealth.totalRevenue || 0) / 1000000).toFixed(1)}M</span>
                    <span className="stat-label">Total Revenue</span>
                  </div>
                  <div className="financial-stat">
                    <span className="stat-number">{financialHealth.customerCount || 0}</span>
                    <span className="stat-label">Customers</span>
                  </div>
                  <div className="financial-stat">
                    <span className="stat-number">{Math.round(financialHealth.herfindahlIndex || 0)}</span>
                    <span className="stat-label">HHI Index</span>
                  </div>
                  <div className={`financial-stat risk-${financialHealth.riskLevel?.toLowerCase()}`}>
                    <span className="stat-number">{financialHealth.riskLevel}</span>
                    <span className="stat-label">Concentration Risk</span>
                  </div>
                </div>

                {financialHealth.concentration && (
                  <div className="concentration-chart">
                    <h4>Revenue Concentration</h4>
                    <div className="concentration-bars">
                      <div className="conc-bar">
                        <span className="conc-label">Top 1 Customer</span>
                        <div className="conc-bar-wrapper">
                          <div className="conc-bar-fill" style={{ width: `${financialHealth.concentration.top1}%` }}></div>
                        </div>
                        <span className="conc-value">{financialHealth.concentration.top1?.toFixed(1)}%</span>
                      </div>
                      <div className="conc-bar">
                        <span className="conc-label">Top 5 Customers</span>
                        <div className="conc-bar-wrapper">
                          <div className="conc-bar-fill" style={{ width: `${financialHealth.concentration.top5}%` }}></div>
                        </div>
                        <span className="conc-value">{financialHealth.concentration.top5?.toFixed(1)}%</span>
                      </div>
                      <div className="conc-bar">
                        <span className="conc-label">Top 10 Customers</span>
                        <div className="conc-bar-wrapper">
                          <div className="conc-bar-fill" style={{ width: `${financialHealth.concentration.top10}%` }}></div>
                        </div>
                        <span className="conc-value">{financialHealth.concentration.top10?.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                )}

                {financialHealth.topCustomers?.length > 0 && (
                  <div className="top-customers">
                    <h4>Top Revenue Contributors</h4>
                    <div className="top-customers-list">
                      {financialHealth.topCustomers.slice(0, 5).map((cust, idx) => (
                        <div key={idx} className="top-customer-item">
                          <span className="rank">#{idx + 1}</span>
                          <span className="name">{cust.customerName}</span>
                          <span className="revenue">${(cust.revenue / 1000).toFixed(0)}K</span>
                          <span className="share">{cust.revenueShare?.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="financial-recommendation">{financialHealth.recommendation}</p>
              </>
            ) : (
              <p className="no-data">No financial health data available. Run learning to analyze finances.</p>
            )}
          </div>
        </div>
      )}

      {/* ==================== PRODUCTS TAB ==================== */}
      {activeTab === 'products' && (
        <div className="ai-tab-content">
          <div className="ai-panel full-width products-panel">
            <h3>🛍️ Product Intelligence</h3>
            <p className="panel-subtitle">Cross-sell opportunities and product affinities</p>
            
            {productInsights?.patterns?.length > 0 ? (
              <div className="crosssell-list">
                {productInsights.patterns.slice(0, 10).map((pattern, idx) => (
                  <div key={idx} className="crosssell-item">
                    <div className="crosssell-products">
                      <span className="product-a">{pattern.productA}</span>
                      <span className="crosssell-arrow">↔</span>
                      <span className="product-b">{pattern.productB}</span>
                    </div>
                    <div className="crosssell-stats">
                      <span className="shared-customers">
                        👥 {pattern.sharedCustomers} shared customers
                      </span>
                      <span className="affinity-score">
                        💪 {pattern.affinityPercent?.toFixed(0)}% affinity
                      </span>
                    </div>
                    <span className={`crosssell-badge ${pattern.recommendation?.includes('Strong') ? 'strong' : 'moderate'}`}>
                      {pattern.recommendation}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-data">No product insights available. Run learning to analyze cross-sell patterns.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AILearningDashboard;
