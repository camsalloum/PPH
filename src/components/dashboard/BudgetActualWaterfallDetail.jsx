import React, { useMemo } from 'react';
import { useFilter } from '../../contexts/FilterContext';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { usePLData } from '../../contexts/PLDataContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { computeCellValue as sharedComputeCellValue } from '../../utils/computeCellValue';
import EChartsWaterfallChart from '../charts/components/EChartsWaterfallChart';
import CurrencySymbol from './CurrencySymbol';
import UAEDirhamSymbol from './UAEDirhamSymbol';
import './BudgetActualWaterfallDetail.css';

/**
 * BudgetActualWaterfallDetail Component
 * -------------------------------------
 * Displays two waterfall charts using ECharts:
 * 1. Year-over-Year Bridge: Base Period vs Previous Year (same period)
 * 2. Budget vs Actual Bridge: Base Period vs Budget
 * 2. Budget vs Actual Bridge: Base Period vs Budget
 * 
 * Shows variance breakdown for:
 * - Sales Revenue
 * - Material Costs
 * - Manufacturing Costs
 * - Operating Expenses (Below GP)
 * - Net Profit
 */

// P&L Row indices
const ROW_INDICES = {
  SALES: 3,
  MATERIAL: 5,
  LABOUR: 9,
  DEPRECIATION: 10,
  ELECTRICITY: 12,
  OTHER_MFG: 13,
  DIR_COST_STOCK_ADJ: 15,  // Missing component for reconciliation!
  GROSS_PROFIT: 19,
  SELLING_EXPENSES: 31,
  TRANSPORTATION: 32,
  ADMIN: 34,
  TOTAL_BELOW_GP: 52,
  NET_PROFIT: 54
};

