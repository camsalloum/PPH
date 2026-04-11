import React, { useRef, useEffect, useState } from 'react';
import * as echarts from 'echarts';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, TrendingUp, Users, MapPin } from 'lucide-react';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useFilter } from '../../contexts/FilterContext';
import '../charts/components/SalesCountryMapChart.css';
import { getColumnColorPalette } from './utils/colorUtils';

const SalesCountryChart = ({ hideHeader = false }) => {
  const { selectedDivision } = useExcelData(); // Get selectedDivision from same context as Dashboard
  const { columnOrder, basePeriodIndex, dataGenerated } = useFilter();
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(0);

  // Set default selected period to base period when data loads
  useEffect(() => {
    if (columnOrder.length > 0 && basePeriodIndex !== null) {
      setSelectedPeriodIndex(basePeriodIndex);
    } else if (columnOrder.length > 0) {
      setSelectedPeriodIndex(0);
    }
  }, [columnOrder, basePeriodIndex]);
  const [panelData, setPanelData] = useState({ localSales: 0, exportSales: 0, regionalData: {} });
  
  // State for database data
  const [countries, setCountries] = useState([]);
  const [countryRegionMap, setCountryRegionMap] = useState({}); // Map country -> {region, marketType}
  const [countryData, setCountryData] = useState({});
  const [error, setError] = useState(null);


  // Get period colors using the EXACT same logic as ColumnConfigGrid
  const getPeriodColor = (column) => {
    const palette = getColumnColorPalette(column);
    return palette.primary;
  };

  // Fetch countries from database
  const fetchCountries = async () => {
    if (!selectedDivision) return;
    
    setError(null); // Clear previous errors
    
    try {
      const response = await fetch(`/api/countries-db?division=${selectedDivision}`);
      const result = await response.json();
      
      if (result.success) {
        // Extract unique country names (deduplicate)
        const countryNames = [...new Set(result.data.map(item => item.country))];
        setCountries(countryNames);
        
        // Build map of country -> {region, marketType} from API response
        const regionMap = {};
        result.data.forEach(item => {
          regionMap[item.country] = {
            region: item.region || 'Unassigned',
            marketType: item.marketType || 'Export'
          };
        });
        setCountryRegionMap(regionMap);
      } else {
        throw new Error(result.message || 'Failed to load countries');
      }
    } catch (err) {
      console.error('❌ Chart: Failed to load countries:', err);
      setError(`Failed to load countries: ${err.message}`);
      setCountries([]);
    }
  };

  // Fetch sales data for a specific period
  const fetchSalesData = async (column) => {
    if (!selectedDivision) return;
    
    // Only fetch data for FP division
    if (selectedDivision !== 'FP') {
      return;
    }
    
    try {
      // Convert column to months array
      let months = [];
      if (column.months && Array.isArray(column.months)) {
        months = column.months;
      } else if (column.month === 'Q1') {
        months = [1, 2, 3];
      } else if (column.month === 'Q2') {
        months = [4, 5, 6];
      } else if (column.month === 'Q3') {
        months = [7, 8, 9];
      } else if (column.month === 'Q4') {
        months = [10, 11, 12];
      } else if (column.month === 'Year') {
        months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      } else if (column.month === 'HY1') {
        months = [1, 2, 3, 4, 5, 6];
      } else if (column.month === 'HY2') {
        months = [7, 8, 9, 10, 11, 12];
      } else {
        // Convert month name to number
        const monthMap = {
          'January': 1, 'February': 2, 'March': 3, 'April': 4,
          'May': 5, 'June': 6, 'July': 7, 'August': 8,
          'September': 9, 'October': 10, 'November': 11, 'December': 12
        };
        months = [monthMap[column.month] || 1];
      }

      const response = await fetch('/api/sales-by-country-db', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          division: selectedDivision,
          year: column.year,
          months: months,
          dataType: column.type || 'Actual'
        })
      });

      const result = await response.json();
      
      if (result.success) {
        // Use stable key per period selection (id from standard configs)
        const columnKey = column.id || `${column.year}-${column.month}-${column.type}`;
        setCountryData(prev => ({
          ...prev,
          [columnKey]: result.data
        }));
        setError(null); // Clear error on successful fetch
      } else {
        throw new Error(result.message || 'Failed to load sales data');
      }
    } catch (err) {
      console.error('❌ Chart: Failed to load sales data:', err);
      setError(`Failed to load sales data: ${err.message}`);
    }
  };

  // Helper function to get country sales amount for a specific period
  const getCountrySalesAmount = (countryName, column) => {
    if (!selectedDivision) return 0;
    
    const columnKey = column.id || `${column.year}-${column.month}-${column.type}`;
    const columnData = countryData[columnKey] || [];
    
    const countryDataItem = columnData.find(item => 
      item.country.toLowerCase() === countryName.toLowerCase()
    );
    
    return countryDataItem ? countryDataItem.value : 0;
  };

  // Helper function to get total sales for a specific period
  const getTotalSalesForPeriod = (column) => {
    const columnKey = column.id || `${column.year}-${column.month}-${column.type}`;
    const columnData = countryData[columnKey] || [];
    return columnData.reduce((sum, item) => sum + (item.value || 0), 0);
  };

  // Get country percentage for specific period  
  const getCountryPercentage = (countryName, column) => {
    const countrySales = getCountrySalesAmount(countryName, column);
    const totalSales = getTotalSalesForPeriod(column);
    
    if (totalSales === 0) return 0;
    return (countrySales / totalSales) * 100;
  };

  // Load countries when division changes
  useEffect(() => {
    fetchCountries();
  }, [selectedDivision]);

  // Load sales data when columns change
  useEffect(() => {
    if (selectedDivision && columnOrder.length > 0) {
      columnOrder.forEach(column => {
        fetchSalesData(column);
      });
    }
  }, [selectedDivision, columnOrder]);

  // Process data for chart visualization
  useEffect(() => {
    if (!countries || countries.length === 0 || !selectedDivision || !dataGenerated || columnOrder.length === 0) {
      setChartData(null);
      return;
    }

    setLoading(true);

    // Use all columns
    const filteredColumns = columnOrder;

    if (filteredColumns.length === 0) {
      setChartData(null);
      setLoading(false);
      return;
    }

    // Calculate percentage for each country per period
    const countryPercentages = {};
    countries.forEach(countryName => {
      countryPercentages[countryName] = {};
      filteredColumns.forEach(column => {
        const columnKey = column.id || `${column.year}-${column.month}-${column.type}`;
        countryPercentages[countryName][columnKey] = getCountryPercentage(countryName, column);
      });
    });

    // For the base period (or first period), separate countries into main (>=1%) and others (<1%)
    const basePeriodColumn = filteredColumns[basePeriodIndex] || filteredColumns[0];
    const basePeriodKey = basePeriodColumn.id || `${basePeriodColumn.year}-${basePeriodColumn.month}-${basePeriodColumn.type}`;
    
    const mainCountries = [];
    const otherCountries = [];
    
    countries.forEach(countryName => {
      const basePeriodPercentage = countryPercentages[countryName][basePeriodKey] || 0;
      if (basePeriodPercentage >= 1) {
        mainCountries.push(countryName);
      } else if (basePeriodPercentage > 0) {
        otherCountries.push({ name: countryName, percentage: basePeriodPercentage });
      }
    });

    // Sort main countries by base period percentage (descending)
    mainCountries.sort((a, b) => {
      const aPerc = countryPercentages[a][basePeriodKey] || 0;
      const bPerc = countryPercentages[b][basePeriodKey] || 0;
      return bPerc - aPerc;
    });

    // Calculate "Other Countries" totals and breakdowns for each period
    const otherCountriesTotals = {};
    const otherCountriesByPeriod = {}; // Store per-period breakdown for tooltip
    filteredColumns.forEach(column => {
      const columnKey = column.id || `${column.year}-${column.month}-${column.type}`;
      let total = 0;
      const breakdown = [];
      otherCountries.forEach(({ name }) => {
        const pct = countryPercentages[name][columnKey] || 0;
        total += pct;
        if (pct > 0) {
          breakdown.push({ name, percentage: pct });
        }
      });
      otherCountriesTotals[columnKey] = total;
      otherCountriesByPeriod[columnKey] = breakdown.sort((a, b) => b.percentage - a.percentage);
    });

    // Build final categories (main countries + "Other Countries" if any)
    const categories = [...mainCountries];
    if (otherCountries.length > 0) {
      categories.push('Other Countries');
    }

    // Create series data for filtered periods
    const allSeries = filteredColumns.map((column) => {
      const periodName = column.isCustomRange 
        ? `${column.year} ${column.displayName} ${column.type}` 
        : `${column.year} ${column.month} ${column.type}`;
      
      const columnKey = column.id || `${column.year}-${column.month}-${column.type}`;
      
      const data = categories.map(category => {
        if (category === 'Other Countries') {
          return Math.round(otherCountriesTotals[columnKey] * 10) / 10;
        }
        const percentage = countryPercentages[category]?.[columnKey] || 0;
        return Math.round(percentage * 10) / 10;
      });

      return {
        name: periodName,
        type: 'bar',
        data: data,
        column,
        columnKey, // Store for tooltip lookup
        itemStyle: {
          color: getPeriodColor(column)
        },
        label: {
          show: true,
          position: 'top',
          formatter: '{c}%',
          fontSize: 10,
          color: '#333'
        }
      };
    });

    setChartData({
      categories,
      allSeries,
      topCountries: mainCountries,
      otherCountries,
      otherCountriesTotals,
      otherCountriesByPeriod, // Per-period breakdown for tooltip
      totalPeriods: filteredColumns.length,
      filteredColumns
    });
    setLoading(false);
  }, [countries, countryData, selectedDivision, columnOrder, dataGenerated, basePeriodIndex]);

  // Set default selected period to base period when data loads
  useEffect(() => {
    if (chartData && chartData.filteredColumns && basePeriodIndex !== null) {
      // Find the index in filteredColumns that corresponds to the base period
      const basePeriodColumn = columnOrder[basePeriodIndex];
      if (basePeriodColumn) {
        const filteredIndex = chartData.filteredColumns.findIndex(filteredCol => 
          filteredCol.year === basePeriodColumn.year && 
          filteredCol.month === basePeriodColumn.month && 
          filteredCol.type === basePeriodColumn.type
        );
        
        if (filteredIndex !== -1) {
          setSelectedPeriodIndex(filteredIndex);
        } else {
          // If base period is filtered out, default to first available period
          setSelectedPeriodIndex(0);
        }
      }
    } else if (chartData && chartData.filteredColumns && chartData.filteredColumns.length > 0) {
      // If no base period is set, default to first available period
      setSelectedPeriodIndex(0);
    }
  }, [chartData, basePeriodIndex, columnOrder]);

  // Helper function to get region for a country from our loaded map
  const getRegionForCountry = (countryName) => {
    const data = countryRegionMap[countryName];
    return data?.region || 'Unassigned';
  };

  // Helper function to get market type for a country
  const getMarketTypeForCountry = (countryName) => {
    const data = countryRegionMap[countryName];
    return data?.marketType || 'Export';
  };

  // Calculate panel data when period changes
  useEffect(() => {
    if (!chartData || !chartData.filteredColumns || !chartData.topCountries) {
      return;
    }
    
    // Wait for country region map to be loaded
    if (Object.keys(countryRegionMap).length === 0) {
      return;
    }

    const currentPeriod = chartData.filteredColumns[selectedPeriodIndex];
    if (!currentPeriod) return;

    // Calculate Local vs Export Sales for the selected period (main countries)
    let localSales = 0;
    let exportSales = 0;
    
    chartData.topCountries.forEach(country => {
      const percentage = getCountryPercentage(country, currentPeriod);
      const marketType = getMarketTypeForCountry(country);
      
      if (marketType === 'Local') {
        localSales += percentage;
      } else {
        exportSales += percentage;
      }
    });

    // Also include "Other Countries" (they're all Export since they're small markets)
    if (chartData.otherCountries && chartData.otherCountries.length > 0) {
      chartData.otherCountries.forEach(({ name }) => {
        const percentage = getCountryPercentage(name, currentPeriod);
        const marketType = getMarketTypeForCountry(name);
        if (marketType === 'Local') {
          localSales += percentage;
        } else {
          exportSales += percentage;
        }
      });
    }

    // Calculate regional breakdown using the loaded region map (all countries)
    const regionalData = {};

    // Main countries
    chartData.topCountries.forEach(country => {
      const percentage = getCountryPercentage(country, currentPeriod);
      const region = getRegionForCountry(country);
      
      if (!regionalData[region]) {
        regionalData[region] = 0;
      }
      regionalData[region] += percentage;
    });

    // Other countries
    if (chartData.otherCountries && chartData.otherCountries.length > 0) {
      chartData.otherCountries.forEach(({ name }) => {
        const percentage = getCountryPercentage(name, currentPeriod);
        const region = getRegionForCountry(name);
        
        if (!regionalData[region]) {
          regionalData[region] = 0;
        }
        regionalData[region] += percentage;
      });
    }

    setPanelData({
      localSales: Math.round(localSales * 10) / 10,
      exportSales: Math.round(exportSales * 10) / 10,
      regionalData
    });
  }, [chartData, selectedPeriodIndex, countryRegionMap]);

  // Initialize and update chart
  useEffect(() => {
    if (!chartRef.current || !chartData || !chartData.allSeries || chartData.allSeries.length === 0) return;

    // Dispose previous chart instance
    if (chartInstance.current) {
      chartInstance.current.dispose();
      chartInstance.current = null;
    }

    // Initialize new chart
    const chart = echarts.init(chartRef.current);
    chartInstance.current = chart;

    // Get current period data
    const currentSeries = chartData.allSeries[selectedPeriodIndex];
    const currentPeriodName = currentSeries ? currentSeries.name : 'No Data';

    const option = {
      title: {
        text: `Sales by Country - ${currentPeriodName}`,
        left: 'center',
        textStyle: {
          fontSize: 16,
          fontWeight: 'bold',
          color: '#2c3e50'
        },
        padding: [10, 0, 0, 0]
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        },
        backgroundColor: 'rgba(255, 255, 255, 0.98)',
        borderColor: '#ccc',
        borderWidth: 1,
        textStyle: {
          color: '#333'
        },
        formatter: function(params) {
          const param = Array.isArray(params) ? params[0] : params;
          const countryName = param.axisValue;
          
          // Check if this is "Other Countries" - show breakdown for selected period
          if (countryName === 'Other Countries' && chartData.otherCountriesByPeriod) {
            const currentSeries = chartData.allSeries[selectedPeriodIndex];
            const columnKey = currentSeries?.columnKey;
            const breakdown = columnKey ? chartData.otherCountriesByPeriod[columnKey] : [];
            
            if (breakdown && breakdown.length > 0) {
              let html = `<div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">Other Countries (${breakdown.length})</div>`;
              html += `<div style="margin-bottom: 8px;">${param.marker} Total: <strong>${param.value.toFixed(1)}%</strong></div>`;
              html += `<div style="max-height: 200px; overflow-y: auto; font-size: 12px; border-top: 1px solid #eee; padding-top: 8px;">`;
              
              breakdown.forEach(({ name, percentage }) => {
                html += `<div style="display: flex; justify-content: space-between; padding: 2px 0;">
                  <span style="color: #666;">${name}</span>
                  <span style="font-weight: 500; margin-left: 16px;">${percentage.toFixed(2)}%</span>
                </div>`;
              });
              html += '</div>';
              return html;
            }
          }
          
          // Regular country tooltip
          return `<div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">${countryName}</div>
                  <div style="margin: 4px 0;">
                    ${param.marker} ${param.seriesName}: <strong>${param.value.toFixed(1)}%</strong>
                  </div>`;
        }
      },
      legend: {
        show: false  // Hide legend since we're showing one period at a time
      },
      grid: {
        left: '20%',
        right: '15%',
        bottom: '8%',
        top: '60px',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        show: false,  // Hide X-axis completely
        min: 0
      },
      yAxis: {
        type: 'category',
        data: chartData.categories,
        axisLabel: {
          interval: 0,
          fontSize: 11,
          color: '#555',
          fontWeight: '500',
          margin: 10
        },
        axisTick: {
          alignWithLabel: true,
          length: 6
        },
        axisLine: {
          lineStyle: {
            color: '#ccc',
            width: 1
          }
        },
        splitLine: {
          show: false
        }
      },
      series: [{
        ...currentSeries,
        label: {
          show: true,
          position: 'right',
          formatter: '{c}%',
          fontSize: 12,
          color: '#333',
          fontWeight: '600',
          distance: 8
        },
        barMaxWidth: 35,
        barCategoryGap: '20%',
        emphasis: {
          focus: 'series',
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0,0,0,0.3)'
          }
        }
      }],
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100,
          xAxisIndex: 0
        }
      ],
    };

    chart.setOption(option);

    // Handle resize
    const handleResize = () => {
      chart.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, [chartData, selectedPeriodIndex]);

  // Check if we have data to display
  if (!dataGenerated) {
    return (
      <div className="sales-country-map-container">
        <div className="empty-state">
          {!hideHeader && <h3>📊 Sales by Country Chart</h3>}
          <p>Please select columns and click the Generate button to view the sales by country chart.</p>
        </div>
      </div>
    );
  }

  // Show "Coming Soon" for non-FP divisions
  if (selectedDivision !== 'FP') {
    return (
      <div className="sales-country-map-container">
        <div className="empty-state">
          {!hideHeader && <h3>📊 Sales by Country Chart - {selectedDivision}</h3>}
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <h3 style={{ color: '#666', marginBottom: '20px' }}>🚧 Coming Soon</h3>
            <p style={{ color: '#888', fontSize: '16px' }}>
              Sales by Country Chart for {selectedDivision} division is currently under development.
            </p>
            <p style={{ color: '#888', fontSize: '14px', marginTop: '10px' }}>
              The database table <code>{selectedDivision.toLowerCase()}_data_excel</code> has been created and is ready for data.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="sales-country-map-container">
        <div className="empty-state">
          {!hideHeader && <h3 style={{ color: '#d32f2f' }}>❌ Error Loading Data</h3>}
          <p style={{ color: '#666', margin: '20px 0' }}>{error}</p>
          <button 
            onClick={() => {
              setError(null);
              fetchCountries();
              if (columnOrder.length > 0) {
                columnOrder.forEach(column => fetchSalesData(column));
              }
            }}
            style={{
              padding: '10px 20px',
              backgroundColor: '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="sales-country-map-container">
        <div className="empty-state">
          <h3>📊 Loading Chart Data...</h3>
          <p>Processing sales data for visualization...</p>
        </div>
      </div>
    );
  }

  if (!chartData) {
    return (
      <div className="sales-country-map-container">
        <div className="empty-state">
          <h3>📊 No Data Available</h3>
          <p>No sales data found for the selected division. Please check your data source.</p>
        </div>
      </div>
    );
  }

      return (
    <div className="sales-country-map-container" style={{ width: '100%', maxWidth: '100%' }}>
      {/* Chart Options */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          marginBottom: '20px',
          padding: '20px',
          background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
          borderRadius: '12px',
          border: '1px solid #e9ecef',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px'
        }}
      >
        {/* Period Buttons Selector */}
        <AnimatePresence>
          {chartData && chartData.allSeries && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '10px',
                justifyContent: 'center',
                flex: '1'
              }}
            >
              {chartData.allSeries.map((series, index) => {
                const column = series.column; // Get column from series
                const periodName = column.isCustomRange 
                  ? `${column.year} ${column.displayName}` 
                  : `${column.year} ${column.month}`;
                
                // Use the EXACT same color that was calculated for the chart
                const buttonColor = series.itemStyle.color;
                const isSelected = selectedPeriodIndex === index;
                
                return (
                  <motion.button
                    key={index}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedPeriodIndex(index)}
                    style={{
                      padding: '10px 18px',
                      borderRadius: '8px',
                      border: 'none',
                      background: (() => {
                        const palette = getColumnColorPalette(column);
                        return palette.gradient;
                      })(),
                      color: (() => {
                        const palette = getColumnColorPalette(column);
                        return palette.text;
                      })(),
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      boxShadow: isSelected 
                        ? `0 6px 20px ${buttonColor}60, 0 0 0 3px rgba(255,255,255,0.9)` 
                        : `0 3px 10px ${buttonColor}40`,
                      transform: isSelected ? 'translateY(-2px)' : 'none',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    <motion.span
                      style={{ position: 'relative', zIndex: 1 }}
                      animate={isSelected ? { scale: 1.05 } : { scale: 1 }}
                    >
                      {periodName}
                    </motion.span>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: 'rgba(255,255,255,0.1)',
                          borderRadius: '8px'
                        }}
                      />
                    )}
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Main Content Layout */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="chart-layout"
      >
        {/* Chart Container */}
        <div className="chart-main">
          <div 
            ref={chartRef}
            style={{
              width: '100%',
              height: '600px',
              border: 'none',
              borderRadius: '12px',
              backgroundColor: '#fff',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              position: 'relative',
              overflow: 'hidden'
            }}
          />
          {/* Chart Header */}
        </div>

        {/* Right Panels */}
        <div className="chart-panels">
          {/* Local vs Export Sales Panel */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          whileHover={{ 
            y: -4,
            boxShadow: '0 12px 28px rgba(0,0,0,0.12)'
          }}
          style={{
            padding: '20px',
            background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
            borderRadius: '12px',
            border: '1px solid #e9ecef',
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
            minHeight: '160px',
            boxSizing: 'border-box'
          }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <Globe size={18} color="#2E865F" />
              <h5 style={{ 
                margin: '0', 
                color: '#2c3e50', 
                fontSize: '16px', 
                fontWeight: '600'
              }}>
                Local vs Export Sales
              </h5>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                whileHover={{ 
                  x: 4,
                  boxShadow: '0 4px 16px rgba(46, 134, 95, 0.15)'
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px 18px',
                  background: 'linear-gradient(135deg, #e8f5e8 0%, #f0f8f0 100%)',
                  borderRadius: '12px',
                  border: '1px solid #c3e6c3',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MapPin size={16} color="#2E865F" />
                  <span style={{ fontWeight: '600', color: '#2c3e50', fontSize: '14px' }}>Local Sales</span>
                </div>
                <motion.span 
                  key={panelData.localSales}
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  style={{ 
                    fontWeight: '700', 
                    color: '#2E865F', 
                    fontSize: '18px',
                    background: 'rgba(46, 134, 95, 0.1)',
                    padding: '4px 8px',
                    borderRadius: '6px'
                  }}
                >
                  {panelData.localSales}%
                </motion.span>
              </motion.div>
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                whileHover={{ 
                  x: 4,
                  boxShadow: '0 4px 16px rgba(25, 118, 210, 0.15)'
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px 18px',
                  background: 'linear-gradient(135deg, #e3f2fd 0%, #f0f8ff 100%)',
                  borderRadius: '12px',
                  border: '1px solid #bbdefb',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingUp size={16} color="#1976d2" />
                  <span style={{ fontWeight: '600', color: '#2c3e50', fontSize: '14px' }}>Export Sales</span>
                </div>
                <motion.span 
                  key={panelData.exportSales}
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  style={{ 
                    fontWeight: '700', 
                    color: '#1976d2', 
                    fontSize: '18px',
                    background: 'rgba(25, 118, 210, 0.1)',
                    padding: '4px 8px',
                    borderRadius: '6px'
                  }}
                >
                  {panelData.exportSales}%
                </motion.span>
              </motion.div>
            </div>
          </motion.div>

          {/* Regional Breakdown Panel */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            whileHover={{ 
              y: -4,
              boxShadow: '0 12px 28px rgba(0,0,0,0.12)'
            }}
            style={{
              padding: '20px',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              borderRadius: '12px',
              border: '1px solid #e9ecef',
              boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
              minHeight: '200px',
              boxSizing: 'border-box'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <Users size={18} color="#FF6B35" />
              <h5 style={{ 
                margin: '0', 
                color: '#2c3e50', 
                fontSize: '16px', 
                fontWeight: '600'
              }}>
                Sales by Region
              </h5>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {Object.entries(panelData.regionalData)
                .filter(([region, value]) => value > 0)
                .sort(([,a], [,b]) => b - a)
                .map(([region, percentage], index) => {
                  // Regional emojis matching CountryReference regions
                  const regionEmojis = {
                    'UAE': '🇦🇪',
                    'Arabian Peninsula': '🏜️',
                    'Levant': '🏛️',
                    'North Africa': '🏺',
                    'Southern Africa': '🦁',
                    'East Africa': '🌍',
                    'West Africa': '🌅',
                    'Central Africa': '🌳',
                    'Europe': '🏰',
                    'Americas': '🗽',
                    'Asia-Pacific': '🏯',
                    'West Asia': '🕌',
                    'Unassigned': '❓',
                    'Others': '🌐'
                  };
                  
                  return (
                    <motion.div 
                      key={region}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + index * 0.05 }}
                      whileHover={{ 
                        x: 4,
                        boxShadow: '0 4px 12px rgba(255, 107, 53, 0.15)',
                        backgroundColor: 'rgba(255, 107, 53, 0.03)'
                      }}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '14px 16px',
                        background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
                        borderRadius: '10px',
                        border: '1px solid #dee2e6',
                        position: 'relative',
                        overflow: 'hidden',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>{regionEmojis[region] || '🌐'}</span>
                        <span style={{ 
                          fontWeight: '600', 
                          color: '#495057', 
                          fontSize: '13px'
                        }}>
                          {region}
                        </span>
                      </div>
                      <motion.span 
                        key={percentage}
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        style={{ 
                          fontWeight: '700', 
                          color: '#2c3e50', 
                          fontSize: '14px',
                          background: 'rgba(255, 107, 53, 0.1)',
                          padding: '4px 8px',
                          borderRadius: '6px'
                        }}
                      >
                        {Math.round(percentage * 10) / 10}%
                      </motion.span>
                    </motion.div>
                  );
                })}
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default SalesCountryChart;