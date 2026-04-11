/**
 * CallCreateModal — log or schedule a call
 * Compact layout: Direction+Duration on one row, smart Related To block.
 */
import { useState, useEffect } from 'react';
import { Modal, Form, Input, DatePicker, InputNumber, Radio, Select, App, Row, Col, Segmented, Typography } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';
import useCrmOptions from './useCrmOptions';

const { TextArea } = Input;
const { Text } = Typography;
const API = import.meta.env.VITE_API_URL ?? '';

export default function CallCreateModal({ open, defaultCustomerId, defaultProspectId, onClose, onCreated }) {
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

      let description = values.outcome_note || null;
      if (relatedType === 'unlisted' && values.related_freetext?.trim()) {
        const note = `Related to: ${values.related_freetext.trim()}`;
        description = description ? `${note}\n\n${description}` : note;
      }

      await axios.post(`${API}/api/crm/calls`, {
        name: values.name,
        date_start: values.date_start ? values.date_start.toISOString() : null,
        duration_mins: values.duration_mins || 5,
        direction: values.direction || 'outbound',
        outcome_note: description,
        customer_id: relatedType === 'customer' ? (values.customer_id || defaultCustomerId || null) : (defaultCustomerId || null),
        prospect_id: relatedType === 'prospect' ? (values.prospect_id || defaultProspectId || null) : (defaultProspectId || null),
      }, { headers: { Authorization: `Bearer ${token}` } });

      message.success('Call logged');
      form.resetFields();
      setRelatedType('none');
      onCreated?.();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.error || 'Failed to log call');
    } finally {
      setSaving(false);
    }
  };

  const hasDefault = defaultCustomerId || defaultProspectId;

  return (
    <Modal
      title="Log Call"
      open={open}
      onOk={handleOk}
      onCancel={() => { form.resetFields(); setRelatedType('none'); onClose?.(); }}
      okText="Save Call"
      confirmLoading={saving}
      destroyOnHidden
      width={480}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}
        initialValues={{ date_start: dayjs(), duration_mins: 5, direction: 'outbound' }}>

        <Form.Item name="name" label="Subject" rules={[{ required: true, message: 'Subject is required' }]}>
          <Input placeholder="e.g. Follow-up call with Ahmed" autoFocus />
        </Form.Item>

        {/* Direction + Date on one row */}
        <Row gutter={12} align="bottom">
          <Col span={11}>
            <Form.Item name="direction" label="Direction">
              <Radio.Group buttonStyle="solid" style={{ display: 'flex' }}>
                <Radio.Button value="outbound" style={{ flex: 1, textAlign: 'center' }}>Outbound</Radio.Button>
                <Radio.Button value="inbound"  style={{ flex: 1, textAlign: 'center' }}>Inbound</Radio.Button>
              </Radio.Group>
            </Form.Item>
          </Col>
          <Col span={7}>
            <Form.Item name="date_start" label="Date & Time" rules={[{ required: true, message: 'Required' }]}>
              <DatePicker showTime format="MM-DD HH:mm" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="duration_mins" label="Duration (min)">
              <InputNumber min={1} max={480} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        {/* Smart Related To */}
        {!hasDefault && (
          <Form.Item label="Related To">
            <Segmented block
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

        <Form.Item name="outcome_note" label="Outcome / Notes">
          <TextArea rows={2} placeholder="What was discussed? Next steps?" />
        </Form.Item>

      </Form>
    </Modal>
  );
}
