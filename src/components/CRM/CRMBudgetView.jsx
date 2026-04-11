/**
 * CRMBudgetView — Budget Achievement Dashboard
 *
 * Shows Actual (current year) vs Budget (same year) by:
 *   • Product Group (with item_group_overrides + product_group_exclusions applied server-side)
 *   • Customer
 *
 * Layout:
 *   Header → Controls (year / sales rep / metric) → KPI Cards
 *   → Tabs [By Product Group | By Customer]
 *     → Sticky HTML table (monthly Act | Bud | % columns + Total)
 *     → ECharts bar chart (top 10 by budget)
 *
 * Data sources (all via the new /api/budget-achievement-report endpoint):
 *   - Actual: fp_actualcommon  (item_group_overrides applied, exclusions applied)
 *   - Budget: fp_budget_unified, budget_type = 'SALES_REP' (exclusions applied)
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Tabs, Spin, Empty, Select, Segmented, Input, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import {
  AppstoreOutlined, TeamOutlined, SearchOutlined,
  ArrowUpOutlined, ArrowDownOutlined, DashOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { useAuth } from '../../contexts/AuthContext';

import { useCurrency } from '../../contexts/CurrencyContext';
import CurrencySymbol from '../common/CurrencySymbol';

const { Option } = Select;
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';
const CURRENT_YEAR  = new Date().getFullYear();

/* ─────────────────────────────────────── helpers ── */

const fmt = (v, decimals = 2) =>
  (parseFloat(v) || 0).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });

const fmtMT  = (v) => fmt(v, 2);
const fmtAmt = (v) => {
  const n = parseFloat(v) || 0;
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(0);
};

const deltaLabel = (actual, budget) => {
  const a = parseFloat(actual) || 0;
  const b = parseFloat(budget) || 0;
  if (a === 0 && b === 0) return '—';
  if (b === 0 && a > 0)   return '+∞';
  const d = ((a - b) / b) * 100;
  const sign = d > 0 ? '+' : '';
  return sign + d.toFixed(1) + '%';
};

const deltaPct = (actual, budget) => {
  const a = parseFloat(actual) || 0;
  const b = parseFloat(budget) || 0;
  if (b === 0) return null;
  return ((a - b) / b) * 100;
};

/* ─────────────────── working-day pace helpers ── */

/**
 * Count working days (Mon–Fri) in a date range [start, end] inclusive.
 */
const countWorkingDays = (start, end) => {
  let count = 0;
  let d = start.startOf('day');
  const last = end.startOf('day');
  while (d.isBefore(last) || d.isSame(last, 'day')) {
    const dow = d.day(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) count++;
    d = d.add(1, 'day');
  }
  return count;
};

/**
 * Compute pace for a product group in the current month of the selected year.
 * Returns { salesPct, timePct, onTrack } or null when pace cannot be computed.
 *
 * salesPct  = actualSales / budgetTarget  (for the current month)
 * timePct   = elapsedWorkingDays / totalWorkingDays (for the current month)
 * onTrack   = salesPct >= timePct
 */
const computePace = (row, metric, selectedYear) => {
  const now = dayjs();
  const currentMonth = now.month() + 1; // 1-based
  const currentYear = now.year();

  // Only show pace for the current month of the current year
  if (selectedYear !== currentYear) return null;

  const mData = row.months?.[currentMonth];
  if (!mData) return null;

  const actual = parseFloat(metric === 'kgs' ? mData.actual_mt : mData.actual_amount) || 0;
  const budget = parseFloat(metric === 'kgs' ? mData.budget_mt : mData.budget_amount) || 0;

  if (budget <= 0) return null;

  const monthStart = dayjs().startOf('month');
  const monthEnd   = dayjs().endOf('month');
  const today      = dayjs();

  const totalWorkingDays   = countWorkingDays(monthStart, monthEnd);
  const elapsedWorkingDays = countWorkingDays(monthStart, today);

  if (totalWorkingDays <= 0) return null;

  const salesPct = actual / budget;
  const timePct  = elapsedWorkingDays / totalWorkingDays;
  const onTrack  = salesPct >= timePct;

  return { salesPct, timePct, onTrack, elapsedWorkingDays, totalWorkingDays };
};

