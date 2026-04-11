import React, { useRef, useImperativeHandle, useState, useEffect, useMemo, useCallback } from 'react';
import { useSalesData } from '../../contexts/SalesDataContext';
import { useFilter } from '../../contexts/FilterContext';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { COLOR_SCHEMES } from './utils/FinancialConstants';
import { getColumnColorPalette } from './utils/colorUtils';
import { getDeltaLabel as sharedGetDeltaLabel } from '../../utils/tableCalculations';
import CurrencySymbol from './CurrencySymbol';
import './ProductGroupTableStyles.css';

const ProductGroupTable = React.forwardRef(({ hideHeader = false, forceYoYCalculation = false, ...props }, ref) => {
  const { salesData } = useSalesData();
  const { columnOrder, dataGenerated } = useFilter();
  // Read selected division from global dashboard context (radio buttons)
  const { selectedDivision } = useExcelData();
  const internalTableRef = useRef(null);

  // State for SQL data
  const [sqlData, setSqlData] = useState({
    productGroups: [],
    materialCategories: [],
    processCategories: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // State for material percentages (for substrate calculations)
  const [materialPercentages, setMaterialPercentages] = useState({});


  // Expose the table ref for PDF export
  useImperativeHandle(ref, () => ({
    getTableElement: () => internalTableRef.current,
  }));

  // Load SQL data when division is FP and columns are selected
  useEffect(() => {
    const loadSqlData = async () => {
      if (selectedDivision === 'FP' && columnOrder.length > 0 && dataGenerated) {
        setLoading(true);
        setError(null);
        
        try {
          const productGroupsData = {};
          const processCategoriesData = {};
          const materialCategoriesData = {};
          
          // Build dataColumns = data-only view of columnOrder
          const dataColumns = columnOrder.filter(col => {
            if (col.columnType === 'delta') return false;
            return true;
          });
          
          // ✅ OPTIMIZATION: Parallel API calls instead of sequential
          const apiCalls = dataColumns.map((column, columnIndex) => {
            // Convert column to months array (handle Year, FY, quarters, etc.)
            let months = [];
            if (column.months && Array.isArray(column.months)) {
              // Convert month names to numbers
              const monthMap = {
                'January': 1, 'February': 2, 'March': 3, 'April': 4,
                'May': 5, 'June': 6, 'July': 7, 'August': 8,
                'September': 9, 'October': 10, 'November': 11, 'December': 12
              };
              months = column.months.map(m => typeof m === 'string' ? monthMap[m] || parseInt(m) : m);
            } else if (column.month === 'Q1') {
              months = [1, 2, 3];
            } else if (column.month === 'Q2') {
              months = [4, 5, 6];
            } else if (column.month === 'Q3') {
              months = [7, 8, 9];
            } else if (column.month === 'Q4') {
              months = [10, 11, 12];
            } else if (column.month === 'Year' || column.month === 'FY') {
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
            
            // Build query string with months array as NUMBERS
            let queryString = `year=${column.year}&type=${column.type}&months=${JSON.stringify(months)}`;
            
            return fetch(`/api/product-groups/fp?${queryString}`)
              .then(response => response.json())
              .then(result => ({ columnIndex, column, result }));
          });
          
          // Wait for all API calls to complete in parallel
          const results = await Promise.all(apiCalls);
          
          // Process results
          results.forEach(({ columnIndex, column, result }) => {
            if (result.success) {
              // Store product groups data
              result.data.productGroups.forEach(pg => {
                if (!productGroupsData[pg.name]) {
                  productGroupsData[pg.name] = {
                    name: pg.name,
                    metrics: []
                  };
                }
                
                // Add metrics for this column
                pg.metrics.forEach(metric => {
                  let existingMetric = productGroupsData[pg.name].metrics.find(m => m.type === metric.type);
                  if (!existingMetric) {
                    existingMetric = { type: metric.type, data: new Array(dataColumns.length).fill(0) };
                    productGroupsData[pg.name].metrics.push(existingMetric);
                  }
                  existingMetric.data[columnIndex] = metric.data[0];
                });
              });

              // Store process categories data if present
              if (Array.isArray(result.data.processCategories)) {
                result.data.processCategories.forEach(cat => {
                  if (!processCategoriesData[cat.name]) {
                    processCategoriesData[cat.name] = {
                      name: cat.name,
                      metrics: []
                    };
                  }
                  cat.metrics.forEach(metric => {
                    let existingMetric = processCategoriesData[cat.name].metrics.find(m => m.type === metric.type);
                    if (!existingMetric) {
                      existingMetric = { type: metric.type, data: new Array(dataColumns.length).fill(0) };
                      processCategoriesData[cat.name].metrics.push(existingMetric);
                    }
                    existingMetric.data[columnIndex] = metric.data[0];
                  });
                });
              }

              // Store material categories data if present
              if (Array.isArray(result.data.materialCategories)) {
                result.data.materialCategories.forEach(cat => {
                  if (!materialCategoriesData[cat.name]) {
                    materialCategoriesData[cat.name] = {
                      name: cat.name,
                      metrics: []
                    };
                  }
                  cat.metrics.forEach(metric => {
                    let existingMetric = materialCategoriesData[cat.name].metrics.find(m => m.type === metric.type);
                    if (!existingMetric) {
                      existingMetric = { type: metric.type, data: new Array(dataColumns.length).fill(0) };
                      materialCategoriesData[cat.name].metrics.push(existingMetric);
                    }
                    existingMetric.data[columnIndex] = metric.data[0];
                  });
                });
              }
            }
          });
          
          setSqlData({
            productGroups: Object.values(productGroupsData),
            materialCategories: Object.values(materialCategoriesData),
            processCategories: Object.values(processCategoriesData)
          });
        } catch (error) {
          console.error('Error loading SQL data:', error);
          setError('Failed to load data from database');
        } finally {
          setLoading(false);
        }
      }
    };

    loadSqlData();
  }, [selectedDivision, columnOrder, dataGenerated]);

  // Load material percentages for substrate calculations
  useEffect(() => {
    const loadMaterialPercentages = async () => {
      if (selectedDivision === 'FP') {
        try {
          const response = await fetch('/api/fp/master-data/material-percentages');
          const result = await response.json();
          if (result.success && result.data) {
            // Convert array to object keyed by product_group (lowercase for matching)
            const percentagesObj = {};
            result.data.forEach(item => {
              const key = item.product_group.toLowerCase().trim();
              percentagesObj[key] = {
                PE: parseFloat(item.pe_percentage) || 0,
                PP: parseFloat(item.bopp_percentage) || 0,
                PET: parseFloat(item.pet_percentage) || 0,
                Alu: parseFloat(item.alu_percentage) || 0,
                Paper: parseFloat(item.paper_percentage) || 0,
                'PVC/PET': parseFloat(item.pvc_pet_percentage) || 0,
                Mix: parseFloat(item.mix_percentage) || 0
              };
            });
            setMaterialPercentages(percentagesObj);
          }
        } catch (error) {
          console.error('Error loading material percentages:', error);
        }
      }
    };
    loadMaterialPercentages();
  }, [selectedDivision]);

  // ✅ OPTIMIZATION: All hooks must be at top level before any returns
  // Get the data
  const productGroups = selectedDivision === 'FP' ? sqlData.productGroups : [];

  // ✅ OPTIMIZATION: Memoize helper functions
  const isOthersGroup = useCallback((name) => {
    if (!name) return false;
    const n = name.toString().trim().toLowerCase();
    return n === 'others' || n === 'other' || n === 'others - total' || n === 'others total';
  }, []);

  const sortOthersLast = useCallback((arr) => {
    const getPriority = (name) => {
      const n = (name || '').toString().trim().toLowerCase();
      if (isOthersGroup(n)) return 2; // always last
      if (n === 'services charges') return 1; // before Others, after regular groups
      return 0; // regular groups first
    };
    return [...arr].sort((a, b) => {
      const pa = getPriority(a?.name);
      const pb = getPriority(b?.name);
      if (pa !== pb) return pa - pb;
      // deterministic alphabetical tie-breaker
      return (a?.name || '').localeCompare(b?.name || '');
    });
  }, [isOthersGroup]);

  // ✅ OPTIMIZATION: Memoize sorted product groups
  const sortedProductGroups = useMemo(() => sortOthersLast(productGroups), [productGroups, sortOthersLast]);

  // ✅ OPTIMIZATION: Memoize dataColumns to avoid recalculation on every render
  const dataColumns = useMemo(() => {
    return columnOrder.filter(col => {
      if (col.columnType === 'delta') return false;
      return true;
    });
  }, [columnOrder]);

  // ✅ Use shared getDeltaLabel for consistent delta labels across all tables
  const getDeltaLabel = useCallback((fromCol, toCol) => {
    return sharedGetDeltaLabel(fromCol, toCol);
  }, []);

  // ✅ OPTIMIZATION: Memoize extendedColumns calculation
  const extendedColumns = useMemo(() => {
    const columns = [];
    dataColumns.forEach((col, index) => {
      columns.push({ ...col, columnType: 'data', dataIndex: index });
      if (index < dataColumns.length - 1) {
        const fromCol = dataColumns[index];
        const toCol = dataColumns[index + 1];
        columns.push({
          columnType: 'delta',
          fromDataIndex: index,
          toDataIndex: index + 1,
          fromColumn: fromCol,
          toColumn: toCol,
          deltaLabel: getDeltaLabel(fromCol, toCol)
        });
      }
    });
    return columns;
  }, [dataColumns, getDeltaLabel]);

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
        return palette.light;
      }
    }
    
    // Default color assignment based on month/type
    if (column.month === 'Q1' || column.month === 'Q2' || column.month === 'Q3' || column.month === 'Q4') {
      const scheme = COLOR_SCHEMES.find(s => s.name === 'orange');
      return scheme?.light || '#FFF3E0';
    } else if (column.month === 'January') {
      const scheme = COLOR_SCHEMES.find(s => s.name === 'yellow');
      return scheme?.light || '#FFFDE7';
    } else if (column.month === 'Year') {
      const scheme = COLOR_SCHEMES.find(s => s.name === 'blue');
      return scheme?.light || '#E3F2FD';
    } else if (column.type === 'Budget') {
      const scheme = COLOR_SCHEMES.find(s => s.name === 'green');
      return scheme?.light || '#E8F5E9';
    }
    
    // Default to blue
    const scheme = COLOR_SCHEMES.find(s => s.name === 'blue');
    return scheme?.light || '#E3F2FD';
  }, []);

  // Helper function to get raw value from SQL data
  const getRawValue = (productGroup, metricType, dataColumnIndex) => {
    const metric = productGroup.metrics.find(m => m.type === metricType);
    if (!metric || !metric.data || !metric.data[dataColumnIndex]) {
      return 0;
    }
    return parseFloat(metric.data[dataColumnIndex]) || 0;
  };

  // Helper function to calculate derived metrics
  const calculateDerivedMetric = (productGroup, metricType, dataColumnIndex) => {
    const kgs = getRawValue(productGroup, 'KGS', dataColumnIndex);
    const sales = getRawValue(productGroup, 'Sales', dataColumnIndex);
    const morm = getRawValue(productGroup, 'MoRM', dataColumnIndex);

    switch (metricType) {
      case 'Sls/Kg':
        return kgs > 0 ? sales / kgs : 0;
      case 'RM/kg':
        return kgs > 0 ? (sales - morm) / kgs : 0;
      case 'MoRM/Kg':
        return kgs > 0 ? morm / kgs : 0;
      case 'MoRM %':
        return sales > 0 ? (morm / sales) * 100 : 0;
      default:
      return 0;
    }
  };

  // Helper function to format numbers
  const formatNumber = (value, metricType) => {
    if (value === 0 || isNaN(value)) return '';
    
    if (metricType === 'MoRM %') {
      return `${value.toFixed(1)}%`;
    } else if (['Sls/Kg', 'RM/kg', 'MoRM/Kg'].includes(metricType)) {
      return value.toFixed(2);
    } else {
      return value.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      });
    }
  };

  // Define the metrics to display for each product group
  const metricsToShow = ['KGS', 'Sales', 'MoRM', 'Sls/Kg', 'RM/kg', 'MoRM/Kg', 'MoRM %'];

  // ⚠️ EARLY RETURNS - Must come AFTER all hooks
  // Only show data if Generate button has been clicked AND columns are selected
  if (!dataGenerated || columnOrder.length === 0) {
    return (
      <div className="pg-table-view">
        <h3>Product Group Table</h3>
        <div className="pg-table-empty-state">
          <p>Please select columns and click the Generate button to view product data.</p>
        </div>
      </div>
    );
  }

  // Show loading state for FP division
  if (selectedDivision === 'FP' && loading) {
    return (
      <div className="pg-table-view">
        <h3>Product Group Table</h3>
        <div className="pg-table-empty-state">
          <p>Loading data from database...</p>
        </div>
      </div>
    );
  }

  // Show error state for FP division
  if (selectedDivision === 'FP' && error) {
    return (
      <div className="pg-table-view">
        <h3>Product Group Table</h3>
        <div className="pg-table-empty-state">
          <p style={{ color: 'red' }}>Error: {error}</p>
        </div>
      </div>
    );
  }

  // Sales percentage helpers
  const getSalesFor = (entityWithMetrics, dataIndex) => {
    const salesMetric = entityWithMetrics?.metrics?.find(m => m.type === 'Sales');
    const val = salesMetric && salesMetric.data ? parseFloat(salesMetric.data[dataIndex] || 0) : 0;
    return isNaN(val) ? 0 : val;
  };

  const getTotalSalesAtIndex = (dataIndex) => {
    return sortedProductGroups.reduce((sum, pg) => sum + getSalesFor(pg, dataIndex), 0);
  };

  const calculateSalesPercentageForGroup = (productGroup, dataIndex) => {
    const totalSales = getTotalSalesAtIndex(dataIndex);
    const groupSales = getSalesFor(productGroup, dataIndex);
    return totalSales > 0 ? (groupSales / totalSales) * 100 : 0;
  };

  const calculateSalesPercentageForCategory = (category, dataIndex) => {
    const totalSales = getTotalSalesAtIndex(dataIndex);
    const categorySales = getSalesFor({ metrics: category.metrics }, dataIndex);
    return totalSales > 0 ? (categorySales / totalSales) * 100 : 0;
  };

  // Delta helpers (percentage change, arrows, colors)
  // Smart formula: Always calculates ((Actual - Reference) / Reference) for budget comparisons
  // UNLESS forceYoYCalculation is true, then always use YoY formula
  const calculateDeltaPercentage = (fromValue, toValue, fromType, toType) => {
    // Debug logging - REMOVE AFTER FIX
    
    // Handle NaN values
    if (isNaN(fromValue) || isNaN(toValue)) return 'NONE';
    
    // Handle null/undefined values
    if (fromValue == null || toValue == null) return 'NONE';
    
    // If forceYoYCalculation is enabled, always use YoY formula (newer - older / older)
    if (forceYoYCalculation) {
      // YoY formula: (toValue - fromValue) / fromValue
      const reference = fromValue;
      const actual = toValue;
      
      // Handle zero or no data cases
      if (reference === 0 && actual === 0) {
        return 'NONE';
      }
      
      if (reference === 0) {
        return actual !== 0 ? 'NEW' : 'NONE';
      }
      
      if (actual === 0) {
        return -100;
      }
      
      return ((actual - reference) / Math.abs(reference)) * 100;
    }
    
    // Normal logic (original behavior)
    // Normalize types to handle case variations
    const normalizedFromType = (fromType || '').toString();
    const normalizedToType = (toType || '').toString();
    
    // Determine which value is Actual and which is Reference (Budget/Estimate/Forecast)
    const isFromActual = normalizedFromType.toLowerCase() === 'actual';
    const isToActual = normalizedToType.toLowerCase() === 'actual';
    
    let actual, reference;
    
    if (isFromActual && isToActual) {
      // YoY comparison: newer - older / older
      // Assuming "to" is newer (later period)
      actual = toValue;
      reference = fromValue;
    } else if (isFromActual && !isToActual) {
      // Actual vs Budget/Estimate/Forecast (Actual is "from")
      actual = fromValue;
      reference = toValue;
    } else if (!isFromActual && isToActual) {
      // Budget/Estimate/Forecast vs Actual (Actual is "to")
      actual = toValue;
      reference = fromValue;
    } else {
      // Both are non-Actual (e.g., Budget vs Estimate) - use standard formula
      actual = toValue;
      reference = fromValue;
    }
    
    // Handle zero or no data cases
    if (reference === 0 && actual === 0) {
      // Both periods have no data - show N/A
      return 'NONE';
    }
    
    if (reference === 0) {
      // Reference is zero but actual has data - show "NEW"
      return actual !== 0 ? 'NEW' : 'NONE';
    }
    
    if (actual === 0) {
      // Actual is zero but reference had data - show as -100% decline
      return -100;
    }
    
    return ((actual - reference) / Math.abs(reference)) * 100;
  };

  const formatDelta = (delta) => {
    // Handle null/NONE values (missing data)
    if (delta === null || delta === 'NONE') return '—';
    
    // Handle "NEW" case
    if (delta === 'NEW') return 'NEW';
    
    // Handle zero change
    if (delta === 0) return '0.0%';
    
    const sign = delta > 0 ? '+' : '';
    const formatted = Math.abs(delta) >= 100 ? Math.round(delta) : delta.toFixed(1);
    return `${sign}${formatted}%`;
  };

  const getDeltaColor = (delta) => {
    if (delta === null || delta === 'NONE') return '#666666'; // Gray for N/A
    if (delta === 'NEW') return '#28a745'; // Green for new data
    if (delta === 0) return '#666666'; // Gray for no change
    return delta > 0 ? '#0066cc' : '#cc0000'; // Blue for positive, red for negative
  };

  if (!productGroups.length) {
    return (
      <div className="pg-table-view">
        {!hideHeader && (
          <div className="pg-table-title">
            <h2>Product Group - {selectedDivision || ''}</h2>
            <div className="pg-table-subtitle">(<CurrencySymbol />)</div>
          </div>
        )}
        <div className="pg-table-empty-state" style={{ textAlign: 'center', color: '#666' }}>
          {selectedDivision && selectedDivision !== 'FP' ? (
            <>
              <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>⚒️ Coming Soon</div>
              <p>
                Product Group for {selectedDivision} division is currently under development.
              </p>
              <p style={{ fontStyle: 'italic', marginTop: '6px' }}>
                The database table {selectedDivision.toLowerCase()}_data_excel has been created and is ready for data.
              </p>
            </>
          ) : (
            <p>No product group data available. Please ensure data is loaded.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pg-table-view">
      <div ref={internalTableRef} className="pg-table-container-for-export">
        {!hideHeader && (
          <div className="pg-table-title">
            <h2>Product Group Analysis - {selectedDivision}</h2>
            <div className="pg-table-subtitle">(<CurrencySymbol />)</div>
          </div>
        )}
        <div className="pg-table-container">
          <table className="product-group-table">
            <thead>
              <tr className="main-header-row">
                <th className="empty-header" rowSpan="3" style={{ width: '26%' }}>Product Groups Names</th>
                {extendedColumns.map((col, index) => (
                  col.columnType === 'delta' ? (
                    <th key={`delta-year-${index}`} rowSpan="3" style={{ backgroundColor: '#1976d2', color: '#fbbf24', fontWeight: 'bold' }}>
                      {col.deltaLabel}
                      <br />
                      %
                    </th>
                  ) : (
                    <th
                      key={`year-${index}`}
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
                      style={getColumnHeaderStyle(col)}
                    >
                      {col.type}
                    </th>
                  )
                )).filter(Boolean)}
              </tr>
            </thead>
            <tbody>
              {/* Separator row between headers and body */}
              <tr className="pg-separator-row">
                <td></td>
                {extendedColumns.map((col, index) => (
                  <td key={`separator-${index}`}></td>
                ))}
              </tr>
              {sortedProductGroups.map((productGroup, pgIndex) => (
                <React.Fragment key={`product-group-${pgIndex}`}>
                  {/* Product Group Header Row */}
                  <tr className="product-header-row pg-header-row">
                    <td className="row-label product-header" style={{ 
                      fontWeight: 'bold',
                      color: '#0d47a1',
                      padding: '10px 12px',
                      border: '1px solid #ddd'
                    }}>
                      {productGroup.name}
                          </td>
                    {extendedColumns.map((col, idx) => {
                      if (col.columnType === 'delta') {
                        // Show delta of % of Sales between adjacent periods on header row
                        const fromPct = calculateSalesPercentageForGroup(productGroup, col.fromDataIndex);
                        const toPct = calculateSalesPercentageForGroup(productGroup, col.toDataIndex);
                        const delta = calculateDeltaPercentage(fromPct, toPct, col.fromColumn?.type, col.toColumn?.type);
                        const deltaText = formatDelta(delta);
                        return (
                          <td key={`header-delta-${pgIndex}-${idx}`} className="product-header-cell" style={{ backgroundColor: '#f8f9fa', textAlign: 'center', fontWeight: 'bold', fontSize: '12px', color: getDeltaColor(delta) }}>
                            {deltaText}
                          </td>
                        );
                      }
                      const pct = calculateSalesPercentageForGroup(productGroup, col.dataIndex);
                      return (
                        <td key={`header-${pgIndex}-${idx}`} className="product-header-cell" style={{ backgroundColor: getCellBackgroundColor(col), textAlign: 'center', fontSize: '13px', color: '#000', fontWeight: 'bold', padding: '8px 4px' }}>
                          {pct.toFixed(2)}% of Sls
                        </td>
                      );
                    })}
                  </tr>
                  
                  {/* Metrics Rows */}
                  {metricsToShow.map((metricType, metricIndex) => {
                    // Hide weight-related metrics for Services Charges
                    if (productGroup.name && productGroup.name.toString().trim().toLowerCase() === 'services charges' && 
                        ['KGS', 'Sls/Kg', 'RM/kg', 'MoRM/Kg'].includes(metricType)) {
                      return null;
                    }
                    
                    return (
                    <tr key={`${productGroup.name}-${metricType}`} className="metric-row">
                      <td className="row-label metric-label" style={{ 
                        fontWeight: '500',
                        color: '#333',
                                fontSize: '13px',
                        padding: '6px 12px'
                              }}>
                        {metricType}
                          </td>
                      {extendedColumns.map((col, idx) => {
                        if (col.columnType === 'delta') {
                          // Delta between adjacent data columns for this metric
                          const fromVal = ['KGS', 'Sales', 'MoRM'].includes(metricType)
                            ? getRawValue(productGroup, metricType, col.fromDataIndex)
                            : calculateDerivedMetric(productGroup, metricType, col.fromDataIndex);
                          const toVal = ['KGS', 'Sales', 'MoRM'].includes(metricType)
                            ? getRawValue(productGroup, metricType, col.toDataIndex)
                            : calculateDerivedMetric(productGroup, metricType, col.toDataIndex);
                          const delta = calculateDeltaPercentage(fromVal, toVal, col.fromColumn?.type, col.toColumn?.type);
                          const deltaText = formatDelta(delta);
                          const color = getDeltaColor(delta);
                          return (
                            <td key={`delta-${metricType}-${idx}`} className="metric-cell delta-cell" style={{ backgroundColor: '#f8f9fa', textAlign: 'center', fontWeight: 'bold', fontSize: '11px', color }}>
                              {deltaText}
                            </td>
                          );
                        }
                        // Data column
                        const dataColumnIndex = col.dataIndex;
                          let value;
                          if (['KGS', 'Sales', 'MoRM'].includes(metricType)) {
                          value = getRawValue(productGroup, metricType, dataColumnIndex);
                          } else {
                          value = calculateDerivedMetric(productGroup, metricType, dataColumnIndex);
                          }
                          return (
                          <td key={`${metricType}-${idx}`} className="metric-cell" style={{ backgroundColor: getCellBackgroundColor(col), textAlign: 'center', padding: '6px 4px', minWidth: '120px', maxWidth: '120px', whiteSpace: 'nowrap' }}>
                              {formatNumber(value, metricType)}
                            </td>
                          );
                      })}
                    </tr>
                    );
                  }).filter(Boolean)}
                </React.Fragment>
              ))}

              {/* Total Section - header + metric rows */}
              {(() => {
                const totalsByMetric = (metricType, dataIndex) => {
                  if (['KGS', 'Sales', 'MoRM'].includes(metricType)) {
                    return sortedProductGroups.reduce((sum, pg) => sum + getRawValue(pg, metricType, dataIndex), 0);
                  }
                  // Derived based on totals
                  const totalKgs = sortedProductGroups.reduce((sum, pg) => sum + getRawValue(pg, 'KGS', dataIndex), 0);
                  const totalSales = sortedProductGroups.reduce((sum, pg) => sum + getRawValue(pg, 'Sales', dataIndex), 0);
                  const totalMorm = sortedProductGroups.reduce((sum, pg) => sum + getRawValue(pg, 'MoRM', dataIndex), 0);
                  switch (metricType) {
                    case 'Sls/Kg':
                      return totalKgs > 0 ? totalSales / totalKgs : 0;
                    case 'RM/kg':
                      return totalKgs > 0 ? (totalSales - totalMorm) / totalKgs : 0;
                    case 'MoRM/Kg':
                      return totalKgs > 0 ? totalMorm / totalKgs : 0;
                    case 'MoRM %':
                      return totalSales > 0 ? (totalMorm / totalSales) * 100 : 0;
                    default:
                      return 0;
                  }
                };
                return (
                  <React.Fragment key="totals-section">
                    <tr className="product-header-row total-header-row">
                      <td className="row-label product-header">Total</td>
                      {extendedColumns.map((col, idx) => (
                        col.columnType === 'delta' ? (
                          <td key={`totals-header-delta-${idx}`} className="product-header-cell" style={{ backgroundColor: '#f8f9fa' }}></td>
                        ) : (
                          <td key={`totals-header-${idx}`} className="product-header-cell" style={{ backgroundColor: getCellBackgroundColor(col) }}></td>
                        )
                      ))}
                    </tr>
                    {metricsToShow.map((metricType) => (
                      <tr key={`totals-${metricType}`} className="metric-row total-metric-row">
                        <td className="row-label metric-label">{metricType}</td>
                        {extendedColumns.map((col, idx) => {
                          if (col.columnType === 'delta') {
                            const fromVal = totalsByMetric(metricType, col.fromDataIndex);
                            const toVal = totalsByMetric(metricType, col.toDataIndex);
                            const delta = calculateDeltaPercentage(fromVal, toVal, col.fromColumn?.type, col.toColumn?.type);
                            return (
                              <td key={`totals-delta-${metricType}-${idx}`} className="metric-cell delta-cell" style={{ color: getDeltaColor(delta) }}>{formatDelta(delta)}</td>
                            );
                          }
                          const val = totalsByMetric(metricType, col.dataIndex);
                          return (
                            <td key={`totals-${metricType}-${idx}`} className="metric-cell" style={{ backgroundColor: getCellBackgroundColor(col), fontWeight: 'bold' }}>
                              {formatNumber(val, metricType)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })()}

              {/* Process Categories will be rendered after Material Categories */}

              {/* Material Categories (each with header + full metrics) */}
              {sqlData.materialCategories && sqlData.materialCategories.length > 0 && (
                <>
                  {sortOthersLast(sqlData.materialCategories).map((cat) => (
                    <React.Fragment key={`mat-${cat.name}`}>
                      <tr className="product-header-row category-header-row material-header-row">
                        <td className="row-label product-header">{cat.name}</td>
                        {extendedColumns.map((col, idx) => {
                          if (col.columnType === 'delta') {
                            const fromPct = calculateSalesPercentageForCategory(cat, col.fromDataIndex);
                            const toPct = calculateSalesPercentageForCategory(cat, col.toDataIndex);
                            const delta = calculateDeltaPercentage(fromPct, toPct, col.fromColumn?.type, col.toColumn?.type);
                            return (
                              <td key={`mat-header-delta-${cat.name}-${idx}`} className="product-header-cell" style={{ backgroundColor: '#f8f9fa', fontWeight: 'bold', color: getDeltaColor(delta) }}>
                                {formatDelta(delta)}
                              </td>
                            );
                          }
                          return (
                            <td key={`mat-header-${cat.name}-${idx}`} className="product-header-cell" style={{ backgroundColor: getCellBackgroundColor(col), textAlign: 'center', fontWeight: 'bold' }}>
                              {calculateSalesPercentageForCategory(cat, col.dataIndex).toFixed(2)}% of Sls
                            </td>
                          );
                        })}
                      </tr>
                      {metricsToShow.map((metricType) => (
                        <tr key={`mat-${cat.name}-${metricType}`} className="metric-row category-metric-row">
                          <td className="row-label metric-label">{metricType}</td>
                          {extendedColumns.map((col, idx) => {
                            if (col.columnType === 'delta') {
                              const fromVal = ['KGS','Sales','MoRM'].includes(metricType)
                                ? getRawValue({ metrics: cat.metrics }, metricType, col.fromDataIndex)
                                : calculateDerivedMetric({ metrics: cat.metrics }, metricType, col.fromDataIndex);
                              const toVal = ['KGS','Sales','MoRM'].includes(metricType)
                                ? getRawValue({ metrics: cat.metrics }, metricType, col.toDataIndex)
                                : calculateDerivedMetric({ metrics: cat.metrics }, metricType, col.toDataIndex);
                              const delta = calculateDeltaPercentage(fromVal, toVal, col.fromColumn?.type, col.toColumn?.type);
                              return (
                                <td key={`mat-delta-${cat.name}-${metricType}-${idx}`} className="metric-cell delta-cell" style={{ color: getDeltaColor(delta) }}>{formatDelta(delta)}</td>
                              );
                            }
                            const val = ['KGS','Sales','MoRM'].includes(metricType)
                              ? getRawValue({ metrics: cat.metrics }, metricType, col.dataIndex)
                              : calculateDerivedMetric({ metrics: cat.metrics }, metricType, col.dataIndex);
                            return (
                              <td key={`mat-${cat.name}-${metricType}-${idx}`} className="metric-cell" style={{ backgroundColor: getCellBackgroundColor(col) }}>
                                {formatNumber(val, metricType)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </>
              )}

              {/* Process Categories (each with header + full metrics) */}
              {sqlData.processCategories && sqlData.processCategories.length > 0 && (
                <>
                  {sortOthersLast(sqlData.processCategories).map((cat) => (
                    <React.Fragment key={`proc-${cat.name}`}>
                      <tr className="product-header-row category-header-row process-header-row">
                        <td className="row-label product-header">{cat.name}</td>
                        {extendedColumns.map((col, idx) => {
                          if (col.columnType === 'delta') {
                            const fromPct = calculateSalesPercentageForCategory(cat, col.fromDataIndex);
                            const toPct = calculateSalesPercentageForCategory(cat, col.toDataIndex);
                            const delta = calculateDeltaPercentage(fromPct, toPct, col.fromColumn?.type, col.toColumn?.type);
                            return (
                              <td key={`proc-header-delta-${cat.name}-${idx}`} className="product-header-cell" style={{ backgroundColor: '#f8f9fa', fontWeight: 'bold', color: getDeltaColor(delta) }}>
                                {formatDelta(delta)}
                              </td>
                            );
                          }
                          return (
                            <td key={`proc-header-${cat.name}-${idx}`} className="product-header-cell" style={{ backgroundColor: getCellBackgroundColor(col), textAlign: 'center', fontWeight: 'bold' }}>
                              {calculateSalesPercentageForCategory(cat, col.dataIndex).toFixed(2)}% of Sls
                            </td>
                          );
                        })}
                      </tr>
                      {metricsToShow.map((metricType) => (
                        <tr key={`proc-${cat.name}-${metricType}`} className="metric-row category-metric-row">
                          <td className="row-label metric-label">{metricType}</td>
                          {extendedColumns.map((col, idx) => {
                            if (col.columnType === 'delta') {
                              const fromVal = ['KGS','Sales','MoRM'].includes(metricType)
                                ? getRawValue({ metrics: cat.metrics }, metricType, col.fromDataIndex)
                                : calculateDerivedMetric({ metrics: cat.metrics }, metricType, col.fromDataIndex);
                              const toVal = ['KGS','Sales','MoRM'].includes(metricType)
                                ? getRawValue({ metrics: cat.metrics }, metricType, col.toDataIndex)
                                : calculateDerivedMetric({ metrics: cat.metrics }, metricType, col.toDataIndex);
                              const delta = calculateDeltaPercentage(fromVal, toVal, col.fromColumn?.type, col.toColumn?.type);
                              return (
                                <td key={`proc-delta-${cat.name}-${metricType}-${idx}`} className="metric-cell delta-cell" style={{ color: getDeltaColor(delta) }}>{formatDelta(delta)}</td>
                              );
                            }
                            const val = ['KGS','Sales','MoRM'].includes(metricType)
                              ? getRawValue({ metrics: cat.metrics }, metricType, col.dataIndex)
                              : calculateDerivedMetric({ metrics: cat.metrics }, metricType, col.dataIndex);
                            return (
                              <td key={`proc-${cat.name}-${metricType}-${idx}`} className="metric-cell" style={{ backgroundColor: getCellBackgroundColor(col) }}>
                                {formatNumber(val, metricType)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </>
              )}

              {/* Substrated MT Used or Required Section - calculates raw material requirements */}
              {Object.keys(materialPercentages).length > 0 && sortedProductGroups.length > 0 && (() => {
                // Substrate types to display
                const substrateTypes = ['PE', 'PP', 'PET', 'Alu', 'Paper', 'PVC/PET', 'Mix'];
                
                // Calculate substrate requirements for each data column (result in MT)
                const calculateSubstrateForColumn = (substrateType, dataIndex) => {
                  let total = 0;
                  sortedProductGroups.forEach(pg => {
                    const pgName = (pg.name || '').toLowerCase().trim();
                    const percentages = materialPercentages[pgName];
                    if (percentages) {
                      const kgs = getRawValue(pg, 'KGS', dataIndex);
                      const percentage = percentages[substrateType] || 0;
                      // Convert KGS to MT (÷1000) then apply percentage
                      total += (kgs / 1000) * percentage / 100;
                    }
                  });
                  return total;
                };
                
                // Calculate total substrate across all types for a column
                const calculateTotalSubstrateForColumn = (dataIndex) => {
                  return substrateTypes.reduce((sum, subType) => 
                    sum + calculateSubstrateForColumn(subType, dataIndex), 0);
                };
                
                return (
                  <>
                    {/* Substrated MT Used or Required Header */}
                    <tr className="product-header-row substrate-header-row" style={{ borderTop: '3px solid #1976d2' }}>
                      <td className="row-label product-header" style={{ 
                        fontWeight: 'bold', 
                        color: '#1565c0',
                        fontSize: '14px'
                      }}>
                        Substrated MT Used or Required
                      </td>
                      {extendedColumns.map((col, idx) => (
                        col.columnType === 'delta' ? (
                          <td key={`substrate-header-delta-${idx}`} className="product-header-cell" style={{ backgroundColor: '#f8f9fa' }}></td>
                        ) : (
                          <td key={`substrate-header-${idx}`} className="product-header-cell" style={{ 
                            backgroundColor: getCellBackgroundColor(col), 
                            textAlign: 'center', 
                            fontWeight: 'bold' 
                          }}>
                          </td>
                        )
                      ))}
                    </tr>
                    
                    {/* Individual substrate rows */}
                    {substrateTypes.map((substrateType) => (
                      <tr key={`substrate-${substrateType}`} className="metric-row substrate-metric-row">
                        <td className="row-label metric-label" style={{ paddingLeft: '12px' }}>{substrateType}</td>
                        {extendedColumns.map((col, idx) => {
                          if (col.columnType === 'delta') {
                            const fromVal = calculateSubstrateForColumn(substrateType, col.fromDataIndex);
                            const toVal = calculateSubstrateForColumn(substrateType, col.toDataIndex);
                            const delta = calculateDeltaPercentage(fromVal, toVal, col.fromColumn?.type, col.toColumn?.type);
                            return (
                              <td key={`substrate-delta-${substrateType}-${idx}`} className="metric-cell delta-cell" style={{ color: getDeltaColor(delta) }}>
                                {formatDelta(delta)}
                              </td>
                            );
                          }
                          const val = calculateSubstrateForColumn(substrateType, col.dataIndex);
                          return (
                            <td key={`substrate-${substrateType}-${idx}`} className="metric-cell" style={{ backgroundColor: getCellBackgroundColor(col) }}>
                              {Math.round(val).toLocaleString()}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});

export default ProductGroupTable;