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

  // Check ALL node processes running
  await run('ps aux | grep node | grep -v grep', 'All Node processes');

  // Check pm2 dump file (saved process list that auto-restarts)
  await run('sudo cat /root/.pm2/dump.pm2 2>/dev/null | head -50', 'PM2 dump file (root)');
  await run('cat /home/propackhub/.pm2/dump.pm2 2>/dev/null | head -50', 'PM2 dump file (propackhub)');

  // Check if there are TWO pm2 daemons (root + propackhub user)
  await run('ps aux | grep "PM2" | grep -v grep', 'PM2 Daemons');

  // Check crontab for anything starting node
  await run('sudo crontab -l 2>/dev/null || echo "no root crontab"', 'Root crontab');
  await run('crontab -l 2>/dev/null || echo "no user crontab"', 'User crontab');

  // Check systemd for any node services
  await run('sudo systemctl list-units --type=service | grep -iE "node|propack" || echo "none"', 'Node systemd services');

  // Check pm2 startup config
  await run('sudo pm2 startup 2>/dev/null | head -5', 'PM2 startup config');

  // Check ecosystem config
  await run('cat /home/propackhub/app/server/ecosystem.config.js 2>/dev/null || echo "no ecosystem file"', 'Ecosystem config');

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
