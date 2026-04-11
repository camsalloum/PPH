import React from 'react';
import { useFilter } from '../../contexts/FilterContext';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { usePLData } from '../../contexts/PLDataContext';
import { computeCellValue as sharedComputeCellValue } from '../../utils/computeCellValue';
import { getColumnColorPalette } from './utils/colorUtils';
import BarChart from '../charts/components/BarChart';
import './SalesVolumeDetail.css';

/**
 * SalesVolumeDetail Component
 * ---------------------------
 * Displays the Sales & Volume Analysis chart in the Divisional Dashboard overlay.
 * Uses P&L data from database instead of Excel.
 */
const SalesVolumeDetail = () => {
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
      <div className="sales-volume-detail__empty">
        Please select periods in the Period Configuration and click Generate to view data.
      </div>
    );
  }

  if (basePeriodIndex == null || basePeriodIndex >= columnOrder.length) {
    return (
      <div className="sales-volume-detail__empty">
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

  // Get period colors for legend
  const periodsToShow = visiblePeriods.length ? visiblePeriods : periods;

  return (
    <div className="sales-volume-detail">
      {/* Period Legend */}
      <div className="sales-volume-detail__legend">
        {periodsToShow.map((period, idx) => {
          const palette = getColumnColorPalette(period);
          const periodLabel = `${period.year} ${period.isCustomRange ? period.displayName : (period.month || '')} ${period.type}`.trim();
          return (
            <div 
              key={idx}
              className="sales-volume-detail__legend-item"
              style={{ 
                background: palette.gradient,
                color: palette.text
              }}
            >
              {periodLabel}
            </div>
          );
        })}
      </div>

      <div className="sales-volume-detail__chart-wrapper">
        <BarChart 
          data={chartData} 
          periods={periodsToShow} 
          basePeriod={basePeriodKey}
          hideHeader={true}
          hideSalesPerKg={false}
        />
      </div>
      {/* Dynamic variance note - displayed below the chart with good spacing */}
      {(() => {
        if (periodsToShow.length <= 1) return null;
        let hasYoY = false;
        let hasActualVsReference = false;
        let hasOtherComparisons = false;

        periodsToShow.forEach((period, idx) => {
          if (idx === 0) return;
          const prevPeriod = periodsToShow[idx - 1];
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

        return descriptions.length > 0 ? (
          <div className="sales-volume-detail__variance-note">
            {descriptions.join(' | ')}
          </div>
        ) : null;
      })()}
    </div>
  );
};

export default SalesVolumeDetail;

