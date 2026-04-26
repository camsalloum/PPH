/**
 * MES Master Data — TDS (Technical Data Sheet) Routes
 * Mounted at /api/mes/master-data/tds
 *
 * Full CRUD for mes_material_tds + mes_suppliers + mes_tds_attachments.
 * Density stored in kg/m³.  All KB-seeded data has status='review'.
 */

const { pool } = require('../../../database/config');
const { authenticate } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');
const { recordSchemaAdminChange } = require('../../../utils/mes-schema-admin-audit');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { PDFParse } = require('pdf-parse');
const {
  extractFromText,
  diffWithRecord,
} = require('../../../utils/tds-pdf-parser');
const {
  extractBySchema,
  diffExtractedWithExisting,
  buildLabelRegex,
} = require('../../../utils/schema-pdf-parser');

const TDS_WRITE_ROLES = ['admin', 'production_manager', 'quality_control'];
function isTdsWriter(user) {
  return TDS_WRITE_ROLES.includes(user?.role);
}

const TDS_IDENTITY_FIELDS = [
  'oracle_item_code', 'supplier_id', 'brand_grade', 'category', 'cat_desc', 'material_code', 'grade_type', 'status',
  'resin_type', 'catalyst_type', 'comonomer_type', 'production_process', 'polymer_type', 'applications',
];

const TDS_RESIN_TECH_FIELDS = [
  'mfr_190_2_16', 'mfr_190_2_16_test_method',
  'mfr_190_5_0', 'mfr_190_5_0_test_method',
  'hlmi_190_21_6', 'hlmi_190_21_6_test_method',
  'mfr_230_2_16_pp', 'mfr_230_2_16_pp_test_method',
  'melt_flow_ratio',
  'density', 'density_test_method',
  'crystalline_melting_point', 'crystalline_melting_point_test_method',
  'vicat_softening_point', 'vicat_softening_point_test_method',
  'heat_deflection_temp', 'heat_deflection_temp_test_method',
  'tensile_strength_break', 'tensile_strength_break_test_method',
  'elongation_break', 'elongation_break_test_method',
  'brittleness_temp', 'brittleness_temp_test_method',
  'bulk_density', 'bulk_density_test_method',
  'flexural_modulus', 'flexural_modulus_test_method',
];

const TDS_MISC_FIELDS = [
  'food_contact', 'food_contact_reg', 'uv_stabilised',
  'notes', 'source_name', 'source_url', 'source_date',
];

const TDS_WRITE_FIELDS = [
  ...TDS_IDENTITY_FIELDS,
  ...TDS_RESIN_TECH_FIELDS,
  ...TDS_MISC_FIELDS,
];

const LIVE_MATERIAL_CLASS_KEYS = [
  'resins',
  'substrates',
  'adhesives',
  'chemicals',
  'additives',
  'coating',
  'packing_materials',
  'mounting_tapes',
];

const NON_RESIN_MATERIAL_CLASS_KEYS = LIVE_MATERIAL_CLASS_KEYS.filter((k) => k !== 'resins');
const NON_RESIN_SPEC_STATUSES = ['draft', 'review', 'verified', 'standard', 'corrected'];
const { ALU_FOIL_PROFILE_KEY } = require('../../../constants/mes-profiles');
const ALU_FOIL_MATCH_RE = /(aluminium|aluminum|alu\s*\/\s*pap|alu\s*foil|foil\s*alu|butter\s*foil|\balu\b)/i;
const PARSE_UPLOAD_MODE_SINGLE_COMPONENT = 'single_component';
const PARSE_UPLOAD_MODE_MULTI_COMPONENT = 'multi_component';

// ── Substrate-specific profile keys & detection regexes ──
const SUBSTRATE_PROFILES = {
  substrates_bopp:    { key: 'substrates_bopp',    re: /\bbopp\b/i },
  substrates_cpp:     { key: 'substrates_cpp',     re: /\bcpp\b|\bcast\s*pp\b|\brcpp\b/i },
  substrates_pet:     { key: 'substrates_pet',     re: /\bbopet\b|\bpet\b(?!\s*[cg])/i },
  substrates_pa:      { key: 'substrates_pa',      re: /\bbopa\b|\bnylon\b|\bpa\s*6\b|\bpa\b/i },
  substrates_pe:      { key: 'substrates_pe',      re: /\b(?:ld|lld|hd|m)pe\b|\bpe\s*lam/i },
  substrates_pvc:     { key: 'substrates_pvc',     re: /\bpvc\b/i },
  substrates_petc:    { key: 'substrates_petc',    re: /\bpet\s*c\b|\bpetc\b|\bc-pet\b/i },
  substrates_petg:    { key: 'substrates_petg',    re: /\bpet\s*g\b|\bpetg\b|\bg-pet\b/i },
  substrates_alu_pap: { key: 'substrates_alu_pap', re: /\balu\s*\/?\s*pap\b|\bbutter\s*foil\b|\bwalki\b|paper\s*\/\s*foil|foil\s*lam/i },
  substrates_pap:     { key: 'substrates_pap',     re: /\bpaper\b|\bpap\b|\bkraft\b|\bglassine\b/i },
};

const ALU_FOIL_FIELD_LABELS = {
  alloy: 'Alloy',
  temper: 'Temper',
  thickness_min_mm: 'Thickness Min (mm)',
  thickness_max_mm: 'Thickness Max (mm)',
  thickness_tolerance_pct: 'Thickness Tolerance (%)',
  width_tolerance_mm: 'Width Tolerance (mm)',
  tensile_strength_min_mpa: 'Tensile Strength Min (MPa)',
  tensile_strength_max_mpa: 'Tensile Strength Max (MPa)',
  elongation_min_pct: 'Elongation Min (%)',
  core_id_small_mm: 'Core ID (small) (mm)',
  max_coil_od_small_core_mm: 'Max Coil OD (small core) (mm)',
  core_id_large_mm: 'Core ID (large) (mm)',
  max_coil_od_large_core_mm: 'Max Coil OD (large core) (mm)',
  silicon_min_pct: 'Silicon Min (%)',
  silicon_max_pct: 'Silicon Max (%)',
  iron_min_pct: 'Iron Min (%)',
  iron_max_pct: 'Iron Max (%)',
  copper_max_pct: 'Copper Max (%)',
  manganese_max_pct: 'Manganese Max (%)',
  magnesium_max_pct: 'Magnesium Max (%)',
  zinc_max_pct: 'Zinc Max (%)',
  titanium_max_pct: 'Titanium Max (%)',
  chromium_max_pct: 'Chromium Max (%)',
  nickel_max_pct: 'Nickel Max (%)',
  lead_max_pct: 'Lead Max (%)',
  others_each_max_pct: 'Others Each Max (%)',
  others_total_max_pct: 'Others Total Max (%)',
  aluminium_min_pct: 'Aluminium Min (%)',
  composition_limits: 'Composition Limits (per element)',
  chemical_test_method: 'Chemical Test Method',
  mechanical_test_method: 'Mechanical Test Method',
  gauge_test_method: 'Gauge Test Method',
  pinhole_test_method: 'Pinhole Test Method',
};

// REMOVED: NON_RESIN_PARAM_RULES — replaced by mes_parameter_definitions DB table (migration 031/032)
// Kept as reference in git history. getParamRulesFromDB() now fetches from DB with no fallback needed.
const NON_RESIN_PARAM_RULES = {};


// REMOVED: LIVE_MATERIAL_CLASS_CASE_SQL — replaced by mes_category_mapping JOIN
// Multer for TDS PDF uploads
const uploadDir = path.join(__dirname, '..', '..', '..', 'uploads', 'tds');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('File type not allowed'));
  },
});

function normalizeText(v) {
  return String(v || '').trim();
}

