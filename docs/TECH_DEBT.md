# TECH DEBT — ProPackHub / PEBI
> **Check this file before starting any task. Fix debt items when you touch the relevant file.**
> **Last Updated:** 2026-03-23
>
> **See also:** `docs/_backup/PPH-26.2_Data_Performance_Review.md` — earlier audit covering **dashboard data query** slowness (12 SQL full-table scans per slicer change, missing indexes, no MV). Partially implemented (`sales_rep_group_id` backfilled, one basic index added). Remaining items tracked below as TD-026 through TD-032.
> **Implementation plan:** `docs/DASHBOARD_PERF_IMPLEMENTATION_PLAN.md` — step-by-step guide for the next agent session.

---

## 🔴 CRITICAL — Fix When Touching These Files

| ID | Issue | File(s) | Fix Required |
|----|-------|---------|--------------|
| TD-001 | SQL injection via unvalidated division input | `server/routes/universal.js`, `server/routes/divisionMergeRules.js` | Add: `const VALID_DIVISIONS = ['FP','HC']; if (!VALID_DIVISIONS.includes(division.toUpperCase())) return res.status(400)...` |
| TD-002 | Two conflicting DB config files | `server/config/database.js` (incomplete), `server/database/config.js` (correct) | Delete `server/config/database.js`. Always use `server/database/config.js` |
| TD-024 | 6-level nested providers all mount before first route render — FilterProvider, SalesData, SalesRepReports fire on login even for MES-only users | `src/App.jsx` | **Attempted:** Layout-route approach with `<Outlet>` caused render waterfall regression (CRM 827ms → 6,595ms). **Current mitigation:** Auth-token guards in each provider prevent wasted API calls on login/MES pages. Global mount is faster because providers initialize in parallel with route resolution. Future: consider React.lazy wrapping providers themselves. |

---

## 🟠 HIGH PRIORITY — Fix During Related Work

| ID | Issue | File(s) | Fix Required |
|----|-------|---------|--------------|
| TD-003 | Frontend hardcoded `http://localhost:3001` | Multiple component files | Create `src/config/api.js` with `export const API_BASE = import.meta.env.VITE_API_URL \|\| 'http://localhost:3001'` and import everywhere |
| TD-004 | `console.log` instead of winston logger | `server/utils/divisionDatabaseManager.js` (30+ occurrences) | Replace with `logger.info/debug/warn/error` |
| TD-005 | `key={index}` in list renders | Multiple components | Replace with `key={item.id}` or a stable derived key |
| TD-006 | AdminCRMDashboard and CRMDashboard duplicated ~80% | Both dashboard files | Extract shared logic to `src/services/crmDashboardService.js` |
| TD-007 | localStorage key inconsistency | Auth-related components | Key must always be `auth_token` not `token` |
| TD-008 | Frontend console.log statements (100+ occurrences) | Contexts, components | Create conditional logger or remove — leaks debug info |
| TD-009 | Missing useEffect cleanup (AbortController) | `src/contexts/ExcelDataContext.js`, `FilterContext.js`, `SalesDataContext.js`, `CurrencyContext.js` | Add AbortController cleanup to prevent memory leaks |
| TD-010 | Inconsistent error response format across API | Various routes | Standardize to `{ success: boolean, error?: string, data?: any }` |
| TD-025 | CRM component-level duplicate API calls — my-customers ×8, my-prospects ×8 per load | `src/components/CRM/` (multiple tabs/panels) | Each CRM sub-component fetches its own data independently. Consolidate into a single CRM data-loading hook or context that fetches once and distributes. |
| TD-026 | ~~Dashboard runs 12 parallel SQL full-table scans per slicer change on 60k+ row `fp_actualcommon`~~ **RESOLVED** | `server/routes/crm/dashboard.js` | **Done:** Created `mv_fp_sales_cube` MV, rewrote 3 routes to query MV with parameterized queries. 12 scans → 9/6/1 parameterized MV queries. |
| TD-027 | Missing composite indexes on `fp_actualcommon` — only `idx_fp_actualcommon_admin_division` exists | `server/migrations/` | Migration created: `500_add_dashboard_performance_indexes.sql`. **Run against DB to activate.** Adds: `idx_fpa_div_year_month`, `idx_fpa_group_year_month`, `idx_fpa_customer_year`. Uses `CREATE INDEX CONCURRENTLY`. |
| TD-028 | ~~SQL string interpolation in dashboard.js~~ **RESOLVED** | `server/routes/crm/dashboard.js` | **Done:** All 3 routes (/dashboard/stats, /active-customers, /my-stats) converted to `$N` parameterized queries. Zero template-literal SQL remaining in dashboard routes. |
| TD-029 | ~~No debounce on year/period slicer~~ **RESOLVED** | `src/components/CRM/SalesCockpit.jsx` | **Done:** 400ms `useDebouncedValue` hook on year + dateRange. Rapid slicer clicks → 1 API call after debounce. |
| TD-030 | ~~No client-side data caching~~ **RESOLVED** | `SalesCockpit.jsx`, dashboard components | **Done:** `@tanstack/react-query` installed, `QueryClientProvider` in App.jsx (5min staleTime), `useSalesCube` hook created for progressive adoption. |
| TD-031 | ~~Cache TTL too short (45s) and per-worker only (no Redis)~~ **RESOLVED** — tiered TTL implemented | `server/services/crmCacheService.js` | **Done:** `getCacheTTL(year)` — 30min for historical years, 5min for current year. `cacheSet` now accepts optional `ttl` param. Dashboard routes pass `getCacheTTL(currentYear)`. Future: Redis for cross-worker sharing. |
| TD-032 | ~~`/customers/map` has no server-side hard cap on `limit` param~~ **RESOLVED** | `server/routes/crm/customers.js` | **Done:** `safeLimit()` helper in `server/utils/pagination.js`, hard cap 500 rows. `?limit=99999` → capped to 500. |

