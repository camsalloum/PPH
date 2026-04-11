import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import './ManufacturingCostTotals.css';
import CurrencySymbol from '../../dashboard/CurrencySymbol';
import { useCurrency } from '../../../contexts/CurrencyContext';
import { getColumnColorPalette } from '../../dashboard/utils/colorUtils';

// Helper function to get UAE symbol as data URL for ECharts rich text
const getUAESymbolImageDataURL = (color = '#222') => {
  const svg = `<svg viewBox="0 0 344.84 299.91" xmlns="http://www.w3.org/2000/svg" fill="${color}"><path d="M342.14,140.96l2.7,2.54v-7.72c0-17-11.92-30.84-26.56-30.84h-23.41C278.49,36.7,222.69,0,139.68,0c-52.86,0-59.65,0-109.71,0,0,0,15.03,12.63,15.03,52.4v52.58h-27.68c-5.38,0-10.43-2.08-14.61-6.01l-2.7-2.54v7.72c0,17.01,11.92,30.84,26.56,30.84h18.44s0,29.99,0,29.99h-27.68c-5.38,0-10.43-2.07-14.61-6.01l-2.7-2.54v7.71c0,17,11.92,30.82,26.56,30.82h18.44s0,54.89,0,54.89c0,38.65-15.03,50.06-15.03,50.06h109.71c85.62,0,139.64-36.96,155.38-104.98h32.46c5.38,0,10.43,2.07,14.61,6l2.7,2.54v-7.71c0-17-11.92-30.83-26.56-30.83h-18.9c.32-4.88.49-9.87.49-15s-.18-10.11-.51-14.99h28.17c5.37,0,10.43,2.07,14.61,6.01ZM89.96,15.01h45.86c61.7,0,97.44,27.33,108.1,89.94l-153.96.02V15.01ZM136.21,284.93h-46.26v-89.98l153.87-.02c-9.97,56.66-42.07,88.38-107.61,90ZM247.34,149.96c0,5.13-.11,10.13-.34,14.99l-157.04.02v-29.99l157.05-.02c.22,4.84.33,9.83.33,15Z"/></svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
};

// Manufacturing cost ledger items and their positions
// These need to match the actual row positions in your table data
const MANUFACTURING_LEDGERS = {
  LABOUR: { label: 'Labour', rowIndex: 9 }, // Updated with correct row index
  DEPRECIATION: { label: 'Depreciation', rowIndex: 10 }, // Updated with correct row index
  ELECTRICITY: { label: 'Electricity', rowIndex: 12 }, // Updated with correct row index  
  OTHER_OVERHEADS: { label: 'Others Mfg. Overheads', rowIndex: 13 }, // Updated with correct row index
  TOTAL_DIRECT_COST: { label: 'Total Actual Direct Cost', rowIndex: 14 }, // Updated with correct row index
};

// Default fallback colors in order (only used if column palette fails)
const defaultColors = ['#FFD700', '#288cfa', '#003366', '#91cc75', '#5470c6'];

// Get all ledger items except the total
const ledgerItems = Object.values(MANUFACTURING_LEDGERS).filter(item => 
  item !== MANUFACTURING_LEDGERS.TOTAL_DIRECT_COST);

// Add a simple helper to format values in the way that matches your screenshot
const formatAsReadableNumber = (value) => {
  if (typeof value !== 'number' || isNaN(value)) return '0.00';
  
  // Convert to string with 2 decimal places
  return value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const computeManufacturingTypography = (
  containerWidth: number,
  containerHeight: number,
  periodCount: number
) => {
  const width = containerWidth || (typeof window !== 'undefined' ? window.innerWidth : 1024);
  const height = containerHeight || (typeof window !== 'undefined' ? window.innerHeight : 768);

  // Match Below GP Expenses font sizes: 14/12/10 based on period count
  const baseInsideLabel = periodCount <= 2 ? 14 : periodCount <= 4 ? 12 : 10;
  const baseAxisLabel = 13;
  const baseLegend = 16;
  const baseCurrency = 12;

  const scale = clampNumber(Math.min(width / 900, height / 600), 0.75, 1); // Increased min scale from 0.65 to 0.75
  const isTight = width <= 480 || height <= 420;

  let insideLabelFontSize = Math.round(baseInsideLabel * scale);
  let axisLabelFontSize = Math.round(baseAxisLabel * scale);
  let legendFontSize = Math.round(baseLegend * scale);
  let currencySymbolSize = Math.round(baseCurrency * scale);

  if (isTight) {
    insideLabelFontSize = Math.min(insideLabelFontSize, 10); // Increased from 9 to 10
    axisLabelFontSize = Math.min(axisLabelFontSize, 10);
    legendFontSize = Math.min(legendFontSize, 11);
    currencySymbolSize = Math.min(currencySymbolSize, 10); // Increased from 9 to 10
  }

  // Increased minimum from 8 to 10 to match Below GP Expenses
  insideLabelFontSize = clampNumber(insideLabelFontSize, 10, 14);
  axisLabelFontSize = clampNumber(axisLabelFontSize, 10, 13);
  legendFontSize = clampNumber(legendFontSize, 10, 16);
  currencySymbolSize = clampNumber(currencySymbolSize, 10, 12);

  const emphasisLabelFontSize = clampNumber(insideLabelFontSize + 1, 10, 14);
  const smallBarLineHeight = clampNumber(Math.round(insideLabelFontSize * 1.4), 14, 18); // Increased min from 12 to 14
  const insideBarLineHeight = 12; // Fixed to match Below GP Expenses - prevents labels from overflowing bars

  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : height;
  const chartHeightPx = clampNumber(Math.round(viewportHeight * 0.55), 280, 483);

  const totalsPeriodNameFontSize = clampNumber(Math.round(14 * scale), 10, 14);
  const totalsAmountFontSize = clampNumber(Math.round(22 * scale), 14, 22);
  const totalsMetaFontSize = clampNumber(Math.round(12 * scale), 10, 12);
  const varianceFontSize = clampNumber(Math.round(16 * scale), 12, 16);

  return {
    scale,
    insideLabelFontSize,
    axisLabelFontSize,
    legendFontSize,
    currencySymbolSize,
    emphasisLabelFontSize,
    smallBarLineHeight,
    insideBarLineHeight,
    chartHeightPx,
    totalsPeriodNameFontSize,
    totalsAmountFontSize,
    totalsMetaFontSize,
    varianceFontSize,
  };
};

const ManufacturingCostChart = ({ tableData, selectedPeriods, computeCellValue, basePeriod, style, hideHeader = false }) => {
  const { companyCurrency, isUAEDirham } = useCurrency();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Limit to 5 periods max (safe even if selectedPeriods is undefined)
  const periodsToUse = Array.isArray(selectedPeriods) ? selectedPeriods.slice(0, 5) : [];
  const typography = useMemo(
    () => computeManufacturingTypography(containerSize.width, containerSize.height, periodsToUse.length),
    [containerSize.width, containerSize.height, periodsToUse.length]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        setContainerSize({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      });
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, []);
  
  // Dynamic currency symbol helper for ECharts
  const getCurrencyRichText = (color: string, size: number) => {
    if (isUAEDirham()) {
      return {
        width: size,
        height: size,
        lineHeight: size,
        padding: [-1, 2, 0, 0],
        align: 'center',
        verticalAlign: 'top',
        backgroundColor: {
          image: getUAESymbolImageDataURL(color)
        }
      };
    }
    // For non-AED currencies, use text-based symbol
    return {
      fontSize: size,
      fontWeight: 'bold',
      color: color,
      verticalAlign: 'middle',
      lineHeight: size
    };
  };
  
  // Format currency prefix for labels
  const getCurrencyPrefix = () => {
    if (isUAEDirham()) {
      return '{currency|}';
    }
    return companyCurrency.symbol;
  };
  
  // Debug initial props
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
    console.group('ManufacturingCostChart - Initial Props');
    console.log('tableData:', tableData);
    console.log('selectedPeriods:', selectedPeriods);
    console.log('computeCellValue function available:', typeof computeCellValue === 'function');
    console.log('Number of selected periods:', selectedPeriods?.length || 0);
    console.log('Style prop:', style);
    console.groupEnd();
    }
  }, [tableData, selectedPeriods, computeCellValue, style]);

  // If no periods selected or no compute function, show empty state
  if (periodsToUse.length === 0 || typeof computeCellValue !== 'function') {
    if (process.env.NODE_ENV === 'development') {
    console.error('ManufacturingCostChart: Missing required props');
    }
    
    return (
      <div className="modern-margin-gauge-panel" style={{ marginTop: 30, padding: 20, textAlign: 'center' }}>
        <h2 className="modern-gauge-heading">Manufacturing Cost</h2>
        <p>No data available. Please select a period.</p>
      </div>
    );
  }

  // Extract data for all ledgers across all periods
  const ledgersData = {};
  const periodTotals = {};

  // FIRST: Calculate all period names that will be used
  const allPeriodNames = periodsToUse.map(period => {
    const periodName = `${period.year} ${period.isCustomRange ? period.displayName : (period.month || '')} ${period.type}`;
    

    
    return periodName;
  });
  


  // Initialize data structure for ALL periods and ledgers
  ledgerItems.forEach(ledger => {
    ledgersData[ledger.label] = { label: ledger.label, values: {} };
    // Initialize ALL periods for this ledger
    allPeriodNames.forEach(periodName => {
      ledgersData[ledger.label].values[periodName] = {
        amount: 0,
        percentOfSales: 0,
        perKg: 0
      };
    });
  });

  // ENSURE ALL PERIODS GET PROCESSED - Initialize all period totals first
  // Initialize all periods in totals
  allPeriodNames.forEach(periodName => {
    periodTotals[periodName] = {
      amount: 0,
      percentOfSales: 0,
      perKg: 0
    };
  });

  // Process each period
  periodsToUse.forEach((period, periodIndex) => {
    try {
      // Create a readable period name 
      const periodName = `${period.year} ${period.isCustomRange ? period.displayName : (period.month || '')} ${period.type}`;
      let periodTotal = 0;

      // Process each ledger for this period
      ledgerItems.forEach(ledger => {
        try {
          // Get the base amount - using the default behavior
          const amount = computeCellValue(ledger.rowIndex, period);
          
          // Get values needed for calculations
          // Row 3 is Sales
          const salesValue = computeCellValue(3, period);
          // Row 7 is Sales Volume (kg)
          const salesVolumeValue = computeCellValue(7, period);
          

          
          // Calculate percent of sales exactly as in TableView.js
          let percentOfSales = 0;
          if (typeof salesValue === 'number' && !isNaN(salesValue) && salesValue !== 0) {
            percentOfSales = (amount / salesValue) * 100;
          }
          
          // Calculate per kg value exactly as in TableView.js
          let perKgValue = 0;
          if (typeof salesVolumeValue === 'number' && !isNaN(salesVolumeValue) && salesVolumeValue !== 0) {
            perKgValue = amount / salesVolumeValue;
          }
          


          // Store the values in our data structure
          const validAmount = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
          const validPercentOfSales = typeof percentOfSales === 'number' && !isNaN(percentOfSales) ? percentOfSales : 0;
          const validPerKg = typeof perKgValue === 'number' && !isNaN(perKgValue) ? perKgValue : 0;
          
          ledgersData[ledger.label].values[periodName] = {
            amount: validAmount,
            percentOfSales: validPercentOfSales,
            perKg: validPerKg
          };
          
          // Add to period totals
          periodTotal += validAmount;
        } catch (err) {
          if (process.env.NODE_ENV === 'development') {
          console.error(`Error extracting data for ${ledger.label} in period ${periodName}:`, err);
          }
          ledgersData[ledger.label].values[periodName] = {
            amount: 0,
            percentOfSales: 0,
            perKg: 0
          };
        }
      });

      // Calculate percent of sales and per kg for the total (using the sum of all ledgers)
      const salesValue = computeCellValue(3, period);
      const salesVolumeValue = computeCellValue(7, period);
      
      let totalPercentOfSales = 0;
      if (typeof salesValue === 'number' && !isNaN(salesValue) && salesValue !== 0) {
        totalPercentOfSales = (periodTotal / salesValue) * 100;
      }
      
      let totalPerKgValue = 0;
      if (typeof salesVolumeValue === 'number' && !isNaN(salesVolumeValue) && salesVolumeValue !== 0) {
        totalPerKgValue = periodTotal / salesVolumeValue;
      }

      // Store the totals for this period (sum of Labour + Depreciation + Electricity + Others)
      periodTotals[periodName] = {
        amount: periodTotal,
        percentOfSales: totalPercentOfSales,
        perKg: totalPerKgValue
      };
    } catch (err) {
      const errorPeriodName = `${period.year} ${period.isCustomRange ? period.displayName : (period.month || '')} ${period.type}`;
      if (process.env.NODE_ENV === 'development') {
      console.error(`Error processing period ${errorPeriodName}:`, err);
      }
    }
  });

  // Sort ledgers by the average amount across periods (descending)
  const ledgersList = Object.values(ledgersData);
  ledgersList.sort((a, b) => {
    const aAvg = Object.values(a.values).reduce((sum, val) => sum + (val.amount || 0), 0) / Object.values(a.values).length;
    const bAvg = Object.values(b.values).reduce((sum, val) => sum + (val.amount || 0), 0) / Object.values(b.values).length;
    return bAvg - aAvg;
  });

  // Get sorted labels and period names
  const ledgerLabels = ledgersList.map(ledger => ledger.label);
  // Use the pre-calculated period names to ensure all 5 periods appear
  const periodNames = allPeriodNames;
  


    // No need for max series logic since we show all labels inside bars

  // Prepare series for each period
  const series = periodsToUse.map((period, index) => {
    const periodName = `${period.year} ${period.isCustomRange ? period.displayName : (period.month || '')} ${period.type}`;
    
    // Use centralized color palette utility for consistent colors with gradient
    const palette = getColumnColorPalette(period);
    const color = {
      type: 'linear' as const,
      x: 0,
      y: 0,
      x2: 1,
      y2: 0,
      colorStops: [{
        offset: 0, color: palette.gradientFrom
      }, {
        offset: 1, color: palette.gradientTo
      }]
    };

    // Use palette text color for inside labels
    const insideTextColor = palette.text;
    const outsideTextColor = '#333'; // Dark text for outside labels
    
    // Calculate threshold for small bars (15% of max value in this period)
    const periodValues = ledgerLabels.map(label => {
      const ledger = ledgersList.find(l => l.label === label);
      return ledger?.values[periodName]?.amount || 0;
    });
    const maxValue = Math.max(...periodValues);
    const smallBarThreshold = maxValue * 0.15; // 15% of max is considered small
    
    return {
      name: periodName,
      type: 'bar',
      stack: 'total',
      hoverLayerThreshold: Infinity, // Disable hover layer
      emphasis: {
        focus: 'series',
        blurScope: 'coordinateSystem',
        label: {
          fontSize: 11,
          fontWeight: 'bold'
        }
      },
      // Use individual data items with custom label positioning
      data: ledgerLabels.map(label => {
        const ledger = ledgersList.find(l => l.label === label);
        const amount = ledger?.values[periodName]?.amount || 0;
        const data = ledger?.values[periodName];
        const isSmallBar = amount < smallBarThreshold;
        
        // Format values
        const millionsValue = data ? (data.amount / 1000000).toFixed(2) : '0.00';
        const percentValue = data ? data.percentOfSales.toFixed(1) : '0.0';
        const perKgValue = data ? data.perKg.toFixed(1) : '0.0';
        
        // Choose text color based on position
        const labelTextColor = isSmallBar ? outsideTextColor : insideTextColor;
        
        // Get dynamic currency prefix
        const currencyPrefix = getCurrencyPrefix();
        
        return {
          value: amount,
          label: {
            show: true,
            position: isSmallBar ? 'right' : 'inside',
            distance: isSmallBar ? 5 : 0,
            formatter: isSmallBar 
              ? currencyPrefix + ' ' + millionsValue + 'M  ' + percentValue + '%/Sls  ' + currencyPrefix + ' ' + perKgValue + '/kg'
              : currencyPrefix + ' ' + millionsValue + 'M\n\n' + percentValue + '%/Sls\n\n' + currencyPrefix + ' ' + perKgValue + '/kg',
            fontSize: typography.insideLabelFontSize,
            fontWeight: 'bold',
            color: labelTextColor,
            backgroundColor: isSmallBar ? 'rgba(255,255,255,0.9)' : 'transparent',
            padding: isSmallBar ? [2, 6] : [2, 4],
            borderRadius: isSmallBar ? 3 : 0,
            textBorderWidth: 0,
            shadowBlur: 0,
            lineHeight: isSmallBar ? typography.smallBarLineHeight : typography.insideBarLineHeight,
            align: isSmallBar ? 'left' : 'center',
            verticalAlign: 'middle',
            rich: {
              currency: getCurrencyRichText(labelTextColor, typography.currencySymbolSize)
            }
          }
        };
      }),
      itemStyle: {
        color: color,
        borderRadius: [0, 2, 2, 0]
      },
      barWidth: '80%',
      barGap: '20%',
      barCategoryGap: '30%'
    };
  });


  // Create ECharts option with improved styling
  const option = {
    tooltip: { trigger: 'none', show: false },
    legend: {
      data: periodNames,
      type: 'scroll',
      top: 0,
      left: 'center',
      icon: 'roundRect',
      itemWidth: 14,
      itemHeight: 8,
      textStyle: {
        fontSize: typography.legendFontSize,
        fontWeight: 'bold',
        color: '#666'
      },
      pageIconColor: '#888',
      pageTextStyle: {
        color: '#888'
      }
    },
    grid: {
      left: '5%',
      right: '5%',
      bottom: '3%', 
      top: '40px',
      containLabel: true
    },
    xAxis: {
      show: true,
      type: 'value',
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        show: false
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: '#eee',
          type: 'dashed'
        }
      },
      axisPointer: {
        show: false // Disable axis pointer
      }
    },
    yAxis: {
      type: 'category',
      data: ledgerLabels,
      axisLabel: {
        fontWeight: 'bold',
        fontSize: typography.axisLabelFontSize,
        color: '#444',
        padding: [0, 20, 0, 0], // Add padding to right side
        formatter: value => {
          // If text is too long, truncate and add ellipsis
          if (value.length > 25) {
            return value.substring(0, 22) + '...';
          }
          return value;
        },
        rich: {
          // Rich text styling for multi-line labels
          a: {
            fontWeight: 'bold',
            fontSize: typography.axisLabelFontSize,
            color: '#444',
            lineHeight: 20
          }
        }
      },
      axisLine: {
        lineStyle: {
          color: '#ddd'
        }
      },
      axisTick: {
        show: false
      },
      splitLine: {
        show: false
      }
    },
    series: series.map(s => ({
      ...s,
      emphasis: {
        ...s.emphasis,
        label: {
          ...(s.emphasis?.label || {}),
          fontSize: typography.emphasisLabelFontSize,
          fontWeight: 'bold'
        }
      }
    }))
  };

  // Helper function to create period key for matching base period
  const createPeriodKey = (period) => {
    if (period.isCustomRange) {
      return `${period.year}-${period.month}-${period.type}`;
    } else {
      return `${period.year}-${period.month || 'Year'}-${period.type}`;
    }
  };

  // Find base period for variance calculation
  const basePeriodObj = basePeriod ? periodsToUse.find(p => createPeriodKey(p) === basePeriod) : null;
  const basePeriodName = basePeriodObj 
    ? `${basePeriodObj.year} ${basePeriodObj.isCustomRange ? basePeriodObj.displayName : (basePeriodObj.month || '')} ${basePeriodObj.type}`
    : null;
  const baseIndex = basePeriodObj ? periodsToUse.findIndex(p => createPeriodKey(p) === createPeriodKey(basePeriodObj)) : -1;
  const baseTotals = basePeriodName ? periodTotals[basePeriodName] : null;
  const baseAmount = baseTotals ? baseTotals.amount : 0;

  // Format a summary for each period's total
  const renderTotals = () => {
    return (
      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        justifyContent: 'space-around', 
        marginTop: 20,
        gap: '5px'
      }}>
        {periodsToUse.map((period, index) => {
          const periodName = `${period.year} ${period.isCustomRange ? period.displayName : (period.month || '')} ${period.type}`;
          const totals = periodTotals[periodName] || { amount: 0, percentOfSales: 0, perKg: 0 };
          // Format values with proper decimal places
          const formattedMillions = (totals.amount / 1000000).toFixed(2);
          const formattedPercent = totals.percentOfSales.toFixed(1);
          const formattedPerKg = totals.perKg.toFixed(1);
          // Use centralized color palette utility for consistent colors
          const palette = getColumnColorPalette(period);
          const color = palette.primary;
          const textColor = palette.text;
          return (
            <React.Fragment key={periodName}>
              <div style={{
                padding: '12px 10px',
                borderRadius: '6px',
                backgroundColor: color,
                border: `1px solid ${color}`,
                boxShadow: '0 2px 6px rgba(0,0,0,0.07)',
                minWidth: '150px',
                maxWidth: '180px',
                flex: '1',
                textAlign: 'center',
                position: 'relative',
                overflow: 'hidden',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                transition: 'transform 0.3s ease, box-shadow 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-5px) scale(1.05)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.07)';
              }}>
                <div style={{ fontSize: typography.totalsPeriodNameFontSize, color: textColor, fontWeight: 500, marginTop: 8 }}>{periodName}</div>
                  <div style={{ fontWeight: 'bold', fontSize: typography.totalsAmountFontSize, color: textColor, marginTop: 8 }}>
                  <CurrencySymbol /> {formattedMillions}M
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  width: '100%',
                  padding: '0 8px',
                    fontSize: typography.totalsMetaFontSize,
                  fontWeight: 'bold',
                  color: textColor,
                  marginTop: 8
                }}>
                  <div>{formattedPercent}%/Sls</div>
                  <div><CurrencySymbol /> {formattedPerKg}/kg</div>
                </div>
              </div>
              {/* Variance badge between cards - sequential period comparison */}
              {index < periodsToUse.length - 1 && (() => {
                // Calculate variance for the NEXT period vs current period
                const nextPeriod = periodsToUse[index + 1];
                const nextPeriodName = `${nextPeriod.year} ${nextPeriod.isCustomRange ? nextPeriod.displayName : (nextPeriod.month || '')} ${nextPeriod.type}`;
                const nextTotals = periodTotals[nextPeriodName] || { amount: 0 };
                
                let variance = null;
                if (totals.amount !== 0) {
                  variance = ((nextTotals.amount - totals.amount) / Math.abs(totals.amount)) * 100;
                }
                
                let badgeColor = '#888', arrow = '–';
                if (variance !== null && !isNaN(variance)) {
                  if (variance > 0) { badgeColor = '#2E865F'; arrow = '▲'; }
                  else if (variance < 0) { badgeColor = '#cf1322'; arrow = '▼'; }
                }
                return (
                  <div style={{
                    alignSelf: 'center',
                    margin: '0 2px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    minWidth: 40,
                    width: 40,
                    height: 60,
                    justifyContent: 'center',
                  }}>
                    {variance === null || isNaN(variance) ? (
                      <span style={{ color: '#888', fontSize: typography.varianceFontSize, fontWeight: 'bold', textAlign: 'center' }}>0%</span>
                    ) : (
                      <>
                        <span className="variance-arrow" style={{ color: badgeColor }}>{arrow}</span>
                        <span className="variance-text" style={{ color: badgeColor }}>{Math.abs(variance).toFixed(1)}</span>
                        <span className="variance-percent" style={{ color: badgeColor }}>%</span>
                      </>
                    )}
                  </div>
                );
              })()}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div ref={containerRef} style={{ width: '100%', minWidth: 0, ...style }}>
      {!hideHeader && <h2 className="modern-gauge-heading">Manufacturing Cost</h2>}
      <ReactECharts
        option={option}
        style={{ width: '100%', minWidth: 0, height: typography.chartHeightPx }}
        notMerge={true}
        lazyUpdate={true}
        theme={undefined}
      />
      {renderTotals()}
    </div>
  );
};

export default ManufacturingCostChart;