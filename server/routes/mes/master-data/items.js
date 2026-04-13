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

      res.json({ success: true, data: groups });
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
        // Deactivate all existing groups for this category
        await client.query('UPDATE mes_item_category_groups SET is_active=false, updated_at=NOW() WHERE category_id=$1', [catId]);
        // Upsert provided groups
        for (const g of groups) {
          if (!g.catlinedesc?.trim()) continue;
          await client.query(`
            INSERT INTO mes_item_category_groups (category_id, catlinedesc, is_active)
            VALUES ($1, $2, true)
            ON CONFLICT (category_id, catlinedesc) DO UPDATE SET
              is_active = true,
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
        'SELECT catlinedesc FROM mes_item_category_groups WHERE category_id=$1 AND is_active=true ORDER BY catlinedesc',
        [catId]
      );

      if (!selectedGroups.length) {
        return res.json({ success: true, data: { category, groups: [], totals: {}, parameters: {} } });
      }

      const catlinedescList = selectedGroups.map(g => g.catlinedesc);

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

      // ── Level 2: Aggregate per catlinedesc ──────────────────────────────
      const { rows: groupAgg } = await pool.query(`
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
        GROUP BY TRIM(catlinedesc)
        ORDER BY LOWER(TRIM(catlinedesc)) ASC
      `, [catlinedescList, searchLike]);

      // ── Level 3: Item Groups per catlinedesc ────────────────────────────
      const { rows: itemGroupAgg } = await pool.query(`
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
        GROUP BY TRIM(catlinedesc), TRIM(itemgroup)
        ORDER BY LOWER(TRIM(catlinedesc)) ASC, LOWER(TRIM(itemgroup)) ASC
      `, [catlinedescList, searchLike]);

      // ── Market Price from mes_item_master — weighted by stock qty per item ──
      // Key: LOWER(TRIM(oracle_cat_desc)) + '::' + LOWER(TRIM(itemgroup from rm))
      // We join on oracle_cat_desc to get market_ref_price, then aggregate
      const { rows: marketRows } = await pool.query(`
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
        GROUP BY TRIM(r.catlinedesc), TRIM(r.itemgroup)
      `, [catlinedescList, searchLike]);

      const { rows: filteredItemRows } = await pool.query(`
        SELECT DISTINCT LOWER(TRIM(mainitem)) AS item_key
        FROM fp_actualrmdata
        WHERE TRIM(catlinedesc) = ANY($1)
          AND ${rmSearchSql}
      `, [catlinedescList, searchLike]);
      const filteredItemKeys = filteredItemRows
        .map((row) => row.item_key)
        .filter(Boolean);

      // Build market price lookup: catlinedesc::itemgroup → { mkt_val, mkt_qty }
      const mktByIG = {};
      const mktByDesc = {};
      let totalMktVal = 0, totalMktQty = 0;
      for (const mr of marketRows) {
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

      // Group item_groups by catlinedesc
      const itemGroupsByDesc = {};
      itemGroupAgg.forEach(ig => {
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

      // Build groups array with item_groups and % breakdown
      let totalStockQty = 0, totalStockVal = 0, totalOrderQty = 0, totalOrderVal = 0;
      const groups = groupAgg.map(g => {
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

        return {
          catlinedesc: g.catlinedesc,
          item_count: Number(g.item_count) || 0,
          item_group_count: Number(g.item_group_count) || 0,
          stock_qty: stockQty,
          order_qty: orderQty,
          ...prices,
          item_groups: igs,
        };
      });

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
        GROUP BY LOWER(TRIM(mainitem))
        ORDER BY stock_qty DESC
      `, [scopedCatlinedescList, itemgroup]);

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
        'SELECT catlinedesc FROM mes_item_category_groups WHERE category_id=$1 AND is_active=true',
        [catId]
      );
      const allowedGroups = new Set(selectedGroups.map((g) => String(g.catlinedesc || '').trim()));
      if (!allowedGroups.has(catlinedesc)) {
        return res.status(400).json({ success: false, error: 'catlinedesc is not mapped to this category' });
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

      const { rows: rmItems } = await pool.query(`
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
        GROUP BY LOWER(TRIM(mainitem))
        ORDER BY stock_qty DESC
      `, [catlinedesc]);

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
