const { Pool } = require('pg');
const dbConfig = {
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'fp_database',
  password: process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DB_PORT) || 5432
};
const pool = new Pool(dbConfig);

async function run() {
    try {
        const query1 = 'SELECT id, product_group, description, active FROM crm_product_groups WHERE active=true ORDER BY id;';
        const query2 = "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_name IN ('crm_product_groups','crm_product_group_config') ORDER BY table_name, ordinal_position;";
        
        const res1 = await pool.query(query1);
        const res2 = await pool.query(query2);
        
        console.log(JSON.stringify({
            productGroups: res1.rows,
            columns: res2.rows
        }, null, 2));
    } catch (err) {
        console.error('ERROR_START');
        console.error(err.message);
        console.error('ERROR_END');
    } finally {
        await pool.end();
    }
}

run();
