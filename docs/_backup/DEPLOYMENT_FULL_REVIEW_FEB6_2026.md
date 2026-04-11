# ProPackHub Deployment - Full Review & Corrected Plan
**Date:** February 6, 2026
**Reviewed by:** Deep code analysis of actual source files

---

## CURRENT STATE: What's Actually Done vs What Docs Say

### ✅ CONFIRMED CORRECT (verified against actual code)

1. **Frontend API URLs** - FIXED
   - All `||` changed to `??` for `VITE_API_URL` - verified, no `||` patterns remain
   - No `localhost:3001` in source files (only a harmless comment in AuthContext.jsx)
   - `.env.production` has empty `VITE_API_URL=` - correct
   - Build output uses relative URLs (`/api/...`)

2. **Vite Build Config** - CORRECT
   - `vite.config.js` outputs to `build/` folder
   - Dev proxy configured for `/api` and `/uploads` to `localhost:3001`
   - Chunk splitting configured for vendor libraries

3. **Backend Route Structure** - CORRECT
   - All routes mounted under `/api/` prefix in `server/config/express.js`
   - Auth: `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`
   - 40+ route modules properly mounted

4. **Database Import** - COMPLETED
   - `fp_database`: 101 tables imported
   - `ip_auth_database`: 152 tables imported
   - Users table has 7 users including `camille@interplast-uae.com`
   - Import script (`scripts/import-backup-to-vps.js`) is correct

5. **PM2 Process** - RUNNING
   - Backend running as `propackhub-backend` on port 3001

---

### ❌ ISSUES FOUND (comparing code vs VPS config)

#### ISSUE 1: VPS `.env` has `NODE_ENV=development` (WRONG)
**File on VPS:** `/home/propackhub/server/.env`
**Current:** `NODE_ENV=development`
**Should be:** `NODE_ENV=production`

**Impact:** 
- Refresh token cookie has `secure: false` (not HTTPS-only) because:
  ```javascript
  // server/routes/auth.js line 193
  secure: process.env.NODE_ENV === 'production'
  ```
- CORS origin falls back to `http://localhost:3000` instead of `https://propackhub.com`
- Database config uses development fallback password `654883` if DB_PASSWORD is missing
- Security middleware may be relaxed

**Fix:** Change to `NODE_ENV=production` in VPS `.env`

---

#### ISSUE 2: Missing PostgreSQL Sequences (BLOCKING LOGIN)
**Error:** `null value in column "id" violates not-null constraint` on `user_sessions`

**Root Cause:** The import script creates tables from JSON structure but skips `nextval()` sequences because line 62 explicitly filters them out:
```javascript
if (col.column_default && !col.column_default.includes('nextval')) {
  def += ` DEFAULT ${col.column_default}`;
}
```

This means ALL tables with auto-increment IDs are missing their sequences. This affects:
- `user_sessions` (confirmed broken - blocks login)
- `users` (will break user registration)
- `user_divisions`, `user_preferences`, `user_sales_rep_access`
- `approval_requests`, `authorization_rules`
- Many more tables with serial/bigserial ID columns

**Fix:** Run the fix-sequences script (see below)

---

#### ISSUE 3: `.htaccess` Proxy Rule (NEEDS VERIFICATION)
**Current in VPS_DEPLOYMENT_COMPLETE_GUIDE.md:**
```apache
RewriteRule ^api/(.*)$ http://localhost:3001/api/$1 [P,L]
```

**Correct (from conversation summary):**
```apache
RewriteRule ^(.*)$ http://localhost:3001/$1 [P,L]
```

**Why:** Backend routes are mounted as `/api/auth`, `/api/settings`, etc. The proxy must pass the FULL path including `/api/` prefix. Using `^api/(.*)$` strips the `/api/` prefix.

