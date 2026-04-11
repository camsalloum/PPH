/**
 * Migration Script: Sales Rep Rules → Division-Level Rules
 *
 * This script migrates existing sales rep-specific customer merge rules
 * to the new division-level system.
 *
 * Strategy:
 * 1. Find all unique merge rules (deduplicate across sales reps)
 * 2. Migrate to division_customer_merge_rules table
 * 3. Keep old table for reference but mark as migrated
 *
 * Run: node server/scripts/migrate-salesrep-to-division-rules.js
 */

const { pool } = require('../database/config');

async function migrateSalesRepToDivisionRules() {
  console.log('\n========================================');
  console.log('🔄 Migrating Sales Rep Rules to Division-Level');
  console.log('========================================\n');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Check if old table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'customer_merge_rules'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('ℹ️  No existing customer_merge_rules table found. Skipping migration.');
      await client.query('COMMIT');
      return;
    }

    // 2. Get all active rules from old table
    console.log('📊 Analyzing existing rules...\n');

    const existingRules = await client.query(`
      SELECT
        sales_rep,
        division,
        merged_customer_name,
        original_customers,
        created_at,
        updated_at
      FROM customer_merge_rules
      WHERE is_active = true
      ORDER BY division, merged_customer_name
    `);

    console.log(`   Found ${existingRules.rows.length} active rules in old table\n`);

    if (existingRules.rows.length === 0) {
      console.log('✅ No rules to migrate.');
      await client.query('COMMIT');
      return;
    }

    // 3. Deduplicate rules (group by division + merged_customer_name + original_customers)
    console.log('🔍 Deduplicating rules across sales reps...\n');

    const uniqueRules = new Map();

    existingRules.rows.forEach(rule => {
      // Create unique key: division + merged_name + sorted customers
      const customersKey = JSON.stringify(
        [...rule.original_customers].sort()
      );
      const key = `${rule.division}::${rule.merged_customer_name}::${customersKey}`;

      if (!uniqueRules.has(key)) {
        uniqueRules.set(key, {
          division: rule.division,
          merged_customer_name: rule.merged_customer_name,
          original_customers: rule.original_customers,
          sales_reps: [rule.sales_rep],
          created_at: rule.created_at
        });
      } else {
        // Add sales rep to list (for audit trail)
        uniqueRules.get(key).sales_reps.push(rule.sales_rep);
      }
    });

    console.log(`   Deduplicated to ${uniqueRules.size} unique rules\n`);

    // Show deduplication summary
    const duplicates = existingRules.rows.length - uniqueRules.size;
    if (duplicates > 0) {
      console.log(`   💡 Found ${duplicates} duplicate rules (same rule across multiple sales reps)\n`);
    }

    // 4. Migrate unique rules to new table
    console.log('📥 Migrating rules to division_customer_merge_rules...\n');

    let migrated = 0;
    let skipped = 0;

    for (const [key, rule] of uniqueRules.entries()) {
      try {
        await client.query(`
          INSERT INTO division_customer_merge_rules (
            division,
            merged_customer_name,
            original_customers,
            rule_source,
            status,
            created_by,
            suggested_by,
            is_active,
            created_at,
            validation_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (division, merged_customer_name) DO NOTHING
        `, [
          rule.division,
          rule.merged_customer_name,
          JSON.stringify(rule.original_customers),
          'MIGRATED_FROM_SALES_REP',
          'ACTIVE',
          `Migrated from: ${rule.sales_reps.join(', ')}`,
          'SYSTEM_MIGRATION',
          true,
          rule.created_at,
          'NOT_VALIDATED'
        ]);

        migrated++;
        console.log(`   ✅ Migrated: "${rule.merged_customer_name}" (${rule.division})`);
        console.log(`      - Original customers: ${rule.original_customers.length}`);
        console.log(`      - Was used by: ${rule.sales_reps.join(', ')}\n`);

      } catch (error) {
        console.log(`   ⚠️  Skipped: "${rule.merged_customer_name}" (${error.message})\n`);
        skipped++;
      }
    }

    // 5. Add migration marker to old table (optional - add column if doesn't exist)
    console.log('📝 Marking old rules as migrated...\n');

    await client.query(`
      ALTER TABLE customer_merge_rules
      ADD COLUMN IF NOT EXISTS migrated_to_division BOOLEAN DEFAULT false
    `);

    await client.query(`
      UPDATE customer_merge_rules
      SET migrated_to_division = true
      WHERE is_active = true
    `);

    // 6. Commit transaction
    await client.query('COMMIT');

    // 7. Summary
    console.log('\n========================================');
    console.log('✅ Migration Completed Successfully!');
    console.log('========================================\n');

    console.log('📊 Migration Summary:\n');
    console.log(`   Total rules in old table:     ${existingRules.rows.length}`);
    console.log(`   Unique rules (deduplicated):  ${uniqueRules.size}`);
    console.log(`   Successfully migrated:        ${migrated}`);
    console.log(`   Skipped (conflicts):          ${skipped}`);
    console.log(`   Duplicates eliminated:        ${duplicates}\n`);

    console.log('📝 Next steps:\n');
    console.log('   1. Verify migrated rules in division_customer_merge_rules table');
    console.log('   2. Run validation to check if rules are still valid');
    console.log('   3. Old table (customer_merge_rules) is kept for reference\n');

    console.log('ℹ️  Note: Old sales rep-specific table is still available for rollback\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    console.error('\n⚠️  Transaction rolled back. No changes made.\n');
    process.exit(1);

  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
migrateSalesRepToDivisionRules();
