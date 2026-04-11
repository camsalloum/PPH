import React, { useState, useEffect } from 'react';
import { 
  Card, Table, Tag, Button, Space, Modal, Select, 
  message, Spin, Empty, Tabs, Badge, Tooltip, Progress,
  Alert, Typography, Input
} from 'antd';
import { 
  GlobalOutlined, CheckCircleOutlined, CloseCircleOutlined,
  PlusOutlined, LinkOutlined, EyeInvisibleOutlined,
  SearchOutlined, ReloadOutlined, BulbOutlined
} from '@ant-design/icons';
import axios from 'axios';
import './PendingCountries.css';

const { Text, Title } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * Pending Countries Management Component
 * Allows admin to assign regions to unrecognized countries
 */
const PendingCountries = () => {
  const [loading, setLoading] = useState(false);
  const [pendingCountries, setPendingCountries] = useState([]);
  const [resolvedCountries, setResolvedCountries] = useState([]);
  const [counts, setCounts] = useState({ PENDING: 0, RESOLVED: 0, IGNORED: 0 });
  const [regions, setRegions] = useState([]);
  const [masterCountries, setMasterCountries] = useState([]);
  const [activeTab, setActiveTab] = useState('pending');
  const [resolveModalVisible, setResolveModalVisible] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [resolveAction, setResolveAction] = useState('ALIAS');
  const [selectedMasterCountry, setSelectedMasterCountry] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [pendingRes, resolvedRes, regionsRes, countriesRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/pending-countries?status=PENDING`),
        axios.get(`${API_BASE_URL}/api/pending-countries?status=all`),
        axios.get(`${API_BASE_URL}/api/pending-countries/regions`),
        axios.get(`${API_BASE_URL}/api/pending-countries/master-countries`)
      ]);

      if (pendingRes.data.success) {
        setPendingCountries(pendingRes.data.data);
        setCounts(pendingRes.data.counts);
      }
      
      if (resolvedRes.data.success) {
        setResolvedCountries(resolvedRes.data.data.filter(c => c.status !== 'PENDING'));
      }
      
      if (regionsRes.data.success) {
        setRegions(regionsRes.data.regions);
      }
      
      if (countriesRes.data.success) {
        setMasterCountries(countriesRes.data.countries);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      message.error('Failed to load pending countries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Run scan for unknown countries
  const runScan = async () => {
    setScanning(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/pending-countries/scan`, {
        sourceTable: 'all'
      });
      
      if (response.data.success) {
        message.success(response.data.message);
        fetchData();
      }
    } catch (error) {
      console.error('Error scanning:', error);
      message.error('Failed to scan for unknown countries');
    } finally {
      setScanning(false);
    }
  };

  // Open resolve modal
  const openResolveModal = (record) => {
    setSelectedCountry(record);
    setResolveAction(record.suggested_master_country ? 'ALIAS' : 'NEW_COUNTRY');
    setSelectedMasterCountry(record.suggested_master_country || null);
    setSelectedRegion(null);
    setResolveModalVisible(true);
  };

  // Handle resolve
  const handleResolve = async () => {
    if (resolveAction === 'ALIAS' && !selectedMasterCountry) {
      message.error('Please select a master country');
      return;
    }
    
    if (resolveAction === 'NEW_COUNTRY' && !selectedRegion) {
      message.error('Please select a region');
      return;
    }

    setResolving(true);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/pending-countries/${selectedCountry.id}/resolve`,
        {
          action: resolveAction,
          masterCountry: resolveAction === 'ALIAS' ? selectedMasterCountry : null,
          region: resolveAction === 'NEW_COUNTRY' ? selectedRegion : null
        }
      );

      if (response.data.success) {
        message.success(`Country "${selectedCountry.country_name}" resolved successfully`);
        setResolveModalVisible(false);
        fetchData();
      }
    } catch (error) {
      console.error('Error resolving:', error);
      message.error(error.response?.data?.error || 'Failed to resolve country');
    } finally {
      setResolving(false);
    }
  };

  // Quick actions
  const handleQuickAlias = async (record) => {
    if (!record.suggested_master_country) {
      openResolveModal(record);
      return;
    }

    setResolving(true);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/pending-countries/${record.id}/resolve`,
        {
          action: 'ALIAS',
          masterCountry: record.suggested_master_country
        }
      );

      if (response.data.success) {
        message.success(`"${record.country_name}" → "${record.suggested_master_country}"`);
        fetchData();
      }
    } catch (error) {
      message.error('Failed to apply alias');
    } finally {
      setResolving(false);
    }
  };

  const handleIgnore = async (record) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/pending-countries/${record.id}/resolve`,
        { action: 'IGNORED' }
      );

      if (response.data.success) {
        message.info(`"${record.country_name}" will be ignored`);
        fetchData();
      }
    } catch (error) {
      message.error('Failed to ignore country');
    }
  };

  // Columns for pending table
  const pendingColumns = [
    {
      title: 'Country Name',
      dataIndex: 'country_name',
      key: 'country_name',
      render: (text) => (
        <Space>
          <GlobalOutlined style={{ color: '#faad14' }} />
          <Text strong>{text}</Text>
        </Space>
      )
    },
    {
      title: 'Occurrences',
      dataIndex: 'occurrence_count',
      key: 'occurrence_count',
      width: 120,
      sorter: (a, b) => a.occurrence_count - b.occurrence_count,
      render: (count) => (
        <Badge count={count} showZero style={{ backgroundColor: count > 10 ? '#f5222d' : '#faad14' }} />
      )
    },
    {
      title: 'AI Suggestion',
      key: 'suggestion',
      width: 220,
      render: (_, record) => {
        if (!record.suggested_master_country) {
          return <Text type="secondary">No suggestion</Text>;
        }
        
        const confidence = Math.round((record.suggested_confidence || 0) * 100);
        return (
          <Space direction="vertical" size={2}>
            <Space>
              <BulbOutlined style={{ color: '#52c41a' }} />
              <Text>{record.suggested_master_country}</Text>
            </Space>
            <Progress 
              percent={confidence} 
              size="small" 
              strokeColor={confidence > 80 ? '#52c41a' : confidence > 50 ? '#faad14' : '#f5222d'}
              format={(p) => `${p}%`}
              style={{ width: 100 }}
            />
          </Space>
        );
      }
    },
    {
      title: 'Sample Customers',
      dataIndex: 'sample_customers',
      key: 'sample_customers',
      ellipsis: true,
      width: 200,
      render: (customers) => {
        if (!customers || customers.length === 0) return '-';
        return (
          <Tooltip title={customers.join(', ')}>
            <Text type="secondary" ellipsis>
              {customers.slice(0, 2).join(', ')}
              {customers.length > 2 && ` +${customers.length - 2} more`}
            </Text>
          </Tooltip>
        );
      }
    },
    {
      title: 'Source',
      dataIndex: 'source_table',
      key: 'source_table',
      width: 150,
      render: (source) => (
        <Tag color={source === 'fp_data_excel' ? 'blue' : 'green'}>
          {source === 'fp_data_excel' ? 'Actual Data' : 'Budget Data'}
        </Tag>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space>
          {record.suggested_master_country && (
            <Tooltip title={`Accept: Add as alias to "${record.suggested_master_country}"`}>
              <Button 
                type="primary" 
                size="small" 
                icon={<CheckCircleOutlined />}
                onClick={() => handleQuickAlias(record)}
              >
                Accept
              </Button>
            </Tooltip>
          )}
          <Button 
            size="small"
            onClick={() => openResolveModal(record)}
          >
            Assign
          </Button>
          <Tooltip title="Ignore this country">
            <Button 
              size="small" 
              danger
              icon={<EyeInvisibleOutlined />}
              onClick={() => handleIgnore(record)}
            />
          </Tooltip>
        </Space>
      )
    }
  ];

  // Columns for resolved table
  const resolvedColumns = [
    {
      title: 'Country Name',
      dataIndex: 'country_name',
      key: 'country_name',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'RESOLVED' ? 'green' : 'default'}>
          {status}
        </Tag>
      )
    },
    {
      title: 'Action Taken',
      dataIndex: 'resolved_action',
      key: 'resolved_action',
      render: (action, record) => {
        if (action === 'ALIAS') {
          return (
            <Space>
              <LinkOutlined />
              <Text>Alias → {record.resolved_master_country}</Text>
            </Space>
          );
        } else if (action === 'NEW_COUNTRY') {
          return (
            <Space>
              <PlusOutlined />
              <Text>New Country (Region: {record.resolved_region})</Text>
            </Space>
          );
        } else if (action === 'IGNORED') {
          return (
            <Space>
              <EyeInvisibleOutlined />
              <Text type="secondary">Ignored</Text>
            </Space>
          );
        }
        return '-';
      }
    },
    {
      title: 'Resolved By',
      dataIndex: 'resolved_by',
      key: 'resolved_by',
    },
    {
      title: 'Resolved At',
      dataIndex: 'resolved_at',
      key: 'resolved_at',
      render: (date) => date ? new Date(date).toLocaleDateString() : '-'
    }
  ];

  return (
    <div className="pending-countries-container">
      <Card className="pending-countries-card">
        <div className="pending-countries-header">
          <div>
            <Title level={4} style={{ margin: 0 }}>
              <GlobalOutlined style={{ marginRight: 8 }} />
              Country Management
            </Title>
            <Text type="secondary">
              Assign regions to unrecognized countries from uploaded data
            </Text>
          </div>
          <Space>
            <Button 
              icon={<ReloadOutlined spin={scanning} />}
              onClick={runScan}
              loading={scanning}
            >
              Scan for New
            </Button>
            <Button 
              icon={<ReloadOutlined />}
              onClick={fetchData}
              loading={loading}
            >
              Refresh
            </Button>
          </Space>
        </div>

        {counts.PENDING > 0 && (
          <Alert
            message={`${counts.PENDING} unrecognized countries need your attention`}
            description="These countries were found in uploaded data but don't match any master country. Please assign them to existing countries or add as new."
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          items={[
            {
              key: 'pending',
              label: (
                <Badge count={counts.PENDING} offset={[10, 0]}>
                  <span>Pending</span>
                </Badge>
              ),
              children: (
                <Table
                  dataSource={pendingCountries}
                  columns={pendingColumns}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 10 }}
                  locale={{
                    emptyText: (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="No pending countries! All countries are recognized."
                      />
                    )
                  }}
                />
              )
            },
            {
              key: 'resolved',
              label: (
                <Badge count={counts.RESOLVED + counts.IGNORED} offset={[10, 0]} style={{ backgroundColor: '#52c41a' }}>
                  <span>Resolved</span>
                </Badge>
              ),
              children: (
                <Table
                  dataSource={resolvedCountries}
                  columns={resolvedColumns}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 10 }}
                />
              )
            }
          ]}
        />
      </Card>

      {/* Resolve Modal */}
      <Modal
        title={
          <Space>
            <GlobalOutlined />
            <span>Assign Country: {selectedCountry?.country_name}</span>
          </Space>
        }
        open={resolveModalVisible}
        onCancel={() => setResolveModalVisible(false)}
        onOk={handleResolve}
        confirmLoading={resolving}
        okText="Apply"
      >
        <div className="resolve-modal-content">
          <div className="resolve-option-group">
            <Text strong>Choose Action:</Text>
            <Select
              value={resolveAction}
              onChange={setResolveAction}
              style={{ width: '100%', marginTop: 8 }}
            >
              <Option value="ALIAS">
                <Space>
                  <LinkOutlined />
                  Add as Alias to Existing Country
                </Space>
              </Option>
              <Option value="NEW_COUNTRY">
                <Space>
                  <PlusOutlined />
                  Add as New Country
                </Space>
              </Option>
            </Select>
          </div>

          {resolveAction === 'ALIAS' && (
            <div className="resolve-option-group">
              <Text strong>Select Master Country:</Text>
              <Select
                showSearch
                placeholder="Search and select a country"
                value={selectedMasterCountry}
                onChange={setSelectedMasterCountry}
                style={{ width: '100%', marginTop: 8 }}
                filterOption={(input, option) =>
                  option.children.toLowerCase().includes(input.toLowerCase())
                }
              >
                {masterCountries.map(c => (
                  <Option key={c.country} value={c.country}>
                    {c.country} ({c.region})
                  </Option>
                ))}
              </Select>
              
              {selectedCountry?.suggested_master_country && (
                <Alert
                  message={
                    <Space>
                      <BulbOutlined />
                      AI suggests: <Text strong>{selectedCountry.suggested_master_country}</Text>
                      ({Math.round((selectedCountry.suggested_confidence || 0) * 100)}% confidence)
                    </Space>
                  }
                  type="info"
                  style={{ marginTop: 8 }}
                />
              )}
            </div>
          )}

          {resolveAction === 'NEW_COUNTRY' && (
            <div className="resolve-option-group">
              <Text strong>Select Region:</Text>
              <Select
                showSearch
                placeholder="Select a region"
                value={selectedRegion}
                onChange={setSelectedRegion}
                style={{ width: '100%', marginTop: 8 }}
              >
                {regions.map(r => (
                  <Option key={r} value={r}>{r}</Option>
                ))}
              </Select>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default PendingCountries;
