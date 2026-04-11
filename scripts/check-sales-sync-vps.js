const { NodeSSH } = require('../server/node_modules/node-ssh');
const ssh = new NodeSSH();

async function check() {
  try {
    console.log('Connecting to VPS...');
    await ssh.connect({
      host: 'propackhub.com',
      port: 22,
      username: 'propackhub',
      password: '***REDACTED***'
    });
    console.log('✓ Connected\n');

    // 1. Check current crontab
    console.log('=== Current Crontab ===');
    const cron = await ssh.execCommand('crontab -l');
    console.log(cron.stdout || 'No crontab');
    console.log('');

    // 2. Check if oracle-sync-cron.sh exists
    console.log('=== Oracle Sync Cron Script ===');
    const cronScript = await ssh.execCommand('cat scripts/oracle-sync-cron.sh 2>/dev/null || echo "FILE NOT FOUND"', { cwd: '/home/propackhub/app' });
    console.log(cronScript.stdout);
    console.log('');

    // 3. Check VPS timezone
    console.log('=== VPS Timezone ===');
    const tz = await ssh.execCommand('timedatectl | grep "Time zone"');
    console.log(tz.stdout || 'Unknown');
    const dateNow = await ssh.execCommand('date');
    console.log('Current VPS time:', dateNow.stdout);
    console.log('');

    // 4. Check oracle sync logs
    console.log('=== Oracle Sync Logs (last 20 lines) ===');
    const logs = await ssh.execCommand('tail -20 /home/propackhub/logs/oracle-sync.log 2>/dev/null || echo "No log file found"');
    console.log(logs.stdout);
    console.log('');

    // 5. Check simple-oracle-sync.js exists
    console.log('=== simple-oracle-sync.js exists? ===');
    const syncScript = await ssh.execCommand('ls -la scripts/simple-oracle-sync.js', { cwd: '/home/propackhub/app' });
    console.log(syncScript.stdout || syncScript.stderr);
    console.log('');

    // 6. Check if oracledb can be found by the script
    console.log('=== Test require oracledb ===');
    const testReq = await ssh.execCommand(
      'NODE_PATH=/home/propackhub/app/server/node_modules /usr/local/bin/node -e "require(\'oracledb\'); console.log(\'oracledb OK\')"',
      { cwd: '/home/propackhub/app' }
    );
    console.log(testReq.stdout || testReq.stderr);

    ssh.dispose();
  } catch (error) {
    console.error('Error:', error.message);
    ssh.dispose();
  }
}

check();
