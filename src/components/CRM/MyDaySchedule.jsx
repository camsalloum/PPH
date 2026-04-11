import React from 'react';
import { Button, Card, Empty, List, Space, Tag, Typography } from 'antd';
import { CalendarOutlined, CheckSquareOutlined, ClockCircleOutlined, EnvironmentOutlined, PhoneOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text } = Typography;

const TYPE_META = {
  task: { icon: <CheckSquareOutlined />, color: '#fa8c16', label: 'Task' },
  meeting: { icon: <CalendarOutlined />, color: '#1677ff', label: 'Meeting' },
  call: { icon: <PhoneOutlined />, color: '#52c41a', label: 'Call' },
  visit: { icon: <EnvironmentOutlined />, color: '#722ed1', label: 'Visit' },
};

const formatTime = (value) => {
  if (!value) return 'No time';
  return dayjs(value).format('HH:mm');
};

const MyDaySchedule = ({ items = [], onAction }) => {
  const sorted = [...items].sort((a, b) => {
    if (a?.is_overdue && !b?.is_overdue) return -1;
    if (!a?.is_overdue && b?.is_overdue) return 1;

    const aTime = a?.item_time ? dayjs(a.item_time).valueOf() : Number.POSITIVE_INFINITY;
    const bTime = b?.item_time ? dayjs(b.item_time).valueOf() : Number.POSITIVE_INFINITY;
    return aTime - bTime;
  });

  const now = dayjs();
  const nowIdx = sorted.findIndex((i) => i?.item_time && dayjs(i.item_time).isAfter(now));

  const timelineRows = [...sorted];
  const dividerIndex = nowIdx >= 0 ? nowIdx : timelineRows.length;
  timelineRows.splice(dividerIndex, 0, { __isNowDivider: true, key: 'now-divider' });

  return (
    <Card
      title={<Space><ClockCircleOutlined style={{ color: '#d97706' }} /><span>Today Schedule</span></Space>}
      styles={{ body: { padding: 0 } }}
      className="crm-info-card"
    >
      {items.length === 0 ? (
        <Empty description="No planned items for today" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 24 }} />
      ) : (
        <List
          size="small"
          dataSource={timelineRows}
          renderItem={(item) => {
            if (item.__isNowDivider) {
              return (
                <List.Item style={{ padding: 0 }}>
                  <div className="now-divider">NOW {dayjs().format('HH:mm')}</div>
                </List.Item>
              );
            }

            const meta = TYPE_META[item.item_type] || { icon: <ClockCircleOutlined />, color: '#8c8c8c', label: item.item_type || 'Item' };
            return (
              <List.Item
                className="myday-schedule-item"
                style={{ padding: '10px 16px' }}
                actions={[
                  <Button key="log" size="small" type="link" onClick={() => onAction?.(item, 'log')}>Log</Button>,
                  <Button key="held" size="small" type="link" onClick={() => onAction?.(item, 'held')}>Held ✓</Button>,
                  <Button key="done" size="small" type="link" onClick={() => onAction?.(item, 'done')}>Done ✓</Button>,
                  <Button key="reschedule" size="small" type="link" onClick={() => onAction?.(item, 'reschedule')}>Reschedule</Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space size={8}>
                      <Text style={{ minWidth: 54, fontFamily: 'monospace', color: '#595959' }}>{formatTime(item.item_time)}</Text>
                      <Tag color={meta.color}>{meta.label}</Tag>
                      {item.is_overdue && <Tag color="error">Overdue</Tag>}
                      <Text strong>{item.item_title}</Text>
                    </Space>
                  }
                  description={
                    <Space size={10}>
                      <span style={{ color: meta.color }}>{meta.icon}</span>
                      {(item.customer_name || item.prospect_name) && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {item.customer_name || item.prospect_name}
                        </Text>
                      )}
                      {item.duration_mins ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {item.duration_mins} min
                        </Text>
                      ) : null}
                    </Space>
                  }
                />
              </List.Item>
            );
          }}
        />
      )}
    </Card>
  );
};

export default MyDaySchedule;
