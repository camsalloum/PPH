/**
 * JobCardPanel — Tab on InquiryDetail showing job card status, BOM, actions
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Tag, Descriptions, Table, Timeline, Spin, Empty, App, Popconfirm, Space } from 'antd';
import { FileAddOutlined, CheckCircleOutlined, PrinterOutlined } from '@ant-design/icons';
import { useAuth } from '../../../contexts/AuthContext';
import axios from 'axios';
import dayjs from 'dayjs';
import JobCardForm from './JobCardForm';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const STATUS_COLORS = {
  draft: 'orange', approved: 'green', in_production: 'blue', completed: 'cyan', cancelled: 'red',
};
const MAT_COLORS = {
  pending: 'default', partially_ordered: 'orange', ordered: 'blue', available: 'green',
};

export default function JobCardPanel({ inquiry, onReload }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const [jobCard, setJobCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [approving, setApproving] = useState(false);

  const canManage = ['admin', 'manager', 'sales_manager', 'production_manager'].includes(user?.role);

  const loadJobCard = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.get(`${API_BASE}/api/mes/presales/job-cards`, {
        params: { inquiry_id: inquiry.id },
        headers: { Authorization: `Bearer ${token}` },
      });
      // The API returns list; pick first for this inquiry
      const cards = res.data?.data || [];
      const match = cards.find(c => c.inquiry_id === inquiry.id);
      setJobCard(match || null);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [inquiry.id]);

  useEffect(() => { loadJobCard(); }, [loadJobCard]);

  const handleApprove = async () => {
    setApproving(true);
    try {
      const token = localStorage.getItem('auth_token');
      await axios.post(`${API_BASE}/api/mes/presales/job-cards/${jobCard.id}/approve`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      message.success('Job card approved — inquiry moved to In Production');
      loadJobCard();
      onReload?.();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to approve');
    } finally { setApproving(false); }
  };

  const handleFormSuccess = () => { setShowForm(false); loadJobCard(); onReload?.(); };

  if (loading) return <Card title="Job Card"><Spin /></Card>;

  // No job card yet — show create button
  if (!jobCard) {
    if (inquiry.inquiry_stage !== 'order_confirmed' || !canManage) {
      return <Card title="Job Card"><Empty description="No job card yet" /></Card>;
    }
    if (showForm) {
      return (
        <Card title="Create Job Card">
          <JobCardForm inquiry={inquiry} onSuccess={handleFormSuccess} />
          <Button style={{ marginTop: 8 }} onClick={() => setShowForm(false)}>Cancel</Button>
        </Card>
      );
    }
    return (
      <Card title="Job Card">
        <Empty description="No job card for this inquiry" />
        <Button type="primary" icon={<FileAddOutlined />} onClick={() => setShowForm(true)} style={{ marginTop: 12 }}>
          Create Job Card
        </Button>
      </Card>
    );
  }

  // Job card exists — show details
  const bom = Array.isArray(jobCard.material_requirements) ? jobCard.material_requirements : [];
  const bomColumns = [
    { title: 'Material', dataIndex: 'material_name', key: 'name' },
    { title: 'Qty Required', dataIndex: 'qty_required', key: 'req', width: 110 },
    { title: 'Qty Available', dataIndex: 'qty_available', key: 'avail', width: 110 },
    { title: 'Status', key: 'st', width: 100, render: (_, r) => (
      <Tag color={r.qty_available >= r.qty_required ? 'green' : 'red'}>
        {r.qty_available >= r.qty_required ? 'OK' : 'Short'}
      </Tag>
    )},
  ];

  return (
    <Card title={<span>Job Card — {jobCard.job_number} <Tag color={STATUS_COLORS[jobCard.status]}>{jobCard.status}</Tag></span>}>
      <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Customer">{jobCard.customer_name}</Descriptions.Item>
        <Descriptions.Item label="Quantity">{jobCard.quantity} {jobCard.quantity_unit}</Descriptions.Item>
        <Descriptions.Item label="Delivery Date">{jobCard.required_delivery_date ? dayjs(jobCard.required_delivery_date).format('DD MMM YYYY') : '—'}</Descriptions.Item>
        <Descriptions.Item label="Material Status">
          <Tag color={MAT_COLORS[jobCard.material_status]}>{jobCard.material_status}</Tag>
        </Descriptions.Item>
      </Descriptions>

      {bom.length > 0 && (
        <>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Bill of Materials</div>
          <Table
            dataSource={bom}
            columns={bomColumns}
            pagination={false}
            size="small"
            rowKey={(r, i) => r._rowId || r.id || `${r.material_name || 'material'}-${r.qty_required ?? 0}-${r.qty_available ?? 0}-${i}`}
            style={{ marginBottom: 16 }}
          />
        </>
      )}

      {jobCard.status === 'draft' && canManage && (
        <Space>
          <Button onClick={() => setShowForm(true)}>Edit</Button>
          <Popconfirm title="Approve this job card? Inquiry will advance to In Production." onConfirm={handleApprove}>
            <Button type="primary" icon={<CheckCircleOutlined />} loading={approving}>Approve Job Card</Button>
          </Popconfirm>
        </Space>
      )}

      {showForm && jobCard.status === 'draft' && (
        <Card style={{ marginTop: 16 }}>
          <JobCardForm inquiry={inquiry} jobCard={jobCard} onSuccess={handleFormSuccess} />
          <Button style={{ marginTop: 8 }} onClick={() => setShowForm(false)}>Cancel</Button>
        </Card>
      )}
    </Card>
  );
}
