# PPH-26.2 — Why the Dashboard Is Slow & How to Fix It

> **The complaint:** With 60,000+ rows in the database, every time the date period or rep group changes in the frontend, the whole screen reloads slowly. It feels like an Excel sheet with no pivot cache — every slicer move recalculates everything from scratch.

That is **exactly** what is happening. This document explains why, what to fix, and how to do it without breaking anything that already works.

---

## 1. The Root Problem

The main sales table is `fp_actualcommon` — it holds every transaction row for every customer, rep, product group, month, and year. Currently 60,000+ rows and growing.

The dashboard currently works like this:

```
User clicks "Q2" on the period slicer
  → Frontend fires loadDashboardData()
  → Backend runs 12 SQL queries simultaneously against all 60,000 rows
  → Each query does a full table scan
  → All results serialised to JSON
  → Frontend re-renders everything
```

Every slicer change = 12 full table scans = slow.

The correct mental model is an **Excel pivot table with a slicer**. In Excel, the pivot table pre-crunches the data once. When you move the slicer, Excel filters the pre-crunched result — it does not re-scan the raw worksheet. We need to do the same thing.

---

## 2. What Was Found in the Code (The 7 Problems)

### Problem 1 — No indexes on the columns that are always filtered

`fp_actualcommon` only has one index (on `admin_division_code`). Every other column used in every WHERE clause has no index:

| Column | Used in every query? | Index exists? |
|---|---|---|
| `admin_division_code` | Yes | ✅ Yes (but see Problem 2) |
| `year` | Yes | ❌ No |
| `month_no` | Yes | ❌ No |
| `sales_rep_group_name` | Yes | ❌ No |
| `customer_name` | Yes | ❌ No |
| `pgcombine` | Yes | ❌ No |

No index = PostgreSQL reads all 60,000 rows every single time to find matching ones.

---

### Problem 2 — The one index that exists is also never used

Every WHERE clause wraps column names in `UPPER(TRIM(...))`:

```sql
-- Current code
WHERE UPPER(TRIM(d.admin_division_code)) = 'FP'
  AND TRIM(UPPER(d.sales_rep_group_name)) = TRIM(UPPER('Sales Rep A'))
```

PostgreSQL **cannot use a B-tree index when a column is wrapped in a function**. The index on `admin_division_code` is effectively ignored. The database still reads all 60,000 rows.

---

### Problem 3 — 12 queries fire on every single dashboard load

In `server/routes/crm/dashboard.js`, every request runs this:

```js
const results = await Promise.all([
  pool.query(/* customer counts   — full table scan */),
  pool.query(/* YTD revenue       — full table scan */),
  pool.query(/* this month vs prev month — full table scan */),
  pool.query(/* trend this year   — full table scan */),
  pool.query(/* trend prev year   — full table scan */),
  pool.query(/* product mix       — full table scan */),
  pool.query(/* rep group rankings — full table scan */),
  pool.query(/* prospects count   */),
  pool.query(/* prev year YTD     — full table scan */),
  pool.query(/* top countries     — full table scan */),
  pool.query(/* top customers     — full table scan */),
  pool.query(/* budget target     */),
]);
```

That is **10 simultaneous full table scans** on every load. At 60k rows with no useful indexes, each takes 80–300ms. Total load time: 500ms–2s minimum. Under multiple concurrent users the Postgres connection pool saturates and queries queue behind each other.

---

### Problem 4 — SQL built with string interpolation (not parameterised)

```js
// Current — dangerous pattern
const periodWhere = `d.year = ${currentYear} AND d.month_no IN (${monthList})`;
const divFilter   = `UPPER(TRIM(d.admin_division_code)) = '${DIVISION}'`;
groupFilter = ` AND TRIM(UPPER(d.sales_rep_group_name)) = TRIM(UPPER('${safeAdminGroupName}'))`;
```

These template literals get injected directly into SQL strings. The `safeAdminGroupName` uses a manual single-quote escape (`replace("'", "''")`) which is fragile. All of these should use `$1`, `$2` parameterised queries.

