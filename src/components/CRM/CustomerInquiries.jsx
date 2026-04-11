/**
 * CustomerInquiries — shows PreSales inquiries linked to a customer
 * Enhanced: status badges, days-in-stage, action-needed indicators, "New Inquiry" button
 * Props:
 *   customerId — fp_customer_unified.customer_id
 *   customerName — optional, for pre-filling new inquiry
 */
import React, { useState, useEffect, useCallback } from 'react';
import { List, Tag, Typography, Spin, Empty, Space, Button, Badge, Tooltip } from 'antd';
import {
  FileSearchOutlined, CalendarOutlined, ArrowRightOutlined,
  PlusOutlined, ExclamationCircleOutlined, ClockCircleOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const { Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const STAGE_COLORS = {
  new_inquiry: 'blue', sar_pending: 'blue', sar_approved: 'cyan',
  sample_prep: 'purple', qc_testing: 'orange', cse_review: 'gold',
  cse_approved: 'green', estimation: 'geekblue', quoted: 'volcano',
  pi_sent: 'magenta', po_confirmed: 'lime', in_production: 'processing',
  ready_dispatch: 'success', delivered: 'success', closed: 'default',
  lost: 'error', cancelled: 'default', sample_dispatched: 'purple',
  sample_approved: 'green', price_accepted: 'lime', on_hold: 'warning',
  order_confirmed: 'lime', negotiating: 'volcano',
};

/** Pipeline phases for the compact stepper */
const PIPELINE_PHASES = [
  { key: 'opportunity', label: 'Opportunity', stages: ['new_inquiry', 'sar_pending', 'sar_approved'] },
  { key: 'technical', label: 'Technical', stages: ['sample_prep', 'sample_dispatched', 'qc_testing', 'cse_review', 'cse_approved'] },
  { key: 'estimation', label: 'Estimation', stages: ['estimation', 'quoted', 'negotiating'] },
  { key: 'order', label: 'Order', stages: ['price_accepted', 'sample_approved', 'order_confirmed'] },
  { key: 'production', label: 'Production', stages: ['in_production', 'ready_dispatch'] },
  { key: 'delivery', label: 'Delivery', stages: ['delivered', 'closed'] },
];

function getPhaseIndex(stage) {
  return PIPELINE_PHASES.findIndex(p => p.stages.includes(stage));
}

/** Statuses where the sales rep needs to take action */
const ACTION_NEEDED_STATUSES = ['quoted', 'sample_approved', 'price_accepted'];

const ACTION_LABELS = {
  quoted: 'Follow up on quote',
  sample_approved: 'Confirm sample with customer',
  price_accepted: 'Proceed to PO',
};

/** Compute days since stage changed */
const daysInStage = (stageChangedAt) => {
  if (!stageChangedAt) return null;
  return dayjs().diff(dayjs(stageChangedAt), 'day');
};

export default function CustomerInquiries({ customerId, customerName, autoOpenNew }) {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.get(`${API_BASE}/api/mes/presales/inquiries`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { customer_id: customerId, limit: 50 },
      });
      const data = res.data?.data;
      setInquiries(Array.isArray(data) ? data : (data?.inquiries || []));
    } catch {
      setInquiries([]);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  // Auto-open new inquiry when navigated from prospect conversion bridge
  useEffect(() => {
    if (autoOpenNew && !loading && customerId) {
      handleNewInquiry();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenNew, loading, customerId]);

  const handleNewInquiry = () => {
    navigate('/crm/inquiries/new', {
      state: { prefilledCustomerId: customerId, prefilledCustomerName: customerName }
    });
  };

  const actionNeededCount = inquiries.filter(
    inq => ACTION_NEEDED_STATUSES.includes(inq.inquiry_stage)
  ).length;

  if (loading) return <Spin size="small" style={{ display: 'block', padding: 24 }} />;

  return (
    <div>
      {/* Header with New Inquiry button and action-needed badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Space>
          <Text strong style={{ fontSize: 14 }}>Inquiries</Text>
          {actionNeededCount > 0 && (
            <Badge count={actionNeededCount} style={{ backgroundColor: '#ff4d4f' }} title={`${actionNeededCount} need your action`} />
          )}
        </Space>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={handleNewInquiry}
          style={{ background: '#4f46e5', borderColor: '#4f46e5' }}
        >
          New Inquiry
        </Button>
      </div>

      {inquiries.length === 0 ? (
        <Empty
          description="No inquiries for this customer"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleNewInquiry}
            style={{ background: '#4f46e5', borderColor: '#4f46e5' }}>
            Create First Inquiry
          </Button>
        </Empty>
      ) : (
        <List
          size="small"
          dataSource={inquiries}
          renderItem={(inq) => {
            const stage = inq.inquiry_stage || '';
            const isActionNeeded = ACTION_NEEDED_STATUSES.includes(stage);
            const days = daysInStage(inq.stage_changed_at);

            return (
              <List.Item
                style={isActionNeeded ? { background: '#fff7e6', borderLeft: '3px solid #fa8c16', paddingLeft: 8 } : {}}
                actions={[
                  <Button
                    type="link"
                    size="small"
                    icon={<ArrowRightOutlined />}
                    onClick={() => navigate(`/crm/inquiries/${inq.id}`)}
                  >
                    View
                  </Button>
                ]}
              >
                <List.Item.Meta
                  avatar={<FileSearchOutlined style={{ fontSize: 18, color: isActionNeeded ? '#fa8c16' : '#4f46e5' }} />}
                  title={
                    <Space size={6} wrap>
                      <Text strong>{inq.inquiry_number}</Text>
                      <Tag color={STAGE_COLORS[stage] || 'default'}>
                        {(stage).replace(/_/g, ' ')}
                      </Tag>
                      {days !== null && (
                        <Tooltip title={`In this stage for ${days} day${days !== 1 ? 's' : ''}`}>
                          <Tag icon={<ClockCircleOutlined />} color={days > 14 ? 'red' : days > 7 ? 'orange' : 'default'}>
                            {days}d
                          </Tag>
                        </Tooltip>
                      )}
                      {isActionNeeded && (
                        <Tooltip title={ACTION_LABELS[stage]}>
                          <Tag icon={<ExclamationCircleOutlined />} color="warning">
                            Action needed
                          </Tag>
                        </Tooltip>
                      )}
                    </Space>
                  }
                  description={
                    <div>
                      {/* Compact phase stepper */}
                      <div style={{ display: 'flex', gap: 2, marginBottom: 4 }}>
                        {PIPELINE_PHASES.map((phase, idx) => {
                          const currentIdx = getPhaseIndex(stage);
                          const isComplete = currentIdx > idx;
                          const isCurrent = currentIdx === idx;
                          return (
                            <Tooltip key={phase.key} title={phase.label}>
                              <div style={{
                                flex: 1, height: 4, borderRadius: 2,
                                background: isComplete ? '#52c41a' : isCurrent ? '#1890ff' : '#e8e8e8',
                              }} />
                            </Tooltip>
                          );
                        })}
                      </div>
                      <Space size={16}>
                        {inq.product_groups && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {Array.isArray(inq.product_groups)
                            ? inq.product_groups.join(', ')
                            : typeof inq.product_groups === 'string'
                              ? inq.product_groups
                              : ''}
                        </Text>
                      )}
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        <CalendarOutlined style={{ marginRight: 4 }} />
                        {inq.inquiry_date ? dayjs(inq.inquiry_date).fromNow() : inq.created_at ? dayjs(inq.created_at).fromNow() : ''}
                      </Text>
                    </Space>
                    </div>
                  }
                />
              </List.Item>
            );
          }}
        />
      )}
    </div>
  );
}
