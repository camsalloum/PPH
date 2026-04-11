// Utility functions for chart calculations

export const calculatePeriodDifferences = (data, basePeriod) => {
  if (!data || !basePeriod) {
    return {};
  }

  // Extract the base period year and type (Year or Q1, Q2, etc.)
  const [baseYear, baseType] = basePeriod.split('-');
  
  // Find the base period data
  let basePeriodData = null;
  let basePeriodIndex = -1;
  
  // Debug data structure
  
  // Loop through the data to find the base period
  for (let c = 1; c < data[0].length; c++) {
    const year = data[0][c];
    const type = data[1][c]; // This is now the period type (Year, Q1, etc.)
    const salesValue = data[3][c];
    const salesVolumeValue = data[7]?.[c];
    const productionVolumeValue = data[8]?.[c];
    
    if (year === baseYear && type === baseType) {
      basePeriodIndex = c;
      basePeriodData = {
        sales: parseFloat(salesValue) || 0,
        salesVolume: parseFloat(salesVolumeValue) || 0,
        productionVolume: parseFloat(productionVolumeValue) || 0
      };
      break;
    }
  }

  if (!basePeriodData) {
    return {};
  }

  // Calculate differences for each period
  const result = {};
  for (let c = 1; c < data[0].length; c++) {
    const year = data[0][c];
    const type = data[1][c];
    const periodKey = `${year}-${type}`;

    if (c === basePeriodIndex) {
      result[periodKey] = {
        sales: 0,
        salesVolume: 0,
        productionVolume: 0
      };
    } else {
      const currentSales = parseFloat(data[3][c]) || 0;
      const currentSalesVolume = parseFloat(data[7]?.[c]) || 0;
      const currentProductionVolume = parseFloat(data[8]?.[c]) || 0;


      result[periodKey] = {
        sales: ((currentSales - basePeriodData.sales) / basePeriodData.sales) * 100,
        salesVolume: ((currentSalesVolume - basePeriodData.salesVolume) / basePeriodData.salesVolume) * 100,
        productionVolume: ((currentProductionVolume - basePeriodData.productionVolume) / basePeriodData.productionVolume) * 100
      };
    }
  }

  return result;
};

export const calculateKPIs = (data, basePeriod) => {
  if (!data || !basePeriod) return {};

  // Format data similar to calculatePeriodDifferences
  const formattedData = {};
  Object.entries(data).forEach(([year, yearData]) => {
    if (typeof yearData === 'object') {
      Object.entries(yearData).forEach(([month, monthData]) => {
        const periodKey = `${year}-${month}`;
        formattedData[periodKey] = {
          revenue: monthData.revenue || 0,
          cost: monthData.cost || 0,
          profit: (monthData.revenue || 0) - (monthData.cost || 0)
        };
      });
    }
  });

  const currentPeriod = formattedData[basePeriod];
  if (!currentPeriod) return {};

  // Get the previous period
  const periods = Object.keys(formattedData).sort();
  const currentIndex = periods.indexOf(basePeriod);
  const previousPeriod = currentIndex > 0 ? formattedData[periods[currentIndex - 1]] : null;

  return {
    revenue: {
      current: currentPeriod.revenue,
      previous: previousPeriod?.revenue || 0
    },
    cost: {
      current: currentPeriod.cost,
      previous: previousPeriod?.cost || 0
    },
    profit: {
      current: currentPeriod.profit,
      previous: previousPeriod?.profit || 0
    },
    margin: {
      current: currentPeriod.revenue ? (currentPeriod.profit / currentPeriod.revenue) * 100 : 0,
      previous: previousPeriod?.revenue ? (previousPeriod.profit / previousPeriod.revenue) * 100 : 0
    }
  };
};

export const formatChartData = (data, type) => {
  switch (type) {
    case 'bar':
      return formatBarChartData(data);
    case 'line':
      return formatLineChartData(data);
    case 'gauge':
      return formatGaugeChartData(data);
    case 'stackedBar':
      return formatStackedBarChartData(data);
    default:
      return data;
  }
};

const formatBarChartData = (data) => {
  if (!data || !data.length) return { categories: [], series: [] };

  const categories = Object.keys(data);
  const series = [
    {
      name: 'Sales',
      type: 'bar',
      data: categories.map(cat => data[cat]?.sales || 0)
    },
    {
      name: 'Sales Volume',
      type: 'bar',
      data: categories.map(cat => data[cat]?.salesVolume || 0)
    },
    {
      name: 'Production Volume',
      type: 'bar',
      data: categories.map(cat => data[cat]?.productionVolume || 0)
    }
  ];

  return {
    categories,
    series
  };
};

const formatLineChartData = (data) => {
  if (!data || !data.length) return { categories: [], series: [] };

  const categories = Object.keys(data);
  const series = [
    {
      name: 'Sales',
      type: 'line',
      data: categories.map(cat => data[cat]?.sales || 0)
    },
    {
      name: 'Sales Volume',
      type: 'line',
      data: categories.map(cat => data[cat]?.salesVolume || 0)
    },
    {
      name: 'Production Volume',
    type: 'line',
      data: categories.map(cat => data[cat]?.productionVolume || 0)
    }
  ];

  return {
    categories,
    series
  };
};

const formatGaugeChartData = (data) => {
  if (!data) return { value: 0, min: 0, max: 100 };

  return {
    value: data.current,
    min: 0,
    max: Math.max(data.current * 1.2, 100)
  };
};

const formatStackedBarChartData = (data) => {
  if (!data || !data.length) return { categories: [], series: [] };

  // Group data by component type
  const componentGroups = data.reduce((acc, item) => {
    if (item.component) {
      if (!acc[item.component]) {
        acc[item.component] = [];
      }
      acc[item.component].push(item);
    }
    return acc;
  }, {});

  const categories = Object.keys(data[0].differences || {});
  const series = Object.entries(componentGroups).map(([component, items]) => ({
    name: component,
    data: categories.map(cat => {
      const total = items.reduce((sum, item) => sum + (item.differences[cat] || 0), 0);
      return total / items.length; // Average for the component
    })
  }));

  return {
    categories,
    series
  };
}; 