# CRM Module — Architecture & Data Flow Reference

**Last Updated:** February 21, 2026  
**Status:** Production — All dashboards live, data flowing correctly

---

## 1. Concept Overview

The CRM module is a **role-based sales intelligence system** that presents the same underlying sales data differently based on who is logged in:

| Role | Component | View | API Endpoint |
|------|-----------|------|--------------|
| Admin / Sales Manager / Sales Coordinator | `AdminCRMDashboard` | **Global** — all groups, all reps, all customers | `/api/crm/dashboard/stats` |
| Sales Rep | `CRMDashboard` | **Personal** — only own group's data | `/api/crm/my-stats` |

Both dashboards share the same visual design ("Sales Cockpit") and the same UI sections. The difference is **scope** (global vs personal) and **controls** (group selector vs locked to own group).

### Role Detection
```
Frontend: CRMModule.jsx
  → isManagement(user) = role is 'admin', OR (manager-role AND designation_level >= 6)
  → isAdminOrManagement ? <AdminCRMDashboard /> : <CRMDashboard />

Backend: server/routes/crm/index.js + field-trips.js
  → hasFullAccess(user): admin always passes; manager/sales_manager/sales_coordinator
    require designation_level >= 6 (enforced via JWT claim)
  → /my-stats resolves rep identity from JWT → auth DB → sales_rep_groups
```

> **Access rule (March 2026 fix):** Having a manager-role title does NOT grant full access alone.
> The user's `designation_level` must be ≥ 6. Level 5 users with manager-sounding roles see only their own data.

---

## 2. Dashboard Sections (Both Views)

Both admin and sales rep dashboards display these sections:

### 2.1 Controls Bar
- **Fire icon** + "Sales Cockpit" title
- **Period selector**: `YTD` / `1M` / `Q1` / `Q2` / `Q3` / `Q4` / `FY`  
  Each period compares **this year vs last year same months** (e.g. YTD Jan–Feb 2026 vs Jan–Feb 2025)
- **Group filter** (admin only): "All Groups" or specific rep group
- **Refresh button**

### 2.2 AI Insight Bar
Auto-generated summary from live data:
- YoY performance (e.g., "38% behind last year — needs attention")
- Active customer count + country count
- New orders this month (admin) or open prospects count (rep)

### 2.3 Hero KPI Row

#### Admin Dashboard (`AdminCRMDashboard.jsx`) — always 4 cards

| Card | Label | Value | Sub-text |
|------|-------|-------|----------|
| 1 | `{period} Revenue` | YTD/period revenue | MT sold · progress bar vs last year |
| 2 | `MoRM ({period})` | `xx.xx%` margin over raw material | AED morm amount · Last yr: xx.xx% |
| 3 | `Active Customers ({period})` | Count with orders in period | N this month · N all-time · N countries |
| 4 | depends on admin view | Avg Revenue/Customer or Prospects | contextual |

> **MoRM visibility rule:** Card 2 (MoRM) is only rendered for users with `designation_level >= 6` (Divisional Manager, GM, CEO). Users at level 5 and below do **not** see the MoRM card — the admin row renders 3 cards only for those users.

#### Sales Rep Dashboard (`CRMDashboard.jsx`) — 4 or 5 cards depending on level

| Card | Label | Value | Badge | Sub-text |
|------|-------|-------|-------|----------|
| 1 | `{period} Revenue` | Period revenue | YoY % | Progress bar vs last year same period |
| 2 | `Volume Sold ({period})` | MT (kgs ÷ 1000) | YoY % | Progress bar vs last year same period |
| 3 *(level 6+ only)* | `MoRM ({period})` | `xx.xx%` | ±pp vs last yr | AED morm · Last yr: xx.xx% |
| 4 | `Active Customers ({period})` | Count with orders | YoY % | Last yr same period: N · View all → |
| 5 | `Avg Revenue / Customer ({period})` | Revenue ÷ active customers | — | N open prospects · View pipeline → |

### 2.4 Charts Row
- **Sales Trend** (area/bar chart): Revenue over selected period with previous year overlay
- **Product Mix** (donut chart): YTD revenue by product group (pgcombine), top 8

### 2.5 Bottom Row
- **Top Customers** table: Name, country, sales amount (top 8 by period)
- **Activity Feed**: Recent prospect/customer events
- **Top Countries**: Customer count by country (top 5)
- **Rep Groups** (admin only, when "All Groups" selected): Ranked progress bars

---

## 3. Complete Data Flow

### 3.1 Admin Dashboard (`/api/crm/dashboard/stats`)

