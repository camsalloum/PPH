const {Pool}=require('pg');
const p=new Pool({host:'localhost',port:5432,database:'fp_database',user:'postgres',password:'***REDACTED***'});

async function verify() {
  console.log('🔍 Checking current "Sojy" group name in all tables...\n');
  
  // Check sales_rep_groups
  const groupResult = await p.query(`
    SELECT id, group_name, division
    FROM sales_rep_groups
    WHERE LOWER(group_name) LIKE '%sojy%'
  `);
  
  console.log('=== sales_rep_groups (master table) ===');
  groupResult.rows.forEach(r => {
    console.log(`  ID: ${r.id} | Division: ${r.division} | Name: "${r.group_name}"`);
  });
  
  // Check all data tables
  const tables = [
    'fp_actualcommon',
    'fp_customer_unified',
    'fp_budget_unified',
    'fp_budget_customer_unified',
    'fp_sales_rep_group_budget_allocation'
  ];
  
  for (const table of tables) {
    const result = await p.query(`
      SELECT DISTINCT sales_rep_group_name, sales_rep_group_id, COUNT(*) as count
      FROM ${table}
      WHERE LOWER(sales_rep_group_name) LIKE '%sojy%'
      GROUP BY sales_rep_group_name, sales_rep_group_id
    `);
    
    console.log(`\n=== ${table} ===`);
    if (result.rows.length === 0) {
      console.log('  No Sojy records found');
    } else {
      result.rows.forEach(r => {
        console.log(`  "${r.sales_rep_group_name}" (ID: ${r.sales_rep_group_id}) - ${r.count} records`);
      });
    }
  }
  
  await p.end();
}

verify();
