# Admin User Management + Access Control (Default: NONE)

Date: 2025-12-18

---

## 0) Alignment with Flex Pack ERP Guide (Module 1)

This implementation is **Module 1: Authentication & User Management** of the 32-module ERP system defined in `flex_pack_erp_guide.txt`.

### From the ERP Guide:
```
Module 1: Authentication & User Management [Week 1]
Flow Position: System Foundation
Database: users (id, email, password_hash, role, business_units[], permissions, is_active)
          refresh_tokens, audit_log
Features: JWT auth, role-based access, multi-business unit support, audit logging
Roles: admin, sales_manager, sales_rep, production_manager, quality_manager, operator, bu_manager
```

### Current State vs. ERP Guide:

| ERP Guide Requirement | Current IPDashboard State | Action Needed |
|-----------------------|---------------------------|---------------|
| `users` table | ✅ Exists | Minor updates only |
| `business_units[]` (divisions) | ✅ `user_divisions` table | Keep as-is |
| `permissions` column | ❌ Missing | Add `permissions` + `user_permissions` tables |
| `refresh_tokens` | ✅ `user_sessions` table | Keep as-is |
| `audit_log` | ❌ Missing | Add for permission changes |
| JWT auth | ✅ Complete | Keep as-is |
| Role-based access | ✅ `requireRole()` middleware | Keep + extend with `requirePermission()` |
| Multi-business unit | ✅ `company_settings.divisions` | Keep dynamic |
| Additional roles | ⚠️ Only 3 roles exist | Extend when needed (Phase 2+) |

### Critical: White-Label / Multi-Tenant Ready

The app will be sold to different companies, each with their own divisions. **Nothing should be hardcoded**.

---

## 0.1) HARDCODED DIVISIONS - MUST FIX

The following hardcoded division references **block the white-label capability** and must be fixed:

### ❌ Database Constraints (CRITICAL - Blocks New Divisions)

| File | Line | Issue |
|------|------|-------|
| `server/migrations/001_create_users_tables.sql` | 24 | `CHECK (division IN ('FP', 'SB', 'TF', 'HCM'))` |
| `server/scripts/create-fp-divisional-budget-table.sql` | 34 | `CHECK (UPPER(division) IN ('FP', 'SB', 'TF', 'HCM'))` |

**Fix:** Create migration to drop these constraints:
```sql
-- Migration: 010_remove_hardcoded_division_constraints.sql
ALTER TABLE user_divisions DROP CONSTRAINT IF EXISTS user_divisions_division_check;
ALTER TABLE fp_divisional_budget DROP CONSTRAINT IF EXISTS chk_div_budget_division;
```

### ❌ Frontend Hardcoded Arrays (HIGH)

| File | Line | Code |
|------|------|------|
| `src/contexts/SalesDataContext.js` | 40 | `const divisions = ['FP', 'SB', 'TF', 'HCM'];` |
| `src/components/dashboard/MaterialPercentageManager.jsx` | 35 | `const supportedDivisions = ['fp', 'sb', 'tf', 'hcm'];` |
| `src/components/dashboard/ProductGroupPricingManager.jsx` | 8 | `const SUPPORTED_DIVISIONS = ['fp', 'sb', 'tf', 'hcm'];` |

**Fix:** Replace with API call to `/api/settings/divisions` or use `company_settings`.

### ❌ Backend Hardcoded Config (MEDIUM)

| File | Lines | Issue |
|------|-------|-------|
| `server/database/divisionDatabaseConfig.js` | 1-15 | Static `FP`/`HC` config object |

**Fix:** Query `company_settings.divisions` dynamically instead.

### ⚠️ Default Fallbacks (LOW)

| File | Line | Code |
|------|------|------|
| `src/utils/normalization.js` | 153 | `if (!division) return 'fp';` |
| `server/utils/normalization.js` | 160 | `if (!division) return 'FP';` |

**Fix:** Return `null` or fetch first division from settings.

### ✅ Already Dynamic (Correct)

- `company_settings` table stores divisions as JSON array
- `authService.js` fetches from `company_settings`
- `userService.js` fetches from `company_settings`
- `divisionDatabaseManager.js` has `getActiveDivisions()` that queries DB
- Settings UI fetches divisions from API

---

## 1) Goal (what you asked for)
You want an **Admin User Management** page where the admin can decide, per user, exactly **what they can see and do**:
- Which **divisions** a user can access (already exists conceptually).
- Which **pages/modules** the user can open.
- Which **functions/buttons** the user can press (exports, saves, CRUD, refresh, sync, etc.).

**Important constraint:** Default should be **NONE** (deny by default). Admin must explicitly tick permissions to grant access.

**Out of scope (for now):** business “approvals/workflows” like ERPNext document workflows. (Some existing features use the words approve/reject for merge suggestions; those are treated as normal actions/permissions, not a workflow system.)

---

## 2) Current reality in this codebase (baseline)
### 2.1 Frontend routing
Only two explicit React routes exist today:
- `/dashboard`
- `/settings`

But most “pages” are **sub-views** inside `Dashboard` and `Settings`.

