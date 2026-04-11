/**
 * AuditTrailSection — H-008 field-level audit trail table (admin only).
 */
import React, { useState } from 'react';
import { Card, Space, Button, Table, Tag, Empty, Typography } from 'antd';
import { AuditOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function AuditTrailSection({ inquiryId, isAdmin }) {
  const [auditTrail, setAuditTrail] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadAuditTrail = async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.get(`${API_BASE}/api/mes/presales/inquiries/${inquiryId}/audit-trail`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAuditTrail(res.data?.data || []);
      setLoaded(true);
    } catch { /* non-critical */ }
    finally { setLoading(false); }
  };

  if (!isAdmin) return null;

  return (
    <Card
      title={<Space><AuditOutlined />Field-Level Audit Trail</Space>}
      style={{ marginBottom: 16 }}
      extra={
        !loaded
          ? <Button size="small" onClick={loadAuditTrail} loading={loading}>Load Audit Log</Button>
          : <Text type="secondary" style={{ fontSize: 12 }}>{auditTrail.length} events</Text>
      }
    >
      {!loaded ? (
        <Text type="secondary">Click "Load Audit Log" to view field-level changes.</Text>
      ) : auditTrail.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No audit entries" />
      ) : (
        <Table
          size="small"
          rowKey="id"
          pagination={{ pageSize: 20, showSizeChanger: false }}
          dataSource={auditTrail}
          columns={[
            { title: 'When', dataIndex: 'created_at', width: 160,
              render: (v) => dayjs(v).format('DD MMM YYYY HH:mm') },
            { title: 'User', dataIndex: 'user_name', width: 140,
              render: (v, r) => <><Text strong>{v || '—'}</Text><br/><Text type="secondary" style={{fontSize:11}}>{r.user_role||''}</Text></> },
            { title: 'Table', dataIndex: 'table_name', width: 200,
              render: (v) => <Tag style={{fontSize:11}}>{v}</Tag> },
            { title: 'Action', dataIndex: 'action', width: 90,
              render: (v) => <Tag color={v==='created'?'green':v==='deleted'?'red':'blue'}>{v}</Tag> },
            { title: 'Changed Fields', dataIndex: 'changed_fields',
              render: (v) => Array.isArray(v) ? v.map(f => <Tag key={f} style={{fontSize:11,marginBottom:2}}>{f}</Tag>) : '—' },
          ]}
        />
      )}
    </Card>
  );
}
