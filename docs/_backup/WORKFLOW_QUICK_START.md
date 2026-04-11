# ⚡ WORKFLOW QUICK START

**Your Daily Development to Production Pipeline**

---

## 🎯 THE SIMPLE VERSION

### Every Day:

```
1. Morning: Open project, pull latest code
   └─ cd "D:\PPH 26.01"
   └─ git pull origin main
   └─ START-SERVERS.cmd

2. Work: Make changes, test locally
   └─ Edit code
   └─ Test at http://localhost:3000

3. Evening: Commit and push
   └─ git add .
   └─ git commit -m "What you did today"
   └─ git push origin main

4. Automatic: Code goes live
   └─ GitHub Actions deploys (5-10 min)
   └─ OR Cron deploys at 3 AM
   └─ OR You deploy manually
```

---

## 🚀 THREE DEPLOYMENT OPTIONS

### Option 1: GitHub Actions (RECOMMENDED) ⭐

**What it does:**
- Automatically deploys when you push to GitHub
- Takes 5-10 minutes
- Can deploy multiple times per day
- Sends notifications if it fails

**Setup:**
1. Create GitHub account and repository
2. Add `.github/workflows/deploy-production.yml` file
3. Add 3 secrets to GitHub (VPS IP, username, SSH key)
4. Done! Now every `git push` deploys automatically

**Your workflow:**
```bash
# Work all day
git add .
git commit -m "Today's changes"
git push origin main

# Wait 5-10 minutes
# ✅ Changes are live on propackhub.com
```

---

### Option 2: Scheduled Cron Job (SIMPLE) ⏰

**What it does:**
- Deploys once per day at 3:00 AM
- Very simple setup
- No external dependencies

**Setup:**
1. Create `deploy.sh` script on VPS
2. Add one line to crontab
3. Done! Deploys every night at 3 AM

**Your workflow:**
```bash
# Work all day
git add .
git commit -m "Today's changes"
git push origin main

# Go home, sleep
# ✅ Changes are live at 3 AM
```

---

### Option 3: Manual Deployment (FULL CONTROL) 🎮

**What it does:**
- You control when to deploy
- Good for testing
- Good for critical updates

**Setup:**
1. Create quick deploy script
2. Run when you want to deploy

**Your workflow:**
```bash
# Work all day
git add .
git commit -m "Today's changes"
git push origin main

# Deploy manually
ssh user@your-vps-ip "deploy-propackhub"

# ✅ Changes are live in 5 minutes
```

---

## 📋 WHICH ONE SHOULD YOU USE?

| If you want... | Use this |
|----------------|----------|
| **Set it and forget it** | GitHub Actions |
| **Deploy multiple times per day** | GitHub Actions |
| **Simple setup, deploy once daily** | Cron Job |
| **Full control over when to deploy** | Manual |
| **Test deployment process first** | Manual, then switch to GitHub Actions |

**My recommendation:** Start with **Manual** to learn, then switch to **GitHub Actions** for daily use.

---

## 🔧 SETUP IN 3 STEPS

### Step 1: Setup Git (5 minutes)

```bash
# On your local machine
cd "D:\PPH 26.01"

# Initialize git
git init
git add .
git commit -m "Initial commit"

# Create GitHub repository (go to github.com, click New Repository)
# Then:
git remote add origin https://github.com/YOUR_USERNAME/propackhub.git
git push -u origin main
```

### Step 2: Setup VPS (10 minutes)

```bash
# SSH to your VPS
ssh user@your-vps-ip

# Navigate to project
cd /var/www/propackhub

# Setup git
git init
git remote add origin https://github.com/YOUR_USERNAME/propackhub.git
git pull origin main

# Install dependencies
npm install
cd server && npm install && cd ..

# Build
npm run build

# Start
pm2 start ecosystem.config.js
pm2 save
```

### Step 3: Choose Deployment Method

**For GitHub Actions:**
```bash
# Create file: .github/workflows/deploy-production.yml
# Copy content from DAILY_DEVELOPMENT_WORKFLOW.md section 4A
# Add secrets to GitHub (VPS_HOST, VPS_USER, VPS_SSH_KEY)
# Done!
```

