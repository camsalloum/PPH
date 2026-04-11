const path = require('path');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();

async function run(cmd, label) {
  const r = await ssh.execCommand(cmd);
  console.log(`\n=== ${label} ===`);
  console.log(r.stdout || r.stderr || '(empty)');
  return r;
}

async function main() {
  await ssh.connect({ host: 'propackhub.com', port: 22, username: 'propackhub', password: '***REDACTED***', readyTimeout: 15000 });
  console.log('Connected.');

  // Check current PostgreSQL table columns
  await run("PGPASSWORD='***REDACTED***' psql -h localhost -U propackhub_user -d fp_database -c \"SELECT column_name, data_type FROM information_schema.columns WHERE table_name='fp_actualrmdata' ORDER BY ordinal_position\" 2>&1", 'Current fp_actualrmdata columns');

  // Check row count and last sync
  await run("PGPASSWORD='***REDACTED***' psql -h localhost -U propackhub_user -d fp_database -c \"SELECT count(*) as rows, max(synced_at) as last_sync FROM fp_actualrmdata\" 2>&1", 'Row count & last sync');

  // Check last sync log
  await run('tail -30 /home/propackhub/app/logs/rm-sync-cron.log 2>/dev/null || echo "no log"', 'Last RM sync log');

  // Check the sync progress file
  await run('cat /home/propackhub/app/server/rm-sync-progress.json 2>/dev/null || echo "no progress file"', 'Sync progress');

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
