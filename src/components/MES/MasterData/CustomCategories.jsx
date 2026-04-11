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
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../../../contexts/CurrencyContext';
import UAEDirhamSymbol from '../../dashboard/UAEDirhamSymbol';

const { Text, Title } = Typography;
const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const MRP_TYPE_OPTIONS = [
  { value: 'PD', label: 'PD' },
  { value: 'ND', label: 'ND' },
  { value: 'VB', label: 'VB' },
];

const PROCUREMENT_OPTIONS = [
  { value: 'EXTERNAL', label: 'External' },
  { value: 'INTERNAL', label: 'Internal' },
];

const LOT_SIZE_OPTIONS = [
  { value: 'EX', label: 'EX' },
  { value: 'FX', label: 'FX' },
  { value: 'HB', label: 'HB' },
  { value: 'WB', label: 'WB' },
];

const PARAM_LABELS = {
  mfr_190_2_16: 'MFR 190/2.16',
  mfr_190_5_0: 'MFR 190/5.0',
  hlmi_190_21_6: 'HLMI 190/21.6',
  mfr_230_2_16_pp: 'MFR 230/2.16 PP',
  melt_flow_ratio: 'Melt Flow Ratio',
  density: 'Density (g/cm3)',
  crystalline_melting_point: 'Melting Point (C)',
  vicat_softening_point: 'Vicat (C)',
  heat_deflection_temp: 'HDT (C)',
  tensile_strength_break: 'Tensile Break (MPa)',
  elongation_break: 'Elongation (%)',
  brittleness_temp: 'Brittleness (C)',
  bulk_density: 'Bulk Density (g/cm3)',
  flexural_modulus: 'Flexural Modulus (MPa)',
};

const NON_RESIN_MATERIAL_CLASSES = new Set([
  'substrates',
  'adhesives',
  'chemicals',
  'additives',
  'coating',
  'packing_materials',
  'mounting_tapes',
]);

const SUBSTRATE_CONFIG_DEFAULTS = {
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
  price_control: 'MAP',
  market_ref_price: null,
  market_price_date: null,
  map_price: null,
  standard_price: null,
  last_po_price: null,
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
  default_price: null,
};

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

