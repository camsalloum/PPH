import React, { useState, useEffect, useMemo } from 'react';
import { Table, Button, message, Spin, Tag, Input, Select } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import axios from 'axios';
import { useCurrency } from '../../contexts/CurrencyContext';
import UAEDirhamSymbol from './UAEDirhamSymbol';
import { formatCompanyTime } from '../../utils/companyTime';
import { getMappedSubstrateDisplayFields } from '../../utils/substrateExcelMapping';
import './RawMaterials.css';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatQty = (value) =>
  toNumber(value).toLocaleString(undefined, { maximumFractionDigits: 2 });

const formatQtyWhole = (value) =>
  toNumber(value).toLocaleString(undefined, { maximumFractionDigits: 0 });

const normalizeValue = (value) => String(value || '').trim();
const RESIN_RAW_CATEGORIES = new Set(['polyethylene', 'polypropylene']);
const isResinRawCategory = (category) => {
  const key = normalizeValue(category).toLowerCase();
  if (_dbResinCategories) return _dbResinCategories.has(key);
  return RESIN_RAW_CATEGORIES.has(key);
};

// ── Category mapping — loaded from DB at runtime ───────────────────────────
// Fallbacks used only until DB data loads
const FALLBACK_CATEGORY_MAP = {
  polyethylene: 'Resins', polypropylene: 'Resins', resins: 'Resins',
  substrates: 'Substrates',
  adhesives: 'Adhesives', chemicals: 'Chemicals', additives: 'Additives',
  coating: 'Coating', 'packing materials': 'Packing Materials',
  tapes: 'Mounting Tapes', 'mounting tapes': 'Mounting Tapes',
  trading: 'Trading', consumables: 'Consumables',
};
const FALLBACK_CATEGORY_ORDER = ['Resins','Substrates','Adhesives','Chemicals','Additives','Coating','Packing Materials','Mounting Tapes'];
const FALLBACK_COLUMN_LABELS = {
  Resins:             { sizes: 'MFI (g/10min)', standards: 'Name',           weights: 'Density (g/cm³)' },
  Substrates:         { sizes: 'Width (mm)',     standards: 'Thickness (µm)', weights: 'Density (g/cm³)' },
  Adhesives:          { sizes: 'Type',           standards: 'Matter',         weights: 'Density (g/cm³)' },
  Chemicals:          { sizes: 'Type',           standards: 'Matter',         weights: 'Density (g/cm³)' },
  Additives:          { sizes: 'Type',           standards: 'Matter',         weights: 'Density (g/cm³)' },
  Coating:            { sizes: 'Type',           standards: 'Matter',         weights: 'Density (g/cm³)' },
  'Packing Materials':{ sizes: 'Dimension',      standards: 'Matter',         weights: null },
  'Mounting Tapes':   { sizes: 'Type',           standards: 'Name',           weights: null },
};

/** Derive the main category name from a raw DB category value — uses DB mapping when available */
let _dbCategoryMap = null; // populated by fetchCategories()
let _dbCategoryOrder = null;
let _dbColumnLabels = null;
let _dbResinCategories = null;

const getMainCategory = (category) => {
  const key = normalizeValue(category).toLowerCase();
  if (_dbCategoryMap) return _dbCategoryMap[key] || category || 'Other';
  return FALLBACK_CATEGORY_MAP[key] || category || 'Other';
};

const getUniqueItemKey = (row) => {
  const code = normalizeValue(row?.mainitem).toLowerCase();
  if (code) return `code:${code}`;

  const fallback = [
    getMainCategory(row?.category),
    normalizeValue(row?.catlinedesc),
    normalizeValue(row?.maindescription),
    normalizeValue(row?.material),
    normalizeValue(row?.standards),
    normalizeValue(row?.sizes),
  ]
    .join('|')
    .toLowerCase();

  return fallback.replace(/\|/g, '') ? `fallback:${fallback}` : null;
};

const applySubstrateExcelMapping = (row) => {
  const mapped = getMappedSubstrateDisplayFields(row);
  if (!mapped) {
    return {
      ...row,
      mapped_substrate: null,
      mapped_category_description: null,
    };
  }

  return {
    ...row,
    mapped_substrate: mapped.substrate,
    mapped_category_description: mapped.categoryDescription,
    catlinedesc: mapped.categoryDescription || row.catlinedesc,
    maindescription: row.maindescription || mapped.itemDescription,
  };
};

// Recharts requires actual hex colours – CSS var() does not resolve inside SVG fill attrs
const CHART_COLORS = [
  '#1677ff',
  '#13c2c2',
  '#722ed1',
  '#faad14',
  '#52c41a',
  '#ff4d4f',
  '#2f54eb',
  '#fa8c16',
];

const getCategoryRank = (mainCat) => {
  const order = _dbCategoryOrder || FALLBACK_CATEGORY_ORDER;
  const idx = order.findIndex(
    (c) => c.toLowerCase() === normalizeValue(mainCat).toLowerCase()
  );
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
};

const getCategoryClass = (mainCat) => {
  const c = (mainCat || '').toLowerCase();
  if (c === 'resins') return 'pe';
  if (c === 'substrates') return 'substrate';
  if (c === 'adhesives') return 'adh';
  if (c === 'chemicals') return 'chem';
  if (c === 'additives') return 'add';
  if (c.includes('coat')) return 'coat';
  if (c.includes('packing')) return 'pack';
  if (c.includes('tape')) return 'tape';
  return 'default';
};

