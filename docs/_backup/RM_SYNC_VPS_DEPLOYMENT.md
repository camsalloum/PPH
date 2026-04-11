# Raw Material Sync - VPS Deployment Guide

## Prerequisites
✅ All backend code is already deployed (migration 313, routes, sync script)
✅ VPN connection is configured (same as sales sync)
✅ Oracle credentials are in VPS `.env`

---

## Deployment Steps

### 1. Deploy Code to VPS
Use the Settings → Deploy to VPS button, or manually:

```bash
# On local machine
git add .
git commit -m "Add RM sync feature"
git push origin main

# On VPS (SSH as propackhub user)
cd /home/propackhub/app
git pull origin main
npm install
pm2 restart propackhub-backend
```

### 2. Run Migration on VPS
```bash
cd /home/propackhub/app
node scripts/run-migration-313.js
```

**Expected output:**
```
Running Migration 313: Create fp_actualrmdata table...
✅ fp_actualrmdata table created successfully
Table has 15 columns:
  id (integer)
  division (text)
  itemgroup (text)
  category (text)
  ...
```

### 3. Test Manual Sync
```bash
cd /home/propackhub/app
node scripts/simple-rm-sync.js
```

**Expected output:**
```
═══════════════════════════════════════════════════════════
  🧪 RAW MATERIAL SYNC (RM)
  Oracle View: HAP111.XL_FPRMAVERAGES_PMD_111
  Target: fp_actualrmdata
═══════════════════════════════════════════════════════════

1. Connecting to Oracle...
   ✓ Connected to Oracle 19.0.0.0.0

2. Fetching from Oracle...
   ✓ Fetched 347 rows in 2.3s

3. Clearing fp_actualrmdata...
   ✓ Truncated table

4. Bulk loading into PostgreSQL...
   ✓ Inserted 347 rows in 0.5s

═══════════════════════════════════════════════════════════
  ✅ RM SYNC COMPLETE!
  Total Rows: 347
  Total Time: 0.1 min (2.8s)
═══════════════════════════════════════════════════════════
```

### 4. Set Up Cron Job (Every 30 Minutes)

**Option A: Using crontab (recommended)**

```bash
# Make script executable
chmod +x /home/propackhub/app/scripts/cron-rm-sync.sh

# Create logs directory if it doesn't exist
mkdir -p /home/propackhub/app/logs

# Edit crontab
crontab -e

# Add this line (syncs every 30 minutes)
*/30 * * * * /home/propackhub/app/scripts/cron-rm-sync.sh >> /home/propackhub/app/logs/rm-sync-cron.log 2>&1
```

**Option B: Using pm2-cron (alternative)**

```bash
# Install pm2-cron if not already installed
npm install -g pm2-cron

# Add cron job
pm2 start scripts/simple-rm-sync.js --cron "*/30 * * * *" --name "rm-sync-cron" --no-autorestart

# Save pm2 configuration
pm2 save
```

### 5. Verify Cron Job

**Check crontab:**
```bash
crontab -l
```

**Check logs:**
```bash
tail -f /home/propackhub/app/logs/rm-sync-cron.log
```

**Check next run time:**
```bash
# List cron jobs with next run time
crontab -l | grep rm-sync
```

---

## Cron Schedule Options

| Schedule | Cron Expression | Description |
|----------|----------------|-------------|
| Every 30 min | `*/30 * * * *` | Current (recommended) |
| Every hour | `0 * * * *` | On the hour |
| Every 2 hours | `0 */2 * * *` | Every 2 hours |
| Daily at 2 AM | `0 2 * * *` | Once per day |
| Every 15 min | `*/15 * * * *` | More frequent |

---

## Monitoring

### Check Last Sync via API
```bash
curl http://propackhub.com/api/rm-sync/stats
```

### Check Last Sync via UI
Navigate to: **Master Data → Product Groups → Raw Materials**

The page shows:
- Last sync timestamp
- Row count
- Stats (divisions, item groups)

