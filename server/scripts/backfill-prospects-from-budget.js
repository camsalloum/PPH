/**
 * Backfill Prospects from Budget Unified Table
 * 
 * This script syncs the fp_prospects table from existing budget data that has is_prospect=true.
 * This fixes the issue where Live Budget Entry or Bulk Import may have saved budget with
 * is_prospect=true but didn't update the prospects table.
 * 
 * Run: node server/scripts/backfill-prospects-from-budget.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  database: 'fp_database',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DB_PORT) || 5432
});

async function backfillProspects() {
  console.log('\n========================================');
  console.log('🔄 Backfill Prospects from Budget Data');
  console.log('========================================\n');

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Check if prospects table exists, create if not
    const tableCheck = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'fp_prospects'
    `);

    if (tableCheck.rows.length === 0) {
      console.log('📊 Creating fp_prospects table...');
      
      await client.query(`
        CREATE TABLE IF NOT EXISTS fp_prospects (
          id SERIAL PRIMARY KEY,
          customer_name VARCHAR(255) NOT NULL,
          country VARCHAR(100),
          sales_rep_group VARCHAR(255),
          division VARCHAR(50) NOT NULL,
          source_batch_id VARCHAR(100),
          budget_year INTEGER,
          status VARCHAR(50) DEFAULT 'prospect',
          converted_to_customer BOOLEAN DEFAULT false,
          converted_at TIMESTAMP,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(customer_name, division, country, sales_rep_group)
        )
      `);

      await client.query(`CREATE INDEX IF NOT EXISTS idx_fp_prospects_status ON fp_prospects(status)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_fp_prospects_customer ON fp_prospects(customer_name)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_fp_prospects_division ON fp_prospects(division)`);
      
      console.log('✅ Created fp_prospects table\n');
    }

    // 2. Get all prospects from budget_unified with is_prospect=true
    console.log('🔍 Finding prospects from fp_budget_unified...');
    
    const prospectsFromBudget = await client.query(`
      SELECT DISTINCT
        customer_name,
        country,
        sales_rep_group_name as sales_rep_group,
        UPPER(division_code) as division,
        data_source as source_batch_id,
        budget_year,
        MIN(created_at) as first_added
      FROM fp_budget_unified
      WHERE is_prospect = true
        AND customer_name IS NOT NULL
        AND TRIM(customer_name) != ''
      GROUP BY customer_name, country, sales_rep_group_name, division_code, data_source, budget_year
      ORDER BY customer_name
    `);

    console.log(`   Found ${prospectsFromBudget.rows.length} prospect records in budget data\n`);

    // 3. Also check bulk import table
    const prospectsFromBulk = await client.query(`
      SELECT DISTINCT
        customer as customer_name,
        country,
        sales_rep as sales_rep_group,
        UPPER(division) as division,
        batch_id as source_batch_id,
        budget_year,
        MIN(imported_at) as first_added
      FROM fp_budget_bulk_import
      WHERE is_prospect = true
        AND customer IS NOT NULL
        AND TRIM(customer) != ''
      GROUP BY customer, country, sales_rep, division, batch_id, budget_year
      ORDER BY customer
    `).catch(() => ({ rows: [] })); // Table might not exist

    console.log(`   Found ${prospectsFromBulk.rows.length} prospect records in bulk import data\n`);

    // 4. Combine and deduplicate (unique by: customer_name, division, country, sales_rep_group)
    const allProspects = new Map();
    
    for (const row of prospectsFromBudget.rows) {
      const key = `${row.customer_name}|${row.division}|${row.country}|${row.sales_rep_group}`;
      if (!allProspects.has(key)) {
        allProspects.set(key, row);
      }
    }
    
    for (const row of prospectsFromBulk.rows) {
      const key = `${row.customer_name}|${row.division}|${row.country}|${row.sales_rep_group}`;
      if (!allProspects.has(key)) {
        allProspects.set(key, row);
      }
    }

    console.log(`📊 Total unique prospects to sync: ${allProspects.size}\n`);

    // 5. Insert into prospects table (upsert by new unique key)
    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const [key, prospect] of allProspects) {
      try {
        const result = await client.query(`
          INSERT INTO fp_prospects 
            (customer_name, country, sales_rep_group, division, source_batch_id, budget_year, status)
          VALUES ($1, $2, $3, $4, $5, $6, 'prospect')
          ON CONFLICT (customer_name, division, country, sales_rep_group) DO UPDATE SET
            updated_at = CURRENT_TIMESTAMP,
            budget_year = GREATEST(fp_prospects.budget_year, EXCLUDED.budget_year)
          RETURNING (xmax = 0) as is_insert
        `, [
          prospect.customer_name,
          prospect.country,
          prospect.sales_rep_group,
          prospect.division,
          prospect.source_batch_id,
          prospect.budget_year
        ]);

        if (result.rows[0]?.is_insert) {
          inserted++;
        } else {
          updated++;
        }
      } catch (err) {
        console.log(`   ⚠️ Error with "${prospect.customer_name}": ${err.message}`);
        errors++;
      }
    }

    await client.query('COMMIT');

    console.log('\n========================================');
    console.log('📊 Summary:');
    console.log(`   ✅ Inserted: ${inserted} new prospects`);
    console.log(`   🔄 Updated: ${updated} existing prospects`);
    if (errors > 0) {
      console.log(`   ⚠️ Errors: ${errors}`);
    }
    console.log('========================================\n');

    // 6. Show current prospects count
    const totalProspects = await pool.query(`
      SELECT 
        division,
        budget_year,
        COUNT(*) as count
      FROM fp_prospects
      GROUP BY division, budget_year
      ORDER BY budget_year DESC, division
    `);

    console.log('📋 Current prospects by division/year:');
    for (const row of totalProspects.rows) {
      console.log(`   ${row.division} / ${row.budget_year}: ${row.count} prospects`);
    }
    console.log('');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error during backfill:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

backfillProspects()
  .then(() => {
    console.log('✅ Backfill completed successfully!\n');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Backfill failed:', err.message);
    process.exit(1);
  });
