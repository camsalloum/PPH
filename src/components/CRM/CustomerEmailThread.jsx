import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Input,
  List,
  Modal,
  Segmented,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { MailOutlined, ReloadOutlined, RollbackOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;
const API = import.meta.env.VITE_API_URL ?? '';

function parseRecipients(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {
      return value
        .split(',')
        .map((v) => ({ email: v.trim() }))
        .filter((v) => v.email);
    }
  }
  return [];
}

function recipientsToText(value) {
  const arr = parseRecipients(value);
  if (!arr.length) return '-';
  return arr
    .map((v) => (v?.name ? `${v.name} <${v.email}>` : v?.email))
    .filter(Boolean)
    .join(', ');
}

const CustomerEmailThread = ({ customerId }) => {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState('all');

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');

  const [replyTarget, setReplyTarget] = useState(null);
  const [replyBody, setReplyBody] = useState('');

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('auth_token')}` });

  const loadEmails = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const response = await axios.get(`${API}/api/crm/emails`, {
        headers: getHeaders(),
        params: { customer_id: customerId, limit: 100 },
      });
      setEmails(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (error) {
      console.error('Failed to load customer emails', error);
      message.error('Failed to load customer emails');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  const filteredEmails = useMemo(() => {
    if (filter === 'inbound') return emails.filter((e) => e.direction === 'inbound');
    if (filter === 'outbound') return emails.filter((e) => e.direction === 'outbound');
    if (filter === 'unread') return emails.filter((e) => e.direction === 'inbound' && !e.is_read);
    return emails;
  }, [emails, filter]);

  const onToggleRead = async (email, isRead) => {
    try {
      await axios.patch(
        `${API}/api/crm/emails/${email.id}`,
        { is_read: isRead },
        { headers: getHeaders() }
      );
      setEmails((prev) => prev.map((e) => (e.id === email.id ? { ...e, is_read: isRead } : e)));
    } catch (error) {
      console.error('Failed to update email status', error);
      message.error('Could not update email status');
    }
  };

  const resetCompose = () => {
    setComposeTo('');
    setComposeCc('');
    setComposeSubject('');
    setComposeBody('');
  };

  const parseCsvEmails = (value) =>
    String(value || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
      .map((email) => ({ email }));

  const onSendCompose = async () => {
    const toRecipients = parseCsvEmails(composeTo);
    if (!toRecipients.length) {
      message.warning('Add at least one recipient email');
      return;
    }
    if (!composeSubject.trim()) {
      message.warning('Subject is required');
      return;
    }

    setSending(true);
    try {
      await axios.post(
        `${API}/api/crm/emails/send`,
        {
          customer_id: customerId,
          to_emails: toRecipients,
          cc_emails: parseCsvEmails(composeCc),
          subject: composeSubject.trim(),
          body_html: composeBody,
        },
        { headers: getHeaders() }
      );
      message.success('Email sent');
      setComposeOpen(false);
      resetCompose();
      loadEmails();
    } catch (error) {
      console.error('Failed to send email', error);
      const apiError = error?.response?.data?.error;
      message.error(apiError || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  const onOpenReply = (email) => {
    setReplyTarget(email);
    setReplyBody('');
  };

  const onSendReply = async () => {
    if (!replyTarget) return;
    setSending(true);
    try {
      await axios.post(
        `${API}/api/crm/emails/${replyTarget.id}/reply`,
        { body_html: replyBody },
        { headers: getHeaders() }
      );
      message.success('Reply sent');
      setReplyTarget(null);
      setReplyBody('');
      loadEmails();
    } catch (error) {
      console.error('Failed to send reply', error);
      const apiError = error?.response?.data?.error;
      message.error(apiError || 'Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  const unreadInbound = emails.filter((e) => e.direction === 'inbound' && !e.is_read).length;

  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <Space wrap>
          <Tag color="blue">Total: {emails.length}</Tag>
          <Tag color={unreadInbound > 0 ? 'red' : 'default'}>Unread: {unreadInbound}</Tag>
          <Segmented
            size="small"
            value={filter}
            onChange={setFilter}
            options={[
              { label: 'All', value: 'all' },
              { label: 'Inbound', value: 'inbound' },
              { label: 'Outbound', value: 'outbound' },
              { label: 'Unread', value: 'unread' },
            ]}
          />
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadEmails} loading={loading}>Refresh</Button>
          <Button type="primary" icon={<MailOutlined />} onClick={() => setComposeOpen(true)}>Compose</Button>
        </Space>
      </Space>

      {!emails.length && !loading ? (
        <Alert type="info" showIcon message="No linked emails yet" description="Emails sent from CRM will appear here for this customer." />
      ) : null}

      <List
        loading={loading}
        size="small"
        dataSource={filteredEmails}
        locale={{ emptyText: <Empty description="No emails in this filter" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        renderItem={(email) => {
          const time = email.received_at || email.sent_at || email.created_at;
          const isInbound = email.direction === 'inbound';
          return (
            <List.Item
              style={{ alignItems: 'flex-start' }}
              actions={[
                isInbound ? (
                  <Button key="reply" type="link" size="small" icon={<RollbackOutlined />} onClick={() => onOpenReply(email)}>
                    Reply
                  </Button>
                ) : null,
                <Button
                  key="toggle-read"
                  type="link"
                  size="small"
                  onClick={() => onToggleRead(email, !email.is_read)}
                >
                  {email.is_read ? 'Mark Unread' : 'Mark Read'}
                </Button>,
              ].filter(Boolean)}
            >
              <List.Item.Meta
                title={
                  <Space size={8} wrap>
                    <Text strong>{email.subject || 'No subject'}</Text>
                    <Tag color={isInbound ? 'purple' : 'green'}>{isInbound ? 'Inbound' : 'Outbound'}</Tag>
                    {!email.is_read && <Tag color="red">Unread</Tag>}
                  </Space>
                }
                description={
                  <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {isInbound ? `From: ${email.from_name || '-'} <${email.from_email || '-'}>` : `To: ${recipientsToText(email.to_emails)}`}
                    </Text>
                    {email.cc_emails ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        CC: {recipientsToText(email.cc_emails)}
                      </Text>
                    ) : null}
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {time ? dayjs(time).format('DD MMM YYYY HH:mm') : 'No timestamp'}
                    </Text>
                    {email.body_preview ? (
                      <Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0, fontSize: 12 }}>
                        {email.body_preview}
                      </Paragraph>
                    ) : null}
                  </Space>
                }
              />
            </List.Item>
          );
        }}
      />

      <Modal
        title="Compose Email"
        open={composeOpen}
        onCancel={() => {
          setComposeOpen(false);
          resetCompose();
        }}
        onOk={onSendCompose}
        okText="Send"
        confirmLoading={sending}
        width={760}
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Input
            placeholder="To (comma separated emails)"
            value={composeTo}
            onChange={(e) => setComposeTo(e.target.value)}
          />
          <Input
            placeholder="CC (optional, comma separated emails)"
            value={composeCc}
            onChange={(e) => setComposeCc(e.target.value)}
          />
          <Input
            placeholder="Subject"
            value={composeSubject}
            onChange={(e) => setComposeSubject(e.target.value)}
          />
          <TextArea
            rows={8}
            placeholder="Write email body (HTML/plain text)"
            value={composeBody}
            onChange={(e) => setComposeBody(e.target.value)}
          />
        </Space>
      </Modal>

      <Modal
        title={replyTarget ? `Reply: ${replyTarget.subject || 'No subject'}` : 'Reply'}
        open={!!replyTarget}
        onCancel={() => {
          setReplyTarget(null);
          setReplyBody('');
        }}
        onOk={onSendReply}
        okText="Send Reply"
        confirmLoading={sending}
        width={680}
      >
        {replyTarget ? (
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Reply to: {replyTarget.from_name || '-'} &lt;{replyTarget.from_email || '-'}&gt;
            </Text>
            <TextArea
              rows={7}
              placeholder="Write your reply"
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
            />
          </Space>
        ) : null}
      </Modal>
    </Space>
  );
};

export default CustomerEmailThread;
