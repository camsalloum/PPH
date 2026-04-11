import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Badge, Button, Card, Col, DatePicker, Divider, Empty, Form, Grid, Input, Modal, Popconfirm, Progress, Row, Select, Space, Spin, Tag, Typography, Upload } from 'antd';
import { ArrowDownOutlined, ArrowLeftOutlined, ArrowUpOutlined, CheckCircleOutlined, DeleteOutlined, EditOutlined, EnvironmentOutlined, FileTextOutlined, NodeIndexOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import { API_BASE, getAuthHeaders } from './fieldVisitUtils';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const DONE_STATUSES = ['visited', 'no_show', 'postponed', 'cancelled'];

const VISIT_RESULT_OPTIONS = [
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'needs_follow_up', label: 'Needs Follow-up' },
  { value: 'no_answer', label: 'No Answer' },
];

const NO_SHOW_REASON_OPTIONS = [
  { value: 'contact_unreachable', label: 'Contact Unreachable' },
  { value: 'customer_unavailable', label: 'Customer Unavailable' },
  { value: 'closed_office', label: 'Office Closed' },
  { value: 'other', label: 'Other' },
];

const POSTPONE_REASON_OPTIONS = [
  { value: 'customer_requested', label: 'Customer Requested' },
  { value: 'rep_schedule_conflict', label: 'Rep Schedule Conflict' },
  { value: 'travel_delay', label: 'Travel Delay' },
  { value: 'other', label: 'Other' },
];

