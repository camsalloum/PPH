/**
 * Migration: Seed standard/typical non-resin substrate parameters
 * 
 * Populates mes_non_resin_material_specs with industry-standard typical values
 * from SUBSTRATE_PARAMETERS_REFERENCE.md for every Film item in fp_actualrmdata.
 * 
 * - Status set to 'standard' (new status meaning industry-typical, not supplier-verified)
 * - Thickness and width extracted from maindescription where possible
 * - Yield auto-calculated from density + thickness
 * - Does NOT overwrite existing rows that already have status != 'standard'
 * 
 * Run: node server/migrations/mes-master-024-seed-standard-film-specs.js
 */

const { Pool } = require('pg');

const pool = new Pool({
  user:     process.env.DB_USER     || 'postgres',
  host:     process.env.DB_HOST     || 'localhost',
  database: process.env.DB_NAME     || 'fp_database',
  password: process.env.DB_PASSWORD || '',
  port:     parseInt(process.env.DB_PORT) || 5432,
});

// ─── Substrate Profile Regex (mirrors tds.js SUBSTRATE_PROFILES) ──────────
const SUBSTRATE_MAP = [
  { key: 'films_bopp',    re: /\bbopp\b/i },
  { key: 'films_cpp',     re: /\bcpp\b/i },
  { key: 'films_pet',     re: /\bpet\b(?!\s*[cg]\b)/i },
  { key: 'films_pa',      re: /\b(?:pa|nylon|bopa|polyamide|ny)\b/i },
  { key: 'films_pe',      re: /\bpe\s+(film|lam)/i },
  { key: 'films_pvc',     re: /\bpvc\b/i },
  { key: 'films_petc',    re: /\bpet[\s-]?c\b/i },
  { key: 'films_petg',    re: /\bpetg\b/i },
  { key: 'films_alu_pap', re: /\b(butter\s*foil|alu.*pap|pap.*alu|paper\s*\/\s*foil|foil\s*lam)\b/i },
  { key: 'films_pap',     re: /\b(paper|kraft|greaseproof|glassine)\b/i },
  { key: 'films_alu_foil',re: /(aluminium|aluminum|alu\s*foil|foil\s*alu|\balu\b)(?!\s*\/?…*pap)/i },
];

function resolveProfile(catlinedesc, maindescription, material) {
  const hay = `${catlinedesc || ''} ${maindescription || ''} ${material || ''}`.toLowerCase();
  // Alu/Pap must match before Alu Foil
  for (const { key, re } of SUBSTRATE_MAP) {
    if (re.test(hay)) return key;
  }
  return null;
}

// ─── Standard Typical Values per Profile (from KB) ────────────────────────
// Only populating numeric parameters; text params like treatment_side left null.
// Thickness/density vary per item — thickness extracted from description, density is type-typical.