function normalizeMaterialKey(v) {
  return normalizeText(v).toLowerCase();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function inferSupplierFromEvidence(rawText, fileName, suppliers = []) {
  const text = normalizeText(rawText);
  const file = normalizeText(fileName);
  if (!suppliers.length || (!text && !file)) return null;

  const compact = (v) => normalizeText(v).toLowerCase().replace(/[^a-z0-9]/g, '');
  const textCompact = compact(text);
  const fileCompact = compact(file);

  let best = null;

  for (const supplier of suppliers) {
    const supplierName = normalizeText(supplier?.name);
    if (!supplierName) continue;
    if (supplierName.toLowerCase() === 'unknown') continue;

    const parts = supplierName.split(/\s+/).filter(Boolean).map(escapeRegExp);
    if (!parts.length) continue;

    const pattern = parts.join('[\\s\\-_/]*');
    const wordBoundaryRe = new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`, 'i');
    const fileMatch = wordBoundaryRe.test(file);
    const textMatch = wordBoundaryRe.test(text);

    const compactName = compact(supplierName);
    const compactMatch = compactName && (fileCompact.includes(compactName) || textCompact.includes(compactName));

    const score = (fileMatch ? 4 : 0) + (textMatch ? 3 : 0) + (compactMatch ? 1 : 0);
    if (!score) continue;

    if (!best || score > best.score || (score === best.score && supplierName.length > best.name.length)) {
      best = { id: Number(supplier.id), name: supplierName, score };
    }
  }

  return best && Number.isFinite(best.id) ? best : null;
}

async function findTdsBySupplierAndOracleCode(db, supplierId, oracleItemCode, excludeId) {
  const normalizedSupplierId = Number(supplierId);
  const normalizedOracleCode = normalizeText(oracleItemCode);
  const normalizedExcludeId = Number(excludeId);

  if (!Number.isFinite(normalizedSupplierId) || !normalizedOracleCode) return null;

  const params = [normalizedSupplierId, normalizedOracleCode];
  let whereExclude = '';

  if (Number.isFinite(normalizedExcludeId)) {
    params.push(normalizedExcludeId);
    whereExclude = `AND t.id <> $${params.length}`;
  }

  const { rows } = await db.query(
    `SELECT t.*
     FROM mes_material_tds t
     WHERE t.supplier_id = $1
       AND LOWER(TRIM(COALESCE(t.oracle_item_code, ''))) = LOWER(TRIM($2))
       ${whereExclude}
     ORDER BY t.updated_at DESC NULLS LAST, t.id DESC
     LIMIT 1`,
    params
  );

  return rows[0] || null;
}

function computeFileSha256(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function buildSourceMetadataForUpload(fileName, fileExt, tdsId, attachmentId) {
  const ext = String(fileExt || '').toLowerCase();
  const sourcePrefix = ext === '.pdf' ? 'Source Updated PDF' : 'Source Updated File';
  const sourceDate = new Date().toISOString().slice(0, 10);
  const sourceUrl = attachmentId
    ? `/api/mes/master-data/tds/${tdsId}/attachments/${attachmentId}`
    : `uploaded:${fileName}`;

  return {
    sourceName: `${sourcePrefix}: ${fileName}`,
    sourceUrl,
    sourceDate,
  };
}

async function resolveResinTaxonomyCategoryId(db, categoryValue, catDescValue) {
  const category = normalizeText(categoryValue).toLowerCase();
  const catDesc = normalizeText(catDescValue);
  if (category !== 'resins' || !catDesc) return null;

  try {
    const { rows } = await db.query(
      `SELECT c.id
       FROM mes_item_taxonomy_categories c
       JOIN mes_item_taxonomy_domains d ON d.id = c.domain_id
       WHERE d.domain_key = 'resin'
         AND (
           LOWER(TRIM(c.display_name)) = LOWER(TRIM($1))
           OR ($2 = 'film scrap' AND c.internal_key LIKE 'film_scrap%')
         )
       ORDER BY
         CASE WHEN LOWER(TRIM(c.display_name)) = LOWER(TRIM($1)) THEN 0 ELSE 1 END,
         c.sort_order,
         c.id
       LIMIT 1`,
      [catDesc, catDesc.toLowerCase()]
    );
    return rows[0]?.id || null;
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') {
      return null;
    }
    throw err;
  }
}

async function resolveSubstrateTaxonomyLink(db, materialClass, catLineDesc) {
  if (String(materialClass || '').toLowerCase() !== 'substrates') {
    return { taxonomyCategoryId: null, taxonomySubcategoryId: null };
  }

  const subcategoryName = normalizeText(catLineDesc);
  if (!subcategoryName) {
    return { taxonomyCategoryId: null, taxonomySubcategoryId: null };
  }

  try {
    const { rows } = await db.query(
      `SELECT
         c.id AS category_id,
         sc.id AS subcategory_id
       FROM mes_item_taxonomy_subcategories sc
       JOIN mes_item_taxonomy_categories c ON c.id = sc.category_id
       JOIN mes_item_taxonomy_domains d ON d.id = c.domain_id
       WHERE d.domain_key = 'substrate'
         AND LOWER(TRIM(sc.display_name)) = LOWER(TRIM($1))
       ORDER BY c.sort_order, sc.sort_order, sc.id
       LIMIT 1`,
      [subcategoryName]
    );

    if (!rows.length) {
      return { taxonomyCategoryId: null, taxonomySubcategoryId: null };
    }

    return {
      taxonomyCategoryId: rows[0].category_id,
      taxonomySubcategoryId: rows[0].subcategory_id,
    };
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') {
      return { taxonomyCategoryId: null, taxonomySubcategoryId: null };
    }
    throw err;
  }
}

function parseMaybeNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(String(raw).replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function normalizePdfText(raw) {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u2264]/g, '<=')
    .replace(/[\u2265]/g, '>=')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ');
}

function pickFirstNumber(text, regexes) {
  for (const re of regexes) {
    const m = re.exec(text);
    if (!m) continue;
    const n = parseMaybeNumber(m[1]);
    if (n !== null) return n;
  }
  return null;
}

function pickRangeNumbers(text, regexes) {
  for (const re of regexes) {
    const m = re.exec(text);
    if (!m) continue;
    const min = parseMaybeNumber(m[1]);
    const max = parseMaybeNumber(m[2]);
    if (min !== null && max !== null) {
      return {
        min: Math.min(min, max),
        max: Math.max(min, max),
      };
    }
  }
  return null;
}

function pickElementStats(text, tokenPattern) {
  const rangeRe = new RegExp(`(?:${tokenPattern})[^\\n]{0,36}?([0-9]+(?:\\.[0-9]+)?)\\s*-\\s*([0-9]+(?:\\.[0-9]+)?)`, 'i');
  const rangeMatch = rangeRe.exec(text);
  if (rangeMatch) {
    const min = parseMaybeNumber(rangeMatch[1]);
    const max = parseMaybeNumber(rangeMatch[2]);
    if (min !== null && max !== null) {
      return { min: Math.min(min, max), max: Math.max(min, max) };
    }
  }

  const maxRe = new RegExp(`(?:${tokenPattern})[^\\n]{0,36}?(?:<=|<|max\\.?|maximum\\s*:?|up\\s*to\\s*)([0-9]+(?:\\.[0-9]+)?)`, 'i');
  const maxMatch = maxRe.exec(text);
  if (maxMatch) {
    const max = parseMaybeNumber(maxMatch[1]);
    if (max !== null) return { max };
  }

  const trailingMaxRe = new RegExp(`(?:${tokenPattern})[^\\n]{0,36}?([0-9]+(?:\\.[0-9]+)?)\\s*(?:max|maximum)`, 'i');
  const trailingMaxMatch = trailingMaxRe.exec(text);
  if (trailingMaxMatch) {
    const max = parseMaybeNumber(trailingMaxMatch[1]);
    if (max !== null) return { max };
  }

  return null;
}

function pickMethodCode(text, anchorRegexes) {
  for (const anchor of anchorRegexes) {
    const match = anchor.exec(text);
    if (!match) continue;
    const start = Math.max(0, match.index - 40);
    const end = Math.min(text.length, match.index + match[0].length + 120);
    const snippet = text.slice(start, end);
    const code = snippet.match(/(GB\s*\/\s*T\s*\d+(?:\.\d+)?)/i);
    if (code) return code[1].replace(/\s+/g, '');
  }
  return null;
}

function isAluFoilContext(context = {}) {
  const joined = [
    context.mainitem,
    context.maindescription,
    context.catlinedesc,
    context.material,
    context.mainCategory,
    context.mapped_substrate,
  ]
    .map((v) => normalizeText(v).toLowerCase())
    .join(' ');

  return ALU_FOIL_MATCH_RE.test(joined);
}

function resolveNonResinParamProfile(materialClass, context = {}) {
  if (materialClass !== 'substrates') return materialClass;

  const joined = [
    context.mainitem,
    context.maindescription,
    context.catlinedesc,
    context.material,
    context.mainCategory,
    context.mapped_substrate,
  ]
    .map((v) => normalizeText(v).toLowerCase())
    .join(' ');

  // Alu foil takes highest priority (exact match)
  if (ALU_FOIL_MATCH_RE.test(joined)) return ALU_FOIL_PROFILE_KEY;

  // Walk substrate profiles in priority order (specific before general)
  for (const { key, re } of Object.values(SUBSTRATE_PROFILES)) {
    if (re.test(joined)) return key;
  }

  return materialClass;
}

function getNonResinParamRules(materialClass, context = {}) {
  const profile = resolveNonResinParamProfile(materialClass, context);
  return {
    profile,
    rules: NON_RESIN_PARAM_RULES[profile] || NON_RESIN_PARAM_RULES[materialClass] || [],
  };
}

// DB-driven version — fetches parameter definitions from mes_parameter_definitions
async function getParamRulesFromDB(materialClass, context = {}) {
  const profile = resolveNonResinParamProfile(materialClass, context);
  try {
    const isProfile = profile !== materialClass;
    const { rows } = await pool.query(
      `SELECT field_key AS key, label, unit, field_type AS type,
              step, min_value AS min, max_value AS max, max_length AS "maxLength",
              is_required AS required, enum_options AS "enumOptions"
       FROM mes_parameter_definitions
       WHERE material_class = $1 AND (($2::text IS NULL AND profile IS NULL) OR profile = $2)
       ORDER BY sort_order ASC`,
      [isProfile ? 'substrates' : materialClass, isProfile ? profile : null]
    );
    if (rows.length > 0) {
      return { profile, rules: rows.map(r => ({
        ...r,
        min: r.min !== null && r.min !== undefined ? Number(r.min) : undefined,
        max: r.max !== null && r.max !== undefined ? Number(r.max) : undefined,
        step: r.step !== null && r.step !== undefined ? Number(r.step) : undefined,
        enumOptions: Array.isArray(r.enumOptions) && r.enumOptions.length ? r.enumOptions : undefined,
      })) };
    }
  } catch (e) {
    logger.error('mes_parameter_definitions query failed for material_class=%s profile=%s: %s', materialClass, profile, e.message);
  }
  // No fallback: schema-driven only. Empty array surfaces an actionable empty-state in the UI.
  return { profile, rules: [] };
}

function extractAluFoilFromText(rawText) {
  const text = normalizePdfText(rawText);
  const out = {};

  const alloyTemper = text.match(/\b(8011|1235|8079|3003)\s*[-\/]\s*(O|H\d{1,2})\b/i);
  if (alloyTemper) {
    out.alloy = alloyTemper[1];
    out.temper = alloyTemper[2].toUpperCase();
  } else {
    const alloys = [...new Set(Array.from(text.matchAll(/\b(8011|1235|8079|3003)\b/gi)).map((m) => m[1]))];
    if (alloys.length === 1) out.alloy = alloys[0];
    if (alloys.length > 1) out.alloy = alloys.join('/');

    const temperOnly = text.match(/(?:temper|state)\s*[:\-]?\s*(O|H\d{1,2})\b/i);
    if (temperOnly) out.temper = temperOnly[1].toUpperCase();
  }

  let thicknessRange = pickRangeNumbers(text, [
    /(?:thickness|gauge)[^\n]{0,80}?([0-9]*\.?[0-9]+)\s*-\s*([0-9]*\.?[0-9]+)\s*mm/i,
  ]);

  if (!thicknessRange) {
    const genericRanges = Array.from(text.matchAll(/([0-9]*\.?[0-9]+)\s*-\s*([0-9]*\.?[0-9]+)\s*mm/gi));
    for (const m of genericRanges) {
      const min = parseMaybeNumber(m[1]);
      const max = parseMaybeNumber(m[2]);
      if (min !== null && max !== null && Math.max(min, max) <= 1) {
        thicknessRange = { min: Math.min(min, max), max: Math.max(min, max) };
        break;
      }
    }
  }

  if (thicknessRange) {
    out.thickness_min_mm = thicknessRange.min;
    out.thickness_max_mm = thicknessRange.max;
  }

  const thicknessTolerance = pickFirstNumber(text, [
    /thickness[^\n]{0,80}?\+\/-\s*([0-9]*\.?[0-9]+)\s*%/i,
    /thickness[^\n]{0,80}?(?:tolerance|tol\.?)[^\n]{0,20}?([0-9]*\.?[0-9]+)\s*%/i,
  ]);
  if (thicknessTolerance !== null) out.thickness_tolerance_pct = thicknessTolerance;

  const widthTolerance = pickFirstNumber(text, [
    /width[^\n]{0,80}?\+\/-\s*([0-9]*\.?[0-9]+)\s*mm/i,
    /width[^\n]{0,80}?(?:tolerance|tol\.?)[^\n]{0,20}?([0-9]*\.?[0-9]+)\s*mm/i,
  ]);
  if (widthTolerance !== null) out.width_tolerance_mm = widthTolerance;

  const tensileRange = pickRangeNumbers(text, [
    /tensile\s*strength[^\n]{0,40}?([0-9]+(?:\.[0-9]+)?)\s*-\s*([0-9]+(?:\.[0-9]+)?)\s*mpa/i,
  ]);
  if (tensileRange) {
    out.tensile_strength_min_mpa = tensileRange.min;
    out.tensile_strength_max_mpa = tensileRange.max;
  }

  const elongationMin = pickFirstNumber(text, [
    /elongation[^\n]{0,40}?(?:>=|>)\s*([0-9]+(?:\.[0-9]+)?)\s*%/i,
    /elongation[^\n]{0,40}?([0-9]+(?:\.[0-9]+)?)\s*%/i,
  ]);
  if (elongationMin !== null) out.elongation_min_pct = elongationMin;

  const smallCorePair = text.match(/for\s*core\s*i\.?d\.?\s*(?:is|=)?\s*(75(?:\.0)?|76(?:\.2)?)[\s\S]{0,90}?(?:max\s*coil\s*o\.?d\.?|o\.?d\.?\s*(?:is|=)?)[\s\S]{0,24}?([0-9]+(?:\.[0-9]+)?)\s*mm/i);
  if (smallCorePair) {
    out.core_id_small_mm = parseMaybeNumber(smallCorePair[1]);
    out.max_coil_od_small_core_mm = parseMaybeNumber(smallCorePair[2]);
  }

  const largeCorePair = text.match(/for\s*core\s*i\.?d\.?\s*(?:is|=)?\s*(150(?:\.0)?|152(?:\.4)?)[\s\S]{0,90}?(?:max\s*coil\s*o\.?d\.?|o\.?d\.?\s*(?:is|=)?)[\s\S]{0,24}?([0-9]+(?:\.[0-9]+)?)\s*mm/i);
  if (largeCorePair) {
    out.core_id_large_mm = parseMaybeNumber(largeCorePair[1]);
    out.max_coil_od_large_core_mm = parseMaybeNumber(largeCorePair[2]);
  }

  const innerDiameterPair = text.match(/inner\s*diameter[^\n]{0,60}?(75(?:\.0)?|76(?:\.2)?)[^\n]{0,20}?(150(?:\.0)?|152(?:\.4)?)/i);
  if (innerDiameterPair) {
    if (out.core_id_small_mm === undefined) out.core_id_small_mm = parseMaybeNumber(innerDiameterPair[1]);
    if (out.core_id_large_mm === undefined) out.core_id_large_mm = parseMaybeNumber(innerDiameterPair[2]);
  }

  const si = pickElementStats(text, 'silicon|\\bsi\\b');
  if (si?.min !== undefined) out.silicon_min_pct = si.min;
  if (si?.max !== undefined) out.silicon_max_pct = si.max;

  const fe = pickElementStats(text, 'iron|\\bfe\\b');
  if (fe?.min !== undefined) out.iron_min_pct = fe.min;
  if (fe?.max !== undefined) out.iron_max_pct = fe.max;

  const cu = pickElementStats(text, 'copper|\\bcu\\b');
  if (cu?.max !== undefined) out.copper_max_pct = cu.max;

  const mn = pickElementStats(text, 'manganese|\\bmn\\b');
  if (mn?.max !== undefined) out.manganese_max_pct = mn.max;

  const mg = pickElementStats(text, 'magnesium|\\bmg\\b');
  if (mg?.max !== undefined) out.magnesium_max_pct = mg.max;

  const zn = pickElementStats(text, 'zinc|\\bzn\\b');
  if (zn?.max !== undefined) out.zinc_max_pct = zn.max;

  const ti = pickElementStats(text, 'titanium|\\bti\\b');
  if (ti?.max !== undefined) out.titanium_max_pct = ti.max;

  // Phase 5 — additional alloy elements (Cr, Ni, Pb, Al, Others-each/total)
  const cr = pickElementStats(text, 'chromium|chrome|\\bcr\\b');
  if (cr?.max !== undefined) out.chromium_max_pct = cr.max;

  const ni = pickElementStats(text, 'nickel|\\bni\\b');
  if (ni?.max !== undefined) out.nickel_max_pct = ni.max;

  const pb = pickElementStats(text, 'lead|\\bpb\\b');
  if (pb?.max !== undefined) out.lead_max_pct = pb.max;

  const al = pickElementStats(text, 'aluminium|aluminum|\\bal\\b');
  if (al?.min !== undefined) out.aluminium_min_pct = al.min;

  const othersEach = text.match(/others?(?:\s*[,-]?\s*each)?[^\n]{0,40}?([0-9]+(?:\.[0-9]+)?)\s*%/i);
  if (othersEach) out.others_each_max_pct = parseMaybeNumber(othersEach[1]);

  const othersTotal = text.match(/others?(?:\s*[,-]?\s*total|\s*sum)[^\n]{0,40}?([0-9]+(?:\.[0-9]+)?)\s*%/i);
  if (othersTotal) out.others_total_max_pct = parseMaybeNumber(othersTotal[1]);

  const chemicalMethod = pickMethodCode(text, [/chemical\s+composition/i]);
  if (chemicalMethod) out.chemical_test_method = chemicalMethod;

  const mechanicalMethod = pickMethodCode(text, [/mechanical\s+properties/i, /tensile\s*strength/i, /elongation/i]);
  if (mechanicalMethod) out.mechanical_test_method = mechanicalMethod;

  const gaugeMethod = pickMethodCode(text, [/gauge/i, /thickness\s+measurement/i]);
  if (gaugeMethod) out.gauge_test_method = gaugeMethod;

  const pinholeMethod = pickMethodCode(text, [/pinhole/i]);
  if (pinholeMethod) out.pinhole_test_method = pinholeMethod;

  // Phase 5 — aggregated composition_limits JSONB (Element → {min,max}).
  // Built from the same scanned values above; only includes elements actually found.
  // Downstream consumers (analytics, exports) can iterate this map without
  // hard-coding every *_min_pct / *_max_pct field name.
  const elementMap = [
    { sym: 'Si', stats: si }, { sym: 'Fe', stats: fe }, { sym: 'Cu', stats: cu },
    { sym: 'Mn', stats: mn }, { sym: 'Mg', stats: mg }, { sym: 'Zn', stats: zn },
    { sym: 'Ti', stats: ti }, { sym: 'Cr', stats: cr }, { sym: 'Ni', stats: ni },
    { sym: 'Pb', stats: pb }, { sym: 'Al', stats: al },
  ];
  const compositionLimits = {};
  for (const { sym, stats } of elementMap) {
    if (!stats) continue;
    const entry = {};
    if (stats.min !== undefined) entry.min = stats.min;
    if (stats.max !== undefined) entry.max = stats.max;
    if (Object.keys(entry).length) compositionLimits[sym] = entry;
  }
  if (out.others_each_max_pct !== undefined) {
    compositionLimits.OthersEach = { max: out.others_each_max_pct };
  }
  if (out.others_total_max_pct !== undefined) {
    compositionLimits.OthersTotal = { max: out.others_total_max_pct };
  }
  if (Object.keys(compositionLimits).length) {
    out.composition_limits = compositionLimits;
  }

  return Object.fromEntries(Object.entries(out).filter(([, value]) => value !== null && value !== undefined && value !== ''));
}

function areValuesEqual(a, b) {
  const aNum = Number(a);
  const bNum = Number(b);
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
    return Math.abs(aNum - bNum) < 0.000001;
  }

  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function buildNonResinParameterDiff(extracted, currentParams, lockedFields) {
  const diff = [];
  const current = isPlainObject(currentParams) ? currentParams : {};
  const locked = Array.isArray(lockedFields) ? lockedFields : [];

  Object.entries(extracted || {}).forEach(([field, extractedValue]) => {
    if (!ALU_FOIL_FIELD_LABELS[field]) return;

    const currentValue = current[field];
    const isEmpty = currentValue === null || currentValue === undefined || currentValue === '';
    if (!isEmpty && areValuesEqual(currentValue, extractedValue)) return;

    diff.push({
      field,
      label: ALU_FOIL_FIELD_LABELS[field],
      currentValue: isEmpty ? null : currentValue,
      extractedValue,
      isEmpty,
      isLocked: locked.includes(field),
      domain: 'non_resin',
    });
  });

  return diff;
}

function normalizeSchemaDiffForClient(schemaDiff = []) {
  return (Array.isArray(schemaDiff) ? schemaDiff : []).map((item) => {
    const currentValue = item?.currentValue !== undefined
      ? item.currentValue
      : (item?.old !== undefined ? item.old : null);
    const extractedValue = item?.extractedValue !== undefined
      ? item.extractedValue
      : item?.new;
    const isLocked = item?.isLocked !== undefined ? !!item.isLocked : !!item?.locked;
    const isEmpty = currentValue === null || currentValue === undefined || currentValue === '';

    return {
      field: item?.field,
      label: item?.label || item?.field,
      unit: item?.unit || null,
      currentValue,
      extractedValue,
      currentDisplay: currentValue,
      extractedDisplay: extractedValue,
      isEmpty,
      isLocked,
      method: item?.method || null,
      methodUnrecognized: !!item?.methodUnrecognized,
      domain: item?.domain || 'non_resin',
    };
  });
}

function normalizeParseUploadMode(materialClass, rawMode) {
  const normalizedClass = normalizeMaterialKey(materialClass);
  const mode = normalizeText(rawMode).toLowerCase();
  if (mode === PARSE_UPLOAD_MODE_MULTI_COMPONENT && normalizedClass === 'adhesives') {
    return PARSE_UPLOAD_MODE_MULTI_COMPONENT;
  }
  return PARSE_UPLOAD_MODE_SINGLE_COMPONENT;
}

function buildParseUploadSuccess(payload = {}) {
  const mode = payload.mode === PARSE_UPLOAD_MODE_MULTI_COMPONENT
    ? PARSE_UPLOAD_MODE_MULTI_COMPONENT
    : PARSE_UPLOAD_MODE_SINGLE_COMPONENT;

  return {
    success: true,
    mode,
    multi_component: mode === PARSE_UPLOAD_MODE_MULTI_COMPONENT,
    ...payload,
  };
}

function toPlainNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  let text = String(raw)
    .trim()
    .replace(/[<>≤≥~]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^0-9,\.\-+]/g, '');

  if (!text) return null;

  const hasComma = text.includes(',');
  const hasDot = text.includes('.');

  if (hasComma && hasDot) {
    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    const decimalSep = lastComma > lastDot ? ',' : '.';

    if (decimalSep === ',') {
      text = text.replace(/\./g, '').replace(/,/g, '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (hasComma) {
    if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) {
      text = text.replace(/,/g, '');
    } else if (/^[+-]?\d+,\d{1,3}$/.test(text)) {
      text = text.replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (hasDot) {
    // Handle values like 1.100 used as thousands separator in some PDFs.
    if (/^[+-]?\d{1,3}(\.\d{3})+$/.test(text)) {
      text = text.replace(/\./g, '');
    }
  }

  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function extractLikelyItemCodes(rawText, limit = 8) {
  const text = String(rawText || '');
  const codeRe = /\b([A-Z]{1,8}[-\s]?\d{2,6}[A-Z]?)\b/g;
  const blocked = new Set(['ASTM', 'ISO', 'DIN', 'EN', 'TDS', 'PDF', 'DATA']);
  const counts = new Map();

  let m;
  while ((m = codeRe.exec(text)) !== null) {
    const token = String(m[1] || '').toUpperCase().replace(/[\s-]+/g, '');
    if (!token || blocked.has(token)) continue;
    if (/^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([token]) => token);
}

function detectCombinedComponentLayout(rawText) {
  const text = String(rawText || '');
  const likelyCodes = extractLikelyItemCodes(text, 10);
  const normalizeComponentCode = (code) => String(code || '').toUpperCase().replace(/[\s-]+/g, '');

  const pairMatch = text.match(/\b(?:[A-Z][A-Z0-9-]*\s+)?([A-Z]{1,8}[-\s]?\d{2,6}[A-Z]?)\s*(?:\+|\/|\band\b|\bwith\b)\s*(?:[A-Z][A-Z0-9-]*\s+)?([A-Z]{1,8}[-\s]?\d{2,6}[A-Z]?)\b/i);
  let codeA = pairMatch ? normalizeComponentCode(pairMatch[1]) : null;
  let codeB = pairMatch ? normalizeComponentCode(pairMatch[2]) : null;

  if (!codeA) {
    const partA = text.match(/\b(?:part|component|side)\s*a\b[^\n]{0,40}\b([A-Z]{1,5}\d{2,6}[A-Z]?)\b/i);
    if (partA) codeA = normalizeComponentCode(partA[1]);
  }

  if (!codeB) {
    const partB = text.match(/\b(?:part|component|side)\s*b\b[^\n]{0,40}\b([A-Z]{1,5}\d{2,6}[A-Z]?)\b/i)
      || text.match(/\b(?:hard(?:e)?n(?:er)?|curative|crosslinker|cross-linker|cross\s*linker)\b[^\n]{0,40}\b([A-Z]{1,5}\d{2,6}[A-Z]?)\b/i);
    if (partB) codeB = normalizeComponentCode(partB[1]);
  }

  if (!codeA && likelyCodes.length) codeA = likelyCodes[0];
  if (!codeB) {
    const alt = likelyCodes.find((token) => token && token !== codeA);
    if (alt) codeB = alt;
  }

  const shared = [];
  const partA = [];
  const partB = [];
  let state = 'shared';

  const lines = text.split(/\r?\n/);
  lines.forEach((line) => {
    const lower = String(line || '').toLowerCase();
    const marksA = /\b(part|component|side)\s*a\b/.test(lower)
      || (/\bresin\b/.test(lower) && !/\bhard(?:e)?n|\bcurative\b|\bcrosslinker\b|\bcross-linker\b/.test(lower));
    const marksB = /\b(part|component|side)\s*b\b/.test(lower)
      || /\b(hard(?:e)?n(?:er)?|curative|crosslinker|cross-linker|cross\s*linker)\b/.test(lower);

    if (marksA && !marksB) state = 'a';
    else if (marksB) state = 'b';

    if (state === 'a') partA.push(line);
    else if (state === 'b') partB.push(line);
    else shared.push(line);
  });

  const hasExplicitMarkers = partA.length > 0 && partB.length > 0;
  const hasTwoCodes = !!(codeA && codeB && codeA !== codeB);

  return {
    isMulti: hasTwoCodes || hasExplicitMarkers,
    hasExplicitMarkers,
    likelyCodes,
    componentA: {
      code: codeA,
      sectionText: partA.join('\n'),
    },
    componentB: {
      code: codeB,
      sectionText: partB.join('\n'),
    },
    sharedText: shared.join('\n'),
  };
}

function buildMultiComponentSeeds(layout, componentAExtracted, componentBExtracted) {
  return [
    {
      key: 'component_a',
      component_label: 'Part A',
      component_role: 'resin',
      detected_code: layout?.componentA?.code || null,
      extracted: componentAExtracted || {},
    },
    {
      key: 'component_b',
      component_label: 'Part B',
      component_role: 'hardener',
      detected_code: layout?.componentB?.code || null,
      extracted: componentBExtracted || {},
    },
  ];
}

function hasMeaningfulMultiComponentValues(componentSeeds = [], sharedOnlyKeys = new Set()) {
  return (Array.isArray(componentSeeds) ? componentSeeds : []).filter(
    (component) => Object.keys(component?.extracted || {}).some((field) => !sharedOnlyKeys.has(field))
  ).length >= 2;
}

function selectTwoNumericCandidates(values, def, sourceText = '') {
  const source = (Array.isArray(values) ? values : []).filter((n) => Number.isFinite(n));
  if (!source.length) return [];

  const minRaw = def?.min;
  const maxRaw = def?.max;
  const minBound = (minRaw === null || minRaw === undefined || minRaw === '') ? null : Number(minRaw);
  const maxBound = (maxRaw === null || maxRaw === undefined || maxRaw === '') ? null : Number(maxRaw);
  const unit = normalizeText(def?.unit).toLowerCase();
  const key = normalizeMaterialKey(def?.field_key || '');
  const textProbe = String(sourceText || '').toLowerCase();
  const isPctField = unit.includes('%') || key.includes('pct') || key.includes('percent') || /%/.test(textProbe);
  const isDensityField = unit.includes('g/cm') || key.includes('density');
  const isViscosityField = unit.includes('cps') || unit.includes('cp') || key.includes('viscosity');
  const text = String(sourceText || '');
  const hasToleranceToken = /(?:\+\/-|\+-|±|\btol(?:erance)?\b)/i.test(text);
  const hasRangeToken = /\d+\s*-\s*\d+|\bto\b|\bmin(?:imum)?\b|\bmax(?:imum)?\b|\brange\b/i.test(text);
  const rangeMatchCount = (
    text.match(/([<>≤≥~]?\s*-?\d+(?:[.,]\d+)?)\s*(?:-|–|—|to)\s*-?\d+(?:[.,]\d+)?/gi) || []
  ).length;
  const tolerancePrincipals = Array.from(
    text.matchAll(/([<>≤≥~]?\s*-?\d+(?:[.,]\d+)?)\s*(?:\+\/-|\+-|±)\s*-?\d+(?:[.,]\d+)?\s*%?/gi)
  )
    .map((m) => toPlainNumber(m[1]))
    .filter((n) => Number.isFinite(n));
  if (hasToleranceToken && tolerancePrincipals.length >= 2) {
    return tolerancePrincipals.slice(0, 2);
  }
  let filtered = source;

  if (isPctField) {
    const pct = source.filter((n) => n >= 0 && n <= 100);
    if (pct.length >= 2) filtered = pct;
  } else if (isDensityField) {
    const density = source.filter((n) => n > 0 && n < 20);
    if (density.length >= 2) filtered = density;
  } else if (isViscosityField) {
    const visc = source.filter((n) => n > 0 && n < 500000);
    if (visc.length >= 2) filtered = visc;
  }

  if (Number.isFinite(minBound)) {
    filtered = filtered.filter((n) => n >= (minBound * 0.5));
  }
  if (Number.isFinite(maxBound)) {
    filtered = filtered.filter((n) => n <= (maxBound * 2));
  }

  if (!filtered.length) return [];

  if (filtered.length > 2) {
    // Typical side-by-side solids row: "70% +/- 2%   100%".
    if (isPctField && hasToleranceToken) {
      const nonTinyPct = filtered.filter((n) => Math.abs(n) > 5 && n >= 0 && n <= 100);
      if (nonTinyPct.length >= 2) {
        return [nonTinyPct[0], nonTinyPct[nonTinyPct.length - 1]];
      }
    }
    return [];
  }

  if (filtered.length === 2) {
    if (hasToleranceToken) {
      const percentCount = (text.match(/%/g) || []).length;
      const hasTinyValue = filtered.some((n) => Math.abs(n) <= 5);

      // Two-column solids rows can look like: "70% +/- 2%   100%".
      // If we clearly have multiple percentages and no tiny tolerance-like value,
      // keep both candidates as A/B values.
      if (isPctField && percentCount >= 3 && !hasTinyValue) {
        return filtered.slice(0, 2);
      }

      // Example to reject: "70 ±2" should not become A=70, B=2.
      if (hasTinyValue) {
        const principal = filtered.find((n) => Math.abs(n) > 5);
        return Number.isFinite(principal) ? [principal] : [filtered[0]];
      }

      return [filtered[0]];
    }

    if (hasRangeToken) {
      // Two side-by-side ranges should keep both starts as A/B values.
      if (rangeMatchCount >= 2) {
        return filtered.slice(0, 2);
      }
      return [filtered[0]];
    }
  }

  return filtered.slice(0, 2);
}

function extractColumnNumericCandidate(chunk) {
  const raw = String(chunk || '').trim();
  if (!raw) return null;

  const toleranceMain = raw.match(
    /([<>≤≥~]?\s*-?\d+(?:[.,]\d+)?)\s*(?:\+\/-|\+-|±)\s*-?\d+(?:[.,]\d+)?/i
  );
  if (toleranceMain) {
    const val = toPlainNumber(toleranceMain[1]);
    if (Number.isFinite(val)) return val;
  }

  // Ignore temperature markers (e.g. 25°C) when looking for property values.
  const cleaned = raw
    .replace(/\b(?:at\s*)?-?\d+(?:[.,]\d+)?\s*°\s*[CF]\b/gi, ' ')
    .replace(/\b(?:at\s*)?-?\d+(?:[.,]\d+)?\s*deg\.?\s*[CF]\b/gi, ' ');

  const rangeStart = cleaned.match(
    /([<>≤≥~]?\s*-?\d+(?:[.,]\d+)?)\s*(?:-|–|—|to)\s*-?\d+(?:[.,]\d+)?/i
  );
  if (rangeStart) {
    const val = toPlainNumber(rangeStart[1]);
    if (Number.isFinite(val)) return val;
  }

  const first = cleaned.match(/([<>≤≥~]?\s*-?\d+(?:[.,]\d+)?)/);
  if (!first) return null;
  return toPlainNumber(first[1]);
}

function extractTwoColumnBySchema(rawText, paramDefs = []) {
  const componentA = {};
  const componentB = {};

  if (!rawText || !Array.isArray(paramDefs) || !paramDefs.length) {
    return { componentA, componentB };
  }

  const lines = String(rawText).split(/\r?\n/);

  paramDefs.forEach((def) => {
    if (!def?.field_key || !def?.label) return;
    if (def.field_type === 'json_array') return;

    const labelRegexes = buildLabelRegex(def.label);
    let matchedLine = null;
    let matchedLineIndex = -1;
    let labelEndIndex = 0;
    let fallbackMatch = null;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
      const line = lines[lineIdx];
      let matched = false;
      let matchEndIndex = 0;
      for (const labelRe of labelRegexes) {
        const m = labelRe.exec(line);
        if (!m) continue;
        matchEndIndex = (m.index || 0) + (String(m[0] || '').length);
        matched = true;
        break;
      }
      if (!matched) continue;

      if (!fallbackMatch) {
        fallbackMatch = { line, lineIdx, matchEndIndex };
      }

      const numericProbe = [line, lines[lineIdx + 1], lines[lineIdx + 2]]
        .filter(Boolean)
        .join(' ');
      const numericCount = (numericProbe.match(/[-+]?\d+(?:[.,]\d+)?/g) || []).length;
      if (numericCount >= 2) {
        matchedLine = line;
        matchedLineIndex = lineIdx;
        labelEndIndex = matchEndIndex;
        break;
      }
    }

    if (!matchedLine && fallbackMatch) {
      matchedLine = fallbackMatch.line;
      matchedLineIndex = fallbackMatch.lineIdx;
      labelEndIndex = fallbackMatch.matchEndIndex;
    }

    if (!matchedLine) return;

    let afterLabel = String(matchedLine)
      .slice(labelEndIndex)
      .replace(/^[\s:=\-]+/, '')
      .trim();

    // Some PDFs put units/continuation text on the label line and values on following lines.
    if ((!afterLabel || !/\d/.test(afterLabel)) && matchedLineIndex >= 0) {
      const lookAhead = [];
      for (let i = matchedLineIndex + 1; i < Math.min(lines.length, matchedLineIndex + 5); i += 1) {
        const nextLine = normalizeText(lines[i]);
        if (!nextLine) continue;

        // Stop when we reach the next obvious label row.
        if (/:\s*$/.test(nextLine) || (/:[^\d]*$/.test(nextLine) && lookAhead.length > 0)) break;

        lookAhead.push(nextLine);
        if (lookAhead.length >= 2) break;
      }
      afterLabel = [afterLabel, ...lookAhead].filter(Boolean).join(' ').trim();
    }

    if (!afterLabel) return;

    const columnParts = afterLabel
      .split(/\s{2,}|\t+|\s*\|\s*/)
      .map((v) => normalizeText(v))
      .filter(Boolean);

    // Text fields (e.g. Appearance, Carrying Solvent, Functionality): pick first two
    // non-numeric column tokens. Skip if both columns collapse to the same token unless
    // the source clearly has two distinct cells.
    if (def.field_type === 'text') {
      const textParts = columnParts.filter((p) => p && !/^[<>≤≥~]?\s*-?\d+(?:[.,]\d+)?\s*[%a-zA-Z\u00B0\u00B2\u00B3\/]*$/i.test(p));
      if (textParts.length >= 2) {
        componentA[def.field_key] = textParts[0];
        componentB[def.field_key] = textParts[1];
      } else if (textParts.length === 1 && columnParts.length >= 2) {
        // Repeated value across both columns (e.g. "Clear to slightly hazy" in both).
        componentA[def.field_key] = textParts[0];
        componentB[def.field_key] = textParts[0];
      }
      return;
    }

    if (columnParts.length >= 2) {
      const columnNumbers = columnParts
        .map((part) => extractColumnNumericCandidate(part))
        .filter((n) => Number.isFinite(n));

      const selectedColumns = selectTwoNumericCandidates(columnNumbers, def, afterLabel);
      if (selectedColumns.length >= 2) {
        componentA[def.field_key] = selectedColumns[0];
        componentB[def.field_key] = selectedColumns[1];
        return;
      }
    }

    const rangeStarts = Array.from(
      afterLabel.matchAll(/([<>≤≥~]?\s*-?\d+(?:[.,]\d+)?)\s*(?:-|–|—|to)\s*-?\d+(?:[.,]\d+)?/gi)
    )
      .map((m) => toPlainNumber(m[1]))
      .filter((n) => Number.isFinite(n));

    if (rangeStarts.length >= 2) {
      const selectedRanges = selectTwoNumericCandidates(rangeStarts.slice(0, 2), def, afterLabel);
      if (selectedRanges.length >= 2) {
        componentA[def.field_key] = selectedRanges[0];
        componentB[def.field_key] = selectedRanges[1];
        return;
      }
    }

    const numericTokens = Array.from(afterLabel.matchAll(/[-+]?\d+(?:[.,]\d+)?/g))
      .map((m) => toPlainNumber(m[0]))
      .filter((n) => Number.isFinite(n));

    const selected = selectTwoNumericCandidates(numericTokens, def, afterLabel);
    if (selected.length >= 2) {
      componentA[def.field_key] = selected[0];
      componentB[def.field_key] = selected[1];
    }
  });

  return { componentA, componentB };
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function hasNonEmptyValue(v) {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  return true;
}

function validateNonResinParameters(materialClass, rawParameters, context = {}, rulesOverride = null, options = {}) {
  const enforceRequired = options?.enforceRequired !== false;
  const { profile, rules } = rulesOverride || getNonResinParamRules(materialClass, context);
  const ruleMap = new Map(rules.map((r) => [r.key, r]));
  const params = isPlainObject(rawParameters) ? rawParameters : {};
  const errors = [];
  const normalized = {};

  Object.keys(params).forEach((key) => {
    const rule = ruleMap.get(key);
    if (!rule) {
      errors.push(`Unknown parameter: ${key}`);
      return;
    }

    const raw = params[key];
    if (!hasNonEmptyValue(raw)) return;

    if (rule.type === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        errors.push(`${rule.label} must be a number`);
        return;
      }
      if (rule.min !== undefined && n < rule.min) {
        errors.push(`${rule.label} must be at least ${rule.min}`);
      }
      if (rule.max !== undefined && n > rule.max) {
        errors.push(`${rule.label} must be at most ${rule.max}`);
      }
      normalized[key] = n;
      return;
    }

    // Shrink curve: array of {temp_c, md_pct, td_pct}
    if (rule.type === 'json_array') {
      const arr = Array.isArray(raw) ? raw : (typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null);
      if (!arr || !Array.isArray(arr)) {
        if (hasNonEmptyValue(raw)) errors.push(`${rule.label} must be an array`);
        return;
      }
      if (arr.length > 20) {
        errors.push(`${rule.label} must have at most 20 data points`);
        return;
      }
      const validPoints = [];
      arr.forEach((pt, i) => {
        if (!isPlainObject(pt)) { errors.push(`${rule.label}[${i}] must be an object`); return; }
        const temp = Number(pt.temp_c);
        const md = Number(pt.md_pct);
        const td = Number(pt.td_pct);
        if (!Number.isFinite(temp) || temp < 30 || temp > 200) { errors.push(`${rule.label}[${i}].temp_c invalid`); return; }
        if (!Number.isFinite(md) || md < 0 || md > 100) { errors.push(`${rule.label}[${i}].md_pct invalid`); return; }
        if (!Number.isFinite(td) || td < 0 || td > 100) { errors.push(`${rule.label}[${i}].td_pct invalid`); return; }
        validPoints.push({ temp_c: temp, md_pct: md, td_pct: td });
      });
      if (validPoints.length) normalized[key] = validPoints;
      return;
    }

    if (rule.type === 'json') {
      let obj = null;
      if (isPlainObject(raw)) obj = raw;
      else if (typeof raw === 'string') {
        try { obj = JSON.parse(raw); } catch { obj = null; }
      }
      if (!isPlainObject(obj)) {
        errors.push(`${rule.label} must be an object`);
        return;
      }

      if (key === 'composition_limits') {
        const clean = {};
        Object.entries(obj).forEach(([element, limits]) => {
          const symbol = String(element || '').trim();
          if (!symbol) return;
          if (!isPlainObject(limits)) {
            errors.push(`${rule.label}.${symbol} must contain min/max values`);
            return;
          }
          const min = hasNonEmptyValue(limits.min) ? Number(limits.min) : null;
          const max = hasNonEmptyValue(limits.max) ? Number(limits.max) : null;
          if (min !== null && !Number.isFinite(min)) errors.push(`${rule.label}.${symbol}.min must be a number`);
          if (max !== null && !Number.isFinite(max)) errors.push(`${rule.label}.${symbol}.max must be a number`);
          if (Number.isFinite(min) || Number.isFinite(max)) {
            clean[symbol] = {
              ...(Number.isFinite(min) ? { min } : {}),
              ...(Number.isFinite(max) ? { max } : {}),
            };
          }
        });
        if (Object.keys(clean).length) normalized[key] = clean;
        return;
      }

      normalized[key] = obj;
      return;
    }

    const text = String(raw).trim();
    if (!text) return;

    if (rule.maxLength && text.length > rule.maxLength) {
      errors.push(`${rule.label} must be at most ${rule.maxLength} characters`);
    }
    if (rule.pattern && !rule.pattern.test(text)) {
      errors.push(rule.patternMessage || `${rule.label} format is invalid`);
    }
    if (Array.isArray(rule.enumOptions) && rule.enumOptions.length) {
      const lc = text.toLowerCase();
      const match = rule.enumOptions.find((opt) => String(opt).toLowerCase() === lc);
      if (!match) {
        errors.push(`${rule.label} must be one of: ${rule.enumOptions.join(', ')}`);
      } else {
        normalized[key] = match; // canonical casing
        return;
      }
    }
    normalized[key] = text;
  });

  if (enforceRequired) {
    rules.forEach((rule) => {
      if (rule.required && !hasNonEmptyValue(params[rule.key])) {
        errors.push(`${rule.label} is required`);
      }
    });
  }

  return {
    parameterProfile: profile,
    valid: errors.length === 0,
    errors,
    normalized,
  };
}

module.exports = function (router) {

  // ─── Helper: resolve spec table name from mes_category_mapping ──────────
  const SPEC_TABLE_WHITELIST = ['mes_spec_substrates','mes_spec_adhesives','mes_spec_chemicals','mes_spec_additives','mes_spec_coating','mes_spec_packing_materials','mes_spec_mounting_tapes'];
  async function getSpecTable(materialClass) {
    const { rows } = await pool.query(
      `SELECT spec_table FROM mes_category_mapping WHERE material_class = $1 AND is_active = true AND spec_table IS NOT NULL LIMIT 1`,
      [materialClass]
    );
    const table = rows[0]?.spec_table;
    if (table && SPEC_TABLE_WHITELIST.includes(table)) return table;
    return null; // fallback to old table
  }

  // ─── Helper: persist a parsed/uploaded TDS PDF into mes_tds_attachments ──
  // Moves the multer-temp file under uploads/tds/<class>/<mainitem>/<supplier>/<ts>_<sha8>.pdf,
  // marks any prior current version for the same (mainitem, supplier_id) as is_current=false,
  // then INSERTs a row tagged with version_no = max+1.
  // Returns the inserted row, or null on any non-fatal error (logged).
  // tempPath is unlinked on caller's behalf if we succeed in moving; left in place if move fails.
  async function persistTdsAttachment({
    tempPath,
    originalName,
    mimeType,
    materialClass,
    parameterProfile,
    mainitem,
    maindescription,
    catlinedesc,
    supplierId,
    supplierNameRaw,
    parsedExtractJson,
    parseStatus,
    uploadedBy,
  }) {
    if (!tempPath || !fs.existsSync(tempPath)) return null;
    const safeMainitem = String(mainitem || maindescription || 'unassigned')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '_')
      .slice(0, 60) || 'unassigned';
    const safeClass = String(materialClass || 'unknown')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .slice(0, 40) || 'unknown';
    const supplierBucket = supplierId ? String(supplierId) : 'unassigned';

    let buf;
    try {
      buf = fs.readFileSync(tempPath);
    } catch (e) {
      logger.warn('persistTdsAttachment: read failed: %s', e.message);
      return null;
    }
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    const sha8 = sha256.slice(0, 8);
    const ts = Date.now();
    const ext = (path.extname(originalName) || '.pdf').toLowerCase();
    const safeBase = String(originalName || 'tds')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(-80);
    const fileName = `${ts}_${sha8}${ext === '.pdf' ? '.pdf' : ext}`;

    const targetDir = path.join(uploadDir, safeClass, safeMainitem, supplierBucket);
    const targetAbs = path.join(targetDir, fileName);
    try {
      fs.mkdirSync(targetDir, { recursive: true });
      fs.renameSync(tempPath, targetAbs);
    } catch (e) {
      try { fs.copyFileSync(tempPath, targetAbs); fs.unlinkSync(tempPath); }
      catch (e2) {
        logger.warn('persistTdsAttachment: move failed: %s', e2.message);
        return null;
      }
    }

    const relPath = path.relative(path.join(__dirname, '..', '..', '..'), targetAbs).replace(/\\/g, '/');
    const fileSize = buf.length;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Mark prior current as not-current for same (material_class, mainitem, supplier_id)
      await client.query(
        `UPDATE mes_tds_attachments
            SET is_current = false
          WHERE material_class = $1
            AND mainitem IS NOT DISTINCT FROM $2
            AND supplier_id IS NOT DISTINCT FROM $3
            AND is_current = true
            AND deleted_at IS NULL`,
        [materialClass, mainitem || null, supplierId || null]
      );
      // Compute next version_no for this (class, mainitem, supplier)
      const { rows: vRow } = await client.query(
        `SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version
           FROM mes_tds_attachments
          WHERE material_class = $1
            AND mainitem IS NOT DISTINCT FROM $2
            AND supplier_id IS NOT DISTINCT FROM $3`,
        [materialClass, mainitem || null, supplierId || null]
      );
      const versionNo = vRow[0].next_version;

      // Some legacy NOT NULL columns to satisfy: file_path, file_name. updated_at column may not exist.
      const insertCols = [
        'file_name', 'file_path', 'file_type', 'file_size', 'uploaded_by',
        'material_class', 'parameter_profile', 'mainitem', 'maindescription', 'catlinedesc',
        'supplier_id', 'supplier_name_raw', 'sha256', 'mime_type',
        'version_no', 'is_current', 'parse_status', 'parsed_extract_json',
      ];
      const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(',');
      const params = [
        originalName || fileName,
        relPath,
        ext.replace(/^\./, '') || 'pdf',
        fileSize,
        uploadedBy || null,
        materialClass,
        parameterProfile || null,
        mainitem || null,
        maindescription || null,
        catlinedesc || null,
        supplierId || null,
        supplierNameRaw || null,
        sha256,
        mimeType || 'application/pdf',
        versionNo,
        true,
        parseStatus || 'parsed',
        parsedExtractJson ? JSON.stringify(parsedExtractJson) : null,
      ];
      const { rows } = await client.query(
        `INSERT INTO mes_tds_attachments (${insertCols.join(',')})
         VALUES (${placeholders})
         RETURNING id, version_no, is_current, sha256, file_name, file_path, file_size, uploaded_at,
                   supplier_id, supplier_name_raw, parse_status`,
        params
      );
      await client.query('COMMIT');
      return rows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      logger.error('persistTdsAttachment INSERT failed: %s', e.message);
      return null;
    } finally {
      client.release();
    }
  }

  async function loadExistingNonResinSpec(materialClass, materialKey) {
    const normalizedClass = normalizeMaterialKey(materialClass);
    const normalizedKey = normalizeMaterialKey(materialKey);
    if (!normalizedClass || !normalizedKey) {
      return { parameters_json: {}, user_locked_fields: [] };
    }

    const specTable = await getSpecTable(normalizedClass);
    if (specTable) {
      const r = await pool.query(
        `SELECT material_key, mainitem, maindescription, catlinedesc, mainunit, parameters_json, user_locked_fields
         FROM ${specTable}
         WHERE material_key = $1
         LIMIT 1`,
        [normalizedKey]
      );
      if (r.rows[0]) {
        return {
          ...r.rows[0],
          supplier_name: null,
          status: null,
          notes: null,
          parameters_json: r.rows[0].parameters_json || {},
          user_locked_fields: r.rows[0].user_locked_fields || [],
        };
      }
    }

    const legacy = await pool.query(
      `SELECT material_key, mainitem, maindescription, catlinedesc, mainunit, supplier_name, status, notes, parameters_json, user_locked_fields
       FROM mes_non_resin_material_specs
       WHERE material_class = $1 AND material_key = $2
       LIMIT 1`,
      [normalizedClass, normalizedKey]
    );

    if (legacy.rows[0]) {
      return {
        ...legacy.rows[0],
        parameters_json: legacy.rows[0].parameters_json || {},
        user_locked_fields: legacy.rows[0].user_locked_fields || [],
      };
    }

    return { parameters_json: {}, user_locked_fields: [] };
  }

  async function upsertCategorySpecificSpec(db, specTable, payload) {
    const {
      materialClass, materialKey, mainItem, mainDescription, catLineDesc, mainUnit,
      parameters, notes, status, fieldsToLock, supplierName, userId, lockFields,
      parameterProfile,
    } = payload;

    const isSubstratesTable = specTable === 'mes_spec_substrates' || specTable === 'mes_spec_films';
    const compositionLimits = isSubstratesTable && isPlainObject(parameters?.composition_limits)
      ? parameters.composition_limits
      : null;

    const cols = [
      'material_key', 'mainitem', 'maindescription', 'catlinedesc', 'mainunit',
      'parameters_json', 'notes', 'status', 'user_locked_fields', 'supplier_name',
      'created_by', 'updated_by',
    ];
    const vals = [
      materialKey,
      mainItem || null,
      mainDescription || null,
      catLineDesc || null,
      mainUnit || null,
      JSON.stringify(parameters || {}),
      notes,
      status,
      fieldsToLock,
      supplierName,
      userId,
      userId,
    ];

    if (isSubstratesTable) {
      cols.push('substrate_profile');
      vals.push(parameterProfile && parameterProfile !== materialClass
        ? String(parameterProfile).replace(/^substrates_/, '')
        : null);
      cols.push('composition_limits');
      vals.push(compositionLimits ? JSON.stringify(compositionLimits) : null);
    }

    const placeholders = cols.map((col, i) => {
      const cast = col === 'parameters_json' || col === 'composition_limits'
        ? '::jsonb'
        : (col === 'user_locked_fields' ? '::text[]' : '');
      return `$${i + 1}${cast}`;
    }).join(',');

    vals.push(!!lockFields);
    const lockParam = vals.length;

    const setClauses = [
      'mainitem = EXCLUDED.mainitem',
      'maindescription = EXCLUDED.maindescription',
      'catlinedesc = EXCLUDED.catlinedesc',
      'mainunit = EXCLUDED.mainunit',
      'parameters_json = EXCLUDED.parameters_json',
      'notes = EXCLUDED.notes',
      'status = EXCLUDED.status',
      'supplier_name = EXCLUDED.supplier_name',
      `user_locked_fields = CASE
         WHEN $${lockParam}::boolean THEN ARRAY(
           SELECT DISTINCT unnest(COALESCE(${specTable}.user_locked_fields, '{}'::text[]) || EXCLUDED.user_locked_fields)
         )
         ELSE ${specTable}.user_locked_fields
       END`,
      'updated_by = EXCLUDED.updated_by',
      'updated_at = NOW()',
    ];
    if (isSubstratesTable) {
      setClauses.push('substrate_profile = EXCLUDED.substrate_profile');
      setClauses.push('composition_limits = EXCLUDED.composition_limits');
    }

    const { rows } = await db.query(
      `INSERT INTO ${specTable} (${cols.join(',')})
       VALUES (${placeholders})
       ON CONFLICT (material_key) DO UPDATE SET
         ${setClauses.join(',\n         ')}
       RETURNING '${materialClass}' AS material_class, *`,
      vals
    );
    return rows[0];
  }

  async function findNonResinTargetCandidates(materialClass, code) {
    const normalizedClass = normalizeMaterialKey(materialClass);
    const normalizedCode = normalizeText(code);
    if (!normalizedCode) return [];

    const like = `%${normalizedCode}%`;
    const { rows } = await pool.query(
      `SELECT
         LOWER(TRIM(r.mainitem)) AS item_key,
         MAX(r.mainitem) AS mainitem,
         MAX(NULLIF(TRIM(r.maindescription), '')) AS maindescription,
         MAX(NULLIF(TRIM(r.catlinedesc), '')) AS catlinedesc,
         MAX(NULLIF(TRIM(r.mainunit), '')) AS mainunit
       FROM fp_actualrmdata r
       WHERE COALESCE(TRIM(r.mainitem), '') <> ''
         AND (
           LOWER(TRIM(r.mainitem)) = LOWER(TRIM($1))
           OR r.mainitem ILIKE $2
           OR COALESCE(r.maindescription, '') ILIKE $2
         )
         AND (
           $3::text IS NULL
           OR EXISTS (
             SELECT 1
             FROM mes_category_mapping m
             WHERE m.is_active = true
               AND UPPER(TRIM(m.oracle_category)) = UPPER(TRIM(r.category))
               AND LOWER(TRIM(m.material_class)) = LOWER(TRIM($3))
           )
         )
       GROUP BY LOWER(TRIM(r.mainitem))
       ORDER BY
         CASE WHEN LOWER(TRIM(MAX(r.mainitem))) = LOWER(TRIM($1)) THEN 0 ELSE 1 END,
         MAX(r.mainitem)
       LIMIT 12`,
      [normalizedCode, like, normalizedClass || null]
    );

    return rows.map((row) => ({
      item_key: normalizeMaterialKey(row.item_key),
      mainitem: normalizeText(row.mainitem),
      maindescription: normalizeText(row.maindescription) || null,
      catlinedesc: normalizeText(row.catlinedesc) || null,
      mainunit: normalizeText(row.mainunit) || null,
    }));
  }

  function chooseDefaultNonResinTarget(candidates, fallbackMainitem, detectedCode) {
    const list = Array.isArray(candidates) ? candidates : [];
    if (!list.length) return null;

    const normalizedDetected = normalizeMaterialKey(detectedCode);
    const normalizedFallback = normalizeMaterialKey(fallbackMainitem);

    if (normalizedDetected) {
      const exactDetected = list.find(
        (row) => normalizeMaterialKey(row.mainitem) === normalizedDetected
      );
      if (exactDetected) return exactDetected;
    }

    if (normalizedFallback) {
      const exactFallback = list.find(
        (row) => normalizeMaterialKey(row.mainitem) === normalizedFallback
      );
      if (exactFallback) return exactFallback;
    }

    return list[0] || null;
  }

  // ─── GET /tds — List TDS records with filters ────────────────────────────
  router.get('/tds', authenticate, async (req, res) => {
    try {
      const { category, cat_desc, supplier_id, resin_type, status, search, source_only, live_rm_only } = req.query;
      const params = [];
      const conditions = [];
      let p = 1;

      if (category) { conditions.push(`t.category = $${p++}`); params.push(category); }
      if (cat_desc) { conditions.push(`t.cat_desc = $${p++}`); params.push(cat_desc); }
      if (supplier_id) { conditions.push(`t.supplier_id = $${p++}`); params.push(parseInt(supplier_id, 10)); }
      if (resin_type) { conditions.push(`t.resin_type = $${p++}`); params.push(resin_type); }
      if (status) { conditions.push(`t.status = $${p++}`); params.push(status); }
      if (source_only === 'true') {
        conditions.push(`COALESCE(TRIM(t.source_name), '') <> ''`);
        conditions.push(`LOWER(TRIM(t.source_name)) <> 'resin_library.html'`);
      }
      if (live_rm_only === 'true') {
        conditions.push(`EXISTS (
          SELECT 1
          FROM fp_actualrmdata r
          WHERE COALESCE(TRIM(r.maindescription), '') <> ''
            AND (
              (
                COALESCE(TRIM(t.oracle_item_code), '') <> ''
                AND LOWER(TRIM(r.mainitem)) = LOWER(TRIM(t.oracle_item_code))
              )
              OR LOWER(REGEXP_REPLACE(COALESCE(r.maindescription, ''), '\\s+', '', 'g'))
                 = LOWER(REGEXP_REPLACE(COALESCE(t.brand_grade, ''), '\\s+', '', 'g'))
            )
        )`);
      }
      if (search) {
        conditions.push(`(t.brand_grade ILIKE $${p} OR t.oracle_item_code ILIKE $${p} OR s.name ILIKE $${p} OR t.material_code ILIKE $${p})`);
        params.push(`%${search}%`);
        p++;
      }

      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

      const sql = `
        SELECT t.*, s.name AS supplier_name, s.country AS supplier_country
        FROM mes_material_tds t
        LEFT JOIN mes_suppliers s ON s.id = t.supplier_id
        ${where}
        ORDER BY t.cat_desc, t.brand_grade
      `;

      const { rows } = await pool.query(sql, params);
      res.json({ success: true, data: rows, count: rows.length });
    } catch (err) {
      logger.error('GET /tds error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch TDS records' });
    }
  });

  // ─── GET /tds/category-mapping — Fetch mes_category_mapping table ────────
  // Returns all active mappings. Frontend uses this to build tabs dynamically.
  // Falls back to hardcoded list if table doesn't exist yet (migration not run).
  router.get('/tds/category-mapping', authenticate, async (req, res) => {
    try {
      const includeInactive = String(req.query.include_inactive || '').toLowerCase() === 'true';
      const { rows } = await pool.query(`
        SELECT
          m.id,
          m.oracle_category,
          m.material_class,
          m.display_label,
          m.has_parameters,
          m.is_active,
          m.sort_order,
          m.spec_table,
          COUNT(DISTINCT LOWER(TRIM(r.mainitem)))::INT AS item_count
        FROM mes_category_mapping m
        LEFT JOIN fp_actualrmdata r
          ON UPPER(TRIM(r.category)) = m.oracle_category
          AND COALESCE(TRIM(r.mainitem), '') <> ''
        ${includeInactive ? '' : 'WHERE m.is_active = true'}
        GROUP BY m.id, m.oracle_category, m.material_class, m.display_label, m.has_parameters, m.is_active, m.sort_order, m.spec_table
        ORDER BY m.sort_order ASC, m.display_label ASC
      `);
      res.json({ success: true, data: rows, count: rows.length });
    } catch (err) {
      logger.error('GET /tds/category-mapping error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch category mapping' });
    }
  });

  // ─── GET /tds/unmapped-categories — Phase 9: Oracle categories not yet mapped ─
  // Returns rows inserted by detectUnmappedCategories() after each RM sync.
  // Admin UI surfaces these with a red badge so a human can assign material_class.
  router.get('/tds/unmapped-categories', authenticate, async (req, res) => {
    try {
      const { listUnmappedCategories } = require('../../../utils/mes-unmapped-categories');
      const rows = await listUnmappedCategories();
      res.json({ success: true, data: rows, count: rows.length });
    } catch (err) {
      logger.error('GET /tds/unmapped-categories error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch unmapped categories' });
    }
  });

  // ─── Phase 8 — Admin CRUD on mes_category_mapping ────────────────────────
  // Admin-only (per plan §8). Audit logged.
  function isAdminUser(user) {
    return user?.role === 'admin' || user?.role === 'it_admin';
  }

  // POST /tds/category-mapping — create new mapping
  router.post('/tds/category-mapping', authenticate, async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return res.status(403).json({ success: false, error: 'Admin only' });
      const b = req.body || {};
      const oracleCat = String(b.oracle_category || '').trim();
      const matClass = String(b.material_class || '').trim().toLowerCase();
      const label = String(b.display_label || oracleCat).trim();
      if (!oracleCat || !matClass) {
        return res.status(400).json({ success: false, error: 'oracle_category and material_class required' });
      }
      const dup = await pool.query('SELECT id FROM mes_category_mapping WHERE oracle_category=$1', [oracleCat]);
      if (dup.rows.length) return res.status(409).json({ success: false, error: `oracle_category '${oracleCat}' already exists` });
      const { rows } = await pool.query(`
        INSERT INTO mes_category_mapping
          (oracle_category, material_class, display_label, has_parameters, is_active, sort_order, spec_table)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          oracleCat, matClass, label,
          b.has_parameters !== false,
          b.is_active !== false,
          b.sort_order != null ? Number(b.sort_order) : 99,
          b.spec_table || null,
        ]
      );
      await recordSchemaAdminChange('category_mapping', 'create', req, null, rows[0]);
      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('POST /tds/category-mapping error:', err);
      res.status(500).json({ success: false, error: 'Failed to create category mapping' });
    }
  });

  // PATCH /tds/category-mapping/:id — edit mapping (used for unmapped → mapped, label rename, toggle active)
  router.patch('/tds/category-mapping/:id', authenticate, async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return res.status(403).json({ success: false, error: 'Admin only' });
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
      const before = await pool.query('SELECT * FROM mes_category_mapping WHERE id=$1', [id]);
      if (!before.rows.length) return res.status(404).json({ success: false, error: 'Not found' });
      const b = req.body || {};
      const sets = [];
      const vals = [];
      const add = (col, v) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
      if (b.material_class !== undefined) add('material_class', String(b.material_class).trim().toLowerCase());
      if (b.display_label !== undefined) add('display_label', String(b.display_label).trim());
      if (b.has_parameters !== undefined) add('has_parameters', !!b.has_parameters);
      if (b.is_active !== undefined) add('is_active', !!b.is_active);
      if (b.sort_order !== undefined) add('sort_order', Number(b.sort_order));
      if (b.spec_table !== undefined) add('spec_table', b.spec_table || null);
      if (!sets.length) return res.status(400).json({ success: false, error: 'No fields to update' });
      sets.push('updated_at=NOW()');
      vals.push(id);
      const { rows } = await pool.query(
        `UPDATE mes_category_mapping SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`,
        vals
      );
      await recordSchemaAdminChange('category_mapping', 'update', req, before.rows[0], rows[0]);
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('PATCH /tds/category-mapping/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to update category mapping' });
    }
  });

  // DELETE /tds/category-mapping/:id — soft delete (set is_active=false)
  router.delete('/tds/category-mapping/:id', authenticate, async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return res.status(403).json({ success: false, error: 'Admin only' });
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
      const before = await pool.query('SELECT * FROM mes_category_mapping WHERE id=$1', [id]);
      if (!before.rows.length) return res.status(404).json({ success: false, error: 'Not found' });
      const { rows } = await pool.query(
        `UPDATE mes_category_mapping SET is_active=false, updated_at=NOW() WHERE id=$1 RETURNING *`,
        [id]
      );
      await recordSchemaAdminChange('category_mapping', 'delete', req, before.rows[0], rows[0]);
      res.json({ success: true, data: rows[0], soft_deleted: true });
    } catch (err) {
      logger.error('DELETE /tds/category-mapping/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete category mapping' });
    }
  });

  // GET /tds/schema-audit — admin: recent schema changes
  // Query params: entity_type, action, actor_email (substring), since (ISO),
  // until (ISO), limit (max 500, default 100), offset (default 0).
  // Returns { data, count, total } where total is the unfiltered match count.
  router.get('/tds/schema-audit', authenticate, async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return res.status(403).json({ success: false, error: 'Admin only' });
      const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
      const entityType = req.query.entity_type ? String(req.query.entity_type) : null;
      const action = req.query.action ? String(req.query.action) : null;
      const actorEmail = req.query.actor_email ? String(req.query.actor_email).trim() : null;
      const since = req.query.since ? String(req.query.since) : null;
      const until = req.query.until ? String(req.query.until) : null;
      const conds = [];
      const params = [];
      if (entityType) { params.push(entityType); conds.push(`entity_type = $${params.length}`); }
      if (action) { params.push(action); conds.push(`action = $${params.length}`); }
      if (actorEmail) { params.push(`%${actorEmail}%`); conds.push(`actor_email ILIKE $${params.length}`); }
      if (since) { params.push(since); conds.push(`created_at >= $${params.length}`); }
      if (until) { params.push(until); conds.push(`created_at <= $${params.length}`); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      const totalRes = await pool.query(`SELECT COUNT(*)::int AS c FROM mes_schema_admin_audit ${where}`, params);
      params.push(limit);
      const limitParam = `$${params.length}`;
      params.push(offset);
      const offsetParam = `$${params.length}`;
      const { rows } = await pool.query(
        `SELECT id, entity_type, entity_id, action, actor_id, actor_email, actor_role,
                diff_summary, created_at
         FROM mes_schema_admin_audit
         ${where}
         ORDER BY created_at DESC
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
        params
      );
      res.json({ success: true, data: rows, count: rows.length, total: totalRes.rows[0].c });
    } catch (err) {
      logger.error('GET /tds/schema-audit error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch audit log' });
    }
  });

  // ─── GET /tds/parameter-definitions — Fetch parameter schemas from DB ───
  router.get('/tds/parameter-definitions', authenticate, async (req, res) => {
    try {
      const materialClass = String(req.query.material_class || '').trim().toLowerCase();
      const profile = req.query.profile ? String(req.query.profile).trim().toLowerCase() : null;

      let sql = `SELECT * FROM mes_parameter_definitions WHERE 1=1`;
      const params = [];
      if (materialClass) {
        params.push(materialClass);
        sql += ` AND material_class = $${params.length}`;
      }
      if (profile) {
        params.push(profile);
        sql += ` AND profile = $${params.length}`;
      }
      sql += ' ORDER BY material_class, profile NULLS FIRST, sort_order ASC';

      const { rows } = await pool.query(sql, params);
      res.json({ success: true, data: rows, count: rows.length });
    } catch (err) {
      logger.error('GET /tds/parameter-definitions error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch parameter definitions' });
    }
  });

  // ─── POST /tds/parameter-definitions — Create a new parameter definition ─
  router.post('/tds/parameter-definitions', authenticate, async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return res.status(403).json({ success: false, error: 'Admin only' });
      const b = req.body || {};
      const matClass = String(b.material_class || '').trim().toLowerCase();
      const profile = b.profile ? String(b.profile).trim().toLowerCase() : null;
      let fieldKey = String(b.field_key || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const label = String(b.label || '').trim();
      if (!matClass || !label) return res.status(400).json({ success: false, error: 'material_class and label are required' });
      // Auto-generate field_key from label if not provided
      if (!fieldKey) fieldKey = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      // Check uniqueness
      const existing = await pool.query(
        `SELECT id FROM mes_parameter_definitions WHERE material_class=$1 AND field_key=$2 AND (($3::text IS NULL AND profile IS NULL) OR profile=$3)`,
        [matClass, fieldKey, profile]
      );
      if (existing.rows.length) return res.status(409).json({ success: false, error: `field_key '${fieldKey}' already exists for this class/profile` });
      const { rows } = await pool.query(`
        INSERT INTO mes_parameter_definitions
          (material_class, profile, field_key, label, unit, field_type, step, min_value, max_value, max_length,
           is_required, sort_order, is_core, display_width, display_group, display_row, placeholder, help_text,
            has_test_method, test_method_options, enum_options)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        RETURNING *`,
        [matClass, profile, fieldKey, label,
         b.unit || null, b.field_type || 'number',
         b.step != null ? Number(b.step) : null,
         b.min_value != null ? Number(b.min_value) : null,
         b.max_value != null ? Number(b.max_value) : null,
         b.max_length != null ? Number(b.max_length) : null,
         !!b.is_required,
         b.sort_order != null ? Number(b.sort_order) : 999,
         b.is_core !== false,
         b.display_width || 8,
         b.display_group || null,
         b.display_row != null ? Number(b.display_row) : null,
         b.placeholder || null,
         b.help_text || null,
         !!b.has_test_method,
         Array.isArray(b.test_method_options) ? b.test_method_options : [],
         Array.isArray(b.enum_options) ? b.enum_options : null,
        ]
      );
      await recordSchemaAdminChange('parameter_definition', 'create', req, null, rows[0]);
      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('POST /tds/parameter-definitions error:', err);
      res.status(500).json({ success: false, error: 'Failed to create parameter definition' });
    }
  });

  // ─── PUT /tds/parameter-definitions/reorder — Bulk reorder ──────────────
  router.put('/tds/parameter-definitions/reorder', authenticate, async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return res.status(403).json({ success: false, error: 'Admin only' });
      const { order } = req.body || {};
      if (!Array.isArray(order) || !order.length) return res.status(400).json({ success: false, error: 'order array required' });
      const client = await pool.connect();
      let beforeRows = [];
      let afterRows = [];
      try {
        await client.query('BEGIN');
        const ids = order.map((item) => Number(item.id)).filter(Number.isFinite);
        if (ids.length) {
          const before = await client.query('SELECT * FROM mes_parameter_definitions WHERE id = ANY($1::int[]) ORDER BY id', [ids]);
          beforeRows = before.rows;
        }
        for (const item of order) {
          if (!item.id || item.sort_order == null) continue;
          await client.query('UPDATE mes_parameter_definitions SET sort_order=$1, updated_at=NOW() WHERE id=$2', [Number(item.sort_order), Number(item.id)]);
        }
        if (ids.length) {
          const after = await client.query('SELECT * FROM mes_parameter_definitions WHERE id = ANY($1::int[]) ORDER BY id', [ids]);
          afterRows = after.rows;
        }
        await client.query('COMMIT');
        await recordSchemaAdminChange('parameter_definition', 'reorder', req, { items: beforeRows }, { items: afterRows });
        res.json({ success: true, updated: order.length });
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
    } catch (err) {
      logger.error('PUT /tds/parameter-definitions/reorder error:', err);
      res.status(500).json({ success: false, error: 'Failed to reorder' });
    }
  });

  // ─── POST /tds/parameter-definitions/copy-profile — Copy profile ────────
  router.post('/tds/parameter-definitions/copy-profile', authenticate, async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return res.status(403).json({ success: false, error: 'Admin only' });
      const { source_material_class, source_profile, target_material_class, target_profile, force } = req.body || {};
      if (!source_material_class || !target_material_class || !target_profile) {
        return res.status(400).json({ success: false, error: 'source_material_class, target_material_class, target_profile required' });
      }
      const src = await pool.query(
        `SELECT * FROM mes_parameter_definitions WHERE material_class=$1 AND (($2::text IS NULL AND profile IS NULL) OR profile=$2) ORDER BY sort_order`,
        [source_material_class, source_profile || null]
      );
      if (!src.rows.length) return res.status(404).json({ success: false, error: 'Source profile has no definitions' });
      const existing = await pool.query(
        `SELECT COUNT(*) FROM mes_parameter_definitions WHERE material_class=$1 AND profile=$2`,
        [target_material_class, target_profile]
      );
      if (parseInt(existing.rows[0].count) > 0 && !force) {
        return res.status(409).json({ success: false, error: 'Target profile already has definitions. Use force=true to overwrite.' });
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (force) await client.query('DELETE FROM mes_parameter_definitions WHERE material_class=$1 AND profile=$2', [target_material_class, target_profile]);
        for (const row of src.rows) {
          await client.query(`
            INSERT INTO mes_parameter_definitions
              (material_class, profile, field_key, label, unit, field_type, step, min_value, max_value, max_length,
               is_required, sort_order, is_core, display_width, display_group, display_row, placeholder, help_text,
               has_test_method, test_method_options, enum_options)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
          `, [target_material_class, target_profile, row.field_key, row.label, row.unit, row.field_type,
              row.step, row.min_value, row.max_value, row.max_length, row.is_required, row.sort_order,
              row.is_core, row.display_width, row.display_group, row.display_row, row.placeholder,
              row.help_text, row.has_test_method, row.test_method_options, row.enum_options]);
        }
        await client.query('COMMIT');
        await recordSchemaAdminChange('parameter_definition', 'copy_profile', req, null, {
          source_material_class, source_profile: source_profile || null,
          target_material_class, target_profile, copied: src.rows.length,
        });
        res.json({ success: true, copied: src.rows.length });
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
    } catch (err) {
      logger.error('POST /tds/parameter-definitions/copy-profile error:', err);
      res.status(500).json({ success: false, error: 'Failed to copy profile' });
    }
  });

  // ─── PUT/PATCH /tds/parameter-definitions/:id - Update a parameter definition
  const updateParameterDefinition = async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return res.status(403).json({ success: false, error: 'Admin only' });
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
      const b = req.body || {};
      const sets = [];
      const vals = [];
      const addField = (col, val) => { vals.push(val); sets.push(`${col}=$${vals.length}`); };
      if (b.label !== undefined) addField('label', String(b.label).trim());
      if (b.unit !== undefined) addField('unit', b.unit || null);
      if (b.field_type !== undefined) addField('field_type', b.field_type);
      if (b.step !== undefined) addField('step', b.step != null ? Number(b.step) : null);
      if (b.min_value !== undefined) addField('min_value', b.min_value != null ? Number(b.min_value) : null);
      if (b.max_value !== undefined) addField('max_value', b.max_value != null ? Number(b.max_value) : null);
      if (b.max_length !== undefined) addField('max_length', b.max_length != null ? Number(b.max_length) : null);
      if (b.is_required !== undefined) addField('is_required', !!b.is_required);
      if (b.sort_order !== undefined) addField('sort_order', Number(b.sort_order));
      if (b.is_core !== undefined) addField('is_core', !!b.is_core);
      if (b.display_width !== undefined) addField('display_width', Number(b.display_width) || 8);
      if (b.display_group !== undefined) addField('display_group', b.display_group || null);
      if (b.display_row !== undefined) addField('display_row', b.display_row != null ? Number(b.display_row) : null);
      if (b.placeholder !== undefined) addField('placeholder', b.placeholder || null);
      if (b.help_text !== undefined) addField('help_text', b.help_text || null);
      if (b.has_test_method !== undefined) addField('has_test_method', !!b.has_test_method);
      if (b.test_method_options !== undefined) addField('test_method_options', Array.isArray(b.test_method_options) ? b.test_method_options : []);
      if (b.enum_options !== undefined) addField('enum_options', Array.isArray(b.enum_options) ? b.enum_options : null);
      if (b.param_type !== undefined) addField('param_type', b.param_type || 'input');
      if (b.test_conditions !== undefined) addField('test_conditions', b.test_conditions || null);
      if (!sets.length) return res.status(400).json({ success: false, error: 'No fields to update' });
      const beforeRow = await pool.query('SELECT * FROM mes_parameter_definitions WHERE id=$1', [id]);
      sets.push(`updated_at=NOW()`);
      vals.push(id);
      const { rows } = await pool.query(`UPDATE mes_parameter_definitions SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });
      await recordSchemaAdminChange('parameter_definition', 'update', req, beforeRow.rows[0] || null, rows[0]);
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('PUT /tds/parameter-definitions/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to update parameter definition' });
    }
  };

  router.put('/tds/parameter-definitions/:id', authenticate, updateParameterDefinition);
  router.patch('/tds/parameter-definitions/:id', authenticate, updateParameterDefinition);

  // ─── DELETE /tds/parameter-definitions/:id — Delete a parameter definition
  router.delete('/tds/parameter-definitions/:id', authenticate, async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return res.status(403).json({ success: false, error: 'Admin only' });
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
      // Get field_key to count affected specs
      const def = await pool.query('SELECT field_key, material_class FROM mes_parameter_definitions WHERE id=$1', [id]);
      if (!def.rows.length) return res.status(404).json({ success: false, error: 'Not found' });
      const { field_key, material_class } = def.rows[0];
      // Count specs that have data for this field
      let affectedCount = 0;
      try {
        const specTable = await getSpecTable(material_class);
        if (specTable) {
          const cnt = await pool.query(`SELECT COUNT(*) FROM ${specTable} WHERE parameters_json ? $1`, [field_key]);
          affectedCount = parseInt(cnt.rows[0].count);
        }
      } catch { /* ignore */ }
      const beforeFull = await pool.query('SELECT * FROM mes_parameter_definitions WHERE id=$1', [id]);
      await pool.query('DELETE FROM mes_parameter_definitions WHERE id=$1', [id]);
      await recordSchemaAdminChange('parameter_definition', 'delete', req, beforeFull.rows[0] || null, null);
      res.json({ success: true, affected_specs: affectedCount });
    } catch (err) {
      logger.error('DELETE /tds/parameter-definitions/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete parameter definition' });
    }
  });

  // ─── GET /tds/parameter-definitions/:id/usage — Where-used impact report ─
  // Returns a count of spec rows that have data for this field plus up to 10
  // sample mainitems with their current values. Useful before edits/deletes.
  router.get('/tds/parameter-definitions/:id/usage', authenticate, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
      const def = await pool.query('SELECT field_key, material_class, profile FROM mes_parameter_definitions WHERE id=$1', [id]);
      if (!def.rows.length) return res.status(404).json({ success: false, error: 'Not found' });
      const { field_key, material_class, profile } = def.rows[0];
      let count = 0;
      let samples = [];
      let specTable = null;
      try {
        specTable = await getSpecTable(material_class);
        if (specTable) {
          const cnt = await pool.query(`SELECT COUNT(*) FROM ${specTable} WHERE parameters_json ? $1`, [field_key]);
          count = parseInt(cnt.rows[0].count) || 0;
          const sm = await pool.query(
            `SELECT mainitem, parameters_json->>$1 AS value, updated_at
             FROM ${specTable}
             WHERE parameters_json ? $1
             ORDER BY updated_at DESC NULLS LAST
             LIMIT 10`,
            [field_key]
          );
          samples = sm.rows;
        }
      } catch (e) { logger.warn('usage probe failed', { err: e.message }); }
      res.json({ success: true, field_key, material_class, profile, spec_table: specTable, count, samples });
    } catch (err) {
      logger.error('GET /tds/parameter-definitions/:id/usage error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch usage' });
    }
  });

  // ─── PATCH /tds/parameter-definitions/bulk — Apply same update to many ──
  // Body: { ids:[...], updates:{ ...allowed columns... } }. Atomic + audited.
  router.patch('/tds/parameter-definitions/bulk', authenticate, async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return res.status(403).json({ success: false, error: 'Admin only' });
      const { ids, updates } = req.body || {};
      if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ success: false, error: 'ids[] required' });
      if (!updates || typeof updates !== 'object') return res.status(400).json({ success: false, error: 'updates object required' });
      const allowed = ['unit', 'field_type', 'step', 'min_value', 'max_value', 'max_length',
        'is_required', 'is_core', 'display_width', 'display_group', 'display_row',
        'placeholder', 'help_text', 'has_test_method', 'test_method_options', 'enum_options',
        'param_type', 'test_conditions', 'sort_order'];
      const sets = [];
      const vals = [];
      for (const k of allowed) {
        if (updates[k] === undefined) continue;
        const v = updates[k];
        if (k === 'is_required' || k === 'is_core' || k === 'has_test_method') vals.push(!!v);
        else if (['step', 'min_value', 'max_value', 'max_length', 'display_width', 'display_row', 'sort_order'].includes(k)) vals.push(v != null && v !== '' ? Number(v) : null);
        else if (k === 'test_method_options' || k === 'enum_options') vals.push(Array.isArray(v) ? v : null);
        else vals.push(v == null || v === '' ? null : v);
        sets.push(`${k}=$${vals.length}`);
      }
      if (!sets.length) return res.status(400).json({ success: false, error: 'No valid fields to update' });
      const numericIds = ids.map(Number).filter(Number.isFinite);
      if (!numericIds.length) return res.status(400).json({ success: false, error: 'No valid ids' });
      const client = await pool.connect();
      let beforeRows = [];
      let afterRows = [];
      try {
        await client.query('BEGIN');
        const before = await client.query('SELECT * FROM mes_parameter_definitions WHERE id = ANY($1::int[])', [numericIds]);
        beforeRows = before.rows;
        vals.push(numericIds);
        const sql = `UPDATE mes_parameter_definitions SET ${sets.join(',')}, updated_at=NOW() WHERE id = ANY($${vals.length}::int[]) RETURNING *`;
        const after = await client.query(sql, vals);
        afterRows = after.rows;
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
      const beforeMap = new Map(beforeRows.map(r => [r.id, r]));
      for (const row of afterRows) {
        await recordSchemaAdminChange('parameter_definition', 'bulk_update', req, beforeMap.get(row.id) || null, row);
      }
      res.json({ success: true, updated: afterRows.length, data: afterRows });
    } catch (err) {
      logger.error('PATCH /tds/parameter-definitions/bulk error:', err);
      res.status(500).json({ success: false, error: 'Failed bulk update' });
    }
  });

  // ─── POST /tds/parameter-definitions/import — Import JSON (merge|replace) ─
  // Body: { data: [...defs] | { categories:[...] }, mode?: 'merge'|'replace', dry_run?: boolean }
  // Dry-run returns a plan (to_create/update/delete + conflicts) without writing.
  router.post('/tds/parameter-definitions/import', authenticate, async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return res.status(403).json({ success: false, error: 'Admin only' });
      const { data, mode, dry_run } = req.body || {};
      let defs = [];
      if (Array.isArray(data)) defs = data;
      else if (data && Array.isArray(data.categories)) {
        defs = data.categories.flatMap(c => (c.parameters || []).map(p => ({
          ...p, material_class: c.material_class, profile: c.profile || null,
        })));
      } else return res.status(400).json({ success: false, error: 'data must be array or {categories:[...]}' });

      const importMode = mode === 'replace' ? 'replace' : 'merge';
      const isDry = !!dry_run;
      const plan = { to_create: 0, to_update: 0, to_delete: 0, conflicts: [], by_class: {} };

      // Pre-load existing rows for every (material_class, profile) referenced
      const scope = new Set();
      defs.forEach(d => scope.add(`${(d.material_class || '').toLowerCase()}|${(d.profile || '').toLowerCase()}`));
      const scopeRows = [];
      for (const k of scope) {
        const [mc, pr] = k.split('|');
        if (!mc) continue;
        const r = await pool.query(
          `SELECT * FROM mes_parameter_definitions WHERE material_class=$1 AND (($2=''::text AND profile IS NULL) OR profile=$2)`,
          [mc, pr]
        );
        scopeRows.push(...r.rows);
      }
      const existingByKey = new Map(scopeRows.map(r => [`${r.material_class}|${r.profile || ''}|${r.field_key}`, r]));

      const wanted = new Set();
      for (const d of defs) {
        const mc = String(d.material_class || '').toLowerCase();
        const pr = d.profile ? String(d.profile).toLowerCase() : null;
        const fk = String(d.field_key || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
        if (!mc || !d.label || !fk) {
          plan.conflicts.push({ field_key: fk, reason: 'missing material_class/label/field_key' });
          continue;
        }
        const key = `${mc}|${pr || ''}|${fk}`;
        wanted.add(key);
        if (existingByKey.has(key)) plan.to_update++;
        else plan.to_create++;
        plan.by_class[mc] = (plan.by_class[mc] || 0) + 1;
      }
      if (importMode === 'replace') {
        for (const k of existingByKey.keys()) if (!wanted.has(k)) plan.to_delete++;
      }
      if (isDry) return res.json({ success: true, dry_run: true, mode: importMode, plan });

      const client = await pool.connect();
      let created = 0, updated = 0, deleted = 0;
      try {
        await client.query('BEGIN');
        if (importMode === 'replace') {
          for (const [k, row] of existingByKey.entries()) {
            if (!wanted.has(k)) {
              await client.query('DELETE FROM mes_parameter_definitions WHERE id=$1', [row.id]);
              await recordSchemaAdminChange('parameter_definition', 'import_delete', req, row, null);
              deleted++;
            }
          }
        }
        for (const d of defs) {
          const mc = String(d.material_class || '').toLowerCase();
          const pr = d.profile ? String(d.profile).toLowerCase() : null;
          const fk = String(d.field_key || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
          if (!mc || !d.label || !fk) continue;
          const key = `${mc}|${pr || ''}|${fk}`;
          const existing = existingByKey.get(key);
          const cols = {
            unit: d.unit ?? null,
            field_type: d.field_type || 'number',
            step: d.step != null ? Number(d.step) : null,
            min_value: d.min_value != null ? Number(d.min_value) : null,
            max_value: d.max_value != null ? Number(d.max_value) : null,
            max_length: d.max_length != null ? Number(d.max_length) : null,
            is_required: !!d.is_required,
            sort_order: d.sort_order != null ? Number(d.sort_order) : 999,
            is_core: d.is_core !== false,
            display_width: d.display_width || 8,
            display_group: d.display_group || null,
            display_row: d.display_row != null ? Number(d.display_row) : null,
            placeholder: d.placeholder || null,
            help_text: d.help_text || null,
            has_test_method: !!d.has_test_method,
            test_method_options: Array.isArray(d.test_method_options) ? d.test_method_options : [],
            enum_options: Array.isArray(d.enum_options) ? d.enum_options : null,
          };
          if (existing) {
            const { rows: u } = await client.query(`UPDATE mes_parameter_definitions SET
                label=$1, unit=$2, field_type=$3, step=$4, min_value=$5, max_value=$6, max_length=$7,
                is_required=$8, sort_order=$9, is_core=$10, display_width=$11, display_group=$12,
                display_row=$13, placeholder=$14, help_text=$15, has_test_method=$16,
                test_method_options=$17, enum_options=$18, updated_at=NOW()
                WHERE id=$19 RETURNING *`,
              [d.label, cols.unit, cols.field_type, cols.step, cols.min_value, cols.max_value, cols.max_length,
                cols.is_required, cols.sort_order, cols.is_core, cols.display_width, cols.display_group,
                cols.display_row, cols.placeholder, cols.help_text, cols.has_test_method,
                cols.test_method_options, cols.enum_options, existing.id]);
            await recordSchemaAdminChange('parameter_definition', 'import_update', req, existing, u[0]);
            updated++;
          } else {
            const { rows: c } = await client.query(`INSERT INTO mes_parameter_definitions
                (material_class, profile, field_key, label, unit, field_type, step, min_value, max_value, max_length,
                 is_required, sort_order, is_core, display_width, display_group, display_row, placeholder, help_text,
                 has_test_method, test_method_options, enum_options)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
              [mc, pr, fk, d.label, cols.unit, cols.field_type, cols.step, cols.min_value, cols.max_value,
                cols.max_length, cols.is_required, cols.sort_order, cols.is_core, cols.display_width,
                cols.display_group, cols.display_row, cols.placeholder, cols.help_text, cols.has_test_method,
                cols.test_method_options, cols.enum_options]);
            await recordSchemaAdminChange('parameter_definition', 'import_create', req, null, c[0]);
            created++;
          }
        }
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
      res.json({ success: true, mode: importMode, created, updated, deleted, conflicts: plan.conflicts });
    } catch (err) {
      logger.error('POST /tds/parameter-definitions/import error:', err);
      res.status(500).json({ success: false, error: err.message || 'Import failed' });
    }
  });

  // ─── POST /tds/schema-audit/:id/revert — Restore from audit snapshot ────
  // Re-applies before_json: UPDATE if row still exists, INSERT (with original
  // id) if it was deleted. Logged as a new audit row with action='revert'.
  router.post('/tds/schema-audit/:id/revert', authenticate, async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return res.status(403).json({ success: false, error: 'Admin only' });
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
      const { rows } = await pool.query('SELECT * FROM mes_schema_admin_audit WHERE id=$1', [id]);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Audit row not found' });
      const audit = rows[0];
      if (audit.entity_type !== 'parameter_definition') {
        return res.status(400).json({ success: false, error: 'Only parameter_definition reverts are supported' });
      }
      const before = typeof audit.before_json === 'string' ? JSON.parse(audit.before_json) : audit.before_json;
      if (!before || !before.id) return res.status(400).json({ success: false, error: 'Before snapshot missing — cannot revert' });
      const { id: defId, created_at, updated_at, ...cols } = before;
      const colNames = Object.keys(cols);
      const colVals = colNames.map(k => cols[k]);
      const existing = await pool.query('SELECT * FROM mes_parameter_definitions WHERE id=$1', [defId]);
      let restored;
      if (existing.rows.length) {
        const sets = colNames.map((c, i) => `${c}=$${i + 1}`).join(',');
        colVals.push(defId);
        const u = await pool.query(`UPDATE mes_parameter_definitions SET ${sets}, updated_at=NOW() WHERE id=$${colVals.length} RETURNING *`, colVals);
        restored = u.rows[0];
      } else {
        const placeholders = colNames.map((_, i) => `$${i + 1}`).join(',');
        colVals.push(defId);
        const i = await pool.query(`INSERT INTO mes_parameter_definitions (${colNames.join(',')}, id) VALUES (${placeholders}, $${colVals.length}) RETURNING *`, colVals);
        restored = i.rows[0];
        try { await pool.query(`SELECT setval(pg_get_serial_sequence('mes_parameter_definitions','id'), GREATEST((SELECT MAX(id) FROM mes_parameter_definitions), 1))`); } catch { /* ignore */ }
      }
      await recordSchemaAdminChange('parameter_definition', 'revert', req, existing.rows[0] || null, restored);
      res.json({ success: true, data: restored, from_audit_id: id });
    } catch (err) {
      logger.error('POST /tds/schema-audit/:id/revert error:', err);
      res.status(500).json({ success: false, error: err.message || 'Revert failed' });
    }
  });

  // ─── GET /tds/schema-lint — Admin: schema integrity issues ──────────────
  // Surfaces duplicate labels, invalid field_type, missing units on numerics,
  // enum_options on non-text, has_test_method without options, min>max, etc.
  router.get('/tds/schema-lint', authenticate, async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return res.status(403).json({ success: false, error: 'Admin only' });
      const { rows } = await pool.query('SELECT * FROM mes_parameter_definitions');
      const allowedTypes = new Set(['number', 'text', 'json', 'json_array']);
      const issues = [];
      const labelMap = new Map();
      for (const r of rows) {
        const lk = `${r.material_class}|${r.profile || ''}|${(r.label || '').toLowerCase().trim()}`;
        if (!labelMap.has(lk)) labelMap.set(lk, []);
        labelMap.get(lk).push(r);
        if (!allowedTypes.has(r.field_type)) {
          issues.push({ id: r.id, field_key: r.field_key, material_class: r.material_class, profile: r.profile, severity: 'error', issue: `Invalid field_type "${r.field_type}" (allowed: ${[...allowedTypes].join(', ')})` });
        }
        if (r.field_type === 'number' && r.min_value != null && r.max_value != null && Number(r.min_value) > Number(r.max_value)) {
          issues.push({ id: r.id, field_key: r.field_key, material_class: r.material_class, profile: r.profile, severity: 'error', issue: `min_value (${r.min_value}) > max_value (${r.max_value})` });
        }
        if (r.field_type === 'number' && !r.unit) {
          issues.push({ id: r.id, field_key: r.field_key, material_class: r.material_class, profile: r.profile, severity: 'warn', issue: 'Numeric field has no unit' });
        }
        if (Array.isArray(r.enum_options) && r.enum_options.length && r.field_type !== 'text') {
          issues.push({ id: r.id, field_key: r.field_key, material_class: r.material_class, profile: r.profile, severity: 'warn', issue: `enum_options set but field_type is "${r.field_type}" (only text supports enums)` });
        }
        if (r.has_test_method && (!Array.isArray(r.test_method_options) || !r.test_method_options.length)) {
          issues.push({ id: r.id, field_key: r.field_key, material_class: r.material_class, profile: r.profile, severity: 'info', issue: 'has_test_method=true but no test_method_options listed' });
        }
      }
      for (const [, list] of labelMap) {
        if (list.length > 1) {
          issues.push({ id: list[0].id, severity: 'warn', issue: `Duplicate label "${list[0].label}" — ids: ${list.map(r => r.id).join(',')}`, field_key: list.map(r => r.field_key).join(','), material_class: list[0].material_class, profile: list[0].profile });
        }
      }
      const sevRank = { error: 0, warn: 1, info: 2 };
      issues.sort((a, b) => (sevRank[a.severity] || 9) - (sevRank[b.severity] || 9));
      res.json({ success: true, count: issues.length, issues });
    } catch (err) {
      logger.error('GET /tds/schema-lint error:', err);
      res.status(500).json({ success: false, error: 'Failed schema lint' });
    }
  });

  // ─── GET /tds/live-material-categories — Raw DB CATEGORY values ─────────
  // Now uses mes_category_mapping JOIN instead of hardcoded CASE/LIKE patterns.
  router.get('/tds/live-material-categories', authenticate, async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          TRIM(r.category) AS category,
          COALESCE(m.material_class, 'unclassified') AS material_class,
          COALESCE(m.display_label, TRIM(r.category)) AS display_label,
          COALESCE(m.has_parameters, false) AS has_parameters,
          COUNT(DISTINCT LOWER(TRIM(r.mainitem)))::INT AS item_count
        FROM fp_actualrmdata r
        LEFT JOIN mes_category_mapping m
          ON m.oracle_category = UPPER(TRIM(r.category)) AND m.is_active = true
        WHERE COALESCE(TRIM(r.mainitem), '') <> ''
          AND COALESCE(TRIM(r.category), '') <> ''
        GROUP BY TRIM(r.category), m.material_class, m.display_label, m.has_parameters
        ORDER BY item_count DESC, category ASC
      `);
      res.json({ success: true, data: rows, count: rows.length });
    } catch (err) {
      logger.error('GET /tds/live-material-categories error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch live material categories' });
    }
  });

  // ─── GET /tds/live-materials — Live RM items from DB (no remapping) ────
  router.get('/tds/live-materials', authenticate, async (req, res) => {
    try {
      const materialClass = String(req.query.material_class || '').trim().toLowerCase();
      const rawCategory = normalizeText(req.query.category);
      const search = String(req.query.search || '').trim();
      const parsedLimit = parseInt(req.query.limit, 10);
      const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 10000)) : 5000;

      // DB-driven category lookup — replaces hardcoded LIKE patterns
      const likeSearch = search ? `%${search}%` : '';
      const queryParams = [];
      let whereClause;

      if (rawCategory) {
        queryParams.push(rawCategory.toUpperCase());
        whereClause = `UPPER(TRIM(COALESCE(r.category, ''))) = $${queryParams.length}`;
      } else {
        if (!LIVE_MATERIAL_CLASS_KEYS.includes(materialClass)) {
          return res.status(400).json({
            success: false,
            error: `Either category or material_class is required. material_class must be one of: ${LIVE_MATERIAL_CLASS_KEYS.join(', ')}`,
          });
        }
        // Fetch oracle_categories from mes_category_mapping — no hardcoded LIKE patterns
        const mappingResult = await pool.query(
          `SELECT oracle_category FROM mes_category_mapping WHERE material_class = $1 AND is_active = true`,
          [materialClass]
        );
        if (!mappingResult.rows.length) {
          return res.json({ success: true, data: [], count: 0, summary: {} });
        }
        const oracleCategories = mappingResult.rows.map((r) => r.oracle_category);
        queryParams.push(oracleCategories);
        whereClause = `UPPER(TRIM(COALESCE(r.category, ''))) = ANY($${queryParams.length})`;
      }

      queryParams.push(likeSearch);
      const searchParam = `$${queryParams.length}`;
      queryParams.push(limit);
      const limitParam = `$${queryParams.length}`;

      const sql = `
        WITH filtered AS (
          SELECT
            r.id,
            r.division,
            r.warehouse,
            r.itemgroup,
            r.category,
            r.catlinedesc,
            r.maindescription,
            r.mainitem,
            r.mainunit,
            r.material,
            r.standards,
            r.sizes,
            (
              SELECT m.material_class
              FROM mes_category_mapping m
              WHERE m.oracle_category = UPPER(TRIM(r.category))
                AND m.is_active = true
              ORDER BY m.id DESC
              LIMIT 1
            ) AS mapped_material_class,
            COALESCE(r.mainitemstock, 0) AS stock_qty,
            COALESCE(r.pendingorderqty, 0) AS pending_qty,
            COALESCE(r.maincost, 0) AS stock_cost,
            COALESCE(r.purchaseprice, 0) AS purchase_cost,
            CASE
              WHEN COALESCE(r.mainitemstock, 0) > 0 AND COALESCE(r.maincost, 0) > 0
                THEN COALESCE(r.maincost, 0)
              ELSE NULL
            END AS weighted_avg_cost,
            1::INT AS source_rows
          FROM fp_actualrmdata r
          WHERE ${whereClause}
            AND COALESCE(TRIM(mainitem), '') <> ''
            AND (
              ${searchParam} = ''
              OR mainitem ILIKE ${searchParam}
              OR maindescription ILIKE ${searchParam}
              OR itemgroup ILIKE ${searchParam}
              OR catlinedesc ILIKE ${searchParam}
              OR category ILIKE ${searchParam}
            )
        ),
        summary AS (
          SELECT COALESCE(JSON_OBJECT_AGG(s.category, s.item_count), '{}'::json) AS summary_json
          FROM (
            SELECT
              TRIM(r.category) AS category,
              COUNT(DISTINCT LOWER(TRIM(r.mainitem)))::INT AS item_count
            FROM fp_actualrmdata r
            WHERE COALESCE(TRIM(r.mainitem), '') <> ''
              AND COALESCE(TRIM(r.category), '') <> ''
            GROUP BY TRIM(r.category)
          ) s
        )
        SELECT
          f.*,
          rs.tds_id AS resin_tds_id,
          rs.tds_status AS resin_status,
          COALESCE(rs.param_filled, 0)::INT AS resin_param_filled,
          COALESCE(rs.param_total, 14)::INT AS resin_param_total,
          COALESCE(rs.attachment_count, 0)::INT AS resin_attachment_count,
          COALESCE(NULLIF(TRIM(rs.supplier_name), ''), NULLIF(TRIM(nrs.supplier_name), '')) AS supplier_name,
          nrs.status AS non_resin_status,
          COALESCE(nrs.parameters_json, '{}'::jsonb) AS non_resin_parameters_json,
          COALESCE(nra.attachment_count, 0)::INT AS non_resin_attachment_count,
          nra.last_tds_at AS last_tds_at,
          s.summary_json
        FROM filtered f
        LEFT JOIN LATERAL (
          SELECT
            t.id AS tds_id,
            t.status AS tds_status,
            s.name AS supplier_name,
            (
              (CASE WHEN t.mfr_190_2_16 IS NOT NULL THEN 1 ELSE 0 END) +
              (CASE WHEN t.mfr_190_5_0 IS NOT NULL THEN 1 ELSE 0 END) +
              (CASE WHEN t.hlmi_190_21_6 IS NOT NULL THEN 1 ELSE 0 END) +
              (CASE WHEN t.mfr_230_2_16_pp IS NOT NULL THEN 1 ELSE 0 END) +
              (CASE WHEN t.melt_flow_ratio IS NOT NULL THEN 1 ELSE 0 END) +
              (CASE WHEN t.density IS NOT NULL THEN 1 ELSE 0 END) +
              (CASE WHEN t.crystalline_melting_point IS NOT NULL THEN 1 ELSE 0 END) +
              (CASE WHEN t.vicat_softening_point IS NOT NULL THEN 1 ELSE 0 END) +
              (CASE WHEN t.heat_deflection_temp IS NOT NULL THEN 1 ELSE 0 END) +
              (CASE WHEN t.tensile_strength_break IS NOT NULL THEN 1 ELSE 0 END) +
              (CASE WHEN t.elongation_break IS NOT NULL THEN 1 ELSE 0 END) +
              (CASE WHEN t.brittleness_temp IS NOT NULL THEN 1 ELSE 0 END) +
              (CASE WHEN t.bulk_density IS NOT NULL THEN 1 ELSE 0 END) +
              (CASE WHEN t.flexural_modulus IS NOT NULL THEN 1 ELSE 0 END)
            )::INT AS param_filled,
            14::INT AS param_total,
            (
              SELECT COUNT(*)::INT
              FROM mes_tds_attachments a
              WHERE a.tds_id = t.id
            ) AS attachment_count
          FROM mes_material_tds t
          LEFT JOIN mes_suppliers s ON s.id = t.supplier_id
          WHERE (
              COALESCE(TRIM(f.mainitem), '') <> ''
              AND LOWER(TRIM(COALESCE(t.oracle_item_code, ''))) = LOWER(TRIM(COALESCE(f.mainitem, '')))
            )
            OR LOWER(REGEXP_REPLACE(COALESCE(t.brand_grade, ''), '\\s+', '', 'g'))
               = LOWER(REGEXP_REPLACE(COALESCE(f.maindescription, ''), '\\s+', '', 'g'))
          ORDER BY
            CASE
              WHEN COALESCE(TRIM(f.mainitem), '') <> ''
                AND LOWER(TRIM(COALESCE(t.oracle_item_code, ''))) = LOWER(TRIM(COALESCE(f.mainitem, '')))
                THEN 0
              ELSE 1
            END,
            t.updated_at DESC NULLS LAST,
            t.id DESC
          LIMIT 1
        ) rs ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            n.status,
            n.supplier_name,
            n.parameters_json
          FROM mes_non_resin_material_specs n
          WHERE (
              n.material_key = LOWER(TRIM(COALESCE(f.mainitem, '')))
              OR (
                COALESCE(TRIM(f.mainitem), '') = ''
                AND n.material_key = LOWER(TRIM(COALESCE(f.maindescription, '')))
              )
            )
            AND (
              COALESCE(NULLIF(LOWER(TRIM(f.mapped_material_class)), ''), '') = ''
              OR LOWER(TRIM(COALESCE(n.material_class, ''))) = LOWER(TRIM(COALESCE(f.mapped_material_class, '')))
            )
          ORDER BY n.updated_at DESC NULLS LAST, n.id DESC
          LIMIT 1
        ) nrs ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::INT AS attachment_count,
            MAX(a.uploaded_at) AS last_tds_at
          FROM mes_tds_attachments a
          WHERE a.deleted_at IS NULL
            AND a.is_current = true
            AND COALESCE(TRIM(f.mainitem), '') <> ''
            AND a.mainitem = TRIM(f.mainitem)
            AND (
              COALESCE(NULLIF(LOWER(TRIM(f.mapped_material_class)), ''), '') = ''
              OR LOWER(TRIM(COALESCE(a.material_class, ''))) = LOWER(TRIM(COALESCE(f.mapped_material_class, '')))
            )
        ) nra ON TRUE
        CROSS JOIN summary s
        ORDER BY LOWER(TRIM(COALESCE(f.mainitem, ''))), f.id
        LIMIT ${limitParam}
      `;

      const { rows } = await pool.query(sql, queryParams);
      const summary = rows.length ? rows[0].summary_json || {} : {};
      const data = rows.map(({ summary_json, ...rest }) => rest);

      res.json({ success: true, data, count: data.length, summary });
    } catch (err) {
      logger.error('GET /tds/live-materials error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch live material rows' });
    }
  });

  // ─── GET /tds/non-resin-spec — Read one non-resin material spec ─────────
  router.get('/tds/non-resin-spec', authenticate, async (req, res) => {
    try {
      const materialClass = normalizeText(req.query.material_class).toLowerCase();
      const mainItem = normalizeText(req.query.mainitem);
      const mainDescription = normalizeText(req.query.maindescription);
      const catLineDesc = normalizeText(req.query.catlinedesc);

      if (!NON_RESIN_MATERIAL_CLASS_KEYS.includes(materialClass)) {
        return res.status(400).json({
          success: false,
          error: `material_class is required and must be one of: ${NON_RESIN_MATERIAL_CLASS_KEYS.join(', ')}`,
        });
      }

      const identity = mainItem || mainDescription;
      if (!identity) {
        return res.status(400).json({ success: false, error: 'mainitem or maindescription is required' });
      }

      const requestedProfile = resolveNonResinParamProfile(materialClass, {
        mainitem: mainItem,
        maindescription: mainDescription,
        catlinedesc: catLineDesc,
      });

      const materialKey = normalizeMaterialKey(identity);

      // Try new category-specific table first, fallback to legacy
      const specTable = await getSpecTable(materialClass);
      let rows;
      if (specTable) {
        const result = await pool.query(
          `SELECT id, '${materialClass}' as material_class, material_key, mainitem, maindescription,
                  catlinedesc, mainunit, parameters_json, notes, status, user_locked_fields,
                  updated_at, updated_by
           FROM ${specTable} WHERE material_key = $1 LIMIT 1`,
          [materialKey]
        );
        rows = result.rows;
      }
      if (!rows || !rows.length) {
        const result = await pool.query(
          `SELECT id, material_class, material_key, mainitem, maindescription,
                  catlinedesc, mainunit, parameters_json, notes, status, user_locked_fields,
                  updated_at, updated_by
           FROM mes_non_resin_material_specs
           WHERE material_class = $1 AND material_key = $2 LIMIT 1`,
          [materialClass, materialKey]
        );
        rows = result.rows;
      }

      if (!rows.length) {
        return res.json({
          success: true,
          data: {
            material_class: materialClass,
            material_key: materialKey,
            mainitem: mainItem || null,
            maindescription: mainDescription || null,
            catlinedesc: catLineDesc || null,
            parameters_json: {},
            notes: null,
            status: 'draft',
            user_locked_fields: [],
            source: 'default',
            parameter_profile: requestedProfile,
          },
        });
      }

      const spec = rows[0];
      const resolvedProfile = resolveNonResinParamProfile(materialClass, {
        mainitem: spec.mainitem,
        maindescription: spec.maindescription,
        catlinedesc: spec.catlinedesc,
      });

      return res.json({
        success: true,
        data: {
          ...spec,
          parameters_json: spec.parameters_json || {},
          user_locked_fields: spec.user_locked_fields || [],
          source: 'db',
          parameter_profile: resolvedProfile,
        },
      });
    } catch (err) {
      if (err.code === '42P01') {
        return res.status(500).json({
          success: false,
          error: 'mes_non_resin_material_specs table not found. Run migration mes-master-022 first.',
        });
      }
      logger.error('GET /tds/non-resin-spec error:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch non-resin spec' });
    }
  });

  // ─── PUT /tds/non-resin-spec — Upsert one non-resin material spec ───────
  router.put('/tds/non-resin-spec', authenticate, async (req, res) => {
    try {
      if (!isTdsWriter(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });

      const b = req.body || {};
      const materialClass = normalizeText(b.material_class).toLowerCase();
      const mainItem = normalizeText(b.mainitem);
      const mainDescription = normalizeText(b.maindescription);
      const catLineDesc = normalizeText(b.catlinedesc);
      const mainUnit = normalizeText(b.mainunit);
      const notes = b.notes === undefined ? null : (b.notes === null ? null : String(b.notes));
      const supplierName = b.supplier_name ? String(b.supplier_name).trim().slice(0, 200) : null;
      const status = normalizeText(b.status).toLowerCase() || 'draft';
      const parameters = b.parameters_json === undefined ? b.parameters : b.parameters_json;
      const lockFields = b.lockFields === true;

      if (!NON_RESIN_MATERIAL_CLASS_KEYS.includes(materialClass)) {
        return res.status(400).json({
          success: false,
          error: `material_class is required and must be one of: ${NON_RESIN_MATERIAL_CLASS_KEYS.join(', ')}`,
        });
      }

      const identity = mainItem || mainDescription;
      if (!identity) {
        return res.status(400).json({ success: false, error: 'mainitem or maindescription is required' });
      }
      if (!isPlainObject(parameters || {})) {
        return res.status(400).json({ success: false, error: 'parameters_json must be an object' });
      }
      if (!NON_RESIN_SPEC_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `status must be one of: ${NON_RESIN_SPEC_STATUSES.join(', ')}`,
        });
      }

      const validation = validateNonResinParameters(materialClass, parameters || {}, {
        mainitem: mainItem,
        maindescription: mainDescription,
        catlinedesc: catLineDesc,
      }, await getParamRulesFromDB(materialClass, { mainitem: mainItem, maindescription: mainDescription, catlinedesc: catLineDesc }));
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: validation.errors[0] || 'Invalid parameter payload',
          errors: validation.errors,
        });
      }

      const materialKey = normalizeMaterialKey(identity);
      const fieldsToLock = lockFields ? Object.keys(validation.normalized || {}) : [];
      const specTable = await getSpecTable(materialClass);
      let savedRow;

      if (specTable) {
        savedRow = await upsertCategorySpecificSpec(pool, specTable, {
          materialClass, materialKey, mainItem, mainDescription, catLineDesc, mainUnit,
          parameters: validation.normalized, notes, status, fieldsToLock, supplierName,
          userId: req.user.id, lockFields, parameterProfile: validation.parameterProfile,
        });
      } else {
        const taxonomyLink = await resolveSubstrateTaxonomyLink(pool, materialClass, catLineDesc);

        const { rows } = await pool.query(
          `INSERT INTO mes_non_resin_material_specs (
             material_class,
             material_key,
             mainitem,
             maindescription,
             catlinedesc,
             mainunit,
             taxonomy_category_id,
             taxonomy_subcategory_id,
             parameters_json,
             notes,
             status,
             user_locked_fields,
             supplier_name,
             created_by,
             updated_by
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::text[],$13,$14,$14)
           ON CONFLICT (material_class, material_key) DO UPDATE
           SET
             mainitem = EXCLUDED.mainitem,
             maindescription = EXCLUDED.maindescription,
             catlinedesc = EXCLUDED.catlinedesc,
             mainunit = EXCLUDED.mainunit,
             taxonomy_category_id = EXCLUDED.taxonomy_category_id,
             taxonomy_subcategory_id = EXCLUDED.taxonomy_subcategory_id,
             parameters_json = EXCLUDED.parameters_json,
             notes = EXCLUDED.notes,
             status = EXCLUDED.status,
             supplier_name = EXCLUDED.supplier_name,
             user_locked_fields = CASE
               WHEN $15::boolean THEN ARRAY(
                 SELECT DISTINCT unnest(COALESCE(mes_non_resin_material_specs.user_locked_fields, '{}'::text[]) || EXCLUDED.user_locked_fields)
               )
               ELSE mes_non_resin_material_specs.user_locked_fields
             END,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()
           RETURNING *`,
          [
            materialClass,
            materialKey,
            mainItem || null,
            mainDescription || null,
            catLineDesc || null,
            mainUnit || null,
            taxonomyLink.taxonomyCategoryId,
            taxonomyLink.taxonomySubcategoryId,
            JSON.stringify(validation.normalized),
            notes,
            status,
            fieldsToLock,
            supplierName,
            req.user.id,
            lockFields,
          ]
        );
        savedRow = rows[0];
      }

      return res.json({
        success: true,
        data: {
          ...savedRow,
          parameters_json: savedRow.parameters_json || {},
          user_locked_fields: savedRow.user_locked_fields || [],
          parameter_profile: validation.parameterProfile,
        },
      });
    } catch (err) {
      if (err.code === '42P01') {
        return res.status(500).json({
          success: false,
          error: 'mes_non_resin_material_specs table not found. Run migration mes-master-022 first.',
        });
      }
      logger.error('PUT /tds/non-resin-spec error:', err);
      return res.status(500).json({ success: false, error: 'Failed to save non-resin spec' });
    }
  });

  // ─── PUT /tds/non-resin-spec/bulk-apply — Apply parsed values to many materials ──
  router.put('/tds/non-resin-spec/bulk-apply', authenticate, async (req, res) => {
    const client = await pool.connect();

    try {
      if (!isTdsWriter(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });

      const b = req.body || {};
      const materialClass = normalizeText(b.material_class).toLowerCase();
      const entries = Array.isArray(b.entries) ? b.entries : [];

      if (!NON_RESIN_MATERIAL_CLASS_KEYS.includes(materialClass)) {
        return res.status(400).json({
          success: false,
          error: `material_class is required and must be one of: ${NON_RESIN_MATERIAL_CLASS_KEYS.join(', ')}`,
        });
      }

      if (!entries.length) {
        return res.status(400).json({ success: false, error: 'entries must be a non-empty array' });
      }

      const specTable = await getSpecTable(materialClass);
      const results = [];

      await client.query('BEGIN');

      for (let idx = 0; idx < entries.length; idx += 1) {
        const entry = entries[idx] || {};
        const entryNo = idx + 1;

        const mainItem = normalizeText(entry.mainitem);
        const mainDescription = normalizeText(entry.maindescription);
        const catLineDesc = normalizeText(entry.catlinedesc);
        const mainUnit = normalizeText(entry.mainunit);
        const extractedParams = isPlainObject(entry.extracted)
          ? entry.extracted
          : (isPlainObject(entry.parameters_json) ? entry.parameters_json : null);
        const lockFields = entry.lockFields !== false;

        const identity = mainItem || mainDescription;
        if (!identity) {
          throw new Error(`[Entry ${entryNo}] mainitem or maindescription is required`);
        }

        if (!isPlainObject(extractedParams || {})) {
          throw new Error(`[Entry ${entryNo}] extracted must be an object`);
        }

        const materialKey = normalizeMaterialKey(identity);

        let existing = null;
        if (specTable) {
          const r = await client.query(
            `SELECT material_key, mainitem, maindescription, catlinedesc, mainunit, parameters_json, user_locked_fields
             FROM ${specTable}
             WHERE material_key = $1
             LIMIT 1`,
            [materialKey]
          );
          existing = r.rows[0]
            ? {
                ...r.rows[0],
                supplier_name: null,
                status: null,
                notes: null,
              }
            : null;
        }

        if (!existing) {
          const legacy = await client.query(
            `SELECT material_key, mainitem, maindescription, catlinedesc, mainunit, supplier_name, status, notes, parameters_json, user_locked_fields
             FROM mes_non_resin_material_specs
             WHERE material_class = $1 AND material_key = $2
             LIMIT 1`,
            [materialClass, materialKey]
          );
          existing = legacy.rows[0] || null;
        }

        const baseParams = isPlainObject(existing?.parameters_json) ? existing.parameters_json : {};
        const mergedParams = { ...baseParams, ...(extractedParams || {}) };

        const status = normalizeText(entry.status || existing?.status || 'draft').toLowerCase() || 'draft';
        if (!NON_RESIN_SPEC_STATUSES.includes(status)) {
          throw new Error(`[Entry ${entryNo}] status must be one of: ${NON_RESIN_SPEC_STATUSES.join(', ')}`);
        }

        const notes = entry.notes === undefined
          ? (existing?.notes ?? null)
          : (entry.notes === null ? null : String(entry.notes));
        const supplierName = entry.supplier_name
          ? String(entry.supplier_name).trim().slice(0, 200)
          : (existing?.supplier_name || null);

        const context = {
          mainitem: mainItem || existing?.mainitem || null,
          maindescription: mainDescription || existing?.maindescription || null,
          catlinedesc: catLineDesc || existing?.catlinedesc || null,
        };

        const rulesOverride = await getParamRulesFromDB(materialClass, context);
        const validation = validateNonResinParameters(
          materialClass,
          mergedParams,
          context,
          rulesOverride,
          { enforceRequired: false }
        );
        if (!validation.valid) {
          throw new Error(`[Entry ${entryNo}] ${validation.errors[0] || 'Invalid parameter payload'}`);
        }

        const normalizedExtractedFields = Object.keys(extractedParams || {})
          .filter((field) => Object.prototype.hasOwnProperty.call(validation.normalized, field));
        const fieldsToLock = lockFields ? normalizedExtractedFields : [];
        let savedRow;
        if (specTable) {
          savedRow = await upsertCategorySpecificSpec(client, specTable, {
            materialClass,
            materialKey,
            mainItem: context.mainitem,
            mainDescription: context.maindescription,
            catLineDesc: context.catlinedesc,
            mainUnit: mainUnit || existing?.mainunit || null,
            parameters: validation.normalized,
            notes,
            status,
            fieldsToLock,
            supplierName,
            userId: req.user.id,
            lockFields,
            parameterProfile: validation.parameterProfile,
          });
        } else {
          const taxonomyLink = await resolveSubstrateTaxonomyLink(client, materialClass, context.catlinedesc);

          const { rows } = await client.query(
            `INSERT INTO mes_non_resin_material_specs (
               material_class,
               material_key,
               mainitem,
               maindescription,
               catlinedesc,
               mainunit,
               taxonomy_category_id,
               taxonomy_subcategory_id,
               parameters_json,
               notes,
               status,
               user_locked_fields,
               supplier_name,
               created_by,
               updated_by
             )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::text[],$13,$14,$14)
             ON CONFLICT (material_class, material_key) DO UPDATE
             SET
               mainitem = EXCLUDED.mainitem,
               maindescription = EXCLUDED.maindescription,
               catlinedesc = EXCLUDED.catlinedesc,
               mainunit = EXCLUDED.mainunit,
               taxonomy_category_id = EXCLUDED.taxonomy_category_id,
               taxonomy_subcategory_id = EXCLUDED.taxonomy_subcategory_id,
               parameters_json = EXCLUDED.parameters_json,
               notes = EXCLUDED.notes,
               status = EXCLUDED.status,
               supplier_name = EXCLUDED.supplier_name,
               user_locked_fields = CASE
                 WHEN $15::boolean THEN ARRAY(
                   SELECT DISTINCT unnest(COALESCE(mes_non_resin_material_specs.user_locked_fields, '{}'::text[]) || EXCLUDED.user_locked_fields)
                 )
                 ELSE mes_non_resin_material_specs.user_locked_fields
               END,
               updated_by = EXCLUDED.updated_by,
               updated_at = NOW()
             RETURNING *`,
            [
              materialClass,
              materialKey,
              context.mainitem || null,
              context.maindescription || null,
              context.catlinedesc || null,
              mainUnit || existing?.mainunit || null,
              taxonomyLink.taxonomyCategoryId,
              taxonomyLink.taxonomySubcategoryId,
              JSON.stringify(validation.normalized),
              notes,
              status,
              fieldsToLock,
              supplierName,
              req.user.id,
              lockFields,
            ]
          );
          savedRow = rows[0];
        }

        results.push({
          ...savedRow,
          parameters_json: savedRow.parameters_json || {},
          user_locked_fields: savedRow.user_locked_fields || [],
          parameter_profile: validation.parameterProfile,
        });
      }

      await client.query('COMMIT');

      return res.json({
        success: true,
        count: results.length,
        data: results,
      });
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {
        // no-op
      }

      if (err.code === '42P01') {
        return res.status(500).json({
          success: false,
          error: 'mes_non_resin_material_specs table not found. Run migration mes-master-022 first.',
        });
      }

      if (String(err.message || '').startsWith('[Entry ')) {
        return res.status(400).json({ success: false, error: err.message });
      }

      logger.error('PUT /tds/non-resin-spec/bulk-apply error:', err);
      return res.status(500).json({ success: false, error: 'Failed to apply parsed values' });
    } finally {
      client.release();
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  //  Apply Multi-Component (2-K Adhesive) — Phase 4 of consolidated fix plan
  //  POST /tds/non-resin-spec/apply-multi-component
  //  Atomically writes:
  //    - one mes_non_resin_material_specs row per component (Part A, Part B)
  //    - one mes_formulations parent row (is_two_component=true) with blend params
  //    - one mes_formulation_components row per component (component_role, parts)
  //    - optionally links mes_tds_attachments.formulation_id → parent
  // ════════════════════════════════════════════════════════════════════════
  router.post('/tds/non-resin-spec/apply-multi-component', authenticate, async (req, res) => {
    if (!isTdsWriter(req.user)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const b = req.body || {};
    const materialClass = normalizeText(b.material_class).toLowerCase();
    if (!NON_RESIN_MATERIAL_CLASS_KEYS.includes(materialClass)) {
      return res.status(400).json({
        success: false,
        error: `material_class must be one of: ${NON_RESIN_MATERIAL_CLASS_KEYS.join(', ')}`,
      });
    }
    if (materialClass !== 'adhesives') {
      return res.status(400).json({
        success: false,
        error: 'Multi-component apply is only supported for adhesives at this time',
      });
    }

    const components = Array.isArray(b.components) ? b.components : [];
    if (components.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'At least 2 components are required (Part A and Part B)',
      });
    }

    const parentName = normalizeText(b.parent_name)
      || (components.map((c) => normalizeText(c.mainitem) || normalizeText(c.maindescription))
            .filter(Boolean).join(' + ')) || null;
    if (!parentName) {
      return res.status(400).json({
        success: false,
        error: 'parent_name (or component identifiers) is required',
      });
    }

    const parentCatlinedesc = normalizeText(b.parent_catlinedesc)
      || normalizeText(components[0]?.catlinedesc) || 'Adhesive Formulation';
    const blend = isPlainObject(b.blend_params) ? b.blend_params : {};
    const status = normalizeText(b.status).toLowerCase() || 'draft';
    if (!NON_RESIN_SPEC_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `status must be one of: ${NON_RESIN_SPEC_STATUSES.join(', ')}`,
      });
    }
    const attachmentId = b.attachment_id ? parseInt(b.attachment_id, 10) : null;

    const numericOrNull = (v) => {
      if (v === undefined || v === null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const blendValues = {
      mix_ratio: blend.mix_ratio ? String(blend.mix_ratio).slice(0, 40) : null,
      pot_life_min: numericOrNull(blend.pot_life_min),
      cure_time_hours: numericOrNull(blend.cure_time_hours),
      application_temp_c: numericOrNull(blend.application_temp_c),
      bond_strength_n_mm2: numericOrNull(blend.bond_strength_n_mm2 ?? blend.bond_strength),
      tack_time_min: numericOrNull(blend.tack_time_min),
    };

    const paramRules = await getParamRulesFromDB(materialClass, {
      mainitem: components[0]?.mainitem,
      maindescription: components[0]?.maindescription,
      catlinedesc: components[0]?.catlinedesc,
    });

    // Shared blend params that should also be persisted on each component spec row
    // so the per-part edit view shows Mix Ratio / Carrying Solvent / Appearance, etc.
    const sharedComponentKeys = new Set([
      'mix_ratio', 'appearance', 'carrying_solvent', 'functionality',
      'application_temp_c', 'pot_life_min', 'bond_strength', 'cure_time_hours',
      'density_g_cm3',
    ]);
    const sharedForComponents = {};
    Object.entries(blend || {}).forEach(([k, v]) => {
      if (sharedComponentKeys.has(k) && v !== null && v !== undefined && v !== '') {
        sharedForComponents[k] = v;
      }
    });

    // Validate every component's parameters_json BEFORE we open the tx.
    // enforceRequired=false: required fields (e.g. mix_ratio) live at blend level for 2-K
    // and are not always present per-component; the user reviews & applies what was found.
    const validatedComponents = [];
    for (let i = 0; i < components.length; i++) {
      const c = components[i] || {};
      const cMain = normalizeText(c.mainitem);
      const cDesc = normalizeText(c.maindescription);
      if (!cMain && !cDesc) {
        return res.status(400).json({
          success: false,
          error: `Component ${i + 1}: mainitem or maindescription is required`,
        });
      }
      // Component params first, shared blend params fill any gaps (do not overwrite).
      const cParamsRaw = isPlainObject(c.parameters_json) ? c.parameters_json : {};
      const cParams = { ...sharedForComponents, ...cParamsRaw };
      const v = validateNonResinParameters(materialClass, cParams, {
        mainitem: cMain, maindescription: cDesc, catlinedesc: normalizeText(c.catlinedesc),
      }, paramRules, { enforceRequired: false });
      if (!v.valid) {
        return res.status(400).json({
          success: false,
          error: `Component ${i + 1}: ${v.errors[0] || 'Invalid parameters'}`,
          errors: v.errors,
        });
      }
      validatedComponents.push({
        index: i,
        mainitem: cMain || null,
        maindescription: cDesc || null,
        catlinedesc: normalizeText(c.catlinedesc) || null,
        mainunit: normalizeText(c.mainunit) || null,
        material_key: normalizeMaterialKey(cMain || cDesc),
        component_role: (normalizeText(c.component_role) || (i === 0 ? 'resin' : 'hardener')).slice(0, 40),
        parts: numericOrNull(c.parts_by_weight ?? c.parts) ?? (i === 0 ? 100 : 75),
        normalized_params: v.normalized || {},
        lock_fields: c.lockFields === true ? Object.keys(v.normalized || {}) : [],
        supplier_name: c.supplier_name ? String(c.supplier_name).trim().slice(0, 200) : null,
        notes: c.notes === undefined ? null : (c.notes === null ? null : String(c.notes)),
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const specTable = await getSpecTable(materialClass);

      // 1. UPSERT each component into the mapped spec table, falling back to the legacy table.
      const componentResults = [];
      for (const cv of validatedComponents) {
        let savedRow;
        if (specTable) {
          savedRow = await upsertCategorySpecificSpec(client, specTable, {
            materialClass,
            materialKey: cv.material_key,
            mainItem: cv.mainitem,
            mainDescription: cv.maindescription,
            catLineDesc: cv.catlinedesc,
            mainUnit: cv.mainunit,
            parameters: cv.normalized_params,
            notes: cv.notes,
            status,
            fieldsToLock: cv.lock_fields,
            supplierName: cv.supplier_name,
            userId: req.user.id,
            lockFields: true,
            parameterProfile: materialClass,
          });
        } else {
          const taxonomyLink = await resolveSubstrateTaxonomyLink(client, materialClass, cv.catlinedesc);
          const { rows } = await client.query(
            `INSERT INTO mes_non_resin_material_specs (
               material_class, material_key, mainitem, maindescription,
               catlinedesc, mainunit, taxonomy_category_id, taxonomy_subcategory_id,
               parameters_json, notes, status, user_locked_fields,
               supplier_name, created_by, updated_by
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::text[],$13,$14,$14)
             ON CONFLICT (material_class, material_key) DO UPDATE
             SET mainitem = EXCLUDED.mainitem,
                 maindescription = EXCLUDED.maindescription,
                 catlinedesc = EXCLUDED.catlinedesc,
                 mainunit = EXCLUDED.mainunit,
                 parameters_json = EXCLUDED.parameters_json,
                 notes = EXCLUDED.notes,
                 status = EXCLUDED.status,
                 supplier_name = EXCLUDED.supplier_name,
                 user_locked_fields = ARRAY(
                   SELECT DISTINCT unnest(
                     COALESCE(mes_non_resin_material_specs.user_locked_fields, '{}'::text[])
                     || EXCLUDED.user_locked_fields
                   )
                 ),
                 updated_by = EXCLUDED.updated_by,
                 updated_at = NOW()
             RETURNING id, material_key, mainitem, maindescription`,
            [
              materialClass, cv.material_key,
              cv.mainitem, cv.maindescription,
              cv.catlinedesc, cv.mainunit,
              taxonomyLink.taxonomyCategoryId, taxonomyLink.taxonomySubcategoryId,
              JSON.stringify(cv.normalized_params), cv.notes, status, cv.lock_fields,
              cv.supplier_name, req.user.id,
            ]
          );
          savedRow = rows[0];
        }
        componentResults.push({ ...cv, spec_row: savedRow });
      }

      // 2. Resolve adhesives category_id (mes_formulations.category_id FK → mes_item_categories)
      const catRes = await client.query(
        `SELECT id FROM mes_item_categories
          WHERE LOWER(material_class) = $1 OR LOWER(name) = $1
          ORDER BY (LOWER(material_class) = $1) DESC
          LIMIT 1`,
        ['adhesives']
      );
      const categoryId = catRes.rows[0]?.id;
      if (!categoryId) {
        throw new Error("Adhesives category not found in mes_item_categories");
      }

      // 3. UPSERT mes_formulations parent (idempotent on name within category)
      const formulationName = parentName.slice(0, 200);
      const existingForm = await client.query(
        `SELECT id, version FROM mes_formulations
          WHERE category_id = $1 AND LOWER(name) = LOWER($2)
          ORDER BY version DESC LIMIT 1`,
        [categoryId, formulationName]
      );
      let formulationId;
      if (existingForm.rows[0]) {
        formulationId = existingForm.rows[0].id;
        await client.query(
          `UPDATE mes_formulations
              SET catlinedesc = $2,
                  status = $3,
                  is_two_component = true,
                  mix_ratio = $4,
                  pot_life_min = $5,
                  cure_time_hours = $6,
                  application_temp_c = $7,
                  bond_strength_n_mm2 = $8,
                  tack_time_min = $9,
                  notes = COALESCE($10, notes),
                  updated_at = NOW()
            WHERE id = $1`,
          [
            formulationId, parentCatlinedesc, status,
            blendValues.mix_ratio, blendValues.pot_life_min, blendValues.cure_time_hours,
            blendValues.application_temp_c, blendValues.bond_strength_n_mm2, blendValues.tack_time_min,
            b.notes ? String(b.notes) : null,
          ]
        );
      } else {
        const ins = await client.query(
          `INSERT INTO mes_formulations (
             category_id, catlinedesc, name, version, status, is_default,
             notes, created_by, is_two_component,
             mix_ratio, pot_life_min, cure_time_hours,
             application_temp_c, bond_strength_n_mm2, tack_time_min
           ) VALUES ($1,$2,$3,1,$4,false,$5,$6,true,$7,$8,$9,$10,$11,$12)
           RETURNING id`,
          [
            categoryId, parentCatlinedesc, formulationName, status,
            b.notes ? String(b.notes) : null, req.user.id,
            blendValues.mix_ratio, blendValues.pot_life_min, blendValues.cure_time_hours,
            blendValues.application_temp_c, blendValues.bond_strength_n_mm2, blendValues.tack_time_min,
          ]
        );
        formulationId = ins.rows[0].id;
      }

      // 4. Replace component rows for this formulation
      await client.query(
        `DELETE FROM mes_formulation_components WHERE formulation_id = $1`,
        [formulationId]
      );
      for (let i = 0; i < componentResults.length; i++) {
        const cv = componentResults[i];
        await client.query(
          `INSERT INTO mes_formulation_components (
             formulation_id, component_type, item_key, component_role, parts, sort_order, notes
           ) VALUES ($1, 'item', $2, $3, $4, $5, $6)`,
          [formulationId, cv.material_key, cv.component_role, cv.parts, i, cv.notes]
        );
      }

      // 5. Optionally link the source TDS attachment to this formulation
      if (attachmentId && Number.isFinite(attachmentId)) {
        await client.query(
          `UPDATE mes_tds_attachments
              SET formulation_id = $1,
                  applied_to_spec = true,
                  applied_at = NOW(),
                  applied_by = $2
            WHERE id = $3 AND deleted_at IS NULL`,
          [formulationId, req.user.id, attachmentId]
        );
      }

      await client.query('COMMIT');

      return res.status(201).json({
        success: true,
        formulation_id: formulationId,
        components: componentResults.map((cv) => ({
          spec_id: cv.spec_row?.id,
          material_key: cv.material_key,
          mainitem: cv.mainitem,
          maindescription: cv.maindescription,
          component_role: cv.component_role,
          parts: cv.parts,
        })),
        attachment_linked: !!(attachmentId && Number.isFinite(attachmentId)),
      });
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) { /* no-op */ }
      logger.error('POST /tds/non-resin-spec/apply-multi-component error:', err);
      return res.status(500).json({
        success: false,
        error: err?.message ? `Failed to apply multi-component: ${err.message}` : 'Failed to apply multi-component',
      });
    } finally {
      client.release();
    }
  });

  // ─── POST /tds/non-resin-spec/parse-upload — Upload PDF and parse non-resin values ──
  router.post('/tds/non-resin-spec/parse-upload', authenticate, upload.single('file'), async (req, res) => {
    let uploadedPath = req.file?.path;

    try {
      if (!isTdsWriter(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
      if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

      const ext = path.extname(req.file.originalname).toLowerCase();
      if (ext !== '.pdf') {
        return res.status(400).json({ success: false, error: 'Only PDF files are supported for parsing' });
      }

      const materialClass = normalizeText(req.body.material_class).toLowerCase();
      const mainItem = normalizeText(req.body.mainitem);
      const mainDescription = normalizeText(req.body.maindescription);
      const catLineDesc = normalizeText(req.body.catlinedesc);
      const parseMode = normalizeParseUploadMode(materialClass, req.body.mode);
      const multiComponentMode = parseMode === PARSE_UPLOAD_MODE_MULTI_COMPONENT;

      if (!NON_RESIN_MATERIAL_CLASS_KEYS.includes(materialClass)) {
        return res.status(400).json({
          success: false,
          error: `material_class is required and must be one of: ${NON_RESIN_MATERIAL_CLASS_KEYS.join(', ')}`,
        });
      }

      const identity = mainItem || mainDescription;
      if (!identity) {
        return res.status(400).json({ success: false, error: 'mainitem or maindescription is required' });
      }

      const parameterProfile = resolveNonResinParamProfile(materialClass, {
        mainitem: mainItem,
        maindescription: mainDescription,
        catlinedesc: catLineDesc,
      });

      // Schema-driven: fetch parameter definitions for this class/profile from DB
      const isProfile = parameterProfile !== materialClass;
      const { rows: paramDefs } = await pool.query(
        `SELECT field_key, label, unit, field_type, min_value AS min, max_value AS max, step,
                has_test_method, test_method_options
         FROM mes_parameter_definitions
         WHERE material_class = $1 AND (($2::text IS NULL AND profile IS NULL) OR profile = $2)
         ORDER BY sort_order ASC`,
        [isProfile ? 'substrates' : materialClass, isProfile ? parameterProfile : null]
      );

      if (!paramDefs.length) {
        return res.status(400).json({
          success: false,
          error: `No parameter definitions found for ${parameterProfile || materialClass}. Add definitions in admin panel first.`,
          parameter_profile: parameterProfile,
        });
      }

      const materialKey = normalizeMaterialKey(identity);

      // Get existing spec data
      const specTable = await getSpecTable(materialClass);
      let existing = null;
      if (specTable) {
        const r = await pool.query(`SELECT parameters_json, user_locked_fields FROM ${specTable} WHERE material_key = $1 LIMIT 1`, [materialKey]);
        existing = r.rows[0];
      }
      if (!existing) {
        const r = await pool.query(`SELECT parameters_json, user_locked_fields FROM mes_non_resin_material_specs WHERE material_class = $1 AND material_key = $2 LIMIT 1`, [materialClass, materialKey]);
        existing = r.rows[0];
      }
      if (!existing) existing = { parameters_json: {}, user_locked_fields: [] };

      const buf = fs.readFileSync(req.file.path);
      const parser = new PDFParse({ data: new Uint8Array(buf), verbosity: 0 });
      await parser.load();
      const result = await parser.getText();
      const rawText = normalizePdfText(result.pages.map((p) => p.text).join('\n'));

      // Helper: persist this PDF as a TDS attachment with the given extracted JSON.
      // Called once per response path so parseStatus + parsedExtractJson reflect what
      // the user actually sees in the diff modal. The temp file is moved (renamed)
      // so we no longer need to unlink it in the finally block.
      const persistThisUpload = async (parsedExtractJson, parseStatus) => {
        const meta = await persistTdsAttachment({
          tempPath: uploadedPath,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          materialClass,
          parameterProfile,
          mainitem: mainItem,
          maindescription: mainDescription,
          catlinedesc: catLineDesc,
          supplierId: null, // assigned post-upload via PATCH from supplier picker
          supplierNameRaw: req.body.supplier_name_raw || null,
          parsedExtractJson,
          parseStatus,
          uploadedBy: req.user?.id || null,
        });
        // Whether or not the INSERT succeeded, the temp file has been moved by the helper.
        uploadedPath = null;
        return meta;
      };

      if (multiComponentMode) {
        const layout = detectCombinedComponentLayout(rawText);
        const twoColumn = extractTwoColumnBySchema(rawText, paramDefs);

        const sharedExtracted = extractBySchema(layout.sharedText || rawText, paramDefs);
        const partAExtracted = extractBySchema(layout.componentA.sectionText || '', paramDefs);
        const partBExtracted = extractBySchema(layout.componentB.sectionText || '', paramDefs);

        const hasTwoColumnValues = Object.keys(twoColumn.componentA || {}).length > 0
          && Object.keys(twoColumn.componentB || {}).length > 0;

        const numericFieldKeys = new Set(
          (paramDefs || [])
            .filter((d) => d?.field_type === 'number' && d?.field_key)
            .map((d) => d.field_key)
        );

        const sharedAllowList = new Set([
          'mix_ratio',
          'pot_life_min',
          'bond_strength',
          'cure_time_hours',
          'application_temp_c',
          // Text/visual fields commonly stated once and shared across both parts.
          'appearance',
          'carrying_solvent',
          'functionality',
          'density_g_cm3',
        ]);

        // Section parsing is reliable only when explicit A/B markers exist in text.
        const sectionA = layout.hasExplicitMarkers ? partAExtracted : {};
        const sectionB = layout.hasExplicitMarkers ? partBExtracted : {};

        const sharedForA = Object.fromEntries(
          Object.entries(sharedExtracted || {}).filter(([k]) => sharedAllowList.has(k))
        );
        const sharedForB = Object.fromEntries(
          Object.entries(sharedExtracted || {}).filter(([k]) => sharedAllowList.has(k))
        );

        // In side-by-side tables (no explicit markers), shared numeric extraction tends to pick
        // first-column values. When we already have two-column signal, drop shared numeric fallbacks.
        if (!layout.hasExplicitMarkers && hasTwoColumnValues) {
          for (const key of numericFieldKeys) {
            delete sharedForA[key];
            delete sharedForB[key];
          }
        }

        const componentAExtracted = {
          ...sharedForA,
          ...sectionA,
          ...(twoColumn.componentA || {}),
        };

        const componentBExtracted = {
          ...sharedForB,
          ...sectionB,
          ...(twoColumn.componentB || {}),
        };

        const normalizedMainItem = normalizeMaterialKey(mainItem);
        const componentSeeds = buildMultiComponentSeeds(layout, componentAExtracted, componentBExtracted);

        const sharedOnlyKeys = new Set(sharedAllowList);
        const hasMeaningfulComponents = hasMeaningfulMultiComponentValues(componentSeeds, sharedOnlyKeys);

        if (layout.isMulti || hasMeaningfulComponents) {
          const components = [];

          for (const seed of componentSeeds) {
            const detectedCode = normalizeText(seed.detected_code);
            const candidates = await findNonResinTargetCandidates(materialClass, detectedCode || mainItem || '');
            const defaultTarget = chooseDefaultNonResinTarget(candidates, normalizedMainItem, detectedCode);

            let existingForTarget = { parameters_json: {}, user_locked_fields: [] };
            if (defaultTarget?.mainitem || defaultTarget?.maindescription) {
              const targetKey = normalizeMaterialKey(defaultTarget.mainitem || defaultTarget.maindescription);
              existingForTarget = await loadExistingNonResinSpec(materialClass, targetKey);
            }

            const componentDiffRaw = diffExtractedWithExisting(
              seed.extracted,
              existingForTarget.parameters_json || {},
              existingForTarget.user_locked_fields || [],
              paramDefs
            );

            const normalizedDiff = normalizeSchemaDiffForClient(componentDiffRaw);
            const exactTargetMatch = defaultTarget
              && detectedCode
              && normalizeMaterialKey(defaultTarget.mainitem) === normalizeMaterialKey(detectedCode);

            components.push({
              key: seed.key,
              component_label: seed.component_label,
              component_role: seed.component_role,
              detected_code: detectedCode || null,
              extracted: seed.extracted,
              diff: normalizedDiff,
              target: defaultTarget
                ? {
                    mainitem: defaultTarget.mainitem || null,
                    maindescription: defaultTarget.maindescription || null,
                    catlinedesc: defaultTarget.catlinedesc || null,
                    mainunit: defaultTarget.mainunit || null,
                  }
                : null,
              candidates,
              confidence: exactTargetMatch ? 1 : (defaultTarget ? 0.7 : 0),
              warnings: defaultTarget
                ? []
                : ['No confident target match found. Please map this component manually.'],
            });
          }

          const attachment = await persistThisUpload(
            { mode: 'multi_component', shared: sharedExtracted, components: components.map(c => ({ key: c.key, extracted: c.extracted })) },
            'parsed'
          );

          return res.status(201).json(buildParseUploadSuccess({
            mode: PARSE_UPLOAD_MODE_MULTI_COMPONENT,
            requested_mode: parseMode,
            parameter_profile: parameterProfile,
            definitions_used: paramDefs.length,
            layout: {
              has_explicit_markers: layout.hasExplicitMarkers,
              likely_codes: layout.likelyCodes || [],
            },
            shared_extracted: sharedExtracted,
            components,
            attachment,
          }));
        }
      }

      // Schema-driven extraction — works for ALL categories
      const extracted = extractBySchema(rawText, paramDefs);

      // Also try legacy Alu foil parser if the resolved profile is any Alu-foil variant.
      // Loosened from strict equality (BR-01, 2026-04-25) so Walki / paper-foil laminates
      // and future alu_* sub-profiles still benefit from the alloy/temper/composition fallbacks.
      if (typeof parameterProfile === 'string' && parameterProfile.startsWith('substrates_alu')) {
        const aluExtracted = extractAluFoilFromText(rawText);
        for (const [k, v] of Object.entries(aluExtracted)) {
          if (extracted[k] === undefined || extracted[k] === null) extracted[k] = v;
        }
      }

      const diff = diffExtractedWithExisting(
        extracted,
        existing.parameters_json || {},
        existing.user_locked_fields || [],
        paramDefs
      );

      const normalizedDiff = normalizeSchemaDiffForClient(diff);

      const extractedCount = Object.values(extracted || {}).filter((v) => v !== undefined && v !== null && v !== '').length;
      const parseStatus = extractedCount === 0 ? 'failed' : (extractedCount < paramDefs.length ? 'partial' : 'parsed');
      const attachment = await persistThisUpload(extracted, parseStatus);

      return res.status(201).json(buildParseUploadSuccess({
        mode: PARSE_UPLOAD_MODE_SINGLE_COMPONENT,
        requested_mode: parseMode,
        extracted,
        diff: normalizedDiff,
        parameter_profile: parameterProfile,
        definitions_used: paramDefs.length,
        attachment,
      }));
    } catch (err) {
      if (err.code === '42P01') {
        return res.status(500).json({
          success: false,
          error: 'mes_non_resin_material_specs table not found. Run migration mes-master-022 first.',
        });
      }
      logger.error('POST /tds/non-resin-spec/parse-upload error:', err);
      return res.status(500).json({ success: false, error: 'Failed to parse non-resin PDF' });
    } finally {
      // The temp file is moved into uploads/tds/<class>/<mainitem>/<supplier>/ by
      // persistTdsAttachment(); uploadedPath is set to null on success. If we never
      // reached the persist step (early validation error or exception before parsing)
      // we still clean up to avoid leaking the orphan multer temp file.
      if (uploadedPath && fs.existsSync(uploadedPath)) {
        try {
          fs.unlinkSync(uploadedPath);
        } catch (cleanupErr) {
          logger.warn('Failed to clean up non-resin upload file:', cleanupErr.message);
        }
      }
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  //  TDS Attachment Library (multi-supplier × multi-version per material)
  //  Phase 6 of MATERIAL_SPECS_AND_PARSER_CONSOLIDATED_FIX_PLAN_2026-04-24.md
  // ════════════════════════════════════════════════════════════════════════

  // ─── GET /tds/attachments — List uploaded TDS PDFs for a material ───────
  // Query: mainitem (required), material_class (optional, narrows when supplied)
  router.get('/tds/attachments', authenticate, async (req, res) => {
    try {
      const mainitem = normalizeText(req.query.mainitem);
      const materialClass = req.query.material_class
        ? String(req.query.material_class).trim().toLowerCase()
        : null;
      if (!mainitem) {
        return res.status(400).json({ success: false, error: 'mainitem is required' });
      }
      const params = [mainitem];
      let where = `a.mainitem = $1 AND a.deleted_at IS NULL`;
      if (materialClass) {
        params.push(materialClass);
        where += ` AND a.material_class = $${params.length}`;
      }
      const { rows } = await pool.query(
        `SELECT
            a.id, a.material_class, a.parameter_profile,
            a.mainitem, a.maindescription, a.catlinedesc,
            a.supplier_id, a.supplier_name_raw,
            COALESCE(s.name, a.supplier_name_raw) AS supplier_name,
            a.file_name, a.file_size, a.mime_type, a.sha256,
            a.version_no, a.is_current,
            a.parse_status, a.parsed_extract_json,
            a.applied_to_spec, a.applied_at, a.applied_by,
            a.notes,
            a.uploaded_by, a.uploaded_at
           FROM mes_tds_attachments a
           LEFT JOIN mes_suppliers s ON s.id = a.supplier_id
          WHERE ${where}
          ORDER BY a.supplier_id NULLS LAST, a.version_no DESC, a.uploaded_at DESC`,
        params
      );
      res.json({ success: true, data: rows, count: rows.length });
    } catch (err) {
      logger.error('GET /tds/attachments error:', err);
      res.status(500).json({ success: false, error: 'Failed to list TDS attachments' });
    }
  });

  // ─── GET /tds/attachments/:id/download — Stream the original PDF ────────
  router.get('/tds/attachments/:id/download', authenticate, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, error: 'Invalid attachment id' });
      }
      const { rows } = await pool.query(
        `SELECT file_name, file_path, mime_type, file_size, deleted_at
           FROM mes_tds_attachments WHERE id = $1`,
        [id]
      );
      if (!rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
      if (rows[0].deleted_at) return res.status(410).json({ success: false, error: 'Attachment deleted' });

      const relPath = rows[0].file_path;
      const absPath = path.isAbsolute(relPath)
        ? relPath
        : path.join(__dirname, '..', '..', '..', relPath);
      // Security: ensure resolved path is inside uploadDir
      const resolved = path.resolve(absPath);
      const uploadRoot = path.resolve(uploadDir);
      if (!resolved.startsWith(uploadRoot)) {
        logger.warn('TDS download path traversal attempt: %s (resolved %s)', relPath, resolved);
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
      if (!fs.existsSync(resolved)) {
        return res.status(404).json({ success: false, error: 'File missing on disk' });
      }
      res.setHeader('Content-Type', rows[0].mime_type || 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${(rows[0].file_name || 'tds.pdf').replace(/"/g, '')}"`);
      if (rows[0].file_size) res.setHeader('Content-Length', String(rows[0].file_size));
      fs.createReadStream(resolved).pipe(res);
    } catch (err) {
      logger.error('GET /tds/attachments/:id/download error:', err);
      res.status(500).json({ success: false, error: 'Failed to download TDS attachment' });
    }
  });

  // ─── PATCH /tds/attachments/:id — Update supplier_id / notes / is_current
  router.patch('/tds/attachments/:id', authenticate, async (req, res) => {
    try {
      if (!isTdsWriter(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, error: 'Invalid attachment id' });
      }
      const b = req.body || {};
      const updates = [];
      const params = [];
      const push = (col, val) => {
        params.push(val);
        updates.push(`${col} = $${params.length}`);
      };

      if (b.supplier_id !== undefined) push('supplier_id', b.supplier_id ? parseInt(b.supplier_id, 10) : null);
      if (b.supplier_name_raw !== undefined) push('supplier_name_raw', b.supplier_name_raw ? String(b.supplier_name_raw).slice(0, 200) : null);
      if (b.notes !== undefined) push('notes', b.notes ? String(b.notes) : null);
      if (b.applied_to_spec === true) {
        push('applied_to_spec', true);
        push('applied_at', new Date());
        push('applied_by', req.user?.id || null);
      }

      if (!updates.length && b.is_current !== true) {
        return res.status(400).json({ success: false, error: 'No fields to update' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Atomic flip of is_current within (material_class, mainitem, supplier_id)
        if (b.is_current === true) {
          const { rows: tgt } = await client.query(
            `SELECT material_class, mainitem, supplier_id FROM mes_tds_attachments WHERE id = $1`,
            [id]
          );
          if (tgt[0]) {
            await client.query(
              `UPDATE mes_tds_attachments
                  SET is_current = false
                WHERE material_class = $1
                  AND mainitem IS NOT DISTINCT FROM $2
                  AND supplier_id IS NOT DISTINCT FROM $3
                  AND id <> $4
                  AND is_current = true`,
              [tgt[0].material_class, tgt[0].mainitem, tgt[0].supplier_id, id]
            );
            updates.push(`is_current = true`);
          }
        }

        params.push(id);
        const { rows } = await client.query(
          `UPDATE mes_tds_attachments SET ${updates.join(', ')}
            WHERE id = $${params.length}
            RETURNING id, supplier_id, supplier_name_raw, notes, is_current, applied_to_spec`,
          params
        );
        if (!rows[0]) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, error: 'Not found' });
        }
        await client.query('COMMIT');
        res.json({ success: true, data: rows[0] });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } catch (err) {
      logger.error('PATCH /tds/attachments/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to update TDS attachment' });
    }
  });

  // ─── DELETE /tds/attachments/:id — Soft delete ──────────────────────────
  router.delete('/tds/attachments/:id', authenticate, async (req, res) => {
    try {
      if (!isTdsWriter(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, error: 'Invalid attachment id' });
      }
      const { rowCount } = await pool.query(
        `UPDATE mes_tds_attachments
            SET deleted_at = NOW(), is_current = false
          WHERE id = $1 AND deleted_at IS NULL`,
        [id]
      );
      if (!rowCount) return res.status(404).json({ success: false, error: 'Not found or already deleted' });
      res.json({ success: true });
    } catch (err) {
      logger.error('DELETE /tds/attachments/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete TDS attachment' });
    }
  });

  // ─── GET /tds/suppliers — List all suppliers ─────────────────────────────
  router.get('/tds/suppliers', authenticate, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, name, country, website, is_active FROM mes_suppliers ORDER BY name`
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      logger.error('GET /tds/suppliers error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch suppliers' });
    }
  });

  // ─── POST /tds/suppliers — Create supplier ───────────────────────────────
  router.post('/tds/suppliers', authenticate, async (req, res) => {
    try {
      if (!isTdsWriter(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
      const { name, country, contact_info, website } = req.body;
      if (!name?.trim()) return res.status(400).json({ success: false, error: 'Supplier name is required' });

      const { rows } = await pool.query(
        `INSERT INTO mes_suppliers (name, country, contact_info, website)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [name.trim(), country || null, contact_info || null, website || null]
      );
      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ success: false, error: 'Supplier already exists' });
      logger.error('POST /tds/suppliers error:', err);
      res.status(500).json({ success: false, error: 'Failed to create supplier' });
    }
  });

  // ─── PATCH /tds/suppliers/:id — Update supplier ──────────────────────────
  router.patch('/tds/suppliers/:id', authenticate, async (req, res) => {
    try {
      if (!isTdsWriter(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
      const allowed = ['name', 'country', 'contact_info', 'website', 'is_active'];
      const sets = [];
      const vals = [];
      let i = 1;
      for (const k of allowed) {
        if (Object.prototype.hasOwnProperty.call(req.body, k)) {
          sets.push(`${k} = $${i++}`);
          vals.push(k === 'name' ? String(req.body[k] || '').trim() : req.body[k]);
        }
      }
      if (!sets.length) return res.status(400).json({ success: false, error: 'No fields to update' });
      vals.push(req.params.id);
      const { rows } = await pool.query(
        `UPDATE mes_suppliers SET ${sets.join(', ')}, updated_at = NOW()
         WHERE id = $${i} RETURNING *`,
        vals
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'Supplier not found' });
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ success: false, error: 'Supplier name already exists' });
      logger.error('PATCH /tds/suppliers/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to update supplier' });
    }
  });

  // ─── DELETE /tds/suppliers/:id — Soft-delete (deactivate) supplier ───────
  router.delete('/tds/suppliers/:id', authenticate, async (req, res) => {
    try {
      if (!isTdsWriter(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
      // Refuse if supplier is referenced by an active TDS or attachment
      const usage = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM mes_material_tds WHERE supplier_id = $1)::int AS tds_count,
           (SELECT COUNT(*) FROM mes_tds_attachments WHERE supplier_id = $1)::int AS att_count`,
        [req.params.id]
      );
      const { tds_count, att_count } = usage.rows[0] || {};
      if (tds_count > 0 || att_count > 0) {
        // Soft-deactivate instead of hard delete
        const { rows } = await pool.query(
          `UPDATE mes_suppliers SET is_active = false, updated_at = NOW()
           WHERE id = $1 RETURNING *`,
          [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: 'Supplier not found' });
        return res.json({ success: true, data: rows[0], deactivated: true,
          message: `Deactivated (still referenced by ${tds_count} TDS and ${att_count} attachment${att_count === 1 ? '' : 's'})` });
      }
      const { rowCount } = await pool.query(`DELETE FROM mes_suppliers WHERE id = $1`, [req.params.id]);
      if (!rowCount) return res.status(404).json({ success: false, error: 'Supplier not found' });
      res.json({ success: true, deleted: true });
    } catch (err) {
      logger.error('DELETE /tds/suppliers/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete supplier' });
    }
  });

  // ─── GET /tds/:id — Single TDS detail with attachments ──────────────────
  router.get('/tds/:id', authenticate, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT t.*, s.name AS supplier_name, s.country AS supplier_country, s.website AS supplier_website
         FROM mes_material_tds t
         LEFT JOIN mes_suppliers s ON s.id = t.supplier_id
         WHERE t.id = $1`,
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'TDS not found' });

      const attRes = await pool.query(
        `SELECT id, file_name, file_type, file_size, uploaded_at FROM mes_tds_attachments WHERE tds_id = $1 ORDER BY uploaded_at DESC`,
        [req.params.id]
      );

      res.json({ success: true, data: { ...rows[0], attachments: attRes.rows } });
    } catch (err) {
      logger.error('GET /tds/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch TDS record' });
    }
  });

  // ─── POST /tds — Create TDS record ──────────────────────────────────────
  router.post('/tds', authenticate, async (req, res) => {
    try {
      if (!isTdsWriter(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
      const b = req.body;
      if (!b.brand_grade?.trim()) return res.status(400).json({ success: false, error: 'brand_grade is required' });

      const cols = [];
      const vals = [];
      const phs = [];
      let p = 1;

      for (const f of TDS_WRITE_FIELDS) {
        if (b[f] !== undefined) {
          cols.push(f);
          vals.push(b[f]);
          phs.push(`$${p++}`);
        }
      }

      const resinTaxonomyCategoryId = await resolveResinTaxonomyCategoryId(pool, b.category, b.cat_desc);
      if (resinTaxonomyCategoryId != null) {
        cols.push('taxonomy_category_id');
        vals.push(resinTaxonomyCategoryId);
        phs.push(`$${p++}`);
      }

      // Always set created_by
      cols.push('created_by');
      vals.push(req.user.id);
      phs.push(`$${p++}`);

      const sql = `INSERT INTO mes_material_tds (${cols.join(',')}) VALUES (${phs.join(',')}) RETURNING *`;
      const { rows } = await pool.query(sql, vals);
      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('POST /tds error:', err);
      res.status(500).json({ success: false, error: 'Failed to create TDS record' });
    }
  });

  // ─── PUT /tds/:id — Update TDS record ───────────────────────────────────
  router.put('/tds/:id', authenticate, async (req, res) => {
    try {
      if (!isTdsWriter(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
      const b = req.body;
      const sets = [];
      const vals = [];
      let p = 1;

      // lockFields=true means explicit manual update; all other writes are treated as
      // non-manual and must respect existing user_locked_fields.
      const lockFields = b.lockFields === true;
      const isAutoSync = !lockFields;

      const currentRes = await pool.query(
        'SELECT user_locked_fields, category, cat_desc FROM mes_material_tds WHERE id = $1',
        [req.params.id]
      );
      if (!currentRes.rows.length) return res.status(404).json({ success: false, error: 'TDS not found' });

      const currentRow = currentRes.rows[0];
      const currentLocked = isAutoSync ? (currentRow.user_locked_fields || []) : [];

      const fieldsBeingUpdated = [];
      for (const f of TDS_WRITE_FIELDS) {
        if (b[f] !== undefined) {
          // Automated sync must not overwrite user-locked fields
          if (isAutoSync && currentLocked.includes(f)) continue;
          sets.push(`${f} = $${p++}`);
          vals.push(b[f]);
          fieldsBeingUpdated.push(f);
        }
      }

      const categoryChanged = fieldsBeingUpdated.includes('category');
      const catDescChanged = fieldsBeingUpdated.includes('cat_desc');
      if (categoryChanged || catDescChanged) {
        const nextCategory = categoryChanged ? b.category : currentRow.category;
        const nextCatDesc = catDescChanged ? b.cat_desc : currentRow.cat_desc;
        const resinTaxonomyCategoryId = await resolveResinTaxonomyCategoryId(pool, nextCategory, nextCatDesc);

        sets.push(`taxonomy_category_id = $${p++}`);
        vals.push(resinTaxonomyCategoryId);
      }

      if (!sets.length) {
        if (isAutoSync) {
          const current = await pool.query('SELECT * FROM mes_material_tds WHERE id = $1', [req.params.id]);
          if (!current.rows.length) return res.status(404).json({ success: false, error: 'TDS not found' });
          return res.json({
            success: true,
            data: current.rows[0],
            lockedFields: current.rows[0].user_locked_fields,
            skipped: true,
            message: 'All requested fields are locked; no update applied',
          });
        }
        return res.status(400).json({ success: false, error: 'No fields to update' });
      }

      // Lock the fields that were explicitly set by the user
      if (lockFields && fieldsBeingUpdated.length) {
        sets.push(`user_locked_fields = (
          SELECT ARRAY(
            SELECT DISTINCT unnest(user_locked_fields || $${p}::TEXT[])
          ) FROM mes_material_tds WHERE id = $${p + 1}
        )`);
        vals.push(fieldsBeingUpdated);   // $p
        vals.push(req.params.id);        // $p+1
        p += 2;
      }

      sets.push(`updated_at = NOW()`);
      vals.push(req.params.id);
      const sql = `UPDATE mes_material_tds SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`;
      const { rows } = await pool.query(sql, vals);
      if (!rows.length) return res.status(404).json({ success: false, error: 'TDS not found' });
      res.json({ success: true, data: rows[0], lockedFields: rows[0].user_locked_fields });
    } catch (err) {
      logger.error('PUT /tds/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to update TDS record' });
    }
  });

  // ─── PATCH /tds/:id/unlock-fields — Remove fields from user_locked_fields ──
  router.patch('/tds/:id/unlock-fields', authenticate, async (req, res) => {
    try {
      if (!isTdsWriter(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
      const { fields } = req.body; // array of field names to unlock
      if (!Array.isArray(fields) || !fields.length) {
        return res.status(400).json({ success: false, error: 'fields array required' });
      }
      const { rows } = await pool.query(
        `UPDATE mes_material_tds
         SET user_locked_fields = ARRAY(
           SELECT unnest(user_locked_fields)
           EXCEPT SELECT unnest($1::TEXT[])
         ), updated_at = NOW()
         WHERE id = $2 RETURNING user_locked_fields`,
        [fields, req.params.id]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'TDS not found' });
      res.json({ success: true, unlockedFields: fields, remaining: rows[0].user_locked_fields });
    } catch (err) {
      logger.error('PATCH /tds/:id/unlock-fields error:', err);
      res.status(500).json({ success: false, error: 'Failed to unlock fields' });
    }
  });

  // ─── PUT /tds/:id/validate — Set status=verified ────────────────────────
  router.put('/tds/:id/validate', authenticate, async (req, res) => {
    try {
      if (!isTdsWriter(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
      const { rows } = await pool.query(
        `UPDATE mes_material_tds
         SET status = 'verified', validated_by = $1, validated_at = NOW(), updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [req.user.id, req.params.id]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'TDS not found' });
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('PUT /tds/:id/validate error:', err);
      res.status(500).json({ success: false, error: 'Failed to validate TDS record' });
    }
  });

  // ─── POST /tds/:id/attachments — Upload PDF + smart field extraction ───────
  router.post('/tds/:id/attachments', authenticate, upload.single('file'), async (req, res) => {
    try {
      if (!isTdsWriter(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
      if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

      // Verify TDS exists and fetch current values for diff
      const check = await pool.query('SELECT * FROM mes_material_tds WHERE id = $1', [req.params.id]);
      if (!check.rows.length) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ success: false, error: 'TDS not found' });
      }
      const existing = check.rows[0];
      const requestedTdsId = Number(existing.id);
      let effectiveTdsId = requestedTdsId;
      let effectiveRecord = existing;

      const supplierLookupRes = await pool.query(
        `SELECT id, name
         FROM mes_suppliers
         WHERE is_active = true
         ORDER BY LENGTH(name) DESC, name ASC`
      );
      const supplierRows = supplierLookupRes.rows || [];
      const supplierById = new Map(supplierRows.map((s) => [Number(s.id), normalizeText(s.name)]));

      const currentSupplierId = Number(existing.supplier_id || 0);
      const currentSupplierName = supplierById.get(currentSupplierId) || null;

      const ext = path.extname(req.file.originalname).toLowerCase();

      // ── Smart extraction (PDF only) ─────────────────────────────────────
      let extracted = {};
      let extractedByDomain = { resin_core: {}, film: {} };
      let resinDiff = [];
      let filmDiff = [];
      let diff = [];
      let parsedSupplier = null;
      let supplierAutoAction = null;

      if (ext === '.pdf') {
        try {
          const buf = fs.readFileSync(req.file.path);
          const parser = new PDFParse({ data: new Uint8Array(buf), verbosity: 0 });
          await parser.load();
          const result = await parser.getText();
          const rawText = result.pages.map((p) => p.text).join('\n');

          extracted = extractFromText(rawText);

          // Also try schema-driven extraction for richer results
          try {
            const { rows: resinDefs } = await pool.query(
              `SELECT field_key, label, unit, field_type, min_value AS min, max_value AS max, step,
                      has_test_method, test_method_options
               FROM mes_parameter_definitions WHERE material_class = 'resins' OR (material_class = 'substrates' AND profile IS NULL)
               ORDER BY sort_order`
            );
            if (resinDefs.length) {
              const schemaExtracted = extractBySchema(rawText, resinDefs);
              // Merge: schema results fill gaps in legacy extraction
              for (const [k, v] of Object.entries(schemaExtracted)) {
                if (extracted[k] === undefined || extracted[k] === null) extracted[k] = v;
              }
            }
          } catch (schemaErr) {
            logger.warn('Schema-driven extraction fallback:', schemaErr.message);
          }

          extractedByDomain = { resin_core: extracted, film: {} };

          parsedSupplier = inferSupplierFromEvidence(rawText, req.file.originalname, supplierRows);

          if (parsedSupplier && Number(parsedSupplier.id) !== currentSupplierId) {
            const currentOracleCode = normalizeText(existing.oracle_item_code);

            if (currentOracleCode) {
              const duplicateTarget = await findTdsBySupplierAndOracleCode(
                pool,
                parsedSupplier.id,
                currentOracleCode,
                existing.id
              );

              if (duplicateTarget) {
                effectiveTdsId = Number(duplicateTarget.id);
                effectiveRecord = duplicateTarget;
                supplierAutoAction = {
                  action: 'routed_to_existing_record',
                  reason: 'supplier_oracle_duplicate_exists',
                  oracleItemCode: currentOracleCode,
                  fromTdsId: requestedTdsId,
                  toTdsId: effectiveTdsId,
                  fromSupplierId: existing.supplier_id || null,
                  fromSupplierName: currentSupplierName,
                  toSupplierId: parsedSupplier.id,
                  toSupplierName: parsedSupplier.name,
                };
              }
            }

            if (effectiveTdsId === requestedTdsId) {
              const updateSupplierRes = await pool.query(
                `UPDATE mes_material_tds
                 SET supplier_id = $1,
                     updated_at = NOW()
                 WHERE id = $2
                 RETURNING *`,
                [parsedSupplier.id, requestedTdsId]
              );

              if (updateSupplierRes.rows.length) {
                effectiveRecord = updateSupplierRes.rows[0];
                effectiveTdsId = Number(effectiveRecord.id);
                supplierAutoAction = {
                  action: 'updated_record_supplier',
                  reason: 'supplier_inferred_from_upload',
                  oracleItemCode: normalizeText(effectiveRecord.oracle_item_code),
                  fromTdsId: requestedTdsId,
                  toTdsId: effectiveTdsId,
                  fromSupplierId: existing.supplier_id || null,
                  fromSupplierName: currentSupplierName,
                  toSupplierId: parsedSupplier.id,
                  toSupplierName: parsedSupplier.name,
                };
              }
            }
          }

          resinDiff = diffWithRecord(
            extracted,
            effectiveRecord,
            effectiveRecord.user_locked_fields,
            { domain: 'resin_core' }
          );
          diff = resinDiff;
        } catch (parseErr) {
          logger.warn('TDS PDF parse warning (non-fatal):', parseErr.message);
          // extraction failure is non-fatal — file is still saved to the selected record
        }
      }

      // Content-hash based idempotency: same attachment content on same TDS should not duplicate.
      let attachmentRow = null;
      let duplicateSkipped = false;
      let staleDuplicateRows = [];
      const uploadedFileHash = computeFileSha256(req.file.path);
      const tx = await pool.connect();
      try {
        await tx.query('BEGIN');
        await tx.query('SELECT pg_advisory_xact_lock($1)', [effectiveTdsId]);

        const candidateRes = await tx.query(
          `SELECT id, tds_id, file_name, file_path, file_type, file_size, uploaded_by, uploaded_at
           FROM mes_tds_attachments
           WHERE tds_id = $1
             AND file_size = $2
           ORDER BY uploaded_at DESC, id DESC
           LIMIT 200`,
          [effectiveTdsId, req.file.size]
        );

        if (uploadedFileHash) {
          const matchingRows = [];
          for (const row of candidateRes.rows) {
            const existingHash = computeFileSha256(row.file_path);
            if (existingHash && existingHash === uploadedFileHash) {
              matchingRows.push(row);
            }
          }

          if (matchingRows.length) {
            duplicateSkipped = true;
            attachmentRow = matchingRows[0];
            staleDuplicateRows = matchingRows.slice(1);

            const staleIds = staleDuplicateRows
              .map((r) => Number(r.id))
              .filter((id) => Number.isFinite(id));

            if (staleIds.length) {
              await tx.query(
                `DELETE FROM mes_tds_attachments
                 WHERE id = ANY($1::INT[])`,
                [staleIds]
              );
            }
          }
        }

        if (!attachmentRow) {
          const { rows } = await tx.query(
            `INSERT INTO mes_tds_attachments (tds_id, file_name, file_path, file_type, file_size, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [effectiveTdsId, req.file.originalname, req.file.path, ext, req.file.size, req.user.id]
          );
          attachmentRow = rows[0];
        }

        const sourceMeta = buildSourceMetadataForUpload(
          req.file.originalname,
          ext,
          effectiveTdsId,
          attachmentRow?.id
        );

        const sourceUpdateRes = await tx.query(
          `UPDATE mes_material_tds
           SET source_name = $1,
               source_url = $2,
               source_date = $3,
               updated_at = NOW()
           WHERE id = $4
           RETURNING *`,
          [sourceMeta.sourceName, sourceMeta.sourceUrl, sourceMeta.sourceDate, effectiveTdsId]
        );
        if (sourceUpdateRes.rows.length) {
          effectiveRecord = sourceUpdateRes.rows[0];
        }

        await tx.query('COMMIT');
      } catch (txErr) {
        await tx.query('ROLLBACK');
        throw txErr;
      } finally {
        tx.release();
      }

      if (duplicateSkipped && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupErr) {
          logger.warn('Failed to delete duplicate upload file:', cleanupErr.message);
        }
      }

      for (const stale of staleDuplicateRows) {
        if (!stale?.file_path) continue;
        if (stale.file_path === attachmentRow?.file_path) continue;
        if (!fs.existsSync(stale.file_path)) continue;

        try {
          fs.unlinkSync(stale.file_path);
        } catch (cleanupErr) {
          logger.warn('Failed to delete stale duplicate attachment file:', cleanupErr.message);
        }
      }

      res.status(201).json({
        success: true,
        data: attachmentRow,
        requestedTdsId,
        effectiveTdsId,
        duplicateSkipped,
        duplicateReason: duplicateSkipped ? 'content_hash_match' : null,
        sourceUpdated: true,
        supplierAutoAction,
        extracted,
        extractedByDomain,
        resinDiff,
        filmDiff,
        parsedSupplier,
        diff,          // array of { field, label, currentValue, extractedValue, isEmpty, domain }
      });
    } catch (err) {
      logger.error('POST /tds/:id/attachments error:', err);
      res.status(500).json({ success: false, error: 'Failed to upload attachment' });
    }
  });

  // ─── GET /tds/:id/attachments/:attachId — Download file ─────────────────
  router.get('/tds/:id/attachments/:attachId', authenticate, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM mes_tds_attachments WHERE id = $1 AND tds_id = $2`,
        [req.params.attachId, req.params.id]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'Attachment not found' });
      const att = rows[0];
      if (!fs.existsSync(att.file_path)) return res.status(404).json({ success: false, error: 'File not found on disk' });
      res.download(att.file_path, att.file_name);
    } catch (err) {
      logger.error('GET /tds attachment error:', err);
      res.status(500).json({ success: false, error: 'Failed to download attachment' });
    }
  });

  // ─── DELETE /tds/:id/attachments/:attachId — Remove single attachment ──────
  router.delete('/tds/:id/attachments/:attachId', authenticate, async (req, res) => {
    try {
      if (!isTdsWriter(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
      const { rows } = await pool.query(
        'SELECT * FROM mes_tds_attachments WHERE id = $1 AND tds_id = $2',
        [req.params.attachId, req.params.id]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'Attachment not found' });
      if (fs.existsSync(rows[0].file_path)) fs.unlinkSync(rows[0].file_path);
      await pool.query('DELETE FROM mes_tds_attachments WHERE id = $1', [req.params.attachId]);
      res.json({ success: true, message: 'Attachment removed' });
    } catch (err) {
      logger.error('DELETE /tds attachment error:', err);
      res.status(500).json({ success: false, error: 'Failed to remove attachment' });
    }
  });

  // ─── DELETE /tds/:id — Delete TDS record ─────────────────────────────────
  router.delete('/tds/:id', authenticate, async (req, res) => {
    try {
      if (!isTdsWriter(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });

      // Delete attachment files from disk first
      const attRes = await pool.query('SELECT file_path FROM mes_tds_attachments WHERE tds_id = $1', [req.params.id]);
      for (const att of attRes.rows) {
        if (fs.existsSync(att.file_path)) fs.unlinkSync(att.file_path);
      }

      const { rowCount } = await pool.query('DELETE FROM mes_material_tds WHERE id = $1', [req.params.id]);
      if (!rowCount) return res.status(404).json({ success: false, error: 'TDS not found' });
      res.json({ success: true, message: 'TDS record deleted' });
    } catch (err) {
      logger.error('DELETE /tds/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete TDS record' });
    }
  });

  // ─── GET /tds/stats — Summary statistics ─────────────────────────────────
  router.get('/tds/stats', authenticate, async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'verified') AS verified,
          COUNT(*) FILTER (WHERE status = 'review') AS review,
          COUNT(*) FILTER (WHERE status = 'draft') AS draft,
          COUNT(*) FILTER (WHERE status = 'corrected') AS corrected,
          COUNT(DISTINCT supplier_id) AS suppliers,
          COUNT(DISTINCT cat_desc) AS categories
        FROM mes_material_tds
      `);
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('GET /tds/stats error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    }
  });

  // ─── GET /tds/spec-status — DB-driven spec completion for a material ─────
  // Uses mes_parameter_definitions to calculate filled/total dynamically.
  router.get('/tds/spec-status', authenticate, async (req, res) => {
    try {
      const materialClass = String(req.query.material_class || '').trim().toLowerCase();
      const materialKey = String(req.query.material_key || '').trim().toLowerCase();
      if (!materialClass || !materialKey) {
        return res.status(400).json({ success: false, error: 'material_class and material_key required' });
      }

      // Get parameter definitions for this class
      const context = {
        mainitem: req.query.mainitem || '',
        maindescription: req.query.maindescription || '',
        catlinedesc: req.query.catlinedesc || '',
      };
      const { profile, rules } = await getParamRulesFromDB(materialClass, context);
      const totalParams = rules.filter(r => r.type !== 'json_array').length;
      const requiredParams = rules.filter(r => r.required && r.type !== 'json_array');

      // Get current spec data
      let paramsJson = {};
      if (materialClass === 'resins') {
        // Resin uses mes_material_tds — count non-null typed columns
        const { rows } = await pool.query(
          `SELECT * FROM mes_material_tds WHERE LOWER(TRIM(oracle_item_code)) = $1 LIMIT 1`,
          [materialKey]
        );
        if (rows.length) {
          const r = rows[0];
          const resinFields = ['mfr_190_2_16','mfr_190_5_0','hlmi_190_21_6','mfr_230_2_16_pp',
            'melt_flow_ratio','density','crystalline_melting_point','vicat_softening_point',
            'heat_deflection_temp','tensile_strength_break','elongation_break',
            'brittleness_temp','bulk_density','flexural_modulus'];
          const filled = resinFields.filter(f => r[f] != null).length;
          return res.json({ success: true, data: { profile: 'resins', filled, total: resinFields.length, pct: Math.round(filled/resinFields.length*100), status: r.status } });
        }
        return res.json({ success: true, data: { profile: 'resins', filled: 0, total: 14, pct: 0, status: null } });
      }

      // Non-resin: check new category-specific table first, fallback to legacy
      const specTable = await getSpecTable(materialClass);
      let specRes;
      if (specTable) {
        specRes = await pool.query(
          `SELECT parameters_json, status FROM ${specTable} WHERE material_key = $1 LIMIT 1`,
          [materialKey]
        );
      }
      if (!specRes || !specRes.rows.length) {
        specRes = await pool.query(
          `SELECT parameters_json, status FROM mes_non_resin_material_specs WHERE material_class = $1 AND material_key = $2 LIMIT 1`,
          [materialClass, materialKey]
        );
      }
      if (specRes.rows.length) {
        paramsJson = specRes.rows[0].parameters_json || {};
      }

      const filled = rules.filter(r => r.type !== 'json_array' && paramsJson[r.key] != null && paramsJson[r.key] !== '').length;
      const requiredFilled = requiredParams.filter(r => paramsJson[r.key] != null && paramsJson[r.key] !== '').length;

      return res.json({
        success: true,
        data: {
          profile,
          filled,
          total: totalParams,
          pct: totalParams > 0 ? Math.round(filled / totalParams * 100) : 0,
          required_filled: requiredFilled,
          required_total: requiredParams.length,
          status: specRes.rows[0]?.status || null,
        },
      });
    } catch (err) {
      logger.error('GET /tds/spec-status error:', err);
      res.status(500).json({ success: false, error: 'Failed to calculate spec status' });
    }
  });
};

// Test-only exports — internal parser helpers (not used at runtime route layer)
module.exports.__testOnly = {
  detectCombinedComponentLayout,
  extractTwoColumnBySchema,
  extractAluFoilFromText,
};
