const { NodeSSH } = require('node-ssh');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const ssh = new NodeSSH();

async function run() {
  await ssh.connect({
    host: process.env.VPS_HOST || 'propackhub.com',
    port: 22,
    username: process.env.VPS_SSH_USER || 'propackhub',
    password: process.env.VPS_SSH_PASSWORD,
    tryKeyboard: true,
    readyTimeout: 20000
  });

  // 1. What CSS file is being served?
  const r1 = await ssh.execCommand('curl -s https://propackhub.com/ | grep -oP "assets/index-[^\"]+\\.css"');
  console.log('CSS referenced in HTML:', r1.stdout);

  // 2. What CSS files exist on disk?
  const r2 = await ssh.execCommand('ls /home/propackhub/public_html/assets/index-*.css');
  console.log('CSS files on disk:', r2.stdout);

  // 3. Can the CSS file be fetched via HTTP?
  const cssFile = r1.stdout.trim();
  if (cssFile) {
    const r3 = await ssh.execCommand(`curl -s -o /dev/null -w "HTTP %{http_code}, Size: %{size_download}" http://localhost/${cssFile}`);
    console.log('CSS fetch result:', r3.stdout);
  }

  // 4. Check the index.html references the NEW build
  const r4 = await ssh.execCommand('head -50 /home/propackhub/public_html/index.html | grep -i css');
  console.log('HTML CSS links:', r4.stdout);

  ssh.dispose();
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
