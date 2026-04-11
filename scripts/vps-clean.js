/**
 * VPS Cleanup Script — Wipes everything for a fresh deploy
 */
const { Client } = require(require('path').resolve(__dirname, '../server/node_modules/ssh2'));

const VPS = {
  host: 'propackhub.com',
  port: 22,
  username: 'propackhub',
  password: '***REDACTED***'
};

function sshExec(ssh, cmd) {
  return new Promise((resolve, reject) => {
    ssh.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '', stderr = '';
      stream.on('data', d => stdout += d);
      stream.stderr.on('data', d => stderr += d);
      stream.on('close', (code) => resolve({ stdout, stderr, code }));
    });
  });
}

async function main() {
  const ssh = new Client();
  
  await new Promise((resolve, reject) => {
    ssh.on('ready', resolve);
    ssh.on('error', reject);
    ssh.connect(VPS);
  });
  
  console.log('✓ Connected to VPS');
  
  const steps = [
    { label: 'Stop pm2', cmd: 'pm2 stop all 2>/dev/null; pm2 delete all 2>/dev/null; pm2 save --force 2>/dev/null; echo OK' },
    { label: 'Sudo-remove root-owned server files', cmd: 'echo ***REDACTED*** | sudo -S rm -rf /home/propackhub/server/coverage /home/propackhub/server/logs /home/propackhub/server/nginx /home/propackhub/server/tests /home/propackhub/server/node_modules 2>&1; echo OK' },
    { label: 'Remove remaining server files', cmd: 'rm -rf /home/propackhub/server/* /home/propackhub/server/.env /home/propackhub/server/.env.example 2>&1; echo OK' },
    { label: 'Remove frontend files', cmd: 'rm -rf /home/propackhub/public_html/assets /home/propackhub/public_html/libs /home/propackhub/public_html/leaflet /home/propackhub/public_html/export-libs /home/propackhub/public_html/uploads 2>&1; echo OK' },
    { label: 'Remove frontend root files', cmd: 'find /home/propackhub/public_html -maxdepth 1 -type f -delete 2>/dev/null; echo OK' },
    { label: 'Remove git repo', cmd: 'rm -rf /home/propackhub/propackhub-app 2>&1; echo OK' },
    { label: 'Verify server dir', cmd: 'echo "=== SERVER ==="; ls -la /home/propackhub/server/ 2>&1' },
    { label: 'Verify public_html', cmd: 'echo "=== PUBLIC_HTML ==="; ls -la /home/propackhub/public_html/ 2>&1' },
    { label: 'Verify pm2', cmd: 'echo "=== PM2 ==="; pm2 list 2>&1' },
  ];
  
  for (const step of steps) {
    console.log(`\n⏳ ${step.label}...`);
    const result = await sshExec(ssh, step.cmd);
    if (result.stdout.trim()) console.log(result.stdout.trim());
    if (result.stderr.trim()) console.log('STDERR:', result.stderr.trim());
  }
  
  console.log('\n✓ VPS is clean!');
  ssh.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
