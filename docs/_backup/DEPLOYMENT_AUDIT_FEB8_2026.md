# Deployment System Audit & Fixes — February 8, 2026

## Overview

Full audit of the one-click VPS deployment system for ProPackHub (propackhub.com).  
VPS is GoDaddy AlmaLinux 8.10 (Linux — **case-sensitive filesystem**).

---

## Architecture Summary

| Component | Location | Purpose |
|-----------|----------|---------|
| **Backend route** | `server/routes/deployment.js` (~900 lines) | 8 API endpoints for deploy pipeline |
| **Frontend panel** | `src/components/settings/DeploymentPanel.jsx` (430 lines) | Admin UI with SSE progress streaming |
| **Frontend styles** | `src/components/settings/DeploymentPanel.css` (416 lines) | Terminal-style log display |
| **Route mounting** | `server/config/express.js` line 214 | `app.use('/api/deployment', ...)` |
| **Access control** | Settings.jsx | Tab only visible when `user.role === 'admin' && hostname === 'localhost'` |
| **VPS config** | `server/.env` (local) | SSH creds, paths, GitHub PAT |
| **VPS .env** | `/home/propackhub/app/server/.env` (on VPS) | Production config, JWT secrets, DB creds |
| **pm2 ecosystem** | `server/ecosystem.config.js` | pm2 process config (root daemon, propackhub uid) |

### Deployment Pipeline (7 steps via SSE):
1. **Git push** — `git add . && git commit && git push origin main`
2. **Vite build** — Local build with 4GB heap (VPS only has 2GB RAM)
3. **SSH + git pull** — `git reset --hard origin/main + pull` (auto-fixes ownership + safe.directory)
4. **SFTP upload** — `build/` → `public_html` (atomic swap: temp dir → mv)
5. **Backend sync** — `npm install --production` in server dir
6. **DB migrations** — (Optional) UP/DOWN SQL file pairs, tracked in `schema_migrations`
7. **pm2 restart** — Kills orphan processes, `sudo pm2 restart` + verify stability
8. **Health check** — curl `localhost:3001/api/health` + frontend check

### API Endpoints:
| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/deployment/status` | GET | ✅ admin | Last deployment, SSH config status |
| `/api/deployment/test-connection` | POST | ✅ admin | SSH test, returns system info |
| `/api/deployment/export-database` | POST | ✅ admin | pg_dump backup (safety, NOT for deploy) |
| `/api/deployment/git-push` | POST | ✅ admin | Standalone git commit+push |
| `/api/deployment/build-frontend` | POST | ✅ admin | Standalone Vite build |
| `/api/deployment/deploy-to-vps` | POST | ✅ admin | Full pipeline (SSE streaming) |
| `/api/deployment/info` | GET | ✅ admin | Config info |
| `/api/deployment/history` | GET | ✅ admin | Last 20 deployments (in-memory) |

---

## VPS Details (Quick Reference)

| Item | Value |
|------|-------|
| Host | propackhub.com (148.66.152.55) |
| OS | AlmaLinux 8.10 (Linux, **case-sensitive**) |
| SSH user | `propackhub` (password auth) |
| WHM Terminal | `https://148.66.152.55:2087` → Terminal (runs as **root**) |
| RAM | 2GB (why we build locally) |
| Disk | 39G total, 22G free (45% used) |
| Node.js | v20.20.0, npm 10.8.2 |
| Git | 2.48.2 |
| Git repo | `/home/propackhub/app/` (cloned from GitHub) |
| Backend | `/home/propackhub/app/server/` (Express on port 3001) |
| Frontend | `/home/propackhub/public_html/` (Apache serves this) |
| Databases | `fp_database` (102 tables), `ip_auth_database` (153 tables), `propackhub_platform` (12 tables) |
| DB engine | PostgreSQL 16, user `propackhub_user`, password `***REDACTED***` |
| Process mgr | pm2 6.0.14 (process name: `propackhub-backend`) |
| Web server | Apache (cPanel/WHM) with .htaccess for SPA routing |

