/**
 * Migration: mes-master-007-scheduling
 *
 * Creates production scheduling schema:
 *   1. mes_production_orders   — Production orders linked to jobs/inquiries/BOMs
 *   2. mes_production_schedule — Per-process scheduling on machines
 *   3. mes_machine_downtime    — Downtime tracking per machine
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
    console.log('🔧 Starting MES Master Data migration #007 — Production Scheduling...\n');

    // ─── 1. mes_production_orders ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_production_orders (
        id                SERIAL PRIMARY KEY,
        job_card_id       INT,
        inquiry_id        INT,
        product_group_id  INT,
        bom_version_id    INT REFERENCES mes_bom_versions(id),
        order_qty         DECIMAL(14,2),
        quantity_unit     VARCHAR(20) DEFAULT 'KG',
        priority          INT DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
        due_date          DATE,
        status            VARCHAR(30) DEFAULT 'planned'
                          CHECK (status IN ('planned','scheduled','in_progress','completed','on_hold','cancelled')),
        notes             TEXT,
        is_active         BOOLEAN DEFAULT TRUE,
        created_by        INTEGER,
        created_at        TIMESTAMPTZ DEFAULT NOW(),
        updated_at        TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('  ✅ mes_production_orders — created');

    await client.query(`CREATE INDEX IF NOT EXISTS idx_prod_orders_status ON mes_production_orders(status) WHERE is_active = true`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_prod_orders_due ON mes_production_orders(due_date) WHERE status IN ('planned','scheduled','in_progress')`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_prod_orders_bom ON mes_production_orders(bom_version_id) WHERE bom_version_id IS NOT NULL`);
    console.log('  ✅ Indexes — created');

    // ─── 2. mes_production_schedule ───────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_production_schedule (
        id                    SERIAL PRIMARY KEY,
        production_order_id   INT NOT NULL REFERENCES mes_production_orders(id) ON DELETE CASCADE,
        process_id            INT NOT NULL REFERENCES mes_processes(id),
        machine_id            INT NOT NULL REFERENCES mes_machines(id),
        sequence_order        INT NOT NULL DEFAULT 10,
        scheduled_start       TIMESTAMPTZ,
        scheduled_end         TIMESTAMPTZ,
        actual_start          TIMESTAMPTZ,
        actual_end            TIMESTAMPTZ,
        planned_qty           DECIMAL(14,2),
        actual_qty            DECIMAL(14,2),
        planned_waste_pct     DECIMAL(5,2),
        actual_waste_pct      DECIMAL(5,2),
        status                VARCHAR(30) DEFAULT 'pending'
                              CHECK (status IN ('pending','scheduled','in_progress','completed','skipped')),
        operator_id           INTEGER,
        notes                 TEXT,
        is_active             BOOLEAN DEFAULT TRUE,
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('  ✅ mes_production_schedule — created');

    await client.query(`CREATE INDEX IF NOT EXISTS idx_prod_sched_order ON mes_production_schedule(production_order_id, sequence_order)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_prod_sched_machine ON mes_production_schedule(machine_id, scheduled_start) WHERE status IN ('scheduled','in_progress')`);
    console.log('  ✅ Schedule indexes — created');

    // ─── 3. mes_machine_downtime ──────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_machine_downtime (
        id            SERIAL PRIMARY KEY,
        machine_id    INT NOT NULL REFERENCES mes_machines(id),
        start_time    TIMESTAMPTZ NOT NULL,
        end_time      TIMESTAMPTZ,
        reason        VARCHAR(50) CHECK (reason IN ('maintenance','breakdown','changeover','no_material','no_operator','other')),
        notes         TEXT,
        is_active     BOOLEAN DEFAULT TRUE,
        created_by    INTEGER,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('  ✅ mes_machine_downtime — created');

    await client.query(`CREATE INDEX IF NOT EXISTS idx_downtime_machine ON mes_machine_downtime(machine_id, start_time)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_downtime_open ON mes_machine_downtime(machine_id) WHERE end_time IS NULL`);
    console.log('  ✅ Downtime indexes — created');

    await client.query('COMMIT');
    console.log('\n✅ Migration mes-master-007 complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration mes-master-007 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
