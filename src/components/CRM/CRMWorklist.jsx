import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Card, Tabs, Table, Space, Tag, Spin, Empty, Alert, Input, Segmented, Button, Tooltip, Badge } from 'antd';
import {
  CalendarOutlined, CheckSquareOutlined, PhoneOutlined, FunnelPlotOutlined,
  ReloadOutlined, ArrowRightOutlined, ArrowLeftOutlined,
  ClockCircleOutlined, ExclamationCircleOutlined, EnvironmentOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import axios from 'axios';
import './CRM.css';
import { DEAL_STAGES } from './CRMDashboardUtils';
import WorklistDetailDrawer from './WorklistDetailDrawer';

const API = import.meta.env.VITE_API_URL ?? '';

const TYPE_OPTIONS = ['tasks', 'meetings', 'calls', 'deals'];

const TYPE_META = {
  tasks: { label: 'Tasks', icon: <CheckSquareOutlined /> },
  meetings: { label: 'Meetings', icon: <CalendarOutlined /> },
  calls: { label: 'Calls', icon: <PhoneOutlined /> },
  deals: { label: 'Deals', icon: <FunnelPlotOutlined /> },
};

const PRIORITY_COLORS = { urgent: '#ff4d4f', high: '#fa8c16', medium: '#1677ff', low: '#8c8c8c' };
const STAGE_COLORS = {};
DEAL_STAGES.forEach(s => { STAGE_COLORS[s.value] = s.color; });
const REQUEST_TIMEOUT = 10000;

const getAuthHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
});

