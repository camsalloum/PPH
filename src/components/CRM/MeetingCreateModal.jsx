/**
 * MeetingCreateModal — schedule a new meeting
 * Compact layout: Date+Duration on one row, smart Related To block.
 */
import { useState, useEffect } from 'react';
import { Modal, Form, Input, DatePicker, InputNumber, Select, App, Row, Col, Segmented, Typography } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';
import useCrmOptions from './useCrmOptions';

const { TextArea } = Input;
const { Text } = Typography;
const API = import.meta.env.VITE_API_URL ?? '';

export default function MeetingCreateModal({ open, defaultCustomerId, defaultProspectId, onClose, onCreated }) {
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const { customers, prospects, loading: optionsLoading } = useCrmOptions(open);
  const [relatedType, setRelatedType] = useState('none');

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ customer_id: undefined, prospect_id: undefined, related_freetext: undefined });
  }, [relatedType, form, open]);

  useEffect(() => {
    if (!open) setRelatedType('none');
  }, [open]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const token = localStorage.getItem('auth_token');

      let description = values.description || null;
      if (relatedType === 'unlisted' && values.related_freetext?.trim()) {
        const note = `Related to: ${values.related_freetext.trim()}`;
        description = description ? `${note}\n\n${description}` : note;
      }

      await axios.post(`${API}/api/crm/meetings`, {
        name: values.name,
        date_start: values.date_start ? values.date_start.toISOString() : null,
        duration_mins: values.duration_mins || 30,
        location: values.location || null,
        description,
        customer_id: relatedType === 'customer' ? (values.customer_id || defaultCustomerId || null) : (defaultCustomerId || null),
        prospect_id: relatedType === 'prospect' ? (values.prospect_id || defaultProspectId || null) : (defaultProspectId || null),
      }, { headers: { Authorization: `Bearer ${token}` } });

      message.success('Meeting scheduled');
      form.resetFields();
      setRelatedType('none');
      onCreated?.();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.error || 'Failed to create meeting');
    } finally {
      setSaving(false);
    }
  };

  const hasDefault = defaultCustomerId || defaultProspectId;

  return (
    <Modal
      title="Schedule Meeting"
      open={open}
      onOk={handleOk}
      onCancel={() => { form.resetFields(); setRelatedType('none'); onClose?.(); }}
      okText="Schedule"
      confirmLoading={saving}
      destroyOnHidden
      width={480}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}
        initialValues={{ date_start: dayjs().add(1, 'hour').startOf('hour'), duration_mins: 30 }}>

        <Form.Item name="name" label="Subject" rules={[{ required: true, message: 'Subject is required' }]}>
          <Input placeholder="e.g. Product demo with client" autoFocus />
        </Form.Item>

        {/* Date + Duration on one row */}
        <Row gutter={12}>
          <Col span={15}>
            <Form.Item name="date_start" label="Date & Time" rules={[{ required: true, message: 'Required' }]}>
              <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={9}>
            <Form.Item name="duration_mins" label="Duration (min)">
              <InputNumber min={5} max={480} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="location" label="Location">
          <Input placeholder="Office / client site / online..." />
        </Form.Item>

        {/* Smart Related To */}
        {!hasDefault && (
          <Form.Item label="Related To">
            <Segmented
              block
              options={[
                { label: 'None',        value: 'none'      },
                { label: 'Customer',    value: 'customer'  },
                { label: 'Prospect',    value: 'prospect'  },
                { label: 'Not in list', value: 'unlisted'  },
              ]}
              value={relatedType}
              onChange={setRelatedType}
              style={{ marginBottom: relatedType !== 'none' ? 8 : 0 }}
            />
            {relatedType === 'customer' && (
              <Form.Item name="customer_id" noStyle>
                <Select showSearch allowClear placeholder="Search customer..."
                  loading={optionsLoading} options={customers} style={{ width: '100%' }}
                  filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())} />
              </Form.Item>
            )}
            {relatedType === 'prospect' && (
              <Form.Item name="prospect_id" noStyle>
                <Select showSearch allowClear placeholder="Search prospect..."
                  loading={optionsLoading} options={prospects} style={{ width: '100%' }}
                  filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                  notFoundContent={<Text type="secondary" style={{ fontSize: 12, padding: '4px 0', display: 'block' }}>Not found — switch to "Not in list".</Text>} />
              </Form.Item>
            )}
            {relatedType === 'unlisted' && (
              <Form.Item name="related_freetext" noStyle rules={[{ required: true, message: 'Enter a name' }]}>
                <Input placeholder="Type company or contact name (saved in notes)" />
              </Form.Item>
            )}
          </Form.Item>
        )}

        <Form.Item name="description" label="Agenda / Notes">
          <TextArea rows={2} placeholder="Meeting agenda or preparation notes..." />
        </Form.Item>

      </Form>
    </Modal>
  );
}
