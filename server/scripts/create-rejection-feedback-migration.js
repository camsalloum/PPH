/**
 * Migration Script: Create Rejection Feedback Table
 *
 * Creates the merge_rule_rejections table for the AI feedback loop.
 * AI will skip pairs that admins have manually rejected.
 *
 * Run: node server/scripts/create-rejection-feedback-migration.js
 */

const { pool } = require('../database/config');
const fs = require('fs');
const path = require('path');

async function createRejectionFeedbackTable() {
  console.log('\n========================================');
  console.log('🔧 Creating Rejection Feedback Table');
  console.log('========================================\n');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if table already exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'merge_rule_rejections'
      );
    `);

    if (tableCheck.rows[0].exists) {
      console.log('ℹ️  Table merge_rule_rejections already exists. Skipping creation.\n');
      await client.query('COMMIT');
      return;
    }

    console.log('📝 Creating merge_rule_rejections table...\n');

    // Read and execute the SQL file
    const sqlFilePath = path.join(__dirname, 'create-rejection-feedback-table.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

    await client.query(sqlContent);

    console.log('✅ Table created successfully!\n');

    // Verify table creation
    const verifyResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'merge_rule_rejections'
      ORDER BY ordinal_position;
    `);

    console.log('📊 Table Schema:');
    verifyResult.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}`);
    });

    await client.query('COMMIT');

    console.log('\n========================================');
    console.log('✅ Migration Complete!');
    console.log('========================================\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
createRejectionFeedbackTable()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
