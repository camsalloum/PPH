import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import {
  BarChart,
  LineChart,
  GaugeChart
} from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { CHART_OPTIONS } from '../utils/chartConfigs';

// Register the required components
echarts.use([
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
  BarChart,
  LineChart,
  GaugeChart,
  CanvasRenderer
]);

const BaseChart = ({ 
  type, 
  data, 
  options = {}, 
  height = '400px',
  width = '100%'
}) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (chartRef.current) {
      // Initialize chart
      if (!chartInstance.current) {
        chartInstance.current = echarts.init(chartRef.current);
      }

      // Set chart options
      const chartOptions = {
        ...CHART_OPTIONS[type],
        ...options
      };
      
      chartInstance.current.setOption(chartOptions);

      // Handle resize
      const handleResize = () => {
        chartInstance.current?.resize();
      };
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        chartInstance.current?.dispose();
        chartInstance.current = null;
      };
    }
  }, [type, options]);

  // Update chart when data changes
  useEffect(() => {
    if (chartInstance.current && data) {
      chartInstance.current.setOption({
        dataset: {
          source: data
        }
      });
    }
  }, [data]);

  return (
    <div 
      ref={chartRef} 
      style={{ 
        height, 
        width,
        minHeight: '300px'
      }} 
    />
  );
};

export default BaseChart; 