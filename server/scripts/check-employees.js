const { authPool } = require('../database/config');

async function checkEmployees() {
  try {
    // Get all employees
    const result = await authPool.query(`
      SELECT id, first_name, last_name, user_id, group_members, sales_rep_name, designation_id
      FROM employees 
      ORDER BY id
    `);
    
    console.log('=== ALL EMPLOYEES ===\n');
    
    const withAccounts = [];
    const withoutAccounts = [];
    
    for (const row of result.rows) {
      if (row.user_id) {
        withAccounts.push(row);
      } else {
        withoutAccounts.push(row);
      }
    }
    
    console.log('WITH USER ACCOUNTS (Real employees who can login):');
    console.table(withAccounts.map(r => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name || ''}`.trim(),
      user_id: r.user_id,
      designation_id: r.designation_id,
      group_members: r.group_members ? r.group_members.length + ' members' : null
    })));
    
    console.log('\nWITHOUT USER ACCOUNTS (Synced from sales data - NOT real employees):');
    console.table(withoutAccounts.map(r => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name || ''}`.trim(),
      group_members: r.group_members ? r.group_members.length + ' members' : null
    })));
    
    console.log('\n=== ANALYSIS ===');
    console.log(`Total in employees table: ${result.rows.length}`);
    console.log(`Real employees (with user accounts): ${withAccounts.length}`);
    console.log(`Synced sales reps (no user accounts): ${withoutAccounts.length}`);
    
    console.log('\n⚠️  The entries WITHOUT user accounts came from the "Synchronize" button');
    console.log('   in Employees Management. These are sales rep names from uploaded data,');
    console.log('   NOT actual employees. They should probably be removed or moved.');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkEmployees();
