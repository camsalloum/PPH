/**
 * ProcurementDashboard — Management-only overview at /mes/procurement
 *
 * Shows: PR counts by status, SPO counts by status, overdue deliveries,
 *        recent stock receipts, and a table of open PRs awaiting approval.
 */

import React, { useState, useEffect } from 'react';
import {
  Card, Table, Tag, Row, Col, Statistic, Spin, Alert, Typography, Badge, Button, Space, message as antMsg,
} from 'antd';
import {
  ShoppingCartOutlined, WarningOutlined, CheckCircleOutlined,
  ClockCircleOutlined, TruckOutlined, InboxOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL || '';

const STATUS_COLORS = {
  pending: 'orange', approved: 'green', rejected: 'red', cancelled: 'default',
  draft: 'blue', sent: 'cyan', partially_received: 'gold', received: 'green',
};

export default function ProcurementDashboard() {
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [prs, setPRs] = useState([]);
  const [spos, setSPOs] = useState([]);
  const [error, setError] = useState(null);

  const token = localStorage.getItem('auth_token');
  const headers = { Authorization: `Bearer ${token}` };

  const load = async () => {
    setLoading(true);
    try {
      const [dashRes, prRes, spoRes] = await Promise.all([
        axios.get(`${API_BASE}/api/mes/presales/procurement/dashboard`, { headers }),
        axios.get(`${API_BASE}/api/mes/presales/purchase-requisitions`, { headers }),
        axios.get(`${API_BASE}/api/mes/presales/supplier-purchase-orders`, { headers }),
      ]);
      setDashboard(dashRes.data.data);
      setPRs(prRes.data.data || []);
      setSPOs(spoRes.data.data || []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load procurement dashboard');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const approvePR = async (id) => {
    try {
      await axios.post(`${API_BASE}/api/mes/presales/purchase-requisitions/${id}/approve`, {}, { headers });
      antMsg.success('PR approved');
      load();
    } catch (err) { antMsg.error(err.response?.data?.error || 'Failed'); }
  };

  const approveSPO = async (id) => {
    try {
      await axios.post(`${API_BASE}/api/mes/presales/supplier-purchase-orders/${id}/approve`, {}, { headers });
      antMsg.success('SPO approved');
      load();
    } catch (err) { antMsg.error(err.response?.data?.error || 'Failed'); }
  };

  const sendSPO = async (id) => {
    try {
      await axios.post(`${API_BASE}/api/mes/presales/supplier-purchase-orders/${id}/send`, {}, { headers });
      antMsg.success('SPO sent');
      load();
    } catch (err) { antMsg.error(err.response?.data?.error || 'Failed'); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /></div>;
  if (error) return <Alert message={error} type="error" style={{ margin: 24 }} />;

  const d = dashboard || {};
  const prCounts = d.prs || {};
  const spoCounts = d.spos || {};

  const pendingPRs = prs.filter(p => p.status === 'pending');
  const activeSPOs = spos.filter(s => !['received', 'cancelled'].includes(s.status));

  const prCols = [
    { title: 'PR #', dataIndex: 'pr_number', width: 140, render: v => <strong>{v}</strong> },
    { title: 'Job Card', dataIndex: 'job_number', width: 140 },
    { title: 'Customer', dataIndex: 'customer_name', width: 160, ellipsis: true },
    { title: 'Items', dataIndex: 'material_details', width: 80,
      render: v => `${(v || []).length} items` },
    { title: 'Amount', dataIndex: 'total_amount', width: 100, align: 'right',
      render: v => v ? `AED ${Number(v).toLocaleString('en', { minimumFractionDigits: 2 })}` : '—' },
    { title: 'Status', dataIndex: 'status', width: 100,
      render: v => <Tag color={STATUS_COLORS[v]}>{v?.toUpperCase()}</Tag> },
    { title: 'Date', dataIndex: 'created_at', width: 100,
      render: v => dayjs(v).format('DD MMM YY') },
    { title: 'Action', width: 100,
      render: (_, r) => r.status === 'pending' ? (
        <Button size="small" type="primary" onClick={() => approvePR(r.id)}>Approve</Button>
      ) : null,
    },
  ];

  const spoCols = [
    { title: 'PO #', dataIndex: 'po_number', width: 150, render: v => <strong>{v}</strong> },
    { title: 'Supplier', dataIndex: 'supplier_name', width: 150 },
    { title: 'PR #', dataIndex: 'pr_number', width: 140 },
    { title: 'Amount', dataIndex: 'total_amount', width: 110, align: 'right',
      render: v => v ? `AED ${Number(v).toLocaleString('en', { minimumFractionDigits: 2 })}` : '—' },
    { title: 'Delivery', dataIndex: 'expected_delivery', width: 100,
      render: v => {
        if (!v) return '—';
        const d = dayjs(v);
        const overdue = d.isBefore(dayjs(), 'day');
        return <Text type={overdue ? 'danger' : undefined}>{d.format('DD MMM YY')}{overdue ? ' ⚠' : ''}</Text>;
      },
    },
    { title: 'Status', dataIndex: 'status', width: 120,
      render: v => <Tag color={STATUS_COLORS[v]}>{v?.replace('_', ' ').toUpperCase()}</Tag> },
    { title: 'Action', width: 130,
      render: (_, r) => (
        <Space size="small">
          {r.status === 'draft' && <Button size="small" type="primary" onClick={() => approveSPO(r.id)}>Approve</Button>}
          {r.status === 'approved' && <Button size="small" onClick={() => sendSPO(r.id)}>Send</Button>}
        </Space>
      ),
    },
  ];

  const receiptCols = [
    { title: 'SPO #', dataIndex: 'po_number', width: 150 },
    { title: 'Supplier', dataIndex: 'supplier_name', width: 150 },
    { title: 'Items', dataIndex: 'received_quantities', width: 80,
      render: v => `${(v || []).length} items` },
    { title: 'Received', dataIndex: 'received_at', width: 130,
      render: v => dayjs(v).format('DD MMM YY HH:mm') },
    { title: 'Notes', dataIndex: 'quality_notes', ellipsis: true },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <Title level={4}><ShoppingCartOutlined style={{ marginRight: 8 }} />Procurement Dashboard</Title>

      {/* KPI cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={4}>
          <Card size="small"><Statistic title="PRs Pending" value={prCounts.pending || 0}
            valueStyle={{ color: '#fa8c16' }} prefix={<ClockCircleOutlined />} /></Card>
        </Col>
        <Col span={4}>
          <Card size="small"><Statistic title="PRs Approved" value={prCounts.approved || 0}
            valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} /></Card>
        </Col>
        <Col span={4}>
          <Card size="small"><Statistic title="SPOs Draft" value={spoCounts.draft || 0}
            valueStyle={{ color: '#1890ff' }} /></Card>
        </Col>
        <Col span={4}>
          <Card size="small"><Statistic title="SPOs Sent" value={spoCounts.sent || 0}
            valueStyle={{ color: '#13c2c2' }} prefix={<TruckOutlined />} /></Card>
        </Col>
        <Col span={4}>
          <Card size="small"><Statistic title="Overdue" value={d.overdue_deliveries || 0}
            valueStyle={{ color: d.overdue_deliveries ? '#ff4d4f' : '#52c41a' }}
            prefix={<WarningOutlined />} /></Card>
        </Col>
        <Col span={4}>
          <Card size="small"><Statistic title="Received" value={spoCounts.received || 0}
            valueStyle={{ color: '#52c41a' }} prefix={<InboxOutlined />} /></Card>
        </Col>
      </Row>

      {/* PRs awaiting approval */}
      {pendingPRs.length > 0 && (
        <Card title={<Badge count={pendingPRs.length} offset={[12, 0]}>PRs Awaiting Approval</Badge>}
          size="small" style={{ marginBottom: 16 }}>
          <Table dataSource={pendingPRs} columns={prCols} size="small" pagination={false} bordered rowKey="id" />
        </Card>
      )}

      {/* Active SPOs */}
      <Card title="Active Supplier Purchase Orders" size="small" style={{ marginBottom: 16 }}>
        <Table dataSource={activeSPOs} columns={spoCols} size="small"
          pagination={activeSPOs.length > 10 ? { pageSize: 10 } : false} bordered rowKey="id"
          locale={{ emptyText: 'No active supplier POs' }} />
      </Card>

      {/* Recent receipts */}
      {(d.recent_receipts || []).length > 0 && (
        <Card title="Recent Stock Receipts" size="small">
          <Table dataSource={d.recent_receipts} columns={receiptCols} size="small" pagination={false} bordered rowKey="id" />
        </Card>
      )}
    </div>
  );
}