### Check Cron Logs
```bash
# View last 50 lines
tail -50 /home/propackhub/app/logs/rm-sync-cron.log

# Follow live
tail -f /home/propackhub/app/logs/rm-sync-cron.log

# Search for errors
grep -i error /home/propackhub/app/logs/rm-sync-cron.log
```

---

## Troubleshooting

### Cron Not Running

**Check cron service:**
```bash
sudo systemctl status crond
```

**Restart cron:**
```bash
sudo systemctl restart crond
```

**Check cron logs:**
```bash
sudo tail -f /var/log/cron
```

### VPN Connection Issues

**Test VPN manually:**
```bash
cd /home/propackhub/app
node scripts/test-vpn-ssh.js
```

**Check VPN status:**
```bash
curl http://localhost:5000/api/oracle-direct/vpn-status
```

### Oracle Connection Issues

**Test Oracle connection:**
```bash
cd /home/propackhub/app
node scripts/test-rm-sync-10-rows.js
```

**Check Oracle credentials in .env:**
```bash
grep ORACLE /home/propackhub/app/server/.env
```

### Permission Issues

**Make script executable:**
```bash
chmod +x /home/propackhub/app/scripts/cron-rm-sync.sh
```

**Check file ownership:**
```bash
ls -la /home/propackhub/app/scripts/cron-rm-sync.sh
```

**Fix ownership if needed:**
```bash
sudo chown propackhub:propackhub /home/propackhub/app/scripts/cron-rm-sync.sh
```

---

## Comparison: Sales vs RM Sync Cron

| Feature | Sales Sync | RM Sync |
|---------|-----------|---------|
| Cron Script | `cron-oracle-sync.sh` | `cron-rm-sync.sh` |
| Sync Script | `simple-oracle-sync.js` | `simple-rm-sync.js` |
| Schedule | Daily at 2 PM UAE | Every 30 min |
| Duration | 3-5 min | <10 sec |
| Rows | ~50,000+ | ~300-500 |
| Log File | `oracle-sync-cron.log` | `rm-sync-cron.log` |

---

## Manual Sync from UI

Users can also trigger sync manually from the UI:
1. Navigate to **Master Data → Product Groups → Raw Materials**
2. Click **"Sync RM Data"** button
3. Watch progress indicator
4. Table refreshes automatically when complete

---

## Environment Variables Required

Ensure these are in `/home/propackhub/app/server/.env`:

```bash
# Oracle Connection
ORACLE_SYNC_USER=noor
ORACLE_SYNC_PASSWORD=***REDACTED***
ORACLE_CONNECT_STRING=PRODDB-SCAN.ITSUPPORT.HG:1521/PRODREPDB.snetprivdb.vcnprodinfor.oraclevcn.com
ORACLE_CLIENT_PATH=/usr/lib/oracle/21/client64/lib

# VPN Connection (for VPS)
VPN_GATEWAY=5.195.104.114
VPN_PORT=48443
VPN_USER=camille
VPN_PASSWORD=***REDACTED***
VPN_TRUSTED_CERT=ae1094d5865601d0ecccd1364cc169cefa1d92babac287753f9a1effc3254c66

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=fp_database
DB_USER=postgres
DB_PASSWORD=654883
```

---

## Quick Commands Reference

```bash
# Deploy code
cd /home/propackhub/app && git pull && npm install && pm2 restart propackhub-backend

# Run migration
node scripts/run-migration-313.js

# Test sync manually
node scripts/simple-rm-sync.js

# Set up cron (every 30 min)
chmod +x scripts/cron-rm-sync.sh
echo "*/30 * * * * /home/propackhub/app/scripts/cron-rm-sync.sh >> /home/propackhub/app/logs/rm-sync-cron.log 2>&1" | crontab -

# View cron jobs
crontab -l

# View logs
tail -f logs/rm-sync-cron.log

# Check stats
curl http://localhost:5000/api/rm-sync/stats
```

---

**Last Updated**: February 10, 2026  
**Status**: ✅ Ready for VPS Deployment
