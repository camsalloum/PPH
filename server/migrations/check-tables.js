const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'fp_database',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 5432
});

async function checkTables() {
  try {
    // Check existing AI-related tables
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND (table_name LIKE '%learned%' 
             OR table_name LIKE '%threshold%' 
             OR table_name LIKE '%recommendation%'
             OR table_name LIKE '%behavior%'
             OR table_name LIKE '%cluster%'
             OR table_name LIKE '%churn%'
             OR table_name LIKE '%segment%'
             OR table_name LIKE '%lifecycle%')
      ORDER BY table_name
    `);
    
    console.log('Existing AI-related tables:');
    result.rows.forEach(r => console.log('  -', r.table_name));
    
    // Check if fp_ai_recommendations has is_active
    const colCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'fp_ai_recommendations'
    `);
    
    console.log('\nfp_ai_recommendations columns:');
    colCheck.rows.forEach(r => console.log('  -', r.column_name));
    
    // Check row count
    const countCheck = await pool.query('SELECT COUNT(*) FROM fp_ai_recommendations');
    console.log('\nfp_ai_recommendations row count:', countCheck.rows[0].count);
    
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
  }
}

checkTables();