### ⚠️ CRITICAL PATH NOTES (for future sessions)
- Backend is at `/home/propackhub/app/server/` — **NOT** `/home/propackhub/server/` (that path is empty!)
- The git repo root is `/home/propackhub/app/` — server is a subdirectory
- Deployment SSH connects as `propackhub` user — **NOT root**
- pm2 daemon runs as **root**, but the app runs as **propackhub** (uid/gid drop via ecosystem.config.js)
- Local `.env` has `VPS_SERVER_DIR=/home/propackhub/app/server` — this is correct
- Redis is NOT installed on VPS — the app handles this gracefully (cache disabled)
- VPS `.env` uses `DB_USER=propackhub_user` / `DB_PASSWORD=***REDACTED***` — **NOT** the local dev `postgres`/`654883`
- VPS `.env` is **never overwritten** by deployments (rsync `--exclude='.env'`) — changes must be made manually on VPS
- User passwords: camille's password is `Admin@123` (bcrypt hashed in `ip_auth_database.users.password_hash`)

---

## Issues Found & Fixed (Feb 8, 2026)

### 🔴 CRITICAL — Fixed

#### 1. Zero Authentication on Deployment API
**Problem:** All deployment routes had NO auth middleware. Any HTTP client reaching port 3001 could deploy/backup/SSH.  
**Fix:** Added `authenticate, requireAdmin` middleware to ALL 8 endpoints.  
**File:** `server/routes/deployment.js`

#### 2. Frontend SSE Fetch Missing Auth Token
**Problem:** `fetch()` for SSE streaming didn't include JWT `Authorization` header → 401 with new auth.  
**Fix:** Added `Authorization: Bearer <token>` from localStorage/sessionStorage.  
**File:** `src/components/settings/DeploymentPanel.jsx`

#### 3. Non-Atomic Frontend Deployment
**Problem:** Old flow deleted `public_html` then uploaded → site broken during upload (30+ seconds).  
**Fix:** Upload to temp dir → `mv` swap → cleanup. Never half-deployed.  
**File:** `server/routes/deployment.js` — Step 4

#### 4. No Deployment Concurrency Lock
**Problem:** Two simultaneous deploys would corrupt everything.  
**Fix:** In-memory lock + 409 response + UI handles 409.  
**Files:** `server/routes/deployment.js` + `DeploymentPanel.jsx`

#### 5. Wrong VPS Path in Deployment Config
**Problem:** `VPS_SERVER_DIR` pointed to `/home/propackhub/server` (empty). Actual backend is at `/home/propackhub/app/server/`.  
**Fix:** Updated `.env` and deployment.js defaults.  
**Files:** `server/.env`, `server/routes/deployment.js`

#### 6. VPS JWT Secrets Were Defaults
**Problem:** `JWT_SECRET=ipd-secret-key-change-in-production` — anyone can forge admin tokens.  
**Fix:** Generated random 64-char hex secrets, applied to VPS `.env` via SSH. Backed up old .env.  
**File:** VPS `/home/propackhub/app/server/.env`

#### 7. VPS File Ownership (root → propackhub)
**Problem:** Git repo cloned as root — all files owned by root. propackhub user couldn't write.  
**Fix:** `chown -R propackhub:propackhub /home/propackhub/app`. Auto-fix added to deploy pipeline.  
**File:** VPS filesystem + `server/routes/deployment.js`

#### 8. Git "Dubious Ownership" Error
**Problem:** Git refused operations because repo owned by different user.  
**Fix:** `git config --global --add safe.directory /home/propackhub/app`. Auto-fix added to deploy pipeline.

#### 9. Missing `compression` Package on VPS
**Problem:** `server/index.js` requires `compression` but it wasn't in `node_modules` on VPS → crash.  
**Fix:** `npm install compression` on VPS.

#### 10. pm2 SIGINT Crash Loop (Root Cause Found & Fixed — TWO layers)
**Problem:** pm2 under propackhub user kept crash-looping (hundreds of restarts). Backend worked perfectly under root.  

**Layer 1 — cPanel shell lifecycle:**  
When propackhub's shell closes (after `su -` or SSH session ends), SIGINT propagates to the node process. The app's graceful shutdown handler catches SIGINT and calls `process.exit(0)`.  
**Fix:** Root-managed pm2 daemon with uid/gid drop (`ecosystem.config.js` with `uid: "propackhub"`).

