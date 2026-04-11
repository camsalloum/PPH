/**
 * Shared utilities, constants, and presentational components for CRM dashboards.
 * Used by both AdminCRMDashboard.jsx and CRMDashboard.jsx to avoid duplication.
 */

import React from 'react';
import { Typography } from 'antd';
import {
  ArrowUpOutlined, ArrowDownOutlined,
  ThunderboltOutlined, CheckCircleOutlined, ClockCircleOutlined,
  ContactsOutlined,
} from '@ant-design/icons';
import CurrencySymbol from '../common/CurrencySymbol';

const { Text } = Typography;

// ── Constants ────────────────────────────────────────────────────────────────

export const COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
export const CRM_DASHBOARD_TIMEOUT_MS = 15000;
export const DEFAULT_CURRENCY = 'AED';
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

export const PERIOD_LABEL = { ytd: 'YTD', '1m': '1M', q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4', fy: 'FY' };
export const PERIOD_LABEL_FULL = { ytd: 'Year to Date', '1m': 'This Month', q1: 'Q1 (Jan–Mar)', q2: 'Q2 (Apr–Jun)', q3: 'Q3 (Jul–Sep)', q4: 'Q4 (Oct–Dec)', fy: 'Full Year' };

export const ACTIVITY_ICONS = {
  prospect_approved: <CheckCircleOutlined className="crmx-activity-icon success" />,
  prospect_rejected: <ClockCircleOutlined className="crmx-activity-icon error" />,
  prospect_new: <ThunderboltOutlined className="crmx-activity-icon info" />,
  customer_added: <ContactsOutlined className="crmx-activity-icon purple" />,
};

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const RANK_MEDALS = ['🥇', '🥈', '🥉'];

// ── Deal Pipeline Stages (single source of truth) ─────────────────────────────
// Packaging business flow: Interest → Sample Analysis → Quotation → Sample Approval → Confirmed

export const DEAL_STAGES = [
  { value: 'interest',        label: 'Interest & Data Collection',   short: 'Interest',       color: '#1890ff' },
  { value: 'sample_analysis', label: 'Sample Analysis / Estimation', short: 'Sample Analysis', color: '#722ed1' },
  { value: 'quotation',       label: 'Quotation & Price Approval',   short: 'Quotation',      color: '#fa8c16' },
  { value: 'sample_approval', label: 'Sample Approval',              short: 'Spl. Approval',  color: '#13c2c2' },
  { value: 'confirmed',       label: 'Confirmed',                    short: 'Confirmed',      color: '#52c41a' },
  { value: 'lost',            label: 'Lost',                         short: 'Lost',           color: '#ff4d4f' },
];

export const DEAL_OPEN_STAGES = ['interest', 'sample_analysis', 'quotation', 'sample_approval'];

// ── Formatters ───────────────────────────────────────────────────────────────

export const fmt = (v) => {
  if (v >= 1000000) return `${(v / 1000000).toFixed(2)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
  return v?.toLocaleString?.() ?? '0';
};

export const fmtFull = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

// ── Presentational Components ────────────────────────────────────────────────

/** Growth badge — shows +/- percentage with arrow icon */
export const GrowthBadge = ({ value, suffix = '' }) => {
  if (!value || value === 0) return <Text type="secondary" className="crmx-growth-neutral">—</Text>;
  const isUp = value > 0;
  return (
    <span className={`crmx-growth-badge ${isUp ? 'up' : 'down'}`}>
      {isUp ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
      {isUp ? '+' : ''}{value}%{suffix ? ` ${suffix}` : ''}
    </span>
  );
};

/** PctLabel factory for bar chart YoY % difference labels */
export const makePctLabel = (chartData) => (props) => {
  const { x, y, width, index } = props;
  const pct = chartData[index]?.pctDiff;
  if (pct === null || pct === undefined) return null;
  const isUp = pct >= 0;
  const bg = '#fef08a';
  const fg = isUp ? '#16a34a' : '#dc2626';
  const label = `${isUp ? '+' : ''}${pct}%`;
  const lblW = label.length * 7 + 8;
  return (
    <g>
      <rect x={x + width / 2 - lblW / 2} y={y - 28} width={lblW} height={18} rx={3} fill={bg} stroke={fg} strokeWidth={0.8} />
      <text x={x + width / 2} y={y - 15} textAnchor="middle" fill={fg} fontSize={11} fontWeight={700}>{label}</text>
    </g>
  );
};

/** Recharts-compatible custom tooltip for the sales trend chart */
export const ChartTooltip = ({ active, payload, label, currencyCode }) => {
  if (!active || !payload?.length) return null;
  const code = currencyCode || DEFAULT_CURRENCY;
  return (
    <div className="crmx-chart-tooltip">
      <Text strong className="crmx-chart-tooltip-label">{label}</Text>
      {payload.filter(p => p.dataKey !== 'trendLine').map((p, i) => (
        <div key={i} className="crmx-chart-tooltip-row">
          <span className="crmx-chart-tooltip-dot" style={{ background: p.color }} />
          <span>{p.name}: <strong><CurrencySymbol code={code} />{fmt(p.value * 1000)}</strong></span>
        </div>
      ))}
    </div>
  );
};

/** Mini sparkline — inline SVG, no library dependency */
export const Sparkline = ({ data, width = 80, height = 24, color = '#6366f1' }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) =>
    `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`
  ).join(' ');
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  return (
    <svg width={width} height={height} className="crmx-sparkline">
      <polygon points={areaPoints} fill={color} opacity={0.10} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width} cy={parseFloat(points.split(' ').pop().split(',')[1])} r={2.5} fill={color} />
    </svg>
  );
};
