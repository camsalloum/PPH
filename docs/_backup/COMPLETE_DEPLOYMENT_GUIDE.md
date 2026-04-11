# ProPackHub 26.2 — Complete Deployment Guide & Change Log

> **Document created:** February 7, 2026  
> **Project:** ProPackHub (PPH) v26.2  
> **Repository:** https://github.com/camsalloum/PPH-26.2.git  
> **Live domain:** https://propackhub.com

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Local Development Setup](#2-local-development-setup)
3. [VPS Server Details](#3-vps-server-details)
4. [SSH Connection & Sudo Access](#4-ssh-connection--sudo-access)
5. [Git Repository Setup](#5-git-repository-setup)
6. [Deployment Methods](#6-deployment-methods)
   - 6a. Quick Deploy (Command Line)
   - 6b. Automated Deploy (UI Panel)
   - 6c. Manual Deploy Steps
7. [Apache & SPA Routing (.htaccess)](#7-apache--spa-routing-htaccess)
8. [PostgreSQL Upgrade (10 → 16)](#8-postgresql-upgrade-10--16)
9. [Database Configuration](#9-database-configuration)
10. [All Code Fixes — Complete Change Log](#10-all-code-fixes--complete-change-log)
11. [VPS Directory Structure](#11-vps-directory-structure)
12. [Troubleshooting](#12-troubleshooting)
13. [Quick Reference / Cheat Sheet](#13-quick-reference--cheat-sheet)
14. [Security Configuration](#14-security-configuration)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  LOCAL PC (Development)                                         │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────────┐  │
│  │ Vite Dev     │   │ Express API  │   │ PostgreSQL 17.5    │  │
│  │ Server       │──▶│ Server       │──▶│ (Local DB)         │  │
│  │ :3000        │   │ :3001        │   │ :5432              │  │
│  └──────────────┘   └──────────────┘   └────────────────────┘  │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────────────────────────────────┐               │
│  │  git push origin main  →  GitHub (PPH-26.2)  │               │
│  └───────────────────────────┬──────────────────┘               │
└──────────────────────────────┼──────────────────────────────────┘
                               │ SSH (node-ssh)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  VPS (GoDaddy — propackhub.com — 148.66.152.55)                │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────────┐  │
│  │ Apache       │   │ Express API  │   │ PostgreSQL 16.11   │  │
│  │ (public_html)│──▶│ (pm2)        │──▶│ (VPS DB)           │  │
│  │ :80/:443     │   │ :3001 proxy  │   │ :5432              │  │
│  └──────────────┘   └──────────────┘   └────────────────────┘  │
│                                                                 │
│  OS: AlmaLinux 8.10  │  Node 18.20.8  │  npm 10.8.2  │  pm2   │
└─────────────────────────────────────────────────────────────────┘
```

**Stack:**
- **Frontend:** Vite v7.3.0 + React 18.3.1 + Ant Design 5.25.1 + Chart.js 4.5.0 + ECharts 5.x
- **Backend:** Node.js + Express 5.1.0
- **Database:** PostgreSQL (local 17.5 / VPS 16.11)
- **Process Manager:** pm2 6.0.14 (VPS)
- **Web Server:** Apache with mod_rewrite + ProxyPass (VPS)
- **Deployment:** SSH automation via `node-ssh` package

---

## 2. Local Development Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 17.x
- Git

### Starting the Dev Environment

**Option A — Double-click:**
```
START-SERVERS.cmd
```
This starts both the Vite dev server (:3000) and Express backend (:3001).

**Option B — Manual:**
```bash
# Terminal 1: Backend
cd server
node index.js

# Terminal 2: Frontend
npm run dev
```

### Build for Production
```bash
npm run build
```
Output goes to `build/` folder.

### Key Config Files

| File | Purpose |
|------|---------|
| `vite.config.js` | Vite build config, dev proxy to :3001, chunk splitting |
| `server/.env` | All environment variables (DB credentials, VPS SSH, etc.) |
| `server/database/config.js` | PostgreSQL pool configuration |
| `package.json` | Dependencies and scripts |
| `.gitignore` | Excludes node_modules, .env, source maps |

---

## 3. VPS Server Details

| Item | Value |
|------|-------|
| **Provider** | GoDaddy VPS |
| **IP Address** | 148.66.152.55 |
| **Domain** | propackhub.com |
| **OS** | AlmaLinux v8.10.0 STANDARD kvm |
| **cPanel** | https://148.66.152.55:2083 (user-level) |
| **WHM** | https://148.66.152.55:2087 (root-level) |
| **SSH User** | `propackhub` |
| **SSH Port** | 22 |
| **Node.js** | v18.20.8 |
| **npm** | v10.8.2 |
| **Git** | v2.48.2 |
| **pm2** | v6.0.14 |
| **PostgreSQL** | 16.11 (upgraded from 10.23) |
| **Free Disk** | ~20 GB |

### GoDaddy Access

| Panel | URL | Login |
|-------|-----|-------|
| **GoDaddy Dashboard** | https://myh.godaddy.com | Your GoDaddy account |
| **WHM (root)** | https://148.66.152.55:2087 | User: `root` / Pass: `***REDACTED***` |
| **cPanel (user)** | https://148.66.152.55:2083 | User: `propackhub` / Pass: `***REDACTED***` |

> **Tip:** The WHM login credentials are found in the GoDaddy dashboard under your VPS → "Login credentials" → "Manage".

---

## 4. SSH Connection & Sudo Access

### SSH Credentials
```
Host:     propackhub.com  (or 148.66.152.55)
Port:     22
User:     propackhub
Password: ***REDACTED***
```

### How SSH Access Was Configured

1. **SSH password login** — The `propackhub` cPanel user has password `***REDACTED***`
2. **Sudo access** — Was NOT available by default. We added it by running this command in the **WHM Terminal** (https://148.66.152.55:2087 → Terminal):
   ```bash
   echo "propackhub ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/propackhub
   ```
   This gives the `propackhub` user passwordless sudo. The WHM Terminal runs as root.

3. **SSH key file** — There is an encrypted SSH key file `propackhub-ssh` in the project root, but the passphrase is unknown. Password authentication is used instead.

### Testing SSH from Local PC
```bash
ssh propackhub@propackhub.com
# Enter password: ***REDACTED***
# Then test sudo:
sudo whoami
# Should output: root
```

### cPHulk Brute Force Protection
> **WARNING:** If you get too many failed SSH attempts, GoDaddy's **cPHulk** will block your IP and ALL passwords will fail. If this happens:
> 1. Log into **WHM** (https://148.66.152.55:2087) as root
> 2. Search for "cPHulk" in the sidebar
> 3. Go to "Brute Force Protection" → "History/Reports" → Clear blocked IPs
> 4. Or contact GoDaddy support to unblock

### Environment Variables (server/.env)

These SSH/VPS settings live in `server/.env`:
```env
# VPS Deployment Configuration
VPS_HOST=propackhub.com
VPS_SSH_PORT=22
VPS_SSH_USER=propackhub
VPS_SSH_PASSWORD=***REDACTED***
VPS_APP_DIR=/home/propackhub/app
VPS_PUBLIC_HTML=/home/propackhub/public_html
VPS_SERVER_DIR=/home/propackhub/server
VPS_DB_USER=propackhub_user
VPS_DB_PASSWORD=***REDACTED***
```

---

## 5. Git Repository Setup

### Repository
```
URL:    https://github.com/camsalloum/PPH-26.2.git
Branch: main
Owner:  camsalloum
Type:   Private
```

### GitHub PAT (Personal Access Token)
```
***REDACTED_GITHUB_PAT***
```
> When Git asks for a password on `git push`, use this PAT — not your GitHub password.

### Initial Repo Setup (already done)
```bash
cd "d:\PPH 26.2\26.2"
git init
git branch -M main
git remote add origin https://github.com/camsalloum/PPH-26.2.git
git config user.name "Cam"
git config user.email "camsalloum@gmail.com"
git add .
git commit -m "Initial commit"
git push -u origin main
```

### Legacy Remotes (cleaned up)
- Old remotes `pph261` and `pph262` have been removed
- There was a bug where the deploy panel used `git push pph261 main` — this was fixed to `git push origin main`

---

## 6. Deployment Methods

### 6a. Quick Deploy — Command Line (Recommended for code-only updates)

**Step 1: Push code to GitHub**
```
Double-click: Upload-To-GitHub.cmd
```
Or run manually:
```powershell
cd "d:\PPH 26.2\26.2"
powershell -ExecutionPolicy Bypass -File upload-to-github.ps1
```

This script:
- Auto-initializes git if needed
- Ensures remote points to `PPH-26.2.git`
- Stages all changes
- Commits with timestamp
- Pushes to `origin main`

**Step 2: Deploy to VPS (via the app's Deploy panel)**
1. Open the app → Settings → Deploy to VPS tab
2. Click **"Full Deploy to VPS"**
3. Watch the deployment log

### 6b. Automated Deploy — UI Panel

The **Deploy to VPS** panel is located in the app at **Settings → Deploy to VPS**.

**Features:**
- ✅ Test SSH Connection (shows VPS system info)
- ✅ Export Database (local pg_dump of all 3 databases)
- ✅ Full Deploy to VPS (git push → SSH → git pull → build → rsync → pm2 restart)
- ✅ Optional "Include database sync" checkbox

**Full Deploy Steps (automated):**

```
1. Git commit & push to GitHub (local)
2. Build frontend locally (CSS brace validation + Vite build — VPS has only 2GB RAM)
3. SSH into VPS → git pull latest code to /home/propackhub/app
4. SFTP upload build/ → /home/propackhub/public_html/ (atomic swap)
5. npm install --production (backend dependencies on VPS)
6. Stop pm2 → kill ALL processes on port 3001 (including stale Apache CLOSE_WAIT) → start pm2 fresh → health check
7. [Optional] Run pending database migrations (additive only, tracked)
```

**API Endpoints (backend):**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/deployment/status` | GET | Check SSH connectivity, last deploy |
| `/api/deployment/test-connection` | POST | Test SSH + return VPS system info |
| `/api/deployment/export-database` | POST | Local pg_dump of all 3 DBs |
| `/api/deployment/git-push` | POST | git add + commit + push origin main |
| `/api/deployment/build-frontend` | POST | npm run build (local) |
| `/api/deployment/deploy-to-vps` | POST | Full SSH deployment pipeline |
| `/api/deployment/info` | GET | Show current deployment config |

**Key Files:**
- Backend: `server/routes/deployment.js` (537 lines — full SSH automation)
- Frontend: `src/components/settings/DeploymentPanel.jsx` (393 lines — UI panel)
- Styles: `src/components/settings/DeploymentPanel.css`

### 6c. Manual Deploy Steps (if automated deploy fails)

```bash
# 1. From local PC — push to GitHub
cd "d:\PPH 26.2\26.2"
git add .
git commit -m "Update: 2026-02-07"
git push origin main

# 2. SSH into VPS
ssh propackhub@propackhub.com
# Password: ***REDACTED***

# 3. Pull latest code
cd /home/propackhub/app
git pull origin main

# 4. Build frontend
npm install
CI=false npm run build

# 5. Copy frontend to public_html
rsync -a --delete --exclude='.htaccess' --exclude='.well-known' --exclude='cgi-bin' /home/propackhub/app/build/ /home/propackhub/public_html/

# 6. Sync backend
rsync -a --exclude='.env' --exclude='node_modules' --exclude='uploads' --exclude='logs' /home/propackhub/app/server/ /home/propackhub/server/

# 7. Install backend dependencies
cd /home/propackhub/server
npm install --production

# 8. Restart backend
pm2 restart propackhub-backend
# Or if first time:
pm2 start index.js --name propackhub-backend
pm2 save
```

---

## 7. Apache & SPA Routing (.htaccess)

Since the frontend is a **React SPA (Single Page Application)**, all routes must serve `index.html`. Apache handles this via `.htaccess`.

### File: `public/.htaccess` (included in build output)
```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  # If the request is for an existing file or directory, serve it directly
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d

  # Otherwise, fallback to index.html (SPA routing)
  RewriteRule ^ index.html [QSA,L]
</IfModule>
```

This file lives in `public/` so it's automatically copied to `build/` during `npm run build`, and then rsync'd to `public_html/` during deploy.

### Apache ProxyPass for API

The VPS Apache config proxies `/api` requests to the Express backend on port 3001. This is configured in Apache (WHM → Apache Configuration) or via `.htaccess`:
```apache
# API proxy (if not set in Apache config)
ProxyPass /api http://127.0.0.1:3001/api
ProxyPassReverse /api http://127.0.0.1:3001/api
```

Required Apache modules: `mod_rewrite`, `mod_proxy`, `mod_proxy_http`.

---

## 8. PostgreSQL Upgrade (10 → 16)

### Why
- PostgreSQL 10.23 (installed 2017) was **end-of-life** — no security patches
- Local development uses PG 17.5 — some SQL features were incompatible with PG 10

### Upgrade Steps Performed

**1. Backup (195 MB total):**
```bash
sudo mkdir -p /home/propackhub/pg_backups
sudo chmod 777 /home/propackhub/pg_backups
sudo -u postgres pg_dumpall -f /home/propackhub/pg_backups/pg_dumpall_backup.sql
sudo -u postgres pg_dump fp_database -f /home/propackhub/pg_backups/fp_database.sql
sudo -u postgres pg_dump ip_auth_database -f /home/propackhub/pg_backups/ip_auth_database.sql
sudo -u postgres pg_dump propackhub_platform -f /home/propackhub/pg_backups/propackhub_platform.sql
```

**2. Install PG 16 from PGDG repository:**
```bash
sudo dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-8-x86_64/pgdg-redhat-repo-latest.noarch.rpm
sudo dnf -qy module disable postgresql
sudo dnf install -y postgresql16-server postgresql16
sudo /usr/pgsql-16/bin/postgresql-16-setup initdb
```

**3. Copy auth config & migrate:**
```bash
sudo cp /var/lib/pgsql/data/pg_hba.conf /var/lib/pgsql/16/data/pg_hba.conf
sudo chown postgres:postgres /var/lib/pgsql/16/data/pg_hba.conf
sudo systemctl stop postgresql
sudo systemctl start postgresql-16
sudo -u postgres /usr/pgsql-16/bin/psql -f /home/propackhub/pg_backups/pg_dumpall_backup.sql
```

**4. Finalize:**
```bash
sudo systemctl enable postgresql-16    # Auto-start on boot
sudo systemctl disable postgresql      # Disable PG 10 on boot
```

### Result

| Database | Tables | Status |
|----------|--------|--------|
| fp_database | 101 | ✅ Migrated |
| ip_auth_database | 151 | ✅ Migrated |
| propackhub_platform | 12 | ✅ Migrated |

**Backups preserved at:** `/home/propackhub/pg_backups/`

---

## 9. Database Configuration

### Databases

| Name | Purpose | Owner |
|------|---------|-------|
| `fp_database` | Main business data (sales, products, customers, KPIs, budgets) | propackhub_user |
| `ip_auth_database` | Authentication, sessions, user tokens | propackhub_user |
| `propackhub_platform` | SaaS platform: companies, divisions, users (12 tables) | propackhub_user |

### Connection Pools (`server/database/config.js`)

```javascript
// Main pool (fp_database)
{
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'fp_database',
  password: process.env.DB_PASSWORD || '654883',
  port: 5432,
  max: 20,                         // Max pool connections
  idleTimeoutMillis: 30000,        // Close idle after 30s
  connectionTimeoutMillis: 10000,  // Timeout after 10s (was 2s — fixed)
}
```

### Connection Timeout Fix
The original `connectionTimeoutMillis` was `2000` (2 seconds). On the VPS, this caused **500 errors** on `/api/divisions` because the database took slightly longer to respond under load. This was increased to `10000` (10 seconds) on all 3 connection pools.

---

## 10. All Code Fixes — Complete Change Log

### Fix 1: SalesRepReport Chart Visibility
**File:** `src/pages/SalesRepReport/SalesRepReport.css`  
**Problem:** Charts were hidden/invisible after Vite build due to CSS specificity differences.  
**Fix:** Added explicit visibility and overflow rules:
```css
.sales-rep-report .chart-container {
  visibility: visible !important;
  overflow: visible !important;
}
canvas {
  visibility: visible !important;
}
```

### Fix 2: SalesRepReport Chart Rendering
**File:** `src/pages/SalesRepReport/SalesRepReport.jsx`  
**Problem:** Chart.js canvases sometimes rendered as blank due to race condition with CSS transitions.  
**Fix:** Added `requestAnimationFrame` retry logic after chart mount to force canvas re-render:
```javascript
// After chart creation, force visibility
requestAnimationFrame(() => {
  const canvas = chartRef.current;
  if (canvas) {
    canvas.style.visibility = 'visible';
    chart.resize();
  }
});
```

### Fix 3: PerformanceDashboard Chart.js Canvas Restore
**File:** `src/pages/PerformanceDashboard/PerformanceDashboard.jsx`  
**Problem:** Charts would crash on re-render with "Canvas is already in use" error.  
**Fix:** Added proper `Chart.js` instance cleanup — call `chart.destroy()` and use `canvas.getContext('2d').restore()` before creating a new chart instance.

### Fix 4: BudgetAchievementChart Percentage Display
**File:** `src/components/charts/BudgetAchievementChart.jsx`  
**Problem:** Budget achievement percentages were not rendering correctly in the chart tooltip and labels.  
**Fix:** Fixed the data formatting to properly calculate and display percentage values with correct decimal places.

### Fix 5: KPI Executive Summary Overlay Fix
**File:** `src/components/kpi/KPIExecutiveSummary.css`  
**Problem:** Stat card overlays were cutting off content on the KPI page.  
**Fix:** Fixed `overflow` property and adjusted overlay `z-index` values:
```css
.kpi-stat-card {
  overflow: visible;
  position: relative;
}
```

### Fix 6: KPI Heading Gradient
**File:** `src/components/kpi/KPIExecutiveSummary.css`  
**Problem:** Heading text had hardcoded gradient that didn't match the theme.  
**Fix:** Replaced hardcoded gradient with CSS variable references:
```css
.kpi-heading {
  background: linear-gradient(135deg, var(--primary-color), var(--accent-color));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

### Fix 7: Hardcoded Colors → CSS Variables
**Files:** `src/components/kpi/KPIExecutiveSummary.css`, `src/components/kpi/KPIExecutiveSummary.jsx`  
**Problem:** Multiple hardcoded hex colors (`#3b82f6`, `#1e293b`, etc.) caused inconsistency between light/dark themes.  
**Fix:** Replaced all hardcoded colors with CSS custom properties (`var(--primary-color)`, `var(--text-color)`, etc.) to respect theme switching.

### Fix 8: DivisionalDashboardLanding Responsive Layout
**File:** `src/pages/DivisionalDashboardLanding/DivisionalDashboardLanding.css`  
**Problem:** Dashboard landing cards had layout issues on different screen sizes.  
**Fix:** Adjusted CSS grid/flex properties and breakpoints for proper responsive behavior.

### Fix 9: Theme CSS Variables Consolidation
**File:** `src/styles/themes.css`  
**Problem:** Some CSS variables were duplicated or inconsistent between light and dark themes.  
**Fix:** Consolidated all design tokens under `:root` with proper overrides in `[data-theme="dark"]`:
- Transition timings: `--transition-fast` (0.15s), `--transition-normal` (0.25s), `--transition-slow` (0.4s)
- Border radius: `--radius-sm` through `--radius-full`
- Shadows: `--shadow-sm` through `--shadow-xl` + `--shadow-glow`

### Fix 10: Login Page Responsive Logo
**File:** `src/pages/Login/Login.css`  
**Problem:** Logo was either too large on mobile or too small on desktop; inconsistent sizing across breakpoints.  
**Fix:** Added proper breakpoint-based logo sizing:
```css
/* Mobile */
@media (max-width: 480px) {
  .login-logo { max-width: 120px; }
}
/* Tablet */
@media (max-width: 768px) {
  .login-logo { max-width: 150px; }
}
/* Desktop */
.login-logo { max-width: 200px; }
```

### Fix 11: Ant Design 5.x Dropdown Warning
**File:** `src/components/common/NotificationBell.jsx`  
**Problem:** Console warning: "`overlay` is deprecated. Please use `dropdownRender` instead."  
**Fix:** Changed from deprecated API to modern Ant Design 5.x pattern:
```jsx
// Before (deprecated):
<Dropdown overlay={dropdownContent} visible={visible}>

// After (correct):
<Dropdown dropdownRender={() => dropdownContent} open={visible}>
```

### Fix 12: Database Connection Timeout
**File:** `server/database/config.js`  
**Problem:** `/api/divisions` returned 500 error on VPS because `connectionTimeoutMillis: 2000` was too short.  
**Fix:** Increased timeout on all 3 database pools:
```javascript
connectionTimeoutMillis: 10000  // Was 2000
```

### Fix 13: Git Push Remote Bug
**File:** `server/routes/deployment.js`  
**Problem:** Deploy panel was running `git push pph261 main` (old remote name that no longer existed).  
**Fix:** Changed to `git push origin main`.

### Fix 14: SSH Automated Deployment
**Files:** `server/routes/deployment.js` (complete rewrite), `src/components/settings/DeploymentPanel.jsx` (complete rewrite), `src/components/settings/DeploymentPanel.css` (updated)  
**Problem:** Deployment to VPS required manual FTP upload.  
**Fix:** Built full SSH automation using `node-ssh`:
- Test Connection button with VPS system info display
- Export Database (local pg_dump)
- Full Deploy: git push → SSH → git pull → npm build → rsync → pm2 restart
- Optional database sync checkbox
- Real-time deployment log console

### Fix 15: pm2 EADDRINUSE Crash Loop During Deployment (Feb 11, 2026)
**File:** `server/routes/deployment.js` (pm2 restart step)  
**Problem:** After deployment, pm2 entered a crash loop with `EADDRINUSE: address already in use :::3001` (236+ restarts). Two separate issues combined:

**Root cause 1 — Dual pm2 daemons:** Two pm2 daemons were running on the VPS — one as `root` (at `/root/.pm2`) and one as `propackhub` user (at `/home/propackhub/.pm2`). Both had `propackhub-backend` saved in their process lists. Both tried to start Node.js on port 3001. One would succeed, the other would get EADDRINUSE and crash-loop. The user-level daemon was created at some point when someone ran `pm2 start` without `sudo`. The deployment script only talks to root's pm2 (`sudo pm2`), so it never knew about the user-level one.

**Root cause 2 — Apache CLOSE_WAIT:** Apache `mod_proxy` left stale `CLOSE_WAIT` TCP connections to port 3001 after the old Node.js process was killed during deployment. These stale connections also blocked the new Node.js from binding.

**Fix:** Rewrote the pm2 restart step to:
1. Check for and clean user-level pm2 processes first (prevents dual-daemon conflict)
2. Stop root-level pm2
3. Kill ALL processes on port 3001 using `sudo kill -9 $(sudo lsof -ti:3001)` — catches LISTEN, CLOSE_WAIT, and any other state
4. Delete the old pm2 process (resets restart counter to 0)
5. Start pm2 fresh using ecosystem.config.js
6. Save pm2 state

**Prevention:** The deployment now automatically detects and cleans user-level pm2 processes on every deploy. Rule: never run `pm2 start` without `sudo` on the VPS.

**Diagnostic scripts added:**
- `scripts/check-vps-errors.js` — Shows pm2 logs, port status, health check from local PC
- `scripts/fix-vps-port3001.js` — Fixes port 3001 conflicts from local PC
- `scripts/fix-dual-pm2.js` — Fixes dual pm2 daemon issue from local PC
- `scripts/find-rogue-node.js` — Investigates what's running on the VPS

### Fix 16: VPS Security Hardening (Feb 11, 2026)
**Files:** VPS server config (nginx, Apache, MySQL)
**Problem:** Security audit revealed multiple gaps: no WAF, no security headers, MySQL exposed to internet, no firewall rules.

**Changes made:**
1. **ModSecurity WAF** — Installed `mod_security2` via EasyApache 4, enabled OWASP ModSecurity Core Rule Set V3.0. Blocks SQL injection, XSS, and common attack patterns at the Apache level.
2. **Nginx security headers** — Added `/etc/nginx/conf.d/security-headers.conf` with 6 headers:
   - `Strict-Transport-Security` (HSTS, 1 year) — forces HTTPS
   - `X-Frame-Options: SAMEORIGIN` — prevents clickjacking
   - `X-Content-Type-Options: nosniff` — prevents MIME sniffing attacks
   - `X-XSS-Protection: 1; mode=block` — browser XSS filter
   - `Referrer-Policy: strict-origin-when-cross-origin` — limits referrer leaking
   - `Permissions-Policy` — blocks camera, microphone, geolocation
3. **MySQL bound to localhost** — Changed `/etc/my.cnf.d/server.cnf` from `#bind-address=0.0.0.0` to `bind-address=127.0.0.1`. MySQL is not used by the app (PostgreSQL only) but was exposed to the internet by default.

**Already in place (verified):**
- SSL/TLS: Let's Encrypt, TLSv1.2+1.3 only, auto-renews via cPanel
- `server_tokens off` in nginx (hides version)
- cPHulk brute force protection active
- PostgreSQL bound to localhost only
- `.env` files not exposed (nginx SPA routing)

**Diagnostic script:** `scripts/check-security.js` — Full security audit from local PC

### Fix 17: Dynamic RM Sync Column Expansion (Feb 11, 2026)
**File:** `scripts/simple-rm-sync.js`, `migrations/313_create_fp_actualrmdata.sql`
**Problem:** Oracle view `HAP111.XL_FPRMAVERAGES_PMD_111` expanded from 12 to 17 columns (added: MATERIAL, SIZES, STANDARDS, WEIGHTS, REMARKS). The sync script had hardcoded column mappings and silently dropped the 5 new columns.

**Fix:** Rewrote the sync script to be fully dynamic:
1. Reads column list from Oracle at sync time (no hardcoded arrays)
2. Compares against current PostgreSQL table columns
3. Runs `ALTER TABLE ADD COLUMN` for any new columns automatically
4. Uses the dynamic column list for the COPY insert

No manual migrations or VPS SSH needed when Oracle adds columns in the future. The table self-expands on every sync.

### Fix 18: Oracle Sync Cron Collision — RM vs Actual Sales (Feb 12, 2026)
**Files:** `scripts/oracle-sync-cron.sh`, `scripts/cron-rm-sync.sh`, VPS crontab
**Problem:** RM sync cron (`*/30 * * * *`) and actual sales sync cron (`0 22 * * *`) both fired at exactly 22:00 UTC. Both scripts kill any existing VPN before starting their own, so they stomped on each other's VPN tunnel. Result: both syncs failed, and every subsequent RM sync also failed because VPN/routing was in a bad state.

**Fix:**
1. Changed RM cron from every 30 min to every 2 hours: `0 */2 * * *`
2. Offset actual sales cron to 22:10 UTC: `10 22 * * *` (2:10 AM Dubai)
3. Added shared lock file `/tmp/oracle-vpn.lock` to both scripts — if one is running, the other waits up to 10 min instead of killing the VPN
4. Lock file is cleaned up on exit (trap EXIT)

**VPS crontab (current):**
```
0 */2 * * * /home/propackhub/app/scripts/cron-rm-sync.sh >> /home/propackhub/app/logs/rm-sync-cron.log 2>&1
10 22 * * * /home/propackhub/app/scripts/oracle-sync-cron.sh >> /home/propackhub/logs/oracle-sync.log 2>&1
```

### Fix 19: Oracle DNS Resolution + Sync MODULE_NOT_FOUND (Feb 12, 2026)
**Files:** `server/routes/rmSync.js`, `server/routes/oracleDirectSync.js`, `server/ecosystem.config.js`, `server/routes/deployment.js`, VPS `/etc/hosts`
**Problem:** After deployment, UI-triggered Oracle syncs (both RM and actual sales) failed with `Error: Cannot find module 'oracledb'`. Additionally, VPN-based syncs failed because DNS resolved Oracle hostname to wrong IPs.

**Root causes:**
1. **MODULE_NOT_FOUND:** The sync scripts (`simple-rm-sync.js`, `simple-oracle-sync.js`) require `oracledb` which lives in `server/node_modules/`. The API routes ran these scripts via `exec()` without setting `NODE_PATH`, so Node.js couldn't find the module. The cron scripts worked because they set `NODE_PATH` in the shell environment.
2. **DNS inconsistency:** The VPN provides two nameservers (`192.168.100.12` and `192.168.100.22`) that return different IPs for `PRODDB-SCAN.ITSUPPORT.HG`. The first nameserver returns dead IPs (`192.168.100.157/156`), the second returns the correct IP (`10.1.2.99`). Which one gets used depends on `/etc/resolv.conf` ordering, which changes every time VPN reconnects.
3. **Deployment overwrites:** `git reset --hard origin/main` during deployment replaces all VPS files with the git version. If the committed route files don't have the `NODE_PATH` fix, syncs break after every deploy.

**Fix (4 layers of protection):**
1. `rmSync.js` and `oracleDirectSync.js` now pass `NODE_PATH: server/node_modules` in the `exec()` env
2. `ecosystem.config.js` now includes `NODE_PATH` and `LD_LIBRARY_PATH` in its env block — pm2 passes these to all child processes
3. Added `10.1.2.99 PRODDB-SCAN.ITSUPPORT.HG` to VPS `/etc/hosts` — bypasses DNS entirely
4. `deployment.js` Step 3 now verifies `/etc/hosts` has the Oracle entry after every `git pull` — auto-adds it if missing

**All fixes are committed to git, so they survive `git reset --hard` during deployment.**

---

## 11. VPS Directory Structure

```
/home/propackhub/
├── app/                          # Git clone of PPH-26.2 (working copy)
│   ├── .git/
│   ├── build/                    # Vite build output
│   ├── server/
│   ├── src/
│   ├── package.json
│   └── ...
│
├── public_html/                  # Apache document root (frontend)
│   ├── index.html                # SPA entry point
│   ├── .htaccess                 # SPA routing rules
│   ├── assets/                   # Vite-built JS/CSS chunks
│   ├── manifest.json
│   └── ...
│
├── server/                       # Backend (Express + pm2)
│   ├── index.js                  # Entry point
│   ├── .env                      # VPS-specific environment variables
│   ├── routes/
│   ├── database/
│   ├── middleware/
│   ├── node_modules/
│   └── ...
│
└── pg_backups/                   # PostgreSQL backup files
    ├── pg_dumpall_backup.sql     # 67 MB — full cluster dump
    ├── fp_database.sql           # 67 MB
    ├── ip_auth_database.sql      # 433 KB
    └── propackhub_platform.sql   # 52 KB
```

---

## 12. Troubleshooting

### SSH Connection Fails
```
Error: "All configured authentication methods failed"
```
**Cause:** Password changed or IP blocked by cPHulk.  
**Fix:**
1. Go to WHM (https://148.66.152.55:2087)
2. Search "cPHulk" → Brute Force Protection → History → Clear blocked IPs
3. Or reset password from GoDaddy dashboard

### 500 Error on API Endpoints
```
Error: "Connection terminated due to connection timeout"
```
**Cause:** Database pool timeout too short.  
**Fix:** In `server/database/config.js`, ensure `connectionTimeoutMillis: 10000`.

### pm2 Crash Loop — EADDRINUSE: address already in use :::3001
```
Error: listen EADDRINUSE: address already in use :::3001
pm2 shows 50+ restarts, status "waiting restart" or "errored"
```
**Cause:** Two possible causes (often combined):
1. **Dual pm2 daemons** — A root pm2 (`/root/.pm2`) and a user pm2 (`/home/propackhub/.pm2`) both trying to run `propackhub-backend` on port 3001. Created when someone runs `pm2 start` without `sudo`.
2. **Apache CLOSE_WAIT** — Apache `mod_proxy` leaves stale TCP connections to port 3001 after the old Node.js exits during deployment.

**How the deploy script prevents this (Feb 11, 2026 fix):**
The deployment now: (A) detects and cleans user-level pm2 processes, (B) stops root pm2, (C) kills ALL processes on port 3001, (D) deletes and re-creates the pm2 process fresh.

**Rule: NEVER run `pm2 start` without `sudo` on the VPS.** Always use `sudo pm2`.

**Manual fix if it happens anyway:**
```bash
# SSH into VPS
ssh propackhub@propackhub.com

# Kill user-level pm2
pm2 stop all && pm2 delete all && pm2 save --force && pm2 kill

# Kill root-level pm2 process
sudo pm2 stop propackhub-backend && sudo pm2 delete propackhub-backend

# Kill everything on port 3001
sudo kill -9 $(sudo lsof -ti:3001)

# Start fresh via root pm2
sudo pm2 start /home/propackhub/app/server/ecosystem.config.js
sudo pm2 save

# Verify
sudo pm2 list   # Should show 0 restarts, status "online"
curl http://localhost:3001/api/health   # Should return 200
```

**Diagnostic scripts (run from local PC):**
```bash
node scripts/check-vps-errors.js    # Shows pm2 logs, port status, health check
node scripts/fix-dual-pm2.js        # Fixes dual pm2 daemon issue
node scripts/fix-vps-port3001.js    # Fixes port 3001 conflicts
node scripts/find-rogue-node.js     # Investigates what's running on VPS
```

### Charts Not Rendering After Deploy
**Cause:** CSS specificity changes between dev and production build.  
**Fix:** Ensure `visibility: visible !important` on chart containers and canvas elements (see Fix #1).

### Oracle Sync Fails — VPN Connected but Oracle Not Reachable
```
[oracle-sync-cron] VPN tunnel established.
[oracle-sync-cron] Oracle NOT reachable through VPN. Aborting.
```
**Cause:** VPN DNS nameservers return wrong IPs for `PRODDB-SCAN.ITSUPPORT.HG`.  
**Fix:** Ensure `/etc/hosts` on VPS has the correct Oracle IP:
```bash
# Check
grep PRODDB-SCAN /etc/hosts

# Add if missing
echo "10.1.2.99  PRODDB-SCAN.ITSUPPORT.HG" | sudo tee -a /etc/hosts
```
The deployment script now does this automatically (Fix 19).

### Oracle Sync Fails — Cannot find module 'oracledb'
```
Error: Cannot find module 'oracledb'
Require stack: /home/propackhub/app/scripts/simple-rm-sync.js
```
**Cause:** `NODE_PATH` not set when the API route runs the sync script via `exec()`.  
**Fix:** Already fixed in `rmSync.js`, `oracleDirectSync.js`, and `ecosystem.config.js` (Fix 19). If it recurs after deploy, verify:
```bash
# Check pm2 has NODE_PATH
sudo pm2 env 0 | grep NODE_PATH
# Should show: NODE_PATH: /home/propackhub/app/server/node_modules

# If missing, restart with ecosystem config
sudo pm2 delete propackhub-backend
sudo pm2 start /home/propackhub/app/server/ecosystem.config.js
sudo pm2 save
```

### Oracle Sync Diagnostic Scripts
```bash
node scripts/check-oracle-cron.js          # Check crontab, logs, last sync times
node scripts/verify-both-syncs.js          # Run both syncs end-to-end via API
node scripts/test-vpn-oracle-connection.js # Test VPN + Oracle connectivity
node scripts/check-rm-columns.js           # Check RM table columns and row count
```

### SPA Routes Return 404 on VPS
**Cause:** Missing `.htaccess` in `public_html`.  
**Fix:** Ensure `public/.htaccess` exists in the project (it's auto-copied to `build/` and then rsync'd to `public_html/`). The rsync command uses `--exclude='.htaccess'` to preserve the existing one.

### pm2 "process not found"
**Fix:** First-time start:
```bash
cd /home/propackhub/server
pm2 start index.js --name propackhub-backend
pm2 save
pm2 startup    # Auto-start on server reboot
```

### PostgreSQL Service Not Starting
```bash
# Check which PG version is running
sudo systemctl status postgresql-16
sudo systemctl status postgresql

# If PG 16 isn't starting, check logs
sudo tail -50 /var/lib/pgsql/16/data/log/postgresql-*.log
```

### VPS "propackhub is not in the sudoers file"
**Fix:** Run this from WHM Terminal (root):
```bash
echo "propackhub ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/propackhub
```

---

## 13. Quick Reference / Cheat Sheet

### Deploy Code Update (fastest path)
```
1. Double-click: Upload-To-GitHub.cmd       ← pushes to GitHub
2. Open app → Settings → Deploy to VPS → Full Deploy  ← deploys to VPS
   (or use Manual Deploy Steps from Section 6c)
```

### Key Commands — Local
```powershell
npm run dev              # Start Vite dev server
npm run build            # Build for production
cd server && node index.js   # Start backend
```

### Key Commands — VPS (over SSH)
```bash
pm2 list                           # Show running processes
pm2 restart propackhub-backend     # Restart backend
pm2 logs propackhub-backend        # View backend logs
sudo systemctl status postgresql-16 # Check PostgreSQL
sudo -u postgres psql              # Open PostgreSQL shell
```

### Key URLs
| URL | Purpose |
|-----|---------|
| http://localhost:3000 | Local dev frontend |
| http://localhost:3001/api | Local dev API |
| https://propackhub.com | Live site |
| https://propackhub.com/api | Live API (proxied) |
| https://148.66.152.55:2083 | cPanel — User: `propackhub` / Pass: `***REDACTED***` |
| https://148.66.152.55:2087 | WHM — User: `root` / Pass: `***REDACTED***` |
| https://github.com/camsalloum/PPH-26.2 | GitHub repo |

### Key Files — Quick Reference
| File | Purpose |
|------|---------|
| `server/.env` | All credentials & VPS config |
| `server/routes/deployment.js` | SSH deployment automation |
| `server/routes/rmSync.js` | RM sync API (Oracle → fp_actualrmdata) |
| `server/routes/oracleDirectSync.js` | Actual sales sync API (Oracle → fp_raw_oracle) |
| `server/ecosystem.config.js` | pm2 config (NODE_PATH, LD_LIBRARY_PATH) |
| `scripts/oracle-sync-cron.sh` | Cron: actual sales sync (2:10 AM Dubai daily) |
| `scripts/cron-rm-sync.sh` | Cron: RM sync (every 2 hours) |
| `scripts/simple-oracle-sync.js` | Oracle actual sales sync script |
| `scripts/simple-rm-sync.js` | Oracle RM sync script (dynamic columns) |
| `server/database/config.js` | DB pool configuration |
| `src/components/settings/DeploymentPanel.jsx` | Deploy UI |
| `public/.htaccess` | SPA routing for Apache |
| `upload-to-github.ps1` | Git push script |
| `Upload-To-GitHub.cmd` | Double-click to push |
| `START-SERVERS.cmd` | Start local dev environment |
| `vite.config.js` | Frontend build config |

---

## 14. Security Configuration

### SSL/TLS
- **Certificate:** Let's Encrypt (auto-renewed by cPanel)
- **Protocol:** TLSv1.2 + TLSv1.3 only (configured in nginx)
- **Status:** ✅ Secure

### ModSecurity WAF (installed Feb 11, 2026)
- Installed via WHM → Software → EasyApache 4 → Apache Modules → `mod_security2`
- Enable: WHM → Security Center → ModSecurity Configuration → ON
- Vendor rules: WHM → Security Center → ModSecurity Vendors → enable OWASP Core Rule Set
- Blocks SQL injection, XSS, and common attack patterns at the Apache level

### cPHulk Brute Force Protection
- **Status:** ✅ Active (built into cPanel)
- Blocks IPs after repeated failed login attempts (SSH, cPanel, WHM)
- If your IP gets blocked: WHM → cPHulk → History/Reports → Clear

### Nginx Security (configured Feb 11, 2026)
- `server_tokens off` — hides nginx version ✅
- Security headers via `/etc/nginx/conf.d/users/propackhub/security-headers.conf`:
  - `Strict-Transport-Security` (HSTS) — forces HTTPS for 1 year ✅
  - `X-Frame-Options: SAMEORIGIN` — prevents clickjacking ✅
  - `X-Content-Type-Options: nosniff` — prevents MIME sniffing ✅
  - `X-XSS-Protection: 1; mode=block` — XSS filter ✅
  - `Referrer-Policy: strict-origin-when-cross-origin` — limits referrer leaking ✅
  - `Permissions-Policy` — blocks camera, microphone, geolocation ✅
  - `Content-Security-Policy` — whitelists allowed script/style/font/image sources ✅
- Headers are set at the nginx server block level (not Apache) to avoid duplicates
- `proxy_hide_header` strips any Apache-added duplicates before nginx adds its own
- securityheaders.com grade: A+

### Network Security
- PostgreSQL: bound to `127.0.0.1` only ✅ (not exposed to internet)
- MySQL: bound to `127.0.0.1` only ✅ (changed Feb 11, 2026 — was `0.0.0.0`. Config: `/etc/my.cnf.d/server.cnf` → `bind-address=127.0.0.1`. Not used by app, installed by cPanel default)
- `.env` files: NOT exposed via web (nginx SPA routing returns index.html for unknown paths) ✅

### Security Audit Script
```bash
node scripts/check-security.js    # Full audit: SSL, headers, firewall, ports, WAF
```

---

*End of document. Last updated: February 12, 2026*
