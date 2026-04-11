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

  console.log('=== 1. PM2 status (sudo) ===');
  const r1 = await ssh.execCommand('sudo pm2 list');
  console.log(r1.stdout);

  console.log('\n=== 2. PM2 error logs (last 50) ===');
  const r2 = await ssh.execCommand('sudo pm2 logs propackhub-backend --err --lines 50 --nostream');
  console.log(r2.stdout || r2.stderr);

  console.log('\n=== 3. PM2 out logs (last 30) ===');
  const r3 = await ssh.execCommand('sudo pm2 logs propackhub-backend --out --lines 30 --nostream');
  console.log(r3.stdout || r3.stderr);

  console.log('\n=== 4. What does curl return for /settings? ===');
  const r4 = await ssh.execCommand('curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3001/settings');
  console.log(r4.stdout);

  console.log('\n=== 5. What does curl return for frontend /settings? ===');
  const r5 = await ssh.execCommand('curl -s -o /dev/null -w "HTTP %{http_code}" https://propackhub.com/settings');
  console.log(r5.stdout);

  console.log('\n=== 6. Check index.html exists ===');
  const r6 = await ssh.execCommand('head -5 /home/propackhub/public_html/index.html');
  console.log(r6.stdout);

  console.log('\n=== 7. Port 3001 status ===');
  const r7 = await ssh.execCommand('ss -tlnp | grep 3001');
  console.log(r7.stdout || 'NOTHING on 3001');

  ssh.dispose();
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
