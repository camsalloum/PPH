import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Badge, Button, Card, Col, Empty, Row, Space, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import { CheckCircleOutlined, AlertOutlined, ExperimentOutlined, FileProtectOutlined, HomeOutlined, InboxOutlined, ReloadOutlined, SettingOutlined, ToolOutlined, WarningOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';
import { useAuth } from '../../../contexts/AuthContext';
import MESNotificationBell from '../../common/MESNotificationBell';
import BatchAnalysisModal from './BatchAnalysisModal'; // G-010
import EquipmentAdminModal from './EquipmentAdminModal'; // G-008

const { Title, Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const statusColor = {
  sent_to_qc: 'orange',
  received_by_qc: 'purple',
  testing: 'processing',
  tested: 'cyan',
  approved: 'green',
  rejected: 'red',
};

export default function QCDashboard() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { user } = useAuth();

  const [stats, setStats] = useState({});
  const [analytics, setAnalytics] = useState(null);
  const [slaOverview, setSlaOverview] = useState(null);
  const [pendingRows, setPendingRows] = useState([]);
  const [progressRows, setProgressRows] = useState([]);
  const [completedRows, setCompletedRows] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);

  // G-010: batch analysis selection
  const [batchAnalysisIds, setBatchAnalysisIds] = useState([]);
  const [batchModalOpen, setBatchModalOpen] = useState(false);

  // G-008: equipment admin modal
  const [equipModalOpen, setEquipModalOpen] = useState(false);
  const isAdminRole = ['admin', 'manager', 'qc_manager'].includes(user?.role);

  const headers = useMemo(() => {
    const token = localStorage.getItem('auth_token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  const fetchInboxByStatus = useCallback(async (statuses) => {
    const statusParam = encodeURIComponent(statuses.join(','));
    const res = await axios.get(`${API_BASE}/api/mes/presales/qc/inbox?status=${statusParam}&limit=50`, { headers });
    return res.data?.data || [];
  }, [headers]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, pending, inProgress, completed, analyticsRes, slaRes] = await Promise.all([
        axios.get(`${API_BASE}/api/mes/presales/qc/stats`, { headers }),
        fetchInboxByStatus(['sent_to_qc']),
        fetchInboxByStatus(['received_by_qc', 'testing']),
        fetchInboxByStatus(['tested', 'approved', 'rejected']),
        axios.get(`${API_BASE}/api/mes/presales/qc/analytics?days=30`, { headers }).catch(() => ({ data: { data: null } })),
        axios.get(`${API_BASE}/api/mes/presales/qc/sla-overview`, { headers }).catch(() => ({ data: { data: null } })),
      ]);

      setStats(statsRes.data?.data || {});
      setAnalytics(analyticsRes.data?.data || null);
      setSlaOverview(slaRes.data?.data || null);
      setPendingRows(pending);
      setProgressRows(inProgress);
      setCompletedRows(completed.slice(0, 20));
      setSelectedIds([]);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to load QC dashboard');
    } finally {
      setLoading(false);
    }
  }, [headers, fetchInboxByStatus, message]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const timer = setInterval(loadDashboard, 30_000);
    return () => clearInterval(timer);
  }, [loadDashboard]);

  const handleBatchReceive = async (ids) => {
    const idsToReceive = ids || (selectedIds.length > 0 ? selectedIds : pendingRows.map(r => r.id));
    if (idsToReceive.length === 0) return;
    setBatchLoading(true);
    try {
      await axios.post(
        `${API_BASE}/api/mes/presales/qc/batch-receive`,
        { sample_ids: idsToReceive },
        { headers }
      );
      message.success(`${idsToReceive.length} sample(s) marked as received`);
      await loadDashboard();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to batch receive samples');
    } finally {
      setBatchLoading(false);
    }
  };

  // H-002: SLA row classifier
  const slaRowClass = (row) => {
    if (!row.sla_due_at) return '';
    const diffH = (new Date(row.sla_due_at) - Date.now()) / 36e5;
    if (diffH < 0)  return 'qcd-sla-breached';
    if (diffH < 4)  return 'qcd-sla-warning';
    return 'qcd-sla-ok';
  };

  const openSample = (row) => {
    navigate(`/mes/qc/samples/${row.id}`);
  };

  const commonColumns = [
    {
      title: 'SLA',
      dataIndex: 'sla_due_at',
      width: 70,
      render: (v) => {
        if (!v) return null;
        const diffH = (new Date(v) - Date.now()) / 36e5;
        const color = diffH < 0 ? '#ff4d4f' : diffH < 4 ? '#faad14' : '#52c41a';
        const label = diffH < 0 ? 'OVR' : `${Math.round(diffH)}h`;
        return <Tag color={color} style={{ fontSize: 10, padding: '0 4px' }}>{label}</Tag>;
      },
    },
    {
      title: 'Sample',
      dataIndex: 'sample_number',
      render: (value, row) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => openSample(row)}>
          {value}
        </Button>
      ),
    },
    { title: 'Customer', dataIndex: 'customer_name' },
    { title: 'Product Group', dataIndex: 'product_group' },
    {
      title: 'Priority',
      dataIndex: 'priority',
      render: (priority) => <Tag color={priority === 'high' ? 'volcano' : 'blue'}>{priority || 'normal'}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (status, row) => {
        const isOverdue = row.sent_to_qc_at && !['tested', 'approved', 'rejected'].includes(status)
          && (Date.now() - new Date(row.sent_to_qc_at).getTime()) > 48 * 3600 * 1000;
        return (
          <Space size={4}>
            <Tag color={statusColor[status] || 'default'}>{status?.replaceAll('_', ' ')}</Tag>
            {isOverdue && <Tag color="red" style={{ fontWeight: 700 }}>OVERDUE</Tag>}
          </Space>
        );
      },
    },
    {
      title: 'Updated',
      dataIndex: 'updated_at',
      width: 130,
      render: (v) => v ? dayjs(v).format('DD MMM, HH:mm') : '-',
    },
  ];

  const getUserInitials = () => {
    if (!user?.name) return 'U';
    const parts = user.name.split(' ');
    return parts.length >= 2
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : user.name[0].toUpperCase();
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      {/* ── Top navigation bar ──────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: 56,
        background: '#001529', borderBottom: '1px solid rgba(255,255,255,0.08)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        {/* Left: back button + title */}
        <Space size={12}>
          <Tooltip title="Back to Home">
            <Button
              type="text"
              icon={<HomeOutlined />}
              onClick={() => navigate('/modules')}
              style={{ color: 'rgba(255,255,255,0.75)' }}
            />
          </Tooltip>
          <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>/</span>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>
            <ExperimentOutlined style={{ marginRight: 6 }} />
            QC Lab
          </span>
        </Space>

        {/* Right: notification bell + profile shortcuts */}
        <Space size={8}>
          <MESNotificationBell />
          {isAdminRole && (
            <Tooltip title="Lab Equipment Registry">
              <Button
                type="text"
                icon={<ToolOutlined />}
                onClick={() => setEquipModalOpen(true)}
                style={{ color: 'rgba(255,255,255,0.75)' }}
              />
            </Tooltip>
          )}
          <Tooltip title="Settings">
            <Button
              type="text"
              icon={<SettingOutlined />}
              onClick={() => navigate('/settings')}
              style={{ color: 'rgba(255,255,255,0.75)' }}
            />
          </Tooltip>
          <Tooltip title={`${user?.name || 'Profile'} — ${user?.designation || user?.role || ''}`}>
            <Button
              type="text"
              onClick={() => navigate('/profile')}
              style={{
                color: 'rgba(255,255,255,0.75)',
                minWidth: 32, height: 32, padding: 0,
                borderRadius: '50%', background: 'rgba(59,130,246,0.25)',
                fontWeight: 700, fontSize: 12,
              }}
            >
              {getUserInitials()}
            </Button>
          </Tooltip>
        </Space>
      </div>

      {/* ── Main content ────────────────────────────────────────── */}
      <div style={{ padding: 20 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <ExperimentOutlined /> QC Lab Dashboard
          </Title>
          <Text type="secondary">Inbox for SAR sample receipt and test progress</Text>
        </div>
        <Space>
          <Button onClick={() => navigate('/mes/approvals')}>CSE Approvals</Button>
          <Button onClick={() => navigate('/mes/qc/ncr')} icon={<WarningOutlined />}>NCR</Button>
          {isAdminRole && <Button onClick={() => navigate('/mes/qc/templates')} icon={<FileProtectOutlined />}>Templates</Button>}
          <Button icon={<ReloadOutlined />} onClick={loadDashboard} loading={loading}>Refresh</Button>
        </Space>
      </Space>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="Pending Receipt" value={Number(stats.pending_receipt || 0)} prefix={<InboxOutlined />} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="Received" value={Number(stats.received || 0)} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="Testing" value={Number(stats.testing || 0)} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="Completed Today" value={Number(stats.completed_today || 0)} prefix={<CheckCircleOutlined />} /></Card>
        </Col>
      </Row>

      {/* G-009: Analytics row */}
      {analytics && (
        <>
          <Row gutter={12} style={{ marginBottom: 12 }}>
              <Col xs={6}>
                <Card size="small">
                  <Statistic
                    title="Pass Rate (30d)"
                    value={analytics.pass_rate ?? '-'}
                    suffix={analytics.pass_rate != null ? '%' : ''}
                    valueStyle={{ color: analytics.pass_rate >= 80 ? '#3f8600' : analytics.pass_rate >= 60 ? '#d46b08' : '#cf1322' }}
                  />
                </Card>
              </Col>
              <Col xs={6}>
                <Card size="small">
                  <Statistic
                    title="Avg Turnaround"
                    value={analytics.avg_turnaround_hours != null ? analytics.avg_turnaround_hours : '-'}
                    suffix={analytics.avg_turnaround_hours != null ? 'h' : ''}
                  />
                </Card>
              </Col>
              <Col xs={6}>
                <Card size="small">
                  <Statistic
                    title="Overdue Items"
                    value={analytics.overdue_count}
                    valueStyle={{ color: analytics.overdue_count > 0 ? '#cf1322' : undefined }}
                  />
                </Card>
              </Col>
              <Col xs={6}>
                <Card size="small">
                  <Statistic
                    title="SLA Breached"
                    value={slaOverview?.breached_count ?? '-'}
                    valueStyle={{ color: (slaOverview?.breached_count ?? 0) > 0 ? '#cf1322' : '#3f8600' }}
                    prefix={<AlertOutlined />}
                  />
                </Card>
              </Col>
          </Row>

          {analytics.by_product_group?.length > 0 && (
            <Card
              size="small"
              title="Pass / Fail by Product Group (30d)"
              style={{ marginBottom: 14 }}
            >
              <ReactECharts
                style={{ height: 240 }}
                option={{
                  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                  legend: { data: ['Pass', 'Conditional', 'Fail'], bottom: 0 },
                  grid: { top: 8, right: 16, bottom: 36, left: 120, containLabel: false },
                  xAxis: { type: 'value' },
                  yAxis: {
                    type: 'category',
                    data: analytics.by_product_group.map(r => r.product_group),
                    axisLabel: { overflow: 'truncate', width: 110, fontSize: 11 },
                  },
                  series: [
                    { name: 'Pass',        type: 'bar', stack: 'total', itemStyle: { color: '#52c41a' }, data: analytics.by_product_group.map(r => Number(r.pass_count || r.pass || 0)) },
                    { name: 'Conditional', type: 'bar', stack: 'total', itemStyle: { color: '#faad14' }, data: analytics.by_product_group.map(r => Number(r.conditional_count || r.conditional || 0)) },
                    { name: 'Fail',        type: 'bar', stack: 'total', itemStyle: { color: '#ff4d4f' }, data: analytics.by_product_group.map(r => Number(r.fail_count || r.fail || 0)) },
                  ],
                }}
              />
            </Card>
          )}
        </>
      )}

      <Card
        size="small"
        title={<span><Badge status="processing" /> Pending Receipt</span>}
        extra={
          <Space size={8}>
            {selectedIds.length > 0 && selectedIds.length < pendingRows.length && (
              <Button loading={batchLoading} onClick={() => handleBatchReceive(selectedIds)}>
                Receive Selected ({selectedIds.length})
              </Button>
            )}
            <Button type="primary" disabled={pendingRows.length === 0} loading={batchLoading} onClick={() => handleBatchReceive(pendingRows.map(r => r.id))}>
              Mark All Received ({pendingRows.length})
            </Button>
          </Space>
        }
        style={{ marginBottom: 14 }}
      >
        <Table
          loading={loading}
          rowKey="id"
          size="small"
          dataSource={pendingRows}
          columns={commonColumns}
          pagination={false}
          rowSelection={{
            selectedRowKeys: selectedIds,
            onChange: (keys) => setSelectedIds(keys),
          }}
          locale={{ emptyText: <Empty description="No pending samples" /> }}
        />
      </Card>

      <Card size="small" title="In Progress"
        extra={
          batchAnalysisIds.length >= 2 && (
            <Button
              type="primary"
              size="small"
              icon={<ExperimentOutlined />}
              onClick={() => setBatchModalOpen(true)}
            >
              Batch Analysis ({batchAnalysisIds.length})
            </Button>
          )
        }
        style={{ marginBottom: 14 }}>
        <Table
          loading={loading}
          rowKey="id"
          size="small"
          dataSource={progressRows}
          columns={commonColumns}
          pagination={false}
          rowSelection={{
            selectedRowKeys: batchAnalysisIds,
            onChange: (keys) => setBatchAnalysisIds(keys),
          }}
          locale={{ emptyText: <Empty description="No in-progress samples" /> }}
        />
      </Card>

      <Card size="small" title="Recently Completed">
        <Table
          loading={loading}
          rowKey="id"
          size="small"
          dataSource={completedRows}
          columns={commonColumns}
          pagination={false}
          locale={{ emptyText: <Empty description="No completed samples" /> }}
        />
      </Card>
      </div>{/* end main content */}

      {/* G-010: Batch Analysis Modal */}
      <BatchAnalysisModal
        open={batchModalOpen}
        samples={progressRows.filter((r) => batchAnalysisIds.includes(r.id))}
        onClose={() => setBatchModalOpen(false)}
        onSuccess={() => {
          setBatchModalOpen(false);
          setBatchAnalysisIds([]);
          loadDashboard();
        }}
      />

      {/* G-008: Equipment Admin Modal */}
      <EquipmentAdminModal
        open={equipModalOpen}
        onClose={() => setEquipModalOpen(false)}
      />
    </div>
  );
}
