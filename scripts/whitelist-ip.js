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

  // Whitelist your IP in cPHulk
  await run('sudo /usr/local/cpanel/scripts/cphulkdwhitelist 87.200.65.147', 'Whitelist 87.200.65.147');

  // Also flush login history for your IP
  await run('sudo whmapi1 flush_cphulk_login_history_for_ips ip=87.200.65.147 2>/dev/null || echo "whmapi1 not available"', 'Flush login history');

  // Also try to remove from blacklist just in case
  await run('sudo /usr/local/cpanel/scripts/cphulkdblacklist --remove 87.200.65.147 2>/dev/null || echo "not in blacklist"', 'Remove from blacklist');

  ssh.dispose();
  console.log('\nDone. Try https://148.66.152.55:2087 now.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
