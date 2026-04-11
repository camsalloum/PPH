require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool, authPool } = require('../database/config');

async function check() {
  // Find Riad in auth DB
  const repRes = await authPool.query(`
    SELECT r.employee_id, r.full_name, r.user_id, r.sales_rep_group_id, r.type, r.group_members
    FROM crm_sales_reps r
    WHERE r.full_name ILIKE '%riad%'
    LIMIT 5
  `);
  console.log('Riad rep record:', JSON.stringify(repRes.rows, null, 2));

  if (repRes.rows.length > 0) {
    const rep = repRes.rows[0];
    const groupId = rep.sales_rep_group_id;
    const firstName = rep.full_name.split(' ')[0];
    console.log('\nGroupId:', groupId, '| firstName:', firstName);

    // Check how many customers match by group_id
    const byGroupId = await pool.query(
      `SELECT COUNT(*) FROM fp_customer_unified WHERE sales_rep_group_id = $1 AND is_merged = false`,
      [groupId]
    );
    console.log('Customers matched by sales_rep_group_id:', byGroupId.rows[0].count);

    // Check how many match by ILIKE on primary_sales_rep_name
    const byIlike = await pool.query(
      `SELECT COUNT(*) FROM fp_customer_unified WHERE primary_sales_rep_name ILIKE $1 AND is_merged = false`,
      [`%${firstName}%`]
    );
    console.log('Customers matched by ILIKE firstName:', byIlike.rows[0].count);

    // Check total customers
    const total = await pool.query(`SELECT COUNT(*) FROM fp_customer_unified WHERE is_merged = false`);
    console.log('Total customers:', total.rows[0].count);

    // Sample of sales_rep_group_id values in fp_customer_unified
    const sample = await pool.query(`
      SELECT sales_rep_group_id, sales_rep_group_name, COUNT(*) 
      FROM fp_customer_unified WHERE is_merged = false 
      GROUP BY sales_rep_group_id, sales_rep_group_name 
      ORDER BY COUNT(*) DESC LIMIT 10
    `);
    console.log('\nCustomer distribution by sales_rep_group_id:');
    sample.rows.forEach(r => console.log(`  group_id=${r.sales_rep_group_id} name="${r.sales_rep_group_name}" count=${r.count}`));
  }

  await pool.end();
  await authPool.end();
  process.exit(0);
}
check().catch(e => { console.error(e.message); process.exit(1); });
