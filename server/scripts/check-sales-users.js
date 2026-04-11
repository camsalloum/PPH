const { authPool } = require('../database/config');

async function checkSalesUsers() {
  try {
    const result = await authPool.query(`
      SELECT u.id, u.email, u.name, u.role,
             e.first_name, e.last_name, 
             d.name as designation, d.department
      FROM users u
      LEFT JOIN employees e ON e.user_id = u.id
      LEFT JOIN designations d ON e.designation_id = d.id
      WHERE d.department = 'Sales' 
         OR u.role IN ('sales_rep', 'sales_manager')
    `);
    
    console.log('\n=== Sales Department Users ===');
    result.rows.forEach(u => {
      console.log(`  ${u.first_name || 'N/A'} ${u.last_name || 'N/A'} (${u.email}) - ${u.designation || u.role}`);
    });
    
    console.log('\n=== Matching sales rep names in data ===');
    // The sales rep names in database are like "NAREK KOROUKIAN" (uppercase)
    // We need to match user's first_name + last_name to sales rep data
    result.rows.forEach(u => {
      if (u.first_name && u.last_name) {
        const salesRepName = `${u.first_name} ${u.last_name}`.toUpperCase();
        console.log(`  User: ${u.email} => Sales Rep Name: ${salesRepName}`);
      }
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSalesUsers();