const OUTCOME_OPTIONS = [
  { value: 'visited', label: 'Visited' },
  { value: 'no_show', label: 'No Show' },
  { value: 'postponed', label: 'Postponed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const FOLLOW_UP_OPTIONS = [
  { value: false, label: 'No' },
  { value: true, label: 'Yes' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const getStopName = (stop) => stop.customer_name || stop.prospect_name || stop.address_snapshot || `Stop ${stop.stop_order}`;

const normalizeStatus = (v) => String(v || 'planned').toLowerCase();

const toDateKey = (value) => {
  if (!value) return null;
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : null;
};

const FieldVisitInTrip = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trip, setTrip] = useState(null);
  const [activeStop, setActiveStop] = useState(null);
  const [savingArrival, setSavingArrival] = useState(false);
  const [dayView, setDayView] = useState('today');
  const [form] = Form.useForm();
  const [addStopForm] = Form.useForm();
  const [fileList, setFileList] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [prospects, setProspects] = useState([]);
  const [showAddStopModal, setShowAddStopModal] = useState(false);
  const [addingStop, setAddingStop] = useState(false);
  const [reorderingStopId, setReorderingStopId] = useState(null);
  const [notesDrafts, setNotesDrafts] = useState({});

  const loadTrip = useCallback(async () => {
    const headers = getAuthHeaders();

    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_BASE}/api/crm/field-trips/${id}`, { headers });
      setTrip(res.data?.data || null);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load in-trip data.');
      setTrip(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadTrip();
  }, [loadTrip]);

  useEffect(() => {
    const headers = getAuthHeaders();
    const loadLookups = async () => {
      try {
        const [custRes, prospRes] = await Promise.all([
          axios.get(`${API_BASE}/api/crm/my-customers`, { headers }),
          axios.get(`${API_BASE}/api/crm/my-prospects`, { headers }),
        ]);
        const customerRows = Array.isArray(custRes.data?.data) ? custRes.data.data : (Array.isArray(custRes.data?.customers) ? custRes.data.customers : []);
        const prospectRows = Array.isArray(prospRes.data?.data?.prospects) ? prospRes.data.data.prospects : (Array.isArray(prospRes.data?.data) ? prospRes.data.data : []);
        setCustomers(customerRows);
        setProspects(prospectRows);
      } catch {
        setCustomers([]);
        setProspects([]);
      }
    };
    loadLookups();
  }, []);

  const sortedStops = useMemo(() => {
    if (!Array.isArray(trip?.stops)) return [];
    return [...trip.stops].sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0));
  }, [trip]);

  const todayStops = useMemo(() => {
    if (!sortedStops.length) return [];
    const todayKey = dayjs().format('YYYY-MM-DD');
    return sortedStops.filter((s) => {
      if (!s.visit_date) return true;
      return toDateKey(s.visit_date) === todayKey;
    });
  }, [sortedStops]);

  const dayOptions = useMemo(() => {
    const dates = [...new Set(sortedStops.map((s) => toDateKey(s.visit_date)).filter(Boolean))]
      .sort((a, b) => dayjs(a).valueOf() - dayjs(b).valueOf());
    return [
      { value: 'today', label: 'Today' },
      { value: 'pending', label: 'Pending' },
      { value: 'all', label: 'All' },
      ...dates.map((d) => ({ value: `date:${d}`, label: dayjs(d).format('DD MMM') })),
    ];
  }, [sortedStops]);

  const visibleStops = useMemo(() => {
    if (dayView === 'all') return sortedStops;
    if (dayView === 'pending') return sortedStops.filter((s) => !DONE_STATUSES.includes(normalizeStatus(s.outcome_status)));
    if (dayView.startsWith('date:')) {
      const selectedDate = dayView.replace('date:', '');
      return sortedStops.filter((s) => toDateKey(s.visit_date) === selectedDate);
    }
    if (todayStops.length > 0) return todayStops;
    return sortedStops.filter((s) => !DONE_STATUSES.includes(normalizeStatus(s.outcome_status)));
  }, [todayStops, sortedStops, dayView]);

  const progress = useMemo(() => {
    const base = {
      total: sortedStops.length,
      visited: 0,
      no_show: 0,
      postponed: 0,
      cancelled: 0,
      pending: 0,
    };
    sortedStops.forEach((s) => {
      const st = normalizeStatus(s.outcome_status);
      if (Object.prototype.hasOwnProperty.call(base, st)) base[st] += 1;
      else base.pending += 1;
    });
    base.pending = Math.max(
      0,
      base.total - base.visited - base.no_show - base.postponed - base.cancelled
    );
    return base;
  }, [sortedStops]);

  const nextPlannedStop = useMemo(
    () => visibleStops.find((s) => !DONE_STATUSES.includes(normalizeStatus(s.outcome_status))) || null,
    [visibleStops]
  );

  useEffect(() => {
    const drafts = {};
    sortedStops.forEach((s) => {
      drafts[s.id] = s.outcome_notes || '';
    });
    setNotesDrafts(drafts);
  }, [trip?.id, sortedStops]);

  const saveStopNotes = async (stopId, notes) => {
    const headers = getAuthHeaders();
    try {
      await axios.patch(`${API_BASE}/api/crm/field-trips/${id}/stops/${stopId}`, { outcome_notes: notes || null }, { headers });
      setTrip((prev) => {
        if (!prev?.stops) return prev;
        return {
          ...prev,
          stops: prev.stops.map((s) => (s.id === stopId ? { ...s, outcome_notes: notes || null } : s)),
        };
      });
    } catch {
      message.error('Failed to save stop notes');
    }
  };

  const submitAddStop = async () => {
    const headers = getAuthHeaders();
    const vals = await addStopForm.validateFields();

    const payload = {
      stop_type: vals.stop_type,
      customer_id: vals.stop_type === 'customer' ? vals.customer_id : null,
      prospect_id: vals.stop_type === 'prospect' ? vals.prospect_id : null,
      address_snapshot: vals.stop_type === 'location' ? (vals.address_snapshot || null) : null,
      visit_date: vals.visit_date ? dayjs(vals.visit_date).format('YYYY-MM-DD') : null,
      visit_time: vals.visit_time || null,
      duration_mins: Number(vals.duration_mins || 60),
      objectives: vals.objectives || null,
    };

    const selectedCustomer = vals.stop_type === 'customer'
      ? customers.find((c) => Number(c.customer_id || c.id) === Number(vals.customer_id))
      : null;
    const selectedProspect = vals.stop_type === 'prospect'
      ? prospects.find((p) => Number(p.id) === Number(vals.prospect_id))
      : null;

    if (selectedCustomer) {
      payload.latitude = selectedCustomer.latitude || null;
      payload.longitude = selectedCustomer.longitude || null;
      payload.address_snapshot = payload.address_snapshot || [selectedCustomer.city, selectedCustomer.primary_country || selectedCustomer.country].filter(Boolean).join(', ');
    }
    if (selectedProspect) {
      payload.latitude = selectedProspect.latitude || null;
      payload.longitude = selectedProspect.longitude || null;
      payload.address_snapshot = payload.address_snapshot || [selectedProspect.city, selectedProspect.country].filter(Boolean).join(', ');
    }

    setAddingStop(true);
    try {
      await axios.post(`${API_BASE}/api/crm/field-trips/${id}/stops`, payload, { headers });
      message.success('Stop added to trip');
      setShowAddStopModal(false);
      addStopForm.resetFields();
      loadTrip();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to add stop');
    } finally {
      setAddingStop(false);
    }
  };

  const reorderStop = async (stop, direction) => {
    const currentIdx = sortedStops.findIndex((s) => s.id === stop.id);
    if (currentIdx < 0) return;
    const targetIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
    if (targetIdx < 0 || targetIdx >= sortedStops.length) return;

    const reordered = [...sortedStops];
    const [moved] = reordered.splice(currentIdx, 1);
    reordered.splice(targetIdx, 0, moved);

    const headers = getAuthHeaders();
    const items = reordered.map((s, idx) => ({ id: s.id, stop_order: idx + 1 }));

    setReorderingStopId(stop.id);
    try {
      await axios.put(`${API_BASE}/api/crm/field-trips/${id}/stops/reorder`, { items }, { headers });
      await loadTrip();
      message.success('Stop order updated');
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to reorder stops');
    } finally {
      setReorderingStopId(null);
    }
  };

  const deleteStop = async (stopId) => {
    const headers = getAuthHeaders();
    try {
      await axios.delete(`${API_BASE}/api/crm/field-trips/${id}/stops/${stopId}`, { headers });
      await loadTrip();
      message.success('Stop removed');
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to remove stop');
    }
  };

  const openMap = (stop) => {
    if (stop?.latitude && stop?.longitude) {
      window.open(`https://www.google.com/maps?q=${stop.latitude},${stop.longitude}`, '_blank', 'noopener');
      return;
    }
    if (stop?.address_snapshot) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.address_snapshot)}`, '_blank', 'noopener');
      return;
    }
    message.info('No coordinates or address available for this stop.');
  };

  const markArrived = async (stop) => {
    // Validate that stop's visit_date is today or past (future dates are blocked)
    const scheduledDateKey = toDateKey(stop?.visit_date);
    if (scheduledDateKey) {
      const todayKey = dayjs().format('YYYY-MM-DD');
      if (scheduledDateKey > todayKey) {
        message.warning(`This stop is scheduled for ${scheduledDateKey}. Check-in is only allowed on or after the visit date.`);
        return;
      }
    }
    const headers = getAuthHeaders();
    setSavingArrival(true);
    try {
      // GPS check-in
      const pos = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
      });
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      await axios.post(
        `${API_BASE}/api/crm/field-trips/${id}/stops/${stop.id}/check-in`,
        { lat, lng, accuracy_m: accuracy },
        { headers }
      );
      message.success(`GPS check-in saved for Stop #${stop.stop_order}`);
      loadTrip();
      // Auto-open outcome modal after check-in
      setActiveStop(stop);
      form.setFieldsValue({ outcome_status: 'visited', followUp: false, visit_result: 'positive', no_show_reason: undefined, postpone_reason: undefined });
    } catch (err) {
      if (err?.code === 1) message.warning('Location permission denied. Falling back to manual arrival.');
      else if (err?.code === 2 || err?.code === 3) message.warning('Unable to get location. Saving time only.');
      // fallback: patch arrival_at
      try {
        await axios.patch(
          `${API_BASE}/api/crm/field-trips/${id}/stops/${stop.id}`,
          { arrival_at: dayjs().toISOString() },
          { headers }
        );
        message.success(`Arrival time saved for Stop #${stop.stop_order}`);
        loadTrip();
        setActiveStop(stop);
        form.setFieldsValue({ outcome_status: 'visited', followUp: false, visit_result: 'positive', no_show_reason: undefined, postpone_reason: undefined });
      } catch (innerErr) {
        message.error(innerErr?.response?.data?.error || 'Failed to save arrival time');
      }
    } finally {
      setSavingArrival(false);
    }
  };

  const submitOutcome = async () => {
    if (!activeStop) return;
    const headers = getAuthHeaders();
    const values = await form.validateFields();
    const extras = [];
    if (values.outcome_status === 'visited' && values.visit_result) {
      const visitResultLabel = VISIT_RESULT_OPTIONS.find((o) => o.value === values.visit_result)?.label || values.visit_result;
      extras.push(`Result: ${visitResultLabel}`);
    }
    if (values.outcome_status === 'no_show' && values.no_show_reason) {
      const reasonLabel = NO_SHOW_REASON_OPTIONS.find((o) => o.value === values.no_show_reason)?.label || values.no_show_reason;
      extras.push(`No-Show Reason: ${reasonLabel}`);
    }
    if (values.outcome_status === 'postponed' && values.postpone_reason) {
      const reasonLabel = POSTPONE_REASON_OPTIONS.find((o) => o.value === values.postpone_reason)?.label || values.postpone_reason;
      extras.push(`Postpone Reason: ${reasonLabel}`);
    }
    const enrichedNotes = [extras.join(' | '), values.outcome_notes].filter(Boolean).join(' | ');

    try {
      // Save enhanced stop fields first
      const stopPatch = {
        visit_notes: values.outcome_status === 'visited' ? (values.meeting_brief || null) : null,
        products_discussed: values.products_discussed || null,
        competitor_info: values.competitor_info || null,
        next_action: values.next_action || null,
        visit_result: values.visit_result || null,
      };
      await axios.patch(
        `${API_BASE}/api/crm/field-trips/${id}/stops/${activeStop.id}`,
        stopPatch,
        { headers }
      );

      if (values.outcome_status === 'visited') {
        await axios.post(
          `${API_BASE}/api/crm/field-trips/${id}/stops/${activeStop.id}/complete`,
          {
            outcome_status: 'visited',
            outcome_notes: enrichedNotes || values.outcome_notes || values.meeting_brief || null,
            follow_up_task: values.followUp
              ? {
                  title: values.followup_title,
                  due_date: values.followup_due ? dayjs(values.followup_due).format('YYYY-MM-DD') : null,
                  priority: values.followup_priority || 'medium',
                }
              : null,
          },
          { headers }
        );
      } else {
        await axios.patch(
          `${API_BASE}/api/crm/field-trips/${id}/stops/${activeStop.id}`,
          {
            outcome_status: values.outcome_status,
            outcome_notes: enrichedNotes || values.outcome_notes || values.meeting_brief || null,
          },
          { headers }
        );
      }

      message.success('Stop outcome saved');

      // Upload attachments
      if (fileList.length > 0) {
        for (const f of fileList) {
          const fd = new FormData();
          fd.append('file', f.originFileObj);
          try {
            await axios.post(
              `${API_BASE}/api/crm/field-trips/${id}/stops/${activeStop.id}/attachments`,
              fd,
              { headers: { ...headers, 'Content-Type': 'multipart/form-data' } }
            );
          } catch { /* silently skip failed uploads */ }
        }
      }

      setActiveStop(null);
      form.resetFields();
      setFileList([]);
      loadTrip();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to save outcome');
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /></div>;

  if (!trip) {
    return <Alert type="error" showIcon message="Unable to open In-Trip mode" description={error || 'Trip not found.'} />;
  }

  return (
    <div>
      <Card style={{ marginBottom: 12 }}>
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/crm/visits/${id}`)}>Back to Trip</Button>
            <Tag color="gold">In-Trip Mode</Tag>
          </Space>
          <Title level={4} style={{ margin: 0 }}>{trip.title}</Title>
          <Text type="secondary">Today {dayjs().format('ddd, DD MMM YYYY')} | {todayStops.length} stop(s) scheduled</Text>
          <Space wrap>
            <Tag color="blue">Total: {progress.total}</Tag>
            <Tag color="green">Visited: {progress.visited}</Tag>
            <Tag color="orange">Postponed: {progress.postponed}</Tag>
            <Tag color="red">No Show: {progress.no_show}</Tag>
            <Tag color="default">Pending: {progress.pending}</Tag>
          </Space>
          <Space wrap>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowAddStopModal(true)}>
              Add Stop
            </Button>
            <Button icon={<NodeIndexOutlined />} onClick={() => navigate(`/crm/visits/${id}/route`)}>
              Open Route
            </Button>
            <Button onClick={() => navigate(`/crm/visits/${id}/report`)}>
              Trip Report
            </Button>
            <Button icon={<FileTextOutlined />} onClick={() => navigate(`/crm/visits/${id}/travel-report`)}>
              Travel Report
            </Button>
          </Space>
        </Space>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Space size={8}>
          <Text type="secondary" style={{ fontSize: 12 }}>View:</Text>
          <Select size="small" value={dayView} onChange={setDayView} options={dayOptions} style={{ minWidth: 160 }} />
        </Space>
      </div>

      {visibleStops.length === 0 ? (
        <Card>
          <Empty description="No pending stops for execution" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          {nextPlannedStop ? (
            <Card size="small" style={{ borderColor: '#91caff' }}>
              <Space direction="vertical" size={4}>
                <Text type="secondary">Next planned stop</Text>
                <Text strong>#{nextPlannedStop.stop_order} {getStopName(nextPlannedStop)}</Text>
              </Space>
            </Card>
          ) : null}

          {visibleStops.map((stop) => {
            const name = getStopName(stop);
            const absoluteIndex = sortedStops.findIndex((s) => s.id === stop.id);
            return (
              <Card key={stop.id} styles={{ body: { padding: 14 } }}>
                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                    <Space>
                      <EnvironmentOutlined style={{ color: '#1677ff' }} />
                      <Text strong>#{stop.stop_order} {name}</Text>
                    </Space>
                    <Space size={6}>
                      <Tag>{stop.outcome_status || 'planned'}</Tag>
                      <Button
                        size="small"
                        icon={<ArrowUpOutlined />}
                        loading={reorderingStopId === stop.id}
                        disabled={absoluteIndex <= 0}
                        onClick={() => reorderStop(stop, 'up')}
                      />
                      <Button
                        size="small"
                        icon={<ArrowDownOutlined />}
                        loading={reorderingStopId === stop.id}
                        disabled={absoluteIndex === -1 || absoluteIndex >= sortedStops.length - 1}
                        onClick={() => reorderStop(stop, 'down')}
                      />
                      <Popconfirm title="Remove this stop from trip?" onConfirm={() => deleteStop(stop.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} disabled={sortedStops.length <= 1} />
                      </Popconfirm>
                    </Space>
                  </Space>

                  <Text type="secondary">{stop.visit_time || 'Time TBD'} · {stop.duration_mins || 60} mins</Text>
                  {stop.arrival_at ? (
                    <Text type="secondary">Arrived: {dayjs(stop.arrival_at).format('DD MMM HH:mm')}</Text>
                  ) : null}
                  {stop.objectives ? <Text>{stop.objectives}</Text> : null}
                  {stop.pre_visit_notes ? <Text type="secondary">Pre-visit: {stop.pre_visit_notes}</Text> : null}
                  <Input.TextArea
                    rows={2}
                    placeholder="Notes during/after meeting..."
                    value={notesDrafts[stop.id] ?? ''}
                    onChange={(e) => setNotesDrafts((prev) => ({ ...prev, [stop.id]: e.target.value }))}
                    onBlur={(e) => saveStopNotes(stop.id, e.target.value)}
                  />
                  {stop.contact_person && (
                    <Space size={8} wrap>
                      <Text type="secondary">Contact: {stop.contact_person}</Text>
                      {stop.contact_phone && (
                        <>
                          <a href={`tel:${stop.contact_phone}`} style={{ fontSize: 12 }}>{stop.contact_phone}</a>
                          <a href={`https://wa.me/${stop.contact_phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#25d366' }}>WhatsApp</a>
                        </>
                      )}
                    </Space>
                  )}
                  {stop.check_in_timestamp && (
                    <Tag color={Number(stop.check_in_distance_m) <= 2000 ? 'green' : 'orange'} style={{ fontSize: 10 }}>
                      GPS: {Number(stop.check_in_distance_m || 0).toFixed(0)}m away · {dayjs(stop.check_in_timestamp).format('HH:mm')}
                    </Tag>
                  )}

                  <Space wrap style={{ width: '100%' }}>
                    <Button
                      type="primary"
                      icon={<CheckCircleOutlined />}
                      size={isMobile ? 'large' : 'middle'}
                      style={isMobile ? { minHeight: 44, flex: 1 } : undefined}
                      loading={savingArrival}
                      onClick={() => markArrived(stop)}
                    >
                      I'm Here
                    </Button>
                    <Button
                      loading={savingArrival}
                      size={isMobile ? 'large' : 'middle'}
                      style={isMobile ? { minHeight: 44, flex: 1 } : undefined}
                      onClick={() => markArrived(stop)}
                    >
                      Mark Arrived
                    </Button>
                    <Button
                      size={isMobile ? 'large' : 'middle'}
                      style={isMobile ? { minHeight: 44, flex: 1 } : undefined}
                      onClick={() => openMap(stop)}
                    >
                      Open Map
                    </Button>
                    <Button
                      size={isMobile ? 'large' : 'middle'}
                      style={isMobile ? { minHeight: 44, flex: 1 } : undefined}
                      onClick={() => {
                        setActiveStop(stop);
                        form.setFieldsValue({
                          outcome_status: 'no_show',
                          followUp: false,
                          no_show_reason: 'contact_unreachable',
                          visit_result: undefined,
                          postpone_reason: undefined,
                        });
                      }}
                    >
                      No Show
                    </Button>
                    <Button
                      size={isMobile ? 'large' : 'middle'}
                      style={isMobile ? { minHeight: 44, flex: 1 } : undefined}
                      onClick={() => {
                        setActiveStop(stop);
                        form.setFieldsValue({
                          outcome_status: 'postponed',
                          followUp: false,
                          postpone_reason: 'customer_requested',
                          visit_result: undefined,
                          no_show_reason: undefined,
                        });
                      }}
                    >
                      Postpone
                    </Button>
                  </Space>
                </Space>
              </Card>
            );
          })}
        </Space>
      )}

      <Modal
        title={activeStop ? `Log Outcome - Stop #${activeStop.stop_order}` : 'Log Outcome'}
        open={Boolean(activeStop)}
        width={isMobile ? '92%' : 620}
        onCancel={() => {
          setActiveStop(null);
          form.resetFields();
        }}
        onOk={submitOutcome}
        okText="Save"
      >
        <Form layout="vertical" form={form}>
          <Form.Item name="outcome_status" label="Outcome" rules={[{ required: true, message: 'Outcome required' }]}>
            <Select options={OUTCOME_OPTIONS} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, n) => p.outcome_status !== n.outcome_status}>
            {({ getFieldValue }) => {
              const status = getFieldValue('outcome_status');
              if (status === 'visited') {
                return (
                  <Form.Item name="visit_result" label="Visit Result" rules={[{ required: true, message: 'Result required' }]}>
                    <Select options={VISIT_RESULT_OPTIONS} />
                  </Form.Item>
                );
              }
              if (status === 'no_show') {
                return (
                  <Form.Item name="no_show_reason" label="No Show Reason" rules={[{ required: true, message: 'Reason required' }]}>
                    <Select options={NO_SHOW_REASON_OPTIONS} />
                  </Form.Item>
                );
              }
              if (status === 'postponed') {
                return (
                  <Form.Item name="postpone_reason" label="Postpone Reason" rules={[{ required: true, message: 'Reason required' }]}>
                    <Select options={POSTPONE_REASON_OPTIONS} />
                  </Form.Item>
                );
              }
              return null;
            }}
          </Form.Item>
          <Form.Item name="outcome_notes" label="Outcome Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="Photos / Attachments">
            <Upload
              fileList={fileList}
              onChange={({ fileList: fl }) => setFileList(fl.slice(0, 5))}
              beforeUpload={() => false}
              accept="image/*,.pdf"
              multiple
              listType="picture"
            >
              {fileList.length < 5 && <Button icon={<UploadOutlined />}>Upload (max 5)</Button>}
            </Upload>
          </Form.Item>

          <Divider style={{ margin: '12px 0', fontSize: 13 }}>Visit Details</Divider>

          <Form.Item noStyle shouldUpdate={(p, n) => p.outcome_status !== n.outcome_status}>
            {({ getFieldValue }) => {
              const status = getFieldValue('outcome_status');
              return (
                <Form.Item
                  name="meeting_brief"
                  label="Meeting Brief"
                  rules={status === 'visited' ? [{ required: true, message: 'Meeting brief is required' }] : []}
                >
                  <Input.TextArea rows={3} placeholder="Brief summary of meeting discussion, decisions, and outcomes..." />
                </Form.Item>
              );
            }}
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="products_discussed" label="Products Discussed">
                <Input.TextArea rows={2} placeholder="Product names, specs..." />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="competitor_info" label="Competitor Intel">
                <Input.TextArea rows={2} placeholder="Competitor activity, pricing..." />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="next_action" label="Next Action">
            <Input placeholder="e.g. Send revised quotation by Friday" />
          </Form.Item>

          <Divider style={{ margin: '12px 0', fontSize: 13 }}>Follow-up</Divider>

          <Form.Item name="followUp" label="Create Follow-up Task?" initialValue={false}>
            <Select options={FOLLOW_UP_OPTIONS} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, n) => p.followUp !== n.followUp || p.outcome_status !== n.outcome_status}>
            {({ getFieldValue }) => (getFieldValue('followUp') && getFieldValue('outcome_status') === 'visited') ? (
              <>
                <Form.Item name="followup_title" label="Task Title" rules={[{ required: true, message: 'Task title required' }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="followup_due" label="Due Date" rules={[{ required: true, message: 'Due date required' }]}>
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="followup_priority" label="Priority" initialValue="medium">
                  <Select options={PRIORITY_OPTIONS} />
                </Form.Item>
              </>
            ) : null}
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Add Stop While Traveling"
        open={showAddStopModal}
        onCancel={() => { setShowAddStopModal(false); addStopForm.resetFields(); }}
        onOk={submitAddStop}
        confirmLoading={addingStop}
        okText="Add Stop"
      >
        <Form layout="vertical" form={addStopForm} initialValues={{ stop_type: 'customer', duration_mins: 60 }}>
          <Form.Item name="stop_type" label="Stop Type" rules={[{ required: true }]}>
            <Select options={[
              { value: 'customer', label: 'Customer' },
              { value: 'prospect', label: 'Prospect' },
              { value: 'location', label: 'Location' },
            ]} />
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(p, n) => p.stop_type !== n.stop_type}>
            {({ getFieldValue }) => {
              const stopType = getFieldValue('stop_type');
              if (stopType === 'customer') {
                return (
                  <Form.Item name="customer_id" label="Customer" rules={[{ required: true }]}>
                    <Select
                      showSearch
                      optionFilterProp="label"
                      options={customers.map((c) => ({
                        value: Number(c.customer_id || c.id),
                        label: c.display_name || c.customer_name || `Customer #${c.customer_id || c.id}`,
                      }))}
                    />
                  </Form.Item>
                );
              }
              if (stopType === 'prospect') {
                return (
                  <Form.Item name="prospect_id" label="Prospect" rules={[{ required: true }]}>
                    <Select
                      showSearch
                      optionFilterProp="label"
                      options={prospects.map((p) => ({ value: Number(p.id), label: p.customer_name || `Prospect #${p.id}` }))}
                    />
                  </Form.Item>
                );
              }
              return (
                <Form.Item name="address_snapshot" label="Location Name / Address" rules={[{ required: true }]}>
                  <Input placeholder="Hotel, airport, or custom location" />
                </Form.Item>
              );
            }}
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="visit_date" label="Visit Date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="visit_time" label="Visit Time">
                <Input placeholder="HH:mm:ss" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="duration_mins" label="Duration (mins)">
            <Input type="number" min={10} />
          </Form.Item>

          <Form.Item name="objectives" label="Notes / Objective">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default FieldVisitInTrip;
