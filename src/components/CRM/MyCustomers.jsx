/**
 * Customers - Sales Rep's Own Customers
 * Shows customers assigned to the logged-in sales rep
 * For group leaders, shows all team customers
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Card, Table, Typography, Space, Tag, Button, Alert, Input,
  Empty, Spin, Avatar, App, Tooltip
} from 'antd';
import {
  ContactsOutlined,
  GlobalOutlined,
  EyeOutlined,
  ReloadOutlined,
  ArrowLeftOutlined,
  SearchOutlined,
  UserOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import CurrencySymbol from '../common/CurrencySymbol';
import CustomerSalesHistoryModal from './CustomerSalesHistoryModal';
import './CRM.css';

const { Title, Text } = Typography;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

// Storage key for remembering search
const SEARCH_STORAGE_KEY = 'crm_customers_search';

const MyCustomers = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const searchInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [companyCurrency, setCompanyCurrency] = useState({ code: 'AED', symbol: 'د.إ' });
  // Initialize search from sessionStorage (persists during session)
  const [searchText, setSearchText] = useState(() => {
    return sessionStorage.getItem(SEARCH_STORAGE_KEY) || '';
  });
  
  // Sales history modal
  const [salesHistoryModalVisible, setSalesHistoryModalVisible] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Load company settings to get currency
  useEffect(() => {
    const loadCompanySettings = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/settings/company`);
        if (res.data.success && res.data.settings?.currency) {
          setCompanyCurrency(res.data.settings.currency);
        }
      } catch (err) {
        console.error('Error loading company settings:', err);
        // Keep default AED
      }
    };
    loadCompanySettings();
  }, []);

  // Active trip country state
  const [tripCountry, setTripCountry] = useState(null);

  // Load my customers
  const loadMyCustomers = async (country) => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };

      // Resolve trip country if not provided
      let resolvedCountry = country;
      if (resolvedCountry === undefined) {
        try {
          const tripRes = await axios.get(`${API_BASE_URL}/api/crm/field-trips`, {
            headers, params: { upcoming: true, limit: 1 }
          });
          const trips = Array.isArray(tripRes.data?.data) ? tripRes.data.data : [];
          const active = trips.find(t => ['in_progress', 'confirmed'].includes(t.status));
          resolvedCountry = active?.country || 'UAE';
        } catch { resolvedCountry = 'UAE'; }
        setTripCountry(resolvedCountry);
      }

      const res = await axios.get(`${API_BASE_URL}/api/crm/my-customers`, {
        headers,
        params: { country: resolvedCountry }
      });
      
      if (res.data.success) {
        setData(res.data.data);
      } else {
        setError(res.data.error || 'Failed to load customers');
      }
    } catch (err) {
      console.error('Error loading my customers:', err);
      const errorMsg = err.response?.data?.error || 'Failed to load your customers';
      setError(errorMsg);
      
      if (err.response?.status !== 403) {
        message.error(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMyCustomers();
  }, []);

  // Keyboard shortcut: Press "/" to focus search
  useEffect(() => {
    const handleKeyDown = (e) => {
      // "/" to focus search (unless already in an input)
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Escape to clear search
      if (e.key === 'Escape' && searchText) {
        setSearchText('');
        sessionStorage.removeItem(SEARCH_STORAGE_KEY);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchText]);

  // Filter customers based on search text (searches code, name, country)
  // AND sort by last_transaction_date (newest first) by default
  const filteredCustomers = useMemo(() => {
    const customers = data?.customers || [];
    
    // Apply search filter
    let filtered = customers;
    if (searchText.trim()) {
      const search = searchText.toLowerCase().trim();
      filtered = customers.filter(c => 
        c.customer_name?.toLowerCase().includes(search) ||
        c.customer_code?.toLowerCase().includes(search) ||
        c.country?.toLowerCase().includes(search)
      );
    }
    
    // Sort by last transaction date (newest first)
    return [...filtered].sort((a, b) => {
      if (!a.last_transaction_date && !b.last_transaction_date) return 0;
      if (!a.last_transaction_date) return 1;
      if (!b.last_transaction_date) return -1;
      return new Date(b.last_transaction_date) - new Date(a.last_transaction_date);
    });
  }, [data?.customers, searchText]);

  // Is this a group leader?
  const isGroup = data?.salesRep?.type === 'GROUP';
  const pageTitle = isGroup ? 'Customers' : 'My Customers';

  // Common text style class
  const cellClass = 'crm-cell-base';

  // Table columns with sorting
  const columns = [
    {
      title: <span className={cellClass}>Customer<br/>Code</span>,
      dataIndex: 'customer_code',
      key: 'customer_code',
      width: 95,
      sorter: (a, b) => (a.customer_code || '').localeCompare(b.customer_code || ''),
      render: (code) => {
        return <span className="crm-cell-code">{code}</span>;
      }
    },
    {
      title: <span className={cellClass}>Customer Name</span>,
      dataIndex: 'customer_name',
      key: 'customer_name',
      ellipsis: true,
      sorter: (a, b) => (a.customer_name || '').localeCompare(b.customer_name || ''),
      render: (name, record) => {
        const isMerged = record.is_merged_display || record.is_merged;
        return (
          <Space>
            <Avatar 
              size="small" 
              className={isMerged ? 'crm-avatar-purple' : 'crm-avatar-success'}
            >
              {name?.charAt(0)?.toUpperCase()}
            </Avatar>
            <Tooltip title="Click to view complete sales history">
              <span 
                className="crm-cell-clickable"
                onClick={() => {
                  setSelectedCustomer({ id: record.id, customer_name: name });
                  setSalesHistoryModalVisible(true);
                }}
              >
                {name}{isMerged ? '*' : ''}
              </span>
            </Tooltip>
            {isMerged && (
              <Tooltip title="Merged customer - consolidated from multiple name variations">
                <Tag color="purple" className="crm-tag-xs">Merged</Tag>
              </Tooltip>
            )}
          </Space>
        );
      }
    },
    {
      title: <span className={cellClass}>Country</span>,
      dataIndex: 'country',
      key: 'country',
      width: 130,
      sorter: (a, b) => (a.country || '').localeCompare(b.country || ''),
      render: (country) => (
        <span className={cellClass}>{country || '-'}</span>
      )
    },
    {
      title: <span className={cellClass}>Status</span>,
      dataIndex: 'customer_status',
      key: 'customer_status',
      width: 90,
      align: 'center',
      sorter: (a, b) => {
        const order = { active: 0, dormant: 1, inactive: 2 };
        return (order[a.customer_status] || 2) - (order[b.customer_status] || 2);
      },
      render: (status) => {
        switch (status) {
          case 'active':
            return <Tag color="success" className="crm-tag-xs">Active</Tag>;
          case 'dormant':
            return (
              <Tooltip title="Last transaction 12-24 months ago">
                <Tag color="warning" className="crm-tag-xs">Dormant</Tag>
              </Tooltip>
            );
          case 'inactive':
          default:
            return (
              <Tooltip title="No transaction in 24+ months or never">
                <Tag color="default" className="crm-tag-xs">Inactive</Tag>
              </Tooltip>
            );
        }
      }
    },
    {
      title: <span className={cellClass}>Last Order</span>,
      dataIndex: 'last_transaction_date',
      key: 'last_transaction_date',
      width: 95,
      // Data is already pre-sorted by last_transaction_date (newest first) in filteredCustomers
      // Remove column sorter to avoid AntD reordering back to unsorted input
      render: (date) => {
        if (!date) return <span className={cellClass}>-</span>;
        const d = new Date(date);
        return <span className={cellClass}>{d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</span>;
      }
    },
    {
      title: () => (
        <Space size={4}>
          <CurrencySymbol code={companyCurrency.code} className="crm-currency-sm" />
          <span className={cellClass}>Revenue</span>
        </Space>
      ),
      dataIndex: 'total_amount_all_time',
      key: 'total_amount_all_time',
      width: 120,
      sorter: (a, b) => (parseFloat(a.total_amount_all_time) || 0) - (parseFloat(b.total_amount_all_time) || 0),
      render: (revenue) => {
        if (!revenue) return <span className={cellClass}>-</span>;
        const numRevenue = Math.round(parseFloat(revenue));
        return (
          <span className={cellClass}>
            <CurrencySymbol code={companyCurrency.code} className="crm-currency-mr" />
            {numRevenue.toLocaleString('en-US')}
          </span>
        );
      }
    },
    {
      title: <span className={cellClass}>Actions</span>,
      key: 'actions',
      width: 80,
      align: 'center',
      render: (_, record) => (
        <Button 
          type="primary" 
          ghost 
          size="small" 
          icon={<EyeOutlined />}
          onClick={() => navigate(`/crm/customers/${record.id}`)}
        >
          View
        </Button>
      )
    }
  ];

  // Handle search - reset pagination when searching, save to sessionStorage
  const handleSearch = (value) => {
    setSearchText(value);
    setPagination(prev => ({ ...prev, current: 1 }));
    // Remember search for this session
    if (value) {
      sessionStorage.setItem(SEARCH_STORAGE_KEY, value);
    } else {
      sessionStorage.removeItem(SEARCH_STORAGE_KEY);
    }
  };

  if (loading) {
    return (
      <div className="crm-loading">
        <Spin size="large" />
        <Text type="secondary">Loading customers...</Text>
      </div>
    );
  }

  if (error) {
    return (
      <div className="crm-animate-in">
        {/* Back Button */}
        <Button 
          type="text" 
          icon={<ArrowLeftOutlined />} 
          onClick={() => navigate('/crm')}
          className="crm-row-mb-16"
        >
          Back to Dashboard
        </Button>
        
        <div className="crm-page-title">
          <ContactsOutlined />
          <Title level={2}>{pageTitle}</Title>
        </div>
        <Alert
          message="Access Restricted"
          description={error}
          type="warning"
          showIcon
          className="crm-row-mb-20"
        />
        <Card>
          <Empty 
            description={
              <span>
                {error.includes('not a registered sales rep') 
                  ? "You are not registered as a sales rep. Contact an administrator to set up your sales rep profile."
                  : "Unable to load your customers at this time."}
              </span>
            }
          />
        </Card>
      </div>
    );
  }

  const allCustomers = data?.customers || [];

  return (
    <div className="crm-my-customers crm-animate-in">
      {/* Back Button */}
      <Button 
        type="text" 
        icon={<ArrowLeftOutlined />} 
        onClick={() => navigate('/crm')}
        className="crm-row-mb-16"
      >
        Back to Dashboard
      </Button>

      {/* Page Header */}
      <div className="crm-page-title">
        <ContactsOutlined />
        <Title level={2}>{pageTitle}</Title>
        <Tag color="green">{allCustomers.length} total</Tag>
      </div>

      {/* Team Info for Group Leaders */}
      {isGroup && data?.salesRep?.groupMembers?.length > 0 && (
        <Alert
          message={
            <Space>
              <UserOutlined />
              <span>Team: {data.salesRep.groupMembers.join(', ')}</span>
            </Space>
          }
          type="info"
          className="crm-row-mb-16"
        />
      )}

      {/* Search Box */}
      <Card className="crm-table-card crm-row-mb-16">
        <Space className="crm-search-row">
          <Space>
            <Input.Search
              ref={searchInputRef}
              placeholder="Search by customer name, code, or country..."
              value={searchText}
              onChange={(e) => handleSearch(e.target.value)}
              onSearch={handleSearch}
              enterButton={<SearchOutlined />}
              size="large"
              allowClear
              className="crm-search-input"
            />
            <Tooltip title="Press '/' to focus search, 'Esc' to clear">
              <Text type="secondary" className="crm-search-hint-text">
                <kbd className="crm-kbd">/</kbd> to search
              </Text>
            </Tooltip>
          </Space>
          {searchText && (
            <Text type="secondary">
              Found <Text strong>{filteredCustomers.length}</Text> of {allCustomers.length} customers
            </Text>
          )}
        </Space>
      </Card>

      {/* Customers Table */}
      <Card 
        className="crm-table-card"
        extra={
          <Button 
            icon={<ReloadOutlined />} 
            onClick={() => loadMyCustomers(tripCountry)}
            loading={loading}
          >
            Refresh
          </Button>
        }
      >
        {filteredCustomers.length > 0 ? (
          <Table
            dataSource={filteredCustomers}
            columns={columns}
            rowKey="id"
            size="small"
            rowClassName={() => 'compact-row'}
            onRow={(record) => ({
              onClick: () => {
                setSelectedCustomer({ id: record.id, customer_name: record.customer_name });
                setSalesHistoryModalVisible(true);
              },
              style: { cursor: 'pointer' }
            })}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: filteredCustomers.length,
              showSizeChanger: true,
              showQuickJumper: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} customers`
            }}
            onChange={(pag) => setPagination({ current: pag.current, pageSize: pag.pageSize })}
            scroll={{ x: 800 }}
          />
        ) : (
          <Empty 
            description={searchText ? "No customers match your search" : "No customers assigned yet"}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
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

export default MyCustomers;
