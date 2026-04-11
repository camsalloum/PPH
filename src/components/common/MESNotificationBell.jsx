import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Dropdown, Empty, List, Popconfirm, Space, Spin, Tooltip, Typography } from 'antd';
import { BellOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './MESNotificationBell.css';

const { Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const typeLabel = {
  sar_submitted: 'SAR Submitted',
  sar_received_by_qc: 'Samples Received',
  qc_testing_complete: 'QC Complete',
  cse_pending_approval: 'CSE Approval',
  cse_pending_production: 'Production Approval',
  cse_approved: 'CSE Approved',
  cse_rejected: 'CSE Rejected',
  cse_revision_requested: 'Revision Requested',
  crm_trip_submitted_for_approval: 'Trip Approval',
  crm_trip_approval_decision: 'Trip Decision',
};

const isTripApprovalType = (type) => typeof type === 'string' && type.startsWith('crm_trip_approval');

export default function MESNotificationBell({ highlightTripApprovals = false, unreadOnly = false }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasTripApprovalUnread, setHasTripApprovalUnread] = useState(false);

  const headers = useMemo(() => {
    const token = localStorage.getItem('auth_token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadUnreadCount = useCallback(async () => {
    if (window.__EXPORT_MODE__) return;
    try {
      const res = await axios.get(`${API_BASE}/api/notifications/unread-count`, { headers });
      setCount(Number(res.data?.count || 0));
    } catch {
      setCount(0);
    }
  }, [headers]);

  const loadNotifications = useCallback(async () => {
    if (window.__EXPORT_MODE__) return;
    setLoading(true);
    try {
      const unreadQuery = unreadOnly ? '&unreadOnly=true' : '';
      const res = await axios.get(`${API_BASE}/api/notifications?limit=12${unreadQuery}`, { headers });
      const data = Array.isArray(res.data?.data) ? res.data.data : [];
      const sortedData = highlightTripApprovals
        ? [
            ...data.filter((item) => isTripApprovalType(item?.type)),
            ...data.filter((item) => !isTripApprovalType(item?.type)),
          ]
        : data;
      setRows(sortedData);
      if (highlightTripApprovals) {
        const hasTripUnread = data.some((item) => !item?.is_read && isTripApprovalType(item?.type));
        setHasTripApprovalUnread(hasTripUnread);
      }
    } catch {
      setRows([]);
      if (highlightTripApprovals) setHasTripApprovalUnread(false);
    } finally {
      setLoading(false);
    }
  }, [headers, highlightTripApprovals, unreadOnly]);

  const loadTripApprovalUnreadFlag = useCallback(async () => {
    if (window.__EXPORT_MODE__ || !highlightTripApprovals) return;
    try {
      const res = await axios.get(`${API_BASE}/api/notifications?limit=20&unreadOnly=true`, { headers });
      const data = Array.isArray(res.data?.data) ? res.data.data : [];
      const hasTripUnread = data.some((item) => isTripApprovalType(item?.type));
      setHasTripApprovalUnread(hasTripUnread);
    } catch {
      setHasTripApprovalUnread(false);
    }
  }, [headers, highlightTripApprovals]);

  useEffect(() => {
    // H-007: real-time SSE connection replaces 30-second polling
    const token = localStorage.getItem('auth_token');
    if (!token || window.__EXPORT_MODE__) {
      // Fallback: plain poll every 60s if no token or export mode
      loadUnreadCount();
      loadTripApprovalUnreadFlag();
      const timer = setInterval(() => {
        loadUnreadCount();
        loadTripApprovalUnreadFlag();
      }, 60000);
      return () => clearInterval(timer);
    }

    const url = `${API_BASE}/api/notifications/stream?token=${encodeURIComponent(token)}`;
    let es;
    let fallbackTimer;
    let reconnectTimer;
    let retryDelay = 5000; // start at 5s, exponential backoff up to 60s
    const MAX_RETRY = 60000;

    const connect = () => {
      es = new EventSource(url);

      es.addEventListener('connected', (e) => {
        try {
          const data = JSON.parse(e.data);
          setCount(Number(data.unreadCount) || 0);
          loadTripApprovalUnreadFlag();
          retryDelay = 5000; // reset backoff on successful connection
        } catch { /* ignore */ }
      });

      es.addEventListener('notification', () => {
        // A new notification was pushed — bump the badge and do a lightweight count refresh
        setCount((c) => c + 1);
        loadTripApprovalUnreadFlag();
      });

      es.onerror = () => {
        // Connection dropped — close, back off and reconnect
        es.close();
        clearInterval(fallbackTimer);
        // During reconnect gap, fallback-poll once
        loadUnreadCount();
        loadTripApprovalUnreadFlag();
        reconnectTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY); // exponential backoff
      };

      // Also do an initial full count fetch in case SSE connected message misses something
      loadUnreadCount();
      loadTripApprovalUnreadFlag();
    };

    connect();

    return () => {
      if (es) es.close();
      clearInterval(fallbackTimer);
      clearTimeout(reconnectTimer);
    };
  }, [loadTripApprovalUnreadFlag, loadUnreadCount]);

  const openAndLoad = async (nextOpen) => {
    setOpen(nextOpen);
    if (nextOpen) {
      await loadNotifications();
      await loadUnreadCount();
      await loadTripApprovalUnreadFlag();
    }
  };

  const openItem = async (item) => {
    try {
      await axios.patch(`${API_BASE}/api/notifications/${item.id}/read`, {}, { headers });
    } catch {
      // No-op
    }

    setOpen(false);
    await loadUnreadCount();
    await loadTripApprovalUnreadFlag();

    if (item.link) {
      navigate(item.link);
    }
  };

  const markAll = async () => {
    try {
      await axios.post(`${API_BASE}/api/notifications/mark-all-read`, {}, { headers });
      await loadNotifications();
      await loadUnreadCount();
      await loadTripApprovalUnreadFlag();
    } catch {
      // No-op
    }
  };

  const deleteItem = async (itemId) => {
    try {
      await axios.delete(`${API_BASE}/api/notifications/${itemId}`, { headers });
      await loadNotifications();
      await loadUnreadCount();
      await loadTripApprovalUnreadFlag();
    } catch {
      // No-op
    }
  };

  const menu = (
    <div className="mes-notif-dropdown">
      <div className="mes-notif-header">
        <Text strong>Notifications</Text>
        <Space>
          <Badge count={count} size="small" />
          <Button size="small" type="link" onClick={markAll}>Mark all read</Button>
        </Space>
      </div>

      {loading ? (
        <div className="mes-notif-loading"><Spin size="small" /></div>
      ) : rows.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={unreadOnly ? 'No unread notifications' : 'No notifications'} />
      ) : (
        <List
          size="small"
          dataSource={rows}
          renderItem={(item) => (
            <List.Item className={`mes-notif-item ${item.is_read ? '' : 'is-unread'}`} onClick={() => openItem(item)}>
              <div style={{ width: '100%' }}>
                <div className="mes-notif-title-row">
                  <Text strong={!item.is_read}>{item.title}</Text>
                  <Space size={8}>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {typeLabel[item.type] || item.type}
                    </Text>
                    <Popconfirm
                      title="Delete notification?"
                      okText="Delete"
                      cancelText="Cancel"
                      okButtonProps={{ danger: true }}
                      onConfirm={(event) => {
                        if (event?.stopPropagation) event.stopPropagation();
                        return deleteItem(item.id);
                      }}
                      onCancel={(event) => {
                        if (event?.stopPropagation) event.stopPropagation();
                      }}
                    >
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        aria-label="Delete notification"
                        onClick={(event) => event.stopPropagation()}
                      />
                    </Popconfirm>
                  </Space>
                </div>
                {item.message && <Text type="secondary" style={{ fontSize: 12 }}>{item.message}</Text>}
              </div>
            </List.Item>
          )}
        />
      )}
    </div>
  );

  return (
    <Dropdown
      open={open}
      onOpenChange={openAndLoad}
      trigger={['click']}
      popupRender={() => menu}
      placement="bottomRight"
    >
      <Tooltip title="Notifications" placement="bottom">
        <div className={`mes-notif-bell ${highlightTripApprovals && hasTripApprovalUnread ? 'is-trip-highlight' : ''}`}>
          <Badge count={count} size="small" offset={[-2, 2]}>
            <BellOutlined className="mes-notif-icon" />
          </Badge>
        </div>
      </Tooltip>
    </Dropdown>
  );
}
