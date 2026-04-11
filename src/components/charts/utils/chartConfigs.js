// Chart configurations and constants

export const CHART_TYPES = {
  BAR: 'bar',
  LINE: 'line',
  GAUGE: 'gauge',
  KPI: 'kpi'
};

export const CHART_COLORS = [
  '#1890ff',
  '#52c41a',
  '#722ed1',
  '#fa8c16',
  '#f5222d',
  '#13c2c2',
  '#eb2f96',
  '#faad14'
];

export const KPI_CONFIGS = {
  revenue: {
    title: 'Revenue',
    format: 'currency',
    color: '#1890ff'
  },
  cost: {
    title: 'Cost',
    format: 'currency',
    color: '#52c41a'
  },
  profit: {
    title: 'Profit',
    format: 'currency',
    color: '#722ed1'
  },
  margin: {
    title: 'Margin',
    format: 'percentage',
    color: '#fa8c16'
  }
};

export const CHART_OPTIONS = {
  bar: {
    // ECharts bar chart options
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    }
  },
  line: {
    // ECharts line chart options
    tooltip: {
      trigger: 'axis'
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    }
  },
  gauge: {
    // ECharts gauge chart options
    series: [{
      type: 'gauge',
      startAngle: 180,
      endAngle: 0,
      min: 0,
      max: 100,
      splitNumber: 10
    }]
  }
}; 