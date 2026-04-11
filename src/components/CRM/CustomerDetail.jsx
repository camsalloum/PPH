/**
 * Customer Detail - Single Customer View with Edit Mode
 * Shows all customer information with ability to edit and save
 * 
 * READ-ONLY fields (from merging system):
 * - customer_code (auto-generated)
 * - customer_name (comes from merge rules)
 * 
 * EDITABLE fields by sales rep:
 * - All other fields including contact info, address, business details
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Card, Typography, Descriptions, Tag, Space, Button, Row, Col, 
  Spin, Empty, Breadcrumb, Divider, Avatar, Statistic, App,
  Form, Input, Select, Switch, Modal, Tooltip, Alert
} from 'antd';
import {
  ArrowLeftOutlined,
  UserOutlined,
  GlobalOutlined,
  PhoneOutlined,
  MailOutlined,
  BankOutlined,
  CalendarOutlined,
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  HomeOutlined,
  ExclamationCircleOutlined,
  LockOutlined,
  PlusOutlined,
  EnvironmentOutlined,
  AimOutlined,
  FileSearchOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import CustomerLocationPicker from './CustomerLocationPicker';
import ContactsTab from './ContactsTab';
import NotesTab from './NotesTab';
import ActivityFeed from './ActivityFeed';
import ActivityLogDrawer from './ActivityLogDrawer';
import TaskWidget from './TaskWidget';
import DealPipeline from './DealPipeline';
import CustomerInquiries from './CustomerInquiries';
import TechnicalBriefForm from './TechnicalBriefForm';
import PackagingProfile from './PackagingProfile';
import CustomerFieldVisits from './CustomerFieldVisits';
import EmailThreadView from './EmailThreadView';
import { COUNTRY_REGIONS } from '../../constants/regions';
import './CRM.css';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

// Editable field renderer (extracted to module scope to avoid re-creation on every render)
const EditableField = ({ editMode, name, children, type = 'text', options = [], allowAdd = false, onAdd, customValue, setCustomValue, placeholder }) => {
  if (!editMode) {
    return children || <Text type="secondary">-</Text>;
  }
  
  const fieldStyle = { margin: 0, width: '100%' };
  const inputStyle = { width: '100%' };
  
  if (type === 'select') {
    return (
      <Form.Item name={name} style={fieldStyle}>
        <Select 
          style={inputStyle}
          placeholder={placeholder || 'Select...'}
          allowClear
          showSearch
          optionFilterProp="children"
          dropdownRender={allowAdd ? (menu) => (
            <>
              {menu}
              <Divider style={{ margin: '8px 0' }} />
              <Space style={{ padding: '0 8px 4px' }}>
                <Input
                  placeholder="Add new..."
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  size="small"
                  style={{ width: 150 }}
                />
                <Button 
                  type="text" 
                  icon={<PlusOutlined />} 
                  onClick={() => onAdd()}
                  size="small"
                >
                  Add
                </Button>
              </Space>
            </>
          ) : undefined}
        >
          {options.map(opt => (
            <Option key={opt} value={opt}>{opt}</Option>
          ))}
        </Select>
      </Form.Item>
    );
  }
  
  if (type === 'textarea') {
    return (
      <Form.Item name={name} style={fieldStyle}>
        <TextArea rows={3} placeholder={placeholder} style={inputStyle} />
      </Form.Item>
    );
  }
  
  if (type === 'number') {
    return (
      <Form.Item name={name} style={fieldStyle}>
        <Input type="number" placeholder={placeholder} style={inputStyle} />
      </Form.Item>
    );
  }
  
  return (
    <Form.Item name={name} style={fieldStyle}>
      <Input placeholder={placeholder} style={inputStyle} />
    </Form.Item>
  );
};

// Read-only field (shows lock icon, extracted to module scope)
const ReadOnlyField = ({ label, value, tooltip }) => (
  <Descriptions.Item label={
    <Space>
      {label}
      <Tooltip title={tooltip || "This field is managed by the system and cannot be edited"}>
        <LockOutlined className="crm-lock-icon" />
      </Tooltip>
    </Space>
  }>
    {value || <Text type="secondary">-</Text>}
  </Descriptions.Item>
);

/**
 * Compute relationship health badge based on last activity and last transaction dates.
 * 🟢 Healthy: activity ≤14 days AND order ≤6 months
 * 🟡 Cooling: no activity 14-30 days OR no order 6-12 months
 * 🔴 At Risk: no activity 30+ days OR no order 12+ months
 * Default to "Cooling" if either date is null.
 */
const computeHealthBadge = (lastActivityDate, lastTransactionDate) => {
  const now = new Date();
  const dayMs = 86400000;
  const actDays = lastActivityDate ? Math.floor((now - new Date(lastActivityDate)) / dayMs) : null;
  const txnMonths = lastTransactionDate
    ? (now.getFullYear() - new Date(lastTransactionDate).getFullYear()) * 12 +
      (now.getMonth() - new Date(lastTransactionDate).getMonth())
    : null;

  // Default to Cooling if either date is null
  if (actDays === null || txnMonths === null) {
    return { emoji: '🟡', label: 'Cooling', color: '#faad14' };
  }
  // At Risk
  if (actDays > 30 || txnMonths > 12) {
    return { emoji: '🔴', label: 'At Risk', color: '#ff4d4f' };
  }
  // Healthy
  if (actDays <= 14 && txnMonths <= 6) {
    return { emoji: '🟢', label: 'Healthy', color: '#52c41a' };
  }
  // Cooling (everything else)
  return { emoji: '🟡', label: 'Cooling', color: '#faad14' };
};

