/**
 * CRMHomePage — Daily planner landing page for sales reps.
 *
 * Layout:
 *   Quick Actions Bar: + Task | + Meeting | + Call | + Deal | Worklist →
 *   Left:   "My Activities" — merged list of tasks + meetings + calls, sorted by date
 *           Each row: status tag, title, date/time, linked customer, priority
 *           "..." menu → Create Task, Schedule Meeting, Log Call
 *           "Show more" footer
 *   Right:  Calendar (month view) with colored event bars for meetings/calls/tasks
 *           "..." menu → Schedule Meeting, Schedule Call, Create Task
 *   Section: Leads & Pipeline
 *   Bottom-left:  "My Leads" — prospect list with status, source, date
 *   Bottom-right: "Deal Pipeline" — compact snapshot (stage pills + totals)
 *                  "Full View →" navigates to Overview tab (SalesCockpit)
 *
 * NOTE: Detailed pipeline analytics (bar chart, risk alerts, customers) live in the
 * Overview tab to avoid duplication. This page is the daily action hub.
 */
import { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Typography, Space, Button, Tag, Badge, Tooltip, Dropdown, Empty } from 'antd';
import {
  CheckSquareOutlined, PhoneOutlined, CalendarOutlined, UserAddOutlined,
  FunnelPlotOutlined, ClockCircleOutlined, LeftOutlined, RightOutlined,
  MoreOutlined, EnvironmentOutlined, PlusOutlined, OrderedListOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import axios from 'axios';
import TaskCreateModal from './TaskCreateModal';
import MeetingCreateModal from './MeetingCreateModal';
import CallCreateModal from './CallCreateModal';
import DealCreateModal from './DealCreateModal';
import './CRM.css';

const { Text } = Typography;
const API = import.meta.env.VITE_API_URL ?? '';

/* ── Constants ─────────────────────────────────────────────────────── */
const PRIORITY_COLORS = { urgent: '#ff4d4f', high: '#fa8c16', medium: '#1677ff', low: '#8c8c8c' };
const STATUS_CFG = {
  open:      { color: 'orange',     label: 'Not Started' },
  overdue:   { color: 'red',        label: 'Overdue' },
  completed: { color: 'green',      label: 'Completed' },
  planned:   { color: 'processing', label: 'Planned' },
  held:      { color: 'green',      label: 'Held' },
  not_held:  { color: 'default',    label: 'Not Held' },
  canceled:  { color: 'default',    label: 'Canceled' },
  started:   { color: 'cyan',       label: 'Started' },
  missed:    { color: 'red',        label: 'Missed' },
};
const LEAD_STATUS = { pending:'orange', approved:'green', rejected:'red', converted:'blue' };
const ACTIVITY_ICONS = {
  task: <CheckSquareOutlined />, meeting: <CalendarOutlined />, call: <PhoneOutlined />,
  visit: <EnvironmentOutlined />, email: <ClockCircleOutlined />, follow_up: <ClockCircleOutlined />,
};
const ACTIVITY_CLR = { task:'#fa8c16', meeting:'#1677ff', call:'#52c41a', visit:'#722ed1' };
const LEAD_GRADIENTS = [
  'linear-gradient(135deg,#6366f1,#8b5cf6)',
  'linear-gradient(135deg,#0891b2,#0e7490)',
  'linear-gradient(135deg,#10b981,#059669)',
  'linear-gradient(135deg,#f59e0b,#d97706)',
  'linear-gradient(135deg,#ec4899,#db2777)',
  'linear-gradient(135deg,#e11d48,#9f1239)',
  'linear-gradient(135deg,#7c3aed,#4f46e5)',
];
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

/* ── Helpers ───────────────────────────────────────────────────────── */
function PanelMenu({ items }) {
  return (
    <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight">
      <Button type="text" size="small" icon={<MoreOutlined />} />
    </Dropdown>
  );
}

/* ── Mini Calendar (extracted to MiniCalendar.jsx) ────────────────── */
import MiniCalendar from './MiniCalendar';

/* ── Deal Snapshot — compact pipeline summary replacing the bar chart ─ */
import { DEAL_STAGES, DEAL_OPEN_STAGES } from './CRMDashboardUtils';

function DealSnapshot({ deals }) {
  const STAGE_CFG = DEAL_STAGES.filter(s => s.value !== 'lost').map(s => ({ key: s.value, label: s.short || s.label, color: s.color }));
  const counts = {};
  const overdueCloseDateStages = new Set();
  const todayStr = dayjs().format('YYYY-MM-DD');
  let currency = 'AED';
  let openValue = 0;
  (deals || []).forEach(d => {
    if (d.expected_close_date && d.expected_close_date < todayStr && DEAL_OPEN_STAGES.includes(d.stage)) {
      overdueCloseDateStages.add(d.stage);
    }
    counts[d.stage] = (counts[d.stage] || 0) + 1;
    if (d.currency) currency = d.currency;
    if (DEAL_OPEN_STAGES.includes(d.stage)) openValue += parseFloat(d.estimated_value || 0);
  });
  const fmt = v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(Math.round(v));
  const openCount = (deals || []).filter(d => DEAL_OPEN_STAGES.includes(d.stage)).length;
  const maxCount = Math.max(1, ...Object.values(counts));

  return (
    <>
      <div className="crm-home-panel-stats">
        <div className="crm-home-stat-pill crm-home-stat-pill-deals">
          <Text className="crm-home-stat-num">{openCount}</Text>
          <Text className="crm-home-stat-lbl">OPEN DEALS</Text>
        </div>
        <div className="crm-home-stat-pill crm-home-stat-pill-value">
          <Text className="crm-home-stat-num crm-home-stat-num-value">{fmt(openValue)}</Text>
          <Text className="crm-home-stat-lbl">{currency} VALUE</Text>
        </div>
      </div>
      <div className="crm-home-stage-rows">
        {STAGE_CFG.map(s => {
          const cnt = counts[s.key] || 0;
          const hasOverdue = overdueCloseDateStages.has(s.key);
          const pct = Math.round((cnt / maxCount) * 100);
          return (
            <div
              key={s.key}
              className="crm-home-stage-row"
              title={hasOverdue ? 'One or more deals have a passed close date' : undefined}
              style={{ '--stage-color': s.color }}
            >
              <span className="crm-home-stage-dot" style={{ background: s.color }} />
              <span className="crm-home-stage-name">{hasOverdue ? '⚠ ' : ''}{s.label}</span>
              <span className="crm-home-stage-bar-wrap">
                <span className="crm-home-stage-bar" style={{ width: `${pct}%`, background: s.color }} />
              </span>
              <span className="crm-home-stage-count">{cnt}</span>
            </div>
          );
        })}
      </div>
      {openCount === 0 && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No open deals yet" style={{ padding: '16px 0 4px', marginTop: 12 }} />
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════ */
const CRMHomePage = () => {
  const navigate = useNavigate();
  const [taskModal, setTaskModal] = useState(false);
  const [meetingModal, setMeetingModal] = useState(false);
  const [callModal, setCallModal] = useState(false);
  const [dealModal, setDealModal] = useState(false);

  // Data state — all from real APIs
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [calls, setCalls] = useState([]);
  const [activities, setActivities] = useState([]);
  const [leads, setLeads] = useState([]);
  const [deals, setDeals] = useState([]);
  const [activeTrip, setActiveTrip] = useState(null);
  const [loading, setLoading] = useState(true);

  const pickActiveTrip = useCallback((trips) => {
    if (!Array.isArray(trips) || trips.length === 0) return null;

    const today = dayjs().startOf('day');
    const active = trips
      .filter((t) => t && (t.status === 'in_progress' || t.status === 'confirmed' || t.status === 'planning'))
      .map((t) => {
        const start = t.departure_date ? dayjs(t.departure_date).startOf('day') : null;
        const end = t.return_date ? dayjs(t.return_date).startOf('day') : start;
        const inWindow = start && end ? !today.isBefore(start) && !today.isAfter(end) : false;
        const sameDay = start ? today.isSame(start, 'day') : false;
        return { ...t, _rank: t.status === 'in_progress' ? 0 : (inWindow ? 1 : (sameDay ? 2 : 3)) };
      })
      .sort((a, b) => {
        if (a._rank !== b._rank) return a._rank - b._rank;
        const aDate = a.departure_date ? dayjs(a.departure_date).valueOf() : Number.MAX_SAFE_INTEGER;
        const bDate = b.departure_date ? dayjs(b.departure_date).valueOf() : Number.MAX_SAFE_INTEGER;
        return aDate - bDate;
      });

    return active[0] || null;
  }, []);

  const loadData = useCallback(async () => {
    // BUG-05 fix: Read token inside callback to avoid stale closure
    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };
    setLoading(true);
    const get = (url) => axios.get(`${API}${url}`, { headers, timeout: 8000 }).catch(() => ({ data: { data: [] } }));
    try {
      const summaryRes = await get('/api/crm/home-summary');
      const summary = summaryRes.data?.data;
      if (summary && typeof summary === 'object') {
        setTasks(Array.isArray(summary.tasks) ? summary.tasks : []);
        setActivities(Array.isArray(summary.activities) ? summary.activities : []);
        setMeetings(Array.isArray(summary.meetings) ? summary.meetings : []);
        setCalls(Array.isArray(summary.calls) ? summary.calls : []);
        setLeads(Array.isArray(summary.prospects) ? summary.prospects : []);
        setDeals(Array.isArray(summary.deals) ? summary.deals : []);
        const trips = Array.isArray(summary.trips) ? summary.trips : [];
        setActiveTrip(pickActiveTrip(trips));
        return;
      }

      const [tR, aR, mR, cR, lR, dR, vR] = await Promise.all([
        get('/api/crm/tasks?status=open&limit=50'),
        get('/api/crm/activities?limit=20'),
        get('/api/crm/meetings?limit=50'),
        get('/api/crm/calls?limit=50'),
        get('/api/crm/my-prospects?limit=20'),
        get('/api/crm/deals?limit=100'),
        get('/api/crm/field-trips?upcoming=true&limit=20'),
      ]);
      setTasks(Array.isArray(tR.data?.data) ? tR.data.data : []);
      setActivities(Array.isArray(aR.data?.data) ? aR.data.data : []);
      setMeetings(Array.isArray(mR.data?.data) ? mR.data.data : []);
      setCalls(Array.isArray(cR.data?.data) ? cR.data.data : []);
      // my-prospects returns { data: { prospects: [...] } }
      const prospectArr = lR.data?.data?.prospects || lR.data?.data;
      setLeads(Array.isArray(prospectArr) ? prospectArr : []);
      setDeals(Array.isArray(dR.data?.data) ? dR.data.data : []);
      const trips = Array.isArray(vR.data?.data) ? vR.data.data : [];
      setActiveTrip(pickActiveTrip(trips));
    } catch (err) {
      console.error('CRMHomePage load error:', err);
    } finally {
      setLoading(false);
    }
  }, [pickActiveTrip]);

  useEffect(() => { loadData(); }, [loadData]);

  const refresh = useCallback(() => {
    setTaskModal(false);
    setMeetingModal(false);
    setCallModal(false);
    setDealModal(false);
    loadData();
  }, [loadData]);

  /* ── Build merged "My Activities" list (like EspoCRM left panel) ── */
  const mergedActivities = [
    ...tasks.map(t => ({
      id: `t-${t.id}`, type: 'task',
      icon: <CheckSquareOutlined />,
      color: ACTIVITY_CLR.task,
      title: t.title,
      status: t.computed_status || t.status || 'open',
      date: t.due_date,
      dateLabel: t.due_date ? dayjs(t.due_date).format('MMM D') : '',
      customer: t.customer_name || t.prospect_name || '',
      priority: t.priority,
    })),
    ...meetings.map(m => ({
      id: `m-${m.id}`, type: 'meeting',
      icon: <CalendarOutlined />,
      color: ACTIVITY_CLR.meeting,
      title: m.name,
      status: m.computed_status || m.status || 'planned',
      date: m.date_start,
      dateLabel: m.date_start ? dayjs(m.date_start).format('MMM D HH:mm') : '',
      customer: m.customer_name || m.prospect_name || '',
      priority: null,
      duration: m.duration_mins ? `${m.duration_mins} min` : '',
      location: m.location || '',
    })),
    ...calls.map(c => ({
      id: `c-${c.id}`, type: 'call',
      icon: <PhoneOutlined />,
      color: ACTIVITY_CLR.call,
      title: c.name,
      status: c.status || 'planned',
      date: c.date_start,
      dateLabel: c.date_start ? dayjs(c.date_start).format('MMM D HH:mm') : '',
      customer: c.customer_name || c.prospect_name || '',
      priority: null,
      direction: c.direction,
    })),
  ].sort((a, b) => {
    // Sort: nearest date first (ascending), nulls last
    const da = a.date ? new Date(a.date) : new Date('9999-12-31');
    const db = b.date ? new Date(b.date) : new Date('9999-12-31');
    return da - db;
  });

  const SHOW_LIMIT = 12;

  /* ── Per-panel contextual "..." menus ── */
  const activitiesMenu = [
    { key: 'task', icon: <PlusOutlined />, label: 'Create Task', onClick: () => setTaskModal(true) },
    { key: 'meeting', icon: <CalendarOutlined />, label: 'Schedule Meeting', onClick: () => setMeetingModal(true) },
    { key: 'call', icon: <PhoneOutlined />, label: 'Log Call', onClick: () => setCallModal(true) },
  ];
  const calendarMenu = [
    { key: 'meeting', icon: <CalendarOutlined />, label: 'Schedule Meeting', onClick: () => setMeetingModal(true) },
    { key: 'call', icon: <PhoneOutlined />, label: 'Schedule Call', onClick: () => setCallModal(true) },
    { key: 'task', icon: <CheckSquareOutlined />, label: 'Create Task', onClick: () => setTaskModal(true) },
  ];
  const leadsMenu = [
    { key: 'lead', icon: <PlusOutlined />, label: 'New Lead', onClick: () => navigate('/crm/prospects') },
  ];
  const oppsMenu = [
    { key: 'opp', icon: <PlusOutlined />, label: 'New Opportunity', onClick: () => setDealModal(true) },
  ];

  /* ── Render ── */
  return (
    <div className="crm-home-page">

      {/* ─── Quick Create Bar ─── */}
      <div className="crm-home-actions-bar">
        <button className="crm-home-qbtn" onClick={() => setTaskModal(true)}>
          <PlusOutlined className="crm-home-qbtn-icon" /> Task
        </button>
        <button className="crm-home-qbtn" onClick={() => setMeetingModal(true)}>
          <PlusOutlined className="crm-home-qbtn-icon" /> Meeting
        </button>
        <button className="crm-home-qbtn" onClick={() => setCallModal(true)}>
          <PlusOutlined className="crm-home-qbtn-icon" /> Call
        </button>
        <button className="crm-home-qbtn" onClick={() => setDealModal(true)}>
          <PlusOutlined className="crm-home-qbtn-icon" /> Deal
        </button>
        <button
          className={`crm-home-qbtn${activeTrip ? ' crm-home-qbtn-visit-live' : ''}`}
                  onClick={() => navigate(activeTrip ? `/crm/visits/${activeTrip.id}/in-trip` : '/crm/visits/new')}
          title={activeTrip ? activeTrip.title : 'Plan a field visit route'}
        >
          <EnvironmentOutlined className="crm-home-qbtn-icon" />
          {activeTrip ? `In-Trip: ${String(activeTrip.title || 'Field Visit').slice(0, 28)}` : 'Visit Planner'}
        </button>
        <button className="crm-home-qbtn crm-home-qbtn-secondary" onClick={() => navigate('/crm/worklist?type=tasks')}>
          <CheckSquareOutlined className="crm-home-qbtn-icon" /> Worklist
        </button>
      </div>

      {/* ═══ ROW 1: My Activities (left) + Calendar (right) ═══ */}
      <Row gutter={[14, 14]}>

        {/* LEFT: My Activities */}
        <Col xs={24} md={12} className="crm-home-col">
          <Card size="small" className="crm-home-panel crm-home-panel-tall crm-home-panel-activities"
            title={<span><ClockCircleOutlined style={{ color: '#1677ff', marginRight: 6 }} />My Activities</span>}
            extra={<PanelMenu items={activitiesMenu} />}>
            <div className="crm-home-list">
              {mergedActivities.length === 0 && !loading && (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No activities yet" style={{ padding: '24px 0' }} />
              )}
              {mergedActivities.slice(0, SHOW_LIMIT).map(a => {
                const st = STATUS_CFG[a.status] || { color: 'default', label: a.status };
                return (
                  <div key={a.id} className="crm-home-list-row">
                    <span className="crm-home-act-icon" style={{ color: a.color }}>
                      {a.icon}
                    </span>
                    <div className="crm-home-list-main">
                      <Text ellipsis style={{ fontSize: 12.5, fontWeight: 500 }}>{a.title}</Text>
                      <Space size={4} wrap>
                        <Tag color={st.color} style={{ fontSize: 10, margin: 0, lineHeight: '16px' }}>{st.label}</Tag>
                        {a.dateLabel && <Text type="secondary" style={{ fontSize: 10.5 }}>{a.dateLabel}</Text>}
                        {a.priority && a.priority !== 'medium' && a.priority !== 'low' && (
                          <Tag color={PRIORITY_COLORS[a.priority]} style={{ fontSize: 10, margin: 0, lineHeight: '16px', color: '#fff' }}>
                            {a.priority.charAt(0).toUpperCase() + a.priority.slice(1)}
                          </Tag>
                        )}
                        {a.customer && <Text type="secondary" style={{ fontSize: 10.5 }}>• {a.customer}</Text>}
                        {a.duration && <Text type="secondary" style={{ fontSize: 10.5 }}>• {a.duration}</Text>}
                        {a.location && <Text type="secondary" style={{ fontSize: 10.5 }}>• {a.location}</Text>}
                      </Space>
                    </div>
                  </div>
                );
              })}
            </div>
            {mergedActivities.length > SHOW_LIMIT && (
              <div className="crm-home-panel-footer">
                <Button type="link" size="small" onClick={() => navigate('/crm/my-day')}>Show more</Button>
                <Badge count={mergedActivities.length} style={{ backgroundColor: '#f0f0f0', color: '#666', fontSize: 10, boxShadow: 'none' }} />
              </div>
            )}
          </Card>
        </Col>

        {/* RIGHT: Calendar */}
        <Col xs={24} md={12} className="crm-home-col">
          <Card size="small" className="crm-home-panel crm-home-calendar-card crm-home-panel-tall crm-home-panel-calendar"
            extra={<PanelMenu items={calendarMenu} />}>
            <MiniCalendar meetings={meetings} calls={calls} tasks={tasks} />
          </Card>
        </Col>
      </Row>

      {/* ═══ ROW 2: My Leads (left) + Deal Pipeline snapshot (right) ═══ */}
      <div className="crmx-section-label">Leads &amp; Pipeline</div>
      <Row gutter={[14, 14]}>

        {/* My Leads */}
        <Col xs={24} md={12} className="crm-home-col">
          <Card size="small" className="crm-home-panel crm-home-panel-leads"
            title={<span><UserAddOutlined style={{ color: '#722ed1', marginRight: 6 }} />My Leads</span>}
            extra={<PanelMenu items={leadsMenu} />}>
            <div className="crm-home-list">
              {leads.length === 0 && !loading && (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No prospects yet" style={{ padding: '16px 0' }} />
              )}
              {leads.slice(0, 8).map((l, idx) => {
                const name = l.customer_name || l.company_name || l.name || 'Unnamed';
                return (
                  <div key={l.id} className="crm-home-list-row">
                    <div
                      className="crm-home-lead-av"
                      style={{ background: LEAD_GRADIENTS[idx % LEAD_GRADIENTS.length] }}
                    >
                      {getInitials(name)}
                    </div>
                    <div className="crm-home-list-main">
                      <Space size={6}>
                        <Text strong style={{ fontSize: 12.5 }}>{name}</Text>
                        {l.approval_status && (
                          <Tag color={LEAD_STATUS[l.approval_status] || 'default'} style={{ fontSize: 10, margin: 0, lineHeight: '16px' }}>
                            {l.approval_status}
                          </Tag>
                        )}
                      </Space>
                      <Space size={4}>
                        {l.country && <Text type="secondary" style={{ fontSize: 10.5 }}>{l.country}</Text>}
                        {l.source && <Tag color="default" style={{ fontSize: 10, margin: 0, lineHeight: '16px' }}>{l.source}</Tag>}
                        {l.created_at && <Text type="secondary" style={{ fontSize: 10.5 }}>{dayjs(l.created_at).format('MMM D')}</Text>}
                      </Space>
                    </div>
                  </div>
                );
              })}
            </div>
            {leads.length > 0 && (
              <div className="crm-home-panel-footer">
                <Button type="link" size="small" onClick={() => navigate('/crm/prospects')}>View all prospects</Button>
                <Badge count={leads.length} style={{ backgroundColor: '#f0f0f0', color: '#666', fontSize: 10, boxShadow: 'none' }} />
              </div>
            )}
          </Card>
        </Col>

        {/* Deal Pipeline snapshot */}
        <Col xs={24} md={12} className="crm-home-col">
          <Card size="small" className="crm-home-panel crm-home-panel-pipeline"
            title={<span><FunnelPlotOutlined style={{ color: '#1677ff', marginRight: 6 }} />Deal Pipeline</span>}
            extra={
              <Space size={4}>
                <PanelMenu items={oppsMenu} />
                <Button type="link" size="small" onClick={() => navigate('/crm/overview')} style={{ padding: '0 4px', fontSize: 12 }}>
                  Full View →
                </Button>
              </Space>
            }>
            <DealSnapshot deals={deals} />
          </Card>
        </Col>
      </Row>

      {/* ── Modals ── */}
      {taskModal && <TaskCreateModal open={taskModal} onClose={() => setTaskModal(false)} onCreated={refresh} />}
      {meetingModal && <MeetingCreateModal open={meetingModal} onClose={() => setMeetingModal(false)} onCreated={refresh} />}
      {callModal && <CallCreateModal open={callModal} onClose={() => setCallModal(false)} onCreated={refresh} />}
      {dealModal && <DealCreateModal open={dealModal} onClose={() => setDealModal(false)} onCreated={refresh} />}
    </div>
  );
};

export default CRMHomePage;
