/**
 * Test VPN + Oracle connectivity on VPS via SSH
 */
const path = require('path');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();

async function main() {
  console.log('Connecting to VPS via SSH...');
  await ssh.connect({
    host: 'propackhub.com',
    port: 22,
    username: 'propackhub',
    password: '***REDACTED***',
    readyTimeout: 10000
  });
  console.log('SSH connected.\n');

  // Kill any existing VPN
  console.log('Killing any existing openfortivpn...');
  await ssh.execCommand('sudo pkill -f openfortivpn 2>/dev/null');
  await new Promise(r => setTimeout(r, 2000));

  // Write a start script on the VPS
  console.log('Writing VPN start script on VPS...');
  await ssh.execCommand(`cat > /tmp/start-vpn.sh << 'EOF'
#!/bin/bash
sudo openfortivpn 5.195.104.114:48443 -u camille -p ***REDACTED*** --no-routes --trusted-cert ae1094d5865601d0ecccd1364cc169cefa1d92babac287753f9a1effc3254c66 > /tmp/vpn.log 2>&1 &
echo $!
EOF`);
  await ssh.execCommand('chmod +x /tmp/start-vpn.sh');

  // Start VPN
  console.log('Starting VPN...');
  const startResult = await ssh.execCommand('sudo bash /tmp/start-vpn.sh');
  console.log('PID:', startResult.stdout.trim());

  // Wait for tunnel to establish
  console.log('Waiting 12 seconds for tunnel...\n');
  await new Promise(r => setTimeout(r, 12000));

  // Check VPN log
  const log = await ssh.execCommand('cat /tmp/vpn.log 2>/dev/null');
  console.log('=== VPN Log ===');
  console.log(log.stdout || '(empty)');

  // Check ppp0 interface
  const iface = await ssh.execCommand('ip link show ppp0 2>&1');
  console.log('\n=== ppp0 interface ===');
  console.log(iface.stdout || iface.stderr);

  // Check process
  const ps = await ssh.execCommand('ps aux | grep openfortivpn | grep -v grep');
  console.log('\n=== openfortivpn process ===');
  console.log(ps.stdout || '(none running)');

  // If ppp0 is up, add routes and test Oracle
  if (iface.stdout && iface.stdout.includes('ppp0')) {
    console.log('\n=== Adding routes ===');
    await ssh.execCommand('sudo ip route add 10.0.0.0/8 dev ppp0 2>&1');
    await ssh.execCommand('sudo ip route add 172.16.0.0/12 dev ppp0 2>&1');
    await ssh.execCommand('sudo ip route add 192.168.0.0/16 dev ppp0 2>&1');
    console.log('Routes added.');

    // Test DNS via VPN nameserver
    console.log('\n=== DNS lookup via VPN nameserver ===');
    const dns = await ssh.execCommand('nslookup PRODDB-SCAN.ITSUPPORT.HG 192.168.100.22 2>&1');
    console.log(dns.stdout || dns.stderr);

    // Test Oracle port
    console.log('\n=== Oracle port 1521 test ===');
    const oracle = await ssh.execCommand('timeout 10 bash -c "echo > /dev/tcp/PRODDB-SCAN.ITSUPPORT.HG/1521" 2>&1 && echo "ORACLE REACHABLE" || echo "ORACLE NOT REACHABLE"');
    console.log(oracle.stdout || oracle.stderr);
  } else {
    console.log('\nppp0 not found - VPN tunnel did not establish.');
  }

  // Cleanup - kill VPN
  console.log('\n=== Cleanup ===');
  await ssh.execCommand('sudo pkill -f openfortivpn 2>/dev/null');
  console.log('VPN killed.');

  ssh.dispose();
  console.log('Done.');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
