---
description: "Use when working on MIS dashboards, KPI cards, sales cockpit, analytics, charts, reports, or data visualization performance."
applyTo: ["src/components/dashboard/**", "src/components/reports/**", "src/components/charts/**", "server/routes/dashboard.js", "server/routes/analytics.js", "src/hooks/useSalesCube*", "src/hooks/useDebouncedValue*"]
---
# Dashboard / MIS Module Context

## Performance Architecture (fully implemented — do NOT regress)

### Materialized View Pattern
- **`mv_fp_sales_cube`** — pre-aggregated sales data view (migration `501_create_sales_cube_mv.sql`)
- Refreshed by `server/jobs/refreshSalesCube.js` with advisory lock (prevents concurrent refresh)
- Dashboard routes (`/dashboard/stats`, `/active-customers`, `/my-stats`) query the MV, NOT raw `fp_actualcommon`
- All queries use `$N` parameterized placeholders — zero string interpolation

### Client-Side Caching
- `@tanstack/react-query` with `QueryClientProvider` in `App.jsx` (5min staleTime)
- **`useSalesCube` hook** (`src/hooks/useSalesCube.js`): queryKey `['salesCube', division, groupId, year]`, 5min stale, 10min gcTime, placeholderData keeps previous
- **`useDebouncedValue` hook** (`src/hooks/useDebouncedValue.js`): 400ms debounce on year + dateRange slicers

### Request Deduplication
- `src/utils/deduplicatedFetch.js` — in-flight GET dedup using Map<url, Promise>
- `getCachedPreferences()` — 30s TTL for `/api/auth/preferences` (was previously called 5-12x per page)
- `countriesService.fetchCountries()` — 5min client-side cache

## Key Tables
- `fp_actualcommon` — raw actual sales (60k+ rows). Always use `admin_division_code` column, validate division against `['FP','HC']`
- `fp_budget_unified` — budget/forecast/estimate data
- `mv_fp_sales_cube` — materialized view for dashboard aggregations
- Composite indexes: `idx_fpa_div_year_month`, `idx_fpa_group_year_month`, `idx_fpa_customer_year` (migration 500)

## Structure
- **65+ dashboard components** in `src/components/dashboard/`
- **16 report components** in `src/components/reports/`
- **27 chart wrappers** in `src/components/charts/` (ECharts, Chart.js, Recharts)
- Key components: `SalesCockpit.jsx`, `RawMaterials.jsx`, `ProductGroupMasterData.jsx`, `RawProductGroups.jsx`
- Contexts: `FilterContext.jsx` (dashboard filters), `SalesDataContext.jsx`, `CurrencyContext.jsx`, `BudgetContext.jsx`

## Anti-Patterns to Avoid
- ❌ Direct `fp_actualcommon` scans in dashboard routes — always use `mv_fp_sales_cube`
- ❌ SQL template literals — always use parameterized queries
- ❌ Multiple identical API calls from different contexts — use `deduplicatedFetch`
- ❌ Missing debounce on slicer changes — use `useDebouncedValue`
- ❌ No `safeLimit()` on paginated endpoints — hard cap 500 rows (`server/utils/pagination.js`)

## History
- `docs/DASHBOARD_PERF_IMPLEMENTATION_PLAN.md` — all 9 steps completed
- `docs/_backup/PPH-26.2_Data_Performance_Review.md` — original audit (12 SQL full-table scans identified)
