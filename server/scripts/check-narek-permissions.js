const { authPool } = require('../database/config');

async function checkNarekPermissions() {
  try {
    // Get Narek's permissions - users table uses 'name' column
    const result = await authPool.query(`
      SELECT u.id, u.name, u.email, up.permission_key, up.division_code 
      FROM users u 
      LEFT JOIN user_permissions up ON u.id = up.user_id 
      WHERE LOWER(u.name) LIKE '%narek%'
      ORDER BY up.permission_key
    `);
    
    console.log('');
    console.log('========================================');
    console.log('NAREK PERMISSIONS CHECK');
    console.log('========================================');
    if (result.rows.length > 0) {
      console.log('User:', result.rows[0]?.name);
      console.log('Email:', result.rows[0]?.email);
      console.log('');
      console.log('Permissions:');
      result.rows.forEach(row => {
        if (row.permission_key) {
          console.log('  ✓', row.permission_key, '(' + (row.division_code || 'global') + ')');
        }
      });
    } else {
      console.log('User narek not found');
    }
    
    // Check specifically for Tables permission
    const tablesCheck = await authPool.query(`
      SELECT COUNT(*)::int as count 
      FROM user_permissions up 
      JOIN users u ON up.user_id = u.id 
      WHERE LOWER(u.name) LIKE '%narek%' AND up.permission_key = 'dashboard:sales:tables:view'
    `);
    
    console.log('');
    console.log('========================================');
    const hasTablesPermission = tablesCheck.rows[0].count > 0;
    console.log('Has dashboard:sales:tables:view:', hasTablesPermission ? 'YES' : 'NO');
    console.log('========================================');
    
    if (!hasTablesPermission) {
      console.log('');
      console.log('READY TO TEST: Narek should NOT see the Tables tab');
    }
    
    await authPool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkNarekPermissions();
