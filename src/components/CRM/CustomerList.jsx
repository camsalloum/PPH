/**
 * Customer List - All Customers View
 * Searchable, filterable table with pagination
 * Default sort: Last Order Date (most recent first)
 */

import React, { useState, useEffect } from 'react';
import { 
  Card, Table, Input, Select, Button, Space, Tag, Typography, 
  Row, Col, Tooltip, Badge, Empty, App
} from 'antd';
import {
  SearchOutlined,
  ContactsOutlined,
  EyeOutlined,
  ReloadOutlined,
  GlobalOutlined,
  ClearOutlined,
  CalendarOutlined
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import CustomerSalesHistoryModal from './CustomerSalesHistoryModal';
import CurrencySymbol from '../common/CurrencySymbol';
import './CRM.css';

const { Title, Text } = Typography;
const { Option } = Select;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const CustomerList = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [countries, setCountries] = useState([]);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  
  // Filters - initialize from URL params if present
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [countryFilter, setCountryFilter] = useState(searchParams.get('country') || null);
  const [statusFilter, setStatusFilter] = useState(null);
  const [sortField, setSortField] = useState('last_order');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // Sales history modal
  const [salesHistoryModalVisible, setSalesHistoryModalVisible] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  
  // Reload trigger
  const [reloadKey, setReloadKey] = useState(0);

  // Fetch customers - simple function that fetches and updates state
  const fetchCustomers = async (page = 1, pageSize = 20) => {
    
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');

      // API uses offset-based pagination, convert page to offset
      const offset = (page - 1) * pageSize;
      
      const params = new URLSearchParams();
      params.append('limit', String(pageSize));
      params.append('offset', String(offset));
      params.append('sort', sortField);
      params.append('order', sortOrder);
      if (search) params.append('search', search);
      if (countryFilter) params.append('country', countryFilter);
      if (statusFilter) params.append('customer_status', statusFilter);

      const url = `${API_BASE_URL}/api/crm/customers?${params}`;

      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });


      if (res.data.success) {
        // API returns: { success, data: [...customers], pagination: { total, limit, offset, hasMore } }
        const apiCustomers = res.data.data || [];
        // Trust server-side sorting (don't re-sort client-side)
        setCustomers(apiCustomers);
        setTotalCustomers(res.data.pagination?.total || 0);
        const newPagination = {
          current: page,
          pageSize: pageSize,
          total: res.data.pagination?.total || 0
        };
        setPagination(newPagination);
      }
    } catch (error) {
      console.error('Error loading customers:', error);
      message.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  // Load countries for filter
  useEffect(() => {
    const loadCountries = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const res = await axios.get(`${API_BASE_URL}/api/crm/customers/countries`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data.success) {
          setCountries(res.data.data || []);
        }
      } catch (error) {
        console.error('Error loading countries:', error);
      }
    };
    loadCountries();
  }, []);

  // Load customers when filters change or on manual reload
  useEffect(() => {
    fetchCustomers(1, pagination.pageSize);
  }, [search, countryFilter, statusFilter, sortField, sortOrder, reloadKey]);

  // Handle search submit
  const handleSearch = (value) => {
    setSearch(value ?? searchInput);
  };

  // Handle search input change — clear results when input is cleared
  const handleSearchInputChange = (e) => {
    const val = e.target.value;
    setSearchInput(val);
    // If the user clears the input, reset search immediately
    if (!val && search) {
      setSearch('');
    }
  };

  // Table change handler - handles pagination and sorting
  const handleTableChange = (paginationConfig, filters, sorter) => {
    
    // Handle sorting
    if (sorter && sorter.field) {
      const fieldMap = {
        'last_order_date': 'last_order',
        'customer_name': 'name',
        'total_amount_all_time': 'revenue',
        'country': 'country'
      };
      const newSortField = fieldMap[sorter.field] || sorter.field;
      
      // If sorter.order is undefined (user cleared sort), reset to default: last_order desc
      if (!sorter.order) {
        if (sortField !== 'last_order' || sortOrder !== 'desc') {
          setSortField('last_order');
          setSortOrder('desc');
          return; // useEffect will trigger fetchCustomers
        }
      } else {
        const newSortOrder = sorter.order === 'ascend' ? 'asc' : 'desc';
        
        if (newSortField !== sortField || newSortOrder !== sortOrder) {
          setSortField(newSortField);
          setSortOrder(newSortOrder);
          return; // useEffect will trigger fetchCustomers
        }
      }
    }
    
    fetchCustomers(paginationConfig.current, paginationConfig.pageSize);
  };

  // Handle refresh
  const handleRefresh = () => {
    setReloadKey(k => k + 1);
  };

  // Clear all filters
  const handleClearFilters = () => {
    setSearch('');
    setSearchInput('');
    setCountryFilter(null);
    setStatusFilter(null);
    // useEffect will trigger fetchCustomers when filters change
  };

  // Table columns
  const columns = [
    {
      title: <span>Customer<br/>Code</span>,
      dataIndex: 'customer_code',
      key: 'customer_code',
      width: 100,
      render: (code) => {
        return <Text code className="crm-code-text">{code}</Text>;
      }
    },
    {
      title: 'Customer Name',
      dataIndex: 'customer_name',
      key: 'customer_name',
      ellipsis: true,
      render: (name, record) => (
        <Space>
          <Tooltip title="Click to view complete sales history">
            <Text 
              strong 
              className="crm-cell-clickable"
              onClick={() => {
                setSelectedCustomer({ id: record.id, customer_name: name });
                setSalesHistoryModalVisible(true);
              }}
            >
              {name}
            </Text>
          </Tooltip>
          {record.is_merged && (
            <Tooltip title="This is a merged customer">
              <Tag color="purple" className="crm-tag-xs">Merged</Tag>
            </Tooltip>
          )}
        </Space>
      )
    },
    {
      title: <span><CurrencySymbol code="AED" /> Revenue</span>,
      dataIndex: 'total_amount_all_time',
      key: 'total_amount_all_time',
      width: 130,
      align: 'right',
      sorter: true,
      sortOrder: sortField === 'revenue' ? (sortOrder === 'desc' ? 'descend' : 'ascend') : null,
      render: (revenue) => {
        if (!revenue) return <Text type="secondary" className="crm-text-xs">-</Text>;
        const numRevenue = Math.round(parseFloat(revenue));
        return (
          <Text strong className="crm-text-sm">
            <CurrencySymbol code="AED" /> {numRevenue.toLocaleString('en-US')}
          </Text>
        );
      }
    },
    {
      title: 'Country',
      dataIndex: 'country',
      key: 'country',
      width: 100,
      ellipsis: true,
      render: (country) => (
        <Tooltip title={country}>
          <Text className="crm-text-sm">{country || '-'}</Text>
        </Tooltip>
      )
    },
    {
      title: 'Status',
      dataIndex: 'customer_status',
      key: 'customer_status',
      width: 100,
      align: 'center',
      render: (status) => {
        switch (status) {
          case 'active':
            return <Badge status="success" text="Active" />;
          case 'dormant':
            return (
              <Tooltip title="Last transaction 12-24 months ago">
                <Badge status="warning" text={<Text type="warning">Dormant</Text>} />
              </Tooltip>
            );
          case 'inactive':
          default:
            return (
              <Tooltip title="No transaction in 24+ months or never">
                <Badge status="default" text={<Text type="secondary">Inactive</Text>} />
              </Tooltip>
            );
        }
      }
    },
    {
      title: <span><CalendarOutlined /> Last Order</span>,
      dataIndex: 'last_order_date',
      key: 'last_order_date',
      width: 120,
      align: 'center',
      sorter: true,
      sortOrder: sortField === 'last_order' ? (sortOrder === 'desc' ? 'descend' : 'ascend') : null,
      render: (date) => {
        if (!date) return <Text type="secondary" className="crm-text-xs">No orders</Text>;
        const d = new Date(date);
        const now = new Date();
        const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        // Color based on recency (matches backend: active <12mo, dormant 12-24mo, inactive >24mo)
        let tagColor = 'green';
        let statusHint = '';
        if (monthsAgo >= 24) {
          tagColor = 'red';
          statusHint = '⚠️ Over 24 months ago - customer inactive';
        } else if (monthsAgo >= 12) {
          tagColor = 'orange';
          statusHint = `⚠️ ${monthsAgo} months ago - customer dormant`;
        }
        
        return (
          <Tooltip title={statusHint || `Last order: ${monthNames[d.getMonth()]} ${d.getFullYear()}`}>
            <Tag color={tagColor} className="crm-tag-xs">
              {monthNames[d.getMonth()]} {d.getFullYear()}
            </Tag>
          </Tooltip>
        );
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      align: 'center',
      render: (_, record) => (
        <Tooltip title="View Details">
          <Button 
            type="primary" 
            ghost 
            size="small" 
            icon={<EyeOutlined />}
            onClick={() => navigate(`/crm/customers/${record.id}`)}
          >
            View
          </Button>
        </Tooltip>
      )
    }
  ];

  const hasFilters = search || countryFilter || statusFilter !== null;

  return (
    <div className="crm-customer-list crm-animate-in">
      {/* Page Header */}
      <div className="crm-page-title">
        <ContactsOutlined />
        <Title level={2}>All Customers</Title>
        <Tag color="blue">{totalCustomers} total</Tag>
      </div>

      {/* Search and Filters */}
      <Card className="crm-table-card crm-row-mb-20">
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={10}>
            <Input.Search
              placeholder="Search by customer name..."
              value={searchInput}
              onChange={handleSearchInputChange}
              onSearch={handleSearch}
              enterButton={<SearchOutlined />}
              size="large"
              allowClear
              className="crm-search-box"
            />
          </Col>
          <Col xs={12} md={5}>
            <Select
              placeholder="Filter by Country"
              value={countryFilter}
              onChange={setCountryFilter}
              allowClear
              className="crm-select-full-width"
              size="large"
              suffixIcon={<GlobalOutlined />}
            >
              {countries.map(country => (
                <Option key={country} value={country}>{country}</Option>
              ))}
            </Select>
          </Col>
          <Col xs={12} md={5}>
            <Select
              placeholder="Filter by Status"
              value={statusFilter}
              onChange={setStatusFilter}
              allowClear
              className="crm-select-full-width"
              size="large"
            >
              <Option value="active">Active (&lt;12 months)</Option>
              <Option value="dormant">Dormant (12-24 months)</Option>
              <Option value="inactive">Inactive (24+ months)</Option>
            </Select>
          </Col>
          <Col xs={24} md={4}>
            <Space>
              <Button 
                icon={<ReloadOutlined />} 
                onClick={handleRefresh}
                loading={loading}
              >
                Refresh
              </Button>
              {hasFilters && (
                <Button 
                  icon={<ClearOutlined />}
                  onClick={handleClearFilters}
                  danger
                >
                  Clear
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Customers Table */}
      <Card className="crm-table-card">
        <Table
          dataSource={customers}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          rowClassName={() => 'compact-row'}
          pagination={{
            ...pagination,
            total: totalCustomers,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (tot, range) => `${range[0]}-${range[1]} of ${tot} customers`
          }}
          onChange={handleTableChange}
          scroll={{ x: 800 }}
          locale={{
            emptyText: (
              <Empty 
                description={hasFilters ? "No customers match your filters" : "No customers found"}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )
          }}
        />
      </Card>

      {/* Sales History Modal */}
      <CustomerSalesHistoryModal
        visible={salesHistoryModalVisible}
        onClose={() => {
          setSalesHistoryModalVisible(false);
          setSelectedCustomer(null);
        }}
        customer={selectedCustomer}
      />
    </div>
  );
};

export default CustomerList;
