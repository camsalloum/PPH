/**
 * Setup Oracle sync cron job on VPS via SSH
 * - Uploads oracle-sync-cron.sh to VPS
 * - Creates log directory
 * - Sets up crontab for 2:00 PM daily
 */
const path = require('path');
const fs = require('fs');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();

async function main() {
  console.log('Connecting to VPS...');
  await ssh.connect({
    host: 'propackhub.com',
    port: 22,
    username: 'propackhub',
    password: '***REDACTED***',
    readyTimeout: 10000
  });
  console.log('Connected.\n');

  // Check node path
  const nodePath = await ssh.execCommand('which node');
  console.log('Node path:', nodePath.stdout.trim());
  
  const nodeVersion = await ssh.execCommand('node --version');
  console.log('Node version:', nodeVersion.stdout.trim());

  // Check timezone
  const tz = await ssh.execCommand('timedatectl 2>/dev/null || date +%Z');
  console.log('\nTimezone info:');
  console.log(tz.stdout.trim());

  // Create logs directory
  console.log('\nCreating logs directory...');
  await ssh.execCommand('mkdir -p /home/propackhub/logs');

  // Upload the cron script
  console.log('Uploading oracle-sync-cron.sh...');
  const localScript = path.join(__dirname, 'oracle-sync-cron.sh');
  const remoteScript = '/home/propackhub/app/scripts/oracle-sync-cron.sh';
  
  await ssh.putFile(localScript, remoteScript);
  await ssh.execCommand(`chmod +x ${remoteScript}`);
  console.log('Script uploaded and made executable.');

  // Verify script exists
  const verify = await ssh.execCommand(`ls -la ${remoteScript}`);
  console.log('Verify:', verify.stdout.trim());

  // Check existing crontab
  const existingCron = await ssh.execCommand('crontab -l 2>/dev/null');
  console.log('\nExisting crontab:');
  console.log(existingCron.stdout || '(empty)');

  // Add cron job (2:00 PM daily) — avoid duplicates
  const cronLine = `0 14 * * * /home/propackhub/app/scripts/oracle-sync-cron.sh >> /home/propackhub/logs/oracle-sync.log 2>&1`;
  
  if (existingCron.stdout && existingCron.stdout.includes('oracle-sync-cron.sh')) {
    console.log('\nCron job already exists — updating...');
    // Remove old oracle-sync line and add new one
    await ssh.execCommand(`(crontab -l 2>/dev/null | grep -v 'oracle-sync-cron.sh'; echo "${cronLine}") | crontab -`);
  } else {
    console.log('\nAdding cron job...');
    await ssh.execCommand(`(crontab -l 2>/dev/null; echo "${cronLine}") | crontab -`);
  }

  // Verify crontab
  const newCron = await ssh.execCommand('crontab -l');
  console.log('\nUpdated crontab:');
  console.log(newCron.stdout);

  console.log('✅ Cron job set: Oracle sync runs daily at 2:00 PM server time.');

  ssh.dispose();
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
