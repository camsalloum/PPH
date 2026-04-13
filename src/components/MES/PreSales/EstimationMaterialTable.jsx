/**
 * EstimationMaterialTable — Dynamic raw material rows.
 *
 * Each row: Type (Substrate/Ink/Adhesive), Material (from API), Solid%,
 *           Micron, Density, Total GSM (calc), Price Basis, Cost/Kg, Waste%,
 *           Cost/M² (calc), Est. Kg (calc), Layer% (calc).
 *
 * Formulas:
 *   Substrate GSM = Micron × Density
 *   Ink/Adhesive GSM = (Solid% × Micron) / 100
 *   Substrate Cost/M² = (GSM × CostPerKg / 1000) × (1 + Waste%/100)
 *   Ink/Adhesive Cost/M² = (Micron × CostPerKg / 1000) × (1 + Waste%/100)
 */

import React, { useCallback } from 'react';
import { Card, Table, Select, InputNumber, Button, Space, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';

const { Option, OptGroup } = Select;

const safeDivide = (a, b) => (b && isFinite(a / b) ? a / b : 0);

const TYPE_OPTIONS = [
  { value: 'substrate', label: 'Substrate', color: 'blue' },
  { value: 'ink', label: 'Ink', color: 'magenta' },
  { value: 'adhesive', label: 'Adhesive', color: 'green' },
];

const PRICE_SOURCE_OPTIONS = [
  { value: 'combined_wa', label: 'Combined WA' },
  { value: 'stock_wa', label: 'Stock WA' },
  { value: 'market_price', label: 'Market Price' },
];

const DEFAULT_PRICE_SOURCE = 'combined_wa';

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function resolvePriceBySource(source, stockPriceWa, combinedPriceWa, marketPrice, fallback = 0) {
  const stock = toFiniteNumber(stockPriceWa);
  const combined = toFiniteNumber(combinedPriceWa);
  const market = toFiniteNumber(marketPrice);
  const fb = toFiniteNumber(fallback) ?? 0;

  if (source === 'stock_wa') {
    return stock ?? combined ?? market ?? fb;
  }
  if (source === 'market_price') {
    return market ?? combined ?? stock ?? fb;
  }
  return combined ?? stock ?? market ?? fb;
}

export default function EstimationMaterialTable({ rows, onChange, materials, summary, orderQty }) {
  const updateRow = useCallback((key, field, value) => {
    onChange(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r));
  }, [onChange]);

  const addRow = useCallback(() => {
    const key = `row-${Date.now()}`;
    onChange(prev => [...prev, {
      key, type: 'substrate', materialName: '', solidPct: null,
      micron: 0, density: null, costPerKg: 0, wastePct: 0,
      priceSource: DEFAULT_PRICE_SOURCE,
      stockPriceWa: null,
      combinedPriceWa: null,
      marketPrice: null,
    }]);
  }, [onChange]);

  const removeRow = useCallback((key) => {
    onChange(prev => prev.filter(r => r.key !== key));
  }, [onChange]);

  const handleMaterialSelect = useCallback((key, materialName, type) => {
    // Find material in the master list and auto-fill
    const categoryMaterials = materials[type] || [];
    const mat = categoryMaterials.find(m => m.name === materialName);
    const selectedRow = rows.find((row) => row.key === key) || {};
    const priceSource = selectedRow.priceSource || DEFAULT_PRICE_SOURCE;

    if (mat) {
      const stockPriceWa = toFiniteNumber(mat.stock_price_wa) ?? toFiniteNumber(selectedRow.stockPriceWa) ?? toFiniteNumber(selectedRow.costPerKg) ?? 0;
      const combinedPriceWa = toFiniteNumber(mat.combined_price_wa) ?? toFiniteNumber(selectedRow.combinedPriceWa) ?? toFiniteNumber(selectedRow.costPerKg) ?? 0;
      const marketPrice = toFiniteNumber(mat.market_price) ?? toFiniteNumber(selectedRow.marketPrice) ?? toFiniteNumber(selectedRow.costPerKg) ?? 0;
      const costPerKg = resolvePriceBySource(priceSource, stockPriceWa, combinedPriceWa, marketPrice, selectedRow.costPerKg);

      onChange(prev => prev.map(r => r.key === key ? {
        ...r,
        materialName,
        solidPct: mat.solid_pct ?? r.solidPct,
        density: mat.density ?? r.density,
        costPerKg,
        wastePct: mat.waste_pct ?? r.wastePct,
        stockPriceWa,
        combinedPriceWa,
        marketPrice,
        priceSource,
      } : r));
    } else {
      updateRow(key, 'materialName', materialName);
    }
  }, [materials, onChange, rows, updateRow]);

  const handlePriceSourceChange = useCallback((key, priceSource) => {
    onChange((prev) => prev.map((row) => {
      if (row.key !== key) return row;
      const costPerKg = resolvePriceBySource(
        priceSource,
        row.stockPriceWa,
        row.combinedPriceWa,
        row.marketPrice,
        row.costPerKg
      );
      return {
        ...row,
        priceSource,
        costPerKg,
      };
    }));
  }, [onChange]);

  // Compute derived values per row
  const computedRows = rows.map(r => {
    const micron = Number(r.micron) || 0;
    const density = Number(r.density) || 0;
    const solidPct = Number(r.solidPct) || 0;
    const costPerKg = Number(r.costPerKg) || 0;
    const wastePct = Number(r.wastePct) || 0;

    let gsm, costPerSqm;
    if (r.type === 'substrate') {
      gsm = micron * density;
      costPerSqm = (gsm * costPerKg / 1000) * (1 + wastePct / 100);
    } else {
      gsm = (solidPct * micron) / 100;
      costPerSqm = (micron * costPerKg / 1000) * (1 + wastePct / 100);
    }

    // Est. Kg = (OrderKgs × RowGSM / TotalGSM) × (1 + Waste%/100)
    const orderKgs = Number(orderQty) || 0;
    const totalGSM = summary?.totalGSM || 0;
    const estKg = r.type === 'substrate'
      ? safeDivide(orderKgs * gsm, totalGSM) * (1 + wastePct / 100)
      : safeDivide(orderKgs * micron, totalGSM) * (1 + wastePct / 100);

    // Layer% = rowGSM / totalGSM × 100
    const layerPct = safeDivide(gsm, totalGSM) * 100;

    return {
      ...r,
      gsm: Math.round(gsm * 100) / 100,
      costPerSqm: Math.round(costPerSqm * 1000) / 1000,
      estKg: Math.round(estKg * 100) / 100,
      layerPct: Math.round(layerPct * 10) / 10,
    };
  });

  const columns = [
    {
      title: 'Type', dataIndex: 'type', width: 110,
      render: (v, r) => (
        <Select
          value={v}
          onChange={(val) => {
            onChange((prev) => prev.map((row) => {
              if (row.key !== r.key) return row;
              return {
                ...row,
                type: val,
                materialName: '',
                priceSource: DEFAULT_PRICE_SOURCE,
                stockPriceWa: null,
                combinedPriceWa: null,
                marketPrice: null,
                costPerKg: 0,
              };
            }));
          }}
          size="small"
          style={{ width: 100 }}
        >
          {TYPE_OPTIONS.map(t => <Option key={t.value} value={t.value}><Tag color={t.color} style={{ margin: 0 }}>{t.label}</Tag></Option>)}
        </Select>
      ),
    },
    {
      title: 'Material', dataIndex: 'materialName', width: 200,
      render: (v, r) => {
        const catMats = materials[r.type] || [];
        // Group by subcategory
        const groups = {};
        catMats.forEach(m => {
          if (!groups[m.subcategory]) groups[m.subcategory] = [];
          groups[m.subcategory].push(m);
        });
        return (
          <Select
            value={v || undefined}
            onChange={val => handleMaterialSelect(r.key, val, r.type)}
            placeholder="Select material"
            size="small" style={{ width: 190 }}
            showSearch
            filterOption={(input, option) => (option?.children || '').toString().toLowerCase().includes(input.toLowerCase())}
          >
            {Object.entries(groups).map(([sub, mats]) => (
              <OptGroup key={sub} label={sub}>
                {mats.map(m => <Option key={m.id} value={m.name}>{m.name}</Option>)}
              </OptGroup>
            ))}
          </Select>
        );
      },
    },
    {
      title: 'Solid%', dataIndex: 'solidPct', width: 75,
      render: (v, r) => r.type !== 'substrate'
        ? <InputNumber value={v} onChange={val => updateRow(r.key, 'solidPct', val)} min={0} max={100} size="small" style={{ width: 65 }} />
        : <span style={{ color: '#999' }}>—</span>,
    },
    {
      title: 'Micron', dataIndex: 'micron', width: 75,
      render: (v, r) => <InputNumber value={v} onChange={val => updateRow(r.key, 'micron', val || 0)} min={0} size="small" style={{ width: 65 }} />,
    },
    {
      title: 'Density', dataIndex: 'density', width: 75,
      render: (v, r) => r.type === 'substrate'
        ? <InputNumber value={v} onChange={val => updateRow(r.key, 'density', val)} min={0} step={0.01} size="small" style={{ width: 65 }} />
        : <span style={{ color: '#999' }}>—</span>,
    },
    {
      title: 'GSM', dataIndex: 'gsm', width: 65,
      render: v => <span style={{ fontWeight: 600 }}>{v || '—'}</span>,
    },
    {
      title: 'Price Basis', dataIndex: 'priceSource', width: 125,
      render: (v, r) => (
        <Select
          value={v || DEFAULT_PRICE_SOURCE}
          onChange={(val) => handlePriceSourceChange(r.key, val)}
          size="small"
          style={{ width: 115 }}
        >
          {PRICE_SOURCE_OPTIONS.map((opt) => (
            <Option key={opt.value} value={opt.value}>{opt.label}</Option>
          ))}
        </Select>
      ),
    },
    {
      title: 'Cost/Kg', dataIndex: 'costPerKg', width: 80,
      render: (v, r) => <InputNumber value={v} onChange={val => updateRow(r.key, 'costPerKg', val || 0)} min={0} step={0.1} size="small" style={{ width: 70 }} />,
    },
    {
      title: 'Waste%', dataIndex: 'wastePct', width: 75,
      render: (v, r) => <InputNumber value={v} onChange={val => updateRow(r.key, 'wastePct', val || 0)} min={0} max={50} size="small" style={{ width: 65 }} />,
    },
    {
      title: 'Cost/M²', dataIndex: 'costPerSqm', width: 80,
      render: v => <span style={{ fontWeight: 600, color: '#1890ff' }}>{v?.toFixed(3) || '—'}</span>,
    },
    {
      title: 'Est. Kg', dataIndex: 'estKg', width: 80,
      render: v => v ? v.toFixed(2) : '—',
    },
    {
      title: 'Layer%', dataIndex: 'layerPct', width: 70,
      render: v => v ? `${v.toFixed(1)}%` : '—',
    },
    {
      title: '', width: 40,
      render: (_, r) => <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeRow(r.key)} />,
    },
  ];

  return (
    <Card
      title="Raw Material Cost Table"
      size="small"
      style={{ marginBottom: 16 }}
      extra={<Button type="dashed" icon={<PlusOutlined />} onClick={addRow} size="small">Add Layer</Button>}
    >
      <Table
        dataSource={computedRows}
        columns={columns}
        rowKey="key"
        size="small"
        pagination={false}
        scroll={{ x: 1220 }}
        locale={{ emptyText: 'No material layers. Click "Add Layer" to start.' }}
        summary={() => computedRows.length > 0 ? (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={5}><strong>TOTAL</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={5}><strong>{summary?.totalGSM?.toFixed(2)}</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={6} />
            <Table.Summary.Cell index={7} />
            <Table.Summary.Cell index={8}><strong style={{ color: '#1890ff' }}>{summary?.totalCostPerSqm?.toFixed(3)}</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={9} />
            <Table.Summary.Cell index={10}><strong>100%</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={11} />
          </Table.Summary.Row>
        ) : null}
      />
    </Card>
  );
}
