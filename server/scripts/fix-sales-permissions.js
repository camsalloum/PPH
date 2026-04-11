const { authPool } = require('../database/config');

async function removeDivisionalAccessFromSales() {
  try {
    // Remove dashboard:divisional:view from all sales department users
    const result = await authPool.query(`
      DELETE FROM user_permissions 
      WHERE permission_key = 'dashboard:divisional:view' 
      AND user_id IN (
        SELECT u.id 
        FROM users u 
        JOIN employees e ON e.user_id = u.id 
        JOIN designations d ON e.designation_id = d.id 
        WHERE LOWER(d.department) = 'sales'
      )
      RETURNING user_id
    `);
    
    console.log('Removed dashboard:divisional:view from', result.rowCount, 'sales users');
    
    // Verify Narek's permissions after removal
    const narekPerms = await authPool.query(`
      SELECT permission_key, division_code 
      FROM user_permissions up
      JOIN users u ON up.user_id = u.id
      WHERE LOWER(u.name) LIKE '%narek%'
      ORDER BY permission_key
    `);
    
    console.log('\nNarek now has these permissions:');
    narekPerms.rows.forEach(r => console.log('  -', r.permission_key, '(' + (r.division_code || 'global') + ')'));
    
    await authPool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

removeDivisionalAccessFromSales();
