/**
 * Migration mes-master-050 — Multi-Level BOM / Formulation System (Phase 1)
 *
 * Creates the new formulation tables and cleans up the deprecated custom-group approach.
 *
 * Changes:
 *   1. Create mes_formulations table (versioned, per Oracle group, all categories)
 *   2. Create mes_formulation_components table (recursive BOM: item | formulation)
 *   3. Soft-delete Adhesive custom groups (is_custom=true, category_id=4) — QA test groups only
 *      Films custom groups (e.g. rLDPE) are intentionally preserved.
 *   4. Rename deprecated mes_adhesive_formulation_components → mes_adhesive_formulation_components_deprecated
 *   5. Drop parent_catlinedesc column from mes_item_category_groups (no longer needed)
 *
 * Run: node server/migrations/mes-master-050-formulations.js
 */
'use strict';

const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'fp_database',
  user: process.env.DB_USER || 'postgres',
  password: String(process.env.DB_PASSWORD ?? ''),
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('Starting migration #050 — Multi-Level BOM / Formulation System...');

    // ─────────────────────────────────────────────────────────────────────────
    // 0. Rename legacy resin-formulation tables (different schema, 0 rows)
    //    These were created by an earlier migration for a resin-specific feature
    //    and have never been used. We preserve them as *_legacy for safety.
    // ─────────────────────────────────────────────────────────────────────────
    const legacyTables = [
      { from: 'mes_formulation_results',    to: 'mes_formulation_results_legacy' },
      { from: 'mes_formulation_components', to: 'mes_formulation_components_legacy' },
      { from: 'mes_formulations',           to: 'mes_formulations_legacy' },
    ];
    for (const { from, to } of legacyTables) {
      const exists = await client.query(`
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1
      `, [from]);
      if (exists.rowCount > 0) {
        await client.query(`ALTER TABLE ${from} RENAME TO ${to}`);
        console.log(`  + renamed ${from} → ${to}`);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Create mes_formulations
    // ─────────────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_formulations (
        id              SERIAL PRIMARY KEY,
        category_id     INTEGER NOT NULL REFERENCES mes_item_categories(id) ON DELETE CASCADE,
        catlinedesc     VARCHAR(255) NOT NULL,
        name            VARCHAR(255) NOT NULL,
        version         INTEGER NOT NULL DEFAULT 1,
        status          VARCHAR(20) NOT NULL DEFAULT 'draft',
        is_default      BOOLEAN NOT NULL DEFAULT false,
        notes           TEXT,
        created_by      INTEGER,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_formulation_version UNIQUE (category_id, catlinedesc, name, version),
        CONSTRAINT chk_formulation_status CHECK (
          status IN ('draft', 'active', 'archived', 'deleted')
        ),
        CONSTRAINT chk_formulation_version_positive CHECK (version > 0)
      )
    `);
    console.log('  + mes_formulations created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_formulation_category
        ON mes_formulations (category_id, catlinedesc)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_formulation_status
        ON mes_formulations (status)
        WHERE status NOT IN ('deleted', 'archived')
    `);
    // Enforce only one default formulation per Oracle group per category
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_formulation_default
        ON mes_formulations (category_id, catlinedesc)
        WHERE is_default = true AND status NOT IN ('deleted', 'archived')
    `);
    console.log('  + indexes on mes_formulations created');

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Create mes_formulation_components
    // ─────────────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_formulation_components (
        id                  SERIAL PRIMARY KEY,
        formulation_id      INTEGER NOT NULL REFERENCES mes_formulations(id) ON DELETE CASCADE,
        component_type      VARCHAR(20) NOT NULL DEFAULT 'item',
        -- For component_type = 'item':
        item_key            TEXT,
        -- For component_type = 'formulation':
        sub_formulation_id  INTEGER REFERENCES mes_formulations(id) ON DELETE SET NULL,
        component_role      VARCHAR(30) NOT NULL DEFAULT 'other',
        parts               NUMERIC(10,4) NOT NULL,
        solids_pct          NUMERIC(6,2),
        unit_price_override NUMERIC(12,4),
        sort_order          INTEGER NOT NULL DEFAULT 0,
        notes               TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        -- Exactly one of item_key or sub_formulation_id must be set
        CONSTRAINT chk_component_ref CHECK (
          (component_type = 'item'        AND item_key IS NOT NULL           AND sub_formulation_id IS NULL)
          OR
          (component_type = 'formulation' AND sub_formulation_id IS NOT NULL AND item_key IS NULL)
        ),
        CONSTRAINT chk_component_type CHECK (
          component_type IN ('item', 'formulation')
        ),
        CONSTRAINT chk_component_role CHECK (
          component_role IN ('resin', 'hardener', 'catalyst', 'solvent',
                             'pigment', 'binder', 'additive', 'base', 'diluent', 'other')
        ),
        CONSTRAINT chk_component_parts CHECK (parts > 0),
        CONSTRAINT chk_component_solids CHECK (
          solids_pct IS NULL OR (solids_pct >= 0 AND solids_pct <= 100)
        ),
        CONSTRAINT chk_component_price CHECK (
          unit_price_override IS NULL OR unit_price_override >= 0
        ),
        -- An item can only appear once per formulation
        CONSTRAINT uq_formulation_item UNIQUE (formulation_id, item_key),
        -- A sub-formulation can only appear once per parent formulation
        CONSTRAINT uq_formulation_sub  UNIQUE (formulation_id, sub_formulation_id)
      )
    `);
    console.log('  + mes_formulation_components created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_formulation_components_fid
        ON mes_formulation_components (formulation_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_formulation_components_sub
        ON mes_formulation_components (sub_formulation_id)
        WHERE sub_formulation_id IS NOT NULL
    `);
    console.log('  + indexes on mes_formulation_components created');

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Soft-delete Adhesive custom groups (category_id = 4, is_custom = true)
    //    Films custom groups (category_id = 1, e.g. rLDPE) are intentionally
    //    preserved — they serve the Custom Item Categories feature, not formulations.
    // ─────────────────────────────────────────────────────────────────────────
    const softDeleteResult = await client.query(`
      UPDATE mes_item_category_groups
         SET is_active = false,
             updated_at = NOW()
       WHERE is_custom = true
         AND category_id = 4
         AND is_active = true
    `);
    console.log(`  + soft-deleted ${softDeleteResult.rowCount} Adhesive custom group(s)`);

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Rename mes_adhesive_formulation_components → *_deprecated
    //    (It was empty but we preserve it as a safety backup.)
    // ─────────────────────────────────────────────────────────────────────────
    const tableExists = await client.query(`
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name   = 'mes_adhesive_formulation_components'
    `);
    if (tableExists.rowCount > 0) {
      await client.query(`
        ALTER TABLE mes_adhesive_formulation_components
          RENAME TO mes_adhesive_formulation_components_deprecated
      `);
      console.log('  + mes_adhesive_formulation_components renamed to *_deprecated');
    } else {
      console.log('  ~ mes_adhesive_formulation_components not found — skipping rename');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Drop parent_catlinedesc column from mes_item_category_groups
    // ─────────────────────────────────────────────────────────────────────────
    const colExists = await client.query(`
      SELECT 1 FROM information_schema.columns
       WHERE table_name  = 'mes_item_category_groups'
         AND column_name = 'parent_catlinedesc'
    `);
    if (colExists.rowCount > 0) {
      await client.query(`
        ALTER TABLE mes_item_category_groups DROP COLUMN parent_catlinedesc
      `);
      console.log('  + parent_catlinedesc column dropped from mes_item_category_groups');
    } else {
      console.log('  ~ parent_catlinedesc column not found — skipping drop');
    }

    await client.query('COMMIT');
    console.log('\nMigration #050 completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration #050 failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('Rolling back migration #050...');

    // Drop new tables
    await client.query('DROP TABLE IF EXISTS mes_formulation_components CASCADE');
    await client.query('DROP TABLE IF EXISTS mes_formulations CASCADE');
    console.log('  - mes_formulation_components dropped');
    console.log('  - mes_formulations dropped');

    // Restore legacy resin tables
    const legacyTables = [
      { from: 'mes_formulations_legacy',           to: 'mes_formulations' },
      { from: 'mes_formulation_components_legacy', to: 'mes_formulation_components' },
      { from: 'mes_formulation_results_legacy',    to: 'mes_formulation_results' },
    ];
    for (const { from, to } of legacyTables) {
      const exists = await client.query(`
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1
      `, [from]);
      if (exists.rowCount > 0) {
        await client.query(`ALTER TABLE ${from} RENAME TO ${to}`);
        console.log(`  - restored ${from} → ${to}`);
      }
    }

    // Restore deprecated table
    const deprecatedExists = await client.query(`
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name   = 'mes_adhesive_formulation_components_deprecated'
    `);
    if (deprecatedExists.rowCount > 0) {
      await client.query(`
        ALTER TABLE mes_adhesive_formulation_components_deprecated
          RENAME TO mes_adhesive_formulation_components
      `);
      console.log('  - mes_adhesive_formulation_components restored');
    }

    // Re-activate soft-deleted Adhesive custom groups
    await client.query(`
      UPDATE mes_item_category_groups
         SET is_active = true, updated_at = NOW()
       WHERE is_custom = true AND category_id = 4 AND is_active = false
    `);
    console.log('  - Adhesive custom groups re-activated');

    // Re-add parent_catlinedesc column
    await client.query(`
      ALTER TABLE mes_item_category_groups
        ADD COLUMN IF NOT EXISTS parent_catlinedesc VARCHAR(255)
    `);
    console.log('  - parent_catlinedesc column restored');

    await client.query('COMMIT');
    console.log('Migration #050 rolled back successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration #050 rollback failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { up, down };

if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
