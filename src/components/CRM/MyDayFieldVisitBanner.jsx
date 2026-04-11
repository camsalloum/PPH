import React from 'react';
import { Button, Card, Space, Tag, Typography } from 'antd';
import { EnvironmentOutlined, ArrowRightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text } = Typography;

const COUNTRY_TO_ISO2 = {
  'United Arab Emirates': 'AE',
  UAE: 'AE',
  'Saudi Arabia': 'SA',
  Qatar: 'QA',
  Kuwait: 'KW',
  Bahrain: 'BH',
  Oman: 'OM',
  Egypt: 'EG',
  Jordan: 'JO',
  Lebanon: 'LB',
  Iraq: 'IQ',
  Turkey: 'TR',
  Pakistan: 'PK',
  India: 'IN',
};

const toFlagEmoji = (country) => {
  if (!country) return '🌍';
  const iso = COUNTRY_TO_ISO2[country] || null;
  if (!iso || iso.length !== 2) return '🌍';
  return String.fromCodePoint(...iso.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0)));
};

const MyDayFieldVisitBanner = ({ trip, onOpenRoute, onOpenTrip, onGoInTrip }) => {
  if (!trip) return null;

  const today = dayjs().startOf('day');
  const startDate = trip.departure_date ? dayjs(trip.departure_date).startOf('day') : null;
  const endDate = trip.return_date ? dayjs(trip.return_date).startOf('day') : startDate;
  const start = startDate ? startDate.format('DD MMM') : '-';
  const end = endDate ? endDate.format('DD MMM') : '-';
  const badge = trip.status === 'in_progress' ? 'Active Field Visit' : 'Upcoming Field Visit';
  const settlementStatus = String(trip.settlement_status || '').toLowerCase();
  const exceptionBadge = settlementStatus === 'rejected'
    ? { label: 'Settlement Rejected', color: 'red' }
    : settlementStatus === 'revision_requested'
      ? { label: 'Settlement Revision Requested', color: 'orange' }
      : null;
  const badgeLabel = exceptionBadge?.label || badge;
  const badgeColor = exceptionBadge?.color || (trip.status === 'in_progress' ? 'gold' : 'blue');
  const daysToStart = startDate ? startDate.diff(today, 'day') : null;
  const daysToEnd = endDate ? endDate.diff(today, 'day') : null;
  const timingText = trip.status === 'in_progress'
    ? (daysToEnd !== null && daysToEnd >= 0 ? `${daysToEnd + 1} day(s) left` : 'In progress')
    : (daysToStart !== null
      ? (daysToStart > 0 ? `Starts in ${daysToStart} day(s)` : (daysToStart === 0 ? 'Starts today' : 'Started'))
      : 'Schedule pending');
  const flag = toFlagEmoji(trip.country);

  return (
    <Card style={{ borderLeft: '4px solid #d97706', background: '#fff7ed' }} styles={{ body: { padding: 12 } }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start" wrap>
        <Space direction="vertical" size={2}>
          <Space>
            <EnvironmentOutlined style={{ color: '#d97706' }} />
            <Text strong>{trip.title}</Text>
            <Tag color={badgeColor}>{badgeLabel}</Tag>
            <Tag>{timingText}</Tag>
          </Space>
          <Text type="secondary">{flag} {trip.country || 'No country'} | {start} - {end}</Text>
          <Text type="secondary">Stops: {trip.stop_count || 0}</Text>
        </Space>

        <Space>
          <Button size="small" onClick={onOpenTrip}>Open</Button>
          {trip.status === 'in_progress' && (
            <Button type="primary" size="small" icon={<EnvironmentOutlined />} onClick={onGoInTrip}>
              Continue In-Trip
            </Button>
          )}
          <Button type={trip.status !== 'in_progress' ? 'primary' : 'default'} size="small" icon={<ArrowRightOutlined />} onClick={onOpenRoute}>
            View Route
          </Button>
        </Space>
      </Space>
    </Card>
  );
};

export default MyDayFieldVisitBanner;
