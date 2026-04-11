/**
 * JobFlowTracker — Shows a job's journey through the 17-phase workflow.
 *
 * Two views:
 *   1. Job List (default) — all active jobs with phase progress
 *   2. Job Detail — full phase timeline, activity log, attachments, handoff actions
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  App, Card, Table, Tag, Badge, Button, Space, Typography, Spin, Select,
  Input, Tabs, Timeline, Descriptions, Upload, Modal, Tooltip, Progress,
  Row, Col, Empty, Divider, Alert
} from 'antd';
import {
  ArrowLeftOutlined, ArrowRightOutlined, SendOutlined, PaperClipOutlined,
  CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined,
  PauseCircleOutlined, CommentOutlined, UploadOutlined, TeamOutlined,
  FileTextOutlined, ReloadOutlined, EyeOutlined, SwapRightOutlined,
  StopOutlined, PlayCircleOutlined, FolderOpenOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import axios from 'axios';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Option } = Select;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ─── Constants ───────────────────────────────────────────────────────────────

const STAGE_CONFIG = {
  presales:      { label: 'Pre-Sales',        color: '#1976D2', bg: '#E3F2FD' },
  quotation:     { label: 'Quotation & Order', color: '#388E3C', bg: '#E8F5E9' },
  preproduction: { label: 'Pre-Production',   color: '#F57C00', bg: '#FFF3E0' },
  production:    { label: 'Production & QC',  color: '#E65100', bg: '#FFF9C4' },
  delivery:      { label: 'Delivery & Close', color: '#689F38', bg: '#F1F8E9' },
};

const DEPT_CONFIG = {
  sales:       { label: 'Sales',       color: '#1976D2' },
  qc:          { label: 'QC',          color: '#7B1FA2' },
  prepress:    { label: 'Prepress',    color: '#F57C00' },
  estimation:  { label: 'Estimation',  color: '#388E3C' },
  procurement: { label: 'Procurement', color: '#00796B' },
  production:  { label: 'Production',  color: '#E65100' },
  inkhead:     { label: 'Ink Head',    color: '#D84315' },
  maintenance: { label: 'Maintenance', color: '#455A64' },
  accounts:    { label: 'Accounts',    color: '#0277BD' },
  logistics:   { label: 'Logistics',   color: '#689F38' },
};

const PHASE_STATUS_CONFIG = {
  pending:         { icon: <ClockCircleOutlined />,        color: '#d9d9d9', label: 'Pending' },
  active:          { icon: <PlayCircleOutlined />,         color: '#1890ff', label: 'Active' },
  awaiting_input:  { icon: <ExclamationCircleOutlined />,  color: '#fa8c16', label: 'Awaiting Input' },
  completed:       { icon: <CheckCircleOutlined />,        color: '#52c41a', label: 'Completed' },
  skipped:         { icon: <StopOutlined />,               color: '#8c8c8c', label: 'Skipped' },
  blocked:         { icon: <PauseCircleOutlined />,        color: '#f5222d', label: 'Blocked' },
};

const ACTION_ICONS = {
  job_created:      <FileTextOutlined style={{ color: '#1890ff' }} />,
  handoff:          <SwapRightOutlined style={{ color: '#722ed1' }} />,
  phase_started:    <PlayCircleOutlined style={{ color: '#52c41a' }} />,
  phase_completed:  <CheckCircleOutlined style={{ color: '#52c41a' }} />,
  comment:          <CommentOutlined style={{ color: '#fa8c16' }} />,
  attachment_added: <PaperClipOutlined style={{ color: '#13c2c2' }} />,
  assigned:         <TeamOutlined style={{ color: '#1890ff' }} />,
  status_change:    <ExclamationCircleOutlined style={{ color: '#f5222d' }} />,
  approval:         <CheckCircleOutlined style={{ color: '#52c41a' }} />,
  rejection:        <StopOutlined style={{ color: '#f5222d' }} />,
};

const ATTACHMENT_TYPES = [
  { value: 'tds',          label: 'TDS (Tech Data Sheet)' },
  { value: 'email',        label: 'Email' },
  { value: 'document',     label: 'Document' },
  { value: 'sample_photo', label: 'Sample Photo' },
  { value: 'design_sheet', label: 'Design Sheet' },
  { value: 'test_report',  label: 'Test Report' },
  { value: 'coa',          label: 'COA' },
  { value: 'artwork',      label: 'Artwork' },
  { value: 'proof',        label: 'Proof' },
  { value: 'coc',          label: 'COC' },
  { value: 'invoice',      label: 'Invoice' },
  { value: 'po',           label: 'PO' },
  { value: 'dn',           label: 'Delivery Note' },
  { value: 'other',        label: 'Other' },
];


// ═════════════════════════════════════════════════════════════════════════════
// JOB LIST VIEW
// ═════════════════════════════════════════════════════════════════════════════

function JobListView({ onSelectJob }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: 'active', phase: null, search: '' });

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.phase)  params.append('phase', filters.phase);
      if (filters.search) params.append('search', filters.search);

      const res = await axios.get(`${API_BASE}/api/mes/flow/jobs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.success) setJobs(res.data.data);
    } catch (err) {
      message.error('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const columns = [
    {
      title: 'Job #',
      dataIndex: 'job_number',
      key: 'job_number',
      render: (text, rec) => (
        <Button type="link" onClick={() => onSelectJob(rec.id)} style={{ padding: 0, fontWeight: 600 }}>
          {text}
        </Button>
      ),
    },
    {
      title: 'Customer',
      dataIndex: 'customer_name',
      key: 'customer_name',
      render: (text, rec) => (
        <span>
          {text}
          {rec.customer_country && <Tag style={{ marginLeft: 4 }}>{rec.customer_country}</Tag>}
        </span>
      ),
    },
    {
      title: 'Current Phase',
      key: 'current_phase',
      render: (_, rec) => {
        const stageCfg = STAGE_CONFIG[rec.current_phase_depts?.[0]] || {};
        return (
          <Space>
            <Badge status="processing" />
            <span>P{rec.current_phase}: {rec.current_phase_name}</span>
          </Space>
        );
      },
    },
    {
      title: 'Dept',
      dataIndex: 'assigned_dept',
      key: 'dept',
      render: (dept) => {
        const cfg = DEPT_CONFIG[dept];
        return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <Tag>{dept}</Tag>;
      },
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      render: (p) => (
        <Tag color={p === 'high' ? 'volcano' : p === 'low' ? 'default' : 'blue'}>
          {p?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'overall_status',
      key: 'status',
      render: (s) => (
        <Tag color={s === 'active' ? 'green' : s === 'on_hold' ? 'orange' : s === 'completed' ? 'blue' : 'red'}>
          {s}
        </Tag>
      ),
    },
    {
      title: 'Updated',
      dataIndex: 'updated_at',
      key: 'updated',
      render: (d) => <Tooltip title={dayjs(d).format('DD MMM YYYY HH:mm')}>{dayjs(d).fromNow()}</Tooltip>,
    },
    {
      title: '',
      key: 'action',
      render: (_, rec) => (
        <Button icon={<EyeOutlined />} size="small" onClick={() => onSelectJob(rec.id)}>View</Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Select
          value={filters.status}
          onChange={v => setFilters(f => ({ ...f, status: v }))}
          style={{ width: 150 }}
          allowClear
          placeholder="Status"
        >
          <Option value="active">Active</Option>
          <Option value="on_hold">On Hold</Option>
          <Option value="completed">Completed</Option>
          <Option value="cancelled">Cancelled</Option>
        </Select>
        <Input.Search
          placeholder="Search job # or customer..."
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          onSearch={() => loadJobs()}
          style={{ width: 280 }}
          allowClear
        />
        <Button icon={<ReloadOutlined />} onClick={loadJobs}>Refresh</Button>
      </div>

      <Table
        dataSource={jobs}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: <Empty description="No jobs found" /> }}
      />
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════════
// JOB DETAIL VIEW
// ═════════════════════════════════════════════════════════════════════════════

function JobDetailView({ jobId, onBack }) {
  const { user } = useAuth();
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState(null);
  const [phases, setPhases] = useState([]);
  const [activity, setActivity] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [transitions, setTransitions] = useState([]);
  const [advancing, setAdvancing] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [uploadPhase, setUploadPhase] = useState(null);
  const [uploadType, setUploadType] = useState('document');

  const isAdmin = ['admin', 'manager'].includes(user?.role);

  const loadJob = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.get(`${API_BASE}/api/mes/flow/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.success) {
        setJob(res.data.data.job);
        setPhases(res.data.data.phases);
        setActivity(res.data.data.activity);
        setAttachments(res.data.data.attachments);
        setTransitions(res.data.data.available_transitions);
      }
    } catch (err) {
      message.error('Failed to load job');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { loadJob(); }, [loadJob]);

  // ── Advance phase ──────────────────────────────────────────────────────
  const handleAdvance = async (toPhase, toPhaseName) => {
    modal.confirm({
      title: `Advance to Phase ${toPhase}: ${toPhaseName}?`,
      content: (
        <div>
          <p>This will complete the current phase and hand off to the next department.</p>
          <TextArea id="handoff-msg" placeholder="Handoff message (optional)" rows={2} style={{ marginTop: 8 }} />
        </div>
      ),
      okText: 'Advance',
      onOk: async () => {
        setAdvancing(true);
        try {
          const token = localStorage.getItem('auth_token');
          const msg = document.getElementById('handoff-msg')?.value;
          const res = await axios.post(
            `${API_BASE}/api/mes/flow/jobs/${jobId}/advance`,
            { to_phase: toPhase, handoff_message: msg || undefined },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (res.data.success) {
            message.success(res.data.message);
            loadJob();
          }
        } catch (err) {
          message.error(err.response?.data?.error || 'Failed to advance');
        } finally {
          setAdvancing(false);
        }
      },
    });
  };

  // ── Add comment ────────────────────────────────────────────────────────
  const handleComment = async () => {
    if (!commentText.trim()) return;
    try {
      const token = localStorage.getItem('auth_token');
      await axios.post(
        `${API_BASE}/api/mes/flow/jobs/${jobId}/comment`,
        { comment: commentText, phase_number: job?.current_phase },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success('Comment added');
      setCommentText('');
      loadJob();
    } catch (err) {
      message.error('Failed to add comment');
    }
  };

  // ── Upload attachment ──────────────────────────────────────────────────
  const handleUpload = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('phase_number', uploadPhase || job?.current_phase || '');
    formData.append('attachment_type', uploadType);

    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.post(
        `${API_BASE}/api/mes/flow/jobs/${jobId}/attachments`,
        formData,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
      );
      if (res.data.success) {
        message.success(`${file.name} uploaded`);
        loadJob();
      }
    } catch (err) {
      message.error('Upload failed');
    }
    return false; // prevent antd auto-upload
  };

  // ── Change job status ──────────────────────────────────────────────────
  const handleJobStatus = async (newStatus) => {
    try {
      const token = localStorage.getItem('auth_token');
      await axios.patch(
        `${API_BASE}/api/mes/flow/jobs/${jobId}/status`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      message.success(`Job ${newStatus}`);
      loadJob();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed');
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;
  if (!job) return <Alert message="Job not found" type="error" />;

  // Calculate progress
  const completedPhases = phases.filter(p => p.status === 'completed').length;
  const progressPct = Math.round((completedPhases / 17) * 100);

  // Group phases by stage
  const stageGroups = {};
  for (const p of phases) {
    if (!stageGroups[p.stage]) stageGroups[p.stage] = [];
    stageGroups[p.stage].push(p);
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack} type="text">All Jobs</Button>
        <Title level={4} style={{ margin: 0 }}>{job.job_number}</Title>
        <Tag color={job.overall_status === 'active' ? 'green' : job.overall_status === 'on_hold' ? 'orange' : 'red'}>
          {job.overall_status?.toUpperCase()}
        </Tag>
        <Tag color={job.priority === 'high' ? 'volcano' : job.priority === 'low' ? 'default' : 'blue'}>
          {job.priority?.toUpperCase()}
        </Tag>
        <div style={{ flex: 1 }} />
        {job.overall_status === 'active' && (
          <Button icon={<PauseCircleOutlined />} onClick={() => handleJobStatus('on_hold')}>Hold</Button>
        )}
        {job.overall_status === 'on_hold' && (
          <Button icon={<PlayCircleOutlined />} type="primary" onClick={() => handleJobStatus('active')}>Resume</Button>
        )}
        <Button icon={<ReloadOutlined />} onClick={loadJob}>Refresh</Button>
      </div>

      {/* Summary bar */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Descriptions size="small" column={{ xs: 1, sm: 2, md: 4 }}>
              <Descriptions.Item label="Customer">
                <Text strong>{job.customer_name}</Text>
                {job.customer_country && <Tag style={{ marginLeft: 4 }}>{job.customer_country}</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="Current Phase">
                <Badge status="processing" />
                <Text strong> P{job.current_phase}: {job.current_phase_name}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Current Dept">
                {DEPT_CONFIG[job.assigned_dept]
                  ? <Tag color={DEPT_CONFIG[job.assigned_dept].color}>{DEPT_CONFIG[job.assigned_dept].label}</Tag>
                  : <Tag>{job.assigned_dept}</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="Started">
                {dayjs(job.started_at).format('DD MMM YYYY')}
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col>
            <div style={{ textAlign: 'center', minWidth: 80 }}>
              <Progress type="circle" percent={progressPct} size={60} />
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{completedPhases}/17 phases</div>
            </div>
          </Col>
        </Row>
      </Card>

      {/* Advance buttons */}
      {job.overall_status === 'active' && transitions.length > 0 && (
        <Card size="small" style={{ marginBottom: 16, background: '#f6ffed', border: '1px solid #b7eb8f' }}>
          <Space wrap>
            <Text strong>Advance to:</Text>
            {transitions.map(t => (
              <Button
                key={t.to_phase}
                type="primary"
                icon={<ArrowRightOutlined />}
                onClick={() => handleAdvance(t.to_phase, t.to_phase_name)}
                loading={advancing}
              >
                P{t.to_phase}: {t.to_phase_name}
                {t.to_phase_depts?.[0] && (
                  <Tag style={{ marginLeft: 4 }} color={DEPT_CONFIG[t.to_phase_depts[0]]?.color}>
                    → {DEPT_CONFIG[t.to_phase_depts[0]]?.label}
                  </Tag>
                )}
              </Button>
            ))}
          </Space>
        </Card>
      )}

      {/* Main content tabs */}
      <Tabs defaultActiveKey="phases" items={[
        {
          key: 'phases',
          label: <span><CheckCircleOutlined /> Phase Progress</span>,
          children: (
            <div>
              {Object.entries(stageGroups).map(([stageKey, stagePhases]) => {
                const stageCfg = STAGE_CONFIG[stageKey] || { label: stageKey, color: '#666', bg: '#f5f5f5' };
                return (
                  <div key={stageKey} style={{ marginBottom: 20 }}>
                    <div style={{
                      padding: '6px 14px', background: stageCfg.bg, borderLeft: `4px solid ${stageCfg.color}`,
                      borderRadius: 4, marginBottom: 8, fontWeight: 600, color: stageCfg.color
                    }}>
                      {stageCfg.label}
                    </div>
                    {stagePhases.map(p => {
                      const statusCfg = PHASE_STATUS_CONFIG[p.status] || PHASE_STATUS_CONFIG.pending;
                      const isCurrent = p.phase_number === job.current_phase;
                      return (
                        <div key={p.phase_number} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                          background: isCurrent ? '#e6f7ff' : p.status === 'completed' ? '#f6ffed' : 'transparent',
                          borderRadius: 6, marginBottom: 4,
                          border: isCurrent ? '1px solid #91d5ff' : '1px solid transparent',
                        }}>
                          <span style={{ color: statusCfg.color, fontSize: 16 }}>{statusCfg.icon}</span>
                          <span style={{ minWidth: 30, fontWeight: 600, color: '#666' }}>P{p.phase_number}</span>
                          <span style={{ flex: 1, fontWeight: isCurrent ? 600 : 400 }}>{p.phase_name}</span>
                          {p.owned_by_dept && (
                            <Tag color={DEPT_CONFIG[p.owned_by_dept]?.color} style={{ margin: 0 }}>
                              {DEPT_CONFIG[p.owned_by_dept]?.label || p.owned_by_dept}
                            </Tag>
                          )}
                          {p.is_quality_gate && <Tag color="volcano">QC Gate</Tag>}
                          <Tag color={statusCfg.color} style={{ margin: 0 }}>{statusCfg.label}</Tag>
                          {p.started_at && (
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              {p.completed_at
                                ? `${dayjs(p.started_at).format('DD/MM')} → ${dayjs(p.completed_at).format('DD/MM')}`
                                : `Started ${dayjs(p.started_at).fromNow()}`}
                            </Text>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ),
        },
        {
          key: 'activity',
          label: <span><CommentOutlined /> Activity ({activity.length})</span>,
          children: (
            <div>
              {/* Comment input */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <TextArea
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  rows={2}
                  style={{ flex: 1 }}
                />
                <Button type="primary" icon={<SendOutlined />} onClick={handleComment} disabled={!commentText.trim()}>
                  Send
                </Button>
              </div>

              <Timeline
                items={activity.map(a => ({
                  dot: ACTION_ICONS[a.action] || <ClockCircleOutlined />,
                  children: (
                    <div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Text strong style={{ fontSize: 13 }}>{a.performed_by}</Text>
                        {a.action === 'handoff' && (
                          <>
                            <SwapRightOutlined style={{ color: '#722ed1' }} />
                            {a.from_dept && <Tag>{DEPT_CONFIG[a.from_dept]?.label || a.from_dept}</Tag>}
                            <ArrowRightOutlined />
                            {a.to_dept && <Tag color={DEPT_CONFIG[a.to_dept]?.color}>{DEPT_CONFIG[a.to_dept]?.label || a.to_dept}</Tag>}
                          </>
                        )}
                        {a.phase_name && <Tag color="default" style={{ fontSize: 11 }}>{a.phase_name}</Tag>}
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {dayjs(a.created_at).format('DD MMM HH:mm')} ({dayjs(a.created_at).fromNow()})
                        </Text>
                      </div>
                      {a.details && <Paragraph style={{ margin: '4px 0 0', color: '#555' }}>{a.details}</Paragraph>}
                    </div>
                  ),
                }))}
              />
              {activity.length === 0 && <Empty description="No activity yet" />}
            </div>
          ),
        },
        {
          key: 'attachments',
          label: <span><PaperClipOutlined /> Attachments ({attachments.length})</span>,
          children: (
            <div>
              {/* Upload area */}
              <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
                <Space wrap>
                  <Select value={uploadType} onChange={setUploadType} style={{ width: 200 }}>
                    {ATTACHMENT_TYPES.map(t => <Option key={t.value} value={t.value}>{t.label}</Option>)}
                  </Select>
                  <Upload beforeUpload={handleUpload} showUploadList={false}>
                    <Button icon={<UploadOutlined />}>Upload File</Button>
                  </Upload>
                </Space>
              </Card>

              {/* Attachment list */}
              <Table
                dataSource={attachments}
                rowKey="id"
                size="small"
                pagination={false}
                locale={{ emptyText: <Empty description="No attachments" /> }}
                columns={[
                  {
                    title: 'File',
                    dataIndex: 'file_name',
                    render: (name, rec) => (
                      <a href={`${API_BASE}${rec.file_path}`} target="_blank" rel="noopener noreferrer">
                        <PaperClipOutlined /> {name}
                      </a>
                    ),
                  },
                  { title: 'Type', dataIndex: 'attachment_type', render: t => <Tag>{t}</Tag> },
                  { title: 'Phase', dataIndex: 'phase_name', render: p => p || '-' },
                  { title: 'By', dataIndex: 'uploaded_by' },
                  { title: 'Date', dataIndex: 'created_at', render: d => dayjs(d).format('DD MMM HH:mm') },
                  {
                    title: 'Size',
                    dataIndex: 'file_size',
                    render: s => s ? `${(s / 1024).toFixed(0)} KB` : '-',
                  },
                ]}
              />
            </div>
          ),
        },
      ]} />
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT (router between list and detail)
// ═════════════════════════════════════════════════════════════════════════════

export default function JobFlowTracker() {
  const [selectedJobId, setSelectedJobId] = useState(null);
  const navigate = useNavigate();

  return (
    <div style={{ padding: '16px 24px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/mes')}
          size="small"
          style={{ marginTop: 4 }}
        >
          MES Home
        </Button>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <FolderOpenOutlined style={{ marginRight: 8 }} />
            Job Flow Tracker
          </Title>
          <Text type="secondary">Track jobs as they move through the 17-phase workflow</Text>
        </div>
      </div>

      {selectedJobId ? (
        <JobDetailView jobId={selectedJobId} onBack={() => setSelectedJobId(null)} />
      ) : (
        <JobListView onSelectJob={setSelectedJobId} />
      )}
    </div>
  );
}
