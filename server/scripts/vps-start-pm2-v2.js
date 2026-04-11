/**
 * VPS: Start pm2 & verify - run with: node scripts/vps-start-pm2-v2.js
 * Assumes npm install is already done
 */
const { NodeSSH } = require('node-ssh');
require('dotenv').config({ quiet: true });

const ssh = new NodeSSH();
const SERVER_DIR = '/home/propackhub/app/server';

async function exec(cmd) {
  const r = await ssh.execCommand(cmd);
  return (r.stdout || '') + (r.stderr ? '\nSTDERR: ' + r.stderr : '');
}

async function run() {
  await ssh.connect({
    host: process.env.VPS_HOST,
    port: 22,
    username: process.env.VPS_SSH_USER,
    password: process.env.VPS_SSH_PASSWORD,
    tryKeyboard: true,
    readyTimeout: 20000
  });
  console.log('Connected to VPS');

  // Check deps
  console.log('\n--- Dependency check ---');
  console.log(await exec(`cd ${SERVER_DIR} && node -e "['express','pg','jsonwebtoken','dotenv','cors','compression','redis','bcryptjs'].forEach(d=>{try{require(d);console.log(d+': OK')}catch(e){console.log(d+': MISSING')}})"`));

  // Kill anything on 3001
  console.log('\n--- Clearing port 3001 ---');
  await exec('sudo fuser -k 3001/tcp 2>/dev/null');
  await exec('pm2 delete all 2>/dev/null');
  await new Promise(r => setTimeout(r, 2000));
  console.log(await exec('ss -tlnp | grep 3001 || echo "Port 3001 free"'));

  // Start pm2
  console.log('\n--- Starting pm2 ---');
  console.log(await exec(`cd ${SERVER_DIR} && pm2 start index.js --name propackhub-backend --time 2>&1`));

  // Wait
  console.log('\nWaiting 8s for startup...');
  await new Promise(r => setTimeout(r, 8000));

  // Status
  console.log('\n--- pm2 status ---');
  console.log(await exec('pm2 list 2>&1'));

  // Health
  console.log('\n--- Health check ---');
  console.log(await exec('curl -s --max-time 10 http://localhost:3001/api/health'));

  // Errors
  console.log('\n--- Error log (last 15) ---');
  console.log(await exec('tail -15 /home/propackhub/.pm2/logs/propackhub-backend-error.log 2>/dev/null || echo "(empty)"'));

  // Output
  console.log('\n--- Output log (last 15) ---');
  console.log(await exec('tail -15 /home/propackhub/.pm2/logs/propackhub-backend-out.log 2>/dev/null || echo "(empty)"'));

  // Save
  console.log('\n--- pm2 save ---');
  console.log(await exec('pm2 save 2>&1'));

  ssh.dispose();
  console.log('\nDone.');
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