---

### Problem 5 — No debounce on the date/year slicer

In `SalesCockpit.jsx`, both `setDateRange` and `setSelectedYear` are in the `useCallback` dependency array that triggers `loadDashboardData`:

```js
// Every time dateRange or selectedYear changes → fires 12 API calls immediately
}, [isAdmin, apiEndpoint, selectedSalesRep, dateRange, selectedYear, isLocked, showConversionRate]);

useEffect(() => {
  loadDashboardData(); // fires on every dependency change
}, [loadDashboardData]);
```

If a user clicks year 2023 → 2024 → 2025 quickly, **36 API calls** fire with no delay. There is an `AbortController` but it only cancels the axios call on the frontend — the backend has already started all 12 queries and keeps running them.

---

### Problem 6 — The cache does not work across multiple server workers

`crmCacheService.js` uses a JavaScript `Map` in memory with a 45-second TTL:

```js
const _dashCache = new Map();
const CACHE_TTL_MS = 45_000;
```

This means:
- **In a PM2 cluster with 4 workers**: each worker has its own separate cache. A load balancer bouncing requests across workers = the cache is effectively never hit
- **After every deploy**: all caches are wiped. The first user after deployment pays for all 12 queries cold
- **45 seconds is too short**: historical year data (2023, 2024) never changes. It could be cached for 30 minutes

---

### Problem 7 — Active customers list has no pagination

The `/dashboard/active-customers` endpoint returns every customer in the selected period with no LIMIT. For the "all reps" management view over a full year this is 400–800 customer rows. All are serialised to JSON and sent over the network every time the user clicks the KPI card.

The `/customers/map` endpoint defaults to `limit = 1000` with no server-side maximum cap.

---

## 3. What to Do — The Sales Cube Approach

The fix mirrors what Excel does internally: **pre-aggregate the raw data into a pivot cache, then let slicers filter the cache**.

In database terms this is a **Materialized View** — a table that stores the GROUP BY result and refreshes nightly when new data arrives.

### The Core Idea

```
fp_actualcommon (60,000 rows)
  → refresh nightly →
mv_fp_sales_cube (~3,000–6,000 rows, pre-aggregated)
  → dashboard queries hit the MV, not the raw table
  → slicer filters happen client-side in React, not via new API calls
```

---

## 4. How to Implement — Step by Step, Nothing Breaks

These steps are ordered so that each one is safe to deploy independently. No step requires a previous step to go live first (except where noted). The existing API behaviour does not change.

---

### Step 1 — Add Composite Indexes (Do Today, 30 minutes, zero risk)

This is purely additive. `CREATE INDEX CONCURRENTLY` never locks the table and does not change any existing behaviour. It just makes existing queries faster.

```sql
-- Run all three. CONCURRENTLY means no table lock — safe in production.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fpa_div_year_month
  ON fp_actualcommon (admin_division_code, year, month_no);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fpa_group_year_month
  ON fp_actualcommon (admin_division_code, sales_rep_group_id, year, month_no)
  WHERE sales_rep_group_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fpa_customer_year
  ON fp_actualcommon (admin_division_code, customer_name, year);
```

**Expected impact before anything else changes:** 60–80% reduction in query time on filtered queries. Existing dashboard code benefits immediately with zero code changes.

---

### Step 2 — Add Integer FK Column for Rep Group (Day 1–2, low risk)

This eliminates all the `UPPER(TRIM(sales_rep_group_name))` string comparisons. Add a new integer column that stores the rep group ID directly. The existing `sales_rep_group_name` string column stays and keeps working — this is purely additive.

