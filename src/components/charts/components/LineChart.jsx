import React from 'react';
import BaseChart from './BaseChart';
import { CHART_COLORS } from '../utils/chartConfigs';

const LineChartComponent = ({ data, periods, basePeriod }) => {
  const options = {
    tooltip: {
      show: false,
      trigger: 'none'
    },
    legend: {
      data: ['Sales', 'Sales Volume', 'Production Volume']
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: periods.map(p => `${p.year}-${p.month}`),
      axisLabel: {
        interval: 0,
        rotate: 45
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: '{value}%'
      }
    },
    series: [
      {
        name: 'Sales',
        type: 'line',
        data: periods.map(p => {
          const periodKey = `${p.year}-${p.month}`;
          return periodKey === basePeriod ? 0 : data[periodKey]?.sales || 0;
        }),
        itemStyle: {
          color: CHART_COLORS[0]
        },
        smooth: true,
        symbol: 'circle',
        symbolSize: 8
      },
      {
        name: 'Sales Volume',
        type: 'line',
        data: periods.map(p => {
          const periodKey = `${p.year}-${p.month}`;
          return periodKey === basePeriod ? 0 : data[periodKey]?.salesVolume || 0;
        }),
        itemStyle: {
          color: CHART_COLORS[1]
        },
        smooth: true,
        symbol: 'circle',
        symbolSize: 8
      },
      {
        name: 'Production Volume',
        type: 'line',
        data: periods.map(p => {
          const periodKey = `${p.year}-${p.month}`;
          return periodKey === basePeriod ? 0 : data[periodKey]?.productionVolume || 0;
        }),
        itemStyle: {
          color: CHART_COLORS[2]
        },
        smooth: true,
        symbol: 'circle',
        symbolSize: 8
      }
    ]
  };

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '10px' }}>
        <strong>Percentage Change vs Base Period ({basePeriod})</strong>
      </div>
      <BaseChart options={options} />
    </div>
  );
};

export default LineChartComponent; 