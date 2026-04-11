import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Table, Button, Space, Upload, Select, Radio, Modal, Spin, Tag, Statistic, Row, Col, Card, Tabs, Input, App, Progress } from 'antd';
import { UploadOutlined, DownloadOutlined, ReloadOutlined, FileExcelOutlined, WarningOutlined, CheckCircleOutlined, SearchOutlined, PlusOutlined, DeleteOutlined, LockOutlined, CloseOutlined, CopyOutlined, EditOutlined } from '@ant-design/icons';
import { useExcelData } from '../../../contexts/ExcelDataContext';
import { useFilter } from '../../../contexts/FilterContext';
import { useCurrency } from '../../../contexts/CurrencyContext';
import axios from 'axios';
import { fetchCountries } from '../../../services/countriesService';
import countryCoordinates from '../../dashboard/countryCoordinates';
import CurrencySymbol from '../../dashboard/CurrencySymbol';
import UAEDirhamSymbol from '../../dashboard/UAEDirhamSymbol';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import BulkImportTab from './BulkImportTab';
import BudgetPLTab from './BudgetPLTab';
import ManagementAllocationTab from './ManagementAllocationTab';
import LiveBudgetEntryTab from './LiveBudgetEntryTab';
import { toProperCase } from '../../../utils/normalization';
import { ResizableTitle, useResizableColumns } from '../../shared/ResizableTable';

// Admin check - TODO: Replace with proper user role system later
const IS_ADMIN = true; // Set to true for now, will be replaced with actual auth check

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const { Option } = Select;
const { Search } = Input;
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * BudgetTab Component
 * Manages budget planning data with Excel upload
 * Features:
 * - Year tabs with base period pre-selection
 * - Year-specific summaries (AMOUNT, KGS, MORM)
 * - Global search across all fields
 * - Auto-width columns (no horizontal scroll)
 */
const DIVISIONAL_IMPORT_MESSAGE_KEY = 'divisionalHtmlImport';
const SALES_REP_IMPORT_MESSAGE_KEY = 'salesRepHtmlImport';

