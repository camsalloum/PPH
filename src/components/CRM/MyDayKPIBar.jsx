import React from 'react';
import { Card, Col, Row, Typography } from 'antd';

const { Text } = Typography;

const KPI_CONFIG = [
  { key: 'callsToday', label: 'CALLS TODAY', color: '#1677ff' },
  { key: 'meetingsHeldToday', label: 'MEETINGS HELD', color: '#52c41a' },
  { key: 'tasksCompletedToday', label: 'TASKS DONE', color: '#722ed1' },
  { key: 'newInquiriesToday', label: 'NEW INQUIRIES', color: '#fa8c16' },
  { key: 'dealsAdvancedWeek', label: 'DEALS ADVANCED', color: '#eb2f96' },
  { key: 'revenueMtd', label: 'REVENUE MTD', color: '#0f766e', format: 'currency' },
];

const safeNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

const formatValue = (value, type) => {
  const n = safeNumber(value);
  if (type === 'currency') {
    if (n >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `AED ${(n / 1_000).toFixed(0)}K`;
    return `AED ${n}`;
  }
  return n.toLocaleString();
};

const MyDayKPIBar = ({ summary = {} }) => {
  return (
    <Row gutter={[12, 12]}>
      {KPI_CONFIG.map((kpi) => {
        const value = safeNumber(summary[kpi.key]);
        return (
          <Col xs={24} sm={12} lg={Math.floor(24 / KPI_CONFIG.length)} key={kpi.key}>
            <Card styles={{ body: { padding: '12px 14px' } }} style={{ borderTop: `3px solid ${kpi.color}`, overflow: 'hidden' }}>
              <Text type="secondary" style={{ fontSize: 11, letterSpacing: 0.4 }}>{kpi.label}</Text>
              <div style={{ marginTop: 6, fontSize: 24, lineHeight: 1.1, fontWeight: 700, color: kpi.color }}>
                {formatValue(value, kpi.format)}
              </div>
            </Card>
          </Col>
        );
      })}
    </Row>
  );
};

export default MyDayKPIBar;
