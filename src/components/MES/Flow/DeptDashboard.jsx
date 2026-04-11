/**
 * DeptDashboard — Department-level view showing all active jobs in the department's phases.
 * Uses GET /api/mes/flow/dashboard?dept=<dept>
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  App, Card, Row, Col, Statistic, Tag, Badge, Table, Button, Select, Typography, Spin, Empty, Tooltip
} from 'antd';
import {
  TeamOutlined, ClockCircleOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, ReloadOutlined, EyeOutlined, ArrowLeftOutlined
} from '@ant-design/icons';
import { useAuth } from '../../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

const { Title, Text } = Typography;
const { Option } = Select;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const DEPT_CONFIG = {
  sales:       { label: 'Sales',       color: '#1976D2', icon: '💼' },
  qc:          { label: 'QC',          color: '#7B1FA2', icon: '🔬' },
  prepress:    { label: 'Prepress',    color: '#F57C00', icon: '🎨' },
  estimation:  { label: 'Estimation',  color: '#388E3C', icon: '📊' },
  procurement: { label: 'Procurement', color: '#00796B', icon: '📦' },
  production:  { label: 'Production',  color: '#E65100', icon: '🏭' },
  inkhead:     { label: 'Ink Head',    color: '#D84315', icon: '🎯' },
  maintenance: { label: 'Maintenance', color: '#455A64', icon: '🔧' },
  accounts:    { label: 'Accounts',    color: '#0277BD', icon: '💰' },
  logistics:   { label: 'Logistics',   color: '#689F38', icon: '🚛' },
};

// Map user roles to default department
const ROLE_TO_DEPT = {
  admin:           null,
  manager:         null,
  sales_manager:   'sales',
  sales_coordinator: 'sales',
  sales_rep:       'sales',
  sales_executive: 'sales',
  quality_control: 'qc',
  qc_manager:      'qc',
  qc_lab:          'qc',
  qc_inspector:    'qc',
  production_manager: 'production',
  production:      'production',
  operator:        'production',
  accounts_manager: 'accounts',
  accountant:      'accounts',
  logistics_manager: 'logistics',
  stores_keeper:   'logistics',
};

const inferUserDepartment = (user) => {
  const role = (user?.role || '').toString().trim().toLowerCase();
  const designation = (user?.designation || '').toString().trim().toLowerCase();
  const department = (user?.department || user?.employee_department || '').toString().trim().toLowerCase();

  if (ROLE_TO_DEPT[role] !== undefined) return ROLE_TO_DEPT[role];
  if (/\b(qc|quality)\b/.test(designation) || /\b(qc|quality)\b/.test(department)) return 'qc';
  if (/\bproduction\b/.test(designation) || /\bproduction\b/.test(department)) return 'production';
  if (/\b(accounts?|finance)\b/.test(designation) || /\b(accounts?|finance)\b/.test(department)) return 'accounts';
  if (/\b(logistics?|stores?)\b/.test(designation) || /\b(logistics?|stores?)\b/.test(department)) return 'logistics';
  if (/\bsales\b/.test(designation) || /\bsales\b/.test(department)) return 'sales';
  return null;
};

export default function DeptDashboard({ onSelectJob }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [dept, setDept] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = ['admin', 'manager'].includes(user?.role);

  useEffect(() => {
    // Default to user's department
    const defaultDept = inferUserDepartment(user);
    setDept(defaultDept);
  }, [user]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const params = dept ? `?dept=${dept}` : '';
      const res = await axios.get(`${API_BASE}/api/mes/flow/dashboard${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.success) setData(res.data.data);
    } catch (err) {
      message.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [dept]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;

  const deptCfg = DEPT_CONFIG[dept] || { label: 'All Departments', color: '#333', icon: '🏢' };

  return (
    <div>
      {/* Dept selector */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/mes')}
          size="small"
        >
          MES Home
        </Button>
        <Title level={4} style={{ margin: 0 }}>
          <TeamOutlined style={{ marginRight: 8 }} />
          {deptCfg.icon} {deptCfg.label} Dashboard
        </Title>
        <div style={{ flex: 1 }} />
        {isAdmin && (
          <Select value={dept} onChange={setDept} style={{ width: 180 }} placeholder="All Departments" allowClear>
            {Object.entries(DEPT_CONFIG).map(([key, cfg]) => (
              <Option key={key} value={key}>
                {cfg.icon} {cfg.label}
              </Option>
            ))}
          </Select>
        )}
        <Button icon={<ReloadOutlined />} onClick={loadDashboard}>Refresh</Button>
      </div>

      {/* Stats row */}
      {data && (
        <>
          <Row gutter={16} style={{ marginBottom: 20 }}>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="Active in Dept"
                  value={data.counts?.active ?? 0}
                  prefix={<Badge status="processing" />}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="Awaiting Input"
                  value={data.counts?.awaiting_input ?? 0}
                  prefix={<ExclamationCircleOutlined />}
                  valueStyle={{ color: '#fa8c16' }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="Completed Today"
                  value={data.counts?.completed_today ?? 0}
                  prefix={<CheckCircleOutlined />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="On Hold"
                  value={data.counts?.on_hold ?? 0}
                  prefix={<ClockCircleOutlined />}
                  valueStyle={{ color: '#faad14' }}
                />
              </Card>
            </Col>
          </Row>

          {/* Phase breakdown */}
          {data.phase_breakdown && data.phase_breakdown.length > 0 && (
            <Card title="Jobs by Phase" size="small" style={{ marginBottom: 16 }}>
              <Row gutter={[8, 8]}>
                {data.phase_breakdown.map(pb => (
                  <Col key={pb.phase_number} xs={12} sm={8} md={6}>
                    <Card size="small" style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#1890ff' }}>{pb.count}</div>
                      <div style={{ fontSize: 11, color: '#666' }}>P{pb.phase_number}: {pb.phase_name}</div>
                    </Card>
                  </Col>
                ))}
              </Row>
            </Card>
          )}

          {/* Job list */}
          {data.jobs && (
            <Table
              dataSource={data.jobs}
              rowKey="id"
              size="small"
              pagination={false}
              locale={{ emptyText: <Empty description={`No active jobs${dept ? ` in ${deptCfg.label}` : ''}`} /> }}
              columns={[
                {
                  title: 'Job #',
                  dataIndex: 'job_number',
                  render: (text, rec) => (
                    <Button type="link" onClick={() => onSelectJob?.(rec.id)} style={{ padding: 0 }}>{text}</Button>
                  ),
                },
                { title: 'Customer', dataIndex: 'customer_name' },
                {
                  title: 'Phase', key: 'phase',
                  render: (_, rec) => <span>P{rec.current_phase}: {rec.current_phase_name}</span>,
                },
                {
                  title: 'Phase Status', dataIndex: 'phase_status',
                  render: s => <Tag color={s === 'active' ? 'blue' : s === 'awaiting_input' ? 'orange' : 'default'}>{s}</Tag>,
                },
                {
                  title: 'Priority', dataIndex: 'priority',
                  render: p => <Tag color={p === 'high' ? 'volcano' : 'blue'}>{p}</Tag>,
                },
                {
                  title: 'Updated', dataIndex: 'updated_at',
                  render: d => <Tooltip title={dayjs(d).format('DD MMM HH:mm')}>{dayjs(d).fromNow()}</Tooltip>,
                },
                {
                  title: '', key: 'action',
                  render: (_, rec) => <Button icon={<EyeOutlined />} size="small" onClick={() => onSelectJob?.(rec.id)}>View</Button>,
                },
              ]}
            />
          )}
        </>
      )}
    </div>
  );
}