```sql
-- New column (does not affect anything existing)
ALTER TABLE fp_actualcommon
  ADD COLUMN IF NOT EXISTS sales_rep_group_id INTEGER REFERENCES sales_rep_groups(id);

-- Backfill from existing name column
UPDATE fp_actualcommon a
SET sales_rep_group_id = sg.id
FROM sales_rep_groups sg
WHERE sg.division = 'FP'
  AND UPPER(TRIM(a.sales_rep_group_name)) = UPPER(TRIM(sg.group_name));

-- Auto-populate on future inserts
CREATE OR REPLACE FUNCTION sync_fpa_group_id() RETURNS trigger AS $$
BEGIN
  NEW.sales_rep_group_id := (
    SELECT id FROM sales_rep_groups
    WHERE UPPER(TRIM(group_name)) = UPPER(TRIM(NEW.sales_rep_group_name))
    LIMIT 1
  );
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fpa_group_id
  BEFORE INSERT OR UPDATE OF sales_rep_group_name
  ON fp_actualcommon FOR EACH ROW
  EXECUTE FUNCTION sync_fpa_group_id();
```

---

### Step 3 — Create the Sales Cube Materialized View (Day 2, zero risk)

This creates a new table-like object that pre-aggregates `fp_actualcommon`. The original table is untouched. Nothing that currently reads `fp_actualcommon` is changed.

```sql
-- server/migrations/320-sales-cube-mv.sql

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

-- Unique index for REFRESH CONCURRENTLY (non-blocking refresh)
CREATE UNIQUE INDEX idx_cube_pk
  ON mv_fp_sales_cube (division, year, month_no, sales_rep_group_id, customer_name, product_group);

-- Fast access patterns
CREATE INDEX idx_cube_div_year_month
  ON mv_fp_sales_cube (division, year, month_no);

CREATE INDEX idx_cube_group_year
  ON mv_fp_sales_cube (division, sales_rep_group_id, year, month_no);
```

**Expected MV size:** 60,000 rows collapses to approximately 3,000–6,000 rows. Dashboard queries go from scanning 60k rows to scanning ~200–800 MV rows. Query time: 80–300ms → 2–15ms.

---

### Step 4 — Schedule Nightly MV Refresh (Day 2)

The MV is a snapshot. It needs refreshing when new data is imported. `REFRESH CONCURRENTLY` keeps the MV readable during refresh — no downtime.

```sql
-- Requires pg_cron extension (available on most managed Postgres)
-- Refresh at 02:00 nightly
SELECT cron.schedule(
  'refresh-sales-cube',
  '0 2 * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_fp_sales_cube'
);
```

If `pg_cron` is not available, add this to `server/jobs/` and call it from the existing nightly data import process.

---

### Step 5 — Rewrite the Dashboard Endpoint (Day 3–4)

Replace the 12-query `Promise.all` with **two endpoints** that query `mv_fp_sales_cube`:

**Endpoint A** — `/dashboard/stats` — returns all KPI numbers in one query using `FILTER` clauses:

```js
// server/routes/crm/dashboard.js — new stats query
const { rows } = await pool.query(`
  SELECT
    -- Revenue KPIs
    SUM(c.revenue) FILTER (WHERE c.year = $3 AND c.month_no = ANY($4))    AS period_revenue,
    SUM(c.revenue) FILTER (WHERE c.year = $3-1 AND c.month_no = ANY($4))  AS prev_year_revenue,
    SUM(c.revenue) FILTER (WHERE c.year = $3 AND c.month_no = $5)         AS this_month_revenue,
    SUM(c.revenue) FILTER (WHERE c.year = $3 AND c.month_no = $6)         AS prev_month_revenue,
    -- Volume
    SUM(c.kgs)     FILTER (WHERE c.year = $3 AND c.month_no = ANY($4))    AS period_kgs,
    SUM(c.morm)    FILTER (WHERE c.year = $3 AND c.month_no = ANY($4))    AS period_morm,
    -- Customer counts
    COUNT(DISTINCT c.customer_name) FILTER (WHERE c.year=$3 AND c.month_no=ANY($4)) AS active_customers,
    COUNT(DISTINCT c.customer_name) FILTER (WHERE c.year=$3 AND c.month_no=$5)      AS month_customers
  FROM mv_fp_sales_cube c
  WHERE c.division = $1
    AND ($2::int IS NULL OR c.sales_rep_group_id = $2)
    AND c.year IN ($3, $3-1)
