# 🚀 PROPACKHUB DEPLOYMENT PLAN - COMPLETE GUIDE

**Project:** ProPackHub SaaS Platform (PEBI Application)  
**Domain:** propackhub.com (GoDaddy)  
**Infrastructure:** Non-shared VPS with cPanel  
**Created:** February 4, 2026  
**Status:** Production Deployment Ready

---

## 📋 TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Current Project State](#2-current-project-state)
3. [Infrastructure Requirements](#3-infrastructure-requirements)
4. [Pre-Deployment Checklist](#4-pre-deployment-checklist)
5. [Security Hardening](#5-security-hardening)
6. [Database Setup](#6-database-setup)
7. [Backend Deployment](#7-backend-deployment)
8. [Frontend Deployment](#8-frontend-deployment)
9. [Oracle ERP Automation](#9-oracle-erp-automation)
10. [CI/CD Pipeline](#10-cicd-pipeline)
11. [Monitoring & Maintenance](#11-monitoring--maintenance)
12. [Backup Strategy](#12-backup-strategy)
13. [Troubleshooting Guide](#13-troubleshooting-guide)

---

## 1. EXECUTIVE SUMMARY

### What is ProPackHub?

**ProPackHub** is a comprehensive SaaS platform for the packaging industry with:
- **Multi-tenant architecture** (multiple companies, isolated data)
- **PEBI Application** (Packaging Enterprise Business Intelligence)
  - MIS/IMS: Management Information System (Analytics, KPIs, Budgeting)
  - CRM: Customer Relationship Management
  - MES: Manufacturing Execution System (planned)
- **Real-time Oracle ERP integration** (currently manual, needs automation)
- **React + Node.js + PostgreSQL** stack

### Current State
- ✅ **Development Complete**: Fully functional on localhost
- ✅ **Multi-tenant Ready**: Platform database + tenant isolation
- ⚠️ **Oracle Sync**: Manual process, needs automation
- ⚠️ **Security**: Some hardcoded values need fixing
- ❌ **Not Deployed**: Running on local development only

### Deployment Goals
1. Deploy to propackhub.com VPS with SSL
2. Automate Oracle ERP data sync (currently manual)
3. Enable daily development → production updates
4. Implement proper security and monitoring
5. Set up automated backups


---

## 2. CURRENT PROJECT STATE

### Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | React | 18.3.1 | UI Framework |
| | Vite | 7.3.0 | Build tool & dev server |
| | Ant Design | 5.25.1 | UI components |
| | ECharts | 5.4.3 | Data visualization |
| **Backend** | Node.js | 18+ | Runtime |
| | Express | 5.1.0 | API server |
| | PostgreSQL | 14+ | Primary database |
| | Redis | 5.10.0 | Caching (optional) |
| **Integration** | Oracle ODBC | - | ERP data sync |
| **DevOps** | Docker | - | Containerization |
| | PM2 | - | Process management |

### Database Architecture

```
┌─────────────────────────────────────────────────────────────┐
│         Platform Database (propackhub_platform)             │
│  • Companies (tenants)                                      │
│  • Subscription plans                                       │
│  • Platform admins                                          │
│  • Tenant metrics                                           │
└─────────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┴─────────────────┐
        │                                   │
┌───────▼──────────┐              ┌────────▼─────────┐
│ Tenant Auth DB   │              │ Tenant Data DB   │
│ ip_auth_database │              │ fp_database      │
│ • Users          │              │ • Sales data     │
│ • Permissions    │              │ • Customers      │
│ • Settings       │              │ • Budgets        │
└──────────────────┘              └──────────────────┘
```

### Current Issues to Fix Before Deployment

| Issue | Priority | Location | Fix Required |
|-------|----------|----------|--------------|
| **XSS Vulnerabilities** | 🔴 CRITICAL | 2 locations | Add DOMPurify sanitization |
| **Hardcoded URLs** | 🔴 HIGH | 40+ files | Use environment variables |
| **Hardcoded Credentials** | 🔴 CRITICAL | server/.env | Move to secure vault |
| **JWT Secrets** | 🔴 CRITICAL | .env files | Generate strong secrets |
| **Console.log** | 🟡 MEDIUM | 60+ locations | Remove or gate by NODE_ENV |
| **Legacy Table Queries** | 🟡 MEDIUM | 3 queries | Update to new tables |
| **Memory Leaks** | 🟡 MEDIUM | 4 setInterval | Add cleanup |


---

## 3. INFRASTRUCTURE REQUIREMENTS

### VPS Specifications (Minimum)

| Resource | Minimum | Recommended | Notes |
|----------|---------|-------------|-------|
| **CPU** | 2 cores | 4 cores | Node.js + PostgreSQL |
| **RAM** | 4 GB | 8 GB | Database caching |
| **Storage** | 50 GB SSD | 100 GB SSD | Database + logs |
| **Bandwidth** | 1 TB/month | Unlimited | API traffic |
| **OS** | Ubuntu 20.04+ | Ubuntu 22.04 LTS | Stable LTS |

### Required Software

```bash
# System packages
- Node.js 18+ (LTS)
- PostgreSQL 14+
- Redis 7+ (optional but recommended)
- Nginx (reverse proxy)
- PM2 (process manager)
- Certbot (SSL certificates)
- Git (deployment)

# Oracle Integration
- Oracle Instant Client 19c+
- ODBC Driver Manager (unixODBC)
```

### Port Configuration

| Service | Port | Access | Purpose |
|---------|------|--------|---------|
| **Nginx** | 80 | Public | HTTP → HTTPS redirect |
| **Nginx** | 443 | Public | HTTPS (SSL) |
| **Node.js** | 3001 | Internal | Backend API |
| **PostgreSQL** | 5432 | Internal | Database |
| **Redis** | 6379 | Internal | Cache |
| **Oracle** | 1521 | Internal | ERP connection |

### Domain & DNS Setup

**Domain:** propackhub.com (GoDaddy)

**Required DNS Records:**
```
Type    Name    Value                   TTL
A       @       YOUR_VPS_IP            600
A       www     YOUR_VPS_IP            600
CNAME   api     propackhub.com         600
```

**SSL Certificate:**
- Use Let's Encrypt (free, auto-renewal)
- Certbot with Nginx plugin
- Wildcard certificate for subdomains


---

## 4. PRE-DEPLOYMENT CHECKLIST

### 4.1 Security Fixes (CRITICAL - Do First!)

#### Fix 1: Remove Hardcoded Credentials

**Current Issue:** Credentials in `.env` files
```bash
# ❌ CURRENT (server/.env)
DB_PASSWORD=654883
ORACLE_PASSWORD=***REDACTED***
JWT_SECRET=ipd-secret-key-change-in-production
```

**Fix:**
```bash
# 1. Generate strong secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Create production .env (NEVER commit to git)
# server/.env.production
NODE_ENV=production
PORT=3001

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=propackhub_user
DB_PASSWORD=<STRONG_PASSWORD_HERE>
DB_NAME=fp_database
AUTH_DB_NAME=ip_auth_database
PLATFORM_DB_NAME=propackhub_platform
DB_POOL_MAX=20

# Oracle ERP
ORACLE_HOST=PRODDB-SCAN.ITSUPPORT.HG
ORACLE_PORT=1521
ORACLE_SID=REPDB
ORACLE_USER=<ORACLE_USER>
ORACLE_PASSWORD=<ORACLE_PASSWORD>

# JWT (Generate new secrets!)
JWT_SECRET=<64_CHAR_HEX_STRING>
JWT_REFRESH_SECRET=<64_CHAR_HEX_STRING>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=60d

# CORS
CORS_ORIGIN=https://propackhub.com

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info
```

#### Fix 2: XSS Vulnerabilities

**Install DOMPurify:**
```bash
cd /path/to/project
npm install dompurify
npm install @types/dompurify --save-dev
```

**Fix Location 1:** `src/components/writeup/WriteUpView.jsx` (Line 915)
```javascript
// ❌ BEFORE
<div dangerouslySetInnerHTML={{ __html: formatWriteupForDisplay(writeup) }} />

// ✅ AFTER
import DOMPurify from 'dompurify';

<div dangerouslySetInnerHTML={{ 
  __html: DOMPurify.sanitize(formatWriteupForDisplay(writeup)) 
}} />
```

**Fix Location 2:** `src/components/dashboard/ProductGroupTable.jsx` (Line 592)
```javascript
// ❌ BEFORE
<th dangerouslySetInnerHTML={{ __html: `${col.deltaLabel}<br/>%` }} />

// ✅ AFTER
<th>
  {col.deltaLabel}
  <br />
  %
</th>
```

#### Fix 3: Replace Hardcoded URLs

**Create environment file:** `.env` (frontend root)
```bash
# Frontend environment variables
VITE_API_URL=https://propackhub.com/api
VITE_APP_NAME=ProPackHub
```

**Update all hardcoded URLs:**
```javascript
// ❌ BEFORE
fetch('http://localhost:3001/api/...')

// ✅ AFTER
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
fetch(`${API_BASE_URL}/api/...`)
```

**Files to update (40+ locations):**
- `src/contexts/FilterContext.jsx`
- `src/contexts/SalesCountryContext.jsx`
- `src/contexts/SalesRepReportsContext.jsx`
- All dashboard components
- All report components


### 4.2 Code Quality Fixes (Before Deployment)

#### Remove Console.log Statements

**Option 1: Manual removal** (60+ locations)
```bash
# Find all console.log
grep -r "console.log" src/ server/ --exclude-dir=node_modules

# Remove or gate by environment
if (process.env.NODE_ENV === 'development') {
  console.log('Debug info');
}
```

#### Fix Memory Leaks (setInterval)

**Files to fix:**
- `src/components/dashboard/MultiChartHTMLExport.jsx` (Line 10281)
- `src/components/MasterData/AEBF/BudgetTab.jsx` (Line 994)
- `src/components/MasterData/AEBF/ActualTab.jsx` (Line 350)
- `src/components/common/NotificationBell.jsx` (Line 57)

**Fix pattern:**
```javascript
// ❌ BEFORE
setInterval(() => {
  // do something
}, 1000);

// ✅ AFTER
useEffect(() => {
  const interval = setInterval(() => {
    // do something
  }, 1000);
  
  return () => clearInterval(interval); // Cleanup on unmount
}, []);
```

#### Fix Legacy Table Queries

**Update 3 queries in:** `server/routes/aebf/actual.js`

```javascript
// ❌ BEFORE (Lines 431, 706, 1267)
FROM fp_data_excel

// ✅ AFTER
FROM ${tables.actualCommon}
```

### 4.3 Build & Test Locally

```bash
# 1. Install dependencies
npm install
cd server && npm install && cd ..

# 2. Build frontend
npm run build

# 3. Test production build locally
cd server
NODE_ENV=production node index.js

# 4. Verify build output
ls -lh build/
# Should see: index.html, assets/, static/
```


---

## 5. SECURITY HARDENING

### 5.1 PostgreSQL Security

```bash
# 1. Create dedicated database user (not postgres superuser)
sudo -u postgres psql

CREATE USER propackhub_user WITH PASSWORD '<STRONG_PASSWORD>';

# Create databases
CREATE DATABASE fp_database OWNER propackhub_user;
CREATE DATABASE ip_auth_database OWNER propackhub_user;
CREATE DATABASE propackhub_platform OWNER propackhub_user;

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE fp_database TO propackhub_user;
GRANT ALL PRIVILEGES ON DATABASE ip_auth_database TO propackhub_user;
GRANT ALL PRIVILEGES ON DATABASE propackhub_platform TO propackhub_user;

# 2. Configure pg_hba.conf for local connections only
sudo nano /etc/postgresql/14/main/pg_hba.conf

# Add:
local   all             propackhub_user                         scram-sha-256
host    all             propackhub_user    127.0.0.1/32         scram-sha-256

# 3. Restart PostgreSQL
sudo systemctl restart postgresql
```

### 5.2 Firewall Configuration

```bash
# Install UFW (Uncomplicated Firewall)
sudo apt update
sudo apt install ufw

# Default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (IMPORTANT: Do this first!)
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status verbose
```

### 5.3 Nginx Security Headers

**Create:** `/etc/nginx/conf.d/security-headers.conf`
```nginx
# Security headers
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "no-referrer-when-downgrade" always;
add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

# Hide Nginx version
server_tokens off;
```

### 5.4 Rate Limiting (Already in Code)

**Verify in:** `server/middleware/rateLimiter.js`
```javascript
// Already configured:
// - 100 requests per 15 minutes per IP
// - Separate limits for auth endpoints (5 login attempts per 15 min)
```

### 5.5 Environment Variables Protection

```bash
# 1. Set proper file permissions
chmod 600 server/.env.production
chmod 600 .env

# 2. Add to .gitignore (already done, but verify)
echo ".env" >> .gitignore
echo ".env.production" >> .gitignore
echo "server/.env" >> .gitignore
echo "server/.env.production" >> .gitignore

# 3. Never commit secrets to git
git status  # Verify no .env files are staged
```


---

## 6. DATABASE SETUP

### 6.1 Install PostgreSQL on VPS

```bash
# 1. Install PostgreSQL 14
sudo apt update
sudo apt install postgresql-14 postgresql-contrib-14

# 2. Start and enable service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 3. Verify installation
sudo -u postgres psql --version
```

### 6.2 Create Databases

```bash
# Connect as postgres user
sudo -u postgres psql

-- Create user
CREATE USER propackhub_user WITH PASSWORD 'YOUR_STRONG_PASSWORD_HERE';

-- Create databases
CREATE DATABASE fp_database OWNER propackhub_user;
CREATE DATABASE ip_auth_database OWNER propackhub_user;
CREATE DATABASE propackhub_platform OWNER propackhub_user;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE fp_database TO propackhub_user;
GRANT ALL PRIVILEGES ON DATABASE ip_auth_database TO propackhub_user;
GRANT ALL PRIVILEGES ON DATABASE propackhub_platform TO propackhub_user;

-- Exit
\q
```

### 6.3 Import Database Schema & Data

**Option 1: From SQL Dump (if you have backup)**
```bash
# Export from local (on your development machine)
pg_dump -U postgres -h localhost fp_database > fp_database_backup.sql
pg_dump -U postgres -h localhost ip_auth_database > ip_auth_database_backup.sql
pg_dump -U postgres -h localhost propackhub_platform > propackhub_platform_backup.sql

# Transfer to VPS
scp *.sql user@your-vps-ip:/tmp/

# Import on VPS
psql -U propackhub_user -d fp_database < /tmp/fp_database_backup.sql
psql -U propackhub_user -d ip_auth_database < /tmp/ip_auth_database_backup.sql
psql -U propackhub_user -d propackhub_platform < /tmp/propackhub_platform_backup.sql
```

**Option 2: Run Migrations (fresh setup)**
```bash
# On VPS, in project directory
cd /var/www/propackhub/server

# Run platform database setup
node migrations/setup-platform-database.js

# Run other migrations (323+ migration files)
# Migrations run automatically on server start
NODE_ENV=production node index.js
```

### 6.4 Verify Database Setup

```bash
# Connect to each database
psql -U propackhub_user -d fp_database

-- Check tables
\dt

-- Check row counts
SELECT 'fp_actualcommon' as table_name, COUNT(*) FROM fp_actualcommon
UNION ALL
SELECT 'fp_budget_unified', COUNT(*) FROM fp_budget_unified
UNION ALL
SELECT 'fp_customer_unified', COUNT(*) FROM fp_customer_unified;

-- Exit
\q
```

### 6.5 Database Performance Tuning

**Edit:** `/etc/postgresql/14/main/postgresql.conf`
```ini
# Memory settings (for 8GB RAM VPS)
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
work_mem = 32MB

# Connection settings
max_connections = 100

# Checkpoint settings
checkpoint_completion_target = 0.9
wal_buffers = 16MB

# Query planner
random_page_cost = 1.1  # For SSD
effective_io_concurrency = 200

# Logging
log_min_duration_statement = 1000  # Log slow queries (>1s)
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
```

**Restart PostgreSQL:**
```bash
sudo systemctl restart postgresql
```


---

## 7. BACKEND DEPLOYMENT

### 7.1 Install Node.js & Dependencies

```bash
# 1. Install Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Verify installation
node --version  # Should be v18.x.x
npm --version

# 3. Install PM2 globally (process manager)
sudo npm install -g pm2

# 4. Install build tools
sudo apt install -y build-essential
```

### 7.2 Deploy Backend Code

```bash
# 1. Create application directory
sudo mkdir -p /var/www/propackhub
sudo chown $USER:$USER /var/www/propackhub

# 2. Clone repository (or upload files)
cd /var/www/propackhub
git clone <YOUR_REPO_URL> .

# OR upload via SCP
# scp -r /path/to/local/project/* user@vps-ip:/var/www/propackhub/

# 3. Install dependencies
npm install
cd server && npm install && cd ..

# 4. Create production environment file
nano server/.env.production
# (Paste the production .env content from section 4.1)

# 5. Set proper permissions
chmod 600 server/.env.production
chmod +x server/index.js
```

### 7.3 Install Oracle Client (for ERP Integration)

```bash
# 1. Download Oracle Instant Client
cd /tmp
wget https://download.oracle.com/otn_software/linux/instantclient/1919000/instantclient-basic-linux.x64-19.19.0.0.0dbru.zip
wget https://download.oracle.com/otn_software/linux/instantclient/1919000/instantclient-odbc-linux.x64-19.19.0.0.0dbru.zip

# 2. Install unzip and dependencies
sudo apt install -y unzip libaio1

# 3. Extract Oracle Client
sudo mkdir -p /opt/oracle
sudo unzip instantclient-basic-linux.x64-19.19.0.0.0dbru.zip -d /opt/oracle
sudo unzip instantclient-odbc-linux.x64-19.19.0.0.0dbru.zip -d /opt/oracle

# 4. Set up library path
echo /opt/oracle/instantclient_19_19 | sudo tee /etc/ld.so.conf.d/oracle-instantclient.conf
sudo ldconfig

# 5. Install ODBC driver manager
sudo apt install -y unixodbc unixodbc-dev

# 6. Configure ODBC
sudo nano /etc/odbcinst.ini

# Add:
[Oracle 19 ODBC driver]
Description = Oracle ODBC driver for Oracle 19
Driver = /opt/oracle/instantclient_19_19/libsqora.so.19.1
Setup = 
FileUsage = 1
CPTimeout = 
CPReuse = 

# 7. Test Oracle connection
odbcinst -q -d  # Should list Oracle driver
```

### 7.4 Configure PM2 (Process Manager)

**Create:** `ecosystem.config.js` (in project root)
```javascript
module.exports = {
  apps: [{
    name: 'propackhub-api',
    script: './server/index.js',
    cwd: '/var/www/propackhub',
    instances: 2,  // Use 2 instances for load balancing
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    env_file: './server/.env.production',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000
  }]
};
```

### 7.5 Start Backend with PM2

```bash
# 1. Create logs directory
mkdir -p /var/www/propackhub/logs

# 2. Start application
cd /var/www/propackhub
pm2 start ecosystem.config.js

# 3. Save PM2 configuration
pm2 save

# 4. Setup PM2 to start on boot
pm2 startup systemd
# Follow the command it outputs (sudo env PATH=...)

# 5. Check status
pm2 status
pm2 logs propackhub-api

# 6. Monitor
pm2 monit
```

### 7.6 Verify Backend is Running

```bash
# Test API endpoint
curl http://localhost:3001/api/health

# Should return:
# {"status":"ok","timestamp":"..."}
```


---

## 8. FRONTEND DEPLOYMENT

### 8.1 Build Frontend for Production

```bash
# On your local machine (or VPS)
cd /var/www/propackhub

# 1. Create production environment file
nano .env

# Add:
VITE_API_URL=https://propackhub.com/api
VITE_APP_NAME=ProPackHub

# 2. Build frontend
npm run build

# 3. Verify build output
ls -lh build/
# Should see: index.html, assets/, static/

# 4. Check build size
du -sh build/
# Should be ~10-20MB
```

### 8.2 Install & Configure Nginx

```bash
# 1. Install Nginx
sudo apt update
sudo apt install nginx

# 2. Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# 3. Test Nginx
curl http://localhost
# Should see "Welcome to nginx"
```

### 8.3 Configure Nginx for ProPackHub

**Create:** `/etc/nginx/sites-available/propackhub.com`
```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name propackhub.com www.propackhub.com;
    
    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    # Redirect all other traffic to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS Server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name propackhub.com www.propackhub.com;
    
    # SSL certificates (will be added by Certbot)
    ssl_certificate /etc/letsencrypt/live/propackhub.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/propackhub.com/privkey.pem;
    
    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
    include /etc/nginx/conf.d/security-headers.conf;
    
    # Root directory for React build
    root /var/www/propackhub/build;
    index index.html;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript 
               application/x-javascript application/xml+rss 
               application/javascript application/json;
    
    # API proxy to Node.js backend
    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts for long-running requests (Oracle sync)
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
    
    # Uploads directory
    location /uploads/ {
        alias /var/www/propackhub/server/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
    
    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # React Router - serve index.html for all routes
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Deny access to hidden files
    location ~ /\. {
        deny all;
    }
}
```

### 8.4 Enable Nginx Site

```bash
# 1. Create symbolic link
sudo ln -s /etc/nginx/sites-available/propackhub.com /etc/nginx/sites-enabled/

# 2. Remove default site
sudo rm /etc/nginx/sites-enabled/default

# 3. Test Nginx configuration
sudo nginx -t

# 4. Reload Nginx
sudo systemctl reload nginx
```

### 8.5 Install SSL Certificate (Let's Encrypt)

```bash
# 1. Install Certbot
sudo apt install certbot python3-certbot-nginx

# 2. Obtain SSL certificate
sudo certbot --nginx -d propackhub.com -d www.propackhub.com

# Follow prompts:
# - Enter email address
# - Agree to terms
# - Choose to redirect HTTP to HTTPS (option 2)

# 3. Test auto-renewal
sudo certbot renew --dry-run

# 4. Verify SSL
curl https://propackhub.com/api/health
```

### 8.6 Verify Frontend Deployment

```bash
# 1. Check Nginx status
sudo systemctl status nginx

# 2. Test website
curl -I https://propackhub.com
# Should return: HTTP/2 200

# 3. Open in browser
# https://propackhub.com
# Should see login page
```


---

## 9. ORACLE ERP AUTOMATION

### 9.1 Current State (Manual Process)

**Problem:** Oracle data sync is currently manual
- User must run script manually: `node scripts/sync-oracle-direct.js`
- No scheduling or automation
- No error notifications

**Solution:** Automate with cron jobs + monitoring

### 9.2 Oracle Sync Service Overview

**Service:** `server/services/OracleERPSyncService.js`

**Features:**
- Connects to Oracle ERP via ODBC
- Fetches from: `HAP111.XL_FPSALESVSCOST_FULL` (57 columns)
- Syncs to: `fp_raw_data` table (PostgreSQL)
- Supports full sync or incremental sync
- Batch processing (5000 rows per batch)
- Transaction management with rollback
- Comprehensive logging

**Connection Details:**
```
Host: PRODDB-SCAN.ITSUPPORT.HG:1521/REPDB
Schema: HAP111
Table: XL_FPSALESVSCOST_FULL
User: noor (or camille based on .env)
```

### 9.3 Create Automated Sync Script

**Create:** `/var/www/propackhub/server/scripts/automated-oracle-sync.js`
```javascript
#!/usr/bin/env node
/**
 * Automated Oracle ERP Sync Script
 * Runs daily to sync Oracle data to PostgreSQL
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.production') });
const OracleERPSyncService = require('../services/OracleERPSyncService');
const logger = require('../utils/logger');

async function runSync() {
  const startTime = Date.now();
  
  try {
    logger.info('🚀 Starting automated Oracle ERP sync...');
    
    // Test connection first
    await OracleERPSyncService.testConnection();
    
    // Run incremental sync (faster, only new/changed data)
    const result = await OracleERPSyncService.syncToPostgreSQL('incremental');
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    logger.info('✅ Automated sync completed successfully', {
      syncId: result.syncId,
      rowsFetched: result.rowsFetched,
      rowsInserted: result.rowsInserted,
      rowsUpdated: result.rowsUpdated,
      duration: `${duration}s`
    });
    
    // Send success notification (optional - implement email/Slack)
    // await sendNotification('success', result);
    
    process.exit(0);
    
  } catch (error) {
    logger.error('❌ Automated sync failed', {
      error: error.message,
      stack: error.stack
    });
    
    // Send failure notification (optional)
    // await sendNotification('failure', { error: error.message });
    
    process.exit(1);
  }
}

runSync();
```

**Make executable:**
```bash
chmod +x /var/www/propackhub/server/scripts/automated-oracle-sync.js
```

### 9.4 Schedule with Cron

```bash
# 1. Edit crontab
crontab -e

# 2. Add daily sync at 2:00 AM (server time)
0 2 * * * cd /var/www/propackhub && /usr/bin/node server/scripts/automated-oracle-sync.js >> /var/www/propackhub/logs/oracle-sync.log 2>&1

# Alternative schedules:
# Every 6 hours: 0 */6 * * *
# Every hour: 0 * * * *
# Every 30 minutes: */30 * * * *

# 3. Verify cron job
crontab -l
```

### 9.5 Manual Sync Endpoint (for on-demand sync)

**Already exists:** `POST /api/fp/sync-oracle-excel`

**Usage:**
```bash
# Trigger manual sync via API
curl -X POST https://propackhub.com/api/fp/sync-oracle-excel \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"

# Monitor progress (Server-Sent Events)
curl https://propackhub.com/api/fp/sync-oracle-excel/progress \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 9.6 Sync Monitoring & Alerts

**Create:** `/var/www/propackhub/server/scripts/check-sync-health.js`
```javascript
#!/usr/bin/env node
/**
 * Check Oracle sync health
 * Alerts if last sync was more than 24 hours ago
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.production') });
const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function checkSyncHealth() {
  try {
    const result = await pool.query(`
      SELECT 
        sync_end_time,
        sync_status,
        rows_fetched,
        rows_inserted,
        EXTRACT(EPOCH FROM (NOW() - sync_end_time))/3600 as hours_since_sync
      FROM erp_sync_metadata
      WHERE sync_status = 'completed'
      ORDER BY sync_end_time DESC
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      logger.warn('⚠️  No successful sync found in database');
      process.exit(1);
    }
    
    const lastSync = result.rows[0];
    const hoursSince = parseFloat(lastSync.hours_since_sync);
    
    if (hoursSince > 24) {
      logger.error(`❌ Last sync was ${hoursSince.toFixed(1)} hours ago (>24h threshold)`, lastSync);
      // Send alert notification
      process.exit(1);
    } else {
      logger.info(`✅ Sync health OK - Last sync ${hoursSince.toFixed(1)} hours ago`, lastSync);
      process.exit(0);
    }
    
  } catch (error) {
    logger.error('❌ Health check failed', { error: error.message });
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkSyncHealth();
```

**Schedule health check:**
```bash
# Add to crontab - check every hour
0 * * * * cd /var/www/propackhub && /usr/bin/node server/scripts/check-sync-health.js >> /var/www/propackhub/logs/sync-health.log 2>&1
```

### 9.7 Sync Dashboard (Optional)

**Add to frontend:** Sync status page showing:
- Last sync timestamp
- Rows synced
- Sync duration
- Error logs
- Manual trigger button

**API endpoint already exists:** `GET /api/fp/sync-oracle-excel/progress`


---

## 10. CI/CD PIPELINE (Daily Updates)

### 10.1 Git Repository Setup

```bash
# 1. Initialize git (if not already done)
cd /var/www/propackhub
git init
git remote add origin <YOUR_REPO_URL>

# 2. Create .gitignore (already exists, verify)
cat .gitignore
# Should include:
# node_modules/
# .env
# .env.production
# build/
# logs/
# *.log

# 3. Commit and push
git add .
git commit -m "Initial production deployment"
git push -u origin main
```

### 10.2 Deployment Script

**Create:** `/var/www/propackhub/deploy.sh`
```bash
#!/bin/bash
# ProPackHub Deployment Script
# Pulls latest code, builds, and restarts services

set -e  # Exit on error

echo "🚀 Starting ProPackHub deployment..."

# Configuration
PROJECT_DIR="/var/www/propackhub"
BACKUP_DIR="/var/backups/propackhub"
LOG_FILE="$PROJECT_DIR/logs/deploy.log"

# Create backup directory
mkdir -p $BACKUP_DIR

# Log function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a $LOG_FILE
}

log "📦 Step 1: Backup current deployment"
BACKUP_NAME="backup_$(date +'%Y%m%d_%H%M%S')"
tar -czf "$BACKUP_DIR/$BACKUP_NAME.tar.gz" \
    --exclude='node_modules' \
    --exclude='build' \
    --exclude='logs' \
    -C $PROJECT_DIR .
log "✅ Backup created: $BACKUP_NAME.tar.gz"

log "📥 Step 2: Pull latest code from git"
cd $PROJECT_DIR
git fetch origin
git reset --hard origin/main
log "✅ Code updated"

log "📦 Step 3: Install dependencies"
npm install --production
cd server && npm install --production && cd ..
log "✅ Dependencies installed"

log "🔨 Step 4: Build frontend"
npm run build
log "✅ Frontend built"

log "🔄 Step 5: Restart backend (PM2)"
pm2 restart propackhub-api
log "✅ Backend restarted"

log "🔄 Step 6: Reload Nginx"
sudo systemctl reload nginx
log "✅ Nginx reloaded"

log "✅ Deployment completed successfully!"

# Test health endpoint
sleep 5
HEALTH_CHECK=$(curl -s https://propackhub.com/api/health | grep -o '"status":"ok"' || echo "")
if [ -n "$HEALTH_CHECK" ]; then
    log "✅ Health check passed"
else
    log "⚠️  Health check failed - manual verification needed"
fi

log "📊 PM2 Status:"
pm2 status | tee -a $LOG_FILE

log "🎉 Deployment complete!"
```

**Make executable:**
```bash
chmod +x /var/www/propackhub/deploy.sh
```

### 10.3 Automated Daily Deployment

**Option 1: Cron Job (Simple)**
```bash
# Edit crontab
crontab -e

# Deploy daily at 3:00 AM (after Oracle sync at 2:00 AM)
0 3 * * * /var/www/propackhub/deploy.sh >> /var/www/propackhub/logs/deploy.log 2>&1
```

**Option 2: GitHub Actions (Advanced)**

**Create:** `.github/workflows/deploy.yml`
```yaml
name: Deploy to Production

on:
  push:
    branches: [ main ]
  workflow_dispatch:  # Manual trigger

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - name: Deploy to VPS
      uses: appleboy/ssh-action@master
      with:
        host: ${{ secrets.VPS_HOST }}
        username: ${{ secrets.VPS_USER }}
        key: ${{ secrets.VPS_SSH_KEY }}
        script: |
          cd /var/www/propackhub
          ./deploy.sh
```

**Setup GitHub Secrets:**
1. Go to GitHub repo → Settings → Secrets
2. Add:
   - `VPS_HOST`: Your VPS IP address
   - `VPS_USER`: SSH username
   - `VPS_SSH_KEY`: Private SSH key

### 10.4 Rollback Procedure

**If deployment fails:**
```bash
# 1. List backups
ls -lh /var/backups/propackhub/

# 2. Restore from backup
cd /var/www/propackhub
tar -xzf /var/backups/propackhub/backup_YYYYMMDD_HHMMSS.tar.gz

# 3. Restart services
pm2 restart propackhub-api
sudo systemctl reload nginx

# 4. Verify
curl https://propackhub.com/api/health
```

### 10.5 Zero-Downtime Deployment (Advanced)

**Using PM2 Cluster Mode:**
```javascript
// ecosystem.config.js (already configured)
module.exports = {
  apps: [{
    name: 'propackhub-api',
    instances: 2,  // 2 instances
    exec_mode: 'cluster',
    // ...
  }]
};
```

**Reload without downtime:**
```bash
# Instead of restart, use reload
pm2 reload propackhub-api

# PM2 will:
# 1. Start new instance
# 2. Wait for it to be ready
# 3. Stop old instance
# 4. Repeat for all instances
# Result: Zero downtime!
```


---

## 11. MONITORING & MAINTENANCE

### 11.1 Application Monitoring with PM2

```bash
# Real-time monitoring
pm2 monit

# View logs
pm2 logs propackhub-api
pm2 logs propackhub-api --lines 100

# Check status
pm2 status

# View metrics
pm2 describe propackhub-api

# Install PM2 web dashboard (optional)
pm2 install pm2-server-monit
```

### 11.2 System Monitoring

**Install monitoring tools:**
```bash
# Install htop (better than top)
sudo apt install htop

# Install iotop (disk I/O monitoring)
sudo apt install iotop

# Install netstat
sudo apt install net-tools
```

**Check system resources:**
```bash
# CPU and memory
htop

# Disk usage
df -h

# Disk I/O
sudo iotop

# Network connections
netstat -tulpn | grep LISTEN

# PostgreSQL connections
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"
```

### 11.3 Log Management

**Configure log rotation:**

**Create:** `/etc/logrotate.d/propackhub`
```
/var/www/propackhub/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}

/var/www/propackhub/server/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
}
```

**Test log rotation:**
```bash
sudo logrotate -f /etc/logrotate.d/propackhub
```

### 11.4 Database Monitoring

**Create:** `/var/www/propackhub/server/scripts/db-health-check.js`
```javascript
#!/usr/bin/env node
/**
 * Database Health Check
 * Monitors database size, connections, slow queries
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.production') });
const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function checkDatabaseHealth() {
  try {
    // Database size
    const sizeResult = await pool.query(`
      SELECT 
        pg_database.datname,
        pg_size_pretty(pg_database_size(pg_database.datname)) AS size
      FROM pg_database
      WHERE datname IN ('fp_database', 'ip_auth_database', 'propackhub_platform')
    `);
    
    logger.info('📊 Database Sizes:', sizeResult.rows);
    
    // Active connections
    const connResult = await pool.query(`
      SELECT count(*) as active_connections
      FROM pg_stat_activity
      WHERE state = 'active'
    `);
    
    logger.info('🔌 Active Connections:', connResult.rows[0]);
    
    // Table sizes
    const tableResult = await pool.query(`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
        pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY size_bytes DESC
      LIMIT 10
    `);
    
    logger.info('📦 Top 10 Largest Tables:', tableResult.rows);
    
    // Slow queries (if logging enabled)
    const slowResult = await pool.query(`
      SELECT 
        query,
        calls,
        total_time,
        mean_time,
        max_time
      FROM pg_stat_statements
      WHERE mean_time > 1000
      ORDER BY mean_time DESC
      LIMIT 5
    `).catch(() => ({ rows: [] }));  // Ignore if pg_stat_statements not installed
    
    if (slowResult.rows.length > 0) {
      logger.warn('🐌 Slow Queries (>1s):', slowResult.rows);
    }
    
    logger.info('✅ Database health check complete');
    
  } catch (error) {
    logger.error('❌ Database health check failed', { error: error.message });
  } finally {
    await pool.end();
  }
}

checkDatabaseHealth();
```

**Schedule daily:**
```bash
# Add to crontab
0 6 * * * cd /var/www/propackhub && /usr/bin/node server/scripts/db-health-check.js >> /var/www/propackhub/logs/db-health.log 2>&1
```

### 11.5 Performance Monitoring

**Install Node.js monitoring (optional):**
```bash
# PM2 Plus (free tier)
pm2 link <SECRET_KEY> <PUBLIC_KEY>

# Or use PM2 metrics
pm2 install pm2-metrics
```

**Monitor API response times:**
```bash
# Already implemented in code:
# - Winston logging with response times
# - Request correlation IDs
# - Error tracking

# View slow API calls
grep "duration" /var/www/propackhub/logs/backend-3001.log | grep -E "[0-9]{4,}ms"
```

### 11.6 Uptime Monitoring

**Option 1: Simple cron-based check**

**Create:** `/var/www/propackhub/server/scripts/uptime-check.sh`
```bash
#!/bin/bash
# Check if application is responding

HEALTH_URL="https://propackhub.com/api/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ "$RESPONSE" != "200" ]; then
    echo "[$(date)] ❌ Health check failed - HTTP $RESPONSE" >> /var/www/propackhub/logs/uptime.log
    # Send alert (email, Slack, etc.)
    # pm2 restart propackhub-api  # Auto-restart on failure
else
    echo "[$(date)] ✅ Health check passed" >> /var/www/propackhub/logs/uptime.log
fi
```

**Schedule every 5 minutes:**
```bash
*/5 * * * * /var/www/propackhub/server/scripts/uptime-check.sh
```

**Option 2: External monitoring services (recommended)**
- UptimeRobot (free tier: 50 monitors)
- Pingdom
- StatusCake
- Better Uptime


---

## 12. BACKUP STRATEGY

### 12.1 Database Backups

**Create:** `/var/www/propackhub/server/scripts/backup-databases.sh`
```bash
#!/bin/bash
# Automated database backup script

set -e

# Configuration
BACKUP_DIR="/var/backups/propackhub/databases"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Database credentials
DB_USER="propackhub_user"
DB_HOST="localhost"
DATABASES=("fp_database" "ip_auth_database" "propackhub_platform")

# Create backup directory
mkdir -p $BACKUP_DIR

echo "[$(date)] 🗄️  Starting database backups..."

# Backup each database
for DB in "${DATABASES[@]}"; do
    BACKUP_FILE="$BACKUP_DIR/${DB}_${TIMESTAMP}.sql.gz"
    
    echo "[$(date)] 📦 Backing up $DB..."
    
    # Dump and compress
    PGPASSWORD=$DB_PASSWORD pg_dump -h $DB_HOST -U $DB_USER $DB | gzip > $BACKUP_FILE
    
    if [ $? -eq 0 ]; then
        SIZE=$(du -h $BACKUP_FILE | cut -f1)
        echo "[$(date)] ✅ $DB backed up successfully ($SIZE)"
    else
        echo "[$(date)] ❌ Failed to backup $DB"
    fi
done

# Remove old backups (older than RETENTION_DAYS)
echo "[$(date)] 🧹 Cleaning up old backups (>$RETENTION_DAYS days)..."
find $BACKUP_DIR -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "[$(date)] ✅ Database backup complete"

# List recent backups
echo "[$(date)] 📋 Recent backups:"
ls -lh $BACKUP_DIR | tail -10
```

**Make executable and schedule:**
```bash
chmod +x /var/www/propackhub/server/scripts/backup-databases.sh

# Add to crontab - daily at 1:00 AM
0 1 * * * /var/www/propackhub/server/scripts/backup-databases.sh >> /var/www/propackhub/logs/backup.log 2>&1
```

### 12.2 Application Files Backup

**Create:** `/var/www/propackhub/server/scripts/backup-files.sh`
```bash
#!/bin/bash
# Backup application files (code, uploads, configs)

set -e

BACKUP_DIR="/var/backups/propackhub/files"
PROJECT_DIR="/var/www/propackhub"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

mkdir -p $BACKUP_DIR

echo "[$(date)] 📦 Starting file backup..."

# Backup application files
tar -czf "$BACKUP_DIR/propackhub_files_${TIMESTAMP}.tar.gz" \
    --exclude='node_modules' \
    --exclude='build' \
    --exclude='logs' \
    --exclude='.git' \
    -C $PROJECT_DIR .

if [ $? -eq 0 ]; then
    SIZE=$(du -h "$BACKUP_DIR/propackhub_files_${TIMESTAMP}.tar.gz" | cut -f1)
    echo "[$(date)] ✅ Files backed up successfully ($SIZE)"
else
    echo "[$(date)] ❌ File backup failed"
fi

# Backup uploads separately (important user data)
if [ -d "$PROJECT_DIR/server/uploads" ]; then
    tar -czf "$BACKUP_DIR/uploads_${TIMESTAMP}.tar.gz" \
        -C "$PROJECT_DIR/server" uploads
    
    SIZE=$(du -h "$BACKUP_DIR/uploads_${TIMESTAMP}.tar.gz" | cut -f1)
    echo "[$(date)] ✅ Uploads backed up ($SIZE)"
fi

# Remove old backups
find $BACKUP_DIR -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "[$(date)] ✅ File backup complete"
```

**Schedule weekly:**
```bash
chmod +x /var/www/propackhub/server/scripts/backup-files.sh

# Sunday at 2:00 AM
0 2 * * 0 /var/www/propackhub/server/scripts/backup-files.sh >> /var/www/propackhub/logs/backup.log 2>&1
```

### 12.3 Off-Site Backup (Recommended)

**Option 1: AWS S3**
```bash
# Install AWS CLI
sudo apt install awscli

# Configure AWS credentials
aws configure

# Sync backups to S3
aws s3 sync /var/backups/propackhub/ s3://your-bucket/propackhub-backups/ \
    --storage-class STANDARD_IA \
    --delete
```

**Option 2: Rsync to remote server**
```bash
# Setup SSH key authentication first
rsync -avz --delete /var/backups/propackhub/ \
    user@backup-server:/backups/propackhub/
```

### 12.4 Backup Restoration

**Restore database:**
```bash
# 1. List available backups
ls -lh /var/backups/propackhub/databases/

# 2. Restore specific database
gunzip < /var/backups/propackhub/databases/fp_database_YYYYMMDD_HHMMSS.sql.gz | \
    psql -U propackhub_user -d fp_database

# 3. Verify restoration
psql -U propackhub_user -d fp_database -c "SELECT COUNT(*) FROM fp_actualcommon;"
```

**Restore files:**
```bash
# 1. Stop application
pm2 stop propackhub-api

# 2. Restore files
cd /var/www/propackhub
tar -xzf /var/backups/propackhub/files/propackhub_files_YYYYMMDD_HHMMSS.tar.gz

# 3. Restore uploads
cd /var/www/propackhub/server
tar -xzf /var/backups/propackhub/files/uploads_YYYYMMDD_HHMMSS.tar.gz

# 4. Restart application
pm2 start propackhub-api
```

### 12.5 Backup Verification

**Create:** `/var/www/propackhub/server/scripts/verify-backups.sh`
```bash
#!/bin/bash
# Verify backup integrity

BACKUP_DIR="/var/backups/propackhub/databases"
LATEST_BACKUP=$(ls -t $BACKUP_DIR/*.sql.gz | head -1)

echo "[$(date)] 🔍 Verifying latest backup: $LATEST_BACKUP"

# Test if backup can be decompressed
if gunzip -t $LATEST_BACKUP 2>/dev/null; then
    echo "[$(date)] ✅ Backup integrity verified"
else
    echo "[$(date)] ❌ Backup is corrupted!"
    # Send alert
fi
```

**Schedule daily:**
```bash
0 7 * * * /var/www/propackhub/server/scripts/verify-backups.sh >> /var/www/propackhub/logs/backup-verify.log 2>&1
```


---

## 13. TROUBLESHOOTING GUIDE

### 13.1 Common Issues & Solutions

#### Issue: Application won't start

**Symptoms:**
```bash
pm2 status
# Shows: errored or stopped
```

**Solutions:**
```bash
# 1. Check logs
pm2 logs propackhub-api --lines 50

# 2. Check environment variables
cat server/.env.production

# 3. Test database connection
psql -U propackhub_user -d fp_database -c "SELECT 1;"

# 4. Check port availability
sudo netstat -tulpn | grep 3001

# 5. Restart with verbose logging
pm2 delete propackhub-api
pm2 start ecosystem.config.js --log-date-format="YYYY-MM-DD HH:mm:ss"
```

#### Issue: Database connection errors

**Symptoms:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solutions:**
```bash
# 1. Check PostgreSQL is running
sudo systemctl status postgresql

# 2. Start PostgreSQL if stopped
sudo systemctl start postgresql

# 3. Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-14-main.log

# 4. Verify credentials
psql -U propackhub_user -d fp_database

# 5. Check pg_hba.conf
sudo nano /etc/postgresql/14/main/pg_hba.conf
# Ensure: local all propackhub_user scram-sha-256
```

#### Issue: Oracle sync fails

**Symptoms:**
```
❌ Oracle connection failed
```

**Solutions:**
```bash
# 1. Test Oracle client
odbcinst -q -d

# 2. Test ODBC connection
isql -v OracleClient

# 3. Check Oracle credentials in .env
cat server/.env.production | grep ORACLE

# 4. Verify network connectivity
ping PRODDB-SCAN.ITSUPPORT.HG
telnet PRODDB-SCAN.ITSUPPORT.HG 1521

# 5. Check Oracle Instant Client
ls -l /opt/oracle/instantclient_19_19/

# 6. Test sync manually
cd /var/www/propackhub
node server/scripts/automated-oracle-sync.js
```

#### Issue: Nginx 502 Bad Gateway

**Symptoms:**
```
502 Bad Gateway
```

**Solutions:**
```bash
# 1. Check backend is running
pm2 status
curl http://localhost:3001/api/health

# 2. Check Nginx error logs
sudo tail -f /var/log/nginx/error.log

# 3. Test Nginx configuration
sudo nginx -t

# 4. Restart services
pm2 restart propackhub-api
sudo systemctl restart nginx

# 5. Check firewall
sudo ufw status
```

#### Issue: SSL certificate errors

**Symptoms:**
```
NET::ERR_CERT_DATE_INVALID
```

**Solutions:**
```bash
# 1. Check certificate expiry
sudo certbot certificates

# 2. Renew certificate
sudo certbot renew

# 3. Test renewal
sudo certbot renew --dry-run

# 4. Reload Nginx
sudo systemctl reload nginx
```

#### Issue: High memory usage

**Symptoms:**
```bash
pm2 status
# Shows: memory > 1GB
```

**Solutions:**
```bash
# 1. Check memory usage
htop
free -h

# 2. Restart application
pm2 restart propackhub-api

# 3. Check for memory leaks
pm2 monit

# 4. Reduce PM2 instances if needed
# Edit ecosystem.config.js: instances: 1

# 5. Clear Redis cache (if using)
redis-cli FLUSHALL
```

### 13.2 Performance Issues

#### Slow API responses

**Diagnosis:**
```bash
# 1. Check slow queries
grep "duration" /var/www/propackhub/logs/backend-3001.log | grep -E "[0-9]{4,}ms"

# 2. Check database performance
psql -U propackhub_user -d fp_database

SELECT 
  query,
  calls,
  mean_time,
  max_time
FROM pg_stat_statements
WHERE mean_time > 1000
ORDER BY mean_time DESC
LIMIT 10;

# 3. Check system resources
htop
iotop
```

**Solutions:**
```bash
# 1. Add database indexes (if missing)
# See: docs/COMPREHENSIVE_PROJECT_ANALYSIS.md

# 2. Enable Redis caching
# Verify REDIS_URL in .env.production

# 3. Optimize PostgreSQL
sudo nano /etc/postgresql/14/main/postgresql.conf
# Adjust shared_buffers, effective_cache_size

# 4. Scale horizontally (add more PM2 instances)
# Edit ecosystem.config.js: instances: 4
```

### 13.3 Emergency Procedures

#### Complete system failure

```bash
# 1. Check all services
sudo systemctl status postgresql
sudo systemctl status nginx
pm2 status

# 2. Restart all services
sudo systemctl restart postgresql
sudo systemctl restart nginx
pm2 restart all

# 3. If still failing, restore from backup
# See section 12.4
```

#### Database corruption

```bash
# 1. Stop application
pm2 stop propackhub-api

# 2. Backup current state
pg_dump -U propackhub_user fp_database > /tmp/corrupted_db.sql

# 3. Restore from latest backup
# See section 12.4

# 4. Restart application
pm2 start propackhub-api
```

### 13.4 Useful Commands Reference

```bash
# PM2
pm2 status                    # Check status
pm2 logs propackhub-api       # View logs
pm2 restart propackhub-api    # Restart app
pm2 reload propackhub-api     # Zero-downtime reload
pm2 monit                     # Real-time monitoring
pm2 flush                     # Clear logs

# Nginx
sudo nginx -t                 # Test configuration
sudo systemctl reload nginx   # Reload config
sudo systemctl restart nginx  # Restart service
sudo tail -f /var/log/nginx/error.log  # View errors

# PostgreSQL
sudo systemctl status postgresql       # Check status
sudo -u postgres psql                  # Connect as postgres
psql -U propackhub_user -d fp_database # Connect as app user
\l                                     # List databases
\dt                                    # List tables
\q                                     # Quit

# System
htop                          # CPU/Memory monitor
df -h                         # Disk usage
free -h                       # Memory usage
sudo ufw status               # Firewall status
netstat -tulpn | grep LISTEN  # Open ports

# Logs
tail -f /var/www/propackhub/logs/backend-3001.log  # Backend logs
tail -f /var/www/propackhub/logs/oracle-sync.log   # Oracle sync logs
tail -f /var/www/propackhub/logs/deploy.log        # Deployment logs
```

