const { pool } = require('./database/config');

async function analyze() {
  try {
    console.log('=== Customer Insights Data Analysis ===\n');
    
    // 1. Check what views/tables exist
    console.log('1. Checking views starting with vw_unified:');
    const views = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name LIKE 'vw_unified%'
    `);
    views.rows.forEach(r => console.log('   - ' + r.table_name));
    if (views.rows.length === 0) console.log('   (none found)');
    
    // 2. Check fp_actualcommon columns for customer data
    console.log('\n2. Customer-related columns in fp_actualcommon:');
    const cols = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'fp_actualcommon'
        AND column_name LIKE '%customer%'
    `);
    cols.rows.forEach(r => console.log('   - ' + r.column_name));
    
    // 3. Check merge rules table
    console.log('\n3. Checking fp_division_customer_merge_rules:');
    const mergeRulesCheck = await pool.query(`
      SELECT COUNT(*) as count FROM fp_division_customer_merge_rules WHERE is_active = true
    `);
    console.log('   Active merge rules: ' + mergeRulesCheck.rows[0].count);
    
    // 4. Test query on fp_actualcommon
    console.log('\n4. Top 10 customers from fp_actualcommon (2025):');
    const customers = await pool.query(`
      SELECT 
        customer_name,
        SUM(amount) as total_sales
      FROM fp_actualcommon
      WHERE year = 2025
        AND customer_name IS NOT NULL
        AND TRIM(customer_name) != ''
      GROUP BY customer_name
      ORDER BY total_sales DESC
      LIMIT 10
    `);
    customers.rows.forEach((r, i) => {
      console.log('   ' + (i+1) + '. ' + r.customer_name + ': AED ' + Number(r.total_sales).toLocaleString());
    });
    
    // 5. Total unique customers
    console.log('\n5. Summary:');
    const totalCustomers = await pool.query(`
      SELECT COUNT(DISTINCT customer_name) as count 
      FROM fp_actualcommon 
      WHERE year = 2025 AND customer_name IS NOT NULL
    `);
    console.log('   Total unique customers in 2025: ' + totalCustomers.rows[0].count);
    
    const totalSales = await pool.query(`
      SELECT SUM(amount) as total 
      FROM fp_actualcommon 
      WHERE year = 2025
    `);
    console.log('   Total sales 2025: AED ' + Number(totalSales.rows[0].total).toLocaleString());
    
    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
  }
}

analyze();
