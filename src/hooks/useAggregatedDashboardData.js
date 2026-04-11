/**
 * useAggregatedDashboardData Hook
 * 
 * Aggregates data from the SAME sources as the dashboard cards.
 * This ensures the AI Write-Up uses identical data (with exclusions, merges, etc.)
 * 
 * Data Sources (same as cards):
 *   - P&L: PLDataContext (already loaded)
 *   - Products: /api/product-groups/fp (with exclusions)
 *   - Sales Reps: /api/sales-rep-divisional-ultra-fast
 *   - Customers: customer merge rules applied
 *   - Countries: /api/sales-by-country-db
 */

import { useState, useCallback, useMemo } from 'react';
import { usePLData } from '../contexts/PLDataContext';
import { useFilter } from '../contexts/FilterContext';
import { useExcelData } from '../contexts/ExcelDataContext';
import { computeCellValue } from '../utils/computeCellValue';

// Month name to number mapping
const MONTH_MAP = {
  'January': 1, 'February': 2, 'March': 3, 'April': 4,
  'May': 5, 'June': 6, 'July': 7, 'August': 8,
  'September': 9, 'October': 10, 'November': 11, 'December': 12
};

// Full year months
const FULL_YEAR = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Convert period column to months array (numbers)
 */
const expandMonthsToNumbers = (column) => {
  if (column.months && Array.isArray(column.months)) {
    return column.months.map(m => typeof m === 'string' ? MONTH_MAP[m] || parseInt(m) : m);
  }
  const month = column.month;
  if (month === 'FY' || month === 'Year') return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  if (month === 'HY1') return [1, 2, 3, 4, 5, 6];
  if (month === 'HY2') return [7, 8, 9, 10, 11, 12];
  if (month === 'Q1') return [1, 2, 3];
  if (month === 'Q2') return [4, 5, 6];
  if (month === 'Q3') return [7, 8, 9];
  if (month === 'Q4') return [10, 11, 12];
  return [MONTH_MAP[month] || 1];
};

/**
 * Get column key for consistent identification
 */
const getColumnKey = (column) => column.id || `${column.year}-${column.month}-${column.type}`;

/**
 * P&L Row indices based on FINANCIAL_ROWS in FinancialConstants.js
 */
const PL_ROWS = {
  SALES: 3,
  MATERIAL_COST: 4,
  GROSS_PROFIT: 5,
  GROSS_PROFIT_PCT: 6,
  SALES_VOLUME: 7,
  EBITDA: 23,
  NET_PROFIT: 28
};

