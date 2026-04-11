import React, { useEffect, useState } from 'react';
import TabsComponent, { Tab } from './TabsComponent';
import { useFilter } from '../../contexts/FilterContext';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useSalesData } from '../../contexts/SalesDataContext';
import { useSalesRepReports } from '../../contexts/SalesRepReportsContext';
import { useAuth } from '../../contexts/AuthContext';
import SalesRepReport from '../reports/SalesRepReport';
import SalesRepHTMLExport from './SalesRepHTMLExport';
import CurrencySymbol from './CurrencySymbol';
import './SalesBySalesRepTable.css'; // Use dedicated CSS file
import { getColumnColorPalette } from './utils/colorUtils';

// ============================================================================
// REMOVED: MergedGroupsDisplay Component
// ============================================================================
// Customer merging is now exclusively managed in:
//   Master Data > Customer Merging (CustomerMergingPage.js)
//
// This table only displays data with merge rules already applied from the
// division_customer_merge_rules database table.
//
// For merge management, use: /api/division-merge-rules/* endpoints
// ============================================================================



// Helper function to convert month names to numbers
const getMonthNumber = (monthName) => {
  const months = {
    'January': '01', 'February': '02', 'March': '03', 'April': '04',
    'May': '05', 'June': '06', 'July': '07', 'August': '08',
    'September': '09', 'October': '10', 'November': '11', 'December': '12'
  };
  return months[monthName] || '01';
};

// Helper function to get months for a given period
const getMonthsForPeriod = (period) => {
  const monthMap = {
    'Q1': ['January', 'February', 'March'],
    'Q2': ['April', 'May', 'June'],
    'Q3': ['July', 'August', 'September'],
    'Q4': ['October', 'November', 'December'],
    'HY1': ['January', 'February', 'March', 'April', 'May', 'June'],
    'HY2': ['July', 'August', 'September', 'October', 'November', 'December'],
    'Year': ['January', 'February', 'March', 'April', 'May', 'June', 
             'July', 'August', 'September', 'October', 'November', 'December']
  };
  return monthMap[period] || [period];
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
    // Comparing TO Actual FROM Budget/Est/Fcst
    if (fromType === 'budget') return 'Vs Bgt';
    if (fromType === 'estimate') return 'Vs Est';
    if (fromType === 'forecast') return 'Vs Fcst';
  }
  
  if (fromType === 'actual') {
    // Comparing FROM Actual TO Budget/Est/Fcst
    if (toType === 'budget') return 'Vs Bgt';
    if (toType === 'estimate') return 'Vs Est';
    if (toType === 'forecast') return 'Vs Fcst';
  }
  
  // Budget vs Estimate, etc. - use generic delta
  return 'Δ';
};

// Helper function for delta calculation with SMART formula based on comparison type
// Formula: Actual vs Budget/Est/Fcst = ((Actual - Reference) / Reference) × 100
const calculateDeltaDisplay = (newerValue, olderValue, fromColType, toColType) => {
  if (!isNaN(newerValue) && !isNaN(olderValue)) {
    // Determine which value is Actual and which is Reference (Budget/Est/Fcst)
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
    
    let deltaPercent;
    
    // Handle zero denominator with smart logic
    if (referenceValue === 0) {
      if (actualValue > 0) {
        // New item (no reference but has actual)
        return {
          arrow: '🆕',
          value: 'NEW',
          color: '#059669',
          isNew: true
        };
      } else if (actualValue === 0) {
        // No activity in either period
        return {
          arrow: '',
          value: '—',
          color: '#6b7280',
          isNoActivity: true
        };
      } else {
        deltaPercent = -Infinity;
      }
    } else {
      // Standard formula with correct values
      deltaPercent = ((actualValue - referenceValue) / referenceValue) * 100;
    }
    
    // Format based on value range
    let formattedDelta;
    if (deltaPercent === Infinity || deltaPercent === -Infinity) {
      formattedDelta = '∞';
    } else if (Math.abs(deltaPercent) > 99.99) {
      formattedDelta = Math.round(deltaPercent);
    } else {
      formattedDelta = deltaPercent.toFixed(1);
    }
    
    if (deltaPercent > 0) {
      return {
        arrow: '▲',
        value: deltaPercent === Infinity ? formattedDelta : `${formattedDelta}%`,
        color: '#288cfa'
      };
    } else if (deltaPercent < 0) {
      return {
        arrow: '▼',
        value: deltaPercent === -Infinity ? formattedDelta : `${Math.abs(formattedDelta)}%`,
        color: '#dc3545'
      };
    } else {
      return {
        arrow: '',
        value: '0.0%',
        color: 'black'
      };
    }
  }
  return '-';
};

// Helper function to format names to proper case (Xxxx Xxxx)
const toProperCase = (str) => {
  if (str === null || str === undefined) return '';
  return String(str).split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
};

// Helper function to prepare periods from column order
const preparePeriods = (columnOrder) => {
    const periods = [];
    
    columnOrder.forEach(col => {
      let monthsToInclude = [];
      
      if (col.months && Array.isArray(col.months)) {
        // Custom range - use all months in the range
        monthsToInclude = col.months;
      } else {
      // Handle quarters and standard periods using helper function
      monthsToInclude = getMonthsForPeriod(col.month);
      }
      
      // Add each month as a separate period for backend aggregation
      monthsToInclude.forEach(monthName => {
        periods.push({
          year: col.year,
          month: getMonthNumber(monthName),
          type: col.type || 'Actual',
          originalColumn: col // Keep reference to original column for grouping
        });
      });
    });
    
  return periods;
};

// Helper function to fetch dashboard data from API
const fetchDashboardData = async (salesRep, variable, periods, selectedDivision = 'FP') => {
  if (selectedDivision === 'FP') {
    // Use real FP data from PostgreSQL
    const response = await fetch('/api/fp/sales-rep-dashboard', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        salesRep,
        valueTypes: [variable], // Use original case to match database
        periods
      })
    });
    
    if (!response.ok) {
      console.error('Failed to fetch dashboard data:', response.status);
      throw new Error(`API request failed with status: ${response.status}`);
    }
    
    const result = await response.json();
    return result.data;
  } else {
    // Generate placeholder data for SB/TF/HCM divisions
    return generatePlaceholderDashboardData(salesRep, variable, periods, selectedDivision);
  }
};

// Helper function to generate placeholder dashboard data for non-FP divisions
const generatePlaceholderDashboardData = (salesRep, variable, periods, division) => {
  // Define product groups for each division
  const divisionProductGroups = {
    'SB': ['Stretch Films', 'Shrink Films', 'Agricultural Films', 'Barrier Films'],
    'TF': ['Technical Films', 'Barrier Films', 'Specialty Films', 'Industrial Films'],
    'HCM': ['Hygiene Films', 'Medical Films', 'Pharmaceutical', 'Safety Films']
  };
  
  const productGroups = divisionProductGroups[division] || ['Product Group 1', 'Product Group 2', 'Product Group 3'];
  
  // Generate realistic placeholder data
  const dashboardData = {};
  
  productGroups.forEach(pg => {
    dashboardData[pg] = {};
    dashboardData[pg][variable] = {};
    
    periods.forEach(period => {
      const { year, month, type } = period;
      const key = `${year}-${month}-${type}`;
      
      // Generate random but realistic values
      const baseValue = variable === 'KGS' ? 
        Math.floor(Math.random() * 50000) + 10000 : // 10K-60K KGS
        Math.floor(Math.random() * 500000) + 100000; // 100K-600K Amount
      
      // Add some variation based on sales rep name for consistency
      const repVariation = salesRep.length * 1000;
      const pgVariation = pg.length * 500;
      
      dashboardData[pg][variable][key] = baseValue + repVariation + pgVariation;
    });
  });
  
  return {
    productGroups,
    dashboardData,
    isPlaceholder: true
  };
};
    
// Helper function to build extended columns structure
const buildExtendedColumns = (columnOrder) => {
    const extendedColumns = [];
  
    columnOrder.forEach((col, index) => {
      extendedColumns.push({
        ...col,
        columnType: 'data',
        label: `${col.year}-${col.isCustomRange ? col.displayName : col.month}-${col.type}`
      });
      
      // Add delta column after each data column (except the last one)
      if (index < columnOrder.length - 1) {
        const fromCol = col;
        const toCol = columnOrder[index + 1];
        const deltaLabel = getDeltaLabel(fromCol, toCol);
        extendedColumns.push({
          columnType: 'delta',
          label: 'Delta',
          fromCol: fromCol,  // Store reference to "from" column
          toCol: toCol,      // Store reference to "to" column
          deltaLabel: deltaLabel  // Dynamic label based on types
        });
      }
    });
    
  return extendedColumns;
};

// Helper function to aggregate monthly data for a column
const aggregateColumnData = (pgName, variable, col, dashboardData) => {
          try {
            const year = col.year;
            const type = col.type || 'Actual';
            let aggregatedValue = 0;
            
            // Determine which months to aggregate based on column configuration
            let monthsToAggregate = [];
            
            if (col.months && Array.isArray(col.months)) {
              // Custom range - use all months in the range
              monthsToAggregate = col.months;
            } else {
      // Handle quarters and standard periods using helper function
      monthsToAggregate = getMonthsForPeriod(col.month);
            }
            
            // Sum values for all months in the period
            monthsToAggregate.forEach(monthName => {
              const month = getMonthNumber(monthName);
              const key = `${year}-${month}-${type}`;
              const monthValue = dashboardData[pgName]?.[variable]?.[key] || 0;
              
              if (typeof monthValue === 'number') {
                aggregatedValue += monthValue;
              }
            });
    
    return aggregatedValue;
  } catch (error) {
    // Error extracting sales data
    return 0;
  }
};

// Helper function to sort product groups with "Others" at the end
const sortProductGroups = (productGroups) => {
  return productGroups.sort((a, b) => {
    // If 'a' is "Others", it should come after 'b'
    if (a.toLowerCase() === 'others') return 1;
    // If 'b' is "Others", it should come after 'a'
    if (b.toLowerCase() === 'others') return -1;
    // For all other cases, maintain alphabetical order
    return a.localeCompare(b);
  });
};