### 2.2 Existing access model
- Role-based auth exists (`admin`, `sales_manager`, `sales_rep`).
- Division access exists (`user_divisions`, enforced by backend middleware in places).
- Some admin-only backend endpoints exist (e.g. settings updates, currency rate changes).
- **Security gap noted:** `/api/admin/*` routes are currently unprotected (needs `authenticate + requireRole('admin')`).

### 2.3 What we are adding
A **permission/capability** system:
- Default deny: user starts with no permissions.
- Admin grants by ticking a list.
- Enforced in both:
  - Frontend (hide UI + block routes)
  - Backend (block API calls)

---

## 3) Core design decisions
### 3.1 Permission key format
Use stable string keys:
- `module:feature:action`
Examples:
- `dashboard:home:view`
- `divisional:kpis:view`
- `divisional:product-groups:export-pdf`
- `settings:company:update`
- `users:permissions:update`

### 3.1.1 Permission naming + scoping rules (to prevent drift)
This is important because the app has many UI “surfaces” inside only `/dashboard` and `/settings`. Without strict rules, permissions will duplicate and become unmaintainable.

**Key family rules**
- `nav:*` is only for header/shell actions (division switch, open settings, logout).
- `settings:*` is only for Settings page/tab access and true settings CRUD (company/divisions/appearance).
  - `settings:*:view` = can open that tab.
  - `settings:*:update|create|delete` = can save/change server-stored settings.
- `periods:select:*` is the ONLY family for period/column selection and configuration actions.
  - Do not introduce `settings:periods:*` action keys (avoid duplicates).
- `divisional:*`, `sales:*`, `writeup:*`, `settings:masterdata:*`, `merge-rules:*`, `countries:*`, `currency:*`, `maintenance:*` map to their module surfaces and must contain the action name.

**Action word rules**
- Use `view` for opening a page/tab/subtab.
- Use `toggle` for switches.
- Use `select` or `pick` only when it matters as a distinct “action” you want to permission (your default-deny requirement).
- Use `export-*` / `print` for exports and print.
- Use `create|update|delete` for CRUD.
- Use `refresh|sync|scan|validate|analyze|upload|save|finalize` where applicable.

**Scope rules**
- If the feature touches division-specific data (dashboards, reports, AEBF, master data by division), it is `scope=division`.
- If the feature is identity/UI-only (navigation shell, theme/appearance), it is `scope=global`.
- If scope is unclear, default to `scope=division` (safer with default-deny).

**No “wildcard” permissions**
Do not add broad permissions like `export:any` or `settings:any` because you requested explicit tick-per-button/action.

### 3.2 Default deny (your requirement)
- A user with no permissions can still:
  - Login/logout
  - Load their identity (`/api/auth/me`)
  - Load their own preferences (`/api/auth/preferences`) if we choose to keep that self-service
- Everything else requires explicit permission.

### 3.3 Role becomes optional/secondary
Keep roles for identity and defaults if you want later, but with default-deny you typically want:
- Either **no role defaults** at all
- Or role defaults only for admins (admin convenience)

This spec assumes **role defaults are optional** and the system works without them.

### 3.4 Division access remains separate
- Division access answers: “Which division can user see?”
- Permissions answer: “What functions can user use (within a division)?”

Both must pass.

### 3.5 Division-scoped permissions (new requirement)
Some users are common across all divisions, and some are specific to one division. Therefore:

- **Division membership** (existing): user can/can’t select a division.
- **Permission scope** (new): even if user can select a division, they might have **different permissions per division**.

This spec supports **two permission scopes**:
- **Global** permission: applies across all divisions (e.g., UI appearance, basic navigation).
- **Division** permission: applies only for a specific division code (FP/SB/TF/HCM/etc.).

Rule of thumb:
- Anything that shows division data (dashboards, reports, master data, exports) should be **division-scoped**.
- Pure UI preferences and identity are **global**.

---

## 3.6 "Auto-expanding" permission table (future-proofing)
Your requirement is that the permission table should expand automatically as more pages/functions are developed.

To achieve that, the checkbox UI must be **data-driven from the database**, not hard-coded in React.

Mechanism:
1) Maintain a single **catalog source** in the backend (recommended: a JSON/JS catalog file).
2) On server startup (or via a one-time admin endpoint / migration), **upsert** the catalog into the `permissions` table.
3) The Admin UI fetches the catalog from the backend and renders every permission it receives.

This way, when developers add a new permission entry to the catalog and deploy, it appears automatically in the admin UI without changing the UI.

---

## 4) Database changes (schema)
Create a minimal permission model that supports default-deny and a tick list.

### 4.1 Tables
#### `permissions`
Stores the master catalog (the tick list is driven from here).
- `key` (PK, text)
- `label` (text)
- `description` (text)
- `group` (text) – e.g. Dashboard / Divisional / Settings / Admin
- `scope` (text) – `global` | `division`
- `sort_order` (int)
- `is_enabled` (boolean) – allows hiding permissions if feature removed

