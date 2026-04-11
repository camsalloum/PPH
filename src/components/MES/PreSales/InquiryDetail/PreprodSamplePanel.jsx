/**
 * PreprodSamplePanel — Pre-production sample tracking inside InquiryDetail.
 *
 * Visible when inquiry_stage >= price_accepted.
 * Shows: request sample → track status → send to customer → record approval.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Input, Form, Tag, Space, Steps, Typography, Descriptions, Alert } from 'antd';
import { ExperimentOutlined, SendOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Text } = Typography;
const { TextArea } = Input;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const STATUS_CONFIG = {
  requested:         { step: 0, color: 'blue',       label: 'Requested',         icon: '📋' },
  in_production:     { step: 1, color: 'processing',  label: 'In Production',     icon: '🏭' },
  ready:             { step: 2, color: 'cyan',        label: 'Ready',             icon: '✅' },
  sent_to_customer:  { step: 3, color: 'purple',      label: 'Sent to Customer',  icon: '📦' },
  customer_testing:  { step: 3, color: 'orange',      label: 'Customer Testing',  icon: '🔬' },
  approved:          { step: 4, color: 'green',        label: 'Approved',          icon: '✅' },
  rejected:          { step: 4, color: 'red',          label: 'Rejected',          icon: '❌' },
  revision_needed:   { step: 4, color: 'gold',         label: 'Revision Needed',   icon: '🔄' },
};

const STEP_ITEMS = [
  { title: 'Requested' },
  { title: 'In Production' },
  { title: 'Ready' },
  { title: 'Sent' },
  { title: 'Customer Response' },
];

export default function PreprodSamplePanel({ inquiry, user, message, onReload }) {
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showResponseForm, setShowResponseForm] = useState(null);
  const [form] = Form.useForm();
  const [responseForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const token = localStorage.getItem('auth_token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchSamples = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/api/mes/presales/preprod-samples`, {
        params: { inquiry_id: inquiry.id }, headers,
      });
      setSamples(res.data?.data || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [inquiry.id]);

  useEffect(() => { fetchSamples(); }, [fetchSamples]);

  const handleRequest = async (values) => {
    try {
      setSubmitting(true);
      await axios.post(`${API_BASE}/api/mes/presales/preprod-samples`, {
        inquiry_id: inquiry.id,
        ...values,
      }, { headers });
      message.success('Pre-production sample requested');
      setShowRequestForm(false);
      form.resetFields();
      fetchSamples();
      onReload();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to request sample');
    } finally { setSubmitting(false); }
  };

  const handleStatusChange = async (sampleId, status, extra = {}) => {
    try {
      await axios.patch(`${API_BASE}/api/mes/presales/preprod-samples/${sampleId}/status`, {
        status, ...extra,
      }, { headers });
      message.success(`Status → ${status.replace(/_/g, ' ')}`);
      fetchSamples();
      onReload();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to update status');
    }
  };

  const handleCustomerResponse = async (sampleId, values) => {
    try {
      setSubmitting(true);
      await axios.post(`${API_BASE}/api/mes/presales/preprod-samples/${sampleId}/customer-response`, values, { headers });
      message.success('Customer response recorded');
      setShowResponseForm(null);
      responseForm.resetFields();
      fetchSamples();
      onReload();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to record response');
    } finally { setSubmitting(false); }
  };

  // Visibility: show when stage is after quotation phase
  const stagesBefore = ['sar_pending', 'qc_in_progress', 'cse_pending', 'cse_approved', 'estimation', 'quoted', 'negotiating'];
  const visible = !stagesBefore.includes(inquiry.inquiry_stage) || samples.length > 0;
  if (!visible) return null;

  const canRequest = ['price_accepted', 'preprod_sample'].includes(inquiry.inquiry_stage);

  return (
    <Card
      size="small"
      title={<><ExperimentOutlined /> Pre-Production Samples</>}
      style={{ marginBottom: 16 }}
      extra={canRequest && !showRequestForm && (
        <Button size="small" type="primary" onClick={() => setShowRequestForm(true)}>
          + Request Sample
        </Button>
      )}
    >
      {/* Request form */}
      {showRequestForm && (
        <div style={{ background: '#fafafa', padding: 12, borderRadius: 8, marginBottom: 12 }}>
          <Form form={form} layout="vertical" size="small" onFinish={handleRequest}>
            <Form.Item name="production_notes" label="Production Notes">
              <TextArea rows={2} placeholder="Specifications, requirements for production..." />
            </Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={submitting}>Request Sample</Button>
              <Button onClick={() => { setShowRequestForm(false); form.resetFields(); }}>Cancel</Button>
            </Space>
          </Form>
        </div>
      )}

      {samples.length === 0 && !showRequestForm && (
        <Text type="secondary" style={{ fontSize: 12 }}>No pre-production samples requested yet.</Text>
      )}

      {samples.map(s => {
        const sc = STATUS_CONFIG[s.status] || { step: 0, color: 'default', label: s.status };
        const isTerminal = ['approved', 'rejected'].includes(s.status);

        return (
          <div key={s.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <Space>
                <Text strong>{s.sample_number}</Text>
                <Tag color={sc.color}>{sc.label}</Tag>
              </Space>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {dayjs(s.created_at).format('DD MMM YYYY')}
              </Text>
            </div>

            <Steps
              current={sc.step}
              size="small"
              status={s.status === 'rejected' ? 'error' : s.status === 'approved' ? 'finish' : 'process'}
              items={STEP_ITEMS}
              style={{ marginBottom: 10 }}
            />

            <Descriptions column={{ xs: 1, sm: 3 }} size="small">
              {s.tracking_number && (
                <Descriptions.Item label="Tracking">{s.tracking_number}</Descriptions.Item>
              )}
              {s.sent_at && (
                <Descriptions.Item label="Sent">{dayjs(s.sent_at).format('DD MMM YYYY')}</Descriptions.Item>
              )}
              {s.production_notes && (
                <Descriptions.Item label="Notes">{s.production_notes}</Descriptions.Item>
              )}
            </Descriptions>

            {/* Customer feedback */}
            {s.customer_feedback && (
              <Alert
                type={s.status === 'approved' ? 'success' : s.status === 'rejected' ? 'error' : 'warning'}
                showIcon
                style={{ marginTop: 8, fontSize: 12 }}
                message={`Customer feedback: ${s.customer_feedback}`}
              />
            )}

            {/* Status action buttons */}
            {!isTerminal && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {s.status === 'requested' && (
                  <Button size="small" onClick={() => handleStatusChange(s.id, 'in_production')}>
                    🏭 Start Production
                  </Button>
                )}
                {s.status === 'in_production' && (
                  <Button size="small" onClick={() => handleStatusChange(s.id, 'ready')}>
                    ✅ Mark Ready
                  </Button>
                )}
                {s.status === 'ready' && (
                  <Button size="small" icon={<SendOutlined />} onClick={() => handleStatusChange(s.id, 'sent_to_customer')}>
                    Send to Customer
                  </Button>
                )}
                {['sent_to_customer', 'customer_testing'].includes(s.status) && (
                  <Button
                    size="small" type="dashed"
                    onClick={() => setShowResponseForm(showResponseForm === s.id ? null : s.id)}
                  >
                    Record Customer Response
                  </Button>
                )}
              </div>
            )}

            {s.status === 'revision_needed' && (
              <div style={{ marginTop: 8 }}>
                <Button size="small" type="primary" onClick={() => setShowRequestForm(true)}>
                  <SyncOutlined /> Request New Sample
                </Button>
              </div>
            )}

            {/* Customer response form */}
            {showResponseForm === s.id && (
              <div style={{ background: '#fafafa', padding: 12, borderRadius: 8, marginTop: 8 }}>
                <Form
                  form={responseForm}
                  layout="vertical"
                  size="small"
                  onFinish={(vals) => handleCustomerResponse(s.id, vals)}
                >
                  <Form.Item name="response" label="Customer Response" rules={[{ required: true }]}>
                    <select
                      style={{ width: '100%', padding: '4px 8px', borderRadius: 4, border: '1px solid #d9d9d9' }}
                      onChange={e => responseForm.setFieldsValue({ response: e.target.value })}
                    >
                      <option value="">-- Select --</option>
                      <option value="approved">✅ Approved</option>
                      <option value="rejected">❌ Rejected</option>
                      <option value="revision_needed">🔄 Revision Needed</option>
                    </select>
                  </Form.Item>
                  <Form.Item name="feedback" label="Feedback">
                    <TextArea rows={2} placeholder="Customer feedback..." />
                  </Form.Item>
                  <Space>
                    <Button type="primary" htmlType="submit" loading={submitting}>Save</Button>
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
