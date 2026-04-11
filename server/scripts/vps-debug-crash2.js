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

  // Stop pm2 first so port is free
  await ssh.execCommand('pm2 stop propackhub-backend 2>/dev/null');
  await new Promise(r => setTimeout(r, 2000));

  // Run node index.js directly, capture EVERYTHING (stdout+stderr merged)
  // Use NODE_OPTIONS to get uncaught exception details
  console.log('Running index.js directly as propackhub...');
  const r1 = await ssh.execCommand(
    'cd /home/propackhub/app/server && NODE_OPTIONS="--unhandled-rejections=throw" node index.js 2>&1',
    { execOptions: { timeout: 15000 } }
  );
  console.log('=== OUTPUT ===');
  console.log(r1.stdout || 'no stdout');
  console.log('=== STDERR ===');
  console.log(r1.stderr || 'no stderr');
  console.log('=== EXIT CODE ===');
  console.log(r1.code);

  ssh.dispose();
})().catch(e => console.error(e.message));
