/**
 * VPS restart & verify - run with: node scripts/vps-restart.js
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

  // 1. Kill old root node process
  console.log('\n=== 1. Killing old root node process ===');
  await ssh.execCommand('sudo kill $(pgrep -f "node /home/propackhub/app/server/index.js") 2>/dev/null');
  await new Promise(r => setTimeout(r, 2000));
  const portCheck = await ssh.execCommand('ss -tlnp | grep 3001 || echo "PORT 3001 IS FREE"');
  console.log(portCheck.stdout);

  // 2. Check node_modules
  console.log('\n=== 2. Checking node_modules ===');
  const nm = await ssh.execCommand(`ls ${SERVER_DIR}/node_modules | wc -l`);
  console.log(`Packages installed: ${nm.stdout.trim()}`);

  // 3. Check key dependencies
  console.log('\n=== 3. Checking key dependencies ===');
  const depsScript = `
    const deps = ['express','pg','jsonwebtoken','node-ssh','dotenv','cors','redis','bcryptjs','multer','compression'];
    deps.forEach(d => {
      try { require(d); console.log('  ' + d + ': OK'); }
      catch(e) { console.log('  ' + d + ': MISSING'); }
    });
  `;
  const deps = await ssh.execCommand(`cd ${SERVER_DIR} && node -e "${depsScript.replace(/\n/g, ' ')}"`);
  console.log(deps.stdout || deps.stderr);

  // 4. Check .env is correct
  console.log('\n=== 4. Verifying .env ===');
  const env = await ssh.execCommand(`cd ${SERVER_DIR} && node -e "require('dotenv').config(); const keys=['NODE_ENV','PORT','DB_HOST','DB_USER','DB_NAME','AUTH_DB_NAME','PLATFORM_DB_NAME','CORS_ORIGIN','JWT_SECRET']; keys.forEach(k => console.log('  '+k+'='+(k.includes('SECRET') ? process.env[k]?.substring(0,8)+'...(set)' : process.env[k]||'NOT SET')))"`);
  console.log(env.stdout || env.stderr);

  // 5. Start with pm2 as propackhub user
  console.log('\n=== 5. Starting with pm2 ===');
  const start = await ssh.execCommand(`cd ${SERVER_DIR} && pm2 start index.js --name propackhub-backend --time 2>&1`);
  console.log(start.stdout || start.stderr);

  // Wait for startup
  await new Promise(r => setTimeout(r, 4000));

  // 6. Check pm2 status
  console.log('\n=== 6. pm2 status ===');
  const pm2 = await ssh.execCommand('pm2 list 2>&1');
  console.log(pm2.stdout);

  // 7. Health check
  console.log('\n=== 7. Health check ===');
  const health = await ssh.execCommand('curl -s --max-time 10 http://localhost:3001/api/health 2>&1');
  console.log(health.stdout || 'FAILED: ' + health.stderr);

  // 8. Check pm2 logs for errors
  console.log('\n=== 8. Recent pm2 logs ===');
  const logs = await ssh.execCommand('pm2 logs propackhub-backend --lines 15 --nostream 2>&1');
  console.log(logs.stdout || logs.stderr);

  // 9. Save pm2 + setup startup
  console.log('\n=== 9. pm2 save (persist across reboots) ===');
  const save = await ssh.execCommand('pm2 save 2>&1');
  console.log(save.stdout || save.stderr);

  const startup = await ssh.execCommand('pm2 startup 2>&1');
  console.log(startup.stdout || startup.stderr);

  // 10. Check what deployment UI expects
  console.log('\n=== 10. Deployment UI compatibility check ===');
  const uiChecks = [
    ['pm2 process name', 'pm2 jlist 2>/dev/null | node -e "process.stdin.on(\'data\',d=>{const p=JSON.parse(d);console.log(p.map(x=>x.name).join(\",\"))})"'],
    ['git status', 'git -C /home/propackhub/app status --short | head -5'],
    ['public_html', 'ls /home/propackhub/public_html/ 2>&1 | head -5 || echo EMPTY'],
    ['server dir match', `test -f ${SERVER_DIR}/index.js && echo "server dir OK" || echo "server dir WRONG"`],
  ];
  for (const [label, cmd] of uiChecks) {
    const r = await ssh.execCommand(cmd);
    console.log(`  ${label}: ${(r.stdout || r.stderr || '').trim()}`);
  }

  ssh.dispose();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
