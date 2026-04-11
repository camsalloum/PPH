/**
 * BOMEstimationPreview — Read-only cost breakdown preview from current BOM
 * Sub-tab 3 of BOMConfigurator
 *
 * Uses same calculation-engine formulas as EstimationCalculator.
 */

import React, { useMemo } from 'react';
import { Table, Descriptions, Tag, Empty, Row, Col, Typography, Card, Statistic } from 'antd';

const { Text, Title } = Typography;

export default function BOMEstimationPreview({ bomVersion, layers, accessories, prepress, routing }) {
  const preview = useMemo(() => {
    if (!bomVersion || !layers || !layers.length) return null;

    const activeLayers = layers.filter(l => l.is_active !== false);
    const substrates = activeLayers.filter(l => l.layer_type === 'substrate');
    const inks = activeLayers.filter(l => l.layer_type === 'ink');
    const adhesives = activeLayers.filter(l => l.layer_type === 'adhesive');
    const coatings = activeLayers.filter(l => l.layer_type === 'coating');

    const totalGSM = activeLayers.reduce((s, l) => s + (parseFloat(l.gsm) || 0), 0);
    const totalThickness = substrates.reduce((s, l) => s + (parseFloat(l.thickness_micron) || 0), 0);
    const sqmPerKg = totalGSM > 0 ? 1000 / totalGSM : 0;

    // Material costs per sqm
    const materialCostPerSqm = activeLayers.reduce((s, l) => s + (parseFloat(l.cost_per_sqm) || 0), 0);
    const materialCostPerKg = materialCostPerSqm * (1000 / (totalGSM || 1));

    // Solvent cost estimate
    const inkAdhGSM = [...inks, ...adhesives, ...coatings].reduce((s, l) => s + (parseFloat(l.gsm) || 0), 0);
    const solventRatio = parseFloat(bomVersion.solvent_ratio) || 0.5;
    const solventCostPerKg = parseFloat(bomVersion.solvent_cost_per_kg) || 1.50;
    const solventCostPerSqm = inkAdhGSM > 0 ? (inkAdhGSM / solventRatio) * solventCostPerKg / 1000 : 0;

    // Prepress total
    const prepressTotal = (prepress || []).reduce((s, p) => s + (parseFloat(p.total_cost) || 0), 0);

    // Accessory cost estimate (simplified — per 1000 pcs not known without dimensions)
    const accessoryCost = (accessories || []).reduce((s, a) => s + (parseFloat(a.cost_per_unit) || 0), 0);

    return {
      totalGSM,
      totalThickness,
      sqmPerKg,
      substrates, inks, adhesives, coatings,
      materialCostPerSqm,
      materialCostPerKg,
      solventCostPerSqm,
      prepressTotal,
      accessoryCost,
      layerBreakdown: activeLayers,
    };
  }, [bomVersion, layers, accessories, prepress]);

  if (!preview) {
    return <Empty description="Add layers to see estimation preview" />;
  }

  const matColumns = [
    { title: 'Material', dataIndex: 'material_name', key: 'name', ellipsis: true },
    { title: 'Type', dataIndex: 'layer_type', key: 'type', width: 80, render: v => <Tag>{v}</Tag> },
    { title: 'GSM', dataIndex: 'gsm', key: 'gsm', width: 70, render: v => v ? parseFloat(v).toFixed(2) : '—' },
    { title: '$/kg', dataIndex: 'cost_per_kg', key: 'cpk', width: 80, render: v => v ? parseFloat(v).toFixed(2) : '—' },
    { title: '$/m²', dataIndex: 'cost_per_sqm', key: 'cps', width: 90, render: v => v ? parseFloat(v).toFixed(4) : '—' },
    { title: 'Waste%', dataIndex: 'waste_pct', key: 'waste', width: 70, render: v => `${v}%` },
  ];

  const routingColumns = [
    { title: 'Seq', dataIndex: 'sequence_order', key: 'seq', width: 50 },
    { title: 'Process', key: 'proc', render: (_, r) => r.process_name || r.process_code },
    { title: 'Machine', key: 'mach', render: (_, r) => r.machine_name || 'Any' },
    { title: 'Speed', key: 'speed', render: (_, r) => r.estimated_speed || r.default_speed || '—' },
    { title: 'Rate', key: 'rate', render: (_, r) => `$${r.hourly_rate_override || r.hourly_rate || 0}/hr` },
  ];

  return (
    <div>
      {/* Summary Cards */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card size="small"><Statistic title="Total GSM" value={preview.totalGSM.toFixed(2)} /></Card>
        </Col>
        <Col span={4}>
          <Card size="small"><Statistic title="Thickness (μm)" value={preview.totalThickness.toFixed(0)} /></Card>
        </Col>
        <Col span={4}>
          <Card size="small"><Statistic title="m²/kg" value={preview.sqmPerKg.toFixed(2)} /></Card>
        </Col>
        <Col span={4}>
          <Card size="small"><Statistic title="Material $/m²" value={preview.materialCostPerSqm.toFixed(4)} prefix="$" /></Card>
        </Col>
        <Col span={4}>
          <Card size="small"><Statistic title="Material $/kg" value={preview.materialCostPerKg.toFixed(2)} prefix="$" /></Card>
        </Col>
        <Col span={4}>
          <Card size="small"><Statistic title="Prepress Total" value={preview.prepressTotal.toFixed(0)} prefix="$" /></Card>
        </Col>
      </Row>

      {/* Material Breakdown */}
      <Text strong style={{ display: 'block', marginBottom: 8 }}>Material Breakdown</Text>
      <Table
        dataSource={preview.layerBreakdown}
        columns={matColumns}
        rowKey="id"
        size="small"
        pagination={false}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell colSpan={2}><Text strong>Totals</Text></Table.Summary.Cell>
            <Table.Summary.Cell><Text strong>{preview.totalGSM.toFixed(2)}</Text></Table.Summary.Cell>
            <Table.Summary.Cell />
            <Table.Summary.Cell><Text strong>${preview.materialCostPerSqm.toFixed(4)}</Text></Table.Summary.Cell>
            <Table.Summary.Cell />
          </Table.Summary.Row>
        )}
      />

      {/* Solvent info */}
      {preview.solventCostPerSqm > 0 && (
        <Descriptions size="small" bordered style={{ marginTop: 12 }} column={3}>
          <Descriptions.Item label="Solvent Ratio">{bomVersion.solvent_ratio || 0.5}</Descriptions.Item>
          <Descriptions.Item label="Solvent $/kg">${bomVersion.solvent_cost_per_kg || 1.50}</Descriptions.Item>
          <Descriptions.Item label="Solvent $/m²">${preview.solventCostPerSqm.toFixed(4)}</Descriptions.Item>
        </Descriptions>
      )}

      {/* Routing Preview */}
      {routing && routing.length > 0 && (
        <>
          <Text strong style={{ display: 'block', margin: '16px 0 8px' }}>Process Routing</Text>
          <Table
            dataSource={[...routing].sort((a, b) => a.sequence_order - b.sequence_order)}
            columns={routingColumns}
            rowKey="id"
            size="small"
            pagination={false}
          />
        </>
      )}
    </div>
  );
}
