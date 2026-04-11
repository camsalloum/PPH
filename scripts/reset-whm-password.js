const path = require('path');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();

async function run(cmd, label) {
  const r = await ssh.execCommand(cmd);
  console.log(`\n=== ${label} ===`);
  console.log(r.stdout || r.stderr || '(empty)');
  return r;
}

async function main() {
  await ssh.connect({ host: 'propackhub.com', port: 22, username: 'propackhub', password: '***REDACTED***', readyTimeout: 15000 });
  console.log('Connected.');

  // Reset root password to a known value
  await run('echo "root:***REDACTED***" | sudo chpasswd', 'Reset root password');

  // Also reset admincam password
  await run('echo "admincam:***REDACTED***" | sudo chpasswd', 'Reset admincam password');

  // Verify
  await run('echo "Passwords reset. Try logging into WHM with:"', 'Info');
  console.log('\n  WHM:    https://148.66.152.55:2087');
  console.log('  User:   root');
  console.log('  Pass:   ***REDACTED***');
  console.log('\n  cPanel: https://148.66.152.55:2083');
  console.log('  User:   admincam');
  console.log('  Pass:   ***REDACTED***');

  ssh.dispose();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
