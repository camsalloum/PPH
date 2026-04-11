const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

(async () => {
  await ssh.connect({
    host: process.env.VPS_HOST || 'propackhub.com',
    port: parseInt(process.env.VPS_SSH_PORT || '22', 10),
    username: process.env.VPS_SSH_USER || 'propackhub',
    password: process.env.VPS_SSH_PASSWORD || '',
    readyTimeout: 15000
  });
  const run = async (cmd, label) => {
    console.log(`\n=== ${label} ===`);
    const r = await ssh.execCommand(cmd);
    console.log(r.stdout || r.stderr || '(empty)');
  };

  // Check RM sync logs - when did it last work?
  await run('tail -80 /home/propackhub/app/logs/rm-sync-cron.log 2>/dev/null || echo "no log file"', 'RM sync cron log (last 80 lines)');

  // Check if the baseline migration dropped/recreated tables
  await run(`PGPASSWORD='${process.env.VPS_DB_PASSWORD || ''}' psql -h localhost -U ${process.env.VPS_DB_USER || 'propackhub_user'} -d fp_database -t -c "SELECT migration_name, applied_at FROM schema_migrations ORDER BY applied_at DESC LIMIT 10" 2>&1`, 'Migration history in fp_database');

  // Check the baseline migration file on VPS - does it DROP fp_actualrmdata?
  await run('grep -i "fp_actualrmdata\\|DROP TABLE\\|drop table" /home/propackhub/app/migrations/sql/20260207_001_all_baseline.up.sql 2>/dev/null | head -20', 'Does baseline mention fp_actualrmdata?');

  // Check if the baseline migration has DROP TABLE statements
  await run('grep -c "DROP TABLE" /home/propackhub/app/migrations/sql/20260207_001_all_baseline.up.sql 2>/dev/null', 'Count of DROP TABLE in baseline');

  // Check what tables the baseline creates
  await run('grep "CREATE TABLE" /home/propackhub/app/migrations/sql/20260207_001_all_baseline.up.sql 2>/dev/null', 'Tables created by baseline');

  // Check current table count
  await run(`PGPASSWORD='${process.env.VPS_DB_PASSWORD || ''}' psql -h localhost -U ${process.env.VPS_DB_USER || 'propackhub_user'} -d fp_database -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>&1`, 'Current table count in fp_database');

  // Check if fp_actualrmdata has data now (after we just created it)
  await run(`PGPASSWORD='${process.env.VPS_DB_PASSWORD || ''}' psql -h localhost -U ${process.env.VPS_DB_USER || 'propackhub_user'} -d fp_database -t -c "SELECT count(*) FROM fp_actualrmdata" 2>&1`, 'Row count in fp_actualrmdata (after recreation)');

  ssh.dispose();
})().catch(e => { console.error(e); process.exit(1); });
