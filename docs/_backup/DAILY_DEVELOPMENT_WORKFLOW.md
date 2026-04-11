# 🔄 DAILY DEVELOPMENT WORKFLOW

**ProPackHub - Development to Production Pipeline**

**Your Setup:**
- **Development:** Local machine (D:\PPH 26.01)
- **Production:** propackhub.com (GoDaddy VPS)
- **Goal:** Push daily updates safely and automatically

---

## 📋 TABLE OF CONTENTS

1. [Workflow Overview](#1-workflow-overview)
2. [Initial Setup (One-Time)](#2-initial-setup-one-time)
3. [Daily Development Workflow](#3-daily-development-workflow)
4. [Automated Deployment Options](#4-automated-deployment-options)
5. [Manual Deployment Process](#5-manual-deployment-process)
6. [Rollback Procedure](#6-rollback-procedur

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log
```

] Tested locally
- [ ] No console errors
- [ ] Build succeeds (`npm run build`)
- [ ] Database migrations ready (if any)
- [ ] Environment variables updated (if needed)
- [ ] Commit message is descriptive
- [ ] Pushed to GitHub
- [ ] Monitored deployment logs
- [ ] Tested production site after deployment
- [ ] Checked error logs

### Monitoring After Deployment

```bash
# Watch logs in real-time
ssh user@your-vps-ip
pm2 logs propackhub-api

# Check for errors
pm2 logs propackhub-api --err

# Check status
pm2 statusing Strategy

**For major features:**

```bash
# Create feature branch
git checkout -b feature/new-estimate-module

# Work on feature
# ... make changes ...

# Commit to feature branch
git add .
git commit -m "Added estimate module"
git push origin feature/new-estimate-module

# When ready, merge to main
git checkout main
git merge feature/new-estimate-module
git push origin main

# Delete feature branch
git branch -d feature/new-estimate-module
```

### Deployment Checklist

Before pushing to production:

- [ 

**Bad commit messages:**
```bash
git commit -m "updates"
git commit -m "fix"
git commit -m "changes"
```

### Testing Before Push

**Always test locally:**

```bash
# 1. Test frontend
npm start
# Open http://localhost:3000
# Click through all pages you changed

# 2. Test backend
cd server
npm run dev
# Test API endpoints with curl or Postman

# 3. Check for errors
# Look at browser console
# Look at terminal for backend errors

# 4. Run build test
npm run build
# Make sure build succeeds
```

### Git Branchhub/

# Restore from backup
cd /var/www/propackhub
tar -xzf /var/backups/propackhub/backup_YYYYMMDD_HHMMSS.tar.gz

# Restart
pm2 restart propackhub-api
sudo systemctl reload nginx
```

---

## 7. BEST PRACTICES

### Commit Messages

**Good commit messages:**
```bash
git commit -m "Fixed sales dashboard loading issue"
git commit -m "Added export to Excel feature for customer list"
git commit -m "Updated Oracle sync to handle null values"
git commit -m "Security fix: Sanitized user input in estimate form"
```
# Rollback to previous commit
git reset --hard HEAD~1

# Rebuild and restart
npm run build
pm2 reload propackhub-api
sudo systemctl reload nginx

# Verify
curl https://propackhub.com/api/health
```

**Rollback to Specific Version:**

```bash
# Find the commit hash
git log --oneline

# Rollback to specific commit
git reset --hard abc1234

# Rebuild and restart
npm run build
pm2 reload propackhub-api
sudo systemctl reload nginx
```

**Restore from Backup:**

```bash
# List backups
ls -lh /var/backups/propack\
pm2 reload propackhub-api && \
sudo systemctl reload nginx && \
echo "✅ Deployment complete!"
```

**Make executable:**

```bash
sudo chmod +x /usr/local/bin/deploy-propackhub
```

**Now you can deploy with one command:**

```bash
ssh user@your-vps-ip "deploy-propackhub"
```

---

## 6. ROLLBACK PROCEDURE

### If Something Goes Wrong

**Quick Rollback (Last Working Version):**

```bash
# SSH into VPS
ssh user@your-vps-ip

# Navigate to project
cd /var/www/propackhub

# See recent commits
git log --oneline -5
d

# 7. Restart backend
pm2 reload propackhub-api

# 8. Reload Nginx
sudo systemctl reload nginx

# 9. Check status
pm2 status
curl https://propackhub.com/api/health

# 10. Monitor logs
pm2 logs propackhub-api --lines 50

# 11. Exit SSH
exit
```

### Quick Deploy Script (One Command)

**On your VPS, create:**

```bash
# /usr/local/bin/deploy-propackhub
#!/bin/bash
cd /var/www/propackhub && \
git pull origin main && \
npm install --production && \
cd server && npm install --production && cd .. && \
npm run build && ng
- Before setting up automation

### Manual Deployment Steps

**From your local machine:**

```bash
# 1. Commit and push changes
cd "D:\PPH 26.01"
git add .
git commit -m "Your changes description"
git push origin main

# 2. SSH into VPS
ssh user@your-vps-ip

# 3. Navigate to project
cd /var/www/propackhub

# 4. Pull latest code
git pull origin main

# 5. Install dependencies (if package.json changed)
npm install --production
cd server && npm install --production && cd ..

# 6. Build frontend
npm run buil.."
npm run build

echo "[$(date)] 🔄 Restarting backend..."
pm2 reload propackhub-api

echo "[$(date)] 🔄 Reloading Nginx..."
sudo systemctl reload nginx

echo "[$(date)] ✅ Deployment complete!"
```

**Your workflow:**
1. Work all day, commit changes
2. Push to GitHub before 3:00 AM
3. Cron job automatically deploys at 3:00 AM
4. Wake up to deployed changes

---

## 5. MANUAL DEPLOYMENT PROCESS

### When to Use Manual Deployment

- Testing deployment process
- Emergency hotfix
- Major changes that need monitorie (deploys daily at 3:00 AM)
0 3 * * * /var/www/propackhub/deploy.sh >> /var/www/propackhub/logs/deploy.log 2>&1

# Save and exit
```

**The deploy.sh script** (already created in DEPLOYMENT_PLAN_PROPACKHUB.md):

```bash
#!/bin/bash
# /var/www/propackhub/deploy.sh

cd /var/www/propackhub

echo "[$(date)] 📥 Pulling latest code..."
git pull origin main

echo "[$(date)] 📦 Installing dependencies..."
npm install --production
cd server && npm install --production && cd ..

echo "[$(date)] 🔨 Building frontend.loyment successful!"
        # Add email/Slack notification here

    - name: Send notification on failure
      if: failure()
      run: |
        echo "❌ Deployment failed!"
        # Add email/Slack notification here
```

### Option B: Scheduled Cron Job (SIMPLE)

**Pros:**
- ✅ Very simple
- ✅ Predictable deployment time
- ✅ No external dependencies

**Cons:**
- ⚠️ Only deploys at scheduled time
- ⚠️ Deploys even if no changes

**Setup:**

**On your VPS:**

```bash
# Edit crontab
crontab -e

# Add this lin | `type %USERPROFILE%\.ssh\id_rsa` |

**Step 3: Test Deployment**

```bash
# Make a small change
echo "# Test" >> README.md

# Commit and push
git add README.md
git commit -m "Test automatic deployment"
git push origin main

# Watch deployment
# Go to GitHub → Your Repo → Actions tab
# You'll see the deployment running in real-time
```

**Step 4: Get Notifications**

Add to workflow (after the deploy job):

```yaml
    - name: Send notification on success
      if: success()
      run: |
        echo "✅ Depf https://propackhub.com/api/health || echo "⚠️ Health check failed"
```

**Step 2: Add GitHub Secrets**

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add these secrets:

| Secret Name | Value | How to Get |
|-------------|-------|------------|
| `VPS_HOST` | Your VPS IP address | From GoDaddy control panel |
| `VPS_USER` | SSH username (usually `root` or your username) | Your VPS login |
| `VPS_SSH_KEY` | Private SSH key  echo "📦 Installing dependencies..."
          npm install --production
          cd server && npm install --production && cd ..
          
          echo "🔨 Building frontend..."
          npm run build
          
          echo "🔄 Restarting backend..."
          pm2 reload propackhub-api
          
          echo "🔄 Reloading Nginx..."
          sudo systemctl reload nginx
          
          echo "✅ Deployment complete!"
          
          # Test health endpoint
          sleep 5
          curl -ow_dispatch:  # Allow manual trigger

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v3
    
    - name: Deploy to VPS
      uses: appleboy/ssh-action@master
      with:
        host: ${{ secrets.VPS_HOST }}
        username: ${{ secrets.VPS_USER }}
        key: ${{ secrets.VPS_SSH_KEY }}
        script: |
          cd /var/www/propackhub
          
          echo "📥 Pulling latest code..."
          git pull origin main
          
        # GitHub Actions or cron job deploys to production
# Users see changes in 5-10 minutes
```

---

## 4. AUTOMATED DEPLOYMENT OPTIONS

### Option A: GitHub Actions (RECOMMENDED)

**Pros:**
- ✅ Fully automatic
- ✅ Deploys on every push
- ✅ Can run tests before deploying
- ✅ Email notifications on failure
- ✅ Deployment history

**Setup:**

**Step 1: Create GitHub Actions Workflow**

Create: `.github/workflows/deploy-production.yml`

```yaml
name: Deploy to Production

on:
  push:
    branches: [ main ]
  workflPM) ===
# - Fixed bug in sales dashboard
# - Added new estimate feature
# - Updated customer merge logic
# - Tested everything locally

# === END OF DAY (5:00 PM) ===
git status
# Shows:
#   modified: src/components/dashboard/SalesDashboard.jsx
#   modified: src/components/estimate/CreateEstimate.jsx
#   modified: server/routes/customers.js

git add .
git commit -m "Daily update: Fixed sales dashboard, added estimate feature, improved customer merge"
git push origin main

# === AUTOMATIC DEPLOYMENT (5:05 PM) ===
e for errors
# - Test API endpoints
```

#### End of Day: Commit & Push

```bash
# 1. Check what changed
git status

# 2. Add changed files
git add .

# 3. Commit with descriptive message
git commit -m "Fixed customer dashboard bug and added export feature"

# 4. Push to GitHub
git push origin main

# 5. Deployment happens automatically (if setup) or manually
```

### Example Daily Session

```bash
# === MORNING (9:00 AM) ===
cd "D:\PPH 26.01"
git pull origin main
START-SERVERS.cmd

# === WORK (9:00 AM - 5:00 OW

### Your Daily Routine

#### Morning: Start Development

```bash
# 1. Open your project
cd "D:\PPH 26.01"

# 2. Pull latest changes (in case you worked from another machine)
git pull origin main

# 3. Start development servers
START-SERVERS.cmd

# 4. Open browser
# Frontend: http://localhost:3000
# Backend: http://localhost:3001
```

#### During Day: Make Changes

```bash
# Work on your code
# - Fix bugs
# - Add features
# - Update components

# Test your changes locally
# - Test in browser
# - Check consol
```

### Step 3: Setup Git on VPS

**On your VPS:**

```bash
# Install git
sudo apt install git

# Navigate to project directory
cd /var/www/propackhub

# Initialize git
git init

# Add remote (same as local)
git remote add origin https://github.com/YOUR_USERNAME/propackhub.git

# Pull initial code
git pull origin main

# Install dependencies
npm install
cd server && npm install && cd ..

# Build frontend
npm run build

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
```

---

## 3. DAILY DEVELOPMENT WORKFLcal machine:**

```bash
# Generate SSH key (if you don't have one)
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"

# Copy public key
type %USERPROFILE%\.ssh\id_rsa.pub
```

**On your VPS:**

```bash
# Add your public key to authorized_keys
mkdir -p ~/.ssh
nano ~/.ssh/authorized_keys
# Paste your public key, save and exit

# Set permissions
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

**Test SSH connection:**

```bash
# From your local machine
ssh user@your-vps-ip

# Should login without passwordl |

---

## 2. INITIAL SETUP (ONE-TIME)

### Step 1: Setup Git Repository

**On your local machine:**

```bash
cd "D:\PPH 26.01"

# Initialize git (if not already done)
git init

# Add all files
git add .

# First commit
git commit -m "Initial commit - ProPackHub v1.0"

# Create GitHub repository (go to github.com)
# Then link it:
git remote add origin https://github.com/YOUR_USERNAME/propackhub.git

# Push to GitHub
git push -u origin main
```

### Step 2: Setup SSH Keys (for secure deployment)

**On your lo        │
│  5. Users see new version                                        │
└─────────────────────────────────────────────────────────────────┘
```

### Three Deployment Methods

| Method | Complexity | Speed | Recommended For |
|--------|------------|-------|-----------------|
| **Method 1: Automatic (GitHub Actions)** | Medium | Fast | Best - Set and forget |
| **Method 2: Scheduled Cron Job** | Easy | Fast | Good - Simple automation |
| **Method 3: Manual SSH** | Easy | Slow | Development - Full controODUCTION SERVER                             │
│                    propackhub.com (VPS)                          │
│                    /var/www/propackhub                           │
│                                                                  │
│  1. Pull latest code (git pull)                                 │
│  2. Install dependencies (npm install)                           │
│  3. Build frontend (npm run build)                               │
│  4. Restart backend (pm2 reload)                                                                            │
│  • Stores all your code                                          │
│  • Version history                                               │
│  • Backup                                                        │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ Automatic or Manual
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PRCommit to Git                                                │
│  4. Push to GitHub/GitLab                                        │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ git push
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GIT REPOSITORY                                │
│                    GitHub / GitLab / Bitbucket                   │
│               
7. [Best Practices](#7-best-practices)

---

## 1. WORKFLOW OVERVIEW

### The Complete Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    YOUR LOCAL MACHINE                            │
│                    D:\PPH 26.01                                  │
│                                                                  │
│  1. Make changes (code, fix bugs, add features)                 │
│  2. Test locally (npm start, node server/index.js)              │
│  3. e)

---

## 8. REAL-WORLD SCENARIOS

### Scenario 1: Normal Daily Update

**Morning:**
```bash
# Start work
cd "D:\PPH 26.01"
git pull origin main
START-SERVERS.cmd
```

**During day:**
- Fixed bug in customer dashboard
- Added new filter to sales report
- Updated estimate calculation logic

**End of day:**
```bash
git status
git add .
git commit -m "Daily update: Fixed customer dashboard bug, added sales filter, updated estimate logic"
git push origin main

# If using GitHub Actions: Deployment happens automatically
# If using cron: Will deploy at 3 AM
# If manual: SSH and run deploy script
```

**Result:** Changes live on propackhub.com in 5-10 minutes (or next morning if using cron)

### Scenario 2: Emergency Hotfix

**Problem:** Users report critical bug in production

```bash
# 1. Reproduce bug locally
cd "D:\PPH 26.01"
START-SERVERS.cmd
# Test and confirm bug

# 2. Fix the bug
# Edit the file
# Test fix locally

# 3. Quick commit and push
git add .
git commit -m "HOTFIX: Fixed critical bug in customer merge"
git push origin main

# 4. Manual deployment (don't wait for cron)
ssh user@your-vps-ip "deploy-propackhub"

# 5. Verify fix
curl https://propackhub.com/api/health
# Test the fixed feature

# 6. Monitor logs
ssh user@your-vps-ip
pm2 logs propackhub-api --lines 100
```

**Time:** 10-15 minutes from fix to production

### Scenario 3: Database Migration

**You added new tables/columns:**

```bash
# 1. Create migration file locally
# server/migrations/401_add_estimate_approval_workflow.sql

# 2. Test migration locally
psql -U postgres -d fp_database -f server/migrations/401_add_estimate_approval_workflow.sql

# 3. Commit and push
git add server/migrations/401_add_estimate_approval_workflow.sql
git commit -m "Added estimate approval workflow tables"
git push origin main

# 4. SSH to VPS
ssh user@your-vps-ip

# 5. Run migration on production
cd /var/www/propackhub
git pull origin main
psql -U propackhub_user -d fp_database -f server/migrations/401_add_estimate_approval_workflow.sql

# 6. Deploy code
deploy-propackhub

# 7. Verify
psql -U propackhub_user -d fp_database -c "\dt fp_estimate*"
```

### Scenario 4: Major Feature Release

**You worked on a big feature for a week:**

```bash
# 1. Work on feature branch
git checkout -b feature/advanced-reporting

# Daily commits to feature branch
git add .
git commit -m "Day 1: Created report structure"
git push origin feature/advanced-reporting

git add .
git commit -m "Day 2: Added data fetching"
git push origin feature/advanced-reporting

# ... continue for a week ...

# 2. When ready, merge to main
git checkout main
git pull origin main
git merge feature/advanced-reporting

# 3. Test thoroughly
npm start
# Test all features

# 4. Push to production
git push origin main

# 5. Monitor deployment closely
ssh user@your-vps-ip
pm2 logs propackhub-api

# 6. Test production
# Open https://propackhub.com
# Test new feature

# 7. If issues, rollback
git reset --hard HEAD~1
git push origin main --force
```

---

## 9. TROUBLESHOOTING

### Issue: Deployment Failed

**Symptoms:**
```
GitHub Actions shows red X
OR
Cron job logs show errors
```

**Solution:**
```bash
# 1. Check logs
ssh user@your-vps-ip
tail -f /var/www/propackhub/logs/deploy.log

# 2. Common issues:
# - npm install failed: Check package.json syntax
# - Build failed: Check for syntax errors in code
# - PM2 restart failed: Check server/index.js for errors

# 3. Fix locally, test, push again
cd "D:\PPH 26.01"
# Fix the issue
npm run build  # Test build
git add .
git commit -m "Fixed deployment issue"
git push origin main
```

### Issue: Changes Not Showing

**Symptoms:**
- Pushed code but website looks the same

**Solution:**
```bash
# 1. Verify code was pulled
ssh user@your-vps-ip
cd /var/www/propackhub
git log -1
# Should show your latest commit

# 2. Check if build ran
ls -lh build/
# Should have recent timestamp

# 3. Clear browser cache
# Ctrl + Shift + R (hard refresh)

# 4. Check PM2 restarted
pm2 status
# Should show recent restart time

# 5. Force rebuild
npm run build
pm2 restart propackhub-api
```

### Issue: Production Error But Works Locally

**Symptoms:**
- Works on localhost
- Breaks on production

**Solution:**
```bash
# 1. Check environment variables
ssh user@your-vps-ip
cat /var/www/propackhub/server/.env.production
# Verify all variables are set

# 2. Check logs
pm2 logs propackhub-api --err

# 3. Common causes:
# - Missing environment variable
# - Database connection issue
# - File permissions
# - Missing dependency

# 4. Test production build locally
cd "D:\PPH 26.01"
NODE_ENV=production npm run build
NODE_ENV=production node server/index.js
```

---

## 10. ADVANCED WORKFLOWS

### A. Multiple Environments

**Setup staging environment:**

```yaml
# .github/workflows/deploy-staging.yml
name: Deploy to Staging

on:
  push:
    branches: [ develop ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: appleboy/ssh-action@master
      with:
        host: ${{ secrets.STAGING_HOST }}
        username: ${{ secrets.STAGING_USER }}
        key: ${{ secrets.STAGING_SSH_KEY }}
        script: |
          cd /var/www/propackhub-staging
          git pull origin develop
          npm install --production
          npm run build
          pm2 reload propackhub-staging
```

**Workflow:**
```
develop branch → staging.propackhub.com (test here)
     ↓
main branch → propackhub.com (production)
```

### B. Automated Testing Before Deploy

```yaml
# .github/workflows/deploy-production.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
    - run: npm install
    - run: npm test
    - run: npm run build

  deploy:
    needs: test  # Only deploy if tests pass
    runs-on: ubuntu-latest
    steps:
    # ... deployment steps ...
```

### C. Slack Notifications

```yaml
    - name: Notify Slack on success
      if: success()
      uses: 8398a7/action-slack@v3
      with:
        status: success
        text: '✅ Deployment successful!'
        webhook_url: ${{ secrets.SLACK_WEBHOOK }}

    - name: Notify Slack on failure
      if: failure()
      uses: 8398a7/action-slack@v3
      with:
        status: failure
        text: '❌ Deployment failed!'
        webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

---

## 11. QUICK REFERENCE

### Daily Commands

```bash
# Morning
cd "D:\PPH 26.01"
git pull origin main
START-SERVERS.cmd

# End of day
git status
git add .
git commit -m "Description of changes"
git push origin main

# Check deployment (if manual)
ssh user@your-vps-ip "deploy-propackhub"
```

### Emergency Commands

```bash
# Quick rollback
ssh user@your-vps-ip
cd /var/www/propackhub
git reset --hard HEAD~1
npm run build
pm2 reload propackhub-api

# Check logs
pm2 logs propackhub-api --lines 100

# Restart everything
pm2 restart propackhub-api
sudo systemctl restart nginx
```

### Useful Git Commands

```bash
# See what changed
git status
git diff

# See commit history
git log --oneline -10

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Undo last commit (discard changes)
git reset --hard HEAD~1

# Create branch
git checkout -b feature/new-feature

# Switch branch
git checkout main

# Merge branch
git merge feature/new-feature

# Delete branch
git branch -d feature/new-feature
```

---

## 12. RECOMMENDED SETUP

### For Your Situation

Based on your needs, I recommend:

**Option 1: GitHub Actions (Best)**
- ✅ Automatic deployment on every push
- ✅ Can deploy multiple times per day
- ✅ Deployment history
- ✅ Email notifications
- ✅ Can run tests before deploying

**Setup time:** 30 minutes  
**Maintenance:** None

**Option 2: Scheduled Cron (Simple)**
- ✅ Very simple to setup
- ✅ Predictable deployment time (3 AM daily)
- ✅ No external dependencies

**Setup time:** 10 minutes  
**Maintenance:** None

### My Recommendation

**Use GitHub Actions** because:
1. You can push changes anytime and they deploy immediately
2. You get deployment history and logs
3. You can add tests later
4. You can deploy to multiple environments (staging, production)
5. It's industry standard

**Fallback to Cron** if:
- You prefer simpler setup
- You only want to deploy once per day
- You don't want to use GitHub

---

## 13. NEXT STEPS

### To Get Started

**Step 1: Choose Deployment Method**
- [ ] GitHub Actions (recommended)
- [ ] Scheduled Cron
- [ ] Manual (for testing)

**Step 2: Setup Git Repository**
```bash
cd "D:\PPH 26.01"
git init
git add .
git commit -m "Initial commit"
# Create repo on GitHub
git remote add origin https://github.com/YOUR_USERNAME/propackhub.git
git push -u origin main
```

**Step 3: Setup Deployment**
- [ ] If GitHub Actions: Create `.github/workflows/deploy-production.yml`
- [ ] If Cron: Create `deploy.sh` and add to crontab
- [ ] If Manual: Create quick deploy script

**Step 4: Test Deployment**
```bash
# Make small change
echo "# Test" >> README.md
git add README.md
git commit -m "Test deployment"
git push origin main

# Watch deployment happen
# GitHub: Check Actions tab
# Cron: Wait for scheduled time
# Manual: Run deploy script
```

**Step 5: Start Daily Workflow**
- Work on code
- Commit and push
- Deployment happens automatically
- Monitor and enjoy! 🎉

---

## 📞 SUPPORT

### Need Help?

**Common Questions:**

**Q: How long does deployment take?**  
A: 5-10 minutes (GitHub Actions or manual), or next scheduled time (cron)

**Q: Can I deploy multiple times per day?**  
A: Yes with GitHub Actions or manual. Cron only deploys at scheduled time.

**Q: What if deployment fails?**  
A: Check logs, fix issue, push again. Previous version stays live until successful deployment.

**Q: Can I test before deploying?**  
A: Yes! Always test locally first. Can also setup staging environment.

**Q: How do I rollback?**  
A: `git reset --hard HEAD~1` on VPS, rebuild, restart. See section 6.

---

**Ready to start?** Choose your deployment method and follow the setup steps!

**Document Version:** 1.0  
**Created:** February 4, 2026  
**Status:** Ready to implement