```
Browser (AdminCRMDashboard.jsx)
  → GET /api/crm/dashboard/stats?date_range=1y&group_id=all
  → JWT auth check (must be admin/sales_manager/sales_coordinator)
  → Server-side cache check (45-second TTL, keyed by group_id + date_range)
  → If cache miss: 12 parallel SQL queries via Promise.all against fp_database
  → Response JSON → frontend maps to KPIs, charts, tables
```

**The 12 Parallel Queries:**

| # | Query | Source Table | What it returns |
|---|-------|-------------|-----------------|
| Q1 | Customer counts | fp_actualcommon | total_customers, ytd_customers, month_customers, countries |
| Q2 | YTD revenue | fp_actualcommon + PG exclusion | revenue, kgs |
| Q3 | This month | fp_actualcommon + PG exclusion | revenue, order_count |
| Q4 | Previous month | fp_actualcommon + PG exclusion | revenue |
| Q5a | Sales trend | fp_actualcommon + PG exclusion | year, month, label, revenue, kgs (12 rows for 1Y) |
| Q5b | Prev year trend | fp_actualcommon + PG exclusion | year, month, target_year, revenue |
| Q6 | Product mix | fp_actualcommon + PG exclusion | pgcombine name, value (top 8) |
| Q7 | Top rep groups | fp_actualcommon + PG exclusion | group_name, total_amount, customer_count (top 8) |
| Q8 | Prospects stats | fp_prospects | total, pending, approved, from_inquiry |
| Q9 | Prev year YTD | fp_actualcommon + PG exclusion | revenue (for YoY comparison) |
| Q10 | Top countries | fp_actualcommon | country name, customer count (top 5) |
| Q11 | Recent customers | fp_actualcommon + fp_customer_unified | CTE: top 8 by amount, LEFT JOIN for customer_id |

**All queries use:**
- `admin_division_code = 'FP'` filter
- PG exclusion: LEFT JOIN to `fp_product_group_exclusions` + filter out null/empty/`not in pg`
- Optional group filter: `sales_rep_group_name = '<resolved name>'`
- `month_no` integer column (not TO_DATE conversion) for fast period arithmetic
- Pre-computed `maxPeriod` for trend cutoff (single subquery, not per-query)

### 3.2 Sales Rep Dashboard (`/api/crm/my-stats`)

```
Browser (CRMDashboard.jsx)
  → GET /api/crm/my-stats?date_range=ytd
  → JWT auth check (any authenticated user)
  → Resolve user → crm_sales_reps (ip_auth_database) → get full_name
  → Resolve group → sales_rep_groups (fp_database) → get group_name
  → Server-side cache check (45s TTL, keyed by user_id + date_range)
  → If cache miss: 8 parallel SQL queries via Promise.all
  → All queries auto-filtered to rep's group_name
  → Response JSON → frontend maps to KPIs, charts, tables
```

**`/my-stats` response — `revenue` object fields:**

| Field | Description |
|-------|-------------|
| `ytd` | Period revenue |
| `kgs_ytd` | Period volume in KG |
| `prev_year_kgs` | Same period last year volume in KG |
| `this_month` | Current calendar month revenue |
| `prev_month` | Previous calendar month revenue |
| `prev_year_ytd` | Same period last year revenue |
| `prev_year_customers` | Same period last year active customer count |
| `month_growth_pct` | MoM % (this_month vs prev_month) |
| `yoy_growth_pct` | YoY % (period revenue vs prev_year_ytd) |
| `active_customers` | Distinct customers with orders in selected period |
| `morm` | Sum of morm column for selected period (AED) |
| `morm_pct` | morm ÷ revenue × 100 (2 decimal places) |
| `prev_year_morm_pct` | morm_pct for same period last year |
- `GET /api/crm/my-customers` → rep's customer list from `fp_customer_unified`
- `GET /api/crm/recent-activities` → shared activity feed

### 3.3 Data Pipeline (How data gets into the tables)

```
Oracle ERP (HAP111.XL_FPSALESVSCOST_FULL)
  ↓ OracleERPSyncService (VPN required)
fp_raw_data (staging table, 57 columns from Oracle)
  ↓ AEBF Transform pipeline
fp_actualcommon (main sales table — 51,250 rows, 25 indexes)
  ↓ Customer unification
fp_customer_unified (deduplicated customer registry)
  ↓ CRM API queries
Browser Dashboard
```

---

## 4. Database Tables Used by CRM

