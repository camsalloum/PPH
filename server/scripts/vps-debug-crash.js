const { NodeSSH } = require('node-ssh');
require('dotenv').config({ quiet: true });
const ssh = new NodeSSH();

(async () => {
  await ssh.connect({
    host: process.env.VPS_HOST, port: 22,
    username: process.env.VPS_SSH_USER,
    password: process.env.VPS_SSH_PASSWORD,
    tryKeyboard: true, readyTimeout: 20000
  });

  // 1. Check pm2 error log
  const r1 = await ssh.execCommand('cat /home/propackhub/.pm2/logs/propackhub-backend-error.log 2>/dev/null | tail -50');
  console.log('=== PM2 ERROR LOG (last 50 lines) ===');
  console.log(r1.stdout || 'empty');

  // 2. Check pm2 out log  
  const r2 = await ssh.execCommand('cat /home/propackhub/.pm2/logs/propackhub-backend-out.log 2>/dev/null | tail -30');
  console.log('\n=== PM2 OUT LOG (last 30 lines) ===');
  console.log(r2.stdout || 'empty');

  // 3. Run node directly as propackhub and capture ALL output
  const r3 = await ssh.execCommand('cd /home/propackhub/app/server && timeout 5 node index.js 2>&1; echo "EXIT_CODE=$?"');
  console.log('\n=== DIRECT node index.js (5s timeout) ===');
  console.log(r3.stdout || 'no stdout');
  console.log(r3.stderr || 'no stderr');

  // 4. Check file permissions on key files
  const r4 = await ssh.execCommand('ls -la /home/propackhub/app/server/index.js /home/propackhub/app/server/.env /home/propackhub/app/server/config/ 2>&1');
  console.log('\n=== FILE PERMISSIONS ===');
  console.log(r4.stdout);

  // 5. Check if uploads/logs dirs are writable
  const r5 = await ssh.execCommand('touch /home/propackhub/app/server/logs/test-write 2>&1 && rm /home/propackhub/app/server/logs/test-write && echo "logs: writable" || echo "logs: NOT writable"');
  console.log('\n=== WRITE TEST ===');
  console.log(r5.stdout);

  const r6 = await ssh.execCommand('touch /home/propackhub/app/server/uploads/test-write 2>&1 && rm /home/propackhub/app/server/uploads/test-write && echo "uploads: writable" || echo "uploads: NOT writable"');
  console.log(r6.stdout);

  // 6. Check Redis
  const r7 = await ssh.execCommand('redis-cli ping 2>&1');
  console.log('\n=== REDIS ===');
  console.log(r7.stdout || r7.stderr);

  ssh.dispose();
})().catch(e => console.error(e.message));
