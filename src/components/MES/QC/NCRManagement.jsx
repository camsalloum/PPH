/**
 * G-004: Non-Conformance Report (NCR) Management Page.
 * Lists NCRs, allows creating new ones, and updating status / corrective actions.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  AlertOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const STATUS_CONFIG = {
  open:        { color: 'red',     label: 'Open' },
  in_progress: { color: 'orange',  label: 'In Progress' },
  resolved:    { color: 'blue',    label: 'Resolved' },
  verified:    { color: 'green',   label: 'Verified' },
  closed:      { color: 'default', label: 'Closed' },
};

const CATEGORY_OPTIONS = [
  { value: 'material',       label: 'Material' },
  { value: 'process',        label: 'Process' },
  { value: 'equipment',      label: 'Equipment' },
  { value: 'human_error',    label: 'Human Error' },
  { value: 'specification',  label: 'Specification' },
  { value: 'other',          label: 'Other' },
];

const STATUS_FLOW = {
  open:        ['in_progress'],
  in_progress: ['resolved'],
  resolved:    ['verified', 'in_progress'],
  verified:    ['closed'],
  closed:      [],
};

export default function NCRManagement() {
  const { message } = App.useApp();

  const [ncrList, setNcrList] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('open');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedNCR, setSelectedNCR] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);

  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const headers = useMemo(() => {
    const token = localStorage.getItem('auth_token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter && statusFilter !== 'all' ? `?status=${statusFilter}&limit=200` : '?limit=200';
      const [listRes, statsRes] = await Promise.all([
        axios.get(`${API_BASE}/api/mes/presales/ncr${params}`, { headers }),
        axios.get(`${API_BASE}/api/mes/presales/ncr/stats`, { headers }),
      ]);
      setNcrList(listRes.data?.data || []);
      setStats(statsRes.data?.data || {});
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to load NCRs');
    } finally {
      setLoading(false);
    }
  }, [headers, message, statusFilter]);

  useEffect(() => { loadList(); }, [loadList]);

  const loadDetail = async (id) => {
    setDetailLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/mes/presales/ncr/${id}`, { headers });
      const data = res.data?.data;
      setSelectedNCR(data);
      editForm.setFieldsValue({
        root_cause: data.root_cause,
        corrective_action: data.corrective_action,
        preventive_action: data.preventive_action,
        resolution_notes: data.resolution_notes,
      });
      setDrawerOpen(true);
    } catch (err) {
      message.error('Failed to load NCR detail');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCreate = async (values) => {
    setCreateLoading(true);
    try {
      await axios.post(`${API_BASE}/api/mes/presales/ncr`, {
        ...values,
        due_date: values.due_date ? values.due_date.format('YYYY-MM-DD') : null,
      }, { headers });
      message.success('NCR created');
      setCreateModalOpen(false);
      createForm.resetFields();
      await loadList();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to create NCR');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (!selectedNCR) return;
    setUpdateLoading(true);
    try {
      const editValues = editForm.getFieldsValue();
      await axios.patch(`${API_BASE}/api/mes/presales/ncr/${selectedNCR.id}`, {
        status: newStatus,
        root_cause: editValues.root_cause,
        corrective_action: editValues.corrective_action,
        preventive_action: editValues.preventive_action,
        resolution_notes: editValues.resolution_notes,
      }, { headers });
      message.success(`NCR status updated to ${STATUS_CONFIG[newStatus]?.label || newStatus}`);
      await loadDetail(selectedNCR.id);
      await loadList();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to update NCR');
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleSaveDetails = async () => {
    if (!selectedNCR) return;
    setUpdateLoading(true);
    try {
      const values = editForm.getFieldsValue();
      await axios.patch(`${API_BASE}/api/mes/presales/ncr/${selectedNCR.id}`, values, { headers });
      message.success('NCR updated');
      await loadDetail(selectedNCR.id);
    } catch (err) {
      message.error('Failed to save NCR');
    } finally {
      setUpdateLoading(false);
    }
  };

  const columns = [
    {
      title: 'NCR #',
      dataIndex: 'ncr_number',
      render: (v, row) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => loadDetail(row.id)}>{v || `#${row.id}`}</Button>
      ),
    },
    { title: 'Sample', dataIndex: 'sample_number', render: (v) => v || '-' },
    { title: 'Customer', dataIndex: 'customer_name', render: (v) => v || '-' },
    {
      title: 'Category',
      dataIndex: 'category',
      render: (v) => <Tag>{(v || '').replace('_', ' ').toUpperCase()}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (v) => {
        const cfg = STATUS_CONFIG[v] || { color: 'default', label: v };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: 'Due Date',
      dataIndex: 'due_date',
      render: (v) => {
        if (!v) return '-';
        const isPast = dayjs(v).isBefore(dayjs(), 'day');
        return <Text type={isPast ? 'danger' : undefined}>{dayjs(v).format('DD MMM YYYY')}</Text>;
      },
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      render: (v) => v ? dayjs(v).format('DD MMM, HH:mm') : '-',
    },
  ];

  const allowedTransitions = selectedNCR ? (STATUS_FLOW[selectedNCR.status] || []) : [];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}><AlertOutlined /> Non-Conformance Reports</Title>
          <Text type="secondary">Track and resolve quality non-conformances</Text>
        </div>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>New NCR</Button>
          <Button icon={<ReloadOutlined />} onClick={loadList} loading={loading}>Refresh</Button>
        </Space>
      </Space>

      {/* Stats row */}
      <Row gutter={12} style={{ marginBottom: 14 }}>
        <Col xs={8} md={4}><Card size="small"><Statistic title="Open" value={Number(stats.open_count || 0)} valueStyle={{ color: '#cf1322' }} /></Card></Col>
        <Col xs={8} md={4}><Card size="small"><Statistic title="In Progress" value={Number(stats.in_progress_count || 0)} valueStyle={{ color: '#d46b08' }} /></Card></Col>
        <Col xs={8} md={4}><Card size="small"><Statistic title="Resolved" value={Number(stats.resolved_count || 0)} valueStyle={{ color: '#1890ff' }} /></Card></Col>
        <Col xs={8} md={4}><Card size="small"><Statistic title="Verified" value={Number(stats.verified_count || 0)} valueStyle={{ color: '#3f8600' }} /></Card></Col>
        <Col xs={8} md={4}><Card size="small"><Statistic title="Overdue" value={Number(stats.overdue_count || 0)} valueStyle={{ color: stats.overdue_count > 0 ? '#cf1322' : undefined }} prefix={<ExclamationCircleOutlined />} /></Card></Col>
        <Col xs={8} md={4}><Card size="small"><Statistic title="Total" value={Number(stats.total || 0)} /></Card></Col>
      </Row>

      {/* Filter */}
      <Space style={{ marginBottom: 12 }}>
        <Text strong>Filter:</Text>
        <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 160 }}>
          <Select.Option value="all">All</Select.Option>
          <Select.Option value="open">Open</Select.Option>
          <Select.Option value="in_progress">In Progress</Select.Option>
          <Select.Option value="resolved">Resolved</Select.Option>
          <Select.Option value="verified">Verified</Select.Option>
          <Select.Option value="closed">Closed</Select.Option>
        </Select>
      </Space>

      <Table
        loading={loading}
        rowKey="id"
        size="small"
        dataSource={ncrList}
        columns={columns}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        locale={{ emptyText: <Empty description="No NCRs found" /> }}
      />

      {/* ── Create NCR Modal ───────────────────────────────── */}
      <Modal
        open={createModalOpen}
        title="Create Non-Conformance Report"
        onCancel={() => setCreateModalOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={createLoading}
        okText="Create NCR"
        width={600}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="sample_id" label="Sample ID">
                <Input type="number" placeholder="e.g. 15" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="category" label="Category" rules={[{ required: true }]}>
                <Select options={CATEGORY_OPTIONS} placeholder="Select category" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Description" rules={[{ required: true, message: 'Describe the non-conformance' }]}>
            <Input.TextArea rows={3} placeholder="Describe the non-conformance issue…" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="due_date" label="Due Date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="assigned_to" label="Assigned To (User ID)">
                <Input type="number" placeholder="User ID" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="root_cause" label="Root Cause (if known)">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── NCR Detail Drawer ──────────────────────────────── */}
      <Drawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedNCR(null); }}
        title={selectedNCR ? `${selectedNCR.ncr_number || 'NCR'}` : 'NCR Detail'}
        width={560}
        loading={detailLoading}
      >
        {selectedNCR && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="NCR Number">{selectedNCR.ncr_number}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={STATUS_CONFIG[selectedNCR.status]?.color}>
                  {STATUS_CONFIG[selectedNCR.status]?.label || selectedNCR.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Category">
                <Tag>{(selectedNCR.category || '').replace('_', ' ').toUpperCase()}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Sample">{selectedNCR.sample_number || '-'}</Descriptions.Item>
              <Descriptions.Item label="Customer">{selectedNCR.customer_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Description">{selectedNCR.description || '-'}</Descriptions.Item>
              <Descriptions.Item label="Due Date">
                {selectedNCR.due_date ? dayjs(selectedNCR.due_date).format('DD MMM YYYY') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Created">
                {dayjs(selectedNCR.created_at).format('DD MMM YYYY HH:mm')}
              </Descriptions.Item>
              {selectedNCR.verified_at && (
                <Descriptions.Item label="Verified At">
                  {dayjs(selectedNCR.verified_at).format('DD MMM YYYY HH:mm')}
                </Descriptions.Item>
              )}
            </Descriptions>

            <Card size="small" title="Investigation & Actions">
              <Form form={editForm} layout="vertical">
                <Form.Item name="root_cause" label="Root Cause">
                  <Input.TextArea rows={2} />
                </Form.Item>
                <Form.Item name="corrective_action" label="Corrective Action">
                  <Input.TextArea rows={2} />
                </Form.Item>
                <Form.Item name="preventive_action" label="Preventive Action">
                  <Input.TextArea rows={2} />
                </Form.Item>
                <Form.Item name="resolution_notes" label="Resolution Notes">
                  <Input.TextArea rows={2} />
                </Form.Item>
                <Button onClick={handleSaveDetails} loading={updateLoading}>Save Details</Button>
              </Form>
            </Card>

            {/* Status transition buttons */}
            {allowedTransitions.length > 0 && (
              <Card size="small" title="Status Actions">
                <Space>
                  {allowedTransitions.map((nextStatus) => (
                    <Button
                      key={nextStatus}
                      type={nextStatus === 'verified' ? 'primary' : 'default'}
                      icon={nextStatus === 'verified' ? <CheckCircleOutlined /> : null}
                      loading={updateLoading}
                      onClick={() => handleStatusChange(nextStatus)}
                    >
                      Move to {STATUS_CONFIG[nextStatus]?.label || nextStatus}
                    </Button>
                  ))}
                </Space>
              </Card>
            )}

            {/* Failed test parameters from analysis */}
            {Array.isArray(selectedNCR.test_parameters) && (
              <Card size="small" title="Related Test Parameters (from Analysis)">
                <Table
                  size="small"
                  rowKey={(r) => `${r.name || 'param'}-${r.spec || ''}-${r.result || ''}-${r.unit || ''}`}
                  pagination={false}
                  dataSource={selectedNCR.test_parameters.filter((p) => p.status === 'fail')}
                  columns={[
                    { title: 'Parameter', dataIndex: 'name' },
                    { title: 'Spec', dataIndex: 'spec' },
                    { title: 'Result', dataIndex: 'result', render: (v) => <Text type="danger">{v}</Text> },
                    { title: 'Unit', dataIndex: 'unit' },
                  ]}
                  locale={{ emptyText: 'No failed parameters' }}
                />
              </Card>
            )}
          </Space>
        )}
      </Drawer>
    </div>
  );
}
