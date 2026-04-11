const { pool } = require('../database/config');

async function checkSojyGroup() {
  try {
    // Check the group that contains "Sojy Jose Ukken"
    const result = await pool.query(`
      SELECT g.group_name, array_agg(gm.member_name ORDER BY gm.member_name) as members
      FROM sales_rep_groups g
      JOIN sales_rep_group_members gm ON g.id = gm.group_id
      WHERE gm.member_name ILIKE '%Sojy%'
      GROUP BY g.id, g.group_name
    `);
    
    console.log('Group containing "Sojy":');
    console.table(result.rows);
    
    if (result.rows.length > 0) {
      console.log('\nGroup name:', result.rows[0].group_name);
      console.log('Members:', result.rows[0].members);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSojyGroup();