`,
  [division, groupId || null, year, monthNos, thisMonth, prevMonth]
);
```

**Endpoint B** — `/dashboard/rows` — returns pre-aggregated rows for the frontend to pivot into charts:

```js
// Returns one row per (month × product_group) — frontend builds charts from this
const { rows } = await pool.query(`
  SELECT c.year, c.month_no, c.product_group, c.customer_name,
         SUM(c.revenue) AS revenue, SUM(c.kgs) AS kgs
  FROM mv_fp_sales_cube c
  WHERE c.division = $1
    AND ($2::int IS NULL OR c.sales_rep_group_id = $2)
    AND c.year IN ($3, $3-1)
  GROUP BY c.year, c.month_no, c.product_group, c.customer_name
  ORDER BY c.year, c.month_no
`,
  [division, groupId || null, year]
);
```

**The existing API response shape stays the same.** The rewrite is internal to the route handler. Callers see no difference.

---

### Step 6 — Increase Cache TTL for Historical Data (Quick Win, 10 minutes)

In `server/services/crmCacheService.js`, add a longer TTL for prior years (data that never changes):

```js
// BEFORE
const CACHE_TTL_MS = 45_000; // same TTL for everything

// AFTER — tiered TTL
const isHistorical = currentYear < new Date().getFullYear();
const CACHE_TTL_MS = isHistorical
  ? 30 * 60 * 1000   // 30 minutes — historical data never changes
  : 5 * 60 * 1000;   // 5 minutes  — current year may have new imports
```

No other changes needed. This alone reduces repeat queries by ~30x for any user viewing a prior year.

---

### Step 7 — Debounce the Year Slicer (Day 4, frontend only)

Add a 400ms debounce so rapid year changes don't fire 36 API calls.

```js
// src/hooks/useDebouncedValue.js — new file
import { useState, useEffect } from 'react';
export function useDebounced(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
```

```js
// SalesCockpit.jsx — apply to year input
const [yearInput, setYearInput] = useState(currentYear);
const year = useDebounced(yearInput, 400); // only fetches after 400ms pause
// use `year` in the useEffect dependency array, not `yearInput`
```

---

### Step 8 — Install React Query and Cache Cube Rows Client-Side (Day 5–7)

This is the biggest frontend change. It replaces the `loadDashboardData()` + `useEffect` pattern with a proper data-fetching library that:
- Caches fetched data in memory for the session
- Shows previous data while loading new data (no blank screen on slicer change)
- Cancels stale requests automatically
- Lets period/product_group filtering happen client-side with zero API calls

```bash
npm install @tanstack/react-query
```

```js
// src/hooks/useSalesCube.js — new file
import { useQuery } from '@tanstack/react-query';

export function useSalesCube({ division, groupId, year }) {
  return useQuery({
    queryKey: ['salesCube', division, groupId, year],
    queryFn: () => api.get('/crm/dashboard/rows', { division, groupId, year }),
    staleTime: 5 * 60 * 1000,    // treat as fresh for 5 minutes
    placeholderData: prev => prev, // show previous year's data while loading new year
  });
}
```

