# ProPackHub Deployment Master Plan
**Created:** February 6, 2026
**Status:** IMPLEMENTED ✅

---

## What Was Built

### 1. Deploy Button in Settings (Admin Only)
- **Location:** Settings → "Deploy to VPS" tab
- **Component:** `src/components/settings/DeploymentPanel.jsx`
- **Features:**
  - Export Database button (creates complete SQL dumps)
  - Deploy Code button (git push + build)
  - Full Deploy button (all-in-one)
  - Live deployment logs
  - Manual upload instructions

### 2. Backend Deployment API
- **Location:** `server/routes/deployment.js`
- **Endpoints:**
  - `GET /api/deployment/status` - Check deployment status
  - `POST /api/deployment/export-database` - Export using pg_dump
  - `POST /api/deployment/git-push` - Commit and push to GitHub
  - `POST /api/deployment/build-frontend` - Run npm build

### 3. Database Export Script
- **Location:** `scripts/export-database-full.ps1`
- **What it exports:**
  - All tables with data
  - All sequences (auto-increment)
  - All views
  - All functions and triggers
  - All indexes

### 4. VPS Import Script
- **Location:** `scripts/vps-import-database.sh`
- **Run on VPS to import the SQL dumps**

---

## How to Use

### Option A: From the App (Recommended)
1. Login as admin
2. Go to Settings → "Deploy to VPS" tab
3. Click "Full Deploy" button
4. Wait for export and build to complete
5. Upload files to VPS using WHM File Manager
6. Run import script on VPS

### Option B: From Command Line
```powershell
# On PC
cd "D:\PPH 26.01"
.\scripts\export-database-full.ps1
npm run build
.\upload-to-pph261.ps1
```

Then on VPS:
```bash
bash /home/propackhub/scripts/vps-import-database.sh
pm2 restart propackhub-backend
```

---

## Files Created/Modified

### New Files
- `src/components/settings/DeploymentPanel.jsx` - UI component
- `src/components/settings/DeploymentPanel.css` - Styles
- `server/routes/deployment.js` - API endpoints
- `scripts/export-database-full.ps1` - Database export
- `scripts/vps-import-database.sh` - VPS import
- `scripts/deploy-to-vps.ps1` - Full deployment script
- `docs/DEPLOYMENT_MASTER_PLAN.md` - This document

### Modified Files
- `server/config/express.js` - Added deployment routes
- `src/components/settings/Settings.jsx` - Added deployment tab

---

## Immediate Fix for Current VPS

The VPS is missing views and sequences. To fix NOW:

### Step 1: Export from PC
```powershell
cd "D:\PPH 26.01"
.\scripts\export-database-full.ps1
```

### Step 2: Upload to VPS
Upload `database-export-full/` folder to `/home/propackhub/database-export-full/`

### Step 3: Import on VPS
```bash
cd /home/propackhub
PGPASSWORD='***REDACTED***' psql -h localhost -U propackhub_user -d fp_database -f database-export-full/fp_database_full.sql
PGPASSWORD='***REDACTED***' psql -h localhost -U propackhub_user -d ip_auth_database -f database-export-full/ip_auth_database_full.sql
pm2 restart propackhub-backend
```

---

## Why This Works

| Old Approach (JSON) | New Approach (pg_dump) |
|---------------------|------------------------|
| ❌ Tables only | ✅ Tables + Data |
| ❌ No sequences | ✅ Sequences included |
| ❌ No views | ✅ Views included |
| ❌ No functions | ✅ Functions included |
| ❌ No triggers | ✅ Triggers included |
| ❌ Manual fixes | ✅ Everything automatic |

---

## VPS Credentials (Reference)

- **Host:** propackhub.com (148.66.152.55)
- **DB User:** propackhub_user
- **DB Password:** ***REDACTED***
- **Databases:** fp_database, ip_auth_database, propackhub_platform
- **PM2 Process:** propackhub-backend
- **Paths:**
  - Frontend: `/home/propackhub/public_html/`
  - Backend: `/home/propackhub/server/`
  - Database exports: `/home/propackhub/database-export-full/`

