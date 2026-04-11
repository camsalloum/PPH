/**
 * Test VPN + Oracle connectivity from VPS — full diagnostic
 */
const path = require('path');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();

async function run(cmd, label, timeout = 30000) {
  console.log(`\n=== ${label} ===`);
  const r = await ssh.execCommand(cmd, { execOptions: { timeout } });
  if (r.stdout) console.log(r.stdout);
  if (r.stderr) console.log('STDERR:', r.stderr);
  if (!r.stdout && !r.stderr) console.log('(empty)');
  return r;
}

async function main() {
  await ssh.connect({ host: 'propackhub.com', port: 22, username: 'propackhub', password: '***REDACTED***', readyTimeout: 15000 });
  console.log('Connected to VPS.\n');

  // 1. Check if VPN is already running
  await run('pgrep -a openfortivpn 2>/dev/null || echo "NOT running"', '1. VPN process status');
  await run('ip link show ppp0 2>/dev/null || ip link show ppp1 2>/dev/null || echo "No PPP interface"', '2. PPP interface');

  // 2. Kill any existing VPN
  await run('sudo pkill -f openfortivpn 2>/dev/null; sleep 2; echo "Killed old VPN"', '3. Kill old VPN');

  // 3. Start VPN fresh
  console.log('\n=== 4. Starting VPN tunnel ===');
  await ssh.execCommand(
    'sudo openfortivpn 5.195.104.114:48443 -u camille -p ***REDACTED*** --no-routes --trusted-cert ae1094d5865601d0ecccd1364cc169cefa1d92babac287753f9a1effc3254c66 > /tmp/vpn-test.log 2>&1 &'
  );

  // Wait for tunnel
  let tunnelUp = false;
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const check = await ssh.execCommand('grep "Tunnel is up" /tmp/vpn-test.log 2>/dev/null');
    if (check.stdout && check.stdout.includes('Tunnel is up')) {
      tunnelUp = true;
      console.log('VPN tunnel is UP!');
      break;
    }
    const died = await ssh.execCommand('pgrep -a openfortivpn 2>/dev/null');
    if (!died.stdout) {
      console.log('VPN process died. Log:');
      const log = await ssh.execCommand('cat /tmp/vpn-test.log');
      console.log(log.stdout || log.stderr);
      break;
    }
    process.stdout.write('.');
  }

  if (!tunnelUp) {
    await run('cat /tmp/vpn-test.log', 'VPN log (failed)');
    await run('sudo pkill -f openfortivpn 2>/dev/null; echo done', 'Cleanup');
    ssh.dispose();
    console.log('\n❌ VPN tunnel did not come up.');
    return;
  }

  // 4. Add routes
  await run('sudo ip route add 10.0.0.0/8 dev ppp0 2>/dev/null; sudo ip route add 172.16.0.0/12 dev ppp0 2>/dev/null; sudo ip route add 192.168.0.0/16 dev ppp0 2>/dev/null; echo "Routes added"', '5. Add routes');
  await new Promise(r => setTimeout(r, 3000));

  // 5. Check DNS
  await run('cat /etc/resolv.conf | head -10', '6. DNS resolv.conf');
  await run('nslookup PRODDB-SCAN.ITSUPPORT.HG 2>&1 || echo "DNS FAILED"', '7. DNS lookup Oracle hostname');

  // 6. Try direct IP ping to Oracle network
  await run('timeout 5 bash -c "echo > /dev/tcp/PRODDB-SCAN.ITSUPPORT.HG/1521" 2>&1 && echo "REACHABLE via hostname" || echo "NOT reachable via hostname"', '8. Oracle reachability (hostname)');

  // 7. Check VPN-assigned nameservers and try them
  await run('cat /tmp/vpn-test.log | grep -i "ns\\|nameserver\\|address"', '9. VPN assigned nameservers');

  // 8. Try resolving via VPN nameservers directly
  await run('nslookup PRODDB-SCAN.ITSUPPORT.HG 192.168.100.22 2>&1 || echo "Failed with 192.168.100.22"', '10. DNS via VPN nameserver 192.168.100.22');
  await run('nslookup PRODDB-SCAN.ITSUPPORT.HG 192.168.100.12 2>&1 || echo "Failed with 192.168.100.12"', '11. DNS via VPN nameserver 192.168.100.12');

  // 9. Check routing table
  await run('ip route | grep -E "ppp|10\\.|172\\.16|192\\.168"', '12. Routing table (VPN routes)');

  // 10. Cleanup
  await run('sudo pkill -f openfortivpn 2>/dev/null; sudo ip route del 10.0.0.0/8 dev ppp0 2>/dev/null; sudo ip route del 172.16.0.0/12 dev ppp0 2>/dev/null; sudo ip route del 192.168.0.0/16 dev ppp0 2>/dev/null; echo "Cleaned up"', '13. Cleanup VPN');

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
