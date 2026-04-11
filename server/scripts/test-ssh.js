const { NodeSSH } = require('node-ssh');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ssh = new NodeSSH();

async function test() {
  console.log('Connecting to', process.env.VPS_HOST, '...');
  try {
    await ssh.connect({
      host: process.env.VPS_HOST || 'propackhub.com',
      port: 22,
      username: process.env.VPS_SSH_USER || 'propackhub',
      password: process.env.VPS_SSH_PASSWORD,
      tryKeyboard: true,
      readyTimeout: 20000
    });
    console.log('SSH connected!');
    const r = await ssh.execCommand('echo "OK" && whoami && pwd');
    console.log('Output:', r.stdout);
    ssh.dispose();
    console.log('Connection test PASSED');
  } catch (e) {
    console.error('Connection FAILED:', e.message);
    process.exit(1);
  }
}
test();