```js
// SalesCockpit.jsx — refactored data flow
const { data: cubeRows, isLoading } = useSalesCube({ division: 'FP', groupId, year });

// Period slicer: pure JS — instant, no API call
const filteredRows = useMemo(() =>
  cubeRows?.filter(r => monthNos.includes(r.month_no) && r.year === year) ?? []
, [cubeRows, monthNos, year]);

// All KPIs derived from filteredRows — no extra API call
const kpis = useMemo(() => ({
  revenue:   filteredRows.reduce((s, r) => s + r.revenue, 0),
  kgs:       filteredRows.reduce((s, r) => s + r.kgs, 0),
  customers: new Set(filteredRows.map(r => r.customer_name)).size,
}), [filteredRows]);

// Trend chart: pivot by month
const trendData = useMemo(() =>
  periodMonthNos.map(m => ({
    label:   MONTH_SHORT[m],
    revenue: filteredRows.filter(r => r.month_no === m).reduce((s, r) => s + r.revenue, 0),
  }))
, [filteredRows, periodMonthNos]);

// Product mix: pivot by product group
const productMix = useMemo(() => {
  const byPg = {};
  filteredRows.forEach(r => { byPg[r.product_group] = (byPg[r.product_group] || 0) + r.revenue; });
  return Object.entries(byPg).sort(([,a],[,b]) => b-a).slice(0,8).map(([name,value]) => ({ name, value }));
}, [filteredRows]);
```

Changing Q1 → Q2 → YTD is now **instant**. No API call. No spinner. Just a `useMemo` recomputing from the already-fetched rows.

---

### Step 9 — Paginate the Customer List (Day 7, optional but recommended)

```js
// Backend — add LIMIT/OFFSET to active-customers
// dashboard.js
const { page = 0, limit = 50 } = req.query;
const safePage  = Math.max(0, parseInt(page));
const safeLimit = Math.min(200, Math.max(1, parseInt(limit)));
// Add to query: ORDER BY total_amount DESC LIMIT $n OFFSET $n
// Return: { customers: [...], hasMore: total > (safePage+1)*safeLimit }
```

```js
// Frontend — infinite scroll or "Load More" button
import { useInfiniteQuery } from '@tanstack/react-query';

const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['activeCustomers', groupId, year, period],
  queryFn: ({ pageParam = 0 }) =>
    api.get('/crm/dashboard/customers', { groupId, year, period, offset: pageParam, limit: 50 }),
  getNextPageParam: last => last.hasMore ? last.offset + 50 : undefined,
});
```

---

## 5. Summary — What Changes and What Does Not

### What stays exactly the same
- `fp_actualcommon` table — no rows deleted or modified
- All CRM routes that are not `dashboard.js` — customers, prospects, deals, tasks, activities
- All MES presales routes — completely separate tables, untouched
- The API URL structure — same endpoints, same response shape
- The UI layout of `SalesCockpit.jsx` — internal implementation changes, not the rendered output

### What changes
| What | Where | When |
|---|---|---|
| 3 composite indexes added | `fp_actualcommon` | Step 1 — today |
| `sales_rep_group_id` integer column added | `fp_actualcommon` | Step 2 — Day 1 |
| `mv_fp_sales_cube` materialized view created | New DB object | Step 3 — Day 2 |
| Nightly refresh scheduled | DB cron or Node job | Step 4 — Day 2 |
| `dashboard.js` endpoint rewrites | `server/routes/crm/dashboard.js` | Step 5 — Day 3 |
| Cache TTL tiered by year | `crmCacheService.js` | Step 6 — 10 min |
| Debounce on year slicer | `SalesCockpit.jsx` | Step 7 — Day 4 |
| React Query + `useSalesCube` hook | Frontend | Step 8 — Day 5 |
| Customer list pagination | `dashboard.js` + `SalesCockpit.jsx` | Step 9 — Day 7 |

### Expected result after all steps
| Action | Current | After |
|---|---|---|
| Dashboard cold load | 500ms – 2s | 20–80ms |
| Change period (Q1 → Q2) | 12 API calls, 500ms+ | 0 API calls, instant |
| Change year | 12 API calls immediately | 1 fetch, debounced 400ms, previous data shows while loading |
| Change rep group | 12 API calls | 1 fetch, previous data shows while loading |
| Second user same period | 45s cache (if same worker) | Redis hit — 0 DB queries |
| After server restart | Cache wiped, cold start | Redis survives restart |

---

## 6. Deployment Order (Safe Sequence)

