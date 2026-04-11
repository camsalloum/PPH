// Run node directly on VPS to see crash error
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

  // Stop pm2 first
  console.log('Stopping pm2...');
  await ssh.execCommand('pm2 stop all 2>/dev/null');
  await ssh.execCommand('pm2 delete all 2>/dev/null');
  await ssh.execCommand('sudo fuser -k 3001/tcp 2>/dev/null');
  await new Promise(r => setTimeout(r, 2000));

  // Run directly with timeout
  console.log('Running node directly (15s timeout)...\n');
  const r = await ssh.execCommand(
    'cd /home/propackhub/app/server && timeout 15 node index.js 2>&1',
    { timeout: 20000 }
  );
  console.log('EXIT CODE:', r.code);
  console.log('OUTPUT:');
  console.log(r.stdout);
  if (r.stderr) {
    console.log('STDERR:');
    console.log(r.stderr);
  }

  ssh.dispose();
}
run().catch(e => { console.error(e.message); process.exit(1); });
