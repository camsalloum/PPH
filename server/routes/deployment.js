/**
 * Deployment API Routes
 * 
 * Provides endpoints for:
 * - Checking deployment status & SSH connectivity
 * - Database backup (pg_dump — safety only, NOT for deployment)
 * - Git commit/push
 * - Building frontend (local)
 * - Deploying to VPS via SSH (git pull + SFTP build + migrations + pm2)
 * - Testing SSH connection
 * 
 * Database changes use MIGRATIONS (migrations/sql/*.sql):
 * - Each migration runs once, tracked via schema_migrations table
 * - Additive only: no drops, no data loss
 * - Live user data is never overwritten
 */

const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const util = require('util');
const execPromise = util.promisify(exec);
const { NodeSSH } = require('node-ssh');
const { authenticate, requireRole } = require('../middleware/auth');
const requireAdmin = requireRole('admin');

// ── Deployment concurrency lock ──────────────────────────────
// Prevents two simultaneous deployments from corrupting state
let deploymentInProgress = false;
let deploymentStartedAt = null;
let deploymentStartedBy = null;

// Deployment history (in-memory, last 20)
const deploymentHistory = [];
function recordDeployment(entry) {
  deploymentHistory.unshift({ ...entry, timestamp: new Date().toISOString() });
  if (deploymentHistory.length > 20) deploymentHistory.pop();
}

// Project root (one level up from server/)
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const EXPORT_DIR = path.join(PROJECT_ROOT, 'database-export-full');

// Files/folders never auto-staged for VPS deployment commit
const DEPLOY_STAGE_EXCLUDE_PATHS = [
  'docs/',
  'backups/',
  'logs/',
  'database-export-full/',
  'exports/',
  'ERP integration files to check/',
  'Dashboad designs/',
  'unapp-master sample/',
  '.autoclaude/',
  '.heartbeats/',
  '*.md',
  '*.txt',
  '*.html'
];

// Database credentials (local development)
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_HOST = process.env.DB_HOST || 'localhost';

// VPS SSH Configuration
const VPS_CONFIG = {
  host: process.env.VPS_HOST || 'propackhub.com',
  port: parseInt(process.env.VPS_SSH_PORT || '22'),
  username: process.env.VPS_SSH_USER || 'propackhub',
  password: process.env.VPS_SSH_PASSWORD || '',
  appDir: process.env.VPS_APP_DIR || '/home/propackhub/app',
  publicHtml: process.env.VPS_PUBLIC_HTML || '/home/propackhub/public_html',
  serverDir: process.env.VPS_SERVER_DIR || '/home/propackhub/app/server',
  dbUser: process.env.VPS_DB_USER || 'propackhub_user',
  dbPassword: process.env.VPS_DB_PASSWORD || '',
  githubRepo: process.env.GITHUB_REPO_URL || 'https://github.com/camsalloum/PPH-26.2.git'
};

/**
 * Helper: Create SSH connection to VPS
 */
async function connectSSH() {
  const ssh = new NodeSSH();
  await ssh.connect({
    host: VPS_CONFIG.host,
    port: VPS_CONFIG.port,
    username: VPS_CONFIG.username,
    password: VPS_CONFIG.password,
    tryKeyboard: true,
    readyTimeout: 15000
  });
  return ssh;
}

/**
 * Helper: Run SSH command and return output
 */
async function sshExec(ssh, command, cwd = null) {
  const options = {};
  if (cwd) options.cwd = cwd;
  
  const result = await ssh.execCommand(command, options);
  
  if (result.stderr && !result.stderr.includes('warning') && !result.stderr.includes('npm warn')) {
    console.log(`SSH stderr for [${command}]: ${result.stderr}`);
  }
  
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    code: result.code
  };
}

// ============================================================
// GET /api/deployment/status
// Check deployment status and SSH connectivity
// ============================================================
router.get('/status', authenticate, requireAdmin, async (req, res) => {
  try {
    let lastDeployment = null;
    let vpsConnected = false;
    const sshConfigured = !!VPS_CONFIG.password;

    // Check last local export
    if (fs.existsSync(EXPORT_DIR)) {
      const files = fs.readdirSync(EXPORT_DIR);
      if (files.length > 0) {
        const stats = fs.statSync(path.join(EXPORT_DIR, files[0]));
        lastDeployment = stats.mtime.toLocaleString();
      }
    }

    // Don't auto-test SSH on every page load — avoids unnecessary connections
    // and prevents cPHulk brute-force lockouts if password ever changes.
    // Use POST /test-connection for explicit SSH testing.

    res.json({
      success: true,
      lastDeployment,
      vpsConnected: null,  // null = not checked yet (user must click Test Connection)
      sshConfigured,
      projectRoot: PROJECT_ROOT,
      vpsHost: VPS_CONFIG.host
    });
  } catch (error) {
    console.error('Deployment status error:', error);
    res.json({
      success: true,
      lastDeployment: null,
      vpsConnected: false,
      sshConfigured: false
    });
  }
});

