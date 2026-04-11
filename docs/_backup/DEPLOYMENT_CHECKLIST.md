# 🚀 PROPACKHUB DEPLOYMENT CHECKLIST

**Quick Reference Guide for Production Deployment**

---

## PRE-DEPLOYMENT (Do on Local Machine)

### Security Fixes (CRITICAL)
- [ ] Install DOMPurify: `npm install dompurify`
- [ ] Fix XSS in `WriteUpView.jsx` (line 915)
- [ ] Fix XSS in `ProductGroupTable.jsx` (line 592)
- [ ] Replace 40+ hardcoded URLs with `import.meta.env.VITE_API_URL`
- [ ] Generate strong JWT secrets: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] Create production `.env` files (NEVER commit to git)
- [ ] Remove/gate 60+ console.log statements
- [ ] Fix 4 setInterval memory leaks
- [ ] Fix 3 legacy table queries in `server/routes/aebf/actual.js`

### Build & Test
- [ ] Run `npm install` (root and server)
- [ ] Build frontend: `npm run build`
- [ ] Test locally: `NODE_ENV=production node server/index.js`
- [ ] Verify build output in `build/` directory

---

## VPS SETUP

### System Preparation
- [ ] Update system: `sudo apt update && sudo apt upgrade`
- [ ] Install Node.js 18: `curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -`
- [ ] Install PostgreSQL 14: `sudo apt install postgresql-14`
- [ ] Install Nginx: `sudo apt install nginx`
- [ ] Install PM2: `sudo npm install -g pm2`
- [ ] Install Redis (optional): `sudo apt install redis-server`
- [ ] Install Oracle Instant Client (see section 7.3)

### Firewall Configuration
- [ ] Install UFW: `sudo apt install ufw`
- [ ] Allow SSH: `sudo ufw allow 22/tcp`
- [ ] Allow HTTP/HTTPS: `sudo ufw allow 80/tcp && sudo ufw allow 443/tcp`
- [ ] Enable firewall: `sudo ufw enable`

---

## DATABASE SETUP

- [ ] Create PostgreSQL user: `propackhub_user`
- [ ] Create databases: `fp_database`, `ip_auth_database`, `propackhub_platform`
- [ ] Import database dumps OR run migrations
- [ ] Configure `pg_hba.conf` for local connections
- [ ] Tune PostgreSQL settings (section 6.5)
- [ ] Verify: `psql -U propackhub_user -d fp_database -c "SELECT COUNT(*) FROM fp_actualcommon;"`

---

## APPLICATION DEPLOYMENT

### Backend
- [ ] Create directory: `/var/www/propackhub`
- [ ] Upload/clone code to VPS
- [ ] Install dependencies: `npm install && cd server && npm install`
- [ ] Create `server/.env.production` with production values
- [ ] Set permissions: `chmod 600 server/.env.production`
- [ ] Create `ecosystem.config.js` for PM2
- [ ] Start with PM2: `pm2 start ecosystem.config.js`
- [ ] Save PM2 config: `pm2 save`
- [ ] Setup PM2 startup: `pm2 startup systemd`
- [ ] Test: `curl http://localhost:3001/api/health`

### Frontend
- [ ] Build frontend: `npm run build`
- [ ] Configure Nginx (section 8.3)
- [ ] Enable site: `sudo ln -s /etc/nginx/sites-available/propackhub.com /etc/nginx/sites-enabled/`
- [ ] Test Nginx: `sudo nginx -t`
- [ ] Reload Nginx: `sudo systemctl reload nginx`

### SSL Certificate
- [ ] Install Certbot: `sudo apt install certbot python3-certbot-nginx`
- [ ] Obtain certificate: `sudo certbot --nginx -d propackhub.com -d www.propackhub.com`
- [ ] Test auto-renewal: `sudo certbot renew --dry-run`
- [ ] Verify: `curl https://propackhub.com/api/health`

---

## ORACLE ERP AUTOMATION

- [ ] Create `server/scripts/automated-oracle-sync.js`
- [ ] Make executable: `chmod +x server/scripts/automated-oracle-sync.js`
- [ ] Test manually: `node server/scripts/automated-oracle-sync.js`
- [ ] Add to crontab: `0 2 * * * cd /var/www/propackhub && node server/scripts/automated-oracle-sync.js`
- [ ] Create health check script
- [ ] Schedule health check: `0 * * * * cd /var/www/propackhub && node server/scripts/check-sync-health.js`

