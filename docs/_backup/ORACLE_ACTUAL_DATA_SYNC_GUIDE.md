# Oracle Actual Sales Data Sync Guide

**Last Updated**: February 10, 2026  
**Status**: ✅ Fully Operational

---

## Overview

Actual sales data is synced from Oracle ERP into the application through a 3-layer pipeline:

```
Oracle ERP (HAP111.XL_FPSALESVSCOST_FULL, 57 columns)
        │
        ▼  [oracledb npm package, direct fetch]
  fp_raw_oracle (PostgreSQL - raw copy, 57 cols + 3 metadata)
        │
        ▼  [sync_oracle_to_actualcommon() PL/pgSQL function]
  fp_actualcommon (PostgreSQL - transformed, proper case, 70+ cols)
        │
        ▼  [API queries]
  Dashboards & Reports
```

---

## 1. Oracle Connection Details

| Setting | Value |
|---------|-------|
| Host | PRODDB-SCAN.ITSUPPORT.HG |
| Port | 1521 |
| Service | PRODREPDB.snetprivdb.vcnprodinfor.oraclevcn.com |
| Schema | HAP111 |
| View | XL_FPSALESVSCOST_FULL |
| User | noor |
| Oracle Client | D:\app\client\Administrator\product\12.1.0\client_1 |
| npm package | oracledb (v6.10.0) |

> **Note**: `server/.env` has `ORACLE_USER=camille` / `ORACLE_PASSWORD=***REDACTED***` but these are NOT used by active sync scripts. All working scripts hardcode the `noor` credentials.

---

## 2. Sync Methods

### 2.1 Primary: CLI Script

**Script**: `scripts/simple-oracle-sync.js`

```bash
node scripts/simple-oracle-sync.js 2026   # Sync specific year
node scripts/simple-oracle-sync.js         # Sync all years
```

**Steps**:
1. Connects to Oracle via `oracledb.getConnection()`
2. Runs `SELECT <57 columns> FROM HAP111.XL_FPSALESVSCOST_FULL [WHERE YEAR1 = ?]`
3. Fetches all rows into memory (direct fetch, no cursor)
4. Deletes existing data in `fp_raw_oracle` for target year (or truncates for all)
5. Bulk inserts via PostgreSQL `COPY` command (pg-copy-streams, TSV format)
6. Calls `SELECT sync_oracle_to_actualcommon()` to transform into `fp_actualcommon`
7. Writes progress to `server/sync-progress.json` for UI polling

### 2.2 API-Triggered (from UI)

**Route**: `POST /api/oracle-direct/sync`  
**File**: `server/routes/oracleDirectSync.js`

```json
{ "mode": "current-year", "year": 2026 }
```

