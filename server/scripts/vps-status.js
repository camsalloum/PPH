// Quick VPS status check
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

  // pm2 status
  const pm2 = await ssh.execCommand('pm2 jlist 2>/dev/null');
  try {
    const procs = JSON.parse(pm2.stdout);
    if (procs.length === 0) {
      console.log('pm2: NO PROCESSES');
    } else {
      const p = procs[0];
      console.log('pm2 name:', p.name);
      console.log('pm2 status:', p.pm2_env.status);
      console.log('pm2 restarts:', p.pm2_env.restart_time);
      console.log('pm2 user:', p.pm2_env.username);
    }
  } catch(e) {
    console.log('pm2 raw:', pm2.stdout);
  }

  // health
  const h = await ssh.execCommand('curl -s --max-time 5 http://localhost:3001/api/health');
  console.log('\nHealth:', h.stdout || 'FAILED');

  // errors
  const err = await ssh.execCommand('tail -20 /home/propackhub/.pm2/logs/propackhub-backend-error.log 2>/dev/null');
  console.log('\nError log:', err.stdout || '(empty)');

  ssh.dispose();
}
run().catch(e => { console.error(e.message); process.exit(1); });