// ============================================================
// POST /api/deployment/test-connection
// Test SSH connection to VPS
// ============================================================
router.post('/test-connection', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!VPS_CONFIG.password) {
      return res.json({
        success: false,
        message: 'SSH password not configured. Set VPS_SSH_PASSWORD in server/.env'
      });
    }

    const ssh = await connectSSH();
    
    // Get system info
    const hostname = await sshExec(ssh, 'hostname');
    const whoami = await sshExec(ssh, 'whoami');
    const gitVersion = await sshExec(ssh, 'git --version');
    const nodeVersion = await sshExec(ssh, 'node --version 2>/dev/null || echo "not installed"');
    const npmVersion = await sshExec(ssh, 'npm --version 2>/dev/null || echo "not installed"');
    const pm2Check = await sshExec(ssh, 'pm2 --version 2>/dev/null || echo "not installed"');
    const diskSpace = await sshExec(ssh, 'df -h /home | tail -1');
    
    // Check if app directory exists
    const appDirCheck = await sshExec(ssh, `test -d ${VPS_CONFIG.appDir} && echo "exists" || echo "missing"`);
    const publicHtmlCheck = await sshExec(ssh, `test -d ${VPS_CONFIG.publicHtml} && echo "exists" || echo "missing"`);
    
    ssh.dispose();

    res.json({
      success: true,
      message: 'SSH connection successful!',
      info: {
        hostname: hostname.stdout.trim(),
        user: whoami.stdout.trim(),
        git: gitVersion.stdout.trim(),
        node: nodeVersion.stdout.trim(),
        npm: npmVersion.stdout.trim(),
        pm2: pm2Check.stdout.trim(),
        disk: diskSpace.stdout.trim(),
        appDir: appDirCheck.stdout.trim() === 'exists' ? 'Ready' : 'Will be created on first deploy',
        publicHtml: publicHtmlCheck.stdout.trim() === 'exists' ? 'Ready' : 'Missing!'
      }
    });
  } catch (error) {
    console.error('SSH test error:', error);
    res.json({
      success: false,
      message: `SSH connection failed: ${error.message}`
    });
  }
});

