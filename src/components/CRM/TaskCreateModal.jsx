/**
 * TaskCreateModal — create a new task/follow-up
 * Compact no-scroll layout:
 *  • Due Date + Priority on ONE row
 *  • Smart "Related To" block replaces two separate dropdowns
 *    (Customer | Prospect | Not Listed free-text | None)
 *  • Assign To only shown for management roles
 */
import { useState, useEffect } from 'react';
import { Modal, Form, Input, DatePicker, Select, Radio, App, Row, Col, Segmented, Typography, Checkbox } from 'antd';
import axios from 'axios';
import useCrmOptions from './useCrmOptions';
import { useAuth } from '../../contexts/AuthContext';

const { TextArea } = Input;
const { Text } = Typography;
const API = import.meta.env.VITE_API_URL ?? '';

// Level 6+ can delegate tasks to other reps (Senior Manager and above)
const CAN_DELEGATE_LEVEL = 6;

export default function TaskCreateModal({ open, defaultCustomerId, defaultProspectId, onClose, onCreated }) {
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const { customers, prospects, loading: optionsLoading } = useCrmOptions(open);
  const { user } = useAuth();

  const canDelegate = user && (Number(user.designation_level) >= CAN_DELEGATE_LEVEL);
  const [reps, setReps] = useState([]);
  const [repsLoading, setRepsLoading] = useState(false);

  // Related-to type: none | customer | prospect | unlisted
  const [relatedType, setRelatedType] = useState('none');
  // Delegate toggle — level 6+ only, hidden by default
  const [delegating, setDelegating] = useState(false);

  // Fetch reps for level-6+ delegate dropdown
  useEffect(() => {
    if (!canDelegate || !open) return;
    const load = async () => {
      setRepsLoading(true);
      try {
        const token = localStorage.getItem('auth_token');
        const res = await axios.get(`${API}/api/crm/sales-reps`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 8000,
        });
        const data = res.data?.data || [];
        setReps(data.filter(r => r.user_id).map(r => ({
          value: r.user_id,
          label: r.full_name || r.email || `User ${r.user_id}`,
        })));
      } catch {
        setReps([]);
      } finally {
        setRepsLoading(false);
      }
    };
    load();
  }, [canDelegate, open]);

  // Clear sub-fields when switching related type — only while modal is open
  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ customer_id: undefined, prospect_id: undefined, related_freetext: undefined });
  }, [relatedType, form, open]);

  // Reset everything on close
  useEffect(() => {
    if (!open) { setRelatedType('none'); setDelegating(false); }
  }, [open]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const token = localStorage.getItem('auth_token');

      // "Not listed" free-text gets prepended to description
      let description = values.description || null;
      if (relatedType === 'unlisted' && values.related_freetext?.trim()) {
        const note = `Related to: ${values.related_freetext.trim()}`;
        description = description ? `${note}\n\n${description}` : note;
      }

      await axios.post(`${API}/api/crm/tasks`, {
        title: values.title,
        due_date: values.due_date ? values.due_date.format('YYYY-MM-DD') : null,
        priority: values.priority || 'medium',
        description,
        customer_id: relatedType === 'customer' ? (values.customer_id || defaultCustomerId || null) : (defaultCustomerId || null),
        prospect_id: relatedType === 'prospect' ? (values.prospect_id || defaultProspectId || null) : (defaultProspectId || null),
        assignee_id: canDelegate ? (values.assignee_id || null) : null,
      }, { headers: { Authorization: `Bearer ${token}` } });

      message.success('Task created');
      form.resetFields();
      setRelatedType('none');
      onCreated?.();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.error || 'Failed to create task');
    } finally {
      setSaving(false);
    }
  };

  const hasDefault = defaultCustomerId || defaultProspectId;

  return (
    <Modal
      title="New Task / Follow-up"
      open={open}
      onOk={handleOk}
      onCancel={() => { form.resetFields(); setRelatedType('none'); onClose?.(); }}
      okText="Create Task"
      confirmLoading={saving}
      destroyOnHidden
      width={480}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>

        {/* Title */}
        <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Title is required' }]}>
          <Input placeholder="e.g. Follow up on sample request" autoFocus />
        </Form.Item>

        {/* Due Date + Priority — same row, no wasted space */}
        <Row gutter={12}>
          <Col span={13}>
            <Form.Item name="due_date" label="Due Date" rules={[{ required: true, message: 'Required' }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={11}>
            <Form.Item name="priority" label="Priority" initialValue="medium">
              <Radio.Group buttonStyle="solid" style={{ width: '100%', display: 'flex' }}>
                <Radio.Button value="low"    style={{ flex: 1, textAlign: 'center' }}>Low</Radio.Button>
                <Radio.Button value="medium" style={{ flex: 1, textAlign: 'center' }}>Med</Radio.Button>
                <Radio.Button value="high"   style={{ flex: 1, textAlign: 'center' }}>High</Radio.Button>
              </Radio.Group>
            </Form.Item>
          </Col>
        </Row>

        {/* Delegate — level 6+ only, collapsed by default */}
        {canDelegate && (
          <Form.Item style={{ marginBottom: delegating ? 4 : 0 }}>
            <Checkbox checked={delegating} onChange={e => { setDelegating(e.target.checked); if (!e.target.checked) form.setFieldValue('assignee_id', undefined); }}>
              <Text type="secondary" style={{ fontSize: 13 }}>Assign to someone else</Text>
            </Checkbox>
          </Form.Item>
        )}
        {canDelegate && delegating && (
          <Form.Item name="assignee_id" rules={[{ required: true, message: 'Pick a rep or uncheck' }]}>
            <Select
              showSearch allowClear placeholder="Search rep to assign..."
              loading={repsLoading} options={reps}
              filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
            />
          </Form.Item>
        )}

        {/* Smart Related To — replaces two separate dropdowns */}
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
                <Select
                  showSearch allowClear placeholder="Search customer..."
                  loading={optionsLoading} options={customers} style={{ width: '100%' }}
                  filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                />
              </Form.Item>
            )}

            {relatedType === 'prospect' && (
              <Form.Item name="prospect_id" noStyle>
                <Select
                  showSearch allowClear placeholder="Search prospect..."
                  loading={optionsLoading} options={prospects} style={{ width: '100%' }}
                  filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                  notFoundContent={
                    <Text type="secondary" style={{ fontSize: 12, padding: '4px 0', display: 'block' }}>
                      Not found — switch to "Not in list" to type a name, or add a Prospect first.
                    </Text>
                  }
                />
              </Form.Item>
            )}

            {relatedType === 'unlisted' && (
              <Form.Item name="related_freetext" noStyle rules={[{ required: true, message: 'Enter a name' }]}>
                <Input placeholder="Type company or contact name (saved in task notes)" />
              </Form.Item>
            )}
          </Form.Item>
        )}

        {/* Notes */}
        <Form.Item name="description" label="Notes">
          <TextArea rows={2} placeholder="Additional details..." />
        </Form.Item>

      </Form>
    </Modal>
  );
}
