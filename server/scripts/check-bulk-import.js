/**
 * Check bulk import data and pricing
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  database: 'fp_database',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  port: 5432
});

async function check() {
  try {
    // Check bulk import data
    console.log('=== BULK IMPORT DATA FOR NAREK ===');
    const result = await pool.query(`
      SELECT product_group,
             SUM(total_kg) as total_kg,
             SUM(total_amount) as total_amount,
             SUM(total_morm) as total_morm
      FROM fp_budget_bulk_import
      WHERE sales_rep ILIKE '%narek%'
      GROUP BY product_group
      ORDER BY product_group
    `);

    let sumKg = 0, sumAmount = 0, sumMorm = 0;
    result.rows.forEach(r => {
      sumKg += parseFloat(r.total_kg) || 0;
      sumAmount += parseFloat(r.total_amount) || 0;
      sumMorm += parseFloat(r.total_morm) || 0;
      console.log(`  ${r.product_group}: ${r.total_kg} kg, ${r.total_amount} AED, ${r.total_morm} MoRM`);
    });
    console.log(`\nTOTALS: ${sumKg.toFixed(0)} kg, ${sumAmount.toFixed(0)} AED, ${sumMorm.toFixed(0)} MoRM`);
    console.log(`TOTALS (MT): ${(sumKg/1000).toFixed(2)} MT`);

    // Manual calculation check
    console.log('\n=== MANUAL AMOUNT CALCULATION CHECK ===');
    const pricing = await pool.query(`
      SELECT product_group, asp_round, morm_round
      FROM fp_product_group_pricing_rounding
      WHERE year = 2025
      ORDER BY product_group
    `);

    const pricingMap = {};
    pricing.rows.forEach(r => {
      pricingMap[r.product_group.toLowerCase()] = {
        asp: parseFloat(r.asp_round) || 0,
        morm: parseFloat(r.morm_round) || 0
      };
    });

    console.log('\nPricing map:', pricingMap);

    // Recalculate amounts
    console.log('\n=== RECALCULATED AMOUNTS ===');
    let recalcAmount = 0, recalcMorm = 0;
    result.rows.forEach(r => {
      const pg = (r.product_group || '').toLowerCase();
      const price = pricingMap[pg] || { asp: 0, morm: 0 };
      const kg = parseFloat(r.total_kg) || 0;
      const amount = kg * price.asp;
      const morm = kg * price.morm;
      recalcAmount += amount;
      recalcMorm += morm;
      console.log(`  ${r.product_group}: ${kg} kg × ${price.asp}/kg = ${amount.toFixed(0)} AED`);
    });
    console.log(`\nRECALC TOTALS: ${recalcAmount.toFixed(0)} AED, ${recalcMorm.toFixed(0)} MoRM`);

    // What SHOULD it be if KGS are correct
    console.log('\n=== EXPECTED AMOUNTS (HTML shows 20.9M) ===');
    console.log('If HTML Amount = 20.9M and KGS = 2,153,000:');
    console.log('  Average ASP = 20,900,000 / 2,153,000 = ' + (20900000 / 2153000).toFixed(2) + ' AED/kg');
    console.log('Current calculated ASP = ' + (sumAmount / sumKg).toFixed(4) + ' AED/kg');

    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
  }
}

check();
