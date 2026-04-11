const { authPool } = require('../database/config');

(async () => {
  try {
    // 1. Get Sales department designations
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('         SALES DEPARTMENT ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    const designations = await authPool.query(`
      SELECT id, name, department 
      FROM designations 
      WHERE LOWER(department) = 'sales' 
      ORDER BY name
    `);
    
    console.log('1. SALES DEPARTMENT DESIGNATIONS:');
    console.log('─'.repeat(50));
    designations.rows.forEach(d => {
      console.log(`   ID: ${d.id} | ${d.name}`);
    });
    
    // 2. Get users with these designations
    console.log('\n2. USERS IN SALES DEPARTMENT:');
    console.log('─'.repeat(50));
    
    const users = await authPool.query(`
      SELECT u.id, u.name, u.email, e.first_name, e.last_name, d.name as designation
      FROM users u
      JOIN employees e ON e.user_id = u.id
      JOIN designations d ON e.designation_id = d.id
      WHERE LOWER(d.department) = 'sales'
      ORDER BY u.name
    `);
    
    users.rows.forEach(u => {
      console.log(`   ${u.name} | ${u.email} | ${u.designation}`);
    });
    
    // 3. Check current permissions for one sales user
    if (users.rows.length > 0) {
      const sampleUser = users.rows[0];
      console.log(`\n3. CURRENT PERMISSIONS FOR ${sampleUser.name}:`);
      console.log('─'.repeat(50));
      
      const perms = await authPool.query(`
        SELECT permission_key, division_code
        FROM user_permissions
        WHERE user_id = $1 AND allowed = true
        ORDER BY permission_key
      `, [sampleUser.id]);
      
      if (perms.rows.length === 0) {
        console.log('   ⚠️  NO PERMISSIONS SET');
      } else {
        perms.rows.forEach(p => {
          console.log(`   ${p.permission_key} ${p.division_code ? `(${p.division_code})` : '(global)'}`);
        });
      }
    }
    
    // 4. List all permission groups
    console.log('\n4. AVAILABLE PERMISSION GROUPS:');
    console.log('─'.repeat(50));
    
    const groups = await authPool.query(`
      SELECT DISTINCT group_name, COUNT(*) as count
      FROM permissions 
      WHERE is_enabled = true
      GROUP BY group_name
      ORDER BY group_name
    `);
    
    groups.rows.forEach(g => {
      console.log(`   ${g.group_name}: ${g.count} permissions`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await authPool.end();
  }
})();
