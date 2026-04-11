import React from 'react';
import ReactECharts from 'echarts-for-react';

// Row indices for the metrics (update if needed)
const KPI_ROWS = {
  TOTAL_EXPENSES: { label: 'Total Expenses', rowIndex: 28 },
  NET_PROFIT: { label: 'Net Profit', rowIndex: 29 },
  EBIT: { label: 'EBIT', rowIndex: 'calculated', isEBIT: true },
  EBITDA: { label: 'EBITDA', rowIndex: 30 },
};

// Color scheme definitions (MUST MATCH ColumnConfigGrid.js exactly)
const colorSchemes = [
  { name: 'blue', label: 'Blue', primary: '#288cfa', secondary: '#103766', isDark: true },
  { name: 'green', label: 'Green', primary: '#2E865F', secondary: '#C6F4D6', isDark: true },
  { name: 'yellow', label: 'Yellow', primary: '#FFD700', secondary: '#FFFDE7', isDark: false },
  { name: 'orange', label: 'Orange', primary: '#FF6B35', secondary: '#FFE0B2', isDark: false },
  { name: 'boldContrast', label: 'Bold Contrast', primary: '#003366', secondary: '#FF0000', isDark: true }
];
const defaultColors = ['#FFD700', '#288cfa', '#003366', '#91cc75', '#5470c6'];

function calcVariance(current, base) {
  if (base === 0) return null;
  return ((current - base) / Math.abs(base)) * 100;
}