const STANDARD_VALUES = {
  films_bopp: {
    density_g_cm3: 0.905,
    haze_pct: 1.5,
    gloss_60: 90,
    tensile_strength_md_mpa: 140,
    tensile_strength_td_mpa: 250,
    elongation_md_pct: 130,
    elongation_td_pct: 60,
    cof_static: 0.3,
    cof_kinetic: 0.2,
    corona_dyne: 40,
    shrinkage_md_pct: 2.0,
    shrinkage_td_pct: 1.0,
    otr_cc_m2_day: 1600,
    wvtr_g_m2_day: 6,
    seal_strength_n_15mm: 3.5,
    tear_strength_md_mn: 80,
    tear_strength_td_mn: 200,
  },

  films_cpp: {
    density_g_cm3: 0.900,
    haze_pct: 2.5,
    gloss_60: 85,
    tensile_strength_md_mpa: 65,
    tensile_strength_td_mpa: 45,
    elongation_md_pct: 550,
    elongation_td_pct: 550,
    cof_static: 0.35,
    cof_kinetic: 0.25,
    seal_init_temp_c: 130,
    seal_strength_n_15mm: 3.5,
    hot_tack_temp_c: 130,
    hot_tack_strength_n_15mm: 2.0,
    otr_cc_m2_day: 3000,
    wvtr_g_m2_day: 8,
    corona_dyne: 40,
    dart_drop_g: 120,
    puncture_resistance_n: 8,
  },

  films_pet: {
    density_g_cm3: 1.39,
    haze_pct: 1.5,
    gloss_60: 130,
    tensile_strength_md_mpa: 200,
    tensile_strength_td_mpa: 220,
    elongation_md_pct: 120,
    elongation_td_pct: 100,
    shrinkage_md_pct: 1.2,
    shrinkage_td_pct: 0.4,
    otr_cc_m2_day: 50,
    wvtr_g_m2_day: 15,
    corona_dyne: 44,
    cof_static: 0.35,
    cof_kinetic: 0.25,
  },

  films_pa: {
    density_g_cm3: 1.14,
    tensile_strength_md_mpa: 100,
    tensile_strength_td_mpa: 100,
    elongation_md_pct: 350,
    elongation_td_pct: 350,
    puncture_resistance_n_mm: 20,
    otr_cc_m2_day: 30,
    wvtr_g_m2_day: 150,
    corona_dyne: 44,
    haze_pct: 3,
    moisture_content_pct: 2.5,
    cof_static: 0.4,
    cof_kinetic: 0.3,
  },

  films_pe: {
    density_g_cm3: 0.920,
    mfi_g_10min: 2.0,
    seal_temp_min_c: 110,
    seal_temp_max_c: 160,
    seal_strength_n_15mm: 5,
    dart_drop_g: 200,
    cof_static: 0.3,
    cof_kinetic: 0.2,
    tensile_strength_md_mpa: 25,
    elongation_md_pct: 500,
    corona_dyne: 38,
  },

  films_pvc: {
    density_g_cm3: 1.35,
    haze_pct: 3,
    gloss_60: 80,
    tensile_strength_md_mpa: 50,
    tensile_strength_td_mpa: 45,
    elongation_md_pct: 200,
    elongation_td_pct: 150,
    shrinkage_md_pct_max: 60,
    shrinkage_td_pct_max: 10,
    shrink_onset_temp_c: 65,
    shrink_tunnel_temp_c: 90,
    shrink_force_n: 2.0,
    natural_shrink_pct: 1.5,
    shrink_curve: [
      { temp_c: 60, md_pct: 2, td_pct: 1 },
      { temp_c: 70, md_pct: 10, td_pct: 3 },
      { temp_c: 80, md_pct: 30, td_pct: 8 },
      { temp_c: 90, md_pct: 55, td_pct: 12 },
      { temp_c: 100, md_pct: 65, td_pct: 15 },
    ],
  },

  films_petc: {
    density_g_cm3: 1.33,
    haze_pct: 2,
    gloss_60: 100,
    tensile_strength_md_mpa: 100,
    tensile_strength_td_mpa: 80,
    elongation_md_pct: 60,
    elongation_td_pct: 50,
    shrinkage_md_pct_max: 70,
    shrinkage_td_pct_max: 5,
    shrink_onset_temp_c: 60,
    shrink_tunnel_temp_c: 80,
    shrink_force_n: 3.0,
    natural_shrink_pct: 1.0,
    shrink_curve: [
      { temp_c: 55, md_pct: 3, td_pct: 1 },
      { temp_c: 65, md_pct: 15, td_pct: 4 },
      { temp_c: 75, md_pct: 40, td_pct: 8 },
      { temp_c: 85, md_pct: 60, td_pct: 12 },
      { temp_c: 95, md_pct: 72, td_pct: 15 },
    ],
  },

  films_petg: {
    density_g_cm3: 1.27,
    haze_pct: 1.5,
    gloss_60: 110,
    tensile_strength_md_mpa: 60,
    tensile_strength_td_mpa: 50,
    elongation_md_pct: 80,
    elongation_td_pct: 60,
    shrinkage_md_pct_max: 75,
    shrinkage_td_pct_max: 3,
    shrink_onset_temp_c: 55,
    shrink_tunnel_temp_c: 75,
    shrink_force_n: 1.5,
    natural_shrink_pct: 0.8,
    shrink_curve: [
      { temp_c: 50, md_pct: 5, td_pct: 1 },
      { temp_c: 60, md_pct: 20, td_pct: 4 },
      { temp_c: 70, md_pct: 50, td_pct: 10 },
      { temp_c: 80, md_pct: 70, td_pct: 14 },
      { temp_c: 90, md_pct: 78, td_pct: 16 },
    ],
  },

  films_pap: {
    density_g_cm3: 0.8,
    tensile_strength_md_kn_m: 5,
    tensile_strength_td_kn_m: 3,
    elongation_md_pct: 4,
    burst_strength_kpa: 250,
    tear_strength_md_mn: 500,
    cobb_60_g_m2: 25,
    porosity_sec: 50,
    brightness_pct: 85,
    opacity_pct: 90,
    smoothness_sec: 50,
    moisture_content_pct: 7,
  },

  films_alu_pap: {
    total_thickness_mic: 80,
    alu_thickness_mic: 9,
    paper_grammage_gsm: 40,
    total_grammage_gsm: 65,
    wvtr_g_m2_day: 0.1,
    otr_cc_m2_day: 0.1,
  },

  films_alu_foil: {
    alloy: '1235',
    temper: 'O',
    thickness_min_mm: 0.006,
    thickness_max_mm: 0.040,
    width_tolerance_mm: 1,
    silicon_min_pct: 0.5,
    silicon_max_pct: 0.9,
    iron_min_pct: 0.6,
    iron_max_pct: 1.0,
    tensile_strength_min_mpa: 40,
    tensile_strength_max_mpa: 80,
    elongation_min_pct: 2,
    wettability_dyne_cm: 34,
    pinhole_count_per_m2: 5,
  },
};

