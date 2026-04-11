/**
 * MES Sprint 4 Migration
 * H-002: SLA Tracking fields on samples + CSE reports
 * H-003: Lost Reason structured capture on inquiries
 * H-006: Kanban position on inquiries
 *
 * Run: node server/migrations/mes-h-001-sla-lost-kanban.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT)  || 5432,
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'fp_database',
});

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔧 Starting MES Sprint 4 migration (H-002 / H-003 / H-006)...');

    // ─────────────────────────────────────────────────────────
    // H-002: SLA tracking — samples
    // sla_due_at  : deadline for the current stage
    // sla_stage   : which stage the SLA was set for
    // ─────────────────────────────────────────────────────────
    await client.query(`
      ALTER TABLE mes_presales_samples
        ADD COLUMN IF NOT EXISTS sla_due_at  TIMESTAMP,
        ADD COLUMN IF NOT EXISTS sla_stage   VARCHAR(50)
    `);
    console.log('  ✅ mes_presales_samples — SLA columns added');

    // ─────────────────────────────────────────────────────────
    // H-002: SLA tracking — CSE reports
    // ─────────────────────────────────────────────────────────
    await client.query(`
      ALTER TABLE mes_cse_reports
        ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMP
    `);
    console.log('  ✅ mes_cse_reports — sla_due_at added');

    // ─────────────────────────────────────────────────────────
    // H-003: Structured lost reason — inquiries
    // ─────────────────────────────────────────────────────────
    await client.query(`
      ALTER TABLE mes_presales_inquiries
        ADD COLUMN IF NOT EXISTS lost_reason_category VARCHAR(50)
          CHECK (lost_reason_category IN
            ('price','quality','lead_time','competition','customer_decision','specification','other')),
        ADD COLUMN IF NOT EXISTS lost_reason_notes     TEXT,
        ADD COLUMN IF NOT EXISTS lost_to_competitor    VARCHAR(255),
        ADD COLUMN IF NOT EXISTS lost_at               TIMESTAMP
    `);
    console.log('  ✅ mes_presales_inquiries — lost reason columns added');

    // Index for analytics queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inq_lost_category
        ON mes_presales_inquiries(lost_reason_category)
        WHERE status = 'lost'
    `);

    // ─────────────────────────────────────────────────────────
    // H-006: Kanban position — inquiries
    // Float allows fractional mid-point inserts without renumbering
    // ─────────────────────────────────────────────────────────
    await client.query(`
      ALTER TABLE mes_presales_inquiries
        ADD COLUMN IF NOT EXISTS kanban_position FLOAT DEFAULT 0
    `);
    console.log('  ✅ mes_presales_inquiries — kanban_position added');

    // Seed position from existing row order within each status bucket
    await client.query(`
      UPDATE mes_presales_inquiries inq
      SET kanban_position = sub.rn * 1000
      FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY status ORDER BY created_at ASC) AS rn
        FROM mes_presales_inquiries
      ) sub
      WHERE inq.id = sub.id
        AND inq.kanban_position = 0
    `);
    console.log('  ✅ Kanban positions seeded from existing order');

    await client.query('COMMIT');
    console.log('✅ Sprint 4 migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Sprint 4 migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

up().catch(() => process.exit(1));
