/**
 * Migration mes-master-002 — Machine Master Table
 *
 * SAP Equivalent: Work Center (CR01) + Resource (CRC1)
 * Creates mes_machines with OEE fields (B4), capacity fields (A18),
 * and 29 real factory machines from xlsx reference data.
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
    console.log('🔧 Starting MES Master Data migration #002 — Machines...\n');

    // ─── 1. mes_machines ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_machines (
        id                    SERIAL PRIMARY KEY,
        machine_code          VARCHAR(50) UNIQUE NOT NULL,
        machine_name          VARCHAR(255) NOT NULL,
        department            VARCHAR(100) NOT NULL,
        machine_type          VARCHAR(100),

        -- Capacity (SAP Work Center Capacity)
        max_web_width_mm      DECIMAL(10,2),
        min_web_width_mm      DECIMAL(10,2),
        number_of_colors      INT,
        number_of_layers      INT,
        standard_speed        DECIMAL(10,2),
        speed_unit            VARCHAR(20) NOT NULL,
        max_speed             DECIMAL(10,2),

        -- Costing (SAP KP26 Activity Type)
        hourly_rate           DECIMAL(10,2) NOT NULL DEFAULT 100.00,
        setup_cost            DECIMAL(10,2) DEFAULT 0,

        -- Waste factors
        setup_waste_pct       DECIMAL(5,2) DEFAULT 3.0,
        running_waste_pct     DECIMAL(5,2) DEFAULT 2.0,

        -- OEE factors (ISO 22400)
        efficiency_pct        DECIMAL(5,2) DEFAULT 80.00,
        availability_pct      DECIMAL(5,2) DEFAULT 90.00,
        quality_pct           DECIMAL(5,2) DEFAULT 98.00,

        -- Capacity baseline (scheduling)
        shifts_per_day        INT DEFAULT 3,
        hours_per_shift       DECIMAL(4,2) DEFAULT 8.0,

        -- Lamination-specific
        lamination_modes      JSONB DEFAULT '[]',

        -- Bag Making-specific
        sealing_type          VARCHAR(20),

        -- Technical specifications (free-form)
        manufacturer          VARCHAR(255),
        model                 VARCHAR(255),
        year_installed        INT,
        technical_specs       JSONB DEFAULT '{}',

        -- Status
        status                VARCHAR(50) DEFAULT 'operational',
        cost_centre_code      VARCHAR(50),

        is_active             BOOLEAN DEFAULT true,
        created_by            INTEGER,
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('  ✅ mes_machines — created');

    // ─── 2. Indexes ─────────────────────────────────────────────────────────
    await client.query(`CREATE INDEX IF NOT EXISTS idx_machines_dept ON mes_machines(department)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_machines_status ON mes_machines(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_machines_type ON mes_machines(machine_type)`);
    console.log('  ✅ Indexes — created');

    // ─── 3. Seed data — 29 real factory machines ────────────────────────────
    await client.query(`
      INSERT INTO mes_machines (machine_code, machine_name, department, machine_type, standard_speed, speed_unit, max_speed, max_web_width_mm, number_of_layers, number_of_colors, hourly_rate, manufacturer, lamination_modes, sealing_type)
      VALUES
        -- Extrusion (5)
        ('EXT-001', 'Macchi 5L',      'extrusion',  'BLOWN_FILM',       750, 'kg_hr',   750, 2400, 5, NULL, 180, 'Macchi',        '[]', NULL),
        ('EXT-002', 'Macchi 2 3L',    'extrusion',  'BLOWN_FILM',       225, 'kg_hr',   225, 1600, 3, NULL, 140, 'Macchi',        '[]', NULL),
        ('EXT-003', 'Luggi Mono',     'extrusion',  'BLOWN_FILM',       150, 'kg_hr',   150, 1200, 1, NULL, 100, 'Luggi',         '[]', NULL),
        ('EXT-004', 'Macchi 1 3L',    'extrusion',  'BLOWN_FILM',       200, 'kg_hr',   200, 1600, 3, NULL, 130, 'Macchi',        '[]', NULL),
        ('EXT-005', 'Bandera Mono',   'extrusion',  'BLOWN_FILM',        75, 'kg_hr',    75,  800, 1, NULL,  80, 'Bandera',       '[]', NULL),
        -- Printing (5)
        ('PRT-001', 'BOBST 20/6',     'printing',   'FLEXO',            250, 'm_min',   250, 1600, NULL, 10, 200, 'BOBST',        '[]', NULL),
        ('PRT-002', 'BOBST RS5003',   'printing',   'FLEXO',            300, 'm_min',   300, 1600, NULL, 10, 220, 'BOBST',        '[]', NULL),
        ('PRT-003', 'BOBS M6',        'printing',   'FLEXO',            100, 'm_min',   100, 1200, NULL, 10, 150, 'BOBST',        '[]', NULL),
        ('PRT-004', 'FlexoTecnica',   'printing',   'FLEXO',            175, 'm_min',   175, 1400, NULL,  8, 180, 'FlexoTecnica', '[]', NULL),
        ('PRT-005', 'Carint',         'printing',   'FLEXO',            140, 'm_min',   140, 1200, NULL,  6, 160, 'Carint',       '[]', NULL),
        -- Lamination (1 with 3 modes)
        ('LAM-001', 'BOBST Nova 800', 'lamination', 'SOLVENTLESS_LAM',  200, 'm_min',   400, 1350, NULL, NULL, 160, 'BOBST',
          '[{"mode":"SB","speed":200},{"mode":"SF","speed":400},{"mode":"Mono","speed":200}]', NULL),
        -- Slitting (7)
        ('SLT-001', 'DCM 1',         'slitting',   'SLITTER',           400, 'm_min',   400, 1600, NULL, NULL, 100, 'DCM',         '[]', NULL),
        ('SLT-002', 'DCM 2',         'slitting',   'SLITTER',           350, 'm_min',   350, 1600, NULL, NULL,  90, 'DCM',         '[]', NULL),
        ('SLT-003', 'BIMEC',         'slitting',   'SLITTER',           500, 'm_min',   500, 1600, NULL, NULL, 110, 'BIMEC',       '[]', NULL),
        ('SLT-004', 'Belloni 2',     'slitting',   'SLITTER',           200, 'm_min',   200, 1400, NULL, NULL,  80, 'Belloni',     '[]', NULL),
        ('SLT-005', 'Giani 2',       'slitting',   'SLITTER',           400, 'm_min',   400, 1400, NULL, NULL,  90, 'Giani',       '[]', NULL),
        ('SLT-006', 'Giani 3',       'slitting',   'SLITTER',           400, 'm_min',   400, 1600, NULL, NULL,  90, 'Giani',       '[]', NULL),
        ('SLT-007', 'Andrevotti 2',  'slitting',   'SLITTER',           100, 'm_min',   100, 1200, NULL, NULL,  70, 'Andrevotti',  '[]', NULL),
        -- Seaming (2)
        ('SEA-001', 'Freschi',       'seaming',    'SEALER',            250, 'm_min',   250, 1400, NULL, NULL,  90, 'Freschi',     '[]', NULL),
        ('SEA-002', 'DCM Sleev 3',   'seaming',    'SEALER',            500, 'm_min',   500, 1600, NULL, NULL, 100, 'DCM',         '[]', NULL),
        -- Doctoring (4)
        ('DOC-001', 'Dhabha',        'doctoring',  'DOCTOR',            400, 'm_min',   400, 1400, NULL, NULL,  70, 'Dhabha',      '[]', NULL),
        ('DOC-002', 'DCM baby Cat 1','doctoring',  'DOCTOR',            250, 'm_min',   250, 1200, NULL, NULL,  60, 'DCM',         '[]', NULL),
        ('DOC-003', 'DCM baby Cat 2','doctoring',  'DOCTOR',            250, 'm_min',   250, 1200, NULL, NULL,  60, 'DCM',         '[]', NULL),
        ('DOC-004', 'Chinese',       'doctoring',  'DOCTOR',            250, 'm_min',   250, 1200, NULL, NULL,  55, 'Chinese',     '[]', NULL),
        -- Bag Making (5)
        ('BAG-001', 'Elba',          'bag_making', 'BAG_MAKER_SIDE',     85, 'pcs_min',  85, 1200, NULL, NULL, 120, 'Elba',        '[]', 'side'),
        ('BAG-002', 'Mamata',        'bag_making', 'BAG_MAKER_BOTTOM',   60, 'pcs_min',  60, 1000, NULL, NULL, 100, 'Mamata',      '[]', 'bottom'),
        ('BAG-003', 'HM4',           'bag_making', 'BAG_MAKER_SIDE',     80, 'pcs_min',  80, 1200, NULL, NULL, 110, 'HM',          '[]', 'side'),
        ('BAG-004', 'Mec100',        'bag_making', 'BAG_MAKER_SIDE',     70, 'pcs_min',  70, 1000, NULL, NULL,  90, 'Mec',         '[]', 'side'),
        ('BAG-005', 'Manual',        'bag_making', 'BAG_MAKER_SIDE',      0, 'pcs_min',   0,  800, NULL, NULL,  50, 'Manual',      '[]', 'side')
      ON CONFLICT (machine_code) DO NOTHING
    `);
    console.log('  ✅ Seed data — 29 machines inserted');

    await client.query('COMMIT');
    console.log('\n✅ Migration mes-master-002 complete.\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration mes-master-002 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
