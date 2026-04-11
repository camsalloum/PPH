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

  // 1. Stop and delete from USER-level pm2 (the rogue one)
  console.log('\n--- Cleaning up USER-level pm2 (propackhub) ---');
  await run('pm2 stop all 2>/dev/null || true', 'User PM2: stop all');
  await run('pm2 delete all 2>/dev/null || true', 'User PM2: delete all');
  await run('pm2 save --force 2>/dev/null || true', 'User PM2: save empty list');
  await run('pm2 kill 2>/dev/null || true', 'User PM2: kill daemon');

  // 2. Stop and delete from ROOT-level pm2
  console.log('\n--- Cleaning up ROOT-level pm2 ---');
  await run('sudo pm2 stop all 2>/dev/null || true', 'Root PM2: stop all');
  await run('sudo pm2 delete all 2>/dev/null || true', 'Root PM2: delete all');

  // 3. Kill everything on port 3001
  console.log('\n--- Killing all processes on port 3001 ---');
  await run('sudo kill -9 $(sudo lsof -ti:3001) 2>/dev/null; sleep 2; echo "done"', 'Kill port 3001');
  await run('sudo lsof -i:3001 2>/dev/null || echo "Port 3001 is FREE"', 'Verify port free');

  // 4. Start ONLY via root pm2 using ecosystem config
  console.log('\n--- Starting fresh via ROOT pm2 with ecosystem.config.js ---');
  await run('sudo pm2 start /home/propackhub/app/server/ecosystem.config.js 2>&1', 'Root PM2: start');
  await run('sudo pm2 save 2>&1', 'Root PM2: save');

  // 5. Wait and verify
  await new Promise(r => setTimeout(r, 4000));
  await run('sudo pm2 list 2>/dev/null', 'Root PM2: list');
  await run('pm2 list 2>/dev/null', 'User PM2: list (should be empty)');
  await run('curl -s --max-time 5 http://localhost:3001/api/health 2>/dev/null || echo "HEALTH CHECK FAILED"', 'Health Check');

  // 6. Verify only ONE node process on port 3001
  await run('sudo lsof -i:3001 | grep LISTEN', 'Port 3001 LISTEN check');

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
