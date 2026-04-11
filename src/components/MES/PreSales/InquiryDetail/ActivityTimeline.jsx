/**
 * ActivityTimeline — Activity history timeline for an inquiry.
 */
import React from 'react';
import { Card, Space, Badge, Timeline, Typography } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { STATUS_CONFIG, ACTIVITY_LABELS } from './constants';

const { Text } = Typography;

export default function ActivityTimeline({ history }) {
  return (
    <Card
      size="small"
      style={{ marginTop: 16 }}
      title={
        <Space>
          <HistoryOutlined />
          Activity History
          {history.length > 0 && <Badge count={history.length} style={{ backgroundColor: '#8c8c8c' }} />}
        </Space>
      }
    >
      {history.length > 0 ? (
        <Timeline
          style={{ marginTop: 12 }}
          items={history.map(h => {
            const details = typeof h.details === 'string' ? JSON.parse(h.details) : (h.details || {});
            let desc = ACTIVITY_LABELS[h.action] || h.action;
            if (h.action === 'status_changed') {
              const from = STATUS_CONFIG[details.from]?.label || details.from;
              const to = STATUS_CONFIG[details.to]?.label || details.to;
              desc = `${from} → ${to}`;
            } else if (h.action === 'attachment_uploaded') {
              desc = `Uploaded: ${details.file_name || 'file'}`;
            } else if (h.action === 'sample_registered') {
              desc = `Sample ${details.sample_number} (${details.product_group})`;
            } else if (h.action === 'sample_status_changed') {
              desc = `Sample ${details.sample_number}: ${details.from} → ${details.to}`;
            } else if (h.action === 'qc_result_submitted') {
              desc = `Sample ${details.sample_number}: ${details.result?.toUpperCase()}`;
            } else if (h.action === 'moq_check_added') {
              desc = `${details.product_group}: Qty ${details.customer_qty || '?'} vs MOQ ${details.moq_required || '?'}`;
            } else if (h.action === 'moq_status_changed') {
              desc = `Overall MOQ → ${(details.moq_status || '').toUpperCase()}`;
            } else if (h.action === 'material_check_added') {
              desc = `${details.material_type}: ${details.material_name || ''}`;
            } else if (h.action === 'material_status_changed') {
              desc = `Material → ${(details.material_status || '').replace('_', ' ').toUpperCase()}`;
            } else if (h.action === 'presales_cleared') {
              desc = `Cleared by ${details.cleared_by || 'manager'}`;
            } else if (h.action === 'presales_phase_changed') {
              desc = `Phase → ${details.phase}`;
            } else if (h.action === 'submitted_to_qc') {
              desc = `${details.sample_count} sample(s) submitted: ${(details.samples || []).join(', ')}`;
            } else if (h.action === 'samples_recalled') {
              desc = `${details.sample_count} sample(s) recalled from QC`;
            }
            return {
              color: h.action.includes('reject') || h.action.includes('deleted') || h.action.includes('revoked') ? 'red'
                   : h.action.includes('approv') || h.action.includes('cleared') ? 'green'
                   : h.action.includes('sample') || h.action.includes('qc') ? 'purple'
                   : h.action.includes('moq') || h.action.includes('material') ? 'orange'
                   : 'blue',
              children: (
                <div>
                  <Text strong style={{ fontSize: 12 }}>{ACTIVITY_LABELS[h.action] || h.action}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 11 }}>{desc}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 10 }}>
                    {h.user_name || 'System'} · {dayjs(h.created_at).format('DD MMM YYYY HH:mm')}
                  </Text>
                </div>
              ),
            };
          })}
        />
      ) : (
        <Text type="secondary" style={{ fontSize: 12 }}>No history yet.</Text>
      )}
    </Card>
  );
}
