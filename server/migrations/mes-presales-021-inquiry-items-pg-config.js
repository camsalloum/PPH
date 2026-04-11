/**
 * Migration #021 — Inquiry Quotation Items + Product Group Config
 *
 * Creates:
 *   1. mes_presales_inquiry_items  — line items for price-quotation inquiries
 *   2. crm_product_group_config    — per-product-group specification config
 *   3. ALTER mes_presales_inquiries — ensure inquiry_type column exists
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
    console.log('🔧 Starting MES Pre-Sales migration #021 — Inquiry Items + PG Config...\n');

    // ─── 1. mes_presales_inquiry_items ──────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_presales_inquiry_items (
        id                 SERIAL PRIMARY KEY,
        inquiry_id         INTEGER NOT NULL REFERENCES mes_presales_inquiries(id) ON DELETE CASCADE,
        product_group_id   INTEGER REFERENCES crm_product_groups(id) ON DELETE SET NULL,
        product_group_name VARCHAR(255) NOT NULL,
        width_mm           NUMERIC(10,2),
        length_mm          NUMERIC(10,2),
        thickness_um       NUMERIC(10,2),
        quantity           NUMERIC(14,2),
        quantity_unit      VARCHAR(20) DEFAULT 'KGS',
        description        TEXT,
        sort_order         INTEGER DEFAULT 0,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inquiry_items_inquiry
        ON mes_presales_inquiry_items(inquiry_id)
    `);
    console.log('  ✅ mes_presales_inquiry_items — created');

    // ─── 2. crm_product_group_config ────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS crm_product_group_config (
        id                    SERIAL PRIMARY KEY,
        product_group_id      INTEGER NOT NULL UNIQUE REFERENCES crm_product_groups(id) ON DELETE CASCADE,
        available_dimensions  JSONB DEFAULT '["width_mm","length_mm","thickness_um"]',
        default_dimensions    JSONB DEFAULT '{}',
        available_units       JSONB DEFAULT '["KGS","PCS","MTR","SQM"]',
        default_unit          VARCHAR(20) DEFAULT 'KGS',
        available_materials   JSONB DEFAULT '[]',
        available_processes   JSONB DEFAULT '[]',
        available_machines    JSONB DEFAULT '[]',
        notes                 TEXT,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('  ✅ crm_product_group_config — created');

    // ─── 3. Ensure inquiry_type column exists ───────────────────────────────
    await client.query(`
      ALTER TABLE mes_presales_inquiries
        ADD COLUMN IF NOT EXISTS inquiry_type VARCHAR(30) DEFAULT 'sar'
    `);
    console.log('  ✅ mes_presales_inquiries.inquiry_type — ensured');

    // ─── 4. Seed default config rows for all active product groups ──────────
    await client.query(`
      INSERT INTO crm_product_group_config (product_group_id)
      SELECT id FROM crm_product_groups WHERE is_active = true
      ON CONFLICT (product_group_id) DO NOTHING
    `);
    console.log('  ✅ crm_product_group_config — seeded for active product groups');

    await client.query('COMMIT');
    console.log('\n✅ Migration #021 complete.\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration #021 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