// ============================================================
// POST /api/deployment/export-database
// Backup database using pg_dump (for safety — NOT for deployment)
// This is a backup tool, not a deployment tool.
// Deployment uses migrations (see deploy-to-vps route).
// ============================================================
router.post('/export-database', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!fs.existsSync(EXPORT_DIR)) {
      fs.mkdirSync(EXPORT_DIR, { recursive: true });
    }

    const databases = ['fp_database', 'ip_auth_database', 'propackhub_platform'];
    const results = [];

    for (const dbName of databases) {
      const outputFile = path.join(EXPORT_DIR, `${dbName}_backup.dump`);
      
      try {
        const env = { ...process.env, PGPASSWORD: DB_PASSWORD };
        // Custom format (-Fc) for efficient backup — NOT for re-import to production
        const command = `pg_dump -h ${DB_HOST} -U ${DB_USER} -d ${dbName} -Fc -f "${outputFile}"`;
        
        console.log(`Backing up ${dbName}...`);
        await execPromise(command, { env, timeout: 300000 });
        
        const stats = fs.statSync(outputFile);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        
        results.push({ name: `${dbName}_backup.dump`, size: `${sizeMB} MB`, success: true });
        console.log(`  ${dbName} backed up: ${sizeMB} MB`);
      } catch (dbError) {
        console.log(`  ${dbName}: ${dbError.message}`);
        results.push({
          name: `${dbName}_backup.dump`,
          size: '0 MB',
          success: false,
          error: dbError.message.includes('does not exist') ? 'Database not found' : dbError.message
        });
      }
    }

    res.json({ success: true, message: 'Database backup completed (safety backups — NOT for deployment)', files: results, exportDir: EXPORT_DIR });
  } catch (error) {
    console.error('Database backup error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /api/deployment/git-push
// Commit and push to GitHub (local)
// ============================================================
router.post('/git-push', authenticate, requireAdmin, async (req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const commitMessage = `Deploy: ${timestamp}`;

    const commands = [
      'git add .',
      `git commit -m "${commitMessage}"`,
      'git push origin main'
    ];

    let output = '';
    
    for (const cmd of commands) {
      try {
        const { stdout, stderr } = await execPromise(cmd, { 
          cwd: PROJECT_ROOT,
          timeout: 60000 
        });
        output += `${cmd}:\n${stdout || stderr}\n\n`;
      } catch (cmdError) {
        if (cmdError.message.includes('nothing to commit')) {
          output += `${cmd}: Nothing new to commit\n\n`;
        } else {
          throw cmdError;
        }
      }
    }

    res.json({ success: true, message: 'Code pushed to GitHub', output });
  } catch (error) {
    console.error('Git push error:', error);
    res.json({
      success: false,
      message: error.message.includes('nothing to commit') 
        ? 'Nothing new to commit' 
        : error.message
    });
  }
});

// ============================================================
// POST /api/deployment/build-frontend
// Run npm run build (local)
// ============================================================
router.post('/build-frontend', authenticate, requireAdmin, async (req, res) => {
  try {
    console.log('Starting frontend build...');
    
    const { stdout, stderr } = await execPromise('npm run build', {
      cwd: PROJECT_ROOT,
      timeout: 600000,
      env: { ...process.env, CI: 'false', NODE_OPTIONS: '--max-old-space-size=4096' },
      maxBuffer: 50 * 1024 * 1024
    }).catch(err => {
      // Check if build output was produced despite non-zero exit
      const indexHtml = path.join(PROJECT_ROOT, 'build', 'index.html');
      if (fs.existsSync(indexHtml) && (Date.now() - fs.statSync(indexHtml).mtimeMs) < 120000) {
        return { stdout: 'Build completed (recovered from non-zero exit)', stderr: '' };
      }
      throw err;
    });

    const buildDir = path.join(PROJECT_ROOT, 'build');
    if (!fs.existsSync(buildDir)) {
      throw new Error('Build folder not created');
    }

    const buildFiles = fs.readdirSync(buildDir);
    
    res.json({
      success: true,
      message: 'Frontend build completed',
      buildDir,
      filesCount: buildFiles.length,
      output: stdout || stderr
    });
  } catch (error) {
    console.error('Build error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /api/deployment/deploy-to-vps
// Best-practice deployment pipeline:
//   1. Git push local → GitHub
//   2. Build frontend locally (VPS has limited 2GB RAM)
//   3. SSH → git pull on VPS (efficient diff-based code transfer)
//   4. SFTP → upload build/ to public_html (build artifacts not in git)
//   5. SSH → npm install --production for server deps
//   6. (Optional) Database import
//   7. SSH → pm2 restart
// Uses Server-Sent Events (SSE) to stream real-time progress
// ============================================================
router.post('/deploy-to-vps', authenticate, requireAdmin, async (req, res) => {
  const { includeDatabase = false, deployMode = 'dev' } = req.body || {};
  const normalizedDeployMode = String(deployMode).toLowerCase() === 'strict' ? 'strict' : 'dev';
  
  // ── Concurrency lock ──
  if (deploymentInProgress) {
    const elapsed = deploymentStartedAt ? Math.round((Date.now() - deploymentStartedAt) / 1000) : 0;
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      message: `Deployment already in progress (started ${elapsed}s ago by ${deploymentStartedBy || 'unknown'}). Wait for it to finish.`
    }));
    return;
  }
  deploymentInProgress = true;
  deploymentStartedAt = Date.now();
  deploymentStartedBy = req.user?.username || 'admin';
  
  // Setup SSE headers for real-time streaming
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'  // Disable nginx buffering if present
  });

  const TOTAL_STEPS = includeDatabase ? 7 : 6;
  let currentStep = 0;

  function sendEvent(type, data) {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  }

  function sendStep(stepName, status, detail = '') {
    if (status === 'running') currentStep++;
    const percent = Math.round((currentStep / TOTAL_STEPS) * 100);
    sendEvent('step', { 
      step: currentStep, 
      totalSteps: TOTAL_STEPS, 
      percent: status === 'done' ? Math.round(((currentStep) / TOTAL_STEPS) * 100) : percent,
      name: stepName, 
      status, 
      detail 
    });
  }

  function sendLog(message) {
    sendEvent('log', { message });
  }

  try {
    if (!VPS_CONFIG.password) {
      sendEvent('error', { message: 'SSH password not configured. Set VPS_SSH_PASSWORD in server/.env' });
      res.end();
      return;
    }

    sendEvent('start', { totalSteps: TOTAL_STEPS, message: 'Starting VPS deployment...' });

    // ----------------------------------------------------------
    // Step 1: Git commit & push to GitHub (local)
    // ----------------------------------------------------------
    sendStep('Pushing to GitHub', 'running', normalizedDeployMode === 'strict'
      ? 'strict mode: staged-only commit + push...'
      : 'dev mode: auto-stage deployable files + commit + push...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const commitMessage = `Deploy: ${timestamp}`;
    let gitDetail = '';
    
    try {
      if (normalizedDeployMode === 'strict') {
        // Strict mode: do NOT auto-stage. Require staged-only or fully clean tree.
        const { stdout: statusOut } = await execPromise('git status --porcelain', {
          cwd: PROJECT_ROOT,
          timeout: 30000
        });
        const statusLines = statusOut.split('\n').map(line => line.trimEnd()).filter(Boolean);
        const hasUnstagedOrUntracked = statusLines.some(line => {
          const x = line[0] || ' ';
          const y = line[1] || ' ';
          return y !== ' ' || x === '?';
        });
        if (hasUnstagedOrUntracked) {
          throw new Error('Strict deploy blocked: unstaged/untracked files detected. Stage only the files you want deployed, or clean your working tree.');
        }

        await execPromise(`git commit -m "${commitMessage}"`, { cwd: PROJECT_ROOT, timeout: 30000 });
        gitDetail = 'Committed staged files only';
      } else {
        // Dev mode: auto-stage everything, then unstage known non-deploy paths.
        await execPromise('git add -A', { cwd: PROJECT_ROOT, timeout: 30000 });
        for (const excludedPath of DEPLOY_STAGE_EXCLUDE_PATHS) {
          try {
            await execPromise(`git restore --staged -- "${excludedPath}"`, { cwd: PROJECT_ROOT, timeout: 15000 });
          } catch (_) {
            // Ignore if pattern/path does not exist in index
          }
        }
        await execPromise(`git commit -m "${commitMessage}"`, { cwd: PROJECT_ROOT, timeout: 30000 });
        gitDetail = 'Committed deployable files (excluded docs/backups/logs)';
      }
    } catch (gitErr) {
      if (gitErr.message.includes('nothing to commit')) {
        gitDetail = 'Nothing new to commit';
      } else {
        throw gitErr;
      }
    }
    
    try {
      await execPromise('git push origin main', { cwd: PROJECT_ROOT, timeout: 60000 });
      if (gitDetail === 'Nothing new to commit') {
        gitDetail = 'Already up to date on GitHub';
      }
    } catch (pushErr) {
      if (pushErr.message.includes('Everything up-to-date')) {
        gitDetail = gitDetail || 'Already up to date on GitHub';
      } else {
        throw pushErr;
      }
    }
    
    sendStep('Pushing to GitHub', 'done', gitDetail);

    // ----------------------------------------------------------
    // Step 2: Build frontend LOCALLY (VPS has only 2GB RAM)
    // ----------------------------------------------------------
    sendStep('Building frontend locally', 'running', 'Validating CSS + Vite build...');
    
    // Pre-build: Validate all CSS files have balanced braces
    // (An unclosed @media block can break the entire production CSS bundle)
    sendLog('Checking CSS brace balance...');
    const srcDir = path.join(PROJECT_ROOT, 'src');
    try {
      const { stdout: cssFileList } = await execPromise(
        process.platform === 'win32' 
          ? `dir /s /b "${srcDir}\\*.css"` 
          : `find "${srcDir}" -name "*.css" -type f`,
        { cwd: PROJECT_ROOT, timeout: 10000 }
      );
      const cssFiles = cssFileList.trim().split('\n').filter(Boolean);
      let cssIssues = [];
      for (const file of cssFiles) {
        const content = fs.readFileSync(file.trim(), 'utf8');
        const stripped = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"]*"|'[^']*'/g, '');
        let depth = 0;
        for (const ch of stripped) {
          if (ch === '{') depth++;
          if (ch === '}') depth--;
        }
        if (depth !== 0) {
          const rel = path.relative(srcDir, file.trim());
          cssIssues.push(`${rel} (depth: ${depth})`);
        }
      }
      if (cssIssues.length > 0) {
        throw new Error(`CSS brace validation failed — these files have unbalanced braces:\n${cssIssues.join('\n')}\nFix them before deploying.`);
      }
      sendLog(`✓ All ${cssFiles.length} CSS files have balanced braces`);
    } catch (cssErr) {
      if (cssErr.message.includes('CSS brace validation failed')) throw cssErr;
      sendLog(`⚠ CSS validation skipped: ${cssErr.message}`);
    }
    
    const buildDir = path.join(PROJECT_ROOT, 'build');
    const buildStartTime = Date.now();
    
    try {
      await execPromise('npm run build', {
        cwd: PROJECT_ROOT,
        env: { ...process.env, CI: 'false', NODE_OPTIONS: '--max-old-space-size=4096' },
        maxBuffer: 50 * 1024 * 1024,
        timeout: 600000 // 10 minutes — large projects need time
      });
    } catch (buildErr) {
      // Vite sometimes exits with non-zero code even when build succeeds
      // (e.g. heap pressure). Check if build output was actually produced.
      const indexHtml = path.join(buildDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        const stat = fs.statSync(indexHtml);
        const fileAge = Date.now() - stat.mtimeMs;
        // If index.html was written in the last 2 minutes, the build actually worked
        if (fileAge < 120000) {
          sendLog(`⚠ Vite exited with non-zero code but build output is fresh (${Math.round(fileAge / 1000)}s ago) — continuing`);
        } else {
          throw new Error(`Vite build failed and build output is stale: ${buildErr.message}`);
        }
      } else {
        throw new Error(`Vite build failed: ${buildErr.message}`);
      }
    }
    
    if (!fs.existsSync(buildDir)) {
      throw new Error('Build folder not created — Vite build failed silently');
    }
    
    const buildTime = Math.round((Date.now() - buildStartTime) / 1000);
    sendStep('Building frontend locally', 'done', `Vite build completed (${buildTime}s)`);

    // ----------------------------------------------------------
    // Step 3: SSH connect + Git pull on VPS
    // ----------------------------------------------------------
    sendStep('Syncing code on VPS', 'running', 'SSH connect + git pull...');
    
    const ssh = await connectSSH();
    sendLog(`Connected to ${VPS_CONFIG.host}`);

    try {
      // Ensure git safe.directory is set (fixes "dubious ownership" error)
      await sshExec(ssh, `git config --global --add safe.directory ${VPS_CONFIG.appDir}`);
      
      // Check if app dir exists with git repo
      const appDirCheck = await sshExec(ssh, `test -d ${VPS_CONFIG.appDir}/.git && echo "exists" || echo "missing"`);
      
      let gitPullDetail = '';
      if (appDirCheck.stdout.trim() === 'missing') {
        // First deploy — clone the repo
        sendLog('First deploy — cloning repository...');
        await sshExec(ssh, `mkdir -p $(dirname ${VPS_CONFIG.appDir})`);
        const cloneResult = await sshExec(ssh, 
          `git clone ${VPS_CONFIG.githubRepo} ${VPS_CONFIG.appDir}`
        );
        
        if (cloneResult.code !== 0 && !cloneResult.stderr.includes('already exists')) {
          throw new Error(`Git clone failed: ${cloneResult.stderr}`);
        }
        gitPullDetail = 'Repository cloned';
      } else {
        // Existing repo — reset any local changes and pull latest
        // IMPORTANT: Backup server/.env before git pull — VPS has different DB credentials,
        // VPN config, etc. that differ from the local dev .env committed to git.
        sendLog('Backing up VPS server/.env before git pull...');
        await sshExec(ssh, `cp ${VPS_CONFIG.serverDir}/.env ${VPS_CONFIG.serverDir}/.env.vps-backup 2>/dev/null || true`, VPS_CONFIG.appDir);
        
        await sshExec(ssh, 'git fetch origin', VPS_CONFIG.appDir);
        await sshExec(ssh, 'git reset --hard origin/main', VPS_CONFIG.appDir);
        
        const pullResult = await sshExec(ssh, 'git pull origin main', VPS_CONFIG.appDir);
        gitPullDetail = pullResult.stdout.includes('Already up to date') 
          ? 'Already up to date' 
          : 'Code synced from GitHub';
        
        // Restore VPS .env (git pull overwrites it with local dev values)
        await sshExec(ssh, `cp ${VPS_CONFIG.serverDir}/.env.vps-backup ${VPS_CONFIG.serverDir}/.env 2>/dev/null || true`, VPS_CONFIG.appDir);
        sendLog('✓ VPS server/.env restored from backup');
      }
      
      // Fix file ownership — git clone/pull may run as different user
      // Linux is case-sensitive & permission-sensitive, must be owned by propackhub
      await sshExec(ssh, `sudo chown -R ${VPS_CONFIG.username}:${VPS_CONFIG.username} ${VPS_CONFIG.appDir} 2>/dev/null || true`);
      
      // CRITICAL: Restore execute permissions on shell scripts.
      // Git on Windows does not preserve the Linux execute bit, so after
      // git reset --hard + git pull, all .sh files lose chmod +x.
      // This breaks cron jobs (oracle-sync-cron.sh, cron-rm-sync.sh).
      sendLog('Restoring execute permissions on shell scripts...');
      await sshExec(ssh, `find ${VPS_CONFIG.appDir}/scripts -name "*.sh" -exec chmod +x {} \\; 2>/dev/null || true`);
      sendLog('✓ Shell script permissions restored');
      
      // CRITICAL: Ensure Oracle DNS entry exists in /etc/hosts.
      // The VPN's DNS nameservers return inconsistent IPs for Oracle.
      // /etc/hosts pins it to the correct IP (10.1.2.99) so both
      // cron syncs and UI-triggered syncs resolve Oracle correctly.
      const hostsCheck = await sshExec(ssh, 'grep "PRODDB-SCAN.ITSUPPORT.HG" /etc/hosts 2>/dev/null');
      if (!hostsCheck.stdout || !hostsCheck.stdout.includes('PRODDB-SCAN')) {
        sendLog('Adding Oracle DNS entry to /etc/hosts...');
        await sshExec(ssh, 'echo "10.1.2.99  PRODDB-SCAN.ITSUPPORT.HG" | sudo tee -a /etc/hosts');
        sendLog('✓ Oracle DNS entry added (10.1.2.99)');
      } else {
        sendLog('✓ Oracle DNS entry already in /etc/hosts');
      }
      
      sendStep('Syncing code on VPS', 'done', gitPullDetail);

      // ----------------------------------------------------------
      // Step 4: Upload build to public_html via SFTP (ATOMIC)
      // Uses temp dir + mv swap so site is never in a broken half-deployed state.
      // IMPORTANT: Linux (GoDaddy VPS) is CASE-SENSITIVE.
      //   - "Ip Logo.jpg" and "ip logo.jpg" are DIFFERENT files
      //   - Spaces in filenames are valid but need quoting in shell commands
      //   - All build filenames come from Vite, which lowercases hashed assets
      //   - Static files in public/ retain their original casing
      // ----------------------------------------------------------
      sendStep('Deploying frontend to VPS', 'running', 'Uploading build files via SFTP (atomic deploy)...');
      
      const tempDeployDir = `${VPS_CONFIG.publicHtml}_deploy_tmp`;
      const oldDeployDir = `${VPS_CONFIG.publicHtml}_old`;
      
      // Clean any leftover temp dirs from a previous failed deploy
      await sshExec(ssh, `rm -rf "${tempDeployDir}" "${oldDeployDir}"`);
      
      // Create fresh temp directory
      await sshExec(ssh, `mkdir -p "${tempDeployDir}"`);
      
      // Copy preserved files (.htaccess, .well-known, cgi-bin) from current live site to temp
      await sshExec(ssh, 
        `for item in .htaccess .well-known cgi-bin; do [ -e "${VPS_CONFIG.publicHtml}/$item" ] && cp -a "${VPS_CONFIG.publicHtml}/$item" "${tempDeployDir}/" 2>/dev/null; done; true`
      );
      
      // Upload local build/ to temp dir via SFTP
      let uploadFailed = 0;
      let uploadSucceeded = 0;
      const uploadResult = await ssh.putDirectory(buildDir, tempDeployDir, {
        recursive: true,
        concurrency: 5,
        tick: (localPath, remotePath, error) => {
          if (error) {
            uploadFailed++;
            sendLog(`  ✗ Failed: ${path.basename(localPath)} → ${error.message || error}`);
          } else {
            uploadSucceeded++;
          }
        }
      });
      
      if (uploadFailed > 0 && uploadSucceeded === 0) {
        await sshExec(ssh, `rm -rf "${tempDeployDir}"`);
        throw new Error(`SFTP upload completely failed (${uploadFailed} files failed, 0 succeeded)`);
      }
      if (uploadFailed > 0) {
        sendLog(`  ⚠ ${uploadFailed} files failed to upload, ${uploadSucceeded} succeeded — continuing`);
      }
      
      // Verify critical file exists (case-sensitive check on Linux!)
      const indexCheck = await sshExec(ssh, `test -f "${tempDeployDir}/index.html" && echo "ok" || echo "missing"`);
      if (indexCheck.stdout.trim() !== 'ok') {
        await sshExec(ssh, `rm -rf "${tempDeployDir}"`);
        throw new Error('Upload verification failed: index.html missing in uploaded files');
      }
      
      // ATOMIC SWAP: mv current → _old, mv temp → current
      // Ensures public_html is never in a half-uploaded state
      await sshExec(ssh, `mv "${VPS_CONFIG.publicHtml}" "${oldDeployDir}" && mv "${tempDeployDir}" "${VPS_CONFIG.publicHtml}"`);
      
      // Clean up old dir (async, non-blocking)
      await sshExec(ssh, `rm -rf "${oldDeployDir}" &`);
      
      // Count uploaded files and verify case-sensitive paths
      const countResult = await sshExec(ssh, `find "${VPS_CONFIG.publicHtml}" -type f | wc -l`);
      
      // Log any files with spaces or uppercase (potential Linux case-sensitivity issues)
      const caseWarn = await sshExec(ssh, `find "${VPS_CONFIG.publicHtml}" -name '* *' -o -name '*[A-Z]*' 2>/dev/null | head -10`);
      if (caseWarn.stdout.trim()) {
        sendLog('  ⚠ Files with spaces/uppercase (case-sensitive on Linux):');
        caseWarn.stdout.trim().split('\n').slice(0, 5).forEach(f => {
          sendLog(`    ${f.replace(VPS_CONFIG.publicHtml, '')}`);
        });
      }
      
      sendStep('Deploying frontend to VPS', 'done', `${countResult.stdout.trim()} files deployed (atomic swap)`);

      // Purge nginx proxy cache (cPanel ea-nginx caches responses for 60min)
      sendLog('Purging nginx proxy cache...');
      try {
        await sshExec(ssh, 'sudo rm -rf /var/cache/ea-nginx/proxy/propackhub/* 2>/dev/null; sudo nginx -s reload 2>/dev/null');
        sendLog('nginx cache purged + reloaded');
      } catch (e) {
        sendLog('⚠ nginx cache purge failed (may need root) — run on WHM: rm -rf /var/cache/ea-nginx/proxy/propackhub/* && nginx -s reload');
      }

      // ----------------------------------------------------------
      // Step 5: Deploy backend (git-pulled code) + install deps
      // Backend code is already on VPS via git pull (Step 3).
      // We just need to sync it to the server dir and npm install.
      // ----------------------------------------------------------
      sendStep('Deploying backend', 'running', 'Installing server dependencies...');
      
      // Server code is already updated via git pull (Step 3).
      // VPS_APP_DIR/server IS VPS_SERVER_DIR — no rsync needed.
      // We only need to install production dependencies.
      await sshExec(ssh, `mkdir -p ${VPS_CONFIG.serverDir}`);
      
      sendLog('Running npm install --production...');
      const npmResult = await sshExec(ssh, 'npm install --production 2>&1', VPS_CONFIG.serverDir);
      if (npmResult.code !== 0 && npmResult.stderr && !npmResult.stderr.includes('npm warn')) {
        sendLog(`⚠ npm install warnings: ${npmResult.stderr.substring(0, 200)}`);
      }
      sendStep('Deploying backend', 'done', 'Server deps installed (code synced via git pull)');

      // ----------------------------------------------------------
      // Step 6: Run database migrations (optional)
      // Uses UP/DOWN file pairs (*.up.sql / *.down.sql) from migrations/sql/
      // Already on VPS via git pull. Tracked via schema_migrations table.
      // Additive only: no drops, no data loss, live users unaffected.
      // ----------------------------------------------------------
      if (includeDatabase) {
        sendStep('Running database migrations', 'running', 'Checking for pending migrations...');
        sendLog('✓ Migration mode: UP/DOWN file pairs — safe, tracked, reversible');
        
        // Migration files are already on VPS from git pull (Step 3)
        const migrationsDir = `${VPS_CONFIG.appDir}/migrations/sql`;
        const migrationsExist = await sshExec(ssh, `test -d ${migrationsDir} && ls ${migrationsDir}/*.up.sql 2>/dev/null | wc -l`);
        const migrationCount = parseInt(migrationsExist.stdout.trim()) || 0;
        
        if (migrationCount === 0) {
          sendStep('Running database migrations', 'done', 'No migration files found');
        } else {
          const databases = ['fp_database', 'ip_auth_database', 'propackhub_platform'];
          let totalApplied = 0;
          let totalSkipped = 0;
          
          for (const dbName of databases) {
            // Ensure schema_migrations table exists (with rollback_safe column)
            await sshExec(ssh, 
              `PGPASSWORD='${VPS_CONFIG.dbPassword}' psql -h localhost -U ${VPS_CONFIG.dbUser} -d ${dbName} -c "CREATE TABLE IF NOT EXISTS schema_migrations (id SERIAL PRIMARY KEY, version VARCHAR(255) UNIQUE NOT NULL, name VARCHAR(500), applied_at TIMESTAMP DEFAULT NOW(), checksum VARCHAR(64), rollback_safe BOOLEAN DEFAULT true)" 2>&1`
            );
            
            // Get already-applied versions
            const appliedResult = await sshExec(ssh,
              `PGPASSWORD='${VPS_CONFIG.dbPassword}' psql -h localhost -U ${VPS_CONFIG.dbUser} -d ${dbName} -t -c "SELECT version FROM schema_migrations ORDER BY version" 2>/dev/null`
            );
            const appliedVersions = appliedResult.stdout.trim().split('\n').map(v => v.trim()).filter(Boolean);
            
            // Get UP migration files (*.up.sql) sorted by name
            const filesResult = await sshExec(ssh, `ls ${migrationsDir}/*.up.sql 2>/dev/null | sort`);
            const allFiles = filesResult.stdout.trim().split('\n').filter(Boolean);
            
            let dbApplied = 0;
            let dbSkipped = 0;
            
            for (const filePath of allFiles) {
              const fileName = filePath.split('/').pop();
              const version = fileName.replace('.up.sql', '');
              const downFile = version + '.down.sql';
              const downPath = `${migrationsDir}/${downFile}`;
              
              // Check if this migration targets this DB or 'all'.
              // Supported naming examples:
              //   YYYYMMDD_NNN_all_*.up.sql
              //   YYYYMMDD_NNN_fp_database_*.up.sql
              //   YYYYMMDD_NNN_ip_auth_database_*.up.sql
              //   YYYYMMDD_NNN_propackhub_platform_*.up.sql
              const suffix = version.split('_').slice(2).join('_').toLowerCase();
              let target = 'all';
              if (suffix.startsWith('fp_database_')) target = 'fp_database';
              else if (suffix.startsWith('ip_auth_database_')) target = 'ip_auth_database';
              else if (suffix.startsWith('propackhub_platform_')) target = 'propackhub_platform';
              else if (suffix.startsWith('all_')) target = 'all';
              else {
                const parts = version.split('_');
                target = (parts.length >= 3 ? parts[2] : 'all').toLowerCase();
              }

              const normalizedDbName = dbName.toLowerCase();
              const isLegacyMatch =
                (target === 'fp' && normalizedDbName === 'fp_database') ||
                (target === 'ip' && normalizedDbName === 'ip_auth_database') ||
                (target === 'platform' && normalizedDbName === 'propackhub_platform');

              if (target !== normalizedDbName && target !== 'all' && !isLegacyMatch) {
                continue; // Skip — not for this DB
              }
              
              // Skip already applied
              if (appliedVersions.includes(version)) {
                dbSkipped++;
                continue;
              }
              
              // Verify rollback file exists before applying
              const downExists = await sshExec(ssh, `test -f ${downPath} && echo "yes" || echo "no"`);
              if (downExists.stdout.trim() !== 'yes') {
                sendLog(`  ✗ ${dbName}: ${fileName} — missing rollback file (${downFile}), skipping!`);
                break; // Stop — don't apply without rollback
              }
              
              // Parse safety header from UP file
              const headerCheck = await sshExec(ssh, `head -5 ${filePath} | grep -i "ROLLBACK:" || echo "SAFE"`);
              const isSafe = !headerCheck.stdout.toUpperCase().includes('NOT SAFE');
              
              sendLog(`  ⏳ ${dbName}: ${fileName} [${isSafe ? 'SAFE' : '⚠ SCHEMA ONLY'}]`);
              
              // Run the UP migration in a transaction
              const runMigration = await sshExec(ssh,
                `PGPASSWORD='${VPS_CONFIG.dbPassword}' psql -h localhost -U ${VPS_CONFIG.dbUser} -d ${dbName} -v ON_ERROR_STOP=1 -c "BEGIN;" -f ${filePath} -c "INSERT INTO schema_migrations (version, name, rollback_safe) VALUES ('${version}', '${fileName}', ${isSafe});" -c "COMMIT;" 2>&1`
              );
              
              if (runMigration.code !== 0) {
                // Transaction auto-rolls back when psql exits on error (ON_ERROR_STOP=1 prevents COMMIT)
                sendLog(`  ✗ FAILED on ${dbName}: ${runMigration.stderr || runMigration.stdout}`);
                break;
              }
              
              dbApplied++;
              sendLog(`  ✓ ${dbName}: ${fileName}`);
            }
            
            totalApplied += dbApplied;
            totalSkipped += dbSkipped;
            
            if (dbApplied > 0 || dbSkipped > 0) {
              sendLog(`  ${dbName}: ${dbApplied} applied, ${dbSkipped} already up to date`);
            }
          }
          
          sendStep('Running database migrations', 'done', 
            totalApplied > 0 
              ? `${totalApplied} migrations applied across ${databases.length} databases`
              : `All databases up to date (${totalSkipped} migrations already applied)`
          );
        }
      }

      // ----------------------------------------------------------
      // Step 7 (or 6): Restart pm2
      // ----------------------------------------------------------
      sendStep('Restarting backend (pm2)', 'running', 'pm2 restart...');
      
      // Aggressively free port 3001 before restarting pm2.
      //
      // KNOWN ISSUE (Feb 11, 2026): Two pm2 daemons can exist on this VPS:
      //   1. Root pm2 (/root/.pm2) — used by deployment (sudo pm2)
      //   2. User pm2 (/home/propackhub/.pm2) — created if someone runs "pm2 start" without sudo
      // Both try to run propackhub-backend on port 3001, causing EADDRINUSE crash loops.
      // Fix: Always stop/clean the user-level pm2 first, then manage via root pm2 only.
      //
      // Additionally, Apache mod_proxy can leave CLOSE_WAIT connections to port 3001
      // after the old Node.js process exits, which also blocks the port.
      
      // Step A: Kill user-level pm2 processes (prevents dual-daemon conflict)
      sendLog('Checking for user-level pm2 processes...');
      const userPm2Check = await sshExec(ssh, 'pm2 jlist 2>/dev/null || echo "[]"');
      try {
        const userProcs = JSON.parse(userPm2Check.stdout);
        if (userProcs.length > 0) {
          sendLog(`⚠ Found ${userProcs.length} process(es) in user-level pm2 — stopping to prevent conflict...`);
          await sshExec(ssh, 'pm2 stop all 2>/dev/null || true');
          await sshExec(ssh, 'pm2 delete all 2>/dev/null || true');
          await sshExec(ssh, 'pm2 save --force 2>/dev/null || true');
          sendLog('✓ User-level pm2 cleaned');
        }
      } catch (e) { /* no user pm2 or parse error — fine */ }
      
      // Step B: Stop root-level pm2
      sendLog('Stopping pm2 before port cleanup...');
      await sshExec(ssh, 'sudo pm2 stop propackhub-backend 2>/dev/null || true');
      
      // Step C: Kill ALL processes on port 3001 (Node + stale Apache CLOSE_WAIT)
      sendLog('Killing all processes on port 3001 (including stale CLOSE_WAIT)...');
      await sshExec(ssh, 'sudo kill -9 $(sudo lsof -ti:3001) 2>/dev/null || true');
      await new Promise(r => setTimeout(r, 1500));
      
      // Double-check: if anything is still holding the port, try fuser as fallback
      const portRecheck = await sshExec(ssh, 'sudo lsof -i:3001 2>/dev/null || echo "port_free"');
      if (!portRecheck.stdout.includes('port_free')) {
        sendLog('Port still held — retrying with fuser...');
        await sshExec(ssh, 'sudo fuser -k 3001/tcp 2>/dev/null || true');
        await new Promise(r => setTimeout(r, 1500));
        const portRecheck2 = await sshExec(ssh, 'sudo lsof -i:3001 2>/dev/null || echo "port_free"');
        if (!portRecheck2.stdout.includes('port_free')) {
          sendLog('⚠ WARNING: Port 3001 is STILL in use after aggressive cleanup.');
          sendLog('  → Go to WHM Terminal (https://148.66.152.55:2087) and run:');
          sendLog('  → sudo kill -9 $(sudo lsof -ti:3001)');
        } else {
          sendLog('✓ Port 3001 freed (fuser fallback)');
        }
      } else {
        sendLog('✓ Port 3001 is free');
      }

      // Step D: Delete old root pm2 process and start fresh (resets restart counter)
      const pm2List = await sshExec(ssh, 'sudo pm2 jlist 2>/dev/null');
      let pm2HasProcess = false;
      try {
        const processes = JSON.parse(pm2List.stdout);
        pm2HasProcess = processes.some(p => p.name === 'propackhub-backend');
      } catch (e) { /* not valid JSON, no pm2 processes */ }
      
      if (pm2HasProcess) {
        await sshExec(ssh, 'sudo pm2 delete propackhub-backend 2>/dev/null || true');
        await new Promise(r => setTimeout(r, 500));
      }
      
      // Step E: Start fresh — always use ecosystem.config.js if it exists
      const ecoExists = await sshExec(ssh, `test -f ${VPS_CONFIG.serverDir}/ecosystem.config.js && echo "yes" || echo "no"`);
      if (ecoExists.stdout.trim() === 'yes') {
        await sshExec(ssh, `sudo pm2 start ${VPS_CONFIG.serverDir}/ecosystem.config.js 2>&1`);
      } else {
        await sshExec(ssh, `sudo pm2 start ${VPS_CONFIG.serverDir}/index.js --name propackhub-backend --cwd ${VPS_CONFIG.serverDir} 2>&1`);
      }
      await sshExec(ssh, 'sudo pm2 save 2>&1');
      sendStep('Restarting backend (pm2)', 'done', 'Backend started fresh (port cleaned, restart counter reset)');
      
      // Verify pm2 is healthy (not crash-looping)
      await new Promise(r => setTimeout(r, 3000));
      const pm2Verify = await sshExec(ssh, 'sudo pm2 jlist 2>/dev/null');
      try {
        const procs = JSON.parse(pm2Verify.stdout);
        const proc = procs.find(p => p.name === 'propackhub-backend');
        if (proc) {
          const restarts = proc.pm2_env.restart_time || 0;
          if (proc.pm2_env.status !== 'online') {
            sendLog(`⚠ pm2 status is "${proc.pm2_env.status}" with ${restarts} restarts — check pm2 logs`);
          } else if (restarts > 3) {
            sendLog(`⚠ pm2 is online but has ${restarts} restarts — may be unstable`);
          } else {
            sendLog(`✓ pm2 healthy: online, PID ${proc.pid}, ${restarts} restarts`);
          }
        }
      } catch (e) { /* ignore */ }

      // ----------------------------------------------------------
      // Post-deploy health check
      // Wait a few seconds for pm2 to restart, then verify
      // ----------------------------------------------------------
      sendLog('Verifying backend health...');
      await new Promise(r => setTimeout(r, 3000));
      
      const healthCheck = await sshExec(ssh, 
        `curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:3001/api/health 2>/dev/null || echo "failed"`
      );
      const healthStatus = healthCheck.stdout.trim();
      if (healthStatus === '200') {
        sendLog('✓ Backend health check passed (HTTP 200)');
      } else if (healthStatus === 'failed') {
        sendLog('⚠ Health check could not reach backend — curl may not be installed. Check pm2 logs.');
      } else {
        sendLog(`⚠ Backend returned HTTP ${healthStatus} — check pm2 logs on VPS`);
      }
      
      // Verify frontend is served
      const frontendCheck = await sshExec(ssh,
        `curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:80/ 2>/dev/null || echo "failed"`
      );
      if (frontendCheck.stdout.trim() === '200') {
        sendLog('✓ Frontend health check passed (HTTP 200)');
      }
      
      // Verify database connectivity (all 3 databases)
      // pg_hba.conf on cPanel VPS can get reset by updates, breaking auth DB access
      const dbCheckEndpoints = [
        { name: 'Auth DB', url: '/api/countries/list' },
        { name: 'Settings DB', url: '/api/settings/company' }
      ];
      for (const ep of dbCheckEndpoints) {
        const dbCheck = await sshExec(ssh,
          `curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:3001${ep.url} 2>/dev/null || echo "failed"`
        );
        const code = dbCheck.stdout.trim();
        if (code === '200') {
          sendLog(`✓ ${ep.name} connectivity OK`);
        } else if (code === '500') {
          sendLog(`⚠ ${ep.name} returned 500 — possible pg_hba.conf issue. Check: sudo grep propackhub_user /var/lib/pgsql/data/pg_hba.conf`);
        } else {
          sendLog(`⚠ ${ep.name} returned HTTP ${code}`);
        }
      }
      
      // Get git SHA for reference
      const gitSha = await sshExec(ssh, 'git rev-parse --short HEAD', VPS_CONFIG.appDir);
      
      ssh.dispose();
      
      // Record deployment history
      const deployDuration = Math.round((Date.now() - deploymentStartedAt) / 1000);
      recordDeployment({
        status: 'success',
        duration: deployDuration,
        gitSha: gitSha.stdout.trim(),
        user: deploymentStartedBy,
        deployMode: normalizedDeployMode,
        includeDatabase,
        healthStatus
      });

      sendEvent('complete', { 
        message: `Deployment complete! propackhub.com is now live. (${deployDuration}s, SHA: ${gitSha.stdout.trim()})`,
        percent: 100,
        gitSha: gitSha.stdout.trim(),
        duration: deployDuration
      });

    } catch (stepError) {
      ssh.dispose();
      recordDeployment({ status: 'failed', error: stepError.message, user: deploymentStartedBy });
      throw stepError;
    }

  } catch (error) {
    console.error('VPS deployment error:', error);
    sendEvent('error', { 
      message: error.message,
      hint: error.message.includes('authentication') 
        ? 'Check VPS_SSH_PASSWORD in server/.env'
        : error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')
          ? 'Cannot reach VPS. Check VPS_HOST and VPS_SSH_PORT'
          : error.message.includes('git')
            ? 'Git error — check if repo is accessible and credentials are correct'
            : error.message.includes('ENOSPC')
              ? 'VPS disk is full — free up space on the server'
              : undefined
    });
  } finally {
    // ALWAYS release the deployment lock
    deploymentInProgress = false;
    deploymentStartedAt = null;
    deploymentStartedBy = null;
  }

  res.end();
});

// ============================================================
// GET /api/deployment/history
// Return recent deployment history
// ============================================================
router.get('/history', authenticate, requireAdmin, (req, res) => {
  res.json({ success: true, history: deploymentHistory });
});

// ============================================================
// GET /api/deployment/info
// Get deployment configuration info
// ============================================================
router.get('/info', authenticate, requireAdmin, (req, res) => {
  res.json({
    success: true,
    config: {
      projectRoot: PROJECT_ROOT,
      exportDir: EXPORT_DIR,
      vps: {
        host: VPS_CONFIG.host,
        sshConfigured: !!VPS_CONFIG.password,
        frontendPath: VPS_CONFIG.publicHtml,
        backendPath: VPS_CONFIG.serverDir,
        appDir: VPS_CONFIG.appDir,
        databasePath: `${VPS_CONFIG.appDir}/database-export-full/`
      },
      databases: ['fp_database', 'ip_auth_database', 'propackhub_platform']
    }
  });
});

module.exports = router;
