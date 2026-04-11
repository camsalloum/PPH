/**
 * ActivityFeed — chronological list of logged activities
 * Props:
 *   customerId   — filter by customer
 *   prospectId   — filter by prospect
 *   repId        — filter by rep ('me' = logged-in user)
 *   limit        — max rows (default 20)
 *   compact      — smaller layout for dashboard
 *   onRefreshRef — optional ref to expose a refresh() function to parent
 */
import React, { useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { List, Tag, Typography, Spin, Empty, Space } from 'antd';
import {
  PhoneOutlined, ShopOutlined, WhatsAppOutlined,
  MailOutlined, ClockCircleOutlined
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const { Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const TYPE_CONFIG = {
  call:      { label: 'Call',       icon: <PhoneOutlined />,       color: '#52c41a' },
  visit:     { label: 'Visit',      icon: <ShopOutlined />,        color: '#1890ff' },
  whatsapp:  { label: 'WhatsApp',   icon: <WhatsAppOutlined />,    color: '#25d366' },
  email:     { label: 'Email',      icon: <MailOutlined />,        color: '#722ed1' },
  follow_up: { label: 'Follow-Up',  icon: <ClockCircleOutlined />, color: '#fa8c16' },
  // legacy types from old recent-activities endpoint
  prospect_approved: { label: 'Prospect Approved', icon: null, color: '#52c41a' },
  prospect_rejected: { label: 'Prospect Rejected', icon: null, color: '#ff4d4f' },
  prospect_new:      { label: 'New Prospect',      icon: null, color: '#1890ff' },
  customer_added:    { label: 'Customer Added',    icon: null, color: '#722ed1' },
};

/**
 * Classify an activity_date into a date bucket label.
 * Exported for testability.
 */
export function classifyDate(activityDate) {
  if (!activityDate) return 'Earlier';
  const d = dayjs(activityDate).startOf('day');
  const today = dayjs().startOf('day');
  const diff = today.diff(d, 'day');
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff <= 7) return 'Last 7 Days';
  return 'Earlier';
}

/**
 * Group an array of activities into ordered date buckets.
 */
function groupActivitiesByDate(activities) {
  const bucketOrder = ['Today', 'Yesterday', 'Last 7 Days', 'Earlier'];
  const map = { Today: [], Yesterday: [], 'Last 7 Days': [], Earlier: [] };
  for (const a of activities) {
    const label = classifyDate(a.activity_date);
    map[label].push(a);
  }
  return bucketOrder.map(label => ({ label, items: map[label] }));
}

const ActivityFeed = forwardRef(function ActivityFeed(
  { customerId, prospectId, repId, limit = 20, compact = false },
  ref
) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const params = { limit };
      if (customerId) params.customerId = customerId;
      if (prospectId) params.prospectId = prospectId;
      if (repId)      params.repId = repId;

      const res = await axios.get(`${API_BASE}/api/crm/activities`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      setActivities(res.data?.data || []);
    } catch {
      setActivities([]);
    } finally {
      setLoading(false);
    }
  }, [customerId, prospectId, repId, limit]);

  useEffect(() => { load(); }, [load]);

  // Expose refresh() to parent via ref
  useImperativeHandle(ref, () => ({ refresh: load }), [load]);

  if (loading) return <Spin style={{ display: 'block', margin: '24px auto' }} />;
  if (!activities.length) return <Empty description="No activities yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  // Group activities by date bucket
  const groups = groupActivitiesByDate(activities);
  const hasToday = groups.some(g => g.label === 'Today' && g.items.length > 0);

  return (
    <div>
      {!hasToday && (
        <div style={{
          background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 6,
          padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#ad6800',
        }}>
          No activities logged today — use the Quick Log button
        </div>
      )}
      {groups.map(group => {
        if (!group.items.length) return null;
        return (
          <div key={group.label} style={{ marginBottom: 8 }}>
            <div style={{
              fontSize: 12, fontWeight: 600, color: '#8c8c8c', textTransform: 'uppercase',
              letterSpacing: 0.5, padding: '8px 0 4px', borderBottom: '1px solid #f0f0f0',
              marginBottom: 4,
            }}>
              {group.label}
            </div>
            <List
              dataSource={group.items}
              renderItem={item => {
                const cfg = TYPE_CONFIG[item.type] || { label: item.type, icon: null, color: '#8c8c8c' };
                const name = item.customer_name || item.prospect_name || item.detail || '';
                const timeAgo = item.activity_date ? dayjs(item.activity_date).fromNow() : '';
                return (
                  <List.Item style={{ padding: compact ? '6px 0' : '10px 0', alignItems: 'flex-start' }}>
                    <Space align="start" style={{ width: '100%' }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        background: `${cfg.color}18`, color: cfg.color, flexShrink: 0,
                      }}>
                        {cfg.icon || '•'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Space size={4} wrap>
                          <Tag color={cfg.color} style={{ fontSize: 11, margin: 0 }}>{cfg.label}</Tag>
                          {name && <Text type="secondary" style={{ fontSize: 12 }}>{name}</Text>}
                          {item.rep_name && !repId && (
                            <Text type="secondary" style={{ fontSize: 11 }}>· {item.rep_name}</Text>
                          )}
                        </Space>
                        {item.outcome_note && (
                          <div style={{ marginTop: 2 }}>
                            <Text style={{ fontSize: 13 }}>{item.outcome_note}</Text>
                          </div>
                        )}
                        {item.text && !item.outcome_note && (
                          <div style={{ marginTop: 2 }}>
                            <Text style={{ fontSize: 13 }}>{item.text}</Text>
                          </div>
                        )}
                        <Text type="secondary" style={{ fontSize: 11 }}>{timeAgo}</Text>
                      </div>
                    </Space>
                  </List.Item>
                );
              }}
            />
          </div>
        );
      })}
    </div>
  );
});


export default ActivityFeed;
