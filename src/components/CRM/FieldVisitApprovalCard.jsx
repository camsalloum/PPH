import React, { useState } from 'react';
import { App, Button, Card, Input, Space, Tag, Typography } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, EditOutlined, StopOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { API_BASE, getAuthHeaders } from './fieldVisitUtils';

const { Text, Paragraph } = Typography;

const FieldVisitApprovalCard = ({ trip, onDecision }) => {
  const { message } = App.useApp();
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(false);

  const repDisplayName = trip?.rep_name || trip?.rep_full_name || trip?.rep_email || '—';
  const departureText = trip?.departure_date ? dayjs(trip.departure_date).format('DD MMM YYYY') : '—';
  const returnText = trip?.return_date ? dayjs(trip.return_date).format('DD MMM YYYY') : 'TBD';

  const handleDecision = async (decision) => {
    setLoading(true);
    try {
      await axios.patch(
        `${API_BASE}/api/crm/field-trips/${trip.id}/review-approval`,
        { decision, comments },
        { headers: getAuthHeaders() }
      );
      message.success(
        decision === 'approved' ? 'Trip approved' :
        decision === 'rejected' ? 'Trip rejected' :
        'Changes requested'
      );
      if (onDecision) onDecision(decision);
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to submit decision');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      size="small"
      title={
        <Space>
          <ClockCircleOutlined style={{ color: '#fa8c16' }} />
          <Text strong>Approval Required</Text>
          <Tag color="orange">Pending Approval</Tag>
        </Space>
      }
      style={{ borderLeft: '4px solid #fa8c16', marginBottom: 16 }}
    >
      <Paragraph style={{ marginBottom: 8 }}>
        <Text type="secondary">Rep: </Text><Text strong>{repDisplayName}</Text>
        {'  ·  '}
        <Text type="secondary">Trip: </Text><Text strong>{trip.title}</Text>
        {'  ·  '}
        <Text type="secondary">{departureText} → {returnText}</Text>
      </Paragraph>

      <Input.TextArea
        rows={2}
        placeholder="Manager comments (optional)"
        value={comments}
        onChange={e => setComments(e.target.value)}
        style={{ marginBottom: 10 }}
      />

      <Space>
        <Button type="primary" icon={<CheckCircleOutlined />} loading={loading} onClick={() => handleDecision('approved')}>Approve</Button>
        <Button danger icon={<StopOutlined />} loading={loading} onClick={() => handleDecision('rejected')}>Reject</Button>
        <Button icon={<EditOutlined />} loading={loading} onClick={() => handleDecision('changes_requested')}>Request Changes</Button>
      </Space>
    </Card>
  );
};

export default FieldVisitApprovalCard;
