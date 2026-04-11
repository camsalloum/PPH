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

    // 1. Make cron script executable
    console.log('=== Making cron script executable ===');
    await ssh.execCommand('chmod +x scripts/cron-rm-sync.sh', { cwd: '/home/propackhub/app' });
    console.log('✓ Script is executable\n');

    // 2. Create logs directory
    console.log('=== Creating logs directory ===');
    await ssh.execCommand('mkdir -p logs', { cwd: '/home/propackhub/app' });
    console.log('✓ Logs directory ready\n');

    // 3. Check existing crontab
    console.log('=== Checking existing crontab ===');
    const cronList = await ssh.execCommand('crontab -l 2>/dev/null || echo "No crontab"');
    console.log(cronList.stdout);
    console.log('');

    // 4. Add cron job if not exists
    if (!cronList.stdout.includes('cron-rm-sync.sh')) {
      console.log('=== Adding RM sync cron job (every 30 minutes) ===');
      const cronLine = '*/30 * * * * /home/propackhub/app/scripts/cron-rm-sync.sh >> /home/propackhub/app/logs/rm-sync-cron.log 2>&1';
      
      // Get existing crontab and append new line
      const existingCron = cronList.stdout === 'No crontab' ? '' : cronList.stdout + '\n';
      const newCron = existingCron + cronLine;
      
      await ssh.execCommand(`echo '${newCron}' | crontab -`);
      console.log('✓ Cron job added\n');
    } else {
      console.log('=== RM sync cron job already exists ===\n');
    }

    // 5. Verify crontab
    console.log('=== Final crontab ===');
    const finalCron = await ssh.execCommand('crontab -l');
    console.log(finalCron.stdout);
    console.log('');

    // 6. Test manual sync once
    console.log('=== Running manual sync test ===');
    console.log('This will take ~10 seconds...\n');
    const syncTest = await ssh.execCommand(
      '/usr/local/bin/node scripts/simple-rm-sync.js',
      { cwd: '/home/propackhub/app' }
    );
    console.log(syncTest.stdout);
    if (syncTest.stderr && !syncTest.stderr.includes('DeprecationWarning')) {
      console.error('STDERR:', syncTest.stderr);
    }

    console.log('\n✅ Setup complete!');
    console.log('\n📋 Summary:');
    console.log('  • RM sync cron job: Every 30 minutes');
    console.log('  • Log file: /home/propackhub/app/logs/rm-sync-cron.log');
    console.log('  • Next run: At the next 30-minute mark (e.g., 15:30, 16:00, 16:30...)');
    console.log('\n📊 To view logs:');
    console.log('  tail -f /home/propackhub/app/logs/rm-sync-cron.log');

    ssh.dispose();
  } catch (error) {
    console.error('Error:', error.message);
    ssh.dispose();
  }
}

setup();
