const path = require('path');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();

async function run(cmd, label) {
  const r = await ssh.execCommand(cmd);
  console.log(`\n=== ${label} ===`);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr && !r.stdout) console.log('STDERR:', r.stderr);
  if (!r.stdout && !r.stderr) console.log('(empty)');
  return r;
}

async function main() {
  await ssh.connect({ host: 'propackhub.com', port: 22, username: 'propackhub', password: '***REDACTED***', readyTimeout: 15000 });
  console.log('Connected.');

  // Check last sync metadata
  await run("PGPASSWORD='***REDACTED***' psql -h localhost -U propackhub_user -d ip_auth_database -t -c \"SELECT setting_value FROM company_settings WHERE setting_key = 'rm_last_sync'\" 2>&1", 'RM last sync metadata');

  // Check progress file
  await run('cat /home/propackhub/app/server/rm-sync-progress.json 2>/dev/null', 'RM sync progress file');

  // Check latest RM sync log
  await run('tail -20 /home/propackhub/app/logs/rm-sync-cron.log 2>/dev/null', 'Latest RM sync log');

  // Current VPS time
  await run('date -u && echo "---" && TZ=Asia/Dubai date', 'VPS time (UTC + Dubai)');

  ssh.dispose();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
