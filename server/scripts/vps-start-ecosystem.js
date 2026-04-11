/**
 * Start pm2 using ecosystem.config.js (has kill_signal: SIGTERM fix)
 * Run: cd server && node scripts/vps-start-ecosystem.js
 */
const { NodeSSH } = require('node-ssh');
require('dotenv').config({ quiet: true });

const ssh = new NodeSSH();
const SERVER_DIR = '/home/propackhub/app/server';

async function exec(cmd) {
  const r = await ssh.execCommand(cmd);
  return { out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), code: r.code };
}

async function run() {
  await ssh.connect({
    host: process.env.VPS_HOST, port: 22,
    username: process.env.VPS_SSH_USER,
    password: process.env.VPS_SSH_PASSWORD,
    tryKeyboard: true, readyTimeout: 20000
  });
  console.log('Connected to VPS as', process.env.VPS_SSH_USER);

  // 1. Check if ecosystem.config.js exists
  console.log('\n--- Checking ecosystem.config.js ---');
  const ecoCheck = await exec(`cat ${SERVER_DIR}/ecosystem.config.js 2>/dev/null | head -5`);
  if (!ecoCheck.out) {
    console.log('❌ ecosystem.config.js not found on VPS! Uploading...');
    // Upload it
    await ssh.putFile('ecosystem.config.js', `${SERVER_DIR}/ecosystem.config.js`);
    console.log('✅ Uploaded ecosystem.config.js');
  } else {
    console.log('✅ ecosystem.config.js exists');
  }

  // 2. Verify kill_signal is set
  const killSig = await exec(`grep kill_signal ${SERVER_DIR}/ecosystem.config.js`);
  console.log('kill_signal config:', killSig.out || '❌ NOT FOUND');

  // 3. Check NODE_ENV in .env
  const nodeEnv = await exec(`grep NODE_ENV ${SERVER_DIR}/.env`);
  console.log('NODE_ENV:', nodeEnv.out);

  // 4. Stop everything
  console.log('\n--- Stopping existing processes ---');
  const deleteResult = await exec('pm2 delete all 2>&1');
  console.log('pm2 delete:', deleteResult.out);
  
  // Kill anything on port 3001
  await exec('fuser -k 3001/tcp 2>/dev/null');
  await new Promise(r => setTimeout(r, 2000));
  
  const portCheck = await exec('ss -tlnp | grep 3001 || echo "Port 3001 free"');
  console.log('Port check:', portCheck.out);

  // 5. Start with ecosystem config
  console.log('\n--- Starting pm2 with ecosystem.config.js ---');
  const startResult = await exec(`pm2 start ${SERVER_DIR}/ecosystem.config.js 2>&1`);
  console.log(startResult.out);
  if (startResult.err) console.log('STDERR:', startResult.err);

  // 6. Wait for startup
  console.log('\nWaiting 10s for startup...');
  await new Promise(r => setTimeout(r, 10000));

  // 7. Check pm2 status
  console.log('\n--- pm2 status ---');
  const pm2List = await exec('pm2 list 2>&1');
  console.log(pm2List.out);

  // 8. Check detailed status
  const pm2Json = await exec('pm2 jlist 2>/dev/null');
  try {
    const procs = JSON.parse(pm2Json.out);
    if (procs.length > 0) {
      const p = procs[0];
      console.log('\nDetailed status:');
      console.log('  Name:', p.name);
      console.log('  Status:', p.pm2_env.status);
      console.log('  PID:', p.pid);
      console.log('  Restarts:', p.pm2_env.restart_time);
      console.log('  Uptime:', Math.round((Date.now() - p.pm2_env.pm_uptime) / 1000) + 's');
      
      if (p.pm2_env.status !== 'online') {
        console.log('\n⚠️ Process is NOT online. Checking logs...');
      }
      if (p.pm2_env.restart_time > 3) {
        console.log('\n⚠️ High restart count — possible crash loop');
      }
    }
  } catch(e) {}

  // 9. Health check
  console.log('\n--- Health check ---');
  const health = await exec('curl -s --max-time 10 http://localhost:3001/api/health');
  console.log(health.out || '❌ No response');

  // 10. Check error logs
  console.log('\n--- Error log (last 20 lines) ---');
  const errLog = await exec('tail -20 /home/propackhub/.pm2/logs/propackhub-backend-error.log 2>/dev/null');
  console.log(errLog.out || '(empty)');

  // 11. Check output logs
  console.log('\n--- Output log (last 20 lines) ---');
  const outLog = await exec('tail -20 /home/propackhub/.pm2/logs/propackhub-backend-out.log 2>/dev/null');
  console.log(outLog.out || '(empty)');

  // 12. Save pm2 config
  if (health.out && health.out.includes('healthy')) {
    console.log('\n--- Saving pm2 ---');
    const saveResult = await exec('pm2 save 2>&1');
    console.log(saveResult.out);
    console.log('\n✅ Backend is running and healthy!');
  } else {
    console.log('\n❌ Backend is NOT healthy. Check logs above.');
  }

  ssh.dispose();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