/* ─────────────────────────────────── inline styles ── */
const S = {
  root: {
    fontFamily: "'Segoe UI', Arial, sans-serif",
    background: '#f0f2f5',
    minHeight: '100vh',
    fontSize: 12,
    width: 'calc(100% + 48px)',
    marginLeft: -24,
    marginRight: -24
  },
  header: {
    background: 'linear-gradient(135deg, #1a3a5c 0%, #0e2233 60%, #061522 100%)',
    color: '#fff',
    padding: '16px clamp(8px, 1.6vw, 14px) 12px',
    borderRadius: '0 0 0 0',
  },
  headerTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: '-0.3px',
    color: '#fff'
  },
  headerSub: {
    margin: '4px 0 0',
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)'
  },

  // Controls bar
  controls: {
    background: '#fff',
    borderBottom: '1px solid #e2e8f0',
    padding: '8px clamp(8px, 1.6vw, 14px)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap'
  },
  controlLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },

  // KPI cards
  kpiRow: {
    display: 'flex',
    gap: 12,
    padding: '10px clamp(8px, 1.6vw, 14px) 8px',
    flexWrap: 'wrap'
  },
  kpiCard: {
    flex: '1 1 160px',
    background: '#fff',
    borderRadius: 10,
    padding: '14px 18px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
    borderTop: '3px solid #4361ee',
    minWidth: 150
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    marginBottom: 6
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: 700,
    color: '#1e293b',
    lineHeight: 1
  },
  kpiSub: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 4
  },

  // Table wrapper
  tableWrap: {
    overflowX: 'auto',
    overflowY: 'scroll',
    maxHeight: '70vh',
    minHeight: 360,
    position: 'relative',
    overscrollBehavior: 'contain',
    background: '#fff',
    borderRadius: 8,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    margin: '0 clamp(6px, 1.2vw, 10px) 12px',
    WebkitOverflowScrolling: 'touch'
  },
  table: {
    width: 'max-content',
    minWidth: 2720,
    borderCollapse: 'collapse',
    fontSize: 11,
    tableLayout: 'auto'
  },

  // Table header rows
  th: {
    background: 'linear-gradient(180deg, #1e3a5f 0%, #14293f 100%)',
    color: '#fff',
    padding: '10px 4px',
    textAlign: 'center',
    fontWeight: 600,
    fontSize: 10.5,
    whiteSpace: 'nowrap',
    borderRight: '1px solid rgba(255,255,255,0.1)',
    position: 'sticky',
    top: 0,
    zIndex: 6
  },
  thLabel: {
    background: 'linear-gradient(180deg, #1e3a5f 0%, #14293f 100%)',
    color: '#fff',
    padding: '10px 10px',
    textAlign: 'left',
    fontWeight: 700,
    fontSize: 11,
    position: 'sticky',
    left: 0,
    top: 0,
    zIndex: 8,
    width: 240,
    minWidth: 240,
    borderRight: '2px solid #4361ee'
  },

  // Sub-header row
  thSub: (type) => ({
    background: type === 'act' ? '#dbeafe'
                : type === 'bud' ? '#fef9c3'
                : '#f1f5f9',
    color: type === 'act' ? '#1e40af'
           : type === 'bud' ? '#854d0e'
           : '#475569',
    padding: '4px 2px',
    textAlign: 'center',
    fontWeight: 600,
    fontSize: 9.5,
    borderBottom: '1px solid #e2e8f0',
    position: 'sticky',
    top: 40,
    zIndex: 7,
    whiteSpace: 'nowrap'
  }),
  thSubLabel: {
    background: '#1a3a5c',
    color: 'rgba(255,255,255,0.7)',
    padding: '4px 10px',
    position: 'sticky',
    left: 0,
    top: 40,
    zIndex: 9,
    borderRight: '2px solid #4361ee'
  },

  // Cells
  td: (type, isTotal = false) => ({
    padding: '5px 4px',
    textAlign: 'center',
    borderBottom: '1px solid #e9ecef',
    borderRight: type === 'pct' ? '1px solid #d1d5db' : '1px dashed #f0f0f0',
    background: isTotal ? '#f8fafc'
      : type === 'act' ? '#f0f7ff'
      : type === 'bud' ? '#fffef0'
      : 'transparent',
    fontWeight: isTotal ? 700 : 400,
    fontSize: 11,
    color: '#1e293b',
    whiteSpace: 'nowrap'
  }),
  tdLabel: (isTotal = false) => ({
    position: 'sticky',
    left: 0,
    background: isTotal ? '#e2e8f0' : '#fff',
    zIndex: isTotal ? 5 : 4,
    padding: '5px 8px',
    fontWeight: isTotal ? 700 : 500,
    color: isTotal ? '#1e293b' : '#334155',
    borderBottom: '1px solid #e9ecef',
    borderRight: '2px solid #4361ee',
    fontSize: 11,
    textAlign: 'left',
    whiteSpace: 'nowrap',
    minWidth: 240,
    maxWidth: 240,
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  }),

  // Achievement cell
  pct: (delta, hasBudget, hasActual) => {
    let color = '#64748b';
    if (!hasBudget && !hasActual) color = '#94a3b8';
    else if (!hasBudget && hasActual) color = '#2563eb';
    else if (delta > 0) color = '#2563eb';
    else if (delta < 0) color = '#dc2626';
    return {
      display: 'inline-block',
      padding: '1px 4px',
      borderRadius: 4,
      background: color + '18',
      color,
      fontWeight: 600,
      fontSize: 10,
      minWidth: 36,
      textAlign: 'center'
    };
  },

  // Tab area
  tabWrap: { padding: '0 clamp(6px, 1.2vw, 10px) 4px' },

  // Search bar
  searchRow: {
    padding: '8px clamp(6px, 1.2vw, 10px) 6px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap'
  },
  tableHelp: {
    margin: '0 clamp(6px, 1.2vw, 10px) 8px',
    fontSize: 11,
    color: '#64748b'
  },

  // Chart
  chartWrap: {
    background: '#fff',
    borderRadius: 8,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    margin: '0 clamp(6px, 1.2vw, 10px) 16px',
    padding: '16px'
  }
};

