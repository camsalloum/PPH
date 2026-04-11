/**
 * QC Template Admin — CRUD management for QC Inspection Templates (G-001).
 * Backend routes already exist: GET/POST/PATCH/DELETE /qc/templates
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  ExperimentOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const CATEGORY_OPTIONS = [
  { value: 'physical', label: 'Physical Properties' },
  { value: 'print',    label: 'Print Quality' },
  { value: 'seal',     label: 'Seal Integrity' },
  { value: 'optical',  label: 'Optical Properties' },
  { value: 'chemical', label: 'Chemical / Migration' },
];

const emptyParam = () => ({
  name: '', spec: '', unit: '', method: '',
  min_value: null, max_value: null, acceptance_formula: '',
});

// Phase 4.3: Hardcoded FP_PRESETS removed — all templates seeded in DB via migration 020.
// "Load from Template" dropdown in the drawer loads from existing DB templates.

export default function QCTemplateAdmin() {
  const { message } = App.useApp();

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);   // null = create, number = edit
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [productGroup, setProductGroup] = useState('');
  const [testCategory, setTestCategory] = useState('physical');
  const [notes, setNotes] = useState('');
  const [params, setParams] = useState([emptyParam()]);
  const [filterPG, setFilterPG] = useState(null);

  const headers = useMemo(() => {
    const token = localStorage.getItem('auth_token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const url = filterPG
        ? `${API_BASE}/api/mes/presales/qc/templates?product_group=${encodeURIComponent(filterPG)}`
        : `${API_BASE}/api/mes/presales/qc/templates`;
      const res = await axios.get(url, { headers });
      setTemplates(res.data?.data || []);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [headers, message, filterPG]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // Derive unique product groups from loaded templates for the filter dropdown
  const productGroupOptions = useMemo(() => {
    const pgs = new Set();
    templates.forEach((t) => {
      const pg = Array.isArray(t.product_groups) ? t.product_groups : (t.product_group ? [t.product_group] : []);
      pg.forEach((g) => { if (g) pgs.add(g); });
    });
    return [...pgs].sort().map((g) => ({ value: g, label: g }));
  }, [templates]);

  const openCreate = () => {
    setEditingId(null);
    setName('');
    setProductGroup('');
    setTestCategory('physical');
    setNotes('');
    setParams([emptyParam()]);
    setDrawerOpen(true);
  };

  const openEdit = (tpl) => {
    setEditingId(tpl.id);
    setName(tpl.name || '');
    const pgs = Array.isArray(tpl.product_groups) ? tpl.product_groups.join(', ') : (tpl.product_group || '');
    setProductGroup(pgs);
    setTestCategory(tpl.test_category || 'physical');
    setNotes(tpl.notes || '');
    const tplParams = tpl.test_parameters || tpl.parameters;
    setParams(
      Array.isArray(tplParams) && tplParams.length > 0
        ? tplParams.map((p) => ({
            name: p.name || '',
            spec: p.spec || '',
            unit: p.unit || '',
            method: p.method || '',
            min_value: p.min_value ?? null,
            max_value: p.max_value ?? null,
            acceptance_formula: p.acceptance_formula || '',
          }))
        : [emptyParam()],
    );
    setDrawerOpen(true);
  };

  const openClone = (tpl) => {
    openEdit({ ...tpl, id: undefined, name: `${tpl.name} (copy)` });
    setEditingId(null); // treat as new
  };

  const updateParam = (idx, key, value) => {
    setParams((prev) => prev.map((p, i) => (i === idx ? { ...p, [key]: value } : p)));
  };

  const addParam = () => setParams((prev) => [...prev, emptyParam()]);
  const removeParam = (idx) => setParams((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!name.trim()) { message.warning('Template name is required'); return; }
    if (params.filter((p) => p.name.trim()).length === 0) { message.warning('Add at least one parameter'); return; }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        product_group: productGroup.trim() || null,
        test_category: testCategory,
        notes: notes.trim() || null,
        parameters: params.filter((p) => p.name.trim()),
      };

      if (editingId) {
        await axios.patch(`${API_BASE}/api/mes/presales/qc/templates/${editingId}`, payload, { headers });
        message.success('Template updated');
      } else {
        await axios.post(`${API_BASE}/api/mes/presales/qc/templates`, payload, { headers });
        message.success('Template created');
      }
      setDrawerOpen(false);
      await loadTemplates();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (tpl) => {
    Modal.confirm({
      title: `Deactivate "${tpl.name}"?`,
      content: 'The template will be soft-deleted and no longer auto-load for new analyses.',
      okText: 'Deactivate',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await axios.delete(`${API_BASE}/api/mes/presales/qc/templates/${tpl.id}`, { headers });
          message.success('Template deactivated');
          await loadTemplates();
        } catch (err) {
          message.error('Failed to deactivate template');
        }
      },
    });
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', render: (v, row) => (
      <Button type="link" style={{ padding: 0 }} onClick={() => openEdit(row)}>{v}</Button>
    )},
    { title: 'Product Group', dataIndex: 'product_groups', render: (v, row) => {
      const pgs = Array.isArray(v) ? v : (row.product_group ? [row.product_group] : []);
      return pgs.length > 0 ? pgs.map((g) => <Tag key={g}>{g}</Tag>) : <Text type="secondary">Any</Text>;
    }},
    {
      title: 'Category',
      dataIndex: 'test_category',
      render: (v) => <Tag color="blue">{(v || '').toUpperCase()}</Tag>,
    },
    {
      title: 'Parameters',
      dataIndex: 'test_parameters',
      render: (v, row) => {
        const p = v || row.parameters;
        return Array.isArray(p) ? p.length : 0;
      },
    },
    {
      title: 'Active',
      dataIndex: 'is_active',
      render: (v) => v ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag>,
    },
    {
      title: 'Updated',
      dataIndex: 'updated_at',
      render: (v) => v ? dayjs(v).format('DD MMM, HH:mm') : '-',
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_, row) => (
        <Space size={4}>
          <Tooltip title="Edit"><Button type="text" icon={<EditOutlined />} onClick={() => openEdit(row)} /></Tooltip>
          <Tooltip title="Clone"><Button type="text" icon={<CopyOutlined />} onClick={() => openClone(row)} /></Tooltip>
          {row.is_active && (
            <Tooltip title="Deactivate"><Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(row)} /></Tooltip>
          )}
        </Space>
      ),
    },
  ];

  // Parameter editor columns (inside drawer)
  const paramColumns = [
    {
      title: 'Parameter Name',
      dataIndex: 'name',
      render: (_, row, idx) => <Input size="small" value={row.name} onChange={(e) => updateParam(idx, 'name', e.target.value)} placeholder="e.g. Thickness" />,
    },
    {
      title: 'Spec / Target',
      dataIndex: 'spec',
      render: (_, row, idx) => <Input size="small" value={row.spec} onChange={(e) => updateParam(idx, 'spec', e.target.value)} />,
    },
    {
      title: 'Unit',
      dataIndex: 'unit',
      width: 80,
      render: (_, row, idx) => <Input size="small" value={row.unit} onChange={(e) => updateParam(idx, 'unit', e.target.value)} placeholder="μm" />,
    },
    {
      title: 'Min',
      dataIndex: 'min_value',
      width: 80,
      render: (_, row, idx) => <InputNumber size="small" value={row.min_value} onChange={(v) => updateParam(idx, 'min_value', v)} style={{ width: '100%' }} />,
    },
    {
      title: 'Max',
      dataIndex: 'max_value',
      width: 80,
      render: (_, row, idx) => <InputNumber size="small" value={row.max_value} onChange={(v) => updateParam(idx, 'max_value', v)} style={{ width: '100%' }} />,
    },
    {
      title: 'Method',
      dataIndex: 'method',
      width: 100,
      render: (_, row, idx) => <Input size="small" value={row.method} onChange={(e) => updateParam(idx, 'method', e.target.value)} placeholder="ASTM D…" />,
    },
    {
      title: '',
      key: 'del',
      width: 40,
      render: (_, __, idx) => <Button type="text" danger size="small" onClick={() => removeParam(idx)}>×</Button>,
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}><ExperimentOutlined /> QC Inspection Templates</Title>
          <Text type="secondary">Manage test parameter templates for product groups</Text>
        </div>
        <Space>
          <Select
            placeholder="Filter by Product Group"
            allowClear
            style={{ width: 200 }}
            value={filterPG}
            onChange={(v) => setFilterPG(v || null)}
            options={productGroupOptions}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New Template</Button>
          <Button icon={<ReloadOutlined />} onClick={loadTemplates} loading={loading}>Refresh</Button>
        </Space>
      </Space>

      <Table
        loading={loading}
        rowKey="id"
        size="small"
        dataSource={templates}
        columns={columns}
        pagination={false}
        locale={{ emptyText: <Empty description="No templates yet" /> }}
      />

      {/* ── Template Editor Drawer ──────────────────────── */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editingId ? 'Edit Template' : 'Create Template'}
        width={720}
        extra={
          <Button type="primary" onClick={handleSave} loading={saving}>
            {editingId ? 'Update' : 'Create'}
          </Button>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Row gutter={12}>
            <Col span={12}>
              <Text strong>Template Name *</Text>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Flexible Packaging — Physical" style={{ marginTop: 4 }} />
            </Col>
            <Col span={12}>
              <Text strong>Product Group (auto-match)</Text>
              <Input value={productGroup} onChange={(e) => setProductGroup(e.target.value)} placeholder="e.g. 2L-SHRINK" style={{ marginTop: 4 }} />
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Text strong>Test Category</Text>
              <Select value={testCategory} onChange={setTestCategory} options={CATEGORY_OPTIONS} style={{ width: '100%', marginTop: 4 }} />
            </Col>
            <Col span={12}>
              <Text strong>Notes</Text>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} style={{ marginTop: 4 }} />
            </Col>
          </Row>

          <Card size="small" title="Test Parameters" extra={
            <Space size={4}>
              <Select
                placeholder="Load from Template"
                size="small"
                style={{ width: 200 }}
                allowClear
                showSearch
                onChange={(tplId) => {
                  const src = templates.find((t) => t.id === tplId);
                  const srcParams = src?.test_parameters || src?.parameters;
                  if (src && Array.isArray(srcParams)) {
                    setParams(srcParams.map((p) => ({
                      name: p.name || '', spec: p.spec || '', unit: p.unit || '',
                      method: p.method || '', min_value: p.min_value ?? null,
                      max_value: p.max_value ?? null, acceptance_formula: p.acceptance_formula || '',
                    })));
                    message.success(`Loaded ${srcParams.length} parameters from "${src.name}"`);
                  }
                }}
                options={templates.filter((t) => t.id !== editingId).map((t) => ({ value: t.id, label: t.name }))}
              />
              <Button size="small" icon={<PlusOutlined />} onClick={addParam}>Add</Button>
            </Space>
          }>
            <Table
              size="small"
              rowKey={(r) => `${r.name || 'param'}-${r.spec || ''}-${r.unit || ''}-${r.method || ''}`}
              dataSource={params}
              columns={paramColumns}
              pagination={false}
              locale={{ emptyText: 'No parameters' }}
              scroll={{ x: 600 }}
            />
          </Card>
        </Space>
      </Drawer>
    </div>
  );
}
