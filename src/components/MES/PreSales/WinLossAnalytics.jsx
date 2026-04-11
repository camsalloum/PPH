/**
 * Win/Loss Analytics Dashboard
 * Consumes /api/mes/presales/analytics/lost-reasons endpoint.
 * Shows: win/loss funnel, lost reasons by category, competitor analysis.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Typography, Spin, Alert, Tag, Space, DatePicker, Statistic, Progress, Empty } from 'antd';
import {
  TrophyOutlined, FrownOutlined, FunnelPlotOutlined,
  PieChartOutlined, TeamOutlined, ReloadOutlined
} from '@ant-design/icons';
import { PieChart, Pie, Cell, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Bar } from 'recharts/es6/cartesian/Bar';
import axios from 'axios';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;
const API_BASE = import.meta.env.VITE_API_URL || '';

const COLORS = ['#6366f1', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const WinLossAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [dateRange, setDateRange] = useState([null, null]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('auth_token');
      const params = {};
      if (dateRange[0]) params.from = dateRange[0].format('YYYY-MM-DD');
      if (dateRange[1]) params.to = dateRange[1].format('YYYY-MM-DD');
      const res = await axios.get(`${API_BASE}/api/mes/presales/analytics/lost-reasons`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      if (res.data.success) setData(res.data.data);
      else setError(res.data.error || 'Failed to load analytics');
    } catch (err) {
      setError(err.response?.status === 403 ? 'Management access required' : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;
  if (error) return <Alert type="error" message={error} showIcon style={{ margin: 24 }} />;
  if (!data) return <Empty description="No data available" />;

  const wl = data.win_loss || {};
  const total = parseInt(wl.total || 0);
  const won = parseInt(wl.won || 0);
  const lost = parseInt(wl.lost || 0);
  const inProgress = parseInt(wl.in_progress || 0);
  const winRate = total > 0 ? Math.round((won / (won + lost || 1)) * 100) : 0;

  const funnelData = [
    { name: 'Total Inquiries', value: total, color: '#6366f1' },
    { name: 'In Progress', value: inProgress, color: '#f59e0b' },
    { name: 'Won', value: won, color: '#10b981' },
    { name: 'Lost', value: lost, color: '#ef4444' },
  ];

  const categoryData = (data.by_category || []).map((c, i) => ({
    name: c.category,
    count: parseInt(c.count),
    color: COLORS[i % COLORS.length],
  }));

  const competitorData = (data.by_competitor || []).map((c, i) => ({
    name: c.competitor,
    count: parseInt(c.count),
    color: COLORS[i % COLORS.length],
  }));

  return (
    <div style={{ padding: '0 0 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <FunnelPlotOutlined style={{ fontSize: 20, color: '#6366f1' }} />
          <Title level={4} style={{ margin: 0 }}>Win/Loss Analytics</Title>
        </Space>
        <Space>
          <RangePicker size="small" onChange={(dates) => setDateRange(dates || [null, null])} />
          <ReloadOutlined onClick={fetchData} style={{ cursor: 'pointer', color: '#6366f1' }} />
        </Space>
      </div>

      {/* Win Rate + Funnel Summary */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card variant="borderless">
            <Statistic
              title="Win Rate"
              value={winRate}
              suffix="%"
              prefix={<TrophyOutlined style={{ color: '#10b981' }} />}
              valueStyle={{ color: winRate >= 50 ? '#10b981' : '#ef4444' }}
            />
            <Progress percent={winRate} strokeColor={winRate >= 50 ? '#10b981' : '#ef4444'} size="small" style={{ marginTop: 8 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>{won} won / {won + lost} closed</Text>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless">
            <Statistic title="Total Inquiries" value={total} prefix={<FunnelPlotOutlined style={{ color: '#6366f1' }} />} />
            <Space style={{ marginTop: 8 }} wrap>
              <Tag color="processing">{inProgress} active</Tag>
              <Tag color="success">{won} won</Tag>
              <Tag color="error">{lost} lost</Tag>
            </Space>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card variant="borderless">
            <Statistic
              title="Lost Inquiries"
              value={lost}
              prefix={<FrownOutlined style={{ color: '#ef4444' }} />}
              valueStyle={{ color: '#ef4444' }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {categoryData.length} reason categories · {competitorData.length} competitors
            </Text>
          </Card>
        </Col>
      </Row>

      {/* Charts Row */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* Lost Reasons by Category */}
        <Col xs={24} lg={12}>
          <Card title={<Space><PieChartOutlined /> Lost Reasons by Category</Space>} variant="borderless">
            {categoryData.length === 0 ? (
              <Empty description="No lost reason data" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="count">
                      {categoryData.map((e) => <Cell key={e.name} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(val, name) => [val, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ marginTop: 8 }}>
                  {categoryData.map((c) => (
                    <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <Space size={6}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, display: 'inline-block' }} />
                        <Text>{c.name}</Text>
                      </Space>
                      <Tag>{c.count}</Tag>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </Col>

        {/* Lost to Competitor */}
        <Col xs={24} lg={12}>
          <Card title={<Space><TeamOutlined /> Lost to Competitor</Space>} variant="borderless">
            {competitorData.length === 0 ? (
              <Empty description="No competitor data" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={competitorData} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" name="Lost Deals" fill="#ef4444" radius={[0, 4, 4, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default WinLossAnalytics;
