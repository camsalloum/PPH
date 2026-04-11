/**
 * Check Narek's actual and budget data in database
 */
const { Pool } = require('pg');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  database: 'fp_database',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 5432
});

async function checkNarekData() {
  try {
    console.log('=== CHECKING NAREK DATA ===\n');

    // Check sales rep names containing "Narek"
    console.log('1. SALES REP NAME VARIATIONS:');
    const nameCheck = await pool.query(`
      SELECT DISTINCT TRIM(sales_rep_name) as name
      FROM fp_actualcommon
      WHERE UPPER(sales_rep_name) LIKE '%NAREK%'
    `);
    console.log('   In fp_actualcommon:', nameCheck.rows.map(r => `"${r.name}"`).join(', ') || 'NONE FOUND');

    const nameCheck2 = await pool.query(`
      SELECT DISTINCT TRIM(sales_rep_name) as name, budget_type
      FROM fp_budget_unified
      WHERE UPPER(sales_rep_name) LIKE '%NAREK%'
    `);
    console.log('   In fp_budget_unified:', nameCheck2.rows.map(r => `"${r.name}" (${r.budget_type})`).join(', ') || 'NONE FOUND');

    // Check ACTUAL data for Narek 2025
    console.log('\n2. ACTUAL DATA (fp_actualcommon) for 2025:');
    const actualResult = await pool.query(`
      SELECT
        pgcombine as product_group,
        SUM(qty_kgs) as total_kgs,
        SUM(amount) as total_amount,
        COUNT(*) as row_count
      FROM fp_actualcommon
      WHERE UPPER(TRIM(sales_rep_name)) LIKE '%NAREK%'
        AND year = 2025
      GROUP BY pgcombine
      ORDER BY pgcombine
    `);
    console.log(`   Found ${actualResult.rowCount} product groups:`);
    let totalActualKgs = 0;
    let totalActualAmount = 0;
    actualResult.rows.forEach(r => {
      const kgs = parseFloat(r.total_kgs) || 0;
      const mt = kgs / 1000;
      const amount = parseFloat(r.total_amount) || 0;
      totalActualKgs += kgs;
      totalActualAmount += amount;
      console.log(`   - ${r.product_group}: ${mt.toFixed(2)} MT (${kgs.toFixed(0)} kgs), ${amount.toFixed(0)} AED (${r.row_count} rows)`);
    });
    console.log(`   TOTAL: ${(totalActualKgs/1000).toFixed(2)} MT, ${totalActualAmount.toFixed(0)} AED`);

    // Check BUDGET data for Narek 2026
    console.log('\n3. BUDGET DATA (fp_budget_unified) for 2026:');
    const budgetResult = await pool.query(`
      SELECT
        pgcombine as product_group,
        budget_type,
        SUM(qty_kgs) as total_kgs,
        SUM(amount) as total_amount,
        COUNT(*) as row_count
      FROM fp_budget_unified
      WHERE UPPER(TRIM(sales_rep_name)) LIKE '%NAREK%'
        AND budget_year = 2026
      GROUP BY pgcombine, budget_type
      ORDER BY budget_type, pgcombine
    `);
    console.log(`   Found ${budgetResult.rowCount} entries:`);
    let totalBudgetKgs = 0;
    let totalBudgetAmount = 0;
    budgetResult.rows.forEach(r => {
      const kgs = parseFloat(r.total_kgs) || 0;
      const mt = kgs / 1000;
      const amount = parseFloat(r.total_amount) || 0;
      totalBudgetKgs += kgs;
      totalBudgetAmount += amount;
      console.log(`   - ${r.product_group} [${r.budget_type}]: ${mt.toFixed(2)} MT (${kgs.toFixed(0)} kgs), ${amount.toFixed(0)} AED (${r.row_count} rows)`);
    });
    console.log(`   TOTAL: ${(totalBudgetKgs/1000).toFixed(2)} MT, ${totalBudgetAmount.toFixed(0)} AED`);

    // Check monthly breakdown for actual
    console.log('\n4. MONTHLY ACTUAL BREAKDOWN (2025):');
    const monthlyActual = await pool.query(`
      SELECT
        month_no,
        SUM(qty_kgs)/1000.0 as mt
      FROM fp_actualcommon
      WHERE UPPER(TRIM(sales_rep_name)) LIKE '%NAREK%'
        AND year = 2025
      GROUP BY month_no
      ORDER BY month_no
    `);
    monthlyActual.rows.forEach(r => {
      console.log(`   Month ${r.month_no}: ${parseFloat(r.mt).toFixed(2)} MT`);
    });

    // Check monthly breakdown for budget
    console.log('\n5. MONTHLY BUDGET BREAKDOWN (2026):');
    const monthlyBudget = await pool.query(`
      SELECT
        month_no,
        SUM(qty_kgs)/1000.0 as mt
      FROM fp_budget_unified
      WHERE UPPER(TRIM(sales_rep_name)) LIKE '%NAREK%'
        AND budget_year = 2026
        AND UPPER(budget_type) = 'SALES_REP'
      GROUP BY month_no
      ORDER BY month_no
    `);
    monthlyBudget.rows.forEach(r => {
      console.log(`   Month ${r.month_no}: ${parseFloat(r.mt).toFixed(2)} MT`);
    });

    await pool.end();
    console.log('\n=== DONE ===');
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
  }
}

checkNarekData();
