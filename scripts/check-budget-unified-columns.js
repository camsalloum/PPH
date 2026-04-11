const {Pool}=require('pg');
const pool=new Pool({host:'localhost',port:5432,database:'fp_database',user:'postgres',password:'***REDACTED***'});
pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='fp_budget_unified' AND column_name LIKE '%division%' ORDER BY ordinal_position").then(r=>{console.log(r.rows);pool.end();});