/* ──────────────────────── column widths ── */
const COL_LABEL = 240;
const COL_ACT   = 72;
const COL_BUD   = 72;
const COL_PCT   = 52;

/* ─────────────────────── sub-column headers ── */
const SubCols = () => (
  <>
    <th style={{ ...S.thSub('act'), width: COL_ACT }}>Act</th>
    <th style={{ ...S.thSub('bud'), width: COL_BUD }}>Bud</th>
    <th style={{ ...S.thSub('pct'), width: COL_PCT }}>Δ%</th>
  </>
);

/* ─────────────────── Achievement cell ── */
const PctCell = ({ actual, budget }) => {
  const a = parseFloat(actual) || 0;
  const b = parseFloat(budget) || 0;
  const label  = deltaLabel(a, b);
  const delta  = deltaPct(a, b);
  return (
    <td style={S.td('pct')}>
      <span style={S.pct(delta, b > 0, a > 0)}>{label}</span>
    </td>
  );
};

/* ─────────────────── Pace indicator ── */
const PaceIndicator = ({ pace }) => {
  if (!pace) return null;
  const { salesPct, timePct, onTrack, elapsedWorkingDays, totalWorkingDays } = pace;
  const salesPctDisplay = (salesPct * 100).toFixed(1);
  const timePctDisplay  = (timePct * 100).toFixed(1);
  return (
    <Tooltip
      title={`Sales: ${salesPctDisplay}% of budget | Time: ${timePctDisplay}% elapsed (${elapsedWorkingDays}/${totalWorkingDays} working days)`}
    >
      <Tag
        color={onTrack ? 'green' : 'red'}
        style={{ fontSize: 10, lineHeight: '18px', margin: 0, cursor: 'default' }}
      >
        {onTrack ? 'On track' : 'Below pace'}
      </Tag>
    </Tooltip>
  );
};

