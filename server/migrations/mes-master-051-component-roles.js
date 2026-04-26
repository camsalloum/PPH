/**
 * Migration mes-master-051 — Component Roles
 * Creates mes_component_roles table with seed data from hardcoded defaults.
 * Run: node server/migrations/mes-master-051-component-roles.js
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'fp_database',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_component_roles (
        id            SERIAL PRIMARY KEY,
        material_class VARCHAR(50) NOT NULL,
        value         VARCHAR(50) NOT NULL,
        label         VARCHAR(100) NOT NULL,
        sort_order    INTEGER NOT NULL DEFAULT 0,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_component_role UNIQUE (material_class, value)
      )
    `);

    // Seed with existing hardcoded defaults
    const seeds = [
      // adhesives
      ['adhesives', 'resin',     'Resin',     0],
      ['adhesives', 'hardener',  'Hardener',  1],
      ['adhesives', 'catalyst',  'Catalyst',  2],
      ['adhesives', 'solvent',   'Solvent',   3],
      ['adhesives', 'other',     'Other',     4],
      // inks
      ['inks',      'pigment',   'Pigment',   0],
      ['inks',      'binder',    'Binder',    1],
      ['inks',      'solvent',   'Solvent',   2],
      ['inks',      'additive',  'Additive',  3],
      ['inks',      'other',     'Other',     4],
      // generic / fallback (_default)
      ['_default',  'base',      'Base',      0],
      ['_default',  'additive',  'Additive',  1],
      ['_default',  'diluent',   'Diluent',   2],
      ['_default',  'other',     'Other',     3],
    ];

    for (const [material_class, value, label, sort_order] of seeds) {
      await client.query(`
        INSERT INTO mes_component_roles (material_class, value, label, sort_order)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (material_class, value) DO NOTHING
      `, [material_class, value, label, sort_order]);
    }

    await client.query('COMMIT');
    console.log('✅ Migration 051 complete — mes_component_roles created and seeded.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 051 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

up().catch(() => process.exit(1));
