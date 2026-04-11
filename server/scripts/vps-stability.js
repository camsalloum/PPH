// Simple stability check + find crash reason
const { NodeSSH } = require('node-ssh');
require('dotenv').config({ quiet: true });
const ssh = new NodeSSH();

async function run() {
  await ssh.connect({
    host: process.env.VPS_HOST, port: 22,
    username: process.env.VPS_SSH_USER,
    password: process.env.VPS_SSH_PASSWORD,
    tryKeyboard: true, readyTimeout: 20000
  });

  // Get restart count now
  let r1 = await ssh.execCommand('pm2 jlist 2>/dev/null');
  let p1 = JSON.parse(r1.stdout)[0];
  console.log('Restarts now:', p1.pm2_env.restart_time, '| Status:', p1.pm2_env.status);

  // Wait 10 seconds
  console.log('Waiting 10 seconds...');
  await new Promise(r => setTimeout(r, 10000));

  // Get restart count again
  let r2 = await ssh.execCommand('pm2 jlist 2>/dev/null');
  let p2 = JSON.parse(r2.stdout)[0];
  console.log('Restarts after 10s:', p2.pm2_env.restart_time, '| Status:', p2.pm2_env.status);

  if (p2.pm2_env.restart_time > p1.pm2_env.restart_time) {
    console.log('\nSTILL CRASHING! Looking for reason...');
    // Try to run node directly and capture stderr
    await ssh.execCommand('pm2 stop propackhub-backend 2>/dev/null');
    await ssh.execCommand('sudo fuser -k 3001/tcp 2>/dev/null');
    await new Promise(r => setTimeout(r, 2000));
    
    const direct = await ssh.execCommand('cd /home/propackhub/app/server && timeout 10 node index.js 2>&1');
    console.log('\nDirect node output:');
    console.log(direct.stdout.substring(0, 2000));
    if (direct.stderr) console.log('STDERR:', direct.stderr.substring(0, 1000));
  } else {
    console.log('\nSTABLE! Backend is running without crashes.');
    // Save
    await ssh.execCommand('pm2 save 2>&1');
    console.log('pm2 saved.');
  }

  ssh.dispose();
}
run().catch(e => { console.error(e.message); process.exit(1); });
