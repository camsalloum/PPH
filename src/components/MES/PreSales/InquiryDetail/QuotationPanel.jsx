/**
 * QuotationPanel — Estimation entry + quotation management inside InquiryDetail.
 *
 * Visible when inquiry_stage >= cse_approved.
 * Shows: estimation form → create quotation → approve → send → customer response.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Input, InputNumber, Select, DatePicker, Form, Tag, Space, Divider, Typography, Descriptions, Alert } from 'antd';
import { DollarOutlined, SendOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { CRM_FULL_ACCESS_ROLES } from '../../../../utils/roleConstants';

const { Text, Title } = Typography;
const { TextArea } = Input;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const STATUS_COLORS = {
  draft: { color: 'blue', label: 'Draft' },
  pending_approval: { color: 'orange', label: 'Pending Approval' },
  approved: { color: 'green', label: 'Approved' },
  sent: { color: 'cyan', label: 'Sent to Customer' },
  accepted: { color: 'green', label: 'Accepted' },
  rejected: { color: 'red', label: 'Rejected' },
  expired: { color: 'default', label: 'Expired' },
  counter_offer: { color: 'gold', label: 'Counter Offer' },
};

const RESPONSE_OPTIONS = [
  { value: 'accepted', label: '✅ Accepted', color: '#52c41a' },
  { value: 'rejected', label: '❌ Rejected', color: '#f5222d' },
  { value: 'counter_offer', label: '🤝 Counter Offer', color: '#fa8c16' },
  { value: 'no_response', label: '⏳ No Response', color: '#8c8c8c' },
];

export default function QuotationPanel({ inquiry, user, message, onReload }) {
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showResponseForm, setShowResponseForm] = useState(null); // quotation id
  const [form] = Form.useForm();
  const [responseForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const token = localStorage.getItem('auth_token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchQuotations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/api/mes/presales/quotations`, {
        params: { inquiry_id: inquiry.id }, headers,
      });
      setQuotations(res.data?.data || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [inquiry.id]);

  useEffect(() => { fetchQuotations(); }, [fetchQuotations]);

  // Auto-calculate total price when inputs change
  const handleEstimationChange = () => {
    const vals = form.getFieldsValue();
    const material = parseFloat(vals.material_cost) || 0;
    const process = parseFloat(vals.process_cost) || 0;
    const overhead = parseFloat(vals.overhead_cost) || 0;
    const margin = parseFloat(vals.margin_percent) || 0;
    const qty = parseFloat(vals.quantity) || 1;

    const baseCost = material + process + overhead;
    const unitPrice = baseCost * (1 + margin / 100);
    const totalPrice = unitPrice * qty;

    form.setFieldsValue({
      unit_price: Math.round(unitPrice * 100) / 100,
      total_price: Math.round(totalPrice * 100) / 100,
    });
  };

  const handleCreateQuotation = async (values) => {
    try {
      setSubmitting(true);
      await axios.post(`${API_BASE}/api/mes/presales/quotations`, {
        inquiry_id: inquiry.id,
        ...values,
        valid_until: values.valid_until ? values.valid_until.format('YYYY-MM-DD') : null,
      }, { headers });
      message.success('Quotation created');
      setShowForm(false);
      form.resetFields();
      fetchQuotations();
      onReload();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to create quotation');
    } finally { setSubmitting(false); }
  };

  const handleApprove = async (quotId) => {
    try {
      await axios.post(`${API_BASE}/api/mes/presales/quotations/${quotId}/approve`, {}, { headers });
      message.success('Quotation approved');
      fetchQuotations();
      onReload();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to approve');
    }
  };

  const handleSend = async (quotId) => {
    try {
      await axios.post(`${API_BASE}/api/mes/presales/quotations/${quotId}/send`, {}, { headers });
      message.success('Quotation marked as sent');
      fetchQuotations();
      onReload();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to send');
    }
  };

  const handleCustomerResponse = async (quotId, values) => {
    try {
      setSubmitting(true);
      await axios.post(`${API_BASE}/api/mes/presales/quotations/${quotId}/customer-response`, values, { headers });
      message.success('Customer response recorded');
      setShowResponseForm(null);
      responseForm.resetFields();
      fetchQuotations();
      onReload();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to record response');
    } finally { setSubmitting(false); }
  };

  const isManager = CRM_FULL_ACCESS_ROLES.includes(user?.role);
  const canCreate = ['cse_approved', 'estimation', 'quoted', 'negotiating'].includes(inquiry.inquiry_stage);
  const stageOrder = ['sar_pending', 'qc_in_progress', 'cse_pending', 'cse_approved', 'estimation'];
  const visible = !stageOrder.slice(0, 3).includes(inquiry.inquiry_stage);

  if (!visible) return null;

  return (
    <Card
      size="small"
      title={<><DollarOutlined /> Estimation & Quotation</>}
      style={{ marginBottom: 16 }}
      extra={canCreate && !showForm && (
        <Button size="small" type="primary" onClick={() => setShowForm(true)}>
          + New Quotation
        </Button>
      )}
    >
      {/* Estimation + Quotation Form */}
      {showForm && (
        <div style={{ background: '#fafafa', padding: 16, borderRadius: 8, marginBottom: 16 }}>
          <Title level={5} style={{ margin: '0 0 12px' }}>Create Quotation</Title>
          <Form form={form} layout="vertical" onFinish={handleCreateQuotation} size="small">
            <Divider orientation="left" plain style={{ fontSize: 12 }}>Cost Estimation</Divider>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <Form.Item name="material_cost" label="Material Cost">
                <InputNumber style={{ width: '100%' }} min={0} step={0.01} onChange={handleEstimationChange} />
              </Form.Item>
              <Form.Item name="process_cost" label="Process Cost">
                <InputNumber style={{ width: '100%' }} min={0} step={0.01} onChange={handleEstimationChange} />
              </Form.Item>
              <Form.Item name="overhead_cost" label="Overhead">
                <InputNumber style={{ width: '100%' }} min={0} step={0.01} onChange={handleEstimationChange} />
              </Form.Item>
              <Form.Item name="margin_percent" label="Margin %">
                <InputNumber style={{ width: '100%' }} min={0} max={200} step={0.5} onChange={handleEstimationChange} />
              </Form.Item>
            </div>

            <Divider orientation="left" plain style={{ fontSize: 12 }}>Pricing</Divider>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <Form.Item name="quantity" label="Quantity" initialValue={1}>
                <InputNumber style={{ width: '100%' }} min={0.01} step={1} onChange={handleEstimationChange} />
              </Form.Item>
              <Form.Item name="quantity_unit" label="Unit" initialValue="KGS">
                <Select options={[
                  { value: 'KGS', label: 'KGS' }, { value: 'PCS', label: 'PCS' },
                  { value: 'ROLLS', label: 'ROLLS' }, { value: 'BAGS', label: 'BAGS' },
                  { value: 'SQMT', label: 'SQ.MT' },
                ]} />
              </Form.Item>
              <Form.Item name="unit_price" label="Unit Price">
                <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
              </Form.Item>
              <Form.Item name="total_price" label="Total Price" rules={[{ required: true, message: 'Required' }]}>
                <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
              </Form.Item>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <Form.Item name="currency" label="Currency" initialValue="AED">
                <Select options={[
                  { value: 'AED', label: 'AED' }, { value: 'USD', label: 'USD' },
                  { value: 'EUR', label: 'EUR' }, { value: 'GBP', label: 'GBP' },
                ]} />
              </Form.Item>
              <Form.Item name="valid_until" label="Valid Until">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="payment_terms" label="Payment Terms">
                <Input placeholder="e.g. NET 30" />
              </Form.Item>
            </div>

            <Form.Item name="delivery_terms" label="Delivery Terms">
              <Input placeholder="e.g. FOB Dubai" />
            </Form.Item>
            <Form.Item name="notes" label="Notes">
              <TextArea rows={2} placeholder="Additional notes..." />
            </Form.Item>

            <Space>
              <Button type="primary" htmlType="submit" loading={submitting}>Create Quotation</Button>
              <Button onClick={() => { setShowForm(false); form.resetFields(); }}>Cancel</Button>
            </Space>
          </Form>
        </div>
      )}

      {/* Existing Quotations */}
      {quotations.length === 0 && !showForm && (
        <Text type="secondary" style={{ fontSize: 12 }}>No quotations yet. Create one to start the estimation.</Text>
      )}

      {quotations.map(q => {
        const sc = STATUS_COLORS[q.status] || { color: 'default', label: q.status };
        const est = q.estimation_data || {};

        return (
          <div key={q.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Space>
                <Text strong>{q.quotation_number}</Text>
                <Tag color={sc.color}>{sc.label}</Tag>
              </Space>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {dayjs(q.created_at).format('DD MMM YYYY')}
              </Text>
            </div>

            <Descriptions column={{ xs: 1, sm: 3 }} size="small">
              {est.material_cost != null && (
                <Descriptions.Item label="Material">{Number(est.material_cost).toFixed(2)}</Descriptions.Item>
              )}
              {est.process_cost != null && (
                <Descriptions.Item label="Process">{Number(est.process_cost).toFixed(2)}</Descriptions.Item>
              )}
              {est.margin_percent != null && (
                <Descriptions.Item label="Margin">{est.margin_percent}%</Descriptions.Item>
              )}
              <Descriptions.Item label="Unit Price">
                {q.unit_price ? `${Number(q.unit_price).toFixed(2)} ${q.currency}` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Qty">
                {q.quantity ? `${q.quantity} ${q.quantity_unit}` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Total">
                <Text strong style={{ color: '#52c41a' }}>
                  {q.total_price ? `${Number(q.total_price).toFixed(2)} ${q.currency}` : '-'}
                </Text>
              </Descriptions.Item>
            </Descriptions>

            {q.valid_until && (
              <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>
                Valid until: {dayjs(q.valid_until).format('DD MMM YYYY')}
                {dayjs(q.valid_until).isBefore(dayjs()) && <Tag color="red" style={{ marginLeft: 6 }}>Expired</Tag>}
              </div>
            )}

            {/* Customer response display */}
            {q.customer_response && (
              <Alert
                type={q.customer_response === 'accepted' ? 'success' : q.customer_response === 'rejected' ? 'error' : 'warning'}
                showIcon
                style={{ marginTop: 8, fontSize: 12 }}
                message={`Customer: ${q.customer_response.replace(/_/g, ' ').toUpperCase()}`}
                description={
                  <>
                    {q.customer_notes && <div>{q.customer_notes}</div>}
                    {q.counter_offer_amount && <div>Counter offer: {q.counter_offer_amount} {q.currency}</div>}
                    {q.customer_response_at && <div style={{ fontSize: 11, color: '#8c8c8c' }}>{dayjs(q.customer_response_at).format('DD MMM YYYY HH:mm')}</div>}
                  </>
                }
              />
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {isManager && ['draft', 'pending_approval'].includes(q.status) && (
                <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => handleApprove(q.id)}>
                  Approve
                </Button>
              )}
              {['draft', 'approved'].includes(q.status) && (
                <Button size="small" icon={<SendOutlined />} onClick={() => handleSend(q.id)}>
                  Send to Customer
                </Button>
              )}
              {q.status === 'sent' && !q.customer_response && (
                <Button
                  size="small"
                  type="dashed"
                  onClick={() => setShowResponseForm(showResponseForm === q.id ? null : q.id)}
                >
                  Record Customer Response
                </Button>
              )}
            </div>

            {/* Customer response form */}
            {showResponseForm === q.id && (
              <div style={{ background: '#fafafa', padding: 12, borderRadius: 8, marginTop: 8 }}>
                <Form
                  form={responseForm}
                  layout="vertical"
                  size="small"
                  onFinish={(vals) => handleCustomerResponse(q.id, vals)}
                >
                  <Form.Item name="response" label="Customer Response" rules={[{ required: true }]}>
                    <Select options={RESPONSE_OPTIONS} placeholder="Select response..." />
                  </Form.Item>
                  <Form.Item name="counter_offer_amount" label="Counter Offer Amount (if applicable)">
                    <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
                  </Form.Item>
                  <Form.Item name="notes" label="Notes">
                    <TextArea rows={2} placeholder="Customer feedback..." />
                  </Form.Item>
                  <Space>
                    <Button type="primary" htmlType="submit" loading={submitting}>Save Response</Button>
                    <Button onClick={() => { setShowResponseForm(null); responseForm.resetFields(); }}>Cancel</Button>
                  </Space>
                </Form>
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}
