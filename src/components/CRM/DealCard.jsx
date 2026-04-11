/**
 * DealCard — individual deal card used in the Kanban pipeline
 */
import React from 'react';
import { Card, Tag, Typography, Space, Tooltip } from 'antd';
import { DollarOutlined, CalendarOutlined, UserOutlined } from '@ant-design/icons';

const { Text } = Typography;

const STAGE_COLOR = {
  interest:        '#1890ff',
  sample_analysis: '#722ed1',
  quotation:       '#fa8c16',
  sample_approval: '#13c2c2',
  confirmed:       '#52c41a',
  lost:            '#ff4d4f',
  // Legacy stage fallbacks
  qualified:       '#1890ff',
  proposal:        '#722ed1',
  negotiation:     '#fa8c16',
  won:             '#52c41a',
};

const INQUIRY_STAGE_COLOR = {
  new_inquiry: 'blue', sar_pending: 'cyan', qc_in_progress: 'geekblue',
  qc_received: 'geekblue', cse_pending: 'purple', cse_approved: 'purple',
  estimation: 'orange', quoted: 'gold', negotiating: 'gold',
  price_accepted: 'lime', preprod_sample: 'cyan', preprod_sent: 'cyan',
  sample_approved: 'green', pi_sent: 'green', order_confirmed: 'green',
  in_production: 'volcano', ready_dispatch: 'magenta', delivered: 'green',
  closed: 'default', lost: 'red', on_hold: 'default',
};

export default function DealCard({ deal, onMoveStage, stages }) {
  const daysToClose = deal.days_to_close != null ? parseInt(deal.days_to_close) : null;
  const isUrgent = daysToClose !== null && daysToClose <= 7 && !['confirmed', 'lost'].includes(deal.stage);
  const isPast = daysToClose !== null && daysToClose < 0 && !['confirmed', 'lost'].includes(deal.stage);

  return (
    <Card
      size="small"
      style={{
        marginBottom: 8,
        borderLeft: `3px solid ${STAGE_COLOR[deal.stage] || '#d9d9d9'}`,
        borderRadius: 6,
        cursor: 'default',
      }}
      styles={{ body: { padding: '8px 10px' } }}
    >
      <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{deal.title}</Text>

      {deal.customer_name && (
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
          <UserOutlined style={{ marginRight: 4 }} />{deal.customer_name}
        </Text>
      )}

      <Space size={6} wrap>
        {deal.estimated_value != null && (
          <Tag icon={<DollarOutlined />} color="blue" style={{ fontSize: 11, margin: 0 }}>
            {Number(deal.estimated_value).toLocaleString()} {deal.currency || 'AED'}
          </Tag>
        )}
        {daysToClose !== null && (
          <Tooltip title={`Expected close: ${deal.expected_close_date}`}>
            <Tag
              icon={<CalendarOutlined />}
              color={isPast ? 'red' : isUrgent ? 'orange' : 'default'}
              style={{ fontSize: 11, margin: 0 }}
            >
              {isPast ? `${Math.abs(daysToClose)}d overdue` : daysToClose === 0 ? 'Today' : `${daysToClose}d`}
            </Tag>
          </Tooltip>
        )}
        {deal.inquiry_stage && (
          <Tooltip title="Linked inquiry stage">
            <Tag color={INQUIRY_STAGE_COLOR[deal.inquiry_stage] || 'default'} style={{ fontSize: 11, margin: 0 }}>
              {deal.inquiry_stage.replace(/_/g, ' ')}
            </Tag>
          </Tooltip>
        )}
      </Space>

      {/* Stage move buttons */}
      {onMoveStage && stages && (
        <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {stages
            .filter(s => s.value !== deal.stage)
            .map(s => (
              <Tag
                key={s.value}
                color={STAGE_COLOR[s.value]}
                style={{ cursor: 'pointer', fontSize: 10, margin: 0 }}
                onClick={() => onMoveStage(deal, s.value)}
              >
                → {s.label}
              </Tag>
            ))}
        </div>
      )}
    </Card>
  );
}
