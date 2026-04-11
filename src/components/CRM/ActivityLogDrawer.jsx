/**
 * ActivityLogDrawer — floating "Log Activity" button + drawer
 * Used on CRMDashboard and CustomerDetail pages.
 * Props:
 *   defaultCustomerId  — pre-select a customer (optional)
 *   defaultProspectId  — pre-select a prospect (optional)
 *   onLogged           — callback after successful log (optional)
 */
import React, { useState } from 'react';
import {
  Drawer, Button, Form, Select, Input, InputNumber,
  DatePicker, Space, Typography, App
} from 'antd';
import {
  PhoneOutlined, ShopOutlined, WhatsAppOutlined,
  MailOutlined, ClockCircleOutlined, PlusOutlined
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { useAuth } from '../../contexts/AuthContext';

const { TextArea } = Input;
const { Option } = Select;
const { Text } = Typography;

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const ACTIVITY_TYPES = [
  { value: 'call',       label: 'Phone Call',   icon: <PhoneOutlined />,       color: '#52c41a' },
  { value: 'visit',      label: 'Customer Visit', icon: <ShopOutlined />,      color: '#1890ff' },
  { value: 'whatsapp',   label: 'WhatsApp',     icon: <WhatsAppOutlined />,    color: '#25d366' },
  { value: 'email',      label: 'Email',        icon: <MailOutlined />,        color: '#722ed1' },
  { value: 'follow_up',  label: 'Follow-Up',    icon: <ClockCircleOutlined />, color: '#fa8c16' },
];

export default function ActivityLogDrawer({ defaultCustomerId, defaultProspectId, onLogged }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const { user } = useAuth();

  const handleOpen = () => {
    form.resetFields();
    if (defaultCustomerId) form.setFieldValue('customer_id', defaultCustomerId);
    if (defaultProspectId) form.setFieldValue('prospect_id', defaultProspectId);
    form.setFieldValue('activity_date', dayjs());
    setOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const token = localStorage.getItem('auth_token');
      await axios.post(`${API_BASE}/api/crm/activities`, {
        ...values,
        activity_date: values.activity_date ? values.activity_date.toISOString() : new Date().toISOString(),
      }, { headers: { Authorization: `Bearer ${token}` } });

      message.success('Activity logged');
      setOpen(false);
      if (onLogged) onLogged();
    } catch (err) {
      if (err?.errorFields) return; // form validation
      message.error(err.response?.data?.error || 'Failed to log activity');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={handleOpen}
        style={{ borderRadius: 20 }}
      >
        Log Activity
      </Button>

      <Drawer
        title="Log Activity"
        open={open}
        onClose={() => setOpen(false)}
        width={420}
        footer={
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={handleSubmit}>Save Activity</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          {/* Activity Type */}
          <Form.Item name="type" label="Activity Type" rules={[{ required: true, message: 'Select a type' }]}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ACTIVITY_TYPES.map(t => (
                <Form.Item key={t.value} noStyle shouldUpdate>
                  {({ getFieldValue, setFieldValue }) => {
                    const selected = getFieldValue('type') === t.value;
                    return (
                      <div
                        onClick={() => setFieldValue('type', t.value)}
                        style={{
                          padding: '8px 14px', borderRadius: 8, cursor: 'pointer', display: 'flex',
                          alignItems: 'center', gap: 6, border: `2px solid ${selected ? t.color : '#d9d9d9'}`,
                          background: selected ? `${t.color}15` : '#fff', transition: 'all 0.15s',
                        }}
                      >
                        <span style={{ color: t.color }}>{t.icon}</span>
                        <Text style={{ fontSize: 13, color: selected ? t.color : undefined }}>{t.label}</Text>
                      </div>
                    );
                  }}
                </Form.Item>
              ))}
            </div>
          </Form.Item>

          {/* Link to customer OR prospect */}
          <Form.Item name="customer_id" label="Customer ID" hidden={!!defaultCustomerId}>
            <InputNumber placeholder="Customer ID (if known)" style={{ width: '100%' }} min={1} />
          </Form.Item>
          <Form.Item name="prospect_id" label="Prospect ID" hidden={!!defaultProspectId}>
            <InputNumber placeholder="Prospect ID (if known)" style={{ width: '100%' }} min={1} />
          </Form.Item>

          {/* Date */}
          <Form.Item name="activity_date" label="Date & Time" rules={[{ required: true }]}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>

          {/* Duration */}
          <Form.Item name="duration_mins" label="Duration (minutes)">
            <InputNumber min={1} max={480} placeholder="e.g. 30" style={{ width: '100%' }} />
          </Form.Item>

          {/* Outcome note */}
          <Form.Item name="outcome_note" label="Outcome / Notes">
            <TextArea rows={4} placeholder="What happened? Next steps?" />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}