const SummaryKPIBarChart = ({ tableData, selectedPeriods, computeCellValue, style }) => {
  if (!selectedPeriods || selectedPeriods.length === 0 || typeof computeCellValue !== 'function') {
    return (
      <div className="modern-margin-gauge-panel" style={{ marginTop: 60, padding: 20, textAlign: 'center' }}>
        <h2 className="modern-gauge-heading">Summary KPI Bar Chart</h2>
        <p>No data available. Please select a period.</p>
      </div>
    );
  }

  const periodsToUse = selectedPeriods.slice(0, 5);
  const periodNames = periodsToUse.map(period => `${period.year} ${period.month || ''} ${period.type}`);
  const kpiKeys = Object.keys(KPI_ROWS);
  const kpiLabels = kpiKeys.map(key => KPI_ROWS[key].label);

  // Extract data for each KPI and period
  const kpiData = {};
  kpiKeys.forEach(key => {
    kpiData[key] = { label: KPI_ROWS[key].label, values: {} };
  });

  periodsToUse.forEach((period, periodIdx) => {
    const periodName = periodNames[periodIdx];
    kpiKeys.forEach(key => {
      const kpiConfig = KPI_ROWS[key];
      let amount;
      
      if (kpiConfig.isEBIT) {
        // Calculate EBIT as Net Profit + Bank Interest
        // For SummaryKPIBarChart, Net Profit might be row 29, but we should use the same logic as in TableView
        // Using rows 54 (Net Profit) and 42 (Bank Interest) to be consistent with table
        const netProfit = computeCellValue(54, period);
        const bankInterest = computeCellValue(42, period);
        amount = (typeof netProfit === 'number' ? netProfit : 0) + (typeof bankInterest === 'number' ? bankInterest : 0);
      } else {
        amount = computeCellValue(kpiConfig.rowIndex, period);
      }
      
      const sales = computeCellValue(3, period);
      const salesVolume = computeCellValue(7, period);
      let percentOfSales = 0;
      if (typeof sales === 'number' && !isNaN(sales) && sales !== 0) {
        percentOfSales = (amount / sales) * 100;
      }
      let perKg = 0;
      if (typeof salesVolume === 'number' && !isNaN(salesVolume) && salesVolume !== 0) {
        perKg = amount / salesVolume;
      }
      kpiData[key].values[periodName] = {
        amount: typeof amount === 'number' && !isNaN(amount) ? amount : 0,
        percentOfSales: typeof percentOfSales === 'number' && !isNaN(percentOfSales) ? percentOfSales : 0,
        perKg: typeof perKg === 'number' && !isNaN(perKg) ? perKg : 0,
      };
    });
  });

  // Calculate variances vs. base period (first period)
  const basePeriodName = periodNames[0];
  const variances = {};
  kpiKeys.forEach(key => {
    variances[key] = {};
    periodNames.forEach(periodName => {
      const base = kpiData[key].values[basePeriodName]?.amount || 0;
      const current = kpiData[key].values[periodName]?.amount || 0;
      variances[key][periodName] = calcVariance(current, base);
    });
  });

  // Prepare series for each KPI
  const series = kpiKeys.map((key, kpiIdx) => {
    return {
      name: kpiLabels[kpiIdx],
      type: 'bar',
      stack: null,
      barGap: 0,
      barCategoryGap: '40%',
      itemStyle: {
        color: defaultColors[kpiIdx % defaultColors.length],
        borderRadius: [2, 2, 2, 2],
      },
      label: {
        show: true,
        position: 'inside',
        fontSize: 14,
        fontWeight: 'bold',
        color: '#222',
        formatter: params => {
          const data = kpiData[key].values[params.name];
          if (!data) return '';
          const millions = (data.amount / 1000000).toFixed(2);
          const percent = data.percentOfSales.toFixed(2);
          const perKg = data.perKg.toFixed(2);
          return `${millions}M\n${percent}%/Sls\n${perKg}/kg`;
        },
        align: 'center',
        verticalAlign: 'middle',
        lineHeight: 16,
      },
      emphasis: {
        focus: 'series',
        blurScope: 'coordinateSystem',
        label: {
          fontSize: 12,
          fontWeight: 'bold',
        },
      },
      data: periodNames.map(periodName => kpiData[key].values[periodName]?.amount || 0),
      z: 2,
    };
  });

  // Custom render for variance badges above each bar
  const renderVarianceBadges = () => {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        margin: '0 40px',
        position: 'relative',
        top: 0,
        zIndex: 10,
      }}>
        {periodNames.map((periodName, periodIdx) => (
          <div key={periodName} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
            {kpiKeys.map((key, kpiIdx) => {
              const variance = variances[key][periodName];
              let badgeColor = '#888';
              let arrow = '–';
              if (variance !== null && !isNaN(variance)) {
                if (variance > 0.01) { badgeColor = '#2E865F'; arrow = '▲'; }
                else if (variance < -0.01) { badgeColor = '#cf1322'; arrow = '▼'; }
                else { badgeColor = '#888'; arrow = '–'; }
              }
              return (
                <div key={key} style={{
                  minWidth: 70,
                  marginBottom: 2,
                  fontWeight: 'bold',
                  fontSize: 13,
                  color: badgeColor,
                  textAlign: 'center',
                  background: '#f7f7f7',
                  borderRadius: 8,
                  padding: '2px 8px',
                  marginTop: 2,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                  display: 'inline-block',
                }}>
                  {variance === null || isNaN(variance) ? 'N/A' : `${arrow} ${Math.abs(variance).toFixed(1)}%`}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: params => {
        // params is an array of series for the hovered period
        let result = `<div style="font-weight:bold;font-size:15px;margin-bottom:8px;color:#222">${params[0].name}</div>`;
        params.forEach(param => {
          const key = kpiKeys[param.seriesIndex];
          const data = kpiData[key].values[param.name];
          const variance = variances[key][param.name];
          result += `<div style="margin-bottom:6px;"><span style="font-weight:600;color:${defaultColors[param.seriesIndex % defaultColors.length]}">${kpiLabels[param.seriesIndex]}</span><br/>` +
            `<span style="font-weight:bold;">${(data.amount / 1000000).toFixed(2)}M</span> &nbsp;` +
            `<span style="color:#888;">${data.percentOfSales.toFixed(2)}%/Sls</span> &nbsp;` +
            `<span style="color:#888;">${data.perKg.toFixed(2)}/kg</span><br/>` +
            `<span style="color:${variance > 0 ? '#2E865F' : variance < 0 ? '#cf1322' : '#888'};font-weight:bold;">` +
            `${variance === null || isNaN(variance) ? 'N/A' : (variance > 0 ? '▲' : variance < 0 ? '▼' : '–') + ' ' + Math.abs(variance).toFixed(1) + '%'}` +
            `</span></div>`;
        });
        return result;
      },
      backgroundColor: 'rgba(255,255,255,0.97)',
      borderColor: '#ddd',
      borderWidth: 1,
      padding: [10, 15],
      textStyle: { color: '#333', fontSize: 13 },
      extraCssText: 'box-shadow: 0 3px 10px rgba(0,0,0,0.10); border-radius: 4px;',
    },
    legend: {
      data: kpiLabels,
      type: 'plain',
      top: 0,
      left: 'center',
      icon: 'roundRect',
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { fontSize: 13, color: '#666' },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '60px',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: periodNames,
      axisLabel: {
        fontWeight: 'bold',
        fontSize: 13,
        color: '#444',
        padding: [0, 0, 0, 0],
      },
      axisLine: { lineStyle: { color: '#ddd' } },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        fontWeight: 'bold',
        fontSize: 13,
        color: '#444',
      },
      axisLine: { lineStyle: { color: '#ddd' } },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: '#eee', type: 'dashed' } },
    },
    series: series,
  };

  return (
    <div className="modern-margin-gauge-panel" style={{ marginTop: 60, backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', padding: '20px', width: '95%', marginLeft: 'auto', marginRight: 'auto', boxSizing: 'border-box', ...(style || {}) }}>
      <h2 className="modern-gauge-heading" style={{ textAlign: 'center', fontSize: '18px', marginBottom: '20px', color: '#333', fontWeight: '600' }}>
        Summary KPI Bar Chart
      </h2>
      {renderVarianceBadges()}
      <ReactECharts
        option={option}
        style={{ height: 500 }}
        notMerge={true}
        opts={{ renderer: 'svg' }}
      />
    </div>
  );
};

export default SummaryKPIBarChart; 