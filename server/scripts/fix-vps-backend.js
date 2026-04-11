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

  console.log('=== 1. Stop PM2 process ===');
  const r1 = await ssh.execCommand('pm2 delete all 2>&1 || echo "no pm2 processes"');
  console.log(r1.stdout);

  console.log('\n=== 2. Kill ALL node processes on port 3001 ===');
  const r2 = await ssh.execCommand('fuser -k 3001/tcp 2>&1 || echo "port already free"');
  console.log(r2.stdout || r2.stderr || 'done');

  console.log('\n=== 3. Kill any remaining node processes ===');
  const r3 = await ssh.execCommand('pkill -f "node /home/propackhub/app/server/index.js" 2>&1 || echo "no stale processes"');
  console.log(r3.stdout || 'done');

  // Also kill the stale test processes from Feb 8 and Feb 10
  await ssh.execCommand('kill 525659 525706 788874 788921 2>/dev/null || true');

  console.log('\n=== 4. Wait 2s for port to free ===');
  await new Promise(r => setTimeout(r, 2000));

  const r4 = await ssh.execCommand('ss -tlnp | grep 3001');
  console.log('Port 3001:', r4.stdout || 'FREE');

  console.log('\n=== 5. Start PM2 fresh ===');
  const r5 = await ssh.execCommand('cd /home/propackhub/app && pm2 start server/index.js --name ipdashboard-backend --node-args="--max-old-space-size=512" 2>&1');
  console.log(r5.stdout);

  console.log('\n=== 6. Wait 5s for startup ===');
  await new Promise(r => setTimeout(r, 5000));

  console.log('\n=== 7. PM2 status ===');
  const r7 = await ssh.execCommand('pm2 list');
  console.log(r7.stdout);

  console.log('\n=== 8. Health check ===');
  const r8 = await ssh.execCommand('curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3001/api/health');
  console.log(r8.stdout);

  console.log('\n=== 9. Last 15 log lines ===');
  const r9 = await ssh.execCommand('pm2 logs ipdashboard-backend --lines 15 --nostream');
  console.log(r9.stdout || r9.stderr);

  console.log('\n=== 10. Save PM2 config ===');
  const r10 = await ssh.execCommand('pm2 save');
  console.log(r10.stdout);

  ssh.dispose();
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
