/**
 * MyDayDashboard - action-execution daily workspace for sales reps.
 * Includes: KPI strip, today's schedule, priority actions, customer health,
 * notifications, lookahead, email queue, and field visit banner.
 *
 * Duplication guard: legacy summary/task/list/feed blocks are intentionally
 * removed so My Day does not overlap with Home's planning views.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Row, Col, Spin, Space, Button, Input, Modal, Select, Drawer, List, Tag, Badge, Typography, message
} from 'antd';
import { BellOutlined, AlertOutlined, MailOutlined, FileTextOutlined, CheckCircleOutlined, UserAddOutlined, EditOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import MyDayKPIBar from './MyDayKPIBar';
import MyDaySchedule from './MyDaySchedule';
import MyDayPriorityActions from './MyDayPriorityActions';
import MyDayCustomerHealth from './MyDayCustomerHealth';
import MyDayNotifications from './MyDayNotifications';
import MyDayLookahead from './MyDayLookahead';
import MyDayEmailQueue from './MyDayEmailQueue';
import MyDayFieldVisitBanner from './MyDayFieldVisitBanner';
import EmailComposeModal from './EmailComposeModal';
import CallCreateModal from './CallCreateModal';
import './CRM.css';

dayjs.extend(relativeTime);
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const MyDayDashboard = () => {
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [sectionLoading, setSectionLoading] = useState({
    header: true,
    schedule: true,
    priority: true,
    health: true,
    notifications: true,
    lookahead: true,
    email: true,
    trip: true,
  });
  const [summary, setSummary] = useState({});
  const [scheduleItems, setScheduleItems] = useState([]);
  const [priorityActions, setPriorityActions] = useState([]);
  const [customerHealth, setCustomerHealth] = useState([]);
  const [myDayNotifications, setMyDayNotifications] = useState([]);
  const [lookaheadItems, setLookaheadItems] = useState([]);
  const [emailSummary, setEmailSummary] = useState({});
  const [emailDrafts, setEmailDrafts] = useState([]);
  const [upcomingTrip, setUpcomingTrip] = useState(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeCustomerId, setComposeCustomerId] = useState(null);
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [quickCallCustomerId, setQuickCallCustomerId] = useState(null);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteCustomer, setNoteCustomer] = useState(null);
  const [noteBody, setNoteBody] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [lostModalOpen, setLostModalOpen] = useState(false);
  const [lostCustomer, setLostCustomer] = useState(null);
  const [lostReason, setLostReason] = useState('other');
  const [lostNotes, setLostNotes] = useState('');
  const [savingLost, setSavingLost] = useState(false);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [allNotifications, setAllNotifications] = useState([]);
  const [loadingAllNotifs, setLoadingAllNotifs] = useState(false);

  const openNotifDrawer = useCallback(async () => {
    setNotifDrawerOpen(true);
    if (allNotifications.length > 0) return;
    setLoadingAllNotifs(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.get(`${API_BASE}/api/crm/my-day/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 100 },
      });
      setAllNotifications(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (_) {
      message.error('Failed to load notifications');
    } finally {
      setLoadingAllNotifs(false);
    }
  }, [allNotifications.length]);

  const pickMyDayTrip = (trips) => {
    if (!Array.isArray(trips) || trips.length === 0) return null;

    const today = dayjs().startOf('day');
    const mapped = trips
      .filter((t) => t && ['planning', 'confirmed', 'in_progress'].includes(t.status))
      .map((t) => {
        const start = t.departure_date ? dayjs(t.departure_date).startOf('day') : null;
        const end = t.return_date ? dayjs(t.return_date).startOf('day') : start;
        const inWindow = start && end ? !today.isBefore(start) && !today.isAfter(end) : false;
        const daysToStart = start ? start.diff(today, 'day') : Number.POSITIVE_INFINITY;
        const startsSoon = Number.isFinite(daysToStart) && daysToStart >= 0 && daysToStart <= 7;

        let rank = 99;
        if (t.status === 'in_progress' && inWindow) rank = 0;
        else if (inWindow) rank = 1;
        else if (startsSoon) rank = 2;

        return { ...t, _rank: rank, _daysToStart: daysToStart };
      })
      .filter((t) => t._rank <= 2)
      .sort((a, b) => {
        if (a._rank !== b._rank) return a._rank - b._rank;
        const aDate = Number.isFinite(a._daysToStart) ? a._daysToStart : Number.MAX_SAFE_INTEGER;
        const bDate = Number.isFinite(b._daysToStart) ? b._daysToStart : Number.MAX_SAFE_INTEGER;
        return aDate - bDate;
      });

    return mapped[0] || null;
  };

  const loadData = useCallback(async () => {
    // BUG-05 fix: Read token inside callback to avoid stale closure
    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };
    setRefreshing(true);
    setSectionLoading({
      header: true,
      schedule: true,
      priority: true,
      health: true,
      notifications: true,
      lookahead: true,
      email: true,
      trip: true,
    });
    try {
      // Fetch trips first so we know which country the rep is traveling to
      const tripsReq = axios.get(`${API_BASE}/api/crm/field-trips`, { headers, params: { upcoming: true, limit: 1 } }).catch(() => ({ data: { data: [] } }));
      const tripsRes = await tripsReq;
      const trips = Array.isArray(tripsRes.data?.data) ? tripsRes.data.data : [];
      const activeTrip = pickMyDayTrip(trips);
      setUpcomingTrip(activeTrip);
      setSectionLoading((prev) => ({ ...prev, trip: false }));

      // Use trip destination country, default to UAE when local (no trip)
      const healthCountry = activeTrip?.country || 'UAE';

      const requests = {
        summary: axios.get(`${API_BASE}/api/crm/my-day/summary`, { headers }).catch(() => ({ data: { data: {} } })),
        schedule: axios.get(`${API_BASE}/api/crm/my-day/schedule`, { headers, params: { include_overdue: true } }).catch(() => ({ data: { data: [] } })),
        priority: axios.get(`${API_BASE}/api/crm/my-day/priority-actions`, { headers }).catch(() => ({ data: { data: [] } })),
        health: axios.get(`${API_BASE}/api/crm/my-day/customer-health`, { headers, params: { country: healthCountry } }).catch(() => ({ data: { data: [] } })),
        notifications: axios.get(`${API_BASE}/api/crm/my-day/notifications`, { headers, params: { limit: 6 } }).catch(() => ({ data: { data: [] } })),
        lookahead: axios.get(`${API_BASE}/api/crm/my-day/lookahead`, { headers, params: { days: 3 } }).catch(() => ({ data: { data: [] } })),
        emailSummary: axios.get(`${API_BASE}/api/crm/my-day/email-summary`, { headers }).catch(() => ({ data: { data: {} } })),
        emailDrafts: axios.get(`${API_BASE}/api/crm/email-drafts`, { headers, params: { due_today: true, status: 'pending' } }).catch(() => ({ data: { data: [] } })),
      };

      requests.summary.then((summaryRes) => {
        const s = summaryRes.data?.data || {};
        setSummary({
          callsToday: s.callsToday || 0,
          meetingsHeldToday: s.meetingsHeldToday || 0,
          tasksCompletedToday: s.tasksCompletedToday || 0,
          newInquiriesToday: s.newInquiriesToday || 0,
          dealsAdvancedWeek: s.dealsAdvancedWeek || 0,
          revenueMtd: s.revenueMtd || 0,
        });
      }).finally(() => setSectionLoading((prev) => ({ ...prev, header: false })));

      requests.schedule.then((scheduleRes) => {
        const schedule = Array.isArray(scheduleRes.data?.data) ? scheduleRes.data.data : [];
        setScheduleItems(schedule.slice(0, 20));
      }).finally(() => setSectionLoading((prev) => ({ ...prev, schedule: false })));

      requests.priority.then((priorityRes) => {
        const priorities = Array.isArray(priorityRes.data?.data) ? priorityRes.data.data : [];
        setPriorityActions(priorities.slice(0, 7));
      }).finally(() => setSectionLoading((prev) => ({ ...prev, priority: false })));

      requests.health.then((healthRes) => {
        const health = Array.isArray(healthRes.data?.data) ? healthRes.data.data : [];
        setCustomerHealth(health.slice(0, 20));
      }).finally(() => setSectionLoading((prev) => ({ ...prev, health: false })));

      requests.notifications.then((notificationsRes) => {
        const notifications = Array.isArray(notificationsRes.data?.data) ? notificationsRes.data.data : [];
        setMyDayNotifications(notifications.slice(0, 6));
      }).finally(() => setSectionLoading((prev) => ({ ...prev, notifications: false })));

      requests.lookahead.then((lookaheadRes) => {
        const lookahead = Array.isArray(lookaheadRes.data?.data) ? lookaheadRes.data.data : [];
        setLookaheadItems(lookahead.slice(0, 8));
      }).finally(() => setSectionLoading((prev) => ({ ...prev, lookahead: false })));

      Promise.all([requests.emailSummary, requests.emailDrafts])
        .then(([emailSummaryRes, emailDraftsRes]) => {
          setEmailSummary(emailSummaryRes.data?.data || {});
          const drafts = Array.isArray(emailDraftsRes.data?.data) ? emailDraftsRes.data.data : [];
          setEmailDrafts(drafts.slice(0, 6));
        })
        .finally(() => setSectionLoading((prev) => ({ ...prev, email: false })));

      await Promise.all(Object.values(requests));
    } catch (err) {
      console.error('MyDayDashboard load error:', err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handlePriorityAction = (item) => {
    switch (item?.type) {
      case 'cold_deal':
        navigate('/crm/worklist?type=deals');
        break;
      case 'unanswered_proposal':
      case 'new_uncontacted_inquiry':
        if (item?.entity_id) navigate(`/crm/inquiries/${item.entity_id}`);
        else navigate('/crm/inquiries');
        break;
      case 'reorder_window':
        if (item?.entity_id) navigate(`/crm/customers/${item.entity_id}`);
        else navigate('/crm/customers');
        break;
      case 'overdue_task':
        if (item?.entity_id) navigate(`/crm/worklist?type=tasks&highlight=${item.entity_id}`);
        else navigate('/crm/worklist?type=tasks&status=overdue');
        break;
      case 'unread_email':
      case 'awaiting_reply':
        navigate('/settings', { state: { activeTab: 'outlook' } });
        break;
      default:
        navigate('/crm/worklist');
        break;
    }
  };

  const handlePrioritySnooze = async (item) => {
    if (!item?.entity_id || !item?.type) return;
    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };

    try {
      await axios.post(
        `${API_BASE}/api/crm/my-day/priority-actions/${item.entity_id}/snooze`,
        { type: item.type },
        { headers }
      );
      message.success('Snoozed for 24 hours');
    } catch {
      message.error('Failed to snooze item');
    }

    loadData();
  };

  const handleScheduleAction = async (item, action) => {
    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };

    if (action === 'log') {
      if (item?.item_type === 'call') {
        navigate(`/crm/worklist?type=calls&highlight=${item.id}`);
      } else if (item?.item_type === 'meeting') {
        navigate(`/crm/worklist?type=meetings&highlight=${item.id}`);
      } else if (item?.item_type === 'task') {
        navigate(`/crm/worklist?type=tasks&highlight=${item.id}`);
      } else {
        navigate('/crm/worklist');
      }
      return;
    }

    if (action === 'reschedule') {
      if (item?.item_type === 'task') {
        navigate(`/crm/worklist?type=tasks&highlight=${item.id}`);
      } else if (item?.item_type === 'meeting') {
        navigate(`/crm/worklist?type=meetings&highlight=${item.id}`);
      } else if (item?.item_type === 'call') {
        navigate(`/crm/worklist?type=calls&highlight=${item.id}`);
      } else {
        navigate('/crm/worklist');
      }
      return;
    }

    try {
      if (item?.item_type === 'task' && action === 'done') {
        await axios.patch(`${API_BASE}/api/crm/tasks/${item.id}`, { status: 'completed' }, { headers });
      } else if (item?.item_type === 'meeting' && (action === 'held' || action === 'done')) {
        await axios.patch(`${API_BASE}/api/crm/meetings/${item.id}`, { status: 'held' }, { headers });
      } else if (item?.item_type === 'call' && (action === 'held' || action === 'done')) {
        await axios.patch(`${API_BASE}/api/crm/calls/${item.id}`, { status: 'held' }, { headers });
      } else if (item?.item_type === 'visit' && (action === 'held' || action === 'done')) {
        navigate('/crm/visits');
        return;
      }
      loadData();
    } catch (_error) {
      message.error('Failed to update schedule item');
    }
  };

  const getCustomerId = (cust) => cust?.customer_id || cust?.id || null;

  const handleQuickCall = (cust) => {
    const customerId = getCustomerId(cust);
    setQuickCallCustomerId(customerId);
    setCallModalOpen(true);
  };

  const handleQuickEmail = (cust) => {
    const customerId = getCustomerId(cust);
    setComposeCustomerId(customerId);
    setComposeOpen(true);
  };

  const handleQuickNote = (cust) => {
    const customerId = getCustomerId(cust);
    if (!customerId) return;
    setNoteCustomer(cust);
    setNoteBody('');
    setNoteModalOpen(true);
  };

  const handleMarkLost = (cust) => {
    setLostCustomer(cust);
    setLostReason('other');
    setLostNotes('');
    setLostModalOpen(true);
  };

  const submitMarkLost = async () => {
    const customerId = getCustomerId(lostCustomer);
    if (!customerId) return;
    setSavingLost(true);
    try {
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`${API_BASE}/api/crm/lost-business`, {
        customer_id: customerId,
        reason: lostReason,
        notes: lostNotes || null,
        last_order_amount: lostCustomer.last_order_amount || null,
        last_order_month: lostCustomer.last_order_month || null,
        monthly_avg_revenue: lostCustomer.monthly_avg_revenue || null,
      }, { headers });
      message.success(`${lostCustomer.customer_name || 'Customer'} marked as lost business`);
      setLostModalOpen(false);
      setCustomerHealth((prev) => prev.filter((c) => getCustomerId(c) !== customerId));
    } catch (err) {
      message.error('Failed to mark as lost business');
    } finally {
      setSavingLost(false);
    }
  };

  const submitQuickNote = async () => {
    const customerId = getCustomerId(noteCustomer);
    if (!customerId || !noteBody.trim()) {
      message.warning('Note text is required');
      return;
    }

    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };
    setSavingNote(true);
    try {
      await axios.post(
        `${API_BASE}/api/crm/notes`,
        { body: noteBody.trim(), record_type: 'customer', record_id: customerId },
        { headers }
      );
      message.success('Note added');
      setNoteModalOpen(false);
      loadData();
    } catch (_error) {
      message.error('Failed to add note');
    } finally {
      setSavingNote(false);
    }
  };

  const handleNotificationOpen = async (n) => {
    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };
    if (n?.id && !n?.is_read) {
      await axios.patch(`${API_BASE}/api/crm/my-day/notifications/${n.id}/read`, {}, { headers }).catch(() => null);
    }
    if (n?.link) {
      navigate(n.link);
      return;
    }
    navigate('/crm/my-day');
  };

  const handleLookaheadOpen = (item) => {
    if (item?.item_type === 'meeting') {
      navigate(`/crm/worklist?type=meetings&highlight=${item.entity_id}`);
      return;
    }
    if (item?.item_type === 'deal') {
      navigate(`/crm/worklist?type=deals&highlight=${item.entity_id}`);
      return;
    }
    if (item?.item_type === 'task') {
      navigate(`/crm/worklist?type=tasks&highlight=${item.entity_id}`);
      return;
    }
    navigate('/crm/worklist');
  };

  const updateDraftStatus = async (draft, status) => {
    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };

    await axios.patch(
      `${API_BASE}/api/crm/email-drafts/${draft.id}`,
      {
        status,
        ...(status === 'sent' ? { sent_at: dayjs().toISOString() } : {}),
      },
      { headers }
    ).catch(() => null);

    loadData();
  };

  const handleComposeEmail = () => {
    setComposeCustomerId(null);
    setComposeOpen(true);
  };

  const handleSendDraft = async (draft) => {
    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };

    await axios.post(
      `${API_BASE}/api/crm/emails/drafts/${draft.id}/send`,
      {},
      { headers }
    ).catch(() => null);

    loadData();
  };
  const handleMarkSentDraft = (draft) => updateDraftStatus(draft, 'sent');
  const handleEditDraft = () => navigate('/settings');
  const handleSkipDraft = (draft) => updateDraftStatus(draft, 'cancelled');

  const handleConnectOutlook = async () => {
    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };
    const res = await axios.get(`${API_BASE}/api/auth/outlook/connect`, { headers }).catch(() => null);
    const url = res?.data?.url;
    if (!url) {
      navigate('/settings');
      return;
    }

    const popup = window.open(url, 'outlook-connect', 'width=560,height=720');
    if (!popup) {
      navigate('/settings');
      return;
    }

    const listener = (event) => {
      if (event?.data?.source === 'outlook-oauth') {
        window.removeEventListener('message', listener);
        loadData();
      }
    };
    window.addEventListener('message', listener);
  };

  return (
    <div className="crm-my-day-dashboard">
      <Card style={{ marginBottom: 16 }} styles={{ body: { padding: 16 } }}>
        <Space style={{ width: '100%', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }} wrap>
          <span />
          <Button loading={refreshing} onClick={loadData}>Refresh</Button>
        </Space>
        <Spin spinning={sectionLoading.header}>
          <MyDayKPIBar summary={summary} />
        </Spin>
      </Card>

      {upcomingTrip && !sectionLoading.trip ? (
        <div style={{ marginBottom: 16 }}>
          <MyDayFieldVisitBanner
            trip={upcomingTrip}
            onOpenTrip={() => navigate(`/crm/visits/${upcomingTrip.id}`)}
            onOpenRoute={() => navigate(`/crm/visits/${upcomingTrip.id}/route`)}
            onGoInTrip={() => navigate(`/crm/visits/${upcomingTrip.id}/in-trip`)}
          />
        </div>
      ) : null}

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} lg={16}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Spin spinning={sectionLoading.schedule}>
              <MyDaySchedule items={scheduleItems} onAction={handleScheduleAction} />
            </Spin>
            <Spin spinning={sectionLoading.priority}>
              <MyDayPriorityActions
                items={priorityActions}
                onAction={handlePriorityAction}
                onSnooze={handlePrioritySnooze}
              />
            </Spin>
            <Spin spinning={sectionLoading.email}>
              <MyDayEmailQueue
                summary={emailSummary}
                items={emailDrafts}
                onCompose={handleComposeEmail}
                onSend={handleSendDraft}
                onMarkSent={handleMarkSentDraft}
                onEdit={handleEditDraft}
                onSkip={handleSkipDraft}
                onConnectOutlook={handleConnectOutlook}
              />
            </Spin>
          </Space>
        </Col>
        <Col xs={24} lg={8}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Spin spinning={sectionLoading.health}>
              <MyDayCustomerHealth
                items={customerHealth}
                onOpenCustomer={(cust) => {
                  const customerId = getCustomerId(cust);
                  if (customerId) navigate(`/crm/customers/${customerId}`);
                }}
                onQuickCall={handleQuickCall}
                onQuickEmail={handleQuickEmail}
                onQuickNote={handleQuickNote}
                onMarkLost={handleMarkLost}
              />
            </Spin>
            <Spin spinning={sectionLoading.notifications}>
              <MyDayNotifications
                items={myDayNotifications}
                onOpen={handleNotificationOpen}
                onSeeAll={openNotifDrawer}
              />
            </Spin>
            <Spin spinning={sectionLoading.lookahead}>
              <MyDayLookahead items={lookaheadItems} onOpen={handleLookaheadOpen} />
            </Spin>
          </Space>
        </Col>
      </Row>

      <EmailComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSent={loadData}
        onDraftSaved={loadData}
        defaultCustomerId={composeCustomerId}
      />

      <CallCreateModal
        open={callModalOpen}
        defaultCustomerId={quickCallCustomerId}
        onClose={() => setCallModalOpen(false)}
        onCreated={() => {
          setCallModalOpen(false);
          loadData();
        }}
      />

      <Modal
        title={`Add Note${noteCustomer?.customer_name ? `: ${noteCustomer.customer_name}` : ''}`}
        open={noteModalOpen}
        onCancel={() => setNoteModalOpen(false)}
        onOk={submitQuickNote}
        confirmLoading={savingNote}
        okText="Save Note"
      >
        <Input.TextArea
          rows={4}
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          placeholder="Write note..."
        />
      </Modal>

      <Modal
        title={`Mark as Lost Business${lostCustomer?.customer_name ? `: ${lostCustomer.customer_name}` : ''}`}
        open={lostModalOpen}
        onCancel={() => setLostModalOpen(false)}
        onOk={submitMarkLost}
        confirmLoading={savingLost}
        okText="Mark as Lost"
        okButtonProps={{ danger: true }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>Reason</div>
            <Select
              value={lostReason}
              onChange={setLostReason}
              style={{ width: '100%' }}
              options={[
                { value: 'competitor', label: 'Lost to Competitor' },
                { value: 'price', label: 'Pricing Issue' },
                { value: 'quality', label: 'Quality Complaints' },
                { value: 'service', label: 'Poor Service' },
                { value: 'closed_business', label: 'Customer Closed / Bankrupt' },
                { value: 'relocated', label: 'Relocated' },
                { value: 'no_demand', label: 'No Longer Needs Products' },
                { value: 'payment_issues', label: 'Payment / Credit Issues' },
                { value: 'other', label: 'Other' },
              ]}
            />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>Notes (optional)</div>
            <Input.TextArea
              rows={3}
              value={lostNotes}
              onChange={(e) => setLostNotes(e.target.value)}
              placeholder="Additional details about why this customer was lost..."
            />
          </div>
        </Space>
      </Modal>

      <Drawer
        title={<Space><BellOutlined style={{ color: '#1677ff' }} /><span>All Activity</span></Space>}
        placement="right"
        width={420}
        open={notifDrawerOpen}
        onClose={() => setNotifDrawerOpen(false)}
        styles={{ body: { padding: 0 } }}
      >
        <Spin spinning={loadingAllNotifs}>
          {allNotifications.length === 0 && !loadingAllNotifs ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>No activity yet</div>
          ) : (
            <List
              size="small"
              dataSource={allNotifications}
              renderItem={(n) => {
                const t = (n.type || '').toLowerCase();
                let color = 'default'; let label = 'Info'; let icon = <BellOutlined />;
                if (t.includes('email') || t.includes('reply'))                                         { color = 'blue';    label = 'Email';    icon = <MailOutlined />; }
                else if (t.includes('assigned'))                                                    { color = 'purple';  label = 'New';      icon = <UserAddOutlined />; }
                else if (t.includes('approved'))                                                    { color = 'green';   label = 'Approved'; icon = <CheckCircleOutlined />; }
                else if (t.includes('lab_result') || t.includes('sla') || t.includes('breach'))    { color = 'orange';  label = 'Pending';  icon = <AlertOutlined />; }
                else if (t.includes('alert') || t.includes('stall') || t.includes('overdue'))      { color = 'red';     label = 'Urgent';   icon = <AlertOutlined />; }
                else if (t.includes('closed'))                                                      { color = 'orange';  label = 'Closed';   icon = <FileTextOutlined />; }
                else if (t.includes('note') || t.includes('comment'))                              { color = 'cyan';    label = 'Note';     icon = <EditOutlined />; }
                return (
                  <List.Item
                    style={{ padding: '12px 20px', cursor: n.link ? 'pointer' : 'default', borderBottom: '1px solid #f0f0f0' }}
                    onClick={() => { if (n.link) { setNotifDrawerOpen(false); navigate(n.link); } }}
                  >
                    <List.Item.Meta
                      avatar={<span style={{ fontSize: 18 }}>{icon}</span>}
                      title={
                        <Space size={6} wrap>
                          {!n.is_read && <Badge dot color="blue" />}
                          <Tag color={color} style={{ margin: 0 }}>{label}</Tag>
                          <Typography.Text strong style={{ fontSize: 13 }}>{n.title}</Typography.Text>
                        </Space>
                      }
                      description={
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{n.message || ''}</Typography.Text>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          )}
        </Spin>
      </Drawer>
    </div>
  );
};

export default MyDayDashboard;
