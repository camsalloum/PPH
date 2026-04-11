/**
 * EstimationOperationTable — 10 manufacturing process rows.
 *
 * Each row: enable/disable checkbox, speed input, setup hours,
 *           total hours (calc), cost/hr, process cost (calc).
 *
 * Hours formulas per speed unit:
 *   Kgs/Hr  → SetupHrs + (SumLDPE_Kgs / Speed)
 *   Mtr/Min → SetupHrs + (OrderMeters / Speed) / 60
 *             Sleeving/Doctoring: add × NumUps multiplier
 *   Pcs/Min → SetupHrs + (OrderKpcs × 1000 / Speed) / 60
 */

import React, { useCallback } from 'react';
import { Card, Table, Switch, InputNumber, Tag, Typography } from 'antd';
import { ToolOutlined } from '@ant-design/icons';

const { Text } = Typography;

const SPEED_UNIT_LABELS = {
  'Kgs/Hr': 'Kgs/Hr',
  'Mtr/Min': 'Mtr/Min',
  'Pcs/Min': 'Pcs/Min',
};

export default function EstimationOperationTable({ operations, onChange }) {
  const updateOp = useCallback((key, field, value) => {
    onChange(prev => prev.map(o => o.key === key ? { ...o, [field]: value } : o));
  }, [onChange]);

  const totalHrs = operations.reduce((s, o) => s + (o.enabled ? (o.totalHrs || 0) : 0), 0);
  const totalCost = operations.reduce((s, o) => s + (o.enabled ? (o.processCost || 0) : 0), 0);

  const columns = [
    {
      title: 'Process', dataIndex: 'processName', width: 150,
      render: (v, r) => (
        <span style={{ opacity: r.enabled ? 1 : 0.4 }}>
          <Tag color={r.enabled ? 'processing' : 'default'} style={{ margin: 0 }}>{v}</Tag>
        </span>
      ),
    },
    {
      title: 'Enable', dataIndex: 'enabled', width: 70, align: 'center',
      render: (v, r) => <Switch checked={v} size="small" onChange={val => updateOp(r.key, 'enabled', val)} />,
    },
    {
      title: 'Speed', dataIndex: 'speed', width: 100,
      render: (v, r) => r.enabled
        ? <InputNumber value={v} onChange={val => updateOp(r.key, 'speed', val || 0)} min={0} size="small" style={{ width: 80 }} />
        : <span style={{ color: '#ccc' }}>—</span>,
    },
    {
      title: 'Unit', dataIndex: 'speedUnit', width: 80,
      render: (v, r) => r.enabled
        ? <Text type="secondary" style={{ fontSize: 11 }}>{SPEED_UNIT_LABELS[v] || v}</Text>
        : <span style={{ color: '#ccc' }}>—</span>,
    },
    {
      title: 'Setup Hrs', dataIndex: 'setupHrs', width: 90,
      render: (v, r) => r.enabled
        ? <InputNumber value={v} onChange={val => updateOp(r.key, 'setupHrs', val || 0)} min={0} step={0.25} size="small" style={{ width: 70 }} />
        : <span style={{ color: '#ccc' }}>—</span>,
    },
    {
      title: 'Total Hrs', dataIndex: 'totalHrs', width: 80,
      render: (v, r) => r.enabled
        ? <span style={{ fontWeight: 600 }}>{(v || 0).toFixed(2)}</span>
        : <span style={{ color: '#ccc' }}>—</span>,
    },
    {
      title: 'Cost/Hr', dataIndex: 'costPerHr', width: 90,
      render: (v, r) => r.enabled
        ? <InputNumber value={v} onChange={val => updateOp(r.key, 'costPerHr', val || 0)} min={0} step={5} size="small" style={{ width: 80 }} />
        : <span style={{ color: '#ccc' }}>—</span>,
    },
    {
      title: 'Process Cost', dataIndex: 'processCost', width: 100,
      render: (v, r) => r.enabled
        ? <span style={{ fontWeight: 600, color: '#1890ff' }}>{(v || 0).toFixed(2)}</span>
        : <span style={{ color: '#ccc' }}>—</span>,
    },
  ];

  return (
    <Card
      title={<><ToolOutlined style={{ marginRight: 8 }} />Operation Cost</>}
      size="small"
      style={{ marginBottom: 16 }}
    >
      <Table
        dataSource={operations}
        columns={columns}
        rowKey="key"
        size="small"
        pagination={false}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={5}><strong>TOTAL</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={5}><strong>{totalHrs.toFixed(2)}</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={6} />
            <Table.Summary.Cell index={7}><strong style={{ color: '#1890ff' }}>{totalCost.toFixed(2)}</strong></Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />
    </Card>
  );
}
