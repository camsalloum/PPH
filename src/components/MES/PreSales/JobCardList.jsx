/**
 * JobCardList — Management view at /mes/job-cards
 */
import React, { useState, useEffect } from 'react';
import { Table, Tag, Select, DatePicker, Space, Card, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title } = Typography;
const { RangePicker } = DatePicker;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const STATUS_COLORS = {
  draft: 'orange', approved: 'green', in_production: 'blue', completed: 'cyan', cancelled: 'red',
};
const MAT_COLORS = {
  pending: 'default', partially_ordered: 'orange', ordered: 'blue', available: 'green',
};

export default function JobCardList() {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState(null);
  const [dateRange, setDateRange] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (dateRange?.[0]) params.from = dateRange[0].format('YYYY-MM-DD');
      if (dateRange?.[1]) params.to = dateRange[1].format('YYYY-MM-DD');
      const res = await axios.get(`${API_BASE}/api/mes/presales/job-cards`, {
        params, headers: { Authorization: `Bearer ${token}` },
      });
      setData(res.data?.data || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [statusFilter, dateRange]);

  const columns = [
    { title: 'JC Number', dataIndex: 'job_number', key: 'jn', sorter: (a, b) => a.job_number?.localeCompare(b.job_number) },
    { title: 'Inquiry', dataIndex: 'inquiry_number', key: 'inq' },
    { title: 'Customer', dataIndex: 'customer_name', key: 'cust', ellipsis: true },
    { title: 'Status', dataIndex: 'status', key: 'st', render: v => <Tag color={STATUS_COLORS[v]}>{v}</Tag> },
    { title: 'Delivery Date', dataIndex: 'required_delivery_date', key: 'dd',
      render: v => v ? dayjs(v).format('DD MMM YYYY') : '—' },
    { title: 'Material', dataIndex: 'material_status', key: 'ms',
      render: v => <Tag color={MAT_COLORS[v]}>{v}</Tag> },
  ];

  return (
    <Card>
      <Title level={4}>Job Cards</Title>
      <Space style={{ marginBottom: 16 }}>
        <Select placeholder="Status" allowClear style={{ width: 150 }} onChange={setStatusFilter}
          options={['draft','approved','in_production','completed','cancelled'].map(s => ({ value: s, label: s }))} />
        <RangePicker onChange={setDateRange} />
      </Space>
      <Table dataSource={data} columns={columns} loading={loading} rowKey="id" size="small"
        onRow={r => ({ onClick: () => navigate(`/mes/presales/inquiries/${r.inquiry_id}`) })}
        style={{ cursor: 'pointer' }} />
    </Card>
  );
}
