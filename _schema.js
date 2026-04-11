const{Pool}=require('pg');
const p=new Pool({host:'localhost',port:5432,database:'fp_database',user:'postgres',password:'Pph654883!'});
p.query("SELECT column_name FROM information_schema.columns WHERE table_name='fp_prospects' ORDER BY ordinal_position")
.then(r=>{r.rows.forEach(c=>console.log(c.column_name));p.end()}).catch(e=>{console.error(e.message);p.end()});
