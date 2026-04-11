/**
 * MyPipeline — Sales rep lifecycle tracker
 *
 * Compact list view: one row per inquiry, customer name as primary.
 * Only shows sales rep name when logged-in user is a manager seeing other reps' inquiries.
 * Action-required only for stages where sales rep must act (not QC/CSE wait stages).
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { CRM_FULL_ACCESS_ROLES } from '../../../utils/roleConstants';
import axios from 'axios';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import './PresalesInquiries.css';

dayjs.extend(relativeTime);

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ── Stage colours ────────────────────────────────────────────────────────────
const STAGE_COLORS = {
  new_inquiry:     { bg: '#f0f5ff', border: '#2f54eb', text: '#1d39c4', icon: '📋' },
  sar_pending:     { bg: '#fff7e6', border: '#fa8c16', text: '#d46b08', icon: '📝' },
  qc_in_progress:  { bg: '#e6f7ff', border: '#1890ff', text: '#096dd9', icon: '🔬' },
  qc_received:     { bg: '#e6fffb', border: '#13c2c2', text: '#08979c', icon: '📥' },
  cse_pending:     { bg: '#f9f0ff', border: '#722ed1', text: '#531dab', icon: '📋' },
  cse_approved:    { bg: '#f6ffed', border: '#52c41a', text: '#389e0d', icon: '✅' },
  estimation:      { bg: '#fff1f0', border: '#f5222d', text: '#cf1322', icon: '🧮' },
  quoted:          { bg: '#e6fffb', border: '#13c2c2', text: '#08979c', icon: '💰' },
  negotiating:     { bg: '#fffbe6', border: '#faad14', text: '#d48806', icon: '🤝' },
  price_accepted:  { bg: '#f6ffed', border: '#52c41a', text: '#389e0d', icon: '🎉' },
  preprod_sample:  { bg: '#e6f7ff', border: '#1890ff', text: '#096dd9', icon: '🏭' },
  preprod_sent:    { bg: '#f9f0ff', border: '#722ed1', text: '#531dab', icon: '📦' },
  sample_approved: { bg: '#f6ffed', border: '#52c41a', text: '#389e0d', icon: '✅' },
  pi_sent:         { bg: '#fff7e6', border: '#fa8c16', text: '#d46b08', icon: '📄' },
  order_confirmed: { bg: '#f6ffed', border: '#52c41a', text: '#389e0d', icon: '📥' },
  in_production:   { bg: '#e6f7ff', border: '#1890ff', text: '#096dd9', icon: '⚙️' },
  ready_dispatch:  { bg: '#e6fffb', border: '#13c2c2', text: '#08979c', icon: '📤' },
  delivered:       { bg: '#f6ffed', border: '#52c41a', text: '#389e0d', icon: '🚚' },
  closed:          { bg: '#fafafa', border: '#d9d9d9', text: '#8c8c8c', icon: '🔒' },
  lost:            { bg: '#fff1f0', border: '#f5222d', text: '#cf1322', icon: '❌' },
  on_hold:         { bg: '#fafafa', border: '#faad14', text: '#d48806', icon: '⏸️' },
};

const DEFAULT_COLOR = { bg: '#fafafa', border: '#d9d9d9', text: '#595959', icon: '📌' };

// ── Compact Stage Badge ──────────────────────────────────────────────────────
function StageBadge({ stage, label }) {
  const c = STAGE_COLORS[stage] || DEFAULT_COLOR;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
      color: c.text, background: c.bg, border: `1px solid ${c.border}`,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: 10 }}>{c.icon}</span>{label || stage}
    </span>
  );
}

// ── Compact Row ──────────────────────────────────────────────────────────────
function PipelineRow({ inquiry, showRep, onDetail }) {
  const c = STAGE_COLORS[inquiry.inquiry_stage] || DEFAULT_COLOR;
  return (
    <div
      onClick={() => onDetail(inquiry.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 12px', borderLeft: `3px solid ${c.border}`,
        background: '#fff', cursor: 'pointer',
        borderBottom: '1px solid #f5f5f5',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#fafafa'; }}
      onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
    >
      {/* Customer name — primary */}
      <span style={{ fontWeight: 600, fontSize: 13, color: '#262626', minWidth: 140, flex: 1 }}>
        {inquiry.customer_name || '—'}
        {inquiry.priority === 'high' && <span style={{ color: '#f5222d', marginLeft: 4, fontSize: 11 }}>🔥</span>}
      </span>

      {/* Country */}
      <span style={{ fontSize: 11, color: '#8c8c8c', minWidth: 60 }}>
        {inquiry.customer_country || ''}
      </span>

      {/* Product group */}
      <span style={{ fontSize: 11, color: '#8c8c8c', minWidth: 80, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {Array.isArray(inquiry.product_groups) ? inquiry.product_groups.join(', ') : ''}
      </span>

      {/* Sales rep — only for managers */}
      {showRep && (
        <span style={{ fontSize: 11, color: '#8c8c8c', minWidth: 80, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {inquiry.sales_rep_group_name || ''}
        </span>
      )}

      {/* Days in stage warning */}
      {inquiry.days_in_stage > 3 && (
        <span style={{ fontSize: 10, color: inquiry.days_in_stage > 7 ? '#f5222d' : '#fa8c16', whiteSpace: 'nowrap' }}>
          {inquiry.days_in_stage}d
        </span>
      )}

      {/* Last activity */}
      <span style={{ fontSize: 10, color: '#bfbfbf', minWidth: 70, textAlign: 'right', whiteSpace: 'nowrap' }}>
        {inquiry.last_activity_at ? dayjs(inquiry.last_activity_at).fromNow() : ''}
      </span>

      {/* Stage badge */}
      <StageBadge stage={inquiry.inquiry_stage} label={inquiry.stage_meta?.label} />
    </div>
  );
}

// ── Summary Stat Card ────────────────────────────────────────────────────────
function StatCard({ label, count, color, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 14px', borderRadius: 8,
        border: active ? `2px solid ${color}` : '1px solid #f0f0f0',
        background: active ? `${color}11` : '#fff',
        cursor: 'pointer', minWidth: 80, textAlign: 'center',
        transition: 'all 0.2s',
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{count}</div>
      <div style={{ fontSize: 10, color: '#8c8c8c', marginTop: 1 }}>{label}</div>
    </button>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function MyPipeline() {
  const { user } = useAuth();
  const navigate = useNavigate();
  // Level 6+: can see all sales reps
  const userLevel = Number(user?.designation_level) || 0;
  const isManager = CRM_FULL_ACCESS_ROLES.includes(user?.role) && userLevel >= 6;

  const [inquiries, setInquiries] = useState([]);
  const [stats, setStats] = useState({ stages: {}, total: 0, action_required: 0 });
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showClosed, setShowClosed] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [pipeRes, statsRes] = await Promise.all([
        axios.get(`${API_BASE}/api/mes/presales/pipeline`, {
          params: { include_closed: showClosed ? 'true' : 'false' },
        }),
        axios.get(`${API_BASE}/api/mes/presales/pipeline/stats`),
      ]);
      setInquiries(pipeRes.data.data || []);
      setStages(pipeRes.data.stages || []);
      setStats(statsRes.data.data || { stages: {}, total: 0, action_required: 0 });
    } catch (err) {
      console.error('Pipeline fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [showClosed]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Check if manager sees multiple reps
  const hasMultipleReps = useMemo(() => {
    if (!isManager) return false;
    const reps = new Set(inquiries.map(i => i.sales_rep_group_name).filter(Boolean));
    return reps.size > 1;
  }, [isManager, inquiries]);

  // Filtered list
  const filtered = useMemo(() => {
    let list = inquiries;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(i =>
        (i.inquiry_number || '').toLowerCase().includes(q) ||
        (i.customer_name || '').toLowerCase().includes(q) ||
        (i.customer_country || '').toLowerCase().includes(q)
      );
    }
    if (filter === 'action') {
      list = list.filter(i => i.action_required);
    } else if (filter !== 'all') {
      list = list.filter(i => i.inquiry_stage === filter);
    }
    return list;
  }, [inquiries, filter, searchTerm]);

  // Group: Waiting (QC/CSE) | Action Required | In Progress | Completed
  const grouped = useMemo(() => {
    const waiting = [];
    const action = [];
    const inProgress = [];
    const completed = [];
    const held = [];

    for (const inq of filtered) {
      const g = inq.stage_meta?.group;
      if (inq.inquiry_stage === 'on_hold') held.push(inq);
      else if (inq.inquiry_stage === 'lost') completed.push(inq);
      else if (g === 'waiting') waiting.push(inq);
      else if (g === 'action') action.push(inq);
      else if (g === 'completed') completed.push(inq);
      else inProgress.push(inq);
    }
    return { waiting, action, inProgress, completed, held };
  }, [filtered]);

  const activeStages = useMemo(() => {
    return stages.filter(s => stats.stages[s.key] > 0);
  }, [stages, stats]);

  const activeStageLabel = useMemo(() => {
    if (!filter || filter === 'all' || filter === 'action') return '';
    return stages.find(s => s.key === filter)?.label || filter.replace(/_/g, ' ');
  }, [filter, stages]);

  const emptyState = useMemo(() => {
    if (searchTerm.trim()) {
      return {
        icon: '🔎',
        title: `No matches for "${searchTerm.trim()}"`,
        subtitle: 'Try a different keyword or clear search',
        primaryLabel: 'Clear search',
        onPrimary: () => setSearchTerm(''),
      };
    }

    if (filter === 'action') {
      return {
        icon: '✅',
        title: 'No action-required inquiries right now',
        subtitle: 'Everything currently in your pipeline is waiting or progressing normally',
        primaryLabel: 'View all pipeline',
        onPrimary: () => setFilter('all'),
      };
    }

    if (filter !== 'all') {
      return {
        icon: '🧭',
        title: `No inquiries in ${activeStageLabel}`,
        subtitle: 'Pick another stage filter to continue reviewing your pipeline',
        primaryLabel: 'View all pipeline',
        onPrimary: () => setFilter('all'),
      };
    }

    return {
      icon: '📭',
      title: 'No inquiries found',
      subtitle: 'Create your first inquiry to start tracking the lifecycle',
      primaryLabel: 'Create your first inquiry',
      onPrimary: () => navigate('/mes/inquiries/new'),
    };
  }, [searchTerm, filter, activeStageLabel, navigate]);

  return (
    <div style={{ padding: '16px 24px', maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, color: '#262626' }}>My Pipeline</h2>
          <span style={{ fontSize: 11, color: '#8c8c8c' }}>Track every inquiry from SAR to delivery</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => navigate('/mes/inquiries/new')} style={btnPrimary}>+ New Inquiry</button>
          <button onClick={() => navigate('/mes/inquiries')} style={btnDefault}>← Kanban Board</button>
          <button onClick={fetchData} style={{ ...btnDefault, padding: '5px 8px' }}>↻</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12, paddingBottom: 2 }}>
        <StatCard label="Total Active" count={stats.total} color="#1890ff" active={filter === 'all'} onClick={() => setFilter('all')} />
        <StatCard label="Action Required" count={stats.action_required} color="#fa8c16" active={filter === 'action'} onClick={() => setFilter('action')} />
        {activeStages.map(s => (
          <StatCard key={s.key} label={s.label} count={stats.stages[s.key] || 0} color={STAGE_COLORS[s.key]?.border || '#d9d9d9'} active={filter === s.key} onClick={() => setFilter(filter === s.key ? 'all' : s.key)} />
        ))}
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          placeholder="Search inquiry, customer…"
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          style={{ flex: 1, padding: '5px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #d9d9d9', outline: 'none' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#8c8c8c', cursor: 'pointer' }}>
          <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} />
          Show closed
        </label>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 30, color: '#bfbfbf', fontSize: 13 }}>Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#bfbfbf' }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>{emptyState.icon}</div>
          <div style={{ fontSize: 13, color: '#595959', fontWeight: 600 }}>{emptyState.title}</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>{emptyState.subtitle}</div>
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button onClick={emptyState.onPrimary} style={btnPrimary}>{emptyState.primaryLabel}</button>
            {(searchTerm || filter !== 'all') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilter('all');
                }}
                style={btnDefault}
              >
                Reset filters
              </button>
            )}
          </div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <>
          {/* Waiting for others (QC, CSE) */}
          {grouped.waiting.length > 0 && (
            <RowSection title="⏳ Waiting on QC / CSE" count={grouped.waiting.length} color="#1890ff"
              inquiries={grouped.waiting} showRep={hasMultipleReps} onDetail={id => navigate(`/mes/inquiries/${id}`)} />
          )}

          {/* Action Required — sales rep must act */}
          {grouped.action.length > 0 && (
            <RowSection title="🔔 Your Action Required" count={grouped.action.length} color="#fa8c16"
              inquiries={grouped.action} showRep={hasMultipleReps} onDetail={id => navigate(`/mes/inquiries/${id}`)} />
          )}

          {/* In Progress */}
          {grouped.inProgress.length > 0 && (
            <RowSection title="▶ In Progress" count={grouped.inProgress.length} color="#1890ff"
              inquiries={grouped.inProgress} showRep={hasMultipleReps} onDetail={id => navigate(`/mes/inquiries/${id}`)} />
          )}

          {/* On Hold */}
          {grouped.held.length > 0 && (
            <RowSection title="⏸️ On Hold" count={grouped.held.length} color="#faad14"
              inquiries={grouped.held} showRep={hasMultipleReps} onDetail={id => navigate(`/mes/inquiries/${id}`)} collapsed />
          )}

          {/* Completed */}
          {grouped.completed.length > 0 && (
            <RowSection title="✅ Completed" count={grouped.completed.length} color="#52c41a"
              inquiries={grouped.completed} showRep={hasMultipleReps} onDetail={id => navigate(`/mes/inquiries/${id}`)} collapsed />
          )}
        </>
      )}
    </div>
  );
}

// ── Section with compact rows ────────────────────────────────────────────────
function RowSection({ title, count, color, inquiries, showRep, onDetail, collapsed: defaultCollapsed = false }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div style={{ marginBottom: 14 }}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 0', border: 'none', background: 'none',
          cursor: 'pointer', width: '100%', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: '#262626' }}>{title}</span>
        <span style={{ padding: '0 7px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: color, color: '#fff' }}>{count}</span>
        <span style={{ fontSize: 11, color: '#bfbfbf', marginLeft: 'auto' }}>{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && (
        <div style={{ borderRadius: 6, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
          {inquiries.map(inq => (
            <PipelineRow key={inq.id} inquiry={inq} showRep={showRep} onDetail={onDetail} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Button styles ────────────────────────────────────────────────────────────
const btnPrimary = {
  padding: '5px 12px', fontSize: 12, fontWeight: 600,
  borderRadius: 6, border: 'none',
  background: '#1890ff', color: '#fff', cursor: 'pointer',
};
const btnDefault = {
  padding: '5px 12px', fontSize: 12,
  borderRadius: 6, border: '1px solid #d9d9d9',
  background: '#fff', color: '#595959', cursor: 'pointer',
};
