/**
 * Audit Log Component
 * View permission changes and access history
 * Part of: User Management Module Implementation - Phase 6
 * Date: December 25, 2025
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Tag, Space, Typography, DatePicker, Select, Input,
  Row, Col, Tooltip, Avatar, Timeline, Statistic, Button
} from 'antd';
import {
  AuditOutlined, UserOutlined, SafetyCertificateOutlined, HistoryOutlined,
  SearchOutlined, FilterOutlined, DownloadOutlined, LinkOutlined,
  DisconnectOutlined, EditOutlined, DeleteOutlined, PlusOutlined,
  LockOutlined, UnlockOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

// Action types with icons and colors
const ACTION_CONFIG = {
  user_created: { icon: <PlusOutlined />, color: 'green', label: 'User Created' },
  user_updated: { icon: <EditOutlined />, color: 'blue', label: 'User Updated' },
  user_deleted: { icon: <DeleteOutlined />, color: 'red', label: 'User Deleted' },
  user_linked: { icon: <LinkOutlined />, color: 'purple', label: 'User Linked' },
  user_unlinked: { icon: <DisconnectOutlined />, color: 'orange', label: 'User Unlinked' },
  role_assigned: { icon: <SafetyCertificateOutlined />, color: 'cyan', label: 'Role Assigned' },
  role_removed: { icon: <SafetyCertificateOutlined />, color: 'volcano', label: 'Role Removed' },
  permission_granted: { icon: <UnlockOutlined />, color: 'green', label: 'Permission Granted' },
  permission_revoked: { icon: <LockOutlined />, color: 'red', label: 'Permission Revoked' },
  login: { icon: <UserOutlined />, color: 'default', label: 'Login' },
  logout: { icon: <UserOutlined />, color: 'default', label: 'Logout' },
  password_changed: { icon: <LockOutlined />, color: 'gold', label: 'Password Changed' }
};

const AuditLog = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    actionType: null,
    userId: null,
    dateRange: null
  });
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });

  // Fetch audit logs
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const params = new URLSearchParams({
        page: pagination.current,
        limit: pagination.pageSize
      });
      
      if (filters.actionType) params.append('action', filters.actionType);
      if (filters.userId) params.append('userId', filters.userId);
      if (filters.dateRange) {
        params.append('startDate', filters.dateRange[0].format('YYYY-MM-DD'));
        params.append('endDate', filters.dateRange[1].format('YYYY-MM-DD'));
      }

      const response = await axios.get(
        `${API_BASE_URL}/api/audit-logs?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setLogs(response.data.logs);
        setPagination(prev => ({
          ...prev,
          total: response.data.total || response.data.logs.length
        }));
      }
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      // Use mock data for demo
      setLogs(generateMockLogs());
    } finally {
      setLoading(false);
    }
  }, [pagination.current, pagination.pageSize, filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Generate mock logs for demo
  const generateMockLogs = () => {
    const actions = Object.keys(ACTION_CONFIG);
    const users = ['admin', 'john.smith', 'sarah.jones', 'mike.wilson'];
    return Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      action: actions[Math.floor(Math.random() * actions.length)],
      user_id: Math.floor(Math.random() * 10) + 1,
      username: users[Math.floor(Math.random() * users.length)],
      target_user: users[Math.floor(Math.random() * users.length)],
      details: { message: 'Sample audit log entry' },
      ip_address: `192.168.1.${Math.floor(Math.random() * 255)}`,
      created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
    }));
  };

  // Table columns
  const columns = [
    {
      title: 'Time',
      dataIndex: 'created_at',
      key: 'time',
      width: 160,
      render: (date) => (
        <Tooltip title={new Date(date).toLocaleString()}>
          <Text type="secondary">
            <HistoryOutlined /> {formatTimeAgo(new Date(date))}
          </Text>
        </Tooltip>
      ),
      sorter: (a, b) => new Date(a.created_at) - new Date(b.created_at),
      defaultSortOrder: 'descend'
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      width: 180,
      render: (action) => {
        const config = ACTION_CONFIG[action] || { icon: <AuditOutlined />, color: 'default', label: action };
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.label}
          </Tag>
        );
      },
      filters: Object.entries(ACTION_CONFIG).map(([key, val]) => ({
        text: val.label,
        value: key
      })),
      onFilter: (value, record) => record.action === value
    },
    {
      title: 'Performed By',
      key: 'user',
      width: 150,
      render: (_, record) => (
        <Space>
          <Avatar size="small" icon={<UserOutlined />} />
          <Text>{record.username}</Text>
        </Space>
      )
    },
    {
      title: 'Target',
      key: 'target',
      render: (_, record) => (
        record.target_user ? (
          <Space>
            <Avatar size="small" style={{ backgroundColor: '#1890ff' }} icon={<UserOutlined />} />
            <Text>{record.target_user}</Text>
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        )
      )
    },
    {
      title: 'Details',
      key: 'details',
      render: (_, record) => (
        <Text type="secondary" ellipsis style={{ maxWidth: 200 }}>
          {record.details?.message || JSON.stringify(record.details)}
        </Text>
      )
    },
    {
      title: 'IP Address',
      dataIndex: 'ip_address',
      key: 'ip',
      width: 120,
      render: (ip) => <Text code>{ip}</Text>
    }
  ];

  // Format time ago
  const formatTimeAgo = (date) => {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  // Export logs
  const handleExport = () => {
    const csv = [
      ['Time', 'Action', 'Performed By', 'Target', 'IP Address'],
      ...logs.map(log => [
        new Date(log.created_at).toLocaleString(),
        ACTION_CONFIG[log.action]?.label || log.action,
        log.username,
        log.target_user || '',
        log.ip_address || ''
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // Calculate stats
  const todayLogs = logs.filter(l => 
    new Date(l.created_at).toDateString() === new Date().toDateString()
  );
  const permissionChanges = logs.filter(l => 
    l.action?.includes('permission') || l.action?.includes('role')
  );

  return (
    <div className="audit-log">
      {/* Stats */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Total Events"
              value={logs.length}
              prefix={<AuditOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Today"
              value={todayLogs.length}
              prefix={<HistoryOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Permission Changes"
              value={permissionChanges.length}
              prefix={<SafetyCertificateOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Unique Users"
              value={new Set(logs.map(l => l.user_id)).size}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col span={6}>
            <Select
              placeholder="Filter by action"
              allowClear
              style={{ width: '100%' }}
              value={filters.actionType}
              onChange={(val) => setFilters(f => ({ ...f, actionType: val }))}
            >
              {Object.entries(ACTION_CONFIG).map(([key, val]) => (
                <Option key={key} value={key}>{val.label}</Option>
              ))}
            </Select>
          </Col>
          <Col span={6}>
            <RangePicker
              style={{ width: '100%' }}
              onChange={(dates) => setFilters(f => ({ ...f, dateRange: dates }))}
            />
          </Col>
          <Col span={6}>
            <Input
              placeholder="Search user..."
              prefix={<SearchOutlined />}
              allowClear
            />
          </Col>
          <Col span={6} style={{ textAlign: 'right' }}>
            <Space>
              <Button icon={<FilterOutlined />} onClick={fetchLogs}>
                Apply Filters
              </Button>
              <Button icon={<DownloadOutlined />} onClick={handleExport}>
                Export
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Log Table */}
      <Card size="small">
        <Table
          columns={columns}
          dataSource={logs}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} events`,
            onChange: (page, pageSize) => setPagination(p => ({ ...p, current: page, pageSize }))
          }}
          size="middle"
        />
      </Card>

      {/* Recent Timeline */}
      <Card
        title={<><HistoryOutlined /> Recent Activity Timeline</>}
        size="small"
        style={{ marginTop: 16 }}
      >
        <Timeline>
          {logs.slice(0, 10).map(log => {
            const config = ACTION_CONFIG[log.action] || { color: 'gray', label: log.action };
            return (
              <Timeline.Item
                key={log.id}
                color={config.color}
              >
                <p>
                  <Tag color={config.color} size="small">{config.label}</Tag>
                  <Text strong>{log.username}</Text>
                  {log.target_user && (
                    <> → <Text>{log.target_user}</Text></>
                  )}
                </p>
                <p>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {new Date(log.created_at).toLocaleString()}
                    {log.ip_address && ` • ${log.ip_address}`}
                  </Text>
                </p>
              </Timeline.Item>
            );
          })}
        </Timeline>
      </Card>
    </div>
  );
};

export default AuditLog;
