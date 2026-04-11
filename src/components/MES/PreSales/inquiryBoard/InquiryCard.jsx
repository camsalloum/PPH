import React from 'react';
import { Button, Dropdown, Tag, Typography } from 'antd';
import { MoreOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { COLUMNS, STAGNANT_THRESHOLDS, STAGE_LABELS } from './constants';

dayjs.extend(relativeTime);

const { Text } = Typography;

const DEAL_STAGE_COLORS = {
  qualified: '#1890ff',
  proposal: '#722ed1',
  negotiation: '#fa8c16',
  won: '#52c41a',
  lost: '#f5222d',
};

function InquiryCard({ inq, navigate, inquiryBase, handleStatusChange, handleDelete, showRep }) {
  const nextStatuses = COLUMNS
    .filter((column) => column.key !== inq.status)
    .map((column) => ({ key: column.key, label: `→ ${column.label}` }));

  const menuItems = [
    { key: 'view', label: 'View Details', icon: <EyeOutlined /> },
    { type: 'divider' },
    ...nextStatuses.map((nextStatus) => ({
      key: `status_${nextStatus.key}`,
      label: nextStatus.label,
    })),
    { type: 'divider' },
    { key: 'delete', label: 'Delete', icon: <DeleteOutlined />, danger: true },
  ];

  const onMenuClick = ({ key }) => {
    if (key === 'view') {
      navigate(`${inquiryBase}/${inq.id}`);
      return;
    }
    if (key.startsWith('status_')) {
      handleStatusChange(inq.id, key.replace('status_', ''));
      return;
    }
    if (key === 'delete') {
      handleDelete(inq.id, inq.inquiry_number);
    }
  };

  const stageInfo = inq.inquiry_stage && STAGE_LABELS[inq.inquiry_stage];
  const threshold = STAGNANT_THRESHOLDS[inq.status];
  const daysInStage = threshold ? dayjs().diff(dayjs(inq.updated_at || inq.created_at), 'day') : null;
  const isStagnant = daysInStage !== null && daysInStage >= threshold;

  return (
    <div
      className="psi-card"
      onClick={() => navigate(`${inquiryBase}/${inq.id}`)}
      style={{ padding: '8px 10px', marginBottom: 6 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <Text
          strong
          style={{
            fontSize: 13,
            color: '#262626',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {inq.customer_name || '—'}
          {inq.priority === 'high' && <span style={{ color: '#f5222d', marginLeft: 4 }}>🔥</span>}
        </Text>
        <div className="psi-card-actions" onClick={(event) => event.stopPropagation()} style={{ flexShrink: 0 }}>
          <Dropdown menu={{ items: menuItems, onClick: onMenuClick }} trigger={['click']}>
            <Button type="text" icon={<MoreOutlined />} size="small" style={{ padding: '0 4px' }} />
          </Dropdown>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {stageInfo && (
          <Tag
            style={{
              fontSize: 9,
              padding: '0 5px',
              lineHeight: '16px',
              borderRadius: 8,
              margin: 0,
              color: stageInfo.color,
              background: `${stageInfo.color}11`,
              border: `1px solid ${stageInfo.color}44`,
            }}
          >
            {stageInfo.label}
          </Tag>
        )}
        {inq.deal_stage && (
          <Tag
            style={{
              fontSize: 9,
              padding: '0 5px',
              lineHeight: '16px',
              borderRadius: 8,
              margin: 0,
              color: DEAL_STAGE_COLORS[inq.deal_stage] || '#8c8c8c',
              background: `${DEAL_STAGE_COLORS[inq.deal_stage] || '#8c8c8c'}11`,
              border: `1px solid ${DEAL_STAGE_COLORS[inq.deal_stage] || '#8c8c8c'}44`,
            }}
          >
            💼 {inq.deal_stage.charAt(0).toUpperCase() + inq.deal_stage.slice(1)}
          </Tag>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
        <span style={{ fontSize: 10, color: '#bfbfbf' }}>{dayjs(inq.created_at).fromNow()}</span>
        {showRep && inq.rep_group_display && (
          <span style={{ fontSize: 10, color: '#8c8c8c' }}>· {inq.rep_group_display}</span>
        )}
        {isStagnant && (
          <span style={{ fontSize: 10, color: daysInStage >= threshold * 2 ? '#f5222d' : '#fa8c16' }}>
            ⏰ {daysInStage}d
          </span>
        )}
      </div>
    </div>
  );
}

export default React.memo(InquiryCard);
