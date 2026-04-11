/**
 * MES Pre-Sales Migration #007
 * F-002: Adds analysis_id FK column to inquiry_attachments
 *        and extends attachment_type CHECK to include 'qc_evidence'
 *
 * Run: node server/migrations/mes-presales-007-qc-evidence.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'fp_database',
});

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔧 Starting MES Pre-Sales migration #007 — QC Evidence...');

    // 1. Add nullable analysis_id FK to inquiry_attachments
    await client.query(`
      ALTER TABLE inquiry_attachments
        ADD COLUMN IF NOT EXISTS analysis_id INTEGER
          REFERENCES mes_qc_analyses(id)
          ON DELETE SET NULL
    `);
    console.log('  ✅ analysis_id column added to inquiry_attachments');

    // 2. Extend the attachment_type check to include qc_evidence
    //    Drop old constraint and recreate with new allowed values
    await client.query(`
      ALTER TABLE inquiry_attachments
        DROP CONSTRAINT IF EXISTS inquiry_attachments_attachment_type_check
    `);
    await client.query(`
      ALTER TABLE inquiry_attachments
        ADD CONSTRAINT inquiry_attachments_attachment_type_check
          CHECK (attachment_type IN (
            'tds', 'email', 'artwork', 'sample_photo',
            'specification', 'document', 'qc_evidence', 'other'
          ))
    `);
    console.log('  ✅ attachment_type CHECK extended to include qc_evidence');

    // 3. Index for efficient lookup by analysis_id
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inquiry_attachments_analysis
        ON inquiry_attachments(analysis_id)
        WHERE analysis_id IS NOT NULL
    `);
    console.log('  ✅ idx_inquiry_attachments_analysis created');

    await client.query('COMMIT');
    console.log('✅ Migration #007 complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration #007 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

up().catch(() => process.exit(1));
