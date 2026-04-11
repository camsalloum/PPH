/**
 * CRMAnalytics — Admin-only analytics dashboard
 *
 * Tabs:
 *   1. Activity Leaderboard
 *   2. Deal Funnel
 *   3. Revenue Forecast
 *   4. Engagement Scores (at-risk customers)
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Tabs, Statistic, Row, Col, Tag, Progress,
  Select, Spin, Empty, Typography, Space, Button, Tooltip,
} from 'antd';
import {
  TrophyOutlined, FunnelPlotOutlined, DollarOutlined,
  HeartOutlined, ReloadOutlined, BarChartOutlined,
} from '@ant-design/icons';
import axios from 'axios';

const { Title, Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

function getHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('auth_token')}` };
}

// ── Activity Leaderboard Tab ─────────────────────────────────────────────────
function LeaderboardTab() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/crm/analytics/activity-leaderboard`, {
        headers: getHeaders(), params: { period },
      });
      setData((res.data?.data || []).map((r, i) => ({ ...r, rank: i + 1 })));
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const columns = [
    { title: '#', dataIndex: 'rank', key: 'rank', width: 40 },
    { title: 'Rep', dataIndex: 'rep_name', key: 'rep_name', render: (v) => v || 'Unknown' },
    { title: 'Total', dataIndex: 'total', key: 'total', sorter: (a, b) => a.total - b.total, defaultSortOrder: 'descend' },
    { title: 'Calls', dataIndex: 'calls', key: 'calls' },
    { title: 'Visits', dataIndex: 'visits', key: 'visits' },
    { title: 'Emails', dataIndex: 'emails', key: 'emails' },
    { title: 'WhatsApp', dataIndex: 'whatsapp', key: 'whatsapp' },
    { title: 'Follow-ups', dataIndex: 'follow_ups', key: 'follow_ups' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
        <Select value={period} onChange={setPeriod} style={{ width: 140 }}>
          <Select.Option value="week">Last 7 days</Select.Option>
          <Select.Option value="month">Last 30 days</Select.Option>
          <Select.Option value="quarter">Last 90 days</Select.Option>
          <Select.Option value="ytd">Year to Date</Select.Option>
        </Select>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
      </div>
      <Table
        dataSource={data}
        columns={columns}
        rowKey="rep_id"
        loading={loading}
        pagination={false}
        size="small"
      />
    </div>
  );
}


// ── Deal Funnel Tab ──────────────────────────────────────────────────────────
function DealFunnelTab() {
  const [data, setData] = useState({ funnel: [], current: [] });
  const [cycleTime, setCycleTime] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [funnelRes, cycleRes] = await Promise.all([
          axios.get(`${API_BASE}/api/crm/analytics/deal-funnel`, { headers: getHeaders() }),
          axios.get(`${API_BASE}/api/crm/analytics/deal-cycle-time`, { headers: getHeaders() }),
        ]);
        setData(funnelRes.data?.data || { funnel: [], current: [] });
        setCycleTime(cycleRes.data?.data || null);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <Spin />;

  const STAGE_COLORS = {
    qualified: '#1890ff', proposal: '#722ed1', negotiation: '#fa8c16', won: '#52c41a', lost: '#f5222d',
  };

  const maxCount = Math.max(...data.funnel.map(f => parseInt(f.deal_count) || 1), 1);

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="Avg Days to Close"
              value={cycleTime?.overall?.avg_days_to_close || 0}
              suffix="days"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="Closed Deals"
              value={cycleTime?.overall?.closed_deals || 0}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="Active Pipeline"
              value={data.current.filter(c => !['confirmed', 'lost'].includes(c.stage)).reduce((s, c) => s + parseInt(c.count || 0), 0)}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Conversion Funnel" size="small">
        {data.funnel.length === 0 ? <Empty description="No deal history yet" /> : (
          <div>
            {data.funnel.map(f => (
              <div key={f.stage} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Tag color={STAGE_COLORS[f.stage] || 'default'}>
                    {f.stage?.charAt(0).toUpperCase() + f.stage?.slice(1)}
                  </Tag>
                  <Text>{f.deal_count} deals</Text>
                </div>
                <Progress
                  percent={Math.round((parseInt(f.deal_count) / maxCount) * 100)}
                  showInfo={false}
                  strokeColor={STAGE_COLORS[f.stage] || '#1890ff'}
                  size="small"
                />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Revenue Forecast Tab ─────────────────────────────────────────────────────
function RevenueForecastTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API_BASE}/api/crm/analytics/revenue-forecast`, { headers: getHeaders() });
        setData(res.data?.data || null);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <Spin />;
  if (!data) return <Empty />;

  const STAGE_COLORS = {
    qualified: '#1890ff', proposal: '#722ed1', negotiation: '#fa8c16',
  };

  const fmt = (v) => new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(v);

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small">
            <Statistic title="Total Pipeline" value={fmt(data.totalPipeline)} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small">
            <Statistic title="Weighted Forecast" value={fmt(data.totalWeighted)} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
      </Row>

      <Table
        dataSource={data.stages}
        rowKey="stage"
        pagination={false}
        size="small"
        columns={[
          {
            title: 'Stage', dataIndex: 'stage', key: 'stage',
            render: (v) => <Tag color={STAGE_COLORS[v] || 'default'}>{v?.charAt(0).toUpperCase() + v?.slice(1)}</Tag>,
          },
          { title: 'Deals', dataIndex: 'deal_count', key: 'deal_count' },
          { title: 'Total Value', dataIndex: 'total_value', key: 'total_value', render: fmt },
          {
            title: 'Probability', dataIndex: 'probability', key: 'probability',
            render: (v) => v != null ? `${Math.round(v * 100)}%` : '\u2014',
          },
          {
            title: 'Weighted', dataIndex: 'weighted_value', key: 'weighted_value',
            render: fmt,
          },
        ]}
      />
    </div>
  );
}

// ── Engagement Scores Tab ────────────────────────────────────────────────────
function EngagementTab() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API_BASE}/api/crm/analytics/engagement-scores`, {
          headers: getHeaders(), params: { limit: 30 },
        });
        setData(res.data?.data || []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  const riskLevel = (score) => {
    if (score === 0) return <Tag color="red">No Engagement</Tag>;
    if (score <= 3) return <Tag color="orange">Low</Tag>;
    if (score <= 8) return <Tag color="blue">Medium</Tag>;
    return <Tag color="green">Active</Tag>;
  };

  return (
    <Table
      dataSource={data}
      rowKey="customer_id"
      loading={loading}
      size="small"
      pagination={{ pageSize: 15 }}
      columns={[
        { title: 'Customer', dataIndex: 'customer_name', key: 'customer_name' },
        { title: 'Country', dataIndex: 'country', key: 'country' },
        { title: 'Activities (30d)', dataIndex: 'activity_count', key: 'activity_count' },
        { title: 'Notes (30d)', dataIndex: 'note_count', key: 'note_count' },
        { title: 'Tasks (30d)', dataIndex: 'task_count', key: 'task_count' },
        { title: 'Score', dataIndex: 'score', key: 'score', sorter: (a, b) => a.score - b.score, defaultSortOrder: 'ascend' },
        { title: 'Risk', key: 'risk', render: (_, r) => riskLevel(parseInt(r.score)) },
      ]}
    />
  );
}

// ── Main Analytics Component ─────────────────────────────────────────────────
export default function CRMAnalytics() {
  const items = [
    {
      key: 'leaderboard',
      label: <span><TrophyOutlined /> Leaderboard</span>,
      children: <LeaderboardTab />,
    },
    {
      key: 'funnel',
      label: <span><FunnelPlotOutlined /> Deal Funnel</span>,
      children: <DealFunnelTab />,
    },
    {
      key: 'forecast',
      label: <span><DollarOutlined /> Revenue Forecast</span>,
      children: <RevenueForecastTab />,
    },
    {
      key: 'engagement',
      label: <span><HeartOutlined /> Engagement</span>,
      children: <EngagementTab />,
    },
  ];

  return (
    <div style={{ padding: '16px 24px' }}>
      <Title level={4} style={{ marginBottom: 16 }}>
        <BarChartOutlined /> CRM Analytics
      </Title>
      <Tabs items={items} />
    </div>
  );
}
