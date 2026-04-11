import React from 'react';
import { useFilter } from '../../contexts/FilterContext';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { usePLData } from '../../contexts/PLDataContext';
import { computeCellValue as sharedComputeCellValue } from '../../utils/computeCellValue';
import ModernMarginGauge from '../charts/components/ModernMarginGauge';
import './MarginAnalysisDetail.css';

/**
 * MarginAnalysisDetail Component
 * ------------------------------
 * Displays the Margin over Material Analysis chart in the Divisional Dashboard overlay.
 * Uses P&L data from database instead of Excel.
 */
const MarginAnalysisDetail = () => {
  const { selectedDivision } = useExcelData();
  const { plData } = usePLData();
  const { 
    columnOrder, 
    basePeriodIndex,
    isColumnVisibleInChart,
    dataGenerated
  } = useFilter();

  // Helper: computeCellValue (uses P&L data from database)
  const divisionData = plData[selectedDivision] || [];
  const computeCellValue = (rowIndex, column) =>
    sharedComputeCellValue(divisionData, rowIndex, column);

  // Check if data is ready
  if (!dataGenerated || !Array.isArray(columnOrder) || columnOrder.length === 0) {
    return (
      <div className="margin-analysis-detail__empty">
        Please select periods in the Period Configuration and click Generate to view data.
      </div>
    );
  }

  if (basePeriodIndex == null || basePeriodIndex >= columnOrder.length) {
    return (
      <div className="margin-analysis-detail__empty">
        No base period selected. Please select a base period (★) in the Period Configuration.
      </div>
    );
  }

  // Build chart data (same logic as ChartContainer)
  const periods = columnOrder;
  const basePeriod = periods[basePeriodIndex];
  const visiblePeriods = periods.filter(p => isColumnVisibleInChart(p.id));

  const chartData = {};
  const colsToIterate = visiblePeriods.length ? visiblePeriods : periods;

  colsToIterate.forEach(col => {
    let key;
    if (col.isCustomRange) {
      key = `${col.year}-${col.month}-${col.type}`;
    } else {
      key = `${col.year}-${col.month || 'Year'}-${col.type}`;
    }
    
    const sales = computeCellValue(3, col);
    const material = computeCellValue(5, col);
    const salesVol = computeCellValue(7, col);
    const prodVol = computeCellValue(8, col);
    chartData[key] = {
      sales,
      materialCost: material,
      salesVolume: salesVol,
      productionVolume: prodVol,
      marginPerKg: salesVol > 0 ? (sales - material) / salesVol : null
    };
  });

  // Create base period key
  const basePeriodKey = basePeriod 
    ? (basePeriod.isCustomRange 
        ? `${basePeriod.year}-${basePeriod.month}-${basePeriod.type}` 
        : `${basePeriod.year}-${basePeriod.month || 'Year'}-${basePeriod.type}`)
    : '';

  // Generate dynamic variance description based on period comparison types
  const getVarianceDescription = () => {
    const periodsToCheck = visiblePeriods.length ? visiblePeriods : periods;
    if (periodsToCheck.length <= 1) return '';

    let hasYoY = false;
    let hasActualVsReference = false;
    let hasOtherComparisons = false;

    periodsToCheck.forEach((period, idx) => {
      if (idx === 0) return; // Skip first period
      const prevPeriod = periodsToCheck[idx - 1];
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

  const varianceDescription = getVarianceDescription();

  return (
    <div className="margin-analysis-detail">
      <div className="margin-analysis-detail__chart-wrapper">
        <ModernMarginGauge 
          data={chartData} 
          periods={visiblePeriods.length ? visiblePeriods : periods} 
          basePeriod={basePeriodKey}
          hideHeader={true}
          style={{ margin: 0, backgroundColor: 'transparent', boxShadow: 'none', padding: 0 }}
        />
      </div>
      {/* Dynamic variance note - displayed below the chart with good spacing */}
      {varianceDescription && (
        <div className="margin-analysis-detail__variance-note">
          {varianceDescription}
        </div>
      )}
    </div>
  );
};

export default MarginAnalysisDetail;













