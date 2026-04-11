const path = require('path');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();

async function run(cmd, label) {
  console.log(`\n=== ${label} ===`);
  const r = await ssh.execCommand(cmd);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr && !r.stdout) console.log('STDERR:', r.stderr);
  if (!r.stdout && !r.stderr) console.log('(empty)');
  return r;
}

async function main() {
  await ssh.connect({ host: 'propackhub.com', port: 22, username: 'propackhub', password: '***REDACTED***', readyTimeout: 15000 });

  await run('cat /home/propackhub/app/server/rm-sync-progress.json 2>/dev/null', 'RM sync progress');
  await run("PGPASSWORD='***REDACTED***' psql -h localhost -U propackhub_user -d ip_auth_database -t -c \"SELECT setting_value FROM company_settings WHERE setting_key = 'rm_last_sync'\" 2>&1", 'DB metadata');
  await run('sudo pm2 logs propackhub-backend --lines 20 --nostream 2>&1 | grep -i "rm\\|sync\\|vpn\\|oracle\\|error\\|MODULE" | tail -15', 'Backend logs (sync related)');

  ssh.dispose();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
