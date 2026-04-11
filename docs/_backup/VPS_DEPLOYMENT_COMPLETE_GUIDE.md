# ProPackHub VPS Deployment Guide

## Current Status (Feb 5, 2026)

### ✅ Completed
1. ✅ Frontend deployed to `/home/propackhub/public_html/` on VPS
2. ✅ Backend files uploaded to `/home/propackhub/server/`
3. ✅ Node.js v18.20.8 installed on VPS
4. ✅ WHM/Terminal access configured
5. ✅ GitHub repository: `https://github.com/camsalloum/PPH-26.1.git` (remote: pph261)
6. ✅ PostgreSQL 10.23 installed and configured
7. ✅ Database imported successfully
8. ✅ Backend server running on port 3001 (PM2)
9. ✅ Apache reverse proxy configured
10. ✅ Frontend API URLs fixed (using `??` operator)
11. ✅ All `localhost:3001` references removed from build

### 🔄 Ready for Upload
- **NEW BUILD READY**: `build/` folder contains production-ready files with relative API URLs
- **NEXT STEP**: Upload new build to VPS and test

---

## VPS Details

- **Server**: Vps.propackhub.com
- **IP**: 148.66.152.55
- **OS**: AlmaLinux 8 (cPanel)
- **Product**: VPS
- **Access**: WHM Terminal (root access)

---

## DEPLOYMENT PLAN

### Phase 1: PostgreSQL Setup
1. Install PostgreSQL server
   ```bash
   dnf install -y postgresql-server postgresql-contrib
   ```
2. Initialize database cluster
   ```bash
   postgresql-setup --initdb
   ```
3. Start and enable PostgreSQL service
   ```bash
   systemctl start postgresql
   systemctl enable postgresql
   ```
4. Create application DB user and password
   ```bash
   sudo -u postgres psql
   CREATE USER propackhub_user WITH PASSWORD 'your_secure_password';
   ALTER USER propackhub_user CREATEDB;
   \q
   ```
5. Create databases
   ```bash
   sudo -u postgres createdb -O propackhub_user fp_database
   sudo -u postgres createdb -O propackhub_user ip_auth_database
   sudo -u postgres createdb -O propackhub_user propackhub_platform
   ```
6. Use default localhost-only PostgreSQL access (secure)

### Phase 2: Import Data
7. Upload SQL backups to `/home/propackhub/database-backups/`
8. Import data into databases
   ```bash
   psql -U propackhub_user -d fp_database < fp_database.sql
   psql -U propackhub_user -d ip_auth_database < ip_auth_database.sql
   psql -U propackhub_user -d propackhub_platform < propackhub_platform.sql
   ```
9. Verify data integrity
   ```bash
   psql -U propackhub_user -d fp_database -c "\dt"
   ```

### Phase 3: Backend Configuration
10. Update `/home/propackhub/server/.env`:
    ```env
    NODE_ENV=production
    PORT=3001
    
    # Database
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
    
    # CORS
    CORS_ORIGIN=https://propackhub.com
    
    # JWT (keep existing secrets)
    JWT_SECRET=ipd-secret-key-change-in-production
    JWT_REFRESH_SECRET=ipd-refresh-secret-key-change-in-production
    JWT_ACCESS_EXPIRY=3650d
    JWT_REFRESH_EXPIRY=3650d
    
    # Logging
    LOG_LEVEL=info
    
    # File Upload
    MAX_UPLOAD_SIZE=50mb
    UPLOAD_DIR=./uploads
    ```
    **CRITICAL:** `NODE_ENV` MUST be `production` - controls cookie security, CORS, and DB fallbacks.
11. Test database connectivity
    ```bash
    cd /home/propackhub/server
    node -e "require('./config/database').testConnection()"
    ```

### Phase 4: Application Test
12. Run Node.js manually
    ```bash
    cd /home/propackhub/server
    node index.js
    ```
13. Test API endpoints (in another terminal or browser)
    ```bash
    curl http://localhost:3001/api/health
    ```

### Phase 5: Process Management
14. Install PM2 globally
    ```bash
    npm install -g pm2
    ```
15. Start server with PM2
    ```bash
    cd /home/propackhub/server
    pm2 start index.js --name propackhub-backend
    pm2 save
    ```
16. Enable auto-start on reboot
    ```bash
    pm2 startup
    # Run the command that PM2 outputs
    ```

