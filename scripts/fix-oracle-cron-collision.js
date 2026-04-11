/**
 * Fix oracle sync cron collision:
 * 1. Upload updated scripts (already done)
 * 2. Change oracle sales cron from "0 22" to "10 22" (2:10 AM Dubai)
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

  // Verify scripts were uploaded
  await run('head -5 /home/propackhub/app/scripts/oracle-sync-cron.sh', 'Oracle script header');
  await run('grep LOCK_FILE /home/propackhub/app/scripts/oracle-sync-cron.sh', 'Oracle script has LOCK_FILE?');
  await run('grep LOCK_FILE /home/propackhub/app/scripts/cron-rm-sync.sh', 'RM script has LOCK_FILE?');

  // Write a temp crontab file, then load it
  const cronContent = [
    '*/30 * * * * /home/propackhub/app/scripts/cron-rm-sync.sh >> /home/propackhub/app/logs/rm-sync-cron.log 2>&1',
    '10 22 * * * /home/propackhub/app/scripts/oracle-sync-cron.sh >> /home/propackhub/logs/oracle-sync.log 2>&1',
    '' // trailing newline required
  ].join('\n');

  // Write crontab content to a temp file, then install it
  await ssh.execCommand(`cat > /tmp/new-crontab << 'CRONTAB_EOF'
*/30 * * * * /home/propackhub/app/scripts/cron-rm-sync.sh >> /home/propackhub/app/logs/rm-sync-cron.log 2>&1
10 22 * * * /home/propackhub/app/scripts/oracle-sync-cron.sh >> /home/propackhub/logs/oracle-sync.log 2>&1
CRONTAB_EOF`);

  await run('cat /tmp/new-crontab', 'New crontab file');
  await run('crontab /tmp/new-crontab', 'Installing crontab');
  await run('crontab -l', 'Verify crontab');

  // Clean up stale lock and VPN
  await run('rm -f /tmp/oracle-vpn.lock', 'Clean stale lock');
  await run('sudo pkill -f openfortivpn 2>/dev/null; echo done', 'Kill stuck VPN');

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
