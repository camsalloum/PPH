import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Card, Col, Empty, Input, Pagination, Popconfirm, Progress, Row, Select, Space, Spin, Tag, Tooltip, Typography } from 'antd';
import {
  CalendarOutlined, CarOutlined, CheckCircleOutlined, CompassOutlined, CopyOutlined, DeleteOutlined, EnvironmentOutlined,
  EditOutlined, EyeOutlined, FileTextOutlined, GlobalOutlined, NodeIndexOutlined, PlayCircleOutlined,
  PlusOutlined, SearchOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE, getAuthHeaders, TRIP_STATUS_CFG as STATUS_CFG, REPORT_STATUS_CFG } from './fieldVisitUtils';

const { Text, Title } = Typography;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'planning', label: 'Planning' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const normalizeTripStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'inprogress') return 'in_progress';
  if (normalized === 'pendingapproval') return 'pending_approval';
  if (normalized === 'changes_requested') return 'planning';
  return normalized || 'draft';
};

const DATE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Dates' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past_30', label: 'Past 30 Days' },
  { value: 'this_month', label: 'This Month' },
];

const FieldVisitList = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [repFilter, setRepFilter] = useState('all');
  const [salesReps, setSalesReps] = useState([]);
  const [showApprovalQueueOnly, setShowApprovalQueueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const { user } = useAuth();
  const userRole = user?.role || 'sales_rep';
  const isManager = userRole === 'admin' ||
    (['manager','sales_manager','sales_coordinator'].includes(userRole) && (user?.designation_level != null && user.designation_level >= 6));
  const canFilterByRep = isManager && salesReps.length > 0;

  const loadTrips = useCallback(async () => {
    const headers = getAuthHeaders();
    setLoading(true);
    setError('');
    try {
      const requests = [
        axios.get(`${API_BASE}/api/crm/field-trips`, { headers, params: { limit: 200 } }),
      ];
      if (isManager) {
        requests.push(axios.get(`${API_BASE}/api/crm/field-trips/pending-my-approval`, { headers }));
      }

      const [tripsRes, approvalsRes] = await Promise.all(requests);
      const data = Array.isArray(tripsRes.data?.data) ? tripsRes.data.data : [];
      setItems(data);
      if (isManager) {
        const approvals = Array.isArray(approvalsRes?.data?.data) ? approvalsRes.data.data : [];
        setPendingApprovals(approvals);
      } else {
        setPendingApprovals([]);
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load field trips.');
      setItems([]);
      setPendingApprovals([]);
    } finally {
      setLoading(false);
    }
  }, [isManager]);

  useEffect(() => { loadTrips(); }, [loadTrips]);

  // Manager: load sales reps from API for the rep filter
  useEffect(() => {
    if (!isManager) return;
    const loadReps = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/crm/sales-reps`, { headers: getAuthHeaders() });
        const reps = (res.data?.data || []).filter(r => r.user_id);
        setSalesReps(reps.map(r => ({ value: String(r.user_id), label: r.full_name })));
      } catch { /* ignore */ }
    };
    loadReps();
  }, [isManager]);

  const filteredItems = items.filter((trip) => {
    if (showApprovalQueueOnly) {
      return pendingApprovals.some((p) => p.id === trip.id);
    }

    const tripStatus = normalizeTripStatus(trip.status);
    if (statusFilter !== 'all') {
      if (statusFilter === 'planning') {
        if (!['planning', 'draft'].includes(tripStatus)) return false;
      } else if (tripStatus !== statusFilter) {
        return false;
      }
    }
    if (repFilter !== 'all' && String(trip.rep_id) !== repFilter) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      const hay = `${trip.title || ''} ${trip.country || ''} ${trip.rep_name || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (dateFilter !== 'all') {
      const today = dayjs().startOf('day');
      const dep = trip.departure_date ? dayjs(trip.departure_date) : null;
      const ret = trip.return_date ? dayjs(trip.return_date) : dep;
      if (dateFilter === 'upcoming' && dep && dep.isBefore(today)) return false;
      if (dateFilter === 'past_30') {
        const thirtyAgo = today.subtract(30, 'day');
        if (!ret || ret.isBefore(thirtyAgo) || dep?.isAfter(today)) return false;
      }
      if (dateFilter === 'this_month') {
        const monthStart = today.startOf('month');
        const monthEnd = today.endOf('month');
        if (!dep || dep.isAfter(monthEnd) || (ret && ret.isBefore(monthStart))) return false;
      }
    }
    return true;
  });

  const pagedItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pendingApprovalIds = new Set((pendingApprovals || []).map((t) => t.id));
  const planningTrips = pagedItems.filter((t) => ['draft', 'planning'].includes(normalizeTripStatus(t.status)));
  const activeTrips = pagedItems.filter((t) => {
    const status = normalizeTripStatus(t.status);
    if (!['pending_approval', 'confirmed', 'in_progress'].includes(status)) return false;
    if (isManager && status === 'pending_approval' && pendingApprovalIds.has(t.id)) return false;
    return true;
  });
  const historyTrips = pagedItems.filter((t) => ['completed', 'cancelled'].includes(normalizeTripStatus(t.status)));

  // Quick stats
  const stats = { total: items.length, planning: 0, active: 0, completed: 0 };
  items.forEach(t => {
    const status = normalizeTripStatus(t.status);
    if (['draft', 'planning', 'confirmed'].includes(status)) stats.planning++;
    else if (status === 'in_progress') stats.active++;
    else if (status === 'completed') stats.completed++;
  });

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spin size="large" /></div>;

  const headerGradient = 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)';

  const renderTripCard = (trip) => {
    const tripStatus = normalizeTripStatus(trip.status);
    const cfg = STATUS_CFG[tripStatus] || STATUS_CFG.draft;
    const settlementStatus = String(trip.settlement_status || '').toLowerCase();
    const exceptionStatusCfg = settlementStatus === 'rejected'
      ? { label: 'Settlement Rejected', color: '#ff4d4f', bg: '#fff2f0' }
      : settlementStatus === 'revision_requested'
        ? { label: 'Settlement Revision Requested', color: '#fa8c16', bg: '#fff7e6' }
        : null;
    const statusBadgeCfg = exceptionStatusCfg || cfg;
    const totalStops = Number(trip.stop_count || 0);
    const visited = Number(trip.visited_count || 0);
    const pct = totalStops > 0 ? Math.round((visited / totalStops) * 100) : 0;
    const isIntl = trip.trip_type === 'international';
    const reportStatus = String(trip.travel_report_status || '').toLowerCase();
    const reportCfg = REPORT_STATUS_CFG[reportStatus] || null;
    const depStr = trip.departure_date ? dayjs(trip.departure_date).format('DD MMM') : '—';
    const retStr = trip.return_date ? dayjs(trip.return_date).format('DD MMM') : '—';
    const actionOrder = {
      continuePlanning: 1,
      details: 2,
      route: 3,
      report: 4,
      travelReport: 5,
      reviseReport: 6,
      duplicate: 7,
      delete: 8,
    };

    return (
      <Col xs={24} md={12} xl={8} key={trip.id}>
        <Card
          hoverable
          onClick={() => {
            if (['draft', 'planning'].includes(tripStatus)) {
              navigate(`/crm/visits/${trip.id}/edit`);
              return;
            }
            navigate(`/crm/visits/${trip.id}`);
          }}
          styles={{ body: { padding: '16px 20px' } }}
          style={{ borderTop: `3px solid ${cfg.color}`, height: '100%' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text strong style={{ fontSize: 15 }} ellipsis>{trip.title}</Text>
              {isManager && trip.rep_name && <Tag color="geekblue" style={{ fontSize: 10, marginLeft: 6 }}>{trip.rep_name}</Tag>}
              <div style={{ marginTop: 4 }}>
                <Tag style={{ background: statusBadgeCfg.bg, color: statusBadgeCfg.color, border: 'none', fontSize: 11 }}>{statusBadgeCfg.label}</Tag>
                {isIntl && <Tag color="blue" style={{ fontSize: 11 }}><GlobalOutlined /> International</Tag>}
                {!isIntl && trip.trip_type === 'local' && <Tag style={{ fontSize: 11 }}><CarOutlined /> Local</Tag>}
                {reportCfg && <Tag color={reportCfg.color} style={{ fontSize: 11 }}>{reportCfg.label}</Tag>}
              </div>
            </div>
            {tripStatus === 'in_progress' && (
              <Button type="primary" size="small" icon={<PlayCircleOutlined />}
                onClick={(e) => { e.stopPropagation(); navigate(`/crm/visits/${trip.id}/in-trip`); }}>
                Continue
              </Button>
            )}
          </div>

          <Space size={16} wrap style={{ marginBottom: 10 }}>
            <Tooltip title="Country">
              <Text type="secondary" style={{ fontSize: 12 }}><EnvironmentOutlined /> {trip.country || 'No country'}</Text>
            </Tooltip>
            <Tooltip title="Trip dates">
              <Text type="secondary" style={{ fontSize: 12 }}><CalendarOutlined /> {depStr} → {retStr}</Text>
            </Tooltip>
          </Space>

          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>Stops: {visited}/{totalStops}</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>{pct}%</Text>
            </div>
            <Progress percent={pct} size="small" showInfo={false} strokeColor={cfg.color} />
          </div>

          <div
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: '1px solid rgba(5, 5, 5, 0.06)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 4,
              rowGap: 2,
            }}
          >
            {['draft', 'planning'].includes(tripStatus) && (
              <Button
                size="small"
                type="text"
                icon={<EditOutlined />}
                style={{ order: actionOrder.continuePlanning }}
                onClick={(e) => { e.stopPropagation(); navigate(`/crm/visits/${trip.id}/edit`); }}
              >
                Continue Planning
              </Button>
            )}
            <Button size="small" type="text" icon={<EyeOutlined />} style={{ order: actionOrder.details }} onClick={(e) => { e.stopPropagation(); navigate(`/crm/visits/${trip.id}`); }}>Details</Button>
            <Button size="small" type="text" icon={<NodeIndexOutlined />} style={{ order: actionOrder.route }} onClick={(e) => { e.stopPropagation(); navigate(`/crm/visits/${trip.id}/route`); }}>Route</Button>
            {['in_progress', 'completed'].includes(tripStatus) && (
              <Button size="small" type="text" icon={<FileTextOutlined />} style={{ order: actionOrder.report }} onClick={(e) => { e.stopPropagation(); navigate(`/crm/visits/${trip.id}/report`); }}>Report</Button>
            )}
            {(reportStatus === 'revision_requested' || reportStatus === 'rejected') && (
              <Button
                size="small"
                type="text"
                danger
                icon={<EditOutlined />}
                style={{ order: actionOrder.reviseReport }}
                onClick={(e) => { e.stopPropagation(); navigate(`/crm/visits/${trip.id}/travel-report`); }}
              >
                Revise Report
              </Button>
            )}
            {['in_progress', 'completed'].includes(tripStatus) && (
              <Button
                size="small"
                type="text"
                icon={<FileTextOutlined />}
                style={{ order: actionOrder.travelReport }}
                onClick={(e) => { e.stopPropagation(); navigate(`/crm/visits/${trip.id}/travel-report`); }}
              >
                Travel Report
              </Button>
            )}
            {['completed', 'cancelled', 'confirmed', 'in_progress'].includes(tripStatus) && (
              <Button size="small" type="text" icon={<CopyOutlined />} style={{ order: actionOrder.duplicate }} onClick={async (e) => {
                e.stopPropagation();
                try {
                  const res = await axios.post(`${API_BASE}/api/crm/field-trips/${trip.id}/clone`, {}, { headers: getAuthHeaders() });
                  const newId = res.data?.data?.id;
                  if (newId) { message.success('Trip duplicated!'); navigate(`/crm/visits/${newId}/edit`); }
                } catch { message.error('Failed to duplicate trip'); }
              }}>Duplicate</Button>
            )}
            {['draft', 'planning', 'cancelled'].includes(tripStatus) && (
              <Popconfirm
                title="Delete this trip?"
                description="This cannot be undone."
                onConfirm={async (e) => {
                  e?.stopPropagation();
                  try {
                    await axios.delete(`${API_BASE}/api/crm/field-trips/${trip.id}`, { headers: getAuthHeaders() });
                    setItems(prev => prev.filter(t => t.id !== trip.id));
                    message.success('Trip deleted');
                  } catch { message.error('Failed to delete trip'); }
                }}
                onCancel={(e) => e?.stopPropagation()}
                okText="Delete"
                okButtonProps={{ danger: true }}
              >
                <Button size="small" type="text" danger icon={<DeleteOutlined />} style={{ order: actionOrder.delete }} onClick={(e) => e.stopPropagation()}>Delete</Button>
              </Popconfirm>
            )}
          </div>
        </Card>
      </Col>
    );
  };

  return (
    <div>
      {/* Header */}
      <div style={{ background: headerGradient, borderRadius: 12, padding: '20px 28px', marginBottom: 20, color: '#fff' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <div>
            <Title level={4} style={{ margin: 0, color: '#fff' }}><CompassOutlined /> Field Visit Trips</Title>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Plan customer visit routes, track outcomes, and create follow-up actions.</Text>
          </div>
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => navigate('/crm/visits/new')}>
            Plan New Trip
          </Button>
        </Space>
      </div>

      {/* Quick Stats */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        {[
          { label: 'Total Trips', value: stats.total, color: '#1677ff' },
          { label: 'Planning', value: stats.planning, color: '#8c8c8c' },
          { label: 'Active', value: stats.active, color: '#fa8c16' },
          { label: 'Completed', value: stats.completed, color: '#52c41a' },
        ].map((s, i) => (
          <Col xs={12} md={6} key={i}>
            <Card size="small" styles={{ body: { padding: '12px 16px', textAlign: 'center' } }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{s.label}</Text>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { padding: '10px 16px' } }}>
        <Space wrap>
          <Input placeholder="Search trips..." prefix={<SearchOutlined />} value={searchText} onChange={e => { setSearchText(e.target.value); setPage(1); }} allowClear style={{ width: 200 }} />
          <Select value={statusFilter} onChange={v => { setStatusFilter(v); setPage(1); }} style={{ minWidth: 150 }} options={STATUS_OPTIONS} />
          <Select value={dateFilter} onChange={v => { setDateFilter(v); setPage(1); }} style={{ minWidth: 150 }} options={DATE_FILTER_OPTIONS} />
          {canFilterByRep && (
            <Select value={repFilter} onChange={v => { setRepFilter(v); setPage(1); }} style={{ minWidth: 160 }}
              options={[{ value: 'all', label: 'All Reps' }, ...salesReps.map(r => ({ value: String(r.value), label: r.label }))]} />
          )}
          {isManager && (
            <Button
              type={showApprovalQueueOnly ? 'primary' : 'default'}
              icon={<CheckCircleOutlined />}
              onClick={() => {
                setShowApprovalQueueOnly((prev) => !prev);
                setPage(1);
              }}
            >
              My Approval Queue
            </Button>
          )}
          <Text type="secondary" style={{ fontSize: 12 }}>{filteredItems.length} trip(s)</Text>
        </Space>
      </Card>

      {error && <Alert type="warning" showIcon message={error} style={{ marginBottom: 16 }} />}

      {/* Trip Cards */}
      {filteredItems.length === 0 ? (
        <Card>
          <Empty description={items.length === 0 ? 'No trips yet. Start by planning your first visit run.' : 'No trips match the current filters.'} image={Empty.PRESENTED_IMAGE_SIMPLE}>
            {null}
          </Empty>
        </Card>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          {isManager && pendingApprovals.length > 0 && (
            <>
              <Title level={5} style={{ margin: 0 }}>Trips Pending My Approval</Title>
              <Row gutter={[12, 12]}>
                {(showApprovalQueueOnly
                  ? pendingApprovals
                  : pendingApprovals.filter((trip) => filteredItems.some((it) => it.id === trip.id))
                ).map(renderTripCard)}
              </Row>
            </>
          )}
          {!showApprovalQueueOnly && planningTrips.length > 0 && (
            <>
              <Title level={5} style={{ margin: 0 }}>Continue Planning</Title>
              <Row gutter={[12, 12]}>{planningTrips.map(renderTripCard)}</Row>
            </>
          )}
          {!showApprovalQueueOnly && activeTrips.length > 0 && (
            <>
              <Title level={5} style={{ margin: 0 }}>Active & Upcoming</Title>
              <Row gutter={[12, 12]}>{activeTrips.map(renderTripCard)}</Row>
            </>
          )}
          {!showApprovalQueueOnly && historyTrips.length > 0 && (
            <>
              <Title level={5} style={{ margin: 0 }}>Past Trips</Title>
              <Row gutter={[12, 12]}>{historyTrips.map(renderTripCard)}</Row>
            </>
          )}
        </Space>
      )}

      {filteredItems.length > PAGE_SIZE && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Pagination current={page} total={filteredItems.length} pageSize={PAGE_SIZE} onChange={setPage} showSizeChanger={false} />
        </div>
      )}
    </div>
  );
};

export default FieldVisitList;