const BudgetActualWaterfallDetail = () => {
  const { selectedDivision } = useExcelData();
  const { plData } = usePLData();
  const { formatCurrency, isUAEDirham, companyCurrency } = useCurrency();
  const { 
    columnOrder, 
    basePeriodIndex,
    dataGenerated
  } = useFilter();

  // Helper: computeCellValue (uses P&L data from database)
  const divisionData = useMemo(() => plData[selectedDivision] || [], [plData, selectedDivision]);
  
  const computeCellValue = (rowIndex, column) =>
    sharedComputeCellValue(divisionData, rowIndex, column);

  // Get the base period (starred period)
  const basePeriod = useMemo(() => {
    if (basePeriodIndex == null || basePeriodIndex >= columnOrder.length) return null;
    return columnOrder[basePeriodIndex];
  }, [columnOrder, basePeriodIndex]);

  // Helper to get months array for a period type
  const getMonthsForPeriod = (month) => {
    if (month === 'FY' || month === 'Year') {
      return ['January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December'];
    } else if (month === 'HY1') {
      return ['January', 'February', 'March', 'April', 'May', 'June'];
    } else if (month === 'HY2') {
      return ['July', 'August', 'September', 'October', 'November', 'December'];
    } else if (month === 'Q1') {
      return ['January', 'February', 'March'];
    } else if (month === 'Q2') {
      return ['April', 'May', 'June'];
    } else if (month === 'Q3') {
      return ['July', 'August', 'September'];
    } else if (month === 'Q4') {
      return ['October', 'November', 'December'];
    }
    return [month]; // Single month
  };

  // Find corresponding previous year period (same month/range, year - 1)
  const previousYearPeriod = useMemo(() => {
    if (!basePeriod) return null;
    
    // Look for same month/range, previous year, same type
    const targetYear = basePeriod.year - 1;
    const targetMonth = basePeriod.month;
    const targetType = basePeriod.type;
    
    // First try to find in columnOrder
    let found = columnOrder.find(col => 
      col.year === targetYear && 
      col.month === targetMonth && 
      col.type?.toLowerCase() === targetType?.toLowerCase()
    );
    
    // If not found, create a virtual period for data lookup
    // IMPORTANT: Must include months array for computeCellValue to work
    if (!found) {
      const months = basePeriod.months || getMonthsForPeriod(targetMonth);
      found = {
        year: targetYear,
        month: targetMonth,
        type: targetType,
        months: months,
        id: `${targetYear}-${targetMonth}-${targetType}`,
        displayName: basePeriod.displayName,
        isCustomRange: basePeriod.isCustomRange
      };
    }
    
    return found;
  }, [basePeriod, columnOrder]);

  // Find corresponding budget period (same year/month, type = Budget)
  const budgetPeriod = useMemo(() => {
    if (!basePeriod) return null;
    
    // Look for same year and month/range, type = Budget
    const targetYear = basePeriod.year;
    const targetMonth = basePeriod.month;
    
    // First try to find in columnOrder
    let found = columnOrder.find(col => 
      col.year === targetYear && 
      col.month === targetMonth && 
      col.type?.toLowerCase() === 'budget'
    );
    
    // If not found, create a virtual period for data lookup
    // IMPORTANT: Must include months array for computeCellValue to work
    if (!found) {
      const months = basePeriod.months || getMonthsForPeriod(targetMonth);
      found = {
        year: targetYear,
        month: targetMonth,
        type: 'Budget',
        months: months,
        id: `${targetYear}-${targetMonth}-Budget`,
        displayName: basePeriod.displayName,
        isCustomRange: basePeriod.isCustomRange
      };
    }
    
    return found;
  }, [basePeriod, columnOrder]);

  // Calculate values for all periods
  const periodValues = useMemo(() => {
    if (!basePeriod) return null;

    const getValue = (period, rowIndex) => {
      if (!period) return 0;
      return computeCellValue(rowIndex, period);
    };

    const baseValues = {
      sales: getValue(basePeriod, ROW_INDICES.SALES),
      material: getValue(basePeriod, ROW_INDICES.MATERIAL),
      labour: getValue(basePeriod, ROW_INDICES.LABOUR),
      depreciation: getValue(basePeriod, ROW_INDICES.DEPRECIATION),
      electricity: getValue(basePeriod, ROW_INDICES.ELECTRICITY),
      otherMfg: getValue(basePeriod, ROW_INDICES.OTHER_MFG),
      dirCostStockAdj: getValue(basePeriod, ROW_INDICES.DIR_COST_STOCK_ADJ),
      grossProfit: getValue(basePeriod, ROW_INDICES.GROSS_PROFIT),
      sellingExpenses: getValue(basePeriod, ROW_INDICES.SELLING_EXPENSES),
      transportation: getValue(basePeriod, ROW_INDICES.TRANSPORTATION),
      admin: getValue(basePeriod, ROW_INDICES.ADMIN),
      totalBelowGP: getValue(basePeriod, ROW_INDICES.TOTAL_BELOW_GP),
      netProfit: getValue(basePeriod, ROW_INDICES.NET_PROFIT)
    };

    const prevYearValues = previousYearPeriod ? {
      sales: getValue(previousYearPeriod, ROW_INDICES.SALES),
      material: getValue(previousYearPeriod, ROW_INDICES.MATERIAL),
      labour: getValue(previousYearPeriod, ROW_INDICES.LABOUR),
      depreciation: getValue(previousYearPeriod, ROW_INDICES.DEPRECIATION),
      electricity: getValue(previousYearPeriod, ROW_INDICES.ELECTRICITY),
      otherMfg: getValue(previousYearPeriod, ROW_INDICES.OTHER_MFG),
      dirCostStockAdj: getValue(previousYearPeriod, ROW_INDICES.DIR_COST_STOCK_ADJ),
      grossProfit: getValue(previousYearPeriod, ROW_INDICES.GROSS_PROFIT),
      totalBelowGP: getValue(previousYearPeriod, ROW_INDICES.TOTAL_BELOW_GP),
      netProfit: getValue(previousYearPeriod, ROW_INDICES.NET_PROFIT)
    } : null;

    const budgetValues = budgetPeriod ? {
      sales: getValue(budgetPeriod, ROW_INDICES.SALES),
      material: getValue(budgetPeriod, ROW_INDICES.MATERIAL),
      labour: getValue(budgetPeriod, ROW_INDICES.LABOUR),
      depreciation: getValue(budgetPeriod, ROW_INDICES.DEPRECIATION),
      electricity: getValue(budgetPeriod, ROW_INDICES.ELECTRICITY),
      otherMfg: getValue(budgetPeriod, ROW_INDICES.OTHER_MFG),
      dirCostStockAdj: getValue(budgetPeriod, ROW_INDICES.DIR_COST_STOCK_ADJ),
      grossProfit: getValue(budgetPeriod, ROW_INDICES.GROSS_PROFIT),
      totalBelowGP: getValue(budgetPeriod, ROW_INDICES.TOTAL_BELOW_GP),
      netProfit: getValue(budgetPeriod, ROW_INDICES.NET_PROFIT)
    } : null;

    return { baseValues, prevYearValues, budgetValues };
  }, [basePeriod, previousYearPeriod, budgetPeriod, computeCellValue]);

  // Calculate variances for Year-over-Year
  // IMPORTANT: Variances must mathematically reconcile to (End Net Profit - Start Net Profit)
  // P&L Formula: Net Profit = Sales - Material - Dir Cost of Goods Sold - Total Below GP Expenses
  // Where Dir Cost of Goods Sold = Labour + Depreciation + Electricity + Other Mfg + Dir Cost Stock Adj
  const yoyVariances = useMemo(() => {
    if (!periodValues?.prevYearValues || !periodValues?.baseValues) return [];
    
    const { baseValues, prevYearValues } = periodValues;
    
    // Sales variance: Actual - Prior (positive = higher sales = favorable)
    const salesVariance = baseValues.sales - prevYearValues.sales;
    
    // Material cost variance: Prior - Actual (positive = lower costs = favorable)
    const materialVariance = prevYearValues.material - baseValues.material;
    
    // Manufacturing cost (Dir Cost of Goods Sold = Labour + Depreciation + Electricity + Other Mfg + Dir Cost Stock Adj)
    const baseMfgCost = baseValues.labour + baseValues.depreciation + baseValues.electricity + baseValues.otherMfg + baseValues.dirCostStockAdj;
    const prevMfgCost = prevYearValues.labour + prevYearValues.depreciation + prevYearValues.electricity + prevYearValues.otherMfg + prevYearValues.dirCostStockAdj;
    const mfgCostVariance = prevMfgCost - baseMfgCost; // Positive when costs decreased (favorable)
    
    // Operating expenses (Total Below GP)
    const opexVariance = prevYearValues.totalBelowGP - baseValues.totalBelowGP; // Positive when costs decreased (favorable)

    // Debug: Log to verify reconciliation
    if (process.env.NODE_ENV === 'development') {
      const expectedEnd = prevYearValues.netProfit + salesVariance + materialVariance + mfgCostVariance + opexVariance;
    }

    return [
      { label: 'Sales<br>Revenue', value: salesVariance, isPositiveGood: true },
      { label: 'Material<br>Cost', value: materialVariance, isPositiveGood: true },
      { label: 'Mfg.<br>Cost', value: mfgCostVariance, isPositiveGood: true },
      { label: 'Operating<br>Expenses', value: opexVariance, isPositiveGood: true }
    ];
  }, [periodValues]);

  // Calculate variances for Budget vs Actual
  // IMPORTANT: Variances must mathematically reconcile to (Actual Net Profit - Budget Net Profit)
  const budgetVariances = useMemo(() => {
    if (!periodValues?.budgetValues || !periodValues?.baseValues) return [];
    
    const { baseValues, budgetValues } = periodValues;
    
    // Sales variance: Actual - Budget (positive = beat target = favorable)
    const salesVariance = baseValues.sales - budgetValues.sales;
    
    // Material cost variance: Budget - Actual (positive = spent less = favorable)
    const materialVariance = budgetValues.material - baseValues.material;
    
    // Manufacturing cost (includes Dir Cost Stock Adj)
    const baseMfgCost = baseValues.labour + baseValues.depreciation + baseValues.electricity + baseValues.otherMfg + baseValues.dirCostStockAdj;
    const budgetMfgCost = budgetValues.labour + budgetValues.depreciation + budgetValues.electricity + budgetValues.otherMfg + budgetValues.dirCostStockAdj;
    const mfgCostVariance = budgetMfgCost - baseMfgCost; // Positive when spent less than budget (favorable)
    
    // Operating expenses (Total Below GP)
    const opexVariance = budgetValues.totalBelowGP - baseValues.totalBelowGP; // Positive when spent less (favorable)

    // Debug: Log to verify reconciliation
    if (process.env.NODE_ENV === 'development') {
      const expectedEnd = budgetValues.netProfit + salesVariance + materialVariance + mfgCostVariance + opexVariance;
    }

    return [
      { label: 'Sales<br>Revenue', value: salesVariance, isPositiveGood: true },
      { label: 'Material<br>Cost', value: materialVariance, isPositiveGood: true },
      { label: 'Mfg.<br>Cost', value: mfgCostVariance, isPositiveGood: true },
      { label: 'Operating<br>Expenses', value: opexVariance, isPositiveGood: true }
    ];
  }, [periodValues]);

  // Format period label
  const formatPeriodLabel = (period) => {
    if (!period) return '';
    const monthLabel = period.isCustomRange ? period.displayName : (period.month || 'FY');
    return `${period.year} ${monthLabel} ${period.type}`;
  };

  // Check if data is ready
  if (!dataGenerated || !Array.isArray(columnOrder) || columnOrder.length === 0) {
    return (
      <div className="waterfall-detail__empty">
        Please select periods in the Period Configuration and click Generate to view data.
      </div>
    );
  }

  if (basePeriodIndex == null || basePeriodIndex >= columnOrder.length) {
    return (
      <div className="waterfall-detail__empty">
        No base period selected. Please select a base period (★) in the Period Configuration.
      </div>
    );
  }

  if (!periodValues) {
    return (
      <div className="waterfall-detail__empty">
        Unable to calculate variance data. Please check period configuration.
      </div>
    );
  }

  const { baseValues, prevYearValues, budgetValues } = periodValues;
  
  // Check if we have data for comparisons
  // Use sales as indicator since it's the primary P&L value
  const hasYoYData = prevYearValues && (prevYearValues.sales !== 0 || prevYearValues.netProfit !== 0);
  const hasBudgetData = budgetValues && (budgetValues.sales !== 0 || budgetValues.netProfit !== 0);

  // Debug logging (remove in production)
  if (process.env.NODE_ENV === 'development') {
  }

  return (
    <div className="waterfall-detail">
      {/* Summary Cards */}
      <div className="waterfall-detail__summary">
        <div className="waterfall-detail__summary-card waterfall-detail__summary-card--base">
          <div className="waterfall-detail__summary-icon">📍</div>
          <div className="waterfall-detail__summary-label">Base Period</div>
          <div className="waterfall-detail__summary-value">{formatPeriodLabel(basePeriod)}</div>
          <div className="waterfall-detail__summary-metric">
            Net Profit: <CurrencySymbol size={14} /> <strong>{formatCurrency(baseValues.netProfit, { includeSymbol: false })}</strong>
          </div>
        </div>
        
        {hasYoYData && (
          <div className="waterfall-detail__summary-card waterfall-detail__summary-card--prev">
            <div className="waterfall-detail__summary-icon">📅</div>
            <div className="waterfall-detail__summary-label">Previous Year</div>
            <div className="waterfall-detail__summary-value">{formatPeriodLabel(previousYearPeriod)}</div>
            <div className="waterfall-detail__summary-metric">
              Net Profit: <CurrencySymbol size={14} /> <strong>{formatCurrency(prevYearValues.netProfit, { includeSymbol: false })}</strong>
            </div>
          </div>
        )}
        
        {hasBudgetData && (
          <div className="waterfall-detail__summary-card waterfall-detail__summary-card--budget">
            <div className="waterfall-detail__summary-icon">🎯</div>
            <div className="waterfall-detail__summary-label">Budget Target</div>
            <div className="waterfall-detail__summary-value">{formatPeriodLabel(budgetPeriod)}</div>
            <div className="waterfall-detail__summary-metric">
              Net Profit: <CurrencySymbol size={14} /> <strong>{formatCurrency(budgetValues.netProfit, { includeSymbol: false })}</strong>
            </div>
          </div>
        )}
      </div>

      {/* Waterfall Charts */}
      <div className="waterfall-detail__charts">
        {hasYoYData ? (
          <div className="waterfall-detail__chart-container">
            <EChartsWaterfallChart
              title="Year-over-Year Net Profit Bridge"
              periodInfo={`${previousYearPeriod.year} ${basePeriod.month || 'FY'} → ${basePeriod.year} ${basePeriod.month || 'FY'}`}
              startLabel={`${previousYearPeriod.year}<br>Net Profit`}
              endLabel={`${basePeriod.year}<br>Net Profit`}
              startValue={prevYearValues.netProfit}
              endValue={baseValues.netProfit}
              variances={yoyVariances}
              height={360}
            />
            {/* YoY Recap Summary */}
            <div className="waterfall-detail__recap">
              {(() => {
                const yoyNetChange = baseValues.netProfit - prevYearValues.netProfit;
                const yoyPct = prevYearValues.netProfit !== 0 ? (yoyNetChange / Math.abs(prevYearValues.netProfit) * 100) : 0;
                const isYoYPositive = yoyNetChange >= 0;
                const showUAESymbol = isUAEDirham();
                const formatVal = (val) => (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                    {showUAESymbol ? <UAEDirhamSymbol style={{ width: '0.85em', height: '0.85em' }} /> : companyCurrency.symbol || 'AED'}{' '}
                    {Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                );
                return (
                  <>
                    <span className="waterfall-detail__recap-emoji">{isYoYPositive ? '📈' : '📉'}</span>
                    <span className={`waterfall-detail__recap-text ${isYoYPositive ? 'waterfall-detail__recap-text--positive' : 'waterfall-detail__recap-text--negative'}`}>
                      Net Profit {isYoYPositive ? 'increased' : 'decreased'} by <strong>{formatVal(yoyNetChange)}</strong> ({isYoYPositive ? '+' : ''}{yoyPct.toFixed(1)}%) vs prior year.
                      {yoyVariances[0]?.value < 0 && ' Sales decline was the main driver.'}
                      {yoyVariances[0]?.value >= 0 && yoyVariances[3]?.value > 0 && ' Lower operating expenses helped offset changes.'}
                    </span>
                  </>
                );
              })()}
            </div>
          </div>
        ) : (
          <div className="waterfall-detail__chart-container waterfall-detail__chart-container--empty">
            <div className="waterfall-detail__no-data">
              <span className="waterfall-detail__no-data-icon">📊</span>
              <div className="waterfall-detail__no-data-title">Year-over-Year Comparison</div>
              <div className="waterfall-detail__no-data-text">
                No data available for {basePeriod?.year - 1}.
              </div>
            </div>
          </div>
        )}

        {hasBudgetData ? (
          <div className="waterfall-detail__chart-container">
            <EChartsWaterfallChart
              title="Budget vs Actual Net Profit Bridge"
              periodInfo={`${basePeriod.year} ${basePeriod.month || 'FY'} • ${selectedDivision}`}
              startLabel={`Budget<br>Net Profit`}
              endLabel={`Actual<br>Net Profit`}
              startValue={budgetValues.netProfit}
              endValue={baseValues.netProfit}
              variances={budgetVariances}
              height={360}
            />
            {/* Budget vs Actual Recap Summary */}
            <div className="waterfall-detail__recap">
              {(() => {
                const budgetNetChange = baseValues.netProfit - budgetValues.netProfit;
                const budgetPct = budgetValues.netProfit !== 0 ? (budgetNetChange / Math.abs(budgetValues.netProfit) * 100) : 0;
                const isBudgetPositive = budgetNetChange >= 0;
                const salesMiss = budgetVariances[0]?.value < 0;
                const costSavings = (budgetVariances[1]?.value > 0 || budgetVariances[2]?.value > 0 || budgetVariances[3]?.value > 0);
                const showUAESymbol = isUAEDirham();
                const formatVal = (val) => (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                    {showUAESymbol ? <UAEDirhamSymbol style={{ width: '0.85em', height: '0.85em' }} /> : companyCurrency.symbol || 'AED'}{' '}
                    {Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                );
                return (
                  <>
                    <span className="waterfall-detail__recap-emoji">{isBudgetPositive ? '✅' : '⚠️'}</span>
                    <span className={`waterfall-detail__recap-text ${isBudgetPositive ? 'waterfall-detail__recap-text--positive' : 'waterfall-detail__recap-text--negative'}`}>
                      {isBudgetPositive ? 'Beat' : 'Missed'} budget by <strong>{formatVal(budgetNetChange)}</strong> ({isBudgetPositive ? '+' : ''}{budgetPct.toFixed(1)}%).
                      {salesMiss && <> Sales shortfall of {formatVal(budgetVariances[0]?.value || 0)}.</>}
                      {salesMiss && costSavings && ' Cost savings partially offset the gap.'}
                      {!salesMiss && isBudgetPositive && ' Strong sales performance drove the upside.'}
                    </span>
                  </>
                );
              })()}
            </div>
          </div>
        ) : (
          <div className="waterfall-detail__chart-container waterfall-detail__chart-container--empty">
            <div className="waterfall-detail__no-data">
              <span className="waterfall-detail__no-data-icon">📋</span>
              <div className="waterfall-detail__no-data-title">Budget vs Actual</div>
              <div className="waterfall-detail__no-data-text">
                No budget data available.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="waterfall-detail__legend">
        <div className="waterfall-detail__legend-item">
          <span className="waterfall-detail__legend-color waterfall-detail__legend-color--start"></span>
          <span>Starting Value</span>
        </div>
        <div className="waterfall-detail__legend-item">
          <span className="waterfall-detail__legend-color waterfall-detail__legend-color--favorable"></span>
          <span>Favorable (↑ Profit)</span>
        </div>
        <div className="waterfall-detail__legend-item">
          <span className="waterfall-detail__legend-color waterfall-detail__legend-color--unfavorable"></span>
          <span>Unfavorable (↓ Profit)</span>
        </div>
        <div className="waterfall-detail__legend-item">
          <span className="waterfall-detail__legend-color waterfall-detail__legend-color--end"></span>
          <span>Ending Value</span>
        </div>
      </div>

      {/* How to Read */}
      <div className="waterfall-detail__how-to-read">
        <strong>How to read:</strong> Each bar shows the <em>profit impact</em> of that category. 
        For costs (Material, Mfg, OpEx), green means costs were <strong>lower</strong> than expected, boosting profit. 
        Red means costs were <strong>higher</strong>, reducing profit.
      </div>
    </div>
  );
};

export default BudgetActualWaterfallDetail;
