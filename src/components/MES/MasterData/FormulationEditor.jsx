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
  SettingOutlined,
  EditOutlined,
  CheckOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;
const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// Fallback if DB roles not yet loaded
const FALLBACK_ROLES = [
  { value: 'resin',    label: 'Resin'    },
  { value: 'hardener', label: 'Hardener' },
  { value: 'other',    label: 'Other'    },
];

// Cycling color palette for role badges
const ROLE_PALETTE = ['#3B82F6','#F59E0B','#10B981','#A78BFA','#F87171','#06B6D4','#84CC16','#F97316'];
const COMPARE_MAX = 5;
const COMPARE_LABELS = ['A', 'B', 'C', 'D', 'E'];
const COMPARE_COLORS = ['blue', 'purple', 'geekblue', 'magenta', 'cyan'];

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

  // ── Duplicate modal ──────────────────────────────────────────────────────
  const [dupOpen, setDupOpen] = useState(false);
  const [dupSourceId, setDupSourceId] = useState(null);
  const [dupSourceName, setDupSourceName] = useState('');
  const [dupMode, setDupMode] = useState('version'); // 'version' | 'name'
  const [dupName, setDupName] = useState('');
  const [dupLoading, setDupLoading] = useState(false);

  // ── Comparator (2-5 formulas) ──────────────────────────────────────────
  const [compareSelectedIds, setCompareSelectedIds] = useState([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareTargets, setCompareTargets] = useState([]);
  const [compareRows, setCompareRows] = useState([]);
  const [compareDiffOnly, setCompareDiffOnly] = useState(false);

  // ── Inline rename ─────────────────────────────────────────────────────────
  const [renamingName, setRenamingName] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);

  // ── Component picker — 3-step: category → group (catlinedesc) → items ────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCatId, setPickerCatId] = useState(null);      // step 1
  const [pickerGroupKey, setPickerGroupKey] = useState(null); // step 2 (catlinedesc)
  const [pickerGroups, setPickerGroups] = useState([]);
  const [pickerGroupsLoading, setPickerGroupsLoading] = useState(false);
  const [pickerItemKey, setPickerItemKey] = useState(null);   // step 3
  const [pickerItems, setPickerItems] = useState([]);
  const [pickerItemsLoading, setPickerItemsLoading] = useState(false);

  // ── Replace existing item component (dynamic candidates) ─────────────────
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceRowIdx, setReplaceRowIdx] = useState(null);
  const [replaceCatId, setReplaceCatId] = useState(null);
  const [replaceGroupKey, setReplaceGroupKey] = useState(null);
  const [replaceGroups, setReplaceGroups] = useState([]);
  const [replaceGroupsLoading, setReplaceGroupsLoading] = useState(false);
  const [replaceItemKey, setReplaceItemKey] = useState(null);
  const [replaceItems, setReplaceItems] = useState([]);
  const [replaceItemsLoading, setReplaceItemsLoading] = useState(false);

  // ── Sub-formulation picker ────────────────────────────────────────────────
  const [subPickerOpen, setSubPickerOpen] = useState(false);
  const [subPickerRows, setSubPickerRows] = useState([]);
  const [subPickerSearch, setSubPickerSearch] = useState('');
  const [subPickerLoading, setSubPickerLoading] = useState(false);
  const [subPickerSelectedId, setSubPickerSelectedId] = useState(null);

  // ── Quick estimate ────────────────────────────────────────────────────────
  const [quickGSM, setQuickGSM] = useState(3);

  // ── Component roles (DB-driven) ──────────────────────────────────────────
  const [roleOptions, setRoleOptions] = useState(FALLBACK_ROLES);
  const [manageRolesOpen, setManageRolesOpen] = useState(false);
  const [rolesEditing, setRolesEditing] = useState(null); // {id, label, sort_order} or null for new
  const [rolesNewLabel, setRolesNewLabel] = useState('');
  const [rolesNewValue, setRolesNewValue] = useState('');
  const [rolesLoading, setRolesLoading] = useState(false);

  const fetchRoles = useCallback(() => {
    if (!materialClass) return;
    const mc = String(materialClass).toLowerCase().trim();
    // Try class-specific first, fallback to _default
    axios.get(`${API}/api/mes/master-data/component-roles`, { headers, params: { material_class: mc } })
      .then((res) => {
        const rows = res.data.data || [];
        if (rows.length > 0) {
          setRoleOptions(rows.map(r => ({ value: r.value, label: r.label })));
        } else {
          // fallback to _default
          return axios.get(`${API}/api/mes/master-data/component-roles`, { headers, params: { material_class: '_default' } })
            .then((r2) => {
              const def = r2.data.data || [];
              setRoleOptions(def.length > 0 ? def.map(r => ({ value: r.value, label: r.label })) : FALLBACK_ROLES);
            });
        }
      })
      .catch(() => setRoleOptions(FALLBACK_ROLES));
  }, [materialClass, headers]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchRoles(); }, [materialClass]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ──────────────────────────────────────────────────────────────

  const totals = useMemo(() => computeTotals(components), [components]);

  // Maps role value → color (stable order from roleOptions)
  const roleColorMap = useMemo(() => {
    const map = {};
    roleOptions.forEach((r, i) => { map[r.value] = ROLE_PALETTE[i % ROLE_PALETTE.length]; });
    return map;
  }, [roleOptions]);

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

  const compareDisplayRows = useMemo(
    () => (compareDiffOnly ? compareRows.filter((r) => r.different) : compareRows),
    [compareRows, compareDiffOnly]
  );

  const compareSlotById = useMemo(() => {
    const map = new Map();
    compareSelectedIds.forEach((id, idx) => {
      map.set(Number(id), COMPARE_LABELS[idx] || `#${idx + 1}`);
    });
    return map;
  }, [compareSelectedIds]);

  useEffect(() => {
    setCompareSelectedIds((prev) => {
      const allowed = new Set((formulations || []).map((f) => f.id));
      const next = prev.filter((id) => allowed.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [formulations]);

  // Item keys already in the BOM (to prevent duplicates)
  const existingItemKeys = useMemo(
    () => new Set(
      components
        .filter((c) => c.component_type !== 'formulation')
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

  const handleRename = useCallback(async (oldName) => {
    const newName = renameValue.trim();
    if (!newName || newName === oldName) { setRenamingName(null); return; }
    setRenameLoading(true);
    try {
      const versions = formulations.filter((f) => f.name === oldName && f.status !== 'active');
      for (const f of versions) {
        await axios.put(`${API}/api/mes/master-data/formulations/${f.id}`, { name: newName }, { headers });
      }
      await fetchList();
      setRenamingName(null);
      message.success('Renamed');
    } catch (e) {
      message.error(e.response?.data?.error || 'Rename failed');
    } finally {
      setRenameLoading(false);
    }
  }, [renameValue, formulations, headers, fetchList, message]);

  // Reset when group changes
  useEffect(() => {
    setFormulations([]);
    setActiveFormulation(null);
    setComponents([]);
    setDirty(false);
    setCompareSelectedIds([]);
    setCompareOpen(false);
    setCompareTargets([]);
    setCompareRows([]);
    setCompareDiffOnly(false);
    fetchList();
  }, [catId, catlinedesc]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── API: Open single formulation ─────────────────────────────────────────
  const openFormulation = useCallback(async (id) => {
    setDetailLoading(true);
    // Scroll the modal body back to top so the sticky header is visible
    document.querySelector('.mes-fullscreen-modal .ant-modal-body')?.scrollTo({ top: 0 });
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
  const handleDuplicate = useCallback(async (id, asNewVersion = true, newName = '') => {
    try {
      const payload = { as_new_version: asNewVersion };
      if (!asNewVersion) payload.new_name = String(newName || '').trim();
      const res = await axios.post(
        `${API}/api/mes/master-data/formulations/${id}/duplicate`,
        payload,
        { headers }
      );
      message.success('Formulation duplicated');
      await fetchList();
      openFormulation(res.data.data.id);
      return res.data.data.id;
    } catch (err) {
      message.error(err.response?.data?.error || 'Duplicate failed');
      return null;
    }
  }, [headers, message, fetchList, openFormulation]);

  const openDuplicateModal = useCallback((id, currentName) => {
    setDupSourceId(id);
    setDupSourceName(String(currentName || ''));
    setDupMode('version');
    setDupName(String(currentName || ''));
    setDupOpen(true);
  }, []);

  const confirmDuplicate = useCallback(async () => {
    if (!dupSourceId) return;
    if (dupMode === 'name' && !dupName.trim()) {
      message.warning('Enter a name for the duplicated formulation');
      return;
    }
    setDupLoading(true);
    try {
      const createdId = await handleDuplicate(dupSourceId, dupMode === 'version', dupName);
      if (createdId) setDupOpen(false);
    } finally {
      setDupLoading(false);
    }
  }, [dupSourceId, dupMode, dupName, message, handleDuplicate]);

  const toggleCompareSelection = useCallback((id) => {
    const numId = Number(id);
    if (compareSelectedIds.includes(numId)) {
      setCompareSelectedIds(compareSelectedIds.filter((x) => x !== numId));
      return;
    }
    if (compareSelectedIds.length >= COMPARE_MAX) {
      message.info(`Select up to ${COMPARE_MAX} formulations to compare`);
      return;
    }
    setCompareSelectedIds([...compareSelectedIds, numId]);
  }, [compareSelectedIds, message]);

  const openComparator = useCallback(async () => {
    if (compareSelectedIds.length < 2 || compareSelectedIds.length > COMPARE_MAX) {
      message.warning(`Pick 2 to ${COMPARE_MAX} formulations to compare`);
      return;
    }
    setCompareLoading(true);
    try {
      const selectedIds = [...compareSelectedIds];
      const responses = await Promise.all(
        selectedIds.map((id) => axios.get(`${API}/api/mes/master-data/formulations/${id}`, { headers }))
      );
      const selectedFormulations = responses.map((r) => r.data?.data || null).filter(Boolean);
      if (selectedFormulations.length < 2) {
        message.warning('Need at least 2 valid formulations to compare');
        return;
      }

      const keyOf = (c) => {
        if (c.component_type === 'formulation') return `sub:${c.sub_formulation_id}`;
        return `item:${String(c.item_key || c.mainitem || '').toLowerCase().trim()}`;
      };

      const labelOf = (c) => {
        if (c.component_type === 'formulation') return c.sub_formulation_name || `Sub #${c.sub_formulation_id}`;
        return c.maindescription || c.mainitem || c.item_key || '—';
      };

      const codeOf = (c) => {
        if (c.component_type === 'formulation') return c.sub_formulation_id ? `Sub #${c.sub_formulation_id}` : 'Sub';
        return c.mainitem || c.item_key || '';
      };

      const costOf = (c) => {
        if (c?.line_cost != null) return Number(c.line_cost) || 0;
        return (Number(c?.parts) || 0) * (Number(c?.unit_price) || 0);
      };

      const byKey = new Map();

      selectedFormulations.forEach((f) => {
        const fid = Number(f.id);
        (f.components || []).forEach((c) => {
          const k = keyOf(c);
          if (!k) return;
          const prev = byKey.get(k) || {
            key: k,
            component: labelOf(c),
            code: codeOf(c),
            values: {},
          };
          const current = prev.values[fid] || {
            role: null,
            parts: null,
            solids: null,
            price: null,
            cost: null,
          };

          current.role = c.component_role || current.role;
          current.parts = (current.parts ?? 0) + (Number(c.parts) || 0);
          if (c.solids_pct != null) current.solids = Number(c.solids_pct);
          if (c.unit_price != null) current.price = Number(c.unit_price);
          current.cost = (current.cost ?? 0) + costOf(c);

          prev.component = prev.component || labelOf(c);
          prev.code = prev.code || codeOf(c);
          prev.values[fid] = current;
          byKey.set(k, prev);
        });
      });

      const diffNumArray = (arr, eps = 0.0001) => {
        const normalized = arr.map((v) => (v == null ? null : (Number(v) || 0)));
        const nonNull = normalized.filter((v) => v != null);
        if (nonNull.length === 0) return false;
        if (nonNull.length !== normalized.length) return true;
        return Math.abs(Math.max(...nonNull) - Math.min(...nonNull)) > eps;
      };

      const diffStrArray = (arr) => {
        const normalized = arr.map((v) => (v == null ? '' : String(v).trim().toLowerCase()));
        if (normalized.every((v) => !v)) return false;
        return new Set(normalized).size > 1;
      };

      const rows = Array.from(byKey.values())
        .map((r) => {
          const cells = selectedIds.map((id) => r.values[id] || null);
          const roleDifferent = diffStrArray(cells.map((c) => c?.role ?? null));
          const partsDifferent = diffNumArray(cells.map((c) => c?.parts ?? null));
          const solidsDifferent = diffNumArray(cells.map((c) => c?.solids ?? null));
          const priceDifferent = diffNumArray(cells.map((c) => c?.price ?? null));
          const costDifferent = diffNumArray(cells.map((c) => c?.cost ?? null));
          return {
            ...r,
            roleDifferent,
            partsDifferent,
            solidsDifferent,
            priceDifferent,
            costDifferent,
            different: roleDifferent || partsDifferent || solidsDifferent || priceDifferent || costDifferent,
          };
        })
        .sort((a, b) => String(a.component).localeCompare(String(b.component)));

      setCompareTargets(selectedFormulations);
      setCompareRows(rows);
      setCompareDiffOnly(false);
      setCompareOpen(true);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to compare formulations');
    } finally {
      setCompareLoading(false);
    }
  }, [compareSelectedIds, headers, message]);

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

  // ── Picker Step 2: load groups when category selected ──────────────────────
  useEffect(() => {
    if (!pickerCatId || !pickerOpen || !activeFormulation) { setPickerGroups([]); return; }
    setPickerGroupKey(null);
    setPickerItemKey(null);
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
    if (!pickerCatId || !pickerGroupKey || !pickerOpen || !activeFormulation) return;
    setPickerItemKey(null);
    setPickerItems([]);
    setPickerItemsLoading(true);
    axios.get(`${API}/api/mes/master-data/formulations/${activeFormulation.id}/candidates`, {
      headers,
      params: { category_id: pickerCatId, catlinedesc: pickerGroupKey },
    })
      .then((res) => setPickerItems(res.data.data || []))
      .catch(() => setPickerItems([]))
      .finally(() => setPickerItemsLoading(false));
  }, [pickerGroupKey, pickerOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickerPreview = useMemo(
    () => pickerItemKey ? (pickerItems.find((i) => i.item_key === pickerItemKey) || null) : null,
    [pickerItemKey, pickerItems]
  );

  const resetPicker = useCallback(() => {
    setPickerOpen(false);
    setPickerCatId(null);
    setPickerGroupKey(null);
    setPickerGroups([]);
    setPickerItemKey(null);
    setPickerItems([]);
  }, []);

  const replaceCurrentItemKey = useMemo(
    () => (replaceRowIdx != null ? (components[replaceRowIdx]?.item_key || null) : null),
    [replaceRowIdx, components]
  );

  const replacePreview = useMemo(
    () => replaceItemKey ? (replaceItems.find((i) => i.item_key === replaceItemKey) || null) : null,
    [replaceItemKey, replaceItems]
  );

  const resetReplace = useCallback(() => {
    setReplaceOpen(false);
    setReplaceRowIdx(null);
    setReplaceCatId(null);
    setReplaceGroupKey(null);
    setReplaceGroups([]);
    setReplaceItemKey(null);
    setReplaceItems([]);
  }, []);

  const openReplaceForRow = useCallback((idx) => {
    const row = components[idx];
    if (!row || row.component_type === 'formulation' || !activeFormulation) return;
    const currentItemKey = row.item_key || null;
    const currentGroup = row.catlinedesc || row.source_catlinedesc || null;
    const stockWa = row.stock_cost_wa ?? row.oracle_stock_price ?? null;
    const orderWa = row.purchase_cost_wa ?? row.oracle_order_price ?? null;
    const fallbackPreview = currentItemKey ? [{
      item_key: currentItemKey,
      mainitem: row.mainitem || currentItemKey,
      maindescription: row.maindescription || null,
      catlinedesc: currentGroup,
      stock_cost_wa: stockWa,
      purchase_cost_wa: orderWa,
      tds_solids_pct: row.tds_solids_pct ?? row.solids_pct ?? null,
      already_in_formulation: false,
    }] : [];

    setReplaceOpen(true);
    setReplaceRowIdx(idx);
    // Default to current category and pre-select the current row values.
    setReplaceCatId(catId || null);
    setReplaceGroupKey(currentGroup);
    setReplaceGroups([]);
    setReplaceItemKey(currentItemKey);
    setReplaceItems(fallbackPreview);
  }, [components, activeFormulation, catId]);

  // Replace modal Step 2: load groups when category selected
  useEffect(() => {
    if (!replaceCatId || !replaceOpen || !activeFormulation) { setReplaceGroups([]); return; }
    setReplaceGroupsLoading(true);
    axios.get(`${API}/api/mes/master-data/formulations/${activeFormulation.id}/candidates`, {
      headers,
      params: { category_id: replaceCatId },
    })
      .then((res) => setReplaceGroups(res.data.data || []))
      .catch(() => setReplaceGroups([]))
      .finally(() => setReplaceGroupsLoading(false));
  }, [replaceCatId, replaceOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Replace modal Step 3: load items when group selected
  useEffect(() => {
    if (!replaceCatId || !replaceGroupKey || !replaceOpen || !activeFormulation) return;
    setReplaceItemsLoading(true);
    axios.get(`${API}/api/mes/master-data/formulations/${activeFormulation.id}/candidates`, {
      headers,
      params: { category_id: replaceCatId, catlinedesc: replaceGroupKey },
    })
      .then((res) => setReplaceItems(res.data.data || []))
      .catch(() => setReplaceItems([]))
      .finally(() => setReplaceItemsLoading(false));
  }, [replaceGroupKey, replaceOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleReplaceComponent = useCallback(() => {
    if (replaceRowIdx == null || !replaceItemKey || !replacePreview) return;
    const current = components[replaceRowIdx];
    if (!current || current.component_type === 'formulation') return;

    if (replaceItemKey !== current.item_key && existingItemKeys.has(replaceItemKey)) {
      message.info('Item already in this formulation');
      return;
    }

    const stockPrice = Number(replacePreview.stock_cost_wa) || null;
    const orderPrice = Number(replacePreview.purchase_cost_wa) || null;
    const defaultPrice = stockPrice ?? orderPrice ?? null;
    const priceSource = stockPrice != null ? 'oracle_stock' : (orderPrice != null ? 'oracle_order' : null);
    const solidsPct = replacePreview.tds_solids_pct != null ? Number(replacePreview.tds_solids_pct) : null;

    setComponents((prev) => {
      const next = [...prev];
      const row = next[replaceRowIdx];
      if (!row) return prev;
      next[replaceRowIdx] = {
        ...row,
        component_type: 'item',
        sub_formulation_id: null,
        sub_formulation_name: null,
        sub_formulation_status: null,
        item_key: replaceItemKey,
        mainitem: replacePreview.mainitem,
        maindescription: replacePreview.maindescription || null,
        catlinedesc: replacePreview.catlinedesc || null,
        tds_solids_pct: solidsPct,
        solids_pct: row.solids_pct_source === 'override' ? row.solids_pct : solidsPct,
        solids_pct_source: row.solids_pct_source === 'override' ? 'override' : (solidsPct != null ? 'tds' : null),
        unit_price: row.unit_price_source === 'override' ? row.unit_price : defaultPrice,
        unit_price_source: row.unit_price_source === 'override' ? 'override' : priceSource,
        oracle_stock_price: stockPrice,
        oracle_order_price: orderPrice,
      };
      return next;
    });

    setDirty(true);
    message.success('Component replaced');
    resetReplace();
  }, [replaceRowIdx, replaceItemKey, replacePreview, components, existingItemKeys, message, resetReplace]);

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
          <Space>
            <Button onClick={openComparator} loading={compareLoading} disabled={compareSelectedIds.length < 2}>
              Compare ({compareSelectedIds.length}/{COMPARE_MAX})
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              New Formulation
            </Button>
          </Space>
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
              {/* Name row with inline rename */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                {renamingName === name ? (
                  <>
                    <Input
                      size="small"
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onPressEnter={() => handleRename(name, versions[0]?.id)}
                      style={{ fontWeight: 700, fontSize: 14, maxWidth: 320 }}
                    />
                    <Button
                      size="small"
                      type="primary"
                      icon={<CheckOutlined />}
                      loading={renameLoading}
                      onClick={() => handleRename(name, versions[0]?.id)}
                    />
                    <Button
                      size="small"
                      icon={<CloseOutlined />}
                      onClick={() => setRenamingName(null)}
                    />
                  </>
                ) : (
                  <>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{name}</span>
                    <Tooltip title="Rename">
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        style={{ color: '#aaa' }}
                        onClick={() => { setRenamingName(name); setRenameValue(name); }}
                      />
                    </Tooltip>
                  </>
                )}
              </div>
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
                      <Tag color={f.status === 'draft' ? 'default' : statusColor(f.status)} style={{ fontSize: 11 }}>
                        v{f.version}{f.status === 'draft' ? '' : ` · ${f.status}`}
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
                      <Button
                        size="small"
                        type={compareSelectedIds.includes(Number(f.id)) ? 'primary' : 'default'}
                        onClick={() => toggleCompareSelection(f.id)}
                      >
                        {compareSlotById.get(Number(f.id)) || 'Pick'}
                      </Button>
                      <Button size="small" onClick={() => openFormulation(f.id)}>
                        Open v{f.version}
                      </Button>
                      <Tooltip title="Duplicate options">
                        <Button
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => openDuplicateModal(f.id, f.name)}
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

        {/* Comparator Modal (2-5 formulas) */}
        <Modal
          title="Formulation Comparison"
          open={compareOpen}
          onCancel={() => setCompareOpen(false)}
          width="94vw"
          styles={{ body: { maxHeight: '78vh', overflowY: 'auto', overflowX: 'hidden', padding: '12px 14px' } }}
          footer={[
            <Button key="close" type="primary" onClick={() => setCompareOpen(false)}>
              Close
            </Button>,
          ]}
          destroyOnHidden
        >
          {compareTargets.length < 2 ? (
            <Alert type="info" showIcon message={`Pick 2 to ${COMPARE_MAX} formulations and click Compare.`} />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {compareTargets.map((f, idx) => (
                  <Tag key={f.id} color={COMPARE_COLORS[idx % COMPARE_COLORS.length]}>
                    {(COMPARE_LABELS[idx] || `#${idx + 1}`)}: {f.name} v{f.version}
                  </Tag>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 6 }}>
                {compareTargets.map((f, idx) => {
                  const slot = COMPARE_LABELS[idx] || `#${idx + 1}`;
                  const isA = idx === 0;
                  const isB = idx === 1;
                  const border = isA ? '#dbeafe' : isB ? '#e9d5ff' : '#d1fae5';
                  const bg = isA ? '#eff6ff' : isB ? '#faf5ff' : '#f0fdf4';
                  return (
                    <div key={f.id} style={{ border: `1px solid ${border}`, background: bg, borderRadius: 8, padding: '5px 7px', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <Text strong style={{ fontSize: 13, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {slot} — {f.name} v{f.version}
                        </Text>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, marginTop: 4 }}>
                        <div style={{ border: '1px solid #dbeafe', background: '#ffffff', borderRadius: 6, padding: '6px 7px' }}>
                          <Text type="secondary" style={{ fontSize: 10, lineHeight: 1 }}>Mix Ratio</Text>
                          <div><Text strong style={{ fontFamily: 'monospace' }}>{fmtNum(f.totals?.total_parts, 2)}</Text></div>
                        </div>
                        <div style={{ border: '1px solid #d1fae5', background: '#ffffff', borderRadius: 6, padding: '6px 7px' }}>
                          <Text type="secondary" style={{ fontSize: 10, lineHeight: 1 }}>Solids %</Text>
                          <div><Text strong style={{ fontFamily: 'monospace' }}>{f.totals?.solids_share_pct != null ? `${Number(f.totals.solids_share_pct).toFixed(1)}%` : '—'}</Text></div>
                        </div>
                        <div style={{ border: '1px solid #f59e0b', background: '#fffbeb', borderRadius: 6, padding: '6px 7px' }}>
                          <Text type="secondary" style={{ fontSize: 10, lineHeight: 1 }}>/kg Wet</Text>
                          <div><Text strong style={{ fontFamily: 'monospace', color: '#b45309' }}>{fmtCurrency(f.totals?.price_per_kg_wet, 4)}</Text></div>
                        </div>
                        <div style={{ border: '1px solid #a78bfa', background: '#faf5ff', borderRadius: 6, padding: '6px 7px' }}>
                          <Text type="secondary" style={{ fontSize: 10, lineHeight: 1 }}>/kg Solids</Text>
                          <div><Text strong style={{ fontFamily: 'monospace', color: '#6d28d9' }}>{fmtCurrency(f.totals?.price_per_kg_solids, 4)}</Text></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Modal>

        {/* Duplicate Modal */}
        <Modal
          title="Duplicate Formulation"
          open={dupOpen}
          onCancel={() => setDupOpen(false)}
          onOk={confirmDuplicate}
          okText="Duplicate"
          confirmLoading={dupLoading}
          okButtonProps={{ disabled: dupMode === 'name' && !dupName.trim() }}
          destroyOnHidden
        >
          <div style={{ display: 'grid', gap: 12, paddingTop: 4 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Mode</div>
              <Select
                style={{ width: '100%' }}
                value={dupMode}
                options={[
                  { value: 'version', label: `New version of "${dupSourceName || 'same name'}"` },
                  { value: 'name', label: 'Duplicate with a new name' },
                ]}
                onChange={(v) => setDupMode(v)}
              />
            </div>
            {dupMode === 'name' && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>New Name *</div>
                <Input
                  autoFocus
                  maxLength={255}
                  value={dupName}
                  onChange={(e) => setDupName(e.target.value)}
                  placeholder="Enter new formulation name"
                  onPressEnter={confirmDuplicate}
                />
              </div>
            )}
          </div>
        </Modal>

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
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff', paddingBottom: 8, marginBottom: 4, borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>Back</Button>
          <div>
            <Text strong style={{ fontSize: 15 }}>{activeFormulation.name}</Text>
            <Text type="secondary" style={{ marginLeft: 6 }}>v{activeFormulation.version}</Text>
            {(activeFormulation.status !== 'draft' || dirty) && (
              <Tag color={statusColor(activeFormulation.status)} style={{ marginLeft: 6 }}>
                {activeFormulation.status}
              </Tag>
            )}
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
            onClick={() => openDuplicateModal(activeFormulation.id, activeFormulation.name)}
          >
            Duplicate
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

      {/* ── Two-column layout: BOM table (left) + Summary panel (right) ── */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* LEFT — Add buttons + BOM table */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Add buttons */}
          {!isReadOnly && (
            <Space wrap style={{ marginBottom: 8 }}>
              <Button icon={<PlusOutlined />} onClick={() => setPickerOpen(true)}>Add Item</Button>
              <Button icon={<PlusOutlined />} onClick={openSubPicker}>Add Sub-Formulation</Button>
              <Button icon={<SettingOutlined />} onClick={() => setManageRolesOpen(true)}>Manage Roles</Button>
            </Space>
          )}

      {/* ── BOM table ── */}
      <Table
        size="small"
        pagination={false}
        dataSource={components.map((c, i) => ({ ...c, _idx: i }))}
        rowKey="_idx"
        scroll={{ x: 860, y: 360 }}
        onRow={(row) => ({
          style: {
            borderLeft: `3px solid ${row.component_type === 'formulation' ? '#8B5CF6' : (roleColorMap[row.component_role] || '#e8e8e8')}`,
          },
        })}
        locale={{ emptyText: 'No components yet — click "Add Item" or "Add Sub-Formulation" above.' }}
        summary={() => (
          <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 700 }}>
            <Table.Summary.Cell index={0}>
              <Text style={{ fontSize: 11, color: '#888', letterSpacing: '0.06em', fontWeight: 700 }}>TOTAL</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={1} />
            <Table.Summary.Cell index={2} align="center">
              <Text strong style={{ fontFamily: 'monospace', color: '#3B82F6' }}>{fmtNum(totals.total_parts, 2)}</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={3} align="center">
              <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{totals.solids_share_pct != null ? `${totals.solids_share_pct.toFixed(1)}%` : '—'}</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={4} align="center">
              <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmtCurrency(totals.price_per_kg_wet, 4)}</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={5} align="right">
              <Text strong style={{ fontFamily: 'monospace', whiteSpace: 'nowrap', color: '#3B82F6' }}>{fmtCurrency(totals.total_cost, 2)}</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={6} />
            <Table.Summary.Cell index={7} />
          </Table.Summary.Row>
        )}
        columns={[
          {
            title: 'Component',
            width: 260,
            ellipsis: false,
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
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, overflow: 'hidden' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.maindescription || row.mainitem || '—'}
                  </span>
                  <span style={{ fontSize: 10, color: '#999', fontFamily: 'monospace', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {row.mainitem || row.item_key}
                  </span>
                </div>
                {totals.total_parts > 0 && (
                  <div style={{ marginTop: 3, height: 2, background: '#f0f0f0', borderRadius: 1 }}>
                    <div style={{
                      height: 2, borderRadius: 1,
                      width: `${Math.min(100, ((Number(row.parts) || 0) / totals.total_parts) * 100)}%`,
                      background: roleColorMap[row.component_role] || '#6366f1',
                      opacity: 0.75, transition: 'width 0.3s',
                    }} />
                  </div>
                )}
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
            title: 'Mix Ratio',
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <InputNumber
                    size="small"
                    min={0}
                    max={100}
                    step={0.1}
                    style={{ flex: 1, minWidth: 0 }}
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
                      <Tag color={badge.color} style={{ margin: 0, fontSize: 9, padding: '0 3px', flexShrink: 0 }}>{badge.label}</Tag>
                    </Tooltip>
                  )}
                </div>
              );
            },
          },
          {
            title: '$/kg',
            width: 110,
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <InputNumber
                    size="small"
                    min={0}
                    step={0.0001}
                    style={{ flex: 1, minWidth: 0 }}
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
                    <Tag color={badge.color} style={{ margin: 0, fontSize: 9, padding: '0 3px', flexShrink: 0 }}>{badge.label}</Tag>
                  )}
                </div>
              );
            },
          },
          {
            title: 'Cost',
            width: 120,
            align: 'right',
            render: (_, row) => {
              const v = (Number(row.parts) || 0) * (Number(row.unit_price) || 0);
              return <Text strong style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmtCurrency(v, 2)}</Text>;
            },
          },
          {
            title: 'Notes',
            width: 200,
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
            width: 74,
            align: 'center',
            render: (_, row) => isReadOnly ? null : (
              <Space size={2}>
                {row.component_type !== 'formulation' && (
                  <Tooltip title="Replace component">
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => openReplaceForRow(row._idx)}
                    />
                  </Tooltip>
                )}
                <Popconfirm
                  title="Remove this component?"
                  onConfirm={() => removeComponent(row._idx)}
                  okText="Remove"
                  okButtonProps={{ danger: true }}
                >
                  <Button type="link" danger size="small">×</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

          {/* Legend */}
          <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>
            T = from TDS &nbsp;·&nbsp; O = manual override &nbsp;·&nbsp; R = resolved from sub-formulation &nbsp;·&nbsp; St/Or/Av = Oracle stock / order / avg price
          </div>

        </div>{/* end left column */}

        {/* RIGHT — Summary panel */}
        <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Formulation Summary KPIs */}
          <div style={{ border: '1px solid #e8e8e8', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: '#fafafa', borderBottom: '1px solid #e8e8e8', padding: '7px 12px', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#888', textTransform: 'uppercase' }}>
              Summary
            </div>
            <div style={{ padding: '10px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Mix Ratio',   value: fmtNum(totals.total_parts, 2),                                          accent: '#3B82F6' },
                { label: 'Solids %',    value: totals.solids_share_pct != null ? `${totals.solids_share_pct.toFixed(1)}%` : '—', accent: '#10B981' },
                { label: '$/kg Wet',    value: fmtCurrency(totals.price_per_kg_wet, 4),                               accent: '#F59E0B' },
                { label: '$/kg Solids', value: fmtCurrency(totals.price_per_kg_solids, 4),                            accent: '#A78BFA' },
              ].map(({ label, value, accent }) => (
                <div key={label} style={{ borderTop: `2px solid ${accent}`, borderRadius: 6, background: '#f9f9f9', padding: '8px 10px' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: '#aaa', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'monospace', color: '#1a1a1a' }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid #f0f0f0', margin: '0 12px 10px', paddingTop: 10 }}>
              <div style={{ borderTop: '2px solid #F87171', borderRadius: 6, background: '#f9f9f9', padding: '8px 10px' }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: '#aaa', textTransform: 'uppercase', marginBottom: 4 }}>Total Cost</div>
                <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'monospace', color: '#1a1a1a' }}>{fmtCurrency(totals.total_cost, 2)}</div>
              </div>
            </div>
          </div>

          {/* Application Estimate */}
          <div style={{ border: '1px solid #e8e8e8', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: '#fafafa', borderBottom: '1px solid #e8e8e8', padding: '7px 12px', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#888', textTransform: 'uppercase' }}>
              Application Estimate
            </div>
            <div style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa', letterSpacing: '0.06em', marginBottom: 5, textTransform: 'uppercase' }}>Deposit g/m²</div>
              <InputNumber
                size="small"
                min={0}
                step={0.1}
                style={{ width: '100%', marginBottom: 10 }}
                value={quickGSM}
                onChange={(v) => setQuickGSM(v ?? 0)}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { label: 'Wet GSM',      value: fmtNum(quickEstimate.wet_gsm, 4),            color: '#1a1a1a' },
                  { label: 'Cost/m²',      value: fmtCurrency(quickEstimate.cost_per_sqm, 6),  color: '#10B981' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: '#f9f9f9', borderRadius: 6, padding: '8px 10px', border: '1px solid #f0f0f0' }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color }}>{value}</div>
                  </div>
                ))}
                <div style={{ background: '#f0f7ff', borderRadius: 6, padding: '8px 10px', border: '1px solid #bfdbfe', gridColumn: 'span 2' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: '#93BBFD', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Cost / 1000 m²</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 17, fontWeight: 800, color: '#2563EB' }}>{fmtCurrency(quickEstimate.cost_per_1000_sqm, 2)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Mix Composition */}
          {components.length > 0 && (
            <div style={{ border: '1px solid #e8e8e8', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ background: '#fafafa', borderBottom: '1px solid #e8e8e8', padding: '7px 12px', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#888', textTransform: 'uppercase' }}>
                Mix Composition
              </div>
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {components.map((c, i) => {
                  const pct = totals.total_parts > 0 ? ((Number(c.parts) || 0) / totals.total_parts) * 100 : 0;
                  const color = roleColorMap[c.component_role] || '#6366f1';
                  const name = c.component_type === 'formulation'
                    ? (c.sub_formulation_name || `Sub #${c.sub_formulation_id}`)
                    : (c.maindescription || c.mainitem || '—');
                  return (
                    <div key={i}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ fontSize: 11, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{name}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color, flexShrink: 0, marginLeft: 6 }}>{pct.toFixed(1)}%</span>
                      </div>
                      <div style={{ height: 3, background: '#f0f0f0', borderRadius: 2 }}>
                        <div style={{ height: 3, borderRadius: 2, width: `${pct}%`, background: color, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          {activeFormulation.notes && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#92400e' }}>
              <span style={{ fontWeight: 700 }}>Notes: </span>{activeFormulation.notes}
            </div>
          )}

        </div>{/* end right panel */}

      </div>{/* end two-column wrapper */}

      {/* Duplicate Modal */}
      <Modal
        title="Duplicate Formulation"
        open={dupOpen}
        onCancel={() => setDupOpen(false)}
        onOk={confirmDuplicate}
        okText="Duplicate"
        confirmLoading={dupLoading}
        okButtonProps={{ disabled: dupMode === 'name' && !dupName.trim() }}
        destroyOnHidden
      >
        <div style={{ display: 'grid', gap: 12, paddingTop: 4 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Mode</div>
            <Select
              style={{ width: '100%' }}
              value={dupMode}
              options={[
                { value: 'version', label: `New version of "${dupSourceName || 'same name'}"` },
                { value: 'name', label: 'Duplicate with a new name' },
              ]}
              onChange={(v) => setDupMode(v)}
            />
          </div>
          {dupMode === 'name' && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>New Name *</div>
              <Input
                autoFocus
                maxLength={255}
                value={dupName}
                onChange={(e) => setDupName(e.target.value)}
                placeholder="Enter new formulation name"
                onPressEnter={confirmDuplicate}
              />
            </div>
          )}
        </div>
      </Modal>

      {/* ── Component Picker Modal (3-step: category → group → items) ── */}
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
              onChange={(v) => { setPickerCatId(v); setPickerGroupKey(null); setPickerGroups([]); setPickerItemKey(null); setPickerItems([]); }}
              showSearch
              filterOption={(input, opt) => String(opt.label || '').toLowerCase().includes(input.toLowerCase())}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Step 2 — Category Group</div>
            <Select
              style={{ width: '100%' }}
              placeholder={pickerCatId ? 'Select a category group' : 'Select a category first'}
              disabled={!pickerCatId}
              loading={pickerGroupsLoading}
              value={pickerGroupKey}
              options={(pickerGroups || []).map((g) => ({
                value: g.catlinedesc,
                label: g.display_name || g.catlinedesc,
              }))}
              onChange={(v) => { setPickerGroupKey(v); setPickerItemKey(null); setPickerItems([]); }}
              showSearch
              filterOption={(input, opt) => String(opt.label || '').toLowerCase().includes(input.toLowerCase())}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Step 3 — Item</div>
            <Select
              style={{ width: '100%' }}
              placeholder={pickerGroupKey ? 'Search or select an item' : 'Select a category group first'}
              disabled={!pickerGroupKey}
              loading={pickerItemsLoading}
              value={pickerItemKey}
              options={(pickerItems || []).map((item) => ({
                value: item.item_key,
                label: [
                  item.mainitem,
                  item.maindescription ? `– ${item.maindescription}` : null,
                ].filter(Boolean).join(' '),
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

      {/* ── Replace Component Modal ── */}
      <Modal
        title="Replace Component"
        open={replaceOpen}
        onCancel={resetReplace}
        footer={[
          <Button key="cancel" onClick={resetReplace}>Cancel</Button>,
          <Button
            key="replace"
            type="primary"
            disabled={!replaceItemKey || !replacePreview || (replacePreview.already_in_formulation && replaceItemKey !== replaceCurrentItemKey)}
            onClick={handleReplaceComponent}
          >
            Replace ✓
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
              value={replaceCatId}
              options={categoryOptions}
              onChange={(v) => { setReplaceCatId(v); setReplaceGroupKey(null); setReplaceGroups([]); setReplaceItemKey(null); setReplaceItems([]); }}
              showSearch
              filterOption={(input, opt) => String(opt.label || '').toLowerCase().includes(input.toLowerCase())}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Step 2 — Category Group</div>
            <Select
              style={{ width: '100%' }}
              placeholder={replaceCatId ? 'Select a category group' : 'Select a category first'}
              disabled={!replaceCatId}
              loading={replaceGroupsLoading}
              value={replaceGroupKey}
              options={(replaceGroups || []).map((g) => ({
                value: g.catlinedesc,
                label: g.display_name || g.catlinedesc,
              }))}
              onChange={(v) => { setReplaceGroupKey(v); setReplaceItemKey(null); setReplaceItems([]); }}
              showSearch
              filterOption={(input, opt) => String(opt.label || '').toLowerCase().includes(input.toLowerCase())}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Step 3 — Item</div>
            <Select
              style={{ width: '100%' }}
              placeholder={replaceGroupKey ? 'Search or select an item' : 'Select a category group first'}
              disabled={!replaceGroupKey}
              loading={replaceItemsLoading}
              value={replaceItemKey}
              options={(replaceItems || []).map((item) => ({
                value: item.item_key,
                label: [
                  item.mainitem,
                  item.maindescription ? `– ${item.maindescription}` : null,
                ].filter(Boolean).join(' '),
                disabled: item.already_in_formulation && item.item_key !== replaceCurrentItemKey,
              }))}
              onChange={(v) => setReplaceItemKey(v)}
              showSearch
              filterOption={(input, opt) => String(opt.label || '').toLowerCase().includes(input.toLowerCase())}
            />
          </div>

          {replacePreview && (
            <Card size="small" style={{ background: '#f8fbff', border: '1px solid #dbeafe' }}>
              <div>
                <Text strong>{replacePreview.mainitem}</Text>
                {replacePreview.maindescription && (
                  <Text type="secondary"> · {replacePreview.maindescription}</Text>
                )}
              </div>
              <div style={{ marginTop: 2 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>{replacePreview.catlinedesc}</Text>
              </div>
              <Row gutter={8} style={{ marginTop: 6 }}>
                <Col span={8}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Stock WA</Text>
                  <div><Text strong style={{ fontSize: 12 }}>{fmtCurrency(replacePreview.stock_cost_wa, 4)}</Text></div>
                </Col>
                <Col span={8}>
                  <Text type="secondary" style={{ fontSize: 11 }}>On Order WA</Text>
                  <div><Text strong style={{ fontSize: 12 }}>{fmtCurrency(replacePreview.purchase_cost_wa, 4)}</Text></div>
                </Col>
                <Col span={8}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Solids %</Text>
                  <div>
                    <Text strong style={{ fontSize: 12 }}>
                      {replacePreview.tds_solids_pct != null ? `${replacePreview.tds_solids_pct}%` : '—'}
                    </Text>
                  </div>
                </Col>
              </Row>
              {replacePreview.already_in_formulation && replaceItemKey !== replaceCurrentItemKey && (
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
            { title: 'Formulation', render: (_, row) => (
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

      {/* ── Manage Roles Modal ── */}
      <Modal
        title={`Manage Roles — ${materialClass || 'default'}`}
        open={manageRolesOpen}
        onCancel={() => { setManageRolesOpen(false); setRolesEditing(null); setRolesNewLabel(''); setRolesNewValue(''); }}
        footer={null}
        width={520}
        destroyOnHidden
      >
        <ManageRolesPanel
          materialClass={materialClass}
          headers={headers}
          rolesLoading={rolesLoading}
          setRolesLoading={setRolesLoading}
          rolesEditing={rolesEditing}
          setRolesEditing={setRolesEditing}
          rolesNewLabel={rolesNewLabel}
          setRolesNewLabel={setRolesNewLabel}
          rolesNewValue={rolesNewValue}
          setRolesNewValue={setRolesNewValue}
          onChanged={fetchRoles}
        />
      </Modal>
    </Spin>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
function ManageRolesPanel({
  materialClass, headers,
  rolesLoading, setRolesLoading,
  rolesEditing, setRolesEditing,
  rolesNewLabel, setRolesNewLabel,
  rolesNewValue, setRolesNewValue,
  onChanged,
}) {
  const { message: msg } = App.useApp();
  const [rows, setRows] = useState([]);
  const mc = String(materialClass || '_default').toLowerCase().trim();

  const load = useCallback(() => {
    setRolesLoading(true);
    axios.get(`${API}/api/mes/master-data/component-roles`, { headers, params: { material_class: mc } })
      .then((res) => setRows(res.data.data || []))
      .catch(() => msg.error('Failed to load roles'))
      .finally(() => setRolesLoading(false));
  }, [mc, headers]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [mc]); // eslint-disable-line react-hooks/exhaustive-deps

  const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  const handleAdd = () => {
    const label = rolesNewLabel.trim();
    if (!label) { msg.warning('Enter a label'); return; }
    const value = rolesNewValue.trim() || slugify(label);
    setRolesLoading(true);
    axios.post(`${API}/api/mes/master-data/component-roles`, { material_class: mc, value, label }, { headers })
      .then(() => { msg.success('Role added'); setRolesNewLabel(''); setRolesNewValue(''); load(); onChanged(); })
      .catch((e) => msg.error(e.response?.data?.message || 'Save failed'))
      .finally(() => setRolesLoading(false));
  };

  const handleSaveEdit = (id) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    setRolesLoading(true);
    axios.put(`${API}/api/mes/master-data/component-roles/${id}`, { label: row.label, sort_order: row.sort_order }, { headers })
      .then(() => { msg.success('Saved'); setRolesEditing(null); load(); onChanged(); })
      .catch((e) => msg.error(e.response?.data?.message || 'Save failed'))
      .finally(() => setRolesLoading(false));
  };

  const handleDelete = (id) => {
    setRolesLoading(true);
    axios.delete(`${API}/api/mes/master-data/component-roles/${id}`, { headers })
      .then(() => { msg.success('Deleted'); load(); onChanged(); })
      .catch((e) => msg.error(e.response?.data?.message || 'Delete failed'))
      .finally(() => setRolesLoading(false));
  };

  const columns = [
    {
      title: 'Label',
      dataIndex: 'label',
      render: (val, row) =>
        rolesEditing === row.id ? (
          <Input
            size="small"
            value={rows.find(r => r.id === row.id)?.label || val}
            onChange={(e) => setRows(prev => prev.map(r => r.id === row.id ? { ...r, label: e.target.value } : r))}
            onPressEnter={() => handleSaveEdit(row.id)}
            autoFocus
          />
        ) : val,
    },
    { title: 'Value', dataIndex: 'value', width: 130, render: (v) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    {
      title: 'Order',
      dataIndex: 'sort_order',
      width: 80,
      render: (val, row) =>
        rolesEditing === row.id ? (
          <InputNumber
            size="small"
            min={0}
            style={{ width: 64 }}
            value={rows.find(r => r.id === row.id)?.sort_order ?? val}
            onChange={(v) => setRows(prev => prev.map(r => r.id === row.id ? { ...r, sort_order: v ?? 0 } : r))}
          />
        ) : val,
    },
    {
      title: '',
      width: 120,
      render: (_, row) =>
        rolesEditing === row.id ? (
          <Space>
            <Button size="small" type="primary" onClick={() => handleSaveEdit(row.id)}>Save</Button>
            <Button size="small" onClick={() => { setRolesEditing(null); load(); }}>Cancel</Button>
          </Space>
        ) : (
          <Space>
            <Button size="small" icon={<SettingOutlined />} onClick={() => setRolesEditing(row.id)} />
            <Popconfirm title="Delete this role?" onConfirm={() => handleDelete(row.id)} okText="Yes" cancelText="No">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
    },
  ];

  return (
    <Spin spinning={rolesLoading}>
      <Table
        size="small"
        rowKey="id"
        dataSource={rows}
        columns={columns}
        pagination={false}
        style={{ marginBottom: 16 }}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Input
          placeholder="Label (e.g. Hardener)"
          size="small"
          value={rolesNewLabel}
          onChange={(e) => { setRolesNewLabel(e.target.value); setRolesNewValue(slugify(e.target.value)); }}
          style={{ flex: 1 }}
        />
        <Input
          placeholder="slug (auto)"
          size="small"
          value={rolesNewValue}
          onChange={(e) => setRolesNewValue(e.target.value)}
          style={{ width: 130 }}
        />
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          Add Role
        </Button>
      </div>
      <Text type="secondary" style={{ fontSize: 11, marginTop: 6, display: 'block' }}>
        Changes apply immediately to the “Role” dropdown in the BOM editor.
      </Text>
    </Spin>
  );
}
