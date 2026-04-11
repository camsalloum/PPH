import React from 'react';
import { Badge, Button, Card, Empty, List, Space, Tag, Typography } from 'antd';
import {
  BellOutlined,
  MailOutlined,
  FileTextOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  UserAddOutlined,
  EditOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

const typeConfig = (type) => {
  const t = (type || '').toLowerCase();
  if (t.includes('email') || t.includes('reply'))                                              return { color: 'blue',    label: 'Email',    icon: <MailOutlined /> };
  if (t.includes('assigned'))                                                                  return { color: 'purple',  label: 'New',      icon: <UserAddOutlined /> };
  if (t.includes('approved'))                                                                  return { color: 'green',   label: 'Approved', icon: <CheckCircleOutlined /> };
  if (t.includes('lab_result') || t.includes('sla') || t.includes('breach'))                  return { color: 'orange',  label: 'Pending',  icon: <AlertOutlined /> };
  if (t.includes('alert') || t.includes('stall') || t.includes('overdue'))                    return { color: 'red',     label: 'Urgent',   icon: <AlertOutlined /> };
  if (t.includes('closed'))                                                                    return { color: 'orange',  label: 'Closed',   icon: <FileTextOutlined /> };
  if (t.includes('note') || t.includes('comment'))                                             return { color: 'cyan',    label: 'Note',     icon: <EditOutlined /> };
  return { color: 'default', label: 'Info', icon: <BellOutlined /> };
};

const MyDayNotifications = ({ items = [], onOpen, onSeeAll }) => {
  return (
    <Card
      title={<Space><BellOutlined style={{ color: '#1677ff' }} /><span>Activity Feed</span></Space>}
      extra={<Button type="link" size="small" onClick={onSeeAll}>See all</Button>}
      styles={{ body: { padding: 0 } }}
      className="crm-info-card"
    >
      {items.length === 0 ? (
        <Empty description="No recent activity" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 24 }} />
      ) : (
        <List
          size="small"
          dataSource={items}
          renderItem={(n) => {
            const cfg = typeConfig(n.type);
            return (
              <List.Item
                style={{ padding: '10px 16px', cursor: 'pointer' }}
                onClick={() => onOpen?.(n)}
              >
                <List.Item.Meta
                  avatar={
                    <span style={{ fontSize: 18, color: cfg.color === 'default' ? '#999' : undefined }}>
                      {cfg.icon}
                    </span>
                  }
                  title={
                    <Space size={6} wrap>
                      {!n.is_read ? <Badge dot color="blue" /> : null}
                      <Tag color={cfg.color} style={{ margin: 0 }}>{cfg.label}</Tag>
                      <Text strong style={{ fontSize: 13 }}>{n.title}</Text>
                    </Space>
                  }
                  description={
                    <Text type="secondary" style={{ fontSize: 12 }}>{n.message || ''}</Text>
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

export default MyDayNotifications;