// Helper function to process data for a single product group
const processProductGroupData = (pgName, variable, extendedColumns, dashboardData) => {
  const values = [];
  const dataValues = []; // Store only data values for delta calculation
  
  // First pass: process all data columns
  for (let idx = 0; idx < extendedColumns.length; idx++) {
    const col = extendedColumns[idx];
    
    if (col.columnType === 'data') {
      const aggregatedValue = aggregateColumnData(pgName, variable, col, dashboardData);
            
            // Format as comma-separated integer without decimals
            const formattedValue = Math.round(aggregatedValue).toLocaleString();
            dataValues.push(aggregatedValue); // Store raw value for delta calculation
            values.push(formattedValue);
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
          // dataIndex points to the next data column (newer)
          // dataIndex-1 points to the previous data column (older)
          const newerDataIndex = dataIndex;
          const olderDataIndex = dataIndex - 1;
          
          if (olderDataIndex >= 0 && newerDataIndex < dataValues.length) {
            const newerValue = dataValues[newerDataIndex];
            const olderValue = dataValues[olderDataIndex];
            
        // Pass column types for smart formula selection
        const deltaResult = calculateDeltaDisplay(newerValue, olderValue, col.fromCol?.type, col.toCol?.type);
        finalValues.push(deltaResult);
          } else {
            finalValues.push('-');
          }
        }
      }
      
      return {
        name: toProperCase(pgName), // Format product group name to proper case
        values: finalValues,
        rawValues: dataValues // Store raw numeric values for total calculations
      };
};

// Main function to fetch actual product groups and sales data from fp_data for each sales rep
const getProductGroupsForSalesRep = async (salesRep, variable, columnOrder, selectedDivision = 'FP') => {
  try {
    // Safety check for columnOrder
    if (!columnOrder || columnOrder.length === 0) {
      return [];
    }
    
    // Step 1: Prepare periods from columnOrder
    const periods = preparePeriods(columnOrder);
    
    // Step 2: Fetch data from API
    const { productGroups, dashboardData } = await fetchDashboardData(salesRep, variable, periods, selectedDivision);
    
    // Step 3: Sort product groups with "Others" at the end
    const sortedProductGroups = sortProductGroups(productGroups);
    
    // Step 4: Build extended columns structure
    const extendedColumns = buildExtendedColumns(columnOrder);
    
    // Step 5: Process data for each product group
    const processedResult = sortedProductGroups.map((pgName) => 
      processProductGroupData(pgName, variable, extendedColumns, dashboardData)
    );
    
    return processedResult;
    
  } catch (error) {
    // Error fetching product groups for sales rep
    // Return fallback structure
    return [{
      name: 'No Product Groups Found',
      values: columnOrder ? new Array(columnOrder.length * 2 - 1).fill('-') : []
    }];
  }
};