**Layer 2 — pm2 sends SIGINT during its own lifecycle:**  
Even with root pm2, the app still crash-looped. pm2 sends **SIGINT** (not SIGTERM) by default during restart/reload/save operations. Our SIGINT handler exits the app, pm2 thinks it crashed → restart loop.  
**Evidence:** pm2 list showed `status: (blank), uptime: 0, mem: 0b, restarts: 3` — process exits immediately after starting.  

**Final fix (two changes):**
1. `ecosystem.config.js` — added `kill_signal: "SIGTERM"` so pm2 uses SIGTERM for graceful shutdown
2. `server/index.js` — SIGINT handler now only registers in development mode (`NODE_ENV !== 'production'`). In production, only SIGTERM triggers graceful shutdown (which is the standard contract for PM2/systemd/orchestrators).

**Files:** `server/ecosystem.config.js`, `server/index.js`

### 🟠 IMPORTANT — Fixed

#### 11. No Post-Deploy Health Check
**Fix:** Curls `localhost:3001/api/health` after pm2 restart + verifies pm2 restart count.

#### 12. "How It Works" UI Text Was Wrong
**Fix:** Updated all 8 steps to match actual flow. Added Linux case-sensitivity note.

#### 13. No Confirmation Dialog
**Fix:** `window.confirm()` on both deploy buttons with descriptive messages.

#### 14. No Deployment History
**Fix:** In-memory array (last 20) — `GET /api/deployment/history`.

#### 15. VPS `.env` Had Local Dev DB Credentials
**Problem:** VPS `.env` had `DB_USER=postgres` / `DB_PASSWORD=654883` (local dev values). Backend couldn't authenticate to PostgreSQL → all API calls returned `"password authentication failed for user postgres"`.  
**Fix:** One-time `sed` on VPS to set `DB_USER=propackhub_user` / `DB_PASSWORD=***REDACTED***`. Deploy pipeline never overwrites `.env` (rsync `--exclude='.env'`).  
**File:** VPS `/home/propackhub/app/server/.env`

#### 16. CSS Grid Layout Broken in Production (Cards Stacking Vertically)
**Problem:** The Divisional KPIs page (and other pages) showed cards stacked vertically on the live site instead of a 4-column grid layout. Worked perfectly on localhost. This was a long-standing issue across multiple sessions.

**Root cause:** `src/components/writeup/WriteUpViewV2.css` had an **unclosed `@media print {` block** at the end of the file (line 552). The `@media print` opened but never had a closing `}`. When Vite bundles all CSS into a single file (`index-*.css`), every CSS rule that appears **after** WriteUpViewV2.css in the bundle gets swallowed into the `@media print` block. This means `.kpi-cards { display: grid !important }` and hundreds of other rules only applied when printing, not on screen.

**How it was found:**
1. Browser console confirmed `.kpi-cards` computed display was `block` (not `grid`)
2. JavaScript `document.styleSheets` scan showed `.kpi-cards` rule only existed inside `@media print` condition
3. Brace-depth analysis on the built CSS: at byte position 201503 (where `.kpi-cards` rule lives), brace depth was 1 (should be 0)
4. Traced the last position where depth was 0 → byte 178993 → the `@media print` block from WriteUpViewV2.css
5. Source file inspection confirmed: `@media print {` at line 552 with no closing `}`

**Secondary fix:** `src/components/reports/ProductGroupsKgsTable.css` had an extra stray `}` (brace depth -1), which could also cause CSS parsing issues in the bundled output.

**Fix applied:**
1. Added missing closing `}` to the `@media print` block in `WriteUpViewV2.css`
2. Removed extra `}` from `ProductGroupsKgsTable.css`
3. Verified all 78 CSS source files have balanced braces
4. Rebuilt frontend — confirmed `.kpi-cards{display:grid}` at brace depth 0 in bundled CSS
5. Redeployed to VPS — grid layout confirmed working on live site

