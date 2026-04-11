
import React, { useRef, useState, useMemo, useEffect } from 'react';
import { useFilter } from '../../contexts/FilterContext';
import { useExcelData } from '../../contexts/ExcelDataContext';
import CurrencySymbol from './CurrencySymbol';
import './SalesByCustomerTableNew.css';
import { COLOR_SCHEMES } from './utils/FinancialConstants';
import { getColumnColorPalette } from './utils/colorUtils';

/**
 * Performance-focused rewrite notes (same file name, same UI):
 * - Build per-column hash maps once (O(n)) instead of O(n) ".find" inside every cell render.
 * - Precompute a values matrix [customer x column] via useMemo and reuse everywhere (table, percentages, summary).
 * - Use consistent normalization with `norm()` across all matching/merge operations.
 * - Keep network IO parallel for sales data (Promise.all), but only after merge rules are ready.
 * - Memoize extended columns structure and derived lists to avoid repeated work on every render.
 * - Render Top 20 only (original behavior) but compute on prebuilt matrix for speed.
 */

const SalesByCustomerTableNew = ({ hideHeader = false }) => {
  const { columnOrder, dataGenerated, basePeriodIndex: contextBasePeriodIndex } = useFilter();
  const { selectedDivision } = useExcelData();
  const tableRef = useRef(null);

  const [customers, setCustomers] = useState([]);                 // final labels including mergedName*
  const [customerData, setCustomerData] = useState({});           // raw API rows per columnKey
  const [customerSalesRepMap, setCustomerSalesRepMap] = useState({}); // customer -> sales rep mapping
  const [mergeRules, setMergeRules] = useState([]);
  const [mergeRulesLoaded, setMergeRulesLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ---------- helpers ----------
  const norm = (s) => (s || '').toString().trim().toLowerCase();

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
          deltaLabel: getDeltaLabel(fromCol, toCol)
        });
      }
    });
    return out;
  }, [columnOrder]);

  // Generate dynamic footer description based on comparison types present
  const getDeltaFooterDescription = useMemo(() => {
    const deltaColumns = extendedColumns.filter(col => col.columnType === 'delta');
    if (deltaColumns.length === 0) return '';

    let hasYoY = false;
    let hasActualVsReference = false;
    let hasOtherComparisons = false;

    deltaColumns.forEach(delta => {
      const fromType = (delta.fromColumn?.type || 'Actual').toLowerCase();
      const toType = (delta.toColumn?.type || 'Actual').toLowerCase();

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

  const calculateColumnWidths = () => {
    const totalDataColumns = dataColumnsOnly.length;
    const totalDeltaColumns = extendedColumns.length - totalDataColumns;

    // Responsive breakpoints - match Sales by Country behavior
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const isMobile = windowWidth < 768;
    const isTablet = windowWidth >= 768 && windowWidth < 1200;

    // Adjust widths based on screen size
    let customerWidth, salesRepWidth, deltaWidth;

    if (isMobile) {
      // Mobile: reduce column widths to fit more data
      customerWidth = 18;
      salesRepWidth = 12;
      deltaWidth = 3.5; // Reduced from 4.5 to match Sales by Country mobile behavior
    } else if (isTablet) {
      // Tablet: moderate reduction
      customerWidth = 13;
      salesRepWidth = 12;
      deltaWidth = 4;
    } else {
      // Desktop: original values
      customerWidth = 15;
      salesRepWidth = 13;
      deltaWidth = 4.5;
    }

    const availableWidth = 100 - customerWidth - salesRepWidth;
    const totalDeltaWidth = deltaWidth * totalDeltaColumns;

    // Remaining width for data columns
    const dataColumnWidth = (availableWidth - totalDeltaWidth) / totalDataColumns;

    return {
      customer: customerWidth,
      salesRep: salesRepWidth,
      value: dataColumnWidth * 0.68, // 68% of data column for value
      percent: dataColumnWidth * 0.32, // 32% of data column for percentage
      delta: deltaWidth
    };
  };

  const columnWidths = calculateColumnWidths();

  // Get base period column details for footer text
  const basePeriodColumn = useMemo(() => {
    if (dataColumnsOnly.length === 0) return null;
    return dataColumnsOnly[effectiveBasePeriodIndex];
  }, [dataColumnsOnly, effectiveBasePeriodIndex]);

  // ---------- data fetching ----------
  const fetchMergeRules = async () => {
    if (!selectedDivision) return [];

    try {
      // Use the new division-merge-rules endpoint (division-wide, no sales rep filter)
      const response = await fetch(`/api/division-merge-rules/rules?division=${encodeURIComponent(selectedDivision)}`);
      const result = await response.json();

      if (result.success && Array.isArray(result.data)) {
        // Map database fields to expected format
        const mappedRules = result.data.map(rule => ({
          mergedName: rule.merged_customer_name,
          originalCustomers: rule.original_customers || []
        }));
        setMergeRules(mappedRules);
        setMergeRulesLoaded(true);
        return mappedRules; // Return rules for immediate use
      } else {
        setMergeRules([]);
        setMergeRulesLoaded(true);
        return [];
      }
    } catch (err) {
      console.error('Failed to load merge rules:', err);
      setMergeRules([]);
      setMergeRulesLoaded(true);
      return [];
    }
  };

  const applyMergeRulesToCustomersWithRules = (rawCustomers, rulesToApply) => {
    if (!rulesToApply || rulesToApply.length === 0) {
      return rawCustomers;
    }

    const processedCustomers = [];
    const processed = new Set();
    
    // Create a map: normalized name -> actual customer name from API
    const rawCustomerMap = new Map();
    rawCustomers.forEach(customer => {
      const normalized = norm(customer);
      if (!rawCustomerMap.has(normalized)) {
        rawCustomerMap.set(normalized, customer);
      }
    });


    rulesToApply.forEach(rule => {
      const originalCustomers = rule.originalCustomers || [];
      const mergedName = (rule.mergedName || '').toString().trim();
      
      // Find ACTUAL customer names from API that match the original customers in merge rule
      const existingCustomers = [];
      originalCustomers.forEach(originalCustomer => {
        const normalizedOriginal = norm(originalCustomer);
        const actualCustomer = rawCustomerMap.get(normalizedOriginal);
        if (actualCustomer) {
          existingCustomers.push(actualCustomer);
        }
      });

      if (existingCustomers.length >= 1) {
        const mergedDisplayName = mergedName + '*';
        processedCustomers.push(mergedDisplayName);
        // Mark ACTUAL customer names as processed (not the original names from rule)
        existingCustomers.forEach(actualCustomer => {
          processed.add(norm(actualCustomer));
        });
      }
    });

    // Add remaining unprocessed customers
    rawCustomers.forEach(customer => {
      if (!processed.has(norm(customer))) {
        processedCustomers.push(customer);
      }
    });


    // Final dedupe: Remove originals if merged version exists
    // Create a set of normalized merged customer names (without *)
    const mergedNormalizedSet = new Set();
    processedCustomers.forEach(customer => {
      if (customer.endsWith('*')) {
        const withoutAsterisk = customer.slice(0, -1).trim();
        mergedNormalizedSet.add(norm(withoutAsterisk));
      }
    });

    // Filter out any customers that match a merged customer's normalized name
    const deduped = processedCustomers.filter(customer => {
      if (customer.endsWith('*')) {
        return true; // Keep all merged customers
      }
      // For non-merged customers, check if they match a merged customer
      const customerNormalized = norm(customer);
      const shouldRemove = mergedNormalizedSet.has(customerNormalized);
      if (shouldRemove) {
      }
      return !shouldRemove;
    });

    // Final dedupe by normalized label to handle exact duplicates
    const final = [...new Map(deduped.map(c => [norm(c), c])).values()];
    return final;
  };

  // Wrapper for backwards compatibility - uses state mergeRules
  const applyMergeRulesToCustomers = (rawCustomers) => {
    return applyMergeRulesToCustomersWithRules(rawCustomers, mergeRules);
  };

  const extractCustomersFromSalesData = (salesDataObject, mergeRulesToApply = null) => {
    // Extract customers from the loaded sales data
    // This ensures we only show customers who have sales in the selected columns
    const allCustomers = new Set();
    
    // Collect all customers from the loaded sales data
    Object.values(salesDataObject).forEach(columnData => {
      if (Array.isArray(columnData)) {
        columnData.forEach(row => {
          if (row.customer) {
            allCustomers.add(row.customer);
          }
        });
      }
    });
    
    const rawCustomerNames = [...allCustomers];
    // Use provided merge rules, or fall back to state (for backwards compatibility)
    const rulesToUse = mergeRulesToApply !== null ? mergeRulesToApply : mergeRules;
    const mergedCustomerNames = applyMergeRulesToCustomersWithRules(rawCustomerNames, rulesToUse);
    return mergedCustomerNames;
  };

  const fetchSalesRepMapping = async () => {
    if (!selectedDivision) return;

    try {
      const response = await fetch(`/api/customer-sales-rep-mapping?division=${encodeURIComponent(selectedDivision)}`);
      const result = await response.json();

      if (result.success && result.data) {
        const normMap = {};
        Object.entries(result.data).forEach(([customerName, value]) => {
          if (!customerName) return;
          const safeValue = value || {};
          normMap[norm(customerName)] = {
            salesRep: safeValue.salesRep || 'N/A',
            year: safeValue.year || 0,
            month: safeValue.month || 0,
            source: safeValue.source || 'raw',
            mergedFrom: safeValue.mergedFrom || null
          };
        });
        setCustomerSalesRepMap(normMap);
        const mergedCount = result.meta?.mergedAssignments || 0;
      } else {
        console.error('Failed to load sales rep mapping:', result.message || result.error);
      }
    } catch (err) {
      console.error('Failed to load sales rep mapping:', err);
    }
  };

  const fetchSalesData = async (column) => {
    if (!selectedDivision || selectedDivision !== 'FP') return null;

    try {
      let months = [];
      
      // Priority 1: Check if column already has months array (custom ranges)
      if (column.months && Array.isArray(column.months)) {
        const monthMap = {
          'January': 1, 'February': 2, 'March': 3, 'April': 4,
          'May': 5, 'June': 6, 'July': 7, 'August': 8,
          'September': 9, 'October': 10, 'November': 11, 'December': 12
        };
        months = column.months.map(m => typeof m === 'string' ? (monthMap[m] || parseInt(m, 10)) : m);
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
        const monthMap = {
          'January': 1, 'February': 2, 'March': 3, 'April': 4,
          'May': 5, 'June': 6, 'July': 7, 'August': 8,
          'September': 9, 'October': 10, 'November': 11, 'December': 12
        };
        months = [monthMap[column.month] || 1];
      }

      const response = await fetch('/api/sales-by-customer-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          division: selectedDivision,
          year: column.year,
          months,
          dataType: column.type || 'Actual'
        })
      });

      const result = await response.json();

      if (result.success) {
        const columnKey = getColumnKey(column);
        return { columnKey, data: result.data || [] };
      }
    } catch (err) {
      console.error('Failed to load sales data:', err);
    }

    return null;
  };

  // Load all data in a single orchestrated effect
  useEffect(() => {
    const loadAll = async () => {
      if (!selectedDivision) return;
      
           // Clean up old state when division changes
           setCustomers([]);
           setCustomerData({});
           setCustomerSalesRepMap({});
           setMergeRules([]);
           setMergeRulesLoaded(false);

           setLoading(true);
           setError(null);
           try {
             // Load merge rules FIRST and get them directly (don't rely on state)
             const loadedMergeRules = await fetchMergeRules();
             await fetchSalesRepMapping();
             
             if (dataColumnsOnly.length > 0) {
               // ULTRA-FAST: Single API call for all columns
               try {
                 
                 const response = await fetch('/api/sales-by-customer-ultra-fast', {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({
                     division: selectedDivision,
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
                 
                 if (result.success && result.data) {
                   setCustomerData(result.data);
                   
                   // Extract and set customers from the loaded sales data
                   // Pass loadedMergeRules directly to avoid state timing issues
                   const customerList = extractCustomersFromSalesData(result.data, loadedMergeRules);
                   setCustomers(customerList);
                 } else {
                   throw new Error(result.message || 'Ultra-fast API call failed');
                 }
               } catch (err) {
                 console.error('Ultra-fast API call failed, falling back to individual calls:', err);
                 // Fallback to original approach if ultra-fast fails
                const fallbackResults = await Promise.all(
                   dataColumnsOnly.map(column => fetchSalesData(column))
                 );

                const aggregatedData = fallbackResults
                  .filter(Boolean)
                  .reduce((acc, { columnKey, data }) => {
                    acc[columnKey] = data;
                    return acc;
                  }, {});

                setCustomerData(aggregatedData);
                // Use loaded merge rules for fallback too
                const fallbackCustomerList = extractCustomersFromSalesData(aggregatedData, loadedMergeRules);
                setCustomers(fallbackCustomerList);
               }
             }
           } catch (err) {
             console.error('Error loading data:', err);
             setError('Failed to load data. Please try again.');
           } finally {
             setLoading(false);
           }
    };
    loadAll();
  // Use stable string key instead of array reference
  }, [selectedDivision, columnsKey]);

  // Previous auto-hide on resize removed to keep Sales Rep column visible by default

  // ---------- indices & matrices for fast lookup ----------
  // columnIndex: { [columnKey]: { byCustomer: Map(normName -> value), totalRaw: number } }
  // IMPORTANT: totalRaw must match Sales by Country totals exactly
  const columnIndex = useMemo(() => {
    const idx = {};
    dataColumnsOnly.forEach(col => {
      const key = getColumnKey(col);
      const rows = customerData[key] || [];
      const map = new Map();
      let totalRaw = 0;
      // Sum all values directly from API response (no merge rule processing here)
      // This ensures totalRaw matches Sales by Country which sums all API values
      for (let i = 0; i < rows.length; i++) {
        const nm = norm(rows[i].customer);
        const val = Number(rows[i].value || 0);
        // Accumulate per customer (handles duplicates if any)
        map.set(nm, (map.get(nm) || 0) + val);
        // Sum all raw values (this is the correct total matching Sales by Country)
        totalRaw += val;
      }
      idx[key] = { byCustomer: map, totalRaw };
    });
    return idx;
  }, [customerData, dataColumnsOnly]);

  // quick merge map: normalized mergedLabel -> array of normalized originals (from rules, existence check deferred to lookup)
  // CRITICAL: Deduplicate originalCustomers to prevent double-counting
  const mergeMap = useMemo(() => {
    const map = new Map();
    mergeRules.forEach(rule => {
      const mergedLabel = norm((rule.mergedName || '').toString().trim() + '*');
      const originalCustomers = rule.originalCustomers || [];
      // Deduplicate: Remove duplicate customer names (case-insensitive)
      const uniqueOriginals = [...new Set(originalCustomers.map(c => norm(c)))];
      map.set(mergedLabel, uniqueOriginals);
      
      // Log warning if duplicates were found
      if (originalCustomers.length !== uniqueOriginals.length) {
        console.warn(`⚠️ Merge rule "${rule.mergedName}": Had ${originalCustomers.length} entries but ${uniqueOriginals.length} unique customers (duplicates removed)`);
      }
    });
    return map;
  }, [mergeRules]);

  // valuesMatrix: Map(customerLabel -> { [columnKey]: valueNumber })
  const valuesMatrix = useMemo(() => {
    const matrix = new Map();
    // prepare once per customer
    customers.forEach(label => {
      const row = {};
      dataColumnsOnly.forEach(col => {
        const key = getColumnKey(col);
        const ci = columnIndex[key];
        if (!ci) { row[key] = 0; return; }

        // merged row?
        if ((label || '').endsWith('*')) {
          // Normalize the merged label (with *) to match mergeMap key
          const normalizedLabel = norm(label);
          const originals = mergeMap.get(normalizedLabel) || [];
          
          if (originals.length === 0) {
            // No merge rule found - try direct lookup without asterisk (fallback)
            const labelWithoutAsterisk = label.slice(0, -1).trim();
            console.warn(`⚠️ No merge rule found for merged customer: ${label}, trying direct lookup for: ${labelWithoutAsterisk}`);
            row[key] = ci.byCustomer.get(norm(labelWithoutAsterisk)) || 0;
          } else {
            // Sum values from all original customers in the merge rule
            let sum = 0;
            let foundCount = 0;
            for (let i = 0; i < originals.length; i++) {
              const v = ci.byCustomer.get(originals[i]) || 0;
              if (v > 0) foundCount++;
              sum += v;
            }
            if (foundCount === 0 && sum === 0) {
              // Debug: log when no original customers found in data
              console.debug(`🔍 Merged customer ${label}: found ${originals.length} original names in rule, but 0 values in data`);
            }
            row[key] = sum;
          }
        } else {
          // Regular customer - direct lookup
          row[key] = ci.byCustomer.get(norm(label)) || 0;
        }
      });
      matrix.set(label, row);
    });
    return matrix;
  }, [customers, dataColumnsOnly, columnIndex, mergeMap]);

  // columnTotals: per data column total - use RAW total from API (matches Sales by Country behavior)
  // This ensures totals match Sales by Country even if merge rules have issues
  const columnTotals = useMemo(() => {
    const obj = {};
    dataColumnsOnly.forEach(col => {
      const key = getColumnKey(col);
      // Use raw total from columnIndex - this is the actual sum from database (matches Sales by Country)
      // Merge rules only affect display names, not totals
      const ci = columnIndex[key];
      obj[key] = ci ? ci.totalRaw : 0;
    });
    return obj;
  }, [dataColumnsOnly, columnIndex]);

  const getCustomerAmountFast = (customerLabel, column) => {
    const key = getColumnKey(column);
    const row = valuesMatrix.get(customerLabel) || {};
    return row[key] || 0;
  };

  const getCustomerPercentFast = (customerLabel, column) => {
    const key = getColumnKey(column);
    const value = getCustomerAmountFast(customerLabel, column);
    const total = columnTotals[key] || 0;
    if (total === 0) return 0;
    return (value / total) * 100;
  };

  // Calculate delta with SMART formula based on comparison type
  const calculateDelta = (fromValue, toValue, fromColType, toColType) => {
    const fromType = (fromColType || 'Actual').toLowerCase();
    const toType = (toColType || 'Actual').toLowerCase();
    
    let actualValue, referenceValue;
    
    // Smart formula selection based on comparison types
    if (toType === 'actual' && fromType !== 'actual') {
      actualValue = toValue;
      referenceValue = fromValue;
    } else if (fromType === 'actual' && toType !== 'actual') {
      actualValue = fromValue;
      referenceValue = toValue;
    } else {
      actualValue = toValue;
      referenceValue = fromValue;
    }
    
    if (referenceValue === 0) {
      if (actualValue > 0) return 'NEW';
      if (actualValue === 0) return 'NONE';
      return 0;
    }
    return ((actualValue - referenceValue) / referenceValue) * 100;
  };

  const formatPercentage = (num) => `${(isNaN(num) ? 0 : num).toFixed(1)}%`;
  const formatDelta = (delta) => {
    if (isNaN(delta)) return '—';
    if (delta === 'NEW') return '🆕 NEW';
    if (delta === 'NONE') return '—';
    if (delta === 0) return '0.0%';
    const sign = delta > 0 ? '+' : '';
    const formatted = Math.abs(delta) >= 100 ? Math.round(delta) : delta.toFixed(1);
    return `${sign}${formatted}%`;
  };
  const getDeltaColor = (delta) => {
    if (isNaN(delta)) return '#666666';
    if (delta === 'NEW') return '#059669'; // Green for new data
    if (delta === 'NONE') return '#6b7280'; // Gray for no activity
    if (delta === 0) return '#666666'; // Gray for no change
    return delta > 0 ? '#0066cc' : '#cc0000'; // Blue for positive, red for negative
  };

  const getCustomerSalesRep = (customerLabel) => {
    const isMergedLabel = customerLabel.endsWith('*');
    const cleanedLabel = isMergedLabel ? customerLabel.slice(0, -1).trim() : customerLabel;
    const normalizedKey = norm(cleanedLabel);

    // 1) Direct lookup (covers merged customers precomputed by backend)
    const directEntry = customerSalesRepMap[normalizedKey];
    if (directEntry?.salesRep && directEntry.salesRep !== 'N/A') {
      return directEntry.salesRep;
    }

    // 2) For merged customers: derive from merge rule + original customers
    if (isMergedLabel) {
      const rule = mergeRules.find(r => norm(r.mergedName || '') === normalizedKey);
      if (!rule) {
        // No merge rule found - try direct lookup as fallback
        const fallback = customerSalesRepMap[normalizedKey];
        return fallback?.salesRep || 'N/A';
      }

      // Collect sales reps from all original customers in the merge rule
      const salesReps = (rule.originalCustomers || [])
        .map(origCustomer => {
          const origNormalized = norm(origCustomer);
          const salesRepData = customerSalesRepMap[origNormalized];
          if (!salesRepData || !salesRepData.salesRep || salesRepData.salesRep === 'N/A') return null;
          return {
            salesRep: salesRepData.salesRep,
            customer: origCustomer,
            year: salesRepData.year || 0,
            month: salesRepData.month || 0
          };
        })
        .filter(Boolean);

      if (salesReps.length === 0) {
        // No sales reps found for original customers - return N/A
        return 'N/A';
      }

      // Sort by most recent year, then month (descending)
      salesReps.sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return (b.month || 0) - (a.month || 0);
      });

      return salesReps[0].salesRep;
    }

    // 3) Final fallback: raw lookup with original label casing
    const fallback = customerSalesRepMap[norm(customerLabel)];
    return fallback?.salesRep || 'N/A';
  };

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

  // ---------- sorted top 20 & summary using the matrix ----------
  const sortedCustomers = useMemo(() => {
    if (!customers || customers.length === 0) return [];
    if (dataColumnsOnly.length === 0) return customers.slice(0, 20);

    const baseCol = dataColumnsOnly[effectiveBasePeriodIndex];
    const sorted = [...customers].sort((a, b) => {
      const av = getCustomerAmountFast(a, baseCol);
      const bv = getCustomerAmountFast(b, baseCol);
      return bv - av;
    });
    return sorted.slice(0, 20);
  }, [customers, dataColumnsOnly, effectiveBasePeriodIndex, valuesMatrix]);

  const summaryData = useMemo(() => {
    if (!customers || customers.length === 0 || dataColumnsOnly.length === 0) return null;

    const baseCol = dataColumnsOnly[effectiveBasePeriodIndex];

    const fullSorted = [...customers].sort((a, b) => {
      const av = getCustomerAmountFast(a, baseCol);
      const bv = getCustomerAmountFast(b, baseCol);
      return bv - av;
    });
    const top20 = fullSorted.slice(0, 20);
    const rest = fullSorted.slice(20);

    const summary = {};
    dataColumnsOnly.forEach(col => {
      const key = getColumnKey(col);
      // Use raw total from API (matches Sales by Country) - this is the CORRECT total
      const total = columnTotals[key] || 0;

      let top20Total = top20.reduce((s, cust) => s + getCustomerAmountFast(cust, col), 0);
      let remainingTotal = rest.reduce((s, cust) => s + getCustomerAmountFast(cust, col), 0);

      // CRITICAL FIX: Normalize Top 20 + Other to match Total (prevents double-counting)
      // If sum exceeds total (due to merge rule issues), scale proportionally
      const sumFromMatrix = top20Total + remainingTotal;
      if (sumFromMatrix > 0 && Math.abs(sumFromMatrix - total) > 0.01) {
        // Scale proportionally to match the correct total
        const scaleFactor = total / sumFromMatrix;
        top20Total = top20Total * scaleFactor;
        remainingTotal = remainingTotal * scaleFactor;
        console.warn(`⚠️ Normalized Top 20 + Other (${sumFromMatrix.toFixed(2)}) to match Total (${total.toFixed(2)}) using scale factor ${scaleFactor.toFixed(4)}`);
      }

      summary[key] = {
        top20Total,
        remainingTotal,
        allTotal: total, // This is the CORRECT total from raw API data
        customersWithData: customers.filter(c => getCustomerAmountFast(c, col) > 0).length,
        top20Percentage: total > 0 ? (top20Total / total) * 100 : 0,
        remainingPercentage: total > 0 ? (remainingTotal / total) * 100 : 0
      };
    });

    return { top20Customers: top20, remainingCustomers: rest, totalCustomers: customers.length, summary };
  }, [customers, dataColumnsOnly, effectiveBasePeriodIndex, valuesMatrix, columnTotals]);

  // ---------- UI states ----------
  if (loading) {
    return (
      <div className="table-view">
        {!hideHeader && (
          <div className="table-title">
            <h2>Top 20 Customers - {selectedDivision}</h2>
          </div>
        )}
        <div className="table-empty-state">
          <p>Loading data from database...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="table-view">
        {!hideHeader && (
          <div className="table-title">
            <h2>Top 20 Customers - {selectedDivision}</h2>
          </div>
        )}
        <div className="table-empty-state">
          <p>❌ {error}</p>
        </div>
      </div>
    );
  }

  if (selectedDivision !== 'FP') {
    return (
      <div className="table-view">
        {!hideHeader && (
          <div className="table-title">
            <h2>Top 20 Customers - {selectedDivision}</h2>
          </div>
        )}
        <div className="table-empty-state">
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <h3 style={{ color: '#666', marginBottom: '20px' }}>🚧 Coming Soon</h3>
            <p style={{ color: '#888', fontSize: '16px' }}>
              Sales by Customer for {selectedDivision} division is currently under development.
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
      <div className="table-view">
        {!hideHeader && (
          <div className="table-title">
            <h2>Top 20 Customers - {selectedDivision}</h2>
          </div>
        )}
        <div className="table-empty-state">
          <p>Please generate data using the filters to view Sales by Customer.</p>
        </div>
      </div>
    );
  }

  // ---------- render ----------
  return (
    <div className="table-view">
      <div ref={tableRef} className="table-container-for-export">
        {!hideHeader && (
          <div className="table-title">
            <h2>Top 20 Customers - {selectedDivision}</h2>
            <div className="table-subtitle">
              <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                (<CurrencySymbol />)
              </div>
            </div>
          </div>
        )}
        <div className="table-container">
          <table className="sales-by-customer-table">
            <colgroup>
              <col style={{ width: `${columnWidths.customer}%` }}/>
              <col style={{ width: `${columnWidths.salesRep}%` }}/>
              {extendedColumns.map((col, index) => {
                if (col.columnType === 'delta') {
                  return (
                    <col
                      key={`col-delta-${index}`}
                      className="delta-col"
                      style={{ width: `${columnWidths.delta}%` }}
                    />
                  );
                }
                return (
                  <React.Fragment key={`col-data-${index}`}>
                    <col className="values-col" style={{ width: `${columnWidths.value}%` }} />
                    <col className="percent-col" style={{ width: `${columnWidths.percent}%` }} />
                  </React.Fragment>
                );
              })}
            </colgroup>
            <thead>
              <tr className="main-header-row">
                <th className="empty-header" rowSpan="4">Customer Names</th>
                <th className="sales-rep-header" rowSpan="4" style={{ backgroundColor: '#ffffff', color: '#000000', fontWeight: 'bold' }}>Sales Rep Names</th>
                {extendedColumns.map((col, index) =>
                  col.columnType === 'delta' ? (
                    <th key={`delta-year-${index}`} rowSpan="4" style={{ backgroundColor: '#1976d2', color: '#fbbf24', fontWeight: 'bold' }}>{col.deltaLabel}<br/>%</th>
                  ) : (
                    <th key={`year-${index}`} style={getColumnHeaderStyle(col)} colSpan={2}>
                      {col.year}
                    </th>
                  )
                )}
              </tr>
              <tr>
                {extendedColumns.map((col, index) =>
                  col.columnType === 'delta' ? null : (
                    <th key={`month-${index}`} style={getColumnHeaderStyle(col)} colSpan={2}>
                      {col.isCustomRange ? col.displayName : col.month}
                    </th>
                  )
                ).filter(Boolean)}
              </tr>
              <tr>
                {extendedColumns.map((col, index) =>
                  col.columnType === 'delta' ? null : (
                    <th key={`type-${index}`} style={getColumnHeaderStyle(col)} colSpan={2}>
                      {col.type}
                    </th>
                  )
                ).filter(Boolean)}
              </tr>
              <tr>
                {extendedColumns.map((col, index) =>
                  col.columnType === 'delta' ? null : (
                    <React.Fragment key={`fragment-${index}`}>
                      <th style={{ backgroundColor: getCellBackgroundColor(col), color: '#000', fontWeight: 'bold' }}>Values</th>
                      <th style={{ backgroundColor: getCellBackgroundColor(col), color: '#000', fontWeight: 'bold' }}>%</th>
                    </React.Fragment>
                  )
                ).filter(Boolean)}
              </tr>
            </thead>
            <tbody>
              {/* Separator row between headers and body */}
              <tr className="sbc-separator-row">
                <td></td>
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
              {/* Customer rows - one row per customer */}
              {sortedCustomers.map((customer, customerIndex) => {
                const isLastCustomer = customerIndex === sortedCustomers.length - 1;
                return (
                  <tr key={`customer-${customerIndex}-${customer.replace(/\s+/g, '-')}`}>
                    <td className={`row-label customer-name-cell ${isLastCustomer ? 'thick-border-bottom' : ''}`} title={customer}>
                      {toProperCase(customer)}
                    </td>
                    <td className={`row-label sales-rep-cell ${isLastCustomer ? 'thick-border-bottom' : ''}`}>
                      {toProperCase(getCustomerSalesRep(customer))}
                    </td>
                    {extendedColumns.map((column, columnIndex) => {
                      if (column.columnType === 'delta') {
                        const fromValue = getCustomerAmountFast(customer, column.fromColumn);
                        const toValue = getCustomerAmountFast(customer, column.toColumn);
                        // Pass column types for smart formula selection
                        const delta = calculateDelta(fromValue, toValue, column.fromColumn?.type, column.toColumn?.type);
                        return (
                          <td
                            key={columnIndex}
                            className={`metric-cell delta-cell ${isLastCustomer ? 'thick-border-bottom' : ''}`}
                            style={{ backgroundColor: '#f8f9fa', color: getDeltaColor(delta), fontWeight: 'bold' }}
                          >
                            {formatDelta(delta)}
                          </td>
                        );
                      } else {
                        const absolute = getCustomerAmountFast(customer, column);
                        const percentage = getCustomerPercentFast(customer, column);
                        return (
                          <React.Fragment key={`data-fragment-${columnIndex}`}>
                            <td className={`metric-cell ${isLastCustomer ? 'thick-border-bottom' : ''}`} style={{ backgroundColor: getCellBackgroundColor(column) }}>
                              {absolute.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            </td>
                            <td className={`metric-cell ${isLastCustomer ? 'thick-border-bottom' : ''}`} style={{ backgroundColor: getCellBackgroundColor(column) }}>
                              {formatPercentage(percentage)}
                            </td>
                          </React.Fragment>
                        );
                      }
                    })}
                  </tr>
                );
              })}

              {summaryData && (
                <>
                  <tr>
                    <td className="row-label summary-label total-top20-label" style={{ backgroundColor: '#2196F3', fontWeight: 'bold', color: 'white' }}>
                      Total Top 20 Customers
                    </td>
                    <td className="row-label summary-label" style={{ fontWeight: 'bold', fontSize: '12px', textAlign: 'center' }}>
                    </td>
                    {extendedColumns.map((column, idx) => {
                      if (column.columnType === 'delta') {
                        const fromKey = getColumnKey(column.fromColumn);
                        const toKey = getColumnKey(column.toColumn);
                        const fromData = summaryData.summary[fromKey];
                        const toData = summaryData.summary[toKey];
                        // Pass column types for smart formula selection
                        const delta = calculateDelta(fromData?.top20Total || 0, toData?.top20Total || 0, column.fromColumn?.type, column.toColumn?.type);
                        return (
                          <td key={`top20-delta-${idx}`} className="metric-cell delta-cell summary-cell" style={{ backgroundColor: '#f8f9fa', color: getDeltaColor(delta), fontWeight: 'bold' }}>
                            {formatDelta(delta)}
                          </td>
                        );
                      }
                      const key = getColumnKey(column);
                      const data = summaryData.summary[key];
                      return (
                        <React.Fragment key={`top20-fragment-${idx}`}>
                          <td className="metric-cell summary-cell" style={{ backgroundColor: getCellBackgroundColor(column), fontWeight: 'bold', color: '#000' }}>
                            {(data?.top20Total || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          </td>
                          <td className="metric-cell summary-cell" style={{ backgroundColor: getCellBackgroundColor(column), fontWeight: 'bold', color: '#000' }}>
                            {formatPercentage(data?.top20Percentage || 0)}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>

                  <tr>
                    <td className="row-label summary-label total-other-label" style={{ backgroundColor: '#1565C0', color: 'white', fontWeight: 'bold' }}>
                      Total Other Customers
                    </td>
                    <td className="row-label summary-label" style={{ fontWeight: 'bold', fontSize: '12px', textAlign: 'center' }}>
                    </td>
                    {extendedColumns.map((column, idx) => {
                      if (column.columnType === 'delta') {
                        const fromKey = getColumnKey(column.fromColumn);
                        const toKey = getColumnKey(column.toColumn);
                        const fromData = summaryData.summary[fromKey];
                        const toData = summaryData.summary[toKey];
                        // Pass column types for smart formula selection
                        const delta = calculateDelta(fromData?.remainingTotal || 0, toData?.remainingTotal || 0, column.fromColumn?.type, column.toColumn?.type);
                        return (
                          <td key={`other-delta-${idx}`} className="metric-cell delta-cell summary-cell" style={{ backgroundColor: '#f8f9fa', color: getDeltaColor(delta), fontWeight: 'bold' }}>
                            {formatDelta(delta)}
                          </td>
                        );
                      }
                      const key = getColumnKey(column);
                      const data = summaryData.summary[key];
                      return (
                        <React.Fragment key={`other-fragment-${idx}`}>
                          <td className="metric-cell summary-cell" style={{ backgroundColor: getCellBackgroundColor(column), color: '#000', fontWeight: 'bold' }}>
                            {(data?.remainingTotal || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          </td>
                          <td className="metric-cell summary-cell" style={{ backgroundColor: getCellBackgroundColor(column), color: '#000', fontWeight: 'bold' }}>
                            {formatPercentage(data?.remainingPercentage || 0)}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>

                  <tr>
                    <td className="row-label summary-label total-sales-label" style={{ backgroundColor: '#0D47A1', color: 'white', fontWeight: 'bold' }}>
                      Total Sales
                    </td>
                    <td className="row-label summary-label" style={{ fontWeight: 'bold', fontSize: '12px', textAlign: 'center' }}>
                    </td>
                    {extendedColumns.map((column, idx) => {
                      if (column.columnType === 'delta') {
                        const fromKey = getColumnKey(column.fromColumn);
                        const toKey = getColumnKey(column.toColumn);
                        const fromData = summaryData.summary[fromKey];
                        const toData = summaryData.summary[toKey];
                        const fromTotal = (fromData?.top20Total || 0) + (fromData?.remainingTotal || 0);
                        const toTotal = (toData?.top20Total || 0) + (toData?.remainingTotal || 0);
                        // Pass column types for smart formula selection
                        const delta = calculateDelta(fromTotal, toTotal, column.fromColumn?.type, column.toColumn?.type);
                        return (
                          <td key={`total-sales-delta-${idx}`} className="metric-cell delta-cell summary-cell" style={{ backgroundColor: '#f8f9fa', color: getDeltaColor(delta), fontWeight: 'bold' }}>
                            {formatDelta(delta)}
                          </td>
                        );
                      }
                      const key = getColumnKey(column);
                      const data = summaryData.summary[key];
                      // Use allTotal (raw API total) instead of summing top20 + remaining
                      // This ensures totals match Sales by Country exactly
                      const totalSales = data?.allTotal || 0;
                      return (
                        <td key={`total-sales-${idx}`} className="metric-cell summary-cell" style={{ backgroundColor: getCellBackgroundColor(column), color: '#000', fontWeight: 'bold' }} colSpan={2}>
                          {totalSales.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </td>
                      );
                    })}
                  </tr>

                  <tr>
                    <td className="row-label summary-label number-all-label" style={{ backgroundColor: '#1976D2', color: 'white', fontWeight: 'bold' }}>
                      Number of All Customers
                    </td>
                    <td className="row-label summary-label" style={{ fontWeight: 'bold', fontSize: '12px', textAlign: 'center' }}>
                    </td>
                    {extendedColumns.map((column, idx) => {
                      if (column.columnType === 'delta') {
                        // For count rows, show blank delta (not meaningful); keep layout stable
                        return (
                          <td key={`count-delta-${idx}`} className="metric-cell delta-cell summary-cell" style={{ backgroundColor: '#f8f9fa' }}>
                            {''}
                          </td>
                        );
                      }
                      const key = getColumnKey(column);
                      const data = summaryData.summary[key];
                      return (
                        <td key={`count-${idx}`} className="metric-cell summary-cell" style={{ backgroundColor: getCellBackgroundColor(column), color: '#000', fontWeight: 'bold' }} colSpan={2}>
                          {data?.customersWithData || 0}
                        </td>
                      );
                    })}
                  </tr>
                </>
              )}
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
};

export default SalesByCustomerTableNew;
