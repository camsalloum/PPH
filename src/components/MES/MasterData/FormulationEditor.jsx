/**
 * FormulationsTab — Universal BOM / Formulation editor for MES Master Data.
 * Shown inside the Category Group detail modal for ALL categories.
 *
 * Props:
 *   catId         {number}  — mes_item_categories.id
 *   catlinedesc   {string}  — Oracle catlinedesc of the selected group
 *   materialClass {string}  — e.g. 'adhesives', 'inks', 'resins'
 *   headers       {object}  — axios auth headers
 *   categories    {array}   — [{id, name, material_class}] from parent
 *   fmtCurrency   {fn}      — (value, decimals) → ReactNode
 *   fmtNum        {fn}      — (value, decimals) → string
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Button,
  Modal,
  Input,
  InputNumber,
  Select,
  Space,
  Tag,
  Card,
  Row,
  Col,
  Typography,
  App,
  Spin,
  Popconfirm,
  Table,
  Alert,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SearchOutlined,
  ArrowLeftOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;
const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const ROLE_OPTIONS_BY_CLASS = {
  adhesives: [
    { value: 'resin', label: 'Resin' },
    { value: 'hardener', label: 'Hardener' },
    { value: 'catalyst', label: 'Catalyst' },
    { value: 'solvent', label: 'Solvent' },
    { value: 'other', label: 'Other' },
  ],
  inks: [
    { value: 'pigment', label: 'Pigment' },
    { value: 'binder', label: 'Binder' },
    { value: 'solvent', label: 'Solvent' },
    { value: 'additive', label: 'Additive' },
    { value: 'other', label: 'Other' },
  ],
};
const GENERIC_ROLE_OPTIONS = [
  { value: 'base', label: 'Base' },
  { value: 'additive', label: 'Additive' },
  { value: 'diluent', label: 'Diluent' },
  { value: 'other', label: 'Other' },
];

function getRoleOptions(materialClass) {
  return ROLE_OPTIONS_BY_CLASS[String(materialClass || '').toLowerCase()] || GENERIC_ROLE_OPTIONS;
}

function computeTotals(components) {
  const comps = Array.isArray(components) ? components : [];
  let totalParts = 0;
  let totalSolids = 0;
  let totalCost = 0;
  comps.forEach((c) => {
    const parts = Number(c.parts) || 0;
    if (parts <= 0) return;
    totalParts += parts;
    totalSolids += parts * ((Number(c.solids_pct) || 0) / 100);
    totalCost += parts * (Number(c.unit_price) || 0);
  });
  const round = (v, d) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
  return {
    total_parts: round(totalParts, 4),
    total_solids: round(totalSolids, 4),
    total_cost: round(totalCost, 4),
    price_per_kg_wet: totalParts > 0 ? round(totalCost / totalParts, 4) : null,
    price_per_kg_solids: totalSolids > 0 ? round(totalCost / totalSolids, 4) : null,
    solids_share_pct: totalParts > 0 ? round((totalSolids / totalParts) * 100, 2) : null,
  };
}

function statusColor(status) {
  if (status === 'active') return 'green';
  if (status === 'archived') return 'default';
  return 'blue'; // draft
}

// ─── Main export ─────────────────────────────────────────────────────────────
export default function FormulationsTab({
  catId,
  catlinedesc,
  materialClass,
  headers,
  categories,
  fmtCurrency,
  fmtNum,
}) {
  const { message, modal } = App.useApp();

  // ── Formulation list ─────────────────────────────────────────────────────
  const [formulations, setFormulations] = useState([]);
  const [listLoading, setListLoading] = useState(false);

  // ── Active formulation (BOM editor) ──────────────────────────────────────
  const [activeFormulation, setActiveFormulation] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [components, setComponents] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Create formulation modal ──────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createNotes, setCreateNotes] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // ── Component picker — 3-step cascading ──────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCatId, setPickerCatId] = useState(null);    // step 1
  const [pickerCatDesc, setPickerCatDesc] = useState(null); // step 2
  const [pickerItemKey, setPickerItemKey] = useState(null); // step 3
  const [pickerGroups, setPickerGroups] = useState([]);
  const [pickerItems, setPickerItems] = useState([]);
  const [pickerGroupsLoading, setPickerGroupsLoading] = useState(false);
  const [pickerItemsLoading, setPickerItemsLoading] = useState(false);

  // ── Sub-formulation picker ────────────────────────────────────────────────
  const [subPickerOpen, setSubPickerOpen] = useState(false);
  const [subPickerRows, setSubPickerRows] = useState([]);
  const [subPickerSearch, setSubPickerSearch] = useState('');
  const [subPickerLoading, setSubPickerLoading] = useState(false);
  const [subPickerSelectedId, setSubPickerSelectedId] = useState(null);

  // ── Quick estimate ────────────────────────────────────────────────────────
  const [quickGSM, setQuickGSM] = useState(3);

  // ── Derived ──────────────────────────────────────────────────────────────
  const roleOptions = useMemo(() => getRoleOptions(materialClass), [materialClass]);

  const totals = useMemo(() => computeTotals(components), [components]);

  const quickEstimate = useMemo(() => {
    const deposit = Math.max(0, Number(quickGSM) || 0);
    const solidsPct = totals.solids_share_pct || 0;
    const priceWet = totals.price_per_kg_wet || 0;
    const wetGSM = solidsPct > 0 ? deposit / (solidsPct / 100) : 0;
    const costSqm = wetGSM * priceWet / 1000;
    return {
      wet_gsm: Math.round(wetGSM * 10000) / 10000,
      cost_per_sqm: Math.round(costSqm * 1000000) / 1000000,
      cost_per_1000_sqm: Math.round(costSqm * 1000 * 10000) / 10000,
    };
  }, [quickGSM, totals]);

  // Formulations grouped by name (all versions)
  const formulationsByName = useMemo(() => {
    const map = new Map();
    formulations.forEach((f) => {
      if (!map.has(f.name)) map.set(f.name, []);
      map.get(f.name).push(f);
    });
    return Array.from(map.entries()).map(([name, versions]) => ({
      name,
      versions: [...versions].sort((a, b) => b.version - a.version),
    }));
  }, [formulations]);

  // Item keys already in the BOM (to prevent duplicates)
  const existingItemKeys = useMemo(
    () => new Set(
      components
        .filter((c) => c.component_type === 'item')
        .map((c) => c.item_key)
        .filter(Boolean)
    ),
    [components]
  );

  // Sub-formulation IDs already in the BOM
  const existingSubIds = useMemo(
    () => new Set(
      components
        .filter((c) => c.component_type === 'formulation')
        .map((c) => c.sub_formulation_id)
        .filter(Boolean)
    ),
    [components]
  );

  const isReadOnly = activeFormulation?.status === 'active';

  // Category options for picker Step 1
  const categoryOptions = useMemo(
    () => (categories || []).map((c) => ({ value: c.id, label: c.name })),
    [categories]
  );

  // ── API: Formulation list ─────────────────────────────────────────────────
  const fetchList = useCallback(async () => {
    if (!catId || !catlinedesc) return;
    setListLoading(true);
    try {
      const res = await axios.get(`${API}/api/mes/master-data/formulations/by-group`, {
        headers,
        params: { category_id: catId, catlinedesc },
      });
      setFormulations(res.data.data || []);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to load formulations');
    } finally {
      setListLoading(false);
    }
  }, [catId, catlinedesc, headers, message]);

  // Reset when group changes
  useEffect(() => {
    setFormulations([]);
    setActiveFormulation(null);
    setComponents([]);
    setDirty(false);
    fetchList();
  }, [catId, catlinedesc]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── API: Open single formulation ─────────────────────────────────────────
  const openFormulation = useCallback(async (id) => {
    setDetailLoading(true);
    try {
      const res = await axios.get(`${API}/api/mes/master-data/formulations/${id}`, { headers });
      const data = res.data.data;
      setActiveFormulation(data);
      setComponents(data.components || []);
      setDirty(false);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to load formulation');
    } finally {
      setDetailLoading(false);
    }
  }, [headers, message]);

  // ── Back to list ─────────────────────────────────────────────────────────
  const handleBack = useCallback(() => {
    if (dirty) {
      modal.confirm({
        title: 'Unsaved changes',
        content: 'Leave without saving?',
        okText: 'Leave',
        okType: 'danger',
        cancelText: 'Stay',
        onOk: () => { setActiveFormulation(null); setComponents([]); setDirty(false); },
      });
      return;
    }
    setActiveFormulation(null);
    setComponents([]);
  }, [dirty, modal]);

  // ── API: Create formulation ───────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    const name = createName.trim();
    if (!name || !catId || !catlinedesc) return;
    setCreateLoading(true);
    try {
      const res = await axios.post(`${API}/api/mes/master-data/formulations`, {
        category_id: catId,
        catlinedesc,
        name,
        notes: createNotes.trim() || null,
      }, { headers });
      message.success(`Formulation "${name}" created`);
      setCreateOpen(false);
      setCreateName('');
      setCreateNotes('');
      await fetchList();
      openFormulation(res.data.data.id);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to create formulation');
    } finally {
      setCreateLoading(false);
    }
  }, [createName, createNotes, catId, catlinedesc, headers, message, fetchList, openFormulation]);

  // ── API: Save components (full replacement) ──────────────────────────────
  const handleSaveComponents = useCallback(async () => {
    if (!activeFormulation) return;
    const invalid = components.filter((c) => !(Number(c.parts) > 0));
    if (invalid.length) {
      message.warning('All components must have Parts > 0 before saving');
      return;
    }
    const payload = components.map((c, i) => ({
      component_type: c.component_type || 'item',
      item_key: c.component_type === 'item' ? c.item_key : null,
      sub_formulation_id: c.component_type === 'formulation' ? c.sub_formulation_id : null,
      component_role: c.component_role || 'other',
      parts: Number(c.parts),
      solids_pct: c.solids_pct_source === 'override' ? Number(c.solids_pct) : null,
      unit_price_override: c.unit_price_source === 'override' ? Number(c.unit_price) : null,
      sort_order: i,
      notes: c.notes || null,
    }));
    setSaving(true);
    try {
      const res = await axios.put(
        `${API}/api/mes/master-data/formulations/${activeFormulation.id}/components`,
        { components: payload },
        { headers }
      );
      const data = res.data.data;
      setActiveFormulation((prev) => ({ ...prev, ...data }));
      setComponents(data.components || []);
      setDirty(false);
      message.success('BOM saved');
      fetchList();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to save BOM');
    } finally {
      setSaving(false);
    }
  }, [activeFormulation, components, headers, message, fetchList]);

  // ── API: Duplicate ────────────────────────────────────────────────────────
  const handleDuplicate = useCallback(async (id, asNewVersion = true) => {
    try {
      const res = await axios.post(
        `${API}/api/mes/master-data/formulations/${id}/duplicate`,
        { as_new_version: asNewVersion },
        { headers }
      );
      message.success('Formulation duplicated');
      await fetchList();
      openFormulation(res.data.data.id);
    } catch (err) {
      message.error(err.response?.data?.error || 'Duplicate failed');
    }
  }, [headers, message, fetchList, openFormulation]);

  // ── API: Change status ────────────────────────────────────────────────────
  const handleStatusChange = useCallback(async (id, status) => {
    try {
      await axios.put(`${API}/api/mes/master-data/formulations/${id}`, { status }, { headers });
      message.success(`Status → ${status}`);
      await fetchList();
      if (activeFormulation?.id === id) openFormulation(id);
    } catch (err) {
      message.error(err.response?.data?.error || 'Status change failed');
    }
  }, [headers, message, fetchList, activeFormulation, openFormulation]);

  // ── API: Set default ──────────────────────────────────────────────────────
  const handleSetDefault = useCallback(async (id) => {
    try {
      await axios.put(`${API}/api/mes/master-data/formulations/${id}`, { is_default: true }, { headers });
      message.success('Default formulation updated');
      fetchList();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to set default');
    }
  }, [headers, message, fetchList]);

  // ── API: Delete ───────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id) => {
    try {
      await axios.delete(`${API}/api/mes/master-data/formulations/${id}`, { headers });
      message.success('Formulation deleted');
      if (activeFormulation?.id === id) { setActiveFormulation(null); setComponents([]); setDirty(false); }
      fetchList();
    } catch (err) {
      message.error(err.response?.data?.error || 'Delete failed');
    }
  }, [headers, message, fetchList, activeFormulation]);

  // ── Local component state management ─────────────────────────────────────
  const updateComponent = useCallback((idx, updates) => {
    setComponents((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...updates };
      return next;
    });
    setDirty(true);
  }, []);

  const removeComponent = useCallback((idx) => {
    setComponents((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }, []);

  // ── Picker Step 2: load groups when category selected ─────────────────────
  useEffect(() => {
    if (!pickerCatId || !pickerOpen || !activeFormulation) return;
    setPickerCatDesc(null);
    setPickerItemKey(null);
    setPickerGroups([]);
    setPickerItems([]);
    setPickerGroupsLoading(true);
    axios.get(`${API}/api/mes/master-data/formulations/${activeFormulation.id}/candidates`, {
      headers,
      params: { category_id: pickerCatId },
    })
      .then((res) => setPickerGroups(res.data.data || []))
      .catch(() => setPickerGroups([]))
      .finally(() => setPickerGroupsLoading(false));
  }, [pickerCatId, pickerOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Picker Step 3: load items when group selected ─────────────────────────
  useEffect(() => {
    if (!pickerCatId || !pickerCatDesc || !pickerOpen || !activeFormulation) return;
    setPickerItemKey(null);
    setPickerItems([]);
    setPickerItemsLoading(true);
    axios.get(`${API}/api/mes/master-data/formulations/${activeFormulation.id}/candidates`, {
      headers,
      params: { category_id: pickerCatId, catlinedesc: pickerCatDesc },
    })
      .then((res) => setPickerItems(res.data.data || []))
      .catch(() => setPickerItems([]))
      .finally(() => setPickerItemsLoading(false));
  }, [pickerCatDesc, pickerOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickerPreview = useMemo(
    () => pickerItemKey ? (pickerItems.find((i) => i.item_key === pickerItemKey) || null) : null,
    [pickerItemKey, pickerItems]
  );

  const resetPicker = useCallback(() => {
    setPickerOpen(false);
    setPickerCatId(null);
    setPickerCatDesc(null);
    setPickerItemKey(null);
    setPickerGroups([]);
    setPickerItems([]);
  }, []);

  const handleAddComponent = useCallback(() => {
    if (!pickerItemKey || !pickerPreview) return;
    if (existingItemKeys.has(pickerItemKey)) { message.info('Item already in this formulation'); return; }
    const stockPrice = Number(pickerPreview.stock_cost_wa) || null;
    const orderPrice = Number(pickerPreview.purchase_cost_wa) || null;
    const defaultPrice = stockPrice ?? orderPrice ?? null;
    const priceSource = stockPrice != null ? 'oracle_stock' : (orderPrice != null ? 'oracle_order' : null);
    const solidsPct = pickerPreview.tds_solids_pct != null ? Number(pickerPreview.tds_solids_pct) : null;

    setComponents((prev) => [...prev, {
      component_type: 'item',
      item_key: pickerItemKey,
      mainitem: pickerPreview.mainitem,
      maindescription: pickerPreview.maindescription || null,
      catlinedesc: pickerPreview.catlinedesc || null,
      component_role: 'other',
      parts: null,
      solids_pct: solidsPct,
      solids_pct_source: solidsPct != null ? 'tds' : null,
      tds_solids_pct: solidsPct,
      unit_price: defaultPrice,
      unit_price_source: priceSource,
      oracle_stock_price: stockPrice,
      oracle_order_price: orderPrice,
      sort_order: prev.length,
    }]);
    setDirty(true);
    message.success(`${pickerPreview.mainitem} added`);
    resetPicker();
  }, [pickerItemKey, pickerPreview, existingItemKeys, message, resetPicker]);

  // ── Sub-formulation picker ────────────────────────────────────────────────
  const openSubPicker = useCallback(async () => {
    if (!activeFormulation) return;
    setSubPickerOpen(true);
    setSubPickerLoading(true);
    setSubPickerSearch('');
    setSubPickerSelectedId(null);
    try {
      const res = await axios.get(
        `${API}/api/mes/master-data/formulations/${activeFormulation.id}/sub-candidates`,
        { headers }
      );
      setSubPickerRows(res.data.data || []);
    } catch {
      setSubPickerRows([]);
    } finally {
      setSubPickerLoading(false);
    }
  }, [activeFormulation, headers]);

  const filteredSubRows = useMemo(() => {
    const q = subPickerSearch.trim().toLowerCase();
    if (!q) return subPickerRows;
    return subPickerRows.filter((r) =>
      String(r.name || '').toLowerCase().includes(q) ||
      String(r.category_name || '').toLowerCase().includes(q) ||
      String(r.catlinedesc || '').toLowerCase().includes(q)
    );
  }, [subPickerRows, subPickerSearch]);

  const handleAddSubFormulation = useCallback(() => {
    if (!subPickerSelectedId) return;
    const row = subPickerRows.find((r) => r.id === subPickerSelectedId);
    if (!row) return;
    if (existingSubIds.has(row.id)) { message.info('Already in BOM'); return; }
    setComponents((prev) => [...prev, {
      component_type: 'formulation',
      sub_formulation_id: row.id,
      sub_formulation_name: `${row.name} v${row.version}`,
      sub_formulation_status: row.status,
      component_role: 'base',
      parts: null,
      solids_pct: null,
      solids_pct_source: 'resolved',
      unit_price: null,
      unit_price_source: 'resolved',
      sort_order: prev.length,
    }]);
    setDirty(true);
    setSubPickerOpen(false);
    setSubPickerSelectedId(null);
    message.success(`${row.name} v${row.version} added as sub-formulation`);
  }, [subPickerSelectedId, subPickerRows, existingSubIds, message]);

  // ─────────────────────────────────────────────────────────────────────────
  // LIST VIEW (no active formulation)
  // ─────────────────────────────────────────────────────────────────────────
  if (!activeFormulation) {
    return (
      <Spin spinning={listLoading}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text strong style={{ fontSize: 14 }}>Formulations — {catlinedesc}</Text>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            New Formulation
          </Button>
        </div>

        {!formulations.length && !listLoading && (
          <Alert
            type="info"
            showIcon
            message="No formulations yet"
            description={`Create the first BOM for "${catlinedesc}" using the button above.`}
          />
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          {formulationsByName.map(({ name, versions }) => (
            <Card key={name} size="small" style={{ border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{name}</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {versions.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      flexWrap: 'wrap',
                      padding: '4px 0',
                      borderTop: '1px solid #f0f0f0',
                    }}
                  >
                    <Space size={6} wrap>
                      <Tag color={statusColor(f.status)} style={{ fontSize: 11 }}>
                        v{f.version} · {f.status}
                      </Tag>
                      {f.is_default && <Tag color="gold" style={{ fontSize: 11 }}>Default</Tag>}
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {f.component_count} component{f.component_count !== 1 ? 's' : ''}
                      </Text>
                      {f.price_per_kg_wet != null && (
                        <Text style={{ fontSize: 11 }}>
                          {fmtCurrency(f.price_per_kg_wet, 4)} / kg wet
                        </Text>
                      )}
                      {f.solids_share_pct != null && (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          Solids: {Number(f.solids_share_pct).toFixed(1)}%
                        </Text>
                      )}
                    </Space>
                    <Space size={4}>
                      <Button size="small" onClick={() => openFormulation(f.id)}>
                        Open v{f.version}
                      </Button>
                      <Tooltip title="Duplicate as new version">
                        <Button
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => handleDuplicate(f.id, true)}
                        />
                      </Tooltip>
                      <Popconfirm
                        title={`Delete v${f.version} of "${f.name}"?`}
                        onConfirm={() => handleDelete(f.id)}
                        okText="Delete"
                        okButtonProps={{ danger: true }}
                      >
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>

        {/* New Formulation Modal */}
        <Modal
          title={`New Formulation — ${catlinedesc}`}
          open={createOpen}
          onCancel={() => { setCreateOpen(false); setCreateName(''); setCreateNotes(''); }}
          onOk={handleCreate}
          okText="Create"
          confirmLoading={createLoading}
          okButtonProps={{ disabled: !createName.trim() }}
          destroyOnHidden
        >
          <div style={{ display: 'grid', gap: 12, paddingTop: 4 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Name *</div>
              <Input
                autoFocus
                placeholder="e.g. MORBOND 655 / CT85 / EA"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                maxLength={255}
                onPressEnter={handleCreate}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Notes (optional)</div>
              <Input.TextArea
                rows={2}
                value={createNotes}
                onChange={(e) => setCreateNotes(e.target.value)}
                maxLength={1000}
              />
            </div>
          </div>
        </Modal>
      </Spin>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BOM EDITOR VIEW (active formulation)
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Spin spinning={detailLoading}>

      {/* ── Header bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>Back</Button>
          <div>
            <Text strong style={{ fontSize: 15 }}>{activeFormulation.name}</Text>
            <Text type="secondary" style={{ marginLeft: 6 }}>v{activeFormulation.version}</Text>
            <Tag color={statusColor(activeFormulation.status)} style={{ marginLeft: 6 }}>
              {activeFormulation.status}
            </Tag>
            {activeFormulation.is_default && <Tag color="gold">Default</Tag>}
            {dirty && <Tag color="gold">Unsaved</Tag>}
          </div>
        </Space>

        <Space wrap>
          {!isReadOnly && (
            <Button type="primary" loading={saving} onClick={handleSaveComponents}>
              Save BOM{dirty ? ' *' : ''}
            </Button>
          )}
          <Button
            icon={<CopyOutlined />}
            onClick={() => handleDuplicate(activeFormulation.id, true)}
          >
            Duplicate → v{activeFormulation.version + 1}
          </Button>
          {activeFormulation.status === 'draft' && (
            <Popconfirm
              title="Activate this formulation?"
              description="Other versions with the same name will be archived."
              onConfirm={() => handleStatusChange(activeFormulation.id, 'active')}
            >
              <Button type="primary" ghost>Set Active</Button>
            </Popconfirm>
          )}
          {activeFormulation.status === 'active' && (
            <Popconfirm
              title="Archive this formulation?"
              onConfirm={() => handleStatusChange(activeFormulation.id, 'archived')}
            >
              <Button>Archive</Button>
            </Popconfirm>
          )}
          {!activeFormulation.is_default && activeFormulation.status === 'active' && (
            <Button onClick={() => handleSetDefault(activeFormulation.id)}>Set as Default</Button>
          )}
          <Button
            icon={<ReloadOutlined />}
            onClick={() => openFormulation(activeFormulation.id)}
          />
        </Space>
      </div>

      {/* ── Read-only warning ── */}
      {isReadOnly && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 10 }}
          message="Active formulation is read-only"
          description='Duplicate to create a new draft version, then edit there.'
        />
      )}

      {/* ── Add buttons ── */}
      {!isReadOnly && (
        <Space wrap style={{ marginBottom: 10 }}>
          <Button icon={<PlusOutlined />} onClick={() => setPickerOpen(true)}>Add Item</Button>
          <Button icon={<PlusOutlined />} onClick={openSubPicker}>Add Sub-Formulation</Button>
        </Space>
      )}

      {/* ── BOM table ── */}
      <Table
        size="small"
        pagination={false}
        dataSource={components.map((c, i) => ({ ...c, _idx: i }))}
        rowKey="_idx"
        tableLayout="fixed"
        scroll={{ x: 1120, y: 340 }}
        locale={{ emptyText: 'No components yet — click "Add Item" or "Add Sub-Formulation" above.' }}
        columns={[
          {
            title: 'Component',
            ellipsis: true,
            render: (_, row) => row.component_type === 'formulation' ? (
              <div>
                <Text strong style={{ fontSize: 12 }}>
                  📦 {row.sub_formulation_name || `Formulation #${row.sub_formulation_id}`}
                </Text>
                <Tag color={statusColor(row.sub_formulation_status)} style={{ marginLeft: 4, fontSize: 10 }}>
                  {row.sub_formulation_status}
                </Tag>
              </div>
            ) : (
              <div style={{ minWidth: 0 }}>
                <Text strong style={{ fontSize: 12 }}>{row.mainitem || row.item_key}</Text>
                <div><Text type="secondary" style={{ fontSize: 11 }}>{row.maindescription || '—'}</Text></div>
                {row.catlinedesc && <Tag style={{ fontSize: 10 }}>{row.catlinedesc}</Tag>}
              </div>
            ),
          },
          {
            title: 'Role',
            width: 118,
            render: (_, row) => (
              <Select
                size="small"
                style={{ width: '100%' }}
                value={row.component_role || 'other'}
                options={roleOptions}
                disabled={isReadOnly}
                onChange={(v) => updateComponent(row._idx, { component_role: v })}
              />
            ),
          },
          {
            title: 'Parts',
            width: 88,
            align: 'center',
            render: (_, row) => (
              <InputNumber
                size="small"
                min={0.0001}
                step={1}
                style={{ width: '100%' }}
                value={row.parts}
                disabled={isReadOnly}
                onChange={(v) => updateComponent(row._idx, { parts: v })}
              />
            ),
          },
          {
            title: 'Solids %',
            width: 116,
            align: 'center',
            render: (_, row) => {
              const src = row.solids_pct_source;
              const badge = src === 'override' ? { label: 'O', color: 'orange', tip: 'Manual override' }
                : src === 'tds' ? { label: 'T', color: 'blue', tip: 'From TDS' }
                : src === 'resolved' ? { label: 'R', color: 'purple', tip: 'Resolved from sub-formulation' }
                : null;
              return (
                <div style={{ display: 'grid', gap: 2 }}>
                  <InputNumber
                    size="small"
                    min={0}
                    max={100}
                    step={0.1}
                    style={{ width: '100%' }}
                    value={row.solids_pct}
                    disabled={isReadOnly || row.component_type === 'formulation'}
                    onChange={(v) => {
                      if (v == null) {
                        const tds = row.tds_solids_pct ?? null;
                        updateComponent(row._idx, { solids_pct: tds, solids_pct_source: tds != null ? 'tds' : null });
                      } else {
                        updateComponent(row._idx, { solids_pct: v, solids_pct_source: 'override' });
                      }
                    }}
                  />
                  {badge && (
                    <Tooltip title={badge.tip}>
                      <Tag color={badge.color} style={{ margin: 0, fontSize: 9, width: 'fit-content' }}>{badge.label}</Tag>
                    </Tooltip>
                  )}
                </div>
              );
            },
          },
          {
            title: '$/kg',
            width: 104,
            align: 'center',
            render: (_, row) => {
              const src = row.unit_price_source;
              const badge = src === 'override' ? { label: 'O', color: 'orange' }
                : src === 'oracle_stock' ? { label: 'St', color: 'green' }
                : src === 'oracle_order' ? { label: 'Or', color: 'cyan' }
                : src === 'oracle_avg' ? { label: 'Av', color: 'blue' }
                : src === 'resolved' ? { label: 'R', color: 'purple' }
                : null;
              return (
                <div style={{ display: 'grid', gap: 2 }}>
                  <InputNumber
                    size="small"
                    min={0}
                    step={0.0001}
                    style={{ width: '100%' }}
                    value={row.unit_price}
                    disabled={isReadOnly || row.component_type === 'formulation'}
                    onChange={(v) => {
                      if (v == null) {
                        const fb = row.oracle_stock_price ?? row.oracle_order_price ?? row.oracle_avg_price ?? null;
                        const fbSrc = row.oracle_stock_price != null ? 'oracle_stock'
                          : row.oracle_order_price != null ? 'oracle_order'
                          : row.oracle_avg_price != null ? 'oracle_avg'
                          : null;
                        updateComponent(row._idx, { unit_price: fb, unit_price_source: fbSrc });
                      } else {
                        updateComponent(row._idx, { unit_price: v, unit_price_source: 'override' });
                      }
                    }}
                  />
                  {badge && (
                    <Tag color={badge.color} style={{ margin: 0, fontSize: 9, width: 'fit-content' }}>{badge.label}</Tag>
                  )}
                </div>
              );
            },
          },
          {
            title: 'Cost',
            width: 88,
            align: 'center',
            render: (_, row) => {
              const v = (Number(row.parts) || 0) * (Number(row.unit_price) || 0);
              return <Text strong>{fmtCurrency(v, 2)}</Text>;
            },
          },
          {
            title: 'Notes',
            width: 150,
            render: (_, row) => (
              <Input
                size="small"
                maxLength={500}
                value={row.notes || ''}
                disabled={isReadOnly}
                onChange={(e) => updateComponent(row._idx, { notes: e.target.value || null })}
              />
            ),
          },
          {
            title: '',
            width: 50,
            align: 'center',
            render: (_, row) => isReadOnly ? null : (
              <Popconfirm
                title="Remove this component?"
                onConfirm={() => removeComponent(row._idx)}
                okText="Remove"
                okButtonProps={{ danger: true }}
              >
                <Button type="link" danger size="small">×</Button>
              </Popconfirm>
            ),
          },
        ]}
      />

      {/* Legend */}
      <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
        T = from TDS &nbsp;·&nbsp; O = manual override &nbsp;·&nbsp; R = resolved from sub-formulation
        &nbsp;·&nbsp; St/Or/Av = Oracle stock / order / avg price
      </Text>

      {/* ── Summary + Quick Estimate ── */}
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} xl={12}>
          <Card size="small" title="Summary">
            <Row gutter={[8, 8]}>
              {[
                { label: 'Total Parts', value: fmtNum(totals.total_parts, 4) },
                { label: 'Total Solids', value: fmtNum(totals.total_solids, 4) },
                { label: 'Total Cost', value: fmtCurrency(totals.total_cost, 2) },
                { label: '$/kg (Wet)', value: fmtCurrency(totals.price_per_kg_wet, 4) },
                { label: '$/kg (Solids)', value: fmtCurrency(totals.price_per_kg_solids, 4) },
                { label: 'Solids Share %', value: totals.solids_share_pct != null ? `${totals.solids_share_pct.toFixed(2)}%` : '—' },
              ].map(({ label, value }) => (
                <Col span={12} key={label}>
                  <Text type="secondary" style={{ fontSize: 11 }}>{label}</Text>
                  <div><Text strong>{value}</Text></div>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card size="small" title="Quick Estimate">
            <Row gutter={[10, 8]}>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 11 }}>Deposit (g/m²)</Text>
                <InputNumber
                  size="small"
                  min={0}
                  step={0.01}
                  style={{ width: '100%', marginTop: 4 }}
                  value={quickGSM}
                  onChange={(v) => setQuickGSM(v ?? 0)}
                />
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 11 }}>Wet GSM</Text>
                <div style={{ marginTop: 6 }}><Text strong>{fmtNum(quickEstimate.wet_gsm, 4)}</Text></div>
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 11 }}>Cost / m²</Text>
                <div style={{ marginTop: 6 }}><Text strong>{fmtCurrency(quickEstimate.cost_per_sqm, 6)}</Text></div>
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 11 }}>Cost / 1000 m²</Text>
                <div style={{ marginTop: 6 }}><Text strong>{fmtCurrency(quickEstimate.cost_per_1000_sqm, 2)}</Text></div>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      {activeFormulation.notes && (
        <Alert type="info" style={{ marginTop: 10 }} message={`Notes: ${activeFormulation.notes}`} />
      )}

      {/* ── Component Picker Modal (3-step cascading) ── */}
      <Modal
        title="Add Component"
        open={pickerOpen}
        onCancel={resetPicker}
        footer={[
          <Button key="cancel" onClick={resetPicker}>Cancel</Button>,
          <Button
            key="add"
            type="primary"
            disabled={!pickerItemKey || !pickerPreview || pickerPreview.already_in_formulation}
            onClick={handleAddComponent}
          >
            Add ✓
          </Button>,
        ]}
        width={580}
        destroyOnHidden
      >
        <div style={{ display: 'grid', gap: 16, paddingTop: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Step 1 — Category</div>
            <Select
              style={{ width: '100%' }}
              placeholder="Select a category"
              value={pickerCatId}
              options={categoryOptions}
              onChange={(v) => { setPickerCatId(v); setPickerCatDesc(null); setPickerItemKey(null); }}
              showSearch
              filterOption={(input, opt) => String(opt.label || '').toLowerCase().includes(input.toLowerCase())}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Step 2 — Group</div>
            <Select
              style={{ width: '100%' }}
              placeholder={pickerCatId ? 'Select a group' : 'Select a category first'}
              disabled={!pickerCatId}
              loading={pickerGroupsLoading}
              value={pickerCatDesc}
              options={(pickerGroups || []).map((g) => ({ value: g.catlinedesc, label: g.catlinedesc }))}
              onChange={(v) => { setPickerCatDesc(v); setPickerItemKey(null); }}
              showSearch
              filterOption={(input, opt) => String(opt.label || '').toLowerCase().includes(input.toLowerCase())}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Step 3 — Item</div>
            <Select
              style={{ width: '100%' }}
              placeholder={pickerCatDesc ? 'Search or select item' : 'Select a group first'}
              disabled={!pickerCatDesc}
              loading={pickerItemsLoading}
              value={pickerItemKey}
              options={(pickerItems || []).map((item) => ({
                value: item.item_key,
                label: `${item.mainitem} — ${item.maindescription || ''}`,
                disabled: item.already_in_formulation,
              }))}
              onChange={(v) => setPickerItemKey(v)}
              showSearch
              filterOption={(input, opt) => String(opt.label || '').toLowerCase().includes(input.toLowerCase())}
            />
          </div>

          {pickerPreview && (
            <Card size="small" style={{ background: '#f8fbff', border: '1px solid #dbeafe' }}>
              <div>
                <Text strong>{pickerPreview.mainitem}</Text>
                {pickerPreview.maindescription && (
                  <Text type="secondary"> · {pickerPreview.maindescription}</Text>
                )}
              </div>
              <div style={{ marginTop: 2 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>{pickerPreview.catlinedesc}</Text>
              </div>
              <Row gutter={8} style={{ marginTop: 6 }}>
                <Col span={8}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Stock WA</Text>
                  <div><Text strong style={{ fontSize: 12 }}>{fmtCurrency(pickerPreview.stock_cost_wa, 4)}</Text></div>
                </Col>
                <Col span={8}>
                  <Text type="secondary" style={{ fontSize: 11 }}>On Order WA</Text>
                  <div><Text strong style={{ fontSize: 12 }}>{fmtCurrency(pickerPreview.purchase_cost_wa, 4)}</Text></div>
                </Col>
                <Col span={8}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Solids %</Text>
                  <div>
                    <Text strong style={{ fontSize: 12 }}>
                      {pickerPreview.tds_solids_pct != null ? `${pickerPreview.tds_solids_pct}%` : '—'}
                    </Text>
                  </div>
                </Col>
              </Row>
              {pickerPreview.already_in_formulation && (
                <Tag color="warning" style={{ marginTop: 6 }}>Already in this formulation</Tag>
              )}
            </Card>
          )}
        </div>
      </Modal>

      {/* ── Sub-Formulation Picker Modal ── */}
      <Modal
        title="Add Sub-Formulation"
        open={subPickerOpen}
        onCancel={() => { setSubPickerOpen(false); setSubPickerSelectedId(null); setSubPickerSearch(''); }}
        footer={[
          <Button key="cancel" onClick={() => { setSubPickerOpen(false); setSubPickerSelectedId(null); setSubPickerSearch(''); }}>
            Cancel
          </Button>,
          <Button key="add" type="primary" disabled={!subPickerSelectedId} onClick={handleAddSubFormulation}>
            Add ✓
          </Button>,
        ]}
        width={840}
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 10 }}
          message="Formulations that would create circular references are excluded from this list."
        />
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search by name, category, group"
          value={subPickerSearch}
          onChange={(e) => setSubPickerSearch(e.target.value || '')}
          style={{ marginBottom: 10, maxWidth: 400 }}
        />
        <Table
          size="small"
          rowKey="id"
          loading={subPickerLoading}
          dataSource={filteredSubRows}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ y: 320 }}
          rowSelection={{
            type: 'radio',
            selectedRowKeys: subPickerSelectedId ? [subPickerSelectedId] : [],
            onChange: (keys) => setSubPickerSelectedId(keys[0] ?? null),
            getCheckboxProps: (row) => ({ disabled: existingSubIds.has(row.id) }),
          }}
          onRow={(row) => ({
            onClick: () => {
              if (!existingSubIds.has(row.id)) setSubPickerSelectedId(row.id);
            },
            style: { cursor: existingSubIds.has(row.id) ? 'not-allowed' : 'pointer' },
          })}
          columns={[
            {
              title: 'Formulation',
              render: (_, row) => (
                <div>
                  <Text strong style={{ fontSize: 12 }}>{row.name}</Text>
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>v{row.version}</Text>
                  {existingSubIds.has(row.id) && <Tag color="warning" style={{ marginLeft: 4, fontSize: 10 }}>In BOM</Tag>}
                </div>
              ),
            },
            { title: 'Category', dataIndex: 'category_name', width: 110, ellipsis: true },
            { title: 'Group', dataIndex: 'catlinedesc', width: 120, ellipsis: true },
            {
              title: 'Status',
              dataIndex: 'status',
              width: 80,
              render: (v) => <Tag color={statusColor(v)} style={{ fontSize: 10 }}>{v}</Tag>,
            },
            { title: 'Components', dataIndex: 'component_count', width: 90, align: 'center' },
          ]}
        />
      </Modal>
    </Spin>
  );
}
