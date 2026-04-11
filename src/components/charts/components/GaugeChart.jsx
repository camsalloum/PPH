import React from 'react';
import BaseChart from './BaseChart';
import { CHART_TYPES, CHART_COLORS } from '../utils/chartConfigs';
import { formatChartData } from '../utils/chartCalculations';

const GaugeChart = ({ data, title, options = {} }) => {
  const formattedData = formatChartData(data, CHART_TYPES.GAUGE);

  return (
    <BaseChart
      type={CHART_TYPES.GAUGE}
      data={formattedData}
      options={{
        title: {
          text: title,
          left: 'center'
        },
        series: [{
          type: 'gauge',
          startAngle: 180,
          endAngle: 0,
          min: formattedData.min,
          max: formattedData.max,
          splitNumber: 8,
          axisLine: {
            lineStyle: {
              width: 6,
              color: [
                [0.25, CHART_COLORS.danger],
                [0.5, CHART_COLORS.warning],
                [0.75, CHART_COLORS.success],
                [1, CHART_COLORS.primary]
              ]
            }
          },
          pointer: {
            icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
            length: '12%',
            width: 20,
            offsetCenter: [0, '-60%'],
            itemStyle: {
              color: 'auto'
            }
          },
          axisTick: {
            length: 12,
            lineStyle: {
              color: 'auto',
              width: 2
            }
          },
          splitLine: {
            length: 20,
            lineStyle: {
              color: 'auto',
              width: 5
            }
          },
          axisLabel: {
            color: '#464646',
            fontSize: 12,
            distance: -60,
            formatter: function(value) {
              if (value === formattedData.max) {
                return value + '%';
              }
              return value;
            }
          },
          title: {
            offsetCenter: [0, '-20%'],
            fontSize: 20
          },
          detail: {
            fontSize: 30,
            offsetCenter: [0, '0%'],
            valueAnimation: true,
            formatter: function(value) {
              return value + '%';
            },
            color: 'auto'
          },
          data: [{
            value: formattedData.value,
            name: title
          }]
        }],
        ...options
      }}
    />
  );
};

export default GaugeChart; 