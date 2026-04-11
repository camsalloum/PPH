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

    // Check if oracledb is installed
    console.log('=== Checking oracledb installation ===');
    const check1 = await ssh.execCommand('ls -la node_modules/ | grep oracle', { cwd: '/home/propackhub/app' });
    console.log(check1.stdout || 'Not found in /home/propackhub/app/node_modules');
    
    const check2 = await ssh.execCommand('ls -la node_modules/ | grep oracle', { cwd: '/home/propackhub/app/server' });
    console.log(check2.stdout || 'Not found in /home/propackhub/app/server/node_modules');
    
    // Check package.json
    console.log('\n=== Checking package.json ===');
    const pkg = await ssh.execCommand('cat package.json | grep -A 5 dependencies', { cwd: '/home/propackhub/app' });
    console.log(pkg.stdout);

    // Install oracledb
    console.log('\n=== Installing oracledb ===');
    const install = await ssh.execCommand('npm install oracledb', { cwd: '/home/propackhub/app' });
    console.log(install.stdout);
    if (install.stderr && !install.stderr.includes('npm warn')) {
      console.error('STDERR:', install.stderr);
    }

    console.log('\n✓ Done');
    ssh.dispose();
  } catch (error) {
    console.error('Error:', error.message);
    ssh.dispose();
  }
}

check();
