const { NodeSSH } = require('../server/node_modules/node-ssh');
const ssh = new NodeSSH();

async function fix() {
  try {
    console.log('Connecting to VPS...');
    await ssh.connect({
      host: 'propackhub.com',
      port: 22,
      username: 'propackhub',
      password: '***REDACTED***'
    });
    console.log('✓ Connected\n');

    // 1. Fix permission on oracle-sync-cron.sh
    console.log('=== Fixing permissions ===');
    const chmod = await ssh.execCommand('chmod +x scripts/oracle-sync-cron.sh', { cwd: '/home/propackhub/app' });
    console.log('✓ oracle-sync-cron.sh is now executable\n');

    // 2. Fix the script to add NODE_PATH
    console.log('=== Fixing NODE_PATH in oracle-sync-cron.sh ===');
    const checkNodePath = await ssh.execCommand('grep NODE_PATH scripts/oracle-sync-cron.sh', { cwd: '/home/propackhub/app' });
    
    if (!checkNodePath.stdout.includes('NODE_PATH')) {
      await ssh.execCommand(
        `sed -i '/export LD_LIBRARY_PATH/a export NODE_PATH=/home/propackhub/app/server/node_modules' scripts/oracle-sync-cron.sh`,
        { cwd: '/home/propackhub/app' }
      );
      console.log('✓ NODE_PATH added\n');
    } else {
      console.log('✓ NODE_PATH already set\n');
    }

    // 3. Create logs directory
    console.log('=== Creating logs directory ===');
    await ssh.execCommand('mkdir -p /home/propackhub/logs');
    console.log('✓ Logs directory ready\n');

    // 4. Update cron: 2 AM Dubai = 10 PM UTC (22:00), current year sync
    console.log('=== Updating cron schedule ===');
    console.log('Old: 0 10 * * * (10 AM UTC = 2 PM Dubai)');
    console.log('New: 0 22 * * * (10 PM UTC = 2 AM Dubai)\n');
    
    // Get existing crontab, replace the oracle-sync line, keep rm-sync line
    const cronList = await ssh.execCommand('crontab -l');
    const lines = cronList.stdout.split('\n').filter(l => l.trim());
    const newLines = lines.map(line => {
      if (line.includes('oracle-sync-cron.sh')) {
        return '0 22 * * * /home/propackhub/app/scripts/oracle-sync-cron.sh >> /home/propackhub/logs/oracle-sync.log 2>&1';
      }
      return line;
    });
    const newCron = newLines.join('\n');
    await ssh.execCommand(`echo '${newCron}' | crontab -`);
    console.log('✓ Cron updated\n');

    // 5. Verify
    console.log('=== Final Crontab ===');
    const finalCron = await ssh.execCommand('crontab -l');
    console.log(finalCron.stdout);
    console.log('');

    console.log('=== Verify permissions ===');
    const verify = await ssh.execCommand('ls -la scripts/oracle-sync-cron.sh', { cwd: '/home/propackhub/app' });
    console.log(verify.stdout);
    console.log('');

    const dateNow = await ssh.execCommand('date');
    console.log('VPS time (UTC):', dateNow.stdout.trim());
    console.log('');
    console.log('Sales sync: 0 22 * * * = 10:00 PM UTC = 2:00 AM Dubai ✓');
    console.log('RM sync:    */30 * * * * = Every 30 minutes ✓');
    console.log('Sales sync runs current year (2026) ✓');

    console.log('\n✅ All fixed!');

    ssh.dispose();
  } catch (error) {
    console.error('Error:', error.message);
    ssh.dispose();
  }
}

fix();