### Primary Data (fp_database)
| Table | Rows | Purpose |
|-------|------|---------|
| `fp_actualcommon` | ~51,250 | All actual sales transactions — the single source of truth |
| `fp_customer_unified` | ~614 | Deduplicated customer registry with merged names |
| `sales_rep_groups` | ~8 | Sales rep group definitions (id, group_name, division) |
| `fp_product_group_exclusions` | ~5 | Product groups to filter out of CRM views |
| `fp_prospects` | variable | Prospect/lead pipeline |
| `fp_division_customer_merge_rules` | variable | Customer name merge rules |

### Auth Data (ip_auth_database)
| Table | Purpose |
|-------|---------|
| `users` | User accounts (email, role, is_active) |
| `employees` | Employee profiles linked to users via `user_id` |
| `designations` | Designation definitions with `level` (1–8) and `access_level` |
| `crm_sales_reps` | Sales rep profiles (full_name, user_id, group_members, type) |
| `user_sessions` | JWT session tracking |

**Designation Level Reference:**
| Level | Examples | MoRM Visible? |
|-------|----------|---------------|
| 1 | Machine Operator, Stores Keeper | No |
| 2 | Sales Representative, Accountant | No |
| 3 | Sales Executive, Senior Accountant | No |
| 4 | Area Sales Manager, Team Lead, QC Manager | No |
| 5 | Senior Sales Manager, Regional Sales Manager, Key Accounts Manager | No |
| 6 | Divisional Manager | **Yes** |
| 7 | General Manager | **Yes** |
| 8 | CEO | **Yes** |

### Key Columns in fp_actualcommon
| Column | Type | Used For |
|--------|------|----------|
| `admin_division_code` | text | Division filter ('FP') |
| `year` | integer | Period filtering |
| `month` | text | Month name ('January', 'February', ...) |
| `month_no` | integer | Fast month arithmetic (1-12) — used in all optimized queries |
| `customer_name` | text | Customer identification |
| `sales_rep_group_name` | text | Group filtering (denormalized from sales_rep_groups) |
| `amount` | numeric | Revenue value (AED) |
| `qty_kgs` | numeric | Volume in kilograms |
| `morm` | numeric | Margin over Raw Material value (AED) — used for MoRM % card |
| `pgcombine` | text | Product group combined name |
| `country` | text | Customer country |

---

## 5. MoRM Permission System (Feb 21, 2026)

**MoRM = Margin over Raw Material.** Stored as the `morm` column in `fp_actualcommon`. Displayed as a percentage: `morm ÷ revenue × 100`.

### How permission is determined

1. **Backend** (`server/services/authService.js` → `getUserById`):  
   The `/api/auth/me` endpoint returns the user object including `designation_level` sourced via:
   ```sql
   SELECT u.*, d.name as designation, d.level as designation_level
   FROM users u
   LEFT JOIN employees e ON e.user_id = u.id
   LEFT JOIN designations d ON e.designation_id = d.id
   WHERE u.id = $1
   ```

2. **Frontend** (both `AdminCRMDashboard.jsx` and `CRMDashboard.jsx`):  
   ```js
   const { user } = useAuth();
   const canSeeMorm = (user?.designation_level ?? 99) >= 6;
   ```
   - `canSeeMorm = true` → MoRM card renders
   - `canSeeMorm = false` → MoRM card is completely hidden (no fallback)
   - Default `?? 99` means if level is unknown it shows MoRM (safe for admins without employee record)

### MoRM format
- Backend: `parseFloat(((morm / revenue) * 100).toFixed(2))` — 2 decimal places
- Frontend display: `{stats.mormPct.toFixed(2)}%`
- YoY delta badge: `±X.XXpp` (percentage points)

---

## 6. All CRM Frontend Components

### Module Shell
| File | Lines | Description |
|------|-------|-------------|
| `CRMModule.jsx` | ~470 | Main container: tab nav, role detection, route definitions |
| `CRM.css` | ~1220 | All CRM styles (crmx-* prefix for dashboard, crm-* for legacy) |
| `index.js` | ~20 | Barrel exports |

### Dashboards
| File | Lines | Description |
|------|-------|-------------|
| `AdminCRMDashboard.jsx` | 634 | Admin Sales Cockpit — global KPIs, group selector, rep comparison |
| `CRMDashboard.jsx` | 602 | Sales Rep Sales Cockpit — personal view, locked to own group |

### Analytics & Reports
| File | Lines | Description |
|------|-------|-------------|
| `CRMAnalytics.jsx` | ~400 | Admin analytical charts (funnel, radar, segments) |
| `CRMReports.jsx` | ~300 | Admin report generation |
| `CRMSalesReport.jsx` | ~350 | Sales rep MIS report (locked to own group) |
| `CRMBudgetView.jsx` | ~400 | Budget achievement view (both roles) |
| `CRMBudgetEntry.jsx` | ~300 | Budget data entry form |

