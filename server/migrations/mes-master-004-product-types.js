/**
 * Migration mes-master-004 — Product Types Table
 *
 * Creates mes_product_types with calculation_basis (B6: KG/M2/PCS),
 * dimension configuration, and formula keys.
 * Seeds 7 product types from factory reference (docx).
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
    console.log('🔧 Starting MES Master Data migration #004 — Product Types...\n');

    // ─── 1. mes_product_types ───────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_product_types (
        id                      SERIAL PRIMARY KEY,
        type_code               VARCHAR(50) UNIQUE NOT NULL,
        type_name               VARCHAR(255) NOT NULL,
        category                VARCHAR(50) NOT NULL,

        -- Waste & allowance
        waste_factor_pct        DECIMAL(5,2) NOT NULL DEFAULT 3.0,
        handle_allowance_factor DECIMAL(5,4),

        -- Dimension configuration
        dimension_fields        JSONB NOT NULL DEFAULT '[]',

        -- Boolean flags
        has_gusset              BOOLEAN DEFAULT false,
        has_handle              BOOLEAN DEFAULT false,
        has_bottom_seal         BOOLEAN DEFAULT false,

        -- Formula keys (used by calculation-engine.js)
        calc_formula_key        VARCHAR(50) NOT NULL,
        layflat_formula_key     VARCHAR(50) NOT NULL,

        -- Calculation basis (B6)
        calculation_basis       VARCHAR(20) NOT NULL DEFAULT 'KG'
          CHECK (calculation_basis IN ('KG', 'M2', 'PCS')),

        is_active               BOOLEAN DEFAULT true,
        created_at              TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('  ✅ mes_product_types — created');

    // ─── 2. Seed data — 7 product types ─────────────────────────────────────
    await client.query(`
      INSERT INTO mes_product_types (type_code, type_name, category, waste_factor_pct, handle_allowance_factor, has_gusset, has_handle, has_bottom_seal, calc_formula_key, layflat_formula_key, calculation_basis, dimension_fields)
      VALUES
        ('FLAT',          'Flat Bag',        'bag',    3.0,  NULL, false, false, false, 'flat',          'flat',          'PCS',
         '[{"field":"width","label":"Width (mm)","required":true},{"field":"length","label":"Length (mm)","required":true}]'),
        ('SIDE_GUSSET',   'Side Gusset Bag', 'bag',    5.0,  NULL, true,  false, false, 'side_gusset',   'side_gusset',   'PCS',
         '[{"field":"width","label":"Width (mm)","required":true},{"field":"length","label":"Length (mm)","required":true},{"field":"gusset","label":"Gusset (mm)","required":true}]'),
        ('BOTTOM_GUSSET', 'Bottom Gusset',   'bag',    5.0,  NULL, true,  false, true,  'bottom_gusset', 'bottom_gusset', 'PCS',
         '[{"field":"width","label":"Width (mm)","required":true},{"field":"length","label":"Length (mm)","required":true},{"field":"gusset","label":"Gusset (mm)","required":true}]'),
        ('TSHIRT',        'T-shirt Bag',     'bag',    8.0,  1.12, false, true,  false, 'tshirt',        'tshirt',        'PCS',
         '[{"field":"width","label":"Width (mm)","required":true},{"field":"length","label":"Length (mm)","required":true}]'),
        ('WICKET',        'Wicket/Roll Bag', 'bag',    4.0,  NULL, false, false, false, 'wicket',        'wicket',        'PCS',
         '[{"field":"width","label":"Width (mm)","required":true},{"field":"length","label":"Length (mm)","required":true}]'),
        ('ROLL',          'Roll Film',       'roll',   2.0,  NULL, false, false, false, 'roll',          'roll',          'KG',
         '[{"field":"width","label":"Width (mm)","required":true}]'),
        ('SLEEVE',        'Sleeve',          'sleeve', 2.0,  NULL, false, false, false, 'sleeve',        'sleeve',        'M2',
         '[{"field":"circumference","label":"Circumference (mm)","required":true}]')
      ON CONFLICT (type_code) DO NOTHING
    `);
    console.log('  ✅ Seed data — 7 product types inserted');

    await client.query('COMMIT');
    console.log('\n✅ Migration mes-master-004 complete.\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration mes-master-004 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