**The correct `.htaccess`:**
```apache
# php -- BEGIN cPanel-generated handler, do not edit
<IfModule mime_module>
  AddHandler application/x-httpd-ea-php82 .php .php8 .phtml
</IfModule>
# php -- END cPanel-generated handler, do not edit

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

**Status:** This was already corrected during the session. Verify it's still correct on VPS.

---

#### ISSUE 4: Refresh Token Cookie Path
**Code in `server/routes/auth.js`:**
```javascript
path: '/api/auth/refresh' // Only send to refresh endpoint
```

This is correct BUT requires the proxy to pass the exact path `/api/auth/refresh` to the backend. If the `.htaccess` strips `/api/`, the cookie won't be sent. This is another reason the `.htaccess` MUST use `^(.*)$` pattern.

---

#### ISSUE 5: VPS `.env` Missing `NODE_ENV=production`
**Local `.env` (PC):**
```
DB_USER=postgres
DB_PASSWORD=654883
CORS_ORIGIN=http://localhost:3000
```

**VPS `.env` should be:**
```
NODE_ENV=production
DB_USER=propackhub_user
DB_PASSWORD=***REDACTED***
CORS_ORIGIN=https://propackhub.com
```

The `NODE_ENV=production` is critical because `server/database/config.js` line 14:
```javascript
password: process.env.DB_PASSWORD || (isProduction ? null : '654883'),
```
In development mode, it falls back to `654883`. In production, it requires `DB_PASSWORD` to be set.

---

#### ISSUE 6: JWT Secrets Not Changed for Production
**Current:** `JWT_SECRET=ipd-secret-key-change-in-production`
**Should be:** A random 64-character hex string

**Impact:** Anyone who reads the source code can forge JWT tokens.

**Fix (generate on VPS):**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Use the output for both `JWT_SECRET` and `JWT_REFRESH_SECRET`.

**Priority:** Medium - not blocking, but a security risk.

---

### ⚠️ DOCUMENT ERRORS FOUND

1. **`docs/VPS_DEPLOYMENT_COMPLETE_GUIDE.md`** - Phase 6 `.htaccess` example is WRONG
   - Shows `^api/(.*)$` pattern which strips `/api/` prefix
   - Should be `^(.*)$` to pass full path

2. **`docs/VPS_DEPLOYMENT_COMPLETE_GUIDE.md`** - Phase 3 shows `your_secure_password`
   - Should document actual credential: `***REDACTED***`

3. **`docs/VPS_DEPLOYMENT_COMPLETE_GUIDE.md`** - PM2 process name inconsistent
   - Doc says `propackhub-api` but actual PM2 process is `propackhub-backend`

4. **`DEPLOYMENT_READY_FEB5.md`** - Says "ALL ISSUES FIXED" but database sequences are broken

---

## CORRECTED VPS `.env` FILE

This is what `/home/propackhub/server/.env` should contain:

```env
# ================================
# ProPackHub Server Configuration
# ================================

# Environment - MUST be production on VPS
NODE_ENV=production

# Server
PORT=3001

# Database Configuration (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_USER=propackhub_user
DB_PASSWORD=***REDACTED***
DB_NAME=fp_database
AUTH_DB_NAME=ip_auth_database

# Platform Database (SaaS multi-tenant)
PLATFORM_DB_NAME=propackhub_platform

# Database Pool
DB_POOL_MAX=20

# JWT Configuration
JWT_SECRET=ipd-secret-key-change-in-production
JWT_REFRESH_SECRET=ipd-refresh-secret-key-change-in-production
JWT_ACCESS_EXPIRY=3650d
JWT_REFRESH_EXPIRY=3650d

# CORS
CORS_ORIGIN=https://propackhub.com

# Logging
LOG_LEVEL=info

# File Upload
MAX_UPLOAD_SIZE=50mb
UPLOAD_DIR=./uploads
```

**Key changes from current VPS `.env`:**
- `NODE_ENV=production` (was `development`)
- `DB_PASSWORD=***REDACTED***` (was `Phh654883!` - typo fixed)
- Oracle credentials removed (not needed on VPS unless ERP sync is required)

---

## NEXT STEPS - EXACT ORDER

### Step 1: Fix Database Sequences (BLOCKING)
Upload and run `scripts/fix-sequences.js` on VPS.

### Step 2: Fix VPS `.env`
Change `NODE_ENV=development` to `NODE_ENV=production`.

### Step 3: Restart Backend
```bash
pm2 restart propackhub-backend
```

### Step 4: Verify `.htaccess`
```bash
cat /home/propackhub/public_html/.htaccess
```
Confirm it uses `^(.*)$` pattern, NOT `^api/(.*)$`.

### Step 5: Test Login
Open `https://propackhub.com` in incognito mode and login.

### Step 6: Verify Full Application
- Dashboard loads
- Data displays correctly
- Navigation works
- API calls return 200

---

## DAILY UPDATE WORKFLOW (After Initial Deployment Works)

### When You Make Changes on PC:

1. **Frontend changes:**
   ```cmd
   npm run build
   ```
   Upload `build/` folder to VPS `/home/propackhub/public_html/`

2. **Backend changes:**
   Upload changed files to `/home/propackhub/server/`
   ```bash
   pm2 restart propackhub-backend
   ```

3. **Database changes:**
   Run migration scripts on VPS

### Recommended: Git-Based Workflow
```bash
# On PC after changes:
git add .
git commit -m "description of changes"
git push pph261 main

# On VPS:
cd /home/propackhub
git pull origin main
npm run build  # if frontend changed
pm2 restart propackhub-backend  # if backend changed
```

---

## ARCHITECTURE SUMMARY

```
Browser (https://propackhub.com)
    │
    ▼
Apache (port 443, SSL)
    │
    ├── /api/*  ──────► Node.js Backend (port 3001)
    │                       │
    │                       ├── fp_database (sales data)
    │                       ├── ip_auth_database (users, sessions)
    │                       └── propackhub_platform (SaaS)
    │
    ├── /uploads/* ───► Node.js Backend (port 3001)
    │
    └── /* ───────────► React SPA (index.html + assets)
```
