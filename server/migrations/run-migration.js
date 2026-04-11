/**
 * AI Learning Tables Migration Runner
 * Executes the SQL migration to create all AI learning tables
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load .env from parent server directory
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'fp_database',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 5432
});

async function runMigration() {
  console.log('🚀 Starting AI Learning Tables Migration...\n');
  
  const client = await pool.connect();
  
  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'ai_learning_tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('📄 Executing migration script...\n');
    
    // Execute as a single transaction
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    
    console.log('✅ Migration completed successfully!\n');
    
    // Verify tables were created (only check fp_ tables, division tables are created dynamically)
    const verifyQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND (
          table_name LIKE 'fp_%_behavior_history' OR
          table_name LIKE 'fp_%_clusters' OR
          table_name LIKE 'fp_%_predictions' OR
          table_name LIKE 'fp_learned_%' OR
          table_name LIKE 'fp_customer_%' OR
          table_name LIKE 'fp_product_%' OR
          table_name LIKE 'fp_ai_%' OR
          table_name LIKE 'fp_insight_%' OR
          table_name LIKE 'fp_model_%' OR
          table_name LIKE 'fp_recommendation_%'
        )
      ORDER BY table_name
    `;
    
    const result = await pool.query(verifyQuery);
    
    console.log('📋 Created/Verified Tables:');
    console.log('─'.repeat(50));
    
    result.rows.forEach(row => {
      console.log(`  🔵 ${row.table_name}`);
    });
    
    console.log('─'.repeat(50));
    console.log(`\n📊 Summary: ${result.rows.length} FP tables`);
    console.log('✨ AI Learning Platform database ready!\n');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    
    // Try to get more details
    if (error.position) {
      console.error('Error at position:', error.position);
    }
    if (error.detail) {
      console.error('Detail:', error.detail);
    }
    
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