function buildSubstrateDraft(row = {}) {
  return {
    ...SUBSTRATE_CONFIG_DEFAULTS,
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
  if (PARAM_LABELS[key]) return PARAM_LABELS[key];
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
  const navigate = useNavigate();
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
  const [estimationPreviewOpen, setEstimationPreviewOpen] = useState(false);
  const [groupPricingDraft, setGroupPricingDraft] = useState({
    market_ref_price: null,
    market_price_date: null,
  });
  const [groupPricingSaving, setGroupPricingSaving] = useState(false);

  const [substrateDraft, setSubstrateDraft] = useState(null);
  const [substrateLoading, setSubstrateLoading] = useState(false);
  const [substrateSaving, setSubstrateSaving] = useState(false);
  const [substrateProfile, setSubstrateProfile] = useState(null);
  const [substrateProfileLoading, setSubstrateProfileLoading] = useState(false);

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

  const categoryGroupFilters = useMemo(
    () => (profile?.groups || []).map((group) => group.catlinedesc).filter(Boolean),
    [profile]
  );

  /* ---- Unified sidebar groups (used by all categories) ---- */
  const sidebarGroups = useMemo(
    () => (profile?.groups || []),
    [profile]
  );

  const selectedSidebarGroup = useMemo(() => {
    if (!sidebarGroups.length) return null;
    return sidebarGroups.find((group) => group.catlinedesc === selectedGroupFilter) || sidebarGroups[0];
  }, [sidebarGroups, selectedGroupFilter]);

  const selectedSidebarItemGroups = useMemo(() => {
    const rows = selectedSidebarGroup?.item_groups || [];
    return [...rows].sort((a, b) => {
      const stockA = Number(a?.stock_qty) || 0;
      const stockB = Number(b?.stock_qty) || 0;
      return stockB - stockA;
    });
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
        map_price: item.map_price ?? null,
        standard_price: item.standard_price ?? null,
        last_po_price: item.last_po_price ?? null,
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
      setEstimationPreviewOpen(false);
      setGroupPricingDraft({ market_ref_price: null, market_price_date: null });
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
    if (igDetail.scope_type !== 'category_group') {
      message.warning('Group market price can only be updated from Category Group view.');
      return;
    }

    const catlinedesc = String(igDetail.catlinedesc || '').trim();

    if (!catlinedesc) {
      message.warning('Category group context is missing for market price update.');
      return;
    }

    setGroupPricingSaving(true);
    try {
      await axios.patch(
        `${API}/api/mes/master-data/items/custom-categories/${selectedCatId}/category-group/${encodeURIComponent(catlinedesc)}/market-price`,
        {
          market_ref_price: toOptionalNumber(groupPricingDraft.market_ref_price),
          market_price_date: groupPricingDraft.market_price_date || null,
        },
        { headers }
      );

      message.success('Category group market price updated');
      await refreshDetail();
      fetchProfile(selectedCatId, searchText);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to update category group market price');
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

  const isNonResinDrawer = useMemo(
    () => NON_RESIN_MATERIAL_CLASSES.has(normalizeKey(igDetail?.category?.material_class)),
    [igDetail]
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

  const substrateItemOptions = useMemo(
    () => substrateCandidateItems.map((row) => ({
      value: row.key,
      label: `${row.item_code}${row.description ? ` - ${row.description}` : ''}`,
    })),
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
    const params = substrateProfile?.spec_params || {};
    const meta = substrateProfile?.param_meta || {};

    return Object.entries(params)
      .map(([key, rawValue]) => {
        const value = toOptionalNumber(rawValue);
        const metaRow = meta?.[key] || {};
        const parsedDecimals = Number(metaRow.decimals);
        const decimals = Number.isFinite(parsedDecimals)
          ? parsedDecimals
          : (String(key).includes('density') ? 4 : 2);

        return {
          key,
          value,
          decimals,
          unit: metaRow.unit || '',
          label: metaRow.label || toPrettyLabel(key),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [substrateProfile]);

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
        `${API}/api/mes/master-data/items/substrate-profile?${params.toString()}`,
        { headers }
      );
      setSubstrateProfile(res.data?.data || null);
    } catch {
      setSubstrateProfile(null);
    } finally {
      setSubstrateProfileLoading(false);
    }
  }, [headers]);

  const loadSubstrateConfig = useCallback(async (detail) => {
    if (!detail || !NON_RESIN_MATERIAL_CLASSES.has(normalizeKey(detail.category?.material_class))) {
      setSubstrateDraft(null);
      setSubstrateProfile(null);
      setSubstrateLoading(false);
      return;
    }

    const materialClass = normalizeKey(detail.category?.material_class);
    const catDesc = String(detail.catlinedesc || detail.items?.[0]?.catlinedesc || '').trim();
    const appearance = String(detail.itemgroup || '').trim();
    const fallbackKeys = normalizeStringArray((detail.items || []).map((item) => item.mainitem || item.item_key));

    if (!catDesc) {
      setSubstrateDraft(null);
      setSubstrateProfile(null);
      return;
    }

    setSubstrateLoading(true);
    try {
      const res = await axios.get(
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

      const existing = res.data?.data || {};
      const configuredKeys = normalizeStringArray(existing.mapped_material_keys);
      const mappedKeys = configuredKeys.length ? configuredKeys : fallbackKeys;

      const nextDraft = buildSubstrateDraft({
        ...existing,
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
        materialKeys: mappedKeys.length ? mappedKeys : fallbackKeys,
      });
    } catch (err) {
      const fallbackDraft = buildSubstrateDraft({
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
    const keys = normalized.length ? normalized : substrateCandidateKeys;

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
      materialKeys: keys,
    });
  }, [substrateDraft, substrateCandidateKeys, fetchSubstrateProfile]);

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

    const keys = substrateMappedKeys.length ? substrateMappedKeys : substrateCandidateKeys;
    fetchSubstrateProfile({
      materialClass: substrateDraft.material_class,
      catDesc: substrateDraft.cat_desc,
      appearance: substrateDraft.appearance,
      materialKeys: keys,
    });
  }, [substrateDraft, substrateMappedKeys, substrateCandidateKeys, fetchSubstrateProfile]);

  const handleSaveSubstrateConfig = useCallback(async () => {
    if (!substrateDraft || !isNonResinDrawer) return;

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
      price_control: (substrateDraft.price_control || 'MAP').toUpperCase(),
      market_ref_price: toOptionalNumber(substrateDraft.market_ref_price),
      market_price_date: substrateDraft.market_price_date || null,
      map_price: toOptionalNumber(substrateDraft.map_price),
      standard_price: toOptionalNumber(substrateDraft.standard_price),
      last_po_price: toOptionalNumber(substrateDraft.last_po_price),
      mrp_type: (substrateDraft.mrp_type || 'PD').toUpperCase(),
      reorder_point: toOptionalNumber(substrateDraft.reorder_point),
      safety_stock_kg: toOptionalNumber(substrateDraft.safety_stock_kg),
      planned_lead_time_days: toOptionalInteger(substrateDraft.planned_lead_time_days),
      mapped_material_keys: normalizeStringArray(substrateDraft.mapped_material_keys),
    };

    setSubstrateSaving(true);
    try {
      const res = await axios.put(
        `${API}/api/mes/master-data/items/substrate-config`,
        payload,
        { headers }
      );

      const saved = buildSubstrateDraft({
        ...payload,
        ...(res.data?.data || {}),
        mapped_material_keys: res.data?.data?.mapped_material_keys || payload.mapped_material_keys,
      });

      setSubstrateDraft(saved);
      message.success('Substrate profile saved');

      const keys = saved.mapped_material_keys.length ? saved.mapped_material_keys : substrateCandidateKeys;
      fetchSubstrateProfile({
        materialClass: saved.material_class,
        catDesc: saved.cat_desc,
        appearance: saved.appearance,
        materialKeys: keys,
      });

      if (selectedCatId) fetchProfile(selectedCatId, searchText);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to save substrate profile');
    } finally {
      setSubstrateSaving(false);
    }
  }, [substrateDraft, isNonResinDrawer, headers, message, substrateCandidateKeys, fetchSubstrateProfile, selectedCatId, fetchProfile, searchText]);

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

  const estimationHandoffPayload = useMemo(() => {
    if (!igDetail) return null;

    const specByKey = {};
    aggregatedSpecRows.forEach((row) => {
      specByKey[normalizeKey(row.key)] = toOptionalNumber(row.weightedAvg);
    });

    const pickSpec = (...keys) => {
      for (const key of keys) {
        const value = specByKey[normalizeKey(key)];
        if (value != null) return value;
      }
      return null;
    };

    const visibleRows = (detailVisibleItems || []).slice(0, 250).map((item) => ({
      item_code: item.mainitem || null,
      description: item.maindescription || null,
      supplier: item.supplier || null,
      stock_qty: toOptionalNumber(item.stock_qty),
      order_qty: toOptionalNumber(item.order_qty),
      default_price: toOptionalNumber(item.default_price ?? item.on_order_price ?? item.stock_price),
    }));

    return {
      source: 'custom_categories',
      generated_at: new Date().toISOString(),
      category_id: selectedCatId,
      category_name: igDetail?.category?.name || null,
      material_class: igDetail?.category?.material_class || null,
      scope_type: igDetail.scope_type || 'item_group',
      catlinedesc: igDetail.catlinedesc || null,
      itemgroup: igDetail.itemgroup || null,
      filters: {
        supplier: detailSupplierFilter,
        search: String(detailSearchText || '').trim() || null,
        visible_count: Number(detailAggregates?.visible_count ?? detailVisibleItems.length) || 0,
        total_count: Number(detailAggregates?.total_count ?? (igDetail?.items || []).length) || 0,
      },
      pricing: {
        stock_price_wa: toOptionalNumber(visiblePricingTotals.stock_price_wa),
        on_order_price_wa: toOptionalNumber(visiblePricingTotals.on_order_price_wa),
        avg_price_wa: toOptionalNumber(visiblePricingTotals.avg_price_wa),
        market_price_wa: toOptionalNumber(visiblePricingTotals.market_price_wa),
        default_price: toOptionalNumber(visiblePricingTotals.default_price),
      },
      process_inputs: {
        density_g_cm3: pickSpec('density_g_cm3', 'density'),
        yield_m2_per_kg: pickSpec('yield_m2_per_kg'),
        waste_pct: pickSpec('waste_pct', 'waste_percent', 'conversion_waste_pct', 'startup_waste_pct'),
      },
      items: visibleRows,
      items_truncated: (detailVisibleItems || []).length > visibleRows.length,
    };
  }, [igDetail, selectedCatId, detailSupplierFilter, detailSearchText, detailAggregates, detailVisibleItems, visiblePricingTotals, aggregatedSpecRows]);

  const handleSaveEstimationHandoff = useCallback(() => {
    if (!estimationHandoffPayload) {
      message.warning('No payload available for estimation handoff.');
      return false;
    }

    try {
      localStorage.setItem('mes_estimation_handoff_payload', JSON.stringify(estimationHandoffPayload));
      message.success('Handoff payload saved for Estimation.');
      return true;
    } catch {
      message.error('Failed to save estimation handoff payload.');
      return false;
    }
  }, [estimationHandoffPayload, message]);

  const handleCopyEstimationHandoff = useCallback(async () => {
    if (!estimationHandoffPayload) {
      message.warning('No payload available for estimation handoff.');
      return;
    }

    if (!navigator?.clipboard?.writeText) {
      message.warning('Clipboard API is not available in this browser context.');
      return;
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(estimationHandoffPayload, null, 2));
      message.success('Payload copied to clipboard.');
    } catch {
      message.error('Failed to copy payload to clipboard.');
    }
  }, [estimationHandoffPayload, message]);

  const handleSaveAndOpenEstimation = useCallback(() => {
    const saved = handleSaveEstimationHandoff();
    if (!saved) return;
    setEstimationPreviewOpen(false);
    navigate('/mes/estimation');
  }, [handleSaveEstimationHandoff, navigate]);

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
              return (
                <Button
                  key={cat.id}
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
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {visibleCategories.length} category{visibleCategories.length === 1 ? '' : 'ies'} · {allVisibleCategoryItemCount} mapped items
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
                      <Col xs={24} xl={8} xxl={7}>
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
                                    border: active ? '1px solid #0f766e' : '1px solid #e2e8f0',
                                    borderRadius: 10,
                                    padding: '10px 12px',
                                    background: active
                                      ? 'linear-gradient(135deg, rgba(15,118,110,.10), rgba(8,145,178,.08))'
                                      : '#fff',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                    <Text strong style={{ color: active ? '#0f766e' : '#0f172a' }}>{group.catlinedesc}</Text>
                                    <Text strong style={{ fontSize: 13, color: active ? '#0f766e' : '#1d39c4' }}>{fmtCurrency(group.avg_price_wa, 2)}</Text>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                                    <Text type="secondary" style={{ fontSize: 11 }}>{Number(group.item_group_count) || 0} groups · {Number(group.item_count) || 0} items</Text>
                                    <Tooltip title="Weighted Average of Stock and On Order prices">
                                      <Text type="secondary" style={{ fontSize: 10, cursor: 'help', borderBottom: '1px dotted #94a3b8' }}>W.A</Text>
                                    </Tooltip>
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

                      <Col xs={24} xl={16} xxl={17}>
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
                            size="middle"
                            pagination={false}
                            locale={{ emptyText: 'No item groups under the selected category group.' }}
                            scroll={{ y: 470 }}
                            columns={[
                              {
                                title: 'Item Group',
                                dataIndex: 'itemgroup',
                                render: (v) => <Text strong style={{ fontSize: 14 }}>{v}</Text>,
                              },
                              {
                                title: 'Mapped Items',
                                dataIndex: 'item_count',
                                align: 'center',
                                width: 110,
                              },
                              {
                                title: 'Stock Qty',
                                dataIndex: 'stock_qty',
                                align: 'center',
                                width: 120,
                                render: fmtQty,
                              },
                              {
                                title: 'Order Qty',
                                dataIndex: 'order_qty',
                                align: 'center',
                                width: 120,
                                render: fmtQty,
                              },
                              {
                                title: 'Total Qty',
                                align: 'center',
                                width: 120,
                                render: (_, rec) => fmtQty((Number(rec.stock_qty) || 0) + (Number(rec.order_qty) || 0)),
                              },
                              {
                                title: 'Action',
                                align: 'center',
                                width: 100,
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
            <Select allowClear placeholder="Select" options={materialClassFieldOptions} />
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
        open={igDrawerOpen}
        onCancel={() => {
          setIgDrawerOpen(false);
          setIgDetail(null);
          setRowDrafts({});
          setDetailSearchText('');
          setDetailSupplierFilter('all');
          setEstimationPreviewOpen(false);
          setGroupPricingDraft({ market_ref_price: null, market_price_date: null });
          bulkMrpForm.resetFields();
        }}
        footer={null}
        width="100vw"
        style={{ top: 0, paddingBottom: 0 }}
        styles={{ body: { height: 'calc(100vh - 110px)', overflow: 'auto', padding: 12 } }}
        destroyOnClose
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
                        <Col xs={24} md={9} style={{ textAlign: 'right' }}>
                          <Button
                            size="small"
                            onClick={() => setEstimationPreviewOpen(true)}
                            disabled={!Number(detailAggregates?.visible_count || 0)}
                          >
                            Use in Estimation
                          </Button>
                        </Col>
                      </Row>

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

                            <Divider style={{ margin: '12px 0 10px 0' }} />

                            <Row gutter={10} align="bottom">
                              <Col span={10}>
                                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Group Market Price</div>
                                <InputNumber
                                  size="small"
                                  min={0}
                                  step={0.01}
                                  style={{ width: '100%' }}
                                  value={groupPricingDraft.market_ref_price}
                                  disabled={igDetail.scope_type !== 'category_group'}
                                  onChange={(value) => setGroupPricingDraft((prev) => ({ ...prev, market_ref_price: value }))}
                                />
                              </Col>
                              <Col span={8}>
                                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Market Date</div>
                                <Input
                                  size="small"
                                  type="date"
                                  value={groupPricingDraft.market_price_date || ''}
                                  disabled={igDetail.scope_type !== 'category_group'}
                                  onChange={(e) => setGroupPricingDraft((prev) => ({ ...prev, market_price_date: e.target.value || null }))}
                                />
                              </Col>
                              <Col span={6}>
                                <Button
                                  size="small"
                                  type="primary"
                                  loading={groupPricingSaving}
                                  disabled={igDetail.scope_type !== 'category_group'}
                                  onClick={handleSaveGroupMarketPrice}
                                  block
                                >
                                  Save Market Price
                                </Button>
                              </Col>
                            </Row>
                            <Text type="secondary" style={{ fontSize: 11, marginTop: 6, display: 'block' }}>
                              Market price is maintained at group level and applied to all items in this category group.
                            </Text>
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
                  children: (
                    <>
                      <Text type="secondary" style={{ fontSize: 11, marginBottom: 10, display: 'block' }}>
                        Card-based MRP editor for the current group. Use bulk apply for quick defaults.
                      </Text>

                      <Card size="small" style={{ marginBottom: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <Form form={bulkMrpForm} layout="vertical" size="small">
                          <Row gutter={[10, 8]} align="bottom">
                            <Col xs={12} md={4}>
                              <Form.Item name="mrp_type" label="MRP Type" style={{ marginBottom: 0 }}>
                                <Select allowClear options={MRP_TYPE_OPTIONS} />
                              </Form.Item>
                            </Col>
                            <Col xs={12} md={4}>
                              <Form.Item name="lot_size_rule" label="Lot Size" style={{ marginBottom: 0 }}>
                                <Select allowClear options={LOT_SIZE_OPTIONS} />
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
                ...(isNonResinDrawer ? [
                  {
                    key: 'substrate-profile',
                    label: 'Substrate Profile',
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

                        <Row gutter={12} style={{ marginBottom: 4 }}>
                          <Col span={8}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Supplier Name</div>
                            <Input
                              size="small"
                              value={substrateDraft?.supplier_name || ''}
                              onChange={(e) => updateSubstrateDraft('supplier_name', e.target.value || null)}
                            />
                          </Col>
                          <Col span={8}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Resin Type / Material</div>
                            <Input
                              size="small"
                              value={substrateDraft?.resin_type || ''}
                              onChange={(e) => updateSubstrateDraft('resin_type', e.target.value || null)}
                            />
                          </Col>
                          <Col span={8}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Alloy Code</div>
                            <Input
                              size="small"
                              value={substrateDraft?.alloy_code || ''}
                              onChange={(e) => updateSubstrateDraft('alloy_code', e.target.value || null)}
                            />
                          </Col>
                        </Row>

                        <Row gutter={12} style={{ marginBottom: 4 }}>
                          <Col span={4}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Density</div>
                            <InputNumber
                              size="small"
                              min={0}
                              step={0.0001}
                              style={{ width: '100%' }}
                              value={substrateDraft?.density_g_cm3}
                              onChange={(v) => updateSubstrateDraft('density_g_cm3', v)}
                            />
                          </Col>
                          <Col span={4}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Solid %</div>
                            <InputNumber
                              size="small"
                              min={0}
                              max={100}
                              step={0.1}
                              style={{ width: '100%' }}
                              value={substrateDraft?.solid_pct}
                              onChange={(v) => updateSubstrateDraft('solid_pct', v)}
                            />
                          </Col>
                          <Col span={4}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Thickness (mic)</div>
                            <InputNumber
                              size="small"
                              min={0}
                              step={0.1}
                              style={{ width: '100%' }}
                              value={substrateDraft?.micron_thickness}
                              onChange={(v) => updateSubstrateDraft('micron_thickness', v)}
                            />
                          </Col>
                          <Col span={4}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Width (mm)</div>
                            <InputNumber
                              size="small"
                              min={0}
                              step={1}
                              style={{ width: '100%' }}
                              value={substrateDraft?.width_mm}
                              onChange={(v) => updateSubstrateDraft('width_mm', v)}
                            />
                          </Col>
                          <Col span={4}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Yield (m²/kg)</div>
                            <InputNumber
                              size="small"
                              min={0}
                              step={0.01}
                              style={{ width: '100%' }}
                              value={substrateDraft?.yield_m2_per_kg}
                              onChange={(v) => updateSubstrateDraft('yield_m2_per_kg', v)}
                            />
                          </Col>
                          <Col span={4}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Roll Length (m)</div>
                            <InputNumber
                              size="small"
                              min={0}
                              step={1}
                              style={{ width: '100%' }}
                              value={substrateDraft?.roll_length_m}
                              onChange={(v) => updateSubstrateDraft('roll_length_m', v)}
                            />
                          </Col>
                        </Row>

                        <Row gutter={12} style={{ marginBottom: 10 }}>
                          <Col span={4}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Core Dia (mm)</div>
                            <InputNumber
                              size="small"
                              min={0}
                              step={0.1}
                              style={{ width: '100%' }}
                              value={substrateDraft?.core_diameter_mm}
                              onChange={(v) => updateSubstrateDraft('core_diameter_mm', v)}
                            />
                          </Col>
                          <Col span={4}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Price Ctrl</div>
                            <Select
                              size="small"
                              value={substrateDraft?.price_control || 'MAP'}
                              options={[{ value: 'MAP', label: 'MAP' }, { value: 'STD', label: 'STD' }]}
                              onChange={(v) => updateSubstrateDraft('price_control', v || 'MAP')}
                            />
                          </Col>
                          <Col span={4}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>MRP Type</div>
                            <Select
                              size="small"
                              value={substrateDraft?.mrp_type || 'PD'}
                              options={MRP_TYPE_OPTIONS}
                              onChange={(v) => updateSubstrateDraft('mrp_type', v || 'PD')}
                            />
                          </Col>
                          <Col span={4}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Reorder Pt</div>
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
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>MAP Price</div>
                            <InputNumber
                              size="small"
                              min={0}
                              step={0.01}
                              style={{ width: '100%' }}
                              value={substrateDraft?.map_price}
                              onChange={(v) => updateSubstrateDraft('map_price', v)}
                            />
                          </Col>
                          <Col span={4}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Standard Price</div>
                            <InputNumber
                              size="small"
                              min={0}
                              step={0.01}
                              style={{ width: '100%' }}
                              value={substrateDraft?.standard_price}
                              onChange={(v) => updateSubstrateDraft('standard_price', v)}
                            />
                          </Col>
                          <Col span={4}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Last PO</div>
                            <InputNumber
                              size="small"
                              min={0}
                              step={0.01}
                              style={{ width: '100%' }}
                              value={substrateDraft?.last_po_price}
                              onChange={(v) => updateSubstrateDraft('last_po_price', v)}
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
                            Map All Group Items
                          </Button>
                          <Button size="small" icon={<ReloadOutlined />} onClick={handleRefreshSubstrateProfile}>
                            Refresh Profile
                          </Button>
                        </Space>
                        <Select
                          mode="multiple"
                          allowClear
                          style={{ width: '100%', marginBottom: 10 }}
                          placeholder="Select mapped material keys for this substrate bucket"
                          optionFilterProp="label"
                          value={substrateMappedKeys}
                          options={substrateItemOptions}
                          onChange={handleSubstrateMappedKeysChange}
                        />

                        {unmappedSubstrateItems.length > 0 && (
                          <Table
                            size="small"
                            style={{ marginBottom: 12 }}
                            pagination={false}
                            dataSource={unmappedSubstrateItems}
                            rowKey="key"
                            scroll={{ y: 180 }}
                            columns={[
                              { title: 'Unmapped Item', dataIndex: 'item_code', width: 180, render: (v) => <Text strong style={{ fontSize: 12 }}>{v}</Text> },
                              { title: 'Description', dataIndex: 'description', ellipsis: true },
                              { title: 'Stock Qty', dataIndex: 'stock_qty', width: 110, align: 'center', render: fmtQty },
                              { title: 'Order Qty', dataIndex: 'order_qty', width: 110, align: 'center', render: fmtQty },
                            ]}
                          />
                        )}

                        <Divider orientation="left" style={{ marginTop: 8 }}>Aggregated Parameters</Divider>
                        {substrateParamCards.length ? (
                          <Row gutter={[8, 8]}>
                            {substrateParamCards.map((param) => (
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
                        ) : (
                          <Text type="secondary">No mapped non-resin parameters available for this bucket yet.</Text>
                        )}

                        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                          <Button type="primary" loading={substrateSaving} onClick={handleSaveSubstrateConfig}>
                            Save Substrate Profile
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

      <Modal
        title="Use in Estimation"
        open={estimationPreviewOpen}
        onCancel={() => setEstimationPreviewOpen(false)}
        width={900}
        footer={[
          <Button key="close" onClick={() => setEstimationPreviewOpen(false)}>Close</Button>,
          <Button key="copy" onClick={handleCopyEstimationHandoff} disabled={!estimationHandoffPayload}>Copy Payload</Button>,
          <Button key="save" onClick={handleSaveEstimationHandoff} disabled={!estimationHandoffPayload}>Save Handoff</Button>,
          <Button key="save-open" type="primary" onClick={handleSaveAndOpenEstimation} disabled={!estimationHandoffPayload}>Save & Open Estimation</Button>,
        ]}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 10 }}
          message="Pricing inputs remain unchanged. This action only prepares and previews handoff payload for Estimation."
        />

        {estimationHandoffPayload && (
          <Row gutter={[8, 8]} style={{ marginBottom: 10 }}>
            <Col xs={12} md={6}>
              <div style={{ padding: '2px 0' }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>Default Price</div>
                <div style={{ fontWeight: 700 }}>{fmtCurrency(estimationHandoffPayload.pricing.default_price, 2)}</div>
              </div>
            </Col>
            <Col xs={12} md={6}>
              <div style={{ padding: '2px 0' }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>Density</div>
                <div style={{ fontWeight: 700 }}>{fmtNum(estimationHandoffPayload.process_inputs.density_g_cm3, 4)}</div>
              </div>
            </Col>
            <Col xs={12} md={6}>
              <div style={{ padding: '2px 0' }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>Yield (m2/kg)</div>
                <div style={{ fontWeight: 700 }}>{fmtNum(estimationHandoffPayload.process_inputs.yield_m2_per_kg, 2)}</div>
              </div>
            </Col>
            <Col xs={12} md={6}>
              <div style={{ padding: '2px 0' }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>Waste %</div>
                <div style={{ fontWeight: 700 }}>{fmtNum(estimationHandoffPayload.process_inputs.waste_pct, 2)}</div>
              </div>
            </Col>
          </Row>
        )}

        <Input.TextArea
          readOnly
          value={estimationHandoffPayload ? JSON.stringify(estimationHandoffPayload, null, 2) : ''}
          autoSize={{ minRows: 12, maxRows: 22 }}
        />
      </Modal>
    </div>
  );
}