---

## CI/CD PIPELINE

- [ ] Create `deploy.sh` script
- [ ] Make executable: `chmod +x deploy.sh`
- [ ] Test deployment: `./deploy.sh`
- [ ] Schedule daily deployment: `0 3 * * * /var/www/propackhub/deploy.sh`
- [ ] OR setup GitHub Actions (section 10.3)

---

## BACKUP STRATEGY

- [ ] Create backup directory: `/var/backups/propackhub`
- [ ] Create `backup-databases.sh` script
- [ ] Schedule daily DB backup: `0 1 * * * /var/www/propackhub/server/scripts/backup-databases.sh`
- [ ] Create `backup-files.sh` script
- [ ] Schedule weekly file backup: `0 2 * * 0 /var/www/propackhub/server/scripts/backup-files.sh`
- [ ] Setup off-site backup (AWS S3 or rsync)
- [ ] Test restoration procedure

---

## MONITORING

- [ ] Setup PM2 monitoring: `pm2 monit`
- [ ] Configure log rotation: `/etc/logrotate.d/propackhub`
- [ ] Create database health check script
- [ ] Create uptime check script
- [ ] Setup external monitoring (UptimeRobot, Pingdom, etc.)

---

## POST-DEPLOYMENT VERIFICATION

- [ ] Test login: https://propackhub.com
- [ ] Test API: https://propackhub.com/api/health
- [ ] Test Oracle sync manually
- [ ] Check PM2 status: `pm2 status`
- [ ] Check logs: `pm2 logs propackhub-api`
- [ ] Check database connections: `sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"`
- [ ] Test all major features (dashboards, reports, CRM)
- [ ] Verify SSL certificate: https://www.ssllabs.com/ssltest/
- [ ] Check performance: https://pagespeed.web.dev/

---

## ONGOING MAINTENANCE

### Daily
- [ ] Check PM2 status
- [ ] Review error logs
- [ ] Verify Oracle sync completed

### Weekly
- [ ] Review backup logs
- [ ] Check disk space: `df -h`
- [ ] Review slow queries
- [ ] Check system resources: `htop`

### Monthly
- [ ] Update system packages: `sudo apt update && sudo apt upgrade`
- [ ] Review and optimize database
- [ ] Test backup restoration
- [ ] Review security logs
- [ ] Update Node.js dependencies (if needed)

---

## EMERGENCY CONTACTS

**VPS Provider:** GoDaddy  
**Domain:** propackhub.com  
**Database:** PostgreSQL 14  
**Oracle ERP:** PRODDB-SCAN.ITSUPPORT.HG:1521/REPDB

**Key Files:**
- Backend: `/var/www/propackhub/server/index.js`
- Frontend: `/var/www/propackhub/build/`
- Nginx Config: `/etc/nginx/sites-available/propackhub.com`
- PM2 Config: `/var/www/propackhub/ecosystem.config.js`
- Environment: `/var/www/propackhub/server/.env.production`

**Rollback Command:**
```bash
cd /var/www/propackhub
tar -xzf /var/backups/propackhub/backup_YYYYMMDD_HHMMSS.tar.gz
pm2 restart propackhub-api
sudo systemctl reload nginx
```

---

## ESTIMATED TIMELINE

| Phase | Duration | Notes |
|-------|----------|-------|
| Pre-deployment fixes | 4-6 hours | Security, code cleanup |
| VPS setup | 2-3 hours | System, firewall, software |
| Database setup | 1-2 hours | Install, import, configure |
| Backend deployment | 2-3 hours | Code, PM2, Oracle client |
| Frontend deployment | 1-2 hours | Build, Nginx, SSL |
| Oracle automation | 1-2 hours | Scripts, cron jobs |
| CI/CD setup | 1-2 hours | Deploy script, GitHub Actions |
| Backup setup | 1 hour | Scripts, scheduling |
| Monitoring setup | 1 hour | Health checks, alerts |
| Testing & verification | 2-3 hours | Full system test |
| **TOTAL** | **16-25 hours** | Spread over 2-3 days |

---

**Document Version:** 1.0  
**Created:** February 4, 2026  
**For detailed instructions, see:** DEPLOYMENT_PLAN_PROPACKHUB.md
