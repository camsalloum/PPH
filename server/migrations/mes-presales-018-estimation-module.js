/**
 * Migration 018: Estimation Module
 *
 * Creates:
 *   1. mes_estimation_product_defaults — default material layers & processes per product group
 *   2. mes_material_master — raw material catalog (substrate/ink/adhesive)
 *   3. ALTER mes_quotations — add estimation_data JSONB column
 *   4. Seed product defaults and material master data for FP
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ─── 1. mes_estimation_product_defaults ─────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_estimation_product_defaults (
        id                      SERIAL PRIMARY KEY,
        product_group           VARCHAR(50) NOT NULL,
        default_material_layers JSONB NOT NULL,
        default_processes       JSONB NOT NULL,
        default_dimensions      JSONB,
        created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(product_group)
      )
    `);

    // ─── 2. mes_material_master ─────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_material_master (
        id            SERIAL PRIMARY KEY,
        category      VARCHAR(30) NOT NULL CHECK (category IN ('substrate','ink','adhesive')),
        subcategory   VARCHAR(100) NOT NULL,
        name          VARCHAR(255) NOT NULL,
        solid_pct     NUMERIC(6,2),
        density       NUMERIC(8,4),
        cost_per_kg   NUMERIC(10,2),
        waste_pct     NUMERIC(5,2),
        is_active     BOOLEAN DEFAULT TRUE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_material_category ON mes_material_master(category)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_material_active   ON mes_material_master(is_active)`);

    // ─── 3. ALTER mes_quotations — add estimation_data if not exists ────────
    await client.query(`
      ALTER TABLE mes_quotations
        ADD COLUMN IF NOT EXISTS estimation_data JSONB
    `);

    // ─── 4. Seed material master ────────────────────────────────────────────
    const seedMaterials = [
      // Substrates
      ['substrate', 'BOPP Film',     'BOPP Plain 20µm',           null, 0.91, 3.80, 3.0],
      ['substrate', 'BOPP Film',     'BOPP Metalized 20µm',       null, 0.91, 5.20, 3.0],
      ['substrate', 'BOPP Film',     'BOPP Heat Seal 25µm',       null, 0.91, 4.10, 3.0],
      ['substrate', 'BOPP Film',     'BOPP Matte 20µm',           null, 0.91, 4.50, 3.0],
      ['substrate', 'PET Film',      'PET Plain 12µm',            null, 1.39, 4.50, 2.5],
      ['substrate', 'PET Film',      'PET Metalized 12µm',        null, 1.39, 5.80, 2.5],
      ['substrate', 'PET Film',      'PET White 12µm',            null, 1.39, 5.00, 2.5],
      ['substrate', 'Nylon (PA)',    'Nylon 15µm',                null, 1.14, 7.50, 3.0],
      ['substrate', 'Nylon (PA)',    'Nylon 25µm',                null, 1.14, 7.50, 3.0],
      ['substrate', 'PE Film',       'LDPE 50µm',                 null, 0.92, 2.80, 4.0],
      ['substrate', 'PE Film',       'LDPE 70µm',                 null, 0.92, 2.80, 4.0],
      ['substrate', 'PE Film',       'LDPE 100µm',                null, 0.92, 2.80, 4.0],
      ['substrate', 'PE Film',       'LLDPE 50µm',                null, 0.92, 3.00, 4.0],
      ['substrate', 'PE Film',       'HDPE 20µm',                 null, 0.95, 3.20, 3.5],
      ['substrate', 'CPP Film',      'CPP Plain 25µm',            null, 0.91, 3.50, 3.0],
      ['substrate', 'CPP Film',      'CPP Metalized 25µm',        null, 0.91, 5.00, 3.0],
      ['substrate', 'Aluminium',     'Aluminium Foil 7µm',        null, 2.70, 9.50, 2.0],
      ['substrate', 'Aluminium',     'Aluminium Foil 9µm',        null, 2.70, 9.50, 2.0],
      // Inks
      ['ink', 'Gravure Ink',   'White Ink',                     40.0, null, 6.50, 5.0],
      ['ink', 'Gravure Ink',   'Process Cyan',                  30.0, null, 8.00, 5.0],
      ['ink', 'Gravure Ink',   'Process Magenta',               30.0, null, 8.00, 5.0],
      ['ink', 'Gravure Ink',   'Process Yellow',                30.0, null, 7.50, 5.0],
      ['ink', 'Gravure Ink',   'Process Black',                 35.0, null, 7.00, 5.0],
      ['ink', 'Gravure Ink',   'Gold/Silver Metallic',          25.0, null, 12.00, 6.0],
      ['ink', 'Gravure Ink',   'Spot PMS Colour',               30.0, null, 9.00, 5.0],
      ['ink', 'Flexo Ink',     'Flexo Water-Based White',       45.0, null, 5.50, 4.0],
      ['ink', 'Flexo Ink',     'Flexo UV Curable',              50.0, null, 14.00, 3.0],
      // Adhesives
      ['adhesive', 'Solvent-Based', 'PU Adhesive (solvent)',     35.0, null, 8.50, 4.0],
      ['adhesive', 'Solvent-Based', 'PU Adhesive (high solid)',  50.0, null, 9.50, 3.5],
      ['adhesive', 'Solventless',   'Solventless PU Adhesive',  100.0, null, 7.00, 2.5],
      ['adhesive', 'Water-Based',   'Water-Based Adhesive',      40.0, null, 5.50, 5.0],
      ['adhesive', 'Wax',           'Hot Melt Wax',             100.0, null, 4.50, 2.0],
    ];

    for (const [cat, sub, name, solid, density, cost, waste] of seedMaterials) {
      await client.query(
        `INSERT INTO mes_material_master (category, subcategory, name, solid_pct, density, cost_per_kg, waste_pct)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [cat, sub, name, solid, density, cost, waste]
      );
    }

    // ─── 5. Seed product group defaults ─────────────────────────────────────
    const defaultProcesses = [
      { process_name: 'Extrusion',        enabled: false, default_speed: 200,  default_cost_per_hr: 120, speed_unit: 'Kgs/Hr' },
      { process_name: 'Printing',         enabled: true,  default_speed: 150,  default_cost_per_hr: 180, speed_unit: 'Mtr/Min' },
      { process_name: 'Rewinding',        enabled: true,  default_speed: 200,  default_cost_per_hr: 80,  speed_unit: 'Mtr/Min' },
      { process_name: 'Lamination 1',     enabled: false, default_speed: 120,  default_cost_per_hr: 160, speed_unit: 'Mtr/Min' },
      { process_name: 'Lamination 2',     enabled: false, default_speed: 120,  default_cost_per_hr: 160, speed_unit: 'Mtr/Min' },
      { process_name: 'Lamination 3',     enabled: false, default_speed: 120,  default_cost_per_hr: 160, speed_unit: 'Mtr/Min' },
      { process_name: 'Slitting',         enabled: true,  default_speed: 250,  default_cost_per_hr: 100, speed_unit: 'Mtr/Min' },
      { process_name: 'Sleeving',         enabled: false, default_speed: 60,   default_cost_per_hr: 90,  speed_unit: 'Mtr/Min' },
      { process_name: 'Sleeve Doctoring', enabled: false, default_speed: 80,   default_cost_per_hr: 70,  speed_unit: 'Mtr/Min' },
      { process_name: 'Pouch Making',     enabled: false, default_speed: 80,   default_cost_per_hr: 150, speed_unit: 'Pcs/Min' },
    ];

    const productDefaults = [
      {
        product_group: 'BOPP',
        layers: [
          { type: 'substrate', material_name: 'PET Plain 12µm', micron: 12, density: 1.39, cost_per_kg: 4.50, waste_pct: 2.5 },
          { type: 'ink',       material_name: 'White Ink',       micron: 2,  solid_pct: 40, cost_per_kg: 6.50, waste_pct: 5.0 },
          { type: 'adhesive',  material_name: 'Solventless PU Adhesive', micron: 2, solid_pct: 100, cost_per_kg: 7.00, waste_pct: 2.5 },
          { type: 'substrate', material_name: 'BOPP Plain 20µm', micron: 20, density: 0.91, cost_per_kg: 3.80, waste_pct: 3.0 },
        ],
        processes: defaultProcesses.map(p => ({
          ...p,
          enabled: ['Printing', 'Rewinding', 'Lamination 1', 'Slitting'].includes(p.process_name) ? true : p.enabled,
        })),
      },
      {
        product_group: 'PET',
        layers: [
          { type: 'substrate', material_name: 'PET Plain 12µm', micron: 12, density: 1.39, cost_per_kg: 4.50, waste_pct: 2.5 },
          { type: 'ink',       material_name: 'White Ink',       micron: 2,  solid_pct: 40, cost_per_kg: 6.50, waste_pct: 5.0 },
          { type: 'adhesive',  material_name: 'Solventless PU Adhesive', micron: 2, solid_pct: 100, cost_per_kg: 7.00, waste_pct: 2.5 },
          { type: 'substrate', material_name: 'LDPE 50µm',      micron: 50, density: 0.92, cost_per_kg: 2.80, waste_pct: 4.0 },
        ],
        processes: defaultProcesses.map(p => ({
          ...p,
          enabled: ['Printing', 'Rewinding', 'Lamination 1', 'Slitting'].includes(p.process_name) ? true : p.enabled,
        })),
      },
      {
        product_group: 'PA/PE',
        layers: [
          { type: 'substrate', material_name: 'Nylon 15µm',     micron: 15, density: 1.14, cost_per_kg: 7.50, waste_pct: 3.0 },
          { type: 'ink',       material_name: 'White Ink',       micron: 2,  solid_pct: 40, cost_per_kg: 6.50, waste_pct: 5.0 },
          { type: 'adhesive',  material_name: 'Solventless PU Adhesive', micron: 2, solid_pct: 100, cost_per_kg: 7.00, waste_pct: 2.5 },
          { type: 'substrate', material_name: 'LDPE 70µm',      micron: 70, density: 0.92, cost_per_kg: 2.80, waste_pct: 4.0 },
        ],
        processes: defaultProcesses.map(p => ({
          ...p,
          enabled: ['Printing', 'Rewinding', 'Lamination 1', 'Slitting', 'Pouch Making'].includes(p.process_name) ? true : p.enabled,
        })),
      },
      {
        product_group: 'CPP',
        layers: [
          { type: 'substrate', material_name: 'CPP Plain 25µm', micron: 25, density: 0.91, cost_per_kg: 3.50, waste_pct: 3.0 },
          { type: 'ink',       material_name: 'White Ink',       micron: 2,  solid_pct: 40, cost_per_kg: 6.50, waste_pct: 5.0 },
        ],
        processes: defaultProcesses.map(p => ({
          ...p,
          enabled: ['Printing', 'Rewinding', 'Slitting'].includes(p.process_name) ? true : p.enabled,
        })),
      },
      {
        product_group: 'LDPE',
        layers: [
          { type: 'substrate', material_name: 'LDPE 100µm', micron: 100, density: 0.92, cost_per_kg: 2.80, waste_pct: 4.0 },
          { type: 'ink',       material_name: 'Flexo Water-Based White', micron: 2, solid_pct: 45, cost_per_kg: 5.50, waste_pct: 4.0 },
        ],
        processes: defaultProcesses.map(p => ({
          ...p,
          enabled: ['Extrusion', 'Printing', 'Slitting'].includes(p.process_name) ? true : p.enabled,
        })),
      },
      {
        product_group: 'Metalized',
        layers: [
          { type: 'substrate', material_name: 'PET Metalized 12µm', micron: 12, density: 1.39, cost_per_kg: 5.80, waste_pct: 2.5 },
          { type: 'ink',       material_name: 'White Ink',            micron: 2,  solid_pct: 40, cost_per_kg: 6.50, waste_pct: 5.0 },
          { type: 'adhesive',  material_name: 'Solventless PU Adhesive', micron: 2, solid_pct: 100, cost_per_kg: 7.00, waste_pct: 2.5 },
          { type: 'substrate', material_name: 'LDPE 50µm',           micron: 50, density: 0.92, cost_per_kg: 2.80, waste_pct: 4.0 },
        ],
        processes: defaultProcesses.map(p => ({
          ...p,
          enabled: ['Printing', 'Rewinding', 'Lamination 1', 'Slitting'].includes(p.process_name) ? true : p.enabled,
        })),
      },
    ];

    for (const pd of productDefaults) {
      await client.query(
        `INSERT INTO mes_estimation_product_defaults (product_group, default_material_layers, default_processes, default_dimensions)
         VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb)
         ON CONFLICT (product_group) DO UPDATE SET
           default_material_layers = EXCLUDED.default_material_layers,
           default_processes       = EXCLUDED.default_processes,
           updated_at              = NOW()`,
        [
          pd.product_group,
          JSON.stringify(pd.layers),
          JSON.stringify(pd.processes),
          JSON.stringify({ reel_width: 1000, cut_off: 300, extra_trim: 10, num_ups: 1 }),
        ]
      );
    }

    await client.query('COMMIT');
    logger.info('Migration 018: estimation module tables created + seeded');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration 018 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS mes_estimation_product_defaults CASCADE');
    await client.query('DROP TABLE IF EXISTS mes_material_master CASCADE');
    await client.query('ALTER TABLE mes_quotations DROP COLUMN IF EXISTS estimation_data');
    await client.query('COMMIT');
    logger.info('Migration 018: estimation module reverted');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
