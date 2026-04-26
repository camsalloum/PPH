const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('--- 1) Querying mes_non_resin_material_specs ---');
    const q1 = await client.query("SELECT material_key, updated_at, status FROM mes_non_resin_material_specs WHERE material_class='substrates' ORDER BY updated_at DESC NULLS LAST LIMIT 10;");
    console.table(q1.rows);

    console.log('\n--- 2) Querying mes_spec_substrates ---');
    const q2 = await client.query("SELECT material_key, updated_at, status FROM mes_spec_substrates ORDER BY updated_at DESC NULLS LAST LIMIT 10;");
    console.table(q2.rows);

    console.log('\n--- 3) Comparing specific material keys ---');
    const keys = ['bxxotpst361000', 'fxxalucf071050'];
    const q3_rows = [];
    
    for (const key of keys) {
      const res1 = await client.query("SELECT 'legacy' as source, material_key, status, updated_at, (SELECT count(k) FROM jsonb_object_keys(parameters_json) k) as param_count FROM mes_non_resin_material_specs WHERE material_key = $1", [key]);
      const res2 = await client.query("SELECT 'new' as source, material_key, status, updated_at, (SELECT count(k) FROM jsonb_object_keys(parameters_json) k) as param_count FROM mes_spec_substrates WHERE material_key = $1", [key]);
      
      if (res1.rows.length > 0) q3_rows.push(res1.rows[0]);
      if (res2.rows.length > 0) q3_rows.push(res2.rows[0]);
    }
    console.table(q3_rows);

  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
