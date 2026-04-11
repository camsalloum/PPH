const { NodeSSH } = require('../server/node_modules/node-ssh');
const ssh = new NodeSSH();

async function setup() {
  try {
    console.log('Connecting to VPS...');
    await ssh.connect({
      host: 'propackhub.com',
      port: 22,
      username: 'propackhub',
      password: '***REDACTED***'
    });
    console.log('✓ Connected\n');

    // 1. Test RM sync with 10 rows
    console.log('=== Testing RM Sync (10 rows) ===\n');
    const testResult = await ssh.execCommand(
      '/usr/local/bin/node scripts/test-rm-sync-10-rows.js',
      { cwd: '/home/propackhub/app' }
    );
    console.log(testResult.stdout);
    if (testResult.stderr) console.error('STDERR:', testResult.stderr);

    if (testResult.stdout.includes('✅ Test successful')) {
      console.log('\n✓ RM sync test passed!\n');
    } else {
      console.error('\n✗ RM sync test failed!');
      ssh.dispose();
      return;
    }

    // 2. Make cron script executable
    console.log('=== Making cron script executable ===');
    await ssh.execCommand('chmod +x scripts/cron-rm-sync.sh', { cwd: '/home/propackhub/app' });
    console.log('✓ Script is executable\n');

    // 3. Create logs directory
    console.log('=== Creating logs directory ===');
    await ssh.execCommand('mkdir -p logs', { cwd: '/home/propackhub/app' });
    console.log('✓ Logs directory ready\n');

    // 4. Check existing crontab
    console.log('=== Checking existing crontab ===');
    const cronList = await ssh.execCommand('crontab -l 2>/dev/null || echo "No crontab"');
    console.log(cronList.stdout);

    // 5. Add cron job if not exists
    if (!cronList.stdout.includes('cron-rm-sync.sh')) {
      console.log('\n=== Adding RM sync cron job (every 30 minutes) ===');
      const cronLine = '*/30 * * * * /home/propackhub/app/scripts/cron-rm-sync.sh >> /home/propackhub/app/logs/rm-sync-cron.log 2>&1';
      
      // Get existing crontab and append new line
      const existingCron = cronList.stdout === 'No crontab' ? '' : cronList.stdout + '\n';
      const newCron = existingCron + cronLine;
      
      await ssh.execCommand(`echo '${newCron}' | crontab -`);
      console.log('✓ Cron job added\n');
    } else {
      console.log('\n✓ RM sync cron job already exists\n');
    }

    // 6. Verify crontab
    console.log('=== Final crontab ===');
    const finalCron = await ssh.execCommand('crontab -l');
    console.log(finalCron.stdout);

    console.log('\n✅ Setup complete!');
    console.log('\nRM sync will run every 30 minutes.');
    console.log('Logs: /home/propackhub/app/logs/rm-sync-cron.log');
    console.log('\nTo view logs: tail -f /home/propackhub/app/logs/rm-sync-cron.log');

    ssh.dispose();
  } catch (error) {
    console.error('Error:', error.message);
    ssh.dispose();
  }
}

setup();
