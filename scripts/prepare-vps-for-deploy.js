/**
 * Prepare VPS for deployment:
 * 1. Update server/.env with missing VPN + Oracle sync vars
 * 2. Fix NODE_ENV to production
 * 3. Update cron to 2PM UAE (10AM UTC)
 * 4. Re-upload oracle-sync-cron.sh
 */
const path = require('path');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();

async function run(cmd, label) {
  const r = await ssh.execCommand(cmd);
  if (label) {
    console.log(`\n[${label}]`);
    if (r.stdout) console.log(r.stdout);
    if (r.stderr && !r.stderr.includes('warn')) console.log('stderr:', r.stderr);
  }
  return r;
}

async function main() {
  console.log('Connecting to VPS...');
  await ssh.connect({
    host: 'propackhub.com', port: 22,
    username: 'propackhub', password: '***REDACTED***',
    readyTimeout: 10000
  });
  console.log('Connected.\n');

  // ── 1. Update server/.env ──
  console.log('=== Step 1: Update server/.env ===');
  const current = await ssh.execCommand('cat /home/propackhub/app/server/.env');
  const env = current.stdout;

  const varsToAdd = [];

  if (!env.includes('ORACLE_SYNC_USER')) {
    varsToAdd.push('');
    varsToAdd.push('# Oracle Sync Credentials (used by simple-oracle-sync.js)');
    varsToAdd.push('ORACLE_SYNC_USER=noor');
    varsToAdd.push('ORACLE_SYNC_PASSWORD=***REDACTED***');
    varsToAdd.push('ORACLE_CONNECT_STRING=PRODDB-SCAN.ITSUPPORT.HG:1521/PRODREPDB.snetprivdb.vcnprodinfor.oraclevcn.com');
    varsToAdd.push('ORACLE_CLIENT_PATH=/usr/lib/oracle/21/client64/lib');
  }

  if (!env.includes('VPN_GATEWAY')) {
    varsToAdd.push('');
    varsToAdd.push('# FortiGate SSL-VPN (for Oracle ERP access from VPS)');
    varsToAdd.push('VPN_GATEWAY=5.195.104.114');
    varsToAdd.push('VPN_PORT=48443');
    varsToAdd.push('VPN_USER=camille');
    varsToAdd.push('VPN_PASSWORD=***REDACTED***');
    varsToAdd.push('VPN_TRUSTED_CERT=ae1094d5865601d0ecccd1364cc169cefa1d92babac287753f9a1effc3254c66');
  }

  if (!env.includes('VPS_SSH_PASSWORD')) {
    varsToAdd.push('');
    varsToAdd.push('# VPS Deployment (SSH)');
    varsToAdd.push('VPS_HOST=propackhub.com');
    varsToAdd.push('VPS_SSH_PORT=22');
    varsToAdd.push('VPS_SSH_USER=propackhub');
    varsToAdd.push('VPS_SSH_PASSWORD=***REDACTED***');
    varsToAdd.push('VPS_APP_DIR=/home/propackhub/app');
    varsToAdd.push('VPS_PUBLIC_HTML=/home/propackhub/public_html');
    varsToAdd.push('VPS_SERVER_DIR=/home/propackhub/app/server');
    varsToAdd.push('VPS_DB_USER=propackhub_user');
    varsToAdd.push('VPS_DB_PASSWORD=***REDACTED***');
    varsToAdd.push('GITHUB_REPO_URL=https://***REDACTED_GITHUB_PAT***@github.com/camsalloum/PPH-26.2.git');
  }

  if (varsToAdd.length > 0) {
    const block = varsToAdd.join('\n');
    console.log('Adding missing vars...');
    await ssh.execCommand(`cat >> /home/propackhub/app/server/.env << 'ENVEOF'
${block}
ENVEOF`);
    console.log('Done. Added', varsToAdd.filter(v => v.includes('=')).length, 'variables.');
  } else {
    console.log('All env vars already present.');
  }

  // Fix NODE_ENV
  if (env.includes('NODE_ENV=development')) {
    console.log('Fixing NODE_ENV to production...');
    await ssh.execCommand("sed -i 's/NODE_ENV=development/NODE_ENV=production/' /home/propackhub/app/server/.env");
    console.log('Done.');
  }

  // ── 2. Upload updated cron script ──
  console.log('\n=== Step 2: Upload oracle-sync-cron.sh ===');
  const localScript = path.join(__dirname, 'oracle-sync-cron.sh');
  await ssh.putFile(localScript, '/home/propackhub/app/scripts/oracle-sync-cron.sh');
  await ssh.execCommand('chmod +x /home/propackhub/app/scripts/oracle-sync-cron.sh');
  console.log('Uploaded.');

  // ── 3. Fix cron to 10AM UTC (2PM UAE) ──
  console.log('\n=== Step 3: Update crontab (2PM UAE = 10AM UTC) ===');
  const cronLine = '0 10 * * * /home/propackhub/app/scripts/oracle-sync-cron.sh >> /home/propackhub/logs/oracle-sync.log 2>&1';
  await ssh.execCommand(`(crontab -l 2>/dev/null | grep -v 'oracle-sync-cron.sh'; echo "${cronLine}") | crontab -`);
  
  const cron = await ssh.execCommand('crontab -l');
  console.log('Crontab:', cron.stdout.trim());

  // ── 4. Create logs dir ──
  await ssh.execCommand('mkdir -p /home/propackhub/logs');

  // ── 5. Verify final .env ──
  console.log('\n=== Verification ===');
  const finalEnv = await ssh.execCommand('cat /home/propackhub/app/server/.env');
  const fe = finalEnv.stdout;
  
  const checks = [
    ['NODE_ENV=production', fe.includes('NODE_ENV=production')],
    ['ORACLE_SYNC_USER', fe.includes('ORACLE_SYNC_USER=noor')],
    ['ORACLE_CONNECT_STRING', fe.includes('ORACLE_CONNECT_STRING=')],
    ['ORACLE_CLIENT_PATH', fe.includes('ORACLE_CLIENT_PATH=')],
    ['VPN_GATEWAY', fe.includes('VPN_GATEWAY=')],
    ['VPN_TRUSTED_CERT', fe.includes('VPN_TRUSTED_CERT=')],
    ['VPS_SSH_PASSWORD', fe.includes('VPS_SSH_PASSWORD=')],
    ['GITHUB_REPO_URL', fe.includes('GITHUB_REPO_URL=')],
  ];

  let allGood = true;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? '✅' : '❌'} ${name}`);
    if (!ok) allGood = false;
  }

  if (allGood) {
    console.log('\n✅ VPS is ready for deployment. You can now push from Settings → Deploy to VPS.');
  } else {
    console.log('\n❌ Some vars are still missing. Check above.');
  }

  ssh.dispose();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
