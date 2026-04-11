import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useFilter } from '../../contexts/FilterContext';
import { useSalesRepReports } from '../../contexts/SalesRepReportsContext';
import { useAuth } from '../../contexts/AuthContext';
import { getRegionForCountry } from '../../services/regionService';
import ReportHeader from './ReportHeader';
import ExecutiveSummary from './ExecutiveSummary';
import PerformanceDashboard from './PerformanceDashboard';
import SalesRepHTMLExport from '../dashboard/SalesRepHTMLExport';
import SalesRepHTMLExportV2 from '../dashboard/SalesRepHTMLExportV2';
// Removed PeriodComparison and ExportActions per request
import './SalesRepReport.css';

const SalesRepReport = ({ 
  rep, 
  selectedDivision,
  getProductGroupsForSalesRep, 
  fetchCustomerDashboardData, 
  preparePeriods, 
  buildExtendedColumns, 
  processCustomerData,
  applySavedMergeRules
}) => {
  const { columnOrder, basePeriodIndex } = useFilter();
  const { getReportData, isCached } = useSalesRepReports();
  const { user } = useAuth();
  
  // Check if user is admin - only admin can see export button and report header
  const isAdmin = user?.role === 'admin';
  
  // Ref to capture the entire report container for V2 export
  const reportContainerRef = useRef(null);
  
  const [kgsData, setKgsData] = useState([]);
  const [amountData, setAmountData] = useState([]);
  const [customerData, setCustomerData] = useState([]);
  const [customerAmountData, setCustomerAmountData] = useState([]); // Customer data by AMOUNT for insights
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [strategicFindings, setStrategicFindings] = useState(null);
  const [customerFindings, setCustomerFindings] = useState(null);
  const [yearlyBudgetTotals, setYearlyBudgetTotals] = useState({ 
    yearlyBudgetTotal: 0, 
    yearlySalesBudgetTotal: 0,
    yearlyBudgetAchievement: 0,
    yearlySalesBudgetAchievement: 0
  });
  const [customerInsights, setCustomerInsights] = useState({
    topCustomerShare: 0,
    top3CustomerShare: 0,
    top5CustomerShare: 0,
    totalCustomers: 0,
    customerGrowth: 0,
    newCustomers: [],
    topCustomers: [],
    avgVolumePerCustomer: 0
  });

  // Handler to capture strategic findings from PerformanceDashboard
  const handleStrategicFindings = React.useCallback((findings) => {
    setStrategicFindings(findings);
  }, []);

  // Handler to capture customer findings from PerformanceDashboard (still needed for other components)
  const handleCustomerFindings = React.useCallback((findings) => {
    setCustomerFindings(findings);
  }, []);

  // Handler to capture yearly budget totals from ExecutiveSummary
  const handleYearlyBudgetCalculated = React.useCallback((totals) => {
    setYearlyBudgetTotals(totals);
  }, []);

  // Calculate customer insights from reportData (same logic as ExecutiveSummary)
  const calculateCustomerInsights = React.useCallback(() => {
    if (!reportData?.topCustomers || !Array.isArray(reportData.topCustomers) || basePeriodIndex === null || !columnOrder) {
      return {
        topCustomerShare: 0,
        top3CustomerShare: 0,
        top5CustomerShare: 0,
        totalCustomers: 0,
        customerGrowth: 0,
        newCustomers: [],
        topCustomers: [],
        avgVolumePerCustomer: 0
      };
    }

    // Find the correct rawValues index for the base period
    const rawValuesIndex = columnOrder.findIndex((col, index) => index === basePeriodIndex);
    if (rawValuesIndex === -1) {
      return {
        topCustomerShare: 0,
        top3CustomerShare: 0,
        top5CustomerShare: 0,
        totalCustomers: 0,
        customerGrowth: 0,
        newCustomers: [],
        topCustomers: [],
        avgVolumePerCustomer: 0
      };
    }

    // Use merged customer data passed in reportData (already merged via DB rules)
    const customersWithValues = reportData.topCustomers
      .filter(customer => (customer?.rawValues?.[rawValuesIndex] || 0) > 0)
      .map(customer => ({
        name: toProperCase(customer.name),
        value: customer?.rawValues?.[rawValuesIndex] || 0,
        originalCustomer: customer
      }));

    const allCustomersWithValues = (reportData.allCustomers || reportData.topCustomers)
      .filter(customer => (customer?.rawValues?.[rawValuesIndex] || 0) > 0)
      .map(customer => ({
        name: toProperCase(customer.name),
        value: customer?.rawValues?.[rawValuesIndex] || 0,
        originalCustomer: customer
      }));

    const totalCustomerSales = allCustomersWithValues.reduce((sum, customer) => sum + customer.value, 0);
    const customersWithPercentages = customersWithValues.map(customer => ({
      ...customer,
      percentage: totalCustomerSales > 0 ? (customer.value / totalCustomerSales) * 100 : 0
    }));

    // Calculate customer growth and new customers
    let customerGrowth = 0;
    let newCustomers = 0;
    let newCustomerNames = [];

    if (basePeriodIndex > 0) {
      const previousPeriodAllCustomers = (reportData.allCustomers || reportData.topCustomers)
        .filter(customer => (customer?.rawValues?.[basePeriodIndex - 1] || 0) > 0)
        .map(customer => ({
          name: toProperCase(customer.name),
          value: customer?.rawValues?.[basePeriodIndex - 1] || 0
        }));

      const previousCustomerCount = previousPeriodAllCustomers.length;
      customerGrowth = previousCustomerCount > 0 ? 
        ((allCustomersWithValues.length - previousCustomerCount) / previousCustomerCount) * 100 : 0;

      const previousCustomerNames = new Set(previousPeriodAllCustomers.map(c => c.name.toLowerCase()));
      const newCustomerList = allCustomersWithValues.filter(customer => 
        !previousCustomerNames.has(customer.name.toLowerCase())
      );
      newCustomers = newCustomerList.length;
      newCustomerNames = newCustomerList.map(customer => customer.name);
    }

    return {
      topCustomerShare: customersWithPercentages[0]?.percentage || 0,
      top3CustomerShare: customersWithPercentages.slice(0, 3).reduce((sum, c) => sum + c.percentage, 0),
      top5CustomerShare: customersWithPercentages.slice(0, 5).reduce((sum, c) => sum + c.percentage, 0),
      totalCustomers: allCustomersWithValues.length,
      customerGrowth: customerGrowth,
      newCustomers: newCustomerNames,
      topCustomers: customersWithPercentages.slice(0, 5),
      avgVolumePerCustomer: allCustomersWithValues.length > 0 ? totalCustomerSales / allCustomersWithValues.length : 0
    };
  }, [reportData, basePeriodIndex, columnOrder]);

  // Update customer insights when reportData changes
  React.useEffect(() => {
    if (reportData && basePeriodIndex !== null && columnOrder) {
      const insights = calculateCustomerInsights();
      setCustomerInsights(insights);
    }
  }, [calculateCustomerInsights]);

  const toProperCase = (str) => {
    if (!str) return '';
    return str.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  };

  // Fetch customer data by AMOUNT (for Customer Insights percentage calculations)
  const fetchCustomerAmountData = useCallback(async (salesRep, periods, division = 'FP') => {
    try {
      
      const response = await fetch('/api/customer-dashboard-amount', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          division,
          salesRep,
          periods
        })
      });
      
      if (!response.ok) {
        throw new Error(`API request failed with status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        return result.data;
      } else {
        throw new Error(result.message || 'Failed to fetch customer amount data');
      }
    } catch (error) {
      console.error(`❌ Error fetching customer AMOUNT data:`, error);
      // Return empty data structure as fallback
      return { customers: [], dashboardData: {} };
    }
  }, []); // No dependencies needed - fetches from API

  // Ref guard to prevent duplicate fetches (prevents context-driven loops)
  const hasFetchedRef = useRef(false);
  const lastFetchKeyRef = useRef('');
  
  // Ref to hold generateReportData function (defined after useEffect, called from within)
  const generateReportDataRef = useRef(null);

  // Reset fetch guard when rep changes to ensure fresh data fetch
  useEffect(() => {
    hasFetchedRef.current = false;
    lastFetchKeyRef.current = '';
  }, [rep]);

  // Fetch data for the report
  useEffect(() => {
    const fetchReportData = async () => {
      if (!rep || !columnOrder || columnOrder.length === 0) {
        setLoading(false);
        return;
      }

      // Create a unique key for this fetch to detect if we need to re-fetch
      const fetchKey = `${rep}-${selectedDivision}-${basePeriodIndex}-${columnOrder.length}`;
      
      // Skip if we already fetched with the same parameters
      if (hasFetchedRef.current && lastFetchKeyRef.current === fetchKey) {
        return;
      }
      
      hasFetchedRef.current = true;
      lastFetchKeyRef.current = fetchKey;

      try {
        setLoading(true);
        setError(null);

        // TRY CACHE FIRST - ULTRA-FAST!
        const cachedReportData = getReportData(rep);
        
        if (cachedReportData && isCached) {
          
          // Process cached data into the format expected by the report
          // Convert from ultra-fast format to component format
          const kgsResult = processedCachedDataToProductGroups(cachedReportData.kgs, columnOrder);
          const amountResult = processedCachedDataToProductGroups(cachedReportData.amount, columnOrder);

          // Safety check: if the cache was preloaded with a different column configuration
          // (e.g., before FilterContext finished loading saved prefs), all values will be 0.
          // In that case, skip the cache and perform a live API fetch instead.
          const cacheHasRealData = kgsResult.length > 0 &&
            kgsResult.some(pg => pg.rawValues.some(v => v > 0));

          if (cacheHasRealData) {
          
          // Process customer data - extract BOTH KGS and Amount from cache (no separate API call!)
          // Note: processCachedCustomers now handles case-insensitive deduplication
          let processedCustomers = processCachedCustomers(cachedReportData.customers, columnOrder, basePeriodIndex, 'kgs');
          let processedCustomersAmount = processCachedCustomers(cachedReportData.customers, columnOrder, basePeriodIndex, 'amount');
          
          // CRITICAL FIX: Apply merge rules for cached data too (same as API path)
          // This ensures HTML export shows same merged customers as live tables
          try {
            const extendedColumns = buildExtendedColumns(columnOrder);
            
            const { customers: mergedCustomers } = await applySavedMergeRules(
              rep,
              selectedDivision,
              processedCustomers,
              {}, // dashboardData not needed for merge rules
              extendedColumns
            );
            processedCustomers = mergedCustomers;
            
            const { customers: mergedCustomersAmount } = await applySavedMergeRules(
              rep,
              selectedDivision,
              processedCustomersAmount,
              {},
              extendedColumns
            );
            processedCustomersAmount = mergedCustomersAmount;
          } catch (mergeError) {
            console.warn('Warning: Could not apply merge rules to cached data:', mergeError);
            // Continue with unmerged data if merge fails
          }
          
          // Sort by base period value
          if (basePeriodIndex != null && basePeriodIndex >= 0) {
            processedCustomers.sort((a, b) => {
              const aValue = a?.rawValues?.[basePeriodIndex] || 0;
              const bValue = b?.rawValues?.[basePeriodIndex] || 0;
              return bValue - aValue;
            });
            processedCustomersAmount.sort((a, b) => {
              const aValue = a?.rawValues?.[basePeriodIndex] || 0;
              const bValue = b?.rawValues?.[basePeriodIndex] || 0;
              return bValue - aValue;
            });
          }
          
          setKgsData(kgsResult);
          setAmountData(amountResult);
          setCustomerData(processedCustomers);
          setCustomerAmountData(processedCustomersAmount); // Use AMOUNT data from cache!
          
          // Generate report data with AMOUNT-based customers for insights
          generateReportDataRef.current(kgsResult, amountResult, processedCustomers, processedCustomersAmount);
          setLoading(false);
          return;
          } // end if (cacheHasRealData) — fall through to live API when cache is stale/mismatched
        }

        // FALLBACK: Fetch via API if not cached

        // Fetch all necessary data
        const [kgsResult, amountResult] = await Promise.all([
          getProductGroupsForSalesRep(rep, 'KGS', columnOrder),
          getProductGroupsForSalesRep(rep, 'Amount', columnOrder)
        ]);

        // Fetch customer data (KGS for table display)
        const { customers, dashboardData } = await fetchCustomerDashboardData(rep, preparePeriods(columnOrder));
        const extendedColumns = buildExtendedColumns(columnOrder);
        
        // Use DB merge rules to build merged customers (consistent with tables)
        const { customers: processedCustomers } = await applySavedMergeRules(
          rep,
          selectedDivision,
          customers,
          dashboardData,
          extendedColumns
        );

        // Sort customers by base period volume
        if (basePeriodIndex != null && basePeriodIndex >= 0) {
          // Use basePeriodIndex directly
          processedCustomers.sort((a, b) => {
            const aValue = a?.rawValues?.[basePeriodIndex] || 0;
            const bValue = b?.rawValues?.[basePeriodIndex] || 0;
            return bValue - aValue;
          });
        }

        // ALSO fetch customer data by AMOUNT for Customer Insights percentage calculations
        const customerAmountResult = await fetchCustomerAmountData(rep, preparePeriods(columnOrder), selectedDivision);
        
        const { customers: processedCustomersAmount } = await applySavedMergeRules(
          rep,
          selectedDivision,
          customerAmountResult.customers,
          customerAmountResult.dashboardData,
          extendedColumns
        );

        // Sort customers by amount
        if (basePeriodIndex != null && basePeriodIndex >= 0) {
          processedCustomersAmount.sort((a, b) => {
            const aValue = a?.rawValues?.[basePeriodIndex] || 0;
            const bValue = b?.rawValues?.[basePeriodIndex] || 0;
            return bValue - aValue;
          });
        }

        setKgsData(kgsResult);
        setAmountData(amountResult);
        setCustomerData(processedCustomers);
        setCustomerAmountData(processedCustomersAmount);


        // Generate report data with AMOUNT-based customers for insights
        generateReportDataRef.current(kgsResult, amountResult, processedCustomers, processedCustomersAmount);

      } catch (error) {
        console.error('Error fetching report data:', error);
        setError('Failed to load report data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchReportData();
    // IMPORTANT: isCached is intentionally EXCLUDED from deps!
    // isCached is mutated by getReportData() inside this effect.
    // Including it would cause an infinite loop: effect → getReportData → isCached changes → effect runs again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rep, columnOrder, basePeriodIndex, selectedDivision]);
  
  // Helper to convert cached data to product groups format
  const normalizeType = (type) => String(type || 'Actual').toUpperCase();

  const processedCachedDataToProductGroups = (cachedData, columnOrder) => {
    // cachedData structure: { columnKey: { productGroup: value } }
    // Need to convert to: [{ name: productGroup, values: [...] }]
    
    const budgetColumnKey = columnOrder.find(c => normalizeType(c.type) === 'BUDGET');
    
    // Helper to normalize product group names to Title Case
    const normalizeProductGroup = (name) => {
      if (!name) return '';
      return name.toString().trim().split(' ').map(word => {
        if (word.length === 0) return word;
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }).join(' ');
    };
    
    const productGroupMap = {};
    
    // Collect all product groups with normalized names
    Object.values(cachedData).forEach(columnData => {
      Object.keys(columnData).forEach(pg => {
        const normalizedPg = normalizeProductGroup(pg);
        if (!productGroupMap[normalizedPg]) {
          productGroupMap[normalizedPg] = [];
        }
      });
    });
    
    // Build values array for each product group
    return Object.keys(productGroupMap).map(normalizedPgName => {
      const values = [];
      columnOrder.forEach((column) => {
        const columnKey = `${column.year}-${column.month}-${normalizeType(column.type)}`;
        // Sum values from all casing variations of this product group
        let value = 0;
        if (cachedData[columnKey]) {
          Object.keys(cachedData[columnKey]).forEach(pg => {
            if (normalizeProductGroup(pg) === normalizedPgName) {
              value += cachedData[columnKey][pg] || 0;
            }
          });
        }
        values.push(value);
      });
      return {
        name: normalizedPgName,
        values,
        rawValues: values
      };
    });
  };
  
  // Helper to process cached customers - can extract KGS or Amount
  // CRITICAL FIX: Use case-insensitive grouping to prevent duplicates like
  // "NESTLE WATERS FACTORY H&O LLC" (actual) vs "Nestle Waters Factory H&o Llc" (budget)
  const processCachedCustomers = (cachedCustomers, columnOrder, basePeriodIndex, valueType = 'kgs') => {
    // cachedCustomers: [{ name, columnKey, kgs, amount }]
    // Need to group by customer and build values array
    // valueType: 'kgs' or 'amount' to extract the correct field
    
    const customerMap = {};
    
    // Helper to normalize customer name for consistent grouping (case-insensitive)
    const normalizeCustomerName = (name) => (name || '').toString().trim().toUpperCase();
    
    // Helper to convert customer name to proper case for display
    const toProperCase = (str) => {
      if (str === null || str === undefined) return '';
      return String(str).split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
    };
    
    cachedCustomers.forEach(item => {
      const normalizedName = normalizeCustomerName(item.name);
      
      if (!customerMap[normalizedName]) {
        customerMap[normalizedName] = {
          name: toProperCase(item.name), // Store in proper case for display
          customerName: toProperCase(item.name), // Also add customerName for compatibility with HTML export
          rawValues: new Array(columnOrder.length).fill(0)
        };
      }
      
      // Find column index
      const columnIndex = columnOrder.findIndex(col => 
        `${col.year}-${col.month}-${normalizeType(col.type)}` === item.columnKey
      );
      
      if (columnIndex >= 0) {
        // Use the requested value type (kgs or amount)
        // AGGREGATE values (add, don't replace) in case there are multiple entries
        customerMap[normalizedName].rawValues[columnIndex] += (item[valueType] || 0);
      }
    });
    
    // Convert to array and sort
    const customers = Object.values(customerMap);
    
    if (basePeriodIndex != null && basePeriodIndex >= 0) {
      customers.sort((a, b) => {
        const aValue = a?.rawValues?.[basePeriodIndex] || 0;
        const bValue = b?.rawValues?.[basePeriodIndex] || 0;
        return bValue - aValue;
      });
    }
    
    return customers;
  };

  // Generate comprehensive report data (defined AFTER useEffect, called from within via ref)
  const generateReportData = async (kgsData, amountData, customerData, customerAmountData = null) => {
    if (!columnOrder || basePeriodIndex === null) {
      return;
    }
    
    // Use AMOUNT-based customer data for insights if available, otherwise fall back to KGS
    const customersForInsights = customerAmountData || customerData;
    const hasCustomerAmountRows = Array.isArray(customerAmountData) && customerAmountData.length > 0;

    const basePeriod = columnOrder[basePeriodIndex];
    const prevPeriod = basePeriodIndex > 0 ? columnOrder[basePeriodIndex - 1] : null;
    const prevPeriodIndex = basePeriodIndex > 0 ? basePeriodIndex - 1 : -1;
    const nextPeriod = basePeriodIndex < columnOrder.length - 1 ? columnOrder[basePeriodIndex + 1] : null;

    // Find the index of the budget column that matches the current period
    // First try to find budget for the same period (Q1, Q2, HY1, etc.)
    let yearBudgetIndex = columnOrder.findIndex(col => {
      const normalizedType = normalizeType(col.type);
      const isBudget = normalizedType === 'BUDGET';
      const sameYear = col.year === basePeriod.year;
      
      // Check if it's the same period (month/quarter/half-year)
      const samePeriod = col.month === basePeriod.month;
      
      // Check if months arrays match (for custom ranges)
      const sameMonths = Array.isArray(col.months) && Array.isArray(basePeriod.months) &&
        col.months.length === basePeriod.months.length &&
        col.months.every((m, i) => m === basePeriod.months[i]);
      
      return isBudget && sameYear && (samePeriod || sameMonths);
    });
    
    // If no matching period budget found, fall back to full-year budget
    if (yearBudgetIndex === -1) {
      yearBudgetIndex = columnOrder.findIndex(col => {
        const normalizedType = normalizeType(col.type);
        const isBudget = normalizedType === 'BUDGET';
        const sameYear = col.year === basePeriod.year;
        const isYearByMonth = typeof col.month === 'string' && ['year', 'fy'].includes(col.month.toLowerCase());
        const isYearByName = typeof col.displayName === 'string' && col.displayName.toLowerCase().includes('year');
        const isFullRange = Array.isArray(col.months) && col.months.length >= 12;
        return isBudget && sameYear && (isYearByMonth || isYearByName || isFullRange);
      });
    }
    
    const budgetPeriod = yearBudgetIndex >= 0 ? columnOrder[yearBudgetIndex] : null;

    // Calculate totals and key metrics
    const kgsTotals = calculateTotals(kgsData);
    const amountTotals = calculateTotals(amountData);
    
    // Generate insights and findings
    const insights = generateInsights(kgsData, amountData, customerData);
    
    const topProducts = getTopPerformers(kgsData, basePeriodIndex);
    
    // Fetch geographic distribution data from API
    let geographicDistribution = null;
    try {
      const monthMap = {
        'January': 1, 'February': 2, 'March': 3, 'April': 4,
        'May': 5, 'June': 6, 'July': 7, 'August': 8,
        'September': 9, 'October': 10, 'November': 11, 'December': 12
      };
      
      const months = basePeriod.months ? basePeriod.months.map(m => 
        typeof m === 'number' ? m : monthMap[m] || 1
      ) : [1, 2, 3, 4, 5, 6];
      
      const requestBody = {
        division: selectedDivision,
        salesRep: rep,
        year: basePeriod.year,
        months: months,
        dataType: basePeriod.type || 'Actual'
      };
      
      
      const response = await fetch('/api/sales-by-country-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data && result.data.length > 0) {
          geographicDistribution = calculateGeographicDistribution(result.data);
        } else {
        }
      } else {
      }
    } catch (error) {
      console.error('❌ Error fetching geographic distribution:', error);
    }
    
    const reportDataObj = {
      basePeriod,
      basePeriodIndex,
      prevPeriod,
      prevPeriodIndex,
      nextPeriod,
      budgetPeriod,
      columnOrder,
      yearBudgetIndex,
      kgsTotals,
      amountTotals,
      insights,
      topProducts,
      topCustomers: customersForInsights.slice(0, 5),
      allCustomers: customersForInsights,
      hasCustomerAmountRows,
      customerAmountRows: hasCustomerAmountRows ? customerAmountData : [],
      topCustomersKgs: customerData.slice(0, 5),
      allCustomersKgs: customerData,
      performanceMetrics: calculatePerformanceMetrics(kgsData, amountData, customerData),
      periodLabel: basePeriod,
      salesRep: rep,
      geographicDistribution: geographicDistribution
    };
    
    setReportData(reportDataObj);
  };
  
  // Assign to ref so useEffect can call it
  generateReportDataRef.current = generateReportData;
  
  // Calculate geographic distribution from country data
  // Uses regions from master_countries database via regionService
  const calculateGeographicDistribution = (countryData) => {
    // Dynamic regional sales - includes all regions from master_countries
    const regionalSales = {
      'UAE': 0,
      'Arabian Peninsula': 0,
      'West Asia': 0,
      'Levant': 0,
      'North Africa': 0,
      'Southern Africa': 0,
      'Europe': 0,
      'Americas': 0,
      'Asia-Pacific': 0,
      'East Africa': 0,
      'West Africa': 0,
      'Central Africa': 0,
      'Middle East': 0,
      'Unassigned': 0
    };
    
    // Use region from API response (from unified view) - fallback to getRegionForCountry if missing
    countryData.forEach(country => {
      // Prefer region from API (from unified view's country_region column)
      const region = country.region || getRegionForCountry(country.country);
      if (regionalSales[region] !== undefined) {
        regionalSales[region] += country.value || 0;
      } else if (region && region !== 'Unassigned') {
        // Region exists in DB but not in our display list - still track it
        if (!regionalSales[region]) regionalSales[region] = 0;
        regionalSales[region] += country.value || 0;
      } else {
        regionalSales['Unassigned'] += country.value || 0;
      }
    });
    
    const totalSales = countryData.reduce((sum, c) => sum + (c.value || 0), 0);
    
    const regionalPercentages = {};
    Object.keys(regionalSales).forEach(region => {
      regionalPercentages[region] = totalSales > 0 ? (regionalSales[region] / totalSales * 100) : 0;
    });
    
    const localPercentage = regionalPercentages['UAE'] || 0;
    const exportPercentage = 100 - localPercentage;
    
    const exportRegions = Object.entries(regionalPercentages)
      .filter(([region, percentage]) => region !== 'UAE' && percentage >= 0.1)
      .sort((a, b) => b[1] - a[1]);
    
    const topRegions = exportRegions.map(([region, percentage]) => {
      const exportPerc = exportPercentage > 0 ? (percentage / exportPercentage) * 100 : 0;
      return {
        name: region,
        percentage: percentage,
        exportPercentage: exportPerc,
        value: regionalSales[region]
      };
    });
    
    return {
      localPercentage: Math.round(localPercentage * 10) / 10,
      exportPercentage: Math.round(exportPercentage * 10) / 10,
      localSales: Math.round(localPercentage * 10) / 10,
      exportSales: Math.round(exportPercentage * 10) / 10,
      topRegions: topRegions,
      regionalBreakdown: Object.entries(regionalSales).map(([region, value]) => ({
        name: region,
        value,
        percentage: totalSales > 0 ? (value / totalSales * 100) : 0
      }))
    };
  };

  // Calculate totals for a dataset
  const calculateTotals = (data) => {
    if (!data || !columnOrder) return {};
    
    const totals = {};
    columnOrder.forEach((col, index) => {
      const total = data.reduce((sum, item) => {
        const value = item?.rawValues?.[index] || 0;
        return sum + (isNaN(value) ? 0 : value);
      }, 0);
      totals[index] = total;
    });
    return totals;
  };

  // Get top performing products
  const getTopPerformers = (data, baseIndex) => {
    if (!data || baseIndex === null) {
      return [];
    }
    
    const filtered = data.filter(item => {
      const value = item?.rawValues?.[baseIndex] || 0;
      return value > 0;
    });
    
    const sorted = filtered.sort((a, b) => (b?.rawValues?.[baseIndex] || 0) - (a?.rawValues?.[baseIndex] || 0));
    const top5 = sorted.slice(0, 5);
    
    return top5;
  };

  // Generate insights based on data analysis
  const generateInsights = (kgsData, amountData, customerDataArg) => {
    const insights = [];
    
    if (basePeriodIndex !== null && basePeriodIndex > 0) {
      const currentKgs = calculateTotals(kgsData)[basePeriodIndex] || 0;
      const prevKgs = calculateTotals(kgsData)[basePeriodIndex - 1] || 0;
      
      if (prevKgs > 0) {
        const growth = ((currentKgs - prevKgs) / prevKgs) * 100;
        insights.push({
          type: growth > 0 ? 'positive' : 'negative',
          title: `${growth > 0 ? 'Growth' : 'Decline'} in Sales Volume`,
          description: `${Math.abs(growth).toFixed(1)}% ${growth > 0 ? 'increase' : 'decrease'} compared to previous period`
        });
      }
    }

    const topProduct = getTopPerformers(kgsData, basePeriodIndex)[0];
    if (topProduct) {
      const productValue = topProduct?.rawValues?.[basePeriodIndex] || 0;
      insights.push({
        type: 'info',
        title: 'Top Performing Product',
        description: `${topProduct.productGroup || topProduct.name} leads with ${productValue.toLocaleString()} KGS`
      });
    }

    if (customerDataArg && customerDataArg.length > 0) {
      const topCustomerValue = customerDataArg[0]?.rawValues?.[basePeriodIndex] || 0;
      const totalCustomerValue = customerDataArg.reduce((sum, customer) => 
        sum + (customer?.rawValues?.[basePeriodIndex] || 0), 0);
      
      if (totalCustomerValue > 0) {
        const concentration = (topCustomerValue / totalCustomerValue) * 100;
        insights.push({
          type: concentration > 50 ? 'warning' : 'info',
          title: 'Customer Concentration',
          description: `Top customer represents ${concentration.toFixed(1)}% of total sales`
        });
      }
    }

    return insights;
  };

  // Calculate performance metrics
  const calculatePerformanceMetrics = (kgsData, amountData, customerDataArg) => {
    if (!columnOrder || basePeriodIndex === null) return {};

    const kgsTotal = calculateTotals(kgsData)[basePeriodIndex] || 0;
    const amountTotal = calculateTotals(amountData)[basePeriodIndex] || 0;
    
    return {
      totalKgs: kgsTotal,
      totalAmount: amountTotal,
      avgPricePerKg: kgsTotal > 0 ? amountTotal / kgsTotal : 0,
      productCount: kgsData?.filter(item => (item?.rawValues?.[basePeriodIndex] || 0) > 0).length || 0,
      customerCount: customerDataArg?.filter(customer => (customer?.rawValues?.[basePeriodIndex] || 0) > 0).length || 0
    };
  };

  if (loading) {
    return (
      <div className="sales-rep-report-content">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Generating comprehensive report for {toProperCase(rep)}...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sales-rep-report-content">
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <h3>Error Loading Report</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="sales-rep-report-content">
        <div className="no-data-container">
          <div className="no-data-icon">📊</div>
          <h3>No Data Available</h3>
          <p>Please select periods to generate the report for {toProperCase(rep)}.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sales-rep-report-content">
      <div className="report-container" ref={reportContainerRef}>
        {/* Export Buttons - Only visible for admin users - INSIDE report-container for alignment */}
        {isAdmin && (
          <div style={{
            padding: '15px 20px',
            backgroundColor: '#f8f9fa',
            borderBottom: '1px solid #dee2e6',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '12px'
          }}>
            {/* Original Export Button */}
            <SalesRepHTMLExport 
              rep={rep}
              reportType="individual"
              reportData={reportData}
              kgsData={kgsData}
              amountData={amountData}
              customerData={customerData}
              customerAmountData={customerAmountData}
              performanceMetrics={reportData?.performanceMetrics}
              selectedDivision={selectedDivision}
              strategicFindings={strategicFindings}
              customerFindings={customerFindings}
              yearlyBudgetTotal={yearlyBudgetTotals.yearlyBudgetTotal}
              yearlySalesBudgetTotal={yearlyBudgetTotals.yearlySalesBudgetTotal}
              yearlyBudgetAchievement={yearlyBudgetTotals.yearlyBudgetAchievement}
              yearlySalesBudgetAchievement={yearlyBudgetTotals.yearlySalesBudgetAchievement}
              customerInsights={customerInsights}
            />
            
            {/* V2 Export Button - Captures actual rendered content */}
            <SalesRepHTMLExportV2
              rep={rep}
              reportData={reportData}
              reportContainerRef={reportContainerRef}
              selectedDivision={selectedDivision}
              yearlyBudgetTotal={yearlyBudgetTotals.yearlyBudgetTotal}
              yearlySalesBudgetTotal={yearlyBudgetTotals.yearlySalesBudgetTotal}
              yearlyBudgetAchievement={yearlyBudgetTotals.yearlyBudgetAchievement}
              yearlySalesBudgetAchievement={yearlyBudgetTotals.yearlySalesBudgetAchievement}
            />
          </div>
        )}
        
        {/* Report Header - Only visible for admin users */}
        {isAdmin && (
          <ReportHeader 
            rep={rep} 
            basePeriod={reportData.basePeriod}
            prevPeriod={reportData.prevPeriod}
            nextPeriod={reportData.nextPeriod}
            toProperCase={toProperCase}
          />
        )}
        
        <ExecutiveSummary
          performanceMetrics={reportData.performanceMetrics}
          reportData={reportData}
          kgsData={kgsData}
          amountData={amountData}
          basePeriodIndex={basePeriodIndex}
          onYearlyBudgetCalculated={handleYearlyBudgetCalculated}
        />
        
        <PerformanceDashboard 
          reportData={reportData}
          kgsData={kgsData}
          amountData={amountData}
          customerAmountData={customerAmountData}
          rep={rep}
          applySavedMergeRules={applySavedMergeRules}
          onStrategicFindingsCalculated={handleStrategicFindings}
          onCustomerFindingsCalculated={handleCustomerFindings}
        />
        
        {/* Removed ProductPerformanceTable to avoid overlapping the chart */}
        
        {/* Key Insights section removed per request */}
        
        {/* Top Customer Performance section removed per request */}
        
        {/* Period comparison and Export actions removed */}
      </div>
    </div>
  );
};

export default SalesRepReport;
