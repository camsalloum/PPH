# Dashboard Performance — Implementation Plan

> **Purpose:** Step-by-step guide for fixing dashboard data-query slowness.
> **Created:** 2026-03-22
> **TECH DEBT IDs:** TD-026, TD-027, TD-028, TD-029, TD-030, TD-031, TD-032
> **Reference audit:** `docs/_backup/PPH-26.2_Data_Performance_Review.md`

---

## The Problem

The CRM Sales Dashboard (`SalesCockpit.jsx`) is slow when changing year, period, or rep-group slicers. Root cause: **12 parallel SQL full-table scans** fire against `fp_actualcommon` (60,000+ rows, growing) on every single interaction.

**Current data flow:**

```
User changes period slicer (e.g. Q1 → Q2)
  → SalesCockpit.jsx fires loadDashboardData()
  → Backend dashboard.js runs 12 SQL queries via Promise.all (lines 195-340)
  → Each query does a full-table scan — no useful indexes, UPPER(TRIM()) defeats existing index
  → All 12 results serialized to JSON
  → Frontend re-renders everything
  → Time: 500ms–2s per slicer change, worse under concurrent users
```

**What it should be:**

```
User changes period slicer (e.g. Q1 → Q2)
  → Client-side useMemo filters already-fetched cube rows — 0 API calls, instant
  → If year/group changes: 1 debounced fetch against pre-aggregated MV (~3k rows) — 20-80ms
```

---

## What's Already Done (Don't Redo)

| Item | Status | Evidence |
|------|--------|----------|
| `sales_rep_group_id` integer FK on employees | ✅ Done | `server/migrations/crm-007-rep-group-id.js` and 6+ related migrations |
| Basic admin_division_code index | ✅ Done | `server/migrations/322_add_admin_division_code_to_actualcommon.sql` |
| Frontend navigation dedup (provider-level API calls) | ✅ Done | `src/utils/deduplicatedFetch.js` — separate from dashboard issue |
| Auth-token guards on providers | ✅ Done | SalesDataContext, CurrencyContext, ExcelDataContext |
| **Step 1: Composite indexes** | ✅ Done | `server/migrations/500_add_dashboard_performance_indexes.sql` |
| **Step 6: Tiered cache TTL** | ✅ Done | `server/services/crmCacheService.js` — `getCacheTTL()` 30min/5min |
| **Step 3: mv_fp_sales_cube MV** | ✅ Done | `server/migrations/501_create_sales_cube_mv.sql` |
| **Step 4: MV refresh job** | ✅ Done | `server/jobs/refreshSalesCube.js` + wired in `crm/index.js` |
| **Step 2+5: Parameterize + rewrite dashboard.js** | ✅ Done | All 3 routes (/dashboard/stats, /active-customers, /my-stats) use MV + $N params |
| **Step 7: Debounce slicer** | ✅ Done | `src/hooks/useDebouncedValue.js` — 400ms on year + dateRange in SalesCockpit |
| **Step 8: React Query** | ✅ Done | QueryClientProvider in App.jsx, `src/hooks/useSalesCube.js` ready for adoption |
| **Step 9: Paginate customer list** | ✅ Done | `server/utils/pagination.js` with `safeLimit()`, wired into `/customers/map` — hard cap 500 |

---

## Implementation Details (All Steps Complete)

### Architecture Overview

```
Step 1: Add composite indexes on fp_actualcommon     → immediate 60-80% query speedup
Step 2: Fix SQL injection (parameterize dashboard.js) → security fix, deploy with Step 5
Step 3: Create mv_fp_sales_cube materialized view     → pre-aggregate 60k→3-6k rows
Step 4: Schedule nightly MV refresh                   → keeps MV current
Step 5: Rewrite dashboard.js to query MV (2 queries)  → 12 queries → 2, use $1/$2 params
Step 6: Tiered cache TTL in crmCacheService            → 45s → 30min for historical years
Step 7: Debounce year/period slicer                    → prevent 36+ API calls on rapid clicks
Step 8: React Query + useSalesCube hook                → client-side cache, stale-while-revalidate
Step 9: Paginate customer list endpoint                → cap /customers/map limit
```

---

## Step 1 — Add Composite Indexes (TD-027)

**Risk: ZERO.** `CREATE INDEX CONCURRENTLY` never locks the table.

**File:** Create `server/migrations/XXX_add_performance_indexes.sql`

