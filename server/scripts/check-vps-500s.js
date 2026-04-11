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

  console.log('=== 1. sales-rep-groups-universal response ===');
  const r1 = await ssh.execCommand('curl -s http://localhost:3001/api/sales-rep-groups-universal?division=FP 2>&1 | head -c 500');
  console.log(r1.stdout);

  console.log('\n=== 2. periods/all response ===');
  const r2 = await ssh.execCommand('curl -s http://localhost:3001/api/periods/all 2>&1 | head -c 500');
  console.log(r2.stdout);

  console.log('\n=== 3. standard-config response ===');
  const r3 = await ssh.execCommand('curl -s http://localhost:3001/api/standard-config 2>&1 | head -c 500');
  console.log(r3.stdout);

  console.log('\n=== 4. PM2 error logs (last 20) ===');
  const r4 = await ssh.execCommand('sudo pm2 logs propackhub-backend --err --lines 20 --nostream');
  console.log(r4.stdout || r4.stderr);

  console.log('\n=== 5. PM2 out logs (last 20) ===');
  const r5 = await ssh.execCommand('sudo pm2 logs propackhub-backend --out --lines 20 --nostream');
  console.log(r5.stdout || r5.stderr);

  ssh.dispose();
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
