/**
 * Check Budget Data for Riad & Nidal 2026
 * Diagnose why "No budget" appears in Sales Dashboard KPI Summary
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME_FP,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

async function checkBudgetData() {
  try {
    console.log('\n🔍 Checking Budget Data for Riad & Nidal 2026...\n');
    
    // 1. Check if data exists
    console.log('1️⃣ Checking if budget data exists:');
    const existsQuery = `
      SELECT 
        budget_year,
        budget_type,
        sales_rep_group_name,
        COUNT(*) as row_count,
        SUM(qty_kgs) as total_kgs,
        SUM(amount) as total_amount
      FROM fp_budget_unified
      WHERE UPPER(TRIM(division_code)) = 'FP'
        AND budget_year = 2026
        AND UPPER(budget_type) = 'SALES_REP'
        AND (
          TRIM(UPPER(sales_rep_group_name)) LIKE '%RIAD%'
          OR TRIM(UPPER(sales_rep_group_name)) LIKE '%NIDAL%'
        )
        AND is_budget = true
      GROUP BY budget_year, budget_type, sales_rep_group_name
      ORDER BY sales_rep_group_name;
    `;
    
    const existsResult = await pool.query(existsQuery);
    
    if (existsResult.rows.length === 0) {
      console.log('   ❌ NO BUDGET DATA FOUND for Riad & Nidal 2026');
      console.log('   → This is why "No budget" appears in the dashboard');
      console.log('\n   Possible reasons:');
      console.log('   - Budget not imported yet');
      console.log('   - Wrong sales_rep_group_name (check exact spelling)');
      console.log('   - budget_type is not "SALES_REP"');
      console.log('   - is_budget is false');
    } else {
      console.log('   ✅ Budget data found:');
      existsResult.rows.forEach(row => {
        console.log(`      Group: "${row.sales_rep_group_name}"`);
        console.log(`      Type: ${row.budget_type}`);
        console.log(`      Rows: ${row.row_count}`);
        console.log(`      Total KGS: ${parseFloat(row.total_kgs).toLocaleString()}`);
        console.log(`      Total Amount: ${parseFloat(row.total_amount).toLocaleString()}`);
        console.log('');
      });
    }
    
    // 2. Check monthly breakdown
    console.log('\n2️⃣ Monthly breakdown (if data exists):');
    const monthlyQuery = `
      SELECT 
        month_no,
        COUNT(*) as row_count,
        SUM(qty_kgs) as total_kgs,
        SUM(amount) as total_amount
      FROM fp_budget_unified
      WHERE UPPER(TRIM(division_code)) = 'FP'
        AND budget_year = 2026
        AND UPPER(budget_type) = 'SALES_REP'
        AND TRIM(UPPER(sales_rep_group_name)) = 'RIAD & NIDAL'
        AND is_budget = true
      GROUP BY month_no
      ORDER BY month_no;
    `;
    
    const monthlyResult = await pool.query(monthlyQuery);
    
    if (monthlyResult.rows.length === 0) {
      console.log('   ❌ No monthly data found');
    } else {
      console.log('   Month | Rows | KGS | Amount');
      console.log('   ------|------|-----|-------');
      monthlyResult.rows.forEach(row => {
        const monthName = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][row.month_no - 1] || row.month_no;
        console.log(`   ${monthName.padEnd(5)} | ${String(row.row_count).padEnd(4)} | ${parseFloat(row.total_kgs).toFixed(0).padStart(6)} | ${parseFloat(row.total_amount).toFixed(0).padStart(10)}`);
      });
      
      // Check if full year data exists (all 12 months)
      const hasFullYear = monthlyResult.rows.length === 12;
      console.log(`\n   Full Year Coverage: ${hasFullYear ? '✅ YES (12 months)' : `❌ NO (only ${monthlyResult.rows.length} months)`}`);
    }
    
    // 3. Check exact group name variations
    console.log('\n3️⃣ Checking all group name variations:');
    const namesQuery = `
      SELECT DISTINCT
        sales_rep_group_name,
        COUNT(*) as row_count
      FROM fp_budget_unified
      WHERE UPPER(TRIM(division_code)) = 'FP'
        AND budget_year = 2026
        AND UPPER(budget_type) = 'SALES_REP'
        AND is_budget = true
        AND (
          UPPER(sales_rep_group_name) LIKE '%RIAD%'
          OR UPPER(sales_rep_group_name) LIKE '%NIDAL%'
        )
      GROUP BY sales_rep_group_name
      ORDER BY sales_rep_group_name;
    `;
    
    const namesResult = await pool.query(namesQuery);
    
    if (namesResult.rows.length === 0) {
      console.log('   ❌ No variations found');
    } else {
      console.log('   Found variations:');
      namesResult.rows.forEach(row => {
        console.log(`      "${row.sales_rep_group_name}" (${row.row_count} rows)`);
      });
    }
    
    // 4. Check product groups
    console.log('\n4️⃣ Top 5 Product Groups by KGS:');
    const pgQuery = `
      SELECT 
        pgcombine,
        SUM(qty_kgs) as total_kgs,
        SUM(amount) as total_amount
      FROM fp_budget_unified
      WHERE UPPER(TRIM(division_code)) = 'FP'
        AND budget_year = 2026
        AND UPPER(budget_type) = 'SALES_REP'
        AND TRIM(UPPER(sales_rep_group_name)) = 'RIAD & NIDAL'
        AND is_budget = true
      GROUP BY pgcombine
      ORDER BY total_kgs DESC
      LIMIT 5;
    `;
    
    const pgResult = await pool.query(pgQuery);
    
    if (pgResult.rows.length === 0) {
      console.log('   ❌ No product groups found');
    } else {
      console.log('   Product Group | KGS | Amount');
      console.log('   --------------|-----|-------');
      pgResult.rows.forEach(row => {
        console.log(`   ${(row.pgcombine || 'NULL').padEnd(13)} | ${parseFloat(row.total_kgs).toFixed(0).padStart(6)} | ${parseFloat(row.total_amount).toFixed(0).padStart(10)}`);
      });
    }
    
    // 5. Summary
    console.log('\n📊 SUMMARY:');
    if (existsResult.rows.length === 0) {
      console.log('   ❌ NO BUDGET DATA EXISTS');
      console.log('   → Action: Import budget data for Riad & Nidal 2026');
    } else if (monthlyResult.rows.length < 12) {
      console.log('   ⚠️  PARTIAL DATA (not all 12 months)');
      console.log('   → Action: Import missing months or adjust detection logic');
    } else {
      console.log('   ✅ BUDGET DATA EXISTS');
      console.log('   → Issue may be in column detection logic (SalesRepReport.jsx)');
      console.log('   → Check if full-year budget column is in columnOrder');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkBudgetData();
