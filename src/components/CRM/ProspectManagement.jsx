/**
 * ProspectManagement - Full Prospect Lifecycle Management
 * 
 * Features:
 * - View all prospects with status filtering
 * - Add new prospects directly (not via budget)
 * - Update prospect status (Lead → Prospect → Converted)
 * - Manual conversion
 * - Run automatic conversion detection
 * - View conversion metrics
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Card, Table, Tag, Space, Button, Typography, Empty, Spin, Alert,
  Modal, Form, Input, Select, Tooltip, Statistic, Row, Col, App,
  Progress, List
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, UserAddOutlined, 
  GlobalOutlined, CheckCircleOutlined, ClockCircleOutlined,
  CloseCircleOutlined, SyncOutlined, TrophyOutlined,
  ArrowUpOutlined, FireOutlined, TeamOutlined
} from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import { CRM_FULL_ACCESS_ROLES } from '../../utils/roleConstants';
import CurrencySymbol from '../common/CurrencySymbol';
import axios from 'axios';
import './CRM.css';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

// Status constants
const PROSPECT_STATUS = {
  LEAD: 'lead',
  PROSPECT: 'prospect',
  CONVERTED: 'converted',
  INACTIVE: 'inactive'
};

const statusColors = {
  lead: 'cyan',
  prospect: 'gold',
  converted: 'success',
  inactive: 'default'
};

const statusLabels = {
  lead: 'Lead',
  prospect: 'Prospect',
  converted: 'Converted',
  inactive: 'Inactive'
};

const ProspectManagement = () => {
  const { message } = App.useApp();
  const { user } = useAuth();
  const userLevel = Number(user?.designation_level) || 0;
  // BUG-04 fix: Use shared role constant with level check for consistency
  const isAdmin = CRM_FULL_ACCESS_ROLES.includes(user?.role) && userLevel >= 6;
  const [loading, setLoading] = useState(true);
  const [prospects, setProspects] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ year: new Date().getFullYear(), status: null });
  
  // Modal states
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [convertModalVisible, setConvertModalVisible] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [detectingConversions, setDetectingConversions] = useState(false);
  const [repGroups, setRepGroups] = useState([]);
  
  const [form] = Form.useForm();
  const [statusForm] = Form.useForm();
  const [assignForm] = Form.useForm();

  // Load data on mount and when filters change
  useEffect(() => {
    loadData();
  }, [filters]);

  // Load rep groups for assign modal (management only)
  useEffect(() => {
    if (!isAdmin) return;
    const loadRepGroups = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const res = await axios.get(`${API_BASE_URL}/api/crm/my-customers/map`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data.salesRepGroups) setRepGroups(res.data.salesRepGroups);
      } catch { /* non-critical */ }
    };
    loadRepGroups();
  }, [isAdmin]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };
      
      // Load prospects and metrics in parallel
      const [prospectsRes, metricsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/crm/prospects`, {
          headers,
          params: {
            year: filters.year,
            status: filters.status || undefined
          }
        }),
        axios.get(`${API_BASE_URL}/api/crm/prospects/metrics`, {
          headers,
          params: { year: filters.year }
        })
      ]);
      
      if (prospectsRes.data.success) {
        setProspects(prospectsRes.data.data || []);
      }
      if (metricsRes.data.success) {
        setMetrics(metricsRes.data.data);
      }
      
    } catch (error) {
      console.error('Error loading prospects:', error);
      setError(error.response?.data?.error || 'Failed to load prospects');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Create new prospect
  const handleCreateProspect = async (values) => {
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.post(`${API_BASE_URL}/api/crm/prospects`, values, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.data.success) {
        message.success('Prospect created successfully!');
        setAddModalVisible(false);
        form.resetFields();
        loadData();
      } else {
        message.error(res.data.error || 'Failed to create prospect');
      }
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to create prospect');
    }
  };

  // Update prospect status
  const handleUpdateStatus = async (values) => {
    if (!selectedProspect) return;
    
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.put(
        `${API_BASE_URL}/api/crm/prospects/${selectedProspect.id}/status`,
        values,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (res.data.success) {
        message.success('Status updated successfully!');
        setStatusModalVisible(false);
        statusForm.resetFields();
        loadData();
      } else {
        message.error(res.data.error || 'Failed to update status');
      }
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to update status');
    }
  };

  // Manual conversion
  const handleManualConvert = async (values) => {
    if (!selectedProspect) return;
    
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.post(
        `${API_BASE_URL}/api/crm/prospects/${selectedProspect.id}/convert`,
        { reason: values.reason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (res.data.success) {
        message.success(`${selectedProspect.customer_name} converted to customer!`);
        setConvertModalVisible(false);
        loadData();
      } else {
        message.error(res.data.error || 'Failed to convert');
      }
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to convert');
    }
  };

  // Run automatic conversion detection (admin only)
  const handleDetectConversions = async () => {
    try {
      setDetectingConversions(true);
      const token = localStorage.getItem('auth_token');
      const res = await axios.post(
        `${API_BASE_URL}/api/crm/prospects/detect-conversions`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (res.data.success) {
        const { checked, converted } = res.data;
        message.success(`${converted} of ${checked} prospects converted`);
        loadData();
      } else {
        message.error(res.data.error || 'Detection failed');
      }
    } catch (error) {
      message.error(error.response?.data?.error || 'Detection failed');
    } finally {
      setDetectingConversions(false);
    }
  };

  // Assign prospect to a rep group (management only)
  const handleAssignProspect = async (values) => {
    if (!selectedProspect) return;
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.patch(
        `${API_BASE_URL}/api/crm/prospects/${selectedProspect.id}/assign`,
        { sales_rep_group_name: values.sales_rep_group_name },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        message.success(`Assigned to ${values.sales_rep_group_name}`);
        setAssignModalVisible(false);
        assignForm.resetFields();
        loadData();
      } else {
        message.error(res.data.error || 'Failed to assign');
      }
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to assign');
    }
  };

  const columns = [
    {
      title: 'Customer Name',
      dataIndex: 'customer_name',
      key: 'customer_name',
      sorter: (a, b) => a.customer_name.localeCompare(b.customer_name),
      render: (name) => <Text strong>{name}</Text>,
      width: '25%'
    },
    {
      title: 'Country',
      dataIndex: 'country',
      key: 'country',
      width: 150,
      render: (country) => (
        <Space>
          <GlobalOutlined />
          {country || '-'}
        </Space>
      )
    },
    {
      title: 'Sales Rep',
      dataIndex: 'sales_rep_group',
      key: 'sales_rep_group',
      width: 180,
      ellipsis: true,
      render: (rep) => (
        <Tooltip title={rep}>
          <Space>
            <TeamOutlined />
            {rep}
          </Space>
        </Tooltip>
      )
    },
    {
      title: 'Budget Year',
      dataIndex: 'budget_year',
      key: 'budget_year',
      width: 100,
      align: 'center',
      render: (year) => <Tag color="blue">{year}</Tag>
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      align: 'center',
      render: (status) => (
        <Tag color={statusColors[status] || 'default'}>
          {statusLabels[status] || status}
        </Tag>
      )
    },
    {
      title: 'Actual Sales',
      dataIndex: 'actual_sales_total',
      key: 'actual_sales_total',
      width: 130,
      align: 'right',
      render: (val) => {
        const value = parseFloat(val) || 0;
        return value > 0 
          ? <Text type="success"><CurrencySymbol code="AED" /> {value.toLocaleString()}</Text>
          : <Text type="secondary">-</Text>;
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      render: (_, record) => (
        <Space>
          {isAdmin && (
            <Tooltip title="Assign to Rep">
              <Button
                size="small"
                icon={<TeamOutlined />}
                onClick={() => {
                  setSelectedProspect(record);
                  assignForm.setFieldsValue({ sales_rep_group_name: record.sales_rep_group });
                  setAssignModalVisible(true);
                }}
              />
            </Tooltip>
          )}
          <Tooltip title="Update Status">
            <Button 
              size="small" 
              icon={<ClockCircleOutlined />}
              onClick={() => {
                setSelectedProspect(record);
                statusForm.setFieldsValue({ status: record.status });
                setStatusModalVisible(true);
              }}
            />
          </Tooltip>
          {record.status !== PROSPECT_STATUS.CONVERTED && (
            <Tooltip title="Mark as Converted">
              <Button 
                size="small" 
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => {
                  setSelectedProspect(record);
                  setConvertModalVisible(true);
                }}
              />
            </Tooltip>
          )}
        </Space>
      )
    }
  ];

  // Render metrics cards
  const renderMetrics = () => {
    if (!metrics) return null;
    
    const { metrics: m, recentConversions } = metrics;
    
    return (
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Leads"
              value={m.leads}
              prefix={<UserAddOutlined />}
              valueStyle={{ color: '#13c2c2' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Active Prospects"
              value={m.prospects}
              prefix={<FireOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Converted to Customer"
              value={m.converted}
              prefix={<TrophyOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Conversion Rate"
              value={m.conversionRate}
              suffix="%"
              prefix={<ArrowUpOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
            <Progress 
              percent={m.conversionRate} 
              showInfo={false} 
              strokeColor="#1890ff"
              size="small"
              style={{ marginTop: 8 }}
            />
          </Card>
        </Col>
      </Row>
    );
  };

  // Render recent conversions sidebar
  const renderRecentConversions = () => {
    if (!metrics?.recentConversions?.length) {
      return <Empty description="No recent conversions" />;
    }
    
    return (
      <List
        size="small"
        dataSource={metrics.recentConversions}
        renderItem={item => (
          <List.Item>
            <List.Item.Meta
              avatar={<TrophyOutlined style={{ color: '#52c41a' }} />}
              title={item.customer_name}
              description={`${item.country} • ${new Date(item.converted_at).toLocaleDateString()}`}
            />
          </List.Item>
        )}
      />
    );
  };

  return (
    <div className="crm-prospect-management" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          <UserAddOutlined style={{ marginRight: 8 }} />
          Prospect Management
        </Title>
        <Space>
          <Select
            value={filters.year}
            onChange={(val) => setFilters(f => ({ ...f, year: val }))}
            style={{ width: 100 }}
          >
            {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
              <Option key={y} value={y}>{y}</Option>
            ))}
          </Select>
          <Select
            value={filters.status}
            onChange={(val) => setFilters(f => ({ ...f, status: val }))}
            placeholder="All Statuses"
            allowClear
            style={{ width: 140 }}
          >
            {Object.entries(statusLabels).map(([key, label]) => (
              <Option key={key} value={key}>{label}</Option>
            ))}
          </Select>
          <Button icon={<ReloadOutlined />} onClick={loadData}>
            Refresh
          </Button>
          {isAdmin && (
            <Button 
              icon={<SyncOutlined spin={detectingConversions} />} 
              onClick={handleDetectConversions}
              loading={detectingConversions}
            >
              Detect Conversions
            </Button>
          )}
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={() => setAddModalVisible(true)}
          >
            Add Prospect
          </Button>
        </Space>
      </div>

      {error && (
        <Alert 
          message="Error" 
          description={error} 
          type="error" 
          showIcon 
          closable 
          onClose={() => setError(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Metrics Dashboard */}
      {renderMetrics()}

      <Row gutter={24}>
        <Col xs={24} lg={18}>
          {/* Prospects Table */}
          <Card title="Prospects Pipeline" extra={<Text type="secondary">{prospects.length} prospects</Text>}>
            <Table
              dataSource={prospects}
              columns={columns}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 15, showSizeChanger: true }}
              size="middle"
              scroll={{ x: 900 }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={6}>
          {/* Recent Conversions Sidebar */}
          <Card title="Recent Conversions" size="small" style={{ marginBottom: 16 }}>
            {renderRecentConversions()}
          </Card>
          
          {/* Conversion Stats by Year */}
          {metrics?.conversionsByYear?.length > 0 && (
            <Card title="Conversions by Year" size="small">
              <List
                size="small"
                dataSource={metrics.conversionsByYear}
                renderItem={item => (
                  <List.Item extra={<Tag color="green">{item.conversions}</Tag>}>
                    <Text>{item.conversion_year}</Text>
                  </List.Item>
                )}
              />
            </Card>
          )}
        </Col>
      </Row>

      {/* Add Prospect Modal */}
      <Modal
        title="Add New Prospect"
        open={addModalVisible}
        onCancel={() => setAddModalVisible(false)}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateProspect}
        >
          <Form.Item
            name="customer_name"
            label="Customer Name"
            rules={[{ required: true, message: 'Please enter customer name' }]}
          >
            <Input placeholder="Enter customer/company name" />
          </Form.Item>
          <Form.Item
            name="country"
            label="Country"
            rules={[{ required: true, message: 'Please enter country' }]}
          >
            <Input placeholder="Enter country" />
          </Form.Item>
          <Form.Item
            name="sales_rep_group"
            label="Sales Rep / Group"
            rules={[{ required: true, message: 'Please enter sales rep' }]}
          >
            <Input placeholder="Your name or sales group" />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <TextArea rows={3} placeholder="Additional notes about this prospect..." />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">Create Prospect</Button>
              <Button onClick={() => setAddModalVisible(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Update Status Modal */}
      <Modal
        title={`Update Status: ${selectedProspect?.customer_name}`}
        open={statusModalVisible}
        onCancel={() => setStatusModalVisible(false)}
        footer={null}
      >
        <Form
          form={statusForm}
          layout="vertical"
          onFinish={handleUpdateStatus}
        >
          <Form.Item
            name="status"
            label="Status"
            rules={[{ required: true, message: 'Please select status' }]}
          >
            <Select>
              {Object.entries(statusLabels).map(([key, label]) => (
                <Option key={key} value={key}>{label}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <TextArea rows={3} placeholder="Reason for status change..." />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">Update Status</Button>
              <Button onClick={() => setStatusModalVisible(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Convert Modal */}
      <Modal
        title={<><TrophyOutlined style={{ color: '#52c41a' }} /> Convert to Customer</>}
        open={convertModalVisible}
        onCancel={() => setConvertModalVisible(false)}
        footer={null}
      >
        <p>
          Are you sure you want to mark <strong>{selectedProspect?.customer_name}</strong> as converted to a customer?
        </p>
        <p style={{ color: '#666' }}>
          This will update their status to "Converted" and log the conversion.
        </p>
        <Form layout="vertical" onFinish={handleManualConvert}>
          <Form.Item name="reason" label="Reason / Notes">
            <TextArea 
              rows={2} 
              placeholder="e.g., First order received, or sale pending sync..."
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<CheckCircleOutlined />}>
                Confirm Conversion
              </Button>
              <Button onClick={() => setConvertModalVisible(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Assign to Rep Modal */}
      <Modal
        title={`Assign: ${selectedProspect?.customer_name}`}
        open={assignModalVisible}
        onCancel={() => setAssignModalVisible(false)}
        footer={null}
      >
        <Form form={assignForm} layout="vertical" onFinish={handleAssignProspect}>
          <Form.Item
            name="sales_rep_group_name"
            label="Sales Rep Group"
            rules={[{ required: true, message: 'Please select a rep group' }]}
          >
            <Select showSearch placeholder="Select rep group" optionFilterProp="children">
              {repGroups.map(g => (
                <Option key={g} value={g}>{g}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<TeamOutlined />}>Assign</Button>
              <Button onClick={() => setAssignModalVisible(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProspectManagement;
