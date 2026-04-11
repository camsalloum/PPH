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

  // Kill stale VPN from my test
  await run('sudo pkill -f openfortivpn 2>/dev/null; sleep 1; echo "Killed stale VPN"', 'Kill stale VPN');
  await run('pgrep -a openfortivpn 2>/dev/null || echo "No VPN running"', 'Verify VPN killed');

  // Check pm2 process name and logs location
  await run('sudo /usr/local/lib/npm/bin/pm2 list 2>/dev/null || pm2 list 2>/dev/null', 'pm2 list');
  
  // Find pm2 binary
  await run('which pm2 2>/dev/null; ls /usr/local/bin/pm2 2>/dev/null; ls /home/propackhub/.local/bin/pm2 2>/dev/null', 'Find pm2');

  // Check backend logs directly from pm2 log files
  await run('ls -la /root/.pm2/logs/ 2>/dev/null || ls -la /home/propackhub/.pm2/logs/ 2>/dev/null', 'pm2 log files');
  await run('sudo tail -60 /root/.pm2/logs/propackhub-backend-out.log 2>/dev/null | tail -40', 'Backend stdout log (last 40)');
  await run('sudo tail -40 /root/.pm2/logs/propackhub-backend-error.log 2>/dev/null', 'Backend stderr log (last 40)');

  // Check if /etc/hosts entry works from Node.js
  await run('node -e "const dns = require(\'dns\'); dns.lookup(\'PRODDB-SCAN.ITSUPPORT.HG\', (err, addr) => console.log(err ? err.message : addr))"', 'Node.js DNS lookup for Oracle');

  // Check getent
  await run('getent hosts PRODDB-SCAN.ITSUPPORT.HG', 'getent hosts Oracle');

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
