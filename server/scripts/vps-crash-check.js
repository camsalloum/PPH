// Check crash reason
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

  // Full error log
  console.log('=== ERROR LOG ===');
  const err = await ssh.execCommand('cat /home/propackhub/.pm2/logs/propackhub-backend-error.log 2>/dev/null | tail -50');
  console.log(err.stdout || '(empty)');

  // Full output log - look for actual crash messages
  console.log('\n=== OUTPUT LOG (filtered for errors/warnings) ===');
  const out = await ssh.execCommand('grep -iE "error|fail|crash|cannot|EADDR|EACCES|MODULE_NOT_FOUND|throw|fatal" /home/propackhub/.pm2/logs/propackhub-backend-out.log 2>/dev/null | tail -30');
  console.log(out.stdout || '(no errors in output)');

  // Check if it's actually stable NOW
  console.log('\n=== Current pm2 status ===');
  const pm2 = await ssh.execCommand('pm2 jlist 2>/dev/null');
  const procs = JSON.parse(pm2.stdout);
  const p = procs[0];
  const uptime = Date.now() - p.pm2_env.pm_uptime;
  console.log(`Status: ${p.pm2_env.status}`);
  console.log(`Uptime: ${Math.round(uptime/1000)}s`);
  console.log(`Restarts: ${p.pm2_env.restart_time}`);

  // Wait 5s and check if restarts increased
  await new Promise(r => setTimeout(r, 5000));
  const pm2b = await ssh.execCommand('pm2 jlist 2>/dev/null');
  const procs2 = JSON.parse(pm2b.stdout);
  const p2 = procs2[0];
  console.log(`\nAfter 5s:`);
  console.log(`Status: ${p2.pm2_env.status}`);
  console.log(`Restarts: ${p2.pm2_env.restart_time}`);
  console.log(`Stable: ${p2.pm2_env.restart_time === p.pm2_env.restart_time ? 'YES - not crashing anymore' : 'NO - still restarting!'}`);

  ssh.dispose();
}
run().catch(e => { console.error(e.message); process.exit(1); });
