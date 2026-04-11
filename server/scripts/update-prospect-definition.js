// Update fp_prospects unique constraint and re-sync
// Prospect = Division + Customer Name + Country + Sales Rep Group
require('dotenv').config({ path: 'server/.env' });
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  database: 'fp_database',
  user: 'postgres',
  password: process.env.DB_PASSWORD,
  port: 5432
});

async function updateProspects() {
  console.log('=== UPDATING PROSPECT DEFINITION ===\n');
  console.log('Prospect = Division + Customer Name + Country + Sales Rep Group\n');
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Check current data and find duplicates that would violate new constraint
    console.log('1. Checking for duplicates under new definition...');
    const dupes = await client.query(`
      SELECT customer_name, division, country, sales_rep_group, COUNT(*) as cnt
      FROM fp_prospects
      GROUP BY customer_name, division, country, sales_rep_group
      HAVING COUNT(*) > 1
    `);
    
    if (dupes.rows.length > 0) {
      console.log(`   Found ${dupes.rows.length} duplicates - cleaning up...`);
      // Keep the one with the earliest created_at, delete others
      await client.query(`
        DELETE FROM fp_prospects p1
        WHERE EXISTS (
          SELECT 1 FROM fp_prospects p2
          WHERE p2.customer_name = p1.customer_name
            AND p2.division = p1.division
            AND p2.country = p1.country
            AND p2.sales_rep_group = p1.sales_rep_group
            AND p2.created_at < p1.created_at
        )
      `);
    } else {
      console.log('   No duplicates found');
    }
    
    // 2. Drop old constraint
    console.log('\n2. Dropping old unique constraint...');
    await client.query(`
      ALTER TABLE fp_prospects 
      DROP CONSTRAINT IF EXISTS fp_prospects_customer_name_division_budget_year_key
    `);
    console.log('   Done');
    
    // 3. Add new constraint
    console.log('\n3. Adding new unique constraint (customer_name, division, country, sales_rep_group)...');
    await client.query(`
      ALTER TABLE fp_prospects 
      ADD CONSTRAINT fp_prospects_unique_customer 
      UNIQUE (customer_name, division, country, sales_rep_group)
    `);
    console.log('   Done');
    
    // 4. Clear and re-sync from budget
    console.log('\n4. Re-syncing prospects from fp_budget_unified...');
    
    // Get unique prospects from budget (by the new definition)
    const budgetProspects = await client.query(`
      SELECT DISTINCT 
        customer_name,
        division_code as division,
        country,
        COALESCE(sales_rep_group_name, sales_rep_name) as sales_rep_group
      FROM fp_budget_unified
      WHERE is_prospect = true
    `);
    
    console.log(`   Found ${budgetProspects.rows.length} unique prospects in budget`);
    
    let synced = 0;
    for (const row of budgetProspects.rows) {
      const result = await client.query(`
        INSERT INTO fp_prospects (
          customer_name, division, country, sales_rep_group,
          status, converted_to_customer,
          source_batch_id, created_at, updated_at
        ) VALUES (
          $1, COALESCE($2, 'FP'), $3, $4,
          'prospect', false,
          'budget-sync-v2', NOW(), NOW()
        )
        ON CONFLICT (customer_name, division, country, sales_rep_group) 
        DO UPDATE SET 
          updated_at = NOW()
        RETURNING id
      `, [
        row.customer_name?.trim() || 'Unknown',
        row.division,
        row.country?.trim() || 'Unknown',
        row.sales_rep_group?.trim() || 'Unknown'
      ]);
      if (result.rows.length > 0) synced++;
    }
    console.log(`   Synced ${synced} prospects`);
    
    // 5. Final count
    console.log('\n5. Final prospect count:');
    const finalCount = await client.query(`SELECT COUNT(*) FROM fp_prospects`);
    console.log(`   Total prospects: ${finalCount.rows[0].count}`);
    
    // Show sample
    console.log('\n6. Sample prospects:');
    const sample = await client.query(`
      SELECT customer_name, division, country, sales_rep_group, status
      FROM fp_prospects
      ORDER BY customer_name
      LIMIT 10
    `);
    sample.rows.forEach(r => {
      console.log(`   ${r.customer_name} | ${r.division} | ${r.country} | ${r.sales_rep_group} | ${r.status}`);
    });
    
    await client.query('COMMIT');
    console.log('\n=== UPDATE COMPLETE ===');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

updateProspects().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
