import React from 'react';
import BaseChart from './BaseChart';
import { CHART_TYPES, CHART_COLORS } from '../utils/chartConfigs';
import { formatChartData } from '../utils/chartCalculations';

const StackedBarChart = ({ data, options = {} }) => {
  const formattedData = formatChartData(data, 'stackedBar');

  return (
    <BaseChart
      type={CHART_TYPES.BAR}
      data={formattedData}
      options={{
        tooltip: {
          show: false,
          trigger: 'none'
        },
        legend: {
          data: formattedData.series.map(s => s.name)
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: formattedData.categories
        },
        yAxis: {
          type: 'value',
          axisLabel: {
            formatter: '{value}%'
          }
        },
        series: formattedData.series.map(series => ({
          name: series.name,
          type: 'bar',
          stack: 'total',
          emphasis: {
            focus: 'series'
          },
          data: series.data,
          label: {
            show: true,
            formatter: '{c}%'
          }
        })),
        ...options
      }}
    />
  );
};

export default StackedBarChart; 