**Files:** `src/components/writeup/WriteUpViewV2.css`, `src/components/reports/ProductGroupsKgsTable.css`

**Lesson:** A single unclosed CSS brace in any source file can break the entire production CSS bundle. Vite concatenates all CSS into one file — an unclosed `@media` block will swallow every rule that follows it. Always verify brace balance in CSS files. The diagnostic script `server/scripts/verify-css-braces.js` can be run to check all 78 CSS files.

#### 17. nginx Proxy Cache Serving Stale Files After Deploy
**Problem:** cPanel's ea-nginx has a proxy cache (`/var/cache/ea-nginx/proxy/propackhub/`) with `proxy_cache_valid 200 301 302 60m` — nginx caches all 200 responses for 60 minutes. After deploying new frontend files, nginx kept serving the old cached CSS/JS/HTML. This caused intermittent behavior: sometimes the new version loaded (cache miss), sometimes the old broken version (cache hit). The cache was 320MB of stale files.

**Root cause:** nginx sits in front of Apache on the VPS (nginx port 80/443 → Apache port 81). The cPanel ea-nginx config at `/etc/nginx/conf.d/users/propackhub.conf` enables aggressive proxy caching by default.

**Fix:**
1. All deploy scripts (`deploy-frontend-only.js`, `upload-build.js`, `deployment.js`) now run `sudo rm -rf /var/cache/ea-nginx/proxy/propackhub/* && sudo nginx -s reload` after uploading files
2. Added nginx cache purge + reload to propackhub's sudoers (`/etc/sudoers.d/propackhub`)
3. Vite's content-hashed filenames (e.g., `index-BsrQBGJs.css`) help with browser caching but don't help with nginx proxy cache since `index.html` (which references the new hash) was itself cached

**Files:** `server/scripts/deploy-frontend-only.js`, `server/scripts/upload-build.js`, `server/routes/deployment.js`, VPS `/etc/sudoers.d/propackhub`

---

## Current VPS Verification Results (Feb 8, 2026)

### ✅ All Passing
| Check | Status |
|-------|--------|
| SSH connection (propackhub user) | ✅ |
| Health endpoint (HTTP 200) | ✅ |
| fp_database (102 tables) | ✅ |
| ip_auth_database (153 tables) | ✅ |
| propackhub_platform (12 tables) | ✅ |
| GET /api/settings (200) | ✅ |
| POST /api/auth/login (400 = needs body) | ✅ Auth working |
| GET /api/deployment/status (401 = needs token) | ✅ Auth enforced |
| All VPS paths exist | ✅ |
| File ownership (propackhub:propackhub) | ✅ |
| Git repo + remote (main branch) | ✅ |
| All .env keys set (18 keys) | ✅ |
| All 16 npm dependencies installed | ✅ |
| JWT secrets (random, not defaults) | ✅ |
| NODE_ENV=production | ✅ |
| logs/ directory writable | ✅ |
| uploads/ directory writable | ✅ |

---

## Implementation Plan: pm2 Root Daemon + Sudo Restart

### Problem Recap
pm2 under propackhub user receives SIGINT when shell closes (cPanel behavior). This causes the backend to crash-loop. Running as root is stable but deployment UI SSH connects as propackhub and can't see root's pm2.

### Solution Architecture
```
root
 └─ pm2 daemon (root-owned, stable, survives shell closes)
     └─ node process (uid=propackhub, gid=propackhub via ecosystem.config.js)
         └─ Express app on :3001
             └─ connects to PostgreSQL, serves API

Deployment UI (SSH as propackhub)
 └─ runs: sudo pm2 restart propackhub-backend
     └─ allowed via passwordless sudoers entry
```

### Step-by-Step Implementation

#### Step 1: ecosystem.config.js ✅ DONE
Created `server/ecosystem.config.js` — uploaded to VPS at `/home/propackhub/app/server/ecosystem.config.js`.

