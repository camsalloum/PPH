import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { useFilter } from '../../contexts/FilterContext';
import { useExcelData } from '../../contexts/ExcelDataContext';
import CurrencySymbol from './CurrencySymbol';
import './SalesBySalesRepTable.css'; // Use the correct CSS file
import { COLOR_SCHEMES } from './utils/FinancialConstants';
import { getColumnColorPalette } from './utils/colorUtils';

/**
 * Sales by Sales Rep Divisional - Duplicated from Sales by Customer
 * Shows sales rep performance data instead of customer data
 */

const SalesBySalesRepDivisional = ({ hideHeader = false }) => {
  const { columnOrder, dataGenerated, basePeriodIndex: contextBasePeriodIndex } = useFilter();
  const { selectedDivision } = useExcelData();
  const tableRef = useRef(null);

  const [salesReps, setSalesReps] = useState([]);                 // final labels for sales reps
  const [salesRepData, setSalesRepData] = useState({});           // raw API rows per columnKey
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ---------- helpers ----------
  const norm = (s) => (s || '').toString().trim().toLowerCase();

  // Extract sales reps from the loaded sales data (not from master list)
  // Only include sales reps that have non-zero sales in at least one period
  const extractSalesRepsFromData = (salesDataMap) => {
    const salesRepTotals = {};

    // Calculate total sales across all periods for each sales rep
    Object.values(salesDataMap).forEach(columnData => {
      Object.keys(columnData).forEach(salesRep => {
        if (!salesRepTotals[salesRep]) {
          salesRepTotals[salesRep] = 0;
        }
        salesRepTotals[salesRep] += Math.abs(columnData[salesRep]?.sales || 0);
      });
    });

    // Only include sales reps with non-zero total sales
    return Object.keys(salesRepTotals).filter(salesRep => salesRepTotals[salesRep] > 0);
  };

  const toProperCase = (str) => {
    if (!str) return '';
    return str
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // ============================================================================
  // DYNAMIC DELTA LABEL - Determines correct label based on column types
  // YoY = Actual vs Actual ONLY | Vs Budget/Est/Fcst for other comparisons
  // ============================================================================
  const getDeltaLabel = (fromCol, toCol) => {
    const fromType = (fromCol?.type || 'Actual').toLowerCase();
    const toType = (toCol?.type || 'Actual').toLowerCase();
    
    // Both Actual = YoY %
    if (fromType === 'actual' && toType === 'actual') {
      return 'YoY';
    }
    
    // Actual vs Budget/Estimate/Forecast - label based on reference type
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
    
    // Budget vs Estimate, etc. - use generic delta
    return 'Δ';
  };

  // Build extended columns once per inputs
  const extendedColumns = useMemo(() => {
    const filteredColumns = columnOrder.filter(col => {
      return true;
    });

    const out = [];
    filteredColumns.forEach((col, index) => {
      out.push(col);
      if (index < filteredColumns.length - 1) {
        const fromCol = col;
        const toCol = filteredColumns[index + 1];
        out.push({
          columnType: 'delta',
          fromColumn: fromCol,
          toColumn: toCol,
          deltaLabel: getDeltaLabel(fromCol, toCol)  // Dynamic label based on types
        });
      }
    });
    return out;
  }, [columnOrder]);

  const dataColumnsOnly = useMemo(() => extendedColumns.filter(c => c.columnType !== 'delta'), [extendedColumns]);

  // Compute the effective base period index after filtering, preserving the original period selection
  const effectiveBasePeriodIndex = useMemo(() => {
    if (contextBasePeriodIndex === null || contextBasePeriodIndex < 0) return 0;
    if (dataColumnsOnly.length === 0) return 0;
    
    // Get the original base period column from the full columnOrder
    if (contextBasePeriodIndex >= columnOrder.length) return 0;
    
    const originalBaseColumn = columnOrder[contextBasePeriodIndex];
    
    // Find this same period in the filtered dataColumnsOnly array
    const filteredIndex = dataColumnsOnly.findIndex(col => 
      col.year === originalBaseColumn.year &&
      col.month === originalBaseColumn.month &&
      col.type === originalBaseColumn.type
    );
    
    // If the base period was filtered out (e.g., it was Budget/Forecast and now hidden),
    // fall back to the first available period
    return filteredIndex >= 0 ? filteredIndex : 0;
  }, [contextBasePeriodIndex, columnOrder, dataColumnsOnly]);

  // Helper function for column keys
  const getColumnKey = (column) => column.id || `${column.year}-${column.month}-${column.type}`;

  // Create stable string key for columns to avoid unnecessary re-renders
  const columnsKey = useMemo(() => 
    dataColumnsOnly.map(c => getColumnKey(c)).join(','), 
    [dataColumnsOnly]
  );

  // Calculate column widths
  const columnWidths = useMemo(() => {
    const totalDataColumns = dataColumnsOnly.length;
    const totalDeltaColumns = extendedColumns.length - totalDataColumns;
    const totalColumns = 1 + totalDataColumns + totalDeltaColumns; // 1 for sales rep column

    const salesRepColumnWidth = 18; // 18% for sales rep name
    const remainingWidth = 82; // 82% for data columns and deltas
    
    // Calculate delta width: 4.5% each (reduced by 10%)
    const deltaWidth = 4.5;
    const totalDeltaWidth = deltaWidth * totalDeltaColumns;
    
    // Remaining width for data columns
    const dataColumnWidth = (remainingWidth - totalDeltaWidth) / totalDataColumns;

    return {
      salesRep: salesRepColumnWidth,
      value: dataColumnWidth * 0.7, // 70% of data column for value
      percent: dataColumnWidth * 0.3, // 30% of data column for percentage
      delta: deltaWidth, // Fixed 4.5% for delta
      totalColumns
    };
  }, [dataColumnsOnly, extendedColumns]);


  // Fetch sales rep data - simplified approach
  const fetchSalesRepData = useCallback(async () => {
    if (!dataGenerated || !selectedDivision) return;
    
    setLoading(true);
    setError(null);

    try {
      // 1) Load grouping rules for this division (for aggregation only)
      // Note: We'll extract actual sales reps from the data, not from a master list
      const groupsResponse = await fetch(`/api/sales-rep-groups-universal?division=${encodeURIComponent(selectedDivision)}`);
      const groupsPayload = await groupsResponse.json();
      const rawGroups = (groupsPayload && groupsPayload.success && groupsPayload.data) ? groupsPayload.data : {};

      // Store groups for later aggregation (names normalized to uppercase)
      const groups = {};
      Object.keys(rawGroups).forEach(groupName => {
        const members = Array.isArray(rawGroups[groupName]) ? rawGroups[groupName] : [];
        const normalized = Array.from(new Set(
          members
            .filter(Boolean)
            .map(m => String(m).trim().toUpperCase())
        ));
        groups[groupName] = normalized;
      });
      
      // ULTRA-OPTIMIZED: Single super-fast API call for ALL data at once
      const salesRepDataMap = {};
      
      // Get all sales reps from database (we'll filter to those with sales later)
      let allSalesReps = [];
      
      try {
        const allSalesRepsResponse = await fetch(`/api/sales-reps-universal?division=${encodeURIComponent(selectedDivision)}`);
        const allSalesRepsData = await allSalesRepsResponse.json();
        allSalesReps = (allSalesRepsData.success && allSalesRepsData.data) 
          ? allSalesRepsData.data.map(r => String(r).trim().toUpperCase())
          : [];

        // Single ULTRA-FAST API call for all data
        
        const response = await fetch('/api/sales-rep-divisional-ultra-fast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            division: selectedDivision,
            salesReps: Array.from(allSalesReps),
            columns: dataColumnsOnly.map(column => ({
              year: column.year,
              month: column.month,
              months: column.months, // ✅ Include custom month ranges
              type: column.type || 'Actual',
              columnKey: getColumnKey(column)
            }))
          })
        });
        

        const result = await response.json();
        
        const sampleEntries = Object.entries(result.data || {}).slice(0, 3);
        sampleEntries.forEach(([salesRep, data]) => {
        });
        
        if (result.success && result.data) {
          // Process the ultra-fast response
          const ultraFastData = result.data;
          
          // Organize data by column - store individual sales rep data
          dataColumnsOnly.forEach(column => {
            const columnKey = getColumnKey(column);
            salesRepDataMap[columnKey] = {};
            
            // Store data for each sales rep (including zero and negative values)
            Object.keys(ultraFastData).forEach(salesRep => {
              const salesValue = ultraFastData[salesRep]?.[columnKey] || 0;
              salesRepDataMap[columnKey][salesRep] = { sales: salesValue };
            });
          });
          
          // Extract sales reps from the loaded data (all sales reps, including zero and negative)
          const salesRepsWithData = extractSalesRepsFromData(salesRepDataMap);
          
          // Build display entities: groups (if any member exists in data) + standalone reps
          const displayEntities = [];
          const groupedMembers = new Set();
          
          // Add groups where at least one member exists in the data
          // OR the group name itself exists in data (for budget pre-aggregated names like "OTHERS")
          Object.keys(groups).forEach(groupName => {
            const members = groups[groupName];
            const upperGroupName = groupName.toUpperCase();
            const hasData = members.some(member => salesRepsWithData.includes(member)) ||
                           salesRepsWithData.includes(upperGroupName);
            if (hasData) {
              displayEntities.push(groupName);
              members.forEach(m => groupedMembers.add(m));
              // Also mark the group name itself as grouped (for budget pre-aggregated names)
              groupedMembers.add(upperGroupName);
            }
          });
          
          // Add standalone sales reps (those not in any group)
          salesRepsWithData.forEach(salesRep => {
            if (!groupedMembers.has(salesRep)) {
              displayEntities.push(salesRep);
            }
          });
          

          // Now aggregate group data
          dataColumnsOnly.forEach(column => {
            const columnKey = getColumnKey(column);
            const columnData = salesRepDataMap[columnKey];
            const aggregatedData = {};

            displayEntities.forEach(entityName => {
              const members = Array.isArray(groups[entityName]) && groups[entityName].length > 0
                ? groups[entityName]
                : [entityName];

              // Sum across all members of the group
              let groupTotal = 0;
              const membersProcessed = new Set();
              members.forEach(member => {
                const upperMember = member.toUpperCase();
                const salesValue = columnData[member]?.sales || columnData[upperMember]?.sales || 0;
                groupTotal += salesValue;
                membersProcessed.add(upperMember);
              });
              
              // For actual groups (not standalone reps), also check pre-aggregated group name
              // e.g., "OTHERS" in budget data. Only add if group name wasn't already counted as member.
              const isActualGroup = Array.isArray(groups[entityName]) && groups[entityName].length > 0;
              if (isActualGroup) {
                const upperGroupName = entityName.toUpperCase();
                // Only add group name value if it wasn't already counted as a member
                if (!membersProcessed.has(upperGroupName) && columnData[upperGroupName]?.sales) {
                  groupTotal += columnData[upperGroupName].sales;
                }
              }

              aggregatedData[entityName] = { sales: groupTotal };
            });

            salesRepDataMap[columnKey] = aggregatedData;
          });

          // Filter out sales reps/groups with total negative sales (< 0)
          // Calculate total sales across all periods for each entity
          const entityTotals = {};
          displayEntities.forEach(entityName => {
            let totalSales = 0;
            dataColumnsOnly.forEach(column => {
              const columnKey = getColumnKey(column);
              const salesValue = salesRepDataMap[columnKey]?.[entityName]?.sales || 0;
              totalSales += salesValue;
            });
            entityTotals[entityName] = totalSales;
          });


          // Show all entities - negative totals are already aggregated in their group leader's totals
          setSalesReps(displayEntities);
          setSalesRepData(salesRepDataMap);
          setLoading(false);
          return; // Exit early - ultra-fast path complete
        } else {
          throw new Error(result.message || 'Ultra-fast API call failed');
        }
      } catch (err) {
        console.error('Ultra-fast API call failed, falling back to individual queries:', err);
        
        // Fallback: Query each sales rep individually
        // First, get all sales reps from database
        for (const salesRep of allSalesReps) {
          for (const column of dataColumnsOnly) {
            const columnKey = getColumnKey(column);
            
            // Initialize column in map if not exists
            if (!salesRepDataMap[columnKey]) {
              salesRepDataMap[columnKey] = {};
            }
            
            let months = [];
            if (column.months && Array.isArray(column.months)) {
              months = column.months;
            } else if (column.month === 'Q1') {
              months = [1,2,3];
            } else if (column.month === 'Q2') {
              months = [4,5,6];
            } else if (column.month === 'Q3') {
              months = [7,8,9];
            } else if (column.month === 'Q4') {
              months = [10,11,12];
            } else if (column.month === 'Year') {
              months = [1,2,3,4,5,6,7,8,9,10,11,12];
            } else if (column.month === 'HY1') {
              months = [1,2,3,4,5,6];
            } else if (column.month === 'HY2') {
              months = [7,8,9,10,11,12];
            } else {
              const monthMap = { 'January':1,'February':2,'March':3,'April':4,'May':5,'June':6,'July':7,'August':8,'September':9,'October':10,'November':11,'December':12 };
              months = [monthMap[column.month] || 1];
            }
            
            try {
              const response = await fetch('/api/sales-by-customer-db', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  division: selectedDivision,
                  salesRep: salesRep,
                  year: column.year,
                  months,
                  dataType: column.type || 'Actual'
                })
              });
              const result = await response.json();
              if (result.success && Array.isArray(result.data)) {
                const total = result.data.reduce((sum, customer) => sum + (customer.value || 0), 0);
                // Include all values (including zero and negative)
                salesRepDataMap[columnKey][salesRep] = { sales: total };
              }
            } catch (err) {
              console.warn(`Error fetching data for sales rep ${salesRep}, period ${column.year}-${column.month}-${column.type}:`, err);
            }
          }
        }
        
        // Extract all sales reps and build display entities
        const salesRepsWithData = extractSalesRepsFromData(salesRepDataMap);
        
        // Build display entities from all sales reps
        const displayEntities = [];
        const groupedMembers = new Set();
        
        // Add groups where at least one member has sales
        // OR the group name itself exists in data (for budget pre-aggregated names like "OTHERS")
        Object.keys(groups).forEach(groupName => {
          const members = groups[groupName];
          const upperGroupName = groupName.toUpperCase();
          const hasData = members.some(member => salesRepsWithData.includes(member)) ||
                         salesRepsWithData.includes(upperGroupName);
          if (hasData) {
            displayEntities.push(groupName);
            members.forEach(m => groupedMembers.add(m));
            // Also mark the group name itself as grouped (for budget pre-aggregated names)
            groupedMembers.add(upperGroupName);
          }
        });
        
        // Add standalone sales reps (those not in any group)
        salesRepsWithData.forEach(salesRep => {
          if (!groupedMembers.has(salesRep)) {
            displayEntities.push(salesRep);
          }
        });
        
        // Aggregate group data
        dataColumnsOnly.forEach(column => {
          const columnKey = getColumnKey(column);
          const columnData = salesRepDataMap[columnKey] || {};
          const aggregatedData = {};
          
          displayEntities.forEach(entityName => {
            const members = Array.isArray(groups[entityName]) && groups[entityName].length > 0
              ? groups[entityName]
              : [entityName];
            
            // Sum across all members of the group
            let groupTotal = 0;
            const membersProcessed = new Set();
            members.forEach(member => {
              const upperMember = member.toUpperCase();
              const salesValue = columnData[member]?.sales || columnData[upperMember]?.sales || 0;
              groupTotal += salesValue;
              membersProcessed.add(upperMember);
            });
            
            // For actual groups (not standalone reps), also check pre-aggregated group name
            // Only add if group name wasn't already counted as a member
            const isActualGroup = Array.isArray(groups[entityName]) && groups[entityName].length > 0;
            if (isActualGroup) {
              const upperGroupName = entityName.toUpperCase();
              if (!membersProcessed.has(upperGroupName) && columnData[upperGroupName]?.sales) {
                groupTotal += columnData[upperGroupName].sales;
              }
            }
            
            aggregatedData[entityName] = { sales: groupTotal };
          });
          
          salesRepDataMap[columnKey] = aggregatedData;
        });
        
        setSalesReps(displayEntities);
        // Include _allEntities for fallback path (same as displayEntities since no filtering)
        setSalesRepData({
          ...salesRepDataMap,
          _allEntities: displayEntities
        });
      }
      
    } catch (err) {
      console.error('Error fetching sales rep data:', err);
      setError('Failed to fetch sales rep data: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [dataGenerated, selectedDivision, columnsKey, dataColumnsOnly]);

  // Load data when dependencies change
  useEffect(() => {
    fetchSalesRepData();
  }, [fetchSalesRepData]);

  // Get sales rep value for a specific column
  const getSalesRepValue = useCallback((salesRep, column) => {
    const key = getColumnKey(column);
    const columnData = salesRepData[key];
    if (!columnData || !columnData[salesRep]) return 0;
    return columnData[salesRep].sales || 0;
  }, [salesRepData]);

  // Calculate delta with SMART formula based on comparison type
  // Formula: Actual vs Budget/Est/Fcst = ((Actual - Reference) / Reference) × 100
  const calculateDelta = (newerValue, olderValue, fromColType, toColType) => {
    const fromType = (fromColType || 'Actual').toLowerCase();
    const toType = (toColType || 'Actual').toLowerCase();
    
    let actualValue, referenceValue;
    
    // Smart formula selection based on comparison types
    if (toType === 'actual' && fromType !== 'actual') {
      // Comparing TO Actual FROM Budget/Est/Fcst: ((Actual - Ref) / Ref)
      actualValue = newerValue;
      referenceValue = olderValue;
    } else if (fromType === 'actual' && toType !== 'actual') {
      // Comparing FROM Actual TO Budget/Est/Fcst: ((Actual - Ref) / Ref)
      actualValue = olderValue;
      referenceValue = newerValue;
    } else {
      // Both same type (Actual vs Actual = YoY): ((newer - older) / older)
      actualValue = newerValue;
      referenceValue = olderValue;
    }
    
    // Handle zero denominator
    if (referenceValue === 0) {
      if (actualValue > 0) return 'NEW';
      if (actualValue === 0) return 'NONE';
      return -100;
    }
    
    return ((actualValue - referenceValue) / referenceValue) * 100;
  };

  // Format delta for display
  const formatDelta = (delta) => {
    if (isNaN(delta)) return '—';
    if (delta === 'NEW') return '🆕 NEW';
    if (delta === 'NONE') return '—';
    if (delta === 0) return '0.0%';
    const sign = delta > 0 ? '+' : '';
    const formatted = Math.abs(delta) >= 100 ? Math.round(delta) : delta.toFixed(1);
    return `${sign}${formatted}%`;
  };

  // Format percentage for display
  const formatPercentage = (percentage) => {
    if (isNaN(percentage) || percentage === null || percentage === undefined) return '0.0%';
    return `${percentage.toFixed(1)}%`;
  };

  // Get delta color
  const getDeltaColor = (delta) => {
    if (isNaN(delta)) return '#666666';
    if (delta === 'NEW') return '#059669'; // Green for new data
    if (delta === 'NONE') return '#6b7280'; // Gray for no activity
    if (delta === 0) return '#666666'; // Gray for no change
    return delta > 0 ? '#0066cc' : '#cc0000'; // Blue for positive, red for negative
  };

  // Color schemes for different periods
  const getColumnHeaderStyle = (column) => {
    if (!column) {
      return { background: 'linear-gradient(135deg, #3b82f6, #1e40af)', color: '#FFFFFF', fontWeight: 'bold' };
    }
    if (column.customColor || column.customColorHex) {
      const palette = getColumnColorPalette(column);
      return {
        background: palette.gradient,
        color: palette.text,
        fontWeight: 'bold'
      };
    }
    if (['Q1','Q2','Q3','Q4'].includes(column.month)) {
      return { background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#000000', fontWeight: 'bold' };
    } else if (column.month === 'January') {
      return { background: 'linear-gradient(135deg, #fbbf24, #d97706)', color: '#000000', fontWeight: 'bold' };
    } else if (column.month === 'Year') {
      return { background: 'linear-gradient(135deg, #3b82f6, #1e40af)', color: '#FFFFFF', fontWeight: 'bold' };
    } else if (column.type === 'Budget') {
      return { background: 'linear-gradient(135deg, #059669, #047857)', color: '#FFFFFF', fontWeight: 'bold' };
    }
    return { background: 'linear-gradient(135deg, #3b82f6, #1e40af)', color: '#FFFFFF', fontWeight: 'bold' };
  };

  const getCellBackgroundColor = (column) => {
    if (column?.customColor || column?.customColorHex) {
      const palette = getColumnColorPalette(column);
      if (palette.light) return palette.light;
    }
    if (['Q1','Q2','Q3','Q4'].includes(column?.month)) {
      const scheme = COLOR_SCHEMES.find(s => s.name === 'orange');
      return scheme?.light || '#FFF3E0';
    } else if (column?.month === 'January') {
      const scheme = COLOR_SCHEMES.find(s => s.name === 'yellow');
      return scheme?.light || '#FFFDE7';
    } else if (column?.month === 'Year') {
      const scheme = COLOR_SCHEMES.find(s => s.name === 'blue');
      return scheme?.light || '#E3F2FD';
    } else if (column?.type === 'Budget') {
      const scheme = COLOR_SCHEMES.find(s => s.name === 'green');
      return scheme?.light || '#E8F5E9';
    }
    const scheme = COLOR_SCHEMES.find(s => s.name === 'blue');
    return scheme?.light || '#E3F2FD';
  };

  // Check if column is base period (unused but kept for potential future use)
  // const isBasePeriodColumn = (dataIdx) => {
  //   return dataIdx === effectiveBasePeriodIndex;
  // };

  // Sort sales reps by base period value (descending) - show all sales reps regardless of value
  const sortedSalesReps = useMemo(() => {
    if (dataColumnsOnly.length === 0) return salesReps;
    
    const baseColumn = dataColumnsOnly[effectiveBasePeriodIndex];
    if (!baseColumn) return salesReps;
    
    // Show all sales reps (including zero and negative values)
    return salesReps.sort((a, b) => {
      // "Others" should always be at the end
      if (a.toLowerCase().includes('others')) return 1;
      if (b.toLowerCase().includes('others')) return -1;
      
      const valueA = getSalesRepValue(a, baseColumn);
      const valueB = getSalesRepValue(b, baseColumn);
      return valueB - valueA; // Descending order
    });
  }, [salesReps, dataColumnsOnly, effectiveBasePeriodIndex, getSalesRepValue]);

  // Calculate summary data from all visible sales reps
  const summaryData = useMemo(() => {
    const summary = {};

    dataColumnsOnly.forEach(column => {
      const key = getColumnKey(column);

      let totalSales = 0;
      let salesRepsWithData = 0;

      // Calculate total for all displayed sales reps
      salesReps.forEach(salesRep => {
        const value = getSalesRepValue(salesRep, column);
        totalSales += value;
        if (value > 0) salesRepsWithData++;
      });

      summary[key] = {
        totalSales,
        salesRepsWithData
      };
    });

    return { summary };
  }, [dataColumnsOnly, getSalesRepValue, salesReps]);

  if (loading) {
    return (
      <div className="sbsr-table-view">
        {!hideHeader && (
          <div className="sbsr-table-title">
            <h2>Sales by Sales Reps - {selectedDivision}</h2>
          </div>
        )}
        <div className="sbsr-table-empty-state">
          <div className="loading-spinner"></div>
          <p>⚡ Loading sales rep data with ultra-fast optimization...</p>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
            Using single SQL query for maximum performance
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sbsr-table-view">
        {!hideHeader && (
          <div className="sbsr-table-title">
            <h2>Sales by Sales Reps - {selectedDivision}</h2>
          </div>
        )}
        <div className="sbsr-table-empty-state">
          <p>❌ {error}</p>
        </div>
      </div>
    );
  }

  if (selectedDivision !== 'FP') {
    return (
      <div className="sbsr-table-view">
        {!hideHeader && (
          <div className="sbsr-table-title">
            <h2>Sales by Sales Reps - {selectedDivision}</h2>
          </div>
        )}
        <div className="sbsr-table-empty-state">
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <h3 style={{ color: '#666', marginBottom: '20px' }}>🚧 Coming Soon</h3>
            <p style={{ color: '#888', fontSize: '16px' }}>
              Sales by Sales Rep for {selectedDivision} division is currently under development.
            </p>
            <p style={{ color: '#888', fontSize: '14px', marginTop: '10px' }}>
              The database table <code>{selectedDivision.toLowerCase()}_data_excel</code> has been created and is ready for data.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!dataGenerated || columnOrder.length === 0) {
    return (
      <div className="sbsr-table-view">
        {!hideHeader && (
          <div className="sbsr-table-title">
            <h2>Sales by Sales Reps - {selectedDivision}</h2>
          </div>
        )}
        <div className="sbsr-table-empty-state">
          <p>Please generate data using the filters to view Sales by Sales Rep.</p>
        </div>
      </div>
    );
  }

  // ---------- render ----------
  return (
    <div className="sbsr-table-view">
      <div ref={tableRef} className="sbsr-table-container-for-export">
        {!hideHeader && (
          <div className="sbsr-table-title">
            <h2>Sales by Sales Reps - {selectedDivision}</h2>
            <div className="sbsr-table-subtitle">(<CurrencySymbol />)</div>
          </div>
        )}
        <div className="sbsr-table-container">
          <table className="sales-by-sales-rep-table">
            <colgroup>
              <col style={{ width: `${columnWidths.salesRep}%` }}/>
            </colgroup>
            {extendedColumns.map((col, index) => {
              if (col.columnType === 'delta') {
                return (
                  <colgroup key={`colgroup-delta-${index}`}>
                    <col style={{ width: `${columnWidths.delta}%` }}/>
                  </colgroup>
                );
              } else {
                return (
                  <colgroup key={`colgroup-data-${index}`}>
                    <col style={{ width: `${columnWidths.value}%` }}/>
                    <col style={{ width: `${columnWidths.percent}%` }}/>
                  </colgroup>
                );
              }
            })}
            <thead>
              <tr className="main-header-row">
                <th className="empty-header" rowSpan="4" style={{ width: '26%' }}>Sales Reps Names</th>
                {extendedColumns.map((col, index) => (
                  col.columnType === 'delta' ? (
                    <th key={`delta-year-${index}`} rowSpan="4" style={{ background: 'linear-gradient(135deg, #1e40af, #1e3a8a)', color: '#fbbf24', fontWeight: 'bold' }}>{col.deltaLabel}<br/>%</th>
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
              <tr className="sbsr-separator-row">
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
              {/* Sales Rep rows - one row per sales rep */}
              {sortedSalesReps.map((salesRep, salesRepIndex) => {
                const isLastSalesRep = salesRepIndex === sortedSalesReps.length - 1;
                return (
                  <tr key={`salesrep-${salesRepIndex}-${salesRep.replace(/\s+/g, '-')}`} className="metric-row">
                    <td className="row-label sales-rep-name-cell">
                      {toProperCase(salesRep)}
                    </td>
                    {extendedColumns.map((column, columnIndex) => {
                      if (column.columnType === 'delta') {
                        const fromValue = getSalesRepValue(salesRep, column.fromColumn);
                        const toValue = getSalesRepValue(salesRep, column.toColumn);
                        // Pass column types for smart formula selection
                        const delta = calculateDelta(toValue, fromValue, column.fromColumn?.type, column.toColumn?.type);
                        const deltaText = formatDelta(delta);
                        const color = getDeltaColor(delta);
                        return (
                          <td key={`delta-${salesRepIndex}-${columnIndex}`} className="metric-cell delta-cell" style={{ backgroundColor: '#f8f9fa', textAlign: 'center', fontWeight: 'bold', color }}>
                            {deltaText}
                          </td>
                        );
                      }

                      const value = getSalesRepValue(salesRep, column);
                      const totalSales = summaryData.summary[getColumnKey(column)]?.totalSales || 0;
                      const percentage = totalSales > 0 ? (value / totalSales) * 100 : 0;

                      return (
                        <React.Fragment key={`data-${salesRepIndex}-${columnIndex}`}>
                          <td className="metric-cell data-value-cell" style={{ backgroundColor: getCellBackgroundColor(column) }}>
                            {value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          </td>
                          <td className="metric-cell data-percent-cell" style={{ backgroundColor: getCellBackgroundColor(column) }}>
                            {formatPercentage(percentage)}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Summary rows */}
              {summaryData.summary && Object.keys(summaryData.summary).length > 0 && (
                <>
                  <tr>
                    <td className="row-label summary-label total-sales-label" style={{ backgroundColor: '#0D47A1', color: 'white', fontWeight: 'bold' }}>
                      Total Sales
                    </td>
                    {extendedColumns.map((column, idx) => {
                      if (column.columnType === 'delta') {
                        const fromKey = getColumnKey(column.fromColumn);
                        const toKey = getColumnKey(column.toColumn);
                        const fromData = summaryData.summary[fromKey];
                        const toData = summaryData.summary[toKey];
                        const fromTotal = fromData?.totalSales || 0;
                        const toTotal = toData?.totalSales || 0;
                        // Pass column types for smart formula selection
                        const delta = calculateDelta(toTotal, fromTotal, column.fromColumn?.type, column.toColumn?.type);
                        return (
                          <td key={`total-delta-${idx}`} className="metric-cell delta-cell summary-cell" style={{ backgroundColor: '#0D47A1', color: 'white', fontWeight: 'bold' }}>
                            {formatDelta(delta)}
                          </td>
                        );
                      }
                      const key = getColumnKey(column);
                      const data = summaryData.summary[key];
                      return (
                        <td key={`total-${idx}`} className="metric-cell summary-cell" style={{ backgroundColor: '#0D47A1', color: 'white', fontWeight: 'bold' }} colSpan={2}>
                          {(data?.totalSales || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </td>
                      );
                    })}
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SalesBySalesRepDivisional;