---

## 🟡 LOW PRIORITY — Fix When Convenient

| ID | Issue | File(s) | Notes |
|----|-------|---------|-------|
| TD-011 | xlsx package has unfixed security vulnerability | `package.json` | Monitor for fix. No workaround available yet. |
| TD-012 | Unused imports and dead state variables | Various components | Clean up during any refactor using D1/D2 rules in AGENT.md |
| TD-013 | CORS origin hardcoded to localhost | `server/config/express.js` or server setup | Use environment variable for CORS origin |
| TD-014 | Database password in fallback config | `server/database/config.js` | Remove hardcoded fallback password, require env var |

---

## ✅ RESOLVED

| ID | Issue | Resolved Date | How |
|----|-------|--------------|-----|
| TD-015 | pending-my-approval query missing settlement JOIN | 2026-03-21 | Added LEFT JOIN LATERAL on crm_trip_settlements to match list query |
| TD-016 | Travel report GET joins users from wrong DB pool | 2026-03-21 | Replaced inline JOINs with separate authPool lookup (same pattern as list endpoint) |
| TD-017 | No trip status guard on expense endpoints | 2026-03-21 | Added confirmed/in_progress guard on POST/DELETE expenses + multi-currency |
| TD-018 | No trip status guard on stop mutation endpoints | 2026-03-21 | Added completed/cancelled rejection on POST/PUT/PATCH stops |
| TD-019 | Travel report upsert can overwrite approved report | 2026-03-21 | Added guard: reject if existing report status is approved |
| TD-020 | autoCompleteExpiredTrips fires on every GET | 2026-03-21 | Added 5-minute in-memory debounce |
| TD-021 | `/api/standard-config` 6 failing 404 calls per mount | 2026-03-22 | Replaced all 6 call sites in FilterContext.jsx with `updatePreferences()` from AuthContext |
| TD-022 | Duplicate CRM API calls (my-customers, my-prospects) | 2026-03-22 | Deferred `loadStats` in CRMModule.jsx to performance/report/budget tabs only |
| TD-023 | ExcelDataProvider blocks app startup | 2026-03-22 | Added auth-token guard + parallelized 2 sequential API calls with Promise.all |
| TD-025-resolved | 21 duplicate provider-level API calls per navigation | 2026-03-22 | Created `src/utils/deduplicatedFetch.js` — in-flight GET dedup for fetch() and axios. Wired into AuthContext (3 calls), ExcelDataContext (2), CurrencyContext (1), FilterContext (1), SalesDataContext (2), countriesService (1). CDP-verified: settings/company 4→1, auth/me 3→1, permissions/my 3→1, periods/all 2→1 |
| TD-033-resolved | /api/auth/preferences called 5-12x per page — ResizableTable (6 direct axios), ThemeContext (1), Settings (1) all bypassed AuthContext's 30s cache | 2026-03-22 | Added `getCachedPreferences()` (30s TTL + in-flight dedup) and `invalidatePreferencesCache()` to `deduplicatedFetch.js`. Converted ResizableTable.jsx (5 call sites), ThemeContext.jsx (1 GET), Settings.jsx (1 GET) to use cached getter. CDP-verified: preferences GET reduced from 5-12x to 2x per page. Also converted 5 components (NewCustomerModal, ProspectPanel, BudgetTab, FieldVisitPlanner, FieldVisitExpenseModal) from direct axios countries/list to `fetchCountries()` from countriesService with 5-min cache |
| - | Redundant bodyParser.json() | 2025-12-20 | Removed from server/config/express.js |
| - | Missing auth on admin routes | 2025-12-20 | Fixed in server/routes/admin.js |
| - | Unused bodyParser import | 2025-12-20 | Removed from server/config/express.js |
| - | Updated .env.example | 2025-12-20 | Fixed in server/.env.example |
