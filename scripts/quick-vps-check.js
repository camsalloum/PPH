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
  console.log('Connecting to VPS via SSH...');
  await ssh.connect({ host: 'propackhub.com', port: 22, username: 'propackhub', password: '***REDACTED***', readyTimeout: 15000 });
  console.log('✓ SSH connected.');

  // Basic system check
  await run('uptime', 'Uptime');
  await run('free -h', 'Memory');
  await run('df -h / /home', 'Disk');

  // Check if WHM/cPanel ports are listening
  await run('ss -tlnp | grep -E ":2087|:2083|:2086|:2082" || echo "WHM/cPanel ports NOT listening"', 'WHM/cPanel Ports');

  // Check if cpsrvd (cPanel service) is running
  await run('sudo systemctl status cpanel 2>/dev/null || sudo service cpanel status 2>/dev/null || echo "cpanel service not found"', 'cPanel Service');

  // Check firewall
  await run('sudo firewall-cmd --list-all 2>/dev/null || sudo iptables -L -n 2>/dev/null | head -30 || echo "no firewall info"', 'Firewall');

  // pm2 status
  await run('sudo pm2 list 2>/dev/null', 'PM2 Status');

  // Site health
  await run('curl -s --max-time 5 http://localhost:3001/api/health 2>/dev/null || echo "BACKEND DOWN"', 'Backend Health');

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('SSH Error:', e.message); process.exit(1); });
