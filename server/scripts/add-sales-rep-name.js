const { authPool } = require('../database/config');

async function addSalesRepNameColumn() {
  try {
    // Add sales_rep_name column to employees table
    await authPool.query(`
      ALTER TABLE employees 
      ADD COLUMN IF NOT EXISTS sales_rep_name VARCHAR(255)
    `);
    console.log('✅ Added sales_rep_name column to employees table');
    
    // Update Narek's sales_rep_name - he is "NAREK KOROUKIAN" in the sales data
    await authPool.query(`
      UPDATE employees 
      SET sales_rep_name = 'NAREK KOROUKIAN'
      WHERE user_id = 8
    `);
    console.log('✅ Set Narek\'s sales_rep_name to NAREK KOROUKIAN');
    
    // Show updated employees with user accounts
    const result = await authPool.query(`
      SELECT e.id, e.user_id, e.first_name, e.last_name, e.sales_rep_name, u.email
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.user_id IS NOT NULL
      ORDER BY e.id
    `);
    
    console.log('\n=== Employees with User Accounts ===');
    console.table(result.rows);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

addSalesRepNameColumn();
