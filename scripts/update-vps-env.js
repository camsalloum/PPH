/**
 * Update VPS server/.env with missing VPN + Oracle sync vars
 */
const path = require('path');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();

async function main() {
  await ssh.connect({
    host: 'propackhub.com', port: 22,
    username: 'propackhub', password: '***REDACTED***',
    readyTimeout: 10000
  });
  console.log('SSH connected.');

  // Read current .env
  const current = await ssh.execCommand('cat /home/propackhub/app/server/.env');
  console.log('Current .env length:', current.stdout.length, 'chars');

  // Check what's missing
  const envContent = current.stdout;
  const missing = [];

  if (!envContent.includes('ORACLE_SYNC_USER')) missing.push('ORACLE_SYNC_USER');
  if (!envContent.includes('ORACLE_SYNC_PASSWORD')) missing.push('ORACLE_SYNC_PASSWORD');
  if (!envContent.includes('ORACLE_CONNECT_STRING')) missing.push('ORACLE_CONNECT_STRING');
  if (!envContent.includes('VPN_GATEWAY')) missing.push('VPN_GATEWAY');
  if (!envContent.includes('VPN_PORT')) missing.push('VPN_PORT');
  if (!envContent.includes('VPN_USER')) missing.push('VPN_USER');
  if (!envContent.includes('VPN_PASSWORD')) missing.push('VPN_PASSWORD');
  if (!envContent.includes('VPN_TRUSTED_CERT')) missing.push('VPN_TRUSTED_CERT');
  if (!envContent.includes('VPS_SSH_PASSWORD')) missing.push('VPS_SSH_PASSWORD');
  if (!envContent.includes('GITHUB_REPO_URL')) missing.push('GITHUB_REPO_URL');
  if (!envContent.includes('ORACLE_CLIENT_PATH')) missing.push('ORACLE_CLIENT_PATH');

  console.log('Missing vars:', missing.length > 0 ? missing.join(', ') : 'none');

  if (missing.length === 0) {
    console.log('All vars present. Nothing to do.');
    ssh.dispose();
    return;
  }

  // Build the block to append
  const newVars = [];

  if (missing.includes('ORACLE_SYNC_USER')) {
    newVars.push('');
    newVars.push('# Oracle Sync Credentials (used by simple-oracle-sync.js)');
    newVars.push('ORACLE_SYNC_USER=noor');
    newVars.push('ORACLE_SYNC_PASSWORD=***REDACTED***');
    newVars.push('ORACLE_CONNECT_STRING=PRODDB-SCAN.ITSUPPORT.HG:1521/PRODREPDB.snetprivdb.vcnprodinfor.oraclevcn.com');
  }

  if (missing.includes('ORACLE_CLIENT_PATH')) {
    newVars.push('ORACLE_CLIENT_PATH=/usr/lib/oracle/21/client64/lib');
  }

  if (missing.includes('VPN_GATEWAY')) {
    newVars.push('');
    newVars.push('# FortiGate SSL-VPN (for Oracle ERP access from VPS)');
    newVars.push('VPN_GATEWAY=5.195.104.114');
    newVars.push('VPN_PORT=48443');
    newVars.push('VPN_USER=camille');
    newVars.push('VPN_PASSWORD=***REDACTED***');
    newVars.push('VPN_TRUSTED_CERT=ae1094d5865601d0ecccd1364cc169cefa1d92babac287753f9a1effc3254c66');
  }

  if (missing.includes('VPS_SSH_PASSWORD')) {
    newVars.push('');
    newVars.push('# VPS Deployment (SSH)');
    newVars.push('VPS_HOST=propackhub.com');
    newVars.push('VPS_SSH_PORT=22');
    newVars.push('VPS_SSH_USER=propackhub');
    newVars.push('VPS_SSH_PASSWORD=***REDACTED***');
    newVars.push('VPS_APP_DIR=/home/propackhub/app');
    newVars.push('VPS_PUBLIC_HTML=/home/propackhub/public_html');
    newVars.push('VPS_SERVER_DIR=/home/propackhub/app/server');
    newVars.push('VPS_DB_USER=propackhub_user');
    newVars.push('VPS_DB_PASSWORD=***REDACTED***');
    newVars.push('GITHUB_REPO_URL=https://***REDACTED_GITHUB_PAT***@github.com/camsalloum/PPH-26.2.git');
  }

  const appendBlock = newVars.join('\n');
  console.log('\nAppending to .env:');
  console.log(appendBlock);

  // Append to .env
  await ssh.execCommand(`cat >> /home/propackhub/app/server/.env << 'ENVBLOCK'
${appendBlock}
ENVBLOCK`);

  // Also fix NODE_ENV to production
  if (envContent.includes('NODE_ENV=development')) {
    console.log('\nFixing NODE_ENV to production...');
    await ssh.execCommand("sed -i 's/NODE_ENV=development/NODE_ENV=production/' /home/propackhub/app/server/.env");
  }

  // Verify
  const updated = await ssh.execCommand('cat /home/propackhub/app/server/.env');
  console.log('\n=== Updated .env ===');
  console.log(updated.stdout);

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
