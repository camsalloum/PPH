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

  // 1. Find your current public IP
  await run('echo "Your SSH is coming from:" && who -m 2>/dev/null || echo "unknown"', 'Your IP');

  // 2. Check cPHulk blocked list
  await run('sudo /usr/local/cpanel/scripts/cphulkdblacklist list 2>/dev/null || echo "command not available"', 'cPHulk blacklist');
  
  // 3. Try to flush cPHulk (unblock all IPs)
  await run('sudo /usr/local/cpanel/scripts/cphulkd_flush 2>/dev/null || echo "flush not available"', 'Flush cPHulk');

  // 4. Try alternative: restart cPHulk service
  await run('sudo /usr/local/cpanel/etc/init/stopcphulkd 2>/dev/null; sleep 1; sudo /usr/local/cpanel/etc/init/startcphulkd 2>/dev/null; echo "cPHulk restarted"', 'Restart cPHulk');

  // 5. Check if cPHulk is even enabled
  await run('sudo grep -i "cphulk" /var/cpanel/cpanel.config 2>/dev/null | head -5 || echo "no cphulk config found"', 'cPHulk config');

  // 6. Try to whitelist your IP (87.200.65.147 from last login)
  await run('sudo /usr/local/cpanel/scripts/cphulkdwhitelist add 87.200.65.147 2>/dev/null || echo "whitelist command not available"', 'Whitelist your IP');

  // 7. Check if there's a hosts.deny blocking
  await run('sudo cat /etc/hosts.deny 2>/dev/null | grep -v "^#" | head -10 || echo "no hosts.deny"', 'hosts.deny');

  // 8. Restart cpsrvd (the cPanel/WHM web service)
  await run('sudo /usr/local/cpanel/scripts/restartsrv_cpsrvd 2>/dev/null || echo "restart failed"', 'Restart cpsrvd');

  // 9. Verify ports are still up after restart
  await run('ss -tlnp | grep -E ":2087|:2083" 2>/dev/null', 'Ports after restart');

  // 10. Test local access to WHM from the VPS itself
  await run('curl -sk --max-time 5 -o /dev/null -w "%{http_code}" https://localhost:2087/ 2>/dev/null || echo "failed"', 'WHM local access test');

  ssh.dispose();
  console.log('\nDone. Try accessing WHM again from your browser.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