// ─── Extract thickness (µm) and width (mm) from description ───────────────
function parseThicknessWidth(desc) {
  const result = {};
  if (!desc) return result;
  const d = desc.toUpperCase();
  
  // Pattern: "20MIC*1220 MM" or "20MIC*1220MM" or "20 MIC * 1220"
  let m = d.match(/(\d+(?:\.\d+)?)\s*MIC\w*\s*[*×xX]\s*(\d+(?:\.\d+)?)/);
  if (m) {
    result.thickness_mic = parseFloat(m[1]);
    result.width_mm = parseFloat(m[2]);
    return result;
  }
  
  // Pattern: "36MIC" alone
  m = d.match(/(\d+(?:\.\d+)?)\s*MIC\b/);
  if (m) result.thickness_mic = parseFloat(m[1]);
  
  // Pattern: width in MM like "* 1220MM" or "1000MM"
  m = d.match(/[*×xX]\s*(\d+)\s*MM/);
  if (m) result.width_mm = parseFloat(m[1]);

  // Paper: grammage pattern "75GSM" or "60 GSM"
  m = d.match(/(\d+(?:\.\d+)?)\s*GSM/);
  if (m) result.grammage_gsm = parseFloat(m[1]);
  
  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function run() {
  console.log('--- Seeding standard film specs from KB ---');
  
  // Ensure 'standard' is a valid status by adding it to the constraint if needed
  // (The migration script handles this at app level; the DB has no enum constraint)
  
  // Fetch all Film items
  const { rows: films } = await pool.query(`
    SELECT mainitem, maindescription, catlinedesc, material, mainunit
    FROM fp_actualrmdata
    WHERE category = 'Films'
    ORDER BY catlinedesc, mainitem
  `);
  
  console.log(`Found ${films.length} film items`);
  
  let inserted = 0, updated = 0, skipped = 0, unmatched = 0;
  const profileCounts = {};
  
  for (const film of films) {
    const profile = resolveProfile(film.catlinedesc, film.maindescription, film.material);
    
    if (!profile || !STANDARD_VALUES[profile]) {
      console.log(`  ⚠ No profile for: ${film.catlinedesc} | ${film.maindescription}`);
      unmatched++;
      continue;
    }
    
    profileCounts[profile] = (profileCounts[profile] || 0) + 1;
    
    const materialKey = (film.mainitem || film.maindescription || '').trim().toLowerCase().replace(/\s+/g, '');
    if (!materialKey) { skipped++; continue; }
    
    // Start with standard KB values
    const params = { ...STANDARD_VALUES[profile] };
    
    // Override with item-specific data extracted from description
    const parsed = parseThicknessWidth(film.maindescription);
    if (parsed.thickness_mic && params.thickness_mic === undefined) {
      params.thickness_mic = parsed.thickness_mic;
    } else if (parsed.thickness_mic) {
      params.thickness_mic = parsed.thickness_mic;
    }
    if (parsed.grammage_gsm && profile === 'films_pap') {
      params.grammage_gsm = parsed.grammage_gsm;
    }
    
    // Auto-calculate yield if thickness + density present
    if (params.thickness_mic && params.density_g_cm3) {
      params.yield_m2_per_kg = Math.round(1000 / (params.density_g_cm3 * params.thickness_mic) * 100) / 100;
    }
    
    // Check if a row already exists with non-standard status (don't overwrite user data)
    const existing = await pool.query(
      `SELECT id, status FROM mes_non_resin_material_specs 
       WHERE material_class = 'films' AND material_key = $1`,
      [materialKey]
    );
    
    if (existing.rows.length > 0 && existing.rows[0].status !== 'standard') {
      skipped++;
      continue;
    }
    
    // Upsert with standard values
    const result = await pool.query(
      `INSERT INTO mes_non_resin_material_specs (
         material_class, material_key, mainitem, maindescription,
         catlinedesc, mainunit, parameters_json, notes, status,
         created_by, updated_by
       )
       VALUES ('films', $1, $2, $3, $4, $5, $6::jsonb, $7, 'standard', 1, 1)
       ON CONFLICT (material_class, material_key) DO UPDATE
       SET parameters_json = $6::jsonb,
           mainitem = EXCLUDED.mainitem,
           maindescription = EXCLUDED.maindescription,
           catlinedesc = EXCLUDED.catlinedesc,
           mainunit = EXCLUDED.mainunit,
           notes = EXCLUDED.notes,
           status = 'standard',
           updated_by = 1,
           updated_at = NOW()
       RETURNING (xmax = 0) as is_insert`,
      [
        materialKey,
        film.mainitem || null,
        film.maindescription || null,
        film.catlinedesc || null,
        film.mainunit || null,
        JSON.stringify(params),
        'Standard industry-typical values from PPH Knowledge Base. Upload supplier TDS or edit manually for verified specifications.',
      ]
    );
    
    if (result.rows[0].is_insert) inserted++;
    else updated++;
  }
  
  console.log('\n--- Profile Distribution ---');
  for (const [p, c] of Object.entries(profileCounts).sort((a,b) => b[1] - a[1])) {
    console.log(`  ${p}: ${c} items`);
  }
  
  console.log(`\n--- Results ---`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Skipped:  ${skipped} (existing non-standard specs kept)`);
  console.log(`  Unmatched: ${unmatched}`);
  
  // Final count
  const total = await pool.query('SELECT COUNT(*) as cnt FROM mes_non_resin_material_specs');
  console.log(`  Total specs in table: ${total.rows[0].cnt}`);
}

run()
  .then(() => { console.log('\n✅ Done'); process.exit(0); })
  .catch((err) => { console.error('❌ Error:', err); process.exit(1); });
