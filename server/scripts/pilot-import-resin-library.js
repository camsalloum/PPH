/*
 * Pilot importer for Resin TDS source-of-truth data.
 *
 * Scope for first rollout checkpoint:
 *   - Reads exactly one resin record from Product Groups data/Resins TDS/resin_library.html
 *   - Maps available parameters to mes_material_tds columns
 *   - Upserts by best-match grade logic (fixes legacy supplier mismatch)
 *   - Locks mapped fields to prevent non-manual overwrite
 *
 * Usage:
 *   node scripts/pilot-import-resin-library.js
 *   node scripts/pilot-import-resin-library.js --supplier "Borouge" --grade "FB5600"
 *   node scripts/pilot-import-resin-library.js --dry-run
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool } = require('../database/config');

const SOURCE_PATH = path.join(__dirname, '..', '..', 'Product Groups data', 'Resins TDS', 'resin_library.html');
const SOURCE_NAME = 'resin_library.html';
const SOURCE_URL = 'Product Groups data/Resins TDS/resin_library.html';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    supplier: 'Borouge',
    grade: 'FB5600',
    dryRun: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--supplier') out.supplier = args[i + 1];
    if (a === '--grade') out.grade = args[i + 1];
    if (a === '--dry-run') out.dryRun = true;
  }

  return out;
}

function normalizeText(v) {
  return String(v || '').trim().toLowerCase();
}

function normalizeKey(v) {
  return normalizeText(v).replace(/\s+/g, '');
}

function firstNumber(v) {
  const s = String(v ?? '').replace(/,/g, '').trim();
  if (!s) return null;
  const range = s.match(/(-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (!Number.isNaN(a) && !Number.isNaN(b)) return (a + b) / 2;
  }
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isNaN(n) ? null : n;
}

function densityToKgM3(v, unit) {
  const n = firstNumber(v);
  if (n === null) return null;
  const u = normalizeText(unit);
  if (u.includes('g/cm')) return Math.round(n * 1000);
  if (n < 10) return Math.round(n * 1000);
  return Math.round(n);
}

function parsePpm(text) {
  const m = String(text || '').match(/(\d+(?:\.\d+)?)\s*ppm/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isNaN(n) ? null : Math.round(n);
}

function parsePct(text) {
  const m = String(text || '').match(/(\d+(?:\.\d+)?)\s*%/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isNaN(n) ? null : n;
}

function extractResinArray(html) {
  const marker = 'const G=';
  const start = html.indexOf(marker);
  if (start === -1) throw new Error('Could not find const G= in resin_library.html');

  const arrStart = html.indexOf('[', start);
  const arrEnd = html.indexOf('];', arrStart);
  if (arrStart === -1 || arrEnd === -1) throw new Error('Could not locate G array bounds in resin_library.html');

  const literal = html.slice(arrStart, arrEnd + 1);
  const records = vm.runInNewContext(literal, {});
  if (!Array.isArray(records)) throw new Error('Parsed G is not an array');
  return records;
}

function findSpec(rec, predicate) {
  return (rec.sp || []).find((s) => predicate(normalizeText(s.l)));
}

function inferComonomer(rec) {
  const blob = `${rec.h || ''} ${rec.d || ''}`.toLowerCase();
  if (blob.includes('octene')) return 'Octene (C8)';
  if (blob.includes('hexene')) return 'Hexene (C6)';
  if (blob.includes('butene')) return 'Butene (C4)';
  return null;
}

function inferProcess(rec) {
  const blob = `${rec.h || ''} ${rec.d || ''}`.toLowerCase();
  if (blob.includes('blown/cast') || (blob.includes('blown') && blob.includes('cast'))) return 'Blown / Cast Film';
  if (blob.includes('cast film')) return 'Cast Film';
  if (blob.includes('blown film') || blob.includes('film extrusion')) return 'Blown Film';
  return null;
}

function inferCatalyst(rec) {
  const blob = `${rec.h || ''} ${rec.d || ''} ${(rec.fe || []).join(' ')}`.toLowerCase();
  if (blob.includes('metallocene') || normalizeText(rec.t) === 'mlldpe') return 'Metallocene (single-site)';
  if (blob.includes('bimodal')) return 'Ziegler-Natta Bimodal (Borstar)';
  if (blob.includes('ziegler')) return 'Ziegler-Natta';
  return 'Not stated';
}

function mapResinType(type) {
  if (type === 'PP') return 'Other';
  return type || null;
}

function mapCatDesc(type) {
  if (type === 'PP') return 'Random PP';
  return type || null;
}

function mapPolymerType(type) {
  if (type === 'PP') return 'Polypropylene';
  return type || null;
}

function buildMappedPayload(rec, existingRow, supplierId) {
  const densitySpec = findSpec(rec, (l) => l.startsWith('density'));
  const mfiSpec = findSpec(rec, (l) => l.includes('mfr (2.16kg)') || l.includes('melt index'));
  const hlmiSpec = findSpec(rec, (l) => l.includes('mfr (21.6kg)') || l.includes('hlmi'));
  const meltSpec = findSpec(rec, (l) => l.includes('melt temp') || l.includes('peak melt temp') || l.includes('dsc melt point') || l.includes('melt temp dsc'));
  const vicatSpec = findSpec(rec, (l) => l.includes('vicat'));
  const escrSpec = findSpec(rec, (l) => l.includes('escr'));
  const hazeSpec = findSpec(rec, (l) => l.includes('haze'));
  const glossSpec = findSpec(rec, (l) => l.includes('gloss'));
  const dartSpec = findSpec(rec, (l) => l.includes('dart'));
  const tYieldMdSpec = findSpec(rec, (l) => l.includes('tensile yield md'));
  const tYieldTdSpec = findSpec(rec, (l) => l.includes('tensile yield td') || l.includes('tension yield td'));
  const tBreakMdSpec = findSpec(rec, (l) => l.includes('tensile break md'));
  const tBreakTdSpec = findSpec(rec, (l) => l.includes('tensile break td'));
  const elongMdSpec = findSpec(rec, (l) => l.includes('elong. break md') || l.includes('elongation md'));
  const elongTdSpec = findSpec(rec, (l) => l.includes('elong. break td') || l.includes('elongation td'));
  const tearMdSpec = findSpec(rec, (l) => l.includes('tear md'));
  const tearTdSpec = findSpec(rec, (l) => l.includes('tear td') || l.includes('tear strength td'));
  const punctureForceSpec = findSpec(rec, (l) => l.includes('puncture force'));
  const punctureEnergySpec = findSpec(rec, (l) => l.includes('puncture energy'));
  const modulusSpec = findSpec(rec, (l) => l.includes('flex. modulus') || l.includes('secant'));

  const additives = rec.ad || [];
  const additiveText = additives.join(', ');
  const hasSlip = additives.some((a) => /slip/i.test(a));
  const hasNoSlip = additives.some((a) => /no\s*slip/i.test(a));
  const hasAntiblock = additives.some((a) => /antiblock/i.test(a));
  const hasNoAntiblock = additives.some((a) => /no\s*antiblock/i.test(a));
  const hasProcessingAid = additives.some((a) => /processing aid|ppa/i.test(a));

  const mfi = firstNumber(mfiSpec?.v);
  const hlmi = firstNumber(hlmiSpec?.v);
  const meltFlowRatio = (mfi && hlmi) ? Number((hlmi / mfi).toFixed(2)) : null;

  const fullSpecs = (rec.sp || [])
    .map((s) => `${s.l}: ${s.v}${s.u ? ` ${s.u}` : ''}${s.m ? ` (${s.m})` : ''}`)
    .join('; ');

  const notes = [
    rec.h ? `Header: ${rec.h}` : null,
    rec.d ? `Description: ${rec.d}` : null,
    (rec.fe || []).length ? `Features: ${(rec.fe || []).join(', ')}` : null,
    fullSpecs ? `Source specs: ${fullSpecs}` : null,
  ].filter(Boolean).join('\n\n');

  return {
    oracle_item_code: existingRow?.oracle_item_code || null,
    supplier_id: supplierId,
    brand_grade: rec.g,
    category: 'Resins',
    cat_desc: mapCatDesc(rec.t),
    material_code: existingRow?.material_code || null,
    grade_type: rec.b || existingRow?.grade_type || null,
    status: existingRow?.status || 'review',
    resin_type: mapResinType(rec.t),
    catalyst_type: inferCatalyst(rec),
    comonomer_type: inferComonomer(rec),
    production_process: inferProcess(rec),
    polymer_type: mapPolymerType(rec.t),
    applications: (rec.ap || []).join(', ') || null,
    mfi,
    mfi_test_method: mfiSpec?.m || null,
    hlmi,
    melt_flow_ratio: meltFlowRatio,
    density: densityToKgM3(densitySpec?.v, densitySpec?.u),
    density_test_method: densitySpec?.m || null,
    melting_point: firstNumber(meltSpec?.v),
    vicat_softening: firstNumber(vicatSpec?.v),
    additive_package: additiveText || null,
    slip_type: hasNoSlip ? 'None' : (hasSlip ? 'Not stated' : null),
    slip_ppm: hasNoSlip ? 0 : parsePpm(additiveText),
    antiblock_type: hasNoAntiblock ? 'None' : (hasAntiblock ? 'Not stated' : null),
    antiblock_pct: parsePct(additiveText),
    processing_aid: hasProcessingAid,
    tnpp_free: /tnpp[-\s]?free/i.test(`${rec.d || ''} ${(rec.fe || []).join(' ')}`) ? 'Yes' : 'Not stated',
    haze: firstNumber(hazeSpec?.v),
    gloss: firstNumber(glossSpec?.v),
    dart_drop: firstNumber(dartSpec?.v),
    tensile_yield_md: firstNumber(tYieldMdSpec?.v),
    tensile_yield_td: firstNumber(tYieldTdSpec?.v),
    tensile_break_md: firstNumber(tBreakMdSpec?.v),
    tensile_break_td: firstNumber(tBreakTdSpec?.v),
    elongation_md: firstNumber(elongMdSpec?.v),
    elongation_td: firstNumber(elongTdSpec?.v),
    tear_md: firstNumber(tearMdSpec?.v),
    tear_td: firstNumber(tearTdSpec?.v),
    secant_modulus: firstNumber(modulusSpec?.v),
    escr_value: escrSpec ? String(escrSpec.v) : null,
    escr_condition: escrSpec?.m || null,
    puncture_force: firstNumber(punctureForceSpec?.v),
    puncture_energy: firstNumber(punctureEnergySpec?.v),
    notes: notes || null,
    source_name: SOURCE_NAME,
    source_url: SOURCE_URL,
    source_date: new Date().toISOString().slice(0, 10),
  };
}

async function ensureSupplier(client, supplierName) {
  const result = await client.query(
    `INSERT INTO mes_suppliers (name, is_active)
     VALUES ($1, true)
     ON CONFLICT (name)
     DO UPDATE SET is_active = true
     RETURNING id`,
    [supplierName]
  );
  return result.rows[0].id;
}

async function findTargetRow(client, supplierName, gradeCode, brandName) {
  const result = await client.query(
    `SELECT t.*, s.name AS supplier_name
     FROM mes_material_tds t
     LEFT JOIN mes_suppliers s ON s.id = t.supplier_id
     WHERE LOWER(REPLACE(t.brand_grade, ' ', '')) = LOWER(REPLACE($1, ' ', ''))
        OR LOWER(REPLACE(t.brand_grade, ' ', '')) = LOWER(REPLACE($2, ' ', ''))
        OR LOWER(REPLACE(t.brand_grade, ' ', '')) LIKE LOWER('%' || REPLACE($1, ' ', '') || '%')
     ORDER BY
       CASE
         WHEN LOWER(REPLACE(t.brand_grade, ' ', '')) = LOWER(REPLACE($1, ' ', '')) AND COALESCE(s.name, '') = $3 THEN 1
         WHEN LOWER(REPLACE(t.brand_grade, ' ', '')) = LOWER(REPLACE($1, ' ', '')) THEN 2
         WHEN LOWER(REPLACE(t.brand_grade, ' ', '')) = LOWER(REPLACE($2, ' ', '')) THEN 3
         ELSE 4
       END,
       t.updated_at DESC
     LIMIT 1`,
    [gradeCode, brandName, supplierName]
  );

  return result.rows[0] || null;
}

async function updateRow(client, rowId, payload, lockFields) {
  const entries = Object.entries(payload);
  const sets = entries.map(([k], idx) => `${k} = $${idx + 1}`);
  const values = entries.map(([, v]) => v);

  values.push(lockFields);
  values.push(rowId);

  const sql = `
    UPDATE mes_material_tds
    SET ${sets.join(', ')},
        user_locked_fields = (
          SELECT ARRAY(
            SELECT DISTINCT unnest(COALESCE(user_locked_fields, '{}'::TEXT[]) || $${entries.length + 1}::TEXT[])
          )
        ),
        updated_at = NOW()
    WHERE id = $${entries.length + 2}
    RETURNING id, brand_grade, supplier_id, source_name, user_locked_fields
  `;

  const result = await client.query(sql, values);
  return result.rows[0];
}

async function insertRow(client, payload, lockFields) {
  const entries = Object.entries(payload);
  const cols = entries.map(([k]) => k);
  const placeholders = entries.map((_, idx) => `$${idx + 1}`);
  const values = entries.map(([, v]) => v);

  cols.push('user_locked_fields');
  placeholders.push(`$${placeholders.length + 1}`);
  values.push(lockFields);

  const result = await client.query(
    `INSERT INTO mes_material_tds (${cols.join(', ')})
     VALUES (${placeholders.join(', ')})
     RETURNING id, brand_grade, supplier_id, source_name, user_locked_fields`,
    values
  );

  return result.rows[0];
}

async function main() {
  const { supplier, grade, dryRun } = parseArgs();
  const html = fs.readFileSync(SOURCE_PATH, 'utf8');
  const records = extractResinArray(html);

  const resin = records.find((r) => normalizeText(r.s) === normalizeText(supplier) && normalizeKey(r.g) === normalizeKey(grade));
  if (!resin) {
    throw new Error(`Resin not found in source: supplier=${supplier}, grade=${grade}`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const supplierId = await ensureSupplier(client, resin.s);
    const existing = await findTargetRow(client, resin.s, resin.g, resin.b || resin.g);
    const payload = buildMappedPayload(resin, existing, supplierId);

    const lockFields = Object.entries(payload)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k]) => k)
      .filter((k) => !['status', 'category'].includes(k));

    if (dryRun) {
      console.log('--- PILOT DRY RUN ---');
      console.log('Source resin:', { supplier: resin.s, grade: resin.g, brand: resin.b });
      console.log('Matched existing row:', existing ? {
        id: existing.id,
        brand_grade: existing.brand_grade,
        supplier_name: existing.supplier_name,
      } : null);
      console.log('Mapped fields count:', Object.keys(payload).length);
      console.log('Locked fields count:', lockFields.length);
      await client.query('ROLLBACK');
      return;
    }

    let saved;
    if (existing) {
      saved = await updateRow(client, existing.id, payload, lockFields);
      console.log(`Updated existing TDS row id=${existing.id} for ${resin.s} ${resin.g}`);
    } else {
      saved = await insertRow(client, payload, lockFields);
      console.log(`Inserted new TDS row id=${saved.id} for ${resin.s} ${resin.g}`);
    }

    await client.query('COMMIT');

    console.log('Pilot import completed:');
    console.log({
      id: saved.id,
      grade: saved.brand_grade,
      supplier_id: saved.supplier_id,
      source_name: saved.source_name,
      locked_fields: saved.user_locked_fields?.length || 0,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Pilot import failed:', err.message);
  process.exit(1);
});
