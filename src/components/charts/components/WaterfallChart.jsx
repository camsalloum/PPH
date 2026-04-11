import React from 'react';
import Plot from 'react-plotly.js';
import { useCurrency } from '../../../contexts/CurrencyContext';
import './WaterfallChart.css';

/**
 * WaterfallChart Component - Premium Plotly Waterfall
 * ----------------------------------------------------
 * A beautifully designed waterfall/bridge chart that shows
 * how a starting value transforms into an ending value through
 * intermediate changes. Features:
 * - Native Plotly waterfall with floating variance bars
 * - Elegant dotted connector lines
 * - Dynamic period labels in subtitle
 * - Premium color palette with gradients
 * - Percentage annotations on variance bars
 */

const WaterfallChart = ({ 
  title,
  subtitle,
  startLabel, 
  endLabel, 
  startValue, 
  endValue, 
  variances = [],
  height = 420,
  periodInfo,
  currencyLabel = ''
}) => {
  const { companyCurrency, isUAEDirham } = useCurrency();
  
  // Use 'AED' text for UAE Dirham (since SVG can't be used in charts), otherwise use the currency symbol
  const currencySymbol = currencyLabel || (isUAEDirham() ? 'AED' : companyCurrency.symbol) || 'AED';
  
  // Currency for display in values and title
  const titleCurrency = currencySymbol;

  // Build Plotly waterfall data
  const xLabels = [startLabel, ...variances.map(v => v.label), endLabel];
  
  const measures = [
    'absolute',
    ...variances.map(() => 'relative'),
    'total'
  ];
  
  const yValues = [
    startValue,
    ...variances.map(v => v.value),
    null
  ];
  
  // Build text labels with beautiful formatting
  const textLabels = [
    formatValueAbbreviated(startValue),
    ...variances.map(v => {
      const sign = v.value >= 0 ? '+' : '';
      return sign + formatValueAbbreviated(v.value);
    }),
    formatValueAbbreviated(endValue)
  ];
  
  // Premium color palette
  const COLORS = {
    start: '#3B82F6',      // Vibrant blue
    end: '#8B5CF6',        // Purple
    favorable: '#10B981',  // Emerald green
    unfavorable: '#EF4444', // Warm red
    connector: '#94A3B8'   // Slate gray
  };
  
  const barColors = [
    COLORS.start,
    ...variances.map(v => {
      const isFavorable = v.isPositiveGood ? v.value >= 0 : v.value <= 0;
      return isFavorable ? COLORS.favorable : COLORS.unfavorable;
    }),
    COLORS.end
  ];

  function formatValueAbbreviated(value) {
    if (value === null || value === undefined || isNaN(value)) return '';
    let displayValue = Number(value);
    let suffix = '';
    
    if (Math.abs(displayValue) >= 1000000) {
      displayValue = displayValue / 1000000;
      suffix = 'M';
    } else if (Math.abs(displayValue) >= 1000) {
      displayValue = displayValue / 1000;
      suffix = 'K';
    }
    
    return displayValue.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }) + suffix;
  }

  // Build rich title with period info and currency
  const buildTitle = () => {
    if (periodInfo) {
      // Currency on the period info line (second line) - plain text only
      const periodWithCurrency = titleCurrency ? `${titleCurrency} ${periodInfo}` : periodInfo;
      return `<b style="font-size:17px">${title}</b><br><span style="font-size:13px;color:#64748B;font-weight:400">${periodWithCurrency}</span>`;
    }
    return `<b style="font-size:17px">${title}</b>`;
  };

  const data = [{
    type: 'waterfall',
    orientation: 'v',
    measure: measures,
    x: xLabels,
    y: yValues,
    text: textLabels,
    textposition: 'outside',
    textfont: {
      size: 13,
      color: barColors,
      family: "'Inter', 'Segoe UI', -apple-system, sans-serif"
    },
    connector: {
      line: {
        color: COLORS.connector,
        width: 2,
        dash: 'dot'
      },
      visible: true
    },
    marker: {
      color: barColors,
      line: {
        width: 0
      }
    },
    hovertemplate: 
      '<b style="font-size:14px">%{x}</b><br><br>' +
      '<span style="font-size:16px;font-weight:600">' + currencySymbol + ' %{y:,.0f}</span><br>' +
      '<extra></extra>',
    cliponaxis: false,
    width: 0.55
  }];

  // Calculate total variance for summary annotation
  const totalVariance = endValue - startValue;
  const totalPctChange = startValue !== 0 ? ((totalVariance / Math.abs(startValue)) * 100) : 0;
  const isPositiveTotal = totalVariance >= 0;

  const layout = {
    title: {
      text: buildTitle(),
      font: {
        size: 17,
        color: '#1E293B',
        family: "'Inter', 'Segoe UI', -apple-system, sans-serif"
      },
      x: 0.5,
      xanchor: 'center',
      y: 0.96
    },
    xaxis: {
      type: 'category',
      tickangle: 0,
      tickfont: {
        size: 10,
        color: '#475569',
        family: "'Inter', 'Segoe UI', -apple-system, sans-serif"
      },
      showgrid: false,
      showline: false,
      linecolor: '#E2E8F0',
      linewidth: 1,
      automargin: true,
      side: 'bottom'
    },
    yaxis: {
      visible: true,
      showgrid: false,
      showticklabels: false,
      zeroline: false,
      automargin: true,
      autorange: true,
      fixedrange: true
    },
    margin: {
      l: 20,
      r: 20,
      t: periodInfo ? 80 : 60,
      b: 60,
      pad: 10  // Add padding between bars and edge
    },
    showlegend: false,
    autosize: true,
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    hoverlabel: {
      bgcolor: '#1E293B',
      bordercolor: '#1E293B',
      font: {
        color: '#FFFFFF',
        size: 13,
        family: "'Inter', 'Segoe UI', -apple-system, sans-serif"
      }
    },
    annotations: []  // Net Change shown as separate element below chart
  };

  const config = {
    displayModeBar: false,
    responsive: true,
    staticPlot: false
  };

  // Net Change badge styles
  const netChangeStyle = {
    display: 'inline-block',
    marginTop: '8px',
    padding: '6px 14px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    fontFamily: "'Inter', 'Segoe UI', -apple-system, sans-serif",
    backgroundColor: isPositiveTotal ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
    color: isPositiveTotal ? '#059669' : '#DC2626',
    border: `1.5px solid ${isPositiveTotal ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`
  };

  return (
    <div className="waterfall-chart waterfall-chart--premium">
      <Plot
        data={data}
        layout={layout}
        config={config}
        style={{ width: '100%', height: height }}
        useResizeHandler={true}
      />
      <div style={{ textAlign: 'center', marginTop: '-10px' }}>
        <span style={netChangeStyle}>
          <strong>Net Change:</strong> {isPositiveTotal ? '+' : ''}{titleCurrency} {formatValueAbbreviated(totalVariance)} ({isPositiveTotal ? '+' : ''}{totalPctChange.toFixed(1)}%)
        </span>
      </div>
    </div>
  );
};

export default WaterfallChart;
