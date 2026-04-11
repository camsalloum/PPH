const pool = require('../server/database/config');

async function checkBudget2026() {
  try {
    console.log('Checking for Budget 2026 in P&L database...\n');
    
    // Check for 2026 Budget data
    const query = `
      SELECT 
        year,
        data_type,
        COUNT(*) as record_count,
        COUNT(DISTINCT month) as months_count
      FROM fp_pl_data 
      WHERE year = 2026 AND data_type = 'Budget'
      GROUP BY year, data_type
    `;
    
    const result = await pool.query(query);
    
    if (result.rows.length > 0) {
      console.log('✅ Budget 2026 data found:');
      console.log(JSON.stringify(result.rows, null, 2));
      
      // Get sample records with key P&L metrics
      const sampleQuery = `
        SELECT 
          month, 
          sales, 
          sales_volume_kg,
          material,
          gross_profit,
          net_profit
        FROM fp_pl_data
        WHERE year = 2026 AND data_type = 'Budget'
        ORDER BY 
          CASE month
            WHEN 'January' THEN 1
            WHEN 'February' THEN 2
            WHEN 'March' THEN 3
            WHEN 'April' THEN 4
            WHEN 'May' THEN 5
            WHEN 'June' THEN 6
            WHEN 'July' THEN 7
            WHEN 'August' THEN 8
            WHEN 'September' THEN 9
            WHEN 'October' THEN 10
            WHEN 'November' THEN 11
            WHEN 'December' THEN 12
          END
        LIMIT 12
      `;
      const sampleResult = await pool.query(sampleQuery);
      console.log('\n📊 Budget 2026 Monthly Data:');
      console.log(JSON.stringify(sampleResult.rows, null, 2));
      
      // Calculate totals
      const totals = sampleResult.rows.reduce((acc, row) => ({
        sales: acc.sales + parseFloat(row.sales || 0),
        volume: acc.volume + parseFloat(row.sales_volume_kg || 0),
        material: acc.material + parseFloat(row.material || 0),
        gross_profit: acc.gross_profit + parseFloat(row.gross_profit || 0),
        net_profit: acc.net_profit + parseFloat(row.net_profit || 0)
      }), { sales: 0, volume: 0, material: 0, gross_profit: 0, net_profit: 0 });
      
      console.log('\n💰 Budget 2026 Year Totals:');
      console.log(`  Sales: ${totals.sales.toLocaleString()}`);
      console.log(`  Volume (kg): ${totals.volume.toLocaleString()}`);
      console.log(`  Material: ${totals.material.toLocaleString()}`);
      console.log(`  Gross Profit: ${totals.gross_profit.toLocaleString()}`);
      console.log(`  Net Profit: ${totals.net_profit.toLocaleString()}`);
    } else {
      console.log('❌ No Budget 2026 data found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkBudget2026();
