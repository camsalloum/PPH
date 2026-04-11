/**
 * CustomerPOPanel — PO capture form + existing PO display on InquiryDetail tab.
 *
 * Shows a capture form when inquiry is at price_accepted or sample_approved.
 * Displays captured PO details when PO already exists.
 * Warns when PO value deviates ±5% from quotation total.
 */
import { useState, useEffect } from 'react';
import { Card, Form, Input, DatePicker, Select, InputNumber, Button, Alert, Descriptions, Tag, App } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';

const API = import.meta.env.VITE_API_URL ?? '';

export default function CustomerPOPanel({ inquiry }) {
  const [form] = Form.useForm();
  const [pos, setPos] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deviation, setDeviation] = useState(null);
  const { message } = App.useApp();

  const canCapture = ['price_accepted', 'sample_approved'].includes(inquiry?.inquiry_stage);
  const token = localStorage.getItem('auth_token');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (!inquiry?.id) return;
    setLoading(true);
    Promise.all([
      axios.get(`${API}/api/mes/presales/customer-po?inquiry_id=${inquiry.id}`, { headers }),
      axios.get(`${API}/api/mes/presales/quotations?inquiry_id=${inquiry.id}`, { headers }),
    ]).then(([poRes, qRes]) => {
      setPos(poRes.data?.data || []);
      setQuotations((qRes.data?.data || []).filter(q => ['accepted', 'approved'].includes(q.status)));
    }).catch(() => {}).finally(() => setLoading(false));
  }, [inquiry?.id]);

  const handleQuotationChange = (quotId) => {
    const q = quotations.find(x => x.id === quotId);
    if (q) form.setFieldsValue({ po_value: Number(q.total_price) });
  };

  const handlePoValueChange = (val) => {
    const quotId = form.getFieldValue('quotation_id');
    const q = quotations.find(x => x.id === quotId);
    if (q && val) {
      const qt = Number(q.total_price);
      const dev = qt > 0 ? Math.abs(val - qt) / qt : 0;
      setDeviation(dev > 0.05 ? `PO value deviates ${(dev * 100).toFixed(1)}% from quotation total (${qt.toLocaleString()})` : null);
    } else setDeviation(null);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const res = await axios.post(`${API}/api/mes/presales/customer-po`, {
        ...values,
        po_date: values.po_date?.format('YYYY-MM-DD'),
        requested_delivery_date: values.requested_delivery_date?.format('YYYY-MM-DD'),
        inquiry_id: inquiry.id,
      }, { headers });
      message.success('PO captured successfully');
      if (res.data?.deviation_warning) message.warning(res.data.deviation_warning);
      setPos(prev => [res.data.data, ...prev]);
      form.resetFields();
      setDeviation(null);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to capture PO');
    } finally { setSaving(false); }
  };

  if (loading) return <Card loading />;

  // Show existing POs
  if (pos.length > 0) {
    return (
      <div>
        {pos.map(po => (
          <Card key={po.id} size="small" style={{ marginBottom: 12 }}>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="PO Number">{po.po_number}</Descriptions.Item>
              <Descriptions.Item label="PO Date">{po.po_date}</Descriptions.Item>
              <Descriptions.Item label="Value">{po.currency} {Number(po.po_value || 0).toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="Status"><Tag color="green">{po.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="Delivery Date">{po.requested_delivery_date || '—'}</Descriptions.Item>
              <Descriptions.Item label="Address">{po.delivery_address || '—'}</Descriptions.Item>
            </Descriptions>
          </Card>
        ))}
      </div>
    );
  }

  if (!canCapture) {
    return <Card><Alert type="info" message="PO capture available when inquiry reaches price_accepted or sample_approved stage." /></Card>;
  }

  return (
    <Card title="Capture Customer PO">
      {deviation && <Alert type="warning" message={deviation} style={{ marginBottom: 12 }} showIcon />}
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item name="po_number" label="PO Number" rules={[{ required: true }]}>
          <Input placeholder="Customer PO number" />
        </Form.Item>
        <Form.Item name="po_date" label="PO Date" rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="quotation_id" label="Quotation" rules={[{ required: true }]}>
          <Select placeholder="Select quotation" onChange={handleQuotationChange}
            options={quotations.map(q => ({ value: q.id, label: `${q.quotation_number} — ${q.currency} ${Number(q.total_price).toLocaleString()}` }))} />
        </Form.Item>
        <Form.Item name="po_value" label="PO Value">
          <InputNumber style={{ width: '100%' }} min={0} onChange={handlePoValueChange} />
        </Form.Item>
        <Form.Item name="delivery_address" label="Delivery Address">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="requested_delivery_date" label="Requested Delivery Date">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={saving}>Capture PO</Button>
      </Form>
    </Card>
  );
}
