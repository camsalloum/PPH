/**
 * MES Pre-Sales Migration #001
 * Creates: mes_presales_inquiries + mes_presales_customer_registrations
 * Database: fp_database
 * Division: FP (Interplast – Flexible Packaging)
 *
 * Run: node server/migrations/mes-presales-001-inquiries.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'fp_database',
});

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔧 Starting MES Pre-Sales migration #001...');

    // ─────────────────────────────────────────────────────────────────
    // TABLE 1: mes_presales_inquiries
    // Core inquiry record – one row per RFQ / customer inquiry
    // ─────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_presales_inquiries (
        id                    SERIAL PRIMARY KEY,
        inquiry_number        VARCHAR(30) UNIQUE NOT NULL,   -- e.g. INQ-FP-2026-00001

        -- Tenant / Division
        division              VARCHAR(10) NOT NULL DEFAULT 'FP',

        -- Who logged it (sales rep group)
        sales_rep_group_id    INTEGER NOT NULL
                              REFERENCES sales_rep_groups(id)
                              ON DELETE RESTRICT,
        sales_rep_group_name  VARCHAR(120),                  -- denormalised snapshot

        -- How the inquiry came in
        source                VARCHAR(50) NOT NULL
                              CHECK (source IN (
                                'manager_tip',
                                'customer_visit',
                                'website',
                                'exhibition',
                                'phone_call',
                                'whatsapp',
                                'email',
                                'referral',
                                'prospect_list',
                                'other'
                              )),
        source_detail         TEXT,                          -- Used when source = 'other'

        -- Customer linkage
        customer_type         VARCHAR(20) NOT NULL
                              CHECK (customer_type IN ('new', 'existing', 'prospect')),
        customer_id           INTEGER,                       -- FK to fp_customer_master (if existing)
        customer_name         VARCHAR(255) NOT NULL,         -- Always filled (free text for new, lookup name for existing/prospect)
        customer_country      VARCHAR(100),

        -- What they're interested in
        product_groups        JSONB DEFAULT '[]',            -- Array of product group names
        estimated_quantity    NUMERIC(14, 2),
        quantity_unit         VARCHAR(20) DEFAULT 'KGS',

        -- Workflow status
        status                VARCHAR(30) NOT NULL DEFAULT 'new'
                              CHECK (status IN (
                                'new',
                                'in_progress',
                                'customer_registered',
                                'qualified',
                                'converted',
                                'lost',
                                'on_hold'
                              )),
        priority              VARCHAR(10) NOT NULL DEFAULT 'normal'
                              CHECK (priority IN ('low', 'normal', 'high')),

        -- Free text
        notes                 TEXT,

        -- Outcome tracking
        lost_reason           TEXT,
        converted_to_so       VARCHAR(50),                   -- SO number if converted

        -- Timestamps
        inquiry_date          DATE NOT NULL DEFAULT CURRENT_DATE,
        follow_up_date        DATE,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('  ✅ Table mes_presales_inquiries created');

    // ─────────────────────────────────────────────────────────────────
    // TABLE 2: mes_presales_customer_registrations
    // Mini registration form for NEW customers discovered via inquiry
    // ─────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_presales_customer_registrations (
        id                    SERIAL PRIMARY KEY,
        inquiry_id            INTEGER NOT NULL
                              REFERENCES mes_presales_inquiries(id)
                              ON DELETE CASCADE,

        -- Tenant / Division
        division              VARCHAR(10) NOT NULL DEFAULT 'FP',

        -- Company details
        company_name          VARCHAR(255) NOT NULL,
        trade_name            VARCHAR(255),
        country               VARCHAR(100),
        city                  VARCHAR(100),
        address               TEXT,
        website               VARCHAR(255),

        -- Contact person
        contact_name          VARCHAR(150),
        contact_title         VARCHAR(100),
        contact_email         VARCHAR(150),
        contact_phone         VARCHAR(50),
        contact_whatsapp      VARCHAR(50),

        -- Business info
        industry_sector       VARCHAR(100),
        estimated_annual_qty  NUMERIC(14, 2),
        qty_unit              VARCHAR(20) DEFAULT 'KGS',
        products_of_interest  JSONB DEFAULT '[]',
        current_supplier      VARCHAR(255),
        packaging_types       JSONB DEFAULT '[]',            -- e.g. ["Pouches", "Roll stock"]

        -- Approval workflow
        approval_status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                              CHECK (approval_status IN ('pending', 'approved', 'rejected')),
        approved_by           VARCHAR(120),
        approved_at           TIMESTAMPTZ,
        rejection_reason      TEXT,

        -- Notes
        notes                 TEXT,

        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('  ✅ Table mes_presales_customer_registrations created');

    // ─────────────────────────────────────────────────────────────────
    // INDEXES for fast lookups
    // ─────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mpi_division        ON mes_presales_inquiries(division);
      CREATE INDEX IF NOT EXISTS idx_mpi_sales_rep_group ON mes_presales_inquiries(sales_rep_group_id);
      CREATE INDEX IF NOT EXISTS idx_mpi_status          ON mes_presales_inquiries(status);
      CREATE INDEX IF NOT EXISTS idx_mpi_customer_type   ON mes_presales_inquiries(customer_type);
      CREATE INDEX IF NOT EXISTS idx_mpi_inquiry_date    ON mes_presales_inquiries(inquiry_date DESC);
      CREATE INDEX IF NOT EXISTS idx_mpcr_inquiry        ON mes_presales_customer_registrations(inquiry_id);
      CREATE INDEX IF NOT EXISTS idx_mpcr_approval       ON mes_presales_customer_registrations(approval_status);
    `);
    console.log('  ✅ Indexes created');

    // ─────────────────────────────────────────────────────────────────
    // AUTO-UPDATE updated_at TRIGGER
    // ─────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE OR REPLACE FUNCTION update_mes_updated_at()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trg_mpi_updated_at ON mes_presales_inquiries;
      CREATE TRIGGER trg_mpi_updated_at
        BEFORE UPDATE ON mes_presales_inquiries
        FOR EACH ROW EXECUTE FUNCTION update_mes_updated_at();
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trg_mpcr_updated_at ON mes_presales_customer_registrations;
      CREATE TRIGGER trg_mpcr_updated_at
        BEFORE UPDATE ON mes_presales_customer_registrations
        FOR EACH ROW EXECUTE FUNCTION update_mes_updated_at();
    `);
    console.log('  ✅ Triggers created');

    // ─────────────────────────────────────────────────────────────────
    // AUTO-INCREMENT inquiry_number  INQ-FP-YYYY-XXXXX
    // ─────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE SEQUENCE IF NOT EXISTS mes_inquiry_seq START 1;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION generate_inquiry_number(div TEXT)
      RETURNS TEXT LANGUAGE plpgsql AS $$
      DECLARE
        seq_val INTEGER;
      BEGIN
        seq_val := nextval('mes_inquiry_seq');
        RETURN 'INQ-' || div || '-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(seq_val::TEXT, 5, '0');
      END;
      $$;
    `);
    console.log('  ✅ inquiry_number sequence + function created');

    await client.query('COMMIT');
    console.log('\n✅ Migration #001 completed successfully!');
    console.log('   Tables: mes_presales_inquiries, mes_presales_customer_registrations');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed — rolled back:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

up().catch(() => process.exit(1));
