import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import CurrencySymbol from '../../dashboard/CurrencySymbol';
import { useCurrency } from '../../../contexts/CurrencyContext';
import { getColumnColorPalette } from '../../dashboard/utils/colorUtils';
import './BarChart.css';
import './SalesVolumeChart.css';

// Note: BarChart uses SVG CurrencySymbol component, no font loading needed

// Helper function to get UAE symbol as data URL for ECharts rich text
const getUAESymbolImageDataURL = (color = '#222') => {
  const svg = `<svg viewBox="0 0 344.84 299.91" xmlns="http://www.w3.org/2000/svg" fill="${color}"><path d="M342.14,140.96l2.7,2.54v-7.72c0-17-11.92-30.84-26.56-30.84h-23.41C278.49,36.7,222.69,0,139.68,0c-52.86,0-59.65,0-109.71,0,0,0,15.03,12.63,15.03,52.4v52.58h-27.68c-5.38,0-10.43-2.08-14.61-6.01l-2.7-2.54v7.72c0,17.01,11.92,30.84,26.56,30.84h18.44s0,29.99,0,29.99h-27.68c-5.38,0-10.43-2.07-14.61-6.01l-2.7-2.54v7.71c0,17,11.92,30.82,26.56,30.82h18.44s0,54.89,0,54.89c0,38.65-15.03,50.06-15.03,50.06h109.71c85.62,0,139.64-36.96,155.38-104.98h32.46c5.38,0,10.43,2.07,14.61,6l2.7,2.54v-7.71c0-17-11.92-30.83-26.56-30.83h-18.9c.32-4.88.49-9.87.49-15s-.18-10.11-.51-14.99h28.17c5.37,0,10.43,2.07,14.61,6.01ZM89.96,15.01h45.86c61.7,0,97.44,27.33,108.1,89.94l-153.96.02V15.01ZM136.21,284.93h-46.26v-89.98l153.87-.02c-9.97,56.66-42.07,88.38-107.61,90ZM247.34,149.96c0,5.13-.11,10.13-.34,14.99l-157.04.02v-29.99l157.05-.02c.22,4.84.33,9.83.33,15Z"/></svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
};

const salesVolumeColor = '#8e44ad'; // purple

// Debounce function to limit frequency of function calls
const debounce = (func, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  };
};

// Global reference for chart export
window.mainBarChartInstance = null;

const BarChart = ({ data, periods, basePeriod, hideHeader = false, hideSalesPerKg = false }) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const finishedHandlerRef = useRef(null);
  const [barPositions, setBarPositions] = useState([]);
  const { companyCurrency, isUAEDirham } = useCurrency();
  
  // Dynamic currency symbol for ECharts - use SVG for AED, text for others
  const getCurrencyForChart = (color = '#222') => {
    if (isUAEDirham()) {
      return {
        useImage: true,
        image: getUAESymbolImageDataURL(color)
      };
    }
    return {
      useImage: false,
      symbol: companyCurrency.symbol
    };
  };

  // Helper function to create period key that matches ChartContainer logic
  const createPeriodKey = (period) => {
    if (period.isCustomRange) {
      // For custom ranges, use the month field (which contains the CUSTOM_* ID)
      return `${period.year}-${period.month}-${period.type}`;
    } else {
      // For regular periods, use the standard format
      return `${period.year}-${period.month || 'Year'}-${period.type}`;
    }
  };

  const getPeriodLabel = (period) => {
    if (period.isCustomRange) {
      // For custom ranges, use displayName for clean display
      return `${period.year}-${period.displayName}-${period.type}`;
    } else if (period.month) {
      return `${period.year}-${period.month}-${period.type}`;
    }
    return `${period.year}-${period.type}`;
  };


  // Debug logging
  if (process.env.NODE_ENV === 'development') {
  }

  // Find base period index and value
  const baseIndex = periods.findIndex(
    p => createPeriodKey(p) === basePeriod
  );
  const baseKey = basePeriod;
  const baseValue = data[baseKey]?.sales || 0;

  // Function to initialize chart
  const initChart = () => {
    if (!chartRef.current || !data || !periods || periods.length === 0) return;

    // Dispose previous instance if it exists
    if (chartInstance.current) {
      chartInstance.current.dispose();
    }

    try {
      if (process.env.NODE_ENV === 'development') {
      }
      
      const myChart = echarts.init(chartRef.current);
      chartInstance.current = myChart;

      const containerWidth = chartRef.current ? (chartRef.current.clientWidth || 0) : 0;
      // On very narrow screens, leave room for the left overlay labels so values/bars don't collide.
      const isNarrowMobile = containerWidth > 0 && containerWidth <= 430;
      
      // Store globally for export access
      window.mainBarChartInstance = myChart;

        if (process.env.NODE_ENV === 'development') {
        }
        
        const periodLabels = periods.map(getPeriodLabel);
        
        const seriesData = periods.map(period => {
          // Use the same key format as in ChartContainer
          const periodKey = createPeriodKey(period);
          const value = data[periodKey]?.sales || 0;
          if (process.env.NODE_ENV === 'development') {
          }
          return value;
        });

      // Sales Volume (row 7)
      const salesVolumeData = periods.map(period => {
        const periodKey = createPeriodKey(period);
        return data[periodKey]?.salesVolume || 0;
      });
        if (process.env.NODE_ENV === 'development') {
        }

      // Calculate % variance with smart Vs Bgt/Vs Est logic
      // When comparing Actual to Budget/Estimate, always use Budget/Estimate as denominator
      const percentVariance = seriesData.map((value, idx) => {
        if (idx === 0) return null; // First period has no previous period to compare
        const prevValue = seriesData[idx - 1];
        
        const currentType = (periods[idx]?.type || '').toLowerCase();
        const prevType = (periods[idx - 1]?.type || '').toLowerCase();
        
        // Determine actual vs reference values
        let actualValue, referenceValue;
        const isCurrentActual = currentType === 'actual';
        const isPrevActual = prevType === 'actual';
        const isCurrentReference = ['budget', 'estimate', 'forecast'].includes(currentType);
        const isPrevReference = ['budget', 'estimate', 'forecast'].includes(prevType);
        
        if (isCurrentActual && isPrevReference) {
          // Current is Actual, Previous is Budget/Estimate - use Vs Bgt formula
          actualValue = value;
          referenceValue = prevValue;
        } else if (isPrevActual && isCurrentReference) {
          // Previous is Actual, Current is Budget/Estimate - use Vs Bgt formula (swapped)
          actualValue = prevValue;
          referenceValue = value;
        } else {
          // YoY or other: standard sequential formula
          actualValue = value;
          referenceValue = prevValue;
        }
        
        if (referenceValue === 0) return null;
        const pct = ((actualValue - referenceValue) / Math.abs(referenceValue)) * 100;
        return pct;
      });

      // Get bar color gradients for each column using the centralized color utility
      const barColors = periods.map((period) => {
        const palette = getColumnColorPalette(period);
        return {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [{
            offset: 0, color: palette.gradientFrom
          }, {
            offset: 1, color: palette.gradientTo
          }]
        };
      });

      // Set option
      myChart.setOption({
        legend: {
          show: false // Disabled since we're not using legend anymore
        },
        grid: {
          left: isNarrowMobile ? 92 : '0%',
          right: isNarrowMobile ? 10 : '0%',
          bottom: 140,
          top: 25,
          containLabel: true
        },
    xAxis: {
      type: 'category',
            data: periodLabels,
          position: 'bottom',
            axisLabel: {
              rotate: 0,
            fontWeight: 'bold',
            fontSize: 18,
            color: '#000',
              formatter: function(value) {
                const parts = value.split('-');
                if (parts.length >= 3) {
                  const year = parts[0];
                  // Check if this is a custom range (contains more than 3 parts due to hyphen in displayName)
                  if (parts.length > 3) {
                    // For custom ranges like "2025-Jan-Apr-Actual"
                    // Reconstruct the displayName and type
                    const displayName = parts.slice(1, -1).join('-'); // "Jan-Apr"
                    const type = parts[parts.length - 1]; // "Actual"
                    return `${year}\n${displayName}\n${type}`;
                  } else {
                    // Regular periods like "2025-Q1-Actual"
                    const month = parts[1];
                    const type = parts[2];
                    if (month === 'Year') {
                      return `${year}\n\n${type}`;
                    } else {
                      return `${year}\n${month}\n${type}`;
                    }
                  }
                }
                return value;
              },
              margin: 30,
            },
            axisLine: {
              lineStyle: {
                color: '#000',
                width: 2
              }
            },
            axisTick: {
              alignWithLabel: true,
              length: 4,
              lineStyle: {
                color: '#ccc'
                }
              }
    },
        yAxis: [
          {
      type: 'value',
            show: false,
            scale: true,
            max: function(value) {
              return value.max * 1.15;
              }
      }
        ],
    series: [
      {
            name: '',
              data: seriesData,
        type: 'bar',
        barMaxWidth: '80%',
        barWidth: '80%',
        barCategoryGap: '0%',
        itemStyle: {
                color: function(params) {
                return barColors[params.dataIndex];
        }
      },
              label: {
                show: true,
                position: 'top',
              fontWeight: 'bold',
              fontSize: 18,
              color: '#222',
                formatter: function(params) {
                  const value = params.value;
                  const currencyInfo = getCurrencyForChart('#222');
                  const currencyPrefix = currencyInfo.useImage ? '{currency|}' : currencyInfo.symbol;
                  if (value >= 1000000) {
                    const millions = (value / 1000000).toFixed(1);
                    return currencyPrefix + ' {num|' + millions + 'M}';
                  } else if (value >= 1000) {
                    const thousands = (value / 1000).toFixed(1);
                    return currencyPrefix + ' {num|' + thousands + 'K}';
                  }
                  return currencyPrefix + ' {num|' + value + '}';
                },
                rich: {
                  currency: isUAEDirham() ? {
                    width: 16,
                    height: 16,
                    lineHeight: 18,
                    padding: [-2, 4, 0, 0],
                    align: 'center',
                    verticalAlign: 'top',
                    backgroundColor: {
                      image: getUAESymbolImageDataURL('#222')
                    }
                  } : {
                    fontSize: 18,
                    fontWeight: 'bold',
                    color: '#222',
                    verticalAlign: 'middle',
                    lineHeight: 18
                  },
                  num: {
                    fontSize: 18,
                    fontWeight: 'bold',
                    color: '#222',
                    verticalAlign: 'middle',
                    lineHeight: 18
                  }
                }
            },
            emphasis: {
              focus: 'series'
            },
            z: 2
          },
      // Custom % variance above each bar
      {
        name: 'Percent Difference',
        type: 'custom',
        renderItem: function(params, api) {
          const idx = api.value(0);
          const value = api.value(1);
          const pct = percentVariance[idx];
          if (pct === null || pct === undefined) return null;
          let color = '#888';
          if (pct > 0) color = '#2E865F';
          else if (pct < 0) color = '#dc3545';
          const x = api.coord([idx, value])[0];
          const y = api.coord([idx, value])[1];
          return {
            type: 'text',
            style: {
              text: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`,
              fill: color,
              font: 'bold 16px sans-serif',
              textAlign: 'center',
              textVerticalAlign: 'bottom',
            },
            position: [x, y - 36],
          };
        },
        data: periods.map((_, idx) => [idx, seriesData[idx]]),
        z: 3
      },
        ],
        tooltip: {
          show: false, // Completely disable tooltips to prevent white panel
          trigger: 'none'
        },
        animation: false
      });

      // Keep overlay positions in sync with the final ECharts layout.
      if (finishedHandlerRef.current) {
        myChart.off('finished', finishedHandlerRef.current);
      }
      finishedHandlerRef.current = () => {
        // Wait a frame so DOM/layout settles (esp. on mobile rotation).
        requestAnimationFrame(() => updateBarPositions());
      };
      myChart.on('finished', finishedHandlerRef.current);

      // Force resize immediately and after a delay
      myChart.resize();
      setTimeout(() => {
        if (myChart && !myChart.isDisposed()) {
        myChart.resize();
        }
      }, 300);
      } catch (error) {
        console.error('Error rendering chart:', error);
        }
  };

  // Function to update bar positions using ECharts API
  const updateBarPositions = () => {
    if (!chartInstance.current || !periods || periods.length === 0) return;
    const myChart = chartInstance.current;
    const positions = periods
      .map((period, idx) => {
        const label = getPeriodLabel(period);
        // Get the x pixel position for the center of the category.
        let x = myChart.convertToPixel({ xAxisIndex: 0 }, label);
        // Fallback: some ECharts/category cases behave better with index.
        if (!Number.isFinite(x)) {
          x = myChart.convertToPixel({ xAxisIndex: 0 }, idx);
        }
        return Number.isFinite(x) ? x : null;
      })
      .filter((x) => x !== null);

    if (positions.length === periods.length) {
      setBarPositions(positions);
    }
  };

  // Update bar positions after chart renders and on resize
  useEffect(() => {
    const handleUpdate = () => updateBarPositions();
    // Wait for chart to render
    const timer = setTimeout(handleUpdate, 400);
    window.addEventListener('resize', handleUpdate);
    window.addEventListener('orientationchange', handleUpdate);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('orientationchange', handleUpdate);
    };
  }, [data, periods, basePeriod]);

  useEffect(() => {
    // Initialize only the main chart
    const timer = setTimeout(() => {
      initChart();
    }, 300);

    // Add window resize listener with debounce
    const handleResize = debounce(() => {
      if (chartInstance.current) {
        chartInstance.current.resize();
        // Update overlay after the resize has applied.
        requestAnimationFrame(() => updateBarPositions());
      }
    }, 100);
    
    window.addEventListener('resize', handleResize);

    // Force additional resize after component fully mounts
    const resizeTimer = setTimeout(() => {
      handleResize();
    }, 800);

    // Add a mutation observer to detect size changes in parent elements with debounce
    const debouncedResize = debounce(() => {
      if (chartInstance.current) {
        chartInstance.current.resize();
        requestAnimationFrame(() => updateBarPositions());
      }
    }, 100);
    
    const observer = new ResizeObserver(debouncedResize);
    
    if (chartRef.current) {
      observer.observe(chartRef.current.parentElement);
    }

    // Cleanup
    return () => {
      clearTimeout(timer);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      if (chartInstance.current) {
        if (finishedHandlerRef.current) {
          chartInstance.current.off('finished', finishedHandlerRef.current);
        }
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, [data, periods, basePeriod]);

  // Generate dynamic variance description
  const getVarianceDescription = () => {
    if (!periods || periods.length <= 1) return '';
    let hasYoY = false;
    let hasActualVsReference = false;
    let hasOtherComparisons = false;

    periods.forEach((period, idx) => {
      if (idx === 0) return;
      const prevPeriod = periods[idx - 1];
      const currentType = (period?.type || '').toLowerCase();
      const prevType = (prevPeriod?.type || '').toLowerCase();

      if (currentType === 'actual' && prevType === 'actual') {
        hasYoY = true;
      } else if (currentType === 'actual' || prevType === 'actual') {
        hasActualVsReference = true;
      } else {
        hasOtherComparisons = true;
      }
    });

    const descriptions = [];
    if (hasActualVsReference) {
      descriptions.push('Δ% = (Actual − Reference) / Reference × 100, where Reference is Budget/Estimate/Forecast');
    }
    if (hasYoY) {
      descriptions.push('YoY Δ% = (Current Actual − Previous Actual) / Previous Actual × 100');
    }
    if (hasOtherComparisons && !hasActualVsReference && !hasYoY) {
      descriptions.push('% variance based on sequential period comparison (current vs previous period)');
    }

    return descriptions.join(' | ');
  };

  return (
    <div className="bar-chart-container sales-volume-chart-container">
      {/* Title, subtitle, and legend in three stacked rows above the chart */}
      {!hideHeader && (
        <div className="sales-volume-chart-header">
          <span className="sales-volume-chart-title">
            Sales and Volume
          </span>
          <span className="sales-volume-chart-subtitle">
            (<CurrencySymbol />)
          </span>
          <span className="sales-volume-chart-note">
            {getVarianceDescription()}
          </span>
        </div>
      )}
      {/* Chart area */}
      <div className="sales-volume-chart-area">
        {periods && periods.length > 0 
          ? <div 
              ref={chartRef} 
              className="bar-chart sales-volume-chart" 
            />
          : (
            <div className="no-data-message sales-volume-no-data">
              <div>
                <p>No periods visible in chart.</p>
                <p>Use the eye icons in Column Configuration to select which periods to display.</p>
              </div>
            </div>
          )
        }
        {/* Absolutely positioned value overlays using barPositions */}
        {barPositions.length === periods.length && (
          <>
            {/* Sales Volume row */}
            <div className="sales-volume-overlay-label purple">
              Sales Volume (MT)
            </div>
            {periods.map((period, idx) => {
              const periodKey = createPeriodKey(period);
              const value = data[periodKey]?.salesVolume || 0;
              const mtValue = Math.round(value / 1000);
              return (
                <div key={`salesvol-${idx}`}
                  className="sales-volume-overlay-value purple"
                  style={{
                    left: `${barPositions[idx]}px` // Dynamic positioning from ECharts
                  }}
                >
                  {mtValue.toLocaleString()} MT
                </div>
              );
            })}
            {/* Sales per Kg row - conditionally hidden */}
            {!hideSalesPerKg && (
              <>
                <div className="sales-volume-overlay-label green">
                  Sales <CurrencySymbol /> per Kg
                </div>
                {periods.map((period, idx) => {
                  const periodKey = createPeriodKey(period);
                  const salesValue = data[periodKey]?.sales || 0;
                  const salesVolumeValue = data[periodKey]?.salesVolume || 0;
                  let salesPerKg = 0;
                  if (salesVolumeValue > 0) {
                    salesPerKg = salesValue / salesVolumeValue;
                  }
                  return (
                    <div key={`salespkg-${idx}`}
                      className="sales-volume-overlay-value green"
                      style={{
                        left: `${barPositions[idx]}px` // Dynamic positioning from ECharts
                      }}
                    >
                      {salesPerKg.toFixed(2)}
                    </div>
                  );
                })}
              </>
            )}
            {/* Production Volume row - REMOVED as requested */}
          </>
        )}
      </div>

    </div>
  );
};

export default BarChart;