export default function useAggregatedDashboardData() {
  const { plData, loading: plLoading } = usePLData();
  const { columnOrder, basePeriodIndex, dataGenerated } = useFilter();
  const { selectedDivision } = useExcelData();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [aggregatedData, setAggregatedData] = useState(null);

  // Get base period from filter context
  const basePeriod = useMemo(() => {
    if (!columnOrder || columnOrder.length === 0) return null;
    const idx = basePeriodIndex !== null && basePeriodIndex < columnOrder.length 
      ? basePeriodIndex 
      : columnOrder.length - 1;
    return columnOrder[idx];
  }, [columnOrder, basePeriodIndex]);

  // Get comparison period (previous in the list)
  const compPeriod = useMemo(() => {
    if (!columnOrder || columnOrder.length < 2) return null;
    const baseIdx = basePeriodIndex !== null && basePeriodIndex < columnOrder.length 
      ? basePeriodIndex 
      : columnOrder.length - 1;
    const compIdx = baseIdx > 0 ? baseIdx - 1 : (baseIdx < columnOrder.length - 1 ? baseIdx + 1 : null);
    return compIdx !== null ? columnOrder[compIdx] : null;
  }, [columnOrder, basePeriodIndex]);

  /**
   * Extract P&L data from PLDataContext (same as TableView)
   */
  const extractPLData = useCallback((period) => {
    if (!plData || !selectedDivision || !period) return null;
    
    const divisionData = plData[selectedDivision] || [];
    if (divisionData.length === 0) return null;

    const getValue = (rowIndex) => {
      try {
        const value = computeCellValue(divisionData, rowIndex, period);
        return typeof value === 'number' ? value : 0;
      } catch {
        return 0;
      }
    };

    const sales = getValue(PL_ROWS.SALES);
    const materialCost = getValue(PL_ROWS.MATERIAL_COST);
    const grossProfit = getValue(PL_ROWS.GROSS_PROFIT);
    const salesVolume = getValue(PL_ROWS.SALES_VOLUME);
    const ebitda = getValue(PL_ROWS.EBITDA);
    const netProfit = getValue(PL_ROWS.NET_PROFIT);

    return {
      sales,
      materialCost: Math.abs(materialCost),
      grossProfit,
      grossProfitPct: sales !== 0 ? (grossProfit / sales) * 100 : 0,
      salesVolume,
      ebitda,
      ebitdaPct: sales !== 0 ? (ebitda / sales) * 100 : 0,
      netProfit,
      netProfitPct: sales !== 0 ? (netProfit / sales) * 100 : 0,
      asp: salesVolume !== 0 ? sales / salesVolume : 0
    };
  }, [plData, selectedDivision]);

  /**
   * Fetch Product Group data (same API as ProductGroupTable)
   */
  const fetchProductData = useCallback(async (period) => {
    if (!period || !selectedDivision) return null;

    try {
      const months = expandMonthsToNumbers(period);
      const queryString = `year=${period.year}&type=${period.type || 'Actual'}&months=${JSON.stringify(months)}`;
      
      const response = await fetch(`/api/product-groups/fp?${queryString}`);
      const result = await response.json();
      
      if (result.success && result.data?.productGroups) {
        const productGroups = result.data.productGroups;
        
        // Calculate totals and format data
        let totalSales = 0;
        let totalVolume = 0;
        const products = productGroups.map(pg => {
          const salesMetric = pg.metrics.find(m => m.type === 'sales');
          const volumeMetric = pg.metrics.find(m => m.type === 'volume');
          const sales = salesMetric?.data?.[0] || 0;
          const volume = volumeMetric?.data?.[0] || 0;
          totalSales += sales;
          totalVolume += volume;
          return {
            name: pg.name,
            sales,
            volume,
            asp: volume !== 0 ? sales / volume : 0
          };
        });

        // Sort by sales descending
        products.sort((a, b) => b.sales - a.sales);

        // Calculate share percentages
        products.forEach(p => {
          p.shareOfSales = totalSales !== 0 ? (p.sales / totalSales) * 100 : 0;
        });

        return {
          products,
          totalSales,
          totalVolume,
          avgASP: totalVolume !== 0 ? totalSales / totalVolume : 0,
          productCount: products.length,
          topProducts: products.slice(0, 5)
        };
      }
      return null;
    } catch (err) {
      console.error('Error fetching product data:', err);
      return null;
    }
  }, [selectedDivision]);

  /**
   * Fetch Sales Rep data (same API as SalesBySalesRepDivisional)
   */
  const fetchSalesRepData = useCallback(async (period, budgetPeriod) => {
    if (!period || !selectedDivision) return null;

    try {
      // Get all sales reps first
      const salesRepsResponse = await fetch(`/api/sales-reps-universal?division=${encodeURIComponent(selectedDivision)}`);
      const salesRepsData = await salesRepsResponse.json();
      const allSalesReps = (salesRepsData.success && salesRepsData.data)
        ? salesRepsData.data.map(r => String(r).trim().toUpperCase())
        : [];

      if (allSalesReps.length === 0) return null;

      // Build columns for API call
      const columns = [period];
      if (budgetPeriod) columns.push(budgetPeriod);

      const response = await fetch('/api/sales-rep-divisional-ultra-fast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          division: selectedDivision,
          salesReps: allSalesReps,
          columns: columns.map(col => ({
            year: col.year,
            month: col.month,
            months: col.months,
            type: col.type || 'Actual',
            columnKey: getColumnKey(col)
          }))
        })
      });

      const result = await response.json();
      
      if (result.success && result.data) {
        const baseKey = getColumnKey(period);
        const budgetKey = budgetPeriod ? getColumnKey(budgetPeriod) : null;

        const reps = [];
        let totalSales = 0;
        let totalBudget = 0;

        Object.entries(result.data).forEach(([repName, repData]) => {
          const sales = repData[baseKey] || 0;
          const budget = budgetKey ? (repData[budgetKey] || 0) : 0;
          
          if (Math.abs(sales) > 0 || Math.abs(budget) > 0) {
            totalSales += sales;
            totalBudget += budget;
            reps.push({
              name: repName,
              sales,
              budget,
              achievement: budget !== 0 ? (sales / budget) * 100 : (sales > 0 ? 100 : 0)
            });
          }
        });

        // Sort by sales descending
        reps.sort((a, b) => b.sales - a.sales);

        // Identify top performers (>100% achievement) and needs attention (<80%)
        const topPerformers = reps.filter(r => r.achievement >= 100).slice(0, 3);
        const needsAttention = reps.filter(r => r.achievement < 80 && r.budget > 0);

        return {
          reps,
          totalSales,
          totalBudget,
          repCount: reps.length,
          overallAchievement: totalBudget !== 0 ? (totalSales / totalBudget) * 100 : 0,
          topPerformers,
          needsAttention,
          avgAchievement: reps.length > 0 
            ? reps.reduce((sum, r) => sum + r.achievement, 0) / reps.length 
            : 0
        };
      }
      return null;
    } catch (err) {
      console.error('Error fetching sales rep data:', err);
      return null;
    }
  }, [selectedDivision]);

  /**
   * Fetch Customer data (same API as SalesByCustomerTableNew - /api/sales-by-customer-ultra-fast)
   */
  const fetchCustomerData = useCallback(async (period) => {
    if (!period || !selectedDivision) return null;

    try {
      // Get merge rules first (same endpoint as SalesByCustomerTableNew)
      const mergeResponse = await fetch(`/api/division-merge-rules/rules?division=${encodeURIComponent(selectedDivision)}`);
      const mergeResult = await mergeResponse.json();
      const mergeRules = (mergeResult.success && Array.isArray(mergeResult.data)) ? mergeResult.data : [];

      // Build merge map: original customer -> merged name
      const childToParentMap = {};
      mergeRules.forEach(rule => {
        const mergedName = rule.merged_customer_name;
        const originalCustomers = rule.original_customers || [];
        originalCustomers.forEach(original => {
          childToParentMap[original.toLowerCase().trim()] = mergedName;
        });
      });

      const months = expandMonthsToNumbers(period);
      
      // Use the SAME API as SalesByCustomerTableNew
      const response = await fetch('/api/sales-by-customer-ultra-fast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          division: selectedDivision,
          columns: [{
            year: period.year,
            month: period.month,
            months: period.months || months.map(n => FULL_YEAR[n - 1]),
            type: period.type || 'Actual',
            columnKey: getColumnKey(period)
          }]
        })
      });

      const result = await response.json();
      
      if (result.success && result.data) {
        const baseKey = getColumnKey(period);
        const customerTotals = {};

        // The ultra-fast API returns data keyed by columnKey, each containing array of customer rows
        const columnData = result.data[baseKey] || [];
        
        // Aggregate with merge rules applied
        if (Array.isArray(columnData)) {
          columnData.forEach(row => {
            const customerName = row.customer || '';
            const sales = row.sales || 0;
            const normName = customerName.toLowerCase().trim();
            const displayName = childToParentMap[normName] || customerName;
            
            if (!customerTotals[displayName]) {
              customerTotals[displayName] = 0;
            }
            customerTotals[displayName] += sales;
          });
        }

        // Convert to array and sort
        const customers = Object.entries(customerTotals)
          .filter(([_, sales]) => Math.abs(sales) > 0)
          .map(([name, sales]) => ({ name, sales }))
          .sort((a, b) => b.sales - a.sales);

        const totalSales = customers.reduce((sum, c) => sum + c.sales, 0);

        // Calculate cumulative share (Pareto)
        let cumulative = 0;
        customers.forEach(c => {
          c.shareOfSales = totalSales !== 0 ? (c.sales / totalSales) * 100 : 0;
          cumulative += c.shareOfSales;
          c.cumulativeShare = cumulative;
        });

        // Find how many customers make up 80% of sales
        const top80Index = customers.findIndex(c => c.cumulativeShare >= 80);
        const top80Count = top80Index >= 0 ? top80Index + 1 : customers.length;
        const top20Pct = customers.length > 0 ? (top80Count / customers.length) * 100 : 0;

        return {
          customers,
          totalCustomers: customers.length,
          totalSales,
          top20: customers.slice(0, Math.ceil(customers.length * 0.2)),
          top80SalesCount: top80Count,
          top20Contribution: 100 - top20Pct, // Inverted: what % of customers = 80% sales
          paretoAnalysis: customers.slice(0, 10) // Top 10 for display
        };
      }
      return null;
    } catch (err) {
      console.error('Error fetching customer data:', err);
      return null;
    }
  }, [selectedDivision]);

  /**
   * Fetch Country data (same API as SalesByCountryTable)
   */
  const fetchCountryData = useCallback(async (period) => {
    if (!period || !selectedDivision) return null;

    try {
      const months = expandMonthsToNumbers(period);
      
      const response = await fetch('/api/sales-by-country-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          division: selectedDivision,
          year: period.year,
          months: months,
          dataType: period.type || 'Actual'
        })
      });

      const result = await response.json();
      
      if (result.success && Array.isArray(result.data)) {
        const countries = result.data
          .filter(item => Math.abs(item.value || 0) > 0)
          .map(item => ({
            name: item.country,
            sales: item.value || 0
          }))
          .sort((a, b) => b.sales - a.sales);

        const totalSales = countries.reduce((sum, c) => sum + c.sales, 0);

        // Calculate share
        countries.forEach(c => {
          c.shareOfSales = totalSales !== 0 ? (c.sales / totalSales) * 100 : 0;
        });

        return {
          countries,
          countryCount: countries.length,
          totalSales,
          topCountries: countries.slice(0, 5)
        };
      }
      return null;
    } catch (err) {
      console.error('Error fetching country data:', err);
      return null;
    }
  }, [selectedDivision]);

  /**
   * Main aggregation function - fetches all data from same sources as cards
   */
  const aggregateData = useCallback(async () => {
    if (!dataGenerated || !selectedDivision || !basePeriod) {
      setError('Please generate data first by selecting periods');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('📊 Aggregating dashboard data for AI analysis...', { 
        division: selectedDivision, 
        basePeriod,
        compPeriod 
      });

      // Find budget period for the same year/months
      const budgetPeriod = columnOrder.find(col => 
        col.year === basePeriod.year && 
        col.month === basePeriod.month &&
        col.type === 'Budget'
      );

      // Fetch all data in parallel (same APIs as cards)
      const [productData, salesRepData, customerData, countryData] = await Promise.all([
        fetchProductData(basePeriod),
        fetchSalesRepData(basePeriod, budgetPeriod),
        fetchCustomerData(basePeriod),
        fetchCountryData(basePeriod)
      ]);

      // Extract P&L data (already loaded in PLDataContext)
      const basePL = extractPLData(basePeriod);
      const compPL = compPeriod ? extractPLData(compPeriod) : null;

      // Calculate changes if comparison period exists
      let changes = null;
      if (basePL && compPL) {
        changes = {
          salesChange: compPL.sales !== 0 ? ((basePL.sales - compPL.sales) / Math.abs(compPL.sales)) * 100 : 0,
          gpPctChange: basePL.grossProfitPct - compPL.grossProfitPct,
          ebitdaChange: compPL.ebitda !== 0 ? ((basePL.ebitda - compPL.ebitda) / Math.abs(compPL.ebitda)) * 100 : 0,
          volumeChange: compPL.salesVolume !== 0 ? ((basePL.salesVolume - compPL.salesVolume) / compPL.salesVolume) * 100 : 0
        };
      }

      // Build aggregated result
      const result = {
        metadata: {
          division: selectedDivision,
          basePeriod: {
            year: basePeriod.year,
            month: basePeriod.displayName || basePeriod.month,
            type: basePeriod.type
          },
          compPeriod: compPeriod ? {
            year: compPeriod.year,
            month: compPeriod.displayName || compPeriod.month,
            type: compPeriod.type
          } : null,
          generatedAt: new Date().toISOString()
        },
        pl: {
          current: basePL,
          comparison: compPL,
          changes
        },
        products: productData,
        salesReps: salesRepData,
        customers: customerData,
        countries: countryData,
        budget: {
          actual: basePL?.sales || 0,
          budget: salesRepData?.totalBudget || 0,
          achievement: salesRepData?.overallAchievement || 0,
          gap: (basePL?.sales || 0) - (salesRepData?.totalBudget || 0)
        }
      };

      console.log('✅ Dashboard data aggregated successfully:', result);
      setAggregatedData(result);
      return result;

    } catch (err) {
      console.error('❌ Error aggregating dashboard data:', err);
      setError(err.message || 'Failed to aggregate data');
      return null;
    } finally {
      setLoading(false);
    }
  }, [
    dataGenerated, 
    selectedDivision, 
    basePeriod, 
    compPeriod, 
    columnOrder,
    extractPLData,
    fetchProductData,
    fetchSalesRepData,
    fetchCustomerData,
    fetchCountryData
  ]);

  return {
    aggregateData,
    aggregatedData,
    loading: loading || plLoading,
    error,
    basePeriod,
    compPeriod,
    dataGenerated
  };
}
