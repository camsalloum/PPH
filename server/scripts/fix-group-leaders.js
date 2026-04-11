const { authPool } = require('../database/config');

async function fixGroupLeaders() {
  try {
    console.log('=== Fixing Group Leaders sales_rep_name ===\n');
    
    // Set sales_rep_name for group leaders who have group_members but no sales_rep_name
    const updates = [
      { user_id: 6, sales_rep_name: 'Riad Al Zier' },      // Riad & Nidal group
      { user_id: 5, sales_rep_name: 'Sofiane Salah' },     // Sofiane & Team group
      { user_id: 4, sales_rep_name: 'Sojy Abraham' },      // Sojy & Hisham & Direct Sales group
    ];
    
    for (const update of updates) {
      const result = await authPool.query(
        `UPDATE employees 
         SET sales_rep_name = $1 
         WHERE user_id = $2
         RETURNING id, first_name, last_name, sales_rep_name, group_members`,
        [update.sales_rep_name, update.user_id]
      );
      
      if (result.rows.length > 0) {
        const row = result.rows[0];
        console.log(`✅ Updated user_id ${update.user_id}:`);
        console.log(`   Name: ${row.first_name} ${row.last_name || ''}`);
        console.log(`   sales_rep_name: '${row.sales_rep_name}'`);
        console.log(`   group_members: ${JSON.stringify(row.group_members)}\n`);
      } else {
        console.log(`⚠️  No employee found with user_id ${update.user_id}`);
      }
    }
    
    // Show final state of all users with accounts
    console.log('=== Final State: All Users with Accounts ===\n');
    const allResult = await authPool.query(`
      SELECT e.id, e.user_id, e.first_name, e.last_name, e.sales_rep_name, e.group_members, u.email
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.user_id IS NOT NULL
      ORDER BY e.user_id
    `);
    
    for (const row of allResult.rows) {
      console.log(`User ID ${row.user_id}: ${row.first_name} ${row.last_name || ''} (${row.email})`);
      console.log(`  sales_rep_name: ${row.sales_rep_name || 'NULL'}`);
      console.log(`  group_members: ${row.group_members ? JSON.stringify(row.group_members) : 'NULL'}`);
      console.log('');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixGroupLeaders();
