/**
 * Run AI Learning System Migration
 * Creates all necessary tables for the self-learning AI
 */

const { pool } = require('../database/config');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('🔧 Creating AI Learning System tables...\n');
  
  try {
    const sqlPath = path.join(__dirname, 'create-ai-learning-system.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Split by semicolon and run each statement
    const statements = sql.split(';').filter(s => s.trim().length > 0);
    
    let created = 0;
    let skipped = 0;
    
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (!trimmed || trimmed.startsWith('--')) continue;
      
      try {
        await pool.query(trimmed + ';');
        
        // Log table creation
        if (trimmed.toLowerCase().includes('create table')) {
          const match = trimmed.match(/create table[^(]+\s+(\w+)/i);
          if (match) {
            console.log('✅ Created table:', match[1]);
            created++;
          }
        }
        // Log function creation
        if (trimmed.toLowerCase().includes('create or replace function')) {
          const match = trimmed.match(/function\s+(\w+)/i);
          if (match) {
            console.log('✅ Created function:', match[1]);
          }
        }
      } catch (err) {
        if (err.message.includes('already exists')) {
          skipped++;
        } else if (err.message.includes('duplicate key')) {
          // Ignore duplicate inserts
        } else {
          console.log('⚠️ Warning:', err.message.slice(0, 150));
        }
      }
    }
    
    console.log(`\n✅ Migration complete! Created: ${created}, Skipped (existing): ${skipped}`);
    
    // Verify tables exist
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name LIKE '%ai_%' OR table_name LIKE '%learning%' OR table_name LIKE '%transaction_similarity%')
      ORDER BY table_name
    `);
    
    console.log('\n📋 AI/Learning Tables in database:');
    tables.rows.forEach(r => console.log('  -', r.table_name));
    
    // Check configuration
    const config = await pool.query(`
      SELECT key, value FROM ai_configuration ORDER BY key
    `);
    
    if (config.rows.length > 0) {
      console.log('\n⚙️ AI Configuration:');
      config.rows.forEach(r => console.log(`  - ${r.key}: ${r.value}`));
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

runMigration();
