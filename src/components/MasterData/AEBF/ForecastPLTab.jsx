/**
 * ForecastPLTab Component
 * 
 * Displays P&L Forecast simulation based on forecast sales data.
 * Uses same year selection concept as Forecast Sales tab.
 * 
 * Data Sources:
 * - Actual P&L: From {division}_pl_data table (data_type = 'Actual')
 * - Budget P&L: From {division}_pl_data table (data_type = 'Budget')
 * - Forecast P&L: 
 *   - Sales, Material, MoRM from forecast sales (fp_product_group_projections)
 *   - Other P&L lines = Apply % of sales from Budget year to forecast sales
 * 
 * Year Pattern (same as Forecast Sales):
 * - Base Year (Actual/Estimate) → Budget (Base+1) → Forecast (Base+2, Base+3)
 * 
 * Features:
 * - Columns: P&L Ledgers | Actual (% + Value) | Budget (% + Value) | Fcst1 (% + Value) | Fcst2 (% + Value)
 * - % of Sales from Budget used as default for Forecast
 * - Edit % of Sales OR Value to adjust forecast (vice-versa)
 * - Save Forecast P&L to fp_pl_data with data_type='Forecast'
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Select, Button, Spin, Space, message, Modal, InputNumber } from 'antd';
import { 
  ReloadOutlined,
  SaveOutlined,
  DownloadOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { usePLData } from '../../../contexts/PLDataContext';

// Format number for display - no decimals, no K/M abbreviation
const formatNumber = (num, isPct = false, isPerKg = false) => {
  if (num === null || num === undefined || isNaN(num)) return '—';
  if (isPct) return num.toFixed(2) + '%'; // Show xx.xx% for percentages
  if (isPerKg) return Math.round(num);
  return Math.round(num).toLocaleString('en-US');
};

// Format for Volume (kg) - no decimals, no K/M abbreviation
const formatVolume = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '—';
  return Math.round(num).toLocaleString('en-US');
};

// Items that can have % of sales edited (calculated from budget % applied to forecast sales)
// 'morm' is included for tracking but not directly editable (comes from forecast sales or material variance)
const PCT_OF_SALES_ITEMS = ['morm', 'labour', 'depreciation', 'electricity', 'others_mfg_overheads', 
  'selling_expenses', 'transportation', 'admin_mgmt_fee_total', 
  'bank_interest', 'bank_charges', 'rd_preproduction', 'stock_provision_adj', 
  'bad_debts', 'other_income', 'other_provision'];

const ForecastPLTab = ({ selectedDivision, isActive, salesDataVersion = 0 }) => {
  // Get PLDataContext forceReload to invalidate cache after saving
  const { forceReload: forceReloadPLData } = usePLData();
  
  // State - Year selection (same concept as Forecast Sales)
  const [availableYears, setAvailableYears] = useState([]);
  const [yearMetadata, setYearMetadata] = useState({});
  const [selectedBaseYear, setSelectedBaseYear] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [yearsLoading, setYearsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // P&L Data
  const [plData, setPlData] = useState(null);
  
  // Editable forecast values - keyed by `${year}_${ledgerKey}`
  const [editedForecastValues, setEditedForecastValues] = useState({});
  
  // Editable % of Sales values - keyed by `${year}_${ledgerKey}`
  const [editedPctOfSales, setEditedPctOfSales] = useState({});
  
  // Material Variance % - adjusts material costs for each forecast year
  // Material = (Sales - MoRM) × (1 + materialVariancePct/100)
  const [materialVariancePct1, setMaterialVariancePct1] = useState(0);
  const [materialVariancePct2, setMaterialVariancePct2] = useState(0);
  
  // Default/saved variance values - used to detect unsaved changes and calculate original base
  const [defaultMaterialVariancePct1, setDefaultMaterialVariancePct1] = useState(0);
  const [defaultMaterialVariancePct2, setDefaultMaterialVariancePct2] = useState(0);
  
  // Track if Forecast data exists in database
  const [hasSavedForecastData1, setHasSavedForecastData1] = useState(false);
  const [hasSavedForecastData2, setHasSavedForecastData2] = useState(false);
  
  // Fetch available years and their metadata
  const fetchAvailableYears = useCallback(async () => {
    if (!selectedDivision) return;
    
    setYearsLoading(true);
    try {
      const response = await axios.get('/api/aebf/filter-options', {
        params: { division: selectedDivision }
      });
      
      if (response.data.success) {
        const years = response.data.data.filterOptions.year || [];
        setAvailableYears(years.sort((a, b) => b - a));
        
        if (response.data.data.yearMetadata) {
          setYearMetadata(response.data.data.yearMetadata);
        }
        
        if (years.length > 0 && !selectedBaseYear) {
          const metadata = response.data.data.yearMetadata || {};
          const actualYears = years.filter(y => metadata[y]?.status === 'ACTUAL');
          const defaultYear = actualYears.length > 0 ? actualYears[0] : years[0];
          setSelectedBaseYear(defaultYear);
        }
      }
    } catch (error) {
      console.error('Error fetching available years:', error);
      message.error('Failed to load available years');
    } finally {
      setYearsLoading(false);
    }
  }, [selectedDivision, selectedBaseYear]);
  
  // Fetch Forecast P&L data
  const fetchPLData = useCallback(async (forceRecalculate = false) => {
    if (!selectedDivision || !selectedBaseYear) return;
    
    setLoading(true);
    try {
      const response = await axios.post('/api/aebf/forecast-pl-data', {
        division: selectedDivision,
        baseYear: selectedBaseYear,
        forceRecalculate: forceRecalculate,
        _t: Date.now() // Cache buster to ensure fresh data
      });
      
      if (response.data.success) {
        const data = response.data.data;
        setPlData(data);
        setHasSavedForecastData1(data.hasSavedForecastData1 || false);
        setHasSavedForecastData2(data.hasSavedForecastData2 || false);
        
        // Reset edits on load
        setEditedForecastValues({});
        setEditedPctOfSales({});
        
        // Material variance % - restore from database if saved, otherwise 0
        const savedVariance1 = parseFloat(data.savedMaterialVariancePct1) || 0;
        const savedVariance2 = parseFloat(data.savedMaterialVariancePct2) || 0;
        setMaterialVariancePct1(savedVariance1);
        setMaterialVariancePct2(savedVariance2);
        setDefaultMaterialVariancePct1(savedVariance1);
        setDefaultMaterialVariancePct2(savedVariance2);
      }
    } catch (error) {
      console.error('Error fetching Forecast P&L data:', error);
      message.error('Failed to load Forecast P&L data');
    } finally {
      setLoading(false);
    }
  }, [selectedDivision, selectedBaseYear]);
  
  // Effects
  useEffect(() => {
    if (selectedDivision) {
      fetchAvailableYears();
    }
  }, [selectedDivision, fetchAvailableYears]);
  
  useEffect(() => {
    if (selectedBaseYear) {
      fetchPLData();
    }
  }, [selectedBaseYear, fetchPLData]);

  useEffect(() => {
    if (isActive && selectedBaseYear) {
      // Load saved data when tab becomes active (don't force recalculate - user may have saved edits)
      fetchPLData(false);
    }
  }, [isActive, selectedBaseYear, fetchPLData]);
  
  // Auto-refresh when ForecastSalesTab saves data
  // salesDataVersion increments each time ForecastSalesTab saves
  useEffect(() => {
    if (salesDataVersion > 0 && selectedBaseYear) {
      // Force recalculate to pick up new sales/morm data from projections table
      message.info('Forecast sales updated - refreshing P&L data...');
      fetchPLData(true);
    }
  }, [salesDataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Warn user before leaving page with unsaved changes
  useEffect(() => {
    const hasVarianceChange = materialVariancePct1 !== 0 || materialVariancePct2 !== 0;
    const hasEdits = Object.keys(editedForecastValues).length > 0 || Object.keys(editedPctOfSales).length > 0;
    const hasUnsaved = hasVarianceChange || hasEdits;
    
    const handleBeforeUnload = (e) => {
      if (hasUnsaved) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [materialVariancePct1, materialVariancePct2, editedForecastValues, editedPctOfSales]);
  
  const handleBaseYearChange = (year) => {
    setSelectedBaseYear(year);
  };
  
  // Get forecast value (edited or original) for a specific year
  const getForecastValue = useCallback((year, key) => {
    const editKey = `${year}_${key}`;
    if (editedForecastValues.hasOwnProperty(editKey)) {
      return editedForecastValues[editKey];
    }
    const yearTotals = year === plData?.forecastYear1 
      ? plData?.forecastYearTotals1 
      : plData?.forecastYearTotals2;
    return yearTotals?.[key] || 0;
  }, [editedForecastValues, plData]);
  
  // Get forecast display value (with calculated fields)
  const getForecastDisplayValue = useCallback((year, key) => {
    const inputKeys = ['sales', 'sales_volume_kg', 'material', 'morm', 'labour', 'depreciation', 
      'electricity', 'others_mfg_overheads', 'selling_expenses', 
      'transportation', 'admin_mgmt_fee_total', 
      'bank_interest', 'bank_charges', 'rd_preproduction', 'stock_provision_adj', 
      'bad_debts', 'other_income', 'other_provision'];
    
    if (inputKeys.includes(key)) {
      return getForecastValue(year, key);
    }
    
    // Calculate derived fields
    const sales = getForecastValue(year, 'sales');
    const material = getForecastValue(year, 'material');
    const labour = getForecastValue(year, 'labour');
    const depreciation = getForecastValue(year, 'depreciation');
    const electricity = getForecastValue(year, 'electricity');
    const others_mfg_overheads = getForecastValue(year, 'others_mfg_overheads');
    const dir_cost_stock_adj = 0;
    const selling_expenses = getForecastValue(year, 'selling_expenses');
    const transportation = getForecastValue(year, 'transportation');
    const admin_mgmt_fee_total = getForecastValue(year, 'admin_mgmt_fee_total');
    const bank_interest = getForecastValue(year, 'bank_interest');
    const bank_charges = getForecastValue(year, 'bank_charges');
    const rd_preproduction = getForecastValue(year, 'rd_preproduction');
    const stock_provision_adj = getForecastValue(year, 'stock_provision_adj');
    const bad_debts = getForecastValue(year, 'bad_debts');
    const other_income = getForecastValue(year, 'other_income');
    const other_provision = getForecastValue(year, 'other_provision');
    
    const actual_direct_cost = labour + depreciation + electricity + others_mfg_overheads;
    const dir_cost_goods_sold = actual_direct_cost + dir_cost_stock_adj;
    const cost_of_sales = material + dir_cost_goods_sold;
    const gross_profit = sales - cost_of_sales;
    const gross_profit_before_depn = gross_profit + depreciation;
    
    const total_finance_cost = bank_interest + bank_charges + rd_preproduction;
    const total_below_gp_expenses = other_income + bad_debts + stock_provision_adj + 
                                     total_finance_cost + admin_mgmt_fee_total + 
                                     transportation + selling_expenses + other_provision;
    
    const net_profit = gross_profit - total_below_gp_expenses;
    const ebit = net_profit + bank_interest;
    const ebitda = net_profit + depreciation + bank_interest + rd_preproduction + other_provision;
    const total_expenses = actual_direct_cost + total_below_gp_expenses;
    const direct_cost_pct_of_cogs = cost_of_sales > 0 ? (dir_cost_goods_sold / cost_of_sales) * 100 : 0;
    
    switch (key) {
      case 'actual_direct_cost': return actual_direct_cost;
      case 'dir_cost_goods_sold': return dir_cost_goods_sold;
      case 'cost_of_sales': return cost_of_sales;
      case 'direct_cost_pct_of_cogs': return direct_cost_pct_of_cogs;
      case 'gross_profit': return gross_profit;
      case 'gross_profit_before_depn': return gross_profit_before_depn;
      case 'total_below_gp_expenses': return total_below_gp_expenses;
      case 'total_finance_cost': return total_finance_cost;
      case 'net_profit': return net_profit;
      case 'ebit': return ebit;
      case 'ebitda': return ebitda;
      case 'total_expenses': return total_expenses;
      case 'dir_cost_stock_adj': return 0;
      default: return getForecastValue(year, key);
    }
  }, [getForecastValue]);
  
  // Get % of Sales for an item
  const getPctOfSales = useCallback((key, dataType, year = null, sales = null) => {
    // For forecast with edits
    if (dataType === 'forecast' && year) {
      const editKey = `${year}_${key}`;
      if (editedPctOfSales.hasOwnProperty(editKey)) {
        return editedPctOfSales[editKey];
      }
      // Calculate from current value - use getForecastDisplayValue to include calculated fields
      const forecastSales = sales || getForecastValue(year, 'sales');
      const forecastValue = getForecastDisplayValue(year, key);
      return forecastSales > 0 ? (forecastValue / forecastSales) * 100 : 0;
    }
    
    if (dataType === 'actual') {
      const actualSales = plData?.actualYearTotals?.sales || 0;
      const actualValue = plData?.actualYearTotals?.[key] || 0;
      return actualSales > 0 ? (actualValue / actualSales) * 100 : 0;
    }
    
    if (dataType === 'budget') {
      const budgetSales = plData?.budgetYearTotals?.sales || 0;
      const budgetValue = plData?.budgetYearTotals?.[key] || 0;
      return budgetSales > 0 ? (budgetValue / budgetSales) * 100 : 0;
    }
    
    return 0;
  }, [plData, editedPctOfSales, getForecastValue, getForecastDisplayValue]);
  
  // Handle forecast VALUE edit - updates the % accordingly
  const handleForecastValueEdit = (year, key, value) => {
    const editKey = `${year}_${key}`;
    setEditedForecastValues(prev => ({
      ...prev,
      [editKey]: value
    }));
    
    // Update % of sales accordingly
    const forecastSales = getForecastValue(year, 'sales');
    if (forecastSales > 0 && PCT_OF_SALES_ITEMS.includes(key)) {
      const newPct = (value / forecastSales) * 100;
      setEditedPctOfSales(prev => ({
        ...prev,
        [editKey]: newPct
      }));
    }
  };
  
  // Handle % of Sales edit - updates the value accordingly
  const handlePctOfSalesEdit = (year, key, pctValue) => {
    const editKey = `${year}_${key}`;
    setEditedPctOfSales(prev => ({
      ...prev,
      [editKey]: pctValue
    }));
    
    // Recalculate the forecast value based on new % and forecast sales
    const forecastSales = getForecastValue(year, 'sales');
    const newValue = forecastSales > 0 ? Math.round(forecastSales * (pctValue / 100)) : 0;
    
    setEditedForecastValues(prev => ({
      ...prev,
      [editKey]: newValue
    }));
  };
  
  // Handle Material Variance % change - recalculates material and morm for the year
  // IMPORTANT: We must calculate from the ORIGINAL base material (before any variance)
  // If data was saved with variance X%, the saved material = baseMaterial * (1 + X/100)
  // To get original: baseMaterial = savedMaterial / (1 + savedVariance/100)
  const handleMaterialVarianceChange = (forecastYear, newVariance, setVarianceState) => {
    setVarianceState(newVariance);
    
    if (!plData) return;
    
    // Get the year's forecast data source and saved variance
    const isYear1 = forecastYear === plData.forecastYear1;
    const yearTotals = isYear1 ? plData.forecastYearTotals1 : plData.forecastYearTotals2;
    const savedVariance = isYear1 ? defaultMaterialVariancePct1 : defaultMaterialVariancePct2;
    
    if (!yearTotals) return;
    
    // Get current sales (edited or original)
    const salesEditKey = `${forecastYear}_sales`;
    const salesValue = editedForecastValues.hasOwnProperty(salesEditKey) 
      ? (editedForecastValues[salesEditKey] || 0) 
      : (yearTotals.sales || 0);
    
    // Get the SAVED material value from database
    const savedMaterial = yearTotals.material || 0;
    
    // Reverse the SAVED variance to get original base material
    // savedMaterial = baseMaterial * (1 + savedVariance/100)
    // baseMaterial = savedMaterial / (1 + savedVariance/100)
    const savedVarianceFactor = 1 + savedVariance / 100;
    const baseMaterial = savedVarianceFactor !== 0 
      ? Math.round(savedMaterial / savedVarianceFactor)
      : savedMaterial;
    
    // Apply NEW variance to get adjusted material
    const adjustedMaterial = Math.round(baseMaterial * (1 + newVariance / 100));
    
    // MoRM = Sales - Material (adjusts inversely)
    const adjustedMorm = salesValue - adjustedMaterial;
    
    // Update edited values with new material and morm
    setEditedForecastValues(prev => ({
      ...prev,
      [`${forecastYear}_material`]: adjustedMaterial,
      [`${forecastYear}_morm`]: adjustedMorm
    }));
    
    // Also update % of sales for morm so it's tracked as edited
    if (salesValue > 0) {
      const mormPct = (adjustedMorm / salesValue) * 100;
      setEditedPctOfSales(prev => ({
        ...prev,
        [`${forecastYear}_morm`]: mormPct
      }));
    }
  };
  
  // Check if there are unsaved changes
  const hasUnsavedChanges = (() => {
    if (plData && (!hasSavedForecastData1 || !hasSavedForecastData2)) return true;
    if (Object.keys(editedPctOfSales).length > 0) return true;
    if (Object.keys(editedForecastValues).length > 0) return true;
    // Material variance changes - compare to saved/default values
    if (materialVariancePct1 !== defaultMaterialVariancePct1) return true;
    if (materialVariancePct2 !== defaultMaterialVariancePct2) return true;
    return false;
  })();
  
  // Save to database
  const handleSaveToDatabase = async () => {
    if (!plData || !hasUnsavedChanges) return;
    
    setSaving(true);
    try {
      const forecastYear1 = plData.forecastYear1;
      const forecastYear2 = plData.forecastYear2;
      
      const buildMonthlyDataForYear = (year) => {
        const monthlyData = {};
        const forecastByMonth = year === forecastYear1 
          ? (plData.forecastByMonth1 || {}) 
          : (plData.forecastByMonth2 || {});
        
        // Debug: Log what values are being saved
        
        for (let m = 1; m <= 12; m++) {
          const monthBase = forecastByMonth[m] || {};
          const budgetMonthSales = plData.budgetByMonth?.[m]?.sales || 0;
          const budgetYearSales = plData.budgetYearTotals?.sales || 1;
          const proportion = budgetYearSales > 0 ? budgetMonthSales / budgetYearSales : 1/12;
          
          // For material and morm - ALWAYS use getForecastDisplayValue (includes variance edits)
          // Don't fall back to monthBase which has old values
          const materialValue = getForecastDisplayValue(year, 'material') * proportion;
          const mormValue = getForecastDisplayValue(year, 'morm') * proportion;
          
          monthlyData[m] = {
            sales: monthBase.sales || getForecastDisplayValue(year, 'sales') * proportion,
            sales_volume_kg: monthBase.sales_volume_kg || getForecastDisplayValue(year, 'sales_volume_kg') * proportion,
            material: materialValue,
            morm: mormValue,
            labour: getForecastDisplayValue(year, 'labour') * proportion,
            depreciation: getForecastDisplayValue(year, 'depreciation') * proportion,
            electricity: getForecastDisplayValue(year, 'electricity') * proportion,
            others_mfg_overheads: getForecastDisplayValue(year, 'others_mfg_overheads') * proportion,
            selling_expenses: getForecastDisplayValue(year, 'selling_expenses') * proportion,
            transportation: getForecastDisplayValue(year, 'transportation') * proportion,
            admin_mgmt_fee_total: getForecastDisplayValue(year, 'admin_mgmt_fee_total') * proportion,
            bank_interest: getForecastDisplayValue(year, 'bank_interest') * proportion,
            bank_charges: getForecastDisplayValue(year, 'bank_charges') * proportion,
            rd_preproduction: getForecastDisplayValue(year, 'rd_preproduction') * proportion,
            stock_provision_adj: getForecastDisplayValue(year, 'stock_provision_adj') * proportion,
            bad_debts: getForecastDisplayValue(year, 'bad_debts') * proportion,
            other_income: getForecastDisplayValue(year, 'other_income') * proportion,
            other_provision: getForecastDisplayValue(year, 'other_provision') * proportion,
            cost_of_sales: getForecastDisplayValue(year, 'cost_of_sales') * proportion,
            gross_profit: getForecastDisplayValue(year, 'gross_profit') * proportion,
            net_profit: getForecastDisplayValue(year, 'net_profit') * proportion,
            ebitda: getForecastDisplayValue(year, 'ebitda') * proportion
          };
        }
        return monthlyData;
      };
      
      const [response1, response2] = await Promise.all([
        axios.post('/api/aebf/save-forecast-pl', {
          division: selectedDivision,
          forecastYear: forecastYear1,
          monthlyData: buildMonthlyDataForYear(forecastYear1),
          materialVariancePct: materialVariancePct1  // Save variance %
        }),
        axios.post('/api/aebf/save-forecast-pl', {
          division: selectedDivision,
          forecastYear: forecastYear2,
          monthlyData: buildMonthlyDataForYear(forecastYear2),
          materialVariancePct: materialVariancePct2  // Save variance %
        })
      ]);
      
      if (response1.data.success && response2.data.success) {
        message.success('Forecast P&L saved to database successfully');
        setHasSavedForecastData1(true);
        setHasSavedForecastData2(true);
        setEditedForecastValues({});
        setEditedPctOfSales({});
        // Variance is now persisted - don't reset, it will be loaded from DB on next fetch
        fetchPLData(false);
        
        if (forceReloadPLData) {
          forceReloadPLData(selectedDivision);
        }
      } else {
        message.error(response1.data.error || response2.data.error || 'Failed to save');
      }
    } catch (error) {
      console.error('Error saving:', error);
      message.error('Failed to save Forecast P&L');
    } finally {
      setSaving(false);
    }
  };
  
  // Export to Excel
  const [exporting, setExporting] = useState(false);
  
  const handleExportExcel = async () => {
    if (!selectedDivision || !selectedBaseYear) {
      message.warning('Please select a division and base year first');
      return;
    }
    
    if (!plData) {
      message.warning('No data to export');
      return;
    }
    
    setExporting(true);
    try {
      // Build forecast year totals with edited values
      const buildForecastYearTotals = (year) => {
        const totals = {};
        const inputKeys = ['sales', 'sales_volume_kg', 'material', 'morm', 'labour', 'depreciation', 
          'electricity', 'others_mfg_overheads', 'selling_expenses', 
          'transportation', 'admin_mgmt_fee_total', 
          'bank_interest', 'bank_charges', 'rd_preproduction', 'stock_provision_adj', 
          'bad_debts', 'other_income', 'other_provision'];
        
        inputKeys.forEach(key => {
          totals[key] = getForecastDisplayValue(year, key);
        });
        
        // Add calculated fields
        totals.cost_of_sales = getForecastDisplayValue(year, 'cost_of_sales');
        totals.gross_profit = getForecastDisplayValue(year, 'gross_profit');
        totals.gross_profit_before_depn = getForecastDisplayValue(year, 'gross_profit_before_depn');
        totals.net_profit = getForecastDisplayValue(year, 'net_profit');
        totals.ebit = getForecastDisplayValue(year, 'ebit');
        totals.ebitda = getForecastDisplayValue(year, 'ebitda');
        totals.actual_direct_cost = getForecastDisplayValue(year, 'actual_direct_cost');
        totals.dir_cost_goods_sold = getForecastDisplayValue(year, 'dir_cost_goods_sold');
        totals.total_below_gp_expenses = getForecastDisplayValue(year, 'total_below_gp_expenses');
        totals.total_finance_cost = getForecastDisplayValue(year, 'total_finance_cost');
        
        return totals;
      };
      
      const response = await axios.post(
        '/api/aebf/export-forecast-pl-excel',
        { 
          division: selectedDivision, 
          baseYear: selectedBaseYear,
          // ALWAYS send frontend values - ensures Excel matches screen exactly
          forecastYearTotals1: buildForecastYearTotals(plData.forecastYear1),
          forecastYearTotals2: buildForecastYearTotals(plData.forecastYear2),
          materialVariancePct1: materialVariancePct1,
          materialVariancePct2: materialVariancePct2,
          // Always true so server uses frontend values (Excel must match screen)
          hasEdits: true
        },
        { responseType: 'blob' }
      );
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Get filename from response headers or generate one
      const contentDisposition = response.headers['content-disposition'];
      let filename = `FORECAST_PL_${selectedDivision}_${selectedBaseYear}.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      message.success('Excel exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      message.error('Failed to export Excel');
    } finally {
      setExporting(false);
    }
  };
  
  // Derived values
  const actualYear = selectedBaseYear;
  const budgetYear = selectedBaseYear ? selectedBaseYear + 1 : null;
  const forecastYear1 = plData?.forecastYear1 || (selectedBaseYear ? selectedBaseYear + 2 : null);
  const forecastYear2 = plData?.forecastYear2 || (selectedBaseYear ? selectedBaseYear + 3 : null);
  // Convert status to proper case (ACTUAL → Actual, ESTIMATE → Estimate)
  const rawStatus = yearMetadata[selectedBaseYear]?.status || 'ESTIMATE';
  const baseStatus = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase();
  const lineItems = plData?.lineItems || [];
  const actualYearTotals = plData?.actualYearTotals || {};
  const budgetYearTotals = plData?.budgetYearTotals || {};
  
  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      {/* CSS */}
      <style>{`
        .forecast-pl-header-select .ant-select-selector {
          text-align: center !important;
        }
        .forecast-pl-header-select .ant-select-selection-item {
          text-align: center !important;
          padding-right: 18px !important;
        }
        .forecast-pl-input-center input,
        .forecast-pl-input-center .ant-input-number-input {
          text-align: center !important;
          font-weight: 500 !important;
        }
      `}</style>
      
      {/* Header: Filters + Actions */}
      <div style={{ marginBottom: '8px', padding: '12px 16px', background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
        <Spin spinning={yearsLoading}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
            {/* Base Year Dropdown */}
            <div style={{ flex: '0 0 200px' }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '12px', textAlign: 'center' }}>Base Year (Actual)</label>
              <Select
                placeholder="Select base year"
                value={selectedBaseYear}
                onChange={handleBaseYearChange}
                style={{ width: '100%' }}
                size="middle"
                showSearch
                optionFilterProp="label"
                options={availableYears.map((year) => {
                  const meta = yearMetadata[year];
                  const status = meta?.status || 'ESTIMATE';
                  return { label: `FY ${year} (${status})`, value: year };
                })}
                disabled={!selectedDivision || availableYears.length === 0}
                popupMatchSelectWidth={false}
                className="forecast-pl-header-select"
              />
            </div>
            
            {/* Budget Year */}
            <div style={{ flex: '0 0 120px' }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '12px', textAlign: 'center' }}>Budget Year</label>
              <div style={{ 
                padding: '0 11px', background: '#FFFFB8', borderRadius: '6px',
                border: '1px solid #d4b106', height: '32px', lineHeight: '30px',
                textAlign: 'center', fontSize: '14px', boxSizing: 'border-box'
              }}>
                {selectedBaseYear ? selectedBaseYear + 1 : '—'}
              </div>
            </div>
            
            {/* Forecast Years */}
            <div style={{ flex: '0 0 160px' }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '12px', textAlign: 'center' }}>Forecast Years</label>
              <div style={{ 
                padding: '0 11px', background: '#d4f7d4', borderRadius: '6px',
                border: '1px solid #52c41a', height: '32px', lineHeight: '30px',
                textAlign: 'center', fontSize: '14px', boxSizing: 'border-box'
              }}>
                {selectedBaseYear ? `${selectedBaseYear + 2} & ${selectedBaseYear + 3}` : '—'}
              </div>
            </div>
            
            {/* Material Variance % for Forecast Year 1 */}
            <div style={{ flex: '0 0 170px' }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '12px', textAlign: 'center', color: '#52c41a' }}>
                Material Var % ({forecastYear1 || 'F1'})
                {materialVariancePct1 !== 0 && (
                  <span style={{ 
                    marginLeft: 6, 
                    padding: '1px 6px', 
                    backgroundColor: '#ff7875', 
                    color: '#fff', 
                    borderRadius: 10, 
                    fontSize: '10px',
                    fontWeight: 500
                  }}>
                    UNSAVED
                  </span>
                )}
              </label>
              <InputNumber
                value={materialVariancePct1}
                onChange={(value) => handleMaterialVarianceChange(
                  plData?.forecastYear1,
                  value || 0,
                  setMaterialVariancePct1
                )}
                step={0.1}
                precision={2}
                min={-100}
                max={100}
                style={{ width: '100%' }}
                size="middle"
                formatter={value => `${value}%`}
                parser={value => value.replace('%', '')}
                disabled={!plData}
                className="forecast-pl-input-center"
              />
            </div>
            
            {/* Material Variance % for Forecast Year 2 */}
            <div style={{ flex: '0 0 170px' }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '12px', textAlign: 'center', color: '#52c41a' }}>
                Material Var % ({forecastYear2 || 'F2'})
                {materialVariancePct2 !== 0 && (
                  <span style={{ 
                    marginLeft: 6, 
                    padding: '1px 6px', 
                    backgroundColor: '#ff7875', 
                    color: '#fff', 
                    borderRadius: 10, 
                    fontSize: '10px',
                    fontWeight: 500
                  }}>
                    UNSAVED
                  </span>
                )}
              </label>
              <InputNumber
                value={materialVariancePct2}
                onChange={(value) => handleMaterialVarianceChange(
                  plData?.forecastYear2,
                  value || 0,
                  setMaterialVariancePct2
                )}
                step={0.1}
                precision={2}
                min={-100}
                max={100}
                style={{ width: '100%' }}
                size="middle"
                formatter={value => `${value}%`}
                parser={value => value.replace('%', '')}
                disabled={!plData}
                className="forecast-pl-input-center"
              />
            </div>
            
            <div style={{ flex: '1' }} />
            
            {/* Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  Modal.confirm({
                    title: 'Reload Forecast P&L?',
                    content: 'This will recalculate Forecast P&L from forecast sales data with Budget % of Sales. Any edits and material variance will be reset. Continue?',
                    okText: 'Yes, Reload',
                    cancelText: 'Cancel',
                    okType: 'danger',
                    onOk: () => {
                      setEditedForecastValues({});
                      setEditedPctOfSales({});
                      setMaterialVariancePct1(0);
                      setMaterialVariancePct2(0);
                      fetchPLData(true);
                    }
                  });
                }}
                disabled={!selectedBaseYear || loading}
                size="middle"
              >
                Reload from Forecast Sales
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSaveToDatabase}
                disabled={!hasUnsavedChanges || saving}
                loading={saving}
                size="middle"
                style={{ background: hasUnsavedChanges ? '#52c41a' : '#d9d9d9', borderColor: hasUnsavedChanges ? '#52c41a' : '#d9d9d9', color: hasUnsavedChanges ? '#fff' : '#888' }}
              >
                {hasUnsavedChanges ? 'Save Changes (*)' : 'No Changes'}
              </Button>
              <Button
                icon={<DownloadOutlined />}
                onClick={handleExportExcel}
                disabled={!selectedBaseYear || !plData || exporting}
                loading={exporting}
                size="middle"
                style={{ background: '#1890ff', borderColor: '#1890ff', color: '#fff' }}
              >
                Export Excel
              </Button>
            </div>
          </div>
        </Spin>
      </div>
      
      {/* No data message */}
      {!selectedBaseYear && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
          {availableYears.length === 0 
            ? 'No actual data found. Please ensure actual sales data exists.'
            : 'Please select a Base Year to view P&L simulation.'}
        </div>
      )}
      
      {/* P&L Table */}
      {selectedBaseYear && (
        <Spin spinning={loading} style={{ width: '100%', display: 'block' }}>
          <div style={{ width: '100%', height: 'calc(100vh - 220px)', overflowX: 'auto', overflowY: 'auto' }}>
            {/* Legend */}
            <div style={{ 
              padding: '10px 16px', background: '#fff', borderBottom: '1px solid #e8e8e8',
            }}>
              <Space size="large">
                <span>
                  <span style={{ display: 'inline-block', width: 16, height: 16, backgroundColor: '#e6f4ff', border: '1px solid #99c8ff', marginRight: 8 }} />
                  FY {actualYear} ({baseStatus})
                </span>
                <span>
                  <span style={{ display: 'inline-block', width: 16, height: 16, backgroundColor: '#FFFFB8', border: '1px solid #d4b106', marginRight: 8 }} />
                  FY {budgetYear} (Budget)
                </span>
                <span>
                  <span style={{ display: 'inline-block', width: 16, height: 16, backgroundColor: '#d4f7d4', border: '1px solid #52c41a', marginRight: 8 }} />
                  FY {forecastYear1} & {forecastYear2} (Forecast - Editable)
                </span>
              </Space>
            </div>
            
            <table className="no-scroll" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '14px', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '18%' }} />
                {/* Actual: Value + % */}
                <col style={{ width: '11%' }} />
                <col style={{ width: '7%' }} />
                {/* Budget: Value + % */}
                <col style={{ width: '11%' }} />
                <col style={{ width: '7%' }} />
                {/* Forecast 1: Value + % */}
                <col style={{ width: '12%' }} />
                <col style={{ width: '8%' }} />
                {/* Forecast 2: Value + % */}
                <col style={{ width: '12%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{
                    backgroundColor: '#1677ff', color: '#fff', padding: '10px 12px',
                    border: '1px solid #fff', position: 'sticky', left: 0, zIndex: 100,
                    textAlign: 'left', fontSize: '14px', fontWeight: 700
                  }}>
                    P&L Ledgers
                  </th>
                  {/* Actual */}
                  <th colSpan={2} style={{
                    backgroundColor: '#1890ff', color: '#fff', padding: '8px 6px',
                    border: '1px solid #fff', textAlign: 'center', fontWeight: 700, fontSize: '13px', lineHeight: '1.3'
                  }}>
                    FY {actualYear}<br /><span style={{ fontSize: '11px', fontWeight: 500 }}>({baseStatus})</span>
                  </th>
                  {/* Budget */}
                  <th colSpan={2} style={{
                    backgroundColor: '#d4b106', color: '#000', padding: '8px 6px',
                    border: '1px solid #fff', textAlign: 'center', fontWeight: 700, fontSize: '13px', lineHeight: '1.3'
                  }}>
                    FY {budgetYear}<br /><span style={{ fontSize: '11px', fontWeight: 500 }}>(Budget)</span>
                  </th>
                  {/* Forecast 1 */}
                  <th colSpan={2} style={{
                    backgroundColor: '#52c41a', color: '#fff', padding: '8px 6px',
                    border: '1px solid #fff', textAlign: 'center', fontWeight: 700, fontSize: '13px', lineHeight: '1.3'
                  }}>
                    FY {forecastYear1}<br /><span style={{ fontSize: '11px', fontWeight: 500 }}>(Forecast)</span>
                  </th>
                  {/* Forecast 2 */}
                  <th colSpan={2} style={{
                    backgroundColor: '#389e0d', color: '#fff', padding: '8px 6px',
                    border: '1px solid #fff', textAlign: 'center', fontWeight: 700, fontSize: '13px', lineHeight: '1.3'
                  }}>
                    FY {forecastYear2}<br /><span style={{ fontSize: '11px', fontWeight: 500 }}>(Forecast)</span>
                  </th>
                </tr>
                {/* Sub-header row for Value and % */}
                <tr>
                  <th style={{
                    backgroundColor: '#1677ff', color: '#fff', padding: '6px 12px',
                    border: '1px solid #fff', position: 'sticky', left: 0, zIndex: 100,
                    textAlign: 'left', fontSize: '11px', fontWeight: 600
                  }}></th>
                  {/* Actual sub */}
                  <th style={{ backgroundColor: '#40a9ff', color: '#fff', padding: '5px 4px', border: '1px solid #fff', textAlign: 'center', fontSize: '11px', fontWeight: 600 }}>Value</th>
                  <th style={{ backgroundColor: '#40a9ff', color: '#fff', padding: '5px 4px', border: '1px solid #fff', textAlign: 'center', fontSize: '11px', fontWeight: 600 }}>%Sls</th>
                  {/* Budget sub */}
                  <th style={{ backgroundColor: '#fadb14', color: '#000', padding: '5px 4px', border: '1px solid #fff', textAlign: 'center', fontSize: '11px', fontWeight: 600 }}>Value</th>
                  <th style={{ backgroundColor: '#fadb14', color: '#000', padding: '5px 4px', border: '1px solid #fff', textAlign: 'center', fontSize: '11px', fontWeight: 600 }}>%Sls</th>
                  {/* Forecast 1 sub */}
                  <th style={{ backgroundColor: '#73d13d', color: '#fff', padding: '5px 4px', border: '1px solid #fff', textAlign: 'center', fontSize: '11px', fontWeight: 600 }}>Value</th>
                  <th style={{ backgroundColor: '#73d13d', color: '#fff', padding: '5px 4px', border: '1px solid #fff', textAlign: 'center', fontSize: '11px', fontWeight: 600 }}>%Sls</th>
                  {/* Forecast 2 sub */}
                  <th style={{ backgroundColor: '#52c41a', color: '#fff', padding: '5px 4px', border: '1px solid #fff', textAlign: 'center', fontSize: '11px', fontWeight: 600 }}>Value</th>
                  <th style={{ backgroundColor: '#52c41a', color: '#fff', padding: '5px 4px', border: '1px solid #fff', textAlign: 'center', fontSize: '11px', fontWeight: 600 }}>%Sls</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item) => {
                  const isCalculated = item.source === 'calculated';
                  const isPct = item.isPct;
                  const isPerKg = item.isPerKg;
                  const isVolume = item.key.includes('volume');
                  
                  if (item.isHidden) return null;
                  
                  // Get values
                  const actualValue = actualYearTotals[item.key] || 0;
                  const budgetValue = budgetYearTotals[item.key] || 0;
                  const forecastValue1 = getForecastDisplayValue(forecastYear1, item.key);
                  const forecastValue2 = getForecastDisplayValue(forecastYear2, item.key);
                  
                  // Sales for % calculation
                  const actualSales = actualYearTotals.sales || 0;
                  const budgetSales = budgetYearTotals.sales || 0;
                  const fcst1Sales = getForecastValue(forecastYear1, 'sales');
                  const fcst2Sales = getForecastValue(forecastYear2, 'sales');
                  
                  // Get % of sales
                  // For items that ARE already percentages (like direct_cost_pct_of_cogs), %Sls is N/A
                  const skipPctOfSales = isPct;
                  const actualPct = skipPctOfSales ? null : (actualSales > 0 ? (actualValue / actualSales) * 100 : 0);
                  const budgetPct = skipPctOfSales ? null : (budgetSales > 0 ? (budgetValue / budgetSales) * 100 : 0);
                  const fcst1Pct = skipPctOfSales ? null : getPctOfSales(item.key, 'forecast', forecastYear1, fcst1Sales);
                  const fcst2Pct = skipPctOfSales ? null : getPctOfSales(item.key, 'forecast', forecastYear2, fcst2Sales);
                  
                  // Can edit?
                  const canEditPct = PCT_OF_SALES_ITEMS.includes(item.key);
                  const canEditValue = canEditPct; // Same items can be edited by value too
                  const isFromForecastSales = ['sales', 'sales_volume_kg', 'material', 'morm'].includes(item.key);
                  
                  // Check if edited
                  const editKey1 = `${forecastYear1}_${item.key}`;
                  const editKey2 = `${forecastYear2}_${item.key}`;
                  const isEdited1 = editedForecastValues.hasOwnProperty(editKey1) || editedPctOfSales.hasOwnProperty(editKey1);
                  const isEdited2 = editedForecastValues.hasOwnProperty(editKey2) || editedPctOfSales.hasOwnProperty(editKey2);
                  
                  // Format
                  const format = (val) => {
                    if (isPct) return formatNumber(val, true, false);
                    if (isPerKg) return formatNumber(val, false, true);
                    if (isVolume) return formatVolume(val);
                    return formatNumber(val);
                  };
                  
                  const formatPct = (pct) => {
                    if (item.key === 'sales') return '100%';
                    if (pct === null) return '—'; // For items that don't have %Sls (like direct_cost_pct_of_cogs which IS already a %)
                    if (pct === 0 || isNaN(pct)) return '—';
                    return pct.toFixed(2) + '%';
                  };
                  
                  return (
                    <tr key={item.key}>
                      {/* Ledger Name - Left aligned */}
                      <td style={{ 
                        padding: '8px 12px', border: '1px solid #ddd', backgroundColor: '#fff',
                        position: 'sticky', left: 0, zIndex: 5, fontWeight: 600, fontSize: '13px', textAlign: 'left'
                      }}>
                        {item.label}
                      </td>
                      
                      {/* Actual Value */}
                      <td style={{ 
                        padding: '6px 10px', border: '1px solid #ddd',
                        backgroundColor: '#e6f4ff',
                        textAlign: 'center', fontWeight: 500, fontSize: '13px'
                      }}>
                        {format(actualValue)}
                      </td>
                      {/* Actual % */}
                      <td style={{ 
                        padding: '6px 6px', border: '1px solid #ddd', backgroundColor: '#e6f4ff',
                        textAlign: 'center', fontSize: '12px'
                      }}>
                        {formatPct(actualPct)}
                      </td>
                      
                      {/* Budget Value */}
                      <td style={{ 
                        padding: '6px 10px', border: '1px solid #ddd',
                        backgroundColor: '#FFFFB8',
                        textAlign: 'center', fontWeight: 500, fontSize: '13px'
                      }}>
                        {format(budgetValue)}
                      </td>
                      {/* Budget % */}
                      <td style={{ 
                        padding: '6px 6px', border: '1px solid #ddd', backgroundColor: '#FFFFB8',
                        textAlign: 'center', fontSize: '12px'
                      }}>
                        {formatPct(budgetPct)}
                      </td>
                      
                      {/* Forecast 1 Value - Editable */}
                      <td style={{ 
                        padding: canEditValue && !isFromForecastSales ? '2px' : '6px 10px',
                        border: '1px solid #ddd',
                        backgroundColor: isEdited1 ? '#b7eb8f' : '#d4f7d4',
                        textAlign: 'center', fontWeight: 500, fontSize: '13px'
                      }}>
                        {canEditValue && !isFromForecastSales ? (
                          <InputNumber
                            value={Math.round(forecastValue1)}
                            onChange={(val) => handleForecastValueEdit(forecastYear1, item.key, Math.round(val) || 0)}
                            size="middle"
                            className="forecast-pl-input-center"
                            style={{ width: '100%', fontSize: '13px' }}
                            formatter={(val) => val ? Math.round(Number(val)).toLocaleString() : ''}
                            parser={(val) => Math.round(Number(val?.replace(/,/g, '') || 0))}
                            precision={0}
                            controls={false}
                          />
                        ) : format(forecastValue1)}
                      </td>
                      {/* Forecast 1 % - Editable */}
                      <td style={{ 
                        padding: canEditPct && !isFromForecastSales ? '2px' : '6px 6px', 
                        border: '1px solid #ddd',
                        backgroundColor: isEdited1 ? '#b7eb8f' : '#d4f7d4',
                        textAlign: 'center', fontSize: '12px'
                      }}>
                        {canEditPct && !isFromForecastSales ? (
                          <InputNumber
                            value={parseFloat(fcst1Pct.toFixed(3))}
                            onChange={(val) => handlePctOfSalesEdit(forecastYear1, item.key, val || 0)}
                            size="middle"
                            className="forecast-pl-input-center"
                            style={{ width: '100%', fontSize: '12px' }}
                            precision={3}
                            step={0.1}
                            controls={false}
                            formatter={(val) => val ? `${val}%` : ''}
                            parser={(val) => val?.replace('%', '')}
                          />
                        ) : formatPct(fcst1Pct)}
                      </td>
                      
                      {/* Forecast 2 Value - Editable */}
                      <td style={{ 
                        padding: canEditValue && !isFromForecastSales ? '2px' : '6px 10px',
                        border: '1px solid #ddd',
                        backgroundColor: isEdited2 ? '#95de64' : '#b7eb8f',
                        textAlign: 'center', fontWeight: 500, fontSize: '13px'
                      }}>
                        {canEditValue && !isFromForecastSales ? (
                          <InputNumber
                            value={Math.round(forecastValue2)}
                            onChange={(val) => handleForecastValueEdit(forecastYear2, item.key, Math.round(val) || 0)}
                            size="middle"
                            className="forecast-pl-input-center"
                            style={{ width: '100%', fontSize: '13px' }}
                            formatter={(val) => val ? Math.round(Number(val)).toLocaleString() : ''}
                            parser={(val) => Math.round(Number(val?.replace(/,/g, '') || 0))}
                            precision={0}
                            controls={false}
                          />
                        ) : format(forecastValue2)}
                      </td>
                      {/* Forecast 2 % - Editable */}
                      <td style={{ 
                        padding: canEditPct && !isFromForecastSales ? '2px' : '6px 6px',
                        border: '1px solid #ddd',
                        backgroundColor: isEdited2 ? '#95de64' : '#b7eb8f',
                        textAlign: 'center', fontSize: '12px'
                      }}>
                        {canEditPct && !isFromForecastSales ? (
                          <InputNumber
                            value={parseFloat(fcst2Pct.toFixed(3))}
                            onChange={(val) => handlePctOfSalesEdit(forecastYear2, item.key, val || 0)}
                            size="middle"
                            className="forecast-pl-input-center"
                            style={{ width: '100%', fontSize: '12px' }}
                            precision={3}
                            step={0.1}
                            controls={false}
                            formatter={(val) => val ? `${val}%` : ''}
                            parser={(val) => val?.replace('%', '')}
                          />
                        ) : formatPct(fcst2Pct)}
                      </td>
                    </tr>
                  );
                })}
                
                {lineItems.length === 0 && !loading && (
                  <tr>
                    <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                      No P&L data available. Make sure there is forecast sales data and actual/budget P&L data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Spin>
      )}
    </div>
  );
};

export default ForecastPLTab;