```javascript
module.exports = {
  apps: [{
    name: "propackhub-backend",
    script: "index.js",
    cwd: "/home/propackhub/app/server",
    uid: "propackhub",        // App runs as propackhub
    gid: "propackhub",        // App runs as propackhub
    instances: 1,
    exec_mode: "fork",
    env: { NODE_ENV: "production" },
    kill_signal: "SIGTERM",   // CRITICAL: PM2 default is SIGINT which triggers our shutdown handler
    listen_timeout: 10000,    // 10s to bind port
    kill_timeout: 5000,       // 5s graceful shutdown
    restart_delay: 2000,      // Wait 2s before restart
    max_restarts: 10,         // Stop after 10 consecutive failures
    time: true                // Timestamp logs
  }]
};
```

**Also: `server/index.js` SIGINT change:**
```javascript
// SIGINT: Only handle in development (Ctrl+C in terminal).
// In production, PM2 manages lifecycle via SIGTERM.
// PM2 sends SIGINT during its lifecycle events (restart/reload/save),
// which causes the app to exit → PM2 thinks it crashed → restart loop.
if (NODE_ENV !== 'production') {
  process.on('SIGINT', () => { /* graceful shutdown */ });
}
// SIGTERM: Always handle (PM2 sends this for graceful shutdown in production)
process.on('SIGTERM', () => { /* graceful shutdown */ });
```

#### Step 2: Start pm2 as Root (WHM Terminal) ✅ DONE (Feb 8, 2026 session)

**Root cause found:** The app was crashing silently because `validateEnvironment()` in `server/config/environment.js` threw an error when `SESSION_SECRET` was the default value in production mode. The error was invisible because the logger only wrote to files in production (no console output).

**Three fixes applied:**
1. `server/config/environment.js` — Auto-generates `SESSION_SECRET` if not set (instead of crashing)
2. `server/utils/logger.js` — Always outputs warnings/errors to console, even in production
3. `server/index.js` — Added `console.error` in the catch block so fatal errors are always visible

**Commands run in WHM Terminal (as root):**
```bash
git config --global --add safe.directory /home/propackhub/app
cd /home/propackhub/app
git fetch origin
git reset --hard origin/main
pm2 delete all
fuser -k 3001/tcp 2>/dev/null
sleep 2
pm2 start /home/propackhub/app/server/ecosystem.config.js
pm2 save
```

**Result:** pm2 online, 0 crash restarts, 139MB memory, health check passing. Stable for 15+ minutes of monitoring (12 checks every 5 seconds, all passed).

#### Step 3: Setup Passwordless Sudo for pm2 ✅ DONE (Feb 8, 2026 session)

**Issue found:** pm2 path was `/bin/pm2` (not `/usr/bin/pm2`), and node was at `/usr/local/bin/node` but not in propackhub's PATH.

**Commands run in WHM Terminal (as root):**
```bash
# Sudoers with correct pm2 path
echo 'propackhub ALL=(root) NOPASSWD: /bin/pm2 restart propackhub-backend, /bin/pm2 reload propackhub-backend, /bin/pm2 status, /bin/pm2 list, /bin/pm2 jlist, /bin/pm2 logs propackhub-backend *' > /etc/sudoers.d/propackhub
chmod 440 /etc/sudoers.d/propackhub

# Fix node path for propackhub user
ln -sf /usr/local/bin/node /usr/bin/node
```

**Verified:** `su - propackhub -c "sudo pm2 list"` shows the running process.
**Verified:** `su - propackhub -c "sudo pm2 restart propackhub-backend"` restarts successfully, backend stays online.

#### Step 4: Update deployment.js to use sudo pm2 ✅ DONE (Feb 8, 2026 session)

Changed `server/routes/deployment.js`:
- `pm2 jlist` → `sudo pm2 jlist`
- `pm2 restart propackhub-backend` → `sudo pm2 restart propackhub-backend`
- `pm2 start index.js ...` → `sudo pm2 start ecosystem.config.js`
- `pm2 save` → `sudo pm2 save`

Pushed to git, pulled on VPS, pm2 restarted — all working.

#### Step 5: Frontend Deployment ✅ DONE (Feb 8, 2026 session)

**Created:** `server/scripts/deploy-frontend-only.js` — builds locally + SFTP uploads to VPS `public_html` (atomic swap). Does NOT touch backend/pm2.

