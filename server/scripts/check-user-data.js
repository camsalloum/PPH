const { authPool } = require('../database/config');

async function checkUserData() {
  try {
    // Get Narek's user data
    const result = await authPool.query(`
      SELECT u.id, u.name, e.first_name, e.last_name, e.designation_id, d.name as designation 
      FROM users u 
      LEFT JOIN employees e ON e.user_id = u.id 
      LEFT JOIN designations d ON e.designation_id = d.id 
      WHERE LOWER(u.name) LIKE '%narek%'
    `);
    
    console.log('Narek user data:');
    console.log(JSON.stringify(result.rows[0], null, 2));
    
    // Get Sales designations
    const designations = await authPool.query(`
      SELECT id, name FROM designations 
      WHERE LOWER(department) = 'sales' 
      ORDER BY name
    `);
    
    console.log('\nSales designations available:');
    designations.rows.forEach(d => console.log(`  ${d.id}: ${d.name}`));
    
    await authPool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUserData();
