/**
 * Migration: mes-presales-020-qc-templates-tds-seed.js
 *
 * Phase 4 + 5:
 *   1. Seed QC templates for ALL 8 product groups (BOPP, PET, PA/PE, CPP, Laminates,
 *      Shrink Film, Labels, Metalized) with FP industry-standard parameters
 *   2. Create mes_product_group_tds table for versioned TDS specs
 *   3. Seed estimation product defaults for missing groups (Shrink Film, Labels)
 */
const { pool } = require('../database/config');
const logger = require('../utils/logger');

// ── QC Template definitions per product group ──────────────────────────────
const QC_TEMPLATES = [
  {
    name: 'BOPP — Physical & Optical',
    product_groups: ['BOPP'],
    test_category: 'physical',
    parameters: [
      { name: 'Thickness', spec: 'Per TDS', unit: 'μm', method: 'ASTM D6988', min_value: null, max_value: null, acceptance_formula: '±5%' },
      { name: 'Tensile Strength MD', spec: '≥ 120 MPa', unit: 'MPa', method: 'ASTM D882', min_value: 120, max_value: null, acceptance_formula: '' },
      { name: 'Tensile Strength TD', spec: '≥ 200 MPa', unit: 'MPa', method: 'ASTM D882', min_value: 200, max_value: null, acceptance_formula: '' },
      { name: 'Elongation at Break MD', spec: '≥ 100%', unit: '%', method: 'ASTM D882', min_value: 100, max_value: null, acceptance_formula: '' },
      { name: 'Elongation at Break TD', spec: '≥ 50%', unit: '%', method: 'ASTM D882', min_value: 50, max_value: null, acceptance_formula: '' },
      { name: 'COF Static', spec: '0.2–0.4', unit: '', method: 'ASTM D1894', min_value: 0.2, max_value: 0.4, acceptance_formula: '' },
      { name: 'COF Kinetic', spec: '0.1–0.3', unit: '', method: 'ASTM D1894', min_value: 0.1, max_value: 0.3, acceptance_formula: '' },
      { name: 'Haze', spec: '≤ 2.5%', unit: '%', method: 'ASTM D1003', min_value: null, max_value: 2.5, acceptance_formula: '' },
      { name: 'Gloss (60°)', spec: '≥ 85 GU', unit: 'GU', method: 'ASTM D2457', min_value: 85, max_value: null, acceptance_formula: '' },
    ],
  },
  {
    name: 'BOPP — Print & Seal',
    product_groups: ['BOPP'],
    test_category: 'print',
    parameters: [
      { name: 'Color Delta-E (ΔE00)', spec: '≤ 2.0', unit: '', method: 'Spectrophotometer', min_value: null, max_value: 2.0, acceptance_formula: '' },
      { name: 'Registration', spec: '± 0.5 mm', unit: 'mm', method: 'Visual/Toolmaker', min_value: null, max_value: 0.5, acceptance_formula: '' },
      { name: 'Ink Adhesion (tape test)', spec: 'Pass', unit: '', method: 'ASTM D3359', min_value: null, max_value: null, acceptance_formula: 'tape_test_pass' },
      { name: 'Seal Strength', spec: '≥ 2.0 N/15mm', unit: 'N/15mm', method: 'ASTM F88', min_value: 2.0, max_value: null, acceptance_formula: '' },
      { name: 'OTR', spec: 'Per TDS', unit: 'cc/m²/day', method: 'ASTM D3985', min_value: null, max_value: null, acceptance_formula: '' },
      { name: 'MVTR', spec: 'Per TDS', unit: 'g/m²/day', method: 'ASTM F1249', min_value: null, max_value: null, acceptance_formula: '' },
    ],
  },
  {
    name: 'PET — Physical & Optical',
    product_groups: ['PET'],
    test_category: 'physical',
    parameters: [
      { name: 'Thickness', spec: 'Per TDS', unit: 'μm', method: 'ASTM D6988', min_value: null, max_value: null, acceptance_formula: '±5%' },
      { name: 'Tensile Strength MD', spec: '≥ 120 MPa', unit: 'MPa', method: 'ASTM D882', min_value: 120, max_value: null, acceptance_formula: '' },
      { name: 'Tensile Strength TD', spec: '≥ 200 MPa', unit: 'MPa', method: 'ASTM D882', min_value: 200, max_value: null, acceptance_formula: '' },
      { name: 'Elongation at Break MD', spec: '≥ 100%', unit: '%', method: 'ASTM D882', min_value: 100, max_value: null, acceptance_formula: '' },
      { name: 'Elongation at Break TD', spec: '≥ 50%', unit: '%', method: 'ASTM D882', min_value: 50, max_value: null, acceptance_formula: '' },
      { name: 'COF Static', spec: '0.2–0.4', unit: '', method: 'ASTM D1894', min_value: 0.2, max_value: 0.4, acceptance_formula: '' },
      { name: 'COF Kinetic', spec: '0.1–0.3', unit: '', method: 'ASTM D1894', min_value: 0.1, max_value: 0.3, acceptance_formula: '' },
      { name: 'Haze', spec: '≤ 2.5%', unit: '%', method: 'ASTM D1003', min_value: null, max_value: 2.5, acceptance_formula: '' },
      { name: 'Gloss (60°)', spec: '≥ 85 GU', unit: 'GU', method: 'ASTM D2457', min_value: 85, max_value: null, acceptance_formula: '' },
    ],
  },
  {
    name: 'PET — Print, Seal & Chemical',
    product_groups: ['PET'],
    test_category: 'print',
    parameters: [
      { name: 'Color Delta-E (ΔE00)', spec: '≤ 2.0', unit: '', method: 'Spectrophotometer', min_value: null, max_value: 2.0, acceptance_formula: '' },
      { name: 'Registration', spec: '± 0.5 mm', unit: 'mm', method: 'Visual/Toolmaker', min_value: null, max_value: 0.5, acceptance_formula: '' },
      { name: 'Ink Adhesion (tape test)', spec: 'Pass', unit: '', method: 'ASTM D3359', min_value: null, max_value: null, acceptance_formula: 'tape_test_pass' },
      { name: 'Seal Strength', spec: '≥ 2.0 N/15mm', unit: 'N/15mm', method: 'ASTM F88', min_value: 2.0, max_value: null, acceptance_formula: '' },
      { name: 'OTR', spec: 'Per TDS', unit: 'cc/m²/day', method: 'ASTM D3985', min_value: null, max_value: null, acceptance_formula: '' },
      { name: 'MVTR', spec: 'Per TDS', unit: 'g/m²/day', method: 'ASTM F1249', min_value: null, max_value: null, acceptance_formula: '' },
      { name: 'Solvent Retention', spec: '≤ 10 mg/m²', unit: 'mg/m²', method: 'Swiss Ord. / EuPIA', min_value: null, max_value: 10, acceptance_formula: '' },
    ],
  },
  {
    name: 'PA/PE (Nylon Laminate) — Physical & Barrier',
    product_groups: ['PA/PE', 'PA/PE (Nylon)'],
    test_category: 'physical',
    parameters: [
      { name: 'Thickness', spec: 'Per TDS', unit: 'μm', method: 'ASTM D6988', min_value: null, max_value: null, acceptance_formula: '±5%' },
      { name: 'Tensile Strength MD', spec: '≥ 80 MPa', unit: 'MPa', method: 'ASTM D882', min_value: 80, max_value: null, acceptance_formula: '' },
      { name: 'Elongation at Break', spec: '≥ 300%', unit: '%', method: 'ASTM D882', min_value: 300, max_value: null, acceptance_formula: '' },
      { name: 'Puncture Resistance', spec: '≥ 15 N/mm', unit: 'N/mm', method: 'ASTM F1306', min_value: 15, max_value: null, acceptance_formula: '' },
      { name: 'Seal Strength', spec: '≥ 3.0 N/15mm', unit: 'N/15mm', method: 'ASTM F88', min_value: 3.0, max_value: null, acceptance_formula: '' },
      { name: 'OTR', spec: '≤ 1.0 cc/m²/day', unit: 'cc/m²/day', method: 'ASTM D3985', min_value: null, max_value: 1.0, acceptance_formula: '' },
      { name: 'MVTR', spec: '≤ 5.0 g/m²/day', unit: 'g/m²/day', method: 'ASTM F1249', min_value: null, max_value: 5.0, acceptance_formula: '' },
      { name: 'Solvent Retention', spec: '≤ 10 mg/m²', unit: 'mg/m²', method: 'Swiss Ord. / EuPIA', min_value: null, max_value: 10, acceptance_formula: '' },
    ],
  },
  {
    name: 'CPP — Physical & Seal',
    product_groups: ['CPP'],
    test_category: 'physical',
    parameters: [
      { name: 'Thickness', spec: 'Per TDS', unit: 'μm', method: 'ASTM D6988', min_value: null, max_value: null, acceptance_formula: '±5%' },
      { name: 'Tensile Strength MD', spec: '≥ 60 MPa', unit: 'MPa', method: 'ASTM D882', min_value: 60, max_value: null, acceptance_formula: '' },
      { name: 'Elongation at Break', spec: '≥ 500%', unit: '%', method: 'ASTM D882', min_value: 500, max_value: null, acceptance_formula: '' },
      { name: 'COF Static', spec: '0.2–0.5', unit: '', method: 'ASTM D1894', min_value: 0.2, max_value: 0.5, acceptance_formula: '' },
      { name: 'Seal Strength', spec: '≥ 2.5 N/15mm', unit: 'N/15mm', method: 'ASTM F88', min_value: 2.5, max_value: null, acceptance_formula: '' },
      { name: 'Color (Visual)', spec: 'Pass', unit: '', method: 'Visual', min_value: null, max_value: null, acceptance_formula: 'visual_pass' },
      { name: 'OTR', spec: 'Per TDS', unit: 'cc/m²/day', method: 'ASTM D3985', min_value: null, max_value: null, acceptance_formula: '' },
      { name: 'MVTR', spec: 'Per TDS', unit: 'g/m²/day', method: 'ASTM F1249', min_value: null, max_value: null, acceptance_formula: '' },
    ],
  },
  {
    name: 'Laminates — Physical, Print & Chemical',
    product_groups: ['Laminates'],
    test_category: 'physical',
    parameters: [
      { name: 'Total Thickness', spec: 'Per TDS', unit: 'μm', method: 'ASTM D6988', min_value: null, max_value: null, acceptance_formula: '±5%' },
      { name: 'Bond Strength', spec: '≥ 1.5 N/15mm', unit: 'N/15mm', method: 'ASTM F904', min_value: 1.5, max_value: null, acceptance_formula: '' },
      { name: 'Seal Strength', spec: '≥ 3.0 N/15mm', unit: 'N/15mm', method: 'ASTM F88', min_value: 3.0, max_value: null, acceptance_formula: '' },
      { name: 'Color Delta-E (ΔE00)', spec: '≤ 2.0', unit: '', method: 'Spectrophotometer', min_value: null, max_value: 2.0, acceptance_formula: '' },
      { name: 'Registration', spec: '± 0.5 mm', unit: 'mm', method: 'Visual/Toolmaker', min_value: null, max_value: 0.5, acceptance_formula: '' },
      { name: 'Ink Adhesion', spec: 'Pass', unit: '', method: 'ASTM D3359', min_value: null, max_value: null, acceptance_formula: 'tape_test_pass' },
      { name: 'Solvent Retention', spec: '≤ 10 mg/m²', unit: 'mg/m²', method: 'Swiss Ord. / EuPIA', min_value: null, max_value: 10, acceptance_formula: '' },
    ],
  },
  {
    name: 'Shrink Film — Physical & Optical',
    product_groups: ['Shrink Film'],
    test_category: 'physical',
    parameters: [
      { name: 'Thickness', spec: 'Per TDS', unit: 'μm', method: 'ASTM D6988', min_value: null, max_value: null, acceptance_formula: '±5%' },
      { name: 'Shrink Ratio MD', spec: 'Per TDS', unit: '%', method: 'ASTM D2732', min_value: null, max_value: null, acceptance_formula: '' },
      { name: 'Shrink Ratio TD', spec: 'Per TDS', unit: '%', method: 'ASTM D2732', min_value: null, max_value: null, acceptance_formula: '' },
      { name: 'Haze', spec: '≤ 5.0%', unit: '%', method: 'ASTM D1003', min_value: null, max_value: 5.0, acceptance_formula: '' },
      { name: 'Seal Strength', spec: '≥ 2.0 N/15mm', unit: 'N/15mm', method: 'ASTM F88', min_value: 2.0, max_value: null, acceptance_formula: '' },
    ],
  },
  {
    name: 'Labels — Print & Adhesion',
    product_groups: ['Labels'],
    test_category: 'print',
    parameters: [
      { name: 'Thickness', spec: 'Per TDS', unit: 'μm', method: 'ASTM D6988', min_value: null, max_value: null, acceptance_formula: '±5%' },
      { name: 'Color Delta-E (ΔE00)', spec: '≤ 1.5', unit: '', method: 'Spectrophotometer', min_value: null, max_value: 1.5, acceptance_formula: '' },
      { name: 'Registration', spec: '± 0.3 mm', unit: 'mm', method: 'Visual/Toolmaker', min_value: null, max_value: 0.3, acceptance_formula: '' },
      { name: 'Surface Tension', spec: '≥ 38 dyne/cm', unit: 'dyne/cm', method: 'ASTM D2578', min_value: 38, max_value: null, acceptance_formula: '' },
      { name: 'Die-Cut Accuracy', spec: '± 0.5 mm', unit: 'mm', method: 'Measurement', min_value: null, max_value: 0.5, acceptance_formula: '' },
      { name: 'Ink Adhesion', spec: 'Pass', unit: '', method: 'ASTM D3359', min_value: null, max_value: null, acceptance_formula: 'tape_test_pass' },
    ],
  },
  {
    name: 'Metalized Film — Physical, Optical & Barrier',
    product_groups: ['Metalized', 'Metalized Film'],
    test_category: 'physical',
    parameters: [
      { name: 'Thickness', spec: 'Per TDS', unit: 'μm', method: 'ASTM D6988', min_value: null, max_value: null, acceptance_formula: '±5%' },
      { name: 'Gloss (60°)', spec: '≥ 400 GU', unit: 'GU', method: 'ASTM D2457', min_value: 400, max_value: null, acceptance_formula: '' },
      { name: 'Optical Density (OD)', spec: '≥ 2.2', unit: '', method: 'Densitometer', min_value: 2.2, max_value: null, acceptance_formula: '' },
      { name: 'Seal Strength', spec: '≥ 2.0 N/15mm', unit: 'N/15mm', method: 'ASTM F88', min_value: 2.0, max_value: null, acceptance_formula: '' },
      { name: 'OTR', spec: '≤ 1.0 cc/m²/day', unit: 'cc/m²/day', method: 'ASTM D3985', min_value: null, max_value: 1.0, acceptance_formula: '' },
      { name: 'MVTR', spec: '≤ 0.5 g/m²/day', unit: 'g/m²/day', method: 'ASTM F1249', min_value: null, max_value: 0.5, acceptance_formula: '' },
    ],
  },
];