Spawns `simple-oracle-sync.js` as a child process (2-hour timeout). UI polls progress via:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/oracle-direct/progress` | Live progress from sync-progress.json |
| `GET /api/oracle-direct/sync/:syncId/status` | Status of a specific sync run |
| `GET /api/oracle-direct/stats` | Row counts by year/division in fp_raw_oracle |
| `GET /api/oracle-direct/last-sync` | Last sync timestamp from company_settings |
| `DELETE /api/oracle-direct/data` | Clear fp_raw_oracle table |

---

## 3. Database Tables

### 3.1 fp_raw_oracle (Layer 1 — Raw Copy)

Created by `scripts/create-oracle-raw-table.js`. Mirrors Oracle view exactly.

**57 Oracle columns** (stored as-is, UPPERCASE format):

| Column | Type | Column | Type |
|--------|------|--------|------|
| division | TEXT | salesrepname | TEXT |
| subdivision | TEXT | salesrepcode | TEXT |
| customertitle | TEXT | unitdescription | TEXT |
| itemcode | TEXT | selectioncodedescription | TEXT |
| itemgroupcode | TEXT | selectioncode | TEXT |
| itemgroupdescription | TEXT | producttype | TEXT |
| subgroup | TEXT | invoicedate | TIMESTAMP |
| itemdescription | TEXT | transactiontype | TEXT |
| weight | NUMERIC | invoiceno | TEXT |
| financialcustomer | TEXT | productgroup | TEXT |
| customer | TEXT | year1 | INTEGER |
| customername | TEXT | month1 | TEXT |
| firstrandate | TIMESTAMP | monthno | INTEGER |
| countryname | TEXT | deliveredqtyinstorageunits | NUMERIC |
| deliveredquantity | NUMERIC | machineno | TEXT |
| deliveredquantitykgs | NUMERIC | machinename | TEXT |
| invoicedamount | NUMERIC | titlecode | TEXT |
| materialvalue | NUMERIC | titlename | TEXT |
| opvalue | NUMERIC | address_1 | TEXT |
| marginoverrm | NUMERIC | address_2 | TEXT |
| totalvalue | NUMERIC | postbox | TEXT |
| marginovertotal | NUMERIC | phone | TEXT |
| building | TEXT | creditlimit | NUMERIC |
| paymentcode | TEXT | termsofpayment | TEXT |
| paymentdays | INTEGER | contactname | TEXT |
| contactposition | TEXT | contdepartment | TEXT |
| conttel | TEXT | contmob | TEXT |
| contemail | TEXT | businesspartnertype | TEXT |
| deliveryterms | TEXT | | |

**3 Metadata columns**: `oracle_sync_batch_id` (UUID), `synced_at` (TIMESTAMP), `created_at` (TIMESTAMP)

**Indexes**: division, year1, monthno, customername, salesrepname, productgroup, oracle_sync_batch_id

### 3.2 fp_actualcommon (Layer 2 — Transformed)

Populated by `sync_oracle_to_actualcommon()` PL/pgSQL function.  
Created by `scripts/create-oracle-sync-trigger.js`.

**Transformations applied**:

| Transformation | Detail |
|----------------|--------|
| Case normalization | UPPERCASE → INITCAP for names, UPPER for codes, LOWER for emails |
| Division mapping | Oracle division → admin division via `divisions` table (`raw_divisions` JSONB array) |
| Sales rep grouping | Joins `sales_rep_group_members` + `sales_rep_groups` → assigns group_id/group_name |
| Product group mapping | Looks up `fp_raw_product_groups` to map raw productgroup → pg_combine |
| Null handling | COALESCE on numeric fields (amount, qty, margins) to 0 |
| Invoice number | Cast to NUMERIC if numeric, NULL otherwise |
| Sync metadata | sync_source = 'oracle_direct', batch ID stored in erp_extra_data JSONB |

**Division mapping logic** (inside the PL/pgSQL function):
```sql
FROM fp_raw_oracle r
CROSS JOIN divisions d
WHERE r.division = ANY(SELECT jsonb_array_elements_text(d.raw_divisions))
```
Example: Oracle divisions FP and BF both map to admin division "Flexible Packaging" (FP).

---

## 4. Sync Triggers

| Trigger | On Table | Action |
|---------|----------|--------|
| trigger_sync_oracle_actualcommon | fp_raw_oracle | Calls sync_oracle_to_actualcommon() on INSERT/UPDATE/DELETE |
| trg_sync_budget_unified | fp_sales_rep_budget | Refreshes budget unified stats + merge rules |
| trg_sync_merges_on_rule_change | fp_division_customer_merge_rules | Re-syncs customer merges to both unified tables |
| trg_sync_on_group_member_change | sales_rep_group_members | Refreshes both actual and budget unified stats |
| trg_sync_on_country_change | master_countries | Refreshes both actual and budget unified stats |

> The bulk sync scripts call `sync_oracle_to_actualcommon()` manually at the end rather than relying on the trigger, for performance.

---

## 5. Key Files

| File | Purpose |
|------|---------|
| `scripts/simple-oracle-sync.js` | **Primary sync script** (Oracle → fp_raw_oracle → fp_actualcommon) |
| `scripts/create-oracle-raw-table.js` | Creates fp_raw_oracle table structure |
| `scripts/create-oracle-sync-trigger.js` | Creates sync_oracle_to_actualcommon() function + trigger |
| `server/routes/oracleDirectSync.js` | API endpoints for UI-triggered sync |
| `server/services/OracleERPSyncService.js` | **Legacy** ODBC-based sync (NOT actively used) |
| `scripts/fast-sync-2026.js` | Year-specific sync (superseded by simple-oracle-sync.js) |
| `scripts/sync-oracle-direct.js` | Earlier direct sync (superseded by simple-oracle-sync.js) |

---

## 6. Stale References in Other Docs

These older docs have references that do NOT match the current implementation:

| Document | Stale Reference | Actual (Current) |
|----------|----------------|-------------------|
| `ERP_IMPLEMENTATION_CONTEXT.md` | `fp_raw_data` as Layer 1 | `fp_raw_oracle` |
| `ERP_IMPLEMENTATION_CONTEXT.md` | `fp_actualdata` as Layer 2 | `fp_actualcommon` |
| `ERP_IMPLEMENTATION_CONTEXT.md` | `ActualDataTransformationService` (Node.js) | `sync_oracle_to_actualcommon()` (PL/pgSQL) |
| `ERP_IMPLEMENTATION_CONTEXT.md` | `DivisionMappingService` (Node.js) | Division mapping inside PL/pgSQL function |
| `ERP_IMPLEMENTATION_CONTEXT.md` | `OracleERPSyncService` via ODBC | `simple-oracle-sync.js` via `oracledb` |
| `DATA_FLOWS_MERMAID.md` | Excel export as primary path | Direct Oracle → PostgreSQL (no Excel) |
| `DATA_FLOWS_MERMAID.md` | `fp_raw_data` in diagrams | `fp_raw_oracle` |
| `server/.env` | `ORACLE_USER=camille` | Scripts use `noor` (hardcoded) |

---

## 7. Quick Reference

### Sync current year:
```bash
node scripts/simple-oracle-sync.js 2026
```

### Full sync:
```bash
node scripts/simple-oracle-sync.js
```

### Re-transform only (no Oracle fetch):
```sql
SELECT sync_oracle_to_actualcommon();
```
Re-runs the transform from existing fp_raw_oracle data. Useful after changing division mappings, sales rep groups, or product group mappings.

### From the UI:
Master Data → Actual tab → "Sync from Oracle" → Choose mode → Monitor progress


---

## 8. VPS Deployment — VPN + Oracle Sync

### The Problem

On the local dev PC, Oracle is reachable directly (same network or VPN connected manually via FortiClient). On the GoDaddy VPS (148.66.152.55, AlmaLinux 8.10), Oracle is NOT reachable — it requires a FortiGate SSL-VPN tunnel first.

### VPN Details

| Setting | Value |
|---------|-------|
| Type | FortiGate SSL-VPN |
| Gateway | 5.195.104.114 |
| Port | 48443 |
| User | camille |
| Tool on VPS | `openfortivpn` (CLI, open-source FortiGate client) |

### Architecture — Sync Flow on VPS

```
User clicks "Sync from Oracle" in UI
        │
        ▼
