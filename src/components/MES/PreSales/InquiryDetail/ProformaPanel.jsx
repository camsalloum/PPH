/**
 * ProformaPanel — Proforma Invoice + Order Confirmation + Production/Delivery tracking.
 *
 * Visible when inquiry_stage >= sample_approved (or price_accepted if skipping samples).
 * Handles: PI creation → send → PO confirmation → production → dispatch → delivery → close.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Input, InputNumber, Form, Tag, Space, Steps, Typography, Descriptions, DatePicker, Alert, Divider } from 'antd';
import { FileTextOutlined, SendOutlined, CheckCircleOutlined, CarOutlined, ShopOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Text, Title } = Typography;
const { TextArea } = Input;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const PI_STATUS = {
  draft:      { color: 'blue',    label: 'Draft' },
  sent:       { color: 'cyan',    label: 'Sent' },
  confirmed:  { color: 'green',   label: 'Confirmed' },
  cancelled:  { color: 'default', label: 'Cancelled' },
};

// Order lifecycle steps (after PI confirmed)
const ORDER_STAGES = ['order_confirmed', 'in_production', 'ready_dispatch', 'delivered', 'closed'];
const ORDER_STEPS = [
  { title: 'Order Confirmed', icon: '📥' },
  { title: 'In Production', icon: '⚙️' },
  { title: 'Ready to Dispatch', icon: '📤' },
  { title: 'Delivered', icon: '🚚' },
  { title: 'Closed', icon: '🔒' },
];

export default function ProformaPanel({ inquiry, user, message, onReload }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPIForm, setShowPIForm] = useState(false);
  const [showConfirmForm, setShowConfirmForm] = useState(null);
  const [showDeliverForm, setShowDeliverForm] = useState(false);
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [form] = Form.useForm();
  const [confirmForm] = Form.useForm();
  const [deliverForm] = Form.useForm();
  const [closeForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const token = localStorage.getItem('auth_token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/api/mes/presales/proforma-invoices`, {
        params: { inquiry_id: inquiry.id }, headers,
      });
      setInvoices(res.data?.data || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [inquiry.id]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const handleCreatePI = async (values) => {
    try {
      setSubmitting(true);
      await axios.post(`${API_BASE}/api/mes/presales/proforma-invoices`, {
        inquiry_id: inquiry.id,
        ...values,
      }, { headers });
      message.success('Proforma Invoice created');
      setShowPIForm(false);
      form.resetFields();
      fetchInvoices();
      onReload();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to create PI');
    } finally { setSubmitting(false); }
  };

  const handleSendPI = async (piId) => {
    try {
      await axios.post(`${API_BASE}/api/mes/presales/proforma-invoices/${piId}/send`, {}, { headers });
      message.success('PI sent to customer');
      fetchInvoices();
      onReload();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to send PI');
    }
  };

  const handleConfirmPI = async (piId, values) => {
    try {
      setSubmitting(true);
      await axios.post(`${API_BASE}/api/mes/presales/proforma-invoices/${piId}/confirm`, values, { headers });
      message.success('Order confirmed!');
      setShowConfirmForm(null);
      confirmForm.resetFields();
      fetchInvoices();
      onReload();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to confirm');
    } finally { setSubmitting(false); }
  };

  // Order lifecycle stage actions
  const handleOrderAction = async (action, actionForm, bodyValues = {}) => {
    try {
      setSubmitting(true);
      await axios.post(
        `${API_BASE}/api/mes/presales/orders/${inquiry.id}/${action}`,
        bodyValues, { headers }
      );
      message.success(`Action completed: ${action.replace(/-/g, ' ')}`);
      if (actionForm) actionForm.resetFields();
      setShowDeliverForm(false);
      setShowCloseForm(false);
      onReload();
    } catch (err) {
      message.error(err?.response?.data?.error || `Failed: ${action}`);
    } finally { setSubmitting(false); }
  };

  // Visibility
  const stagesBefore = ['sar_pending', 'qc_in_progress', 'cse_pending', 'cse_approved', 'estimation', 'quoted', 'negotiating'];
  const visible = !stagesBefore.includes(inquiry.inquiry_stage) || invoices.length > 0;
  if (!visible) return null;

  const canCreatePI = ['sample_approved', 'price_accepted', 'pi_sent'].includes(inquiry.inquiry_stage);
  const orderStageIdx = ORDER_STAGES.indexOf(inquiry.inquiry_stage);
  const showOrderTracker = orderStageIdx >= 0;

  return (
    <Card
      size="small"
      title={<><FileTextOutlined /> Proforma Invoice & Orders</>}
      style={{ marginBottom: 16 }}
      extra={canCreatePI && !showPIForm && (
        <Button size="small" type="primary" onClick={() => setShowPIForm(true)}>
          + New PI
        </Button>
      )}
    >
      {/* PI Creation Form */}
      {showPIForm && (
        <div style={{ background: '#fafafa', padding: 12, borderRadius: 8, marginBottom: 12 }}>
          <Title level={5} style={{ margin: '0 0 12px' }}>Create Proforma Invoice</Title>
          <Form form={form} layout="vertical" size="small" onFinish={handleCreatePI}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Required' }]}>
                <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
              </Form.Item>
              <Form.Item name="currency" label="Currency" initialValue="AED">
                <Input />
              </Form.Item>
              <Form.Item name="payment_terms" label="Payment Terms">
                <Input placeholder="e.g. 50% advance, 50% on delivery" />
              </Form.Item>
            </div>
            <Form.Item name="notes" label="Notes">
              <TextArea rows={2} placeholder="PI terms, conditions..." />
            </Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={submitting}>Create PI</Button>
              <Button onClick={() => { setShowPIForm(false); form.resetFields(); }}>Cancel</Button>
            </Space>
          </Form>
        </div>
      )}

      {/* Existing PIs */}
      {invoices.map(pi => {
        const sc = PI_STATUS[pi.status] || { color: 'default', label: pi.status };

        return (
          <div key={pi.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <Space>
                <Text strong>{pi.pi_number}</Text>
                <Tag color={sc.color}>{sc.label}</Tag>
              </Space>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {dayjs(pi.created_at).format('DD MMM YYYY')}
              </Text>
            </div>

            <Descriptions column={{ xs: 1, sm: 3 }} size="small">
              <Descriptions.Item label="Amount">
                <Text strong>{pi.amount ? `${Number(pi.amount).toFixed(2)} ${pi.currency}` : '-'}</Text>
              </Descriptions.Item>
              {pi.payment_terms && (
                <Descriptions.Item label="Terms">{pi.payment_terms}</Descriptions.Item>
              )}
              {pi.customer_po_number && (
                <Descriptions.Item label="Customer PO">
                  <Tag color="green">{pi.customer_po_number}</Tag>
                </Descriptions.Item>
              )}
              {pi.sent_at && (
                <Descriptions.Item label="Sent">{dayjs(pi.sent_at).format('DD MMM YYYY')}</Descriptions.Item>
              )}
              {pi.confirmed_at && (
                <Descriptions.Item label="Confirmed">{dayjs(pi.confirmed_at).format('DD MMM YYYY')}</Descriptions.Item>
              )}
            </Descriptions>

            {/* PI Actions */}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {pi.status === 'draft' && (
                <Button size="small" icon={<SendOutlined />} onClick={() => handleSendPI(pi.id)}>
                  Send to Customer
                </Button>
              )}
              {pi.status === 'sent' && (
                <Button
                  size="small" type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() => setShowConfirmForm(showConfirmForm === pi.id ? null : pi.id)}
                >
                  Confirm Order (PO Received)
                </Button>
              )}
            </div>

            {/* PO Confirmation form */}
            {showConfirmForm === pi.id && (
              <div style={{ background: '#fafafa', padding: 12, borderRadius: 8, marginTop: 8 }}>
                <Form form={confirmForm} layout="vertical" size="small" onFinish={(vals) => handleConfirmPI(pi.id, vals)}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <Form.Item name="customer_po_number" label="Customer PO Number">
                      <Input placeholder="PO-12345" />
                    </Form.Item>
                    <Form.Item name="customer_po_date" label="PO Date">
                      <DatePicker style={{ width: '100%' }} />
                    </Form.Item>
                  </div>
                  <Space>
                    <Button type="primary" htmlType="submit" loading={submitting}>Confirm Order</Button>
                    <Button onClick={() => { setShowConfirmForm(null); confirmForm.resetFields(); }}>Cancel</Button>
                  </Space>
                </Form>
              </div>
            )}
          </div>
        );
      })}

      {invoices.length === 0 && !showPIForm && (
        <Text type="secondary" style={{ fontSize: 12 }}>No proforma invoices yet.</Text>
      )}

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* ORDER LIFECYCLE TRACKER — shows after order_confirmed                */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {showOrderTracker && (
        <>
          <Divider style={{ margin: '16px 0 12px' }}>
            <Text strong style={{ fontSize: 13 }}>📦 Order Lifecycle</Text>
          </Divider>

          <Steps
            current={orderStageIdx}
            size="small"
            status={inquiry.inquiry_stage === 'closed' ? 'finish' : 'process'}
            items={ORDER_STEPS.map((step, i) => ({
              ...step,
              title: `${step.icon} ${step.title}`,
              status: orderStageIdx > i ? 'finish'
                : orderStageIdx === i ? 'process'
                : 'wait',
            }))}
            style={{ marginBottom: 16 }}
          />

          {/* Stage action buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {inquiry.inquiry_stage === 'order_confirmed' && (
              <Button
                type="primary" size="small"
                icon={<ShopOutlined />}
                onClick={() => handleOrderAction('start-production')}
                loading={submitting}
              >
                ⚙️ Start Production
              </Button>
            )}

            {inquiry.inquiry_stage === 'in_production' && (
              <Button
                type="primary" size="small"
                onClick={() => handleOrderAction('ready-dispatch')}
                loading={submitting}
              >
                📤 Ready for Dispatch
              </Button>
            )}

            {inquiry.inquiry_stage === 'ready_dispatch' && (
              <>
                <Button
                  type="primary" size="small"
                  icon={<CarOutlined />}
                  onClick={() => setShowDeliverForm(!showDeliverForm)}
                >
                  🚚 Mark Delivered
                </Button>
                {showDeliverForm && (
                  <div style={{ width: '100%', background: '#fafafa', padding: 12, borderRadius: 8, marginTop: 8 }}>
                    <Form form={deliverForm} layout="vertical" size="small"
                      onFinish={(vals) => handleOrderAction('deliver', deliverForm, {
                        ...vals,
                        delivery_date: vals.delivery_date ? vals.delivery_date.format('YYYY-MM-DD') : null,
                      })}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <Form.Item name="tracking_number" label="Tracking / AWB Number">
                          <Input placeholder="AWB-12345678" />
                        </Form.Item>
                        <Form.Item name="delivery_date" label="Delivery Date">
                          <DatePicker style={{ width: '100%' }} />
                        </Form.Item>
                      </div>
                      <Form.Item name="notes" label="Notes">
                        <TextArea rows={2} placeholder="Delivery details..." />
                      </Form.Item>
                      <Space>
                        <Button type="primary" htmlType="submit" loading={submitting}>Confirm Delivery</Button>
                        <Button onClick={() => setShowDeliverForm(false)}>Cancel</Button>
                      </Space>
                    </Form>
                  </div>
                )}
              </>
            )}

            {inquiry.inquiry_stage === 'delivered' && (
              <>
                <Button
                  type="primary" size="small"
                  onClick={() => setShowCloseForm(!showCloseForm)}
                >
                  🔒 Close Inquiry
                </Button>
                {showCloseForm && (
                  <div style={{ width: '100%', background: '#fafafa', padding: 12, borderRadius: 8, marginTop: 8 }}>
                    <Form form={closeForm} layout="vertical" size="small"
                      onFinish={(vals) => handleOrderAction('close', closeForm, vals)}
                    >
                      <Form.Item name="feedback" label="Customer Feedback (optional)">
                        <TextArea rows={2} placeholder="Post-delivery feedback..." />
                      </Form.Item>
                      <Form.Item name="notes" label="Closing Notes">
                        <TextArea rows={2} placeholder="Any final notes..." />
                      </Form.Item>
                      <Space>
                        <Button type="primary" htmlType="submit" loading={submitting}>Close</Button>
                        <Button onClick={() => setShowCloseForm(false)}>Cancel</Button>
                      </Space>
                    </Form>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