const BudgetTab = ({ isActive }) => {
  // Get message and modal from App context (required for Ant Design v5)
  const { message, modal, notification } = App.useApp();
  
  const { selectedDivision } = useExcelData();
  const { basePeriodIndex, columnOrder } = useFilter();
  const { companyCurrency } = useCurrency(); // Get company currency for export
  
  // Helper to render currency symbol in modals (outside React context)
  // For UAE Dirham, use the SVG component directly; for others, use text symbol
  const renderModalCurrencySymbol = useCallback(() => {
    if (companyCurrency?.code === 'AED') {
      return <UAEDirhamSymbol style={{ width: '0.9em', height: '0.9em', verticalAlign: '-0.1em' }} />;
    }
    return companyCurrency?.symbol || companyCurrency?.code || '$';
  }, [companyCurrency]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0 });
  
  // All unique values for filters (from entire database, not just current page)
  const [filterOptions, setFilterOptions] = useState({});
  
  // Year tabs and summary
  const [availableYears, setAvailableYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [yearSummary, setYearSummary] = useState(null);
  
  // Global search
  const [globalSearch, setGlobalSearch] = useState('');
  
  // HTML Format sub-tabs (Divisional Budget vs Sales Budget)
  const [activeHtmlSubTab, setActiveHtmlSubTab] = useState('divisional');
  const [activeDivisionalSubTab, setActiveDivisionalSubTab] = useState('product-group');
  const [activeSalesBudgetSubTab, setActiveSalesBudgetSubTab] = useState('management'); // Default to Management Allocation tab
  
  // HTML tab filter data (Sales Rep)
  const [htmlActualYears, setHtmlActualYears] = useState([]);
  const [htmlSalesRepOptions, setHtmlSalesRepOptions] = useState([]);
  const [htmlSalesRepIds, setHtmlSalesRepIds] = useState([]);
  const [htmlSalesRepLabelMap, setHtmlSalesRepLabelMap] = useState({});
  const [htmlGroups, setHtmlGroups] = useState({});
  const [htmlFilters, setHtmlFilters] = useState({ actualYear: null, salesRep: null });
  const [htmlFiltersLoading, setHtmlFiltersLoading] = useState(false);
  
  // Divisional HTML Budget state
  const [divisionalHtmlActualYears, setDivisionalHtmlActualYears] = useState([]);
  const [divisionalHtmlBudgetYears, setDivisionalHtmlBudgetYears] = useState([]);
  const [divisionalHtmlBudgetYear, setDivisionalHtmlBudgetYear] = useState(null);
  const [divisionalHtmlFilters, setDivisionalHtmlFilters] = useState({ actualYear: null });
  const [divisionalHtmlFiltersLoading, setDivisionalHtmlFiltersLoading] = useState(false);
  const [divisionalHtmlTableData, setDivisionalHtmlTableData] = useState([]); // [{ productGroup, monthlyActual: {1: value, 2: value, ...} }]
  const [divisionalHtmlBudgetData, setDivisionalHtmlBudgetData] = useState({}); // { "productGroup|month": value }
  const [divisionalBudgetDetailed, setDivisionalBudgetDetailed] = useState({}); // { "productGroup|month": {mt, amount, morm} } - Stored DB values
  const [divisionalHtmlTableLoading, setDivisionalHtmlTableLoading] = useState(false);
  const [divisionalDraftStatus, setDivisionalDraftStatus] = useState('saved');
  const [divisionalLastSaveTime, setDivisionalLastSaveTime] = useState(null);
  const [divisionalActualBudgetYear, setDivisionalActualBudgetYear] = useState(null); // Actual budget year returned from API
  const [divisionalBudgetStatus, setDivisionalBudgetStatus] = useState('draft'); // 'draft' or 'approved' - from database
  const [isSubmittingDivisional, setIsSubmittingDivisional] = useState(false);
  const [isEditingDivisional, setIsEditingDivisional] = useState(false); // Loading state for Edit button
  const [submitDivisionalConfirmVisible, setSubmitDivisionalConfirmVisible] = useState(false);
  const [editDivisionalConfirmVisible, setEditDivisionalConfirmVisible] = useState(false); // Confirm modal for Edit
  const [divisionalPricingData, setDivisionalPricingData] = useState({}); // { "productgroup": { sellingPrice, morm } }
  const [servicesChargesData, setServicesChargesData] = useState(null); // { productGroup, isServiceCharges, monthlyActual }
  
  // Ref to track fetch requests and prevent race conditions
  const divisionalFetchIdRef = useRef(0);
  const [servicesChargesBudget, setServicesChargesBudget] = useState({}); // { "Services Charges|month|AMOUNT": value, "...|MORM": value }
  
  // HTML tab table data
  const [htmlTableData, setHtmlTableData] = useState([]);
  const [htmlBudgetData, setHtmlBudgetData] = useState({}); // { "customer|country|group|month": value }
  const [htmlTableLoading, setHtmlTableLoading] = useState(false);
  const [htmlSaving, setHtmlSaving] = useState(false);
  // isAllSalesReps is now derived from htmlFilters.salesRep to prevent state sync issues
  const [allSalesRepsTableData, setAllSalesRepsTableData] = useState([]);
  const [htmlPricingData, setHtmlPricingData] = useState({}); // { "productgroup": { sellingPrice, morm } } - Sales Rep pricing
  const [htmlStoredBudgetTotals, setHtmlStoredBudgetTotals] = useState({ kgs: 0, amount: 0, morm: 0 }); // Stored totals from DB
  const [targetSalesRep, setTargetSalesRep] = useState(null); // Target sales rep for actions in All Sales Reps mode
  
  // Column filters for All Sales Reps view
  const [columnFilters, setColumnFilters] = useState({
    salesRep: '',
    customer: '',
    country: '',
    productGroup: ''
  });
  
  // Custom rows (new budget rows with + button)
  const [htmlCustomRows, setHtmlCustomRows] = useState([]); // [{ id, customer, country, productGroup, isNewCustomer }]
  const [htmlCountries, setHtmlCountries] = useState([]); // List of countries from global reference
  const [htmlProductGroups, setHtmlProductGroups] = useState([]);
  const [allProductGroups, setAllProductGroups] = useState([]); // Unfiltered product groups for custom rows // List of product groups for division
  const [htmlMergedCustomers, setHtmlMergedCustomers] = useState([]); // List of merged customer names from table
  const [newCustomerInputs, setNewCustomerInputs] = useState({}); // { rowId: inputValue }
  
  // Draft management
  const [draftStatus, setDraftStatus] = useState('saved'); // 'saving', 'saved', 'error'
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [hasDraft, setHasDraft] = useState(false);
  
  // Sales Rep Recap state
  const [recapYears, setRecapYears] = useState([]);
  const [recapSelectedYear, setRecapSelectedYear] = useState(null);
  const [recapSalesReps, setRecapSalesReps] = useState([]);
  const [recapSelectedSalesRep, setRecapSelectedSalesRep] = useState(null);
  const [recapData, setRecapData] = useState([]);
  const [recapLoading, setRecapLoading] = useState(false);
  const [recapYearsLoading, setRecapYearsLoading] = useState(false);
  const [recapSalesRepsLoading, setRecapSalesRepsLoading] = useState(false);
  
  // Product Group Table state
  const [recapTableSalesRep, setRecapTableSalesRep] = useState('__ALL__');
  const [recapProductGroups, setRecapProductGroups] = useState([]);
  const [recapProductGroupsLoading, setRecapProductGroupsLoading] = useState(false);

  // Derived state: isAllSalesReps - ensures single source of truth
  // This prevents race conditions when switching sales reps where the old useState
  // could get out of sync with htmlFilters.salesRep
  const isAllSalesReps = useMemo(() => htmlFilters.salesRep === '__ALL__', [htmlFilters.salesRep]);

  // Fetch countries from master_countries database table (199 countries)
  const fetchHtmlCountries = useCallback(async () => {
    try {
      // Use countriesService which fetches from master_countries table with 5-min cache
      const countries = await fetchCountries();
      if (countries && countries.length > 0) {
        // Extract just country names and sort
        const countryNames = countries.map(c => c.country_name).sort((a, b) => a.localeCompare(b));
        setHtmlCountries(countryNames);
      } else {
        // Fallback to /api/world-countries if primary fails
        console.warn('Master countries API failed, falling back to world-countries');
        const fallbackResponse = await axios.get(`${API_BASE_URL}/api/world-countries`);
        if (fallbackResponse.data.success && fallbackResponse.data.countries) {
          setHtmlCountries(fallbackResponse.data.countries);
        } else if (countryCoordinates && typeof countryCoordinates === 'object') {
          const allCountries = Object.keys(countryCoordinates);
          setHtmlCountries(allCountries.sort((a, b) => a.localeCompare(b)));
        } else {
          setHtmlCountries([]);
        }
      }
    } catch (error) {
      console.error('Error fetching master countries:', error);
      // Fallback to static countryCoordinates
      if (countryCoordinates && typeof countryCoordinates === 'object') {
        const allCountries = Object.keys(countryCoordinates);
        setHtmlCountries(allCountries.sort((a, b) => a.localeCompare(b)));
      } else {
        setHtmlCountries([]);
      }
    }
  }, []);
  // Map raw sales rep to display label
  const getSalesRepDisplayLabel = useCallback((rawSalesRep) => {
    if (!rawSalesRep) return '';
    
    const normalized = rawSalesRep.toString().trim().toUpperCase();
    
    // Check if this rep is in a group
    for (const [groupName, members] of Object.entries(htmlGroups)) {
      if (members && members.includes(normalized)) {
        return groupName; // e.g., "Group 1"
      }
    }
    
    // Otherwise use label map or format individual
    return htmlSalesRepLabelMap[normalized] || rawSalesRep;
  }, [htmlGroups, htmlSalesRepLabelMap]);
  
  // Get unique values for dropdown filters (CASCADING - filtered based on current selections)
  const filterDropdownOptions = useMemo(() => {
    if (!isAllSalesReps || !htmlTableData.length) {
      return { salesReps: [], customers: [], countries: [], productGroups: [] };
    }
    
    // Helper to filter data based on current selections (excluding the filter being populated)
    const getFilteredData = (excludeFilter) => {
      return htmlTableData.filter(row => {
        const salesRepDisplayLabel = getSalesRepDisplayLabel(row.salesRep);
        const salesRepMatch = excludeFilter === 'salesRep' || !columnFilters.salesRep || salesRepDisplayLabel === columnFilters.salesRep;
        const customerMatch = excludeFilter === 'customer' || !columnFilters.customer || row.customer === columnFilters.customer;
        const countryMatch = excludeFilter === 'country' || !columnFilters.country || row.country === columnFilters.country;
        const productGroupMatch = excludeFilter === 'productGroup' || !columnFilters.productGroup || row.productGroup === columnFilters.productGroup;
        
        return salesRepMatch && customerMatch && countryMatch && productGroupMatch;
      });
    };
    
    // Get options for each filter based on other current selections
    const salesRepData = getFilteredData('salesRep');
    const customerData = getFilteredData('customer');
    const countryData = getFilteredData('country');
    const productGroupData = getFilteredData('productGroup');
    
    const salesRepLabels = [...new Set(salesRepData.map(row => getSalesRepDisplayLabel(row.salesRep)).filter(Boolean))].sort();
    const customers = [...new Set(customerData.map(row => row.customer).filter(Boolean))].sort();
    const countries = [...new Set(countryData.map(row => row.country).filter(Boolean))].sort();
    const productGroups = [...new Set(productGroupData.map(row => row.productGroup).filter(Boolean))].sort();
    
    return { salesReps: salesRepLabels, customers, countries, productGroups };
  }, [htmlTableData, isAllSalesReps, getSalesRepDisplayLabel, columnFilters]);
  
  // Filter table data based on column filters
  const filteredHtmlTableData = useMemo(() => {
    let data = htmlTableData;
    
    // Apply filters for "All Sales Reps" mode
    if (isAllSalesReps && Object.values(columnFilters).some(f => f)) {
      data = data.filter(row => {
        const salesRepDisplayLabel = getSalesRepDisplayLabel(row.salesRep);
        const salesRepMatch = !columnFilters.salesRep || salesRepDisplayLabel === columnFilters.salesRep;
        const customerMatch = !columnFilters.customer || row.customer === columnFilters.customer;
        const countryMatch = !columnFilters.country || row.country === columnFilters.country;
        const productGroupMatch = !columnFilters.productGroup || row.productGroup === columnFilters.productGroup;
        
        return salesRepMatch && customerMatch && countryMatch && productGroupMatch;
      });
    }
    
    // Always sort by customer -> country -> productGroup for consistent ordering
    return [...data].sort((a, b) => {
      const customerCompare = (a.customer || '').localeCompare(b.customer || '');
      if (customerCompare !== 0) return customerCompare;
      const countryCompare = (a.country || '').localeCompare(b.country || '');
      if (countryCompare !== 0) return countryCompare;
      return (a.productGroup || '').localeCompare(b.productGroup || '');
    });
  }, [htmlTableData, isAllSalesReps, columnFilters, getSalesRepDisplayLabel]);
  
  // Handle filter change
  const handleColumnFilterChange = (column, value) => {
    setColumnFilters(prev => ({
      ...prev,
      [column]: value
    }));
  };
  
  // Clear all filters
  const clearAllFilters = () => {
    setColumnFilters({
      salesRep: '',
      customer: '',
      country: '',
      productGroup: ''
    });
  };
  
  const htmlMonthlyActualTotals = useMemo(() => {
    const totals = {};
    for (let month = 1; month <= 12; month++) {
      totals[month] = 0;
    }
    const dataToSum = isAllSalesReps ? filteredHtmlTableData : htmlTableData;
    dataToSum.forEach(row => {
      for (let month = 1; month <= 12; month++) {
        totals[month] += row.monthlyActual?.[month] || 0;
      }
    });
    return totals;
  }, [htmlTableData, filteredHtmlTableData, isAllSalesReps]);
  
  // Calculate total sum of all 12 months for actual
  const htmlActualYearTotal = useMemo(() => {
    return Object.values(htmlMonthlyActualTotals).reduce((sum, value) => sum + (value || 0), 0);
  }, [htmlMonthlyActualTotals]);

  // Helper to find pricing for a product group (Sales Rep)
  const findHtmlPricing = useCallback((productGroup) => {
    if (!productGroup || !htmlPricingData) return { sellingPrice: 0, morm: 0 };
    const normalizedKey = productGroup.toLowerCase().trim();
    if (htmlPricingData[normalizedKey]) {
      return htmlPricingData[normalizedKey];
    }
    // Try case-insensitive match
    for (const key of Object.keys(htmlPricingData)) {
      if (key.toLowerCase().trim() === normalizedKey) {
        return htmlPricingData[key];
      }
    }
    return { sellingPrice: 0, morm: 0 };
  }, [htmlPricingData]);

  // Calculate monthly Actual Amount totals for Sales Rep (from database - actual invoiced amounts)
  const htmlMonthlyActualAmountTotals = useMemo(() => {
    const totals = {};
    for (let month = 1; month <= 12; month++) {
      totals[month] = 0;
    }
    const dataToSum = isAllSalesReps ? filteredHtmlTableData : htmlTableData;
    dataToSum.forEach(row => {
      for (let month = 1; month <= 12; month++) {
        // Use actual Amount from database (monthlyActualAmount), not recalculated
        totals[month] += row.monthlyActualAmount?.[month] || 0;
      }
    });
    return totals;
  }, [htmlTableData, filteredHtmlTableData, isAllSalesReps]);
  
  // Calculate total sum of all 12 months for actual amount
  const htmlActualAmountYearTotal = useMemo(() => {
    return Object.values(htmlMonthlyActualAmountTotals).reduce((sum, value) => sum + (value || 0), 0);
  }, [htmlMonthlyActualAmountTotals]);

  // Calculate monthly Actual MoRM totals for Sales Rep (from database)
  const htmlMonthlyActualMormTotals = useMemo(() => {
    const totals = {};
    for (let month = 1; month <= 12; month++) {
      totals[month] = 0;
    }
    const dataToSum = isAllSalesReps ? filteredHtmlTableData : htmlTableData;
    dataToSum.forEach(row => {
      for (let month = 1; month <= 12; month++) {
        totals[month] += row.monthlyActualMorm?.[month] || 0;
      }
    });
    return totals;
  }, [htmlTableData, filteredHtmlTableData, isAllSalesReps]);
  
  // Calculate total sum of all 12 months for actual morm
  const htmlActualMormYearTotal = useMemo(() => {
    return Object.values(htmlMonthlyActualMormTotals).reduce((sum, value) => sum + (value || 0), 0);
  }, [htmlMonthlyActualMormTotals]);

  const htmlMonthlyBudgetTotals = useMemo(() => {
    const totals = {};
    for (let month = 1; month <= 12; month++) {
      totals[month] = 0;
    }
    Object.keys(htmlBudgetData).forEach(key => {
      let month;
      if (key.startsWith('custom_')) {
        // Custom row format: custom_rowId_month
        const parts = key.split('_');
        month = parts[parts.length - 1];
      } else {
        // Regular row format: customer|country|group|month
        const parts = key.split('|');
        month = parts[parts.length - 1];
      }
      const value = htmlBudgetData[key];
      const num = parseFloat(value?.toString().replace(/,/g, '')) || 0;
      if (!Number.isNaN(num) && month) {
        const monthNum = parseInt(month, 10);
        if (monthNum >= 1 && monthNum <= 12) {
          totals[monthNum] += num;
        }
      }
    });
    return totals;
  }, [htmlBudgetData]);
  
  // Calculate total sum of all 12 months for budget
  const htmlBudgetYearTotal = useMemo(() => {
    return Object.values(htmlMonthlyBudgetTotals).reduce((sum, value) => sum + (value || 0), 0);
  }, [htmlMonthlyBudgetTotals]);

  // Calculate monthly Amount totals for Sales Rep (MT * 1000 * sellingPrice for each product group)
  const htmlMonthlyAmountTotals = useMemo(() => {
    const totals = {};
    for (let month = 1; month <= 12; month++) {
      totals[month] = 0;
    }
    // Process regular budget data
    Object.keys(htmlBudgetData).forEach(key => {
      let month, productGroup;
      if (key.startsWith('custom_')) {
        // Custom row - need to look up product group from htmlCustomRows
        // Format: custom_rowId_month
        const parts = key.split('_');
        month = parseInt(parts[parts.length - 1], 10);
        const rowId = parseInt(parts[1], 10);
        const customRow = htmlCustomRows.find(r => r.id === rowId);
        productGroup = customRow?.productGroup;
      } else {
        // Check key format - could be:
        // All Sales Reps: salesRep|customer|country|productGroup|month (5 parts)
        // Single Rep: customer|country|productGroup|month (4 parts)
        const parts = key.split('|');
        if (parts.length === 5) {
          // All Sales Reps format
          productGroup = parts[3];
          month = parseInt(parts[4], 10);
        } else {
          // Single rep format
          productGroup = parts[2];
          month = parseInt(parts[3], 10);
        }
      }
      if (productGroup && month >= 1 && month <= 12) {
        const value = htmlBudgetData[key];
        const mtValue = parseFloat(value?.toString().replace(/,/g, '')) || 0;
        const pricing = findHtmlPricing(productGroup);
        // MT to KGS (×1000), then multiply by selling price
        totals[month] += mtValue * 1000 * pricing.sellingPrice;
      }
    });
    return totals;
  }, [htmlBudgetData, htmlCustomRows, findHtmlPricing]);
  
  // Calculate monthly MoRM totals for Sales Rep (MT * 1000 * morm for each product group)
  const htmlMonthlyMormTotals = useMemo(() => {
    const totals = {};
    for (let month = 1; month <= 12; month++) {
      totals[month] = 0;
    }
    // Process regular budget data
    Object.keys(htmlBudgetData).forEach(key => {
      let month, productGroup;
      if (key.startsWith('custom_')) {
        // Custom row - need to look up product group from htmlCustomRows
        const parts = key.split('_');
        month = parseInt(parts[parts.length - 1], 10);
        const rowId = parseInt(parts[1], 10);
        const customRow = htmlCustomRows.find(r => r.id === rowId);
        productGroup = customRow?.productGroup;
      } else {
        // Check key format - could be:
        // All Sales Reps: salesRep|customer|country|productGroup|month (5 parts)
        // Single Rep: customer|country|productGroup|month (4 parts)
        const parts = key.split('|');
        if (parts.length === 5) {
          // All Sales Reps format
          productGroup = parts[3];
          month = parseInt(parts[4], 10);
        } else {
          // Single rep format
          productGroup = parts[2];
          month = parseInt(parts[3], 10);
        }
      }
      if (productGroup && month >= 1 && month <= 12) {
        const value = htmlBudgetData[key];
        const mtValue = parseFloat(value?.toString().replace(/,/g, '')) || 0;
        const pricing = findHtmlPricing(productGroup);
        // MT to KGS (×1000), then multiply by morm
        totals[month] += mtValue * 1000 * pricing.morm;
      }
    });
    return totals;
  }, [htmlBudgetData, htmlCustomRows, findHtmlPricing]);
  
  // Grand totals for Amount and MoRM (Sales Rep)
  const htmlAmountYearTotal = useMemo(() => {
    return Object.values(htmlMonthlyAmountTotals).reduce((sum, val) => sum + val, 0);
  }, [htmlMonthlyAmountTotals]);
  
  const htmlMormYearTotal = useMemo(() => {
    return Object.values(htmlMonthlyMormTotals).reduce((sum, val) => sum + val, 0);
  }, [htmlMonthlyMormTotals]);
  
  // Calculate unique customer counts for Budget vs Actual Summary
  const htmlActualCustomerCount = useMemo(() => {
    const dataToCount = isAllSalesReps ? filteredHtmlTableData : htmlTableData;
    const uniqueCustomers = new Set(dataToCount.map(row => row.customer).filter(Boolean));
    return uniqueCustomers.size;
  }, [htmlTableData, filteredHtmlTableData, isAllSalesReps]);
  
  const htmlBudgetCustomerCount = useMemo(() => {
    const dataToCount = isAllSalesReps ? filteredHtmlTableData : htmlTableData;
    // Count customers with budget entries + custom rows
    const customersWithBudget = new Set();
    
    // From existing rows with budget data
    dataToCount.forEach(row => {
      for (let month = 1; month <= 12; month++) {
        // For All Sales Reps mode, use salesRep|customer|country|productGroup|month format
        // For single sales rep mode, use customer|country|productGroup|month format
        const key = isAllSalesReps && row.salesRep
          ? `${row.salesRep}|${row.customer}|${row.country}|${row.productGroup}|${month}`
          : `${row.customer}|${row.country}|${row.productGroup}|${month}`;
        if (htmlBudgetData[key] && parseFloat(htmlBudgetData[key]) > 0) {
          customersWithBudget.add(row.customer);
          break;
        }
      }
    });
    
    // Add custom rows with data
    htmlCustomRows.forEach(row => {
      if (row.customer) {
        for (let month = 1; month <= 12; month++) {
          const key = `custom_${row.id}_${month}`;
          if (htmlBudgetData[key] && parseFloat(htmlBudgetData[key]) > 0) {
            customersWithBudget.add(row.customer);
            break;
          }
        }
      }
    });
    
    return customersWithBudget.size;
  }, [htmlTableData, filteredHtmlTableData, isAllSalesReps, htmlBudgetData, htmlCustomRows]);
  
  // Upload modal state
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploadMode, setUploadMode] = useState('replace');  // Default to replace for budget
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadedBy, setUploadedBy] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStartTime, setUploadStartTime] = useState(null);
  const progressIntervalRef = useRef(null);
  
  // Cleanup progressIntervalRef on component unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, []);
  
  // File preview and selection state
  const [uploadStep, setUploadStep] = useState(1); // 1: basic info, 2: year/month selection
  const [fileYearMonths, setFileYearMonths] = useState([]); // [{year, month, count}]
  const [selectedYearMonths, setSelectedYearMonths] = useState([]); // ['2025-1', '2025-2']
  const [selectiveMode, setSelectiveMode] = useState('all'); // 'all' or 'selective'
  const [analyzingFile, setAnalyzingFile] = useState(false);
  
  // Result modal state
  const [resultModalVisible, setResultModalVisible] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  // Fetch available years
  const fetchAvailableYears = async () => {
    if (!selectedDivision) return;
    
    try {
      const response = await axios.get(`${API_BASE_URL}/api/aebf/filter-options`, {
        params: { division: selectedDivision, type: 'Budget' }
      });
      
      if (response.data.success) {
        const years = response.data.data.filterOptions.year || [];
        setAvailableYears(years.sort((a, b) => b - a)); // Descending
        
        // Store all filter options for column filters
        setFilterOptions(response.data.data.filterOptions);
        
        // Set default year based on base period
        if (years.length > 0 && !selectedYear) {
          let defaultYear = years[0]; // Latest year by default
          
          // Try to get year from base period
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

  const formatSalesRepLabel = (name = '') => {
    return name
      .toString()
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const fetchHtmlSalesRepOptions = async (
    targetYear,
    overrideGroups,
    overrideSalesRepIds,
    overrideLabelMap,
    showLoader = true
  ) => {
    if (!selectedDivision || !targetYear) {
      if (showLoader) {
        setHtmlFiltersLoading(false);
      }
      setHtmlSalesRepOptions([]);
      setHtmlFilters(prev => ({ ...prev, salesRep: null }));
      return;
    }
    
    if (showLoader) {
      setHtmlFiltersLoading(true);
    }
    
    try {
      const groupsMap = overrideGroups || htmlGroups;
      const salesRepIds = overrideSalesRepIds || htmlSalesRepIds;
      const labelMap = overrideLabelMap || htmlSalesRepLabelMap;
      
      if (!salesRepIds.length) {
        setHtmlSalesRepOptions([]);
        setHtmlFilters(prev => ({ ...prev, salesRep: null }));
        return;
      }
      
      const monthsFullYear = [1,2,3,4,5,6,7,8,9,10,11,12];
      const columnKey = `actual-${targetYear}`;
      
      const response = await axios.post(`${API_BASE_URL}/api/sales-rep-divisional-ultra-fast`, {
        division: selectedDivision,
        salesReps: salesRepIds,
        columns: [{
          year: parseInt(targetYear, 10),
          month: 'Year',
          months: monthsFullYear,
          type: 'Actual',
          columnKey,
        }]
      });
      
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Failed to load sales reps');
      }
      
      const data = response.data?.data || {};
      const repsWithSales = new Set();
      
      Object.entries(data).forEach(([rep, values]) => {
        const normalized = rep?.toString().trim().toUpperCase();
        if (!normalized) return;
        const total = Math.abs(values?.[columnKey] || 0);
        if (total > 0) {
          repsWithSales.add(normalized);
        }
      });
      
      const options = [
        { value: '__ALL__', label: '🌐 All Sales Reps', style: { fontWeight: 600, color: '#1890ff' } }
      ];
      const groupedMembers = new Set();
      
      Object.keys(groupsMap).forEach(groupName => {
        const members = groupsMap[groupName] || [];
        const hasData = members.some(member => repsWithSales.has(member));
        if (hasData) {
          options.push({ value: groupName, label: groupName });
          members.forEach(m => groupedMembers.add(m));
        }
      });
      
      repsWithSales.forEach(rep => {
        if (!groupedMembers.has(rep)) {
          // Use proper case name from labelMap as the value (for export/API calls)
          const properCaseName = labelMap[rep] || formatSalesRepLabel(rep);
          options.push({
            value: properCaseName,
            label: properCaseName,
          });
        }
      });
      
      setHtmlSalesRepOptions(options);
      setHtmlFilters(prev => ({
        ...prev,
        salesRep: options.some(option => option.value.toUpperCase() === prev.salesRep?.toUpperCase()) ? prev.salesRep : null,
      }));
    } catch (error) {
      console.error('Error fetching HTML sales rep options:', error);
      message.error('Failed to load sales reps for HTML view.');
      setHtmlSalesRepOptions([]);
      setHtmlFilters(prev => ({ ...prev, salesRep: null }));
    } finally {
      if (showLoader) {
        setHtmlFiltersLoading(false);
      }
    }
  };

  // Fetch Actual data filter options for HTML tab
  const fetchHtmlFilterOptions = async () => {
    if (!selectedDivision) return;
    
    setHtmlFiltersLoading(true);
    try {
      const [filterResponse, groupsResponse, salesRepsResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/aebf/filter-options`, {
          params: { division: selectedDivision, type: 'Actual' }
        }),
        axios.get(`${API_BASE_URL}/api/sales-rep-groups-universal`, {
          params: { division: selectedDivision }
        }),
        axios.get(`${API_BASE_URL}/api/sales-reps-universal`, {
          params: { division: selectedDivision }
        })
      ]);
      
      if (filterResponse.data.success) {
        const yearsRaw = filterResponse.data.data.filterOptions.year || [];
        const normalizedYears = yearsRaw
          .map((year) => (typeof year === 'number' ? year : parseInt(year, 10)))
          .filter((year) => !Number.isNaN(year));
        const sortedYears = [...new Set(normalizedYears)].sort((a, b) => b - a);
        setHtmlActualYears(sortedYears);
        
        const groupsData = groupsResponse.data?.data || {};
        const normalizedGroups = {};
        Object.keys(groupsData).forEach((groupName) => {
          const members = Array.isArray(groupsData[groupName]) ? groupsData[groupName] : [];
          normalizedGroups[groupName] = members
            .filter(Boolean)
            .map((member) => member.toString().trim().toUpperCase());
        });
        setHtmlGroups(normalizedGroups);
        
        const repsData = salesRepsResponse.data?.data || [];
        const normalizedIds = [];
        const labelMap = {};
        repsData.forEach((rep) => {
          if (!rep) return;
          const normalized = rep.toString().trim().toUpperCase();
          if (!normalized) return;
          normalizedIds.push(normalized);
          labelMap[normalized] = rep;
        });
        const dedupedIds = Array.from(new Set(normalizedIds));
        setHtmlSalesRepIds(dedupedIds);
        setHtmlSalesRepLabelMap(labelMap);
        
        let nextActual = htmlFilters.actualYear;
        if (!nextActual || !sortedYears.includes(nextActual)) {
          nextActual = sortedYears[0] ?? null;
        }
        
        setHtmlFilters({
          actualYear: nextActual,
          salesRep: null,
        });
        
        if (nextActual) {
          await fetchHtmlSalesRepOptions(
            nextActual,
            normalizedGroups,
            dedupedIds,
            labelMap,
            false
          );
        } else {
          setHtmlSalesRepOptions([]);
        }
      }
    } catch (error) {
      console.error('Error fetching HTML filter options:', error);
      message.error('Failed to load Actual years and sales reps for HTML view.');
      setHtmlSalesRepOptions([]);
      setHtmlFilters({ actualYear: null, salesRep: null });
    } finally {
      setHtmlFiltersLoading(false);
    }
  };

  // Fetch year-specific summary (with optional search filter)
  const fetchYearSummary = async (year, searchFilter = '') => {
    if (!selectedDivision) return;
    
    try {
      const params = { 
        division: selectedDivision, 
        type: 'Budget'
      };
      
      if (searchFilter && searchFilter.trim()) {
        // When searching, get summary for ALL years
        params.search = searchFilter.trim();
      } else {
        // Only filter by year when NOT searching
        if (year) {
          params.year = year;
        }
      }
      
      const response = await axios.get(`${API_BASE_URL}/api/aebf/year-summary`, { params });
      
      if (response.data.success) {
        setYearSummary(response.data.data.summary);
      }
    } catch (error) {
      console.error('Error fetching year summary:', error);
    }
  };

  // Fetch data with year and search filters
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
        pageSize
      };
      
      // Add year filter if selected
      if (selectedYear) {
        params.year = selectedYear;
      }
      
      // Add global search (use parameter if provided, otherwise use state)
      const search = searchFilter !== null ? searchFilter : globalSearch;
      if (search && search.trim()) {
        params.search = search.trim();
      }
      
      const response = await axios.get(`${API_BASE_URL}/api/aebf/budget`, { params });
      
      if (response.data.success) {
        setData(response.data.data.data.map(item => ({ ...item, key: item.id })));
        setPagination({
          current: response.data.data.pagination.page,
          pageSize: response.data.data.pagination.pageSize,
          total: response.data.data.pagination.total,
        });
      } else {
        message.error('Failed to load data');
      }
    } catch (error) {
      console.error('Error fetching budget data:', error);
      message.error('Failed to load budget data. Please check if server is running.');
    } finally {
      setLoading(false);
    }
  };

  // Handle year tab change
  const handleYearChange = (year) => {
    setSelectedYear(parseInt(year));
    setGlobalSearch(''); // Clear search when changing year
  };

  // Handle global search
  const handleSearch = (value) => {
    setGlobalSearch(value);
    setPagination({ ...pagination, current: 1 }); // Reset to first page
    
    // Update summary with search filter
    if (selectedYear) {
      fetchYearSummary(selectedYear, value);
    }
    
    // Fetch data with search filter (pass value directly)
    fetchData(1, pagination.pageSize, value);
  };
  
  // Handle search input change
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setGlobalSearch(value);
    
    // If user clears the search box, trigger search immediately
    if (value === '') {
      if (selectedYear) {
        fetchYearSummary(selectedYear, '');
      }
      fetchData(1, pagination.pageSize, '');
    }
  };

  // Handle file selection
  const handleFileSelect = (file) => {
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    if (!isExcel) {
      message.error('Please upload an Excel file (.xlsx or .xls)');
      return false;
    }
    
    setSelectedFile(file);
    setUploadStep(1);
    setFileYearMonths([]);
    setSelectedYearMonths([]);
    setSelectiveMode('all');
    setUploadModalVisible(true);
    return false; // Prevent auto upload
  };
  
  // Analyze file to get year/month combinations
  const analyzeFile = async () => {
    if (!selectedFile) return;
    
    setAnalyzingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      
      const response = await axios.post(`${API_BASE_URL}/api/aebf/analyze-file`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      
      if (response.data.success) {
        // Data is wrapped inside response.data.data by successResponse helper
        const yearMonths = response.data.data?.yearMonths || response.data.yearMonths || [];
        setFileYearMonths(yearMonths);
        // Pre-select all by default
        const allKeys = yearMonths.map(ym => `${ym.year}-${ym.month}`);
        setSelectedYearMonths(allKeys);
        setUploadStep(2);
      } else {
        message.error('Failed to analyze file');
      }
    } catch (error) {
      console.error('Error analyzing file:', error);
      message.error('Failed to analyze file structure');
    } finally {
      setAnalyzingFile(false);
    }
  };
  
  // Handle year/month selection
  const handleYearMonthToggle = (yearMonth) => {
    if (selectedYearMonths.includes(yearMonth)) {
      setSelectedYearMonths(selectedYearMonths.filter(ym => ym !== yearMonth));
    } else {
      setSelectedYearMonths([...selectedYearMonths, yearMonth]);
    }
  };
  
  // Select/Deselect all year/months
  const handleSelectAll = () => {
    const allKeys = fileYearMonths.map(ym => `${ym.year}-${ym.month}`);
    setSelectedYearMonths(allKeys);
  };
  
  const handleDeselectAll = () => {
    setSelectedYearMonths([]);
  };
  
  // Go to next step (analyze file)
  const handleNextStep = () => {
    if (selectiveMode === 'selective') {
      analyzeFile();
    } else {
      // All mode, go straight to upload
      handleTransformLoad();
    }
  };
  
  // Handle Transform & Load
  const handleTransformLoad = async () => {
    if (!selectedFile || !uploadedBy.trim() || !selectedDivision) {
      message.error('Please fill all required fields');
      return;
    }
    
    setUploading(true);
    setUploadProgress(0);
    const startTime = Date.now();
    setUploadStartTime(startTime);
    
    // Clear any existing interval
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    
    // Simulate progress (0-90% over 5 minutes, then wait for completion)
    progressIntervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000; // seconds
      const estimatedTotal = 300; // 5 minutes
      const progress = Math.min(90, (elapsed / estimatedTotal) * 90);
      setUploadProgress(progress);
    }, 1000); // Update every second
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('division', selectedDivision);
      formData.append('uploadMode', uploadMode);
      formData.append('uploadedBy', uploadedBy);
      formData.append('currency', companyCurrency?.code || 'AED');
      
      // Add selective year/month filter if in selective mode
      if (selectiveMode === 'selective' && selectedYearMonths.length > 0) {
        formData.append('selectedYearMonths', selectedYearMonths.join(','));
      }
      
      // Debug: Log FormData contents
      
      // Note: Do NOT set Content-Type header manually - axios will set it automatically
      // with the correct boundary parameter that multer needs to parse the form data
      const response = await axios.post(`${API_BASE_URL}/api/aebf/upload-budget`, formData, {
        timeout: 300000, // 5 minutes
      });
      
      if (response.data.success) {
        // Set progress to 100% on success
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
        setUploadProgress(100);
        
        setUploadResult(response.data);
        setUploadModalVisible(false);
        setResultModalVisible(true);
        fetchAvailableYears();
        fetchData();
        if (selectedYear) {
          fetchYearSummary(selectedYear);
        }
      } else {
        message.error(response.data.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      message.error(error.response?.data?.error || 'Upload failed. Please check the logs.');
    } finally {
      // Clear progress interval
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Handle Excel export
  const handleExport = async () => {
    if (!selectedDivision) {
      message.warning('Please select a division first');
      return;
    }
    
    try {
      const params = {
        division: selectedDivision,
      };
      
      if (selectedYear) {
        params.year = selectedYear;
      }
      
      if (globalSearch.trim()) {
        params.search = globalSearch.trim();
      }
      
      const queryString = new URLSearchParams(params).toString();
      window.open(`${API_BASE_URL}/api/aebf/export-budget?${queryString}`, '_blank');
      
      message.success('Export started. File will download shortly.');
    } catch (error) {
      console.error('Export error:', error);
      message.error('Export failed');
    }
  };

  // Base columns definition (widths will be managed by useResizableColumns)
  const baseColumns = useMemo(() => [
    {
      title: 'Year',
      dataIndex: 'year',
      key: 'year',
      width: 65,
      sorter: (a, b) => a.year - b.year,
    },
    {
      title: 'Month',
      dataIndex: 'month',
      key: 'month',
      width: 65,
      sorter: (a, b) => a.month - b.month,
    },
    {
      title: 'Sales Rep',
      dataIndex: 'salesrepname',
      key: 'salesrepname',
      width: 150,
      ellipsis: true,
    },
    {
      title: 'Customer',
      dataIndex: 'customername',
      key: 'customername',
      width: 180,
      ellipsis: true,
    },
    {
      title: 'Country',
      dataIndex: 'countryname',
      key: 'countryname',
      width: 100,
      ellipsis: true,
    },
    {
      title: 'Product Group',
      dataIndex: 'productgroup',
      key: 'productgroup',
      width: 150,
      ellipsis: true,
    },
    {
      title: 'Material',
      dataIndex: 'material',
      key: 'material',
      width: 85,
      ellipsis: true,
    },
    {
      title: 'Process',
      dataIndex: 'process',
      key: 'process',
      width: 85,
      ellipsis: true,
    },
    {
      title: 'Values Type',
      dataIndex: 'values_type',
      key: 'values_type',
      width: 100,
      render: (text) => {
        const color = text === 'AMOUNT' ? 'green' : text === 'KGS' ? 'blue' : 'orange';
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: 'Value',
      dataIndex: 'values',
      key: 'values',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.values - b.values,
      render: (value) => value ? value.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      }) : '-',
    },
  ], []);

  // Use resizable columns hook for Excel Format table
  const [columns, , resetExcelColumns] = useResizableColumns(baseColumns, 'budget-excel-format');

  // Effects
  useEffect(() => {
    if (selectedDivision) {
      fetchAvailableYears();
    }
  }, [selectedDivision]);

  useEffect(() => {
    if (selectedYear) {
      fetchYearSummary(selectedYear, globalSearch);
      fetchData();
    }
  }, [selectedYear]);

  useEffect(() => {
    if (selectedDivision && !selectedYear) {
      // Initial load when no year is selected yet
      fetchData(pagination.current, pagination.pageSize);
    }
  }, [selectedDivision]);

  // Re-fetch when tab becomes active (to get fresh data after changes in other tabs)
  useEffect(() => {
    if (isActive && selectedDivision && selectedYear) {
      fetchYearSummary(selectedYear, globalSearch);
      fetchData();
    }
  }, [isActive]);
  
  useEffect(() => {
    fetchHtmlFilterOptions();
    fetchHtmlCountries();
    fetchHtmlProductGroups();
    // If recap sub-tab is active (inside Sales Budget tab), also fetch recap years
    if (activeHtmlSubTab === 'salesBudget' && activeSalesBudgetSubTab === 'recap') {
      fetchRecapYears();
    }
  }, [selectedDivision, activeHtmlSubTab, activeSalesBudgetSubTab, fetchHtmlCountries]);
  
  // Auto-save draft - consolidated into single effect
  // Saves 5 seconds after last budget data change (debounced)
  // The timer resets on every change, preventing overlapping saves
  useEffect(() => {
    // Skip if filters not set
    if (!htmlFilters.salesRep || !htmlFilters.actualYear) {
      return;
    }
    
    // Skip if in All Sales Reps mode (no draft saving for overview mode)
    if (htmlFilters.salesRep === '__ALL__') {
      return;
    }
    
    // Only save if there's data to save
    if (htmlCustomRows.length === 0 && Object.keys(htmlBudgetData).length === 0) {
      return;
    }
    
    const timer = setTimeout(() => {
      saveDraft();
    }, 5000); // 5 seconds after last change (debounced)
    
    return () => clearTimeout(timer);
  }, [htmlFilters.salesRep, htmlFilters.actualYear, htmlBudgetData, htmlCustomRows]);
  
  // Fetch ALL product groups for division (already filtered by database exclusions)
  const fetchAllProductGroups = async () => {
    if (!selectedDivision) {
      setAllProductGroups([]);
      return;
    }
    
    try {
      const response = await axios.get(`${API_BASE_URL}/api/product-groups-universal`, {
        params: { division: selectedDivision } // No salesRep = get all
      });
      
      if (response.data.success) {
        // NOTE: Exclusions are now handled at database level via is_unmapped flag
        // Admin controls exclusions in Master Data > Raw Product Groups
        const productGroups = response.data.data
          .map(item => item.pgcombine || item.productgroup || item.product_group || (typeof item === 'string' ? item : null))
          .filter(pg => pg && typeof pg === 'string' && pg.trim());
        setAllProductGroups([...new Set(productGroups)].sort());
      }
    } catch (error) {
      console.error('Error fetching all product groups:', error);
      setAllProductGroups([]);
    }
  };

  // Fetch ALL product groups for division (NOT filtered by sales rep)
  // HTML export should show all 13 product groups, same as Management Allocation
  const fetchHtmlProductGroups = async () => {
    if (!selectedDivision) {
      setHtmlProductGroups([]);
      return;
    }
    
    try {
      // Don't pass salesRep - we want ALL product groups for the division
      const response = await axios.get(`${API_BASE_URL}/api/product-groups-universal`, {
        params: { division: selectedDivision }
      });
      
      if (response.data.success) {
        // NOTE: Exclusions are now handled at database level via is_unmapped flag
        // Admin controls exclusions in Master Data > Raw Product Groups
        const productGroups = response.data.data
          .map(item => item.pgcombine || item.productgroup || item.product_group || (typeof item === 'string' ? item : null))
          .filter(pg => pg && typeof pg === 'string' && pg.trim());
        setHtmlProductGroups([...new Set(productGroups)].sort());
      }
    } catch (error) {
      console.error('Error fetching product groups:', error);
      setHtmlProductGroups([]);
    }
  };
  
  // Update merged customers list when table data changes
  useEffect(() => {
    if (htmlTableData.length > 0) {
      // Apply toProperCase to ensure consistent customer name formatting in dropdown
      const mergedCustomers = [...new Set(htmlTableData.map(row => row.customer))].sort().map(c => toProperCase(c || ''));
      setHtmlMergedCustomers(mergedCustomers);
    } else {
      setHtmlMergedCustomers([]);
    }
  }, [htmlTableData]);
  
  // Product groups are loaded once per division (not filtered by sales rep)
  // This matches Management Allocation which shows all 13 product groups
  useEffect(() => {
    if (selectedDivision) {
      fetchHtmlProductGroups();
      fetchAllProductGroups();
    } else {
      setHtmlProductGroups([]);
      setAllProductGroups([]);
    }
  }, [selectedDivision]);

  const handleTableChange = (paginationConfig) => {
    fetchData(paginationConfig.current, paginationConfig.pageSize);
  };
  
  const handleHtmlActualYearChange = (year) => {
    setHtmlFilters({
      actualYear: year ?? null,
      salesRep: null,
    });
    if (year) {
      fetchHtmlSalesRepOptions(year);
    } else {
      setHtmlSalesRepOptions([]);
    }
  };
  
  const handleHtmlSalesRepChange = (value) => {
    const isAll = value === '__ALL__';
    // Note: isAllSalesReps is derived via useMemo, no need to set it
    setHtmlFilters((prev) => ({
      ...prev,
      salesRep: value ?? null,
    }));
    
    // Clear filters when switching
    clearAllFilters();
    
    // Clear target sales rep when switching away from All mode
    if (!isAll) {
      setTargetSalesRep(null);
    }
    
    // Clear custom rows and budget data when switching to/from All
    if (isAll) {
      setHtmlCustomRows([]);
      setHtmlBudgetData({});
      setNewCustomerInputs({});
    }
  };
  
  // Fetch combined data for all sales reps
  const fetchAllSalesRepsData = useCallback(async () => {
    if (!selectedDivision || !htmlFilters.actualYear) {
      setHtmlTableData([]);
      setHtmlBudgetData({});
      return;
    }
    
    setHtmlTableLoading(true);
    try {
      const budgetYear = parseInt(htmlFilters.actualYear) + 1;
      
      // Get all sales reps for this division
      const salesRepsResponse = await axios.get(`${API_BASE_URL}/api/sales-reps-universal`, {
        params: { division: selectedDivision }
      });
      
      if (!salesRepsResponse.data.success) {
        setHtmlTableData([]);
        setHtmlBudgetData({});
        return;
      }
      
      const allSalesReps = salesRepsResponse.data.data || [];
      
      if (allSalesReps.length === 0) {
        setHtmlTableData([]);
        setHtmlBudgetData({});
        message.info('No sales reps found');
        return;
      }
      
      // Normalize sales rep names
      const salesRepIds = allSalesReps
        .filter(Boolean)
        .map(rep => rep.toString().trim().toUpperCase());
      
      // Fetch customer data for all sales reps combined
      const response = await axios.post(`${API_BASE_URL}/api/aebf/html-budget-customers-all`, {
        division: selectedDivision,
        actualYear: htmlFilters.actualYear,
        salesReps: salesRepIds,
        includeSalesRep: true
      });
      
      if (response.data.success) {
        setHtmlTableData(response.data.data || []);
        
        // Load pricing data for Amount/MoRM calculations
        const pricingDataFromBackend = response.data.pricingData || {};
        setHtmlPricingData(pricingDataFromBackend);
        
        // Load stored budget totals from database (for accurate Amount/MORM display)
        if (response.data.budgetTotals) {
          setHtmlStoredBudgetTotals(response.data.budgetTotals);
        }
        
        // Load budget data from backend
        const budgetDataFromBackend = response.data.budgetData || {};
        
        // Initialize budget data with salesRep prefix for All Sales Reps mode
        const initialBudget = {};
        (response.data.data || []).forEach(row => {
          for (let month = 1; month <= 12; month++) {
            // Use salesRep|customer|country|productGroup|month format for All Sales Reps mode
            const key = `${row.salesRep}|${row.customer}|${row.country}|${row.productGroup}|${month}`;
            // Check backend data with old key format for backwards compatibility
            const oldKey = `${row.customer}|${row.country}|${row.productGroup}|${month}`;
            const backendValue = budgetDataFromBackend[key] ?? budgetDataFromBackend[oldKey];
            initialBudget[key] = backendValue !== undefined && backendValue !== null ? backendValue.toString() : '';
          }
        });
        
        setHtmlBudgetData(initialBudget);
        
        if (Object.keys(budgetDataFromBackend).length > 0) {
          message.success(`Loaded budget data for all sales reps (${Object.keys(budgetDataFromBackend).length} entries)`);
        }
      } else {
        message.error(response.data.error || 'Failed to load customer data');
        setHtmlTableData([]);
      }
    } catch (error) {
      console.error('Error fetching all sales reps data:', error);
      message.error('Failed to load combined sales rep data');
      setHtmlTableData([]);
    } finally {
      setHtmlTableLoading(false);
    }
  }, [selectedDivision, htmlFilters.actualYear]);
  
  // Fetch customer Actual sales data for table
  const fetchHtmlTableData = useCallback(async () => {
    if (!selectedDivision || !htmlFilters.actualYear || !htmlFilters.salesRep) {
      setHtmlTableData([]);
      setHtmlBudgetData({});
      setHtmlPricingData({});
      return;
    }
    
    setHtmlTableLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/aebf/html-budget-customers`, {
        division: selectedDivision,
        actualYear: htmlFilters.actualYear,
        salesRep: htmlFilters.salesRep,
      });
      
      if (response.data.success) {
        setHtmlTableData(response.data.data || []);
        
        // Load pricing data for Amount/MoRM calculations
        setHtmlPricingData(response.data.pricingData || {});
        
        // Load stored budget totals from database (for accurate Amount/MORM display)
        if (response.data.budgetTotals) {
          setHtmlStoredBudgetTotals(response.data.budgetTotals);
        }
        
        // Load budget data from backend (if exists)
        const budgetDataFromBackend = response.data.budgetData || {};
        
        // Build a case-insensitive lookup map for budget data
        // This handles cases where merge rules change casing (e.g., "Llc" vs "LLC")
        const budgetLookup = {};
        Object.entries(budgetDataFromBackend).forEach(([key, value]) => {
          budgetLookup[key.toLowerCase()] = value;
        });
        
        // Initialize budget data - use backend data if available, otherwise empty
        const initialBudget = {};
        (response.data.data || []).forEach(row => {
          for (let month = 1; month <= 12; month++) {
            const key = `${row.customer}|${row.country}|${row.productGroup}|${month}`;
            // Use case-insensitive lookup for budget data
            const lookupKey = key.toLowerCase();
            const backendValue = budgetLookup[lookupKey];
            initialBudget[key] = backendValue !== undefined && backendValue !== null ? backendValue.toString() : '';
            
            // Debug log for budget-only rows
            if (backendValue !== undefined && backendValue !== null) {
            }
          }
        });
        
        setHtmlBudgetData(initialBudget);
        
        // Show message if budget data was loaded
        if (Object.keys(budgetDataFromBackend).length > 0) {
          message.success(`Loaded existing budget data (${Object.keys(budgetDataFromBackend).length} entries)`);
        }
      } else {
        message.error(response.data.error || 'Failed to load customer data');
        setHtmlTableData([]);
        setHtmlPricingData({});
      }
    } catch (error) {
      console.error('Error fetching HTML table data:', error);
      message.error('Failed to load customer sales data');
      setHtmlTableData([]);
      setHtmlPricingData({});
    } finally {
      setHtmlTableLoading(false);
    }
  }, [selectedDivision, htmlFilters.actualYear, htmlFilters.salesRep]);
  
  useEffect(() => {
    if (htmlFilters.actualYear && htmlFilters.salesRep) {
      if (isAllSalesReps) {
        fetchAllSalesRepsData();
      } else {
        fetchHtmlTableData();
      }
    } else {
      setHtmlTableData([]);
      setHtmlBudgetData({});
      setAllSalesRepsTableData([]);
    }
  }, [htmlFilters.actualYear, htmlFilters.salesRep, isAllSalesReps, fetchHtmlTableData, fetchAllSalesRepsData]);
  
  // Clear custom rows when sales rep or year changes
  useEffect(() => {
    setHtmlCustomRows([]);
    setNewCustomerInputs({});
    // Clear custom row budget data
    const cleanedBudget = {};
    Object.keys(htmlBudgetData).forEach(key => {
      if (!key.startsWith('custom_')) {
        cleanedBudget[key] = htmlBudgetData[key];
      }
    });
    setHtmlBudgetData(cleanedBudget);
  }, [htmlFilters.actualYear, htmlFilters.salesRep]);
  
  // Format number as "xxx,xxx.xx"
  const formatMT = (value) => {
    if (!value && value !== 0) return '';
    const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
    if (isNaN(num)) return '';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  
  // Format AED amount (number only, no symbol - symbol is in label)
  const formatAed = (value) => {
    const n = Number(value) || 0;
    if (Math.abs(n) >= 1_000_000) {
      return `${(n/1_000_000).toFixed(2)}M`;
    } else if (Math.abs(n) >= 1_000) {
      return `${(n/1_000).toFixed(1)}k`;
    }
    return n.toFixed(0);
  };
  
  // Handle budget input change - supports both single sales rep and all sales reps mode
  const handleBudgetInputChange = (customer, country, productGroup, month, value, salesRep = null) => {
    // For All Sales Reps mode, include salesRep in the key
    const key = salesRep 
      ? `${salesRep}|${customer}|${country}|${productGroup}|${month}`
      : `${customer}|${country}|${productGroup}|${month}`;
    setHtmlBudgetData(prev => ({
      ...prev,
      [key]: value,
    }));
  };
  
  // Copy sales rep budget value to remaining months (from current month to December)
  const handleCopyBudgetToRemainingMonths = (customer, country, productGroup, fromMonth, value, salesRep = null) => {
    if (!value || value.toString().trim() === '') return;
    
    setHtmlBudgetData(prev => {
      const updated = { ...prev };
      // Copy to all months from fromMonth to 12
      for (let month = fromMonth; month <= 12; month++) {
        const key = salesRep 
          ? `${salesRep}|${customer}|${country}|${productGroup}|${month}`
          : `${customer}|${country}|${productGroup}|${month}`;
        updated[key] = value;
      }
      return updated;
    });
    message.success(`Copied ${value} MT to months ${fromMonth}-12`);
  };

  // Save budget to database
  const handleSaveBudget = async () => {
    if (!selectedDivision || !htmlFilters.actualYear || !htmlFilters.salesRep) {
      message.warning('Please select all filters first');
      return;
    }
    
    const budgetRecords = [];
    
    // Process regular table rows
    Object.keys(htmlBudgetData).forEach(key => {
      if (key.startsWith('custom_')) {
        // Skip custom rows here, process separately
        return;
      }
      const [customer, country, productGroup, month] = key.split('|');
      const value = htmlBudgetData[key];
      if (value && value.toString().trim()) {
        const mtValue = parseFloat(value.toString().replace(/,/g, ''));
        if (!isNaN(mtValue) && mtValue >= 0) {
          budgetRecords.push({
            customer: customer.trim(),
            country: country.trim(),
            productGroup: productGroup.trim(),
            month: parseInt(month, 10),
            value: mtValue * 1000, // Convert MT to KGS
            isCustomRow: false,
          });
        }
      }
    });
    
    // Process custom rows
    htmlCustomRows.forEach(customRow => {
      if (!customRow.customer || !customRow.country || !customRow.productGroup) {
        return; // Skip incomplete rows
      }
      
      for (let month = 1; month <= 12; month++) {
        const key = `custom_${customRow.id}_${month}`;
        const value = htmlBudgetData[key];
        if (value && value.toString().trim()) {
          const mtValue = parseFloat(value.toString().replace(/,/g, ''));
          if (!isNaN(mtValue) && mtValue >= 0) {
            budgetRecords.push({
              customer: customRow.customer.trim(),
              country: customRow.country.trim(),
              productGroup: customRow.productGroup.trim(),
              month: month,
              value: mtValue * 1000, // Convert MT to KGS
              isCustomRow: true,
            });
          }
        }
      }
    });
    
    if (budgetRecords.length === 0) {
      message.warning('No budget data to save');
      return;
    }
    
    setHtmlSaving(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/aebf/save-html-budget`, {
        division: selectedDivision,
        budgetYear: budgetYearDerived,
        salesRep: htmlFilters.salesRep,
        records: budgetRecords,
      });
      
      if (response.data.success) {
        message.success(`Successfully saved ${budgetRecords.length} budget records`);
      } else {
        message.error(response.data.error || 'Failed to save budget data');
      }
    } catch (error) {
      console.error('Error saving budget:', error);
      message.error('Failed to save budget data');
    } finally {
      setHtmlSaving(false);
    }
  };
  
  // Export HTML form
  const handleImportFilledHtml = async (file) => {
    
    // File size validation (10MB limit)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      message.error({
        content: `File too large (${fileSizeMB}MB). Maximum allowed size is 10MB. Please reduce the file size or contact support.`,
        duration: 8
      });
      console.error(`❌ File size ${fileSizeMB}MB exceeds 10MB limit`);
      return;
    }
    
    try {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const htmlContent = e.target.result;
          
          // Validate filename format - accept both BUDGET_ and FINAL_ prefixes
          // Pattern: (BUDGET|FINAL)_[anything]_[4digits]_[8digits]_[4-6digits].html
          const filenamePattern = /^(BUDGET|FINAL)_(.+)_(\d{4})_(\d{8})_(\d{4,6})\.html$/;
          const match = file.name.match(filenamePattern);
          
          if (!match) {
            console.error('❌ Invalid filename format:', file.name);
            message.error({
              content: `Invalid filename format.\n\nExpected: FINAL_[Division_SalesRep]_[Year]_[Date]_[Time].html\nor: BUDGET_[Division_SalesRep]_[Year]_[Date]_[Time].html\n\nYour file: ${file.name}`,
              duration: 8
            });
            return;
          }
          
          
          // Validate file signature (IPD Budget System marker)
          const signaturePattern = /<!--\s*IPD_BUDGET_SYSTEM_v[\d.]+\s*::\s*TYPE=(SALES_REP_BUDGET|DIVISIONAL_BUDGET)\s*::/;
          const signatureMatch = htmlContent.match(signaturePattern);
          
          if (signatureMatch && signatureMatch[1] === 'DIVISIONAL_BUDGET') {
            console.error('❌ Wrong file type detected');
            message.error({
              content: 'Wrong file type!\n\nThis is a Divisional Budget file. Please use the Divisional Budget import section.',
              duration: 8
            });
            return;
          }
          
          if (signatureMatch) {
          } else {
            console.warn('⚠️ File missing signature - may be legacy file');
          }
          
          // Extract metadata from HTML content - improved regex for multi-line JSON
          const metadataMatch = htmlContent.match(/const budgetMetadata = (\{[\s\S]*?\});/);
          if (!metadataMatch) {
            console.error('❌ No metadata found in HTML');
            message.error('Invalid file: Missing budget metadata');
            return;
          }
          
          let metadata;
          try {
            metadata = JSON.parse(metadataMatch[1]);
          } catch (e) {
            console.error('❌ Failed to parse metadata:', e);
            message.error('Invalid file: Corrupted metadata');
            return;
          }
          
          // Show progress during upload
          const updateProgress = (stage, detail = '') => {
            const stages = {
              'validating': '🔍 Validating file structure...',
              'parsing': '📋 Parsing budget data...',
              'uploading': '📤 Uploading to server...',
              'processing': '⚙️ Processing records...',
              'calculating': '🔢 Calculating Amount & MoRM...',
              'saving': '💾 Saving to database...'
            };
            message.loading({ 
              content: `${stages[stage] || stage}${detail ? ` ${detail}` : ''}`, 
              key: 'import',
              duration: 0
            });
          };
          
          // Send to backend for processing (include current context for validation)
          updateProgress('uploading');
          
          const checkResponse = await axios.post(`${API_BASE_URL}/api/aebf/import-budget-html`, {
            htmlContent,
            currentSalesRep: htmlFilters.salesRep,  // Pass current selected sales rep for validation
            currentDivision: selectedDivision        // Pass current selected division for validation
          }, {
            onUploadProgress: (progressEvent) => {
              const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              if (percentCompleted < 100) {
                updateProgress('uploading', `(${percentCompleted}%)`);
              } else {
                updateProgress('processing');
              }
            }
          });
          
          
          // If existing budget found, show confirmation dialog
          if (checkResponse.data.existingBudget && checkResponse.data.existingBudget.recordCount > 0) {
            const existingBudget = checkResponse.data.existingBudget;
            
            message.destroy('import');
            
            modal.confirm({
              title: '⚠️ Replace Existing Budget?',
              icon: <WarningOutlined style={{ color: '#faad14' }} />,
              content: (
                <div>
                  <p style={{ marginBottom: 16, fontWeight: 500 }}>
                    A budget already exists for this sales rep and year:
                  </p>
                  <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, marginBottom: 16 }}>
                    <p><strong>Division:</strong> {checkResponse.data.metadata.division}</p>
                    <p><strong>Sales Rep:</strong> {checkResponse.data.metadata.salesRep}</p>
                    <p><strong>Budget Year:</strong> {checkResponse.data.metadata.budgetYear}</p>
                    <p><strong>Existing Records:</strong> {existingBudget.recordCount}</p>
                    <p><strong>Last Upload:</strong> {new Date(existingBudget.lastUpload).toLocaleString()}</p>
                    {existingBudget.lastFilename && (
                      <p><strong>Last File:</strong> {existingBudget.lastFilename}</p>
                    )}
                  </div>
                  <p style={{ color: '#d32f2f', fontWeight: 500 }}>
                    ⚠️ This action will DELETE the old budget and replace it with the new one.
                  </p>
                  <p style={{ marginTop: 8 }}>
                    Do you want to proceed?
                  </p>
                </div>
              ),
              okText: 'Yes, Replace Budget',
              okType: 'danger',
              cancelText: 'Cancel',
              width: 600,
              async onOk() {
                // User confirmed, show success message
                message.success({
                  content: `Budget replaced successfully!`,
                  key: 'import',
                  duration: 5
                });
                
                // Show import details
                modal.success({
                  title: '✅ Budget Data Replaced Successfully',
                  icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
                  content: (
                    <div>
                      <div style={{ background: '#f6ffed', padding: 12, borderRadius: 4, marginBottom: 16, border: '1px solid #b7eb8f' }}>
                        <p><strong>Division:</strong> {checkResponse.data.metadata.division}</p>
                        <p><strong>Sales Rep:</strong> {checkResponse.data.metadata.salesRep}</p>
                        <p><strong>Budget Year:</strong> {checkResponse.data.metadata.budgetYear}</p>
                      </div>
                      
                      {/* Budget Totals Summary - Main highlight */}
                      {checkResponse.data.totals && (
                        <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: 16, borderRadius: 8, marginBottom: 16, color: '#fff' }}>
                          <p style={{ fontWeight: 600, marginBottom: 12, fontSize: '14px', borderBottom: '1px solid rgba(255,255,255,0.3)', paddingBottom: 8 }}>📊 Budget Totals Imported</p>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', textAlign: 'center' }}>
                            <div>
                              <div style={{ fontSize: '20px', fontWeight: 700 }}>{checkResponse.data.totals.mt?.toLocaleString(undefined, {maximumFractionDigits: 2})} MT</div>
                              <div style={{ fontSize: '11px', opacity: 0.9 }}>Total Quantity</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '20px', fontWeight: 700 }}>{(checkResponse.data.totals.amount / 1000)?.toLocaleString(undefined, {maximumFractionDigits: 0})}K</div>
                              <div style={{ fontSize: '11px', opacity: 0.9 }}>Total Amount ({renderModalCurrencySymbol()})</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '20px', fontWeight: 700 }}>{(checkResponse.data.totals.morm / 1000)?.toLocaleString(undefined, {maximumFractionDigits: 0})}K</div>
                              <div style={{ fontSize: '11px', opacity: 0.9 }}>Total MoRM ({renderModalCurrencySymbol()})</div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <div style={{ marginBottom: 16, fontSize: '12px', color: '#666' }}>
                        <p style={{ fontWeight: 500, marginBottom: 4 }}>Records Summary:</p>
                        <p>Deleted (old): {checkResponse.data.recordsDeleted} | Inserted (new): {checkResponse.data.recordsInserted.total}</p>
                      </div>
                  <p style={{ fontSize: '12px' }}><strong>Pricing Year Used:</strong> {checkResponse.data.pricingYear}</p>
                  {checkResponse.data.warnings && checkResponse.data.warnings.length > 0 && (
                    <div style={{ marginTop: 16, padding: 12, background: '#fff7e6', borderRadius: 4, border: '1px solid #ffd591' }}>
                      <p style={{ fontWeight: 500, marginBottom: 4, color: '#d46b08' }}>⚠️ Warnings:</p>
                      <ul style={{ margin: 0, paddingLeft: 20, fontSize: '12px' }}>
                        {checkResponse.data.warnings.map((warning, idx) => (
                          <li key={idx}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {checkResponse.data.skippedRecords > 0 && (
                    <div style={{ marginTop: 12, padding: 12, background: '#fff1f0', borderRadius: 4, border: '1px solid #ffccc7' }}>
                      <p style={{ fontWeight: 500, marginBottom: 8, color: '#cf1322', fontSize: '12px' }}>
                        ⚠️ {checkResponse.data.skippedRecords} invalid record(s) were skipped
                      </p>
                      {checkResponse.data.errors && checkResponse.data.errors.length > 0 && (
                        <div style={{ maxHeight: 150, overflowY: 'auto', fontSize: '11px' }}>
                          {checkResponse.data.errors.slice(0, 5).map((err, idx) => (
                            <div key={idx} style={{ marginBottom: 4, padding: '4px 8px', background: '#fff', borderRadius: 2 }}>
                              <strong>Row {err.index + 1}:</strong> {err.reason}
                              {err.suggestion && (
                                <div style={{ color: '#666', marginTop: 2 }}>💡 {err.suggestion}</div>
                              )}
                            </div>
                          ))}
                          {checkResponse.data.errors.length > 5 && (
                            <p style={{ color: '#999', margin: '4px 0 0 0' }}>
                              ... and {checkResponse.data.errors.length - 5} more errors
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {(selectedDivision !== checkResponse.data.metadata.division ||
                    htmlFilters.salesRep !== checkResponse.data.metadata.salesRep ||
                    htmlFilters.actualYear !== checkResponse.data.metadata.budgetYear - 1) && (
                    <div style={{ marginTop: 16, padding: 12, background: '#e6f7ff', borderRadius: 4, border: '1px solid #91d5ff' }}>
                      <p style={{ fontWeight: 500, marginBottom: 4 }}>💡 To view this budget:</p>
                      <p style={{ fontSize: '12px', margin: 0 }}>
                        Set filters to: <strong>{checkResponse.data.metadata.division}</strong> / <strong>{checkResponse.data.metadata.salesRep}</strong> / <strong>{checkResponse.data.metadata.budgetYear - 1}</strong>
                      </p>
                    </div>
                  )}
                </div>
              ),
              width: 600
            });
            
            // Auto-switch filters to match imported file (if division matches)
            if (selectedDivision === checkResponse.data.metadata.division) {
              const targetActualYear = checkResponse.data.metadata.budgetYear - 1;
              const targetSalesRep = checkResponse.data.metadata.salesRep;
              
              const isSameFilters = htmlFilters.actualYear === targetActualYear && htmlFilters.salesRep === targetSalesRep;

              // Auto-switch salesRep and actualYear
              setHtmlFilters({
                actualYear: targetActualYear,
                salesRep: targetSalesRep
              });
              
              if (isSameFilters) {
                // Force refresh since useEffect won't trigger if filters haven't changed
                await fetchHtmlTableData();
              } else {
                message.info('Filters automatically switched to show imported budget');
              }
            }
          },
              onCancel() {
                message.info('Budget import cancelled');
              }
            });
          } else {
            // No existing budget, proceed with success message
            message.success({
              content: `Successfully imported budget data!`,
              key: 'import',
              duration: 5
            });
            
            // Show import details
            modal.success({
              title: '✅ Budget Data Imported Successfully',
              icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
              content: (
                <div>
                  <div style={{ background: '#f6ffed', padding: 12, borderRadius: 4, marginBottom: 16, border: '1px solid #b7eb8f' }}>
                    <p><strong>Division:</strong> {checkResponse.data.metadata.division}</p>
                    <p><strong>Sales Rep:</strong> {checkResponse.data.metadata.salesRep}</p>
                    <p><strong>Budget Year:</strong> {checkResponse.data.metadata.budgetYear}</p>
                  </div>
                  
                  {/* Budget Totals Summary - Main highlight */}
                  {checkResponse.data.totals && (
                    <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: 16, borderRadius: 8, marginBottom: 16, color: '#fff' }}>
                      <p style={{ fontWeight: 600, marginBottom: 12, fontSize: '14px', borderBottom: '1px solid rgba(255,255,255,0.3)', paddingBottom: 8 }}>📊 Budget Totals Imported</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', textAlign: 'center' }}>
                        <div>
                          <div style={{ fontSize: '20px', fontWeight: 700 }}>{checkResponse.data.totals.mt?.toLocaleString(undefined, {maximumFractionDigits: 2})} MT</div>
                          <div style={{ fontSize: '11px', opacity: 0.9 }}>Total Quantity</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '20px', fontWeight: 700 }}>{(checkResponse.data.totals.amount / 1000)?.toLocaleString(undefined, {maximumFractionDigits: 0})}K</div>
                          <div style={{ fontSize: '11px', opacity: 0.9 }}>Total Amount ({renderModalCurrencySymbol()})</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '20px', fontWeight: 700 }}>{(checkResponse.data.totals.morm / 1000)?.toLocaleString(undefined, {maximumFractionDigits: 0})}K</div>
                          <div style={{ fontSize: '11px', opacity: 0.9 }}>Total MoRM ({renderModalCurrencySymbol()})</div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div style={{ marginBottom: 16, fontSize: '12px', color: '#666' }}>
                    <p style={{ fontWeight: 500, marginBottom: 4 }}>Records Inserted: {checkResponse.data.recordsInserted.total}</p>
                  </div>
                  <p style={{ fontSize: '12px' }}><strong>Pricing Year Used:</strong> {checkResponse.data.pricingYear}</p>
                  {checkResponse.data.warnings && checkResponse.data.warnings.length > 0 && (
                    <div style={{ marginTop: 16, padding: 12, background: '#fff7e6', borderRadius: 4, border: '1px solid #ffd591' }}>
                      <p style={{ fontWeight: 500, marginBottom: 4, color: '#d46b08' }}>⚠️ Warnings:</p>
                      <ul style={{ margin: 0, paddingLeft: 20, fontSize: '12px' }}>
                        {checkResponse.data.warnings.map((warning, idx) => (
                          <li key={idx}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {checkResponse.data.skippedRecords > 0 && (
                    <div style={{ marginTop: 12, padding: 12, background: '#fff1f0', borderRadius: 4, border: '1px solid #ffccc7' }}>
                      <p style={{ fontWeight: 500, marginBottom: 8, color: '#cf1322', fontSize: '12px' }}>
                        ⚠️ {checkResponse.data.skippedRecords} invalid record(s) were skipped
                      </p>
                      {checkResponse.data.errors && checkResponse.data.errors.length > 0 && (
                        <div style={{ maxHeight: 150, overflowY: 'auto', fontSize: '11px' }}>
                          {checkResponse.data.errors.slice(0, 5).map((err, idx) => (
                            <div key={idx} style={{ marginBottom: 4, padding: '4px 8px', background: '#fff', borderRadius: 2 }}>
                              <strong>Row {err.index + 1}:</strong> {err.reason}
                              {err.suggestion && (
                                <div style={{ color: '#666', marginTop: 2 }}>💡 {err.suggestion}</div>
                              )}
                            </div>
                          ))}
                          {checkResponse.data.errors.length > 5 && (
                            <p style={{ color: '#999', margin: '4px 0 0 0' }}>
                              ... and {checkResponse.data.errors.length - 5} more errors
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {(selectedDivision !== checkResponse.data.metadata.division ||
                    htmlFilters.salesRep !== checkResponse.data.metadata.salesRep ||
                    htmlFilters.actualYear !== checkResponse.data.metadata.budgetYear - 1) && (
                    <div style={{ marginTop: 16, padding: 12, background: '#e6f7ff', borderRadius: 4, border: '1px solid #91d5ff' }}>
                      <p style={{ fontWeight: 500, marginBottom: 4 }}>💡 To view this budget:</p>
                      <p style={{ fontSize: '12px', margin: 0 }}>
                        Set filters to: <strong>{checkResponse.data.metadata.division}</strong> / <strong>{checkResponse.data.metadata.salesRep}</strong> / <strong>{checkResponse.data.metadata.budgetYear - 1}</strong>
                      </p>
                    </div>
                  )}
                </div>
              ),
              width: 600
            });
            
            // Auto-switch filters to match imported file (if division matches)
            if (selectedDivision === checkResponse.data.metadata.division) {
              const targetActualYear = checkResponse.data.metadata.budgetYear - 1;
              const targetSalesRep = checkResponse.data.metadata.salesRep;
              
              const isSameFilters = htmlFilters.actualYear === targetActualYear && htmlFilters.salesRep === targetSalesRep;

              // Auto-switch salesRep and actualYear
              setHtmlFilters({
                actualYear: targetActualYear,
                salesRep: targetSalesRep
              });
              
              if (isSameFilters) {
                // Force refresh since useEffect won't trigger if filters haven't changed
                await fetchHtmlTableData();
              } else {
                message.info('Filters automatically switched to show imported budget');
              }
            }
          }
        } catch (error) {
          console.error('❌ Error importing HTML:', error);
          console.error('Error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
          });
          
          const errorMessage = error.response?.data?.error || error.message || 'Failed to import budget data';
          
          message.error({
            content: errorMessage,
            key: 'import',
            duration: 10
          });
          
          // Show detailed error modal for debugging
          if (error.response?.data) {
            modal.error({
              title: '❌ Import Failed',
              content: (
                <div>
                  <p><strong>Error:</strong> {errorMessage}</p>
                  {error.response?.data?.isDraft && (
                    <p style={{ marginTop: 12, color: '#d32f2f' }}>
                      This appears to be a draft file. Please open the file and click "Save Final" before uploading.
                    </p>
                  )}
                </div>
              ),
              width: 500
            });
          }
        }
      };
      
      reader.onerror = (error) => {
        console.error('❌ FileReader error:', error);
        message.error('Failed to read file. Please try again.');
      };
      
      reader.readAsText(file);
      
    } catch (error) {
      console.error('❌ Error handling file:', error);
      message.error('Failed to process file: ' + error.message);
    }
  };

  // Save draft to database (auto-save)
  const saveDraft = useCallback(async () => {
    if (!selectedDivision || !htmlFilters.salesRep || !htmlFilters.actualYear) {
      return;
    }
    
    // Block save if any custom row has empty customer
    const rowsWithEmptyCustomer = htmlCustomRows.filter(row => !row.customer || !row.customer.trim());
    if (rowsWithEmptyCustomer.length > 0) {
      // Don't save draft if customer is empty - silently skip
      return;
    }
    
    // Only save if there's actual data (including zero values)
    const hasData = Object.keys(htmlBudgetData).some(key => {
      const val = htmlBudgetData[key];
      if (!val) return false;
      const numVal = parseFloat(val.toString().replace(/,/g, ''));
      return !isNaN(numVal) && numVal >= 0;
    });
    
    if (!hasData) {
      return;
    }
    
    setDraftStatus('saving');
    
    try {
      const response = await axios.post(`${API_BASE_URL}/api/budget-draft/save-draft`, {
        division: selectedDivision,
        salesRep: htmlFilters.salesRep,
        budgetYear: parseInt(htmlFilters.actualYear) + 1,
        customRows: htmlCustomRows,
        budgetData: htmlBudgetData,
      });
      
      if (response.data.success) {
        setDraftStatus('saved');
        setLastSaveTime(new Date());
        setHasDraft(true);
        // Silent success - no message needed for auto-save
      }
    } catch (error) {
      console.error('Error saving draft:', error);
      setDraftStatus('error');
      // Don't show error message for auto-save to avoid annoying users
    }
  }, [selectedDivision, htmlFilters.salesRep, htmlFilters.actualYear, htmlCustomRows, htmlBudgetData]);

  // Save divisional budget draft to database (auto-save)
  const saveDivisionalDraft = useCallback(async () => {
    if (!selectedDivision || !divisionalHtmlBudgetYear) {
      return;
    }
    
    // Only save if there's actual data
    const hasData = Object.keys(divisionalHtmlBudgetData).some(key => {
      const val = divisionalHtmlBudgetData[key];
      if (!val) return false;
      const numVal = parseFloat(val.toString().replace(/,/g, ''));
      return !isNaN(numVal) && numVal >= 0;
    });
    
    if (!hasData && Object.keys(servicesChargesBudget).length === 0) {
      return;
    }
    
    
    setDivisionalDraftStatus('saving');
    
    try {
      const response = await axios.post(`${API_BASE_URL}/api/budget-draft/save-divisional-draft`, {
        division: selectedDivision,
        budgetYear: divisionalHtmlBudgetYear,
        budgetData: divisionalHtmlBudgetData,
        servicesChargesBudget,
      });
      
      
      if (response.data.success) {
        setDivisionalDraftStatus('saved');
        setDivisionalLastSaveTime(new Date());
        // Silent success - no message needed for auto-save
      }
    } catch (error) {
      console.error('Error saving divisional draft:', error);
      setDivisionalDraftStatus('error');
      // Don't show error message for auto-save to avoid annoying users
    }
  }, [selectedDivision, divisionalHtmlBudgetYear, divisionalHtmlBudgetData, servicesChargesBudget]);

  // Auto-save divisional draft - debounced 5 seconds after changes
  useEffect(() => {
    // Skip if not on divisional sub-tab
    if (activeHtmlSubTab !== 'divisional') {
      return;
    }
    
    // Skip if no year selected
    if (!divisionalHtmlFilters.actualYear) {
      return;
    }
    
    // Only save if there's data
    if (Object.keys(divisionalHtmlBudgetData).length === 0 && Object.keys(servicesChargesBudget).length === 0) {
      return;
    }
    
    const timer = setTimeout(() => {
      saveDivisionalDraft();
    }, 5000); // 5 seconds after last change (debounced)
    
    return () => clearTimeout(timer);
  }, [activeHtmlSubTab, divisionalHtmlFilters.actualYear, divisionalHtmlBudgetData, servicesChargesBudget, saveDivisionalDraft]);

  // Submit final budget (with calculations)
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitConfirmVisible, setSubmitConfirmVisible] = useState(false);
  
  const submitFinalBudget = async () => {
    // Prevent double-clicking
    if (isSubmitting) {
      return;
    }
    
    const isAllSalesReps = htmlFilters.salesRep === '__ALL__';
    
    
    if (!selectedDivision || !htmlFilters.salesRep || !htmlFilters.actualYear) {
      console.error('❌ Missing filters');
      message.warning('Please select all filters first');
      return;
    }
    
    // Validate: Check for custom rows with empty customer (customer is required)
    const rowsWithEmptyCustomer = htmlCustomRows.filter(row => !row.customer || !row.customer.trim());
    if (rowsWithEmptyCustomer.length > 0) {
      console.error('❌ Custom rows with empty customer found:', rowsWithEmptyCustomer);
      message.warning({
        content: (
          <div>
            <strong>⚠️ Customer Required!</strong>
            <p style={{ marginTop: 8 }}>Please select a customer for all custom rows or delete empty rows before submitting.</p>
          </div>
        ),
        duration: 8
      });
      return;
    }
    
    // Validate: Check for incomplete custom rows (missing country or product group)
    const incompleteCustomRows = htmlCustomRows.filter(row => {
      const hasCustomer = row.customer && row.customer.trim();
      const hasCountry = row.country && row.country.trim();
      const hasProductGroup = row.productGroup && row.productGroup.trim();
      // A row is incomplete if customer is filled but country or product group is missing
      const hasAllFields = hasCustomer && hasCountry && hasProductGroup;
      return hasCustomer && !hasAllFields;
    });
    
    if (incompleteCustomRows.length > 0) {
      console.error('❌ Incomplete custom rows found:', incompleteCustomRows);
      const missingFields = incompleteCustomRows.map(row => {
        const missing = [];
        if (!row.customer || !row.customer.trim()) missing.push('Customer');
        if (!row.country || !row.country.trim()) missing.push('Country');
        if (!row.productGroup || !row.productGroup.trim()) missing.push('Product Group');
        return missing.join(', ');
      });
      message.warning({
        content: (
          <div>
            <strong>⚠️ Incomplete Custom Rows Found!</strong>
            <p style={{ marginTop: 8, marginBottom: 4 }}>Please complete or delete the following rows:</p>
            <ul style={{ marginLeft: 20, marginBottom: 0 }}>
              {incompleteCustomRows.slice(0, 3).map((row, idx) => (
                <li key={idx}>
                  Row with {row.customer || 'no customer'} - Missing: {missingFields[idx]}
                </li>
              ))}
              {incompleteCustomRows.length > 3 && (
                <li>...and {incompleteCustomRows.length - 3} more</li>
              )}
            </ul>
          </div>
        ),
        duration: 10
      });
      return;
    }
    
    // Validate: Check if any budget data is entered (including zero values)
    const hasData = Object.keys(htmlBudgetData).some(key => {
      const val = htmlBudgetData[key];
      if (!val) return false;
      const numVal = parseFloat(val.toString().replace(/,/g, ''));
      return !isNaN(numVal) && numVal >= 0;
    });
    
    
    if (!hasData) {
      console.error('❌ No budget data entered');
      message.warning({
        content: '⚠️ No budget data entered! Please enter at least one budget value before submitting.',
        duration: 8
      });
      return;
    }
    
    
    // Show confirmation modal using state
    setIsSubmitting(true);
    setSubmitConfirmVisible(true);
  };
  
  // Handle actual submission after confirmation
  const handleConfirmSubmit = async () => {
    setSubmitConfirmVisible(false);
    
    const isAllSalesReps = htmlFilters.salesRep === '__ALL__';
    
    try {
      // Handle All Sales Reps mode - need to group by salesRep and submit each
      if (isAllSalesReps) {
        
        // Parse keys and group by salesRep
        // Key format in All mode: salesRep|customer|country|productGroup|month
        const budgetBySalesRep = {};
        
        Object.entries(htmlBudgetData).forEach(([key, value]) => {
          const parts = key.split('|');
          if (parts.length === 5) {
            const [salesRep, customer, country, productGroup, month] = parts;
            if (!budgetBySalesRep[salesRep]) {
              budgetBySalesRep[salesRep] = {};
            }
            // Reconstruct the key in standard format (without salesRep prefix)
            const standardKey = `${customer}|${country}|${productGroup}|${month}`;
            budgetBySalesRep[salesRep][standardKey] = value;
          } else if (parts.length === 4) {
            // Some keys might still be in old format from existing data
            // Try to find the salesRep from the row data
            console.warn('⚠️ Key in old format (4 parts):', key);
          }
        });
        
        const salesRepsList = Object.keys(budgetBySalesRep);
        
        if (salesRepsList.length === 0) {
          message.error('No budget data to submit. Please make changes first.');
          setIsSubmitting(false);
          return;
        }
        
        message.loading({ content: `Submitting budgets for ${salesRepsList.length} sales reps...`, key: 'submitBudget' });
        
        let totalKgsValue = 0;
        let totalAmountValue = 0;
        let totalMormValue = 0;
        let totalRecords = 0;
        let failedReps = [];
        let successReps = [];
        let allWarnings = [];
        
        // Submit each sales rep's budget
        for (const salesRep of salesRepsList) {
          const repBudgetData = budgetBySalesRep[salesRep];
          
          try {
            // First save as draft
            await axios.post(`${API_BASE_URL}/api/budget-draft/save-draft`, {
              division: selectedDivision,
              salesRep: salesRep,
              budgetYear: parseInt(htmlFilters.actualYear) + 1,
              customRows: [], // Custom rows not supported in All mode
              budgetData: repBudgetData,
            });
            
            // Then submit final
            const response = await axios.post(`${API_BASE_URL}/api/budget-draft/submit-final`, {
              division: selectedDivision,
              salesRep: salesRep,
              budgetYear: parseInt(htmlFilters.actualYear) + 1,
            });
            
            if (response.data.success) {
              successReps.push(salesRep);
              totalKgsValue += response.data.valueTotals?.kgs || 0;
              totalAmountValue += response.data.valueTotals?.amount || 0;
              totalMormValue += response.data.valueTotals?.morm || 0;
              totalRecords += response.data.recordsInserted?.total || 0;
              if (response.data.warnings) {
                allWarnings.push(...response.data.warnings.map(w => `${salesRep}: ${w}`));
              }
              
              // Clean up draft
              try {
                await axios.delete(
                  `${API_BASE_URL}/api/budget-draft/delete-draft/${selectedDivision}/${salesRep}/${parseInt(htmlFilters.actualYear) + 1}`
                );
              } catch (e) {
                console.warn(`Could not delete draft for ${salesRep}:`, e);
              }
            } else {
              failedReps.push({ rep: salesRep, error: response.data.error });
            }
          } catch (err) {
            console.error(`❌ Error submitting for ${salesRep}:`, err);
            failedReps.push({ rep: salesRep, error: err.response?.data?.error || err.message });
          }
        }
        
        // Show results
        if (successReps.length > 0) {
          message.success({ content: `Submitted ${successReps.length} of ${salesRepsList.length} budgets`, key: 'submitBudget', duration: 3 });
          
          modal.success({
            title: '✅ All Sales Reps Budget Submitted',
            width: 600,
            content: (
              <div>
                <p><strong>Successfully submitted {successReps.length} sales reps:</strong></p>
                <div style={{ maxHeight: 100, overflow: 'auto', marginBottom: 12 }}>
                  {successReps.map((rep, idx) => (
                    <span key={idx} style={{ display: 'inline-block', margin: '2px 4px', padding: '2px 8px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 4, fontSize: 12 }}>{rep}</span>
                  ))}
                </div>
                <p><strong>Budget values submitted:</strong></p>
                <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                  <li>MT: {(totalKgsValue / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT</li>
                  <li>Amount: ({renderModalCurrencySymbol()}) {totalAmountValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</li>
                  <li>MoRM: ({renderModalCurrencySymbol()}) {totalMormValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</li>
                </ul>
                <p style={{ marginTop: 8, fontSize: '12px', color: '#8c8c8c' }}>Total records: {totalRecords}</p>
                {failedReps.length > 0 && (
                  <div style={{ marginTop: 16, padding: 12, background: '#fff2f0', borderRadius: 4, border: '1px solid #ffccc7' }}>
                    <p style={{ fontWeight: 500, marginBottom: 4, color: '#cf1322' }}>❌ Failed ({failedReps.length}):</p>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: '12px' }}>
                      {failedReps.map((f, idx) => (
                        <li key={idx}>{f.rep}: {f.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {allWarnings.length > 0 && (
                  <div style={{ marginTop: 16, padding: 12, background: '#fff7e6', borderRadius: 4, border: '1px solid #ffd591' }}>
                    <p style={{ fontWeight: 500, marginBottom: 4, color: '#d46b08' }}>⚠️ Warnings:</p>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: '12px', maxHeight: 100, overflow: 'auto' }}>
                      {allWarnings.slice(0, 20).map((warning, idx) => (
                        <li key={idx}>{warning}</li>
                      ))}
                      {allWarnings.length > 20 && <li>... and {allWarnings.length - 20} more</li>}
                    </ul>
                  </div>
                )}
              </div>
            ),
          });
        } else {
          message.error({ content: 'Failed to submit any budgets', key: 'submitBudget', duration: 5 });
          modal.error({
            title: '❌ Submission Failed',
            content: (
              <div>
                <p>Failed to submit budgets for all sales reps:</p>
                <ul style={{ paddingLeft: 20 }}>
                  {failedReps.map((f, idx) => (
                    <li key={idx}>{f.rep}: {f.error}</li>
                  ))}
                </ul>
              </div>
            ),
          });
        }
        
        // Clear local state and refresh
        setHtmlBudgetData({});
        setHtmlCustomRows([]);
        setNewCustomerInputs({});
        setHasDraft(false);
        setDraftStatus('saved');
        fetchHtmlTableData();
        setIsSubmitting(false);
        return;
      }
      
      // Standard single sales rep mode
      // First, save current state to draft to ensure data is in database
      try {
        await axios.post(`${API_BASE_URL}/api/budget-draft/save-draft`, {
          division: selectedDivision,
          salesRep: htmlFilters.salesRep,
          budgetYear: parseInt(htmlFilters.actualYear) + 1,
          customRows: htmlCustomRows,
          budgetData: htmlBudgetData,
        });
      } catch (draftError) {
        console.error('⚠️ Failed to save draft, but continuing with submit:', draftError);
        // Continue anyway - might have draft data already
      }
      
      
      message.loading({ content: 'Submitting final budget...', key: 'submitBudget' });
      
      const response = await axios.post(`${API_BASE_URL}/api/budget-draft/submit-final`, {
        division: selectedDivision,
        salesRep: htmlFilters.salesRep,
        budgetYear: parseInt(htmlFilters.actualYear) + 1,
      });
      
      
      if (response.data.success) {
        message.success({ content: 'Budget submitted successfully!', key: 'submitBudget', duration: 3 });
        
        // Show detailed success modal
        modal.success({
          title: '✅ Budget Submitted Successfully',
          width: 500,
          content: (
            <div>
              <p><strong>Budget values submitted:</strong></p>
              <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                <li>MT: {((response.data.valueTotals?.kgs || 0) / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT</li>
                <li>Amount: ({renderModalCurrencySymbol()}) {(response.data.valueTotals?.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</li>
                <li>MoRM: ({renderModalCurrencySymbol()}) {(response.data.valueTotals?.morm || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</li>
              </ul>
              <p style={{ marginTop: 12, fontSize: '12px', color: '#8c8c8c' }}>
                Total records: {response.data.recordsInserted?.total || 0} | Pricing data used from year: {response.data.pricingYear}
              </p>
              {response.data.warnings && response.data.warnings.length > 0 && (
                <div style={{ marginTop: 16, padding: 12, background: '#fff7e6', borderRadius: 4, border: '1px solid #ffd591' }}>
                  <p style={{ fontWeight: 500, marginBottom: 4, color: '#d46b08' }}>⚠️ Warnings:</p>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: '12px' }}>
                    {response.data.warnings.map((warning, idx) => (
                      <li key={idx}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ),
        });
        
        // Clear draft from database
        try {
          await axios.delete(
            `${API_BASE_URL}/api/budget-draft/delete-draft/${selectedDivision}/${htmlFilters.salesRep}/${parseInt(htmlFilters.actualYear) + 1}`
          );
          setHasDraft(false);
          setDraftStatus('saved');
        } catch (deleteError) {
          console.error('Error deleting draft:', deleteError);
        }
        
        // Clear local state
        setHtmlBudgetData({});
        setHtmlCustomRows([]);
        setNewCustomerInputs({});
        
        // Refresh table data
        fetchHtmlTableData();
        
        // Reset submitting state
        setIsSubmitting(false);
      } else {
        console.error('❌ Backend returned error:', response.data.error);
        message.error({ 
          content: response.data.error || 'Failed to submit budget', 
          key: 'submitBudget',
          duration: 10
        });
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error('❌ Error submitting final budget:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        fullError: error
      });
      
      // Get detailed error message from backend
      const backendError = error.response?.data?.error || error.response?.data?.message;
      const errorMessage = backendError || error.message || 'Failed to submit budget. Please check backend logs for details.';
      
      console.error('📋 Backend error message:', backendError);
      console.error('📋 Full response data:', error.response?.data);
      
      message.error({ 
        content: errorMessage, 
        key: 'submitBudget',
        duration: 10
      });
      
      // Show detailed error modal
      const fullErrorData = error.response?.data;
      modal.error({
        title: '❌ Submit Failed',
        content: (
          <div>
            <p><strong>Error:</strong> {errorMessage}</p>
            {error.response?.status && (
              <p style={{ marginTop: 8, fontSize: '12px', color: '#8c8c8c' }}>
                Status Code: {error.response.status}
              </p>
            )}
            {fullErrorData && Object.keys(fullErrorData).length > 0 && (
              <div style={{ marginTop: 12, padding: 8, background: '#fff7e6', borderRadius: 4, fontSize: '11px' }}>
                <strong>Backend Response:</strong>
                <pre style={{ marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {JSON.stringify(fullErrorData, null, 2)}
                </pre>
              </div>
            )}
            <p style={{ marginTop: 12, fontSize: '12px' }}>
              <strong>Please check:</strong>
            </p>
            <ul style={{ marginTop: 4, paddingLeft: 20, fontSize: '12px' }}>
              <li>Browser console (F12) for frontend logs</li>
              <li>Backend terminal for server logs</li>
              <li>Database connection and table structure</li>
            </ul>
          </div>
        ),
        width: 600
      });
      
      // Reset submitting state
      setIsSubmitting(false);
    }
  };
  
  // Handle cancel submission
  const handleCancelSubmit = () => {
    setSubmitConfirmVisible(false);
    setIsSubmitting(false);
  };

  const handleExportHtmlForm = async () => {
    // Check if exporting all sales reps combined or a specific one
    const isExportingAll = isAllSalesReps && !targetSalesRep;
    
    const effectiveSalesRep = isExportingAll ? 'ALL_SALES_REPS' : (isAllSalesReps ? targetSalesRep : htmlFilters.salesRep);
    
    if (!selectedDivision || !htmlFilters.actualYear) {
      message.warning('Please select Division and Actual Year first');
      return;
    }
    
    // For single sales rep export (not All mode), require salesRep selection
    if (!isAllSalesReps && !htmlFilters.salesRep) {
      message.warning('Please select a Sales Rep first');
      return;
    }
    
    // Check for incomplete custom rows and warn user
    const relevantCustomRows = isExportingAll 
      ? htmlCustomRows
      : (isAllSalesReps 
          ? htmlCustomRows.filter(row => row.salesRep === targetSalesRep)
          : htmlCustomRows);
    
    const incompleteCustomRows = relevantCustomRows.filter(row => {
      const hasCustomer = row.customer && row.customer.trim();
      const hasCountry = row.country && row.country.trim();
      const hasProductGroup = row.productGroup && row.productGroup.trim();
      const hasAnyField = hasCustomer || hasCountry || hasProductGroup;
      const hasAllFields = hasCustomer && hasCountry && hasProductGroup;
      return hasAnyField && !hasAllFields;
    });
    
    if (incompleteCustomRows.length > 0) {
      console.warn('⚠️ Incomplete custom rows found - will be excluded from export:', incompleteCustomRows);
      message.warning({
        content: `${incompleteCustomRows.length} incomplete custom row(s) will be excluded from export. Please fill in Customer, Country, and Product Group for all rows.`,
        duration: 6
      });
    }
    
    // Get table data based on export mode
    const filteredTableData = isExportingAll 
      ? htmlTableData  // Export all data
      : (isAllSalesReps 
          ? htmlTableData.filter(row => row.salesRep === targetSalesRep)
          : htmlTableData);
    
    // Filter budget data based on export mode
    const filteredBudgetData = {};
    if (isExportingAll) {
      // Export all budget data (remove salesRep prefix for standardization)
      Object.entries(htmlBudgetData).forEach(([key, value]) => {
        filteredBudgetData[key] = value;
      });
    } else if (isAllSalesReps) {
      Object.entries(htmlBudgetData).forEach(([key, value]) => {
        const parts = key.split('|');
        if (parts.length === 5 && parts[0] === targetSalesRep) {
          // Remove salesRep prefix for export
          const standardKey = parts.slice(1).join('|');
          filteredBudgetData[standardKey] = value;
        }
      });
    } else {
      Object.assign(filteredBudgetData, htmlBudgetData);
    }
    
    // Prepare custom rows data for export (include id for budget data matching)
    const customRowsData = htmlCustomRows
      .filter(row => row.customer && row.country && row.productGroup)
      .filter(row => isExportingAll || !isAllSalesReps || row.salesRep === targetSalesRep)
      .map(row => ({
        id: row.id, // Include id for budget data key matching
        customer: row.customer,
        country: row.country,
        productGroup: row.productGroup,
        monthlyActual: {}, // No actual data for custom rows
        isCustomRow: true,
        salesRep: row.salesRep, // Include salesRep for combined export
      }));
    
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/aebf/export-html-budget-form`,
        {
          division: selectedDivision,
          actualYear: htmlFilters.actualYear,
          salesRep: effectiveSalesRep,
          tableData: filteredTableData,
          customRowsData: customRowsData,
          budgetData: filteredBudgetData,
          mergedCustomers: htmlMergedCustomers,
          countries: htmlCountries,
          productGroups: htmlProductGroups,
          currency: companyCurrency, // Pass company currency for export
        },
        { responseType: 'blob' }
      );
      
      // Generate filename with year, date, and time
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
      const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0'); // HHMM
      const dateTime = `${dateStr}_${timeStr}`;
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const budgetYear = Number(htmlFilters.actualYear) + 1;
      const salesRepFileName = isExportingAll ? 'ALL_SALES_REPS' : effectiveSalesRep.replace(/\s+/g, '_');
      link.setAttribute('download', `BUDGET_${selectedDivision}_${salesRepFileName}_${budgetYear}_${dateTime}.html`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      message.success(isExportingAll ? 'All sales reps budget exported successfully' : 'Budget form exported successfully');
    } catch (error) {
      console.error('Error exporting HTML form:', error);
      message.error('Failed to export budget form');
    }
  };
  
  const budgetYearDerived = htmlFilters.actualYear ? Number(htmlFilters.actualYear) + 1 : null;
  
  // ============================================================================
  // DIVISIONAL HTML BUDGET FUNCTIONS
  // ============================================================================
  
  // Fetch actual years for divisional budget
  const fetchDivisionalHtmlActualYears = useCallback(async () => {
    if (!selectedDivision) {
      setDivisionalHtmlActualYears([]);
      return;
    }
    
    setDivisionalHtmlFiltersLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/aebf/html-budget-actual-years`, {
        params: { division: selectedDivision }
      });
      
      if (response.data.success) {
        const years = response.data.data?.years || response.data.years || [];
        const sortedYears = [...years].sort((a, b) => b - a);
        setDivisionalHtmlActualYears(sortedYears);
        
        setDivisionalHtmlFilters(prev => {
          const currentYear = new Date().getFullYear();
          const defaultYear = sortedYears.includes(currentYear)
            ? currentYear
            : (sortedYears[0] ?? null);
          
          const prevYearNumber = prev.actualYear !== null && prev.actualYear !== undefined
            ? Number(prev.actualYear)
            : null;
          
          if (prevYearNumber && sortedYears.includes(prevYearNumber)) {
            return prev;
          }
          
          return { actualYear: defaultYear };
        });
      } else {
        setDivisionalHtmlFilters({ actualYear: null });
      }
    } catch (error) {
      console.error('Error fetching divisional actual years:', error);
      setDivisionalHtmlActualYears([]);
    } finally {
      setDivisionalHtmlFiltersLoading(false);
    }
  }, [selectedDivision]);

  // Fetch budget years for divisional budget (separate endpoint from actual years)
  const fetchDivisionalHtmlBudgetYears = useCallback(async () => {
    if (!selectedDivision) {
      return [];
    }
    
    try {
      const response = await axios.get(`${API_BASE_URL}/api/aebf/html-budget-budget-years`, {
        params: { division: selectedDivision }
      });
      
      if (response.data.success) {
        const years = response.data.data?.years || response.data.years || [];
        return [...years].sort((a, b) => b - a);
      }
    } catch (error) {
      console.error('Error fetching divisional budget years:', error);
    }
    return [];
  }, [selectedDivision]);

  // Load budget years when division changes and pick default selection
  useEffect(() => {
    let cancelled = false;
    async function loadBudgetYears() {
      const years = await fetchDivisionalHtmlBudgetYears();
      if (cancelled) return;
      setDivisionalHtmlBudgetYears(years);
      // Default budget year = actual year + 1 (e.g., actual 2026 → budget 2027)
      // User can change if they want
      const actual = divisionalHtmlFilters.actualYear ? parseInt(divisionalHtmlFilters.actualYear) : null;
      let defaultBudgetYear = null;
      if (actual) {
        // Always prefer actual + 1 for budget planning
        const nextYear = actual + 1;
        if (years.includes(nextYear)) {
          defaultBudgetYear = nextYear;
        } else {
          // If actual+1 not in list, add it (it will be created on first save)
          defaultBudgetYear = nextYear;
          if (!years.includes(nextYear)) {
            setDivisionalHtmlBudgetYears(prev => [...new Set([nextYear, ...prev])].sort((a, b) => b - a));
          }
        }
      } else {
        defaultBudgetYear = years[0] ?? null;
      }
      setDivisionalHtmlBudgetYear(defaultBudgetYear);
    }
    if (selectedDivision) {
      loadBudgetYears();
    } else {
      setDivisionalHtmlBudgetYears([]);
      setDivisionalHtmlBudgetYear(null);
    }
    return () => { cancelled = true; };
  }, [selectedDivision, divisionalHtmlFilters.actualYear, fetchDivisionalHtmlBudgetYears]);
  
  // Fetch divisional table data (aggregated by product group)
  const fetchDivisionalHtmlTableData = useCallback(async (options = {}) => {
    const { skipSuccessMessage = false } = options;
    if (!selectedDivision || !divisionalHtmlFilters.actualYear) {
      setDivisionalHtmlTableData([]);
      setDivisionalHtmlBudgetData({});
      setDivisionalPricingData({});
      setDivisionalBudgetDetailed({});
      return;
    }
    
    const budgetYear = divisionalHtmlBudgetYear ?? (parseInt(divisionalHtmlFilters.actualYear) + 1);
    
    // Increment fetch ID to track this request
    const fetchId = ++divisionalFetchIdRef.current;
    
    
    // Clear old data before loading new
    setDivisionalHtmlBudgetData({});
    setDivisionalBudgetDetailed({});
    
    setDivisionalHtmlTableLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/aebf/divisional-html-budget-data`, {
        division: selectedDivision,
        actualYear: divisionalHtmlFilters.actualYear,
        budgetYear,
      });
      
      // Check if this response is stale (a newer fetch was started)
      if (fetchId !== divisionalFetchIdRef.current) {
        return;
      }
      
      if (response.data.success) {
        // Handle nested data structure from successResponse wrapper
        const responseData = response.data.data || response.data;
        const tableData = responseData.data || [];
        const pricingData = responseData.pricingData || {};
        const budgetDataFromBackend = responseData.budgetData || {};
        const servicesChargesFromBackend = responseData.servicesChargesData || null;
        const servicesChargesBudgetFromBackend = responseData.servicesChargesBudget || {};
        const actualBudgetYearFromAPI = responseData.budgetYear || budgetYear; // Use actual year from API
        
        // Sort product groups: alphabetical, but "Other"/"Others" second to last, "Services Charges" always last
        const sortedTableData = tableData.sort((a, b) => {
          const aName = (a.productGroup || '').toUpperCase();
          const bName = (b.productGroup || '').toUpperCase();
          
          // "Services Charges" always last
          if (aName === 'SERVICES CHARGES') return 1;
          if (bName === 'SERVICES CHARGES') return -1;
          
          // "Other" or "Others" second to last (just before Services Charges)
          const isAOther = aName === 'OTHER' || aName === 'OTHERS';
          const isBOther = bName === 'OTHER' || bName === 'OTHERS';
          if (isAOther && !isBOther) return 1;
          if (isBOther && !isAOther) return -1;
          
          // Alphabetical for all others
          return aName.localeCompare(bName);
        });
        
        setDivisionalHtmlTableData(sortedTableData);
        setDivisionalActualBudgetYear(actualBudgetYearFromAPI); // Store actual budget year
        
        // Load pricing data for Amount/MoRM calculations
        setDivisionalPricingData(pricingData);
        
        // Load Services Charges data (separate from regular product groups)
        setServicesChargesData(servicesChargesFromBackend);
        
        // Check budget status from backend response
        const backendBudgetStatus = responseData.budgetStatus || 'no-data';
        const budgetSource = budgetDataFromBackend;
        const budgetDetailedSource = responseData.budgetDataDetailed || {}; // Amount/MoRM from DB
        const servicesSource = servicesChargesBudgetFromBackend;
        
        // Store detailed budget data (includes stored Amount/MoRM)
        setDivisionalBudgetDetailed(budgetDetailedSource);
        
        // Load Services Charges budget
        setServicesChargesBudget(servicesSource);
        
        // Load budget data - build from table structure
        const initialBudget = {};
        tableData.forEach(row => {
          for (let month = 1; month <= 12; month++) {
            const key = `${row.productGroup}|${month}`;
            const sourceValue = budgetSource[key];
            initialBudget[key] = sourceValue !== undefined && sourceValue !== null ? sourceValue.toString() : '';
          }
        });
        
        
        setDivisionalHtmlBudgetData(initialBudget);
        
        // Store the budget status from backend (draft or approved)
        setDivisionalBudgetStatus(backendBudgetStatus);
        
        // Set draft status based on backend budget status
        if (backendBudgetStatus === 'draft') {
          setDivisionalDraftStatus('saved');
          setDivisionalLastSaveTime(new Date());
        } else {
          setDivisionalDraftStatus('no-draft');
          setDivisionalLastSaveTime(null);
        }
        
        if (Object.keys(budgetDataFromBackend).length > 0 && !skipSuccessMessage) {
          const statusLabel = backendBudgetStatus === 'draft' ? 'draft' : 'approved';
          message.success(`Loaded ${statusLabel} divisional budget data (${Object.keys(budgetDataFromBackend).length} entries)`);
        }
      } else {
        // Check if stale before showing error
        if (fetchId !== divisionalFetchIdRef.current) return;
        message.error(response.data.error || 'Failed to load divisional data');
        setDivisionalHtmlTableData([]);
        setDivisionalPricingData({});
        setServicesChargesData(null);
        setServicesChargesBudget({});
      }
    } catch (error) {
      // Check if stale before showing error
      if (fetchId !== divisionalFetchIdRef.current) return;
      console.error('Error fetching divisional table data:', error);
      message.error('Failed to load divisional sales data');
      setDivisionalHtmlTableData([]);
      setDivisionalPricingData({});
      setServicesChargesData(null);
      setServicesChargesBudget({});
    } finally {
      // Only update loading state if this is still the current fetch
      if (fetchId === divisionalFetchIdRef.current) {
        setDivisionalHtmlTableLoading(false);
      }
    }
  }, [selectedDivision, divisionalHtmlFilters.actualYear, divisionalHtmlBudgetYear]);
  
  // Handle divisional actual year change
  const handleDivisionalHtmlActualYearChange = (year) => {
    setDivisionalHtmlFilters({
      actualYear: year ?? null,
    });
  };
  
  // Handle divisional budget input change
  const handleDivisionalBudgetInputChange = (productGroup, month, value) => {
    const key = `${productGroup}|${month}`;
    setDivisionalHtmlBudgetData(prev => ({
      ...prev,
      [key]: value,
    }));
    // Mark as unsaved when user makes changes
    setDivisionalDraftStatus('unsaved');
  };
  
  // Copy divisional budget value to remaining months (from current month to December)
  const handleCopyDivisionalToRemainingMonths = (productGroup, fromMonth, value) => {
    if (!value || value.toString().trim() === '') return;
    
    setDivisionalHtmlBudgetData(prev => {
      const updated = { ...prev };
      // Copy to all months from fromMonth to 12
      for (let month = fromMonth; month <= 12; month++) {
        const key = `${productGroup}|${month}`;
        updated[key] = value;
      }
      return updated;
    });
    setDivisionalDraftStatus('unsaved');
    message.success(`Copied ${value} MT to months ${fromMonth}-12`);
  };

  // Export divisional HTML form
  const handleExportDivisionalHtmlForm = async () => {
    if (!selectedDivision || !divisionalHtmlFilters.actualYear) {
      message.warning('Please select actual year first');
      return;
    }
    
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/aebf/export-divisional-html-budget-form`,
        {
          division: selectedDivision,
          actualYear: divisionalHtmlFilters.actualYear,
          tableData: divisionalHtmlTableData,
          budgetData: divisionalHtmlBudgetData,
          servicesChargesData: servicesChargesData,
          servicesChargesBudget: servicesChargesBudget,
          // Pass pricing data so backend can calculate Amount/MoRM totals
          pricingData: divisionalPricingData,
          currency: companyCurrency, // Pass company currency for export
        },
        { responseType: 'blob' }
      );
      
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
      const dateTime = `${dateStr}_${timeStr}`;
      
      const divisionalBudgetYear = divisionalHtmlBudgetYear ?? (Number(divisionalHtmlFilters.actualYear) + 1);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `BUDGET_Divisional_${selectedDivision}_${divisionalBudgetYear}_${dateTime}.html`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      message.success('Divisional budget form exported successfully');
    } catch (error) {
      console.error('Error exporting divisional HTML form:', error);
      message.error('Failed to export divisional budget form');
    }
  };
  
  // Export divisional budget as Excel
  const handleExportDivisionalExcel = async () => {
    if (!selectedDivision || !divisionalHtmlFilters.actualYear) {
      message.warning('Please select actual year first');
      return;
    }
    
    if (Object.keys(divisionalHtmlBudgetData).length === 0) {
      message.warning('No budget data to export');
      return;
    }
    
    try {
      const divisionalBudgetYear = divisionalHtmlBudgetYear ?? (Number(divisionalHtmlFilters.actualYear) + 1);
      
      const response = await axios.post(
        `${API_BASE_URL}/api/aebf/export-divisional-budget-excel`,
        {
          division: selectedDivision,
          budgetYear: divisionalBudgetYear,
          tableData: divisionalHtmlTableData,
          budgetData: divisionalHtmlBudgetData,
          servicesChargesData: servicesChargesData,
          servicesChargesBudget: servicesChargesBudget,
          pricingData: divisionalPricingData,
          currency: companyCurrency,
        },
        { responseType: 'blob' }
      );
      
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
      const dateTime = `${dateStr}_${timeStr}`;
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `BUDGET_Divisional_${selectedDivision}_${divisionalBudgetYear}_${dateTime}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      message.success('Divisional budget exported to Excel successfully');
    } catch (error) {
      console.error('Error exporting divisional Excel:', error);
      message.error('Failed to export divisional budget to Excel');
    }
  };
  
  // Import divisional filled HTML
  const handleImportDivisionalFilledHtml = async (file) => {
    // File size validation (10MB limit)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      message.error({
        content: `File too large (${fileSizeMB}MB). Maximum allowed size is 10MB. Please reduce the file size or contact support.`,
        duration: 8
      });
      console.error(`❌ Divisional budget file size ${fileSizeMB}MB exceeds 10MB limit`);
      return;
    }
    
    // Validate filename format first
    // Pattern: BUDGET_Divisional_[Division]_[Year]_[Date]_[Time].html OR FINAL_Divisional_...
    // Date can be YYYYMMDD or DDMMYYYY (8 digits), Time can be HHMMSS (6 digits) or HHMM (4 digits)
    const filenamePattern = /^(BUDGET|FINAL)_Divisional_(.+)_(\d{4})_(\d{8})_(\d{4,6})\.html$/;
    const match = file.name.match(filenamePattern);
    
    if (!match) {
      console.error('❌ Invalid divisional budget filename format:', file.name);
      message.error({
        content: `Invalid filename format.\n\nExpected: BUDGET_Divisional_[Division]_[Year]_[Date]_[Time].html\n\nYour file: ${file.name}`,
        duration: 8
      });
      return;
    }
    
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const htmlContent = e.target.result;

        // Validate file signature (IPD Budget System marker)
        const signaturePattern = /<!--\s*IPD_BUDGET_SYSTEM_v[\d.]+\s*::\s*TYPE=(SALES_REP_BUDGET|DIVISIONAL_BUDGET)\s*::/;
        const signatureMatch = htmlContent.match(signaturePattern);
        
        if (signatureMatch && signatureMatch[1] === 'SALES_REP_BUDGET') {
          console.error('❌ Wrong file type detected');
          message.error({
            content: 'Wrong file type!\n\nThis is a Sales Rep Budget file. Please use the Sales Rep Budget import section.',
            duration: 8
          });
          return;
        }
        
        if (signatureMatch) {
        } else {
          console.warn('⚠️ File missing signature - may be legacy file');
        }

        // Show progress during upload
        const updateDivisionalProgress = (stage, detail = '') => {
          const stages = {
            'validating': '🔍 Validating file structure...',
            'parsing': '📋 Parsing divisional budget data...',
            'uploading': '📤 Uploading to server...',
            'processing': '⚙️ Processing records...',
            'calculating': '🔢 Calculating Amount & MoRM...',
            'saving': '💾 Saving to database...'
          };
          message.loading({ 
            content: `${stages[stage] || stage}${detail ? ` ${detail}` : ''}`, 
            key: DIVISIONAL_IMPORT_MESSAGE_KEY,
            duration: 0
          });
        };
        
        updateDivisionalProgress('uploading');
        
        // Check if budget already exists
        const checkResponse = await axios.post(`${API_BASE_URL}/api/aebf/import-divisional-budget-html`, {
          htmlContent: htmlContent
        }, {
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            if (percentCompleted < 100) {
              updateDivisionalProgress('uploading', `(${percentCompleted}%)`);
            } else {
              updateDivisionalProgress('processing');
            }
          }
        });
        
        // If needs confirmation (existing budget found)
        if (checkResponse.data.needsConfirmation && checkResponse.data.existingBudget && checkResponse.data.existingBudget.recordCount > 0) {
          message.destroy(DIVISIONAL_IMPORT_MESSAGE_KEY);
          modal.confirm({
            title: '⚠️ Update Existing Divisional Budget?',
            content: (
              <div>
                <p>An existing divisional budget was found:</p>
                <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                  <li><strong>Division:</strong> {checkResponse.data.metadata?.division}</li>
                  <li><strong>Budget Year:</strong> {checkResponse.data.metadata?.budgetYear}</li>
                  <li><strong>Records:</strong> {checkResponse.data.existingBudget.recordCount}</li>
                  {checkResponse.data.existingBudget.lastUpload && (
                    <li><strong>Last Upload:</strong> {new Date(checkResponse.data.existingBudget.lastUpload).toLocaleString()}</li>
                  )}
                </ul>
                <p style={{ marginTop: 12, fontWeight: 500, color: '#faad14' }}>
                  ⚠️ Uploading will UPDATE existing records and INSERT new ones.
                  <br />
                  <span style={{ fontSize: '12px', color: '#666' }}>Existing records not in the file will remain unchanged.</span>
                </p>
                <p style={{ marginTop: 8 }}>Do you want to proceed?</p>
              </div>
            ),
            okText: 'Yes, Update Budget',
            cancelText: 'Cancel',
            okType: 'danger',
            width: 500,
            onOk: async () => {
              message.loading({
                content: 'Replacing divisional budget...',
                key: DIVISIONAL_IMPORT_MESSAGE_KEY
              });
              await performDivisionalImport(htmlContent);
            },
            onCancel: () => {
              message.info('Divisional budget import cancelled');
              return Promise.resolve();
            }
          });
        } else if (checkResponse.data.success || checkResponse.data.data?.success) {
          // No existing budget - first call already imported successfully
          message.destroy(DIVISIONAL_IMPORT_MESSAGE_KEY);
          
          // Get the actual data (may be nested under .data)
          const importData = checkResponse.data.data || checkResponse.data;
          
          // Show detailed success modal
          modal.success({
            title: '✅ Divisional Budget Imported Successfully',
            content: (
              <div>
                <div style={{ background: '#f6ffed', padding: 12, borderRadius: 4, marginBottom: 16, border: '1px solid #b7eb8f' }}>
                  <p><strong>Division:</strong> {importData.metadata?.division}</p>
                  <p><strong>Budget Year:</strong> {importData.metadata?.budgetYear}</p>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontWeight: 500, marginBottom: 8 }}>Budget Totals Imported:</p>
                  <ul style={{ marginLeft: 20, marginTop: 4 }}>
                    <li><strong>Volume:</strong> {(importData.budgetTotals?.volumeMT || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} MT</li>
                    <li><strong>Amount:</strong> ({renderModalCurrencySymbol()}) {((importData.budgetTotals?.amount || 0) / 1000000).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}M</li>
                    <li><strong>MoRM:</strong> ({renderModalCurrencySymbol()}) {((importData.budgetTotals?.morm || 0) / 1000000).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}M</li>
                    {importData.budgetTotals?.servicesCharges > 0 && (
                      <li style={{ color: '#1890ff', fontStyle: 'italic' }}>
                        <strong>Services Charges:</strong> ({renderModalCurrencySymbol()}) {((importData.budgetTotals?.servicesCharges || 0) / 1000000).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}M (included in Amount/MoRM)
                      </li>
                    )}
                  </ul>
                </div>
                <p style={{ fontSize: '12px', color: '#666' }}><strong>Records:</strong> {importData.recordsInserted?.total || 0} | <strong>Pricing Year:</strong> {importData.pricingYear}</p>
                {importData.warnings && importData.warnings.length > 0 && (
                  <div style={{ marginTop: 16, padding: 12, background: '#fff7e6', borderRadius: 4, border: '1px solid #ffd591' }}>
                    <p style={{ fontWeight: 500, marginBottom: 4, color: '#d46b08' }}>⚠️ Warnings:</p>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: '12px' }}>
                      {importData.warnings.map((warning, idx) => (
                        <li key={idx}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {importData.skippedRecords > 0 && (
                  <div style={{ marginTop: 12, padding: 12, background: '#fff1f0', borderRadius: 4, border: '1px solid #ffccc7' }}>
                    <p style={{ fontWeight: 500, marginBottom: 8, color: '#cf1322', fontSize: '12px' }}>
                      ⚠️ {importData.skippedRecords} invalid record(s) were skipped
                    </p>
                    {importData.errors && importData.errors.length > 0 && (
                      <div style={{ maxHeight: 150, overflowY: 'auto', fontSize: '11px' }}>
                        {importData.errors.slice(0, 5).map((err, idx) => (
                          <div key={idx} style={{ marginBottom: 4, padding: '4px 8px', background: '#fff', borderRadius: 2 }}>
                            <strong>Row {err.index + 1}:</strong> {err.reason}
                            {err.suggestion && (
                              <div style={{ color: '#666', marginTop: 2 }}>💡 {err.suggestion}</div>
                            )}
                          </div>
                        ))}
                        {importData.errors.length > 5 && (
                          <p style={{ color: '#999', margin: '4px 0 0 0' }}>
                            ... and {importData.errors.length - 5} more errors
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ),
            width: 500
          });
          
          // Auto-switch actualYear filter if division matches
          if (selectedDivision === checkResponse.data.metadata?.division) {
            // Auto-switch actualYear
            setDivisionalHtmlFilters({
              actualYear: checkResponse.data.metadata.budgetYear - 1
            });
            message.info('Filters automatically switched to show imported budget');
          }
          
          // Always refresh the table data after successful import
          setTimeout(async () => {
            await fetchDivisionalHtmlTableData();
          }, 300);
        } else {
          // Unexpected response - show error
          message.destroy(DIVISIONAL_IMPORT_MESSAGE_KEY);
          message.error('Unexpected response from server. Please try again.');
        }
      } catch (error) {
        message.destroy(DIVISIONAL_IMPORT_MESSAGE_KEY);
        console.error('Error importing divisional HTML:', error);
        
        // Check for network/connection errors
        if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
          message.error({
            content: '❌ Cannot connect to server!\n\nThe backend server may not be running. Please check that the server is started.',
            duration: 8
          });
        } else if (error.response?.data?.error) {
          message.error(error.response.data.error);
        } else {
          message.error('Failed to import divisional budget file: ' + (error.message || 'Unknown error'));
        }
      }
    };
    reader.readAsText(file);
  };
  
  const performDivisionalImport = async (htmlContent) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/aebf/import-divisional-budget-html`, {
        htmlContent: htmlContent,
        confirmReplace: true
      });
      
      // Get the actual data (may be nested under .data)
      const importData = response.data.data || response.data;
      
      if (response.data.success || importData.success) {
        message.destroy(DIVISIONAL_IMPORT_MESSAGE_KEY);
        
        // Show detailed success modal with budget totals
        modal.success({
          title: '✅ Divisional Budget Imported Successfully',
          content: (
            <div>
              <div style={{ background: '#f6ffed', padding: 12, borderRadius: 4, marginBottom: 16, border: '1px solid #b7eb8f' }}>
                <p><strong>Division:</strong> {importData.metadata?.division}</p>
                <p><strong>Budget Year:</strong> {importData.metadata?.budgetYear}</p>
              </div>
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontWeight: 500, marginBottom: 8 }}>Budget Totals Imported:</p>
                <ul style={{ marginLeft: 20, marginTop: 4 }}>
                  <li><strong>Volume:</strong> {(importData.budgetTotals?.volumeMT || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} MT</li>
                  <li><strong>Amount:</strong> ({renderModalCurrencySymbol()}) {((importData.budgetTotals?.amount || 0) / 1000000).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}M</li>
                  <li><strong>MoRM:</strong> ({renderModalCurrencySymbol()}) {((importData.budgetTotals?.morm || 0) / 1000000).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}M</li>
                  {importData.budgetTotals?.servicesCharges > 0 && (
                    <li style={{ color: '#1890ff', fontStyle: 'italic' }}>
                      <strong>Services Charges:</strong> ({renderModalCurrencySymbol()}) {((importData.budgetTotals?.servicesCharges || 0) / 1000000).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}M (included in Amount/MoRM)
                    </li>
                  )}
                </ul>
              </div>
              <p style={{ fontSize: '12px', color: '#666' }}><strong>Records:</strong> {importData.recordsInserted?.total || 0} | <strong>Pricing Year:</strong> {importData.pricingYear}</p>
              {importData.warnings && importData.warnings.length > 0 && (
                <div style={{ marginTop: 16, padding: 12, background: '#fff7e6', borderRadius: 4, border: '1px solid #ffd591' }}>
                  <p style={{ fontWeight: 500, marginBottom: 4, color: '#d46b08' }}>⚠️ Warnings:</p>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: '12px' }}>
                    {importData.warnings.map((warning, idx) => (
                      <li key={idx}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              {importData.skippedRecords > 0 && (
                <div style={{ marginTop: 12, padding: 12, background: '#fff1f0', borderRadius: 4, border: '1px solid #ffccc7' }}>
                  <p style={{ fontWeight: 500, marginBottom: 8, color: '#cf1322', fontSize: '12px' }}>
                    ⚠️ {importData.skippedRecords} invalid record(s) were skipped
                  </p>
                  {importData.errors && importData.errors.length > 0 && (
                    <div style={{ maxHeight: 150, overflowY: 'auto', fontSize: '11px' }}>
                      {importData.errors.slice(0, 5).map((err, idx) => (
                        <div key={idx} style={{ marginBottom: 4, padding: '4px 8px', background: '#fff', borderRadius: 2 }}>
                          <strong>Row {err.index + 1}:</strong> {err.reason}
                          {err.suggestion && (
                            <div style={{ color: '#666', marginTop: 2 }}>💡 {err.suggestion}</div>
                          )}
                        </div>
                      ))}
                      {importData.errors.length > 5 && (
                        <p style={{ color: '#999', margin: '4px 0 0 0' }}>
                          ... and {importData.errors.length - 5} more errors
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ),
          width: 500
        });
        
        // Auto-switch actualYear filter if division matches
        if (selectedDivision === importData.metadata?.division) {
          const targetActualYear = importData.metadata.budgetYear - 1;
          const isSameYear = divisionalHtmlFilters.actualYear === targetActualYear;
          
          // Auto-switch actualYear
          setDivisionalHtmlFilters({
            actualYear: targetActualYear
          });
          
          if (isSameYear) {
            // Force refresh since useEffect won't trigger if year hasn't changed
            await fetchDivisionalHtmlTableData({ skipSuccessMessage: true });
          } else {
            message.info('Filters automatically switched to show imported budget');
            // useEffect will automatically trigger fetchDivisionalHtmlTableData() when filter updates
          }
        } else {
          // If division doesn't match, refresh manually to show updated data
          await fetchDivisionalHtmlTableData({ skipSuccessMessage: true });
        }
      }
    } catch (error) {
      console.error('Error performing divisional import:', error);
      message.destroy(DIVISIONAL_IMPORT_MESSAGE_KEY);
      
      // Show detailed error handling
      const errorData = error.response?.data;
      if (errorData?.isDraft) {
        modal.error({
          title: '⚠️ Cannot Upload Draft File',
          content: (
            <div>
              <p>This file is a work-in-progress draft and cannot be uploaded.</p>
              <div style={{ marginTop: 12, padding: 12, background: '#e6f7ff', borderRadius: 4, border: '1px solid #91d5ff' }}>
                <p style={{ fontWeight: 500, marginBottom: 4 }}>💡 How to fix:</p>
                <ol style={{ margin: 0, paddingLeft: 20, fontSize: '12px' }}>
                  <li>Open the draft HTML file in your browser</li>
                  <li>Complete your budget entries</li>
                  <li>Click the <strong>"Save Final"</strong> button</li>
                  <li>Upload the new BUDGET_Divisional_*.html file</li>
                </ol>
              </div>
            </div>
          ),
          width: 450
        });
      } else if (errorData?.recordErrors && errorData.recordErrors.length > 0) {
        modal.error({
          title: '❌ Invalid Records Found',
          content: (
            <div>
              <p>Found {errorData.totalErrors || errorData.recordErrors.length} invalid record(s) in the file.</p>
              <div style={{ marginTop: 12, maxHeight: 200, overflow: 'auto' }}>
                {errorData.recordErrors.slice(0, 5).map((err, idx) => (
                  <div key={idx} style={{ padding: 8, background: '#fff1f0', marginBottom: 4, borderRadius: 4, fontSize: '12px' }}>
                    <strong>Record #{err.index}:</strong> {err.productGroup} (Month {err.month})
                    <br />
                    <span style={{ color: '#cf1322' }}>{err.errors.join(', ')}</span>
                  </div>
                ))}
              </div>
            </div>
          ),
          width: 500
        });
      } else {
        message.error(errorData?.error || 'Failed to import divisional budget');
      }
    }
  };
  
  const submitDivisionalBudget = useCallback(async () => {
    if (isSubmittingDivisional) {
      return;
    }
    
    if (!selectedDivision || !divisionalHtmlFilters.actualYear) {
      message.warning('Please select division and actual year first');
      return;
    }
    
    const budgetYear = divisionalHtmlBudgetYear;
    if (!budgetYear) {
      message.warning('Please select a Budget Year');
      return;
    }
    
    // Regular product group records (MT -> KGS conversion)
    const records = Object.entries(divisionalHtmlBudgetData).reduce((acc, [key, value]) => {
      const [productGroup, monthStr] = key.split('|');
      if (!productGroup || monthStr === undefined) {
        return acc;
      }
      const numericValue = parseFloat((value ?? '').toString().replace(/,/g, ''));
      if (Number.isNaN(numericValue) || numericValue < 0) {
        return acc;
      }
      const month = parseInt(monthStr, 10);
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        return acc;
      }
      acc.push({
        productGroup,
        month,
        value: Math.round(numericValue * 1000) // MT to KGS
      });
      return acc;
    }, []);
    
    // Services Charges records (Amount entered in k, store as actual value)
    const servicesChargesRecords = Object.entries(servicesChargesBudget).reduce((acc, [key, value]) => {
      // Key format: "Services Charges|month|AMOUNT"
      const parts = key.split('|');
      if (parts.length !== 3 || parts[0] !== 'Services Charges') {
        return acc;
      }
      const month = parseInt(parts[1], 10);
      const metric = parts[2]; // AMOUNT
      const numericValue = parseFloat((value ?? '').toString().replace(/,/g, ''));
      if (Number.isNaN(numericValue) || numericValue <= 0) {
        return acc;
      }
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        return acc;
      }
      acc.push({
        productGroup: 'Services Charges',
        month,
        metric, // 'AMOUNT'
        value: Math.round(numericValue * 1000), // k to actual value
        isServiceCharges: true
      });
      return acc;
    }, []);
    
    if (records.length === 0 && servicesChargesRecords.length === 0) {
      message.warning('Please enter at least one valid budget value before submitting');
      return;
    }
    
    setIsSubmittingDivisional(true);
    message.loading({ content: 'Submitting divisional budget...', key: 'divisionalSubmit' });
    
    try {
      // First, save the current data as draft (ensure it's saved)
      await axios.post(`${API_BASE_URL}/api/budget-draft/save-divisional-draft`, {
        division: selectedDivision,
        budgetYear,
        budgetData: divisionalHtmlBudgetData,
        servicesChargesBudget,
      });
      
      // Then, submit final (changes status from draft to approved)
      const response = await axios.post(`${API_BASE_URL}/api/budget-draft/submit-divisional-final`, {
        division: selectedDivision,
        budgetYear
      });
      
      // Close modal first
      setSubmitDivisionalConfirmVisible(false);
      
      // Calculate total MT
      const totalMT = records.reduce((sum, r) => sum + (r.value || 0), 0) / 1000;
      const formattedMT = totalMT.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
      const divisionName = selectedDivision;
      const totalRecords = response.data.recordsPromoted || records.length + servicesChargesRecords.length;
      
      // Destroy loading message
      message.destroy('divisionalSubmit');
      
      // Show prominent notification that won't be overwritten
      notification.success({
        message: 'Divisional Budget Submitted',
        description: `${formattedMT} MT approved for ${divisionName} ${budgetYear} database (${totalRecords} product-month records)`,
        duration: 6,
        placement: 'topRight'
      });
      
      // Refresh table data without showing the "loaded" message
      await fetchDivisionalHtmlTableData({ skipSuccessMessage: true });
    } catch (error) {
      console.error('Error saving divisional budget:', error);
      const backendError = error.response?.data?.error;
      message.error({
        content: backendError || 'Failed to submit divisional budget',
        key: 'divisionalSubmit',
        duration: 10
      });
    } finally {
      setIsSubmittingDivisional(false);
    }
  }, [isSubmittingDivisional, selectedDivision, divisionalHtmlFilters.actualYear, divisionalHtmlBudgetYear, divisionalHtmlBudgetData, servicesChargesBudget, fetchDivisionalHtmlTableData]);

  // Edit Divisional Budget - unlock approved budget for editing (change status to draft)
  const editDivisionalBudget = useCallback(async () => {
    if (isEditingDivisional) return;
    
    const budgetYear = divisionalHtmlBudgetYear || (divisionalHtmlFilters.actualYear + 1);
    
    setIsEditingDivisional(true);
    message.loading({ content: 'Unlocking budget for editing...', key: 'divisionalEdit' });
    
    try {
      const response = await axios.post(`${API_BASE_URL}/api/budget-draft/edit-divisional-budget`, {
        division: selectedDivision,
        budgetYear
      });
      
      // Close modal
      setEditDivisionalConfirmVisible(false);
      
      // Destroy loading message
      message.destroy('divisionalEdit');
      
      // Update local status
      setDivisionalBudgetStatus('draft');
      setDivisionalDraftStatus('saved');
      
      // Show success notification
      notification.success({
        message: 'Budget Unlocked for Editing',
        description: `${budgetYear} divisional budget is now editable (${response.data.recordsUnlocked} records)`,
        duration: 4,
        placement: 'topRight'
      });
      
      // Refresh table data
      await fetchDivisionalHtmlTableData({ skipSuccessMessage: true });
    } catch (error) {
      console.error('Error unlocking divisional budget:', error);
      const backendError = error.response?.data?.error;
      message.error({
        content: backendError || 'Failed to unlock budget for editing',
        key: 'divisionalEdit',
        duration: 10
      });
    } finally {
      setIsEditingDivisional(false);
    }
  }, [isEditingDivisional, selectedDivision, divisionalHtmlFilters.actualYear, divisionalHtmlBudgetYear, fetchDivisionalHtmlTableData]);
  
  // Calculate divisional monthly totals
  const divisionalMonthlyActualTotals = useMemo(() => {
    const totals = {};
    for (let month = 1; month <= 12; month++) {
      totals[month] = 0;
    }
    divisionalHtmlTableData.forEach(row => {
      for (let month = 1; month <= 12; month++) {
        // monthlyActual[month] is object with {MT, AMOUNT, MORM}
        const monthData = row.monthlyActual?.[month];
        totals[month] += monthData?.MT ?? monthData ?? 0;
      }
    });
    return totals;
  }, [divisionalHtmlTableData]);
  
  const divisionalMonthlyBudgetTotals = useMemo(() => {
    const totals = {};
    for (let month = 1; month <= 12; month++) {
      totals[month] = 0;
    }
    Object.keys(divisionalHtmlBudgetData).forEach(key => {
      let month;
      if (key.startsWith('custom_')) {
        const parts = key.split('_');
        month = parseInt(parts[parts.length - 1], 10);
      } else {
        const parts = key.split('|');
        month = parseInt(parts[parts.length - 1], 10);
      }
      if (month >= 1 && month <= 12) {
        const value = divisionalHtmlBudgetData[key];
        const num = parseFloat((value || '').toString().replace(/,/g, '')) || 0;
        if (!isNaN(num)) {
          totals[month] += num;
        }
      }
    });
    return totals;
  }, [divisionalHtmlBudgetData]);
  
  const divisionalActualYearTotal = useMemo(() => {
    return Object.values(divisionalMonthlyActualTotals).reduce((sum, val) => sum + val, 0);
  }, [divisionalMonthlyActualTotals]);
  
  const divisionalBudgetYearTotal = useMemo(() => {
    return Object.values(divisionalMonthlyBudgetTotals).reduce((sum, val) => sum + val, 0);
  }, [divisionalMonthlyBudgetTotals]);
  
  // Calculate monthly Actual Amount totals (from database, not calculated)
  // Includes regular product groups + Services Charges
  const divisionalMonthlyActualAmountTotals = useMemo(() => {
    const totals = {};
    for (let month = 1; month <= 12; month++) {
      totals[month] = 0;
    }
    // Regular product groups
    divisionalHtmlTableData.forEach(row => {
      for (let month = 1; month <= 12; month++) {
        const monthData = row.monthlyActual?.[month];
        totals[month] += monthData?.AMOUNT ?? 0;
      }
    });
    // Add Services Charges actual Amount
    if (servicesChargesData?.monthlyActual) {
      for (let month = 1; month <= 12; month++) {
        const monthData = servicesChargesData.monthlyActual[month];
        totals[month] += monthData?.AMOUNT ?? 0;
      }
    }
    return totals;
  }, [divisionalHtmlTableData, servicesChargesData]);
  
  const divisionalActualAmountYearTotal = useMemo(() => {
    return Object.values(divisionalMonthlyActualAmountTotals).reduce((sum, val) => sum + val, 0);
  }, [divisionalMonthlyActualAmountTotals]);

  // Calculate monthly Actual MoRM totals (from database)
  // Includes regular product groups + Services Charges (MoRM = 100% of Amount for Services Charges)
  const divisionalMonthlyActualMormTotals = useMemo(() => {
    const totals = {};
    for (let month = 1; month <= 12; month++) {
      totals[month] = 0;
    }
    // Regular product groups
    divisionalHtmlTableData.forEach(row => {
      for (let month = 1; month <= 12; month++) {
        const monthData = row.monthlyActual?.[month];
        totals[month] += monthData?.MORM ?? 0;
      }
    });
    // Add Services Charges MoRM (= 100% of Amount)
    if (servicesChargesData?.monthlyActual) {
      for (let month = 1; month <= 12; month++) {
        const monthData = servicesChargesData.monthlyActual[month];
        // Services Charges MoRM = 100% of Amount
        totals[month] += monthData?.AMOUNT ?? 0;
      }
    }
    return totals;
  }, [divisionalHtmlTableData, servicesChargesData]);
  
  const divisionalActualMormYearTotal = useMemo(() => {
    return Object.values(divisionalMonthlyActualMormTotals).reduce((sum, val) => sum + val, 0);
  }, [divisionalMonthlyActualMormTotals]);

  // Calculate product group ACTUAL totals (sum of all 12 months per product group)
  const divisionalProductGroupActualTotals = useMemo(() => {
    const totals = {};
    divisionalHtmlTableData.forEach(row => {
      let total = 0;
      for (let month = 1; month <= 12; month++) {
        // monthlyActual[month] is object with {MT, AMOUNT, MORM}
        const monthData = row.monthlyActual?.[month];
        total += monthData?.MT ?? monthData ?? 0;
      }
      totals[row.productGroup] = total;
    });
    return totals;
  }, [divisionalHtmlTableData]);
  
  // Calculate product group BUDGET totals (sum of all 12 months per product group)
  const divisionalProductGroupBudgetTotals = useMemo(() => {
    const totals = {};
    divisionalHtmlTableData.forEach(row => {
      let total = 0;
      for (let month = 1; month <= 12; month++) {
        const key = `${row.productGroup}|${month}`;
        const value = parseFloat((divisionalHtmlBudgetData[key] || '').toString().replace(/,/g, '')) || 0;
        total += value;
      }
      totals[row.productGroup] = total;
    });
    return totals;
  }, [divisionalHtmlTableData, divisionalHtmlBudgetData]);
  
  // Helper to find pricing by product group (case-insensitive)
  const findPricing = useCallback((productGroup) => {
    if (!productGroup || !divisionalPricingData) return { sellingPrice: 0, morm: 0 };
    
    // Try exact match first
    if (divisionalPricingData[productGroup]) {
      const p = divisionalPricingData[productGroup];
      return { sellingPrice: p.asp || p.sellingPrice || 0, morm: p.morm || 0 };
    }
    
    // Try case-insensitive match
    const normalizedKey = productGroup.toLowerCase().trim();
    for (const key of Object.keys(divisionalPricingData)) {
      if (key.toLowerCase().trim() === normalizedKey) {
        const p = divisionalPricingData[key];
        return { sellingPrice: p.asp || p.sellingPrice || 0, morm: p.morm || 0 };
      }
    }
    return { sellingPrice: 0, morm: 0 };
  }, [divisionalPricingData]);
  
  // Calculate monthly Amount totals 
  // For existing budgets: Use stored Amount values from database
  // For new budgets: Calculate from MT × pricing
  const divisionalMonthlyAmountTotals = useMemo(() => {
    const totals = {};
    for (let month = 1; month <= 12; month++) {
      totals[month] = 0;
    }
    
    // Regular product groups
    divisionalHtmlTableData.forEach(row => {
      for (let month = 1; month <= 12; month++) {
        const key = `${row.productGroup}|${month}`;
        
        // Check if we have stored Amount from database
        const storedData = divisionalBudgetDetailed[key];
        if (storedData && storedData.amount) {
          // Use stored Amount value (already in full AED)
          totals[month] += storedData.amount;
        } else {
          // Calculate from MT × pricing (for new budgets)
          const pricing = findPricing(row.productGroup);
          const mtValue = parseFloat((divisionalHtmlBudgetData[key] || '').toString().replace(/,/g, '')) || 0;
          // MT to KGS (×1000), then multiply by selling price
          totals[month] += mtValue * 1000 * pricing.sellingPrice;
        }
      }
    });
    // Add Services Charges budget Amount (entered in thousands by user, multiply by 1000)
    for (let month = 1; month <= 12; month++) {
      const key = `Services Charges|${month}|AMOUNT`;
      const scAmountInK = parseFloat((servicesChargesBudget[key] || '').toString().replace(/,/g, '')) || 0;
      totals[month] += scAmountInK * 1000; // Convert from k to actual value
    }
    return totals;
  }, [divisionalHtmlTableData, divisionalHtmlBudgetData, divisionalBudgetDetailed, findPricing, servicesChargesBudget]);
  
  // Calculate monthly MoRM totals
  // For existing budgets: Use stored MoRM values from database
  // For new budgets: Calculate from MT × morm pricing
  const divisionalMonthlyMormTotals = useMemo(() => {
    const totals = {};
    for (let month = 1; month <= 12; month++) {
      totals[month] = 0;
    }
    // Regular product groups
    divisionalHtmlTableData.forEach(row => {
      for (let month = 1; month <= 12; month++) {
        const key = `${row.productGroup}|${month}`;
        
        // Check if we have stored MoRM from database
        const storedData = divisionalBudgetDetailed[key];
        if (storedData && storedData.morm) {
          // Use stored MoRM value (already in full AED)
          totals[month] += storedData.morm;
        } else {
          // Calculate from MT × pricing (for new budgets)
          const pricing = findPricing(row.productGroup);
          const mtValue = parseFloat((divisionalHtmlBudgetData[key] || '').toString().replace(/,/g, '')) || 0;
          // MT to KGS (×1000), then multiply by morm
          totals[month] += mtValue * 1000 * pricing.morm;
        }
      }
    });
    // Add Services Charges MoRM (= 100% of budget Amount, entered in thousands)
    for (let month = 1; month <= 12; month++) {
      const key = `Services Charges|${month}|AMOUNT`;
      const scAmountInK = parseFloat((servicesChargesBudget[key] || '').toString().replace(/,/g, '')) || 0;
      // Services Charges MoRM = 100% of Amount (convert from k to actual)
      totals[month] += scAmountInK * 1000;
    }
    return totals;
  }, [divisionalHtmlTableData, divisionalHtmlBudgetData, divisionalBudgetDetailed, findPricing, servicesChargesBudget]);
  
  // Grand totals for Amount and MoRM
  const divisionalAmountYearTotal = useMemo(() => {
    return Object.values(divisionalMonthlyAmountTotals).reduce((sum, val) => sum + val, 0);
  }, [divisionalMonthlyAmountTotals]);
  
  const divisionalMormYearTotal = useMemo(() => {
    return Object.values(divisionalMonthlyMormTotals).reduce((sum, val) => sum + val, 0);
  }, [divisionalMonthlyMormTotals]);
  
  // Format currency helper (AED style with UAE Dirham symbol)
  const renderAedValue = (value) => {
    const n = Number(value) || 0;
    let formattedNumber;
    if (Math.abs(n) >= 1_000_000) {
      formattedNumber = `${(n/1_000_000).toFixed(2)}M`;
    } else if (Math.abs(n) >= 1_000) {
      formattedNumber = `${(n/1_000).toFixed(1)}k`;
    } else {
      formattedNumber = n.toFixed(0);
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
        <CurrencySymbol />
        {formattedNumber}
      </span>
    );
  };
  
  const divisionalBudgetYearDerived = divisionalHtmlBudgetYear; // Selected budget year from unified table
  
  // Load divisional actual years and product groups on mount/division change
  useEffect(() => {
    if (selectedDivision && activeHtmlSubTab === 'divisional') {
      fetchDivisionalHtmlActualYears();
    }
  }, [selectedDivision, activeHtmlSubTab, fetchDivisionalHtmlActualYears]);
  
  // Fetch divisional table data when filters change
  useEffect(() => {
    if (activeHtmlSubTab === 'divisional' && divisionalHtmlFilters.actualYear) {
      fetchDivisionalHtmlTableData();
    } else if (activeHtmlSubTab === 'divisional') {
      setDivisionalHtmlTableData([]);
      setDivisionalHtmlBudgetData({});
    }
  }, [divisionalHtmlFilters.actualYear, divisionalHtmlBudgetYear, activeHtmlSubTab, fetchDivisionalHtmlTableData]);
  
  // Custom row handlers
  const handleAddCustomRow = () => {
    // In All Sales Reps mode, require targetSalesRep selection
    if (isAllSalesReps && !targetSalesRep) {
      message.warning('Please select a Target Sales Rep first to add a new row');
      return;
    }
    
    const newRow = {
      id: Date.now(),
      customer: null,
      country: null,
      productGroup: null,
      isNewCustomer: false,
      salesRep: isAllSalesReps ? targetSalesRep : htmlFilters.salesRep, // Assign to target sales rep
    };
    setHtmlCustomRows(prev => [...prev, newRow]);
  };
  
  const handleRemoveCustomRow = (rowId) => {
    setHtmlCustomRows(prev => prev.filter(row => row.id !== rowId));
    // Also remove budget data for this row
    const updatedBudget = { ...htmlBudgetData };
    Object.keys(updatedBudget).forEach(key => {
      if (key.startsWith(`custom_${rowId}_`)) {
        delete updatedBudget[key];
      }
    });
    setHtmlBudgetData(updatedBudget);
  };

  // Fetch budget years for recap
  const fetchRecapYears = async () => {
    if (!selectedDivision) {
      setRecapYears([]);
      return;
    }
    
    setRecapYearsLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/aebf/budget-years`, {
        params: { division: selectedDivision }
      });
      
      if (response.data.success) {
        setRecapYears(response.data.years || []);
        setRecapSelectedYear(null);
        setRecapSalesReps([]);
        setRecapSelectedSalesRep(null);
        setRecapData([]);
      }
    } catch (error) {
      console.error('Error fetching recap years:', error);
      message.error('Failed to load budget years');
      setRecapYears([]);
    } finally {
      setRecapYearsLoading(false);
    }
  };
  
  // Fetch sales reps for selected year
  const fetchRecapSalesReps = async (year) => {
    if (!selectedDivision || !year) {
      setRecapSalesReps([]);
      setRecapData([]);
      return;
    }
    
    setRecapSalesRepsLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/aebf/budget-sales-reps`, {
        params: { division: selectedDivision, budgetYear: year }
      });
      
      if (response.data.success) {
        const rawSalesReps = response.data.salesReps || [];
        
        // Apply grouping to sales reps
        const groupedOptions = [];
        const groupedMembers = new Set();
        const handledGroupNames = new Set();
        
        // Normalize raw sales reps for comparison
        const normalizedRawSalesReps = rawSalesReps.map(rep => rep.toString().trim().toUpperCase());
        
        // Add groups first - check if group name OR any member is in rawSalesReps
        Object.keys(htmlGroups).forEach(groupName => {
          const members = htmlGroups[groupName] || [];
          const normalizedMembers = members.map(m => m.toString().trim().toUpperCase());
          const normalizedGroupName = groupName.toString().trim().toUpperCase();
          
          // Check if the group name itself is in rawSalesReps (budget saved under group name)
          // OR if any member has data
          const groupNameInData = normalizedRawSalesReps.includes(normalizedGroupName);
          const memberInData = normalizedRawSalesReps.some(rep => normalizedMembers.includes(rep));
          
          if (groupNameInData || memberInData) {
            groupedOptions.push(groupName);
            normalizedMembers.forEach(m => groupedMembers.add(m));
            handledGroupNames.add(normalizedGroupName);
          }
        });
        
        // Add individual sales reps (not in groups and not a group name)
        rawSalesReps.forEach(rep => {
          const normalized = rep.toString().trim().toUpperCase();
          if (!groupedMembers.has(normalized) && !handledGroupNames.has(normalized)) {
            const displayLabel = htmlSalesRepLabelMap[normalized] || rep;
            groupedOptions.push(displayLabel);
          }
        });
        
        setRecapSalesReps(groupedOptions);
        
        // Automatically fetch year total (all sales reps) and set selection
        setRecapSelectedSalesRep('__ALL__');
        fetchRecapData(year, '__ALL__');
      }
    } catch (error) {
      console.error('Error fetching recap sales reps:', error);
      message.error('Failed to load sales reps');
      setRecapSalesReps([]);
      setRecapData([]);
    } finally {
      setRecapSalesRepsLoading(false);
    }
  };
  
  // Fetch sales rep recap data
  const fetchRecapData = async (year, salesRep) => {
    if (!selectedDivision || !year) {
      setRecapData([]);
      return;
    }
    
    // If no specific sales rep, fetch all sales reps total
    if (!salesRep || salesRep === '__ALL__') {
      setRecapLoading(true);
      try {
        // Get all sales reps for this year
        const salesRepsResponse = await axios.get(`${API_BASE_URL}/api/aebf/budget-sales-reps`, {
          params: { division: selectedDivision, budgetYear: year }
        });
        
        if (!salesRepsResponse.data.success) {
          setRecapData([]);
          return;
        }
        
        const allSalesReps = salesRepsResponse.data.salesReps || [];
        
        // Fetch recap for each sales rep and aggregate
        const recapPromises = allSalesReps.map(rep => 
          axios.post(`${API_BASE_URL}/api/aebf/budget-sales-rep-recap`, {
            division: selectedDivision,
            budgetYear: year,
            salesRep: rep
          })
        );
        
        const results = await Promise.all(recapPromises);
        
        // Aggregate all results
        const aggregated = {
          'Amount': { values_type: 'Amount', total_values: 0, record_count: 0 },
          'KGS': { values_type: 'KGS', total_values: 0, record_count: 0 },
          'MoRM': { values_type: 'MoRM', total_values: 0, record_count: 0 }
        };
        
        results.forEach(response => {
          if (response.data.success) {
            (response.data.recap || []).forEach(item => {
              if (aggregated[item.values_type]) {
                aggregated[item.values_type].total_values += parseFloat(item.total_values) || 0;
                aggregated[item.values_type].record_count += parseInt(item.record_count) || 0;
              }
            });
          }
        });
        
        setRecapData(Object.values(aggregated));
        setRecapSelectedSalesRep('__ALL__');
      } catch (error) {
        console.error('Error fetching recap data for all sales reps:', error);
        message.error('Failed to load year total');
        setRecapData([]);
      } finally {
        setRecapLoading(false);
      }
      return;
    }
    
    setRecapLoading(true);
    try {
      // Backend now checks both sales_rep_name and sales_rep_group_name with OR
      // So we just need to query once with the selected name
      const response = await axios.post(`${API_BASE_URL}/api/aebf/budget-sales-rep-recap`, {
        division: selectedDivision,
        budgetYear: year,
        salesRep: salesRep
      });
      
      if (response.data.success) {
        setRecapData(response.data.recap || []);
      } else {
        setRecapData([]);
      }
    } catch (error) {
      console.error('Error fetching recap data:', error);
      message.error('Failed to load sales rep recap');
      setRecapData([]);
    } finally {
      setRecapLoading(false);
    }
  };
  
  // Fetch product group breakdown for table
  const fetchRecapProductGroups = async (year, salesRep) => {
    if (!selectedDivision || !year) {
      setRecapProductGroups([]);
      return;
    }
    
    setRecapProductGroupsLoading(true);
    try {
      // Resolve raw sales rep name if it's a group or formatted label
      let rawSalesReps = [];
      
      if (!salesRep || salesRep === '__ALL__') {
        // Get all sales reps
        const salesRepsResponse = await axios.get(`${API_BASE_URL}/api/aebf/budget-sales-reps`, {
          params: { division: selectedDivision, budgetYear: year }
        });
        rawSalesReps = salesRepsResponse.data.salesReps || [];
      } else {
        // Check if it's a group
        const groupMembers = htmlGroups[salesRep];
        if (groupMembers && groupMembers.length > 0) {
          // Include group name AND members (budget could be saved under either)
          rawSalesReps = [salesRep, ...groupMembers];
        } else {
          // Reverse lookup in label map for individual
          let rawName = salesRep;
          for (const [key, value] of Object.entries(htmlSalesRepLabelMap)) {
            if (value === salesRep) {
              rawName = key;
              break;
            }
          }
          rawSalesReps = [rawName];
        }
      }
      
      // Fetch product group data for all sales reps and aggregate
      const pgPromises = rawSalesReps.map(rep =>
        axios.post(`${API_BASE_URL}/api/aebf/budget-product-groups`, {
          division: selectedDivision,
          budgetYear: year,
          salesRep: rep
        })
      );
      
      const results = await Promise.all(pgPromises);
      
      // Aggregate budget product groups
      const pgMap = {};
      results.forEach(response => {
        if (response.data.success) {
          (response.data.productGroups || []).forEach(pg => {
            if (!pgMap[pg.name]) {
              pgMap[pg.name] = {
                name: pg.name,
                KGS: 0,
                Amount: 0,
                MoRM: 0,
                RM: pg.RM || 0,
                Material: pg.Material || '',
                Process: pg.Process || '',
                actualKGS: 0,
                actualAmount: 0,
                actualMoRM: 0
              };
            }
            pgMap[pg.name].KGS += pg.KGS || 0;
            pgMap[pg.name].Amount += pg.Amount || 0;
            pgMap[pg.name].MoRM += pg.MoRM || 0;
            // Update Material/Process if not already set
            if (!pgMap[pg.name].Material && pg.Material) {
              pgMap[pg.name].Material = pg.Material;
            }
            if (!pgMap[pg.name].Process && pg.Process) {
              pgMap[pg.name].Process = pg.Process;
            }
          });
        }
      });
      
      
      // Fetch actual data for the previous year
      const actualYear = year - 1;
      
      // For actual data, if salesRep is '__ALL__', make a single query for all actual data
      // Don't use budget sales reps list because some may not have actual data
      let actualResults;
      if (!salesRep || salesRep === '__ALL__') {
        // Single query for all actual data
        const actualResponse = await axios.post(`${API_BASE_URL}/api/aebf/actual-product-groups`, {
          division: selectedDivision,
          actualYear: actualYear,
          salesRep: '__ALL__'
        });
        actualResults = [actualResponse];
      } else {
        // Query for specific sales reps (for groups or individuals)
        const actualPromises = rawSalesReps.map(rep =>
          axios.post(`${API_BASE_URL}/api/aebf/actual-product-groups`, {
            division: selectedDivision,
            actualYear: actualYear,
            salesRep: rep
          })
        );
        actualResults = await Promise.all(actualPromises);
      }
      
      // Aggregate actual product groups
      actualResults.forEach(response => {
        if (response.data.success) {
          (response.data.productGroups || []).forEach(pg => {
            if (!pgMap[pg.name]) {
              pgMap[pg.name] = {
                name: pg.name,
                KGS: 0,
                Amount: 0,
                MoRM: 0,
                RM: pg.RM || 0,
                Material: pg.Material || '',
                Process: pg.Process || '',
                actualKGS: 0,
                actualAmount: 0,
                actualMoRM: 0
              };
            }
            pgMap[pg.name].actualKGS += pg.KGS || 0;
            pgMap[pg.name].actualAmount += pg.Amount || 0;
            pgMap[pg.name].actualMoRM += pg.MoRM || 0;
          });
        }
      });
      
      // Sort product groups: alphabetical, Others second-to-last, Services Charges last
      const sortedProductGroups = Object.values(pgMap).sort((a, b) => {
        const aName = (a.name || '').toUpperCase();
        const bName = (b.name || '').toUpperCase();
        
        // Services Charges always last
        if (aName === 'SERVICES CHARGES') return 1;
        if (bName === 'SERVICES CHARGES') return -1;
        
        // Others second-to-last
        if (aName === 'OTHERS') return 1;
        if (bName === 'OTHERS') return -1;
        
        // Alphabetical for the rest
        return aName.localeCompare(bName);
      });
      
      setRecapProductGroups(sortedProductGroups);
    } catch (error) {
      console.error('Error fetching product groups:', error);
      message.error('Failed to load product group breakdown');
      setRecapProductGroups([]);
    } finally {
      setRecapProductGroupsLoading(false);
    }
  };
  
  // Handle year selection in recap
  const handleRecapYearSelect = (year) => {
    setRecapSelectedYear(year);
    fetchRecapSalesReps(year);
    setRecapTableSalesRep('__ALL__');
    fetchRecapProductGroups(year, '__ALL__');
  };
  
  // Handle sales rep selection in recap
  const handleRecapSalesRepSelect = (salesRep) => {
    setRecapSelectedSalesRep(salesRep);
    fetchRecapData(recapSelectedYear, salesRep);
  };
  
  // Handle sales rep selection for product group table
  const handleRecapTableSalesRepChange = (salesRep) => {
    setRecapTableSalesRep(salesRep);
    fetchRecapProductGroups(recapSelectedYear, salesRep);
  };

  const handleDeleteBudget = async () => {
    
    if (!selectedDivision || !htmlFilters.actualYear) {
      message.warning('Please select division and year first');
      return;
    }
    
    const budgetYear = parseInt(htmlFilters.actualYear) + 1;
    
    // In All Sales Reps mode without targetSalesRep, delete ALL budget for the year
    if (isAllSalesReps && !targetSalesRep) {
      const confirmMessage = `⚠️ DELETE ALL BUDGET DATA\n\n` +
        `Are you sure you want to delete ALL budget data for:\n\n` +
        `Division: ${selectedDivision}\n` +
        `Budget Year: ${budgetYear}\n` +
        `ALL SALES REPS\n\n` +
        `⚠️ THIS WILL DELETE BUDGET FOR ALL SALES REPS!\n` +
        `⚠️ THIS ACTION CANNOT BE UNDONE!\n\n` +
        `Click OK to delete, or Cancel to abort.`;
      
      if (!window.confirm(confirmMessage)) {
        return;
      }
      
      try {
        const url = `${API_BASE_URL}/api/budget-draft/delete-all-budget/${selectedDivision}/${budgetYear}`;
        
        const response = await axios.delete(url);
        
        if (response.data.success) {
          const totalDeleted = response.data.deletedCount || 0;
          const finalCount = response.data.finalRecords || 0;
          const draftCount = response.data.draftRecords || 0;
          
          if (totalDeleted === 0) {
            message.info({
              content: 'ℹ️ No budget data found to delete. The budget is already empty.',
              duration: 5
            });
          } else {
            message.success({
              content: `✅ Successfully deleted ${totalDeleted} records for ALL sales reps (${finalCount} final, ${draftCount} draft)`,
              duration: 5
            });
          }
          
          await fetchAllSalesRepsData();
        } else {
          message.error(response.data.error || 'Failed to delete budget');
        }
      } catch (error) {
        console.error('❌ Error deleting all budget:', error);
        message.error({
          content: 'Failed to delete budget: ' + (error.response?.data?.error || error.message),
          duration: 5
        });
      }
      return;
    }
    
    // Single sales rep delete (existing logic)
    const effectiveSalesRep = isAllSalesReps ? targetSalesRep : htmlFilters.salesRep;
    
    if (!effectiveSalesRep) {
      message.warning('Please select a sales rep first');
      return;
    }
    
    
    // Use window.confirm as Modal.confirm has compatibility issues with React 19
    const confirmMessage = `⚠️ DELETE BUDGET DATA\n\nAre you sure you want to delete ALL budget data for:\n\n` +
      `Division: ${selectedDivision}\n` +
      `Sales Rep: ${effectiveSalesRep}\n` +
      `Budget Year: ${budgetYear}\n\n` +
      `⚠️ THIS ACTION CANNOT BE UNDONE!\n\n` +
      `Click OK to delete, or Cancel to abort.`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    try {
      const url = `${API_BASE_URL}/api/budget-draft/delete-final/${selectedDivision}/${effectiveSalesRep}/${budgetYear}`;
      
      const response = await axios.delete(url);
      
      if (response.data.success) {
        const totalDeleted = response.data.deletedCount || 0;
        const finalCount = response.data.finalRecords || 0;
        const draftCount = response.data.draftRecords || 0;
        
        if (totalDeleted === 0) {
          message.info({
            content: 'ℹ️ No budget data found to delete. The budget is already empty.',
            duration: 5
          });
        } else {
          message.success({
            content: `✅ Successfully deleted ${totalDeleted} records for ${effectiveSalesRep} (${finalCount} final, ${draftCount} draft)`,
            duration: 5
          });
        }
        
        await fetchHtmlTableData();
      } else {
        message.error(response.data.error || 'Failed to delete budget');
      }
    } catch (error) {
      console.error('❌ Error deleting budget:', error);
      message.error({
        content: 'Failed to delete budget: ' + (error.response?.data?.error || error.message),
        duration: 5
      });
    }
  };

  // Delete divisional budget handler
  const handleDeleteDivisionalBudget = async () => {
    
    if (!selectedDivision || !divisionalHtmlFilters.actualYear) {
      message.warning('Please select Division and Year first');
      return;
    }
    
    const budgetYear = divisionalHtmlBudgetYear ?? (parseInt(divisionalHtmlFilters.actualYear) + 1);
    
    const confirmMessage = `⚠️ DELETE DIVISIONAL BUDGET DATA\n\nAre you sure you want to delete ALL divisional budget data for:\n\n` +
      `Division: ${selectedDivision}\n` +
      `Budget Year: ${budgetYear}\n\n` +
      `⚠️ THIS ACTION CANNOT BE UNDONE!\n` +
      `(Data will be archived before deletion)\n\n` +
      `Click OK to delete, or Cancel to abort.`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    try {
      const url = `${API_BASE_URL}/api/aebf/delete-divisional-budget/${encodeURIComponent(selectedDivision)}/${budgetYear}`;
      
      const response = await axios.delete(url);
      
      if (response.data.success) {
        // Note: successResponse wraps data inside response.data.data
        const totalDeleted = response.data.data?.deletedCount || response.data.deletedCount || 0;
        
        if (totalDeleted === 0) {
          message.info({
            content: 'ℹ️ No divisional budget data found to delete. The budget is already empty.',
            duration: 5
          });
        } else {
          message.success({
            content: `✅ Successfully deleted ${totalDeleted} divisional budget records`,
            duration: 5
          });
        }
        
        await fetchDivisionalHtmlTableData();
      } else {
        message.error(response.data.error || 'Failed to delete divisional budget');
      }
    } catch (error) {
      console.error('Delete error:', error);
      message.error({
        content: 'Failed to delete divisional budget: ' + (error.response?.data?.error || error.message),
        duration: 5
      });
    }
  };
  
  const handleCustomRowCustomerChange = (rowId, customer, isNewCustomer = false) => {
    setHtmlCustomRows(prev => prev.map(row => {
      if (row.id === rowId) {
        const updatedRow = { ...row, customer, isNewCustomer };
        // If existing customer, try to auto-fill country
        if (!isNewCustomer && customer) {
          // Case-insensitive comparison to find matching customer
          const normalizedCustomer = customer.trim().toLowerCase();
          const existingRow = htmlTableData.find(r => 
            r.customer && r.customer.trim().toLowerCase() === normalizedCustomer
          );
          if (existingRow) {
            updatedRow.country = existingRow.country;
          } else {
            console.warn('⚠️ No matching customer found in table data');
          }
        } else if (isNewCustomer) {
          // Clear country if new customer
          updatedRow.country = null;
        }
        return updatedRow;
      }
      return row;
    }));
  };
  
  const handleCustomRowCountryChange = (rowId, country) => {
    setHtmlCustomRows(prev => prev.map(row => {
      if (row.id === rowId) {
        return { ...row, country };
      }
      return row;
    }));
  };
  
  const handleCustomRowProductGroupChange = (rowId, productGroup) => {
    setHtmlCustomRows(prev => prev.map(row => {
      if (row.id === rowId) {
        return { ...row, productGroup };
      }
      return row;
    }));
  };
  
  const handleCustomRowBudgetChange = (rowId, month, value) => {
    const key = `custom_${rowId}_${month}`;
    setHtmlBudgetData(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const excelFormatContent = (
    <>
      {/* Year Tabs */}
      {availableYears.length > 0 && (
        <Tabs
          activeKey={selectedYear?.toString()}
          onChange={handleYearChange}
          style={{ marginBottom: '16px', padding: '0 10px' }}
          items={availableYears.map(year => ({
            key: year.toString(),
            label: year.toString(),
          }))}
        />
      )}

      {/* Year Summary Cards */}
      {yearSummary && yearSummary.length > 0 && (
        <Row gutter={16} style={{ marginBottom: '16px', padding: '0 10px' }}>
          {yearSummary.map((item) => {
            const isCurrencyValue = item.values_type === 'AMOUNT' || item.values_type === 'Amount' || 
                                    item.values_type === 'MORM' || item.values_type === 'MoRM';
            return (
              <Col span={8} key={item.values_type}>
                <Card size="small">
                  <Statistic
                    title={item.values_type}
                    value={item.total_values}
                    precision={0}
                    prefix={isCurrencyValue ? <span style={{ color: '#3f8600', fontSize: '20px' }}><CurrencySymbol /></span> : null}
                    valueStyle={{ color: '#3f8600', fontSize: '20px' }}
                    suffix={<span style={{ fontSize: '12px', color: '#666' }}>({item.record_count} records)</span>}
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
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            Export Excel
          </Button>
          
          <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>
            Refresh
          </Button>
        </Space>

        {/* Global Search */}
        <Search
          placeholder="Search anything (customer, country, product, sales rep...)"
          allowClear
          enterButton="Search"
          style={{ width: 400 }}
          onSearch={handleSearch}
          onChange={handleSearchChange}
          value={globalSearch}
        />
      </Space>

      {/* Data Table */}
      <div style={{ width: '100%', overflowX: 'auto', padding: '0 10px' }}>
        <Table
          components={{
            header: { cell: ResizableTitle },
          }}
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} records`,
            pageSizeOptions: ['20', '50', '100', '200'],
          }}
          onChange={handleTableChange}
          scroll={{ y: 500 }}
          size="small"
          bordered
        />
      </div>

      {/* Upload Modal - Two Steps */}
      <Modal
        title={
          <Space>
            <FileExcelOutlined style={{ color: '#1890ff' }} />
            <span>{uploadStep === 1 ? 'Upload Budget Configuration' : 'Select Years & Months'}</span>
          </Space>
        }
        open={uploadModalVisible}
        onOk={uploadStep === 1 ? handleNextStep : handleTransformLoad}
        onCancel={() => {
          setUploadModalVisible(false);
          setSelectedFile(null);
          setUploadedBy('');
          setUploadStep(1);
          setFileYearMonths([]);
          setSelectedYearMonths([]);
          setSelectiveMode('all');
        }}
        okText={uploadStep === 1 ? (selectiveMode === 'all' ? 'Upload Now' : 'Next') : 'Transform & Load'}
        cancelText={uploadStep === 1 ? 'Cancel' : 'Back'}
        confirmLoading={uploading || analyzingFile}
        width={uploadStep === 1 ? 600 : 700}
        maskClosable={false}
        footer={uploadStep === 1 ? undefined : [
          <Button key="back" onClick={() => setUploadStep(1)}>
            Back
          </Button>,
          <Button key="cancel" onClick={() => {
            setUploadModalVisible(false);
            setSelectedFile(null);
            setUploadedBy('');
            setUploadStep(1);
          }}>
            Cancel
          </Button>,
          <Button 
            key="upload" 
            type="primary" 
            loading={uploading}
            onClick={handleTransformLoad}
            disabled={selectiveMode === 'selective' && selectedYearMonths.length === 0}
          >
            Transform & Load ({selectedYearMonths.length} periods)
          </Button>
        ]}
      >
        {uploadStep === 1 ? (
          // Step 1: Basic Configuration
          <Spin spinning={analyzingFile} tip="Analyzing file...">
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              {/* Show progress bar during upload in ALL mode */}
              {uploading && (
                <div style={{ marginBottom: '16px', padding: '16px', background: '#e6f7ff', borderRadius: '8px', border: '1px solid #91d5ff' }}>
                  <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '500', fontSize: '14px' }}>
                      <FileExcelOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
                      Uploading and processing budget data...
                    </span>
                    <span style={{ color: '#1890ff', fontWeight: '600', fontSize: '16px' }}>
                      {Math.round(uploadProgress)}%
                    </span>
                  </div>
                  <Progress 
                    percent={uploadProgress} 
                    status={uploadProgress >= 90 && uploadProgress < 100 ? 'active' : 'normal'}
                    strokeColor={{
                      '0%': '#108ee9',
                      '100%': '#87d068',
                    }}
                    showInfo={false}
                  />
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                    {uploadProgress < 90 
                      ? 'Processing file and uploading to database...' 
                      : uploadProgress < 100
                      ? 'Finalizing upload...'
                      : 'Upload complete!'}
                  </div>
                </div>
              )}
              <div style={{ opacity: uploading ? 0.5 : 1, pointerEvents: uploading ? 'none' : 'auto' }}>
                <p><strong>Selected File:</strong> {selectedFile?.name}</p>
                <p><strong>Division:</strong> {selectedDivision}</p>
              </div>

              <div style={{ opacity: uploading ? 0.5 : 1, pointerEvents: uploading ? 'none' : 'auto' }}>
                <label style={{ display: 'block', marginBottom: '8px' }}>
                  <strong>Data Selection:</strong>
                </label>
                <Radio.Group value={selectiveMode} onChange={(e) => setSelectiveMode(e.target.value)}>
                  <Space direction="vertical">
                    <Radio value="all">
                      <strong>Upload All Data</strong> - Upload all years and months from the file
                    </Radio>
                    <Radio value="selective">
                      <strong>Select Specific Periods</strong> - Choose which years/months to upload
                      <Tag color="blue" style={{ marginLeft: '8px' }}>Recommended</Tag>
                    </Radio>
                  </Space>
                </Radio.Group>
              </div>

              <div style={{ opacity: uploading ? 0.5 : 1, pointerEvents: uploading ? 'none' : 'auto' }}>
                <label style={{ display: 'block', marginBottom: '8px' }}>
                  <strong>Upload Mode:</strong>
                </label>
                <Radio.Group value={uploadMode} onChange={(e) => setUploadMode(e.target.value)}>
                  <Space direction="vertical">
                    <Radio value="upsert">
                      <strong>UPSERT</strong> - Update overlapping periods, keep non-overlapping data
                    </Radio>
                    <Radio value="replace">
                      <strong>REPLACE</strong> - Delete all existing budget data for selected year
                      <Tag color="orange" style={{ marginLeft: '8px' }}>Default</Tag>
                    </Radio>
                  </Space>
                </Radio.Group>
              </div>

              <div style={{ opacity: uploading ? 0.5 : 1, pointerEvents: uploading ? 'none' : 'auto' }}>
                <label style={{ display: 'block', marginBottom: '8px' }}>
                  <strong>Uploaded By:</strong> <span style={{ color: 'red' }}>*</span>
                </label>
                <Input
                  placeholder="Enter your name"
                  value={uploadedBy}
                  onChange={(e) => setUploadedBy(e.target.value)}
                  maxLength={100}
                />
              </div>

              {uploadMode === 'replace' && (
                <div style={{ padding: '12px', backgroundColor: '#fff2e8', borderLeft: '3px solid #fa8c16' }}>
                  <Space>
                    <WarningOutlined style={{ color: '#fa8c16' }} />
                    <div>
                      <strong>Warning:</strong> REPLACE mode will delete ALL existing {selectedDivision} Budget data 
                      for the selected year before uploading. A backup will be created automatically.
                    </div>
                  </Space>
                </div>
              )}
            </Space>
          </Spin>
        ) : (
          // Step 2: Year/Month Selection
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {uploading && (
              <div style={{ marginBottom: '16px', padding: '16px', background: '#e6f7ff', borderRadius: '8px', border: '1px solid #91d5ff' }}>
                <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '500', fontSize: '14px' }}>
                    <FileExcelOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
                    Uploading and processing budget data...
                  </span>
                  <span style={{ color: '#1890ff', fontWeight: '600', fontSize: '16px' }}>
                    {Math.round(uploadProgress)}%
                  </span>
                </div>
                <Progress 
                  percent={uploadProgress} 
                  status={uploadProgress >= 90 && uploadProgress < 100 ? 'active' : 'normal'}
                  strokeColor={{
                    '0%': '#108ee9',
                    '100%': '#87d068',
                  }}
                  showInfo={false}
                />
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                  {uploadProgress < 90 
                    ? 'Processing file and uploading to database...' 
                    : uploadProgress < 100
                    ? 'Finalizing upload...'
                    : 'Upload complete!'}
                </div>
              </div>
            )}
            <Space direction="vertical" style={{ width: '100%', opacity: uploading ? 0.5 : 1, pointerEvents: uploading ? 'none' : 'auto' }} size="middle">
              <div style={{ marginBottom: '16px' }}>
                <p><strong>File contains the following periods:</strong></p>
                <p style={{ color: '#666', fontSize: '12px' }}>
                  Select which year/month combinations you want to upload
                </p>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <Space>
                  <Button size="small" onClick={handleSelectAll}>Select All</Button>
                  <Button size="small" onClick={handleDeselectAll}>Deselect All</Button>
                  <span style={{ marginLeft: '16px', color: '#666' }}>
                    {selectedYearMonths.length} of {fileYearMonths.length} periods selected
                  </span>
                </Space>
              </div>

              <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #d9d9d9', borderRadius: '4px', padding: '12px' }}>
                <Row gutter={[8, 8]}>
                  {fileYearMonths.map((ym) => {
                    const key = `${ym.year}-${ym.month}`;
                    const isSelected = selectedYearMonths.includes(key);
                    return (
                      <Col span={8} key={key}>
                        <div
                          onClick={() => handleYearMonthToggle(key)}
                          style={{
                            padding: '8px 12px',
                            border: `2px solid ${isSelected ? '#1890ff' : '#d9d9d9'}`,
                            borderRadius: '4px',
                            cursor: 'pointer',
                            backgroundColor: isSelected ? '#e6f7ff' : '#fff',
                            transition: 'all 0.3s'
                          }}
                        >
                          <Space>
                            {isSelected ? <CheckCircleOutlined style={{ color: '#1890ff' }} /> : <div style={{ width: '14px' }} />}
                            <div>
                              <div style={{ fontWeight: 'bold' }}>
                                {new Date(ym.year, ym.month - 1).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                              </div>
                              <div style={{ fontSize: '12px', color: '#666' }}>
                                {ym.count} records
                              </div>
                            </div>
                          </Space>
                        </div>
                      </Col>
                    );
                  })}
                </Row>
              </div>
            </Space>
          </Space>
        )}
      </Modal>

      {/* Result Modal */}
      <Modal
        title={<Space><CheckCircleOutlined style={{ color: '#52c41a' }} /> Upload Successful</Space>}
        open={resultModalVisible}
        onOk={() => setResultModalVisible(false)}
        onCancel={() => setResultModalVisible(false)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setResultModalVisible(false)}>
            OK
          </Button>
        ]}
      >
        {uploadResult && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <p><strong>Message:</strong> {uploadResult.message}</p>
            <p><strong>Mode:</strong> {uploadResult.mode?.toUpperCase()}</p>
            {uploadResult.output && (
              <div style={{ maxHeight: '200px', overflowY: 'auto', backgroundColor: '#f5f5f5', padding: '8px', borderRadius: '4px' }}>
                <pre style={{ margin: 0, fontSize: '12px' }}>{uploadResult.output}</pre>
              </div>
            )}
          </Space>
        )}
      </Modal>
    </>
  );

  const salesRepRecapContent = (
    <div style={{ padding: '10px', width: '100%', boxSizing: 'border-box' }}>
      <Card style={{ marginBottom: '12px' }} styles={{ body: { padding: '16px' } }}>
        <h4 style={{ marginBottom: '12px', marginTop: 0 }}>
          Sales Rep Budget Recap{selectedDivision ? ` - ${selectedDivision}` : ''}
        </h4>
        <p style={{ color: '#666', fontSize: '14px', marginBottom: 16 }}>
          View budget summaries by year and sales representative
        </p>
        
        <Row gutter={[16, 16]}>
          {/* Year Selection */}
          <Col xs={24} md={8}>
            <Card 
              size="small" 
              title="1. Select Budget Year"
              loading={recapYearsLoading}
              style={{ height: '100%' }}
            >
              {recapYears.length === 0 && !recapYearsLoading ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                  No budget years available
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {recapYears.map(year => (
                    <Button
                      key={year}
                      type={recapSelectedYear === year ? 'primary' : 'default'}
                      size="large"
                      block
                      onClick={() => handleRecapYearSelect(year)}
                      style={{
                        height: 'auto',
                        padding: '12px',
                        fontSize: '16px',
                        fontWeight: recapSelectedYear === year ? 600 : 400
                      }}
                    >
                      {year}
                    </Button>
                  ))}
                </div>
              )}
            </Card>
          </Col>
          
          {/* Sales Rep Selection */}
          <Col xs={24} md={8}>
            <Card 
              size="small" 
              title="2. Select Sales Representative"
              loading={recapSalesRepsLoading}
              style={{ height: '100%' }}
            >
              {!recapSelectedYear ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                  Please select a year first
                </div>
              ) : recapSalesReps.length === 0 && !recapSalesRepsLoading ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                  No sales reps with budget for {recapSelectedYear}
                </div>
              ) : (
                <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {recapSalesReps.map(salesRep => (
                    <Button
                      key={salesRep}
                      type={recapSelectedSalesRep === salesRep ? 'primary' : 'default'}
                      size="large"
                      block
                      onClick={() => handleRecapSalesRepSelect(salesRep)}
                      style={{
                        height: 'auto',
                        padding: '12px',
                        textAlign: 'left',
                        whiteSpace: 'normal',
                        wordBreak: 'break-word',
                        fontWeight: recapSelectedSalesRep === salesRep ? 600 : 400
                      }}
                    >
                      {salesRep}
                    </Button>
                  ))}
                </div>
              )}
            </Card>
          </Col>
          
          {/* Recap Display */}
          <Col xs={24} md={8}>
            <Card 
              size="small" 
              title="3. Budget Summary"
              loading={recapLoading}
              style={{ height: '100%' }}
            >
              {!recapSelectedSalesRep && !recapSelectedYear ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                  Please select a year
                </div>
              ) : recapData.length === 0 && !recapLoading ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                  No budget data available
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: '16px', padding: '12px', background: '#f0f0f0', borderRadius: '4px' }}>
                    <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px' }}>
                      {recapSelectedSalesRep === '__ALL__' ? 'All Sales Reps' : recapSelectedSalesRep || 'All Sales Reps'}
                    </div>
                    <div style={{ fontSize: '14px', color: '#666' }}>
                      Budget Year: {recapSelectedYear}
                    </div>
                  </div>
                  
                  {recapData.map(item => {
                    const color = 
                      item.values_type === 'Amount' ? '#52c41a' : 
                      item.values_type === 'KGS' ? '#1890ff' : '#fa8c16';
                    const isCurrencyValue = item.values_type === 'Amount' || item.values_type === 'AMOUNT' || 
                                           item.values_type === 'MoRM' || item.values_type === 'MORM';
                    
                    return (
                      <Card
                        key={item.values_type}
                        size="small"
                        style={{ marginBottom: '12px', borderColor: color }}
                      >
                        <Statistic
                          title={item.values_type}
                          value={item.total_values}
                          precision={0}
                          prefix={isCurrencyValue ? <span style={{ color: color, fontSize: '24px', fontWeight: 600 }}><CurrencySymbol /></span> : null}
                          valueStyle={{ color: color, fontSize: '24px', fontWeight: 600 }}
                          suffix={
                            <span style={{ fontSize: '12px', color: '#666' }}>
                              ({item.record_count} records)
                            </span>
                          }
                        />
                      </Card>
                    );
                  })}
                </div>
              )}
            </Card>
          </Col>
        </Row>
      </Card>
      
      {/* Product Group Breakdown Table */}
      {recapSelectedYear && (
        <Card style={{ marginBottom: '12px' }} styles={{ body: { padding: '16px' } }}>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div>
                <h2 style={{ margin: 0, marginBottom: '4px', fontSize: '20px', fontWeight: 600 }}>
                  Product Group Analysis - {selectedDivision}
                </h2>
                <div style={{ color: '#666', fontSize: '14px' }}>(<CurrencySymbol />)</div>
              </div>
              <div style={{ width: '250px' }}>
                <Select
                  placeholder="Select Sales Rep"
                  value={recapTableSalesRep}
                  onChange={handleRecapTableSalesRepChange}
                  style={{ width: '100%' }}
                  options={[
                    { value: '__ALL__', label: '🌐 All Sales Reps' },
                    ...recapSalesReps.map(rep => ({ value: rep, label: rep }))
                  ]}
                />
              </div>
            </div>
          </div>
          
          <Spin spinning={recapProductGroupsLoading}>
            {recapProductGroups.length === 0 && !recapProductGroupsLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                No product group data available
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ 
                  width: '100%', 
                  borderCollapse: 'collapse', 
                  fontSize: '13px',
                  border: '1px solid #ddd'
                }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '12px 8px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 600, minWidth: '180px', fontSize: '15px', backgroundColor: '#1677ff', color: '#fff' }}>
                        Product Groups Names
                      </th>
                      <th style={{ padding: '12px 8px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 600, minWidth: '140px', fontSize: '15px', backgroundColor: '#fff', color: '#000' }}>
                        {recapSelectedYear - 1}<br/>
                        FY<br/>
                        Actual
                      </th>
                      <th style={{ padding: '12px 8px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 600, minWidth: '140px', fontSize: '15px', backgroundColor: '#fff', color: '#000' }}>
                        {recapSelectedYear}<br/>
                        FY<br/>
                        Budget
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Separator row */}
                    <tr style={{ height: '1px', backgroundColor: '#ddd' }}>
                      <td colSpan={3} style={{ padding: 0, border: 'none' }}></td>
                    </tr>
                    
                    {recapProductGroups.map((pg, pgIndex) => {
                      // Budget data
                      const kgs = pg.KGS || 0;
                      const sales = pg.Amount || 0;
                      const morm = pg.MoRM || 0;
                      const slsPerKg = kgs > 0 ? sales / kgs : 0;
                      const rmPerKg = pg.RM || 0;
                      const mormPerKg = kgs > 0 ? morm / kgs : 0;
                      const mormPct = sales > 0 ? (morm / sales) * 100 : 0;
                      
                      // Actual data
                      const actualKgs = pg.actualKGS || 0;
                      const actualSales = pg.actualAmount || 0;
                      const actualMorm = pg.actualMoRM || 0;
                      const actualSlsPerKg = actualKgs > 0 ? actualSales / actualKgs : 0;
                      const actualMormPerKg = actualKgs > 0 ? actualMorm / actualKgs : 0;
                      const actualMormPct = actualSales > 0 ? (actualMorm / actualSales) * 100 : 0;
                      
                      // Calculate total sales for % calculation
                      const totalSales = recapProductGroups.reduce((sum, p) => sum + (p.Amount || 0), 0);
                      const totalActualSales = recapProductGroups.reduce((sum, p) => sum + (p.actualAmount || 0), 0);
                      const salesPct = totalSales > 0 ? (sales / totalSales) * 100 : 0;
                      const actualSalesPct = totalActualSales > 0 ? (actualSales / totalActualSales) * 100 : 0;
                      
                      return (
                        <React.Fragment key={`pg-${pgIndex}`}>
                          {/* Product Group Header Row */}
                          <tr>
                            <td style={{ 
                              padding: '10px 12px', 
                              border: '1px solid #ddd', 
                              fontWeight: 700,
                              color: '#0d47a1',
                              fontSize: '13px'
                            }}>
                              {pg.name}
                            </td>
                            <td style={{ 
                              padding: '8px', 
                              border: '1px solid #ddd', 
                              textAlign: 'center',
                              fontWeight: 600,
                              fontSize: '13px',
                              color: '#000'
                            }}>
                              {actualSalesPct.toFixed(2)}% of Sls
                            </td>
                            <td style={{ 
                              padding: '8px', 
                              border: '1px solid #ddd', 
                              textAlign: 'center',
                              fontWeight: 600,
                              fontSize: '13px',
                              color: '#000'
                            }}>
                              {salesPct.toFixed(2)}% of Sls
                            </td>
                          </tr>
                          
                          {/* KGS */}
                          <tr style={{ backgroundColor: pgIndex % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>
                              KGS
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center', minWidth: '120px' }}>
                              {actualKgs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center', minWidth: '120px' }}>
                              {kgs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </td>
                          </tr>
                          
                          {/* SALES */}
                          <tr style={{ backgroundColor: pgIndex % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>
                              SALES
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                              {actualSales.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                              {sales.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </td>
                          </tr>
                          
                          {/* MORM */}
                          <tr style={{ backgroundColor: pgIndex % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>
                              MORM
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                              {actualMorm.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                              {morm.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </td>
                          </tr>
                          
                          {/* SLS/KG */}
                          <tr style={{ backgroundColor: pgIndex % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>
                              SLS/KG
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                              {actualSlsPerKg.toFixed(2)}
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                              {slsPerKg.toFixed(2)}
                            </td>
                          </tr>
                          
                          {/* RM/KG */}
                          <tr style={{ backgroundColor: pgIndex % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>
                              RM/KG
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                              {(actualSlsPerKg - actualMormPerKg).toFixed(2)}
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                              {rmPerKg.toFixed(2)}
                            </td>
                          </tr>
                          
                          {/* MORM/KG */}
                          <tr style={{ backgroundColor: pgIndex % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>
                              MORM/KG
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                              {actualMormPerKg.toFixed(2)}
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                              {mormPerKg.toFixed(2)}
                            </td>
                          </tr>
                          
                          {/* MORM % */}
                          <tr style={{ backgroundColor: pgIndex % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>
                              MORM %
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                              {actualMormPct.toFixed(1)}%
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                              {mormPct.toFixed(1)}%
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                    
                    {/* Total Section */}
                    {(() => {
                      // Calculate budget totals
                      const totalKgs = recapProductGroups.reduce((sum, pg) => sum + (pg.KGS || 0), 0);
                      const totalSales = recapProductGroups.reduce((sum, pg) => sum + (pg.Amount || 0), 0);
                      const totalMorm = recapProductGroups.reduce((sum, pg) => sum + (pg.MoRM || 0), 0);
                      const totalSlsPerKg = totalKgs > 0 ? totalSales / totalKgs : 0;
                      const totalRmPerKg = totalKgs > 0 ? (totalSales - totalMorm) / totalKgs : 0;
                      const totalMormPerKg = totalKgs > 0 ? totalMorm / totalKgs : 0;
                      const totalMormPct = totalSales > 0 ? (totalMorm / totalSales) * 100 : 0;
                      
                      // Calculate actual totals
                      const totalActualKgs = recapProductGroups.reduce((sum, pg) => sum + (pg.actualKGS || 0), 0);
                      const totalActualSales = recapProductGroups.reduce((sum, pg) => sum + (pg.actualAmount || 0), 0);
                      const totalActualMorm = recapProductGroups.reduce((sum, pg) => sum + (pg.actualMoRM || 0), 0);
                      const totalActualSlsPerKg = totalActualKgs > 0 ? totalActualSales / totalActualKgs : 0;
                      const totalActualRmPerKg = totalActualKgs > 0 ? (totalActualSales - totalActualMorm) / totalActualKgs : 0;
                      const totalActualMormPerKg = totalActualKgs > 0 ? totalActualMorm / totalActualKgs : 0;
                      const totalActualMormPct = totalActualSales > 0 ? (totalActualMorm / totalActualSales) * 100 : 0;
                      
                      return (
                        <React.Fragment key="total-section">
                          {/* Total Header */}
                          <tr style={{ backgroundColor: '#f0f0f0' }}>
                            <td style={{ 
                              padding: '10px 12px', 
                              border: '1px solid #ddd', 
                              fontWeight: 700,
                              color: '#000',
                              fontSize: '14px'
                            }}>
                              Total
                            </td>
                            <td style={{ 
                              padding: '8px', 
                              border: '1px solid #ddd', 
                              textAlign: 'center',
                              fontWeight: 600,
                              fontSize: '13px',
                              color: '#000',
                            }}>
                              {/* Empty for Total header */}
                            </td>
                            <td style={{ 
                              padding: '8px', 
                              border: '1px solid #ddd', 
                              textAlign: 'center',
                              fontWeight: 600,
                              fontSize: '13px',
                              color: '#000'
                            }}>
                              {/* Empty for Total header */}
                            </td>
                          </tr>
                          
                          {/* Total KGS */}
                          <tr style={{ backgroundColor: '#fff' }}>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>
                              KGS
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 'bold',  }}>
                              {totalActualKgs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 'bold' }}>
                              {totalKgs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </td>
                          </tr>
                          
                          {/* Total SALES */}
                          <tr style={{ backgroundColor: '#fff' }}>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>
                              SALES
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 'bold',  }}>
                              {totalActualSales.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 'bold' }}>
                              {totalSales.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </td>
                          </tr>
                          
                          {/* Total MORM */}
                          <tr style={{ backgroundColor: '#fff' }}>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>
                              MORM
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 'bold',  }}>
                              {totalActualMorm.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 'bold' }}>
                              {totalMorm.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </td>
                          </tr>
                          
                          {/* Total SLS/KG */}
                          <tr style={{ backgroundColor: '#fff' }}>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>
                              SLS/KG
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 'bold',  }}>
                              {totalActualSlsPerKg.toFixed(2)}
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 'bold' }}>
                              {totalSlsPerKg.toFixed(2)}
                            </td>
                          </tr>
                          
                          {/* Total RM/KG */}
                          <tr style={{ backgroundColor: '#fff' }}>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>
                              RM/KG
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 'bold',  }}>
                              {totalActualRmPerKg.toFixed(2)}
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 'bold' }}>
                              {totalRmPerKg.toFixed(2)}
                            </td>
                          </tr>
                          
                          {/* Total MORM/KG */}
                          <tr style={{ backgroundColor: '#fff' }}>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>
                              MORM/KG
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 'bold',  }}>
                              {totalActualMormPerKg.toFixed(2)}
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 'bold' }}>
                              {totalMormPerKg.toFixed(2)}
                            </td>
                          </tr>
                          
                          {/* Total MORM % */}
                          <tr style={{ backgroundColor: '#fff' }}>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>
                              MORM %
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 'bold',  }}>
                              {totalActualMormPct.toFixed(1)}%
                            </td>
                            <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 'bold' }}>
                              {totalMormPct.toFixed(1)}%
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })()}
                    
                    {/* Material Categories Section */}
                    {(() => {
                      // Group by Material
                      const materialGroups = {};
                      recapProductGroups.forEach(pg => {
                        const material = pg.Material || 'Unknown';
                        if (!materialGroups[material]) {
                          materialGroups[material] = [];
                        }
                        materialGroups[material].push(pg);
                      });
                      
                      return Object.entries(materialGroups).map(([material, pgs], matIndex) => {
                        // Calculate budget totals for this material
                        const totalKgs = pgs.reduce((sum, pg) => sum + (pg.KGS || 0), 0);
                        const totalSales = pgs.reduce((sum, pg) => sum + (pg.Amount || 0), 0);
                        const totalMorm = pgs.reduce((sum, pg) => sum + (pg.MoRM || 0), 0);
                        const avgSlsPerKg = totalKgs > 0 ? totalSales / totalKgs : 0;
                        const avgRmPerKg = pgs.reduce((sum, pg) => sum + (pg.RM || 0), 0) / pgs.length;
                        const avgMormPerKg = totalKgs > 0 ? totalMorm / totalKgs : 0;
                        const mormPct = totalSales > 0 ? (totalMorm / totalSales) * 100 : 0;
                        
                        // Calculate actual totals for this material
                        const totalActualKgs = pgs.reduce((sum, pg) => sum + (pg.actualKGS || 0), 0);
                        const totalActualSales = pgs.reduce((sum, pg) => sum + (pg.actualAmount || 0), 0);
                        const totalActualMorm = pgs.reduce((sum, pg) => sum + (pg.actualMoRM || 0), 0);
                        const avgActualSlsPerKg = totalActualKgs > 0 ? totalActualSales / totalActualKgs : 0;
                        const avgActualMormPerKg = totalActualKgs > 0 ? totalActualMorm / totalActualKgs : 0;
                        const actualMormPct = totalActualSales > 0 ? (totalActualMorm / totalActualSales) * 100 : 0;
                        
                        const grandTotalSales = recapProductGroups.reduce((sum, p) => sum + (p.Amount || 0), 0);
                        const grandTotalActualSales = recapProductGroups.reduce((sum, p) => sum + (p.actualAmount || 0), 0);
                        const salesPct = grandTotalSales > 0 ? (totalSales / grandTotalSales) * 100 : 0;
                        const actualSalesPct = grandTotalActualSales > 0 ? (totalActualSales / grandTotalActualSales) * 100 : 0;
                        
                        if (material === 'Unknown' || material === '' || material === '-') return null;
                        
                        return (
                          <React.Fragment key={`material-${matIndex}`}>
                            {/* Material Header */}
                            <tr style={{ backgroundColor: '#fff3cd' }}>
                              <td style={{ 
                                padding: '10px 12px', 
                                border: '1px solid #ddd', 
                                fontWeight: 700,
                                color: '#856404',
                                fontSize: '13px'
                              }}>
                                {material}
                              </td>
                              <td style={{ 
                                padding: '8px', 
                                border: '1px solid #ddd', 
                                textAlign: 'center',
                                fontWeight: 600,
                                fontSize: '13px',
                                color: '#000',
                              }}>
                                {actualSalesPct.toFixed(2)}% of Sls
                              </td>
                              <td style={{ 
                                padding: '8px', 
                                border: '1px solid #ddd', 
                                textAlign: 'center',
                                fontWeight: 600,
                                fontSize: '13px',
                                color: '#000'
                              }}>
                                {salesPct.toFixed(2)}% of Sls
                              </td>
                            </tr>
                            
                            {/* Material Metrics */}
                            <tr style={{ backgroundColor: '#fff' }}>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>KGS</td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center',  }}>
                                {totalActualKgs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                                {totalKgs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </td>
                            </tr>
                            <tr style={{ backgroundColor: '#f9f9f9' }}>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>SALES</td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center',  }}>
                                {totalActualSales.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                                {totalSales.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </td>
                            </tr>
                            <tr style={{ backgroundColor: '#fff' }}>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>MORM</td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center',  }}>
                                {totalActualMorm.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                                {totalMorm.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </td>
                            </tr>
                            <tr style={{ backgroundColor: '#f9f9f9' }}>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>SLS/KG</td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center',  }}>
                                {avgActualSlsPerKg.toFixed(2)}
                              </td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                                {avgSlsPerKg.toFixed(2)}
                              </td>
                            </tr>
                            <tr style={{ backgroundColor: '#fff' }}>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>RM/KG</td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center',  }}>
                                {(avgActualSlsPerKg - avgActualMormPerKg).toFixed(2)}
                              </td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                                {avgRmPerKg.toFixed(2)}
                              </td>
                            </tr>
                            <tr style={{ backgroundColor: '#f9f9f9' }}>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>MORM/KG</td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center',  }}>
                                {avgActualMormPerKg.toFixed(2)}
                              </td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                                {avgMormPerKg.toFixed(2)}
                              </td>
                            </tr>
                            <tr style={{ backgroundColor: '#fff' }}>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>MORM %</td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center',  }}>
                                {actualMormPct.toFixed(1)}%
                              </td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                                {mormPct.toFixed(1)}%
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      }).filter(Boolean);
                    })()}
                    
                    {/* Process Categories Section */}
                    {(() => {
                      // Group by Process
                      const processGroups = {};
                      recapProductGroups.forEach(pg => {
                        const process = pg.Process || 'Unknown';
                        if (!processGroups[process]) {
                          processGroups[process] = [];
                        }
                        processGroups[process].push(pg);
                      });
                      
                      return Object.entries(processGroups).map(([process, pgs], procIndex) => {
                        // Calculate budget totals for this process
                        const totalKgs = pgs.reduce((sum, pg) => sum + (pg.KGS || 0), 0);
                        const totalSales = pgs.reduce((sum, pg) => sum + (pg.Amount || 0), 0);
                        const totalMorm = pgs.reduce((sum, pg) => sum + (pg.MoRM || 0), 0);
                        const avgSlsPerKg = totalKgs > 0 ? totalSales / totalKgs : 0;
                        const avgRmPerKg = pgs.reduce((sum, pg) => sum + (pg.RM || 0), 0) / pgs.length;
                        const avgMormPerKg = totalKgs > 0 ? totalMorm / totalKgs : 0;
                        const mormPct = totalSales > 0 ? (totalMorm / totalSales) * 100 : 0;
                        
                        // Calculate actual totals for this process
                        const totalActualKgs = pgs.reduce((sum, pg) => sum + (pg.actualKGS || 0), 0);
                        const totalActualSales = pgs.reduce((sum, pg) => sum + (pg.actualAmount || 0), 0);
                        const totalActualMorm = pgs.reduce((sum, pg) => sum + (pg.actualMoRM || 0), 0);
                        const avgActualSlsPerKg = totalActualKgs > 0 ? totalActualSales / totalActualKgs : 0;
                        const avgActualMormPerKg = totalActualKgs > 0 ? totalActualMorm / totalActualKgs : 0;
                        const actualMormPct = totalActualSales > 0 ? (totalActualMorm / totalActualSales) * 100 : 0;
                        
                        const grandTotalSales = recapProductGroups.reduce((sum, p) => sum + (p.Amount || 0), 0);
                        const grandTotalActualSales = recapProductGroups.reduce((sum, p) => sum + (p.actualAmount || 0), 0);
                        const salesPct = grandTotalSales > 0 ? (totalSales / grandTotalSales) * 100 : 0;
                        const actualSalesPct = grandTotalActualSales > 0 ? (totalActualSales / grandTotalActualSales) * 100 : 0;
                        
                        if (process === 'Unknown' || process === '' || process === '-') return null;
                        
                        return (
                          <React.Fragment key={`process-${procIndex}`}>
                            {/* Process Header */}
                            <tr style={{ backgroundColor: '#d1ecf1' }}>
                              <td style={{ 
                                padding: '10px 12px', 
                                border: '1px solid #ddd', 
                                fontWeight: 700,
                                color: '#0c5460',
                                fontSize: '13px'
                              }}>
                                {process}
                              </td>
                              <td style={{ 
                                padding: '8px', 
                                border: '1px solid #ddd', 
                                textAlign: 'center',
                                fontWeight: 600,
                                fontSize: '13px',
                                color: '#000',
                              }}>
                                {actualSalesPct.toFixed(2)}% of Sls
                              </td>
                              <td style={{ 
                                padding: '8px', 
                                border: '1px solid #ddd', 
                                textAlign: 'center',
                                fontWeight: 600,
                                fontSize: '13px',
                                color: '#000'
                              }}>
                                {salesPct.toFixed(2)}% of Sls
                              </td>
                            </tr>
                            
                            {/* Process Metrics */}
                            <tr style={{ backgroundColor: '#fff' }}>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>KGS</td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center',  }}>
                                {totalActualKgs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                                {totalKgs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </td>
                            </tr>
                            <tr style={{ backgroundColor: '#f9f9f9' }}>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>SALES</td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center',  }}>
                                {totalActualSales.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                                {totalSales.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </td>
                            </tr>
                            <tr style={{ backgroundColor: '#fff' }}>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>MORM</td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center',  }}>
                                {totalActualMorm.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                                {totalMorm.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </td>
                            </tr>
                            <tr style={{ backgroundColor: '#f9f9f9' }}>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>SLS/KG</td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center',  }}>
                                {avgActualSlsPerKg.toFixed(2)}
                              </td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                                {avgSlsPerKg.toFixed(2)}
                              </td>
                            </tr>
                            <tr style={{ backgroundColor: '#fff' }}>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>RM/KG</td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center',  }}>
                                {(avgActualSlsPerKg - avgActualMormPerKg).toFixed(2)}
                              </td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                                {avgRmPerKg.toFixed(2)}
                              </td>
                            </tr>
                            <tr style={{ backgroundColor: '#f9f9f9' }}>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>MORM/KG</td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center',  }}>
                                {avgActualMormPerKg.toFixed(2)}
                              </td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                                {avgMormPerKg.toFixed(2)}
                              </td>
                            </tr>
                            <tr style={{ backgroundColor: '#fff' }}>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', fontWeight: 500, color: '#333', fontSize: '13px' }}>MORM %</td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center',  }}>
                                {actualMormPct.toFixed(1)}%
                              </td>
                              <td style={{ padding: '6px 12px', border: '1px solid #ddd', textAlign: 'center' }}>
                                {mormPct.toFixed(1)}%
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      }).filter(Boolean);
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </Spin>
        </Card>
      )}
    </div>
  );

  // Divisional HTML Budget Content
  const divisionalHtmlFormatContent = (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      {/* Compact Header: Filters + Import + Actions in one row */}
      <div style={{ marginBottom: '8px', padding: '12px 16px', background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
        <Spin spinning={divisionalHtmlFiltersLoading}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
            {/* Filters */}
            <div style={{ flex: '1', minWidth: '150px', maxWidth: '150px' }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '12px' }}>Actual Year</label>
              <Select
                placeholder="Select year"
                value={divisionalHtmlFilters.actualYear}
                onChange={handleDivisionalHtmlActualYearChange}
                style={{ width: '100%' }}
                size="middle"
                showSearch
                optionFilterProp="label"
                allowClear
                options={divisionalHtmlActualYears.map((year) => ({ label: year?.toString(), value: year }))}
                disabled={!selectedDivision || divisionalHtmlActualYears.length === 0}
              />
            </div>
            <div style={{ flex: '1', minWidth: '150px', maxWidth: '150px' }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '12px' }}>Budget Year</label>
              <Select
                placeholder="Type or select year"
                value={divisionalHtmlBudgetYear}
                onChange={(value) => {
                  // Allow manual year entry - validate it's a number between 2020-2099
                  const year = parseInt(value);
                  if (!isNaN(year) && year >= 2020 && year <= 2099) {
                    setDivisionalHtmlBudgetYear(year);
                  }
                }}
                onSearch={(value) => {
                  // Allow typing numbers directly
                  const year = parseInt(value);
                  if (!isNaN(year) && year >= 2020 && year <= 2099) {
                    setDivisionalHtmlBudgetYear(year);
                  }
                }}
                style={{ width: '100%' }}
                size="middle"
                showSearch
                optionFilterProp="label"
                allowClear
                options={divisionalHtmlBudgetYears.map((year) => ({ label: year?.toString(), value: year }))}
                disabled={!selectedDivision}
              />
            </div>
            
            {/* Spacer */}
            <div style={{ flex: '1' }} />
            
            {/* Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <Upload
                accept=".html"
                showUploadList={false}
                beforeUpload={(file) => { handleImportDivisionalFilledHtml(file); return false; }}
              >
                <Button type="default" icon={<UploadOutlined />} size="middle">Import HTML</Button>
              </Upload>
              {divisionalHtmlFilters.actualYear && (
                <>
                  <Button 
                    icon={<DownloadOutlined />}
                    onClick={handleExportDivisionalHtmlForm}
                    disabled={divisionalHtmlTableData.length === 0}
                    size="middle"
                  >
                    Export HTML
                  </Button>
                  <Button 
                    icon={<FileExcelOutlined />}
                    onClick={handleExportDivisionalExcel}
                    disabled={Object.keys(divisionalHtmlBudgetData).length === 0}
                    size="middle"
                    style={{ color: '#217346', borderColor: '#217346' }}
                  >
                    Export Excel
                  </Button>
                  {Object.keys(divisionalHtmlBudgetData).length > 0 && (
                    <>
                      {/* Show Edit button when budget is approved */}
                      {divisionalBudgetStatus === 'approved' && (
                        <Button
                          type="default"
                          icon={<EditOutlined />}
                          onClick={() => setEditDivisionalConfirmVisible(true)}
                          disabled={isEditingDivisional}
                          loading={isEditingDivisional}
                          size="middle"
                          style={{ color: '#fa8c16', borderColor: '#fa8c16' }}
                        >
                          Edit Budget
                        </Button>
                      )}
                      {/* Show Submit Final button when budget is draft */}
                      {divisionalBudgetStatus === 'draft' && (
                        <Button
                          type="primary"
                          icon={<CheckCircleOutlined />}
                          onClick={() => setSubmitDivisionalConfirmVisible(true)}
                          disabled={isSubmittingDivisional}
                          loading={isSubmittingDivisional}
                          size="middle"
                          style={{ background: '#52c41a', borderColor: '#52c41a' }}
                        >
                          Submit Final
                        </Button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
          
          {/* Budget Status - compact inline */}
          {divisionalHtmlFilters.actualYear && Object.keys(divisionalHtmlBudgetData).length > 0 && (
            <div style={{ 
              marginTop: '10px', 
              padding: '6px 12px', 
              background: divisionalBudgetStatus === 'approved' ? '#e6f7ff' : (divisionalDraftStatus === 'saved' ? '#f6ffed' : divisionalDraftStatus === 'saving' ? '#fff7e6' : '#fff2f0'),
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px'
            }}>
              <span>
                {divisionalBudgetStatus === 'approved' && '🔒 Approved (locked)'}
                {divisionalBudgetStatus === 'draft' && divisionalDraftStatus === 'saving' && '💾 Saving...'}
                {divisionalBudgetStatus === 'draft' && divisionalDraftStatus === 'saved' && '✅ Draft saved'}
                {divisionalBudgetStatus === 'draft' && divisionalDraftStatus === 'error' && '⚠️ Save failed'}
              </span>
              {divisionalBudgetStatus === 'draft' && divisionalLastSaveTime && divisionalDraftStatus === 'saved' && (
                <span style={{ color: '#8c8c8c' }}>({new Date(divisionalLastSaveTime).toLocaleTimeString()})</span>
              )}
            </div>
          )}
        </Spin>
      </div>
      
      {/* Budget vs Actual Summary - 3-Card Layout */}
      {divisionalHtmlFilters.actualYear && divisionalHtmlTableData.length > 0 && (
        <div style={{ 
          padding: '12px 16px',
          background: '#f8f9fa',
          borderBottom: '1px solid #e8e8e8',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1890ff', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            📊 Budget vs Actual Summary
          </div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {/* Volume (MT) Card */}
            <div style={{ 
              flex: '1', 
              minWidth: '280px',
              background: '#fff', 
              borderRadius: '6px', 
              padding: '12px 16px', 
              border: '1px solid #e8e8e8',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#666', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                📦 Volume (MT)
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '24px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#999' }}>Act: </span>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: '#1890ff' }}>{formatMT(divisionalActualYearTotal)}</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#999' }}>Bud: </span>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: '#d4b106' }}>{formatMT(divisionalBudgetYearTotal)}</span>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <span style={{ 
                    fontSize: '14px', 
                    fontWeight: 700, 
                    color: divisionalActualYearTotal === 0 ? '#999' : ((divisionalBudgetYearTotal - divisionalActualYearTotal) >= 0 ? '#52c41a' : '#ff4d4f') 
                  }}>
                    {divisionalActualYearTotal === 0 ? 'N/A' : `${((divisionalBudgetYearTotal - divisionalActualYearTotal) / divisionalActualYearTotal * 100).toFixed(0)}%`}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Amount Card */}
            <div style={{ 
              flex: '1', 
              minWidth: '280px',
              background: '#fff', 
              borderRadius: '6px', 
              padding: '12px 16px', 
              border: '1px solid #e8e8e8',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#666', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CurrencySymbol /> Amount
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '24px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#999' }}>Act: </span>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: '#1890ff' }}>{formatAed(divisionalActualAmountYearTotal)}</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#999' }}>Bud: </span>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: '#d4b106' }}>{formatAed(divisionalAmountYearTotal)}</span>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <span style={{ 
                    fontSize: '14px', 
                    fontWeight: 700, 
                    color: divisionalActualAmountYearTotal === 0 ? '#999' : ((divisionalAmountYearTotal - divisionalActualAmountYearTotal) >= 0 ? '#52c41a' : '#ff4d4f') 
                  }}>
                    {divisionalActualAmountYearTotal === 0 ? 'N/A' : `${((divisionalAmountYearTotal - divisionalActualAmountYearTotal) / divisionalActualAmountYearTotal * 100).toFixed(0)}%`}
                  </span>
                </div>
              </div>
            </div>
            
            {/* MoRM Card */}
            <div style={{ 
              flex: '1', 
              minWidth: '280px',
              background: '#fff', 
              borderRadius: '6px', 
              padding: '12px 16px', 
              border: '1px solid #e8e8e8',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#666', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CurrencySymbol /> MoRM
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '24px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#999' }}>Act: </span>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: '#1890ff' }}>{formatAed(divisionalActualMormYearTotal)}</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#999' }}>Bud: </span>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: '#d4b106' }}>{formatAed(divisionalMormYearTotal)}</span>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <span style={{ 
                    fontSize: '14px', 
                    fontWeight: 700, 
                    color: divisionalActualMormYearTotal === 0 ? '#999' : ((divisionalMormYearTotal - divisionalActualMormYearTotal) >= 0 ? '#52c41a' : '#ff4d4f') 
                  }}>
                    {divisionalActualMormYearTotal === 0 ? 'N/A' : `${((divisionalMormYearTotal - divisionalActualMormYearTotal) / divisionalActualMormYearTotal * 100).toFixed(0)}%`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Divisional Budget Table */}
      {divisionalHtmlFilters.actualYear && (
        <Spin spinning={divisionalHtmlTableLoading} style={{ width: '100%', display: 'block' }}>
          <div style={{ width: '100%', height: 'calc(100vh - 180px)', overflowX: 'auto', overflowY: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'separate',
                    borderSpacing: 0,
                    fontSize: '12px',
                    tableLayout: 'fixed',
                  }}
                >
                  {/* Optimized column widths to use full table width */}
                  <colgroup>
                    <col style={{ width: '19%' }} />
                    <col style={{ width: '6.2%' }} />
                    <col style={{ width: '6.2%' }} />
                    <col style={{ width: '6.2%' }} />
                    <col style={{ width: '6.2%' }} />
                    <col style={{ width: '6.2%' }} />
                    <col style={{ width: '6.2%' }} />
                    <col style={{ width: '6.2%' }} />
                    <col style={{ width: '6.2%' }} />
                    <col style={{ width: '6.2%' }} />
                    <col style={{ width: '6.2%' }} />
                    <col style={{ width: '6.2%' }} />
                    <col style={{ width: '6.2%' }} />
                    <col style={{ width: '6.7%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th
                        colSpan={15}
                        style={{
                          position: 'sticky',
                          top: 0,
                          zIndex: 1002,
                          backgroundColor: '#fff',
                          padding: '12px 24px',
                          borderBottom: '1px solid #e8e8e8',
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}>
                          <Space size="large">
                            <span>
                              <span style={{ display: 'inline-block', width: 16, height: 16, backgroundColor: '#e6f4ff', border: '1px solid #99c8ff', marginRight: 8 }} />
                              Actual {divisionalHtmlFilters.actualYear} Volume (MT)
                            </span>
                            <span>
                              <span style={{ display: 'inline-block', width: 16, height: 16, backgroundColor: '#FFFFB8', border: '1px solid #d4b106', marginRight: 8 }} />
                              Budget {divisionalBudgetYearDerived} Volume (MT)
                            </span>
                          </Space>
                          <Button
                            type="primary"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={handleDeleteDivisionalBudget}
                            size="small"
                          >
                            Delete Divisional Budget
                          </Button>
                        </div>
                      </th>
                    </tr>
                    <tr style={{ position: 'sticky', top: 49, zIndex: 1001 }}>
                      <th
                        rowSpan={2}
                        style={{
                          backgroundColor: '#1677ff',
                          color: '#fff',
                          padding: '8px',
                          border: '1px solid #fff',
                          position: 'sticky',
                          left: 0,
                          zIndex: 1003,
                          width: '20%',
                          minWidth: 0,
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                          lineHeight: 1.3,
                        }}
                      >
                        Product Group
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
                            width: '5.5%',
                            minWidth: 0,
                          }}
                        >
                          {month}
                        </th>
                      ))}
                      <th
                        rowSpan={2}
                        style={{
                          backgroundColor: '#0958d9',
                          color: '#fff',
                          padding: '8px',
                          border: '1px solid #fff',
                          textAlign: 'center',
                          fontWeight: 700,
                          width: '8%',
                          minWidth: 0,
                        }}
                      >
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {divisionalHtmlTableData.map((row, idx) => (
                      <React.Fragment key={`${row.productGroup}-${idx}`}>
                        {/* Actual Row */}
                        <tr style={{ backgroundColor: '#e6f4ff' }}>
                          <td 
                            rowSpan={2}
                            style={{ 
                              padding: '8px',
                              border: '1px solid #ddd',
                              backgroundColor: '#fff',
                              position: 'sticky',
                              left: 0,
                              zIndex: 5,
                              fontWeight: 600,
                              whiteSpace: 'normal',
                              wordBreak: 'break-word',
                              lineHeight: 1.3,
                            }}
                          >
                            {row.productGroup}
                          </td>
                          {Array.from({ length: 12 }, (_, i) => {
                            const month = i + 1;
                            // monthlyActual[month] is an object with MT, AMOUNT, MORM
                            const monthData = row.monthlyActual?.[month];
                            const actualValue = monthData?.MT ?? monthData ?? 0;
                            return (
                              <td 
                                key={`actual-${month}`}
                                style={{ 
                                  padding: '6px 8px',
                                  border: '1px solid #ddd',
                                  backgroundColor: '#e6f4ff',
                                  textAlign: 'right',
                                  fontWeight: 500,
                                }}
                              >
                                {formatMT(actualValue)}
                              </td>
                            );
                          })}
                          {/* Total cell for actual row */}
                          <td 
                            style={{ 
                              padding: '6px 8px',
                              border: '1px solid #ddd',
                              backgroundColor: '#e6ffe6',
                              textAlign: 'right',
                              fontWeight: 700,
                            }}
                          >
                            {formatMT(divisionalProductGroupActualTotals[row.productGroup] || 0)}
                          </td>
                        </tr>
                        {/* Budget Row */}
                        <tr style={{ backgroundColor: '#FFFFB8' }}>
                          {Array.from({ length: 12 }, (_, i) => {
                            const month = i + 1;
                            const key = `${row.productGroup}|${month}`;
                            const budgetValue = divisionalHtmlBudgetData[key] || '';
                            return (
                              <td 
                                key={`budget-${month}`}
                                style={{ 
                                  padding: '2px',
                                  border: '1px solid #ddd',
                                  backgroundColor: '#FFFFB8',
                                  position: 'relative',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                  <Input
                                    value={budgetValue}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/[^0-9.,]/g, '');
                                      handleDivisionalBudgetInputChange(row.productGroup, month, val);
                                    }}
                                    onBlur={(e) => {
                                      const val = e.target.value;
                                      if (val) {
                                        const formatted = formatMT(val);
                                        handleDivisionalBudgetInputChange(row.productGroup, month, formatted);
                                      }
                                    }}
                                    placeholder="0"
                                    style={{ 
                                      flex: 1,
                                      textAlign: 'right',
                                      border: 'none',
                                      padding: '4px 6px',
                                      fontSize: '12px',
                                      fontWeight: 500,
                                      backgroundColor: 'transparent',
                                      boxShadow: 'none',
                                    }}
                                  />
                                  {budgetValue && month < 12 && (
                                    <Button
                                      type="text"
                                      size="small"
                                      icon={<CopyOutlined />}
                                      onClick={() => handleCopyDivisionalToRemainingMonths(row.productGroup, month, budgetValue)}
                                      title={`Copy ${budgetValue} to months ${month}-12`}
                                      style={{
                                        padding: '0 2px',
                                        height: '18px',
                                        width: '18px',
                                        minWidth: '18px',
                                        fontSize: '10px',
                                        color: '#1890ff',
                                        opacity: 0.6,
                                      }}
                                    />
                                  )}
                                </div>
                              </td>
                            );
                          })}
                          {/* Total cell for budget row */}
                          <td 
                            style={{ 
                              padding: '6px 8px',
                              border: '1px solid #ddd',
                              backgroundColor: '#FFFFB8',
                              textAlign: 'right',
                              fontWeight: 700,
                            }}
                          >
                            {formatMT(divisionalProductGroupBudgetTotals[row.productGroup] || 0)}
                          </td>
                        </tr>
                      </React.Fragment>
                    ))}
                    
                    {/* Services Charges Row - Special handling (Amount/MoRM only, no MT) */}
                    {servicesChargesData && (
                      <React.Fragment key="services-charges">
                        {/* Actual Row - Shows Amount */}
                        <tr style={{ backgroundColor: '#f0f5ff', borderTop: '2px solid #1890ff' }}>
                          <td 
                            rowSpan={2}
                            style={{ 
                              padding: '8px',
                              border: '1px solid #ddd',
                              backgroundColor: '#fff',
                              position: 'sticky',
                              left: 0,
                              zIndex: 5,
                              fontWeight: 600,
                              whiteSpace: 'normal',
                              wordBreak: 'break-word',
                              lineHeight: 1.3,
                              fontStyle: 'italic',
                            }}
                          >
                            Services Charges
                            <div style={{ fontSize: '10px', color: '#666', fontWeight: 400 }}>
                              (Amount only)
                            </div>
                          </td>
                          {Array.from({ length: 12 }, (_, i) => {
                            const month = i + 1;
                            const monthData = servicesChargesData.monthlyActual?.[month];
                            const actualAmount = monthData?.AMOUNT ?? 0;
                            return (
                              <td 
                                key={`sc-actual-${month}`}
                                style={{ 
                                  padding: '6px 8px',
                                  border: '1px solid #ddd',
                                  backgroundColor: '#f0f5ff',
                                  textAlign: 'right',
                                  fontWeight: 500,
                                  fontSize: '11px',
                                }}
                              >
                                {formatAed(actualAmount)}
                              </td>
                            );
                          })}
                          {/* Total cell for actual row */}
                          <td 
                            style={{ 
                              padding: '6px 8px',
                              border: '1px solid #ddd',
                              backgroundColor: '#d4f7d4',
                              textAlign: 'right',
                              fontWeight: 700,
                              fontSize: '11px',
                            }}
                          >
                            {formatAed(Object.values(servicesChargesData.monthlyActual || {}).reduce((sum, m) => sum + (m?.AMOUNT || 0), 0))}
                          </td>
                        </tr>
                        {/* Budget Row - User enters Amount in thousands (k) */}
                        <tr style={{ backgroundColor: '#fffbe6' }}>
                          {Array.from({ length: 12 }, (_, i) => {
                            const month = i + 1;
                            const key = `Services Charges|${month}|AMOUNT`;
                            const budgetValue = servicesChargesBudget[key] || '';
                            return (
                              <td 
                                key={`sc-budget-${month}`}
                                style={{ 
                                  padding: '2px',
                                  border: '1px solid #ddd',
                                  backgroundColor: '#fffbe6',
                                  textAlign: 'right',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2px' }}>
                                  <Input
                                    value={budgetValue}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/[^0-9.,]/g, '');
                                      setServicesChargesBudget(prev => ({
                                        ...prev,
                                        [key]: val,
                                      }));
                                      setDivisionalDraftStatus('unsaved');
                                    }}
                                    placeholder="0"
                                    style={{ 
                                      width: '60px',
                                      textAlign: 'right',
                                      border: 'none',
                                      padding: '4px 2px',
                                      fontSize: '11px',
                                      fontWeight: 500,
                                      backgroundColor: 'transparent',
                                      boxShadow: 'none',
                                    }}
                                  />
                                  <span style={{ fontSize: '11px', fontWeight: 500, color: '#666' }}>k</span>
                                </div>
                              </td>
                            );
                          })}
                          {/* Total cell for budget row */}
                          <td 
                            style={{ 
                              padding: '6px 8px',
                              border: '1px solid #ddd',
                              backgroundColor: '#fffbe6',
                              textAlign: 'right',
                              fontWeight: 700,
                              fontSize: '11px',
                            }}
                          >
                            {(() => {
                              const totalInK = Array.from({ length: 12 }, (_, i) => {
                                const month = i + 1;
                                const key = `Services Charges|${month}|AMOUNT`;
                                return parseFloat((servicesChargesBudget[key] || '').toString().replace(/,/g, '')) || 0;
                              }).reduce((sum, val) => sum + val, 0);
                              // Display total in k format (value entered is already in k)
                              return formatAed(totalInK * 1000);
                            })()}
                          </td>
                        </tr>
                      </React.Fragment>
                    )}
                    
                    {divisionalHtmlTableData.length === 0 && !divisionalHtmlTableLoading && (
                      <tr>
                        <td colSpan={15} style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                          {divisionalHtmlFilters.actualYear 
                            ? 'No product group data found for selected year'
                            : 'Please select Actual Year to load data'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                  {/* Monthly Actual Totals Row */}
                  <tr style={{ backgroundColor: '#cce4ff' }}>
                    <td
                      style={{
                        padding: '8px',
                        border: '1px solid #ddd',
                        position: 'sticky',
                        left: 0,
                        zIndex: 6,
                        fontWeight: 700,
                        textAlign: 'left',
                        backgroundColor: '#cce4ff',
                      }}
                    >
                      Total Actual Volume (MT)
                    </td>
                    {Array.from({ length: 12 }, (_, i) => {
                      const month = i + 1;
                      return (
                        <td
                          key={`actual-total-${month}`}
                          style={{
                            padding: '6px 8px',
                            border: '1px solid #ddd',
                            backgroundColor: '#cce4ff',
                            textAlign: 'right',
                            fontWeight: 700,
                          }}
                        >
                          {formatMT(divisionalMonthlyActualTotals[month])}
                        </td>
                      );
                    })}
                    <td
                      style={{
                        padding: '6px 8px',
                        border: '1px solid #ddd',
                        backgroundColor: '#b3d9ff',
                        textAlign: 'right',
                        fontWeight: 700,
                        fontSize: '12px',
                      }}
                    >
                      {formatMT(divisionalActualYearTotal)}
                    </td>
                  </tr>
                  {/* Monthly Actual Amount Totals Row */}
                  <tr style={{ backgroundColor: '#d4edda' }}>
                    <td
                      style={{
                        padding: '8px',
                        border: '1px solid #ddd',
                        position: 'sticky',
                        left: 0,
                        zIndex: 6,
                        fontWeight: 700,
                        textAlign: 'left',
                        backgroundColor: '#d4edda',
                      }}
                    >
                      Total Actual Amount (<CurrencySymbol />)
                    </td>
                    {Array.from({ length: 12 }, (_, i) => {
                      const month = i + 1;
                      return (
                        <td
                          key={`actual-amount-total-${month}`}
                          style={{
                            padding: '6px 8px',
                            border: '1px solid #ddd',
                            backgroundColor: '#d4edda',
                            textAlign: 'right',
                            fontWeight: 700,
                          }}
                        >
                          {formatAed(divisionalMonthlyActualAmountTotals[month])}
                        </td>
                      );
                    })}
                    <td
                      style={{
                        padding: '6px 8px',
                        border: '1px solid #ddd',
                        backgroundColor: '#c3e6cb',
                        textAlign: 'right',
                        fontWeight: 700,
                        fontSize: '12px',
                      }}
                    >
                      {formatAed(divisionalActualAmountYearTotal)}
                    </td>
                  </tr>
                  {/* Monthly Actual MoRM Totals Row */}
                  <tr style={{ backgroundColor: '#ffe0b2' }}>
                    <td
                      style={{
                        padding: '8px',
                        border: '1px solid #ddd',
                        position: 'sticky',
                        left: 0,
                        zIndex: 6,
                        fontWeight: 700,
                        textAlign: 'left',
                        backgroundColor: '#ffe0b2',
                      }}
                    >
                      Total Actual MoRM (<CurrencySymbol />)
                    </td>
                    {Array.from({ length: 12 }, (_, i) => {
                      const month = i + 1;
                      return (
                        <td
                          key={`actual-morm-total-${month}`}
                          style={{
                            padding: '6px 8px',
                            border: '1px solid #ddd',
                            backgroundColor: '#ffe0b2',
                            textAlign: 'right',
                            fontWeight: 700,
                            fontSize: '12px',
                          }}
                        >
                          {formatAed(divisionalMonthlyActualMormTotals[month])}
                        </td>
                      );
                    })}
                    <td
                      style={{
                        padding: '6px 8px',
                        border: '1px solid #ddd',
                        backgroundColor: '#ffb74d',
                        textAlign: 'right',
                        fontWeight: 700,
                        fontSize: '12px',
                      }}
                    >
                      {formatAed(divisionalActualMormYearTotal)}
                    </td>
                  </tr>
                  {/* Monthly Budget Totals Row */}
                  <tr style={{ backgroundColor: '#cce4ff' }}>
                    <td
                      style={{
                        padding: '8px',
                        border: '1px solid #ddd',
                        position: 'sticky',
                        left: 0,
                        zIndex: 6,
                        fontWeight: 700,
                        textAlign: 'left',
                        backgroundColor: '#cce4ff',
                      }}
                    >
                      Total Budget Volume (MT)
                    </td>
                    {Array.from({ length: 12 }, (_, i) => {
                      const month = i + 1;
                      return (
                        <td
                          key={`budget-total-${month}`}
                          style={{
                            padding: '6px 8px',
                            border: '1px solid #ddd',
                            backgroundColor: '#cce4ff',
                            textAlign: 'right',
                            fontWeight: 700,
                          }}
                        >
                          {formatMT(divisionalMonthlyBudgetTotals[month])}
                        </td>
                      );
                    })}
                    <td
                      style={{
                        padding: '6px 8px',
                        border: '1px solid #ddd',
                        backgroundColor: '#b3d9ff',
                        textAlign: 'right',
                        fontWeight: 700,
                        fontSize: '12px',
                      }}
                    >
                      {formatMT(divisionalBudgetYearTotal)}
                    </td>
                  </tr>
                  {/* Monthly Amount Totals Row */}
                  <tr style={{ backgroundColor: '#d4edda' }}>
                    <td
                      style={{
                        padding: '8px',
                        border: '1px solid #ddd',
                        position: 'sticky',
                        left: 0,
                        zIndex: 6,
                        fontWeight: 700,
                        textAlign: 'left',
                        backgroundColor: '#d4edda',
                      }}
                    >
                      Total Budget Amount (<CurrencySymbol />)
                    </td>
                    {Array.from({ length: 12 }, (_, i) => {
                      const month = i + 1;
                      return (
                        <td
                          key={`amount-total-${month}`}
                          style={{
                            padding: '6px 8px',
                            border: '1px solid #ddd',
                            backgroundColor: '#d4edda',
                            textAlign: 'right',
                            fontWeight: 700,
                            fontSize: '12px',
                          }}
                        >
                          {formatAed(divisionalMonthlyAmountTotals[month])}
                        </td>
                      );
                    })}
                    <td
                      style={{
                        padding: '6px 8px',
                        border: '1px solid #ddd',
                        backgroundColor: '#c3e6cb',
                        textAlign: 'right',
                        fontWeight: 700,
                        fontSize: '12px',
                      }}
                    >
                      {formatAed(divisionalAmountYearTotal)}
                    </td>
                  </tr>
                  {/* Monthly MoRM Totals Row */}
                  <tr style={{ backgroundColor: '#ffe0b2' }}>
                    <td
                      style={{
                        padding: '8px',
                        border: '1px solid #ddd',
                        position: 'sticky',
                        left: 0,
                        zIndex: 6,
                        fontWeight: 700,
                        textAlign: 'left',
                        backgroundColor: '#ffe0b2',
                      }}
                    >
                      Total Budget MoRM (<CurrencySymbol />)
                    </td>
                    {Array.from({ length: 12 }, (_, i) => {
                      const month = i + 1;
                      return (
                        <td
                          key={`morm-total-${month}`}
                          style={{
                            padding: '6px 8px',
                            border: '1px solid #ddd',
                            backgroundColor: '#ffe0b2',
                            textAlign: 'right',
                            fontWeight: 700,
                            fontSize: '12px',
                          }}
                        >
                          {formatAed(divisionalMonthlyMormTotals[month])}
                        </td>
                      );
                    })}
                    <td
                      style={{
                        padding: '6px 8px',
                        border: '1px solid #ddd',
                        backgroundColor: '#ffb74d',
                        textAlign: 'right',
                        fontWeight: 700,
                        fontSize: '12px',
                      }}
                    >
                      {formatAed(divisionalMormYearTotal)}
                    </td>
                  </tr>
                  </tfoot>
                </table>
              </div>
            </Spin>
      )}
    </div>
  );

  // Sales Rep HTML Budget Content (existing)
  const htmlFormatContent = (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      {/* Compact Header: Filters + Import + Actions in one row */}
      <div style={{ marginBottom: '8px', padding: '12px 16px', background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
        <Spin spinning={htmlFiltersLoading}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
            {/* Filters */}
            <div style={{ flex: '1', minWidth: '200px', maxWidth: '180px' }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '12px' }}>Actual Year</label>
              <Select
                placeholder="Select year"
                value={htmlFilters.actualYear}
                onChange={handleHtmlActualYearChange}
                style={{ width: '100%' }}
                size="middle"
                showSearch
                optionFilterProp="label"
                allowClear
                options={htmlActualYears.map((year) => ({ label: year?.toString(), value: year }))}
                disabled={!selectedDivision || htmlActualYears.length === 0}
              />
            </div>
            <div style={{ flex: '1', minWidth: '120px', maxWidth: '120px' }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '12px' }}>Budget Year</label>
              <Input
                value={budgetYearDerived ? budgetYearDerived.toString() : ''}
                placeholder="—"
                disabled
                size="middle"
                style={{ textAlign: 'center' }}
              />
            </div>
            <div style={{ flex: '2', minWidth: '200px', maxWidth: '280px' }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '12px' }}>Sales Rep</label>
              <Select
                placeholder="Select sales rep"
                value={htmlFilters.salesRep}
                onChange={handleHtmlSalesRepChange}
                style={{ width: '100%' }}
                size="middle"
                showSearch
                allowClear
                optionFilterProp="label"
                filterOption={(input, option) => (option?.label || '').toLowerCase().includes(input.toLowerCase())}
                options={htmlSalesRepOptions}
                disabled={!selectedDivision || htmlSalesRepOptions.length === 0}
              />
            </div>
            
            {/* Spacer */}
            <div style={{ flex: '1' }} />
            
            {/* Target Sales Rep Selector - only shown in All Sales Reps mode */}
            {isAllSalesReps && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                padding: '6px 12px', 
                background: '#e6f7ff', 
                borderRadius: '6px',
                border: '1px solid #91d5ff'
              }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#1890ff', whiteSpace: 'nowrap' }}>
                  🎯 Target Rep:
                </span>
                <Select
                  placeholder="Select target"
                  value={targetSalesRep}
                  onChange={setTargetSalesRep}
                  style={{ width: '180px' }}
                  size="small"
                  showSearch
                  allowClear
                  optionFilterProp="label"
                  filterOption={(input, option) => (option?.label || '').toLowerCase().includes(input.toLowerCase())}
                  options={htmlSalesRepOptions.filter(opt => opt.value !== '__ALL__')}
                />
                <span style={{ fontSize: '11px', color: '#8c8c8c' }}>
                  (for Add/Export)
                </span>
              </div>
            )}
            
            {/* Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <Upload
                accept=".html"
                showUploadList={false}
                beforeUpload={(file) => { handleImportFilledHtml(file); return false; }}
              >
                <Button type="default" icon={<UploadOutlined />} size="middle">Import HTML</Button>
              </Upload>
              {htmlFilters.actualYear && htmlFilters.salesRep && (
                <>
                  <Button 
                    icon={<DownloadOutlined />}
                    onClick={handleExportHtmlForm}
                    disabled={htmlTableData.length === 0}
                    size="middle"
                  >
                    Export HTML
                  </Button>
                  {Object.keys(htmlBudgetData).length > 0 && (
                    <Button
                      type="primary"
                      icon={<CheckCircleOutlined />}
                      onClick={submitFinalBudget}
                      disabled={isSubmitting}
                      loading={isSubmitting}
                      size="middle"
                      style={{ background: '#52c41a', borderColor: '#52c41a' }}
                    >
                      Submit Final
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
          
          {/* Draft Status - compact inline */}
          {htmlFilters.actualYear && htmlFilters.salesRep && Object.keys(htmlBudgetData).length > 0 && (
            <div style={{ 
              marginTop: '10px', 
              padding: '6px 12px', 
              background: draftStatus === 'saved' ? '#f6ffed' : draftStatus === 'saving' ? '#fff7e6' : '#fff2f0',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px'
            }}>
              <span>
                {draftStatus === 'saving' && '💾 Saving...'}
                {draftStatus === 'saved' && '✅ Draft saved'}
                {draftStatus === 'error' && '⚠️ Save failed'}
              </span>
              {lastSaveTime && draftStatus === 'saved' && (
                <span style={{ color: '#8c8c8c' }}>({new Date(lastSaveTime).toLocaleTimeString()})</span>
              )}
            </div>
          )}
        </Spin>
      </div>
      
      {/* Budget vs Actual Summary - 3-Card Layout matching Export */}
      {htmlFilters.actualYear && htmlFilters.salesRep && (htmlTableData.length > 0 || htmlCustomRows.length > 0) && (
        <div style={{ 
          padding: '12px 16px',
          background: '#f8f9fa',
          borderBottom: '1px solid #e8e8e8',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1890ff', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            📊 Budget vs Actual Summary
          </div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {/* Volume (MT) Card */}
            <div style={{ 
              flex: '1', 
              minWidth: '280px',
              background: '#fff', 
              borderRadius: '6px', 
              padding: '12px 16px', 
              border: '1px solid #e8e8e8',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#666', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                📦 Volume (MT)
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '24px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#999' }}>Act: </span>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: '#1890ff' }}>{formatMT(htmlActualYearTotal)}</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#999' }}>Bud: </span>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: '#d4b106' }}>{formatMT(htmlBudgetYearTotal)}</span>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <span style={{ 
                    fontSize: '14px', 
                    fontWeight: 700, 
                    color: htmlActualYearTotal === 0 ? '#999' : ((htmlBudgetYearTotal - htmlActualYearTotal) >= 0 ? '#52c41a' : '#ff4d4f') 
                  }}>
                    {htmlActualYearTotal === 0 ? 'N/A' : `${((htmlBudgetYearTotal - htmlActualYearTotal) / htmlActualYearTotal * 100).toFixed(0)}%`}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Amount Card - Uses stored DB totals for accurate display (includes Services Charges) */}
            <div style={{ 
              flex: '1', 
              minWidth: '280px',
              background: '#fff', 
              borderRadius: '6px', 
              padding: '12px 16px', 
              border: '1px solid #e8e8e8',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#666', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CurrencySymbol /> Amount
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '24px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#999' }}>Act: </span>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: '#1890ff' }}>{formatAed(htmlActualAmountYearTotal)}</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#999' }}>Bud: </span>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: '#d4b106' }}>{formatAed(htmlStoredBudgetTotals.amount || htmlAmountYearTotal)}</span>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <span style={{ 
                    fontSize: '14px', 
                    fontWeight: 700, 
                    color: htmlActualAmountYearTotal === 0 ? '#999' : (((htmlStoredBudgetTotals.amount || htmlAmountYearTotal) - htmlActualAmountYearTotal) >= 0 ? '#52c41a' : '#ff4d4f') 
                  }}>
                    {htmlActualAmountYearTotal === 0 ? 'N/A' : `${(((htmlStoredBudgetTotals.amount || htmlAmountYearTotal) - htmlActualAmountYearTotal) / htmlActualAmountYearTotal * 100).toFixed(0)}%`}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Customers Card */}
            <div style={{ 
              flex: '1', 
              minWidth: '280px',
              background: '#fff', 
              borderRadius: '6px', 
              padding: '12px 16px', 
              border: '1px solid #e8e8e8',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#666', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                👥 Customers
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '24px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#999' }}>Act: </span>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: '#1890ff' }}>{htmlActualCustomerCount}</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#999' }}>Bud: </span>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: '#d4b106' }}>{htmlBudgetCustomerCount}</span>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <span style={{ 
                    fontSize: '14px', 
                    fontWeight: 700, 
                    color: (htmlBudgetCustomerCount - htmlActualCustomerCount) >= 0 ? '#52c41a' : '#ff4d4f' 
                  }}>
                    {htmlBudgetCustomerCount - htmlActualCustomerCount}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Budget Table - for both specific sales rep and All sales reps */}
      {htmlFilters.actualYear && htmlFilters.salesRep && (
         <Spin spinning={htmlTableLoading} style={{ width: '100%', display: 'block' }}>
           <div style={{ width: '100%', height: 'calc(100vh - 180px)', overflowX: 'auto', overflowY: 'auto' }}>
                 <table
                  style={{
                    width: '100%',
                    borderCollapse: 'separate',
                    borderSpacing: 0,
                    fontSize: '12px',
                    tableLayout: 'fixed',
                  }}
                >
                   <colgroup>
                     {isAllSalesReps && <col style={{ width: '12%' }} />}
                     <col style={{ width: isAllSalesReps ? '13%' : '15%' }} />
                     <col style={{ width: '10%' }} />
                     <col style={{ width: isAllSalesReps ? '13%' : '15%' }} />
                     <col style={{ width: '5%' }} />
                     <col style={{ width: '5%' }} />
                     <col style={{ width: '5%' }} />
                     <col style={{ width: '5%' }} />
                     <col style={{ width: '5%' }} />
                     <col style={{ width: '5%' }} />
                     <col style={{ width: '5%' }} />
                     <col style={{ width: '5%' }} />
                     <col style={{ width: '5%' }} />
                     <col style={{ width: '5%' }} />
                     <col style={{ width: '5%' }} />
                     <col style={{ width: '5%' }} />
                     <col style={{ width: '6%' }} />
                   </colgroup>
                   <thead>
                   {/* Header Banner with Title, Legend, and Action Buttons */}
                   <tr>
                     <th
                       colSpan={isAllSalesReps ? 17 : 16}
                       style={{
                         position: 'sticky',
                         top: 0,
                         zIndex: 1002,
                         backgroundColor: '#1677ff',
                         color: '#fff',
                         padding: '8px 16px',
                         borderBottom: '1px solid #1677ff',
                       }}
                     >
                       <div style={{
                         display: 'flex',
                         justifyContent: 'space-between',
                         alignItems: 'center',
                         flexWrap: 'wrap',
                         gap: '8px',
                       }}>
                         {/* Left: Title and Info */}
                         <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                           <span style={{ fontWeight: 600, fontSize: '14px' }}>
                             📋 Budget Planning Form
                           </span>
                           {isAllSalesReps ? (
                             <span style={{ fontSize: '12px', opacity: 0.9 }}>
                               🌐 All Sales Reps Combined
                             </span>
                           ) : (
                             <span style={{ fontSize: '12px', opacity: 0.9 }}>
                               {selectedDivision} • {htmlFilters.salesRep ? (htmlSalesRepLabelMap[htmlFilters.salesRep?.toString().toUpperCase()] || htmlFilters.salesRep) : ''} • {htmlFilters.actualYear}/{budgetYearDerived}
                             </span>
                           )}
                         </div>
                         
                         {/* Center: Legend */}
                         <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11px' }}>
                           <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                             <span style={{ display: 'inline-block', width: 12, height: 12, backgroundColor: '#e6f4ff', border: '1px solid #99c8ff' }} />
                             Actual {htmlFilters.actualYear}
                           </span>
                           <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                             <span style={{ display: 'inline-block', width: 12, height: 12, backgroundColor: '#FFFFB8', border: '1px solid #d4b106' }} />
                             Budget {budgetYearDerived}
                           </span>
                         </div>
                         
                         {/* Right: Action Buttons */}
                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                           {isAllSalesReps && Object.values(columnFilters).some(f => f) && (
                             <Button
                               size="small"
                               onClick={clearAllFilters}
                               icon={<ReloadOutlined />}
                               style={{ fontSize: '11px' }}
                             >
                               Clear Filters
                             </Button>
                           )}
                           {/* Delete and Add Row buttons - available in both modes */}
                           <>
                             <Button
                               danger
                               size="small"
                               icon={<DeleteOutlined />}
                               onClick={handleDeleteBudget}
                               style={{ fontSize: '11px' }}
                               title={isAllSalesReps && !targetSalesRep ? 'Delete ALL budget for this year' : 'Delete budget data'}
                             >
                               Delete
                             </Button>
                             <Button
                               type="primary"
                               size="small"
                               icon={<PlusOutlined />}
                               onClick={handleAddCustomRow}
                               style={{ fontSize: '11px', background: '#52c41a', borderColor: '#52c41a' }}
                               disabled={isAllSalesReps && !targetSalesRep}
                               title={isAllSalesReps && !targetSalesRep ? 'Select a Target Rep first' : 'Add a new customer row'}
                             >
                               Add Row
                             </Button>
                           </>
                         </div>
                       </div>
                     </th>
                   </tr>
                   {/* Filter Row - Only for All Sales Reps */}
                   {isAllSalesReps && (
                     <tr style={{ position: 'sticky', top: 49, zIndex: 1001 }}>
                       <th
                         style={{
                           backgroundColor: '#f0f0f0',
                           padding: '4px',
                           border: '1px solid #ddd',
                           position: 'sticky',
                           left: 0,
                           zIndex: 1003,
                         }}
                       >
                         <Select
                           placeholder="Filter Sales Rep"
                           value={columnFilters.salesRep || undefined}
                           onChange={(value) => handleColumnFilterChange('salesRep', value)}
                           allowClear
                           size="small"
                           style={{ width: '100%' }}
                           showSearch
                           optionFilterProp="children"
                         >
                           {filterDropdownOptions.salesReps.map(rep => (
                             <Option key={rep} value={rep}>{rep}</Option>
                           ))}
                         </Select>
                       </th>
                       <th
                         style={{
                           backgroundColor: '#f0f0f0',
                           padding: '4px',
                           border: '1px solid #ddd',
                         }}
                       >
                         <Select
                           placeholder="Filter Customer"
                           value={columnFilters.customer || undefined}
                           onChange={(value) => handleColumnFilterChange('customer', value)}
                           allowClear
                           size="small"
                           style={{ width: '100%' }}
                           showSearch
                           optionFilterProp="children"
                         >
                           {filterDropdownOptions.customers.map(customer => (
                             <Option key={customer} value={customer}>{customer}</Option>
                           ))}
                         </Select>
                       </th>
                       <th
                         style={{
                           backgroundColor: '#f0f0f0',
                           padding: '4px',
                           border: '1px solid #ddd',
                         }}
                       >
                         <Select
                           placeholder="Filter Country"
                           value={columnFilters.country || undefined}
                           onChange={(value) => handleColumnFilterChange('country', value)}
                           allowClear
                           size="small"
                           style={{ width: '100%' }}
                           showSearch
                           optionFilterProp="children"
                         >
                           {filterDropdownOptions.countries.map(country => (
                             <Option key={country} value={country}>{country}</Option>
                           ))}
                         </Select>
                       </th>
                       <th
                         style={{
                           backgroundColor: '#f0f0f0',
                           padding: '4px',
                           border: '1px solid #ddd',
                         }}
                       >
                         <Select
                           placeholder="Filter Product Group"
                           value={columnFilters.productGroup || undefined}
                           onChange={(value) => handleColumnFilterChange('productGroup', value)}
                           allowClear
                           size="small"
                           style={{ width: '100%' }}
                           showSearch
                           optionFilterProp="children"
                         >
                           {filterDropdownOptions.productGroups.map(group => (
                             <Option key={group} value={group}>{group}</Option>
                           ))}
                         </Select>
                       </th>
                       {/* Empty cells for month columns */}
                       {Array.from({ length: 12 }, (_, i) => (
                         <th
                           key={`filter-month-${i + 1}`}
                           style={{
                             backgroundColor: '#f0f0f0',
                             padding: '4px',
                             border: '1px solid #ddd',
                           }}
                         />
                       ))}
                       {/* Empty cell for Total column */}
                       <th
                         style={{
                           backgroundColor: '#f0f0f0',
                           padding: '4px',
                           border: '1px solid #ddd',
                         }}
                       />
                     </tr>
                   )}
                   {/* Column Headers */}
                   <tr style={{ position: 'sticky', top: isAllSalesReps ? 85 : 49, zIndex: 1001 }}>
                     {isAllSalesReps && (
                       <th
                         rowSpan={2}
                         style={{
                           backgroundColor: '#1677ff',
                           color: '#fff',
                           padding: '8px',
                           border: '1px solid #fff',
                           position: 'sticky',
                           left: 0,
                           zIndex: 1003,
                           width: '12%',
                           minWidth: 0,
                           whiteSpace: 'normal',
                           wordBreak: 'break-word',
                           lineHeight: 1.3,
                         }}
                       >
                         Sales Rep
                       </th>
                     )}
                     <th
                       rowSpan={2}
                       style={{
                         backgroundColor: '#1677ff',
                         color: '#fff',
                         padding: '8px',
                         border: '1px solid #fff',
                         position: isAllSalesReps ? 'relative' : 'sticky',
                         left: isAllSalesReps ? 'auto' : 0,
                         zIndex: isAllSalesReps ? 'auto' : 1003,
                         width: isAllSalesReps ? '13%' : '15%',
                         minWidth: 0,
                         whiteSpace: 'normal',
                         wordBreak: 'break-word',
                         lineHeight: 1.3,
                       }}
                     >
                       Customer Name
                     </th>
                     <th
                       rowSpan={2}
                       style={{
                         backgroundColor: '#1677ff',
                         color: '#fff',
                         padding: '8px',
                         border: '1px solid #fff',
                         width: '10%',
                         minWidth: 0,
                         whiteSpace: 'normal',
                         wordBreak: 'break-word',
                         lineHeight: 1.3,
                       }}
                     >
                       Country Name
                     </th>
                     <th
                       rowSpan={2}
                       style={{
                         backgroundColor: '#1677ff',
                         color: '#fff',
                         padding: '8px',
                         border: '1px solid #fff',
                         width: '15%',
                         minWidth: 0,
                         whiteSpace: 'normal',
                         wordBreak: 'break-word',
                         lineHeight: 1.3,
                       }}
                     >
                       Product Group
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
                           width: '5%',
                           minWidth: 0,
                         }}
                       >
                         {month}
                       </th>
                     ))}
                     <th
                       rowSpan={2}
                       style={{
                         backgroundColor: '#1677ff',
                         color: '#fff',
                         padding: '8px',
                         border: '1px solid #fff',
                         textAlign: 'center',
                         width: '6%',
                         minWidth: 0,
                         fontWeight: 700,
                       }}
                     >
                       Total
                     </th>
                   </tr>
                 </thead>
                 <tbody>
                   {filteredHtmlTableData.map((row, idx) => (
                     <React.Fragment key={`${row.customer}-${row.country}-${row.productGroup}-${idx}`}>
                       {/* Actual Row */}
                      <tr style={{ backgroundColor: '#e6f4ff' }}>
                         {isAllSalesReps && (
                           <td 
                             rowSpan={2}
                             style={{ 
                               padding: '8px',
                               border: '1px solid #ddd',
                               backgroundColor: '#fff',
                               position: 'sticky',
                               left: 0,
                               zIndex: 5,
                               fontWeight: 500,
                               whiteSpace: 'normal',
                               wordBreak: 'break-word',
                               lineHeight: 1.3,
                               fontSize: '11px',
                             }}
                           >
                             {getSalesRepDisplayLabel(row.salesRep) || 'N/A'}
                           </td>
                         )}
                         <td 
                           rowSpan={2}
                           style={{ 
                             padding: '8px',
                             border: '1px solid #ddd',
                             backgroundColor: '#fff',
                             position: isAllSalesReps ? 'relative' : 'sticky',
                             left: isAllSalesReps ? 'auto' : 0,
                             zIndex: isAllSalesReps ? 'auto' : 5,
                             fontWeight: 600,
                             whiteSpace: 'normal',
                             wordBreak: 'break-word',
                             lineHeight: 1.3,
                           }}
                         >
                           {row.customer}
                         </td>
                         <td 
                           rowSpan={2}
                           style={{ 
                             padding: '8px',
                             border: '1px solid #ddd',
                             backgroundColor: '#fff',
                             whiteSpace: 'normal',
                             wordBreak: 'break-word',
                             lineHeight: 1.3,
                           }}
                         >
                           {row.country}
                         </td>
                         <td 
                           rowSpan={2}
                           style={{ 
                             padding: '8px',
                             border: '1px solid #ddd',
                             backgroundColor: '#fff',
                             whiteSpace: 'normal',
                             wordBreak: 'break-word',
                             lineHeight: 1.3,
                           }}
                         >
                           {row.productGroup}
                         </td>
                         {Array.from({ length: 12 }, (_, i) => {
                           const month = i + 1;
                           const actualValue = row.monthlyActual?.[month] || 0;
                           return (
                             <td 
                               key={`actual-${month}`}
                               style={{ 
                                 padding: '6px 8px',
                                 border: '1px solid #ddd',
                                backgroundColor: '#e6f4ff',
                                 textAlign: 'right',
                                 fontWeight: 500,
                               }}
                             >
                               {formatMT(actualValue)}
                             </td>
                           );
                         })}
                         {/* Total cell for actual row */}
                         <td
                           style={{
                             padding: '6px 8px',
                             border: '1px solid #ddd',
                             backgroundColor: '#e6ffe6',
                             textAlign: 'right',
                             fontWeight: 700,
                           }}
                         >
                           {formatMT(Object.values(row.monthlyActual || {}).reduce((sum, v) => sum + (v || 0), 0))}
                         </td>
                       </tr>
                       {/* Budget Row */}
                       <tr style={{ backgroundColor: '#FFFFB8' }}>
                         {Array.from({ length: 12 }, (_, i) => {
                           const month = i + 1;
                           // For All Sales Reps mode, include salesRep in the key
                           const key = isAllSalesReps 
                             ? `${row.salesRep}|${row.customer}|${row.country}|${row.productGroup}|${month}`
                             : `${row.customer}|${row.country}|${row.productGroup}|${month}`;
                           const budgetValue = htmlBudgetData[key] || '';
                           return (
                             <td 
                               key={`budget-${month}`}
                               style={{ 
                                 padding: '2px',
                                 border: '1px solid #ddd',
                                 backgroundColor: '#FFFFB8',
                                 position: 'relative',
                               }}
                             >
                               <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                 <Input
                                   value={budgetValue}
                                   onChange={(e) => {
                                     const val = e.target.value.replace(/[^0-9.,]/g, '');
                                     if (isAllSalesReps) {
                                       handleBudgetInputChange(row.customer, row.country, row.productGroup, month, val, row.salesRep);
                                     } else {
                                       handleBudgetInputChange(row.customer, row.country, row.productGroup, month, val);
                                     }
                                   }}
                                   onBlur={(e) => {
                                     const val = e.target.value;
                                     if (val) {
                                       const formatted = formatMT(val);
                                       if (isAllSalesReps) {
                                         handleBudgetInputChange(row.customer, row.country, row.productGroup, month, formatted, row.salesRep);
                                       } else {
                                         handleBudgetInputChange(row.customer, row.country, row.productGroup, month, formatted);
                                       }
                                     }
                                   }}
                                   placeholder="0"
                                   style={{ 
                                     flex: 1,
                                     textAlign: 'right',
                                     border: 'none',
                                     padding: '4px 6px',
                                     fontSize: '12px',
                                     fontWeight: 500,
                                     backgroundColor: 'transparent',
                                     boxShadow: 'none',
                                   }}
                                 />
                                 {budgetValue && month < 12 && (
                                   <Button
                                     type="text"
                                     size="small"
                                     icon={<CopyOutlined />}
                                     onClick={() => handleCopyBudgetToRemainingMonths(
                                       row.customer, row.country, row.productGroup, month, budgetValue,
                                       isAllSalesReps ? row.salesRep : null
                                     )}
                                     title={`Copy ${budgetValue} to months ${month}-12`}
                                     style={{
                                       padding: '0 2px',
                                       height: '18px',
                                       width: '18px',
                                       minWidth: '18px',
                                       fontSize: '10px',
                                       color: '#1890ff',
                                       opacity: 0.6,
                                     }}
                                   />
                                 )}
                               </div>
                             </td>
                           );
                         })}
                         {/* Total cell for budget row */}
                         <td
                           style={{
                             padding: '6px 8px',
                             border: '1px solid #ddd',
                             backgroundColor: '#FFFFB8',
                             textAlign: 'right',
                             fontWeight: 700,
                           }}
                         >
                           {formatMT(
                             Array.from({ length: 12 }, (_, i) => {
                               const key = isAllSalesReps
                                 ? `${row.salesRep}|${row.customer}|${row.country}|${row.productGroup}|${i + 1}`
                                 : `${row.customer}|${row.country}|${row.productGroup}|${i + 1}`;
                               return parseFloat((htmlBudgetData[key] || '0').toString().replace(/,/g, '')) || 0;
                             }).reduce((sum, v) => sum + v, 0)
                           )}
                         </td>
                       </tr>
                     </React.Fragment>
                   ))}
                   {/* Custom Rows (Budget only, no Actual row) */}
                   {/* In All Sales Reps mode, only show custom rows for selected targetSalesRep */}
                   {htmlCustomRows
                     .filter(customRow => !isAllSalesReps || customRow.salesRep === targetSalesRep)
                     .map((customRow) => (
                     <tr key={`custom-${customRow.id}`} style={{ backgroundColor: '#FFFFB8' }}>
                       <td style={{ 
                         padding: '8px', 
                         border: '1px solid #ddd', 
                         backgroundColor: '#fff', 
                         position: 'sticky', 
                         left: 0, 
                         zIndex: 5,
                         fontWeight: 600,
                         whiteSpace: 'normal',
                         wordBreak: 'break-word',
                         lineHeight: 1.3,
                       }}>
                         {customRow.isNewCustomer && !customRow.customer ? (
                           <Space.Compact style={{ width: '100%' }}>
                             <Input
                               placeholder="Type customer name here..."
                               value={newCustomerInputs[customRow.id] || ''}
                               onChange={(e) => {
                                 setNewCustomerInputs(prev => ({
                                   ...prev,
                                   [customRow.id]: e.target.value,
                                 }));
                               }}
                               onPressEnter={(e) => {
                                 const newCustomerName = e.target.value.trim();
                                 if (newCustomerName) {
                                   handleCustomRowCustomerChange(customRow.id, newCustomerName, true);
                                   setNewCustomerInputs(prev => {
                                     const updated = { ...prev };
                                     delete updated[customRow.id];
                                     return updated;
                                   });
                                 }
                               }}
                               onBlur={(e) => {
                                 const newCustomerName = e.target.value.trim();
                                 if (newCustomerName) {
                                   handleCustomRowCustomerChange(customRow.id, newCustomerName, true);
                                   setNewCustomerInputs(prev => {
                                     const updated = { ...prev };
                                     delete updated[customRow.id];
                                     return updated;
                                   });
                                 }
                               }}
                               style={{ 
                                 flex: 1, 
                                 fontWeight: 600,
                                 border: '2px solid #1890ff',
                                 borderRadius: '4px',
                                 backgroundColor: '#f0f9ff',
                                 boxShadow: '0 0 0 3px rgba(24,144,255,0.15)',
                                 textAlign: 'left',
                               }}
                               autoFocus
                             />
                             <Button
                               type="text"
                               danger
                               icon={<DeleteOutlined />}
                               onClick={() => handleRemoveCustomRow(customRow.id)}
                               size="small"
                               title="Remove row"
                             />
                           </Space.Compact>
                         ) : customRow.customer ? (
                           <Space.Compact style={{ width: '100%' }}>
                             <span style={{ flex: 1, fontWeight: 600, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3 }}>
                               {customRow.customer}
                             </span>
                             <Button
                               type="text"
                               danger
                               icon={<DeleteOutlined />}
                               onClick={() => handleRemoveCustomRow(customRow.id)}
                               size="small"
                             />
                           </Space.Compact>
                         ) : (
                           <Space.Compact style={{ width: '100%' }}>
                             <Select
                               placeholder=""
                               value={customRow.customer}
                               mode="combobox"
                               onChange={(value) => {
                                 if (value === '__NEW__') {
                                   // Show input for new customer
                                   setNewCustomerInputs(prev => ({
                                     ...prev,
                                     [customRow.id]: '',
                                   }));
                                   handleCustomRowCustomerChange(customRow.id, null, true);
                                 } else if (value && value.trim()) {
                                   // User typed a new customer or selected existing
                                   const isExisting = htmlMergedCustomers.includes(value);
                                   handleCustomRowCustomerChange(customRow.id, value, !isExisting);
                                 }
                               }}
                               onBlur={(e) => {
                                 const value = e.target.value?.trim();
                                 if (value) {
                                   const isExisting = htmlMergedCustomers.includes(value);
                                   handleCustomRowCustomerChange(customRow.id, value, !isExisting);
                                 }
                               }}
                               style={{ width: '100%' }}
                               showSearch
                               allowClear
                               filterOption={(input, option) =>
                                 (option?.label || '').toLowerCase().includes(input.toLowerCase())
                               }
                             >
                               <Option value="__NEW__" label="+ Add New Customer" style={{ fontStyle: 'italic', color: '#1890ff' }}>
                                 + Add New Customer
                               </Option>
                               {htmlMergedCustomers.map(customer => (
                                 <Option key={customer} value={customer} label={customer}>{customer}</Option>
                               ))}
                             </Select>
                             <Button
                               type="text"
                               danger
                               icon={<DeleteOutlined />}
                               onClick={() => handleRemoveCustomRow(customRow.id)}
                               size="small"
                             />
                           </Space.Compact>
                         )}
                       </td>
                       <td style={{ padding: '4px', border: '1px solid #ddd', backgroundColor: '#fff' }}>
                         {customRow.isNewCustomer || (!customRow.isNewCustomer && !customRow.country) ? (
                           <Select
                             placeholder="Select country"
                             value={customRow.country}
                             onChange={(value) => handleCustomRowCountryChange(customRow.id, value)}
                             style={{ width: '100%' }}
                             showSearch
                             allowClear
                             disabled={!customRow.customer}
                             filterOption={(input, option) =>
                               (option?.label || '').toLowerCase().includes(input.toLowerCase())
                             }
                           >
                             {htmlCountries.map(country => (
                               <Option key={country} value={country} label={country}>{country}</Option>
                             ))}
                           </Select>
                         ) : (
                           <Input
                             value={customRow.country || ''}
                             disabled
                             style={{ width: '100%', backgroundColor: '#f5f5f5' }}
                           />
                         )}
                       </td>
                       <td style={{ padding: '4px', border: '1px solid #ddd', backgroundColor: '#fff' }}>
                         <Select
                           placeholder="Select product group"
                           value={customRow.productGroup}
                           onChange={(value) => handleCustomRowProductGroupChange(customRow.id, value)}
                           style={{ width: '100%' }}
                           showSearch
                           allowClear
                           disabled={!customRow.customer}
                           filterOption={(input, option) =>
                             (option?.label || '').toLowerCase().includes(input.toLowerCase())
                           }
                         >
                           {allProductGroups.map(pg => (
                             <Option key={pg} value={pg} label={pg}>{pg}</Option>
                           ))}
                         </Select>
                       </td>
                       {Array.from({ length: 12 }, (_, i) => {
                         const month = i + 1;
                         const key = `custom_${customRow.id}_${month}`;
                         const budgetValue = htmlBudgetData[key] || '';
                         return (
                           <td
                             key={`custom-budget-${month}`}
                             style={{
                               padding: '2px',
                               border: '1px solid #ddd',
                               backgroundColor: '#FFFFB8',
                             }}
                           >
                             <Input
                               value={budgetValue}
                               onChange={(e) => {
                                 const val = e.target.value.replace(/[^0-9.,]/g, '');
                                 handleCustomRowBudgetChange(customRow.id, month, val);
                               }}
                               onBlur={(e) => {
                                 const val = e.target.value;
                                 if (val) {
                                   const formatted = formatMT(val);
                                   handleCustomRowBudgetChange(customRow.id, month, formatted);
                                 }
                               }}
                               placeholder="0"
                               style={{
                                 width: '100%',
                                 textAlign: 'right',
                                 border: 'none',
                                 padding: '4px 6px',
                                 fontSize: '12px',
                                 fontWeight: 500,
                                 backgroundColor: 'transparent',
                                 boxShadow: 'none',
                               }}
                               disabled={
                                !(customRow.customer || (customRow.isNewCustomer && newCustomerInputs[customRow.id]?.trim())) || 
                                !customRow.country || 
                                !customRow.productGroup
                              }
                              onFocus={(e) => {
                                // Show notification if trying to enter value without complete info
                                const hasCustomer = customRow.customer || (customRow.isNewCustomer && newCustomerInputs[customRow.id]?.trim());
                                if (!hasCustomer || !customRow.country || !customRow.productGroup) {
                                  const missing = [];
                                  if (!hasCustomer) missing.push('Customer Name');
                                  if (!customRow.country) missing.push('Country');
                                  if (!customRow.productGroup) missing.push('Product Group');
                                  
                                  if (missing.length > 0) {
                                    message.warning({
                                      content: `Please fill in the following before entering budget values:\n${missing.join(', ')}`,
                                      duration: 3
                                    });
                                    e.target.blur();
                                  }
                                }
                              }}
                             />
                           </td>
                         );
                       })}
                       {/* Total cell for custom row */}
                       <td
                         style={{
                           padding: '6px 8px',
                           border: '1px solid #ddd',
                           backgroundColor: '#FFFFB8',
                           textAlign: 'right',
                           fontWeight: 700,
                         }}
                       >
                         {formatMT(
                           Array.from({ length: 12 }, (_, i) => {
                             const key = `custom_${customRow.id}_${i + 1}`;
                             return parseFloat((htmlBudgetData[key] || '0').toString().replace(/,/g, '')) || 0;
                           }).reduce((sum, v) => sum + v, 0)
                         )}
                       </td>
                     </tr>
                   ))}
                   {filteredHtmlTableData.length === 0 && 
                    (isAllSalesReps 
                      ? htmlCustomRows.filter(r => r.salesRep === targetSalesRep).length === 0 
                      : htmlCustomRows.length === 0) && 
                    !htmlTableLoading && (
                     <tr>
                       <td colSpan={isAllSalesReps ? 17 : 16} style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                         {htmlFilters.actualYear && htmlFilters.salesRep 
                           ? 'No customer data found for selected filters'
                           : 'Please select Actual Year and Sales Rep to load data'}
                       </td>
                     </tr>
                   )}
                 </tbody>
                 <tfoot>
                   <tr style={{ backgroundColor: '#cce4ff' }}>
                     <td
                       style={{
                         padding: '8px',
                         border: '1px solid #ddd',
                         position: 'sticky',
                         left: 0,
                         zIndex: 6,
                         fontWeight: 700,
                         textAlign: 'left',
                       }}
                       colSpan={isAllSalesReps ? 4 : 3}
                     >
                       Total Actual Volume (MT)
                     </td>
                     {Array.from({ length: 12 }, (_, i) => {
                       const month = i + 1;
                       return (
                         <td
                           key={`actual-total-${month}`}
                           style={{
                             padding: '6px 8px',
                             border: '1px solid #ddd',
                             backgroundColor: '#cce4ff',
                             textAlign: 'right',
                             fontWeight: 700,
                           }}
                         >
                           {formatMT(htmlMonthlyActualTotals[month])}
                         </td>
                       );
                     })}
                     <td
                       style={{
                         padding: '6px 8px',
                         border: '1px solid #ddd',
                         backgroundColor: '#b3d9ff',
                         textAlign: 'right',
                         fontWeight: 700,
                       }}
                     >
                       {formatMT(htmlActualYearTotal)}
                     </td>
                   </tr>
                   {/* Total Actual Amount Row */}
                   <tr style={{ backgroundColor: '#d4edda' }}>
                     <td
                       style={{
                         padding: '8px',
                         border: '1px solid #ddd',
                         position: 'sticky',
                         left: 0,
                         zIndex: 6,
                         fontWeight: 700,
                         textAlign: 'left',
                         backgroundColor: '#d4edda',
                       }}
                       colSpan={isAllSalesReps ? 4 : 3}
                     >
                       Total Actual Amount (<CurrencySymbol />)
                     </td>
                     {Array.from({ length: 12 }, (_, i) => {
                       const month = i + 1;
                       return (
                         <td
                           key={`actual-amount-total-${month}`}
                           style={{
                             padding: '6px 8px',
                             border: '1px solid #ddd',
                             backgroundColor: '#d4edda',
                             textAlign: 'right',
                             fontWeight: 700,
                             fontSize: '12px',
                           }}
                         >
                           {formatAed(htmlMonthlyActualAmountTotals[month])}
                         </td>
                       );
                     })}
                     <td
                       style={{
                         padding: '6px 8px',
                         border: '1px solid #ddd',
                         backgroundColor: '#c3e6cb',
                         textAlign: 'right',
                         fontWeight: 700,
                         fontSize: '12px',
                       }}
                     >
                       {formatAed(htmlActualAmountYearTotal)}
                     </td>
                   </tr>
                   {/* Total Actual MoRM Row */}
                   <tr style={{ backgroundColor: '#ffe0b2' }}>
                     <td
                       style={{
                         padding: '8px',
                         border: '1px solid #ddd',
                         position: 'sticky',
                         left: 0,
                         zIndex: 6,
                         fontWeight: 700,
                         textAlign: 'left',
                         backgroundColor: '#ffe0b2',
                       }}
                       colSpan={isAllSalesReps ? 4 : 3}
                     >
                       Total Actual MoRM (<CurrencySymbol />)
                     </td>
                     {Array.from({ length: 12 }, (_, i) => {
                       const month = i + 1;
                       return (
                         <td
                           key={`actual-morm-total-${month}`}
                           style={{
                             padding: '6px 8px',
                             border: '1px solid #ddd',
                             backgroundColor: '#ffe0b2',
                             textAlign: 'right',
                             fontWeight: 700,
                             fontSize: '12px',
                           }}
                         >
                           {formatAed(htmlMonthlyActualMormTotals[month])}
                         </td>
                       );
                     })}
                     <td
                       style={{
                         padding: '6px 8px',
                         border: '1px solid #ddd',
                         backgroundColor: '#ffb74d',
                         textAlign: 'right',
                         fontWeight: 700,
                         fontSize: '12px',
                       }}
                     >
                       {formatAed(htmlActualMormYearTotal)}
                     </td>
                   </tr>
                   <tr style={{ backgroundColor: '#FFFFB8' }}>
                     <td
                       style={{
                         padding: '8px',
                         border: '1px solid #ddd',
                         position: 'sticky',
                         left: 0,
                         zIndex: 6,
                         fontWeight: 700,
                         textAlign: 'left',
                         backgroundColor: '#cce4ff',
                       }}
                       colSpan={isAllSalesReps ? 4 : 3}
                     >
                       Total Budget Volume (MT)
                     </td>
                     {Array.from({ length: 12 }, (_, i) => {
                       const month = i + 1;
                       return (
                         <td
                           key={`budget-total-${month}`}
                           style={{
                             padding: '6px 8px',
                             border: '1px solid #ddd',
                             backgroundColor: '#cce4ff',
                             textAlign: 'right',
                             fontWeight: 700,
                           }}
                         >
                           {formatMT(htmlMonthlyBudgetTotals[month])}
                         </td>
                       );
                     })}
                     <td
                       style={{
                         padding: '6px 8px',
                         border: '1px solid #ddd',
                         backgroundColor: '#b3d9ff',
                         textAlign: 'right',
                         fontWeight: 700,
                       }}
                     >
                       {formatMT(htmlBudgetYearTotal)}
                     </td>
                   </tr>
                   {/* Monthly Amount Totals Row */}
                   <tr style={{ backgroundColor: '#d4edda' }}>
                     <td
                       style={{
                         padding: '8px',
                         border: '1px solid #ddd',
                         position: 'sticky',
                         left: 0,
                         zIndex: 6,
                         fontWeight: 700,
                         textAlign: 'left',
                         backgroundColor: '#d4edda',
                       }}
                       colSpan={isAllSalesReps ? 4 : 3}
                     >
                       Total Budget Amount (<CurrencySymbol />)
                     </td>
                     {Array.from({ length: 12 }, (_, i) => {
                       const month = i + 1;
                       return (
                         <td
                           key={`amount-total-${month}`}
                           style={{
                             padding: '6px 8px',
                             border: '1px solid #ddd',
                             backgroundColor: '#d4edda',
                             textAlign: 'right',
                             fontWeight: 700,
                             fontSize: '12px',
                           }}
                         >
                           {formatAed(htmlMonthlyAmountTotals[month])}
                         </td>
                       );
                     })}
                     <td
                       style={{
                         padding: '6px 8px',
                         border: '1px solid #ddd',
                         backgroundColor: '#c3e6cb',
                         textAlign: 'right',
                         fontWeight: 700,
                         fontSize: '12px',
                       }}
                     >
                       {formatAed(htmlAmountYearTotal)}
                     </td>
                   </tr>
                   {/* Monthly MoRM Totals Row */}
                   <tr style={{ backgroundColor: '#ffe0b2' }}>
                     <td
                       style={{
                         padding: '8px',
                         border: '1px solid #ddd',
                         position: 'sticky',
                         left: 0,
                         zIndex: 6,
                         fontWeight: 700,
                         textAlign: 'left',
                         backgroundColor: '#ffe0b2',
                       }}
                       colSpan={isAllSalesReps ? 4 : 3}
                     >
                       Total Budget MoRM (<CurrencySymbol />)
                     </td>
                     {Array.from({ length: 12 }, (_, i) => {
                       const month = i + 1;
                       return (
                         <td
                           key={`morm-total-${month}`}
                           style={{
                             padding: '6px 8px',
                             border: '1px solid #ddd',
                             backgroundColor: '#ffe0b2',
                             textAlign: 'right',
                             fontWeight: 700,
                             fontSize: '12px',
                           }}
                         >
                           {formatAed(htmlMonthlyMormTotals[month])}
                         </td>
                       );
                     })}
                     <td
                       style={{
                         padding: '6px 8px',
                         border: '1px solid #ddd',
                         backgroundColor: '#ffb74d',
                         textAlign: 'right',
                         fontWeight: 700,
                         fontSize: '12px',
                       }}
                     >
                       {formatAed(htmlMormYearTotal)}
                     </td>
                   </tr>
                 </tfoot>
                 </table>
             </div>
             </Spin>
      )}
    </div>
  );

  return (
    <div className="budget-tab" style={{ padding: '0', width: '100%' }}>
      {/* HTML Format Content */}
      <Tabs
        activeKey={activeHtmlSubTab}
        onChange={setActiveHtmlSubTab}
        size="small"
        style={{ marginBottom: 0 }}
        items={[
          {
            key: 'divisional',
            label: 'Divisional Budget',
            children: (
              <Tabs
                activeKey={activeDivisionalSubTab}
                onChange={setActiveDivisionalSubTab}
                size="small"
                        type="card"
                        style={{ marginTop: 8 }}
                        items={[
                          {
                            key: 'product-group',
                            label: 'Product Group',
                            children: divisionalHtmlFormatContent,
                          },
                          {
                            key: 'budget-pl',
                            label: 'Budget P&L',
                            children: (
                              <BudgetPLTab 
                                selectedDivision={selectedDivision}
                                isActive={isActive && activeDivisionalSubTab === 'budget-pl'}
                                message={message}
                                modal={modal}
                              />
                            ),
                          },
                        ]}
                      />
                    ),
                  },
                  {
                    key: 'salesBudget',
                    label: 'Sales Budget',
                    children: (
                      <Tabs
                        activeKey={activeSalesBudgetSubTab}
                        onChange={setActiveSalesBudgetSubTab}
                        size="small"
                        type="card"
                        style={{ marginTop: 8 }}
                        items={[
                          // Management Allocation tab - Admin only (FIRST TAB - primary workflow)
                          ...(IS_ADMIN ? [{
                            key: 'management',
                            label: (
                              <span>
                                <LockOutlined style={{ marginRight: 4, fontSize: 12 }} />
                                Management Allocation
                              </span>
                            ),
                            children: (
                              <ManagementAllocationTab 
                                selectedDivision={selectedDivision}
                                isActive={isActive && activeHtmlSubTab === 'salesBudget' && activeSalesBudgetSubTab === 'management'}
                              />
                            ),
                          }] : []),
                          // Bulk Import tab - Admin only (import filled HTML files from sales reps)
                          ...(IS_ADMIN ? [{
                            key: 'bulkImport',
                            label: (
                              <span>
                                <LockOutlined style={{ marginRight: 4, fontSize: 12 }} />
                                Bulk Import
                              </span>
                            ),
                            children: (
                              <BulkImportTab 
                                selectedDivision={selectedDivision}
                                budgetYear={htmlFilters.budgetYear || new Date().getFullYear() + 1}
                                isActive={isActive && activeHtmlSubTab === 'salesBudget' && activeSalesBudgetSubTab === 'bulkImport'}
                                message={message}
                                modal={modal}
                              />
                            ),
                          }] : []),
                          // Live Entry tab - Admin only (live budget entry in browser)
                          ...(IS_ADMIN ? [{
                            key: 'liveEntry',
                            label: (
                              <span>
                                <LockOutlined style={{ marginRight: 4, fontSize: 12 }} />
                                Live Entry
                              </span>
                            ),
                            children: (
                              <LiveBudgetEntryTab 
                                selectedDivision={selectedDivision}
                                isActive={isActive && activeHtmlSubTab === 'salesBudget' && activeSalesBudgetSubTab === 'liveEntry'}
                                message={message}
                                modal={modal}
                              />
                            ),
                          }] : []),
                          {
                            key: 'recap',
                            label: 'Sales Rep Recap',
                            children: salesRepRecapContent,
                          },
                          // LEGACY: Sales Rep Import - Old workflow, kept for backward compatibility
                          // New workflow: Management Allocation → Export PG Allocated Budget → Sales Rep fills → Bulk Import
                          {
                            key: 'salesReps',
                            label: (
                              <span style={{ color: '#999' }}>
                                Sales Rep Import (Legacy)
                              </span>
                            ),
                            children: htmlFormatContent,
                          },
                        ]}
                      />
                    ),
                  },
                ]}
              />
      
      {/* Submit Confirmation Modal - Sales Rep */}
      <Modal
        title="📋 Submit Final Budget?"
        open={submitConfirmVisible}
        onOk={handleConfirmSubmit}
        onCancel={handleCancelSubmit}
        okText="Yes, Submit Final Budget"
        cancelText="Cancel"
        okType="primary"
        width={500}
        zIndex={10000}
        maskClosable={false}
        centered
        icon={<WarningOutlined />}
      >
        <div>
          <p>This will finalize your budget and:</p>
          <ul style={{ paddingLeft: 20, marginTop: 8 }}>
            <li>Calculate Amount and MoRM values automatically</li>
            <li>Submit to the system database</li>
            <li>Lock the budget (requires approval to edit)</li>
          </ul>
          <p style={{ marginTop: 12, fontWeight: 500 }}>Do you want to proceed?</p>
        </div>
      </Modal>
      
      {/* Submit Confirmation Modal - Divisional */}
      <Modal
        title="📋 Submit Final Divisional Budget?"
        open={submitDivisionalConfirmVisible}
        onOk={submitDivisionalBudget}
        onCancel={() => setSubmitDivisionalConfirmVisible(false)}
        okText="Yes, Submit Final Budget"
        cancelText="Cancel"
        okType="primary"
        width={500}
        zIndex={10000}
        maskClosable={false}
        centered
        icon={<WarningOutlined />}
        okButtonProps={{ loading: isSubmittingDivisional }}
      >
        <div>
          <p>This will finalize your divisional budget and:</p>
          <ul style={{ paddingLeft: 20, marginTop: 8 }}>
            <li>Calculate Amount and MoRM values automatically</li>
            <li>Replace any existing divisional budget for this year</li>
            <li>Save to the Divisional Budget database</li>
          </ul>
          <p style={{ marginTop: 12, fontWeight: 500 }}>Do you want to proceed?</p>
        </div>
      </Modal>
      
      {/* Edit Confirmation Modal - Divisional */}
      <Modal
        title="✏️ Edit Divisional Budget?"
        open={editDivisionalConfirmVisible}
        onOk={editDivisionalBudget}
        onCancel={() => setEditDivisionalConfirmVisible(false)}
        okText="Yes, Unlock for Editing"
        cancelText="Cancel"
        okType="primary"
        width={500}
        zIndex={10000}
        maskClosable={false}
        centered
        okButtonProps={{ loading: isEditingDivisional, style: { background: '#fa8c16', borderColor: '#fa8c16' } }}
      >
        <div>
          <p>This will unlock the approved budget for editing:</p>
          <ul style={{ paddingLeft: 20, marginTop: 8 }}>
            <li>Budget status will change from <strong>Approved</strong> to <strong>Draft</strong></li>
            <li>You can then modify the budget values</li>
            <li>Click <strong>Submit Final</strong> when done to re-approve</li>
          </ul>
          <p style={{ marginTop: 12, fontWeight: 500 }}>Do you want to unlock for editing?</p>
        </div>
      </Modal>
    </div>
  );
};

export default BudgetTab;
