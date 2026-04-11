/**
 * EstimationQueue — List inquiries at estimation/cse_approved stage.
 *
 * Management sees all; rep sees own. Click row → navigate to EstimationCalculator.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Card, Input, Typography, Spin } from 'antd';
import { CalculatorOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import axios from 'axios';
import dayjs from 'dayjs';
import queueDataUtils from './estimationQueueData.cjs';

const { normalizeEstimationQueueRows } = queueDataUtils;

const { Title } = Typography;
const { Search } = Input;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const PRODUCT_GROUP_COLORS = {
  BOPP: 'blue', PET: 'purple', 'PA/PE': 'green', CPP: 'orange', LDPE: 'cyan', Metalized: 'gold',
};

export default function EstimationQueue() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.get(`${API_BASE}/api/mes/presales/inquiries`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { stage: 'estimation,cse_approved' },
      });
      if (res.data.success) {
        setData(normalizeEstimationQueueRows(res.data?.data));
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = data.filter(r =>
    !search || [r.inquiry_number, r.customer_name, r.product_group]
      .filter(Boolean).some(v => v.toLowerCase().includes(search.toLowerCase()))
  );

  const columns = [
    {
      title: 'Inquiry #', dataIndex: 'inquiry_number', key: 'inq',
      sorter: (a, b) => (a.inquiry_number || '').localeCompare(b.inquiry_number || ''),
    },
    {
      title: 'Customer', dataIndex: 'customer_name', key: 'cust', ellipsis: true,
      sorter: (a, b) => (a.customer_name || '').localeCompare(b.customer_name || ''),
    },
    {
      title: 'Product Group', dataIndex: 'product_group', key: 'pg',
      render: v => v ? <Tag color={PRODUCT_GROUP_COLORS[v] || 'default'}>{v}</Tag> : '—',
    },
    {
      title: 'Stage', dataIndex: 'inquiry_stage', key: 'stage',
      render: v => <Tag color={v === 'estimation' ? 'processing' : 'success'}>{v?.replace(/_/g, ' ')}</Tag>,
    },
    {
      title: 'Days in Stage', key: 'days',
      render: (_, r) => {
        const d = r.stage_changed_at ? dayjs().diff(dayjs(r.stage_changed_at), 'day') : '—';
        return <span style={{ color: d > 5 ? '#ff4d4f' : undefined }}>{d}</span>;
      },
      sorter: (a, b) => {
        const da = a.stage_changed_at ? dayjs().diff(dayjs(a.stage_changed_at), 'day') : 0;
        const db = b.stage_changed_at ? dayjs().diff(dayjs(b.stage_changed_at), 'day') : 0;
        return da - db;
      },
    },
    {
      title: 'Rep', dataIndex: 'sales_rep_name', key: 'rep', ellipsis: true,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={<><CalculatorOutlined style={{ marginRight: 8 }} /><Title level={4} style={{ display: 'inline', margin: 0 }}>Estimation Queue</Title></>}
        extra={<Search placeholder="Search…" allowClear style={{ width: 260 }} onSearch={setSearch} onChange={e => !e.target.value && setSearch('')} />}
      >
        {loading ? <Spin /> : (
          <Table
            dataSource={filtered}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: true }}
            onRow={r => ({ onClick: () => navigate(`/mes/estimation/${r.id}`), style: { cursor: 'pointer' } })}
            locale={{ emptyText: 'No inquiries awaiting estimation' }}
          />
        )}
      </Card>
    </div>
  );
}
