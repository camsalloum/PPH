/**
 * Migration #005 — SAR model: link attachments to samples + add qty to samples
 *
 * Changes:
 *  1. inquiry_attachments: add sample_id (nullable FK → mes_presales_samples)
 *  2. mes_presales_samples: add estimated_quantity, quantity_unit columns
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
    console.log('🔧 Starting MES Pre-Sales migration #005 — SAR model...\n');

    // 1. Link attachments to specific samples
    await client.query(`
      ALTER TABLE inquiry_attachments
        ADD COLUMN IF NOT EXISTS sample_id INTEGER REFERENCES mes_presales_samples(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_inquiry_att_sample
        ON inquiry_attachments(sample_id) WHERE sample_id IS NOT NULL;
    `);
    console.log('  ✅ inquiry_attachments.sample_id — added (nullable FK)');

    // 2. Add quantity fields to samples
    await client.query(`
      ALTER TABLE mes_presales_samples
        ADD COLUMN IF NOT EXISTS estimated_quantity NUMERIC(14,2),
        ADD COLUMN IF NOT EXISTS quantity_unit VARCHAR(20) DEFAULT 'Kgs';
    `);
    console.log('  ✅ mes_presales_samples — added estimated_quantity, quantity_unit');

    await client.query('COMMIT');
    console.log('\n✅ MES Pre-Sales migration #005 completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration #005 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
