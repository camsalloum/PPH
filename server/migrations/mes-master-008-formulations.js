/**
 * Migration: mes-master-008-formulations
 *
 * Creates formulation schema for resin blend management:
 *   1. mes_formulations            — Formulation header (linked to PG + BOM)
 *   2. mes_formulation_components  — Resin blend percentages (must sum ≤ 100%)
 *   3. mes_formulation_results     — Lab test results against target properties
 *   4. Trigger: check_formulation_pct — A12 DB-level percentage enforcement
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔧 Starting MES Master Data migration #008 — Formulations...\n');

    // ─── 1. mes_formulations ──────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_formulations (
        id                SERIAL PRIMARY KEY,
        product_group_id  INT,
        bom_version_id    INT REFERENCES mes_bom_versions(id),
        formulation_name  VARCHAR(255) NOT NULL,
        version           INT DEFAULT 1,
        target_properties JSONB DEFAULT '{}',
        status            VARCHAR(20) DEFAULT 'draft'
                          CHECK (status IN ('draft','active','archived')),
        notes             TEXT,
        is_active         BOOLEAN DEFAULT TRUE,
        created_by        INTEGER,
        created_at        TIMESTAMPTZ DEFAULT NOW(),
        updated_at        TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('  ✅ mes_formulations — created');

    await client.query(`CREATE INDEX IF NOT EXISTS idx_formulations_pg ON mes_formulations(product_group_id) WHERE is_active = true`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_formulations_bom ON mes_formulations(bom_version_id) WHERE bom_version_id IS NOT NULL`);
    console.log('  ✅ Formulation indexes — created');

    // ─── 2. mes_formulation_components ────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_formulation_components (
        id              SERIAL PRIMARY KEY,
        formulation_id  INT NOT NULL REFERENCES mes_formulations(id) ON DELETE CASCADE,
        resin_type      VARCHAR(50) NOT NULL,
        percentage      DECIMAL(5,2) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
        item_id         INT REFERENCES mes_item_master(id),
        melt_index      DECIMAL(8,2),
        density         DECIMAL(8,4),
        purpose         VARCHAR(50) CHECK (purpose IN ('base','toughness','clarity','sealability','barrier','slip','antiblock','other')),
        is_active       BOOLEAN DEFAULT TRUE,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('  ✅ mes_formulation_components — created');

    await client.query(`CREATE INDEX IF NOT EXISTS idx_form_comp_formulation ON mes_formulation_components(formulation_id)`);

    // ─── 3. A12: Trigger — percentage sum ≤ 100% ─────────────────────────
    await client.query(`
      CREATE OR REPLACE FUNCTION check_formulation_pct() RETURNS trigger AS $$
      BEGIN
        IF (SELECT COALESCE(SUM(percentage), 0) FROM mes_formulation_components
            WHERE formulation_id = NEW.formulation_id AND is_active = true) > 100.0001 THEN
          RAISE EXCEPTION 'Formulation percentages exceed 100%%';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // Drop trigger if exists (idempotent)
    await client.query(`
      DROP TRIGGER IF EXISTS trg_formulation_pct ON mes_formulation_components
    `);
    await client.query(`
      CREATE TRIGGER trg_formulation_pct
        AFTER INSERT OR UPDATE ON mes_formulation_components
        FOR EACH ROW EXECUTE FUNCTION check_formulation_pct()
    `);
    console.log('  ✅ Trigger check_formulation_pct — created (A12)');

    // ─── 4. mes_formulation_results ───────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_formulation_results (
        id                  SERIAL PRIMARY KEY,
        formulation_id      INT NOT NULL REFERENCES mes_formulations(id),
        production_order_id INT REFERENCES mes_production_orders(id),
        actual_properties   JSONB DEFAULT '{}',
        pass_fail           BOOLEAN,
        tested_by           INTEGER,
        tested_at           TIMESTAMPTZ,
        notes               TEXT,
        is_active           BOOLEAN DEFAULT TRUE,
        created_at          TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('  ✅ mes_formulation_results — created');

    await client.query(`CREATE INDEX IF NOT EXISTS idx_form_results_formulation ON mes_formulation_results(formulation_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_form_results_order ON mes_formulation_results(production_order_id) WHERE production_order_id IS NOT NULL`);
    console.log('  ✅ Result indexes — created');

    await client.query('COMMIT');
    console.log('\n✅ Migration mes-master-008 complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration mes-master-008 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