// Helper function to fetch customer dashboard data from API - UNIVERSAL
const fetchCustomerDashboardData = async (salesRep, periods, selectedDivision = 'FP') => {
  try {
    
    // Use universal endpoint for all divisions
    const response = await fetch('/api/customer-dashboard-universal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        division: selectedDivision,
        salesRep,
        periods
      })
    });
    
    if (!response.ok) {
      console.error('Failed to fetch customer dashboard data:', response.status);
      throw new Error(`API request failed with status: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      return result.data;
    } else {
      console.warn(`⚠️ API returned error, falling back to placeholder data:`, result.message);
      return generatePlaceholderCustomerData(salesRep, periods, selectedDivision);
    }
  } catch (error) {
    console.error(`❌ Error fetching customer dashboard data for ${salesRep}:`, error);
    return generatePlaceholderCustomerData(salesRep, periods, selectedDivision);
  }
};

// Helper function to generate placeholder customer data for non-FP divisions
const generatePlaceholderCustomerData = (salesRep, periods, division) => {
  // Generate customer names based on division
  const divisionCustomers = {
    'SB': ['Industrial Corp A', 'Packaging Solutions B', 'AgriTech Industries', 'Stretch Film Co', 'Barrier Solutions Ltd'],
    'TF': ['Technical Films Inc', 'Advanced Materials Co', 'Specialty Products Ltd', 'Industrial Tech Corp', 'Barrier Tech Solutions'],
    'HCM': ['MedTech Industries', 'Healthcare Solutions', 'Pharma Packaging Co', 'Medical Films Ltd', 'Safety Products Inc']
  };
  
  const customers = divisionCustomers[division] || ['Customer A', 'Customer B', 'Customer C', 'Customer D', 'Customer E'];
  
  // Generate realistic placeholder data
  const dashboardData = {};
  
  customers.forEach(customer => {
    dashboardData[customer] = {};
    
    periods.forEach(period => {
      const { year, month, type } = period;
      const key = `${year}-${month}-${type}`;
      
      // Generate random but realistic KGS values
      const baseValue = Math.floor(Math.random() * 30000) + 5000; // 5K-35K KGS
      
      // Add some variation based on sales rep and customer name for consistency
      const repVariation = salesRep.length * 500;
      const customerVariation = customer.length * 200;
      
      dashboardData[customer][key] = baseValue + repVariation + customerVariation;
    });
  });
  
  return {
    customers,
    dashboardData,
    isPlaceholder: true
  };
};

// Helper function to aggregate customer monthly data for a column
const aggregateCustomerColumnData = (customerName, col, dashboardData) => {
  try {
    const year = col.year;
    const type = col.type || 'Actual';
    let aggregatedValue = 0;
    
    // Helper to normalize names for matching (handles trailing spaces, case differences)
    const norm = (s) => (s || '').toString().trim().toLowerCase();
    
    // Get all keys from dashboardData for matching
    const dashboardKeys = Object.keys(dashboardData);
    const normalizedCustomerName = norm(customerName);
    
    // Find ALL dashboard keys that match this normalized customer name
    const matchingKeys = dashboardKeys.filter(key => norm(key) === normalizedCustomerName);
    
    // Determine which months to aggregate based on column configuration
    let monthsToAggregate = [];
    
    if (col.months && Array.isArray(col.months)) {
      // Custom range - use all months in the range
      monthsToAggregate = col.months;
    } else {
      // Handle quarters and standard periods using helper function
      monthsToAggregate = getMonthsForPeriod(col.month);
    }
    
    // Sum values for all months in the period from ALL matching customers
    // CRITICAL FIX: Use normalized matching to handle trailing spaces, case differences
    matchingKeys.forEach(matchingKey => {
      monthsToAggregate.forEach(monthName => {
        const month = getMonthNumber(monthName);
        const key = `${year}-${month}-${type}`;
        const monthValue = dashboardData[matchingKey]?.[key] || 0;
        
        if (typeof monthValue === 'number') {
          aggregatedValue += monthValue;
        }
      });
    });
    
    return aggregatedValue;
  } catch (error) {
    // Error extracting sales data
    return 0;
  }
};

// Customer merge rules are now handled entirely through manual database-based grouping



// Load and apply merge rules to actually aggregate/merge customers
const applySavedMergeRules = async (salesRep, division, customers, dashboardData, extendedColumns) => {
  try {
    const response = await fetch(`/api/division-merge-rules?division=${encodeURIComponent(division)}`);
    const result = await response.json();

    if (result.success && result.data.length > 0) {

      const processedCustomers = [];
      const mergedGroups = [];
      const processed = new Set();

      // CRITICAL: Define norm function at function scope so it's accessible everywhere
      const norm = (s) => (s || '').toString().trim().toLowerCase();

      // Apply saved merge rules - actually merge customers together
      result.data.forEach((rule) => {
        // Database returns snake_case field names
        const originalCustomers = rule.original_customers || [];
        const mergedName = rule.merged_customer_name;

        // CRITICAL FIX: Deduplicate originalCustomers to prevent double-counting
        const uniqueOriginalCustomers = [...new Set(originalCustomers.map(c => norm(c)))];
        
        if (originalCustomers.length !== uniqueOriginalCustomers.length) {
          console.warn(`⚠️ Merge rule "${mergedName}": Had ${originalCustomers.length} entries but ${uniqueOriginalCustomers.length} unique customers (duplicates removed)`);
        }

        // Find matching customer names (case-insensitive)
        const existingCustomers = [];
        const processedInRule = new Set(); // Track which customers we've already found for this rule

        uniqueOriginalCustomers.forEach(normalizedCustomerName => {
          const matchingCustomer = customers.find(c => {
            const normalized = norm(c);
            return normalized === normalizedCustomerName && !processedInRule.has(normalized);
          });
          if (matchingCustomer) {
            existingCustomers.push(matchingCustomer);
            processedInRule.add(norm(matchingCustomer));
          }
        });

        if (existingCustomers.length > 1) {
          // Multiple customers exist - MERGE them into one row
          existingCustomers.forEach(customerName => {
            processed.add(customerName);
          });

          mergedGroups.push(existingCustomers);
          const mergedCustomer = processMergedCustomerGroup(
            existingCustomers,
            extendedColumns,
            dashboardData,
            mergedName
          );
          processedCustomers.push(mergedCustomer);

        } else if (existingCustomers.length === 1) {
          // Only one customer exists - show with merged name
          const customerName = existingCustomers[0];
          processed.add(customerName);

          const singleCustomer = processCustomerData(customerName, extendedColumns, dashboardData);
          if (mergedName) {
            singleCustomer.name = toProperCase(mergedName) + '*';
            singleCustomer.originalName = mergedName;
          }
          processedCustomers.push(singleCustomer);
        }
      });

      // CRITICAL FIX: Create normalized set of merged customer names (without asterisk)
      // to filter out original customers that match merged names
      const mergedCustomerNamesNormalized = new Set();
      processedCustomers.forEach(customer => {
        if (customer.name && customer.name.endsWith('*')) {
          const withoutAsterisk = customer.name.slice(0, -1).trim();
          mergedCustomerNamesNormalized.add(norm(withoutAsterisk));
        }
      });
      
      // CRITICAL: Also create a set of ALL original customers from ALL merge rules (normalized)
      const allOriginalCustomersNormalized = new Set();
      result.data.forEach((rule) => {
        const originalCustomers = rule.original_customers || [];
        originalCustomers.forEach(orig => {
          allOriginalCustomersNormalized.add(norm(orig));
        });
      });

      // Add remaining unprocessed customers as individual entries
      // CRITICAL: Filter out any customer that matches:
      // 1. A processed customer (already merged)
      // 2. A merged customer name (without asterisk)
      // 3. ANY original customer from ANY merge rule
      customers.forEach(customer => {
        const customerNormalized = norm(customer);
        
        // Skip if already processed
        if (processed.has(customer)) {
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
        
        processedCustomers.push(processCustomerData(customer, extendedColumns, dashboardData));
      });


      return {
        customers: processedCustomers,
        mergedGroups: mergedGroups
      };
    }

    // No saved rules found, return all customers as individual entries
    const individualCustomers = customers.map(customer =>
      processCustomerData(customer, extendedColumns, dashboardData)
    );

    return {
      customers: individualCustomers,
      mergedGroups: []
    };

  } catch (error) {
    console.error('Error loading saved merge rules:', error);
    const individualCustomers = customers.map(customer =>
      processCustomerData(customer, extendedColumns, dashboardData)
    );

    return {
      customers: individualCustomers,
      mergedGroups: []
    };
  }
};

// Manual customer grouping system only - no automatic matching

// Process a group of merged customers
const processMergedCustomerGroup = (customerGroup, extendedColumns, dashboardData, customMergedName = null) => {
  // Use custom merged name if provided, otherwise use the longest/most specific name as the display name
  const displayName = customMergedName || customerGroup.reduce((longest, current) =>
    current.length > longest.length ? current : longest
  );

  const values = [];
  const dataValues = [];
  
  // Helper to normalize names for matching (handles trailing spaces, case differences)
  const norm = (s) => (s || '').toString().trim().toLowerCase();
  
  // Get all keys from dashboardData for matching
  const dashboardKeys = Object.keys(dashboardData);

  // First pass: process all data columns by aggregating across all customers in group
  for (let idx = 0; idx < extendedColumns.length; idx++) {
    const col = extendedColumns[idx];

    if (col.columnType === 'data') {
      let aggregatedValue = 0;

      // Sum values from all customers in the group
      // CRITICAL FIX: Use normalized matching to find ALL dashboard entries
      // that match each customer name (handles trailing spaces, case differences)
      customerGroup.forEach(customerName => {
        const normalizedCustomerName = norm(customerName);
        
        // Find ALL dashboard keys that match this normalized customer name
        const matchingKeys = dashboardKeys.filter(key => norm(key) === normalizedCustomerName);
        
        // Need to aggregate across months for quarters/custom ranges
        let monthsToAggregate = [];
        if (col.months && Array.isArray(col.months)) {
          monthsToAggregate = col.months;
        } else {
          monthsToAggregate = getMonthsForPeriod(col.month);
        }

        // Sum values for all months in the period for ALL matching customers
        matchingKeys.forEach(matchingKey => {
          monthsToAggregate.forEach(monthName => {
            const month = getMonthNumber(monthName);
            const periodKey = `${col.year}-${month}-${col.type}`;
            const monthValue = dashboardData[matchingKey]?.[periodKey] || 0;
            if (typeof monthValue === 'number') {
              aggregatedValue += monthValue;
            }
          });
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

        // Pass column types for smart formula selection
        const deltaResult = calculateDeltaDisplay(newerValue, olderValue, col.fromCol?.type, col.toCol?.type);
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

// Helper function to process data for a single customer
const processCustomerData = (customerName, extendedColumns, dashboardData) => {
  const values = [];
  const dataValues = []; // Store only data values for delta calculation
  
  // Helper to normalize names for matching (handles trailing spaces, case differences)
  const norm = (s) => (s || '').toString().trim().toLowerCase();
  
  // Get all keys from dashboardData for matching
  const dashboardKeys = Object.keys(dashboardData);
  const normalizedCustomerName = norm(customerName);
  
  // Find ALL dashboard keys that match this normalized customer name
  const matchingKeys = dashboardKeys.filter(key => norm(key) === normalizedCustomerName);

  // First pass: process all data columns
  for (let idx = 0; idx < extendedColumns.length; idx++) {
    const col = extendedColumns[idx];

    if (col.columnType === 'data') {
      // Need to aggregate data across months for quarters/custom ranges
      let aggregatedValue = 0;

      // Determine which months to aggregate
      let monthsToAggregate = [];
      if (col.months && Array.isArray(col.months)) {
        monthsToAggregate = col.months;
      } else {
        monthsToAggregate = getMonthsForPeriod(col.month);
      }

      // Sum values for all months in the period from ALL matching customers
      // CRITICAL FIX: Use normalized matching to find all data entries
      matchingKeys.forEach(matchingKey => {
        monthsToAggregate.forEach(monthName => {
          const month = getMonthNumber(monthName);
          const periodKey = `${col.year}-${month}-${col.type}`;
          const monthValue = dashboardData[matchingKey]?.[periodKey] || 0;
          if (typeof monthValue === 'number') {
            aggregatedValue += monthValue;
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

        // Pass column types for smart formula selection
        const deltaResult = calculateDeltaDisplay(newerValue, olderValue, col.fromCol?.type, col.toCol?.type);
        finalValues.push(deltaResult);
      } else {
        finalValues.push('-');
      }
    }
  }

  // Format customer name for display while keeping original for data queries
  const displayName = toProperCase(customerName);

  return {
    name: displayName, // Use formatted name for display
    originalName: customerName, // Keep original for potential future data queries
    values: finalValues,
    rawValues: dataValues // Store raw numeric values for total calculations
  };
};

// Removed unused helper functions

// Removed unused getCustomersForSalesRep function

// Removed unused getConfirmedMerges function - was not being used

const SalesBySaleRepTable = ({ repNameOverride = null }) => {
  const { dataGenerated, columnOrder } = useFilter();
  const { selectedDivision } = useExcelData();
  const { defaultReps, salesRepGroups, loadSalesRepConfig } = useSalesData();
  const { preloadAllReports, loading: reportsLoading } = useSalesRepReports();
  const { hasPermission, user } = useAuth();
  const [activeTab, setActiveTab] = useState(null);

  // NEW: State to store sales reps with actual data
  const [salesRepsWithData, setSalesRepsWithData] = useState([]);
  const [loadingSalesReps, setLoadingSalesReps] = useState(false);

  // Check if user can view Tables tab (admin or has specific permission)
  const canViewTablesTab = hasPermission('dashboard:sales:tables:view', selectedDivision);
  
  // ============================================================================
  // SALES REP PORTAL: Check if user is a sales rep who should only see their own data
  // ============================================================================
  // Sales reps should NOT see other sales reps' tabs/cards
  // They should go directly to their own KPI Summary/Report
  // Use the sales_rep_name field from employees table for exact matching
  // ============================================================================
  
  // Get the user's sales rep name from their employee record
  // This is set explicitly in the employees.sales_rep_name field
  // repNameOverride allows the CRM module to pass the resolved group name directly
  const userSalesRepName = repNameOverride || user?.sales_rep_name || null;
  
  // Check if user is a sales rep - they have sales_rep_name set AND are NOT admin
  // Admin users should always see the full view regardless of sales_rep_name
  const isSalesRepUser = !!repNameOverride || (userSalesRepName && user?.role !== 'admin');

  // Ensure sales rep config is loaded for the current division
  useEffect(() => {
    if (selectedDivision) {
      loadSalesRepConfig(false, selectedDivision);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDivision]); // loadSalesRepConfig removed from dependencies to prevent loop

  // NEW: Fetch sales reps who have actual sales data in the selected period
  useEffect(() => {
    const fetchSalesRepsWithData = async () => {
      if (!selectedDivision || !dataGenerated || !columnOrder || columnOrder.length === 0) return;

      setLoadingSalesReps(true);
      try {
        // Get all sales reps from database
        const allRepsResponse = await fetch(`/api/sales-reps-universal?division=${encodeURIComponent(selectedDivision)}`);
        const allRepsResult = await allRepsResponse.json();

        if (!allRepsResult.success || !allRepsResult.data) {
          setSalesRepsWithData([]);
          setLoadingSalesReps(false);
          return;
        }

        const allSalesReps = allRepsResult.data.map(r => String(r).trim().toUpperCase());

        // Build column list for API call
        const dataColumnsOnly = columnOrder.filter(col => {
          // Skip Budget/Forecast if needed - for now include all
          return true;
        });

        const getColumnKey = (column) => column.id || `${column.year}-${column.month}-${column.type}`;

        // Make ultra-fast API call to get sales data for all reps
        const response = await fetch('/api/sales-rep-divisional-ultra-fast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            division: selectedDivision,
            salesReps: allSalesReps,
            columns: dataColumnsOnly.map(column => ({
              year: column.year,
              month: column.month,
              months: column.months,
              type: column.type || 'Actual',
              columnKey: getColumnKey(column)
            }))
          })
        });

        const result = await response.json();

        if (result.success && result.data) {
          // Extract sales reps who have actual sales in ANY period
          const salesRepsWithSales = new Set();

          Object.keys(result.data).forEach(salesRep => {
            const repData = result.data[salesRep];
            // Check if this rep has sales > 0 in any column
            const hasSales = Object.values(repData).some(value => value > 0);

            // DEBUG: Log each sales rep and their data
            const totalSales = Object.values(repData).reduce((sum, val) => sum + (val || 0), 0);

            if (hasSales) {
              salesRepsWithSales.add(salesRep);
            }
          });

          // Convert to proper case
          const repsWithData = Array.from(salesRepsWithSales).map(name =>
            name.toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
          );

          setSalesRepsWithData(repsWithData);
        } else {
          setSalesRepsWithData([]);
        }
      } catch (error) {
        console.error('Error fetching sales reps with data:', error);
        setSalesRepsWithData([]);
      } finally {
        setLoadingSalesReps(false);
      }
    };

    fetchSalesRepsWithData();
  }, [selectedDivision, dataGenerated, columnOrder]);

  // Pre-load ALL sales rep reports when Report tab is opened
  useEffect(() => {
    if (activeTab === 'report' && selectedDivision && columnOrder && columnOrder.length > 0) {
      const allReps = getFilteredReps();
      if (allReps.length > 0 && !reportsLoading) {
        preloadAllReports(selectedDivision, allReps, columnOrder, true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedDivision, columnOrder]);

  // Handle tab change
  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
  };

  // Check if division is selected
  if (!selectedDivision) {
    return (
      <div className="sales-rep-table-container">
        <div className="table-empty-state">
          <h3>Sales by Sales Rep</h3>
          <p>Please select a division to view sales representative data.</p>
        </div>
      </div>
    );
  }

  // Division status information
  const divisionStatus = {
    'FP': { 
      status: 'active', 
      database: 'fp_data_excel PostgreSQL', 
      message: 'Live data from PostgreSQL database' 
    },
    'SB': { 
      status: 'placeholder', 
      database: 'sb_data PostgreSQL', 
      message: 'Will connect to sb_data PostgreSQL table when implemented' 
    },
    'TF': { 
      status: 'placeholder', 
      database: 'tf_data PostgreSQL', 
      message: 'Will connect to tf_data PostgreSQL table when implemented' 
    },
    'HCM': { 
      status: 'placeholder', 
      database: 'hcm_data PostgreSQL', 
      message: 'Will connect to hcm_data PostgreSQL table when implemented' 
    }
  };

  const currentStatus = divisionStatus[selectedDivision] || { status: 'unknown', database: 'Unknown', message: 'Division not recognized' };

  // Simple loading check - if sales reps are still loading, show loading state
  const isLoading = loadingSalesReps;

  if (isLoading) return (
    <div className="sales-rep-table-container">
      <div className="table-empty-state">Loading sales rep data...</div>
    </div>
  );

  // Show empty state only if we have no sales reps with actual data
  if (!loadingSalesReps && salesRepsWithData.length === 0) return (
    <div className="sales-rep-table-container">
      <div className="table-empty-state">
        <h3>Sales by Sales Rep - {selectedDivision} Division</h3>
        <p>No sales reps found with data for {selectedDivision} division.</p>
        <p>Please ensure there is sales data available for the selected period.</p>
        <div style={{
          marginTop: '15px',
          padding: '10px',
          backgroundColor: currentStatus.status === 'active' ? '#d4edda' : '#fff3cd',
          border: currentStatus.status === 'active' ? '1px solid #c3e6cb' : '1px solid #ffeaa7',
          borderRadius: '4px',
          fontSize: '14px'
        }}>
          <strong>📊 Data Source:</strong> {currentStatus.database}<br/>
          <strong>📝 Status:</strong> {currentStatus.message}
        </div>
      </div>
    </div>
  );

  if (!dataGenerated) {
    return (
      <div className="sales-rep-table-container">
        <h3 className="table-title">Sales Rep Product Group Table - {selectedDivision} Division</h3>
        <div style={{ 
          marginBottom: '15px', 
          padding: '10px', 
          backgroundColor: currentStatus.status === 'active' ? '#d4edda' : '#fff3cd',
          border: currentStatus.status === 'active' ? '1px solid #c3e6cb' : '1px solid #ffeaa7',
          borderRadius: '4px',
          fontSize: '14px'
        }}>
          <strong>📊 Data Source:</strong> {currentStatus.database}<br/>
          <strong>📝 Status:</strong> {currentStatus.message}
        </div>
        <div className="table-empty-state">
          <p>Please select columns and click the Generate button to view sales rep product group data.</p>
        </div>
      </div>
    );
  }

  // NEW: Filter sales reps based on actual data and apply case-insensitive grouping
  const getFilteredReps = () => {
    // Use sales reps with actual data instead of config file
    const actualReps = salesRepsWithData.length > 0 ? salesRepsWithData : [];

    // If no groups exist, just return all reps with data
    if (!salesRepGroups || Object.keys(salesRepGroups).length === 0) {
      return actualReps;
    }

    // Helper function for case-insensitive comparison
    const norm = (s) => (s || '').toString().trim().toLowerCase();

    // Create a set of all sales reps that are members of any group (normalized)
    const groupMembersNormalized = new Set();
    Object.values(salesRepGroups).forEach(members => {
      members.forEach(member => groupMembersNormalized.add(norm(member)));
    });
    // Also add group names themselves (for budget pre-aggregated names like "OTHERS")
    Object.keys(salesRepGroups).forEach(groupName => {
      groupMembersNormalized.add(norm(groupName));
    });

    // Get all group names
    const groupNames = Object.keys(salesRepGroups);

    // Filter to only include groups that have at least one member with actual data
    // OR the group name itself exists in data (for budget pre-aggregated names)
    const groupsWithData = groupNames.filter(groupName => {
      const members = salesRepGroups[groupName] || [];
      return members.some(member =>
        actualReps.some(rep => norm(rep) === norm(member))
      ) || actualReps.some(rep => norm(rep) === norm(groupName));
    });

    // Return only reps that are not members of any group (case-insensitive)
    const standaloneReps = actualReps.filter(rep =>
      !groupMembersNormalized.has(norm(rep))
    );

    // Add all group names that have data to the filtered list
    return [...standaloneReps, ...groupsWithData];
  };

  // ============================================================================
  // SALES REP PORTAL VIEW: Sales rep users see only their own data directly
  // ============================================================================
  if (isSalesRepUser && userSalesRepName) {
    // Find the matching sales rep name in the data (case-insensitive)
    const norm = (s) => (s || '').toString().trim().toLowerCase();
    const allReps = getFilteredReps();
    
    // Find user's rep name in the list (direct match or group membership)
    let matchedRepName = allReps.find(rep => norm(rep) === norm(userSalesRepName));
    
    // If not found directly, check if user is part of a group
    if (!matchedRepName && salesRepGroups) {
      for (const [groupName, members] of Object.entries(salesRepGroups)) {
        if (members.some(member => norm(member) === norm(userSalesRepName))) {
          matchedRepName = groupName;
          break;
        }
      }
    }
    
    // If still not found, try partial matching (e.g., "NAREK KOROUKIAN" in data)
    if (!matchedRepName) {
      matchedRepName = allReps.find(rep => 
        norm(rep).includes(norm(userSalesRepName)) || 
        norm(userSalesRepName).includes(norm(rep))
      );
    }
    
    if (!matchedRepName) {
      return (
        <div className="sales-rep-table-container">
          <div className="table-empty-state">
            <h3>Sales Dashboard</h3>
            <p>No sales data found for your account ({userSalesRepName}).</p>
            <p style={{ color: '#666', fontSize: '14px', marginTop: '10px' }}>
              Please contact your administrator if you believe this is an error.
            </p>
          </div>
        </div>
      );
    }
    
    // Sales rep portal: Show only their Report directly (no tabs, no selector)
    return (
      <div className="sales-rep-table-container">
        <div className="sales-rep-portal-view">
          <SalesRepReportContent rep={matchedRepName} />
        </div>
      </div>
    );
  }
  // ============================================================================
  // END SALES REP PORTAL VIEW
  // ============================================================================

  // Admin/Manager view: Show all sales reps with tabs
  return (
    <div className="sales-rep-table-container">
      <TabsComponent defaultActiveTab={1} onTabChange={handleTabChange}>
        {/* Sales Rep Tabs First */}
        {getFilteredReps().map((rep, index) => {
          return (
            <Tab key={rep} label={toProperCase(rep)}>
              <div className="sales-rep-content">
                {/* Sub-tabs for Tables and Report - Tables only visible with permission */}
                <TabsComponent defaultActiveTab={0} className="sub-tabs">
                  {canViewTablesTab && (
                    <Tab key={`${rep}-tables`} label="Tables" className="sub-tab-tables">
                      <SalesRepTabContent rep={rep} />
                    </Tab>
                  )}
                  <Tab key={`${rep}-report`} label="Report" className="sub-tab-report">
                    {reportsLoading && index === 0 && (
                      <div style={{
                        padding: '20px',
                        textAlign: 'center',
                        backgroundColor: '#e3f2fd',
                        borderRadius: '8px',
                        marginBottom: '20px'
                      }}>
                        🚀 Loading all sales rep reports in background... This will make switching between reports super fast!
                      </div>
                    )}
                    <SalesRepReportContent rep={rep} />
                  </Tab>
                </TabsComponent>
              </div>
            </Tab>
          );
        })}
      </TabsComponent>
    </div>
  );
};

// Component to display static product group structure for each tab
const SalesRepTabContent = ({ rep }) => {
  const { columnOrder, basePeriodIndex } = useFilter();
  const { selectedDivision } = useExcelData();
  const { salesRepGroups } = useSalesData(); // Access to sales rep groups
  const [kgsData, setKgsData] = useState([]);
  const [amountData, setAmountData] = useState([]);
  const [mormData, setMormData] = useState([]);
  const [customerData, setCustomerData] = useState([]);
  const [customerAmountData, setCustomerAmountData] = useState([]); // NEW: Customer Amount data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ============================================================================
  // REMOVED: Customer merge state variables and handlers
  // ============================================================================
  // The following state variables have been removed:
  //   - selectedCustomers, setSelectedCustomers
  //   - newGroupName, setNewGroupName
  //   - editingGroup, setEditingGroup
  //   - customersToRemove, setCustomersToRemove
  //   - operationFeedback, setOperationFeedback
  //   - showFeedback function
  //   - enableMergeUI flag
  //
  // Customer merging is now managed exclusively in Master Data > Customer Merging
  // ============================================================================

  // Helper function to check if rep is a group
  const isGroup = (repName) => {
    return salesRepGroups && Object.keys(salesRepGroups).includes(repName);
  };

  // Helper function to get group members
  const getGroupMembers = (groupName) => {
    if (!salesRepGroups || !salesRepGroups[groupName]) return [groupName];
    return salesRepGroups[groupName];
  };

  // Helper function to aggregate product group data across multiple sales reps
  const aggregateProductGroupData = (allRepsData) => {
    if (allRepsData.length === 0) return [];
    if (allRepsData.length === 1) return allRepsData[0];

    // Get all unique product groups
    const productGroupMap = {};

    allRepsData.forEach(repData => {
      repData.forEach(pg => {
        if (!productGroupMap[pg.name]) {
          productGroupMap[pg.name] = {
            name: pg.name,
            values: new Array(pg.values.length).fill(0),
            rawValues: new Array(pg.rawValues?.length || 0).fill(0)
          };
        }

        // Sum up the raw values
        pg.rawValues?.forEach((value, idx) => {
          if (typeof value === 'number') {
            productGroupMap[pg.name].rawValues[idx] += value;
          }
        });
      });
    });

    // Convert map back to array and recalculate formatted values and deltas
    const extendedColumns = buildExtendedColumns(columnOrder);
    return Object.values(productGroupMap).map(pg => {
      const values = [];
      const dataValues = pg.rawValues;
      let dataIndex = 0;

      for (let idx = 0; idx < extendedColumns.length; idx++) {
        const col = extendedColumns[idx];

        if (col.columnType === 'data') {
          values.push(dataValues[dataIndex]);
          dataIndex++;
        } else if (col.columnType === 'delta') {
          const newerDataIndex = dataIndex;
          const olderDataIndex = dataIndex - 1;

          if (olderDataIndex >= 0 && newerDataIndex < dataValues.length) {
            const newerValue = dataValues[newerDataIndex];
            const olderValue = dataValues[olderDataIndex];
            // Pass column types for smart formula selection
            const deltaResult = calculateDeltaDisplay(newerValue, olderValue, col.fromCol?.type, col.toCol?.type);
            values.push(deltaResult);
          } else {
            values.push('-');
          }
        }
      }

      return {
        name: pg.name,
        values,
        rawValues: dataValues
      };
    });
  };

  // Helper function to aggregate customer data across multiple sales reps
  const aggregateCustomerData = (allCustomerData) => {
    if (allCustomerData.length === 0) return [];
    if (allCustomerData.length === 1) return allCustomerData[0];

    // DEBUG: Log what's being aggregated

    // Get all unique customers across all reps
    const customerMap = {};
    
    // Helper to normalize keys for deduplication
    const normalizeKey = (s) => (s || '').toString().trim().toLowerCase();

    allCustomerData.forEach((repCustomers, repIndex) => {
      repCustomers.forEach(customer => {
        // Normalize the key to prevent duplicates due to case/spacing differences
        const rawKey = customer.originalName || customer.name;
        // DEBUG: Log Al Ain specifically with ACTUAL VALUES
        if (rawKey && rawKey.toLowerCase().includes('al ain food')) {
        }
        const customerKey = normalizeKey(rawKey);

        if (!customerMap[customerKey]) {
          customerMap[customerKey] = {
            name: customer.name,
            originalName: customer.originalName,
            values: new Array(customer.values.length).fill(0),
            rawValues: new Array(customer.rawValues?.length || 0).fill(0),
            isMerged: customer.isMerged,
            mergedCustomers: customer.mergedCustomers
          };
        }

        // Sum up the raw values
        customer.rawValues?.forEach((value, idx) => {
          if (typeof value === 'number') {
            customerMap[customerKey].rawValues[idx] += value;
          }
        });
      });
    });

    // Convert map back to array and recalculate formatted values and deltas
    const extendedColumns = buildExtendedColumns(columnOrder);
    return Object.values(customerMap).map(customer => {
      const values = [];
      const dataValues = customer.rawValues;
      let dataIndex = 0;

      for (let idx = 0; idx < extendedColumns.length; idx++) {
        const col = extendedColumns[idx];

        if (col.columnType === 'data') {
          values.push(dataValues[dataIndex]);
          dataIndex++;
        } else if (col.columnType === 'delta') {
          const newerDataIndex = dataIndex;
          const olderDataIndex = dataIndex - 1;

          if (olderDataIndex >= 0 && newerDataIndex < dataValues.length) {
            const newerValue = dataValues[newerDataIndex];
            const olderValue = dataValues[olderDataIndex];
            // Pass column types for smart formula selection
            const deltaResult = calculateDeltaDisplay(newerValue, olderValue, col.fromCol?.type, col.toCol?.type);
            values.push(deltaResult);
          } else {
            values.push('-');
          }
        }
      }

      return {
        name: customer.name,
        originalName: customer.originalName,
        values,
        rawValues: dataValues,
        isMerged: customer.isMerged,
        mergedCustomers: customer.mergedCustomers
      };
    });
  };

    const fetchData = async () => {
      if (!rep || !columnOrder || columnOrder.length === 0) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // UNIFIED FIX: With sales_rep_group_name architecture, we no longer need to expand groups
        // The backend uses sales_rep_group_name column which already has the group name
        // So we pass the group name directly, just like we do for individuals
        const isRepGroup = isGroup(rep);
        

        // OPTIMIZED: Use new unified batch API endpoint for better performance
        const periods = preparePeriods(columnOrder);

        // UNIFIED: Always fetch using the group name directly (or individual name)
        // The backend's sales_rep_group_name column already stores group names like "Riad & Nidal"
        {
          const response = await fetch('/api/sales-rep-complete-data', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              division: selectedDivision,
              salesRep: rep,  // Use the group name directly
              periods
            })
          });

          if (!response.ok) {
            throw new Error(`API request failed with status: ${response.status}`);
          }

          const result = await response.json();

          if (result.success) {
            // Process the unified data response
            const { productGroups, customers, dashboardData, customerData, customerAmountData: customerAmountDataFromAPI } = result.data;

            // Build extended columns structure
            const extendedColumns = buildExtendedColumns(columnOrder);

            // Process product group data for each value type
            const processProductGroupsForValueType = (valueType) => {
              const sortedProductGroups = sortProductGroups(productGroups);
              return sortedProductGroups.map((pgName) => {
                const values = [];
                const dataValues = [];

                // Process data columns
                for (let idx = 0; idx < extendedColumns.length; idx++) {
                  const col = extendedColumns[idx];

                  if (col.columnType === 'data') {
                    // Use aggregateColumnData to properly handle month aggregation
                    const value = aggregateColumnData(pgName, valueType, col, dashboardData);
                    dataValues.push(value);
                    values.push(value);
                  }
                }

                // Insert delta calculations
                const finalValues = [];
                let dataIndex = 0;

                for (let idx = 0; idx < extendedColumns.length; idx++) {
                  const col = extendedColumns[idx];

                  if (col.columnType === 'data') {
                    finalValues.push(values[dataIndex]);
                    dataIndex++;
                  } else if (col.columnType === 'delta') {
                    const newerDataIndex = dataIndex;
                    const olderDataIndex = dataIndex - 1;

                    if (olderDataIndex >= 0 && newerDataIndex < dataValues.length) {
                      const newerValue = dataValues[newerDataIndex];
                      const olderValue = dataValues[olderDataIndex];
                      // Pass column types for smart formula selection
                      const deltaResult = calculateDeltaDisplay(newerValue, olderValue, col.fromCol?.type, col.toCol?.type);
                      finalValues.push(deltaResult);
                    } else {
                      finalValues.push('-');
                    }
                  }
                }

                return {
                  name: pgName,
                  values: finalValues,
                  rawValues: dataValues
                };
              });
            };

            // Apply saved merge rules to customer data BEFORE processing (KGS)
            // Convert customerData to dashboardData format expected by applySavedMergeRules
            // CRITICAL FIX: Use ALL customers from KGS data (includes Budget-only customers)
            const kgsCustomers = Object.keys(customerData || {});
            const dashboardDataForMerge = {};
            kgsCustomers.forEach(customerName => {
              dashboardDataForMerge[customerName] = customerData[customerName];
            });

            const { customers: finalCustomerData } = await applySavedMergeRules(
              rep, // Use rep name directly for merge rules
              selectedDivision,
              kgsCustomers, // CRITICAL FIX: Use kgsCustomers instead of customers
              dashboardDataForMerge, // Customer data in dashboard format
              extendedColumns
            );

            // Apply saved merge rules to customer AMOUNT data BEFORE processing
            // CRITICAL FIX: Use ALL customers from Amount data (includes Budget-only customers)
            const amountCustomers = Object.keys(customerAmountDataFromAPI || {});
            const dashboardDataForAmountMerge = {};
            amountCustomers.forEach(customerName => {
              dashboardDataForAmountMerge[customerName] = customerAmountDataFromAPI[customerName] || {};
            });

            const { customers: finalCustomerAmountData } = await applySavedMergeRules(
              rep, // Use rep name directly for merge rules
              selectedDivision,
              amountCustomers, // CRITICAL FIX: Use amountCustomers instead of customers
              dashboardDataForAmountMerge, // Customer Amount data in dashboard format
              extendedColumns
            );

            // Sort customers by base period volume (highest to lowest)
            if (basePeriodIndex != null && basePeriodIndex >= 0) {
              finalCustomerData.sort((a, b) => {
                const aValue = a.rawValues[basePeriodIndex] || 0;
                const bValue = b.rawValues[basePeriodIndex] || 0;
                return bValue - aValue; // Sort descending (highest first)
              });
              finalCustomerAmountData.sort((a, b) => {
                const aValue = a.rawValues[basePeriodIndex] || 0;
                const bValue = b.rawValues[basePeriodIndex] || 0;
                return bValue - aValue; // Sort descending (highest first)
              });
            }

            // Set all data at once
            setKgsData(processProductGroupsForValueType('KGS'));
            setAmountData(processProductGroupsForValueType('Amount'));
            setMormData(processProductGroupsForValueType('MoRM'));
            setCustomerData(finalCustomerData);
            setCustomerAmountData(finalCustomerAmountData); // NEW: Set customer Amount data

          } else {
            throw new Error(result.message || 'Failed to fetch data');
          }
        }
      } catch (error) {
        console.error('Error fetching data with batch API, falling back to individual calls:', error);
        
        // Fallback to original individual API calls
        try {
          const [kgsResult, amountResult, mormResult] = await Promise.all([
            getProductGroupsForSalesRep(rep, 'KGS', columnOrder, selectedDivision),
            getProductGroupsForSalesRep(rep, 'Amount', columnOrder, selectedDivision),
            getProductGroupsForSalesRep(rep, 'MoRM', columnOrder, selectedDivision)
          ]);

          const { customers, dashboardData } = await fetchCustomerDashboardData(rep, preparePeriods(columnOrder), selectedDivision);
          const extendedColumns = buildExtendedColumns(columnOrder);
          
          const { customers: processedResult } = await applySavedMergeRules(rep, selectedDivision, customers, dashboardData, extendedColumns);
          
          if (basePeriodIndex != null && basePeriodIndex >= 0) {
            processedResult.sort((a, b) => {
              const aValue = a.rawValues[basePeriodIndex] || 0;
              const bValue = b.rawValues[basePeriodIndex] || 0;
              return bValue - aValue;
            });
          }

          setKgsData(kgsResult);
          setAmountData(amountResult);
          setMormData(mormResult);
          setCustomerData(processedResult);
          setCustomerAmountData([]); // Fallback doesn't support customer amount yet
          
        } catch (fallbackError) {
          console.error('Fallback error:', fallbackError);
          setError('Failed to load data. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    fetchData();
  }, [rep, columnOrder, basePeriodIndex, selectedDivision]); // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================================================
  // REMOVED: Customer merge handler functions
  // ============================================================================
  // The following handler functions have been removed:
  //   - handleCustomerSelect
  //   - handleEditGroup
  //   - handleRemoveCustomer
  //   - handleSaveEdit
  //   - handleCancelEdit
  //   - handleCreateGroup
  //
  // Customer merging is now managed exclusively in Master Data > Customer Merging
  // ============================================================================

  // Create extended columns with delta columns, with optional Budget/Forecast filtering
  const createExtendedColumns = () => {
    // Filter columns based on user preferences
    const filteredColumns = columnOrder.filter(col => {
      return true;
    });
    
  const extendedColumns = [];
    
    filteredColumns.forEach((col, index) => {
    extendedColumns.push({
      ...col,
      columnType: 'data',
      label: `${col.year}-${col.isCustomRange ? col.displayName : col.month}-${col.type}`
    });
    
      // Add delta column after each data column (except the last one)
      if (index < filteredColumns.length - 1) {
        const fromCol = col;
        const toCol = filteredColumns[index + 1];
        extendedColumns.push({
          columnType: 'delta',
          label: 'Delta',
          fromCol: fromCol,
          toCol: toCol,
          deltaLabel: getDeltaLabel(fromCol, toCol)
        });
      }
    });
    
    return extendedColumns;
  };

  const extendedColumns = createExtendedColumns();
  
  // Helper functions for styling and formatting
  const getColumnHeaderStyle = (col) => {
    if (col.columnType === 'delta') {
      return { backgroundColor: '#f5f5f5', color: '#666' };
    }
    
    const palette = getColumnColorPalette(col);
    return {
      background: palette.gradient,
      color: palette.text
    };
  };
  
  // Removed unused getCellStyle function

  // Check if a column is the base period
  const isBasePeriodColumn = (colIndex) => {
    if (basePeriodIndex === null || basePeriodIndex === undefined) return false;
    
    // Count data columns up to this index
    const dataColumnsBeforeThis = extendedColumns.slice(0, colIndex).filter(col => col.columnType === 'data').length;
    return dataColumnsBeforeThis === basePeriodIndex;
  };

  // Calculate totals for a specific column across all product groups or customers
  const calculateColumnTotal = (data, columnIndex, extendedCols) => {
    // Map columnIndex to rawValues index (skip delta columns)
    const dataColumnIndex = extendedCols.slice(0, columnIndex).filter(col => col.columnType === 'data').length;
    
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

  // Format number for display
  const formatValue = (value, variable) => {
    if (typeof value !== 'number') return value || '-';
    
    if (variable === 'Amount') {
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(value);
    } else if (variable === 'MoRM') {
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(value);
    } else {
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(value);
    }
  };

  const formatTotalValue = (value, variable) => {
    if (variable === 'Amount') {
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(value);
    } else if (variable === 'MoRM') {
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(value);
    } else {
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(value);
    }
  };

  // Calculate delta for total row with CORRECT formula based on comparison type
  const calculateTotalDelta = (data, fromIndex, toIndex, extendedCols) => {
    const fromTotal = calculateColumnTotal(data, fromIndex, extendedCols);
    const toTotal = calculateColumnTotal(data, toIndex, extendedCols);
    
    // Get column types from extendedColumns
    const fromCol = extendedCols[fromIndex];
    const toCol = extendedCols[toIndex];
    const fromType = (fromCol?.type || 'Actual').toLowerCase();
    const toType = (toCol?.type || 'Actual').toLowerCase();
    
    let actualValue, referenceValue;
    
    // Determine which is Actual and which is Reference (Budget/Estimate/Forecast)
    if (fromType === 'actual' && (toType === 'budget' || toType === 'estimate' || toType === 'forecast')) {
      // From is Actual, To is Budget/Est/Fcst: (Actual - Reference) / Reference
      actualValue = fromTotal;
      referenceValue = toTotal;
    } else if ((fromType === 'budget' || fromType === 'estimate' || fromType === 'forecast') && toType === 'actual') {
      // From is Budget/Est/Fcst, To is Actual: (Actual - Reference) / Reference
      actualValue = toTotal;
      referenceValue = fromTotal;
    } else {
      // YoY or other: (newer - older) / older
      actualValue = toTotal;
      referenceValue = fromTotal;
    }
    
    if (referenceValue === 0) return { arrow: '', value: '', color: 'black' };
    
    const delta = ((actualValue - referenceValue) / referenceValue) * 100;
    const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '';
    const color = delta > 0 ? '#288cfa' : delta < 0 ? '#dc3545' : 'black';
    
    // Format delta based on range: -99.99% to +99.9% should have decimals, outside should not
    const absDelta = Math.abs(delta);
    let formattedValue;
    
    if (absDelta >= 99.99) {
      // Outside range: no decimals
      formattedValue = Math.round(absDelta) + '%';
    } else {
      // Within range: with decimals
      formattedValue = absDelta.toFixed(1) + '%';
    }
    
    return { arrow, value: formattedValue, color };
  };
  
  // Helper function to filter out rows with all zero values
  const filterZeroRows = (data) => {
    return data.filter(row => {
      // Check if ANY data column (Actual OR Budget) has a positive value
      const hasPositiveValue = extendedColumns.some((col, colIndex) => {
        if (col.columnType === 'data') {
          const val = row.values[colIndex];
          
          if (typeof val === 'string') {
            // Handle string values - check if it's a positive number
            const numValue = parseFloat(val);
            return !isNaN(numValue) && numValue > 0;
          }
          if (typeof val === 'number') {
            // Handle numeric values - check if it's positive
            return !isNaN(val) && val > 0;
          }
        }
        return false;
      });
      return hasPositiveValue;
    });
  };
  

  
  const hiddenAmountColumnIndices = new Set(); // No columns hidden for now
  
  // Custom header rendering for tables
  const renderAmountHeaderWithBlanks = () => (
    <thead>
      {/* Star Indicator Row */}
      <tr>
        <th className="product-header star-cell"></th>
        <th className="spacer-col" style={{ width: '10px', minWidth: '10px', maxWidth: '10px', background: 'transparent', border: 'none', padding: 0 }}></th>
        {extendedColumns.map((col, idx) => {
          if (hiddenAmountColumnIndices.has(idx)) {
            return <th key={`star-blank-${idx}`} className="star-cell"></th>;
          }
          if (col.columnType === 'delta') {
            return <th key={`star-delta-${idx}`} className="star-cell"></th>;
          }
          return (
            <th 
              key={`star-${idx}`} 
              className="star-cell"
              style={{ 
                color: isBasePeriodColumn(idx) ? '#FFD700' : 'transparent',
                fontSize: '32px'
              }}
            >
              {isBasePeriodColumn(idx) ? '★' : ''}
            </th>
          );
        })}
      </tr>
      <tr className="main-header-row">
        <th className="product-header" rowSpan={3}>Product Groups</th>
        <th className="spacer-col" rowSpan={3} style={{ width: '10px', minWidth: '10px', maxWidth: '10px', background: 'transparent', border: 'none', padding: 0 }}></th>
        {extendedColumns.map((col, idx) => {
          if (hiddenAmountColumnIndices.has(idx)) {
            return <th key={`blank-${idx}`} className="amount-table-blank-cell"></th>;
          }
          if (col.columnType === 'delta') {
            return <th key={`delta-${idx}`} rowSpan={3} style={getColumnHeaderStyle({ columnType: 'delta' })} className="delta-header">{col.deltaLabel}<br />%</th>;
          }
          return <th key={`year-${idx}`} style={getColumnHeaderStyle(col)} className="period-header">{col.year}</th>;
        })}
      </tr>
      <tr className="main-header-row">
        {extendedColumns.map((col, idx) => {
          if (hiddenAmountColumnIndices.has(idx)) return <th key={`blank2-${idx}`} className="amount-table-blank-cell"></th>;
          if (col.columnType === 'delta') return null;
          return <th key={`month-${idx}`} style={getColumnHeaderStyle(col)} className="period-header">{col.isCustomRange ? col.displayName : col.month}</th>;
        })}
      </tr>
      <tr className="main-header-row">
        {extendedColumns.map((col, idx) => {
          if (hiddenAmountColumnIndices.has(idx)) return <th key={`blank3-${idx}`} className="amount-table-blank-cell"></th>;
          if (col.columnType === 'delta') return null;
          return <th key={`type-${idx}`} style={getColumnHeaderStyle(col)} className="period-header">{col.type}</th>;
        })}
      </tr>
    </thead>
  );
  
  // Check loading state
  if (loading) {
    return (
      <div className="sales-rep-content">
        <div className="sales-rep-title">{rep}</div>
        <div className="table-empty-state">Loading data...</div>
      </div>
    );
  }

  // Check error state
  if (error) {
    return (
      <div className="sales-rep-content">
        <div className="sales-rep-title">{rep}</div>
        <div className="table-empty-state" style={{ color: '#d84315' }}>{error}</div>
      </div>
    );
  }

  // Check if columnOrder is available
  if (!columnOrder || columnOrder.length === 0) {
    return (
      <div className="sales-rep-content">
        <div className="sales-rep-title">{rep}</div>
        <div className="table-empty-state">Please select columns to view data.</div>
      </div>
    );
  }
  
  return (
    <div className="sales-rep-content">
      <div className="sales-rep-title">{rep}</div>

      <div className="sales-rep-subtitle">Product Groups - Sales Kgs Comparison</div>
      <table className="financial-table">
        {renderAmountHeaderWithBlanks()}
        <tbody>
          {filterZeroRows(kgsData).map(pg => (
            <tr key={pg.name} className="product-header-row">
              <td className="row-label product-header">{pg.name}</td>
              <td className="spacer-col" style={{ width: '10px', minWidth: '10px', maxWidth: '10px', background: 'transparent', border: 'none', padding: 0 }}></td>
              {extendedColumns.map((col, idx) => {
                if (hiddenAmountColumnIndices.has(idx)) return <td key={`blank-${idx}`} className="amount-table-blank-cell"></td>;
                const val = pg.values[idx];
                if (col.columnType === 'delta') {
                  if (typeof val === 'object' && val !== null) {
                    // New object format with color and arrow
                    return (
                      <td key={idx} className="metric-cell delta-cell" style={{ color: val.color }}>
                        <span className="delta-arrow">{val.arrow}</span>
                        <span className="delta-value">{val.value}</span>
                      </td>
                    );
                  } else if (typeof val === 'string') {
                    // Legacy string format
                    let deltaClass = '';
                    if (val.includes('▲')) deltaClass = 'delta-up';
                    else if (val.includes('▼')) deltaClass = 'delta-down';
                    return <td key={idx} className={`metric-cell ${deltaClass}`}>{val}</td>;
                  }
                  return <td key={idx} className="metric-cell">{val || '-'}</td>;
                }
                return <td key={idx} className="metric-cell">{formatValue(val, 'KGS')}</td>;
              })}
            </tr>
          ))}
          {/* Total Row for KGS */}
          <tr className="total-row">
            <td className="total-label">Total</td>
            <td className="spacer-col" style={{ width: '10px', minWidth: '10px', maxWidth: '10px', background: 'transparent', border: 'none', padding: 0 }}></td>
            {extendedColumns.map((col, idx) => {
              if (hiddenAmountColumnIndices.has(idx)) return <td key={`total-blank-${idx}`} className="amount-table-blank-cell"></td>;
              if (col.columnType === 'delta') {
                // Find the corresponding data columns for delta calculation
                const dataColumns = extendedColumns.filter(c => c.columnType === 'data');
                const deltaIndex = extendedColumns.slice(0, idx).filter(c => c.columnType === 'delta').length;
                if (deltaIndex < dataColumns.length - 1) {
                  const fromIndex = extendedColumns.findIndex(c => c === dataColumns[deltaIndex]);
                  const toIndex = extendedColumns.findIndex(c => c === dataColumns[deltaIndex + 1]);
                  const delta = calculateTotalDelta(filterZeroRows(kgsData), fromIndex, toIndex, extendedColumns);
                  return (
                    <td key={`total-delta-${idx}`} className="metric-cell delta-cell" style={{ color: delta.color }}>
                      <span className="delta-arrow">{delta.arrow}</span>
                      <span className="delta-value">{delta.value}</span>
                    </td>
                  );
                }
                return <td key={`total-delta-${idx}`} className="metric-cell">-</td>;
              }
              const totalValue = calculateColumnTotal(filterZeroRows(kgsData), idx, extendedColumns);
              return <td key={`total-${idx}`} className="metric-cell">{formatTotalValue(totalValue, 'KGS')}</td>;
            })}
          </tr>
        </tbody>
      </table>
      <div className="table-separator" />
      <div className="sales-rep-subtitle">Product Groups - <CurrencySymbol /> Sales Amount Comparison</div>
      <table className="financial-table">
        {renderAmountHeaderWithBlanks()}
        <tbody>
          {filterZeroRows(amountData).map(pg => (
            <tr key={pg.name} className="product-header-row">
              <td className="row-label product-header">{pg.name}</td>
              <td className="spacer-col" style={{ width: '10px', minWidth: '10px', maxWidth: '10px', background: 'transparent', border: 'none', padding: 0 }}></td>
              {extendedColumns.map((col, idx) => {
                if (hiddenAmountColumnIndices.has(idx)) return <td key={`blank-${idx}`} className="amount-table-blank-cell"></td>;
                const val = pg.values[idx];
                if (col.columnType === 'delta') {
                  if (typeof val === 'object' && val !== null) {
                    // New object format with color and arrow
                    return (
                      <td key={idx} className="metric-cell delta-cell" style={{ color: val.color }}>
                        <span className="delta-arrow">{val.arrow}</span>
                        <span className="delta-value">{val.value}</span>
                      </td>
                    );
                  } else if (typeof val === 'string') {
                    // Legacy string format
                    let deltaClass = '';
                    if (val.includes('▲')) deltaClass = 'delta-up';
                    else if (val.includes('▼')) deltaClass = 'delta-down';
                    return <td key={idx} className={`metric-cell ${deltaClass}`}>{val}</td>;
                  }
                  return <td key={idx} className="metric-cell">{val || '-'}</td>;
                }
                return <td key={idx} className="metric-cell">{formatValue(val, 'Amount')}</td>;
              })}
            </tr>
          ))}
          {/* Total Row for Amount */}
          <tr className="total-row">
            <td className="total-label">Total</td>
            <td className="spacer-col" style={{ width: '10px', minWidth: '10px', maxWidth: '10px', background: 'transparent', border: 'none', padding: 0 }}></td>
            {extendedColumns.map((col, idx) => {
              if (hiddenAmountColumnIndices.has(idx)) return <td key={`total-blank-${idx}`} className="amount-table-blank-cell"></td>;
              if (col.columnType === 'delta') {
                // Find the corresponding data columns for delta calculation
                const dataColumns = extendedColumns.filter(c => c.columnType === 'data');
                const deltaIndex = extendedColumns.slice(0, idx).filter(c => c.columnType === 'delta').length;
                if (deltaIndex < dataColumns.length - 1) {
                  const fromIndex = extendedColumns.findIndex(c => c === dataColumns[deltaIndex]);
                  const toIndex = extendedColumns.findIndex(c => c === dataColumns[deltaIndex + 1]);
                  const delta = calculateTotalDelta(filterZeroRows(amountData), fromIndex, toIndex, extendedColumns);
                  return (
                    <td key={`total-delta-${idx}`} className="metric-cell delta-cell" style={{ color: delta.color }}>
                      <span className="delta-arrow">{delta.arrow}</span>
                      <span className="delta-value">{delta.value}</span>
                    </td>
                  );
                }
                return <td key={`total-delta-${idx}`} className="metric-cell">-</td>;
              }
              const totalValue = calculateColumnTotal(filterZeroRows(amountData), idx, extendedColumns);
              return <td key={`total-${idx}`} className="metric-cell">{formatTotalValue(totalValue, 'Amount')}</td>;
            })}
          </tr>
        </tbody>
      </table>
      <div className="table-separator" />
      <div className="sales-rep-subtitle">Product Groups - <CurrencySymbol /> Margin over RM Comparison</div>
      <table className="financial-table">
        {renderAmountHeaderWithBlanks()}
        <tbody>
          {filterZeroRows(mormData).map(pg => (
            <tr key={pg.name} className="product-header-row">
              <td className="row-label product-header">{pg.name}</td>
              <td className="spacer-col" style={{ width: '10px', minWidth: '10px', maxWidth: '10px', background: 'transparent', border: 'none', padding: 0 }}></td>
              {extendedColumns.map((col, idx) => {
                if (hiddenAmountColumnIndices.has(idx)) return <td key={`blank-${idx}`} className="amount-table-blank-cell"></td>;
                const val = pg.values[idx];
                if (col.columnType === 'delta') {
                  if (typeof val === 'object' && val !== null) {
                    // New object format with color and arrow
                    return (
                      <td key={idx} className="metric-cell delta-cell" style={{ color: val.color }}>
                        <span className="delta-arrow">{val.arrow}</span>
                        <span className="delta-value">{val.value}</span>
                      </td>
                    );
                  } else if (typeof val === 'string') {
                    // Legacy string format
                    let deltaClass = '';
                    if (val.includes('▲')) deltaClass = 'delta-up';
                    else if (val.includes('▼')) deltaClass = 'delta-down';
                    return <td key={idx} className={`metric-cell ${deltaClass}`}>{val}</td>;
                  }
                  return <td key={idx} className="metric-cell">{val || '-'}</td>;
                }
                return <td key={idx} className="metric-cell">{formatValue(val, 'MoRM')}</td>;
              })}
            </tr>
          ))}
          {/* Total Row for MoRM */}
          <tr className="total-row">
            <td className="total-label">Total</td>
            <td className="spacer-col" style={{ width: '10px', minWidth: '10px', maxWidth: '10px', background: 'transparent', border: 'none', padding: 0 }}></td>
            {extendedColumns.map((col, idx) => {
              if (hiddenAmountColumnIndices.has(idx)) return <td key={`total-blank-${idx}`} className="amount-table-blank-cell"></td>;
              if (col.columnType === 'delta') {
                // Find the corresponding data columns for delta calculation
                const dataColumns = extendedColumns.filter(c => c.columnType === 'data');
                const deltaIndex = extendedColumns.slice(0, idx).filter(c => c.columnType === 'delta').length;
                if (deltaIndex < dataColumns.length - 1) {
                  const fromIndex = extendedColumns.findIndex(c => c === dataColumns[deltaIndex]);
                  const toIndex = extendedColumns.findIndex(c => c === dataColumns[deltaIndex + 1]);
                  const delta = calculateTotalDelta(filterZeroRows(mormData), fromIndex, toIndex, extendedColumns);
                  return (
                    <td key={`total-delta-${idx}`} className="metric-cell delta-cell" style={{ color: delta.color }}>
                      <span className="delta-arrow">{delta.arrow}</span>
                      <span className="delta-value">{delta.value}</span>
                    </td>
                  );
                }
                return <td key={`total-delta-${idx}`} className="metric-cell">-</td>;
              }
              const totalValue = calculateColumnTotal(filterZeroRows(mormData), idx, extendedColumns);
              return <td key={`total-${idx}`} className="metric-cell">{formatTotalValue(totalValue, 'MoRM')}</td>;
            })}
          </tr>
        </tbody>
      </table>
      <div className="table-separator" />
      <div className="sales-rep-subtitle">Customers - Sales Kgs Comparison</div>
      <table className="financial-table">
        <thead>
          {/* Star Indicator Row */}
          <tr>
            <th className="product-header star-cell"></th>
            <th className="spacer-col" style={{ width: '10px', minWidth: '10px', maxWidth: '10px', background: 'transparent', border: 'none', padding: 0 }}></th>
            {extendedColumns.map((col, idx) => {
              if (hiddenAmountColumnIndices.has(idx)) {
                return <th key={`star-blank-${idx}`} className="star-cell"></th>;
              }
              if (col.columnType === 'delta') {
                return <th key={`star-delta-${idx}`} className="star-cell"></th>;
              }
              return (
                <th 
                  key={`star-${idx}`} 
                  className="star-cell"
                  style={{ 
                    textAlign: 'center', 
                    padding: '4px',
                    fontSize: '32px',
                    color: isBasePeriodColumn(idx) ? '#FFD700' : 'transparent'
                  }}
                >
                  {isBasePeriodColumn(idx) ? '★' : ''}
                </th>
              );
            })}
          </tr>
          <tr className="main-header-row">
            <th className="product-header" rowSpan={3}>Customers</th>
            <th className="spacer-col" rowSpan={3} style={{ width: '10px', minWidth: '10px', maxWidth: '10px', background: 'transparent', border: 'none', padding: 0 }}></th>
            {extendedColumns.map((col, idx) => {
              if (hiddenAmountColumnIndices.has(idx)) {
                return <th key={`blank-${idx}`} className="amount-table-blank-cell"></th>;
              }
              if (col.columnType === 'delta') {
                return <th key={`delta-${idx}`} rowSpan={3} style={getColumnHeaderStyle({ columnType: 'delta' })} className="delta-header">{col.deltaLabel}<br />%</th>;
              }
              return <th key={`year-${idx}`} style={getColumnHeaderStyle(col)} className="period-header">{col.year}</th>;
            })}
          </tr>
          <tr className="main-header-row">
            {extendedColumns.map((col, idx) => {
              if (hiddenAmountColumnIndices.has(idx)) return <th key={`blank2-${idx}`} className="amount-table-blank-cell"></th>;
              if (col.columnType === 'delta') return null;
              return <th key={`month-${idx}`} style={getColumnHeaderStyle(col)} className="period-header">{col.isCustomRange ? col.displayName : col.month}</th>;
            })}
          </tr>
          <tr className="main-header-row">
            {extendedColumns.map((col, idx) => {
              if (hiddenAmountColumnIndices.has(idx)) return <th key={`blank3-${idx}`} className="amount-table-blank-cell"></th>;
              if (col.columnType === 'delta') return null;
              return <th key={`type-${idx}`} style={getColumnHeaderStyle(col)} className="period-header">{col.type}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {filterZeroRows(customerData).map(customer => (
            <tr key={customer.name} className="product-header-row">
              <td className="row-label product-header" title={customer.name}>
                {customer.name}
              </td>
              <td className="spacer-col" style={{ width: '10px', minWidth: '10px', maxWidth: '10px', background: 'transparent', border: 'none', padding: 0 }}></td>
              {extendedColumns.map((col, idx) => {
                if (hiddenAmountColumnIndices.has(idx)) return <td key={`blank-${idx}`} className="amount-table-blank-cell"></td>;
                const val = customer.values[idx];
                if (col.columnType === 'delta') {
                  if (typeof val === 'object' && val !== null) {
                    // New object format with color and arrow
                    return (
                      <td key={idx} className="metric-cell delta-cell" style={{ color: val.color }}>
                        <span className="delta-arrow">{val.arrow}</span>
                        <span className="delta-value">{val.value}</span>
                      </td>
                    );
                  } else if (typeof val === 'string') {
                    // Legacy string format
                    let deltaClass = '';
                    if (val.includes('▲')) deltaClass = 'delta-up';
                    else if (val.includes('▼')) deltaClass = 'delta-down';
                    return <td key={idx} className={`metric-cell ${deltaClass}`}>{val}</td>;
                  }
                  return <td key={idx} className="metric-cell">{val || '-'}</td>;
                }
                return <td key={idx} className="metric-cell">{formatValue(val, 'KGS')}</td>;
              })}
            </tr>
          ))}
          {/* Total Row for Customers */}
          <tr className="total-row">
            <td className="total-label">Total</td>
            <td className="spacer-col" style={{ width: '10px', minWidth: '10px', maxWidth: '10px', background: 'transparent', border: 'none', padding: 0 }}></td>
            {extendedColumns.map((col, idx) => {
              if (hiddenAmountColumnIndices.has(idx)) return <td key={`total-blank-${idx}`} className="amount-table-blank-cell"></td>;
              if (col.columnType === 'delta') {
                // Find the corresponding data columns for delta calculation
                const dataColumns = extendedColumns.filter(c => c.columnType === 'data');
                const deltaIndex = extendedColumns.slice(0, idx).filter(c => c.columnType === 'delta').length;
                if (deltaIndex < dataColumns.length - 1) {
                  const fromIndex = extendedColumns.findIndex(c => c === dataColumns[deltaIndex]);
                  const toIndex = extendedColumns.findIndex(c => c === dataColumns[deltaIndex + 1]);
                  const delta = calculateTotalDelta(filterZeroRows(customerData), fromIndex, toIndex, extendedColumns);
                  return (
                    <td key={`total-delta-${idx}`} className="metric-cell delta-cell" style={{ color: delta.color }}>
                      <span className="delta-arrow">{delta.arrow}</span>
                      <span className="delta-value">{delta.value}</span>
                    </td>
                  );
                }
                return <td key={`total-delta-${idx}`} className="metric-cell">-</td>;
              }
              const totalValue = calculateColumnTotal(filterZeroRows(customerData), idx, extendedColumns);
              return <td key={`total-${idx}`} className="metric-cell">{formatTotalValue(totalValue, 'KGS')}</td>;
            })}
          </tr>
        </tbody>
      </table>

      {/* NEW: Customers - Sales Amount Comparison table */}
      <div className="table-separator" />
      <div className="sales-rep-subtitle">Customers - <CurrencySymbol /> Sales Amount Comparison</div>
      <table className="financial-table">
        <thead>
          {/* Star Indicator Row */}
          <tr>
            <th className="product-header star-cell"></th>
            <th className="spacer-col" style={{ width: '10px', minWidth: '10px', maxWidth: '10px', background: 'transparent', border: 'none', padding: 0 }}></th>
            {extendedColumns.map((col, idx) => {
              if (hiddenAmountColumnIndices.has(idx)) {
                return <th key={`star-blank-${idx}`} className="star-cell"></th>;
              }
              if (col.columnType === 'delta') {
                return <th key={`star-delta-${idx}`} className="star-cell"></th>;
              }
              return (
                <th 
                  key={`star-${idx}`} 
                  className="star-cell"
                  style={{ 
                    textAlign: 'center', 
                    padding: '4px',
                    fontSize: '32px',
                    color: isBasePeriodColumn(idx) ? '#FFD700' : 'transparent'
                  }}
                >
                  {isBasePeriodColumn(idx) ? '★' : ''}
                </th>
              );
            })}
          </tr>
          <tr className="main-header-row">
            <th className="product-header" rowSpan={3}>Customers</th>
            <th className="spacer-col" rowSpan={3} style={{ width: '10px', minWidth: '10px', maxWidth: '10px', background: 'transparent', border: 'none', padding: 0 }}></th>
            {extendedColumns.map((col, idx) => {
              if (hiddenAmountColumnIndices.has(idx)) {
                return <th key={`blank-${idx}`} className="amount-table-blank-cell"></th>;
              }
              if (col.columnType === 'delta') {
                return <th key={`delta-${idx}`} rowSpan={3} style={getColumnHeaderStyle({ columnType: 'delta' })} className="delta-header">{col.deltaLabel}<br />%</th>;
              }
              return <th key={`year-${idx}`} style={getColumnHeaderStyle(col)} className="period-header">{col.year}</th>;
            })}
          </tr>
          <tr className="main-header-row">
            {extendedColumns.map((col, idx) => {
              if (hiddenAmountColumnIndices.has(idx)) return <th key={`blank2-${idx}`} className="amount-table-blank-cell"></th>;
              if (col.columnType === 'delta') return null;
              return <th key={`month-${idx}`} style={getColumnHeaderStyle(col)} className="period-header">{col.isCustomRange ? col.displayName : col.month}</th>;
            })}
          </tr>
          <tr className="main-header-row">
            {extendedColumns.map((col, idx) => {
              if (hiddenAmountColumnIndices.has(idx)) return <th key={`blank3-${idx}`} className="amount-table-blank-cell"></th>;
              if (col.columnType === 'delta') return null;
              return <th key={`type-${idx}`} style={getColumnHeaderStyle(col)} className="period-header">{col.type}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {filterZeroRows(customerAmountData).map(customer => (
            <tr key={customer.name} className="product-header-row">
              <td className="row-label product-header" title={customer.name}>
                {customer.name}
              </td>
              <td className="spacer-col" style={{ width: '10px', minWidth: '10px', maxWidth: '10px', background: 'transparent', border: 'none', padding: 0 }}></td>
              {extendedColumns.map((col, idx) => {
                if (hiddenAmountColumnIndices.has(idx)) return <td key={`blank-${idx}`} className="amount-table-blank-cell"></td>;
                const val = customer.values[idx];
                if (col.columnType === 'delta') {
                  if (typeof val === 'object' && val !== null) {
                    return (
                      <td key={idx} className="metric-cell delta-cell" style={{ color: val.color }}>
                        <span className="delta-arrow">{val.arrow}</span>
                        <span className="delta-value">{val.value}</span>
                      </td>
                    );
                  } else if (typeof val === 'string') {
                    let deltaClass = '';
                    if (val.includes('▲')) deltaClass = 'delta-up';
                    else if (val.includes('▼')) deltaClass = 'delta-down';
                    return <td key={idx} className={`metric-cell ${deltaClass}`}>{val}</td>;
                  }
                  return <td key={idx} className="metric-cell">{val || '-'}</td>;
                }
                return <td key={idx} className="metric-cell">{formatValue(val, 'Amount')}</td>;
              })}
            </tr>
          ))}
          {/* Total Row for Customer Amount */}
          <tr className="total-row">
            <td className="total-label">Total</td>
            <td className="spacer-col" style={{ width: '10px', minWidth: '10px', maxWidth: '10px', background: 'transparent', border: 'none', padding: 0 }}></td>
            {extendedColumns.map((col, idx) => {
              if (hiddenAmountColumnIndices.has(idx)) return <td key={`total-blank-${idx}`} className="amount-table-blank-cell"></td>;
              if (col.columnType === 'delta') {
                const dataColumns = extendedColumns.filter(c => c.columnType === 'data');
                const deltaIndex = extendedColumns.slice(0, idx).filter(c => c.columnType === 'delta').length;
                if (deltaIndex < dataColumns.length - 1) {
                  const fromIndex = extendedColumns.findIndex(c => c === dataColumns[deltaIndex]);
                  const toIndex = extendedColumns.findIndex(c => c === dataColumns[deltaIndex + 1]);
                  const delta = calculateTotalDelta(filterZeroRows(customerAmountData), fromIndex, toIndex, extendedColumns);
                  return (
                    <td key={`total-delta-${idx}`} className="metric-cell delta-cell" style={{ color: delta.color }}>
                      <span className="delta-arrow">{delta.arrow}</span>
                      <span className="delta-value">{delta.value}</span>
                    </td>
                  );
                }
                return <td key={`total-delta-${idx}`} className="metric-cell">-</td>;
              }
              const totalValue = calculateColumnTotal(filterZeroRows(customerAmountData), idx, extendedColumns);
              return <td key={`total-${idx}`} className="metric-cell">{formatTotalValue(totalValue, 'Amount')}</td>;
            })}
          </tr>
        </tbody>
      </table>

      {/* ============================================================================ */}
      {/* REMOVED: Customer Grouping UI and MergedGroupsDisplay                      */}
      {/* ============================================================================ */}
      {/* Customer merging is now exclusively managed in:                            */}
      {/*   Master Data > Customer Merging (CustomerMergingPage.js)                 */}
      {/*                                                                             */}
      {/* This page only displays merged customer data (marked with asterisk *)      */}
      {/* based on rules from the division_customer_merge_rules database table.      */}
      {/* ============================================================================ */}

    </div>
  );
};

// Component to display the actual sales rep report
const SalesRepReportContent = ({ rep }) => {
  const { selectedDivision } = useExcelData();
  
  return (
    <SalesRepReport 
      rep={rep}
      selectedDivision={selectedDivision}
      toProperCase={toProperCase}
      getProductGroupsForSalesRep={getProductGroupsForSalesRep}
      fetchCustomerDashboardData={fetchCustomerDashboardData}
      preparePeriods={preparePeriods}
      buildExtendedColumns={buildExtendedColumns}
      processCustomerData={processCustomerData}
      applySavedMergeRules={applySavedMergeRules}
    />
  );
};

export { getProductGroupsForSalesRep, SalesRepReportContent };
export default SalesBySaleRepTable;