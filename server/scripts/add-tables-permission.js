const { authPool } = require('../database/config');

(async () => {
  try {
    // 1. Add new permission for Tables tab
    console.log('Adding dashboard:sales:tables:view permission...');
    
    const result = await authPool.query(`
      INSERT INTO permissions (key, label, description, group_name, scope, sort_order, is_enabled) 
      VALUES (
        'dashboard:sales:tables:view', 
        'View Sales Tables Tab', 
        'Can view the Tables tab in Sales Rep dashboard (raw data tables)', 
        'Dashboard', 
        'division', 
        5, 
        true
      ) 
      ON CONFLICT (key) DO NOTHING 
      RETURNING *
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Permission added:', result.rows[0].key);
    } else {
      console.log('⚠️ Permission already exists');
    }
    
    // 2. Grant this permission to admin users only (not sales reps)
    console.log('\nGranting to admin users...');
    
    // Get admin users (role = 'admin')
    const admins = await authPool.query(`
      SELECT id, name FROM users WHERE role = 'admin' AND is_active = true
    `);
    
    for (const admin of admins.rows) {
      await authPool.query(`
        INSERT INTO user_permissions (user_id, permission_key, division_code, allowed, granted_by)
        VALUES ($1, 'dashboard:sales:tables:view', 'FP', true, 1)
        ON CONFLICT DO NOTHING
      `, [admin.id]);
      console.log(`   ✓ Granted to ${admin.name}`);
    }
    
    console.log('\n✅ Done! Sales reps will NOT see Tables tab (they don\'t have this permission)');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await authPool.end();
  }
})();
