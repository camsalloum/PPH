/**
 * Customer Master Page - Redesigned
 *
 * Shows all unique customers (merged and unmerged) with:
 * - Customer Name (with * indicator for merged)
 * - Country
 * - Sales Rep (unique, after grouping)
 * - Total Sales (company currency with SVG symbol)
 * - Last Transaction Date
 * 
 * Features:
 * - Clickable stats cards to filter merged/unmerged customers
 * - CurrencySymbol SVG for proper currency display
 */

import React, { useState, useEffect } from 'react';
import {
  App,
  Card,
  Table,
  Tag,
  Space,
  Input,
  Statistic,
  Row,
  Col,
  Button,
  Tooltip,
  Spin,
  Empty,
  Typography
} from 'antd';
import {
  UserOutlined,
  SearchOutlined,
  ReloadOutlined,
  TeamOutlined,
  MergeCellsOutlined,
  DollarOutlined,
  CalendarOutlined
} from '@ant-design/icons';
import { useExcelData } from '../../../contexts/ExcelDataContext';
import CurrencySymbol from '../../dashboard/CurrencySymbol';
import axios from 'axios';

const { Text } = Typography;
const { Search } = Input;
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const CustomerMasterPage = () => {
  const { message } = App.useApp();
  const { selectedDivision } = useExcelData();

  // State
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all', 'merged', 'unmerged', 'prospects'
  const [stats, setStats] = useState({
    total: 0,
    merged: 0,
    prospects: 0,
    currency: 'AED'
  });

  // Load data on mount and when division changes
  useEffect(() => {
    if (selectedDivision) {
      loadCustomers();
    }
  }, [selectedDivision]);

  // Tabs keep panes mounted; refresh when a global reset happens elsewhere
  useEffect(() => {
    const handler = (event) => {
      const division = event?.detail?.division;
      if (!selectedDivision) return;
      if (division && division !== selectedDivision) return;
      loadCustomers();
    };

    window.addEventListener('customer-management:reset', handler);
    return () => window.removeEventListener('customer-management:reset', handler);
  }, [selectedDivision]);

  // Filter customers when search or filter type changes
  useEffect(() => {
    let result = customers;
    
    // Apply merged/unmerged/prospects filter
    if (filterType === 'merged') {
      result = result.filter(c => c.is_merged);
    } else if (filterType === 'unmerged') {
      result = result.filter(c => !c.is_merged);
    } else if (filterType === 'prospects') {
      result = result.filter(c => c.is_prospect);
    }
    
    // Apply search filter
    if (searchText) {
      const search = searchText.toLowerCase();
      result = result.filter(c =>
        c.customer_name.toLowerCase().includes(search) ||
        c.countries?.some(co => co.toLowerCase().includes(search)) ||
        c.sales_reps?.some(sr => sr.toLowerCase().includes(search))
      );
    }
    
    setFilteredCustomers(result);
  }, [customers, searchText, filterType]);

  // Load customer master view
  const loadCustomers = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/division-merge-rules/customer-master-view`,
        { params: { division: selectedDivision } }
      );

      if (response.data.success) {
        setCustomers(response.data.data.customers || []);
        setStats({
          total: response.data.data.totalCustomers || 0,
          merged: response.data.data.mergedCount || 0,
          prospects: response.data.data.prospectsCount || 0,
          currency: response.data.data.currency || 'AED'
        });
      }
    } catch (error) {
      console.error('Error loading customers:', error);
      message.error('Failed to load customer data');
    } finally {
      setLoading(false);
    }
  };

  // Format currency with proper symbol
  const formatCurrency = (value) => {
    const formattedValue = (!value || isNaN(value)) ? '0' : value.toLocaleString(undefined, { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 0 
    });
    return (
      <span>
        <CurrencySymbol /> {formattedValue}
      </span>
    );
  };

  // Format date - month and year only (no day since data is monthly)
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return '-';
    }
  };

  // Table columns
  const columns = [
    {
      title: 'Customer Name',
      dataIndex: 'customer_name',
      key: 'customer_name',
      width: 300,
      ellipsis: true,
      sorter: (a, b) => a.customer_name.localeCompare(b.customer_name),
      render: (name, record) => (
        <Text strong>
          {name}
          {record.is_merged && <sup style={{ color: '#1890ff', marginLeft: 2, fontSize: '0.7em' }}>*</sup>}
        </Text>
      ),
    },
    {
      title: 'Country',
      dataIndex: 'countries',
      key: 'countries',
      width: 180,
      render: (countries) => (
        <Space wrap size={2}>
          {countries?.slice(0, 3).map((country, i) => (
            <Tag key={i} color="orange" style={{ fontSize: 11 }}>
              {country}
            </Tag>
          ))}
          {countries?.length > 3 && (
            <Tooltip title={countries.slice(3).join(', ')}>
              <Tag style={{ fontSize: 11 }}>+{countries.length - 3}</Tag>
            </Tooltip>
          )}
        </Space>
      ),
      filters: [...new Set(customers.flatMap(c => c.countries || []))]
        .sort()
        .slice(0, 20)
        .map(c => ({ text: c, value: c })),
      onFilter: (value, record) => record.countries?.includes(value),
    },
    {
      title: 'Sales Rep',
      dataIndex: 'sales_reps',
      key: 'sales_reps',
      width: 250,
      render: (reps) => (
        <Space wrap size={2}>
          {reps?.map((rep, i) => (
            <Tag key={i} color="purple" style={{ fontSize: 11 }}>
              {rep}
            </Tag>
          ))}
        </Space>
      ),
      filters: [...new Set(customers.flatMap(c => c.sales_reps || []))]
        .sort()
        .slice(0, 20)
        .map(r => ({ text: r, value: r })),
      onFilter: (value, record) => record.sales_reps?.includes(value),
    },
    // Only show Total Sales column when NOT filtering prospects
    ...(filterType !== 'prospects' ? [{
      title: <span>Total Sales (<CurrencySymbol />)</span>,
      dataIndex: 'total_sales',
      key: 'total_sales',
      width: 150,
      align: 'right',
      sorter: (a, b) => (a.total_sales || 0) - (b.total_sales || 0),
      defaultSortOrder: 'descend',
      render: (value) => (
        <Text strong style={{ color: value > 0 ? '#52c41a' : '#999' }}>
          {formatCurrency(value)}
        </Text>
      ),
    }] : []),
    // Only show Last Transaction column when NOT filtering prospects
    ...(filterType !== 'prospects' ? [{
      title: 'Last Transaction',
      dataIndex: 'last_transaction_date',
      key: 'last_transaction_date',
      width: 130,
      align: 'center',
      sorter: (a, b) => {
        if (!a.last_transaction_date) return 1;
        if (!b.last_transaction_date) return -1;
        return new Date(a.last_transaction_date) - new Date(b.last_transaction_date);
      },
      render: (date) => (
        <Text type={date ? undefined : 'secondary'}>
          {formatDate(date)}
        </Text>
      ),
    }] : []),
  ];

  // Handle stats card click for filtering
  const handleStatsClick = (type) => {
    if (filterType === type) {
      // Clicking same filter toggles back to 'all'
      setFilterType('all');
    } else {
      setFilterType(type);
    }
  };

  // Get card style based on filter selection
  const getCardStyle = (type) => ({
    cursor: 'pointer',
    border: filterType === type ? '2px solid #1890ff' : '1px solid #f0f0f0',
    transition: 'all 0.3s',
    boxShadow: filterType === type ? '0 2px 8px rgba(24,144,255,0.3)' : 'none'
  });

  if (!selectedDivision) {
    return (
      <Card>
        <Empty description="Please select a division to view Customer Master data" />
      </Card>
    );
  }

  return (
    <div className="customer-master-page">
      {/* Statistics Cards - Clickable for filtering */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card 
            style={getCardStyle('all')} 
            onClick={() => handleStatsClick('all')}
            hoverable
          >
            <Statistic
              title={<span>Total Customers {filterType === 'all' && <Tag color="blue" style={{ marginLeft: 8 }}>Active</Tag>}</span>}
              value={stats.total}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card 
            style={getCardStyle('merged')} 
            onClick={() => handleStatsClick('merged')}
            hoverable
          >
            <Statistic
              title={<span>Merged {filterType === 'merged' && <Tag color="blue" style={{ marginLeft: 8 }}>Active</Tag>}</span>}
              value={stats.merged}
              prefix={<MergeCellsOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card 
            style={getCardStyle('unmerged')} 
            onClick={() => handleStatsClick('unmerged')}
            hoverable
          >
            <Statistic
              title={<span>Unmerged {filterType === 'unmerged' && <Tag color="blue" style={{ marginLeft: 8 }}>Active</Tag>}</span>}
              value={stats.total - stats.merged}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card 
            style={getCardStyle('prospects')} 
            onClick={() => handleStatsClick('prospects')}
            hoverable
          >
            <Statistic
              title={<span>Prospects {filterType === 'prospects' && <Tag color="blue" style={{ marginLeft: 8 }}>Active</Tag>}</span>}
              value={stats.prospects}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Search and Actions */}
      <Card style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Search
              placeholder="Search by customer, country, or sales rep..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
              style={{ width: 400 }}
              prefix={<SearchOutlined />}
            />
          </Col>
          <Col>
            <Space>
              <Text type="secondary">
                Showing {filteredCustomers.length} of {stats.total} customers
                {filterType !== 'all' && (
                  <Tag color="blue" style={{ marginLeft: 8 }}>
                    {filterType === 'merged' ? 'Merged Only' : 'Unmerged Only'}
                  </Tag>
                )}
              </Text>
              {filterType !== 'all' && (
                <Button size="small" onClick={() => setFilterType('all')}>
                  Clear Filter
                </Button>
              )}
              <Button
                icon={<ReloadOutlined />}
                onClick={loadCustomers}
                loading={loading}
              >
                Refresh
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Customers Table */}
      <Card
        title={
          <Space>
            <TeamOutlined />
            <span>Customer Master</span>
            <Tag color="blue">{filteredCustomers.length} customers</Tag>
          </Space>
        }
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 50 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>Loading customer data...</div>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <Empty description="No customers found" />
        ) : (
          <Table
            dataSource={filteredCustomers}
            columns={columns}
            rowKey="customer_name"
            pagination={{
              pageSize: 50,
              showSizeChanger: true,
              showTotal: (total) => `${total} customers`,
              pageSizeOptions: [25, 50, 100, 200]
            }}
            scroll={{ x: 960 }}
            size="small"
          />
        )}
      </Card>
    </div>
  );
};

export default CustomerMasterPage;
