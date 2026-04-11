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
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { PDFParse } = require('pdf-parse');
const {
  extractFromText,
  diffWithRecord,
} = require('../../../utils/tds-pdf-parser');
const { extractBySchema, diffExtractedWithExisting } = require('../../../utils/schema-pdf-parser');

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
const ALU_FOIL_PROFILE_KEY = 'substrates_alu_foil';
const ALU_FOIL_MATCH_RE = /(aluminium|aluminum|alu\s*\/\s*pap|alu\s*foil|foil\s*alu|butter\s*foil|\balu\b)/i;

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
              is_required AS required
       FROM mes_parameter_definitions
       WHERE material_class = $1 AND ($2::text IS NULL AND profile IS NULL OR profile = $2)
       ORDER BY sort_order ASC`,
      [isProfile ? 'substrates' : materialClass, isProfile ? profile : null]
    );
    if (rows.length > 0) {
      return { profile, rules: rows.map(r => ({ ...r, min: r.min ? Number(r.min) : undefined, max: r.max ? Number(r.max) : undefined, step: r.step ? Number(r.step) : undefined })) };
    }
  } catch (e) {
    logger.warn('getParamRulesFromDB fallback to hardcoded:', e.message);
  }
  // Fallback to empty if DB not available
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

  const chemicalMethod = pickMethodCode(text, [/chemical\s+composition/i]);
  if (chemicalMethod) out.chemical_test_method = chemicalMethod;

  const mechanicalMethod = pickMethodCode(text, [/mechanical\s+properties/i, /tensile\s*strength/i, /elongation/i]);
  if (mechanicalMethod) out.mechanical_test_method = mechanicalMethod;

  const gaugeMethod = pickMethodCode(text, [/gauge/i, /thickness\s+measurement/i]);
  if (gaugeMethod) out.gauge_test_method = gaugeMethod;

  const pinholeMethod = pickMethodCode(text, [/pinhole/i]);
  if (pinholeMethod) out.pinhole_test_method = pinholeMethod;

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

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function hasNonEmptyValue(v) {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  return true;
}

function validateNonResinParameters(materialClass, rawParameters, context = {}, rulesOverride = null) {
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

    const text = String(raw).trim();
    if (!text) return;

    if (rule.maxLength && text.length > rule.maxLength) {
      errors.push(`${rule.label} must be at most ${rule.maxLength} characters`);
    }
    if (rule.pattern && !rule.pattern.test(text)) {
      errors.push(rule.patternMessage || `${rule.label} format is invalid`);
    }
    normalized[key] = text;
  });

  rules.forEach((rule) => {
    if (rule.required && !hasNonEmptyValue(params[rule.key])) {
      errors.push(`${rule.label} is required`);
    }
  });

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
      const { rows } = await pool.query(`
        SELECT
          m.id,
          m.oracle_category,
          m.material_class,
          m.display_label,
          m.has_parameters,
          m.sort_order,
          COUNT(DISTINCT LOWER(TRIM(r.mainitem)))::INT AS item_count
        FROM mes_category_mapping m
        LEFT JOIN fp_actualrmdata r
          ON UPPER(TRIM(r.category)) = m.oracle_category
          AND COALESCE(TRIM(r.mainitem), '') <> ''
        WHERE m.is_active = true
        GROUP BY m.id, m.oracle_category, m.material_class, m.display_label, m.has_parameters, m.sort_order
        ORDER BY m.sort_order ASC, m.display_label ASC
      `);
      res.json({ success: true, data: rows, count: rows.length });
    } catch (err) {
      logger.error('GET /tds/category-mapping error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch category mapping' });
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
      if (!isTdsWriter(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
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
        `SELECT id FROM mes_parameter_definitions WHERE material_class=$1 AND field_key=$2 AND ($3::text IS NULL AND profile IS NULL OR profile=$3)`,
        [matClass, fieldKey, profile]
      );
      if (existing.rows.length) return res.status(409).json({ success: false, error: `field_key '${fieldKey}' already exists for this class/profile` });
      const { rows } = await pool.query(`
        INSERT INTO mes_parameter_definitions
          (material_class, profile, field_key, label, unit, field_type, step, min_value, max_value, max_length,
           is_required, sort_order, is_core, display_width, display_group, display_row, placeholder, help_text,
           has_test_method, test_method_options)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
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
        ]
      );
      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('POST /tds/parameter-definitions error:', err);
      res.status(500).json({ success: false, error: 'Failed to create parameter definition' });
    }
  });

  // ─── PUT /tds/parameter-definitions/reorder — Bulk reorder ──────────────
  router.put('/tds/parameter-definitions/reorder', authenticate, async (req, res) => {
    try {
      if (!isTdsWriter(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
      const { order } = req.body || {};
      if (!Array.isArray(order) || !order.length) return res.status(400).json({ success: false, error: 'order array required' });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const item of order) {
          if (!item.id || item.sort_order == null) continue;
          await client.query('UPDATE mes_parameter_definitions SET sort_order=$1, updated_at=NOW() WHERE id=$2', [Number(item.sort_order), Number(item.id)]);
        }
        await client.query('COMMIT');
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
      if (!isTdsWriter(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
      const { source_material_class, source_profile, target_material_class, target_profile, force } = req.body || {};
      if (!source_material_class || !target_material_class || !target_profile) {
        return res.status(400).json({ success: false, error: 'source_material_class, target_material_class, target_profile required' });
      }
      const src = await pool.query(
        `SELECT * FROM mes_parameter_definitions WHERE material_class=$1 AND ($2::text IS NULL AND profile IS NULL OR profile=$2) ORDER BY sort_order`,
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
               has_test_method, test_method_options)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
          `, [target_material_class, target_profile, row.field_key, row.label, row.unit, row.field_type,
              row.step, row.min_value, row.max_value, row.max_length, row.is_required, row.sort_order,
              row.is_core, row.display_width, row.display_group, row.display_row, row.placeholder,
              row.help_text, row.has_test_method, row.test_method_options]);
        }
        await client.query('COMMIT');
        res.json({ success: true, copied: src.rows.length });
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
    } catch (err) {
      logger.error('POST /tds/parameter-definitions/copy-profile error:', err);
      res.status(500).json({ success: false, error: 'Failed to copy profile' });
    }
  });

  // ─── PUT /tds/parameter-definitions/:id — Update a parameter definition ─
  router.put('/tds/parameter-definitions/:id', authenticate, async (req, res) => {
    try {
      if (!isTdsWriter(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
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
      if (b.param_type !== undefined) addField('param_type', b.param_type || 'input');
      if (b.test_conditions !== undefined) addField('test_conditions', b.test_conditions || null);
      if (!sets.length) return res.status(400).json({ success: false, error: 'No fields to update' });
      sets.push(`updated_at=NOW()`);
      vals.push(id);
      const { rows } = await pool.query(`UPDATE mes_parameter_definitions SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      logger.error('PUT /tds/parameter-definitions/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to update parameter definition' });
    }
  });

  // ─── DELETE /tds/parameter-definitions/:id — Delete a parameter definition
  router.delete('/tds/parameter-definitions/:id', authenticate, async (req, res) => {
    try {
      if (!isTdsWriter(req.user)) return res.status(403).json({ success: false, error: 'Forbidden' });
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
      await pool.query('DELETE FROM mes_parameter_definitions WHERE id=$1', [id]);
      res.json({ success: true, affected_specs: affectedCount });
    } catch (err) {
      logger.error('DELETE /tds/parameter-definitions/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete parameter definition' });
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
          WHERE n.material_key = LOWER(TRIM(COALESCE(f.mainitem, '')))
            OR (
              COALESCE(TRIM(f.mainitem), '') = ''
              AND n.material_key = LOWER(TRIM(COALESCE(f.maindescription, '')))
            )
          ORDER BY n.updated_at DESC NULLS LAST, n.id DESC
          LIMIT 1
        ) nrs ON TRUE
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

      return res.json({
        success: true,
        data: {
          ...rows[0],
          parameters_json: rows[0].parameters_json || {},
          user_locked_fields: rows[0].user_locked_fields || [],
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

  // ─── POST /tds/non-resin-spec/parse-upload — Upload PDF and parse Alu foil values ──
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
         WHERE material_class = $1 AND ($2::text IS NULL AND profile IS NULL OR profile = $2)
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
      const rawText = result.pages.map((p) => p.text).join('\n');

      // Schema-driven extraction — works for ALL categories
      const extracted = extractBySchema(rawText, paramDefs);

      // Also try legacy Alu foil parser if applicable
      if (parameterProfile === ALU_FOIL_PROFILE_KEY) {
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

      return res.status(201).json({
        success: true,
        extracted,
        diff,
        parameter_profile: parameterProfile,
        definitions_used: paramDefs.length,
      });
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
      if (uploadedPath && fs.existsSync(uploadedPath)) {
        try {
          fs.unlinkSync(uploadedPath);
        } catch (cleanupErr) {
          logger.warn('Failed to clean up non-resin upload file:', cleanupErr.message);
        }
      }
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
