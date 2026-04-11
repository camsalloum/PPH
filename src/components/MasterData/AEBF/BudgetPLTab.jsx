/**
 * BudgetPLTab Component
 * 
 * Displays P&L Budget simulation based on divisional product group budget.
 * Same visual pattern as Divisional Product Group table - monthly columns with
 * Actual (blue) and Budget (yellow) rows for each P&L ledger.
 * 
 * Data Sources:
 * - Actual P&L: From {division}_pl_data table (e.g., fp_pl_data)
 * - Budget P&L: Calculated from divisional budget (Sales, Volume, MoRM)
 *   with other lines calculated as % of actual sales applied to budget sales
 * 
 * Features:
 * - Export Excel for editing % of Sales values
 * - Import HTML (future)
 * - Submit Final to save to database
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Select, Button, Spin, Space, Upload, message, Modal, InputNumber } from 'antd';
import { 
  UploadOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
  FileExcelOutlined,
  UndoOutlined,
  WarningOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { usePLData } from '../../../contexts/PLDataContext';

// Format number for display - no decimals, no K/M abbreviation
const formatNumber = (num, isPct = false, isPerKg = false) => {
  if (num === null || num === undefined || isNaN(num)) return '—';
  if (isPct) return num.toFixed(2) + '%';  // Show 2 decimal places for percentages
  if (isPerKg) return Math.round(num);
  return Math.round(num).toLocaleString('en-US');
};

// Format for Volume (kg) - no decimals, no K/M abbreviation
const formatVolume = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '—';
  return Math.round(num).toLocaleString('en-US');
};

const BudgetPLTab = ({ selectedDivision, isActive }) => {
  // Get PLDataContext forceReload to invalidate cache after saving
  const { forceReload: forceReloadPLData } = usePLData();
  
  // State
  const [budgetYears, setBudgetYears] = useState([]);
  const [selectedBudgetYear, setSelectedBudgetYear] = useState(null);
  const [loading, setLoading] = useState(false);
  const [yearsLoading, setYearsLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // P&L Data
  const [plData, setPlData] = useState(null);
  
  // Editable budget values - keyed by `${month}-${key}`
  const [editedBudgetValues, setEditedBudgetValues] = useState({});
  
  // Editable % of Sales values - keyed by ledger key
  const [editedPctOfSales, setEditedPctOfSales] = useState({});
  
  // Material Variance % - adjusts all material costs
  // Material = (Sales - MoRM) × (1 + materialVariancePct/100)
  const [materialVariancePct, setMaterialVariancePct] = useState(0);
  
  // Default/initial variance calculated from actual data - used to detect unsaved changes
  const [defaultMaterialVariancePct, setDefaultMaterialVariancePct] = useState(0);
  
  // Track initial edited values after load (to compare for unsaved changes)
  const [initialEditedValues, setInitialEditedValues] = useState({});
  
  // Track if Budget data exists in database (to enable initial save)
  const [hasSavedBudgetData, setHasSavedBudgetData] = useState(false);
  
  // Fetch available budget years
  const fetchBudgetYears = useCallback(async () => {
    if (!selectedDivision) return;
    
    setYearsLoading(true);
    try {
      const response = await axios.get(`/api/aebf/budget-pl-years/${selectedDivision}`);
      if (response.data.success) {
        setBudgetYears(response.data.data.years || []);
        // Auto-select first year if available
        if (response.data.data.years?.length > 0 && !selectedBudgetYear) {
          setSelectedBudgetYear(response.data.data.years[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching budget years:', error);
      message.error('Failed to load budget years');
    } finally {
      setYearsLoading(false);
    }
  }, [selectedDivision, selectedBudgetYear]);
  
  // Fetch P&L data
  const fetchPLData = useCallback(async (forceRecalculate = false) => {
    if (!selectedDivision || !selectedBudgetYear) return;
    
    setLoading(true);
    try {
      const response = await axios.post('/api/aebf/budget-pl-data', {
        division: selectedDivision,
        budgetYear: selectedBudgetYear,
        forceRecalculate: forceRecalculate  // Force recalculation from divisional budget
      });
      
      if (response.data.success) {
        const data = response.data.data;
        setPlData(data);
        
        // Track if Budget data exists in database
        setHasSavedBudgetData(data.hasSavedBudgetData || false);
        
        // Material Variance % - restore from database if saved, otherwise 0
        const savedVariance = parseFloat(data.savedMaterialVariancePct) || 0;
        setMaterialVariancePct(savedVariance);
        setDefaultMaterialVariancePct(savedVariance);
        
        // No initial edits - use budget values as-is
        setEditedBudgetValues({});
        setInitialEditedValues({});
        setEditedPctOfSales({});
      }
    } catch (error) {
      console.error('Error fetching P&L data:', error);
      message.error('Failed to load P&L data');
    } finally {
      setLoading(false);
    }
  }, [selectedDivision, selectedBudgetYear]);
  
  // Effects
  useEffect(() => {
    if (selectedDivision) {
      fetchBudgetYears();
    }
  }, [selectedDivision, fetchBudgetYears]);
  
  useEffect(() => {
    if (selectedBudgetYear) {
      fetchPLData();
    }
  }, [selectedBudgetYear, fetchPLData]);

  // Re-fetch when tab becomes active (to get fresh data after changes in other tabs)
  useEffect(() => {
    if (isActive && selectedBudgetYear) {
      fetchPLData();
    }
  }, [isActive, selectedBudgetYear, fetchPLData]);
  
  // Warn user before leaving page with unsaved changes
  useEffect(() => {
    const hasVarianceChange = materialVariancePct !== defaultMaterialVariancePct;
    const hasEdits = Object.keys(editedBudgetValues).length > 0 || Object.keys(editedPctOfSales).length > 0;
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
  }, [materialVariancePct, defaultMaterialVariancePct, editedBudgetValues, editedPctOfSales]);
  
  // Export Excel
  const handleExportExcel = async () => {
    if (!plData) return;
    
    setExporting(true);
    try {
      // Merge edited values (including Material Variance adjustments) into budgetByMonth
      const mergedBudgetByMonth = {};
      for (let m = 1; m <= 12; m++) {
        mergedBudgetByMonth[m] = { ...plData.budgetByMonth[m] };
        // Apply any edited values for this month
        Object.keys(editedBudgetValues).forEach(key => {
          const [monthStr, field] = key.split('-');
          if (parseInt(monthStr) === m) {
            mergedBudgetByMonth[m][field] = editedBudgetValues[key];
          }
        });
      }
      
      // Recalculate year totals based on merged monthly values
      const mergedBudgetYearTotals = {};
      const allKeys = Object.keys(mergedBudgetByMonth[1] || {});
      allKeys.forEach(key => {
        mergedBudgetYearTotals[key] = Object.values(mergedBudgetByMonth).reduce((sum, m) => sum + (m?.[key] || 0), 0);
      });
      
      const response = await axios.post('/api/aebf/export-budget-pl-excel', {
        division: selectedDivision,
        budgetYear: selectedBudgetYear,
        actualYear: plData.actualYear,
        lineItems: plData.lineItems,
        actualByMonth: plData.actualByMonth,
        actualYearTotals: plData.actualYearTotals,
        budgetByMonth: mergedBudgetByMonth,
        budgetYearTotals: mergedBudgetYearTotals,
        materialVariancePct: materialVariancePct  // Send variance for reference
      }, {
        responseType: 'blob'
      });
      
      // Download the file
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const filename = response.headers['content-disposition']?.split('filename="')[1]?.split('"')[0] 
        || `BUDGET_PL_${selectedDivision}_${selectedBudgetYear}.xlsx`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      message.success('Budget P&L Excel exported successfully');
    } catch (error) {
      console.error('Error exporting Excel:', error);
      message.error('Failed to export Budget P&L to Excel');
    } finally {
      setExporting(false);
    }
  };
  
  // Import Excel - uploads file and updates budget values
  const [importing, setImporting] = useState(false);
  
  const handleImportExcel = async (fileInfo) => {
    // Get actual file object (from onChange, it might be wrapped)
    const file = fileInfo.originFileObj || fileInfo;
    
    if (!plData) {
      message.error('Please load data first before importing');
      return;
    }
    
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('division', selectedDivision);
      formData.append('budgetYear', selectedBudgetYear);
      
      
      const response = await axios.post('/api/aebf/import-budget-pl-excel', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data.success) {
        const { budgetByMonth: importedBudget } = response.data.data;
        
        
        // Update the edited values with imported data (Amount values directly)
        const newEditedValues = {};
        let importedCount = 0;
        for (let month = 1; month <= 12; month++) {
          const monthData = importedBudget[month];
          if (monthData) {
            Object.keys(monthData).forEach(key => {
              newEditedValues[`${month}-${key}`] = monthData[key];
              importedCount++;
            });
          }
        }
        
        // Update state with imported values
        setEditedBudgetValues(newEditedValues);
        
        // Clear % of sales edits since we imported actual values
        setEditedPctOfSales({});
        
        // Reset Material Variance % to 0 - imported values are used directly
        setMaterialVariancePct(0);
        
        // Show success notification
        Modal.success({
          title: 'Excel Imported Successfully!',
          content: `Imported ${importedCount} values from Excel. Material Variance % has been reset to 0. Review the changes in the table and click "Save to Database" to persist.`,
          okText: 'OK'
        });
      } else {
        message.error(response.data.error || 'Failed to import Excel');
      }
    } catch (error) {
      console.error('Error importing Excel:', error);
      Modal.error({
        title: 'Import Failed',
        content: 'Failed to import Budget P&L from Excel: ' + (error.response?.data?.error || error.message)
      });
    } finally {
      setImporting(false);
    }
  };
  
  // Items that should be recalculated when sales changes (they're based on % of sales)
  // 'morm' (Margin over Material) is now included - Material = Sales - MoRM
  // Note: dir_cost_stock_adj is EXCLUDED - it's always 0 (its % is used for Material Variance)
  const PCT_OF_SALES_ITEMS = ['morm', 'labour', 'depreciation', 'electricity', 'others_mfg_overheads', 
    'selling_expenses', 'transportation', 'admin_mgmt_fee_total', 
    'bank_interest', 'bank_charges', 'rd_preproduction', 'stock_provision_adj', 'bad_debts', 'other_income', 'other_provision'];

  // Get budget's own % of Sales from plData (calculated by backend from saved budget values)
  const budgetPctOfSales = plData?.budgetPctOfSales || {};

  // Handle budget value edit - also recalculates % of Sales
  // IMPORTANT: When saved budget exists, use budget's own % ratios (not Actual year %)
  const handleBudgetEdit = (month, key, value) => {
    const editKey = `${month}-${key}`;
    
    // Update the single month value
    setEditedBudgetValues(prev => {
      const newValues = {
        ...prev,
        [editKey]: value
      };
      
      // If editing Sales, also recalculate all dependent items for this month
      if (key === 'sales') {
        const salesValue = value || 0;
        
        // Recalculate all pct_of_sales items (including morm)
        // Use BUDGET's own % if saved budget exists, otherwise use Actual year %
        PCT_OF_SALES_ITEMS.forEach(itemKey => {
          let pctOfSales;
          if (hasSavedBudgetData && budgetPctOfSales[itemKey] !== undefined) {
            // Use budget's own ratio (preserves saved proportions)
            pctOfSales = budgetPctOfSales[itemKey] / 100; // budgetPctOfSales is in % (0-100)
          } else {
            // No saved budget - use Actual year ratio
            const actualSales = actualYearTotals?.sales || 0;
            const actualValue = actualYearTotals?.[itemKey] || 0;
            pctOfSales = actualSales > 0 ? (actualValue / actualSales) : 0;
          }
          
          // Calculate new value based on new sales (if sales is 0, value is 0)
          const newItemValue = salesValue > 0 ? Math.round(salesValue * pctOfSales) : 0;
          const itemEditKey = `${month}-${itemKey}`;
          newValues[itemEditKey] = newItemValue;
        });
        
        // After morm is recalculated, calculate Material = (Sales - MoRM) × (1 + variance%)
        const mormKey = `${month}-morm`;
        const mormValue = newValues[mormKey] || 0;
        const baseMaterial = salesValue - mormValue;
        newValues[`${month}-material`] = Math.round(baseMaterial * (1 + materialVariancePct / 100));
      }
      
      // If editing MoRM, recalculate Material = (Sales - MoRM) × (1 + variance%)
      if (key === 'morm') {
        const salesKey = `${month}-sales`;
        const salesValue = newValues.hasOwnProperty(salesKey) 
          ? (newValues[salesKey] || 0) 
          : (budgetByMonth[month]?.sales || 0);
        const baseMaterial = salesValue - (value || 0);
        newValues[`${month}-material`] = Math.round(baseMaterial * (1 + materialVariancePct / 100));
      }
      
      // Recalculate total for this key with the new value
      let newTotal = 0;
      for (let m = 1; m <= 12; m++) {
        const mKey = `${m}-${key}`;
        if (m === month) {
          newTotal += value || 0;
        } else if (newValues.hasOwnProperty(mKey)) {
          newTotal += newValues[mKey] || 0;
        } else {
          newTotal += budgetByMonth[m]?.[key] || 0;
        }
      }
      
      // Calculate new % of Sales based on new total (use updated sales if available)
      let budgetSalesTotal = 0;
      for (let m = 1; m <= 12; m++) {
        const salesKey = `${m}-sales`;
        if (newValues.hasOwnProperty(salesKey)) {
          budgetSalesTotal += newValues[salesKey] || 0;
        } else {
          budgetSalesTotal += budgetByMonth[m]?.sales || 0;
        }
      }
      
      if (budgetSalesTotal > 0) {
        const newPct = (newTotal / budgetSalesTotal) * 100;
        // Update the % of Sales state
        setEditedPctOfSales(prevPct => ({
          ...prevPct,
          [key]: newPct
        }));
      } else if (key !== 'sales') {
        // If total sales is 0, set % to 0
        setEditedPctOfSales(prevPct => ({
          ...prevPct,
          [key]: 0
        }));
      }
      
      return newValues;
    });
  };
  
  // Get raw edited or original value (without calculations)
  const getRawBudgetValue = (month, key) => {
    // dir_cost_stock_adj is always 0 in budget (its % is used for Material Variance)
    if (key === 'dir_cost_stock_adj') {
      return 0;
    }
    const editKey = `${month}-${key}`;
    if (editedBudgetValues.hasOwnProperty(editKey)) {
      return editedBudgetValues[editKey];
    }
    return budgetByMonth[month]?.[key] || 0;
  };
  
  // Get budget value (edited or original), with calculated fields derived from inputs
  const getBudgetDisplayValue = (month, key) => {
    // dir_cost_stock_adj is always 0 in budget (its % is used for Material Variance)
    if (key === 'dir_cost_stock_adj') {
      return 0;
    }
    
    // For input fields, return edited or original
    // These are the items that have actual values in budgetByMonth (not calculated)
    const inputKeys = ['sales', 'sales_volume_kg', 'material', 'morm', 'labour', 'depreciation', 
      'electricity', 'others_mfg_overheads', 'selling_expenses', 
      'transportation', 'admin_mgmt_fee_total', 
      'bank_interest', 'bank_charges', 'rd_preproduction', 'stock_provision_adj', 'bad_debts', 'other_income', 'other_provision'];
    
    if (inputKeys.includes(key)) {
      return getRawBudgetValue(month, key);
    }
    
    // Calculate derived fields based on edited values
    const sales = getRawBudgetValue(month, 'sales');
    const material = getRawBudgetValue(month, 'material');
    const labour = getRawBudgetValue(month, 'labour');
    const depreciation = getRawBudgetValue(month, 'depreciation');
    const electricity = getRawBudgetValue(month, 'electricity');
    const others_mfg_overheads = getRawBudgetValue(month, 'others_mfg_overheads');
    const dir_cost_stock_adj = getRawBudgetValue(month, 'dir_cost_stock_adj');
    const selling_expenses = getRawBudgetValue(month, 'selling_expenses');
    const transportation = getRawBudgetValue(month, 'transportation');
    const admin_mgmt_fee_total = getRawBudgetValue(month, 'admin_mgmt_fee_total');
    const bank_interest = getRawBudgetValue(month, 'bank_interest');
    const bank_charges = getRawBudgetValue(month, 'bank_charges');
    const rd_preproduction = getRawBudgetValue(month, 'rd_preproduction');
    const stock_provision_adj = getRawBudgetValue(month, 'stock_provision_adj');
    const bad_debts = getRawBudgetValue(month, 'bad_debts');
    const other_income = getRawBudgetValue(month, 'other_income');
    const other_provision = getRawBudgetValue(month, 'other_provision');
    
    // Calculated fields (matching backend formulas)
    const actual_direct_cost = labour + depreciation + electricity + others_mfg_overheads;
    const dir_cost_goods_sold = actual_direct_cost + dir_cost_stock_adj;
    const cost_of_sales = material + dir_cost_goods_sold;
    const gross_profit = sales - cost_of_sales;
    const gross_profit_before_depn = gross_profit + depreciation;
    
    // Total Below GP Expenses (matches table view formula exactly)
    // Formula: other_income + bad_debts + stock_provision_adj + total_finance_cost + admin_mgmt_fee_total + transportation + selling_expenses + other_provision
    // Note: other_income is stored as NEGATIVE in DB (so adding it reduces expenses)
    const total_finance_cost = bank_interest + bank_charges + rd_preproduction;
    const total_below_gp_expenses = other_income + bad_debts + stock_provision_adj + 
                                     total_finance_cost + admin_mgmt_fee_total + 
                                     transportation + selling_expenses + other_provision;
    
    // Net Profit, EBIT, EBITDA (matches backend)
    const net_profit = gross_profit - total_below_gp_expenses;
    const ebit = net_profit + bank_interest;
    const ebitda = net_profit + depreciation + bank_interest + rd_preproduction + other_provision;
    
    // Total Expenses
    const total_expenses = actual_direct_cost + total_below_gp_expenses;
    
    // Direct cost % of COGS
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
      default: return getRawBudgetValue(month, key);
    }
  };
  
  // Check if there are unsaved changes (compare current state to initial loaded state)
  // Also true if Budget has never been saved (allow initial save)
  const hasUnsavedChanges = (() => {
    // If plData exists but no Budget saved yet, allow saving initial budget
    if (plData && !hasSavedBudgetData) return true;
    
    // Check if % of Sales has been edited
    if (Object.keys(editedPctOfSales).length > 0) return true;
    
    // Check if variance has changed from default
    if (materialVariancePct !== defaultMaterialVariancePct) return true;
    
    // Check if edited values differ from initial values
    const currentKeys = Object.keys(editedBudgetValues);
    const initialKeys = Object.keys(initialEditedValues);
    
    // Different number of keys = changes
    if (currentKeys.length !== initialKeys.length) return true;
    
    // Check if any values differ
    for (const key of currentKeys) {
      if (editedBudgetValues[key] !== initialEditedValues[key]) return true;
    }
    
    return false;
  })();
  
  // Save to database
  const handleSaveToDatabase = async () => {
    if (!plData || !hasUnsavedChanges) return;
    
    setSaving(true);
    try {
      // Build full budget data for all 12 months (with all edits merged)
      const fullBudgetData = {};
      for (let m = 1; m <= 12; m++) {
        fullBudgetData[m] = {
          sales: getRawBudgetValue(m, 'sales'),
          sales_volume_kg: getRawBudgetValue(m, 'sales_volume_kg'),
          material: getRawBudgetValue(m, 'material'),
          morm: getRawBudgetValue(m, 'morm'),
          labour: getRawBudgetValue(m, 'labour'),
          depreciation: getRawBudgetValue(m, 'depreciation'),
          electricity: getRawBudgetValue(m, 'electricity'),
          others_mfg_overheads: getRawBudgetValue(m, 'others_mfg_overheads'),
          dir_cost_stock_adj: 0,  // Always 0 in budget
          selling_expenses: getRawBudgetValue(m, 'selling_expenses'),
          transportation: getRawBudgetValue(m, 'transportation'),
          admin_mgmt_fee_total: getRawBudgetValue(m, 'admin_mgmt_fee_total'),
          bank_interest: getRawBudgetValue(m, 'bank_interest'),
          bank_charges: getRawBudgetValue(m, 'bank_charges'),
          rd_preproduction: getRawBudgetValue(m, 'rd_preproduction'),
          stock_provision_adj: getRawBudgetValue(m, 'stock_provision_adj'),
          bad_debts: getRawBudgetValue(m, 'bad_debts'),
          other_income: getRawBudgetValue(m, 'other_income'),
          other_provision: getRawBudgetValue(m, 'other_provision')
        };
      }
      
      const response = await axios.post('/api/aebf/save-budget-pl', {
        division: selectedDivision,
        budgetYear: selectedBudgetYear,
        fullBudgetData: fullBudgetData,  // Send full monthly data for persistence
        editedValues: editedBudgetValues,  // Also send for logging
        materialVariancePct: materialVariancePct
      });
      
      if (response.data.success) {
        message.success('Budget P&L saved to database successfully');
        // Mark that budget data now exists in database
        setHasSavedBudgetData(true);
        // Clear edits since they're now persisted - next load will show saved values
        setEditedBudgetValues({});
        setEditedPctOfSales({});
        setInitialEditedValues({});
        setDefaultMaterialVariancePct(materialVariancePct);
        // Refresh to show persisted data (use saved values, not recalculate)
        fetchPLData(false);
        
        // IMPORTANT: Invalidate PLDataContext cache so other components (WriteUp, Dashboard, P&L table)
        // will fetch fresh data including the newly saved Budget
        if (forceReloadPLData) {
          forceReloadPLData(selectedDivision);
        }
      } else {
        message.error(response.data.error || 'Failed to save');
      }
    } catch (error) {
      console.error('Error saving:', error);
      message.error('Failed to save Budget P&L');
    } finally {
      setSaving(false);
    }
  };
  
  // Handle % of Sales edit - recalculates all months for that item
  const handlePctOfSalesEdit = (key, pctValue) => {
    setEditedPctOfSales(prev => ({
      ...prev,
      [key]: pctValue
    }));
    
    // Recalculate all 12 months based on new %
    // Use edited sales value if available, otherwise original
    for (let m = 1; m <= 12; m++) {
      const salesEditKey = `${m}-sales`;
      const monthBudgetSales = editedBudgetValues.hasOwnProperty(salesEditKey) 
        ? (editedBudgetValues[salesEditKey] || 0)
        : (budgetByMonth[m]?.sales || 0);
      
      // If sales is zero, the value should be zero
      const newValue = monthBudgetSales > 0 ? monthBudgetSales * (pctValue / 100) : 0;
      const editKey = `${m}-${key}`;
      setEditedBudgetValues(prev => ({
        ...prev,
        [editKey]: Math.round(newValue)
      }));
    }
  };
  
  // Get % of Sales for an item
  // For Actual row: always use actualYearTotals
  // For Budget row: use budget's own % if saved, otherwise use actual %
  const getPctOfSales = (key, isActual = true) => {
    // Check for user-edited % first (for budget row)
    if (!isActual && editedPctOfSales.hasOwnProperty(key)) {
      return editedPctOfSales[key];
    }
    
    if (isActual) {
      // Actual row - always use actual data
      const actualSales = actualYearTotals?.sales || 0;
      const actualValue = actualYearTotals?.[key] || 0;
      if (actualSales > 0) {
        return (actualValue / actualSales) * 100;
      }
      return 0;
    } else {
      // Budget row - use budget's own % if saved budget exists
      if (hasSavedBudgetData && budgetPctOfSales[key] !== undefined) {
        return budgetPctOfSales[key];
      }
      // No saved budget - fall back to actual %
      const actualSales = actualYearTotals?.sales || 0;
      const actualValue = actualYearTotals?.[key] || 0;
      if (actualSales > 0) {
        return (actualValue / actualSales) * 100;
      }
      return 0;
    }
  };
  
  // Derived values
  const actualYear = plData?.actualYear;
  const lineItems = plData?.lineItems || [];
  const actualByMonth = plData?.actualByMonth || {};
  const actualYearTotals = plData?.actualYearTotals || {};
  const budgetByMonth = plData?.budgetByMonth || {};
  const budgetYearTotals = plData?.budgetYearTotals || {};
  
  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      {/* CSS for input alignment and consistent header styling */}
      <style>{`
        .budget-pl-input-right input {
          text-align: right !important;
        }
        .budget-pl-input-right .ant-input-number-input {
          text-align: right !important;
        }
        .budget-pl-input-center input {
          text-align: center !important;
        }
        .budget-pl-input-center .ant-input-number-input {
          text-align: center !important;
        }
        .budget-pl-header-select .ant-select-selector {
          text-align: center !important;
        }
        .budget-pl-header-select .ant-select-selection-item {
          text-align: center !important;
          padding-right: 18px !important;
        }
      `}</style>
      
      {/* Header: Filters + Actions */}
      <div style={{ marginBottom: '8px', padding: '12px 16px', background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
        <Spin spinning={yearsLoading}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
            {/* Budget Year Dropdown */}
            <div style={{ flex: '0 0 140px' }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '12px', textAlign: 'center' }}>Budget Year</label>
              <Select
                placeholder="Select year"
                value={selectedBudgetYear}
                onChange={setSelectedBudgetYear}
                style={{ width: '100%' }}
                size="middle"
                showSearch
                optionFilterProp="label"
                options={budgetYears.map((year) => ({ label: year?.toString(), value: year }))}
                disabled={!selectedDivision || budgetYears.length === 0}
                popupMatchSelectWidth={false}
                className="budget-pl-header-select"
              />
            </div>
            
            {/* Actual Year (derived) */}
            <div style={{ flex: '0 0 140px' }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '12px', textAlign: 'center' }}>Actual Year</label>
              <div style={{ 
                padding: '0 11px', 
                background: '#f5f5f5', 
                borderRadius: '6px',
                border: '1px solid #d9d9d9',
                height: '32px',
                lineHeight: '30px',
                textAlign: 'center',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}>
                {actualYear || '—'}
              </div>
            </div>
            
            {/* Material Variance % Input */}
            <div style={{ flex: '0 0 170px' }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '12px', textAlign: 'center', color: '#d46b08' }}>
                Material Variance %
                {materialVariancePct !== defaultMaterialVariancePct && (
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
                value={materialVariancePct}
                onChange={(value) => {
                  const newVariance = value || 0;
                  setMaterialVariancePct(newVariance);
                  
                  // Recalculate all monthly Material and MoRM values with new variance
                  // Logic: Material increases/decreases by variance %, MoRM adjusts accordingly
                  // MoRM = Sales - Material, so when Material goes up, MoRM goes down
                  // 
                  // IMPORTANT: We must calculate from the ORIGINAL base material (before any variance)
                  // If data was saved with variance X%, the saved material = baseMaterial * (1 + X/100)
                  // To get original: baseMaterial = savedMaterial / (1 + savedVariance/100)
                  if (budgetByMonth) {
                    setEditedBudgetValues(prev => {
                      const newValues = { ...prev };
                      for (let m = 1; m <= 12; m++) {
                        const salesKey = `${m}-sales`;
                        // Get sales (edited or original)
                        const salesValue = newValues.hasOwnProperty(salesKey) 
                          ? (newValues[salesKey] || 0) 
                          : (budgetByMonth[m]?.sales || 0);
                        
                        // Get the SAVED material value from database
                        const savedMaterial = budgetByMonth[m]?.material || 0;
                        
                        // Reverse the SAVED variance to get original base material
                        // savedMaterial = baseMaterial * (1 + savedVariance/100)
                        // baseMaterial = savedMaterial / (1 + savedVariance/100)
                        const savedVarianceFactor = 1 + defaultMaterialVariancePct / 100;
                        const baseMaterial = savedVarianceFactor !== 0 
                          ? Math.round(savedMaterial / savedVarianceFactor)
                          : savedMaterial;
                        
                        // Apply NEW variance to get adjusted material
                        const adjustedMaterial = Math.round(baseMaterial * (1 + newVariance / 100));
                        
                        // MoRM = Sales - Material (adjusts inversely)
                        const adjustedMorm = salesValue - adjustedMaterial;
                        
                        newValues[`${m}-material`] = adjustedMaterial;
                        newValues[`${m}-morm`] = adjustedMorm;
                      }
                      return newValues;
                    });
                  }
                }}
                step={0.001}
                precision={3}
                min={-100}
                max={100}
                style={{ width: '100%' }}
                size="middle"
                formatter={value => `${value}%`}
                parser={value => value.replace('%', '')}
                disabled={!plData}
                className="budget-pl-input-center"
              />
            </div>
            
            {/* Spacer */}
            <div style={{ flex: '1' }} />
            
            {/* Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* Reload Saved - Only shown when saved budget exists */}
              {hasSavedBudgetData && (
                <Button
                  icon={<UndoOutlined />}
                  onClick={() => {
                    if (hasUnsavedChanges) {
                      Modal.confirm({
                        title: 'Discard unsaved changes?',
                        content: 'This will discard your edits and reload the last saved Budget P&L. Continue?',
                        okText: 'Yes, Reload Saved',
                        cancelText: 'Cancel',
                        okType: 'primary',
                        onOk: () => {
                          setEditedBudgetValues({});
                          setEditedPctOfSales({});
                          fetchPLData(false);  // Reload saved data (not force recalculate)
                        }
                      });
                    } else {
                      setEditedBudgetValues({});
                      setEditedPctOfSales({});
                      fetchPLData(false);  // Reload saved data
                    }
                  }}
                  disabled={!selectedBudgetYear || loading}
                  size="middle"
                  style={{ color: '#1890ff', borderColor: '#1890ff' }}
                >
                  Reload Saved
                </Button>
              )}
              
              {/* Recalculate from Actual - Warning styled (destructive action) */}
              <Button
                icon={<WarningOutlined />}
                onClick={() => {
                  Modal.confirm({
                    title: '⚠️ Recalculate from Actual Year?',
                    content: (
                      <div>
                        <p>This will <strong>discard all changes</strong> and recalculate the entire Budget P&L using:</p>
                        <ul>
                          <li>Sales/Volume/MoRM from Divisional Budget</li>
                          <li>% ratios from <strong>Actual {selectedBudgetYear ? selectedBudgetYear - 1 : ''}</strong> data</li>
                        </ul>
                        <p style={{ color: '#ff4d4f', fontWeight: 600 }}>This action cannot be undone!</p>
                      </div>
                    ),
                    okText: 'Yes, Recalculate',
                    cancelText: 'Cancel',
                    okType: 'danger',
                    onOk: () => {
                      setEditedBudgetValues({});
                      setEditedPctOfSales({});
                      setMaterialVariancePct(0);
                      fetchPLData(true);  // Force recalculate from divisional budget
                    }
                  });
                }}
                disabled={!selectedBudgetYear || loading}
                size="middle"
                style={{ color: '#fa8c16', borderColor: '#fa8c16' }}
              >
                {`Recalc from ${selectedBudgetYear ? selectedBudgetYear - 1 : ''} %s`}
              </Button>
              <Button 
                icon={<FileExcelOutlined />}
                onClick={handleExportExcel}
                disabled={!plData || exporting}
                loading={exporting}
                size="middle"
                style={{ color: '#217346' }}
              >
                Export Excel
              </Button>
              <Upload
                accept=".xlsx,.xls"
                showUploadList={false}
                beforeUpload={() => false}
                onChange={(info) => {
                  if (info.file) {
                    handleImportExcel(info.file);
                  }
                }}
                disabled={!plData || importing}
              >
                <Button 
                  icon={<UploadOutlined />}
                  disabled={!plData || importing}
                  loading={importing}
                  size="middle"
                  style={{ color: '#fa8c16', borderColor: '#fa8c16' }}
                >
                  Import Excel
                </Button>
              </Upload>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSaveToDatabase}
                disabled={!hasUnsavedChanges || saving}
                loading={saving}
                size="middle"
                style={{ background: hasUnsavedChanges ? '#52c41a' : undefined, borderColor: hasUnsavedChanges ? '#52c41a' : undefined }}
              >
                {!hasSavedBudgetData && plData ? 'Save Initial Budget' : `Save to Database ${hasUnsavedChanges && hasSavedBudgetData ? '(*)' : ''}`}
              </Button>
            </div>
          </div>
        </Spin>
      </div>
      
      {/* No data message */}
      {!selectedBudgetYear && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
          {budgetYears.length === 0 
            ? 'No divisional budget found. Please create a Divisional Product Group budget first.'
            : 'Please select a Budget Year to view P&L simulation.'}
        </div>
      )}
      
      {/* P&L Table */}
      {selectedBudgetYear && (
        <Spin spinning={loading} style={{ width: '100%', display: 'block' }}>
          <div style={{ width: '100%', height: 'calc(100vh - 220px)', overflowX: 'auto', overflowY: 'auto' }}>
            {/* Legend */}
            <div style={{ 
              padding: '10px 16px', 
              background: '#fff', 
              borderBottom: '1px solid #e8e8e8',
            }}>
              <Space size="large">
                <span>
                  <span style={{ display: 'inline-block', width: 16, height: 16, backgroundColor: '#e6f4ff', border: '1px solid #99c8ff', marginRight: 8 }} />
                  Actual {actualYear}
                </span>
                <span>
                  <span style={{ display: 'inline-block', width: 16, height: 16, backgroundColor: '#FFFFB8', border: '1px solid #d4b106', marginRight: 8 }} />
                  Budget {selectedBudgetYear}
                </span>
                <span>
                  <span style={{ display: 'inline-block', width: 16, height: 16, backgroundColor: '#cce4ff', border: '1px solid #69b1ff', marginRight: 8 }} />
                  Calculated (Actual)
                </span>
                <span>
                  <span style={{ display: 'inline-block', width: 16, height: 16, backgroundColor: '#fff3cd', border: '1px solid #d4b106', marginRight: 8 }} />
                  Calculated (Budget)
                </span>
              </Space>
            </div>
            
            <table
              className="no-scroll"
              style={{
                width: '100%',
                borderCollapse: 'separate',
                borderSpacing: 0,
                fontSize: '12px',
                tableLayout: 'fixed',
              }}
            >
              <colgroup>
                <col style={{ width: '12%' }} />
                <col style={{ width: '5%' }} />
                {Array(12).fill(null).map((_, i) => (
                  <col key={i} style={{ width: '6.4%' }} />
                ))}
                <col style={{ width: '6.2%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th
                    rowSpan={2}
                    style={{
                      backgroundColor: '#1677ff',
                      color: '#fff',
                      padding: '8px 10px',
                      border: '1px solid #fff',
                      position: 'sticky',
                      left: 0,
                      zIndex: 100,
                      textAlign: 'left',
                      fontSize: '13px',
                      fontWeight: 700
                    }}
                  >
                    P&L Ledgers
                  </th>
                  <th
                    rowSpan={2}
                    style={{
                      backgroundColor: '#1677ff',
                      color: '#fff',
                      padding: '8px',
                      border: '1px solid #fff',
                      textAlign: 'center',
                      fontSize: '11px',
                      fontWeight: 600
                    }}
                  >
                    % of Sls
                  </th>
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map(month => (
                    <th
                      key={month}
                      style={{
                        backgroundColor: '#1677ff',
                        color: '#fff',
                        padding: '8px',
                        border: '1px solid #fff',
                        textAlign: 'center',
                      }}
                    >
                      {month}
                    </th>
                  ))}
                  <th
                    style={{
                      backgroundColor: '#0958d9',
                      color: '#fff',
                      padding: '8px',
                      border: '1px solid #fff',
                      textAlign: 'center',
                      fontWeight: 700,
                    }}
                  >
                    Year Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, idx) => {
                  const isCalculated = item.source === 'calculated';
                  const isEditable = item.isInput && !isCalculated;
                  const isPct = item.isPct;
                  const isPerKg = item.isPerKg;
                  const isVolume = item.key.includes('volume');
                  
                  // Get values
                  const getActualValue = (month) => actualByMonth[month]?.[item.key] || 0;
                  const actualTotal = actualYearTotals[item.key] || 0;
                  
                  // Calculate budget total including edits
                  const calculateBudgetTotal = () => {
                    // Special handling for percentage items - calculate from year totals, not sum of monthly %
                    if (item.key === 'direct_cost_pct_of_cogs') {
                      // Year Total = Year Total Dir.Cost of goods sold / Year Total Cost of Sales
                      let totalDirCostGoodsSold = 0;
                      let totalCostOfSales = 0;
                      for (let m = 1; m <= 12; m++) {
                        totalDirCostGoodsSold += getBudgetDisplayValue(m, 'dir_cost_goods_sold') || 0;
                        totalCostOfSales += getBudgetDisplayValue(m, 'cost_of_sales') || 0;
                      }
                      return totalCostOfSales > 0 ? (totalDirCostGoodsSold / totalCostOfSales) * 100 : 0;
                    }
                    
                    // Normal items: sum monthly values
                    let total = 0;
                    for (let m = 1; m <= 12; m++) {
                      total += getBudgetDisplayValue(m, item.key) || 0;
                    }
                    return total;
                  };
                  const budgetTotal = calculateBudgetTotal();
                  
                  // Format function
                  const format = (val) => {
                    if (isPct) return formatNumber(val, true, false);
                    if (isPerKg) return formatNumber(val, false, true);
                    if (isVolume) return formatVolume(val);
                    return formatNumber(val);
                  };
                  
                  // Row colors
                  const actualBg = isCalculated ? '#cce4ff' : '#e6f4ff';
                  const budgetBg = isCalculated ? '#fff3cd' : '#FFFFB8';
                  
                  // % of Sales values
                  const actualPctOfSales = getPctOfSales(item.key, true);
                  // For budget %, calculate from budget values (not just use actual %)
                  // This ensures calculated fields like cost_of_sales, gross_profit show correct % when material variance changes
                  let budgetSalesTotal = 0;
                  for (let m = 1; m <= 12; m++) {
                    budgetSalesTotal += getBudgetDisplayValue(m, 'sales') || 0;
                  }
                  const budgetPctOfSales = editedPctOfSales.hasOwnProperty(item.key) 
                    ? editedPctOfSales[item.key] 
                    : (budgetSalesTotal > 0 ? (budgetTotal / budgetSalesTotal) * 100 : actualPctOfSales);
                  const isPctEdited = editedPctOfSales.hasOwnProperty(item.key);
                  
                  // Can edit % for pct_of_sales items only (not for sales, volume, calculated, etc.)
                  const canEditPct = item.source === 'pct_of_sales';
                  
                  return (
                    <React.Fragment key={item.key}>
                      {/* Actual Row */}
                      <tr style={{ backgroundColor: actualBg }}>
                        <td 
                          rowSpan={2}
                          style={{ 
                            padding: '8px 10px',
                            border: '1px solid #ddd',
                            backgroundColor: '#fff',
                            position: 'sticky',
                            left: 0,
                            zIndex: 5,
                            fontWeight: 700,
                            fontSize: '12px',
                          }}
                        >
                          {item.label}
                          {item.subtitle && (
                            <>
                              <br />
                              <span style={{ 
                                fontWeight: 400, 
                                fontSize: '10px', 
                                color: '#888',
                                fontStyle: 'italic'
                              }}>
                                ({item.subtitle})
                              </span>
                            </>
                          )}
                        </td>
                        {/* Actual % of Sales */}
                        <td
                          style={{
                            padding: '6px 4px',
                            border: '1px solid #ddd',
                            backgroundColor: actualBg,
                            textAlign: 'center',
                            fontSize: '10px',
                          }}
                        >
                          {item.key === 'sales' ? '100.000%' : (actualPctOfSales > 0 ? actualPctOfSales.toFixed(3) + '%' : '—')}
                        </td>
                        {Array.from({ length: 12 }, (_, i) => {
                          const month = i + 1;
                          const value = getActualValue(month);
                          return (
                            <td 
                              key={`actual-${month}`}
                              style={{ 
                                padding: '6px 8px',
                                border: '1px solid #ddd',
                                backgroundColor: actualBg,
                                textAlign: 'right',
                                fontWeight: isCalculated ? 600 : 500,
                                fontSize: '11px',
                              }}
                            >
                              {format(value)}
                            </td>
                          );
                        })}
                        {/* Year Total */}
                        <td 
                          style={{ 
                            padding: '6px 8px',
                            border: '1px solid #ddd',
                            backgroundColor: '#b3d9ff',
                            textAlign: 'right',
                            fontWeight: 700,
                            fontSize: '11px',
                          }}
                        >
                          {format(actualTotal)}
                        </td>
                      </tr>
                      {/* Budget Row */}
                      <tr style={{ backgroundColor: budgetBg }}>
                        {/* Budget % of Sales - Editable for pct_of_sales items */}
                        <td
                          style={{
                            padding: canEditPct ? '2px' : '6px 4px',
                            border: '1px solid #ddd',
                            backgroundColor: isPctEdited ? '#ffe58f' : budgetBg,
                            textAlign: 'center',
                            fontSize: '10px',
                          }}
                        >
                          {canEditPct ? (
                            <InputNumber
                              value={budgetPctOfSales}
                              onChange={(val) => handlePctOfSalesEdit(item.key, val || 0)}
                              size="small"
                              className="budget-pl-input-center"
                              style={{ width: '100%', fontSize: '10px' }}
                              precision={3}
                              step={0.001}
                              controls={false}
                            />
                          ) : (
                            item.key === 'sales' ? '100.000' : (budgetPctOfSales > 0 ? budgetPctOfSales.toFixed(3) : '—')
                          )}
                        </td>
                        {Array.from({ length: 12 }, (_, i) => {
                          const month = i + 1;
                          const value = getBudgetDisplayValue(month, item.key);
                          const editKey = `${month}-${item.key}`;
                          const isEdited = editedBudgetValues.hasOwnProperty(editKey);
                          // Show — for production volume since it's not available
                          const displayValue = item.key === 'production_volume_kg' && value === 0 ? '—' : format(value);
                          
                          // Editable cell for input items
                          if (isEditable && !isPct && !isPerKg) {
                            return (
                              <td 
                                key={`budget-${month}`}
                                style={{ 
                                  padding: '2px',
                                  border: '1px solid #ddd',
                                  backgroundColor: isEdited ? '#ffe58f' : budgetBg,
                                  textAlign: 'right',
                                }}
                              >
                                <InputNumber
                                  value={Math.round(value)}
                                  onChange={(val) => handleBudgetEdit(month, item.key, Math.round(val) || 0)}
                                  size="small"
                                  className="budget-pl-input-right"
                                  style={{ 
                                    width: '100%', 
                                    fontSize: '11px'
                                  }}
                                  formatter={(val) => val ? Math.round(Number(val)).toLocaleString() : ''}
                                  parser={(val) => Math.round(Number(val?.replace(/,/g, '') || 0))}
                                  precision={0}
                                  controls={false}
                                />
                              </td>
                            );
                          }
                          
                          return (
                            <td 
                              key={`budget-${month}`}
                              style={{ 
                                padding: '6px 8px',
                                border: '1px solid #ddd',
                                backgroundColor: budgetBg,
                                textAlign: 'right',
                                fontWeight: isCalculated ? 600 : 500,
                                fontSize: '11px',
                              }}
                            >
                              {displayValue}
                            </td>
                          );
                        })}
                        {/* Year Total */}
                        <td 
                          style={{ 
                            padding: '6px 8px',
                            border: '1px solid #ddd',
                            backgroundColor: '#FFEB3B',
                            textAlign: 'right',
                            fontWeight: 700,
                            fontSize: '11px',
                          }}
                        >
                          {item.key === 'production_volume_kg' && budgetTotal === 0 ? '—' : format(budgetTotal)}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
                
                {lineItems.length === 0 && !loading && (
                  <tr>
                    <td colSpan={15} style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                      No P&L data available. Make sure there is actual P&L data for {actualYear}.
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

export default BudgetPLTab;