const RawMaterials = ({ allowSync = true, title = 'Raw Materials Dashboard', sharedData = null, hidePrices = false }) => {
  const { companyCurrency, isUAEDirham } = useCurrency();

  // ── currency helpers ──────────────────────────────────────────────────────

  /** Renders the company currency symbol – SVG for AED, plain text otherwise */
  const CurrencySymbol = () =>
    isUAEDirham() ? (
      <UAEDirhamSymbol style={{ width: '0.9em', height: '0.9em', verticalAlign: '-0.1em' }} />
    ) : (
      <span style={{ marginRight: '0.05em' }}>{companyCurrency?.symbol || '$'}</span>
    );

  /** Full decimal JSX currency value */
  const renderCurrency = (value, decimals = 2) => {
    const n = toNumber(value);
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
  };

  /** Compact (k/M) JSX currency value */
  const renderCurrencyCompact = (value) => {
    const n = toNumber(value);
    let fmt;
    if (Math.abs(n) >= 1_000_000) fmt = (n / 1_000_000).toFixed(2) + 'M';
    else if (Math.abs(n) >= 1_000) fmt = (n / 1_000).toFixed(1) + 'k';
    else fmt = n.toFixed(0);
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '1px' }}>
        <CurrencySymbol />
        {fmt}
      </span>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [filterCategory, setFilterCategory] = useState(undefined);
  const [filterSubstrate, setFilterSubstrate] = useState(undefined);
  const [filterCatlineDesc, setFilterCatlineDesc] = useState(undefined);
  const [filterDescription, setFilterDescription] = useState(undefined);
  const [filterMaterial, setFilterMaterial] = useState(undefined);
  const [filterStandards, setFilterStandards] = useState(undefined);
  const [filterSizes, setFilterSizes] = useState(undefined);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ rows: 0, phase: '' });
  const [lastSync, setLastSync] = useState(null);
  const [companyTimezone, setCompanyTimezone] = useState(null);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 50,
  });

  const useSharedProvider = Boolean(sharedData);

  useEffect(() => {
    if (!useSharedProvider || !sharedData) return;
    setData(Array.isArray(sharedData.data) ? sharedData.data : []);
    setStats(sharedData.stats || null);
    setLastSync(sharedData.lastSync || null);
    setCompanyTimezone(sharedData.companyTimezone || null);
    setLoading(Boolean(sharedData.loading));
    setSyncing(Boolean(sharedData.syncing));
    setSyncProgress(sharedData.syncProgress || { rows: 0, phase: '', elapsed: 0 });
  }, [sharedData, useSharedProvider]);

  useEffect(() => {
    if (useSharedProvider) return;
    fetchCategories();
    fetchData();
    fetchStats();
    fetchLastSync();
    fetchCompanyTimezone();
  }, [useSharedProvider]);

  // Resin rows in fp_actualrmdata often come per-warehouse for the same display signature.
  // Aggregate them here so dashboard table/charts don't show visual duplicates.
  const displayData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];

    const resinGroups = new Map();
    const passthrough = [];

    data.forEach((row, idx) => {
      if (!isResinRawCategory(row.category)) {
        passthrough.push(applySubstrateExcelMapping(row));
        return;
      }

      const key = [
        normalizeValue(row.category),
        normalizeValue(row.catlinedesc),
        normalizeValue(row.material),
        normalizeValue(row.standards),
        normalizeValue(row.sizes),
      ].join('|') || `resin-${idx}`;

      if (!resinGroups.has(key)) {
        resinGroups.set(key, {
          ...row,
          id: `resin-agg-${key}`,
          mainitemstock: 0,
          pendingorderqty: 0,
          _stockValue: 0,
          _orderValue: 0,
          _densityValue: 0,
          _densityQty: 0,
          _itemCodes: new Set(),
          _warehouses: new Set(),
        });
      }

      const agg = resinGroups.get(key);
      const stockQty = toNumber(row.mainitemstock);
      const orderQty = toNumber(row.pendingorderqty);

      agg.mainitemstock += stockQty;
      agg.pendingorderqty += orderQty;
      agg._stockValue += stockQty * toNumber(row.maincost);
      agg._orderValue += orderQty * toNumber(row.purchaseprice);

      const density = toNumber(row.weights);
      if (density > 0 && stockQty > 0) {
        agg._densityValue += density * stockQty;
        agg._densityQty += stockQty;
      }

      if (normalizeValue(row.mainitem)) agg._itemCodes.add(normalizeValue(row.mainitem));
      if (normalizeValue(row.warehouse)) agg._warehouses.add(normalizeValue(row.warehouse));
    });

    const resinAggregatedRows = Array.from(resinGroups.values()).map((row) => {
      const stockQty = toNumber(row.mainitemstock);
      const orderQty = toNumber(row.pendingorderqty);
      const next = {
        ...row,
        maincost: stockQty > 0 ? row._stockValue / stockQty : toNumber(row.maincost),
        purchaseprice: orderQty > 0 ? row._orderValue / orderQty : toNumber(row.purchaseprice),
        weights: row._densityQty > 0 ? row._densityValue / row._densityQty : row.weights,
      };
      delete next._stockValue;
      delete next._orderValue;
      delete next._densityValue;
      delete next._densityQty;
      delete next._itemCodes;
      delete next._warehouses;
      return next;
    });

    return [...passthrough, ...resinAggregatedRows];
  }, [data]);

  const mappedRawData = useMemo(() => (
    (Array.isArray(data) ? data : []).map((row) => applySubstrateExcelMapping(row))
  ), [data]);

  const fetchCompanyTimezone = async () => {
    try {
      const response = await axios.get('/api/settings/company');
      if (response.data?.success) {
        setCompanyTimezone(response.data.settings?.companyTimezone || null);
      }
    } catch {
      // Keep browser-local fallback when company settings cannot be fetched.
      setCompanyTimezone(null);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/rm-sync/data', { params: { limit: 1000 } });
      if (res.data.success) setData(res.data.data);
    } catch {
      message.error('Failed to load raw materials data');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await axios.get('/api/rm-sync/stats');
      if (res.data.success) setStats(res.data.stats);
    } catch { /* silent */ }
  };

  const fetchLastSync = async () => {
    try {
      const res = await axios.get('/api/rm-sync/last-sync');
      if (res.data.success && res.data.lastSync) setLastSync(res.data.lastSync);
    } catch { /* silent */ }
  };

  // ── Fetch DB-driven category mapping ─────────────────────────────────────
  const fetchCategories = async () => {
    try {
      const res = await axios.get('/api/rm-sync/categories');
      if (res.data.success && res.data.data?.length) {
        const cats = res.data.data;
        // Build oracle_category → display_label map
        const catMap = {};
        const resinCats = new Set();
        cats.forEach(c => {
          (c.oracle_categories || []).forEach(oc => {
            catMap[oc.toLowerCase()] = c.display_label;
            if (c.material_class === 'resins') resinCats.add(oc.toLowerCase());
          });
        });
        _dbCategoryMap = catMap;
        _dbResinCategories = resinCats;
        _dbCategoryOrder = cats.map(c => c.display_label);
        // Build column labels map: display_label → { sizes, standards, weights }
        const colLabels = {};
        cats.forEach(c => {
          if (c.column_labels && typeof c.column_labels === 'object') {
            colLabels[c.display_label] = c.column_labels;
          }
        });
        _dbColumnLabels = colLabels;
      }
    } catch { /* fallback to hardcoded */ }
  };

  const handleSync = async () => {
    if (useSharedProvider && typeof sharedData?.syncRM === 'function') {
      await sharedData.syncRM();
      return;
    }

    try {
      setSyncing(true);
      setSyncProgress({ rows: 0, phase: 'Starting...', elapsed: 0 });
      const res = await axios.post('/api/rm-sync/sync');
      if (res.data.success) {
        let errors = 0;
        const poll = setInterval(async () => {
          try {
            const pr = await axios.get('/api/rm-sync/progress');
            const p = pr.data.progress;
            if (p) {
              setSyncProgress({ rows: p.rows || 0, phase: p.phase || 'Processing...', elapsed: p.elapsedSeconds || 0 });
              if (p.status === 'completed') {
                clearInterval(poll);
                setSyncing(false);
                message.success(`✅ Sync completed — ${p.rows?.toLocaleString() || 0} rows`);
                await Promise.all([fetchData(), fetchStats(), fetchLastSync()]);
              } else if (p.status === 'failed') {
                clearInterval(poll);
                setSyncing(false);
                message.error(`❌ Sync failed: ${p.error || 'Unknown error'}`);
              }
            }
            errors = 0;
          } catch {
            if (++errors >= 10) { clearInterval(poll); setSyncing(false); }
          }
        }, 2000);
      }
    } catch (err) {
      setSyncing(false);
      message.error(err.response?.data?.error || 'Failed to start sync');
    }
  };

  const formatElapsedTime = (seconds) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const weightedAveragesByItem = useMemo(() => {
    const groups = new Map();

    displayData.forEach((row) => {
      const itemKey = [
        row.category || '',
        row.catlinedesc || '',
        row.material || '',
        row.standards || '',
        row.sizes || '',
      ].join('|');

      const stockQty = toNumber(row.mainitemstock);
      const stockUnitCost = toNumber(row.maincost);
      const purchaseQty = toNumber(row.pendingorderqty);
      const purchaseUnitCost = toNumber(row.purchaseprice);

      if (!groups.has(itemKey)) {
        groups.set(itemKey, {
          stockTotalValue: 0,
          stockTotalQty: 0,
          purchaseTotalValue: 0,
          purchaseTotalQty: 0,
        });
      }

      const current = groups.get(itemKey);
      current.stockTotalValue += stockQty * stockUnitCost;
      current.stockTotalQty += stockQty;
      current.purchaseTotalValue += purchaseQty * purchaseUnitCost;
      current.purchaseTotalQty += purchaseQty;
    });

    return groups;
  }, [displayData]);

  const getWeightedStockCostPerUnit = (record) => {
    const itemKey = [
      record.category || '',
      record.catlinedesc || '',
      record.material || '',
      record.standards || '',
      record.sizes || '',
    ].join('|');

    const totalsByItem = weightedAveragesByItem.get(itemKey);
    if (!totalsByItem || totalsByItem.stockTotalQty <= 0) {
      return toNumber(record.maincost);
    }

    return totalsByItem.stockTotalValue / totalsByItem.stockTotalQty;
  };

  const getWeightedPurchaseCostPerUnit = (record) => {
    const itemKey = [
      record.category || '',
      record.catlinedesc || '',
      record.material || '',
      record.standards || '',
      record.sizes || '',
    ].join('|');

    const totalsByItem = weightedAveragesByItem.get(itemKey);
    if (!totalsByItem || totalsByItem.purchaseTotalQty <= 0) {
      return toNumber(record.purchaseprice);
    }

    return totalsByItem.purchaseTotalValue / totalsByItem.purchaseTotalQty;
  };

  const searchFilteredData = useMemo(() => {
    if (!searchText) return displayData;

    const searchLower = searchText.toLowerCase();
    return displayData.filter(item => (
      (item.category || '').toLowerCase().includes(searchLower) ||
      (item.mapped_substrate || '').toLowerCase().includes(searchLower) ||
      (item.catlinedesc || '').toLowerCase().includes(searchLower) ||
      (item.itemgroup || '').toLowerCase().includes(searchLower) ||
      (item.maindescription || '').toLowerCase().includes(searchLower) ||
      (item.material || '').toLowerCase().includes(searchLower) ||
      (item.standards || '').toLowerCase().includes(searchLower) ||
      (item.sizes || '').toLowerCase().includes(searchLower)
    ));
  }, [displayData, searchText]);

  const applyColumnFilters = (items, filters) => {
    return items.filter((item) => {
      const isSubstrateItem = getMainCategory(item.category) === 'Substrates';
      const matchesCategory = !filters.category || getMainCategory(item.category) === filters.category;
      const matchesSubstrate = !filters.substrate || (
        isSubstrateItem && normalizeValue(item.mapped_substrate) === filters.substrate
      );
      const matchesCatlineDesc = !filters.catlinedesc || normalizeValue(item.catlinedesc) === filters.catlinedesc;
      const matchesMaterial = isSubstrateItem || !filters.material || normalizeValue(item.material) === filters.material;
      const matchesStandards = !filters.standards || normalizeValue(item.standards) === filters.standards;
      const matchesSizes = !filters.sizes || normalizeValue(item.sizes) === filters.sizes;
      return matchesCategory && matchesSubstrate && matchesCatlineDesc && matchesMaterial && matchesStandards && matchesSizes;
    });
  };

  const filteredData = useMemo(() => {
    return applyColumnFilters(searchFilteredData, {
      category: filterCategory,
      substrate: filterSubstrate,
      catlinedesc: filterCatlineDesc,
      material: filterMaterial,
      standards: filterStandards,
      sizes: filterSizes,
    });
  }, [searchFilteredData, filterCategory, filterSubstrate, filterCatlineDesc, filterMaterial, filterStandards, filterSizes]);

  const searchFilteredRawData = useMemo(() => {
    if (!searchText) return mappedRawData;

    const searchLower = searchText.toLowerCase();
    return mappedRawData.filter((item) => (
      (item.category || '').toLowerCase().includes(searchLower) ||
      (item.mapped_substrate || '').toLowerCase().includes(searchLower) ||
      (item.catlinedesc || '').toLowerCase().includes(searchLower) ||
      (item.itemgroup || '').toLowerCase().includes(searchLower) ||
      (item.maindescription || '').toLowerCase().includes(searchLower) ||
      (item.material || '').toLowerCase().includes(searchLower) ||
      (item.standards || '').toLowerCase().includes(searchLower) ||
      (item.sizes || '').toLowerCase().includes(searchLower)
    ));
  }, [mappedRawData, searchText]);

  const filteredRawData = useMemo(() => {
    return applyColumnFilters(searchFilteredRawData, {
      category: filterCategory,
      substrate: filterSubstrate,
      catlinedesc: filterCatlineDesc,
      material: filterMaterial,
      standards: filterStandards,
      sizes: filterSizes,
    });
  }, [searchFilteredRawData, filterCategory, filterSubstrate, filterCatlineDesc, filterMaterial, filterStandards, filterSizes]);

  const uniqueItemsCount = useMemo(() => {
    const unique = new Set();
    filteredRawData.forEach((row) => {
      const key = getUniqueItemKey(row);
      if (key) unique.add(key);
    });
    return unique.size;
  }, [filteredRawData]);

  const buildOptions = (items, field) => {
    const values = Array.from(new Set(items.map((item) => normalizeValue(item[field])).filter(Boolean)));

    if (field === 'category') {
      return values
        .sort((a, b) => {
          const rankDiff = getCategoryRank(a) - getCategoryRank(b);
          if (rankDiff !== 0) return rankDiff;
          return a.localeCompare(b);
        })
        .map((value) => ({ label: value, value }));
    }

    return values
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ label: value, value }));
  };

  // Main category pills: show only main categories that have data in the current filtered set
  const quickCategoryValues = useMemo(() => {
    const presentMainCats = new Set(
      searchFilteredData.map((item) => getMainCategory(item.category)).filter(Boolean)
    );
    return (_dbCategoryOrder || FALLBACK_CATEGORY_ORDER).filter((mc) => presentMainCats.has(mc));
  }, [searchFilteredData]);

  const quickCatlineDescValues = useMemo(() => {
    const scoped = searchFilteredData.filter((item) => {
      if (filterCategory && getMainCategory(item.category) !== filterCategory) return false;
      if (filterSubstrate && normalizeValue(item.mapped_substrate) !== filterSubstrate) return false;
      return true;
    });
    const values = Array.from(new Set(scoped.map((item) => normalizeValue(item.catlinedesc)).filter(Boolean)));
    return values.sort((a, b) => a.localeCompare(b));
  }, [searchFilteredData, filterCategory, filterSubstrate]);

  const quickSubstrateValues = useMemo(() => {
    if (filterCategory !== 'Substrates') return [];

    const scoped = searchFilteredData.filter((item) => getMainCategory(item.category) === 'Substrates');
    const values = Array.from(new Set(scoped.map((item) => normalizeValue(item.mapped_substrate)).filter(Boolean)));
    return values.sort((a, b) => a.localeCompare(b));
  }, [searchFilteredData, filterCategory]);

  const substrateOptions = useMemo(
    () => quickSubstrateValues.map((value) => ({ label: value, value })),
    [quickSubstrateValues]
  );

  const quickTypeValues = useMemo(() => {
    if (filterCategory === 'Substrates') return [];

    const scoped = searchFilteredData.filter((item) => {
      if (filterCategory && getMainCategory(item.category) !== filterCategory) return false;
      if (filterCatlineDesc && normalizeValue(item.catlinedesc) !== filterCatlineDesc) return false;
      return true;
    });
    const values = Array.from(new Set(
      scoped
        .map((item) => normalizeValue(item.material))
        .filter(Boolean)
    ));
    return values.sort((a, b) => a.localeCompare(b));
  }, [searchFilteredData, filterCategory, filterSubstrate, filterCatlineDesc]);

  const catlineDescOptions = useMemo(() => {
    const scoped = applyColumnFilters(searchFilteredData, {
      category: filterCategory,
      substrate: filterSubstrate,
      material: filterMaterial,
      standards: filterStandards,
      sizes: filterSizes,
    });
    return buildOptions(scoped, 'catlinedesc');
  }, [searchFilteredData, filterCategory, filterSubstrate, filterMaterial, filterStandards, filterSizes]);

  const materialOptions = useMemo(() => {
    const scoped = applyColumnFilters(searchFilteredData, {
      category: filterCategory,
      substrate: filterSubstrate,
      catlinedesc: filterCatlineDesc,
      standards: filterStandards,
      sizes: filterSizes,
    });
    return buildOptions(scoped, 'material');
  }, [searchFilteredData, filterCategory, filterSubstrate, filterCatlineDesc, filterStandards, filterSizes]);

  const standardsOptions = useMemo(() => {
    const scoped = applyColumnFilters(searchFilteredData, {
      category: filterCategory,
      substrate: filterSubstrate,
      catlinedesc: filterCatlineDesc,
      material: filterMaterial,
      sizes: filterSizes,
    });
    return buildOptions(scoped, 'standards');
  }, [searchFilteredData, filterCategory, filterSubstrate, filterCatlineDesc, filterMaterial, filterSizes]);

  const sizesOptions = useMemo(() => {
    const scoped = applyColumnFilters(searchFilteredData, {
      category: filterCategory,
      substrate: filterSubstrate,
      catlinedesc: filterCatlineDesc,
      material: filterMaterial,
      standards: filterStandards,
    });
    return buildOptions(scoped, 'sizes');
  }, [searchFilteredData, filterCategory, filterSubstrate, filterCatlineDesc, filterMaterial, filterStandards]);

  const totals = useMemo(() => {
    const stockQty = filteredData.reduce((sum, row) => sum + toNumber(row.mainitemstock), 0);
    const stockVal = filteredData.reduce((sum, row) => sum + (toNumber(row.mainitemstock) * toNumber(row.maincost)), 0);
    const orderQty = filteredData.reduce((sum, row) => sum + toNumber(row.pendingorderqty), 0);
    const orderVal = filteredData.reduce((sum, row) => sum + (toNumber(row.pendingorderqty) * toNumber(row.purchaseprice)), 0);
    const combinedQty = stockQty + orderQty;
    const combinedVal = stockVal + orderVal;

    let densityWtdSum = 0, densityWtdQtyAcc = 0;
    filteredData.forEach((row) => {
      const d = toNumber(row.weights);
      const q = toNumber(row.mainitemstock);
      if (d > 0 && q > 0) { densityWtdSum += d * q; densityWtdQtyAcc += q; }
    });
    const densityWtdAvg = densityWtdQtyAcc > 0 ? densityWtdSum / densityWtdQtyAcc : null;

    return {
      stockQty,
      stockVal,
      stockWtdAvg: stockQty > 0 ? stockVal / stockQty : 0,
      orderQty,
      orderVal,
      purchaseWtdAvg: orderQty > 0 ? orderVal / orderQty : 0,
      combinedWtdAvg: combinedQty > 0 ? combinedVal / combinedQty : 0,
      densityWtdAvg,
    };
  }, [filteredData]);

  const primaryUnit = useMemo(() => {
    const counts = new Map();

    filteredData.forEach((row) => {
      const unit = normalizeValue(row.mainunit);
      if (!unit) return;
      counts.set(unit, (counts.get(unit) || 0) + 1);
    });

    if (counts.size === 0) return 'Unit';

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])[0][0];
  }, [filteredData]);

  const categoryChartData = useMemo(() => {
    // Bar chart: without category filter → group by category; with filter → group by type/material
    const grouped = new Map();
    filteredData.forEach((row) => {
      const key = filterCategory
        ? (normalizeValue(row.catlinedesc) || 'Unspecified')
        : getMainCategory(row.category);
      const cur = grouped.get(key) || { name: key, stockQty: 0, orderQty: 0 };
      cur.stockQty += toNumber(row.mainitemstock);
      cur.orderQty += toNumber(row.pendingorderqty);
      grouped.set(key, cur);
    });
    return [...grouped.values()]
      .sort((a, b) =>
        !filterCategory
          ? getCategoryRank(a.name) - getCategoryRank(b.name) || b.stockQty - a.stockQty
          : b.stockQty - a.stockQty
      )
      .slice(0, 10);
  }, [filteredData, filterCategory]);

  const materialDistributionData = useMemo(() => {
    const grouped = new Map();
    filteredData.forEach((row) => {
      const key = filterCategory
        ? (normalizeValue(row.catlinedesc) || 'Unspecified')
        : getMainCategory(row.category);
      const totalValue = toNumber(row.mainitemstock) * toNumber(row.maincost) + toNumber(row.pendingorderqty) * toNumber(row.purchaseprice);
      grouped.set(key, (grouped.get(key) || 0) + totalValue);
    });
    return [...grouped.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [filteredData, filterCategory]);

  const donutTotal = useMemo(() => materialDistributionData.reduce((s, x) => s + x.value, 0), [materialDistributionData]);

  const dashboardMetrics = useMemo(() => ({
    ...totals,
    filteredRows: filteredData.length,
    categories: new Set(filteredData.map((r) => getMainCategory(r.category)).filter(Boolean)).size,
  }), [totals, filteredData]);

  const activeFiltersCount = [
    filterCategory,
    filterSubstrate,
    filterCatlineDesc,
    filterCategory === 'Substrates' ? undefined : filterMaterial,
    filterStandards,
    filterSizes,
  ].filter(Boolean).length + (searchText ? 1 : 0);

  useEffect(() => {
    if (filterCategory === 'Substrates' && filterMaterial) {
      setFilterMaterial(undefined);
    }
  }, [filterCategory, filterMaterial]);

  const clearAllFilters = () => {
    setSearchText(''); setFilterCategory(undefined); setFilterSubstrate(undefined); setFilterCatlineDesc(undefined);
    setFilterDescription(undefined); setFilterMaterial(undefined);
    setFilterStandards(undefined); setFilterSizes(undefined);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleCategoryPill = (value) => {
    setFilterCategory(value || undefined);
    setFilterSubstrate(undefined);
    setFilterCatlineDesc(undefined);
    setFilterDescription(undefined);
    setFilterMaterial(undefined);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleCatlineDescPill = (value) => {
    setFilterCatlineDesc(value || undefined);
    setFilterDescription(undefined);
    setFilterMaterial(undefined);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleSubstratePill = (value) => {
    setFilterSubstrate(value || undefined);
    setFilterCatlineDesc(undefined);
    setFilterDescription(undefined);
    setFilterMaterial(undefined);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  // Bar chart click: clicking category bar sets category filter; clicking type bar sets material filter
  const handleBarClick = (chartData) => {
    const name = chartData?.activePayload?.[0]?.payload?.name;
    if (!name) return;
    if (!filterCategory) {
      setFilterCategory(name);
      setFilterCatlineDesc(undefined);
    } else {
      setFilterCatlineDesc(name);
    }
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleDonutClick = (payload) => {
    const name = normalizeValue(payload?.name);
    if (!name) return;
    if (!filterCategory) {
      // Top-level: slice is a main category — set category pill
      setFilterCategory(name);
      setFilterCatlineDesc(undefined);
    } else {
      // Drilled-in: slice is a cat description — set description filter
      setFilterCatlineDesc(name);
    }
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  // Custom tooltip components (render-functions for stability)
  const renderDonutTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const { name, value } = payload[0];
    const pct = donutTotal > 0 ? ((value / donutTotal) * 100).toFixed(1) : '0.0';
    return (
      <div className="rm-tooltip">
        <div className="rm-tooltip-name">{name}</div>
        <div className="rm-tooltip-val">{renderCurrency(value, 0)}</div>
        <div className="rm-tooltip-pct">{pct}% of total</div>
      </div>
    );
  };

  const renderBarTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rm-tooltip">
        <div className="rm-tooltip-name">{label}</div>
        {payload.map((p) => (
          <div key={p.dataKey} className="rm-tooltip-row">
            <span className="rm-tooltip-dot" style={{ background: p.fill }} />
            <span>{p.name}:</span>
            <strong>{toNumber(p.value).toLocaleString(undefined, { maximumFractionDigits: 0 })} {primaryUnit}</strong>
          </div>
        ))}
      </div>
    );
  };

  // Dynamic column labels — DB-driven with fallback
  const colLabels = (() => {
    if (!filterCategory) return { sizes: 'Width/Size', standards: 'Standards', weights: 'Weights' };
    const dbLabels = _dbColumnLabels?.[filterCategory];
    if (dbLabels) return dbLabels;
    const fallback = FALLBACK_COLUMN_LABELS[filterCategory];
    if (fallback) return fallback;
    return { sizes: 'Width/Size', standards: 'Standards', weights: 'Weights' };
  })();

  const columns = [
    ...(!filterCategory ? [{
      title: 'Main Category',
      dataIndex: 'category',
      key: 'category',
      width: 160,
      align: 'left',
      render: (text) => {
        const mc = getMainCategory(text);
        return mc ? <span className={`rm-tag rm-tag-${getCategoryClass(mc)}`}>{mc}</span> : '-';
      },
      sorter: (a, b) => {
        const rankDiff = getCategoryRank(getMainCategory(a.category)) - getCategoryRank(getMainCategory(b.category));
        if (rankDiff !== 0) return rankDiff;
        return getMainCategory(a.category).localeCompare(getMainCategory(b.category));
      },
      defaultSortOrder: 'ascend',
    }] : []),
    {
      title: filterCategory === 'Substrates' ? 'Category Description' : 'Cat. Description',
      dataIndex: 'catlinedesc',
      key: 'catlinedesc',
      width: 190,
      align: 'left',
      render: (text) => text || '-',
      sorter: (a, b) => (a.catlinedesc || '').localeCompare(b.catlinedesc || ''),
    },
    {
      title: 'Description',
      dataIndex: 'maindescription',
      key: 'maindescription',
      width: 220,
      align: 'left',
      render: (text) => text || '-',
      sorter: (a, b) => (a.maindescription || '').localeCompare(b.maindescription || ''),
    },
    {
      title: 'Type',
      dataIndex: 'material',
      key: 'material',
      width: 150,
      align: 'left',
      render: (text) => text || '-',
      sorter: (a, b) => (a.material || '').localeCompare(b.material || ''),
    },
    {
      title: colLabels.standards,
      dataIndex: 'standards',
      key: 'standards',
      width: 150,
      align: 'left',
      render: (text) => text || '-',
      sorter: (a, b) => (a.standards || '').localeCompare(b.standards || ''),
    },
    {
      title: colLabels.sizes,
      dataIndex: 'sizes',
      key: 'sizes',
      width: 150,
      align: 'left',
      render: (text) => text || '-',
      sorter: (a, b) => (a.sizes || '').localeCompare(b.sizes || ''),
    },
    ...(colLabels.weights ? [{
      title: colLabels.weights,
      dataIndex: 'weights',
      key: 'weights',
      width: 130,
      align: 'center',
      render: (val) => {
        const v = toNumber(val);
        return v > 0 ? v.toFixed(4) : '-';
      },
      sorter: (a, b) => toNumber(a.weights) - toNumber(b.weights),
    }] : []),
    {
      title: 'Stock Qty',
      dataIndex: 'mainitemstock',
      key: 'mainitemstock',
      width: 120,
      align: 'center',
      render: (value) => formatQty(value),
      sorter: (a, b) => toNumber(a.mainitemstock) - toNumber(b.mainitemstock),
    },
    ...(!hidePrices ? [{
      title: 'Stock Cost',
      key: 'stockcost',
      width: 140,
      align: 'center',
      render: (_, record) => renderCurrency(getWeightedStockCostPerUnit(record)),
      sorter: (a, b) => getWeightedStockCostPerUnit(a) - getWeightedStockCostPerUnit(b),
    }] : []),
    {
      title: 'On Order Qty',
      dataIndex: 'pendingorderqty',
      key: 'pendingorderqty',
      width: 130,
      align: 'center',
      render: (value) => formatQty(value),
      sorter: (a, b) => toNumber(a.pendingorderqty) - toNumber(b.pendingorderqty),
    },
    ...(!hidePrices ? [{
      title: 'Purchase Cost',
      key: 'purchasecost',
      width: 140,
      align: 'center',
      render: (_, record) => renderCurrency(getWeightedPurchaseCostPerUnit(record)),
      sorter: (a, b) => getWeightedPurchaseCostPerUnit(a) - getWeightedPurchaseCostPerUnit(b),
    }] : []),
  ];

  return (
    <div className="raw-materials-container">

      {/* ── Header ── */}
      <div className="rm-header">
        <div className="rm-header-left">
          <h3 className="rm-title">{title}</h3>
        </div>
        <div className="rm-header-right">
          {allowSync && (
            <Button
              type="primary"
              icon={syncing ? null : <ReloadOutlined />}
              onClick={handleSync}
              disabled={syncing}
              loading={syncing}
            >
              {syncing ? syncProgress.phase : 'Sync RM Data'}
            </Button>
          )}
          {lastSync && (
            <div className="rm-last-sync">
              Last sync: {(() => {
                try {
                  const s = typeof lastSync === 'string' ? JSON.parse(lastSync) : lastSync;
                  return formatCompanyTime(s.completedAt || s.updated_at || lastSync, companyTimezone, true);
                } catch { return String(lastSync); }
              })()}
            </div>
          )}
        </div>
      </div>

      {/* ── Sync progress ── */}
      {syncing && (
        <div className="rm-sync-progress">
          <Spin size="small" />
          <span className="rm-sync-text">
            {syncProgress.rows > 0
              ? `${syncProgress.rows.toLocaleString()} rows`
              : syncProgress.phase}
          </span>
          {syncProgress.elapsed > 0 && (
            <span className="rm-sync-time">({formatElapsedTime(syncProgress.elapsed)})</span>
          )}
        </div>
      )}

      {/* ── KPI Grid ── */}
      <div className="rm-kpi-grid">
        <div className="rm-kpi rm-kpi-blue">
          <div className="rm-kpi-label">Total Stock Qty</div>
          <div className="rm-kpi-value">{formatQtyWhole(dashboardMetrics.stockQty)}</div>
          <div className="rm-kpi-sub">{primaryUnit}</div>
        </div>
        {!hidePrices && (
        <div className="rm-kpi rm-kpi-teal">
          <div className="rm-kpi-label">Stock Value</div>
          <div className="rm-kpi-value">{renderCurrencyCompact(dashboardMetrics.stockVal)}</div>
          <div className="rm-kpi-sub">in inventory</div>
        </div>
        )}
        <div className="rm-kpi rm-kpi-orange">
          <div className="rm-kpi-label">On Order Qty</div>
          <div className="rm-kpi-value">{formatQtyWhole(dashboardMetrics.orderQty)}</div>
          <div className="rm-kpi-sub">{primaryUnit} pending</div>
        </div>
        {!hidePrices && (
        <div className="rm-kpi rm-kpi-purple">
          <div className="rm-kpi-label">On Order Value</div>
          <div className="rm-kpi-value">{renderCurrencyCompact(dashboardMetrics.orderVal)}</div>
          <div className="rm-kpi-sub">pending purchase</div>
        </div>
        )}
        {!hidePrices && (
        <div className="rm-kpi rm-kpi-green">
          <div className="rm-kpi-label">Wtd Stock Cost / {primaryUnit}</div>
          <div className="rm-kpi-value">{renderCurrency(dashboardMetrics.stockWtdAvg)}</div>
          <div className="rm-kpi-sub">weighted avg</div>
        </div>
        )}
        {!hidePrices && (
        <div className="rm-kpi rm-kpi-red">
          <div className="rm-kpi-label">Wtd Purchase Cost / {primaryUnit}</div>
          <div className="rm-kpi-value">{renderCurrency(dashboardMetrics.purchaseWtdAvg)}</div>
          <div className="rm-kpi-sub">weighted avg</div>
        </div>
        )}
        {!hidePrices && (
        <div className="rm-kpi rm-kpi-combo">
          <div className="rm-kpi-combo-left">
            <div className="rm-kpi-label">Combined Avg / {primaryUnit}</div>
            <div className="rm-kpi-value">{renderCurrency(dashboardMetrics.combinedWtdAvg)}</div>
            <div className="rm-kpi-sub">stock + incoming</div>
          </div>
          <div className="rm-kpi-combo-stats">
            <div className="rm-kpi-stat">
              <span className="rm-kpi-stat-val">{dashboardMetrics.filteredRows.toLocaleString()}</span>
              <span className="rm-kpi-stat-label">items</span>
            </div>
            <div className="rm-kpi-stat">
              <span className="rm-kpi-stat-val">{dashboardMetrics.categories}</span>
              <span className="rm-kpi-stat-label">categories</span>
            </div>
          </div>
        </div>
        )}
        {colLabels.weights && dashboardMetrics.densityWtdAvg !== null && (
        <div className="rm-kpi rm-kpi-amber" style={{ gridColumn: 'span 2' }}>
          <div className="rm-kpi-label">Wtd Avg Density</div>
          <div className="rm-kpi-value">{dashboardMetrics.densityWtdAvg.toFixed(4)}</div>
          <div className="rm-kpi-sub">g/cm³ · stock-weighted</div>
        </div>
        )}
      </div>

      {/* ── Charts ── */}
      <div className="rm-charts-wrap">

        {/* Bar – stock qty by category/type */}
        <div className="rm-chart-card">
          <div className="rm-chart-header">
            <span className="rm-chart-title">
              {filterCategory ? `${filterCategory} — Stock Qty by Description` : 'Stock Qty by Category'}
            </span>
            <span className="rm-chart-hint">click bar to filter</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={categoryChartData}
              margin={{ top: 8, right: 12, left: 0, bottom: 36 }}
              onClick={handleBarClick}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color, #e5e7eb)" vertical={false} />
              <XAxis
                dataKey="name"
                angle={-18}
                textAnchor="end"
                interval={0}
                tick={{ fill: 'var(--text-secondary, #6b7280)', fontSize: 11 }}
                height={56}
              />
              <YAxis
                tickFormatter={(v) => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}
                tick={{ fill: 'var(--text-secondary, #6b7280)', fontSize: 11 }}
                width={46}
              />
              <Tooltip content={renderBarTooltip} />
              <Bar dataKey="stockQty" name="Stock Qty" radius={[4, 4, 0, 0]}>
                {categoryChartData.map((entry, idx) => (
                  <Cell key={entry.name} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Donut – value distribution (hidden when prices are restricted) */}
        {!hidePrices && (
        <div className="rm-chart-card">
          <div className="rm-chart-header">
            <span className="rm-chart-title">{filterCategory ? `${filterCategory} — Value by Description` : 'Value by Type'}</span>
            <span className="rm-chart-hint">click slice to filter</span>
          </div>
          <div className="rm-donut-wrap">
            <div className="rm-donut-chart-area">
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie
                    data={materialDistributionData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={88}
                    innerRadius={50}
                    paddingAngle={2}
                    onClick={handleDonutClick}
                    style={{ cursor: 'pointer' }}
                  >
                    {materialDistributionData.map((entry, idx) => (
                      <Cell key={entry.name} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={renderDonutTooltip} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="rm-donut-legend">
              {materialDistributionData.map((item, idx) => {
                const pct = donutTotal > 0 ? ((item.value / donutTotal) * 100).toFixed(1) : '0.0';
                return (
                  <div
                    key={item.name}
                    className="rm-donut-legend-row"
                    onClick={() => handleDonutClick(item)}
                    title={`Filter by: ${item.name}`}
                  >
                    <span className="rm-donut-dot" style={{ background: CHART_COLORS[idx % CHART_COLORS.length] }} />
                    <span className="rm-donut-name">{item.name}</span>
                    <span className="rm-donut-pct">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        )}
      </div>

      {/* ── Category pill filter ── */}
      <div className="rm-filter-section">
        <div className="rm-filter-row">
          <span className="rm-filter-row-label">Category</span>
          <div className="rm-pills">
            <button
              type="button"
              className={`rm-pill${!filterCategory ? ' rm-pill-active' : ''}`}
              onClick={() => handleCategoryPill(undefined)}
            >
              All
            </button>
            {quickCategoryValues.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`rm-pill${filterCategory === cat ? ' rm-pill-active' : ''}`}
                onClick={() => handleCategoryPill(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {filterCategory === 'Substrates' && quickSubstrateValues.length > 0 && (
          <div className="rm-filter-row">
            <span className="rm-filter-row-label">Substrate</span>
            <div className="rm-pills">
              <button
                type="button"
                className={`rm-pill${!filterSubstrate ? ' rm-pill-active' : ''}`}
                onClick={() => handleSubstratePill(undefined)}
              >
                All
              </button>
              {quickSubstrateValues.map((substrate) => (
                <button
                  key={substrate}
                  type="button"
                  className={`rm-pill${filterSubstrate === substrate ? ' rm-pill-active' : ''}`}
                  onClick={() => handleSubstratePill(substrate)}
                >
                  {substrate}
                </button>
              ))}
            </div>
          </div>
        )}

        {filterCategory && quickCatlineDescValues.length > 0 && (
          <div className="rm-filter-row">
            <span className="rm-filter-row-label">{filterCategory === 'Substrates' ? 'Category Description' : 'Cat. Desc'}</span>
            <div className="rm-pills">
              <button
                type="button"
                className={`rm-pill${!filterCatlineDesc ? ' rm-pill-active' : ''}`}
                onClick={() => handleCatlineDescPill(undefined)}
              >
                All
              </button>
              {quickCatlineDescValues.map((desc) => (
                <button
                  key={desc}
                  type="button"
                  className={`rm-pill${filterCatlineDesc === desc ? ' rm-pill-active' : ''}`}
                  onClick={() => handleCatlineDescPill(desc)}
                >
                  {desc}
                </button>
              ))}
            </div>
          </div>
        )}

        {filterCategory && quickTypeValues.length > 0 && (
          <div className="rm-filter-row">
            <span className="rm-filter-row-label">Type</span>
            <div className="rm-pills">
              <button
                type="button"
                className={`rm-pill${!filterMaterial ? ' rm-pill-active' : ''}`}
                onClick={() => setFilterMaterial(undefined)}
              >
                All
              </button>
              {quickTypeValues.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`rm-pill${filterMaterial === type ? ' rm-pill-active' : ''}`}
                  onClick={() => setFilterMaterial(type)}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Search + advanced filters ── */}
      <div className="rm-adv-filters">
        <Input.Search
          placeholder="Search by category, description, type…"
          allowClear
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onSearch={(v) => setSearchText(v)}
          className="rm-search-input"
        />
        {filterCategory === 'Substrates' && (
          <Select
            allowClear showSearch placeholder="Substrate"
            value={filterSubstrate} options={substrateOptions}
            onChange={(v) => {
              setFilterSubstrate(v);
              setFilterCatlineDesc(undefined);
              setFilterDescription(undefined);
            }}
            className="rm-filter-select" optionFilterProp="label"
          />
        )}
        <Select
          allowClear showSearch placeholder={filterCategory === 'Substrates' ? 'Category Description' : 'Cat. Description'}
          value={filterCatlineDesc} options={catlineDescOptions}
          onChange={(v) => setFilterCatlineDesc(v)}
          className="rm-filter-select" optionFilterProp="label"
        />
        <Select
          allowClear showSearch placeholder="Thickness / Matter"
          value={filterStandards} options={standardsOptions}
          onChange={(v) => setFilterStandards(v)}
          className="rm-filter-select" optionFilterProp="label"
        />
        <Select
          allowClear showSearch placeholder="Width / Size"
          value={filterSizes} options={sizesOptions}
          onChange={(v) => setFilterSizes(v)}
          className="rm-filter-select" optionFilterProp="label"
        />
        <Button onClick={clearAllFilters} disabled={activeFiltersCount === 0}>
          Clear All
        </Button>
        {activeFiltersCount > 0 && (
          <>
            <Tag color="processing">{activeFiltersCount} active filter{activeFiltersCount > 1 ? 's' : ''}</Tag>
            <Tag color="blue">{uniqueItemsCount} unique item{uniqueItemsCount === 1 ? '' : 's'}</Tag>
          </>
        )}
        {searchText && (
          <span className="rm-result-count">{filteredData.length} of {displayData.length}</span>
        )}
      </div>

      {/* ── Table ── */}
      <Table
        columns={columns}
        dataSource={filteredData}
        loading={loading}
        rowKey={(r) => r.id ?? r.item_code ?? r.oracle_item_code ?? `${r.category || 'cat'}-${r.catlinedesc || 'line'}-${r.type || 'type'}`}
        size="small"
        scroll={{ x: 1350 }}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          showSizeChanger: true,
          pageSizeOptions: ['50', '100', '200', '500'],
          showTotal: (total) => `${total} items`,
          onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
          onShowSizeChange: (_c, s) => setPagination({ current: 1, pageSize: s }),
        }}

      />
    </div>
  );
};

export default RawMaterials;
