/**
 * VPS Full Backend Verification
 * Checks: databases, APIs, pm2, paths, deployment UI compatibility
 * Run: node scripts/vps-full-verify.js
 */
const { NodeSSH } = require('node-ssh');
require('dotenv').config({ quiet: true });
const ssh = new NodeSSH();

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
  console.log('Connected to VPS\n');

  const results = {};

  // ========== 1. PM2 STATUS ==========
  console.log('======== 1. PM2 STATUS ========');
  const pm2 = await exec('pm2 jlist 2>/dev/null');
  try {
    const procs = JSON.parse(pm2.out);
    if (procs.length === 0) {
      console.log('  ❌ No pm2 processes');
      results.pm2 = 'FAIL';
    } else {
      const p = procs[0];
      console.log(`  Name: ${p.name}`);
      console.log(`  Status: ${p.pm2_env.status}`);
      console.log(`  PID: ${p.pid}`);
      console.log(`  User: ${p.pm2_env.username}`);
      console.log(`  Restarts: ${p.pm2_env.restart_time}`);
      console.log(`  Uptime: ${Math.round((Date.now() - p.pm2_env.pm_uptime) / 1000)}s`);
      results.pm2 = p.pm2_env.status === 'online' ? 'OK' : 'FAIL';
    }
  } catch(e) {
    console.log('  ❌ Cannot parse pm2:', pm2.out);
    results.pm2 = 'FAIL';
  }

  // ========== 2. HEALTH CHECK ==========
  console.log('\n======== 2. HEALTH CHECK ========');
  const health = await exec('curl -s --max-time 10 http://localhost:3001/api/health');
  try {
    const h = JSON.parse(health.out);
    console.log(`  Status: ${h.status}`);
    console.log(`  Uptime: ${h.uptime}s`);
    console.log(`  Service: ${h.service}`);
    results.health = h.status === 'healthy' ? 'OK' : 'FAIL';
  } catch(e) {
    console.log('  ❌ Health check failed:', health.out || health.err);
    results.health = 'FAIL';
  }

  // ========== 3. DATABASE CONNECTIONS ==========
  console.log('\n======== 3. DATABASE CONNECTIONS ========');
  const dbs = ['fp_database', 'ip_auth_database', 'propackhub_platform'];
  for (const db of dbs) {
    const r = await exec(`PGPASSWORD='${process.env.VPS_DB_PASSWORD || ''}' psql -h localhost -U ${process.env.VPS_DB_USER || 'propackhub_user'} -d ${db} -c "SELECT count(*) as tables FROM information_schema.tables WHERE table_schema='public'" -t 2>&1`);
    const count = r.out.trim();
    if (count && !r.out.includes('FATAL') && !r.out.includes('error')) {
      console.log(`  ${db}: ✅ ${count.trim()} tables`);
      results['db_' + db] = 'OK';
    } else {
      console.log(`  ${db}: ❌ ${r.out} ${r.err}`);
      results['db_' + db] = 'FAIL';
    }
  }

  // ========== 4. API ENDPOINTS TEST ==========
  console.log('\n======== 4. KEY API ENDPOINTS ========');
  const endpoints = [
    ['GET /api/health', 'curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3001/api/health'],
    ['GET /api/settings', 'curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3001/api/settings/company'],
    ['POST /api/auth/login (no body)', 'curl -s -o /dev/null -w "%{http_code}" --max-time 5 -X POST http://localhost:3001/api/auth/login'],
    ['GET /api/deployment/status', 'curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3001/api/deployment/status'],
  ];
  for (const [name, cmd] of endpoints) {
    const r = await exec(cmd);
    const code = r.out;
    const ok = ['200','400','401','403'].includes(code); // 401/403 = auth working correctly
    console.log(`  ${name}: HTTP ${code} ${ok ? '✅' : '❌'}`);
    results['api_' + name] = ok ? 'OK' : 'FAIL';
  }

  // ========== 5. VPS PATHS vs DEPLOYMENT UI ==========
  console.log('\n======== 5. VPS PATHS vs DEPLOYMENT UI CONFIG ========');
  const paths = {
    'VPS_APP_DIR (/home/propackhub/app)': '/home/propackhub/app',
    'VPS_PUBLIC_HTML (/home/propackhub/public_html)': '/home/propackhub/public_html',
    'VPS_SERVER_DIR (/home/propackhub/app/server)': '/home/propackhub/app/server',
    'server/index.js': '/home/propackhub/app/server/index.js',
    'server/.env': '/home/propackhub/app/server/.env',
    'server/node_modules': '/home/propackhub/app/server/node_modules',
    '.git repo': '/home/propackhub/app/.git',
  };
  for (const [label, p] of Object.entries(paths)) {
    const r = await exec(`test -e ${p} && echo "EXISTS" || echo "MISSING"`);
    console.log(`  ${label}: ${r.out === 'EXISTS' ? '✅' : '❌ MISSING'}`);
    results['path_' + label] = r.out === 'EXISTS' ? 'OK' : 'FAIL';
  }

  // Compare with local .env config
  console.log('\n  Local .env deployment config:');
  console.log(`    VPS_APP_DIR=${process.env.VPS_APP_DIR || '(default: /home/propackhub/app)'}`);
  console.log(`    VPS_PUBLIC_HTML=${process.env.VPS_PUBLIC_HTML || '(default: /home/propackhub/public_html)'}`);
  console.log(`    VPS_SERVER_DIR=${process.env.VPS_SERVER_DIR || '(default)'}`);

  // ========== 6. FILE OWNERSHIP ==========
  console.log('\n======== 6. FILE OWNERSHIP ========');
  const own = await exec('ls -la /home/propackhub/app/server/index.js');
  console.log(`  index.js: ${own.out}`);
  const own2 = await exec('ls -la /home/propackhub/app/server/.env');
  console.log(`  .env: ${own2.out}`);
  const own3 = await exec('stat -c "%U:%G" /home/propackhub/app/server/index.js');
  results.ownership = own3.out === 'propackhub:propackhub' ? 'OK' : 'WARN (owned by ' + own3.out + ')';
  console.log(`  Owner: ${own3.out} ${results.ownership === 'OK' ? '✅' : '⚠️'}`);

  // ========== 7. GIT STATUS ==========
  console.log('\n======== 7. GIT STATUS ========');
  const gitLog = await exec('git -C /home/propackhub/app log --oneline -3');
  console.log(`  Latest commits:\n  ${gitLog.out.split('\n').join('\n  ')}`);
  const gitBranch = await exec('git -C /home/propackhub/app branch --show-current');
  console.log(`  Branch: ${gitBranch.out}`);
  const gitRemote = await exec('git -C /home/propackhub/app remote -v | head -1');
  console.log(`  Remote: ${gitRemote.out}`);
  results.git = gitLog.out ? 'OK' : 'FAIL';

  // ========== 8. PM2 STARTUP PERSISTENCE ==========
  console.log('\n======== 8. PM2 REBOOT PERSISTENCE ========');
  const saved = await exec('pm2 save 2>&1');
  console.log(`  pm2 save: ${saved.out}`);
  const startup = await exec('pm2 startup 2>&1 | head -3');
  console.log(`  pm2 startup: ${startup.out}`);

  // ========== 9. .ENV VERIFICATION (no secrets) ==========
  console.log('\n======== 9. VPS .ENV VERIFICATION ========');
  const env = await exec("grep -E '^[A-Z]' /home/propackhub/app/server/.env | sed 's/=.*//' | sort");
  console.log('  Keys defined:', env.out.split('\n').join(', '));
  const envCheck = await exec("cd /home/propackhub/app/server && node -e \"require('dotenv').config({quiet:true}); const required=['NODE_ENV','PORT','DB_HOST','DB_USER','DB_PASSWORD','DB_NAME','AUTH_DB_NAME','PLATFORM_DB_NAME','JWT_SECRET','JWT_REFRESH_SECRET','CORS_ORIGIN']; required.forEach(k => console.log('  '+k+': '+(process.env[k] ? 'SET' : 'MISSING')))\"");
  console.log(envCheck.out);

  // ========== 10. MISSING DEPS CHECK ==========
  console.log('\n======== 10. DEPENDENCY CHECK ========');
  const depCheck = await exec("cd /home/propackhub/app/server && node -e \"const deps=['express','pg','jsonwebtoken','node-ssh','dotenv','cors','redis','bcryptjs','multer','compression','winston','helmet','express-rate-limit','cookie-parser','archiver','unzipper']; deps.forEach(d=>{try{require(d);console.log('  '+d+': OK')}catch(e){console.log('  '+d+': MISSING')}})\"");
  console.log(depCheck.out);

  // ========== SUMMARY ==========
  console.log('\n\n========================================');
  console.log('           VERIFICATION SUMMARY');
  console.log('========================================');
  const failures = [];
  for (const [key, val] of Object.entries(results)) {
    const icon = val === 'OK' ? '✅' : val.startsWith('WARN') ? '⚠️' : '❌';
    console.log(`  ${icon} ${key}: ${val}`);
    if (val === 'FAIL') failures.push(key);
  }
  console.log('========================================');
  if (failures.length === 0) {
    console.log('  ALL CHECKS PASSED ✅');
  } else {
    console.log(`  ${failures.length} FAILURES: ${failures.join(', ')}`);
  }
  console.log('========================================');

  ssh.dispose();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
