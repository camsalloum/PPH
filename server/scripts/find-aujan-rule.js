require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');

async function findAujanRule() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: 'fp_database',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || ''
  });

  try {
    // Find AUJAN in merge rules
    console.log('=== ACTIVE MERGE RULES WITH AUJAN ===');
    const rulesResult = await pool.query(`
      SELECT id, merged_customer_name, original_customers, status, is_active
      FROM fp_division_customer_merge_rules 
      WHERE merged_customer_name ILIKE '%aujan%' 
         OR original_customers::text ILIKE '%aujan%'
    `);
    
    if (rulesResult.rows.length > 0) {
      console.log('Found merge rules:');
      rulesResult.rows.forEach(row => {
        console.log(`  Rule #${row.id}: "${row.merged_customer_name}"`);
        console.log(`    Original customers: ${JSON.stringify(row.original_customers)}`);
        console.log(`    Status: ${row.status}, Active: ${row.is_active}`);
      });
    } else {
      console.log('NO merge rules found for AUJAN');
    }

    // Find AUJAN in pending suggestions
    console.log('\n=== PENDING SUGGESTIONS WITH AUJAN ===');
    const suggestionsResult = await pool.query(`
      SELECT id, suggested_master_name, suggested_customers, status
      FROM fp_ai_merge_suggestions 
      WHERE suggested_master_name ILIKE '%aujan%' 
         OR suggested_customers::text ILIKE '%aujan%'
    `);
    
    if (suggestionsResult.rows.length > 0) {
      console.log('Found suggestions:');
      suggestionsResult.rows.forEach(row => {
        console.log(`  Suggestion #${row.id}: "${row.suggested_master_name}"`);
        console.log(`    Suggested customers: ${JSON.stringify(row.suggested_customers)}`);
        console.log(`    Status: ${row.status}`);
      });
    } else {
      console.log('NO suggestions found for AUJAN');
    }

    // Check customer master
    console.log('\n=== CUSTOMER MASTER WITH AUJAN ===');
    const masterResult = await pool.query(`
      SELECT customer_code, customer_name
      FROM fp_customer_master 
      WHERE customer_name ILIKE '%aujan%'
    `);
    
    if (masterResult.rows.length > 0) {
      masterResult.rows.forEach(row => {
        console.log(`  ${row.customer_code}: "${row.customer_name}"`);
      });
    } else {
      console.log('NO customer master entries for AUJAN');
    }

    // Check aliases
    console.log('\n=== CUSTOMER ALIASES WITH AUJAN ===');
    const aliasResult = await pool.query(`
      SELECT cm.customer_code, cm.customer_name, ca.alias_name
      FROM fp_customer_aliases ca
      JOIN fp_customer_master cm ON cm.id = ca.customer_id
      WHERE ca.alias_name ILIKE '%aujan%'
    `);
    
    if (aliasResult.rows.length > 0) {
      aliasResult.rows.forEach(row => {
        console.log(`  ${row.customer_code}: "${row.customer_name}" - Alias: "${row.alias_name}"`);
      });
    } else {
      console.log('NO aliases found for AUJAN');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

findAujanRule();
