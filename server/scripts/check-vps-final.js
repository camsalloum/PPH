const { NodeSSH } = require('node-ssh');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const ssh = new NodeSSH();

async function run() {
  await ssh.connect({
    host: process.env.VPS_HOST || 'propackhub.com',
    port: 22,
    username: process.env.VPS_SSH_USER || 'propackhub',
    password: process.env.VPS_SSH_PASSWORD,
    tryKeyboard: true,
    readyTimeout: 20000
  });

  console.log('=== 1. What index.html on VPS references ===');
  const r1 = await ssh.execCommand('grep "index-" /home/propackhub/public_html/index.html');
  console.log(r1.stdout);

  console.log('\n=== 2. What HTTPS actually serves (curl the live site) ===');
  const r2 = await ssh.execCommand('curl -s https://propackhub.com/ | grep "index-"');
  console.log(r2.stdout);

  console.log('\n=== 3. Check nginx cache headers ===');
  const r3 = await ssh.execCommand('curl -sI https://propackhub.com/ | grep -i "cache\\|age\\|etag\\|last-modified"');
  console.log(r3.stdout || 'no cache headers');

  console.log('\n=== 4. PM2 status (sudo) ===');
  const r4 = await ssh.execCommand('sudo pm2 list');
  console.log(r4.stdout);

  console.log('\n=== 5. PM2 last 20 error lines (sudo) ===');
  const r5 = await ssh.execCommand('sudo pm2 logs propackhub-backend --err --lines 20 --nostream');
  console.log(r5.stdout || r5.stderr);

  console.log('\n=== 6. PM2 last 20 out lines (sudo) ===');
  const r6 = await ssh.execCommand('sudo pm2 logs propackhub-backend --out --lines 20 --nostream');
  console.log(r6.stdout || r6.stderr);

  console.log('\n=== 7. Does old JS file still exist? ===');
  const r7 = await ssh.execCommand('ls -la /home/propackhub/public_html/assets/index-Bc-rkD-c.js 2>&1');
  console.log(r7.stdout);

  console.log('\n=== 8. Backend health ===');
  const r8 = await ssh.execCommand('curl -s http://localhost:3001/api/health');
  console.log(r8.stdout);

  ssh.dispose();
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
