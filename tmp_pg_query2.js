const { pool } = require('./server/database/config.js');

(async () => {
  try {
    const r1 = await pool.query("SELECT id, product_group, description, active FROM crm_product_groups WHERE active=true ORDER BY id;");
    const r2 = await pool.query("SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_name IN ('crm_product_groups','crm_product_group_config') ORDER BY table_name, ordinal_position;");
    const r3 = await pool.query("SELECT product_group_id, config_key, LEFT(config_value,300) AS config_value FROM crm_product_group_config ORDER BY product_group_id, config_key LIMIT 500;");
    console.log(JSON.stringify({ pgs: r1.rows, cols: r2.rows, cfg: r3.rows }, null, 2));
  } catch (e) {
    console.error('ERR:', e.message);
  } finally {
    await pool.end();
  }
})();
