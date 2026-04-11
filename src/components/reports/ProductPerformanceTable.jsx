import React from 'react';

const ProductPerformanceTable = ({ reportData, kgsData, basePeriodIndex }) => {
  if (!reportData || !Array.isArray(kgsData) || basePeriodIndex == null) {
    return <div>No product performance data available.</div>;
  }

  const formatNumber = (num) => {
    return (num || 0).toLocaleString();
  };

  const formatPercentage = (num, showSign = false) => {
    if (num === null || num === undefined || isNaN(num)) return '-';
    const sign = showSign && num > 0 ? '+' : '';
    return `${sign}${Math.round(num)}%`;
  };

  const formatPeriod = (period) => {
    if (!period || typeof period !== 'object') return '';
    const month = period.month || '';
    const year = period.year || '';
    return `${month} ${year}`.trim();
  };

  const getPercentageClass = (value) => {
    if (value > 0) return 'positive';
    if (value < 0) return 'negative';
    return '';
  };

  // Build current period rows from kgsData using basePeriodIndex
  const currentPeriodGroups = kgsData
    .filter(pg => (pg.rawValues?.[basePeriodIndex] || 0) > 0)
    .map(pg => ({
      productGroup: pg.productGroup || pg.name,
      totalKGS: pg.rawValues?.[basePeriodIndex] || 0,
      _raw: pg
    }));

  // Calculate YoY and Budget Achievement for each product group
  const enrichedGroups = currentPeriodGroups.map(currentPg => {
    const raw = currentPg._raw;
    const currentKgs = currentPg.totalKGS || 0;
    const previousKgs = basePeriodIndex > 0 ? (raw.rawValues?.[basePeriodIndex - 1] || 0) : 0;
    const budgetKgs = (raw.rawValues?.[basePeriodIndex + 1] || 0);

    // Calculate YoY Growth
    let yoyGrowth = 0;
    if (previousKgs > 0) {
      yoyGrowth = ((currentKgs - previousKgs) / previousKgs) * 100;
    } else if (currentKgs > 0) {
      yoyGrowth = 100; // New product
    }

    // Calculate Budget Achievement
    let budgetAchievement = 0;
    if (budgetKgs > 0) {
      budgetAchievement = (currentKgs / budgetKgs) * 100;
    }

    return {
      productGroup: currentPg.productGroup,
      totalKGS: currentKgs,
      previousKgs,
      budgetKgs,
      yoyGrowth,
      budgetAchievement
    };
  });

  // Sort by current volume descending
  enrichedGroups.sort((a, b) => (b.totalKGS || 0) - (a.totalKGS || 0));

  return (
    <div className="section">
      <h2>3. Detailed Performance Analysis</h2>
      <div className="table-container">
        <table className="performance-table">
          <thead>
            <tr>
              <th>Product Category</th>
              <th>{formatPeriod(reportData.prevPeriod)} (kg)</th>
              <th>YoY %</th>
              <th>{formatPeriod(reportData.basePeriod)} (kg)</th>
              <th>{formatPeriod(reportData.nextPeriod)} Budget (kg)</th>
              <th>Budget Achieved %</th>
            </tr>
          </thead>
          <tbody>
            {enrichedGroups.map((pg, index) => (
              <tr key={index}>
                <td>{pg.productGroup}</td>
                <td>{formatNumber(pg.previousKgs)}</td>
                <td className={getPercentageClass(pg.yoyGrowth)}>
                  {formatPercentage(pg.yoyGrowth, true)}
                </td>
                <td>{formatNumber(pg.totalKGS)}</td>
                <td>{pg.budgetKgs > 0 ? formatNumber(pg.budgetKgs) : '-'}</td>
                <td className={getPercentageClass(pg.budgetAchievement - 25)}>
                  {pg.budgetKgs > 0 ? formatPercentage(pg.budgetAchievement) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProductPerformanceTable;
