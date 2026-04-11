/**
 * Upload fixed ecosystem.config.js and index.js to VPS
 * Then provide WHM commands to restart pm2
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

  // 1. Kill zombie debug processes
  console.log('1. Killing zombie debug processes...');
  await ssh.execCommand('pkill -f "node -e" 2>/dev/null');
  console.log('   Done ✅');

  // 2. Upload ecosystem.config.js
  console.log('2. Uploading ecosystem.config.js (with kill_signal: SIGTERM)...');
  await ssh.putFile(
    path.join(__dirname, '..', 'ecosystem.config.js'),
    '/home/propackhub/app/server/ecosystem.config.js'
  );
  const r1 = await ssh.execCommand('grep kill_signal /home/propackhub/app/server/ecosystem.config.js');
  console.log('   ✅', r1.stdout.trim());

  // 3. Upload index.js
  console.log('3. Uploading index.js (SIGINT only in dev mode)...');
  await ssh.putFile(
    path.join(__dirname, '..', 'index.js'),
    '/home/propackhub/app/server/index.js'
  );
  const r2 = await ssh.execCommand('grep -n "NODE_ENV.*production.*SIGINT\\|SIGINT.*development\\|only.*development\\|Only handle in dev" /home/propackhub/app/server/index.js | head -3');
  console.log('   ✅', r2.stdout.trim() || 'uploaded');

  // 4. Verify
  const r3 = await ssh.execCommand('md5sum /home/propackhub/app/server/ecosystem.config.js /home/propackhub/app/server/index.js');
  console.log('\n4. File checksums:');
  console.log('   ', r3.stdout.replace(/\n/g, '\n   '));

  console.log('\n' + '='.repeat(60));
  console.log('Files uploaded. Now go to WHM Terminal and run:');
  console.log('='.repeat(60));
  console.log(`
pm2 delete propackhub-backend
pm2 start /home/propackhub/app/server/ecosystem.config.js
pm2 save
sleep 10
pm2 list
curl -s http://localhost:3001/api/health
`);
  console.log('='.repeat(60));

  ssh.dispose();
})().catch(e => console.error(e.message));
