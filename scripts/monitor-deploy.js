const path = require('path');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();

(async () => {
  await ssh.connect({ host: 'propackhub.com', port: 22, username: 'propackhub', password: '***REDACTED***', readyTimeout: 10000 });
  console.log('SSH connected.\n');

  const checks = [
    ['Latest commits on VPS', 'cd /home/propackhub/app && git log --oneline -5'],
    ['VPNService.js', 'test -f /home/propackhub/app/server/services/VPNService.js && echo "EXISTS" || echo "MISSING"'],
    ['oracle-sync-cron.sh', 'test -f /home/propackhub/app/scripts/oracle-sync-cron.sh && echo "EXISTS" || echo "MISSING"'],
    ['PM2 Status', 'sudo pm2 list 2>/dev/null'],
    ['Backend Health', 'curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3001/api/health 2>/dev/null || echo "failed"'],
    ['Frontend index.html', 'test -f /home/propackhub/public_html/index.html && echo "EXISTS" || echo "MISSING"'],
    ['PM2 Logs (last 15)', 'sudo pm2 logs propackhub-backend --lines 15 --nostream 2>&1'],
    ['Node modules oracledb', 'test -d /home/propackhub/app/server/node_modules/oracledb && echo "INSTALLED" || echo "MISSING"'],
  ];

  for (const [label, cmd] of checks) {
    const r = await ssh.execCommand(cmd);
    console.log(`=== ${label} ===`);
    console.log(r.stdout || r.stderr || '(empty)');
    console.log('');
  }

  ssh.dispose();
})().catch(e => console.error('Error:', e.message));
