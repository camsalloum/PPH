const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

(async () => {
  await ssh.connect({
    host: process.env.VPS_HOST || 'propackhub.com',
    port: parseInt(process.env.VPS_SSH_PORT || '22', 10),
    username: process.env.VPS_SSH_USER || 'propackhub',
    password: process.env.VPS_SSH_PASSWORD || '',
    readyTimeout: 15000
  });
  const run = async (cmd, label) => {
    console.log(`\n=== ${label} ===`);
    const r = await ssh.execCommand(cmd);
    console.log(r.stdout || r.stderr || '(empty)');
  };

  // Check PM2 status
  await run('sudo pm2 status 2>&1', 'PM2 Status');

  // Check PM2 recent logs
  await run('sudo pm2 logs propackhub-backend --lines 40 --nostream 2>&1', 'PM2 Recent Logs');

  // Check if any deploy/migration process is running
  await run('ps aux | grep -i "migrate\\|deploy\\|node.*migration" | grep -v grep', 'Running migration processes');

  // Check disk space
  await run('df -h / 2>&1', 'Disk Space');

  // Check if node is responsive
  await run('curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health 2>&1', 'Health check HTTP code');

  ssh.dispose();
})().catch(e => { console.error(e); process.exit(1); });
