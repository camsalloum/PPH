/**
 * FullPipelineDashboard.jsx — Management-only pipeline overview
 * Funnel chart, cycle time bars, stalled items table, revenue forecast cards
 * Data source: GET /api/crm/dashboard/pipeline
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Col, Row, Spin, Statistic, Table, Tag, Typography, Empty, Progress, Alert } from 'antd';
import {
  FunnelPlotOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  DollarOutlined,
  RiseOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const PHASE_LABELS = {
  prospecting: 'Prospecting',
  qualification: 'Qualification',
  clearance: 'Clearance',
  quotation: 'Quotation',
  order: 'Order',
  production: 'Production',
};
const PHASE_COLORS = {
  prospecting: '#1890ff',
  qualification: '#722ed1',
  clearance: '#fa8c16',
  quotation: '#13c2c2',
  order: '#52c41a',
  production: '#eb2f96',
};

const STAGE_TAG_COLORS = {
  new: 'blue', sar_pending: 'cyan', sent_to_qc: 'geekblue', qc_in_progress: 'purple',
  qc_received: 'purple', cse_pending: 'magenta', cse_approved: 'green',
  presales_cleared: 'orange', moq_check: 'gold', material_check: 'gold',
  estimation: 'volcano', quoted: 'cyan', negotiation: 'orange',
  price_accepted: 'lime', proforma_sent: 'green', proforma_confirmed: 'green', order_confirmed: 'green',
  in_production: 'blue', ready_dispatch: 'geekblue', delivered: 'green', closed: 'default',
};

function formatCurrency(val) {
  const n = parseFloat(val) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

export default function FullPipelineDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [drillPhase, setDrillPhase] = useState(null);
  const [drillData, setDrillData] = useState([]);
  const [drillLoading, setDrillLoading] = useState(false);

  const headers = useMemo(() => {
    const token = localStorage.getItem('auth_token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/crm/dashboard/pipeline`, { headers });
      setData(res.data?.data || null);
    } catch (err) {
      console.error('Pipeline dashboard load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [headers]);

  const loadDrillDown = useCallback(async (phase) => {
    setDrillPhase(phase);
    setDrillData([]);
    setDrillLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/crm/dashboard/pipeline?phase=${phase}`, { headers });
      setDrillData(res.data?.data || []);
    } catch (err) {
      console.error('Drill-down load failed:', err);
      setDrillData([]);
    } finally {
      setDrillLoading(false);
    }
  }, [headers]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;
  if (!data) return <Empty description="No pipeline data available" />;

  const { funnel_counts, avg_cycle_times, stalled_items, revenue_forecast, summary } = data;

  // Funnel sorted biggest→smallest for visual effect
  const funnelPhases = Object.keys(PHASE_LABELS);
  const maxFunnel = Math.max(...funnelPhases.map(k => funnel_counts[k] || 0), 1);

  // Stalled items table columns
  const stalledColumns = [
    {
      title: 'Inquiry', dataIndex: 'inquiry_number', width: 140,
      render: (v, r) => (
        <a onClick={() => navigate(`/mes/presales/inquiries/${r.id}`)} style={{ cursor: 'pointer' }}>{v}</a>
      ),
    },
    { title: 'Customer', dataIndex: 'customer_name', ellipsis: true },
    {
      title: 'Stage', dataIndex: 'inquiry_stage', width: 140,
      render: (v) => <Tag color={STAGE_TAG_COLORS[v] || 'default'}>{(v || '').replace(/_/g, ' ').toUpperCase()}</Tag>,
    },
    { title: 'Sales Rep', dataIndex: 'sales_rep', width: 130, ellipsis: true },
    {
      title: 'Days Stuck', dataIndex: 'days_in_stage', width: 100, sorter: (a, b) => a.days_in_stage - b.days_in_stage, defaultSortOrder: 'descend',
      render: (v) => <Tag color={v > 14 ? 'red' : v > 7 ? 'orange' : 'blue'}>{v}d</Tag>,
    },
  ];

  // Drill-down table columns
  const drillColumns = [
    {
      title: 'Inquiry', dataIndex: 'inquiry_number', width: 140,
      render: (v, r) => (
        <a onClick={() => navigate(`/mes/presales/inquiries/${r.id}`)} style={{ cursor: 'pointer' }}>{v}</a>
      ),
    },
    { title: 'Customer', dataIndex: 'customer_name', ellipsis: true },
    {
      title: 'Stage', dataIndex: 'inquiry_stage', width: 140,
      render: (v) => <Tag color={STAGE_TAG_COLORS[v] || 'default'}>{(v || '').replace(/_/g, ' ').toUpperCase()}</Tag>,
    },
    { title: 'Sales Rep', dataIndex: 'sales_rep', width: 130, ellipsis: true },
    {
      title: 'Days', dataIndex: 'days_in_stage', width: 80,
      render: (v) => <Tag>{v}d</Tag>,
    },
  ];

  return (
    <div style={{ padding: '0 4px' }}>
      <Title level={4} style={{ marginBottom: 16 }}>
        <FunnelPlotOutlined style={{ marginRight: 8 }} />
        Sales Pipeline Dashboard
      </Title>

      {/* ── Summary KPI Row ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small" hoverable>
            <Statistic title="Total Inquiries" value={summary.total_inquiries} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" hoverable>
            <Statistic title="Converted" value={summary.converted} prefix={<RiseOutlined />} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" hoverable>
            <Statistic title="Conversion Rate" value={summary.conversion_rate} suffix="%" prefix={<RiseOutlined />} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" hoverable>
            <Statistic title="Stalled (>7d)" value={stalled_items.length} prefix={<WarningOutlined />}
              valueStyle={{ color: stalled_items.length > 10 ? '#ff4d4f' : '#fa8c16' }} />
          </Card>
        </Col>
      </Row>

      {/* ── Funnel Chart ── */}
      <Card title="Pipeline Funnel" size="small" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {funnelPhases.map(phase => {
            const count = funnel_counts[phase] || 0;
            const pct = maxFunnel > 0 ? (count / maxFunnel) * 100 : 0;
            return (
              <div key={phase}
                style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '4px 0' }}
                onClick={() => loadDrillDown(phase)}
              >
                <Text style={{ width: 100, fontSize: 12, color: '#666' }}>{PHASE_LABELS[phase]}</Text>
                <div style={{ flex: 1, marginRight: 12 }}>
                  <div style={{
                    height: 28, borderRadius: 4,
                    background: PHASE_COLORS[phase],
                    width: `${Math.max(pct, 3)}%`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 600, fontSize: 13,
                    transition: 'width 0.5s ease',
                    minWidth: 36,
                  }}>
                    {count}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <Text type="secondary" style={{ fontSize: 11, marginTop: 8, display: 'block' }}>
          Click a phase to drill down into individual inquiries
        </Text>
      </Card>

      {/* ── Drill-down panel ── */}
      {drillPhase && (
        <Card
          title={`${PHASE_LABELS[drillPhase]}${drillLoading ? '' : ` — ${drillData.length} inquiries`}`}
          size="small" style={{ marginBottom: 20 }}
          extra={<a onClick={() => setDrillPhase(null)}>Close</a>}
        >
          <Table
            dataSource={drillData} columns={drillColumns} rowKey="id"
            loading={drillLoading} pagination={{ pageSize: 15, size: 'small' }}
            size="small" scroll={{ x: 600 }}
          />
        </Card>
      )}

      <Row gutter={[16, 16]}>
        {/* ── Cycle Time Chart ── */}
        <Col xs={24} lg={12}>
          <Card title={<span><ClockCircleOutlined style={{ marginRight: 6 }} />Avg. Cycle Time by Stage</span>}
            size="small" style={{ marginBottom: 20 }}>
            {avg_cycle_times.length === 0 ? <Empty description="No data" /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {avg_cycle_times.slice(0, 12).map(item => (
                  <div key={item.stage} style={{ display: 'flex', alignItems: 'center' }}>
                    <Text style={{ width: 130, fontSize: 11, color: '#666' }}>
                      {(item.stage || '').replace(/_/g, ' ')}
                    </Text>
                    <Progress
                      percent={Math.min(item.avg_days * 2, 100)}
                      format={() => `${item.avg_days}d (${item.count})`}
                      size="small" style={{ flex: 1 }}
                      strokeColor={item.avg_days > 14 ? '#ff4d4f' : item.avg_days > 7 ? '#fa8c16' : '#1890ff'}
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>

        {/* ── Revenue Forecast ── */}
        <Col xs={24} lg={12}>
          <Card title={<span><DollarOutlined style={{ marginRight: 6 }} />Revenue Forecast</span>}
            size="small" style={{ marginBottom: 20 }}>
            <Row gutter={[12, 12]}>
              <Col span={12}>
                <Statistic title="Pipeline" value={formatCurrency(revenue_forecast.pipeline)} prefix="AED" valueStyle={{ color: '#fa8c16', fontSize: 18 }} />
              </Col>
              <Col span={12}>
                <Statistic title="Confirmed" value={formatCurrency(revenue_forecast.confirmed)} prefix="AED" valueStyle={{ color: '#52c41a', fontSize: 18 }} />
              </Col>
              <Col span={12}>
                <Statistic title="In Production" value={formatCurrency(revenue_forecast.in_production)} prefix="AED" valueStyle={{ fontSize: 18 }} />
              </Col>
              <Col span={12}>
                <Statistic title="Delivered" value={formatCurrency(revenue_forecast.delivered)} prefix="AED" valueStyle={{ color: '#1890ff', fontSize: 18 }} />
              </Col>
            </Row>
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#f6ffed', borderRadius: 6, border: '1px solid #b7eb8f' }}>
              <Text strong style={{ color: '#52c41a' }}>
                Total Won Revenue: AED {formatCurrency(revenue_forecast.total)} ({revenue_forecast.won_count} orders)
              </Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* ── Stalled Items ── */}
      <Card title={<span><WarningOutlined style={{ color: '#fa8c16', marginRight: 6 }} />Stalled Inquiries ({'>'}7 days)</span>}
        size="small" style={{ marginBottom: 20 }}>
        {stalled_items.length === 0 ? (
          <Alert type="success" message="No stalled inquiries — all moving through the pipeline" showIcon />
        ) : (
          <Table
            dataSource={stalled_items} columns={stalledColumns} rowKey="id"
            pagination={{ pageSize: 10, size: 'small' }} size="small" scroll={{ x: 600 }}
          />
        )}
      </Card>
    </div>
  );
}