#### `user_permissions`
Per-user allowlist (supports global + per-division).
- `user_id` (FK)
- `permission_key` (FK -> permissions.key)
- `division_code` (text, nullable)
  - `NULL` means global permission
  - `FP` / `SB` / `TF` / `HCM` etc means division-scoped permission
- `allowed` (boolean) – in this project we can keep only `true` rows, but boolean allows future explicit denies.
- Unique (`user_id`, `permission_key`, `division_code`)

#### (Optional) `role_permissions`
If you want defaults by role later.
- `role` (text)
- `permission_key` (FK)
- `division_code` (text, nullable) – same meaning as above
- `allowed` (boolean)

### 4.2 Effective permission computation
If `role_permissions` is used:
1) Start with role permissions.
2) Apply `user_permissions` overrides.

If you do **not** want role defaults (pure tick list):
- Effective permissions = set of keys where `user_permissions.allowed = true`.

### 4.3 Effective permission with division scope
When checking a permission for a division (e.g. selected division is `FP`):

1) If the permission is `scope=division`, check:
  - user has `(permission_key, division_code='FP')`
2) If the permission is `scope=global`, check:
  - user has `(permission_key, division_code=NULL)`

Optional convenience (not required): allow a global grant to act as “all divisions” for a division-scoped permission.
If you want that behavior, implement:
- If `(permission_key, division_code=NULL)` exists, treat it as granted for all divisions.

This is helpful for “common across all divisions” users.

---

## 5) Backend changes (API + enforcement)
### 5.1 Middleware
Add a new middleware:
- `requirePermission('some:key')`

Behavior:
- Requires `authenticate` first.
- Checks effective permissions for `req.user.id`.
- Returns `403` with `{ error: 'Access denied', requiredPermission: '...' }`.

Division-aware behavior:
- For `scope=division` permissions, the middleware must also know **which division** is being accessed.
  - Division should be taken from one of:
    - `req.params.division`
    - `req.query.division`
    - `req.body.division`
    - (fallback) `req.headers['x-division']` if you standardize it later

If division is required but missing → `400 { error: 'Division not specified' }`.

### 5.2 Where to enforce (server)
Enforce on:
- All endpoints that expose data or change data (except auth basics).
- Especially any endpoint used by “buttons” like Export/Save/Delete/Refresh/Sync.

### 5.3 Admin endpoints for managing permissions
Add endpoints under `/api/auth/users/*` (already admin-protected pattern exists):
- `GET /api/auth/users` (already exists) → include `permissions` summary
- `GET /api/auth/users/:id/permissions`
  - returns full permission catalog + which are enabled for that user
- `PUT /api/auth/users/:id/permissions`
  - payload (supports division-wise grants):
    - `{ global: string[], byDivision: { FP?: string[], SB?: string[], TF?: string[], HCM?: string[] } }`

Also add:
- `GET /api/auth/permissions/catalog` (admin-only)
  - returns the catalog used to render the checkbox list

Optional but recommended:
- `POST /api/auth/permissions/sync-catalog` (admin-only)
  - forces an upsert from the catalog source into DB

### 5.4 Token / client sync strategy
Recommended:
- Don’t put the full permission list into the JWT.
- Load permissions in `/api/auth/me` response (or a `/api/auth/me/permissions` call).

This avoids token size bloat and makes permission changes apply immediately (after refreshUser()).

---

## 6) Frontend changes (UI + gating)
### 6.1 AuthContext
Add:
- `user.permissions` (array of permission keys)
- helper: `hasPermission(key)`

Update for division scope:
- Store permissions in a structure that supports division:
  - `user.permissionsGlobal: string[]`
  - `user.permissionsByDivision: Record<divisionCode, string[]>`
- Helper:
  - `hasPermission(key, { division })`

### 6.2 ProtectedRoute
Extend to support:
- `requiredPermission`

### 6.3 UI hiding rules
- If user lacks `X:view`, do not show that card/tab/button.
- If user somehow navigates to a view, show a friendly “Access denied” page.

### 6.4 Admin User Management page (where)
Add inside Settings as a new tab:
- `Users`

Because Settings is already where admin config lives.

---

## 7) Permission Catalog (tick list)
This is the **master list** that admin will tick.

Important notes:
- Every permission in the catalog must declare a `scope`: `global` or `division`.
- The Admin UI renders this list by calling the backend catalog endpoint, so it automatically expands as new permissions are added to the catalog.

---

## 7.0 Frontend feature inventory (what "all pages" means here)
This application uses only two router URLs (`/dashboard`, `/settings`), so “pages” are implemented as **feature surfaces** inside those pages.

To cover *everything in the frontend*, the catalog includes permissions for:
- Navigation shell (header dropdown, division switch)
- Dashboard home cards (Divisional / Sales / Write-up)
- Dashboard utilities: period/column selection, generate, base period selection
- Divisional dashboard sub-pages (each card)
- Sales dashboard sub-pages (rep tabs, tables/report, exports)
- Write-up tools (generate/export/explain)
- Settings tabs: Company Info, Period Configuration, Master Data, Appearance
- Data maintenance/admin tools surfaced in UI (currency rate add/refresh, restore divisions, etc.)

