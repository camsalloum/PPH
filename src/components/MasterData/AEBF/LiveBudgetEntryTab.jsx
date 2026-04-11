/**
 * LiveBudgetEntryTab - Live Budget Entry for Sales Rep Groups
 * 
 * EXACT TWIN of the HTML export (Budget Planning Form)
 * - Same table structure: Actual row + Budget row paired with rowspan
 * - Same styling: Blue for actual, Yellow for budget
 * - Same features: Add customer, Save Draft, Submit
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card, Row, Col, Select, Button, Space, Tag, Spin, Empty, Modal, Form,
  message, Alert, Tooltip, AutoComplete, Input
} from 'antd';
import {
  SaveOutlined, SendOutlined, ReloadOutlined, PlusOutlined,
  DeleteOutlined, CheckCircleOutlined, ClockCircleOutlined,
  TeamOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import ReactECharts from 'echarts-for-react';

const { Option } = Select;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * Format number with 2 decimal places and thousands separator (matching HTML export)
 */
const formatMT = (val) => {
  if (val === null || val === undefined || val === '' || isNaN(parseFloat(val))) return '';
  const num = parseFloat(String(val).replace(/,/g, ''));
  if (num === 0) return '';
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Format for display (always show value even if 0)
 */
const formatMTDisplay = (val) => {
  if (val === null || val === undefined || isNaN(parseFloat(val))) return '0.00';
  const num = parseFloat(String(val).replace(/,/g, ''));
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Format amount for display (with M suffix for millions)
 */
const formatAmount = (val) => {
  if (val === null || val === undefined || isNaN(parseFloat(val))) return '0.00';
  const num = parseFloat(String(val).replace(/,/g, ''));
  if (Math.abs(num) >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M';
  } else if (Math.abs(num) >= 1000) {
    return (num / 1000).toFixed(2) + 'K';
  }
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ============================================================================
// STYLES - Matching HTML Export exactly
// ============================================================================
const styles = {
  container: {
    fontFamily: 'Arial, sans-serif',
    background: '#f5f5f5',
    minHeight: '100%',
  },
  header: {
    background: '#fff',
    padding: '12px 20px',
    marginBottom: '12px',
    borderRadius: '4px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  headerTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  headerTitle: {
    margin: 0,
    color: '#333',
    fontSize: '18px',
  },
  headerInfo: {
    display: 'flex',
    gap: '20px',
    flexWrap: 'wrap',
    alignItems: 'center',
    fontSize: '14px',
    color: '#333',
  },
  headerLegend: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    color: '#555',
  },
  legendColorActual: {
    display: 'inline-block',
    width: '14px',
    height: '14px',
    border: '1px solid #91caff',
    borderRadius: '2px',
    backgroundColor: '#cce4ff',
  },
  legendColorBudget: {
    display: 'inline-block',
    width: '14px',
    height: '14px',
    border: '1px solid #ffc53d',
    borderRadius: '2px',
    backgroundColor: '#FFEB3B',
  },
  tableContainer: {
    background: '#fff',
    padding: 0,
    borderRadius: '4px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    overflowX: 'auto',
    overflowY: 'auto',
    maxHeight: 'calc(100vh - 350px)',
  },
  table: {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: 0,
    fontSize: '13px',
    tableLayout: 'fixed',
  },
  // Column header styles
  columnHeader: {
    backgroundColor: '#1677ff',
    color: '#fff',
    padding: '10px 8px',
    border: '1px solid #fff',
    textAlign: 'center',
    fontWeight: 600,
    fontSize: '13px',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  columnHeaderSticky: {
    backgroundColor: '#1677ff',
    color: '#fff',
    padding: '10px 8px',
    border: '1px solid #fff',
    textAlign: 'center',
    fontWeight: 600,
    fontSize: '13px',
    position: 'sticky',
    top: 0,
    left: 0,
    zIndex: 11,
  },
  // Actual row styles (blue)
  actualRow: {
    backgroundColor: '#e6f4ff',
  },
  actualCell: {
    backgroundColor: '#e6f4ff',
    textAlign: 'right',
    fontWeight: 500,
    fontSize: '13px',
    padding: '4px 8px',
    border: '1px solid #ddd',
  },
  actualCellSticky: {
    backgroundColor: '#fff',
    position: 'sticky',
    left: 0,
    zIndex: 5,
    fontWeight: 600,
    fontSize: '13px',
    padding: '6px 8px',
    border: '1px solid #ddd',
    verticalAlign: 'middle',
    textAlign: 'left',
  },
  actualTotalCell: {
    backgroundColor: '#cce4ff',
    textAlign: 'center',
    fontWeight: 700,
    fontSize: '13px',
    padding: '4px 8px',
    border: '1px solid #ddd',
  },
  // Budget row styles (yellow)
  budgetRow: {
    backgroundColor: '#FFFFB8',
  },
  budgetCell: {
    backgroundColor: '#FFFFB8',
    padding: '2px',
    border: '1px solid #ddd',
    verticalAlign: 'middle',
  },
  budgetInput: {
    width: '100%',
    border: 'none',
    padding: '4px 6px',
    textAlign: 'right',
    fontSize: '13px',
    fontWeight: 500,
    backgroundColor: 'transparent',
    outline: 'none',
    boxSizing: 'border-box',
  },
  budgetTotalCell: {
    backgroundColor: '#FFEB3B',
    textAlign: 'center',
    fontWeight: 700,
    fontSize: '13px',
    padding: '4px 8px',
    border: '1px solid #ddd',
  },
  // Custom row styles (for new customers)
  customRow: {
    backgroundColor: '#FFFFB8',
  },
  deleteBtn: {
    background: '#ff4d4f',
    color: '#fff',
    border: 'none',
    padding: '2px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    marginLeft: '4px',
  },
  // Footer totals
  footerActualTotal: {
    backgroundColor: '#cce4ff',
    padding: '6px 8px',
    border: '1px solid #ddd',
    textAlign: 'right',
    fontWeight: 700,
    fontSize: '13px',
  },
  footerBudgetTotal: {
    backgroundColor: '#FFFFB8',
    padding: '6px 8px',
    border: '1px solid #ddd',
    textAlign: 'right',
    fontWeight: 700,
    fontSize: '13px',
  },
  // Recap summary
  recapContainer: {
    background: 'linear-gradient(135deg, #f0f9ff 0%, #e6f4ff 100%)',
    border: '1px solid #91caff',
    borderRadius: '8px',
    padding: '10px 16px',
    marginBottom: '10px',
  },
  recapTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#0958d9',
    marginBottom: '10px',
  },
  recapStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
  },
  recapStat: {
    background: '#fff',
    padding: '12px 16px',
    borderRadius: '6px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  },
  // Add row button
  floatingAddRow: {
    position: 'sticky',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'linear-gradient(transparent, #f5f5f5 30%)',
    padding: '12px 16px',
    display: 'flex',
    justifyContent: 'center',
    zIndex: 100,
  },
  addRowBtn: {
    background: '#1677ff',
    color: '#fff',
    border: 'none',
    padding: '8px 24px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    boxShadow: '0 2px 8px rgba(22, 119, 255, 0.3)',
  },
  // Product Group Breakdown
  pgContainer: {
    background: 'linear-gradient(135deg, #fff9e6 0%, #fffbf0 100%)',
    border: '1px solid #ffc53d',
    borderRadius: '8px',
    padding: '16px 20px',
    marginTop: '12px',
  },
  pgTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#d48806',
    marginBottom: '12px',
  },
  pgTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
    background: '#fff',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  pgTableHeader: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '14px 16px',
    textAlign: 'left',
    fontWeight: 600,
    color: '#fff',
    fontSize: '14px',
  },
  pgTableCell: {
    padding: '14px 16px',
    borderBottom: '1px solid #e8e8e8',
    fontSize: '14px',
  },
};