/* ─────────────────────────── DataRow ─── */
const DataRow = ({ label, data, metric, currencyCode, isTotal = false, pace = null }) => {
  const getValue = (m) => metric === 'kgs'
    ? { act: m.actual_mt, bud: m.budget_mt }
    : { act: m.actual_amount, bud: m.budget_amount };

  const fmtVal = metric === 'kgs' ? fmtMT : fmtAmt;
  const isAmount = metric !== 'kgs';
  const renderVal = (value) => {
    if (value <= 0) return '—';
    if (!isAmount) return fmtVal(value);
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        <CurrencySymbol code={currencyCode} />
        <span>{fmtVal(value)}</span>
      </span>
    );
  };

  return (
    <tr>
      <td style={S.tdLabel(isTotal)} title={label}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
          {pace && <PaceIndicator pace={pace} />}
        </span>
      </td>
      {MONTHS_SHORT.map((_, idx) => {
        const mData = data.months[idx + 1] || { actual_mt: 0, budget_mt: 0, actual_amount: 0, budget_amount: 0 };
        const { act, bud } = getValue(mData);
        return (
          <React.Fragment key={idx}>
            <td style={S.td('act', isTotal)}>{renderVal(act)}</td>
            <td style={S.td('bud', isTotal)}>{renderVal(bud)}</td>
            <PctCell actual={act} budget={bud} />
          </React.Fragment>
        );
      })}
      {/* Total column */}
      {(() => {
        const tot = data.total || {};
        const { act, bud } = getValue(tot);
        return (
          <>
            <td style={{ ...S.td('act', true), background: '#e8f0fe', fontWeight: 700 }}>{renderVal(act)}</td>
            <td style={{ ...S.td('bud', true), background: '#fef9c3', fontWeight: 700 }}>{renderVal(bud)}</td>
            <PctCell actual={act} budget={bud} />
          </>
        );
      })()}
    </tr>
  );
};