POST /api/oracle-direct/sync
        │
        ▼
1. VPNService.connect()
   └─ Spawns: sudo openfortivpn 5.195.104.114:48443 -u camille -p ***
   └─ Waits for "Tunnel is up" message (max 60s)
   └─ Verifies Oracle host reachable on port 1521
        │
        ▼
2. Run sync: node simple-oracle-sync.js [year]
   └─ Connects to Oracle via oracledb
   └─ Fetches data → COPY into fp_raw_oracle
   └─ Calls sync_oracle_to_actualcommon()
        │
        ▼
3. VPNService.disconnect()
   └─ Kills openfortivpn process
   └─ VPN tunnel closed
        │
        ▼
Return result to UI
```

### VPS Prerequisites

These must be installed on the VPS before sync will work:

1. **openfortivpn** — FortiGate SSL-VPN CLI client
   ```bash
   sudo dnf install -y epel-release
   sudo dnf install -y openfortivpn
   ```

2. **Oracle Instant Client** — required by `oracledb` npm package
   ```bash
   sudo dnf install -y libaio
   # Download Oracle Instant Client Basic + SQL*Plus from:
   # https://www.oracle.com/database/technologies/instant-client/linux-x86-64-downloads.html
   sudo rpm -ivh oracle-instantclient-basic-*.rpm
   sudo rpm -ivh oracle-instantclient-sqlplus-*.rpm
   # Set environment
   echo 'export LD_LIBRARY_PATH=/usr/lib/oracle/21/client64/lib:$LD_LIBRARY_PATH' >> ~/.bashrc
   source ~/.bashrc
   ```

3. **oracledb npm package** — already in package.json, just needs `npm install` on VPS

### Environment Variables

Added to `server/.env` (and VPS `server/.env`):

```env
# FortiGate SSL-VPN (for Oracle ERP access from VPS)
VPN_GATEWAY=5.195.104.114
VPN_PORT=48443
VPN_USER=camille
VPN_PASSWORD=***REDACTED***
```

### Key Files

| File | Purpose |
|------|---------|
| `server/services/VPNService.js` | VPN connect/disconnect/status (openfortivpn wrapper) |
| `server/routes/oracleDirectSync.js` | Updated to call VPN before sync |
| `scripts/simple-oracle-sync.js` | Oracle sync script (unchanged) |

### API Endpoints (new)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/oracle-direct/vpn-status` | GET | Check VPN connection status |
| `/api/oracle-direct/vpn-test` | POST | Test VPN connect + Oracle reachability |

