const path = require('path');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();
(async () => {
  await ssh.connect({ host: 'propackhub.com', port: 22, username: 'propackhub', password: '***REDACTED***', readyTimeout: 10000 });
  await ssh.execCommand('sudo pkill -f openfortivpn 2>/dev/null');
  await new Promise(r => setTimeout(r, 2000));
  const r = await ssh.execCommand('ps aux | grep openfortivpn | grep -v grep');
  console.log('Remaining processes:', r.stdout || '(none)');
  ssh.dispose();
})();