```
Day 1 morning  → Step 1: indexes (CONCURRENTLY — no downtime, deploy any time)
Day 1 afternoon → Step 6: cache TTL tweak (1-line change, safe)
Day 2           → Step 2: sales_rep_group_id column + backfill
Day 2           → Step 3: create mv_fp_sales_cube
Day 2           → Step 4: schedule nightly refresh
Day 3–4         → Step 5: rewrite dashboard.js (test in staging first)
Day 4           → Step 7: debounce year slicer
Day 5–7         → Step 8: React Query + useSalesCube refactor
Day 7           → Step 9: customer list pagination
```

Steps 1, 6, and 7 can go to production immediately with no risk. Each subsequent step can be tested in staging and deployed independently. None of them require downtime.

---

## 7. Additional Engineering Recommendations

These are enhancements on top of the core plan. None of them are required to ship the performance fix, but all are strongly recommended as the dataset and number of users grow.

---

### 7.1 Use IDs Instead of Text in the Materialized View

The MV as written in Step 3 still groups by `customer_name` and `product_group` as text columns. Text GROUP BY is slower and uses more memory than integer GROUP BY.

The better version once the data model is ready:

```sql
-- When customer_id and product_group_id exist as proper FK columns:
GROUP BY
    admin_division_code, sales_rep_group_id, customer_id,
    product_group_id, year, month_no
```

Then join display names only at query time:

```sql
JOIN fp_customer_unified c ON cube.customer_id = c.customer_id
JOIN fp_product_group_master pg ON cube.product_group_id = pg.id
```

This makes indexes smaller, comparisons faster, and eliminates any inconsistency from name spelling differences in the raw data. `sales_rep_group_id` (Step 2 of the main plan) already applies this principle — extend it to customers and product groups when those FK columns are available.

---

### 7.2 Add Covering Indexes to the Sales Cube

A covering index includes the actual data columns (`revenue`, `kgs`, `morm`) alongside the filter columns. PostgreSQL can then answer KPI queries entirely from the index without touching the MV table rows — called an **index-only scan**.

```sql
CREATE INDEX idx_cube_fast_kpis
  ON mv_fp_sales_cube (division, year, month_no, sales_rep_group_id)
  INCLUDE (revenue, kgs, morm);
```

Add this immediately after creating `mv_fp_sales_cube` in Step 3. It reduces disk I/O on the KPI aggregation query from Endpoint A.

---

### 7.3 Normalize Text Fields at Import Time

The reason all the `UPPER(TRIM(...))` wrappers exist is that the raw data arrives with inconsistent casing and spacing. The fix in the main plan (Step 2) adds integer IDs to avoid this. For columns that remain as text, the normalization should happen once on the way **in** — not on every query.

During the data import process that populates `fp_actualcommon`, apply:

```sql
-- At insert time, not at query time
customer_name = UPPER(TRIM(raw_customer_name)),
sales_rep_group_name = UPPER(TRIM(raw_group_name))
```

Once the stored values are already normalised, every WHERE clause simplifies from:

```sql
WHERE UPPER(TRIM(d.customer_name)) = UPPER(TRIM($1))  -- index-defeating
```

to:

```sql
WHERE d.customer_name = $1  -- index-compatible
```

This is how the covering index in 7.2 becomes fully effective.

---

### 7.4 Verify Index Usage with EXPLAIN ANALYZE Before and After

Before deploying Step 5 (dashboard.js rewrite) to production, run this on the new queries in a staging environment:

```sql
EXPLAIN ANALYZE
SELECT SUM(revenue) FILTER (WHERE year = 2025 AND month_no = ANY(ARRAY[1,2,3]))
FROM mv_fp_sales_cube
WHERE division = 'FP' AND sales_rep_group_id = 3;
```

**Good — index is being used:**
```
Index Only Scan using idx_cube_fast_kpis on mv_fp_sales_cube
```

**Bad — index is not being used:**
```
Seq Scan on mv_fp_sales_cube
```

If you see `Seq Scan`, something in the query is defeating the index (usually a function wrapper or a type mismatch on the parameter). Fix it before deploying. Takes 5 minutes and prevents shipping a regression.