Additionally, to ensure nothing is missed as UI grows:
- The catalog is DB-driven and can include new permissions anytime.
- A developer utility (recommended) should scan the repo for `hasPermission('...')` and `requirePermission('...')` keys to ensure the catalog is kept in sync.

### 7.1 System (non-configurable basics)
These are not ticked because the app can’t function without them.
- Login / logout
- Load current user (`/api/auth/me`)

(If you want, we can still represent them as permissions but mark them `system=true` and always allowed.)

### 7.2 Navigation / Shell
- (global) `nav:division:switch` — Switch division in header (division badges)
- (global) `nav:settings:open` — Open Settings from header
- (global) `nav:dashboard:open` — Navigate back to dashboard from settings header
- (global) `nav:logout` — Logout button in header

### 7.3 Dashboard (top-level)
From `Dashboard` home cards:
- (global) `dashboard:home:view`
- (division) `dashboard:divisional:view` — open “Divisional Dashboard” card
- (division) `dashboard:sales:view` — open “Sales Dashboard” card
- (division) `dashboard:writeup:view` — open “Write-Up” card

Dashboard utilities used across modules:
- (division) `periods:select:view` — view period selection UI (FilterPanel/ColumnConfigGrid)
- (division) `periods:select:add-year` — add a new year option
- (division) `periods:select:add-column` — add a year/period/type column
- (division) `periods:select:multi-month:toggle` — toggle multi-month range mode
- (division) `periods:select:multi-month:pick` — pick months in range
- (division) `periods:select:generate` — click Generate
- (division) `periods:select:clear` — clear selections
- (division) `periods:select:reorder` — move columns left/right
- (division) `periods:select:column:remove` — remove a selected column
- (division) `periods:select:base-period:set` — set base period
- (division) `periods:select:base-period:clear` — clear base period
- (division) `periods:select:chart-columns:toggle` — toggle chart column visibility
- (division) `periods:select:save-standard` — save current selection as standard
- (division) `periods:select:clear-standard` — clear standard selection
- (division) `periods:select:save-preferences` — save user preferences (period config UI)
- (division) `periods:select:color-scheme:change` — change column color scheme (including custom)

### 7.4 Divisional Dashboard (cards)
From `DivisionalDashboardLanding`:
- (division) `divisional:kpis:view` — Divisional KPIs
- (division) `divisional:sales-volume:view` — Sales & Volume Analysis
- (division) `divisional:margin-analysis:view` — Margin Analysis
- (division) `divisional:manufacturing-cost:view` — Manufacturing Cost
- (division) `divisional:below-gp-expenses:view` — Below GP Expenses
- (division) `divisional:combined-trends:view` — Cost & Profitability Trend
- (division) `divisional:pl-financial:view` — Profit and Loss Statement
- (division) `divisional:product-group:view` — Product Groups
- (division) `divisional:sales-rep:view` — Sales by Sales Reps
- (division) `divisional:sales-customer:view` — Sales by Customers
- (division) `divisional:sales-country:view` — Sales by Countries

Map and country tooling surfaced inside dashboards (present in frontend folder):
- (division) `divisional:map:2d:view` — 2D map views
- (division) `divisional:map:leaflet:view` — Leaflet map views
- (division) `divisional:countries:reference:view` — Country reference tool

### 7.5 Divisional exports (buttons)
Detected export-style components:
- (division) `divisional:pl-financial:export-pdf` — Export P&L/financial table to PDF
- (division) `divisional:sales-country:export-pdf` — Export Sales by Country to PDF
- (division) `divisional:sales-rep:export-html` — Export Sales Rep report to HTML (if exposed)
- (division) `divisional:multi-chart:export-html` — Export multi chart HTML report (if exposed in UI)
- (division) `divisional:export:charts-html` — Export all charts/tables to offline HTML (MultiChartHTMLExport)

### 7.6 Sales Dashboard (sales rep tabs)
From `SalesBySaleRepTable`:
- (division) `sales:reps:view` — Access Sales-by-Sales-Rep module
- (division) `sales:reps:tables:view` — Tables sub-tab
- (division) `sales:reps:report:view` — Report sub-tab

Sales dashboard controls visible in the module:
- (division) `sales:reps:hide-budget-forecast:toggle`
- (division) `sales:reps:groups:view`
- (division) `sales:reps:groups:use` — switch between grouped reps and standalone reps

Exports:
- (division) `sales:reps:report:export-html` — Export Sales Rep report to HTML (via `SalesRepHTMLExport`)
- (division) `sales:reps:report:print` — Print report (browser print)

### 7.7 Write-Up (AI assistant)
From `WriteUpViewV2`:
- (division) `writeup:generate` — “Generate Write-Up”
- (division) `writeup:export-pdf` — “Export PDF”

Buttons present but currently not implemented in V2 (still should be permissions if you want them later):
- (division) `writeup:explain:product`
- (division) `writeup:explain:customer`
- (division) `writeup:explain:country`

