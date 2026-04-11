/**
 * RiskAlertPanel — CRM risk alerts: declining customers + dormant accounts
 *
 * Rules (from docs/CRM_IMPLEMENTATION_ROADMAP.md):
 *  - Every alert shows: What · Why · What to do
 *  - Max 5 alerts visible at once. If everything is an alert, nothing is.
 *  - Full list accessible via "View all" modal
 *
 * Props:
 *  groupId {number|null} — optional admin group filter (null = all groups)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Space, Tag, Typography, Button, Skeleton, Empty, Modal, Table, App } from 'antd';
import { WarningOutlined, ClockCircleOutlined, ArrowDownOutlined, ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';
import { API_BASE_URL, fmt } from './CRMDashboardUtils.jsx';
import './CRM.css';

const { Text } = Typography;

// Map alert type to display config
const ALERT_TYPE = {
  declining: {
    icon:       <ArrowDownOutlined />,
    color:      '#cf1322',
    bg:         '#fff1f0',
    border:     '#ffa39e',
    tagColor:   'error',
    tagText:    'Declining',
    action:     'Create inquiry',
    actionPath: '/crm/customers',
  },
  dormant: {
    icon:       <ClockCircleOutlined />,
    color:      '#d46b08',
    bg:         '#fff7e6',
    border:     '#ffd591',
    tagColor:   'warning',
    tagText:    'Dormant',
    action:     'Create inquiry',
    actionPath: '/crm/customers',
  },
};

export default function RiskAlertPanel({ groupId = null }) {
  const { message } = App.useApp();
  const [alerts, setAlerts]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [modalOpen, setModalOpen]     = useState(false);
  const [allAlerts, setAllAlerts]     = useState([]);

  const buildParams = useCallback(() => {
    if (groupId && groupId !== 'all') return { group_id: groupId };
    return {};
  }, [groupId]);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const token   = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };
      const params  = buildParams();

      const [declRes, dormRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/crm/alerts/declining-customers`, { headers, params, timeout: 15_000 })
          .catch(() => ({ data: { success: false, data: [] } })),
        axios.get(`${API_BASE_URL}/api/crm/alerts/dormant-accounts`,    { headers, params, timeout: 15_000 })
          .catch(() => ({ data: { success: false, data: [] } })),
      ]);

      const declining = (declRes.data?.data || []).map(r => ({
        id:      `decl-${r.customer_name}`,
        type:    'declining',
        what:    r.customer_name,
        group:   r.sales_rep_group_name,
        why:     `Orders down ${Math.abs(r.growth_pct)}% vs last year (same period)`,
        todo:    'Review account — create an inquiry or schedule a call',
        detail:  `This year: ${fmt(r.this_year)} · Last year: ${fmt(r.last_year)}`,
        score:   Math.abs(r.growth_pct),
      }));

      const dormant = (dormRes.data?.data || []).map(r => ({
        id:      `dorm-${r.customer_name}`,
        type:    'dormant',
        what:    r.customer_name,
        group:   r.sales_rep_group_name,
        why:     `No orders in ${r.days_dormant} days. No open inquiry on file.`,
        todo:    'Create an inquiry or schedule a quarterly review call',
        detail:  `Total revenue: ${fmt(r.total_revenue)}`,
        score:   r.days_dormant,
      }));

      // Merge, sort by severity desc, cap total at 10 for "view all" modal
      const merged = [...declining, ...dormant].sort((a, b) => b.score - a.score);
      setAllAlerts(merged);
      // Show max 5 in panel
      setAlerts(merged.slice(0, 5));
    } catch (err) {
      message.error('Failed to load risk alerts');
    } finally {
      setLoading(false);
    }
  }, [buildParams, message]);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  if (loading) {
    return (
      <Card variant="borderless" className="crm-risk-panel">
        <Skeleton active paragraph={{ rows: 3 }} />
      </Card>
    );
  }

  if (!alerts.length) {
    return (
      <Card variant="borderless" className="crm-risk-panel">
        <div className="crm-risk-header">
          <Space size={6}>
            <WarningOutlined className="crm-risk-icon-title" />
            <Text strong>Risk Alerts</Text>
          </Space>
        </div>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<Text type="secondary">No risk alerts — all accounts look healthy</Text>}
        />
      </Card>
    );
  }

  return (
    <>
      <Card variant="borderless" className="crm-risk-panel">
        <div className="crm-risk-header">
          <Space size={6}>
            <WarningOutlined className="crm-risk-icon-title" />
            <Text strong>Risk Alerts</Text>
            <Tag color="error" style={{ marginLeft: 4 }}>{allAlerts.length}</Tag>
          </Space>
          <Space size={8}>
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              onClick={loadAlerts}
              className="crm-risk-reload-btn"
            />
            {allAlerts.length > 5 && (
              <Button type="link" size="small" onClick={() => setModalOpen(true)}>
                View all {allAlerts.length}
              </Button>
            )}
          </Space>
        </div>

        <div className="crm-risk-list">
          {alerts.map(alert => {
            const cfg = ALERT_TYPE[alert.type];
            return (
              <div
                key={alert.id}
                className="crm-risk-item"
                style={{ background: cfg.bg, borderColor: cfg.border }}
              >
                <div className="crm-risk-item-header">
                  <Space size={6}>
                    <span style={{ color: cfg.color }}>{cfg.icon}</span>
                    <Text strong className="crm-risk-customer">{alert.what}</Text>
                    <Tag color={cfg.tagColor} style={{ marginLeft: 4 }}>{cfg.tagText}</Tag>
                  </Space>
                  {alert.group && (
                    <Text type="secondary" className="crm-risk-group">{alert.group}</Text>
                  )}
                </div>
                <div className="crm-risk-why">
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    <strong>Why:</strong> {alert.why}
                  </Text>
                </div>
                <div className="crm-risk-todo">
                  <Text style={{ fontSize: 12, color: '#389e0d' }}>
                    → {alert.todo}
                  </Text>
                </div>
                <div className="crm-risk-detail">
                  <Text type="secondary" style={{ fontSize: 11 }}>{alert.detail}</Text>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* View all modal */}
      <Modal
        title={
          <Space size={8}>
            <WarningOutlined style={{ color: '#cf1322' }} />
            All Risk Alerts ({allAlerts.length})
          </Space>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={760}
      >
        <Table
          dataSource={allAlerts}
          rowKey="id"
          size="small"
          pagination={false}
          columns={[
            {
              title: 'Customer',
              dataIndex: 'what',
              render: (v, r) => (
                <Space direction="vertical" size={2}>
                  <Text strong>{v}</Text>
                  {r.group && <Text type="secondary" style={{ fontSize: 11 }}>{r.group}</Text>}
                </Space>
              ),
            },
            {
              title: 'Type',
              dataIndex: 'type',
              width: 100,
              render: v => {
                const cfg = ALERT_TYPE[v];
                return <Tag color={cfg.tagColor}>{cfg.tagText}</Tag>;
              },
            },
            { title: 'Why it was flagged',  dataIndex: 'why',    render: v => <Text style={{ fontSize: 12 }}>{v}</Text> },
            { title: 'Details',             dataIndex: 'detail', render: v => <Text type="secondary" style={{ fontSize: 11 }}>{v}</Text> },
            { title: 'Action',              dataIndex: 'todo',   render: v => <Text style={{ fontSize: 12, color: '#389e0d' }}>→ {v}</Text> },
          ]}
        />
      </Modal>
    </>
  );
}
