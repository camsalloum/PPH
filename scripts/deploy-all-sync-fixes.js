/**
 * Deploy all sync fixes to VPS:
 * 1. rmSync.js (NODE_PATH fix)
 * 2. oracleDirectSync.js (NODE_PATH fix)
 * 3. ecosystem.config.js (NODE_PATH + LD_LIBRARY_PATH in env)
 * 4. Verify /etc/hosts has Oracle entry
 * 5. Restart backend with --update-env
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

  // 1. Upload fixed files
  const files = [
    ['server/routes/rmSync.js', '/home/propackhub/app/server/routes/rmSync.js'],
    ['server/routes/oracleDirectSync.js', '/home/propackhub/app/server/routes/oracleDirectSync.js'],
    ['server/ecosystem.config.js', '/home/propackhub/app/server/ecosystem.config.js'],
  ];

  for (const [local, remote] of files) {
    await ssh.putFile(path.join(__dirname, '..', local), remote);
    console.log(`✓ Uploaded ${local}`);
  }

  // 2. Verify /etc/hosts has Oracle entry
  const hostsCheck = await ssh.execCommand('grep "PRODDB-SCAN.ITSUPPORT.HG" /etc/hosts');
  if (!hostsCheck.stdout.includes('PRODDB-SCAN')) {
    console.log('\nAdding Oracle to /etc/hosts...');
    await ssh.execCommand('echo "10.1.2.99  PRODDB-SCAN.ITSUPPORT.HG" | sudo tee -a /etc/hosts');
    console.log('✓ Added');
  } else {
    console.log(`\n✓ /etc/hosts already has Oracle entry: ${hostsCheck.stdout.trim()}`);
  }

  // 3. Restart backend with --update-env so ecosystem env changes take effect
  await run('sudo pm2 delete propackhub-backend 2>/dev/null || true', 'Delete old pm2 process');
  await run('sudo kill -9 $(sudo lsof -ti:3001) 2>/dev/null; sleep 1; echo done', 'Free port 3001');
  await run('sudo pm2 start /home/propackhub/app/server/ecosystem.config.js 2>&1', 'Start with new ecosystem');
  await new Promise(r => setTimeout(r, 5000));

  // 4. Verify
  await run('sudo pm2 list 2>&1', 'pm2 status');
  await run('curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health', 'Health check');

  // 5. Verify NODE_PATH is in the pm2 env
  await run('sudo pm2 env 0 2>&1 | grep NODE_PATH', 'NODE_PATH in pm2 env');
  await run('sudo pm2 env 0 2>&1 | grep LD_LIBRARY', 'LD_LIBRARY_PATH in pm2 env');

  ssh.dispose();
  console.log('\n✅ All sync fixes deployed.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
