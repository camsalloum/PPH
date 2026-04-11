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

  // List all cPanel accounts
  await run('sudo whmapi1 listaccts 2>/dev/null | grep -E "user:|domain:" | head -20', 'cPanel accounts');

  // Reset admincam password via WHM API
  await run('sudo whmapi1 passwd user=admincam password=***REDACTED*** 2>/dev/null', 'Reset admincam via whmapi1');

  // Also try propackhub user
  await run('sudo whmapi1 passwd user=propackhub password=***REDACTED*** 2>/dev/null', 'Reset propackhub via whmapi1');

  ssh.dispose();
  console.log('\nDone. Try cPanel again.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