(If these buttons remain no-op, we can omit them from catalog until implemented.)

### 7.8 Settings (Admin)
Settings is a large page with tabs (company/periods/masterdata/appearance). Suggested permissions:

**Settings page access**
- (global) `settings:view` — open settings page

**Company settings**
- (global) `settings:company:view`
- (global) `settings:company:update` — save company name/logo/currency

**Division settings**
- (global) `settings:divisions:view`
- (global) `settings:divisions:update` — add/remove/save divisions
- (global) `settings:divisions:restore` — restore from backups

**Periods configuration**
- (global) `settings:periods:view`

Note: To avoid duplicated/overlapping permission families, all “buttons/actions” inside Period Configuration must reuse the **division-scoped** `periods:select:*` permissions (Generate, Add Year, Add Column, Save as Standard, Clear Standard, Base Period set/clear, chart visibility toggles, Save Preferences, etc.).
The only `settings:periods:*` permission kept is the ability to open the Period Configuration tab itself.

**Master Data settings**
This includes sales rep groups and customer merging management (some is in Settings > Master Data):
- (division) `settings:masterdata:view`
- (division) `settings:masterdata:sales-rep-groups:view` — open Sales Rep Groups tab
- (division) `settings:masterdata:sales-rep-groups:refresh` — reload sales reps/groups from DB
- (division) `settings:masterdata:sales-rep-groups:create`
- (division) `settings:masterdata:sales-rep-groups:update`
- (division) `settings:masterdata:sales-rep-groups:delete`

Customer Merging UI entry point (the actions themselves are in `merge-rules:*` below):
- (division) `settings:masterdata:customer-merging:view` — open Customer Merging tab

Country reference UI entry point (global dataset; CRUD keys are in `countries:*`):
- (global) `settings:masterdata:countries:reference:view` — open Country Reference tool

Additional master data tooling present in dashboard folder (if surfaced):
- (division) `settings:masterdata:product-group-pricing:view`
- (division) `settings:masterdata:product-group-pricing:update`
- (division) `settings:masterdata:material-percentages:view`
- (division) `settings:masterdata:material-percentages:update`

Material Percentages:
- (division) `settings:masterdata:material-percentages:reset-row` — reset a row
- (division) `settings:masterdata:material-percentages:save` — save to backend

Product Group Pricing:
- (division) `settings:masterdata:product-group-pricing:save`

### 7.8.1 AEBF (Actual / Estimate / Budget / Forecast)
This is exposed in Settings → Master Data → “AEBF Data” (`AEBFTab`), and is a large surface with uploads, exports, calculations, and HTML budget import/export.

**AEBF page access (entry point + subtabs)**
- (division) `settings:masterdata:aebf:view` — open AEBF Data tab
- (division) `settings:masterdata:aebf:actual:view`
- (division) `settings:masterdata:aebf:estimate:view`
- (division) `settings:masterdata:aebf:budget:view`
- (division) `settings:masterdata:aebf:forecast:view`
- (global) `settings:masterdata:aebf:workflow:view` — open workflow documentation tab

**AEBF common controls**
- (division) `settings:masterdata:aebf:search` — global search
- (division) `settings:masterdata:aebf:filters:view` — open filter dropdowns
- (division) `settings:masterdata:aebf:refresh` — reload data
- (division) `settings:masterdata:aebf:export` — export data (Excel/CSV style via `/api/aebf/export`)

**AEBF file analysis + uploads**
- (division) `settings:masterdata:aebf:file:analyze` — analyze uploaded file (`/api/aebf/analyze-file`)
- (division) `settings:masterdata:aebf:actual:file:upload` — upload actual (`/api/aebf/upload-actual`)
- (division) `settings:masterdata:aebf:budget:file:upload` — upload budget (`/api/aebf/upload-budget`)

**AEBF Estimate actions**
- (division) `settings:masterdata:aebf:estimate:calculate` — calculate estimates (`/api/aebf/calculate-estimate`)
- (division) `settings:masterdata:aebf:estimate:save` — save estimates (`/api/aebf/save-estimate`)
- (division) `settings:masterdata:aebf:estimate:clear` — clear existing estimates (`/api/aebf/clear-estimates`)

**AEBF Budget actions — Excel**
- (division) `settings:masterdata:aebf:budget:year-summary:view` — load year summary (`/api/aebf/year-summary`)
- (division) `settings:masterdata:aebf:budget:delete` — delete a divisional budget year (`/api/aebf/delete-divisional-budget/:division/:budgetYear`)

**AEBF Budget actions — HTML forms (Sales Reps + Divisional)**
Sales Rep HTML budget:
- (division) `settings:masterdata:aebf:budget:html:sales-reps:view` — open Sales Rep HTML sub-tab
- (division) `settings:masterdata:aebf:budget:html:sales-reps:export-form` — export form (`/api/aebf/export-html-budget-form`)
- (division) `settings:masterdata:aebf:budget:html:sales-reps:import` — import HTML (`/api/aebf/import-budget-html`)
- (division) `settings:masterdata:aebf:budget:html:sales-reps:save` — save HTML draft (`/api/aebf/save-html-budget`)

