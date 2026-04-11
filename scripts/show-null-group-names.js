const {Pool}=require('pg');
const p=new Pool({host:'localhost',port:5432,database:'fp_database',user:'postgres',password:'***REDACTED***'});

p.query('SELECT sales_rep_group_name, COUNT(*) as count FROM fp_budget_unified WHERE sales_rep_group_id IS NULL AND sales_rep_group_name IS NOT NULL GROUP BY sales_rep_group_name ORDER BY count DESC').then(r=>{
  console.log('Sales Rep Group Names with NULL group_id in fp_budget_unified:\n');
  r.rows.forEach(x=>console.log(`  "${x.sales_rep_group_name}" - ${x.count} records`));
  p.end();
});