// ── TDS versioned specs per product group ──────────────────────────────────
const TDS_SEEDS = [
  { product_group: 'BOPP', tds_version: '1.0', parameters: QC_TEMPLATES.filter(t => t.product_groups.includes('BOPP')).flatMap(t => t.parameters) },
  { product_group: 'PET', tds_version: '1.0', parameters: QC_TEMPLATES.filter(t => t.product_groups.includes('PET')).flatMap(t => t.parameters) },
  { product_group: 'PA/PE', tds_version: '1.0', parameters: QC_TEMPLATES.filter(t => t.product_groups.includes('PA/PE')).flatMap(t => t.parameters) },
  { product_group: 'CPP', tds_version: '1.0', parameters: QC_TEMPLATES.filter(t => t.product_groups.includes('CPP')).flatMap(t => t.parameters) },
  { product_group: 'Laminates', tds_version: '1.0', parameters: QC_TEMPLATES.filter(t => t.product_groups.includes('Laminates')).flatMap(t => t.parameters) },
  { product_group: 'Shrink Film', tds_version: '1.0', parameters: QC_TEMPLATES.filter(t => t.product_groups.includes('Shrink Film')).flatMap(t => t.parameters) },
  { product_group: 'Labels', tds_version: '1.0', parameters: QC_TEMPLATES.filter(t => t.product_groups.includes('Labels')).flatMap(t => t.parameters) },
  { product_group: 'Metalized', tds_version: '1.0', parameters: QC_TEMPLATES.filter(t => t.product_groups.includes('Metalized')).flatMap(t => t.parameters) },
];

