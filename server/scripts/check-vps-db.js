const { NodeSSH } = require('node-ssh');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const ssh = new NodeSSH();

async function run() {
  await ssh.connect({
    host: process.env.VPS_HOST || 'propackhub.com',
    port: 22,
    username: process.env.VPS_SSH_USER || 'propackhub',
    password: process.env.VPS_SSH_PASSWORD,
    tryKeyboard: true,
    readyTimeout: 20000
  });

  const dbUser = 'propackhub_user';
  const dbPass = process.env.VPS_DB_PASSWORD || '';
  const db = 'fp_database';
  const psql = `PGPASSWORD='${dbPass}' psql -h localhost -U ${dbUser} -d ${db} -t -A`;

  console.log('=== 1. All sales_rep_groups on VPS ===');
  const r1 = await ssh.execCommand(`${psql} -c "SELECT id, group_name, division, is_active FROM sales_rep_groups ORDER BY id"`);
  console.log(r1.stdout || r1.stderr);

  console.log('\n=== 2. Distinct sales_rep_group_name in fp_actualcommon ===');
  const r2 = await ssh.execCommand(`${psql} -c "SELECT sales_rep_group_name, COUNT(*) FROM fp_actualcommon WHERE sales_rep_group_name IS NOT NULL GROUP BY sales_rep_group_name ORDER BY sales_rep_group_name"`);
  console.log(r2.stdout || r2.stderr);

  console.log('\n=== 3. Distinct sales_rep_group_name in fp_budget_unified ===');
  const r3 = await ssh.execCommand(`${psql} -c "SELECT sales_rep_group_name, COUNT(*) FROM fp_budget_unified WHERE sales_rep_group_name IS NOT NULL GROUP BY sales_rep_group_name ORDER BY sales_rep_group_name"`);
  console.log(r3.stdout || r3.stderr);

  console.log('\n=== 4. Distinct sales_rep_group_name in fp_customer_unified ===');
  const r4 = await ssh.execCommand(`${psql} -c "SELECT sales_rep_group_name, COUNT(*) FROM fp_customer_unified WHERE sales_rep_group_name IS NOT NULL GROUP BY sales_rep_group_name ORDER BY sales_rep_group_name"`);
  console.log(r4.stdout || r4.stderr);

  console.log('\n=== 5. Distinct sales_rep_group_name in fp_sales_rep_group_budget_allocation ===');
  const r5 = await ssh.execCommand(`${psql} -c "SELECT sales_rep_group_name, COUNT(*) FROM fp_sales_rep_group_budget_allocation WHERE sales_rep_group_name IS NOT NULL GROUP BY sales_rep_group_name ORDER BY sales_rep_group_name"`);
  console.log(r5.stdout || r5.stderr);

  console.log('\n=== 6. NULL sales_rep_group_id counts ===');
  const r6 = await ssh.execCommand(`${psql} -c "
    SELECT 'fp_actualcommon' as tbl, COUNT(*) FROM fp_actualcommon WHERE sales_rep_group_id IS NULL AND sales_rep_group_name IS NOT NULL
    UNION ALL
    SELECT 'fp_budget_unified', COUNT(*) FROM fp_budget_unified WHERE sales_rep_group_id IS NULL AND sales_rep_group_name IS NOT NULL
    UNION ALL
    SELECT 'fp_customer_unified', COUNT(*) FROM fp_customer_unified WHERE sales_rep_group_id IS NULL AND sales_rep_group_name IS NOT NULL
  "`);
  console.log(r6.stdout || r6.stderr);

  console.log('\n=== 7. Check schema_migrations ===');
  const r7 = await ssh.execCommand(`${psql} -c "SELECT version, name, applied_at FROM schema_migrations ORDER BY applied_at"`);
  console.log(r7.stdout || r7.stderr);

  console.log('\n=== 8. Check if trigger exists ===');
  const r8 = await ssh.execCommand(`${psql} -c "SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname LIKE '%group_name%'"`);
  console.log(r8.stdout || r8.stderr);

  ssh.dispose();
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
