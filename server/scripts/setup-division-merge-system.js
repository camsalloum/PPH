/**
 * Setup Script: Division-Level Customer Merge System
 *
 * This script creates the database tables for the new AI-powered
 * division-level customer merge system.
 *
 * Run: node server/scripts/setup-division-merge-system.js
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../database/config');

async function setupDivisionMergeSystem() {
  console.log('\n========================================');
  console.log('🚀 Division Merge System Setup');
  console.log('========================================\n');

  try {
    // Read the SQL file
    const sqlFilePath = path.join(__dirname, 'create-division-customer-merge-system.sql');
    console.log('📄 Reading SQL file:', sqlFilePath);

    const sqlScript = fs.readFileSync(sqlFilePath, 'utf8');

    // Execute the SQL script
    console.log('⚙️  Executing SQL script...\n');
    await pool.query(sqlScript);

    console.log('\n✅ Database tables created successfully!\n');

    // Verify tables were created
    console.log('🔍 Verifying tables...\n');

    const tables = [
      'division_customer_merge_rules',
      'merge_rule_suggestions',
      'database_upload_log',
      'merge_rule_notifications',
      'customer_similarity_cache'
    ];

    for (const table of tables) {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        );
      `, [table]);

      const exists = result.rows[0].exists;
      const status = exists ? '✅' : '❌';
      console.log(`${status} ${table}`);
    }

    // Show table statistics
    console.log('\n📊 Table Statistics:\n');

    for (const table of tables) {
      const countResult = await pool.query(`SELECT COUNT(*) FROM ${table}`);
      const count = countResult.rows[0].count;
      console.log(`   ${table}: ${count} rows`);
    }

    console.log('\n========================================');
    console.log('✅ Setup completed successfully!');
    console.log('========================================\n');

    console.log('📝 Next steps:');
    console.log('   1. Run migration script to move existing rules');
    console.log('   2. Test the AI matching engine');
    console.log('   3. Build the admin UI\n');

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run setup
setupDivisionMergeSystem();
