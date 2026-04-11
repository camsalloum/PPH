/**
 * Migration mes-master-003 — Process Rates + Process-Machine Map
 *
 * SAP Equivalent: Activity Types (KP26)
 * Creates mes_processes with disaggregated waste model (B5),
 * mes_process_machine_map linking processes to machines.
 * Seeds 10 processes and auto-maps them to machines by department.
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
    console.log('🔧 Starting MES Master Data migration #003 — Processes...\n');

    // ─── 1. mes_processes ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_processes (
        id                     SERIAL PRIMARY KEY,
        process_code           VARCHAR(50) UNIQUE NOT NULL,
        process_name           VARCHAR(255) NOT NULL,
        department             VARCHAR(100) NOT NULL,
        sequence_order         INT NOT NULL DEFAULT 0,
        speed_unit             VARCHAR(20) NOT NULL,
        default_speed          DECIMAL(10,2),
        default_setup_time_min DECIMAL(8,2) DEFAULT 30,
        default_waste_pct      DECIMAL(5,2) DEFAULT 3.0,

        -- Disaggregated waste model (B5)
        startup_waste_pct      DECIMAL(5,2) DEFAULT 0,
        edge_trim_pct          DECIMAL(5,2) DEFAULT 0,
        conversion_waste_pct   DECIMAL(5,2) DEFAULT 0,

        -- Costing (SAP KP26)
        hourly_rate            DECIMAL(10,2) NOT NULL DEFAULT 100.00,
        setup_cost             DECIMAL(10,2) DEFAULT 0,
        min_order_charge       DECIMAL(10,2) DEFAULT 0,

        -- Process parameters schema (for dynamic UI)
        parameters_schema      JSONB DEFAULT '[]',

        is_active              BOOLEAN DEFAULT true,
        created_at             TIMESTAMPTZ DEFAULT NOW(),
        updated_at             TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('  ✅ mes_processes — created');

    // ─── 2. mes_process_machine_map ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_process_machine_map (
        id                SERIAL PRIMARY KEY,
        process_id        INT NOT NULL REFERENCES mes_processes(id) ON DELETE CASCADE,
        machine_id        INT NOT NULL REFERENCES mes_machines(id) ON DELETE CASCADE,
        is_default        BOOLEAN DEFAULT false,
        effective_speed   DECIMAL(10,2),
        notes             TEXT,
        UNIQUE(process_id, machine_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_process_machine_proc ON mes_process_machine_map(process_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_process_machine_mach ON mes_process_machine_map(machine_id)`);
    console.log('  ✅ mes_process_machine_map — created');

    // ─── 3. Seed processes ──────────────────────────────────────────────────
    await client.query(`
      INSERT INTO mes_processes (process_code, process_name, department, sequence_order, speed_unit, default_speed, default_setup_time_min, default_waste_pct, hourly_rate, startup_waste_pct, edge_trim_pct, conversion_waste_pct)
      VALUES
        ('EXTRUSION',    'Extrusion',         'extrusion',   1, 'kg_hr',   200, 30, 3.0, 120, 2.0, 3.0, 0),
        ('PRINTING',     'Printing',          'printing',    2, 'm_min',   150, 30, 2.0, 180, 3.0, 0,   0),
        ('REWINDING',    'Rewinding',         'printing',    3, 'm_min',   200, 15, 1.0,  80, 0.5, 0,   0),
        ('LAMINATION',   'Lamination',        'lamination',  4, 'm_min',   200, 30, 2.0, 160, 1.5, 0,   0),
        ('SLITTING',     'Slitting',          'slitting',    5, 'm_min',   300, 15, 1.0, 100, 0,   2.0, 0),
        ('SEAMING',      'Seaming',           'seaming',     6, 'm_min',   250, 15, 1.0,  90, 0,   0,   2.0),
        ('DOCTORING',    'Sleeve Doctoring',  'doctoring',   7, 'm_min',   300, 15, 1.0,  70, 0,   0,   0),
        ('POUCH_MAKING', 'Pouch/Bag Making',  'bag_making',  8, 'pcs_min',  70, 30, 3.0, 150, 1.0, 0,   4.0),
        ('COATING',      'Coating',           'coating',     9, 'm_min',   150, 30, 2.0, 130, 1.5, 0,   0),
        ('SLEEVING',     'Sleeving',          'seaming',    10, 'm_min',   250, 15, 1.0,  90, 0,   0,   1.5)
      ON CONFLICT (process_code) DO NOTHING
    `);
    console.log('  ✅ Seed data — 10 processes inserted');

    // ─── 4. Auto-map processes → machines by department ─────────────────────
    const deptMappings = [
      { process: 'EXTRUSION',    dept: 'extrusion',  defaultCode: 'EXT-001' },
      { process: 'PRINTING',     dept: 'printing',   defaultCode: 'PRT-001' },
      { process: 'REWINDING',    dept: 'printing',   defaultCode: 'PRT-001' },
      { process: 'LAMINATION',   dept: 'lamination', defaultCode: 'LAM-001' },
      { process: 'SLITTING',     dept: 'slitting',   defaultCode: 'SLT-001' },
      { process: 'SEAMING',      dept: 'seaming',    defaultCode: 'SEA-001' },
      { process: 'DOCTORING',    dept: 'doctoring',  defaultCode: 'DOC-001' },
      { process: 'POUCH_MAKING', dept: 'bag_making', defaultCode: 'BAG-001' },
      { process: 'COATING',      dept: 'lamination', defaultCode: 'LAM-001' },
      { process: 'SLEEVING',     dept: 'seaming',    defaultCode: 'SEA-002' },
    ];

    for (const { process, dept, defaultCode } of deptMappings) {
      await client.query(`
        INSERT INTO mes_process_machine_map (process_id, machine_id, is_default, effective_speed)
        SELECT p.id, m.id, (m.machine_code = $3), m.standard_speed
        FROM mes_processes p, mes_machines m
        WHERE p.process_code = $1 AND m.department = $2 AND m.is_active = true
        ON CONFLICT (process_id, machine_id) DO NOTHING
      `, [process, dept, defaultCode]);
    }
    console.log('  ✅ Process-machine mappings — auto-populated');

    await client.query('COMMIT');
    console.log('\n✅ Migration mes-master-003 complete.\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration mes-master-003 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
