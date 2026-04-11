/**
 * Fix backend crash loop — kill port 3001, restart pm2 properly
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

  // 1. What's on port 3001?
  await run('sudo lsof -ti:3001 2>/dev/null || echo "Nothing on 3001"', '1. Port 3001 processes');

  // 2. Kill everything on port 3001
  await run('sudo kill -9 $(sudo lsof -ti:3001) 2>/dev/null; sleep 1; echo "Killed"', '2. Kill port 3001');

  // 3. Stop all pm2 processes
  await run('sudo pm2 kill 2>/dev/null; pm2 kill 2>/dev/null; echo "pm2 killed"', '3. Kill pm2');

  // 4. Verify port is free
  await run('sudo lsof -ti:3001 2>/dev/null || echo "Port 3001 is FREE"', '4. Verify port free');

  // 5. Start backend with ecosystem config
  await run('cd /home/propackhub/app && sudo pm2 start server/ecosystem.config.js 2>&1', '5. Start backend');

  // 6. Wait and check
  await new Promise(r => setTimeout(r, 5000));
  await run('sudo pm2 list 2>&1', '6. pm2 status');
  await run('sudo pm2 logs propackhub-backend --lines 10 --nostream 2>&1', '7. Backend logs');

  // 7. Health check
  await run('curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health 2>&1 || echo "FAILED"', '8. Health check');

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
