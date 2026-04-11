// Install compression and restart cleanly
const { NodeSSH } = require('node-ssh');
require('dotenv').config({ quiet: true });
const ssh = new NodeSSH();
const SERVER_DIR = '/home/propackhub/app/server';

async function run() {
  await ssh.connect({
    host: process.env.VPS_HOST, port: 22,
    username: process.env.VPS_SSH_USER,
    password: process.env.VPS_SSH_PASSWORD,
    tryKeyboard: true, readyTimeout: 20000
  });

  // Install compression
  console.log('Installing compression...');
  const inst = await ssh.execCommand(`cd ${SERVER_DIR} && npm install compression --production 2>&1`);
  console.log(inst.stdout.split('\n').slice(-5).join('\n'));

  // Verify
  const v = await ssh.execCommand(`cd ${SERVER_DIR} && node -e "require('compression'); console.log('compression: OK')"`);
  console.log(v.stdout);

  // Clean restart
  console.log('\nRestarting pm2...');
  await ssh.execCommand('pm2 delete all 2>/dev/null');
  await new Promise(r => setTimeout(r, 1000));
  const start = await ssh.execCommand(`cd ${SERVER_DIR} && pm2 start index.js --name propackhub-backend --time 2>&1`);
  console.log('Started');

  await new Promise(r => setTimeout(r, 6000));

  // Final check
  const pm2 = await ssh.execCommand('pm2 jlist 2>/dev/null');
  const procs = JSON.parse(pm2.stdout);
  const p = procs[0];
  console.log(`\nStatus: ${p.pm2_env.status}`);
  console.log(`Restarts: ${p.pm2_env.restart_time}`);

  const h = await ssh.execCommand('curl -s --max-time 5 http://localhost:3001/api/health');
  console.log(`Health: ${h.stdout}`);

  // Save
  const save = await ssh.execCommand('pm2 save 2>&1');
  console.log(`pm2 save: ${save.stdout.trim()}`);

  ssh.dispose();
}
run().catch(e => { console.error(e.message); process.exit(1); });