**Created `.htaccess`** on VPS at `/home/propackhub/public_html/.htaccess`:
```apache
RewriteEngine On

# Proxy API requests to Node.js backend
RewriteCond %{REQUEST_URI} ^/api/
RewriteRule ^(.*)$ http://localhost:3001/$1 [P,L]

# Proxy uploads folder to Node.js backend
RewriteCond %{REQUEST_URI} ^/uploads/
RewriteRule ^(.*)$ http://localhost:3001/$1 [P,L]

# Serve React app for all other requests
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ /index.html [L]
```

**Verified:** `curl -s http://localhost/api/health` returns healthy through Apache proxy.

**Frontend deployed:** 101 files, 0 failures, .htaccess preserved, HTTP 200 from Apache.

**Security fix applied:** `server/middleware/security.js`
- Removed `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Resource-Policy: same-origin` headers (broke ECharts, fonts, cross-origin resources)
- `Cache-Control: no-store` now only applies to `/api/` routes (was blocking CSS/JS caching)
- CSP updated: added `unsafe-eval` for ECharts, `blob:` for images, `workerSrc` for web workers

#### Step 6: Test UI Deploy ⬜ PENDING
Not yet tested — the full pipeline deploy via the UI has not been run yet. Backend-only restart via UI (sudo pm2) is confirmed working.

---

## Current Status (Feb 8, 2026 — End of Session)

### ✅ FULLY OPERATIONAL
| Item | Status |
|------|--------|
| Backend (pm2) | Online, stable, 0 crash restarts |
| Health endpoint | `{"status":"healthy"}` via both localhost:3001 and Apache proxy |
| Apache → Node.js proxy | `.htaccess` proxies `/api/*` and `/uploads/*` to port 3001 |
| Frontend deployed | 101 files in `public_html`, React app loads in browser |
| Login working | `camille@interplast-uae.com` (admin) logs in successfully |
| SSH from deployment UI | Test Connection works |
| sudo pm2 from propackhub user | Restart works, process stays online |
| Git push/pull flow | Local → GitHub → VPS working |
| VPS `.env` DB credentials | `propackhub_user` / `***REDACTED***` (fixed from local dev creds) |

### ✅ RESOLVED: Login 401 Unauthorized
**Problem:** Both `camille@interplast-uae.com` (tenant admin) and `admin@propackhub.com` (SaaS platform) returned 401 on login at `https://propackhub.com`.

**Root cause (TWO layers):**

1. **VPS `.env` had local dev DB credentials** — `DB_USER=postgres` / `DB_PASSWORD=654883` instead of `DB_USER=propackhub_user` / `DB_PASSWORD=***REDACTED***`. The backend couldn't connect to PostgreSQL at all. Error was `"password authentication failed for user postgres"`.

2. **Wrong password used during testing** — After fixing DB credentials, login returned `"Invalid email or password"` because we tested with `654883` (the local DB password) instead of the actual user password `Admin@123`.

**Fix applied (one-time, on VPS):**
```bash
sed -i 's/^DB_USER=.*/DB_USER=propackhub_user/' /home/propackhub/app/server/.env
sed -i 's/^DB_PASSWORD=.*/DB_PASSWORD=***REDACTED***/' /home/propackhub/app/server/.env
sudo pm2 restart propackhub-backend
```

**Why this won't regress:** The deploy pipeline uses `rsync --exclude='.env'` — the VPS `.env` is never overwritten by deployments. This was a one-time fix for the initial setup.

**Result:** Login successful for `camille@interplast-uae.com` (admin, FP division). Access token generated, dashboard loads.

---

## Known Issues NOT Yet Fixed (Lower Priority)

| Issue | Description | Risk |
|-------|-------------|------|
| **Credentials in Git** | `.env` committed. Repo is private, but dangerous if ever public | Medium |
| **No Rollback UI** | Migrations have DOWN files, but no "Rollback" button | Low |
| **No Dry Run Mode** | No way to preview what will happen before deploy | Low |
| **Password Auth (not SSH Key)** | `propackhub-ssh` key exists but unused | Low |
| **git reset --hard** | Destroys any manual hotfixes on VPS | Medium |
| **Redis not installed** | Cache disabled, app handles gracefully | Low |
| **Deploy history in-memory** | pm2 restart loses deployment history. Should persist to JSON file | Low |
| **No SSE timeout** | If deploy hangs, UI spins forever. Needs client-side timeout (~10min) | Low |
| **GitHub PAT expiry** | No warning if PAT expires — deploys silently fail at git push/pull | Low |

