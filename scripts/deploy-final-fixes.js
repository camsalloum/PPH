/**
 * Deploy the updated deployment.js (with /etc/hosts Oracle check) to VPS
 */
const path = require('path');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();

async function main() {
  await ssh.connect({ host: 'propackhub.com', port: 22, username: 'propackhub', password: '***REDACTED***', readyTimeout: 15000 });
  console.log('Connected.');

  await ssh.putFile(
    path.join(__dirname, '..', 'server', 'routes', 'deployment.js'),
    '/home/propackhub/app/server/routes/deployment.js'
  );
  console.log('✓ Uploaded deployment.js');

  // Restart backend to pick up the change
  const r = await ssh.execCommand('sudo pm2 restart propackhub-backend --update-env 2>&1');
  console.log(r.stdout);

  await new Promise(r => setTimeout(r, 4000));
  const health = await ssh.execCommand('curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health');
  console.log(`Health: ${health.stdout}`);

  ssh.dispose();
  console.log('Done.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