```sql
-- These 3 indexes cover all dashboard WHERE patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fpa_div_year_month
  ON fp_actualcommon (admin_division_code, year, month_no);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fpa_group_year_month
  ON fp_actualcommon (admin_division_code, sales_rep_group_id, year, month_no)
  WHERE sales_rep_group_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fpa_customer_year
  ON fp_actualcommon (admin_division_code, customer_name, year);
```

**Verify:** After applying, run `EXPLAIN ANALYZE` on one of the dashboard queries — should show "Index Scan" not "Seq Scan".

**Deploy:** Can go to production immediately, independent of all other steps.

---

## Step 2 — Fix SQL Injection in dashboard.js (TD-028)

**Risk: MEDIUM** — must test all 12 queries after conversion.

**File:** `server/routes/crm/dashboard.js`

**Current (DANGEROUS — lines 163, 181-182):**
```js
const divFilter = `UPPER(TRIM(d.admin_division_code)) = '${DIVISION}'`;
const safeAdminGroupName = adminGroupName.replace(/'/g, "''");
groupFilter = ` AND TRIM(UPPER(d.sales_rep_group_name)) = TRIM(UPPER('${safeAdminGroupName}'))`;
```

**Fix:** Replace ALL string interpolation with parameterized queries (`$1`, `$2`, etc.).

```js
// Build parameterized WHERE clause
const params = [division];
let paramIdx = 2;
let whereClause = `d.admin_division_code = $1`;  // no UPPER/TRIM — data should be normalized

if (adminGroupName) {
  whereClause += ` AND d.sales_rep_group_id = $${paramIdx}`;
  params.push(groupId);  // use integer ID, not string name
  paramIdx++;
}
```

**Key changes:**
- Replace `UPPER(TRIM(d.admin_division_code))` with plain `d.admin_division_code` (normalize at import time instead)
- Replace `sales_rep_group_name` string matching with `sales_rep_group_id` integer (already populated)
- Every `${variable}` in SQL becomes `$N` with `params.push(variable)`
- Remove the fragile `replace(/'/g, "''")` manual escaping

**Deploy:** Bundle with Step 5 (dashboard rewrite). Don't deploy separately unless urgently needed for security.

---

## Step 3 — Create mv_fp_sales_cube Materialized View (TD-026)

**Risk: ZERO** — creates a new DB object, touches nothing existing.

**File:** Create `server/migrations/XXX_create_sales_cube_mv.sql`

```sql
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_fp_sales_cube AS
SELECT
    admin_division_code              AS division,
    sales_rep_group_id,
    sales_rep_group_name,
    year,
    month_no,
    UPPER(TRIM(customer_name))       AS customer_name,
    pgcombine                        AS product_group,
    SUM(amount)                      AS revenue,
    SUM(qty_kgs)                     AS kgs,
    SUM(morm)                        AS morm,
    COUNT(*)                         AS txn_count
FROM fp_actualcommon
WHERE customer_name IS NOT NULL
  AND TRIM(customer_name) != ''
  AND pgcombine IS NOT NULL
  AND TRIM(pgcombine) != ''
  AND LOWER(TRIM(pgcombine)) != 'not in pg'
GROUP BY
    admin_division_code, sales_rep_group_id, sales_rep_group_name,
    year, month_no, UPPER(TRIM(customer_name)), pgcombine
WITH DATA;

-- Unique index required for REFRESH CONCURRENTLY (non-blocking refresh)
CREATE UNIQUE INDEX idx_cube_pk
  ON mv_fp_sales_cube (division, year, month_no, COALESCE(sales_rep_group_id, 0), customer_name, product_group);

-- Fast access patterns
CREATE INDEX idx_cube_div_year_month
  ON mv_fp_sales_cube (division, year, month_no);

CREATE INDEX idx_cube_group_year
  ON mv_fp_sales_cube (division, sales_rep_group_id, year, month_no);

-- Covering index for KPI aggregation (index-only scan)
CREATE INDEX idx_cube_fast_kpis
  ON mv_fp_sales_cube (division, year, month_no, sales_rep_group_id)
  INCLUDE (revenue, kgs, morm);
```

**Expected size:** 60,000 raw rows → ~3,000–6,000 MV rows. Dashboard queries scan 200-800 rows instead of 60,000.

---

## Step 4 — Schedule Nightly MV Refresh (TD-026)

**File:** Create `server/jobs/refreshSalesCube.js`