// ── Estimation defaults for missing product groups ─────────────────────────
const ESTIMATION_SEEDS = [
  {
    product_group: 'Shrink Film',
    default_layers: JSON.stringify([
      { layer: 1, material_category: 'substrate', material_name: 'LDPE/LLDPE blend', thickness: 25 },
    ]),
    default_processes: JSON.stringify({
      extrusion: true, printing: true, rewinding: true,
      lamination_1: false, lamination_2: false, lamination_3: false,
      slitting: true, sleeving: true, sleeve_doctoring: false, pouch_making: false,
    }),
  },
  {
    product_group: 'Labels',
    default_layers: JSON.stringify([
      { layer: 1, material_category: 'substrate', material_name: 'BOPP', thickness: 25 },
    ]),
    default_processes: JSON.stringify({
      extrusion: false, printing: true, rewinding: true,
      lamination_1: false, lamination_2: false, lamination_3: false,
      slitting: true, sleeving: false, sleeve_doctoring: false, pouch_making: false,
    }),
  },
];

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 0. Evolve mes_qc_templates schema ────────────────────────────────────
    // Original table has: product_group VARCHAR, parameters JSONB
    // Routes expect:      product_groups JSONB array, test_parameters JSONB
    // Add new columns if missing, migrate data from old columns
    const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'mes_qc_templates'
        AND column_name IN ('product_groups', 'test_parameters')
    `);
    const existingCols = colCheck.rows.map(r => r.column_name);

    if (!existingCols.includes('product_groups')) {
      await client.query(`ALTER TABLE mes_qc_templates ADD COLUMN product_groups JSONB DEFAULT '[]'::jsonb`);
      // Migrate existing product_group (varchar) → product_groups (jsonb array)
      await client.query(`
        UPDATE mes_qc_templates
        SET product_groups = CASE
          WHEN product_group IS NOT NULL AND product_group != '' THEN jsonb_build_array(product_group)
          ELSE '[]'::jsonb
        END
      `);
      logger.info('Migration 020: added product_groups JSONB column + migrated data');
    }

    if (!existingCols.includes('test_parameters')) {
      await client.query(`ALTER TABLE mes_qc_templates ADD COLUMN test_parameters JSONB DEFAULT '[]'::jsonb`);
      // Copy existing parameters → test_parameters
      await client.query(`UPDATE mes_qc_templates SET test_parameters = COALESCE(parameters, '[]'::jsonb)`);
      logger.info('Migration 020: added test_parameters JSONB column + migrated data');
    }

    // Add missing columns for route compatibility
    const descCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'mes_qc_templates' AND column_name = 'description'
    `);
    if (descCheck.rows.length === 0) {
      await client.query(`ALTER TABLE mes_qc_templates ADD COLUMN description TEXT`);
    }
    const createdByNameCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'mes_qc_templates' AND column_name = 'created_by_name'
    `);
    if (createdByNameCheck.rows.length === 0) {
      await client.query(`ALTER TABLE mes_qc_templates ADD COLUMN created_by_name VARCHAR(255)`);
    }

    // ── 1. Create mes_product_group_tds table ────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_product_group_tds (
        id SERIAL PRIMARY KEY,
        product_group VARCHAR(50) NOT NULL,
        tds_version VARCHAR(20) NOT NULL,
        parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
        effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
        is_current BOOLEAN DEFAULT true,
        notes TEXT,
        created_by INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(product_group, tds_version)
      )
    `);

    // ── 2. Seed QC templates (upsert by name) ───────────────────────────────
    for (const tpl of QC_TEMPLATES) {
      const existing = await client.query(
        `SELECT id FROM mes_qc_templates WHERE name = $1`,
        [tpl.name]
      );
      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE mes_qc_templates
           SET product_groups = $1::jsonb, test_category = $2, test_parameters = $3::jsonb, is_active = true, updated_at = NOW()
           WHERE id = $4`,
          [JSON.stringify(tpl.product_groups), tpl.test_category, JSON.stringify(tpl.parameters), existing.rows[0].id]
        );
      } else {
        await client.query(
          `INSERT INTO mes_qc_templates (name, product_groups, test_category, test_parameters, is_active, created_at, updated_at)
           VALUES ($1, $2::jsonb, $3, $4::jsonb, true, NOW(), NOW())`,
          [tpl.name, JSON.stringify(tpl.product_groups), tpl.test_category, JSON.stringify(tpl.parameters)]
        );
      }
    }

    // ── 3. Seed TDS versions (upsert) ────────────────────────────────────────
    for (const tds of TDS_SEEDS) {
      const existing = await client.query(
        `SELECT id FROM mes_product_group_tds WHERE product_group = $1 AND tds_version = $2`,
        [tds.product_group, tds.tds_version]
      );
      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE mes_product_group_tds SET parameters = $1::jsonb, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(tds.parameters), existing.rows[0].id]
        );
      } else {
        await client.query(
          `INSERT INTO mes_product_group_tds (product_group, tds_version, parameters, is_current)
           VALUES ($1, $2, $3::jsonb, true)`,
          [tds.product_group, tds.tds_version, JSON.stringify(tds.parameters)]
        );
      }
    }

    // ── 4. Seed estimation defaults for missing product groups (skip if table doesn't exist) ──
    const estTableCheck = await client.query(`
      SELECT 1 FROM information_schema.tables WHERE table_name = 'mes_estimation_product_defaults'
    `);
    if (estTableCheck.rows.length > 0) {
      for (const est of ESTIMATION_SEEDS) {
        const existing = await client.query(
          `SELECT id FROM mes_estimation_product_defaults WHERE product_group = $1`,
          [est.product_group]
        );
        if (existing.rows.length === 0) {
          await client.query(
            `INSERT INTO mes_estimation_product_defaults (product_group, default_layers, default_processes, created_at)
             VALUES ($1, $2::jsonb, $3::jsonb, NOW())`,
            [est.product_group, est.default_layers, est.default_processes]
          );
        }
      }
    } else {
      logger.warn('Migration 020: mes_estimation_product_defaults table not found — run migration 018 first to seed estimation defaults');
    }

    await client.query('COMMIT');
    logger.info('Migration mes-presales-020: QC templates + TDS + estimation defaults seeded for all 8 product groups');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration mes-presales-020 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Remove seeded templates
    const templateNames = QC_TEMPLATES.map(t => t.name);
    await client.query(
      `DELETE FROM mes_qc_templates WHERE name = ANY($1::text[])`,
      [templateNames]
    );

    // Remove seeded TDS entries
    await client.query(`DELETE FROM mes_product_group_tds WHERE tds_version = '1.0'`);

    // Remove seeded estimation defaults
    await client.query(
      `DELETE FROM mes_estimation_product_defaults WHERE product_group IN ('Shrink Film', 'Labels')`
    );

    // Drop TDS table
    await client.query('DROP TABLE IF EXISTS mes_product_group_tds');

    await client.query('COMMIT');
    logger.info('Migration mes-presales-020: rollback complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
