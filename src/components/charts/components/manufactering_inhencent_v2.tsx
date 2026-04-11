
import React, { useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { useCurrency } from '../../../contexts/CurrencyContext';

/**
 * Manufacturing Cost Chart — Enhanced Readability (V2)
 * File: manufactering_inhencent_v2.tsx
 *
 * Key improvements vs V1:
 *  - Labels only on the MAX bar per ledger (others hidden) to avoid clutter.
 *  - Label "chips" with light bg + 1px border for contrast, auto-contrasted text.
 *  - Larger bars (barMaxWidth 44), tighter gaps for stronger visuals.
 *  - Taller chart (height 520).
 *  - Same compact tooltip (axis trigger).
 */

// === Helpers ===
const loadUAESymbolFont = () => {
  if (typeof document === 'undefined') return;
  const existingStyle = document.getElementById('uae-symbol-font-style');
  if (existingStyle) return;
  const style = document.createElement('style');
  style.id = 'uae-symbol-font-style';
  style.textContent = `
    @font-face {
      font-family: 'UAESymbol';
      src: url('/assets/font.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    .uae-symbol { font-family: 'UAESymbol', sans-serif; }
  `;
  document.head.appendChild(style);
};

const luminance = (hex: string) => {
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  const a = [r,g,b].map(v => (v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4)));
  return 0.2126*a[0] + 0.7152*a[1] + 0.0722*a[2];
};

// UAE Dirham symbol as inline SVG for HTML strings
const getUAEDirhamSVG = (color = 'currentColor', size = '1em') => 
  `<svg viewBox="0 0 344.84 299.91" xmlns="http://www.w3.org/2000/svg" fill="${color}" style="display:inline-block;vertical-align:-0.1em;width:${size};height:${size};margin-right:0.15em;"><path d="M342.14,140.96l2.7,2.54v-7.72c0-17-11.92-30.84-26.56-30.84h-23.41C278.49,36.7,222.69,0,139.68,0c-52.86,0-59.65,0-109.71,0,0,0,15.03,12.63,15.03,52.4v52.58h-27.68c-5.38,0-10.43-2.08-14.61-6.01l-2.7-2.54v7.72c0,17.01,11.92,30.84,26.56,30.84h18.44s0,29.99,0,29.99h-27.68c-5.38,0-10.43-2.07-14.61-6.01l-2.7-2.54v7.71c0,17,11.92,30.82,26.56,30.82h18.44s0,54.89,0,54.89c0,38.65-15.03,50.06-15.03,50.06h109.71c85.62,0,139.64-36.96,155.38-104.98h32.46c5.38,0,10.43,2.07,14.61,6l2.7,2.54v-7.71c0-17-11.92-30.83-26.56-30.83h-18.9c.32-4.88.49-9.87.49-15s-.18-10.11-.51-14.99h28.17c5.37,0,10.43,2.07,14.61,6.01ZM89.96,15.01h45.86c61.7,0,97.44,27.33,108.1,89.94l-153.96.02V15.01ZM136.21,284.93h-46.26v-89.98l153.87-.02c-9.97,56.66-42.07,88.38-107.61,90ZM247.34,149.96c0,5.13-.11,10.13-.34,14.99l-157.04.02v-29.99l157.05-.02c.22,4.84.33,9.83.33,15Z"/></svg>`;

// === Constants ===
const MANUFACTURING_LEDGERS = {
  LABOUR: { label: 'Labour', rowIndex: 9 },
  DEPRECIATION: { label: 'Depreciation', rowIndex: 10 },
  ELECTRICITY: { label: 'Electricity', rowIndex: 12 },
  OTHER_OVERHEADS: { label: 'Others Mfg. Overheads', rowIndex: 13 },
  TOTAL_DIRECT_COST: { label: 'Total Actual Direct Cost', rowIndex: 14 },
};

const colorSchemes = [
  { name: 'blue', label: 'Blue', primary: '#288cfa' },
  { name: 'green', label: 'Green', primary: '#2E865F' },
  { name: 'yellow', label: 'Yellow', primary: '#FFD700' },
  { name: 'orange', label: 'Orange', primary: '#FF6B35' },
  { name: 'boldContrast', label: 'Bold Contrast', primary: '#003366' }
];

const defaultColors = ['#0b2b4b', '#ff6b35', '#288cfa', '#2E865F', '#FFD700', '#003366', '#91cc75', '#5470c6'];

const ledgerItems = Object
  .values(MANUFACTURING_LEDGERS)
  .filter(item => item !== MANUFACTURING_LEDGERS.TOTAL_DIRECT_COST);

type Period = {
  year: string;
  month?: string;
  type: string;
  isCustomRange?: boolean;
  displayName?: string;
  customColor?: string;
};

