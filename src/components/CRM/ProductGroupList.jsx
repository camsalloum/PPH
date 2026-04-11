/**
 * Product Group List - Product Management
 * Admin view for managing CRM product groups
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Card, Table, Typography, Space, Tag, Button, Switch, InputNumber,
  Input, Modal, Form, App, Tooltip, Row, Col, Statistic, Empty,
  Select, Divider, Tabs
} from 'antd';
import {
  AppstoreOutlined,
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  FieldTimeOutlined,
  PercentageOutlined,
  SettingOutlined,
  ExperimentOutlined
} from '@ant-design/icons';
import axios from 'axios';
import CurrencySymbol from '../common/CurrencySymbol';
import './CRM.css';
import { useAuth } from '../../contexts/AuthContext';
import { CRM_FULL_ACCESS_ROLES } from '../../utils/roleConstants';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const DIMENSION_OPTIONS = [
  { value: 'width_mm', label: 'Width (mm)' },
  { value: 'length_mm', label: 'Length / Cut-off (mm)' },
  { value: 'thickness_um', label: 'Thickness (μm)' },
];
const UNIT_OPTIONS = [
  { value: 'KGS', label: 'KGS' },
  { value: 'PCS', label: 'PCS' },
  { value: 'MTR', label: 'MTR' },
  { value: 'SQM', label: 'SQM' },
];

const ProductGroupList = () => {
  const { message } = App.useApp();
  const { user } = useAuth();
  const navigate = useNavigate();
  const userLevel = Number(user?.designation_level) || 0;
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [editForm] = Form.useForm();
  const [configForm] = Form.useForm();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);

  // BUG-04 fix: Use shared role constant with level check
  const isAdmin = CRM_FULL_ACCESS_ROLES.includes(user?.role) && userLevel >= 6;

  // Load products
  const loadProducts = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      const res = await axios.get(`${API_BASE_URL}/api/crm/products`, {
        params: showInactive ? {} : { active_only: 'true' },
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.data.success) {
        setProducts(res.data.data || []);
      }
    } catch (error) {
      console.error('Error loading products:', error);
      message.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [showInactive]);

  // Load config for a product group
  const loadConfig = async (productId) => {
    try {
      setLoadingConfig(true);
      const token = localStorage.getItem('auth_token');
      const res = await axios.get(`${API_BASE_URL}/api/crm/products/${productId}/config`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const cfg = res.data?.data;
      configForm.setFieldsValue({
        available_dimensions: cfg?.available_dimensions || ['width_mm', 'length_mm', 'thickness_um'],
        default_unit: cfg?.default_unit || 'KGS',
        available_units: cfg?.available_units || ['KGS', 'PCS', 'MTR', 'SQM'],
        config_notes: cfg?.notes || '',
      });
    } catch {
      configForm.setFieldsValue({
        available_dimensions: ['width_mm', 'length_mm', 'thickness_um'],
        default_unit: 'KGS',
        available_units: ['KGS', 'PCS', 'MTR', 'SQM'],
        config_notes: '',
      });
    } finally {
      setLoadingConfig(false);
    }
  };

  // Open edit modal
  const handleEdit = (product) => {
    setSelectedProduct(product);
    editForm.setFieldsValue({
      is_active: product.is_active,
      display_order: product.display_order,
      description: product.description,
      min_order_qty: product.min_order_qty ? parseFloat(product.min_order_qty) : null,
      min_order_value: product.min_order_value ? parseFloat(product.min_order_value) : null,
      lead_time_days: product.lead_time_days,
      commission_rate: product.commission_rate ? parseFloat(product.commission_rate) * 100 : null,
      monthly_target: product.monthly_target ? parseFloat(product.monthly_target) : null,
      target_margin_pct: product.target_margin_pct ? parseFloat(product.target_margin_pct) : null,
      price_floor: product.price_floor ? parseFloat(product.price_floor) : null,
      sales_notes: product.sales_notes,
      internal_notes: product.internal_notes
    });
    loadConfig(product.id);
    setModalVisible(true);
  };

  // Save changes (general + config)
  const handleSave = async () => {
    try {
      const values = await editForm.validateFields();
      const configValues = configForm.getFieldsValue();
      setSaving(true);

      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };
      const updateData = {
        ...values,
        commission_rate: values.commission_rate ? values.commission_rate / 100 : null
      };

      const [res, configRes] = await Promise.all([
        axios.put(
          `${API_BASE_URL}/api/crm/products/${selectedProduct.id}`,
          updateData,
          { headers }
        ),
        axios.put(
          `${API_BASE_URL}/api/crm/products/${selectedProduct.id}/config`,
          {
            available_dimensions: configValues.available_dimensions,
            available_units: configValues.available_units,
            default_unit: configValues.default_unit,
            notes: configValues.config_notes || null,
          },
          { headers }
        ),
      ]);

      if (res.data.success) {
        message.success('Product updated successfully');
        setModalVisible(false);
        loadProducts();
      } else {
        message.error(res.data.error || 'Failed to update product');
      }
    } catch (error) {
      console.error('Error saving product:', error);
      message.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // Table columns
  const columns = [
    {
      title: 'Order',
      dataIndex: 'display_order',
      key: 'display_order',
      width: 70,
      align: 'center',
      sorter: (a, b) => a.display_order - b.display_order,
      render: (order) => <Text type="secondary">{order}</Text>
    },
    {
      title: 'Product Group',
      dataIndex: 'product_group',
      key: 'product_group',
      render: (name, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary" className="crm-text-xs">
            {record.material} / {record.process}
          </Text>
        </Space>
      )
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 90,
      align: 'center',
      render: (active) => (
        <Tag 
          icon={active ? <CheckCircleOutlined /> : null}
          color={active ? 'success' : 'default'}
        >
          {active ? 'Active' : 'Inactive'}
        </Tag>
      )
    },
    {
      title: 'Min Order',
      key: 'min_order',
      width: 120,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text className="crm-text-sm">
            Qty: {record.min_order_qty || '-'}
          </Text>
          <Text className="crm-text-sm">
            Value: {record.min_order_value ? <><CurrencySymbol code="AED" /> {parseFloat(record.min_order_value).toLocaleString()}</> : '-'}
          </Text>
        </Space>
      )
    },
    {
      title: 'Lead Time',
      dataIndex: 'lead_time_days',
      key: 'lead_time_days',
      width: 100,
      align: 'center',
      render: (days) => days ? (
        <Tag icon={<FieldTimeOutlined />}>
          {days} days
        </Tag>
      ) : '-'
    },
    {
      title: 'Commission',
      dataIndex: 'commission_rate',
      key: 'commission_rate',
      width: 100,
      align: 'center',
      render: (rate) => rate ? (
        <Tag color="green" icon={<PercentageOutlined />}>
          {(parseFloat(rate) * 100).toFixed(1)}%
        </Tag>
      ) : '-'
    },
    {
      title: 'Monthly Target',
      dataIndex: 'monthly_target',
      key: 'monthly_target',
      width: 120,
      align: 'right',
      render: (target) => target ? (
        <Text strong className="crm-text-primary">
          <CurrencySymbol code="AED" /> {parseFloat(target).toLocaleString()}
        </Text>
      ) : '-'
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      align: 'center',
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title={isAdmin ? "Edit" : "View Only (Admin required)"}>
            <Button 
              type="primary"
              ghost
              size="small" 
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
              disabled={!isAdmin}
            >
              Edit
            </Button>
          </Tooltip>
          <Tooltip title="BOM Configuration">
            <Button
              size="small"
              icon={<ExperimentOutlined />}
              onClick={() => navigate(`/mes/master-data/bom/${record.id}`)}
              disabled={!isAdmin}
            >
              BOM
            </Button>
          </Tooltip>
        </Space>
      )
    }
  ];

  // Stats
  const activeCount = products.filter(p => p.is_active).length;
  const totalTarget = products.reduce((sum, p) => sum + (parseFloat(p.monthly_target) || 0), 0);

  return (
    <div className="crm-product-list crm-animate-in">
      {/* Page Header */}
      <Space className="crm-header-space">
        <div className="crm-page-title crm-mb-0">
          <AppstoreOutlined />
          <Title level={2}>Product Groups</Title>
          <Tag color="orange">{products.length} products</Tag>
        </div>
        <Space>
          <Switch
            checked={showInactive}
            onChange={setShowInactive}
            checkedChildren="All"
            unCheckedChildren="Active Only"
          />
          <Button 
            icon={<ReloadOutlined />} 
            onClick={loadProducts}
            loading={loading}
          >
            Refresh
          </Button>
        </Space>
      </Space>

      {/* Stats Row */}
      <Row gutter={[20, 20]} className="crm-row-mb-24">
        <Col xs={12} sm={6}>
          <Card>
            <Statistic 
              title="Total Products"
              value={products.length}
              prefix={<AppstoreOutlined style={{ color: '#fa8c16' }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic 
              title="Active"
              value={activeCount}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic 
              title="Inactive"
              value={products.length - activeCount}
              valueStyle={{ color: '#8c8c8c' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic 
              title="Total Monthly Target"
              value={totalTarget}
              prefix={<span style={{ color: '#1890ff' }}><CurrencySymbol code="AED" /></span>}
              precision={0}
            />
          </Card>
        </Col>
      </Row>

      {/* Products Table */}
      <Card className="crm-table-card">
        <Table
          dataSource={products}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={false}
          scroll={{ x: 900 }}
          locale={{
            emptyText: <Empty description="No products found" />
          }}
        />
      </Card>

      {/* Edit Modal */}
      <Modal
        title={
          <Space>
            <EditOutlined />
            <span>Edit Product: {selectedProduct?.product_group}</span>
          </Space>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setModalVisible(false)}>
            Cancel
          </Button>,
          <Button 
            key="save" 
            type="primary" 
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
          >
            Save Changes
          </Button>
        ]}
        width={650}
      >
        <Tabs
          defaultActiveKey="general"
          items={[
            {
              key: 'general',
              label: <span><EditOutlined /> General</span>,
              children: (
                <Form form={editForm} layout="vertical">
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name="is_active" label="Active" valuePropName="checked">
                        <Switch checkedChildren="Yes" unCheckedChildren="No" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="display_order" label="Display Order">
                        <InputNumber min={0} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item name="description" label="Description">
                    <TextArea rows={2} placeholder="Product description..." />
                  </Form.Item>

                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item name="min_order_qty" label="Min Order Qty">
                        <InputNumber min={0} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="min_order_value" label="Min Order Value ($)">
                        <InputNumber min={0} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="lead_time_days" label="Lead Time (days)">
                        <InputNumber min={0} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item name="commission_rate" label="Commission (%)">
                        <InputNumber min={0} max={100} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="monthly_target" label="Monthly Target ($)">
                        <InputNumber min={0} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="target_margin_pct" label="Target Margin (%)">
                        <InputNumber min={0} max={100} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item name="price_floor" label="Price Floor ($)">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>

                  <Form.Item name="sales_notes" label="Sales Notes">
                    <TextArea rows={2} placeholder="Notes visible to sales team..." />
                  </Form.Item>

                  <Form.Item name="internal_notes" label="Internal Notes (Admin Only)">
                    <TextArea rows={2} placeholder="Internal notes..." />
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'specifications',
              label: <span><SettingOutlined /> Specifications</span>,
              forceRender: true,
              children: (
                <Form form={configForm} layout="vertical">
                  <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                    Configure which dimensions and units are available when a sales rep creates a price quotation inquiry for this product group.
                  </Text>

                  <Form.Item
                    name="available_dimensions"
                    label="Available Dimensions"
                    tooltip="Which dimension fields should appear in the inquiry form"
                  >
                    <Select mode="multiple" placeholder="Select dimensions..." allowClear>
                      {DIMENSION_OPTIONS.map(d => (
                        <Option key={d.value} value={d.value}>{d.label}</Option>
                      ))}
                    </Select>
                  </Form.Item>

                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="available_units"
                        label="Available Units"
                        tooltip="Which quantity units can be selected"
                      >
                        <Select mode="multiple" placeholder="Select units..." allowClear>
                          {UNIT_OPTIONS.map(u => (
                            <Option key={u.value} value={u.value}>{u.label}</Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="default_unit" label="Default Unit">
                        <Select placeholder="Default unit...">
                          {UNIT_OPTIONS.map(u => (
                            <Option key={u.value} value={u.value}>{u.label}</Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                  </Row>

                  <Divider dashed style={{ margin: '12px 0' }} />

                  <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                    Materials, processes, and machines configuration will be set up together per product group.
                  </Text>

                  <Form.Item name="config_notes" label="Spec Notes">
                    <TextArea rows={2} placeholder="Notes about this product group's specification requirements..." />
                  </Form.Item>
                </Form>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
};

export default ProductGroupList;
