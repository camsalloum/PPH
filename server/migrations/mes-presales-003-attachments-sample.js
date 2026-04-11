/**
 * MES Pre-Sales Migration #003
 * Adds: inquiry_attachments table + sample columns on mes_presales_inquiries
 *
 * Run: node server/migrations/mes-presales-003-attachments-sample.js
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
    console.log('🔧 Starting MES Pre-Sales migration #003 — Attachments & Sample...');

    // ─────────────────────────────────────────────────────────────────
    // 1. Add sample columns to mes_presales_inquiries
    // ─────────────────────────────────────────────────────────────────
    await client.query(`
      ALTER TABLE mes_presales_inquiries
        ADD COLUMN IF NOT EXISTS sample_required  BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS sample_type      VARCHAR(20)
          CHECK (sample_type IS NULL OR sample_type IN ('physical', 'digital', 'both')),
        ADD COLUMN IF NOT EXISTS sample_notes     TEXT
    `);
    console.log('  ✅ sample_required, sample_type, sample_notes added to mes_presales_inquiries');

    // ─────────────────────────────────────────────────────────────────
    // 2. Create inquiry_attachments table
    // ─────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS inquiry_attachments (
        id                SERIAL PRIMARY KEY,
        inquiry_id        INTEGER NOT NULL
                          REFERENCES mes_presales_inquiries(id)
                          ON DELETE CASCADE,

        -- File info
        file_name         VARCHAR(255) NOT NULL,
        file_path         VARCHAR(500) NOT NULL,
        file_size         INTEGER,                           -- bytes
        mime_type         VARCHAR(100),

        -- Classification
        attachment_type   VARCHAR(30) NOT NULL DEFAULT 'other'
                          CHECK (attachment_type IN (
                            'tds', 'email', 'artwork', 'sample_photo',
                            'specification', 'document', 'other'
                          )),

        -- Audit
        uploaded_by       INTEGER,                          -- user id (no FK, flexible)
        uploaded_by_name  VARCHAR(150),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('  ✅ inquiry_attachments table created');

    // Index for fast lookup by inquiry
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inquiry_attachments_inquiry
        ON inquiry_attachments(inquiry_id)
    `);
    console.log('  ✅ Index on inquiry_attachments(inquiry_id)');

    await client.query('COMMIT');
    console.log('\n✅ MES Pre-Sales migration #003 completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

up().catch(() => process.exit(1));
