import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useCurrency } from '../../../contexts/CurrencyContext';
import UAEDirhamSymbol from '../../dashboard/UAEDirhamSymbol';

/**
 * EChartsWaterfallChart Component
 * --------------------------------
 * A waterfall/bridge chart built with ECharts that supports:
 * - SVG currency symbols (including UAE Dirham)
 * - Floating variance bars with connectors
 * - Premium styling consistent with dashboard
 * 
 * Uses stacked bar technique to simulate waterfall effect.
 */

const EChartsWaterfallChart = ({ 
  title,
  subtitle,
  startLabel, 
  endLabel, 
  startValue, 
  endValue, 
  variances = [],
  height = 400,
  periodInfo = ''
}) => {
  const { companyCurrency, isUAEDirham } = useCurrency();
  
  // For ECharts text, use simple text representation
  // The SVG symbol will be rendered in React elements outside the chart
  const currencyText = isUAEDirham() ? '' : (companyCurrency.symbol || '$');
  const showUAESymbol = isUAEDirham();

  // Format value with abbreviation
  const formatValueAbbreviated = (value) => {
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
  };

  // Colors - defined before chartData since it uses these
  const COLORS = {
    start: '#3B82F6',      // Vibrant blue
    end: '#8B5CF6',        // Purple
    favorable: '#10B981',  // Emerald green
    unfavorable: '#EF4444', // Warm red
    connector: '#94A3B8'   // Slate gray
  };

  // Build chart data with proper waterfall calculations
  const chartData = useMemo(() => {
    const categories = [
      startLabel.replace('<br>', '\n'),
      ...variances.map(v => v.label.replace('<br>', '\n')),
      endLabel.replace('<br>', '\n')
    ];

    // Build bars with start/end Y positions for true waterfall
    const bars = [];
    let runningTotal = startValue;

    // Start bar (from 0 to startValue)
    bars.push({
      name: categories[0],
      y0: 0,
      y1: startValue,
      value: startValue,
      displayValue: startValue,
      color: COLORS.start,
      isStart: true
    });

    // Variance bars (floating from running total)
    variances.forEach((v, i) => {
      const variance = v.value;
      const isFavorable = v.isPositiveGood ? variance >= 0 : variance <= 0;
      const color = isFavorable ? COLORS.favorable : COLORS.unfavorable;
      
      const y0 = runningTotal;
      const y1 = runningTotal + variance;
      
      bars.push({
        name: categories[i + 1],
        y0: Math.min(y0, y1),
        y1: Math.max(y0, y1),
        value: variance,
        displayValue: variance,
        color,
        isFavorable,
        isVariance: true,
        originalY0: y0,
        originalY1: y1
      });
      
      runningTotal += variance;
    });

    // End bar (from 0 to endValue)
    bars.push({
      name: categories[categories.length - 1],
      y0: 0,
      y1: endValue,
      value: endValue,
      displayValue: endValue,
      color: COLORS.end,
      isEnd: true
    });

    // Calculate Y-axis range
    const allYValues = bars.flatMap(b => [b.y0, b.y1]);
    const minY = Math.min(0, ...allYValues);
    const maxY = Math.max(...allYValues);
    const padding = (maxY - minY) * 0.15;

    return { categories, bars, minY: minY - padding * 0.5, maxY: maxY + padding };
  }, [startLabel, endLabel, startValue, endValue, variances]);

  // Calculate total variance
  const totalVariance = endValue - startValue;
  const totalPctChange = startValue !== 0 ? ((totalVariance / Math.abs(startValue)) * 100) : 0;
  const isPositiveTotal = totalVariance >= 0;

  // Build ECharts option using custom renderItem for precise positioning
  const option = useMemo(() => {
    const { categories, bars, minY, maxY } = chartData;

    return {
      tooltip: {
        trigger: 'item',
        confine: true,
        appendToBody: false,
        formatter: (params) => {
          const idx = params?.dataIndex;
          const bar = bars[idx];
          if (!bar) return '';
          
          const formatted = bar.displayValue.toLocaleString(undefined, { 
            minimumFractionDigits: 0, 
            maximumFractionDigits: 0 
          });
          const sign = bar.isVariance && bar.displayValue >= 0 ? '+' : '';
          return `<div style="font-size:13px;line-height:1.4;"><strong>${bar.name.replace('\n', ' ')}</strong><br/>${sign}${currencyText} ${formatted}</div>`;
        },
        backgroundColor: '#1E293B',
        borderColor: '#1E293B',
        borderWidth: 0,
        borderRadius: 6,
        padding: [8, 12],
        textStyle: { color: '#FFFFFF', fontSize: 13 },
        extraCssText: 'max-width: 180px !important; min-width: 80px !important; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 999;'
      },
      grid: {
        left: 50,
        right: 50,
        top: 50,
        bottom: 80,
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: categories,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          fontSize: 10,
          color: '#475569',
          fontFamily: "'Inter', 'Segoe UI', -apple-system, sans-serif",
          interval: 0
        }
      },
      yAxis: {
        type: 'value',
        min: minY,
        max: maxY,
        show: false,
        axisLine: { show: false },
        splitLine: { show: false }
      },
      series: [
        // Main bars using custom rendering
        {
          type: 'custom',
          renderItem: (params, api) => {
            const categoryIndex = api.value(0);
            const bar = bars[categoryIndex];
            if (!bar) return;

            const start = api.coord([categoryIndex, bar.y0]);
            const end = api.coord([categoryIndex, bar.y1]);
            const barWidth = api.size([1, 0])[0] * 0.5;

            const x = start[0] - barWidth / 2;
            const y = Math.min(start[1], end[1]);
            const barHeight = Math.abs(end[1] - start[1]);

            return {
              type: 'rect',
              shape: {
                x,
                y,
                width: barWidth,
                height: barHeight,
                r: [4, 4, 4, 4]
              },
              style: {
                fill: bar.color
              }
            };
          },
          data: bars.map((_, i) => [i]),
          encode: { x: 0 },
          z: 10
        },
        // Labels
        {
          type: 'custom',
          renderItem: (params, api) => {
            const categoryIndex = api.value(0);
            const bar = bars[categoryIndex];
            if (!bar) return;

            const labelY = bar.y1;
            const pos = api.coord([categoryIndex, labelY]);
            
            let labelText;
            if (bar.isStart || bar.isEnd) {
              labelText = formatValueAbbreviated(bar.displayValue);
            } else {
              const sign = bar.displayValue >= 0 ? '+' : '';
              labelText = sign + formatValueAbbreviated(bar.displayValue);
            }

            return {
              type: 'text',
              x: pos[0],
              y: pos[1] - 12,
              style: {
                text: labelText,
                fill: bar.color,
                font: "600 12px 'Inter', sans-serif",
                textAlign: 'center'
              }
            };
          },
          data: bars.map((_, i) => [i]),
          encode: { x: 0 },
          z: 20,
          silent: true
        },
        // Connector lines between bars
        {
          type: 'custom',
          renderItem: (params, api) => {
            const categoryIndex = api.value(0);
            if (categoryIndex >= bars.length - 1) return;

            const bar = bars[categoryIndex];
            
            // Connect from the end of current bar to the next
            // For variance bars, use the originalY1 (where the value ends up)
            const connectorY = bar.isVariance ? bar.originalY1 : bar.y1;
            
            const start = api.coord([categoryIndex, connectorY]);
            const end = api.coord([categoryIndex + 1, connectorY]);
            const barWidth = api.size([1, 0])[0] * 0.5;

            return {
              type: 'line',
              shape: {
                x1: start[0] + barWidth / 2,
                y1: start[1],
                x2: end[0] - barWidth / 2,
                y2: end[1]
              },
              style: {
                stroke: COLORS.connector,
                lineWidth: 1.5,
                lineDash: [4, 3]
              }
            };
          },
          data: bars.slice(0, -1).map((_, i) => [i]),
          encode: { x: 0 },
          z: 5,
          silent: true
        }
      ]
    };
  }, [chartData, currencyText, formatValueAbbreviated]);

  // Net Change badge styles
  const netChangeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
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

  // Currency display component - uses SVG for UAE Dirham
  const CurrencyDisplay = ({ value, showSign = false }) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
      {showSign && (value >= 0 ? '+' : '')}
      {showUAESymbol ? <UAEDirhamSymbol style={{ width: '0.9em', height: '0.9em' }} /> : currencyText}
      {' '}{formatValueAbbreviated(value)}
    </span>
  );

  return (
    <div className="waterfall-chart waterfall-chart--echarts">
      {/* Custom subtitle with SVG currency symbol */}
      <div style={{ textAlign: 'center', marginBottom: '-20px', paddingTop: '10px' }}>
        <div style={{ fontSize: '16px', fontWeight: 600, color: '#1E293B', fontFamily: "'Inter', 'Segoe UI', -apple-system, sans-serif" }}>
          {title}
        </div>
        {periodInfo && (
          <div style={{ fontSize: '12px', color: '#64748B', fontFamily: "'Inter', 'Segoe UI', -apple-system, sans-serif", display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            {showUAESymbol ? <UAEDirhamSymbol style={{ width: '0.9em', height: '0.9em' }} /> : currencyText} {periodInfo}
          </div>
        )}
      </div>
      <ReactECharts 
        option={option} 
        style={{ width: '100%', height: height }}
        opts={{ renderer: 'svg' }}
      />
      <div style={{ textAlign: 'center', marginTop: '-5px' }}>
        <span style={netChangeStyle}>
          <strong>Net Change:</strong>
          <CurrencyDisplay value={totalVariance} showSign={true} />
          ({isPositiveTotal ? '+' : ''}{totalPctChange.toFixed(1)}%)
        </span>
      </div>
    </div>
  );
};

export default EChartsWaterfallChart;