/* ──────────────────────── TableHeaders ── */
const TableHeaders = ({ labelCol }) => (
  <thead>
    {/* Row 1: Month group labels */}
    <tr>
      <th rowSpan={2} style={{ ...S.thLabel, top: 0 }}>{labelCol}</th>
      {MONTHS_SHORT.map(m => (
        <th key={m} colSpan={3} style={{ ...S.th, borderLeft: '1px solid rgba(255,255,255,0.2)' }}>
          {m}
        </th>
      ))}
      <th colSpan={3} style={{ ...S.th, background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)', borderLeft: '2px solid rgba(255,255,255,0.3)' }}>
        Total
      </th>
    </tr>
    {/* Row 2: Act | Bud | % sub-headers */}
    <tr>
      {[...MONTHS_SHORT, 'Total'].map(m => <SubCols key={m} />)}
    </tr>
  </thead>
);

/* ═══════════════════════════════════════════════════════════════
   Main component
═══════════════════════════════════════════════════════════════ */
const CRMBudgetView = ({ initialGroupName = null }) => {
  const { user } = useAuth();
  const { companyCurrency } = useCurrency();

  const isAdmin = ['admin', 'sales_manager', 'sales_coordinator'].includes(user?.role);

  /* ── state ─────────────────────────────── */
  const [year,        setYear]        = useState(CURRENT_YEAR);
  const [metric,      setMetric]      = useState('kgs');
  const [activeTab,   setActiveTab]   = useState('pg');
  const [search,      setSearch]      = useState('');
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [repOptions,  setRepOptions]  = useState([]);    // admin dropdown
  const [yearOptions, setYearOptions] = useState([CURRENT_YEAR]);
  const [selectedRep, setSelectedRep] = useState('__ALL__');
  const [myGroup,     setMyGroup]     = useState(initialGroupName);

  const division = user?.preferences?.default_division || user?.divisions?.[0] || 'FP';
  const currencyCode = companyCurrency?.code || 'AED';
  const currencyText = companyCurrency?.symbol || currencyCode;

  /* ── resolve sales rep group for non-admin ─ */
  useEffect(() => {
    if (isAdmin || myGroup) return; // admin doesn't need this, already have group
    (async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${API_BASE_URL}/api/crm/my-customers`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const json = await res.json();
        const g = json?.data?.salesRep?.groupName || null;
        if (g) setMyGroup(g);
      } catch { /* silent */ }
    })();
  }, [isAdmin, myGroup]);

  /* ── fetch admin rep list when year/division changes ── */
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const [repsRes, groupsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/aebf/budget-sales-reps?division=${division}&budgetYear=${year}`),
          fetch(`${API_BASE_URL}/api/sales-rep-groups-universal?division=${division}`)
        ]);

        const repsJson = await repsRes.json();
        const groupsJson = await groupsRes.json();

        const actualReps = Array.isArray(repsJson?.salesReps) ? repsJson.salesReps : [];
        const salesRepGroups = groupsJson?.success && groupsJson?.data && typeof groupsJson.data === 'object'
          ? groupsJson.data
          : {};

        const norm = (s) => (s || '').toString().trim().toLowerCase();
        const groupMembersNormalized = new Set();

        Object.values(salesRepGroups).forEach((members) => {
          (members || []).forEach((member) => groupMembersNormalized.add(norm(member)));
        });
        Object.keys(salesRepGroups).forEach((groupName) => groupMembersNormalized.add(norm(groupName)));

        const groupNames = Object.keys(salesRepGroups);
        const groupsWithData = groupNames.filter((groupName) => {
          const members = salesRepGroups[groupName] || [];
          return members.some((member) => actualReps.some((rep) => norm(rep) === norm(member)))
              || actualReps.some((rep) => norm(rep) === norm(groupName));
        });

        const standaloneReps = actualReps.filter((rep) => !groupMembersNormalized.has(norm(rep)));
        const reps = [...standaloneReps, ...groupsWithData];

        setRepOptions(reps);
        // If current selection is no longer available, reset to __ALL__
        if (selectedRep !== '__ALL__' && !reps.includes(selectedRep)) {
          setSelectedRep('__ALL__');
        }
      } catch { /* silent */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, division, year]);

  /* ── fetch budget-available years (dynamic, budget only) ── */
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/periods/all?division=${division}`);
        const json = await res.json();
        const yearsFromApi = Array.isArray(json?.data?.years) ? json.data.years : [];

        // Keep years where budget exists (at least one sales rep in that year)
        const checks = await Promise.allSettled(
          yearsFromApi.map(async (y) => {
            const yrRes = await fetch(`${API_BASE_URL}/api/aebf/budget-sales-reps?division=${division}&budgetYear=${y}`);
            const yrJson = await yrRes.json();
            const hasBudget = Array.isArray(yrJson?.salesReps) && yrJson.salesReps.length > 0;
            return hasBudget ? Number(y) : null;
          })
        );

        const budgetYears = checks
          .filter(r => r.status === 'fulfilled' && r.value !== null)
          .map(r => r.value)
          .filter(y => !Number.isNaN(Number(y)));

        const uniqueSortedYears = [...new Set(budgetYears)].sort((a, b) => b - a);

        if (!mounted) return;

        if (uniqueSortedYears.length > 0) {
          setYearOptions(uniqueSortedYears);
          if (!uniqueSortedYears.includes(year)) {
            setYear(uniqueSortedYears[0]);
          }
        } else {
          // No budget years available in DB for this division
          setYearOptions([]);
        }
      } catch {
        if (!mounted) return;
        setYearOptions([]);
      }
    })();

    return () => { mounted = false; };
  }, [division, year]);

  /* ── determine which sales rep group to query ── */
  const queryGroup = useMemo(() => {
    if (isAdmin) return selectedRep;   // '__ALL__' or a specific rep
    return myGroup || '__ALL__';
  }, [isAdmin, selectedRep, myGroup]);

  /* ── fetch report data ── */
  const fetchData = useCallback(async () => {
    if (!queryGroup && !isAdmin) return; // sales rep must have their group loaded
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/budget-achievement-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ division, salesRepGroup: queryGroup, year })
      });
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (err) {
      console.error('[CRMBudgetView] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [division, queryGroup, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── filtered rows ── */
  const pgRows   = useMemo(() => {
    const rows = data?.productGroups || [];
    if (!search) return rows;
    return rows.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));
  }, [data, search]);

  const custRows = useMemo(() => {
    const rows = data?.customers || [];
    if (!search) return rows;
    return rows.filter(r => r.name.toLowerCase().includes(search.toLowerCase())
                         || (r.country || '').toLowerCase().includes(search.toLowerCase()));
  }, [data, search]);

  /* ── KPIs ── */
  const totals = data?.totals?.total || {};
  const kpiActual = metric === 'kgs' ? totals.actual_mt : totals.actual_amount;
  const kpiBudget = metric === 'kgs' ? totals.budget_mt : totals.budget_amount;
  const kpiDeltaText = deltaLabel(kpiActual, kpiBudget);
  const kpiDeltaValue = deltaPct(kpiActual, kpiBudget);
  const kpiDeltaColor = (() => {
    const a = parseFloat(kpiActual) || 0;
    const b = parseFloat(kpiBudget) || 0;
    if (b === 0 && a > 0) return '#2563eb';
    if (kpiDeltaValue > 0) return '#2563eb';
    if (kpiDeltaValue < 0) return '#dc2626';
    return '#64748b';
  })();
  const kpiCards = [
    {
      label: metric === 'kgs' ? 'Actual Volume (MT)' : 'Actual Amount',
      value: metric === 'kgs' ? fmtMT(totals.actual_mt) : fmtAmt(totals.actual_amount),
      sub: 'Full year actual',
      color: '#4361ee',
      isAmount: metric !== 'kgs',
    },
    {
      label: metric === 'kgs' ? 'Budget Volume (MT)' : 'Budget Amount',
      value: metric === 'kgs' ? fmtMT(totals.budget_mt) : fmtAmt(totals.budget_amount),
      sub: `${year} full-year budget`,
      color: '#f59e0b',
      isAmount: metric !== 'kgs',
    },
    {
      label: 'Delta %',
      value: kpiDeltaText,
      sub: metric === 'kgs' ? '(Actual MT - Budget MT) / Budget MT' : '(Actual Amount - Budget Amount) / Budget Amount',
      color: kpiDeltaColor,
    },
    {
      label: '# Product Groups',
      value: data?.productGroups?.length ?? '—',
      sub: 'With actual or budget data',
      color: '#0ea5e9',
    },
    {
      label: '# Customers',
      value: data?.customers?.length ?? '—',
      sub: 'With actual or budget data',
      color: '#8b5cf6',
    },
  ];

  /* ── ECharts bar chart ── */
  const chartData = useMemo(() => {
    const rows = (data?.productGroups || [])
      .filter(pg => pg.total.budget_mt > 0 || pg.total.actual_mt > 0)
      .sort((a, b) => b.total.budget_mt - a.total.budget_mt)
      .slice(0, 12);
    return rows;
  }, [data]);

  const chartOption = useMemo(() => {
    if (!chartData.length) return {};
    const names   = chartData.map(r => r.name);
    const actuals = chartData.map(r => metric === 'kgs' ? parseFloat(r.total.actual_mt.toFixed(2)) : parseFloat(r.total.actual_amount.toFixed(0)));
    const budgets = chartData.map(r => metric === 'kgs' ? parseFloat(r.total.budget_mt.toFixed(2)) : parseFloat(r.total.budget_amount.toFixed(0)));
    const unit    = metric === 'kgs' ? 'MT' : currencyText;
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) =>
          `<b>${params[0].name}</b><br/>` +
          params.map(p => `${p.marker} ${p.seriesName}: ${metric === 'kgs' ? p.value.toFixed(2) + ' MT' : `${currencyText} ${fmtAmt(p.value)}`}`).join('<br/>')
      },
      legend: { data: ['Actual', 'Budget'], bottom: 0, textStyle: { fontSize: 11 } },
      grid: { left: '3%', right: '4%', top: '8%', bottom: '14%', containLabel: true },
      xAxis: {
        type: 'category',
        data: names,
        axisLabel: { rotate: 38, fontSize: 10, interval: 0 }
      },
      yAxis: {
        type: 'value',
        name: unit,
        axisLabel: { formatter: (v) => metric === 'kgs' ? v.toFixed(0) : `${currencyText} ${fmtAmt(v)}`, fontSize: 10 }
      },
      series: [
        {
          name: 'Actual',
          type: 'bar',
          data: actuals,
          itemStyle: { color: '#4361ee', borderRadius: [3,3,0,0] },
          barMaxWidth: 28
        },
        {
          name: 'Budget',
          type: 'bar',
          data: budgets,
          itemStyle: { color: '#fbbf24', borderRadius: [3,3,0,0] },
          barMaxWidth: 28
        }
      ]
    };
  }, [chartData, metric, currencyText]);

  /* ── totals row data ── */
  const totalsRow = useMemo(() => ({
    months: data?.totals?.months || {},
    total: data?.totals?.total || {}
  }), [data]);

  /* ── render ─────────────────────────────── */
  return (
    <div style={S.root}>
      {/* ── Header ── */}
      <div style={S.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={S.headerTitle}>
              Budget Achievement
            </h2>
            <p style={S.headerSub}>
              {isAdmin
                ? `${division} Division • ${year} Actual vs ${year} Budget`
                : `${myGroup || 'My Team'} • ${year} Actual vs ${year} Budget`
              }
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Year selector */}
            <Select
              value={year}
              onChange={setYear}
              size="small"
              style={{ width: 90, fontSize: 12 }}
              popupMatchSelectWidth={false}
              disabled={yearOptions.length === 0}
            >
              {yearOptions.map(y => <Option key={y} value={y}>{y}</Option>)}
            </Select>
            {/* Reload */}
            <button
              onClick={fetchData}
              style={{
                background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 6, color: '#fff', cursor: 'pointer', padding: '4px 10px',
                fontSize: 12, display: 'flex', alignItems: 'center', gap: 4
              }}
              title="Refresh"
            >
              <ReloadOutlined style={{ fontSize: 11 }} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── Controls bar ── */}
      <div style={S.controls}>
        {/* Admin: Sales rep selector */}
        {isAdmin && (
          <>
            <span style={S.controlLabel}>Sales Rep</span>
            <Select
              value={selectedRep}
              onChange={setSelectedRep}
              style={{ width: 220 }}
              size="small"
              showSearch
              filterOption={(input, opt) =>
                (opt?.value || '').toLowerCase().includes(input.toLowerCase())
              }
            >
              <Option value="__ALL__">— All Sales Reps —</Option>
              {repOptions.map(r => <Option key={r} value={r}>{r}</Option>)}
            </Select>
          </>
        )}

        {/* Divider */}
        {isAdmin && <span style={{ color: '#d1d5db', fontSize: 18 }}>|</span>}

        {/* Metric toggle */}
        <span style={S.controlLabel}>Metric</span>
        <Segmented
          value={metric}
          onChange={setMetric}
          size="small"
          options={[
            { label: 'KGS (MT)', value: 'kgs' },
            { label: 'Amount',   value: 'amount' }
          ]}
        />

        {/* Current context badges */}
        {!isAdmin && myGroup && (
          <Tag color="blue" style={{ marginLeft: 'auto' }}>{myGroup}</Tag>
        )}
        {isAdmin && selectedRep !== '__ALL__' && (
          <Tag color="geekblue" style={{ marginLeft: 'auto' }}>{selectedRep}</Tag>
        )}
      </div>

      {/* ── KPI Cards ── */}
      <div style={S.kpiRow}>
        {kpiCards.map((c, i) => (
          <div key={i} style={{ ...S.kpiCard, borderTopColor: c.color }}>
            <div style={S.kpiLabel}>{c.label}</div>
            <div style={{ ...S.kpiValue, color: c.color }}>
              {loading ? '…' : c.isAmount ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <CurrencySymbol code={currencyCode} />
                  <span>{c.value}</span>
                </span>
              ) : c.value}
            </div>
            <div style={S.kpiSub}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
          <div style={{ color: '#64748b', marginTop: 12, fontSize: 13 }}>Loading budget data…</div>
        </div>
      ) : !data ? (
        <Empty
          description="No data available for this selection"
          style={{ padding: '60px 0' }}
        />
      ) : (
        <>
          {/* Search */}
          <div style={S.searchRow}>
            <Input
              placeholder={activeTab === 'pg' ? 'Filter product groups…' : 'Filter customers or country…'}
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 'min(420px, 100%)', fontSize: 12 }}
              size="small"
              allowClear
            />
            <span style={{ color: '#94a3b8', fontSize: 11 }}>
              {activeTab === 'pg'
                ? `${pgRows.length} product group${pgRows.length !== 1 ? 's' : ''}`
                : `${custRows.length} customer${custRows.length !== 1 ? 's' : ''}`
              }
            </span>
          </div>

          <div style={S.tableHelp}>Tip: scroll horizontally to view all month-level Act/Bud/Δ% values clearly. Δ% = (Actual - Budget) / Budget.</div>

          {/* Tab navigation */}
          <div style={S.tabWrap}>
            <Tabs
              activeKey={activeTab}
              onChange={(k) => { setActiveTab(k); setSearch(''); }}
              size="small"
              items={[
                {
                  key: 'pg',
                  label: <span><AppstoreOutlined /> By Product Group</span>,
                  children: (
                    <BudgetTable
                      rows={pgRows}
                      totalsRow={totalsRow}
                      metric={metric}
                      currencyCode={currencyCode}
                      labelCol="Product Group"
                      year={year}
                      showPace
                    />
                  )
                },
                {
                  key: 'customer',
                  label: <span><TeamOutlined /> By Customer</span>,
                  children: (
                    <BudgetTable
                      rows={custRows}
                      totalsRow={totalsRow}
                      metric={metric}
                      currencyCode={currencyCode}
                      labelCol="Customer"
                      showCountry
                    />
                  )
                }
              ]}
            />
          </div>

          {/* ECharts bar chart */}
          {chartData.length > 0 && (
            <div style={S.chartWrap}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
                Top Product Groups — Actual vs Budget ({metric === 'kgs' ? 'MT' : 'Amount'})
              </div>
              <ReactECharts
                option={chartOption}
                style={{ height: 280 }}
                opts={{ renderer: 'canvas' }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

/* ──────────────────────────── BudgetTable sub-component ── */
const BudgetTable = ({ rows, totalsRow, metric, currencyCode, labelCol, showCountry = false, year = null, showPace = false }) => {
  if (!rows || rows.length === 0) {
    return (
      <Empty
        description="No data for this view"
        style={{ margin: '40px 0' }}
      />
    );
  }

  return (
    <div style={S.tableWrap}>
      <table style={S.table}>
        <TableHeaders labelCol={labelCol} />
        <tbody>
          {rows.map((row, i) => (
            <DataRow
              key={i}
              label={showCountry && row.country ? `${row.name}  •  ${row.country}` : row.name}
              data={row}
              metric={metric}
              currencyCode={currencyCode}
              pace={showPace ? computePace(row, metric, year) : null}
            />
          ))}
          {/* Totals / Grand Total row */}
          <DataRow
            label="TOTAL"
            data={totalsRow}
            metric={metric}
            currencyCode={currencyCode}
            isTotal
          />
        </tbody>
      </table>
    </div>
  );
};

export default CRMBudgetView;
