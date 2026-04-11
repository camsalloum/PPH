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
  const psql = `PGPASSWORD='${dbPass}' psql -h localhost -U ${dbUser} -d ${db}`;

  // 1. Check what migration files exist on VPS
  console.log('=== 1. Migration files on VPS ===');
  const r0 = await ssh.execCommand('ls -la /home/propackhub/app/migrations/sql/*.up.sql 2>&1');
  console.log(r0.stdout || r0.stderr);

  // 2. Check schema_migrations table structure
  console.log('\n=== 2. schema_migrations contents ===');
  const r0b = await ssh.execCommand(`${psql} -t -A -c "SELECT * FROM schema_migrations ORDER BY id"`);
  console.log(r0b.stdout || r0b.stderr);

  // 3. Check if JSON file was renamed on VPS
  console.log('\n=== 3. JSON config file status ===');
  const rj = await ssh.execCommand('ls -la /home/propackhub/app/server/data/sales-reps-config.json* 2>&1');
  console.log(rj.stdout);

  // 4. Now apply the fixes directly
  console.log('\n=== 4. Applying data fixes... ===');

  // Fix "Sojy & Hisham & Direct Sales" → "Sojy & Direct Sales" in fp_customer_unified
  console.log('\n--- Fix fp_customer_unified (2 orphaned records) ---');
  const f1 = await ssh.execCommand(`${psql} -c "
    UPDATE fp_customer_unified 
    SET sales_rep_group_name = 'Sojy & Direct Sales', sales_rep_group_id = 6
    WHERE sales_rep_group_name = 'Sojy & Hisham & Direct Sales'
  "`);
  console.log(f1.stdout || f1.stderr);

  // Fix "Sojy & Hisham & Direct Sales" → "Sojy & Direct Sales" in fp_budget_unified
  console.log('\n--- Fix fp_budget_unified (737 records) ---');
  const f2 = await ssh.execCommand(`${psql} -c "
    UPDATE fp_budget_unified 
    SET sales_rep_group_name = 'Sojy & Direct Sales', sales_rep_group_id = 6
    WHERE sales_rep_group_name = 'Sojy & Hisham & Direct Sales'
  "`);
  console.log(f2.stdout || f2.stderr);

  // Fix "Sojy & Hisham & Direct Sales" → "Sojy & Direct Sales" in fp_sales_rep_group_budget_allocation
  console.log('\n--- Fix fp_sales_rep_group_budget_allocation (132 records) ---');
  const f3 = await ssh.execCommand(`${psql} -c "
    UPDATE fp_sales_rep_group_budget_allocation 
    SET sales_rep_group_name = 'Sojy & Direct Sales', sales_rep_group_id = 6
    WHERE sales_rep_group_name = 'Sojy & Hisham & Direct Sales'
  "`);
  console.log(f3.stdout || f3.stderr);

  // Fix NULL sales_rep_group_id in fp_budget_unified (2784 records)
  console.log('\n--- Fix NULL group_ids in fp_budget_unified ---');
  const f4 = await ssh.execCommand(`${psql} -c "
    UPDATE fp_budget_unified bu
    SET sales_rep_group_id = g.id
    FROM sales_rep_groups g
    WHERE bu.sales_rep_group_id IS NULL
      AND bu.sales_rep_group_name IS NOT NULL
      AND LOWER(TRIM(bu.sales_rep_group_name)) = LOWER(TRIM(g.group_name))
  "`);
  console.log(f4.stdout || f4.stderr);

  // Fix NULL sales_rep_group_id in fp_customer_unified
  console.log('\n--- Fix NULL group_ids in fp_customer_unified ---');
  const f5 = await ssh.execCommand(`${psql} -c "
    UPDATE fp_customer_unified cu
    SET sales_rep_group_id = g.id
    FROM sales_rep_groups g
    WHERE cu.sales_rep_group_id IS NULL
      AND cu.sales_rep_group_name IS NOT NULL
      AND LOWER(TRIM(cu.sales_rep_group_name)) = LOWER(TRIM(g.group_name))
  "`);
  console.log(f5.stdout || f5.stderr);

  // 5. Create the auto-rename trigger
  console.log('\n=== 5. Creating auto-rename trigger ===');
  const triggerSQL = `
    DROP TRIGGER IF EXISTS trg_update_group_name_in_data_tables ON sales_rep_groups CASCADE;
    DROP FUNCTION IF EXISTS fn_update_group_name_in_data_tables() CASCADE;
    
    CREATE OR REPLACE FUNCTION fn_update_group_name_in_data_tables()
    RETURNS TRIGGER AS \\$\\$
    BEGIN
      IF OLD.group_name IS DISTINCT FROM NEW.group_name THEN
        UPDATE fp_actualcommon SET sales_rep_group_name = NEW.group_name WHERE sales_rep_group_id = NEW.id;
        UPDATE fp_customer_unified SET sales_rep_group_name = NEW.group_name WHERE sales_rep_group_id = NEW.id;
        UPDATE fp_budget_unified SET sales_rep_group_name = NEW.group_name WHERE sales_rep_group_id = NEW.id;
        UPDATE fp_budget_customer_unified SET sales_rep_group_name = NEW.group_name WHERE sales_rep_group_id = NEW.id;
        UPDATE fp_sales_rep_group_budget_allocation SET sales_rep_group_name = NEW.group_name WHERE sales_rep_group_id = NEW.id;
      END IF;
      RETURN NEW;
    END;
    \\$\\$ LANGUAGE plpgsql;
    
    CREATE TRIGGER trg_update_group_name_in_data_tables
    AFTER UPDATE ON sales_rep_groups
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_group_name_in_data_tables();
  `;
  const f6 = await ssh.execCommand(`${psql} -c "${triggerSQL}"`);
  console.log(f6.stdout || f6.stderr);

  // 6. Verify results
  console.log('\n=== 6. Verification ===');
  
  console.log('\n--- fp_budget_unified group names ---');
  const v1 = await ssh.execCommand(`${psql} -t -A -c "SELECT sales_rep_group_name, COUNT(*) FROM fp_budget_unified WHERE sales_rep_group_name IS NOT NULL GROUP BY sales_rep_group_name ORDER BY sales_rep_group_name"`);
  console.log(v1.stdout);

  console.log('\n--- fp_customer_unified group names ---');
  const v2 = await ssh.execCommand(`${psql} -t -A -c "SELECT sales_rep_group_name, COUNT(*) FROM fp_customer_unified WHERE sales_rep_group_name IS NOT NULL GROUP BY sales_rep_group_name ORDER BY sales_rep_group_name"`);
  console.log(v2.stdout);

  console.log('\n--- fp_sales_rep_group_budget_allocation group names ---');
  const v3 = await ssh.execCommand(`${psql} -t -A -c "SELECT sales_rep_group_name, COUNT(*) FROM fp_sales_rep_group_budget_allocation WHERE sales_rep_group_name IS NOT NULL GROUP BY sales_rep_group_name ORDER BY sales_rep_group_name"`);
  console.log(v3.stdout);

  console.log('\n--- NULL group_id counts after fix ---');
  const v4 = await ssh.execCommand(`${psql} -t -A -c "
    SELECT 'fp_budget_unified' as tbl, COUNT(*) FROM fp_budget_unified WHERE sales_rep_group_id IS NULL AND sales_rep_group_name IS NOT NULL
    UNION ALL
    SELECT 'fp_customer_unified', COUNT(*) FROM fp_customer_unified WHERE sales_rep_group_id IS NULL AND sales_rep_group_name IS NOT NULL
  "`);
  console.log(v4.stdout);

  console.log('\n--- Trigger exists? ---');
  const v5 = await ssh.execCommand(`${psql} -t -A -c "SELECT tgname FROM pg_trigger WHERE tgname LIKE '%group_name%'"`);
  console.log(v5.stdout || 'NO TRIGGER FOUND');

  ssh.dispose();
  console.log('\n✅ Done!');
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
