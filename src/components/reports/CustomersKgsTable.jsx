import React, { useState, useEffect } from 'react';
import { useFilter } from '../../contexts/FilterContext';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { formatCustomRangeDisplay } from '../../utils/periodHelpers';
import './ProductGroupsKgsTable.css'; // Reusing the same CSS styles

const CustomersKgsTable = ({ kgsData, rep }) => {
  const { columnOrder, basePeriodIndex, customerMergeConfig } = useFilter();
  const { selectedDivision } = useExcelData();
  const [customerData, setCustomerData] = useState({});
  const [loading, setLoading] = useState(false);
  const [transformedData, setTransformedData] = useState([]);
  const [isTransforming, setIsTransforming] = useState(false);

  // Merge customers based on configuration
  const mergeCustomers = (customers) => {
    if (!customerMergeConfig || customerMergeConfig.length === 0) {
      return customers;
    }

    const mergedCustomers = new Map();
    const processedCustomers = new Set();

    // First, process merge configurations
    customerMergeConfig.forEach(config => {
      const { mergedName, customers: customersToMerge } = config;
      const mergedCustomer = {
        name: mergedName,
        rawValues: new Array(columnOrder.length).fill(0),
        values: new Array(extendedColumns.length).fill(0)
      };

      // Sum up values from all customers in this merge group
      customersToMerge.forEach(customerName => {
        const customer = customers.find(c => 
          (c.name || '').toLowerCase().trim() === (customerName || '').toLowerCase().trim()
        );
        if (customer) {
          processedCustomers.add(customerName);
          customer.rawValues.forEach((value, index) => {
            if (typeof value === 'number' && !isNaN(value)) {
              mergedCustomer.rawValues[index] += value;
            }
          });
        }
      });

      mergedCustomers.set(mergedName, mergedCustomer);
    });

    // Add remaining customers that weren't merged
    customers.forEach(customer => {
      if (!processedCustomers.has(customer.name)) {
        mergedCustomers.set(customer.name, customer);
      }
    });

    return Array.from(mergedCustomers.values());
  };

  // Helper function to format names to proper case (Xxxx Xxxx)
  const toProperCase = (str) => {
    if (!str) return '';
    return str.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  };

  // Helper function for delta calculation - CORRECT financial formulas
  // Uses smart formula: when comparing Actual vs Budget/Estimate/Forecast,
  // always calculate as (Actual - Reference) / Reference to get correct sign
  const calculateDeltaDisplay = (newerValue, olderValue, fromType = '', toType = '') => {
    if (typeof newerValue !== 'number' || typeof olderValue !== 'number') {
      return '-';
    }
    
    // Normalize types
    const normalizedFromType = (fromType || '').toLowerCase();
    const normalizedToType = (toType || '').toLowerCase();
    
    // Determine which value is "Actual" and which is "Reference" (Budget/Estimate/Forecast)
    // For Actual vs Budget/Estimate/Forecast comparisons, always use: (Actual - Reference) / Reference
    let actualValue, referenceValue;
    const isFromActual = normalizedFromType === 'actual';
    const isToActual = normalizedToType === 'actual';
    const isFromReference = ['budget', 'estimate', 'forecast'].includes(normalizedFromType);
    const isToReference = ['budget', 'estimate', 'forecast'].includes(normalizedToType);
    
    if (isFromActual && isToReference) {
      // newerValue is from "from" column (actual), olderValue is from "to" column (budget/estimate)
      // Wait - we need to check the call sites. newerValue = toValue, olderValue = fromValue
      // So newerValue is the "to" column value, olderValue is the "from" column value
      actualValue = olderValue; // from column is actual
      referenceValue = newerValue; // to column is budget/estimate/forecast
    } else if (isToActual && isFromReference) {
      // "to" column is actual, "from" column is budget/estimate/forecast
      actualValue = newerValue; // to column is actual
      referenceValue = olderValue; // from column is budget/estimate/forecast
    } else {
      // YoY or other comparisons: use standard (newer - older) / older
      actualValue = newerValue;
      referenceValue = olderValue;
    }
    
    if (referenceValue === 0) {
      return actualValue > 0 ? { arrow: '🆕', value: 'NEW', color: '#059669' } : { arrow: '', value: '—', color: '#6b7280' };
    }
    
    const delta = ((actualValue - referenceValue) / referenceValue) * 100;
    const absDelta = Math.abs(delta);
    
    let arrow, color;
    if (delta > 0) {
      arrow = '▲';
      color = '#059669';
    } else if (delta < 0) {
      arrow = '▼';
      color = '#dc2626';
    } else {
      arrow = '➖';
      color = '#6b7280';
    }
    
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

  // Load and apply saved merge rules from database (division-wide)
  const applySavedMergeRules = async (salesRep, division, customers, extendedColumns) => {
    // CRITICAL: Define norm function at function scope so it's accessible everywhere
    const norm = (s) => (s || '').toString().trim().toLowerCase();
    
    try {
      // Use division-wide merge rules API (not sales-rep-specific)
      const response = await fetch(`/api/division-merge-rules/rules?division=${encodeURIComponent(division)}`);
      const result = await response.json();
      
      if (result.success && result.data && result.data.length > 0) {
    
        const processedCustomers = [];
        const mergedGroups = [];
        const processed = new Set();
        
        // Apply saved merge rules (division-wide)
        result.data.forEach((rule) => {
          // Map database fields to expected format
          const originalCustomers = rule.original_customers || [];
          const mergedName = rule.merged_customer_name;
          
          // CRITICAL FIX: Deduplicate originalCustomers to prevent double-counting
          const uniqueOriginalCustomers = [...new Set(originalCustomers.map(c => norm(c)))];
          
          if (originalCustomers.length !== uniqueOriginalCustomers.length) {
            console.warn(`⚠️ Merge rule "${mergedName}": Had ${originalCustomers.length} entries but ${uniqueOriginalCustomers.length} unique customers (duplicates removed)`);
          }
          
          // Check if all customers in the rule still exist (case-insensitive comparison)
          const existingCustomers = [];
          const existingCustomerObjects = [];
          const processedInRule = new Set(); // Track which customers we've already found for this rule
          
          uniqueOriginalCustomers.forEach(normalizedCustomerName => {
            // Find matching customer object (case-insensitive)
            const matchingCustomer = customers.find(c => {
              const normalized = norm(c.name);
              return normalized === normalizedCustomerName && !processedInRule.has(normalized);
            });
            if (matchingCustomer) {
              existingCustomers.push(matchingCustomer.name); // Use the actual customer name from data
              existingCustomerObjects.push(matchingCustomer);
              processedInRule.add(norm(matchingCustomer.name));
            }
          });
          
          const missingCustomers = originalCustomers.filter(customerName => {
            return !customers.some(c => c.name.toLowerCase().trim() === customerName.toLowerCase().trim());
          });
          
          
          if (existingCustomers.length > 1) {
            // Multiple customers exist, apply the merge
            existingCustomers.forEach(customerName => {
              processed.add(customerName); // Use exact customer name from data
            });
            
            mergedGroups.push(existingCustomers);
            const mergedCustomer = processMergedCustomerGroup(existingCustomers, extendedColumns, customers, mergedName);
            processedCustomers.push(mergedCustomer);
          } else if (existingCustomers.length === 1) {
            // Only one customer exists, but use the merged name if specified
            const customerName = existingCustomers[0];
            processed.add(customerName);
            
            const singleCustomer = existingCustomerObjects[0];
            if (singleCustomer) {
              // Create a copy to avoid mutating the original
              const processedSingleCustomer = { ...singleCustomer };
              if (rule.mergedName) {
                processedSingleCustomer.name = toProperCase(rule.mergedName) + '*';
                processedSingleCustomer.originalName = rule.mergedName;
              }
              processedCustomers.push(processedSingleCustomer);
            }
          }
        });
        
        // CRITICAL FIX: Create normalized set of processed customer names for comparison
        // This ensures we catch all variations (case, spacing) of merged customers
        const processedNormalized = new Set();
        processed.forEach(name => {
          processedNormalized.add(norm(name));
        });
        
        // CRITICAL: Also create a set of ALL original customers from ALL merge rules (normalized)
        // This ensures we filter out any customer that appears in ANY merge rule, even if it wasn't found in the data
        const allOriginalCustomersNormalized = new Set();
        result.data.forEach((rule) => {
          const originalCustomers = rule.original_customers || [];
          originalCustomers.forEach(orig => {
            allOriginalCustomersNormalized.add(norm(orig));
          });
        });
        
        // Also check merged customer names (without asterisk) to filter out originals
        const mergedCustomerNamesNormalized = new Set();
        processedCustomers.forEach(customer => {
          if (customer.name && customer.name.endsWith('*')) {
            const withoutAsterisk = customer.name.slice(0, -1).trim();
            mergedCustomerNamesNormalized.add(norm(withoutAsterisk));
          }
        });
        
        // Add remaining unprocessed customers as single customers
        // CRITICAL: Filter out any customer that matches:
        // 1. A processed customer (already merged)
        // 2. A merged customer name (without asterisk)
        // 3. ANY original customer from ANY merge rule (even if not found in data)
        customers.forEach(customer => {
          const customerNormalized = norm(customer.name);
          
          // Skip if already processed
          if (processedNormalized.has(customerNormalized)) {
            return;
          }
          
          // Skip if customer name matches a merged customer name (without asterisk)
          if (mergedCustomerNamesNormalized.has(customerNormalized)) {
            return;
          }
          
          // Skip if customer name matches ANY original customer from ANY merge rule
          if (allOriginalCustomersNormalized.has(customerNormalized)) {
            return;
          }
          
            // Create a copy to avoid mutating the original
            processedCustomers.push({ ...customer });
        });
        
    
        return {
          customers: processedCustomers,
          mergedGroups: mergedGroups
        };
      }
      
      // No saved rules found, return all customers as individual entries
      
      return {
        customers: customers,
        mergedGroups: []
      };
      
    } catch (error) {
      console.error('Error loading saved merge rules:', error);
      
      return {
        customers: customers,
        mergedGroups: []
      };
    }
  };

  // Process a group of merged customers
  const processMergedCustomerGroup = (customerGroup, extendedColumns, allCustomers, customMergedName = null) => {
    // Use custom merged name if provided, otherwise use the longest/most specific name as the display name
    const displayName = customMergedName || customerGroup.reduce((longest, current) => 
      current.length > longest.length ? current : longest
    );
    
    
    // DEBUG: Show rawValues for all customers in this group
    customerGroup.forEach(name => {
      const match = allCustomers.find(c => (c.name || '').toLowerCase().trim() === (name || '').toLowerCase().trim());
      if (match) {
      } else {
      }
    });
    
    const values = [];
    const dataValues = [];
    
    // First pass: process all data columns by aggregating across all customers in group
    for (let idx = 0; idx < extendedColumns.length; idx++) {
      const col = extendedColumns[idx];
      
      if (col.columnType === 'data') {
        let aggregatedValue = 0;
        
        // Sum values from all customers in the group
        // CRITICAL FIX: Use filter() instead of find() to get ALL matching customers
        // This handles cases where budget customer "Mai Dubai " and actual customer "Mai Dubai"
        // both normalize to the same name but are separate entries in customerMap
        customerGroup.forEach(customerName => {
          const normalizedSearchName = (customerName || '').toLowerCase().trim();
          
          // Find ALL customers that match this normalized name (not just the first one)
          const matchingCustomers = allCustomers.filter(c => 
            (c.name || '').toLowerCase().trim() === normalizedSearchName
          );
          
          
          // Sum values from ALL matching customers
          matchingCustomers.forEach(customer => {
            if (customer && customer.rawValues && customer.rawValues[col.dataIndex] !== undefined) {
              const value = customer.rawValues[col.dataIndex];
              if (typeof value === 'number') {
                aggregatedValue += value;
              }
            }
          });
        });
        
        dataValues.push(aggregatedValue);
        values.push(aggregatedValue);
      }
    }
    
    // Second pass: insert delta calculations
    const finalValues = [];
    let dataIndex = 0;
    
    for (let idx = 0; idx < extendedColumns.length; idx++) {
      const col = extendedColumns[idx];
      
      if (col.columnType === 'data') {
        finalValues.push(values[dataIndex]);
        dataIndex++;
      } else if (col.columnType === 'delta') {
        // Calculate delta between adjacent data columns
        const newerDataIndex = dataIndex;
        const olderDataIndex = dataIndex - 1;
        
        if (olderDataIndex >= 0 && newerDataIndex < dataValues.length) {
          const newerValue = dataValues[newerDataIndex];
          const olderValue = dataValues[olderDataIndex];
          
          // Pass column types for correct formula selection
          const deltaResult = calculateDeltaDisplay(newerValue, olderValue, col.fromType, col.toType);
          finalValues.push(deltaResult);
        } else {
          finalValues.push('-');
        }
      }
    }

    return {
      name: toProperCase(displayName) + '*', // Add asterisk to indicate merge
      originalName: displayName,
      values: finalValues,
      rawValues: dataValues,
      mergedCustomers: customerGroup, // Keep track of original names
      isMerged: true
    };
  };

  // Build extended columns structure (similar to SalesBySaleRepTable)
  const buildExtendedColumns = (columnOrder) => {
    if (!columnOrder || columnOrder.length === 0) return [];
    
    const extendedColumns = [];
    
    // Helper function to determine the correct delta label
    const getDeltaLabel = (fromCol, toCol) => {
      const fromType = (fromCol.type || '').toLowerCase();
      const toType = (toCol.type || '').toLowerCase();
      
      // Debug: log column types
      
      if (fromType === 'actual' && toType === 'actual') {
        return 'YoY';
      }
      if ((fromType === 'actual' && toType === 'budget') || (fromType === 'budget' && toType === 'actual')) {
        return 'Vs Bgt';
      }
      if ((fromType === 'actual' && (toType === 'estimate' || toType === 'forecast')) ||
          ((fromType === 'estimate' || fromType === 'forecast') && toType === 'actual')) {
        return 'Vs Est';
      }
      if ((fromType === 'budget' && (toType === 'estimate' || toType === 'forecast')) ||
          ((fromType === 'estimate' || fromType === 'forecast') && toType === 'budget')) {
        return 'Bgt vs Est';
      }
      return 'Δ';
    };
    
    for (let i = 0; i < columnOrder.length; i++) {
      const col = columnOrder[i];
      extendedColumns.push({
        ...col,
        columnType: 'data',
        dataIndex: i  // Add dataIndex to map to rawValues array
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

  // Sort customers by base period values (highest to lowest) - moved before early returns
  const sortedData = React.useMemo(() => {
    if (!transformedData || transformedData.length === 0) return [];
    
    const filteredData = filterZeroRows(transformedData);
    if (!filteredData || filteredData.length === 0) return [];
    
    // Check for duplicates
    const customerNames = filteredData.map(c => c.name);
    const uniqueNames = [...new Set(customerNames)];
    if (customerNames.length !== uniqueNames.length) {
      console.warn('⚠️ DUPLICATES DETECTED:');
      const duplicates = customerNames.filter((name, index) => customerNames.indexOf(name) !== index);
      console.warn('Duplicate customers:', duplicates);
    }
    
    // Get filtered data columns (excluding delta columns)
    const dataColumnsOnly = extendedColumns.filter(c => c.columnType === 'data');
    
    // Determine the effective base period index
    let effectiveBasePeriodIndex = basePeriodIndex;
    
    // If base period index is invalid or out of range, use the first available period
    if (effectiveBasePeriodIndex === null || effectiveBasePeriodIndex < 0 || effectiveBasePeriodIndex >= dataColumnsOnly.length) {
      effectiveBasePeriodIndex = 0; // Default to first period
    }
    
    // Ensure we have at least one data column to sort by
    if (dataColumnsOnly.length === 0) {
      return filteredData;
    }
    
    // Find the column index in extendedColumns that corresponds to the base period
    const baseDataColumn = dataColumnsOnly[effectiveBasePeriodIndex];
    const baseColumnIndex = extendedColumns.findIndex(col => 
      col.columnType === 'data' && 
      col.year === baseDataColumn.year && 
      col.month === baseDataColumn.month && 
      col.type === baseDataColumn.type
    );
    
    if (baseColumnIndex === -1) {
      return filteredData; // If base column not found, return unsorted
    }
    
    // Sort customers by base period value (descending - highest to lowest)
    const sorted = [...filteredData].sort((a, b) => {
      // The basePeriodIndex refers to data columns only, but rawValues uses the original columnOrder indexing
      // We need to map the basePeriodIndex to the correct rawValues index
      const baseDataColumn = dataColumnsOnly[effectiveBasePeriodIndex];
      const rawValuesIndex = columnOrder.findIndex(col => 
        col.year === baseDataColumn.year && 
        col.month === baseDataColumn.month && 
        col.type === baseDataColumn.type
      );
      
      const aValue = a.rawValues[rawValuesIndex] || 0;
      const bValue = b.rawValues[rawValuesIndex] || 0;
      
      return bValue - aValue; // Sort descending (highest values first)
    });
    
    return sorted;
  }, [transformedData, extendedColumns, basePeriodIndex]);

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

  // Enhanced format number for display with better visual presentation
  const formatValue = (value) => {
    if (typeof value !== 'number') return value || '-';
    
    // Handle zero values
    if (value === 0) return '0.0';
    
    // Convert KGS to MT by dividing by 1000
    const mtValue = value / 1000;
    
    // If less than 1, use x.xx format (2 decimal places)
    if (mtValue < 1) {
      return mtValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }
    
    // For values >= 1, use x.x format (1 decimal place) with thousands separator
    const formattedNumber = mtValue.toLocaleString('en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    });
    
    return formattedNumber;
  };

  // Format value for total row (whole numbers without decimals)
  const formatValueForTotal = (value) => {
    if (typeof value !== 'number') return value || '-';
    
    // Handle zero values
    if (value === 0) return '0';
    
    // Convert KGS to MT by dividing by 1000
    const mtValue = value / 1000;
    
    // Round to whole number and format with thousands separator
    const roundedValue = Math.round(mtValue);
    return roundedValue.toLocaleString('en-US');
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
  const calculateTotalDelta = (data, fromIndex, toIndex, deltaCol) => {
    const fromTotal = calculateColumnTotal(data, fromIndex);
    const toTotal = calculateColumnTotal(data, toIndex);
    
    const fromType = (deltaCol?.fromType || '').toLowerCase();
    const toType = (deltaCol?.toType || '').toLowerCase();
    
    let actualValue, referenceValue;
    
    if (fromType === 'actual' && (toType === 'budget' || toType === 'estimate' || toType === 'forecast')) {
      actualValue = fromTotal;
      referenceValue = toTotal;
    } else if ((fromType === 'budget' || fromType === 'estimate' || fromType === 'forecast') && toType === 'actual') {
      actualValue = toTotal;
      referenceValue = fromTotal;
    } else {
      actualValue = toTotal;
      referenceValue = fromTotal;
    }
    
    if (referenceValue === 0) {
      if (actualValue > 0) {
        return { arrow: '🆕', value: 'NEW', color: '#059669' };
      }
      return { arrow: '', value: '—', color: '#6b7280' };
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

  // Fetch customer sales data from database API
  const fetchCustomerSalesData = async (column) => {
    if (!rep || !column) return;
    
    setLoading(true);
    
    try {
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

      const response = await fetch('/api/sales-by-customer-db', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          division: selectedDivision || 'FP',
          salesRep: rep,
          year: column.year,
          months: months,
          dataType: column.type || 'Actual',
          valueType: 'KGS'  // This is the KGS/MT table - fetch KGS values
        })
      });

      const result = await response.json();

      if (result.success) {
        // Use stable key per period selection
        const columnKey = column.id || `${column.year}-${column.month}-${column.type}`;
        
        // DEBUG: Log Al Ain data specifically
        const alAinData = result.data?.filter(c => c.customer?.toLowerCase().includes('al ain'));
        if (alAinData?.length > 0) {
        }
        
        // DEBUG: Log ALL customer names for Budget columns
        if (column.type === 'Budget') {
        }
        
        setCustomerData(prev => ({
          ...prev,
          [columnKey]: result.data
        }));
      }
    } catch (err) {
      console.error('Failed to load customer sales data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load customer sales data when columns change
  useEffect(() => {
    if (rep && columnOrder.length > 0) {
      columnOrder.forEach(column => {
        fetchCustomerSalesData(column);
      });
    }
  }, [rep, columnOrder, selectedDivision]);



  // Transform data when customer data changes
  useEffect(() => {
    const transformData = async () => {
      if (!customerData || !columnOrder || columnOrder.length === 0) {
        setTransformedData([]);
        return;
      }
      
      // CRITICAL FIX: Wait for ALL columns to be loaded before transforming
      // This prevents partial transformations that miss Budget-only customers
      const loadedColumnKeys = Object.keys(customerData);
      const expectedColumnKeys = columnOrder.map(col => col.id || `${col.year}-${col.month}-${col.type}`);
      
      // Check if all columns have data (at least check they exist in customerData)
      const allColumnsLoaded = expectedColumnKeys.every(key => loadedColumnKeys.includes(key));
      
      if (!allColumnsLoaded) {
        return; // Don't transform yet - wait for all data
      }
      
      
      setIsTransforming(true);
      try {
        const result = await transformToCustomerData();
        setTransformedData(result);
        
        // Dispatch event to notify CustomerKeyFactsNew that data is ready
        window.dispatchEvent(new CustomEvent('customersKgsTable:dataReady', {
          detail: {
            rows: result,
            columnOrder: columnOrder,
            rep: rep
          }
        }));
      } catch (error) {
        console.error('Error transforming customer data:', error);
        setTransformedData([]);
      } finally {
        setIsTransforming(false);
      }
    };

    transformData();
  }, [customerData, rep, columnOrder, selectedDivision]);

  // Transform real customer data to display format with customer merging
  const transformToCustomerData = async () => {
    if (!columnOrder || columnOrder.length === 0) return [];
    
    
    // Create a map to aggregate data by customer across all periods
    const customerMap = new Map();
    
    // Process each column's customer data
    columnOrder.forEach((column, columnIndex) => {
      const columnKey = column.id || `${column.year}-${column.month}-${column.type}`;
      const columnData = customerData[columnKey] || [];
      
      
      columnData.forEach(customerRecord => {
        const customerName = customerRecord.customer;
        const value = parseFloat(customerRecord.value) || 0;
        
        if (!customerMap.has(customerName)) {
          customerMap.set(customerName, {
            name: customerName,
            rawValues: new Array(columnOrder.length).fill(0),
            values: new Array(extendedColumns.length).fill(0)
          });
        }
        
        const customer = customerMap.get(customerName);
        customer.rawValues[columnIndex] = value;
      });
    });
    
    
    // DEBUG: Show Al Ain entries with their rawValues
    Array.from(customerMap.entries()).forEach(([name, customer]) => {
      if (name.toLowerCase().includes('al ain')) {
      }
    });
    
    // Build the values array for display (including deltas)
    Array.from(customerMap.values()).forEach(customer => {
      extendedColumns.forEach((col, colIndex) => {
        if (col.columnType === 'data') {
          // For data columns, use the rawValues
          const rawIndex = col.dataIndex;
          if (rawIndex < customer.rawValues.length) {
            customer.values[colIndex] = customer.rawValues[rawIndex];
          }
        } else if (col.columnType === 'delta') {
          // For delta columns, calculate the delta between consecutive data columns
          const fromDataIndex = col.fromDataIndex;
          const toDataIndex = col.toDataIndex;
          
          if (fromDataIndex < customer.rawValues.length && toDataIndex < customer.rawValues.length) {
            const fromValue = customer.rawValues[fromDataIndex] || 0;
            const toValue = customer.rawValues[toDataIndex] || 0;
            
            // Pass column types for correct formula selection
            const deltaResult = calculateDeltaDisplay(toValue, fromValue, col.fromType, col.toType);
            customer.values[colIndex] = deltaResult;
          }
        }
      });
    });
    
    // Get all customers before merging
    const allCustomers = Array.from(customerMap.values());
    
    
    // DEBUG: Specifically log Al Ain customers
    const alAinCustomers = allCustomers.filter(c => c.name?.toLowerCase().includes('al ain'));
    if (alAinCustomers.length > 0) {
    }
    
    // Apply customer merging if rep is available
    if (rep) {
      try {
        const { customers: mergedCustomers } = await applySavedMergeRules(rep, selectedDivision || 'FP', allCustomers, extendedColumns);
        return mergedCustomers;
      } catch (error) {
        console.error('Error applying merge rules:', error);
        return allCustomers;
      }
    }
    
    return allCustomers;
  };

  // Generate customers for a product group (demo data) - REMOVED
  // const generateCustomersForProductGroup = (productGroupName) => {
  //   // This function has been removed and replaced with real customer data fetching
  // };

  // Transform product group data to customer-based data - REPLACED
  // const transformToCustomerData = (productGroupData) => {
  //   // This function has been replaced with real customer data transformation
  // };

  // Filter out rows with all zero values - REMOVED DUPLICATE

  // Render table header
  const renderTableHeader = () => (
    <thead>
      <tr className="main-header-row">
        <th className="product-header" rowSpan={3}>Customer Names</th>
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

  if (!kgsData || kgsData.length === 0) {
    return (
      <div className="product-groups-kgs-table">
        <h3>Customers - Sales MT Comparison</h3>
        <div className="no-data">No data available for {rep}</div>
      </div>
    );
  }

  if (!columnOrder || columnOrder.length === 0) {
    return (
      <div className="product-groups-kgs-table">
        <h3>Customers - Sales MT Comparison</h3>
        <div className="no-data">Please select columns to view data.</div>
      </div>
    );
  }

  if (isTransforming) {
    return (
      <div className="product-groups-kgs-table">
        <h3>Customers - Sales MT Comparison</h3>
        <div className="no-data">Loading customer data...</div>
      </div>
    );
  }

  // Use transformed data instead of calling transformToCustomerData directly
  const customerTableData = transformedData;
  // filteredData is now handled by sortedData which includes filtering

  return (
    <div className="product-groups-kgs-table">
      <h3>Customers - Sales MT Comparison</h3>
      <table className="kgs-comparison-table">
        {renderTableHeader()}
        <tbody>
          {sortedData.map((customer, rowIndex) => (
            <tr key={`${customer.name}-${rowIndex}`} className="product-row">
              <td className="row-label product-name" title={toProperCase(customer.name)}>{toProperCase(customer.name)}</td>
              {extendedColumns.map((col, idx) => {
                if (col.columnType === 'delta') {
                  // RECALCULATE delta using correct financial formula
                  const delta = calculateRowDelta(customer, col);
                  let deltaClass = '';
                  if (delta.arrow === '▲') {
                    deltaClass = 'delta-up';
                  } else if (delta.arrow === '▼') {
                    deltaClass = 'delta-down';
                  } else if (delta.arrow === '🆕') {
                    deltaClass = 'delta-up';
                  }
                  return (
                    <td key={idx} className={`metric-cell delta-cell ${deltaClass}`} style={{ color: delta.color || '#6b7280' }}>
                      <span style={{ marginRight: '3px', fontSize: '14px', fontWeight: 'bold' }}>{delta.arrow}</span>
                      <span style={{ fontSize: '14px', fontWeight: '600' }}>{delta.value}</span>
                    </td>
                  );
                }
                // For data columns, use rawValues to get the original KGS values
                const rawVal = customer.rawValues[col.dataIndex];
                return <td key={idx} className="metric-cell">{formatValue(rawVal)}</td>;
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
                  const delta = calculateTotalDelta(sortedData, fromIndex, toIndex, col);
                  let deltaClass = '';
                  if (delta.arrow === '▲') {
                    deltaClass = 'delta-up';
                  } else if (delta.arrow === '▼') {
                    deltaClass = 'delta-down';
                  } else if (delta.arrow === '🆕') {
                    deltaClass = 'delta-up';
                  }
                  return (
                    <td key={`total-delta-${idx}`} className={`metric-cell delta-cell ${deltaClass}`} style={{ color: delta.color }}>
                      <span style={{ marginRight: '3px', fontSize: '14px', fontWeight: 'bold' }}>{delta.arrow}</span>
                      <span style={{ fontSize: '14px', fontWeight: '600' }}>{delta.value}</span>
                    </td>
                  );
                }
                return <td key={`total-delta-${idx}`} className="metric-cell">-</td>;
              }
              const totalValue = calculateColumnTotal(sortedData, idx);
              return <td key={`total-${idx}`} className="metric-cell total-value">{formatValueForTotal(totalValue)}</td>;
            })}
          </tr>
        </tbody>
      </table>

    </div>
  );
};

export default CustomersKgsTable;