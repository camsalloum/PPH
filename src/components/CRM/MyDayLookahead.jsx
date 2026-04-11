import React from 'react';
import { Card, Empty, List, Tag, Typography } from 'antd';
import { CalendarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text } = Typography;

const TYPE_COLORS = {
  meeting: 'blue',
  deal: 'green',
  task: 'orange',
};

const getDayColor = (date) => {
  if (!date) return '#1c1917';
  const diff = date.startOf('day').diff(dayjs().startOf('day'), 'day');
  if (diff === 0) return '#d97706';
  if (diff === 1) return '#2563eb';
  return '#1c1917';
};

const MyDayLookahead = ({ items = [], onOpen }) => {
  return (
    <Card
      title={<span><CalendarOutlined style={{ color: '#722ed1', marginRight: 6 }} />Coming Up</span>}
      styles={{ body: { padding: 0 } }}
      className="crm-info-card"
    >
      {items.length === 0 ? (
        <Empty description="Nothing scheduled in the next 3 days" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 24 }} />
      ) : (
        <List
          size="small"
          dataSource={items}
          renderItem={(it) => {
            const date = it.event_date ? dayjs(it.event_date) : null;
            const type = it.item_type || 'task';
            const tagColor = TYPE_COLORS[type] || 'default';
            return (
              <List.Item
                className="myday-lookahead-item"
                style={{ padding: '9px 16px', cursor: 'pointer' }}
                onClick={() => onOpen?.(it)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minWidth: 0 }}>
                  <div className="myday-cal-tile">
                    <div className="myday-cal-day" style={{ color: getDayColor(date) }}>
                      {date ? date.format('D') : '—'}
                    </div>
                    <div className="myday-cal-mon">{date ? date.format('MMM') : ''}</div>
                  </div>
                  <div className="myday-cal-body">
                    <Text strong style={{ fontSize: 12.5, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.title}
                    </Text>
                    {it.subtitle && (
                      <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{it.subtitle}</Text>
                    )}
                  </div>
                  <Tag color={tagColor} style={{ flexShrink: 0, fontSize: 10, marginLeft: 4 }}>
                    {type.toUpperCase()}
                  </Tag>
                </div>
              </List.Item>
            );
          }}
        />
      )}
    </Card>
  );
};

export default MyDayLookahead;
