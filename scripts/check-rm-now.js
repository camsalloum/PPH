const path = require('path');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();

async function run(cmd, label) {
  console.log(`\n=== ${label} ===`);
  const r = await ssh.execCommand(cmd);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr) console.log('STDERR:', r.stderr);
  if (!r.stdout && !r.stderr) console.log('(empty)');
  return r;
}

async function main() {
  await ssh.connect({ host: 'propackhub.com', port: 22, username: 'propackhub', password: '***REDACTED***', readyTimeout: 15000 });
  console.log('Connected.');

  // Check progress file — did the sync even start?
  await run('cat /home/propackhub/app/server/rm-sync-progress.json 2>/dev/null', 'RM sync progress file');

  // Check last sync metadata in DB
  await run("PGPASSWORD='***REDACTED***' psql -h localhost -U propackhub_user -d ip_auth_database -t -c \"SELECT setting_value FROM company_settings WHERE setting_key = 'rm_last_sync'\" 2>&1", 'DB last sync metadata');

  // Check pm2 logs for the sync attempt
  await run('sudo /usr/local/lib/npm/bin/pm2 logs propackhub-backend --lines 40 --nostream 2>&1 | grep -i "rm\\|sync\\|vpn\\|oracle\\|error" | tail -30', 'pm2 backend logs (sync related)');

  // Check if VPN is running right now
  await run('pgrep -a openfortivpn 2>/dev/null || echo "VPN not running"', 'VPN status');

  // Check the RM sync route — does it use VPNService?
  await run('tail -30 /home/propackhub/app/logs/rm-sync-cron.log 2>/dev/null', 'Latest RM cron log');

  // Check the backend server log for the sync trigger
  await run('sudo /usr/local/lib/npm/bin/pm2 logs propackhub-backend --lines 80 --nostream 2>&1 | tail -40', 'pm2 last 40 lines');

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
