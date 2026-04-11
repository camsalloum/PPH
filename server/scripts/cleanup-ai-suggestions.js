/**
 * Cleanup duplicate/overlapping AI suggestions
 * 
 * This script removes pending suggestions that overlap with already-active merge rules.
 * Should be run once after fixing the AI overlap bug.
 */

require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');

async function cleanupOverlappingSuggestions() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: 'fp_database',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || ''
  });

  try {
    console.log('=== CLEANUP OVERLAPPING SUGGESTIONS ===\n');

    // 1. Get all active merge rules
    console.log('Loading active merge rules...');
    const rulesResult = await pool.query(`
      SELECT id, merged_customer_name, original_customers 
      FROM fp_division_customer_merge_rules 
      WHERE is_active = true AND status = 'ACTIVE'
    `);
    
    // Build a normalized set of all customers in active rules
    const existingRuleCustomers = new Set();
    rulesResult.rows.forEach(rule => {
      // Add merged name
      if (rule.merged_customer_name) {
        existingRuleCustomers.add(rule.merged_customer_name.trim().toLowerCase());
      }
      // Add all original customers
      if (rule.original_customers && Array.isArray(rule.original_customers)) {
        rule.original_customers.forEach(customer => {
          existingRuleCustomers.add(customer.trim().toLowerCase());
        });
      }
    });
    
    console.log(`Found ${rulesResult.rows.length} active rules covering ${existingRuleCustomers.size} customers\n`);

    // 2. Get all pending suggestions
    console.log('Loading pending suggestions...');
    const suggestionsResult = await pool.query(`
      SELECT id, suggested_merge_name, customer_group 
      FROM fp_merge_rule_suggestions 
      WHERE admin_action IS NULL OR admin_action = 'PENDING'
    `);
    
    console.log(`Found ${suggestionsResult.rows.length} pending suggestions\n`);

    // 3. Find overlapping suggestions
    const overlappingSuggestions = [];
    
    for (const suggestion of suggestionsResult.rows) {
      const customerGroup = Array.isArray(suggestion.customer_group) 
        ? suggestion.customer_group 
        : JSON.parse(suggestion.customer_group || '[]');
      
      // Check if ANY customer in this suggestion already exists in active rules
      const overlappingCustomers = customerGroup.filter(customer => 
        existingRuleCustomers.has(customer.trim().toLowerCase())
      );
      
      if (overlappingCustomers.length > 0) {
        overlappingSuggestions.push({
          id: suggestion.id,
          name: suggestion.suggested_merge_name,
          customers: customerGroup,
          overlapping: overlappingCustomers
        });
      }
    }

    console.log(`Found ${overlappingSuggestions.length} overlapping suggestions to clean up:\n`);

    // 4. Show what will be deleted
    for (const s of overlappingSuggestions) {
      console.log(`  #${s.id}: "${s.name}"`);
      console.log(`    Customers: ${JSON.stringify(s.customers)}`);
      console.log(`    Overlaps with: ${JSON.stringify(s.overlapping)}\n`);
    }

    // 5. Delete overlapping suggestions
    if (overlappingSuggestions.length > 0) {
      const idsToDelete = overlappingSuggestions.map(s => s.id);
      
      console.log(`\nDeleting ${idsToDelete.length} overlapping suggestions...`);
      
      await pool.query(`
        DELETE FROM fp_merge_rule_suggestions 
        WHERE id = ANY($1)
      `, [idsToDelete]);
      
      console.log('✅ Cleanup complete!');
    } else {
      console.log('✅ No overlapping suggestions found - nothing to clean up');
    }

    // 6. Show remaining suggestions count
    const remainingResult = await pool.query(`
      SELECT COUNT(*) as count FROM fp_merge_rule_suggestions 
      WHERE admin_action IS NULL OR admin_action = 'PENDING'
    `);
    
    console.log(`\nRemaining pending suggestions: ${remainingResult.rows[0].count}`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

cleanupOverlappingSuggestions();
