const {pool} = require('./database/config');

async function analyze() {
  try {
    console.log('\n=== FP 2025 Budget - FULL BREAKDOWN ===\n');

    // Get all budget data
    const all = await pool.query(`
      SELECT 
        pgcombine,
        COUNT(DISTINCT month) as months,
        ROUND(SUM(qty_kgs)::numeric, 0) as total_kgs,
        ROUND(SUM(amount)::numeric, 0) as total_amt,
        ROUND(SUM(morm)::numeric, 0) as total_morm
      FROM fp_budget_unified
      WHERE admin_division_code = 'FP' AND budget_year = 2025
      GROUP BY pgcombine
      ORDER BY pgcombine
    `);

    console.log('Total records by Product Group:');
    let totalKgs = 0, totalAmt = 0, totalMorm = 0;
    all.rows.forEach(row => {
      totalKgs += parseFloat(row.total_kgs);
      totalAmt += parseFloat(row.total_amt);
      totalMorm += parseFloat(row.total_morm);
      const mt = (parseFloat(row.total_kgs) / 1000).toFixed(2);
      const amtM = (parseFloat(row.total_amt) / 1000000).toFixed(2);
      const mormM = (parseFloat(row.total_morm) / 1000000).toFixed(2);
      console.log(`  ${row.pgcombine.padEnd(35)} ${row.months} months → ${mt.padStart(8)} MT | ${amtM.padStart(8)}M AED | ${mormM.padStart(8)}M MoRM`);
    });

    console.log(`\n  ${'TOTAL (ALL)'.padEnd(35)} → ${(totalKgs / 1000).toFixed(2).padStart(8)} MT | ${(totalAmt / 1000000).toFixed(2).padStart(8)}M AED | ${(totalMorm / 1000000).toFixed(2).padStart(8)}M MoRM`);

    // Get excluded product groups for FP
    console.log('\n=== Product Groups EXCLUDED for FP Division ===\n');
    const excluded = await pool.query(`
      SELECT DISTINCT product_group
      FROM fp_product_group_exclusions
      ORDER BY product_group
    `);
    
    if (excluded.rows.length > 0) {
      excluded.rows.forEach(row => console.log(`  - ${row.product_group}`));
    } else {
      console.log('  None (no exclusions defined)');
    }

    // Get included (non-excluded) budget data
    console.log('\n=== FP 2025 Budget - INCLUDED PRODUCT GROUPS (After Exclusions) ===\n');
    const included = await pool.query(`
      SELECT 
        b.pgcombine,
        COUNT(DISTINCT b.month) as months,
        ROUND(SUM(b.qty_kgs)::numeric, 0) as total_kgs,
        ROUND(SUM(b.amount)::numeric, 0) as total_amt,
        ROUND(SUM(b.morm)::numeric, 0) as total_morm
      FROM fp_budget_unified b
      LEFT JOIN fp_product_group_exclusions e
        ON UPPER(TRIM(b.pgcombine)) = UPPER(TRIM(e.product_group))
      WHERE b.admin_division_code = 'FP' 
        AND b.budget_year = 2025
        AND e.product_group IS NULL
      GROUP BY b.pgcombine
      ORDER BY b.pgcombine
    `);

    console.log('Included records by Product Group:');
    let inclKgs = 0, inclAmt = 0, inclMorm = 0;
    included.rows.forEach(row => {
      inclKgs += parseFloat(row.total_kgs);
      inclAmt += parseFloat(row.total_amt);
      inclMorm += parseFloat(row.total_morm);
      const mt = (parseFloat(row.total_kgs) / 1000).toFixed(2);
      const amtM = (parseFloat(row.total_amt) / 1000000).toFixed(2);
      const mormM = (parseFloat(row.total_morm) / 1000000).toFixed(2);
      console.log(`  ${row.pgcombine.padEnd(35)} ${row.months} months → ${mt.padStart(8)} MT | ${amtM.padStart(8)}M AED | ${mormM.padStart(8)}M MoRM`);
    });

    console.log(`\n  ${'TOTAL (INCLUDED)'.padEnd(35)} → ${(inclKgs / 1000).toFixed(2).padStart(8)} MT | ${(inclAmt / 1000000).toFixed(2).padStart(8)}M AED | ${(inclMorm / 1000000).toFixed(2).padStart(8)}M MoRM`);

    console.log(`\n  ${'DIFFERENCE (Excluded)'.padEnd(35)} → ${((totalKgs - inclKgs) / 1000).toFixed(2).padStart(8)} MT | ${((totalAmt - inclAmt) / 1000000).toFixed(2).padStart(8)}M AED | ${((totalMorm - inclMorm) / 1000000).toFixed(2).padStart(8)}M MoRM`);

    console.log('\n=== COMPARISON TO UI DISPLAY ===');
    console.log(`UI Shows: 3,130.00 MT | 45.89M AED | 17.56M MoRM`);
    console.log(`DB Has:   ${(inclKgs / 1000).toFixed(2)} MT | ${(inclAmt / 1000000).toFixed(2)}M AED | ${(inclMorm / 1000000).toFixed(2)}M MoRM`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit();
  }
}

analyze();