const CRMWorklist = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const searchRef = useRef(null);
  const [type, setType] = useState('tasks');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [saveBusy, setSaveBusy] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const appliedDefaultsRef = useRef(new Set());
  const prefCacheRef = useRef({});
  const locationRef = useRef(location);
  locationRef.current = location;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  useEffect(() => {
    const qp = new URLSearchParams(location.search);
    const qType = qp.get('type');
    const qStatus = qp.get('status');
    const qSearch = qp.get('q');
    setType(TYPE_OPTIONS.includes(qType) ? qType : 'tasks');
    setStatusFilter(qStatus || 'all');
    setSearch(qSearch || '');
  }, [location.search]);

  // Auto-open drawer for highlighted record after data loads
  const highlightIdRef = useRef(null);
  useEffect(() => {
    const qp = new URLSearchParams(location.search);
    highlightIdRef.current = qp.get('highlight') ? parseInt(qp.get('highlight'), 10) : null;
  }, [location.search]);

  useEffect(() => {
    if (highlightIdRef.current && rows.length > 0 && !drawerOpen) {
      const match = rows.find(r => r.id === highlightIdRef.current);
      if (match) {
        setSelectedRecord(match);
        setDrawerOpen(true);
        highlightIdRef.current = null; // only auto-open once
      }
    }
  }, [rows, drawerOpen]);

  const updateUrl = useCallback((next = {}) => {
    const qp = new URLSearchParams(location.search);
    Object.entries(next).forEach(([key, value]) => {
      if (!value || value === 'all') qp.delete(key);
      else qp.set(key, value);
    });
    if (!qp.get('type')) qp.set('type', type);
    navigate(`/crm/worklist?${qp.toString()}`);
  }, [location.search, navigate, type]);

  const setTypeInUrl = useCallback((nextType) => {
    navigate(`/crm/worklist?type=${nextType}`);
  }, [navigate]);

  const loadDefaultPreference = useCallback(async (listType) => {
    const qp = new URLSearchParams(locationRef.current.search);
    if (qp.has('status') || qp.has('q')) return;
    if (appliedDefaultsRef.current.has(listType)) return;

    // Return cached preference if available
    if (prefCacheRef.current[listType] !== undefined) {
      appliedDefaultsRef.current.add(listType);
      const pref = prefCacheRef.current[listType];
      if (!pref) return;
      const nextStatus = pref.default_status || 'all';
      const nextQuery = pref.default_query || '';
      if ((nextStatus === 'all' || !nextStatus) && !nextQuery) return;
      setStatusFilter(nextStatus);
      setSearch(nextQuery);
      updateUrl({ status: nextStatus, q: nextQuery });
      return;
    }

    try {
      const res = await axios.get(`${API}/api/crm/worklist/preferences`, {
        headers: getAuthHeaders(),
        params: { type: listType },
        timeout: REQUEST_TIMEOUT,
      });

      const pref = res.data?.data;
      prefCacheRef.current[listType] = pref || null;
      appliedDefaultsRef.current.add(listType);
      if (!pref) return;

      const nextStatus = pref.default_status || 'all';
      const nextQuery = pref.default_query || '';
      if ((nextStatus === 'all' || !nextStatus) && !nextQuery) return;

      setStatusFilter(nextStatus);
      setSearch(nextQuery);
      updateUrl({ status: nextStatus, q: nextQuery });
    } catch (_) {
      appliedDefaultsRef.current.add(listType);
    }
  }, [updateUrl]);

  useEffect(() => {
    loadDefaultPreference(type);
  }, [type, loadDefaultPreference]);

  const saveDefaultPreference = async () => {
    try {
      setSaveBusy(true);
      await axios.put(
        `${API}/api/crm/worklist/preferences/${type}`,
        {
          status: statusFilter === 'all' ? null : statusFilter,
          q: search.trim() || null,
        },
        { headers: getAuthHeaders(), timeout: REQUEST_TIMEOUT }
      );
      message.success('Default view saved');
    } catch (_) {
      message.error('Failed to save default view');
    } finally {
      setSaveBusy(false);
    }
  };

  const clearDefaultPreference = async () => {
    try {
      setClearBusy(true);
      await axios.delete(`${API}/api/crm/worklist/preferences/${type}`, { headers: getAuthHeaders(), timeout: REQUEST_TIMEOUT });
      message.success('Default view cleared');
    } catch (_) {
      message.error('Failed to clear default view');
    } finally {
      setClearBusy(false);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getAuthHeaders();
      let endpoint = '/api/crm/tasks';
      let params = {};

      if (type === 'tasks') {
        endpoint = '/api/crm/tasks';
        if (statusFilter !== 'all') params.status = statusFilter;
      } else if (type === 'meetings') {
        endpoint = '/api/crm/meetings';
        params = { limit: 100 };
        if (statusFilter !== 'all') params.status = statusFilter;
      } else if (type === 'calls') {
        endpoint = '/api/crm/calls';
        params = { limit: 100 };
        if (statusFilter !== 'all') params.status = statusFilter;
      } else if (type === 'deals') {
        endpoint = '/api/crm/deals';
        if (statusFilter !== 'all') params.stage = statusFilter;
      }

      const res = await axios.get(`${API}${endpoint}`, { headers, params, timeout: REQUEST_TIMEOUT });
      const data = Array.isArray(res.data?.data) ? res.data.data : [];
      setRows(data);
    } catch (e) {
      setRows([]);
      setError('Failed to load list data. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [type, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const haystack = [
        row.title,
        row.name,
        row.inquiry_number,
        row.customer_name,
        row.prospect_name,
        row.stage,
        row.status,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search]);

  const filteredRowsRef = useRef(filteredRows);
  filteredRowsRef.current = filteredRows;
  const focusedIndexRef = useRef(focusedIndex);
  focusedIndexRef.current = focusedIndex;

  useEffect(() => {
    const onKeyDown = (e) => {
      const key = String(e.key || '').toLowerCase();
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

      if (key === '/' && !isInput) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.altKey && ['1', '2', '3', '4'].includes(key)) {
        e.preventDefault();
        const map = { '1': 'tasks', '2': 'meetings', '3': 'calls', '4': 'deals' };
        setTypeInUrl(map[key]);
        return;
      }
      if (isInput) return;

      const len = filteredRowsRef.current.length;
      if (!len) return;
      const idx = focusedIndexRef.current;

      if (key === 'arrowdown' || key === 'j') {
        e.preventDefault();
        setFocusedIndex(idx < len - 1 ? idx + 1 : 0);
      } else if (key === 'arrowup' || key === 'k') {
        e.preventDefault();
        setFocusedIndex(idx > 0 ? idx - 1 : len - 1);
      } else if (key === 'enter' && idx >= 0 && idx < len) {
        e.preventDefault();
        openDetail(filteredRowsRef.current[idx]);
      } else if (key === 'escape') {
        if (drawerOpen) setDrawerOpen(false);
        else setFocusedIndex(-1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const hasLinkedTarget = useCallback((record) => {
    const inquiryId = record?.inquiry_id || record?.inquiryId;
    if (inquiryId) return true;
    if (record?.customer_id) return true;
    if (record?.prospect_id) return true;
    return false;
  }, []);

  const goToLinkedRecord = useCallback((record) => {
    const inquiryId = record?.inquiry_id || record?.inquiryId;

    if (type === 'deals') {
      if (inquiryId) {
        navigate(`/crm/inquiries/${inquiryId}`);
        return;
      }
      if (record?.customer_id) {
        navigate(`/crm/customers/${record.customer_id}`);
        return;
      }
      if (record?.prospect_id) {
        navigate(`/crm/prospects?highlight=${record.prospect_id}`);
        return;
      }
      message.warning('No linked record is available for this deal.');
      return;
    }

    if (inquiryId) {
      navigate(`/crm/inquiries/${inquiryId}`);
      return;
    }
    if (record?.customer_id) {
      navigate(`/crm/customers/${record.customer_id}`);
      return;
    }
    if (record?.prospect_id) {
      navigate(`/crm/prospects?highlight=${record.prospect_id}`);
      return;
    }

    message.warning('No linked customer, inquiry, or prospect to open.');
  }, [navigate, type]);

  const openDetail = useCallback((record) => {
    setSelectedRecord(record);
    setDrawerOpen(true);
  }, []);

  const columns = useMemo(() => {
    const actionCol = {
      title: '',
      key: 'action',
      width: 80,
      render: (_, r) => {
        const linked = hasLinkedTarget(r);
        return (
          <Space size={4}>
            <Tooltip title="View details">
              <Button type="text" size="small" icon={<EyeOutlined />} onClick={(e) => { e.stopPropagation(); openDetail(r); }} />
            </Tooltip>
            {linked && (
              <Tooltip title={`Open ${r.customer_name || r.prospect_name || 'linked record'}`}>
                <Button type="text" size="small" icon={<ArrowRightOutlined />} onClick={(e) => { e.stopPropagation(); goToLinkedRecord(r); }} />
              </Tooltip>
            )}
          </Space>
        );
      },
    };

    if (type === 'tasks') {
      const isOverdue = (r) => {
        const s = r.computed_status || r.status;
        return s === 'overdue' || (r.due_date && dayjs(r.due_date).isBefore(dayjs(), 'day') && s !== 'completed');
      };
      return [
        {
          title: 'Task',
          dataIndex: 'title',
          key: 'title',
          render: (v, r) => (
            <Space size={6}>
              <span className="wl-row-title">{v}</span>
              {isOverdue(r) && <Tag color="error" icon={<ExclamationCircleOutlined />} style={{ fontSize: 10, margin: 0 }}>Overdue</Tag>}
            </Space>
          ),
        },
        {
          title: 'Status',
          key: 'status',
          width: 120,
          render: (_, r) => {
            const status = r.computed_status || r.status || 'open';
            const color = status === 'overdue' ? 'red' : status === 'completed' ? 'green' : 'orange';
            return <Tag color={color}>{status}</Tag>;
          },
        },
        {
          title: 'Priority',
          dataIndex: 'priority',
          key: 'priority',
          width: 100,
          render: (v) => v ? <Tag color={PRIORITY_COLORS[v] || '#8c8c8c'} style={{ color: '#fff' }}>{v}</Tag> : '—',
        },
        {
          title: 'Due',
          dataIndex: 'due_date',
          key: 'due_date',
          width: 120,
          sorter: (a, b) => (a.due_date || '').localeCompare(b.due_date || ''),
          render: (v, r) => {
            const overdue = isOverdue(r);
            return v ? <span style={overdue ? { color: '#ff4d4f', fontWeight: 600 } : undefined}>{dayjs(v).format('DD MMM YYYY')}</span> : '—';
          },
        },
        {
          title: 'Linked To',
          key: 'linked',
          ellipsis: true,
          render: (_, r) => r.customer_name || r.prospect_name || <span className="wl-row-dim">Not linked</span>,
        },
        actionCol,
      ];
    }

    if (type === 'meetings') {
      return [
        {
          title: 'Meeting',
          dataIndex: 'name',
          key: 'name',
          render: (v, r) => {
            const missed = (r.status || 'planned') === 'planned' && r.date_start && dayjs(r.date_start).isBefore(dayjs(), 'hour');
            return (
              <Space size={6}>
                <span className="wl-row-title">{v}</span>
                {missed && <Tag color="error" icon={<ExclamationCircleOutlined />} style={{ fontSize: 10, margin: 0 }}>Missed</Tag>}
              </Space>
            );
          },
        },
        {
          title: 'Status',
          dataIndex: 'status',
          key: 'status',
          width: 120,
          render: (v) => {
            const s = v || 'planned';
            const color = s === 'held' ? 'green' : s === 'canceled' ? 'default' : s === 'not_held' ? 'default' : 'blue';
            return <Tag color={color}>{s}</Tag>;
          },
        },
        {
          title: 'Date',
          dataIndex: 'date_start',
          key: 'date_start',
          width: 160,
          sorter: (a, b) => (a.date_start || '').localeCompare(b.date_start || ''),
          render: (v) => v ? dayjs(v).format('DD MMM YYYY HH:mm') : '—',
        },
        {
          title: 'Duration',
          dataIndex: 'duration_mins',
          key: 'duration_mins',
          width: 90,
          render: (v) => v ? <span>{v} min</span> : '—',
        },
        {
          title: 'Location',
          dataIndex: 'location',
          key: 'location',
          width: 140,
          ellipsis: true,
          render: (v) => v ? <Space size={4}><EnvironmentOutlined style={{ color: '#8c8c8c' }} />{v}</Space> : <span className="wl-row-dim">—</span>,
        },
        {
          title: 'Linked To',
          key: 'linked',
          ellipsis: true,
          render: (_, r) => r.customer_name || r.prospect_name || <span className="wl-row-dim">Not linked</span>,
        },
        actionCol,
      ];
    }

    if (type === 'calls') {
      return [
        {
          title: 'Call',
          dataIndex: 'name',
          key: 'name',
          render: (v, r) => {
            const missed = (r.status || 'planned') === 'planned' && r.date_start && dayjs(r.date_start).isBefore(dayjs(), 'hour');
            return (
              <Space size={6}>
                <span className="wl-row-title">{v}</span>
                {missed && <Tag color="error" icon={<ExclamationCircleOutlined />} style={{ fontSize: 10, margin: 0 }}>Missed</Tag>}
              </Space>
            );
          },
        },
        {
          title: 'Status',
          dataIndex: 'status',
          key: 'status',
          width: 120,
          render: (v) => {
            const s = v || 'planned';
            const color = s === 'held' ? 'green' : s === 'canceled' ? 'default' : 'blue';
            return <Tag color={color}>{s}</Tag>;
          },
        },
        {
          title: 'Direction',
          dataIndex: 'direction',
          key: 'direction',
          width: 110,
          render: (v) => <Tag color={v === 'inbound' ? 'cyan' : 'purple'}>{v || 'outbound'}</Tag>,
        },
        {
          title: 'Date',
          dataIndex: 'date_start',
          key: 'date_start',
          width: 160,
          sorter: (a, b) => (a.date_start || '').localeCompare(b.date_start || ''),
          render: (v) => v ? dayjs(v).format('DD MMM YYYY HH:mm') : '—',
        },
        {
          title: 'Duration',
          dataIndex: 'duration_mins',
          key: 'duration_mins',
          width: 90,
          render: (v) => v ? <span>{v} min</span> : '—',
        },
        {
          title: 'Linked To',
          key: 'linked',
          ellipsis: true,
          render: (_, r) => r.customer_name || r.prospect_name || <span className="wl-row-dim">Not linked</span>,
        },
        actionCol,
      ];
    }

    // Deals
    return [
      {
        title: 'Deal',
        dataIndex: 'title',
        key: 'title',
        render: (v) => <span className="wl-row-title">{v}</span>,
      },
      {
        title: 'Stage',
        dataIndex: 'stage',
        key: 'stage',
        width: 140,
        render: (v) => <Tag color={STAGE_COLORS[v] || 'blue'}>{v || 'interest'}</Tag>,
      },
      {
        title: 'Customer',
        dataIndex: 'customer_name',
        key: 'customer_name',
        ellipsis: true,
        render: (v) => v || <span className="wl-row-dim">Not linked</span>,
      },
      {
        title: 'Expected Close',
        dataIndex: 'expected_close_date',
        key: 'expected_close_date',
        width: 140,
        sorter: (a, b) => (a.expected_close_date || '').localeCompare(b.expected_close_date || ''),
        render: (v, r) => {
          const openStages = ['interest', 'qualified', 'proposal', 'negotiation'];
          const overdue = v && dayjs(v).isBefore(dayjs(), 'day') && openStages.includes(r.stage);
          return v ? <span style={overdue ? { color: '#ff4d4f', fontWeight: 600 } : undefined}>{dayjs(v).format('DD MMM YYYY')}</span> : '—';
        },
      },
      {
        title: 'Value',
        dataIndex: 'estimated_value',
        key: 'estimated_value',
        width: 130,
        align: 'right',
        sorter: (a, b) => (parseFloat(a.estimated_value) || 0) - (parseFloat(b.estimated_value) || 0),
        render: (v, r) => v ? <span className="wl-row-value">{r.currency || 'AED'} {Number(v).toLocaleString()}</span> : '—',
      },
      actionCol,
    ];
  }, [type, openDetail, goToLinkedRecord, hasLinkedTarget]);

  const statusOptions = useMemo(() => {
    if (type === 'tasks') return ['all', 'open', 'overdue', 'completed'];
    // NEW-04 fix: Derive from shared DEAL_STAGES constant
    if (type === 'deals') return ['all', ...DEAL_STAGES.map(s => s.value)];
    return ['all', 'planned', 'held', 'canceled', 'not_held'];
  }, [type]);

  return (
    <div className="wl-page">

      {/* ── Back link ── */}
      <div className="wl-back-row">
        <Button type="link" icon={<ArrowLeftOutlined />} size="small" onClick={() => navigate('/crm')} className="wl-back-btn">
          Back to Home
        </Button>
      </div>

      {/* ── Toolbar Card ── */}
      <Card size="small" className="crm-home-panel wl-toolbar-card">
        <Tabs
          activeKey={type}
          onChange={setTypeInUrl}
          items={TYPE_OPTIONS.map((k) => ({
            key: k,
            label: (
              <Space size={6}>
                {TYPE_META[k].icon}
                <span>{TYPE_META[k].label}</span>
                {!loading && type === k && (
                  <Badge count={filteredRows.length} style={{ backgroundColor: '#f0f0f0', color: '#666', fontSize: 10, boxShadow: 'none', marginLeft: 4 }} overflowCount={999} />
                )}
              </Space>
            ),
          }))}
          className="wl-tabs"
        />

        <div className="wl-filter-bar">
          <Input.Search
            ref={searchRef}
            allowClear
            placeholder={`Search ${TYPE_META[type].label.toLowerCase()}... (press /)`}
            value={search}
            onChange={(e) => {
              const value = e.target.value;
              setSearch(value);
              updateUrl({ q: value });
            }}
            onSearch={(value) => updateUrl({ q: value })}
            className="wl-search-input"
          />

          <div className="wl-filter-right">
            <Segmented
              options={statusOptions.map(s => ({
                label: <span className="wl-seg-label">{s === 'all' ? 'All' : s.replace('_', ' ')}</span>,
                value: s,
              }))}
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v);
                updateUrl({ status: v });
              }}
              size="small"
              className="wl-segmented"
            />

            <div className="wl-pref-btns">
              <Tooltip title="Save current filters as your default view for this tab">
                <Button size="small" onClick={saveDefaultPreference} loading={saveBusy} className="wl-pref-btn">Save default</Button>
              </Tooltip>
              <Tooltip title="Clear your saved default and show all">
                <Button size="small" onClick={clearDefaultPreference} loading={clearBusy} className="wl-pref-btn">Clear default</Button>
              </Tooltip>
            </div>

            <Tooltip title="Refresh list (current filters)">
              <Button size="small" icon={<ReloadOutlined />} onClick={loadData} className="wl-refresh-btn" />
            </Tooltip>
          </div>
        </div>
      </Card>

      {/* ── Error ── */}
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}

      {/* ── Table Card ── */}
      <Card size="small" className="crm-home-panel wl-table-card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /></div>
        ) : filteredRows.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={(statusFilter !== 'all' || search.trim()) ? `No ${TYPE_META[type].label.toLowerCase()} match your current filters` : `No ${TYPE_META[type].label.toLowerCase()} found`}
            style={{ padding: 40 }}
          />
        ) : (
          <Table
            rowKey={(r) => r.id}
            dataSource={filteredRows}
            columns={columns}
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} items` }}
            scroll={{ x: true }}
            className="wl-table"
            onRow={(record, rowIndex) => ({
              onClick: () => { setFocusedIndex(rowIndex); openDetail(record); },
              onKeyDown: (e) => e.key === 'Enter' && openDetail(record),
              tabIndex: 0,
              style: { cursor: 'pointer' },
            })}
            rowClassName={(r, rowIndex) => {
              const classes = [];
              if (rowIndex === focusedIndex) classes.push('wl-row-focused');
              if (type === 'tasks') {
                const s = r.computed_status || r.status;
                if (s === 'overdue' || (r.due_date && dayjs(r.due_date).isBefore(dayjs(), 'day') && s !== 'completed')) classes.push('wl-row-overdue');
                if (s === 'completed') classes.push('wl-row-completed');
              }
              if ((type === 'meetings' || type === 'calls') && r.date_start) {
                const s = r.status || 'planned';
                if (s === 'planned' && dayjs(r.date_start).isBefore(dayjs(), 'hour')) classes.push('wl-row-overdue');
                if (s === 'held') classes.push('wl-row-completed');
                if (s === 'canceled' || s === 'not_held') classes.push('wl-row-completed');
              }
              if (type === 'deals' && r.stage === 'won') classes.push('wl-row-won');
              if (type === 'deals' && r.stage === 'lost') classes.push('wl-row-lost');
              return classes.join(' ');
            }}
          />
        )}
      </Card>

      {/* ── Detail Drawer ── */}
      <WorklistDetailDrawer
        open={drawerOpen}
        record={selectedRecord}
        type={type}
        onClose={() => setDrawerOpen(false)}
        onUpdated={() => { setDrawerOpen(false); loadData(); }}
        onNavigate={(r) => { setDrawerOpen(false); goToLinkedRecord(r); }}
      />
    </div>
  );
};

export default CRMWorklist;