### Customer Management
| File | Lines | Description |
|------|-------|-------------|
| `CustomerList.jsx` | ~500 | Admin full customer list with search/filter |
| `MyCustomers.jsx` | ~400 | Sales rep's own customer list |
| `CustomerDetail.jsx` | ~750 | Individual customer profile page |
| `CustomerMapView.jsx` | ~300 | Geographic map of customer locations |
| `CustomerLocationPicker.jsx` | ~200 | Map picker for setting customer coordinates |
| `CustomerSalesHistoryModal.jsx` | ~350 | Modal: monthly sales history for a customer |

### Prospects & Products
| File | Lines | Description |
|------|-------|-------------|
| `ProspectManagement.jsx` | ~500 | Admin prospect pipeline CRUD |
| `MyProspects.jsx` | ~350 | Sales rep's own prospect list |
| `ProductGroupList.jsx` | ~300 | Product group browser with parameters |

### Team
| File | Lines | Description |
|------|-------|-------------|
| `SalesRepList.jsx` | ~300 | Admin sales team management |

---

## 7. All CRM Backend Endpoints

**File:** `server/routes/crm/index.js` (~2720 lines, 27 endpoints)  
**Mount:** `/api/crm` (via `server/config/express.js`)

### Dashboard Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/dashboard/stats` | Admin+ | Main admin dashboard stats (12 queries, cached 45s) |
| GET | `/my-stats` | Any | Personal rep dashboard stats (8 queries, cached 45s) |
| GET | `/recent-activities` | Any | Activity feed (prospects + customers) |

### Sales Rep Group Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/sales-rep-groups` | Any | List all sales rep groups |
| GET | `/sales-reps` | Admin+ | List individual reps |

### Customer Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/customers` | Admin+ | Full customer list with pagination |
| GET | `/customers/:id` | Any* | Customer detail (*ownership check for reps) |
| PUT | `/customers/:id` | Any | Update customer data |
| GET | `/customers/:id/sales-history` | Any | Monthly sales breakdown |
| GET | `/my-customers` | Any | Rep's own customer list |
| GET | `/customer-compare` | Admin+ | Side-by-side customer comparison |

### Prospect Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/prospects` | Admin+ | Full prospect list |
| POST | `/prospects` | Any | Create new prospect |
| PUT | `/prospects/:id` | Any | Update prospect |
| PUT | `/prospects/:id/status` | Any | Change prospect status |
| POST | `/prospects/:id/convert` | Any | Convert prospect to customer |
| GET | `/my-prospects` | Any | Rep's own prospects |

### Product Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/products` | Any | Product group list |
| GET | `/products/:id` | Any | Product group detail |
| PUT | `/products/:id` | Any | Update product group parameters |

### Report/Analytics Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/analytics` | Admin+ | Analytical aggregations |
| GET | `/reports/monthly` | Admin+ | Monthly report data |
| GET | `/budget` | Any | Budget data (filtered by role) |
| POST | `/budget` | Admin+ | Save budget entry |

### Presales Inquiry Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/inquiries` | Any | Inquiry list |
| POST | `/inquiries` | Any | Create inquiry |
| GET | `/inquiries/count` | Any | Unread count |

---

## 8. Route Map (/crm/*)

```
/crm                    → AdminCRMDashboard (admin) | CRMDashboard (rep)
/crm/analytics          → CRMAnalytics (admin only)
/crm/reports            → CRMReports (admin only)
/crm/report             → CRMSalesReport (rep only, locked to group)
/crm/budget             → CRMBudgetView (both, admin sees all groups)
/crm/prospects          → ProspectManagement (admin) | MyProspects (rep)
/crm/customers          → CustomerList (admin) | MyCustomers (rep)
/crm/customers/map      → CustomerMapView (both roles)
/crm/customers/:id      → CustomerDetail (both, ownership-filtered)
/crm/products           → ProductGroupList (both roles)
/crm/inquiries/*        → PresalesInquiries (both roles)
/crm/team               → SalesRepList (admin only)
```

---

## 9. Performance Optimizations (Feb 21, 2026)

