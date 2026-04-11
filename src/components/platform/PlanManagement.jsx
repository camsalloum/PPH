import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Descriptions, Space, Typography, Statistic, Row, Col, Modal, Button } from 'antd';
import { DollarOutlined, UserOutlined, DatabaseOutlined, ApartmentOutlined, CheckCircleOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title, Text } = Typography;
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const PlanManagement = () => {
  const [plans, setPlans] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [plansRes, companiesRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/platform/plans`),
        axios.get(`${API_BASE_URL}/api/platform/auth/companies`)
      ]);

      if (plansRes.data.success) {
        setPlans(plansRes.data.data);
      }
      if (companiesRes.data.success) {
        setCompanies(companiesRes.data.companies);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
    setLoading(false);
  };

  const showPlanDetails = (plan) => {
    setSelectedPlan(plan);
    setModalVisible(true);
  };

  const getCompaniesOnPlan = (planId) => {
    return companies.filter(c => c.plan_id === planId);
  };

  const formatPrice = (price) => {
    return price ? `$${parseFloat(price).toLocaleString()}` : 'Custom';
  };

  const renderFeatures = (features) => {
    if (!features) return null;
    
    const featureList = Object.entries(features).map(([key, value]) => {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      return (
        <div key={key} style={{ marginBottom: 8 }}>
          {value ? (
            <Text>
              <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
              {label}
            </Text>
          ) : (
            <Text type="secondary" delete>
              {label}
            </Text>
          )}
        </div>
      );
    });

    return <Space direction="vertical" size={4}>{featureList}</Space>;
  };

  const plansColumns = [
    {
      title: 'Plan',
      dataIndex: 'plan_name',
      key: 'plan_name',
      render: (name, record) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ fontSize: 16 }}>{name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.plan_code}</Text>
        </Space>
      )
    },
    {
      title: 'Pricing',
      key: 'pricing',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{formatPrice(record.monthly_price)}/month</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {formatPrice(record.annual_price)}/year
          </Text>
        </Space>
      )
    },
    {
      title: 'Limits',
      key: 'limits',
      render: (_, record) => (
        <Space direction="vertical" size={4}>
          <Space>
            <UserOutlined style={{ color: '#1890ff' }} />
            <Text>{record.max_users || 'Unlimited'} users</Text>
          </Space>
          <Space>
            <ApartmentOutlined style={{ color: '#52c41a' }} />
            <Text>{record.max_divisions || 'Unlimited'} divisions</Text>
          </Space>
          <Space>
            <DatabaseOutlined style={{ color: '#faad14' }} />
            <Text>{record.max_storage_gb || 'Unlimited'} GB</Text>
          </Space>
        </Space>
      )
    },
    {
      title: 'Active Companies',
      key: 'companies',
      align: 'center',
      render: (_, record) => {
        const count = getCompaniesOnPlan(record.plan_id).length;
        return (
          <Statistic value={count} valueStyle={{ fontSize: 24, fontWeight: 'bold' }} />
        );
      }
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active) => (
        <Tag color={active ? 'success' : 'default'}>
          {active ? 'Active' : 'Inactive'}
        </Tag>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Button type="link" onClick={() => showPlanDetails(record)}>
          View Details
        </Button>
      )
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={2}>Subscription Plans</Title>
        <Text type="secondary">Manage subscription plans and pricing</Text>
      </div>

      {/* Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Plans"
              value={plans.length}
              prefix={<DollarOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Active Plans"
              value={plans.filter(p => p.is_active).length}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Companies on Starter"
              value={getCompaniesOnPlan(1).length}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Companies on Enterprise"
              value={getCompaniesOnPlan(3).length}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Plans Table */}
      <Card>
        <Table
          columns={plansColumns}
          dataSource={plans}
          rowKey="plan_id"
          loading={loading}
          pagination={false}
        />
      </Card>

      {/* Plan Details Modal */}
      <Modal
        title={
          <Space>
            <Text strong style={{ fontSize: 18 }}>{selectedPlan?.plan_name}</Text>
            <Tag color={selectedPlan?.is_active ? 'success' : 'default'}>
              {selectedPlan?.is_active ? 'Active' : 'Inactive'}
            </Tag>
          </Space>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setModalVisible(false)}>
            Close
          </Button>
        ]}
        width={700}
      >
        {selectedPlan && (
          <>
            <Descriptions bordered column={2} style={{ marginBottom: 24 }}>
              <Descriptions.Item label="Plan Code" span={1}>
                {selectedPlan.plan_code}
              </Descriptions.Item>
              <Descriptions.Item label="Currency" span={1}>
                {selectedPlan.currency || 'USD'}
              </Descriptions.Item>
              <Descriptions.Item label="Monthly Price" span={1}>
                {formatPrice(selectedPlan.monthly_price)}
              </Descriptions.Item>
              <Descriptions.Item label="Annual Price" span={1}>
                {formatPrice(selectedPlan.annual_price)}
              </Descriptions.Item>
              <Descriptions.Item label="Max Users" span={1}>
                {selectedPlan.max_users || 'Unlimited'}
              </Descriptions.Item>
              <Descriptions.Item label="Max Divisions" span={1}>
                {selectedPlan.max_divisions || 'Unlimited'}
              </Descriptions.Item>
              <Descriptions.Item label="Max Storage" span={2}>
                {selectedPlan.max_storage_gb ? `${selectedPlan.max_storage_gb} GB` : 'Unlimited'}
              </Descriptions.Item>
            </Descriptions>

            <Title level={5}>Features</Title>
            {renderFeatures(selectedPlan.features)}

            <Title level={5} style={{ marginTop: 24 }}>Companies on This Plan</Title>
            {getCompaniesOnPlan(selectedPlan.plan_id).length > 0 ? (
              <ul>
                {getCompaniesOnPlan(selectedPlan.plan_id).map(company => (
                  <li key={company.company_id}>
                    <Text strong>{company.company_name}</Text>
                    <Text type="secondary"> ({company.company_code})</Text>
                  </li>
                ))}
              </ul>
            ) : (
              <Text type="secondary">No companies on this plan yet</Text>
            )}
          </>
        )}
      </Modal>
    </div>
  );
};

export default PlanManagement;
