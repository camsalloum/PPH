/**
 * Migration mes-master-015 — TDS Module Tables
 *
 * Creates:
 *   1. mes_suppliers — Supplier master
 *   2. mes_material_tds — Full TDS records (~55 columns, mirrors resin_tds_form)
 *   3. mes_tds_attachments — PDF / document storage
 *
 * Density stored in kg/m³ (matching fp_actualrmdata).
 * All seed data from KB will be loaded in migration 016.
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
    console.log('🔧 Starting MES migration #015 — TDS Module Tables...\n');

    // ── 1. mes_suppliers ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_suppliers (
        id              SERIAL PRIMARY KEY,
        name            VARCHAR(200) NOT NULL UNIQUE,
        country         VARCHAR(100),
        contact_info    TEXT,
        website         VARCHAR(500),
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('  ✅ mes_suppliers created');

    // ── 2. mes_material_tds ───────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_material_tds (
        id                  SERIAL PRIMARY KEY,

        -- Header / Linkage
        oracle_item_code    VARCHAR(100),
        supplier_id         INTEGER REFERENCES mes_suppliers(id),
        brand_grade         VARCHAR(200) NOT NULL,
        category            VARCHAR(100) DEFAULT 'Resins',
        cat_desc            VARCHAR(100),
        material_code       VARCHAR(100),
        grade_type          VARCHAR(200),
        status              VARCHAR(20) DEFAULT 'review'
                            CHECK (status IN ('draft','review','verified','corrected')),
        version             INTEGER DEFAULT 1,
        validated_by        INTEGER,
        validated_at        TIMESTAMPTZ,

        -- Section 1: Identity & Classification
        resin_type          VARCHAR(50),
        catalyst_type       VARCHAR(100),
        comonomer_type      VARCHAR(50),
        production_process  VARCHAR(100),
        polymer_type        VARCHAR(100),
        applications        TEXT,

        -- Section 2: Core Rheology
        mfi                 DECIMAL(8,3),
        mfi_test_method     VARCHAR(100),
        hlmi                DECIMAL(8,3),
        melt_flow_ratio     DECIMAL(8,2),
        density             INTEGER,
        density_test_method VARCHAR(100),
        mwd                 VARCHAR(20),
        melt_temp_min       INTEGER,
        melt_temp_max       INTEGER,
        melting_point       DECIMAL(6,1),
        vicat_softening     DECIMAL(6,1),

        -- Section 3: Additive Package
        additive_package    VARCHAR(300),
        slip_type           VARCHAR(50),
        slip_ppm            INTEGER,
        antiblock_type      VARCHAR(100),
        antiblock_pct       DECIMAL(6,3),
        antistatic_type     VARCHAR(100),
        antistatic_ppm      INTEGER,
        processing_aid      BOOLEAN DEFAULT false,
        processing_aid_pct  DECIMAL(6,4),
        stabiliser          BOOLEAN DEFAULT false,
        stabiliser_notes    VARCHAR(300),
        tnpp_free           VARCHAR(20),

        -- Section 4: Film Performance — Optical
        haze                DECIMAL(6,2),
        gloss               DECIMAL(6,2),

        -- Section 4: Film Performance — Mechanical
        dart_drop           INTEGER,
        tear_md             DECIMAL(8,1),
        tear_td             DECIMAL(8,1),
        tensile_yield_md    DECIMAL(8,2),
        tensile_yield_td    DECIMAL(8,2),
        tensile_break_md    DECIMAL(8,2),
        tensile_break_td    DECIMAL(8,2),
        elongation_md       INTEGER,
        elongation_td       INTEGER,
        secant_modulus      DECIMAL(8,1),

        -- Section 5: Sealing & Surface
        seal_init_temp      INTEGER,
        seal_peak_strength  DECIMAL(6,2),
        hot_tack_temp       INTEGER,
        hot_tack_strength   DECIMAL(6,2),
        cof_static          DECIMAL(5,3),
        cof_kinetic         DECIMAL(5,3),
        cof_config          VARCHAR(50),

        -- Section 6: Compliance
        food_contact        VARCHAR(100),
        food_contact_reg    VARCHAR(200),
        uv_stabilised       BOOLEAN DEFAULT false,

        -- Section 7: Advanced Rheology
        viscosity_curve_avail  BOOLEAN DEFAULT false,
        ext_viscosity_avail    BOOLEAN DEFAULT false,
        dsc_avail              BOOLEAN DEFAULT false,
        advanced_data_ref      VARCHAR(300),
        notes                  TEXT,

        -- Section 8: Source
        source_name         VARCHAR(300),
        source_url          VARCHAR(500),
        source_date         VARCHAR(50),

        -- Timestamps
        created_by          INTEGER,
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('  ✅ mes_material_tds created');

    // Indexes for common queries
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tds_category ON mes_material_tds(category)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tds_cat_desc ON mes_material_tds(cat_desc)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tds_supplier ON mes_material_tds(supplier_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tds_status ON mes_material_tds(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tds_oracle_item ON mes_material_tds(oracle_item_code)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tds_resin_type ON mes_material_tds(resin_type)`);
    console.log('  ✅ Indexes created');

    // ── 3. mes_tds_attachments ────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_tds_attachments (
        id            SERIAL PRIMARY KEY,
        tds_id        INTEGER NOT NULL REFERENCES mes_material_tds(id) ON DELETE CASCADE,
        file_name     VARCHAR(500) NOT NULL,
        file_path     VARCHAR(1000) NOT NULL,
        file_type     VARCHAR(50),
        file_size     INTEGER,
        uploaded_by   INTEGER,
        uploaded_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tds_attach_tds ON mes_tds_attachments(tds_id)`);
    console.log('  ✅ mes_tds_attachments created');

    await client.query('COMMIT');
    console.log('\n✅ Migration mes-master-015 complete. 3 tables + 7 indexes created.\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration mes-master-015 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
