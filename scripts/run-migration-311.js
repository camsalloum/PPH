require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PASSWORD,
  database: 'fp_database'
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  MIGRATION 311: Auto-Sync Unified Tables                     ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const sqlPath = path.join(__dirname, '..', 'migrations', '311_auto_sync_unified.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await client.query('BEGIN');
    
    // Execute the SQL
    await client.query(sql);
    
    await client.query('COMMIT');
    
    console.log('✅ Migration 311 complete!\n');

    // Verify triggers exist
    console.log('=== VERIFICATION ===\n');
    const triggers = await client.query(`
      SELECT trigger_name, event_manipulation 
      FROM information_schema.triggers 
      WHERE event_object_table = 'fp_data_excel'
      ORDER BY trigger_name
    `);
    console.log('Triggers on fp_data_excel:');
    triggers.rows.forEach(t => console.log(`  ✅ ${t.trigger_name} (${t.event_manipulation})`));

    // Verify functions exist
    const funcs = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_name IN ('sync_unified_on_data_change', 'refresh_unified_stats')
    `);
    console.log('\nFunctions created:');
    funcs.rows.forEach(f => console.log(`  ✅ ${f.routine_name}()`));

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('HOW IT WORKS NOW:');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('1. When new data is INSERTED into fp_data_excel:');
    console.log('   → New customers auto-added to fp_customer_unified');
    console.log('   → New sales reps auto-added to fp_sales_rep_unified');
    console.log('   → New product groups auto-added to fp_product_group_unified');
    console.log('\n2. After bulk upload, call refresh_unified_stats() to:');
    console.log('   → Update totals (amount, kgs, morm) for all records');
    console.log('   → Refresh materialized views');
    console.log('\nExample: SELECT * FROM refresh_unified_stats();');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