---

### 7.5 Hard Cap on the Map Endpoint

The `/customers/map` endpoint currently defaults to `limit = 1000` with no maximum. A frontend bug or accidental call with `limit=99999` would succeed. Add a server-side hard cap:

```js
// server/routes/crm/customers.js — map view handler
const safeLimit = Math.min(500, Math.max(1, parseInt(limit) || 100));
```

Also apply the same pattern everywhere a `limit` query param is accepted:

```js
// General utility — add to server/utils/pagination.js
function safeLimit(val, defaultVal = 50, maxVal = 200) {
  return Math.min(maxVal, Math.max(1, parseInt(val) || defaultVal));
}
```

---

### 7.6 Monitor Materialized View Refresh Time

After deploying, log how long the nightly refresh takes. At 60k source rows it should be 1–3 seconds. If it starts creeping up, that is an early signal that the base table needs a composite index or the MV definition needs tuning.

Add this to the refresh job:

```js
// server/jobs/refreshSalesCube.js
const start = Date.now();
await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_fp_sales_cube');
const ms = Date.now() - start;
logger.info(`Sales cube refresh completed in ${ms}ms`);
if (ms > 10_000) {
  logger.warn('Sales cube refresh exceeded 10s — review base table indexes');
}
```

If refresh time ever exceeds 30 seconds consistently, the next step is partitioning `fp_actualcommon` by year. That becomes relevant around 1–2 million rows, not at 60k.

---

### 7.7 Load Test After Deployment

Before calling the performance work done, verify it holds under real concurrent load. A simple scenario with [k6](https://k6.io) (free, runs on the VPS):

```js
// k6-dashboard-test.js
import http from 'k6/http';
export const options = { vus: 10, duration: '30s' };
export default function () {
  // Simulate 10 users hitting the dashboard simultaneously
  // with different period and year combinations
  const periods = ['ytd', 'q1', 'q2', 'q3', 'q4'];
  const years   = [2023, 2024, 2025];
  const period  = periods[Math.floor(Math.random() * periods.length)];
  const year    = years[Math.floor(Math.random() * years.length)];
  http.get(`http://localhost:3001/api/crm/dashboard/stats?division=FP&year=${year}&period=${period}`,
    { headers: { Authorization: `Bearer ${__ENV.TEST_TOKEN}` } }
  );
}
```

**Expected results after all steps:**
- Cold load (cache miss): 20–80ms
- Warm load (cache hit): < 5ms
- Period slicer change: 0ms (client-side)
- 10 concurrent users: no queuing, no timeout

If cold load is still above 200ms, run `EXPLAIN ANALYZE` on the new query and check the index is being hit (7.4).

---

### 7.8 If You Need Results Fast Before the Full Plan

If there is pressure to show improvement before Steps 3–8 are built, just Steps 1 and 7.3 together can deliver 60–80% improvement with almost no work:

1. **Step 1** — add the three composite indexes (30 minutes, no downtime)
2. **7.3** — normalise `customer_name` and `sales_rep_group_name` at import time so `UPPER(TRIM())` wrappers can be removed from queries

These two changes alone let PostgreSQL use the indexes that Step 1 creates. The full materialized view and React Query work can then follow at a normal pace without the dashboard being painful in the meantime.

---

## Architecture Summary

The full design follows the standard analytics dashboard pattern:

```
fp_actualcommon (raw OLTP table, 60k+ rows)
        ↓ nightly REFRESH
mv_fp_sales_cube (pre-aggregated cube, ~4k rows)
        ↓ single parameterised query
/dashboard/rows API (returns 200–800 rows as JSON)
        ↓ React Query (cached 5 min, stale-while-revalidate)
SalesCockpit.jsx (useMemo pivot — instant slicer response)
```

This design stays fast as the dataset grows well beyond the current 60k rows. The MV absorbs all the aggregation cost; the dashboard only ever touches pre-computed numbers.

---

*PPH-26.2 | March 2026*
