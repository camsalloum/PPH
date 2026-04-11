/**
 * MyProspects - Sales Rep Prospect Pipeline (Modern Redesign)
 *
 * Full CRM-grade prospect management for a logged-in sales rep:
 * - KPI metric cards (total / pending / approved / converted)
 * - Status tab filtering & year selector
 * - Clickable rows → Drawer with full prospect detail + status update
 * - "Add Prospect" modal
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Tag, Space, Button, Typography, Empty, Spin,
  Alert, Table, Drawer, Modal, Form, Input,
  Select, App, Badge, Tooltip, Divider, Popconfirm
} from 'antd';
import NotesTab from './NotesTab';
import {
  ArrowLeftOutlined, ReloadOutlined, UserAddOutlined,
  GlobalOutlined, PlusOutlined, CheckCircleOutlined,
  ClockCircleOutlined, TrophyOutlined, FundOutlined,
  CalendarOutlined, FileTextOutlined, TeamOutlined,
  ArrowRightOutlined, SendOutlined, DeleteOutlined, EnvironmentOutlined
} from '@ant-design/icons';

const PROSPECT_SOURCES = [
  { value: 'customer_visit', label: 'Customer Visit' },
  { value: 'phone_call',     label: 'Phone Call' },
  { value: 'whatsapp',       label: 'WhatsApp' },
  { value: 'email',          label: 'Email' },
  { value: 'exhibition',     label: 'Exhibition / Event' },
  { value: 'referral',       label: 'Referral' },
  { value: 'manager_tip',    label: 'Manager Tip' },
  { value: 'online',         label: 'Online / Website' },
  { value: 'other',          label: 'Other' },
];
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { CRM_FULL_ACCESS_ROLES } from '../../utils/roleConstants';
import axios from 'axios';
import ProspectLocationPicker from './ProspectLocationPicker';
import './CRM.css';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const STATUS_CONFIG = {
  active:    { color: 'blue',    label: 'Active',     icon: <CheckCircleOutlined /> },
  inactive:  { color: 'default', label: 'Inactive',   icon: null },
  cancelled: { color: 'default', label: 'Cancelled',  icon: null },
  converted: { color: 'success', label: 'Converted',  icon: <TrophyOutlined /> },
  // backward compat for old records
  pending:   { color: 'blue',    label: 'Active',     icon: <CheckCircleOutlined /> },
  approved:  { color: 'blue',    label: 'Active',     icon: <CheckCircleOutlined /> },
  rejected:  { color: 'default', label: 'Cancelled',  icon: null },
};

const getStatusCfg = (record) => {
  if (record.converted_to_customer) return STATUS_CONFIG.converted;
  return STATUS_CONFIG[record.approval_status] || STATUS_CONFIG.active;
};

const yearOptions = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i);

const MyProspects = () => {
  const { message } = App.useApp();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const userLevel = Number(user?.designation_level) || 0;
  // BUG-04 fix: Use shared role constant with level check
  const isAdminView = CRM_FULL_ACCESS_ROLES.includes(user?.role) && userLevel >= 6;

  const [loading, setLoading]           = useState(true);
  const [prospects, setProspects]       = useState([]);
  const [metrics, setMetrics]           = useState({ total: 0, active: 0, converted: 0 });
  const [groupName, setGroupName]       = useState('');
  const [error, setError]               = useState(null);

  // Filters
  const [year, setYear]                 = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  // Drawers / Modals
  const [selected, setSelected]         = useState(null);
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [addOpen, setAddOpen]           = useState(false);
  const [addLoading, setAddLoading]     = useState(false);
  const [statusUpdateLoading, setStatusUpdateLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationSaving, setLocationSaving] = useState(false);
  const [prospectLocation, setProspectLocation] = useState({ lat: null, lng: null });
  const [prospectAddress, setProspectAddress] = useState(null);

  // Conversion bridge modal state
  const [conversionModalOpen, setConversionModalOpen] = useState(false);
  const [convertedProspect, setConvertedProspect] = useState(null);
  const [convertedCustomerId, setConvertedCustomerId] = useState(null);

  const [form] = Form.useForm();
  const [statusForm] = Form.useForm();

  // Active trip country (resolved on first load)
  const [tripCountry, setTripCountry] = useState(null);

  // ─── Load prospects ──────────────────────────────────────────────
  const loadProspects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };
      const params = {};
      if (year) params.year = year;

      // For non-admin, resolve trip country to filter prospects
      if (!isAdminView) {
        try {
          const tripRes = await axios.get(`${API_BASE_URL}/api/crm/field-trips`, {
            headers, params: { upcoming: true, limit: 1 }
          });
          const trips = Array.isArray(tripRes.data?.data) ? tripRes.data.data : [];
          const active = trips.find(t => ['in_progress', 'confirmed'].includes(t.status));
          const country = active?.country ? String(active.country).trim() : '';
          if (country) {
            params.country = country;
            setTripCountry(country);
          } else {
            // No active trip: show full group pipeline (do not hard-filter to UAE)
            setTripCountry(null);
          }
        } catch {
          // If trip lookup fails, avoid blocking prospects with an arbitrary country filter
          setTripCountry(null);
        }
      }

      const endpoint = isAdminView
        ? `${API_BASE_URL}/api/crm/admin/prospects`
        : `${API_BASE_URL}/api/crm/my-prospects`;

      const res = await axios.get(endpoint, {
        headers,
        params
      });

      if (res.data.success) {
        const d = res.data.data;
        setProspects(d.prospects || []);
        setGroupName(d.groupName || d.salesRepName || '');
        const m = d.metrics || {};
        setMetrics({
          total:     m.total     || 0,
          active:    m.active    ?? ((m.total || 0) - (m.converted || 0)),
          converted: m.converted || 0,
        });
      } else {
        setError(res.data.error || 'Failed to load prospects');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load prospects');
    } finally {
      setLoading(false);
    }
  }, [year, isAdminView]);

  useEffect(() => { loadProspects(); }, [loadProspects]);

  // ─── Handle highlight query param (deep link from Worklist/MyDay) ─
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const highlightId = params.get('highlight');
    if (highlightId && prospects.length > 0) {
      const target = prospects.find(p => String(p.id) === highlightId);
      if (target) {
        setSelected(target);
        setDrawerOpen(true);
        // Clear the highlight param from URL to avoid re-triggering
        navigate('/crm/prospects', { replace: true });
      }
    }
  }, [location.search, prospects, navigate]);

  // ─── Add Prospect ────────────────────────────────────────────────
  const handleAddProspect = async (values) => {
    try {
      setAddLoading(true);
      const token = localStorage.getItem('auth_token');
      const res = await axios.post(`${API_BASE_URL}/api/crm/prospects`, {
        customer_name: values.customer_name,
        country: values.country,
        sales_rep_group: groupName,
        division: 'FP',
        source: values.source || 'other',
        notes: values.notes || '',
        competitor_notes: values.competitor_notes || ''
      }, { headers: { Authorization: `Bearer ${token}` } });

      if (res.data.success) {
        message.success('Prospect added successfully!');
        setAddOpen(false);
        form.resetFields();
        loadProspects();
      } else {
        message.error(res.data.error || 'Failed to add prospect');
      }
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to add prospect');
    } finally {
      setAddLoading(false);
    }
  };

  // ─── Delete prospect ─────────────────────────────────────────────
  const handleDelete = async () => {
    if (!selected) return;
    setDeleteLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.delete(
        `${API_BASE_URL}/api/crm/prospects/${selected.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        message.success(`"${selected.customer_name}" deleted`);
        setDrawerOpen(false);
        setSelected(null);
        loadProspects();
      } else {
        message.error(res.data.error || 'Failed to delete');
      }
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to delete');
    } finally {
      setDeleteLoading(false);
    }
  };

  // ─── Update Status ───────────────────────────────────────────────
  const handleStatusUpdate = async (values) => {
    if (!selected) return;
    try {
      setStatusUpdateLoading(true);
      const token = localStorage.getItem('auth_token');

      // If converting, use the convert endpoint which sets converted_to_customer = true
      if (values.status === 'converted') {
        const res = await axios.post(
          `${API_BASE_URL}/api/crm/prospects/${selected.id}/convert`,
          { reason: values.notes || 'Converted from prospect pipeline' },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.data.success) {
          const prospect = res.data.prospect || selected;
          // Try to find the matching customer in fp_customer_unified
          let customerId = null;
          try {
            const custRes = await axios.get(`${API_BASE_URL}/api/crm/customers`, {
              headers: { Authorization: `Bearer ${token}` },
              params: { search: prospect.customer_name, limit: 5 }
            });
            if (custRes.data.success) {
              const customers = custRes.data.data?.customers || custRes.data.data || [];
              const match = customers.find(c =>
                (c.display_name || c.customer_name || '').toLowerCase().trim() ===
                (prospect.customer_name || '').toLowerCase().trim()
              );
              if (match) customerId = match.customer_id || match.id;
            }
          } catch (_) { /* non-critical — CTA will still show */ }

          setConvertedProspect(prospect);
          setConvertedCustomerId(customerId);
          setConversionModalOpen(true);
          setDrawerOpen(false);
          statusForm.resetFields();
          loadProspects();
        } else {
          message.error(res.data.error || 'Failed to convert prospect');
        }
      } else {
        const res = await axios.put(
          `${API_BASE_URL}/api/crm/prospects/${selected.id}/status`,
          { status: values.status, notes: values.notes },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.data.success) {
          message.success('Status updated!');
          setDrawerOpen(false);
          statusForm.resetFields();
          loadProspects();
        } else {
          message.error(res.data.error || 'Failed to update status');
        }
      }
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to update status');
    } finally {
      setStatusUpdateLoading(false);
    }
  };

  // ─── Table columns ───────────────────────────────────────────────
  const columns = [
    {
      title: 'Customer / Company',
      dataIndex: 'customer_name',
      key: 'customer_name',
      sorter: (a, b) => (a.customer_name || '').localeCompare(b.customer_name || ''),
      render: (name) => (
        <Space>
          <UserAddOutlined style={{ color: '#4f46e5' }} />
          <Text strong>{name}</Text>
        </Space>
      )
    },
    {
      title: 'Country',
      dataIndex: 'country',
      key: 'country',
      width: 140,
      render: (c) => c ? <Space><GlobalOutlined />{c}</Space> : <Text type="secondary">—</Text>
    },
    {
      title: 'Year',
      dataIndex: 'budget_year',
      key: 'budget_year',
      width: 80,
      align: 'center',
      render: (y) => <Tag color="blue">{y}</Tag>
    },
    {
      title: 'Status',
      dataIndex: 'approval_status',
      key: 'approval_status',
      width: 150,
      render: (_, record) => {
        const cfg = getStatusCfg(record);
        return <Tag color={cfg.color} icon={cfg.icon}>{cfg.label}</Tag>;
      }
    },
    {
      title: 'Source',
      dataIndex: 'source',
      key: 'source',
      width: 110,
      render: (s) => s ? <Tag>{s}</Tag> : <Text type="secondary">—</Text>
    },
    {
      title: 'Added',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 120,
      sorter: (a, b) => new Date(a.created_at) - new Date(b.created_at),
      render: (d) => d
        ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : '—'
    },
    {
      title: '',
      key: 'action',
      width: 50,
      align: 'center',
      render: (_, record) => (
        <Tooltip title="View details">
          <ArrowRightOutlined
            style={{ color: '#4f46e5', cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); openDrawer(record); }}
          />
        </Tooltip>
      )
    }
  ];

  // Sales Group column (admin view only)
  const salesGroupColumn = {
    title: 'Rep Group',
    dataIndex: 'sales_rep_group',
    key: 'sales_rep_group',
    width: 160,
    render: (group) => group
      ? <Tag color="geekblue">{group}</Tag>
      : <Tag color="orange">Unassigned</Tag>
  };

  // Insert Sales Group column for admin view (before action)
  if (isAdminView) {
    columns.splice(columns.length - 1, 0, salesGroupColumn);
  }

  const openDrawer = (record) => {
    setSelected(record);
    // Normalize legacy 'approved'/'pending' → 'active'
    const normalizedStatus = ['approved', 'pending'].includes(record.approval_status)
      ? 'active'
      : (record.approval_status || 'active');
    statusForm.setFieldsValue({ status: normalizedStatus });
    setDrawerOpen(true);
    setProspectLocation({ lat: record.latitude || null, lng: record.longitude || null });
    setProspectAddress({
      city: record.city || '',
      state: record.state || '',
      country: record.country || '',
      address_line1: record.address_line1 || '',
    });
  };

  const handleSaveLocation = async () => {
    if (!selected?.id) return;
    const token = localStorage.getItem('auth_token');
    setLocationSaving(true);
    try {
      const res = await axios.patch(
        `${API_BASE_URL}/api/crm/prospects/${selected.id}/location`,
        {
          latitude: prospectLocation?.lat,
          longitude: prospectLocation?.lng,
          city: prospectAddress?.city || null,
          state: prospectAddress?.state || null,
          address_line1: prospectAddress?.address_line1 || null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.success) {
        const updated = res.data.data || {};
        setSelected((prev) => ({
          ...prev,
          latitude: updated.latitude,
          longitude: updated.longitude,
          city: updated.city,
          state: updated.state,
          address_line1: updated.address_line1,
        }));
        message.success('Prospect location saved');
        setLocationOpen(false);
        loadProspects();
      } else {
        message.error(res.data.error || 'Failed to save location');
      }
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to save location');
    } finally {
      setLocationSaving(false);
    }
  };

  // ─── Filtered prospects for status tabs ─────────────────────────
  // Admin: server already filtered; just show all returned rows.
  // Sales rep: client-side filter (my-prospects returns all, status is a hint).
  const displayedProspects = statusFilter === 'all'
    ? prospects
    : statusFilter === 'converted'
      ? prospects.filter(p => p.converted_to_customer)
      : prospects.filter(p => !p.converted_to_customer); // 'active' = everything not yet converted

  // ─── Render ──────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="crmx-dashboard">
        <div className="crmx-controls">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/crm')}>
            Back to Dashboard
          </Button>
        </div>
        <Alert message="Error" description={error} type="error" showIcon />
      </div>
    );
  }

  return (
    <div className="crmx-dashboard">

      {/* ── Controls Bar ───────────────────────────────────────── */}
      <div className="crmx-controls">
        <div className="crmx-controls-left">
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/crm')}
            className="crmx-back-btn"
          >
            Dashboard
          </Button>

          <div className="crmx-header-title">
            <FundOutlined />
            <span>{isAdminView ? 'All Prospects' : 'My Prospect Pipeline'}</span>
          </div>

          {groupName && (
            <Tag color="purple" icon={<TeamOutlined />} style={{ fontWeight: 600 }}>
              {groupName}
            </Tag>
          )}
        </div>

        <div className="crmx-controls-right">
          <Select
            value={year}
            onChange={setYear}
            placeholder="All Years"
            allowClear
            style={{ width: 120 }}
          >
            {yearOptions.map(y => <Option key={y} value={y}>{y}</Option>)}
          </Select>

          <Button icon={<ReloadOutlined />} onClick={loadProspects} loading={loading}>
            Refresh
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setAddOpen(true)}
            style={{ background: '#4f46e5', borderColor: '#4f46e5' }}
          >
            Add Prospect
          </Button>
        </div>
      </div>

      {/* ── KPI Metric Cards ───────────────────────────────────── */}
      <div className="crmx-kpi-row">
        <div
          className={`crmx-kpi-card ${statusFilter === 'all' ? 'crmx-kpi-card--active' : ''}`}
          onClick={() => setStatusFilter('all')}
          style={{ cursor: 'pointer' }}
        >
          <div className="crmx-kpi-label">Total Prospects</div>
          <div className="crmx-kpi-value">
            {loading ? <Spin size="small" /> : metrics.total}
          </div>
        </div>

        <div
          className={`crmx-kpi-card ${statusFilter === 'active' ? 'crmx-kpi-card--active' : ''}`}
          onClick={() => setStatusFilter('active')}
          style={{ cursor: 'pointer' }}
        >
          <div className="crmx-kpi-label">
            <CheckCircleOutlined style={{ color: '#4f46e5', marginRight: 4 }} />
            Active
          </div>
          <div className="crmx-kpi-value" style={{ color: '#4f46e5' }}>
            {loading ? <Spin size="small" /> : metrics.active}
          </div>
        </div>

        <div
          className={`crmx-kpi-card ${statusFilter === 'converted' ? 'crmx-kpi-card--active' : ''}`}
          onClick={() => setStatusFilter('converted')}
          style={{ cursor: 'pointer' }}
        >
          <div className="crmx-kpi-label">
            <TrophyOutlined style={{ color: '#52c41a', marginRight: 4 }} />
            Converted
          </div>
          <div className="crmx-kpi-value" style={{ color: '#52c41a' }}>
            {loading ? <Spin size="small" /> : metrics.converted}
          </div>
        </div>
      </div>

      {/* ── Prospects Table ─────────────────────────────────────── */}
      <div className="crmx-section">
        <div className="crmx-section-header">
          <span className="crmx-section-title">
            {statusFilter === 'all'       ? 'All Prospects'
             : statusFilter === 'active' ? 'Active Prospects'
             : 'Converted Prospects'}
          </span>
          <Badge count={displayedProspects.length} overflowCount={999} color="#4f46e5" />
        </div>

        {loading ? (
          <div className="crmx-loading-center">
            <Spin size="large" />
          </div>
        ) : displayedProspects.length === 0 ? (
          <Empty
            description={
              <span>
                No prospects found.{' '}
                <a onClick={() => setAddOpen(true)}>Add one now</a>.
              </span>
            }
            style={{ padding: '40px 0' }}
          />
        ) : (
          <Table
            dataSource={displayedProspects}
            columns={columns}
            rowKey="id"
            size="middle"
            pagination={{ pageSize: 20, showSizeChanger: true }}
            onRow={(record) => ({
              onClick: () => openDrawer(record),
              style: { cursor: 'pointer' }
            })}
            className="crmx-table"
          />
        )}
      </div>

      {/* ── Prospect Detail Drawer ───────────────────────────── */}
      <Drawer
        title={
          <Space>
            <UserAddOutlined style={{ color: '#4f46e5' }} />
            <span>{selected?.customer_name}</span>
            {selected && (
              <Tag color={getStatusCfg(selected).color}>
                {getStatusCfg(selected).label}
              </Tag>
            )}
          </Space>
        }
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelected(null); }}
        width={480}
        extra={
          <Space>
            {selected && !selected.converted_to_customer && (
              <Button
                size="small"
                icon={<EnvironmentOutlined />}
                onClick={() => setLocationOpen(true)}
              >
                Set Location
              </Button>
            )}
            {selected && !selected.converted_to_customer && (
              <Popconfirm
                title="Delete this prospect?"
                description="This cannot be undone."
                okText="Delete"
                okType="danger"
                cancelText="Cancel"
                onConfirm={handleDelete}
              >
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  loading={deleteLoading}
                >
                  Delete
                </Button>
              </Popconfirm>
            )}
            {selected?.converted_to_customer && (
              <Tag color="success" icon={<TrophyOutlined />}>Already Converted</Tag>
            )}
          </Space>
        }
      >
        {selected && (
          <div style={{ lineHeight: 2 }}>
            <div className="crmx-detail-row">
              <GlobalOutlined style={{ color: '#4f46e5' }} />
              <Text strong>Country</Text>
              <Text>{selected.country || '—'}</Text>
            </div>
            <div className="crmx-detail-row">
              <CalendarOutlined style={{ color: '#4f46e5' }} />
              <Text strong>Budget Year</Text>
              <Tag color="blue">{selected.budget_year}</Tag>
            </div>
            <div className="crmx-detail-row">
              <FileTextOutlined style={{ color: '#4f46e5' }} />
              <Text strong>Source</Text>
              <Text>{selected.source || '—'}</Text>
            </div>
            <div className="crmx-detail-row">
              <TeamOutlined style={{ color: '#4f46e5' }} />
              <Text strong>Sales Group</Text>
              <Text>{selected.sales_rep_group || '—'}</Text>
            </div>
            <div className="crmx-detail-row">
              <ClockCircleOutlined style={{ color: '#4f46e5' }} />
              <Text strong>Added</Text>
              <Text>
                {selected.created_at
                  ? new Date(selected.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                  : '—'}
              </Text>
            </div>
            <div className="crmx-detail-row">
              <EnvironmentOutlined style={{ color: '#4f46e5' }} />
              <Text strong>Location</Text>
              <Text>
                {selected.latitude && selected.longitude
                  ? `${Number(selected.latitude).toFixed(5)}, ${Number(selected.longitude).toFixed(5)}`
                  : 'Not set'}
              </Text>
            </div>
            {selected.converted_to_customer && selected.converted_at && (
              <div className="crmx-detail-row">
                <TrophyOutlined style={{ color: '#52c41a' }} />
                <Text strong>Converted</Text>
                <Text>
                  {new Date(selected.converted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </div>
            )}
            {selected.notes && (
              <>
                <Divider style={{ margin: '12px 0' }} />
                <Text type="secondary" style={{ fontSize: 12 }}>NOTES</Text>
                <p style={{ marginTop: 4 }}>{selected.notes}</p>
              </>
            )}
            {selected.competitor_notes && (
              <>
                <Divider style={{ margin: '12px 0' }} />
                <Text type="secondary" style={{ fontSize: 12 }}>COMPETITOR INTEL</Text>
                <p style={{ marginTop: 4 }}>{selected.competitor_notes}</p>
              </>
            )}

            <Divider style={{ margin: '12px 0' }} />
            <NotesTab recordType="prospect" recordId={selected?.id} />

            {!selected.converted_to_customer && (
              <>
                <Divider style={{ margin: '16px 0' }} />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  block
                  style={{ background: '#4f46e5', borderColor: '#4f46e5', marginBottom: 12 }}
                  onClick={() => {
                    setDrawerOpen(false);
                    navigate('/crm/inquiries/new', { state: { fromProspect: selected } });
                  }}
                >
                  Create Inquiry for this Prospect
                </Button>
                <Divider style={{ margin: '16px 0' }} />
                <Text strong style={{ fontSize: 13 }}>Update Status</Text>
                <Form
                  form={statusForm}
                  layout="vertical"
                  onFinish={handleStatusUpdate}
                  style={{ marginTop: 12 }}
                >
                  <Form.Item name="status" label="New Status" rules={[{ required: true }]}>
                    <Select>
                      <Option value="active">Active</Option>
                      <Option value="inactive">Inactive</Option>
                      <Option value="converted">
                        <Space><TrophyOutlined style={{ color: '#52c41a' }} />Mark as Converted</Space>
                      </Option>
                    </Select>
                  </Form.Item>
                  <Form.Item name="notes" label="Notes (optional)">
                    <TextArea rows={2} placeholder="Reason or remarks..." />
                  </Form.Item>
                  <Form.Item>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={statusUpdateLoading}
                      style={{ background: '#4f46e5', borderColor: '#4f46e5' }}
                      block
                    >
                      Save Status
                    </Button>
                  </Form.Item>
                </Form>
              </>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        title="Prospect Location"
        open={locationOpen}
        onCancel={() => setLocationOpen(false)}
        onOk={handleSaveLocation}
        okText="Save Location"
        confirmLoading={locationSaving}
        width={900}
        destroyOnHidden
      >
        <ProspectLocationPicker
          latitude={prospectLocation.lat}
          longitude={prospectLocation.lng}
          prospectName={selected?.customer_name || ''}
          country={selected?.country || ''}
          editMode
          height={420}
          onLocationChange={(lat, lng) => setProspectLocation({ lat, lng })}
          onAddressChange={(addr) => setProspectAddress(addr || {})}
        />
      </Modal>

      {/* ── Add Prospect Modal ─────────────────────────────────── */}
      <Modal
        title={<Space><PlusOutlined style={{ color: '#4f46e5' }} />Add New Prospect</Space>}
        open={addOpen}
        onCancel={() => { setAddOpen(false); form.resetFields(); }}
        footer={null}
        width={480}
      >
        <Form form={form} layout="vertical" onFinish={handleAddProspect} style={{ marginTop: 16 }}>
          <Form.Item
            name="customer_name"
            label="Customer / Company Name"
            rules={[{ required: true, message: 'Please enter the customer name' }]}
          >
            <Input prefix={<UserAddOutlined />} placeholder="e.g. Acme Corp" />
          </Form.Item>
          <Form.Item
            name="country"
            label="Country"
            rules={[{ required: true, message: 'Please enter the country' }]}
          >
            <Input prefix={<GlobalOutlined />} placeholder="e.g. Saudi Arabia" />
          </Form.Item>
          <Form.Item
            name="source"
            label="How did you find this company?"
            rules={[{ required: true, message: 'Please select a source' }]}
          >
            <Select placeholder="Select source...">
              {PROSPECT_SOURCES.map(s => (
                <Option key={s.value} value={s.value}>{s.label}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <TextArea rows={3} placeholder="Any additional context about this prospect…" />
          </Form.Item>
          <Form.Item name="competitor_notes" label="Competitor Intel">
            <TextArea rows={2} placeholder="Current suppliers, known pricing, pain points..." />
          </Form.Item>
          {groupName && (
            <div style={{ marginBottom: 16, color: '#888', fontSize: 12 }}>
              <TeamOutlined style={{ marginRight: 4 }} />
              Will be assigned to: <strong>{groupName}</strong>
            </div>
          )}
          <Form.Item style={{ marginBottom: 0 }}>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                loading={addLoading}
                icon={<PlusOutlined />}
                style={{ background: '#4f46e5', borderColor: '#4f46e5' }}
              >
                Add Prospect
              </Button>
              <Button onClick={() => { setAddOpen(false); form.resetFields(); }}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Conversion Success Modal (Bridge to First Inquiry) ── */}
      <Modal
        title={
          <Space>
            <TrophyOutlined style={{ color: '#52c41a', fontSize: 20 }} />
            <span>Prospect Converted!</span>
          </Space>
        }
        open={conversionModalOpen}
        onCancel={() => {
          setConversionModalOpen(false);
          setConvertedProspect(null);
          setConvertedCustomerId(null);
        }}
        footer={[
          <Button
            key="dismiss"
            onClick={() => {
              setConversionModalOpen(false);
              setConvertedProspect(null);
              setConvertedCustomerId(null);
            }}
          >
            Stay on Prospects
          </Button>,
          convertedCustomerId && (
            <Button
              key="create-inquiry"
              type="primary"
              icon={<ArrowRightOutlined />}
              style={{ background: '#52c41a', borderColor: '#52c41a' }}
              onClick={() => {
                setConversionModalOpen(false);
                navigate(`/crm/customers/${convertedCustomerId}`, {
                  state: { expandInquiries: true, openInquiryCapture: true }
                });
              }}
            >
              Create First Inquiry for {convertedProspect?.customer_name}
            </Button>
          ),
        ].filter(Boolean)}
        width={480}
      >
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
          <Title level={4} style={{ marginBottom: 8 }}>
            {convertedProspect?.customer_name} is now a customer!
          </Title>
          <Text type="secondary">
            {convertedCustomerId
              ? 'Would you like to create the first inquiry for this new customer?'
              : 'The customer record will be available once data is synced.'}
          </Text>
        </div>
      </Modal>

    </div>
  );
};

export default MyProspects;

