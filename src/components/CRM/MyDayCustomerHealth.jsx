import React from 'react';
import { Button, Card, Empty, Progress, Space, Tag, Tooltip, Typography } from 'antd';
import {
  ArrowRightOutlined,
  FallOutlined,
  FormOutlined,
  HeartOutlined,
  MailOutlined,
  PhoneOutlined,
  RiseOutlined,
  StopOutlined,
  WarningOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

const RISK_CONFIG = {
  critical: { color: '#dc2626', tag: 'error',   label: 'Critical',  icon: <WarningOutlined /> },
  at_risk:  { color: '#ea580c', tag: 'warning',  label: 'At Risk',   icon: <WarningOutlined /> },
  watch:    { color: '#ca8a04', tag: 'gold',     label: 'Watch',     icon: null },
  healthy:  { color: '#16a34a', tag: 'success',  label: 'Healthy',   icon: null },
  unknown:  { color: '#6b7280', tag: 'default',  label: 'No Data',   icon: null },
};

const TREND_ICON = {
  declining: <FallOutlined style={{ color: '#dc2626', fontSize: 13 }} />,
  growing:   <RiseOutlined style={{ color: '#16a34a', fontSize: 13 }} />,
  stable:    null,
  none:      null,
};

const formatCurrency = (value) => {
  const n = Number(value || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${Math.round(n)}`;
};

const MyDayCustomerHealth = ({ items = [], onOpenCustomer, onQuickCall, onQuickEmail, onQuickNote, onMarkLost }) => {
  return (
    <Card
      title={<Space><HeartOutlined style={{ color: '#16a34a' }} /><span>Customer Health</span></Space>}
      extra={<Text type="secondary" style={{ fontSize: 11 }}>AI transaction analysis</Text>}
      styles={{ body: { padding: 0 } }}
      className="crm-info-card"
    >
      {items.length === 0 ? (
        <Empty description="No customers found" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 24 }} />
      ) : (
        <div style={{ maxHeight: 480, overflowY: 'auto', overflowX: 'hidden' }}>
          {items.map((cust) => {
            const cfg = RISK_CONFIG[cust.risk_level] || RISK_CONFIG.unknown;
            const trendIcon = TREND_ICON[cust.trend] || null;

            return (
              <div
                key={cust.id}
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid #f0f0f0',
                  borderLeft: `3px solid ${cfg.color}`,
                }}
              >
                {/* Row 1: Risk tag + Name + Trend */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                  <Tag color={cfg.tag} style={{ margin: 0 }}>
                    {cfg.icon ? <>{cfg.icon} </> : null}{cfg.label}
                  </Tag>
                  {trendIcon && (
                    <Tooltip title={`Revenue ${cust.trend}`}>{trendIcon}</Tooltip>
                  )}
                  <Text strong style={{ fontSize: 13 }}>{cust.customer_name}</Text>
                  {cust.country ? (
                    <Text type="secondary" style={{ fontSize: 11 }}>({cust.country})</Text>
                  ) : null}
                </div>

                {/* Row 2: AI insight */}
                <Text style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 6 }}>
                  {cust.insight}
                </Text>

                {/* Row 3: Risk gauge + stats */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                  <Tooltip title={`Risk score: ${cust.risk_score}/100`}>
                    <Progress
                      percent={cust.risk_score}
                      size="small"
                      strokeColor={cfg.color}
                      showInfo={false}
                      style={{ width: 60, margin: 0 }}
                    />
                  </Tooltip>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Avg AED {formatCurrency(cust.monthly_avg_revenue)}/mo
                  </Text>
                  {cust.last_order_month ? (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Last: {cust.last_order_month}
                    </Text>
                  ) : null}
                  {Number(cust.open_deal_count) > 0 ? (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {cust.open_deal_count} deal(s)
                    </Text>
                  ) : null}
                </div>

                {/* Row 4: Quick actions */}
                <Space size={4}>
                  <Button size="small" icon={<PhoneOutlined />} onClick={() => onQuickCall?.(cust)} />
                  <Button size="small" icon={<MailOutlined />} onClick={() => onQuickEmail?.(cust)} />
                  <Button size="small" icon={<FormOutlined />} onClick={() => onQuickNote?.(cust)} />
                  <Tooltip title="Mark as Lost Business">
                    <Button size="small" danger icon={<StopOutlined />} onClick={() => onMarkLost?.(cust)} />
                  </Tooltip>
                  <Button type="link" size="small" onClick={() => onOpenCustomer?.(cust)} style={{ paddingLeft: 4 }}>
                    Open <ArrowRightOutlined />
                  </Button>
                </Space>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default MyDayCustomerHealth;
