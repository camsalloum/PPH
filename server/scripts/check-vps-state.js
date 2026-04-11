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

  console.log('=== 1. What index.html references ===');
  const r1 = await ssh.execCommand('grep "index-" /home/propackhub/public_html/index.html');
  console.log(r1.stdout);

  console.log('\n=== 2. JS files on disk ===');
  const r2 = await ssh.execCommand('ls -la /home/propackhub/public_html/assets/index-*.js');
  console.log(r2.stdout || r2.stderr);

  console.log('\n=== 3. PM2 status ===');
  const r3 = await ssh.execCommand('pm2 list');
  console.log(r3.stdout);

  console.log('\n=== 4. PM2 last 30 error lines ===');
  const r4 = await ssh.execCommand('pm2 logs ipdashboard-backend --err --lines 30 --nostream');
  console.log(r4.stdout || r4.stderr);

  console.log('\n=== 5. Check SalesRepGroups.jsx on VPS (grep useSalesData) ===');
  const r5 = await ssh.execCommand('grep -n "useSalesData" /home/propackhub/app/src/components/MasterData/SalesRep/SalesRepGroups.jsx 2>&1 || echo "NOT FOUND - good"');
  console.log(r5.stdout);

  console.log('\n=== 6. Check server salesRepGroupsService on VPS ===');
  const r6 = await ssh.execCommand('head -5 /home/propackhub/app/server/services/salesRepGroupsService.js');
  console.log(r6.stdout);

  console.log('\n=== 7. Check if JSON config still exists ===');
  const r7 = await ssh.execCommand('ls -la /home/propackhub/app/server/data/sales-reps-config.json* 2>&1');
  console.log(r7.stdout);

  console.log('\n=== 8. Backend health check ===');
  const r8 = await ssh.execCommand('curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3001/api/health');
  console.log(r8.stdout);

  ssh.dispose();
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
