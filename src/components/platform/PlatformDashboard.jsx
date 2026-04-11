import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation, Routes, Route, Link } from 'react-router-dom';
import { Card, Row, Col, Statistic, Table, Tag, Button, Typography, Space, Avatar, Dropdown, Badge, Menu, Modal, Form, Input, Select, Switch, DatePicker, App } from 'antd';
import PlanManagement from './PlanManagement';
import { 
  BuildOutlined, 
  TeamOutlined, 
  DollarOutlined, 
  GlobalOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  PlusOutlined,
  ReloadOutlined,
  AppstoreOutlined,
  CreditCardOutlined
} from '@ant-design/icons';
import axios from 'axios';
import './PlatformDashboard.css';

const { Title, Text } = Typography;
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

// ============================================================
// AXIOS INTERCEPTOR FOR AUTHENTICATION
// Ensures token is sent with every request
// ============================================================
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

const CompaniesView = ({ companies, stats, loading, handleManageCompany, handleViewMetrics, loadData }) => {
  return (
    <>
      {/* Stats Row */}
      <Row gutter={[24, 24]} style={{ marginBottom: 24 }} className="stats-row">
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic 
              title="Total Companies" 
              value={companies.length} 
              prefix={<BuildOutlined style={{ color: '#1890ff' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic 
              title="Total Users" 
              value={companies.reduce((sum, c) => sum + parseInt(c.user_count || 0), 0)} 
              prefix={<TeamOutlined style={{ color: '#52c41a' }} />}
              suffix={<Text type="secondary" style={{ fontSize: 12 }}>(reported)</Text>}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic 
              title="Active Subscriptions" 
              value={companies.filter(c => c.is_active).length} 
              prefix={<DollarOutlined style={{ color: '#faad14' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic 
              title="Countries" 
              value={new Set(companies.map(c => c.country).filter(Boolean)).size}
              prefix={<GlobalOutlined style={{ color: '#722ed1' }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* Companies Table */}
      <Card
        title="Companies"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadData}>
              Refresh
            </Button>
            <Button type="primary" icon={<PlusOutlined />} disabled title="Coming soon">
              Add Company
            </Button>
          </Space>
        }
      >
        <CompaniesTable companies={companies} loading={loading} handleManageCompany={handleManageCompany} handleViewMetrics={handleViewMetrics} />
      </Card>
    </>
  );
};

const CompaniesTable = ({ companies, loading, handleManageCompany, handleViewMetrics }) => {
  const companiesColumns = [
    {
      title: 'Company',
      dataIndex: 'company_name',
      key: 'company_name',
      render: (name, record) => (
        <Space>
          <Avatar style={{ backgroundColor: '#1890ff' }}>
            {name?.charAt(0)?.toUpperCase()}
          </Avatar>
          <div>
            <Text strong>{name}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>{record.company_code}</Text>
          </div>
        </Space>
      )
    },
    {
      title: 'Plan',
      dataIndex: 'plan_name',
      key: 'plan_name',
      render: (plan) => (
        <Tag color={plan === 'Enterprise' ? 'gold' : plan === 'Professional' ? 'blue' : 'default'}>
          {plan || 'Free'}
        </Tag>
      )
    },
    {
      title: 'Divisions',
      dataIndex: 'division_count',
      key: 'division_count',
      align: 'center',
      render: (count) => count || 0
    },
    {
      title: 'Users',
      dataIndex: 'user_count',
      key: 'user_count',
      align: 'center',
      render: (count, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{count || 0}</Text>
          {record.metrics_last_reported_at ? (
            <Text type="secondary" style={{ fontSize: 10 }}>
              {new Date(record.metrics_last_reported_at).toLocaleDateString()}
            </Text>
          ) : (
            <Text type="warning" style={{ fontSize: 10 }}>Not reported</Text>
          )}
        </Space>
      )
    },
    {
      title: 'Country',
      dataIndex: 'country',
      key: 'country',
      render: (country) => country || '-'
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active) => (
        <Badge status={active ? 'success' : 'error'} text={active ? 'Active' : 'Inactive'} />
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button 
            type="link" 
            size="small"
            onClick={() => handleManageCompany(record)}
          >
            Manage
          </Button>
          <Button 
            type="link" 
            size="small"
            onClick={() => handleViewMetrics(record)}
          >
            View Metrics
          </Button>
        </Space>
      )
    }
  ];

  return (
    <Table
      columns={companiesColumns}
      dataSource={companies}
      rowKey="company_id"
      loading={loading}
      pagination={{ pageSize: 10 }}
    />
  );
};

const PlatformDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();
  const [companies, setCompanies] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [manageModalVisible, setManageModalVisible] = useState(false);
  const [metricsModalVisible, setMetricsModalVisible] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    // Check if user is platform admin
    if (!user?.isPlatformAdmin) {
      navigate('/dashboard', { replace: true });
      return;
    }
    loadData();
  }, [user, navigate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [companiesRes, statsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/platform/auth/companies`),
        axios.get(`${API_BASE_URL}/api/platform/stats`).catch(() => ({ data: null }))
      ]);

      if (companiesRes.data.success) {
        setCompanies(companiesRes.data.companies);
      }
      if (statsRes.data) {
        setStats(statsRes.data);
      }
    } catch (error) {
      console.error('Failed to load platform data:', error);
    }
    setLoading(false);
  };

  const handleManageCompany = (company) => {
    setSelectedCompany(company);
    form.setFieldsValue({
      company_name: company.company_name,
      country: company.country,
      email: company.email,
      phone: company.phone,
      timezone: company.timezone,
      currency_code: company.currency_code,
      is_active: company.is_active,
      subscription_status: company.subscription_status,
    });
    setManageModalVisible(true);
  };

  const handleSaveCompany = async () => {
    try {
      const values = await form.validateFields();
      
      // Update company via API
      const response = await axios.put(
        `${API_BASE_URL}/api/platform/auth/companies/${selectedCompany.company_id}`,
        values
      );

      if (response.data.success) {
        message.success('Company updated successfully');
        setManageModalVisible(false);
        loadData(); // Reload data
      }
    } catch (error) {
      console.error('Failed to update company:', error);
      message.error('Failed to update company');
    }
  };

  const handleViewMetrics = (company) => {
    setSelectedCompany(company);
    setMetricsModalVisible(true);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const userMenuItems = [
    { key: 'profile', icon: <UserOutlined />, label: 'Profile' },
    { key: 'settings', icon: <SettingOutlined />, label: 'Settings' },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', onClick: handleLogout }
  ];

  const companiesColumns = [
    {
      title: 'Company',
      dataIndex: 'company_name',
      key: 'company_name',
      render: (name, record) => (
        <Space>
          <Avatar style={{ backgroundColor: '#1890ff' }}>
            {name?.charAt(0)?.toUpperCase()}
          </Avatar>
          <div>
            <Text strong>{name}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>{record.company_code}</Text>
          </div>
        </Space>
      )
    },
    {
      title: 'Plan',
      dataIndex: 'plan_name',
      key: 'plan_name',
      render: (plan) => (
        <Tag color={plan === 'Enterprise' ? 'gold' : plan === 'Professional' ? 'blue' : 'default'}>
          {plan || 'Free'}
        </Tag>
      )
    },
    {
      title: 'Divisions',
      dataIndex: 'division_count',
      key: 'division_count',
      align: 'center',
      render: (count) => count || 0
    },
    {
      title: 'Users',
      dataIndex: 'user_count',
      key: 'user_count',
      align: 'center',
      render: (count, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{count || 0}</Text>
          {record.metrics_last_reported_at ? (
            <Text type="secondary" style={{ fontSize: 10 }}>
              {new Date(record.metrics_last_reported_at).toLocaleDateString()}
            </Text>
          ) : (
            <Text type="warning" style={{ fontSize: 10 }}>Not reported</Text>
          )}
        </Space>
      )
    },
    {
      title: 'Country',
      dataIndex: 'country',
      key: 'country',
      render: (country) => country || '-'
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active) => (
        <Badge status={active ? 'success' : 'error'} text={active ? 'Active' : 'Inactive'} />
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button 
            type="link" 
            size="small"
            onClick={() => handleManageCompany(record)}
          >
            Manage
          </Button>
          <Button 
            type="link" 
            size="small"
            onClick={() => handleViewMetrics(record)}
          >
            View Metrics
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div className="platform-dashboard">
      {/* Header */}
      <header className="platform-header">
        <div className="header-left">
          <img 
            src="/uploads/logos/PPH%20without%20BG.png" 
            alt="ProPackHub" 
            className="platform-logo"
          />
          <div className="header-title">
            <Title level={4} style={{ margin: 0, color: '#fff' }}>ProPackHub</Title>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Platform Administration</Text>
          </div>
        </div>
        <div className="header-right">
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Space className="user-menu-trigger">
              <Avatar style={{ backgroundColor: '#52c41a' }}>
                {user?.name?.charAt(0)?.toUpperCase() || 'A'}
              </Avatar>
              <div className="user-info">
                <Text style={{ color: '#fff' }}>{user?.name}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Platform Admin</Text>
              </div>
            </Space>
          </Dropdown>
        </div>
      </header>

      {/* Navigation Menu */}
      <Menu
        mode="horizontal"
        selectedKeys={[location.pathname === '/platform/plans' ? 'plans' : 'companies']}
        style={{ marginBottom: 0 }}
      >
        <Menu.Item key="companies" icon={<AppstoreOutlined />}>
          <Link to="/platform">Companies</Link>
        </Menu.Item>
        <Menu.Item key="plans" icon={<CreditCardOutlined />}>
          <Link to="/platform/plans">Subscription Plans</Link>
        </Menu.Item>
      </Menu>

      {/* Main Content */}
      <main className="platform-content">
        <Routes>
          <Route path="/" element={
            <CompaniesView 
              companies={companies}
              stats={stats}
              loading={loading}
              handleManageCompany={handleManageCompany}
              handleViewMetrics={handleViewMetrics}
              loadData={loadData}
            />
          } />
          <Route path="/plans" element={<PlanManagement />} />
        </Routes>
      </main>

      {/* Company Management Modal */}
      <Modal
        title={`Manage Company: ${selectedCompany?.company_name}`}
        open={manageModalVisible}
        onCancel={() => setManageModalVisible(false)}
        onOk={handleSaveCompany}
        width={700}
        okText="Save Changes"
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item 
                label="Company Name" 
                name="company_name"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item 
                label="Country" 
                name="country"
              >
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item 
                label="Email" 
                name="email"
                rules={[{ type: 'email' }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item 
                label="Phone" 
                name="phone"
              >
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item 
                label="Timezone" 
                name="timezone"
              >
                <Select>
                  <Select.Option value="Asia/Dubai">Asia/Dubai</Select.Option>
                  <Select.Option value="America/New_York">America/New_York</Select.Option>
                  <Select.Option value="Europe/London">Europe/London</Select.Option>
                  <Select.Option value="Asia/Singapore">Asia/Singapore</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item 
                label="Currency" 
                name="currency_code"
              >
                <Select>
                  <Select.Option value="AED">AED - UAE Dirham</Select.Option>
                  <Select.Option value="USD">USD - US Dollar</Select.Option>
                  <Select.Option value="EUR">EUR - Euro</Select.Option>
                  <Select.Option value="GBP">GBP - British Pound</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item 
                label="Subscription Status" 
                name="subscription_status"
              >
                <Select>
                  <Select.Option value="trial">Trial</Select.Option>
                  <Select.Option value="active">Active</Select.Option>
                  <Select.Option value="suspended">Suspended</Select.Option>
                  <Select.Option value="cancelled">Cancelled</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item 
                label="Active Status" 
                name="is_active"
                valuePropName="checked"
              >
                <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Metrics Modal */}
      <Modal
        title={`Metrics: ${selectedCompany?.company_name}`}
        open={metricsModalVisible}
        onCancel={() => setMetricsModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setMetricsModalVisible(false)}>
            Close
          </Button>
        ]}
        width={600}
      >
        {selectedCompany && (
          <div style={{ padding: '16px 0' }}>
            <Row gutter={[16, 24]}>
              <Col span={12}>
                <Card size="small">
                  <Statistic 
                    title="Total Users" 
                    value={selectedCompany.user_count || 0}
                    prefix={<TeamOutlined style={{ color: '#1890ff' }} />}
                  />
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small">
                  <Statistic 
                    title="Divisions" 
                    value={selectedCompany.division_count || 0}
                    prefix={<BuildOutlined style={{ color: '#52c41a' }} />}
                  />
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small">
                  <Statistic 
                    title="Subscription Plan" 
                    value={selectedCompany.plan_name || 'None'}
                    prefix={<CreditCardOutlined style={{ color: '#722ed1' }} />}
                  />
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small">
                  <Statistic 
                    title="Status" 
                    value={selectedCompany.subscription_status || 'unknown'}
                    valueStyle={{ 
                      color: selectedCompany.subscription_status === 'active' ? '#52c41a' : 
                             selectedCompany.subscription_status === 'suspended' ? '#faad14' : '#ff4d4f'
                    }}
                  />
                </Card>
              </Col>
            </Row>
            
            <Card size="small" style={{ marginTop: 16 }}>
              <Title level={5} style={{ marginBottom: 16 }}>Company Details</Title>
              <Row gutter={[16, 8]}>
                <Col span={8}><Text type="secondary">Company Code:</Text></Col>
                <Col span={16}><Text strong>{selectedCompany.company_code}</Text></Col>
                
                <Col span={8}><Text type="secondary">Country:</Text></Col>
                <Col span={16}><Text>{selectedCompany.country || '-'}</Text></Col>
                
                <Col span={8}><Text type="secondary">Email:</Text></Col>
                <Col span={16}><Text>{selectedCompany.email || '-'}</Text></Col>
                
                <Col span={8}><Text type="secondary">Timezone:</Text></Col>
                <Col span={16}><Text>{selectedCompany.timezone || '-'}</Text></Col>
                
                <Col span={8}><Text type="secondary">Currency:</Text></Col>
                <Col span={16}><Text>{selectedCompany.currency_code || '-'}</Text></Col>
                
                <Col span={8}><Text type="secondary">Created:</Text></Col>
                <Col span={16}><Text>{selectedCompany.created_at ? new Date(selectedCompany.created_at).toLocaleDateString() : '-'}</Text></Col>
                
                <Col span={8}><Text type="secondary">Metrics Updated:</Text></Col>
                <Col span={16}>
                  <Text>
                    {selectedCompany.metrics_last_reported_at 
                      ? new Date(selectedCompany.metrics_last_reported_at).toLocaleString() 
                      : 'Never'}
                  </Text>
                </Col>
              </Row>
            </Card>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PlatformDashboard;
