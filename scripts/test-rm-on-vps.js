const { NodeSSH } = require('node-ssh');
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

    // Test RM sync with 10 rows
    console.log('Testing RM sync (10 rows)...\n');
    const result = await ssh.execCommand(
      'cd /home/propackhub/app && /usr/local/bin/node scripts/test-rm-sync-10-rows.js',
      { cwd: '/home/propackhub/app' }
    );

    console.log(result.stdout);
    if (result.stderr) console.error('STDERR:', result.stderr);

    ssh.dispose();
  } catch (error) {
    console.error('Error:', error.message);
    ssh.dispose();
  }
}

test();
