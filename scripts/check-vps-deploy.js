/**
 * Check VPS deployment structure and readiness
 */
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
  await ssh.connect({
    host: 'propackhub.com', port: 22,
    username: 'propackhub', password: '***REDACTED***',
    readyTimeout: 10000
  });
  console.log('SSH connected.');

  await run('ls -la /home/propackhub/app/', 'App directory');
  await run('ls -la /home/propackhub/app/server/ | head -20', 'Server directory');
  await run('ls -la /home/propackhub/app/scripts/ | head -20', 'Scripts directory');
  await run('ls -la /home/propackhub/public_html/ | head -10', 'Public HTML');
  await run('test -d /home/propackhub/app/.git && echo "Git repo: YES" || echo "Git repo: NO"', 'Git repo check');
  await run('cd /home/propackhub/app && git remote -v 2>/dev/null', 'Git remotes');
  await run('cd /home/propackhub/app && git log --oneline -3 2>/dev/null', 'Last 3 commits');
  await run('sudo pm2 list 2>/dev/null', 'PM2 processes');
  await run('sudo pm2 jlist 2>/dev/null | node -e "const d=require(\"fs\").readFileSync(\"/dev/stdin\",\"utf8\");const p=JSON.parse(d);p.forEach(x=>console.log(x.name,x.pm2_env.status,\"pid:\"+x.pid,\"restarts:\"+x.pm2_env.restart_time))" 2>/dev/null || echo "Could not parse pm2 list"', 'PM2 status');
  await run('cat /home/propackhub/app/server/.env 2>/dev/null | head -30', 'VPS server/.env (first 30 lines)');
  await run('test -f /home/propackhub/app/server/services/VPNService.js && echo "VPNService.js: EXISTS" || echo "VPNService.js: MISSING"', 'VPNService.js check');
  await run('node --version && npm --version', 'Node/npm versions');
  await run('crontab -l 2>/dev/null', 'Crontab');
  await run('df -h / | tail -1', 'Disk space');

  ssh.dispose();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
