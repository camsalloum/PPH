/**
 * Quick check for A'Saffa overlap issue
 */
require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');

async function checkAsaffa() {
  const pool = new Pool({
    database: 'fp_database',
    user: 'postgres',
    password: process.env.DB_PASSWORD || ''
  });

  try {
    // Check if A'Saffa is in merge rules
    console.log('=== CHECKING A\'SAFFA IN MERGE RULES ===');
    const rulesResult = await pool.query(`
      SELECT id, merged_customer_name, original_customers, is_active
      FROM fp_division_customer_merge_rules 
      WHERE merged_customer_name ILIKE '%saffa%' 
         OR original_customers::text ILIKE '%saffa%'
    `);
    
    if (rulesResult.rows.length > 0) {
      console.log('Found in merge rules:');
      rulesResult.rows.forEach(row => {
        console.log(`  Rule #${row.id}: "${row.merged_customer_name}" (active: ${row.is_active})`);
        console.log(`    Original: ${JSON.stringify(row.original_customers)}`);
      });
    } else {
      console.log('NOT found in merge rules');
    }

    // Check in pending suggestions
    console.log('\n=== CHECKING A\'SAFFA IN SUGGESTIONS ===');
    const suggestionsResult = await pool.query(`
      SELECT id, suggested_merge_name, customer_group, admin_action
      FROM fp_merge_rule_suggestions 
      WHERE suggested_merge_name ILIKE '%saffa%' 
         OR customer_group::text ILIKE '%saffa%'
    `);
    
    if (suggestionsResult.rows.length > 0) {
      console.log('Found in suggestions:');
      suggestionsResult.rows.forEach(row => {
        console.log(`  Suggestion #${row.id}: "${row.suggested_merge_name}" (status: ${row.admin_action || 'PENDING'})`);
        console.log(`    Customers: ${JSON.stringify(row.customer_group)}`);
      });
    } else {
      console.log('NOT found in suggestions');
    }

    // Test normalization
    console.log('\n=== NORMALIZATION TEST ===');
    const testNames = ["A'Saffa Foods Saog ", "A'SAFFA FOODS SAOG "];
    testNames.forEach(name => {
      const normalized = name.trim().toLowerCase();
      console.log(`  "${name}" → "${normalized}"`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkAsaffa();
