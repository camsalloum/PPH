const {Pool}=require('pg');
const pool=new Pool({host:'localhost',port:5432,database:'fp_database',user:'postgres',password:'***REDACTED***'});

async function showStructure() {
  // Get all columns
  const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='fp_budget_unified' ORDER BY ordinal_position");
  
  console.log('fp_budget_unified columns:\n');
  cols.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));
  
  // Get sample data
  console.log('\n\nSample record with NULL group_id:\n');
  const sample = await pool.query("SELECT * FROM fp_budget_unified WHERE sales_rep_group_id IS NULL LIMIT 1");
  console.log(JSON.stringify(sample.rows[0], null, 2));
  
  await pool.end();
}

showStructure();
