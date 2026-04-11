/**
 * SimplifiedEstimationView — Read-only summary for non-technical users (level < 6).
 *
 * Shows: Total Cost/Kg, Sale Price, Margin %, 5-unit pricing grid.
 * Hides: individual material rows, operation details, formulas.
 */

import React from 'react';
import { Card, Row, Col, Statistic, Table, Typography, Tag, Divider } from 'antd';
import { DollarOutlined, PercentageOutlined, CalculatorOutlined } from '@ant-design/icons';

const { Text } = Typography;

const safeDivide = (a, b) => (b && isFinite(a / b) ? a / b : 0);

export default function SimplifiedEstimationView({ totalCost, summary, markupPct, productType }) {
  if (!totalCost || !summary) return null;

  const perKg = totalCost.perKg || {};
  const rm = perKg.rawMaterialCost || 0;
  const op = perKg.operationCost || 0;
  const saleKg = perKg.salePrice || 0;
  const marginPct = saleKg > 0 ? ((saleKg - rm - op) / saleKg * 100) : 0;

  // B6: Label per calculation basis
  const basisLabels = {
    roll: { primary: 'Per Kg', secondary: 'Per LM' },
    sleeve: { primary: 'Per M²', secondary: 'Per Kg' },
    bag_pouch: { primary: 'Per 1,000 pcs', secondary: 'Per Kg' },
  };
  const labels = basisLabels[productType] || basisLabels.roll;

  // Conversion factors
  const pcsKg = summary.piecesPerKg || 0;
  const sqmKg = summary.sqmPerKg || 0;
  const lmKg = summary.lmPerKg || 0;

  const unitRows = [
    { key: 'perKg',   unit: 'Per Kg',            factor: 1 },
    { key: 'perKpcs', unit: 'Per 1,000 pcs',     factor: safeDivide(1000, pcsKg) },
    { key: 'perSqm',  unit: 'Per SQM',           factor: safeDivide(1, sqmKg) },
    { key: 'perLm',   unit: 'Per LM',            factor: safeDivide(1, lmKg) },
    { key: 'perRoll', unit: 'Per Roll (500 LM)',  factor: safeDivide(500, lmKg) },
  ];

  const dataSource = unitRows.map(r => ({
    key: r.key,
    unit: r.unit,
    salePrice: Math.round(saleKg * r.factor * 100) / 100,
  }));

  const columns = [
    { title: 'Unit', dataIndex: 'unit', width: 180, render: v => <strong>{v}</strong> },
    { title: 'Sale Price', dataIndex: 'salePrice', align: 'right',
      render: v => <strong style={{ color: '#52c41a', fontSize: 15 }}>{v.toFixed(2)}</strong>,
    },
  ];

  return (
    <>
      {/* Key Metrics */}
      <Card
        title={<><CalculatorOutlined style={{ marginRight: 8 }} />Estimation Summary</>}
        size="small"
        style={{ marginBottom: 16 }}
      >
        <Row gutter={[24, 16]}>
          <Col xs={12} sm={6}>
            <Statistic
              title="Material Cost / Kg"
              value={rm}
              precision={2}
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic
              title={`Sale Price / Kg`}
              value={saleKg}
              precision={2}
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#52c41a', fontWeight: 700 }}
            />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic
              title="Markup"
              value={markupPct || 0}
              precision={1}
              suffix="%"
              prefix={<PercentageOutlined />}
            />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic
              title="Margin"
              value={marginPct}
              precision={1}
              suffix="%"
              valueStyle={{ color: marginPct >= 15 ? '#52c41a' : '#fa8c16' }}
            />
          </Col>
        </Row>

        <Row gutter={[24, 16]} style={{ marginTop: 16 }}>
          <Col xs={12} sm={6}>
            <Statistic title="Total GSM" value={summary.totalGSM} precision={1} suffix="g/m²" />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="SQM / Kg" value={summary.sqmPerKg} precision={2} suffix="m²" />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="Pieces / Kg" value={summary.piecesPerKg} precision={1} suffix="pcs" />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="Total Micron" value={summary.totalMicron} precision={0} suffix="µm" />
          </Col>
        </Row>
      </Card>

      {/* Simplified Pricing Grid */}
      <Card
        title={<><DollarOutlined style={{ marginRight: 8 }} />Pricing Grid</>}
        extra={<Tag color="blue">{labels.primary} basis</Tag>}
        size="small"
        style={{ marginBottom: 16 }}
      >
        <Table
          dataSource={dataSource}
          columns={columns}
          rowKey="key"
          size="small"
          pagination={false}
          bordered
        />
      </Card>
    </>
  );
}