**For Cron Job:**
```bash
# On VPS
nano /var/www/propackhub/deploy.sh
# Copy content from DAILY_DEVELOPMENT_WORKFLOW.md section 4B
chmod +x /var/www/propackhub/deploy.sh

# Add to crontab
crontab -e
# Add: 0 3 * * * /var/www/propackhub/deploy.sh >> /var/www/propackhub/logs/deploy.log 2>&1
# Done!
```

**For Manual:**
```bash
# On VPS
nano /usr/local/bin/deploy-propackhub
# Copy content from DAILY_DEVELOPMENT_WORKFLOW.md section 5
chmod +x /usr/local/bin/deploy-propackhub

# Now deploy with:
ssh user@your-vps-ip "deploy-propackhub"
```

---

## 📝 DAILY COMMANDS CHEAT SHEET

### Morning
```bash
cd "D:\PPH 26.01"
git pull origin main
START-SERVERS.cmd
```

### During Day
```bash
# Just work on your code
# Test at http://localhost:3000
```

### Evening
```bash
git status                                    # See what changed
git add .                                     # Add all changes
git commit -m "Fixed bug and added feature"   # Commit with message
git push origin main                          # Push to GitHub

# If manual deployment:
ssh user@your-vps-ip "deploy-propackhub"
```

### Emergency Rollback
```bash
ssh user@your-vps-ip
cd /var/www/propackhub
git reset --hard HEAD~1
npm run build
pm2 reload propackhub-api
```

---

## ✅ VERIFICATION CHECKLIST

After setup, verify:

- [ ] Can push to GitHub: `git push origin main`
- [ ] VPS can pull from GitHub: `git pull origin main` (on VPS)
- [ ] Build works: `npm run build`
- [ ] PM2 is running: `pm2 status`
- [ ] Website is accessible: https://propackhub.com
- [ ] Deployment works (test with small change)

---

## 🎓 EXAMPLE: YOUR FIRST DEPLOYMENT

Let's do a test deployment:

```bash
# 1. Make a small change
cd "D:\PPH 26.01"
echo "# Test deployment" >> README.md

# 2. Commit and push
git add README.md
git commit -m "Test: First deployment"
git push origin main

# 3. Watch it deploy
# - GitHub Actions: Go to github.com → Your Repo → Actions tab
# - Cron: Wait until 3 AM, check logs
# - Manual: ssh user@your-vps-ip "deploy-propackhub"

# 4. Verify
# Open https://propackhub.com
# Check if it's working

# 5. Check logs
ssh user@your-vps-ip
pm2 logs propackhub-api --lines 50

# 6. Success! 🎉
```

---

## 🆘 COMMON ISSUES

### "git push" asks for password every time
```bash
# Use SSH instead of HTTPS
git remote set-url origin git@github.com:YOUR_USERNAME/propackhub.git
```

### Deployment failed
```bash
# Check logs
ssh user@your-vps-ip
tail -f /var/www/propackhub/logs/deploy.log

# Common fixes:
# - npm install failed: Check package.json
# - Build failed: Check for syntax errors
# - PM2 failed: Check server/index.js
```

### Changes not showing
```bash
# Hard refresh browser: Ctrl + Shift + R
# Or clear cache

# Check if code was pulled
ssh user@your-vps-ip
cd /var/www/propackhub
git log -1  # Should show your latest commit
```

---

## 📞 NEED HELP?

**For detailed instructions:** See DAILY_DEVELOPMENT_WORKFLOW.md

**For deployment setup:** See DEPLOYMENT_PLAN_PROPACKHUB.md

**For security fixes:** See DEPLOYMENT_CHECKLIST.md

---

## 🎯 SUMMARY

**What you need:**
1. Git repository (GitHub)
2. VPS with your code
3. Deployment method (GitHub Actions, Cron, or Manual)

**What you do daily:**
1. Work on code
2. Commit and push
3. Deployment happens automatically (or manually)

**Time to setup:** 30 minutes  
**Time to deploy daily:** 2 minutes (just commit and push)

**Ready to start?** Follow Step 1, 2, 3 above! 🚀
