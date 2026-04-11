/**
 * TechnicalBriefForm — Capture and manage technical product interest briefs
 * within CustomerDetail. Supports partial saves and conversion to inquiry.
 *
 * Props:
 *   customerId   — FK to fp_customer_unified
 *   customerName — display name for the customer
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Form, Input, Select, Table, Tag, Space, Modal, App, Empty, Spin, Tooltip } from 'antd';
import { PlusOutlined, SendOutlined, EditOutlined, FileTextOutlined } from '@ant-design/icons';
import axios from 'axios';

const { TextArea } = Input;
const { Option } = Select;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const STATUS_COLORS = { draft: 'blue', submitted: 'orange', converted: 'green' };

const TechnicalBriefForm = ({ customerId, customerName }) => {
  const { message } = App.useApp();
  const [briefs, setBriefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBrief, setEditingBrief] = useState(null);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.get(`${API_BASE}/api/crm/technical-briefs`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { customer_id: customerId },
      });
      setBriefs(res.data?.data || []);
    } catch { setBriefs([]); }
    finally { setLoading(false); }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditingBrief(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (brief) => { setEditingBrief(brief); form.setFieldsValue(brief); setModalOpen(true); };

  const handleSave = async (values) => {
    setSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };
      if (editingBrief) {
        await axios.put(`${API_BASE}/api/crm/technical-briefs/${editingBrief.id}`, values, { headers });
        message.success('Brief updated');
      } else {
        await axios.post(`${API_BASE}/api/crm/technical-briefs`, { ...values, customer_id: customerId }, { headers });
        message.success('Brief created');
      }
      setModalOpen(false);
      form.resetFields();
      load();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to save brief');
    } finally { setSaving(false); }
  };

  const handleConvert = async (briefId) => {
    setConverting(true);
    try {
      const token = localStorage.getItem('auth_token');
      await axios.post(`${API_BASE}/api/crm/technical-briefs/${briefId}/convert`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      message.success('Brief converted to inquiry');
      load();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to convert brief');
    } finally { setConverting(false); }
  };

  const columns = [
    { title: 'Product', dataIndex: 'product_description', key: 'desc', ellipsis: true,
      render: (t) => <span style={{ fontWeight: 500 }}>{t}</span> },
    { title: 'Category', dataIndex: 'product_category', key: 'cat', width: 120,
      render: (v) => v || <span style={{ color: '#bbb' }}>—</span> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      render: (s) => <Tag color={STATUS_COLORS[s] || 'default'}>{s}</Tag> },
    { title: 'Created', dataIndex: 'created_at', key: 'date', width: 110,
      render: (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
    { title: '', key: 'actions', width: 140, render: (_, record) => (
      <Space size={4}>
        {record.status !== 'converted' && (
          <>
            <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} /></Tooltip>
            <Tooltip title="Submit as Inquiry">
              <Button size="small" type="primary" icon={<SendOutlined />} loading={converting}
                style={{ background: '#52c41a', borderColor: '#52c41a' }}
                onClick={() => Modal.confirm({
                  title: 'Convert to Pre-Sales Inquiry?',
                  content: `This will create a new inquiry for "${customerName}" from this brief.`,
                  okText: 'Convert', onOk: () => handleConvert(record.id),
                })} />
            </Tooltip>
          </>
        )}
        {record.status === 'converted' && record.inquiry_id && (
          <Tag color="green">Inquiry #{record.inquiry_id}</Tag>
        )}
      </Space>
    )},
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          <FileTextOutlined style={{ marginRight: 6 }} />Technical Briefs
        </span>
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openNew}
          style={{ background: '#4f46e5', borderColor: '#4f46e5' }}>
          New Brief
        </Button>
      </div>
      {loading ? <Spin style={{ display: 'block', margin: '16px auto' }} /> :
        briefs.length === 0 ? <Empty description="No technical briefs yet" image={Empty.PRESENTED_IMAGE_SIMPLE} /> :
        <Table dataSource={briefs} columns={columns} rowKey="id" size="small" pagination={false} />}

      <Modal title={editingBrief ? 'Edit Technical Brief' : 'New Technical Brief'}
        open={modalOpen} onCancel={() => { setModalOpen(false); form.resetFields(); }}
        footer={null} width={560}>
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 12 }}>
          <Form.Item name="product_description" label="Product Description" rules={[{ required: true, message: 'Required' }]}>
            <TextArea rows={2} placeholder="Describe the product interest..." />
          </Form.Item>
          <Form.Item name="product_category" label="Product Category">
            <Input placeholder="e.g. Laminated Pouches, Shrink Sleeves" />
          </Form.Item>
          <Form.Item name="substrate_interest" label="Substrate Interest">
            <Input placeholder="e.g. PET/PE, BOPP/CPP" />
          </Form.Item>
          <Form.Item name="approx_dimensions" label="Approx Dimensions">
            <Input placeholder="e.g. 200x300mm" />
          </Form.Item>
          <Form.Item name="print_colors" label="Print Colors">
            <Input placeholder="e.g. 8 colors, CMYK + 2 spot" />
          </Form.Item>
          <Form.Item name="barrier_requirements" label="Barrier Requirements">
            <TextArea rows={2} placeholder="e.g. High oxygen barrier, moisture barrier" />
          </Form.Item>
          <Form.Item name="annual_volume_est" label="Annual Volume Estimate">
            <Input placeholder="e.g. 50,000 KG" />
          </Form.Item>
          <Form.Item name="target_price_range" label="Target Price Range">
            <Input placeholder="e.g. $2.50-3.00/KG" />
          </Form.Item>
          <Form.Item name="current_supplier" label="Current Supplier">
            <Input placeholder="e.g. ABC Packaging Co." />
          </Form.Item>
          <Form.Item name="decision_timeline" label="Decision Timeline">
            <Input placeholder="e.g. Q2 2026" />
          </Form.Item>
          <Form.Item name="next_step_agreed" label="Next Step Agreed">
            <TextArea rows={2} placeholder="e.g. Send samples by end of month" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setModalOpen(false); form.resetFields(); }}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={saving}
                style={{ background: '#4f46e5', borderColor: '#4f46e5' }}>
                {editingBrief ? 'Update Brief' : 'Save Brief'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default TechnicalBriefForm;
