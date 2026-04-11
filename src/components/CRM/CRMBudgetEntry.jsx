/**
 * CRMBudgetEntry - Sales Rep Personal Budget Entry Form
 * 
 * TWIN of LiveBudgetEntryTab but for individual sales reps in CRM
 * - Automatically loads the logged-in sales rep's own group
 * - Same table structure: Actual row + Budget row paired with rowspan
 * - Same styling: Blue for actual, Yellow for budget
 * - HIDDEN: MoRM footer rows (not visible to sales reps)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card, Row, Col, Select, Button, Space, Tag, Spin, Empty, Modal, Form,
  message, Alert, Tooltip, Typography, AutoComplete, Input
} from 'antd';
import {
  SaveOutlined, SendOutlined, ReloadOutlined, PlusOutlined,
  DeleteOutlined, CheckCircleOutlined, ClockCircleOutlined,
  TeamOutlined, ExclamationCircleOutlined, ArrowLeftOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';

const { Option } = Select;
const { Title, Text } = Typography;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * Format number with 2 decimal places and thousands separator
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
  if (val === null || val === undefined || isNaN(parseFloat(val))) return '0';
  const num = parseFloat(String(val).replace(/,/g, ''));
  if (Math.abs(num) >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M';
  }
  return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

// Month names
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Styles matching HTML export
const styles = {
  container: {
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    fontSize: '12px',
    color: '#333',
    background: '#f4f5f6',
    minHeight: '100vh',
    padding: '16px 20px'
  },
  header: {
    background: 'linear-gradient(145deg, #1a5276 0%, #154360 50%, #0e2f44 100%)',
    color: 'white',
    padding: '16px 20px',
    borderRadius: '8px 8px 0 0',
    marginBottom: 0
  },
  headerTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px'
  },
  headerTitle: {
    fontSize: '22px',
    fontWeight: 700,
    margin: 0,
    color: '#fff',
    textShadow: '0 1px 3px rgba(0,0,0,0.2)'
  },
  infoPanel: {
    background: 'rgba(255,255,255,0.08)',
    padding: '12px 16px',
    borderRadius: '6px',
    marginTop: '12px'
  },
  infoPanelLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: '11px',
    marginBottom: '2px'
  },
  infoPanelValue: {
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600
  },
  tableWrap: {
    overflowX: 'auto',
    background: '#fff',
    borderRadius: '0 0 8px 8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '11px',
    fontFamily: "'Segoe UI', Arial, sans-serif"
  },
  thBase: {
    background: 'linear-gradient(180deg, #4a6fa5 0%, #3d5a80 100%)',
    color: 'white',
    fontWeight: 600,
    padding: '8px 6px',
    textAlign: 'center',
    borderBottom: '2px solid #2c3e50',
    fontSize: '11px',
    whiteSpace: 'nowrap'
  },
  thSticky: {
    position: 'sticky',
    left: 0,
    zIndex: 10,
    background: 'linear-gradient(180deg, #4a6fa5 0%, #3d5a80 100%)'
  },
  tdBase: {
    padding: '5px 6px',
    borderBottom: '1px solid #e0e0e0',
    textAlign: 'right',
    fontSize: '11px',
    fontFamily: "'Segoe UI', Tahoma, sans-serif"
  },
  cellActual: {
    background: '#e8f4fc',
    color: '#1a5276',
    fontWeight: 600
  },
  cellBudget: {
    background: '#fffde7'
  },
  inputBudget: {
    width: '68px',
    padding: '3px 4px',
    border: '1px solid #ddd',
    borderRadius: '3px',
    textAlign: 'right',
    fontSize: '11px',
    fontFamily: "'Segoe UI', Tahoma, sans-serif",
    background: '#fffef5',
    transition: 'border-color 0.2s, box-shadow 0.2s'
  },
  rowLabel: {
    textAlign: 'left',
    fontWeight: 600,
    color: '#1a5276',
    background: '#f0f7fb',
    padding: '5px 8px',
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderRight: '2px solid #3d5a80'
  },
  stickyCol: {
    position: 'sticky',
    left: 0,
    zIndex: 5,
    background: 'inherit'
  },
  customerCell: {
    position: 'sticky',
    left: 0,
    background: '#fff',
    zIndex: 5,
    fontWeight: 600,
    color: '#2c3e50',
    borderRight: '2px solid #3d5a80',
    textAlign: 'left',
    whiteSpace: 'nowrap'
  },
  recapContainer: {
    marginTop: '16px',
    background: 'linear-gradient(145deg, #f8f9fa 0%, #e9ecef 100%)',
    borderRadius: '8px',
    padding: '16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
  },
  recapTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#2c3e50',
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  recapBox: {
    background: '#fff',
    borderRadius: '6px',
    padding: '12px',
    textAlign: 'center',
    border: '1px solid #e0e0e0',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
  },
  recapLabel: {
    fontSize: '10px',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '4px'
  },
  recapValue: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#1a5276'
  },
  recapSubValue: {
    fontSize: '11px',
    color: '#888',
    marginTop: '2px'
  },
  pgContainer: {
    marginTop: '16px',
    background: '#fff',
    borderRadius: '8px',
    padding: '16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
  },
  pgTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#2c3e50',
    marginBottom: '12px'
  },
  pgTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '11px'
  },
  pgTableHeader: {
    background: '#f5f5f5',
    padding: '8px 10px',
    fontWeight: 600,
    borderBottom: '2px solid #ddd',
    textAlign: 'left'
  },
  pgTableCell: {
    padding: '6px 10px',
    borderBottom: '1px solid #eee'
  },
  addRowBtn: {
    background: 'linear-gradient(145deg, #27ae60 0%, #219a52 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '8px 16px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  footerRow: {
    fontWeight: 700,
    background: '#f8f9fa'
  },
  footerCell: {
    padding: '8px 6px',
    borderTop: '2px solid #3d5a80',
    fontSize: '11px',
    fontWeight: 700
  },
  allocationBox: {
    background: 'linear-gradient(145deg, #e3f2fd 0%, #bbdefb 100%)',
    borderRadius: '8px',
    padding: '16px',
    marginTop: '16px',
    border: '1px solid #90caf9'
  },
  allocationTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#1565c0',
    marginBottom: '10px'
  },
  allocationGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px'
  },
  allocationItem: {
    background: '#fff',
    borderRadius: '6px',
    padding: '10px',
    textAlign: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
  },
  allocationLabel: {
    fontSize: '10px',
    color: '#666',
    textTransform: 'uppercase',
    marginBottom: '4px'
  },
  allocationValue: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#1565c0'
  }
};

// ============================================================================
// COMPONENT
// ============================================================================
const CRMBudgetEntry = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [msgApi, msgContextHolder] = message.useMessage();
  
  // Year settings
  const currentYear = new Date().getFullYear();
  const [actualYear] = useState(currentYear);
  const [budgetYear] = useState(currentYear + 1);
  
  // Sales rep group info (auto-loaded from user)
  const [salesRepGroup, setSalesRepGroup] = useState(null);
  const [selectedDivision, setSelectedDivision] = useState('');
  
  // Main data
  const [tableData, setTableData] = useState([]);
  const [budgetValues, setBudgetValues] = useState({});
  const [allocationTargets, setAllocationTargets] = useState({});
  const [pricingData, setPricingData] = useState({});
  
  // Reference data for dropdowns
  const [countries, setCountries] = useState([]);
  const [productGroups, setProductGroups] = useState([]);
  
  // Custom rows
  const [customRows, setCustomRows] = useState([]);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [addCustomerForm] = Form.useForm();
  
  // Loading states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Status
  const [budgetStatus, setBudgetStatus] = useState('new');

  // ============================================================================
  // Load Sales Rep Group Info on Mount
  // ============================================================================
  useEffect(() => {
    const loadSalesRepGroup = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('auth_token');
        const response = await axios.get(`${API_BASE_URL}/api/crm/my-customers`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.data?.data?.salesRep) {
          const salesRep = response.data.data.salesRep;
          setSalesRepGroup(salesRep);
          // Set division from sales rep info
          setSelectedDivision(salesRep.division || 'FP');
          
          // Now load budget data
          await loadBudgetData(salesRep);
        } else {
          msgApi?.warning('Sales rep group not found. Please contact admin.');
        }
      } catch (error) {
        console.error('Error loading sales rep info:', error);
        msgApi?.error('Failed to load your budget data');
      } finally {
        setLoading(false);
      }
    };
    
    loadSalesRepGroup();
  }, []);

  // ============================================================================
  // Load Budget Data for Sales Rep
  // ============================================================================
  const loadBudgetData = async (salesRepInfo) => {
    if (!salesRepInfo?.id) return;
    
    try {
      const response = await axios.post(`${API_BASE_URL}/api/aebf/live-budget/load`, {
        division: salesRepInfo.division || 'FP',
        groupId: salesRepInfo.id,
        actualYear,
        budgetYear
      });
      
      if (response.data.success) {
        const data = response.data.data;
        setTableData(data.tableData || []);
        setBudgetValues(data.budgetValues || {});
        setAllocationTargets(data.allocationTargets || {});
        setPricingData(data.pricingData || {});
        setCountries(data.countries || []);
        setProductGroups(data.productGroups || []);
        setCustomRows(data.customRows || []);
        setBudgetStatus(data.status || 'new');
        
        msgApi?.success(`Loaded ${data.tableData?.length || 0} customer rows`);
      }
    } catch (error) {
      console.error('Error loading budget data:', error);
      msgApi?.error('Failed to load budget data');
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

  // ============================================================================
  // Calculate Totals
  // ============================================================================
  const totals = useMemo(() => {
    const actualMonthly = {};
    const actualAmountMonthly = {};
    const budgetMonthly = {};
    const budgetAmountMonthly = {};
    let actualTotal = 0;
    let actualAmount = 0;
    let budgetTotal = 0;
    let budgetAmount = 0;
    const actualCustomers = new Set();
    const budgetCustomers = new Set();
    
    for (let m = 1; m <= 12; m++) {
      actualMonthly[m] = 0;
      actualAmountMonthly[m] = 0;
      budgetMonthly[m] = 0;
      budgetAmountMonthly[m] = 0;
    }
    
    tableData.forEach(row => {
      const price = pricingData[row.productGroup]?.sellingPrice || 1;
      for (let m = 1; m <= 12; m++) {
        const actual = parseFloat(row.monthlyActual?.[m]) || 0;
        actualMonthly[m] += actual;
        actualAmountMonthly[m] += actual * price;
        actualTotal += actual;
        actualAmount += actual * price;
        if (actual > 0) actualCustomers.add(row.customer);
      }
    });
    
    Object.entries(budgetValues).forEach(([key, value]) => {
      const parts = key.split('|');
      if (parts.length === 4) {
        const customer = parts[0];
        const pg = parts[2];
        const month = parseInt(parts[3]);
        const val = parseFloat(String(value).replace(/,/g, '')) || 0;
        const price = pricingData[pg]?.sellingPrice || 1;
        
        budgetMonthly[month] = (budgetMonthly[month] || 0) + val;
        budgetAmountMonthly[month] = (budgetAmountMonthly[month] || 0) + (val * price);
        budgetTotal += val;
        budgetAmount += val * price;
        if (val > 0) budgetCustomers.add(customer);
      }
    });
    
    return { 
      actualMonthly, actualAmountMonthly, actualTotal, actualAmount, actualCustomerCount: actualCustomers.size,
      budgetMonthly, budgetAmountMonthly, budgetTotal, budgetAmount, budgetCustomerCount: budgetCustomers.size
    };
  }, [tableData, budgetValues, pricingData]);

  // ============================================================================
  // Group's Customers (for Add Row dropdown)
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
    
    tableData.forEach(row => {
      const pg = row.productGroup || 'Unknown';
      if (!summary[pg]) summary[pg] = { actual: 0, budget: 0 };
      for (let m = 1; m <= 12; m++) {
        summary[pg].actual += parseFloat(row.monthlyActual?.[m]) || 0;
      }
    });
    
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
    })).sort((a, b) => b.actual - a.actual);
  }, [tableData, budgetValues]);

  // ============================================================================
  // Customer Summary
  // ============================================================================
  const customerSummary = useMemo(() => {
    const summary = {};
    
    tableData.forEach(row => {
      const customer = row.customer || 'Unknown';
      if (!summary[customer]) summary[customer] = { actual: 0, budget: 0 };
      for (let m = 1; m <= 12; m++) {
        summary[customer].actual += parseFloat(row.monthlyActual?.[m]) || 0;
      }
    });
    
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
    })).sort((a, b) => b.actual - a.actual);
  }, [tableData, budgetValues]);

  // ============================================================================
  // Save Draft
  // ============================================================================
  const handleSaveDraft = async () => {
    if (!salesRepGroup?.id) return;
    
    setSaving(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/aebf/live-budget/save-draft`, {
        division: selectedDivision,
        groupId: salesRepGroup.id,
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
      msgApi?.error('Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  // ============================================================================
  // Submit for Review
  // ============================================================================
  const handleSubmit = async () => {
    if (!salesRepGroup?.id) return;
    
    Modal.confirm({
      title: 'Submit Budget for Review',
      icon: <ExclamationCircleOutlined />,
      content: 'Once submitted, the budget will be sent to management for review. You can still make changes until approved.',
      okText: 'Submit',
      cancelText: 'Cancel',
      onOk: async () => {
        setSubmitting(true);
        try {
          const response = await axios.post(`${API_BASE_URL}/api/aebf/live-budget/submit-for-review`, {
            division: selectedDivision,
            groupId: salesRepGroup.id,
            budgetYear,
            budgetValues,
            customRows
          });
          
          if (response.data.success) {
            setBudgetStatus('pending_approval');
            msgApi?.success(`Budget submitted for review: ${response.data.recordCount} records`);
          }
        } catch (error) {
          console.error('Error submitting budget:', error);
          msgApi?.error('Failed to submit');
        } finally {
          setSubmitting(false);
        }
      }
    });
  };

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
    const newBudgetValues = { ...budgetValues };
    Object.keys(newBudgetValues).forEach(key => {
      if (key.startsWith(`${rowId}|`)) delete newBudgetValues[key];
    });
    setBudgetValues(newBudgetValues);
    msgApi?.info('Row removed');
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
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" tip="Loading your budget data..." />
      </div>
    );
  }

  if (!salesRepGroup) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <Empty 
          description="Sales rep group not found. Please contact administrator."
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
        <Button type="primary" onClick={() => navigate('/crm')} style={{ marginTop: 16 }}>
          Back to CRM
        </Button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {msgContextHolder}
      
      {/* Back button */}
      <Button 
        type="text" 
        icon={<ArrowLeftOutlined />} 
        onClick={() => navigate('/crm')}
        style={{ marginBottom: 12, color: '#1a5276', fontWeight: 600 }}
      >
        Back to CRM
      </Button>
      
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTop}>
          <h1 style={styles.headerTitle}>📋 My Budget Planning Form</h1>
          <Space>
            <Button 
              icon={<SaveOutlined />} 
              onClick={handleSaveDraft}
              loading={saving}
              disabled={loading}
              style={{ background: '#52c41a', borderColor: '#52c41a', color: '#fff' }}
            >
              Save Draft
            </Button>
            <Button 
              type="primary"
              icon={<SendOutlined />} 
              onClick={handleSubmit}
              loading={submitting}
              disabled={loading || budgetStatus === 'pending_approval'}
              style={{ background: '#1890ff', borderColor: '#1890ff' }}
            >
              Submit for Review
            </Button>
          </Space>
        </div>
        
        {/* Info Panel */}
        <div style={styles.infoPanel}>
          <Row gutter={24}>
            <Col span={8}>
              <div style={styles.infoPanelLabel}>Sales Rep Group</div>
              <div style={styles.infoPanelValue}>{salesRepGroup?.name || '-'}</div>
            </Col>
            <Col span={8}>
              <div style={styles.infoPanelLabel}>Division</div>
              <div style={styles.infoPanelValue}>{selectedDivision}</div>
            </Col>
            <Col span={8}>
              <div style={styles.infoPanelLabel}>Budget Year</div>
              <div style={styles.infoPanelValue}>{budgetYear}</div>
            </Col>
          </Row>
          <Row gutter={24} style={{ marginTop: 8 }}>
            <Col span={8}>
              <div style={styles.infoPanelLabel}>Status</div>
              <Tag color={
                budgetStatus === 'final' ? 'green' :
                budgetStatus === 'pending_approval' ? 'gold' :
                budgetStatus === 'draft' ? 'blue' : 'default'
              } style={{ marginTop: 2 }}>
                {budgetStatus === 'final' ? 'Approved' :
                 budgetStatus === 'pending_approval' ? 'Pending Approval' :
                 budgetStatus === 'draft' ? 'Draft' : 'Not Started'}
              </Tag>
            </Col>
            <Col span={8}>
              <div style={styles.infoPanelLabel}>Actual Year</div>
              <div style={styles.infoPanelValue}>{actualYear}</div>
            </Col>
            <Col span={8}>
              <div style={styles.infoPanelLabel}>Rows</div>
              <div style={styles.infoPanelValue}>{tableData.length + customRows.length}</div>
            </Col>
          </Row>
        </div>
      </div>

      {/* Main Table */}
      <div style={styles.tableWrap}>
        {tableData.length === 0 && customRows.length === 0 ? (
          <Empty 
            description="No actual data found for this sales rep group"
            style={{ padding: '40px' }}
          />
        ) : (
          <>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.thBase, ...styles.thSticky, width: '220px', textAlign: 'left' }}>
                    Customer / Country / PG
                  </th>
                  <th style={{ ...styles.thBase, width: '55px' }}>Type</th>
                  {MONTHS.map((m, i) => (
                    <th key={i} style={{ ...styles.thBase, width: '75px' }}>{m}</th>
                  ))}
                  <th style={{ ...styles.thBase, width: '85px', background: '#2c3e50' }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {sortedTableData.map((row, rowIdx) => {
                  const rowActualTotal = Object.values(row.monthlyActual || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
                  const rowBudgetTotal = getRowBudgetTotal(row.customer, row.country, row.productGroup);
                  const isFirstOfCustomer = rowIdx === 0 || sortedTableData[rowIdx - 1].customer !== row.customer;
                  const customerRowCount = sortedTableData.filter(r => r.customer === row.customer).length;
                  
                  return (
                    <React.Fragment key={`${row.customer}-${row.country}-${row.productGroup}`}>
                      {/* Actual Row */}
                      <tr>
                        {isFirstOfCustomer && (
                          <td 
                            rowSpan={customerRowCount * 2}
                            style={styles.customerCell}
                          >
                            <div style={{ fontWeight: 600, fontSize: '11px' }}>{row.customer}</div>
                            <div style={{ fontSize: '10px', color: '#666' }}>{row.country}</div>
                            <div style={{ fontSize: '9px', color: '#888', fontStyle: 'italic' }}>{row.productGroup}</div>
                          </td>
                        )}
                        <td style={{ ...styles.tdBase, ...styles.cellActual, ...styles.rowLabel }}>
                          ACT {actualYear}
                        </td>
                        {MONTHS.map((_, m) => (
                          <td key={m} style={{ ...styles.tdBase, ...styles.cellActual }}>
                            {formatMT(row.monthlyActual?.[m + 1])}
                          </td>
                        ))}
                        <td style={{ ...styles.tdBase, ...styles.cellActual, fontWeight: 700, background: '#d4edfc' }}>
                          {formatMTDisplay(rowActualTotal)}
                        </td>
                      </tr>
                      
                      {/* Budget Row */}
                      <tr>
                        <td style={{ ...styles.tdBase, ...styles.cellBudget, ...styles.rowLabel, color: '#8b6914' }}>
                          BUD {budgetYear}
                        </td>
                        {MONTHS.map((_, m) => {
                          const key = `${row.customer}|${row.country}|${row.productGroup}|${m + 1}`;
                          return (
                            <td key={m} style={{ ...styles.tdBase, ...styles.cellBudget }}>
                              <input
                                type="text"
                                style={styles.inputBudget}
                                value={budgetValues[key] || ''}
                                onChange={(e) => handleBudgetChange(row.customer, row.country, row.productGroup, m + 1, e.target.value)}
                                placeholder="0.00"
                              />
                            </td>
                          );
                        })}
                        <td style={{ ...styles.tdBase, ...styles.cellBudget, fontWeight: 700, background: '#fff8dc', color: '#8b6914' }}>
                          {formatMTDisplay(rowBudgetTotal)}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}

                {/* Custom Rows */}
                {customRows.map((row) => {
                  const rowBudgetTotal = getRowBudgetTotal(row.customer, row.country, row.productGroup);
                  return (
                    <React.Fragment key={row.id}>
                      <tr style={{ background: '#f0fff0' }}>
                        <td style={styles.customerCell}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Tag color="green" style={{ fontSize: '9px', margin: 0 }}>NEW</Tag>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '11px' }}>{row.customer}</div>
                              <div style={{ fontSize: '10px', color: '#666' }}>{row.country}</div>
                              <div style={{ fontSize: '9px', color: '#888', fontStyle: 'italic' }}>{row.productGroup}</div>
                            </div>
                            <Button 
                              type="text" 
                              icon={<DeleteOutlined />} 
                              size="small"
                              danger
                              onClick={() => handleRemoveCustomRow(row.id)}
                              style={{ marginLeft: 'auto' }}
                            />
                          </div>
                        </td>
                        <td style={{ ...styles.tdBase, ...styles.cellActual, ...styles.rowLabel }}>
                          ACT {actualYear}
                        </td>
                        {MONTHS.map((_, m) => (
                          <td key={m} style={{ ...styles.tdBase, ...styles.cellActual, color: '#999' }}>-</td>
                        ))}
                        <td style={{ ...styles.tdBase, ...styles.cellActual, fontWeight: 700, color: '#999' }}>-</td>
                      </tr>
                      <tr style={{ background: '#fffff0' }}>
                        <td style={{ display: 'none' }}></td>
                        <td style={{ ...styles.tdBase, ...styles.cellBudget, ...styles.rowLabel, color: '#8b6914' }}>
                          BUD {budgetYear}
                        </td>
                        {MONTHS.map((_, m) => {
                          const key = `${row.customer}|${row.country}|${row.productGroup}|${m + 1}`;
                          return (
                            <td key={m} style={{ ...styles.tdBase, ...styles.cellBudget }}>
                              <input
                                type="text"
                                style={styles.inputBudget}
                                value={budgetValues[key] || ''}
                                onChange={(e) => handleBudgetChange(row.customer, row.country, row.productGroup, m + 1, e.target.value)}
                                placeholder="0.00"
                              />
                            </td>
                          );
                        })}
                        <td style={{ ...styles.tdBase, ...styles.cellBudget, fontWeight: 700, background: '#fff8dc', color: '#8b6914' }}>
                          {formatMTDisplay(rowBudgetTotal)}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}

                {/* Footer Rows - NO MoRM for Sales Reps */}
                {/* Row 1: Total Actual Volume */}
                <tr style={styles.footerRow}>
                  <td style={{ ...styles.footerCell, textAlign: 'left', fontWeight: 700 }}>TOTAL VOLUME</td>
                  <td style={{ ...styles.footerCell, ...styles.cellActual, ...styles.rowLabel }}>ACT {actualYear}</td>
                  {MONTHS.map((_, m) => (
                    <td key={m} style={{ ...styles.footerCell, ...styles.cellActual, textAlign: 'right' }}>
                      {formatMTDisplay(totals.actualMonthly[m + 1])}
                    </td>
                  ))}
                  <td style={{ ...styles.footerCell, ...styles.cellActual, textAlign: 'right', background: '#c8e6f5' }}>
                    {formatMTDisplay(totals.actualTotal)}
                  </td>
                </tr>
                
                {/* Row 2: Total Budget Volume */}
                <tr style={styles.footerRow}>
                  <td style={{ ...styles.footerCell, textAlign: 'left' }}></td>
                  <td style={{ ...styles.footerCell, ...styles.cellBudget, ...styles.rowLabel, color: '#8b6914' }}>BUD {budgetYear}</td>
                  {MONTHS.map((_, m) => (
                    <td key={m} style={{ ...styles.footerCell, ...styles.cellBudget, textAlign: 'right' }}>
                      {formatMTDisplay(totals.budgetMonthly[m + 1])}
                    </td>
                  ))}
                  <td style={{ ...styles.footerCell, ...styles.cellBudget, textAlign: 'right', background: '#fff0a0', color: '#8b6914' }}>
                    {formatMTDisplay(totals.budgetTotal)}
                  </td>
                </tr>
                
                {/* Row 3: Total Actual Amount */}
                <tr style={styles.footerRow}>
                  <td style={{ ...styles.footerCell, textAlign: 'left', fontWeight: 700 }}>TOTAL AMOUNT</td>
                  <td style={{ ...styles.footerCell, ...styles.cellActual, ...styles.rowLabel }}>ACT {actualYear}</td>
                  {MONTHS.map((_, m) => (
                    <td key={m} style={{ ...styles.footerCell, ...styles.cellActual, textAlign: 'right' }}>
                      {formatAmount(totals.actualAmountMonthly[m + 1])}
                    </td>
                  ))}
                  <td style={{ ...styles.footerCell, ...styles.cellActual, textAlign: 'right', background: '#c8e6f5' }}>
                    {formatAmount(totals.actualAmount)}
                  </td>
                </tr>
                
                {/* Row 4: Total Budget Amount */}
                <tr style={styles.footerRow}>
                  <td style={{ ...styles.footerCell, textAlign: 'left' }}></td>
                  <td style={{ ...styles.footerCell, ...styles.cellBudget, ...styles.rowLabel, color: '#8b6914' }}>BUD {budgetYear}</td>
                  {MONTHS.map((_, m) => (
                    <td key={m} style={{ ...styles.footerCell, ...styles.cellBudget, textAlign: 'right' }}>
                      {formatAmount(totals.budgetAmountMonthly[m + 1])}
                    </td>
                  ))}
                  <td style={{ ...styles.footerCell, ...styles.cellBudget, textAlign: 'right', background: '#fff0a0', color: '#8b6914' }}>
                    {formatAmount(totals.budgetAmount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {/* Add Row Button */}
        {tableData.length > 0 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #eee' }}>
            <button style={styles.addRowBtn} onClick={() => setShowAddCustomer(true)}>
              <PlusOutlined /> Add Customer Row
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
                      <td style={styles.pgTableCell}>
                        {pg.productGroup}
                        {isNew && (
                          <Tag 
                            color="green" 
                            style={{ 
                              marginLeft: '8px', 
                              fontSize: '9px', 
                              padding: '0 4px', 
                              lineHeight: '16px',
                              fontWeight: 700,
                              borderRadius: '3px'
                            }}
                          >
                            NEW
                          </Tag>
                        )}
                      </td>
                      <td style={{ ...styles.pgTableCell, textAlign: 'right', color: '#1890ff', fontWeight: 600 }}>
                        {formatMTDisplay(pg.actual)}
                      </td>
                      <td style={{ ...styles.pgTableCell, textAlign: 'right', color: '#d48806', fontWeight: 600 }}>
                        {formatMTDisplay(pg.budget)}
                      </td>
                      <td style={{ 
                        ...styles.pgTableCell, 
                        textAlign: 'right', 
                        color: pg.variance > 0 ? '#52c41a' : pg.variance < 0 ? '#f5222d' : '#666',
                        fontWeight: 600
                      }}>
                        {isNew ? (
                          <Tag color="green" style={{ fontSize: '9px', padding: '0 4px', fontWeight: 700 }}>NEW</Tag>
                        ) : (
                          `${pg.variance >= 0 ? '+' : ''}${pg.variance.toFixed(1)}%`
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Recap Summary */}
        <div style={styles.recapContainer}>
          <div style={styles.recapTitle}>📈 Summary</div>
          <Row gutter={16}>
            <Col span={8}>
              <div style={styles.recapBox}>
                <div style={styles.recapLabel}>Volume (MT)</div>
                <div style={styles.recapValue}>{formatMTDisplay(totals.actualTotal)}</div>
                <div style={styles.recapSubValue}>→ {formatMTDisplay(totals.budgetTotal)}</div>
              </div>
            </Col>
            <Col span={8}>
              <div style={styles.recapBox}>
                <div style={styles.recapLabel}>Amount</div>
                <div style={styles.recapValue}>{formatAmount(totals.actualAmount)}</div>
                <div style={styles.recapSubValue}>→ {formatAmount(totals.budgetAmount)}</div>
              </div>
            </Col>
            <Col span={8}>
              <div style={styles.recapBox}>
                <div style={styles.recapLabel}>Customers</div>
                <div style={styles.recapValue}>{totals.actualCustomerCount}</div>
                <div style={styles.recapSubValue}>→ {totals.budgetCustomerCount}</div>
              </div>
            </Col>
          </Row>
        </div>

        {/* Allocation Targets */}
        {Object.keys(allocationTargets).length > 0 && (
          <div style={styles.allocationBox}>
            <div style={styles.allocationTitle}>🎯 Management Allocation Targets</div>
            <div style={styles.allocationGrid}>
              {Object.entries(allocationTargets).map(([pg, target]) => (
                <div key={pg} style={styles.allocationItem}>
                  <div style={styles.allocationLabel}>{pg}</div>
                  <div style={styles.allocationValue}>{formatMTDisplay(target)} MT</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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

export default CRMBudgetEntry;
