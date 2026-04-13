/**
 * ItemMaster — CRUD table for mes_item_master
 * Features: column filters, expandable costing details, edit modal with tabs,
 * bulk market price update (A20), live Resin profile aggregation view.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, Tabs, Tag, Space,
  Popconfirm, App, Tooltip, Row, Col, Typography, Spin,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, DollarOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import { useCurrency } from '../../../contexts/CurrencyContext';
import UAEDirhamSymbol from '../../dashboard/UAEDirhamSymbol';
import {
  SUBSTRATE_EXCEL_BUCKETS,
  SUBSTRATE_EXCEL_MAPPINGS,
  getCategoryDescriptionsForSubstrate,
  SUBSTRATE_EXCEL_TYPES,
  getSubstrateDensityDefault,
  normalizeMappingText,
  resolveSubstrateMappingByDescription,
} from '../../../utils/substrateExcelMapping';

const API_BASE = import.meta.env.VITE_API_URL || '';
const { Text } = Typography;

const ITEM_TYPES = [
  { value: 'raw_resin',     label: 'Raw Resin' },
  { value: 'raw_ink',       label: 'Raw Ink' },
  { value: 'raw_adhesive',  label: 'Raw Adhesive' },
  { value: 'raw_solvent',   label: 'Raw Solvent' },
  { value: 'raw_packaging', label: 'Raw Packaging' },
  { value: 'raw_coating',   label: 'Raw Coating' },
  { value: 'semi_extruded', label: 'Semi - Extruded' },
  { value: 'semi_printed',  label: 'Semi - Printed' },
  { value: 'semi_laminated',label: 'Semi - Laminated' },
  { value: 'semi_coated',   label: 'Semi - Coated' },
  { value: 'semi_slit',     label: 'Semi - Slit' },
  { value: 'fg_roll',       label: 'Finished - Roll' },
  { value: 'fg_bag',        label: 'Finished - Bag' },
];

const PRICING_HELP = {
  panel: 'Combined (WA) is a live reference from stock and on-order mix.',
  marketRef: 'Manual market benchmark used by commercial and purchasing teams.',
  marketDate: 'Date when Market Price was last confirmed with market/supplier inputs.',
};

const normalizeToken = normalizeMappingText;

const substrateBucketKey = (catDesc, appearance = '') => `${normalizeToken(catDesc)}::${normalizeToken(appearance)}`;
const substrateDraftKey = (catDesc, appearance = '') => `substrate-${normalizeToken(catDesc)}-${normalizeToken(appearance)}`;

const normalizeStringArray = (values) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
));

const substrateDraftFromConfigRow = (row = {}) => {
  const mappedMaterialKeys = normalizeStringArray(row.mapped_material_keys ?? row.mappedMaterialKeys);
  const mappedFilmIds = normalizeStringArray(row.mapped_film_ids ?? row.mappedFilmIds);

  return {
    supplier_name: row.supplier_name ?? null,
    resin_type: row.resin_type ?? null,
    alloy_code: row.alloy_code ?? null,
    density_g_cm3: row.density_g_cm3 ?? null,
    solid_pct: row.solid_pct ?? null,
    micron_thickness: row.micron_thickness ?? null,
    width_mm: row.width_mm ?? null,
    yield_m2_per_kg: row.yield_m2_per_kg ?? null,
    roll_length_m: row.roll_length_m ?? null,
    core_diameter_mm: row.core_diameter_mm ?? null,
    market_ref_price: row.market_ref_price ?? null,
    market_price_date: row.market_price_date ?? null,
    mrp_type: row.mrp_type || 'PD',
    reorder_point: row.reorder_point ?? null,
    safety_stock_kg: row.safety_stock_kg ?? null,
    planned_lead_time_days: row.planned_lead_time_days ?? null,
    mappedMaterialKeys,
    mappedFilmIds,
    cat_desc: row.cat_desc ?? null,
    appearance: row.appearance ?? null,
  };
};

const getSubstrateDraftFromStore = (draftStore = {}, record = null) => {
  if (!record) return {};
  const normalizedKey = substrateDraftKey(record.oracle_cat_desc, record.appearance);
  const legacyIdKey = record.id != null ? String(record.id) : '';
  return draftStore[normalizedKey] || (legacyIdKey ? draftStore[legacyIdKey] : undefined) || {};
};

const resolveDraftMappedFilmIds = (draft = {}, candidateRows = []) => {
  const selectedTokens = new Set([
    ...normalizeStringArray(draft?.mappedFilmIds),
    ...normalizeStringArray(draft?.mappedMaterialKeys),
  ]);

  if (!selectedTokens.size) return [];

  const resolved = [];

  candidateRows.forEach((row) => {
    const rowId = row?.id != null ? String(row.id) : '';
    if (!rowId) return;

    const idToken = rowId.trim().toLowerCase();
    const itemCodeToken = String(row?.item_code || '').trim().toLowerCase();

    if (selectedTokens.has(idToken) || selectedTokens.has(itemCodeToken)) {
      resolved.push(rowId);
    }
  });

  return Array.from(new Set(resolved));
};

const getSubstrateBucketForFilm = (row) => {
  const mapped = resolveSubstrateMappingByDescription(row?.item_name);
  if (!mapped) return null;
  return {
    cat_desc: mapped.substrate,
    appearance: mapped.categoryDescription,
  };
};

const RESIN_SPEC_PARAMS = [
  { key: 'mfr_190_2_16', label: 'MFR (190°C/2.16kg)', unit: 'g/10min', decimals: 2 },
  { key: 'mfr_190_5_0', label: 'MFR (190°C/5.0kg)', unit: 'g/10min', decimals: 2 },
  { key: 'hlmi_190_21_6', label: 'HLMI (190°C/21.6kg)', unit: 'g/10min', decimals: 2 },
  { key: 'mfr_230_2_16_pp', label: 'MFR (230°C/2.16kg)', unit: 'g/10min', decimals: 2 },
  { key: 'melt_flow_ratio', label: 'Melt Flow Ratio', unit: '—', decimals: 2 },
  { key: 'density', label: 'Density (TDS)', unit: 'g/cm³', decimals: 4 },
  { key: 'crystalline_melting_point', label: 'Melting Point', unit: '°C', decimals: 2 },
  { key: 'vicat_softening_point', label: 'Vicat Softening', unit: '°C', decimals: 2 },
  { key: 'heat_deflection_temp', label: 'Heat Deflection', unit: '°C', decimals: 2 },
  { key: 'tensile_strength_break', label: 'Tensile Strength', unit: 'MPa', decimals: 2 },
  { key: 'elongation_break', label: 'Elongation Break', unit: '%', decimals: 2 },
  { key: 'brittleness_temp', label: 'Brittleness Temp', unit: '°C', decimals: 2 },
  { key: 'bulk_density', label: 'Bulk Density', unit: 'g/cm³', decimals: 4 },
  { key: 'flexural_modulus', label: 'Flexural Modulus', unit: 'MPa', decimals: 2 },
];

const RESIN_CATEGORY = 'Resins';
const SUBSTRATE_CATEGORY = 'Substrates';
const RESIN_DOMAIN_KEY = 'resin';
const SUBSTRATE_DOMAIN_KEY = 'substrate';
const UNMAPPED_RESIN_CATDESC = '__UNMAPPED__';
const RESIN_FOCUS_ONLY = true;
const SUBSTRATE_DRAFTS_STORAGE_KEY = 'item_master_substrate_drafts_v1';
const ALU_FOIL_CONTEXT_RE = /(aluminium\s*foil|aluminum\s*foil|alu\s*foil|butter\s*foil|alu\s*\/\s*pap|\balu\b)/i;
const ALU_DEFAULT_SUPPLIER = 'Dingheng';
const ALU_DEFAULT_RESIN_TYPE = 'Aluminium';
const ALU_DEFAULT_ALLOY = '1235';
const ALU_DEFAULT_CORE_DIAMETER_MM = 76.2;
const ALU_DEFAULT_MAX_COIL_OD_MM = 700;

const SUBSTRATE_PARAM_LABEL_OVERRIDES = {
  cof: 'COF',
  otr_cc_m2_day: 'OTR',
  wvtr_g_m2_day: 'WVTR',
  mfi_g_10min: 'MFI',
  sit_c: 'SIT',
  md_pct: 'MD %',
  td_pct: 'TD %',
  seal_init_temp_c: 'Seal Init Temp',
  seal_temp_min_c: 'Seal Temp Min',
  seal_temp_max_c: 'Seal Temp Max',
};

const formatSubstrateParamLabel = (key = '') => {
  if (SUBSTRATE_PARAM_LABEL_OVERRIDES[key]) return SUBSTRATE_PARAM_LABEL_OVERRIDES[key];

  return String(key)
    .split('_')
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (part.length <= 3 && lower !== 'day') return part.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
};

const fallbackSubstrateParamMeta = (key = '') => {
  const lower = String(key).toLowerCase();
  let unit = '';
  let decimals = 2;

  if (lower.includes('_pct') || lower === 'md_pct' || lower === 'td_pct') {
    unit = '%';
    decimals = 2;
  } else if (lower.includes('density')) {
    unit = 'g/cm³';
    decimals = 4;
  } else if (lower.includes('_mic')) {
    unit = 'µm';
    decimals = 2;
  } else if (lower.includes('_mm')) {
    unit = 'mm';
    decimals = 2;
  } else if (lower.includes('_c')) {
    unit = '°C';
    decimals = 1;
  } else if (lower.includes('_mpa')) {
    unit = 'MPa';
    decimals = 2;
  } else if (lower.includes('_mn')) {
    unit = 'mN';
    decimals = 1;
  } else if (lower.includes('_kn_m')) {
    unit = 'kN/m';
    decimals = 2;
  } else if (lower.includes('_n_15mm')) {
    unit = 'N/15mm';
    decimals = 2;
  } else if (lower.includes('_n_mm')) {
    unit = 'N/mm';
    decimals = 2;
  } else if (lower.includes('_n')) {
    unit = 'N';
    decimals = 2;
  } else if (lower.includes('_gsm') || lower === 'grammage_gsm' || lower === 'paper_grammage_gsm') {
    unit = 'g/m²';
    decimals = 2;
  } else if (lower.includes('otr')) {
    unit = 'cc/m²/day';
    decimals = 2;
  } else if (lower.includes('wvtr')) {
    unit = 'g/m²/day';
    decimals = 2;
  } else if (lower.includes('yield') && lower.includes('m2')) {
    unit = 'm²/kg';
    decimals = 2;
  } else if (lower.includes('cof')) {
    unit = '—';
    decimals = 3;
  }

  return {
    label: formatSubstrateParamLabel(key),
    unit,
    decimals,
  };
};

const toFiniteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const roundTo = (value, decimals = 2) => {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const extractThicknessMicron = (value) => {
  const text = String(value || '');
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:mic|um|µm|μm)\b/i);
  return m ? toFiniteNumber(m[1]) : null;
};

const extractWidthMm = (value) => {
  const text = String(value || '');
  const paired = text.match(/(?:\*|x)\s*(\d+(?:\.\d+)?)\s*mm\b/i);
  if (paired) return toFiniteNumber(paired[1]);

  const standalone = text.match(/\b(\d{3,4}(?:\.\d+)?)\s*mm\b/i);
  return standalone ? toFiniteNumber(standalone[1]) : null;
};

const pickMedian = (values, decimals = 0) => {
  const cleaned = values
    .map((v) => toFiniteNumber(v))
    .filter((v) => v != null)
    .sort((a, b) => a - b);

  if (!cleaned.length) return null;
  const mid = Math.floor(cleaned.length / 2);
  const raw = cleaned.length % 2
    ? cleaned[mid]
    : (cleaned[mid - 1] + cleaned[mid]) / 2;

  return roundTo(raw, decimals);
};

const isAluSubstrateRecord = (record) => {
  const taxonomyKey = String(record?.taxonomy_category_key || '').toLowerCase();
  if (taxonomyKey === 'aluminium_foil') return true;

  const context = `${record?.oracle_cat_desc || ''} ${record?.appearance || ''}`;
  return ALU_FOIL_CONTEXT_RE.test(context);
};

const getAluSmartDefaults = (record, filmRows = []) => {
  if (!isAluSubstrateRecord(record)) return {};

  const bucketMappings = SUBSTRATE_EXCEL_MAPPINGS.filter((row) => (
    normalizeToken(row.substrate) === normalizeToken(record?.oracle_cat_desc)
    && normalizeToken(row.categoryDescription) === normalizeToken(record?.appearance)
  ));

  const sourceTexts = [
    ...bucketMappings.map((row) => row.itemDescription),
    ...filmRows.flatMap((row) => [row.item_name, row.standards, row.sizes]),
  ];

  const thicknessMicron = pickMedian(sourceTexts.map(extractThicknessMicron), 1);
  const widthMm = pickMedian(sourceTexts.map(extractWidthMm), 0);
  const density = getSubstrateDensityDefault(record?.oracle_cat_desc) ?? 2.71;
  const coreDiameterMm = ALU_DEFAULT_CORE_DIAMETER_MM;

  const yieldM2PerKg = thicknessMicron && density
    ? roundTo(1000 / (thicknessMicron * density), 2)
    : null;

  const rollLengthM = thicknessMicron
    ? roundTo(
      (Math.PI * ((ALU_DEFAULT_MAX_COIL_OD_MM ** 2) - (coreDiameterMm ** 2)))
      / (4 * (thicknessMicron / 1000))
      / 1000,
      0
    )
    : null;

  return {
    supplier_name: ALU_DEFAULT_SUPPLIER,
    resin_type: ALU_DEFAULT_RESIN_TYPE,
    alloy_code: ALU_DEFAULT_ALLOY,
    density_g_cm3: density,
    micron_thickness: thicknessMicron,
    width_mm: widthMm,
    yield_m2_per_kg: yieldM2PerKg,
    roll_length_m: rollLengthM,
    core_diameter_mm: coreDiameterMm,
    solid_pct: 100,
  };
};

export default function ItemMaster() {
  const { user } = useAuth();
  const { companyCurrency, isUAEDirham } = useCurrency();
  const { message } = App.useApp();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [filters, setFilters] = useState({
    item_type: null,
    search: '',
    category: RESIN_CATEGORY,
    cat_desc: null,
    cat_desc_detail: null,
  });
  const [form] = Form.useForm();
  const [bulkForm] = Form.useForm();
  const [fpAverages, setFpAverages] = useState(null);
  const [fpLoading, setFpLoading]   = useState(false);
  const [resinProfile, setResinProfile] = useState(null);
  const [resinProfileLoading, setResinProfileLoading] = useState(false);
  const [substrateProfile, setSubstrateProfile] = useState(null);
  const [substrateProfileLoading, setSubstrateProfileLoading] = useState(false);
  const [selectedGradeIds, setSelectedGradeIds] = useState([]);
  const [substrateDrafts, setSubstrateDrafts] = useState({});
  const [selectedSubstrateFilmIds, setSelectedSubstrateFilmIds] = useState([]);
  const [rmFilmRows, setRmFilmRows] = useState([]);
  const [rmFilmLoading, setRmFilmLoading] = useState(false);
  const [unmappedAuditOpen, setUnmappedAuditOpen] = useState(false);
  const [taxonomyLoading, setTaxonomyLoading] = useState(false);
  const [resinTaxonomyCategories, setResinTaxonomyCategories] = useState([]);
  const [substrateTaxonomyCategories, setSubstrateTaxonomyCategories] = useState([]);
  const [substrateTaxonomySubcategories, setSubstrateTaxonomySubcategories] = useState([]);
  const [substrateTaxonomyMappings, setSubstrateTaxonomyMappings] = useState([]);
  const [taxonomyModal, setTaxonomyModal] = useState({
    open: false,
    mode: 'create',
    level: 'category',
    domainKey: RESIN_DOMAIN_KEY,
    record: null,
  });
  const [taxonomyForm] = Form.useForm();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SUBSTRATE_DRAFTS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        setSubstrateDrafts(parsed);
      }
    } catch {
      // Ignore malformed local cache.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SUBSTRATE_DRAFTS_STORAGE_KEY, JSON.stringify(substrateDrafts));
    } catch {
      // Ignore storage write failures.
    }
  }, [substrateDrafts]);

  // AuthContext stores token in localStorage/global axios defaults.
  // Avoid passing "Bearer undefined" when user object has no token field.
  const token = localStorage.getItem('auth_token') || user?.token;
  const authHeaders = token ? { headers: { Authorization: `Bearer ${token}` } } : {};

  const resolveApiErrorMessage = useCallback((err, fallbackText) => {
    if (!err?.response) {
      return 'Backend is unavailable or restarting. Please retry in a few seconds.';
    }
    return err.response?.data?.error || err.message || fallbackText;
  }, []);

  const currencyPrefix = companyCurrency?.symbol || '$';

  const CurrencySymbol = () => (
    isUAEDirham() ? (
      <UAEDirhamSymbol style={{ width: '0.9em', height: '0.9em', verticalAlign: '-0.1em', marginRight: '0.08em' }} />
    ) : (
      <span style={{ marginRight: '0.05em' }}>{currencyPrefix}</span>
    )
  );

  const renderCurrency = useCallback((value, decimals = 2) => {
    if (value == null || value === '') return '—';
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const fmt = n.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '1px' }}>
        <CurrencySymbol />
        {fmt}
      </span>
    );
  }, [currencyPrefix, isUAEDirham]);

  const pickPositivePrice = useCallback((value) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, []);

  const normalizeName = useCallback((value) => String(value || '').trim().toLowerCase(), []);

  const normalizeTaxonomyKey = useCallback((value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, ''), []);

  const resolveMarketPrice = useCallback((record) => (
    pickPositivePrice(record?.market_ref_price)
      ?? pickPositivePrice(record?.on_order_price)
      ?? pickPositivePrice(record?.stock_price)
      ?? null
  ), [pickPositivePrice]);

  // ─── Fetch items ──────────────────────────────────────────────────────────
  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.item_type) params.append('item_type', filters.item_type);
      if (filters.search) params.append('search', filters.search);
      const res = await axios.get(`${API_BASE}/api/mes/master-data/items?${params}`, authHeaders);
      setItems(res.data.data || []);
    } catch {
      message.error('Failed to load items');
    } finally {
      setLoading(false);
    }
  }, [filters, token]);

  const fetchSubstrateConfigs = useCallback(async () => {
    if (!token) return;

    try {
      const res = await axios.get(
        `${API_BASE}/api/mes/master-data/items/substrate-configs?material_class=substrates`,
        authHeaders
      );

      const rows = Array.isArray(res.data?.data) ? res.data.data : [];
      const mappedDrafts = {};

      rows.forEach((row) => {
        const key = substrateDraftKey(row.cat_desc, row.appearance);
        mappedDrafts[key] = substrateDraftFromConfigRow(row);
      });

      if (Object.keys(mappedDrafts).length) {
        setSubstrateDrafts((prev) => ({ ...prev, ...mappedDrafts }));
      }
    } catch {
      // Keep local cached drafts when backend config fetch fails.
    }
  }, [token]);

  const fetchTaxonomy = useCallback(async () => {
    if (!token) return;

    setTaxonomyLoading(true);
    try {
      const [resinCategoriesRes, substrateCategoriesRes, substrateSubcategoriesRes, substrateMappingsRes] = await Promise.all([
        axios.get(
          `${API_BASE}/api/mes/master-data/taxonomy/categories?domain_key=${RESIN_DOMAIN_KEY}`,
          authHeaders
        ),
        axios.get(
          `${API_BASE}/api/mes/master-data/taxonomy/categories?domain_key=${SUBSTRATE_DOMAIN_KEY}`,
          authHeaders
        ),
        axios.get(
          `${API_BASE}/api/mes/master-data/taxonomy/subcategories?domain_key=${SUBSTRATE_DOMAIN_KEY}`,
          authHeaders
        ),
        axios.get(
          `${API_BASE}/api/mes/master-data/taxonomy/mappings?domain_key=${SUBSTRATE_DOMAIN_KEY}&source_system=rm_sync`,
          authHeaders
        ),
      ]);

      setResinTaxonomyCategories(Array.isArray(resinCategoriesRes.data?.data) ? resinCategoriesRes.data.data : []);
      setSubstrateTaxonomyCategories(Array.isArray(substrateCategoriesRes.data?.data) ? substrateCategoriesRes.data.data : []);
      setSubstrateTaxonomySubcategories(Array.isArray(substrateSubcategoriesRes.data?.data) ? substrateSubcategoriesRes.data.data : []);
      setSubstrateTaxonomyMappings(Array.isArray(substrateMappingsRes.data?.data) ? substrateMappingsRes.data.data : []);
    } catch {
      // Keep static/fallback behavior when taxonomy APIs are unavailable.
    } finally {
      setTaxonomyLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { fetchSubstrateConfigs(); }, [fetchSubstrateConfigs]);
  useEffect(() => { fetchTaxonomy(); }, [fetchTaxonomy]);

  useEffect(() => {
    const ids = (resinProfile?.grades || [])
      .map((grade) => String(grade.tds_id))
      .filter(Boolean);
    setSelectedGradeIds(ids);
  }, [resinProfile]);

  const fetchRmFilmRows = useCallback(async () => {
    setRmFilmLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/rm-sync/data`, {
        ...authHeaders,
        params: { limit: 5000 },
      });

      const sourceRows = Array.isArray(res.data?.data) ? res.data.data : [];
      const byItem = new Map();

      sourceRows
        .filter((row) => normalizeToken(row.category) === 'substrates')
        .forEach((row) => {
          const mapped = resolveSubstrateMappingByDescription(row.maindescription);
          const itemCode = normalizeToken(row.mainitem);
          const fallbackKey = `${normalizeToken(row.catlinedesc)}|${normalizeToken(row.material)}|${normalizeToken(row.maindescription)}`;
          const key = itemCode || fallbackKey;

          if (!byItem.has(key)) {
            byItem.set(key, {
              id: key,
              item_code: row.mainitem || key,
              item_name: row.maindescription || row.material || row.catlinedesc || '—',
              category: row.category || 'Substrates',
              type: row.material || '—',
              cat_desc: row.catlinedesc || '—',
              mapped_substrate: mapped?.substrate || null,
              mapped_category_description: mapped?.categoryDescription || null,
              standards: row.standards || '',
              sizes: row.sizes || '',
              weights: row.weights || '',
              stock_qty: 0,
              order_qty: 0,
              stock_val: 0,
              order_val: 0,
            });
          }

          const target = byItem.get(key);
          const stockQty = Number(row.mainitemstock) || 0;
          const orderQty = Number(row.pendingorderqty) || 0;
          const stockCost = Number(row.maincost) || 0;
          const orderCost = Number(row.purchaseprice) || 0;

          if (!target.standards && row.standards) target.standards = String(row.standards);
          if (!target.sizes && row.sizes) target.sizes = String(row.sizes);
          if (!target.weights && row.weights) target.weights = String(row.weights);
          if (!target.mapped_substrate && mapped?.substrate) target.mapped_substrate = mapped.substrate;
          if (!target.mapped_category_description && mapped?.categoryDescription) {
            target.mapped_category_description = mapped.categoryDescription;
          }

          target.stock_qty += stockQty;
          target.order_qty += orderQty;
          target.stock_val += stockQty * stockCost;
          target.order_val += orderQty * orderCost;
        });

      const prepared = Array.from(byItem.values()).map((row) => ({
        id: String(row.id),
        item_code: row.item_code,
        item_name: row.item_name,
        category: row.category,
        type: row.type,
        cat_desc: row.cat_desc,
        mapped_substrate: row.mapped_substrate,
        mapped_category_description: row.mapped_category_description,
        standards: row.standards,
        sizes: row.sizes,
        weights: row.weights,
        stock_qty: row.stock_qty,
        order_qty: row.order_qty,
        stock_cost_wa: row.stock_qty > 0 ? Number((row.stock_val / row.stock_qty).toFixed(4)) : null,
        purchase_cost_wa: row.order_qty > 0 ? Number((row.order_val / row.order_qty).toFixed(4)) : null,
      }));

      prepared.sort((a, b) => String(a.item_code || '').localeCompare(String(b.item_code || '')));
      setRmFilmRows(prepared);
    } catch {
      setRmFilmRows([]);
    } finally {
      setRmFilmLoading(false);
    }
  }, [token]);

  // ─── Save item (create/update) ────────────────────────────────────────────
  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      if (editingItem?.category === SUBSTRATE_CATEGORY) {
        const isAluSubstrate = isAluSubstrateRecord(editingItem);
        const key = substrateDraftKey(editingItem.oracle_cat_desc, editingItem.appearance);
        const mappedMaterialKeys = normalizeStringArray(selectedSubstrateMaterialKeys);

        const payload = {
          material_class: 'substrates',
          cat_desc: editingItem.oracle_cat_desc,
          appearance: editingItem.appearance,
          supplier_name: isAluSubstrate
            ? ALU_DEFAULT_SUPPLIER
            : (values.supplier_name ? String(values.supplier_name).trim() : null),
          resin_type: isAluSubstrate
            ? ALU_DEFAULT_RESIN_TYPE
            : (values.resin_type ? String(values.resin_type).trim() : null),
          alloy_code: isAluSubstrate
            ? ALU_DEFAULT_ALLOY
            : (values.alloy_code ? String(values.alloy_code).trim() : null),
          density_g_cm3: values.density_g_cm3 ?? null,
          solid_pct: values.solid_pct ?? null,
          micron_thickness: values.micron_thickness ?? null,
          width_mm: values.width_mm ?? null,
          yield_m2_per_kg: values.yield_m2_per_kg ?? null,
          roll_length_m: values.roll_length_m ?? null,
          core_diameter_mm: values.core_diameter_mm ?? null,
          market_ref_price: values.market_ref_price ?? null,
          market_price_date: values.market_price_date ?? null,
          mrp_type: values.mrp_type || 'PD',
          reorder_point: values.reorder_point ?? null,
          safety_stock_kg: values.safety_stock_kg ?? null,
          planned_lead_time_days: values.planned_lead_time_days ?? null,
          mapped_material_keys: mappedMaterialKeys,
        };

        const saveRes = await axios.put(
          `${API_BASE}/api/mes/master-data/items/substrate-config`,
          payload,
          authHeaders
        );

        if (editingItem?.taxonomy_category_id && editingItem?.taxonomy_subcategory_id) {
          const selectedIds = new Set(selectedSubstrateFilmIds.map((id) => String(id)));
          const mappingItems = (filmCandidateItems || [])
            .filter((row) => selectedIds.has(String(row.id)))
            .map((row) => ({
              source_item_key: row.item_code,
              source_item_label: row.item_name,
            }))
            .filter((row) => row.source_item_key);

          await axios.put(
            `${API_BASE}/api/mes/master-data/taxonomy/mappings/bulk-replace`,
            {
              category_id: editingItem.taxonomy_category_id,
              subcategory_id: editingItem.taxonomy_subcategory_id,
              source_system: 'rm_sync',
              items: mappingItems,
            },
            authHeaders
          );
        }

        const savedConfig = saveRes.data?.data || payload;
        setSubstrateDrafts((prev) => ({
          ...prev,
          [key]: substrateDraftFromConfigRow({
            ...savedConfig,
            cat_desc: editingItem.oracle_cat_desc,
            appearance: editingItem.appearance,
            mapped_material_keys: savedConfig.mapped_material_keys || mappedMaterialKeys,
            mapped_film_ids: selectedSubstrateFilmIds,
          }),
        }));

        message.success('Substrate profile saved.');
        setModalOpen(false);
        setEditingItem(null);
        form.resetFields();
        setSubstrateProfile(null);
        setSelectedSubstrateFilmIds([]);
        fetchTaxonomy();
        return;
      }

      if (editingItem) {
        await axios.put(`${API_BASE}/api/mes/master-data/items/${editingItem.id}`, values, authHeaders);
        message.success('Item updated');
      } else {
        await axios.post(`${API_BASE}/api/mes/master-data/items`, values, authHeaders);
        message.success('Item created');
      }
      setModalOpen(false);
      setEditingItem(null);
      form.resetFields();
      setSubstrateProfile(null);
      setSelectedSubstrateFilmIds([]);
      fetchItems();
    } catch (err) {
      message.error(err.response?.data?.error || 'Save failed');
    }
  };

  // ─── Delete item ──────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_BASE}/api/mes/master-data/items/${id}`, authHeaders);
      message.success('Item deactivated');
      fetchItems();
    } catch {
      message.error('Delete failed');
    }
  };

  // ─── Bulk price update ────────────────────────────────────────────────────
  const handleBulkPriceUpdate = async () => {
    try {
      const values = await bulkForm.validateFields();
      // Parse textarea: each line = "ITEM_CODE, price"
      const lines = (values.priceData || '').trim().split('\n').filter(Boolean);
      const priceItems = lines.map(line => {
        const [item_code, price] = line.split(',').map(s => s.trim());
        return { item_code, market_ref_price: parseFloat(price) || 0 };
      }).filter(i => i.item_code);

      if (!priceItems.length) {
        return message.warning('No valid price data found');
      }

      const res = await axios.patch(
        `${API_BASE}/api/mes/master-data/items/prices/bulk`,
        { items: priceItems },
        authHeaders
      );
      const { updated, skipped, errors } = res.data.data;
      message.success(`Updated ${updated} items. ${skipped.length ? `Skipped: ${skipped.join(', ')}` : ''}`);
      if (errors.length) message.warning(`Errors: ${errors.map(e => e.item_code).join(', ')}`);
      setBulkModalOpen(false);
      bulkForm.resetFields();
      fetchItems();
    } catch (err) {
      message.error(err.response?.data?.error || 'Bulk update failed');
    }
  };

  // ─── Fetch Oracle + physical averages for Resin edit ─────────────────────
  const fetchFpAverages = useCallback(async (catDesc) => {
    setFpLoading(true);
    try {
      const res = await axios.get(
        `${API_BASE}/api/mes/master-data/items/fp-averages?cat_desc=${encodeURIComponent(catDesc)}`,
        authHeaders
      );
      setFpAverages(res.data.data || {});
    } catch {
      setFpAverages({});
    } finally {
      setFpLoading(false);
    }
  }, [token]);

  // ─── Fetch full resin profile (prices, inventory, grades, all specs) ─────
  const fetchResinProfile = useCallback(async (catDesc, taxonomyCategoryId = null) => {
    if (!catDesc) {
      setResinProfile(null);
      setSelectedGradeIds([]);
      return;
    }

    setResinProfileLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('cat_desc', catDesc);
      const parsedTaxonomyCategoryId = Number(taxonomyCategoryId);
      if (Number.isInteger(parsedTaxonomyCategoryId) && parsedTaxonomyCategoryId > 0) {
        params.set('taxonomy_category_id', String(parsedTaxonomyCategoryId));
      }

      const res = await axios.get(
        `${API_BASE}/api/mes/master-data/items/resin-profile?${params.toString()}`,
        authHeaders
      );
      setResinProfile(res.data?.data || null);
    } catch {
      setResinProfile(null);
      setSelectedGradeIds([]);
    } finally {
      setResinProfileLoading(false);
    }
  }, [token]);

  const fetchSubstrateProfile = useCallback(async (record, materialKeys = []) => {
    const keys = Array.from(new Set(
      (materialKeys || [])
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean)
    ));

    if (!record || !keys.length) {
      setSubstrateProfile(null);
      setSubstrateProfileLoading(false);
      return;
    }

    setSubstrateProfileLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('cat_desc', record.oracle_cat_desc || '');
      params.append('appearance', record.appearance || '');
      params.append('material_class', 'substrates');
      params.append('material_keys', keys.join(','));

      const res = await axios.get(
        `${API_BASE}/api/mes/master-data/items/substrate-profile?${params.toString()}`,
        authHeaders
      );
      setSubstrateProfile(res.data?.data || null);
    } catch {
      setSubstrateProfile(null);
    } finally {
      setSubstrateProfileLoading(false);
    }
  }, [token]);

  const allResinGrades = useMemo(() => resinProfile?.grades || [], [resinProfile]);

  const selectedResinGrades = useMemo(() => {
    if (!allResinGrades.length) return [];
    const selected = new Set(selectedGradeIds.map((id) => String(id)));
    return allResinGrades.filter((grade) => selected.has(String(grade.tds_id)));
  }, [allResinGrades, selectedGradeIds]);

  const effectiveResinProfile = useMemo(() => {
    if (!resinProfile) return null;

    const toNum = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };

    const round = (value, decimals = 4) => {
      if (!Number.isFinite(value)) return null;
      return Number(value.toFixed(decimals));
    };

    const weightedByStock = (rows, key) => {
      let weightedSum = 0;
      let weightedQty = 0;
      let avgSum = 0;
      let avgCount = 0;

      rows.forEach((row) => {
        const v = toNum(row[key]);
        if (v == null) return;

        avgSum += v;
        avgCount += 1;

        const stockQty = toNum(row.stock_qty);
        if (stockQty != null && stockQty > 0) {
          weightedSum += v * stockQty;
          weightedQty += stockQty;
        }
      });

      if (weightedQty > 0) return round(weightedSum / weightedQty);
      if (avgCount > 0) return round(avgSum / avgCount);
      return null;
    };

    const grouped = new Map();
    selectedResinGrades.forEach((row) => {
      const groupKey = row.oracle_item_code || `tds:${row.tds_id}`;
      if (!grouped.has(groupKey)) {
        const seed = { ...row, _paramAcc: {} };
        RESIN_SPEC_PARAMS.forEach((param) => {
          seed._paramAcc[param.key] = { sum: 0, count: 0 };
        });
        grouped.set(groupKey, seed);
      }

      const target = grouped.get(groupKey);
      ['stock_qty', 'order_qty', 'stock_price_wa', 'on_order_price_wa', 'density_wa'].forEach((field) => {
        const incoming = toNum(row[field]);
        if (incoming == null) return;
        if (toNum(target[field]) == null) {
          target[field] = incoming;
        }
      });

      RESIN_SPEC_PARAMS.forEach((param) => {
        const incoming = toNum(row[param.key]);
        if (incoming == null) return;
        target._paramAcc[param.key].sum += incoming;
        target._paramAcc[param.key].count += 1;
      });
    });

    const rows = Array.from(grouped.values()).map((row) => {
      const normalized = { ...row };
      RESIN_SPEC_PARAMS.forEach((param) => {
        const acc = row._paramAcc[param.key];
        normalized[param.key] = acc.count > 0 ? round(acc.sum / acc.count) : null;
      });
      delete normalized._paramAcc;
      return normalized;
    });
    const stockQty = rows.reduce((sum, row) => sum + (toNum(row.stock_qty) || 0), 0);
    const orderQty = rows.reduce((sum, row) => sum + (toNum(row.order_qty) || 0), 0);
    const stockVal = rows.reduce((sum, row) => {
      const qty = toNum(row.stock_qty) || 0;
      const price = toNum(row.stock_price_wa) || 0;
      return sum + (qty * price);
    }, 0);
    const orderVal = rows.reduce((sum, row) => {
      const qty = toNum(row.order_qty) || 0;
      const price = toNum(row.on_order_price_wa) || 0;
      return sum + (qty * price);
    }, 0);

    const tdsParams = {};
    RESIN_SPEC_PARAMS.forEach((param) => {
      tdsParams[param.key] = weightedByStock(rows, param.key);
    });

    const combinedQty = stockQty + orderQty;

    return {
      inventory: {
        total_stock_qty: round(stockQty, 0) || 0,
        total_stock_val: round(stockVal, 4) || 0,
        total_order_qty: round(orderQty, 0) || 0,
        total_order_val: round(orderVal, 4) || 0,
      },
      pricing: {
        stock_price_wa: stockQty > 0 ? round(stockVal / stockQty) : null,
        on_order_price_wa: orderQty > 0 ? round(orderVal / orderQty) : null,
        combined_price_wa: combinedQty > 0 ? round((stockVal + orderVal) / combinedQty) : null,
      },
      density_wa: weightedByStock(rows, 'density_wa'),
      tds_grade_count: selectedResinGrades.length,
      tds_params: tdsParams,
      grades: selectedResinGrades,
    };
  }, [resinProfile, selectedResinGrades]);

  // ─── Open edit modal ──────────────────────────────────────────────────────
  const openEdit = (record) => {
    const draft = record.category === SUBSTRATE_CATEGORY ? getSubstrateDraftFromStore(substrateDrafts, record) : {};
    const isAluSubstrate = record.category === SUBSTRATE_CATEGORY && isAluSubstrateRecord(record);
    const substrateBucket = substrateBucketKey(record.oracle_cat_desc, record.appearance);
    const candidateFilmRows = substrateAssignedFilmRowsByBucket[substrateBucket] || [];
    const smartAluDefaults = isAluSubstrate
      ? getAluSmartDefaults(record, candidateFilmRows)
      : {};

    setEditingItem(record);
    form.setFieldsValue({
      ...record,
      item_code: record.item_code || `SUB-${String(record.oracle_cat_desc || 'SUB').toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
      item_name: record.item_name || `${record.oracle_cat_desc || 'Substrate'}${record.appearance ? ` - ${record.appearance}` : ''}`,
      item_type: record.item_type || 'semi_laminated',
      base_uom: record.base_uom || 'KG',
      supplier_name: isAluSubstrate
        ? ALU_DEFAULT_SUPPLIER
        : (draft.supplier_name ?? record.supplier_name ?? smartAluDefaults.supplier_name ?? null),
      resin_type: isAluSubstrate
        ? ALU_DEFAULT_RESIN_TYPE
        : (draft.resin_type ?? record.resin_type ?? smartAluDefaults.resin_type ?? null),
      alloy_code: isAluSubstrate
        ? ALU_DEFAULT_ALLOY
        : (draft.alloy_code ?? record.alloy_code ?? smartAluDefaults.alloy_code ?? null),
      density_g_cm3: draft.density_g_cm3 ?? record.density_g_cm3 ?? smartAluDefaults.density_g_cm3 ?? null,
      solid_pct: draft.solid_pct ?? record.solid_pct ?? smartAluDefaults.solid_pct ?? null,
      micron_thickness: draft.micron_thickness ?? record.micron_thickness ?? smartAluDefaults.micron_thickness ?? null,
      width_mm: draft.width_mm ?? record.width_mm ?? smartAluDefaults.width_mm ?? null,
      yield_m2_per_kg: draft.yield_m2_per_kg ?? record.yield_m2_per_kg ?? smartAluDefaults.yield_m2_per_kg ?? null,
      roll_length_m: draft.roll_length_m ?? record.roll_length_m ?? smartAluDefaults.roll_length_m ?? null,
      core_diameter_mm: draft.core_diameter_mm ?? record.core_diameter_mm ?? smartAluDefaults.core_diameter_mm ?? null,
      market_ref_price: draft.market_ref_price ?? resolveMarketPrice(record) ?? null,
      market_price_date: draft.market_price_date ?? record.market_price_date ?? null,
      mrp_type: draft.mrp_type ?? record.mrp_type ?? 'PD',
      reorder_point: draft.reorder_point ?? record.reorder_point ?? null,
      safety_stock_kg: draft.safety_stock_kg ?? record.safety_stock_kg ?? null,
      planned_lead_time_days: draft.planned_lead_time_days ?? record.planned_lead_time_days ?? null,
    });
    setModalOpen(true);
    setSelectedGradeIds([]);
    setSelectedSubstrateFilmIds(resolveDraftMappedFilmIds(draft, candidateFilmRows));

    if (record.category === SUBSTRATE_CATEGORY && !rmFilmRows.length && !rmFilmLoading) {
      fetchRmFilmRows();
    }

    if (record.category === RESIN_CATEGORY && record.oracle_cat_desc) {
      fetchFpAverages(record.oracle_cat_desc);
      fetchResinProfile(record.oracle_cat_desc, record.taxonomy_category_id);
      setSubstrateProfile(null);
    } else {
      setFpAverages(null);
      setResinProfile(null);
      setSelectedGradeIds([]);
      setSubstrateProfile(null);
    }
  };

  const openCreate = () => {
    setEditingItem(null);
    form.resetFields();
    setFpAverages(null);
    setResinProfile(null);
    setSubstrateProfile(null);
    setSelectedGradeIds([]);
    setSelectedSubstrateFilmIds([]);
    setModalOpen(true);
  };

  const openUnmappedSubstratesAudit = useCallback(() => {
    setUnmappedAuditOpen(true);
    if (!rmFilmRows.length && !rmFilmLoading) {
      fetchRmFilmRows();
    }
  }, [rmFilmRows.length, rmFilmLoading, fetchRmFilmRows]);

  const openTaxonomyCreateCategory = () => {
    const domainKey = filters.category === SUBSTRATE_CATEGORY ? SUBSTRATE_DOMAIN_KEY : RESIN_DOMAIN_KEY;
    setTaxonomyModal({
      open: true,
      mode: 'create',
      level: 'category',
      domainKey,
      record: null,
    });
    taxonomyForm.setFieldsValue({ display_name: '', sort_order: 100 });
  };

  const openTaxonomyRenameCategory = () => {
    const record = filters.category === SUBSTRATE_CATEGORY
      ? selectedSubstrateCategoryRecord
      : selectedResinCategoryRecord;

    if (!record) {
      message.warning('Select a category first.');
      return;
    }

    setTaxonomyModal({
      open: true,
      mode: 'rename',
      level: 'category',
      domainKey: filters.category === SUBSTRATE_CATEGORY ? SUBSTRATE_DOMAIN_KEY : RESIN_DOMAIN_KEY,
      record,
    });
    taxonomyForm.setFieldsValue({
      display_name: record.display_name,
      sort_order: Number.isFinite(Number(record.sort_order)) ? Number(record.sort_order) : 100,
    });
  };

  const openTaxonomyCreateSubcategory = () => {
    if (filters.category !== SUBSTRATE_CATEGORY) return;

    setTaxonomyModal({
      open: true,
      mode: 'create',
      level: 'subcategory',
      domainKey: SUBSTRATE_DOMAIN_KEY,
      record: null,
    });
    taxonomyForm.setFieldsValue({
      category_id: selectedSubstrateCategoryRecord?.id || null,
      display_name: '',
      sort_order: 100,
    });
  };

  const openTaxonomyRenameSubcategory = () => {
    if (filters.category !== SUBSTRATE_CATEGORY) return;
    if (!selectedSubstrateSubcategoryRecord) {
      message.warning('Select a subcategory first.');
      return;
    }

    setTaxonomyModal({
      open: true,
      mode: 'rename',
      level: 'subcategory',
      domainKey: SUBSTRATE_DOMAIN_KEY,
      record: selectedSubstrateSubcategoryRecord,
    });
    taxonomyForm.setFieldsValue({
      category_id: selectedSubstrateSubcategoryRecord.category_id,
      display_name: selectedSubstrateSubcategoryRecord.display_name,
      sort_order: Number.isFinite(Number(selectedSubstrateSubcategoryRecord.sort_order))
        ? Number(selectedSubstrateSubcategoryRecord.sort_order)
        : 100,
    });
  };

  const handleSaveTaxonomy = async () => {
    try {
      const values = await taxonomyForm.validateFields();
      let saved = null;

      if (taxonomyModal.level === 'category') {
        if (taxonomyModal.mode === 'create') {
          const res = await axios.post(
            `${API_BASE}/api/mes/master-data/taxonomy/categories`,
            {
              domain_key: taxonomyModal.domainKey,
              display_name: values.display_name,
              sort_order: values.sort_order,
            },
            authHeaders
          );
          saved = res.data?.data || null;
          message.success('Category created');
        } else {
          const id = taxonomyModal.record?.id;
          if (!id) throw new Error('Category reference is missing');
          const res = await axios.put(
            `${API_BASE}/api/mes/master-data/taxonomy/categories/${id}`,
            {
              display_name: values.display_name,
              sort_order: values.sort_order,
            },
            authHeaders
          );
          saved = res.data?.data || null;
          message.success('Category renamed');
        }
      } else {
        if (taxonomyModal.mode === 'create') {
          const res = await axios.post(
            `${API_BASE}/api/mes/master-data/taxonomy/subcategories`,
            {
              category_id: values.category_id,
              display_name: values.display_name,
              sort_order: values.sort_order,
            },
            authHeaders
          );
          saved = res.data?.data || null;
          message.success('Subcategory created');
        } else {
          const id = taxonomyModal.record?.id;
          if (!id) throw new Error('Subcategory reference is missing');
          const res = await axios.put(
            `${API_BASE}/api/mes/master-data/taxonomy/subcategories/${id}`,
            {
              display_name: values.display_name,
              sort_order: values.sort_order,
            },
            authHeaders
          );
          saved = res.data?.data || null;
          message.success('Subcategory renamed');
        }
      }

      await fetchTaxonomy();

      if (saved?.display_name) {
        if (taxonomyModal.level === 'category') {
          setFilters((prev) => ({ ...prev, cat_desc: saved.display_name, cat_desc_detail: null }));
        } else if (taxonomyModal.level === 'subcategory') {
          const categoryName = activeSubstrateTaxonomyCategories.find((row) => row.id === Number(values.category_id))?.display_name
            || filters.cat_desc;
          setFilters((prev) => ({
            ...prev,
            cat_desc: categoryName || prev.cat_desc,
            cat_desc_detail: saved.display_name,
          }));
        }
      }

      setTaxonomyModal((prev) => ({ ...prev, open: false, record: null }));
      taxonomyForm.resetFields();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(resolveApiErrorMessage(err, 'Failed to save taxonomy'));
    }
  };

  const handleDeleteTaxonomyCategory = async () => {
    const record = filters.category === SUBSTRATE_CATEGORY
      ? selectedSubstrateCategoryRecord
      : selectedResinCategoryRecord;

    if (!record?.id) {
      message.warning('Select a category first.');
      return;
    }

    try {
      if (filters.category === SUBSTRATE_CATEGORY) {
        const childSubcategories = (activeSubstrateTaxonomySubcategories || [])
          .filter((row) => Number(row.category_id) === Number(record.id));

        if (childSubcategories.length) {
          await Promise.all(childSubcategories.map((row) => (
            axios.put(
              `${API_BASE}/api/mes/master-data/taxonomy/subcategories/${row.id}`,
              { is_active: false },
              authHeaders
            )
          )));
        }

        const relatedMappings = (substrateTaxonomyMappings || [])
          .filter((row) => Number(row.category_id) === Number(record.id));

        if (relatedMappings.length) {
          await Promise.allSettled(relatedMappings.map((row) => (
            axios.delete(
              `${API_BASE}/api/mes/master-data/taxonomy/mappings/${row.id}`,
              authHeaders
            )
          )));
        }
      }

      await axios.put(
        `${API_BASE}/api/mes/master-data/taxonomy/categories/${record.id}`,
        { is_active: false },
        authHeaders
      );

      await fetchTaxonomy();
      setFilters((prev) => ({ ...prev, cat_desc: null, cat_desc_detail: null }));
      message.success('Category deleted');
    } catch (err) {
      message.error(resolveApiErrorMessage(err, 'Failed to delete category'));
    }
  };

  const handleDeleteTaxonomySubcategory = async (rowRecord = null) => {
    if (filters.category !== SUBSTRATE_CATEGORY) return;

    const selectedRecord = selectedSubstrateSubcategoryRecord;
    const subcategoryId = Number(
      rowRecord?.taxonomy_subcategory_id
      ?? rowRecord?.id
      ?? selectedRecord?.id
    );

    if (!Number.isFinite(subcategoryId) || subcategoryId <= 0) {
      message.warning('Select a subcategory first.');
      return;
    }

    try {
      const relatedMappings = (substrateTaxonomyMappings || [])
        .filter((row) => Number(row.subcategory_id) === subcategoryId);

      if (relatedMappings.length) {
        await Promise.allSettled(relatedMappings.map((row) => (
          axios.delete(
            `${API_BASE}/api/mes/master-data/taxonomy/mappings/${row.id}`,
            authHeaders
          )
        )));
      }

      await axios.put(
        `${API_BASE}/api/mes/master-data/taxonomy/subcategories/${subcategoryId}`,
        { is_active: false },
        authHeaders
      );

      await fetchTaxonomy();

      const deletedCategory = rowRecord?.oracle_cat_desc || selectedRecord?.category_name || filters.cat_desc;
      const deletedSubcategory = rowRecord?.appearance || selectedRecord?.display_name || filters.cat_desc_detail;
      const clearSelectedSubcategory = normalizeName(filters.cat_desc) === normalizeName(deletedCategory)
        && normalizeName(filters.cat_desc_detail) === normalizeName(deletedSubcategory);

      if (clearSelectedSubcategory) {
        setFilters((prev) => ({ ...prev, cat_desc_detail: null }));
      }

      message.success('Subcategory deleted');
    } catch (err) {
      message.error(resolveApiErrorMessage(err, 'Failed to delete subcategory'));
    }
  };

  // ─── Table columns ────────────────────────────────────────────────────────
  const columns = filters.category === SUBSTRATE_CATEGORY
    ? [
      {
        title: 'Category', dataIndex: 'oracle_cat_desc', key: 'catdesc', width: 120, ellipsis: true,
        render: (v, record) => record.display_cat_desc || v || <Text type="secondary">—</Text>,
      },
      {
        title: 'Subcategory', dataIndex: 'appearance', key: 'appearance', width: 260, ellipsis: true,
        render: (v) => v || <Text type="secondary">—</Text>,
      },
      {
        title: 'Density', dataIndex: 'density_g_cm3', key: 'density', width: 75, align: 'center',
        render: (v) => Number.isFinite(Number(v)) ? Number(v).toFixed(2) : '—',
      },
      {
        title: 'Stock Price (WA)', dataIndex: 'stock_price', key: 'stock_price', width: 120, align: 'center',
        render: (v) => renderCurrency(v),
      },
      {
        title: 'On Order (WA)', dataIndex: 'on_order_price', key: 'on_order_price', width: 115, align: 'center',
        render: (v) => renderCurrency(v),
      },
      {
        title: 'Weighted Avg', key: 'weighted_avg', width: 115, align: 'center',
        render: (_, r) => {
          const sq = Number(r.stock_qty) || 0;
          const oq = Number(r.order_qty) || 0;
          const sp = pickPositivePrice(r.stock_price);
          const op = pickPositivePrice(r.on_order_price);
          const totalQty = (sp != null ? sq : 0) + (op != null ? oq : 0);
          const totalVal = (sp != null ? sp * sq : 0) + (op != null ? op * oq : 0);
          return renderCurrency(totalQty > 0 ? totalVal / totalQty : null);
        },
      },
      {
        title: 'Market Price', dataIndex: 'market_ref_price', key: 'mkt', width: 115, align: 'center',
        render: (_, record) => renderCurrency(resolveMarketPrice(record)),
      },
      {
        title: 'Mapped', key: 'mapped_substrates', width: 80, align: 'center',
        render: (_, record) => getMappedSubstratesCount(record),
      },
      {
        title: 'Actions', key: 'actions', width: 88, align: 'center',
        render: (_, record) => {
          const canDeleteSubcategory = Number.isFinite(Number(record.taxonomy_subcategory_id));
          return (
            <Space size="small">
              <Tooltip title="Edit Structure"><Button icon={<EditOutlined />} size="small" onClick={() => openEdit(record)} /></Tooltip>
              {canDeleteSubcategory ? (
                <Popconfirm
                  title="Delete this subcategory?"
                  description="This deactivates the subcategory and its active mappings."
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleDeleteTaxonomySubcategory(record)}
                >
                  <Button icon={<DeleteOutlined />} size="small" danger />
                </Popconfirm>
              ) : (
                <Tooltip title="Delete is available after substrate taxonomy sync.">
                  <Button icon={<DeleteOutlined />} size="small" danger disabled />
                </Tooltip>
              )}
            </Space>
          );
        },
      },
    ]
    : [
      {
        title: 'Category', dataIndex: 'oracle_cat_desc', key: 'catdesc', width: 120, ellipsis: true,
        render: (v, record) => record.display_cat_desc || v || <Text type="secondary">—</Text>,
      },
      {
        title: 'UOM', dataIndex: 'uom', key: 'uom', width: 50, align: 'center',
        render: (v, r) => v || r.base_uom || 'KG',
      },
      {
        title: 'Stock Price (WA)', dataIndex: 'stock_price', key: 'stock_price', width: 108, align: 'center',
        render: (v) => renderCurrency(v),
      },
      {
        title: 'On Order (WA)', dataIndex: 'on_order_price', key: 'on_order_price', width: 108, align: 'center',
        render: (v) => renderCurrency(v),
      },
      {
        title: 'Weighted Avg', key: 'weighted_avg', width: 108, align: 'center',
        render: (_, r) => {
          const sq = Number(r.stock_qty) || 0;
          const oq = Number(r.order_qty) || 0;
          const sp = pickPositivePrice(r.stock_price);
          const op = pickPositivePrice(r.on_order_price);
          const totalQty = (sp != null ? sq : 0) + (op != null ? oq : 0);
          const totalVal = (sp != null ? sp * sq : 0) + (op != null ? op * oq : 0);
          return renderCurrency(totalQty > 0 ? totalVal / totalQty : null);
        },
      },
      {
        title: 'Market Price', dataIndex: 'market_ref_price', key: 'mkt', width: 108, align: 'center',
        render: (_, record) => renderCurrency(resolveMarketPrice(record)),
      },
      {
        title: 'Mapped Items', key: 'mapped_items', width: 80, align: 'center',
        render: (_, record) => (
          record.category === RESIN_CATEGORY
            ? Number(record.mapped_item_count || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
            : '—'
        ),
      },
      {
        title: 'Actions', key: 'actions', width: 82, align: 'center',
        render: (_, record) => (
          <Space size="small">
            <Tooltip title="Edit"><Button icon={<EditOutlined />} size="small" onClick={() => openEdit(record)} /></Tooltip>
            <Popconfirm title="Deactivate this item?" onConfirm={() => handleDelete(record.id)} okText="Yes">
              <Button icon={<DeleteOutlined />} size="small" danger />
            </Popconfirm>
          </Space>
        ),
      },
    ];

  // ─── Expandable costing row ───────────────────────────────────────────────
  const expandedRowRender = (record) => {
    if (record.category === RESIN_CATEGORY) {
      const stockQty = Number(record.stock_qty) || 0;
      const orderQty = Number(record.order_qty) || 0;
      const stockPrice = Number(record.stock_price);
      const orderPrice = Number(record.on_order_price);
      const densityValue = Number(record.density_g_cm3);
      const densityDisplay = Number.isFinite(densityValue) && densityValue > 0
        ? `${densityValue.toFixed(4)} g/cm³`
        : '—';
      const combinedQty = stockQty + orderQty;
      const combinedVal = (Number.isFinite(stockPrice) ? stockPrice * stockQty : 0)
        + (Number.isFinite(orderPrice) ? orderPrice * orderQty : 0);
      const combinedWa = combinedQty > 0 ? (combinedVal / combinedQty) : null;

      return (
        <Row gutter={24} style={{ padding: '8px 0' }}>
          <Col span={4}><Text type="secondary">Stock WA:</Text> {renderCurrency(record.stock_price, 4)}</Col>
          <Col span={4}><Text type="secondary">On Order WA:</Text> {renderCurrency(record.on_order_price, 4)}</Col>
          <Col span={4}><Text type="secondary">Combined WA:</Text> {renderCurrency(combinedWa, 4)}</Col>
          <Col span={4}><Text type="secondary">Market Ref:</Text> {renderCurrency(resolveMarketPrice(record), 4)}</Col>
          <Col span={4}><Text type="secondary">Waste %:</Text> {record.waste_pct ?? 3}%</Col>
          <Col span={4}><Text type="secondary">Density:</Text> {densityDisplay}</Col>
        </Row>
      );
    }

    if (record.category === SUBSTRATE_CATEGORY) {
      const mappedRows = getMappedFilmRows(record);
      const stockQty = Number(record.stock_qty) || 0;
      const orderQty = Number(record.order_qty) || 0;
      const stockPrice = Number(record.stock_price);
      const orderPrice = Number(record.on_order_price);
      const densityValue = Number(record.density_g_cm3);
      const densityDisplay = Number.isFinite(densityValue) && densityValue > 0
        ? `${densityValue.toFixed(4)} g/cm³`
        : '—';
      const combinedQty = stockQty + orderQty;
      const combinedVal = (Number.isFinite(stockPrice) ? stockPrice * stockQty : 0)
        + (Number.isFinite(orderPrice) ? orderPrice * orderQty : 0);
      const combinedWa = combinedQty > 0 ? (combinedVal / combinedQty) : null;

      return (
        <div style={{ padding: '8px 0' }}>
          <Row gutter={24} style={{ marginBottom: 8 }}>
            <Col span={4}><Text type="secondary">Stock WA:</Text> {renderCurrency(record.stock_price, 4)}</Col>
            <Col span={4}><Text type="secondary">On Order WA:</Text> {renderCurrency(record.on_order_price, 4)}</Col>
            <Col span={4}><Text type="secondary">Combined WA:</Text> {renderCurrency(combinedWa, 4)}</Col>
            <Col span={4}><Text type="secondary">Market Ref:</Text> {renderCurrency(resolveMarketPrice(record), 4)}</Col>
            <Col span={4}><Text type="secondary">Waste %:</Text> {record.waste_pct ?? 3}%</Col>
            <Col span={4}><Text type="secondary">Density:</Text> {densityDisplay}</Col>
          </Row>
          <Space size={[8, 8]} wrap style={{ marginBottom: 8 }}>
            <Tag color="processing">{mappedRows.length} mapped substrate{mappedRows.length !== 1 ? 's' : ''}</Tag>
            <Tag>Subcategory: {record.appearance || '—'}</Tag>
            {record.supplier_name && <Tag>Supplier: {record.supplier_name}</Tag>}
            {record.resin_type && <Tag>Material: {record.resin_type}</Tag>}
            {record.alloy_code && <Tag color="blue">Alloy: {record.alloy_code}</Tag>}
            {Number.isFinite(Number(record.micron_thickness)) && <Tag>Thickness: {Number(record.micron_thickness).toFixed(1)} µm</Tag>}
            {Number.isFinite(Number(record.width_mm)) && <Tag>Width: {Number(record.width_mm).toFixed(0)} mm</Tag>}
            {Number.isFinite(Number(record.yield_m2_per_kg)) && <Tag>Yield: {Number(record.yield_m2_per_kg).toFixed(2)} m²/kg</Tag>}
            {Number.isFinite(Number(record.roll_length_m)) && <Tag>Roll Length: {Number(record.roll_length_m).toFixed(0)} m</Tag>}
            {Number.isFinite(Number(record.core_diameter_mm)) && <Tag>Core: {Number(record.core_diameter_mm).toFixed(1)} mm</Tag>}
          </Space>

          <Table
            dataSource={mappedRows}
            rowKey="id"
            size="small"
            pagination={false}
            columns={substrateMappedFilmColumns}
            tableLayout="fixed"
            scroll={{ y: mappedRows.length > 8 ? 280 : undefined }}
            locale={{ emptyText: 'No mapped items for this substrate row.' }}
          />
        </div>
      );
    }

    const stockQty = Number(record.stock_qty) || 0;
    const orderQty = Number(record.order_qty) || 0;
    const stockPrice = Number(record.stock_price);
    const orderPrice = Number(record.on_order_price);
    const densityValue = Number(record.density_g_cm3);
    const densityDisplay = Number.isFinite(densityValue) && densityValue > 0
      ? `${densityValue.toFixed(4)} g/cm³`
      : '—';
    const combinedQty = stockQty + orderQty;
    const combinedVal = (Number.isFinite(stockPrice) ? stockPrice * stockQty : 0)
      + (Number.isFinite(orderPrice) ? orderPrice * orderQty : 0);
    const combinedWa = combinedQty > 0 ? (combinedVal / combinedQty) : null;

    return (
      <Row gutter={24} style={{ padding: '8px 0' }}>
        <Col span={4}><Text type="secondary">Stock WA:</Text> {renderCurrency(record.stock_price, 4)}</Col>
        <Col span={4}><Text type="secondary">On Order WA:</Text> {renderCurrency(record.on_order_price, 4)}</Col>
        <Col span={4}><Text type="secondary">Combined WA:</Text> {renderCurrency(combinedWa, 4)}</Col>
        <Col span={4}><Text type="secondary">Market Ref:</Text> {renderCurrency(resolveMarketPrice(record), 4)}</Col>
        <Col span={4}><Text type="secondary">Waste %:</Text> {record.waste_pct ?? 3}%</Col>
        <Col span={4}><Text type="secondary">Density:</Text> {densityDisplay}</Col>
      </Row>
    );
  };

  // ─── Watch form fields for conditional UI ────────────────────────────────────────
  const currentCategory = Form.useWatch('category', form);
  const isEditingAluSubstrate = currentCategory === SUBSTRATE_CATEGORY && isAluSubstrateRecord(editingItem);

  const activeResinTaxonomyCategories = useMemo(() => (
    (resinTaxonomyCategories || [])
      .filter((row) => row?.is_active !== false)
      .slice()
      .sort((a, b) => String(a.display_name || '').localeCompare(String(b.display_name || '')))
  ), [resinTaxonomyCategories]);

  const activeSubstrateTaxonomyCategories = useMemo(() => (
    (substrateTaxonomyCategories || [])
      .filter((row) => row?.is_active !== false)
      .slice()
      .sort((a, b) => String(a.display_name || '').localeCompare(String(b.display_name || '')))
  ), [substrateTaxonomyCategories]);

  const activeSubstrateTaxonomySubcategories = useMemo(() => (
    (substrateTaxonomySubcategories || [])
      .filter((row) => row?.is_active !== false)
      .slice()
      .sort((a, b) => String(a.display_name || '').localeCompare(String(b.display_name || '')))
  ), [substrateTaxonomySubcategories]);

  const substrateCategoryByName = useMemo(() => {
    const out = new Map();
    activeSubstrateTaxonomyCategories.forEach((row) => {
      out.set(normalizeName(row.display_name), row);
    });
    return out;
  }, [activeSubstrateTaxonomyCategories, normalizeName]);

  const substrateSubcategoriesByCategoryName = useMemo(() => {
    const grouped = {};
    activeSubstrateTaxonomySubcategories.forEach((row) => {
      const key = normalizeName(row.category_name);
      if (!key) return;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    });
    Object.values(grouped).forEach((rows) => rows.sort((a, b) => String(a.display_name || '').localeCompare(String(b.display_name || ''))));
    return grouped;
  }, [activeSubstrateTaxonomySubcategories, normalizeName]);

  const selectedResinCategoryRecord = useMemo(() => {
    if (!filters.cat_desc || filters.cat_desc === UNMAPPED_RESIN_CATDESC) return null;
    return activeResinTaxonomyCategories.find((row) => normalizeName(row.display_name) === normalizeName(filters.cat_desc)) || null;
  }, [filters.cat_desc, activeResinTaxonomyCategories, normalizeName]);

  const selectedSubstrateCategoryRecord = useMemo(() => {
    if (!filters.cat_desc) return null;
    return substrateCategoryByName.get(normalizeName(filters.cat_desc)) || null;
  }, [filters.cat_desc, substrateCategoryByName, normalizeName]);

  const selectedSubstrateSubcategoryRecord = useMemo(() => {
    if (!filters.cat_desc || !filters.cat_desc_detail) return null;
    const rows = substrateSubcategoriesByCategoryName[normalizeName(filters.cat_desc)] || [];
    return rows.find((row) => normalizeName(row.display_name) === normalizeName(filters.cat_desc_detail)) || null;
  }, [filters.cat_desc, filters.cat_desc_detail, substrateSubcategoriesByCategoryName, normalizeName]);

  const resinTaxonomyByKey = useMemo(() => {
    const out = new Map();
    activeResinTaxonomyCategories.forEach((row) => {
      const key = normalizeTaxonomyKey(row.internal_key);
      if (!key) return;
      out.set(key, row.display_name || '');
    });
    return out;
  }, [activeResinTaxonomyCategories, normalizeTaxonomyKey]);

  const resolveResinCategoryDisplay = useCallback((item) => {
    if (!item || item.category !== RESIN_CATEGORY) {
      return item?.oracle_cat_desc || '';
    }

    const rawCatDesc = String(item.oracle_cat_desc || '').trim();
    if (!rawCatDesc) return '';

    const explicitKey = normalizeTaxonomyKey(item.taxonomy_category_key);
    if (explicitKey && resinTaxonomyByKey.has(explicitKey)) {
      return resinTaxonomyByKey.get(explicitKey);
    }

    const inferredKey = normalizeTaxonomyKey(rawCatDesc);
    if (inferredKey && resinTaxonomyByKey.has(inferredKey)) {
      return resinTaxonomyByKey.get(inferredKey);
    }

    const directMatch = activeResinTaxonomyCategories.find(
      (row) => normalizeName(row.display_name) === normalizeName(rawCatDesc)
    );
    return directMatch?.display_name || rawCatDesc;
  }, [activeResinTaxonomyCategories, normalizeName, normalizeTaxonomyKey, resinTaxonomyByKey]);

  const substrateMappingByItemKey = useMemo(() => {
    const out = new Map();
    (substrateTaxonomyMappings || [])
      .filter((row) => row?.is_active !== false)
      .forEach((row) => {
        const key = normalizeToken(row.source_item_key);
        if (!key) return;
        out.set(key, {
          category_name: row.category_name,
          subcategory_name: row.subcategory_name,
          category_id: row.category_id,
          subcategory_id: row.subcategory_id,
        });
      });
    return out;
  }, [substrateTaxonomyMappings]);

  const categoryOptions = useMemo(() => {
    const unique = Array.from(
      new Set(items.map(item => item.category).filter(Boolean))
    );

    if (!unique.includes(RESIN_CATEGORY)) {
      unique.unshift(RESIN_CATEGORY);
    }

    if (!unique.includes(SUBSTRATE_CATEGORY)) {
      unique.push(SUBSTRATE_CATEGORY);
    }

    if (RESIN_FOCUS_ONLY) {
      return [
        { value: RESIN_CATEGORY, label: RESIN_CATEGORY },
        { value: SUBSTRATE_CATEGORY, label: SUBSTRATE_CATEGORY },
      ];
    }

    return unique
      .sort((a, b) => a.localeCompare(b))
      .map(value => ({ value, label: value }));
  }, [items]);

  const resinCatDescOptions = useMemo(() => {
    const hasUnmapped = items.some(
      item => item.category === RESIN_CATEGORY && !item.oracle_cat_desc
    );

    if (activeResinTaxonomyCategories.length) {
      const options = activeResinTaxonomyCategories.map((row) => ({
        value: row.display_name,
        label: row.display_name,
      }));
      if (hasUnmapped) {
        options.push({ value: UNMAPPED_RESIN_CATDESC, label: 'Unmapped' });
      }
      return options;
    }

    const unique = Array.from(
      new Set(
        items
          .filter(item => item.category === RESIN_CATEGORY && item.oracle_cat_desc)
          .map(item => item.oracle_cat_desc)
      )
    );

    const options = unique
      .sort((a, b) => a.localeCompare(b))
      .map(value => ({ value, label: value }));

    if (hasUnmapped) {
      options.push({ value: UNMAPPED_RESIN_CATDESC, label: 'Unmapped' });
    }

    return options;
  }, [items, activeResinTaxonomyCategories]);

  const substrateCatDescOptions = useMemo(() => (
    activeSubstrateTaxonomyCategories.length
      ? activeSubstrateTaxonomyCategories.map((row) => ({ value: row.display_name, label: row.display_name }))
      : SUBSTRATE_EXCEL_TYPES.map((value) => ({ value, label: value }))
  ), [activeSubstrateTaxonomyCategories]);

  const substrateCategoryDescriptionOptions = useMemo(() => {
    if (filters.category !== SUBSTRATE_CATEGORY) return [];
    if (!filters.cat_desc) return [];

    const taxonomyRows = substrateSubcategoriesByCategoryName[normalizeName(filters.cat_desc)] || [];
    if (taxonomyRows.length) {
      return taxonomyRows.map((row) => ({ value: row.display_name, label: row.display_name }));
    }

    return getCategoryDescriptionsForSubstrate(filters.cat_desc)
      .map((value) => ({ value, label: value }));
  }, [filters.category, filters.cat_desc, substrateSubcategoriesByCategoryName, normalizeName]);

  const substrateCatalogItems = useMemo(() => {
    if (activeSubstrateTaxonomySubcategories.length) {
      return activeSubstrateTaxonomySubcategories.map((row) => {
        const categoryName = row.category_name || 'Substrate';
        const appearance = row.display_name;
        const id = `substrate-taxonomy-${row.id}`;
        const draft = substrateDrafts[substrateDraftKey(categoryName, appearance)] || substrateDrafts[id] || {};
        const defaultDensity = getSubstrateDensityDefault(categoryName);
        const rowContext = {
          category: SUBSTRATE_CATEGORY,
          oracle_cat_desc: categoryName,
          appearance,
          taxonomy_category_key: row.category_key,
        };
        const isAluSubstrate = isAluSubstrateRecord(rowContext);
        const aluDefaults = isAluSubstrate ? getAluSmartDefaults(rowContext) : {};

        return {
          id,
          category: SUBSTRATE_CATEGORY,
          taxonomy_category_id: row.category_id,
          taxonomy_subcategory_id: row.id,
          taxonomy_category_key: row.category_key,
          taxonomy_subcategory_key: row.internal_key,
          oracle_cat_desc: categoryName,
          appearance,
          item_code: `SUB-${String(row.category_key || categoryName).toUpperCase().replace(/[^A-Z0-9]+/g, '_')}-${String(row.internal_key || appearance).toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 24)}`,
          item_name: `${categoryName} - ${appearance}`,
          item_type: 'semi_laminated',
          base_uom: 'KG',
          supplier_name: isAluSubstrate ? ALU_DEFAULT_SUPPLIER : (draft.supplier_name ?? null),
          resin_type: isAluSubstrate ? ALU_DEFAULT_RESIN_TYPE : (draft.resin_type ?? null),
          alloy_code: isAluSubstrate ? ALU_DEFAULT_ALLOY : (draft.alloy_code ?? null),
          density_g_cm3: draft.density_g_cm3 ?? aluDefaults.density_g_cm3 ?? defaultDensity,
          solid_pct: draft.solid_pct ?? aluDefaults.solid_pct ?? 100,
          micron_thickness: draft.micron_thickness ?? aluDefaults.micron_thickness ?? null,
          width_mm: draft.width_mm ?? aluDefaults.width_mm ?? null,
          yield_m2_per_kg: draft.yield_m2_per_kg ?? aluDefaults.yield_m2_per_kg ?? null,
          roll_length_m: draft.roll_length_m ?? aluDefaults.roll_length_m ?? null,
          core_diameter_mm: draft.core_diameter_mm ?? aluDefaults.core_diameter_mm ?? null,
          market_ref_price: draft.market_ref_price ?? null,
          market_price_date: draft.market_price_date ?? null,
          mrp_type: draft.mrp_type ?? 'PD',
          reorder_point: draft.reorder_point ?? null,
          safety_stock_kg: draft.safety_stock_kg ?? null,
          planned_lead_time_days: draft.planned_lead_time_days ?? null,
        };
      });
    }

    return SUBSTRATE_EXCEL_BUCKETS.map((row) => {
      const id = `substrate-${normalizeToken(row.substrate)}-${normalizeToken(row.categoryDescription)}`;
      const draft = substrateDrafts[substrateDraftKey(row.substrate, row.categoryDescription)] || substrateDrafts[id] || {};
      const defaultDensity = getSubstrateDensityDefault(row.substrate);
      const rowContext = {
        category: SUBSTRATE_CATEGORY,
        oracle_cat_desc: row.substrate,
        appearance: row.categoryDescription,
      };
      const isAluSubstrate = isAluSubstrateRecord(rowContext);
      const aluDefaults = isAluSubstrate
        ? getAluSmartDefaults(rowContext)
        : {};
      return {
        id,
        category: SUBSTRATE_CATEGORY,
        oracle_cat_desc: row.substrate,
        appearance: row.categoryDescription,
        item_code: `SUB-${String(row.substrate).toUpperCase().replace(/[^A-Z0-9]+/g, '_')}-${String(row.categoryDescription).toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 24)}`,
        item_name: `${row.substrate} - ${row.categoryDescription}`,
        item_type: 'semi_laminated',
        base_uom: 'KG',
        supplier_name: isAluSubstrate ? ALU_DEFAULT_SUPPLIER : (draft.supplier_name ?? null),
        resin_type: isAluSubstrate ? ALU_DEFAULT_RESIN_TYPE : (draft.resin_type ?? null),
        alloy_code: isAluSubstrate ? ALU_DEFAULT_ALLOY : (draft.alloy_code ?? null),
        density_g_cm3: draft.density_g_cm3 ?? aluDefaults.density_g_cm3 ?? defaultDensity,
        solid_pct: draft.solid_pct ?? aluDefaults.solid_pct ?? 100,
        micron_thickness: draft.micron_thickness ?? aluDefaults.micron_thickness ?? null,
        width_mm: draft.width_mm ?? aluDefaults.width_mm ?? null,
        yield_m2_per_kg: draft.yield_m2_per_kg ?? aluDefaults.yield_m2_per_kg ?? null,
        roll_length_m: draft.roll_length_m ?? aluDefaults.roll_length_m ?? null,
        core_diameter_mm: draft.core_diameter_mm ?? aluDefaults.core_diameter_mm ?? null,
        market_ref_price: draft.market_ref_price ?? null,
        market_price_date: draft.market_price_date ?? null,
        mrp_type: draft.mrp_type ?? 'PD',
        reorder_point: draft.reorder_point ?? null,
        safety_stock_kg: draft.safety_stock_kg ?? null,
        planned_lead_time_days: draft.planned_lead_time_days ?? null,
      };
    });
  }, [substrateDrafts, activeSubstrateTaxonomySubcategories]);

  const substrateAssignedFilmRowsByBucket = useMemo(() => {
    const byBucket = {};
    substrateCatalogItems.forEach((row) => {
      byBucket[substrateBucketKey(row.oracle_cat_desc, row.appearance)] = [];
    });

    const seenCodes = new Set();
    rmFilmRows.forEach((row) => {
      const code = String(row.item_code || '').trim();
      if (!code || seenCodes.has(code)) return;
      seenCodes.add(code);

      const mappedFromTaxonomy = substrateMappingByItemKey.get(normalizeToken(code));
      const assigned = mappedFromTaxonomy
        ? {
          cat_desc: mappedFromTaxonomy.category_name,
          appearance: mappedFromTaxonomy.subcategory_name || '',
        }
        : getSubstrateBucketForFilm(row);
      if (!assigned) return;

      const bucket = substrateBucketKey(assigned.cat_desc, assigned.appearance);
      if (!byBucket[bucket]) return;
      byBucket[bucket].push({
        ...row,
        mapped_substrate: assigned.cat_desc || row.mapped_substrate,
        mapped_category_description: assigned.appearance || row.mapped_category_description,
      });
    });

    Object.values(byBucket).forEach((rows) => {
      rows.sort((a, b) => String(a.item_code || '').localeCompare(String(b.item_code || '')));
    });

    return byBucket;
  }, [rmFilmRows, substrateCatalogItems, substrateMappingByItemKey]);

  const substrateDefaultMappedCounts = useMemo(() => {
    const counts = {};
    substrateCatalogItems.forEach((row) => {
      const bucket = substrateBucketKey(row.oracle_cat_desc, row.appearance);
      counts[String(row.id)] = (substrateAssignedFilmRowsByBucket[bucket] || []).length;
    });
    return counts;
  }, [substrateCatalogItems, substrateAssignedFilmRowsByBucket]);

  // ─── Enrich substrate items with aggregated film-row prices ───────────────
  const enrichedSubstrateCatalogItems = useMemo(() => (
    substrateCatalogItems.map((item) => {
      const bucket = substrateBucketKey(item.oracle_cat_desc, item.appearance);
      const filmRows = substrateAssignedFilmRowsByBucket[bucket] || [];

      let totalStockQty = 0;
      let totalStockVal = 0;
      let totalOrderQty = 0;
      let totalOrderVal = 0;

      filmRows.forEach((row) => {
        const sq = Number(row.stock_qty) || 0;
        const oq = Number(row.order_qty) || 0;
        const sc = Number(row.stock_cost_wa) || 0;
        const oc = Number(row.purchase_cost_wa) || 0;
        if (sq > 0 && sc > 0) { totalStockQty += sq; totalStockVal += sq * sc; }
        if (oq > 0 && oc > 0) { totalOrderQty += oq; totalOrderVal += oq * oc; }
      });

      return {
        ...item,
        stock_price: totalStockQty > 0 ? Number((totalStockVal / totalStockQty).toFixed(4)) : null,
        on_order_price: totalOrderQty > 0 ? Number((totalOrderVal / totalOrderQty).toFixed(4)) : null,
        stock_qty: totalStockQty,
        order_qty: totalOrderQty,
      };
    })
  ), [substrateCatalogItems, substrateAssignedFilmRowsByBucket]);

  const unmappedFilmRows = useMemo(() => {
    if (substrateMappingByItemKey.size > 0) {
      return rmFilmRows
        .filter((row) => !substrateMappingByItemKey.has(normalizeToken(row.item_code)))
        .slice()
        .sort((a, b) => String(a.item_name || '').localeCompare(String(b.item_name || '')));
    }

    return rmFilmRows
      .filter((row) => !normalizeToken(row.mapped_substrate))
      .slice()
      .sort((a, b) => String(a.item_name || '').localeCompare(String(b.item_name || '')));
  }, [rmFilmRows, substrateMappingByItemKey]);

  const unmappedFilmColumns = useMemo(() => ([
    {
      title: 'Item Code',
      dataIndex: 'item_code',
      width: 170,
      fixed: 'left',
      render: (v) => <Text code style={{ fontSize: 11 }}>{v || '—'}</Text>,
    },
    {
      title: 'Item Description',
      dataIndex: 'item_name',
      width: 320,
      render: (v) => v || '—',
    },
    {
      title: 'Source Cat. Description',
      dataIndex: 'cat_desc',
      width: 200,
      render: (v) => v || '—',
    },
    {
      title: 'Type',
      dataIndex: 'type',
      width: 180,
      render: (v) => v || '—',
    },
    {
      title: 'Standards',
      dataIndex: 'standards',
      width: 140,
      render: (v) => v || '—',
    },
    {
      title: 'Sizes',
      dataIndex: 'sizes',
      width: 130,
      render: (v) => v || '—',
    },
    {
      title: 'Weights',
      dataIndex: 'weights',
      width: 120,
      render: (v) => v || '—',
    },
    {
      title: 'Stock Qty',
      dataIndex: 'stock_qty',
      width: 120,
      align: 'right',
      render: (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }),
    },
    {
      title: 'On Order Qty',
      dataIndex: 'order_qty',
      width: 130,
      align: 'right',
      render: (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }),
    },
    {
      title: 'Stock WA',
      dataIndex: 'stock_cost_wa',
      width: 130,
      align: 'right',
      render: (v) => renderCurrency(v, 4),
    },
    {
      title: 'On Order WA',
      dataIndex: 'purchase_cost_wa',
      width: 140,
      align: 'right',
      render: (v) => renderCurrency(v, 4),
    },
  ]), [renderCurrency]);

  const getMappedSubstratesCount = useCallback((record) => {
    const bucket = substrateBucketKey(record.oracle_cat_desc, record.appearance);
    const allowedIds = new Set((substrateAssignedFilmRowsByBucket[bucket] || []).map((row) => String(row.id)));
    const draft = getSubstrateDraftFromStore(substrateDrafts, record);

    if (draft && (
      Object.prototype.hasOwnProperty.call(draft, 'mappedFilmIds')
      || Object.prototype.hasOwnProperty.call(draft, 'mappedMaterialKeys')
    )) {
      return resolveDraftMappedFilmIds(draft, substrateAssignedFilmRowsByBucket[bucket] || [])
        .filter((id) => allowedIds.has(id)).length;
    }

    return substrateDefaultMappedCounts[String(record.id)] || 0;
  }, [substrateDrafts, substrateDefaultMappedCounts, substrateAssignedFilmRowsByBucket]);

  const getMappedFilmRows = useCallback((record) => {
    if (!record || record.category !== SUBSTRATE_CATEGORY) return [];

    const bucket = substrateBucketKey(record.oracle_cat_desc, record.appearance);
    const candidates = substrateAssignedFilmRowsByBucket[bucket] || [];
    const draft = getSubstrateDraftFromStore(substrateDrafts, record);

    if (draft && (
      Object.prototype.hasOwnProperty.call(draft, 'mappedFilmIds')
      || Object.prototype.hasOwnProperty.call(draft, 'mappedMaterialKeys')
    )) {
      const selectedIds = new Set(resolveDraftMappedFilmIds(draft, candidates));
      return candidates.filter((row) => selectedIds.has(String(row.id)));
    }

    return candidates;
  }, [substrateAssignedFilmRowsByBucket, substrateDrafts]);

  const substrateMappedFilmColumns = useMemo(() => ([
    {
      title: 'Item Code',
      dataIndex: 'item_code',
      width: 96,
      ellipsis: true,
      render: (v) => <Text code style={{ fontSize: 11 }}>{v || '—'}</Text>,
    },
    {
      title: 'Item Name',
      dataIndex: 'item_name',
      width: 190,
      ellipsis: true,
      render: (v) => v || '—',
    },
    {
      title: 'Type',
      dataIndex: 'type',
      width: 130,
      responsive: ['md'],
      ellipsis: true,
      render: (v) => v || '—',
    },
    {
      title: 'Substrate',
      dataIndex: 'mapped_substrate',
      width: 92,
      responsive: ['sm'],
      ellipsis: true,
      render: (v) => v || '—',
    },
    {
      title: 'Subcategory',
      dataIndex: 'mapped_category_description',
      width: 140,
      responsive: ['md'],
      ellipsis: true,
      render: (v, r) => v || r.cat_desc || '—',
    },
    {
      title: 'Standards',
      dataIndex: 'standards',
      width: 80,
      responsive: ['lg'],
      ellipsis: true,
      render: (v) => v || '—',
    },
    {
      title: 'Sizes',
      dataIndex: 'sizes',
      width: 72,
      responsive: ['lg'],
      ellipsis: true,
      render: (v) => v || '—',
    },
    {
      title: 'Weights',
      dataIndex: 'weights',
      width: 72,
      responsive: ['lg'],
      ellipsis: true,
      render: (v) => v || '—',
    },
    {
      title: 'Stock Qty',
      dataIndex: 'stock_qty',
      width: 88,
      responsive: ['sm'],
      align: 'right',
      render: (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }),
    },
    {
      title: 'On Order Qty',
      dataIndex: 'order_qty',
      width: 98,
      responsive: ['md'],
      align: 'right',
      render: (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }),
    },
    {
      title: 'Stock WA',
      dataIndex: 'stock_cost_wa',
      width: 98,
      responsive: ['lg'],
      align: 'right',
      render: (v) => renderCurrency(v, 4),
    },
    {
      title: 'On Order WA',
      dataIndex: 'purchase_cost_wa',
      width: 102,
      responsive: ['xl'],
      align: 'right',
      render: (v) => renderCurrency(v, 4),
    },
  ]), [renderCurrency]);

  const filmCandidateItems = useMemo(() => {
    if (!editingItem || editingItem.category !== SUBSTRATE_CATEGORY) return [];

    if (activeSubstrateTaxonomySubcategories.length) {
      return rmFilmRows;
    }

    const bucket = substrateBucketKey(editingItem.oracle_cat_desc, editingItem.appearance);
    return substrateAssignedFilmRowsByBucket[bucket] || [];
  }, [editingItem, substrateAssignedFilmRowsByBucket, activeSubstrateTaxonomySubcategories, rmFilmRows]);

  const selectedSubstrateMaterialKeys = useMemo(() => {
    if (!filmCandidateItems.length || !selectedSubstrateFilmIds.length) return [];

    const selectedIds = new Set(selectedSubstrateFilmIds.map((id) => String(id)));
    const keys = filmCandidateItems
      .filter((row) => selectedIds.has(String(row.id)))
      .map((row) => String(row.item_code || '').trim().toLowerCase())
      .filter(Boolean);

    return Array.from(new Set(keys)).sort();
  }, [filmCandidateItems, selectedSubstrateFilmIds]);

  const substrateParamCards = useMemo(() => {
    const params = substrateProfile?.spec_params || {};
    const meta = substrateProfile?.param_meta || {};

    return Object.keys(params)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => {
        const fallback = fallbackSubstrateParamMeta(key);
        const entry = meta[key] || {};
        const decimals = Number.isFinite(Number(entry.decimals))
          ? Number(entry.decimals)
          : fallback.decimals;

        return {
          key,
          label: entry.label || fallback.label,
          unit: entry.unit != null ? entry.unit : fallback.unit,
          decimals,
          value: params[key],
        };
      });
  }, [substrateProfile]);

  const substrateSpecColumns = useMemo(() => ([
    {
      title: 'Item Code',
      dataIndex: 'mainitem',
      width: 170,
      render: (v, row) => <Text code style={{ fontSize: 11 }}>{v || row.material_key || '—'}</Text>,
    },
    {
      title: 'Description',
      dataIndex: 'maindescription',
      width: 260,
      ellipsis: true,
      render: (v) => v || '—',
    },
    {
      title: 'Supplier',
      dataIndex: 'supplier_name',
      width: 150,
      ellipsis: true,
      render: (v) => v || '—',
    },
    {
      title: 'Stock Qty',
      dataIndex: 'stock_qty',
      width: 110,
      align: 'right',
      render: (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }),
    },
    {
      title: 'On Order Qty',
      dataIndex: 'order_qty',
      width: 120,
      align: 'right',
      render: (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }),
    },
    {
      title: 'Stock WA',
      dataIndex: 'stock_price_wa',
      width: 120,
      align: 'right',
      render: (v) => renderCurrency(v, 4),
    },
    {
      title: 'On Order WA',
      dataIndex: 'on_order_price_wa',
      width: 130,
      align: 'right',
      render: (v) => renderCurrency(v, 4),
    },
    {
      title: 'Profile',
      dataIndex: 'parameter_profile',
      width: 140,
      render: (v) => v || '—',
    },
  ]), [renderCurrency]);

  const filmCandidateMeta = useMemo(() => {
    const typeSet = new Set();
    filmCandidateItems.forEach((row) => {
      const type = normalizeToken(row.type);
      if (type) typeSet.add(type);
    });
    return {
      hasMixedType: typeSet.size > 1,
    };
  }, [filmCandidateItems]);

  const filmMappingColumns = useMemo(() => {
    const cols = [
      { title: 'Item Code', dataIndex: 'item_code', width: 150, render: (v) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
      { title: 'Item Name', dataIndex: 'item_name', width: 360 },
    ];

    if (filmCandidateMeta.hasMixedType) {
      cols.push({ title: 'Type', dataIndex: 'type', width: 210, render: (v) => v || '—' });
    }

    cols.push(
      { title: 'Stock Qty', dataIndex: 'stock_qty', width: 110, align: 'right', render: (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }) },
      { title: 'On Order Qty', dataIndex: 'order_qty', width: 120, align: 'right', render: (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }) }
    );

    return cols;
  }, [filmCandidateMeta.hasMixedType]);

  useEffect(() => {
    if (!editingItem || editingItem.category !== SUBSTRATE_CATEGORY) return;

    const draft = getSubstrateDraftFromStore(substrateDrafts, editingItem);
    if (draft && (
      Object.prototype.hasOwnProperty.call(draft, 'mappedFilmIds')
      || Object.prototype.hasOwnProperty.call(draft, 'mappedMaterialKeys')
    )) {
      setSelectedSubstrateFilmIds(resolveDraftMappedFilmIds(draft, filmCandidateItems));
      return;
    }

    const mappedRows = getMappedFilmRows(editingItem);
    if (mappedRows.length) {
      setSelectedSubstrateFilmIds(mappedRows.map((row) => String(row.id)));
      return;
    }

    setSelectedSubstrateFilmIds([]);
  }, [editingItem, filmCandidateItems, substrateDrafts, getMappedFilmRows]);

  useEffect(() => {
    if (!editingItem || editingItem.category !== SUBSTRATE_CATEGORY) return;

    if (!selectedSubstrateMaterialKeys.length) {
      setSubstrateProfile(null);
      setSubstrateProfileLoading(false);
      return;
    }

    fetchSubstrateProfile(editingItem, selectedSubstrateMaterialKeys);
  }, [editingItem, selectedSubstrateMaterialKeys, fetchSubstrateProfile]);

  // ─── Client-side filter by category + cat_desc ─────────────────────────────────
  const sourceItems = filters.category === SUBSTRATE_CATEGORY ? enrichedSubstrateCatalogItems : items;

  const displayItems = useMemo(() => {
    const filtered = sourceItems
      .map((item) => ({
        ...item,
        display_cat_desc: item.category === RESIN_CATEGORY
          ? resolveResinCategoryDisplay(item)
          : (item.oracle_cat_desc || ''),
      }))
      .filter((item) => {
        if (RESIN_FOCUS_ONLY && ![RESIN_CATEGORY, SUBSTRATE_CATEGORY].includes(item.category)) return false;
        if (filters.category && item.category !== filters.category) return false;
        if (filters.item_type && item.item_type !== filters.item_type) return false;

        if (filters.search) {
          const needle = String(filters.search).toLowerCase();
          const haystack = [item.item_code, item.item_name, item.display_cat_desc || item.oracle_cat_desc, item.appearance]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(needle)) return false;
        }

        if (filters.category === RESIN_CATEGORY) {
          const resinCatDesc = item.display_cat_desc || item.oracle_cat_desc || '';

          if (filters.cat_desc === UNMAPPED_RESIN_CATDESC) {
            if (resinCatDesc) return false;
          } else if (filters.cat_desc && normalizeName(resinCatDesc) !== normalizeName(filters.cat_desc)) {
            return false;
          }

          if (!filters.cat_desc && !resinCatDesc) {
            return false;
          }
        }

        if (filters.category === SUBSTRATE_CATEGORY) {
          if (filters.cat_desc && item.oracle_cat_desc !== filters.cat_desc) {
            return false;
          }
          if (filters.cat_desc_detail && item.appearance !== filters.cat_desc_detail) {
            return false;
          }
        }

        return true;
      });

    const lower = (v) => String(v || '').toLowerCase();

    filtered.sort((a, b) => {
      if (filters.category === SUBSTRATE_CATEGORY) {
        const catCmp = lower(a.oracle_cat_desc).localeCompare(lower(b.oracle_cat_desc));
        if (catCmp !== 0) return catCmp;

        const descCmp = lower(a.appearance).localeCompare(lower(b.appearance));
        if (descCmp !== 0) return descCmp;

        return lower(a.item_name).localeCompare(lower(b.item_name));
      }

      if (filters.category === RESIN_CATEGORY) {
        const catCmp = lower(a.display_cat_desc || a.oracle_cat_desc).localeCompare(lower(b.display_cat_desc || b.oracle_cat_desc));
        if (catCmp !== 0) return catCmp;

        const nameCmp = lower(a.item_name).localeCompare(lower(b.item_name));
        if (nameCmp !== 0) return nameCmp;

        return lower(a.item_code).localeCompare(lower(b.item_code));
      }

      const categoryCmp = lower(a.category).localeCompare(lower(b.category));
      if (categoryCmp !== 0) return categoryCmp;

      const catDescCmp = lower(a.display_cat_desc || a.oracle_cat_desc).localeCompare(lower(b.display_cat_desc || b.oracle_cat_desc));
      if (catDescCmp !== 0) return catDescCmp;

      const nameCmp = lower(a.item_name).localeCompare(lower(b.item_name));
      if (nameCmp !== 0) return nameCmp;

      return lower(a.item_code).localeCompare(lower(b.item_code));
    });

    return filtered;
  }, [
    sourceItems,
    filters.category,
    filters.item_type,
    filters.search,
    filters.cat_desc,
    filters.cat_desc_detail,
    normalizeName,
    resolveResinCategoryDisplay,
  ]);

  const categoryTotalItems = useMemo(() => {
    return sourceItems.filter((item) => {
      if (RESIN_FOCUS_ONLY && ![RESIN_CATEGORY, SUBSTRATE_CATEGORY].includes(item.category)) return false;
      if (filters.category && item.category !== filters.category) return false;

      if (filters.category === RESIN_CATEGORY && !resolveResinCategoryDisplay(item)) {
        return false;
      }

      return true;
    });
  }, [sourceItems, filters.category, resolveResinCategoryDisplay]);

  const activeQuickFiltersCount = useMemo(() => {
    return [filters.cat_desc, filters.cat_desc_detail, filters.item_type, filters.search].filter(Boolean).length;
  }, [filters.cat_desc, filters.cat_desc_detail, filters.item_type, filters.search]);

  useEffect(() => {
    if (filters.category !== SUBSTRATE_CATEGORY) return;
    if (rmFilmRows.length || rmFilmLoading) return;
    fetchRmFilmRows();
  }, [filters.category, rmFilmRows.length, rmFilmLoading, fetchRmFilmRows]);

  return (
    <div>
      {/* Category filter pills */}
      <div style={{ marginBottom: 10 }}>
        <Space size={[6, 6]} wrap>
          {[
            ...(RESIN_FOCUS_ONLY ? [] : [{ value: null, label: 'All' }]),
            ...categoryOptions,
          ].map(c => (
            <Button
              key={c.label}
              type={filters.category === c.value ? 'primary' : 'default'}
              shape="round"
              size="small"
              onClick={() => setFilters(f => ({
                ...f,
                category: c.value,
                cat_desc: null,
                cat_desc_detail: null,
                item_type: null,
              }))}
            >{c.label}</Button>
          ))}
        </Space>
      </div>
      {/* Category-specific cat-desc sub-filter pills */}
      {[RESIN_CATEGORY, SUBSTRATE_CATEGORY].includes(filters.category) && (
        <div style={{ marginBottom: 10 }}>
          <Space size={[6, 6]} wrap>
            {[
              { value: null, label: 'All' },
              ...(filters.category === RESIN_CATEGORY ? resinCatDescOptions : substrateCatDescOptions),
            ].map(c => (
              <Button
                key={c.label}
                type={filters.cat_desc === c.value ? 'primary' : 'default'}
                shape="round"
                size="small"
                onClick={() => setFilters(f => ({ ...f, cat_desc: c.value, cat_desc_detail: null }))}
              >{c.label}</Button>
            ))}
          </Space>
        </div>
      )}
      {filters.category === SUBSTRATE_CATEGORY && filters.cat_desc && substrateCategoryDescriptionOptions.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <Space size={[6, 6]} wrap>
            {[
              { value: null, label: 'All' },
              ...substrateCategoryDescriptionOptions,
            ].map((c) => (
              <Button
                key={c.label}
                type={filters.cat_desc_detail === c.value ? 'primary' : 'default'}
                shape="round"
                size="small"
                onClick={() => setFilters((f) => ({ ...f, cat_desc_detail: c.value }))}
              >{c.label}</Button>
            ))}
          </Space>
        </div>
      )}
      {/* Toolbar */}
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="Filter by type"
          allowClear
          style={{ width: 180 }}
          options={ITEM_TYPES}
          value={filters.item_type}
          disabled={filters.category === SUBSTRATE_CATEGORY}
          onChange={v => setFilters(f => ({ ...f, item_type: v }))}
        />
        <Input.Search
          placeholder="Search items..."
          style={{ width: 220 }}
          allowClear
          onSearch={v => setFilters(f => ({ ...f, search: v }))}
        />
        <Button icon={<ReloadOutlined />} onClick={fetchItems}>Refresh</Button>
        <Button icon={<DollarOutlined />} onClick={() => setBulkModalOpen(true)}>
          Update Market Prices
        </Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={filters.category === SUBSTRATE_CATEGORY}>
          Add Item
        </Button>
        {[RESIN_CATEGORY, SUBSTRATE_CATEGORY].includes(filters.category) && (
          <>
            <Button onClick={openTaxonomyCreateCategory}>Add Category</Button>
            <Button
              onClick={openTaxonomyRenameCategory}
              disabled={filters.category === SUBSTRATE_CATEGORY ? !selectedSubstrateCategoryRecord : !selectedResinCategoryRecord}
            >
              Rename Category
            </Button>
            <Popconfirm
              title="Delete selected category?"
              description={filters.category === SUBSTRATE_CATEGORY
                ? 'This deactivates the selected category and its active subcategories.'
                : 'This deactivates the selected category.'}
              okText="Delete"
              okButtonProps={{ danger: true }}
              onConfirm={handleDeleteTaxonomyCategory}
            >
              <Button
                danger
                disabled={filters.category === SUBSTRATE_CATEGORY ? !selectedSubstrateCategoryRecord : !selectedResinCategoryRecord}
              >
                Delete Category
              </Button>
            </Popconfirm>
            {filters.category === SUBSTRATE_CATEGORY && (
              <>
                <Button onClick={openTaxonomyCreateSubcategory}>Add Subcategory</Button>
                <Button onClick={openTaxonomyRenameSubcategory} disabled={!selectedSubstrateSubcategoryRecord}>
                  Rename Subcategory
                </Button>
              </>
            )}
          </>
        )}
        {filters.category === SUBSTRATE_CATEGORY && (
          <>
            <Button onClick={openUnmappedSubstratesAudit}>
              Unmapped Substrates Audit
            </Button>
            <Tag color={unmappedFilmRows.length > 0 ? 'error' : 'success'}>
              {unmappedFilmRows.length} unmapped substrate{unmappedFilmRows.length !== 1 ? 's' : ''}
            </Tag>
          </>
        )}
        <Tag color="processing">{displayItems.length} shown</Tag>
        <Tag color="blue">{categoryTotalItems.length} in {filters.category || 'All'}</Tag>
        {activeQuickFiltersCount > 0 && (
          <Tag>{activeQuickFiltersCount} active filter{activeQuickFiltersCount > 1 ? 's' : ''}</Tag>
        )}
      </Space>

      {/* Table */}
      <Table
        dataSource={displayItems}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        tableLayout="fixed"
        scroll={{ x: 1050 }}
        expandable={{ expandedRowRender }}
        pagination={{ pageSize: 25, showSizeChanger: true, showTotal: (t) => `${t} items` }}
      />

      <Modal
        title={`Unmapped Substrates Audit (${unmappedFilmRows.length})`}
        open={unmappedAuditOpen}
        onCancel={() => setUnmappedAuditOpen(false)}
        width={1240}
        destroyOnHidden
        footer={[
          <Button key="refresh" onClick={fetchRmFilmRows} loading={rmFilmLoading}>Refresh</Button>,
          <Button key="close" type="primary" onClick={() => setUnmappedAuditOpen(false)}>Close</Button>,
        ]}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 10 }}>
          These substrate rows do not match any mapping in the Excel sheet by Item Description (MAINDESCRIPTION).
        </Text>

        <Table
          dataSource={unmappedFilmRows}
          rowKey="id"
          size="small"
          loading={rmFilmLoading}
          columns={unmappedFilmColumns}
          scroll={{ x: 1900, y: 460 }}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} unmapped substrates` }}
          locale={{ emptyText: 'All substrate rows are mapped from the Excel source.' }}
        />
      </Modal>

      <Modal
        title={`${taxonomyModal.mode === 'create' ? 'Add' : 'Rename'} ${taxonomyModal.level === 'category' ? 'Category' : 'Subcategory'}`}
        open={taxonomyModal.open}
        onOk={handleSaveTaxonomy}
        onCancel={() => {
          setTaxonomyModal((prev) => ({ ...prev, open: false, record: null }));
          taxonomyForm.resetFields();
        }}
        okText={taxonomyModal.mode === 'create' ? 'Create' : 'Save'}
        destroyOnHidden
      >
        <Form form={taxonomyForm} layout="vertical" size="small">
          {taxonomyModal.level === 'subcategory' && (
            <Form.Item
              name="category_id"
              label="Category"
              rules={[{ required: true, message: 'Category is required' }]}
            >
              <Select
                options={activeSubstrateTaxonomyCategories.map((row) => ({
                  value: row.id,
                  label: row.display_name,
                }))}
                disabled={taxonomyModal.mode === 'rename'}
                placeholder="Select category"
              />
            </Form.Item>
          )}
          <Form.Item
            name="display_name"
            label={taxonomyModal.level === 'category' ? 'Category Name' : 'Subcategory Name'}
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input maxLength={220} placeholder="Enter name" />
          </Form.Item>
          <Form.Item name="sort_order" label="Sort Order" initialValue={100}>
            <InputNumber min={0} step={1} style={{ width: '100%' }} />
          </Form.Item>
          {taxonomyLoading && <Text type="secondary">Refreshing taxonomy...</Text>}
        </Form>
      </Modal>

      {/* Create/Edit Modal */}
      <Modal
        title={editingItem
          ? `Edit ${editingItem.category === RESIN_CATEGORY
            ? (editingItem.display_cat_desc || editingItem.oracle_cat_desc || editingItem.item_code)
            : editingItem.category === SUBSTRATE_CATEGORY
              ? `${editingItem.display_cat_desc || editingItem.oracle_cat_desc || 'Substrate'} / ${editingItem.appearance || '—'}`
              : editingItem.item_code}`
          : 'Add New Item'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => {
          setModalOpen(false);
          setEditingItem(null);
          form.resetFields();
          setResinProfile(null);
          setSubstrateProfile(null);
          setSelectedGradeIds([]);
          setSelectedSubstrateFilmIds([]);
        }}
        width={1100}
        style={{ top: 24, maxWidth: '96vw' }}
        okText={editingItem?.category === SUBSTRATE_CATEGORY ? 'Save Substrate Profile' : editingItem ? 'Update' : 'Create'}
        destroyOnHidden
        styles={{ body: { maxHeight: '78vh', overflowY: 'auto', overflowX: 'hidden' } }}
      >
        <Form form={form} layout="vertical" size="small">
          <Tabs items={[
            {
              key: 'general',
              label: 'General',
              children: (
                <>
                  {currentCategory === SUBSTRATE_CATEGORY ? (
                    <>
                      <Form.Item name="item_code" hidden><Input /></Form.Item>
                      <Form.Item name="item_name" hidden><Input /></Form.Item>
                      <Form.Item name="item_type" hidden><Input /></Form.Item>
                      <Form.Item name="base_uom" hidden><Input /></Form.Item>
                      <Form.Item name="category" hidden><Input /></Form.Item>
                      <Form.Item name="oracle_cat_desc" hidden><Input /></Form.Item>
                      <Form.Item name="appearance" hidden><Input /></Form.Item>

                      <div style={{ background: '#f6f8ff', border: '1px solid #d6e4ff', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 10 }}>
                          Substrate profile setup
                        </Text>
                        <Row gutter={24}>
                          <Col span={8}>
                            <div style={{ marginBottom: 4, fontSize: 11, color: 'rgba(0,0,0,.45)' }}>Category</div>
                            <div style={{ fontWeight: 600, fontSize: 16 }}>{editingItem?.display_cat_desc || editingItem?.oracle_cat_desc || '—'}</div>
                          </Col>
                          <Col span={10}>
                            <div style={{ marginBottom: 4, fontSize: 11, color: 'rgba(0,0,0,.45)' }}>Subcategory</div>
                            <div style={{ fontWeight: 500 }}>{editingItem?.appearance || '—'}</div>
                          </Col>
                          <Col span={6}>
                            <div style={{ marginBottom: 4, fontSize: 11, color: 'rgba(0,0,0,.45)' }}>Base UOM</div>
                            <div>{form.getFieldValue('base_uom') || 'KG'}</div>
                          </Col>
                        </Row>
                      </div>
                    </>
                  ) : currentCategory !== RESIN_CATEGORY ? (
                    <>
                      <Row gutter={16}>
                        <Col span={8}>
                          <Form.Item name="item_code" label="Item Code" rules={[{ required: true }]}> 
                            <Input disabled={!!editingItem} />
                          </Form.Item>
                        </Col>
                        <Col span={16}>
                          <Form.Item name="item_name" label="Item Name" rules={[{ required: true }]}> 
                            <Input />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={16}>
                        <Col span={8}>
                          <Form.Item name="category" label="Category">
                            <Select options={categoryOptions} allowClear placeholder="Select category" />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={16}>
                        <Col span={8}>
                          <Form.Item name="item_type" label="Type" rules={[{ required: true }]}> 
                            <Select options={ITEM_TYPES} />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name="subcategory" label="Subcategory">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name="grade_code" label="Grade Code">
                            <Input placeholder="e.g. FD-150, M2710" />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={16}>
                        <Col span={8}>
                          <Form.Item name="base_uom" label="Base UOM" initialValue="KG">
                            <Select options={[{ value: 'KG' }, { value: 'MTR' }, { value: 'PCS' }, { value: 'SQM' }]} />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name="product_group" label="Product Group">
                            <Input />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name="waste_pct" label="Waste %">
                            <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                      </Row>
                    </>
                  ) : (
                    <Spin spinning={fpLoading}>
                      <Form.Item name="item_code" hidden><Input /></Form.Item>
                      <Form.Item name="item_name" hidden><Input /></Form.Item>
                      <Form.Item name="item_type" hidden><Input /></Form.Item>
                      <Form.Item name="base_uom" hidden><Input /></Form.Item>
                      <Form.Item name="category" hidden><Input /></Form.Item>
                      <Form.Item name="oracle_cat_desc" hidden><Input /></Form.Item>
                      <div style={{ background: '#f6f8ff', border: '1px solid #d6e4ff', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 10 }}>Oracle ERP Reference — read only</Text>
                        <Row gutter={24}>
                          <Col span={5}>
                            <div style={{ marginBottom: 4, fontSize: 11, color: 'rgba(0,0,0,.45)' }}>Category Code</div>
                            <div style={{ fontWeight: 600, fontSize: 16 }}>{editingItem?.display_cat_desc || editingItem?.oracle_cat_desc || '—'}</div>
                          </Col>
                          <Col span={11}>
                            <div style={{ marginBottom: 4, fontSize: 11, color: 'rgba(0,0,0,.45)' }}>Item Name</div>
                            <div style={{ fontWeight: 500 }}>{fpAverages?.item_name_hint || editingItem?.display_cat_desc || editingItem?.oracle_cat_desc || '—'}</div>
                          </Col>
                          <Col span={4}>
                            <div style={{ marginBottom: 4, fontSize: 11, color: 'rgba(0,0,0,.45)' }}>Type</div>
                            <div>{fpAverages?.itemgroup || '—'}</div>
                          </Col>
                          <Col span={4}>
                            <div style={{ marginBottom: 4, fontSize: 11, color: 'rgba(0,0,0,.45)' }}>Base UOM</div>
                            <div>{fpAverages?.mainunit || 'KG'}</div>
                          </Col>
                        </Row>
                      </div>
                      <Row gutter={16}>
                        <Col span={8}>
                          <Form.Item name="waste_pct" label="Waste Factor (%)">
                            <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                      </Row>
                    </Spin>
                  )}
                </>
              ),
            },
            ...(currentCategory === RESIN_CATEGORY ? [
              {
                key: 'inventory',
                label: 'Inventory & Grades',
                children: (
                  <Spin spinning={resinProfileLoading}>
                    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                      {[
                        { label: 'Total Stock Qty', value: effectiveResinProfile?.inventory?.total_stock_qty, format: 'qty', color: '#1d39c4' },
                        { label: 'Stock Value', value: effectiveResinProfile?.inventory?.total_stock_val, format: 'currency', color: '#389e0d' },
                        { label: 'On Order Qty', value: effectiveResinProfile?.inventory?.total_order_qty, format: 'qty', color: '#d46b08' },
                        { label: 'Order Value', value: effectiveResinProfile?.inventory?.total_order_val, format: 'currency', color: '#d46b08' },
                        { label: 'Wtd Avg Density', value: effectiveResinProfile?.density_wa, format: 'density', color: '#722ed1', unit: 'g/cm³' },
                      ].map((kpi) => (
                        <Col xs={12} sm={12} md={8} lg={6} xl={4} key={kpi.label}>
                          <div style={{ background: '#f6f8ff', border: '1px solid #d6e4ff', borderRadius: 8, padding: '12px 10px', textAlign: 'center', minHeight: 112 }}>
                            <div style={{ fontSize: 11, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>{kpi.label}</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: kpi.color, lineHeight: 1.2, wordBreak: 'break-word' }}>
                              {kpi.value != null ? (
                                kpi.format === 'currency'
                                  ? renderCurrency(kpi.value)
                                  : kpi.format === 'qty'
                                    ? Number(kpi.value).toLocaleString(undefined, { maximumFractionDigits: 0 })
                                    : Number(kpi.value).toFixed(4)
                              ) : '—'}
                            </div>
                            {kpi.unit && <div style={{ fontSize: 10, color: 'rgba(0,0,0,.35)', marginTop: 2 }}>{kpi.unit}</div>}
                          </div>
                        </Col>
                      ))}
                    </Row>

                    <Row align="middle" justify="space-between" style={{ marginBottom: 8 }}>
                      <Col>
                        <Text strong style={{ fontSize: 13 }}>
                          Grades ({selectedResinGrades.length} selected / {allResinGrades.length} in TDS)
                        </Text>
                      </Col>
                      <Col>
                        <Space size={8}>
                          <Button
                            size="small"
                            onClick={() => setSelectedGradeIds(allResinGrades.map((grade) => String(grade.tds_id)))}
                            disabled={!allResinGrades.length}
                          >
                            Select All
                          </Button>
                          <Button
                            size="small"
                            onClick={() => setSelectedGradeIds([])}
                            disabled={!selectedGradeIds.length}
                          >
                            Clear
                          </Button>
                        </Space>
                      </Col>
                    </Row>

                    {!selectedResinGrades.length && (
                      <Text type="warning" style={{ display: 'block', marginBottom: 8 }}>
                        No grades selected. Inventory, pricing, and specs cards will show empty aggregates.
                      </Text>
                    )}

                    <Table
                      dataSource={allResinGrades}
                      rowKey={(row) => String(row.tds_id)}
                      size="small"
                      rowSelection={{
                        selectedRowKeys: selectedGradeIds,
                        onChange: (keys) => setSelectedGradeIds(keys.map((key) => String(key))),
                      }}
                      pagination={false}
                      scroll={{ x: 1020, y: 260 }}
                      columns={[
                        { title: 'Grade', dataIndex: 'brand_grade', width: 200 },
                        { title: 'Supplier', dataIndex: 'supplier_name', width: 130, render: (v) => v || '—' },
                        { title: 'Oracle Code', dataIndex: 'oracle_item_code', width: 180, render: (v) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                        { title: 'Unit', dataIndex: 'unit', width: 90, render: (v) => v || 'KG' },
                        { title: 'Stock Qty', dataIndex: 'stock_qty', width: 110, align: 'right', render: (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }) },
                        { title: 'Order Qty', dataIndex: 'order_qty', width: 110, align: 'right', render: (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }) },
                      ]}
                    />

                    <Form.Item name="density_g_cm3" hidden><InputNumber /></Form.Item>
                    <Form.Item name="micron_thickness" hidden><InputNumber /></Form.Item>
                    <Form.Item name="width_mm" hidden><InputNumber /></Form.Item>
                    <Form.Item name="solid_pct" hidden><InputNumber /></Form.Item>
                  </Spin>
                ),
              },
              {
                key: 'pricing',
                label: 'Pricing',
                children: (
                  <Spin spinning={resinProfileLoading}>
                    <div style={{ background: '#fafafa', border: '1px dashed #d9d9d9', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                      <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Pricing Helper</Text>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{PRICING_HELP.panel}</Text>
                    </div>

                    <Row gutter={16} style={{ marginBottom: 4 }}>
                      <Col span={8}>
                        <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: '10px 14px' }}>
                          <div style={{ fontSize: 11, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>Stock Price (WA) — Oracle</div>
                          <div style={{ fontSize: 18, fontWeight: 600, color: '#389e0d' }}>
                            {renderCurrency(effectiveResinProfile?.pricing?.stock_price_wa)}
                          </div>
                        </div>
                      </Col>
                      <Col span={8}>
                        <div style={{ background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 8, padding: '10px 14px' }}>
                          <div style={{ fontSize: 11, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>On Order (WA) — Oracle</div>
                          <div style={{ fontSize: 18, fontWeight: 600, color: '#d46b08' }}>
                            {renderCurrency(effectiveResinProfile?.pricing?.on_order_price_wa)}
                          </div>
                        </div>
                      </Col>
                      <Col span={8}>
                        <div style={{ background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 8, padding: '10px 14px' }}>
                          <div style={{ fontSize: 11, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>Combined (WA)</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#1d39c4' }}>
                            {renderCurrency(effectiveResinProfile?.pricing?.combined_price_wa)}
                          </div>
                        </div>
                      </Col>
                    </Row>

                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item name="market_ref_price" label="Market Price (user-set)" extra={PRICING_HELP.marketRef}>
                          <InputNumber min={0} step={0.01} prefix={<CurrencySymbol />} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="market_price_date" label="Market Price Date" extra={PRICING_HELP.marketDate}>
                          <Input type="date" />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Form.Item name="stock_price" hidden><InputNumber /></Form.Item>
                    <Form.Item name="on_order_price" hidden><InputNumber /></Form.Item>
                  </Spin>
                ),
              },
              {
                key: 'specs',
                label: 'Material Specs',
                children: (
                  <Spin spinning={resinProfileLoading}>
                    <Text type="secondary" style={{ fontSize: 11, marginBottom: 12, display: 'block' }}>
                      Stock-weighted averages across {effectiveResinProfile?.tds_grade_count ?? 0} selected TDS grade(s). Parameters with no TDS data yet show —
                    </Text>

                    <Row gutter={[12, 12]}>
                      {RESIN_SPEC_PARAMS.map((param) => {
                        const val = effectiveResinProfile?.tds_params?.[param.key];
                        return (
                          <Col xs={12} md={8} lg={6} key={param.key}>
                            <div style={{
                              background: val != null ? '#f6f8ff' : '#fafafa',
                              border: `1px solid ${val != null ? '#d6e4ff' : '#f0f0f0'}`,
                              borderRadius: 8,
                              padding: '10px 12px',
                              textAlign: 'center',
                              minHeight: 88,
                            }}>
                              <div style={{ fontSize: 11, color: 'rgba(0,0,0,.45)', marginBottom: 4, lineHeight: 1.2 }}>{param.label}</div>
                              <div style={{
                                fontSize: val != null ? 20 : 16,
                                fontWeight: 700,
                                color: val != null ? '#1d39c4' : '#d9d9d9',
                                lineHeight: 1,
                                fontFamily: 'monospace',
                              }}>
                                {val != null ? Number(val).toFixed(param.decimals) : '—'}
                              </div>
                              <div style={{ fontSize: 10, color: 'rgba(0,0,0,.35)', marginTop: 2 }}>{param.unit}</div>
                            </div>
                          </Col>
                        );
                      })}
                    </Row>

                    <Form.Item name="mfi" hidden><InputNumber /></Form.Item>
                    <Form.Item name="cof" hidden><InputNumber /></Form.Item>
                    <Form.Item name="sealing_temp_min" hidden><InputNumber /></Form.Item>
                    <Form.Item name="sealing_temp_max" hidden><InputNumber /></Form.Item>
                  </Spin>
                ),
              },
            ] : currentCategory === SUBSTRATE_CATEGORY ? [
              {
                key: 'substrate-inventory',
                label: 'Inventory & Grades',
                children: (
                  <Spin spinning={substrateProfileLoading || rmFilmLoading}>
                    <Text type="secondary" style={{ fontSize: 11, marginBottom: 12, display: 'block' }}>
                      Stock-weighted aggregation across selected mapped items. Each substrate uses its own parameter profile.
                    </Text>

                    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                      {[
                        { label: 'Mapped Specs', value: substrateProfile?.spec_count, format: 'count', color: '#1d39c4' },
                        { label: 'Total Stock Qty', value: substrateProfile?.inventory?.total_stock_qty, format: 'qty', color: '#1d39c4' },
                        { label: 'Stock Value', value: substrateProfile?.inventory?.total_stock_val, format: 'currency', color: '#389e0d' },
                        { label: 'On Order Qty', value: substrateProfile?.inventory?.total_order_qty, format: 'qty', color: '#d46b08' },
                        { label: 'Order Value', value: substrateProfile?.inventory?.total_order_val, format: 'currency', color: '#d46b08' },
                        { label: 'Wtd Avg Density', value: substrateProfile?.density_wa, format: 'density', color: '#722ed1', unit: 'g/cm³' },
                      ].map((kpi) => (
                        <Col xs={12} sm={12} md={8} lg={6} xl={4} key={kpi.label}>
                          <div style={{ background: '#f6f8ff', border: '1px solid #d6e4ff', borderRadius: 8, padding: '12px 10px', textAlign: 'center', minHeight: 112 }}>
                            <div style={{ fontSize: 11, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>{kpi.label}</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: kpi.color, lineHeight: 1.2, wordBreak: 'break-word' }}>
                              {kpi.value != null ? (
                                kpi.format === 'currency'
                                  ? renderCurrency(kpi.value)
                                  : kpi.format === 'qty'
                                    ? Number(kpi.value).toLocaleString(undefined, { maximumFractionDigits: 0 })
                                    : kpi.format === 'count'
                                      ? Number(kpi.value).toLocaleString(undefined, { maximumFractionDigits: 0 })
                                      : Number(kpi.value).toFixed(4)
                              ) : '—'}
                            </div>
                            {kpi.unit && <div style={{ fontSize: 10, color: 'rgba(0,0,0,.35)', marginTop: 2 }}>{kpi.unit}</div>}
                          </div>
                        </Col>
                      ))}
                    </Row>

                    <Row align="middle" justify="space-between" style={{ marginBottom: 8 }}>
                      <Col>
                        <Text strong style={{ fontSize: 13 }}>
                          Mapped Items ({selectedSubstrateFilmIds.length} selected / {filmCandidateItems.length} candidates)
                        </Text>
                      </Col>
                      <Col>
                        <Space size={8}>
                          <Button
                            size="small"
                            onClick={() => setSelectedSubstrateFilmIds(filmCandidateItems.map((row) => String(row.id)))}
                            disabled={!filmCandidateItems.length || rmFilmLoading}
                          >
                            Select All
                          </Button>
                          <Button
                            size="small"
                            onClick={() => setSelectedSubstrateFilmIds([])}
                            disabled={!selectedSubstrateFilmIds.length}
                          >
                            Clear
                          </Button>
                        </Space>
                      </Col>
                    </Row>

                    {!selectedSubstrateMaterialKeys.length && (
                      <Text type="warning" style={{ display: 'block', marginBottom: 8 }}>
                        No mapped items selected. Inventory, pricing, and specs cards will show empty aggregates.
                      </Text>
                    )}

                    <Table
                      dataSource={filmCandidateItems}
                      rowKey="id"
                      loading={rmFilmLoading}
                      size="small"
                      pagination={{ pageSize: 8 }}
                      scroll={{ x: 900, y: 260 }}
                      rowSelection={{
                        selectedRowKeys: selectedSubstrateFilmIds,
                        onChange: (keys) => setSelectedSubstrateFilmIds(keys.map((k) => String(k))),
                      }}
                      columns={filmMappingColumns}
                    />

                    {isEditingAluSubstrate && (
                      <Row gutter={16} style={{ marginTop: 14 }}>
                        <Col span={8}>
                          <Form.Item name="supplier_name" label="Supplier Name" extra="Fixed from approved Alu TDS profile.">
                            <Input disabled />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name="resin_type" label="Resin Type / Material" extra="Fixed as Aluminium for this substrate class.">
                            <Input disabled />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name="alloy_code" label="Alloy" extra="Locked to 1235 for all Alu foil stock.">
                            <Input disabled />
                          </Form.Item>
                        </Col>
                      </Row>
                    )}

                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item name="density_g_cm3" label="Density (g/cm³)">
                          <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="solid_pct" label="Solid %">
                          <InputNumber min={0} max={100} step={1} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>

                    {isEditingAluSubstrate && (
                      <>
                        <Row gutter={16}>
                          <Col span={8}>
                            <Form.Item name="micron_thickness" label="Thickness (µm)">
                              <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item name="width_mm" label="Width (mm)">
                              <InputNumber min={0} step={1} style={{ width: '100%' }} />
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item name="yield_m2_per_kg" label="Yield (m²/kg)">
                              <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                            </Form.Item>
                          </Col>
                        </Row>

                        <Row gutter={16}>
                          <Col span={8}>
                            <Form.Item name="roll_length_m" label="Roll Length (m)">
                              <InputNumber min={0} step={1} style={{ width: '100%' }} />
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item name="core_diameter_mm" label="Core Diameter (mm)">
                              <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
                            </Form.Item>
                          </Col>
                        </Row>
                      </>
                    )}

                    {!isEditingAluSubstrate && (
                      <>
                        <Form.Item name="supplier_name" hidden><Input /></Form.Item>
                        <Form.Item name="resin_type" hidden><Input /></Form.Item>
                        <Form.Item name="alloy_code" hidden><Input /></Form.Item>
                        <Form.Item name="micron_thickness" hidden><InputNumber /></Form.Item>
                        <Form.Item name="width_mm" hidden><InputNumber /></Form.Item>
                        <Form.Item name="yield_m2_per_kg" hidden><InputNumber /></Form.Item>
                        <Form.Item name="roll_length_m" hidden><InputNumber /></Form.Item>
                        <Form.Item name="core_diameter_mm" hidden><InputNumber /></Form.Item>
                      </>
                    )}

                    <Form.Item name="mfi" hidden><InputNumber /></Form.Item>
                    <Form.Item name="cof" hidden><InputNumber /></Form.Item>
                    <Form.Item name="sealing_temp_min" hidden><InputNumber /></Form.Item>
                    <Form.Item name="sealing_temp_max" hidden><InputNumber /></Form.Item>
                  </Spin>
                ),
              },
              {
                key: 'substrate-pricing',
                label: 'Pricing',
                children: (
                  <Spin spinning={substrateProfileLoading}>
                    <div style={{ background: '#fafafa', border: '1px dashed #d9d9d9', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                      <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Pricing Helper</Text>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{PRICING_HELP.panel}</Text>
                    </div>

                    <Row gutter={16} style={{ marginBottom: 4 }}>
                      <Col span={8}>
                        <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: '10px 14px' }}>
                          <div style={{ fontSize: 11, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>Stock Price (WA) — Oracle</div>
                          <div style={{ fontSize: 18, fontWeight: 600, color: '#389e0d' }}>
                            {renderCurrency(substrateProfile?.pricing?.stock_price_wa)}
                          </div>
                        </div>
                      </Col>
                      <Col span={8}>
                        <div style={{ background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 8, padding: '10px 14px' }}>
                          <div style={{ fontSize: 11, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>On Order (WA) — Oracle</div>
                          <div style={{ fontSize: 18, fontWeight: 600, color: '#d46b08' }}>
                            {renderCurrency(substrateProfile?.pricing?.on_order_price_wa)}
                          </div>
                        </div>
                      </Col>
                      <Col span={8}>
                        <div style={{ background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 8, padding: '10px 14px' }}>
                          <div style={{ fontSize: 11, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>Combined (WA)</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#1d39c4' }}>
                            {renderCurrency(substrateProfile?.pricing?.combined_price_wa)}
                          </div>
                        </div>
                      </Col>
                    </Row>

                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item name="market_ref_price" label="Market Price (user-set)" extra={PRICING_HELP.marketRef}>
                          <InputNumber min={0} step={0.01} prefix={<CurrencySymbol />} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="market_price_date" label="Market Price Date" extra={PRICING_HELP.marketDate}>
                          <Input type="date" />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Form.Item name="stock_price" hidden><InputNumber /></Form.Item>
                    <Form.Item name="on_order_price" hidden><InputNumber /></Form.Item>
                  </Spin>
                ),
              },
              {
                key: 'substrate-specs',
                label: 'Material Specs',
                children: (
                  <Spin spinning={substrateProfileLoading}>
                    <Text type="secondary" style={{ fontSize: 11, marginBottom: 12, display: 'block' }}>
                      Stock-weighted averages across {substrateProfile?.spec_count ?? 0} selected mapped item(s). Parameter cards are profile-specific and not shared across all substrates.
                    </Text>

                    <div style={{ background: '#f6f8ff', border: '1px solid #d6e4ff', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                      <Text strong style={{ fontSize: 12, display: 'block' }}>
                        Parameter Profile: {substrateProfile?.parameter_profile || '—'}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        New substrate pages can use the same profile-driven contract from backend meta and values.
                      </Text>
                    </div>

                    {!selectedSubstrateMaterialKeys.length ? (
                      <Text type="warning" style={{ display: 'block', marginBottom: 10 }}>
                        No mapped items selected. Select one or more mapped items in Inventory & Grades to aggregate technical parameters.
                      </Text>
                    ) : !substrateProfile?.spec_count ? (
                      <Text type="secondary" style={{ display: 'block', marginBottom: 10 }}>
                        No saved Material Specs found for the selected mapped items yet.
                      </Text>
                    ) : (
                      <>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>Spec Sources ({substrateProfile?.spec_count || 0})</Text>
                        <Table
                          dataSource={substrateProfile?.specs || []}
                          rowKey={(row) => `${row.material_key || ''}-${row.mainitem || ''}`}
                          size="small"
                          pagination={false}
                          scroll={{ x: 1100, y: 220 }}
                          columns={substrateSpecColumns}
                          style={{ marginBottom: 12 }}
                        />

                        <Text strong style={{ display: 'block', marginBottom: 8 }}>Aggregated Parameters</Text>
                        {!substrateParamCards.length ? (
                          <Text type="secondary" style={{ display: 'block', marginBottom: 10 }}>
                            No numeric parameters are available in the selected specs yet.
                          </Text>
                        ) : (
                          <Row gutter={[12, 12]}>
                            {substrateParamCards.map((param) => (
                              <Col xs={12} md={8} lg={6} key={param.key}>
                                <div style={{
                                  background: param.value != null ? '#f6f8ff' : '#fafafa',
                                  border: `1px solid ${param.value != null ? '#d6e4ff' : '#f0f0f0'}`,
                                  borderRadius: 8,
                                  padding: '10px 12px',
                                  textAlign: 'center',
                                  minHeight: 88,
                                }}>
                                  <div style={{ fontSize: 11, color: 'rgba(0,0,0,.45)', marginBottom: 4, lineHeight: 1.2 }}>{param.label}</div>
                                  <div style={{
                                    fontSize: param.value != null ? 20 : 16,
                                    fontWeight: 700,
                                    color: param.value != null ? '#1d39c4' : '#d9d9d9',
                                    lineHeight: 1,
                                    fontFamily: 'monospace',
                                  }}>
                                    {param.value != null
                                      ? Number(param.value).toLocaleString(undefined, {
                                        minimumFractionDigits: param.decimals,
                                        maximumFractionDigits: param.decimals,
                                      })
                                      : '—'}
                                  </div>
                                  <div style={{ fontSize: 10, color: 'rgba(0,0,0,.35)', marginTop: 2 }}>{param.unit || ' '}</div>
                                </div>
                              </Col>
                            ))}
                          </Row>
                        )}
                      </>
                    )}
                  </Spin>
                ),
              },
            ] : [
              {
                key: 'physical',
                label: 'Physical',
                children: (
                  <Row gutter={16}>
                    <Col span={6}>
                      <Form.Item name="density_g_cm3" label="Density (g/cm³)">
                        <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item name="micron_thickness" label="Thickness (μ)">
                        <InputNumber min={0} step={1} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item name="width_mm" label="Width (mm)">
                        <InputNumber min={0} step={1} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item name="solid_pct" label="Solid %">
                        <InputNumber min={0} max={100} step={1} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>
                ),
              },
              {
                key: 'costing',
                label: 'Costing',
                children: (
                  <>
                    <div style={{ background: '#fafafa', border: '1px dashed #d9d9d9', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                      <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Costing Helper</Text>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{PRICING_HELP.panel}</Text>
                    </div>
                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item name="stock_price" label="Stock Price (WA)">
                          <InputNumber min={0} step={0.01} prefix={<CurrencySymbol />} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="on_order_price" label="On Order Price (WA)">
                          <InputNumber min={0} step={0.01} prefix={<CurrencySymbol />} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="market_ref_price" label="Market Price (user-set)" extra={PRICING_HELP.marketRef}>
                          <InputNumber min={0} step={0.01} prefix={<CurrencySymbol />} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item name="market_price_date" label="Market Price Date" extra={PRICING_HELP.marketDate}>
                          <Input type="date" />
                        </Form.Item>
                      </Col>
                    </Row>
                  </>
                ),
              },
            ]),
            {
              key: 'mrp',
              label: 'MRP',
              children: (
                <Row gutter={16}>
                  <Col span={6}>
                    <Form.Item name="mrp_type" label="MRP Type" initialValue="PD">
                      <Select options={[{ value: 'PD', label: 'PD - MRP' }, { value: 'ND', label: 'ND - No MRP' }, { value: 'VB', label: 'VB - Manual' }]} />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item name="reorder_point" label="Reorder Point">
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item name="safety_stock_kg" label="Safety Stock (kg)">
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item name="planned_lead_time_days" label="Lead Time (days)">
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>
              ),
            },
          ]} />
        </Form>
      </Modal>

      {/* Bulk Price Update Modal */}
      <Modal
        title="Bulk Market Price Update"
        open={bulkModalOpen}
        onOk={handleBulkPriceUpdate}
        onCancel={() => { setBulkModalOpen(false); bulkForm.resetFields(); }}
        okText="Update Prices"
        width={520}
      >
        <Form form={bulkForm} layout="vertical">
          <Form.Item
            name="priceData"
            label="Paste CSV data (one per line: ITEM_CODE, PRICE)"
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={10} placeholder="PET-12, 2.65&#10;LLDPE-50, 1.85&#10;INK-PU-W, 12.50" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
