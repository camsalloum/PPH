/**
 * End-to-end test: VPN connect → Oracle fetch 10 rows → VPN disconnect
 * Run from project root: node scripts/test-vpn-oracle-e2e.js
 * Executes on VPS via SSH.
 */
const path = require('path');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();

const VPS = {
  host: 'propackhub.com',
  port: 22,
  username: 'propackhub',
  password: '***REDACTED***'
};

const VPN = {
  gateway: '5.195.104.114',
  port: '48443',
  user: 'camille',
  password: '***REDACTED***',
  trustedCert: 'ae1094d5865601d0ecccd1364cc169cefa1d92babac287753f9a1effc3254c66'
};

const ORACLE = {
  user: 'noor',
  password: '***REDACTED***',
  connectString: 'PRODDB-SCAN.ITSUPPORT.HG:1521/PRODREPDB.snetprivdb.vcnprodinfor.oraclevcn.com'
};

async function run(cmd, label) {
  const r = await ssh.execCommand(cmd);
  if (label) {
    console.log(`\n=== ${label} ===`);
    if (r.stdout) console.log(r.stdout);
    if (r.stderr) console.log('[stderr]', r.stderr);
  }
  return r;
}

async function main() {
  console.log('1. Connecting SSH to VPS...');
  await ssh.connect({ ...VPS, readyTimeout: 10000 });
  console.log('   SSH connected.');

  // Kill any existing VPN
  await run('sudo pkill -f openfortivpn 2>/dev/null; sleep 1');

  // Start VPN in background
  console.log('\n2. Starting VPN tunnel...');
  const vpnCmd = [
    'sudo openfortivpn',
    `${VPN.gateway}:${VPN.port}`,
    `-u ${VPN.user}`,
    `-p ${VPN.password}`,
    '--no-routes',
    `--trusted-cert ${VPN.trustedCert}`
  ].join(' ');
  await run(`${vpnCmd} > /tmp/vpn-e2e.log 2>&1 &`);

  // Wait for tunnel
  console.log('   Waiting 12s for tunnel to establish...');
  await new Promise(r => setTimeout(r, 12000));

  // Check VPN
  const vpnLog = await run('cat /tmp/vpn-e2e.log', 'VPN Log');
  const tunnelUp = vpnLog.stdout && vpnLog.stdout.includes('Tunnel is up');
  
  if (!tunnelUp) {
    console.log('\n❌ VPN tunnel did NOT establish. Aborting.');
    await run('sudo pkill -f openfortivpn 2>/dev/null');
    ssh.dispose();
    process.exit(1);
  }
  console.log('   ✅ VPN tunnel is up!');

  // Add routes
  console.log('\n3. Adding routes...');
  await run('sudo ip route add 10.0.0.0/8 dev ppp0 2>/dev/null');
  await run('sudo ip route add 172.16.0.0/12 dev ppp0 2>/dev/null');
  await run('sudo ip route add 192.168.0.0/16 dev ppp0 2>/dev/null');
  console.log('   Routes added.');

  // Test Oracle port
  console.log('\n4. Testing Oracle port 1521...');
  const portTest = await run(
    'timeout 10 bash -c "echo > /dev/tcp/PRODDB-SCAN.ITSUPPORT.HG/1521" 2>&1 && echo "REACHABLE" || echo "NOT_REACHABLE"',
    'Oracle Port Test'
  );
  
  if (!portTest.stdout.includes('REACHABLE') || portTest.stdout.includes('NOT_REACHABLE')) {
    console.log('\n❌ Oracle port not reachable. Aborting.');
    await run('sudo pkill -f openfortivpn 2>/dev/null');
    ssh.dispose();
    process.exit(1);
  }
  console.log('   ✅ Oracle port 1521 reachable!');

  // Write a small Node script on VPS to fetch 10 rows from Oracle
  console.log('\n5. Fetching 10 rows from Oracle...');
  
  const oracleScript = `
const oracledb = require('/home/propackhub/app/server/node_modules/oracledb');
try { oracledb.initOracleClient({ libDir: '/usr/lib/oracle/21/client64/lib' }); } catch(e) {}

(async () => {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: '${ORACLE.user}',
      password: '${ORACLE.password}',
      connectString: '${ORACLE.connectString}'
    });
    console.log('Oracle connected! Version:', conn.oracleServerVersionString);
    
    // Quick test with DUAL first
    console.log('Testing with SELECT FROM DUAL...');
    const dual = await conn.execute('SELECT 1 AS TEST FROM DUAL');
    console.log('DUAL result:', JSON.stringify(dual.rows));
    
    // Now try the actual view with a tight filter
    console.log('Running query on actual view (ROWNUM <= 10, YEAR1=2025)...');
    const t0 = Date.now();
    
    const result = await conn.execute(
      'SELECT DIVISION, YEAR1, MONTH1, CUSTOMERNAME, INVOICEDAMOUNT FROM HAP111.XL_FPSALESVSCOST_FULL WHERE ROWNUM <= 10 AND YEAR1 = 2025',
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: 10 }
    );
    
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log('Query done in ' + elapsed + 's');
    
    console.log('Rows fetched:', result.rows.length);
    console.log(JSON.stringify(result.rows, null, 2));
  } catch(e) {
    console.error('Oracle error:', e.message);
    process.exit(1);
  } finally {
    if (conn) await conn.close();
  }
})();
`;

  // Write script to VPS
  await ssh.execCommand(`cat > /tmp/test-oracle-fetch.js << 'NODESCRIPT'
${oracleScript}
NODESCRIPT`);

  // Run it — Oracle view is slow, allow 3 min. Write output to file to avoid SSH channel timeout.
  console.log('   Running Oracle test script on VPS (may take a few minutes)...');
  await ssh.execCommand(
    'cd /home/propackhub/app/server && nohup timeout 180 node /tmp/test-oracle-fetch.js > /tmp/oracle-test-output.log 2>&1 &'
  );
  
  // Poll the output file every 10s for up to 3 minutes
  let fetchOutput = '';
  for (let i = 0; i < 18; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const check = await ssh.execCommand('cat /tmp/oracle-test-output.log 2>/dev/null');
    fetchOutput = check.stdout || '';
    process.stdout.write(`   ... ${(i+1)*10}s elapsed\n`);
    
    // Check if script finished (has "Rows fetched" or "Oracle error")
    if (fetchOutput.includes('Rows fetched:') || fetchOutput.includes('Oracle error:') || fetchOutput.includes('Query done')) {
      break;
    }
  }
  
  console.log('\n=== Oracle Fetch Result ===');
  console.log(fetchOutput || '(no output)');

  // Cleanup
  console.log('\n6. Cleaning up — disconnecting VPN...');
  await run('sudo pkill -f openfortivpn 2>/dev/null');
  await run('rm -f /tmp/vpn-e2e.log /tmp/test-oracle-fetch.js');
  console.log('   Done.');

  ssh.dispose();
  
  if (fetchOutput && fetchOutput.includes('Rows fetched:')) {
    console.log('\n✅ END-TO-END TEST PASSED: VPN → Oracle → Data fetched successfully!');
  } else {
    console.log('\n❌ END-TO-END TEST FAILED: Could not fetch data from Oracle.');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Fatal:', e.message);
  ssh.dispose();
  process.exit(1);
});
