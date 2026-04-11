/**
 * Check VPN/Oracle connectivity issue details
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

  // Full oracle sync log (last run)
  await run('tail -40 /home/propackhub/logs/oracle-sync.log 2>/dev/null', 'Full last oracle sync attempt');

  // RM sync log — last few runs
  await run('tail -60 /home/propackhub/app/logs/rm-sync-cron.log 2>/dev/null', 'Last RM sync attempts');

  // Check if VPN is currently up
  await run('pgrep -a openfortivpn 2>/dev/null || echo "openfortivpn NOT running"', 'VPN process');
  await run('ip link show ppp0 2>/dev/null || echo "No ppp0 interface"', 'PPP0 interface');

  // Try to reach Oracle right now
  await run('timeout 5 bash -c "echo > /dev/tcp/PRODDB-SCAN.ITSUPPORT.HG/1521" 2>&1 && echo "Oracle REACHABLE" || echo "Oracle NOT reachable"', 'Oracle reachability NOW');

  // Check DNS resolution for Oracle
  await run('nslookup PRODDB-SCAN.ITSUPPORT.HG 2>&1 || host PRODDB-SCAN.ITSUPPORT.HG 2>&1 || echo "DNS lookup failed"', 'Oracle DNS resolution');

  // Check VPN log from last attempt
  await run('cat /tmp/vpn-cron.log 2>/dev/null || echo "No VPN log"', 'Last VPN connection log');

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
