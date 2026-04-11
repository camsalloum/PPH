import React from 'react';
import { useFilter } from '../../contexts/FilterContext';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { usePLData } from '../../contexts/PLDataContext';
import { computeCellValue as sharedComputeCellValue } from '../../utils/computeCellValue';
import BelowGPExpensesChart from '../charts/components/BelowGPExpensesChart.tsx';
import './BelowGPExpensesDetail.css';

/**
 * BelowGPExpensesDetail Component
 * -------------------------------
 * Displays the Below GP Expenses chart in the Divisional Dashboard overlay.
 * Uses P&L data from database instead of Excel.
 */
const BelowGPExpensesDetail = () => {
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
      <div className="below-gp-expenses-detail__empty">
        Please select periods in the Period Configuration and click Generate to view data.
      </div>
    );
  }

  if (basePeriodIndex == null || basePeriodIndex >= columnOrder.length) {
    return (
      <div className="below-gp-expenses-detail__empty">
        No base period selected. Please select a base period (★) in the Period Configuration.
      </div>
    );
  }

  // Build chart data (same logic as ChartContainer)
  const periods = columnOrder;
  const visiblePeriods = periods.filter(p => isColumnVisibleInChart(p.id));

  return (
    <div className="below-gp-expenses-detail">
      <div className="below-gp-expenses-detail__chart-wrapper">
        <BelowGPExpensesChart 
          tableData={divisionData}
          selectedPeriods={visiblePeriods.length ? visiblePeriods : periods} 
          computeCellValue={computeCellValue}
          hideHeader={true}
        />
      </div>
      {/* Dynamic variance note - displayed below the chart with good spacing */}
      {(() => {
        const periodsToCheck = visiblePeriods.length ? visiblePeriods : periods;
        if (periodsToCheck.length <= 1) return null;
        let hasYoY = false;
        let hasActualVsReference = false;
        let hasOtherComparisons = false;

        periodsToCheck.forEach((period, idx) => {
          if (idx === 0) return;
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

        return descriptions.length > 0 ? (
          <div className="below-gp-expenses-detail__variance-note">
            {descriptions.join(' | ')}
          </div>
        ) : null;
      })()}
    </div>
  );
};

export default BelowGPExpensesDetail;
