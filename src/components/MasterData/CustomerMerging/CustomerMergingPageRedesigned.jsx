/**
 * Customer Merging Management Page - REDESIGNED
 * 
 * Step 1: Shows customers before merge with:
 * - TWO SEPARATE TABLES: Actual Data (fp_actualcommon) and Budget Data (fp_budget_unified)
 * - Raw sales rep (before grouping)
 * - Country name
 * - Transaction counts and totals
 * 
 * SOURCE OF TRUTH:
 * - fp_actualcommon: All actual transaction data
 * - fp_budget_unified: Unified budget data for all years
 */

import React, { useState, useEffect } from 'react';
import {
  App,
  Card,
  Button,
  Table,
  Tag,
  Space,
  Statistic,
  Row,
  Col,
  Tooltip,
  Popconfirm,
  Alert,
  Input,
  Select,
  Divider
} from 'antd';
import {
  DeleteOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  UserOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  FileExcelOutlined,
  DollarOutlined
} from '@ant-design/icons';
import { useExcelData } from '../../../contexts/ExcelDataContext';
import axios from 'axios';
import './CustomerManagement.css';

const { Search } = Input;
const { Option } = Select;
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const CustomerMergingPageRedesigned = () => {
  const { message } = App.useApp();
  const { selectedDivision } = useExcelData();

  // State
  const [scanning, setScanning] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState(null);

  // Separate data for each table
  const [salesData, setSalesData] = useState([]);
  const [budgetData, setBudgetData] = useState([]);

  // Filter state
  const [searchText, setSearchText] = useState('');
  const [filterCountry, setFilterCountry] = useState(null);
  const [filterSalesRep, setFilterSalesRep] = useState(null);

  // Load data when division changes
  useEffect(() => {
    if (selectedDivision) {
      scanCustomers();
    }
  }, [selectedDivision]);

  // Separate records by source table - GROUP BY CUSTOMER NAME
  useEffect(() => {
    const salesMap = new Map();
    const budgetMap = new Map();
    
    customers.forEach(customer => {
      customer.sources.forEach((source) => {
        if (source.table === 'fp_actualcommon') {
          // Aggregate actual data by customer
          if (salesMap.has(customer.customer_name)) {
            const existing = salesMap.get(customer.customer_name);
            existing.raw_sales_reps.add(source.raw_sales_rep);
            existing.countries.add(source.country);
            existing.transaction_count += source.transaction_count || 0;
            existing.total_sales += source.total_sales || 0;
            existing.total_kgs += source.total_kgs || 0;
          } else {
            salesMap.set(customer.customer_name, {
              key: customer.customer_name,
              customer_name: customer.customer_name,
              raw_sales_reps: new Set([source.raw_sales_rep]),
              countries: new Set([source.country]),
              transaction_count: source.transaction_count || 0,
              total_sales: source.total_sales || 0,
              total_kgs: source.total_kgs || 0
            });
          }
        } else if (source.table === 'fp_budget_unified') {
          // Aggregate budget data by customer
          if (budgetMap.has(customer.customer_name)) {
            const existing = budgetMap.get(customer.customer_name);
            existing.raw_sales_reps.add(source.raw_sales_rep);
            existing.countries.add(source.country);
            existing.total_budget += source.total_budget || 0;
          } else {
            budgetMap.set(customer.customer_name, {
              key: customer.customer_name,
              customer_name: customer.customer_name,
              raw_sales_reps: new Set([source.raw_sales_rep]),
              countries: new Set([source.country]),
              total_budget: source.total_budget || 0
            });
          }
        }
      });
    });
    
    // Convert Maps to arrays, converting Sets to arrays
    const sales = Array.from(salesMap.values()).map(r => ({
      ...r,
      raw_sales_reps: Array.from(r.raw_sales_reps).filter(Boolean),
      countries: Array.from(r.countries).filter(Boolean)
    }));
    
    const budget = Array.from(budgetMap.values()).map(r => ({
      ...r,
      raw_sales_reps: Array.from(r.raw_sales_reps).filter(Boolean),
      countries: Array.from(r.countries).filter(Boolean)
    }));
    
    setSalesData(sales);
    setBudgetData(budget);
  }, [customers]);

  // Filter function
  const applyFilters = (data) => {
    let filtered = [...data];
    
    if (searchText) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(r => 
        r.customer_name.toLowerCase().includes(search)
      );
    }

    if (filterCountry) {
      filtered = filtered.filter(r => r.countries.includes(filterCountry));
    }

    if (filterSalesRep) {
      filtered = filtered.filter(r => r.raw_sales_reps.includes(filterSalesRep));
    }

    return filtered;
  };

  const filteredSalesData = applyFilters(salesData);
  const filteredBudgetData = applyFilters(budgetData);

  // Derived filter options from all data
  const countries = [...new Set([
    ...salesData.flatMap(r => r.countries),
    ...budgetData.flatMap(r => r.countries)
  ])].filter(Boolean).sort();
  
  const salesReps = [...new Set([
    ...salesData.flatMap(r => r.raw_sales_reps),
    ...budgetData.flatMap(r => r.raw_sales_reps)
  ])].filter(Boolean).sort();

  // ========================================================================
  // API CALLS
  // ========================================================================

  const scanCustomers = async () => {
    setScanning(true);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/division-merge-rules/scan-with-source`,
        { division: selectedDivision }
      );

      if (response.data.success) {
        setCustomers(response.data.data.customers);
        setStats(response.data.data);
        message.success(`Loaded ${response.data.data.totalCustomers} customers`);
      }
    } catch (error) {
      message.error('Failed to scan customers');
      console.error(error);
    } finally {
      setScanning(false);
    }
  };

  const deleteAllRules = async () => {
    setDeletingAll(true);
    try {
      const response = await axios.delete(
        `${API_BASE_URL}/api/division-merge-rules/reset/all?division=${selectedDivision}`
      );

      if (response.data.success) {
        message.success(response.data.message);
        window.dispatchEvent(new CustomEvent('customer-management:reset', {
          detail: { division: selectedDivision }
        }));
        scanCustomers();
      }
    } catch (error) {
      message.error('Failed to reset Customer Management');
      console.error(error);
    } finally {
      setDeletingAll(false);
    }
  };

  const purgeAllRules = async () => {
    setDeletingAll(true);
    try {
      const response = await axios.delete(
        `${API_BASE_URL}/api/division-merge-rules/reset/all?division=${selectedDivision}&purgeRules=1`
      );

      if (response.data.success) {
        message.success(response.data.message);
        window.dispatchEvent(new CustomEvent('customer-management:reset', {
          detail: { division: selectedDivision }
        }));
        scanCustomers();
      }
    } catch (error) {
      message.error('Failed to purge Customer Management');
      console.error(error);
    } finally {
      setDeletingAll(false);
    }
  };

  const clearFilters = () => {
    setSearchText('');
    setFilterCountry(null);
    setFilterSalesRep(null);
  };

  // ========================================================================
  // TABLE COLUMNS - Sales Data
  // ========================================================================

  const salesColumns = [
    {
      title: 'Customer Name',
      dataIndex: 'customer_name',
      key: 'customer_name',
      width: 280,
      ellipsis: true,
      fixed: 'left',
      render: (name) => (
        <Tooltip title={name}>
          <strong>{name}</strong>
        </Tooltip>
      ),
      sorter: (a, b) => a.customer_name.localeCompare(b.customer_name)
    },
    {
      title: <><UserOutlined /> Raw Sales Rep(s)</>,
      dataIndex: 'raw_sales_reps',
      key: 'raw_sales_reps',
      width: 250,
      render: (reps) => (
        <Space wrap size={2}>
          {reps.map((rep, i) => (
            <Tag key={i} color="purple" style={{ fontSize: 10, margin: 1 }}>
              {rep}
            </Tag>
          ))}
        </Space>
      )
    },
    {
      title: <><GlobalOutlined /> Country(s)</>,
      dataIndex: 'countries',
      key: 'countries',
      width: 200,
      render: (countries) => (
        <Space wrap size={2}>
          {countries.map((c, i) => (
            <Tag key={i} color="orange" style={{ fontSize: 10, margin: 1 }}>
              {c}
            </Tag>
          ))}
        </Space>
      )
    }
  ];

  // ========================================================================
  // TABLE COLUMNS - Budget Data
  // ========================================================================

  const budgetColumns = [
    {
      title: 'Customer Name',
      dataIndex: 'customer_name',
      key: 'customer_name',
      width: 280,
      ellipsis: true,
      fixed: 'left',
      render: (name) => (
        <Tooltip title={name}>
          <strong>{name}</strong>
        </Tooltip>
      ),
      sorter: (a, b) => a.customer_name.localeCompare(b.customer_name)
    },
    {
      title: <><UserOutlined /> Raw Sales Rep(s)</>,
      dataIndex: 'raw_sales_reps',
      key: 'raw_sales_reps',
      width: 250,
      render: (reps) => (
        <Space wrap size={2}>
          {reps.map((rep, i) => (
            <Tag key={i} color="purple" style={{ fontSize: 10, margin: 1 }}>
              {rep}
            </Tag>
          ))}
        </Space>
      )
    },
    {
      title: <><GlobalOutlined /> Country(s)</>,
      dataIndex: 'countries',
      key: 'countries',
      width: 200,
      render: (countries) => (
        <Space wrap size={2}>
          {countries.map((c, i) => (
            <Tag key={i} color="orange" style={{ fontSize: 10, margin: 1 }}>
              {c}
            </Tag>
          ))}
        </Space>
      )
    }
  ];

  return (
    <div className="customer-merging-redesigned">
      {/* Header with Stats */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col flex="auto">
            <Space size="large">
              <Statistic
                title={
                  <Space>
                    <span>Customer Unified</span>
                    <Tooltip title={`Should equal: ${stats?.uniqueInActual || 0} (actual) + ${stats?.budgetOnlyCustomers || 0} (budget-only) = ${stats?.expectedInUnified || 0}`}>
                      <InfoCircleOutlined style={{ color: '#1890ff' }} />
                    </Tooltip>
                  </Space>
                }
                value={stats?.totalCustomers || 0}
                prefix={<UserOutlined />}
                suffix={stats?.expectedInUnified && stats?.totalCustomers !== stats?.expectedInUnified ? 
                  <Tag color="warning">Expected: {stats?.expectedInUnified}</Tag> : null
                }
              />
              <Divider type="vertical" style={{ height: 60 }} />
              <Statistic
                title={
                  <Space>
                    <FileExcelOutlined style={{ color: '#1890ff' }} />
                    <span style={{ color: '#1890ff' }}>Actual Data</span>
                    <Tooltip title="Customers from fp_actualcommon (before any merging)">
                      <InfoCircleOutlined style={{ color: '#1890ff' }} />
                    </Tooltip>
                  </Space>
                }
                value={stats?.uniqueInActual || 0}
                valueStyle={{ color: '#1890ff' }}
                suffix={<span style={{ fontSize: 12, color: '#8c8c8c' }}>({salesData.length} records)</span>}
              />
              <Statistic
                title={
                  <Space>
                    <DollarOutlined style={{ color: '#52c41a' }} />
                    <span style={{ color: '#52c41a' }}>Budget Data</span>
                    <Tooltip title={`${stats?.uniqueInBudget || 0} unique customers in budget, ${stats?.budgetOnlyCustomers || 0} are active prospects`}>
                      <InfoCircleOutlined style={{ color: '#52c41a' }} />
                    </Tooltip>
                  </Space>
                }
                value={stats?.uniqueInBudget || 0}
                valueStyle={{ color: '#52c41a' }}
                suffix={
                  <Space>
                    <span style={{ fontSize: 12, color: '#8c8c8c' }}>({budgetData.length} records)</span>
                    {stats?.budgetOnlyCustomers > 0 && (
                      <Tag color="green">{stats?.budgetOnlyCustomers} prospects</Tag>
                    )}
                  </Space>
                }
              />
            </Space>
          </Col>
          <Col>
            <Space>
              <Popconfirm
                title="Reset Customer Management?"
                description={`This will deactivate ALL active merge rules for ${selectedDivision}, clear AI suggestions, and un-merge customers.`}
                onConfirm={deleteAllRules}
                okText="Yes, Reset"
                cancelText="Cancel"
                okButtonProps={{ danger: true }}
              >
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  loading={deletingAll}
                >
                  Reset All
                </Button>
              </Popconfirm>

              <Popconfirm
                title="Purge rules permanently?"
                description={`This will PERMANENTLY delete ALL merge rule rows (including inactive history) for ${selectedDivision}. This cannot be undone.`}
                onConfirm={purgeAllRules}
                okText="Yes, Purge"
                cancelText="Cancel"
                okButtonProps={{ danger: true }}
              >
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  loading={deletingAll}
                >
                  Purge Rules
                </Button>
              </Popconfirm>

              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                onClick={scanCustomers}
                loading={scanning}
              >
                Scan Customers
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Filters */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={10}>
            <Search
              placeholder="Search customer name..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col span={5}>
            <Select
              placeholder="Filter by Country"
              value={filterCountry}
              onChange={setFilterCountry}
              allowClear
              style={{ width: '100%' }}
              showSearch
            >
              {countries.map(c => (
                <Option key={c} value={c}>{c}</Option>
              ))}
            </Select>
          </Col>
          <Col span={5}>
            <Select
              placeholder="Filter by Sales Rep"
              value={filterSalesRep}
              onChange={setFilterSalesRep}
              allowClear
              style={{ width: '100%' }}
              showSearch
            >
              {salesReps.map(rep => (
                <Option key={rep} value={rep}>{rep}</Option>
              ))}
            </Select>
          </Col>
          <Col span={4}>
            <Button onClick={clearFilters} block>
              Clear Filters
            </Button>
          </Col>
        </Row>
      </Card>

      {/* TWO SEPARATE TABLES */}
      <Row gutter={16}>
        {/* Sales Data Table */}
        <Col span={12}>
          <Card
            title={
              <Space>
                <FileExcelOutlined style={{ color: '#1890ff' }} />
                <span style={{ color: '#1890ff' }}>Actual Data (fp_actualcommon)</span>
                <Tag color="blue">{filteredSalesData.length} customers</Tag>
              </Space>
            }
            style={{ height: '100%' }}
            styles={{ body: { padding: '12px' } }}
          >
            <Table
              loading={scanning}
              dataSource={filteredSalesData}
              columns={salesColumns}
              rowKey="key"
              pagination={{
                pageSize: 25,
                showSizeChanger: true,
                showTotal: (total) => `${total} customers`,
                pageSizeOptions: [10, 25, 50, 100]
              }}
              scroll={{ x: 900, y: 450 }}
              size="small"
            />
          </Card>
        </Col>

        {/* Budget Data Table */}
        <Col span={12}>
          <Card
            title={
              <Space>
                <DollarOutlined style={{ color: '#52c41a' }} />
                <span style={{ color: '#52c41a' }}>Budget Data (fp_budget_unified)</span>
                <Tag color="green">{filteredBudgetData.length} customers</Tag>
              </Space>
            }
            style={{ height: '100%' }}
            styles={{ body: { padding: '12px' } }}
          >
            <Table
              loading={scanning}
              dataSource={filteredBudgetData}
              columns={budgetColumns}
              rowKey="key"
              pagination={{
                pageSize: 25,
                showSizeChanger: true,
                showTotal: (total) => `${total} customers`,
                pageSizeOptions: [10, 25, 50, 100]
              }}
              scroll={{ x: 750, y: 450 }}
              size="small"
            />
          </Card>
        </Col>
      </Row>

      {/* Info Alert */}
      <Alert
        style={{ marginTop: 16 }}
        message="Step 1: Review Source Records by Table"
        description={
          <div>
            <p><strong>Left Table (Blue):</strong> Actual Data from fp_actualcommon - all actual transaction records with customer, sales rep, country, sales amounts and KGs.</p>
            <p><strong>Right Table (Green):</strong> Budget Data from fp_budget_unified - unified budget planning data for all years.</p>
            <p>These are the <strong>source of truth tables</strong> used throughout the system. Use the AI Suggestions or Active Rules tabs to merge duplicate customer names.</p>
          </div>
        }
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
      />
    </div>
  );
};

export default CustomerMergingPageRedesigned;
