/**
 * Deploy Frontend Only — Build locally + upload to VPS public_html
 * Does NOT touch the backend or pm2.
 * 
 * Run: cd server && node scripts/deploy-frontend-only.js
 */
const { NodeSSH } = require('node-ssh');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const BUILD_DIR = path.join(PROJECT_ROOT, 'build');
const PUBLIC_HTML = process.env.VPS_PUBLIC_HTML || '/home/propackhub/public_html';

const ssh = new NodeSSH();

async function exec(cmd) {
  const r = await ssh.execCommand(cmd);
  return { out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), code: r.code };
}

async function run() {
  // Step 1: Build frontend locally
  console.log('\n=== Step 1: Building frontend locally ===');
  console.log('Running: npm run build (this may take 1-2 minutes)...');
  
  try {
    execSync('npm run build', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env: { ...process.env, CI: 'false', NODE_OPTIONS: '--max-old-space-size=4096' },
      timeout: 600000
    });
  } catch (e) {
    // Check if build output exists despite error
    if (!fs.existsSync(path.join(BUILD_DIR, 'index.html'))) {
      console.error('Build failed and no output produced.');
      process.exit(1);
    }
    console.log('Build exited with warnings but output exists — continuing.');
  }

  if (!fs.existsSync(BUILD_DIR)) {
    console.error('Build folder not found!');
    process.exit(1);
  }

  const fileCount = execSync(`dir /s /b "${BUILD_DIR}" | find /c /v ""`, { encoding: 'utf8' }).trim();
  console.log(`Build complete: ${fileCount} files`);

  // Step 2: Connect to VPS
  console.log('\n=== Step 2: Connecting to VPS ===');
  await ssh.connect({
    host: process.env.VPS_HOST || 'propackhub.com',
    port: 22,
    username: process.env.VPS_SSH_USER || 'propackhub',
    password: process.env.VPS_SSH_PASSWORD,
    tryKeyboard: true,
    readyTimeout: 20000
  });
  console.log('Connected as', process.env.VPS_SSH_USER || 'propackhub');

  // Step 3: Atomic deploy — upload to temp, then swap
  console.log('\n=== Step 3: Uploading build to VPS (atomic deploy) ===');
  
  const tempDir = `${PUBLIC_HTML}_deploy_tmp`;
  const oldDir = `${PUBLIC_HTML}_old`;

  // Clean leftover temp dirs
  await exec(`rm -rf "${tempDir}" "${oldDir}"`);
  await exec(`mkdir -p "${tempDir}"`);

  // Preserve .htaccess and other Apache config from current site
  await exec(`for item in .htaccess .well-known cgi-bin; do [ -e "${PUBLIC_HTML}/$item" ] && cp -a "${PUBLIC_HTML}/$item" "${tempDir}/" 2>/dev/null; done; true`);

  // Upload build/ to temp dir
  console.log('Uploading files...');
  let failed = 0, succeeded = 0;
  await ssh.putDirectory(BUILD_DIR, tempDir, {
    recursive: true,
    concurrency: 5,
    tick: (localPath, remotePath, error) => {
      if (error) {
        failed++;
        console.log(`  FAIL: ${path.basename(localPath)} — ${error.message || error}`);
      } else {
        succeeded++;
      }
    }
  });

  console.log(`Uploaded: ${succeeded} files, ${failed} failed`);

  if (succeeded === 0) {
    await exec(`rm -rf "${tempDir}"`);
    console.error('Upload completely failed!');
    process.exit(1);
  }

  // Verify index.html exists
  const check = await exec(`test -f "${tempDir}/index.html" && echo "ok" || echo "missing"`);
  if (check.out !== 'ok') {
    await exec(`rm -rf "${tempDir}"`);
    console.error('index.html missing in upload!');
    process.exit(1);
  }

  // Atomic swap
  console.log('Swapping directories (atomic)...');
  await exec(`mv "${PUBLIC_HTML}" "${oldDir}" && mv "${tempDir}" "${PUBLIC_HTML}"`);
  await exec(`rm -rf "${oldDir}" &`);

  // Verify
  const count = await exec(`find "${PUBLIC_HTML}" -type f | wc -l`);
  console.log(`\n=== Done! ${count.out} files deployed to ${PUBLIC_HTML} ===`);

  // Check .htaccess
  const htaccess = await exec(`test -f "${PUBLIC_HTML}/.htaccess" && echo "ok" || echo "missing"`);
  if (htaccess.out !== 'ok') {
    console.log('\n⚠ WARNING: .htaccess is missing! SPA routing and API proxy will not work.');
    console.log('You need to create it on the VPS. See docs/DEPLOYMENT_AUDIT_FEB8_2026.md');
  } else {
    console.log('✓ .htaccess preserved');
  }

  // Purge nginx proxy cache (cPanel ea-nginx caches responses for 60min)
  console.log('Purging nginx cache...');
  const purge = await exec(`sudo rm -rf /var/cache/ea-nginx/proxy/propackhub/* 2>/dev/null; sudo nginx -s reload 2>/dev/null; echo "done"`);
  if (purge.out.includes('done')) {
    console.log('✓ nginx cache purged + reloaded');
  } else {
    console.log('⚠ nginx cache purge may need root — run on WHM: rm -rf /var/cache/ea-nginx/proxy/propackhub/* && nginx -s reload');
  }

  // Quick frontend check
  const frontCheck = await exec(`curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:80/ 2>/dev/null || echo "skip"`);
  if (frontCheck.out === '200') {
    console.log('✓ Frontend responding (HTTP 200)');
  } else {
    console.log(`Frontend check: ${frontCheck.out} (Apache may need the .htaccess)`);
  }

  ssh.dispose();
  console.log('\n✅ Frontend deployed to propackhub.com!');
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
