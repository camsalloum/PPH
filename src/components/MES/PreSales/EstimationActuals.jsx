/**
 * EstimationActuals — Post-production actual-vs-estimated comparison panel.
 *
 * Sections:
 *   1. Final Output (Kgs)
 *   2. Material actuals table (estimated vs actual consumption)
 *   3. Operation actuals table (estimated vs actual hours)
 *   4. Cost summary comparison
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Card, Table, InputNumber, Typography, Row, Col, Statistic, Tag, Button, Divider, message as antMsg,
} from 'antd';
import {
  ExperimentOutlined, ArrowUpOutlined, ArrowDownOutlined, SaveOutlined,
} from '@ant-design/icons';
import axios from 'axios';

const { Text, Title } = Typography;
const API_BASE = import.meta.env.VITE_API_URL || '';

const pct = (est, act) => {
  if (!est || !act) return 0;
  return Math.round(((act - est) / est) * 10000) / 100; // 2 dp
};

const diffTag = (diff) => {
  if (diff === 0) return <Tag color="default">0%</Tag>;
  if (diff > 0) return <Tag color="red" icon={<ArrowUpOutlined />}>+{diff}%</Tag>;
  return <Tag color="green" icon={<ArrowDownOutlined />}>{diff}%</Tag>;
};

export default function EstimationActuals({ inquiry, estimation, onReload }) {
  // estimation: the saved estimation object (estimation_data JSONB)
  const [finalOutputKgs, setFinalOutputKgs] = useState(0);
  const [materialActuals, setMaterialActuals] = useState([]);
  const [operationActuals, setOperationActuals] = useState([]);
  const [saving, setSaving] = useState(false);

  // Initialize from estimation data
  useEffect(() => {
    if (!estimation) return;
    const a = estimation.actuals || {};
    setFinalOutputKgs(a.finalOutputKgs || 0);
    // Pre-fill material rows from estimation materials
    const mats = (estimation.materialRows || []).map((m, i) => ({
      key: i,
      name: m.materialName || `Layer ${i + 1}`,
      type: m.type,
      estimatedGsm: m.gsm || 0,
      estimatedCostM2: m.costPerM2 || 0,
      actualGsm: a.materials?.[i]?.actualGsm ?? m.gsm ?? 0,
      actualCostM2: a.materials?.[i]?.actualCostM2 ?? m.costPerM2 ?? 0,
    }));
    setMaterialActuals(mats);

    const ops = (estimation.operations || []).filter(o => o.enabled).map((o, i) => ({
      key: i,
      process: o.process || `Process ${i + 1}`,
      estimatedHrs: o.totalHrs || 0,
      estimatedCost: o.processCost || 0,
      actualHrs: a.operations?.[i]?.actualHrs ?? o.totalHrs ?? 0,
      actualCost: a.operations?.[i]?.actualCost ?? o.processCost ?? 0,
    }));
    setOperationActuals(ops);
  }, [estimation]);

  // Material columns
  const matCols = [
    { title: 'Material', dataIndex: 'name', width: 140 },
    { title: 'Type', dataIndex: 'type', width: 90, render: v => <Tag>{v}</Tag> },
    { title: 'Est. GSM', dataIndex: 'estimatedGsm', width: 80, align: 'right', render: v => v?.toFixed(2) },
    { title: 'Act. GSM', dataIndex: 'actualGsm', width: 100, align: 'right',
      render: (v, _, idx) => (
        <InputNumber value={v} size="small" min={0} step={0.1} style={{ width: 80 }}
          onChange={val => {
            const copy = [...materialActuals];
            copy[idx] = { ...copy[idx], actualGsm: val || 0 };
            setMaterialActuals(copy);
          }}
        />
      ),
    },
    { title: 'GSM Diff', width: 80, align: 'center',
      render: (_, r) => diffTag(pct(r.estimatedGsm, r.actualGsm)),
    },
    { title: 'Est. Cost/M²', dataIndex: 'estimatedCostM2', width: 90, align: 'right', render: v => v?.toFixed(4) },
    { title: 'Act. Cost/M²', dataIndex: 'actualCostM2', width: 100, align: 'right',
      render: (v, _, idx) => (
        <InputNumber value={v} size="small" min={0} step={0.001} style={{ width: 80 }}
          onChange={val => {
            const copy = [...materialActuals];
            copy[idx] = { ...copy[idx], actualCostM2: val || 0 };
            setMaterialActuals(copy);
          }}
        />
      ),
    },
    { title: 'Cost Diff', width: 80, align: 'center',
      render: (_, r) => diffTag(pct(r.estimatedCostM2, r.actualCostM2)),
    },
  ];

  // Operation columns
  const opCols = [
    { title: 'Process', dataIndex: 'process', width: 140 },
    { title: 'Est. Hrs', dataIndex: 'estimatedHrs', width: 80, align: 'right', render: v => v?.toFixed(2) },
    { title: 'Act. Hrs', dataIndex: 'actualHrs', width: 100, align: 'right',
      render: (v, _, idx) => (
        <InputNumber value={v} size="small" min={0} step={0.1} style={{ width: 80 }}
          onChange={val => {
            const copy = [...operationActuals];
            copy[idx] = { ...copy[idx], actualHrs: val || 0 };
            setOperationActuals(copy);
          }}
        />
      ),
    },
    { title: 'Hrs Diff', width: 80, align: 'center',
      render: (_, r) => diffTag(pct(r.estimatedHrs, r.actualHrs)),
    },
    { title: 'Est. Cost', dataIndex: 'estimatedCost', width: 90, align: 'right', render: v => v?.toFixed(2) },
    { title: 'Act. Cost', dataIndex: 'actualCost', width: 100, align: 'right',
      render: (v, _, idx) => (
        <InputNumber value={v} size="small" min={0} step={1} style={{ width: 80 }}
          onChange={val => {
            const copy = [...operationActuals];
            copy[idx] = { ...copy[idx], actualCost: val || 0 };
            setOperationActuals(copy);
          }}
        />
      ),
    },
    { title: 'Cost Diff', width: 80, align: 'center',
      render: (_, r) => diffTag(pct(r.estimatedCost, r.actualCost)),
    },
  ];

  // Summary stats
  const costSummary = useMemo(() => {
    const estRm = materialActuals.reduce((s, m) => s + (m.estimatedCostM2 || 0), 0);
    const actRm = materialActuals.reduce((s, m) => s + (m.actualCostM2 || 0), 0);
    const estOp = operationActuals.reduce((s, o) => s + (o.estimatedCost || 0), 0);
    const actOp = operationActuals.reduce((s, o) => s + (o.actualCost || 0), 0);
    return {
      estRm, actRm, rmDiff: pct(estRm, actRm),
      estOp, actOp, opDiff: pct(estOp, actOp),
      estTotal: estRm + estOp, actTotal: actRm + actOp,
      totalDiff: pct(estRm + estOp, actRm + actOp),
    };
  }, [materialActuals, operationActuals]);

  const handleSave = async () => {
    if (!estimation?.id) { antMsg.warning('No estimation to save actuals against'); return; }
    setSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      await axios.patch(`${API_BASE}/api/mes/presales/estimations/${estimation.id}/actuals`, {
        finalOutputKgs,
        materials: materialActuals.map(m => ({ actualGsm: m.actualGsm, actualCostM2: m.actualCostM2 })),
        operations: operationActuals.map(o => ({ actualHrs: o.actualHrs, actualCost: o.actualCost })),
      }, { headers: { Authorization: `Bearer ${token}` } });
      antMsg.success('Actuals saved');
      if (onReload) onReload();
    } catch (err) {
      antMsg.error(err.response?.data?.error || 'Failed to save actuals');
    } finally {
      setSaving(false);
    }
  };

  if (!estimation) return null;

  return (
    <Card
      title={<><ExperimentOutlined style={{ marginRight: 8 }} />Estimation vs Actuals</>}
      size="small"
      style={{ marginBottom: 16 }}
      extra={
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave} size="small">
          Save Actuals
        </Button>
      }
    >
      {/* Final Output */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Text type="secondary">Final Output (Kgs)</Text>
          <InputNumber value={finalOutputKgs} onChange={setFinalOutputKgs} min={0} step={10}
            style={{ width: '100%' }} size="small" />
        </Col>
        <Col span={6}>
          <Statistic title="Estimated Output" value={estimation.orderQty || 0}
            suffix={estimation.qtyUnit || 'Kgs'} />
        </Col>
        <Col span={6}>
          <Statistic title="Output Diff"
            value={pct(estimation.orderQty, finalOutputKgs)}
            suffix="%"
            valueStyle={{ color: pct(estimation.orderQty, finalOutputKgs) > 0 ? '#52c41a' : '#cf1322' }}
          />
        </Col>
      </Row>

      <Divider orientation="left" plain>Material Actuals</Divider>
      <Table dataSource={materialActuals} columns={matCols} size="small" pagination={false} bordered rowKey="key"
        scroll={{ x: 800 }} />

      <Divider orientation="left" plain>Operation Actuals</Divider>
      <Table dataSource={operationActuals} columns={opCols} size="small" pagination={false} bordered rowKey="key"
        scroll={{ x: 700 }} />

      {/* Cost summary */}
      <Divider orientation="left" plain>Cost Summary Comparison</Divider>
      <Row gutter={16}>
        <Col span={8}>
          <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, padding: 12, textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: 11 }}>RM Cost Diff</Text>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {diffTag(costSummary.rmDiff)}
            </div>
          </div>
        </Col>
        <Col span={8}>
          <div style={{ background: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: 6, padding: 12, textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Operation Cost Diff</Text>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {diffTag(costSummary.opDiff)}
            </div>
          </div>
        </Col>
        <Col span={8}>
          <div style={{ background: costSummary.totalDiff > 5 ? '#fff1f0' : '#f6ffed',
            border: `1px solid ${costSummary.totalDiff > 5 ? '#ffa39e' : '#b7eb8f'}`,
            borderRadius: 6, padding: 12, textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Total Cost Diff</Text>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {diffTag(costSummary.totalDiff)}
            </div>
          </div>
        </Col>
      </Row>
    </Card>
  );
}
