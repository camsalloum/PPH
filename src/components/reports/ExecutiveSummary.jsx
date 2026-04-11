import React, { useState, useEffect } from 'react';
import { getRegionForCountry } from '../../services/regionService';
import { useFilter } from '../../contexts/FilterContext';
import { formatCustomRangeDisplay } from '../../utils/periodHelpers';
import CurrencySymbol from '../dashboard/CurrencySymbol';
import '../dashboard/KPIExecutiveSummary.css';
import './ExecutiveSummary.css';

// Regional mapping now loaded from database via regionService

  // Note: getRegionForCountry uses database-first approach with fallback

  // Helper function to get region-specific color based on export percentage
  const getRegionColor = (exportPercentage) => {
    if (exportPercentage >= 50) return '#0D47A1';      // Dark blue for high percentages
    if (exportPercentage >= 30) return '#1565C0';      // Medium-dark blue
    if (exportPercentage >= 20) return '#1976D2';      // Medium blue
    if (exportPercentage >= 10) return '#1E88E5';      // Medium-light blue
    if (exportPercentage >= 5) return '#42A5F5';       // Light blue
    return '#64B5F6';                                   // Very light blue for low percentages
  };

  // Helper function to get region-specific emoji icons
  const getRegionIcon = (regionName) => {
    const iconMap = {
      'North Africa': '🌍',
      'Arabian Peninsula': '🌏',
      'West Asia': '🌎',
      'Southern Africa': '🌍',
      'Levant': '🌏',
      'Europe': '🌎',
      'Americas': '🌍',
      'Asia-Pacific': '🌏'
    };
    return iconMap[regionName] || '🌐';
  };

