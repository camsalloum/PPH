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

  // Full iptables dump — check for any DROP/REJECT rules
  await run('sudo iptables -L INPUT -n --line-numbers 2>/dev/null | head -40', 'iptables INPUT chain');
  
  // Check if 87.200.65.147 is explicitly blocked anywhere
  await run('sudo iptables-save 2>/dev/null | grep "87.200" || echo "IP not in iptables"', 'Check your IP in iptables');

  // Check /etc/hosts.allow and /etc/hosts.deny
  await run('sudo cat /etc/hosts.deny 2>/dev/null', 'hosts.deny');
  await run('sudo cat /etc/hosts.allow 2>/dev/null', 'hosts.allow');

  // Check cPHulk whitelist to confirm it worked
  await run('sudo whmapi1 read_cphulk_records list_name=white 2>/dev/null | head -30', 'cPHulk whitelist');

  // Check cPanel access log for your IP
  await run('sudo grep "87.200.65.147" /usr/local/cpanel/logs/access_log 2>/dev/null | tail -10 || echo "no access from your IP"', 'cPanel access log');
  await run('sudo grep "87.200.65.147" /usr/local/cpanel/logs/error_log 2>/dev/null | tail -10 || echo "no errors for your IP"', 'cPanel error log');

  // Check if SSL cert is valid for WHM
  await run('sudo curl -sk --max-time 5 https://localhost:2087/login/ -o /dev/null -w "HTTP %{http_code}, size %{size_download}" 2>/dev/null', 'WHM login page test');

  // Check if there's a TCP wrapper or fail2ban
  await run('sudo systemctl status fail2ban 2>/dev/null | head -5 || echo "fail2ban not installed"', 'fail2ban');

  // Check if imunify360 or other security tool is blocking
  await run('sudo imunify360-agent blocked list --ip 87.200.65.147 2>/dev/null || echo "imunify360 not installed"', 'Imunify360');

  // Check if there's a GoDaddy-specific firewall
  await run('sudo cat /etc/csf/csf.deny 2>/dev/null | grep "87.200" || echo "not in CSF deny"', 'CSF deny list');
  await run('sudo cat /etc/apf/deny_hosts.rules 2>/dev/null | grep "87.200" || echo "not in APF deny"', 'APF deny list');

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
