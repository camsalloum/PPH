/**
 * Deeper cron check — service name, last run times, timezone math
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
  console.log('Connected.');

  // Check crond (CentOS uses crond, not cron)
  await run('systemctl status crond 2>&1 | head -20', 'crond service status');

  // Check if cron jobs actually ran recently
  await run('grep -i "oracle-sync-cron\\|cron-rm-sync\\|CRON\\|propackhub" /var/log/cron 2>/dev/null | tail -30 || echo "Cannot read /var/log/cron"', 'Cron execution log');
  await run('sudo grep -i "oracle-sync-cron\\|cron-rm-sync\\|propackhub" /var/log/cron 2>/dev/null | tail -30 || echo "Cannot read with sudo either"', 'Cron log (sudo)');

  // Check the oracle sync log for the last few days
  await run('wc -l /home/propackhub/logs/oracle-sync.log 2>/dev/null || echo "no log"', 'Oracle sync log size');
  await run('grep "Starting Oracle sync" /home/propackhub/logs/oracle-sync.log 2>/dev/null | tail -10', 'Oracle sync start times (last 10)');

  // Check RM sync log
  await run('grep "Starting RM sync" /home/propackhub/app/logs/rm-sync-cron.log 2>/dev/null | tail -10', 'RM sync start times (last 10)');

  // The cron is set to 22:00 UTC = 2:00 AM Dubai (UTC+4). Let's verify
  await run('echo "VPS is UTC. Cron at 22:00 UTC = 2:00 AM Dubai (UTC+4)"', 'Timezone math');

  // Check if the oracle sync ran today (Feb 12)
  await run('grep "Feb 12\\|2026-02-12" /home/propackhub/logs/oracle-sync.log 2>/dev/null | tail -10 || echo "No Feb 12 entries"', 'Did oracle sync run today (Feb 12)?');

  // Last modification time of the log
  await run('stat /home/propackhub/logs/oracle-sync.log 2>/dev/null | grep Modify', 'Oracle sync log last modified');

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