Divisional HTML budget:
- (division) `settings:masterdata:aebf:budget:html:divisional:view` — open Divisional HTML sub-tab
- (division) `settings:masterdata:aebf:budget:html:divisional:export-form` — export form (`/api/aebf/export-divisional-html-budget-form`)
- (division) `settings:masterdata:aebf:budget:html:divisional:import` — import HTML (`/api/aebf/import-divisional-budget-html`)
- (division) `settings:masterdata:aebf:budget:html:divisional:save` — save divisional budget (`/api/aebf/save-divisional-budget`)

**AEBF Budget actions — Bulk import**
Bulk import is a nested module used inside Budget.
- (division) `settings:masterdata:aebf:budget:bulk-import:view`
- (division) `settings:masterdata:aebf:budget:bulk-import:upload` — upload multiple files (`/api/aebf/bulk-import`)
- (division) `settings:masterdata:aebf:budget:bulk-import:batches:view` — list batches (`/api/aebf/bulk-batches`)
- (division) `settings:masterdata:aebf:budget:bulk-import:batch:view` — view batch details (`/api/aebf/bulk-batch/:batchId`)
- (division) `settings:masterdata:aebf:budget:bulk-import:batch:export` — export merged HTML (`/api/aebf/bulk-export/:batchId`)
- (division) `settings:masterdata:aebf:budget:bulk-import:batch:finalize` — finalize/import to final tables (`/api/aebf/bulk-finalize/:batchId`)
- (division) `settings:masterdata:aebf:budget:bulk-import:batch:delete` — delete batch (`/api/aebf/bulk-batch/:batchId`)

**AEBF Forecast actions**
Forecast tab uses `/api/forecast-sales/*` endpoints:
- (division) `settings:masterdata:aebf:forecast:edit` — enable edit mode
- (division) `settings:masterdata:aebf:forecast:save` — save forecast inputs (`/api/forecast-sales/:division/:year`)
- (division) `settings:masterdata:aebf:forecast:export` — download/export forecast view

**Appearance / Themes**
- (global) `settings:appearance:view`
- (global) `settings:appearance:theme:change` — switch theme mode/preset
- (global) `settings:appearance:preset:create`
- (global) `settings:appearance:preset:load`
- (global) `settings:appearance:preset:export`
- (global) `settings:appearance:preset:import`
- (global) `settings:appearance:preset:delete`
- (global) `settings:appearance:global-default:set` — set global theme defaults

### 7.9 Currency management (Admin)
Endpoints indicate admin-only actions:
- (global) `currency:view` — see currency lists/rates
- (global) `currency:rate:add` — add a rate
- (global) `currency:rates:refresh` — refresh rates
- (global) `currency:currency:add` — add a new currency

### 7.10 Countries management (Admin)
There is a full countries service with CRUD/aliases. If there is (or will be) a UI page for it:
- (global) `countries:view`
- (global) `countries:create`
- (global) `countries:update`
- (global) `countries:delete`
- (global) `countries:alias:add`
- (global) `countries:alias:delete`

### 7.11 P&L data maintenance (Admin)
Server route indicates:
- (division) `pl:view` — view P&L data
- (division) `pl:refresh` — refresh P&L data (admin)
- (division) `pl:history:view` — view history (admin)

### 7.12 Forecast sales
Server route indicates:
- (division) `forecast-sales:view`
- (division) `forecast-sales:save`

### 7.13 Division merge rules / customer merging
Server route group is extensive:
- (division) `merge-rules:view` — view rules and suggestions
- (division) `merge-rules:scan` — scan
- (division) `merge-rules:suggestions:approve`
- (division) `merge-rules:suggestions:reject`
- (division) `merge-rules:suggestions:edit-approve`
- (division) `merge-rules:suggestions:manual-create`
- (division) `merge-rules:rules:manual-create`
- (division) `merge-rules:rules:update`
- (division) `merge-rules:rules:delete`
- (division) `merge-rules:validate`
- (division) `merge-rules:stats:view`

(These are “actions/buttons” and should be ticked explicitly, default none.)

### 7.14 User Management (the new admin page)
These are the permissions the admin must grant to other admins (or power users) who can manage users:
- (global) `users:view` — open user management UI
- (global) `users:list` — list all users
- (global) `users:create`
- (global) `users:update`
- (global) `users:delete`
- (global) `users:divisions:update` — update user divisions
- (global) `users:permissions:view` — view tick-list permissions
- (global) `users:permissions:update` — edit and save tick-list permissions

### 7.15 Backend maintenance (dangerous)
From `/api/admin/*`:
- (global) `maintenance:divisions:sync` — run sync across divisions
- (global) `maintenance:divisions:list` — list active divisions

---

## 8) Mapping permissions to UI locations + backend endpoints (examples)
This section is the “implementation binding” so nothing is missed.

### 8.1 Settings (company/divisions)
- UI: Settings → Company tab → Save
  - Permission: `settings:company:update`
  - Backend: `POST /api/settings/company`

