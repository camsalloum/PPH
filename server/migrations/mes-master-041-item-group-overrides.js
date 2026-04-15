/**
 * Migration mes-master-041 — Item Group Overrides (Custom Category Groups)
 *
 * Adds support for virtual category groups (e.g., "LDPE-PCR") that can contain
 * specific items rebucketed from their original Oracle CATLINEDESC group.
 *
 * Changes:
 * 1. Creates mes_item_group_overrides table
 * 2. Adds is_custom + display_name columns to mes_item_category_groups
 *
 * Run: node server/migrations/mes-master-041-item-group-overrides.js
 */
'use strict';

const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'fp_database',
  user: process.env.DB_USER || 'postgres',
  password: String(process.env.DB_PASSWORD ?? ''),
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('Starting migration #041 — Item Group Overrides...');

    // 1. Create the overrides table
    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_item_group_overrides (
        id                  SERIAL PRIMARY KEY,
        category_id         INTEGER NOT NULL REFERENCES mes_item_categories(id) ON DELETE CASCADE,
        override_group_name TEXT NOT NULL,
        item_key            TEXT NOT NULL,
        original_catlinedesc TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_group_override_item UNIQUE (category_id, item_key)
      )
    `);
    console.log('  + mes_item_group_overrides created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_group_overrides_category
        ON mes_item_group_overrides (category_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_group_overrides_group_name
        ON mes_item_group_overrides (category_id, override_group_name)
    `);
    console.log('  + indexes created');

    // 2. Add is_custom and display_name to mes_item_category_groups
    await client.query(`
      ALTER TABLE mes_item_category_groups
      ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT false
    `);
    await client.query(`
      ALTER TABLE mes_item_category_groups
      ADD COLUMN IF NOT EXISTS display_name TEXT
    `);
    console.log('  + is_custom + display_name columns added to mes_item_category_groups');

    await client.query('COMMIT');
    console.log('Migration #041 completed.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration #041 failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS mes_item_group_overrides');
    await client.query(`ALTER TABLE mes_item_category_groups DROP COLUMN IF EXISTS is_custom`);
    await client.query(`ALTER TABLE mes_item_category_groups DROP COLUMN IF EXISTS display_name`);
    await client.query('COMMIT');
    console.log('Migration #041 rolled back.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration #041 rollback failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { up, down };

if (require.main === module) {
  up()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error(e);
      await pool.end();
      process.exit(1);
    });
}