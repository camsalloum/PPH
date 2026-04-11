/**
 * InquiryInfoCard — Displays inquiry metadata + sample evaluation notes.
 */
import React from 'react';
import { Card, Descriptions, Tag, Space, Divider, Typography } from 'antd';
import {
  GlobalOutlined, TeamOutlined, ExperimentOutlined,
  PhoneOutlined, MailOutlined, WhatsAppOutlined, DollarOutlined, CalendarOutlined,
  ContactsOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { SOURCE_LABELS, CTYPE_LABELS } from './constants';

const { Text, Paragraph } = Typography;

export default function InquiryInfoCard({ inquiry }) {
  const pg = Array.isArray(inquiry.product_groups) ? inquiry.product_groups : [];

  return (
    <>
      <Card className="psi-detail-card" title="Inquiry Information">
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="Source">
            {SOURCE_LABELS[inquiry.source] || inquiry.source}
            {inquiry.source_detail && <Text type="secondary"> — {inquiry.source_detail}</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="Priority">
            <Tag color={inquiry.priority === 'high' ? 'volcano' : inquiry.priority === 'low' ? 'default' : 'blue'}>
              {inquiry.priority?.toUpperCase()}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Customer Type">{CTYPE_LABELS[inquiry.customer_type]}</Descriptions.Item>
          <Descriptions.Item label="Inquiry Date">
            {inquiry.inquiry_date ? dayjs(inquiry.inquiry_date).format('DD MMM YYYY') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Follow-up">
            {inquiry.follow_up_date ? dayjs(inquiry.follow_up_date).format('DD MMM YYYY') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Sales Rep">
            <TeamOutlined /> {inquiry.rep_group_display || inquiry.sales_rep_group_name || '-'}
          </Descriptions.Item>
        </Descriptions>

        <Divider style={{ margin: '12px 0' }} />

        <Descriptions column={1} size="small">
          <Descriptions.Item label="Customer">
            <Text strong>{inquiry.customer_name}</Text>
            {inquiry.customer_country && <Tag style={{ marginLeft: 8 }}><GlobalOutlined /> {inquiry.customer_country}</Tag>}
          </Descriptions.Item>
          {pg.length > 0 && (
            <Descriptions.Item label="Product Groups">
              <Space wrap>{pg.map(g => <Tag key={g} color="geekblue">{g}</Tag>)}</Space>
            </Descriptions.Item>
          )}
          {inquiry.estimated_quantity && (
            <Descriptions.Item label="Est. Quantity">
              {Number(inquiry.estimated_quantity).toLocaleString()} {inquiry.quantity_unit}
            </Descriptions.Item>
          )}
          {inquiry.notes && (
            <Descriptions.Item label="Notes">
              <Paragraph style={{ margin: 0 }}>{inquiry.notes}</Paragraph>
            </Descriptions.Item>
          )}
          {inquiry.lost_reason && (
            <Descriptions.Item label="Lost Reason">
              <Text type="danger">{inquiry.lost_reason}</Text>
            </Descriptions.Item>
          )}
        </Descriptions>

        {/* Contact & Deal Info */}
        {(inquiry.contact_name || inquiry.contact_phone || inquiry.contact_email || inquiry.contact_whatsapp || inquiry.estimated_value || inquiry.expected_close_date) && (
          <>
            <Divider style={{ margin: '12px 0' }} />
            <Descriptions column={{ xs: 1, sm: 2 }} size="small" title={<Text type="secondary" style={{ fontSize: 12 }}><ContactsOutlined /> Contact & Deal</Text>}>
              {inquiry.contact_name && (
                <Descriptions.Item label="Contact">{inquiry.contact_name}</Descriptions.Item>
              )}
              {inquiry.contact_phone && (
                <Descriptions.Item label="Phone"><PhoneOutlined /> {inquiry.contact_phone}</Descriptions.Item>
              )}
              {inquiry.contact_email && (
                <Descriptions.Item label="Email"><MailOutlined /> {inquiry.contact_email}</Descriptions.Item>
              )}
              {inquiry.contact_whatsapp && (
                <Descriptions.Item label="WhatsApp"><WhatsAppOutlined style={{ color: '#25d366' }} /> {inquiry.contact_whatsapp}</Descriptions.Item>
              )}
              {inquiry.estimated_value && (
                <Descriptions.Item label="Deal Value">
                  <Text strong style={{ color: '#389e0d' }}>
                    <DollarOutlined /> {Number(inquiry.estimated_value).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </Text>
                </Descriptions.Item>
              )}
              {inquiry.expected_close_date && (
                <Descriptions.Item label="Expected Close">
                  <CalendarOutlined /> {dayjs(inquiry.expected_close_date).format('DD MMM YYYY')}
                </Descriptions.Item>
              )}
            </Descriptions>
          </>
        )}
      </Card>

      {/* Sample evaluation info */}
      {inquiry.sample_required && (
        <Card
          size="small"
          style={{ marginTop: 16 }}
          title={<Space><ExperimentOutlined />Sample Evaluation Required</Space>}
        >
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Sample Type">
              <Tag color="purple">
                {inquiry.sample_type === 'physical' ? 'Physical Sample'
                  : inquiry.sample_type === 'digital' ? 'Digital Sample'
                  : inquiry.sample_type === 'both' ? 'Physical + Digital'
                  : '-'}
              </Tag>
            </Descriptions.Item>
            {inquiry.sample_notes && (
              <Descriptions.Item label="Notes">
                <Paragraph style={{ margin: 0 }}>{inquiry.sample_notes}</Paragraph>
              </Descriptions.Item>
            )}
          </Descriptions>
        </Card>
      )}
    </>
  );
}