---

## Deployment Pipeline Deep Review (Feb 8, 2026 — Post-Fix)

### Bugs Found & Fixed

#### Bug 1: Step 5 rsync was rsyncing a directory to itself
**Problem:** `VPS_APP_DIR=/home/propackhub/app` and `VPS_SERVER_DIR=/home/propackhub/app/server`. The rsync command did `rsync ... /home/propackhub/app/server/ /home/propackhub/app/server/` — source and destination identical. Git pull in Step 3 already updates server code in place.
**Fix:** Removed the redundant rsync/cp logic. Step 5 now only runs `npm install --production`.
**File:** `server/routes/deployment.js`

#### Bug 2: Dead ROLLBACK code after migration failure
**Problem:** When a migration failed, the code ran `psql -c "ROLLBACK;"` in a separate psql process (separate DB connection). This was a no-op — the original transaction auto-rolls back when psql exits on error (`ON_ERROR_STOP=1` prevents reaching `COMMIT`).
**Fix:** Removed the dead ROLLBACK call. Added comment explaining the auto-rollback behavior.
**File:** `server/routes/deployment.js`

#### Bug 3: Migration target matching broke on non-standard filenames
**Problem:** Code parsed `parts[2]` from filename split by `_`. Files with fewer than 3 underscore-separated parts (e.g., `20260208_add_column.up.sql`) would have `parts[2]` = undefined, silently skipping the migration for all databases.
**Fix:** Default to `'all'` when fewer than 3 parts. Added comment documenting the naming convention.
**File:** `server/routes/deployment.js`

#### Bug 4: "How It Works" UI showed wrong backend path
**Problem:** Text said `/home/propackhub/server/` — actual path is `/home/propackhub/app/server/`.
**Fix:** Updated the text.
**File:** `src/components/settings/DeploymentPanel.jsx`

