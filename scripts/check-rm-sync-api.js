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

  // Kill stale VPN first
  await run('sudo pkill -f openfortivpn 2>/dev/null; sleep 1; echo "Killed stale VPN"', '0. Kill stale VPN');

  // Check backend is alive
  await run('curl -s http://localhost:3001/api/health 2>&1', '1. Health check');

  // Check pm2 status
  await run('sudo pm2 list 2>&1', '2. pm2 status');

  // Try calling the RM sync API directly from VPS
  console.log('\n=== 3. Calling POST /api/rm-sync/sync ===');
  const syncResult = await ssh.execCommand('curl -s -X POST http://localhost:3001/api/rm-sync/sync 2>&1');
  console.log(syncResult.stdout || syncResult.stderr);

  // Wait 10 seconds for it to start
  await new Promise(r => setTimeout(r, 10000));

  // Check progress
  await run('cat /home/propackhub/app/server/rm-sync-progress.json 2>/dev/null', '4. Progress after 10s');

  // Check backend logs for sync activity
  await run('sudo pm2 logs propackhub-backend --lines 30 --nostream 2>&1 | tail -30', '5. Backend logs after sync call');

  // Wait more
  await new Promise(r => setTimeout(r, 15000));
  await run('cat /home/propackhub/app/server/rm-sync-progress.json 2>/dev/null', '6. Progress after 25s');

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
