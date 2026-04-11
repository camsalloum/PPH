/**
 * Deploy the NODE_PATH fix for rmSync.js and oracleDirectSync.js to VPS
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

  // Upload fixed route files
  await ssh.putFile(
    path.join(__dirname, '..', 'server', 'routes', 'rmSync.js'),
    '/home/propackhub/app/server/routes/rmSync.js'
  );
  console.log('Uploaded rmSync.js');

  await ssh.putFile(
    path.join(__dirname, '..', 'server', 'routes', 'oracleDirectSync.js'),
    '/home/propackhub/app/server/routes/oracleDirectSync.js'
  );
  console.log('Uploaded oracleDirectSync.js');

  // Restart backend
  await run('sudo pm2 restart propackhub-backend 2>&1', 'Restart backend');
  await new Promise(r => setTimeout(r, 5000));

  // Verify
  await run('sudo pm2 list 2>&1', 'pm2 status');
  await run('curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health', 'Health check');

  ssh.dispose();
  console.log('\nDone. Try RM sync from UI now.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
