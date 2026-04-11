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

    // 1. Install missing npm packages
    console.log('=== Installing npm packages ===');
    const npmInstall = await ssh.execCommand(
      'npm install',
      { cwd: '/home/propackhub/app' }
    );
    console.log(npmInstall.stdout);
    if (npmInstall.stderr && !npmInstall.stderr.includes('npm warn')) {
      console.error('STDERR:', npmInstall.stderr);
    }
    console.log('✓ Packages installed\n');

    // 2. Test RM sync with simple query
    console.log('=== Testing RM Sync ===');
    const testResult = await ssh.execCommand(
      '/usr/local/bin/node scripts/simple-rm-sync.js',
      { cwd: '/home/propackhub/app' }
    );
    console.log(testResult.stdout);
    if (testResult.stderr) console.error('STDERR:', testResult.stderr);

    if (testResult.stdout.includes('RM SYNC COMPLETE')) {
      console.log('\n✓ RM sync test passed!\n');
    } else {
      console.error('\n⚠ RM sync may have issues, but continuing with cron setup...\n');
    }

    // 3. Make cron script executable
    console.log('=== Making cron script executable ===');
    await ssh.execCommand('chmod +x scripts/cron-rm-sync.sh', { cwd: '/home/propackhub/app' });
    console.log('✓ Script is executable\n');

    // 4. Create logs directory
    console.log('=== Creating logs directory ===');
    await ssh.execCommand('mkdir -p logs', { cwd: '/home/propackhub/app' });
    console.log('✓ Logs directory ready\n');

    // 5. Check existing crontab
    console.log('=== Checking existing crontab ===');
    const cronList = await ssh.execCommand('crontab -l 2>/dev/null || echo "No crontab"');
    console.log(cronList.stdout);

    // 6. Add cron job if not exists
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

    // 7. Verify crontab
    console.log('=== Final crontab ===');
    const finalCron = await ssh.execCommand('crontab -l');
    console.log(finalCron.stdout);

    console.log('\n✅ Setup complete!');
    console.log('\nRM sync will run every 30 minutes.');
    console.log('Logs: /home/propackhub/app/logs/rm-sync-cron.log');
    console.log('\nTo view logs: tail -f /home/propackhub/app/logs/rm-sync-cron.log');
    console.log('\nNext sync will run at the next 30-minute mark (e.g., 15:30, 16:00, 16:30...)');

    ssh.dispose();
  } catch (error) {
    console.error('Error:', error.message);
    ssh.dispose();
  }
}

setup();