- UI: Settings → Divisions → Save
  - Permission: `settings:divisions:update`
  - Backend: `POST /api/settings/divisions`

- UI: Settings → Divisions → Restore
  - Permission: `settings:divisions:restore`
  - Backend: `GET /api/settings/division-backups`, `POST /api/settings/restore-division`

### 8.2 Currency
- UI: CountryReference/Currency tools → Add Rate
  - Permission: `currency:rate:add`
  - Backend: `POST /api/currency/rate`

- UI: Currency tools → Refresh rates
  - Permission: `currency:rates:refresh`
  - Backend: `POST /api/currency/refresh`

### 8.3 Write-up
- UI: Dashboard → Write-Up → Generate
  - Permission: `writeup:generate`
  - Backend: none (local computation) BUT still gated as a function

- UI: Dashboard → Write-Up → Export PDF
  - Permission: `writeup:export-pdf`
  - Backend: none (local export)

### 8.4 Sales rep report export
- UI: Sales Dashboard → Rep → Report → Export
  - Permission: `sales:reps:report:export-html`
  - Backend: mostly local HTML export, but depends on already loaded datasets

- UI: Sales Dashboard → Rep → Report → Print
  - Permission: `sales:reps:report:print`
  - Backend: none (browser print)

### 8.5 Header navigation + logout
- UI: Header → Division badges
  - Permission: `nav:division:switch`
  - Backend: none

- UI: Header → Settings
  - Permission: `nav:settings:open`
  - Backend: none

- UI: Header → Logout
  - Permission: `nav:logout`
  - Backend: `POST /api/auth/logout` (or equivalent), then redirect to `/login`

### 8.6 Period selection / column configuration
- UI: Dashboard/Settings → Period/Column selector → Add Year
  - Permission: `periods:select:add-year`
  - Backend: none (client state)

- UI: Dashboard/Settings → Period/Column selector → Add Column
  - Permission: `periods:select:add-column`
  - Backend: none (client state)

- UI: Dashboard/Settings → Period/Column selector → Multi-month range
  - Permission: `periods:select:multi-month:toggle`
  - Backend: none

- UI: Dashboard/Settings → Period/Column selector → Generate
  - Permission: `periods:select:generate`
  - Backend: none (client state), triggers dashboard generation

- UI: Dashboard/Settings → Period/Column selector → Save as Standard
  - Permission: `periods:select:save-standard`
  - Backend: whatever endpoint persists the standard selection

- UI: Dashboard/Settings → Period/Column selector → Save Preferences
  - Permission: `periods:select:save-preferences`
  - Backend: whatever endpoint persists user preferences

### 8.7 Divisional export (all charts)
- UI: Dashboard → Divisional area → Export all charts/tables (HTML)
  - Permission: `divisional:export:charts-html`
  - Backend: none (local HTML generation)

---

## 9) Admin User Management Page (detailed UX)
Location:
- Settings → new tab: **Users**

### 9.1 User list screen
Table columns:
- Email
- Name
- Role
- Status (active/disabled)
- Divisions count
- Permissions count
- Actions: Edit / Disable / Delete (each requires separate permission)

### 9.2 Edit User screen (drawer/modal)
Sections:
1) Profile
- Name
- Email
- Role

2) Divisions
- Checklist of divisions *(fetched dynamically from `company_settings.divisions`)*

3) Permissions (your tick list)
- Render catalog grouped by `group` and by **scope**:
  - Navigation
  - Dashboard
  - Divisional Dashboard
  - Sales Dashboard
  - Write-Up
  - Settings
  - Master Data / Merge Rules
  - Currency / Countries
  - Admin Maintenance

Division-wise permission UI (required):
- Provide a selector:
  - “All divisions (global grants)”
  - *(divisions fetched dynamically from API)*
- When "All divisions" is selected, you are editing **global permissions**.
- When a specific division is selected, you are editing **division permissions** for that division.

**Important:** Division list must be fetched from `/api/settings/divisions`, never hardcoded.

This supports:
- Common users (grant globally)
- Division-specific users (grant only on specific divisions)

Controls:
- Search box to filter permissions
- “Select all in group” (optional, but useful)
- Save button

**Default state for new users:** no permissions checked.

---

## 10) Implementation phases (recommended)

### Phase 0 — Fix Hardcoded Divisions (PREREQUISITE)
Before implementing permissions, fix all hardcoded division references:

1. **Create migration to remove CHECK constraints:**
   - File: `server/migrations/010_remove_hardcoded_division_constraints.sql`
   - Drop `user_divisions_division_check` constraint
   - Drop `chk_div_budget_division` constraint (if exists)

2. **Fix frontend hardcoded arrays:**
   - `src/contexts/SalesDataContext.js` → fetch from API
   - `src/components/dashboard/MaterialPercentageManager.jsx` → fetch from API
   - `src/components/dashboard/ProductGroupPricingManager.jsx` → fetch from API

3. **Fix backend hardcoded config:**
   - `server/database/divisionDatabaseConfig.js` → query `company_settings`

4. **Fix default fallbacks:**
   - Remove `return 'FP'` fallbacks in normalization utils

