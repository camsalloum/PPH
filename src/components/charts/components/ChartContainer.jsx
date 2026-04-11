import React, { useRef, useEffect, useState } from 'react';
import { useFilter } from '../../../contexts/FilterContext';
import { useExcelData } from '../../../contexts/ExcelDataContext';
import { usePLData } from '../../../contexts/PLDataContext';
import BarChart from './BarChart';
import ModernMarginGauge from './ModernMarginGauge';
import ManufacturingCostChart from './ManufacturingCostChart.tsx';
import BelowGPExpensesChart from './BelowGPExpensesChart.tsx';
import ExpencesChart from './ExpencesChart';
import Profitchart from './Profitchart';
import './ChartContainer.css';
import { computeCellValue as sharedComputeCellValue } from '../../../utils/computeCellValue';



/**
 * Complete replacement for the original ChartContainer.js.
 * --------------------------------------------------------
 * Key changes:
 * 1.  AI Write-up is exported as vector **text** on an **A4 portrait** page using `jspdf.html`,
 *     so the panel chrome is gone and original typography/spacing is preserved.
 * 2.  All chart pages are still exported one-per-page in **A4 landscape** with ultra-narrow
 *     side margins (20 pt) so each chart fills the sheet.
 * 3.  No other functional changes have been made – state, refs, logging, rendering etc. are
 *     identical to the prior version.
 */

const ChartContainer = ({ tableData, selectedPeriods }) => {
  /* --------------------------------------------------
   * CONTEXTS & HOOKS
   * -------------------------------------------------- */
  const { selectedDivision } = useExcelData();
  const { plData } = usePLData();
  const { 
    columnOrder, 
    basePeriodIndex,
    chartVisibleColumns, 
    isColumnVisibleInChart,
    dataGenerated
  } = useFilter();

  /* --------------------------------------------------
   * REFS FOR EXPORT
   * -------------------------------------------------- */
  const barChartRef = useRef(null);
  const modernMarginGaugeRef = useRef(null);
  const manufacturingCostChartRef = useRef(null);
  const belowGPExpensesChartRef = useRef(null);
  const combinedTrendsRef = useRef(null);

  /* --------------------------------------------------
   * HELPER: computeCellValue (delegates to shared util)
   * Uses P&L data from database instead of Excel
   * -------------------------------------------------- */
  const divisionData = plData[selectedDivision] || [];
  const computeCellValue = (rowIndex, column) =>
    sharedComputeCellValue(divisionData, rowIndex, column);

  /* --------------------------------------------------
   * BUILD CHART DATA (unchanged-from-original block)
   * -------------------------------------------------- */
  const periods = columnOrder;
  const basePeriod = periods[basePeriodIndex];
  const visiblePeriods = periods.filter(p => isColumnVisibleInChart(p.id));
  
  // Debug logging for chart visibility


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



  /* --------------------------------------------------
   * RENDER – identical structure to original
   * -------------------------------------------------- */
  return (
    <div className="chart-container-root">
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: 16, background: '#f5f5f5', borderRadius: 12 }}>
      {/* CHARTS */}
      <div ref={barChartRef} className="modern-margin-gauge-panel" style={{ marginTop: 20 }}>
        <BarChart data={chartData} periods={visiblePeriods} basePeriod={basePeriod ? (basePeriod.isCustomRange ? `${basePeriod.year}-${basePeriod.month}-${basePeriod.type}` : `${basePeriod.year}-${basePeriod.month || 'Year'}-${basePeriod.type}`) : ''} />
      </div>

      <div ref={modernMarginGaugeRef} className="modern-margin-gauge-panel" style={{ marginTop: 40 }}>
        <ModernMarginGauge data={chartData} periods={visiblePeriods} basePeriod={basePeriod ? (basePeriod.isCustomRange ? `${basePeriod.year}-${basePeriod.month}-${basePeriod.type}` : `${basePeriod.year}-${basePeriod.month || 'Year'}-${basePeriod.type}`) : ''} style={{ margin: 0, backgroundColor: 'transparent', boxShadow: 'none', padding: 0 }} />
      </div>

      <div ref={manufacturingCostChartRef} className="modern-margin-gauge-panel" style={{ marginTop: 40 }}>
        <ManufacturingCostChart 
          tableData={tableData} 
          selectedPeriods={visiblePeriods} 
          computeCellValue={computeCellValue}
          basePeriod={basePeriod ? (basePeriod.isCustomRange ? `${basePeriod.year}-${basePeriod.month}-${basePeriod.type}` : `${basePeriod.year}-${basePeriod.month || 'Year'}-${basePeriod.type}`) : ''}
          style={{ margin: 0, backgroundColor: 'transparent', boxShadow: 'none', padding: 0 }}
        />
      </div>

      <div ref={belowGPExpensesChartRef} className="modern-margin-gauge-panel" style={{ marginTop: 40 }}>
        <BelowGPExpensesChart 
          tableData={tableData} 
          selectedPeriods={visiblePeriods} 
          computeCellValue={computeCellValue}
          style={{ margin: 0, backgroundColor: 'transparent', boxShadow: 'none', padding: 0 }}
        />
      </div>

      <div ref={combinedTrendsRef} style={{ marginTop: 40 }}>
          <div className="modern-margin-gauge-panel" style={{ padding: 0, margin: 0, backgroundColor: 'white', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', borderRadius: '8px', width: '95%', marginLeft: 'auto', marginRight: 'auto', boxSizing: 'border-box', paddingBottom: '5%' }}>
          <ExpencesChart tableData={tableData} selectedPeriods={visiblePeriods} computeCellValue={computeCellValue} style={{ margin: 0, backgroundColor: 'transparent', boxShadow: 'none', padding: 0 }} />
          <Profitchart tableData={tableData} selectedPeriods={visiblePeriods} computeCellValue={computeCellValue} style={{ margin: 0, backgroundColor: 'transparent', boxShadow: 'none', padding: 0 }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChartContainer;
