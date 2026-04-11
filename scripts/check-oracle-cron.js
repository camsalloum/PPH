/**
 * Check Oracle actual sales sync cron status on VPS
 */
const path = require('path');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();

async function run(cmd, label) {
  const r = await ssh.execCommand(cmd);
  console.log(`\n=== ${label} ===`);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr) console.log('STDERR:', r.stderr);
  if (!r.stdout && !r.stderr) console.log('(empty)');
  return r;
}

async function main() {
  await ssh.connect({ host: 'propackhub.com', port: 22, username: 'propackhub', password: '***REDACTED***', readyTimeout: 15000 });
  console.log('Connected to VPS.');

  // 1. Check propackhub user crontab
  await run('crontab -l 2>&1', 'propackhub user crontab');

  // 2. Check root crontab (via sudo if possible)
  await run('sudo crontab -l 2>&1', 'root crontab (sudo)');

  // 3. Check system cron files
  await run('ls -la /etc/cron.d/ 2>&1', '/etc/cron.d/ files');
  await run('cat /etc/crontab 2>&1', '/etc/crontab');

  // 4. Check VPS timezone
  await run('timedatectl 2>/dev/null || date +%Z', 'VPS Timezone');
  await run('date', 'Current VPS time');

  // 5. Check if oracle-sync-cron.sh exists on VPS
  await run('ls -la /home/propackhub/app/scripts/oracle-sync-cron.sh 2>&1', 'oracle-sync-cron.sh exists?');
  await run('ls -la /home/propackhub/app/scripts/cron-rm-sync.sh 2>&1', 'cron-rm-sync.sh exists?');

  // 6. Check oracle sync logs
  await run('tail -50 /home/propackhub/logs/oracle-sync.log 2>/dev/null || echo "No oracle-sync.log found"', 'Last oracle sync log');

  // 7. Check last sync metadata
  await run("PGPASSWORD='***REDACTED***' psql -h localhost -U propackhub_user -d ip_auth_database -c \"SELECT setting_key, setting_value, updated_at FROM company_settings WHERE setting_key IN ('oracle_last_sync','rm_last_sync') ORDER BY setting_key\" 2>&1", 'Last sync metadata');

  // 8. Check if openfortivpn is installed
  await run('which openfortivpn 2>&1', 'openfortivpn installed?');

  // 9. Check cron service status
  await run('systemctl status cron 2>&1 | head -15', 'Cron service status');

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
