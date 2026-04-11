// Debug VPS crash with verbose output
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

  // Try loading index.js piece by piece
  console.log('=== Test 1: Just require dotenv ===');
  let r = await ssh.execCommand('cd /home/propackhub/app/server && node -e "require(\'dotenv\').config(); console.log(\'dotenv OK\')" 2>&1');
  console.log(r.stdout, r.stderr);

  console.log('\n=== Test 2: Try loading express config ===');
  r = await ssh.execCommand('cd /home/propackhub/app/server && node -e "require(\'dotenv\').config({quiet:true}); try{const e=require(\'./config/express\');console.log(\'express config OK\')}catch(e){console.error(e.message);console.error(e.stack?.split(String.fromCharCode(10)).slice(0,5).join(String.fromCharCode(10)))}" 2>&1');
  console.log(r.stdout, r.stderr);

  console.log('\n=== Test 3: Run with NODE_DEBUG ===');
  r = await ssh.execCommand('cd /home/propackhub/app/server && timeout 10 node --trace-uncaught --trace-warnings index.js 2>&1 | head -40');
  console.log(r.stdout, r.stderr);

  console.log('\n=== Test 4: Check for case-sensitive require issues ===');
  r = await ssh.execCommand("cd /home/propackhub/app/server && grep -rn \"require.*[A-Z]\" config/express.js 2>/dev/null | head -20");
  console.log(r.stdout || '(none)');

  console.log('\n=== Test 5: Check Redis connection ===');
  r = await ssh.execCommand('redis-cli ping 2>&1');
  console.log('Redis:', r.stdout || r.stderr);

  ssh.dispose();
}
run().catch(e => { console.error(e.message); process.exit(1); });
