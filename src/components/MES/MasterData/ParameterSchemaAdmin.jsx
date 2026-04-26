/**
 * ParameterSchemaAdmin — Full CRUD admin for mes_parameter_definitions.
 * 3-panel layout: Category/Profile selector | Editable table | Live preview
 * Accessible via Admin button in Material Specs tab bar.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Modal, Table, Button, Input, InputNumber, Select, Switch, Space, Tag,
  Tooltip, Popconfirm, Row, Col, Divider, Typography, App, Spin,
  AutoComplete, Badge,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, CopyOutlined, InfoCircleOutlined,
  SettingOutlined, DownloadOutlined, ExpandOutlined, CompressOutlined,
  WarningOutlined, AuditOutlined, EditOutlined, CheckOutlined,
  EyeOutlined, ArrowUpOutlined, ArrowDownOutlined, UploadOutlined,
  ExperimentOutlined, RollbackOutlined, BugOutlined, HolderOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../../contexts/AuthContext';

const { Text } = Typography;
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const api = (path) => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
const ADMIN_ROLES = ['admin', 'it_admin'];
const WIDTH_OPTIONS = [
  { label: '1/6 (4)', value: 4 },
  { label: '1/4 (6)', value: 6 },
  { label: '1/3 (8)', value: 8 },
  { label: '1/2 (12)', value: 12 },
  { label: 'Full (24)', value: 24 },
];
// User-friendly labels for field types. Internal value stays the same.
const TYPE_OPTIONS = [
  { value: 'number', label: 'Number', description: 'A numeric measurement (e.g. 23.5, 1.250)' },
  { value: 'text', label: 'Text / Choice', description: 'Free text or a fixed list of choices (configure choices below)' },
  { value: 'json', label: 'Composition (key-value)', description: 'A breakdown of components, e.g. PE 70% / EVA 30%' },
  { value: 'json_array', label: 'List of rows', description: 'Multiple structured rows, e.g. several test runs' },
];
const TYPE_LABEL = (v) => (TYPE_OPTIONS.find(t => t.value === v)?.label) || v;
const NUMERIC_TYPES = new Set(['number']);

export default function ParameterSchemaAdmin({ visible, onClose }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const isAdmin = ADMIN_ROLES.includes(user?.role);
  const canWrite = isAdmin;

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

  // Phase 8/9 — Categories & Audit modal
  const [catsModalVisible, setCatsModalVisible] = useState(false);
  const [unmapped, setUnmapped] = useState([]);
  const [auditRows, setAuditRows] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditFilter, setAuditFilter] = useState({ action: null, actor_email: '', entity_type: 'parameter_definition' });
  const [auditPage, setAuditPage] = useState(1);
  const AUDIT_PAGE_SIZE = 15;
  const [allMappings, setAllMappings] = useState([]);
  const [catsLoading, setCatsLoading] = useState(false);
  const [newCat, setNewCat] = useState({ oracle_category: '', material_class: '', display_label: '' });

  // Phase 10 — Bulk edit / Where-used / Lint / Import
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [bulkModalVisible, setBulkModalVisible] = useState(false);
  const [bulkUpdates, setBulkUpdates] = useState({});
  const [usageModalVisible, setUsageModalVisible] = useState(false);
  const [usageData, setUsageData] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [lintModalVisible, setLintModalVisible] = useState(false);
  const [lintIssues, setLintIssues] = useState([]);
  const [lintLoading, setLintLoading] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importRaw, setImportRaw] = useState(null);
  const [importPlan, setImportPlan] = useState(null);
  const [importMode, setImportMode] = useState('merge');
  const [importing, setImporting] = useState(false);

  // UI: Field Key column hidden by default — toggle to reveal
  const [showFieldKey, setShowFieldKey] = useState(false);

  // Choices editor (popover for enum_options)
  const [choicesEditor, setChoicesEditor] = useState(null); // { id, label, options: string[] }

  // Add Parameter wizard
  const [addWizard, setAddWizard] = useState(null); // { label, field_type, unit, group }

  // Drag-and-drop reorder state
  const [draggableRowKey, setDraggableRowKey] = useState(null); // id of row that is currently draggable
  const [dragOverKey, setDragOverKey] = useState(null);

  // Bulk wizard preview toggle
  const [bulkPreviewOpen, setBulkPreviewOpen] = useState(false);

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

  // ── Per-row lint issues (client-side, fast feedback) ─────────────────────
  const rowIssues = useMemo(() => {
    const labelCounts = new Map();
    const keyCounts = new Map();
    definitions.forEach(d => {
      if (d.label) {
        const k = d.label.trim().toLowerCase();
        labelCounts.set(k, (labelCounts.get(k) || 0) + 1);
      }
      if (d.field_key) keyCounts.set(d.field_key, (keyCounts.get(d.field_key) || 0) + 1);
    });
    const map = new Map();
    definitions.forEach(d => {
      const issues = [];
      if (!d.label || !d.label.trim()) issues.push({ level: 'error', text: 'Missing label' });
      else if ((labelCounts.get(d.label.trim().toLowerCase()) || 0) > 1) issues.push({ level: 'warn', text: `Duplicate label "${d.label}"` });
      if (d.field_key && (keyCounts.get(d.field_key) || 0) > 1) issues.push({ level: 'error', text: `Duplicate field key "${d.field_key}"` });
      if (d.field_type === 'number') {
        if (!d.unit) issues.push({ level: 'warn', text: 'Number field missing unit' });
        if (d.min_value != null && d.max_value != null && Number(d.min_value) > Number(d.max_value)) {
          issues.push({ level: 'error', text: 'Min greater than Max' });
        }
      }
      if (d.field_type === 'text' && Array.isArray(d.enum_options)) {
        const cleaned = d.enum_options.map(s => String(s).trim()).filter(Boolean);
        if (cleaned.length !== new Set(cleaned).size) issues.push({ level: 'warn', text: 'Duplicate choices' });
      }
      if (!d.display_group) issues.push({ level: 'info', text: 'No group assigned' });
      if (issues.length) map.set(d.id, issues);
    });
    return map;
  }, [definitions]);

  // ── Lint summary across the current view ────────────────────────────────
  const lintSummary = useMemo(() => {
    let errors = 0, warns = 0, infos = 0;
    filteredDefs.forEach(d => {
      const issues = rowIssues.get(d.id) || [];
      issues.forEach(i => {
        if (i.level === 'error') errors++;
        else if (i.level === 'warn') warns++;
        else infos++;
      });
    });
    return { errors, warns, infos };
  }, [filteredDefs, rowIssues]);

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
    if (type === 'tags') return (
      <Select size="small" mode="tags" value={Array.isArray(val) ? val : []} style={{ width: '100%' }}
        tokenSeparators={[',']}
        onChange={v => { setVal(v); saveField(id, field, v); }} />
    );
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

  // ── Smart Group cell: prevents typo duplicates by case-insensitive merge ─
  const SmartGroupCell = ({ value, options, onSave }) => {
    const [val, setVal] = useState(value || '');
    useEffect(() => { setVal(value || ''); }, [value]);
    const commit = (raw) => {
      const trimmed = (raw == null ? val : raw).trim();
      if (trimmed === (value || '').trim()) return;
      if (!trimmed) { onSave(null); return; }
      // Look for case-insensitive existing match
      const lower = trimmed.toLowerCase();
      const existing = (options || []).map(o => o.value).find(v => v.toLowerCase() === lower);
      if (existing && existing !== trimmed) {
        Modal.confirm({
          title: 'Merge with existing group?',
          content: (
            <div>
              <p>You typed <strong>"{trimmed}"</strong> but a group named <strong>"{existing}"</strong> already exists.</p>
              <p>Use the existing one to avoid typo duplicates?</p>
            </div>
          ),
          okText: `Use "${existing}"`,
          cancelText: `Keep "${trimmed}" as new`,
          onOk: () => { setVal(existing); onSave(existing); },
          onCancel: () => onSave(trimmed),
        });
        return;
      }
      onSave(trimmed);
    };
    return (
      <AutoComplete
        size="small"
        value={val}
        options={options}
        style={{ width: '100%' }}
        onChange={v => setVal(v || '')}
        onBlur={() => commit()}
        onSelect={v => { setVal(v); commit(v); }}
        placeholder="(no group)"
        allowClear
      />
    );
  };

  // ── Drag-and-drop reorder ────────────────────────────────────────────────
  const reorderByDrag = useCallback((fromId, toId) => {
    if (!fromId || fromId === toId) return;
    const fromIdx = filteredDefs.findIndex(d => d.id === fromId);
    const toIdx = filteredDefs.findIndex(d => d.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...filteredDefs];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    const order = next.map((d, i) => ({ id: d.id, sort_order: i + 1 }));
    fetch(api('/api/mes/master-data/tds/parameter-definitions/reorder'), {
      method: 'PUT', headers, body: JSON.stringify({ order }),
    }).then(r => r.json()).then(json => {
      if (json.success) fetchDefs(); else message.error(json.error || 'Reorder failed');
    });
  }, [filteredDefs, headers, fetchDefs, message]);

  const DraggableRow = (props) => {
    const key = props['data-row-key'];
    const isDragging = draggableRowKey === key;
    const isOver = dragOverKey === key && draggableRowKey != null && draggableRowKey !== key;
    return (
      <tr
        {...props}
        draggable={isDragging}
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; }}
        onDragOver={(e) => {
          if (draggableRowKey == null) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (dragOverKey !== key) setDragOverKey(key);
        }}
        onDragLeave={() => { if (dragOverKey === key) setDragOverKey(null); }}
        onDrop={(e) => {
          e.preventDefault();
          reorderByDrag(draggableRowKey, key);
          setDraggableRowKey(null);
          setDragOverKey(null);
        }}
        onDragEnd={() => { setDraggableRowKey(null); setDragOverKey(null); }}
        style={{
          ...(props.style || {}),
          opacity: isDragging ? 0.4 : 1,
          borderTop: isOver ? '2px solid #7c3aed' : undefined,
          background: isOver ? '#f5f3ff' : props.style?.background,
        }}
      />
    );
  };

  // ── Table columns ────────────────────────────────────────────────────────
  const columns = [
    {
      title: (
        <Tooltip title="Drag rows to reorder. Order persists immediately.">
          <HolderOutlined style={{ color: '#9ca3af' }} />
        </Tooltip>
      ),
      dataIndex: 'sort_order', width: 44, align: 'center',
      render: (v, r) => canWrite ? (
        <span
          className="row-drag-handle"
          onMouseDown={() => setDraggableRowKey(r.id)}
          onMouseUp={() => setDraggableRowKey(null)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'grab', userSelect: 'none' }}
          title="Drag to reorder"
        >
          <HolderOutlined style={{ color: '#94a3b8', fontSize: 12 }} />
          <Text type="secondary" style={{ fontSize: 10 }}>{v}</Text>
        </span>
      ) : <Text type="secondary" style={{ fontSize: 10 }}>{v}</Text>,
    },
    ...(showFieldKey ? [{
      title: (
        <Tooltip title="Internal JSON key used by the database & parsers. Auto-generated from Label; rarely needs editing.">
          Field Key
        </Tooltip>
      ),
      dataIndex: 'field_key', width: 150, ellipsis: true,
      render: (v) => <Text code style={{ fontSize: 10 }} copyable={{ tooltips: ['Copy', 'Copied'] }}>{v}</Text>,
    }] : []),
    { title: 'Label', dataIndex: 'label', width: 220, align: 'left',
      render: (v, r) => canWrite ? <EditCell id={r.id} field="label" value={v} /> : v },
    {
      title: (
        <Tooltip title="Unit of measurement displayed next to the value (e.g. g/10min, °C, MPa, %). Leave empty for unitless fields.">
          Unit
        </Tooltip>
      ),
      dataIndex: 'unit', width: 75, align: 'left',
      render: (v, r) => {
        // Unit only meaningful for numeric fields
        if (!NUMERIC_TYPES.has(r.field_type)) {
          return <Text type="secondary" style={{ fontSize: 10, fontStyle: 'italic' }}>—</Text>;
        }
        return canWrite ? <EditCell id={r.id} field="unit" value={v || ''} /> : (v || '-');
      },
    },
    {
      title: (
        <Tooltip title="What kind of value this field accepts: a number, text/choice, a composition table, or a list of rows.">
          Type
        </Tooltip>
      ),
      dataIndex: 'field_type', width: 160, align: 'left',
      render: (v, r) => canWrite
        ? <EditCell id={r.id} field="field_type" value={v} type="select"
            options={TYPE_OPTIONS.map(t => ({
              label: <Tooltip title={t.description} placement="right">{t.label}</Tooltip>,
              value: t.value,
            }))} />
        : TYPE_LABEL(v),
    },
    {
      title: (
        <Tooltip title="For Text/Choice fields: the fixed list of allowed values shown as a dropdown to operators. Click 'Edit' to manage the list.">
          Choices
        </Tooltip>
      ),
      dataIndex: 'enum_options', width: 160, align: 'left',
      render: (v, r) => {
        if (r.field_type !== 'text') {
          return <Text type="secondary" style={{ fontSize: 10, fontStyle: 'italic' }}>—</Text>;
        }
        const opts = Array.isArray(v) ? v : [];
        if (!canWrite) {
          return opts.length ? opts.join(', ') : <Text type="secondary" style={{ fontSize: 11 }}>free text</Text>;
        }
        return (
          <Button
            size="small"
            type={opts.length ? 'default' : 'dashed'}
            onClick={() => setChoicesEditor({ id: r.id, label: r.label, options: [...opts] })}
            style={{ width: '100%', textAlign: 'left' }}
          >
            {opts.length
              ? <Text style={{ fontSize: 11 }}>{opts.length} choice{opts.length > 1 ? 's' : ''} <Text type="secondary">(edit)</Text></Text>
              : <Text type="secondary" style={{ fontSize: 11 }}>+ Add choices</Text>}
          </Button>
        );
      },
    },
    {
      title: (
        <Tooltip title="Minimum allowed value (numeric fields only). Used to validate operator input.">
          Min
        </Tooltip>
      ),
      dataIndex: 'min_value', width: 80, align: 'right',
      render: (v, r) => {
        if (!NUMERIC_TYPES.has(r.field_type)) {
          return <Text type="secondary" style={{ fontSize: 10, fontStyle: 'italic' }}>—</Text>;
        }
        const invalid = v != null && r.max_value != null && Number(v) > Number(r.max_value);
        const cell = canWrite
          ? <EditCell id={r.id} field="min_value" value={v} type="number" step={0.01} />
          : (v ?? '-');
        return invalid
          ? <Tooltip title="Min is greater than Max — fix this!"><div style={{ background: '#fef2f2', borderRadius: 4 }}>{cell}</div></Tooltip>
          : cell;
      },
    },
    {
      title: (
        <Tooltip title="Maximum allowed value (numeric fields only). Used to validate operator input.">
          Max
        </Tooltip>
      ),
      dataIndex: 'max_value', width: 80, align: 'right',
      render: (v, r) => {
        if (!NUMERIC_TYPES.has(r.field_type)) {
          return <Text type="secondary" style={{ fontSize: 10, fontStyle: 'italic' }}>—</Text>;
        }
        const invalid = v != null && r.min_value != null && Number(v) < Number(r.min_value);
        const cell = canWrite
          ? <EditCell id={r.id} field="max_value" value={v} type="number" step={0.01} />
          : (v ?? '-');
        return invalid
          ? <Tooltip title="Max is less than Min — fix this!"><div style={{ background: '#fef2f2', borderRadius: 4 }}>{cell}</div></Tooltip>
          : cell;
      },
    },
    {
      title: (
        <Tooltip title="Required: operator must fill this field before saving the spec.">
          Req
        </Tooltip>
      ),
      dataIndex: 'is_required', width: 50, align: 'center',
      render: (v, r) => canWrite ? <EditCell id={r.id} field="is_required" value={v} type="switch" /> : (v ? '✓' : ''),
    },
    {
      title: (
        <Tooltip title="Form Width: how much horizontal space this field takes in the operator's TDS form. 1/6 = small, Full = full row.">
          Width
        </Tooltip>
      ),
      dataIndex: 'display_width', width: 95, align: 'center',
      render: (v, r) => canWrite
        ? <EditCell id={r.id} field="display_width" value={v || 4} type="select" options={WIDTH_OPTIONS} />
        : v,
    },
    {
      title: (
        <Tooltip title="Group: section heading this field appears under in the form (e.g. Rheology, Thermal, Mechanical). The system warns if you create a near-duplicate of an existing group.">
          Group
        </Tooltip>
      ),
      dataIndex: 'display_group', width: 160, ellipsis: true, align: 'left',
      render: (v, r) => {
        if (!canWrite) return v || '-';
        return (
          <SmartGroupCell
            value={v || ''}
            options={allGroups}
            onSave={(newVal) => saveField(r.id, 'display_group', newVal)}
          />
        );
      },
    },
    {
      title: (
        <Tooltip title="Test Method: when ON, operators can attach the test method/standard used (e.g. ASTM D1238) alongside the value.">
          Test Method
        </Tooltip>
      ),
      dataIndex: 'has_test_method', width: 80, align: 'center',
      render: (v, r) => canWrite ? <EditCell id={r.id} field="has_test_method" value={v} type="switch" /> : (v ? '✓' : ''),
    },
    {
      title: (
        <Tooltip title="Source: 'Input' = operator types the value. 'Calculated' = the system computes it from other fields.">
          Source
        </Tooltip>
      ),
      dataIndex: 'param_type', width: 110, align: 'left',
      render: (v, r) => canWrite
        ? <EditCell id={r.id} field="param_type" value={v || 'input'} type="select"
            options={[{label:'Input (typed)',value:'input'},{label:'Calculated',value:'calculated'}]} />
        : (v === 'calculated' ? 'Calculated' : 'Input'),
    },
    {
      title: (
        <Tooltip title="Test Conditions: free-text describing how the test was performed (e.g. '190°C / 2.16 kg', '23°C, 50mm/min').">
          Test Conditions
        </Tooltip>
      ),
      dataIndex: 'test_conditions', width: 180, ellipsis: true, align: 'left',
      render: (v, r) => canWrite ? <EditCell id={r.id} field="test_conditions" value={v || ''} /> : (v || '-'),
    },
    ...(canWrite ? [{
      title: '', width: 120, align: 'center',
      render: (_, r) => {
        const idx = filteredDefs.findIndex(d => d.id === r.id);
        return (
          <Space size={2}>
            <Tooltip title="Move up">
              <Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={idx <= 0} onClick={() => moveDefinition(r.id, 'up')} />
            </Tooltip>
            <Tooltip title="Move down">
              <Button type="text" size="small" icon={<ArrowDownOutlined />} disabled={idx < 0 || idx >= filteredDefs.length - 1} onClick={() => moveDefinition(r.id, 'down')} />
            </Tooltip>
            <Tooltip title="Where used">
              <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openUsage(r.id)} />
            </Tooltip>
            <Popconfirm title="Delete this parameter? This cannot be undone here (use audit revert)." onConfirm={() => deleteParameter(r.id)} okText="Delete" okType="danger">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        );
      },
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

  // ── Phase 8/9 — Categories & Audit handlers ──────────────────────────────
  const buildAuditQuery = useCallback(() => {
    const qs = new URLSearchParams();
    qs.set('limit', String(AUDIT_PAGE_SIZE));
    qs.set('offset', String((auditPage - 1) * AUDIT_PAGE_SIZE));
    if (auditFilter.entity_type) qs.set('entity_type', auditFilter.entity_type);
    if (auditFilter.action) qs.set('action', auditFilter.action);
    if (auditFilter.actor_email) qs.set('actor_email', auditFilter.actor_email);
    return qs.toString();
  }, [auditPage, auditFilter]);

  const refreshCatsModal = useCallback(async () => {
    if (!visible && !catsModalVisible) return;
    if (catsModalVisible) setCatsLoading(true);
    try {
      const [um, mp, au] = await Promise.all([
        fetch(api('/api/mes/master-data/tds/unmapped-categories'), { headers }).then(r => r.json()).catch(() => ({})),
        fetch(api('/api/mes/master-data/tds/category-mapping?include_inactive=true'), { headers }).then(r => r.json()).catch(() => ({})),
        isAdmin
          ? fetch(api(`/api/mes/master-data/tds/schema-audit?${buildAuditQuery()}`), { headers }).then(r => r.json()).catch(() => ({}))
          : Promise.resolve({ data: [], total: 0 }),
      ]);
      setUnmapped(um.data || []);
      setAllMappings(mp.data || []);
      setAuditRows(au.data || []);
      setAuditTotal(au.total || (au.data ? au.data.length : 0));
    } finally {
      if (catsModalVisible) setCatsLoading(false);
    }
  }, [visible, catsModalVisible, headers, isAdmin, buildAuditQuery]);

  // Reload audit only when filters/page change (and the modal is open)
  useEffect(() => { if (catsModalVisible && isAdmin) refreshCatsModal(); }, [auditPage, auditFilter, catsModalVisible, isAdmin, refreshCatsModal]);

  const revertAudit = useCallback(async (auditId) => {
    try {
      const res = await fetch(api(`/api/mes/master-data/tds/schema-audit/${auditId}/revert`), { method: 'POST', headers });
      const json = await res.json();
      if (json.success) {
        message.success('Reverted from audit snapshot');
        refreshCatsModal();
        fetchDefs();
      } else message.error(json.error || 'Revert failed');
    } catch { message.error('Revert failed'); }
  }, [headers, message, refreshCatsModal, fetchDefs]);

  // ── Phase 10 — Where-used / Bulk / Lint / Import handlers ───────────────
  const openUsage = useCallback(async (id) => {
    setUsageLoading(true);
    setUsageModalVisible(true);
    setUsageData(null);
    try {
      const res = await fetch(api(`/api/mes/master-data/tds/parameter-definitions/${id}/usage`), { headers });
      const json = await res.json();
      if (json.success) setUsageData(json);
      else message.error(json.error || 'Failed to fetch usage');
    } catch { message.error('Failed to fetch usage'); }
    setUsageLoading(false);
  }, [headers, message]);

  const moveDefinition = useCallback((id, direction) => {
    const idx = filteredDefs.findIndex(d => d.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= filteredDefs.length) return;
    const order = filteredDefs.map((d, i) => ({ id: d.id, sort_order: i + 1 }));
    const tmp = order[idx].sort_order;
    order[idx].sort_order = order[swapIdx].sort_order;
    order[swapIdx].sort_order = tmp;
    fetch(api('/api/mes/master-data/tds/parameter-definitions/reorder'), {
      method: 'PUT', headers, body: JSON.stringify({ order }),
    }).then(r => r.json()).then(json => { if (json.success) fetchDefs(); else message.error(json.error || 'Reorder failed'); });
  }, [filteredDefs, headers, fetchDefs, message]);

  const applyBulk = useCallback(async () => {
    if (!selectedRowKeys.length) return;
    const cleaned = Object.fromEntries(Object.entries(bulkUpdates).filter(([, v]) => v !== '' && v !== undefined));
    if (!Object.keys(cleaned).length) { message.warning('Set at least one field to apply'); return; }
    setSaving(true);
    try {
      const res = await fetch(api('/api/mes/master-data/tds/parameter-definitions/bulk'), {
        method: 'PATCH', headers, body: JSON.stringify({ ids: selectedRowKeys, updates: cleaned }),
      });
      const json = await res.json();
      if (json.success) {
        message.success(`Updated ${json.updated} definitions`);
        setBulkModalVisible(false);
        setBulkUpdates({});
        setSelectedRowKeys([]);
        fetchDefs();
      } else message.error(json.error || 'Bulk update failed');
    } catch { message.error('Bulk update failed'); }
    setSaving(false);
  }, [selectedRowKeys, bulkUpdates, headers, message, fetchDefs]);

  const runLint = useCallback(async () => {
    setLintLoading(true);
    setLintModalVisible(true);
    try {
      const res = await fetch(api('/api/mes/master-data/tds/schema-lint'), { headers });
      const json = await res.json();
      if (json.success) setLintIssues(json.issues || []);
      else message.error(json.error || 'Lint failed');
    } catch { message.error('Lint failed'); }
    setLintLoading(false);
  }, [headers, message]);

  const handleImportFile = useCallback(async (file) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setImportRaw(parsed);
      const res = await fetch(api('/api/mes/master-data/tds/parameter-definitions/import'), {
        method: 'POST', headers, body: JSON.stringify({ data: parsed, mode: importMode, dry_run: true }),
      });
      const json = await res.json();
      if (json.success) { setImportPlan(json.plan); setImportModalVisible(true); }
      else message.error(json.error || 'Import dry-run failed');
    } catch (e) { message.error('Failed to parse JSON: ' + e.message); }
  }, [headers, message, importMode]);

  const confirmImport = useCallback(async () => {
    if (!importRaw) return;
    setImporting(true);
    try {
      const res = await fetch(api('/api/mes/master-data/tds/parameter-definitions/import'), {
        method: 'POST', headers, body: JSON.stringify({ data: importRaw, mode: importMode, dry_run: false }),
      });
      const json = await res.json();
      if (json.success) {
        message.success(`Import: created ${json.created}, updated ${json.updated}, deleted ${json.deleted}`);
        setImportModalVisible(false); setImportPlan(null); setImportRaw(null);
        fetchDefs(); fetchMapping();
      } else message.error(json.error || 'Import failed');
    } catch { message.error('Import failed'); }
    setImporting(false);
  }, [importRaw, importMode, headers, message, fetchDefs, fetchMapping]);

  useEffect(() => { if (visible) refreshCatsModal(); }, [visible, refreshCatsModal]);

  const assignUnmapped = async (id, materialClass) => {
    if (!materialClass) return;
    try {
      const res = await fetch(api(`/api/mes/master-data/tds/category-mapping/${id}`), {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ material_class: materialClass, has_parameters: true, is_active: true }),
      });
      const json = await res.json();
      if (json.success) {
        message.success('Mapping assigned');
        refreshCatsModal();
        fetchMapping();
      } else message.error(json.error || 'Failed');
    } catch { message.error('Assign failed'); }
  };

  const patchMapping = async (id, patch) => {
    try {
      const res = await fetch(api(`/api/mes/master-data/tds/category-mapping/${id}`), {
        method: 'PATCH', headers, body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (json.success) { message.success('Updated'); refreshCatsModal(); fetchMapping(); }
      else message.error(json.error || 'Failed');
    } catch { message.error('Update failed'); }
  };

  const createMapping = async () => {
    if (!newCat.oracle_category || !newCat.material_class) {
      message.warning('oracle_category and material_class required');
      return;
    }
    try {
      const res = await fetch(api('/api/mes/master-data/tds/category-mapping'), {
        method: 'POST', headers, body: JSON.stringify(newCat),
      });
      const json = await res.json();
      if (json.success) {
        message.success('Category created');
        setNewCat({ oracle_category: '', material_class: '', display_label: '' });
        refreshCatsModal();
        fetchMapping();
      } else message.error(json.error || 'Failed');
    } catch { message.error('Create failed'); }
  };

  const deleteMapping = async (id) => {
    try {
      const res = await fetch(api(`/api/mes/master-data/tds/category-mapping/${id}`), {
        method: 'DELETE', headers,
      });
      const json = await res.json();
      if (json.success) { message.success('Deactivated'); refreshCatsModal(); fetchMapping(); }
      else message.error(json.error || 'Failed');
    } catch { message.error('Delete failed'); }
  };

  const renderCatsModal = () => (
    <Modal
      title={
        <span>
          <SettingOutlined /> Categories &amp; Schema Audit
          {unmapped.length > 0 && (
            <Tag color="red" style={{ marginLeft: 8 }}>
              <WarningOutlined /> {unmapped.length} unmapped
            </Tag>
          )}
        </span>
      }
      open={catsModalVisible}
      onCancel={() => setCatsModalVisible(false)}
      width={1100}
      footer={null}
      destroyOnHidden
    >
      <Spin spinning={catsLoading}>
        {/* Unmapped categories */}
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ fontSize: 13 }}>
            <WarningOutlined style={{ color: unmapped.length ? '#dc2626' : '#16a34a' }} /> Unmapped Oracle Categories ({unmapped.length})
          </Text>
          <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 6 }}>
            Categories detected during RM sync that have not yet been assigned a material_class. Assign one below to enable specs.
          </Text>
          {unmapped.length === 0 ? (
            <Tag color="green">All categories mapped <CheckOutlined /></Tag>
          ) : (
            <Table
              size="small"
              rowKey="id"
              dataSource={unmapped}
              pagination={false}
              columns={[
                { title: 'Oracle Category', dataIndex: 'oracle_category', key: 'oc' },
                { title: 'Detected At', dataIndex: 'created_at', key: 'ca',
                  render: v => v ? new Date(v).toLocaleString() : '-' },
                {
                  title: 'Assign material_class', key: 'assign', width: 280,
                  render: (_, r) => isAdmin ? (
                    <Select
                      size="small" placeholder="Pick class…" style={{ width: 240 }}
                      onChange={v => assignUnmapped(r.id, v)}
                      options={[...new Set(allMappings.map(m => m.material_class).filter(c => c && c !== 'unmapped'))]
                        .map(c => ({ label: c, value: c }))}
                    />
                  ) : <Text type="secondary" style={{ fontSize: 11 }}>admin only</Text>,
                },
              ]}
            />
          )}
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* Add new category */}
        {isAdmin && (
          <div style={{ marginBottom: 12, padding: 8, background: '#f8fafc', borderRadius: 4 }}>
            <Text strong style={{ fontSize: 12 }}>Add New Category Mapping</Text>
            <Space style={{ marginTop: 6, width: '100%' }} wrap>
              <Input size="small" placeholder="oracle_category" style={{ width: 220 }}
                value={newCat.oracle_category}
                onChange={e => setNewCat({ ...newCat, oracle_category: e.target.value })} />
              <Input size="small" placeholder="material_class (e.g. resins)" style={{ width: 200 }}
                value={newCat.material_class}
                onChange={e => setNewCat({ ...newCat, material_class: e.target.value })} />
              <Input size="small" placeholder="display_label (optional)" style={{ width: 220 }}
                value={newCat.display_label}
                onChange={e => setNewCat({ ...newCat, display_label: e.target.value })} />
              <Button size="small" type="primary" icon={<PlusOutlined />} onClick={createMapping}>Add</Button>
            </Space>
          </div>
        )}

        {/* All mappings */}
        <Text strong style={{ fontSize: 13 }}>All Category Mappings ({allMappings.length})</Text>
        <Table
          size="small"
          rowKey="id"
          dataSource={allMappings}
          pagination={{ pageSize: 10, size: 'small' }}
          columns={[
            { title: 'Oracle Category', dataIndex: 'oracle_category', key: 'oc', width: 230 },
            { title: 'material_class', dataIndex: 'material_class', key: 'mc', width: 150,
              render: (v, r) => isAdmin ? (
                <Input size="small" defaultValue={v}
                  onBlur={e => e.target.value !== v && patchMapping(r.id, { material_class: e.target.value })} />
              ) : v,
            },
            { title: 'Display Label', dataIndex: 'display_label', key: 'dl',
              render: (v, r) => isAdmin ? (
                <Input size="small" defaultValue={v}
                  onBlur={e => e.target.value !== v && patchMapping(r.id, { display_label: e.target.value })} />
              ) : v,
            },
            { title: 'Active', dataIndex: 'is_active', key: 'ia', width: 70,
              render: (v, r) => isAdmin ? (
                <Switch size="small" checked={v} onChange={x => patchMapping(r.id, { is_active: x })} />
              ) : (v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>),
            },
            { title: 'Sort', dataIndex: 'sort_order', key: 'so', width: 70 },
            ...(isAdmin ? [{
              title: '', key: 'act', width: 60,
              render: (_, r) => (
                <Popconfirm title={`Deactivate "${r.oracle_category}"?`} onConfirm={() => deleteMapping(r.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              ),
            }] : []),
          ]}
        />

        {/* Audit log (admin) */}
        {isAdmin && (
          <>
            <Divider style={{ margin: '12px 0' }} />
            <Text strong style={{ fontSize: 13 }}>
              <AuditOutlined /> Schema Changes ({auditTotal})
            </Text>
            <Space style={{ display: 'flex', marginTop: 6, marginBottom: 6 }} wrap>
              <Select size="small" allowClear placeholder="Action" style={{ width: 140 }}
                value={auditFilter.action || undefined}
                onChange={(v) => { setAuditPage(1); setAuditFilter(f => ({ ...f, action: v || null })); }}
                options={['create','update','delete','reorder','copy_profile','bulk_update','revert','import_create','import_update','import_delete'].map(a => ({ label: a, value: a }))} />
              <Select size="small" placeholder="Entity" style={{ width: 180 }}
                value={auditFilter.entity_type || undefined}
                allowClear
                onChange={(v) => { setAuditPage(1); setAuditFilter(f => ({ ...f, entity_type: v || null })); }}
                options={[
                  { label: 'parameter_definition', value: 'parameter_definition' },
                  { label: 'category_mapping', value: 'category_mapping' },
                ]} />
              <Input size="small" placeholder="Actor email contains…" style={{ width: 220 }}
                value={auditFilter.actor_email}
                onChange={(e) => { setAuditPage(1); setAuditFilter(f => ({ ...f, actor_email: e.target.value })); }} />
              <Button size="small" onClick={() => { setAuditFilter({ action: null, actor_email: '', entity_type: 'parameter_definition' }); setAuditPage(1); }}>Reset</Button>
            </Space>
            <Table
              size="small"
              rowKey="id"
              dataSource={auditRows}
              pagination={{
                pageSize: AUDIT_PAGE_SIZE,
                size: 'small',
                current: auditPage,
                total: auditTotal,
                onChange: (p) => setAuditPage(p),
                showSizeChanger: false,
              }}
              columns={[
                { title: 'When', dataIndex: 'created_at', key: 'ca', width: 150,
                  render: v => v ? new Date(v).toLocaleString() : '-' },
                { title: 'Entity', dataIndex: 'entity_type', key: 'et', width: 140 },
                { title: 'Action', dataIndex: 'action', key: 'ac', width: 100,
                  render: v => <Tag color={v?.includes('delete') ? 'red' : v?.includes('create') ? 'green' : v === 'revert' ? 'purple' : 'blue'}>{v}</Tag> },
                { title: 'By', dataIndex: 'actor_email', key: 'by', width: 180,
                  render: (v, r) => v || `#${r.actor_id}` },
                { title: 'Diff', dataIndex: 'diff_summary', key: 'ds',
                  render: v => <Text type="secondary" style={{ fontSize: 11 }}>{v}</Text> },
                { title: '', key: 'rv', width: 90, align: 'center',
                  render: (_, r) => r.entity_type === 'parameter_definition' && ['update','delete','bulk_update','import_update','import_delete'].includes(r.action) ? (
                    <Popconfirm title="Re-apply the BEFORE snapshot from this audit row?" onConfirm={() => revertAudit(r.id)}>
                      <Button size="small" type="link" icon={<RollbackOutlined />}>Revert</Button>
                    </Popconfirm>
                  ) : null,
                },
              ]}
            />
          </>
        )}
      </Spin>
    </Modal>
  );

  if (!canWrite) return (
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: fullScreen ? 'calc(100vh - 80px)' : 'calc(100vh - 160px)' }}>

          {/* ── Top: Category/Profile selector toolbar ── */}
          <div style={{ flexShrink: 0, padding: '6px 8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Space size="small" align="center">
              <Text strong style={{ fontSize: 12 }}>Category:</Text>
              <Select
                size="small"
                style={{ minWidth: 220 }}
                value={selectedClass}
                onChange={(v) => { setSelectedClass(v); setSelectedProfile(null); }}
                options={uniqueCategories.map(m => ({
                  label: `${m.display_label} (${m.item_count})`,
                  value: m.material_class,
                }))}
              />
            </Space>
            {(() => {
              const profiles = [...new Set(definitions.filter(d => d.profile).map(d => d.profile))];
              if (profiles.length === 0) return null;
              return (
                <Space size={4} align="center" wrap>
                  <Text strong style={{ fontSize: 12 }}>Profile:</Text>
                  <Button
                    size="small"
                    type={!selectedProfile ? 'primary' : 'default'}
                    onClick={() => setSelectedProfile(null)}
                  >
                    Base
                  </Button>
                  {profiles.map(p => {
                    const profileLabel = p
                      .replace(/^substrates_/, '')
                      .replace(/_/g, ' ')
                      .replace(/\b\w/g, c => c.toUpperCase());
                    return (
                      <Button
                        key={p}
                        size="small"
                        type={selectedProfile === p ? 'primary' : 'default'}
                        onClick={() => setSelectedProfile(p)}
                      >
                        {profileLabel}
                      </Button>
                    );
                  })}
                </Space>
              );
            })()}
          </div>

          {/* ── Editable table ── */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <Text strong>{selectedCategoryLabel}</Text>
                {selectedProfile && <Tag color="blue" style={{ marginLeft: 6 }}>{selectedProfile.replace(/^substrates_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Tag>}
                <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>{filteredDefs.length} parameters</Text>
              </div>
              <Space size="small" wrap>
                {canWrite && (
                  <Button size="small" icon={<PlusOutlined />} type="primary"
                    onClick={() => setAddWizard({ label: '', field_type: 'number', unit: '', group: '' })}
                    loading={saving}>
                    Add Parameter
                  </Button>
                )}
                {canWrite && selectedRowKeys.length > 0 && (
                  <Button size="small" icon={<EditOutlined />} onClick={() => setBulkModalVisible(true)}>
                    Bulk Edit ({selectedRowKeys.length})
                  </Button>
                )}
                <Button size="small" icon={<CopyOutlined />} onClick={() => setCopyModalVisible(true)}>Copy Profile</Button>
                <Button size="small" icon={<DownloadOutlined />} onClick={exportJson}>Export</Button>
                <Button size="small" icon={<DownloadOutlined />} onClick={exportAllCategories}>Export All</Button>
                {canWrite && (
                  <Tooltip title="Import JSON (merge or replace) with dry-run preview">
                    <Button size="small" icon={<UploadOutlined />} onClick={() => document.getElementById('psa-import-input')?.click()}>Import</Button>
                  </Tooltip>
                )}
                <input id="psa-import-input" type="file" accept="application/json,.json" style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ''; }} />
                {isAdmin && (
                  <Badge count={lintSummary.errors} size="small" offset={[-4, 2]} color="#dc2626">
                    <Button size="small" icon={<BugOutlined />} onClick={runLint}>
                      Lint{(lintSummary.warns + lintSummary.infos) > 0 ? ` (${lintSummary.warns + lintSummary.infos})` : ''}
                    </Button>
                  </Badge>
                )}
                <Button size="small" icon={<ExpandOutlined />} onClick={() => setPreviewVisible(true)}>Preview</Button>
                <Tooltip title={showFieldKey ? 'Hide Field Key column' : 'Show Field Key column (internal JSON keys)'}>
                  <Button
                    size="small"
                    type={showFieldKey ? 'primary' : 'default'}
                    ghost={showFieldKey}
                    icon={<EyeOutlined />}
                    onClick={() => setShowFieldKey(s => !s)}
                  >
                    {showFieldKey ? 'Hide Keys' : 'Show Keys'}
                  </Button>
                </Tooltip>
                <Button
                  size="small"
                  icon={unmapped.length ? <WarningOutlined /> : <SettingOutlined />}
                  danger={unmapped.length > 0}
                  onClick={() => setCatsModalVisible(true)}
                >
                  Categories{unmapped.length > 0 ? ` (${unmapped.length})` : ''}
                </Button>
              </Space>
            </div>
            <Spin spinning={loading}>
              <Table
                dataSource={filteredDefs}
                columns={columns}
                rowKey="id"
                size="small"
                pagination={false}
                components={canWrite ? { body: { row: DraggableRow } } : undefined}
                rowSelection={canWrite ? {
                  selectedRowKeys,
                  onChange: setSelectedRowKeys,
                  columnWidth: 32,
                } : undefined}
                scroll={{ y: fullScreen ? 'calc(100vh - 180px)' : 'calc(100vh - 280px)', x: 'max-content' }}
              />
            </Spin>
          </div>
        </div>
      </Modal>

      {renderPreviewModal()}

      {/* Add Parameter wizard */}
      <Modal
        title="Add New Parameter"
        open={!!addWizard}
        onCancel={() => setAddWizard(null)}
        onOk={async () => {
          if (!addWizard) return;
          const label = (addWizard.label || '').trim();
          if (!label) { message.warning('Please enter a label'); return; }
          await addParameter({
            label,
            field_type: addWizard.field_type || 'number',
            unit: addWizard.unit || null,
            display_group: addWizard.group || null,
          });
          setAddWizard(null);
        }}
        okText="Add"
        confirmLoading={saving}
        width={520}
        destroyOnHidden
      >
        {addWizard && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <Text strong style={{ fontSize: 12 }}>Label <Text type="danger">*</Text></Text>
              <Input
                placeholder="e.g. Melt Flow Rate"
                value={addWizard.label}
                onChange={e => setAddWizard({ ...addWizard, label: e.target.value })}
                autoFocus
              />
              <Text type="secondary" style={{ fontSize: 11 }}>The name operators will see in the form.</Text>
            </div>
            <div style={{ marginBottom: 12 }}>
              <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>What kind of value?</Text>
              <Select
                style={{ width: '100%' }}
                value={addWizard.field_type}
                onChange={v => setAddWizard({ ...addWizard, field_type: v })}
                optionLabelProp="label"
              >
                {TYPE_OPTIONS.map(t => (
                  <Select.Option key={t.value} value={t.value} label={t.label}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{t.label}</div>
                      <Text type="secondary" style={{ fontSize: 11 }}>{t.description}</Text>
                    </div>
                  </Select.Option>
                ))}
              </Select>
            </div>
            {addWizard.field_type === 'number' && (
              <div style={{ marginBottom: 12 }}>
                <Text strong style={{ fontSize: 12 }}>Unit (optional)</Text>
                <Input
                  placeholder="e.g. g/10min, °C, MPa"
                  value={addWizard.unit}
                  onChange={e => setAddWizard({ ...addWizard, unit: e.target.value })}
                />
              </div>
            )}
            <div style={{ marginBottom: 4 }}>
              <Text strong style={{ fontSize: 12 }}>Group (optional)</Text>
              <AutoComplete
                style={{ width: '100%' }}
                placeholder="e.g. Rheology, Thermal"
                value={addWizard.group}
                options={allGroups}
                onChange={v => setAddWizard({ ...addWizard, group: v })}
              />
              <Text type="secondary" style={{ fontSize: 11 }}>Section heading in the form.</Text>
            </div>
          </div>
        )}
      </Modal>

      {/* Choices (enum_options) editor */}
      <Modal
        title={choicesEditor ? `Edit Choices — ${choicesEditor.label}` : 'Edit Choices'}
        open={!!choicesEditor}
        onCancel={() => setChoicesEditor(null)}
        onOk={() => {
          if (!choicesEditor) return;
          const cleaned = (choicesEditor.options || []).map(s => String(s).trim()).filter(Boolean);
          const dedup = [...new Set(cleaned)];
          saveField(choicesEditor.id, 'enum_options', dedup);
          setChoicesEditor(null);
        }}
        okText="Save Choices"
        width={520}
        destroyOnHidden
      >
        {choicesEditor && (
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
              These are the dropdown values operators will see for <strong>{choicesEditor.label}</strong>.
              Leave empty to allow free text. One option per line, or paste from Excel.
            </Text>
            <Input.TextArea
              autoSize={{ minRows: 6, maxRows: 16 }}
              value={(choicesEditor.options || []).join('\n')}
              onChange={(e) => setChoicesEditor({ ...choicesEditor, options: e.target.value.split(/\r?\n/) })}
              placeholder={'Clear\nHazy\nYellow\nMilky'}
            />
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {(() => {
                  const cleaned = (choicesEditor.options || []).map(s => s.trim()).filter(Boolean);
                  const dups = cleaned.length - new Set(cleaned).size;
                  return `${new Set(cleaned).size} unique choice${new Set(cleaned).size === 1 ? '' : 's'}${dups ? ` (${dups} duplicate${dups === 1 ? '' : 's'} will be removed)` : ''}`;
                })()}
              </Text>
              <Button
                size="small"
                type="link"
                onClick={() => setChoicesEditor({ ...choicesEditor, options: [] })}
              >
                Clear all
              </Button>
            </div>
            {(() => {
              const cleaned = [...new Set((choicesEditor.options || []).map(s => s.trim()).filter(Boolean))];
              if (!cleaned.length) return null;
              return (
                <div style={{ marginTop: 12, padding: 8, background: '#f8fafc', borderRadius: 4 }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>Preview (operator's dropdown):</Text>
                  <Select size="small" style={{ width: '100%' }} placeholder="Select…"
                    options={cleaned.map(c => ({ label: c, value: c }))} />
                </div>
              );
            })()}
          </div>
        )}
      </Modal>

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

      {renderCatsModal()}

      {/* Bulk edit modal */}
      <Modal
        title={`Bulk Edit — ${selectedRowKeys.length} parameter${selectedRowKeys.length === 1 ? '' : 's'}`}
        open={bulkModalVisible}
        onCancel={() => { setBulkModalVisible(false); setBulkUpdates({}); setBulkPreviewOpen(false); }}
        onOk={applyBulk}
        confirmLoading={saving}
        okText={bulkPreviewOpen ? 'Confirm & Apply' : 'Apply to selected'}
        width={bulkPreviewOpen ? 920 : 620}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
          Leave a field blank to keep its current value on each row. Only filled fields will be updated.
        </Text>
        <Row gutter={[12, 10]}>
          <Col span={12}>
            <Text style={{ fontSize: 12 }}>Unit</Text>
            <Input size="small" value={bulkUpdates.unit ?? ''} placeholder="(no change)"
              onChange={e => setBulkUpdates(u => ({ ...u, unit: e.target.value }))} />
          </Col>
          <Col span={12}>
            <Text style={{ fontSize: 12 }}>Display Group</Text>
            <AutoComplete size="small" value={bulkUpdates.display_group ?? ''} style={{ width: '100%' }}
              options={allGroups} placeholder="(no change)"
              onChange={v => setBulkUpdates(u => ({ ...u, display_group: v }))} />
          </Col>
          <Col span={12}>
            <Text style={{ fontSize: 12 }}>Display Width</Text>
            <Select size="small" allowClear value={bulkUpdates.display_width} style={{ width: '100%' }}
              placeholder="(no change)" options={WIDTH_OPTIONS}
              onChange={v => setBulkUpdates(u => ({ ...u, display_width: v }))} />
          </Col>
          <Col span={12}>
            <Text style={{ fontSize: 12 }}>Field Type</Text>
            <Select size="small" allowClear value={bulkUpdates.field_type} style={{ width: '100%' }}
              placeholder="(no change)"
              options={TYPE_OPTIONS.map(t => ({ label: t.label, value: t.value }))}
              onChange={v => setBulkUpdates(u => ({ ...u, field_type: v }))} />
          </Col>
          <Col span={8}>
            <Text style={{ fontSize: 12 }}>Required</Text>
            <Select size="small" allowClear value={bulkUpdates.is_required} style={{ width: '100%' }}
              placeholder="(no change)"
              options={[{ label: 'Yes', value: true }, { label: 'No', value: false }]}
              onChange={v => setBulkUpdates(u => ({ ...u, is_required: v }))} />
          </Col>
          <Col span={8}>
            <Text style={{ fontSize: 12 }}>Has Test Method</Text>
            <Select size="small" allowClear value={bulkUpdates.has_test_method} style={{ width: '100%' }}
              placeholder="(no change)"
              options={[{ label: 'Yes', value: true }, { label: 'No', value: false }]}
              onChange={v => setBulkUpdates(u => ({ ...u, has_test_method: v }))} />
          </Col>
          <Col span={8}>
            <Text style={{ fontSize: 12 }}>Param Type</Text>
            <Select size="small" allowClear value={bulkUpdates.param_type} style={{ width: '100%' }}
              placeholder="(no change)"
              options={[{ label: 'input', value: 'input' }, { label: 'calculated', value: 'calculated' }]}
              onChange={v => setBulkUpdates(u => ({ ...u, param_type: v }))} />
          </Col>
        </Row>

        {/* Preview toggle + diff */}
        {(() => {
          const cleaned = Object.fromEntries(
            Object.entries(bulkUpdates).filter(([, v]) => v !== '' && v !== undefined)
          );
          const changedKeys = Object.keys(cleaned);
          if (!changedKeys.length) {
            return (
              <Text type="secondary" style={{ display: 'block', marginTop: 14, fontSize: 11, fontStyle: 'italic' }}>
                Fill at least one field above to see a preview.
              </Text>
            );
          }
          const selectedRows = filteredDefs.filter(d => selectedRowKeys.includes(d.id));
          const FRIENDLY = {
            unit: 'Unit', display_group: 'Group', display_width: 'Width',
            field_type: 'Type', is_required: 'Required',
            has_test_method: 'Test Method', param_type: 'Source',
          };
          const fmt = (k, v) => {
            if (v == null || v === '') return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
            if (k === 'field_type') return TYPE_LABEL(v);
            if (k === 'display_width') return (WIDTH_OPTIONS.find(o => o.value === v)?.label) || v;
            if (typeof v === 'boolean') return v ? 'Yes' : 'No';
            return String(v);
          };
          return (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Space size={6}>
                  <EyeOutlined style={{ color: '#7c3aed' }} />
                  <Text strong style={{ fontSize: 12 }}>
                    Preview — {selectedRows.length} row{selectedRows.length === 1 ? '' : 's'} affected,
                    {' '}{changedKeys.length} field{changedKeys.length === 1 ? '' : 's'} changing
                  </Text>
                </Space>
                <Button size="small" type="link" onClick={() => setBulkPreviewOpen(o => !o)}>
                  {bulkPreviewOpen ? 'Hide' : 'Show'} diff
                </Button>
              </div>
              {bulkPreviewOpen && (
                <Table
                  size="small"
                  pagination={false}
                  rowKey="id"
                  dataSource={selectedRows}
                  scroll={{ y: 240 }}
                  columns={[
                    { title: 'Label', dataIndex: 'label', width: 180, ellipsis: true,
                      render: (v) => <Text style={{ fontSize: 11 }}>{v}</Text> },
                    ...changedKeys.map(k => ({
                      title: FRIENDLY[k] || k,
                      key: k,
                      width: 160,
                      render: (_, r) => {
                        const before = r[k];
                        const after = cleaned[k];
                        const same = before === after
                          || (before == null && (after === '' || after == null));
                        return (
                          <Space size={4} style={{ fontSize: 11 }}>
                            <Text delete={!same} type={same ? 'secondary' : undefined}>{fmt(k, before)}</Text>
                            {!same && <Text type="secondary">→</Text>}
                            {!same && <Text style={{ color: '#16a34a', fontWeight: 600 }}>{fmt(k, after)}</Text>}
                          </Space>
                        );
                      },
                    })),
                  ]}
                />
              )}
            </div>
          );
        })()}
      </Modal>

      {/* Where-used modal */}
      <Modal
        title="Where used — impact preview"
        open={usageModalVisible}
        onCancel={() => { setUsageModalVisible(false); setUsageData(null); }}
        footer={null}
        width={720}
      >
        <Spin spinning={usageLoading}>
          {usageData ? (
            <>
              <p>
                <Text strong>{usageData.field_key}</Text>
                <Text type="secondary"> in </Text>
                <Tag>{usageData.material_class}{usageData.profile ? `/${usageData.profile}` : ''}</Tag>
                <Text type="secondary"> · spec table </Text>
                <Text code>{usageData.spec_table || '(none)'}</Text>
              </p>
              <p>
                <Tag color={usageData.count > 0 ? 'orange' : 'green'}>
                  {usageData.count} spec row{usageData.count === 1 ? '' : 's'} have data for this field
                </Tag>
              </p>
              <Table
                size="small"
                rowKey={(r, i) => `${r.mainitem}_${i}`}
                dataSource={usageData.samples || []}
                pagination={false}
                columns={[
                  { title: 'Mainitem', dataIndex: 'mainitem', key: 'm' },
                  { title: 'Value', dataIndex: 'value', key: 'v', width: 200, render: v => <Text code style={{ fontSize: 11 }}>{String(v ?? '')}</Text> },
                  { title: 'Updated', dataIndex: 'updated_at', key: 'u', width: 160, render: v => v ? new Date(v).toLocaleString() : '-' },
                ]}
              />
              {usageData.count > (usageData.samples?.length || 0) && (
                <Text type="secondary" style={{ fontSize: 11 }}>Showing first {usageData.samples?.length || 0} of {usageData.count}.</Text>
              )}
            </>
          ) : null}
        </Spin>
      </Modal>

      {/* Schema lint modal */}
      <Modal
        title={<><BugOutlined /> Schema Lint ({lintIssues.length} issue{lintIssues.length === 1 ? '' : 's'})</>}
        open={lintModalVisible}
        onCancel={() => setLintModalVisible(false)}
        footer={<Button onClick={runLint}>Re-run</Button>}
        width={900}
      >
        <Spin spinning={lintLoading}>
          {!lintIssues.length ? (
            <Tag color="green"><CheckOutlined /> No issues detected</Tag>
          ) : (
            <Table
              size="small"
              rowKey={(r, i) => `${r.id}_${i}`}
              dataSource={lintIssues}
              pagination={{ pageSize: 15, size: 'small' }}
              columns={[
                { title: 'Sev', dataIndex: 'severity', key: 's', width: 70,
                  render: v => <Tag color={v === 'error' ? 'red' : v === 'warn' ? 'orange' : 'blue'}>{v}</Tag> },
                { title: 'Class', dataIndex: 'material_class', key: 'mc', width: 110 },
                { title: 'Profile', dataIndex: 'profile', key: 'p', width: 110, render: v => v || '-' },
                { title: 'Field Key', dataIndex: 'field_key', key: 'fk', width: 160, render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                { title: 'Issue', dataIndex: 'issue', key: 'i' },
              ]}
            />
          )}
        </Spin>
      </Modal>

      {/* Import preview modal */}
      <Modal
        title="Import Parameter Definitions"
        open={importModalVisible}
        onCancel={() => { setImportModalVisible(false); setImportPlan(null); setImportRaw(null); }}
        onOk={confirmImport}
        confirmLoading={importing}
        okText={`Apply (${importMode})`}
        okButtonProps={{ danger: importMode === 'replace' }}
        width={620}
      >
        {importPlan ? (
          <>
            <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
              Dry-run results. Choose a mode then Apply.
            </Text>
            <Space style={{ marginBottom: 12 }}>
              <Text>Mode:</Text>
              <Select size="small" value={importMode} style={{ width: 160 }}
                onChange={v => setImportMode(v)}
                options={[
                  { label: 'merge (upsert only)', value: 'merge' },
                  { label: 'replace (upsert + delete extras)', value: 'replace' },
                ]} />
            </Space>
            <Row gutter={12}>
              <Col span={6}><Tag color="green" style={{ width: '100%', textAlign: 'center', padding: '4px 8px' }}>Create: {importPlan.to_create}</Tag></Col>
              <Col span={6}><Tag color="blue" style={{ width: '100%', textAlign: 'center', padding: '4px 8px' }}>Update: {importPlan.to_update}</Tag></Col>
              <Col span={6}><Tag color={importMode === 'replace' ? 'red' : 'default'} style={{ width: '100%', textAlign: 'center', padding: '4px 8px' }}>Delete: {importMode === 'replace' ? importPlan.to_delete : 0}</Tag></Col>
              <Col span={6}><Tag color="orange" style={{ width: '100%', textAlign: 'center', padding: '4px 8px' }}>Conflicts: {importPlan.conflicts?.length || 0}</Tag></Col>
            </Row>
            {Object.keys(importPlan.by_class || {}).length > 0 && (
              <div style={{ marginTop: 12 }}>
                <Text strong style={{ fontSize: 12 }}>Per material_class:</Text>
                <div style={{ marginTop: 4 }}>
                  {Object.entries(importPlan.by_class).map(([k, v]) => <Tag key={k}>{k}: {v}</Tag>)}
                </div>
              </div>
            )}
            {importPlan.conflicts?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <Text strong style={{ fontSize: 12, color: '#dc2626' }}>Conflicts:</Text>
                <ul style={{ fontSize: 11, paddingLeft: 18 }}>
                  {importPlan.conflicts.slice(0, 10).map((c, i) => <li key={i}>{c.field_key || '(no key)'} — {c.reason}</li>)}
                </ul>
              </div>
            )}
          </>
        ) : <Spin />}
      </Modal>
    </>
  );
}
