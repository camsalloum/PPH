/**
 * Fix Oracle DNS resolution on VPS by adding /etc/hosts entry
 * PRODDB-SCAN.ITSUPPORT.HG → 10.1.2.99 (the working IP)
 */
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

  // Check current /etc/hosts
  await run('cat /etc/hosts', 'Current /etc/hosts');

  // Add Oracle hostname entry (skip if already there)
  const check = await ssh.execCommand('grep "PRODDB-SCAN.ITSUPPORT.HG" /etc/hosts');
  if (check.stdout && check.stdout.includes('PRODDB-SCAN')) {
    console.log('\n⚠ Entry already exists — updating...');
    await ssh.execCommand("sudo sed -i '/PRODDB-SCAN.ITSUPPORT.HG/d' /etc/hosts");
  }

  await ssh.execCommand('echo "10.1.2.99  PRODDB-SCAN.ITSUPPORT.HG" | sudo tee -a /etc/hosts');

  // Verify
  await run('cat /etc/hosts', 'Updated /etc/hosts');
  await run('getent hosts PRODDB-SCAN.ITSUPPORT.HG', 'Verify resolution');

  // Now test: start VPN and check Oracle reachability via hostname
  console.log('\n--- Testing with VPN ---');
  await ssh.execCommand('sudo pkill -f openfortivpn 2>/dev/null; sleep 2');
  await ssh.execCommand(
    'sudo openfortivpn 5.195.104.114:48443 -u camille -p ***REDACTED*** --no-routes --trusted-cert ae1094d5865601d0ecccd1364cc169cefa1d92babac287753f9a1effc3254c66 > /tmp/vpn-test3.log 2>&1 &'
  );

  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const c = await ssh.execCommand('grep "Tunnel is up" /tmp/vpn-test3.log 2>/dev/null');
    if (c.stdout && c.stdout.includes('Tunnel is up')) { console.log('\nVPN UP!'); break; }
  }

  await ssh.execCommand('sudo ip route add 10.0.0.0/8 dev ppp0 2>/dev/null; sudo ip route add 172.16.0.0/12 dev ppp0 2>/dev/null; sudo ip route add 192.168.0.0/16 dev ppp0 2>/dev/null');
  await new Promise(r => setTimeout(r, 3000));

  await run('timeout 10 bash -c "echo > /dev/tcp/PRODDB-SCAN.ITSUPPORT.HG/1521" 2>&1 && echo "✅ Oracle REACHABLE via hostname!" || echo "❌ Still not reachable"', 'Oracle reachability test (hostname)');

  // Cleanup VPN
  await run('sudo pkill -f openfortivpn 2>/dev/null; sudo ip route del 10.0.0.0/8 dev ppp0 2>/dev/null; sudo ip route del 172.16.0.0/12 dev ppp0 2>/dev/null; sudo ip route del 192.168.0.0/16 dev ppp0 2>/dev/null; echo done', 'Cleanup');

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
