import React, { useState, useEffect } from 'react';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { usePLData } from '../../contexts/PLDataContext';
import { useSalesData } from '../../contexts/SalesDataContext';
import { useFilter } from '../../contexts/FilterContext';
import { formatCustomRangeDisplay } from '../../utils/periodHelpers';
import { computeCellValue as sharedComputeCellValue } from '../../utils/computeCellValue';
import FinancialPerformance from './components/FinancialPerformance';
import CustomerInsights from './components/CustomerInsights';
import ErrorBoundary from './components/ErrorBoundary';
import { formatAEDSymbol, formatAEDPerKg, formatAEDLarge } from './utils/CurrencyFormatters';
import './KPIExecutiveSummary.css';

const KPIExecutiveSummary = ({ showPeriodHeader = true, showTitle = true }) => {
  // P&L data from database via PLDataContext (Excel-format for computeCellValue)
  const { selectedDivision, getDivisionDisplayName } = useExcelData();
  const { plData, loading: loadingPlData, error: plDataError } = usePLData();
  const { salesData } = useSalesData();
  const { columnOrder, basePeriodIndex, dataGenerated } = useFilter();
  
  // State for API-based product performance data
  const [productPerformanceData, setProductPerformanceData] = useState(null);
  const [loadingProductData, setLoadingProductData] = useState(false);
  const [productPerformanceError, setProductPerformanceError] = useState(null);
  
  // State for API-based geographic distribution data
  const [geographicData, setGeographicData] = useState(null);
  const [loadingGeographicData, setLoadingGeographicData] = useState(false);
  const [geographicDataError, setGeographicDataError] = useState(null);
  
  // State for API-based customer insights data
  const [customerInsightsData, setCustomerInsightsData] = useState(null);
  const [loadingCustomerInsights, setLoadingCustomerInsights] = useState(false);
  const [customerInsightsError, setCustomerInsightsError] = useState(null);
  
  // Fetch product performance data from API for FP division
  useEffect(() => {
    let abortController = new AbortController();
    
    const fetchProductPerformance = async () => {
      // Only use API for FP division
      const divisionCode = (selectedDivision ?? '').replace(/-.*$/, '');
      if (divisionCode !== 'FP') {
        setProductPerformanceData(null);
        setProductPerformanceError(null);
        return;
      }
      
      setLoadingProductData(true);
      setProductPerformanceError(null);
      
      try {
        // Check if we have the required data for API call
        const hasValidColumnOrder = Array.isArray(columnOrder) && columnOrder.length > 0;
        const hasValidBasePeriod = basePeriodIndex != null && basePeriodIndex < columnOrder.length;
        const hasValidMonths = columnOrder[basePeriodIndex]?.months && Array.isArray(columnOrder[basePeriodIndex].months);
        
        if (!hasValidColumnOrder || !hasValidBasePeriod || !hasValidMonths) {
          return;
        }
        
        // Create comparison period: use the period BEFORE the base period in the sequence
        // This allows comparing Actual to Estimate, Estimate to Budget, etc.
        const currentPeriodData = columnOrder[basePeriodIndex];
        const hasPreviousPeriod = basePeriodIndex > 0;
        const comparisonPeriod = hasPreviousPeriod ? {
          year: columnOrder[basePeriodIndex - 1].year,
          months: columnOrder[basePeriodIndex - 1].months,
          type: columnOrder[basePeriodIndex - 1].type
        } : null; // No comparison if this is the first period
        
        const response = await fetch('/api/fp/product-performance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentPeriod: {
              year: currentPeriodData?.year,
              months: currentPeriodData?.months,
              type: currentPeriodData?.type
            },
            comparisonPeriod: comparisonPeriod
          }),
          signal: abortController.signal
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }
        
        const result = await response.json();
        
        if (result.success && result.data) {
          setProductPerformanceData(result.data);
          // Expose to window for export capture
          if (typeof window !== 'undefined') {
            window.__kpiProductPerformanceData = result.data;
          }
        } else {
          throw new Error(result.message || 'API returned unsuccessful response');
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('📦 Error fetching product performance:', error);
          setProductPerformanceError(error.message);
          
          // Try fallback to embedded data (for exported HTML)
          if (typeof window !== 'undefined' && window.__kpiProductPerformanceData) {
            setProductPerformanceData(window.__kpiProductPerformanceData);
          } else {
            setProductPerformanceData(null);
          }
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoadingProductData(false);
        }
      }
    };
    
    // Add a small delay to prevent rapid API calls during state changes
    const timeoutId = setTimeout(fetchProductPerformance, 100);
    
    return () => {
      clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [selectedDivision, columnOrder, basePeriodIndex]);

  // Fetch geographic distribution data from API for FP division
  useEffect(() => {
    let abortController = new AbortController();
    
    const fetchGeographicDistribution = async () => {
      // Only use API for FP division
      const divisionCode = (selectedDivision ?? '').replace(/-.*$/, '');
      if (divisionCode !== 'FP') {
        setGeographicData(null);
        setGeographicDataError(null);
        return;
      }
      
      setLoadingGeographicData(true);
      setGeographicDataError(null);
      
      try {
        // Check if we have the required data for API call
        const hasValidColumnOrder = Array.isArray(columnOrder) && columnOrder.length > 0;
        const hasValidBasePeriod = basePeriodIndex != null && basePeriodIndex < columnOrder.length;
        const hasValidMonths = columnOrder[basePeriodIndex]?.months && Array.isArray(columnOrder[basePeriodIndex].months);
        
        if (!hasValidColumnOrder || !hasValidBasePeriod || !hasValidMonths) {
          return;
        }
        
        // Convert month names to integers
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const monthIntegers = columnOrder[basePeriodIndex].months.map(month => monthNames.indexOf(month) + 1);
        
        // Validate month integers
        if (monthIntegers.some(month => month === 0)) {
          throw new Error('Invalid month names provided. Please use standard month names (January, February, etc.)');
        }
        
        
        const response = await fetch('/api/geographic-distribution', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            division: 'FP',
            year: columnOrder[basePeriodIndex].year,
            months: monthIntegers,
            type: columnOrder[basePeriodIndex].type,
            includeComparison: true
          }),
          signal: abortController.signal
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('🌍 Server error response:', errorText);
          throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }
        
        const result = await response.json();
        
        if (result.success && result.data) {
          // Validate that we have meaningful data
          if (result.data.totalSales > 0) {
            setGeographicData(result.data);
          } else {
            console.warn('⚠️ Geographic distribution API returned zero total sales');
            setGeographicDataError('No sales data found for the selected period');
          }
        } else {
          throw new Error(result.message || 'API returned unsuccessful response');
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('🌍 Error fetching geographic distribution:', error);
          setGeographicDataError(error.message);
          
          // Try fallback to embedded data (for exported HTML)
          if (typeof window !== 'undefined' && window.__kpiGeographicData) {
            setGeographicData(window.__kpiGeographicData);
          } else {
            setGeographicData(null);
          }
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoadingGeographicData(false);
        }
      }
    };
    
    // Add a small delay to prevent rapid API calls during state changes
    const timeoutId = setTimeout(fetchGeographicDistribution, 100);
    
    return () => {
      clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [selectedDivision, columnOrder, basePeriodIndex]);
  
  // Fetch customer insights data from API for FP division
  useEffect(() => {
    let abortController = new AbortController();
    
    const fetchCustomerInsights = async () => {
      // Only use API for FP division
      const divisionCode = (selectedDivision ?? '').replace(/-.*$/, '');
      if (divisionCode !== 'FP') {
        setCustomerInsightsData(null);
        setCustomerInsightsError(null);
        return;
      }
      
      setLoadingCustomerInsights(true);
      setCustomerInsightsError(null);
      
      try {
        // Check if we have the required data for API call
        const hasValidColumnOrder = Array.isArray(columnOrder) && columnOrder.length > 0;
        const hasValidBasePeriod = basePeriodIndex != null && basePeriodIndex < columnOrder.length;
        const hasValidMonths = columnOrder[basePeriodIndex]?.months && Array.isArray(columnOrder[basePeriodIndex].months);
        
        if (!hasValidColumnOrder || !hasValidBasePeriod || !hasValidMonths) {
          return;
        }
        
        // Convert month names to integers
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const monthIntegers = columnOrder[basePeriodIndex].months.map(month => monthNames.indexOf(month) + 1);
        
        // Validate month integers
        if (monthIntegers.some(month => month === 0)) {
          throw new Error('Invalid month names provided. Please use standard month names (January, February, etc.)');
        }
        
        const response = await fetch('/api/customer-insights-db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            division: 'FP',
            year: columnOrder[basePeriodIndex].year,
            months: monthIntegers,
            type: columnOrder[basePeriodIndex].type
          }),
          signal: abortController.signal
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }
        
        const result = await response.json();
        
        if (result.success && result.data) {
          setCustomerInsightsData(result.data);
          // Expose to window for export capture
          if (typeof window !== 'undefined') {
            window.__kpiCustomerInsightsData = result.data;
          }
        } else {
          throw new Error(result.message || 'API returned unsuccessful response');
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('👥 Error fetching customer insights:', error);
          setCustomerInsightsError(error.message);
          
          // Try fallback to embedded data (for exported HTML)
          if (typeof window !== 'undefined' && window.__kpiCustomerInsightsData) {
            setCustomerInsightsData(window.__kpiCustomerInsightsData);
          } else {
            setCustomerInsightsData(null);
          }
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoadingCustomerInsights(false);
        }
      }
    };
    
    // Add a small delay to prevent rapid API calls during state changes
    const timeoutId = setTimeout(fetchCustomerInsights, 100);
    
    return () => {
      clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [selectedDivision, columnOrder, basePeriodIndex]);
  
  // Enhanced defensive checks
  if (!dataGenerated || !Array.isArray(columnOrder) || columnOrder.length === 0) {
    return <div className="kpi-error-state">Please select periods in the Period Configuration and click Generate to view data.</div>;
  }
  
  // Check if this is a non-FP division and show database notification
  const divisionCode = (selectedDivision ?? '').replace(/-.*$/, '');
  if (divisionCode !== 'FP') {
    return (
      <div className="kpi-error-state">
        <h3>📊 Database Integration Required</h3>
        <p>This division ({divisionCode}) requires database integration to display KPI data.</p>
        <p>Only FP division is currently connected to the database.</p>
        <p>Please contact the development team to enable database connectivity for {divisionCode} division.</p>
      </div>
    );
  }
  
  if (basePeriodIndex == null || basePeriodIndex >= columnOrder.length) {
    return <div className="kpi-error-state">No base period selected. Please select a base period (★) in the Period Configuration.</div>;
  }
  
  const basePeriod = columnOrder[basePeriodIndex];
  if (!basePeriod) {
    return <div className="kpi-error-state">Invalid base period. Please select a valid period.</div>;
  }
  
  
  if (!basePeriod.months || !Array.isArray(basePeriod.months)) {
    return <div className="kpi-error-state">Base period configuration is incomplete. Please reconfigure your periods.</div>;
  }

  // Get division P&L data in Excel-like format (from database, transformed)
  const divisionData = plData[selectedDivision] || [];
  
  // Use computeCellValue like other working cards (MarginAnalysis, ManufacturingCost, etc.)
  const computeCellValue = (rowIndex, column) =>
    sharedComputeCellValue(divisionData, rowIndex, column);

  
  const basePeriodName = basePeriod ? `${basePeriod.year} ${basePeriod.isCustomRange ? formatCustomRangeDisplay(basePeriod.displayName) : (basePeriod.month || '')} ${basePeriod.type}`.trim() : '';
  const comparisonPeriod = basePeriodIndex > 0 ? columnOrder[basePeriodIndex - 1] : null;
  const comparisonPeriodName = comparisonPeriod ? `${comparisonPeriod.year} ${comparisonPeriod.isCustomRange ? formatCustomRangeDisplay(comparisonPeriod.displayName) : (comparisonPeriod.month || '')} ${comparisonPeriod.type}`.trim() : '';
  
  // P&L Row indices (from plRowMapping.js):
  // Row 3: sales, Row 19: gross_profit, Row 54: net_profit, Row 56: ebitda
  const ROW_SALES = 3;
  const ROW_GROSS_PROFIT = 19;
  const ROW_NET_PROFIT = 54;
  const ROW_EBITDA = 56;
  
  // Get financial values using computeCellValue (same as working cards)
  const sales = computeCellValue(ROW_SALES, basePeriod);
  const grossProfit = computeCellValue(ROW_GROSS_PROFIT, basePeriod);
  const netProfit = computeCellValue(ROW_NET_PROFIT, basePeriod);
  const ebitda = computeCellValue(ROW_EBITDA, basePeriod);
  
  
  const salesPrev = comparisonPeriod ? computeCellValue(ROW_SALES, comparisonPeriod) : null;
  const grossProfitPrev = comparisonPeriod ? computeCellValue(ROW_GROSS_PROFIT, comparisonPeriod) : null;
  const netProfitPrev = comparisonPeriod ? computeCellValue(ROW_NET_PROFIT, comparisonPeriod) : null;
  const ebitdaPrev = comparisonPeriod ? computeCellValue(ROW_EBITDA, comparisonPeriod) : null;
  
  // Dynamic label based on column types (Actual vs Actual = YoY, Actual vs Budget = Vs Bgt, etc.)
  const getDeltaLabel = () => {
    if (!basePeriod || !comparisonPeriod) return '';
    
    const baseType = basePeriod.type;
    const compType = comparisonPeriod.type;
    
    // YoY = Actual vs Actual
    if (baseType === 'Actual' && compType === 'Actual') return 'YoY';
    
    // Determine the reference type (Budget, Estimate, Forecast)
    const referenceType = baseType !== 'Actual' ? baseType : compType;
    
    // Map reference type to abbreviation
    const typeAbbreviations = {
      'Budget': 'Vs Bgt',
      'Estimate': 'Vs Est',
      'Forecast': 'Vs Fcst'
    };
    
    return typeAbbreviations[referenceType] || 'Δ';
  };
  
  const deltaLabel = getDeltaLabel();
  
  const growth = (curr, prev) => {
    // Show growth if we have valid comparison data
    if (!prev || prev === 0) return '';
    
    // Smart formula: determine actual vs reference based on column types
    const baseType = basePeriod?.type;
    const compType = comparisonPeriod?.type;
    
    let actual, reference;
    
    if (baseType === 'Actual' && compType === 'Actual') {
      // YoY comparison: base is newer, comp is older
      actual = curr;
      reference = prev;
    } else if (baseType === 'Actual') {
      // Base is Actual, comparison is Budget/Estimate/Forecast
      actual = curr;
      reference = prev;
    } else if (compType === 'Actual') {
      // Comparison is Actual, base is Budget/Estimate/Forecast
      actual = prev;
      reference = curr;
    } else {
      // Both are non-Actual - use standard formula
      actual = curr;
      reference = prev;
    }
    
    const rawGrowthPercent = ((actual - reference) / Math.abs(reference)) * 100;
    const growthPercent = rawGrowthPercent.toFixed(1);
    const absGrowth = Math.abs(parseFloat(growthPercent));
    
    // Handle zero or near-zero growth (less than 0.1%)
    if (absGrowth < 0.1) {
      return (
        <span>
          <span className="arrow-neutral">{deltaLabel}: — 0%</span>
        </span>
      );
    }
    
    const isPositive = rawGrowthPercent > 0;
    const arrow = isPositive ? '▲' : '▼';
    
    return (
      <span>
        <span className={isPositive ? 'arrow-positive' : 'arrow-negative'}>{deltaLabel}: {arrow} {absGrowth}%</span>
      </span>
    );
  };
  
  // Product Performance - Use API data for FP, Excel for others
  let productSales = [];
  let productKgs = [];
  let productMoRM = [];
  
  if (productPerformanceData && !loadingProductData) {
    // Use API data for FP division
    
    productPerformanceData.products.forEach(product => {
      productSales.push({ 
        name: product.name, 
        value: product.sales || 0, 
        material: product.material, 
        process: product.process,
        prevValue: product.sales_prev || 0
      });
      
      productKgs.push({ 
        name: product.name, 
        value: product.kgs || 0, 
        material: product.material, 
        process: product.process,
        prevValue: product.kgs_prev || 0
      });
      
      productMoRM.push({ 
        name: product.name, 
        value: product.morm || 0, 
        material: product.material, 
        process: product.process,
        prevValue: product.morm_prev || 0
      });
    });
    
  } else {
    // No data available - either loading or error
    // FP division should only use database APIs, no Excel fallback
  }
  
  // Calculate KPIs
  productSales.sort((a, b) => b.value - a.value);
  const totalProductSales = productSales.reduce((sum, p) => sum + p.value, 0);
  
  // Calculate growth for each product to find top performers in growth
  const productGrowth = [];
  // Use API comparison data - the API fetches year-over-year comparison regardless of columnOrder
  if (productSales.length > 0) {
    productSales.forEach(product => {
      // For API data, use the prevValue if available
      let prevSales = 0;
      
      if (productPerformanceData && !loadingProductData) {
        // Use API data with previous values (year-over-year comparison)
        prevSales = product.prevValue || 0;
      }
      
      if (prevSales > 0) {
        const growthPercent = ((product.value - prevSales) / prevSales) * 100;
        productGrowth.push({ 
          name: product.name, 
          growth: growthPercent, 
          currentSales: product.value,
          prevSales: prevSales 
        });
      }
    });
  }
  
  productGrowth.sort((a, b) => b.growth - a.growth);
  
  // Top 3 Product Groups by Sales Value, showing their Growth %
  const top3ProductsBySales = productSales.slice(0, 3);
  
  // For each top product by sales, find their growth % and sales percentage
  const top3ProductsWithGrowth = top3ProductsBySales.map(product => {
    const growthData = productGrowth.find(g => g.name === product.name);
    const growthPercent = growthData ? growthData.growth : 0;
    const salesPercent = totalProductSales > 0 ? (product.value / totalProductSales * 100) : 0;
    
    
    return {
      name: product.name,
      sales: product.value,
      salesPercent: salesPercent,
      growth: growthPercent
    };
  });
  
  // Keep sales ranking order - DO NOT sort by growth
  // top3ProductsWithGrowth is already in correct order (by sales %)
  
  // Render as 3 separate lines with bigger emojis
  const topProductGroupDisplay = (
    <div>
      {top3ProductsWithGrowth.map((p, index) => {
        const isPositive = p.growth > 0;
        const arrow = isPositive ? '▲' : '▼';
        const rankIcon = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
        return (
          <div key={index} className={`revenue-driver-product-item ${index < 2 ? 'with-border' : ''}`}>
            <span className="revenue-driver-rank">{rankIcon}</span>
            <div className="revenue-driver-product-content">
              <div className="revenue-driver-product-name">{p.name}</div>
              <div className="revenue-driver-product-metrics">
                <span>{p.salesPercent.toFixed(1)}% of sales</span>
                <span className={isPositive ? 'arrow-positive' : 'arrow-negative'}>
                  {deltaLabel}: {arrow} {Math.abs(p.growth).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
  
  const totalKgs = productKgs.reduce((sum, p) => sum + p.value, 0);
  const totalMoRM = productMoRM.reduce((sum, p) => sum + p.value, 0);
  const totalSalesForAvg = productSales.reduce((sum, p) => sum + p.value, 0);
  const avgSellingPrice = totalKgs > 0 ? totalSalesForAvg / totalKgs : 0;
  const avgMoRM = totalKgs > 0 ? totalMoRM / totalKgs : 0;
  
  
  // Calculate previous period values for growth
  // API fetches year-over-year comparison data, so we don't need to check columnOrder
  const getPreviousPeriodData = (dataType) => {
    // Use API data if available - it already includes previous year data
    if (productPerformanceData && !loadingProductData) {
      const products = productPerformanceData.products || [];
      return products.reduce((total, product) => {
        if (dataType === 'kgs') return total + (product.kgs_prev || 0);
        if (dataType === 'sales') return total + (product.sales_prev || 0);
        if (dataType === 'morm') return total + (product.morm_prev || 0);
        return total;
      }, 0);
    }
    
    return 0;
  };
  
  const totalKgsPrev = getPreviousPeriodData('kgs');
  const totalSalesPrev = getPreviousPeriodData('sales');
  const totalMoRMPrev = getPreviousPeriodData('morm');
  const avgSellingPricePrev = totalKgsPrev > 0 ? totalSalesPrev / totalKgsPrev : 0;
  const avgMoRMPrev = totalKgsPrev > 0 ? totalMoRMPrev / totalKgsPrev : 0;
  
  // Calculate Process and Material category breakdowns
  const getProcessCategories = () => {
    // Use API data only for FP division
    if (productPerformanceData && !loadingProductData) {
      return productPerformanceData.processCategories || {};
    }
    
    // No Excel fallback for FP division - database only
    return {};
  };
  
  const getMaterialCategories = () => {
    // Use API data only for FP division
    if (productPerformanceData && !loadingProductData) {
      return productPerformanceData.materialCategories || {};
    }
    
    // No Excel fallback for FP division - database only
    return {};
  };
  
  const processCategories = getProcessCategories();
  const materialCategories = getMaterialCategories();
  
  
  const formatKgs = (kgs) => {
    const mt = kgs / 1000; // Convert kg to metric tons
    if (mt >= 1000000) return (mt / 1000000).toFixed(1) + 'M MT';
    if (mt >= 1000) return (mt / 1000).toFixed(1) + 'K MT';
    if (mt >= 1) return mt.toFixed(0) + ' MT';
    return kgs.toLocaleString() + ' kg'; // For very small values, keep kg
  };
  
  
  // Geographic Distribution - Use API data for FP, Excel for others
  let regionalPercentages = {};
  let localSales = 0;
  let exportSales = 0;
  let exportRegionsWithRelativePercentage = [];
  let smallRegions = []; // Store small regions for Others category tooltip

   if (geographicData && !loadingGeographicData) {
     // Use API data
     const countrySales = geographicData.countrySales || [];
     const regionalSales = geographicData.regionalSales || {};
     const totalCountrySales = geographicData.totalSales || 0;
    regionalPercentages = geographicData.regionalPercentages || {};
    localSales = geographicData.localPercentage || 0;
    exportSales = geographicData.exportPercentage || 0;
    
    // Get regions with meaningful percentages (excluding UAE and < 0.1%)
    const significantRegions = Object.entries(regionalPercentages)
      .filter(([region, percentage]) => region !== 'UAE' && percentage >= 0.1)
      .sort((a, b) => b[1] - a[1]);
    
    // Get small regions (< 0.1%) and group them into "Others"
    smallRegions = Object.entries(regionalPercentages)
      .filter(([region, percentage]) => region !== 'UAE' && percentage > 0 && percentage < 0.1);
    
    const othersPercentage = smallRegions.reduce((sum, [, percentage]) => sum + percentage, 0);
    
    // Create export regions array with Others category if needed
    const exportRegions = [...significantRegions];
    if (othersPercentage > 0) {
      exportRegions.push(['Others', othersPercentage]);
    }

    // Calculate percentages relative to export total
    exportRegionsWithRelativePercentage = exportRegions.map(([region, percentage]) => {
      const relativePercentage = exportSales > 0 ? (percentage / exportSales) * 100 : 0;
      return [region, percentage, relativePercentage];
    });
  } else {
    // No data available - either loading or error
    // FP division should only use database APIs, no Excel fallback
  }
  
  // Customer Insights
  let avgSalesPerCustomer = 0;
  let customerSales = [];
  
  if (customerInsightsData && !loadingCustomerInsights) {
    // Use API data with merge rules applied
    avgSalesPerCustomer = customerInsightsData.avgSalesPerCustomer;
    customerSales = customerInsightsData.customers || [];
    
  } else {
    // No data available - either loading or error
    // FP division should only use database APIs, no Excel fallback
  }

  // Render - Updated formatting v2.0 
  return (
    <div className="kpi-dashboard" key="kpi-dashboard-v2">
      {showTitle ? (
        <h2>
          Executive Summary – {getDivisionDisplayName(selectedDivision.replace(/-.*$/, ''))}
        </h2>
      ) : null}
      {showPeriodHeader ? (
        <div className="kpi-period-header">
          <span>{basePeriodName}</span>
          {comparisonPeriodName ? (
            <>
              <span className="kpi-period-vs">Vs</span>
              <span>{comparisonPeriodName}</span>
            </>
          ) : null}
        </div>
      ) : null}
      {/* Financial Performance */}
      <div className="kpi-section financial-performance-section">
        <ErrorBoundary>
          <FinancialPerformance 
            sales={sales}
            salesPrev={salesPrev}
            grossProfit={grossProfit}
            grossProfitPrev={grossProfitPrev}
            netProfit={netProfit}
            netProfitPrev={netProfitPrev}
            ebitda={ebitda}
            ebitdaPrev={ebitdaPrev}
          />
        </ErrorBoundary>
      </div>
      {/* Product Performance */}
      <div className="kpi-section product-performance-section">
        <h3 className="kpi-section-title">📦 Product Performance</h3>
        
        {/* Loading State */}
        {loadingProductData && (
          <div className="kpi-cards">
            <div className="kpi-card large full-width">
              <div className="kpi-icon">⏳</div>
              <div className="kpi-label">Loading Product Performance Data...</div>
              <div className="kpi-value">Please wait</div>
            </div>
          </div>
        )}
        
        {/* Error State */}
        {productPerformanceError && !loadingProductData && (
          <div className="kpi-cards">
            <div className="kpi-card large full-width">
              <div className="kpi-icon">⚠️</div>
              <div className="kpi-label">Product Performance Error</div>
              <div className="kpi-value">{productPerformanceError}</div>
              <div className="kpi-trend">Please try refreshing or check server logs</div>
            </div>
          </div>
        )}
        
        {/* Row 1: Top Revenue Drivers - Full Width */}
        <div className="kpi-cards">
          <div className="kpi-card revenue-drivers">
            <div className="kpi-icon">🏆</div>
            <div className="kpi-label">Top Revenue Drivers</div>
            <div className="kpi-value">{topProductGroupDisplay}</div>
          </div>
        </div>
        
        {/* Row 2: Total Sales Volume + Selling Price + MoRM — always single row */}
        <div className="kpi-cards kpi-metrics-row">
          <div className="kpi-card"><div className="kpi-icon">📊</div><div className="kpi-label">Total Sales Volume</div><div className="kpi-value">{formatKgs(totalKgs)}</div><div className="kpi-trend">{growth(totalKgs, totalKgsPrev)}</div></div>
          <div className="kpi-card"><div className="kpi-icon">⚡</div><div className="kpi-label">Selling Price</div><div className="kpi-value">{formatAEDPerKg(avgSellingPrice)}</div><div className="kpi-trend">{growth(avgSellingPrice, avgSellingPricePrev)}</div></div>
          <div className="kpi-card"><div className="kpi-icon">🎯</div><div className="kpi-label">MoRM</div><div className="kpi-value">{formatAEDPerKg(avgMoRM)}</div><div className="kpi-trend">{growth(avgMoRM, avgMoRMPrev)}</div></div>
        </div>
        
        {/* Row 3: Process Categories - Modern Creative Design */}
        {/* SVG Gradient Definitions */}
        <svg className="svg-gradients" style={{ position: 'absolute', width: 0, height: 0 }}>
          <defs>
            <linearGradient id="gradient-printed" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#667eea" />
              <stop offset="100%" stopColor="#764ba2" />
            </linearGradient>
            <linearGradient id="gradient-unprinted" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f093fb" />
              <stop offset="100%" stopColor="#f5576c" />
            </linearGradient>
            <linearGradient id="gradient-pe" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4facfe" />
              <stop offset="100%" stopColor="#00f2fe" />
            </linearGradient>
            <linearGradient id="gradient-nonpe" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#43e97b" />
              <stop offset="100%" stopColor="#38f9d7" />
            </linearGradient>
          </defs>
        </svg>
        
        {/* Process Categories Section Header */}
        <div className="category-section-header">
          <span className="section-icon">🖨️</span>
          <span className="section-title">Process Categories</span>
        </div>
        
        <div className="kpi-cards category-cards process-row">
          {Object.entries(processCategories)
            .filter(([categoryName, data]) => categoryName.toUpperCase() !== 'OTHERS')
            .map(([categoryName, data], index) => {
            const sellingPrice = data.kgs > 0 ? data.sales / data.kgs : 0;
            const morm = data.kgs > 0 ? data.morm / data.kgs : 0;
            
            // Calculate % of Sales
            const totalSales = Object.values(processCategories).reduce((sum, cat) => sum + cat.sales, 0);
            const salesPercentage = totalSales > 0 ? (data.sales / totalSales * 100) : 0;
            
            // Calculate Growth % using comparison period data from API
            // The API already fetches _prev data based on the user's selected comparison period
            let salesGrowth = 0;
            let priceGrowth = 0;
            let mormGrowth = 0;
            
            if (productPerformanceData) {
              // Use API data for growth calculations (already includes comparison period data)
              let prevSales = 0;
              let prevKgs = 0;
              let prevMorm = 0;
              
              // Aggregate comparison period data from API for this category
              productPerformanceData.products.forEach(product => {
                if (categoryName === product.process) {
                  prevSales += product.sales_prev || 0;
                  prevKgs += product.kgs_prev || 0;
                  prevMorm += product.morm_prev || 0;
                }
              });
              
              // Smart growth calculation based on column types
              const baseType = basePeriod?.type;
              const compType = comparisonPeriod?.type;
              
              // For non-YoY comparisons (Actual vs Budget), use: (Actual - Reference) / Reference
              const isYoY = baseType === 'Actual' && compType === 'Actual';
              
              if (prevSales > 0) {
                if (isYoY) {
                  salesGrowth = ((data.sales - prevSales) / Math.abs(prevSales)) * 100;
                } else {
                  // For Actual vs Budget: (Actual - Budget) / |Budget|
                  salesGrowth = ((data.sales - prevSales) / Math.abs(prevSales)) * 100;
                }
              }
              if (prevKgs > 0) {
                const prevSellingPrice = prevSales / prevKgs;
                const currentSellingPrice = data.kgs > 0 ? data.sales / data.kgs : 0;
                priceGrowth = prevSellingPrice > 0 ? ((currentSellingPrice - prevSellingPrice) / Math.abs(prevSellingPrice)) * 100 : 0;
              }
              if (prevKgs > 0) {
                const prevMormPerKg = prevMorm / prevKgs;
                const currentMormPerKg = data.kgs > 0 ? data.morm / data.kgs : 0;
                mormGrowth = prevMormPerKg > 0 ? ((currentMormPerKg - prevMormPerKg) / Math.abs(prevMormPerKg)) * 100 : 0;
              }
              
              // Round to 1 decimal place
              salesGrowth = Math.round(salesGrowth * 10) / 10;
              priceGrowth = Math.round(priceGrowth * 10) / 10;
              mormGrowth = Math.round(mormGrowth * 10) / 10;
              
            }
            
            // Progress ring calculations
            const radius = 52;
            const circumference = 2 * Math.PI * radius;
            const strokeDashoffset = circumference - (salesPercentage / 100) * circumference;
            const categoryClass = categoryName.toLowerCase().replace(/\s+/g, '-');
            const gradientId = categoryName.toUpperCase() === 'PRINTED' ? 'gradient-printed' : 'gradient-unprinted';
            const icon = categoryName.toUpperCase() === 'PRINTED' ? '🖨️' : '📄';
            
            return (
              <div key={`process-${categoryName}`} className={`category-card-modern process-${categoryClass}`}>
                <div className="category-card-header">
                  <div className="category-card-header-content">
                    <h3 className="category-card-title">{categoryName}</h3>
                    <div className="category-card-icon">{icon}</div>
                  </div>
                </div>
                <div className="category-card-body">
                  <div className="progress-ring-container">
                    <svg className="progress-ring" width="130" height="130" viewBox="0 0 130 130">
                      <circle className="progress-ring-bg" cx="65" cy="65" r={radius} />
                      <circle 
                        className="progress-ring-fill" 
                        cx="65" 
                        cy="65" 
                        r={radius}
                        style={{ 
                          strokeDasharray: circumference,
                          strokeDashoffset: strokeDashoffset,
                          stroke: `url(#${gradientId})`
                        }}
                      />
                    </svg>
                    <div className="progress-ring-text">
                      <span className="progress-ring-percentage">{salesPercentage.toFixed(0)}%</span>
                      <span className="progress-ring-label">of Sales</span>
                    </div>
                  </div>
                  <div className="category-metrics-grid">
                    <div className="category-metric-item">
                      <div className="metric-left">
                        <span className="metric-label">Selling Price</span>
                        <span className="metric-value">{formatAEDPerKg(sellingPrice)}</span>
                      </div>
                      <div className={`metric-change ${priceGrowth >= 0 ? 'positive' : 'negative'}`}>
                        <span className="metric-change-icon">{priceGrowth >= 0 ? '↑' : '↓'}</span>
                        {Math.abs(priceGrowth).toFixed(1)}%
                      </div>
                    </div>
                    <div className="category-metric-item">
                      <div className="metric-left">
                        <span className="metric-label">AVG MoRM</span>
                        <span className="metric-value">{formatAEDPerKg(morm)}</span>
                      </div>
                      <div className={`metric-change ${mormGrowth >= 0 ? 'positive' : 'negative'}`}>
                        <span className="metric-change-icon">{mormGrowth >= 0 ? '↑' : '↓'}</span>
                        {Math.abs(mormGrowth).toFixed(1)}%
                      </div>
                    </div>
                    <div className="category-metric-item">
                      <div className="metric-left">
                        <span className="metric-label">{deltaLabel}</span>
                        <span className="metric-value" style={{ fontSize: '0.95rem' }}>Sales Growth</span>
                      </div>
                      <div className={`metric-change ${salesGrowth >= 0 ? 'positive' : 'negative'}`}>
                        <span className="metric-change-icon">{salesGrowth >= 0 ? '↑' : '↓'}</span>
                        {Math.abs(salesGrowth).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Row 4: Material Categories - Modern Creative Design */}
        {/* Material Categories Section Header */}
        <div className="category-section-header material">
          <span className="section-icon">🧪</span>
          <span className="section-title">Material Categories</span>
        </div>
        
        <div className="kpi-cards category-cards material-row">
          {Object.entries(materialCategories)
            .filter(([categoryName, data]) => categoryName.toUpperCase() !== 'OTHERS')
            .map(([categoryName, data], index) => {
            const sellingPrice = data.kgs > 0 ? data.sales / data.kgs : 0;
            const morm = data.kgs > 0 ? data.morm / data.kgs : 0;
            
            // Calculate % of Sales
            const totalSales = Object.values(materialCategories).reduce((sum, cat) => sum + cat.sales, 0);
            const salesPercentage = totalSales > 0 ? (data.sales / totalSales * 100) : 0;
            
            // Calculate Growth % using comparison period data from API
            // The API already fetches _prev data based on the user's selected comparison period
            let salesGrowth = 0;
            let priceGrowth = 0;
            let mormGrowth = 0;
            
            if (productPerformanceData) {
              // Use API data for growth calculations (already includes comparison period data)
              let prevSales = 0;
              let prevKgs = 0;
              let prevMorm = 0;
              
              // Aggregate comparison period data from API for this category
              productPerformanceData.products.forEach(product => {
                if (categoryName === product.material) {
                  prevSales += product.sales_prev || 0;
                  prevKgs += product.kgs_prev || 0;
                  prevMorm += product.morm_prev || 0;
                }
              });
              
              // Smart growth calculation based on column types
              const baseType = basePeriod?.type;
              const compType = comparisonPeriod?.type;
              
              // For non-YoY comparisons (Actual vs Budget), use: (Actual - Reference) / Reference
              const isYoY = baseType === 'Actual' && compType === 'Actual';
              
              if (prevSales > 0) {
                if (isYoY) {
                  salesGrowth = ((data.sales - prevSales) / Math.abs(prevSales)) * 100;
                } else {
                  // For Actual vs Budget: (Actual - Budget) / |Budget|
                  salesGrowth = ((data.sales - prevSales) / Math.abs(prevSales)) * 100;
                }
              }
              if (prevKgs > 0) {
                const prevSellingPrice = prevSales / prevKgs;
                const currentSellingPrice = data.kgs > 0 ? data.sales / data.kgs : 0;
                priceGrowth = prevSellingPrice > 0 ? ((currentSellingPrice - prevSellingPrice) / Math.abs(prevSellingPrice)) * 100 : 0;
              }
              if (prevKgs > 0) {
                const prevMormPerKg = prevMorm / prevKgs;
                const currentMormPerKg = data.kgs > 0 ? data.morm / data.kgs : 0;
                mormGrowth = prevMormPerKg > 0 ? ((currentMormPerKg - prevMormPerKg) / Math.abs(prevMormPerKg)) * 100 : 0;
              }
              
              // Round to 1 decimal place
              salesGrowth = Math.round(salesGrowth * 10) / 10;
              priceGrowth = Math.round(priceGrowth * 10) / 10;
              mormGrowth = Math.round(mormGrowth * 10) / 10;
              
            }
            
            // Progress ring calculations
            const radius = 52;
            const circumference = 2 * Math.PI * radius;
            const strokeDashoffset = circumference - (salesPercentage / 100) * circumference;
            const categoryClass = categoryName.toLowerCase().replace(/\s+/g, '');
            const isPE = categoryName.toUpperCase() === 'PE';
            const gradientId = isPE ? 'gradient-pe' : 'gradient-nonpe';
            const icon = isPE ? '🧪' : '♻️';
            
            return (
              <div key={`material-${categoryName}`} className={`category-card-modern material-${categoryClass}`}>
                <div className="category-card-header">
                  <div className="category-card-header-content">
                    <h3 className="category-card-title">{categoryName}</h3>
                    <div className="category-card-icon">{icon}</div>
                  </div>
                </div>
                <div className="category-card-body">
                  <div className="progress-ring-container">
                    <svg className="progress-ring" width="130" height="130" viewBox="0 0 130 130">
                      <circle className="progress-ring-bg" cx="65" cy="65" r={radius} />
                      <circle 
                        className="progress-ring-fill" 
                        cx="65" 
                        cy="65" 
                        r={radius}
                        style={{ 
                          strokeDasharray: circumference,
                          strokeDashoffset: strokeDashoffset,
                          stroke: `url(#${gradientId})`
                        }}
                      />
                    </svg>
                    <div className="progress-ring-text">
                      <span className="progress-ring-percentage">{salesPercentage.toFixed(0)}%</span>
                      <span className="progress-ring-label">of Sales</span>
                    </div>
                  </div>
                  <div className="category-metrics-grid">
                    <div className="category-metric-item">
                      <div className="metric-left">
                        <span className="metric-label">Selling Price</span>
                        <span className="metric-value">{formatAEDPerKg(sellingPrice)}</span>
                      </div>
                      <div className={`metric-change ${priceGrowth >= 0 ? 'positive' : 'negative'}`}>
                        <span className="metric-change-icon">{priceGrowth >= 0 ? '↑' : '↓'}</span>
                        {Math.abs(priceGrowth).toFixed(1)}%
                      </div>
                    </div>
                    <div className="category-metric-item">
                      <div className="metric-left">
                        <span className="metric-label">AVG MoRM</span>
                        <span className="metric-value">{formatAEDPerKg(morm)}</span>
                      </div>
                      <div className={`metric-change ${mormGrowth >= 0 ? 'positive' : 'negative'}`}>
                        <span className="metric-change-icon">{mormGrowth >= 0 ? '↑' : '↓'}</span>
                        {Math.abs(mormGrowth).toFixed(1)}%
                      </div>
                    </div>
                    <div className="category-metric-item">
                      <div className="metric-left">
                        <span className="metric-label">{deltaLabel}</span>
                        <span className="metric-value" style={{ fontSize: '0.95rem' }}>Sales Growth</span>
                      </div>
                      <div className={`metric-change ${salesGrowth >= 0 ? 'positive' : 'negative'}`}>
                        <span className="metric-change-icon">{salesGrowth >= 0 ? '↑' : '↓'}</span>
                        {Math.abs(salesGrowth).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Geographic Distribution */}
      <div className="kpi-section geographic-distribution-section">
        <h3 className="kpi-section-title">🌍 Geographic Distribution</h3>
        
        {/* Loading State */}
        {loadingGeographicData && (
          <div className="kpi-cards">
            <div className="kpi-card large full-width">
              <div className="kpi-icon">⏳</div>
              <div className="kpi-label">Loading Geographic Data...</div>
              <div className="kpi-value">Please wait</div>
            </div>
          </div>
        )}
        
        {/* Error State */}
        {geographicDataError && !loadingGeographicData && (
          <div className="kpi-cards">
            <div className="kpi-card large full-width">
              <div className="kpi-icon">⚠️</div>
              <div className="kpi-label">Geographic Data Error</div>
              <div className="kpi-value">{geographicDataError}</div>
              <div className="kpi-trend">Please try refreshing or check server logs</div>
            </div>
          </div>
        )}
        
        {/* Data Display - Only show if we have valid data */}
        {geographicData && !loadingGeographicData && !geographicDataError && (
          <>
            {/* Row 1: Local vs Export - Always centered with 2 equal cards */}
            <div className="kpi-cards">
              <div className="kpi-card large">
                <div className="uae-icon-container">
                  {/* Embedded UAE Flag SVG */}
                  <svg className="uae-icon" viewBox="0 0 900 600" xmlns="http://www.w3.org/2000/svg">
                    <rect width="900" height="200" fill="#00732f"/>
                    <rect width="900" height="200" y="200" fill="#ffffff"/>
                    <rect width="900" height="200" y="400" fill="#000000"/>
                    <rect width="300" height="600" fill="#ff0000"/>
                  </svg>
                </div>
                <div className="kpi-label">UAE</div>
                <div className="kpi-value">{localSales.toFixed(1)}%</div>
                <div className="kpi-trend">of total sales</div>
                {typeof geographicData?.localGrowth === 'number' && (
                  <div className={`kpi-growth ${geographicData.localGrowth >= 0 ? 'positive' : 'negative'}`}>
                    <span className="kpi-growth-arrow">
                      {deltaLabel}: {geographicData.localGrowth >= 0 ? '↑' : '↓'} {Math.abs(geographicData.localGrowth).toFixed(1)}%
                    </span>
                    {typeof geographicData?.localAmountDelta === 'number' && (
                      <div className="kpi-growth-amount">
                        {geographicData.localAmountDelta >= 0 ? '+' : '−'} {formatAEDLarge(Math.abs(geographicData.localAmountDelta))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="kpi-card large">
                <div className="rotating-emoji-container">
                  <div className="rotating-emoji">🌍</div>
                </div>
                <div className="kpi-label">Export</div>
                <div className="kpi-value">{exportSales.toFixed(1)}%</div>
                <div className="kpi-trend">of total sales</div>
                {typeof geographicData?.exportGrowth === 'number' && (
                  <div className={`kpi-growth ${geographicData.exportGrowth >= 0 ? 'positive' : 'negative'}`}>
                    <span className="kpi-growth-arrow">
                      {deltaLabel}: {geographicData.exportGrowth >= 0 ? '↑' : '↓'} {Math.abs(geographicData.exportGrowth).toFixed(1)}%
                    </span>
                    {typeof geographicData?.exportAmountDelta === 'number' && (
                      <div className="kpi-growth-amount">
                        {geographicData.exportAmountDelta >= 0 ? '+' : '−'} {formatAEDLarge(Math.abs(geographicData.exportAmountDelta))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
        
        {/* Visual connector from Export card to regional cards */}
        {exportRegionsWithRelativePercentage.length > 0 && (
          <div className="export-connector">
            <div className="export-connector__arrow" />
            <div className="export-connector__bracket" />
          </div>
        )}
        {exportRegionsWithRelativePercentage.length > 0 && (
          <div className="kpi-cards export-regions">
            {exportRegionsWithRelativePercentage.map(([regionName, absolutePercentage, relativePercentage], index) => {
              // Use different globe emojis for different regions
              const regionGlobes = {
                'Arabian Peninsula': '🌍', // Africa/Europe view (Middle East visible)
                'West Asia': '🌍', // Africa/Europe view (Middle East visible)
                'Southern Africa': '🌍', // Africa/Europe view
                'Levant': '🌍', // Africa/Europe view (Middle East visible)
                'North Africa': '🌍', // Africa/Europe view
                'Europe': '🌍', // Africa/Europe view
                'Americas': '🌎', // Americas view
                'Asia-Pacific': '🌏', // Asia/Australia view
                'Unassigned': '🌐', // Generic globe
                'Others': '🌐' // Generic globe for small regions
              };

              // Calculate gradient color based on percentage - ENHANCED VERSION
              const getGradientColor = (percentage) => {
                // Use distinct colors for different percentage ranges
                if (percentage >= 20) {
                  return '#1e40af'; // Deep blue for high percentages (20%+)
                } else if (percentage >= 15) {
                  return '#3b82f6'; // Medium blue (15-20%)
                } else if (percentage >= 10) {
                  return '#60a5fa'; // Light blue (10-15%)
                } else if (percentage >= 5) {
                  return '#93c5fd'; // Lighter blue (5-10%)
                } else {
                  return '#dbeafe'; // Very light blue (0-5%)
                }
              };

              const gradientColor = getGradientColor(absolutePercentage);
              
              return (
                <div 
                  key={regionName} 
                  className={`kpi-card geo-card ${absolutePercentage >= 10 ? 'geo-card--dark' : 'geo-card--light'}`}
                  style={{
                    background: `linear-gradient(135deg, ${gradientColor}, ${gradientColor}cc)`,
                    borderLeft: `4px solid ${gradientColor}`,
                    boxShadow: `0 4px 12px ${gradientColor}44`,
                  }}
                >
                  <div className="region-globe-container">
                    <div className="region-globe">{regionGlobes[regionName] || '🌐'}</div>
                  </div>
                  <div className="kpi-label" style={{ 
                    fontWeight: '700' 
                  }}>{regionName}</div>
                  <div className="kpi-value" style={{ 
                    fontWeight: '800' 
                  }}>{absolutePercentage.toFixed(1)}%</div>
                  <div className="kpi-trend">{relativePercentage.toFixed(1)}% of export</div>
                  {geographicData?.regionalGrowth && geographicData.regionalGrowth[regionName] !== undefined && regionName !== 'Others' && (
                    <div className="kpi-growth" style={{ 
                      color: geographicData.regionalGrowth[regionName] >= 0 ? 'var(--color-success, #10b981)' : 'var(--color-error, #ef4444)',
                      fontSize: '14px',
                      fontWeight: '700',
                      marginTop: '2px'
                    }}>
                      <span style={{ fontWeight: '900' }}>
                        {deltaLabel}: {geographicData.regionalGrowth[regionName] >= 0 ? '↑' : '↓'} {Math.abs(geographicData.regionalGrowth[regionName]).toFixed(1)}%
                      </span>
                    </div>
                  )}
                  {regionName === 'Others' && smallRegions.length > 0 && (
                    <div className={`kpi-tooltip ${absolutePercentage >= 10 ? 'light' : 'dark'}`}>
                      Includes: {smallRegions.map(([name]) => name).join(', ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
          </>
        )}
      </div>
       {/* Customer Insights */}
       <div className="kpi-section customer-insights-section">
         <h3 className="kpi-section-title">👥 Customer Insights</h3>
         
         {/* Loading State */}
         {loadingCustomerInsights && (
           <div className="kpi-cards">
             <div className="kpi-card large full-width">
               <div className="kpi-icon">⏳</div>
               <div className="kpi-label">Loading Customer Insights Data...</div>
               <div className="kpi-value">Please wait</div>
             </div>
           </div>
         )}
         
         {/* Error State */}
         {customerInsightsError && !loadingCustomerInsights && (
           <div className="kpi-cards">
             <div className="kpi-card large full-width">
               <div className="kpi-icon">⚠️</div>
               <div className="kpi-label">Customer Insights Error</div>
               <div className="kpi-value">{customerInsightsError}</div>
               <div className="kpi-trend">Please try refreshing or check server logs</div>
             </div>
           </div>
         )}
         
         {/* Data Display - Only show if we have valid data */}
         {customerInsightsData && !loadingCustomerInsights && !customerInsightsError && (
           <ErrorBoundary>
             <CustomerInsights 
               customerSales={customerSales} 
               avgSalesPerCustomer={avgSalesPerCustomer}
               avgSalesPerCustomerPrev={customerInsightsData.avgSalesPerCustomerPrev}
               deltaLabel={deltaLabel}
             />
           </ErrorBoundary>
         )}
       </div>
    </div>
  );
};

export default KPIExecutiveSummary;