import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Card, Empty, Select, Space, Table, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { useAuth } from '../../../contexts/AuthContext';
import { canApproveProductionStage, canApproveQCStage } from '../../../utils/roleChecks';

const { Title, Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const statusColor = {
  pending_qc_manager: 'purple',
  pending_production: 'orange',
  revision_requested: 'volcano',
  approved: 'green',
  rejected: 'red',
};

export default function CSEApprovalQueue() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { message } = App.useApp();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  const headers = useMemo(() => {
    const token = localStorage.getItem('auth_token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  useEffect(() => {
    if (!statusFilter) {
      if (canApproveProductionStage(user) && !canApproveQCStage(user)) setStatusFilter('pending_production');
      else if (canApproveQCStage(user) && !canApproveProductionStage(user)) setStatusFilter('pending_qc_manager');
      else setStatusFilter('pending_qc_manager,pending_production');
    }
  }, [statusFilter, user?.role]);

  const loadQueue = useCallback(async () => {
    if (!statusFilter) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/mes/presales/cse?status=${encodeURIComponent(statusFilter)}&limit=100`, { headers });
      setRows(res.data?.data || []);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to load CSE queue');
    } finally {
      setLoading(false);
    }
  }, [headers, message, statusFilter]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const columns = [
    {
      title: 'CSE Number',
      dataIndex: 'cse_number',
      render: (value, row) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/mes/qc/cse/${row.id}`)}>
          {value}
        </Button>
      ),
    },
    { title: 'Sample', dataIndex: 'sample_number' },
    { title: 'Inquiry', dataIndex: 'inquiry_number' },
    { title: 'Customer', dataIndex: 'customer_name' },
    {
      title: 'Result',
      dataIndex: 'overall_result',
      render: (value) => <Tag>{(value || '-').toUpperCase()}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (value) => <Tag color={statusColor[value] || 'default'}>{value?.replaceAll('_', ' ')}</Tag>,
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      width: 130,
      render: (v) => v ? dayjs(v).format('DD MMM, HH:mm') : '-',
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, row) => (
        <Button size="small" type="primary" onClick={() => navigate(`/mes/qc/cse/${row.id}`)}>
          Review
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 20 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>CSE Approval Queue</Title>
          <Text type="secondary">Review generated Customer Sample Evaluation reports</Text>
        </div>
        <Space>
          <Select
            style={{ width: 260 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'pending_qc_manager', label: 'Pending QC Manager' },
              { value: 'pending_production', label: 'Pending Production' },
              { value: 'pending_qc_manager,pending_production', label: 'Pending (Both)' },
              { value: 'revision_requested', label: 'Revision Requested' },
              { value: 'approved,rejected', label: 'Finalized' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={loadQueue} loading={loading}>Refresh</Button>
        </Space>
      </Space>

      <Card>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: <Empty description="No CSE records" /> }}
        />
      </Card>
    </div>
  );
}
