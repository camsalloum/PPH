/**
 * CrmActivityPanel — Log and view sales activities (calls, visits, emails, meetings) per inquiry.
 * Renders in the InquiryDetail right column.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Button, Space, Badge, Typography, Tag, Timeline, Modal,
  Form, Input, Select, DatePicker, InputNumber, Empty, Popconfirm, Tooltip,
} from 'antd';
import {
  PhoneOutlined, MailOutlined, WhatsAppOutlined, TeamOutlined,
  PlusOutlined, DeleteOutlined, CalendarOutlined, ClockCircleOutlined,
  MessageOutlined, CarOutlined, VideoCameraOutlined, FileTextOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { CRM_FULL_ACCESS_ROLES } from '../../../../utils/roleConstants';
dayjs.extend(relativeTime);

const { Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const ACTIVITY_TYPES = [
  { value: 'call',     label: 'Phone Call',  icon: <PhoneOutlined />,        color: '#52c41a' },
  { value: 'visit',    label: 'Visit',       icon: <CarOutlined />,          color: '#1890ff' },
  { value: 'email',    label: 'Email',       icon: <MailOutlined />,         color: '#722ed1' },
  { value: 'meeting',  label: 'Meeting',     icon: <VideoCameraOutlined />,  color: '#fa8c16' },
  { value: 'whatsapp', label: 'WhatsApp',    icon: <WhatsAppOutlined />,     color: '#25d366' },
  { value: 'note',     label: 'Note',        icon: <FileTextOutlined />,     color: '#8c8c8c' },
];

const OUTCOME_OPTIONS = [
  { value: 'interested',        label: 'Interested' },
  { value: 'follow_up',         label: 'Follow-up Needed' },
  { value: 'not_interested',    label: 'Not Interested' },
  { value: 'sample_requested',  label: 'Sample Requested' },
  { value: 'quote_requested',   label: 'Quote Requested' },
  { value: 'no_answer',         label: 'No Answer' },
  { value: 'other',             label: 'Other' },
];

const TYPE_MAP = Object.fromEntries(ACTIVITY_TYPES.map(t => [t.value, t]));

export default function CrmActivityPanel({ inquiry, user, message, onReload }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const inquiryId = inquiry?.id;

  const loadActivities = useCallback(async () => {
    if (!inquiryId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.get(`${API_BASE}/api/mes/presales/inquiries/${inquiryId}/activities`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.success) setActivities(res.data.data || []);
    } catch (err) {
      console.error('Failed to load activities', err);
    } finally {
      setLoading(false);
    }
  }, [inquiryId]);

  useEffect(() => { loadActivities(); }, [loadActivities]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const token = localStorage.getItem('auth_token');

      const payload = {
        ...values,
        next_action_date: values.next_action_date ? values.next_action_date.format('YYYY-MM-DD') : null,
      };

      await axios.post(`${API_BASE}/api/mes/presales/inquiries/${inquiryId}/activities`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      message.success('Activity logged');
      form.resetFields();
      setModalOpen(false);
      loadActivities();
      if (onReload) onReload();
    } catch (err) {
      if (err.errorFields) return; // validation error
      message.error(err.response?.data?.error || 'Failed to log activity');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (activityId) => {
    try {
      const token = localStorage.getItem('auth_token');
      await axios.delete(`${API_BASE}/api/mes/presales/inquiries/${inquiryId}/activities/${activityId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      message.success('Activity deleted');
      loadActivities();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  return (
    <>
      <Card
        size="small"
        style={{ marginTop: 16 }}
        title={
          <Space>
            <MessageOutlined />
            CRM Activity Log
            {activities.length > 0 && <Badge count={activities.length} style={{ backgroundColor: '#1890ff' }} />}
          </Space>
        }
        extra={
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Log Activity
          </Button>
        }
      >
        {activities.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<Text type="secondary">No activities logged yet</Text>}
          >
            <Button type="dashed" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              Log Your First Activity
            </Button>
          </Empty>
        ) : (
          <Timeline
            style={{ marginTop: 12 }}
            items={activities.map(a => {
              const typeInfo = TYPE_MAP[a.activity_type] || { icon: <FileTextOutlined />, color: '#8c8c8c', label: a.activity_type };
              return {
                color: typeInfo.color,
                dot: typeInfo.icon,
                children: (
                  <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <Tag color={typeInfo.color} style={{ fontSize: 11 }}>{typeInfo.label}</Tag>
                        {a.subject && <Text strong style={{ fontSize: 12 }}>{a.subject}</Text>}
                      </div>
                      {(a.created_by === user?.id || CRM_FULL_ACCESS_ROLES.includes(user?.role)) && (
                        <Popconfirm title="Delete this activity?" onConfirm={() => handleDelete(a.id)} okText="Yes">
                          <Button type="text" danger size="small" icon={<DeleteOutlined />} style={{ padding: '0 4px' }} />
                        </Popconfirm>
                      )}
                    </div>
                    {a.description && (
                      <Text style={{ fontSize: 12, display: 'block', marginTop: 2 }}>{a.description}</Text>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                      {a.outcome && (
                        <Tag style={{ fontSize: 10 }}>
                          {OUTCOME_OPTIONS.find(o => o.value === a.outcome)?.label || a.outcome}
                        </Tag>
                      )}
                      {a.duration_minutes && (
                        <Text type="secondary" style={{ fontSize: 10 }}>
                          <ClockCircleOutlined /> {a.duration_minutes} min
                        </Text>
                      )}
                      {a.contact_name && (
                        <Text type="secondary" style={{ fontSize: 10 }}>
                          with {a.contact_name}
                        </Text>
                      )}
                    </div>
                    {a.next_action_date && (
                      <div style={{
                        marginTop: 4, padding: '2px 8px', background: '#fffbe6',
                        borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                        <CalendarOutlined style={{ fontSize: 10, color: '#faad14' }} />
                        <Text style={{ fontSize: 10, color: '#d48806' }}>
                          Follow-up: {dayjs(a.next_action_date).format('DD MMM YYYY')}
                          {a.next_action_note && ` — ${a.next_action_note}`}
                        </Text>
                      </div>
                    )}
                    <div style={{ marginTop: 2 }}>
                      <Text type="secondary" style={{ fontSize: 10 }}>
                        {a.created_by_name || 'Unknown'} · {dayjs(a.created_at).fromNow()}
                      </Text>
                    </div>
                  </div>
                ),
              };
            })}
          />
        )}
      </Card>

      {/* Log Activity Modal */}
      <Modal
        title="Log Activity"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={handleSubmit}
        confirmLoading={saving}
        okText="Save Activity"
        width={520}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" size="small" initialValues={{ activity_type: 'call' }}>
          <Form.Item
            name="activity_type"
            label="Type"
            rules={[{ required: true }]}
          >
            <Select>
              {ACTIVITY_TYPES.map(t => (
                <Option key={t.value} value={t.value}>
                  <Space>{t.icon}{t.label}</Space>
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="subject" label="Subject">
            <Input placeholder="Brief summary — e.g. 'Discussed pricing for 50kg order'" />
          </Form.Item>

          <Form.Item name="description" label="Details">
            <TextArea rows={3} placeholder="What was discussed? Key takeaways..." />
          </Form.Item>

          <Form.Item name="outcome" label="Outcome">
            <Select allowClear placeholder="What was the result?">
              {OUTCOME_OPTIONS.map(o => (
                <Option key={o.value} value={o.value}>{o.label}</Option>
              ))}
            </Select>
          </Form.Item>

          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item name="contact_name" label="Contact Person" style={{ flex: 1 }}>
              <Input placeholder="Who did you speak to?" />
            </Form.Item>
            <Form.Item name="duration_minutes" label="Duration (min)" style={{ width: 120 }}>
              <InputNumber min={1} max={480} placeholder="15" style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item name="next_action_date" label="Follow-up Date" style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} placeholder="Next action date" />
            </Form.Item>
            <Form.Item name="next_action_note" label="Follow-up Note" style={{ flex: 1 }}>
              <Input placeholder="What to do next" />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  );
}
