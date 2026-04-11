/**
 * DeliveryFeedbackPanel — Dispatch form, feedback capture, and read-only summary.
 *
 * Three states based on inquiry_stage:
 *   ready_dispatch → "Mark Dispatched" form (transporter, AWB, expected delivery date)
 *   delivered      → dispatch details (read-only) + feedback form + "Close Inquiry" button
 *   closed         → read-only dispatch details + feedback summary
 */
import { useState, useEffect } from 'react';
import { Card, Form, Input, DatePicker, Button, Descriptions, Rate, Radio, Alert, App } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';

const API = import.meta.env.VITE_API_URL ?? '';

export default function DeliveryFeedbackPanel({ inquiry, onReload }) {
  const [form] = Form.useForm();
  const [fbForm] = Form.useForm();
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { message } = App.useApp();

  const stage = inquiry?.inquiry_stage;
  const token = localStorage.getItem('auth_token');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (!inquiry?.id || !['delivered', 'closed'].includes(stage)) return;
    setLoading(true);
    axios.get(`${API}/api/mes/presales/orders/${inquiry.id}/feedback`, { headers })
      .then(r => setFeedback(r.data?.data || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [inquiry?.id, stage]);

  const handleDispatch = async () => {
    try {
      const vals = await form.validateFields();
      setSaving(true);
      await axios.post(`${API}/api/mes/presales/orders/${inquiry.id}/deliver`, {
        transporter_name: vals.transporter_name,
        awb_number: vals.awb_number,
        dispatch_date: dayjs().format('YYYY-MM-DD'),
        expected_delivery_date: vals.expected_delivery_date?.format('YYYY-MM-DD'),
      }, { headers });
      message.success('Marked as dispatched');
      onReload?.();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to mark dispatched');
    } finally { setSaving(false); }
  };

  const handleFeedback = async () => {
    try {
      const vals = await fbForm.validateFields();
      setSaving(true);
      await axios.post(`${API}/api/mes/presales/orders/${inquiry.id}/feedback`, {
        satisfaction_rating: vals.satisfaction_rating,
        feedback_text: vals.feedback_text,
        reorder_likelihood: vals.reorder_likelihood,
      }, { headers });
      message.success('Feedback captured');
      setFeedback(vals);
      fbForm.resetFields();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to capture feedback');
    } finally { setSaving(false); }
  };

  const handleClose = async () => {
    try {
      setSaving(true);
      await axios.post(`${API}/api/mes/presales/orders/${inquiry.id}/close`, { notes: 'Closed by rep' }, { headers });
      message.success('Inquiry closed');
      onReload?.();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to close inquiry');
    } finally { setSaving(false); }
  };

  const dispatchDetails = (
    <Descriptions column={2} size="small" style={{ marginBottom: 16 }}>
      <Descriptions.Item label="Transporter">{inquiry?.transporter_name || '—'}</Descriptions.Item>
      <Descriptions.Item label="AWB / Tracking">{inquiry?.awb_number || '—'}</Descriptions.Item>
      <Descriptions.Item label="Dispatch Date">{inquiry?.dispatch_date || '—'}</Descriptions.Item>
      <Descriptions.Item label="Expected Delivery">{inquiry?.expected_delivery_date || '—'}</Descriptions.Item>
    </Descriptions>
  );

  const feedbackSummary = feedback && (
    <Descriptions column={2} size="small" bordered>
      <Descriptions.Item label="Rating"><Rate disabled value={feedback.satisfaction_rating} /></Descriptions.Item>
      <Descriptions.Item label="Reorder Likelihood">{feedback.reorder_likelihood || '—'}</Descriptions.Item>
      <Descriptions.Item label="Feedback" span={2}>{feedback.feedback_text || '—'}</Descriptions.Item>
    </Descriptions>
  );

  // ── ready_dispatch: dispatch form ──
  if (stage === 'ready_dispatch') {
    return (
      <Card title="Mark Dispatched">
        <Form form={form} layout="vertical" onFinish={handleDispatch}>
          <Form.Item name="transporter_name" label="Transporter" rules={[{ required: true }]}>
            <Input placeholder="Transporter name" />
          </Form.Item>
          <Form.Item name="awb_number" label="AWB / Tracking Number" rules={[{ required: true }]}>
            <Input placeholder="AWB or tracking number" />
          </Form.Item>
          <Form.Item name="expected_delivery_date" label="Expected Delivery Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>Mark Dispatched</Button>
        </Form>
      </Card>
    );
  }

  // ── delivered: dispatch details + feedback form + close button ──
  if (stage === 'delivered') {
    return (
      <div>
        <Card title="Dispatch Details" size="small" style={{ marginBottom: 12 }}>{dispatchDetails}</Card>
        {feedback ? (
          <Card title="Customer Feedback" size="small" style={{ marginBottom: 12 }}>{feedbackSummary}</Card>
        ) : (
          <Card title="Capture Feedback" size="small" style={{ marginBottom: 12 }}>
            <Form form={fbForm} layout="vertical" onFinish={handleFeedback}>
              <Form.Item name="satisfaction_rating" label="Satisfaction Rating" rules={[{ required: true }]}>
                <Rate />
              </Form.Item>
              <Form.Item name="feedback_text" label="Feedback">
                <Input.TextArea rows={3} placeholder="Customer feedback" />
              </Form.Item>
              <Form.Item name="reorder_likelihood" label="Reorder Likelihood">
                <Radio.Group>
                  <Radio value="yes">Yes</Radio>
                  <Radio value="maybe">Maybe</Radio>
                  <Radio value="no">No</Radio>
                </Radio.Group>
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={saving}>Submit Feedback</Button>
            </Form>
          </Card>
        )}
        <Button type="primary" danger onClick={handleClose} loading={saving}>Close Inquiry</Button>
      </div>
    );
  }

  // ── closed: read-only dispatch + feedback ──
  if (stage === 'closed') {
    return (
      <div>
        <Card title="Dispatch Details" size="small" style={{ marginBottom: 12 }}>{dispatchDetails}</Card>
        {feedback ? (
          <Card title="Customer Feedback" size="small">{feedbackSummary}</Card>
        ) : (
          <Card size="small"><Alert type="info" message="No feedback was captured for this inquiry." /></Card>
        )}
      </div>
    );
  }

  return <Card><Alert type="info" message="Delivery panel available at ready_dispatch, delivered, or closed stage." /></Card>;
}
