/**
 * ClearanceSection — Pre-Sales clearance card with grant/revoke actions.
 */
import React from 'react';
import {
  Card, Space, Tag, Descriptions, Alert, Button, Popconfirm, Modal, Typography,
} from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function ClearanceSection({ inquiry, samples, isStrictAdmin, message, onReload }) {
  const show = inquiry.presales_phase === 'clearance'
    || inquiry.presales_phase === 'cleared'
    || inquiry.presales_cleared;

  const handleClearance = async (cleared) => {
    try {
      const token = localStorage.getItem('auth_token');
      await axios.patch(`${API_BASE}/api/mes/presales/inquiries/${inquiry.id}/clearance`, { cleared }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      message.success(cleared ? 'Pre-Sales cleared! Inquiry moved to Converted.' : 'Clearance revoked.');
      onReload();
    } catch { message.error('Failed to update clearance'); }
  };

  if (!show) return null;

  return (
    <Card
      size="small"
      style={{
        marginTop: 16,
        border: inquiry.presales_cleared ? '2px solid #52c41a' : '2px solid #fa8c16',
        background: inquiry.presales_cleared ? '#f6ffed' : '#fffbe6',
      }}
      title={
        <Space>
          <SafetyCertificateOutlined style={{ color: inquiry.presales_cleared ? '#52c41a' : '#fa8c16' }} />
          <Text strong>Pre-Sales Clearance</Text>
          {inquiry.presales_cleared && <Tag color="success">CLEARED</Tag>}
        </Space>
      }
    >
      {inquiry.presales_cleared ? (
        <Descriptions column={1} size="small">
          <Descriptions.Item label="Cleared By">
            <Text strong>{inquiry.clearance_by_name || 'System'}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Cleared At">
            {dayjs(inquiry.clearance_at).format('DD MMM YYYY HH:mm')}
          </Descriptions.Item>
          <Descriptions.Item label="Status">
            <Tag color="success" style={{ fontSize: 12 }}>Ready for Quotation</Tag>
          </Descriptions.Item>
          {isStrictAdmin && (
            <Descriptions.Item label="">
              <Popconfirm title="Revoke clearance? This will revert the inquiry." onConfirm={() => handleClearance(false)} okButtonProps={{ danger: true }}>
                <Button size="small" danger>Revoke Clearance</Button>
              </Popconfirm>
            </Descriptions.Item>
          )}
        </Descriptions>
      ) : (
        <div>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="Pre-Sales Review Complete"
            description={
              <Space direction="vertical" size={4}>
                <Text>QC Review: {samples.filter(s => ['approved', 'tested'].includes(s.status)).length}/{samples.length} samples passed</Text>
              </Space>
            }
          />
          {isStrictAdmin && (
            <Button
              type="primary"
              size="large"
              block
              icon={<SafetyCertificateOutlined />}
              onClick={() => {
                Modal.confirm({
                  title: 'Grant Pre-Sales Clearance?',
                  icon: <SafetyCertificateOutlined style={{ color: '#52c41a' }} />,
                  content: 'This will mark the inquiry as cleared and move it to Converted status, ready for quotation.',
                  okText: 'Clear & Convert',
                  onOk: () => handleClearance(true),
                });
              }}
            >
              Grant Pre-Sales Clearance
            </Button>
          )}
          {!isStrictAdmin && (
            <Alert type="warning" message="Awaiting manager sign-off for clearance." showIcon />
          )}
        </div>
      )}
    </Card>
  );
}
