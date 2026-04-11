/**
 * Upload existing build/ to VPS — skips rebuild.
 */
const { NodeSSH } = require('node-ssh');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BUILD_DIR = path.resolve(__dirname, '../../build');
const PUBLIC_HTML = process.env.VPS_PUBLIC_HTML || '/home/propackhub/public_html';
const ssh = new NodeSSH();

async function exec(cmd) {
  const r = await ssh.execCommand(cmd);
  return { out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

async function run() {
  if (!fs.existsSync(path.join(BUILD_DIR, 'index.html'))) {
    console.error('No build/index.html found! Run npm run build first.');
    process.exit(1);
  }
  console.log('Connecting to VPS...');
  await ssh.connect({
    host: process.env.VPS_HOST || 'propackhub.com',
    port: 22,
    username: process.env.VPS_SSH_USER || 'propackhub',
    password: process.env.VPS_SSH_PASSWORD,
    tryKeyboard: true,
    readyTimeout: 20000
  });
  console.log('Connected. Uploading build...');

  const tempDir = `${PUBLIC_HTML}_deploy_tmp`;
  const oldDir = `${PUBLIC_HTML}_old`;
  await exec(`rm -rf "${tempDir}" "${oldDir}"`);
  await exec(`mkdir -p "${tempDir}"`);
  await exec(`for item in .htaccess .well-known cgi-bin; do [ -e "${PUBLIC_HTML}/$item" ] && cp -a "${PUBLIC_HTML}/$item" "${tempDir}/" 2>/dev/null; done; true`);

  let failed = 0, succeeded = 0;
  await ssh.putDirectory(BUILD_DIR, tempDir, {
    recursive: true, concurrency: 5,
    tick: (lp, rp, err) => { if (err) { failed++; } else { succeeded++; } }
  });
  console.log(`Uploaded: ${succeeded} files, ${failed} failed`);

  const check = await exec(`test -f "${tempDir}/index.html" && echo "ok" || echo "missing"`);
  if (check.out !== 'ok') { await exec(`rm -rf "${tempDir}"`); console.error('index.html missing!'); process.exit(1); }

  await exec(`mv "${PUBLIC_HTML}" "${oldDir}" && mv "${tempDir}" "${PUBLIC_HTML}"`);
  await exec(`rm -rf "${oldDir}" &`);

  const count = await exec(`find "${PUBLIC_HTML}" -type f | wc -l`);
  const htaccess = await exec(`test -f "${PUBLIC_HTML}/.htaccess" && echo "ok" || echo "missing"`);

  // Purge nginx proxy cache (cPanel ea-nginx caches responses for 60min)
  const purge = await exec(`sudo rm -rf /var/cache/ea-nginx/proxy/propackhub/* 2>/dev/null; sudo nginx -s reload 2>/dev/null; echo "done"`);
  const cacheMsg = purge.out.includes('done') ? 'nginx cache purged' : 'cache purge may need root';

  console.log(`Done! ${count.out} files deployed. .htaccess: ${htaccess.out}. ${cacheMsg}`);
  ssh.dispose();
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
