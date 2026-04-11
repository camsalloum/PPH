# Raw Material (RM) Data Sync Guide

## Overview
Direct sync of raw material data from Oracle ERP to PostgreSQL, bypassing Excel exports.

**Oracle Source**: `HAP111.XL_FPRMAVERAGES_PMD_111`  
**PostgreSQL Target**: `fp_actualrmdata`  
**Connection**: Same as sales sync (VPN on VPS, direct on local network)

---

## Oracle View Columns (12 columns)

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| DIVISION | TEXT | Division name | "Films And Bags" |
| ITEMGROUP | TEXT | Item group | "Hdpe For Cp" |
| CATEGORY | TEXT | Category | "Inks" |
| CATLINEDESC | TEXT | Category line description | null |
| MAINITEM | TEXT | Item code (trimmed) | "Bxxikbfink" |
| MAINDESCRIPTION | TEXT | Item description | "Fb Common Ink" |
| MAINUNIT | TEXT | Unit of measure | "Kgs" |
| MAINCOST | NUMERIC | Cost per unit | 14.82 |
| MAINITEMSTOCK | NUMERIC | Current stock quantity | 14795 |
| PENDINGORDERQTY | NUMERIC | Pending order quantity | 0 |
| PURCHASEPRICE | NUMERIC | Purchase price | 0 |
| WAREHOUSE | TEXT | Warehouse code | "Br2" |

**Note**: All text fields are automatically trimmed and converted to proper case (first letter capital).

---

## PostgreSQL Table Structure

```sql
CREATE TABLE fp_actualrmdata (
  id SERIAL PRIMARY KEY,
  
  -- Oracle columns (12)
  division TEXT,
  itemgroup TEXT,
  category TEXT,
  catlinedesc TEXT,
  mainitem TEXT,
  maindescription TEXT,
  mainunit TEXT,
  maincost NUMERIC,
  mainitemstock NUMERIC,
  pendingorderqty NUMERIC,
  purchaseprice NUMERIC,
  warehouse TEXT,
  
  -- Metadata
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes**: division, itemgroup, category, warehouse, mainitem

---

## API Endpoints

### Start Sync
```http
POST /api/rm-sync/sync
```
Starts raw material sync from Oracle. Auto-connects VPN if needed (VPS only).

**Response**:
```json
{
  "success": true,
  "syncId": "1707567890123",
  "message": "RM sync started."
}
```

### Get Progress
```http
GET /api/rm-sync/progress
```
Returns live sync progress.

**Response**:
```json
{
  "success": true,
  "progress": {
    "status": "running",
    "phase": "Fetching from Oracle...",
    "rows": 347,
    "elapsedSeconds": 12
  }
}
```

### Get Stats
```http
GET /api/rm-sync/stats
```
Returns table statistics.

**Response**:
```json
{
  "success": true,
  "stats": {
    "total_rows": 347,
    "divisions": 3,
    "item_groups": 45,
    "warehouses": 5,
    "last_sync": "2026-02-10T14:30:00Z"
  },
  "byDivision": [
    {
      "division": "Films And Bags",
      "row_count": 200,
      "total_stock_value": 1500000,
      "total_pending_value": 250000
    }
  ]
}
```

### Query Data
```http
GET /api/rm-sync/data?division=Films%20And%20Bags&limit=100
```
Query raw material data with filters.

**Query params**:
- `division` - Filter by division
- `itemgroup` - Filter by item group
- `warehouse` - Filter by warehouse
- `limit` - Max rows (default: 500)

### Get Last Sync
```http
GET /api/rm-sync/last-sync
```
Returns last successful sync info.

---

## CLI Usage

### Test Connection (10 rows)
```bash
node scripts/test-rm-sync-10-rows.js
```

### Full Sync
```bash
node scripts/simple-rm-sync.js
```

**Expected output**:
```
═══════════════════════════════════════════════════════════
  🧪 RAW MATERIAL SYNC (RM)
  Oracle View: HAP111.XL_FPRMAVERAGES_PMD_111
  Target: fp_actualrmdata
  Date: 2026-02-10T14:30:00Z
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
  Oracle Fetch: 2.3s
  PostgreSQL Copy: 0.5s
  Total Time: 0.1 min (2.8s)
