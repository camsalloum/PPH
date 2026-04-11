/**
 * Initialize Prospect Lifecycle
 * 
 * This script:
 * 1. Updates existing prospects to have proper status (lead, prospect)
 * 2. Runs automatic conversion detection
 * 3. Syncs is_prospect from budget table to fp_prospects
 * 
 * Run: node server/scripts/init-prospect-lifecycle.js
 */

require('dotenv').config({ path: 'server/.env' });
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  database: 'fp_database',
  user: 'postgres',
  password: process.env.DB_PASSWORD,
  port: 5432
});

async function initProspectLifecycle() {
  console.log('=== INITIALIZING PROSPECT LIFECYCLE ===\n');
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. First, update all existing prospects to have 'prospect' status if NULL
    console.log('1. Updating existing prospects with proper status...');
    const updateStatus = await client.query(`
      UPDATE fp_prospects 
      SET status = 'prospect',
          updated_at = NOW()
      WHERE status IS NULL OR status = ''
    `);
    console.log(`   Updated ${updateStatus.rowCount} prospects with 'prospect' status`);
    
    // 2. Sync all is_prospect=true from budget to fp_prospects
    console.log('\n2. Syncing prospects from fp_budget_unified...');
    const budgetProspects = await client.query(`
      SELECT DISTINCT 
        customer_name,
        country,
        sales_rep_name,
        division_code as division,
        budget_year
      FROM fp_budget_unified
      WHERE is_prospect = true
    `);
    
    let synced = 0;
    for (const row of budgetProspects.rows) {
      const result = await client.query(`
        INSERT INTO fp_prospects (
          customer_name, country, sales_rep_group, division, 
          budget_year, status, converted_to_customer,
          source_batch_id, created_at, updated_at
        ) VALUES (
          $1, $2, $3, COALESCE($4, 'FP'),
          COALESCE($5, 2026), 'prospect', false,
          'budget-sync-init', NOW(), NOW()
        )
        ON CONFLICT (customer_name, division, country, sales_rep_group) 
        DO UPDATE SET 
          budget_year = GREATEST(fp_prospects.budget_year, EXCLUDED.budget_year),
          updated_at = NOW()
        RETURNING id
      `, [
        row.customer_name?.trim() || 'Unknown',
        row.country?.trim() || 'Unknown',
        row.sales_rep_name?.trim() || 'Unknown',
        row.division,
        row.budget_year
      ]);
      if (result.rows.length > 0) synced++;
    }
    console.log(`   Synced ${synced} prospects from budget table`);
    
    // 3. Detect conversions - find prospects that have actual sales
    console.log('\n3. Detecting prospect conversions...');
    const convertible = await client.query(`
      WITH prospect_customers AS (
        SELECT 
          p.id,
          p.customer_name,
          p.country,
          p.sales_rep_group,
          p.division
        FROM fp_prospects p
        WHERE p.status IN ('lead', 'prospect')
          AND p.converted_to_customer = false
      ),
      actual_sales AS (
        SELECT 
          customer_name,
          MIN(year) as first_sale_year,
          SUM(total_value) as total_value,
          SUM(qty_kgs) as total_kgs
        FROM fp_actualcommon
        GROUP BY customer_name
      )
      SELECT 
        pc.id,
        pc.customer_name,
        pc.country,
        pc.sales_rep_group,
        pc.division,
        a.first_sale_year,
        a.total_value,
        a.total_kgs
      FROM prospect_customers pc
      JOIN actual_sales a ON UPPER(TRIM(a.customer_name)) = UPPER(TRIM(pc.customer_name))
    `);
    
    let converted = 0;
    for (const row of convertible.rows) {
      // Update the prospect
      await client.query(`
        UPDATE fp_prospects 
        SET status = 'converted',
            converted_to_customer = true,
            converted_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `, [row.id]);
      
      // Log the conversion (ignore conflicts with existing logs)
      await client.query(`
        INSERT INTO fp_prospect_conversion_log (
          budget_customer_id, actual_customer_id,
          customer_name, converted_from_status, converted_to_status,
          first_actual_sale_date, first_actual_sale_amount, first_actual_sale_kgs,
          conversion_year, sales_rep_name, country, division
        ) VALUES (
          $1, $1,
          $2, 'prospect', 'customer',
          MAKE_DATE($3, 1, 1), $4, $5,
          $3, $6, $7, $8
        )
        ON CONFLICT DO NOTHING
      `, [
        row.id,
        row.customer_name,
        row.first_sale_year,
        row.total_value,
        row.total_kgs,
        row.sales_rep_group,
        row.country,
        row.division
      ]);
      
      converted++;
      console.log(`   ✓ Converted: ${row.customer_name} (first sale: ${row.first_sale_year})`);
    }
    console.log(`   Total conversions: ${converted}`);
    
    // 4. Final summary
    console.log('\n4. Final Prospect Status Summary:');
    const summary = await client.query(`
      SELECT status, converted_to_customer, COUNT(*) as count
      FROM fp_prospects
      GROUP BY status, converted_to_customer
      ORDER BY status
    `);
    summary.rows.forEach(row => {
      console.log(`   ${row.status} (converted=${row.converted_to_customer}): ${row.count}`);
    });
    
    // 5. Check conversion log
    const logCount = await client.query(`SELECT COUNT(*) as cnt FROM fp_prospect_conversion_log`);
    console.log(`\n5. Conversion Log: ${logCount.rows[0].cnt} records`);
    
    await client.query('COMMIT');
    console.log('\n=== INITIALIZATION COMPLETE ===');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

initProspectLifecycle().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
