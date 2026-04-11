const { authPool } = require('../database/config');

async function checkNarekData() {
  try {
    const result = await authPool.query(`
      SELECT u.id, u.email, u.name, u.role,
             e.first_name, e.last_name, 
             d.name as designation
      FROM users u
      LEFT JOIN employees e ON e.user_id = u.id
      LEFT JOIN designations d ON e.designation_id = d.id
      WHERE u.email LIKE '%narek%'
    `);
    
    console.log('\n=== Narek\'s User Data ===');
    console.log(JSON.stringify(result.rows, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkNarekData();
