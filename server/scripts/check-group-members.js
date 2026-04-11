const { pool } = require('../database/config');

async function checkGroupMembers() {
  try {
    const result = await pool.query(`
      SELECT g.group_name, COUNT(gm.id) as member_count, 
             array_agg(gm.member_name ORDER BY gm.member_name) as members
      FROM sales_rep_groups g
      LEFT JOIN sales_rep_group_members gm ON g.id = gm.group_id
      GROUP BY g.id, g.group_name
      ORDER BY g.group_name
    `);
    
    console.log('=== SALES REP GROUPS (from Master Data) ===\n');
    
    for (const row of result.rows) {
      console.log(`📁 ${row.group_name} (${row.member_count} members)`);
      if (row.members && row.members[0]) {
        row.members.forEach(m => console.log(`   - ${m}`));
      }
      console.log('');
    }
    
    console.log('\n=== ROOT CAUSE ANALYSIS ===');
    console.log('These groups were created in Master Data > Sales Rep Management > Sales Rep Groups');
    console.log('The "Synchronize" button in Admin > Employees copied these groups INTO the employees table!');
    console.log('\nThis mixed up:');
    console.log('  - Sales Rep Groups (for reporting/dashboards) - belongs in Master Data');
    console.log('  - Employees (for HR/organization) - belongs in Admin');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkGroupMembers();
