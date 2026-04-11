const path = require('path');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();

async function run(cmd, label) {
  const r = await ssh.execCommand(cmd);
  if (label) {
    console.log(`\n[${label}]`);
    if (r.stdout) console.log(r.stdout);
    if (r.stderr) console.log('stderr:', r.stderr);
  }
  return r;
}

async function main() {
  await ssh.connect({ host: 'propackhub.com', port: 22, username: 'propackhub', password: '***REDACTED***', readyTimeout: 10000 });
  console.log('Connected.');

  // Check current .env — is DB_USER correct?
  const envCheck = await run('grep -E "DB_USER|DB_PASSWORD|NODE_ENV" /home/propackhub/app/server/.env', 'Current DB config in .env');

  // Check if .env was overwritten by git
  const envUser = await ssh.execCommand('grep "^DB_USER=" /home/propackhub/app/server/.env');
  const dbUser = envUser.stdout.trim();
  console.log('\nDB_USER line:', dbUser);

  if (dbUser.includes('postgres') || !dbUser.includes('propackhub_user')) {
    console.log('\n⚠️  .env has wrong DB_USER. Fixing...');
    // The git pull may have overwritten .env. Fix the DB credentials.
    await ssh.execCommand("sed -i 's/^DB_USER=postgres$/DB_USER=propackhub_user/' /home/propackhub/app/server/.env");
    await ssh.execCommand("sed -i 's/^DB_PASSWORD=***REDACTED***$/DB_PASSWORD=***REDACTED***/' /home/propackhub/app/server/.env");
    console.log('Fixed DB_USER and DB_PASSWORD.');
  }

  // Ensure NODE_ENV=production
  await ssh.execCommand("sed -i 's/^NODE_ENV=development$/NODE_ENV=production/' /home/propackhub/app/server/.env");

  // Check if VPN vars are still there
  const vpnCheck = await ssh.execCommand('grep VPN_GATEWAY /home/propackhub/app/server/.env');
  if (!vpnCheck.stdout.includes('VPN_GATEWAY')) {
    console.log('\n⚠️  VPN vars missing — re-adding...');
    const vpnLines = [
      '',
      '# Oracle Sync Credentials (used by simple-oracle-sync.js)',
      'ORACLE_SYNC_USER=noor',
      'ORACLE_SYNC_PASSWORD=***REDACTED***',
      'ORACLE_CONNECT_STRING=PRODDB-SCAN.ITSUPPORT.HG:1521/PRODREPDB.snetprivdb.vcnprodinfor.oraclevcn.com',
      'ORACLE_CLIENT_PATH=/usr/lib/oracle/21/client64/lib',
      '',
      '# FortiGate SSL-VPN (for Oracle ERP access from VPS)',
      'VPN_GATEWAY=5.195.104.114',
      'VPN_PORT=48443',
      'VPN_USER=camille',
      'VPN_PASSWORD=***REDACTED***',
      'VPN_TRUSTED_CERT=ae1094d5865601d0ecccd1364cc169cefa1d92babac287753f9a1effc3254c66',
    ];
    for (const line of vpnLines) {
      await ssh.execCommand(`echo '${line}' >> /home/propackhub/app/server/.env`);
    }
    console.log('VPN vars re-added.');
  }

  // Check if VPS deploy vars are still there
  const vpsCheck = await ssh.execCommand('grep VPS_SSH_PASSWORD /home/propackhub/app/server/.env');
  if (!vpsCheck.stdout.includes('VPS_SSH_PASSWORD')) {
    console.log('\n⚠️  VPS deploy vars missing — re-adding...');
    const vpsLines = [
      '',
      '# VPS Deployment (SSH)',
      'VPS_HOST=propackhub.com',
      'VPS_SSH_PORT=22',
      'VPS_SSH_USER=propackhub',
      'VPS_SSH_PASSWORD=***REDACTED***',
      'VPS_APP_DIR=/home/propackhub/app',
      'VPS_PUBLIC_HTML=/home/propackhub/public_html',
      'VPS_SERVER_DIR=/home/propackhub/app/server',
      'VPS_DB_USER=propackhub_user',
      'VPS_DB_PASSWORD=***REDACTED***',
      'GITHUB_REPO_URL=https://***REDACTED_GITHUB_PAT***@github.com/camsalloum/PPH-26.2.git',
    ];
    for (const line of vpsLines) {
      await ssh.execCommand(`echo '${line}' >> /home/propackhub/app/server/.env`);
    }
    console.log('VPS deploy vars re-added.');
  }

  // Install oracledb + pg-copy-streams in server
  console.log('\nInstalling oracledb + pg-copy-streams...');
  const npmResult = await run(
    'cd /home/propackhub/app/server && npm install oracledb pg-copy-streams dotenv 2>&1',
    'npm install'
  );

  // Restart pm2
  console.log('\nRestarting pm2...');
  await run('sudo pm2 restart propackhub-backend 2>&1', 'pm2 restart');

  // Wait and check
  await new Promise(r => setTimeout(r, 5000));

  await run('sudo pm2 logs propackhub-backend --lines 10 --nostream 2>&1', 'PM2 logs after restart');

  // Final health check
  const health = await ssh.execCommand('curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3001/api/health 2>/dev/null || echo "failed"');
  console.log('\nHealth check:', health.stdout.trim());

  // Verify .env final state
  await run('grep -E "^DB_USER=|^DB_PASSWORD=|^NODE_ENV=|^VPN_GATEWAY=|^ORACLE_SYNC_USER=" /home/propackhub/app/server/.env', 'Final .env key vars');

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
