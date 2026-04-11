/**
 * Run AI Report Tables Migration
 * Creates the necessary tables for the AI-powered comprehensive division report system
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function runMigration() {
  console.log('🚀 Running AI Report Tables Migration...\n');
  
  // Read the migration SQL
  const migrationPath = path.join(__dirname, '..', 'migrations', '020_create_ai_report_tables.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
  
  // Create pool for FP database (which also has HC tables)
  const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: 'fp_database',
    password: process.env.DB_PASSWORD || '',
    port: process.env.DB_PORT || 5432,
  });

  try {
    console.log('📊 Connecting to fp_database...');
    
    // Execute the migration
    await pool.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!\n');
    console.log('Tables created for FP division:');
    console.log('  - fp_ai_report_insights');
    console.log('  - fp_ai_report_feedback');
    console.log('  - fp_ai_report_log');
    console.log('  - fp_ai_recommendations');
    console.log('  - fp_ai_model_performance');
    console.log('\nNote: Tables for other divisions are created automatically');
    console.log('      when new divisions are added via Company Settings.');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.detail) {
      console.error('   Detail:', error.detail);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
