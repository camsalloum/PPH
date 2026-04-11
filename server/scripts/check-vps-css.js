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

  // Find the CSS file
  const r1 = await ssh.execCommand('ls -la /home/propackhub/public_html/assets/index-*.css');
  console.log('CSS files on VPS:', r1.stdout);

  // Check if kpi-cards is at depth 0
  const r2 = await ssh.execCommand("grep -ob 'kpi-cards{display:grid' /home/propackhub/public_html/assets/index-*.css");
  console.log('kpi-cards position:', r2.stdout);

  // Count @media print blocks
  const r3 = await ssh.execCommand("grep -c '@media print' /home/propackhub/public_html/assets/index-*.css");
  console.log('@media print count:', r3.stdout);

  // Check brace depth at kpi-cards position using a quick python/awk check
  const r4 = await ssh.execCommand(`python3 -c "
import sys
f = open(sys.argv[1], 'r')
content = f.read()
f.close()
needle = 'kpi-cards{display:grid'
idx = content.find(needle)
if idx == -1:
    print('NOT FOUND')
    sys.exit(1)
depth = 0
for i in range(idx):
    if content[i] == '{': depth += 1
    if content[i] == '}': depth -= 1
print(f'Brace depth at kpi-cards: {depth}')
total = 0
for c in content:
    if c == '{': total += 1
    if c == '}': total -= 1
print(f'Total brace balance: {total}')
" /home/propackhub/public_html/assets/index-*.css`);
  console.log(r4.stdout);
  if (r4.stderr) console.log('stderr:', r4.stderr);

  ssh.dispose();
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
