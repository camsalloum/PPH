/**
 * Run Migration 309: Country and Currency Reference Tables
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'fp_database'
});

async function run() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Running Migration 309: Country & Currency Tables            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  try {
    const sqlPath = path.join(__dirname, '..', 'migrations', '309_country_currency_tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    await pool.query(sql);
    
    // Verify
    console.log('\n✅ Migration 309 completed successfully!\n');
    
    // Show stats
    const currencies = await pool.query('SELECT COUNT(*) FROM currencies');
    const rates = await pool.query('SELECT COUNT(*) FROM exchange_rates');
    const countries = await pool.query('SELECT COUNT(*) FROM master_countries');
    const aliases = await pool.query('SELECT COUNT(*) FROM country_aliases');
    
    console.log('Tables created:');
    console.log(`  - currencies: ${currencies.rows[0].count} records`);
    console.log(`  - exchange_rates: ${rates.rows[0].count} records`);
    console.log(`  - master_countries: ${countries.rows[0].count} records`);
    console.log(`  - country_aliases: ${aliases.rows[0].count} records`);
    
    // Check view enrichment
    const viewCheck = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(country_id) as with_country,
        COUNT(DISTINCT country_region) as regions,
        COUNT(DISTINCT country_currency) as currencies
      FROM vw_unified_sales_complete
    `);
    
    console.log('\nView enrichment:');
    console.log(`  - Total rows: ${viewCheck.rows[0].total}`);
    console.log(`  - With country_id: ${viewCheck.rows[0].with_country}`);
    console.log(`  - Distinct regions: ${viewCheck.rows[0].regions}`);
    console.log(`  - Distinct currencies: ${viewCheck.rows[0].currencies}`);
    
    // Show sample
    const sample = await pool.query(`
      SELECT DISTINCT country, country_region, country_market_type, country_currency 
      FROM vw_unified_sales_complete 
      ORDER BY country 
      LIMIT 10
    `);
    console.log('\nSample country data from view:');
    sample.rows.forEach(r => {
      console.log(`  ${r.country.padEnd(25)} | ${r.country_region.padEnd(15)} | ${r.country_market_type.padEnd(10)} | ${r.country_currency}`);
    });
    
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    if (err.detail) console.error('Detail:', err.detail);
    if (err.hint) console.error('Hint:', err.hint);
    await pool.end();
    process.exit(1);
  }
}

run();
