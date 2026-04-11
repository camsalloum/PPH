/**
 * Debug Script: Check why suggestions appear despite existing rules
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'fp_database',
  user: 'postgres',
  password: process.env.DB_PASSWORD || ''
});

async function debugSuggestions() {
  try {
    console.log('\n========================================');
    console.log('🔍 Debugging AI Suggestions');
    console.log('========================================\n');

    // 1. Get active rules
    console.log('📋 Active Rules:\n');
    const rulesResult = await pool.query(`
      SELECT id, merged_customer_name, original_customers
      FROM division_customer_merge_rules
      WHERE division = 'FP' AND is_active = true
      ORDER BY merged_customer_name
    `);

    rulesResult.rows.forEach(rule => {
      console.log(`   ${rule.id}. ${rule.merged_customer_name}`);
      console.log(`      Customers: ${rule.original_customers.join(', ')}`);
    });

    console.log(`\n   Total: ${rulesResult.rows.length} active rules\n`);

    // 2. Get pending suggestions
    console.log('🤖 Pending AI Suggestions:\n');
    const suggestionsResult = await pool.query(`
      SELECT id, suggested_merge_name, customer_group, admin_action
      FROM merge_rule_suggestions
      WHERE division = 'FP' AND (admin_action = 'PENDING' OR admin_action IS NULL)
      ORDER BY suggested_merge_name
    `);

    suggestionsResult.rows.forEach(sugg => {
      console.log(`   ${sugg.id}. ${sugg.suggested_merge_name}`);
      console.log(`      Customers: ${sugg.customer_group.join(', ')}`);
    });

    console.log(`\n   Total: ${suggestionsResult.rows.length} pending suggestions\n`);

    // 3. Find overlaps
    console.log('🔍 Finding Overlaps:\n');

    const ruleCustomers = new Set();
    rulesResult.rows.forEach(rule => {
      rule.original_customers.forEach(customer => {
        ruleCustomers.add(customer.toLowerCase().trim());
      });
    });

    console.log(`   Active rule customers: ${ruleCustomers.size}\n`);

    let overlaps = 0;
    suggestionsResult.rows.forEach(sugg => {
      const hasOverlap = sugg.customer_group.some(customer =>
        ruleCustomers.has(customer.toLowerCase().trim())
      );

      if (hasOverlap) {
        overlaps++;
        console.log(`   ❌ OVERLAP: ${sugg.suggested_merge_name} (ID: ${sugg.id})`);
        console.log(`      Customers: ${sugg.customer_group.join(', ')}`);
      }
    });

    console.log(`\n   Total overlapping suggestions: ${overlaps}\n`);

    // 4. Check for duplicate suggestions
    console.log('🔍 Checking for Duplicate Suggestions:\n');

    const suggestionMap = new Map();
    suggestionsResult.rows.forEach(sugg => {
      const key = sugg.customer_group.sort().join('|').toLowerCase();
      if (!suggestionMap.has(key)) {
        suggestionMap.set(key, []);
      }
      suggestionMap.get(key).push(sugg);
    });

    let duplicates = 0;
    suggestionMap.forEach((suggestions, key) => {
      if (suggestions.length > 1) {
        duplicates++;
        console.log(`   ❌ DUPLICATE GROUP:`);
        suggestions.forEach(s => {
          console.log(`      ID ${s.id}: ${s.suggested_merge_name} (${s.customer_group.join(', ')})`);
        });
        console.log('');
      }
    });

    console.log(`   Total duplicate groups: ${duplicates}\n`);

    await pool.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

debugSuggestions();
