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
  await ssh.connect({ host: 'propackhub.com', port: 22, username: 'propackhub', password: '***REDACTED***', readyTimeout: 10000 });
  console.log('Connected to VPS.');

  // 1. See what's on port 3001
  await run('sudo lsof -i :3001 2>/dev/null || echo "nothing on port 3001"', 'What is on port 3001');

  // 2. Stop pm2 first
  console.log('\nStopping pm2...');
  await run('sudo pm2 stop propackhub-backend 2>/dev/null', 'PM2 Stop');

  // 3. Kill everything on port 3001
  console.log('\nKilling all processes on port 3001...');
  await run('sudo kill -9 $(sudo lsof -ti:3001) 2>/dev/null; sleep 1; echo "done"', 'Kill port 3001');

  // 4. Verify port is free
  await run('sudo lsof -i :3001 2>/dev/null || echo "Port 3001 is FREE"', 'Port 3001 check');

  // 5. Reset pm2 restart counter and start fresh
  console.log('\nRestarting pm2 cleanly...');
  await run('sudo pm2 delete propackhub-backend 2>/dev/null; sleep 1', 'PM2 Delete old process');
  await run('sudo pm2 start /home/propackhub/app/server/index.js --name propackhub-backend --cwd /home/propackhub/app/server 2>&1', 'PM2 Start fresh');
  
  // 6. Wait and check
  await new Promise(r => setTimeout(r, 3000));
  await run('sudo pm2 jlist 2>/dev/null | node -e "const d=require(\'fs\').readFileSync(\'/dev/stdin\',\'utf8\');const p=JSON.parse(d);p.forEach(x=>console.log(\'name:\',x.name,\'status:\',x.pm2_env.status,\'restarts:\',x.pm2_env.restart_time,\'uptime:\',Math.round((Date.now()-x.pm2_env.pm_uptime)/1000)+\'s\'))" 2>/dev/null || echo "parse error"', 'PM2 Status after fix');

  // 7. Health check
  await run('curl -s --max-time 5 http://localhost:3001/api/health 2>/dev/null || echo "HEALTH CHECK FAILED"', 'Health Check');

  // 8. Save pm2
  await run('sudo pm2 save 2>/dev/null', 'PM2 Save');

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
