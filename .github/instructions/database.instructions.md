---
description: "Use when working on database migrations, schema changes, SQL queries, connection pools, or database configuration."
applyTo: ["server/database/**", "server/migrations/**", "migrations/**"]
---
# Database Context

## Config — Single Source of Truth
**Always use `server/database/config.js`** — exports `pool`, `authPool`, `platformPool`, `query()`, `getClient()`, `testConnection()`, `getDivisionPool()`.

⚠️ **Never use `server/config/database.js`** — it is incomplete and causes connection failures (TD-002).

## Three Databases

| DB | Var | Pool Export | Purpose |
|----|-----|------------|---------|
| `fp_database` | `DB_NAME` | `pool`, `getDivisionPool()` | All business data: sales, budget, CRM, MES |
| `ip_auth_database` | `AUTH_DB_NAME` | `authPool` | Auth, users, sessions, company settings, countries |
| `propackhub_platform` | `PLATFORM_DB_NAME` | `platformPool` | SaaS platform: companies, subscriptions |

## Connection Pool Settings
- Max connections: 20
- Idle timeout: 30s
- Connection timeout: 10s
- Retry attempts: 3

## Migration Conventions
- **Numbered migrations**: `server/database/migrations/` — sequential from `001` to `500+`
  - Latest range: `500_add_dashboard_performance_indexes.sql`, `501_create_sales_cube_mv.sql`
- **Versioned migrations**: `migrations/sql/` — date-prefixed: `YYYYMMDD_NNN_description.up.sql` / `.down.sql`
  - Latest: `313_create_fp_actualrmdata.sql`
- **JS migrations**: `server/migrations/` — e.g., `add-country-timezone-to-master-countries.js`
- Run via `server/database/runMigrations.js` or imported in `server/index.js` startup

## Query Rules
- **Division validation**: Always whitelist against `['FP', 'HC']` before using in SQL (TD-001)
- **Division column**: Use `admin_division_code` (not `division_code`) for `fp_actualcommon`
- **Parameterized queries**: Always use `$1, $2` placeholders — never template literals in SQL
- **Pagination**: Use `safeLimit()` from `server/utils/pagination.js` (hard cap 500 rows)
- **Materialized views**: Dashboard uses `mv_fp_sales_cube` — refreshed by `server/jobs/refreshSalesCube.js`

## Key Services
- `server/database/FPDataService.js` — FP-specific queries + server-side cache
- `server/database/CustomerInsightsService.js` — customer analytics queries
- `server/database/DivisionMergeRulesService.js` — division merge logic
- `server/database/ProductGroupDataService.js` — product group queries
- `server/database/divisionValidator.js` — division whitelist validation