### Phase A — Security prerequisites
- Protect `/api/admin/*` routes with admin auth.
- Ensure `/settings` route is enforced as admin-only (or permission-based `settings:view`).

### Phase B — Permission infrastructure
- DB migration for `permissions` + `user_permissions` + `permission_audit_log`.
- Seed the permission catalog (the list above).
- Backend middleware `requirePermission`.

Catalog sync step (for auto-expansion):
- Add a backend catalog source (JSON/JS) and an upsert step on startup or via admin endpoint.

### Phase C — Admin user management UI
- Add Users tab.
- Wire to new admin endpoints.

### Phase D — Enforce permissions across app
- Dashboard cards
- Divisional cards
- Sales module
- Exports
- Settings tabs
- Merge rules

### Phase E — JS refactor + formatting (recommended, to keep implementation clean)
Because this project has many UI “surfaces” inside a small number of routes, permission enforcement will touch many components. To keep the code maintainable, do these refactors while implementing permissions (not afterwards):

**Frontend refactor (React)**
- Centralize permission keys in one place (recommended): `src/auth/permissionKeys.js` (or `src/permissions/keys.js`).
- Add a single helper API and use it everywhere:
  - `hasPermission(key, { division })`
  - `requireAll([keys...])` / `requireAny([keys...])` helpers if needed for compound UI surfaces.
- Add a small wrapper component to avoid repeating `if (!hasPermission(...)) return null;` patterns:
  - `PermissionGate` (renders children only when allowed).
- Refactor repeated “export button” gating to a shared export-actions wrapper instead of duplicating checks in each report.

**Backend refactor (Express)**
- Centralize permission checks in middleware: `requirePermission(key, { scope, getDivision })`.
- Centralize “division resolution” to one helper (params/query/body/header), so endpoints behave consistently.
- Refactor routes so every data-changing endpoint has a single, obvious `requirePermission(...)` close to the route definition.

**Formatting / consistency**
- Keep files consistently formatted and import ordering stable while touching many components.
- Recommended tooling (optional but strongly suggested): add Prettier so formatting is deterministic across contributors.
  - Add dev deps: `prettier`, `eslint-config-prettier`.
  - Add scripts: `npm run format` and `npm run format:check`.
  - Add `.prettierrc` + `.prettierignore`.

This is intentionally included in the plan so the permission rollout doesn’t leave the codebase harder to maintain.

---

## 11) Acceptance checklist (what you can approve)
- [ ] Default is deny: new user sees nothing except login
- [ ] Admin can tick permissions and save
- [ ] UI hides unauthorized pages/buttons
- [ ] Backend blocks unauthorized API calls (403)
- [ ] Division access + permission access both enforced
- [ ] `/api/admin/*` is protected
- [ ] No hardcoded division lists (all dynamic from `company_settings`)
- [ ] Audit log records permission changes (who granted what to whom)

---

## 12) Open questions (only if you want to decide now)
1) Should **Settings** remain strictly admin-only, or should it be permission-based (e.g. allow non-admin to edit only their theme/preferences)?
2) Do you want **role defaults** (admin convenience), or pure per-user tick lists only?
3) Should exports be permissioned separately per module (recommended), or one global `export:any`?
4) For division-scoped permissions, do you want a global grant to mean "all divisions" (recommended), or do you want the admin to tick each division separately?

---

## 13) Future ERP Roles (from flex_pack_erp_guide.txt)

The ERP guide defines these roles for future modules. Current system has only 3 (`admin`, `sales_manager`, `sales_rep`).

| Role | When Needed | Module |
|------|-------------|--------|
| `production_manager` | Phase 5-6 | MRP, Scheduling, MES |
| `quality_manager` | Phase 6 | Quality Control, CAPA |
| `operator` | Phase 6 | MES (shop floor) |
| `bu_manager` | Phase 4+ | Business Unit management |

**Recommendation:** Don't add these roles now. The permission system makes roles less critical — permissions are the primary access control. Add roles when their modules are built.

---

## 14) Audit Logging (Required by ERP Guide)

The flex_pack guide requires `audit_log` table. Add this for permission changes:

```sql
-- Migration: 011_add_permission_audit_log.sql
CREATE TABLE IF NOT EXISTS permission_audit_log (
    id SERIAL PRIMARY KEY,
    admin_user_id INTEGER NOT NULL REFERENCES users(id),
    target_user_id INTEGER NOT NULL REFERENCES users(id),
    action VARCHAR(50) NOT NULL, -- 'grant', 'revoke', 'bulk_update'
    permission_key VARCHAR(100),
    division_code VARCHAR(50),
    old_value JSONB,
    new_value JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_permission_audit_admin ON permission_audit_log(admin_user_id);
CREATE INDEX idx_permission_audit_target ON permission_audit_log(target_user_id);
CREATE INDEX idx_permission_audit_created ON permission_audit_log(created_at);
```

This enables:
- "Who gave User X access to AEBF uploads?"
- "What permissions did Admin Y change last week?"
- Compliance/security auditing
