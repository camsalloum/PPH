/**
 * ParameterSchemaAdmin — Full CRUD admin for mes_parameter_definitions.
 * 3-panel layout: Category/Profile selector | Editable table | Live preview
 * Accessible via Admin button in Material Specs tab bar.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Modal, Table, Button, Input, InputNumber, Select, Switch, Space, Tag,
  Tooltip, Popconfirm, Row, Col, Divider, Typography, App, Spin,
  AutoComplete,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, CopyOutlined, InfoCircleOutlined,
  SettingOutlined, DownloadOutlined, ExpandOutlined, CompressOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../../contexts/AuthContext';

const { Text } = Typography;
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const api = (path) => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
const WRITE_ROLES = ['admin', 'production_manager', 'quality_control'];
const WIDTH_OPTIONS = [
  { label: '1/6 (4)', value: 4 },
  { label: '1/4 (6)', value: 6 },
  { label: '1/3 (8)', value: 8 },
  { label: '1/2 (12)', value: 12 },
  { label: 'Full (24)', value: 24 },
];
const TYPE_OPTIONS = ['number', 'text', 'json_array'];

export default function ParameterSchemaAdmin({ visible, onClose }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const canWrite = WRITE_ROLES.includes(user?.role);

  const [categoryMapping, setCategoryMapping] = useState([]);
  const [selectedClass, setSelectedClass] = useState('resins');
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [definitions, setDefinitions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copyModalVisible, setCopyModalVisible] = useState(false);
  const [copyTarget, setCopyTarget] = useState('');
  const [fullScreen, setFullScreen] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
    'Content-Type': 'application/json',
  }), []);

  // ── Fetch category mapping ───────────────────────────────────────────────
  const fetchMapping = useCallback(async () => {
    try {
      const res = await fetch(api('/api/mes/master-data/tds/category-mapping'), { headers });
      const json = await res.json();
      if (json.success) setCategoryMapping(json.data.filter(m => m.has_parameters));
    } catch { /* */ }
  }, [headers]);

  // ── Fetch definitions for selected class/profile ─────────────────────────
  const fetchDefs = useCallback(async () => {
    if (!selectedClass) return;
    setLoading(true);
    try {
      let url = `/api/mes/master-data/tds/parameter-definitions?material_class=${encodeURIComponent(selectedClass)}`;
      if (selectedProfile) url += `&profile=${encodeURIComponent(selectedProfile)}`;
      const res = await fetch(api(url), { headers });
      const json = await res.json();
      if (json.success) setDefinitions(json.data || []);
    } catch { /* */ }
    setLoading(false);
  }, [selectedClass, selectedProfile, headers]);

  useEffect(() => { if (visible) { fetchMapping(); } }, [visible, fetchMapping]);
  useEffect(() => { if (visible && selectedClass) fetchDefs(); }, [visible, selectedClass, selectedProfile, fetchDefs]);

  // ── Deduplicated categories (one per material_class) ──────────────────────
  const uniqueCategories = useMemo(() => {
    const classMap = new Map();
    categoryMapping.forEach(m => {
      if (classMap.has(m.material_class)) {
        const existing = classMap.get(m.material_class);
        existing.item_count += (m.item_count || 0);
        // Prefer the display_label with more items
        if ((m.item_count || 0) > (existing._max_count || 0)) {
          existing.display_label = m.display_label;
          existing._max_count = m.item_count || 0;
        }
      } else {
        classMap.set(m.material_class, { ...m, item_count: m.item_count || 0, _max_count: m.item_count || 0 });
      }
    });
    return [...classMap.values()];
  }, [categoryMapping]);

  const selectedCategoryLabel = useMemo(() => {
    const m = uniqueCategories.find(c => c.material_class === selectedClass);
    return m?.display_label || selectedClass;
  }, [uniqueCategories, selectedClass]);
  // ── All unique groups for autocomplete ───────────────────────────────────
  const allGroups = useMemo(() => {
    const seen = new Set();
    definitions.forEach(d => d.display_group && seen.add(d.display_group));
    return [...seen].map(g => ({ value: g }));
  }, [definitions]);

  // ── Filtered definitions for current class/profile ───────────────────────
  const filteredDefs = useMemo(() => {
    return definitions
      .filter(d => {
        if (selectedProfile) return d.profile === selectedProfile;
        if (selectedClass === 'substrates') return !d.profile; // base substrates
        return d.material_class === selectedClass && !d.profile;
      })
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [definitions, selectedClass, selectedProfile]);

  // ── Save a field change ──────────────────────────────────────────────────
  const saveField = useCallback(async (id, field, value) => {
    if (!canWrite) return;
    setSaving(true);
    try {
      const res = await fetch(api(`/api/mes/master-data/tds/parameter-definitions/${id}`), {
        method: 'PUT', headers, body: JSON.stringify({ [field]: value }),
      });
      const json = await res.json();
      if (json.success) {
        setDefinitions(prev => prev.map(d => d.id === id ? { ...d, ...json.data } : d));
      } else {
        message.error(json.error || 'Save failed');
      }
    } catch { message.error('Save failed'); }
    setSaving(false);
  }, [canWrite, headers, message]);

  // ── Add new parameter ────────────────────────────────────────────────────
  const addParameter = useCallback(async () => {
    if (!canWrite) return;
    const nextOrder = filteredDefs.length ? Math.max(...filteredDefs.map(d => d.sort_order || 0)) + 1 : 1;
    const body = {
      material_class: selectedClass,
      profile: selectedProfile || null,
      label: 'New Parameter',
      field_type: 'number',
      sort_order: nextOrder,
      display_width: 4,
    };
    setSaving(true);
    try {
      const res = await fetch(api('/api/mes/master-data/tds/parameter-definitions'), {
        method: 'POST', headers, body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setDefinitions(prev => [...prev, json.data]);
        message.success('Parameter added — edit the details below');
      } else {
        message.error(json.error || 'Failed to add');
      }
    } catch { message.error('Failed to add'); }
    setSaving(false);
  }, [canWrite, selectedClass, selectedProfile, filteredDefs, headers, message]);

  // ── Delete parameter ─────────────────────────────────────────────────────
  const deleteParameter = useCallback(async (id) => {
    if (!canWrite) return;
    setSaving(true);
    try {
      const res = await fetch(api(`/api/mes/master-data/tds/parameter-definitions/${id}`), { method: 'DELETE', headers });
      const json = await res.json();
      if (json.success) {
        setDefinitions(prev => prev.filter(d => d.id !== id));
        if (json.affected_specs > 0) message.warning(`Deleted. ${json.affected_specs} specs had data for this field.`);
        else message.success('Deleted');
      } else {
        message.error(json.error || 'Delete failed');
      }
    } catch { message.error('Delete failed'); }
    setSaving(false);
  }, [canWrite, headers, message]);

  // ── Copy profile ─────────────────────────────────────────────────────────
  const copyProfile = useCallback(async () => {
    if (!copyTarget.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(api('/api/mes/master-data/tds/parameter-definitions/copy-profile'), {
        method: 'POST', headers,
        body: JSON.stringify({
          source_material_class: selectedClass,
          source_profile: selectedProfile || null,
          target_material_class: selectedClass,
          target_profile: copyTarget.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        message.success(`Copied ${json.copied} definitions to ${copyTarget}`);
        setCopyModalVisible(false);
        setCopyTarget('');
        fetchDefs();
      } else {
        message.error(json.error || 'Copy failed');
      }
    } catch { message.error('Copy failed'); }
    setSaving(false);
  }, [copyTarget, selectedClass, selectedProfile, headers, message, fetchDefs]);

  // ── Export current profile JSON ───────────────────────────────────────────
  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(filteredDefs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `params_${selectedClass}${selectedProfile ? '_' + selectedProfile : ''}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredDefs, selectedClass, selectedProfile]);

  // ── Export ALL categories as one JSON ───────────────────────────────────
  const exportAllCategories = useCallback(async () => {
    try {
      const res = await fetch(api('/api/mes/master-data/tds/parameter-definitions'), { headers });
      const json = await res.json();
      if (!json.success || !json.data?.length) { message.warning('No definitions to export'); return; }

      // Group by material_class + profile
      const grouped = {};
      json.data.forEach(d => {
        const catLabel = uniqueCategories.find(c => c.material_class === d.material_class)?.display_label || d.material_class;
        const profileLabel = d.profile ? d.profile.replace(/^substrates_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null;
        const key = d.material_class + '|' + (d.profile || '');
        if (!grouped[key]) {
          grouped[key] = {
            category: catLabel,
            material_class: d.material_class,
            item_group: profileLabel,
            profile: d.profile,
            parameters: [],
          };
        }
        grouped[key].parameters.push({
          field_key: d.field_key,
          label: d.label,
          unit: d.unit,
          field_type: d.field_type,
          min_value: d.min_value,
          max_value: d.max_value,
          step: d.step,
          is_required: d.is_required,
          display_width: d.display_width,
          display_group: d.display_group,
          has_test_method: d.has_test_method,
          test_method_options: d.test_method_options,
          sort_order: d.sort_order,
        });
      });

      const exportData = {
        exported_at: new Date().toISOString(),
        total_definitions: json.data.length,
        categories: Object.values(grouped),
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `all_parameter_definitions_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(`Exported ${json.data.length} definitions across ${Object.keys(grouped).length} categories`);
    } catch { message.error('Export failed'); }
  }, [headers, message, uniqueCategories]);

  // ── Inline edit cell ─────────────────────────────────────────────────────
  const EditCell = ({ id, field, value, type = 'text', options, min, max, step }) => {
    const [val, setVal] = useState(value);
    const commit = () => { if (val !== value) saveField(id, field, val); };
    if (type === 'select') return (
      <Select size="small" value={val} style={{ width: '100%' }}
        onChange={v => { setVal(v); saveField(id, field, v); }}
        options={options} />
    );
    if (type === 'number') return (
      <InputNumber size="small" value={val} style={{ width: '100%' }}
        min={min} max={max} step={step}
        onChange={v => setVal(v)} onBlur={commit} onPressEnter={commit} />
    );
    if (type === 'switch') return (
      <Switch size="small" checked={!!val}
        onChange={v => { setVal(v); saveField(id, field, v); }} />
    );
    if (type === 'autocomplete') return (
      <AutoComplete size="small" value={val} style={{ width: '100%' }}
        options={options}
        onChange={v => setVal(v)} onBlur={commit} onSelect={v => { setVal(v); saveField(id, field, v); }} />
    );
    return (
      <Input size="small" value={val}
        onChange={e => setVal(e.target.value)} onBlur={commit} onPressEnter={commit} />
    );
  };

  // ── Table columns ────────────────────────────────────────────────────────
  const columns = [
    { title: '#', dataIndex: 'sort_order', width: 32, align: 'center',
      render: (v) => <Text type="secondary" style={{ fontSize: 10 }}>{v}</Text> },
    { title: 'Field Key', dataIndex: 'field_key', width: 130, ellipsis: true,
      render: (v) => <Text code style={{ fontSize: 10 }}>{v}</Text> },
    { title: 'Label', dataIndex: 'label', width: 140,
      render: (v, r) => canWrite ? <EditCell id={r.id} field="label" value={v} /> : v },
    { title: 'Unit', dataIndex: 'unit', width: 60,
      render: (v, r) => canWrite ? <EditCell id={r.id} field="unit" value={v || ''} /> : (v || '-') },
    { title: 'Type', dataIndex: 'field_type', width: 75,
      render: (v, r) => canWrite
        ? <EditCell id={r.id} field="field_type" value={v} type="select" options={TYPE_OPTIONS.map(t => ({ label: t, value: t }))} />
        : v },
    { title: 'Min', dataIndex: 'min_value', width: 60, align: 'right',
      render: (v, r) => canWrite ? <EditCell id={r.id} field="min_value" value={v} type="number" step={0.01} /> : (v ?? '-') },
    { title: 'Max', dataIndex: 'max_value', width: 60, align: 'right',
      render: (v, r) => canWrite ? <EditCell id={r.id} field="max_value" value={v} type="number" step={0.01} /> : (v ?? '-') },
    { title: 'Req', dataIndex: 'is_required', width: 40, align: 'center',
      render: (v, r) => canWrite ? <EditCell id={r.id} field="is_required" value={v} type="switch" /> : (v ? '✓' : '') },
    { title: 'W', dataIndex: 'display_width', width: 65,
      render: (v, r) => canWrite
        ? <EditCell id={r.id} field="display_width" value={v || 4} type="select" options={WIDTH_OPTIONS} />
        : v },
    { title: 'Group', dataIndex: 'display_group', width: 110, ellipsis: true,
      render: (v, r) => canWrite
        ? <EditCell id={r.id} field="display_group" value={v || ''} type="autocomplete" options={allGroups} />
        : (v || '-') },
    { title: 'TM', dataIndex: 'has_test_method', width: 40, align: 'center',
      render: (v, r) => canWrite ? <EditCell id={r.id} field="has_test_method" value={v} type="switch" /> : (v ? '✓' : '') },
    { title: 'Type', dataIndex: 'param_type', width: 65,
      render: (v, r) => canWrite
        ? <EditCell id={r.id} field="param_type" value={v || 'input'} type="select" options={[{label:'input',value:'input'},{label:'calc',value:'calculated'}]} />
        : (v || 'input') },
    { title: 'Test Conditions', dataIndex: 'test_conditions', width: 140, ellipsis: true,
      render: (v, r) => canWrite ? <EditCell id={r.id} field="test_conditions" value={v || ''} /> : (v || '-') },
    ...(canWrite ? [{
      title: '', width: 32, align: 'center',
      render: (_, r) => (
        <Popconfirm title="Delete?" onConfirm={() => deleteParameter(r.id)} okText="Yes" okType="danger">
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    }] : []),
  ];

  // ── Interactive Preview/Designer modal ──────────────────────────────────
  const [previewSelectedField, setPreviewSelectedField] = useState(null);

  const handlePreviewWidthChange = useCallback((fieldKey, newWidth) => {
    const def = filteredDefs.find(d => d.field_key === fieldKey);
    if (def) saveField(def.id, 'display_width', newWidth);
    setPreviewSelectedField(fieldKey);
  }, [filteredDefs, saveField]);

  const handlePreviewGroupChange = useCallback((fieldKey, newGroup) => {
    const def = filteredDefs.find(d => d.field_key === fieldKey);
    if (def) saveField(def.id, 'display_group', newGroup);
  }, [filteredDefs, saveField]);

  const handlePreviewMoveField = useCallback((fieldKey, direction) => {
    const idx = filteredDefs.findIndex(d => d.field_key === fieldKey);
    if (idx < 0) return;
    const swapIdx = (direction === 'up' || direction === 'left') ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= filteredDefs.length) return;
    const order = filteredDefs.map((d, i) => ({ id: d.id, sort_order: i + 1 }));
    // Swap
    const tmp = order[idx].sort_order;
    order[idx].sort_order = order[swapIdx].sort_order;
    order[swapIdx].sort_order = tmp;
    // Save reorder
    fetch(api('/api/mes/master-data/tds/parameter-definitions/reorder'), {
      method: 'PUT', headers, body: JSON.stringify({ order }),
    }).then(r => r.json()).then(json => {
      if (json.success) fetchDefs();
    });
  }, [filteredDefs, headers, fetchDefs]);

  const renderPreviewModal = () => {
    const groups = {};
    filteredDefs.forEach(d => {
      const g = d.display_group || 'General';
      if (!groups[g]) groups[g] = [];
      groups[g].push(d);
    });
    const selectedDef = previewSelectedField ? filteredDefs.find(d => d.field_key === previewSelectedField) : null;

    return (
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 24 }}>
            <span>Form Designer: {selectedCategoryLabel}{selectedProfile ? ' — ' + selectedProfile.replace(/^substrates_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''} ({filteredDefs.length} fields)</span>
            <Text type="secondary" style={{ fontSize: 11 }}>Click a field to select it. Use controls below to adjust.</Text>
          </div>
        }
        open={previewVisible}
        onCancel={() => { setPreviewVisible(false); setPreviewSelectedField(null); }}
        width="100vw"
        style={{ top: 0, margin: 0, maxWidth: '100vw', height: '100vh' }}
        styles={{ body: { height: 'calc(100vh - 55px)', overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' } }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 11 }}>All changes auto-save to database.</Text>
            <Button type="primary" onClick={() => { setPreviewVisible(false); setPreviewSelectedField(null); fetchDefs(); }}>
              Save &amp; Close
            </Button>
          </div>
        }
      >
        {/* Toolbar for selected field */}
        <div style={{ padding: '6px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 12, minHeight: 40, flexShrink: 0 }}>
          {selectedDef ? (
            <>
              <Tag color="blue">{selectedDef.label}</Tag>
              <Text type="secondary" style={{ fontSize: 11 }}>Width:</Text>
              <Select size="small" value={selectedDef.display_width || 4} style={{ width: 100 }}
                options={WIDTH_OPTIONS}
                onChange={v => handlePreviewWidthChange(selectedDef.field_key, v)} />
              <Text type="secondary" style={{ fontSize: 11 }}>Group:</Text>
              <AutoComplete size="small" value={selectedDef.display_group || ''} style={{ width: 140 }}
                options={allGroups}
                onChange={v => handlePreviewGroupChange(selectedDef.field_key, v)}
                onBlur={() => {}} />
              <Space size={4}>
                <Button size="small" onClick={() => handlePreviewMoveField(selectedDef.field_key, 'left')}
                  disabled={filteredDefs.indexOf(selectedDef) === 0}>← Left</Button>
                <Button size="small" onClick={() => handlePreviewMoveField(selectedDef.field_key, 'right')}
                  disabled={filteredDefs.indexOf(selectedDef) === filteredDefs.length - 1}>Right →</Button>
                <Button size="small" onClick={() => handlePreviewMoveField(selectedDef.field_key, 'up')}
                  disabled={filteredDefs.indexOf(selectedDef) === 0}>↑</Button>
                <Button size="small" onClick={() => handlePreviewMoveField(selectedDef.field_key, 'down')}
                  disabled={filteredDefs.indexOf(selectedDef) === filteredDefs.length - 1}>↓</Button>
              </Space>
              <Text type="secondary" style={{ fontSize: 10 }}>
                {selectedDef.field_key} • {selectedDef.field_type} • {selectedDef.unit || '-'}
                {selectedDef.min_value != null ? ` • min: ${selectedDef.min_value}` : ''}
                {selectedDef.max_value != null ? ` • max: ${selectedDef.max_value}` : ''}
              </Text>
            </>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>Click any field below to select it and adjust width, group, or order.</Text>
          )}
        </div>

        {/* Form preview area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
          {Object.entries(groups).map(([groupName, fields]) => (
            <div key={groupName}>
              <Divider orientation="left" style={{ fontSize: 13, fontWeight: 600, margin: '16px 0 10px' }}>{groupName}</Divider>
              <Row gutter={[12, 10]}>
                {fields.map(def => {
                  const isSelected = previewSelectedField === def.field_key;
                  return (
                    <Col key={def.field_key} span={def.display_width || 4}>
                      <div
                        onClick={() => setPreviewSelectedField(def.field_key)}
                        style={{
                          padding: '6px 8px',
                          borderRadius: 6,
                          border: isSelected ? '2px solid #7c3aed' : '1px solid transparent',
                          background: isSelected ? '#f5f3ff' : 'transparent',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        <label style={{ fontSize: 12, color: '#374151', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                          {def.label}
                          {def.unit && def.unit !== '-' && <span style={{ color: '#9ca3af', fontSize: 11 }}>({def.unit})</span>}
                          {def.is_required && <span style={{ color: '#ef4444' }}>*</span>}
                          {def.help_text && <Tooltip title={def.help_text}><InfoCircleOutlined style={{ fontSize: 11, color: '#9ca3af' }} /></Tooltip>}
                        </label>
                        {def.field_type === 'number' ? (
                          <InputNumber
                            style={{ width: '100%' }}
                            size="small"
                            step={def.step ? Number(def.step) : 0.01}
                            placeholder={def.placeholder || `${def.min_value ?? ''} — ${def.max_value ?? ''}`}
                            disabled
                          />
                        ) : (
                          <Input size="small" placeholder={def.placeholder || def.label} disabled />
                        )}
                        {def.has_test_method && (
                          <div style={{ marginTop: 3 }}>
                            {def.test_method_options?.length ? (
                              <Select size="small" style={{ width: '100%' }} placeholder="Test method"
                                options={def.test_method_options.map(m => ({ label: m, value: m }))} disabled />
                            ) : (
                              <Input size="small" placeholder="Test method" disabled />
                            )}
                          </div>
                        )}
                        {isSelected && (
                          <div style={{ fontSize: 9, color: '#7c3aed', marginTop: 2 }}>
                            {def.field_key} • span {def.display_width || 4}/24
                          </div>
                        )}
                      </div>
                    </Col>
                  );
                })}
              </Row>
            </div>
          ))}
          {!filteredDefs.length && <Text type="secondary">No parameters defined for this category.</Text>}
        </div>
      </Modal>
    );
  };

  if (!WRITE_ROLES.includes(user?.role)) return (
    <Modal open={visible} onCancel={onClose} footer={null} title="Parameter Schema Admin">
      <p>You do not have permission to access this panel.</p>
    </Modal>
  );

  return (
    <>
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 24 }}>
            <span><SettingOutlined /> Parameter Schema Admin</span>
            <Button type="text" size="small" icon={fullScreen ? <CompressOutlined /> : <ExpandOutlined />}
              onClick={() => setFullScreen(f => !f)}>{fullScreen ? 'Restore' : 'Full Screen'}</Button>
          </div>
        }
        open={visible}
        onCancel={onClose}
        width={fullScreen ? '100vw' : '90vw'}
        style={{ top: fullScreen ? 0 : 20, maxWidth: fullScreen ? '100vw' : undefined, paddingBottom: 0, ...(fullScreen ? { margin: 0, maxHeight: '100vh', height: '100vh' } : {}) }}
        styles={{ body: { padding: fullScreen ? '8px' : undefined, height: fullScreen ? 'calc(100vh - 55px)' : undefined, overflow: 'hidden' } }}
        footer={null}
        destroyOnHidden
      >
        <div style={{ display: 'flex', gap: 8, height: fullScreen ? 'calc(100vh - 80px)' : 'calc(100vh - 160px)' }}>

          {/* ── Left: Category/Profile selector ── */}
          <div style={{ width: 140, flexShrink: 0, borderRight: '1px solid #e2e8f0', paddingRight: 8, overflowY: 'auto' }}>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Category</Text>
            {uniqueCategories.map(m => (
                <div key={m.material_class}>
                  <Button
                    type={selectedClass === m.material_class && !selectedProfile ? 'primary' : 'text'}
                    size="small"
                    style={{ width: '100%', textAlign: 'left', marginBottom: 2, fontWeight: selectedClass === m.material_class ? 600 : 400 }}
                    onClick={() => { setSelectedClass(m.material_class); setSelectedProfile(null); }}
                  >
                    {m.display_label}
                    <Text type="secondary" style={{ fontSize: 10, marginLeft: 4 }}>({m.item_count})</Text>
                  </Button>
                  {m.material_class === selectedClass && (
                    <div style={{ paddingLeft: 16, marginBottom: 4 }}>
                      {[...new Set(definitions.filter(d => d.profile).map(d => d.profile))].map(p => {
                        const profileLabel = p
                          .replace(/^substrates_/, '')
                          .replace(/_/g, ' ')
                          .replace(/\b\w/g, c => c.toUpperCase());
                        return (
                          <Button
                            key={p}
                            type={selectedProfile === p ? 'primary' : 'text'}
                            size="small"
                            style={{ width: '100%', textAlign: 'left', marginBottom: 1, fontSize: 11, paddingLeft: 8 }}
                            onClick={() => setSelectedProfile(p)}
                          >
                            {profileLabel}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
          </div>

          {/* ── Center: Editable table ── */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <Text strong>{selectedCategoryLabel}</Text>
                {selectedProfile && <Tag color="blue" style={{ marginLeft: 6 }}>{selectedProfile.replace(/^substrates_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Tag>}
                <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>{filteredDefs.length} parameters</Text>
              </div>
              <Space size="small">
                {canWrite && (
                  <Button size="small" icon={<PlusOutlined />} type="primary" onClick={addParameter} loading={saving}>
                    Add Parameter
                  </Button>
                )}
                <Button size="small" icon={<CopyOutlined />} onClick={() => setCopyModalVisible(true)}>Copy Profile</Button>
                <Button size="small" icon={<DownloadOutlined />} onClick={exportJson}>Export</Button>
                <Button size="small" icon={<DownloadOutlined />} onClick={exportAllCategories}>Export All</Button>
                <Button size="small" icon={<ExpandOutlined />} onClick={() => setPreviewVisible(true)}>Preview</Button>
              </Space>
            </div>
            <Spin spinning={loading}>
              <Table
                dataSource={filteredDefs}
                columns={columns}
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ y: fullScreen ? 'calc(100vh - 180px)' : 'calc(100vh - 280px)', x: 'max-content' }}
              />
            </Spin>
          </div>
        </div>
      </Modal>

      {renderPreviewModal()}

      {/* Copy profile modal */}
      <Modal
        title="Copy Profile"
        open={copyModalVisible}
        onCancel={() => setCopyModalVisible(false)}
        onOk={copyProfile}
        confirmLoading={saving}
        okText="Copy"
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Copy all {filteredDefs.length} parameters from <strong>{selectedProfile || selectedClass}</strong> to a new profile:
        </Text>
        <Input
          placeholder="New profile key (e.g. substrates_new_substrate)"
          value={copyTarget}
          onChange={e => setCopyTarget(e.target.value)}
        />
      </Modal>
    </>
  );
}