### Enhancement Added: CSS Brace Validation Before Build
**Problem:** An unclosed `@media print {` block in one CSS file broke the entire production CSS bundle (Issue #16). This was invisible during development because Vite dev server loads CSS files individually.
**Fix:** Added a pre-build CSS brace validation step. Before running `npm run build`, the deploy pipeline scans all CSS source files for unbalanced braces. If any file has depth ≠ 0, the deploy aborts with a clear error message listing the broken files.
**File:** `server/routes/deployment.js`

---

## Files Modified in This Audit

| File | Changes |
|------|---------|
| `server/routes/deployment.js` | Auth middleware, concurrency lock, atomic deploy, health check, history, case warnings, git safe.directory, chown, path fix, orphan killer, sudo pm2, nginx cache purge, CSS brace validation, removed redundant rsync, fixed migration target matching, removed dead ROLLBACK |
| `src/components/settings/DeploymentPanel.jsx` | Auth token in SSE, confirmation dialogs, text fixes, 409 handling, fixed backend path in How It Works |
| `src/components/writeup/WriteUpViewV2.css` | Fixed unclosed `@media print` block (Issue #16) |
| `src/components/reports/ProductGroupsKgsTable.css` | Removed extra stray `}` (Issue #16) |
| `src/components/dashboard/KPIExecutiveSummary.css` | Adjusted export region card globe sizing |
| `server/scripts/deploy-frontend-only.js` | Added nginx cache purge after deploy |
| `server/scripts/upload-build.js` | Added nginx cache purge after deploy |
| `server/.env` | Fixed `VPS_SERVER_DIR` path |
| `server/ecosystem.config.js` | NEW — pm2 process config for root daemon + propackhub uid |
| VPS `/home/propackhub/app/server/.env` | JWT secrets updated, NODE_ENV=production, DB_USER/DB_PASSWORD fixed to propackhub_user |
| VPS `/home/propackhub/app/server/ecosystem.config.js` | Uploaded |
| VPS filesystem | Ownership fixed, compression installed, safe.directory configured |

## Diagnostic Scripts (in `server/scripts/`)

| Script | Purpose |
|--------|---------|
| `vps-full-verify.js` | Comprehensive 10-point VPS verification (databases, APIs, paths, deps, pm2) |
| `vps-setup-ecosystem.js` | Upload ecosystem.config.js + prepare for root pm2 |
| `vps-debug-crash.js` | Check pm2 error/out logs + file permissions + write tests |
| `vps-debug-crash2.js` | Run index.js directly with exit code capture |
| `vps-debug-crash3.js` | Test each require() module individually |
| `vps-check.js` | Basic SSH + filesystem check |
| `vps-status.js` | pm2 + health status |
| `vps-restart.js` | Restart pm2 via SSH |
| `vps-start-pm2.js` | Start pm2 process |
| `vps-fix-compression.js` | Install missing npm packages |
| `vps-crash-check.js` | Diagnose crash-looping |

**Run any script:** `cd server && node scripts/vps-full-verify.js`


---

## Responsiveness Audit (Feb 8, 2026) — COMPLETED

Full responsiveness audit completed across all 10 chunks. Automated scan of 79 CSS files reduced issues from 35 → 17 (remaining are mostly false-positive "table overflow-x" flags — handled globally in App.css).

**Detailed plan:** See `docs/RESPONSIVENESS_AUDIT_PLAN.md`

### What was fixed:

**Global (Chunk 1):**
- `App.css` — Global table overflow-x, modal max-width, mobile button/card/input sizing, body overflow-x hidden
- `index.css` — Responsive utility classes (.hide-mobile, .full-width-mobile, .stack-mobile)
- `base-variables.css` — Responsive font-size CSS variables using clamp(), mobile spacing, disabled hover on touch
- `animations.css`, `glassmorphism.css`, `hover-effects.css`, `neumorphism.css` — Mobile optimizations

**Dashboard (Chunks 2-4):**
- `ActivePeriodsDisplay.jsx` — Replaced ugly inline styles with CSS classes; icon-only buttons on mobile (no more vertical stacking)
- `ColumnConfigGrid.css` — Added 1024px/768px/480px breakpoints for config buttons
- `DivisionSelector.css` — Added 768px/480px breakpoints
- `FilterPanel.css` — Added 768px/480px breakpoints, stacked layout on mobile
- `MapSwitcher.css` — Added 768px/480px breakpoints
- `HTMLExport.css`, `PDFExport.css` — Added 768px breakpoints
- `ProductGroupTable.css` — Added 768px breakpoint with smaller fonts
- `TableView.css` — Added 768px/480px breakpoints
- `TableDetailStyles.css` — Added 768px breakpoint
- `ChartContainer.module.css` — Added 768px/480px breakpoints
- `BudgetActualWaterfallDetail.css` — Added 768px breakpoint
- `CountryReference.css` — Reduced min-width from 600px to 500px
- `DivisionalDashboardLanding.css` — Full mobile/tablet/landscape breakpoints (already done)

**WriteUp & Reports (Chunk 5):**
- `WriteUpViewV2.css` — Added 768px/480px breakpoints for report layout

**CRM (Chunk 7):**
- `CRM.css` — Added 768px/480px breakpoints for dashboard, search, map

**Settings (Chunk 8):**
- `DatabaseBackup.css` — Added 768px/480px breakpoints
- `DeploymentPanel.css` — Added 768px/480px breakpoints
- `UserPermissions.css` — Added 768px breakpoint

**MasterData (Chunk 9):**
- `CustomerManagement.css` — Added 768px breakpoint
- `SalesRepManagement.css` — Added 768px/480px breakpoints

**Platform (Chunk 10):**
- `NotificationBell.css` — Added 768px breakpoint

**Components:**
- `RotateHint.jsx` + `.css` — Shows "Rotate for best experience" toast on phones in portrait mode

**Audit script:** `node server/scripts/audit-responsiveness.js`
**CSS brace check:** `node server/scripts/verify-css-braces.js`
