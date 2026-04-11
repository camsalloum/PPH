/**
 * Migration mes-master-005 — BOM Templates
 * Creates: mes_bom_versions, mes_bom_layers, mes_bom_accessories, mes_bom_prepress
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
    console.log('🔧 Starting MES Master Data migration #005 — BOM Templates...\n');

    // ═══ 1. BOM Versions ═══
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_bom_versions (
        id                     SERIAL PRIMARY KEY,
        product_group_id       INT NOT NULL,
        product_type_id        INT REFERENCES mes_product_types(id),
        version_number         INT NOT NULL DEFAULT 1,
        version_name           VARCHAR(255),

        total_thickness_micron DECIMAL(10,2) DEFAULT 0,
        total_gsm              DECIMAL(10,4) DEFAULT 0,

        num_colors             INT DEFAULT 0,
        has_lamination         BOOLEAN DEFAULT false,
        lamination_type        VARCHAR(20),
        has_zipper             BOOLEAN DEFAULT false,
        has_varnish            BOOLEAN DEFAULT false,

        solvent_ratio          DECIMAL(5,2) DEFAULT 0.5,
        solvent_cost_per_kg    DECIMAL(10,4) DEFAULT 1.50,

        status                 VARCHAR(20) DEFAULT 'draft',
        is_default             BOOLEAN DEFAULT false,

        created_by             INTEGER,
        created_at             TIMESTAMPTZ DEFAULT NOW(),
        updated_at             TIMESTAMPTZ DEFAULT NOW(),
        notes                  TEXT,

        valid_from             DATE,
        valid_to               DATE,

        UNIQUE(product_group_id, product_type_id, version_number)
      );
    `);
    console.log('  ✅ mes_bom_versions — created');

    await client.query(`CREATE INDEX IF NOT EXISTS idx_bom_ver_pg ON mes_bom_versions(product_group_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bom_ver_status ON mes_bom_versions(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bom_ver_default ON mes_bom_versions(is_default);`);

    // A9: At most one active version per (PG, product_type) at any time
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bom_one_active
        ON mes_bom_versions(product_group_id, product_type_id) WHERE status = 'active';
    `);
    console.log('  ✅ Indexes + unique active constraint — created');

    // ═══ 2. BOM Layers ═══
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_bom_layers (
        id                    SERIAL PRIMARY KEY,
        bom_version_id        INT NOT NULL REFERENCES mes_bom_versions(id) ON DELETE RESTRICT,
        layer_order           INT NOT NULL DEFAULT 0,

        layer_type            VARCHAR(20) NOT NULL,
        layer_role            VARCHAR(50),

        item_id               INT REFERENCES mes_item_master(id),
        material_name         VARCHAR(255),
        material_category     VARCHAR(100),
        material_cat_desc     VARCHAR(200),
        material_type         VARCHAR(100),

        thickness_micron      DECIMAL(8,2),
        solid_pct             DECIMAL(5,2),
        density_g_cm3         DECIMAL(8,4),
        application_rate_gsm  DECIMAL(8,4),

        gsm                   DECIMAL(10,4),
        cost_per_kg           DECIMAL(12,4),
        waste_pct             DECIMAL(5,2) DEFAULT 3.0,
        cost_per_sqm          DECIMAL(12,6),

        color_name            VARCHAR(100),
        color_hex             VARCHAR(7),

        texture_pattern       VARCHAR(20) DEFAULT 'solid',

        is_active             BOOLEAN DEFAULT true,
        notes                 TEXT,
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('  ✅ mes_bom_layers — created');

    await client.query(`CREATE INDEX IF NOT EXISTS idx_bom_layers_ver ON mes_bom_layers(bom_version_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bom_layers_type ON mes_bom_layers(layer_type);`);

    // ═══ 3. BOM Accessories ═══
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_bom_accessories (
        id                    SERIAL PRIMARY KEY,
        bom_version_id        INT NOT NULL REFERENCES mes_bom_versions(id) ON DELETE RESTRICT,

        accessory_type        VARCHAR(30) NOT NULL,

        item_id               INT REFERENCES mes_item_master(id),
        material_name         VARCHAR(255),

        weight_per_meter_g    DECIMAL(8,4),
        cost_per_meter        DECIMAL(12,4),

        cost_per_unit         DECIMAL(12,4),
        unit_type             VARCHAR(20),
        quantity_formula_key  VARCHAR(50),

        waste_pct             DECIMAL(5,2) DEFAULT 2.0,
        is_active             BOOLEAN DEFAULT true,
        notes                 TEXT,
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('  ✅ mes_bom_accessories — created');

    // ═══ 4. BOM Pre-Press ═══
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_bom_prepress (
        id                    SERIAL PRIMARY KEY,
        bom_version_id        INT NOT NULL REFERENCES mes_bom_versions(id) ON DELETE RESTRICT,

        prepress_type         VARCHAR(20) NOT NULL,
        num_items             INT NOT NULL DEFAULT 1,
        cost_per_item         DECIMAL(12,4) NOT NULL DEFAULT 0,
        total_cost            DECIMAL(12,4) GENERATED ALWAYS AS (num_items * cost_per_item) STORED,

        amortization_method   VARCHAR(20) NOT NULL DEFAULT 'per_kg',
        amortization_qty      DECIMAL(14,2),
        repeat_distance_mm    DECIMAL(10,2),
        life_runs             INT,

        is_active             BOOLEAN DEFAULT true,
        notes                 TEXT,
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('  ✅ mes_bom_prepress — created');

    await client.query('COMMIT');
    console.log('\n✅ Migration mes-master-005 complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration mes-master-005 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
