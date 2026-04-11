 require('dotenv').config();
const { pool } = require('./database/config');

async function fix() {
  try {
    // Delete Wrap Around Label from pricing table - it doesn't exist in actual data
    const result = await pool.query(`
      DELETE FROM fp_product_group_pricing_rounding 
      WHERE product_group = 'Wrap Around Label'
      RETURNING id, year, division, product_group
    `);
    
    console.log('=== Deleted', result.rowCount, 'invalid "Wrap Around Label" records from pricing table ===');
    result.rows.forEach(x => console.log('  Deleted: Year', x.year, '| Division:', x.division));
    
    // Verify remaining product groups match actualcommon
    console.log('\n=== Remaining 2025 Pricing Product Groups ===');
    const pricing = await pool.query(`
      SELECT DISTINCT product_group 
      FROM fp_product_group_pricing_rounding 
      WHERE year = 2025 AND UPPER(division) = 'FP' 
      ORDER BY product_group
    `);
    pricing.rows.forEach(x => console.log('  -', x.product_group));
    console.log('Total:', pricing.rows.length);
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    process.exit(0);
  }
}

fix();
