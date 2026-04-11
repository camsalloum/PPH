import React from 'react';
import { Button, Card, Empty, List, Space, Tag, Typography } from 'antd';
import { ArrowRightOutlined, ClockCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';

const { Text } = Typography;

const TYPE_STYLE = {
  cold_deal: { color: 'magenta', label: 'Cold Deal' },
  unanswered_proposal: { color: 'orange', label: 'Unanswered Proposal' },
  reorder_window: { color: 'blue', label: 'Reorder Window' },
  new_uncontacted_inquiry: { color: 'gold', label: 'New Inquiry' },
  overdue_task: { color: 'red', label: 'Overdue Task' },
  unread_email: { color: 'cyan', label: 'Unread Email' },
  awaiting_reply: { color: 'purple', label: 'Awaiting Reply' },
};

const MyDayPriorityActions = ({ items = [], onAction, onSnooze }) => {
  return (
    <Card
      title={<Space><ThunderboltOutlined style={{ color: '#d4380d' }} /><span>Priority Actions</span></Space>}
      styles={{ body: { padding: 0 } }}
      className="crm-info-card"
    >
      {items.length === 0 ? (
        <Empty description="No urgent priorities right now" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 24 }} />
      ) : (
        <List
          size="small"
          dataSource={items}
          renderItem={(item) => {
            const style = TYPE_STYLE[item.type] || { color: 'default', label: item.type || 'Action' };
            return (
              <List.Item
                style={{ padding: '10px 16px' }}
                actions={[
                  <Button key="action" type="link" size="small" onClick={() => onAction?.(item)}>
                    {item.action_label || 'Open'} <ArrowRightOutlined />
                  </Button>,
                  <Button key="snooze" type="link" size="small" onClick={() => onSnooze?.(item)}>
                    Snooze 24h
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space size={6} wrap>
                      <Tag color={style.color}>{style.label}</Tag>
                      <Text strong>{item.title}</Text>
                    </Space>
                  }
                  description={
                    <Space size={10} wrap>
                      <Text type="secondary" style={{ fontSize: 12 }}>{item.description}</Text>
                      {Number.isFinite(Number(item.age_days)) ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          <ClockCircleOutlined style={{ marginRight: 4 }} />
                          {item.age_days}d
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

export default MyDayPriorityActions;
