import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Card, Table, Input, Select, Button, Space, Tag, Typography, Modal,
  Row, Col, Tooltip, Empty, message
} from 'antd';
import {
  SearchOutlined,
  StopOutlined,
  ReloadOutlined,
  EditOutlined,
  UndoOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import axios from 'axios';

const { Text, Title } = Typography;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const REASON_COLORS = {
  competitor: 'red',
  price: 'orange',
  quality: 'volcano',
  service: 'magenta',
  closed_business: 'default',
  relocated: 'geekblue',
  no_demand: 'cyan',
  payment_issues: 'gold',
  other: 'purple',
};

const REASON_LABELS = {
  competitor: 'Lost to Competitor',
  price: 'Pricing Issue',
  quality: 'Quality Complaints',
  service: 'Poor Service',
  closed_business: 'Closed / Bankrupt',
  relocated: 'Relocated',
  no_demand: 'No Demand',
  payment_issues: 'Payment Issues',
  other: 'Other',
};

const REASON_OPTIONS = Object.entries(REASON_LABELS).map(([value, label]) => ({ value, label }));

const LostBusiness = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState(null);
  const debounceRef = useRef(null);

  // Debounce search input (300ms)
  const handleSearchChange = (value) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [editReason, setEditReason] = useState('other');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Recover modal
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [recoverRecord, setRecoverRecord] = useState(null);
  const [recoverNote, setRecoverNote] = useState('');
  const [recovering, setRecovering] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (reasonFilter) params.append('reason', reasonFilter);

      const res = await axios.get(
        `${API_BASE_URL}/api/crm/lost-business?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        setData(res.data.data || []);
      }
    } catch (err) {
      message.error('Failed to load lost business list');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, reasonFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleEdit = (record) => {
    setEditRecord(record);
    setEditReason(record.reason);
    setEditNotes(record.notes || '');
    setEditOpen(true);
  };

  const submitEdit = async () => {
    if (!editRecord) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      await axios.patch(
        `${API_BASE_URL}/api/crm/lost-business/${editRecord.id}`,
        { reason: editReason, notes: editNotes || null },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('Updated successfully');
      setEditOpen(false);
      fetchData();
    } catch (err) {
      message.error('Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleRecover = (record) => {
    setRecoverRecord(record);
    setRecoverNote('');
    setRecoverOpen(true);
  };

  const submitRecover = async () => {
    if (!recoverRecord) return;
    setRecovering(true);
    try {
      const token = localStorage.getItem('auth_token');
      await axios.post(
        `${API_BASE_URL}/api/crm/lost-business/${recoverRecord.id}/recover`,
        { recovered_note: recoverNote || null },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success(`${recoverRecord.customer_name || 'Customer'} recovered!`);
      setRecoverOpen(false);
      fetchData();
    } catch (err) {
      message.error('Failed to recover customer');
    } finally {
      setRecovering(false);
    }
  };

  const columns = [
    {
      title: 'Customer Name',
      dataIndex: 'customer_name',
      key: 'customer_name',
      ellipsis: true,
      render: (name) => <Text strong>{name || '—'}</Text>,
    },
    {
      title: 'Country',
      dataIndex: 'country',
      key: 'country',
      width: 120,
      render: (c) => c || <Text type="secondary">—</Text>,
    },
    {
      title: 'Reason',
      dataIndex: 'reason',
      key: 'reason',
      width: 160,
      render: (reason) => (
        <Tag color={REASON_COLORS[reason] || 'default'}>
          {REASON_LABELS[reason] || reason}
        </Tag>
      ),
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      ellipsis: true,
      width: 200,
      render: (notes) => notes || <Text type="secondary">—</Text>,
    },
    {
      title: <span><CalendarOutlined /> Lost Date</span>,
      dataIndex: 'lost_date',
      key: 'lost_date',
      width: 120,
      align: 'center',
      render: (date) => {
        if (!date) return '—';
        const d = new Date(date);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      },
    },
    {
      title: 'Last Order',
      dataIndex: 'last_order_amount',
      key: 'last_order_amount',
      width: 120,
      align: 'right',
      render: (amt) => {
        if (!amt) return <Text type="secondary">—</Text>;
        return <Text>{Number(amt).toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>;
      },
    },
    {
      title: 'Avg Monthly',
      dataIndex: 'monthly_avg_revenue',
      key: 'monthly_avg_revenue',
      width: 120,
      align: 'right',
      render: (amt) => {
        if (!amt) return <Text type="secondary">—</Text>;
        return <Text>{Number(amt).toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      align: 'center',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Edit reason / notes">
            <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Tooltip title="Recover customer">
            <Button
              size="small"
              type="primary"
              ghost
              icon={<UndoOutlined />}
              onClick={() => handleRecover(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <StopOutlined style={{ color: '#ff4d4f' }} />
          <span>Lost Business</span>
          <Tag>{data.length}</Tag>
        </Space>
      }
      extra={
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
          Refresh
        </Button>
      }
    >
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={8}>
          <Input
            placeholder="Search customer name..."
            prefix={<SearchOutlined />}
            allowClear
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Select
            placeholder="Filter by reason"
            allowClear
            style={{ width: '100%' }}
            value={reasonFilter}
            onChange={setReasonFilter}
            options={REASON_OPTIONS}
          />
        </Col>
      </Row>

      <Table
        dataSource={data}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} customers` }}
        locale={{ emptyText: <Empty description="No lost business records" /> }}
      />

      {/* Edit Modal */}
      <Modal
        title={`Edit: ${editRecord?.customer_name || ''}`}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={submitEdit}
        confirmLoading={saving}
        okText="Save"
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>Reason</div>
            <Select
              value={editReason}
              onChange={setEditReason}
              style={{ width: '100%' }}
              options={REASON_OPTIONS}
            />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>Notes</div>
            <Input.TextArea
              rows={3}
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Additional details..."
            />
          </div>
        </Space>
      </Modal>

      {/* Recover Modal */}
      <Modal
        title={`Recover: ${recoverRecord?.customer_name || ''}`}
        open={recoverOpen}
        onCancel={() => setRecoverOpen(false)}
        onOk={submitRecover}
        confirmLoading={recovering}
        okText="Recover Customer"
      >
        <p>This will mark <strong>{recoverRecord?.customer_name}</strong> as recovered and they will appear in your Customer Health list again.</p>
        <div>
          <div style={{ marginBottom: 4, fontWeight: 500 }}>Recovery Note (optional)</div>
          <Input.TextArea
            rows={2}
            value={recoverNote}
            onChange={(e) => setRecoverNote(e.target.value)}
            placeholder="Why is this customer being recovered?"
          />
        </div>
      </Modal>
    </Card>
  );
};

export default LostBusiness;
