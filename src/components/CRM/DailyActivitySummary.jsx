/**
 * DailyActivitySummary — today's activity counts by type for the logged-in rep
 * Used on CRMDashboard as a KPI card.
 */
import React, { useEffect, useState } from 'react';
import { Card, Space, Typography, Spin, Tooltip } from 'antd';
import {
  PhoneOutlined, ShopOutlined, WhatsAppOutlined,
  MailOutlined, ClockCircleOutlined, ThunderboltOutlined
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Text, Title } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const TYPES = [
  { key: 'call',      label: 'Calls',      icon: <PhoneOutlined />,       color: '#52c41a' },
  { key: 'visit',     label: 'Visits',     icon: <ShopOutlined />,        color: '#1890ff' },
  { key: 'whatsapp',  label: 'WhatsApp',   icon: <WhatsAppOutlined />,    color: '#25d366' },
  { key: 'email',     label: 'Emails',     icon: <MailOutlined />,        color: '#722ed1' },
  { key: 'follow_up', label: 'Follow-Ups', icon: <ClockCircleOutlined />, color: '#fa8c16' },
];

export default function DailyActivitySummary({ onRefresh }) {
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('auth_token');
        const today = dayjs().format('YYYY-MM-DD');
        const res = await axios.get(`${API_BASE}/api/crm/activities`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { repId: 'me', from: today, to: today + 'T23:59:59', limit: 100 },
        });
        const data = res.data?.data || [];
        const c = {};
        TYPES.forEach(t => { c[t.key] = 0; });
        data.forEach(a => { if (c[a.type] !== undefined) c[a.type]++; });
        setCounts(c);
        setTotal(data.length);
      } catch {
        setCounts({});
        setTotal(0);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [onRefresh]);

  return (
    <Card
      size="small"
      title={
        <Space>
          <ThunderboltOutlined style={{ color: '#fa8c16' }} />
          <Text strong>Today's Activity</Text>
        </Space>
      }
      style={{ borderRadius: 8 }}
    >
      {loading ? (
        <Spin style={{ display: 'block', margin: '12px auto' }} />
      ) : (
        <>
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <Title level={2} style={{ margin: 0, color: total > 0 ? '#1890ff' : '#bfbfbf' }}>{total}</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>activities logged today</Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 8 }}>
            {TYPES.map(t => (
              <Tooltip key={t.key} title={t.label}>
                <div style={{ textAlign: 'center', minWidth: 40 }}>
                  <div style={{ color: counts[t.key] > 0 ? t.color : '#d9d9d9', fontSize: 18 }}>{t.icon}</div>
                  <Text style={{ fontSize: 13, fontWeight: 600, color: counts[t.key] > 0 ? t.color : '#bfbfbf' }}>
                    {counts[t.key] || 0}
                  </Text>
                </div>
              </Tooltip>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