═══════════════════════════════════════════════════════════
```

---

## Connection Details

**Oracle**:
- Host: `PRODDB-SCAN.ITSUPPORT.HG:1521/REPDB`
- User: `noor`
- Password: `***REDACTED***`
- Schema: `HAP111`
- View: `XL_FPRMAVERAGES_PMD_111`

**VPN** (VPS only):
- Gateway: `5.195.104.114:48443`
- User: `camille`
- Password: `***REDACTED***`
- Type: FortiGate SSL-VPN

**Local Network**: VPN not needed — Oracle is directly reachable.

---

## Data Formatting

All text fields are automatically:
1. **Trimmed** - Leading/trailing spaces removed
2. **Proper cased** - First letter capital, rest lowercase

**Examples**:
- `"          BXXIKBFINK"` → `"Bxxikbfink"`
- `"HDPE FOR CP"` → `"Hdpe For Cp"`
- `"Films and Bags"` → `"Films And Bags"`
- `"  WAREHOUSE  "` → `"Warehouse"`

---

## Deployment

### Local Development
1. Run migration: `node scripts/run-migration-313.js`
2. Test connection: `node scripts/test-rm-sync-10-rows.js`
3. Run sync: `node scripts/simple-rm-sync.js`

### VPS Deployment
1. Deploy code via Settings → Deploy to VPS
2. VPN auto-connects before sync
3. Sync via API: `POST /api/rm-sync/sync`

**Cron job** (optional): Add to VPS crontab for daily sync at 2 PM UAE time:
```bash
0 10 * * * cd /home/propackhub/app && /usr/local/bin/node scripts/simple-rm-sync.js >> logs/rm-sync.log 2>&1
```

---

## Comparison: Sales vs RM Sync

| Feature | Sales Sync | RM Sync |
|---------|-----------|---------|
| Oracle View | `HAP111.XL_FPSALESVSCOST_FULL` | `HAP111.XL_FPRMAVERAGES_PMD_111` |
| PG Table | `fp_raw_oracle` | `fp_actualrmdata` |
| Columns | 57 | 12 |
| API Route | `/api/oracle-direct/*` | `/api/rm-sync/*` |
| Sync Script | `simple-oracle-sync.js` | `simple-rm-sync.js` |
| Typical Rows | ~50,000+ | ~300-500 |
| Sync Time | 3-5 min | <10 sec |
| Text Formatting | None | Trim + Proper Case |

---

## Troubleshooting

### VPN Connection Failed
**Error**: `VPN connection failed: openfortivpn is not installed`  
**Fix**: Install on VPS: `sudo dnf install -y openfortivpn`

### Oracle Not Reachable
**Error**: `Oracle host not reachable`  
**Fix**: 
1. Check VPN is connected: `GET /api/rm-sync/vpn-status`
2. Test VPN: `POST /api/oracle-direct/vpn-test`
3. Verify routes: `ip route | grep ppp0`

### Column Mismatch
**Error**: `No Oracle column match for PG column: xyz`  
**Fix**: Oracle view columns may have changed. Run test script to see actual columns:
```bash
node scripts/test-rm-sync-10-rows.js
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `migrations/313_create_fp_actualrmdata.sql` | Table creation |
| `scripts/simple-rm-sync.js` | Main sync script |
| `scripts/test-rm-sync-10-rows.js` | Connection test |
| `scripts/run-migration-313.js` | Migration runner |
| `server/routes/rmSync.js` | API endpoints |
| `server/config/express.js` | Route registration |
| `server/services/VPNService.js` | VPN connection (shared) |

---

**Last Updated**: February 10, 2026  
**Status**: ✅ Production Ready