### Phase 6: Reverse Proxy
17. Configure Apache to proxy `/api` to `localhost:3001`
    - Create/edit `.htaccess` in `/home/propackhub/public_html/`
    ```apache
    RewriteEngine On
    
    # Proxy API requests to Node.js backend (pass FULL path including /api/)
    RewriteCond %{REQUEST_URI} ^/api/
    RewriteRule ^(.*)$ http://localhost:3001/$1 [P,L]
    
    # Proxy uploads folder to Node.js backend
    RewriteCond %{REQUEST_URI} ^/uploads/
    RewriteRule ^(.*)$ http://localhost:3001/$1 [P,L]
    
    # Serve React app for all other routes
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^ /index.html [L]
    ```
    **IMPORTANT:** Use `^(.*)$` to pass the FULL path. Do NOT use `^api/(.*)$` which strips the `/api/` prefix.
18. Update frontend API calls to use relative paths
    - Find and replace `http://localhost:3001` with empty string in frontend code
    - API calls will use `/api/...` instead of full URL

### Phase 7: Validation
19. Test from browser:
    - Login: `https://propackhub.com`
    - Logo appears
    - Dashboard loads
    - API calls work

---

## FUTURE DEPLOYMENT WORKFLOW

### For Ongoing Development Updates

After initial deployment, when you make changes and want to deploy:

#### Option A: Manual Deployment (Simple)
1. **On your PC:**
   ```bash
   npm run build
   git add .
   git commit -m "Your changes"
   git push pph261 main
   ```

2. **On VPS (via WHM Terminal):**
   ```bash
   # Update frontend
   cd /home/propackhub/public_html
   git pull origin main
   
   # Update backend
   cd /home/propackhub/server
   git pull origin main
   npm install  # Only if package.json changed
   pm2 restart propackhub-api
   ```

#### Option B: Automated Deployment (Recommended - Setup Later)
1. Create deployment script on VPS: `/home/propackhub/deploy.sh`
   ```bash
   #!/bin/bash
   echo "Deploying ProPackHub..."
   
   # Update frontend
   cd /home/propackhub/public_html
   git pull origin main
   
   # Update backend
   cd /home/propackhub/server
   git pull origin main
   npm install
   pm2 restart propackhub-api
   
   echo "Deployment complete!"
   ```

2. Make it executable:
   ```bash
   chmod +x /home/propackhub/deploy.sh
   ```

3. **Deploy from your PC with one command:**
   ```bash
   # After pushing to GitHub
   ssh propackhub@148.66.152.55 "/home/propackhub/deploy.sh"
   ```

#### Option C: GitHub Webhooks (Advanced - Setup Later)
- Configure GitHub to automatically trigger deployment when you push
- Requires webhook endpoint on VPS
- Most automated but more complex setup

---

## IMPORTANT NOTES

### Security
- PostgreSQL is localhost-only (secure)
- Keep `.env` file secure (never commit to GitHub)
- Use strong passwords for DB user
- JWT secrets should be changed in production

### Backup Strategy
- Database backups: Use `pg_dump` regularly
- Code backups: GitHub (already done)
- File uploads: Backup `/home/propackhub/server/uploads/`

### Monitoring
- Check PM2 logs: `pm2 logs propackhub-api`
- Check PM2 status: `pm2 status`
- Restart if needed: `pm2 restart propackhub-api`

### File Structure on VPS
```
/home/propackhub/
├── public_html/              # Frontend (React build)
│   ├── index.html
│   ├── assets/
│   ├── uploads/
│   │   └── logos/
│   │       └── PPH without BG.png
│   └── .htaccess
├── server/                   # Backend (Node.js)
│   ├── index.js
│   ├── .env
│   ├── config/
│   ├── routes/
│   ├── services/
│   ├── uploads/
│   │   └── logos/
│   └── node_modules/
├── laravel_app/              # Old PPH Estimate (keep)
├── estimation_backup/        # Backup (keep)
└── database-backups/         # SQL dumps (to be created)
```

---

## NEXT SESSION CHECKLIST

When you continue tomorrow:

1. ✅ Open WHM Terminal
2. ✅ Start with Phase 1, Step 1: Install PostgreSQL
3. ✅ Follow each phase sequentially
4. ✅ Test after each phase
5. ✅ Document any issues or changes

---

## Contact & Support

- **GitHub Repo**: https://github.com/camsalloum/PPH-26.1.git
- **Remote**: pph261
- **Local Project**: D:\PPH 26.01\

---

**Document Created**: February 4, 2026
**Status**: Ready for Phase 1 deployment
**Next Step**: Install PostgreSQL
