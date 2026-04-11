# 🔴 PHASE 1: SECURITY FIXES - ACTION PLAN

**Status:** Ready to Execute  
**Time Required:** 2-3 hours  
**Priority:** CRITICAL - Must complete before deployment

---

## ✅ WHAT WE FOUND

### Good News:
- ✅ DOMPurify is already installed (v3.2.7)
- ✅ Most files already use `import.meta.env.VITE_API_URL`
- ✅ JWT secrets exist (need to be regenerated)

### Issues to Fix:
- ❌ 2 XSS vulnerabilities (dangerouslySetInnerHTML)
- ❌ 10 files with hardcoded `http://localhost:3001`
- ❌ Weak JWT secrets in `.env` files
- ❌ No production `.env` file

---

## 📋 FIX CHECKLIST

### Fix 1: XSS Vulnerabilities (15 minutes)
- [ ] Fix WriteUpView.jsx (line 915)
- [ ] Fix ProductGroupTable.jsx (line 615)

### Fix 2: Hardcoded URLs (30 minutes)
- [ ] Fix 10 files with hardcoded URLs
- [ ] Create frontend `.env` file

### Fix 3: JWT Secrets (10 minutes)
- [ ] Generate strong JWT secrets
- [ ] Create production `.env` files
- [ ] Update `.gitignore`

### Fix 4: Test Everything (30 minutes)
- [ ] Test locally
- [ ] Build production version
- [ ] Verify no errors

---

## 🔧 FIX 1: XSS VULNERABILITIES

### File 1: src/components/writeup/WriteUpView.jsx (Line 915)

**Current Code (VULNERABLE):**
```javascript
<div dangerouslySetInnerHTML={{ __html: formatWriteupForDisplay(writeup) }} />
```

**Fixed Code:**
```javascript
import DOMPurify from 'dompurify';

// In the component, replace line 915 with:
<div dangerouslySetInnerHTML={{ 
  __html: DOMPurify.sanitize(formatWriteupForDisplay(writeup)) 
}} />
```

**Action:**
1. Open `src/components/writeup/WriteUpView.jsx`
2. Add import at top: `import DOMPurify from 'dompurify';`
3. Replace line 915 with the fixed code above

---

### File 2: src/components/dashboard/ProductGroupTable.jsx (Line 615)

**Current Code (VULNERABLE):**
```javascript
<th ... dangerouslySetInnerHTML={{ __html: `${col.deltaLabel}<br/>%` }} />
```

**Fixed Code (Remove dangerouslySetInnerHTML):**
```javascript
<th key={`delta-year-${index}`} rowSpan="3" style={{ backgroundColor: '#1976d2', color: '#fbbf24', fontWeight: 'bold' }}>
  {col.deltaLabel}
  <br />
  %
</th>
```

**Action:**
1. Open `src/components/dashboard/ProductGroupTable.jsx`
2. Find line 615
3. Replace with the fixed code above (no dangerouslySetInnerHTML)

---

## 🔧 FIX 2: HARDCODED URLs

### Files That Need Fixing:

Most files already use environment variables correctly! Only these need fixes:

1. `src/hooks/useAggregatedDashboardData.js` (2 locations)
2. `src/contexts/SalesRepReportsContext.jsx` (1 location)
3. `src/contexts/SalesDataContext.jsx` (2 locations)
4. `src/contexts/SalesCountryContext.jsx` (2 locations)
5. `src/contexts/FilterContext.jsx` (6 locations)
6. `src/components/reports/CustomerKeyFactsNew.jsx` (2 locations)
7. `src/components/reports/CustomersAmountTable.jsx` (2 locations)
8. `src/components/reports/ExecutiveSummary.jsx` (1 location)
9. `src/components/reports/CustomersKgsTable.jsx` (2 locations)

### Quick Fix Pattern:

**Add at the top of each file:**
```javascript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
```

**Then replace all instances of:**
```javascript
// ❌ BEFORE
fetch('http://localhost:3001/api/...')

// ✅ AFTER
fetch(`${API_BASE_URL}/api/...`)
```

---

## 🔧 FIX 3: JWT SECRETS & ENVIRONMENT FILES

### Step 1: Generate Strong Secrets

Run this command to generate secrets:

```bash
# Generate JWT Secret
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# Generate JWT Refresh Secret
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

**Save these secrets!** You'll need them in the next step.

### Step 2: Create Frontend .env File

Create: `.env` (in project root)

```bash
# Frontend Environment Variables
VITE_API_URL=http://localhost:3001
VITE_APP_NAME=ProPackHub
```

### Step 3: Create Production Backend .env

Create: `server/.env.production`

```bash
# ================================
# PRODUCTION ENVIRONMENT VARIABLES
# ================================
# ⚠️ NEVER COMMIT THIS FILE TO GIT!

# Environment
NODE_ENV=production
PORT=3001

# Database Configuration (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_USER=propackhub_user
DB_PASSWORD=CHANGE_THIS_TO_STRONG_PASSWORD
DB_NAME=fp_database
AUTH_DB_NAME=ip_auth_database
PLATFORM_DB_NAME=propackhub_platform

# Database Pool
DB_POOL_MAX=20

# Oracle ERP Database Connection
ORACLE_HOST=PRODDB-SCAN.ITSUPPORT.HG
ORACLE_PORT=1521
ORACLE_SID=REPDB
ORACLE_USER=camille
ORACLE_PASSWORD=CHANGE_THIS_TO_ORACLE_PASSWORD

# JWT Configuration (PASTE YOUR GENERATED SECRETS HERE)
JWT_SECRET=PASTE_GENERATED_SECRET_HERE
JWT_REFRESH_SECRET=PASTE_GENERATED_REFRESH_SECRET_HERE
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=60d

# CORS
CORS_ORIGIN=https://propackhub.com

# Logging
LOG_LEVEL=info

# Optional: Redis Cache
# REDIS_URL=redis://localhost:6379
```

### Step 4: Update .gitignore

Verify these lines are in `.gitignore`:

```bash
# Environment files
.env
.env.local
.env.production
.env.*.local
server/.env
server/.env.production
server/.env.local

# Never commit secrets!
*.key
*.pem
```

---

## 🧪 FIX 4: TEST EVERYTHING

### Test Locally

```bash
# 1. Install dependencies (if needed)
npm install

# 2. Start development servers
START-SERVERS.cmd

# 3. Open browser
# http://localhost:3000

# 4. Test these pages:
# - Login page
# - Dashboard
# - Sales reports
# - Customer list
# - Any page you changed

# 5. Check browser console for errors
# Press F12 → Console tab
# Should see no red errors
```

### Test Production Build

```bash
# 1. Build frontend
npm run build

# 2. Check build succeeded
# Should see: "build complete" message
# Should create: build/ folder

# 3. Test backend with production env
cd server
set NODE_ENV=production
node index.js

# 4. Should start without errors
# Check: http://localhost:3001/api/health
```

---

## 📝 AUTOMATED FIX SCRIPT

I'll create an automated script to fix most issues for you.

