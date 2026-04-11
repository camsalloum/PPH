/**
 * SalesCockpit — Shared dashboard component used by both CRMDashboard (rep) and AdminCRMDashboard (admin).
 * Extracted from ~80% identical code. Differences controlled via props.
 *
 * Props:
 *   isAdmin              – enables admin-specific features (MoRM from designation, group selector, rep groups)
 *   lockedGroupId        – if set, locks the group selector to this group (admin embedded view)
 *   apiEndpoint          – '/dashboard/stats' or '/my-stats'
 *   showGroupSelector    – render the group selector dropdown
 *   showDailyActivity    – render DailyActivitySummary widget
 *   showQuickLog         – render QuickLogFAB
 *   showRepGroups        – render Rep Groups mini-list
 *   showConversionRate   – fetch and render conversion rate card
 *   selectedSalesRep     – controlled selected rep/group value (admin)
 *   onSalesRepChange     – callback when admin changes the group selector
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, Row, Col, Typography, Space, Button, Table, Tag, Select, Avatar, Tooltip, Segmented, Progress, Skeleton, App, Alert, Modal, Badge, Collapse } from 'antd';
import {
  ArrowUpOutlined, ArrowDownOutlined, ReloadOutlined, TeamOutlined,
  LineChartOutlined, GlobalOutlined,
  ShoppingOutlined, RiseOutlined, FundOutlined, FireOutlined,
  BulbOutlined, TrophyOutlined, WarningOutlined, ClockCircleOutlined,
  ContactsOutlined, ThunderboltOutlined, StarFilled
} from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import axios from 'axios';
import {
  ComposedChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, LabelList
} from 'recharts';
import { Bar } from 'recharts/es6/cartesian/Bar';
import CurrencySymbol from '../common/CurrencySymbol';
import CustomerSalesHistoryModal from './CustomerSalesHistoryModal';
import RiskAlertPanel from './RiskAlertPanel.jsx';
import PipelineSummaryCard from './PipelineSummaryCard.jsx';
import ActivityFeed from './ActivityFeed.jsx';
import DailyActivitySummary from './DailyActivitySummary.jsx';
import TaskWidget from './TaskWidget.jsx';
import ActivityLogDrawer from './ActivityLogDrawer.jsx';
import QuickLogFAB from './QuickLogFAB.jsx';
import {
  COLORS, CRM_DASHBOARD_TIMEOUT_MS, API_BASE_URL,
  PERIOD_LABEL, PERIOD_LABEL_FULL, ACTIVITY_ICONS, MONTH_SHORT, RANK_MEDALS,
  fmt, fmtFull, GrowthBadge, makePctLabel, ChartTooltip, Sparkline,
} from './CRMDashboardUtils.jsx';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import './CRM.css';

const { Text } = Typography;
const { Option } = Select;

const SalesCockpit = ({
  isAdmin = false,
  lockedGroupId = null,
  lockedGroupName = null,
  apiEndpoint = '/my-stats',
  showGroupSelector = false,
  showDailyActivity = false,
  showQuickLog = false,
  showRepGroups = false,
  showConversionRate = false,
  selectedSalesRep = 'all',
  onSalesRepChange = null,
  salesReps = [],
  onRefresh,
}) => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { companyCurrency } = useCurrency();
  const currencyCode = companyCurrency?.code || 'AED';
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('ytd');
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const debouncedYear = useDebouncedValue(selectedYear, 400);
  const debouncedDateRange = useDebouncedValue(dateRange, 400);
  const [recentCustomers, setRecentCustomers] = useState([]);
  const [salesHistoryModalVisible, setSalesHistoryModalVisible] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [customerView, setCustomerView] = useState('top');
  const [activeCustomersModal, setActiveCustomersModal] = useState(false);
  const [activeCustomersList, setActiveCustomersList] = useState([]);
  const [activeCustomersLoading, setActiveCustomersLoading] = useState(false);
  const [activeCustomersNewCount, setActiveCustomersNewCount] = useState(0);
  const [conversionData, setConversionData] = useState(null);
  const abortRef = useRef(null);
  const isLocked = !!lockedGroupId;

  const [stats, setStats] = useState({
    groupName: '',
    totalCustomers: 0, activeCustomers: 0, monthCustomers: 0,
    totalProductGroups: 0, totalCountries: 0, topCountries: [],
    totalSalesYTD: 0, totalSalesThisMonth: 0, salesGrowth: 0,
    yoyGrowth: 0, avgOrderValue: 0, totalProspects: 0,
    prevMonth: 0, kgsYTD: 0, prevYearYTD: 0, prevYearKgs: 0, prevYearCustomers: 0,
    morm: 0, mormPct: 0, prevYearMormPct: 0,
    budgetTarget: 0, budgetAchievementPct: null,
  });
  const [salesTrendData, setSalesTrendData] = useState([]);
  const [productMixData, setProductMixData] = useState([]);
  const [repGroupData, setRepGroupData] = useState([]);

  // --- Data loading ---
  const loadDashboardData = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const signal = controller.signal;
    try {
      setLoading(true);
      setLoadError(null);
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };

      const safeGet = (url, config, fallbackData) =>
        axios.get(url, { timeout: CRM_DASHBOARD_TIMEOUT_MS, signal, ...config })
          .catch((err) => {
            if (axios.isCancel(err)) throw err;
            return { data: fallbackData };
          });

      if (isAdmin) {
        // Admin: fetch dashboard/stats + optional conversion rate
        const groupParams = selectedSalesRep !== 'all' ? { group_id: selectedSalesRep } : {};
        const statsParams = { ...groupParams, date_range: debouncedDateRange, year: debouncedYear };

        const promises = [
          safeGet(`${API_BASE_URL}/api/crm/${apiEndpoint.replace(/^\//, '')}`, { headers, params: statsParams }, { success: false }),
        ];
        if (showConversionRate) {
          promises.push(safeGet(`${API_BASE_URL}/api/crm/stats/conversion-rate`, { headers }, { success: false, data: null }));
        }

        const results = await Promise.all(promises);
        const dashStatsRes = results[0];
        if (showConversionRate && results[1]?.data?.success && results[1].data.data) {
          setConversionData(results[1].data.data);
        }

        if (dashStatsRes.data?.success) {
          const d = dashStatsRes.data.data;
          setSalesTrendData((d.trend || []).map(t => ({
            month: t.label,
            revenue: Math.round(t.revenue / 1000),
            prevRevenue: Math.round((t.prev_year_revenue || 0) / 1000),
            kgs: Math.round(t.kgs / 1000)
          })));
          const totalMix = (d.product_mix || []).reduce((s, p) => s + p.value, 0);
          setProductMixData((d.product_mix || []).map((p, i) => ({
            name: p.name,
            value: totalMix > 0 ? Math.round((p.value / totalMix) * 100) : 0,
            rawValue: p.value,
            color: COLORS[i % COLORS.length]
          })));
          setRepGroupData(d.rep_groups || []);
          setRecentCustomers((d.recent_customers || []).map((c, idx) => ({
            id: c.customer_id || idx,
            customer_id: c.customer_id || null,
            customer_name: c.customer_name,
            country: c.country,
            sales_rep_group_name: c.sales_rep_group_name,
            total_amount: c.total_amount,
            last_order_ym: c.last_order_ym,
          })));
          setStats({
            groupName: '',
            totalCustomers: d.customers?.total ?? 0,
            activeCustomers: d.customers?.active ?? 0,
            monthCustomers: d.customers?.month ?? 0,
            totalCountries: d.customers?.countries ?? 0,
            topCountries: d.top_countries || [],
            totalProductGroups: (d.product_mix || []).length,
            totalSalesYTD: d.revenue?.ytd ?? 0,
            totalSalesThisMonth: d.revenue?.this_month ?? 0,
            prevMonth: d.revenue?.prev_month ?? 0,
            salesGrowth: d.revenue?.month_growth_pct ?? 0,
            yoyGrowth: d.revenue?.yoy_growth_pct ?? 0,
            avgOrderValue: d.revenue?.avg_order_value ?? 0,
            totalProspects: d.prospects?.total ?? 0,
            kgsYTD: d.revenue?.kgs_ytd ?? 0,
            prevYearYTD: d.revenue?.prev_year_ytd ?? 0,
            prevYearKgs: 0,
            prevYearCustomers: 0,
            morm: d.revenue?.morm ?? 0,
            mormPct: d.revenue?.morm_pct ?? 0,
            prevYearMormPct: d.revenue?.prev_year_morm_pct ?? 0,
            budgetTarget: d.revenue?.budget_target ?? 0,
            budgetAchievementPct: d.revenue?.budget_achievement_pct ?? null,
          });
        }
      } else {
        // Rep: fetch my-stats + my-customers
        const [myStatsRes, customersRes] = await Promise.all([
          safeGet(`${API_BASE_URL}/api/crm/${apiEndpoint.replace(/^\//, '')}`, { headers, params: { date_range: debouncedDateRange, year: debouncedYear } }, { success: false }),
          safeGet(`${API_BASE_URL}/api/crm/my-customers`, { headers }, { success: false }),
        ]);

        if (myStatsRes.data?.success && myStatsRes.data.data && !myStatsRes.data.data.empty) {
          const d = myStatsRes.data.data;
          setSalesTrendData((d.trend || []).map(t => ({
            month: t.label,
            revenue: Math.round(t.revenue / 1000),
            prevRevenue: Math.round((t.prev_year_revenue || 0) / 1000),
            kgs: Math.round((t.kgs || 0) / 1000),
          })));
          const totalMix = (d.product_mix || []).reduce((s, p) => s + p.value, 0);
          setProductMixData((d.product_mix || []).map((p, i) => ({
            name: p.name,
            value: totalMix > 0 ? Math.round((p.value / totalMix) * 100) : 0,
            rawValue: p.value,
            color: COLORS[i % COLORS.length],
          })));
          setStats(prev => ({
            ...prev,
            groupName: d.salesRep?.groupName || '',
            totalSalesYTD: d.revenue?.ytd ?? 0,
            totalSalesThisMonth: d.revenue?.this_month ?? 0,
            prevMonth: d.revenue?.prev_month ?? 0,
            salesGrowth: d.revenue?.month_growth_pct ?? 0,
            yoyGrowth: d.revenue?.yoy_growth_pct ?? 0,
            kgsYTD: d.revenue?.kgs_ytd ?? 0,
            prevYearKgs: d.revenue?.prev_year_kgs ?? 0,
            prevYearYTD: d.revenue?.prev_year_ytd ?? 0,
            activeCustomers: d.revenue?.active_customers ?? 0,
            prevYearCustomers: d.revenue?.prev_year_customers ?? 0,
            totalProductGroups: (d.product_mix || []).length,
            totalProspects: parseInt(d.prospects?.total || 0),
            morm: d.revenue?.morm ?? 0,
            mormPct: d.revenue?.morm_pct ?? 0,
            prevYearMormPct: d.revenue?.prev_year_morm_pct ?? 0,
            budgetTarget: d.revenue?.budget_target ?? 0,
            budgetAchievementPct: d.revenue?.budget_achievement_pct ?? null,
          }));
          if (d.recent_customers?.length) {
            setRecentCustomers(d.recent_customers.map((c, idx) => ({
              id: c.customer_id || idx,
              customer_id: c.customer_id || null,
              customer_name: c.customer_name,
              country: c.country,
              total_amount: c.total_amount,
              last_order_ym: c.last_order_ym,
            })));
          }
        }

        if (customersRes.data?.success && customersRes.data.data?.customers) {
          const customers = customersRes.data.data.customers;
          if (!myStatsRes.data?.data?.recent_customers?.length) {
            setRecentCustomers(customers.map(c => ({
              id: c.id || c.customer_id,
              customer_id: c.id || c.customer_id,
              customer_name: c.display_name || c.customer_name || '',
              country: c.primary_country || c.country || '',
              total_amount: parseFloat(c.total_amount_all_time || 0),
              last_order_ym: c.last_order_ym || c.last_order_date || null,
            })));
          }
          const countryMap = {};
          customers.forEach(c => {
            const cn = c.primary_country || c.country || 'Unknown';
            countryMap[cn] = (countryMap[cn] || 0) + 1;
          });
          const topCountries = Object.entries(countryMap)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
          setStats(prev => ({
            ...prev,
            totalCustomers: customers.length,
            totalCountries: Object.keys(countryMap).length,
            topCountries,
          }));
        }
      }
    } catch (e) {
      if (axios.isCancel(e)) return;
      console.error('Error loading dashboard data:', e);
      setLoadError('Failed to load dashboard data. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, apiEndpoint, selectedSalesRep, debouncedDateRange, debouncedYear, isLocked, showConversionRate]);

  useEffect(() => {
    loadDashboardData();
    return () => abortRef.current?.abort();
  }, [loadDashboardData]);

  // --- Handlers ---
  const handleCustomerClick = useCallback((customer) => {
    if (!customer.customer_id) { message.info('No sales detail available for this customer.'); return; }
    setSelectedCustomer({ id: customer.customer_id, customer_name: customer.customer_name });
    setSalesHistoryModalVisible(true);
  }, []);

  const handleRefresh = useCallback(() => { loadDashboardData(); onRefresh?.(); }, [loadDashboardData, onRefresh]);

  const handleActiveCustomersClick = useCallback(async () => {
    setActiveCustomersModal(true);
    setActiveCustomersLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const reqParams = { date_range: dateRange, year: selectedYear };
      if (isAdmin && selectedSalesRep) reqParams.group_id = selectedSalesRep;
      const res = await axios.get(`${API_BASE_URL}/api/crm/dashboard/active-customers`, {
        headers: { Authorization: `Bearer ${token}` },
        params: reqParams,
        timeout: CRM_DASHBOARD_TIMEOUT_MS,
      });
      if (res.data?.success) {
        setActiveCustomersList(res.data.data.customers || []);
        setActiveCustomersNewCount(res.data.data.new_count || 0);
      } else {
        message.error(res.data?.message || 'Failed to load active customers');
      }
    } catch (err) {
      if (!axios.isCancel(err)) {
        console.error('[ActiveCustomers]', err);
        message.error('Failed to load active customers');
      }
    } finally {
      setActiveCustomersLoading(false);
    }
  }, [dateRange, selectedYear, selectedSalesRep, isAdmin]);

  // --- Derived values ---
  const targetPct = stats.prevYearYTD > 0 ? Math.min(Math.round((stats.totalSalesYTD / stats.prevYearYTD) * 100), 200) : 0;
  const kgsTargetPct = stats.prevYearKgs > 0 ? Math.min(Math.round((stats.kgsYTD / stats.prevYearKgs) * 100), 200) : 0;
  const canSeeMorm = isAdmin
    ? (user?.designation_level ?? 99) >= 6
    : false;
  const periodLabel = PERIOD_LABEL[dateRange] || 'YTD';
  const periodLabelFull = PERIOD_LABEL_FULL[dateRange] || 'Year to Date';
  const isCurrentYear = selectedYear === new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  // --- AI-style insight ---
  const insightText = useMemo(() => {
    const parts = [];
    if (stats.yoyGrowth > 0) parts.push(`Tracking ${stats.yoyGrowth}% ahead of same period last year`);
    else if (stats.yoyGrowth < 0) parts.push(isAdmin
      ? `${Math.abs(stats.yoyGrowth)}% behind same period last year — needs attention`
      : `${Math.abs(stats.yoyGrowth)}% behind same period last year`);
    if (stats.activeCustomers > 0) parts.push(`${stats.activeCustomers} active customers across ${stats.totalCountries} countries`);
    if (isAdmin) {
      if (stats.monthCustomers > 0) parts.push(`${stats.monthCustomers} new orders this month`);
    } else {
      if (stats.totalProspects > 0) parts.push(`${stats.totalProspects} open prospects`);
    }
    return parts.length ? `${periodLabelFull}: ${parts.join(' · ')}` : 'Loading insights…';
  }, [stats.yoyGrowth, stats.activeCustomers, stats.totalCountries, stats.monthCustomers, stats.totalProspects, periodLabelFull, isAdmin]);

  // --- Max rep group value for progress bars ---
  const maxRepValue = useMemo(() => {
    if (!repGroupData.length) return 1;
    return Math.max(...repGroupData.map(r => parseFloat(r.total_amount || 0)), 1);
  }, [repGroupData]);

  // --- Trend chart data + linear regression + forecast ---
  const { chartData, projectedEOY } = useMemo(() => {
    const data = salesTrendData.map(d => ({
      ...d,
      pctDiff: (d.revenue > 0 && d.prevRevenue > 0) ? Math.round(((d.revenue - d.prevRevenue) / d.prevRevenue) * 100) : null,
    }));
    const pts = data.map((d, i) => ({ x: i, y: d.revenue })).filter(p => p.y > 0);
    let eoy = null;
    if (pts.length >= 2) {
      const n = pts.length, sx = pts.reduce((s, p) => s + p.x, 0), sy = pts.reduce((s, p) => s + p.y, 0);
      const sxy = pts.reduce((s, p) => s + p.x * p.y, 0), sxx = pts.reduce((s, p) => s + p.x * p.x, 0);
      const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
      const intercept = (sy - slope * sx) / n;
      data.forEach((d, i) => { d.trendLine = Math.max(0, Math.round(intercept + slope * i)); });
      if (pts.length >= 4 && data.length < 12) {
        const startIdx = data.length;
        const actualSum = data.reduce((s, d) => s + (d.revenue || 0), 0);
        let projSum = actualSum;
        for (let m = startIdx; m < 12; m++) projSum += Math.max(0, Math.round(intercept + slope * m));
        eoy = projSum * 1000;
        const projCount = Math.min(3, 12 - startIdx);
        for (let j = 0; j < projCount; j++) {
          const fi = startIdx + j;
          data.push({
            month: (MONTH_SHORT[fi] || 'P') + '°',
            revenue: null, prevRevenue: null, kgs: null, pctDiff: null,
            trendLine: Math.max(0, Math.round(intercept + slope * fi)),
            isProjection: true,
          });
        }
      }
    } else if (pts.length === 1) {
      data.forEach(d => { d.trendLine = pts[0].y; });
    }
    return { chartData: data, projectedEOY: eoy };
  }, [salesTrendData]);

  // --- Customer table columns ---
  const customerColumns = useMemo(() => [
    {
      title: '#',
      key: 'rank',
      width: 50,
      render: (_, __, idx) => {
        const cls = idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : '';
        return <span className={`crmx-rank ${cls}`}>{RANK_MEDALS[idx] || idx + 1}</span>;
      }
    },
    {
      title: 'Customer',
      dataIndex: 'customer_name',
      key: 'name',
      ellipsis: true,
      render: (name, record) => (
        <Space>
          <Avatar size={28} className="crmx-avatar" style={{ background: COLORS[(name?.charCodeAt(0) || 0) % COLORS.length] }}>
            {name?.charAt(0)?.toUpperCase()}
          </Avatar>
          <Text
            strong
            className={record.customer_id ? 'crmx-link' : ''}
            onClick={() => handleCustomerClick(record)}
          >
            {name}
          </Text>
        </Space>
      )
    },
    {
      title: 'Country',
      dataIndex: 'country',
      key: 'country',
      width: 130,
      ellipsis: { showTitle: true },
      render: v => <Tooltip title={v}><Text type="secondary">{v || '—'}</Text></Tooltip>
    },
    {
      title: 'Sales',
      dataIndex: 'total_amount',
      key: 'sales',
      width: 110,
      align: 'right',
      sorter: (a, b) => (a.total_amount || 0) - (b.total_amount || 0),
      defaultSortOrder: 'descend',
      render: v => v ? <Text strong><CurrencySymbol code={currencyCode} />{fmt(v)}</Text> : '—'
    }
  ], [handleCustomerClick, currencyCode]);

  // --- Customer concentration risk ---
  const concentrationRisk = useMemo(() => {
    if (recentCustomers.length < 4) return null;
    const sorted = [...recentCustomers].sort((a, b) => (b.total_amount || 0) - (a.total_amount || 0));
    const totalAmount = sorted.reduce((s, c) => s + (c.total_amount || 0), 0);
    if (!totalAmount) return null;
    const top3Sum = sorted.slice(0, 3).reduce((s, c) => s + (c.total_amount || 0), 0);
    const pct = Math.round((top3Sum / totalAmount) * 100);
    return pct > 50 ? pct : null;
  }, [recentCustomers]);

  // --- At-risk customers (last order 60+ days ago) ---
  const atRiskCustomers = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    return recentCustomers.filter(c => {
      if (!c.last_order_ym) return false;
      const ym = String(c.last_order_ym).replace(/[-\/]/g, '');
      const y = parseInt(ym.substring(0, 4));
      const m = parseInt(ym.substring(4, 6));
      if (!y || !m) return false;
      const lastDay = new Date(y, m, 0);
      return lastDay < cutoff;
    });
  }, [recentCustomers]);


  // ============================================================================
  return (
    <div className="crmx-dashboard">
      {/* ── CONTROLS BAR ── */}
      <div className="crmx-controls">
        <div className="crmx-controls-left">
          <FireOutlined className="crmx-controls-icon" />
          <span className="crmx-controls-title">Sales Cockpit</span>
          {isAdmin ? (
            isLocked ? (
              <Tag color="purple" className="crmx-filter-tag">
                <TeamOutlined style={{ marginRight: 4 }} />{lockedGroupName || 'My Group'}
              </Tag>
            ) : selectedSalesRep !== 'all' && (
              <Tag color="blue" className="crmx-filter-tag">
                {salesReps.find(r => r.id === selectedSalesRep)?.group_name || 'Filtered'}
              </Tag>
            )
          ) : (
            stats.groupName && (
              <Tag color="blue" className="crmx-filter-tag">{stats.groupName}</Tag>
            )
          )}
        </div>
        <Space size={8} wrap>
          <Select
            value={selectedYear}
            onChange={v => { setSelectedYear(v); if (dateRange === 'ytd' && v !== new Date().getFullYear()) setDateRange('fy'); }}
            size="small"
            style={{ width: 80 }}
            popupMatchSelectWidth={false}
          >
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
              <Option key={y} value={y}>{y}</Option>
            ))}
          </Select>
          <Segmented
            options={[
              { label: isCurrentYear ? 'YTD' : 'FY', value: isCurrentYear ? 'ytd' : 'fy' },
              { label: '1M', value: '1m' },
              { label: 'Q1', value: 'q1' },
              { label: (!isCurrentYear || currentMonth >= 3) ? 'Q2' : <Tooltip title="Available from Apr"><span>Q2</span></Tooltip>, value: 'q2', disabled: isCurrentYear && currentMonth < 3 },
              { label: (!isCurrentYear || currentMonth >= 6) ? 'Q3' : <Tooltip title="Available from Jul"><span>Q3</span></Tooltip>, value: 'q3', disabled: isCurrentYear && currentMonth < 6 },
              { label: (!isCurrentYear || currentMonth >= 9) ? 'Q4' : <Tooltip title="Available from Oct"><span>Q4</span></Tooltip>, value: 'q4', disabled: isCurrentYear && currentMonth < 9 },
              ...(isCurrentYear ? [{ label: 'FY', value: 'fy' }] : []),
            ]}
            value={dateRange}
            onChange={setDateRange}
            size="small"
            className="crmx-segmented"
          />
          {showGroupSelector && !isLocked && (
            <Select
              className="crmx-rep-select"
              value={selectedSalesRep}
              onChange={onSalesRepChange}
              size="small"
              popupMatchSelectWidth={false}
            >
              <Option value="all"><Space size={4}><TeamOutlined /> All Groups</Space></Option>
              {salesReps.map(r => <Option key={r.id} value={r.id}>{r.group_name}</Option>)}
            </Select>
          )}
          <Tooltip title="Refresh data">
            <Button
              size="small"
              type="text"
              icon={<ReloadOutlined spin={loading} />}
              onClick={handleRefresh}
              className="crmx-refresh-btn"
            />
          </Tooltip>
        </Space>
      </div>

      {/* ── ERROR ALERT ── */}
      {loadError && (
        <Alert
          type="error"
          message={loadError}
          showIcon
          closable
          onClose={() => setLoadError(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* ── AI INSIGHT BAR ── */}
      {!loading && stats.totalSalesYTD > 0 && (
        <div className="crmx-insight-bar">
          <BulbOutlined className="crmx-insight-icon" />
          <Text className="crmx-insight-text">{insightText}</Text>
          {concentrationRisk && (
            <Tag color="warning" icon={<WarningOutlined />} className="crmx-concentration-tag">
              Top 3 = {concentrationRisk}% revenue
            </Tag>
          )}
        </div>
      )}

      {loading && !stats.totalSalesYTD ? (
        <div className="crmx-skeleton-grid">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="crmx-skeleton-card">
              <Skeleton active paragraph={{ rows: 2 }} />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* ── HERO KPI ROW ── */}
          <div className="crmx-section-label">Key Metrics</div>
          <Row gutter={[16, 16]} className="crmx-section">
            {/* Revenue card — shared */}
            <Col xs={24} sm={12} lg={6}>
              <div className="crmx-kpi-card hero kpi-indigo">
                <div className="crmx-kpi-header">
                  <span className="crmx-kpi-icon ytd"><RiseOutlined /></span>
                  <GrowthBadge value={stats.yoyGrowth} suffix="YoY" />
                </div>
                <div className="crmx-kpi-value">
                  <CurrencySymbol code={currencyCode} />{fmt(stats.totalSalesYTD)}
                </div>
                <div className="crmx-kpi-label">{periodLabel} Revenue</div>
                {salesTrendData.length >= 2 && <Sparkline data={salesTrendData.map(d => d.revenue)} color="#6366f1" />}
                {isAdmin && stats.kgsYTD > 0 && (
                  <Text type="secondary" className="crmx-kpi-sub">
                    {(stats.kgsYTD / 1000).toFixed(1)} MT sold
                  </Text>
                )}
                {stats.prevYearYTD > 0 && (
                  <div className="crmx-kpi-target">
                    <Progress
                      percent={Math.min(targetPct, 100)}
                      size="small"
                      strokeColor={targetPct >= 100 ? '#10b981' : '#f59e0b'}
                      format={() => `${targetPct}%`}
                    />
                    <Text type="secondary" className="crmx-kpi-target-label">vs last year same period</Text>
                  </div>
                )}
                {stats.budgetTarget > 0 && (
                  <div className="crmx-kpi-target" style={{ marginTop: 4 }}>
                    <Progress
                      percent={Math.min(stats.budgetAchievementPct || 0, 100)}
                      size="small"
                      strokeColor={stats.budgetAchievementPct >= 100 ? '#10b981' : '#6366f1'}
                      format={() => `${stats.budgetAchievementPct}%`}
                    />
                    <Text type="secondary" className="crmx-kpi-target-label">
                      vs budget <CurrencySymbol code={currencyCode} />{fmt(stats.budgetTarget)}
                    </Text>
                  </div>
                )}
              </div>
            </Col>

            {/* Volume card — rep only */}
            {!isAdmin && (
              <Col xs={24} sm={12} lg={6}>
                <div className="crmx-kpi-card kpi-cyan">
                  <div className="crmx-kpi-header">
                    <span className="crmx-kpi-icon month"><ThunderboltOutlined /></span>
                    {stats.prevYearKgs > 0 && (
                      <GrowthBadge value={stats.prevYearKgs > 0 ? Math.round(((stats.kgsYTD - stats.prevYearKgs) / stats.prevYearKgs) * 100) : 0} suffix="YoY" />
                    )}
                  </div>
                  <div className="crmx-kpi-value">
                    {(stats.kgsYTD / 1000).toFixed(1)} MT
                  </div>
                  <div className="crmx-kpi-label">Volume Sold ({periodLabel})</div>
                  {salesTrendData.length >= 2 && <Sparkline data={salesTrendData.map(d => d.kgs)} color="#06b6d4" />}
                  {stats.prevYearKgs > 0 && (
                    <div className="crmx-kpi-target">
                      <Progress
                        percent={Math.min(kgsTargetPct, 100)}
                        size="small"
                        strokeColor={kgsTargetPct >= 100 ? '#10b981' : '#f59e0b'}
                        format={() => `${kgsTargetPct}%`}
                      />
                      <Text type="secondary" className="crmx-kpi-target-label">vs last year same period</Text>
                    </div>
                  )}
                </div>
              </Col>
            )}

            {/* MoRM card — conditional on canSeeMorm */}
            {canSeeMorm && (
              <Col xs={24} sm={12} lg={6}>
                <div className="crmx-kpi-card kpi-emerald">
                  <div className="crmx-kpi-header">
                    <span className="crmx-kpi-icon month"><FundOutlined /></span>
                    {stats.prevYearMormPct > 0 && (
                      <span className={`crmx-growth-badge ${stats.mormPct >= stats.prevYearMormPct ? 'up' : 'down'}`}>
                        {stats.mormPct >= stats.prevYearMormPct ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                        {stats.mormPct >= stats.prevYearMormPct ? '+' : ''}{(stats.mormPct - stats.prevYearMormPct).toFixed(2)}pp
                      </span>
                    )}
                  </div>
                  <div className="crmx-kpi-value">
                    {stats.mormPct.toFixed(2)}%
                  </div>
                  <div className="crmx-kpi-label">MoRM ({periodLabel})</div>
                  <Text type="secondary" className="crmx-kpi-sub">
                    <CurrencySymbol code={currencyCode} />{fmt(stats.morm)} margin · Last yr: {stats.prevYearMormPct.toFixed(2)}%
                  </Text>
                </div>
              </Col>
            )}

            {/* Active Customers card — different sub-text for admin vs rep */}
            <Col xs={24} sm={12} lg={6}>
              <div
                className="crmx-kpi-card kpi-amber"
                onClick={handleActiveCustomersClick}
                style={{ cursor: 'pointer' }}
                title="View active customers with new highlights"
              >
                <div className="crmx-kpi-header">
                  <span className="crmx-kpi-icon customers"><ContactsOutlined /></span>
                  {isAdmin ? (
                    <Tag className="crmx-kpi-tag">{stats.monthCustomers} this month</Tag>
                  ) : (
                    stats.prevYearCustomers > 0 && (
                      <GrowthBadge value={Math.round(((stats.activeCustomers - stats.prevYearCustomers) / stats.prevYearCustomers) * 100)} suffix="YoY" />
                    )
                  )}
                </div>
                <div className="crmx-kpi-value">{stats.activeCustomers}</div>
                <div className="crmx-kpi-label">Active Customers ({periodLabel})</div>
                <Text type="secondary" className="crmx-kpi-sub">
                  {isAdmin ? (
                    <>{stats.totalCustomers} total (2yr) &middot; {stats.totalCountries} countries · <span className="crmx-link">View details →</span></>
                  ) : (
                    <>Last yr same period: {stats.prevYearCustomers} · <span className="crmx-link">View details →</span></>
                  )}
                </Text>
              </div>
            </Col>

            {/* Avg Revenue / Prospects card — different layout for admin vs rep */}
            <Col xs={24} sm={12} lg={6}>
              <div
                className={`crmx-kpi-card ${isAdmin ? 'kpi-cyan' : 'kpi-purple'}`}
                onClick={() => navigate('/crm/prospects')}
                style={{ cursor: 'pointer' }}
                title="View prospect pipeline"
              >
                <div className="crmx-kpi-header">
                  <span className="crmx-kpi-icon avg"><ShoppingOutlined /></span>
                  {isAdmin && stats.totalProductGroups > 0 && (
                    <Tag className="crmx-kpi-tag">{stats.totalProductGroups} PGs</Tag>
                  )}
                </div>
                <div className="crmx-kpi-value">
                  {isAdmin ? (
                    <><CurrencySymbol code={currencyCode} />{fmt(stats.avgOrderValue)}</>
                  ) : (
                    stats.activeCustomers > 0
                      ? <><CurrencySymbol code={currencyCode} />{fmt(Math.round(stats.totalSalesYTD / stats.activeCustomers))}</>
                      : '—'
                  )}
                </div>
                <div className="crmx-kpi-label">Avg Revenue / Customer{!isAdmin ? ` (${periodLabel})` : ''}</div>
                <Text type="secondary" className="crmx-kpi-sub">
                  {isAdmin ? (
                    <>{stats.totalProspects > 0 ? `${stats.totalProspects} open prospects` : `${(stats.kgsYTD / 1000).toFixed(1)} MT volume`} · <span className="crmx-link">View pipeline →</span></>
                  ) : (
                    <>{stats.totalProspects} open prospects · <span className="crmx-link">View pipeline →</span></>
                  )}
                </Text>
              </div>
            </Col>
          </Row>

          {/* ── SALES TREND — full row ── */}
          <div className="crmx-section-label">Sales Trend</div>
          <Row gutter={[16, 16]} className="crmx-section">
            <Col xs={24}>
              <Card variant="borderless" className="crmx-card">
                <div className="crmx-card-header">
                  <Space size={8}>
                    <LineChartOutlined className="crmx-card-icon" />
                    <Text strong>Sales Trend</Text>
                    <Tag color="default" className="crmx-period-tag">{periodLabelFull}</Tag>
                  </Space>
                  {salesTrendData.length > 0 && (
                    <Text type="secondary" className="crmx-chart-summary">
                      Total: <CurrencySymbol code={currencyCode} />{fmt(salesTrendData.reduce((s, d) => s + d.revenue * 1000, 0))}
                    </Text>
                  )}
                  {projectedEOY && (
                    <Tag color="orange" className="crmx-forecast-tag">
                      Projected EOY: <CurrencySymbol code={currencyCode} />{fmt(projectedEOY)}
                    </Tag>
                  )}
                </div>
                {chartData.length === 0 ? (
                  <div className="crmx-empty-state" style={{ padding: '48px 0' }}>
                    <LineChartOutlined style={{ fontSize: 32, color: '#d9d9d9' }} />
                    <Text type="secondary" style={{ marginTop: 8 }}>No trend data for this period</Text>
                  </div>
                ) : (() => {
                  const PctLabel = makePctLabel(chartData);
                  return (
                    <ResponsiveContainer width="100%" height={300}>
                      <ComposedChart data={chartData} margin={{ top: 36, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                        <XAxis dataKey="month" stroke="#a0a0a0" fontSize={12} tickLine={false} />
                        <YAxis stroke="#a0a0a0" fontSize={11} tickLine={false} axisLine={false} />
                        <RechartsTooltip content={<ChartTooltip currencyCode={currencyCode} />} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="prevRevenue" name="Prev Year" fill="#a5b4fc" radius={[6, 6, 0, 0]} maxBarSize={52} />
                        <Bar dataKey="revenue" name="This Year" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={52}>
                          <LabelList content={<PctLabel />} />
                        </Bar>
                        <Line type="monotone" dataKey="trendLine" name="Trend" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" dot={false} activeDot={false} legendType="line" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  );
                })()}
              </Card>
            </Col>
          </Row>

          {/* ── PRODUCT MIX + ACTIVITY + COUNTRIES/REPS ── */}
          <div className="crmx-section-label">{isAdmin ? 'Product Mix & Team Performance' : 'Product Mix & Markets'}</div>
          <Row gutter={[16, 16]} className="crmx-section">
            <Col xs={24} lg={10}>
              <Card variant="borderless" className="crmx-card">
                <div className="crmx-card-header">
                  <Text strong>Product Mix ({periodLabel})</Text>
                </div>
                <div className="crmx-donut-container">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={productMixData}
                        cx="50%" cy="50%"
                        innerRadius={55} outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {productMixData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <RechartsTooltip formatter={(val, name) => [`${val}%`, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="crmx-donut-center">
                    <Text strong className="crmx-donut-center-value">{productMixData.length}</Text>
                    <Text type="secondary" className="crmx-donut-center-label">Groups</Text>
                  </div>
                </div>
                <div className="crmx-legend">
                  {productMixData.map((item, i) => (
                    <div key={i} className="crmx-legend-item">
                      <span className="crmx-legend-dot" style={{ background: item.color }} />
                      <Text className="crmx-legend-name" ellipsis={{ tooltip: item.name }}>{item.name}</Text>
                      <Text strong className="crmx-legend-val">{item.value}%</Text>
                    </div>
                  ))}
                </div>
              </Card>
            </Col>

            {/* Activity Feed */}
            <Col xs={24} lg={8}>
              <Card variant="borderless" className="crmx-card">
                <div className="crmx-card-header">
                  <Space size={8}>
                    <ClockCircleOutlined className="crmx-card-icon" />
                    <Text strong>Activity Feed</Text>
                  </Space>
                  <ActivityLogDrawer onLogged={isAdmin ? () => {} : loadDashboardData} />
                </div>
                <ActivityFeed {...(isAdmin ? {} : { repId: 'me' })} limit={8} compact />
              </Card>
            </Col>

            {/* Top Countries + optional Rep Groups */}
            <Col xs={24} lg={6}>
              <Card variant="borderless" className="crmx-card crmx-card-compact">
                <div className="crmx-card-header">
                  <Space size={8}><GlobalOutlined className="crmx-card-icon" /><Text strong>Top Countries</Text></Space>
                </div>
                <div className="crmx-mini-list">
                  {(stats.topCountries || []).slice(0, 5).map((c, i) => {
                    const maxCount = stats.topCountries?.[0]?.count || 1;
                    return (
                      <div key={i} className="crmx-mini-list-item">
                        <Space size={6}>
                          <span className={`crmx-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`}>{i + 1}</span>
                          <Text ellipsis className="crmx-mini-list-name">{c.name}</Text>
                        </Space>
                        <div className="crmx-country-bar-bg">
                          <div className="crmx-country-bar" style={{ width: `${Math.round((c.count / maxCount) * 100)}%` }} />
                        </div>
                        <Tag>{c.count}</Tag>
                      </div>
                    );
                  })}
                  {(!stats.topCountries || stats.topCountries.length === 0) && (
                    <div className="crmx-empty-state small">
                      <Text type="secondary">No data</Text>
                    </div>
                  )}
                </div>
              </Card>

              {showRepGroups && selectedSalesRep === 'all' && repGroupData.length > 0 && (
                <Card variant="borderless" className="crmx-card crmx-card-compact" style={{ marginTop: 16 }}>
                  <div className="crmx-card-header">
                    <Space size={8}><TrophyOutlined className="crmx-card-icon" /><Text strong>Rep Groups</Text></Space>
                  </div>
                  <div className="crmx-mini-list">
                    {repGroupData.slice(0, 5).map((r, i) => {
                      const val = parseFloat(r.total_amount || 0);
                      const pct = maxRepValue > 0 ? Math.round((val / maxRepValue) * 100) : 0;
                      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1);
                      return (
                        <div key={i} className="crmx-rep-group-item">
                          <div className="crmx-rep-group-header">
                            <Space size={6}>
                              <span className={`crmx-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`}>{medal}</span>
                              <Text ellipsis className="crmx-mini-list-name">{r.group_name}</Text>
                            </Space>
                            <Text strong className="crmx-mini-list-val">
                              <CurrencySymbol code={currencyCode} />{fmt(val)}
                            </Text>
                          </div>
                          <div className="crmx-rep-group-bar-bg">
                            <div className="crmx-rep-group-bar" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                          </div>
                          {parseInt(r.customer_count || 0) > 0 && (
                            <Text type="secondary" className="crmx-rep-group-sub">{r.customer_count} customers</Text>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}
            </Col>
          </Row>

          {/* ── TOP CUSTOMERS — full width ── */}
          <div className="crmx-section-label">Top Customers</div>
          <Row gutter={[16, 16]} className="crmx-section">
            <Col xs={24}>
              <Card variant="borderless" className="crmx-card">
                <div className="crmx-card-header">
                  <Space size={8}>
                    <ContactsOutlined className="crmx-card-icon" />
                    <Text strong>Top Customers</Text>
                  </Space>
                  <Space size={8}>
                    {atRiskCustomers.length > 0 && (
                      <Segmented
                        options={[
                          { label: 'Top', value: 'top' },
                          { label: `At Risk (${atRiskCustomers.length})`, value: 'atRisk' },
                        ]}
                        value={customerView}
                        onChange={setCustomerView}
                        size="small"
                      />
                    )}
                    <Tag color="default">{periodLabel}</Tag>
                    {!isAdmin && (
                      <Button type="link" size="small" onClick={() => navigate('/crm/customers')} style={{ padding: 0, fontSize: 12 }}>
                        View All →
                      </Button>
                    )}
                  </Space>
                </div>
                <Table
                  dataSource={customerView === 'atRisk' ? atRiskCustomers : (isAdmin ? recentCustomers : recentCustomers.slice(0, 8))}
                  rowKey={(r) => r.customer_id || r.id}
                  pagination={false}
                  size="small"
                  loading={loading}
                  className="crmx-table"
                  scroll={{ x: true }}
                  columns={customerColumns}
                  summary={(data) => {
                    if (!data.length) return null;
                    const total = data.reduce((s, r) => s + (r.total_amount || 0), 0);
                    return (
                      <Table.Summary.Row className="crmx-table-summary">
                        <Table.Summary.Cell index={0} />
                        <Table.Summary.Cell index={1}>
                          <Text strong>Grand Total ({data.length})</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={2} />
                        <Table.Summary.Cell index={3} align="right">
                          <Text strong><CurrencySymbol code={currencyCode} />{fmt(total)}</Text>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    );
                  }}
                />
              </Card>
            </Col>
          </Row>

          {/* ── TASKS — admin gets full row, rep gets it alongside DailyActivity ── */}
          {isAdmin ? (
            <Row gutter={[16, 16]} className="crmx-section" style={{ marginTop: 8 }}>
              <Col xs={24}>
                <TaskWidget />
              </Col>
            </Row>
          ) : (
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              {showDailyActivity && (
                <Col xs={24} lg={8}>
                  <DailyActivitySummary onRefresh={loading} />
                </Col>
              )}
              <Col xs={24} lg={showDailyActivity ? 16 : 24}>
                <TaskWidget />
              </Col>
            </Row>
          )}

          {/* ── PIPELINE & RISK ALERTS ── */}
          <Collapse
            ghost
            defaultActiveKey={['pipeline-alerts']}
            style={{ marginTop: 8 }}
            items={[{
              key: 'pipeline-alerts',
              label: <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary, #1e293b)' }}>Pipeline &amp; Alerts</span>,
              children: (
                <Row gutter={[16, 16]}>
                  <Col xs={24} lg={8}>
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                      <PipelineSummaryCard />
                      {showConversionRate && conversionData && (
                        <div className="crmx-kpi-card kpi-purple">
                          <div className="crmx-kpi-header">
                            <span className="crmx-kpi-icon avg"><RiseOutlined /></span>
                            {conversionData.delta_pct !== null && (
                              <span className={`crmx-growth-badge ${conversionData.delta_pct >= 0 ? 'up' : 'down'}`}>
                                {conversionData.delta_pct >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                                {conversionData.delta_pct >= 0 ? '+' : ''}{conversionData.delta_pct}pp vs prev 90d
                              </span>
                            )}
                          </div>
                          <div className="crmx-kpi-value">
                            {conversionData.conversion_rate_pct !== null ? `${conversionData.conversion_rate_pct}%` : '—'}
                          </div>
                          <div className="crmx-kpi-label">Inquiry Conversion Rate (90d)</div>
                          <Text type="secondary" className="crmx-kpi-sub">
                            {conversionData.converted} of {conversionData.total_closed} closed inquiries converted
                            {conversionData.prev_rate_pct !== null && ` · prev: ${conversionData.prev_rate_pct}%`}
                          </Text>
                        </div>
                      )}
                    </Space>
                  </Col>
                  <Col xs={24} lg={16}>
                    <RiskAlertPanel groupId={isAdmin && selectedSalesRep !== 'all' ? selectedSalesRep : null} />
                  </Col>
                </Row>
              ),
            }]}
          />
        </>
      )}

      <CustomerSalesHistoryModal
        visible={salesHistoryModalVisible}
        onClose={() => setSalesHistoryModalVisible(false)}
        customer={selectedCustomer}
      />

      {/* Active Customers drill-down modal */}
      <Modal
        title={
          <Space>
            <ContactsOutlined />
            <span>Active Customers ({periodLabel} {selectedYear})</span>
            {activeCustomersNewCount > 0 && (
              <Badge count={`${activeCustomersNewCount} new`} style={{ backgroundColor: '#52c41a' }} />
            )}
          </Space>
        }
        open={activeCustomersModal}
        onCancel={() => setActiveCustomersModal(false)}
        width="95%"
        style={{ top: 20 }}
        footer={null}
        destroyOnHidden
      >
        <Table
          dataSource={activeCustomersList}
          rowKey={(r) => r.customer_name + (r.country || '')}
          loading={activeCustomersLoading}
          size="small"
          bordered
          pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['25','50','100','200'], showTotal: (t) => `${t} customers` }}
          scroll={{ y: 500 }}
          rowClassName={(record) => record.is_new ? 'crm-row-new-customer' : ''}
          columns={[
            {
              title: '',
              dataIndex: 'is_new',
              key: 'is_new_icon',
              width: 40,
              align: 'center',
              render: (isNew) => isNew ? <Tooltip title="New customer — not active in same period last year"><StarFilled style={{ color: '#faad14', fontSize: 16 }} /></Tooltip> : null,
              filters: [{ text: 'New customers only', value: true }, { text: 'Returning', value: false }],
              onFilter: (value, record) => record.is_new === value,
            },
            {
              title: 'Customer Name',
              dataIndex: 'customer_name',
              key: 'customer_name',
              ellipsis: true,
              sorter: (a, b) => (a.customer_name || '').localeCompare(b.customer_name || ''),
              render: (name, record) => (
                <Space>
                  <span style={{ fontWeight: record.is_new ? 600 : 400 }}>{name}</span>
                  {record.is_new && <Tag color="green" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>NEW</Tag>}
                </Space>
              ),
            },
            {
              title: 'Country',
              dataIndex: 'country',
              key: 'country',
              width: 130,
              filters: [...new Set(activeCustomersList.map(c => c.country).filter(Boolean))].sort().map(c => ({ text: c, value: c })),
              onFilter: (v, r) => r.country === v,
            },
            {
              title: 'Sales Rep Group',
              dataIndex: 'sales_rep_group_name',
              key: 'sales_rep_group_name',
              width: 160,
              ellipsis: true,
              filters: [...new Set(activeCustomersList.map(c => c.sales_rep_group_name).filter(Boolean))].sort().map(c => ({ text: c, value: c })),
              onFilter: (v, r) => r.sales_rep_group_name === v,
            },
            {
              title: () => <Space size={4}><span>Revenue</span><CurrencySymbol code={currencyCode} /></Space>,
              dataIndex: 'total_amount',
              key: 'total_amount',
              width: 140,
              align: 'right',
              sorter: (a, b) => a.total_amount - b.total_amount,
              defaultSortOrder: 'descend',
              render: (v) => <span style={{ fontWeight: 500 }}>{fmt(v)}</span>,
            },
            {
              title: 'Kgs',
              dataIndex: 'total_kgs',
              key: 'total_kgs',
              width: 110,
              align: 'right',
              sorter: (a, b) => a.total_kgs - b.total_kgs,
              render: (v) => v?.toLocaleString('en-US') || '0',
            },
            {
              title: 'Txns',
              dataIndex: 'txn_count',
              key: 'txn_count',
              width: 70,
              align: 'center',
              sorter: (a, b) => a.txn_count - b.txn_count,
            },
            {
              title: 'Last Order',
              dataIndex: 'last_order_ym',
              key: 'last_order_ym',
              width: 100,
              align: 'center',
              sorter: (a, b) => (a.last_order_ym || '').localeCompare(b.last_order_ym || ''),
            },
          ]}
          summary={(pageData) => {
            if (!pageData.length) return null;
            const totalAmt = pageData.reduce((s, r) => s + (r.total_amount || 0), 0);
            const totalKg = pageData.reduce((s, r) => s + (r.total_kgs || 0), 0);
            const newCount = pageData.filter(r => r.is_new).length;
            return (
              <Table.Summary fixed>
                <Table.Summary.Row className="crmx-table-summary">
                  <Table.Summary.Cell index={0} />
                  <Table.Summary.Cell index={1}><Text strong>Page Total ({pageData.length} customers{newCount > 0 ? `, ${newCount} new` : ''})</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={2} />
                  <Table.Summary.Cell index={3} />
                  <Table.Summary.Cell index={4} align="right"><Text strong><CurrencySymbol code={currencyCode} />{fmt(totalAmt)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right"><Text strong>{totalKg.toLocaleString('en-US')}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={6} />
                  <Table.Summary.Cell index={7} />
                </Table.Summary.Row>
              </Table.Summary>
            );
          }}
        />
      </Modal>

      {showQuickLog && <QuickLogFAB onLogged={() => {}} />}
    </div>
  );
};

export default SalesCockpit;