| Optimization | Impact |
|-------------|--------|
| Replaced `TO_DATE(month, 'Month')` with `month_no` column | Eliminated per-row date conversion in 5 queries |
| Pre-computed `maxPeriod` once before Promise.all | Eliminated 5 repeated correlated subqueries |
| CTE + LEFT JOIN for recent customers (Q11) | Replaced slow correlated subquery |
| 5 new composite indexes on fp_actualcommon | Faster range scans for division+year+month_no |
| Server-side response cache (45s TTL) | Repeat requests: ~10ms instead of ~3000ms |
| AbortController in React useEffect | Prevents double-fire in StrictMode |

**Benchmark Results:**
| Scenario | Before | After |
|----------|--------|-------|
| Cold DB (first request) | ~3600ms | ~2900ms |
| Warm DB (PG buffers loaded) | ~3600ms | ~560ms |
| Cached (within 45s) | ~3600ms | ~10ms |

---

## 10. Verified Data (Feb 21, 2026)

Current live data from the dashboard endpoint:
- **614** total customers (all-time, any year with transactions)
- **74** active customers (YTD 2026, months 1-2)
- **31** customers with orders this month (February 2026)
- **10** countries with active customers
- **AED 10.36M** YTD revenue
- **-38%** year-over-year (behind last year)
- **12** sales trend data points (1Y view)
- **8** product groups in mix
- **8** rep groups ranked

This matches the screenshot insight bar:  
> "38% behind last year — needs attention · 74 active customers across 10 countries · 31 new orders this month"

---

## 11. Change Log — Feb 21, 2026 Session

### Period Selector Overhaul
- **Before:** Rolling periods — 1M / 3M / 6M / 1Y
- **After:** Calendar-aligned periods — `YTD` / `1M` / `Q1` / `Q2` / `Q3` / `Q4` / `FY`
- Each period compares current year against last year **same months** (e.g. YTD = Jan–Feb 2026 vs Jan–Feb 2025)
- `periodWhere` and `prevPeriodWhere` SQL clauses generated server-side from `date_range` param
- Both `/dashboard/stats` and `/my-stats` updated
- Both `AdminCRMDashboard.jsx` and `CRMDashboard.jsx` updated (Segmented control)

### MoRM Card (replacing "This Month" card)
- **Replaced** the old "This Month" card in both dashboards (it duplicated the revenue card when 1M was selected)
- Now shows MoRM % for the selected period with YoY pp delta badge (`±X.XXpp`)
- Sub-text: raw morm value in currency + last year morm %
- Format: `xx.xx%` (2 decimal places via `.toFixed(2)`)
- Backend: both endpoints query `SUM(d.morm)` and compute `morm_pct` and `prev_year_morm_pct`

### MoRM Permission Gating
- `designation_level` added to `getUserById` in `server/services/authService.js`:
  ```sql
  SELECT u.*, d.name as designation, d.level as designation_level
  FROM users u LEFT JOIN employees e ON e.user_id = u.id
  LEFT JOIN designations d ON e.designation_id = d.id WHERE u.id = $1
  ```
- Frontend: `const canSeeMorm = (user?.designation_level ?? 99) >= 6;` (same in both dashboards)
- **Level 6+** (Divisional Manager, GM, CEO): MoRM card renders
- **Level 5 and below** (Sales Managers, Reps, Team Leads, etc.): MoRM card is completely absent — no fallback

### Sales Rep Dashboard (CRMDashboard.jsx) — Card Restructure

| # | Before | After |
|---|--------|-------|
| 1 | Revenue (with MT in sub-text) | Revenue only |
| 2 | This Month revenue | **Volume Sold (MT)** — YoY badge + progress bar vs last year same period |
| 3 | Active Customers (all-time in sub-text) | **MoRM** *(level 6+ only, hidden for others)* |
| 4 | Open Prospects (with PG count badge) | **Active Customers** — period vs period (last yr same period in sub-text, YoY badge) |
| 5 | *(none)* | **Avg Revenue / Customer** — revenue ÷ active customers; prospect count in sub-text |

### Backend Query Additions (`server/routes/crm/index.js`)

| Endpoint | Addition | Purpose |
|----------|----------|---------|
| `/dashboard/stats` Q9 | `COALESCE(SUM(d.qty_kgs), 0) AS kgs` | `prev_year_kgs` in response |
| `/my-stats` prev-year query | `COALESCE(SUM(d.qty_kgs), 0) AS kgs` | `prev_year_kgs` in response |
| `/my-stats` prev-year query | `COUNT(DISTINCT d.customer_name) AS active_customers` | `prev_year_customers` in response |
| Both endpoints | `prev_year_kgs` in revenue response object | MT card YoY comparison |
| `/my-stats` | `prev_year_customers` in revenue response object | Active Customers YoY comparison |
