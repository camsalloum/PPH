/**
 * Verification Script: Check migrated rules
 */

const { pool } = require('../database/config');

async function verifyMigration() {
  console.log('\n========================================');
  console.log('🔍 Verification: Division Merge Rules');
  console.log('========================================\n');

  try {
    // Check migrated rules
    const result = await pool.query(`
      SELECT
        id,
        division,
        merged_customer_name,
        original_customers,
        rule_source,
        status,
        created_by,
        validation_status
      FROM division_customer_merge_rules
      ORDER BY division, merged_customer_name
    `);

    console.log(`✅ Found ${result.rows.length} division-level merge rules\n`);

    result.rows.forEach((rule, index) => {
      console.log(`${index + 1}. "${rule.merged_customer_name}" (${rule.division})`);
      console.log(`   Merges ${rule.original_customers.length} customers:`);
      rule.original_customers.forEach(c => console.log(`     - ${c}`));
      console.log(`   Source: ${rule.rule_source}`);
      console.log(`   Status: ${rule.status}`);
      console.log(`   Created by: ${rule.created_by}`);
      console.log(`   Validation: ${rule.validation_status}\n`);
    });

    console.log('========================================\n');

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  } finally {
    await pool.end();
  }
}

verifyMigration();
