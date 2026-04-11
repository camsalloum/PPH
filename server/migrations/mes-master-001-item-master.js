/**
 * Migration mes-master-001 — Item Master Table
 *
 * SAP Equivalent: Material Master (MM01/MM02)
 * Creates mes_item_master with price_control (MAP/STD), physical properties,
 * MRP parameters, and polymer processing properties (B7).
 * Includes 26 seed records for raw materials.
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
    console.log('🔧 Starting MES Master Data migration #001 — Item Master...\n');

    // ─── 1. mes_item_master ─────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_item_master (
        id                    SERIAL PRIMARY KEY,
        item_code             VARCHAR(50) UNIQUE NOT NULL,
        item_name             VARCHAR(255) NOT NULL,
        item_type             VARCHAR(50) NOT NULL,
        -- item_type values:
        --   raw_resin, raw_ink, raw_adhesive, raw_solvent, raw_packaging, raw_coating,
        --   semi_extruded, semi_printed, semi_laminated, semi_coated, semi_slit,
        --   fg_roll, fg_bag

        product_group         VARCHAR(100),

        -- Physical properties
        base_uom              VARCHAR(10) DEFAULT 'KG',
        density_g_cm3         DECIMAL(8,4),
        micron_thickness      DECIMAL(8,2),
        width_mm              DECIMAL(10,2),
        solid_pct             DECIMAL(5,2),

        -- Costing (SAP Accounting 1 view)
        price_control         VARCHAR(3) DEFAULT 'MAP',
        standard_price        DECIMAL(12,4),
        map_price             DECIMAL(12,4),
        market_ref_price      DECIMAL(12,4),
        market_price_date     DATE,
        last_po_price         DECIMAL(12,4),

        -- MRP
        mrp_type              VARCHAR(10) DEFAULT 'PD',
        reorder_point         DECIMAL(12,2),
        safety_stock_kg       DECIMAL(12,2),
        procurement_type      VARCHAR(10) DEFAULT 'EXTERNAL',
        planned_lead_time_days INT,
        lot_size_rule         VARCHAR(5) DEFAULT 'EX',
        fixed_lot_size_kg     DECIMAL(12,2),
        assembly_scrap_pct    DECIMAL(5,2),

        -- Classification
        subcategory           VARCHAR(100),
        grade_code            VARCHAR(50),
        waste_pct             DECIMAL(5,2) DEFAULT 3.0,

        -- Polymer processing properties (resins only)
        mfi                   DECIMAL(10,3),
        cof                   DECIMAL(10,3),
        sealing_temp_min      DECIMAL(10,2),
        sealing_temp_max      DECIMAL(10,2),

        -- Oracle sync reference
        oracle_category       VARCHAR(100),
        oracle_cat_desc       VARCHAR(200),
        oracle_type           VARCHAR(100),

        is_active             BOOLEAN DEFAULT true,
        created_by            INTEGER,
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('  ✅ mes_item_master — created');

    // ─── 2. Indexes ─────────────────────────────────────────────────────────
    await client.query(`CREATE INDEX IF NOT EXISTS idx_item_master_type ON mes_item_master(item_type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_item_master_pg ON mes_item_master(product_group)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_item_master_oracle ON mes_item_master(oracle_category, oracle_cat_desc)`);
    console.log('  ✅ Indexes — created');

    // ─── 3. Seed data — 26 raw materials ────────────────────────────────────
    await client.query(`
      INSERT INTO mes_item_master (item_code, item_name, item_type, density_g_cm3, micron_thickness, map_price, subcategory, mfi, cof, sealing_temp_min, sealing_temp_max)
      VALUES
        ('PET-12',    'PET Film 12μ',              'raw_resin',     1.40,  12,   2.50, 'PET',      NULL, NULL, NULL, NULL),
        ('BOPP-20',   'BOPP Film 20μ',             'raw_resin',     0.91,  20,   1.80, 'BOPP',     NULL, NULL, NULL, NULL),
        ('LLDPE-50',  'LLDPE Sealant 50μ',         'raw_resin',     0.92,  50,   1.70, 'PE',       1.0,  0.20, 110,  140),
        ('LDPE-25',   'LDPE Film 25μ',             'raw_resin',     0.92,  25,   1.65, 'PE',       2.0,  0.25, 105,  135),
        ('NY-15',     'Nylon Film 15μ',            'raw_resin',     1.14,  15,   4.50, 'PA',       NULL, NULL, NULL, NULL),
        ('ALU-7',     'Aluminum Foil 7μ',          'raw_resin',     2.70,   7,   8.50, 'ALU',      NULL, NULL, NULL, NULL),
        ('CPP-25',    'CPP Film 25μ',              'raw_resin',     0.90,  25,   1.90, 'PP',       7.0,  0.30, 140,  165),
        ('mLLDPE-30', 'mLLDPE Sealant 30μ',       'raw_resin',     0.92,  30,   2.10, 'PE',       1.0,  0.15, 100,  130),
        ('HDPE-20',   'HDPE Film 20μ',             'raw_resin',     0.96,  20,   1.55, 'PE',       NULL, NULL, NULL, NULL),
        ('ADH-SF',    'Solvent-Free PU Adhesive',  'raw_adhesive',  1.10,  NULL, 6.00, 'PU',       NULL, NULL, NULL, NULL),
        ('ADH-SB',    'Solvent-Based PU Adhesive', 'raw_adhesive',  1.10,  NULL, 9.00, 'PU',       NULL, NULL, NULL, NULL),
        ('ADH-WB',    'Water-Based Adhesive',      'raw_adhesive',  1.05,  NULL, 5.50, 'WB',       NULL, NULL, NULL, NULL),
        ('INK-PU-W',  'PU Ink White',              'raw_ink',       1.25,  NULL, 12.00, 'PU',      NULL, NULL, NULL, NULL),
        ('INK-PU-C',  'PU Ink Cyan',               'raw_ink',       1.00,  NULL, 15.00, 'PU',      NULL, NULL, NULL, NULL),
        ('INK-PU-M',  'PU Ink Magenta',            'raw_ink',       1.00,  NULL, 15.00, 'PU',      NULL, NULL, NULL, NULL),
        ('INK-PU-Y',  'PU Ink Yellow',             'raw_ink',       1.00,  NULL, 14.00, 'PU',      NULL, NULL, NULL, NULL),
        ('INK-PU-K',  'PU Ink Black',              'raw_ink',       1.00,  NULL, 13.00, 'PU',      NULL, NULL, NULL, NULL),
        ('INK-WB',    'Water-Based Ink Base',      'raw_ink',       1.00,  NULL, 10.00, 'WB',      NULL, NULL, NULL, NULL),
        ('SOLV-EA',   'Ethyl Acetate',             'raw_solvent',   NULL,  NULL, 1.20,  'Solvent',  NULL, NULL, NULL, NULL),
        ('SOLV-MEK',  'MEK',                       'raw_solvent',   NULL,  NULL, 1.50,  'Solvent',  NULL, NULL, NULL, NULL),
        ('SOLV-IPA',  'Isopropyl Alcohol',         'raw_solvent',   NULL,  NULL, 1.10,  'Solvent',  NULL, NULL, NULL, NULL),
        ('PKG-CORE3', '3-inch Paper Core',         'raw_packaging', NULL,  NULL, 0.45,  'Core',     NULL, NULL, NULL, NULL),
        ('PKG-STRCH', 'Stretch Film',              'raw_packaging', NULL,  NULL, 1.80,  'Packaging',NULL, NULL, NULL, NULL),
        ('VARN-GL',   'Gloss Varnish',             'raw_coating',   1.00,  NULL, 8.00,  'Varnish',  NULL, NULL, NULL, NULL),
        ('VARN-MT',   'Matte Varnish',             'raw_coating',   1.00,  NULL, 9.00,  'Varnish',  NULL, NULL, NULL, NULL),
        ('ZIP-STD',   'Standard Zipper Tape',      'raw_packaging', NULL,  NULL, 0.02,  'Zipper',   NULL, NULL, NULL, NULL)
      ON CONFLICT (item_code) DO NOTHING
    `);
    console.log('  ✅ Seed data — 26 raw materials inserted');

    await client.query('COMMIT');
    console.log('\n✅ Migration mes-master-001 complete.\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration mes-master-001 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
