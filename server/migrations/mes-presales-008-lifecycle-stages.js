/**
 * Migration #008 — Full Lifecycle Stages
 *
 * Adds:
 *  1. inquiry_stage column to mes_presales_inquiries
 *  2. mes_quotations table
 *  3. mes_preprod_samples table
 *  4. mes_proforma_invoices table
 *
 * Run: node server/migrations/mes-presales-008-lifecycle-stages.js
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

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔧 Starting Migration #008 — Lifecycle Stages...\n');

    // ─── 1. Add inquiry_stage to mes_presales_inquiries ───────────────────────
    await client.query(`
      ALTER TABLE mes_presales_inquiries
        ADD COLUMN IF NOT EXISTS inquiry_stage VARCHAR(30) DEFAULT 'sar_pending';
    `);
    console.log('  ✅ inquiry_stage column added');

    // Backfill existing rows based on presales_phase / status
    await client.query(`
      UPDATE mes_presales_inquiries SET inquiry_stage = CASE
        WHEN status = 'lost'       THEN 'lost'
        WHEN status = 'on_hold'    THEN 'on_hold'
        WHEN presales_cleared      THEN 'cse_approved'
        WHEN presales_phase = 'clearance'  THEN 'cse_approved'
        WHEN presales_phase = 'sample_qc'  THEN 'qc_in_progress'
        WHEN status = 'new'        THEN 'sar_pending'
        WHEN status = 'in_progress' THEN 'qc_in_progress'
        WHEN status = 'converted'  THEN 'cse_approved'
        ELSE 'sar_pending'
      END
      WHERE inquiry_stage IS NULL OR inquiry_stage = 'sar_pending';
    `);
    console.log('  ✅ inquiry_stage backfilled from existing data');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mpi_inquiry_stage
        ON mes_presales_inquiries(inquiry_stage);
    `);

    // ─── 2. mes_quotations ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_quotations (
        id                    SERIAL PRIMARY KEY,
        quotation_number      VARCHAR(30) UNIQUE NOT NULL,
        inquiry_id            INTEGER NOT NULL REFERENCES mes_presales_inquiries(id) ON DELETE CASCADE,

        -- Pricing
        unit_price            NUMERIC(14,4),
        total_price           NUMERIC(14,4),
        currency              VARCHAR(10) DEFAULT 'AED',
        quantity              NUMERIC(14,2),
        quantity_unit         VARCHAR(20) DEFAULT 'KGS',

        -- Estimation data (snapshot)
        estimation_data       JSONB DEFAULT '{}',

        -- Validity
        valid_until           DATE,

        -- Status
        status                VARCHAR(20) DEFAULT 'draft'
                              CHECK (status IN ('draft','pending_approval','approved','sent','accepted','rejected','expired','counter_offer')),

        -- Approval
        approved_by           INTEGER,
        approved_by_name      VARCHAR(120),
        approved_at           TIMESTAMPTZ,

        -- Customer response
        sent_at               TIMESTAMPTZ,
        customer_response     VARCHAR(20)
                              CHECK (customer_response IS NULL OR customer_response IN ('accepted','rejected','counter_offer','no_response')),
        customer_response_at  TIMESTAMPTZ,
        customer_notes        TEXT,
        counter_offer_amount  NUMERIC(14,4),

        -- Terms
        payment_terms         TEXT,
        delivery_terms        TEXT,
        notes                 TEXT,

        -- Creator
        created_by            INTEGER,
        created_by_name       VARCHAR(120),
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('  ✅ mes_quotations table created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quotations_inquiry ON mes_quotations(inquiry_id);
      CREATE INDEX IF NOT EXISTS idx_quotations_status  ON mes_quotations(status);
    `);

    // ─── 3. mes_preprod_samples ───────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_preprod_samples (
        id                    SERIAL PRIMARY KEY,
        inquiry_id            INTEGER NOT NULL REFERENCES mes_presales_inquiries(id) ON DELETE CASCADE,
        quotation_id          INTEGER REFERENCES mes_quotations(id) ON DELETE SET NULL,

        -- Sample tracking
        sample_number         VARCHAR(30),
        status                VARCHAR(25) DEFAULT 'requested'
                              CHECK (status IN ('requested','in_production','ready','sent_to_customer','customer_testing','approved','rejected','revision_needed')),

        -- Dates
        requested_at          TIMESTAMPTZ DEFAULT NOW(),
        production_started_at TIMESTAMPTZ,
        ready_at              TIMESTAMPTZ,
        sent_at               TIMESTAMPTZ,
        customer_response_at  TIMESTAMPTZ,

        -- Tracking
        tracking_number       VARCHAR(100),
        production_notes      TEXT,
        customer_feedback     TEXT,

        -- Creator
        requested_by          INTEGER,
        requested_by_name     VARCHAR(120),
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('  ✅ mes_preprod_samples table created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_preprod_inquiry ON mes_preprod_samples(inquiry_id);
      CREATE INDEX IF NOT EXISTS idx_preprod_status  ON mes_preprod_samples(status);
    `);

    // ─── 4. mes_proforma_invoices ─────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_proforma_invoices (
        id                    SERIAL PRIMARY KEY,
        pi_number             VARCHAR(30) UNIQUE NOT NULL,
        inquiry_id            INTEGER NOT NULL REFERENCES mes_presales_inquiries(id) ON DELETE CASCADE,
        quotation_id          INTEGER REFERENCES mes_quotations(id) ON DELETE SET NULL,

        -- Amounts
        amount                NUMERIC(14,4),
        currency              VARCHAR(10) DEFAULT 'AED',

        -- Status
        status                VARCHAR(20) DEFAULT 'draft'
                              CHECK (status IN ('draft','sent','confirmed','cancelled')),

        -- Customer PO
        customer_po_number    VARCHAR(100),
        customer_po_date      DATE,

        -- Dates
        sent_at               TIMESTAMPTZ,
        confirmed_at          TIMESTAMPTZ,

        -- Notes
        payment_terms         TEXT,
        notes                 TEXT,

        -- Creator
        created_by            INTEGER,
        created_by_name       VARCHAR(120),
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('  ✅ mes_proforma_invoices table created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pi_inquiry ON mes_proforma_invoices(inquiry_id);
      CREATE INDEX IF NOT EXISTS idx_pi_status  ON mes_proforma_invoices(status);
    `);

    await client.query('COMMIT');
    console.log('\n✅ Migration #008 — Lifecycle Stages complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration #008 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
