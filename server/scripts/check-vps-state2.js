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

  console.log('=== 1. PM2 list (all users) ===');
  const r1 = await ssh.execCommand('pm2 list');
  console.log(r1.stdout || 'EMPTY');
  console.log('STDERR:', r1.stderr || 'none');

  console.log('\n=== 2. What is listening on port 3001? ===');
  const r2 = await ssh.execCommand('ss -tlnp | grep 3001');
  console.log(r2.stdout || 'NOTHING on 3001');

  console.log('\n=== 3. Node processes running ===');
  const r3 = await ssh.execCommand('ps aux | grep node | grep -v grep');
  console.log(r3.stdout || 'NO node processes');

  console.log('\n=== 4. Curl the actual site to see what JS is served ===');
  const r4 = await ssh.execCommand('curl -s https://propackhub.com/ | grep "index-.*\\.js"');
  console.log(r4.stdout);

  console.log('\n=== 5. Check nginx error log (last 10 lines) ===');
  const r5 = await ssh.execCommand('tail -10 /var/log/nginx/error.log 2>/dev/null || echo "no access"');
  console.log(r5.stdout);

  console.log('\n=== 6. Try starting pm2 ===');
  const r6 = await ssh.execCommand('cd /home/propackhub/app && pm2 start server/index.js --name ipdashboard-backend --node-args="--max-old-space-size=512" 2>&1');
  console.log(r6.stdout);
  console.log('STDERR:', r6.stderr || 'none');

  console.log('\n=== 7. PM2 list after start ===');
  const r7 = await ssh.execCommand('pm2 list');
  console.log(r7.stdout);

  console.log('\n=== 8. Wait 3s then check logs ===');
  await new Promise(r => setTimeout(r, 3000));
  const r8 = await ssh.execCommand('pm2 logs ipdashboard-backend --lines 20 --nostream');
  console.log(r8.stdout || r8.stderr);

  ssh.dispose();
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
