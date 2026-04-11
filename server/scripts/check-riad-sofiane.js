const { authPool } = require('../database/config');

async function checkRiadSofiane() {
  try {
    // Check employees table
    console.log('=== EMPLOYEES TABLE ===');
    const employees = await authPool.query(`
      SELECT id, first_name, last_name, user_id, sales_rep_name 
      FROM employees 
      WHERE first_name ILIKE '%Riad%' 
         OR first_name ILIKE '%Sofiane%'
         OR sales_rep_name ILIKE '%Riad%'
         OR sales_rep_name ILIKE '%Sofiane%'
      ORDER BY id
    `);
    console.table(employees.rows);
    
    // Check users table
    console.log('\n=== USERS TABLE ===');
    const users = await authPool.query(`
      SELECT id, email, name, role 
      FROM users 
      WHERE name ILIKE '%Riad%' 
         OR name ILIKE '%Sofiane%'
         OR email ILIKE '%riad%'
         OR email ILIKE '%sofiane%'
      ORDER BY id
    `);
    console.table(users.rows);
    
    // Check the link
    console.log('\n=== LINK CHECK ===');
    const linked = await authPool.query(`
      SELECT e.id as emp_id, e.first_name, e.user_id, u.id as user_table_id, u.email
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.first_name ILIKE '%Riad%' OR e.first_name ILIKE '%Sofiane%'
    `);
    console.table(linked.rows);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkRiadSofiane();
