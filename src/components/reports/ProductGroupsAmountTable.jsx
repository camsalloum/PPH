import React, { useEffect } from 'react';
import { useFilter } from '../../contexts/FilterContext';
import { formatCustomRangeDisplay } from '../../utils/periodHelpers';
import './ProductGroupsAmountTable.css'; // Using dedicated CSS file
import CurrencySymbol from '../dashboard/CurrencySymbol';

const ProductGroupsAmountTable = ({ amountData, rep }) => {
  const { columnOrder, basePeriodIndex } = useFilter();

  // Add UAE Dirham symbol font
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @font-face {
        font-family: 'UAESymbol';
        src: url('/assets/font.woff2') format('woff2'),
             url('/assets/font.woff') format('woff'),
             url('/assets/font.ttf') format('truetype');
      }
      .uae-symbol {
        font-family: 'UAESymbol', sans-serif;
        margin-right: 5px;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  // Build extended columns structure (similar to SalesBySaleRepTable)
  const buildExtendedColumns = (columnOrder) => {
    if (!columnOrder || columnOrder.length === 0) return [];
    
    const extendedColumns = [];
    
    // Helper function to determine the correct delta label - UPDATED 2026-01-25
    const getDeltaLabel = (fromCol, toCol) => {
      const fromType = (fromCol.type || '').toLowerCase();
      const toType = (toCol.type || '').toLowerCase();
      
      // Debug: log column types - V2 MARKER
      
      // Both Actual = YoY %
      if (fromType === 'actual' && toType === 'actual') {
        return 'YoY';
      }
      // Actual vs Budget = Vs Bgt %
      if ((fromType === 'actual' && toType === 'budget') || (fromType === 'budget' && toType === 'actual')) {
        return 'Vs Bgt';
      }
      // Actual vs Estimate/Forecast = Vs Est %
      if ((fromType === 'actual' && (toType === 'estimate' || toType === 'forecast')) ||
          ((fromType === 'estimate' || fromType === 'forecast') && toType === 'actual')) {
        return 'Vs Est';
      }
      // Budget vs Estimate = Bgt vs Est %
      if ((fromType === 'budget' && (toType === 'estimate' || toType === 'forecast')) ||
          ((fromType === 'estimate' || fromType === 'forecast') && toType === 'budget')) {
        return 'Bgt vs Est';
      }
      // Default fallback
      return 'Δ';
    };
    
    for (let i = 0; i < columnOrder.length; i++) {
      const col = columnOrder[i];
      extendedColumns.push({
        ...col,
        columnType: 'data',
        dataIndex: i
      });
      
      // Add delta column between consecutive data columns
      if (i < columnOrder.length - 1) {
        const fromCol = columnOrder[i];
        const toCol = columnOrder[i + 1];
        extendedColumns.push({
          columnType: 'delta',
          fromDataIndex: i,
          toDataIndex: i + 1,
          deltaLabel: getDeltaLabel(fromCol, toCol),
          fromType: fromCol.type,
          toType: toCol.type
        });
      }
    }
    
    return extendedColumns;
  };

  const extendedColumns = buildExtendedColumns(columnOrder);

  // Check if a column is the base period column
  const isBasePeriodColumn = (columnIndex) => {
    if (basePeriodIndex === null) return false;
    const dataColumnIndex = extendedColumns.slice(0, columnIndex).filter(col => col.columnType === 'data').length;
    return dataColumnIndex === basePeriodIndex;
  };

  // Get column header style - REMOVED ALL BACKGROUND COLORS
  const getColumnHeaderStyle = (col) => {
    if (col.type === 'Budget') {
      return { color: '#333' };
    } else if (col.type === 'Forecast') {
      return { color: '#f57c00' };
    } else {
      return { color: '#333' };
    }
  };

  // Enhanced format number for display with better visual presentation for amounts
  const formatValue = (value, includeSymbol = false) => {
    if (typeof value !== 'number') return value || '-';
    
    // Handle zero values
    if (value === 0) return includeSymbol ? <><CurrencySymbol />0</> : '0';
    
    const absValue = Math.abs(value);
    let formattedNumber;
    let unit = '';
    
    // Format based on magnitude for better readability (amounts are typically larger)
    if (absValue >= 1000000) {
      formattedNumber = (value / 1000000).toFixed(1);
      unit = 'M';
    } else if (absValue >= 1000) {
      formattedNumber = (value / 1000).toFixed(1);
      unit = 'K';
    } else {
      formattedNumber = value.toFixed(0);
    }
    
    // Add thousands separator for the formatted number
    const parts = formattedNumber.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const finalNumber = parts.join('.');
    
    const result = `${finalNumber}${unit}`;
    
    if (includeSymbol) {
      return <><CurrencySymbol />{result}</>;
    }
    
    return result;
  };

  // Calculate column total
  const calculateColumnTotal = (data, columnIndex) => {
    // Map columnIndex to rawValues index (skip delta columns)
    const dataColumnIndex = extendedColumns.slice(0, columnIndex).filter(col => col.columnType === 'data').length;
    
    const total = data.reduce((total, row) => {
      const arr = row.rawValues || row.values;
      if (!arr || dataColumnIndex >= arr.length) {
        return total;
      }
      const value = arr[dataColumnIndex];
      if (typeof value === 'number' && !isNaN(value)) {
        return total + value;
      }
      return total;
    }, 0);
    return total;
  };

  // Enhanced calculate delta for total row with CORRECT financial formulas
  // - YoY (Actual vs Actual): ((newer - older) / older) × 100
  // - Vs Budget: ((Actual - Budget) / Budget) × 100
  // - Vs Estimate: ((Actual - Estimate) / Estimate) × 100
  const calculateTotalDelta = (data, fromIndex, toIndex, deltaCol) => {
    const fromTotal = calculateColumnTotal(data, fromIndex);
    const toTotal = calculateColumnTotal(data, toIndex);
    
    const fromType = (deltaCol?.fromType || '').toLowerCase();
    const toType = (deltaCol?.toType || '').toLowerCase();
    
    let actualValue, referenceValue;
    
    // Determine which value is Actual and which is the reference (Budget/Estimate)
    if (fromType === 'actual' && (toType === 'budget' || toType === 'estimate' || toType === 'forecast')) {
      actualValue = fromTotal;
      referenceValue = toTotal;
    } else if ((fromType === 'budget' || fromType === 'estimate' || fromType === 'forecast') && toType === 'actual') {
      actualValue = toTotal;
      referenceValue = fromTotal;
    } else {
      // YoY or other: standard formula
      actualValue = toTotal;
      referenceValue = fromTotal;
    }
    
    // Zero denominator protection - smart display
    if (referenceValue === 0) {
      if (actualValue > 0) {
        return { arrow: '🆕', value: 'NEW', color: '#059669', isNA: true };
      }
      return { arrow: '', value: '—', color: '#6b7280', isNA: true };
    }
    
    const delta = ((actualValue - referenceValue) / referenceValue) * 100;
    const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '➖';
    const color = delta > 0 ? '#059669' : delta < 0 ? '#dc2626' : '#6b7280';
    
    // Enhanced delta formatting
    const absDelta = Math.abs(delta);
    let formattedValue;
    
    if (absDelta >= 999.9) {
      formattedValue = '999+%';
    } else if (absDelta >= 99.99) {
      formattedValue = Math.round(absDelta) + '%';
    } else if (absDelta >= 10) {
      formattedValue = absDelta.toFixed(1) + '%';
    } else {
      formattedValue = absDelta.toFixed(2) + '%';
    }
    
    return { arrow, value: formattedValue, color };
  };

  // Calculate delta for individual row with CORRECT financial formulas
  const calculateRowDelta = (row, deltaCol) => {
    const fromValue = row.rawValues?.[deltaCol.fromDataIndex] || 0;
    const toValue = row.rawValues?.[deltaCol.toDataIndex] || 0;
    
    const fromType = (deltaCol?.fromType || '').toLowerCase();
    const toType = (deltaCol?.toType || '').toLowerCase();
    
    let actualValue, referenceValue;
    
    if (fromType === 'actual' && (toType === 'budget' || toType === 'estimate' || toType === 'forecast')) {
      actualValue = fromValue;
      referenceValue = toValue;
    } else if ((fromType === 'budget' || fromType === 'estimate' || fromType === 'forecast') && toType === 'actual') {
      actualValue = toValue;
      referenceValue = fromValue;
    } else {
      actualValue = toValue;
      referenceValue = fromValue;
    }
    
    // Zero denominator protection - smart display
    if (referenceValue === 0) {
      if (actualValue > 0) {
        return { arrow: '🆕', value: 'NEW', color: '#059669', isNA: true };
      }
      return { arrow: '', value: '—', color: '#6b7280', isNA: true };
    }
    
    const delta = ((actualValue - referenceValue) / referenceValue) * 100;
    const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '➖';
    const color = delta > 0 ? '#059669' : delta < 0 ? '#dc2626' : '#6b7280';
    
    const absDelta = Math.abs(delta);
    let formattedValue;
    
    if (absDelta >= 999.9) {
      formattedValue = '999+%';
    } else if (absDelta >= 99.99) {
      formattedValue = Math.round(absDelta) + '%';
    } else if (absDelta >= 10) {
      formattedValue = absDelta.toFixed(1) + '%';
    } else {
      formattedValue = absDelta.toFixed(2) + '%';
    }
    
    return { arrow, value: formattedValue, color };
  };

  // Filter out rows with all zero values
  const filterZeroRows = (data) => {
    return data.filter(row => {
      const hasPositiveValue = extendedColumns.some((col, colIndex) => {
        if (col.columnType === 'data') {
          const val = row.values[colIndex];
          
          if (typeof val === 'string') {
            const numValue = parseFloat(val);
            return !isNaN(numValue) && numValue > 0;
          }
          if (typeof val === 'number') {
            return !isNaN(val) && val > 0;
          }
        }
        return false;
      });
      return hasPositiveValue;
    });
  };

  // Filter out excluded product groups
  // NOTE: Exclusion is now handled at the database level via is_unmapped flag
  // Admin controls exclusions in Master Data > Raw Product Groups
  // This filter is kept for backward compatibility but should be minimal now
  const filterExcludedGroups = (data) => {
    return data.filter(row => {
      if (!row.name) return true;
      const name = row.name.toString().trim().toLowerCase();
      // Only filter 'not in pg' which is the database marker for excluded
      // 'Services Charges' and 'Others' should be managed via database is_unmapped flag
      return name !== 'not in pg';
    });
  };

  // Render table header
  const renderTableHeader = () => (
    <thead>
      <tr className="main-header-row">
        <th className="product-header" rowSpan={3}>Product Groups</th>
        {extendedColumns.map((col, idx) => {
          if (col.columnType === 'delta') {
            // Use dynamic delta label based on comparison types
            return <th key={`delta-${idx}`} rowSpan={3} style={getColumnHeaderStyle({ columnType: 'delta' })} className="delta-header">{col.deltaLabel}<br />%</th>;
          }
          return <th key={`year-${idx}`} style={getColumnHeaderStyle(col)} className="period-header">{col.year}</th>;
        })}
      </tr>
      <tr className="main-header-row">
        {extendedColumns.map((col, idx) => {
          if (col.columnType === 'delta') return null;
          const monthDisplay = col.isCustomRange ? formatCustomRangeDisplay(col.displayName) : col.month;
          return <th key={`month-${idx}`} style={getColumnHeaderStyle(col)} className="period-header">{monthDisplay}</th>;
        })}
      </tr>
      <tr className="main-header-row">
        {extendedColumns.map((col, idx) => {
          if (col.columnType === 'delta') return null;
          return <th key={`type-${idx}`} style={getColumnHeaderStyle(col)} className="period-header">{col.type}</th>;
        })}
      </tr>
    </thead>
  );

  if (!amountData || amountData.length === 0) {
    return (
      <div className="product-groups-amount-table">
        <h3>Product Groups - <CurrencySymbol /> Sales Comparison</h3>
        <div className="no-data">No data available for {rep}</div>
      </div>
    );
  }

  if (!columnOrder || columnOrder.length === 0) {
    return (
      <div className="product-groups-amount-table">
        <h3>Product Groups - <CurrencySymbol /> Sales Comparison</h3>
        <div className="no-data">Please select columns to view data.</div>
      </div>
    );
  }

  const filteredData = filterExcludedGroups(filterZeroRows(amountData));

  return (
    <div className="product-groups-amount-table">
      <h3>Product Groups - <CurrencySymbol /> Sales Comparison</h3>
      <table className="amount-comparison-table">
        {renderTableHeader()}
        <tbody>
          {filteredData.map(pg => (
            <tr key={pg.name} className="product-row">
              <td className="row-label product-name">{pg.name}</td>
              {extendedColumns.map((col, idx) => {
                if (col.columnType === 'delta') {
                  // RECALCULATE delta using correct financial formula
                  const delta = calculateRowDelta(pg, col);
                  const deltaClass = delta.arrow === '▲' ? 'delta-up' : delta.arrow === '▼' ? 'delta-down' : '';
                  return (
                    <td key={idx} className={`metric-cell delta-cell ${deltaClass}`} style={{ color: delta.color }}>
                      <span className="delta-arrow" style={{ fontSize: '12px' }}>{delta.arrow}</span>
                      <span className="delta-value">{delta.value}</span>
                    </td>
                  );
                }
                // Use rawValues for data columns, fallback to values for delta columns
                const val = col.dataIndex !== undefined ? (pg.rawValues && pg.rawValues[col.dataIndex] !== undefined ? pg.rawValues[col.dataIndex] : pg.values[idx]) : pg.values[idx];
                return <td key={idx} className="metric-cell">{formatValue(val)}</td>;
              })}
            </tr>
          ))}
          {/* Total Row */}
          <tr className="total-row">
            <td className="total-label">Total</td>
            {extendedColumns.map((col, idx) => {
              if (col.columnType === 'delta') {
                // Find the corresponding data columns for delta calculation
                const dataColumns = extendedColumns.filter(c => c.columnType === 'data');
                const deltaIndex = extendedColumns.slice(0, idx).filter(c => c.columnType === 'delta').length;
                if (deltaIndex < dataColumns.length - 1) {
                  const fromIndex = extendedColumns.findIndex(c => c === dataColumns[deltaIndex]);
                  const toIndex = extendedColumns.findIndex(c => c === dataColumns[deltaIndex + 1]);
                  // Pass delta column for correct formula
                  const delta = calculateTotalDelta(filteredData, fromIndex, toIndex, col);
                  const deltaClass = delta.arrow === '▲' ? 'delta-up' : delta.arrow === '▼' ? 'delta-down' : '';
                  return (
                    <td key={`total-delta-${idx}`} className={`metric-cell delta-cell ${deltaClass}`} style={{ color: delta.color }}>
                      <span className="delta-arrow" style={{ fontSize: '12px' }}>{delta.arrow}</span>
                      <span className="delta-value">{delta.value}</span>
                    </td>
                  );
                }
                return <td key={`total-delta-${idx}`} className="metric-cell">-</td>;
              }
              const totalValue = calculateColumnTotal(filteredData, idx);
              return <td key={`total-${idx}`} className="metric-cell total-value">{formatValue(totalValue, true)}</td>;
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default ProductGroupsAmountTable;