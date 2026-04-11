/**
 * Setup pm2 ecosystem on VPS
 * - Uploads ecosystem.config.js
 * - Kills ALL node/pm2 processes (both root and propackhub)
 * - Provides WHM commands to run
 */
const { NodeSSH } = require('node-ssh');
const path = require('path');
require('dotenv').config({ quiet: true });
const ssh = new NodeSSH();

(async () => {
  await ssh.connect({
    host: process.env.VPS_HOST, port: 22,
    username: process.env.VPS_SSH_USER,
    password: process.env.VPS_SSH_PASSWORD,
    tryKeyboard: true, readyTimeout: 20000
  });
  console.log('Connected to VPS\n');

  // 1. Upload ecosystem.config.js
  console.log('1. Uploading ecosystem.config.js...');
  await ssh.putFile(
    path.join(__dirname, '..', 'ecosystem.config.js'),
    '/home/propackhub/app/server/ecosystem.config.js'
  );
  const verify = await ssh.execCommand('cat /home/propackhub/app/server/ecosystem.config.js | head -5');
  console.log('   Uploaded ✅');
  console.log('   ', verify.stdout.split('\n')[0]);

  // 2. Stop propackhub's pm2
  console.log('\n2. Stopping propackhub pm2...');
  const r1 = await ssh.execCommand('pm2 delete all 2>/dev/null; pm2 kill 2>/dev/null; echo done');
  console.log('   propackhub pm2 stopped ✅');

  // 3. Check what's still running
  console.log('\n3. Current state:');
  const r2 = await ssh.execCommand('ps aux | grep node | grep index.js | grep -v grep');
  if (r2.stdout) {
    console.log('   ⚠️  Root node process still running:');
    console.log('   ', r2.stdout.trim());
    console.log('\n   Root process must be killed from WHM Terminal.');
  } else {
    console.log('   ✅ No node processes running');
  }

  const r3 = await ssh.execCommand('ss -tlnp | grep 3001');
  console.log('   Port 3001:', r3.stdout || 'FREE ✅');

  // 4. Create pm2 log directory
  await ssh.execCommand('mkdir -p /home/propackhub/.pm2/logs');

  console.log('\n' + '='.repeat(60));
  console.log('NEXT STEP: Go to WHM Terminal and run these commands:');
  console.log('='.repeat(60));
  console.log(`
# Kill any remaining root node processes
kill -9 $(lsof -ti:3001) 2>/dev/null

# Kill root's pm2 daemon
pm2 kill 2>/dev/null

# Verify port is free
ss -tlnp | grep 3001

# Start pm2 as root with ecosystem config (app runs as propackhub)
pm2 start /home/propackhub/app/server/ecosystem.config.js

# Save and setup startup
pm2 save
pm2 startup

# Wait and verify
sleep 10
pm2 list
curl -s http://localhost:3001/api/health
ps aux | grep node | grep -v grep
`);
  console.log('='.repeat(60));
  console.log('Expected result:');
  console.log('- pm2 shows: user=root, status=online, 0 restarts');
  console.log('- ps shows: node running as propackhub (uid/gid drop)');
  console.log('- health check returns healthy JSON');
  console.log('='.repeat(60));

  ssh.dispose();
})().catch(e => console.error(e.message));
