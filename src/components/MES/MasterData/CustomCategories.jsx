/**
 * CustomCategories — 3-level hierarchy: Category → Category Groups (catlinedesc) → Item Groups (itemgroup)
 * Mirrors Oracle: CATEGORY → CATLINEDESC → ITEMGROUP
 * Replaces legacy Item Master workflows.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
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
  Divider,
  Checkbox,
  Tabs,
  Alert,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SettingOutlined,
  ReloadOutlined,
  SearchOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { useCurrency } from '../../../contexts/CurrencyContext';
import UAEDirhamSymbol from '../../dashboard/UAEDirhamSymbol';

const { Text, Title } = Typography;
const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const MRP_TYPE_OPTIONS = [
  { value: 'PD', label: 'PD' },
  { value: 'ND', label: 'ND' },
  { value: 'VB', label: 'VB' },
];

const MRP_TYPE_LEGEND = 'MRP codes: PD = Auto MRP, ND = No Planning, VB = Manual reorder point.';

const LOT_SIZE_OPTIONS = [
  { value: 'EX', label: 'EX' },
  { value: 'FX', label: 'FX' },
  { value: 'HB', label: 'HB' },
  { value: 'WB', label: 'WB' },
];

const PROFILE_CONFIG_DEFAULTS = {
  supplier_name: null,
  resin_type: null,
  alloy_code: null,
  density_g_cm3: null,
  solid_pct: null,
  micron_thickness: null,
  width_mm: null,
  yield_m2_per_kg: null,
  roll_length_m: null,
  core_diameter_mm: null,
  market_ref_price: null,
  market_price_date: null,
  mrp_type: 'PD',
  reorder_point: null,
  safety_stock_kg: null,
  planned_lead_time_days: null,
  mapped_material_keys: [],
};

const EMPTY_DETAIL_TOTALS = {
  stock_qty: 0,
  order_qty: 0,
  stock_val: 0,
  order_val: 0,
  stock_price_wa: null,
  on_order_price_wa: null,
  avg_price_wa: null,
  market_price_wa: null,
};

const MATERIAL_PROFILE_NUMERIC_FIELD_META = {
  density_g_cm3: { label: 'Density', min: 0, step: 0.0001, max: null },
  solid_pct: { label: 'Solid %', min: 0, step: 0.1, max: 100 },
  micron_thickness: { label: 'Thickness (mic)', min: 0, step: 0.1, max: null },
  width_mm: { label: 'Width (mm)', min: 0, step: 1, max: null },
  yield_m2_per_kg: { label: 'Yield (m²/kg)', min: 0, step: 0.01, max: null },
  roll_length_m: { label: 'Roll Length (m)', min: 0, step: 1, max: null },
  core_diameter_mm: { label: 'Core Dia (mm)', min: 0, step: 0.1, max: null },
};

function getMaterialProfileFieldKeys(materialClass) {
  const cls = normalizeKey(materialClass);
  if (cls === 'resins') return ['density_g_cm3'];
  if (cls === 'substrates') {
    return [
      'density_g_cm3', 'solid_pct', 'micron_thickness',
      'width_mm', 'yield_m2_per_kg', 'roll_length_m', 'core_diameter_mm',
    ];
  }
  if (cls === 'mounting_tapes') return ['density_g_cm3', 'micron_thickness'];
  if (['adhesives', 'coating', 'chemicals'].includes(cls)) return ['density_g_cm3', 'solid_pct'];
  return ['density_g_cm3'];
}

const WEIGHTED_AVG_NOTE = 'Weighted price is calculated as: (Stock Price x Stock Qty + On Order Price x On Order Qty) / (Stock Qty + On Order Qty).';

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeStringArray(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeKey(value))
      .filter(Boolean)
  ));
}

function toOptionalNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toOptionalInteger(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function deriveMaterialProfilePriceFallback(detail = {}) {
  const items = Array.isArray(detail?.items) ? detail.items : [];
  const totals = detail?.totals || {};

  const weightedAvg = (field) => {
    let weightedSum = 0;
    let weightedQty = 0;

    for (const item of items) {
      const value = toOptionalNumber(item?.[field]);
      if (value == null) continue;

      const stockQty = toOptionalNumber(item?.stock_qty) || 0;
      const orderQty = toOptionalNumber(item?.order_qty) || 0;
      const weight = stockQty > 0 ? stockQty : (orderQty > 0 ? orderQty : 1);

      weightedSum += value * weight;
      weightedQty += weight;
    }

    if (!weightedQty) return null;
    return Math.round((weightedSum / weightedQty) * 10000) / 10000;
  };

  const latestMarketDate = (() => {
    const dates = items
      .map((item) => String(item?.market_price_date || '').slice(0, 10))
      .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
      .sort((a, b) => b.localeCompare(a));
    return dates[0] || null;
  })();

  return {
    market_ref_price:
      toOptionalNumber(totals.market_price_wa)
      ?? weightedAvg('market_price')
      ?? null,
    market_price_date: latestMarketDate,
  };
}

function buildSubstrateDraft(row = {}) {
  return {
    ...PROFILE_CONFIG_DEFAULTS,
    ...row,
    material_class: normalizeKey(row.material_class),
    cat_desc: String(row.cat_desc || '').trim(),
    appearance: String(row.appearance || '').trim(),
    market_price_date: row.market_price_date ? String(row.market_price_date).slice(0, 10) : null,
    mapped_material_keys: normalizeStringArray(row.mapped_material_keys),
  };
}

function toPrettyLabel(key) {
  if (!key) return '';
  return String(key)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function toMaterialClassLabel(value) {
  if (!value) return '';
  if (value === 'all') return 'All';
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CustomCategories() {
  const { companyCurrency, isUAEDirham } = useCurrency();
  const { message } = App.useApp();

  const token = localStorage.getItem('auth_token');
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedCatId, setSelectedCatId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [globalSearchDraft, setGlobalSearchDraft] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [globalSearchRows, setGlobalSearchRows] = useState([]);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const [searchTextDraft, setSearchTextDraft] = useState('');
  const [searchText, setSearchText] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('all');
  const pendingGroupFilterRef = useRef(null);

  // Create/Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [form] = Form.useForm();
  const [materialClasses, setMaterialClasses] = useState([]);

  // Group config modal
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [availableGroups, setAvailableGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState(new Set());

  // Item Group drawer
  const [igDrawerOpen, setIgDrawerOpen] = useState(false);
  const [igDetail, setIgDetail] = useState(null);
  const [igLoading, setIgLoading] = useState(false);
  const [rowDrafts, setRowDrafts] = useState({});
  const [savingItemKey, setSavingItemKey] = useState(null);

  // Bulk operations
  const [bulkMrpSaving, setBulkMrpSaving] = useState(false);
  const [bulkMrpForm] = Form.useForm();

  // Unified detail overview filters + group pricing
  const [detailSearchText, setDetailSearchText] = useState('');
  const [detailSupplierFilter, setDetailSupplierFilter] = useState('all');
  const [detailAggregates, setDetailAggregates] = useState(null);
  const [detailAggregatesLoading, setDetailAggregatesLoading] = useState(false);
  const [groupPricingDraft, setGroupPricingDraft] = useState({
    market_ref_price: null,
    market_price_date: null,
  });
  const [groupPricingSaving, setGroupPricingSaving] = useState(false);
  const [groupPricingSavedAt, setGroupPricingSavedAt] = useState(null);

  const [substrateDraft, setSubstrateDraft] = useState(null);
  const [substrateLoading, setSubstrateLoading] = useState(false);
  const [substrateSaving, setSubstrateSaving] = useState(false);
  const [substrateProfile, setSubstrateProfile] = useState(null);
  const [substrateProfileLoading, setSubstrateProfileLoading] = useState(false);

  // Custom group state
  const [customGroupName, setCustomGroupName] = useState('');
  const [customGroupCreating, setCustomGroupCreating] = useState(false);
  const [customGroupAssignOpen, setCustomGroupAssignOpen] = useState(false);
  const [customGroupTarget, setCustomGroupTarget] = useState(null);
  const [customGroupItems, setCustomGroupItems] = useState([]);
  const [customGroupSelectedKeys, setCustomGroupSelectedKeys] = useState(new Set());
  const [customGroupLoading, setCustomGroupLoading] = useState(false);
  const [customGroupSearchText, setCustomGroupSearchText] = useState('');

  const currencySymbol = useMemo(() => (
    isUAEDirham()
      ? <UAEDirhamSymbol style={{ width: '0.9em', height: '0.9em', verticalAlign: '-0.1em' }} />
      : <span style={{ marginRight: '0.05em' }}>{companyCurrency?.symbol || '$'}</span>
  ), [isUAEDirham, companyCurrency]);

  const fmtCurrency = (v, d = 2) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
        {currencySymbol}
        {n.toLocaleString(undefined, {
          minimumFractionDigits: d,
          maximumFractionDigits: d,
        })}
      </span>
    );
  };

  const fmtQty = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString() : '—';
  };

  const fmtNum = (v, d = 4) => {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(d) : '—';
  };



  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/mes/master-data/items/custom-categories`, { headers });
      setCategories(res.data.data || []);
    } catch {
      message.error('Failed to load categories');
    }
    setLoading(false);
  }, [headers, message]);

  useEffect(() => {
    axios.get(`${API}/api/mes/master-data/tds/category-mapping`, { headers })
      .then((res) => {
        if (res.data.success) {
          const classMap = new Map();
          (res.data.data || []).forEach((row) => {
            const existing = classMap.get(row.material_class);
            if (!existing || (row.item_count || 0) > existing.maxCount) {
              classMap.set(row.material_class, {
                value: row.material_class,
                label: row.display_label,
                maxCount: row.item_count || 0,
              });
            }
          });
          setMaterialClasses(
            [...classMap.values()].map(({ value, label }) => ({ value, label }))
          );
        }
      })
      .catch(() => {});
  }, [headers]);

  const fetchProfile = useCallback(async (catId, search = '') => {
    if (!catId) {
      setProfile(null);
      return;
    }
    setProfileLoading(true);
    try {
      const params = search ? { search } : undefined;
      const res = await axios.get(
        `${API}/api/mes/master-data/items/custom-categories/${catId}/profile`,
        { headers, params }
      );
      setProfile(res.data.data || null);
    } catch {
      message.error('Failed to load profile');
      setProfile(null);
    }
    setProfileLoading(false);
  }, [headers, message]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchText(searchTextDraft.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchTextDraft]);

  useEffect(() => {
    const timer = setTimeout(() => setGlobalSearch(globalSearchDraft.trim()), 300);
    return () => clearTimeout(timer);
  }, [globalSearchDraft]);

  useEffect(() => {
    if (selectedCatId) fetchProfile(selectedCatId, searchText);
  }, [selectedCatId, searchText, fetchProfile]);

  useEffect(() => {
    if (!globalSearch) {
      setGlobalSearchRows([]);
      setGlobalSearchLoading(false);
      return;
    }

    let cancelled = false;
    setGlobalSearchLoading(true);

    axios.get(`${API}/api/mes/master-data/items/custom-categories/search`, {
      headers,
      params: {
        q: globalSearch,
        limit: 300,
      },
    })
      .then((res) => {
        if (cancelled) return;
        setGlobalSearchRows(Array.isArray(res.data?.data) ? res.data.data : []);
      })
      .catch(() => {
        if (cancelled) return;
        setGlobalSearchRows([]);
      })
      .finally(() => {
        if (!cancelled) setGlobalSearchLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [globalSearch, headers]);

  useEffect(() => {
    if (pendingGroupFilterRef.current) {
      setSelectedGroupFilter(pendingGroupFilterRef.current);
      pendingGroupFilterRef.current = null;
      return;
    }
    setSelectedGroupFilter('all');
  }, [selectedCatId]);

  const materialClassFieldOptions = useMemo(() => {
    const unique = Array.from(new Set([
      ...materialClasses.map((m) => m.value).filter(Boolean),
      ...categories.map((c) => c.material_class).filter(Boolean),
    ]));

    return unique.map((value) => {
      const fromMap = materialClasses.find((m) => m.value === value);
      return {
        value,
        label: fromMap?.label || toMaterialClassLabel(value),
      };
    });
  }, [materialClasses, categories]);

  const visibleCategories = categories;

  useEffect(() => {
    if (!visibleCategories.length) {
      if (selectedCatId != null) {
        setSelectedCatId(null);
        setProfile(null);
      }
      return;
    }

    const hasSelected = visibleCategories.some((cat) => cat.id === selectedCatId);
    if (!hasSelected) {
      setSelectedCatId(visibleCategories[0].id);
    }
  }, [visibleCategories, selectedCatId]);

  const allVisibleCategoryItemCount = useMemo(
    () => visibleCategories.reduce((sum, cat) => sum + (Number(cat.item_count) || 0), 0),
    [visibleCategories]
  );

  const allVisibleCategoryUnmappedCount = useMemo(
    () => visibleCategories.reduce((sum, cat) => sum + (Number(cat.unmapped_item_count) || 0), 0),
    [visibleCategories]
  );

  const categoryGroupFilters = useMemo(
    () => (profile?.groups || []).map((group) => group.catlinedesc).filter(Boolean),
    [profile]
  );

  /* ---- Unified sidebar groups (used by all categories) ---- */
  const sidebarGroups = useMemo(
    () => ([...(profile?.groups || [])].sort(
      (a, b) => String(a?.catlinedesc || '').localeCompare(String(b?.catlinedesc || ''), undefined, { sensitivity: 'base' })
    )),
    [profile]
  );

  const selectedSidebarGroup = useMemo(() => {
    if (!sidebarGroups.length) return null;
    return sidebarGroups.find((group) => group.catlinedesc === selectedGroupFilter) || sidebarGroups[0];
  }, [sidebarGroups, selectedGroupFilter]);

  const selectedSidebarItemGroups = useMemo(() => {
    const rows = selectedSidebarGroup?.item_groups || [];
    return [...rows].sort(
      (a, b) => String(a?.itemgroup || '').localeCompare(String(b?.itemgroup || ''), undefined, { sensitivity: 'base' })
    );
  }, [selectedSidebarGroup]);

  const selectedSidebarPricing = useMemo(() => ({
    stock_price_wa: selectedSidebarGroup?.stock_price_wa ?? null,
    on_order_price_wa: selectedSidebarGroup?.on_order_price_wa ?? null,
    avg_price_wa: selectedSidebarGroup?.avg_price_wa ?? null,
    market_price_wa: selectedSidebarGroup?.market_price_wa ?? null,
  }), [selectedSidebarGroup]);

  useEffect(() => {
    if (!categoryGroupFilters.length) {
      setSelectedGroupFilter('all');
      return;
    }

    // All categories (substrate and non-substrate) auto-select first group
    if (!selectedGroupFilter || selectedGroupFilter === 'all' || !categoryGroupFilters.includes(selectedGroupFilter)) {
      setSelectedGroupFilter(categoryGroupFilters[0]);
    }
  }, [categoryGroupFilters, selectedGroupFilter]);

  const openCreate = () => {
    setEditingCat(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (cat) => {
    setEditingCat(cat);
    form.setFieldsValue(cat);
    setModalOpen(true);
  };

  const handleSaveCat = async () => {
    try {
      const values = await form.validateFields();
      if (editingCat) {
        await axios.put(
          `${API}/api/mes/master-data/items/custom-categories/${editingCat.id}`,
          values,
          { headers }
        );
        message.success('Category updated');
      } else {
        const res = await axios.post(
          `${API}/api/mes/master-data/items/custom-categories`,
          values,
          { headers }
        );
        message.success('Category created');
        setSelectedCatId(res.data.data?.id);
      }
      setModalOpen(false);
      fetchCategories();
    } catch (err) {
      message.error(err.response?.data?.error || 'Save failed');
    }
  };

  const handleDeleteCat = async (id) => {
    try {
      await axios.delete(`${API}/api/mes/master-data/items/custom-categories/${id}`, { headers });
      message.success('Category deleted');
      if (selectedCatId === id) {
        setSelectedCatId(null);
        setProfile(null);
      }
      fetchCategories();
    } catch {
      message.error('Delete failed');
    }
  };

  const openGroupConfig = async (catId) => {
    setGroupsLoading(true);
    setGroupModalOpen(true);
    try {
      const res = await axios.get(
        `${API}/api/mes/master-data/items/custom-categories/${catId}/available-groups`,
        { headers }
      );
      const groups = res.data.data || [];
      setAvailableGroups(groups);
      setSelectedGroups(new Set(groups.filter((g) => g.group_id).map((g) => g.catlinedesc)));
    } catch {
      message.error('Failed to load groups');
    }
    setGroupsLoading(false);
  };

  const handleSaveGroups = async () => {
    const catId = selectedCatId;
    const groups = [...selectedGroups].map((catlinedesc) => ({ catlinedesc }));
    try {
      await axios.put(
        `${API}/api/mes/master-data/items/custom-categories/${catId}/groups`,
        { groups },
        { headers }
      );
      message.success(`Saved ${groups.length} group mappings`);
      setGroupModalOpen(false);
      fetchCategories();
      fetchProfile(catId, searchText);
    } catch (err) {
      message.error(err.response?.data?.error || 'Save failed');
    }
  };

  const selectedCat = categories.find((c) => c.id === selectedCatId);

  const openItemGroupByCategory = useCallback(async (catId, itemgroup, catlinedesc = null) => {
    if (!catId || !itemgroup) return;
    setIgDrawerOpen(true);
    setIgLoading(true);
    setIgDetail(null);
    try {
      const res = await axios.get(
        `${API}/api/mes/master-data/items/custom-categories/${catId}/item-group/${encodeURIComponent(itemgroup)}`,
        {
          headers,
          params: catlinedesc ? { catlinedesc } : undefined,
        }
      );
      setIgDetail(res.data.data ? { ...res.data.data, scope_type: 'item_group' } : null);
    } catch {
      message.error('Failed to load item group');
    }
    setIgLoading(false);
  }, [headers, message]);

  const openItemGroup = useCallback(async (itemgroup, catlinedesc = null) => {
    if (!selectedCatId) return;
    await openItemGroupByCategory(selectedCatId, itemgroup, catlinedesc);
  }, [selectedCatId, openItemGroupByCategory]);

  const openCategoryGroupByCategory = useCallback(async (catId, catlinedesc) => {
    if (!catId || !catlinedesc) return;
    setIgDrawerOpen(true);
    setIgLoading(true);
    setIgDetail(null);
    try {
      const res = await axios.get(
        `${API}/api/mes/master-data/items/custom-categories/${catId}/category-group/${encodeURIComponent(catlinedesc)}/detail`,
        { headers }
      );
      setIgDetail(res.data.data ? { ...res.data.data, scope_type: 'category_group' } : null);
    } catch {
      message.error('Failed to load category group');
    }
    setIgLoading(false);
  }, [headers, message]);

  const openCategoryGroup = useCallback(async (catlinedesc) => {
    if (!selectedCatId || !catlinedesc) return;
    await openCategoryGroupByCategory(selectedCatId, catlinedesc);
  }, [selectedCatId, openCategoryGroupByCategory]);

  const handleOpenGlobalResult = useCallback(async (row) => {
    const catId = Number(row?.category_id) || null;
    const itemgroup = String(row?.itemgroup || '').trim();
    const catlinedesc = String(row?.catlinedesc || '').trim();

    if (!catId) return;

    const nextGroupFilter = catlinedesc || 'all';
    pendingGroupFilterRef.current = nextGroupFilter;
    setSelectedCatId(catId);
    setSelectedGroupFilter(nextGroupFilter);

    if (itemgroup) {
      await openItemGroupByCategory(catId, itemgroup, catlinedesc || null);
      return;
    }

    if (catlinedesc) await openCategoryGroupByCategory(catId, catlinedesc);
  }, [openItemGroupByCategory, openCategoryGroupByCategory]);

  const refreshDetail = useCallback(async () => {
    if (!igDetail) return;
    const catId = Number(igDetail?.category?.id || selectedCatId) || null;
    if (igDetail.scope_type === 'category_group') {
      if (catId && igDetail.catlinedesc) await openCategoryGroupByCategory(catId, igDetail.catlinedesc);
      return;
    }
    if (catId && igDetail.itemgroup) {
      await openItemGroupByCategory(catId, igDetail.itemgroup, igDetail.catlinedesc || null);
    }
  }, [igDetail, selectedCatId, openCategoryGroupByCategory, openItemGroupByCategory]);

  useEffect(() => {
    if (!igDetail?.items) {
      setRowDrafts({});
      return;
    }

    const nextDrafts = {};
    igDetail.items.forEach((item) => {
      nextDrafts[item.item_key] = {
        market_ref_price: item.market_price ?? null,
        market_price_date: item.market_price_date ? String(item.market_price_date).slice(0, 10) : null,
        mrp_type: item.mrp_type ?? null,
        reorder_point: item.reorder_point ?? null,
        safety_stock_kg: item.safety_stock_kg ?? null,
        procurement_type: item.procurement_type ?? null,
        planned_lead_time_days: item.planned_lead_time_days ?? null,
        lot_size_rule: item.lot_size_rule ?? null,
        fixed_lot_size_kg: item.fixed_lot_size_kg ?? null,
        assembly_scrap_pct: item.assembly_scrap_pct ?? null,
      };
    });
    setRowDrafts(nextDrafts);
  }, [igDetail]);

  useEffect(() => {
    if (!igDetail) {
      setDetailSearchText('');
      setDetailSupplierFilter('all');
      setDetailAggregates(null);
      setGroupPricingDraft({ market_ref_price: null, market_price_date: null });
      setGroupPricingSavedAt(null);
      return;
    }

    const firstMarketDate = (igDetail.items || [])
      .map((item) => item.market_price_date)
      .find((value) => value != null && value !== '');

    setDetailSearchText('');
    setDetailSupplierFilter('all');
    setGroupPricingDraft({
      market_ref_price: igDetail?.totals?.market_price_wa ?? igDetail?.totals?.on_order_price_wa ?? igDetail?.totals?.stock_price_wa ?? null,
      market_price_date: firstMarketDate ? String(firstMarketDate).slice(0, 10) : null,
    });
    setGroupPricingSavedAt(null);
  }, [igDetail]);

  const updateRowDraft = useCallback((itemKey, field, value) => {
    setRowDrafts((prev) => ({
      ...prev,
      [itemKey]: {
        ...(prev[itemKey] || {}),
        [field]: value,
      },
    }));
  }, []);

  const getRowDraft = useCallback((itemKey) => rowDrafts[itemKey] || {}, [rowDrafts]);

  const handleSaveGroupMarketPrice = useCallback(async () => {
    if (!igDetail || !selectedCatId) return;

    const scopeType = igDetail.scope_type;
    const catlinedesc = String(igDetail.catlinedesc || '').trim();
    const itemgroup = String(igDetail.itemgroup || '').trim();

    if (scopeType === 'category_group' && !catlinedesc) {
      message.warning('Category group context is missing for market price update.');
      return;
    }
    if (scopeType === 'item_group' && !itemgroup) {
      message.warning('Item group context is missing for market price update.');
      return;
    }

    setGroupPricingSaving(true);
    try {
      const payload = {
        market_ref_price: toOptionalNumber(groupPricingDraft.market_ref_price),
        market_price_date: groupPricingDraft.market_price_date || null,
      };

      if (scopeType === 'item_group') {
        // Item Group level — include catlinedesc for scoped lookup
        if (catlinedesc) payload.catlinedesc = catlinedesc;
        await axios.patch(
          `${API}/api/mes/master-data/items/custom-categories/${selectedCatId}/item-group/${encodeURIComponent(itemgroup)}/market-price`,
          payload,
          { headers }
        );
        message.success('Item group market price updated');
      } else {
        // Category Group level
        await axios.patch(
          `${API}/api/mes/master-data/items/custom-categories/${selectedCatId}/category-group/${encodeURIComponent(catlinedesc)}/market-price`,
          payload,
          { headers }
        );
        message.success('Category group market price updated');
      }

      setGroupPricingSavedAt(new Date());
      await refreshDetail();
      fetchProfile(selectedCatId, searchText);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to update market price');
    } finally {
      setGroupPricingSaving(false);
    }
  }, [igDetail, selectedCatId, groupPricingDraft, headers, message, refreshDetail, fetchProfile, searchText]);

  const handleBulkMrpUpdate = useCallback(async () => {
    try {
      const values = await bulkMrpForm.validateFields();
      const payload = {};
      Object.entries(values).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') payload[key] = value;
      });

      if (!Object.keys(payload).length) {
        message.warning('Set at least one bulk MRP field first.');
        return;
      }

      const items = (igDetail?.items || [])
        .filter((item) => item.mainitem)
        .map((item) => ({
          item_code: item.mainitem,
          item_name: item.maindescription || item.mainitem,
          item_type: 'raw_material',
          base_uom: item.mainunit || 'KG',
          oracle_cat_desc: item.catlinedesc || igDetail?.catlinedesc || null,
          ...payload,
        }));

      if (!items.length) {
        message.warning('No items available for bulk MRP update.');
        return;
      }

      setBulkMrpSaving(true);
      const res = await axios.patch(
        `${API}/api/mes/master-data/items/mrp/bulk`,
        { items },
        { headers }
      );

      const updated = res.data?.data?.updated || 0;
      const skipped = res.data?.data?.skipped?.length || 0;
      message.success(`Bulk MRP update complete: ${updated} updated${skipped ? `, ${skipped} skipped` : ''}`);
      bulkMrpForm.resetFields();
      await refreshDetail();
      fetchProfile(selectedCatId, searchText);
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.error || 'Bulk MRP update failed');
    } finally {
      setBulkMrpSaving(false);
    }
  }, [bulkMrpForm, headers, message, igDetail, refreshDetail, fetchProfile, selectedCatId, searchText]);

  const handleSaveMrpRow = useCallback(async (item) => {
    if (!item?.mainitem) {
      message.warning('Item code is missing for MRP update.');
      return;
    }

    const draft = rowDrafts[item.item_key] || {};
    const mrpFields = [
      'mrp_type',
      'reorder_point',
      'safety_stock_kg',
      'procurement_type',
      'planned_lead_time_days',
      'lot_size_rule',
      'fixed_lot_size_kg',
      'assembly_scrap_pct',
    ];

    const payload = {};
    mrpFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(draft, field)) payload[field] = draft[field] ?? null;
    });

    if (!Object.keys(payload).length) return;

    setSavingItemKey(item.item_key);
    try {
      const res = await axios.patch(
        `${API}/api/mes/master-data/items/mrp/bulk`,
        {
          items: [{
            item_code: item.mainitem,
            item_name: item.maindescription || item.mainitem,
            item_type: 'raw_material',
            base_uom: item.mainunit || 'KG',
            oracle_cat_desc: item.catlinedesc || igDetail?.catlinedesc || null,
            ...payload,
          }],
        },
        { headers }
      );

      const updated = res.data?.data?.updated || 0;
      if (!updated) {
        message.warning('No MRP rows were updated.');
        return;
      }

      message.success('MRP settings updated');
      await refreshDetail();
      fetchProfile(selectedCatId, searchText);
    } catch (err) {
      message.error(err.response?.data?.error || 'MRP save failed');
    } finally {
      setSavingItemKey(null);
    }
  }, [rowDrafts, headers, message, igDetail, refreshDetail, fetchProfile, selectedCatId, searchText]);

  // Material Profile tab is now universal — shown for ALL material classes (resins + non-resins)
  const isMaterialProfileDrawer = useMemo(
    () => !!igDetail?.category?.material_class,
    [igDetail]
  );

  const activeMaterialClass = useMemo(
    () => normalizeKey(igDetail?.category?.material_class),
    [igDetail]
  );

  const materialProfileFieldKeys = useMemo(
    () => getMaterialProfileFieldKeys(activeMaterialClass),
    [activeMaterialClass]
  );

  const materialProfileNumericFields = useMemo(
    () => materialProfileFieldKeys
      .map((key) => ({ key, ...(MATERIAL_PROFILE_NUMERIC_FIELD_META[key] || {}) }))
      .filter((field) => field.label),
    [materialProfileFieldKeys]
  );

  const materialProfileNumericFieldRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < materialProfileNumericFields.length; i += 6) {
      rows.push(materialProfileNumericFields.slice(i, i + 6));
    }
    return rows;
  }, [materialProfileNumericFields]);

  const showResinTypeField = useMemo(
    () => ['resins', 'substrates'].includes(activeMaterialClass),
    [activeMaterialClass]
  );

  const showAlloyField = useMemo(
    () => activeMaterialClass === 'substrates',
    [activeMaterialClass]
  );

  const substrateCandidateItems = useMemo(() => {
    const map = new Map();

    (igDetail?.items || []).forEach((item) => {
      const key = normalizeKey(item.mainitem || item.item_key);
      if (!key) return;

      if (!map.has(key)) {
        map.set(key, {
          key,
          item_code: item.mainitem || item.item_key,
          description: item.maindescription || '',
          stock_qty: Number(item.stock_qty) || 0,
          order_qty: Number(item.order_qty) || 0,
        });
      }
    });

    return Array.from(map.values());
  }, [igDetail]);

  const substrateCandidateKeys = useMemo(
    () => substrateCandidateItems.map((row) => row.key),
    [substrateCandidateItems]
  );

  const substrateMappedKeys = useMemo(
    () => normalizeStringArray(substrateDraft?.mapped_material_keys),
    [substrateDraft]
  );

  const unmappedSubstrateItems = useMemo(() => {
    const selected = new Set(substrateMappedKeys);
    return substrateCandidateItems.filter((row) => !selected.has(row.key));
  }, [substrateCandidateItems, substrateMappedKeys]);

  const substrateParamCards = useMemo(() => {
    // Support both new universal response (param_definitions + param_values)
    // and legacy response (spec_params + param_meta)
    const paramValues = substrateProfile?.param_values || {};
    const paramDefs = substrateProfile?.param_definitions || [];
    const legacyParams = substrateProfile?.spec_params || {};
    const legacyMeta = substrateProfile?.param_meta || {};

    const cards = [];

    if (Object.keys(paramValues).length) {
      // New universal response shape — driven by param_definitions
      const defMap = {};
      const sortedDefs = [...paramDefs].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      for (const def of sortedDefs) {
        defMap[def.field_key] = def;
      }

      // Render in definition order; include defs even if no value
      const renderedKeys = new Set();
      for (const def of sortedDefs) {
        const key = def.field_key;
        const agg = paramValues[key];
        const value = agg ? toOptionalNumber(agg.weightedAvg) : null;
        const decimals = String(key).includes('density') ? 4 : 2;
        cards.push({
          key,
          value,
          decimals,
          unit: def.unit || '',
          label: def.label || toPrettyLabel(key),
          group: def.display_group || null,
          min: agg ? toOptionalNumber(agg.min) : null,
          max: agg ? toOptionalNumber(agg.max) : null,
          count: agg?.count || 0,
        });
        renderedKeys.add(key);
      }

      // Append any values not in definitions (unknown params)
      for (const [key, agg] of Object.entries(paramValues)) {
        if (renderedKeys.has(key)) continue;
        const value = toOptionalNumber(agg?.weightedAvg);
        const decimals = String(key).includes('density') ? 4 : 2;
        cards.push({
          key,
          value,
          decimals,
          unit: '',
          label: toPrettyLabel(key),
          group: null,
          min: toOptionalNumber(agg?.min),
          max: toOptionalNumber(agg?.max),
          count: agg?.count || 0,
        });
      }
    } else {
      // Legacy response shape
      for (const [key, rawValue] of Object.entries(legacyParams)) {
        const value = toOptionalNumber(rawValue);
        const metaRow = legacyMeta?.[key] || {};
        const parsedDecimals = Number(metaRow.decimals);
        const decimals = Number.isFinite(parsedDecimals)
          ? parsedDecimals
          : (String(key).includes('density') ? 4 : 2);
        cards.push({
          key,
          value,
          decimals,
          unit: metaRow.unit || '',
          label: metaRow.label || toPrettyLabel(key),
          group: null,
        });
      }
      cards.sort((a, b) => a.label.localeCompare(b.label));
    }

    return cards;
  }, [substrateProfile]);

  /** Group param cards by display_group for sectioned rendering */
  const substrateParamGroups = useMemo(() => {
    const groups = [];
    const groupMap = new Map();

    for (const card of substrateParamCards) {
      const groupName = card.group || '';
      if (!groupMap.has(groupName)) {
        groupMap.set(groupName, []);
        groups.push(groupName);
      }
      groupMap.get(groupName).push(card);
    }

    return groups.map((name) => ({
      name,
      cards: groupMap.get(name),
    }));
  }, [substrateParamCards]);

  const fetchSubstrateProfile = useCallback(async ({ materialClass, catDesc, appearance, materialKeys }) => {
    const keys = normalizeStringArray(materialKeys);

    if (!materialClass || !catDesc) {
      setSubstrateProfile(null);
      return;
    }

    setSubstrateProfileLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('material_class', materialClass);
      params.set('cat_desc', catDesc);
      params.set('appearance', appearance || '');
      if (keys.length) params.set('material_keys', keys.join(','));

      const res = await axios.get(
        `${API}/api/mes/master-data/items/material-profile?${params.toString()}`,
        { headers }
      );
      setSubstrateProfile(res.data?.data || null);
    } catch {
      if (materialClass === 'resins') {
        setSubstrateProfile(null);
      } else {
        // Fallback to legacy endpoint for DBs without migration 040
        try {
          const params = new URLSearchParams();
          params.set('material_class', materialClass);
          params.set('cat_desc', catDesc);
          params.set('appearance', appearance || '');
          if (keys.length) params.set('material_keys', keys.join(','));

          const res = await axios.get(
            `${API}/api/mes/master-data/items/substrate-profile?${params.toString()}`,
            { headers }
          );
          setSubstrateProfile(res.data?.data || null);
        } catch {
          setSubstrateProfile(null);
        }
      }
    } finally {
      setSubstrateProfileLoading(false);
    }
  }, [headers]);

  const loadSubstrateConfig = useCallback(async (detail) => {
    // Universal: now works for ALL material classes (resins + non-resins)
    if (!detail || !detail.category?.material_class) {
      setSubstrateDraft(null);
      setSubstrateProfile(null);
      setSubstrateLoading(false);
      return;
    }

    const materialClass = normalizeKey(detail.category?.material_class);
    const catDesc = String(detail.catlinedesc || detail.items?.[0]?.catlinedesc || '').trim();
    const appearance = String(detail.itemgroup || '').trim();
    const fallbackKeys = normalizeStringArray((detail.items || []).map((item) => item.mainitem || item.item_key));
    const pricingFallback = deriveMaterialProfilePriceFallback(detail);

    if (!catDesc) {
      setSubstrateDraft(null);
      setSubstrateProfile(null);
      return;
    }

    setSubstrateLoading(true);
    try {
      let res;
      try {
        res = await axios.get(
          `${API}/api/mes/master-data/items/material-config`,
          {
            headers,
            params: {
              material_class: materialClass,
              cat_desc: catDesc,
              appearance,
            },
          }
        );
      } catch (err) {
        if (materialClass === 'resins') throw err;
        // Fallback to legacy endpoint
        res = await axios.get(
          `${API}/api/mes/master-data/items/substrate-config`,
          {
            headers,
            params: {
              material_class: materialClass,
              cat_desc: catDesc,
              appearance,
            },
          }
        );
      }

      const existing = res.data?.data || {};
      const hydratedExisting = { ...existing };
      ['market_ref_price', 'market_price_date'].forEach((field) => {
        if (hydratedExisting[field] == null || hydratedExisting[field] === '') {
          hydratedExisting[field] = pricingFallback[field] ?? null;
        }
      });

      const configuredKeys = normalizeStringArray(existing.mapped_material_keys);
      const hasPersistedConfig = Boolean(existing?.id);
      const mappedKeys = hasPersistedConfig ? configuredKeys : (configuredKeys.length ? configuredKeys : fallbackKeys);

      const nextDraft = buildSubstrateDraft({
        ...hydratedExisting,
        material_class: materialClass,
        cat_desc: catDesc,
        appearance,
        mapped_material_keys: mappedKeys,
      });

      setSubstrateDraft(nextDraft);
      await fetchSubstrateProfile({
        materialClass,
        catDesc,
        appearance,
        materialKeys: mappedKeys,
      });
    } catch (err) {
      const fallbackDraft = buildSubstrateDraft({
        ...pricingFallback,
        material_class: materialClass,
        cat_desc: catDesc,
        appearance,
        mapped_material_keys: fallbackKeys,
      });
      setSubstrateDraft(fallbackDraft);
      setSubstrateProfile(null);
      message.warning(err.response?.data?.error || 'Substrate profile config unavailable. Using item-group defaults.');
    } finally {
      setSubstrateLoading(false);
    }
  }, [headers, message, fetchSubstrateProfile]);

  useEffect(() => {
    loadSubstrateConfig(igDetail);
  }, [igDetail, loadSubstrateConfig]);

  const updateSubstrateDraft = useCallback((field, value) => {
    setSubstrateDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [field]: value,
      };
    });
  }, []);

  const handleSubstrateMappedKeysChange = useCallback((values) => {
    if (!substrateDraft) return;

    const normalized = normalizeStringArray(values);

    setSubstrateDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        mapped_material_keys: normalized,
      };
    });

    fetchSubstrateProfile({
      materialClass: substrateDraft.material_class,
      catDesc: substrateDraft.cat_desc,
      appearance: substrateDraft.appearance,
      materialKeys: normalized,
    });
  }, [substrateDraft, fetchSubstrateProfile]);

  const handleMapAllSubstrateItems = useCallback(() => {
    if (!substrateDraft || !substrateCandidateKeys.length) return;

    setSubstrateDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        mapped_material_keys: substrateCandidateKeys,
      };
    });

    fetchSubstrateProfile({
      materialClass: substrateDraft.material_class,
      catDesc: substrateDraft.cat_desc,
      appearance: substrateDraft.appearance,
      materialKeys: substrateCandidateKeys,
    });
  }, [substrateDraft, substrateCandidateKeys, fetchSubstrateProfile]);

  const handleRefreshSubstrateProfile = useCallback(() => {
    if (!substrateDraft) return;

    fetchSubstrateProfile({
      materialClass: substrateDraft.material_class,
      catDesc: substrateDraft.cat_desc,
      appearance: substrateDraft.appearance,
      materialKeys: substrateMappedKeys,
    });
  }, [substrateDraft, substrateMappedKeys, fetchSubstrateProfile]);

  const handleSaveSubstrateConfig = useCallback(async () => {
    if (!substrateDraft || !isMaterialProfileDrawer) return;

    if (!substrateDraft.cat_desc) {
      message.warning('Category group (cat_desc) is required before saving substrate config.');
      return;
    }

    const payload = {
      material_class: substrateDraft.material_class,
      cat_desc: substrateDraft.cat_desc,
      appearance: substrateDraft.appearance || '',
      supplier_name: substrateDraft.supplier_name || null,
      resin_type: substrateDraft.resin_type || null,
      alloy_code: substrateDraft.alloy_code || null,
      density_g_cm3: toOptionalNumber(substrateDraft.density_g_cm3),
      solid_pct: toOptionalNumber(substrateDraft.solid_pct),
      micron_thickness: toOptionalNumber(substrateDraft.micron_thickness),
      width_mm: toOptionalNumber(substrateDraft.width_mm),
      yield_m2_per_kg: toOptionalNumber(substrateDraft.yield_m2_per_kg),
      roll_length_m: toOptionalNumber(substrateDraft.roll_length_m),
      core_diameter_mm: toOptionalNumber(substrateDraft.core_diameter_mm),
      market_ref_price: toOptionalNumber(substrateDraft.market_ref_price),
      market_price_date: substrateDraft.market_price_date || null,
      mrp_type: (substrateDraft.mrp_type || 'PD').toUpperCase(),
      reorder_point: toOptionalNumber(substrateDraft.reorder_point),
      safety_stock_kg: toOptionalNumber(substrateDraft.safety_stock_kg),
      planned_lead_time_days: toOptionalInteger(substrateDraft.planned_lead_time_days),
      mapped_material_keys: normalizeStringArray(substrateDraft.mapped_material_keys),
    };

    setSubstrateSaving(true);
    try {
      let res;
      try {
        res = await axios.put(
          `${API}/api/mes/master-data/items/material-profile-config`,
          payload,
          { headers }
        );
      } catch {
        // Fallback to legacy endpoint
        res = await axios.put(
          `${API}/api/mes/master-data/items/substrate-config`,
          payload,
          { headers }
        );
      }

      const saved = buildSubstrateDraft({
        ...payload,
        ...(res.data?.data || {}),
        mapped_material_keys: res.data?.data?.mapped_material_keys || payload.mapped_material_keys,
      });

      setSubstrateDraft(saved);
      message.success('Substrate profile saved');

      fetchSubstrateProfile({
        materialClass: saved.material_class,
        catDesc: saved.cat_desc,
        appearance: saved.appearance,
        materialKeys: saved.mapped_material_keys,
      });

      if (selectedCatId) fetchProfile(selectedCatId, searchText);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to save substrate profile');
    } finally {
      setSubstrateSaving(false);
    }
  }, [substrateDraft, isMaterialProfileDrawer, headers, message, fetchSubstrateProfile, selectedCatId, fetchProfile, searchText]);

  // ── Custom Group Handlers ──────────────────────────────────────────────────
  const handleCreateCustomGroup = useCallback(async () => {
    const name = customGroupName.trim();
    if (!name || !selectedCatId) return;
    setCustomGroupCreating(true);
    try {
      await axios.post(
        `${API}/api/mes/master-data/items/custom-categories/${selectedCatId}/custom-group`,
        { group_name: name },
        { headers }
      );
      message.success(`Custom group "${name}" created`);
      setCustomGroupName('');
      fetchProfile(selectedCatId, searchText);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to create custom group');
    } finally {
      setCustomGroupCreating(false);
    }
  }, [customGroupName, selectedCatId, headers, message, fetchProfile, searchText]);

  const openAssignCustomGroup = useCallback(async (group) => {
    setCustomGroupTarget(group);
    setCustomGroupAssignOpen(true);
    setCustomGroupLoading(true);
    setCustomGroupSearchText('');
    try {
      // Load existing assignments
      const res = await axios.get(
        `${API}/api/mes/master-data/items/custom-categories/${selectedCatId}/custom-group/${group.group_id}/items`,
        { headers }
      );
      const existingKeys = new Set((res.data?.data || []).map((r) => r.item_key));
      setCustomGroupSelectedKeys(existingKeys);
      // Load individual items for assignment (item-level, not item-group level)
      const itemsRes = await axios.get(
        `${API}/api/mes/master-data/items/custom-categories/${selectedCatId}/assignable-items`,
        {
          headers,
          params: { current_group_id: group.group_id },
        }
      );
      const allItems = (itemsRes.data?.data || []).map((item) => ({
        key: item.item_key,
        mainitem: item.mainitem,
        maindescription: item.maindescription,
        catlinedesc: item.catlinedesc,
        itemgroup: item.itemgroup,
        stock_qty: Number(item.stock_qty) || 0,
        current_override: item.current_override,
        is_selected: Boolean(item.is_selected),
        is_unmapped: Boolean(item.is_unmapped),
      }));
      setCustomGroupItems(allItems);
    } catch (err) {
      message.error('Failed to load assignable items');
    } finally {
      setCustomGroupLoading(false);
    }
  }, [selectedCatId, headers, message]);

  const handleSaveCustomGroupItems = useCallback(async () => {
    if (!customGroupTarget || !selectedCatId) return;
    setCustomGroupLoading(true);
    try {
      await axios.put(
        `${API}/api/mes/master-data/items/custom-categories/${selectedCatId}/custom-group/${customGroupTarget.group_id}/items`,
        { item_keys: Array.from(customGroupSelectedKeys) },
        { headers }
      );
      message.success('Custom group items saved');
      setCustomGroupAssignOpen(false);
      await Promise.all([
        fetchProfile(selectedCatId, searchText),
        fetchCategories(),
      ]);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to save custom group items');
    } finally {
      setCustomGroupLoading(false);
    }
  }, [customGroupTarget, selectedCatId, customGroupSelectedKeys, headers, message, fetchProfile, fetchCategories, searchText]);

  const handleDeleteCustomGroup = useCallback(async (group) => {
    if (!selectedCatId) return;
    try {
      await axios.delete(
        `${API}/api/mes/master-data/items/custom-categories/${selectedCatId}/custom-group/${group.group_id}`,
        { headers }
      );
      message.success(`Custom group "${group.catlinedesc || group.display_name}" deleted`);
      await Promise.all([
        fetchProfile(selectedCatId, searchText),
        fetchCategories(),
      ]);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to delete custom group');
    }
  }, [selectedCatId, headers, message, fetchProfile, fetchCategories, searchText]);

  const customGroupVisibleItems = useMemo(() => {
    const search = String(customGroupSearchText || '').trim().toLowerCase();
    if (!search) return customGroupItems;

    return customGroupItems.filter((item) => {
      const haystack = [
        item.mainitem,
        item.maindescription,
        item.catlinedesc || 'Unmapped',
        item.itemgroup,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return haystack.includes(search);
    });
  }, [customGroupItems, customGroupSearchText]);

  const detailSupplierOptions = useMemo(() => {
    const values = Array.from(new Set(
      (igDetail?.items || [])
        .map((item) => String(item.supplier || '').trim())
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b));

    return values.map((value) => ({ value, label: value }));
  }, [igDetail]);

  const detailVisibleItems = useMemo(() => {
    const search = String(detailSearchText || '').trim().toLowerCase();

    return (igDetail?.items || []).filter((item) => {
      if (detailSupplierFilter !== 'all') {
        const supplier = String(item.supplier || '').trim();
        if (supplier !== detailSupplierFilter) return false;
      }

      if (!search) return true;

      const itemCode = String(item.mainitem || '').toLowerCase();
      const description = String(item.maindescription || '').toLowerCase();
      const supplier = String(item.supplier || '').toLowerCase();
      return itemCode.includes(search) || description.includes(search) || supplier.includes(search);
    });
  }, [igDetail, detailSearchText, detailSupplierFilter]);

  useEffect(() => {
    if (!igDetail) {
      setDetailAggregates(null);
      setDetailAggregatesLoading(false);
      return;
    }

    const totalCount = (igDetail.items || []).length;
    if (!totalCount) {
      setDetailAggregates({
        total_count: 0,
        visible_count: 0,
        totals: { ...EMPTY_DETAIL_TOTALS },
        spec_rows: [],
        metrics: [],
      });
      setDetailAggregatesLoading(false);
      return;
    }

    let cancelled = false;
    setDetailAggregatesLoading(true);

    axios.post(
      `${API}/api/mes/master-data/items/custom-categories/detail-aggregates`,
      {
        material_class: igDetail?.category?.material_class || null,
        items: igDetail.items || [],
        search: detailSearchText,
        supplier: detailSupplierFilter,
      },
      { headers }
    )
      .then((res) => {
        if (cancelled) return;
        setDetailAggregates(res.data?.data || {
          total_count: totalCount,
          visible_count: detailVisibleItems.length,
          totals: { ...EMPTY_DETAIL_TOTALS },
          spec_rows: [],
          metrics: [],
        });
      })
      .catch(() => {
        if (cancelled) return;
        setDetailAggregates({
          total_count: totalCount,
          visible_count: detailVisibleItems.length,
          totals: { ...EMPTY_DETAIL_TOTALS },
          spec_rows: [],
          metrics: [],
        });
      })
      .finally(() => {
        if (!cancelled) setDetailAggregatesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [igDetail, detailSearchText, detailSupplierFilter, headers]);

  const visiblePricingTotals = useMemo(
    () => detailAggregates?.totals || EMPTY_DETAIL_TOTALS,
    [detailAggregates]
  );

  const aggregatedSpecRows = useMemo(
    () => (detailAggregates?.spec_rows || []).map((row) => ({ ...row, id: row.key })),
    [detailAggregates]
  );

  const detailScopeBadge = useMemo(() => {
    const total = Number(detailAggregates?.total_count ?? (igDetail?.items || []).length) || 0;
    const visible = Number(detailAggregates?.visible_count ?? detailVisibleItems.length) || 0;
    const supplierLabel = detailSupplierFilter !== 'all' ? `Supplier: ${detailSupplierFilter}` : 'Supplier: All';
    const searchLabel = String(detailSearchText || '').trim()
      ? `Search: ${String(detailSearchText || '').trim()}`
      : null;
    return [supplierLabel, searchLabel, `${visible}/${total} visible`].filter(Boolean).join(' • ');
  }, [detailAggregates, igDetail, detailVisibleItems.length, detailSupplierFilter, detailSearchText]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Item Master</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New Category</Button>
      </div>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {visibleCategories.map((cat) => {
              const active = selectedCatId === cat.id;
              const unmappedCount = Number(cat.unmapped_item_count) || 0;
              const unmappedRows = Array.isArray(cat.unmapped_items) ? cat.unmapped_items : [];
              const overflowCount = Number(cat.unmapped_overflow_count) || 0;

              const unmappedTooltip = (
                <div style={{ maxWidth: 520 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    {cat.name} — Unmapped Items ({unmappedCount.toLocaleString()})
                  </div>
                  {unmappedRows.length ? (
                    <div style={{ maxHeight: 260, overflowY: 'auto', paddingRight: 4 }}>
                      {unmappedRows.map((row) => (
                        <div key={`${cat.id}-${row.item_key || row.item_code}`} style={{ fontSize: 12, marginBottom: 4 }}>
                          <Text strong>{row.item_code || '—'}</Text>
                          {row.item_description ? (
                            <span style={{ color: '#64748b' }}> — {row.item_description}</span>
                          ) : null}
                        </div>
                      ))}
                      {overflowCount > 0 ? (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          +{overflowCount.toLocaleString()} more
                        </Text>
                      ) : null}
                    </div>
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>No unmapped items.</Text>
                  )}
                </div>
              );

              return (
                <div
                  key={cat.id}
                  style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    minWidth: 92,
                  }}
                >
                  <Button
                    size="small"
                    type="text"
                    onClick={() => setSelectedCatId(cat.id)}
                    style={{
                      borderRadius: 999,
                      border: active ? '1px solid #7c3aed' : '1px solid #e2e8f0',
                      background: active
                        ? 'linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)'
                        : '#ffffff',
                      color: active ? '#ffffff' : '#312e81',
                      fontWeight: active ? 700 : 500,
                      paddingInline: 12,
                      height: 30,
                    }}
                  >
                    {cat.name}
                  </Button>
                  <Tooltip title={unmappedTooltip} placement="bottom" mouseEnterDelay={0.2}>
                    <Text
                      style={{
                        fontSize: 11,
                        lineHeight: '14px',
                        cursor: 'help',
                        color: unmappedCount > 0 ? '#cf1322' : '#52c41a',
                        userSelect: 'none',
                      }}
                    >
                      unmapped: {unmappedCount.toLocaleString()}
                    </Text>
                  </Tooltip>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {visibleCategories.length} category{visibleCategories.length === 1 ? '' : 'ies'} · {allVisibleCategoryItemCount} mapped items · {allVisibleCategoryUnmappedCount} unmapped items
            </Text>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Input
              size="small"
              allowClear
              style={{ width: 420 }}
              prefix={<SearchOutlined />}
              placeholder="Global search: item code, description, supplier, item group"
              value={globalSearchDraft}
              onChange={(e) => setGlobalSearchDraft(e.target.value)}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {globalSearch
                ? `${globalSearchRows.length} global match${globalSearchRows.length === 1 ? '' : 'es'}`
                : 'Search across all mapped categories'}
            </Text>
          </div>

          <Spin spinning={loading}>
            {!loading && !visibleCategories.length && (
              <Text type="secondary" style={{ fontSize: 12 }}>No categories found.</Text>
            )}
          </Spin>
        </Space>
      </Card>

      <div style={{ minWidth: 0 }}>
          {globalSearch ? (
            <Card
              title="Global Item Search"
              extra={<Text type="secondary" style={{ fontSize: 12 }}>{`${globalSearchRows.length} matches`}</Text>}
            >
              <Table
                dataSource={globalSearchRows}
                rowKey={(row) => `${row.category_id || 'x'}-${row.item_key || row.mainitem || 'na'}-${row.itemgroup || 'nogroup'}`}
                size="small"
                pagination={{ pageSize: 20, showSizeChanger: false }}
                loading={globalSearchLoading}
                scroll={{ x: 1420, y: 560 }}
                columns={[
                  { title: 'Category', dataIndex: 'category_name', width: 160, render: (v) => <Text strong>{v}</Text> },
                  { title: 'Class', dataIndex: 'material_class', width: 120, render: (v) => v || '—' },
                  { title: 'Category Group', dataIndex: 'catlinedesc', width: 140, render: (v) => v || '—' },
                  { title: 'Item Group', dataIndex: 'itemgroup', width: 140, render: (v) => v || '—' },
                  { title: 'Item Code', dataIndex: 'mainitem', width: 160, render: (v) => <Text strong style={{ fontSize: 12 }}>{v}</Text> },
                  { title: 'Description', dataIndex: 'maindescription', width: 320, ellipsis: true },
                  { title: 'Supplier', dataIndex: 'supplier', width: 140, render: (v) => v || '—' },
                  { title: 'Stock Qty', dataIndex: 'stock_qty', width: 110, align: 'center', render: fmtQty },
                  { title: 'Order Qty', dataIndex: 'order_qty', width: 110, align: 'center', render: fmtQty },
                  {
                    title: 'Action',
                    width: 100,
                    fixed: 'right',
                    align: 'center',
                    render: (_, row) => (
                      <Button size="small" type="link" onClick={() => handleOpenGlobalResult(row)}>Open</Button>
                    ),
                  },
                ]}
              />
            </Card>
          ) : (
            <Spin spinning={profileLoading}>
              {profile && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <Title level={4} style={{ margin: 0 }}>{profile.category?.name}</Title>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {profile.groups?.length || 0} Category Groups · {(profile.groups || []).reduce((sum, g) => sum + (g.item_group_count || 0), 0)} Item Groups
                      </Text>
                    </div>
                    <Space wrap>
                      <Input
                        style={{ width: 320 }}
                        allowClear
                        prefix={<SearchOutlined />}
                        placeholder="Search item code, description, supplier"
                        value={searchTextDraft}
                        onChange={(e) => setSearchTextDraft(e.target.value)}
                      />
                      {selectedCat && (
                        <Button icon={<EditOutlined />} onClick={() => openEdit(selectedCat)}>
                          Edit Category
                        </Button>
                      )}
                      {selectedCat && (
                        <Popconfirm
                          title="Delete this category?"
                          description="This will deactivate the category and its group mapping."
                          onConfirm={() => handleDeleteCat(selectedCat.id)}
                        >
                          <Button danger icon={<DeleteOutlined />}>
                            Delete Category
                          </Button>
                        </Popconfirm>
                      )}
                      <Button icon={<SettingOutlined />} onClick={() => openGroupConfig(selectedCatId)}>Configure Groups</Button>
                      <Button icon={<ReloadOutlined />} onClick={() => fetchProfile(selectedCatId, searchText)} />
                    </Space>
                  </div>

                  {searchText && (
                    <Alert
                      type="info"
                      showIcon
                      style={{ marginBottom: 12 }}
                      message={`Filtered by search: "${searchText}"`}
                    />
                  )}

                    <Row gutter={[12, 12]} align="stretch">
                      <Col xs={24} xl={6} xxl={5}>
                        <Card size="small" title="Category Groups" styles={{ body: { padding: 10 } }}>
                          <div style={{ maxHeight: 560, overflowY: 'auto', display: 'grid', gap: 8 }}>
                            {sidebarGroups.map((group) => {
                              const active = selectedSidebarGroup?.catlinedesc === group.catlinedesc;
                              return (
                                <div
                                  key={group.catlinedesc}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setSelectedGroupFilter(group.catlinedesc)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      setSelectedGroupFilter(group.catlinedesc);
                                    }
                                  }}
                                  style={{
                                    border: active ? '1px solid #0f766e' : group.is_custom ? '1px dashed #d48806' : '1px solid #e2e8f0',
                                    borderRadius: 10,
                                    padding: '10px 12px',
                                    background: active
                                      ? 'linear-gradient(135deg, rgba(15,118,110,.10), rgba(8,145,178,.08))'
                                      : group.is_custom ? '#fffbe6' : '#fff',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                                      <Text strong style={{ color: active ? '#0f766e' : '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {group.display_name || group.catlinedesc}
                                      </Text>
                                      {group.is_custom && <Tag color="orange" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>Custom</Tag>}
                                    </div>
                                    <Text strong style={{ fontSize: 13, color: active ? '#0f766e' : '#1d39c4', flexShrink: 0 }}>{fmtCurrency(group.avg_price_wa, 2)}</Text>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                      {group.is_custom
                                        ? `${Number(group.item_count) || 0} assigned items`
                                        : `${Number(group.item_group_count) || 0} groups · ${Number(group.item_count) || 0} items`}
                                    </Text>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      {group.is_custom && (
                                        <>
                                          <Tooltip title="Assign items to this custom group">
                                            <Button
                                              type="text"
                                              size="small"
                                              icon={<PlusOutlined />}
                                              style={{ fontSize: 11, padding: '0 4px', height: 20, color: '#0f766e' }}
                                              onClick={(e) => { e.stopPropagation(); openAssignCustomGroup(group); }}
                                            />
                                          </Tooltip>
                                          <Popconfirm
                                            title="Delete this custom group?"
                                            description="This will remove the group and all item assignments."
                                            onConfirm={(e) => { if (e) e.stopPropagation(); handleDeleteCustomGroup(group); }}
                                            onCancel={(e) => { if (e) e.stopPropagation(); }}
                                            okText="Delete"
                                            cancelText="Cancel"
                                            okButtonProps={{ danger: true }}
                                          >
                                            <Button
                                              type="text"
                                              size="small"
                                              danger
                                              icon={<DeleteOutlined />}
                                              style={{ fontSize: 11, padding: '0 4px', height: 20 }}
                                              onClick={(e) => e.stopPropagation()}
                                            />
                                          </Popconfirm>
                                        </>
                                      )}
                                      <Tooltip title="Weighted Average of Stock and On Order prices">
                                        <Text type="secondary" style={{ fontSize: 10, cursor: 'help', borderBottom: '1px dotted #94a3b8' }}>W.A</Text>
                                      </Tooltip>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {!sidebarGroups.length && (
                              <Text type="secondary" style={{ fontSize: 12 }}>No category groups found.</Text>
                            )}
                          </div>
                        </Card>
                      </Col>

                      <Col xs={24} xl={18} xxl={19}>
                        <Card
                          size="small"
                          title={selectedSidebarGroup ? `Item Groups — ${selectedSidebarGroup.catlinedesc}` : 'Item Groups'}
                          extra={selectedSidebarGroup ? (
                            <Button
                              size="small"
                              type="link"
                              icon={<EditOutlined />}
                              onClick={() => openCategoryGroup(selectedSidebarGroup.catlinedesc)}
                            >
                              Edit Group
                            </Button>
                          ) : null}
                        >
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                            <Tooltip title={WEIGHTED_AVG_NOTE}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: '4px 10px',
                                  borderRadius: 999,
                                  border: '1px solid #dbeafe',
                                  background: '#f8fbff',
                                  color: '#475569',
                                  fontSize: 12,
                                  cursor: 'help',
                                }}
                              >
                                <InfoCircleOutlined />
                                Weighted avg formula
                              </span>
                            </Tooltip>
                          </div>

                          <Row gutter={[12, 8]} style={{ marginBottom: 10 }}>
                            {[
                              { label: 'Stock Price (Weighted)', value: selectedSidebarPricing.stock_price_wa, color: '#389e0d' },
                              { label: 'On Order Price (Weighted)', value: selectedSidebarPricing.on_order_price_wa, color: '#d46b08' },
                              { label: 'Weighted Avg', value: selectedSidebarPricing.avg_price_wa, color: '#1d39c4' },
                              { label: 'Market Price', value: selectedSidebarPricing.market_price_wa, color: '#7c3aed' },
                            ].map((kpi) => (
                              <Col xs={12} md={6} key={kpi.label}>
                                <div style={{ padding: '2px 0' }}>
                                  <div style={{ fontSize: 11, color: '#64748b' }}>{kpi.label}</div>
                                  <div style={{ fontSize: 17, fontWeight: 700, color: kpi.color }}>{fmtCurrency(kpi.value, 2)}</div>
                                </div>
                              </Col>
                            ))}
                          </Row>

                          <Table
                            dataSource={selectedSidebarItemGroups}
                            rowKey="itemgroup"
                            size="small"
                            pagination={false}
                            locale={{ emptyText: 'No item groups under the selected category group.' }}
                            scroll={{ y: 470 }}
                            columns={[
                              {
                                title: 'Item Group',
                                dataIndex: 'itemgroup',
                                width: 220,
                                render: (v) => <Text strong style={{ fontSize: 13, whiteSpace: 'normal' }}>{v}</Text>,
                              },
                              {
                                title: 'Stock Price (W.A)',
                                dataIndex: 'stock_price_wa',
                                align: 'center',
                                width: 100,
                                render: (v) => <span style={{ color: '#389e0d' }}>{fmtCurrency(v, 2)}</span>,
                              },
                              {
                                title: 'On Order Price (W.A)',
                                dataIndex: 'on_order_price_wa',
                                align: 'center',
                                width: 108,
                                render: (v) => <span style={{ color: '#d46b08' }}>{fmtCurrency(v, 2)}</span>,
                              },
                              {
                                title: 'Combined Weighted',
                                dataIndex: 'avg_price_wa',
                                align: 'center',
                                width: 108,
                                render: (v) => <span style={{ color: '#1d39c4' }}>{fmtCurrency(v, 2)}</span>,
                              },
                              {
                                title: 'Market Price',
                                dataIndex: 'market_price_wa',
                                align: 'center',
                                width: 100,
                                render: (v) => <span style={{ color: '#7c3aed' }}>{fmtCurrency(v, 2)}</span>,
                              },
                              {
                                title: 'Stock Qty',
                                dataIndex: 'stock_qty',
                                align: 'center',
                                width: 90,
                                render: fmtQty,
                              },
                              {
                                title: 'Order Qty',
                                dataIndex: 'order_qty',
                                align: 'center',
                                width: 90,
                                render: fmtQty,
                              },
                              {
                                title: 'Total Qty',
                                align: 'center',
                                width: 90,
                                render: (_, rec) => fmtQty((Number(rec.stock_qty) || 0) + (Number(rec.order_qty) || 0)),
                              },
                              {
                                title: 'Action',
                                align: 'center',
                                width: 64,
                                render: (_, rec) => (
                                  <Button
                                    size="small"
                                    type="link"
                                    icon={<EditOutlined />}
                                    onClick={() => openItemGroup(rec.itemgroup, selectedSidebarGroup?.catlinedesc || null)}
                                  >
                                    Edit
                                  </Button>
                                ),
                              },
                            ]}
                          />
                        </Card>
                      </Col>
                    </Row>
                </>
              )}
            </Spin>
          )}
        </div>

      <Modal
        title={editingCat ? 'Edit Category' : 'New Category'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSaveCat}
        forceRender
        okText="Save"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Category Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Resins, Substrates, Solvents" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="material_class"
            label="Material Class"
            help="Determines which parameter profile is used"
          >
            <Select allowClear placeholder="Select" style={{ width: '100%' }} options={materialClassFieldOptions} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Configure Category Groups — ${selectedCat?.name || ''}`}
        open={groupModalOpen}
        onCancel={() => setGroupModalOpen(false)}
        onOk={handleSaveGroups}
        okText="Save"
        width={620}
      >
        <Spin spinning={groupsLoading}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            Select which Category Groups (CATLINEDESC from Oracle) belong to this category.
          </Text>
          <Space style={{ marginBottom: 8 }}>
            <Button
              size="small"
              onClick={() => setSelectedGroups(new Set(availableGroups.map((g) => g.catlinedesc)))}
            >
              Select All
            </Button>
            <Button size="small" onClick={() => setSelectedGroups(new Set())}>Clear All</Button>
          </Space>
          <Table
            dataSource={availableGroups}
            rowKey="catlinedesc"
            size="small"
            pagination={false}
            scroll={{ y: 400 }}
            columns={[
              {
                title: 'Include',
                width: 70,
                align: 'center',
                render: (_, row) => (
                  <Checkbox
                    checked={selectedGroups.has(row.catlinedesc)}
                    onChange={(e) => {
                      const next = new Set(selectedGroups);
                      if (e.target.checked) next.add(row.catlinedesc);
                      else next.delete(row.catlinedesc);
                      setSelectedGroups(next);
                    }}
                  />
                ),
              },
              { title: 'Category Group', dataIndex: 'catlinedesc', width: 160 },
              { title: 'Items', dataIndex: 'item_count', width: 60, align: 'center' },
              { title: 'Stock Qty', dataIndex: 'stock_qty', width: 110, align: 'center', render: fmtQty },
            ]}
          />
          <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
            {selectedGroups.size} groups selected
          </div>

          <Divider style={{ margin: '12px 0 8px' }}>Create Custom Group</Divider>
          <Space>
            <Input
              size="small"
              placeholder="Custom group name"
              value={customGroupName}
              onChange={(e) => setCustomGroupName(e.target.value)}
              style={{ width: 200 }}
              maxLength={120}
            />
            <Button
              size="small"
              type="primary"
              loading={customGroupCreating}
              disabled={!customGroupName.trim()}
              onClick={handleCreateCustomGroup}
            >
              Create
            </Button>
          </Space>
        </Spin>
      </Modal>

      {/* Custom Group Item Assignment Modal */}
      <Modal
        title={`Assign Unmapped Items — ${customGroupTarget?.display_name || customGroupTarget?.catlinedesc || ''}`}
        open={customGroupAssignOpen}
        onCancel={() => {
          setCustomGroupAssignOpen(false);
          setCustomGroupSearchText('');
        }}
        onOk={handleSaveCustomGroupItems}
        okText="Save Assignments"
        width="92vw"
        confirmLoading={customGroupLoading}
      >
        <Spin spinning={customGroupLoading}>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="Unmapped items for this category"
            description="Only unmapped items are shown. Items already assigned to this custom group stay visible so you can review or remove them."
          />
          <Input
            placeholder="Search by item code, description, Oracle group, or item group"
            prefix={<SearchOutlined />}
            allowClear
            size="small"
            value={customGroupSearchText}
            style={{ marginBottom: 8, maxWidth: 420 }}
            onChange={(e) => setCustomGroupSearchText(e.target.value || '')}
          />
          <Table
            dataSource={customGroupVisibleItems}
            rowKey="key"
            size="small"
            pagination={false}
            scroll={{ y: 400 }}
            tableLayout="fixed"
            locale={{ emptyText: `No unmapped ${String(selectedCat?.name || 'category').toLowerCase()} items available` }}
            columns={[
              {
                title: 'Select',
                width: 64,
                align: 'center',
                render: (_, row) => (
                  <Checkbox
                    checked={customGroupSelectedKeys.has(row.key)}
                    onChange={(e) => {
                      const next = new Set(customGroupSelectedKeys);
                      if (e.target.checked) next.add(row.key);
                      else next.delete(row.key);
                      setCustomGroupSelectedKeys(next);
                    }}
                  />
                ),
              },
              { title: 'Item Code', dataIndex: 'mainitem', width: 160, ellipsis: true },
              { title: 'Description', dataIndex: 'maindescription', width: 250, ellipsis: true },
              {
                title: 'Oracle Group',
                dataIndex: 'catlinedesc',
                width: 140,
                ellipsis: true,
                render: (value) => value || <Text type="secondary">Unmapped</Text>,
              },
              { title: 'Stock Qty', dataIndex: 'stock_qty', width: 110, align: 'right', render: fmtQty },
              {
                title: 'State',
                dataIndex: 'is_selected',
                width: 120,
                render: (value, row) => (value
                  ? <Tag color="blue" style={{ fontSize: 10 }}>In This Group</Tag>
                  : row?.is_unmapped
                    ? <Tag color="orange" style={{ fontSize: 10 }}>Unmapped</Tag>
                    : <Tag style={{ fontSize: 10 }}>Eligible</Tag>),
              },
            ]}
          />
          <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
            {customGroupVisibleItems.length} items shown • {customGroupSelectedKeys.size} selected
          </div>
        </Spin>
      </Modal>

      <Modal
        title={
          igDetail
            ? (igDetail.scope_type === 'category_group'
              ? `Category Group: ${igDetail.catlinedesc || igDetail.itemgroup || '—'}`
              : `Item Group: ${igDetail.itemgroup}`)
            : 'Category / Item Group Detail'
        }
        rootClassName="mes-fullscreen-modal"
        open={igDrawerOpen}
        onCancel={() => {
          setIgDrawerOpen(false);
          setIgDetail(null);
          setRowDrafts({});
          setDetailSearchText('');
          setDetailSupplierFilter('all');
          setGroupPricingDraft({ market_ref_price: null, market_price_date: null });
          setGroupPricingSavedAt(null);
          if (igDetail) bulkMrpForm.resetFields();
        }}
        footer={null}
        width="100vw"
        style={{ top: 0, paddingBottom: 0, maxWidth: '100vw', margin: 0 }}
        styles={{
          wrapper: { inset: 0, padding: 0, overflow: 'hidden' },
          content: { height: '100vh', borderRadius: 0, display: 'flex', flexDirection: 'column' },
          body: { flex: 1, minHeight: 0, padding: 12, maxHeight: 'none', overflowY: 'auto', overflowX: 'hidden' },
        }}
        destroyOnHidden
      >
        <Spin spinning={igLoading}>
          {igDetail && (
            <Tabs
              defaultActiveKey="overview"
              size="small"
              items={[
                {
                  key: 'overview',
                  label: 'Overview',
                  children: (
                    <>


                      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
                        <Col xs={12} md={6}>
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            {igDetail.scope_type === 'category_group' ? 'Category Group' : 'Item Group'}
                          </div>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>
                            {igDetail.scope_type === 'category_group'
                              ? (igDetail.catlinedesc || igDetail.itemgroup || '—')
                              : igDetail.itemgroup}
                          </div>
                        </Col>
                        <Col xs={12} md={6}>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Category</div>
                          <div style={{ fontWeight: 500 }}>{igDetail.category?.name || '—'}</div>
                        </Col>
                        <Col xs={12} md={6}>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Items</div>
                          <div style={{ fontWeight: 500 }}>{igDetail.items?.length || 0}</div>
                        </Col>
                        <Col xs={12} md={6}>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Material Class</div>
                          <Tag color="blue">{igDetail.category?.material_class || '—'}</Tag>
                        </Col>
                        <Col xs={24} md={15}>
                          <Tag color="processing" style={{ marginTop: 2 }}>{detailScopeBadge}</Tag>
                        </Col>
                      </Row>

                      <Card
                        size="small"
                        style={{ marginBottom: 12, border: '1px solid #dbeafe', background: '#f8fbff' }}
                        title={(
                          <Space size={8}>
                            <Text strong>Group Market Price</Text>
                            <Tag color="processing">
                              {igDetail.scope_type === 'category_group' ? 'Category Group' : 'Item Group'} level
                            </Tag>
                          </Space>
                        )}
                      >
                        <Row gutter={[10, 10]} align="bottom">
                          <Col xs={24} md={9} lg={8}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Market Price</div>
                            <InputNumber
                              size="small"
                              min={0}
                              step={0.01}
                              style={{ width: '100%' }}
                              value={groupPricingDraft.market_ref_price}
                              onChange={(value) => setGroupPricingDraft((prev) => ({ ...prev, market_ref_price: value }))}
                            />
                          </Col>
                          <Col xs={24} md={8} lg={7}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Market Date</div>
                            <Input
                              size="small"
                              type="date"
                              value={groupPricingDraft.market_price_date || ''}
                              onChange={(e) => setGroupPricingDraft((prev) => ({ ...prev, market_price_date: e.target.value || null }))}
                            />
                          </Col>
                          <Col xs={24} md={7} lg={5}>
                            <Button
                              size="small"
                              type="primary"
                              loading={groupPricingSaving}
                              onClick={handleSaveGroupMarketPrice}
                              block
                            >
                              Save Market Price
                            </Button>
                          </Col>
                        </Row>
                        <Text type="secondary" style={{ fontSize: 11, marginTop: 6, display: 'block' }}>
                          Saved value applies to all items in this {igDetail.scope_type === 'category_group' ? 'category group' : 'item group'}.
                        </Text>
                        {groupPricingSavedAt && (
                          <Text type="secondary" style={{ fontSize: 11, marginTop: 2, display: 'block' }}>
                            Last saved: {groupPricingSavedAt.toLocaleString()}
                          </Text>
                        )}
                      </Card>

                      <Row gutter={[12, 12]}>
                        <Col xs={24} xl={16} xxl={16}>
                          <Card
                            size="small"
                            title="Items"
                            extra={<Text type="secondary" style={{ fontSize: 11 }}>{detailAggregatesLoading ? 'Updating...' : detailScopeBadge}</Text>}
                          >
                            <Space wrap style={{ marginBottom: 10 }}>
                              <Input
                                allowClear
                                value={detailSearchText}
                                onChange={(e) => setDetailSearchText(e.target.value)}
                                placeholder="Search item code / description / supplier"
                                prefix={<SearchOutlined />}
                                style={{ width: 320 }}
                              />
                              <Select
                                value={detailSupplierFilter}
                                onChange={(value) => setDetailSupplierFilter(value)}
                                style={{ width: 220 }}
                                options={[{ value: 'all', label: 'All suppliers' }, ...detailSupplierOptions]}
                              />
                            </Space>
                            <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 8 }}>
                              Showing only essential item-level fields for quick review.
                            </Text>

                            <Table
                              dataSource={detailVisibleItems}
                              rowKey="item_key"
                              size="small"
                              pagination={false}
                              scroll={{ y: 520 }}
                              columns={[
                                { title: 'Description', dataIndex: 'maindescription', width: 320, ellipsis: true },
                                ...(selectedSidebarGroup?.is_custom ? [{
                                  title: 'Source',
                                  dataIndex: 'original_catlinedesc',
                                  width: 140,
                                  ellipsis: true,
                                  render: (v) => v ? <Tag style={{ fontSize: 10 }}>{v}</Tag> : <Text type="secondary" style={{ fontSize: 10 }}>—</Text>,
                                }] : []),
                                { title: 'Stock Qty', dataIndex: 'stock_qty', width: 100, align: 'center', render: fmtQty },
                                { title: 'Order Qty', dataIndex: 'order_qty', width: 100, align: 'center', render: fmtQty },
                                { title: 'Stock', dataIndex: 'stock_price', width: 90, align: 'center', render: (v) => fmtCurrency(v, 2) },
                                { title: 'On Order', dataIndex: 'on_order_price', width: 90, align: 'center', render: (v) => fmtCurrency(v, 2) },
                                {
                                  title: 'Specs',
                                  dataIndex: 'tds_id',
                                  width: 60,
                                  align: 'center',
                                  render: (v) => (v
                                    ? <Tag color="green" style={{ fontSize: 10 }}>Yes</Tag>
                                    : <Tag style={{ fontSize: 10 }}>No</Tag>),
                                },
                              ]}
                            />
                          </Card>
                        </Col>

                        <Col xs={24} xl={8} xxl={8}>
                          <Card size="small" title="Specs (Weighted Avg)">
                            <Table
                              dataSource={aggregatedSpecRows}
                              rowKey="id"
                              size="small"
                              pagination={false}
                              scroll={{ y: 640 }}
                              columns={[
                                { title: 'Parameter', dataIndex: 'label', ellipsis: true },
                                { title: 'Unit', dataIndex: 'unit', width: 70, align: 'center', render: (v) => v || '—' },
                                {
                                  title: 'Weighted Avg',
                                  dataIndex: 'weightedAvg',
                                  width: 110,
                                  align: 'center',
                                  render: (v) => <Text strong>{fmtNum(v, 4)}</Text>,
                                },
                              ]}
                            />
                          </Card>
                        </Col>
                      </Row>
                    </>
                  ),
                },
                {
                  key: 'mrp',
                  label: 'MRP',
                  forceRender: true,
                  children: (
                    <>
                      <Text type="secondary" style={{ fontSize: 11, marginBottom: 4, display: 'block' }}>
                        Card-based MRP editor for the current group. Use bulk apply for quick defaults.
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11, marginBottom: 10, display: 'block' }}>
                        {MRP_TYPE_LEGEND}
                      </Text>

                      <Card size="small" style={{ marginBottom: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <Form form={bulkMrpForm} layout="vertical" size="small">
                          <Row gutter={[10, 8]} align="bottom">
                            <Col xs={12} md={4}>
                              <Form.Item name="mrp_type" label="MRP Type" style={{ marginBottom: 0 }}>
                                <Select allowClear style={{ width: '100%' }} options={MRP_TYPE_OPTIONS} />
                              </Form.Item>
                            </Col>
                            <Col xs={12} md={4}>
                              <Form.Item name="lot_size_rule" label="Lot Size" style={{ marginBottom: 0 }}>
                                <Select allowClear style={{ width: '100%' }} options={LOT_SIZE_OPTIONS} />
                              </Form.Item>
                            </Col>
                            <Col xs={12} md={4}>
                              <Form.Item name="planned_lead_time_days" label="Lead Days" style={{ marginBottom: 0 }}>
                                <InputNumber min={0} step={1} style={{ width: '100%' }} />
                              </Form.Item>
                            </Col>
                            <Col xs={12} md={4}>
                              <Form.Item name="safety_stock_kg" label="Safety Stock" style={{ marginBottom: 0 }}>
                                <InputNumber min={0} step={1} style={{ width: '100%' }} />
                              </Form.Item>
                            </Col>
                            <Col xs={12} md={4}>
                              <Form.Item name="reorder_point" label="Reorder Point" style={{ marginBottom: 0 }}>
                                <InputNumber min={0} step={1} style={{ width: '100%' }} />
                              </Form.Item>
                            </Col>
                            <Col xs={12} md={4}>
                              <Form.Item name="assembly_scrap_pct" label="Scrap %" style={{ marginBottom: 0 }}>
                                <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} />
                              </Form.Item>
                            </Col>
                            <Col xs={24}>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                                <Button type="primary" loading={bulkMrpSaving} onClick={handleBulkMrpUpdate}>Apply To All</Button>
                              </div>
                            </Col>
                          </Row>
                        </Form>
                      </Card>

                      <Row gutter={[12, 12]}>
                        {(igDetail.items || []).map((rec) => {
                          const draft = getRowDraft(rec.item_key);
                          return (
                            <Col xs={24} md={12} xl={8} key={rec.item_key}>
                              <Card
                                size="small"
                                title={<Text strong style={{ fontSize: 12 }}>{rec.mainitem || rec.item_key}</Text>}
                                extra={<Text type="secondary" style={{ fontSize: 11 }}>{rec.maindescription || '—'}</Text>}
                              >
                                <Row gutter={[8, 8]}>
                                  <Col span={12}>
                                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>MRP Type</div>
                                    <Select
                                      size="small"
                                      allowClear
                                      style={{ width: '100%' }}
                                      value={draft.mrp_type || undefined}
                                      options={MRP_TYPE_OPTIONS}
                                      onChange={(v) => updateRowDraft(rec.item_key, 'mrp_type', v || null)}
                                    />
                                  </Col>
                                  <Col span={12}>
                                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Lot Size</div>
                                    <Select
                                      size="small"
                                      allowClear
                                      style={{ width: '100%' }}
                                      value={draft.lot_size_rule || undefined}
                                      options={LOT_SIZE_OPTIONS}
                                      onChange={(v) => updateRowDraft(rec.item_key, 'lot_size_rule', v || null)}
                                    />
                                  </Col>
                                  <Col span={12}>
                                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Lead Days</div>
                                    <InputNumber
                                      size="small"
                                      min={0}
                                      step={1}
                                      style={{ width: '100%' }}
                                      value={draft.planned_lead_time_days}
                                      onChange={(v) => updateRowDraft(rec.item_key, 'planned_lead_time_days', v)}
                                    />
                                  </Col>
                                  <Col span={12}>
                                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Safety Stock</div>
                                    <InputNumber
                                      size="small"
                                      min={0}
                                      step={1}
                                      style={{ width: '100%' }}
                                      value={draft.safety_stock_kg}
                                      onChange={(v) => updateRowDraft(rec.item_key, 'safety_stock_kg', v)}
                                    />
                                  </Col>
                                  <Col span={12}>
                                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Reorder Point</div>
                                    <InputNumber
                                      size="small"
                                      min={0}
                                      step={1}
                                      style={{ width: '100%' }}
                                      value={draft.reorder_point}
                                      onChange={(v) => updateRowDraft(rec.item_key, 'reorder_point', v)}
                                    />
                                  </Col>
                                  <Col span={12}>
                                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Scrap %</div>
                                    <InputNumber
                                      size="small"
                                      min={0}
                                      max={100}
                                      step={0.1}
                                      style={{ width: '100%' }}
                                      value={draft.assembly_scrap_pct}
                                      onChange={(v) => updateRowDraft(rec.item_key, 'assembly_scrap_pct', v)}
                                    />
                                  </Col>
                                </Row>

                                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                                  <Button
                                    size="small"
                                    type="primary"
                                    loading={savingItemKey === rec.item_key}
                                    onClick={() => handleSaveMrpRow(rec)}
                                  >
                                    Save
                                  </Button>
                                </div>
                              </Card>
                            </Col>
                          );
                        })}
                      </Row>
                    </>
                  ),
                },
                ...(isMaterialProfileDrawer ? [
                  {
                    key: 'material-profile',
                    label: 'Material Profile',
                    children: (
                      <Spin spinning={substrateLoading || substrateProfileLoading}>


                        <Row gutter={[12, 12]} style={{ marginBottom: 14 }}>
                          {[
                            { label: 'Mapped Specs', value: substrateProfile?.spec_count, mode: 'count', color: '#1d39c4' },
                            { label: 'Stock Qty', value: substrateProfile?.inventory?.total_stock_qty, mode: 'qty', color: '#1d39c4' },
                            { label: 'On Order Qty', value: substrateProfile?.inventory?.total_order_qty, mode: 'qty', color: '#d46b08' },
                            { label: 'Combined Weighted', value: substrateProfile?.pricing?.combined_price_wa, mode: 'currency', color: '#389e0d' },
                            { label: 'Density (Weighted)', value: substrateProfile?.density_wa, mode: 'density', color: '#722ed1' },
                            { label: 'Unmapped Items', value: unmappedSubstrateItems.length, mode: 'count', color: '#cf1322' },
                          ].map((kpi) => (
                            <Col span={4} key={kpi.label}>
                              <div style={{ padding: '2px 0', textAlign: 'center' }}>
                                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{kpi.label}</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: kpi.color }}>
                                  {kpi.value != null
                                    ? (kpi.mode === 'currency'
                                      ? fmtCurrency(kpi.value, 2)
                                      : kpi.mode === 'qty'
                                        ? fmtQty(kpi.value)
                                        : kpi.mode === 'density'
                                          ? fmtNum(kpi.value, 4)
                                          : Number(kpi.value).toLocaleString())
                                    : '—'}
                                </div>
                              </div>
                            </Col>
                          ))}
                        </Row>

                        <Row gutter={12} style={{ marginBottom: 10 }}>
                          <Col span={6}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>Category Group</div>
                            <Text strong>{substrateDraft?.cat_desc || igDetail.catlinedesc || '—'}</Text>
                          </Col>
                          <Col span={6}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>Item Group Bucket</div>
                            <Text strong>{substrateDraft?.appearance || igDetail.itemgroup || '—'}</Text>
                          </Col>
                          <Col span={6}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>Material Class</div>
                            <Tag color="blue">{substrateDraft?.material_class || igDetail.category?.material_class || '—'}</Tag>
                          </Col>
                          <Col span={6}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>Mapping Coverage</div>
                            <Tag color={unmappedSubstrateItems.length ? 'error' : 'success'}>
                              {substrateMappedKeys.length} mapped / {substrateCandidateItems.length} total
                            </Tag>
                          </Col>
                        </Row>

                        {/* ── Supplier + identity fields (class-aware) ── */}
                        <Row gutter={12} style={{ marginBottom: 4 }}>
                          <Col span={showResinTypeField ? 8 : 24}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Supplier Name</div>
                            <Input
                              size="small"
                              value={substrateDraft?.supplier_name || ''}
                              onChange={(e) => updateSubstrateDraft('supplier_name', e.target.value || null)}
                            />
                          </Col>
                          {showResinTypeField && (
                            <Col span={showAlloyField ? 8 : 16}>
                              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                                {activeMaterialClass === 'resins' ? 'Resin Type' : 'Resin Type / Material'}
                              </div>
                              <Input
                                size="small"
                                value={substrateDraft?.resin_type || ''}
                                onChange={(e) => updateSubstrateDraft('resin_type', e.target.value || null)}
                              />
                            </Col>
                          )}
                          {showAlloyField && (
                            <Col span={8}>
                              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Alloy Code</div>
                              <Input
                                size="small"
                                value={substrateDraft?.alloy_code || ''}
                                onChange={(e) => updateSubstrateDraft('alloy_code', e.target.value || null)}
                              />
                            </Col>
                          )}
                        </Row>

                        {/* ── Physical property fields (class-aware via getMaterialProfileFieldKeys) ── */}
                        {materialProfileNumericFieldRows.map((fieldRow, rowIndex) => (
                          <Row gutter={12} style={{ marginBottom: 4 }} key={`material-field-row-${rowIndex}`}>
                            {fieldRow.map((field) => (
                              <Col span={4} key={field.key}>
                                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{field.label}</div>
                                <InputNumber
                                  size="small"
                                  min={field.min}
                                  max={field.max == null ? undefined : field.max}
                                  step={field.step}
                                  style={{ width: '100%' }}
                                  value={substrateDraft?.[field.key]}
                                  onChange={(v) => updateSubstrateDraft(field.key, v)}
                                />
                              </Col>
                            ))}
                          </Row>
                        ))}

                        {/* ── Pricing & MRP (universal — all categories) ── */}
                        <Row gutter={12} style={{ marginBottom: 6 }}>
                          <Col span={4}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Stock Price (WA)</div>
                            <InputNumber
                              size="small"
                              style={{ width: '100%' }}
                              value={substrateProfile?.pricing?.stock_price_wa ?? null}
                              disabled
                            />
                          </Col>
                          <Col span={4}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>MRP Type</div>
                            <Select
                              size="small"
                              style={{ width: '100%' }}
                              value={substrateDraft?.mrp_type || 'PD'}
                              options={MRP_TYPE_OPTIONS}
                              onChange={(v) => updateSubstrateDraft('mrp_type', v || 'PD')}
                            />
                          </Col>
                          <Col span={4}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Reorder Point</div>
                            <InputNumber
                              size="small"
                              min={0}
                              step={1}
                              style={{ width: '100%' }}
                              value={substrateDraft?.reorder_point}
                              onChange={(v) => updateSubstrateDraft('reorder_point', v)}
                            />
                          </Col>
                          <Col span={4}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Safety Stock</div>
                            <InputNumber
                              size="small"
                              min={0}
                              step={1}
                              style={{ width: '100%' }}
                              value={substrateDraft?.safety_stock_kg}
                              onChange={(v) => updateSubstrateDraft('safety_stock_kg', v)}
                            />
                          </Col>
                          <Col span={4}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Lead Days</div>
                            <InputNumber
                              size="small"
                              min={0}
                              step={1}
                              style={{ width: '100%' }}
                              value={substrateDraft?.planned_lead_time_days}
                              onChange={(v) => updateSubstrateDraft('planned_lead_time_days', v)}
                            />
                          </Col>
                        </Row>
                        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 10 }}>
                          {MRP_TYPE_LEGEND}
                        </Text>

                        <Row gutter={12} style={{ marginBottom: 14 }}>
                          <Col span={4}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Market Price</div>
                            <InputNumber
                              size="small"
                              min={0}
                              step={0.01}
                              style={{ width: '100%' }}
                              value={substrateDraft?.market_ref_price}
                              onChange={(v) => updateSubstrateDraft('market_ref_price', v)}
                            />
                          </Col>
                          <Col span={4}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Stock Price (WA)</div>
                            <InputNumber
                              size="small"
                              style={{ width: '100%' }}
                              value={substrateProfile?.pricing?.stock_price_wa ?? null}
                              disabled
                            />
                          </Col>
                          <Col span={4}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>On Order Price (WA)</div>
                            <InputNumber
                              size="small"
                              style={{ width: '100%' }}
                              value={substrateProfile?.pricing?.on_order_price_wa ?? null}
                              disabled
                            />
                          </Col>
                          <Col span={4}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Combined Weighted</div>
                            <InputNumber
                              size="small"
                              style={{ width: '100%' }}
                              value={substrateProfile?.pricing?.combined_price_wa ?? null}
                              disabled
                            />
                          </Col>
                          <Col span={4}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Market Date</div>
                            <Input
                              size="small"
                              type="date"
                              value={substrateDraft?.market_price_date || ''}
                              onChange={(e) => updateSubstrateDraft('market_price_date', e.target.value || null)}
                            />
                          </Col>
                        </Row>

                        <Divider orientation="left" style={{ marginTop: 8 }}>Mapped Material Keys</Divider>
                        <Space style={{ marginBottom: 8 }}>
                          <Button size="small" onClick={handleMapAllSubstrateItems} disabled={!substrateCandidateItems.length}>
                            Select All Group Items
                          </Button>
                          <Button
                            size="small"
                            onClick={() => handleSubstrateMappedKeysChange([])}
                            disabled={!substrateMappedKeys.length}
                          >
                            Clear Selection
                          </Button>
                          <Button size="small" icon={<ReloadOutlined />} onClick={handleRefreshSubstrateProfile}>
                            Refresh Profile
                          </Button>
                        </Space>
                        <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 8 }}>
                          Tick or untick the checkboxes to map or unmap items, then click Save Material Profile to persist.
                        </Text>
                        <Table
                          size="small"
                          style={{ marginBottom: 12 }}
                          pagination={false}
                          dataSource={substrateCandidateItems}
                          rowKey="key"
                          scroll={{ y: 220 }}
                          rowSelection={{
                            selectedRowKeys: substrateMappedKeys,
                            onChange: handleSubstrateMappedKeysChange,
                            preserveSelectedRowKeys: true,
                          }}
                          columns={[
                            { title: 'Item', dataIndex: 'item_code', width: 220, render: (v) => <Text strong style={{ fontSize: 12 }}>{v}</Text> },
                            { title: 'Description', dataIndex: 'description', ellipsis: true },
                            { title: 'Stock Qty', dataIndex: 'stock_qty', width: 110, align: 'center', render: fmtQty },
                            { title: 'Order Qty', dataIndex: 'order_qty', width: 110, align: 'center', render: fmtQty },
                          ]}
                        />

                        <Divider orientation="left" style={{ marginTop: 8 }}>Aggregated Parameters</Divider>
                        {substrateParamCards.length ? (
                          substrateParamGroups.map((group) => (
                            <div key={group.name || '_ungrouped'} style={{ marginBottom: 12 }}>
                              {group.name && (
                                <div style={{
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: '#475569',
                                  borderBottom: '1px solid #e2e8f0',
                                  paddingBottom: 4,
                                  marginBottom: 8,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                }}>
                                  {group.name}
                                </div>
                              )}
                              <Row gutter={[8, 8]}>
                                {group.cards.map((param) => (
                                  <Col span={4} key={param.key}>
                                    <Card size="small" style={{ textAlign: 'center' }}>
                                      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>{param.label}</div>
                                      <div style={{ fontSize: 14, fontWeight: 700 }}>
                                        {param.value != null
                                          ? Number(param.value).toLocaleString(undefined, {
                                            minimumFractionDigits: param.decimals,
                                            maximumFractionDigits: param.decimals,
                                          })
                                          : '—'}
                                      </div>
                                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{param.unit || ' '}</div>
                                    </Card>
                                  </Col>
                                ))}
                              </Row>
                            </div>
                          ))
                        ) : (
                          <Text type="secondary">No mapped parameters available for this bucket yet.</Text>
                        )}

                        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                          <Button type="primary" loading={substrateSaving} onClick={handleSaveSubstrateConfig}>
                            Save Material Profile
                          </Button>
                        </div>
                      </Spin>
                    ),
                  },
                ] : []),
              ]}
            />
          )}
        </Spin>
      </Modal>
    </div>
  );
}