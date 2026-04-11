/**
 * VPS: Install deps, start pm2, verify - run with: node scripts/vps-start-pm2.js
 */
const { NodeSSH } = require('node-ssh');
require('dotenv').config({ quiet: true });

const ssh = new NodeSSH();
const SERVER_DIR = '/home/propackhub/app/server';

async function run() {
  await ssh.connect({
    host: process.env.VPS_HOST,
    port: 22,
    username: process.env.VPS_SSH_USER,
    password: process.env.VPS_SSH_PASSWORD,
    tryKeyboard: true,
    readyTimeout: 20000
  });

  // 1. Install all production deps
  console.log('=== 1. Installing production dependencies ===');
  const inst = await ssh.execCommand(`cd ${SERVER_DIR} && npm install --production 2>&1`);
  // Show last 15 lines
  const instLines = inst.stdout.split('\n');
  console.log(instLines.slice(-15).join('\n'));
  if (inst.stderr) console.log('STDERR:', inst.stderr.substring(0, 500));

  // 2. Re-check key deps
  console.log('\n=== 2. Verifying key dependencies ===');
  const deps = ['express','pg','jsonwebtoken','node-ssh','dotenv','cors','redis','bcryptjs','multer','compression','winston'];
  for (const dep of deps) {
    const r = await ssh.execCommand(`cd ${SERVER_DIR} && node -e "try{require('${dep}');console.log('OK')}catch(e){console.log('MISSING')}"`);
    console.log(`  ${dep}: ${r.stdout.trim()}`);
  }

  // 3. Delete old pm2 processes
  console.log('\n=== 3. Cleaning pm2 ===');
  await ssh.execCommand('pm2 delete all 2>/dev/null');
  console.log('Old processes cleared');

  // 4. Start with pm2
  console.log('\n=== 4. Starting with pm2 ===');
  const start = await ssh.execCommand(`cd ${SERVER_DIR} && pm2 start index.js --name propackhub-backend --time --max-restarts 3 2>&1`);
  console.log(start.stdout || start.stderr);

  // 5. Wait and check
  console.log('\n=== 5. Waiting 8 seconds for startup... ===');
  await new Promise(r => setTimeout(r, 8000));

  const pm2status = await ssh.execCommand('pm2 jlist 2>/dev/null');
  try {
    const procs = JSON.parse(pm2status.stdout);
    const p = procs[0];
    console.log(`  Name: ${p.name}`);
    console.log(`  Status: ${p.pm2_env.status}`);
    console.log(`  PID: ${p.pid}`);
    console.log(`  Uptime: ${Math.round((Date.now() - p.pm2_env.pm_uptime) / 1000)}s`);
    console.log(`  Restarts: ${p.pm2_env.restart_time}`);
    console.log(`  User: ${p.pm2_env.username}`);
  } catch (e) {
    console.log('  pm2 status:', pm2status.stdout || 'ERROR');
  }

  // 6. Health check
  console.log('\n=== 6. Health check ===');
  const health = await ssh.execCommand('curl -s --max-time 10 http://localhost:3001/api/health 2>&1');
  console.log(health.stdout || 'FAILED: ' + health.stderr);

  // 7. Check error logs
  console.log('\n=== 7. Error log (last 20 lines) ===');
  const errLog = await ssh.execCommand('cat /home/propackhub/.pm2/logs/propackhub-backend-error.log 2>/dev/null | tail -20');
  console.log(errLog.stdout || '(no errors)');

  // 8. Check output logs
  console.log('\n=== 8. Output log (last 20 lines) ===');
  const outLog = await ssh.execCommand('cat /home/propackhub/.pm2/logs/propackhub-backend-out.log 2>/dev/null | tail -20');
  console.log(outLog.stdout || '(empty)');

  // 9. pm2 save for reboot persistence
  console.log('\n=== 9. pm2 save ===');
  const save = await ssh.execCommand('pm2 save 2>&1');
  console.log(save.stdout || save.stderr);

  ssh.dispose();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
