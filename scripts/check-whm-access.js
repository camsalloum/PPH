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

  // Check if WHM/cPanel ports are listening
  await run('ss -tlnp | grep -E ":2087|:2083|:2082|:2086" 2>/dev/null', 'WHM/cPanel ports listening');

  // Check cpsrvd service
  await run('sudo systemctl status cpsrvd 2>/dev/null | head -15', 'cpsrvd service');

  // Check if cPHulk blocked your IP
  await run('sudo /usr/local/cpanel/bin/cphulkd_status 2>/dev/null || echo "cphulkd status unavailable"', 'cPHulk status');

  // Check cPHulk brute force DB for blocked IPs
  await run('sudo sqlite3 /usr/local/cpanel/logs/cphulkd.sqlite3 "SELECT * FROM brutes ORDER BY ROWID DESC LIMIT 20;" 2>/dev/null || echo "no sqlite3 or no db"', 'cPHulk blocked IPs (brutes)');
  await run('sudo sqlite3 /usr/local/cpanel/logs/cphulkd.sqlite3 "SELECT * FROM logins WHERE logintime > datetime(\'now\', \'-1 hour\') ORDER BY ROWID DESC LIMIT 20;" 2>/dev/null || echo "no data"', 'cPHulk recent logins');

  // Check firewall rules for 2083/2087
  await run('sudo iptables -L -n 2>/dev/null | grep -E "2083|2087|DROP|REJECT" | head -20 || echo "no iptables rules"', 'Firewall rules for WHM/cPanel');

  // Check if firewalld is running and blocking
  await run('sudo firewall-cmd --state 2>/dev/null || echo "firewalld not running"', 'Firewalld state');
  await run('sudo firewall-cmd --list-ports 2>/dev/null || echo "no firewalld"', 'Firewalld open ports');

  // Check CSF firewall (common on cPanel)
  await run('sudo csf -g $(curl -s ifconfig.me 2>/dev/null) 2>/dev/null || echo "CSF not installed or curl failed"', 'CSF check your IP');

  // Get your public IP (from the VPS perspective of recent SSH connections)
  await run('who -a 2>/dev/null | tail -5 || echo "no who data"', 'Recent SSH connections');
  await run('sudo last -5 2>/dev/null', 'Last 5 logins');

  // Check if Nydus agents are running
  await run('sudo systemctl status nydus-ex 2>/dev/null | head -5 || echo "nydus-ex not found"', 'Nydus-ex status');
  await run('ss -tlnp | grep 2224 2>/dev/null || echo "port 2224 not listening"', 'Port 2224 (Nydus)');

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
