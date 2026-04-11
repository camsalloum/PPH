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

  console.log('=== 1. PM2 status ===');
  const r1 = await ssh.execCommand('sudo pm2 list');
  console.log(r1.stdout);

  console.log('\n=== 2. Hit /api/countries/list ===');
  const r2 = await ssh.execCommand('curl -s http://localhost:3001/api/countries/list 2>&1 | head -c 500');
  console.log(r2.stdout);

  console.log('\n=== 3. Hit /api/settings/company ===');
  const r3 = await ssh.execCommand('curl -s http://localhost:3001/api/settings/company 2>&1 | head -c 500');
  console.log(r3.stdout);

  console.log('\n=== 4. Hit /api/health ===');
  const r4 = await ssh.execCommand('curl -s http://localhost:3001/api/health 2>&1 | head -c 500');
  console.log(r4.stdout);

  console.log('\n=== 5. PM2 error logs (last 30) ===');
  const r5 = await ssh.execCommand('sudo pm2 logs propackhub-backend --err --lines 30 --nostream');
  console.log(r5.stdout || r5.stderr);

  console.log('\n=== 6. PM2 out logs (last 20) ===');
  const r6 = await ssh.execCommand('sudo pm2 logs propackhub-backend --out --lines 20 --nostream');
  console.log(r6.stdout || r6.stderr);

  console.log('\n=== 7. Check if ip_auth_database is accessible ===');
  const dbPass = process.env.VPS_DB_PASSWORD || '';
  const r7 = await ssh.execCommand(`PGPASSWORD='${dbPass}' psql -h localhost -U propackhub_user -d ip_auth_database -t -A -c "SELECT COUNT(*) FROM users" 2>&1`);
  console.log('Users count:', r7.stdout || r7.stderr);

  console.log('\n=== 8. Check server .env has correct DB settings ===');
  const r8 = await ssh.execCommand('grep -E "DB_HOST|DB_PORT|DB_USER|DB_NAME|AUTH_DB" /home/propackhub/app/server/.env 2>&1');
  console.log(r8.stdout);

  ssh.dispose();
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