const LiveBudgetEntryTab = ({ selectedDivision, isActive, message: msgApi, modal }) => {
  // Auth context - check if user is manager/admin to show MoRM rows
  const { user } = useAuth();
  const isManager = user?.role === 'admin' || user?.role === 'manager' || user?.is_manager === true;
  
  // Selection state
  const [salesRepGroups, setSalesRepGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [selectedGroupInfo, setSelectedGroupInfo] = useState(null);
  const [actualYear, setActualYear] = useState(new Date().getFullYear() - 1);
  const [budgetYear, setBudgetYear] = useState(new Date().getFullYear());
  
  // Data state
  const [tableData, setTableData] = useState([]); // Actual rows from API
  const [budgetValues, setBudgetValues] = useState({}); // key: `customer|country|pg|month` -> value
  const [allocationTargets, setAllocationTargets] = useState({}); // PG -> KGS allocation
  const [pricingData, setPricingData] = useState({}); // PG -> { sellingPrice, morm }
  
  // Reference data for dropdowns (Add Customer modal)
  const [customers, setCustomers] = useState([]);
  const [countries, setCountries] = useState([]);
  const [productGroups, setProductGroups] = useState([]);
  
  // Custom rows (new customers added by user - budget only, no actual)
  const [customRows, setCustomRows] = useState([]);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [addCustomerForm] = Form.useForm();
  
  // Loading states
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Status
  const [budgetStatus, setBudgetStatus] = useState('new'); // new, draft, pending_approval, final
  
  // Year options
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  // ============================================================================
  // Load Sales Rep Groups
  // ============================================================================
  useEffect(() => {
    if (selectedDivision && isActive) {
      loadSalesRepGroups();
    }
  }, [selectedDivision, isActive]);

  const loadSalesRepGroups = async () => {
    setLoadingGroups(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/sales-rep-group-allocation/groups`, {
        params: { divisionCode: selectedDivision }
      });
      
      if (response.data.success) {
        setSalesRepGroups(response.data.groups || []);
      }
    } catch (error) {
      console.error('Error loading sales rep groups:', error);
      msgApi?.error('Failed to load sales rep groups');
    } finally {
      setLoadingGroups(false);
    }
  };

  // ============================================================================
  // Load Data for Selected Group
  // ============================================================================
  const loadData = async () => {
    if (!selectedGroupId) {
      msgApi?.warning('Please select a Sales Rep Group first');
      return;
    }
    
    setLoadingData(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/aebf/live-budget/load`, {
        division: selectedDivision,
        groupId: selectedGroupId,
        actualYear,
        budgetYear
      });
      
      if (response.data.success) {
        const data = response.data.data;
        setTableData(data.tableData || []);
        setBudgetValues(data.budgetValues || {});
        setAllocationTargets(data.allocationTargets || {});
        setPricingData(data.pricingData || {});
        setCustomers(data.customers || []);
        setCountries(data.countries || []);
        setProductGroups(data.productGroups || []);
        setCustomRows(data.customRows || []);
        setBudgetStatus(data.status || 'new');
        setSelectedGroupInfo(data.groupInfo || null);
        
        msgApi?.success(`Loaded ${data.tableData?.length || 0} customer rows`);
      }
    } catch (error) {
      console.error('Error loading budget data:', error);
      msgApi?.error('Failed to load budget data: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoadingData(false);
    }
  };

  // ============================================================================
  // Budget Value Handlers
  // ============================================================================
  const handleBudgetChange = useCallback((customer, country, productGroup, month, value) => {
    const key = `${customer}|${country}|${productGroup}|${month}`;
    setBudgetValues(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  const getBudgetValue = useCallback((customer, country, productGroup, month) => {
    const key = `${customer}|${country}|${productGroup}|${month}`;
    return budgetValues[key] || '';
  }, [budgetValues]);

  // ============================================================================
  // Calculate Totals (Volume MT, Amount, Customers) - with monthly amounts
  // ============================================================================
  const totals = useMemo(() => {
    // Actual totals per month (Volume + Amount)
    const actualMonthly = Array(12).fill(0);
    const actualAmountMonthly = Array(12).fill(0);
    let actualTotal = 0;
    let actualAmount = 0;
    const actualCustomers = new Set();
    
    // MoRM totals per month
    const actualMormMonthly = Array(12).fill(0);
    let actualMorm = 0;
    
    tableData.forEach(row => {
      actualCustomers.add(row.customer);
      const pg = (row.productGroup || '').toLowerCase();
      const pricing = pricingData[pg] || { sellingPrice: 0, morm: 0 };
      const price = pricing.sellingPrice || 0;
      const mormPrice = pricing.morm || 0;
      
      for (let m = 1; m <= 12; m++) {
        const val = parseFloat(row.monthlyActual?.[m]) || 0;
        actualMonthly[m - 1] += val;
        actualAmountMonthly[m - 1] += val * 1000 * price; // MT to KG * price
        actualMormMonthly[m - 1] += val * 1000 * mormPrice;
        actualTotal += val;
        actualAmount += val * 1000 * price;
        actualMorm += val * 1000 * mormPrice;
      }
    });
    
    // Budget totals per month (Volume + Amount + MoRM)
    const budgetMonthly = Array(12).fill(0);
    const budgetAmountMonthly = Array(12).fill(0);
    const budgetMormMonthly = Array(12).fill(0);
    let budgetTotal = 0;
    let budgetAmount = 0;
    let budgetMorm = 0;
    const budgetCustomers = new Set();
    
    Object.entries(budgetValues).forEach(([key, value]) => {
      const parts = key.split('|');
      if (parts.length === 4) {
        const [customer, country, productGroup, monthStr] = parts;
        const month = parseInt(monthStr);
        const val = parseFloat(String(value).replace(/,/g, '')) || 0;
        if (val > 0) {
          budgetCustomers.add(customer);
          const pg = productGroup.toLowerCase();
          const pricing = pricingData[pg] || { sellingPrice: 0, morm: 0 };
          const price = pricing.sellingPrice || 0;
          const mormPrice = pricing.morm || 0;
          
          if (month >= 1 && month <= 12) {
            budgetMonthly[month - 1] += val;
            budgetAmountMonthly[month - 1] += val * 1000 * price;
            budgetMormMonthly[month - 1] += val * 1000 * mormPrice;
            budgetTotal += val;
            budgetAmount += val * 1000 * price;
            budgetMorm += val * 1000 * mormPrice;
          }
        }
      }
    });
    
    return { 
      actualMonthly, actualAmountMonthly, actualMormMonthly, actualTotal, actualAmount, actualMorm, actualCustomerCount: actualCustomers.size,
      budgetMonthly, budgetAmountMonthly, budgetMormMonthly, budgetTotal, budgetAmount, budgetMorm, budgetCustomerCount: budgetCustomers.size
    };
  }, [tableData, budgetValues, pricingData]);

  // ============================================================================
  // Group's Customers (for Add Row dropdown - only customers under this group)
  // ============================================================================
  const groupCustomers = useMemo(() => {
    const customerSet = new Set();
    tableData.forEach(row => {
      if (row.customer) customerSet.add(row.customer);
    });
    return Array.from(customerSet).sort();
  }, [tableData]);

  // ============================================================================
  // Product Group Summary
  // ============================================================================
  const pgSummary = useMemo(() => {
    const summary = {};
    
    // Actual by PG
    tableData.forEach(row => {
      const pg = row.productGroup || 'Unknown';
      if (!summary[pg]) summary[pg] = { actual: 0, budget: 0 };
      for (let m = 1; m <= 12; m++) {
        summary[pg].actual += parseFloat(row.monthlyActual?.[m]) || 0;
      }
    });
    
    // Budget by PG
    Object.entries(budgetValues).forEach(([key, value]) => {
      const parts = key.split('|');
      if (parts.length === 4) {
        const pg = parts[2];
        if (!summary[pg]) summary[pg] = { actual: 0, budget: 0 };
        summary[pg].budget += parseFloat(String(value).replace(/,/g, '')) || 0;
      }
    });
    
    return Object.entries(summary).map(([pg, data]) => ({
      productGroup: pg,
      actual: data.actual,
      budget: data.budget,
      variance: data.actual > 0 ? ((data.budget - data.actual) / data.actual * 100) : (data.budget > 0 ? 100 : 0)
    })).sort((a, b) => b.actual - a.actual); // Sort by actual descending (highest to lowest)
  }, [tableData, budgetValues]);

  // ============================================================================
  // Customer Summary (for Customer Breakdown table)
  // ============================================================================
  const customerSummary = useMemo(() => {
    const summary = {};
    
    // Actual by Customer
    tableData.forEach(row => {
      const customer = row.customer || 'Unknown';
      if (!summary[customer]) summary[customer] = { actual: 0, budget: 0 };
      for (let m = 1; m <= 12; m++) {
        summary[customer].actual += parseFloat(row.monthlyActual?.[m]) || 0;
      }
    });
    
    // Budget by Customer
    Object.entries(budgetValues).forEach(([key, value]) => {
      const parts = key.split('|');
      if (parts.length === 4) {
        const customer = parts[0];
        if (!summary[customer]) summary[customer] = { actual: 0, budget: 0 };
        summary[customer].budget += parseFloat(String(value).replace(/,/g, '')) || 0;
      }
    });
    
    return Object.entries(summary).map(([customer, data]) => ({
      customer,
      actual: data.actual,
      budget: data.budget,
      variance: data.actual > 0 ? ((data.budget - data.actual) / data.actual * 100) : (data.budget > 0 ? 100 : 0)
    })).sort((a, b) => b.actual - a.actual); // Sort by actual descending
  }, [tableData, budgetValues]);

  // ============================================================================
  // Add Custom Row
  // ============================================================================
  const handleAddCustomer = () => {
    addCustomerForm.validateFields().then(values => {
      // Handle customer value - could be array from tags mode or string
      let customerName = values.customer;
      if (Array.isArray(customerName)) {
        customerName = customerName[0] || '';
      }
      customerName = String(customerName).trim();
      
      if (!customerName) {
        msgApi?.error('Please enter a customer name');
        return;
      }
      
      const newRow = {
        id: Date.now(),
        customer: customerName,
        country: values.country,
        productGroup: values.productGroup,
        isProspect: values.isProspect || false,
        isCustom: true
      };
      setCustomRows(prev => [...prev, newRow]);
      setShowAddCustomer(false);
      addCustomerForm.resetFields();
      msgApi?.success('Customer row added');
    });
  };

  const handleRemoveCustomRow = (rowId) => {
    setCustomRows(prev => prev.filter(r => r.id !== rowId));
    // Also remove budget values for this row
    setBudgetValues(prev => {
      const row = customRows.find(r => r.id === rowId);
      if (!row) return prev;
      const newValues = { ...prev };
      for (let m = 1; m <= 12; m++) {
        const key = `${row.customer}|${row.country}|${row.productGroup}|${m}`;
        delete newValues[key];
      }
      return newValues;
    });
  };

  // ============================================================================
  // Save Draft
  // ============================================================================
  const handleSaveDraft = async () => {
    if (!selectedGroupId) return;
    
    setSaving(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/aebf/live-budget/save-draft`, {
        division: selectedDivision,
        groupId: selectedGroupId,
        budgetYear,
        budgetValues,
        customRows
      });
      
      if (response.data.success) {
        setBudgetStatus('draft');
        msgApi?.success(`Draft saved: ${response.data.recordCount} records`);
      }
    } catch (error) {
      console.error('Error saving draft:', error);
      msgApi?.error('Failed to save draft: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  // ============================================================================
  // Submit for Review
  // ============================================================================
  const handleSubmitForReview = async () => {
    if (!selectedGroupId) return;
    
    // Validate budget values exist
    const filledValues = Object.values(budgetValues).filter(v => v && parseFloat(String(v).replace(/,/g, '')) > 0);
    if (filledValues.length === 0) {
      msgApi?.warning('Please fill in budget values before submitting');
      return;
    }
    
    Modal.confirm({
      title: 'Submit for Review',
      icon: <ExclamationCircleOutlined />,
      content: `Are you sure you want to submit this budget for review? This will save ${filledValues.length} budget entries.`,
      okText: 'Submit',
      cancelText: 'Cancel',
      onOk: async () => {
        setSubmitting(true);
        try {
          const response = await axios.post(`${API_BASE_URL}/api/aebf/live-budget/submit-for-review`, {
            division: selectedDivision,
            groupId: selectedGroupId,
            budgetYear,
            budgetValues,
            customRows
          });
          
          if (response.data.success) {
            setBudgetStatus('pending_approval');
            msgApi?.success(`Budget submitted: ${response.data.recordCount} records`);
          }
        } catch (error) {
          console.error('Error submitting budget:', error);
          msgApi?.error('Failed to submit: ' + (error.response?.data?.error || error.message));
        } finally {
          setSubmitting(false);
        }
      }
    });
  };

  // ============================================================================
  // Approve Budget (Manager action)
  // ============================================================================
  const handleApprove = async () => {
    if (!selectedGroupId) return;
    
    Modal.confirm({
      title: 'Approve Budget',
      icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
      content: 'Are you sure you want to approve and finalize this budget?',
      okText: 'Approve',
      okType: 'primary',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const response = await axios.post(`${API_BASE_URL}/api/aebf/live-budget/approve`, {
            division: selectedDivision,
            groupId: selectedGroupId,
            budgetYear
          });
          
          if (response.data.success) {
            setBudgetStatus('final');
            msgApi?.success('Budget approved and finalized');
          }
        } catch (error) {
          console.error('Error approving budget:', error);
          msgApi?.error('Failed to approve: ' + (error.response?.data?.error || error.message));
        }
      }
    });
  };

  // ============================================================================
  // Sort table data
  // ============================================================================
  const sortedTableData = useMemo(() => {
    return [...tableData].sort((a, b) => {
      const customerCompare = (a.customer || '').localeCompare(b.customer || '');
      if (customerCompare !== 0) return customerCompare;
      const countryCompare = (a.country || '').localeCompare(b.country || '');
      if (countryCompare !== 0) return countryCompare;
      return (a.productGroup || '').localeCompare(b.productGroup || '');
    });
  }, [tableData]);

  // ============================================================================
  // Calculate row total for budget
  // ============================================================================
  const getRowBudgetTotal = useCallback((customer, country, productGroup) => {
    let total = 0;
    for (let m = 1; m <= 12; m++) {
      const key = `${customer}|${country}|${productGroup}|${m}`;
      const val = parseFloat(String(budgetValues[key] || '').replace(/,/g, '')) || 0;
      total += val;
    }
    return total;
  }, [budgetValues]);

  // ============================================================================
  // RENDER
  // ============================================================================
  if (!isActive) return null;

  return (
    <div style={styles.container}>
      {/* Header with filters */}
      <div style={styles.header}>
        <div style={styles.headerTop}>
          <h1 style={styles.headerTitle}>Budget Planning Form</h1>
          <Space>
            {budgetStatus === 'pending_approval' && (
              <Button 
                type="primary" 
                icon={<CheckCircleOutlined />}
                onClick={handleApprove}
                style={{ background: '#52c41a', borderColor: '#52c41a' }}
              >
                Approve
              </Button>
            )}
            <Button 
              icon={<SaveOutlined />} 
              onClick={handleSaveDraft}
              loading={saving}
              disabled={!selectedGroupId || loadingData}
            >
              Save Draft
            </Button>
            <Button 
              type="primary" 
              icon={<SendOutlined />}
              onClick={handleSubmitForReview}
              loading={submitting}
              disabled={!selectedGroupId || loadingData || budgetStatus === 'final'}
            >
              Save Final
            </Button>
          </Space>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={styles.headerInfo}>
            <div>
              <strong>Group:</strong>{' '}
              <Select
                style={{ width: 200 }}
                placeholder="Select group"
                value={selectedGroupId}
                onChange={(value) => {
                  setSelectedGroupId(value);
                  setTableData([]);
                  setBudgetValues({});
                  setCustomRows([]);
                  setBudgetStatus('new');
                }}
                loading={loadingGroups}
                showSearch
                optionFilterProp="children"
              >
                {salesRepGroups.map(g => (
                  <Option key={g.id} value={g.id}>
                    {g.group_name}
                  </Option>
                ))}
              </Select>
            </div>
            {selectedGroupInfo && (
              <div><strong>Members:</strong> {selectedGroupInfo.members?.join(', ')}</div>
            )}
            <div>
              <strong>Actual Year:</strong>{' '}
              <Select style={{ width: 80 }} value={actualYear} onChange={setActualYear}>
                {yearOptions.map(y => <Option key={y} value={y}>{y}</Option>)}
              </Select>
            </div>
            <div>
              <strong>Budget Year:</strong>{' '}
              <Select style={{ width: 80 }} value={budgetYear} onChange={setBudgetYear}>
                {yearOptions.map(y => <Option key={y} value={y}>{y}</Option>)}
              </Select>
            </div>
            <Button 
              type="primary" 
              icon={<ReloadOutlined />} 
              onClick={loadData}
              loading={loadingData}
              disabled={!selectedGroupId}
            >
              Load Data
            </Button>
          </div>
          
          <div style={styles.headerLegend}>
            <div style={styles.legendItem}>
              <span style={styles.legendColorActual}></span>
              <span>Actual {actualYear} (MT)</span>
            </div>
            <div style={styles.legendItem}>
              <span style={styles.legendColorBudget}></span>
              <span>Budget {budgetYear} (MT)</span>
            </div>
            <span style={{ fontSize: '10px', color: '#8c8c8c' }}>
              * Save Draft to continue later, Save Final to submit
            </span>
          </div>
        </div>
        
        {/* Status badge */}
        {budgetStatus !== 'new' && (
          <div style={{ marginTop: '8px' }}>
            <Tag 
              color={
                budgetStatus === 'draft' ? 'blue' :
                budgetStatus === 'pending_approval' ? 'orange' :
                budgetStatus === 'final' ? 'green' : 'default'
              }
              icon={
                budgetStatus === 'draft' ? <ClockCircleOutlined /> :
                budgetStatus === 'pending_approval' ? <ExclamationCircleOutlined /> :
                budgetStatus === 'final' ? <CheckCircleOutlined /> : null
              }
            >
              {budgetStatus === 'draft' ? 'Draft' :
               budgetStatus === 'pending_approval' ? 'Pending Approval' :
               budgetStatus === 'final' ? 'Finalized' : budgetStatus}
            </Tag>
          </div>
        )}
      </div>

      {/* Management Allocation Targets - Matching HTML Export */}
      {tableData.length > 0 && Object.keys(allocationTargets).length > 0 && (() => {
        const totalAllocationMT = Object.values(allocationTargets).reduce((sum, v) => sum + (parseFloat(v) || 0), 0) / 1000;
        const varianceMT = totals.budgetTotal - totalAllocationMT;
        
        return (
          <div style={{
            background: 'linear-gradient(135deg, #004B93 0%, #0066CC 100%)',
            border: '1px solid #003366',
            borderRadius: '8px',
            padding: '16px 20px',
            marginBottom: '12px',
            boxShadow: '0 2px 6px rgba(0,75,147,0.3)'
          }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📌 Management Allocation Targets (by Product Group)
              {selectedGroupInfo && (
                <span style={{ fontSize: '12px', fontWeight: 'normal', color: 'rgba(255,255,255,0.8)', marginLeft: '8px' }}>
                  Group: {selectedGroupInfo.groupName}
                </span>
              )}
            </div>
            
            {/* Product Group Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', maxHeight: '180px', overflowY: 'auto', marginBottom: '16px' }}>
              {Object.entries(allocationTargets)
                .filter(([_, kgs]) => parseFloat(kgs) > 0)
                .sort((a, b) => (parseFloat(b[1]) || 0) - (parseFloat(a[1]) || 0))
                .map(([pg, kgs]) => (
                  <div key={pg} style={{
                    background: 'rgba(255,255,255,0.15)',
                    padding: '10px 8px',
                    borderRadius: '6px',
                    textAlign: 'center',
                    border: '1px solid rgba(255,255,255,0.3)'
                  }}>
                    <div style={{ fontWeight: 600, color: '#fff', fontSize: '11px', marginBottom: '4px', lineHeight: 1.3 }}>{pg}</div>
                    <div style={{ color: '#FFD700', fontWeight: 700, fontSize: '14px' }}>{(parseFloat(kgs) / 1000).toFixed(2)} MT</div>
                  </div>
                ))
              }
            </div>
            
            {/* Summary Row */}
            <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.3)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase' }}>Total Target Allocation</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#FFD700' }}>{totalAllocationMT.toFixed(2)} MT</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase' }}>Your {actualYear} Actual</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#90EE90' }}>{totals.actualTotal.toFixed(2)} MT</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase' }}>Your Budget (Filled)</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#fff' }}>{totals.budgetTotal.toFixed(2)} MT</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase' }}>Variance vs Target</div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: varianceMT >= 0 ? '#90EE90' : '#ff6b6b' }}>
                  {varianceMT >= 0 ? '+' : ''}{varianceMT.toFixed(2)} MT
                </div>
              </div>
            </div>
            
            {/* Warning */}
            <div style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '4px', color: '#fff', fontSize: '12px' }}>
              ⚠️ Fill in your customer-level budget below. Your total should match the Management Allocation targets shown above.
            </div>
          </div>
        );
      })()}

      {/* Recap Summary - Matching HTML Export exactly */}
      {tableData.length > 0 && (
        <div style={styles.recapContainer}>
          <div style={styles.recapTitle}>📊 Budget vs Actual Summary</div>
          <div style={styles.recapStats}>
            {/* Volume (MT) */}
            <div style={styles.recapStat}>
              <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '13px' }}>📦 Volume (MT)</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ color: '#666', fontSize: '12px' }}>Act: </span>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: '#1890ff' }}>
                    {formatMTDisplay(totals.actualTotal)}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#666', fontSize: '12px' }}>Bud: </span>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: '#d48806' }}>
                    {formatMTDisplay(totals.budgetTotal)}
                  </span>
                </div>
                <span style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  color: totals.budgetTotal >= totals.actualTotal ? '#52c41a' : '#ff4d4f',
                  background: totals.budgetTotal >= totals.actualTotal ? '#f6ffed' : '#fff2f0'
                }}>
                  {totals.actualTotal > 0 
                    ? `${((totals.budgetTotal - totals.actualTotal) / totals.actualTotal * 100).toFixed(1)}%`
                    : totals.budgetTotal > 0 ? '+100%' : '0%'
                  }
                </span>
              </div>
            </div>
            {/* Amount */}
            <div style={styles.recapStat}>
              <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '13px' }}>💰 Amount</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ color: '#666', fontSize: '12px' }}>Act: </span>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: '#1890ff' }}>
                    {totals.actualAmount >= 1000000 
                      ? (totals.actualAmount / 1000000).toFixed(2) + 'M'
                      : totals.actualAmount >= 1000 
                        ? (totals.actualAmount / 1000).toFixed(1) + 'K'
                        : totals.actualAmount.toFixed(0)
                    }
                  </span>
                </div>
                <div>
                  <span style={{ color: '#666', fontSize: '12px' }}>Bud: </span>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: '#d48806' }}>
                    {totals.budgetAmount >= 1000000 
                      ? (totals.budgetAmount / 1000000).toFixed(2) + 'M'
                      : totals.budgetAmount >= 1000 
                        ? (totals.budgetAmount / 1000).toFixed(1) + 'K'
                        : totals.budgetAmount.toFixed(0)
                    }
                  </span>
                </div>
                <span style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  color: totals.budgetAmount >= totals.actualAmount ? '#52c41a' : '#ff4d4f',
                  background: totals.budgetAmount >= totals.actualAmount ? '#f6ffed' : '#fff2f0'
                }}>
                  {totals.actualAmount > 0 
                    ? `${((totals.budgetAmount - totals.actualAmount) / totals.actualAmount * 100).toFixed(1)}%`
                    : totals.budgetAmount > 0 ? '+100%' : '0%'
                  }
                </span>
              </div>
            </div>
            {/* Customers */}
            <div style={styles.recapStat}>
              <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '13px' }}>👥 Customers</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ color: '#666', fontSize: '12px' }}>Act: </span>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: '#1890ff' }}>
                    {totals.actualCustomerCount}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#666', fontSize: '12px' }}>Bud: </span>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: '#d48806' }}>
                    {totals.budgetCustomerCount}
                  </span>
                </div>
                <span style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  color: totals.budgetCustomerCount >= totals.actualCustomerCount ? '#52c41a' : '#ff4d4f',
                  background: totals.budgetCustomerCount >= totals.actualCustomerCount ? '#f6ffed' : '#fff2f0'
                }}>
                  {totals.actualCustomerCount > 0 
                    ? (totals.budgetCustomerCount - totals.actualCustomerCount >= 0 ? '+' : '') + (totals.budgetCustomerCount - totals.actualCustomerCount)
                    : totals.budgetCustomerCount > 0 ? `+${totals.budgetCustomerCount}` : '0'
                  }
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Table */}
      {loadingData ? (
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <Spin size="large" />
          <div style={{ marginTop: '16px', color: '#666' }}>Loading budget data...</div>
        </div>
      ) : tableData.length === 0 && customRows.length === 0 ? (
        <Empty 
          description="Select a Sales Rep Group to start budgeting"
          style={{ padding: '60px' }}
        />
      ) : (
        <>
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <colgroup>
                <col style={{ width: '15%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '10%' }} />
                {Array.from({ length: 12 }, (_, i) => <col key={i} style={{ width: '4.5%' }} />)}
                <col style={{ width: '7%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={styles.columnHeaderSticky}>Customer Name</th>
                  <th style={styles.columnHeader}>Country</th>
                  <th style={styles.columnHeader}>Product Group</th>
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                    <th key={m} style={styles.columnHeader}>{m}</th>
                  ))}
                  <th style={{ ...styles.columnHeader, backgroundColor: '#0958d9' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {/* Actual rows with paired budget rows */}
                {sortedTableData.map((row, idx) => {
                  const rowKey = `${row.customer}|${row.country}|${row.productGroup}`;
                  let actualRowTotal = 0;
                  
                  return (
                    <React.Fragment key={rowKey}>
                      {/* Actual Row (blue) */}
                      <tr style={styles.actualRow}>
                        <td style={styles.actualCellSticky} rowSpan={2}>{row.customer}</td>
                        <td style={{ ...styles.actualCell, textAlign: 'left' }} rowSpan={2}>{row.country}</td>
                        <td style={{ ...styles.actualCell, textAlign: 'left' }} rowSpan={2}>{row.productGroup}</td>
                        {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
                          const val = parseFloat(row.monthlyActual?.[m]) || 0;
                          actualRowTotal += val;
                          return (
                            <td key={m} style={styles.actualCell}>
                              {formatMT(val)}
                            </td>
                          );
                        })}
                        <td style={styles.actualTotalCell}>{formatMTDisplay(actualRowTotal)}</td>
                      </tr>
                      {/* Budget Row (yellow) */}
                      <tr style={styles.budgetRow}>
                        {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                          <td key={m} style={styles.budgetCell}>
                            <input
                              type="text"
                              style={styles.budgetInput}
                              placeholder="0"
                              value={getBudgetValue(row.customer, row.country, row.productGroup, m)}
                              onChange={(e) => handleBudgetChange(row.customer, row.country, row.productGroup, m, e.target.value)}
                              disabled={budgetStatus === 'final'}
                            />
                          </td>
                        ))}
                        <td style={styles.budgetTotalCell}>
                          {formatMTDisplay(getRowBudgetTotal(row.customer, row.country, row.productGroup))}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
                
                {/* Custom Rows (new customers - budget only) */}
                {customRows.map((row) => {
                  const rowKey = `custom-${row.id}`;
                  return (
                    <tr key={rowKey} style={styles.customRow}>
                      <td style={{ ...styles.actualCellSticky, backgroundColor: '#FFFFB8' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ flex: 1 }}>{row.customer}</span>
                          {budgetStatus !== 'final' && (
                            <button 
                              style={styles.deleteBtn}
                              onClick={() => handleRemoveCustomRow(row.id)}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ ...styles.budgetCell, textAlign: 'left', padding: '8px' }}>{row.country}</td>
                      <td style={{ ...styles.budgetCell, textAlign: 'left', padding: '8px' }}>{row.productGroup}</td>
                      {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                        <td key={m} style={styles.budgetCell}>
                          <input
                            type="text"
                            style={styles.budgetInput}
                            placeholder="0"
                            value={getBudgetValue(row.customer, row.country, row.productGroup, m)}
                            onChange={(e) => handleBudgetChange(row.customer, row.country, row.productGroup, m, e.target.value)}
                            disabled={budgetStatus === 'final'}
                          />
                        </td>
                      ))}
                      <td style={styles.budgetTotalCell}>
                        {formatMTDisplay(getRowBudgetTotal(row.customer, row.country, row.productGroup))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {/* Total Actual Volume (MT) */}
                <tr style={{ backgroundColor: '#cce4ff' }}>
                  <td colSpan="3" style={{ ...styles.footerActualTotal, textAlign: 'left', position: 'sticky', left: 0, zIndex: 6 }}>
                    <strong>Total Actual Volume (MT)</strong>
                  </td>
                  {totals.actualMonthly.map((val, idx) => (
                    <td key={idx} style={styles.footerActualTotal}>{formatMTDisplay(val)}</td>
                  ))}
                  <td style={{ ...styles.footerActualTotal, backgroundColor: '#90CAF9', textAlign: 'center' }}>
                    <strong>{formatMTDisplay(totals.actualTotal)}</strong>
                  </td>
                </tr>
                {/* Total Actual Amount */}
                <tr style={{ backgroundColor: '#cce4ff' }}>
                  <td colSpan="3" style={{ ...styles.footerActualTotal, textAlign: 'left', position: 'sticky', left: 0, zIndex: 6 }}>
                    <strong>Total Actual Amount (₿)</strong>
                  </td>
                  {totals.actualAmountMonthly.map((val, idx) => (
                    <td key={idx} style={styles.footerActualTotal}>{formatAmount(val)}</td>
                  ))}
                  <td style={{ ...styles.footerActualTotal, textAlign: 'center' }}>
                    <strong>{formatAmount(totals.actualAmount)}</strong>
                  </td>
                </tr>
                {/* Total Actual MoRM - Only visible for managers */}
                {isManager && (
                  <tr style={{ backgroundColor: '#cce4ff' }}>
                    <td colSpan="3" style={{ ...styles.footerActualTotal, textAlign: 'left', position: 'sticky', left: 0, zIndex: 6 }}>
                      <strong>Total Actual MoRM (₿)</strong>
                    </td>
                    {totals.actualMormMonthly.map((val, idx) => (
                      <td key={idx} style={styles.footerActualTotal}>{formatAmount(val)}</td>
                    ))}
                    <td style={{ ...styles.footerActualTotal, textAlign: 'center' }}>
                      <strong>{formatAmount(totals.actualMorm)}</strong>
                    </td>
                  </tr>
                )}
                {/* Total Budget Volume (MT) */}
                <tr style={{ backgroundColor: '#FFFFB8' }}>
                  <td colSpan="3" style={{ ...styles.footerBudgetTotal, textAlign: 'left', position: 'sticky', left: 0, zIndex: 6 }}>
                    <strong>Total Budget Volume (MT)</strong>
                  </td>
                  {totals.budgetMonthly.map((val, idx) => (
                    <td key={idx} style={styles.footerBudgetTotal}>{formatMTDisplay(val)}</td>
                  ))}
                  <td style={{ ...styles.footerBudgetTotal, backgroundColor: '#FFEB3B', textAlign: 'center' }}>
                    <strong>{formatMTDisplay(totals.budgetTotal)}</strong>
                  </td>
                </tr>
                {/* Total Budget Amount */}
                <tr style={{ backgroundColor: '#FFFFB8' }}>
                  <td colSpan="3" style={{ ...styles.footerBudgetTotal, textAlign: 'left', position: 'sticky', left: 0, zIndex: 6 }}>
                    <strong>Total Budget Amount (₿)</strong>
                  </td>
                  {totals.budgetAmountMonthly.map((val, idx) => (
                    <td key={idx} style={styles.footerBudgetTotal}>{formatAmount(val)}</td>
                  ))}
                  <td style={{ ...styles.footerBudgetTotal, textAlign: 'center' }}>
                    <strong>{formatAmount(totals.budgetAmount)}</strong>
                  </td>
                </tr>
                {/* Total Budget MoRM - Only visible for managers */}
                {isManager && (
                  <tr style={{ backgroundColor: '#FFFFB8' }}>
                    <td colSpan="3" style={{ ...styles.footerBudgetTotal, textAlign: 'left', position: 'sticky', left: 0, zIndex: 6 }}>
                      <strong>Total Budget MoRM (₿)</strong>
                    </td>
                    {totals.budgetMormMonthly.map((val, idx) => (
                      <td key={idx} style={styles.footerBudgetTotal}>{formatAmount(val)}</td>
                    ))}
                    <td style={{ ...styles.footerBudgetTotal, textAlign: 'center' }}>
                      <strong>{formatAmount(totals.budgetMorm)}</strong>
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
          
          {/* Add Row Button */}
          {budgetStatus !== 'final' && (
            <div style={styles.floatingAddRow}>
              <button style={styles.addRowBtn} onClick={() => setShowAddCustomer(true)}>
                + Add New Row
              </button>
            </div>
          )}

          {/* Product Group Summary Table */}
          {pgSummary.length > 0 && (
            <div style={styles.pgContainer}>
              <div style={styles.pgTitle}>📊 Product Group Breakdown: Actual vs Budget (MT)</div>
              
              {/* Bar Chart */}
              <div style={{ background: '#fff', borderRadius: '6px', padding: '16px', marginBottom: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <ReactECharts
                  option={{
                    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                    legend: { 
                      data: [`Actual ${actualYear} (MT)`, `Budget ${budgetYear} (MT)`],
                      top: 0,
                      textStyle: { fontSize: 12 }
                    },
                    grid: { left: 60, right: 20, bottom: 100, top: 50, containLabel: false },
                    xAxis: {
                      type: 'category',
                      data: pgSummary.map(pg => pg.productGroup),
                      axisLabel: { 
                        rotate: 0,
                        fontSize: 12,
                        fontWeight: 500,
                        color: '#333',
                        interval: 0,
                        overflow: 'none',
                        width: 150
                      },
                      axisTick: { alignWithLabel: true },
                      axisLine: { lineStyle: { color: '#333', width: 1 } }
                    },
                    yAxis: {
                      type: 'value',
                      axisLabel: { formatter: '{value} MT', fontSize: 11, color: '#333' },
                      splitLine: { lineStyle: { color: '#eee', type: 'solid' } },
                      axisLine: { show: false },
                      axisTick: { show: false }
                    },
                    series: [
                      {
                        name: `Actual ${actualYear} (MT)`,
                        type: 'bar',
                        data: pgSummary.map(pg => pg.actual.toFixed(2)),
                        itemStyle: { color: 'rgba(24, 144, 255, 0.85)', borderColor: 'rgba(24, 144, 255, 1)', borderWidth: 1 },
                        barGap: '10%',
                        barMaxWidth: 40
                      },
                      {
                        name: `Budget ${budgetYear} (MT)`,
                        type: 'bar',
                        data: pgSummary.map(pg => pg.budget.toFixed(2)),
                        itemStyle: { color: 'rgba(255, 235, 59, 0.85)', borderColor: 'rgba(212, 136, 6, 1)', borderWidth: 1 },
                        barMaxWidth: 40
                      }
                    ]
                  }}
                  style={{ height: '350px', width: '100%' }}
                  opts={{ renderer: 'canvas' }}
                />
              </div>
              
              <table style={styles.pgTable}>
                <thead>
                  <tr>
                    <th style={styles.pgTableHeader}>Product Group</th>
                    <th style={{ ...styles.pgTableHeader, textAlign: 'right' }}>Actual (MT)</th>
                    <th style={{ ...styles.pgTableHeader, textAlign: 'right' }}>Budget (MT)</th>
                    <th style={{ ...styles.pgTableHeader, textAlign: 'right' }}>Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {pgSummary.map((pg, idx) => {
                    const isNew = pg.actual === 0 && pg.budget > 0;
                    return (
                      <tr key={pg.productGroup} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#fafbfc' }}>
                        <td style={{ ...styles.pgTableCell, fontWeight: 600, color: '#333' }}>{pg.productGroup}</td>
                        <td style={{ ...styles.pgTableCell, textAlign: 'right', fontFamily: "'Segoe UI', monospace", fontWeight: 500 }}>
                          {formatMTDisplay(pg.actual)}
                        </td>
                        <td style={{ ...styles.pgTableCell, textAlign: 'right', fontFamily: "'Segoe UI', monospace", fontWeight: 500 }}>
                          {formatMTDisplay(pg.budget)}
                        </td>
                        <td style={{ ...styles.pgTableCell, textAlign: 'right' }}>
                          {isNew ? (
                            <span style={{
                              display: 'inline-block',
                              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                              color: '#fff',
                              padding: '3px 10px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 700
                            }}>NEW</span>
                          ) : (
                            <span style={{ color: pg.variance >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 700 }}>
                              {pg.variance >= 0 ? '+' : ''}{pg.variance.toFixed(1)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot style={{ background: 'linear-gradient(135deg, #f5f7fa 0%, #e4e8eb 100%)', borderTop: '2px solid #667eea' }}>
                  <tr>
                    <td style={{ ...styles.pgTableCell, fontWeight: 700, fontSize: '15px', color: '#333' }}>TOTAL</td>
                    <td style={{ ...styles.pgTableCell, textAlign: 'right', fontWeight: 700, fontSize: '15px', fontFamily: "'Segoe UI', monospace" }}>
                      {formatMTDisplay(totals.actualTotal)}
                    </td>
                    <td style={{ ...styles.pgTableCell, textAlign: 'right', fontWeight: 700, fontSize: '15px', fontFamily: "'Segoe UI', monospace" }}>
                      {formatMTDisplay(totals.budgetTotal)}
                    </td>
                    <td style={{ 
                      ...styles.pgTableCell, 
                      textAlign: 'right',
                      fontWeight: 700,
                      fontSize: '15px',
                      color: totals.budgetTotal >= totals.actualTotal ? '#52c41a' : '#ff4d4f'
                    }}>
                      {totals.actualTotal > 0 
                        ? `${totals.budgetTotal >= totals.actualTotal ? '+' : ''}${((totals.budgetTotal - totals.actualTotal) / totals.actualTotal * 100).toFixed(1)}%`
                        : totals.budgetTotal > 0 ? '+100%' : '0%'
                      }
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Customer Summary Table - Matching HTML Export */}
          {customerSummary.length > 0 && (
            <div style={{ ...styles.pgContainer, marginTop: '16px' }}>
              <div style={styles.pgTitle}>📋 Customer Breakdown: Actual vs Budget (MT)</div>
              <table style={styles.pgTable}>
                <thead>
                  <tr>
                    <th style={styles.pgTableHeader}>Customer</th>
                    <th style={{ ...styles.pgTableHeader, textAlign: 'right' }}>Actual (MT)</th>
                    <th style={{ ...styles.pgTableHeader, textAlign: 'right' }}>Budget (MT)</th>
                    <th style={{ ...styles.pgTableHeader, textAlign: 'right' }}>Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {customerSummary.map((cust, idx) => {
                    const isNew = cust.actual === 0 && cust.budget > 0;
                    return (
                      <tr key={cust.customer} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#fafbfc' }}>
                        <td style={{ ...styles.pgTableCell, fontWeight: 600, color: '#333' }}>{cust.customer}</td>
                        <td style={{ ...styles.pgTableCell, textAlign: 'right', fontFamily: "'Segoe UI', monospace", fontWeight: 500 }}>
                          {formatMTDisplay(cust.actual)}
                        </td>
                        <td style={{ ...styles.pgTableCell, textAlign: 'right', fontFamily: "'Segoe UI', monospace", fontWeight: 500 }}>
                          {formatMTDisplay(cust.budget)}
                        </td>
                        <td style={{ ...styles.pgTableCell, textAlign: 'right' }}>
                          {isNew ? (
                            <span style={{
                              display: 'inline-block',
                              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                              color: '#fff',
                              padding: '3px 10px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 700
                            }}>NEW</span>
                          ) : (
                            <span style={{ color: cust.variance >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 700 }}>
                              {cust.variance >= 0 ? '+' : ''}{cust.variance.toFixed(1)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot style={{ background: 'linear-gradient(135deg, #f5f7fa 0%, #e4e8eb 100%)', borderTop: '2px solid #667eea' }}>
                  <tr>
                    <td style={{ ...styles.pgTableCell, fontWeight: 700, fontSize: '15px', color: '#333' }}>TOTAL</td>
                    <td style={{ ...styles.pgTableCell, textAlign: 'right', fontWeight: 700, fontSize: '15px', fontFamily: "'Segoe UI', monospace" }}>
                      {formatMTDisplay(totals.actualTotal)}
                    </td>
                    <td style={{ ...styles.pgTableCell, textAlign: 'right', fontWeight: 700, fontSize: '15px', fontFamily: "'Segoe UI', monospace" }}>
                      {formatMTDisplay(totals.budgetTotal)}
                    </td>
                    <td style={{ 
                      ...styles.pgTableCell, 
                      textAlign: 'right',
                      fontWeight: 700,
                      fontSize: '15px',
                      color: totals.budgetTotal >= totals.actualTotal ? '#52c41a' : '#ff4d4f'
                    }}>
                      {totals.actualTotal > 0 
                        ? `${totals.budgetTotal >= totals.actualTotal ? '+' : ''}${((totals.budgetTotal - totals.actualTotal) / totals.actualTotal * 100).toFixed(1)}%`
                        : totals.budgetTotal > 0 ? '+100%' : '0%'
                      }
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}

      {/* Add Customer Modal */}
      <Modal
        title="Add New Customer Row"
        open={showAddCustomer}
        onOk={handleAddCustomer}
        onCancel={() => { setShowAddCustomer(false); addCustomerForm.resetFields(); }}
        okText="Add"
      >
        <Form form={addCustomerForm} layout="vertical">
          <Form.Item 
            name="customer" 
            label="Customer Name" 
            rules={[{ required: true, message: 'Please enter or select customer' }]}
            extra="Type a NEW customer name or select from existing"
          >
            <AutoComplete
              options={groupCustomers.map(c => ({ value: c, label: c }))}
              placeholder="Type new customer name or select existing"
              filterOption={(inputValue, option) =>
                option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
              }
              allowClear
            >
              <Input placeholder="Type new customer name or select existing" />
            </AutoComplete>
          </Form.Item>
          <Form.Item 
            name="country" 
            label="Country" 
            rules={[{ required: true, message: 'Please select country' }]}
          >
            <Select showSearch placeholder="Select country" optionFilterProp="children">
              {countries.map(c => <Option key={c} value={c}>{c}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item 
            name="productGroup" 
            label="Product Group" 
            rules={[{ required: true, message: 'Please select product group' }]}
          >
            <Select showSearch placeholder="Select product group" optionFilterProp="children">
              {productGroups.map(pg => <Option key={pg} value={pg}>{pg}</Option>)}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default LiveBudgetEntryTab;
