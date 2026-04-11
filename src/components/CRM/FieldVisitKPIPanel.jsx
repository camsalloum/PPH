import React from 'react';
import { Card, Col, Row, Statistic, Tag, Typography } from 'antd';

const { Text } = Typography;

const FieldVisitKPIPanel = ({ roi = {}, trip = {} }) => {
  const {
    total_stops = 0, visited_stops = 0, no_show_stops = 0, postponed_stops = 0,
    total_expenses_aed = 0, cost_per_visit, cost_per_qualified_outcome, samples_provided = 0,
  } = roi;

  const visitRate = total_stops > 0 ? ((visited_stops / total_stops) * 100).toFixed(0) : 0;

  return (
    <div>
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Card size="small" style={{ borderTop: '3px solid #1677ff' }}>
            <Statistic title="Visit Rate" value={visitRate} suffix="%" valueStyle={{ color: visitRate >= 80 ? '#52c41a' : visitRate >= 60 ? '#fa8c16' : '#cf1322' }} />
            <Text type="secondary" style={{ fontSize: 11 }}>{visited_stops}/{total_stops} stops visited</Text>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ borderTop: '3px solid #52c41a' }}>
            <Statistic
              title="Total Trip Cost"
              value={parseFloat(total_expenses_aed).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              prefix="AED"
              valueStyle={{ fontSize: 18 }}
            />
            {trip.budget_estimate && (
              <Text type={parseFloat(total_expenses_aed) <= parseFloat(trip.budget_estimate) ? 'success' : 'danger'} style={{ fontSize: 11 }}>
                Budget: AED {parseFloat(trip.budget_estimate).toLocaleString()}
              </Text>
            )}
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ borderTop: '3px solid #722ed1' }}>
            <Statistic
              title="Cost per Visit"
              value={cost_per_visit != null ? parseFloat(cost_per_visit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '\u2014'}
              prefix={cost_per_visit != null ? 'AED' : ''}
              valueStyle={{ fontSize: 18 }}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>Based on visited stops only</Text>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ borderTop: '3px solid #fa8c16' }}>
            <Statistic
              title="Cost per Qualified Lead"
              value={cost_per_qualified_outcome != null ? parseFloat(cost_per_qualified_outcome).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '\u2014'}
              prefix={cost_per_qualified_outcome != null ? 'AED' : ''}
              valueStyle={{ fontSize: 18 }}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>Positive outcome visits only</Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={8}>
          <div style={{ textAlign: 'center', background: '#f6ffed', borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#52c41a' }}>{visited_stops}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>Visited</Text>
          </div>
        </Col>
        <Col xs={8}>
          <div style={{ textAlign: 'center', background: '#fff7e6', borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fa8c16' }}>{postponed_stops}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>Postponed</Text>
          </div>
        </Col>
        <Col xs={8}>
          <div style={{ textAlign: 'center', background: '#fff2f0', borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#cf1322' }}>{no_show_stops}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>No Show</Text>
          </div>
        </Col>
      </Row>

      {samples_provided > 0 && (
        <div style={{ marginTop: 10, background: '#f0f4ff', borderRadius: 8, padding: '8px 12px' }}>
          <Text style={{ fontSize: 13 }}>
            Samples provided at <strong>{samples_provided}</strong> stops during this trip
          </Text>
        </div>
      )}
    </div>
  );
};

export default FieldVisitKPIPanel;