const CustomerDetail = () => {
  const { message } = App.useApp();
  const { user } = useAuth();
  const isAdmin = ['admin', 'manager', 'sales_manager', 'sales_coordinator'].includes(user?.role);
  const { id } = useParams();
  const customerIdNum = Number.parseInt(id, 10) || 0;
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state || {};
  const expandInquiries = navState.expandInquiries || false;
  const openInquiryCapture = navState.openInquiryCapture || false;
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [tempLocation, setTempLocation] = useState({ lat: null, lng: null });
  const [detectedAddress, setDetectedAddress] = useState(null); // NEW: store detected address
  const inquiriesSectionRef = useRef(null);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [error, setError] = useState(null);
  const [editMode, setEditMode] = useState(false);
  
  // Google Maps URL handling
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [resolvingUrl, setResolvingUrl] = useState(false);
  
  // Country-region mapping from master_countries table
  const [countryRegionMap, setCountryRegionMap] = useState({});
  
  // Lookup data from database
  const [lookups, setLookups] = useState({
    industries: [],
    market_segments: [],
    customer_types: ['Company', 'Individual'],
    customer_groups: [],
    payment_terms: ['Net 30', 'Net 45', 'Net 60', 'Net 90', 'Due on Receipt', 'Prepaid'],
    countries: []
  });
  
  // Custom values added by user
  const [customIndustry, setCustomIndustry] = useState('');
  const [customSegment, setCustomSegment] = useState('');
  const [customGroup, setCustomGroup] = useState('');
  const [customPaymentTerms, setCustomPaymentTerms] = useState('');

  // Get region/territory for a country
  const getRegionForCountry = (countryName) => {
    if (!countryName) return null;
    
    // Try API mapping first
    if (countryRegionMap[countryName]) return countryRegionMap[countryName];
    
    // Fall back to hardcoded map
    if (COUNTRY_REGIONS[countryName]) return COUNTRY_REGIONS[countryName];
    
    // Try case-insensitive match
    const normalized = countryName.toLowerCase().trim();
    for (const [key, value] of Object.entries(countryRegionMap)) {
      if (key.toLowerCase() === normalized) return value;
    }
    for (const [key, value] of Object.entries(COUNTRY_REGIONS)) {
      if (key.toLowerCase() === normalized) return value;
    }
    return null;
  };

  // Load lookups from database
  const loadLookups = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      
      // Fetch lookups, countries, and country-region mapping in parallel
      const [lookupsRes, countriesRes, regionsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/crm/lookups`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_BASE_URL}/api/crm/customers/countries`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_BASE_URL}/api/crm/customers/country-regions`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      
      if (lookupsRes.data.success) {
        setLookups(prev => ({
          ...prev,
          ...lookupsRes.data.data,
          countries: countriesRes.data.success ? countriesRes.data.data : prev.countries
        }));
      }
      
      if (regionsRes.data.success) {
        setCountryRegionMap(regionsRes.data.data);
      }
    } catch (err) {
      console.error('Error loading lookups:', err);
      // Use default values if API fails
    }
  };

  // Resolve Google Maps URL to coordinates
  const resolveGoogleMapsUrl = async (url) => {
    if (!url || !url.trim()) return;
    
    try {
      setResolvingUrl(true);
      const token = localStorage.getItem('auth_token');
      const res = await axios.post(`${API_BASE_URL}/api/crm/resolve-google-maps-url`, 
        { url: url.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (res.data.success && res.data.coordinates) {
        const { lat, lng } = res.data.coordinates;
        setTempLocation({ lat, lng });
        message.success(`📍 Location extracted: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        
        // Auto-save the location
        try {
          setSaving(true);
          await axios.put(`${API_BASE_URL}/api/crm/customers/${id}`, {
            latitude: lat,
            longitude: lng,
            pin_confirmed: true,
            pin_source: 'user'
          }, {
            headers: { Authorization: `Bearer ${token}` }
          });
          message.success('Location saved and confirmed!');
          setGoogleMapsUrl(''); // Clear input
          loadCustomer(); // Reload to show updated data
        } catch (saveErr) {
          message.error('Location extracted but failed to save: ' + saveErr.message);
        } finally {
          setSaving(false);
        }
      } else {
        message.error(res.data.error || 'Could not extract coordinates from URL');
      }
    } catch (err) {
      console.error('Error resolving Google Maps URL:', err);
      message.error(err.response?.data?.error || 'Failed to resolve URL. Make sure it\'s a valid Google Maps link.');
    } finally {
      setResolvingUrl(false);
    }
  };

  // Load customer detail
  const loadCustomer = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      const res = await axios.get(`${API_BASE_URL}/api/crm/customers/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.data.success) {
        setCustomer(res.data.data);
        form.setFieldsValue(res.data.data);
      } else {
        setError('Customer not found');
      }
    } catch (err) {
      console.error('Error loading customer:', err);
      setError(err.response?.data?.error || 'Failed to load customer');
      message.error('Failed to load customer details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      loadLookups();
      loadCustomer();
    }
  }, [id]);

  // Scroll to Inquiries section when navigated from prospect conversion bridge
  useEffect(() => {
    if (expandInquiries && !loading && customer && inquiriesSectionRef.current) {
      setTimeout(() => {
        inquiriesSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  }, [expandInquiries, loading, customer]);

  // Save customer changes
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      
      // Remove read-only fields from submission
      delete values.customer_code;
      delete values.customer_name;
      delete values.customer_name_normalized;
      delete values.is_merged;
      delete values.merged_into_code;
      delete values.created_at;
      delete values.created_by;
      delete values.updated_at;
      delete values.updated_by;
      
      const token = localStorage.getItem('auth_token');
      const res = await axios.put(`${API_BASE_URL}/api/crm/customers/${id}`, values, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.data.success) {
        setCustomer(res.data.data);
        form.setFieldsValue(res.data.data);
        setEditMode(false);
        message.success('Customer updated successfully!');
      } else {
        message.error(res.data.error || 'Failed to save changes');
      }
    } catch (err) {
      console.error('Error saving customer:', err);
      message.error(err.response?.data?.error || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // Cancel edit mode
  const handleCancel = () => {
    Modal.confirm({
      title: 'Discard changes?',
      icon: <ExclamationCircleOutlined />,
      content: 'Are you sure you want to discard your changes?',
      okText: 'Discard',
      cancelText: 'Keep Editing',
      onOk: () => {
        form.setFieldsValue(customer);
        setEditMode(false);
      }
    });
  };
  
  // Add custom option to dropdown
  const addCustomOption = (type, value) => {
    if (!value || value.trim() === '') return;
    
    setLookups(prev => ({
      ...prev,
      [type]: [...new Set([...prev[type], value.trim()])].sort()
    }));
    
    // Clear input
    if (type === 'industries') setCustomIndustry('');
    if (type === 'market_segments') setCustomSegment('');
    if (type === 'customer_groups') setCustomGroup('');
    if (type === 'payment_terms') setCustomPaymentTerms('');
  };

  if (loading) {
    return (
      <div className="crm-loading">
        <Spin size="large" />
        <Text type="secondary">Loading customer details...</Text>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="crm-animate-in">
        <Button 
          icon={<ArrowLeftOutlined />} 
          onClick={() => navigate('/crm/customers')}
          className="crm-row-mb-16"
        >
          Back to Customers
        </Button>
        <Empty 
          description={error || "Customer not found"}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </div>
    );
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="crm-customer-detail crm-animate-in">
      {/* Breadcrumb Navigation */}
      <Breadcrumb className="crm-breadcrumb-mb">
        <Breadcrumb.Item>
          <Link to="/crm"><HomeOutlined /> CRM</Link>
        </Breadcrumb.Item>
        <Breadcrumb.Item>
          <Link to="/crm/customers">Customers</Link>
        </Breadcrumb.Item>
        <Breadcrumb.Item>{customer.customer_name}</Breadcrumb.Item>
      </Breadcrumb>

      <Form form={form} layout="vertical" initialValues={customer}>
        {/* Customer Header */}
        <div className="crm-customer-header">
          <Row gutter={[24, 24]} align="middle">
            <Col flex="none">
              <Avatar 
                size={80} 
                className={`crm-avatar-dynamic ${customer.customer_status === 'active' ? 'crm-avatar-active' : customer.customer_status === 'dormant' ? 'crm-avatar-dormant' : 'crm-avatar-inactive'}`}
              >
                {customer.customer_name?.charAt(0)?.toUpperCase()}
              </Avatar>
            </Col>
            <Col flex="auto">
              <Title level={2} className="crm-header-title">
                {customer.customer_name}
              </Title>
              <Space size={8} className="crm-header-tags">
                <Tag className="crm-tag-code">
                  {customer.customer_code}
                </Tag>
                <Tag color={customer.customer_type === 'Company' ? 'blue' : 'cyan'}>
                  {customer.customer_type || 'Company'}
                </Tag>
                <Tag 
                  icon={customer.customer_status === 'active' ? <CheckCircleOutlined /> : customer.customer_status === 'dormant' ? <ExclamationCircleOutlined /> : <CloseCircleOutlined />}
                  color={customer.customer_status === 'active' ? 'success' : customer.customer_status === 'dormant' ? 'warning' : 'default'}
                >
                  {customer.customer_status === 'active' ? 'Active' : customer.customer_status === 'dormant' ? 'Dormant' : 'Inactive'}
                </Tag>
                {customer.is_merged && (
                  <Tag color="purple">Merged Customer</Tag>
                )}
              </Space>
            </Col>
            <Col flex="none">
              <Space>
                {editMode ? (
                  <>
                    <Button 
                      type="primary"
                      icon={<SaveOutlined />}
                      onClick={handleSave}
                      loading={saving}
                    >
                      Save
                    </Button>
                    <Button 
                      icon={<CloseOutlined />}
                      onClick={handleCancel}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button 
                      type="primary"
                      icon={<EditOutlined />}
                      onClick={() => setEditMode(true)}
                    >
                      Edit
                    </Button>
                    <Button 
                      icon={<ArrowLeftOutlined />}
                      onClick={() => navigate(-1)}
                    >
                      Back
                    </Button>
                  </>
                )}
              </Space>
            </Col>
          </Row>
        </div>

        {/* Edit Mode Banner */}
        {editMode && (
          <Alert
            message="Edit Mode"
            description={
              <span>
                You can update customer details below. 
                <Text strong> Customer Code</Text> and <Text strong>Customer Name</Text> are read-only 
                (managed by the merging system).
              </span>
            }
            type="info"
            showIcon
            icon={<EditOutlined />}
            className="crm-edit-alert"
          />
        )}

        {/* Customer Information */}
        <Row gutter={[20, 20]}>
          {/* Overview Card with Relationship Health Badge */}
          <Col xs={24}>
            {(() => {
              const health = computeHealthBadge(customer.last_activity_date, customer.last_transaction_date);
              return (
                <Card className="crm-info-card" styles={{ body: { padding: '16px 24px' } }}>
                  <Row gutter={[24, 16]} align="middle">
                    <Col xs={12} sm={6}>
                      <Statistic
                        title="Last Activity"
                        value={customer.last_activity_date ? formatDate(customer.last_activity_date) : 'None'}
                        className="crm-statistic-sm"
                      />
                    </Col>
                    <Col xs={12} sm={6}>
                      <Statistic
                        title="Last Order"
                        value={customer.last_transaction_date ? formatDate(customer.last_transaction_date) : 'None'}
                        className="crm-statistic-sm"
                      />
                    </Col>
                    <Col xs={12} sm={6}>
                      <Statistic
                        title="Open Inquiries"
                        value={customer.open_inquiry_count ?? '—'}
                        className="crm-statistic-sm"
                      />
                    </Col>
                    <Col xs={12} sm={6}>
                      <div style={{ textAlign: 'center' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>Relationship Health</Text>
                        <div style={{ marginTop: 4 }}>
                          <Tag color={health.color} style={{ fontSize: 16, padding: '4px 12px' }}>
                            {health.emoji} {health.label}
                          </Tag>
                        </div>
                      </div>
                    </Col>
                  </Row>
                </Card>
              );
            })()}
          </Col>

          {/* PreSales Inquiries — moved up for action-oriented layout */}
          <Col xs={24}>
            <div ref={inquiriesSectionRef}>
            <Card
              title={<Space><FileSearchOutlined /><span>Inquiries</span></Space>}
              className="crm-info-card"
            >
              <CustomerInquiries customerId={customerIdNum} customerName={customer?.customer_name} autoOpenNew={openInquiryCapture} />
            </Card>
            </div>
          </Col>

          {/* Activity Feed — moved up */}
          <Col xs={24}>
            <Card
              title={<Space><CalendarOutlined /><span>Activity History</span></Space>}
              className="crm-info-card"
            >
              <ActivityFeed customerId={customerIdNum} limit={20} />
            </Card>
          </Col>

          {/* Email Thread */}
          <Col xs={24}>
            <Card
              title={<Space><MailOutlined /><span>Email Thread</span></Space>}
              className="crm-info-card"
            >
              <EmailThreadView customerId={customerIdNum} />
            </Card>
          </Col>

          {/* Tasks — moved up */}
          <Col xs={24}>
            <TaskWidget defaultCustomerId={customerIdNum} />
          </Col>

          {/* Field Visits */}
          <Col xs={24}>
            <Card
              title={<Space><EnvironmentOutlined /><span>Field Visits</span></Space>}
              className="crm-info-card"
            >
              <CustomerFieldVisits customerId={customerIdNum} />
            </Card>
          </Col>

          {/* Contacts */}
          <Col xs={24}>
            <Card
              title={<Space><UserOutlined /><span>Contacts</span></Space>}
              className="crm-info-card"
              extra={<ActivityLogDrawer defaultCustomerId={customerIdNum} />}
            >
              <ContactsTab customerId={customerIdNum} />
            </Card>
          </Col>

          {/* Notes */}
          <Col xs={24}>
            <Card
              title={<Space><EditOutlined /><span>Notes</span></Space>}
              className="crm-info-card"
            >
              <NotesTab recordType="customer" recordId={customerIdNum} />
            </Card>
          </Col>

          {/* Deal Pipeline — visible to admin/manager only (P4-5: merged into inquiry lifecycle for reps) */}
          {isAdmin && (
          <Col xs={24}>
            <Card className="crm-info-card">
              <DealPipeline customerId={customerIdNum} />
            </Card>
          </Col>
          )}

          {/* Basic Information */}
          <Col xs={24} lg={12}>
            <Card 
              title={
                <Space>
                  <BankOutlined />
                  <span>Basic Information</span>
                </Space>
              }
              className="crm-info-card"
            >
              <Descriptions column={1} size="small">
                {/* READ-ONLY: Customer Code */}
                <ReadOnlyField 
                  label="Customer Code" 
                  value={<Text code>{customer.customer_code}</Text>}
                  tooltip="Auto-generated by system"
                />
                
                {/* READ-ONLY: Customer Name */}
                <ReadOnlyField 
                  label="Customer Name" 
                  value={<Text strong>{customer.customer_name}</Text>}
                  tooltip="Managed by merging system - cannot be changed here"
                />
                
                <Descriptions.Item label="Type">
                  <EditableField editMode={editMode} 
                    name="customer_type" 
                    type="select" 
                    options={lookups.customer_types}
                    placeholder="Select type..."
                  >
                    <Tag color={customer.customer_type === 'Company' ? 'blue' : 'cyan'}>
                      {customer.customer_type || 'Company'}
                    </Tag>
                  </EditableField>
                </Descriptions.Item>
                
                <Descriptions.Item label="Customer Group">
                  <EditableField editMode={editMode} 
                    name="customer_group" 
                    type="select" 
                    options={lookups.customer_groups}
                    placeholder="Select group..."
                    allowAdd
                    customValue={customGroup}
                    setCustomValue={setCustomGroup}
                    onAdd={() => addCustomOption('customer_groups', customGroup)}
                  >
                    {customer.customer_group}
                  </EditableField>
                </Descriptions.Item>
                
                <Descriptions.Item label="Industry">
                  <EditableField editMode={editMode} 
                    name="industry" 
                    type="select" 
                    options={lookups.industries}
                    placeholder="Select industry..."
                    allowAdd
                    customValue={customIndustry}
                    setCustomValue={setCustomIndustry}
                    onAdd={() => addCustomOption('industries', customIndustry)}
                  >
                    {customer.industry}
                  </EditableField>
                </Descriptions.Item>
                
                <Descriptions.Item label="Market Segment">
                  <EditableField editMode={editMode} 
                    name="market_segment" 
                    type="select" 
                    options={lookups.market_segments}
                    placeholder="Select segment..."
                    allowAdd
                    customValue={customSegment}
                    setCustomValue={setCustomSegment}
                    onAdd={() => addCustomOption('market_segments', customSegment)}
                  >
                    {customer.market_segment}
                  </EditableField>
                </Descriptions.Item>
                
                <Descriptions.Item label="Status">
                  {editMode ? (
                    <Form.Item name="is_active" valuePropName="checked" style={{ margin: 0 }}>
                      <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
                    </Form.Item>
                  ) : (
                    <Tag color={customer.customer_status === 'active' ? 'success' : customer.customer_status === 'dormant' ? 'warning' : 'default'}>
                      {customer.customer_status === 'active' ? 'Active' : customer.customer_status === 'dormant' ? 'Dormant' : 'Inactive'}
                    </Tag>
                  )}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>

          {/* Contact Information - Now right next to Basic Info */}
          <Col xs={24} lg={12}>
            <Card 
              title={
                <Space>
                  <UserOutlined />
                  <span>Contact Information</span>
                </Space>
              }
              className="crm-info-card"
            >
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Primary Contact">
                  <EditableField editMode={editMode} name="primary_contact" placeholder="Enter contact name...">
                    {customer.primary_contact}
                  </EditableField>
                </Descriptions.Item>
                <Descriptions.Item label="Email">
                  <EditableField editMode={editMode} name="email" placeholder="Enter email...">
                    {customer.email ? (
                      <a href={`mailto:${customer.email}`}>
                        <Space>
                          <MailOutlined />
                          {customer.email}
                        </Space>
                      </a>
                    ) : null}
                  </EditableField>
                </Descriptions.Item>
                <Descriptions.Item label="Phone">
                  <EditableField editMode={editMode} name="phone" placeholder="Enter phone...">
                    {customer.phone ? (
                      <Space>
                        <PhoneOutlined />
                        {customer.phone}
                      </Space>
                    ) : null}
                  </EditableField>
                </Descriptions.Item>
                <Descriptions.Item label="Mobile">
                  <EditableField editMode={editMode} name="mobile" placeholder="Enter mobile...">
                    {customer.mobile}
                  </EditableField>
                </Descriptions.Item>
                <Descriptions.Item label="Website">
                  <EditableField editMode={editMode} name="website" placeholder="Enter website URL...">
                    {customer.website ? (
                      <a href={customer.website.startsWith('http') ? customer.website : `https://${customer.website}`} target="_blank" rel="noopener noreferrer">
                        {customer.website}
                      </a>
                    ) : null}
                  </EditableField>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>

          {/* Location Information - Full Width for better layout */}
          <Col xs={24}>
            <Card 
              title={
                <Space>
                  <GlobalOutlined />
                  <span>Location</span>
                </Space>
              }
              extra={
                <Space>
                  {/* Show "Confirm Pin" button for unconfirmed AI pins */}
                  {customer.latitude && customer.longitude && !customer.pin_confirmed && customer.pin_source === 'ai_geocode' && (
                    <Tooltip title="Confirm that the AI-generated pin location is correct. This will make the customer visible on the map.">
                      <Button 
                        type="primary"
                        icon={<CheckCircleOutlined />}
                        onClick={async () => {
                          try {
                            setSaving(true);
                            const token = localStorage.getItem('auth_token');
                            await axios.put(`${API_BASE_URL}/api/crm/customers/${id}`, {
                              pin_confirmed: true
                            }, {
                              headers: { Authorization: `Bearer ${token}` }
                            });
                            message.success('Pin location confirmed! Customer will now appear on the map.');
                            loadCustomer(); // Reload to get updated data
                          } catch (err) {
                            message.error('Failed to confirm pin location');
                          } finally {
                            setSaving(false);
                          }
                        }}
                        loading={saving}
                      >
                        Confirm Pin Location
                      </Button>
                    </Tooltip>
                  )}
                  <Button 
                    type={customer.latitude ? "default" : "primary"}
                    icon={<AimOutlined />}
                    onClick={() => {
                      setTempLocation({
                        lat: parseFloat(customer.latitude) || null,
                        lng: parseFloat(customer.longitude) || null
                      });
                      setDetectedAddress(null);
                      setLocationModalVisible(true);
                    }}
                  >
                    {customer.latitude ? 'Update' : 'Set'} Pin Location
                  </Button>
                </Space>
              }
              className="crm-info-card"
            >
              <Row gutter={[24, 16]}>
                {/* Row 1: Country + Territory + Pin */}
                <Col xs={24} sm={12} md={8}>
                  <div className="location-field">
                    <Text type="secondary" className="crm-location-field-label">Country</Text>
                    {editMode ? (
                      <Form.Item name="primary_country" style={{ margin: 0, width: '100%' }}>
                        <Select
                          style={{ width: '100%' }}
                          placeholder="Select country..."
                          allowClear
                          showSearch
                          optionFilterProp="children"
                          onChange={(value) => {
                            // Auto-set territory when country changes
                            if (value) {
                              const territory = getRegionForCountry(value);
                              if (territory) {
                                form.setFieldValue('country_region', territory);
                              }
                            }
                          }}
                        >
                          {lookups.countries.map(opt => (
                            <Option key={opt} value={opt}>{opt}</Option>
                          ))}
                        </Select>
                      </Form.Item>
                    ) : (
                      <Space>
                        <GlobalOutlined />
                        <Text strong>{customer.primary_country || '-'}</Text>
                      </Space>
                    )}
                  </div>
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <div className="location-field">
                    <Text type="secondary" className="crm-location-field-label">Territory/Region</Text>
                    <EditableField editMode={editMode} name="country_region" placeholder="Auto-set from country or enter manually...">
                      <Tag color="blue">{customer.country_region || '-'}</Tag>
                    </EditableField>
                  </div>
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <div className="location-field">
                    <Text type="secondary" className="crm-location-field-label">Pin Location</Text>
                    {customer.latitude && customer.longitude ? (
                      <Space direction="vertical" size={4}>
                        <Tag color="green" icon={<EnvironmentOutlined />} className="crm-location-pin-tag">
                          {parseFloat(customer.latitude).toFixed(4)}, {parseFloat(customer.longitude).toFixed(4)}
                        </Tag>
                        {/* Pin confirmation status */}
                        {customer.pin_confirmed ? (
                          <Tooltip title={`Confirmed by ${customer.pin_confirmed_by || 'user'}`}>
                            <Tag color="success" icon={<CheckCircleOutlined />} className="crm-location-status-tag">
                              Confirmed
                            </Tag>
                          </Tooltip>
                        ) : customer.pin_source === 'ai_geocode' ? (
                          <Tooltip title="AI-generated pin needs confirmation to appear on map">
                            <Tag color="warning" icon={<ExclamationCircleOutlined />} className="crm-location-status-tag">
                              AI Pin - Needs Confirmation
                            </Tag>
                          </Tooltip>
                        ) : (
                          <Tag color="default" className="crm-location-status-tag">
                            {customer.pin_source || 'Unknown source'}
                          </Tag>
                        )}
                      </Space>
                    ) : (
                      <Text type="secondary">Not set - click button above</Text>
                    )}
                  </div>
                </Col>
                
                {/* Row 2: City + State + Postal Code */}
                <Col xs={24} sm={12} md={8}>
                  <div className="location-field">
                    <Text type="secondary" className="crm-location-field-label">City</Text>
                    <EditableField editMode={editMode} name="city" placeholder="Enter city...">
                      {customer.city || <Text type="secondary">-</Text>}
                    </EditableField>
                  </div>
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <div className="location-field">
                    <Text type="secondary" className="crm-location-field-label">State/Province</Text>
                    <EditableField editMode={editMode} name="state" placeholder="Enter state or province...">
                      {customer.state || <Text type="secondary">-</Text>}
                    </EditableField>
                  </div>
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <div className="location-field">
                    <Text type="secondary" className="crm-location-field-label">Postal Code</Text>
                    <EditableField editMode={editMode} name="postal_code" placeholder="Enter postal code...">
                      {customer.postal_code || <Text type="secondary">-</Text>}
                    </EditableField>
                  </div>
                </Col>
                
                {/* Row 3: Full width addresses */}
                <Col xs={24} md={12}>
                  <div className="location-field">
                    <Text type="secondary" className="crm-location-field-label">Address Line 1</Text>
                    <EditableField editMode={editMode} name="address_line1" placeholder="Enter street address...">
                      {customer.address_line1 || <Text type="secondary">-</Text>}
                    </EditableField>
                  </div>
                </Col>
                <Col xs={24} md={12}>
                  <div className="location-field">
                    <Text type="secondary" className="crm-location-field-label">Address Line 2</Text>
                    <EditableField editMode={editMode} name="address_line2" placeholder="Apartment, suite, unit, building, floor, etc.">
                      {customer.address_line2 || <Text type="secondary">-</Text>}
                    </EditableField>
                  </div>
                </Col>
                
                {/* Row 4: Google Maps URL input */}
                <Col xs={24}>
                  <div className="location-field crm-google-maps-box">
                    <Text type="secondary" className="crm-google-maps-label">
                      <EnvironmentOutlined /> Quick Location from Google Maps
                    </Text>
                    <Space.Compact style={{ width: '100%' }}>
                      <Input
                        placeholder="Paste Google Maps link here (e.g., https://maps.app.goo.gl/xxx)"
                        value={googleMapsUrl}
                        onChange={(e) => setGoogleMapsUrl(e.target.value)}
                        onPressEnter={() => resolveGoogleMapsUrl(googleMapsUrl)}
                        style={{ flex: 1 }}
                        prefix={<GlobalOutlined className="crm-google-maps-icon" />}
                        allowClear
                      />
                      <Button 
                        type="primary" 
                        onClick={() => resolveGoogleMapsUrl(googleMapsUrl)}
                        loading={resolvingUrl || saving}
                        disabled={!googleMapsUrl.trim()}
                        icon={<AimOutlined />}
                      >
                        {resolvingUrl ? 'Resolving...' : 'Set Location'}
                      </Button>
                    </Space.Compact>
                    <Text type="secondary" className="crm-google-maps-hint">
                      💡 Copy a Google Maps link and paste it here to automatically set the exact pin location.
                    </Text>
                  </div>
                </Col>
              </Row>
            </Card>
          </Col>

          {/* Business Information */}
          <Col xs={24} lg={12}>
            <Card 
              title={
                <Space>
                  <BankOutlined />
                  <span>Business Details</span>
                </Space>
              }
              className="crm-info-card"
            >
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Tax ID">
                  <EditableField editMode={editMode} name="tax_id" placeholder="Enter tax ID...">
                    {customer.tax_id}
                  </EditableField>
                </Descriptions.Item>
                <Descriptions.Item label="Trade License">
                  <EditableField editMode={editMode} name="trade_license" placeholder="Enter trade license...">
                    {customer.trade_license}
                  </EditableField>
                </Descriptions.Item>
                <Descriptions.Item label="Credit Limit">
                  <EditableField editMode={editMode} name="credit_limit" type="number" placeholder="Enter credit limit...">
                    {customer.credit_limit ? `${customer.default_currency || 'AED'} ${Number(customer.credit_limit).toLocaleString()}` : null}
                  </EditableField>
                </Descriptions.Item>
                <Descriptions.Item label="Payment Terms">
                  <EditableField editMode={editMode} 
                    name="payment_terms" 
                    type="select" 
                    options={lookups.payment_terms}
                    placeholder="Select payment terms..."
                    allowAdd
                    customValue={customPaymentTerms}
                    setCustomValue={setCustomPaymentTerms}
                    onAdd={() => addCustomOption('payment_terms', customPaymentTerms)}
                  >
                    {customer.payment_terms}
                  </EditableField>
                </Descriptions.Item>
                <Descriptions.Item label="Default Currency">
                  {customer.default_currency || 'AED'}
                </Descriptions.Item>
                <Descriptions.Item label="Avg. Reorder Cycle (days)">
                  <EditableField
                    editMode={editMode}
                    name="avg_reorder_cycle_days"
                    type="number"
                    placeholder="e.g. 45"
                  >
                    {customer.avg_reorder_cycle_days ? `${customer.avg_reorder_cycle_days} days` : <Text type="secondary">-</Text>}
                  </EditableField>
                </Descriptions.Item>
                <Descriptions.Item label="Competitor Notes">
                  <EditableField editMode={editMode} name="competitor_notes" type="textarea" placeholder="Current suppliers, known pricing, pain points...">
                    {customer.competitor_notes ? (
                      <Text style={{ whiteSpace: 'pre-wrap' }}>{customer.competitor_notes}</Text>
                    ) : null}
                  </EditableField>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
          
          {/* Assignment Info - Read only, from system */}
          <Col xs={24} lg={12}>
            <Card 
              title={
                <Space>
                  <UserOutlined />
                  <span>Assigned Representatives</span>
                </Space>
              }
              className="crm-info-card"
            >
              <Descriptions column={1} size="small">
                <Descriptions.Item label={
                  <Space>
                    Sales Rep
                    <Tooltip title="Direct sales representative from sales data">
                      <LockOutlined className="crm-lock-icon" />
                    </Tooltip>
                  </Space>
                }>
                  {customer.primary_sales_rep_name ? (
                    <Space direction="vertical" size={0}>
                      <Tag color="blue" className="crm-sales-rep-tag">{customer.primary_sales_rep_name}</Tag>
                      {customer.sales_rep_info && (
                        <Text type="secondary" className="crm-sales-rep-sub">
                          {customer.sales_rep_info.designation} 
                          {customer.sales_rep_info.type === 'GROUP' && ' (Team Lead)'}
                        </Text>
                      )}
                      {customer.sales_rep_source === 'sales_data' && !customer.sales_rep_info && (
                        <Text type="secondary" className="crm-sales-rep-sub">
                          (from sales transactions)
                        </Text>
                      )}
                    </Space>
                  ) : (
                    <Text type="secondary">Not assigned</Text>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label={
                  <Space>
                    Account Manager
                    <Tooltip title="Group leader / manager. If no group, same as Sales Rep.">
                      <LockOutlined className="crm-lock-icon" />
                    </Tooltip>
                  </Space>
                }>
                  {customer.account_manager ? (
                    <Space direction="vertical" size={0}>
                      <Tag color="green" className="crm-sales-rep-tag">{customer.account_manager}</Tag>
                      {customer.account_manager_info && customer.account_manager !== customer.primary_sales_rep_name && (
                        <Text type="secondary" className="crm-sales-rep-sub">
                          {customer.account_manager_info.designation}
                        </Text>
                      )}
                      {customer.account_manager === customer.primary_sales_rep_name && (
                        <Text type="secondary" className="crm-sales-rep-sub">
                          (Same as Sales Rep - no group)
                        </Text>
                      )}
                    </Space>
                  ) : (
                    <Text type="secondary">
                      {customer.primary_sales_rep_name ? 'Loading...' : 'Not assigned'}
                    </Text>
                  )}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>


          {/* Technical Briefs */}
          <Col xs={24}>
            <Card
              title={<Space><FileTextOutlined /><span>Technical Briefs</span></Space>}
              className="crm-info-card"
            >
              <TechnicalBriefForm customerId={customerIdNum} customerName={customer?.customer_name || customer?.display_name} />
            </Card>
          </Col>

          {/* Packaging Profile */}
          <Col xs={24}>
            <Card
              title={<Space><FileTextOutlined /><span>Packaging Profile</span></Space>}
              className="crm-info-card"
            >
              <PackagingProfile customerId={customerIdNum} />
            </Card>
          </Col>

          {/* System Information */}
          <Col xs={24}>
            <Card 
              title={
                <Space>
                  <CalendarOutlined />
                  <span>System Information</span>
                </Space>
              }
              className="crm-info-card"
            >
              <Row gutter={[24, 16]}>
                <Col xs={12} sm={6}>
                  <Statistic 
                    title="Created On" 
                    value={formatDate(customer.created_at)}
                    className="crm-statistic-sm"
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic 
                    title="Created By" 
                    value={customer.created_by || '-'}
                    className="crm-statistic-sm"
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic 
                    title="Last Updated" 
                    value={formatDate(customer.updated_at)}
                    className="crm-statistic-sm"
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic 
                    title="Updated By" 
                    value={customer.updated_by || '-'}
                    className="crm-statistic-sm"
                  />
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      </Form>

      {/* Location Picker Modal */}
      <Modal
        title={
          <Space>
            <EnvironmentOutlined />
            <span>Set Customer Location</span>
          </Space>
        }
        open={locationModalVisible}
        onCancel={() => {
          setLocationModalVisible(false);
          setDetectedAddress(null);
        }}
        width={900}
        footer={[
          <Button key="cancel" onClick={() => {
            setLocationModalVisible(false);
            setDetectedAddress(null);
          }}>
            Cancel
          </Button>,
          <Button 
            key="save" 
            type="primary" 
            icon={<SaveOutlined />}
            onClick={() => {
              if (tempLocation.lat && tempLocation.lng) {
                // Prepare data to save
                const updateData = { 
                  latitude: tempLocation.lat, 
                  longitude: tempLocation.lng 
                };
                
                // Auto-fill address fields from detected address
                if (detectedAddress) {
                  
                  // Always fill if detected and field is empty
                  if (detectedAddress.city) {
                    updateData.city = detectedAddress.city;
                  }
                  if (detectedAddress.state) {
                    updateData.state = detectedAddress.state;
                  }
                  if (detectedAddress.postal_code) {
                    updateData.postal_code = detectedAddress.postal_code;
                  }
                  if (detectedAddress.address_line1) {
                    updateData.address_line1 = detectedAddress.address_line1;
                  }
                  if (detectedAddress.country) {
                    updateData.country = detectedAddress.country;
                  }
                  // Use region from database lookup (already resolved in LocationPicker)
                  if (detectedAddress.region) {
                    updateData.country_region = detectedAddress.region;
                  }
                }
                
                form.setFieldsValue(updateData);
                
                // If not in edit mode, save immediately
                if (!editMode) {
                  const saveLocation = async () => {
                    try {
                      const token = localStorage.getItem('auth_token');
                      await axios.put(`${API_BASE_URL}/api/crm/customers/${id}`, updateData, {
                        headers: { Authorization: `Bearer ${token}` }
                      });
                      setCustomer(prev => ({
                        ...prev,
                        ...updateData
                      }));
                      message.success('Location and address saved successfully!');
                    } catch (error) {
                      message.error('Failed to save location');
                    }
                  };
                  saveLocation();
                } else {
                  message.info('Location and address filled. Click "Save" to save all changes.');
                }
                setLocationModalVisible(false);
                setDetectedAddress(null);
              } else {
                message.warning('Please set a location on the map first');
              }
            }}
          >
            Save Location & Auto-Fill Address
          </Button>
        ]}
        destroyOnHidden
      >
        <Alert
          message="Click on the map to pin the exact location"
          description="Address details (city, state, postal code) will be automatically detected and filled in when you save."
          type="info"
          showIcon
          className="crm-row-mb-16"
        />
        <CustomerLocationPicker
          latitude={tempLocation.lat}
          longitude={tempLocation.lng}
          customerName={customer.customer_name}
          customerCode={customer.customer_code}
          country={customer.primary_country}
          editMode={true}
          height={400}
          onLocationChange={(lat, lng) => {
            setTempLocation({ lat, lng });
          }}
          onAddressChange={(address) => {
            setDetectedAddress(address);
          }}
        />
        
        {/* Show what will be auto-filled */}
        {detectedAddress && (
          <Card size="small" className="crm-detected-address-card" title="📍 Detected Address (will auto-fill on save)">
            <Row gutter={[16, 8]}>
              {detectedAddress.address_line1 && (
                <Col span={24}>
                  <Text type="secondary">Address:</Text> <Text strong>{detectedAddress.address_line1}</Text>
                </Col>
              )}
              {detectedAddress.city && (
                <Col span={8}>
                  <Text type="secondary">City:</Text> <Text strong>{detectedAddress.city}</Text>
                </Col>
              )}
              {detectedAddress.state && (
                <Col span={8}>
                  <Text type="secondary">State:</Text> <Text strong>{detectedAddress.state}</Text>
                </Col>
              )}
              {detectedAddress.postal_code && (
                <Col span={8}>
                  <Text type="secondary">Postal:</Text> <Text strong>{detectedAddress.postal_code}</Text>
                </Col>
              )}
              {detectedAddress.country && (
                <Col span={12}>
                  <Text type="secondary">Country:</Text> <Text strong>{detectedAddress.country}</Text>
                </Col>
              )}
              {detectedAddress.region && (
                <Col span={12}>
                  <Text type="secondary">Region:</Text>{' '}
                  <Tag color="blue" className="crm-region-tag">
                    {detectedAddress.region}
                  </Tag>
                  <Text type="secondary" className="crm-region-hint">(from database)</Text>
                </Col>
              )}
            </Row>
          </Card>
        )}
        
        {tempLocation.lat && tempLocation.lng && (
          <div className="crm-coords-display">
            <Tag color="green" className="crm-coords-tag">
              <EnvironmentOutlined /> Coordinates: {tempLocation.lat.toFixed(6)}, {tempLocation.lng.toFixed(6)}
            </Tag>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CustomerDetail;