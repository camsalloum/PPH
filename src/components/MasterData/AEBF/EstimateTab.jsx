import React, { useState, useEffect, useMemo } from 'react';
import { Table, Button, Space, message, Modal, Spin, Tag, Statistic, Row, Col, Card, Tabs, Input, Checkbox, InputNumber, Tooltip, Alert, Select } from 'antd';
import { DownloadOutlined, ReloadOutlined, CalculatorOutlined, CheckCircleOutlined, PercentageOutlined, PlusOutlined, MinusOutlined, DeleteOutlined, WarningOutlined } from '@ant-design/icons';
import { useExcelData } from '../../../contexts/ExcelDataContext';
import { useFilter } from '../../../contexts/FilterContext';
import CurrencySymbol from '../../dashboard/CurrencySymbol';
import axios from 'axios';
import { ResizableTitle, useResizableColumns } from '../../shared/ResizableTable';

const { Search } = Input;

/**
 * EstimateTab Component - Financial Estimates Management
 * Calculates estimates based on Actual data averages per product group
 * Saves to fp_product_group_projections with type='ESTIMATE'
 */
const EstimateTab = ({ isActive }) => {
  const { selectedDivision, divisionMetadata } = useExcelData();
  const { basePeriodIndex, columnOrder } = useFilter();
  
  // Get division name from metadata
  const divisionInfo = divisionMetadata?.find(d => d.code === selectedDivision) || {};
  const divisionName = divisionInfo.name || selectedDivision;
  
  // Data and loading state
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0 });
  
  // Year tabs
  const [availableYears, setAvailableYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [yearSummary, setYearSummary] = useState(null);
  const [yearMetadata, setYearMetadata] = useState({}); // { year: { monthCount, status, completionPercent } }
  
  // Product group estimates display
  const [productGroupEstimates, setProductGroupEstimates] = useState([]);
  const [loadingPGEstimates, setLoadingPGEstimates] = useState(false);
  
  // Global search
  const [globalSearch, setGlobalSearch] = useState('');
  
  // Create Estimate modal
  const [estimateModalVisible, setEstimateModalVisible] = useState(false);
  const [estimateStep, setEstimateStep] = useState(1); // 1=month selection, 2=review
  const [estimateYear, setEstimateYear] = useState(null); // Target year for estimates
  const [baseYear, setBaseYear] = useState(null); // Source year for actual data
  const [baseYearOptions, setBaseYearOptions] = useState([]); // Years with actual data to use as base
  const [estimateableYears, setEstimateableYears] = useState([]); // Years with < 12 months (can be estimated)
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [calculating, setCalculating] = useState(false);
  const [calculatedEstimates, setCalculatedEstimates] = useState(null); // Base year actuals
  const [editableEstimates, setEditableEstimates] = useState({}); // Final estimates to save
  const [pgAdjustments, setPgAdjustments] = useState({}); // Per-product-group adjustment %
  const [pgKgsOverrides, setPgKgsOverrides] = useState({}); // Per-product-group custom KGS override
  const [budgetPgOrder, setBudgetPgOrder] = useState([]); // Product group order from budget
  const [defaultAdjustment, setDefaultAdjustment] = useState(10); // Default adjustment %
  const [approving, setApproving] = useState(false);
  const [existingEstimateCount, setExistingEstimateCount] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [confirmReplaceVisible, setConfirmReplaceVisible] = useState(false);
  const [customPercent, setCustomPercent] = useState(null);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Fetch available years and year metadata (ACTUAL vs ESTIMATE status)
  const fetchAvailableYears = async () => {
    if (!selectedDivision) return;
    
    try {
      const response = await axios.get('/api/aebf/filter-options', {
        params: { division: selectedDivision }  // Remove type filter to get actual data
      });
      
      if (response.data.success) {
        const years = response.data.data.filterOptions.year || [];
        setAvailableYears(years.sort((a, b) => b - a));
        
        // Capture yearMetadata for ACTUAL vs ESTIMATE labels
        if (response.data.data.yearMetadata) {
          setYearMetadata(response.data.data.yearMetadata);
        }
        
        if (years.length > 0 && !selectedYear) {
          let defaultYear = years[0];
          if (basePeriodIndex !== null && basePeriodIndex >= 0 && columnOrder.length > basePeriodIndex) {
            const basePeriod = columnOrder[basePeriodIndex];
            if (basePeriod && basePeriod.year) {
              defaultYear = basePeriod.year;
            }
          }
          setSelectedYear(defaultYear);
        }
      }
    } catch (error) {
      console.error('Error fetching years:', error);
    }
  };

  // Fetch year-specific summary
  const fetchYearSummary = async (year, searchFilter = '') => {
    if (!selectedDivision) return;
    
    try {
      const params = { 
        division: selectedDivision, 
        types: 'Actual,Estimate' // Fetch BOTH for full year (FY) view
      };
      
      if (searchFilter && searchFilter.trim()) {
        params.search = searchFilter.trim();
      } else {
        if (year) {
          params.year = year;
        }
      }
      
      const response = await axios.get('/api/aebf/year-summary', { params });
      
      if (response.data.success) {
        setYearSummary(response.data.data.summary);
      }
    } catch (error) {
      console.error('Error fetching summary:', error);
    }
  };

  // Fetch data
  const fetchData = async (page = 1, pageSize = 50, searchFilter = null) => {
    if (!selectedDivision) {
      message.warning('Please select a division first');
      return;
    }
    
    setLoading(true);
    try {
      const params = {
        division: selectedDivision,
        page,
        pageSize,
        sortBy: 'year',
        sortOrder: 'desc',
      };
      
      const search = searchFilter !== null ? searchFilter : globalSearch;
      if (search && search.trim()) {
        params.search = search.trim();
      } else {
        if (selectedYear) params.year = selectedYear;
      }
      
      const response = await axios.get('/api/aebf/actual', { params });
      
      if (response.data.success) {
        setData(response.data.data.data.map(item => ({ ...item, key: item.id })));
        setYearMetadata(response.data.data.yearMetadata || {});  // Capture year status metadata
        setPagination({
          current: response.data.data.pagination.page,
          pageSize: response.data.data.pagination.pageSize,
          total: response.data.data.pagination.total,
        });
      } else {
        message.error('Failed to load data');
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      message.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Year change handler
  const handleYearChange = (year) => {
    setSelectedYear(parseInt(year));
    setGlobalSearch('');
  };

  // Search handlers
  const handleSearch = (value) => {
    setGlobalSearch(value);
    setPagination({ ...pagination, current: 1 });
    if (selectedYear) fetchYearSummary(selectedYear, value);
    fetchData(1, pagination.pageSize, value);
  };
  
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setGlobalSearch(value);
    if (value === '') {
      if (selectedYear) fetchYearSummary(selectedYear, '');
      fetchData(1, pagination.pageSize, '');
    }
  };

  // Open estimate modal - allow estimating any year using base data from years with actual data
  const openEstimateModal = async () => {
    // Get years that have actual data (can be used as base for estimates)
    const yearsWithActualData = Object.entries(yearMetadata)
      .filter(([year, meta]) => meta.monthCount > 0)
      .map(([year, meta]) => ({ year: parseInt(year), monthCount: meta.monthCount, status: meta.status }))
      .sort((a, b) => b.year - a.year); // Most recent first
    
    if (yearsWithActualData.length === 0) {
      message.warning('No years with actual data found. Cannot create estimates without base period data.');
      return;
    }
    
    setBaseYearOptions(yearsWithActualData);
    
    // Default base year to the most recent year with actual data
    const defaultBaseYear = yearsWithActualData[0].year;
    setBaseYear(defaultBaseYear);
    
    // Build list of estimateable years (only years that need estimates - less than 12 months actual)
    const estimateYears = [];
    const currentYear = new Date().getFullYear();
    
    // Check current year, next year, and previous year
    for (let y = currentYear - 1; y <= currentYear + 2; y++) {
      const meta = yearMetadata[y];
      const monthCount = meta?.monthCount || 0;
      // Only include years that need estimates (less than 12 months of actual data)
      if (monthCount < 12) {
        estimateYears.push({ year: y, monthCount, needsEstimate: true });
      }
    }
    
    if (estimateYears.length === 0) {
      message.info('All years have complete actual data (12 months). No estimates needed.');
      return;
    }
    
    setEstimateableYears(estimateYears);
    
    // Default to the first year that needs estimates
    const defaultEstimateYear = estimateYears[0].year;
    setEstimateYear(defaultEstimateYear);
    setEstimateStep(1);
    setSelectedMonths([]);
    setCalculatedEstimates(null);
    setEditableEstimates({});
    setExistingEstimateCount(0);
    
    await fetchAvailableActualMonths(defaultBaseYear);
    await fetchExistingEstimateCount(defaultEstimateYear);
    setEstimateModalVisible(true);
  };

  // Handle target year change in estimate modal
  const handleEstimateYearChange = async (year) => {
    setEstimateYear(year);
    setSelectedMonths([]);
    setCalculatedEstimates(null);
    setEditableEstimates({});
    await fetchExistingEstimateCount(year);
  };

  // Handle base year change in estimate modal
  const handleBaseYearChange = async (year) => {
    setBaseYear(year);
    setSelectedMonths([]);
    setCalculatedEstimates(null);
    setEditableEstimates({});
    await fetchAvailableActualMonths(year);
  };

  // Fetch existing estimate count for the year from projections table
  const fetchExistingEstimateCount = async (year) => {
    try {
      const response = await axios.get(`/api/aebf/projections/${selectedDivision}/${year}/totals`, {
        params: { type: 'ESTIMATE' }
      });
      
      if (response.data.success && response.data.data) {
        setExistingEstimateCount(response.data.data.length);
      } else {
        setExistingEstimateCount(0);
      }
    } catch (error) {
      console.error('Error fetching estimate count:', error);
      setExistingEstimateCount(0);
    }
  };

  // Fetch available Actual months
  const fetchAvailableActualMonths = async (year) => {
    try {
      const response = await axios.get('/api/aebf/available-months', {
        params: {
          division: selectedDivision,
          year
        }
      });
      
      if (response.data.success) {
        const months = response.data.data.months.sort((a, b) => a - b);
        setAvailableMonths(months);
      }
    } catch (error) {
      console.error('Error fetching actual months:', error);
      message.error('Failed to fetch available months');
    }
  };

  // Clear old estimates for the year
  const handleClearEstimates = async () => {
    Modal.confirm({
      title: 'Clear All Estimates',
      content: `Are you sure you want to delete ALL estimate records for ${estimateYear}? This cannot be undone.`,
      okText: 'Yes, Clear All',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const response = await axios.delete('/api/aebf/clear-estimates', {
            params: {
              division: selectedDivision,
              year: estimateYear
            }
          });
          
          if (response.data.success) {
            message.success(response.data.data.message || `Cleared ${response.data.data.deletedCount} estimate records`);
            // Refresh the data
            fetchAvailableYears();
            fetchData();
            if (selectedYear) fetchYearSummary(selectedYear);
          } else {
            message.error('Failed to clear estimates');
          }
        } catch (error) {
          console.error('Error clearing estimates:', error);
          message.error('Failed to clear estimates');
        }
      }
    });
  };

  // Toggle month selection
  const handleMonthToggle = (month) => {
    if (selectedMonths.includes(month)) {
      setSelectedMonths(selectedMonths.filter(m => m !== month));
    } else {
      setSelectedMonths([...selectedMonths, month].sort((a, b) => a - b));
    }
  };

  // Calculate estimates (auto-clears old estimates if any exist)
  const handleCalculateEstimate = async () => {
    if (selectedMonths.length === 0) {
      message.warning('Please select at least one month to estimate');
      return;
    }
    
    // If there are existing estimates, show confirmation modal
    if (existingEstimateCount > 0) {
      setConfirmReplaceVisible(true);
    } else {
      // No existing estimates, just calculate
      await performCalculation(false);
    }
  };

  // Handle confirm replace
  const handleConfirmReplace = async () => {
    setConfirmReplaceVisible(false);
    await performCalculation(true);
  };

  // Perform the actual calculation using product group level endpoint
  const performCalculation = async (clearFirst) => {
    setCalculating(true);
    try {
      // Step 1: Clear existing estimates from projections table if needed
      if (clearFirst) {
        await axios.delete(`/api/aebf/projections/${selectedDivision}/${estimateYear}`, {
          params: {
            type: 'ESTIMATE',
            months: selectedMonths.join(',')
          }
        });
        message.info('Cleared old estimate records');
      }
      
      // Step 2: Calculate new estimates using product group endpoint
      // Pass both target year (estimateYear) and base year (source of actual data)
      const response = await axios.post('/api/aebf/projections/calculate-pg-estimate', {
        division: selectedDivision,
        year: estimateYear,      // Target year for estimates
        baseYear: baseYear,      // Source year for actual data
        selectedMonths
      });
      
      if (response.data.success) {
        // Store the base year actual data (product group level)
        const baseActuals = response.data.data.estimates;
        setCalculatedEstimates(baseActuals);
        
        // Fetch budget product group order for sorting
        try {
          const budgetResponse = await axios.get(`/api/aebf/budget/${selectedDivision}/product-groups`);
          if (budgetResponse.data.success && budgetResponse.data.data) {
            setBudgetPgOrder(budgetResponse.data.data.map(pg => pg.pgcombine || pg.product_group));
          }
        } catch (err) {
        }
        
        // Initialize per-PG adjustments to default (10%) and clear KGS overrides
        const adjustments = {};
        Object.keys(baseActuals).forEach(pg => {
          adjustments[pg] = defaultAdjustment;
        });
        setPgAdjustments(adjustments);
        setPgKgsOverrides({}); // Reset custom KGS overrides
        
        // Calculate initial estimates with default adjustment
        applyAdjustmentsToEstimates(baseActuals, adjustments);
        
        setEstimateStep(2);
        setExistingEstimateCount(0);
        message.success(`Loaded ${response.data.data.productGroupCount} product groups from ${baseYear} actuals`);
      } else {
        message.error(response.data.error || 'Failed to calculate estimates');
      }
    } catch (error) {
      console.error('Error calculating:', error);
      message.error('Failed to calculate estimates');
    } finally {
      setCalculating(false);
    }
  };

  // Apply adjustments to base actuals and create estimates
  const applyAdjustmentsToEstimates = (baseActuals, adjustments) => {
    const estimates = {};
    
    Object.entries(baseActuals).forEach(([pgcombine, pgData]) => {
      const adjustmentPct = adjustments[pgcombine] ?? defaultAdjustment;
      const multiplier = 1 + (adjustmentPct / 100);
      
      estimates[pgcombine] = {
        months: {}
      };
      
      Object.entries(pgData.months || {}).forEach(([month, values]) => {
        estimates[pgcombine].months[month] = {
          amount: Math.round((values.amount || 0) * multiplier),
          qty_kgs: Math.round((values.qty_kgs || 0) * multiplier),
          morm: Math.round((values.morm || 0) * multiplier)
        };
      });
    });
    
    setEditableEstimates(estimates);
  };

  // Handle per-PG adjustment change
  const handlePgAdjustmentChange = (pgcombine, value) => {
    // Clear KGS override when adjustment changes
    const newOverrides = { ...pgKgsOverrides };
    delete newOverrides[pgcombine];
    setPgKgsOverrides(newOverrides);
    
    const newAdjustments = { ...pgAdjustments, [pgcombine]: value };
    setPgAdjustments(newAdjustments);
    applyAdjustmentsToEstimates(calculatedEstimates, newAdjustments);
  };

  // Handle direct Est. KGS edit - recalculate adjustment % and other values
  const handleEstKgsChange = (pgcombine, newEstKgs, baseKgs) => {
    // Store the KGS override
    setPgKgsOverrides(prev => ({ ...prev, [pgcombine]: newEstKgs }));
    
    // Calculate the new adjustment % based on the KGS change
    if (baseKgs > 0) {
      const newAdjustment = Math.round(((newEstKgs / baseKgs) - 1) * 100 * 100) / 100; // 2 decimal places
      setPgAdjustments(prev => ({ ...prev, [pgcombine]: newAdjustment }));
    }
  };

  // Apply same adjustment to all PGs
  const applyGlobalAdjustment = (percentage) => {
    const newAdjustments = {};
    Object.keys(calculatedEstimates).forEach(pg => {
      newAdjustments[pg] = percentage;
    });
    setPgAdjustments(newAdjustments);
    setDefaultAdjustment(percentage);
    setPgKgsOverrides({}); // Clear all KGS overrides when applying global adjustment
    applyAdjustmentsToEstimates(calculatedEstimates, newAdjustments);
    message.success(`Applied ${percentage}% adjustment to all product groups`);
  };

  // Approve and save estimates to unified projections table
  const handleApproveEstimates = async () => {
    setApproving(true);
    try {
      // Apply per-PG adjustments (or KGS overrides) to calculated estimates before saving
      const adjustedEstimates = {};
      Object.entries(calculatedEstimates || {}).forEach(([pgcombine, pgData]) => {
        // Calculate base totals
        let baseKgs = 0, baseAmount = 0, baseMorm = 0;
        Object.values(pgData.months || {}).forEach(monthData => {
          baseKgs += monthData.qty_kgs || 0;
          baseAmount += monthData.amount || 0;
          baseMorm += monthData.morm || 0;
        });
        
        // Check if there's a KGS override for this PG
        const kgsOverride = pgKgsOverrides[pgcombine];
        let multiplier;
        
        if (kgsOverride !== undefined && baseKgs > 0) {
          // Use KGS override to calculate multiplier
          multiplier = kgsOverride / baseKgs;
        } else {
          // Use adjustment percentage
          const adjustment = pgAdjustments[pgcombine] ?? defaultAdjustment;
          multiplier = 1 + (adjustment / 100);
        }
        
        adjustedEstimates[pgcombine] = { months: {} };
        Object.entries(pgData.months || {}).forEach(([month, values]) => {
          adjustedEstimates[pgcombine].months[month] = {
            amount: Math.round((values?.amount || 0) * multiplier),
            qty_kgs: Math.round((values?.qty_kgs || 0) * multiplier),
            morm: Math.round((values?.morm || 0) * multiplier)
          };
        });
      });
      
      const response = await axios.post('/api/aebf/projections/save', {
        division: selectedDivision,
        year: estimateYear,
        type: 'ESTIMATE',
        projections: adjustedEstimates,
        createdBy: 'Current User'
      });
      
      if (response.data.success) {
        message.success('Estimates saved successfully');
        setEstimateModalVisible(false);
        fetchAvailableYears();
        fetchData();
        if (selectedYear) fetchYearSummary(selectedYear);
        // Refresh product group estimates display
        fetchProductGroupEstimates(selectedYear);
      } else {
        message.error(response.data.error || 'Failed to save estimates');
      }
    } catch (error) {
      console.error('Error saving:', error);
      message.error('Failed to save estimates');
    } finally {
      setApproving(false);
    }
  };

  // Apply percentage adjustment to all product group estimates
  const applyPercentageAdjustment = (percentage) => {
    const multiplier = 1 + (percentage / 100);
    const adjusted = {};
    
    Object.entries(editableEstimates).forEach(([pgcombine, pgData]) => {
      adjusted[pgcombine] = { months: {} };
      Object.entries(pgData.months || {}).forEach(([month, values]) => {
        adjusted[pgcombine].months[month] = {
          amount: Math.round((values?.amount || 0) * multiplier),
          qty_kgs: Math.round((values?.qty_kgs || 0) * multiplier),
          morm: Math.round((values?.morm || 0) * multiplier)
        };
      });
    });
    
    setEditableEstimates(adjusted);
    message.success(`Applied ${percentage > 0 ? '+' : ''}${percentage}% adjustment to all values`);
  };

  // Fetch product group estimates for display
  const fetchProductGroupEstimates = async (year) => {
    if (!selectedDivision || !year) return;
    
    setLoadingPGEstimates(true);
    try {
      const response = await axios.get(`/api/aebf/projections/${selectedDivision}/${year}/totals`, {
        params: { type: 'ESTIMATE' }
      });
      
      if (response.data.success && response.data.data) {
        // Convert to array for table display
        const estimates = Object.entries(response.data.data).map(([pgcombine, data]) => ({
          key: pgcombine,
          pgcombine,
          kgs: data.kgs || 0,
          sales: data.sales || 0,
          morm: data.morm || 0,
          slsPerKg: data.slsPerKg || 0,
          rmPerKg: data.rmPerKg || 0,
          mormPerKg: data.mormPerKg || 0,
          mormPercent: data.mormPercent || 0
        })).sort((a, b) => {
          // Sort alphabetically with Others second-to-last, Services Charges last
          const pgA = (a.pgcombine || '').toUpperCase().trim();
          const pgB = (b.pgcombine || '').toUpperCase().trim();
          
          // Services Charges always last
          if (pgA === 'SERVICES CHARGES') return 1;
          if (pgB === 'SERVICES CHARGES') return -1;
          
          // Others always second-to-last
          if (pgA === 'OTHERS') return 1;
          if (pgB === 'OTHERS') return -1;
          
          // Everything else alphabetical
          return a.pgcombine.localeCompare(b.pgcombine);
        });
        setProductGroupEstimates(estimates);
      } else {
        setProductGroupEstimates([]);
      }
    } catch (error) {
      console.error('Error fetching product group estimates:', error);
      setProductGroupEstimates([]);
    } finally {
      setLoadingPGEstimates(false);
    }
  };

  // Export handler - Excel format matching divisional budget style
  const handleExport = async () => {
    if (!selectedDivision) {
      message.warning('Please select a division first');
      return;
    }
    if (!selectedYear) {
      message.warning('Please select a year first');
      return;
    }
    
    try {
      setLoading(true);
      const response = await axios.post(
        '/api/aebf/projections/export-excel',
        { division: selectedDivision, year: selectedYear },
        { responseType: 'blob' }
      );
      
      // Create download link
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Get filename from header or generate one
      const contentDisposition = response.headers['content-disposition'];
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const timeStr = now.toTimeString().slice(0, 5).replace(/:/g, '');
      let filename = `ESTIMATE_Divisional_${selectedDivision}_${selectedYear}_${dateStr}_${timeStr}.xlsx`;
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
      message.error('Export failed');
    } finally {
      setLoading(false);
    }
  };

  // Base table columns definition
  const baseColumns = useMemo(() => [
    { title: 'Year', dataIndex: 'year', key: 'year', width: 65, sorter: (a, b) => a.year - b.year },
    {
      title: 'Month',
      dataIndex: 'month',
      key: 'month',
      width: 100,
      sorter: (a, b) => a.month - b.month,
      render: (month) => <Tag color="cyan">{month} Estimate</Tag>
    },
    { title: 'Sales Rep', dataIndex: 'salesrepname', key: 'salesrepname', width: 150, ellipsis: true },
    { title: 'Customer', dataIndex: 'customername', key: 'customername', width: 180, ellipsis: true },
    { title: 'Country', dataIndex: 'countryname', key: 'countryname', width: 100, ellipsis: true },
    { title: 'Product Group', dataIndex: 'productgroup', key: 'productgroup', width: 150, ellipsis: true },
    { title: 'Material', dataIndex: 'material', key: 'material', width: 85, ellipsis: true },
    { title: 'Process', dataIndex: 'process', key: 'process', width: 85, ellipsis: true },
    {
      title: 'Values Type',
      dataIndex: 'values_type',
      key: 'values_type',
      width: 100,
      render: (text) => {
        const color = text === 'AMOUNT' ? 'green' : text === 'KGS' ? 'blue' : 'orange';
        return <Tag color={color}>{text}</Tag>;
      }
    },
    {
      title: 'Value',
      dataIndex: 'values',
      key: 'values',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.values - b.values,
      render: (value) => value ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'
    },
  ], []);

  // Use resizable columns hook
  const [columns] = useResizableColumns(baseColumns, 'estimate-table');

  // Effects
  useEffect(() => {
    if (selectedDivision) fetchAvailableYears();
  }, [selectedDivision]);

  useEffect(() => {
    if (selectedYear) {
      fetchYearSummary(selectedYear);
      fetchData();
      fetchProductGroupEstimates(selectedYear);
    }
  }, [selectedYear]);

  // Re-fetch when tab becomes active (to get fresh data after changes in other tabs)
  useEffect(() => {
    if (isActive && selectedDivision && selectedYear) {
      fetchYearSummary(selectedYear);
      fetchData();
      fetchProductGroupEstimates(selectedYear);
    }
  }, [isActive]);

  const handleTableChange = (paginationConfig) => {
    fetchData(paginationConfig.current, paginationConfig.pageSize);
  };

  return (
    <div className="estimate-tab" style={{ padding: '0', width: '100%' }}>
      {/* Header */}
      <div className="tab-header" style={{ marginBottom: '16px', padding: '0 10px' }}>
        <h3>Estimate Sales Data - {selectedDivision || 'No Division Selected'}</h3>
        <p style={{ color: '#666', fontSize: '14px' }}>
          Create sales estimates based on actual data averages. Review and approve before saving.
        </p>
      </div>

      {/* Year Tabs */}
      {availableYears.length > 0 && (
        <Tabs
          activeKey={selectedYear?.toString()}
          onChange={handleYearChange}
          style={{ marginBottom: '16px', padding: '0 10px' }}
          items={availableYears.map(year => {
            const yearData = yearMetadata[year];
            const status = yearData?.status || 'ESTIMATE';
            const monthCount = yearData?.monthCount || 0;
            const label = status === 'ACTUAL' 
              ? `${year} FY ACTUAL (${monthCount}/12)` 
              : `${year} FY ESTIMATE (${monthCount}/12)`;
            return { key: year.toString(), label };
          })}
        />
      )}

      {/* Summary Cards */}
      {yearSummary && yearSummary.length > 0 && (
        <Row gutter={16} style={{ marginBottom: '20px', padding: '0 10px' }}>
          {yearSummary.map((item) => {
            const isCurrencyValue = item.values_type === 'AMOUNT' || item.values_type === 'Amount' || 
                                    item.values_type === 'MORM' || item.values_type === 'MoRM';
            return (
              <Col span={8} key={item.values_type}>
                <Card>
                  <Statistic
                    title={item.values_type}
                    value={Math.round(item.total_values)}
                    precision={0}
                    prefix={isCurrencyValue ? <span style={{ color: '#3f8600' }}><CurrencySymbol /></span> : null}
                    valueStyle={{ color: '#3f8600' }}
                    suffix={
                      <span style={{ fontSize: '14px', color: '#999' }}>
                        ({item.record_count.toLocaleString()} records)
                      </span>
                    }
                  />
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {/* Action Bar */}
      <Space style={{ marginBottom: '16px', padding: '0 10px', width: '100%', justifyContent: 'space-between' }}>
        <Space>
          <Button 
            icon={<CalculatorOutlined />} 
            type="primary"
            onClick={openEstimateModal}
            disabled={!selectedDivision}
          >
            Create Estimate
          </Button>
          
          <Button icon={<DownloadOutlined />} onClick={handleExport} disabled={!selectedDivision}>
            Export Excel
          </Button>
          
          <Button icon={<ReloadOutlined />} onClick={() => fetchData()} disabled={!selectedDivision}>
            Refresh
          </Button>
        </Space>

        <Search
          placeholder="Search (customer, country, product, sales rep...)"
          allowClear
          enterButton="Search"
          style={{ width: 400 }}
          onSearch={handleSearch}
          onChange={handleSearchChange}
          value={globalSearch}
        />
      </Space>

      {/* Product Group Estimates Table */}
      <Card 
        title={<span><CalculatorOutlined /> Product Group Estimates - {selectedYear}</span>}
        style={{ margin: '0 10px' }}
        extra={
          <Tag color={productGroupEstimates.length > 0 ? 'green' : 'default'}>
            {productGroupEstimates.length} Product Groups
          </Tag>
        }
      >
        {productGroupEstimates.length > 0 ? (
          <Table
            dataSource={productGroupEstimates}
            loading={loadingPGEstimates}
            pagination={false}
            size="small"
            scroll={{ y: 400 }}
            summary={pageData => {
              const totals = pageData.reduce((acc, row) => ({
                kgs: acc.kgs + row.kgs,
                sales: acc.sales + row.sales,
                morm: acc.morm + row.morm
              }), { kgs: 0, sales: 0, morm: 0 });
              
              return (
                <Table.Summary fixed>
                  <Table.Summary.Row style={{ backgroundColor: '#fafafa', fontWeight: 'bold' }}>
                    <Table.Summary.Cell index={0}>TOTAL</Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      {totals.kgs.toLocaleString()}
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2} align="right">
                      <CurrencySymbol />{totals.sales.toLocaleString()}
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={3} align="right">
                      <CurrencySymbol />{totals.morm.toLocaleString()}
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">
                      {totals.kgs > 0 ? (totals.sales / totals.kgs).toFixed(2) : '-'}
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">
                      {totals.kgs > 0 ? ((totals.sales - totals.morm) / totals.kgs).toFixed(2) : '-'}
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="right">
                      {totals.kgs > 0 ? (totals.morm / totals.kgs).toFixed(2) : '-'}
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={7} align="right">
                      {totals.sales > 0 ? ((totals.morm / totals.sales) * 100).toFixed(1) : '-'}%
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              );
            }}
            columns={[
              { title: 'Product Group', dataIndex: 'pgcombine', key: 'pgcombine', width: 250 },
              { 
                title: 'KGS', 
                dataIndex: 'kgs', 
                key: 'kgs', 
                align: 'right',
                width: 100,
                render: v => v?.toLocaleString() || '-'
              },
              { 
                title: 'Sales', 
                dataIndex: 'sales', 
                key: 'sales', 
                align: 'right',
                width: 120,
                render: v => <><CurrencySymbol />{v?.toLocaleString() || '-'}</>
              },
              { 
                title: 'MoRM', 
                dataIndex: 'morm', 
                key: 'morm', 
                align: 'right',
                width: 120,
                render: v => <><CurrencySymbol />{v?.toLocaleString() || '-'}</>
              },
              { 
                title: 'Sls/Kg', 
                dataIndex: 'slsPerKg', 
                key: 'slsPerKg', 
                align: 'right',
                width: 80,
                render: v => v?.toFixed(2) || '-'
              },
              { 
                title: 'RM/Kg', 
                dataIndex: 'rmPerKg', 
                key: 'rmPerKg', 
                align: 'right',
                width: 80,
                render: v => v?.toFixed(2) || '-'
              },
              { 
                title: 'MoRM/Kg', 
                dataIndex: 'mormPerKg', 
                key: 'mormPerKg', 
                align: 'right',
                width: 80,
                render: v => v?.toFixed(2) || '-'
              },
              { 
                title: 'MoRM %', 
                dataIndex: 'mormPercent', 
                key: 'mormPercent', 
                align: 'right',
                width: 80,
                render: v => `${v?.toFixed(1) || 0}%`
              }
            ]}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
            <CalculatorOutlined style={{ fontSize: '48px', marginBottom: '16px' }} />
            <p>No estimates for {selectedYear}</p>
            <p style={{ fontSize: '12px' }}>Click "Create Estimate" to generate estimates for this year</p>
          </div>
        )}
      </Card>

      {/* Create Estimate Modal */}
      <Modal
        title={
          <Space>
            <CalculatorOutlined style={{ color: '#1890ff' }} />
            <span>{estimateStep === 1 ? 'Create Estimate' : `Review & Approve - ${divisionName} ${estimateYear}`}</span>
          </Space>
        }
        open={estimateModalVisible}
        onCancel={() => setEstimateModalVisible(false)}
        width={estimateStep === 1 ? 900 : '100vw'}
        style={estimateStep === 2 ? { top: 0, paddingBottom: 0, maxWidth: '100vw' } : {}}
        styles={estimateStep === 2 ? { 
          body: { 
            height: 'calc(100vh - 110px)', 
            overflow: 'hidden',
            padding: '16px 24px'
          }
        } : {}}
        footer={
          estimateStep === 1 ? [
            <Button key="cancel" onClick={() => setEstimateModalVisible(false)}>Cancel</Button>,
            <Button 
              key="calculate" 
              type="primary" 
              loading={calculating}
              onClick={handleCalculateEstimate}
              disabled={selectedMonths.length === 0 || availableMonths.length === 0}
            >
              Calculate Estimate ({selectedMonths.length} months)
            </Button>
          ] : [
            <Button key="back" onClick={() => setEstimateStep(1)}>Back</Button>,
            <Button key="cancel" onClick={() => setEstimateModalVisible(false)}>Cancel</Button>,
            <Button 
              key="approve" 
              type="primary" 
              loading={approving}
              onClick={handleApproveEstimates}
              icon={<CheckCircleOutlined />}
            >
              Approve & Save
            </Button>
          ]
        }
      >
        {estimateStep === 1 ? (
          /* Step 1: Month Selection */
          <Spin spinning={calculating} tip="Calculating estimates...">
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {/* Top Row: Year selections + Division info */}
              <Row gutter={16}>
                <Col span={8}>
                  <div>
                    <p style={{ margin: '0 0 4px 0', fontWeight: 500 }}>Estimate FOR Year:</p>
                    <Select
                      value={estimateYear}
                      onChange={handleEstimateYearChange}
                      style={{ width: '100%' }}
                      placeholder="Select year"
                    >
                      {estimateableYears.map(item => (
                        <Select.Option key={item.year} value={item.year}>
                          {item.year} ({item.monthCount}/12 actual) - Needs Estimate
                        </Select.Option>
                      ))}
                    </Select>
                  </div>
                </Col>
                <Col span={8}>
                  <div>
                    <p style={{ margin: '0 0 4px 0', fontWeight: 500 }}>Use Actual Data FROM Year:</p>
                    <Select
                      value={baseYear}
                      onChange={handleBaseYearChange}
                      style={{ width: '100%' }}
                      placeholder="Select base year"
                    >
                      {baseYearOptions.map(item => (
                        <Select.Option key={item.year} value={item.year}>
                          {item.year} ({item.monthCount}/12 actual) {item.status === 'ACTUAL' ? '✓' : ''}
                        </Select.Option>
                      ))}
                    </Select>
                  </div>
                </Col>
                <Col span={8}>
                  <div style={{ padding: '8px 12px', backgroundColor: '#f0f5ff', borderRadius: 4, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>Division</p>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '14px' }}>{divisionName}</p>
                  </div>
                </Col>
              </Row>

              {/* Existing Estimates Warning */}
              {(existingEstimateCount || 0) > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  icon={<WarningOutlined />}
                  message={`${(existingEstimateCount || 0).toLocaleString()} existing estimates for ${estimateYear} will be replaced`}
                  style={{ padding: '8px 12px' }}
                />
              )}

              {/* Month Selection */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <p style={{ margin: 0, fontWeight: 500 }}>Select Months to Estimate (for {estimateYear}):</p>
                  <Space>
                    <Button 
                      type={selectedMonths.length === 12 ? 'primary' : 'default'}
                      size="small"
                      onClick={() => setSelectedMonths([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])}
                    >
                      FY (Full Year)
                    </Button>
                    <Button 
                      size="small"
                      onClick={() => setSelectedMonths([])}
                      disabled={selectedMonths.length === 0}
                    >
                      Clear All
                    </Button>
                    <Tag color="blue">{selectedMonths.length}/12 selected</Tag>
                  </Space>
                </div>
                
                {availableMonths.length > 0 ? (
                  <Row gutter={[8, 8]}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => (
                      <Col span={4} key={month}>
                        <Checkbox
                          checked={selectedMonths.includes(month)}
                          onChange={() => handleMonthToggle(month)}
                          style={{ width: '100%' }}
                        >
                          {monthNames[month - 1]}
                        </Checkbox>
                      </Col>
                    ))}
                  </Row>
                ) : (
                  <Alert
                    type="error"
                    showIcon
                    message={`No actual data for ${baseYear}`}
                    description="Select a different base year"
                  />
                )}
              </div>

              {/* Summary */}
              {selectedMonths.length > 0 && availableMonths.length > 0 && (
                <div style={{ padding: '10px 12px', backgroundColor: '#e6f7ff', borderLeft: '3px solid #1890ff', borderRadius: '0 4px 4px 0' }}>
                  <strong>Summary:</strong> Create {estimateYear} estimates for {selectedMonths.length === 12 ? 'FY' : `${selectedMonths.length} months`} using {baseYear} actual data ({availableMonths.length} months avg)
                </div>
              )}
            </Space>
          </Spin>
        ) : (
          /* Step 2: Review & Approve Product Group Estimates */
          <Spin spinning={approving} tip="Saving estimates...">
            <Space direction="vertical" style={{ width: '100%', height: '100%' }} size="small">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0 }}><strong>Creating {estimateYear} Estimates from {baseYear} Actuals</strong></p>
                  <p style={{ color: '#666', fontSize: '12px', margin: 0 }}>
                    {Object.keys(calculatedEstimates || {}).length} product groups × {selectedMonths.length} months
                  </p>
                </div>
              </div>

              {/* Product Group Table with Per-Row Adjustments */}
              <Table
                dataSource={Object.entries(calculatedEstimates || {}).map(([pgcombine, data]) => {
                  // Calculate base year totals (from actual data)
                  let baseAmount = 0, baseKgs = 0, baseMorm = 0;
                  Object.values(data.months || {}).forEach(monthData => {
                    baseAmount += monthData.amount || 0;
                    baseKgs += monthData.qty_kgs || 0;
                    baseMorm += monthData.morm || 0;
                  });
                  
                  // Check for KGS override first, then use adjustment %
                  const kgsOverride = pgKgsOverrides[pgcombine];
                  const adjustment = pgAdjustments[pgcombine] ?? defaultAdjustment;
                  
                  let estKgs, multiplier;
                  if (kgsOverride !== undefined) {
                    estKgs = kgsOverride;
                    multiplier = baseKgs > 0 ? kgsOverride / baseKgs : 1;
                  } else {
                    multiplier = 1 + (adjustment / 100);
                    estKgs = Math.round(baseKgs * multiplier);
                  }
                  
                  return {
                    key: pgcombine,
                    pgcombine,
                    baseKgs,
                    baseAmount,
                    baseMorm,
                    adjustment,
                    estKgs,
                    estAmount: Math.round(baseAmount * multiplier),
                    estMorm: Math.round(baseMorm * multiplier),
                    monthCount: Object.keys(data.months || {}).length
                  };
                }).sort((a, b) => {
                  // Sort alphabetically with Others second-to-last, Services Charges last
                  const pgA = (a.pgcombine || '').toUpperCase().trim();
                  const pgB = (b.pgcombine || '').toUpperCase().trim();
                  
                  // Services Charges always last
                  if (pgA === 'SERVICES CHARGES') return 1;
                  if (pgB === 'SERVICES CHARGES') return -1;
                  
                  // Others always second-to-last
                  if (pgA === 'OTHERS') return 1;
                  if (pgB === 'OTHERS') return -1;
                  
                  // Everything else alphabetical
                  return a.pgcombine.localeCompare(b.pgcombine);
                })}
                columns={[
                  {
                    title: 'Product Group',
                    dataIndex: 'pgcombine',
                    key: 'pgcombine',
                    width: 200,
                    ellipsis: true,
                    fixed: 'left'
                  },
                  {
                    title: `${baseYear} Actual KGS`,
                    dataIndex: 'baseKgs',
                    key: 'baseKgs',
                    align: 'right',
                    width: 110,
                    render: v => <span style={{ color: '#666' }}>{v.toLocaleString()}</span>
                  },
                  {
                    title: `${baseYear} Actual Sales`,
                    dataIndex: 'baseAmount',
                    key: 'baseAmount',
                    align: 'right',
                    width: 130,
                    render: v => <span style={{ color: '#666' }}><CurrencySymbol />{v.toLocaleString()}</span>
                  },
                  {
                    title: 'Adj %',
                    dataIndex: 'adjustment',
                    key: 'adjustment',
                    align: 'center',
                    width: 85,
                    render: (value, record) => (
                      <InputNumber
                        size="small"
                        value={Math.round(value * 100) / 100}
                        onChange={(val) => handlePgAdjustmentChange(record.pgcombine, val ?? 0)}
                        style={{ width: 70 }}
                        formatter={v => `${v}%`}
                        parser={v => v.replace('%', '')}
                      />
                    )
                  },
                  {
                    title: `${estimateYear} Est. KGS`,
                    dataIndex: 'estKgs',
                    key: 'estKgs',
                    align: 'right',
                    width: 130,
                    render: (value, record) => (
                      <InputNumber
                        size="small"
                        value={value}
                        onChange={(val) => handleEstKgsChange(record.pgcombine, val ?? 0, record.baseKgs)}
                        style={{ width: 110 }}
                        formatter={v => v?.toLocaleString?.() || v}
                        parser={v => v.replace(/,/g, '')}
                      />
                    )
                  },
                  {
                    title: `${estimateYear} Est. Sales`,
                    dataIndex: 'estAmount',
                    key: 'estAmount',
                    align: 'right',
                    width: 130,
                    render: v => <strong><CurrencySymbol />{v.toLocaleString()}</strong>
                  },
                  {
                    title: `${estimateYear} Est. MoRM`,
                    dataIndex: 'estMorm',
                    key: 'estMorm',
                    align: 'right',
                    width: 130,
                    render: v => <strong><CurrencySymbol />{v.toLocaleString()}</strong>
                  }
                ]}
                pagination={false}
                size="small"
                scroll={{ x: '100%', y: 'calc(100vh - 320px)' }}
                summary={pageData => {
                  const totals = pageData.reduce((acc, row) => ({
                    baseKgs: acc.baseKgs + row.baseKgs,
                    baseAmount: acc.baseAmount + row.baseAmount,
                    estKgs: acc.estKgs + row.estKgs,
                    estAmount: acc.estAmount + row.estAmount,
                    estMorm: acc.estMorm + row.estMorm
                  }), { baseKgs: 0, baseAmount: 0, estKgs: 0, estAmount: 0, estMorm: 0 });
                  
                  return (
                    <Table.Summary fixed>
                      <Table.Summary.Row style={{ backgroundColor: '#e6f7ff', fontWeight: 'bold' }}>
                        <Table.Summary.Cell index={0}><strong>GRAND TOTAL</strong></Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="right">
                          <span style={{ color: '#666' }}>{totals.baseKgs.toLocaleString()}</span>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right">
                          <span style={{ color: '#666' }}><CurrencySymbol />{totals.baseAmount.toLocaleString()}</span>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="center">-</Table.Summary.Cell>
                        <Table.Summary.Cell index={4} align="right">
                          <strong style={{ color: '#1890ff' }}>{totals.estKgs.toLocaleString()}</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={5} align="right">
                          <strong style={{ color: '#1890ff' }}><CurrencySymbol />{totals.estAmount.toLocaleString()}</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={6} align="right">
                          <strong style={{ color: '#1890ff' }}><CurrencySymbol />{totals.estMorm.toLocaleString()}</strong>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    </Table.Summary>
                  );
                }}
              />
            </Space>
          </Spin>
        )}
      </Modal>

      {/* Confirmation Modal for Replace */}
      <Modal
        title="Replace Existing Estimates"
        open={confirmReplaceVisible}
        onCancel={() => setConfirmReplaceVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setConfirmReplaceVisible(false)}>
            Cancel
          </Button>,
          <Button key="confirm" type="primary" onClick={handleConfirmReplace}>
            Yes, Replace
          </Button>
        ]}
      >
        <Alert
          type="warning"
          showIcon
          message={`${(existingEstimateCount || 0).toLocaleString()} existing estimate records will be deleted`}
          description={`Do you want to clear all existing estimates for ${estimateYear || 'selected year'} and calculate new ones?`}
        />
      </Modal>
    </div>
  );
};

export default EstimateTab;
