/**
 * BOMStructureTab — Layers + Accessories + PrePress CRUD with live SVG preview
 * Sub-tab 1 of BOMConfigurator
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, Space, Tag,
  Popconfirm, message, Tooltip, Row, Col, Divider, Collapse, Typography,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, DragOutlined,
} from '@ant-design/icons';
import BOMLayerVisualization from './BOMLayerVisualization';

const { Text } = Typography;
const { Panel } = Collapse;

const LAYER_TYPES = [
  { value: 'substrate', label: 'Substrate' },
  { value: 'ink',       label: 'Ink' },
  { value: 'adhesive',  label: 'Adhesive' },
  { value: 'coating',   label: 'Coating' },
  { value: 'additive',  label: 'Additive' },
];

const LAYER_ROLES = [
  { value: 'seal',           label: 'Sealant' },
  { value: 'barrier',        label: 'Barrier' },
  { value: 'print_carrier',  label: 'Print Carrier' },
  { value: 'bulk',           label: 'Bulk / Body' },
  { value: 'adhesive_bond',  label: 'Adhesive Bond' },
];

const ACCESSORY_TYPES = [
  { value: 'zipper',           label: 'Zipper' },
  { value: 'handle',           label: 'Handle' },
  { value: 'valve',            label: 'Valve' },
  { value: 'tear_notch',       label: 'Tear Notch' },
  { value: 'packing_material', label: 'Packing Material' },
  { value: 'spout',            label: 'Spout' },
];

const PREPRESS_TYPES = [
  { value: 'plate',    label: 'Printing Plate' },
  { value: 'cylinder', label: 'Gravure Cylinder' },
  { value: 'die_cut',  label: 'Die Cut' },
];

const AMORT_METHODS = [
  { value: 'full_first_run', label: 'Full on 1st Run' },
  { value: 'per_kg',         label: 'Per KG' },
  { value: 'per_repeat',     label: 'Per Repeat' },
  { value: 'per_life',       label: 'Per Life Runs' },
];

function normalizeTaxonomyKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export default function BOMStructureTab({
  bomVersion, layers, accessories, prepress, items,
  onLayerSave, onLayerDelete, onAccessorySave, onAccessoryDelete,
  onPrepressSave, onPrepressDelete, onLayerReorder, loading,
}) {
  const token = localStorage.getItem('auth_token');
  const [layerModal, setLayerModal] = useState({ open: false, editing: null });
  const [accModal, setAccModal] = useState({ open: false, editing: null });
  const [ppModal, setPpModal] = useState({ open: false, editing: null });
  const [resinTaxonomyCategories, setResinTaxonomyCategories] = useState([]);
  const [layerForm] = Form.useForm();
  const [accForm] = Form.useForm();
  const [ppForm] = Form.useForm();

  useEffect(() => {
    let disposed = false;

    const loadResinTaxonomy = async () => {
      try {
        const res = await fetch('/api/mes/master-data/taxonomy/categories?domain_key=resin', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!disposed && json.success && Array.isArray(json.data)) {
          setResinTaxonomyCategories(json.data);
        }
      } catch {
        // Keep raw category labels when taxonomy API is unavailable.
      }
    };

    loadResinTaxonomy();

    return () => {
      disposed = true;
    };
  }, [token]);

  const resinCategoryDisplayByKey = useMemo(() => {
    const out = new Map();
    (resinTaxonomyCategories || [])
      .filter((row) => row?.is_active !== false)
      .forEach((row) => {
        const key = normalizeTaxonomyKey(row.internal_key);
        if (!key) return;
        out.set(key, row.display_name || '');
      });
    return out;
  }, [resinTaxonomyCategories]);

  const resolveResinCategoryDisplay = useCallback((rawValue) => {
    const raw = String(rawValue || '').trim();
    if (!raw) return null;

    const key = normalizeTaxonomyKey(raw);
    if (key && resinCategoryDisplayByKey.has(key)) {
      return resinCategoryDisplayByKey.get(key);
    }

    return raw;
  }, [resinCategoryDisplayByKey]);

  // ── Layer Form Helpers ──
  const openLayerEdit = (record) => {
    setLayerModal({ open: true, editing: record });
    layerForm.setFieldsValue(record);
  };
  const openLayerCreate = () => {
    setLayerModal({ open: true, editing: null });
    layerForm.resetFields();
  };
  const handleLayerSave = async () => {
    try {
      const values = await layerForm.validateFields();
      await onLayerSave(values, layerModal.editing);
      setLayerModal({ open: false, editing: null });
      layerForm.resetFields();
    } catch (err) {
      if (err.errorFields) return; // validation error
      message.error(err.message || 'Save failed');
    }
  };

  // Populate from item master
  const handleItemSelect = (itemId) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const stockPrice = Number(item.stock_price);
    const onOrderPrice = Number(item.on_order_price);
    const marketRefPrice = Number(item.market_ref_price);
    const stockQty = Number(item.stock_qty) || 0;
    const orderQty = Number(item.order_qty) || 0;

    const hasStockPrice = Number.isFinite(stockPrice) && stockPrice > 0;
    const hasOnOrderPrice = Number.isFinite(onOrderPrice) && onOrderPrice > 0;
    const hasMarketPrice = Number.isFinite(marketRefPrice) && marketRefPrice > 0;

    let combinedPriceWa = null;
    const totalQty = stockQty + orderQty;
    if (totalQty > 0) {
      let weightedValue = 0;
      let weightedQty = 0;
      if (hasStockPrice && stockQty > 0) {
        weightedValue += stockPrice * stockQty;
        weightedQty += stockQty;
      }
      if (hasOnOrderPrice && orderQty > 0) {
        weightedValue += onOrderPrice * orderQty;
        weightedQty += orderQty;
      }
      if (weightedQty > 0) {
        combinedPriceWa = weightedValue / weightedQty;
      }
    }

    const defaultCostPerKg =
      combinedPriceWa
      ?? (hasStockPrice ? stockPrice : null)
      ?? (hasMarketPrice ? marketRefPrice : null)
      ?? (hasOnOrderPrice ? onOrderPrice : null)
      ?? 0;

    const resolvedCategory =
      resolveResinCategoryDisplay(item.display_cat_desc
      || item.oracle_cat_desc
      || item.cat_desc
      || item.subcategory
      || item.category
      || null);

    layerForm.setFieldsValue({
      material_name: item.item_name,
      material_category: item.subcategory,
      material_cat_desc: resolvedCategory,
      density_g_cm3: item.density_g_cm3,
      thickness_micron: item.micron_thickness,
      cost_per_kg: defaultCostPerKg,
      solid_pct: item.solid_pct,
    });
  };

  // ── Layer Table Columns ──
  const layerColumns = [
    { title: '#', dataIndex: 'layer_order', key: 'order', width: 50 },
    { title: 'Type', dataIndex: 'layer_type', key: 'type', width: 90, render: v => <Tag>{v}</Tag> },
    { title: 'Role', dataIndex: 'layer_role', key: 'role', width: 100, render: v => v || '—' },
    { title: 'Material', dataIndex: 'material_name', key: 'mat', ellipsis: true },
    { title: 'μm', dataIndex: 'thickness_micron', key: 'micron', width: 60, render: v => v || '—' },
    { title: 'GSM', dataIndex: 'gsm', key: 'gsm', width: 70, render: v => v ? parseFloat(v).toFixed(2) : '—' },
    { title: '$/kg', dataIndex: 'cost_per_kg', key: 'cpk', width: 70, render: v => v ? parseFloat(v).toFixed(2) : '—' },
    { title: '$/m²', dataIndex: 'cost_per_sqm', key: 'cps', width: 80, render: v => v ? parseFloat(v).toFixed(4) : '—' },
    { title: 'Waste%', dataIndex: 'waste_pct', key: 'waste', width: 70, render: v => `${v}%` },
    {
      title: '', key: 'actions', width: 80, fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button icon={<EditOutlined />} size="small" onClick={() => openLayerEdit(record)} />
          <Popconfirm title="Remove layer?" onConfirm={() => onLayerDelete(record.id)}>
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // ── Accessory Table ──
  const accColumns = [
    { title: 'Type', dataIndex: 'accessory_type', key: 'type', render: v => <Tag color="orange">{v}</Tag> },
    { title: 'Material', dataIndex: 'material_name', key: 'mat', ellipsis: true },
    { title: 'Unit', dataIndex: 'unit_type', key: 'unit', width: 80 },
    { title: 'Cost/Unit', dataIndex: 'cost_per_unit', key: 'cpu', width: 90, render: v => v ? `$${parseFloat(v).toFixed(2)}` : '—' },
    { title: 'Cost/m', dataIndex: 'cost_per_meter', key: 'cpm', width: 90, render: v => v ? `$${parseFloat(v).toFixed(4)}` : '—' },
    {
      title: '', key: 'actions', width: 80,
      render: (_, record) => (
        <Space size="small">
          <Button icon={<EditOutlined />} size="small" onClick={() => { setAccModal({ open: true, editing: record }); accForm.setFieldsValue(record); }} />
          <Popconfirm title="Remove?" onConfirm={() => onAccessoryDelete(record.id)}>
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // ── PrePress Table ──
  const ppColumns = [
    { title: 'Type', dataIndex: 'prepress_type', key: 'type', render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Qty', dataIndex: 'num_items', key: 'qty', width: 60 },
    { title: '$/Item', dataIndex: 'cost_per_item', key: 'cpi', width: 90, render: v => `$${parseFloat(v).toFixed(2)}` },
    { title: 'Total', dataIndex: 'total_cost', key: 'total', width: 100, render: v => `$${parseFloat(v).toFixed(2)}` },
    { title: 'Amort.', dataIndex: 'amortization_method', key: 'amort', width: 120 },
    {
      title: '', key: 'actions', width: 80,
      render: (_, record) => (
        <Space size="small">
          <Button icon={<EditOutlined />} size="small" onClick={() => { setPpModal({ open: true, editing: record }); ppForm.setFieldsValue(record); }} />
          <Popconfirm title="Remove?" onConfirm={() => onPrepressDelete(record.id)}>
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const watchLayerType = Form.useWatch('layer_type', layerForm);

  return (
    <Row gutter={16}>
      {/* Left panel: Tables */}
      <Col xs={24} lg={14}>
        {/* ─── Layers ─── */}
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text strong>Layers ({layers.length})</Text>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openLayerCreate}>Add Layer</Button>
        </div>
        <Table
          dataSource={layers}
          columns={layerColumns}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ x: 800 }}
          loading={loading}
        />

        {/* ─── Accessories ─── */}
        {(bomVersion?.has_zipper || (accessories && accessories.length > 0)) && (
          <>
            <Divider style={{ margin: '16px 0 8px' }} />
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text strong>Accessories ({accessories?.length || 0})</Text>
              <Button size="small" icon={<PlusOutlined />} onClick={() => { setAccModal({ open: true, editing: null }); accForm.resetFields(); }}>Add</Button>
            </div>
            <Table dataSource={accessories} columns={accColumns} rowKey="id" size="small" pagination={false} />
          </>
        )}

        {/* ─── Pre-Press ─── */}
        {((bomVersion?.num_colors || 0) > 0 || (prepress && prepress.length > 0)) && (
          <>
            <Divider style={{ margin: '16px 0 8px' }} />
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text strong>Pre-Press ({prepress?.length || 0})</Text>
              <Button size="small" icon={<PlusOutlined />} onClick={() => { setPpModal({ open: true, editing: null }); ppForm.resetFields(); }}>Add</Button>
            </div>
            <Table dataSource={prepress} columns={ppColumns} rowKey="id" size="small" pagination={false} />
          </>
        )}
      </Col>

      {/* Right panel: SVG visualization */}
      <Col xs={24} lg={10}>
        <BOMLayerVisualization layers={layers} />

        {/* Summary */}
        <div style={{ marginTop: 12, padding: 12, background: '#fff', borderRadius: 6, border: '1px solid #E8E8E8' }}>
          <Row gutter={[8, 4]}>
            <Col span={12}><Text type="secondary">Total Thickness:</Text></Col>
            <Col span={12}><Text strong>{bomVersion?.total_thickness_micron || 0} μm</Text></Col>
            <Col span={12}><Text type="secondary">Total GSM:</Text></Col>
            <Col span={12}><Text strong>{bomVersion?.total_gsm ? parseFloat(bomVersion.total_gsm).toFixed(2) : '0'}</Text></Col>
            <Col span={12}><Text type="secondary">sqm/kg:</Text></Col>
            <Col span={12}><Text strong>{bomVersion?.total_gsm > 0 ? (1000 / parseFloat(bomVersion.total_gsm)).toFixed(2) : '—'}</Text></Col>
            <Col span={12}><Text type="secondary">Colors:</Text></Col>
            <Col span={12}><Text strong>{bomVersion?.num_colors || 0}</Text></Col>
            <Col span={12}><Text type="secondary">Lamination:</Text></Col>
            <Col span={12}><Text strong>{bomVersion?.has_lamination ? bomVersion.lamination_type || 'Yes' : 'No'}</Text></Col>
          </Row>
        </div>
      </Col>

      {/* ─── Layer Modal ─── */}
      <Modal
        title={layerModal.editing ? 'Edit Layer' : 'Add Layer'}
        open={layerModal.open}
        onOk={handleLayerSave}
        onCancel={() => { setLayerModal({ open: false, editing: null }); layerForm.resetFields(); }}
        width={700}
        okText={layerModal.editing ? 'Update' : 'Add'}
        destroyOnHidden
      >
        <Form form={layerForm} layout="vertical" size="small">
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="layer_type" label="Layer Type" rules={[{ required: true }]}>
                <Select options={LAYER_TYPES} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="layer_role" label="Layer Role">
                <Select options={LAYER_ROLES} allowClear placeholder="Optional" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="layer_order" label="Order">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="Auto" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="item_id" label="From Item Master">
                <Select
                  showSearch
                  allowClear
                  placeholder="Select item..."
                  optionFilterProp="label"
                  onChange={handleItemSelect}
                  options={(items || []).map(i => ({
                    value: i.id, label: `${i.item_code} — ${i.item_name}`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="material_name" label="Material Name">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="material_category" label="Category">
                <Input placeholder="PE, PET, PU..." />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="material_cat_desc" label="Category">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="material_type" label="Material Type">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          {/* Substrate-specific */}
          {(watchLayerType === 'substrate') && (
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item name="thickness_micron" label="Thickness (μm)" rules={[{ required: true }]}>
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="density_g_cm3" label="Density (g/cm³)" rules={[{ required: true }]}>
                  <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="waste_pct" label="Waste %" initialValue={3.0}>
                  <InputNumber min={0} max={50} step={0.5} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
          )}

          {/* Ink-specific */}
          {watchLayerType === 'ink' && (
            <>
              <Row gutter={12}>
                <Col span={6}>
                  <Form.Item name="solid_pct" label="Solids %" rules={[{ required: true }]}>
                    <InputNumber min={0} max={100} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item name="thickness_micron" label="Film Thickness (μm)" rules={[{ required: true }]}>
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item name="color_name" label="Color Name">
                    <Input placeholder="White, Cyan..." />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item name="color_hex" label="Color Hex">
                    <Input placeholder="#FFFFFF" maxLength={7} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item name="waste_pct" label="Waste %" initialValue={3.0}>
                    <InputNumber min={0} max={50} step={0.5} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}

          {/* Adhesive-specific */}
          {(watchLayerType === 'adhesive' || watchLayerType === 'coating') && (
            <Row gutter={12}>
              <Col span={6}>
                <Form.Item name="application_rate_gsm" label="App Rate (g/m²)">
                  <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="solid_pct" label="Solids %">
                  <InputNumber min={0} max={100} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="thickness_micron" label="Thickness (μm)">
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="waste_pct" label="Waste %" initialValue={3.0}>
                  <InputNumber min={0} max={50} step={0.5} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
          )}

          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="cost_per_kg" label="Cost/kg ($)">
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="notes" label="Notes">
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* ─── Accessory Modal ─── */}
      <Modal
        title={accModal.editing ? 'Edit Accessory' : 'Add Accessory'}
        destroyOnHidden
        onOk={async () => {
          try {
            const vals = await accForm.validateFields();
            await onAccessorySave(vals, accModal.editing);
            setAccModal({ open: false, editing: null }); accForm.resetFields();
          } catch (err) { if (!err.errorFields) message.error('Save failed'); }
        }}
        onCancel={() => { setAccModal({ open: false, editing: null }); accForm.resetFields(); }}
        width={550}
      >
        <Form form={accForm} layout="vertical" size="small">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="accessory_type" label="Type" rules={[{ required: true }]}>
                <Select options={ACCESSORY_TYPES} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="material_name" label="Material">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="weight_per_meter_g" label="g/meter">
                <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="cost_per_meter" label="$/meter">
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="cost_per_unit" label="$/unit">
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="unit_type" label="Unit Type">
                <Select allowClear options={[
                  { value: 'meter', label: 'Meter' }, { value: 'piece', label: 'Piece' },
                  { value: 'kg', label: 'KG' }, { value: 'pct', label: '%' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="waste_pct" label="Waste %" initialValue={2.0}>
                <InputNumber min={0} max={50} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="notes" label="Notes">
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* ─── PrePress Modal ─── */}
      <Modal
        title={ppModal.editing ? 'Edit Pre-Press' : 'Add Pre-Press'}
        destroyOnHidden
        onOk={async () => {
          try {
            const vals = await ppForm.validateFields();
            await onPrepressSave(vals, ppModal.editing);
            setPpModal({ open: false, editing: null }); ppForm.resetFields();
          } catch (err) { if (!err.errorFields) message.error('Save failed'); }
        }}
        onCancel={() => { setPpModal({ open: false, editing: null }); ppForm.resetFields(); }}
        width={550}
      >
        <Form form={ppForm} layout="vertical" size="small">
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="prepress_type" label="Type" rules={[{ required: true }]}>
                <Select options={PREPRESS_TYPES} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="num_items" label="Quantity" initialValue={1}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="cost_per_item" label="Cost/Item ($)" rules={[{ required: true }]}>
                <InputNumber min={0} step={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="amortization_method" label="Amortization" initialValue="per_kg">
                <Select options={AMORT_METHODS} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="amortization_qty" label="Amort. Qty (kg)">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="life_runs" label="Life Runs">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="repeat_distance_mm" label="Repeat Dist. (mm)">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="notes" label="Notes">
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Row>
  );
}
