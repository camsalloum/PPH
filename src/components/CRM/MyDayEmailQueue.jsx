import React from 'react';
import { Button, Card, Empty, List, Space, Tag, Typography, Alert } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text } = Typography;

const MyDayEmailQueue = ({ summary = {}, items = [], onCompose, onSend, onMarkSent, onEdit, onSkip, onConnectOutlook }) => {
  const dueCount = Number(summary.draftsDueToday || 0);
  const outlookConnected = !!summary.outlookConnected;
  const topUnread = Array.isArray(summary.topUnread) ? summary.topUnread : [];

  return (
    <Card
      title={<Space><MailOutlined style={{ color: '#1677ff' }} /><span>Emails to Send Today</span></Space>}
      extra={
        <Space>
          {!outlookConnected && (
            <Button size="small" onClick={onConnectOutlook}>Connect Outlook</Button>
          )}
          <Button type="primary" size="small" onClick={onCompose}>Compose</Button>
        </Space>
      }
      styles={{ body: { padding: 0 } }}
      className="crm-info-card"
    >
      {!outlookConnected && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <Alert
            type="warning"
            showIcon
            message="Outlook is not connected. Send actions will be limited until connected."
          />
        </div>
      )}

      <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0' }}>
        <Space size={10} wrap>
          <Tag color="blue">Due Today: {dueCount}</Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Unread: {Number(summary.unreadFromCustomers || 0)}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Awaiting Reply: {Number(summary.awaitingReply || 0)}
          </Text>
        </Space>
      </div>

      {topUnread.length > 0 ? (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
            Top unread
          </Text>
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            {topUnread.map((mail) => (
              <Text key={mail.id} style={{ fontSize: 12 }} ellipsis>
                {mail.subject || `Email #${mail.id}`} · {mail.age_hours || 0}h
              </Text>
            ))}
          </Space>
        </div>
      ) : null}

      {items.length === 0 ? (
        <Empty description="No email drafts due today" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 24 }} />
      ) : (
        <List
          size="small"
          dataSource={items}
          renderItem={(d) => (
            <List.Item
              style={{ padding: '10px 16px' }}
              actions={[
                <Button key="send" type="link" size="small" onClick={() => onSend?.(d)}>Send via Outlook</Button>,
                <Button key="sent" type="link" size="small" onClick={() => onMarkSent?.(d)}>Mark Sent</Button>,
                <Button key="edit" type="link" size="small" onClick={() => onEdit?.(d)}>Edit</Button>,
                <Button key="skip" type="link" size="small" danger onClick={() => onSkip?.(d)}>Skip Today</Button>,
              ]}
            >
              <List.Item.Meta
                title={<Text strong>{d.subject || 'Untitled draft'}</Text>}
                description={
                  <Space size={10} wrap>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Due: {d.due_by ? dayjs(d.due_by).format('ddd, MMM D') : 'No due date'}
                    </Text>
                    {d.inquiry_id ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>Inquiry #{d.inquiry_id}</Text>
                    ) : null}
                    <Tag>{(d.send_via || 'outlook').toUpperCase()}</Tag>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  );
};

export default MyDayEmailQueue;
