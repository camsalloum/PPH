/**
 * Migration mes-master-054 — Extend mes_tds_attachments for multi-class support
 *
 * Day 2 of MATERIAL_SPECS_AND_PARSER_CONSOLIDATED_FIX_PLAN_2026-04-24.md (Phase 6).
 *
 * Extends the existing `mes_tds_attachments` table (resin-only, created in
 * migration 015) so it can store original PDFs for ALL material classes —
 * not just resins. Each upload is preserved with supplier + version metadata,
 * supports multi-supplier per material and multi-version per supplier, and
 * surfaces in the Material Specs UI as a TDS Library section per item.
 *
 * Columns added (NULL-safe for existing resin rows):
 *   - material_class       VARCHAR(40)  — 'resins' | 'substrates' | 'adhesives' | …
 *   - parameter_profile    VARCHAR(40)  — sub-profile e.g. 'substrates_alu_foil'
 *   - mainitem             VARCHAR(60)  — Oracle item code (snapshot)
 *   - maindescription      TEXT         — snapshot at upload time
 *   - catlinedesc          TEXT         — snapshot at upload time
 *   - supplier_id          INT          — FK to mes_suppliers (nullable)
 *   - supplier_name_raw    VARCHAR(200) — extracted/typed supplier name
 *   - sha256               CHAR(64)     — file dedup + integrity
 *   - mime_type            VARCHAR(80)
 *   - version_no           INT          — per (mainitem + supplier_id)
 *   - is_current           BOOLEAN      — exactly one current per (mainitem + supplier_id)
 *   - parse_status         VARCHAR(20)  — 'pending' | 'parsed' | 'partial' | 'failed'
 *   - parsed_extract_json  JSONB        — snapshot of parser output
 *   - applied_to_spec      BOOLEAN      — true when user clicked Apply on diff modal
 *   - applied_at           TIMESTAMPTZ
 *   - applied_by           INT
 *   - notes                TEXT
 *   - deleted_at           TIMESTAMPTZ  — soft-delete sentinel
 *
 * Backfill: existing resin rows get material_class='resins' (linked via tds_id).
 * The tds_id column is now NULLABLE because non-resin uploads do not have a
 * resin TDS parent.
 *
 * Run: node server/migrations/mes-master-054-tds-attachments-multi-class.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('Starting migration #054 — Extend mes_tds_attachments for multi-class...');
    await client.query('BEGIN');

    // 1. Make tds_id nullable (non-resin uploads have no resin TDS parent)
    await client.query(`ALTER TABLE mes_tds_attachments ALTER COLUMN tds_id DROP NOT NULL`);
    console.log('  + tds_id is now nullable');

    // 2. Add new columns (idempotent via IF NOT EXISTS)
    const COLS = [
      `material_class       VARCHAR(40)`,
      `parameter_profile    VARCHAR(40)`,
      `mainitem             VARCHAR(60)`,
      `maindescription      TEXT`,
      `catlinedesc          TEXT`,
      `supplier_id          INTEGER REFERENCES mes_suppliers(id) ON DELETE SET NULL`,
      `supplier_name_raw    VARCHAR(200)`,
      `sha256               CHAR(64)`,
      `mime_type            VARCHAR(80)`,
      `version_no           INTEGER NOT NULL DEFAULT 1`,
      `is_current           BOOLEAN NOT NULL DEFAULT true`,
      `parse_status         VARCHAR(20)`,
      `parsed_extract_json  JSONB`,
      `applied_to_spec      BOOLEAN NOT NULL DEFAULT false`,
      `applied_at           TIMESTAMPTZ`,
      `applied_by           INTEGER`,
      `notes                TEXT`,
      `deleted_at           TIMESTAMPTZ`,
    ];
    for (const def of COLS) {
      const colName = def.trim().split(/\s+/)[0];
      await client.query(`ALTER TABLE mes_tds_attachments ADD COLUMN IF NOT EXISTS ${def}`);
      console.log(`  + column ${colName} ensured`);
    }

    // 3. Backfill material_class='resins' for existing rows linked via tds_id
    const backfill = await client.query(
      `UPDATE mes_tds_attachments
          SET material_class = 'resins'
        WHERE material_class IS NULL AND tds_id IS NOT NULL`
    );
    console.log(`  + backfilled material_class='resins' on ${backfill.rowCount} existing row(s)`);

    // 4. Backfill mainitem snapshot for resin rows from mes_material_tds
    const snapshot = await client.query(`
      UPDATE mes_tds_attachments a
         SET mainitem        = COALESCE(a.mainitem, t.oracle_item_code),
             maindescription = COALESCE(a.maindescription, t.brand_grade)
        FROM mes_material_tds t
       WHERE a.tds_id = t.id
         AND a.mainitem IS NULL
    `);
    console.log(`  + snapshot mainitem/desc on ${snapshot.rowCount} resin row(s)`);

    // 5. Backfill mime_type='application/pdf' for legacy rows where file_type is 'pdf'-ish
    await client.query(`
      UPDATE mes_tds_attachments
         SET mime_type = 'application/pdf'
       WHERE mime_type IS NULL
         AND (file_type ILIKE '%pdf%' OR file_name ILIKE '%.pdf')
    `);

    // 6. Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tds_attach_class       ON mes_tds_attachments(material_class)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tds_attach_mainitem    ON mes_tds_attachments(mainitem)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tds_attach_class_main  ON mes_tds_attachments(material_class, mainitem)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tds_attach_supplier    ON mes_tds_attachments(supplier_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tds_attach_sha256      ON mes_tds_attachments(sha256)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tds_attach_active      ON mes_tds_attachments(material_class, mainitem) WHERE deleted_at IS NULL AND is_current = true`);
    console.log('  + indexes ensured');

    // 7. Verify
    const { rows: counts } = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE material_class = 'resins') AS resin_rows,
        COUNT(*) FILTER (WHERE material_class IS NOT NULL) AS classified,
        COUNT(*) AS total
      FROM mes_tds_attachments
    `);
    console.log(`  + verify: total=${counts[0].total} classified=${counts[0].classified} resins=${counts[0].resin_rows}`);

    await client.query('COMMIT');
    console.log('Migration #054 completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration #054 failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
