/**
 * MES Master Data — Item Master Routes
 * Mounted at /api/mes/master-data/items
 */

const { pool } = require('../../../database/config');
const { authenticate } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');

const MGMT_ROLES = ['admin', 'sales_manager'];
function isAdminOrMgmt(user) {
  return MGMT_ROLES.includes(user?.role);
}

const NON_RESIN_MATERIAL_CLASS_KEYS = [
  'substrates',
  'adhesives',
  'chemicals',
  'additives',
  'coating',
  'packing_materials',
  'mounting_tapes',
];

const SUBSTRATE_PROFILE_DETECTORS = [
  { key: 'substrates_alu_foil', re: /(aluminium|aluminum|alu\s*\/\s*pap|alu\s*foil|foil\s*alu|butter\s*foil|\balu\b)/i },
  { key: 'substrates_bopp', re: /\bbopp\b/i },
  { key: 'substrates_cpp', re: /\bcpp\b|\bcast\s*pp\b|\brcpp\b/i },
  { key: 'substrates_petg', re: /\bpet\s*g\b|\bpetg\b|\bg-pet\b/i },
  { key: 'substrates_petc', re: /\bpet\s*c\b|\bpetc\b|\bc-pet\b/i },
  { key: 'substrates_pet', re: /\bbopet\b|\bpet\b(?!\s*[cg])/i },
  { key: 'substrates_pa', re: /\bbopa\b|\bnylon\b|\bpa\s*6\b|\bpa\b/i },
  { key: 'substrates_pvc', re: /\bpvc\b/i },
  { key: 'substrates_alu_pap', re: /\balu\s*\/?\s*pap\b|\bbutter\s*foil\b|\bwalki\b|paper\s*\/\s*foil|foil\s*lam/i },
  { key: 'substrates_pap', re: /\bpaper\b|\bpap\b|\bkraft\b|\bglassine\b/i },
  { key: 'substrates_pe', re: /\b(?:ld|lld|hd|m)pe\b|\bpe\s*lam/i },
];

const PARAM_LABEL_OVERRIDES = {
  cof: 'COF',
  otr_cc_m2_day: 'OTR',
  wvtr_g_m2_day: 'WVTR',
  mfi_g_10min: 'MFI',
  sit_c: 'SIT',
  seal_init_temp_c: 'Seal Init Temp',
  seal_temp_min_c: 'Seal Temp Min',
  seal_temp_max_c: 'Seal Temp Max',
  md_pct: 'MD %',
  td_pct: 'TD %',
};

const MRP_TYPE_KEYS = ['PD', 'ND', 'VB'];

function normalizeMaterialKey(value) {
  return String(value || '').trim().toLowerCase();
}

function cleanText(value, maxLength = null) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return maxLength && text.length > maxLength ? text.slice(0, maxLength) : text;
}

function normalizeMaterialKeyArray(values) {
  const source = Array.isArray(values)
    ? values
    : (typeof values === 'string' ? values.split(',') : []);

  return Array.from(new Set(
    source
      .map((value) => normalizeMaterialKey(value))
      .filter(Boolean)
  ));
}

function parseOptionalNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseOptionalInteger(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return undefined;
  return n;
}

function parseOptionalDate(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

const LEGACY_PRICING_KEYS = [
  ['price', 'control'],
  ['map', 'price'],
  ['standard', 'price'],
  ['last', 'po', 'price'],
  ['default', 'price'],
].map((parts) => parts.join('_'));

function stripLegacyPricingFields(row) {
  if (!isPlainObject(row)) return row;
  const next = { ...row };
  LEGACY_PRICING_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(next, key)) {
      delete next[key];
    }
  });
  return next;
}

function stripLegacyPricingArray(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => stripLegacyPricingFields(row));
}

function isMissingParamsOverrideColumn(err) {
  return err?.code === '42703'
    && String(err?.message || '').toLowerCase().includes('params_override');
}

function resolveSubstrateProfile(catDesc, appearance, sampleText = '') {
  const context = [catDesc, appearance, sampleText]
    .map((v) => String(v || '').trim().toLowerCase())
    .join(' ');

  for (const detector of SUBSTRATE_PROFILE_DETECTORS) {
    if (detector.re.test(context)) return detector.key;
  }

  return 'substrates';
}

