/**
 * Migration: Add is_prospect column to fp_budget_unified and fp_budget_bulk_import
 * Run this script to add the is_prospect column for tracking prospect customers
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  database: 'fp_database',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  port: 5432
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Starting migration: Add is_prospect column...');

    // Add is_prospect to fp_budget_unified
    await client.query(`
      ALTER TABLE fp_budget_unified
      ADD COLUMN IF NOT EXISTS is_prospect BOOLEAN DEFAULT false
    `);
    console.log('✅ Added is_prospect to fp_budget_unified');

    // Add is_prospect to fp_budget_bulk_import
    await client.query(`
      ALTER TABLE fp_budget_bulk_import
      ADD COLUMN IF NOT EXISTS is_prospect BOOLEAN DEFAULT false
    `);
    console.log('✅ Added is_prospect to fp_budget_bulk_import');

    // Create index for faster queries on prospects
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_budget_unified_prospect
      ON fp_budget_unified (is_prospect)
      WHERE is_prospect = true
    `);
    console.log('✅ Created index for prospect queries');

    console.log('\n✅ Migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
