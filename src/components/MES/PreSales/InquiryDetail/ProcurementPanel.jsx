/**
 * ProcurementPanel — Tab on InquiryDetail showing PR/PO/Receipt status.
 *
 * Visible after job card is created. Shows:
 *   - Purchase Requisitions list + "Raise PR" button (procurement roles)
 *   - Supplier POs linked to PRs
 *   - Stock Receipts
 *   - Material status summary
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Tag, Button, Space, Spin, Empty, Badge, Tooltip, Typography, Row, Col, Statistic, Modal, message as antMsg,
} from 'antd';
import {
  ShoppingCartOutlined, CheckCircleOutlined, ClockCircleOutlined,
  PlusOutlined, SendOutlined, TruckOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import PurchaseRequisitionForm from '../PurchaseRequisitionForm';
import SupplierPurchaseOrderForm from '../SupplierPurchaseOrderForm';
import StockReceiptForm from '../StockReceiptForm';

const { Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL || '';

const STATUS_COLORS = {
  pending: 'orange', approved: 'green', rejected: 'red', cancelled: 'default',
  draft: 'blue', sent: 'cyan', partially_received: 'gold', received: 'green',
};

export default function ProcurementPanel({ inquiry, user, onReload }) {
  const [loading, setLoading] = useState(false);
  const [prs, setPRs] = useState([]);
  const [spos, setSPOs] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [jobCard, setJobCard] = useState(null);

  // Modals
  const [showPRForm, setShowPRForm] = useState(false);
  const [showSPOForm, setShowSPOForm] = useState(false);
  const [selectedPR, setSelectedPR] = useState(null);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [selectedSPO, setSelectedSPO] = useState(null);

  const canProcure = ['admin', 'manager', 'procurement', 'stores_keeper', 'production_manager', 'sales_manager'].includes(user?.role);
  const canApprove = ['admin', 'manager', 'production_manager', 'sales_manager'].includes(user?.role);
  const canReceive = ['admin', 'stores_keeper', 'procurement', 'manager'].includes(user?.role);

  const token = localStorage.getItem('auth_token');
  const headers = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    if (!inquiry?.id) return;
    setLoading(true);
    try {
      const [prRes, spoRes, rcRes, jcRes] = await Promise.all([
        axios.get(`${API_BASE}/api/mes/presales/purchase-requisitions`, { headers, params: { inquiry_id: inquiry.id } }),
        axios.get(`${API_BASE}/api/mes/presales/supplier-purchase-orders`, { headers }),
        axios.get(`${API_BASE}/api/mes/presales/stock-receipts`, { headers }),
        axios.get(`${API_BASE}/api/mes/presales/job-cards`, { headers, params: { inquiry_id: inquiry.id } }),
      ]);
      setPRs(prRes.data.data || []);

      // Filter SPOs to only those linked to this inquiry's PRs
      const prIds = new Set((prRes.data.data || []).map(p => p.id));
      const filteredSPOs = (spoRes.data.data || []).filter(s => prIds.has(s.pr_id));
      setSPOs(filteredSPOs);

      // Filter receipts to this inquiry's job card
      const jcs = jcRes.data.data || [];
      if (jcs.length) {
        setJobCard(jcs[0]);
        const jcId = jcs[0].id;
        setReceipts((rcRes.data.data || []).filter(r => r.job_card_id === jcId));
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [inquiry?.id]);

  useEffect(() => { load(); }, [load]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const approvePR = async (prId) => {
    try {
      await axios.post(`${API_BASE}/api/mes/presales/purchase-requisitions/${prId}/approve`, {}, { headers });
      antMsg.success('PR approved');
      load();
    } catch (err) { antMsg.error(err.response?.data?.error || 'Failed to approve PR'); }
  };

  const approveSPO = async (spoId) => {
    try {
      await axios.post(`${API_BASE}/api/mes/presales/supplier-purchase-orders/${spoId}/approve`, {}, { headers });
      antMsg.success('Supplier PO approved');
      load();
    } catch (err) { antMsg.error(err.response?.data?.error || 'Failed to approve SPO'); }
  };

  const sendSPO = async (spoId) => {
    try {
      await axios.post(`${API_BASE}/api/mes/presales/supplier-purchase-orders/${spoId}/send`, {}, { headers });
      antMsg.success('Supplier PO marked as sent');
      load();
    } catch (err) { antMsg.error(err.response?.data?.error || 'Failed to send SPO'); }
  };

  // Don't render if no job card or too early in pipeline
  const showStages = ['order_confirmed', 'in_production', 'ready_dispatch', 'delivered', 'closed'];
  if (!showStages.includes(inquiry?.inquiry_stage)) return null;

  // ── PR Columns ────────────────────────────────────────────────────────────
  const prCols = [
    { title: 'PR #', dataIndex: 'pr_number', width: 140, render: v => <strong>{v}</strong> },
    { title: 'Materials', dataIndex: 'material_details', width: 120,
      render: v => `${(v || []).length} items` },
    { title: 'Amount', dataIndex: 'total_amount', width: 100, align: 'right',
      render: v => v ? Number(v).toLocaleString('en', { minimumFractionDigits: 2 }) : '—' },
    { title: 'Status', dataIndex: 'status', width: 100,
      render: v => <Tag color={STATUS_COLORS[v] || 'default'}>{v?.toUpperCase()}</Tag> },
    { title: 'Date', dataIndex: 'created_at', width: 100,
      render: v => dayjs(v).format('DD MMM YY') },
    { title: 'Actions', width: 160,
      render: (_, r) => (
        <Space size="small">
          {r.status === 'pending' && canApprove && (
            <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => approvePR(r.id)}>Approve</Button>
          )}
          {r.status === 'approved' && canProcure && (
            <Button size="small" icon={<PlusOutlined />} onClick={() => { setSelectedPR(r); setShowSPOForm(true); }}>Create PO</Button>
          )}
        </Space>
      ),
    },
  ];

  // ── SPO Columns ───────────────────────────────────────────────────────────
  const spoCols = [
    { title: 'PO #', dataIndex: 'po_number', width: 150, render: v => <strong>{v}</strong> },
    { title: 'Supplier', dataIndex: 'supplier_name', width: 150 },
    { title: 'Amount', dataIndex: 'total_amount', width: 100, align: 'right',
      render: v => v ? Number(v).toLocaleString('en', { minimumFractionDigits: 2 }) : '—' },
    { title: 'Delivery', dataIndex: 'expected_delivery', width: 100,
      render: v => v ? dayjs(v).format('DD MMM YY') : '—' },
    { title: 'Status', dataIndex: 'status', width: 110,
      render: v => <Tag color={STATUS_COLORS[v] || 'default'}>{v?.toUpperCase()}</Tag> },
    { title: 'Actions', width: 200,
      render: (_, r) => (
        <Space size="small">
          {r.status === 'draft' && canApprove && (
            <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => approveSPO(r.id)}>Approve</Button>
          )}
          {r.status === 'approved' && canProcure && (
            <Button size="small" icon={<SendOutlined />} onClick={() => sendSPO(r.id)}>Send</Button>
          )}
          {['sent', 'partially_received'].includes(r.status) && canReceive && (
            <Button size="small" icon={<TruckOutlined />} onClick={() => { setSelectedSPO(r); setShowReceiptForm(true); }}>Receive</Button>
          )}
        </Space>
      ),
    },
  ];

  // ── Receipt Columns ───────────────────────────────────────────────────────
  const rcCols = [
    { title: 'SPO #', dataIndex: 'po_number', width: 150 },
    { title: 'Supplier', dataIndex: 'supplier_name', width: 150 },
    { title: 'Items', dataIndex: 'received_quantities', width: 100,
      render: v => `${(v || []).length} items` },
    { title: 'Received', dataIndex: 'received_at', width: 120,
      render: v => dayjs(v).format('DD MMM YY HH:mm') },
    { title: 'Notes', dataIndex: 'quality_notes', ellipsis: true },
  ];

  const materialBadge = jobCard?.material_status === 'available'
    ? <Badge status="success" text="All Materials Available" />
    : jobCard?.material_status === 'ordered'
    ? <Badge status="processing" text="Materials Ordered" />
    : <Badge status="warning" text={`Material Status: ${jobCard?.material_status || 'pending'}`} />;

  return (
    <Card
      title={<><ShoppingCartOutlined style={{ marginRight: 8 }} />Material Procurement</>}
      size="small"
      style={{ marginBottom: 16 }}
      extra={materialBadge}
    >
      {loading ? <Spin /> : (
        <>
          {/* Summary stats */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}><Statistic title="Open PRs" value={prs.filter(p => p.status === 'pending').length} /></Col>
            <Col span={6}><Statistic title="Active POs" value={spos.filter(s => !['received','cancelled'].includes(s.status)).length} /></Col>
            <Col span={6}><Statistic title="Receipts" value={receipts.length} /></Col>
            <Col span={6}><Statistic title="Total PR Value"
              value={prs.reduce((s, p) => s + (Number(p.total_amount) || 0), 0)}
              precision={2} prefix="AED " /></Col>
          </Row>

          {/* PRs */}
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong>Purchase Requisitions</Text>
            {canProcure && jobCard && (
              <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setShowPRForm(true)}>
                Raise PR
              </Button>
            )}
          </div>
          <Table dataSource={prs} columns={prCols} size="small" pagination={false} bordered rowKey="id"
            locale={{ emptyText: <Empty description="No purchase requisitions yet" /> }} />

          {/* SPOs */}
          {spos.length > 0 && (
            <>
              <Text strong style={{ display: 'block', marginTop: 16, marginBottom: 8 }}>Supplier Purchase Orders</Text>
              <Table dataSource={spos} columns={spoCols} size="small" pagination={false} bordered rowKey="id" />
            </>
          )}

          {/* Receipts */}
          {receipts.length > 0 && (
            <>
              <Text strong style={{ display: 'block', marginTop: 16, marginBottom: 8 }}>Stock Receipts</Text>
              <Table dataSource={receipts} columns={rcCols} size="small" pagination={false} bordered rowKey="id" />
            </>
          )}
        </>
      )}

      {/* PR Form Modal */}
      <Modal open={showPRForm} onCancel={() => setShowPRForm(false)} footer={null}
        title="Raise Purchase Requisition" width={700} destroyOnClose>
        <PurchaseRequisitionForm jobCard={jobCard} inquiry={inquiry} user={user}
          onSuccess={() => { setShowPRForm(false); load(); if (onReload) onReload(); }} />
      </Modal>

      {/* SPO Form Modal */}
      <Modal open={showSPOForm} onCancel={() => { setShowSPOForm(false); setSelectedPR(null); }} footer={null}
        title="Create Supplier Purchase Order" width={700} destroyOnClose>
        <SupplierPurchaseOrderForm pr={selectedPR} user={user}
          onSuccess={() => { setShowSPOForm(false); setSelectedPR(null); load(); }} />
      </Modal>

      {/* Receipt Form Modal */}
      <Modal open={showReceiptForm} onCancel={() => { setShowReceiptForm(false); setSelectedSPO(null); }} footer={null}
        title="Record Stock Receipt" width={700} destroyOnClose>
        <StockReceiptForm spo={selectedSPO} user={user}
          onSuccess={() => { setShowReceiptForm(false); setSelectedSPO(null); load(); if (onReload) onReload(); }} />
      </Modal>
    </Card>
  );
}