### Smart Behavior

- On local dev (Oracle already reachable): VPN step is skipped automatically
- On VPS (Oracle not reachable): VPN connects, syncs, then disconnects
- If VPN fails: Sync aborts with clear error message, no partial data
- VPN is only up during sync — not a persistent connection


### SSH Access to VPS

SSH is established from the local dev PC using the `node-ssh` npm package (already installed in `server/node_modules`). Run from the `server/` directory:

```javascript
const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();
await ssh.connect({
  host: 'propackhub.com',
  port: 22,
  username: 'propackhub',
  password: '***REDACTED***',
  readyTimeout: 10000
});
const result = await ssh.execCommand('your command here');
console.log(result.stdout);
ssh.dispose();
```

| Setting | Value |
|---------|-------|
| Host | propackhub.com (148.66.152.55) |
| Port | 22 |
| User | propackhub |
| Password | ***REDACTED*** |
| OS | AlmaLinux 8.10 (Cerulean Leopard) |
| Kernel | 4.18.0-553.100.1.el8_10.x86_64 |
| Sudo | passwordless (`/etc/sudoers.d/propackhub`) |

Connection confirmed working on Feb 10, 2026.

---

## 9. Scheduled Sync (Cron Job)

A cron job runs the Oracle sync automatically every day at 2:00 PM UAE time (10:00 AM UTC).

| Setting | Value |
|---------|-------|
| Schedule | Daily at 2:00 PM UAE (10:00 AM UTC) |
| Script | `/home/propackhub/app/scripts/oracle-sync-cron.sh` |
| Log file | `/home/propackhub/logs/oracle-sync.log` |
| Sync scope | Current year only |

**Crontab entry:**
```
0 10 * * * /home/propackhub/app/scripts/oracle-sync-cron.sh >> /home/propackhub/logs/oracle-sync.log 2>&1
```

**What the cron script does:**
1. Kills any existing VPN
2. Starts `openfortivpn` with trusted cert + `--no-routes`
3. Waits for "Tunnel is up" (max 30s)
4. Adds routes (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) via `ppp0`
5. Tests Oracle port 1521 reachability
6. Runs `node simple-oracle-sync.js <current_year>`
7. Kills VPN on exit (trap cleanup)

**Check logs:**
```bash
tail -100 /home/propackhub/logs/oracle-sync.log
```

**Manual test:**
```bash
sudo /home/propackhub/app/scripts/oracle-sync-cron.sh
```

### VPS Setup Completed (Feb 10, 2026)

| Item | Status |
|------|--------|
| `openfortivpn` 1.17.0 installed | ✅ |
| Oracle Instant Client 21.16 at `/usr/lib/oracle/21/client64/lib` | ✅ |
| `ldconfig` configured for Oracle libs | ✅ |
| npm packages: `oracledb`, `pg-copy-streams`, `dotenv` | ✅ |
| VPN tunnel tested (IP 172.17.0.21 on ppp0) | ✅ |
| Oracle DNS resolves via VPN (10.1.2.99) | ✅ |
| Oracle port 1521 reachable through VPN | ✅ |
| VPN trusted cert hash configured | ✅ |
| Routes added after tunnel up | ✅ |
| Cron job set (2PM UAE daily) | ✅ |
| VPS `server/.env` updated with VPN + Oracle vars | ✅ |
| `NODE_ENV=production` on VPS | ✅ |
