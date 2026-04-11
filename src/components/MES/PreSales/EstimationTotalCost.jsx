/**
 * EstimationTotalCost — Multi-unit pricing grid.
 *
 * Cost grid columns: Raw Material Cost, Markup%, Plates/Cylinders,
 *                    Delivery, Operation Cost, Sale Price.
 * Five unit rows: Per Kg, Per Kpcs, Per SQM, Per LM, Per Roll 500 LM.
 */

import React from 'react';
import { Card, Table, InputNumber, Typography, Row, Col, Statistic } from 'antd';
import { DollarOutlined } from '@ant-design/icons';

const { Text } = Typography;

const safeDivide = (a, b) => (b && isFinite(a / b) ? a / b : 0);

export default function EstimationTotalCost({
  totalCost, summary, markupPct, platesCost, deliveryCost, accessoryCost,
  onMarkupChange, onPlatesChange, onDeliveryChange, onAccessoryChange,
}) {
  if (!totalCost || !summary) return null;

  const perKg = totalCost.perKg || {};
  const rm = perKg.rawMaterialCost || 0;
  const op = perKg.operationCost || 0;
  const rmWithMarkup = rm * (1 + (markupPct || 0) / 100);
  const platesKg = totalCost.platesCost || 0;
  const delKg = totalCost.deliveryCost || 0;
  const accKg = totalCost.accessoryCost || 0;
  const saleKg = perKg.salePrice || 0;

  // Conversion factors
  const pcsKg = summary.piecesPerKg || 0;
  const sqmKg = summary.sqmPerKg || 0;
  const lmKg = summary.lmPerKg || 0;

  const unitRows = [
    { key: 'perKg',  unit: 'Per Kg',        factor: 1 },
    { key: 'perKpcs',unit: 'Per 1,000 pcs', factor: safeDivide(1000, pcsKg) },
    { key: 'perSqm', unit: 'Per SQM',       factor: safeDivide(1, sqmKg) },
    { key: 'perLm',  unit: 'Per LM',        factor: safeDivide(1, lmKg) },
    { key: 'perRoll',unit: 'Per Roll (500 LM)', factor: safeDivide(500, lmKg) },
  ];

  const dataSource = unitRows.map(r => ({
    key: r.key,
    unit: r.unit,
    rawMaterial: Math.round(rm * r.factor * 100) / 100,
    markup: Math.round((rmWithMarkup - rm) * r.factor * 100) / 100,
    plates: Math.round(platesKg * r.factor * 100) / 100,
    delivery: Math.round(delKg * r.factor * 100) / 100,
    accessory: Math.round(accKg * r.factor * 100) / 100,
    operation: Math.round(op * r.factor * 100) / 100,
    salePrice: Math.round(saleKg * r.factor * 100) / 100,
  }));

  const columns = [
    { title: 'Unit', dataIndex: 'unit', width: 140, render: v => <strong>{v}</strong> },
    { title: 'RM Cost', dataIndex: 'rawMaterial', width: 100, align: 'right', render: v => v.toFixed(2) },
    { title: 'Markup', dataIndex: 'markup', width: 100, align: 'right', render: v => v.toFixed(2) },
    { title: 'Plates/Cyl', dataIndex: 'plates', width: 100, align: 'right', render: v => v.toFixed(2) },
    { title: 'Accessories', dataIndex: 'accessory', width: 100, align: 'right', render: v => v.toFixed(2) },
    { title: 'Delivery', dataIndex: 'delivery', width: 100, align: 'right', render: v => v.toFixed(2) },
    { title: 'Op. Cost', dataIndex: 'operation', width: 100, align: 'right', render: v => v.toFixed(2) },
    { title: 'Sale Price', dataIndex: 'salePrice', width: 120, align: 'right',
      render: v => <strong style={{ color: '#52c41a', fontSize: 14 }}>{v.toFixed(2)}</strong>,
    },
  ];

  return (
    <Card
      title={<><DollarOutlined style={{ marginRight: 8 }} />Total Cost Table</>}
      size="small"
      style={{ marginBottom: 16 }}
    >
      {/* Input overrides */}
      <Row gutter={16} style={{ marginBottom: 12 }}>
        <Col span={5}>
          <Text type="secondary">Markup %</Text>
          <InputNumber value={markupPct} onChange={onMarkupChange} min={0} max={200} step={0.5}
            style={{ width: '100%' }} size="small" addonAfter="%" />
        </Col>
        <Col span={5}>
          <Text type="secondary">Plates / Cylinders (total)</Text>
          <InputNumber value={platesCost} onChange={onPlatesChange} min={0} step={50}
            style={{ width: '100%' }} size="small" />
        </Col>
        <Col span={5}>
          <Text type="secondary">Accessories (total)</Text>
          <InputNumber value={accessoryCost} onChange={onAccessoryChange} min={0} step={10}
            style={{ width: '100%' }} size="small" />
        </Col>
        <Col span={5}>
          <Text type="secondary">Delivery Cost (total)</Text>
          <InputNumber value={deliveryCost} onChange={onDeliveryChange} min={0} step={50}
            style={{ width: '100%' }} size="small" />
        </Col>
        <Col span={4}>
          <Statistic title="Sale Price / Kg" value={saleKg} precision={2}
            valueStyle={{ color: '#52c41a', fontWeight: 700 }} />
        </Col>
      </Row>

      <Table
        dataSource={dataSource}
        columns={columns}
        rowKey="key"
        size="small"
        pagination={false}
        bordered
      />

      {/* Cost allocation summary */}
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={8}>
          <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, padding: 12, textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Raw Material %</Text>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#52c41a' }}>
              {saleKg > 0 ? ((rm / saleKg) * 100).toFixed(1) : 0}%
            </div>
          </div>
        </Col>
        <Col span={8}>
          <div style={{ background: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: 6, padding: 12, textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Operation %</Text>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {saleKg > 0 ? ((op / saleKg) * 100).toFixed(1) : 0}%
            </div>
          </div>
        </Col>
        <Col span={8}>
          <div style={{ background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 6, padding: 12, textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Margin %</Text>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fa8c16' }}>
              {saleKg > 0 ? (((saleKg - rm - op) / saleKg) * 100).toFixed(1) : 0}%
            </div>
          </div>
        </Col>
      </Row>
    </Card>
  );
}
