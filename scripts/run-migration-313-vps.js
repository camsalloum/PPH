const { NodeSSH } = require('../server/node_modules/node-ssh');
const ssh = new NodeSSH();

async function runMigration() {
  try {
    console.log('Connecting to VPS...');
    await ssh.connect({
      host: 'propackhub.com',
      port: 22,
      username: 'propackhub',
      password: '***REDACTED***'
    });
    console.log('✓ Connected\n');

    console.log('=== Running Migration 313 ===');
    console.log('Creating fp_actualrmdata table...\n');
    
    const migration = await ssh.execCommand(
      'NODE_PATH=/home/propackhub/app/server/node_modules /usr/local/bin/node scripts/run-migration-313.js',
      { cwd: '/home/propackhub/app' }
    );
    
    console.log(migration.stdout);
    if (migration.stderr) {
      console.error('STDERR:', migration.stderr);
    }

    if (migration.stdout.includes('✅')) {
      console.log('\n✅ Migration successful!');
    } else {
      console.log('\n⚠ Check output above for issues');
    }

    ssh.dispose();
  } catch (error) {
    console.error('Error:', error.message);
    ssh.dispose();
  }
}

runMigration();
