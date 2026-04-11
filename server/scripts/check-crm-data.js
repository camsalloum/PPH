const { Pool } = require('pg');

const fpPool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'fp_database',
  password: process.env.DB_PASSWORD || '',
  port: 5432,
});

async function run() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('      SALES REP GROUPS (from sales_rep_groups table)');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  try {
    const result = await fpPool.query(`
      SELECT g.group_name, g.division, 
             COALESCE(json_agg(m.member_name ORDER BY m.member_name) FILTER (WHERE m.member_name IS NOT NULL), '[]') as members
      FROM sales_rep_groups g
      LEFT JOIN sales_rep_group_members m ON g.id = m.group_id
      WHERE g.division = 'FP'
      GROUP BY g.id, g.group_name, g.division 
      ORDER BY g.group_name
    `);
    
    console.log('Groups in FP division:\n');
    result.rows.forEach((r, i) => {
      console.log((i+1) + '. ' + r.group_name);
      console.log('   Members: ' + JSON.stringify(r.members));
      console.log('');
    });
    
  } catch(e) {
    console.log('Error:', e.message);
    console.log(e.stack);
  }
  
  await fpPool.end();
}

run();
