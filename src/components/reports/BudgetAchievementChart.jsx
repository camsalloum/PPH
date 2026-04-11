import React, { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { getProductGroupsForSalesRep } from '../dashboard/SalesBySaleRepTable';

const BudgetAchievementChart = ({ reportData, kgsData }) => {
  const budgetChartRef = useRef(null);
  const budgetChartInstance = useRef(null);
  const [budgetData, setBudgetData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Single option (HTML concept). Option 1 removed.

  // Fetch budget data from database
  useEffect(() => {
    const fetchBudgetData = async () => {
      if (!reportData?.salesRep || !reportData?.basePeriodIndex) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Prefer already-prepared kgsData to ensure identical filtering/order as YoY
        if (Array.isArray(kgsData) && kgsData.length > 0) {
          setBudgetData(kgsData);
          return;
        }

        // Otherwise fetch fresh from the same source method
        const division = (reportData?.selectedDivision || reportData?.division || 'FP');
        const data = await getProductGroupsForSalesRep(
          reportData.salesRep,
          'KGS',
          reportData.columnOrder,
          division
        );
        setBudgetData(data);
      } catch (error) {
        console.error('Error fetching budget data:', error);
        setError('Failed to load budget data');
      } finally {
        setLoading(false);
      }
    };

    fetchBudgetData();
  }, [reportData?.salesRep, reportData?.basePeriodIndex, reportData?.columnOrder, reportData?.selectedDivision, kgsData]);

  // Create budget achievement chart
  useEffect(() => {
    if (budgetData && budgetChartRef.current) {
      createBudgetAchievementChart();
    }

    return () => {
      if (budgetChartInstance.current) {
        budgetChartInstance.current.destroy();
        budgetChartInstance.current = null;
      }
      
      // Clean up any HTML elements created by the HTML chart
      const chartContainer = budgetChartRef.current?.parentElement;
      if (chartContainer) {
        const elementsToRemove = [
          '.html-chart-container',
          '.metrics-labels',
          '.custom-chart-labels', 
          '.custom-budget-chart'
        ];
        
        elementsToRemove.forEach(selector => {
          const element = chartContainer.querySelector(selector);
          if (element) element.remove();
        });
      }
      
      // Restore canvas visibility in case it was hidden
      if (budgetChartRef.current) {
        budgetChartRef.current.style.display = '';
      }
    };
  }, [budgetData]);

  const createBudgetAchievementChart = () => {
    if (!budgetChartRef.current || !budgetData) return;

    // Destroy existing chart
    if (budgetChartInstance.current) {
      budgetChartInstance.current.destroy();
    }

    const ctx = budgetChartRef.current.getContext('2d');
    
    // Get indices for base-1, base, and base+1
    const baseIndex = reportData.basePeriodIndex;
    const prevIndex = baseIndex > 0 ? baseIndex - 1 : null; // base-1 (previous period)
    const budgetIndex = baseIndex + 1; // base+1 (budget/comparison period)
    
    // Get column info for labels
    const columnOrder = reportData.columnOrder || [];
    const prevColumn = prevIndex !== null ? columnOrder[prevIndex] : null;
    const baseColumn = columnOrder[baseIndex];
    const budgetColumn = columnOrder[budgetIndex];
    
    // Process the budget data with 3 periods: prev, actual, budget
    const productGroups = budgetData.map(item => {
      const prevValue = prevIndex !== null ? (item.rawValues?.[prevIndex] || 0) : 0;
      const actualValue = item.rawValues?.[baseIndex] || 0;
      const budgetValue = item.rawValues?.[budgetIndex] || 0;

      return {
        productGroup: item.productGroup || item.name,
        prevValue,
        actualValue,
        budgetValue,
        // YoY growth (actual vs prev)
        yoyGrowth: prevValue > 0 ? ((actualValue - prevValue) / prevValue) * 100 : 0,
        yoyDelta: actualValue - prevValue,
        // Budget achievement (actual vs budget)
        budgetAchievement: budgetValue > 0 ? (actualValue / budgetValue) * 100 : 0,
        budgetDelta: actualValue - budgetValue
      };
    });

    // Filter and sort
    const filteredGroups = productGroups.filter(item => 
      item.actualValue > 0 || item.prevValue > 0 || item.budgetValue > 0
    );
    
    filteredGroups.sort((a, b) => b.actualValue - a.actualValue);
    const topGroups = filteredGroups.slice(0, 12); // Show more items for comparison

    if (topGroups.length === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('📊 Budget Achievement Analysis', ctx.canvas.width / 2, ctx.canvas.height / 2 - 20);
      ctx.font = '14px Arial';
      ctx.fillText('No budget data available for comparison.', ctx.canvas.width / 2, ctx.canvas.height / 2 + 10);
      return;
    }

    // Create the HTML chart with 3 bars: prev, actual, budget
    createThreePeriodChart(ctx, topGroups, prevColumn, baseColumn, budgetColumn, prevIndex !== null);
  };

  // Create chart with 3 periods: Previous (base-1), Actual (base), Budget (base+1)
  const createThreePeriodChart = (ctx, topGroups, prevColumn, baseColumn, budgetColumn, hasPrevPeriod) => {
    // Hide the canvas - we'll use pure HTML/CSS like your concept
    budgetChartRef.current.style.display = 'none';
    
    // Get container and clear any existing content
    const chartContainer = budgetChartRef.current.parentElement;
    
    // Remove ALL old chart elements and panels
    const existing = chartContainer.querySelector('.html-chart-container');
    if (existing) existing.remove();
    
    const oldMetrics = chartContainer.querySelector('.metrics-labels');
    if (oldMetrics) oldMetrics.remove();
    
    const oldCustomLabels = chartContainer.querySelector('.custom-chart-labels');
    if (oldCustomLabels) oldCustomLabels.remove();
    
    const oldCustomChart = chartContainer.querySelector('.custom-budget-chart');
    if (oldCustomChart) oldCustomChart.remove();

    // Filter data - show if has at least 1 MT in any of the 3 periods
    const actualGroups = topGroups.filter(item => {
      const hasData = item.actualValue >= 1000 || item.prevValue >= 1000 || item.budgetValue >= 1000;
      return hasData;
    });
    actualGroups.sort((a, b) => b.actualValue - a.actualValue);

    // Create main container
    const htmlContainer = document.createElement('div');
    htmlContainer.className = 'html-chart-container';
    htmlContainer.style.cssText = `
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial;
      background: transparent;
      border: 0;
      border-radius: 0;
      padding: 0;
      margin: 0 0 16px 0;
      width: 100%;
      max-width: none;
      overflow: visible;
    `;

    // Helper to format column label
    const formatLabel = (col) => {
      if (!col) return '';
      const month = (col.month || col.code || col.short || 'FY').toUpperCase();
      const year = col.year || '';
      const type = (col.type || 'Actual').toUpperCase();
      return `${month} ${year} ${type}`;
    };

    // Build legend labels from column info
    const prevLegend = hasPrevPeriod ? formatLabel(prevColumn) : '';
    const actualLegend = formatLabel(baseColumn);
    const budgetLegend = formatLabel(budgetColumn);

    // Inject legend with 3 colors (or 2 if no prev period)
    htmlContainer.innerHTML = `
      <!-- Legend -->
      <div style="display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 24px; margin-bottom: 12px;">
        <div style="display: flex; align-items: center; gap: 20px;">
          ${hasPrevPeriod ? `
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="width: 14px; height: 14px; background: #95A5A6; border-radius: 3px;"></span>
            <span style="color: #6b7280; font-size: 12px;">${prevLegend}</span>
          </div>
          ` : ''}
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="width: 14px; height: 14px; background: #F1C40F; border-radius: 3px;"></span>
            <span style="color: #6b7280; font-size: 12px;">${actualLegend}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="width: 14px; height: 14px; background: #5DADE2; border-radius: 3px;"></span>
            <span style="color: #6b7280; font-size: 12px;">${budgetLegend}</span>
          </div>
        </div>
      </div>
    `;

    // Add product group rows with 3 bars each
    const rowsContainer = document.createElement('div');

    actualGroups.forEach(item => {
      const prevMT = item.prevValue / 1000;
      const actualMT = item.actualValue / 1000;
      const budgetMT = item.budgetValue / 1000;
      const yoyDelta = item.yoyDelta / 1000;
      const budgetDelta = item.budgetDelta / 1000;

      // Calculate max value for THIS product - longest bar takes full width
      const maxValue = Math.max(prevMT, actualMT, budgetMT) * 1.05;

      // Calculate bar widths as percentages
      const prevWidth = maxValue > 0 ? (prevMT / maxValue) * 100 : 0;
      const actualWidth = maxValue > 0 ? (actualMT / maxValue) * 100 : 0;
      const budgetWidth = maxValue > 0 ? (budgetMT / maxValue) * 100 : 0;

      const rowDiv = document.createElement('div');
      rowDiv.style.cssText = `
        padding: 10px 0;
        border-bottom: 1px dashed #e5e7eb;
        margin-bottom: 0;
      `;

      rowDiv.innerHTML = `
        <!-- Product Group Title -->
        <div style="font-size: 14px; font-weight: 700; color: #374151; margin: 0 0 10px 2px;">
          ${item.productGroup}
        </div>

        <!-- Bars (3 bars: prev, actual, budget) -->
        <div style="display: flex; flex-direction: column; gap: 4px;">

        ${hasPrevPeriod ? `
        <!-- Previous Period Bar (base-1) -->
        <div style="display: flex; align-items: center; gap: 6px;">
          <div style="flex: 1; height: 24px; background: transparent; position: relative;">
            ${prevMT > 0
              ? `<div style="height: 100%; width: ${prevWidth}%; background: #95A5A6; border-radius: 3px;"></div>`
              : `<div style="width: 100%; text-align: center; color: #6b7280; font-size: 12px; line-height: 24px;">No data</div>`}
          </div>
          <div style="min-width: 50px; font-size: 12px; font-weight: 700; color: #7f8c8d;">
            ${prevMT >= 1 ? `${Math.round(prevMT)} MT` : ''}
          </div>
          <div style="width: 200px; text-align: right; font-size: 12px; padding-left: 10px;">
            <div style="color: #6b7280;">${prevLegend}</div>
          </div>
        </div>
        ` : ''}

        <!-- Actual Bar (base) with YoY comparison -->
        <div style="display: flex; align-items: center; gap: 6px;">
          <div style="flex: 1; height: 24px; background: transparent; position: relative;">
            <div style="height: 100%; width: ${actualWidth}%; background: #F1C40F; border-radius: 3px;"></div>
          </div>
          <div style="min-width: 50px; font-size: 12px; font-weight: 700; color: #111827;">
            ${actualMT >= 1 ? `${Math.round(actualMT)} MT` : ''}
          </div>
          <div style="width: 200px; text-align: right; font-size: 12px; line-height: 1.3; padding-left: 10px; white-space: nowrap;">
            ${hasPrevPeriod && prevMT > 0 ? `
              <span style="color: #6b7280;">YoY: </span>
              <span style="color: ${item.yoyGrowth >= 0 ? '#1f6feb' : '#dc2626'}; font-weight: 800;">${item.yoyGrowth >= 0 ? '+' : ''}${item.yoyGrowth.toFixed(1)}%</span>
              <span style="color: ${yoyDelta >= 0 ? '#1f6feb' : '#dc2626'};"> (${yoyDelta >= 0 ? '+' : ''}${yoyDelta.toFixed(1)} MT)</span>
            ` : `<span style="color: #6b7280;">${actualLegend}</span>`}
          </div>
        </div>

        <!-- Budget Bar (base+1) with achievement % -->
        <div style="display: flex; align-items: center; gap: 6px;">
          <div style="flex: 1; height: 24px; background: transparent; position: relative;">
            ${budgetMT > 0
              ? `<div style="height: 100%; width: ${budgetWidth}%; background: #5DADE2; border-radius: 3px;"></div>`
              : `<div style="width: 100%; text-align: center; color: #6b7280; font-size: 12px; line-height: 24px;">Not budgeted</div>`}
          </div>
          <div style="min-width: 50px; font-size: 12px; font-weight: 700; color: #0f6085;">
            ${budgetMT > 0 ? `${Math.round(budgetMT)} MT` : ''}
          </div>
          <div style="width: 200px; text-align: right; font-size: 12px; line-height: 1.3; padding-left: 10px; white-space: nowrap;">
            ${budgetMT > 0 ? `
              <span style="color: #6b7280;">vs Budget: </span>
              <span style="color: ${item.budgetAchievement >= 100 ? '#1f6feb' : '#dc2626'}; font-weight: 800;">${item.budgetAchievement.toFixed(1)}%</span>
              <span style="color: ${budgetDelta >= 0 ? '#1f6feb' : '#dc2626'};"> (${budgetDelta >= 0 ? '+' : ''}${budgetDelta.toFixed(1)} MT)</span>
            ` : `<span style="color: #6b7280;">${budgetLegend}</span>`}
          </div>
        </div>

        </div>
      `;

      rowsContainer.appendChild(rowDiv);
    });

    htmlContainer.appendChild(rowsContainer);
    chartContainer.appendChild(htmlContainer);
  };

  if (loading) {
    return (
      <div>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div>Loading budget data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div style={{ textAlign: 'center', padding: '40px', color: '#e74c3c' }}>
          <div>Error: {error}</div>
        </div>
      </div>
    );
  }

  // Build description based on column selection (base-1, base, base+1)
  const getChartDescription = () => {
    const baseIndex = reportData?.basePeriodIndex || 0;
    const columnOrder = reportData?.columnOrder || [];
    const prevColumn = baseIndex > 0 ? columnOrder[baseIndex - 1] : null;
    const baseColumn = columnOrder[baseIndex];
    const budgetColumn = columnOrder[baseIndex + 1];

    const formatLabel = (col) => {
      if (!col) return '';
      const month = (col.month || col.code || col.short || 'FY').toUpperCase();
      const year = col.year || '';
      const type = (col.type || 'Actual').toUpperCase();
      return `${month} ${year} ${type}`;
    };

    const prevLabel = prevColumn ? formatLabel(prevColumn) : null;
    const actualLabel = formatLabel(baseColumn);
    const budgetLabel = formatLabel(budgetColumn);

    if (prevLabel) {
      return `${prevLabel} → ${actualLabel} → ${budgetLabel}: bars show MT; YoY growth and Budget achievement %`;
    } else {
      return `${actualLabel} vs ${budgetLabel}: bars show MT; right side shows % and MT delta. Δ% = (Actual − Budget) / Budget × 100`;
    }
  };

  return (
    <div style={{ margin: '20px 0' }}>
      <h3 style={{ margin: '0 0 8px 0' }}>Budget Achievement</h3>
      <p style={{fontStyle: 'italic', color: '#666', margin: '0 0 12px 0', fontSize: '13px'}}>
        {getChartDescription()}
      </p>
      <div className="chart-container" style={{ overflow: 'visible' }}>
        <canvas ref={budgetChartRef} id="budgetAchievementChart"></canvas>
      </div>
    </div>
  );
};

export default BudgetAchievementChart;
