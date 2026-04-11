const { NodeSSH } = require('../server/node_modules/node-ssh');
const ssh = new NodeSSH();

async function test() {
  try {
    console.log('Connecting to VPS...');
    await ssh.connect({
      host: 'propackhub.com',
      port: 22,
      username: 'propackhub',
      password: '***REDACTED***'
    });
    console.log('✓ Connected\n');

    console.log('=== Testing RM Sync ===');
    console.log('This will take ~10-30 seconds...\n');
    
    const syncTest = await ssh.execCommand(
      'NODE_PATH=/home/propackhub/app/server/node_modules /usr/local/bin/node scripts/simple-rm-sync.js',
      { cwd: '/home/propackhub/app' }
    );
    
    console.log(syncTest.stdout);
    if (syncTest.stderr && !syncTest.stderr.includes('DeprecationWarning')) {
      console.error('\nSTDERR:', syncTest.stderr);
    }

    if (syncTest.stdout.includes('RM SYNC COMPLETE')) {
      console.log('\n✅ RM Sync works perfectly!');
      console.log('\nCron job is set up and will run every 30 minutes.');
      console.log('Next run: At the next 30-minute mark (e.g., 15:30, 16:00, 16:30...)');
    } else {
      console.log('\n⚠ Sync may have issues - check the output above');
    }

    ssh.dispose();
  } catch (error) {
    console.error('Error:', error.message);
    ssh.dispose();
  }
}

test();