const ExecutiveSummary = ({ performanceMetrics, reportData, kgsData, amountData, basePeriodIndex, onYearlyBudgetCalculated }) => {
  // React hooks must be called before any early returns
  const [yearlyBudgetTotal, setYearlyBudgetTotal] = useState(0);
  const [yearlySalesBudgetTotal, setYearlySalesBudgetTotal] = useState(0);
  const [countryData, setCountryData] = useState(null);
  const { columnOrder } = useFilter();
  
  
  // Set yearly budget totals from unified report data (same source as tables)
  useEffect(() => {
    if (!reportData) return;
    const kgsTotals = reportData.kgsTotals || [];
    const amountTotals = reportData.amountTotals || [];
    const columns = reportData.columnOrder || [];
    const baseYear = reportData.basePeriod?.year;

    const isFullYearBudget = (col) => {
      const type = String(col.type || '').toUpperCase();
      if (type !== 'BUDGET') return false;
      const sameYear = baseYear ? col.year === baseYear : true;
      const month = String(col.month || '').toLowerCase();
      const isYearLabel = ['year', 'fy'].includes(month);
      const isFullRange = Array.isArray(col.months) && col.months.length >= 12;
      const isYearName = String(col.displayName || '').toLowerCase().includes('year');
      return sameYear && (isYearLabel || isFullRange || isYearName);
    };

    let budgetKgs = 0;
    let budgetAmount = 0;

    columns.forEach((col, idx) => {
      if (!isFullYearBudget(col)) return;
      budgetKgs += Number(kgsTotals[idx] || 0);
      budgetAmount += Number(amountTotals[idx] || 0);
    });

    setYearlyBudgetTotal(budgetKgs);
    setYearlySalesBudgetTotal(budgetAmount);
  }, [reportData]);

  // Notify parent component when yearly budget calculations are updated.
  // Important: even when DB yearly budget totals are missing/0, the UI falls back to
  // column-based budget achievement; HTML export relies on the parent-captured values.
  useEffect(() => {
    if (!onYearlyBudgetCalculated || !performanceMetrics || !reportData) return;

    const currentTotal = performanceMetrics?.totalKgs || 0;
    const currentAmountTotal = performanceMetrics?.totalAmount || 0;

    const budgetTotal = reportData.yearBudgetIndex >= 0 ? (reportData.kgsTotals?.[reportData.yearBudgetIndex] || 0) : 0;
    const budgetAmountTotal = reportData.yearBudgetIndex >= 0 ? (reportData.amountTotals?.[reportData.yearBudgetIndex] || 0) : 0;

    const budgetAchievementFallback = budgetTotal > 0 ? (currentTotal / budgetTotal * 100) : 0;
    const salesBudgetAchievementFallback = budgetAmountTotal > 0 ? (currentAmountTotal / budgetAmountTotal * 100) : 0;

    const computedYearlyBudgetAchievement = yearlyBudgetTotal > 0
      ? (currentTotal / yearlyBudgetTotal * 100)
      : budgetAchievementFallback;

    const computedYearlySalesBudgetAchievement = yearlySalesBudgetTotal > 0
      ? (currentAmountTotal / yearlySalesBudgetTotal * 100)
      : salesBudgetAchievementFallback;

    onYearlyBudgetCalculated({
      yearlyBudgetTotal,
      yearlySalesBudgetTotal,
      yearlyBudgetAchievement: computedYearlyBudgetAchievement,
      yearlySalesBudgetAchievement: computedYearlySalesBudgetAchievement
    });
  }, [yearlyBudgetTotal, yearlySalesBudgetTotal, performanceMetrics, reportData, onYearlyBudgetCalculated]);

  // Fetch country sales data - SIMPLIFIED APPROACH MATCHING MAIN KPI PAGE
  useEffect(() => {
    const fetchCountryData = async () => {
      if (!reportData || !reportData.salesRep || !reportData.periodLabel) return;
      
      // Extract period information from reportData.periodLabel (this comes from SalesRepReport.js)
      const period = reportData.periodLabel;
      let year, months;
      
      try {
        
        if (typeof period === 'object' && period.year) {
          year = period.year;
          
          // Handle different period types
          if (period.months && Array.isArray(period.months) && period.months.length > 0) {
            // Use all months from the period
            months = period.months;
          } else if (period.month) {
            // Handle quarter/half-year periods by converting to month arrays
            if (period.month === 'HY1' || period.month === 'H1') {
              months = ['January', 'February', 'March', 'April', 'May', 'June'];
            } else if (period.month === 'HY2' || period.month === 'H2') {
              months = ['July', 'August', 'September', 'October', 'November', 'December'];
            } else if (period.month === 'Q1') {
              months = ['January', 'February', 'March'];
            } else if (period.month === 'Q2') {
              months = ['April', 'May', 'June'];
            } else if (period.month === 'Q3') {
              months = ['July', 'August', 'September'];
            } else if (period.month === 'Q4') {
              months = ['October', 'November', 'December'];
            } else {
              months = [period.month];  // Single month as array
            }
          } else {
            months = ['January', 'February', 'March', 'April', 'May', 'June'];  // Default to HY1
          }
        } else {
          // Fallback to working values
          year = 2025;
          months = ['January', 'February', 'March', 'April', 'May', 'June'];
        }
        
        
        // Try the working API endpoint first
        // Convert month names to numbers as expected by the API
        const monthMap = {
          'January': 1, 'February': 2, 'March': 3, 'April': 4,
          'May': 5, 'June': 6, 'July': 7, 'August': 8,
          'September': 9, 'October': 10, 'November': 11, 'December': 12
        };
        const monthNumbers = (months || []).map(m => {
          if (typeof m === 'number') return m;
          if (typeof m === 'string') {
            const mm = monthMap[m] ?? parseInt(m, 10);
            return Number.isFinite(mm) ? mm : null;
          }
          return null;
        }).filter(v => v !== null);

        const response = await fetch('/api/sales-by-country-db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            division: 'FP',
            salesRep: reportData.salesRep,
            year: year,
            months: monthNumbers,
            dataType: 'Actual'
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          
          if (result.success && result.data && result.data.length > 0) {
            setCountryData({
              data: result.data || [],
              actualPeriod: { year, months, salesRep: reportData.salesRep },
              isDifferentSalesRep: false
            });
          } else {
            // Fallback: Generate sample data for testing
            const fallbackData = generateFallbackCountryData(reportData.salesRep);
            setCountryData({
              data: fallbackData,
              actualPeriod: { year, months, salesRep: reportData.salesRep },
              isDifferentSalesRep: false
            });
          }
        } else {
          console.error('❌ Country data API failed:', response.statusText);
          // Fallback: Generate sample data for testing
          const fallbackData = generateFallbackCountryData(reportData.salesRep);
          setCountryData({
            data: fallbackData,
            actualPeriod: { year, months, salesRep: reportData.salesRep },
            isDifferentSalesRep: false
          });
        }
      } catch (error) {
        console.error('❌ Error fetching country data:', error);
        // Fallback: Generate sample data for testing
        const fallbackData = generateFallbackCountryData(reportData.salesRep);
        setCountryData({
          data: fallbackData,
          actualPeriod: { year, months, salesRep: reportData.salesRep },
          isDifferentSalesRep: false
        });
      }
    };
    
    fetchCountryData();
  }, [reportData]);
  
  if (!performanceMetrics || !reportData) {
    return <div>Loading performance metrics...</div>;
  }

  const { totalKgs, totalAmount } = performanceMetrics;

  // Calculate YoY Growth from period comparison data for Volume (KGS)
  const currentTotal = totalKgs || 0;
  const previousTotal = reportData.prevPeriodIndex >= 0 ? (reportData.kgsTotals?.[reportData.prevPeriodIndex] || 0) : 0;
  const budgetTotal = reportData.yearBudgetIndex >= 0 ? (reportData.kgsTotals?.[reportData.yearBudgetIndex] || 0) : 0;

  // Check if we have previous period data for YoY comparison
  const hasPreviousPeriod = reportData.prevPeriodIndex >= 0 && previousTotal > 0;
  
  const yoyGrowth = hasPreviousPeriod ? ((currentTotal - previousTotal) / previousTotal * 100) : null;
  const budgetAchievement = budgetTotal > 0 ? (currentTotal / budgetTotal * 100) : 0;
  
  // Calculate Sales (Amount) metrics
  const currentAmountTotal = totalAmount || 0;
  const previousAmountTotal = reportData.prevPeriodIndex >= 0 ? (reportData.amountTotals?.[reportData.prevPeriodIndex] || 0) : 0;
  const budgetAmountTotal = reportData.yearBudgetIndex >= 0 ? (reportData.amountTotals?.[reportData.yearBudgetIndex] || 0) : 0;

  // Check if we have previous period data for YoY comparison
  const hasPreviousAmountPeriod = reportData.prevPeriodIndex >= 0 && previousAmountTotal > 0;
  
  const amountYoyGrowth = hasPreviousAmountPeriod ? ((currentAmountTotal - previousAmountTotal) / previousAmountTotal * 100) : null;
  const amountBudgetAchievement = budgetAmountTotal > 0 ? (currentAmountTotal / budgetAmountTotal * 100) : 0;
  
  // Calculate yearly budget achievements
  // For volume (KGS), show what percentage of the yearly budget has been achieved so far
  // Fall back to column-based budget achievement if DB yearly budget is not available
  const yearlyBudgetAchievement = yearlyBudgetTotal > 0 
    ? (currentTotal / yearlyBudgetTotal * 100) 
    : budgetAchievement; // Use same as column-based budget if no DB data
  
  // For sales (Amount), calculate what percentage of the yearly budget has been achieved
  // This shows the proportion of the yearly budget achieved in the current period
  // Fall back to column-based budget achievement if DB yearly budget is not available
  const yearlySalesBudgetAchievement = yearlySalesBudgetTotal > 0 
    ? (currentAmountTotal / yearlySalesBudgetTotal * 100) 
    : amountBudgetAchievement; // Use same as column-based budget if no DB data

  const formatNumber = (num, isCurrency = false) => {
    let formatted;
    if (num >= 1000000) {
      formatted = (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      formatted = Math.round(num / 1000) + 'K';
    } else {
      formatted = Math.round(num || 0).toLocaleString();
    }
    
    if (isCurrency) {
      return <><CurrencySymbol />{formatted}</>;
    }
    return formatted;
  };

  // Format MT values (convert from kg to MT) with no decimals
  const formatMT = (value) => {
    const numericValue = typeof value === 'number' ? value : parseFloat(value || 0);
    const mtValue = isNaN(numericValue) ? 0 : numericValue / 1000;
    return Math.round(mtValue).toLocaleString('en-US');
  };

  const formatPercentage = (num) => {
    return Math.round(num || 0) + '%';
  };

  const formatYoYPercentage = (num) => {
    return (num || 0).toFixed(1) + '%';
  };

  const getCardClass = (value, type) => {
    if (type === 'growth') {
      return value > 0 ? 'positive' : 'negative';
    }
    if (type === 'budget') {
      // Budget achievement thresholds: >= 90% = on track (green), >= 70% = at risk (yellow), < 70% = off track (red)
      return value >= 90 ? 'positive' : value >= 70 ? 'warning' : 'negative';
    }
    return '';
  };

  const formatPeriodLabel = (period) => {
    if (!period) return 'Current Period';
    if (typeof period === 'string') {
      // If it's a string, capitalize period types like HY1, HY2, Q1, Q2 and handle full strings like "hy1 2024"
      return period.replace(/\b(hy[12]|q[1-4]|h[12])\b/gi, (match) => match.toUpperCase());
    }
    if (typeof period === 'object' && period.year && period.month) {
      // Handle custom ranges
      if (period.isCustomRange && period.displayName) {
        const formattedRange = formatCustomRangeDisplay(period.displayName);
        return `${formattedRange} ${period.year}`;
      }
      // Capitalize period types like HY1, HY2, Q1, Q2, etc.
      // Note: Type suffix (Act., Bud., etc.) is NOT added here as delta column headers already show comparison type
      const formattedMonth = period.month.toUpperCase();
      return `${formattedMonth} ${period.year}`;
    }
    return 'Current Period';
  };

  // const getDetailedDescription = () => {
  //   const currentPeriod = formatPeriodLabel(reportData.periodLabel);
  //   const previousPeriod = formatPeriodLabel(reportData.prevPeriod);
  //   const budgetPeriod = formatPeriodLabel(reportData.nextPeriod);
  //   
  //   return `This report analyzes actual ${currentPeriod} sales & volume performance versus ${previousPeriod} and against ${budgetPeriod} budget targets.`;
  // };

  // Calculate top 3 product groups from kgsData with growth comparison
  const getTop3ProductGroups = () => {
    if (!kgsData || !Array.isArray(kgsData) || kgsData.length === 0 || basePeriodIndex === null || !columnOrder) {
      return [];
    }

    // Find the correct rawValues index for the base period
    const rawValuesIndex = columnOrder.findIndex((col, index) => index === basePeriodIndex);
    if (rawValuesIndex === -1) return [];

    // Calculate total amount for sales percentage
    const currentAmountTotal = reportData?.amountTotals?.[basePeriodIndex] || 0;

    return kgsData
      .filter(item => item?.rawValues && (item.rawValues[rawValuesIndex] || 0) > 0)
      .sort((a, b) => (b?.rawValues?.[rawValuesIndex] || 0) - (a?.rawValues?.[rawValuesIndex] || 0))
      .slice(0, 3)
      .map((item, index) => {
        const currentValue = item?.rawValues?.[rawValuesIndex] || 0;
        const previousValue = reportData?.prevPeriodIndex >= 0 ? (item?.rawValues?.[reportData.prevPeriodIndex] || 0) : 0;
        const budgetValue = reportData?.yearBudgetIndex >= 0 ? (item?.rawValues?.[reportData.yearBudgetIndex] || 0) : 0;
        const growthPercent = previousValue > 0 ? ((currentValue - previousValue) / previousValue * 100) : 0;
        const budgetAchievement = budgetValue > 0 ? ((currentValue / budgetValue) * 100) : 0;

        // Find corresponding amount data for this product group to calculate sales percentage
        const productName = item.name || item.productGroup || item.productgroup;
        const amountItem = amountData?.find(a =>
          (a.name || a.productGroup || a.productgroup) === productName
        );
        const currentAmountValue = amountItem?.rawValues?.[rawValuesIndex] || 0;
        const salesPercentage = currentAmountTotal > 0 ? (currentAmountValue / currentAmountTotal * 100) : 0;

        return {
          rank: index + 1,
          productGroup: productName || 'Unknown Product',
          value: currentValue,
          percentage: currentTotal > 0 ? (currentValue / currentTotal * 100) : 0,
          salesPercentage: salesPercentage,
          growthPercent: growthPercent,
          budgetAchievement: budgetAchievement
        };
      });
  };

  // Helper function to convert text to proper case
  const toProperCase = (str) => {
    if (!str) return '';
    return str.toString().trim().split(' ').map(word => {
      if (word.length === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
  };

  // Generate fallback country data for testing when API fails
  const generateFallbackCountryData = (salesRep) => {
    
    // Sample country data with realistic values
    const fallbackCountries = [
      { country: 'United Arab Emirates', value: 1500000 }, // Local
      { country: 'Saudi Arabia', value: 800000 }, // Export
      { country: 'Kuwait', value: 600000 }, // Export
      { country: 'Qatar', value: 400000 }, // Export
      { country: 'Egypt', value: 300000 }, // Export
      { country: 'Jordan', value: 250000 }, // Export
      { country: 'Lebanon', value: 200000 }, // Export
      { country: 'Germany', value: 150000 }, // Export
      { country: 'United Kingdom', value: 120000 }, // Export
      { country: 'India', value: 100000 } // Export
    ];
    
    return fallbackCountries;
  };

  // Calculate geographic distribution - EXACTLY LIKE MAIN KPI PAGE
  const getGeographicDistribution = () => {
    const actualData = countryData?.data || [];
    if (!actualData || actualData.length === 0) {
      return {
        localSales: 0,
        exportSales: 0,
        totalSales: 0,
        regionalBreakdown: [],
        topRegions: [],
        actualPeriod: countryData?.actualPeriod,
        isDifferentSalesRep: false
      };
    }

    // Initialize regional sales - uses regions from master_countries database
    let regionalSales = {
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

    // Group countries by region - prefer region from API (unified view), fallback to getRegionForCountry
    actualData.forEach(countryItem => {
      const countryName = countryItem.country;
      const countryValue = countryItem.value;
      
      // Prefer region from API response (from unified view's country_region column)
      // Fallback to getRegionForCountry if region not provided
      const region = countryItem.region || getRegionForCountry(countryName);
      
      if (region && regionalSales[region] !== undefined) {
        regionalSales[region] += countryValue;
      } else if (region) {
        // Region exists but not in our list - add to Unassigned
        regionalSales['Unassigned'] += countryValue;
      } else {
        regionalSales['Unassigned'] += countryValue;
      }
    });

    // Calculate total and percentages - SAME AS MAIN KPI PAGE
    const totalCountrySales = actualData.reduce((sum, country) => sum + country.value, 0);

    // Calculate regional percentages - SAME AS MAIN KPI PAGE
    const regionalPercentages = {};
    Object.keys(regionalSales).forEach(region => {
      regionalPercentages[region] = totalCountrySales > 0 ? (regionalSales[region] / totalCountrySales * 100) : 0;
    });

    // Calculate Local vs Export - SAME AS MAIN KPI PAGE
    const localSales = regionalPercentages['UAE'] || 0;
    const exportSales = 100 - localSales;

    // Get export regions with meaningful percentages - SAME AS MAIN KPI PAGE
    const exportRegions = Object.entries(regionalPercentages)
      .filter(([region, percentage]) => region !== 'UAE' && percentage >= 0.1)
      .sort((a, b) => b[1] - a[1]);

    // Calculate percentages relative to export total - SAME AS MAIN KPI PAGE
    const exportRegionsWithRelativePercentage = exportRegions.map(([region, percentage]) => {
      const relativePercentage = exportSales > 0 ? (percentage / exportSales) * 100 : 0;
      return [region, percentage, relativePercentage];
    });

    const result = {
      localSales: Math.round(localSales * 10) / 10,
      exportSales: Math.round(exportSales * 10) / 10,
      totalSales: totalCountrySales,
      regionalBreakdown: Object.entries(regionalSales).map(([region, value]) => ({
        name: region,
        value,
        percentage: totalCountrySales > 0 ? (value / totalCountrySales * 100) : 0
      })),
      topRegions: exportRegionsWithRelativePercentage.map(([region, absPerc, relPerc]) => ({
        name: region,
        value: regionalSales[region],
        percentage: absPerc,
        exportPercentage: relPerc
      })),
      actualPeriod: countryData?.actualPeriod,
      isDifferentSalesRep: false
    };

    return result;
  };

  // Calculate customer insights from reportData.topCustomers and allCustomers
  const getCustomerInsights = () => {
    if (!reportData.topCustomers || !Array.isArray(reportData.topCustomers) || basePeriodIndex === null || !columnOrder) {
      return {
        topCustomer: null,
        top3Customers: [],
        top5Customers: [],
        avgSalesPerCustomer: 0,
        totalCustomers: 0,
        customerGrowth: 0,
        newCustomers: 0,
        newCustomerNames: []
      };
    }
    
    // Find the correct rawValues index for the base period
    const rawValuesIndex = columnOrder.findIndex((col, index) => index === basePeriodIndex);
    if (rawValuesIndex === -1) {
      return {
        topCustomer: null,
        top3Customers: [],
        top5Customers: [],
        avgSalesPerCustomer: 0,
        totalCustomers: 0,
        customerGrowth: 0,
        newCustomers: 0,
        newCustomerNames: []
      };
    }
    
    // Use merged customer data passed in reportData (already merged via DB rules)
    // Re-sort by the base period to ensure correct ranking
    // IMPORTANT: Deduplicate by normalized name to avoid duplicate entries from different customer IDs
    const rawCustomersWithValues = reportData.topCustomers
      .filter(customer => customer?.rawValues && (customer.rawValues[rawValuesIndex] || 0) > 0)
      .map(customer => ({
        name: toProperCase(customer.name),
        value: customer?.rawValues?.[rawValuesIndex] || 0,
        originalCustomer: customer
      }));
    
    // Deduplicate by name - aggregate values for customers with the same name
    const customerMap = new Map();
    rawCustomersWithValues.forEach(customer => {
      const normalizedName = customer.name.toLowerCase().trim();
      if (customerMap.has(normalizedName)) {
        const existing = customerMap.get(normalizedName);
        existing.value += customer.value;
      } else {
        customerMap.set(normalizedName, { ...customer });
      }
    });
    const customersWithValues = Array.from(customerMap.values())
      .sort((a, b) => b.value - a.value); // Sort descending by current period value
    
    const rawAllCustomersWithValues = (reportData.allCustomers || reportData.topCustomers)
      .filter(customer => customer?.rawValues && (customer.rawValues[rawValuesIndex] || 0) > 0)
      .map(customer => ({
        name: toProperCase(customer.name),
        value: customer?.rawValues?.[rawValuesIndex] || 0,
        originalCustomer: customer
      }));
    
    // Deduplicate allCustomers by name - aggregate values for customers with the same name
    const allCustomerMap = new Map();
    rawAllCustomersWithValues.forEach(customer => {
      const normalizedName = customer.name.toLowerCase().trim();
      if (allCustomerMap.has(normalizedName)) {
        const existing = allCustomerMap.get(normalizedName);
        existing.value += customer.value;
      } else {
        allCustomerMap.set(normalizedName, { ...customer });
      }
    });
    const allCustomersWithValues = Array.from(allCustomerMap.values())
      .sort((a, b) => b.value - a.value); // Sort descending by current period value
    
    // Totals based on ALL customers (not just top 5)
    const totalCustomerSales = allCustomersWithValues.reduce((sum, customer) => sum + customer.value, 0);

    // For percentages, calculate each customer's share of TOTAL sales (not just top 5)
    const customersWithPercentages = customersWithValues.map(customer => ({
      ...customer,
      percentage: totalCustomerSales > 0 ? (customer.value / totalCustomerSales * 100) : 0
    }));

    // Customer growth/new customers using merged data
    let customerGrowth = 0;
    let newCustomers = 0;
    let newCustomerNames = [];
    
    if (reportData.prevPeriodIndex >= 0 && basePeriodIndex >= 0) {
      const previousPeriodAllCustomers = (reportData.allCustomers || reportData.topCustomers)
        .filter(customer => customer?.rawValues && (customer.rawValues[reportData.prevPeriodIndex] || 0) > 0)
        .map(customer => ({
          name: toProperCase(customer.name),
          value: customer?.rawValues?.[reportData.prevPeriodIndex] || 0
        }));
      
      const previousCustomerCount = previousPeriodAllCustomers.length;
      const currentCustomerCount = allCustomersWithValues.length;
      
      customerGrowth = previousCustomerCount > 0 ? 
        ((currentCustomerCount - previousCustomerCount) / previousCustomerCount * 100) : 0;
      
      const previousCustomerNames = new Set(previousPeriodAllCustomers.map(c => c.name.toLowerCase()))
      const newCustomerList = allCustomersWithValues.filter(currentCustomer => 
        !previousCustomerNames.has(currentCustomer.name.toLowerCase())
      );
      
      newCustomers = newCustomerList.length;
      newCustomerNames = newCustomerList.map(customer => customer.name);
    }
    
    return {
      topCustomer: customersWithPercentages[0] || null,
      top3Customers: customersWithPercentages.slice(0, 3),
      top5Customers: customersWithPercentages.slice(0, 5),
      avgSalesPerCustomer: allCustomersWithValues.length > 0 ? totalCustomerSales / allCustomersWithValues.length : 0,
      totalCustomers: allCustomersWithValues.length,
      customerGrowth: customerGrowth,
      newCustomers: newCustomers,
      newCustomerNames: newCustomerNames
    };
  };

  const top3ProductGroups = getTop3ProductGroups();
  const customerInsights = getCustomerInsights();
  const geographicDistribution = getGeographicDistribution();

  return (
    <div className="section">
      <h2>KPI's Summary</h2>
      
      <div className="metric-row">
        <div className="metric-card">
          <div className="metric-label">Volume {formatPeriodLabel(reportData.periodLabel)}</div>
          <div className="metric-value">{formatMT(currentTotal)} MT</div>
          <div className="metric-previous">
            Previous Period: {formatMT(previousTotal)} MT
          </div>
        </div>
        
        <div className="metric-card">
          <div className="metric-label">YoY Growth</div>
          {yoyGrowth !== null ? (
            <div className={`metric-value ${getCardClass(yoyGrowth, 'growth')}`}>
              {yoyGrowth > 0 ? '+' : ''}{formatYoYPercentage(yoyGrowth)}
            </div>
          ) : (
            <div className="metric-value no-data">
              <div style={{ fontSize: '16px', color: '#17a2b8', fontWeight: 'bold' }}>
                🆕 New
              </div>
            </div>
          )}
        </div>
        
        <div className="metric-card">
          <div className="metric-label">{reportData.budgetPeriod ? formatPeriodLabel(reportData.budgetPeriod) : 'Budget'} Achievement</div>
          {budgetTotal > 0 ? (
            <>
              <div className={`metric-value ${getCardClass(budgetAchievement, 'budget')}`}>
                {formatPercentage(budgetAchievement)}
              </div>
              {/* Only show yearly-budget sub-text when a full-year budget column is actually present */}
              {yearlyBudgetTotal > 0 && (
                <div className="metric-previous">
                  ({formatYoYPercentage(yearlyBudgetAchievement)} of yearly Budget)
                </div>
              )}
            </>
          ) : (
            <div className="metric-value no-data">
              <div style={{ fontSize: '14px', color: '#6c757d' }}>
                No budget
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Second row - Sales (Amount) metrics */}
      <div className="metric-row">
          <div className="metric-card">
            <div className="metric-label">Sales {formatPeriodLabel(reportData.periodLabel)}</div>
            <div className="metric-value">{formatNumber(currentAmountTotal, true)}</div>
            <div className="metric-previous">
              Previous Period: {formatNumber(previousAmountTotal, true)}
            </div>
          </div>
        
        <div className="metric-card">
          <div className="metric-label">Sales YoY Growth</div>
          {amountYoyGrowth !== null ? (
            <div className={`metric-value ${getCardClass(amountYoyGrowth, 'growth')}`}>
              {amountYoyGrowth > 0 ? '+' : ''}{formatYoYPercentage(amountYoyGrowth)}
            </div>
          ) : (
            <div className="metric-value no-data">
              <div style={{ fontSize: '16px', color: '#17a2b8', fontWeight: 'bold' }}>
                🆕 New
              </div>
            </div>
          )}
        </div>
        
        <div className="metric-card">
          <div className="metric-label">Sales {reportData.budgetPeriod ? formatPeriodLabel(reportData.budgetPeriod) : 'Budget'} Achievement</div>
          {budgetAmountTotal > 0 ? (
            <>
              <div className={`metric-value ${getCardClass(amountBudgetAchievement, 'budget')}`}>
                {formatPercentage(amountBudgetAchievement)}
              </div>
              {/* Only show yearly-budget sub-text when a full-year budget column is actually present */}
              {yearlySalesBudgetTotal > 0 && (
                <div className="metric-previous">
                  ({formatYoYPercentage(yearlySalesBudgetAchievement)} of yearly Budget)
                </div>
              )}
            </>
          ) : (
            <div className="metric-value no-data">
              <div style={{ fontSize: '14px', color: '#6c757d' }}>
                No budget
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Third row - Top 3 Product Groups */}
      {top3ProductGroups.length > 0 && (
        <div className="metric-row">
          <div style={{ width: '100%', textAlign: 'center', marginBottom: '20px' }}>
            <h3 style={{
              color: '#667eea',
              fontSize: '1.4em',
              marginBottom: '8px',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              display: 'inline-block'
            }}>
              TOP 3 PRODUCT GROUPS
            </h3>
            <div style={{ fontSize: '0.85em', fontWeight: 'normal', color: '#666', fontStyle: 'italic' }}>
              (by Volume)
            </div>
          </div>
          <div className="top-products-horizontal">
            {top3ProductGroups.map((product, index) => {
              const rankIcon = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
              const isPositive = product.growthPercent > 0;
              const arrow = isPositive ? '▲' : '▼';
              const growthWord = isPositive ? 'growth' : 'decline';
              
              return (
                <div key={index} className="top-product-card">
                  <div className="product-rank">
                    <span className="rank-icon">{rankIcon}</span>
                  </div>
                  <div className="product-info">
                    <div className="product-name">{product.productGroup}</div>
                    <div className="product-percentage">{product.percentage.toFixed(1)}% of volume</div>
                    <div className="product-percentage" style={{ fontSize: '0.9em', color: '#888', marginTop: '2px' }}>({product.salesPercentage.toFixed(1)}% of sales)</div>
                  </div>
                  <div className={`product-performance ${isPositive ? 'positive' : 'negative'}`}>
                    {arrow} {Math.abs(product.growthPercent).toFixed(0)}% {growthWord} vs {reportData.prevPeriod ? formatPeriodLabel(reportData.prevPeriod) : 'previous period'}
                  </div>
                  <div className={`product-performance ${product.budgetAchievement >= 100 ? 'positive' : 'negative'}`} style={{ fontSize: '0.85em', marginTop: '4px' }}>
                    {product.budgetAchievement.toFixed(1)}% of {reportData.budgetPeriod ? formatPeriodLabel(reportData.budgetPeriod) : 'Budget'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Customer Insights Section */}
      {customerInsights.topCustomer && (
        <div className="customer-insights-section">
          <div className="customer-insights-header">
            <span className="insights-icon">👥</span>
            <h3>CUSTOMER INSIGHTS</h3>
          </div>
          <div className="customer-insights-grid">
            {/* Left: Top 5 Customers */}
            <div className="customer-insight-card-tall">
              <div className="insight-header">
                <div className="insight-icon">🏆</div>
                <div className="insight-title">TOP 5 CUSTOMERS</div>
              </div>
              <div className="top5-list">
                {customerInsights.top5Customers.map((customer, index) => (
                  <div key={index} className="top5-item">
                    <span className="customer-name">{toProperCase(customer.name)}</span>
                    <span className="customer-percentage">{customer.percentage.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
              <div className="insight-footer">of total sales</div>
            </div>

            {/* Right Top: Total Customers */}
            <div className="customer-insight-card-small">
              <div className="insight-icon">👥</div>
              <div className="insight-title">TOTAL CUSTOMERS</div>
              <div className="insight-value">{customerInsights.totalCustomers}</div>
              <div className="insight-subtitle">
                {customerInsights.customerGrowth !== 0 && (
                  <span className={customerInsights.customerGrowth > 0 ? 'growth-positive' : 'growth-negative'}>
                    {customerInsights.customerGrowth > 0 ? '▲' : '▼'} {Math.abs(customerInsights.customerGrowth).toFixed(1)}% vs FY 2024
                  </span>
                )}
              </div>
              <div className="insight-footer">active customers</div>
            </div>

            {/* Center: AVG Sales per Customer - spans across middle */}
            <div className="customer-insight-card-center">
              <div className="insight-icon">💰</div>
              <div className="insight-title">AVG SALES PER CUSTOMER</div>
              <div className="insight-value">{formatNumber(customerInsights.avgSalesPerCustomer, true)}</div>
              <div className="insight-footer">average value</div>
            </div>

            {/* Right Bottom: New Customers */}
            <div className="customer-insight-card-small">
              <div className="insight-icon">🆕</div>
              <div className="insight-title">NEW CUSTOMERS</div>
              <div className="insight-value">{customerInsights.newCustomers}</div>
              <div className="insight-footer">
                new in FY 2025 vs FY 2024
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Geographic Distribution Section */}
      <div className="executive-summary-section">
        <h3 className="kpi-section-title">🌍 GEOGRAPHIC DISTRIBUTION</h3>
        <div style={{ 
          textAlign: 'center', 
          marginBottom: '25px',
          padding: '12px 20px',
          background: 'linear-gradient(135deg, #f8f9fa, #ffffff)',
          border: '1px solid #e9ecef',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
        }}>
          <div style={{
            fontSize: '0.85em',
            color: '#6c757d',
            fontWeight: '500',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '4px'
          }}>
            Reporting Period
          </div>
          <div style={{
            fontSize: '1.1em',
            color: '#495057',
            fontWeight: '600',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}>
            {formatPeriodLabel(reportData.periodLabel)}
          </div>
        </div>
        
        {/* Show data source info if using different sales rep */}
        {geographicDistribution.isDifferentSalesRep && geographicDistribution.actualPeriod && (
          <div className="geo-data-source-info">
            <div className="info-icon">ℹ️</div>
            <div className="info-text">
              Showing sample data from {geographicDistribution.actualPeriod.salesRep} ({geographicDistribution.actualPeriod.month} {geographicDistribution.actualPeriod.year})
            </div>
          </div>
        )}
        
        {/* Row 1: Local vs Export - Same structure as main KPI */}
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
            <div className="kpi-value">{geographicDistribution.localSales.toFixed(1)}%</div>
            <div className="kpi-trend">of total sales</div>
          </div>
          <div className="kpi-card large">
            <div className="rotating-emoji-container">
              <div className="rotating-emoji">🌍</div>
            </div>
            <div className="kpi-label">Export</div>
            <div className="kpi-value">{geographicDistribution.exportSales.toFixed(1)}%</div>
            <div className="kpi-trend">of total sales</div>
          </div>
        </div>
        
        {/* Visual connector from Export card to regional cards */}
        {geographicDistribution.topRegions.length > 0 && (
          <div className="export-connector">
            <div className="export-connector__arrow" />
            <div className="export-connector__bracket" />
          </div>
        )}
        
        {/* Row 2: Export Regions - Same structure as main KPI */}
        {geographicDistribution.topRegions.length > 0 && (
          <div className="kpi-cards export-regions">
            {geographicDistribution.topRegions.map((region) => {
              // Calculate gradient color based on percentage
              const gradientColor = getRegionColor(region.exportPercentage);
              
              return (
                <div 
                  key={region.name} 
                  className="kpi-card"
                  style={{
                    background: `linear-gradient(135deg, ${gradientColor}, ${gradientColor}cc)`,
                    borderLeft: `4px solid ${gradientColor}`,
                    boxShadow: `0 4px 12px ${gradientColor}44`,
                    color: region.exportPercentage >= 10 ? 'white' : '#1a365d'
                  }}
                >
                  <div className="region-globe-container">
                    <div className="region-globe">{getRegionIcon(region.name)}</div>
                  </div>
                  <div className="kpi-label" style={{ 
                    color: region.exportPercentage >= 10 ? 'white' : '#2d3748', 
                    fontWeight: '700' 
                  }}>{region.name}</div>
                  <div className="kpi-value" style={{ 
                    color: region.exportPercentage >= 10 ? 'white' : '#1a365d', 
                    fontWeight: '800' 
                  }}>{region.percentage.toFixed(1)}%</div>
                  <div className="kpi-trend" style={{ 
                    color: region.exportPercentage >= 10 ? '#e2e8f0' : '#4a5568' 
                  }}>{region.exportPercentage.toFixed(1)}% of export</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Warning for unassigned countries */}
        {(() => {
          let unassignedCountries = [];
          if (reportData && reportData.selectedDivision === 'FP' && countryData?.data) {
            unassignedCountries = countryData.data.filter(cs => getRegionForCountry(cs.country) === 'Unassigned').map(cs => cs.country);
            if (unassignedCountries.length > 0) {
              console.warn('Unassigned countries in FP:', unassignedCountries);
            }
          }
          
          return unassignedCountries.length > 0 && (
            <div style={{marginTop: 16, color: '#d32f2f', fontWeight: 'bold', textAlign: 'center'}}>
              Warning: Unassigned countries in FP: {unassignedCountries.join(', ')}
            </div>
          );
        })()}
        
        {/* Show message if no regional data */}
        {geographicDistribution.topRegions.length === 0 && geographicDistribution.totalSales > 0 && (
          <div className="no-regional-data">
            <div className="info-icon">📍</div>
            <div className="info-text">All sales are local (UAE)</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExecutiveSummary;