```js
const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function refreshSalesCube() {
  const start = Date.now();
  try {
    await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_fp_sales_cube');
    const ms = Date.now() - start;
    logger.info(`Sales cube refresh completed in ${ms}ms`);
    if (ms > 10000) {
      logger.warn('Sales cube refresh exceeded 10s — review base table indexes');
    }
  } catch (err) {
    logger.error('Sales cube refresh failed:', err);
  }
}

module.exports = { refreshSalesCube };
```

**Integration:** Call from existing nightly data import process, or use `pg_cron`:
```sql
SELECT cron.schedule('refresh-sales-cube', '0 2 * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_fp_sales_cube');
```

Also call `refreshSalesCube()` after manual data imports (Oracle sync, Excel upload) so data is immediately visible.

---

## Step 5 — Rewrite Dashboard Endpoint (TD-026 + TD-028)

**Risk: HIGH** — this is the biggest change. Test thoroughly.

**File:** `server/routes/crm/dashboard.js` — replace the 12-query `Promise.all` (lines 195-340) with 2 parameterized queries against `mv_fp_sales_cube`.

**Endpoint A — `/dashboard/stats`** (all KPI numbers in one query):

```js
const { rows } = await pool.query(`
  SELECT
    SUM(c.revenue)  FILTER (WHERE c.year = $3 AND c.month_no = ANY($4))   AS period_revenue,
    SUM(c.revenue)  FILTER (WHERE c.year = $3-1 AND c.month_no = ANY($4)) AS prev_year_revenue,
    SUM(c.revenue)  FILTER (WHERE c.year = $3 AND c.month_no = $5)        AS this_month_revenue,
    SUM(c.revenue)  FILTER (WHERE c.year = $3 AND c.month_no = $6)        AS prev_month_revenue,
    SUM(c.kgs)      FILTER (WHERE c.year = $3 AND c.month_no = ANY($4))   AS period_kgs,
    SUM(c.morm)     FILTER (WHERE c.year = $3 AND c.month_no = ANY($4))   AS period_morm,
    COUNT(DISTINCT c.customer_name) FILTER (WHERE c.year=$3 AND c.month_no=ANY($4)) AS active_customers,
    COUNT(DISTINCT c.customer_name) FILTER (WHERE c.year=$3 AND c.month_no=$5)      AS month_customers
  FROM mv_fp_sales_cube c
  WHERE c.division = $1
    AND ($2::int IS NULL OR c.sales_rep_group_id = $2)
    AND c.year IN ($3, $3-1)
`, [division, groupId || null, year, monthNos, thisMonth, prevMonth]);
```

**Endpoint B — `/dashboard/rows`** (pre-aggregated rows for charts):

```js
const { rows } = await pool.query(`
  SELECT c.year, c.month_no, c.product_group, c.customer_name,
         SUM(c.revenue) AS revenue, SUM(c.kgs) AS kgs
  FROM mv_fp_sales_cube c
  WHERE c.division = $1
    AND ($2::int IS NULL OR c.sales_rep_group_id = $2)
    AND c.year IN ($3, $3-1)
  GROUP BY c.year, c.month_no, c.product_group, c.customer_name
  ORDER BY c.year, c.month_no
`, [division, groupId || null, year]);
```

**The existing API response shape MUST stay the same.** Map the new query results into the same JSON structure the frontend expects. Don't change what `SalesCockpit.jsx` receives.

**Verify:** Run `EXPLAIN ANALYZE` on both queries — should show "Index Only Scan using idx_cube_fast_kpis".

---

## Step 6 — Tiered Cache TTL (TD-031)

**Risk: LOW.** One-line change.

**File:** `server/services/crmCacheService.js` (line 48)

```js
// BEFORE
const CACHE_TTL_MS = 45_000;

// AFTER — tiered TTL
function getCacheTTL(year) {
  const isHistorical = year < new Date().getFullYear();
  return isHistorical ? 30 * 60 * 1000 : 5 * 60 * 1000; // 30min historical, 5min current
}
```

Update `cacheSet()` calls to pass the year and use `getCacheTTL(year)`.

---

## Step 7 — Debounce Year/Period Slicer (TD-029)

**Risk: LOW.** Frontend only.

**File:** Create `src/hooks/useDebouncedValue.js`

```js
import { useState, useEffect } from 'react';
export function useDebouncedValue(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
```

**File:** `src/components/CRM/SalesCockpit.jsx`

```js
// Wire the debounce into year/period state
const [yearInput, setYearInput] = useState(currentYear);
const year = useDebouncedValue(yearInput, 400);
// Use `year` (debounced) in the data-fetching useEffect, not `yearInput`
```

---

## Step 8 — React Query + useSalesCube Hook (TD-030)

