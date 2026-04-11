/**
 * WorklistDetailDrawer — Slide-out detail panel for Tasks, Meetings, Calls, Deals.
 *
 * Features:
 *   • View all fields in a clean read-only layout
 *   • Inline status change (dropdown)
 *   • Edit description / notes / outcome inline
 *   • Priority badge (tasks), direction badge (calls), stage badge (deals)
 *   • Duration, location, attendees display (meetings)
 *   • "Go to linked record" button
 *   • Overdue / close-date warnings
 *   • Keyboard: Escape to close
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Drawer, Typography, Tag, Space, Button, Divider, Select, Input, message,
  Descriptions, Tooltip, Badge, Spin, Segmented, Steps, Popconfirm, Checkbox, DatePicker,
} from 'antd';
import {
  CheckSquareOutlined, CalendarOutlined, PhoneOutlined, FunnelPlotOutlined,
  ArrowRightOutlined, EditOutlined, SaveOutlined, CloseOutlined,
  ClockCircleOutlined, EnvironmentOutlined, UserOutlined, ExclamationCircleOutlined,
  LinkOutlined, PlusOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import { DEAL_STAGES } from './CRMDashboardUtils';
import useCrmOptions from './useCrmOptions';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;
const API = import.meta.env.VITE_API_URL ?? '';

/* ── Status / stage configs ── */
const TASK_STATUSES = [
  { value: 'open', label: 'Open', color: 'orange' },
  { value: 'completed', label: 'Completed', color: 'green' },
];
const ACTIVITY_STATUSES = [
  { value: 'planned', label: 'Planned', color: 'blue' },
  { value: 'held', label: 'Held', color: 'green' },
  { value: 'not_held', label: 'Not Held', color: 'default' },
  { value: 'canceled', label: 'Canceled', color: 'default' },
  { value: 'started', label: 'Started', color: 'cyan' },
];
const PRIORITY_MAP = {
  urgent: { color: '#ff4d4f', label: 'Urgent' },
  high:   { color: '#fa8c16', label: 'High' },
  medium: { color: '#1677ff', label: 'Medium' },
  low:    { color: '#8c8c8c', label: 'Low' },
};
const DIRECTION_MAP = {
  inbound:  { color: 'cyan', label: 'Inbound' },
  outbound: { color: 'purple', label: 'Outbound' },
};

const TYPE_ICONS = {
  tasks: <CheckSquareOutlined />,
  meetings: <CalendarOutlined />,
  calls: <PhoneOutlined />,
  deals: <FunnelPlotOutlined />,
};

const TYPE_LABELS = { tasks: 'Task', meetings: 'Meeting', calls: 'Call', deals: 'Deal' };
const LOSS_REASON_OPTIONS = [
  'Pricing',
  'Competition',
  'Requirement Mismatch',
  'No Budget',
  'Other',
];
const OUTCOME_RESULT_OPTIONS = ['Positive', 'Neutral', 'Needs Follow-up', 'No Answer'];