function toTitleCaseWords(raw) {
  return String(raw || '')
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => {
      if (/^[a-z]{1,3}$/i.test(part) && part.toUpperCase() === part) return part;
      if (part.length <= 3 && part.toLowerCase() !== 'day') return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

function inferParamMeta(key) {
  const k = String(key || '').toLowerCase();
  let unit = '';
  let decimals = 2;

  if (k.includes('_pct') || k.endsWith('_pct') || k === 'md_pct' || k === 'td_pct') {
    unit = '%';
    decimals = 2;
  } else if (k.includes('density')) {
    unit = 'g/cm³';
    decimals = 4;
  } else if (k.includes('_mic')) {
    unit = 'µm';
    decimals = 2;
  } else if (k.includes('_mm')) {
    unit = 'mm';
    decimals = 2;
  } else if (k.includes('_c')) {
    unit = '°C';
    decimals = 1;
  } else if (k.includes('_mpa')) {
    unit = 'MPa';
    decimals = 2;
  } else if (k.includes('_mn')) {
    unit = 'mN';
    decimals = 1;
  } else if (k.includes('_kn_m')) {
    unit = 'kN/m';
    decimals = 2;
  } else if (k.includes('_n_15mm')) {
    unit = 'N/15mm';
    decimals = 2;
  } else if (k.includes('_n_mm')) {
    unit = 'N/mm';
    decimals = 2;
  } else if (k.includes('_n')) {
    unit = 'N';
    decimals = 2;
  } else if (k.includes('_gsm')) {
    unit = 'g/m²';
    decimals = 2;
  } else if (k.includes('otr')) {
    unit = 'cc/m²/day';
    decimals = 2;
  } else if (k.includes('wvtr')) {
    unit = 'g/m²/day';
    decimals = 2;
  } else if (k.includes('yield') && k.includes('m2')) {
    unit = 'm²/kg';
    decimals = 2;
  } else if (k.includes('grammage') || k === 'gsm') {
    unit = 'g/m²';
    decimals = 2;
  } else if (k.includes('cof')) {
    unit = '—';
    decimals = 3;
  }

  return {
    key,
    label: PARAM_LABEL_OVERRIDES[key] || toTitleCaseWords(key),
    unit,
    decimals,
  };
}

function round4(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10000) / 10000;
}

function filterDetailItems(items, { search, supplier } = {}) {
  const source = Array.isArray(items) ? items : [];
  const searchText = String(search || '').trim().toLowerCase();
  const supplierFilter = String(supplier || '').trim();
  const hasSupplierFilter = supplierFilter && supplierFilter.toLowerCase() !== 'all';

  return source.filter((item) => {
    if (!isPlainObject(item)) return false;

    const itemSupplier = String(item.supplier || '').trim();
    if (hasSupplierFilter && itemSupplier !== supplierFilter) return false;

    if (!searchText) return true;

    const itemCode = String(item.mainitem || '').toLowerCase();
    const description = String(item.maindescription || '').toLowerCase();
    const supplierText = itemSupplier.toLowerCase();
    return itemCode.includes(searchText)
      || description.includes(searchText)
      || supplierText.includes(searchText);
  });
}

async function getParameterDefinitionsMap(materialClass, parameterKeys) {
  const materialClassKey = normalizeMaterialKey(materialClass);
  const keys = Array.from(new Set(
    (Array.isArray(parameterKeys) ? parameterKeys : [])
      .map((key) => normalizeMaterialKey(key))
      .filter(Boolean)
  ));

  if (!materialClassKey || !keys.length) return {};

  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (LOWER(TRIM(field_key)))
        LOWER(TRIM(field_key)) AS field_key,
        label,
        unit,
        display_group,
        test_conditions,
        has_test_method,
        test_method_options,
        sort_order,
        profile,
        id
      FROM mes_parameter_definitions
      WHERE LOWER(TRIM(material_class)) = $1
        AND LOWER(TRIM(field_key)) = ANY($2)
      ORDER BY LOWER(TRIM(field_key)), profile NULLS FIRST, sort_order ASC, id ASC
    `, [materialClassKey, keys]);

    const map = {};
    rows.forEach((row) => {
      const fieldKey = normalizeMaterialKey(row.field_key);
      if (!fieldKey) return;

      const methodOptions = Array.isArray(row.test_method_options)
        ? row.test_method_options.filter(Boolean).map((value) => String(value).trim()).filter(Boolean)
        : [];

      const testMethod = cleanText(row.test_conditions, 300)
        || (methodOptions.length ? cleanText(methodOptions.join(', '), 300) : null)
        || null;

      map[fieldKey] = {
        label: cleanText(row.label, 150),
        unit: cleanText(row.unit, 40),
        group: cleanText(row.display_group, 80),
        test_method: testMethod,
      };
    });

    return map;
  } catch (err) {
    // Older DB snapshots may not have the parameter definitions table yet.
    if (err.code === '42P01') return {};
    throw err;
  }
}

function buildDetailAggregates(items, materialClass, parameterDefinitionsMap = {}) {
  const source = Array.isArray(items) ? items : [];

  let stockQty = 0;
  let orderQty = 0;
  let stockVal = 0;
  let orderVal = 0;
  let marketQty = 0;
  let marketVal = 0;

  const specAgg = {};

  source.forEach((item) => {
    if (!isPlainObject(item)) return;

    const sq = Number(item.stock_qty) || 0;
    const oq = Number(item.order_qty) || 0;
    const sp = toFiniteNumber(item.stock_price);
    const op = toFiniteNumber(item.on_order_price);
    const mp = toFiniteNumber(item.market_price);

    stockQty += sq;
    orderQty += oq;

    if (sp != null && sq > 0) stockVal += sq * sp;
    if (op != null && oq > 0) orderVal += oq * op;
    if (mp != null && sq > 0) {
      marketQty += sq;
      marketVal += sq * mp;
    }

    const params = isPlainObject(item.tds_params) ? item.tds_params : {};
    const weight = sq > 0 ? sq : 1;

    Object.entries(params).forEach(([key, rawValue]) => {
      const value = toFiniteNumber(rawValue);
      if (value == null) return;

      if (!specAgg[key]) {
        specAgg[key] = {
          weightedSum: 0,
          weightedQty: 0,
          min: null,
          max: null,
        };
      }

      specAgg[key].weightedSum += value * weight;
      specAgg[key].weightedQty += weight;
      if (specAgg[key].min == null || value < specAgg[key].min) specAgg[key].min = value;
      if (specAgg[key].max == null || value > specAgg[key].max) specAgg[key].max = value;
    });
  });

  const stockPriceWA = stockQty > 0 ? round4(stockVal / stockQty) : null;
  const onOrderPriceWA = orderQty > 0 ? round4(orderVal / orderQty) : null;
  const totalQty = stockQty + orderQty;
  const avgPriceWA = totalQty > 0 ? round4((stockVal + orderVal) / totalQty) : null;
  const marketPriceWA = marketQty > 0 ? round4(marketVal / marketQty) : (onOrderPriceWA ?? stockPriceWA ?? null);

  const totals = {
    stock_qty: stockQty,
    order_qty: orderQty,
    stock_val: Math.round(stockVal * 100) / 100,
    order_val: Math.round(orderVal * 100) / 100,
    stock_price_wa: stockPriceWA,
    on_order_price_wa: onOrderPriceWA,
    avg_price_wa: avgPriceWA,
    market_price_wa: marketPriceWA,
  };

  const specRows = Object.entries(specAgg)
    .map(([key, row]) => {
      const normalizedKey = normalizeMaterialKey(key);
      const schemaMeta = isPlainObject(parameterDefinitionsMap[normalizedKey])
        ? parameterDefinitionsMap[normalizedKey]
        : null;
      const meta = inferParamMeta(normalizedKey);

      return {
        key: normalizedKey,
        label: schemaMeta?.label || meta.label,
        unit: schemaMeta?.unit || meta.unit,
        decimals: meta.decimals,
        group: schemaMeta?.group || null,
        test_method: schemaMeta?.test_method || null,
        weightedAvg: row.weightedQty > 0 ? round4(row.weightedSum / row.weightedQty) : null,
        min: row.min != null ? round4(row.min) : null,
        max: row.max != null ? round4(row.max) : null,
      };
    })
    .sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));

  const specByKey = {};
  specRows.forEach((row) => {
    specByKey[row.key] = row.weightedAvg;
  });

  const findSpec = (...keys) => {
    for (const key of keys) {
      const value = specByKey[key];
      if (value != null) return value;
    }
    return null;
  };

  const density = findSpec('density_g_cm3', 'density');
  const thicknessMicron = findSpec('thickness_micron', 'thickness_mic', 'micron_thickness', 'thickness_um');
  const yieldM2PerKg = findSpec('yield_m2_per_kg');
  const solidPct = findSpec('solids_pct', 'solid_pct');
  const viscosity = findSpec('viscosity_cps');
  const purity = findSpec('purity_pct');
  const dosage = findSpec('dosage_pct');
  const coatWeight = findSpec('coat_weight_gsm');
  const gsm = findSpec('gsm');

  const derivedYield = density != null && thicknessMicron != null && density > 0 && thicknessMicron > 0
    ? (1000 / (density * thicknessMicron))
    : null;

  const derivedGsm = density != null && thicknessMicron != null
    ? (density * thicknessMicron)
    : null;

  const metrics = [
    { label: 'Stock Qty', value: totals.stock_qty, mode: 'qty' },
    { label: 'Stock Value', value: totals.stock_val, mode: 'currency' },
    { label: 'On Order Qty', value: totals.order_qty, mode: 'qty' },
    { label: 'Order Value', value: totals.order_val, mode: 'currency' },
  ];

  const materialClassKey = normalizeMaterialKey(materialClass);
  if (materialClassKey === 'substrates') {
    metrics.push({ label: 'Density WA', value: density, mode: 'num4' });
    metrics.push({ label: 'Thickness WA (mic)', value: thicknessMicron, mode: 'num2' });
    metrics.push({ label: 'Yield WA (m2/kg)', value: yieldM2PerKg ?? derivedYield, mode: 'num2' });
    metrics.push({ label: 'GSM WA', value: gsm ?? derivedGsm, mode: 'num2' });
  } else if (materialClassKey === 'resins') {
    metrics.push({ label: 'Density WA', value: density, mode: 'num4' });
    metrics.push({ label: 'MFR 190/2.16 WA', value: findSpec('mfr_190_2_16'), mode: 'num2' });
  } else if (materialClassKey === 'adhesives') {
    metrics.push({ label: 'Solid % WA', value: solidPct, mode: 'num2' });
    metrics.push({ label: 'Viscosity WA', value: viscosity, mode: 'num2' });
    metrics.push({ label: 'Density WA', value: density, mode: 'num4' });
  } else if (materialClassKey === 'chemicals') {
    metrics.push({ label: 'Purity % WA', value: purity, mode: 'num2' });
    metrics.push({ label: 'Density WA', value: density, mode: 'num4' });
    metrics.push({ label: 'Viscosity WA', value: viscosity, mode: 'num2' });
  } else if (materialClassKey === 'additives') {
    metrics.push({ label: 'Dosage % WA', value: dosage, mode: 'num2' });
    metrics.push({ label: 'Density WA', value: density, mode: 'num4' });
  } else if (materialClassKey === 'coating') {
    metrics.push({ label: 'Coat Weight WA', value: coatWeight, mode: 'num2' });
    metrics.push({ label: 'Solid % WA', value: solidPct, mode: 'num2' });
    metrics.push({ label: 'Viscosity WA', value: viscosity, mode: 'num2' });
  } else if (materialClassKey === 'packing_materials') {
    metrics.push({ label: 'GSM WA', value: gsm, mode: 'num2' });
  } else if (materialClassKey === 'mounting_tapes') {
    metrics.push({ label: 'Thickness WA', value: thicknessMicron, mode: 'num2' });
  }

  return {
    totals,
    spec_rows: specRows,
    metrics,
  };
}

const ADHESIVE_COMPONENT_ROLES = new Set(['resin', 'hardener', 'catalyst', 'solvent', 'other']);
const ADHESIVE_CANDIDATE_ALL_CACHE_TTL_MS = 5000;
const ADHESIVE_CANDIDATE_ALL_CACHE_MAX_KEYS = 40;
const adhesiveCandidateAllCache = new Map();

function pruneAdhesiveCandidateAllCache(nowTs = Date.now()) {
  for (const [cacheKey, entry] of adhesiveCandidateAllCache.entries()) {
    if (!entry || entry.expiresAt <= nowTs) {
      adhesiveCandidateAllCache.delete(cacheKey);
    }
  }

  if (adhesiveCandidateAllCache.size <= ADHESIVE_CANDIDATE_ALL_CACHE_MAX_KEYS) return;

  const keysByExpiry = Array.from(adhesiveCandidateAllCache.entries())
    .sort((a, b) => (a[1]?.expiresAt || 0) - (b[1]?.expiresAt || 0))
    .map(([cacheKey]) => cacheKey);

  while (adhesiveCandidateAllCache.size > ADHESIVE_CANDIDATE_ALL_CACHE_MAX_KEYS && keysByExpiry.length) {
    adhesiveCandidateAllCache.delete(keysByExpiry.shift());
  }
}

function readAdhesiveCandidateAllCache(searchText) {
  const nowTs = Date.now();
  const cacheKey = normalizeMaterialKey(searchText || '');
  const cached = adhesiveCandidateAllCache.get(cacheKey);
  if (!cached || cached.expiresAt <= nowTs) {
    if (cached) adhesiveCandidateAllCache.delete(cacheKey);
    return null;
  }

  return Array.isArray(cached.rows) ? cached.rows : null;
}

function writeAdhesiveCandidateAllCache(searchText, rows) {
  pruneAdhesiveCandidateAllCache();
  const cacheKey = normalizeMaterialKey(searchText || '');
  adhesiveCandidateAllCache.set(cacheKey, {
    expiresAt: Date.now() + ADHESIVE_CANDIDATE_ALL_CACHE_TTL_MS,
    rows: Array.isArray(rows) ? rows : [],
  });
}

function roundToDigits(value, digits = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function extractSolidPctFromParams(params) {
  if (!isPlainObject(params)) return null;

  const normalizedMap = {};
  Object.entries(params).forEach(([key, value]) => {
    const normalizedKey = String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalizedKey) normalizedMap[normalizedKey] = value;
  });

  const candidateKeys = ['solidspct', 'solidpct', 'solidspercent', 'solidpercent', 'solids'];
  for (const candidateKey of candidateKeys) {
    if (!Object.prototype.hasOwnProperty.call(normalizedMap, candidateKey)) continue;
    const parsed = toFiniteNumber(normalizedMap[candidateKey]);
    if (parsed == null) continue;
    if (parsed < 0 || parsed > 100) continue;
    return parsed;
  }

  return null;
}

function computeAdhesiveFormulationTotals(components) {
  const source = Array.isArray(components) ? components : [];
  let totalParts = 0;
  let totalSolids = 0;
  let totalCost = 0;

  source.forEach((row) => {
    const parts = Number(row?.parts) || 0;
    const solidsPct = Number(row?.solids_pct) || 0;
    const unitPrice = Number(row?.unit_price) || 0;
    if (parts <= 0) return;

    totalParts += parts;
    totalSolids += parts * (solidsPct / 100);
    totalCost += parts * unitPrice;
  });

  const pricePerKgWet = totalParts > 0 ? totalCost / totalParts : 0;
  const pricePerKgSolids = totalSolids > 0 ? totalCost / totalSolids : 0;
  const solidsSharePct = totalParts > 0 ? (totalSolids / totalParts) * 100 : 0;

  return {
    total_parts: roundToDigits(totalParts, 4) ?? 0,
    total_solids: roundToDigits(totalSolids, 4) ?? 0,
    total_cost: roundToDigits(totalCost, 4) ?? 0,
    price_per_kg_wet: roundToDigits(pricePerKgWet, 4) ?? 0,
    price_per_kg_solids: roundToDigits(pricePerKgSolids, 4) ?? 0,
    solids_share_pct: roundToDigits(solidsSharePct, 4) ?? 0,
  };
}

async function getAdhesiveFormulationContext(catId, groupId) {
  const { rows } = await pool.query(
    `SELECT
      g.id,
      g.category_id,
      g.catlinedesc,
      g.display_name,
      g.is_custom,
      g.is_active,
      c.material_class,
      c.name AS category_name
     FROM mes_item_category_groups g
     JOIN mes_item_categories c ON c.id = g.category_id
     WHERE g.id = $1
       AND g.category_id = $2
       AND g.is_active = true
     LIMIT 1`,
    [groupId, catId]
  );

  if (!rows.length) {
    return { status: 404, error: 'Custom group not found' };
  }

  const ctx = rows[0];
  if (!ctx.is_custom) {
    return { status: 400, error: 'Formulation is available only for custom groups' };
  }

  if (normalizeMaterialKey(ctx.material_class) !== 'adhesives') {
    return { status: 400, error: 'Formulation is available only for adhesive categories' };
  }

  return { status: 200, data: ctx };
}

async function loadAdhesiveRmMap(itemKeys) {
  const keys = normalizeMaterialKeyArray(itemKeys);
  if (!keys.length) return {};

  const { rows } = await pool.query(`
    SELECT
      LOWER(TRIM(mainitem)) AS item_key,
      MAX(mainitem) AS mainitem,
      MAX(NULLIF(TRIM(maindescription), '')) AS maindescription,
      MAX(NULLIF(TRIM(catlinedesc), '')) AS catlinedesc,
      MAX(NULLIF(TRIM(category), '')) AS category,
      MAX(NULLIF(TRIM(itemgroup), '')) AS itemgroup,
      COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END), 0)::numeric AS stock_qty,
      COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END), 0)::numeric AS stock_val,
      COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END), 0)::numeric AS order_qty,
      COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END), 0)::numeric AS order_val
    FROM fp_actualrmdata
    WHERE LOWER(TRIM(mainitem)) = ANY($1)
    GROUP BY LOWER(TRIM(mainitem))
  `, [keys]);

  const rmMap = {};
  rows.forEach((row) => {
    const key = normalizeMaterialKey(row.item_key);
    if (!key) return;

    const stockQty = Number(row.stock_qty) || 0;
    const stockVal = Number(row.stock_val) || 0;
    const orderQty = Number(row.order_qty) || 0;
    const orderVal = Number(row.order_val) || 0;

    const stockPrice = stockQty > 0 ? stockVal / stockQty : null;
    const onOrderPrice = orderQty > 0 ? orderVal / orderQty : null;
    const totalQty = stockQty + orderQty;
    const avgPrice = totalQty > 0 ? (stockVal + orderVal) / totalQty : null;

    rmMap[key] = {
      item_key: key,
      mainitem: row.mainitem || null,
      maindescription: row.maindescription || null,
      catlinedesc: row.catlinedesc || null,
      category: row.category || null,
      itemgroup: row.itemgroup || null,
      stock_price_wa: roundToDigits(stockPrice, 4),
      on_order_price_wa: roundToDigits(onOrderPrice, 4),
      avg_price_wa: roundToDigits(avgPrice, 4),
    };
  });

  return rmMap;
}

async function loadAdhesiveMasterMap(itemKeys) {
  const keys = normalizeMaterialKeyArray(itemKeys);
  if (!keys.length) return {};

  const { rows } = await pool.query(`
    SELECT item_code, item_name, oracle_category, oracle_cat_desc, market_ref_price
    FROM mes_item_master
    WHERE LOWER(TRIM(item_code)) = ANY($1)
      AND is_active = true
  `, [keys]);

  const masterMap = {};
  rows.forEach((row) => {
    const key = normalizeMaterialKey(row.item_code);
    if (!key) return;
    masterMap[key] = row;
  });

  return masterMap;
}

async function loadAdhesiveSolidPctMap(itemKeys) {
  const keys = normalizeMaterialKeyArray(itemKeys);
  if (!keys.length) return {};

  const solidsMap = {};

  try {
    const { rows: adhesiveSpecRows } = await pool.query(`
      SELECT
        COALESCE(NULLIF(LOWER(TRIM(mainitem)), ''), LOWER(TRIM(material_key))) AS item_key,
        solids_pct
      FROM mes_spec_adhesives
      WHERE COALESCE(NULLIF(LOWER(TRIM(mainitem)), ''), LOWER(TRIM(material_key))) = ANY($1)
    `, [keys]);

    adhesiveSpecRows.forEach((row) => {
      const key = normalizeMaterialKey(row.item_key);
      const solidsPct = toFiniteNumber(row.solids_pct);
      if (!key || solidsPct == null) return;
      if (solidsPct < 0 || solidsPct > 100) return;
      solidsMap[key] = solidsPct;
    });
  } catch (err) {
    if (err.code !== '42P01') throw err;
  }

  try {
    const { rows: nonResinRows } = await pool.query(`
      SELECT
        COALESCE(NULLIF(LOWER(TRIM(mainitem)), ''), LOWER(TRIM(material_key))) AS item_key,
        parameters_json
      FROM mes_non_resin_material_specs
      WHERE COALESCE(NULLIF(LOWER(TRIM(mainitem)), ''), LOWER(TRIM(material_key))) = ANY($1)
    `, [keys]);

    nonResinRows.forEach((row) => {
      const key = normalizeMaterialKey(row.item_key);
      if (!key || Object.prototype.hasOwnProperty.call(solidsMap, key)) return;
      const solidsPct = extractSolidPctFromParams(row.parameters_json);
      if (solidsPct == null) return;
      solidsMap[key] = solidsPct;
    });
  } catch (err) {
    if (err.code !== '42P01') throw err;
  }

  return solidsMap;
}

function resolveAdhesiveUnitPrice({ overridePrice, rmInfo, masterInfo }) {
  const override = toFiniteNumber(overridePrice);
  if (override != null) return { value: override, source: 'override' };

  const avg = toFiniteNumber(rmInfo?.avg_price_wa);
  if (avg != null) return { value: avg, source: 'oracle_avg' };

  const onOrder = toFiniteNumber(rmInfo?.on_order_price_wa);
  if (onOrder != null) return { value: onOrder, source: 'oracle_on_order' };

  const stock = toFiniteNumber(rmInfo?.stock_price_wa);
  if (stock != null) return { value: stock, source: 'oracle_stock' };

  const marketRef = toFiniteNumber(masterInfo?.market_ref_price);
  if (marketRef != null) return { value: marketRef, source: 'market_ref' };

  return { value: null, source: null };
}

async function getAdhesiveFormulationData(catId, groupId) {
  const ctxResult = await getAdhesiveFormulationContext(catId, groupId);
  if (ctxResult.error) return ctxResult;
  const ctx = ctxResult.data;

  let componentRows = [];
  try {
    const { rows } = await pool.query(`
      SELECT
        id,
        item_key,
        component_role,
        parts,
        solids_pct,
        unit_price_override,
        sort_order,
        notes,
        created_at,
        updated_at
      FROM mes_adhesive_formulation_components
      WHERE group_id = $1
      ORDER BY sort_order ASC, id ASC
    `, [groupId]);
    componentRows = rows;
  } catch (err) {
    if (err.code === '42P01') {
      return {
        status: 200,
        data: {
          group_id: ctx.id,
          group_name: ctx.display_name || ctx.catlinedesc,
          category_id: ctx.category_id,
          category_name: ctx.category_name,
          material_class: ctx.material_class,
          has_formulation: false,
          components: [],
          totals: computeAdhesiveFormulationTotals([]),
        },
      };
    }
    throw err;
  }

  const itemKeys = componentRows.map((row) => row.item_key);
  const [rmMap, masterMap, solidPctMap] = await Promise.all([
    loadAdhesiveRmMap(itemKeys),
    loadAdhesiveMasterMap(itemKeys),
    loadAdhesiveSolidPctMap(itemKeys),
  ]);

  const components = componentRows.map((row) => {
    const itemKey = normalizeMaterialKey(row.item_key);
    const rmInfo = rmMap[itemKey] || {};
    const masterInfo = masterMap[itemKey] || {};
    const overrideSolidPct = toFiniteNumber(row.solids_pct);
    const tdsSolidPct = toFiniteNumber(solidPctMap[itemKey]);

    const solidsPct = overrideSolidPct != null ? overrideSolidPct : (tdsSolidPct != null ? tdsSolidPct : null);
    const solidsSource = overrideSolidPct != null ? 'override' : (tdsSolidPct != null ? 'tds' : null);

    const priceResolution = resolveAdhesiveUnitPrice({
      overridePrice: row.unit_price_override,
      rmInfo,
      masterInfo,
    });

    const parts = toFiniteNumber(row.parts) ?? 0;
    const unitPrice = toFiniteNumber(priceResolution.value);
    const componentCost = unitPrice != null ? roundToDigits(parts * unitPrice, 4) : null;

    return {
      id: row.id,
      item_key: itemKey,
      mainitem: rmInfo.mainitem || masterInfo.item_code || row.item_key,
      maindescription: rmInfo.maindescription || masterInfo.item_name || null,
      catlinedesc: rmInfo.catlinedesc || null,
      category: rmInfo.category || masterInfo.oracle_category || null,
      itemgroup: rmInfo.itemgroup || null,
      component_role: row.component_role || 'other',
      parts,
      solids_pct: solidsPct,
      solids_pct_source: solidsSource,
      solids_pct_override: overrideSolidPct,
      tds_solids_pct: tdsSolidPct,
      unit_price: unitPrice,
      unit_price_source: priceResolution.source,
      unit_price_override: toFiniteNumber(row.unit_price_override),
      oracle_stock_price: toFiniteNumber(rmInfo.stock_price_wa),
      oracle_on_order_price: toFiniteNumber(rmInfo.on_order_price_wa),
      oracle_avg_price: toFiniteNumber(rmInfo.avg_price_wa),
      market_ref_price: toFiniteNumber(masterInfo.market_ref_price),
      component_cost: componentCost,
      sort_order: parseOptionalInteger(row.sort_order) ?? 0,
      notes: row.notes || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });

  return {
    status: 200,
    data: {
      group_id: ctx.id,
      group_name: ctx.display_name || ctx.catlinedesc,
      category_id: ctx.category_id,
      category_name: ctx.category_name,
      material_class: ctx.material_class,
      has_formulation: components.length > 0,
      components,
      totals: computeAdhesiveFormulationTotals(components),
    },
  };
}

module.exports = function (router) {

  // ─── GET /items — List with filters ───────────────────────────────────────
  router.get('/items', authenticate, async (req, res) => {
    try {
      const { item_type, subcategory, search, is_active } = req.query;
      const params = [];
      const conditions = [];
      let p = 1;

      // Default: only active items
      if (is_active === 'false') {
        conditions.push('i.is_active = false');
      } else {
        conditions.push('i.is_active = true');
      }

      if (item_type) {
        conditions.push(`i.item_type = $${p++}`);
        params.push(item_type);
      }
      if (subcategory) {
        conditions.push(`i.subcategory = $${p++}`);
        params.push(subcategory);
      }
      if (search) {
        conditions.push(`(i.item_name ILIKE $${p} OR i.item_code ILIKE $${p})`);
        params.push(`%${search}%`);
        p++;
      }

      // LEFT JOIN fp_actualrmdata to get live weighted avg prices per oracle_cat_desc
      const sql = `
        WITH rm_prices AS (
          SELECT
            catlinedesc,
            MAX(NULLIF(TRIM(mainunit), '')) AS main_unit,
            COUNT(DISTINCT NULLIF(TRIM(mainitem), '')) AS mapped_item_count,
            SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END) AS stock_qty,
            SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END) AS order_qty,
            CASE
              WHEN SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END) > 0
              THEN SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END)
                   / SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END)
              ELSE NULL
            END AS stock_price_wa,
            CASE
              WHEN SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END) > 0
              THEN SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END)
                   / SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END)
              ELSE NULL
            END AS on_order_price_wa
            ,CASE
              WHEN SUM(
                CASE
                  WHEN mainitemstock > 0
                   AND trim(COALESCE(weights, '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
                  THEN mainitemstock
                  ELSE 0
                END
              ) > 0
              THEN SUM(
                CASE
                  WHEN mainitemstock > 0
                   AND trim(COALESCE(weights, '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
                  THEN (weights::numeric * mainitemstock)
                  ELSE 0
                END
              ) / SUM(
                CASE
                  WHEN mainitemstock > 0
                   AND trim(COALESCE(weights, '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
                  THEN mainitemstock
                  ELSE 0
                END
              )
              ELSE NULL
            END AS density_wa
          FROM fp_actualrmdata
          WHERE catlinedesc IS NOT NULL
          GROUP BY catlinedesc
        )
        SELECT i.*,
               COALESCE(rp.stock_price_wa,    i.stock_price)    AS stock_price,
           COALESCE(rp.on_order_price_wa, i.on_order_price) AS on_order_price,
            COALESCE(rp.density_wa, NULLIF(i.density_g_cm3, 0)) AS density_g_cm3,
            COALESCE(rp.main_unit, NULLIF(TRIM(i.base_uom), ''), 'KG') AS uom,
            COALESCE(rp.mapped_item_count, 0) AS mapped_item_count,
           COALESCE(rp.stock_qty, 0) AS stock_qty,
           COALESCE(rp.order_qty, 0) AS order_qty
        FROM mes_item_master i
        LEFT JOIN rm_prices rp ON rp.catlinedesc = i.oracle_cat_desc
        WHERE ${conditions.join(' AND ')}
        ORDER BY i.item_type, i.item_code
      `;
      const { rows } = await pool.query(sql, params);
      res.json({ success: true, data: stripLegacyPricingArray(rows) });
    } catch (err) {
      logger.error('GET /items error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch items' });
    }
  });

  // ─── GET /items/fp-averages — Oracle reference + physical averages per catlinedesc ──
  // MUST be before /:id to avoid route ambiguity
  router.get('/items/fp-averages', authenticate, async (req, res) => {
    const { cat_desc } = req.query;
    if (!cat_desc) return res.status(400).json({ success: false, error: 'cat_desc required' });
    try {
      const { rows } = await pool.query(`
        SELECT
          -- Oracle ERP reference fields
          (SELECT MIN(mainunit)
             FROM fp_actualrmdata WHERE catlinedesc = $1 AND mainunit IS NOT NULL)       AS mainunit,
          (SELECT MIN(itemgroup)
             FROM fp_actualrmdata WHERE catlinedesc = $1 AND itemgroup IS NOT NULL)      AS itemgroup,
          (SELECT MIN(maindescription)
             FROM fp_actualrmdata WHERE catlinedesc = $1 AND maindescription IS NOT NULL) AS item_name_hint,
          -- Physical averages from mes_item_master rows sharing this oracle_cat_desc
          -- Stock-weighted: tries fp_actualrmdata.mainitem = item_code; falls back to simple avg
          (SELECT CASE
                    WHEN SUM(CASE WHEN rm.mainitemstock > 0 THEN rm.mainitemstock ELSE 0 END) > 0
                    THEN ROUND((SUM(CASE WHEN rm.mainitemstock > 0 THEN i2.density_g_cm3 * rm.mainitemstock ELSE 0 END)
                                / NULLIF(SUM(CASE WHEN rm.mainitemstock > 0 THEN rm.mainitemstock ELSE 0 END), 0))::numeric, 4)
                    ELSE ROUND(AVG(i2.density_g_cm3)::numeric, 4)
                  END
             FROM mes_item_master i2
             LEFT JOIN fp_actualrmdata rm ON rm.mainitem = i2.item_code
             WHERE i2.oracle_cat_desc = $1 AND i2.is_active = true AND i2.density_g_cm3 IS NOT NULL
          ) AS avg_density,
          (SELECT CASE
                    WHEN SUM(CASE WHEN rm.mainitemstock > 0 THEN rm.mainitemstock ELSE 0 END) > 0
                    THEN ROUND((SUM(CASE WHEN rm.mainitemstock > 0 THEN i2.micron_thickness * rm.mainitemstock ELSE 0 END)
                                / NULLIF(SUM(CASE WHEN rm.mainitemstock > 0 THEN rm.mainitemstock ELSE 0 END), 0))::numeric, 2)
                    ELSE ROUND(AVG(i2.micron_thickness)::numeric, 2)
                  END
             FROM mes_item_master i2
             LEFT JOIN fp_actualrmdata rm ON rm.mainitem = i2.item_code
             WHERE i2.oracle_cat_desc = $1 AND i2.is_active = true AND i2.micron_thickness IS NOT NULL
          ) AS avg_micron,
          (SELECT ROUND(AVG(i2.width_mm)::numeric, 2)
             FROM mes_item_master i2
             WHERE i2.oracle_cat_desc = $1 AND i2.is_active = true AND i2.width_mm IS NOT NULL
          ) AS avg_width,
          (SELECT ROUND(AVG(i2.solid_pct)::numeric, 2)
             FROM mes_item_master i2
             WHERE i2.oracle_cat_desc = $1 AND i2.is_active = true AND i2.solid_pct IS NOT NULL
          ) AS avg_solid_pct,
          (SELECT COUNT(*)
             FROM mes_item_master i2
             WHERE i2.oracle_cat_desc = $1 AND i2.is_active = true
          ) AS item_count
      `, [cat_desc]);
      res.json({ success: true, data: rows[0] || {} });
    } catch (err) {
      logger.error('GET /items/fp-averages error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch fp averages' });
    }
  });

  // ─── GET /items/resin-profile — full resin profile with weighted metrics ──
  // MUST be before /:id to avoid route ambiguity
  router.get('/items/resin-profile', authenticate, async (req, res) => {
    const { cat_desc } = req.query;
    const taxonomyCategoryId = parseOptionalInteger(req.query.taxonomy_category_id);
    if (!cat_desc) return res.status(400).json({ success: false, error: 'cat_desc required' });
    if (req.query.taxonomy_category_id !== undefined && taxonomyCategoryId === undefined) {
      return res.status(400).json({ success: false, error: 'taxonomy_category_id must be an integer' });
    }

    // Item Master splits Film Scrap into two cat_desc variants; TDS uses one value.
    const tdsCatDesc = String(cat_desc).toLowerCase().startsWith('film scrap') ? 'Film Scrap' : String(cat_desc);

    try {
      const inventoryResult = await pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END), 0) AS total_stock_qty,
          COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END), 0) AS total_stock_val,
          COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END), 0) AS total_order_qty,
          COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END), 0) AS total_order_val,
          CASE WHEN SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END) > 0
            THEN ROUND((
              SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END)
              / SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END)
            )::numeric, 4)
            ELSE NULL
          END AS stock_price_wa,
          CASE WHEN SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END) > 0
            THEN ROUND((
              SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END)
              / SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END)
            )::numeric, 4)
            ELSE NULL
          END AS on_order_price_wa,
          CASE WHEN (
            SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END)
            + SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END)
          ) > 0
            THEN ROUND((
              (
                SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END)
                + SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END)
              )
              / (
                SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END)
                + SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END)
              )
            )::numeric, 4)
            ELSE NULL
          END AS combined_price_wa,
          CASE WHEN SUM(
            CASE
              WHEN mainitemstock > 0
               AND trim(COALESCE(weights, '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
              THEN mainitemstock
              ELSE 0
            END
          ) > 0
            THEN ROUND((
              SUM(
                CASE
                  WHEN mainitemstock > 0
                   AND trim(COALESCE(weights, '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
                  THEN (weights::numeric * mainitemstock)
                  ELSE 0
                END
              )
              / SUM(
                CASE
                  WHEN mainitemstock > 0
                   AND trim(COALESCE(weights, '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
                  THEN mainitemstock
                  ELSE 0
                END
              )
            )::numeric, 4)
            ELSE NULL
          END AS density_wa
        FROM fp_actualrmdata
        WHERE catlinedesc = $1
      `, [cat_desc]);

      const tdsFields = [
        { col: 'mfr_190_2_16', divisor: 1 },
        { col: 'mfr_190_5_0', divisor: 1 },
        { col: 'hlmi_190_21_6', divisor: 1 },
        { col: 'mfr_230_2_16_pp', divisor: 1 },
        { col: 'melt_flow_ratio', divisor: 1 },
        { col: 'density', divisor: 1000 },
        { col: 'crystalline_melting_point', divisor: 1 },
        { col: 'vicat_softening_point', divisor: 1 },
        { col: 'heat_deflection_temp', divisor: 1 },
        { col: 'tensile_strength_break', divisor: 1 },
        { col: 'elongation_break', divisor: 1 },
        { col: 'brittleness_temp', divisor: 1 },
        { col: 'bulk_density', divisor: 1000 },
        { col: 'flexural_modulus', divisor: 1 },
      ];

      const tdsSelects = tdsFields.map((field) => {
        const expr = field.divisor === 1 ? `t.${field.col}` : `t.${field.col} / ${field.divisor}.0`;
        return `
          CASE
            WHEN SUM(CASE WHEN t.${field.col} IS NOT NULL AND t.stock_qty > 0 THEN t.stock_qty ELSE 0 END) > 0
            THEN ROUND((
              SUM(CASE WHEN t.${field.col} IS NOT NULL AND t.stock_qty > 0 THEN (${expr}) * t.stock_qty ELSE 0 END)
              / NULLIF(SUM(CASE WHEN t.${field.col} IS NOT NULL AND t.stock_qty > 0 THEN t.stock_qty ELSE 0 END), 0)
            )::numeric, 4)
            ELSE ROUND(AVG(CASE WHEN t.${field.col} IS NOT NULL THEN (${expr}) ELSE NULL END)::numeric, 4)
          END AS ${field.col}_wa
        `;
      }).join(',\n');

      const tdsDedupSelects = tdsFields.map((field) => (
        `AVG(t.${field.col}) AS ${field.col}`
      )).join(',\n');

      const tdsResult = await pool.query(`
        WITH rm_by_item AS (
          SELECT
            mainitem,
            SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END) AS stock_qty
          FROM fp_actualrmdata
          GROUP BY mainitem
        ),
        tds_raw AS (
          SELECT
            t.*,
            COALESCE(r.stock_qty, 0) AS stock_qty
          FROM mes_material_tds t
          LEFT JOIN rm_by_item r ON r.mainitem = t.oracle_item_code
          WHERE t.category = 'Resins'
            AND (
              ($2::int IS NOT NULL AND t.taxonomy_category_id = $2)
              OR (($2::int IS NULL OR t.taxonomy_category_id IS NULL) AND t.cat_desc = $1)
            )
        ),
        tds_base AS (
          SELECT
            t.oracle_item_code,
            MAX(t.stock_qty) AS stock_qty,
            ${tdsDedupSelects}
          FROM tds_raw t
          GROUP BY t.oracle_item_code
        )
        SELECT
          COUNT(*) AS tds_grade_count,
          ${tdsSelects}
        FROM tds_base t
      `, [tdsCatDesc, taxonomyCategoryId]);

      const gradeTdsSelects = tdsFields.map((field) => {
        const expr = field.divisor === 1 ? `j.${field.col}` : `(j.${field.col} / ${field.divisor}.0)`;
        return `
          ROUND(AVG(CASE WHEN j.${field.col} IS NOT NULL THEN ${expr} ELSE NULL END)::numeric, 4) AS ${field.col}
        `;
      }).join(',\n');

      const gradeResult = await pool.query(`
        WITH rm_by_item AS (
          SELECT
            mainitem,
            MAX(NULLIF(trim(mainunit), '')) AS main_unit,
            COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END), 0)::numeric AS stock_qty,
            COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END), 0)::numeric AS stock_val,
            COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END), 0)::numeric AS order_qty,
            COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END), 0)::numeric AS order_val,
            COALESCE(SUM(
              CASE
                WHEN mainitemstock > 0
                 AND trim(COALESCE(weights, '')) ~ '^-?[0-9]+(\\.[0-9]+)?$'
                THEN mainitemstock
                ELSE 0
              END
            ), 0)::numeric AS density_weight_qty,
            COALESCE(SUM(
              CASE
                WHEN mainitemstock > 0
                 AND trim(COALESCE(weights, '')) ~ '^-?[0-9]+(\\.[0-9]+)?$'
                THEN (weights::numeric * mainitemstock)
                ELSE 0
              END
            ), 0)::numeric AS density_weight_val
          FROM fp_actualrmdata
          GROUP BY mainitem
        ),
        tds_joined AS (
          SELECT
            t.id,
            t.oracle_item_code,
            t.brand_grade,
            t.cat_desc,
            COALESCE(NULLIF(trim(s.name), ''), 'Unknown') AS supplier_name,
            COALESCE(NULLIF(trim(r.main_unit), ''), 'KG') AS unit,
            COALESCE(r.stock_qty, 0)::numeric AS stock_qty,
            COALESCE(r.order_qty, 0)::numeric AS order_qty,
            COALESCE(r.stock_val, 0)::numeric AS stock_val,
            COALESCE(r.order_val, 0)::numeric AS order_val,
            COALESCE(r.density_weight_qty, 0)::numeric AS density_weight_qty,
            COALESCE(r.density_weight_val, 0)::numeric AS density_weight_val,
            t.mfr_190_2_16, t.mfr_190_5_0, t.hlmi_190_21_6, t.mfr_230_2_16_pp, t.melt_flow_ratio,
            t.density, t.crystalline_melting_point, t.vicat_softening_point, t.heat_deflection_temp,
            t.tensile_strength_break, t.elongation_break, t.brittleness_temp, t.bulk_density, t.flexural_modulus
          FROM mes_material_tds t
          LEFT JOIN mes_suppliers s ON s.id = t.supplier_id
          LEFT JOIN rm_by_item r ON r.mainitem = t.oracle_item_code
          WHERE t.category = 'Resins'
            AND (
              ($2::int IS NOT NULL AND t.taxonomy_category_id = $2)
              OR (($2::int IS NULL OR t.taxonomy_category_id IS NULL) AND t.cat_desc = $1)
            )
        )
        SELECT
          MIN(j.id) AS tds_id,
          j.oracle_item_code,
          CASE
            WHEN COUNT(DISTINCT COALESCE(NULLIF(trim(j.brand_grade), ''), j.oracle_item_code)) > 1
            THEN string_agg(DISTINCT COALESCE(NULLIF(trim(j.brand_grade), ''), j.oracle_item_code), ' / ')
            ELSE MIN(COALESCE(NULLIF(trim(j.brand_grade), ''), j.oracle_item_code))
          END AS brand_grade,
          MIN(j.cat_desc) AS cat_desc,
          CASE
            WHEN COUNT(DISTINCT j.supplier_name) > 1
            THEN string_agg(DISTINCT j.supplier_name, ' / ')
            ELSE MIN(j.supplier_name)
          END AS supplier_name,
          COALESCE(MAX(j.unit), 'KG') AS unit,
          MAX(j.stock_qty)::numeric AS stock_qty,
          MAX(j.order_qty)::numeric AS order_qty,
          CASE
            WHEN MAX(j.stock_qty) > 0
            THEN ROUND((MAX(j.stock_val) / NULLIF(MAX(j.stock_qty), 0))::numeric, 4)
            ELSE NULL
          END AS stock_price_wa,
          CASE
            WHEN MAX(j.order_qty) > 0
            THEN ROUND((MAX(j.order_val) / NULLIF(MAX(j.order_qty), 0))::numeric, 4)
            ELSE NULL
          END AS on_order_price_wa,
          CASE
            WHEN MAX(j.density_weight_qty) > 0
            THEN ROUND((MAX(j.density_weight_val) / NULLIF(MAX(j.density_weight_qty), 0))::numeric, 4)
            ELSE NULL
          END AS density_wa,
          ${gradeTdsSelects}
        FROM tds_joined j
        GROUP BY j.oracle_item_code
        ORDER BY stock_qty DESC, brand_grade
      `, [tdsCatDesc, taxonomyCategoryId]);

      const inv = inventoryResult.rows[0] || {};
      const tds = tdsResult.rows[0] || {};

      const tdsParams = {};
      tdsFields.forEach((field) => {
        const key = `${field.col}_wa`;
        tdsParams[field.col] = tds[key] != null ? Number(tds[key]) : null;
      });

      res.json({
        success: true,
        data: {
          inventory: {
            total_stock_qty: Number(inv.total_stock_qty) || 0,
            total_stock_val: Number(inv.total_stock_val) || 0,
            total_order_qty: Number(inv.total_order_qty) || 0,
            total_order_val: Number(inv.total_order_val) || 0,
          },
          pricing: {
            stock_price_wa: inv.stock_price_wa != null ? Number(inv.stock_price_wa) : null,
            on_order_price_wa: inv.on_order_price_wa != null ? Number(inv.on_order_price_wa) : null,
            combined_price_wa: inv.combined_price_wa != null ? Number(inv.combined_price_wa) : null,
          },
          density_wa: inv.density_wa != null ? Number(inv.density_wa) : null,
          tds_grade_count: Number(tds.tds_grade_count) || 0,
          tds_params: tdsParams,
          grades: gradeResult.rows || [],
        },
      });
    } catch (err) {
      logger.error('GET /items/resin-profile error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch resin profile' });
    }
  });

  // ─── GET /items/substrate-profile — aggregate mapped substrate specs ─────
  // MUST be before /:id to avoid route ambiguity
  router.get('/items/substrate-profile', authenticate, async (req, res) => {
    const catDesc = String(req.query.cat_desc || '').trim();
    const appearance = String(req.query.appearance || '').trim();
    const materialClass = String(req.query.material_class || 'substrates').trim().toLowerCase();
    const materialKeys = Array.from(new Set(
      String(req.query.material_keys || '')
        .split(',')
        .map((value) => normalizeMaterialKey(value))
        .filter(Boolean)
    ));

    if (!NON_RESIN_MATERIAL_CLASS_KEYS.includes(materialClass)) {
      return res.status(400).json({
        success: false,
        error: `material_class must be one of: ${NON_RESIN_MATERIAL_CLASS_KEYS.join(', ')}`,
      });
    }

    const baseProfile = materialClass === 'substrates'
      ? resolveSubstrateProfile(catDesc, appearance)
      : materialClass;

    if (!materialKeys.length) {
      return res.json({
        success: true,
        data: {
          parameter_profile: baseProfile,
          inventory: {
            total_stock_qty: 0,
            total_stock_val: 0,
            total_order_qty: 0,
            total_order_val: 0,
          },
          pricing: {
            stock_price_wa: null,
            on_order_price_wa: null,
            combined_price_wa: null,
          },
          density_wa: null,
          spec_count: 0,
          spec_params: {},
          param_meta: {},
          specs: [],
        },
      });
    }

    try {
      const inventoryResult = await pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END), 0) AS total_stock_qty,
          COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END), 0) AS total_stock_val,
          COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END), 0) AS total_order_qty,
          COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END), 0) AS total_order_val,
          CASE WHEN SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END) > 0
            THEN ROUND((
              SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END)
              / SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END)
            )::numeric, 4)
            ELSE NULL
          END AS stock_price_wa,
          CASE WHEN SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END) > 0
            THEN ROUND((
              SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END)
              / SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END)
            )::numeric, 4)
            ELSE NULL
          END AS on_order_price_wa,
          CASE WHEN (
            SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END)
            + SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END)
          ) > 0
            THEN ROUND((
              (
                SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END)
                + SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END)
              )
              / (
                SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END)
                + SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END)
              )
            )::numeric, 4)
            ELSE NULL
          END AS combined_price_wa,
          CASE WHEN SUM(
            CASE
              WHEN mainitemstock > 0
               AND trim(COALESCE(weights, '')) ~ '^-?[0-9]+(\\.[0-9]+)?$'
              THEN mainitemstock
              ELSE 0
            END
          ) > 0
            THEN ROUND((
              SUM(
                CASE
                  WHEN mainitemstock > 0
                   AND trim(COALESCE(weights, '')) ~ '^-?[0-9]+(\\.[0-9]+)?$'
                  THEN (weights::numeric * mainitemstock)
                  ELSE 0
                END
              )
              / SUM(
                CASE
                  WHEN mainitemstock > 0
                   AND trim(COALESCE(weights, '')) ~ '^-?[0-9]+(\\.[0-9]+)?$'
                  THEN mainitemstock
                  ELSE 0
                END
              )
            )::numeric, 4)
            ELSE NULL
          END AS density_wa
        FROM fp_actualrmdata
        WHERE LOWER(TRIM(COALESCE(mainitem, ''))) = ANY($1::text[])
      `, [materialKeys]);

      const specResult = await pool.query(`
        WITH rm_by_item AS (
          SELECT
            LOWER(TRIM(COALESCE(mainitem, ''))) AS item_key,
            COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END), 0)::numeric AS stock_qty,
            COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END), 0)::numeric AS stock_val,
            COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END), 0)::numeric AS order_qty,
            COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END), 0)::numeric AS order_val
          FROM fp_actualrmdata
          WHERE LOWER(TRIM(COALESCE(mainitem, ''))) = ANY($1::text[])
          GROUP BY LOWER(TRIM(COALESCE(mainitem, '')))
        )
        SELECT
          s.material_key,
          s.mainitem,
          s.maindescription,
          s.catlinedesc,
          s.mainunit,
          s.supplier_name,
          s.parameters_json,
          s.status,
          COALESCE(r.stock_qty, 0) AS stock_qty,
          COALESCE(r.order_qty, 0) AS order_qty,
          CASE
            WHEN COALESCE(r.stock_qty, 0) > 0
            THEN ROUND((r.stock_val / NULLIF(r.stock_qty, 0))::numeric, 4)
            ELSE NULL
          END AS stock_price_wa,
          CASE
            WHEN COALESCE(r.order_qty, 0) > 0
            THEN ROUND((r.order_val / NULLIF(r.order_qty, 0))::numeric, 4)
            ELSE NULL
          END AS on_order_price_wa
        FROM mes_non_resin_material_specs s
        LEFT JOIN rm_by_item r
          ON r.item_key = COALESCE(NULLIF(LOWER(TRIM(s.mainitem)), ''), LOWER(TRIM(s.material_key)))
        WHERE s.material_class = $2
          AND (
            s.material_key = ANY($1::text[])
            OR LOWER(TRIM(COALESCE(s.mainitem, ''))) = ANY($1::text[])
          )
        ORDER BY COALESCE(r.stock_qty, 0) DESC, s.material_key
      `, [materialKeys, materialClass]);

      const profileCount = {};
      const aggregates = {};

      const specs = specResult.rows.map((row) => {
        const profile = materialClass === 'substrates'
          ? resolveSubstrateProfile(
            row.catlinedesc || catDesc,
            row.maindescription || appearance,
            row.mainitem
          )
          : materialClass;

        profileCount[profile] = (profileCount[profile] || 0) + 1;

        const stockQty = Number(row.stock_qty) || 0;
        const params = isPlainObject(row.parameters_json) ? row.parameters_json : {};

        Object.entries(params).forEach(([key, raw]) => {
          const value = toFiniteNumber(raw);
          if (value == null) return;

          if (!aggregates[key]) {
            aggregates[key] = {
              weightedSum: 0,
              weightedQty: 0,
              avgSum: 0,
              avgCount: 0,
            };
          }

          aggregates[key].avgSum += value;
          aggregates[key].avgCount += 1;

          if (stockQty > 0) {
            aggregates[key].weightedSum += value * stockQty;
            aggregates[key].weightedQty += stockQty;
          }
        });

        return {
          material_key: row.material_key,
          mainitem: row.mainitem,
          maindescription: row.maindescription,
          catlinedesc: row.catlinedesc,
          supplier_name: row.supplier_name,
          mainunit: row.mainunit,
          status: row.status,
          parameter_profile: profile,
          stock_qty: stockQty,
          order_qty: Number(row.order_qty) || 0,
          stock_price_wa: row.stock_price_wa != null ? Number(row.stock_price_wa) : null,
          on_order_price_wa: row.on_order_price_wa != null ? Number(row.on_order_price_wa) : null,
          parameters_json: params,
        };
      });

      const dominantProfile = Object.entries(profileCount)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || baseProfile;

      const specParams = {};
      const paramMeta = {};

      Object.keys(aggregates)
        .sort((a, b) => a.localeCompare(b))
        .forEach((key) => {
          const meta = inferParamMeta(key);
          const row = aggregates[key];

          const rawValue = row.weightedQty > 0
            ? (row.weightedSum / row.weightedQty)
            : (row.avgCount > 0 ? (row.avgSum / row.avgCount) : null);

          if (rawValue == null) return;

          specParams[key] = Number(rawValue.toFixed(meta.decimals));
          paramMeta[key] = meta;
        });

      const inv = inventoryResult.rows[0] || {};

      return res.json({
        success: true,
        data: {
          parameter_profile: dominantProfile,
          inventory: {
            total_stock_qty: Number(inv.total_stock_qty) || 0,
            total_stock_val: Number(inv.total_stock_val) || 0,
            total_order_qty: Number(inv.total_order_qty) || 0,
            total_order_val: Number(inv.total_order_val) || 0,
          },
          pricing: {
            stock_price_wa: inv.stock_price_wa != null ? Number(inv.stock_price_wa) : null,
            on_order_price_wa: inv.on_order_price_wa != null ? Number(inv.on_order_price_wa) : null,
            combined_price_wa: inv.combined_price_wa != null ? Number(inv.combined_price_wa) : null,
          },
          density_wa: inv.density_wa != null ? Number(inv.density_wa) : null,
          spec_count: specs.length,
          spec_params: specParams,
          param_meta: paramMeta,
          specs,
        },
      });
    } catch (err) {
      logger.error('GET /items/substrate-profile error:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch substrate profile' });
    }
  });

  // ─── GET /items/substrate-configs — list persisted substrate configs ─────
  // MUST be before /:id to avoid route ambiguity
  router.get('/items/substrate-configs', authenticate, async (req, res) => {
    try {
      const materialClass = normalizeMaterialKey(req.query.material_class || 'substrates');
      const catDesc = cleanText(req.query.cat_desc);
      const appearance = cleanText(req.query.appearance);

      if (!NON_RESIN_MATERIAL_CLASS_KEYS.includes(materialClass)) {
        return res.status(400).json({
          success: false,
          error: `material_class must be one of: ${NON_RESIN_MATERIAL_CLASS_KEYS.join(', ')}`,
        });
      }

      const params = [materialClass];
      const where = ['material_class = $1'];

      if (catDesc) {
        params.push(catDesc);
        where.push(`cat_desc = $${params.length}`);
      }
      if (appearance) {
        params.push(appearance);
        where.push(`appearance = $${params.length}`);
      }

      const { rows } = await pool.query(`
        SELECT
          id,
          material_class,
          cat_desc,
          appearance,
          supplier_name,
          resin_type,
          alloy_code,
          density_g_cm3,
          solid_pct,
          micron_thickness,
          width_mm,
          yield_m2_per_kg,
          roll_length_m,
          core_diameter_mm,
          market_ref_price,
          market_price_date,
          mrp_type,
          reorder_point,
          safety_stock_kg,
          planned_lead_time_days,
          COALESCE(mapped_material_keys, '{}'::text[]) AS mapped_material_keys,
          created_by,
          updated_by,
          created_at,
          updated_at
        FROM mes_material_profile_configs
        WHERE ${where.join(' AND ')}
        ORDER BY cat_desc, appearance
      `, params);

      return res.json({ success: true, data: rows });
    } catch (err) {
      if (err.code === '42P01') {
        return res.status(500).json({
          success: false,
          error: 'mes_material_profile_configs table not found. Run migration mes-master-040 first.',
        });
      }
      logger.error('GET /items/substrate-configs error:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch substrate configs' });
    }
  });

  // ─── GET /items/substrate-config — single persisted substrate config ─────
  // MUST be before /:id to avoid route ambiguity
  router.get('/items/substrate-config', authenticate, async (req, res) => {
    try {
      const materialClass = normalizeMaterialKey(req.query.material_class || 'substrates');
      const catDesc = cleanText(req.query.cat_desc);
      const appearance = cleanText(req.query.appearance) || '';

      if (!NON_RESIN_MATERIAL_CLASS_KEYS.includes(materialClass)) {
        return res.status(400).json({
          success: false,
          error: `material_class must be one of: ${NON_RESIN_MATERIAL_CLASS_KEYS.join(', ')}`,
        });
      }

      if (!catDesc) {
        return res.status(400).json({ success: false, error: 'cat_desc is required' });
      }

      const { rows } = await pool.query(`
        SELECT
          id,
          material_class,
          cat_desc,
          appearance,
          supplier_name,
          resin_type,
          alloy_code,
          density_g_cm3,
          solid_pct,
          micron_thickness,
          width_mm,
          yield_m2_per_kg,
          roll_length_m,
          core_diameter_mm,
          market_ref_price,
          market_price_date,
          mrp_type,
          reorder_point,
          safety_stock_kg,
          planned_lead_time_days,
          COALESCE(mapped_material_keys, '{}'::text[]) AS mapped_material_keys,
          created_by,
          updated_by,
          created_at,
          updated_at
        FROM mes_material_profile_configs
        WHERE material_class = $1
          AND cat_desc = $2
          AND appearance = $3
        LIMIT 1
      `, [materialClass, catDesc, appearance]);

      return res.json({ success: true, data: rows[0] || null });
    } catch (err) {
      if (err.code === '42P01') {
        return res.status(500).json({
          success: false,
          error: 'mes_material_profile_configs table not found. Run migration mes-master-040 first.',
        });
      }
      logger.error('GET /items/substrate-config error:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch substrate config' });
    }
  });

  // ─── PUT /items/substrate-config — upsert persisted substrate config ─────
  // MUST be before /:id to avoid route ambiguity
  router.put('/items/substrate-config', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });

    try {
      const b = req.body || {};
      const materialClass = normalizeMaterialKey(b.material_class || 'substrates');
      const catDesc = cleanText(b.cat_desc);
      const appearance = cleanText(b.appearance) || '';

      if (!NON_RESIN_MATERIAL_CLASS_KEYS.includes(materialClass)) {
        return res.status(400).json({
          success: false,
          error: `material_class must be one of: ${NON_RESIN_MATERIAL_CLASS_KEYS.join(', ')}`,
        });
      }
      if (!catDesc) {
        return res.status(400).json({ success: false, error: 'cat_desc is required' });
      }

      const mrpType = String(b.mrp_type || 'PD').trim().toUpperCase();
      if (!MRP_TYPE_KEYS.includes(mrpType)) {
        return res.status(400).json({
          success: false,
          error: `mrp_type must be one of: ${MRP_TYPE_KEYS.join(', ')}`,
        });
      }

      const marketPriceDate = parseOptionalDate(b.market_price_date);
      if (marketPriceDate === undefined) {
        return res.status(400).json({ success: false, error: 'market_price_date must be a valid date' });
      }

      const plannedLeadTimeDays = parseOptionalInteger(b.planned_lead_time_days);
      if (plannedLeadTimeDays === undefined || (plannedLeadTimeDays != null && plannedLeadTimeDays < 0)) {
        return res.status(400).json({
          success: false,
          error: 'planned_lead_time_days must be a non-negative integer',
        });
      }

      const numericFields = [
        'density_g_cm3',
        'solid_pct',
        'micron_thickness',
        'width_mm',
        'yield_m2_per_kg',
        'roll_length_m',
        'core_diameter_mm',
        'market_ref_price',
        'reorder_point',
        'safety_stock_kg',
      ];

      const parsedNumbers = {};
      for (const field of numericFields) {
        const parsed = parseOptionalNumber(b[field]);
        if (parsed === undefined) {
          return res.status(400).json({ success: false, error: `${field} must be a valid number` });
        }
        parsedNumbers[field] = parsed;
      }

      const mappedMaterialKeys = normalizeMaterialKeyArray(b.mapped_material_keys);

      const { rows } = await pool.query(`
        INSERT INTO mes_material_profile_configs (
          material_class,
          cat_desc,
          appearance,
          supplier_name,
          resin_type,
          alloy_code,
          density_g_cm3,
          solid_pct,
          micron_thickness,
          width_mm,
          yield_m2_per_kg,
          roll_length_m,
          core_diameter_mm,
          market_ref_price,
          market_price_date,
          mrp_type,
          reorder_point,
          safety_stock_kg,
          planned_lead_time_days,
          mapped_material_keys,
          created_by,
          updated_by
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$21
        )
        ON CONFLICT (material_class, cat_desc, appearance) DO UPDATE
        SET
          supplier_name = EXCLUDED.supplier_name,
          resin_type = EXCLUDED.resin_type,
          alloy_code = EXCLUDED.alloy_code,
          density_g_cm3 = EXCLUDED.density_g_cm3,
          solid_pct = EXCLUDED.solid_pct,
          micron_thickness = EXCLUDED.micron_thickness,
          width_mm = EXCLUDED.width_mm,
          yield_m2_per_kg = EXCLUDED.yield_m2_per_kg,
          roll_length_m = EXCLUDED.roll_length_m,
          core_diameter_mm = EXCLUDED.core_diameter_mm,
          market_ref_price = EXCLUDED.market_ref_price,
          market_price_date = EXCLUDED.market_price_date,
          mrp_type = EXCLUDED.mrp_type,
          reorder_point = EXCLUDED.reorder_point,
          safety_stock_kg = EXCLUDED.safety_stock_kg,
          planned_lead_time_days = EXCLUDED.planned_lead_time_days,
          mapped_material_keys = EXCLUDED.mapped_material_keys,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
        RETURNING *
      `, [
        materialClass,
        catDesc,
        appearance,
        cleanText(b.supplier_name, 200),
        cleanText(b.resin_type, 120),
        cleanText(b.alloy_code, 80),
        parsedNumbers.density_g_cm3,
        parsedNumbers.solid_pct,
        parsedNumbers.micron_thickness,
        parsedNumbers.width_mm,
        parsedNumbers.yield_m2_per_kg,
        parsedNumbers.roll_length_m,
        parsedNumbers.core_diameter_mm,
        parsedNumbers.market_ref_price,
        marketPriceDate,
        mrpType,
        parsedNumbers.reorder_point,
        parsedNumbers.safety_stock_kg,
        plannedLeadTimeDays,
        mappedMaterialKeys,
        req.user.id,
      ]);

      const sanitizedRow = stripLegacyPricingFields(rows[0] || {});
      return res.json({
        success: true,
        data: {
          ...sanitizedRow,
          mapped_material_keys: sanitizedRow.mapped_material_keys || [],
        },
      });
    } catch (err) {
      if (err.code === '42P01') {
        return res.status(500).json({
          success: false,
          error: 'mes_material_profile_configs table not found. Run migration mes-master-040 first.',
        });
      }
      logger.error('PUT /items/substrate-config error:', err);
      return res.status(500).json({ success: false, error: 'Failed to save substrate config' });
    }
  });

  // ─── GET /items/material-profile — UNIVERSAL profile for ALL material classes ──
  // Replaces separate resin-profile + substrate-profile. One response shape for all.
  // MUST be before /:id to avoid route ambiguity
  router.get('/items/material-profile', authenticate, async (req, res) => {
    const materialClass = normalizeMaterialKey(req.query.material_class);
    const catDesc = cleanText(req.query.cat_desc);
    const appearance = cleanText(req.query.appearance) || '';
    const materialKeys = normalizeMaterialKeyArray(req.query.material_keys);

    if (!materialClass) {
      return res.status(400).json({ success: false, error: 'material_class is required' });
    }

    try {
      // 1. Fetch param definitions for this material class
      const { rows: paramDefs } = await pool.query(`
        SELECT field_key, label, unit, display_group, sort_order
        FROM mes_parameter_definitions
        WHERE LOWER(TRIM(material_class)) = $1
          AND profile IS NULL
        ORDER BY sort_order
      `, [materialClass]);

      // 2. If no material keys, return empty response with param definitions
      if (!materialKeys.length) {
        return res.json({
          success: true,
          data: {
            material_class: materialClass,
            parameter_profile: null,
            param_definitions: paramDefs,
            param_values: {},
            inventory: { total_stock_qty: 0, total_stock_val: 0, total_order_qty: 0, total_order_val: 0 },
            pricing: { stock_price_wa: null, on_order_price_wa: null, combined_price_wa: null },
            density_wa: null,
            spec_count: 0,
            specs: [],
          },
        });
      }

      // 3. Inventory aggregation from fp_actualrmdata
      const inventoryResult = await pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END), 0) AS total_stock_qty,
          COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END), 0) AS total_stock_val,
          COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END), 0) AS total_order_qty,
          COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END), 0) AS total_order_val,
          CASE WHEN SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END) > 0
            THEN ROUND((
              SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END)
              / SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END)
            )::numeric, 4)
            ELSE NULL
          END AS stock_price_wa,
          CASE WHEN SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END) > 0
            THEN ROUND((
              SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END)
              / SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END)
            )::numeric, 4)
            ELSE NULL
          END AS on_order_price_wa,
          CASE WHEN (
            SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END)
            + SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END)
          ) > 0
            THEN ROUND((
              (
                SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END)
                + SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END)
              )
              / (
                SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END)
                + SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END)
              )
            )::numeric, 4)
            ELSE NULL
          END AS combined_price_wa
        FROM fp_actualrmdata
        WHERE LOWER(TRIM(COALESCE(mainitem, ''))) = ANY($1::text[])
      `, [materialKeys]);

      const inv = inventoryResult.rows[0] || {};
      const paramValues = {};
      let densityWa = null;
      const specs = [];

      // 4. Branch only on spec source table
      if (materialClass === 'resins') {
        // ── RESINS: read from mes_material_tds ──
        const tdsCatDesc = catDesc && String(catDesc).toLowerCase().startsWith('film scrap')
          ? 'Film Scrap' : catDesc;

        const { rows: tdsColumnsRows } = await pool.query(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'mes_material_tds'
        `);
        const tdsColumns = new Set(tdsColumnsRows.map((row) => String(row.column_name || '').trim()));

        const brandGradeSelectSql = tdsColumns.has('brand_grade')
          ? 't.brand_grade,'
          : 'NULL::text AS brand_grade,';
        const supplierSelectSql = tdsColumns.has('supplier_id')
          ? "COALESCE(NULLIF(TRIM(s.name), ''), 'Unknown') AS supplier_name,"
          : 'NULL::text AS supplier_name,';
        const unitSelectSql = tdsColumns.has('unit')
          ? "COALESCE(NULLIF(TRIM(t.unit), ''), 'KG') AS unit,"
          : "'KG'::text AS unit,";
        const supplierJoinSql = tdsColumns.has('supplier_id')
          ? 'LEFT JOIN mes_suppliers s ON s.id = t.supplier_id'
          : '';
        const selectedParamDefs = paramDefs.filter((def) => tdsColumns.has(def.field_key));
        const paramSelectSql = selectedParamDefs.length
          ? selectedParamDefs.map((def) => `t.${def.field_key}`).join(',\n            ')
          : 'NULL::numeric AS _no_param_columns';
        const shouldFilterByCatDesc = Boolean(tdsCatDesc && tdsColumns.has('cat_desc'));

        const { rows: tdsRows } = await pool.query(`
          WITH rm_by_item AS (
            SELECT
              mainitem,
              COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END), 0) AS stock_qty,
              COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END), 0) AS stock_val,
              COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END), 0) AS order_qty,
              COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END), 0) AS order_val
            FROM fp_actualrmdata
            WHERE LOWER(TRIM(COALESCE(mainitem, ''))) = ANY($1::text[])
            GROUP BY mainitem
          )
          SELECT
            t.oracle_item_code,
            ${brandGradeSelectSql}
            ${supplierSelectSql}
            ${unitSelectSql}
            COALESCE(r.stock_qty, 0)::numeric AS stock_qty,
            COALESCE(r.order_qty, 0)::numeric AS order_qty,
            COALESCE(r.stock_val, 0)::numeric AS stock_val,
            COALESCE(r.order_val, 0)::numeric AS order_val,
            ${paramSelectSql}
          FROM mes_material_tds t
          ${supplierJoinSql}
          LEFT JOIN rm_by_item r ON r.mainitem = t.oracle_item_code
          WHERE LOWER(TRIM(t.oracle_item_code)) = ANY($1::text[])
            ${shouldFilterByCatDesc ? `AND t.cat_desc = $2` : ''}
          ORDER BY COALESCE(r.stock_qty, 0) DESC
        `, shouldFilterByCatDesc ? [materialKeys, tdsCatDesc] : [materialKeys]);

        // Compute weighted averages per param definition
        const agg = {};
        for (const def of paramDefs) {
          agg[def.field_key] = { weightedSum: 0, weightedQty: 0, min: null, max: null, count: 0 };
        }

        for (const row of tdsRows) {
          const stockQty = Number(row.stock_qty) || 0;
          const weight = stockQty > 0 ? stockQty : 1;
          const stockPriceWA = stockQty > 0 ? Math.round(Number(row.stock_val) / stockQty * 10000) / 10000 : null;
          const orderQty = Number(row.order_qty) || 0;
          const onOrderPriceWA = orderQty > 0 ? Math.round(Number(row.order_val) / orderQty * 10000) / 10000 : null;

          const params = {};
          for (const def of paramDefs) {
            const rawVal = row[def.field_key];
            const val = toFiniteNumber(rawVal);
            // Density columns in TDS are stored ×1000, normalize
            const divisor = (def.field_key === 'density' || def.field_key === 'bulk_density') ? 1000 : 1;
            const normalizedVal = val != null ? val / divisor : null;

            params[def.field_key] = normalizedVal;

            if (normalizedVal != null && agg[def.field_key]) {
              agg[def.field_key].weightedSum += normalizedVal * weight;
              agg[def.field_key].weightedQty += weight;
              agg[def.field_key].count += 1;
              if (agg[def.field_key].min == null || normalizedVal < agg[def.field_key].min) agg[def.field_key].min = normalizedVal;
              if (agg[def.field_key].max == null || normalizedVal > agg[def.field_key].max) agg[def.field_key].max = normalizedVal;
            }
          }

          specs.push({
            material_key: row.oracle_item_code,
            description: row.brand_grade,
            stock_qty: stockQty,
            order_qty: orderQty,
            stock_price_wa: stockPriceWA,
            on_order_price_wa: onOrderPriceWA,
            params,
          });
        }

        for (const [key, a] of Object.entries(agg)) {
          if (a.count > 0) {
            paramValues[key] = {
              weightedAvg: Math.round(a.weightedSum / a.weightedQty * 10000) / 10000,
              min: Math.round(a.min * 10000) / 10000,
              max: Math.round(a.max * 10000) / 10000,
              count: a.count,
            };
          }
        }

        // Density WA from inventory weights column
        try {
          const { rows: dwRows } = await pool.query(`
            SELECT
              CASE WHEN SUM(
                CASE WHEN mainitemstock > 0 AND trim(COALESCE(weights, '')) ~ '^-?[0-9]+(\\.[0-9]+)?$'
                  THEN mainitemstock ELSE 0 END
              ) > 0
              THEN ROUND((
                SUM(CASE WHEN mainitemstock > 0 AND trim(COALESCE(weights, '')) ~ '^-?[0-9]+(\\.[0-9]+)?$'
                  THEN (weights::numeric * mainitemstock) ELSE 0 END)
                / SUM(CASE WHEN mainitemstock > 0 AND trim(COALESCE(weights, '')) ~ '^-?[0-9]+(\\.[0-9]+)?$'
                  THEN mainitemstock ELSE 0 END)
              )::numeric, 4)
              ELSE NULL END AS density_wa
            FROM fp_actualrmdata
            WHERE LOWER(TRIM(COALESCE(mainitem, ''))) = ANY($1::text[])
          `, [materialKeys]);
          densityWa = dwRows[0]?.density_wa != null ? Number(dwRows[0].density_wa) : null;
        } catch (_) { /* ignore */ }

      } else {
        // ── NON-RESINS: read from mes_non_resin_material_specs ──
        const { rows: specRows } = await pool.query(`
          WITH rm_by_item AS (
            SELECT
              LOWER(TRIM(COALESCE(mainitem, ''))) AS item_key,
              COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END), 0)::numeric AS stock_qty,
              COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END), 0)::numeric AS stock_val,
              COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END), 0)::numeric AS order_qty,
              COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END), 0)::numeric AS order_val
            FROM fp_actualrmdata
            WHERE LOWER(TRIM(COALESCE(mainitem, ''))) = ANY($1::text[])
            GROUP BY LOWER(TRIM(COALESCE(mainitem, '')))
          )
          SELECT
            s.material_key,
            s.mainitem,
            s.maindescription,
            s.supplier_name,
            s.parameters_json,
            COALESCE(r.stock_qty, 0) AS stock_qty,
            COALESCE(r.order_qty, 0) AS order_qty,
            CASE WHEN COALESCE(r.stock_qty, 0) > 0
              THEN ROUND((r.stock_val / NULLIF(r.stock_qty, 0))::numeric, 4)
              ELSE NULL
            END AS stock_price_wa,
            CASE WHEN COALESCE(r.order_qty, 0) > 0
              THEN ROUND((r.order_val / NULLIF(r.order_qty, 0))::numeric, 4)
              ELSE NULL
            END AS on_order_price_wa
          FROM mes_non_resin_material_specs s
          LEFT JOIN rm_by_item r
            ON r.item_key = COALESCE(NULLIF(LOWER(TRIM(s.mainitem)), ''), LOWER(TRIM(s.material_key)))
          WHERE s.material_class = $2
            AND (
              LOWER(TRIM(s.material_key)) = ANY($1::text[])
              OR LOWER(TRIM(COALESCE(s.mainitem, ''))) = ANY($1::text[])
            )
          ORDER BY COALESCE(r.stock_qty, 0) DESC, s.material_key
        `, [materialKeys, materialClass]);

        const agg = {};
        for (const row of specRows) {
          const stockQty = Number(row.stock_qty) || 0;
          const weight = stockQty > 0 ? stockQty : 1;
          const params = isPlainObject(row.parameters_json) ? row.parameters_json : {};

          Object.entries(params).forEach(([key, raw]) => {
            const value = toFiniteNumber(raw);
            if (value == null) return;

            if (!agg[key]) agg[key] = { weightedSum: 0, weightedQty: 0, min: null, max: null, count: 0 };
            agg[key].weightedSum += value * weight;
            agg[key].weightedQty += weight;
            agg[key].count += 1;
            if (agg[key].min == null || value < agg[key].min) agg[key].min = value;
            if (agg[key].max == null || value > agg[key].max) agg[key].max = value;
          });

          specs.push({
            material_key: row.material_key || row.mainitem,
            description: row.maindescription || row.material_key,
            stock_qty: stockQty,
            order_qty: Number(row.order_qty) || 0,
            stock_price_wa: row.stock_price_wa != null ? Number(row.stock_price_wa) : null,
            on_order_price_wa: row.on_order_price_wa != null ? Number(row.on_order_price_wa) : null,
            params,
          });
        }

        for (const [key, a] of Object.entries(agg)) {
          if (a.count > 0) {
            paramValues[key] = {
              weightedAvg: Math.round(a.weightedSum / a.weightedQty * 10000) / 10000,
              min: Math.round(a.min * 10000) / 10000,
              max: Math.round(a.max * 10000) / 10000,
              count: a.count,
            };
          }
        }

        // Density WA from inventory
        if (paramValues.density_g_cm3) {
          densityWa = paramValues.density_g_cm3.weightedAvg;
        }
      }

      res.json({
        success: true,
        data: {
          material_class: materialClass,
          parameter_profile: null,
          param_definitions: paramDefs,
          param_values: paramValues,
          inventory: {
            total_stock_qty: Number(inv.total_stock_qty) || 0,
            total_stock_val: Number(inv.total_stock_val) || 0,
            total_order_qty: Number(inv.total_order_qty) || 0,
            total_order_val: Number(inv.total_order_val) || 0,
          },
          pricing: {
            stock_price_wa: inv.stock_price_wa != null ? Number(inv.stock_price_wa) : null,
            on_order_price_wa: inv.on_order_price_wa != null ? Number(inv.on_order_price_wa) : null,
            combined_price_wa: inv.combined_price_wa != null ? Number(inv.combined_price_wa) : null,
          },
          density_wa: densityWa,
          spec_count: specs.length,
          specs,
        },
      });
    } catch (err) {
      logger.error('GET /items/material-profile error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch material profile' });
    }
  });

  // ─── GET /items/material-configs — list persisted configs (universal) ────
  // MUST be before /:id to avoid route ambiguity
  router.get('/items/material-configs', authenticate, async (req, res) => {
    try {
      const materialClass = normalizeMaterialKey(req.query.material_class);
      const catDesc = cleanText(req.query.cat_desc);
      const appearance = cleanText(req.query.appearance);

      const params = [materialClass];
      const where = ['material_class = $1'];

      if (catDesc) {
        params.push(catDesc);
        where.push(`cat_desc = $${params.length}`);
      }
      if (appearance) {
        params.push(appearance);
        where.push(`appearance = $${params.length}`);
      }

      let rows;
      try {
        ({ rows } = await pool.query(`
          SELECT
            id, material_class, cat_desc, appearance, supplier_name,
            resin_type, alloy_code, density_g_cm3, solid_pct, micron_thickness,
            width_mm, yield_m2_per_kg, roll_length_m, core_diameter_mm,
            market_ref_price, market_price_date,
            mrp_type, reorder_point, safety_stock_kg, planned_lead_time_days,
            params_override,
            COALESCE(mapped_material_keys, '{}'::text[]) AS mapped_material_keys,
            created_by, updated_by, created_at, updated_at
          FROM mes_material_profile_configs
          WHERE ${where.join(' AND ')}
          ORDER BY cat_desc, appearance
        `, params));
      } catch (queryErr) {
        if (!isMissingParamsOverrideColumn(queryErr)) throw queryErr;

        ({ rows } = await pool.query(`
          SELECT
            id, material_class, cat_desc, appearance, supplier_name,
            resin_type, alloy_code, density_g_cm3, solid_pct, micron_thickness,
            width_mm, yield_m2_per_kg, roll_length_m, core_diameter_mm,
            market_ref_price, market_price_date,
            mrp_type, reorder_point, safety_stock_kg, planned_lead_time_days,
            COALESCE(mapped_material_keys, '{}'::text[]) AS mapped_material_keys,
            created_by, updated_by, created_at, updated_at
          FROM mes_material_profile_configs
          WHERE ${where.join(' AND ')}
          ORDER BY cat_desc, appearance
        `, params));

        rows = rows.map((row) => ({ ...row, params_override: {} }));
      }

      return res.json({ success: true, data: rows });
    } catch (err) {
      if (err.code === '42P01') {
        return res.status(500).json({
          success: false,
          error: 'mes_material_profile_configs table not found. Run migration mes-master-040 first.',
        });
      }
      logger.error('GET /items/material-configs error:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch material configs' });
    }
  });

  // ─── GET /items/material-config — single persisted config (universal) ───
  // MUST be before /:id to avoid route ambiguity
  router.get('/items/material-config', authenticate, async (req, res) => {
    try {
      const materialClass = normalizeMaterialKey(req.query.material_class);
      const catDesc = cleanText(req.query.cat_desc);
      const appearance = cleanText(req.query.appearance) || '';

      if (!catDesc) {
        return res.status(400).json({ success: false, error: 'cat_desc is required' });
      }

      const selectMaterialConfig = async (whereSql, params, orderSql = '') => {
        let rows;
        try {
          ({ rows } = await pool.query(`
            SELECT
              id, material_class, cat_desc, appearance, supplier_name,
              resin_type, alloy_code, density_g_cm3, solid_pct, micron_thickness,
              width_mm, yield_m2_per_kg, roll_length_m, core_diameter_mm,
              market_ref_price, market_price_date,
              mrp_type, reorder_point, safety_stock_kg, planned_lead_time_days,
              params_override,
              COALESCE(mapped_material_keys, '{}'::text[]) AS mapped_material_keys,
              created_by, updated_by, created_at, updated_at
            FROM mes_material_profile_configs
            WHERE ${whereSql}
            ${orderSql}
            LIMIT 1
          `, params));
        } catch (queryErr) {
          if (!isMissingParamsOverrideColumn(queryErr)) throw queryErr;

          ({ rows } = await pool.query(`
            SELECT
              id, material_class, cat_desc, appearance, supplier_name,
              resin_type, alloy_code, density_g_cm3, solid_pct, micron_thickness,
              width_mm, yield_m2_per_kg, roll_length_m, core_diameter_mm,
              market_ref_price, market_price_date,
              mrp_type, reorder_point, safety_stock_kg, planned_lead_time_days,
              COALESCE(mapped_material_keys, '{}'::text[]) AS mapped_material_keys,
              created_by, updated_by, created_at, updated_at
            FROM mes_material_profile_configs
            WHERE ${whereSql}
            ${orderSql}
            LIMIT 1
          `, params));

          rows = rows.map((row) => ({ ...row, params_override: {} }));
        }

        return rows;
      };

      // 1) Exact match for the requested context.
      let rows = await selectMaterialConfig(
        'material_class = $1 AND cat_desc = $2 AND appearance = $3',
        [materialClass, catDesc, appearance]
      );

      // 2) Legacy compatibility: older saves used blank appearance.
      if (!rows.length && appearance) {
        rows = await selectMaterialConfig(
          'material_class = $1 AND cat_desc = $2 AND appearance = $3',
          [materialClass, catDesc, '']
        );
      }

      // 3) Last-resort fallback: return best candidate by category when no exact row exists.
      if (!rows.length) {
        rows = await selectMaterialConfig(
          'material_class = $1 AND cat_desc = $2',
          [materialClass, catDesc, appearance],
          'ORDER BY CASE WHEN appearance = $3 THEN 0 WHEN appearance = \'\' THEN 1 ELSE 2 END, updated_at DESC'
        );
      }

      return res.json({ success: true, data: rows[0] || null });
    } catch (err) {
      if (err.code === '42P01') {
        return res.status(500).json({
          success: false,
          error: 'mes_material_profile_configs table not found. Run migration mes-master-040 first.',
        });
      }
      logger.error('GET /items/material-config error:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch material config' });
    }
  });

  // ─── PUT /items/material-profile-config — UNIVERSAL upsert for ALL classes ──
  // Replaces PUT /substrate-config. Works for resins, substrates, and all other classes.
  // MUST be before /:id to avoid route ambiguity
  router.put('/items/material-profile-config', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });

    try {
      const b = req.body || {};
      const materialClass = normalizeMaterialKey(b.material_class);
      const catDesc = cleanText(b.cat_desc);
      const appearance = cleanText(b.appearance) || '';

      if (!materialClass) {
        return res.status(400).json({ success: false, error: 'material_class is required' });
      }
      if (!catDesc) {
        return res.status(400).json({ success: false, error: 'cat_desc is required' });
      }

      const mrpType = String(b.mrp_type || 'PD').trim().toUpperCase();
      if (!MRP_TYPE_KEYS.includes(mrpType)) {
        return res.status(400).json({
          success: false,
          error: `mrp_type must be one of: ${MRP_TYPE_KEYS.join(', ')}`,
        });
      }

      const marketPriceDate = parseOptionalDate(b.market_price_date);
      if (marketPriceDate === undefined) {
        return res.status(400).json({ success: false, error: 'market_price_date must be a valid date' });
      }

      const plannedLeadTimeDays = parseOptionalInteger(b.planned_lead_time_days);
      if (plannedLeadTimeDays === undefined || (plannedLeadTimeDays != null && plannedLeadTimeDays < 0)) {
        return res.status(400).json({
          success: false,
          error: 'planned_lead_time_days must be a non-negative integer',
        });
      }

      const numericFields = [
        'density_g_cm3', 'solid_pct', 'micron_thickness', 'width_mm',
        'yield_m2_per_kg', 'roll_length_m', 'core_diameter_mm',
        'market_ref_price',
        'reorder_point', 'safety_stock_kg',
      ];

      const parsedNumbers = {};
      for (const field of numericFields) {
        const parsed = parseOptionalNumber(b[field]);
        if (parsed === undefined) {
          return res.status(400).json({ success: false, error: `${field} must be a valid number` });
        }
        parsedNumbers[field] = parsed;
      }

      const mappedMaterialKeys = normalizeMaterialKeyArray(b.mapped_material_keys);

      // Parse params_override — must be a plain object with numeric values
      let paramsOverride = {};
      if (b.params_override != null) {
        if (!isPlainObject(b.params_override)) {
          return res.status(400).json({ success: false, error: 'params_override must be an object' });
        }
        for (const [k, v] of Object.entries(b.params_override)) {
          if (v != null) {
            const n = toFiniteNumber(v);
            paramsOverride[k] = n;
          }
        }
      }

      const commonParams = [
        materialClass,
        catDesc,
        appearance,
        cleanText(b.supplier_name, 200),
        cleanText(b.resin_type, 120),
        cleanText(b.alloy_code, 80),
        parsedNumbers.density_g_cm3,
        parsedNumbers.solid_pct,
        parsedNumbers.micron_thickness,
        parsedNumbers.width_mm,
        parsedNumbers.yield_m2_per_kg,
        parsedNumbers.roll_length_m,
        parsedNumbers.core_diameter_mm,
        parsedNumbers.market_ref_price,
        marketPriceDate,
        mrpType,
        parsedNumbers.reorder_point,
        parsedNumbers.safety_stock_kg,
        plannedLeadTimeDays,
        mappedMaterialKeys,
      ];

      let rows;
      try {
        ({ rows } = await pool.query(`
          INSERT INTO mes_material_profile_configs (
            material_class, cat_desc, appearance, supplier_name,
            resin_type, alloy_code, density_g_cm3, solid_pct, micron_thickness,
            width_mm, yield_m2_per_kg, roll_length_m, core_diameter_mm,
            market_ref_price, market_price_date,
            mrp_type, reorder_point, safety_stock_kg, planned_lead_time_days,
            mapped_material_keys, params_override, created_by, updated_by
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23
          )
          ON CONFLICT (material_class, cat_desc, appearance) DO UPDATE
          SET
            supplier_name = EXCLUDED.supplier_name,
            resin_type = EXCLUDED.resin_type,
            alloy_code = EXCLUDED.alloy_code,
            density_g_cm3 = EXCLUDED.density_g_cm3,
            solid_pct = EXCLUDED.solid_pct,
            micron_thickness = EXCLUDED.micron_thickness,
            width_mm = EXCLUDED.width_mm,
            yield_m2_per_kg = EXCLUDED.yield_m2_per_kg,
            roll_length_m = EXCLUDED.roll_length_m,
            core_diameter_mm = EXCLUDED.core_diameter_mm,
            market_ref_price = EXCLUDED.market_ref_price,
            market_price_date = EXCLUDED.market_price_date,
            mrp_type = EXCLUDED.mrp_type,
            reorder_point = EXCLUDED.reorder_point,
            safety_stock_kg = EXCLUDED.safety_stock_kg,
            planned_lead_time_days = EXCLUDED.planned_lead_time_days,
            mapped_material_keys = EXCLUDED.mapped_material_keys,
            params_override = EXCLUDED.params_override,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
          RETURNING *
        `, [
          ...commonParams,
          JSON.stringify(paramsOverride),
          req.user.id,
          req.user.id,
        ]));
      } catch (queryErr) {
        if (!isMissingParamsOverrideColumn(queryErr)) throw queryErr;

        ({ rows } = await pool.query(`
          INSERT INTO mes_material_profile_configs (
            material_class, cat_desc, appearance, supplier_name,
            resin_type, alloy_code, density_g_cm3, solid_pct, micron_thickness,
            width_mm, yield_m2_per_kg, roll_length_m, core_diameter_mm,
            market_ref_price, market_price_date,
            mrp_type, reorder_point, safety_stock_kg, planned_lead_time_days,
            mapped_material_keys, created_by, updated_by
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22
          )
          ON CONFLICT (material_class, cat_desc, appearance) DO UPDATE
          SET
            supplier_name = EXCLUDED.supplier_name,
            resin_type = EXCLUDED.resin_type,
            alloy_code = EXCLUDED.alloy_code,
            density_g_cm3 = EXCLUDED.density_g_cm3,
            solid_pct = EXCLUDED.solid_pct,
            micron_thickness = EXCLUDED.micron_thickness,
            width_mm = EXCLUDED.width_mm,
            yield_m2_per_kg = EXCLUDED.yield_m2_per_kg,
            roll_length_m = EXCLUDED.roll_length_m,
            core_diameter_mm = EXCLUDED.core_diameter_mm,
            market_ref_price = EXCLUDED.market_ref_price,
            market_price_date = EXCLUDED.market_price_date,
            mrp_type = EXCLUDED.mrp_type,
            reorder_point = EXCLUDED.reorder_point,
            safety_stock_kg = EXCLUDED.safety_stock_kg,
            planned_lead_time_days = EXCLUDED.planned_lead_time_days,
            mapped_material_keys = EXCLUDED.mapped_material_keys,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
          RETURNING *, '{}'::jsonb AS params_override
        `, [
          ...commonParams,
          req.user.id,
          req.user.id,
        ]));
      }

      return res.json({
        success: true,
        data: {
          ...stripLegacyPricingFields(rows[0] || {}),
          mapped_material_keys: (rows[0] || {}).mapped_material_keys || [],
        },
      });
    } catch (err) {
      if (err.code === '42P01') {
        return res.status(500).json({
          success: false,
          error: 'mes_material_profile_configs table not found. Run migration mes-master-040 first.',
        });
      }
      logger.error('PUT /items/material-profile-config error:', err);
      return res.status(500).json({ success: false, error: 'Failed to save material profile config' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CUSTOM ITEM CATEGORIES — user-configurable categories (group membership)
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── GET /items/custom-categories — List all with groups + live totals ────
  router.get('/items/custom-categories', authenticate, async (req, res) => {
    try {
      const { rows: categories } = await pool.query(`
        SELECT
          c.*,
          COALESCE(cnt.item_count, 0) AS item_count,
          COALESCE(cnt.item_group_count, 0) AS item_group_count,
          COALESCE(json_agg(
          json_build_object(
            'id', g.id, 'catlinedesc', g.catlinedesc, 'is_active', g.is_active
          ) ORDER BY g.catlinedesc
        ) FILTER (WHERE g.id IS NOT NULL), '[]') AS groups
        FROM mes_item_categories c
        LEFT JOIN mes_item_category_groups g ON g.category_id = c.id AND g.is_active = true
        LEFT JOIN LATERAL (
          SELECT
            COUNT(DISTINCT LOWER(TRIM(r.mainitem)))::INT AS item_count,
            COUNT(DISTINCT LOWER(TRIM(r.itemgroup)))::INT AS item_group_count
          FROM mes_item_category_groups g2
          JOIN fp_actualrmdata r
            ON TRIM(r.catlinedesc) = TRIM(g2.catlinedesc)
          WHERE g2.category_id = c.id
            AND g2.is_active = true
        ) cnt ON TRUE
        WHERE c.is_active = true
        GROUP BY c.id, cnt.item_count, cnt.item_group_count
        ORDER BY c.sort_order, c.name
      `);

      let unmappedByCategory = new Map();
      try {
        const { rows: unmappedRows } = await pool.query(`
          WITH category_groups AS (
            SELECT
              c.id AS category_id,
              LOWER(TRIM(c.material_class)) AS material_class_key,
              LOWER(TRIM(g.catlinedesc)) AS catlinedesc_key
            FROM mes_item_categories c
            JOIN mes_item_category_groups g
              ON g.category_id = c.id
             AND g.is_active = true
            WHERE c.is_active = true
              AND COALESCE(TRIM(c.material_class), '') <> ''
            GROUP BY c.id, LOWER(TRIM(c.material_class)), LOWER(TRIM(g.catlinedesc))
          ),
          bucket_items AS (
            SELECT
              cg.category_id,
              cg.material_class_key,
              cg.catlinedesc_key,
              LOWER(TRIM(r.itemgroup)) AS appearance_key,
              LOWER(TRIM(r.mainitem)) AS item_key,
              MIN(TRIM(r.mainitem)) AS item_code,
              MIN(NULLIF(TRIM(r.maindescription), '')) AS item_description,
              MIN(NULLIF(TRIM(r.catlinedesc), '')) AS catlinedesc
            FROM category_groups cg
            JOIN fp_actualrmdata r
              ON LOWER(TRIM(r.catlinedesc)) = cg.catlinedesc_key
             AND COALESCE(TRIM(r.mainitem), '') <> ''
            WHERE COALESCE(TRIM(r.itemgroup), '') <> ''
            GROUP BY
              cg.category_id,
              cg.material_class_key,
              cg.catlinedesc_key,
              LOWER(TRIM(r.itemgroup)),
              LOWER(TRIM(r.mainitem))
          ),
          unmapped_raw AS (
            SELECT
              bi.category_id,
              bi.item_key,
              bi.item_code,
              bi.item_description,
              bi.catlinedesc
            FROM bucket_items bi
            LEFT JOIN mes_item_group_overrides o
              ON o.category_id = bi.category_id
             AND o.item_key = bi.item_key
            LEFT JOIN LATERAL (
              SELECT
                mp.id,
                COALESCE(mp.mapped_material_keys, '{}'::text[]) AS mapped_material_keys
              FROM mes_material_profile_configs mp
              WHERE LOWER(TRIM(mp.material_class)) = bi.material_class_key
                AND LOWER(TRIM(mp.cat_desc)) = bi.catlinedesc_key
              ORDER BY
                CASE
                  WHEN LOWER(TRIM(mp.appearance)) = bi.appearance_key THEN 0
                  WHEN COALESCE(TRIM(mp.appearance), '') = '' THEN 1
                  ELSE 2
                END,
                mp.updated_at DESC NULLS LAST,
                mp.id DESC
              LIMIT 1
            ) cfg ON TRUE
            WHERE cfg.id IS NOT NULL
              AND o.item_key IS NULL
              AND NOT EXISTS (
                SELECT 1
                FROM UNNEST(cfg.mapped_material_keys) AS mk
                WHERE LOWER(TRIM(mk)) = bi.item_key
              )
          ),
          unmapped AS (
            SELECT
              ur.category_id,
              ur.item_key,
              MIN(ur.item_code) AS item_code,
              MIN(ur.item_description) AS item_description,
              MIN(ur.catlinedesc) AS catlinedesc
            FROM unmapped_raw ur
            GROUP BY ur.category_id, ur.item_key
          ),
          ranked AS (
            SELECT
              u.*,
              ROW_NUMBER() OVER (PARTITION BY u.category_id ORDER BY u.item_code) AS rn
            FROM unmapped u
          ),
          summary AS (
            SELECT
              category_id,
              COUNT(*)::INT AS unmapped_item_count
            FROM unmapped
            GROUP BY category_id
          )
          SELECT
            s.category_id,
            s.unmapped_item_count,
            GREATEST(s.unmapped_item_count - 80, 0)::INT AS unmapped_overflow_count,
            COALESCE(
              JSON_AGG(
                JSON_BUILD_OBJECT(
                  'item_key', r.item_key,
                  'item_code', r.item_code,
                  'item_description', r.item_description,
                  'catlinedesc', r.catlinedesc
                )
                ORDER BY r.item_code
              ) FILTER (WHERE r.rn <= 80),
              '[]'::json
            ) AS unmapped_items
          FROM summary s
          LEFT JOIN ranked r ON r.category_id = s.category_id
          GROUP BY s.category_id, s.unmapped_item_count
        `);

        unmappedByCategory = new Map(
          unmappedRows.map((row) => [
            Number(row.category_id),
            {
              unmapped_item_count: Number(row.unmapped_item_count) || 0,
              unmapped_overflow_count: Number(row.unmapped_overflow_count) || 0,
              unmapped_items: Array.isArray(row.unmapped_items) ? row.unmapped_items : [],
            },
          ])
        );
      } catch (unmappedErr) {
        // Keep endpoint available even if profile config table is not ready in some environments.
        if (unmappedErr?.code !== '42P01') {
          logger.warn('GET /items/custom-categories unmapped summary warning', { error: unmappedErr.message });
        }
      }

      const data = categories.map((cat) => {
        const meta = unmappedByCategory.get(Number(cat.id)) || {
          unmapped_item_count: 0,
          unmapped_overflow_count: 0,
          unmapped_items: [],
        };
        return {
          ...cat,
          ...meta,
        };
      });

      res.json({ success: true, data });
    } catch (err) {
      logger.error('GET /items/custom-categories error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch categories' });
    }
  });

  // ─── GET /items/custom-categories/search — Global item search ───────────
  // Searches mapped items across all active custom categories by item code,
  // description, supplier, item group, and category group.
  router.get('/items/custom-categories/search', authenticate, async (req, res) => {
    try {
      const q = cleanText(req.query.q, 120);
      const materialClass = normalizeMaterialKey(req.query.material_class || '');
      const parsedLimit = Number.parseInt(String(req.query.limit || '200'), 10);
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 500)
        : 200;

      if (!q) {
        return res.json({ success: true, data: [], count: 0 });
      }

      const { rows: rmColumnsRows } = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'fp_actualrmdata'
      `);
      const rmColumns = new Set(rmColumnsRows.map((row) => String(row.column_name || '').trim()));
      const rmSupplierColumns = ['supplier', 'supplier_name', 'suppliercode', 'supplier_code', 'vendor', 'vendor_name'];
      const supplierColumn = rmSupplierColumns.find((column) => rmColumns.has(column));
      const supplierGroupSql = supplierColumn
        ? `MAX(NULLIF(TRIM(r.${supplierColumn}), '')) AS supplier,`
        : 'NULL::text AS supplier,';
      const supplierSearchSql = supplierColumn
        ? `COALESCE(r.${supplierColumn}, '') ILIKE $1`
        : 'FALSE';

      const params = [`%${q}%`];
      let materialClassWhere = '';
      if (materialClass && materialClass !== 'all') {
        params.push(materialClass);
        materialClassWhere = ` AND LOWER(TRIM(c.material_class)) = $${params.length}`;
      }
      params.push(limit);
      const limitParam = `$${params.length}`;

      const { rows } = await pool.query(`
        SELECT
          c.id AS category_id,
          c.name AS category_name,
          c.material_class,
          TRIM(r.catlinedesc) AS catlinedesc,
          NULLIF(TRIM(r.itemgroup), '') AS itemgroup,
          LOWER(TRIM(r.mainitem)) AS item_key,
          MAX(r.mainitem) AS mainitem,
          MAX(r.maindescription) AS maindescription,
          MAX(NULLIF(TRIM(r.mainunit), '')) AS mainunit,
          ${supplierGroupSql}
          COALESCE(SUM(CASE WHEN r.mainitemstock > 0 THEN r.mainitemstock ELSE 0 END), 0)::numeric AS stock_qty,
          COALESCE(SUM(CASE WHEN r.pendingorderqty > 0 THEN r.pendingorderqty ELSE 0 END), 0)::numeric AS order_qty
        FROM mes_item_categories c
        JOIN mes_item_category_groups g
          ON g.category_id = c.id
         AND g.is_active = true
        JOIN fp_actualrmdata r
          ON TRIM(r.catlinedesc) = TRIM(g.catlinedesc)
        WHERE c.is_active = true
          ${materialClassWhere}
          AND COALESCE(TRIM(r.mainitem), '') <> ''
          AND (
            COALESCE(r.mainitem, '') ILIKE $1
            OR COALESCE(r.maindescription, '') ILIKE $1
            OR COALESCE(TRIM(r.itemgroup), '') ILIKE $1
            OR COALESCE(TRIM(r.catlinedesc), '') ILIKE $1
            OR ${supplierSearchSql}
          )
        GROUP BY
          c.id,
          c.name,
          c.material_class,
          TRIM(r.catlinedesc),
          NULLIF(TRIM(r.itemgroup), ''),
          LOWER(TRIM(r.mainitem))
        ORDER BY c.name ASC, stock_qty DESC, mainitem ASC
        LIMIT ${limitParam}
      `, params);

      return res.json({ success: true, data: rows, count: rows.length });
    } catch (err) {
      logger.error('GET /items/custom-categories/search error:', err);
      return res.status(500).json({ success: false, error: 'Failed to search custom categories' });
    }
  });

  // ─── POST /items/custom-categories — Create ──────────────────────────────
  router.post('/items/custom-categories', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
      const { name, description, material_class, sort_order } = req.body;
      if (!name?.trim()) return res.status(400).json({ success: false, error: 'name is required' });
      const { rows } = await pool.query(`
        INSERT INTO mes_item_categories (name, description, material_class, sort_order, created_by)
        VALUES ($1, $2, $3, $4, $5) RETURNING *
      `, [name.trim(), description || null, material_class || null, sort_order || 99, req.user.id]);
      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('POST /items/custom-categories error:', err);
      res.status(500).json({ success: false, error: 'Failed to create category' });
    }
  });

  // ─── PUT /items/custom-categories/:id — Update ───────────────────────────
  router.put('/items/custom-categories/:id', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
      const id = parseInt(req.params.id, 10);
      const { name, description, material_class, sort_order } = req.body;
      const sets = []; const vals = []; let p = 1;
      if (name !== undefined) { sets.push(`name=$${p++}`); vals.push(name.trim()); }
      if (description !== undefined) { sets.push(`description=$${p++}`); vals.push(description); }
      if (material_class !== undefined) { sets.push(`material_class=$${p++}`); vals.push(material_class); }
      if (sort_order !== undefined) { sets.push(`sort_order=$${p++}`); vals.push(sort_order); }
      if (!sets.length) return res.status(400).json({ success: false, error: 'No fields to update' });
      sets.push(`updated_by=$${p++}`, `updated_at=NOW()`); vals.push(req.user.id);
      vals.push(id);
      const { rows } = await pool.query(`UPDATE mes_item_categories SET ${sets.join(',')} WHERE id=$${p} RETURNING *`, vals);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('PUT /items/custom-categories/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to update category' });
    }
  });

  // ─── DELETE /items/custom-categories/:id — Soft delete ───────────────────
  router.delete('/items/custom-categories/:id', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
      await pool.query('UPDATE mes_item_categories SET is_active=false, updated_at=NOW() WHERE id=$1', [parseInt(req.params.id, 10)]);
      res.json({ success: true });
    } catch (err) {
      logger.error('DELETE /items/custom-categories/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete category' });
    }
  });

  // ─── GET /items/custom-categories/:id/available-groups — Item Groups ─────
  router.get('/items/custom-categories/:id/available-groups', authenticate, async (req, res) => {
    try {
      const catId = parseInt(req.params.id, 10);
      const cat = await pool.query('SELECT material_class FROM mes_item_categories WHERE id=$1', [catId]);
      if (!cat.rows.length) return res.status(404).json({ success: false, error: 'Category not found' });
      const matClass = cat.rows[0].material_class;

      // Get oracle_categories for this material_class
      const { rows: mappings } = await pool.query(
        'SELECT oracle_category FROM mes_category_mapping WHERE material_class=$1 AND is_active=true', [matClass]
      );
      const oracleCats = mappings.map(m => m.oracle_category);

      // Get all unique catlinedesc values for these oracle categories
      const { rows: groups } = await pool.query(`
        SELECT
          TRIM(r.catlinedesc) AS catlinedesc,
          COUNT(DISTINCT LOWER(TRIM(r.mainitem)))::INT AS item_count,
          COALESCE(SUM(CASE WHEN r.mainitemstock > 0 THEN r.mainitemstock ELSE 0 END), 0)::NUMERIC AS stock_qty,
          g.id AS group_id,
          CASE WHEN g.id IS NOT NULL THEN true ELSE false END AS is_selected
        FROM fp_actualrmdata r
        LEFT JOIN mes_item_category_groups g ON g.category_id = $1 AND TRIM(g.catlinedesc) = TRIM(r.catlinedesc) AND g.is_active = true
        WHERE UPPER(TRIM(r.category)) = ANY($2)
          AND COALESCE(TRIM(r.catlinedesc), '') <> ''
        GROUP BY TRIM(r.catlinedesc), g.id
        ORDER BY stock_qty DESC, catlinedesc
      `, [catId, oracleCats]);

      // Also include custom groups for this category
      const { rows: customGroups } = await pool.query(`
        SELECT
          g.catlinedesc,
          g.id AS group_id,
          true AS is_selected,
          true AS is_custom,
          g.display_name,
          COALESCE(oc.item_count, 0)::INT AS item_count,
          COALESCE(oc.stock_qty, 0)::NUMERIC AS stock_qty
        FROM mes_item_category_groups g
        LEFT JOIN (
          SELECT o.category_id, o.override_group_name,
            COUNT(DISTINCT o.item_key)::INT AS item_count,
            COALESCE(SUM(CASE WHEN r.mainitemstock > 0 THEN r.mainitemstock ELSE 0 END), 0)::NUMERIC AS stock_qty
          FROM mes_item_group_overrides o
          LEFT JOIN fp_actualrmdata r ON LOWER(TRIM(r.mainitem)) = o.item_key
          GROUP BY o.category_id, o.override_group_name
        ) oc ON oc.category_id = g.category_id AND oc.override_group_name = g.catlinedesc
        WHERE g.category_id = $1 AND g.is_custom = true AND g.is_active = true
      `, [catId]);

      // Merge: oracle groups first, then custom groups
      const allGroups = [...groups, ...customGroups];
      res.json({ success: true, data: allGroups });
    } catch (err) {
      logger.error('GET /items/custom-categories/:id/available-groups error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch available groups' });
    }
  });

  // ─── PUT /items/custom-categories/:id/groups — Bulk upsert groups ────────
  router.put('/items/custom-categories/:id/groups', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
      const catId = parseInt(req.params.id, 10);
      const { groups } = req.body;
      if (!Array.isArray(groups)) return res.status(400).json({ success: false, error: 'groups array required' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Deactivate only Oracle (non-custom) groups for this category; keep custom groups intact
        await client.query('UPDATE mes_item_category_groups SET is_active=false, updated_at=NOW() WHERE category_id=$1 AND is_custom = false', [catId]);
        // Upsert provided groups
        for (const g of groups) {
          if (!g.catlinedesc?.trim()) continue;
          await client.query(`
            INSERT INTO mes_item_category_groups (category_id, catlinedesc, is_active, is_custom)
            VALUES ($1, $2, true, false)
            ON CONFLICT (category_id, catlinedesc) DO UPDATE SET
              is_active = true,
              is_custom = CASE WHEN mes_item_category_groups.is_custom THEN true ELSE false END,
              updated_at = NOW()
          `, [catId, g.catlinedesc.trim()]);
        }
        await client.query('COMMIT');
        res.json({ success: true, updated: groups.length });
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
    } catch (err) {
      logger.error('PUT /items/custom-categories/:id/groups error:', err);
      res.status(500).json({ success: false, error: 'Failed to update groups' });
    }
  });

  // ─── GET /items/custom-categories/:id/profile — 3-level aggregated profile ─
  // Level 1: Category totals
  // Level 2: Category Groups (catlinedesc) with item_groups breakdown
  // Level 3: Item Groups (itemgroup) with individual items
  router.get('/items/custom-categories/:id/profile', authenticate, async (req, res) => {
    try {
      const catId = parseInt(req.params.id, 10);
      const search = cleanText(req.query.search, 120);
      const searchLike = search ? `%${search}%` : null;
      const cat = await pool.query('SELECT * FROM mes_item_categories WHERE id=$1 AND is_active=true', [catId]);
      if (!cat.rows.length) return res.status(404).json({ success: false, error: 'Category not found' });
      const category = cat.rows[0];

      // Get selected catlinedesc groups for this category
      const { rows: selectedGroups } = await pool.query(
        'SELECT id, catlinedesc, is_custom, display_name FROM mes_item_category_groups WHERE category_id=$1 AND is_active=true ORDER BY catlinedesc',
        [catId]
      );

      if (!selectedGroups.length) {
        return res.json({ success: true, data: { category, groups: [], totals: {}, parameters: {} } });
      }

      // Separate Oracle vs custom groups
      const oracleGroups = selectedGroups.filter(g => !g.is_custom);
      const customGroups = selectedGroups.filter(g => !!g.is_custom);

      // Fetch formulation counts + active formulation info per Oracle group from new BOM tables
      // Keyed by LOWER(TRIM(catlinedesc)) for safe matching
      const formulationByGroup = {};
      try {
        const { rows: fRows } = await pool.query(`
          SELECT
            LOWER(TRIM(catlinedesc)) AS catlinedesc_key,
            COUNT(*)::INT AS formulation_count,
            COUNT(*) FILTER (WHERE status = 'active')::INT AS active_count,
            MAX(CASE WHEN is_default AND status NOT IN ('deleted','archived') THEN id END) AS default_formulation_id,
            MAX(CASE WHEN is_default AND status NOT IN ('deleted','archived') THEN name END) AS default_formulation_name,
            MAX(CASE WHEN is_default AND status NOT IN ('deleted','archived') THEN version END) AS default_formulation_version
          FROM mes_formulations
          WHERE category_id = $1 AND status <> 'deleted'
          GROUP BY LOWER(TRIM(catlinedesc))
        `, [catId]);
        for (const row of fRows) {
          formulationByGroup[row.catlinedesc_key] = row;
        }
      } catch (fErr) {
        // Table may not exist in older envs — non-blocking
        logger.warn('profile: mes_formulations query failed (non-blocking):', fErr.message);
      }

      // Build lookup for group metadata (is_custom, id, display_name)
      const groupMeta = {};
      for (const sg of selectedGroups) {
        const descKey = String(sg.catlinedesc || '').toLowerCase().trim();
        const fInfo = formulationByGroup[descKey] || {};
        groupMeta[sg.catlinedesc] = {
          group_id:                    sg.id,
          is_custom:                   !!sg.is_custom,
          display_name:                sg.display_name || null,
          formulation_count:           fInfo.formulation_count || 0,
          active_formulation_count:    fInfo.active_count || 0,
          default_formulation_id:      fInfo.default_formulation_id || null,
          default_formulation_name:    fInfo.default_formulation_name || null,
          default_formulation_version: fInfo.default_formulation_version || null,
        };
      }

      const oracleDescList = oracleGroups.map(g => g.catlinedesc);
      const customGroupNames = customGroups.map(g => g.catlinedesc);
      // catlinedescList used for TDS/non-resin parameter queries (includes Oracle only)
      const catlinedescList = oracleDescList;

      const { rows: rmColumnsRows } = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'fp_actualrmdata'
      `);
      const rmColumns = new Set(rmColumnsRows.map((row) => String(row.column_name || '').trim()));

      const buildRmSearchSql = (alias, paramIndex) => {
        const p = `$${paramIndex}`;
        const prefix = alias ? `${alias}.` : '';
        const fields = [
          `${prefix}mainitem`,
          `${prefix}maindescription`,
          `${prefix}itemgroup`,
          `${prefix}catlinedesc`,
        ];

        if (rmColumns.has('supplier')) fields.push(`${prefix}supplier`);

        return `(${p}::text IS NULL OR ${fields.map((field) => `COALESCE(${field}, '') ILIKE ${p}`).join(' OR ')})`;
      };

      const rmSearchSql = buildRmSearchSql('', 2);
      const rmSearchSqlR = buildRmSearchSql('r', 2);
      const rmSearchSqlTds = buildRmSearchSql('', 3);

      // ── Get overridden item keys for this category (so Oracle pass excludes them) ──
      let overriddenItemKeys = [];
      if (customGroupNames.length) {
        const { rows: overrideRows } = await pool.query(
          'SELECT DISTINCT item_key FROM mes_item_group_overrides WHERE category_id = $1',
          [catId]
        );
        overriddenItemKeys = overrideRows.map(r => r.item_key);
      }
      const hasOverrides = overriddenItemKeys.length > 0;
      const overrideExcludeSql = hasOverrides ? 'AND LOWER(TRIM(mainitem)) <> ALL($3::text[])' : '';
      const overrideExcludeSqlR = hasOverrides ? 'AND LOWER(TRIM(r.mainitem)) <> ALL($3::text[])' : '';

      // ── Fetch mapped material keys from profile configs so Oracle pass only counts
      //    items that are explicitly mapped.  catlinedesc values with no config (or an
      //    empty mapped_material_keys) are left unfiltered so new categories still show
      //    all Oracle items.
      let managedCatlinedescKeys = [];
      let allManagedItemKeys = [];
      if (oracleDescList.length) {
        try {
          const { rows: configRows } = await pool.query(`
            SELECT DISTINCT
              LOWER(TRIM(cat_desc)) AS catlinedesc_key,
              LOWER(TRIM(mk))       AS item_key
            FROM mes_material_profile_configs,
            UNNEST(COALESCE(mapped_material_keys, '{}'::text[])) AS mk
            WHERE LOWER(TRIM(cat_desc)) = ANY($1::text[])
              AND COALESCE(array_length(mapped_material_keys, 1), 0) > 0
          `, [oracleDescList.map((d) => String(d || '').toLowerCase().trim())]);
          managedCatlinedescKeys = [...new Set(configRows.map((r) => r.catlinedesc_key))];
          allManagedItemKeys     = [...new Set(configRows.map((r) => r.item_key))];
        } catch (cfgErr) {
          if (cfgErr.code !== '42P01') logger.warn('profile: mes_material_profile_configs query warning', { error: cfgErr.message });
        }
      }
      const hasManagedFilter = managedCatlinedescKeys.length > 0;

      // ── PASS 1: Oracle groups — aggregate per catlinedesc, excluding overridden items
      //    and items not in mapped_material_keys (when a profile config exists). ──
      const oracleParams = [oracleDescList, searchLike];
      if (hasOverrides) oracleParams.push(overriddenItemKeys);       // $3

      let managedFilterSql  = '';
      let managedFilterSqlR = '';
      if (hasManagedFilter) {
        const p = oracleParams.length + 1;                           // next $N
        oracleParams.push(managedCatlinedescKeys);                   // $p
        oracleParams.push(allManagedItemKeys);                       // $p+1
        managedFilterSql  = `AND (LOWER(TRIM(catlinedesc)) <> ALL($${p}::text[]) OR LOWER(TRIM(mainitem)) = ANY($${p + 1}::text[]))`;
        managedFilterSqlR = `AND (LOWER(TRIM(r.catlinedesc)) <> ALL($${p}::text[]) OR LOWER(TRIM(r.mainitem)) = ANY($${p + 1}::text[]))`;
      }

      const { rows: groupAgg } = oracleDescList.length ? await pool.query(`
        SELECT
          TRIM(catlinedesc) AS catlinedesc,
          COUNT(DISTINCT LOWER(TRIM(mainitem)))::INT AS item_count,
          COUNT(DISTINCT LOWER(TRIM(itemgroup)))::INT AS item_group_count,
          COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END), 0) AS stock_qty,
          COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END), 0) AS stock_val,
          COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END), 0) AS order_qty,
          COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END), 0) AS order_val
        FROM fp_actualrmdata
        WHERE TRIM(catlinedesc) = ANY($1)
          AND ${rmSearchSql}
          ${overrideExcludeSql}
          ${managedFilterSql}
        GROUP BY TRIM(catlinedesc)
        ORDER BY LOWER(TRIM(catlinedesc)) ASC
      `, oracleParams) : { rows: [] };

      // ── Oracle item groups ──
      const { rows: itemGroupAgg } = oracleDescList.length ? await pool.query(`
        SELECT
          TRIM(catlinedesc) AS catlinedesc,
          TRIM(itemgroup) AS itemgroup,
          COUNT(DISTINCT LOWER(TRIM(mainitem)))::INT AS item_count,
          COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END), 0) AS stock_qty,
          COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END), 0) AS stock_val,
          COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END), 0) AS order_qty,
          COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END), 0) AS order_val
        FROM fp_actualrmdata
        WHERE TRIM(catlinedesc) = ANY($1)
          AND ${rmSearchSql}
          AND COALESCE(TRIM(itemgroup), '') <> ''
          ${overrideExcludeSql}
          ${managedFilterSql}
        GROUP BY TRIM(catlinedesc), TRIM(itemgroup)
        ORDER BY LOWER(TRIM(catlinedesc)) ASC, LOWER(TRIM(itemgroup)) ASC
      `, oracleParams) : { rows: [] };

      // ── Oracle market prices ──
      const { rows: marketRows } = oracleDescList.length ? await pool.query(`
        SELECT
          TRIM(r.catlinedesc) AS catlinedesc,
          TRIM(r.itemgroup) AS itemgroup,
          SUM(CASE WHEN r.mainitemstock > 0 AND m.market_ref_price IS NOT NULL AND m.market_ref_price > 0
            THEN r.mainitemstock * m.market_ref_price ELSE 0 END) AS mkt_val,
          SUM(CASE WHEN r.mainitemstock > 0 AND m.market_ref_price IS NOT NULL AND m.market_ref_price > 0
            THEN r.mainitemstock ELSE 0 END) AS mkt_qty
        FROM fp_actualrmdata r
        LEFT JOIN mes_item_master m
          ON LOWER(TRIM(m.oracle_cat_desc)) = LOWER(TRIM(r.catlinedesc))
          AND LOWER(TRIM(m.item_code)) = LOWER(TRIM(r.mainitem))
        WHERE TRIM(r.catlinedesc) = ANY($1)
          AND ${rmSearchSqlR}
          AND COALESCE(TRIM(r.itemgroup), '') <> ''
          ${overrideExcludeSqlR}
          ${managedFilterSqlR}
        GROUP BY TRIM(r.catlinedesc), TRIM(r.itemgroup)
      `, oracleParams) : { rows: [] };

      // ── PASS 2: Custom groups — aggregate via overrides ──
      let customGroupAgg = [];
      let customItemGroupAgg = [];
      let customMarketRows = [];

      if (customGroupNames.length) {
        const rmSearchSqlCustom = buildRmSearchSql('r', 3);

        const { rows: cgAgg } = await pool.query(`
          SELECT
            o.override_group_name AS catlinedesc,
            COUNT(DISTINCT o.item_key)::INT AS item_count,
            COUNT(DISTINCT LOWER(TRIM(r.itemgroup)))::INT AS item_group_count,
            COALESCE(SUM(CASE WHEN r.mainitemstock > 0 THEN r.mainitemstock ELSE 0 END), 0) AS stock_qty,
            COALESCE(SUM(CASE WHEN r.mainitemstock > 0 THEN r.mainitemstock * r.maincost ELSE 0 END), 0) AS stock_val,
            COALESCE(SUM(CASE WHEN r.pendingorderqty > 0 THEN r.pendingorderqty ELSE 0 END), 0) AS order_qty,
            COALESCE(SUM(CASE WHEN r.pendingorderqty > 0 THEN r.pendingorderqty * r.purchaseprice ELSE 0 END), 0) AS order_val
          FROM mes_item_group_overrides o
          JOIN fp_actualrmdata r ON LOWER(TRIM(r.mainitem)) = o.item_key
          WHERE o.category_id = $1
            AND o.override_group_name = ANY($2)
            AND ${rmSearchSqlCustom}
          GROUP BY o.override_group_name
          ORDER BY LOWER(o.override_group_name) ASC
        `, [catId, customGroupNames, searchLike]);
        customGroupAgg = cgAgg;

        const { rows: cigAgg } = await pool.query(`
          SELECT
            o.override_group_name AS catlinedesc,
            TRIM(r.itemgroup) AS itemgroup,
            COUNT(DISTINCT o.item_key)::INT AS item_count,
            COALESCE(SUM(CASE WHEN r.mainitemstock > 0 THEN r.mainitemstock ELSE 0 END), 0) AS stock_qty,
            COALESCE(SUM(CASE WHEN r.mainitemstock > 0 THEN r.mainitemstock * r.maincost ELSE 0 END), 0) AS stock_val,
            COALESCE(SUM(CASE WHEN r.pendingorderqty > 0 THEN r.pendingorderqty ELSE 0 END), 0) AS order_qty,
            COALESCE(SUM(CASE WHEN r.pendingorderqty > 0 THEN r.pendingorderqty * r.purchaseprice ELSE 0 END), 0) AS order_val
          FROM mes_item_group_overrides o
          JOIN fp_actualrmdata r ON LOWER(TRIM(r.mainitem)) = o.item_key
          WHERE o.category_id = $1
            AND o.override_group_name = ANY($2)
            AND ${rmSearchSqlCustom}
            AND COALESCE(TRIM(r.itemgroup), '') <> ''
          GROUP BY o.override_group_name, TRIM(r.itemgroup)
          ORDER BY LOWER(o.override_group_name) ASC, LOWER(TRIM(r.itemgroup)) ASC
        `, [catId, customGroupNames, searchLike]);
        customItemGroupAgg = cigAgg;

        const rmSearchSqlCM = buildRmSearchSql('r', 3);
        const { rows: cmkt } = await pool.query(`
          SELECT
            o.override_group_name AS catlinedesc,
            TRIM(r.itemgroup) AS itemgroup,
            SUM(CASE WHEN r.mainitemstock > 0 AND m.market_ref_price IS NOT NULL AND m.market_ref_price > 0
              THEN r.mainitemstock * m.market_ref_price ELSE 0 END) AS mkt_val,
            SUM(CASE WHEN r.mainitemstock > 0 AND m.market_ref_price IS NOT NULL AND m.market_ref_price > 0
              THEN r.mainitemstock ELSE 0 END) AS mkt_qty
          FROM mes_item_group_overrides o
          JOIN fp_actualrmdata r ON LOWER(TRIM(r.mainitem)) = o.item_key
          LEFT JOIN mes_item_master m
            ON LOWER(TRIM(m.item_code)) = o.item_key
          WHERE o.category_id = $1
            AND o.override_group_name = ANY($2)
            AND ${rmSearchSqlCM}
            AND COALESCE(TRIM(r.itemgroup), '') <> ''
          GROUP BY o.override_group_name, TRIM(r.itemgroup)
        `, [catId, customGroupNames, searchLike]);
        customMarketRows = cmkt;
      }

      // Merge Oracle + custom aggregation results
      const allGroupAgg = [...groupAgg, ...customGroupAgg];
      const allItemGroupAgg = [...itemGroupAgg, ...customItemGroupAgg];
      const allMarketRows = [...marketRows, ...customMarketRows];

      // ── Filtered item keys (for TDS) — Oracle groups only ──
      const { rows: filteredItemRows } = oracleDescList.length ? await pool.query(`
        SELECT DISTINCT LOWER(TRIM(mainitem)) AS item_key
        FROM fp_actualrmdata
        WHERE TRIM(catlinedesc) = ANY($1)
          AND ${rmSearchSql}
      `, [oracleDescList, searchLike]) : { rows: [] };
      const filteredItemKeys = filteredItemRows
        .map((row) => row.item_key)
        .filter(Boolean);

      // Build market price lookup: catlinedesc::itemgroup → { mkt_val, mkt_qty }
      const mktByIG = {};
      const mktByDesc = {};
      let totalMktVal = 0, totalMktQty = 0;
      for (const mr of allMarketRows) {
        const key = `${mr.catlinedesc}::${mr.itemgroup}`;
        const mktVal = Number(mr.mkt_val) || 0;
        const mktQty = Number(mr.mkt_qty) || 0;
        mktByIG[key] = { mkt_val: mktVal, mkt_qty: mktQty };
        if (!mktByDesc[mr.catlinedesc]) mktByDesc[mr.catlinedesc] = { mkt_val: 0, mkt_qty: 0 };
        mktByDesc[mr.catlinedesc].mkt_val += mktVal;
        mktByDesc[mr.catlinedesc].mkt_qty += mktQty;
        totalMktVal += mktVal;
        totalMktQty += mktQty;
      }

      // ── Helper: compute 4 prices + default ──────────────────────────────
      const r4 = v => Math.round(v * 10000) / 10000;
      const computePrices = (stockQty, stockVal, orderQty, orderVal, mktQty, mktVal) => {
        const stockPriceWA = stockQty > 0 ? r4(stockVal / stockQty) : null;
        const onOrderPriceWA = orderQty > 0 ? r4(orderVal / orderQty) : null;
        const totalQ = stockQty + orderQty;
        const avgPriceWA = totalQ > 0 ? r4((stockVal + orderVal) / totalQ) : null;
        const marketPriceWA = mktQty > 0 ? r4(mktVal / mktQty) : (onOrderPriceWA ?? stockPriceWA ?? null);
        return { stock_price_wa: stockPriceWA, on_order_price_wa: onOrderPriceWA, avg_price_wa: avgPriceWA, market_price_wa: marketPriceWA };
      };

      // Group item_groups by catlinedesc (Oracle + custom merged)
      const itemGroupsByDesc = {};
      allItemGroupAgg.forEach(ig => {
        if (!itemGroupsByDesc[ig.catlinedesc]) itemGroupsByDesc[ig.catlinedesc] = [];
        const stockQty = Number(ig.stock_qty) || 0;
        const stockVal = Number(ig.stock_val) || 0;
        const orderQty = Number(ig.order_qty) || 0;
        const orderVal = Number(ig.order_val) || 0;
        const mkt = mktByIG[`${ig.catlinedesc}::${ig.itemgroup}`] || { mkt_val: 0, mkt_qty: 0 };
        const prices = computePrices(stockQty, stockVal, orderQty, orderVal, mkt.mkt_qty, mkt.mkt_val);
        itemGroupsByDesc[ig.catlinedesc].push({
          itemgroup: ig.itemgroup,
          item_count: Number(ig.item_count) || 0,
          stock_qty: stockQty,
          order_qty: orderQty,
          ...prices,
          stock_pct_of_group: null, // filled below
          order_pct_of_group: null,
        });
      });

      // Build groups array with item_groups and % breakdown (Oracle + custom)
      let totalStockQty = 0, totalStockVal = 0, totalOrderQty = 0, totalOrderVal = 0;
      const groups = allGroupAgg.map(g => {
        const stockQty = Number(g.stock_qty) || 0;
        const stockVal = Number(g.stock_val) || 0;
        const orderQty = Number(g.order_qty) || 0;
        const orderVal = Number(g.order_val) || 0;
        totalStockQty += stockQty;
        totalStockVal += stockVal;
        totalOrderQty += orderQty;
        totalOrderVal += orderVal;

        const mkt = mktByDesc[g.catlinedesc] || { mkt_val: 0, mkt_qty: 0 };
        const prices = computePrices(stockQty, stockVal, orderQty, orderVal, mkt.mkt_qty, mkt.mkt_val);

        const igs = (itemGroupsByDesc[g.catlinedesc] || []).map(ig => ({
          ...ig,
          stock_pct_of_group: stockQty > 0 ? Math.round(ig.stock_qty / stockQty * 1000) / 10 : 0,
          order_pct_of_group: orderQty > 0 ? Math.round(ig.order_qty / orderQty * 1000) / 10 : 0,
        }));

        const meta = groupMeta[g.catlinedesc] || {};
        return {
          catlinedesc: g.catlinedesc,
          group_id: meta.group_id || null,
          is_custom: !!meta.is_custom,
          display_name: meta.display_name || null,
          formulation_count:           meta.formulation_count || 0,
          active_formulation_count:    meta.active_formulation_count || 0,
          default_formulation_id:      meta.default_formulation_id || null,
          default_formulation_name:    meta.default_formulation_name || null,
          default_formulation_version: meta.default_formulation_version || null,
          item_count: Number(g.item_count) || 0,
          item_group_count: Number(g.item_group_count) || 0,
          stock_qty: stockQty,
          order_qty: orderQty,
          ...prices,
          item_groups: igs,
        };
      });

      // Add empty stubs for custom groups with no assigned items yet
      const existingGroupNames = new Set(groups.map(g => g.catlinedesc));
      for (const cg of customGroups) {
        if (!existingGroupNames.has(cg.catlinedesc)) {
          const meta = groupMeta[cg.catlinedesc] || {};
          groups.push({
            catlinedesc: cg.catlinedesc,
            group_id: meta.group_id || cg.id,
            is_custom: true,
            display_name: meta.display_name || cg.display_name || null,
            formulation_count:           meta.formulation_count || 0,
            active_formulation_count:    meta.active_formulation_count || 0,
            default_formulation_id:      meta.default_formulation_id || null,
            default_formulation_name:    meta.default_formulation_name || null,
            default_formulation_version: meta.default_formulation_version || null,
            item_count: 0,
            item_group_count: 0,
            stock_qty: 0,
            order_qty: 0,
            stock_price_wa: null,
            on_order_price_wa: null,
            avg_price_wa: null,
            market_price_wa: null,
            item_groups: [],
          });
        }
      }

      // ── Category-level totals (4-price model) ───────────────────────────
      const catPrices = computePrices(totalStockQty, totalStockVal, totalOrderQty, totalOrderVal, totalMktQty, totalMktVal);
      const totals = {
        stock_qty: totalStockQty,
        order_qty: totalOrderQty,
        ...catPrices,
        stock_val: Math.round(totalStockVal * 100) / 100,
        order_val: Math.round(totalOrderVal * 100) / 100,
      };

      // ── TDS Parameters (resins only) — weighted by stock qty ─────────────
      const parameters = {};
      if (category.material_class === 'resins') {
        const baseTdsFields = [
          'mfr_190_2_16',
          'mfr_190_5_0',
          'hlmi_190_21_6',
          'mfr_230_2_16_pp',
          'melt_flow_ratio',
          'density',
          'crystalline_melting_point',
          'vicat_softening_point',
          'heat_deflection_temp',
          'tensile_strength_break',
          'elongation_break',
          'brittleness_temp',
          'bulk_density',
          'flexural_modulus',
        ];

        try {
          const { rows: tdsColumns } = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'mes_material_tds'
          `);

          const existingColumns = new Set(tdsColumns.map((row) => String(row.column_name || '').trim()));
          const tdsFields = baseTdsFields.filter((field) => existingColumns.has(field));

          if (tdsFields.length) {
            const tdsParams = [catlinedescList, catlinedescList, searchLike];
            const itemFilterSql = filteredItemKeys.length
              ? 'AND LOWER(TRIM(t.oracle_item_code)) = ANY($4::text[])'
              : '';
            if (filteredItemKeys.length) tdsParams.push(filteredItemKeys);

            const { rows: tdsData } = await pool.query(`
              SELECT t.cat_desc, t.oracle_item_code,
                ${tdsFields.map(f => `t.${f}`).join(', ')},
                COALESCE(r.stock_qty, 0) AS stock_qty
              FROM mes_material_tds t
              LEFT JOIN (
                SELECT mainitem, SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END) AS stock_qty
                FROM fp_actualrmdata
                WHERE TRIM(catlinedesc) = ANY($2)
                  AND ${rmSearchSqlTds}
                GROUP BY mainitem
              ) r ON r.mainitem = t.oracle_item_code
              WHERE t.cat_desc = ANY($1)
                ${itemFilterSql}
            `, tdsParams);

            for (const field of tdsFields) {
              let wSum = 0, wQty = 0, minVal = null, maxVal = null;
              for (const t of tdsData) {
                const val = Number(t[field]);
                if (!Number.isFinite(val)) continue;
                const qty = Math.max(Number(t.stock_qty), 1);
                wSum += val * qty; wQty += qty;
                if (minVal === null || val < minVal) minVal = val;
                if (maxVal === null || val > maxVal) maxVal = val;
              }
              const div = field === 'density' || field === 'bulk_density' ? 1000 : 1;
              parameters[field] = {
                weighted_avg: wQty > 0 ? Math.round(wSum / wQty / div * 10000) / 10000 : null,
                min: minVal !== null ? Math.round(minVal / div * 10000) / 10000 : null,
                max: maxVal !== null ? Math.round(maxVal / div * 10000) / 10000 : null,
              };
            }
          }

          // Keep a consistent response shape even when some legacy DB snapshots miss columns.
          baseTdsFields.forEach((field) => {
            if (!Object.prototype.hasOwnProperty.call(parameters, field)) {
              parameters[field] = { weighted_avg: null, min: null, max: null };
            }
          });
        } catch (resinErr) {
          if (!['42P01', '42703'].includes(resinErr.code)) throw resinErr;
          logger.warn('Skipping resin parameter aggregation due to mes_material_tds schema mismatch', {
            code: resinErr.code,
            message: resinErr.message,
          });
        }
      } else {
        try {
          const { rows: nonResinRows } = await pool.query(`
            WITH rm_by_item AS (
              SELECT
                LOWER(TRIM(mainitem)) AS item_key,
                COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END), 0)::numeric AS stock_qty
              FROM fp_actualrmdata
              WHERE TRIM(catlinedesc) = ANY($1)
                AND ${rmSearchSql}
              GROUP BY LOWER(TRIM(mainitem))
            )
            SELECT
              s.parameters_json,
              COALESCE(r.stock_qty, 0)::numeric AS stock_qty
            FROM mes_non_resin_material_specs s
            LEFT JOIN rm_by_item r
              ON r.item_key = COALESCE(NULLIF(LOWER(TRIM(s.mainitem)), ''), LOWER(TRIM(s.material_key)))
            WHERE COALESCE(TRIM(s.catlinedesc), '') = ANY($1)
              OR COALESCE(NULLIF(LOWER(TRIM(s.mainitem)), ''), LOWER(TRIM(s.material_key))) IN (SELECT item_key FROM rm_by_item)
          `, [catlinedescList, searchLike]);

          const agg = {};
          for (const row of nonResinRows) {
            if (!isPlainObject(row.parameters_json)) continue;
            const stockQty = Number(row.stock_qty) || 0;
            const fallbackQty = stockQty > 0 ? stockQty : 1;

            for (const [key, rawVal] of Object.entries(row.parameters_json)) {
              const value = toFiniteNumber(rawVal);
              if (value == null) continue;

              if (!agg[key]) {
                agg[key] = {
                  weightedSum: 0,
                  weightedQty: 0,
                  min: null,
                  max: null,
                };
              }

              agg[key].weightedSum += value * fallbackQty;
              agg[key].weightedQty += fallbackQty;
              if (agg[key].min == null || value < agg[key].min) agg[key].min = value;
              if (agg[key].max == null || value > agg[key].max) agg[key].max = value;
            }
          }

          for (const [key, row] of Object.entries(agg)) {
            parameters[key] = {
              weighted_avg: row.weightedQty > 0
                ? Math.round((row.weightedSum / row.weightedQty) * 10000) / 10000
                : null,
              min: row.min != null ? Math.round(row.min * 10000) / 10000 : null,
              max: row.max != null ? Math.round(row.max * 10000) / 10000 : null,
            };
          }
        } catch (nonResinErr) {
          // Keep profile resilient if non-resin specs table is unavailable in older DB snapshots.
          if (nonResinErr.code !== '42P01') throw nonResinErr;
        }
      }

      res.json({ success: true, data: { category, totals, groups, parameters } });
    } catch (err) {
      logger.error('GET /items/custom-categories/:id/profile error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch category profile' });
    }
  });


  // ─── GET /items/custom-categories/:id/item-group/:itemgroup — Item Group detail ─
  // Returns all items in an item group with Oracle live data + mes_item_master data + TDS params
  // 4-price model at group level + per-item breakdown
  router.get('/items/custom-categories/:id/item-group/:itemgroup', authenticate, async (req, res) => {
    try {
      const catId = parseInt(req.params.id, 10);
      const itemgroup = decodeURIComponent(req.params.itemgroup).trim();
      const catlinedescFilter = cleanText(req.query.catlinedesc);

      // Verify category exists and get its catlinedesc list
      const cat = await pool.query('SELECT * FROM mes_item_categories WHERE id=$1 AND is_active=true', [catId]);
      if (!cat.rows.length) return res.status(404).json({ success: false, error: 'Category not found' });
      const category = cat.rows[0];

      const { rows: selectedGroups } = await pool.query(
        'SELECT catlinedesc FROM mes_item_category_groups WHERE category_id=$1 AND is_active=true',
        [catId]
      );
      const catlinedescList = selectedGroups.map(g => g.catlinedesc);

      const { rows: rmColumnsRows } = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'fp_actualrmdata'
      `);
      const rmColumns = new Set(rmColumnsRows.map((row) => String(row.column_name || '').trim()));
      const rmSupplierColumns = ['supplier', 'supplier_name', 'suppliercode', 'supplier_code', 'vendor', 'vendor_name'];
      const supplierColumn = rmSupplierColumns.find((column) => rmColumns.has(column));
      const supplierSelectSql = supplierColumn
        ? `MAX(NULLIF(TRIM(${supplierColumn}), '')) AS supplier,`
        : 'NULL::text AS supplier,';
      const warehouseSelectSql = rmColumns.has('warehouse')
        ? "MAX(NULLIF(TRIM(warehouse), '')) AS warehouse,"
        : 'NULL::text AS warehouse,';

      const scopedCatlinedescList = catlinedescFilter
        ? catlinedescList.filter((value) => String(value || '').trim() === catlinedescFilter)
        : catlinedescList;

      if (!scopedCatlinedescList.length) {
        return res.status(400).json({
          success: false,
          error: catlinedescFilter
            ? 'catlinedesc is not mapped to this category'
            : 'No category groups are mapped for this category',
        });
      }

      // Items that are reassigned to a custom group in this category must be excluded
      // from Oracle item-group queries to avoid double-counting.
      const { rows: overriddenRows } = await pool.query(
        'SELECT item_key FROM mes_item_group_overrides WHERE category_id = $1',
        [catId]
      );
      const overriddenKeys = overriddenRows.map((r) => r.item_key);
      const igOverrideExcludeSql = overriddenKeys.length
        ? 'AND LOWER(TRIM(mainitem)) <> ALL($3::text[])'
        : '';
      const igOracleParams = overriddenKeys.length
        ? [scopedCatlinedescList, itemgroup, overriddenKeys]
        : [scopedCatlinedescList, itemgroup];

      // ── Oracle live data: all items in this itemgroup ──────────────────
      const { rows: rmItems } = await pool.query(`
        SELECT
          LOWER(TRIM(mainitem)) AS item_key,
          MAX(TRIM(catlinedesc)) AS catlinedesc,
          MAX(mainitem) AS mainitem,
          MAX(maindescription) AS maindescription,
          MAX(NULLIF(TRIM(mainunit), '')) AS mainunit,
          ${supplierSelectSql}
          ${warehouseSelectSql}
          COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END), 0)::numeric AS stock_qty,
          COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END), 0)::numeric AS stock_val,
          COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END), 0)::numeric AS order_qty,
          COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END), 0)::numeric AS order_val
        FROM fp_actualrmdata
        WHERE TRIM(catlinedesc) = ANY($1)
          AND TRIM(itemgroup) = $2
          ${igOverrideExcludeSql}
        GROUP BY LOWER(TRIM(mainitem))
        ORDER BY mainitem ASC
      `, igOracleParams);

      // ── mes_item_master data for these items ───────────────────────────
      const itemKeys = rmItems.map(r => r.item_key);
      let masterMap = {};
      if (itemKeys.length) {
        const { rows: masterRows } = await pool.query(`
          SELECT *
          FROM mes_item_master
          WHERE LOWER(TRIM(item_code)) = ANY($1) AND is_active = true
        `, [itemKeys]);
        masterRows.forEach(m => { masterMap[m.item_code.trim().toLowerCase()] = m; });
      }

      // ── TDS params for these items ─────────────────────────────────────
      let tdsMap = {};
      if (itemKeys.length) {
        const { rows: tdsRows } = await pool.query(`
          SELECT * FROM mes_material_tds
          WHERE LOWER(TRIM(oracle_item_code)) = ANY($1)
        `, [itemKeys]);
        tdsRows.forEach(t => { tdsMap[t.oracle_item_code.trim().toLowerCase()] = t; });
      }

      const supplierNameById = {};
      const supplierIds = Array.from(new Set(
        Object.values(tdsMap)
          .map((row) => parseOptionalInteger(row.supplier_id))
          .filter((id) => id != null)
      ));
      if (supplierIds.length) {
        try {
          const { rows: supplierRows } = await pool.query(
            'SELECT id, name FROM mes_suppliers WHERE id = ANY($1)',
            [supplierIds]
          );
          supplierRows.forEach((row) => {
            const name = cleanText(row.name, 200);
            if (name) supplierNameById[String(row.id)] = name;
          });
        } catch (supplierErr) {
          if (supplierErr.code !== '42P01') throw supplierErr;
        }
      }

      let nonResinSpecMap = {};
      let nonResinSupplierMap = {};
      if (itemKeys.length) {
        try {
          const { rows: nonResinColumnsRows } = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'mes_non_resin_material_specs'
          `);
          const nonResinColumns = new Set(nonResinColumnsRows.map((row) => String(row.column_name || '').trim()));
          const nonResinSupplierSelectSql = nonResinColumns.has('supplier_name')
            ? 'supplier_name,'
            : 'NULL::text AS supplier_name,';

          const { rows: nonResinRows } = await pool.query(`
            SELECT material_key, mainitem, ${nonResinSupplierSelectSql} parameters_json
            FROM mes_non_resin_material_specs
            WHERE COALESCE(NULLIF(LOWER(TRIM(mainitem)), ''), LOWER(TRIM(material_key))) = ANY($1)
          `, [itemKeys]);

          nonResinRows.forEach((row) => {
            const itemKey = String(row.mainitem || row.material_key || '').trim().toLowerCase();
            if (!itemKey) return;
            if (isPlainObject(row.parameters_json)) {
              nonResinSpecMap[itemKey] = row.parameters_json;
            }
            const supplierName = cleanText(row.supplier_name, 200);
            if (supplierName) nonResinSupplierMap[itemKey] = supplierName;
          });
        } catch (nonResinErr) {
          if (nonResinErr.code !== '42P01') throw nonResinErr;
        }
      }

      // ── Build items array with 4-price model ──────────────────────────
      const r4 = v => Math.round(v * 10000) / 10000;
      let grpStockQty = 0, grpStockVal = 0, grpOrderQty = 0, grpOrderVal = 0, grpMktVal = 0, grpMktQty = 0;

      const items = rmItems.map(rm => {
        const stockQty = Number(rm.stock_qty) || 0;
        const stockVal = Number(rm.stock_val) || 0;
        const orderQty = Number(rm.order_qty) || 0;
        const orderVal = Number(rm.order_val) || 0;
        grpStockQty += stockQty;
        grpStockVal += stockVal;
        grpOrderQty += orderQty;
        grpOrderVal += orderVal;

        const master = masterMap[rm.item_key] || {};
        const tds = tdsMap[rm.item_key] || {};
        const nonResinSpec = nonResinSpecMap[rm.item_key] || {};
        const tdsParams = tds.id
          ? Object.fromEntries(
            Object.entries(tds).filter(([k]) => !['id','oracle_item_code','cat_desc','brand_grade','supplier_name','unit','created_at','updated_at','spec_table'].includes(k) && tds[k] != null)
          )
          : {};
        const resolvedParams = Object.keys(tdsParams).length ? tdsParams : nonResinSpec;
        const tdsSupplierId = parseOptionalInteger(tds.supplier_id);
        const resolvedSupplier = cleanText(
          rm.supplier
          || master.supplier_name
          || master.supplier
          || (tdsSupplierId != null ? supplierNameById[String(tdsSupplierId)] : null)
          || tds.supplier_name
          || tds.supplier_id
          || nonResinSupplierMap[rm.item_key]
          || null,
          200
        );
        const mktPrice = Number(master.market_ref_price) || 0;
        if (mktPrice > 0 && stockQty > 0) {
          grpMktVal += stockQty * mktPrice;
          grpMktQty += stockQty;
        }

        const stockPriceWA = stockQty > 0 ? r4(stockVal / stockQty) : null;
        const onOrderPriceWA = orderQty > 0 ? r4(orderVal / orderQty) : null;
        const totalQ = stockQty + orderQty;
        const avgPriceWA = totalQ > 0 ? r4((stockVal + orderVal) / totalQ) : null;
        const marketPrice = mktPrice > 0 ? mktPrice : (onOrderPriceWA ?? stockPriceWA ?? null);

        return {
          item_key: rm.item_key,
          catlinedesc: rm.catlinedesc || null,
          mainitem: rm.mainitem,
          maindescription: rm.maindescription,
          mainunit: rm.mainunit || 'KG',
          supplier: resolvedSupplier,
          stock_qty: stockQty,
          order_qty: orderQty,
          stock_price: stockPriceWA,
          on_order_price: onOrderPriceWA,
          avg_price: avgPriceWA,
          market_price: marketPrice,
          market_price_date: master.market_price_date || null,
          // mes_item_master fields
          master_id: master.id || null,
          // MRP fields
          mrp_type: master.mrp_type || null,
          reorder_point: master.reorder_point ? Number(master.reorder_point) : null,
          safety_stock_kg: master.safety_stock_kg ? Number(master.safety_stock_kg) : null,
          procurement_type: master.procurement_type || null,
          planned_lead_time_days: master.planned_lead_time_days ? Number(master.planned_lead_time_days) : null,
          lot_size_rule: master.lot_size_rule || null,
          fixed_lot_size_kg: master.fixed_lot_size_kg ? Number(master.fixed_lot_size_kg) : null,
          assembly_scrap_pct: master.assembly_scrap_pct ? Number(master.assembly_scrap_pct) : null,
          // TDS params (flat)
          tds_id: tds.id || (Object.keys(nonResinSpec).length ? `NR-${rm.item_key}` : null),
          tds_params: resolvedParams,
        };
      });

      // ── Group-level 4-price totals ─────────────────────────────────────
      const stockPriceWA = grpStockQty > 0 ? r4(grpStockVal / grpStockQty) : null;
      const onOrderPriceWA = grpOrderQty > 0 ? r4(grpOrderVal / grpOrderQty) : null;
      const totalQ = grpStockQty + grpOrderQty;
      const avgPriceWA = totalQ > 0 ? r4((grpStockVal + grpOrderVal) / totalQ) : null;
      const marketPriceWA = grpMktQty > 0 ? r4(grpMktVal / grpMktQty) : (onOrderPriceWA ?? stockPriceWA ?? null);

      const totals = {
        stock_qty: grpStockQty,
        order_qty: grpOrderQty,
        stock_price_wa: stockPriceWA,
        on_order_price_wa: onOrderPriceWA,
        avg_price_wa: avgPriceWA,
        market_price_wa: marketPriceWA,
        stock_val: Math.round(grpStockVal * 100) / 100,
        order_val: Math.round(grpOrderVal * 100) / 100,
      };

      const resolvedCatlinedesc = (() => {
        if (catlinedescFilter) return catlinedescFilter;
        if (scopedCatlinedescList.length === 1) return scopedCatlinedescList[0];
        const unique = Array.from(new Set(items.map((item) => item.catlinedesc).filter(Boolean)));
        return unique.length === 1 ? unique[0] : null;
      })();

      res.json({
        success: true,
        data: {
          category,
          catlinedesc: resolvedCatlinedesc,
          itemgroup,
          totals,
          items,
        },
      });
    } catch (err) {
      logger.error('GET /items/custom-categories/:id/item-group/:itemgroup error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch item group detail' });
    }
  });


  // ─── GET /items/custom-categories/:id/category-group/:catlinedesc/detail ─
  // Returns all items in a category group (catlinedesc) with Oracle + mes_item_master + specs.
  router.get('/items/custom-categories/:id/category-group/:catlinedesc/detail', authenticate, async (req, res) => {
    try {
      const catId = parseInt(req.params.id, 10);
      const catlinedesc = decodeURIComponent(req.params.catlinedesc).trim();

      const cat = await pool.query('SELECT * FROM mes_item_categories WHERE id=$1 AND is_active=true', [catId]);
      if (!cat.rows.length) return res.status(404).json({ success: false, error: 'Category not found' });
      const category = cat.rows[0];

      const { rows: selectedGroups } = await pool.query(
        'SELECT id, catlinedesc, is_custom FROM mes_item_category_groups WHERE category_id=$1 AND is_active=true',
        [catId]
      );
      const allowedGroups = new Set(selectedGroups.map((g) => String(g.catlinedesc || '').trim()));
      if (!allowedGroups.has(catlinedesc)) {
        return res.status(400).json({ success: false, error: 'catlinedesc is not mapped to this category' });
      }
      const matchedGroup = selectedGroups.find((g) => String(g.catlinedesc || '').trim() === catlinedesc) || null;
      const isCustomGroup = Boolean(matchedGroup?.is_custom);
      const groupId = matchedGroup?.id ? Number(matchedGroup.id) : null;

      let formulationByItemKey = {};
      let formulationTotals = null;
      let hasFormulation = false;

      if (isCustomGroup && normalizeMaterialKey(category.material_class) === 'adhesives' && groupId) {
        const formulationResult = await getAdhesiveFormulationData(catId, groupId);
        if (!formulationResult.error) {
          const components = Array.isArray(formulationResult.data?.components)
            ? formulationResult.data.components
            : [];
          hasFormulation = components.length > 0;
          formulationTotals = formulationResult.data?.totals || null;
          formulationByItemKey = components.reduce((acc, component) => {
            const key = normalizeMaterialKey(component?.item_key);
            if (key) acc[key] = component;
            return acc;
          }, {});
        }
      }

      const { rows: rmColumnsRows } = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'fp_actualrmdata'
      `);
      const rmColumns = new Set(rmColumnsRows.map((row) => String(row.column_name || '').trim()));
      const rmSupplierColumns = ['supplier', 'supplier_name', 'suppliercode', 'supplier_code', 'vendor', 'vendor_name'];
      const supplierColumn = rmSupplierColumns.find((column) => rmColumns.has(column));
      const supplierSelectSql = supplierColumn
        ? `MAX(NULLIF(TRIM(${supplierColumn}), '')) AS supplier,`
        : 'NULL::text AS supplier,';
      const warehouseSelectSql = rmColumns.has('warehouse')
        ? "MAX(NULLIF(TRIM(warehouse), '')) AS warehouse,"
        : 'NULL::text AS warehouse,';

      const customSupplierSql = supplierColumn
        ? `MAX(NULLIF(TRIM(r.${supplierColumn}), '')) AS supplier,`
        : 'NULL::text AS supplier,';
      const customWarehouseSql = rmColumns.has('warehouse')
        ? "MAX(NULLIF(TRIM(r.warehouse), '')) AS warehouse,"
        : 'NULL::text AS warehouse,';

      let rmItems;
      if (isCustomGroup) {
        // Custom group: fetch items via override table
        const { rows } = await pool.query(`
          SELECT
            o.item_key,
            o.original_catlinedesc,
            MAX(r.mainitem) AS mainitem,
            MAX(r.maindescription) AS maindescription,
            MAX(NULLIF(TRIM(r.mainunit), '')) AS mainunit,
            MAX(NULLIF(TRIM(r.itemgroup), '')) AS itemgroup,
            ${customSupplierSql}
            ${customWarehouseSql}
            COALESCE(SUM(CASE WHEN r.mainitemstock > 0 THEN r.mainitemstock ELSE 0 END), 0)::numeric AS stock_qty,
            COALESCE(SUM(CASE WHEN r.mainitemstock > 0 THEN r.mainitemstock * r.maincost ELSE 0 END), 0)::numeric AS stock_val,
            COALESCE(SUM(CASE WHEN r.pendingorderqty > 0 THEN r.pendingorderqty ELSE 0 END), 0)::numeric AS order_qty,
            COALESCE(SUM(CASE WHEN r.pendingorderqty > 0 THEN r.pendingorderqty * r.purchaseprice ELSE 0 END), 0)::numeric AS order_val
          FROM mes_item_group_overrides o
          JOIN fp_actualrmdata r ON LOWER(TRIM(r.mainitem)) = o.item_key
          WHERE o.category_id = $1
            AND o.override_group_name = $2
          GROUP BY o.item_key, o.original_catlinedesc
          ORDER BY MAX(r.mainitem) ASC
        `, [catId, catlinedesc]);
        rmItems = rows;
      } else {
        // Oracle group: fetch items, excluding any that were reassigned to a custom group
        // within this category via mes_item_group_overrides (they belong to another group now).
        const { rows: overriddenRows } = await pool.query(
          'SELECT item_key FROM mes_item_group_overrides WHERE category_id = $1',
          [catId]
        );
        const overriddenKeys = overriddenRows.map((r) => r.item_key);
        const overrideExcludeSql = overriddenKeys.length
          ? 'AND LOWER(TRIM(mainitem)) <> ALL($2::text[])'
          : '';
        const oracleParams = overriddenKeys.length ? [catlinedesc, overriddenKeys] : [catlinedesc];

        const { rows } = await pool.query(`
          SELECT
            LOWER(TRIM(mainitem)) AS item_key,
            MAX(mainitem) AS mainitem,
            MAX(maindescription) AS maindescription,
            MAX(NULLIF(TRIM(mainunit), '')) AS mainunit,
            MAX(NULLIF(TRIM(itemgroup), '')) AS itemgroup,
            ${supplierSelectSql}
            ${warehouseSelectSql}
            COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END), 0)::numeric AS stock_qty,
            COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END), 0)::numeric AS stock_val,
            COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END), 0)::numeric AS order_qty,
            COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END), 0)::numeric AS order_val
          FROM fp_actualrmdata
          WHERE TRIM(catlinedesc) = $1
            ${overrideExcludeSql}
          GROUP BY LOWER(TRIM(mainitem))
          ORDER BY mainitem ASC
        `, oracleParams);
        rmItems = rows;
      }

      const itemKeys = rmItems.map((r) => r.item_key);

      let masterMap = {};
      if (itemKeys.length) {
        const { rows: masterRows } = await pool.query(`
          SELECT *
          FROM mes_item_master
          WHERE LOWER(TRIM(item_code)) = ANY($1) AND is_active = true
        `, [itemKeys]);
        masterRows.forEach((m) => { masterMap[m.item_code.trim().toLowerCase()] = m; });
      }

      let tdsMap = {};
      if (itemKeys.length) {
        const { rows: tdsRows } = await pool.query(`
          SELECT * FROM mes_material_tds
          WHERE LOWER(TRIM(oracle_item_code)) = ANY($1)
        `, [itemKeys]);
        tdsRows.forEach((t) => { tdsMap[t.oracle_item_code.trim().toLowerCase()] = t; });
      }

      const supplierNameById = {};
      const supplierIds = Array.from(new Set(
        Object.values(tdsMap)
          .map((row) => parseOptionalInteger(row.supplier_id))
          .filter((id) => id != null)
      ));
      if (supplierIds.length) {
        try {
          const { rows: supplierRows } = await pool.query(
            'SELECT id, name FROM mes_suppliers WHERE id = ANY($1)',
            [supplierIds]
          );
          supplierRows.forEach((row) => {
            const name = cleanText(row.name, 200);
            if (name) supplierNameById[String(row.id)] = name;
          });
        } catch (supplierErr) {
          if (supplierErr.code !== '42P01') throw supplierErr;
        }
      }

      let nonResinSpecMap = {};
      let nonResinSupplierMap = {};
      if (itemKeys.length) {
        try {
          const { rows: nonResinColumnsRows } = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'mes_non_resin_material_specs'
          `);
          const nonResinColumns = new Set(nonResinColumnsRows.map((row) => String(row.column_name || '').trim()));
          const nonResinSupplierSelectSql = nonResinColumns.has('supplier_name')
            ? 'supplier_name,'
            : 'NULL::text AS supplier_name,';

          const { rows: nonResinRows } = await pool.query(`
            SELECT material_key, mainitem, ${nonResinSupplierSelectSql} parameters_json
            FROM mes_non_resin_material_specs
            WHERE COALESCE(NULLIF(LOWER(TRIM(mainitem)), ''), LOWER(TRIM(material_key))) = ANY($1)
          `, [itemKeys]);

          nonResinRows.forEach((row) => {
            const itemKey = String(row.mainitem || row.material_key || '').trim().toLowerCase();
            if (!itemKey) return;
            if (isPlainObject(row.parameters_json)) {
              nonResinSpecMap[itemKey] = row.parameters_json;
            }
            const supplierName = cleanText(row.supplier_name, 200);
            if (supplierName) nonResinSupplierMap[itemKey] = supplierName;
          });
        } catch (nonResinErr) {
          if (nonResinErr.code !== '42P01') throw nonResinErr;
        }
      }

      const r4 = (v) => Math.round(v * 10000) / 10000;
      let grpStockQty = 0;
      let grpStockVal = 0;
      let grpOrderQty = 0;
      let grpOrderVal = 0;
      let grpMktVal = 0;
      let grpMktQty = 0;

      const items = rmItems.map((rm) => {
        const stockQty = Number(rm.stock_qty) || 0;
        const stockVal = Number(rm.stock_val) || 0;
        const orderQty = Number(rm.order_qty) || 0;
        const orderVal = Number(rm.order_val) || 0;
        grpStockQty += stockQty;
        grpStockVal += stockVal;
        grpOrderQty += orderQty;
        grpOrderVal += orderVal;

        const master = masterMap[rm.item_key] || {};
        const tds = tdsMap[rm.item_key] || {};
        const nonResinSpec = nonResinSpecMap[rm.item_key] || {};
        const formulationComponent = formulationByItemKey[rm.item_key] || null;

        const tdsParams = tds.id
          ? Object.fromEntries(
            Object.entries(tds).filter(([k]) => !['id', 'oracle_item_code', 'cat_desc', 'brand_grade', 'supplier_name', 'unit', 'created_at', 'updated_at', 'spec_table'].includes(k) && tds[k] != null)
          )
          : {};
        const resolvedParams = Object.keys(tdsParams).length ? tdsParams : nonResinSpec;
        const tdsSupplierId = parseOptionalInteger(tds.supplier_id);
        const resolvedSupplier = cleanText(
          rm.supplier
          || master.supplier_name
          || master.supplier
          || (tdsSupplierId != null ? supplierNameById[String(tdsSupplierId)] : null)
          || tds.supplier_name
          || tds.supplier_id
          || nonResinSupplierMap[rm.item_key]
          || null,
          200
        );

        const mktPrice = Number(master.market_ref_price) || 0;
        if (mktPrice > 0 && stockQty > 0) {
          grpMktVal += stockQty * mktPrice;
          grpMktQty += stockQty;
        }

        const stockPriceWA = stockQty > 0 ? r4(stockVal / stockQty) : null;
        const onOrderPriceWA = orderQty > 0 ? r4(orderVal / orderQty) : null;
        const totalQ = stockQty + orderQty;
        const avgPriceWA = totalQ > 0 ? r4((stockVal + orderVal) / totalQ) : null;
        const marketPrice = mktPrice > 0 ? mktPrice : (onOrderPriceWA ?? stockPriceWA ?? null);

        return {
          item_key: rm.item_key,
          catlinedesc,
          original_catlinedesc: isCustomGroup ? (rm.original_catlinedesc || null) : null,
          itemgroup: rm.itemgroup || null,
          mainitem: rm.mainitem,
          maindescription: rm.maindescription,
          mainunit: rm.mainunit || 'KG',
          supplier: resolvedSupplier,
          stock_qty: stockQty,
          order_qty: orderQty,
          stock_price: stockPriceWA,
          on_order_price: onOrderPriceWA,
          avg_price: avgPriceWA,
          market_price: marketPrice,
          market_price_date: master.market_price_date || null,
          master_id: master.id || null,
          mrp_type: master.mrp_type || null,
          reorder_point: master.reorder_point ? Number(master.reorder_point) : null,
          safety_stock_kg: master.safety_stock_kg ? Number(master.safety_stock_kg) : null,
          procurement_type: master.procurement_type || null,
          planned_lead_time_days: master.planned_lead_time_days ? Number(master.planned_lead_time_days) : null,
          lot_size_rule: master.lot_size_rule || null,
          fixed_lot_size_kg: master.fixed_lot_size_kg ? Number(master.fixed_lot_size_kg) : null,
          assembly_scrap_pct: master.assembly_scrap_pct ? Number(master.assembly_scrap_pct) : null,
          tds_id: tds.id || (Object.keys(nonResinSpec).length ? `NR-${rm.item_key}` : null),
          tds_params: resolvedParams,
          formulation_component_role: formulationComponent?.component_role || null,
          formulation_parts: toFiniteNumber(formulationComponent?.parts),
          formulation_solids_pct: toFiniteNumber(formulationComponent?.solids_pct),
          formulation_unit_price: toFiniteNumber(formulationComponent?.unit_price),
          formulation_component_cost: toFiniteNumber(formulationComponent?.component_cost),
        };
      });

      const stockPriceWA = grpStockQty > 0 ? r4(grpStockVal / grpStockQty) : null;
      const onOrderPriceWA = grpOrderQty > 0 ? r4(grpOrderVal / grpOrderQty) : null;
      const totalQ = grpStockQty + grpOrderQty;
      const avgPriceWA = totalQ > 0 ? r4((grpStockVal + grpOrderVal) / totalQ) : null;
      const marketPriceWA = grpMktQty > 0 ? r4(grpMktVal / grpMktQty) : (onOrderPriceWA ?? stockPriceWA ?? null);

      const totals = {
        stock_qty: grpStockQty,
        order_qty: grpOrderQty,
        stock_price_wa: stockPriceWA,
        on_order_price_wa: onOrderPriceWA,
        avg_price_wa: avgPriceWA,
        market_price_wa: marketPriceWA,
        stock_val: Math.round(grpStockVal * 100) / 100,
        order_val: Math.round(grpOrderVal * 100) / 100,
      };

      res.json({
        success: true,
        data: {
          category,
          catlinedesc,
          group_id: groupId,
          is_custom_group: isCustomGroup,
          has_formulation: hasFormulation,
          formulation_totals: formulationTotals,
          itemgroup: catlinedesc,
          totals,
          items,
        },
      });
    } catch (err) {
      logger.error('GET /items/custom-categories/:id/category-group/:catlinedesc/detail error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch category group detail' });
    }
  });

  // ─── POST /items/custom-categories/detail-aggregates ─────────────────────
  // Computes filtered Overview aggregates (pricing, weighted specs, metrics)
  // from detail items on the backend to keep one source of truth.
  router.post('/items/custom-categories/detail-aggregates', authenticate, async (req, res) => {
    try {
      const materialClass = cleanText(req.body?.material_class, 100);
      const sourceItems = Array.isArray(req.body?.items) ? req.body.items : [];
      const search = cleanText(req.body?.search, 180);
      const supplier = cleanText(req.body?.supplier, 200);

      if (sourceItems.length > 5000) {
        return res.status(400).json({ success: false, error: 'Too many items for aggregate request' });
      }

      const sanitizedItems = sourceItems.filter((item) => isPlainObject(item));
      const visibleItems = filterDetailItems(sanitizedItems, { search, supplier });

      const parameterKeys = Array.from(new Set(
        visibleItems.flatMap((item) => {
          const params = isPlainObject(item.tds_params) ? item.tds_params : {};
          return Object.keys(params || {}).map((key) => normalizeMaterialKey(key)).filter(Boolean);
        })
      ));

      const parameterDefinitionsMap = await getParameterDefinitionsMap(materialClass, parameterKeys);
      const aggregates = buildDetailAggregates(visibleItems, materialClass, parameterDefinitionsMap);

      return res.json({
        success: true,
        data: {
          total_count: sanitizedItems.length,
          visible_count: visibleItems.length,
          ...aggregates,
        },
      });
    } catch (err) {
      logger.error('POST /items/custom-categories/detail-aggregates error:', err);
      return res.status(500).json({ success: false, error: 'Failed to compute detail aggregates' });
    }
  });

  // ─── PATCH /items/custom-categories/:id/category-group/:catlinedesc/market-price ─
  // Group-level market price editor: applies one market price/date to all items in the category group.
  router.patch('/items/custom-categories/:id/category-group/:catlinedesc/market-price', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });

      const catId = parseInt(req.params.id, 10);
      const catlinedesc = decodeURIComponent(req.params.catlinedesc).trim();
      const marketRefPrice = parseOptionalNumber(req.body?.market_ref_price);
      const marketPriceDate = parseOptionalDate(req.body?.market_price_date);

      if (!Number.isFinite(catId) || catId <= 0 || !catlinedesc) {
        return res.status(400).json({ success: false, error: 'Invalid category or category group' });
      }
      if (marketRefPrice === undefined || marketPriceDate === undefined) {
        return res.status(400).json({ success: false, error: 'Invalid market_ref_price or market_price_date' });
      }
      if (marketRefPrice != null && marketRefPrice < 0) {
        return res.status(400).json({ success: false, error: 'market_ref_price cannot be negative' });
      }

      const { rows: catRows } = await pool.query(
        'SELECT id FROM mes_item_categories WHERE id=$1 AND is_active=true',
        [catId]
      );
      if (!catRows.length) {
        return res.status(404).json({ success: false, error: 'Category not found' });
      }

      const { rows: groupRows } = await pool.query(
        `SELECT id
         FROM mes_item_category_groups
         WHERE category_id=$1
           AND catlinedesc=$2
           AND is_active=true
         LIMIT 1`,
        [catId, catlinedesc]
      );
      if (!groupRows.length) {
        return res.status(404).json({ success: false, error: 'Category group is not mapped to this category' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const { rows: rmItems } = await client.query(`
          SELECT
            LOWER(TRIM(mainitem)) AS item_key,
            MAX(TRIM(mainitem)) AS item_code,
            MAX(NULLIF(TRIM(maindescription), '')) AS item_name,
            MAX(NULLIF(TRIM(mainunit), '')) AS base_uom,
            MAX(NULLIF(TRIM(category), '')) AS item_type
          FROM fp_actualrmdata
          WHERE TRIM(catlinedesc) = $1
            AND COALESCE(TRIM(mainitem), '') <> ''
          GROUP BY LOWER(TRIM(mainitem))
        `, [catlinedesc]);

        if (!rmItems.length) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, error: 'No items found in category group' });
        }

        for (const row of rmItems) {
          const itemCode = cleanText(row.item_code, 120);
          if (!itemCode) continue;

          await client.query(`
            INSERT INTO mes_item_master (
              item_code,
              item_name,
              item_type,
              base_uom,
              oracle_cat_desc,
              market_ref_price,
              market_price_date,
              is_active,
              updated_at
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              true,
              NOW()
            )
            ON CONFLICT (item_code) DO UPDATE SET
              market_ref_price = EXCLUDED.market_ref_price,
              market_price_date = EXCLUDED.market_price_date,
              oracle_cat_desc = COALESCE(NULLIF(EXCLUDED.oracle_cat_desc, ''), mes_item_master.oracle_cat_desc),
              is_active = true,
              updated_at = NOW()
          `, [
            itemCode,
            cleanText(row.item_name, 255) || itemCode,
            cleanText(row.item_type, 50) || 'raw_material',
            cleanText(row.base_uom, 20) || 'KG',
            catlinedesc,
            marketRefPrice,
            marketPriceDate,
          ]);
        }

        await client.query('COMMIT');
        res.json({
          success: true,
          data: {
            updated: rmItems.length,
            catlinedesc,
            market_ref_price: marketRefPrice,
            market_price_date: marketPriceDate,
          },
        });
      } catch (txnErr) {
        await client.query('ROLLBACK');
        throw txnErr;
      } finally {
        client.release();
      }
    } catch (err) {
      logger.error('PATCH /items/custom-categories/:id/category-group/:catlinedesc/market-price error:', err);
      res.status(500).json({ success: false, error: 'Failed to update category group market price' });
    }
  });

  // ─── PATCH /items/custom-categories/:id/item-group/:itemgroup/market-price ─
  // Item-group-level market price editor: applies one market price/date to all items in the item group.
  router.patch('/items/custom-categories/:id/item-group/:itemgroup/market-price', authenticate, async (req, res) => {
    try {
      if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });

      const catId = parseInt(req.params.id, 10);
      const itemgroup = decodeURIComponent(req.params.itemgroup).trim();
      const catlinedesc = String(req.body?.catlinedesc || '').trim();
      const marketRefPrice = parseOptionalNumber(req.body?.market_ref_price);
      const marketPriceDate = parseOptionalDate(req.body?.market_price_date);

      if (!Number.isFinite(catId) || catId <= 0 || !itemgroup) {
        return res.status(400).json({ success: false, error: 'Invalid category or item group' });
      }
      if (marketRefPrice === undefined || marketPriceDate === undefined) {
        return res.status(400).json({ success: false, error: 'Invalid market_ref_price or market_price_date' });
      }
      if (marketRefPrice != null && marketRefPrice < 0) {
        return res.status(400).json({ success: false, error: 'market_ref_price cannot be negative' });
      }

      const { rows: catRows } = await pool.query(
        'SELECT id FROM mes_item_categories WHERE id=$1 AND is_active=true',
        [catId]
      );
      if (!catRows.length) {
        return res.status(404).json({ success: false, error: 'Category not found' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const conditions = ['TRIM(itemgroup) = $1', "COALESCE(TRIM(mainitem), '') <> ''"];
        const params = [itemgroup];
        let paramIdx = 2;

        if (catlinedesc) {
          params.push(catlinedesc);
          conditions.push(`TRIM(catlinedesc) = $${paramIdx}`);
          paramIdx++;
        }

        const { rows: rmItems } = await client.query(`
          SELECT
            LOWER(TRIM(mainitem)) AS item_key,
            MAX(TRIM(mainitem)) AS item_code,
            MAX(NULLIF(TRIM(maindescription), '')) AS item_name,
            MAX(NULLIF(TRIM(mainunit), '')) AS base_uom,
            MAX(NULLIF(TRIM(category), '')) AS item_type
          FROM fp_actualrmdata
          WHERE ${conditions.join(' AND ')}
          GROUP BY LOWER(TRIM(mainitem))
        `, params);

        if (!rmItems.length) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, error: 'No items found in item group' });
        }

        for (const row of rmItems) {
          const itemCode = cleanText(row.item_code, 120);
          if (!itemCode) continue;

          await client.query(`
            INSERT INTO mes_item_master (
              item_code,
              item_name,
              item_type,
              base_uom,
              oracle_cat_desc,
              market_ref_price,
              market_price_date,
              is_active,
              updated_at
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              true,
              NOW()
            )
            ON CONFLICT (item_code) DO UPDATE SET
              market_ref_price = EXCLUDED.market_ref_price,
              market_price_date = EXCLUDED.market_price_date,
              oracle_cat_desc = COALESCE(NULLIF(EXCLUDED.oracle_cat_desc, ''), mes_item_master.oracle_cat_desc),
              is_active = true,
              updated_at = NOW()
          `, [
            itemCode,
            cleanText(row.item_name, 255) || itemCode,
            cleanText(row.item_type, 50) || 'raw_material',
            cleanText(row.base_uom, 20) || 'KG',
            catlinedesc || null,
            marketRefPrice,
            marketPriceDate,
          ]);
        }

        await client.query('COMMIT');
        res.json({
          success: true,
          data: {
            updated: rmItems.length,
            itemgroup,
            catlinedesc: catlinedesc || null,
            market_ref_price: marketRefPrice,
            market_price_date: marketPriceDate,
          },
        });
      } catch (txnErr) {
        await client.query('ROLLBACK');
        throw txnErr;
      } finally {
        client.release();
      }
    } catch (err) {
      logger.error('PATCH /items/custom-categories/:id/item-group/:itemgroup/market-price error:', err);
      res.status(500).json({ success: false, error: 'Failed to update item group market price' });
    }
  });


  // ═══ CUSTOM GROUPS — create, assign items, delete ═══════════════════════════

  // GET /items/custom-categories/:id/assignable-items — individual items for custom group assignment
  router.get('/items/custom-categories/:id/assignable-items', authenticate, async (req, res) => {
    try {
      const catId = parseInt(req.params.id, 10);
      const currentGroupId = parseInt(req.query.current_group_id, 10);
      const parentCatlinedesc = cleanText(req.query.parent_catlinedesc, 255) || null;
      const search = cleanText(req.query.search, 120);
      const searchLike = search ? `%${search}%` : null;

      const cat = await pool.query('SELECT material_class FROM mes_item_categories WHERE id=$1 AND is_active=true', [catId]);
      if (!cat.rows.length) return res.status(404).json({ success: false, error: 'Category not found' });
      const matClass = cat.rows[0].material_class;

      // Get oracle_categories for this material_class
      const { rows: mappings } = await pool.query(
        'SELECT oracle_category FROM mes_category_mapping WHERE material_class=$1 AND is_active=true', [matClass]
      );
      const oracleCats = mappings.map(m => m.oracle_category);
      if (!oracleCats.length) return res.json({ success: true, data: [] });

      let currentGroupName = null;
      if (Number.isFinite(currentGroupId) && currentGroupId > 0) {
        const { rows: groupRows } = await pool.query(
          'SELECT catlinedesc FROM mes_item_category_groups WHERE id = $1 AND category_id = $2 AND is_active = true',
          [currentGroupId, catId]
        );
        if (!groupRows.length) {
          return res.status(404).json({ success: false, error: 'Custom group not found' });
        }
        currentGroupName = String(groupRows[0].catlinedesc || '').trim() || null;
      }

      // When parent_catlinedesc is provided: show all items from that Oracle group.
      // When not provided: legacy behaviour — show unmapped items across the whole category.
      let rows;
      if (parentCatlinedesc) {
        // ── Scoped mode: items from a specific Oracle parent group ──────────
        const searchFilter = searchLike
          ? `AND (
              COALESCE(r.mainitem, '') ILIKE $4
              OR COALESCE(r.maindescription, '') ILIKE $4
              OR COALESCE(r.itemgroup, '') ILIKE $4
            )`
          : '';
        const params = searchLike
          ? [catId, parentCatlinedesc, currentGroupName, searchLike, oracleCats]
          : [catId, parentCatlinedesc, currentGroupName, oracleCats];
        const oracleCatsParam = searchLike ? '$5' : '$4';

        ({ rows } = await pool.query(`
          WITH parent_items AS (
            SELECT DISTINCT LOWER(TRIM(r.mainitem)) AS item_key
            FROM fp_actualrmdata r
            WHERE UPPER(TRIM(r.category)) = ANY(${oracleCatsParam})
              AND TRIM(r.catlinedesc) = $2
              AND COALESCE(TRIM(r.mainitem), '') <> ''
          ),
          current_group_items AS (
            SELECT DISTINCT o.item_key
            FROM mes_item_group_overrides o
            WHERE o.category_id = $1
              AND ($3::text IS NOT NULL AND o.override_group_name = $3)
          ),
          eligible_item_keys AS (
            SELECT item_key FROM parent_items
            UNION
            SELECT item_key FROM current_group_items
          )
          SELECT
            LOWER(TRIM(r.mainitem)) AS item_key,
            MAX(r.mainitem) AS mainitem,
            MAX(r.maindescription) AS maindescription,
            MAX(NULLIF(TRIM(r.catlinedesc), '')) AS catlinedesc,
            MAX(TRIM(r.itemgroup)) AS itemgroup,
            COALESCE(SUM(CASE WHEN r.mainitemstock > 0 THEN r.mainitemstock ELSE 0 END), 0)::numeric AS stock_qty,
            MAX(o.override_group_name) AS current_override,
            BOOL_OR(o.override_group_name IS NOT NULL AND o.override_group_name = $3) AS is_selected,
            false AS is_unmapped
          FROM fp_actualrmdata r
          JOIN eligible_item_keys ek
            ON ek.item_key = LOWER(TRIM(r.mainitem))
          LEFT JOIN mes_item_group_overrides o
            ON o.category_id = $1
            AND o.item_key = LOWER(TRIM(r.mainitem))
          WHERE UPPER(TRIM(r.category)) = ANY(${oracleCatsParam})
            ${searchFilter}
          GROUP BY LOWER(TRIM(r.mainitem))
          HAVING BOOL_OR(o.override_group_name IS NULL OR o.override_group_name = $3)
          ORDER BY COALESCE(MAX(NULLIF(TRIM(r.catlinedesc), '')), 'Unmapped') ASC, MAX(r.mainitem) ASC
        `, params));
      } else {
        // ── Legacy mode: unmapped items across entire category ───────────────
        const searchFilter = searchLike
          ? `AND (
              COALESCE(r.mainitem, '') ILIKE $5
              OR COALESCE(r.maindescription, '') ILIKE $5
              OR COALESCE(r.catlinedesc, '') ILIKE $5
              OR COALESCE(r.itemgroup, '') ILIKE $5
            )`
          : '';
        const params = searchLike
          ? [catId, matClass, currentGroupName, oracleCats, searchLike]
          : [catId, matClass, currentGroupName, oracleCats];

        ({ rows } = await pool.query(`
          WITH selected_oracle_groups AS (
            SELECT LOWER(TRIM(g.catlinedesc)) AS catlinedesc_key
            FROM mes_item_category_groups g
            WHERE g.category_id = $1
              AND g.is_active = true
              AND g.is_custom = false
              AND COALESCE(TRIM(g.catlinedesc), '') <> ''
            GROUP BY LOWER(TRIM(g.catlinedesc))
          ),
          bucket_items AS (
            SELECT
              LOWER(TRIM(r.mainitem)) AS item_key,
              MIN(NULLIF(TRIM(r.catlinedesc), '')) AS catlinedesc,
              LOWER(TRIM(r.itemgroup)) AS appearance_key
            FROM fp_actualrmdata r
            JOIN selected_oracle_groups sg
              ON LOWER(TRIM(r.catlinedesc)) = sg.catlinedesc_key
            WHERE COALESCE(TRIM(r.mainitem), '') <> ''
              AND COALESCE(TRIM(r.itemgroup), '') <> ''
            GROUP BY LOWER(TRIM(r.mainitem)), LOWER(TRIM(r.itemgroup))
          ),
          unmapped_raw AS (
            SELECT bi.item_key
            FROM bucket_items bi
            LEFT JOIN LATERAL (
              SELECT
                mp.id,
                COALESCE(mp.mapped_material_keys, '{}'::text[]) AS mapped_material_keys
              FROM mes_material_profile_configs mp
              WHERE LOWER(TRIM(mp.material_class)) = LOWER(TRIM($2))
                AND LOWER(TRIM(mp.cat_desc)) = LOWER(TRIM(COALESCE(bi.catlinedesc, '')))
              ORDER BY
                CASE
                  WHEN LOWER(TRIM(mp.appearance)) = bi.appearance_key THEN 0
                  WHEN COALESCE(TRIM(mp.appearance), '') = '' THEN 1
                  ELSE 2
                END,
                mp.updated_at DESC NULLS LAST,
                mp.id DESC
              LIMIT 1
            ) cfg ON TRUE
            WHERE cfg.id IS NOT NULL
              AND NOT EXISTS (
                SELECT 1
                FROM UNNEST(cfg.mapped_material_keys) AS mk
                WHERE LOWER(TRIM(mk)) = bi.item_key
              )
          ),
          unmapped_items AS (
            SELECT DISTINCT item_key
            FROM unmapped_raw
          ),
          current_group_items AS (
            SELECT DISTINCT o.item_key
            FROM mes_item_group_overrides o
            WHERE o.category_id = $1
              AND ($3::text IS NOT NULL AND o.override_group_name = $3)
          ),
          eligible_item_keys AS (
            SELECT item_key FROM unmapped_items
            UNION
            SELECT item_key FROM current_group_items
          )
          SELECT
            LOWER(TRIM(r.mainitem)) AS item_key,
            MAX(r.mainitem) AS mainitem,
            MAX(r.maindescription) AS maindescription,
            MAX(NULLIF(TRIM(r.catlinedesc), '')) AS catlinedesc,
            MAX(TRIM(r.itemgroup)) AS itemgroup,
            COALESCE(SUM(CASE WHEN r.mainitemstock > 0 THEN r.mainitemstock ELSE 0 END), 0)::numeric AS stock_qty,
            MAX(o.override_group_name) AS current_override,
            BOOL_OR(o.override_group_name IS NOT NULL AND o.override_group_name = $3) AS is_selected,
            BOOL_OR(u.item_key IS NOT NULL) AS is_unmapped
          FROM fp_actualrmdata r
          JOIN eligible_item_keys ek
            ON ek.item_key = LOWER(TRIM(r.mainitem))
          LEFT JOIN unmapped_items u
            ON u.item_key = ek.item_key
          LEFT JOIN mes_item_group_overrides o
            ON o.category_id = $1
            AND o.item_key = LOWER(TRIM(r.mainitem))
          WHERE UPPER(TRIM(r.category)) = ANY($4)
            ${searchFilter}
          GROUP BY LOWER(TRIM(r.mainitem))
          HAVING BOOL_OR(o.override_group_name IS NULL OR o.override_group_name = $3)
          ORDER BY COALESCE(MAX(NULLIF(TRIM(r.catlinedesc), '')), 'Unmapped') ASC, MAX(r.mainitem) ASC
        `, params));
      }

      res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('GET /custom-categories/:id/assignable-items error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch assignable items' });
    }
  });

  // POST /items/custom-categories/:id/custom-group — create a custom group
  router.post('/items/custom-categories/:id/custom-group', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const catId = parseInt(req.params.id, 10);
      const groupName = String(req.body.group_name || '').trim();
      if (!Number.isFinite(catId) || catId <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid category id' });
      }
      if (!groupName || groupName.length > 120) {
        return res.status(400).json({ success: false, error: 'group_name is required (max 120 chars)' });
      }

      // Verify category exists
      const { rows: catRows } = await pool.query(
        'SELECT id FROM mes_item_categories WHERE id = $1 AND is_active = true', [catId]
      );
      if (!catRows.length) {
        return res.status(404).json({ success: false, error: 'Category not found' });
      }

      const parentDesc = String(req.body.parent_catlinedesc || '').trim() || null;

      // Validate parent Oracle group if provided
      if (parentDesc) {
        const { rows: parentRows } = await pool.query(
          'SELECT catlinedesc FROM mes_item_category_groups WHERE category_id=$1 AND catlinedesc=$2 AND is_custom=false AND is_active=true',
          [catId, parentDesc]
        );
        if (!parentRows.length) {
          return res.status(400).json({ success: false, error: 'Parent group not found' });
        }
      }

      // Check for duplicate name
      const { rows: existing } = await pool.query(
        `SELECT id FROM mes_item_category_groups
         WHERE category_id = $1 AND LOWER(TRIM(catlinedesc)) = LOWER($2) AND is_active = true`,
        [catId, groupName]
      );
      if (existing.length) {
        return res.status(409).json({ success: false, error: 'A group with this name already exists' });
      }

      // Insert custom group
      const { rows } = await pool.query(
        `INSERT INTO mes_item_category_groups (category_id, catlinedesc, is_custom, display_name, is_active)
         VALUES ($1, $2, true, $2, true)
         RETURNING id, category_id, catlinedesc, is_custom, display_name`,
        [catId, groupName]
      );

      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('POST /custom-categories/:id/custom-group error:', err);
      res.status(500).json({ success: false, error: 'Failed to create custom group' });
    }
  });

  // PATCH /items/custom-categories/:id/custom-group/:groupId — rename custom group
  router.patch('/items/custom-categories/:id/custom-group/:groupId', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const catId = parseInt(req.params.id, 10);
      const groupId = parseInt(req.params.groupId, 10);
      const newName = String(req.body.group_name || '').trim();

      if (!Number.isFinite(catId) || !Number.isFinite(groupId)) {
        return res.status(400).json({ success: false, error: 'Invalid ids' });
      }
      if (!newName || newName.length > 120) {
        return res.status(400).json({ success: false, error: 'group_name is required (max 120 chars)' });
      }

      const { rows: grpRows } = await pool.query(
        'SELECT catlinedesc FROM mes_item_category_groups WHERE id = $1 AND category_id = $2 AND is_custom = true AND is_active = true',
        [groupId, catId]
      );
      if (!grpRows.length) {
        return res.status(404).json({ success: false, error: 'Custom group not found' });
      }
      const oldName = grpRows[0].catlinedesc;

      if (oldName === newName) {
        return res.json({ success: true, data: { id: groupId, catlinedesc: newName, display_name: newName } });
      }

      const { rows: dup } = await pool.query(
        'SELECT id FROM mes_item_category_groups WHERE category_id = $1 AND LOWER(TRIM(catlinedesc)) = LOWER($2) AND is_active = true AND id <> $3',
        [catId, newName, groupId]
      );
      if (dup.length) {
        return res.status(409).json({ success: false, error: 'A group with this name already exists' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          'UPDATE mes_item_category_groups SET catlinedesc = $1, display_name = $1 WHERE id = $2',
          [newName, groupId]
        );

        await client.query(
          'UPDATE mes_item_group_overrides SET override_group_name = $1 WHERE category_id = $2 AND override_group_name = $3',
          [newName, catId, oldName]
        );

        await client.query('COMMIT');
        res.json({ success: true, data: { id: groupId, catlinedesc: newName, display_name: newName, old_name: oldName } });
      } catch (txnErr) {
        await client.query('ROLLBACK');
        throw txnErr;
      } finally {
        client.release();
      }
    } catch (err) {
      logger.error('PATCH /custom-categories/:id/custom-group/:groupId error:', err);
      res.status(500).json({ success: false, error: 'Failed to rename custom group' });
    }
  });

  // GET /items/custom-categories/:id/custom-group/:groupId/items — list items in custom group
  router.get('/items/custom-categories/:id/custom-group/:groupId/items', authenticate, async (req, res) => {
    try {
      const catId = parseInt(req.params.id, 10);
      const groupId = parseInt(req.params.groupId, 10);
      if (!Number.isFinite(catId) || !Number.isFinite(groupId)) {
        return res.status(400).json({ success: false, error: 'Invalid ids' });
      }

      // Get the group to know the override_group_name
      const { rows: grpRows } = await pool.query(
        'SELECT catlinedesc FROM mes_item_category_groups WHERE id = $1 AND category_id = $2 AND is_custom = true AND is_active = true',
        [groupId, catId]
      );
      if (!grpRows.length) {
        return res.status(404).json({ success: false, error: 'Custom group not found' });
      }

      const groupName = grpRows[0].catlinedesc;

      const { rows } = await pool.query(
        `SELECT o.id, o.item_key, o.original_catlinedesc, o.created_at
         FROM mes_item_group_overrides o
         WHERE o.category_id = $1 AND o.override_group_name = $2
         ORDER BY o.item_key ASC`,
        [catId, groupName]
      );

      res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('GET /custom-categories/:id/custom-group/:groupId/items error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch custom group items' });
    }
  });

  // GET /items/custom-categories/:id/custom-group/:groupId/formulation
  router.get('/items/custom-categories/:id/custom-group/:groupId/formulation', authenticate, async (req, res) => {
    try {
      const catId = parseInt(req.params.id, 10);
      const groupId = parseInt(req.params.groupId, 10);
      if (!Number.isFinite(catId) || !Number.isFinite(groupId)) {
        return res.status(400).json({ success: false, error: 'Invalid ids' });
      }

      const result = await getAdhesiveFormulationData(catId, groupId);
      if (result.error) {
        return res.status(result.status || 400).json({ success: false, error: result.error });
      }

      return res.json({ success: true, data: result.data });
    } catch (err) {
      logger.error('GET /custom-categories/:id/custom-group/:groupId/formulation error:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch adhesive formulation' });
    }
  });

  // GET /items/custom-categories/:id/custom-group/:groupId/formulation/candidates
  router.get('/items/custom-categories/:id/custom-group/:groupId/formulation/candidates', authenticate, async (req, res) => {
    try {
      const catId = parseInt(req.params.id, 10);
      const groupId = parseInt(req.params.groupId, 10);
      const source = normalizeMaterialKey(req.query.source || 'group');
      const search = cleanText(req.query.search, 120);
      const searchLike = search ? `%${search}%` : null;

      if (!Number.isFinite(catId) || !Number.isFinite(groupId)) {
        return res.status(400).json({ success: false, error: 'Invalid ids' });
      }
      if (!['group', 'all'].includes(source)) {
        return res.status(400).json({ success: false, error: 'source must be "group" or "all"' });
      }

      const ctxResult = await getAdhesiveFormulationContext(catId, groupId);
      if (ctxResult.error) {
        return res.status(ctxResult.status || 400).json({ success: false, error: ctxResult.error });
      }
      const ctx = ctxResult.data;

      const existingRows = await pool.query(
        'SELECT item_key FROM mes_adhesive_formulation_components WHERE group_id = $1',
        [groupId]
      ).catch((err) => {
        if (err.code === '42P01') return { rows: [] };
        throw err;
      });

      const existingKeys = new Set((existingRows.rows || []).map((row) => normalizeMaterialKey(row.item_key)).filter(Boolean));

      let rows = [];

      if (source === 'group') {
        const params = [catId, ctx.catlinedesc, searchLike];
        const { rows: groupRows } = await pool.query(`
          SELECT
            o.item_key,
            MAX(r.mainitem) AS mainitem,
            MAX(NULLIF(TRIM(r.maindescription), '')) AS maindescription,
            MAX(NULLIF(TRIM(r.catlinedesc), '')) AS catlinedesc,
            MAX(NULLIF(TRIM(r.category), '')) AS category,
            MAX(NULLIF(TRIM(r.itemgroup), '')) AS itemgroup,
            COALESCE(SUM(CASE WHEN r.mainitemstock > 0 THEN r.mainitemstock ELSE 0 END), 0)::numeric AS stock_qty,
            COALESCE(SUM(CASE WHEN r.mainitemstock > 0 THEN r.mainitemstock * r.maincost ELSE 0 END), 0)::numeric AS stock_val,
            COALESCE(SUM(CASE WHEN r.pendingorderqty > 0 THEN r.pendingorderqty ELSE 0 END), 0)::numeric AS order_qty,
            COALESCE(SUM(CASE WHEN r.pendingorderqty > 0 THEN r.pendingorderqty * r.purchaseprice ELSE 0 END), 0)::numeric AS order_val
          FROM mes_item_group_overrides o
          LEFT JOIN fp_actualrmdata r ON LOWER(TRIM(r.mainitem)) = o.item_key
          WHERE o.category_id = $1
            AND o.override_group_name = $2
            AND (
              $3::text IS NULL OR
              o.item_key ILIKE $3 OR
              COALESCE(r.mainitem, '') ILIKE $3 OR
              COALESCE(r.maindescription, '') ILIKE $3 OR
              COALESCE(r.catlinedesc, '') ILIKE $3 OR
              COALESCE(r.category, '') ILIKE $3 OR
              COALESCE(r.itemgroup, '') ILIKE $3
            )
          GROUP BY o.item_key
          ORDER BY MAX(r.mainitem) ASC NULLS LAST, o.item_key ASC
          LIMIT 300
        `, params);
        rows = groupRows;
      } else {
        const cachedRows = readAdhesiveCandidateAllCache(search || '');
        if (cachedRows) {
          rows = cachedRows;
        } else {
          const { rows: allRows } = await pool.query(`
            SELECT
              LOWER(TRIM(mainitem)) AS item_key,
              MAX(mainitem) AS mainitem,
              MAX(NULLIF(TRIM(maindescription), '')) AS maindescription,
              MAX(NULLIF(TRIM(catlinedesc), '')) AS catlinedesc,
              MAX(NULLIF(TRIM(category), '')) AS category,
              MAX(NULLIF(TRIM(itemgroup), '')) AS itemgroup,
              COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END), 0)::numeric AS stock_qty,
              COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END), 0)::numeric AS stock_val,
              COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END), 0)::numeric AS order_qty,
              COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END), 0)::numeric AS order_val
            FROM fp_actualrmdata
            WHERE COALESCE(TRIM(mainitem), '') <> ''
              AND (
                $1::text IS NULL OR
                COALESCE(mainitem, '') ILIKE $1 OR
                COALESCE(maindescription, '') ILIKE $1 OR
                COALESCE(catlinedesc, '') ILIKE $1 OR
                COALESCE(category, '') ILIKE $1 OR
                COALESCE(itemgroup, '') ILIKE $1
              )
            GROUP BY LOWER(TRIM(mainitem))
            ORDER BY MAX(mainitem) ASC
            LIMIT 300
          `, [searchLike]);
          rows = allRows;
          writeAdhesiveCandidateAllCache(search || '', rows);
        }
      }

      const filteredRows = rows.filter((row) => !existingKeys.has(normalizeMaterialKey(row.item_key)));
      const itemKeys = filteredRows.map((row) => normalizeMaterialKey(row.item_key)).filter(Boolean);

      const [solidPctMap, masterMap] = await Promise.all([
        loadAdhesiveSolidPctMap(itemKeys),
        loadAdhesiveMasterMap(itemKeys),
      ]);

      const candidates = filteredRows.map((row) => {
        const itemKey = normalizeMaterialKey(row.item_key);
        const stockQty = Number(row.stock_qty) || 0;
        const stockVal = Number(row.stock_val) || 0;
        const orderQty = Number(row.order_qty) || 0;
        const orderVal = Number(row.order_val) || 0;
        const stockPrice = stockQty > 0 ? stockVal / stockQty : null;
        const onOrderPrice = orderQty > 0 ? orderVal / orderQty : null;
        const totalQty = stockQty + orderQty;
        const avgPrice = totalQty > 0 ? (stockVal + orderVal) / totalQty : null;
        const master = masterMap[itemKey] || {};

        const defaultPriceResolution = resolveAdhesiveUnitPrice({
          overridePrice: null,
          rmInfo: {
            avg_price_wa: avgPrice,
            on_order_price_wa: onOrderPrice,
            stock_price_wa: stockPrice,
          },
          masterInfo: master,
        });

        const categoryText = String(row.category || '').toLowerCase();
        const roleSuggestion = categoryText.includes('chem')
          ? 'solvent'
          : (categoryText.includes('adh') ? 'resin' : 'other');

        return {
          item_key: itemKey,
          mainitem: row.mainitem || itemKey,
          maindescription: row.maindescription || null,
          catlinedesc: row.catlinedesc || null,
          category: row.category || master.oracle_category || null,
          itemgroup: row.itemgroup || null,
          stock_price: roundToDigits(stockPrice, 4),
          on_order_price: roundToDigits(onOrderPrice, 4),
          avg_price: roundToDigits(avgPrice, 4),
          market_ref_price: toFiniteNumber(master.market_ref_price),
          default_price: toFiniteNumber(defaultPriceResolution.value),
          default_price_source: defaultPriceResolution.source,
          tds_solids_pct: toFiniteNumber(solidPctMap[itemKey]),
          default_component_role: roleSuggestion,
        };
      });

      return res.json({ success: true, data: candidates });
    } catch (err) {
      logger.error('GET /custom-categories/:id/custom-group/:groupId/formulation/candidates error:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch formulation candidates' });
    }
  });

  // PUT /items/custom-categories/:id/custom-group/:groupId/formulation
  router.put('/items/custom-categories/:id/custom-group/:groupId/formulation', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const catId = parseInt(req.params.id, 10);
      const groupId = parseInt(req.params.groupId, 10);
      const rawComponents = Array.isArray(req.body?.components) ? req.body.components : null;

      if (!Number.isFinite(catId) || !Number.isFinite(groupId)) {
        return res.status(400).json({ success: false, error: 'Invalid ids' });
      }
      if (!Array.isArray(rawComponents)) {
        return res.status(400).json({ success: false, error: 'components must be an array' });
      }

      const ctxResult = await getAdhesiveFormulationContext(catId, groupId);
      if (ctxResult.error) {
        return res.status(ctxResult.status || 400).json({ success: false, error: ctxResult.error });
      }

      const deduped = [];
      const seen = new Set();

      for (let i = 0; i < rawComponents.length; i += 1) {
        const component = rawComponents[i];
        if (!isPlainObject(component)) continue;

        const itemKey = normalizeMaterialKey(component.item_key);
        if (!itemKey) continue;
        if (seen.has(itemKey)) continue;
        seen.add(itemKey);

        const role = normalizeMaterialKey(component.component_role || 'other') || 'other';
        if (!ADHESIVE_COMPONENT_ROLES.has(role)) {
          return res.status(400).json({ success: false, error: `Invalid component_role for item ${itemKey}` });
        }

        const parts = parseOptionalNumber(component.parts);
        if (parts === undefined || parts == null || parts < 0) {
          return res.status(400).json({ success: false, error: `Invalid parts for item ${itemKey}` });
        }

        const solidsPct = parseOptionalNumber(component.solids_pct);
        if (solidsPct === undefined || (solidsPct != null && (solidsPct < 0 || solidsPct > 100))) {
          return res.status(400).json({ success: false, error: `Invalid solids_pct for item ${itemKey}` });
        }

        const unitPriceOverride = parseOptionalNumber(component.unit_price_override);
        if (unitPriceOverride === undefined || (unitPriceOverride != null && unitPriceOverride < 0)) {
          return res.status(400).json({ success: false, error: `Invalid unit_price_override for item ${itemKey}` });
        }

        const sortOrder = parseOptionalInteger(component.sort_order);
        const notes = cleanText(component.notes, 500);

        deduped.push({
          item_key: itemKey,
          component_role: role,
          parts,
          solids_pct: solidsPct,
          unit_price_override: unitPriceOverride,
          sort_order: sortOrder == null ? i : sortOrder,
          notes,
        });
      }

      const itemKeys = deduped.map((row) => row.item_key);
      if (itemKeys.length) {
        const { rows: existingRmRows } = await pool.query(
          `SELECT DISTINCT LOWER(TRIM(mainitem)) AS item_key
           FROM fp_actualrmdata
           WHERE LOWER(TRIM(mainitem)) = ANY($1)`,
          [itemKeys]
        );
        const existingRmKeys = new Set(existingRmRows.map((row) => normalizeMaterialKey(row.item_key)).filter(Boolean));
        const missing = itemKeys.filter((key) => !existingRmKeys.has(key));
        if (missing.length) {
          return res.status(400).json({
            success: false,
            error: `Unknown Oracle item(s): ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ' ...' : ''}`,
          });
        }
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Keep formulation exactly in sync with submitted component rows.
        await client.query('DELETE FROM mes_adhesive_formulation_components WHERE group_id = $1', [groupId]);

        for (const row of deduped) {
          await client.query(`
            INSERT INTO mes_adhesive_formulation_components (
              group_id,
              item_key,
              component_role,
              parts,
              solids_pct,
              unit_price_override,
              sort_order,
              notes,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (group_id, item_key)
            DO UPDATE SET
              component_role = EXCLUDED.component_role,
              parts = EXCLUDED.parts,
              solids_pct = EXCLUDED.solids_pct,
              unit_price_override = EXCLUDED.unit_price_override,
              sort_order = EXCLUDED.sort_order,
              notes = EXCLUDED.notes,
              updated_at = NOW()
          `, [
            groupId,
            row.item_key,
            row.component_role,
            row.parts,
            row.solids_pct,
            row.unit_price_override,
            row.sort_order,
            row.notes,
          ]);
        }

        await client.query('COMMIT');
      } catch (txnErr) {
        await client.query('ROLLBACK');
        throw txnErr;
      } finally {
        client.release();
      }

      const result = await getAdhesiveFormulationData(catId, groupId);
      if (result.error) {
        return res.status(result.status || 400).json({ success: false, error: result.error });
      }

      return res.json({ success: true, data: result.data });
    } catch (err) {
      logger.error('PUT /custom-categories/:id/custom-group/:groupId/formulation error:', err);
      return res.status(500).json({ success: false, error: 'Failed to save adhesive formulation' });
    }
  });

  // DELETE /items/custom-categories/:id/custom-group/:groupId/formulation/component/:itemKey
  router.delete('/items/custom-categories/:id/custom-group/:groupId/formulation/component/:itemKey', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const catId = parseInt(req.params.id, 10);
      const groupId = parseInt(req.params.groupId, 10);
      const itemKey = normalizeMaterialKey(req.params.itemKey);

      if (!Number.isFinite(catId) || !Number.isFinite(groupId) || !itemKey) {
        return res.status(400).json({ success: false, error: 'Invalid ids' });
      }

      const ctxResult = await getAdhesiveFormulationContext(catId, groupId);
      if (ctxResult.error) {
        return res.status(ctxResult.status || 400).json({ success: false, error: ctxResult.error });
      }

      try {
        await pool.query(
          'DELETE FROM mes_adhesive_formulation_components WHERE group_id = $1 AND item_key = $2',
          [groupId, itemKey]
        );
      } catch (err) {
        if (err.code !== '42P01') throw err;
      }

      const result = await getAdhesiveFormulationData(catId, groupId);
      if (result.error) {
        return res.status(result.status || 400).json({ success: false, error: result.error });
      }

      return res.json({ success: true, data: result.data });
    } catch (err) {
      logger.error('DELETE /custom-categories/:id/custom-group/:groupId/formulation/component/:itemKey error:', err);
      return res.status(500).json({ success: false, error: 'Failed to remove adhesive formulation component' });
    }
  });

  // PUT /items/custom-categories/:id/custom-group/:groupId/items — assign items to custom group
  router.put('/items/custom-categories/:id/custom-group/:groupId/items', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const catId = parseInt(req.params.id, 10);
      const groupId = parseInt(req.params.groupId, 10);
      const itemKeys = normalizeMaterialKeyArray(req.body.item_keys);

      if (!Number.isFinite(catId) || !Number.isFinite(groupId)) {
        return res.status(400).json({ success: false, error: 'Invalid ids' });
      }

      const { rows: grpRows } = await pool.query(
        'SELECT catlinedesc FROM mes_item_category_groups WHERE id = $1 AND category_id = $2 AND is_custom = true AND is_active = true',
        [groupId, catId]
      );
      if (!grpRows.length) {
        return res.status(404).json({ success: false, error: 'Custom group not found' });
      }

      const groupName = grpRows[0].catlinedesc;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Remove existing assignments for this group
        await client.query(
          'DELETE FROM mes_item_group_overrides WHERE category_id = $1 AND override_group_name = $2',
          [catId, groupName]
        );

        // Insert new assignments with auto-resolved original_catlinedesc
        if (itemKeys.length > 0) {
          await client.query(
            `INSERT INTO mes_item_group_overrides (category_id, override_group_name, item_key, original_catlinedesc)
             SELECT $1, $2, u.key, MAX(TRIM(r.catlinedesc))
             FROM unnest($3::text[]) AS u(key)
             LEFT JOIN fp_actualrmdata r ON LOWER(TRIM(r.mainitem)) = u.key
             GROUP BY u.key
             ON CONFLICT (category_id, item_key) DO UPDATE SET
               override_group_name = EXCLUDED.override_group_name,
               original_catlinedesc = COALESCE(EXCLUDED.original_catlinedesc, mes_item_group_overrides.original_catlinedesc),
               updated_at = NOW()`,
            [catId, groupName, itemKeys]
          );
        }

        await client.query('COMMIT');

        res.json({ success: true, data: { group_name: groupName, assigned_count: itemKeys.length } });
      } catch (txnErr) {
        await client.query('ROLLBACK');
        throw txnErr;
      } finally {
        client.release();
      }
    } catch (err) {
      logger.error('PUT /custom-categories/:id/custom-group/:groupId/items error:', err);
      res.status(500).json({ success: false, error: 'Failed to assign items to custom group' });
    }
  });

  // DELETE /items/custom-categories/:id/custom-group/:groupId — delete custom group
  router.delete('/items/custom-categories/:id/custom-group/:groupId', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const catId = parseInt(req.params.id, 10);
      const groupId = parseInt(req.params.groupId, 10);

      if (!Number.isFinite(catId) || !Number.isFinite(groupId)) {
        return res.status(400).json({ success: false, error: 'Invalid ids' });
      }

      const { rows: grpRows } = await pool.query(
        'SELECT catlinedesc FROM mes_item_category_groups WHERE id = $1 AND category_id = $2 AND is_custom = true AND is_active = true',
        [groupId, catId]
      );
      if (!grpRows.length) {
        return res.status(404).json({ success: false, error: 'Custom group not found' });
      }

      const groupName = grpRows[0].catlinedesc;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Remove all item overrides for this group
        await client.query(
          'DELETE FROM mes_item_group_overrides WHERE category_id = $1 AND override_group_name = $2',
          [catId, groupName]
        );

        // Remove adhesive formulation rows linked to this group (group is soft-deleted, so no FK cascade).
        await client.query(
          'DELETE FROM mes_adhesive_formulation_components WHERE group_id = $1',
          [groupId]
        ).catch((err) => {
          if (err.code !== '42P01') throw err;
        });

        // Soft-delete the group
        await client.query(
          'UPDATE mes_item_category_groups SET is_active = false WHERE id = $1',
          [groupId]
        );

        await client.query('COMMIT');
        res.json({ success: true, data: { deleted_group: groupName } });
      } catch (txnErr) {
        await client.query('ROLLBACK');
        throw txnErr;
      } finally {
        client.release();
      }
    } catch (err) {
      logger.error('DELETE /custom-categories/:id/custom-group/:groupId error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete custom group' });
    }
  });


  // ─── GET /items/:id — Single item detail ──────────────────────────────────
  router.get('/items/:id', authenticate, async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM mes_item_master WHERE id = $1', [req.params.id]);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Item not found' });
      res.json({ success: true, data: stripLegacyPricingFields(rows[0]) });
    } catch (err) {
      logger.error('GET /items/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch item' });
    }
  });

  // ─── POST /items — Create (admin/manager only) ───────────────────────────
  router.post('/items', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const {
        item_code, item_name, item_type, product_group, base_uom,
        density_g_cm3, micron_thickness, width_mm, solid_pct,
        market_ref_price, market_price_date,
        mrp_type, reorder_point, safety_stock_kg, procurement_type, planned_lead_time_days,
        lot_size_rule, fixed_lot_size_kg, assembly_scrap_pct,
        subcategory, grade_code, waste_pct,
        mfi, cof, sealing_temp_min, sealing_temp_max,
        oracle_category, oracle_cat_desc, oracle_type,
        category, stock_price, on_order_price
      } = req.body;

      if (!item_code || !item_name || !item_type) {
        return res.status(400).json({ success: false, error: 'item_code, item_name, and item_type are required' });
      }

      const { rows } = await pool.query(`
        INSERT INTO mes_item_master (
          item_code, item_name, item_type, product_group, base_uom,
          density_g_cm3, micron_thickness, width_mm, solid_pct,
          market_ref_price, market_price_date,
          mrp_type, reorder_point, safety_stock_kg, procurement_type, planned_lead_time_days,
          lot_size_rule, fixed_lot_size_kg, assembly_scrap_pct,
          subcategory, grade_code, waste_pct,
          mfi, cof, sealing_temp_min, sealing_temp_max,
          oracle_category, oracle_cat_desc, oracle_type,
          category, stock_price, on_order_price,
          created_by
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11,
          $12, $13, $14, $15, $16,
          $17, $18, $19,
          $20, $21, $22,
          $23, $24, $25, $26,
          $27, $28, $29,
          $30, $31, $32,
          $33
        ) RETURNING *
      `, [
        item_code, item_name, item_type, product_group, base_uom || 'KG',
        density_g_cm3, micron_thickness, width_mm, solid_pct,
        market_ref_price, market_price_date,
        mrp_type || 'PD', reorder_point, safety_stock_kg, procurement_type || 'EXTERNAL', planned_lead_time_days,
        lot_size_rule || 'EX', fixed_lot_size_kg, assembly_scrap_pct,
        subcategory, grade_code, waste_pct ?? 3.0,
        mfi, cof, sealing_temp_min, sealing_temp_max,
        oracle_category, oracle_cat_desc, oracle_type,
        category ?? null, stock_price ?? null, on_order_price ?? null,
        req.user.id
      ]);

      res.status(201).json({ success: true, data: stripLegacyPricingFields(rows[0]) });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ success: false, error: 'Item code already exists' });
      }
      logger.error('POST /items error:', err);
      res.status(500).json({ success: false, error: 'Failed to create item' });
    }
  });

  // ─── PUT /items/:id — Full update ────────────────────────────────────────
  router.put('/items/:id', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const {
        item_name, item_type, product_group, base_uom,
        density_g_cm3, micron_thickness, width_mm, solid_pct,
        market_ref_price, market_price_date,
        mrp_type, reorder_point, safety_stock_kg, procurement_type, planned_lead_time_days,
        lot_size_rule, fixed_lot_size_kg, assembly_scrap_pct,
        subcategory, grade_code, waste_pct,
        mfi, cof, sealing_temp_min, sealing_temp_max,
        oracle_category, oracle_cat_desc, oracle_type,
        category, stock_price, on_order_price
      } = req.body;

      const { rows } = await pool.query(`
        UPDATE mes_item_master SET
          item_name = $1, item_type = $2, product_group = $3, base_uom = $4,
          density_g_cm3 = $5, micron_thickness = $6, width_mm = $7, solid_pct = $8,
          market_ref_price = $9, market_price_date = $10,
          mrp_type = $11, reorder_point = $12, safety_stock_kg = $13, procurement_type = $14,
          planned_lead_time_days = $15, lot_size_rule = $16, fixed_lot_size_kg = $17, assembly_scrap_pct = $18,
          subcategory = $19, grade_code = $20, waste_pct = $21,
          mfi = $22, cof = $23, sealing_temp_min = $24, sealing_temp_max = $25,
          oracle_category = $26, oracle_cat_desc = $27, oracle_type = $28,
          category = $29, stock_price = $30, on_order_price = $31,
          updated_at = NOW()
        WHERE id = $32
        RETURNING *
      `, [
        item_name, item_type, product_group, base_uom,
        density_g_cm3, micron_thickness, width_mm, solid_pct,
        market_ref_price, market_price_date,
        mrp_type, reorder_point, safety_stock_kg, procurement_type,
        planned_lead_time_days, lot_size_rule, fixed_lot_size_kg, assembly_scrap_pct,
        subcategory, grade_code, waste_pct,
        mfi, cof, sealing_temp_min, sealing_temp_max,
        oracle_category, oracle_cat_desc, oracle_type,
        category ?? null, stock_price ?? null, on_order_price ?? null,
        req.params.id
      ]);

      if (!rows.length) return res.status(404).json({ success: false, error: 'Item not found' });
      res.json({ success: true, data: stripLegacyPricingFields(rows[0]) });
    } catch (err) {
      logger.error('PUT /items/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to update item' });
    }
  });

  // ─── PATCH /items/:id/custom-fields — targeted partial update for drawer ─
  router.patch('/items/:id/custom-fields', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });

    try {
      const id = parseOptionalInteger(req.params.id);
      if (id === undefined || id == null) {
        return res.status(400).json({ success: false, error: 'Invalid item id' });
      }

      const body = isPlainObject(req.body) ? req.body : {};
      const sets = [];
      const vals = [];
      let p = 1;

      const numericFields = [
        'market_ref_price',
        'reorder_point',
        'safety_stock_kg',
        'fixed_lot_size_kg',
        'assembly_scrap_pct',
        'waste_pct',
      ];

      for (const field of numericFields) {
        if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
        const parsed = parseOptionalNumber(body[field]);
        if (parsed === undefined) {
          return res.status(400).json({ success: false, error: `${field} must be a valid number` });
        }
        sets.push(`${field} = $${p++}`);
        vals.push(parsed);
      }

      if (Object.prototype.hasOwnProperty.call(body, 'market_price_date')) {
        const parsedDate = parseOptionalDate(body.market_price_date);
        if (parsedDate === undefined) {
          return res.status(400).json({ success: false, error: 'market_price_date must be a valid date' });
        }
        sets.push(`market_price_date = $${p++}`);
        vals.push(parsedDate);
      }

      if (Object.prototype.hasOwnProperty.call(body, 'planned_lead_time_days')) {
        const parsedLeadTime = parseOptionalInteger(body.planned_lead_time_days);
        if (parsedLeadTime === undefined || (parsedLeadTime != null && parsedLeadTime < 0)) {
          return res.status(400).json({
            success: false,
            error: 'planned_lead_time_days must be a non-negative integer',
          });
        }
        sets.push(`planned_lead_time_days = $${p++}`);
        vals.push(parsedLeadTime);
      }

      if (Object.prototype.hasOwnProperty.call(body, 'mrp_type')) {
        const mrpType = cleanText(body.mrp_type, 20);
        const normalizedMrpType = mrpType ? mrpType.toUpperCase() : null;
        if (normalizedMrpType && !MRP_TYPE_KEYS.includes(normalizedMrpType)) {
          return res.status(400).json({
            success: false,
            error: `mrp_type must be one of: ${MRP_TYPE_KEYS.join(', ')}`,
          });
        }
        sets.push(`mrp_type = $${p++}`);
        vals.push(normalizedMrpType);
      }

      const textFieldDefs = [
        { field: 'procurement_type', maxLength: 40, transform: (v) => v?.toUpperCase() || null },
        { field: 'lot_size_rule', maxLength: 10, transform: (v) => v?.toUpperCase() || null },
      ];

      for (const def of textFieldDefs) {
        if (!Object.prototype.hasOwnProperty.call(body, def.field)) continue;
        const cleaned = cleanText(body[def.field], def.maxLength);
        sets.push(`${def.field} = $${p++}`);
        vals.push(def.transform(cleaned));
      }

      if (!sets.length) {
        return res.status(400).json({ success: false, error: 'No updatable fields provided' });
      }

      vals.push(id);
      const { rows } = await pool.query(`
        UPDATE mes_item_master
        SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${p} AND is_active = true
        RETURNING *
      `, vals);

      if (!rows.length) return res.status(404).json({ success: false, error: 'Item not found' });
      return res.json({ success: true, data: stripLegacyPricingFields(rows[0]) });
    } catch (err) {
      logger.error('PATCH /items/:id/custom-fields error:', err);
      return res.status(500).json({ success: false, error: 'Failed to update item fields' });
    }
  });

  // ─── PATCH /items/:id/prices — Update pricing only (with optimistic lock) ─
  router.patch('/items/:id/prices', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const { stock_price, on_order_price, market_ref_price, market_price_date, updated_at } = req.body;

      // A14: Optimistic locking — if updated_at provided, check it matches
      let lockClause = '';
      const params = [stock_price, on_order_price, market_ref_price, market_price_date, req.params.id];
      if (updated_at) {
        lockClause = ' AND updated_at = $6';
        params.push(updated_at);
      }

      const { rows } = await pool.query(`
        UPDATE mes_item_master SET
          stock_price = COALESCE($1, stock_price),
          on_order_price = COALESCE($2, on_order_price),
          market_ref_price = COALESCE($3, market_ref_price),
          market_price_date = COALESCE($4, market_price_date),
          updated_at = NOW()
        WHERE id = $5 ${lockClause}
        RETURNING *
      `, params);

      if (!rows.length) {
        if (updated_at) return res.status(409).json({ success: false, error: 'Record modified by another user. Please refresh.' });
        return res.status(404).json({ success: false, error: 'Item not found' });
      }
      res.json({ success: true, data: stripLegacyPricingFields(rows[0]) });
    } catch (err) {
      logger.error('PATCH /items/:id/prices error:', err);
      res.status(500).json({ success: false, error: 'Failed to update prices' });
    }
  });

  // ─── PATCH /items/mrp/bulk — Batch MRP parameter update ─────────────────
  router.patch('/items/mrp/bulk', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });

    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'items array is required' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        let updated = 0;
        const skipped = [];
        const errors = [];

        for (const item of items) {
          const itemCode = cleanText(item?.item_code, 120);
          if (!itemCode) {
            errors.push({ item_code: item?.item_code || null, error: 'Missing item_code' });
            continue;
          }

          const normalizedMrpFields = {};

          if (Object.prototype.hasOwnProperty.call(item, 'mrp_type')) {
            const mrpType = cleanText(item.mrp_type, 20);
            const normalizedMrpType = mrpType ? mrpType.toUpperCase() : null;
            if (normalizedMrpType && !MRP_TYPE_KEYS.includes(normalizedMrpType)) {
              errors.push({ item_code: itemCode, error: `Invalid mrp_type: ${item.mrp_type}` });
              continue;
            }
            normalizedMrpFields.mrp_type = normalizedMrpType;
          }

          const numericFields = [
            'reorder_point',
            'safety_stock_kg',
            'fixed_lot_size_kg',
            'assembly_scrap_pct',
          ];

          let numericInvalid = false;
          for (const field of numericFields) {
            if (!Object.prototype.hasOwnProperty.call(item, field)) continue;
            const parsed = parseOptionalNumber(item[field]);
            if (parsed === undefined) {
              errors.push({ item_code: itemCode, error: `${field} must be a valid number` });
              numericInvalid = true;
              break;
            }
            normalizedMrpFields[field] = parsed;
          }
          if (numericInvalid) continue;

          if (Object.prototype.hasOwnProperty.call(item, 'planned_lead_time_days')) {
            const parsedLeadTime = parseOptionalInteger(item.planned_lead_time_days);
            if (parsedLeadTime === undefined || (parsedLeadTime != null && parsedLeadTime < 0)) {
              errors.push({
                item_code: itemCode,
                error: 'planned_lead_time_days must be a non-negative integer',
              });
              continue;
            }
            normalizedMrpFields.planned_lead_time_days = parsedLeadTime;
          }

          if (Object.prototype.hasOwnProperty.call(item, 'procurement_type')) {
            const procurementType = cleanText(item.procurement_type, 40);
            normalizedMrpFields.procurement_type = procurementType ? procurementType.toUpperCase() : null;
          }

          if (Object.prototype.hasOwnProperty.call(item, 'lot_size_rule')) {
            const lotSizeRule = cleanText(item.lot_size_rule, 10);
            normalizedMrpFields.lot_size_rule = lotSizeRule ? lotSizeRule.toUpperCase() : null;
          }

          const mrpFieldEntries = Object.entries(normalizedMrpFields);
          if (!mrpFieldEntries.length) {
            skipped.push(itemCode);
            continue;
          }

          const setParts = [];
          const values = [];
          let idx = 1;
          mrpFieldEntries.forEach(([field, value]) => {
            setParts.push(`${field} = $${idx++}`);
            values.push(value);
          });

          values.push(itemCode);
          const updateSql = `
            UPDATE mes_item_master
            SET ${setParts.join(', ')}, updated_at = NOW()
            WHERE item_code = $${idx} AND is_active = true
          `;

          const result = await client.query(updateSql, values);
          if (result.rowCount > 0) {
            updated += result.rowCount;
          } else {
            const itemName = cleanText(item.item_name, 255) || itemCode;
            const itemType = cleanText(item.item_type, 50) || 'raw_material';
            const baseUom = cleanText(item.base_uom, 20) || 'KG';
            const oracleCatDesc = cleanText(item.oracle_cat_desc, 120);

            const insertColumns = ['item_code', 'item_name', 'item_type', 'base_uom', 'is_active', 'created_by'];
            const insertValues = [itemCode, itemName, itemType, baseUom, true, req.user.id];

            if (oracleCatDesc) {
              insertColumns.push('oracle_cat_desc');
              insertValues.push(oracleCatDesc);
            }

            mrpFieldEntries.forEach(([field, value]) => {
              insertColumns.push(field);
              insertValues.push(value);
            });

            const placeholders = insertColumns.map((_, i) => `$${i + 1}`).join(', ');
            const conflictUpdateParts = mrpFieldEntries.map(([field]) => `${field} = EXCLUDED.${field}`);
            const insertSql = `
              INSERT INTO mes_item_master (${insertColumns.join(', ')})
              VALUES (${placeholders})
              ON CONFLICT (item_code) DO UPDATE SET
                ${conflictUpdateParts.join(', ')},
                is_active = true,
                updated_at = NOW()
            `;

            const upsertResult = await client.query(insertSql, insertValues);
            if (upsertResult.rowCount > 0) {
              updated += 1;
            } else {
              skipped.push(itemCode);
            }
          }
        }

        await client.query('COMMIT');
        return res.json({ success: true, data: { updated, skipped, errors } });
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err) {
      logger.error('PATCH /items/mrp/bulk error:', err);
      return res.status(500).json({ success: false, error: 'Failed to bulk update MRP fields' });
    }
  });

  // ─── PATCH /items/prices/bulk — Batch market price update (A20) ───────────
  router.patch('/items/prices/bulk', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'items array is required' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        let updated = 0;
        const skipped = [];
        const errors = [];

        for (const item of items) {
          if (!item.item_code) {
            errors.push({ item_code: item.item_code, error: 'Missing item_code' });
            continue;
          }
          try {
            const result = await client.query(`
              UPDATE mes_item_master SET
                market_ref_price = $1,
                market_price_date = COALESCE($2, CURRENT_DATE),
                updated_at = NOW()
              WHERE item_code = $3 AND is_active = true
            `, [item.market_ref_price, item.market_price_date, item.item_code]);

            if (result.rowCount > 0) {
              updated++;
            } else {
              skipped.push(item.item_code);
            }
          } catch (itemErr) {
            errors.push({ item_code: item.item_code, error: itemErr.message });
          }
        }

        await client.query('COMMIT');
        res.json({ success: true, data: { updated, skipped, errors } });
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err) {
      logger.error('PATCH /items/prices/bulk error:', err);
      res.status(500).json({ success: false, error: 'Failed to bulk update prices' });
    }
  });

  // ─── DELETE /items/:id — Soft delete ──────────────────────────────────────
  router.delete('/items/:id', authenticate, async (req, res) => {
    if (!isAdminOrMgmt(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
      const { rows } = await pool.query(
        'UPDATE mes_item_master SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id',
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'Item not found' });
      res.json({ success: true, message: 'Item deactivated' });
    } catch (err) {
      logger.error('DELETE /items/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to deactivate item' });
    }
  });


};
