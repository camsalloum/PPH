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

  // Check what the browser actually gets
  const r1 = await ssh.execCommand('curl -s -k https://propackhub.com/ | head -20');
  console.log('=== HTTPS response (first 20 lines) ===');
  console.log(r1.stdout);

  // Check HTTP too
  const r2 = await ssh.execCommand('curl -s http://localhost/ | head -20');
  console.log('\n=== HTTP localhost response (first 20 lines) ===');
  console.log(r2.stdout);

  // Check if the CSS file is accessible
  const r3 = await ssh.execCommand('curl -s -o /dev/null -w "HTTP %{http_code}, Size: %{size_download}, Type: %{content_type}" http://localhost/assets/index-BsrQBGJs.css');
  console.log('\n=== CSS file HTTP check ===');
  console.log(r3.stdout);

  // Check the old CSS file is gone
  const r4 = await ssh.execCommand('curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost/assets/index-BDy8O8Q7.css');
  console.log('Old CSS (BDy8O8Q7):', r4.stdout);

  ssh.dispose();
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