const WorklistDetailDrawer = ({ open, record, type, onClose, onUpdated, onNavigate }) => {
  const [saving, setSaving] = useState(false);
  const [savingOutcome, setSavingOutcome] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [currentStatus, setCurrentStatus] = useState(null);
  const [editingLink, setEditingLink] = useState(false);
  const [linkType, setLinkType] = useState('none');     // 'none' | 'customer' | 'prospect'
  const [linkValue, setLinkValue] = useState(null);     // selected id
  const [dealLossReason, setDealLossReason] = useState('');
  const [outcomeResult, setOutcomeResult] = useState('');
  const [outcomeText, setOutcomeText] = useState('');
  const [createFollowupTask, setCreateFollowupTask] = useState(false);
  const [followupTitle, setFollowupTitle] = useState('');
  const [followupDueDate, setFollowupDueDate] = useState(null);
  const [newAttendee, setNewAttendee] = useState('');
  const { customers, prospects, loading: optionsLoading } = useCrmOptions();

  /* Reset state when record changes */
  useEffect(() => {
    if (record) {
      setEditingNotes(false);
      setNotesValue(getNotesField(record, type));
      setCurrentStatus(getStatusField(record, type));
      setEditingLink(false);
      setDealLossReason(record.close_reason || '');
      const existingOutcome = type === 'calls' ? (record.outcome_note || '') : (record.description || '');
      setOutcomeText(existingOutcome);
      setOutcomeResult('');
      setCreateFollowupTask(false);
      setFollowupTitle('');
      setFollowupDueDate(null);
      setNewAttendee('');
      // Detect current link type
      if (record.customer_id)      { setLinkType('customer'); setLinkValue(record.customer_id); }
      else if (record.prospect_id) { setLinkType('prospect'); setLinkValue(record.prospect_id); }
      else                         { setLinkType('none');      setLinkValue(null); }
    }
  }, [record, type]);

  const getNotesField = (r, t) => {
    if (t === 'calls') return r?.outcome_note || r?.description || '';
    return r?.description || '';
  };

  const getStatusField = (r, t) => {
    if (t === 'deals') return r?.stage || 'interest';
    return r?.computed_status || r?.status || 'open';
  };

  /* ── PATCH status / notes ── */
  const patchRecord = useCallback(async (patchData) => {
    if (!record?.id) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };
      const endpointMap = {
        tasks: `/api/crm/tasks/${record.id}`,
        meetings: `/api/crm/meetings/${record.id}`,
        calls: `/api/crm/calls/${record.id}`,
        deals: `/api/crm/deals/${record.id}`,
      };
      await axios.patch(`${API}${endpointMap[type]}`, patchData, { headers, timeout: 10000 });
      message.success(`${TYPE_LABELS[type]} updated`);
      onUpdated?.();
    } catch (err) {
      const msg = err.response?.data?.error || 'Update failed';
      message.error(msg);
    } finally {
      setSaving(false);
    }
  }, [record, type, onUpdated]);

  const handleStatusChange = async (value) => {
    const previousStatus = getStatusField(record, type);
    setCurrentStatus(value);
    const field = type === 'deals' ? 'stage' : 'status';
    const payload = { [field]: value };

    // Deals moving to won/lost require a close reason.
    if (type === 'deals' && (value === 'won' || value === 'lost')) {
      const reason = (dealLossReason || record.close_reason || '').trim();
      if (!reason) {
        message.warning('Please select a close reason before moving to won/lost.');
        setCurrentStatus(previousStatus);
        return;
      }
      payload.close_reason = reason;
    }
    await patchRecord(payload);
  };

  const dealStagesLinear = ['interest', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
  const currentDealStageIndex = Math.max(0, dealStagesLinear.indexOf(currentStatus || record?.stage || 'interest'));

  const composeOutcomeText = () => {
    const lines = [];
    const trimmedText = (outcomeText || '').trim();
    if (outcomeResult) lines.push(`Result: ${outcomeResult}`);
    if (trimmedText) lines.push(trimmedText);
    return lines.join('\n\n').trim();
  };

  const handleSaveOutcome = async () => {
    if (!(type === 'calls' || type === 'meetings') || currentStatus !== 'held') return;

    const mergedText = composeOutcomeText();
    if (!mergedText) {
      message.warning('Please add outcome notes or choose a result.');
      return;
    }

    setSavingOutcome(true);
    try {
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };

      const endpointMap = {
        meetings: `/api/crm/meetings/${record.id}`,
        calls: `/api/crm/calls/${record.id}`,
      };

      const payload = type === 'calls'
        ? { outcome_note: mergedText }
        : { description: mergedText };

      await axios.patch(`${API}${endpointMap[type]}`, payload, { headers, timeout: 10000 });

      if (createFollowupTask) {
        const taskTitle = (followupTitle || '').trim();
        if (!taskTitle) {
          message.warning('Follow-up task title is required.');
          return;
        }
        if (!followupDueDate) {
          message.warning('Follow-up due date is required.');
          return;
        }

        await axios.post(
          `${API}/api/crm/tasks`,
          {
            title: taskTitle,
            description: `Auto follow-up from ${TYPE_LABELS[type]} #${record.id}`,
            due_date: followupDueDate.format('YYYY-MM-DD'),
            priority: 'medium',
            customer_id: record.customer_id || null,
            prospect_id: record.prospect_id || null,
          },
          { headers, timeout: 10000 }
        );
      }

      message.success(createFollowupTask ? 'Outcome saved and follow-up task created' : 'Outcome saved');
      onUpdated?.();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to save outcome';
      message.error(msg);
    } finally {
      setSavingOutcome(false);
    }
  };

  const handleSaveNotes = async () => {
    const field = type === 'calls' ? 'outcome_note' : 'description';
    await patchRecord({ [field]: notesValue });
    setEditingNotes(false);
  };

  const handleSaveLink = async () => {
    const payload = {};
    if (linkType === 'customer') {
      payload.customer_id = linkValue || null;
      payload.prospect_id = null;
    } else if (linkType === 'prospect') {
      payload.customer_id = null;
      payload.prospect_id = linkValue || null;
    } else {
      payload.customer_id = null;
      payload.prospect_id = null;
    }
    await patchRecord(payload);
    setEditingLink(false);
  };

  const handleAddAttendee = async () => {
    if (type !== 'meetings') return;

    const raw = (newAttendee || '').trim();
    if (!raw) {
      message.warning('Enter attendee name or email');
      return;
    }

    const existing = Array.isArray(record.attendees) ? record.attendees : [];
    const normalized = raw.toLowerCase();
    const exists = existing.some((att) => {
      const label = typeof att === 'string'
        ? att
        : (att?.email || att?.name || '');
      return String(label).toLowerCase() === normalized;
    });
    if (exists) {
      message.info('Attendee already exists');
      return;
    }

    const nextAttendee = raw.includes('@') ? { email: raw } : { name: raw };
    await patchRecord({ attendees: [...existing, nextAttendee] });
    setNewAttendee('');
  };

  if (!record) return null;

  const title = record.title || record.name || 'Untitled';
  const linked = record.customer_name || record.prospect_name || null;
  const hasLinkedTarget = !!(record.inquiry_id || record.inquiryId || record.customer_id || record.prospect_id);
  const createdAt = record.created_at ? dayjs(record.created_at).format('DD MMM YYYY HH:mm') : '—';

  /* ── Overdue check ── */
  const isOverdue = (() => {
    if (type === 'tasks') {
      const status = record.computed_status || record.status;
      return status === 'overdue' || (record.due_date && dayjs(record.due_date).isBefore(dayjs(), 'day') && status !== 'completed');
    }
    if (type === 'meetings' || type === 'calls') {
      const s = record.status || 'planned';
      return s === 'planned' && record.date_start && dayjs(record.date_start).isBefore(dayjs(), 'hour');
    }
    if (type === 'deals') {
      const openStages = ['interest', 'qualified', 'proposal', 'negotiation'];
      return record.expected_close_date && dayjs(record.expected_close_date).isBefore(dayjs(), 'day') && openStages.includes(record.stage);
    }
    return false;
  })();

  /* ── Status options per type ── */
  const statusOpts = type === 'tasks' ? TASK_STATUSES
    : type === 'deals' ? DEAL_STAGES.map(s => ({ value: s.value, label: s.short || s.label, color: s.color }))
    : ACTIVITY_STATUSES;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={480}
      title={
        <Space>
          {TYPE_ICONS[type]}
          <span>{TYPE_LABELS[type]} Detail</span>
        </Space>
      }
      className="wl-detail-drawer"
      destroyOnHidden
    >
      <Spin spinning={saving}>
        {/* ── Header ── */}
        <div className="wl-detail-header">
          <Title level={4} style={{ margin: 0 }} ellipsis={{ rows: 2 }}>{title}</Title>
          {isOverdue && (
            <Tag icon={<ExclamationCircleOutlined />} color="error" style={{ marginTop: 4 }}>
              {(type === 'meetings' || type === 'calls') ? 'Missed' : 'Overdue'}
            </Tag>
          )}
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* ── Status / Stage (inline change) ── */}
        <div className="wl-detail-field">
          <Text type="secondary" className="wl-detail-label">
            {type === 'deals' ? 'Stage' : 'Status'}
          </Text>
          <Select
            value={currentStatus}
            onChange={handleStatusChange}
            size="small"
            style={{ minWidth: 150 }}
            options={statusOpts.map(s => ({
              value: s.value,
              label: (
                <Space size={4}>
                  <Badge color={s.color || 'blue'} />
                  {s.label}
                </Space>
              ),
            }))}
          />
        </div>

        {type === 'deals' && (
          <>
            <div style={{ marginTop: 10 }}>
              <Text type="secondary" className="wl-detail-label">Deal Progress</Text>
              <Steps
                size="small"
                current={currentDealStageIndex}
                items={dealStagesLinear.map((s) => ({ title: s.replace('_', ' ').toUpperCase() }))}
                style={{ marginTop: 6 }}
              />
            </div>
            <div style={{ marginTop: 10 }}>
              <Text type="secondary" className="wl-detail-label">Close Reason</Text>
              <Select
                placeholder="Select reason for won/lost"
                size="small"
                style={{ width: '100%', marginTop: 6 }}
                value={dealLossReason || undefined}
                onChange={setDealLossReason}
                options={LOSS_REASON_OPTIONS.map((r) => ({ value: r, label: r }))}
              />
            </div>
            <Space wrap style={{ marginTop: 10 }}>
              {dealStagesLinear
                .filter((stage) => dealStagesLinear.indexOf(stage) > currentDealStageIndex)
                .map((stage) => (
                  <Popconfirm
                    key={stage}
                    title={`Move deal to ${stage.replace('_', ' ')}?`}
                    okText="Yes"
                    cancelText="No"
                    onConfirm={() => handleStatusChange(stage)}
                  >
                    <Button size="small">{`Move to ${stage.replace('_', ' ')}`}</Button>
                  </Popconfirm>
                ))}
            </Space>
          </>
        )}

        {/* ── Type-specific fields ── */}
        <Descriptions column={1} size="small" className="wl-detail-desc" bordered={false}>

          {/* Tasks: priority */}
          {type === 'tasks' && record.priority && (
            <Descriptions.Item label="Priority">
              <Tag color={PRIORITY_MAP[record.priority]?.color || '#8c8c8c'}>
                {PRIORITY_MAP[record.priority]?.label || record.priority}
              </Tag>
            </Descriptions.Item>
          )}

          {/* Tasks: due date */}
          {type === 'tasks' && (
            <Descriptions.Item label="Due Date">
              <Space size={4}>
                <ClockCircleOutlined />
                <span>{record.due_date ? dayjs(record.due_date).format('DD MMM YYYY') : '—'}</span>
              </Space>
            </Descriptions.Item>
          )}

          {/* Meetings / Calls: date & time */}
          {(type === 'meetings' || type === 'calls') && (
            <Descriptions.Item label="Date & Time">
              <Space size={4}>
                <CalendarOutlined />
                <span>{record.date_start ? dayjs(record.date_start).format('DD MMM YYYY HH:mm') : '—'}</span>
              </Space>
            </Descriptions.Item>
          )}

          {/* Meetings: duration */}
          {type === 'meetings' && (
            <Descriptions.Item label="Duration">
              {record.duration_mins ? `${record.duration_mins} min` : '—'}
            </Descriptions.Item>
          )}

          {/* Meetings: location */}
          {type === 'meetings' && (
            <Descriptions.Item label="Location">
              <Space size={4}>
                <EnvironmentOutlined />
                <span>{record.location || '—'}</span>
              </Space>
            </Descriptions.Item>
          )}

          {/* Calls: direction */}
          {type === 'calls' && (
            <Descriptions.Item label="Direction">
              <Tag color={DIRECTION_MAP[record.direction]?.color || 'default'}>
                {DIRECTION_MAP[record.direction]?.label || record.direction || 'Outbound'}
              </Tag>
            </Descriptions.Item>
          )}

          {/* Calls: duration */}
          {type === 'calls' && (
            <Descriptions.Item label="Duration">
              {record.duration_mins ? `${record.duration_mins} min` : '—'}
            </Descriptions.Item>
          )}

          {/* Deals: value */}
          {type === 'deals' && (
            <Descriptions.Item label="Estimated Value">
              <Text strong>
                {record.currency || 'AED'} {record.estimated_value ? Number(record.estimated_value).toLocaleString() : '—'}
              </Text>
            </Descriptions.Item>
          )}

          {/* Deals: expected close */}
          {type === 'deals' && (
            <Descriptions.Item label="Expected Close">
              <Space size={4}>
                <CalendarOutlined />
                <span style={isOverdue ? { color: '#ff4d4f', fontWeight: 600 } : undefined}>
                  {record.expected_close_date ? dayjs(record.expected_close_date).format('DD MMM YYYY') : '—'}
                </span>
              </Space>
            </Descriptions.Item>
          )}

          {/* Linked record (editable for tasks/meetings/calls) */}
          {type !== 'deals' ? (
            <Descriptions.Item label="Linked To">
              {!editingLink ? (
                <Space size={4}>
                  {linked ? (
                    <>
                      <UserOutlined />
                      <Text>{linked}</Text>
                    </>
                  ) : (
                    <Text type="secondary">Not linked</Text>
                  )}
                  <Tooltip title="Change linked customer or prospect">
                    <Button type="text" size="small" icon={<LinkOutlined />} onClick={() => setEditingLink(true)} />
                  </Tooltip>
                </Space>
              ) : (
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Segmented
                    size="small"
                    block
                    options={[
                      { label: 'None', value: 'none' },
                      { label: 'Customer', value: 'customer' },
                      { label: 'Prospect', value: 'prospect' },
                    ]}
                    value={linkType}
                    onChange={(v) => { setLinkType(v); setLinkValue(null); }}
                  />
                  {linkType === 'customer' && (
                    <Select
                      showSearch allowClear size="small"
                      placeholder="Search customer..."
                      loading={optionsLoading}
                      options={customers}
                      value={linkValue}
                      onChange={setLinkValue}
                      style={{ width: '100%' }}
                      filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                    />
                  )}
                  {linkType === 'prospect' && (
                    <Select
                      showSearch allowClear size="small"
                      placeholder="Search prospect..."
                      loading={optionsLoading}
                      options={prospects}
                      value={linkValue}
                      onChange={setLinkValue}
                      style={{ width: '100%' }}
                      filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                    />
                  )}
                  <Space size={4}>
                    <Button type="primary" size="small" icon={<SaveOutlined />} onClick={handleSaveLink}>Save</Button>
                    <Button size="small" icon={<CloseOutlined />} onClick={() => {
                      setEditingLink(false);
                      if (record.customer_id) { setLinkType('customer'); setLinkValue(record.customer_id); }
                      else if (record.prospect_id) { setLinkType('prospect'); setLinkValue(record.prospect_id); }
                      else { setLinkType('none'); setLinkValue(null); }
                    }}>Cancel</Button>
                  </Space>
                </Space>
              )}
            </Descriptions.Item>
          ) : (
            <Descriptions.Item label="Customer">
              {linked ? (
                <Space size={4}>
                  <UserOutlined />
                  <Text>{linked}</Text>
                </Space>
              ) : <Text type="secondary">—</Text>}
            </Descriptions.Item>
          )}

          {/* Meetings: attendees */}
          {type === 'meetings' && (
            <Descriptions.Item label="Attendees">
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Space size={4} wrap>
                  {(Array.isArray(record.attendees) ? record.attendees : []).length > 0 ? (
                    (record.attendees || []).map((att, i) => (
                      <Tag key={i} icon={<UserOutlined />}>{typeof att === 'string' ? att : att.name || att.email || `Attendee ${i + 1}`}</Tag>
                    ))
                  ) : (
                    <Text type="secondary">No attendees yet</Text>
                  )}
                </Space>

                <Space size={6} style={{ width: '100%' }}>
                  <Input
                    size="small"
                    value={newAttendee}
                    onChange={(e) => setNewAttendee(e.target.value)}
                    placeholder="Add attendee name or email"
                    onPressEnter={handleAddAttendee}
                  />
                  <Button size="small" icon={<PlusOutlined />} onClick={handleAddAttendee}>
                    Add Attendee
                  </Button>
                </Space>
              </Space>
            </Descriptions.Item>
          )}

          {/* Created */}
          <Descriptions.Item label="Created">
            {createdAt}
          </Descriptions.Item>

          {/* Tasks: completed at */}
          {type === 'tasks' && record.completed_at && (
            <Descriptions.Item label="Completed">
              {dayjs(record.completed_at).format('DD MMM YYYY HH:mm')}
            </Descriptions.Item>
          )}

          {/* Deals: close reason */}
          {type === 'deals' && record.close_reason && (
            <Descriptions.Item label="Close Reason">
              {record.close_reason}
            </Descriptions.Item>
          )}
        </Descriptions>

        <Divider style={{ margin: '12px 0' }} />

        {/* ── Notes / Description / Outcome (editable) ── */}
        <div className="wl-detail-notes-section">
          <div className="wl-detail-notes-header">
            <Text type="secondary" className="wl-detail-label">
              {type === 'calls' ? 'Outcome / Notes' : type === 'meetings' ? 'Agenda / Notes' : 'Notes'}
            </Text>
            {!editingNotes ? (
              <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditingNotes(true)}>
                Edit
              </Button>
            ) : (
              <Space size={4}>
                <Button type="text" size="small" icon={<SaveOutlined />} onClick={handleSaveNotes}>Save</Button>
                <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => {
                  setEditingNotes(false);
                  setNotesValue(getNotesField(record, type));
                }}>Cancel</Button>
              </Space>
            )}
          </div>
          {editingNotes ? (
            <TextArea
              rows={4}
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              placeholder={type === 'calls' ? 'Log the call outcome, key points discussed...' : type === 'meetings' ? 'Meeting agenda, key takeaways, action items...' : 'Task notes, progress update, blockers...'}
              className="wl-detail-notes-input"
            />
          ) : (
            <div className="wl-detail-notes-content">
              {notesValue ? (
                <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{notesValue}</Paragraph>
              ) : (
                <Text type="secondary" italic>No notes yet — click Edit to add.</Text>
              )}
            </div>
          )}
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {(type === 'meetings' || type === 'calls') && currentStatus === 'held' && (
          <>
            <div className="wl-detail-notes-section">
              <div className="wl-detail-notes-header">
                <Text type="secondary" className="wl-detail-label">Log Outcome</Text>
              </div>

              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Select
                  size="small"
                  placeholder="Result"
                  value={outcomeResult || undefined}
                  onChange={setOutcomeResult}
                  options={OUTCOME_RESULT_OPTIONS.map((r) => ({ value: r, label: r }))}
                  style={{ width: '100%' }}
                />

                <TextArea
                  rows={4}
                  value={outcomeText}
                  onChange={(e) => setOutcomeText(e.target.value)}
                  placeholder="Summarize the outcome and next steps"
                />

                <Checkbox
                  checked={createFollowupTask}
                  onChange={(e) => setCreateFollowupTask(e.target.checked)}
                >
                  Create follow-up task
                </Checkbox>

                {createFollowupTask && (
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Input
                      size="small"
                      value={followupTitle}
                      onChange={(e) => setFollowupTitle(e.target.value)}
                      placeholder="Follow-up task title"
                    />
                    <DatePicker
                      size="small"
                      value={followupDueDate}
                      onChange={setFollowupDueDate}
                      style={{ width: '100%' }}
                    />
                  </Space>
                )}

                <Button
                  type="primary"
                  onClick={handleSaveOutcome}
                  loading={savingOutcome}
                >
                  Save Outcome
                </Button>
              </Space>
            </div>
            <Divider style={{ margin: '12px 0' }} />
          </>
        )}

        {/* ── Actions ── */}
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          {hasLinkedTarget && (
            <Button
              type="primary"
              icon={<ArrowRightOutlined />}
              block
              onClick={() => onNavigate?.(record)}
            >
              Open Linked Record
            </Button>
          )}
          {type === 'tasks' && currentStatus !== 'completed' && (
            <Button
              type="default"
              icon={<CheckSquareOutlined />}
              block
              onClick={() => handleStatusChange('completed')}
              style={{ borderColor: '#52c41a', color: '#52c41a' }}
            >
              Mark as Completed
            </Button>
          )}
          {(type === 'meetings' || type === 'calls') && currentStatus === 'planned' && (
            <Button
              type="default"
              icon={<CheckSquareOutlined />}
              block
              onClick={() => handleStatusChange('held')}
              style={{ borderColor: '#52c41a', color: '#52c41a' }}
            >
              Mark as Held
            </Button>
          )}
        </Space>
      </Spin>
    </Drawer>
  );
};

export default WorklistDetailDrawer;
