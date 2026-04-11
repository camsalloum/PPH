/**
 * Cleanup Script: Remove duplicate and overlapping AI suggestions
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'fp_database',
  user: 'postgres',
  password: process.env.DB_PASSWORD || ''
});

async function cleanupSuggestions() {
  try {
    console.log('\n========================================');
    console.log('🧹 Cleaning Up AI Suggestions');
    console.log('========================================\n');

    // 1. Get active rules
    const rulesResult = await pool.query(`
      SELECT id, merged_customer_name, original_customers
      FROM division_customer_merge_rules
      WHERE division = 'FP' AND is_active = true
    `);

    const ruleCustomers = new Set();
    rulesResult.rows.forEach(rule => {
      rule.original_customers.forEach(customer => {
        ruleCustomers.add(customer.toLowerCase().trim());
      });
    });

    console.log(`📋 Found ${rulesResult.rows.length} active rules covering ${ruleCustomers.size} customers\n`);

    // 2. Delete suggestions that overlap with active rules
    console.log('🔍 Step 1: Removing suggestions that overlap with active rules...\n');

    const suggestionsResult = await pool.query(`
      SELECT id, suggested_merge_name, customer_group
      FROM merge_rule_suggestions
      WHERE division = 'FP' AND (admin_action = 'PENDING' OR admin_action IS NULL)
    `);

    const idsToDelete = [];
    suggestionsResult.rows.forEach(sugg => {
      const hasOverlap = sugg.customer_group.some(customer =>
        ruleCustomers.has(customer.toLowerCase().trim())
      );

      if (hasOverlap) {
        idsToDelete.push(sugg.id);
        console.log(`   ❌ Will delete: ${sugg.suggested_merge_name} (ID: ${sugg.id})`);
      }
    });

    if (idsToDelete.length > 0) {
      await pool.query(`
        DELETE FROM merge_rule_suggestions
        WHERE id = ANY($1)
      `, [idsToDelete]);
      console.log(`\n   ✅ Deleted ${idsToDelete.length} overlapping suggestions\n`);
    } else {
      console.log(`   ✅ No overlapping suggestions found\n`);
    }

    // 3. Remove duplicate suggestions (keep only the one with lowest ID)
    console.log('🔍 Step 2: Removing duplicate suggestions...\n');

    const allSuggestions = await pool.query(`
      SELECT id, suggested_merge_name, customer_group
      FROM merge_rule_suggestions
      WHERE division = 'FP' AND (admin_action = 'PENDING' OR admin_action IS NULL)
      ORDER BY id
    `);

    const suggestionMap = new Map();
    const duplicateIds = [];

    allSuggestions.rows.forEach(sugg => {
      // Create a unique key based on sorted customers
      const key = sugg.customer_group.sort().join('|').toLowerCase();

      if (suggestionMap.has(key)) {
        // This is a duplicate - mark for deletion
        duplicateIds.push(sugg.id);
        console.log(`   ❌ Duplicate: ${sugg.suggested_merge_name} (ID: ${sugg.id}) - keeping ID: ${suggestionMap.get(key).id}`);
      } else {
        // First occurrence - keep it
        suggestionMap.set(key, sugg);
      }
    });

    if (duplicateIds.length > 0) {
      await pool.query(`
        DELETE FROM merge_rule_suggestions
        WHERE id = ANY($1)
      `, [duplicateIds]);
      console.log(`\n   ✅ Deleted ${duplicateIds.length} duplicate suggestions\n`);
    } else {
      console.log(`   ✅ No duplicate suggestions found\n`);
    }

    // 4. Show final count
    const finalCount = await pool.query(`
      SELECT COUNT(*) as count
      FROM merge_rule_suggestions
      WHERE division = 'FP' AND (admin_action = 'PENDING' OR admin_action IS NULL)
    `);

    console.log('========================================');
    console.log(`✅ Cleanup Complete!`);
    console.log(`   Remaining suggestions: ${finalCount.rows[0].count}`);
    console.log('========================================\n');

    await pool.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

cleanupSuggestions();
