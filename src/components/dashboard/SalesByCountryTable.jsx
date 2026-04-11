import React, { useRef, useImperativeHandle, useState, useEffect, useMemo, useCallback } from 'react';
import { useFilter } from '../../contexts/FilterContext';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { COLOR_SCHEMES } from './utils/FinancialConstants';
import { getColumnColorPalette } from './utils/colorUtils';
import './SalesByCountryTableStyles.css';

const SalesByCountryTable = React.forwardRef((props, ref) => {
  const { columnOrder, dataGenerated, basePeriodIndex: contextBasePeriodIndex } = useFilter();
  // Read selected division from global dashboard context (radio buttons)
  const { selectedDivision } = useExcelData();
  const internalTableRef = useRef(null);

  // State for country sales data
  const [countriesData, setCountriesData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Generate dynamic delta label based on column types
  const getDeltaLabel = useCallback((fromCol, toCol) => {
    const fromType = (fromCol?.type || 'Actual').toLowerCase();
    const toType = (toCol?.type || 'Actual').toLowerCase();
    
    if (fromType === 'actual' && toType === 'actual') return 'YoY';
    
    if (toType === 'actual') {
      if (fromType === 'budget') return 'Vs Bgt';
      if (fromType === 'estimate') return 'Vs Est';
      if (fromType === 'forecast') return 'Vs Fcst';
    }
    
    if (fromType === 'actual') {
      if (toType === 'budget') return 'Vs Bgt';
      if (toType === 'estimate') return 'Vs Est';
      if (toType === 'forecast') return 'Vs Fcst';
    }
    
    return 'Δ';
  }, []);


  // Expose the table ref for PDF export
  useImperativeHandle(ref, () => ({
    getTableElement: () => internalTableRef.current,
  }));

  // Load country sales data when division is FP and columns are selected
  useEffect(() => {
    const loadCountryData = async () => {
      if (selectedDivision === 'FP' && columnOrder.length > 0 && dataGenerated) {
        setLoading(true);
        setError(null);

        try {
          // Build dataColumns = data-only view of columnOrder
          const dataColumns = columnOrder.filter(col => {
            if (col.columnType === 'delta') return false;
            return true;
          });

          // Parallel API calls for each period
          const apiCalls = dataColumns.map(async (column, columnIndex) => {
            // Convert column to months array
            let months = [];
            if (column.months && Array.isArray(column.months)) {
              months = column.months;
            } else if (column.month === 'Q1') {
              months = [1, 2, 3];
            } else if (column.month === 'Q2') {
              months = [4, 5, 6];
            } else if (column.month === 'Q3') {
              months = [7, 8, 9];
            } else if (column.month === 'Q4') {
              months = [10, 11, 12];
            } else if (column.month === 'Year') {
              months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
            } else if (column.month === 'HY1') {
              months = [1, 2, 3, 4, 5, 6];
            } else if (column.month === 'HY2') {
              months = [7, 8, 9, 10, 11, 12];
            } else {
              // Convert month name to number
              const monthMap = {
                'January': 1, 'February': 2, 'March': 3, 'April': 4,
                'May': 5, 'June': 6, 'July': 7, 'August': 8,
                'September': 9, 'October': 10, 'November': 11, 'December': 12
              };
              months = [monthMap[column.month] || 1];
            }

            const response = await fetch('/api/sales-by-country-db', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                division: selectedDivision,
                year: column.year,
                months: months,
                dataType: column.type || 'Actual'
              })
            });

            const result = await response.json();
            return { columnIndex, column, result };
          });

          // Wait for all API calls to complete in parallel
          const results = await Promise.all(apiCalls);

          // Build country data structure: { countryName: { name, values: [val1, val2, ...] } }
          const countryDataMap = {};

          results.forEach(({ columnIndex, result }) => {
            if (result.success && Array.isArray(result.data)) {
              result.data.forEach(item => {
                const countryName = item.country;
                if (!countryDataMap[countryName]) {
                  countryDataMap[countryName] = {
                    name: countryName,
                    values: new Array(dataColumns.length).fill(0)
                  };
                }
                countryDataMap[countryName].values[columnIndex] = item.value || 0;
              });
            }
          });

          setCountriesData(Object.values(countryDataMap));
        } catch (error) {
          console.error('Error loading country sales data:', error);
          setError('Failed to load data from database');
        } finally {
          setLoading(false);
        }
      }
    };

    loadCountryData();
  }, [selectedDivision, columnOrder, dataGenerated]);

  // ✅ OPTIMIZATION: Memoize dataColumns to avoid recalculation on every render
  const dataColumns = useMemo(() => {
    return columnOrder.filter(col => {
      if (col.columnType === 'delta') return false;
      return true;
    });
  }, [columnOrder]);

  // ✅ OPTIMIZATION: All hooks must be at top level before any returns
  // Sort countries by sales value (descending) based on base period
  const sortedCountries = useMemo(() => {
    if (!countriesData || countriesData.length === 0) return [];

    // Determine the effective base period index
    let effectiveBasePeriodIndex = contextBasePeriodIndex;

    // If base period index is invalid or out of range, use the first available period
    if (effectiveBasePeriodIndex === null || effectiveBasePeriodIndex < 0 || effectiveBasePeriodIndex >= dataColumns.length) {
      effectiveBasePeriodIndex = 0; // Default to first period
    }

    // Sort by base period sales value (descending)
    return [...countriesData].sort((a, b) => {
      const aVal = a.values && a.values[effectiveBasePeriodIndex] ? a.values[effectiveBasePeriodIndex] : 0;
      const bVal = b.values && b.values[effectiveBasePeriodIndex] ? b.values[effectiveBasePeriodIndex] : 0;
      return bVal - aVal; // Descending order
    });
  }, [countriesData, contextBasePeriodIndex, dataColumns]);

  // Get base period column details for footer text
  const basePeriodColumn = useMemo(() => {
    let effectiveBasePeriodIndex = contextBasePeriodIndex;
    if (effectiveBasePeriodIndex === null || effectiveBasePeriodIndex < 0 || effectiveBasePeriodIndex >= dataColumns.length) {
      effectiveBasePeriodIndex = 0;
    }
    return dataColumns[effectiveBasePeriodIndex];
  }, [contextBasePeriodIndex, dataColumns]);

  // ✅ OPTIMIZATION: Memoize extendedColumns calculation
  const extendedColumns = useMemo(() => {
    const columns = [];
    dataColumns.forEach((col, index) => {
      columns.push({ ...col, columnType: 'data', dataIndex: index });
      if (index < dataColumns.length - 1) {
        const fromCol = col;
        const toCol = dataColumns[index + 1];
        columns.push({
          columnType: 'delta',
          fromDataIndex: index,
          toDataIndex: index + 1,
          fromCol: fromCol,
          toCol: toCol,
          deltaLabel: getDeltaLabel(fromCol, toCol)
        });
      }
    });
    return columns;
  }, [dataColumns, getDeltaLabel]);

  // Generate dynamic footer description based on comparison types present
  const getDeltaFooterDescription = useMemo(() => {
    const deltaColumns = extendedColumns.filter(col => col.columnType === 'delta');
    if (deltaColumns.length === 0) return '';

    let hasYoY = false;
    let hasActualVsReference = false;
    let hasOtherComparisons = false;

    deltaColumns.forEach(delta => {
      const fromType = (delta.fromCol?.type || 'Actual').toLowerCase();
      const toType = (delta.toCol?.type || 'Actual').toLowerCase();

      if (fromType === 'actual' && toType === 'actual') {
        hasYoY = true;
      } else if (fromType === 'actual' || toType === 'actual') {
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
      descriptions.push('Δ% shows percentage change between consecutive periods');
    }

    return descriptions.join(' | ');
  }, [extendedColumns]);

  // ✅ OPTIMIZATION: Memoize color helper functions (using imported COLOR_SCHEMES)
  const getColumnHeaderStyle = useCallback((column) => {
    if (!column) {
      return { 
        background: 'linear-gradient(135deg, #3b82f6, #1e40af)', 
        color: '#FFFFFF',
        fontWeight: 'bold'
      };
    }
    
    if (column.customColor || column.customColorHex) {
      const palette = getColumnColorPalette(column);
      return {
        background: palette.gradient,
        color: palette.text,
        fontWeight: 'bold'
      };
    }
    
    // Default color assignment based on month/type
    if (column.month === 'Q1' || column.month === 'Q2' || column.month === 'Q3' || column.month === 'Q4') {
      // Orange header → dark text
      return { background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#000000', fontWeight: 'bold' };
    } else if (column.month === 'January') {
      // Yellow header → dark text
      return { background: 'linear-gradient(135deg, #fbbf24, #d97706)', color: '#000000', fontWeight: 'bold' };
    } else if (column.month === 'Year') {
      return { background: 'linear-gradient(135deg, #3b82f6, #1e40af)', color: '#FFFFFF', fontWeight: 'bold' };
    } else if (column.type === 'Budget') {
      return { background: 'linear-gradient(135deg, #059669, #047857)', color: '#FFFFFF', fontWeight: 'bold' };
    }
    
    // Default to blue
    return { background: 'linear-gradient(135deg, #3b82f6, #1e40af)', color: '#FFFFFF', fontWeight: 'bold' };
  }, []);

  const getCellBackgroundColor = useCallback((column) => {
    if (column.customColor || column.customColorHex) {
      const palette = getColumnColorPalette(column);
      if (palette.light) {
        return palette.light; // Use light color for body cells
      }
    }
    
    // Default color assignment based on month/type - use lighter versions for body cells
    if (column.month === 'Q1' || column.month === 'Q2' || column.month === 'Q3' || column.month === 'Q4') {
      const orangeScheme = COLOR_SCHEMES.find(s => s.name === 'orange');
      return orangeScheme ? orangeScheme.light : '#FFF3E0';
    } else if (column.month === 'January') {
      const yellowScheme = COLOR_SCHEMES.find(s => s.name === 'yellow');
      return yellowScheme ? yellowScheme.light : '#FFFDE7';
    } else if (column.month === 'Year') {
      const blueScheme = COLOR_SCHEMES.find(s => s.name === 'blue');
      return blueScheme ? blueScheme.light : '#E3F2FD';
    } else if (column.type === 'Budget') {
      const greenScheme = COLOR_SCHEMES.find(s => s.name === 'green');
      return greenScheme ? greenScheme.light : '#E8F5E9';
    }
    
    // Default to blue light
    const blueScheme = COLOR_SCHEMES.find(s => s.name === 'blue');
    return blueScheme ? blueScheme.light : '#E3F2FD';
  }, []);

  // Helper function to get country sales value for a specific period
  const getCountryValue = (country, dataColumnIndex) => {
    if (!country.values || !country.values[dataColumnIndex]) {
      return 0;
    }
    return parseFloat(country.values[dataColumnIndex]) || 0;
  };

  // Helper function to calculate percentage of total for a country
  const getCountryPercentage = (country, dataColumnIndex) => {
    const value = getCountryValue(country, dataColumnIndex);
    const total = sortedCountries.reduce((sum, c) => sum + getCountryValue(c, dataColumnIndex), 0);
    return total > 0 ? (value / total) * 100 : 0;
  };

  // Helper function to format numbers
  const formatNumber = (value) => {
    if (value === 0 || isNaN(value)) return '';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  // Helper function to format percentage
  const formatPercentage = (value) => {
    if (value === 0 || isNaN(value)) return '';
    return `${value.toFixed(1)}%`;
  };

  // ⚠️ EARLY RETURNS - Must come AFTER all hooks
  // Only show data if Generate button has been clicked AND columns are selected
  if (!dataGenerated || columnOrder.length === 0) {
    return (
      <div className="sbc-table-view sbc-table-view--compact">
        <div className="sbc-table-empty-state">
          <p>Please select columns and click the Generate button to view country sales data.</p>
        </div>
      </div>
    );
  }

  // Show loading state for FP division
  if (selectedDivision === 'FP' && loading) {
    return (
      <div className="sbc-table-view sbc-table-view--compact">
        <div className="sbc-table-empty-state">
          <p>Loading country sales data...</p>
        </div>
      </div>
    );
  }

  // Show error state for FP division
  if (selectedDivision === 'FP' && error) {
    return (
      <div className="sbc-table-view sbc-table-view--compact">
        <div className="sbc-table-empty-state">
          <p style={{ color: 'red' }}>Error: {error}</p>
        </div>
      </div>
    );
  }

  // Helper function to calculate total sales for a period
  const getTotalSalesAtIndex = (dataIndex) => {
    return sortedCountries.reduce((sum, country) => sum + getCountryValue(country, dataIndex), 0);
  };

  // Delta helpers with SMART formula based on comparison type
  // Formula: Actual vs Budget/Est/Fcst = ((Actual - Reference) / Reference) × 100
  const calculateDeltaPercentage = (fromValue, toValue, fromColType, toColType) => {
    // Handle NaN values
    if (isNaN(fromValue) || isNaN(toValue)) return null;
    
    // Handle null/undefined values
    if (fromValue == null || toValue == null) return null;
    
    const fromType = (fromColType || 'Actual').toLowerCase();
    const toType = (toColType || 'Actual').toLowerCase();
    
    let actualValue, referenceValue;
    
    // Smart formula selection based on comparison types
    if (toType === 'actual' && fromType !== 'actual') {
      // Comparing TO Actual FROM Budget/Est/Fcst: ((Actual - Ref) / Ref)
      actualValue = toValue;
      referenceValue = fromValue;
    } else if (fromType === 'actual' && toType !== 'actual') {
      // Comparing FROM Actual TO Budget/Est/Fcst: ((Actual - Ref) / Ref)
      actualValue = fromValue;
      referenceValue = toValue;
    } else {
      // Both same type (Actual vs Actual = YoY): ((newer - older) / older)
      actualValue = toValue;
      referenceValue = fromValue;
    }
    
    // Handle zero denominator with smart logic
    if (referenceValue === 0) {
      if (actualValue > 0) return 'NEW';
      if (actualValue === 0) return 'NONE';
      return 0;
    }
    
    return ((actualValue - referenceValue) / referenceValue) * 100;
  };

  const formatDelta = (delta) => {
    // Handle null values (missing data)
    if (delta === null) return '—';
    
    // Handle "NEW" case
    if (delta === 'NEW') return '🆕 NEW';
    
    // Handle no activity case
    if (delta === 'NONE') return '—';
    
    // Handle zero change
    if (delta === 0) return '0.0%';
    
    const sign = delta > 0 ? '+' : '';
    const formatted = Math.abs(delta) >= 100 ? Math.round(delta) : delta.toFixed(1);
    return `${sign}${formatted}%`;
  };

  const getDeltaColor = (delta) => {
    if (delta === null) return '#666666'; // Gray for N/A
    if (delta === 'NEW') return '#059669'; // Green for new data
    if (delta === 'NONE') return '#6b7280'; // Gray for no activity
    if (delta === 0) return '#666666'; // Gray for no change
    return delta > 0 ? '#0066cc' : '#cc0000'; // Blue for positive, red for negative
  };

  if (!countriesData.length) {
    return (
      <div className="sbc-table-view sbc-table-view--compact">
        <div className="sbc-table-empty-state" style={{ textAlign: 'center', color: '#666' }}>
          {selectedDivision && selectedDivision !== 'FP' ? (
            <>
              <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>⚒️ Coming Soon</div>
              <p>
                Sales by Country for {selectedDivision} division is currently under development.
              </p>
              <p style={{ fontStyle: 'italic', marginTop: '6px' }}>
                The database table {selectedDivision.toLowerCase()}_data_excel has been created and is ready for data.
              </p>
            </>
          ) : (
            <p>No country sales data available. Please ensure data is loaded.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="sbc-table-view sbc-table-view--compact">
      <div ref={internalTableRef} className="sbc-table-container-for-export">
        <div className="sbc-table-container">
          <table className="sales-by-country-table">
            <thead>
              <tr className="main-header-row">
                <th className="empty-header" rowSpan="4" style={{ width: '26%' }}>Country Names</th>
                {extendedColumns.map((col, index) => (
                  col.columnType === 'delta' ? (
                    <th key={`delta-year-${index}`} rowSpan="4" style={{ backgroundColor: '#1976d2', color: '#fbbf24', fontWeight: 'bold' }}>{col.deltaLabel}<br/>%</th>
                  ) : (
                    <th
                      key={`year-${index}`}
                      colSpan="2"
                      style={getColumnHeaderStyle(col)}
                    >
                      {col.year}
                    </th>
                  )
                ))}
              </tr>
              <tr>
                {extendedColumns.map((col, index) => (
                  col.columnType === 'delta' ? null : (
                    <th
                      key={`month-${index}`}
                      colSpan="2"
                      style={getColumnHeaderStyle(col)}
                    >
                      {col.isCustomRange ? col.displayName : col.month}
                    </th>
                  )
                )).filter(Boolean)}
              </tr>
              <tr>
                {extendedColumns.map((col, index) => (
                  col.columnType === 'delta' ? null : (
                    <th 
                      key={`type-${index}`}
                      colSpan="2"
                      style={getColumnHeaderStyle(col)}
                    >
                      {col.type}
                    </th>
                  )
                )).filter(Boolean)}
              </tr>
              <tr>
                {extendedColumns.map((col, index) => (
                  col.columnType === 'delta' ? null : (
                    <React.Fragment key={`row4-${index}`}>
                      <th 
                        key={`values-${index}`}
                        style={getColumnHeaderStyle(col)}
                      >
                        Values
                      </th>
                      <th 
                        key={`percent-${index}`}
                        style={getColumnHeaderStyle(col)}
                      >
                        %
                      </th>
                    </React.Fragment>
                  )
                )).filter(Boolean)}
              </tr>
            </thead>
            <tbody>
              {/* Separator row between headers and body */}
              <tr className="sbc-separator-row">
                <td></td>
                {extendedColumns.map((col, index) => {
                  if (col.columnType === 'delta') {
                    return <td key={`separator-delta-${index}`}></td>;
                  }
                  return (
                    <React.Fragment key={`separator-${index}`}>
                      <td key={`separator-values-${index}`}></td>
                      <td key={`separator-percent-${index}`}></td>
                    </React.Fragment>
                  );
                })}
              </tr>
              {/* Country rows - one row per country */}
              {sortedCountries.map((country, countryIndex) => (
                <tr key={`country-${countryIndex}`} className="metric-row">
                  <td className="row-label country-name-cell">
                    {country.name}
                  </td>
                  {extendedColumns.map((col, idx) => {
                    if (col.columnType === 'delta') {
                      // Delta between adjacent data columns
                      const fromVal = getCountryValue(country, col.fromDataIndex);
                      const toVal = getCountryValue(country, col.toDataIndex);
                      // Pass column types for smart formula selection
                      const delta = calculateDeltaPercentage(fromVal, toVal, col.fromCol?.type, col.toCol?.type);
                      const deltaText = formatDelta(delta);
                      const color = getDeltaColor(delta);
                      return (
                        <td key={`delta-${countryIndex}-${idx}`} className="metric-cell delta-cell" style={{ backgroundColor: '#f8f9fa', textAlign: 'center', fontWeight: 'bold', color }}>
                          {deltaText}
                        </td>
                      );
                    }
                    // Data column - render 2 cells: Values and %
                    const dataColumnIndex = col.dataIndex;
                    const value = getCountryValue(country, dataColumnIndex);
                    const percentage = getCountryPercentage(country, dataColumnIndex);
                    return (
                      <React.Fragment key={`data-${countryIndex}-${idx}`}>
                        <td className="metric-cell data-value-cell" style={{ backgroundColor: getCellBackgroundColor(col), textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {formatNumber(value)}
                        </td>
                        <td className="metric-cell data-percent-cell" style={{ backgroundColor: getCellBackgroundColor(col), textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {formatPercentage(percentage)}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}

              {/* Total row */}
              <tr className="metric-row total-metric-row">
                <td className="row-label total-row-label" style={{
                  fontWeight: 'bold',
                  fontFamily: 'Arial, sans-serif',
                  color: '#fff',
                  backgroundColor: '#0D47A1'
                }}>
                  Total
                </td>
                {extendedColumns.map((col, idx) => {
                  if (col.columnType === 'delta') {
                    const fromTotal = getTotalSalesAtIndex(col.fromDataIndex);
                    const toTotal = getTotalSalesAtIndex(col.toDataIndex);
                    // Pass column types for smart formula selection
                    const delta = calculateDeltaPercentage(fromTotal, toTotal, col.fromCol?.type, col.toCol?.type);
                    const deltaText = formatDelta(delta);
                    const color = '#fff'; // White text for Total row
                    return (
                      <td key={`total-delta-${idx}`} className="metric-cell total-delta-cell" style={{ backgroundColor: '#0D47A1', textAlign: 'center', fontWeight: 'bold', color }}>
                        {deltaText}
                      </td>
                    );
                  }
                  const totalValue = getTotalSalesAtIndex(col.dataIndex);
                  return (
                    <React.Fragment key={`total-data-${idx}`}>
                      <td className="metric-cell total-data-cell" style={{ backgroundColor: '#0D47A1', color: '#fff', textAlign: 'center', fontWeight: 'bold' }}>
                        {formatNumber(totalValue)}
                      </td>
                      <td className="metric-cell total-data-cell" style={{ backgroundColor: '#0D47A1', color: '#fff', textAlign: 'center', fontWeight: 'bold' }}>
                        100.0%
                      </td>
                    </React.Fragment>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
        {/* Footer info text */}
        {basePeriodColumn && (
          <div style={{
            textAlign: 'center',
            fontSize: '11px',
            color: '#666',
            marginTop: '12px',
            fontStyle: 'italic'
          }}>
            Sorting by Base Period ({basePeriodColumn.year} {basePeriodColumn.month} {basePeriodColumn.type}) highest to lowest{getDeltaFooterDescription ? ` | ${getDeltaFooterDescription}` : ''}
          </div>
        )}
      </div>
    </div>
  );
});

export default SalesByCountryTable;