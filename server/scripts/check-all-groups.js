const { pool } = require('../database/config');

async function checkAllGroups() {
  try {
    const result = await pool.query(`
      SELECT g.group_name, array_agg(gm.member_name ORDER BY gm.member_name) as members
      FROM sales_rep_groups g
      LEFT JOIN sales_rep_group_members gm ON g.id = gm.group_id
      GROUP BY g.id, g.group_name
      ORDER BY g.group_name
    `);
    
    console.log('=== ALL GROUPS ===\n');
    for (const row of result.rows) {
      console.log(`📁 ${row.group_name}`);
      if (row.members && row.members[0]) {
        row.members.forEach(m => console.log(`   - ${m}`));
      } else {
        console.log('   (no members)');
      }
      console.log('');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAllGroups();