type Props = {
  tableData: any;
  selectedPeriods: Period[];
  computeCellValue: (rowIndex: number, period: Period) => number;
  basePeriod?: string;
  style?: React.CSSProperties;
  /** 'max-only' shows label only on the tallest bar per category; 'all' shows all values */
  labelMode?: 'max-only' | 'all';
};

const ManufacturingCostChartV2: React.FC<Props> = ({
  tableData,
  selectedPeriods,
  computeCellValue,
  basePeriod,
  style,
  labelMode = 'max-only'
}) => {
  const { companyCurrency, isUAEDirham } = useCurrency();
  
  // Dynamic currency symbol for HTML labels
  const getCurrencySymbolHTML = (color = 'currentColor', size = '1em') => {
    if (isUAEDirham()) {
      return getUAEDirhamSVG(color, size);
    }
    return `<span style="font-weight:bold;margin-right:0.15em;">${companyCurrency.symbol}</span>`;
  };
  
  useEffect(() => { loadUAESymbolFont(); }, []);

  if (!selectedPeriods || selectedPeriods.length === 0 || typeof computeCellValue !== 'function') {
    return (
      <div className="modern-margin-gauge-panel" style={{ marginTop: 30, padding: 20, textAlign: 'center' }}>
        <h2 className="modern-gauge-heading">Manufacturing Cost</h2>
        <p>No data available. Please select a period.</p>
      </div>
    );
  }

  const periodsToUse = selectedPeriods.slice(0, 5);

  const nameOf = (p: Period) =>
    `${p.year} ${p.isCustomRange ? (p.displayName || '') : (p.month || '')} ${p.type}`.trim();

  const periodNames = periodsToUse.map(nameOf);

  const ledgersData: Record<string, { label: string; values: Record<string, { amount: number; percentOfSales: number; perKg: number }> }> = {};
  const periodTotals: Record<string, { amount: number; percentOfSales: number; perKg: number }> = {};

  periodsToUse.forEach(period => {
    const pn = nameOf(period);
    periodTotals[pn] = { amount: 0, percentOfSales: 0, perKg: 0 };
  });

  ledgerItems.forEach(ledger => {
    ledgersData[ledger.label] = { label: ledger.label, values: {} as any };
    periodNames.forEach(pn => {
      ledgersData[ledger.label].values[pn] = { amount: 0, percentOfSales: 0, perKg: 0 };
    });
  });

  periodsToUse.forEach(period => {
    const pn = nameOf(period);
    let sum = 0;
    ledgerItems.forEach(ledger => {
      const amount = Number(computeCellValue(ledger.rowIndex, period)) || 0;
      const salesValue = Number(computeCellValue(3, period)) || 0;
      const salesKg = Number(computeCellValue(7, period)) || 0;
      const percentOfSales = salesValue ? (amount / salesValue) * 100 : 0;
      const perKg = salesKg ? amount / salesKg : 0;
      ledgersData[ledger.label].values[pn] = { amount, percentOfSales, perKg };
      sum += amount;
    });
    const explicitTotal = Number(computeCellValue(MANUFACTURING_LEDGERS.TOTAL_DIRECT_COST.rowIndex, period));
    const totalAmount = Number.isFinite(explicitTotal) ? explicitTotal : sum;
    const salesValueTotal = Number(computeCellValue(3, period)) || 0;
    const salesKgTotal = Number(computeCellValue(7, period)) || 0;
    periodTotals[pn] = {
      amount: totalAmount,
      percentOfSales: salesValueTotal ? (totalAmount / salesValueTotal) * 100 : 0,
      perKg: salesKgTotal ? totalAmount / salesKgTotal : 0
    };
  });

  const sortedLedgerList = Object.values(ledgersData).sort((a, b) => {
    const aSum = Object.values(a.values).reduce((s, v) => s + v.amount, 0);
    const bSum = Object.values(b.values).reduce((s, v) => s + v.amount, 0);
    return bSum - aSum;
  });
  const ledgerLabels = sortedLedgerList.map(l => l.label);

  const colorFor = (period: Period, idx: number) => {
    if (period.customColor) {
      const hit = colorSchemes.find(s => s.name === period.customColor);
      if (hit) return hit.primary;
    }
    if (period.type === 'Budget') return '#2E865F';
    if (period.month === 'Year') return '#FFD700';
    return defaultColors[idx % defaultColors.length];
  };

  // Precompute max series index per ledger to show label for tallest bar
  const maxSeriesByLedger: Record<string, string> = {};
  ledgerLabels.forEach(label => {
    let maxName = periodNames[0];
    let maxVal = -Infinity;
    periodNames.forEach(pn => {
      const v = sortedLedgerList.find(l => l.label === label)?.values[pn]?.amount || 0;
      if (v > maxVal) { maxVal = v; maxName = pn; }
    });
    maxSeriesByLedger[label] = maxName;
  });

  const series = periodsToUse.map((period, i) => {
    const pn = nameOf(period);
    const color = colorFor(period, i);
    const lightChip = 'rgba(255,255,255,0.92)';
    const textColor = luminance(color) < 0.45 ? '#0b2b4b' : '#1a1a1a';

    return {
      name: pn,
      type: 'bar',
      barMaxWidth: 44,
      barGap: '8%',
      barCategoryGap: '25%',
      label: {
        show: true,
        position: 'top',
        formatter: (params: any) => {
          const row = sortedLedgerList.find(l => l.label === params.name);
          const datum = row?.values[pn];
          if (!datum || !datum.amount) return '';
          // Show label only for max bar (unless labelMode === 'all')
          if (labelMode !== 'all' && maxSeriesByLedger[params.name] !== pn) return '';
          return `${getCurrencySymbolHTML(textColor)} ${(datum.amount/1_000_000).toFixed(2)}M`;
        },
        backgroundColor: lightChip,
        padding: [2,6],
        borderRadius: 4,
        borderWidth: 1,
        borderColor: color,
        color: textColor,
        fontSize: 12,
        fontWeight: 700,
        distance: 6
      },
      labelLayout: { hideOverlap: true, moveOverlap: 'shiftY' },
      emphasis: { focus: 'series', blurScope: 'coordinateSystem' },
      itemStyle: { color, borderRadius: [3, 3, 0, 0] },
      data: ledgerLabels.map(label => {
        const row = sortedLedgerList.find(l => l.label === label);
        return row?.values[pn]?.amount || 0;
      })
    };
  });

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      confine: true,
      appendToBody: false,
      borderRadius: 6,
      backgroundColor: 'rgba(255,255,255,0.98)',
      borderColor: '#cfcfcf',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      extraCssText: 'padding:8px 10px; line-height:1.35;',
      formatter: (items: any[]) => {
        if (!items?.length) return '';
        const ledgerName = items[0].axisValue;
        const lines = [`<div style="font-weight:700;margin-bottom:6px">${ledgerName}</div>`];
        items.forEach(it => {
          const row = sortedLedgerList.find(l => l.label === ledgerName);
          const datum = row?.values[it.seriesName] || { amount: 0, percentOfSales: 0, perKg: 0 };
          lines.push(
            `<div style="display:flex;align-items:center;margin:2px 0;">
              <span style="width:10px;height:10px;border-radius:2px;background:${it.color};margin-right:6px;"></span>
              <span style="min-width:160px;font-weight:600">${it.seriesName}</span>
              <span style="margin-left:auto;">${getCurrencySymbolHTML('#333')} ${(datum.amount/1_000_000).toFixed(2)}M&nbsp;&nbsp;|&nbsp;&nbsp;${datum.percentOfSales.toFixed(1)}%/Sls&nbsp;&nbsp;|&nbsp;&nbsp;${getCurrencySymbolHTML('#333')} ${datum.perKg.toFixed(1)}/kg</span>
            </div>`
          );
        });
        return lines.join('');
      }
    },
    legend: {
      data: periodNames,
      type: 'scroll',
      top: 6,
      left: 'center',
      icon: 'roundRect',
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { fontSize: 14, fontWeight: 600, color: '#444' },
      pageIconColor: '#888',
      pageTextStyle: { color: '#888' }
    },
    grid: { left: 18, right: 18, top: 70, bottom: 70, containLabel: true },
    xAxis: {
      type: 'category',
      data: ledgerLabels,
      axisLabel: {
        fontWeight: 700,
        fontSize: 13,
        color: '#3a3a3a',
        interval: 0,
        formatter: (value: string) => {
          if (value === 'Others Mfg. Overheads') return 'Manufacturing\nOverhead';
          if (value.length > 20) return value.slice(0, 17) + '...';
          return value;
        }
      },
      axisLine: { lineStyle: { color: '#d9d9d9' } },
      axisTick: { show: false },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#666', fontSize: 12, formatter: (v: number) => `${(v/1_000_000).toFixed(0)}M` },
      splitLine: { show: true, lineStyle: { color: '#eee', type: 'dashed' } }
    },
    series
  };

  return (
    <div style={{ width: '100%', minWidth: 0, ...style }}>
      <div style={{ textAlign: 'center' }}>
        <h2 className="modern-gauge-heading" style={{ marginBottom: '5px' }}>Manufacturing Cost</h2>
        <div style={{ marginBottom: '12px' }}>
          <span style={{ fontSize: 14, fontWeight: 400, color: '#666', fontStyle: 'italic' }}>
            Labels shown on tallest bar per ledger for clarity (switch to labelMode="all" to show all).
          </span>
        </div>
      </div>
      <ReactECharts
        option={option as any}
        style={{ width: '100%', minWidth: 0, height: 520 }}
        notMerge={true}
        lazyUpdate={true}
      />
    </div>
  );
};

export default ManufacturingCostChartV2;