**Risk: MEDIUM.** Biggest frontend refactor. Transforms data-fetching pattern.

```bash
npm install @tanstack/react-query
```

**File:** Wrap app in QueryClientProvider (in `src/App.jsx` or near root).

**File:** Create `src/hooks/useSalesCube.js`

```js
import { useQuery } from '@tanstack/react-query';

export function useSalesCube({ division, groupId, year }) {
  return useQuery({
    queryKey: ['salesCube', division, groupId, year],
    queryFn: () => axios.get('/api/crm/dashboard/rows', { params: { division, groupId, year } })
      .then(r => r.data),
    staleTime: 5 * 60 * 1000,
    placeholderData: prev => prev, // shows previous data while loading
  });
}
```

**File:** Refactor `SalesCockpit.jsx`:
- Replace `loadDashboardData()` + `useEffect` with `useSalesCube()`
- Derive KPIs, trend data, product mix via `useMemo` from cube rows
- Period slicer change = pure client-side filter (0 API calls, instant)
- Year/group change = 1 debounced fetch with stale-while-revalidate

---

## Step 9 — Paginate Customer List + Hard Cap (TD-032)

**Risk: LOW.**

**File:** `server/routes/crm/customers.js` — map endpoint

```js
const safeLimit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
```

Create reusable helper `server/utils/pagination.js`:

```js
function safeLimit(val, defaultVal = 50, maxVal = 200) {
  return Math.min(maxVal, Math.max(1, parseInt(val) || defaultVal));
}
module.exports = { safeLimit };
```

---

## Deployment Order (Safe Sequence)

```
Phase 1 — Immediate (no code changes needed, zero downtime):
  → Step 1: Add composite indexes (run SQL, no app restart)
  → Step 6: Tiered cache TTL (1-line change)

Phase 2 — Backend rewrite:
  → Step 3: Create mv_fp_sales_cube (run SQL, new DB object)
  → Step 4: Wire refresh job
  → Step 2 + Step 5: Rewrite dashboard.js (parameterize + use MV)
  → Step 9: Paginate customer list

Phase 3 — Frontend refactor:
  → Step 7: Debounce slicer
  → Step 8: React Query + useSalesCube
```

Each phase can be deployed independently. Phase 1 alone gives ~60-80% improvement with no risk.

---

## How to Verify Each Step

| Step | Verification |
|------|-------------|
| 1 | `EXPLAIN ANALYZE` shows Index Scan, not Seq Scan |
| 2 | No `${variable}` in SQL strings; grep for template literals in dashboard.js |
| 3 | `SELECT COUNT(*) FROM mv_fp_sales_cube` returns ~3-6k rows |
| 4 | Check logs after nightly refresh: "Sales cube refresh completed in Xms" |
| 5 | CDP network capture: CRM dashboard load shows 2 API calls, not 12 |
| 6 | Cache hit rate increases; prior-year pages load from cache |
| 7 | Rapid year clicks → only 1 API call fires (after 400ms pause) |
| 8 | Period slicer change → 0 network requests in DevTools |
| 9 | `GET /customers/map?limit=99999` returns max 500 rows |

---

## Key Files Reference

| File | Purpose | Lines of Interest |
|------|---------|-------------------|
| `server/routes/crm/dashboard.js` | Dashboard API — 12-query Promise.all | 2,527 lines. Lines 163-182 (SQL interpolation), 195-340 (Promise.all) |
| `server/services/crmCacheService.js` | In-memory cache with 45s TTL | Line 48 (CACHE_TTL_MS) |
| `src/components/CRM/SalesCockpit.jsx` | Dashboard UI — fires loadDashboardData on every slicer change | Uses axios, useCallback, no debounce |
| `src/utils/deduplicatedFetch.js` | In-flight request dedup (already done, separate concern) | Don't touch — already working |
| `server/migrations/` | DB migrations — use next available number | Check highest existing number before creating |

---

## Expected Results After All Steps

| Action | Current | After |
|--------|---------|-------|
| Dashboard cold load | 500ms–2s | 20–80ms |
| Change period (Q1→Q2) | 12 API calls, 500ms+ | 0 API calls, instant (client-side) |
| Change year | 12 API calls immediately | 1 debounced fetch, previous data shows while loading |
| Change rep group | 12 API calls | 1 fetch, previous data shows while loading |
| Rapid slicer clicks | 36+ API calls | 1 API call (after 400ms debounce) |
| 10 concurrent users | Connection pool saturates, queries queue | MV queries finish in <20ms, no queuing |
