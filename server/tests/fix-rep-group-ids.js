/**
 * One-time fix: populate sales_rep_group_id on employees table
 * by matching sales_rep_groups.group_name ILIKE '%firstName%'
 * 
 * Run once, then verify with check-riad-rep.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool, authPool } = require('../database/config');

async function fix() {
  // Get all sales reps missing a group ID
  const reps = await authPool.query(`
    SELECT r.employee_id, r.full_name, r.user_id, r.sales_rep_group_id
    FROM crm_sales_reps r
    WHERE r.sales_rep_group_id IS NULL
  `);
  console.log(`Found ${reps.rows.length} reps without sales_rep_group_id`);

  // Get all sales rep groups
  const groups = await pool.query(`SELECT id, group_name FROM sales_rep_groups WHERE division = 'FP' ORDER BY id`);
  console.log('Available groups:', groups.rows.map(g => `${g.id}: ${g.group_name}`));

  for (const rep of reps.rows) {
    const firstName = rep.full_name.split(' ')[0];
    // Find a group whose name contains this rep's first name
    const match = groups.rows.find(g => g.group_name.toLowerCase().includes(firstName.toLowerCase()));
    if (match) {
      await authPool.query(
        `UPDATE employees SET sales_rep_group_id = $1 WHERE id = $2`,
        [match.id, rep.employee_id]
      );
      console.log(`✅ ${rep.full_name} → group_id=${match.id} (${match.group_name})`);
    } else {
      console.log(`⚠️  ${rep.full_name} — no matching group found`);
    }
  }

  // Show all reps after fix
  console.log('\nAll reps after fix:');
  const after = await authPool.query(`SELECT full_name, sales_rep_group_id FROM crm_sales_reps ORDER BY full_name`);
  after.rows.forEach(r => console.log(`  ${r.full_name}: group_id=${r.sales_rep_group_id}`));

  await pool.end();
  await authPool.end();
  process.exit(0);
}
fix().catch(e => { console.error(e.message); process.exit(1); });
