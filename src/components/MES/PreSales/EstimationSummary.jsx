/**
 * EstimationSummary — Aggregate fields derived from material rows.
 *
 * Displays: Film Density, Total Micron, Total GSM, Total Cost/M²,
 *           Pieces/Kg, Grams/Piece, SQM/Kg, Printing Film Width, LM/Kg.
 */

import React from 'react';
import { Card, Row, Col, Statistic, Typography, Divider } from 'antd';
import { DashboardOutlined } from '@ant-design/icons';

const { Text } = Typography;

export default function EstimationSummary({ summary, productType }) {
  if (!summary) return null;

  const items = [
    { label: 'Total Micron', value: summary.totalMicron, suffix: 'µm', precision: 0 },
    { label: 'Total GSM', value: summary.totalGSM, suffix: 'g/m²', precision: 2 },
    { label: 'Film Density', value: summary.filmDensity, suffix: 'g/cm³', precision: 4 },
    { label: 'Total Cost/M²', value: summary.totalCostPerSqm, prefix: '$', precision: 3 },
    { label: 'SQM/Kg', value: summary.sqmPerKg, suffix: 'm²', precision: 2 },
    { label: 'Print Film Width', value: summary.printFilmWidth, suffix: 'm', precision: 3 },
    { label: 'LM/Kg', value: summary.lmPerKg, suffix: 'm', precision: 2 },
    { label: 'Pieces/Kg', value: summary.piecesPerKg, suffix: 'pcs', precision: 2 },
    { label: 'Grams/Piece', value: summary.gramsPerPiece, suffix: 'g', precision: 2 },
  ];

  return (
    <Card
      title={<><DashboardOutlined style={{ marginRight: 8 }} />Raw Material Summary</>}
      size="small"
      style={{ marginBottom: 16 }}
    >
      <Row gutter={[16, 12]}>
        {items.map(item => (
          <Col key={item.label} xs={12} sm={8} md={6} lg={4}>
            <div style={{ background: '#fafafa', borderRadius: 6, padding: '8px 12px', textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 11 }}>{item.label}</Text>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#1890ff' }}>
                {item.prefix || ''}{(item.value || 0).toFixed(item.precision)}{' '}
                <span style={{ fontSize: 11, fontWeight: 400, color: '#999' }}>{item.suffix || ''}</span>
              </div>
            </div>
          </Col>
        ))}
      </Row>
      {productType === 'bag_pouch' && (
        <>
          <Divider orientation="left" orientationMargin={0} style={{ marginTop: 12, marginBottom: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Zipper (Bag/Pouch)</Text>
          </Divider>
          <Row gutter={16}>
            <Col span={6}><Text type="secondary">Zipper section — to be configured per product</Text></Col>
          </Row>
        </>
      )}
    </Card>
  );
}
