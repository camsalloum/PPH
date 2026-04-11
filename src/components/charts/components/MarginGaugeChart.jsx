import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import './MarginGaugeChart.css';

// Color scheme definitions (MUST MATCH ColumnConfigGrid.js exactly)
const colorSchemes = [
  { name: 'blue', label: 'Blue', primary: '#288cfa', secondary: '#103766', isDark: true },
  { name: 'green', label: 'Green', primary: '#2E865F', secondary: '#C6F4D6', isDark: true },
  { name: 'yellow', label: 'Yellow', primary: '#FFD700', secondary: '#FFFDE7', isDark: false },
  { name: 'orange', label: 'Orange', primary: '#FF6B35', secondary: '#FFE0B2', isDark: false },
  { name: 'boldContrast', label: 'Bold Contrast', primary: '#003366', secondary: '#FF0000', isDark: true }
];

const MarginGaugeChart = ({ data, periods, basePeriod }) => {
  const gaugeRefs = useRef([]);

  const initGaugeCharts = () => {
    if (!gaugeRefs.current || !data || !periods || periods.length === 0) return;

    // Dispose previous gauge instances
    gaugeRefs.current.forEach(ref => {
      if (ref && ref.chartInstance) {
        ref.chartInstance.dispose();
      }
    });

    // Initialize new gauge charts
    periods.forEach((period, index) => {
      const gaugeContainer = document.getElementById(`margin-gauge-${index}`);
      if (!gaugeContainer) return;

      // FIXED: Use consistent key generation for custom ranges
      let periodKey;
      if (period.isCustomRange) {
        periodKey = `${period.year}-${period.month}-${period.type}`;
      } else {
        periodKey = `${period.year}-${period.month || 'Year'}-${period.type}`;
      }
      
      // Get the values from the data
      const salesValue = data[periodKey]?.sales || 0;
      const materialCost = data[periodKey]?.materialCost || 0;
      
      // Calculate Margin over Material - the formula is Sales - Material
      // NOT (Sales - Material) / Material * 100
      const marginOverMaterial = salesValue - materialCost;
      
      // Calculate it as a percentage of Sales for the gauge
      let marginPercentage = 0;
      if (salesValue > 0) {
        marginPercentage = (marginOverMaterial / salesValue) * 100;
      }


      // Get the same color as used for this period's bar (same logic as other components)
      let gaugeColor;
      if (period.customColor) {
        const scheme = colorSchemes.find(s => s.name === period.customColor);
        if (scheme) {
          gaugeColor = scheme.primary;
        }
      } else {
        // Default color assignment based on month/type (same as tables)
        if (period.month === 'Q1' || period.month === 'Q2' || period.month === 'Q3' || period.month === 'Q4') {
          gaugeColor = '#FF6B35'; // Orange (light red)
        } else if (period.month === 'January') {
          gaugeColor = '#FFD700'; // Yellow
        } else if (period.month === 'Year') {
          gaugeColor = '#288cfa'; // Blue
        } else if (period.type === 'Budget') {
          gaugeColor = '#2E865F'; // Green
      } else if (index === 0) {
          gaugeColor = '#FFD700'; // Default first period - yellow
      } else if (index === 1) {
          gaugeColor = '#288cfa'; // Default second period - blue
      } else if (index === 2) {
          gaugeColor = '#003366'; // Default third period - dark blue
      } else {
          gaugeColor = '#91cc75'; // Default fallback
        }
      }

      // Get the percentage text element above the gauge
      const percentText = document.getElementById(`gauge-percent-${index}`);
      if (percentText) {
        percentText.innerText = marginPercentage.toFixed(2) + '%';
        percentText.style.color = gaugeColor;
      }

      const gaugeChart = echarts.init(gaugeContainer);
      gaugeRefs.current[index] = { chartInstance: gaugeChart };

      const option = {
        series: [{
          type: 'gauge',
          startAngle: 180,
          endAngle: 0,
          min: 0,
          max: 100,
          splitNumber: 5,
          radius: '100%',
          itemStyle: {
            color: gaugeColor
          },
          progress: {
            show: true,
            roundCap: true,
            width: 18,
            itemStyle: {
              color: gaugeColor
            }
          },
          pointer: {
            icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
            length: '12%',
            width: 20,
            offsetCenter: [0, '-60%'],
            itemStyle: {
              color: gaugeColor
            }
          },
          axisLine: {
            roundCap: true,
            lineStyle: {
              width: 18,
              color: [[1, '#E6EBF8']]
            }
          },
          axisTick: {
            distance: -45,
            splitNumber: 5,
            lineStyle: {
              width: 2,
              color: '#999'
            }
          },
          splitLine: {
            distance: -52,
            length: 14,
            lineStyle: {
              width: 3,
              color: '#999'
            }
          },
          axisLabel: {
            show: false // Hide all axis labels
          },
          anchor: {
            show: true,
            showAbove: true,
            size: 25,
            itemStyle: {
              borderWidth: 10
            }
          },
          title: {
            show: false
          },
          detail: {
            show: false, // Hide detail text completely
            formatter: '' // Empty formatter just to be sure
          },
          data: [{
            value: Math.min(Math.max(marginPercentage, 0), 100),
            name: ''
          }]
        }]
      };

      gaugeChart.setOption(option);
      
      // Update the percentage display after the gauge has been initialized
      if (percentText) {
        percentText.innerText = marginPercentage.toFixed(2) + '%';
        percentText.style.color = gaugeColor;
      }
      
      // Set the absolute value display
      const valueText = document.getElementById(`gauge-value-${index}`);
      if (valueText) {
        valueText.innerText = (marginOverMaterial / 1000000).toFixed(1) + 'M';
      }
    });
  };

  // Debounce function to limit frequency of function calls
  const debounce = (func, delay) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => func(...args), delay);
    };
  };

  useEffect(() => {
    // Initialize gauge charts with a slightly longer delay to ensure DOM is ready
    const timer = setTimeout(initGaugeCharts, 500);

    // Add window resize listener with debounce
    const handleResize = debounce(() => {
      gaugeRefs.current.forEach(ref => {
        if (ref && ref.chartInstance) {
          ref.chartInstance.resize();
        }
      });
    }, 100);
    
    window.addEventListener('resize', handleResize);

    // Add a mutation observer to detect size changes in parent elements
    const observer = new ResizeObserver(debounce(() => {
      handleResize();
    }, 100));
    
    const container = document.querySelector('.margin-gauge-container');
    if (container) {
      observer.observe(container);
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      gaugeRefs.current.forEach(ref => {
        if (ref && ref.chartInstance) {
          ref.chartInstance.dispose();
        }
      });
    };
  }, [data, periods, basePeriod]);

  return (    
    <div className="margin-gauge-panel" style={{      
      width: '98%',      
      maxWidth: '1200px',
      margin: '30px auto 0',
      backgroundColor: '#fff',      
      borderRadius: '8px',      
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',      
      padding: '20px',
    }}>      
      <h2 style={{        
        textAlign: 'center',        
        fontSize: '22px',        
        fontWeight: 'bold',        
        marginBottom: '40px', // Increased space between title and gauges     
        color: '#333'      
      }}>        
        Margin over Material      
      </h2>      
      <div className="margin-gauge-container" style={{        
        display: 'grid',
        gridTemplateColumns: `repeat(${periods.length}, 1fr)`,
        justifyItems: 'center',
        gap: '10px'
      }}>        
        {periods.map((period, index) => (          
          <div            
            key={`margin-gauge-wrapper-${index}`}            
            style={{              
              display: 'flex',              
              flexDirection: 'column',              
              alignItems: 'center',
              width: '100%',
              maxWidth: '180px',
              marginTop: '30px', // Add space for percentage display above
              position: 'relative'
            }}          
          >
            {/* Percentage display above the gauge */}
            <div
              id={`gauge-percent-${index}`}
              style={{
                position: 'absolute',
                top: '-25px',
                fontSize: '20px',
                fontWeight: 'bold',
                textAlign: 'center',
                zIndex: 2
              }}
            >
              0.00%
            </div>
            
            {/* Gauge chart */}
            <div              
              id={`margin-gauge-${index}`}              
              style={{                
                width: '130px',                
                height: '130px',
                position: 'relative',
              }}            
            />
            
            {/* Absolute value below */}
            <div
              id={`gauge-value-${index}`}
              style={{
                marginTop: '5px',
                fontSize: '18px',
                fontWeight: 'bold',
                color: '#666',
                textAlign: 'center'
              }}
            >
              0.0M
            </div>
            
            {/* Period label */}
            <div style={{              
              fontWeight: 'bold',              
              fontSize: '14px',
              marginTop: '5px',              
              textAlign: 'center'            
            }}>              
              {period.isCustomRange ? `${period.year} ${period.displayName} ${period.type}` : (period.month ? `${period.year} ${period.month}` : `${period.year}`)} {period.type}            
            </div>          
          </div>        
        ))}      
      </div>    
    </div>  
  );
};

export default MarginGaugeChart; 