# ProPackHub 26.2 — Full Audit & Enhancement Plan

> **Date:** March 4, 2026 (Updated: March 5, 2026)  
> **Auditor:** AI Agent (GitHub Copilot)  
> **Scope:** Full application audit — server, frontend, tests, security, performance, missing features  
> **Status:** A1 bugs FIXED. A2 dead code FIXED. Enhancements pending.

---

## Table of Contents

1. [Part A — Issues & Fixes Required](#part-a--issues--fixes-required)
   - [A1. Bugs Introduced During Phase 6](#a1-bugs-introduced-during-phase-6)
   - [A2. Dead Code Created During Phase 6](#a2-dead-code-created-during-phase-6)
   - [A3. Test Quality Crisis (81% Fake Tests)](#a3-test-quality-crisis-81-fake-tests)
   - [A4. Critical Security Issues (Pre-existing)](#a4-critical-security-issues-pre-existing)
   - [A5. Frontend Performance Issues (Pre-existing)](#a5-frontend-performance-issues-pre-existing)
   - [A6. Server Architecture Issues (Pre-existing)](#a6-server-architecture-issues-pre-existing)
   - [A7. API Route Issues](#a7-api-route-issues)
2. [Part B — Enhancement Proposals](#part-b--enhancement-proposals)
   - [B1. Tier 1 — High Business Impact](#b1-tier-1--high-business-impact)
   - [B2. Tier 2 — Competitive Differentiators](#b2-tier-2--competitive-differentiators)
   - [B3. Tier 3 — Operational Efficiency](#b3-tier-3--operational-efficiency)
   - [B4. Tier 4 — Quality & Compliance](#b4-tier-4--quality--compliance)
   - [B5. UX Quick Wins](#b5-ux-quick-wins)
   - [B6. Architecture Enhancements](#b6-architecture-enhancements)
3. [Part C — Current Feature Inventory](#part-c--current-feature-inventory)
4. [Part D — Recommended Execution Order](#part-d--recommended-execution-order)

---

## Part A — Issues & Fixes Required

### A1. Bugs Introduced During Phase 6

These are bugs I introduced during the CRM-MES integration work. **ALL FIXED on March 5, 2026.**

| # | Severity | File | Line | Bug Description | Root Cause | Status |
|---|----------|------|------|-----------------|------------|--------|
| 1 | **CRITICAL** | `server/routes/mes/presales/orders.js` | L92 | `notifyUsers()` called with wrong 4-argument signature — passes a string payload instead of an object. **Notifications silently failed.** | Copied notification call from a different service without checking the expected signature of `notifyUsers()` | **✅ FIXED** — Changed to `notifyUsers(userIds, { type, title, message, link, referenceType, referenceId })` |
| 2 | **CRITICAL** | `server/routes/mes/presales/proforma.js` | L244 | `notifyRoleUsers()` called with wrong signature. **Production team never got "Order Confirmed" notifications.** | Same as above — wrong parameter format | **✅ FIXED** — Changed to `notifyRoleUsers(roles, { type, title, message, link, referenceType, referenceId })` |
| 3 | **HIGH** | `server/routes/mes/presales/quotations.js` | L163 | `parseFloat(undefined) ?? fallback` — `parseFloat(undefined)` returns `NaN`, and `NaN ?? fallback` does NOT trigger `??` because NaN is not null/undefined. **estimation_data fields got NaN values.** | Misunderstanding of nullish coalescing — `??` only catches `null`/`undefined`, not `NaN` | **✅ FIXED** — Added `safeFloat(v, fallback)` helper using explicit `isNaN()` check |
| 4 | **CRITICAL** | `server/routes/mes/presales/preprod.js` | L86 | `notifyRoleUsers()` called with wrong 4-argument string signature. **Production team never got pre-prod sample notifications.** | Same pattern — string args instead of object payload | **✅ FIXED** — Changed to object payload signature |
| 5 | **HIGH** | `server/routes/mes/presales/procurement.js` | L115, L174, L403 | Three `notifyRoleUsers()` calls with wrong string signature. **PR creation, PR approval, and materials-available notifications all silently failed.** | Same pattern — string args instead of object payload | **✅ FIXED** — All 3 calls changed to object payload signature |

**Total: 6 broken notification calls fixed + 1 NaN data corruption bug fixed across 5 files.**

---

### A2. Dead Code Created During Phase 6

Files I created that were never imported or used anywhere. **ALL DELETED (confirmed absent March 5, 2026).**

| # | File | Size | Problem | Status |
|---|------|------|---------|--------|
| 1 | `server/services/sequenceGenerator.js` | 98 lines | **Never imported anywhere.** Was created as a shared helper for generating sequence numbers (INQ-XXXX, QT-XXXX, etc.) but never wired into any route or service. | **✅ DELETED** |
| 2 | `server/services/mesNotificationService.js` | 102 lines | **Never imported anywhere** AND had a **broken import** — referenced `../../config/logger` which doesn't exist. | **✅ DELETED** |
| 3 | `server/routes/mes/presales/qc.js` | 654 lines | **Old monolithic QC file still on disk** after splitting into `qc-analysis.js`, `qc-cse.js`, `qc-inbox.js`. Not mounted. | **✅ DELETED** |

---

### A3. Test Quality Crisis (81% Fake Tests)

**The core problem:** 29 of 36 test files (81%) define functions inline inside the test file and assert against those inline functions. They **never import any real application module.** If production code changes or breaks, these tests still pass unchanged.

#### Test Scorecard

| Metric | Value |
|--------|-------|
| Total test files | 36 |
| Files testing **real application code** | **7** (19%) |
| Files testing only inline/local functions | **29** (81%) |
| Route files with real integration tests | ~2 of 70+ (~3%) |
| Jest coverage configuration | **None** |
| E2E framework (Cypress/Playwright) | **None** |
| Property tests importing real code | **0 of 17** |

#### The 7 Real Test Files

| File | What It Tests |
|------|---------------|
| `server/tests/crm-lifecycle.test.js` | Full integration — real DB, real routes, real HTTP calls via supertest |
| `server/tests/middleware/advancedQuery.test.js` | Real `advancedQuery` middleware module |
| `server/tests/middleware/cache.test.js` | Real `cache` middleware module |
| `server/tests/middleware/correlation.test.js` | Real `correlation` middleware module |
| `server/tests/middleware/monitoring.test.js` | Real `monitoring` middleware module |
| `server/tests/middleware/pagination.test.js` | Real `pagination` middleware module |
| `server/tests/e2e/workflows.test.js` | Real auth route file (services mocked) |

#### The 29 Fake Test Files

All of these define their own functions inline and test those, never importing real code:

**Unit tests (6 files):**
- `quotationApproval.test.js` — tests a `validTransitions` object literal defined on line 15
- `dealSync.test.js` — tests a `STAGE_MAP` object literal defined on line 10
- `customerPO.test.js` — tests inline `calculateDeviation()` and `hasDeviationWarning()`
- `jobCard.test.js` — tests inline regex pattern and `determineMaterialStatus()`
- `procurement.test.js` — tests inline `processReceipt()` function
- `estimationCalc.test.js` — tests inline `filmWeight()`, `costPerSqm()`, `pouchArea()`, etc.

**Integration tests (2 files):**
- `rbacRoutes.test.js` — defines inline `isAdminOrMgmt()` and `canAccessPresales()`, never tests a real route
- `fullSalesCycle.test.js` — 346 lines testing inline `createInquiry()` and `advanceStage()`

**Property tests (17 files):**
- All 17 `*.prop.test.js` files import only `fast-check`, define functions inline, and test those copies

**Other fake tests (4 files):**
- `integration/auth.test.js` — builds inline Express endpoints
- `integration/routes.test.js` — builds inline Express endpoints
- `integration/cache.test.js` — mocks cache then tests the mock
- `performance/rateLimiter.test.js` — implements its own rate limiter inline

#### Fix Plan

1. **Extract business logic into service modules** (see B6) — this makes functions importable
2. **Rewrite tests to import real modules** — e.g., `estimationCalc.test.js` should `require('../services/estimationService')` 
3. **Add `collectCoverage: true`** to `jest.config.js` with minimum thresholds
4. **Delete or rewrite fake integration/E2E tests** — `fullSalesCycle.test.js` and `rbacRoutes.test.js` should use supertest against real routes
5. **Consider adding Playwright** for actual browser E2E testing

---

### A4. Critical Security Issues (Pre-existing)

These existed before my changes and represent significant security risks.

| # | Severity | Issue | Location | Risk | Fix |
|---|----------|-------|----------|------|-----|
| 1 | **CRITICAL** | **Plaintext passwords stored** in `initial_password` column | `server/services/authService.js` L129, L857 | If database is breached, all initial passwords are exposed in cleartext | Remove the `initial_password` column entirely. Never store plaintext passwords. If password reset is needed, generate a temporary token |
| 2 | **CRITICAL** | **10-year JWT tokens** — `.env.example` has `JWT_ACCESS_EXPIRY=3650d` | `.env.example` | A stolen token remains valid for 10 years. No practical way to revoke access | Set to `24h` max for access tokens, `7d` for refresh tokens. Implement token blacklist on logout |
| 3 | **HIGH** | **No login rate limiting** on `/api/auth/login` | `server/routes/auth.js` | Brute-force attacks can try unlimited passwords per second | Add `express-rate-limit` — max 5 attempts per 15 minutes per IP |
| 4 | **HIGH** | **JWT secret hardcoded fallback** `'dev-secret-change-in-production'` | `server/services/authService.js` | If `JWT_SECRET` env var is missing, all tokens are signed with a publicly known secret | Remove the fallback. Crash on startup if `JWT_SECRET` is not set |
| 5 | **HIGH** | **Duplicate bcrypt libraries** — both `bcrypt` and `bcryptjs` in dependencies | `package.json` | Inconsistent hashing — if one module uses `bcrypt` and another uses `bcryptjs`, password verification may fail silently | Remove `bcrypt`, keep only `bcryptjs` (pure JS, no native compilation issues) |
| 6 | **MEDIUM** | **Body parser limit 50MB** for JSON | `server/config/express.js` | Enables trivial denial-of-service — one user can send 50MB JSON payloads | Reduce to `1mb` for JSON, `10mb` for file uploads only |
| 7 | **MEDIUM** | **No `statement_timeout`** on PostgreSQL queries | `server/database/config.js` | A rogue or slow query can lock database connections forever | Add `statement_timeout: 30000` (30s) to pool config |

---

### A5. Frontend Performance Issues (Pre-existing)

These affect mobile users and sales reps in the field.

| # | Severity | Issue | Location | Impact | Fix |
|---|----------|-------|----------|--------|-----|
| 1 | **CRITICAL** | **3 mega-components >1000 lines** | `CustomerDetail.jsx` (1515), `CRMBudgetEntry.jsx` (1204), `SalesCockpit.jsx` (1187) | Slow initial render, hard to maintain, impossible to test | Split into smaller sub-components. `CustomerDetail` → `CustomerHeader`, `CustomerTabs`, `CustomerActivity`, etc. |
| 2 | **HIGH** | **CRM module has no internal lazy-loading** — 18+ components eagerly imported | `src/components/CRM/CRMModule.jsx` | Every CRM tab loads ALL CRM code upfront. A rep opening "My Customers" downloads code for Budget, Analytics, Reports, Pipeline, etc. | Use `React.lazy()` for each CRM tab/view |
| 3 | **HIGH** | **Zero `React.memo`** in CRM | All 37 CRM component files | Unnecessary re-renders on every parent state change. On mobile with complex forms, this causes visible lag | Add `React.memo` to list items (`DealCard`, `CustomerList` rows), heavy components (`SalesCockpit`, `CRMAnalytics`) |
| 4 | **HIGH** | **33/37 CRM files have no `useEffect` cleanup** | CRM component directory | Memory leaks — event listeners, timers, subscriptions never cleaned up on unmount. Over time, app slows down | Add cleanup returns to all `useEffect` hooks: `return () => { clearInterval(id); }` |
| 5 | **HIGH** | **`useApi` hook exists but never used** — 89 raw `axios` calls with manual `localStorage.getItem('auth_token')` | Throughout CRM components | Duplicated auth logic everywhere, no centralized error handling, no token refresh interception | Refactor to use the existing `useApi` hook, or create an `apiClient` axios instance with interceptors |
| 6 | **HIGH** | **No error boundaries** for CRM, Settings, Platform modules | `App.jsx` routing | One crash in any component takes down the entire app | Add `<ErrorBoundary>` wrapper per module route |
| 7 | **MEDIUM** | **All shared providers wrap ALL routes** | `App.jsx` — `ExcelDataProvider`, `SalesDataProvider`, etc. | Context evaluation overhead on every route, including non-sales modules | Move providers to only wrap the routes that need them |
| 8 | **MEDIUM** | **No default request timeout on axios** | All API calls | Requests can hang forever on bad mobile connections | Set `axios.defaults.timeout = 30000` (30s) |

---

### A6. Server Architecture Issues (Pre-existing)

| # | Severity | Issue | Location | Impact | Fix |
|---|----------|-------|----------|--------|-----|
| 1 | **HIGH** | **No `compression` middleware** | `server/config/express.js` | Every response sent uncompressed. Doubles mobile data usage and load times | `npm install compression` + `app.use(compression())` |
| 2 | **HIGH** | **No SSL/TLS on database connections** | `server/database/config.js` | Database traffic unencrypted on the network | Add `ssl: { rejectUnauthorized: false }` to pool config (or proper CA cert) |
| 3 | **HIGH** | **DB pool multiplication** — `max: 20` per pool × 8+ pool instances | `server/database/config.js` | 160+ possible connections vs PostgreSQL default limit of 100. Under load, connections will be refused | Centralize to a single pool manager with `max: 20` total, or reduce per-pool max to 5 |
| 4 | **MEDIUM** | **Graceful shutdown doesn't drain DB pools** | `server/index.js` | On restart/deploy, active queries may be interrupted | Add `pool.end()` calls in shutdown handler |
| 5 | **MEDIUM** | **No request validation middleware** | All route handlers | Input validation is ad-hoc per route. Missing validation = SQL injection risk, data corruption | Add `joi` or `zod` schema validation middleware |

---

### A7. API Route Issues

| # | Severity | Issue | Location | Fix |
|---|----------|-------|----------|-----|
| 1 | **MEDIUM** | Old `qc.js` (654 lines) still on disk after splitting | `server/routes/mes/presales/qc.js` | Delete the file |
| 2 | **LOW** | Stale JSDoc comments in `proforma.js` list endpoints that were moved to `orders.js` | `server/routes/mes/presales/proforma.js` | Update comments to reflect current endpoints |
| 3 | **LOW** | `inquiries.js` (302 lines) and `pipeline.js` (305 lines) slightly over 300-line target | `server/routes/mes/presales/` | Minor — consider extracting helper functions |

---

## Part B — Enhancement Proposals

### B1. Tier 1 — High Business Impact

These would immediately improve daily use for sales reps, estimators, and managers.

#### 1. Global Search

**Problem:** Users can't find records across modules. A sales rep looking for customer "Al Marai" must navigate to CRM → Customers, or MES → Inquiries, or check Pipeline — there's no unified search.

**Proposed Implementation:**
- Add a search bar in the app header (`Header.jsx`)
- Backend: New route `GET /api/search?q=term&modules=crm,mes,quotations`
- Search across: customers (name, code), inquiries (number, product), quotations (number), contacts (name, email), deals (title)
- Use PostgreSQL full-text search (`to_tsvector`, `to_tsquery`) for performance
- Frontend: Dropdown results grouped by module, keyboard shortcut `/` to focus
- **Estimated effort:** 3-4 days

#### 2. Calendar View for Activities

**Problem:** Sales reps log calls, meetings, and tasks with dates, but there's no calendar visualization. They can't see their week at a glance or plan visits efficiently.

**Proposed Implementation:**
- Add `CalendarView.jsx` component in CRM module
- Use `@fullcalendar/react` (MIT license) — supports month/week/day views
- Data source: existing CRM activities (calls, meetings, tasks) from `server/routes/crm/activities.js`
- Color-code by type (call = blue, meeting = green, task = orange)
- Click event → open activity detail modal
- Drag-and-drop to reschedule
- Filter by: my activities, team activities, customer
- **Estimated effort:** 2-3 days

#### 3. Production Scheduling / Gantt Chart

**Problem:** Job cards track production phases but there's no time-based visualization. Production planners can't see capacity conflicts, schedule overlaps, or delivery deadline alignment.

**Proposed Implementation:**
- Add `ProductionSchedule.jsx` in MES module
- Use `gantt-task-react` or build custom with Ant Design Timeline
- Data: job cards with start/end dates, machine assignments, status
- Features: drag to reschedule, zoom (day/week/month), machine capacity rows
- Color by status: pending (gray), in-progress (blue), delayed (red), complete (green)
- Show delivery deadline markers
- Backend: New endpoint `GET /api/mes/schedule` aggregating job cards with date ranges
- **Estimated effort:** 5-7 days

#### 4. Inventory Levels & Reorder Points

**Problem:** Stock receipts are tracked but there's no view of current stock levels, no minimum thresholds, and no reorder alerts. Procurement is reactive, not proactive.

**Proposed Implementation:**
- New database table: `inventory_levels` (material_id, current_qty, min_qty, reorder_point, unit, last_updated)
- Auto-update on stock receipt (already captured in `StockReceiptForm.jsx`)
- Auto-deduct on job card material issue
- Dashboard: `InventoryDashboard.jsx` — material list with traffic-light status (green/amber/red)
- Alert system: Auto-notify procurement when stock < reorder_point
- Backend: `GET /api/mes/inventory`, `PATCH /api/mes/inventory/:id/adjust`
- **Estimated effort:** 4-5 days

#### 5. Supplier Master & Vendor Rating

**Problem:** Supplier Purchase Orders (SPOs) exist but there's no supplier directory, no performance tracking, no vendor comparison.

**Proposed Implementation:**
- New database table: `suppliers` (name, code, contact, category, rating, lead_time_avg, quality_score)
- Link existing SPOs to supplier records
- Auto-calculate: average lead time, on-time delivery %, quality rejection rate
- Admin UI: `SupplierMaster.jsx` — CRUD with performance dashboard
- Selection helper: When creating SPO, show supplier comparison (price, lead time, rating)
- **Estimated effort:** 3-4 days

---

### B2. Tier 2 — Competitive Differentiators

#### 6. Offline / PWA with Service Worker

**Problem:** `manifest.json` exists but no service worker. Sales reps visiting customers in areas with poor connectivity can't access data.

**Proposed Implementation:**
- Install `workbox-webpack-plugin` (or Vite equivalent `vite-plugin-pwa`)
- Cache strategy: Network-first for API calls, Cache-first for static assets
- Offline data: Cache last 50 viewed customers, recent inquiries, user profile
- Show "Offline" banner when disconnected
- Queue actions (log call, create note) and sync when reconnected
- **Estimated effort:** 3-4 days

#### 7. Keyboard Shortcuts

**Problem:** Power users (estimators, QC reviewers, managers) waste time clicking through menus. No keyboard shortcuts exist.

**Proposed Implementation:**
- Use `react-hotkeys-hook` library
- Global shortcuts: `/` = search, `N` = new record, `Esc` = close modal
- Navigation: `G then C` = go to CRM, `G then M` = go to MES, `G then D` = go to Dashboard
- Table shortcuts: `J`/`K` = next/prev row, `Enter` = open, `E` = edit
- Show shortcut hints in tooltips
- Help modal: `?` to show all shortcuts
- **Estimated effort:** 2 days

#### 8. Lead Scoring

**Problem:** Prospects exist (Lead → Prospect → Converted → Inactive) but scoring is entirely manual.

**Proposed Implementation:**
- Scoring model based on weighted factors:
  - Company size (from packaging profile): 0-20 pts
  - Product fit (matching product groups): 0-20 pts
  - Engagement frequency (calls, meetings in last 30 days): 0-20 pts
  - Response time (avg days to respond to quotations): 0-20 pts
  - Industry segment relevance: 0-20 pts
- Auto-calculate score on activity log, deal update, quotation response
- Display score badge on prospect cards in pipeline
- Sort prospects by score for prioritization
- **Estimated effort:** 2-3 days

#### 9. Customer Self-Service Portal

**Problem:** Only `PublicCSEView.jsx` (token-based QC certificate view) exists. No way for customers to track their own orders.

**Proposed Implementation:**
- Separate React app or route group under `/portal`
- Customer login (email + password, separate from internal auth)
- Views: My Inquiries, My Quotations (download PDF), Order Status tracker, Delivery history
- Submit feedback directly (links to existing delivery feedback system)
- Read-only — no data modification
- Backend: New routes under `/api/portal/` with customer-scoped auth
- **Estimated effort:** 5-7 days

#### 10. Contract Management

**Problem:** After PO, there's no contract lifecycle tracking — no renewal reminders, pricing agreements, or payment terms history.

**Proposed Implementation:**
- New database table: `contracts` (customer_id, type, start_date, end_date, terms, pricing_agreement, status, renewal_reminder_days)
- Link to customer POs and quotations
- Auto-reminder notifications N days before expiry
- Contract PDF generation and storage
- Dashboard: Active contracts, expiring soon, expired
- **Estimated effort:** 3-4 days

---

### B3. Tier 3 — Operational Efficiency

#### 11. Custom Fields Framework

**Problem:** All fields are schema-locked. Admin can't add customer-specific metadata without code changes.

**Proposed Implementation:**
- Database table: `custom_field_definitions` (module, field_name, field_type, options, required, sort_order)
- Database table: `custom_field_values` (entity_type, entity_id, field_id, value)
- Admin UI: Define custom fields per module (CRM, MES)
- Render engine: Dynamically render custom fields in detail/edit forms
- Support types: text, number, date, dropdown, checkbox, multi-select
- **Estimated effort:** 5-6 days

#### 12. Visual Workflow Builder

**Problem:** SLA checker and deal sync are hardcoded. No way for admins to create automation rules.

**Proposed Implementation:**
- Visual rule builder: IF [condition] AND [condition] THEN [action]
- Conditions: status change, date threshold, field value, role
- Actions: send notification, change status, assign user, send email
- Trigger types: on-create, on-update, scheduled (daily/weekly)
- Store rules in database, evaluate in middleware
- **Estimated effort:** 7-10 days (complex)

#### 13. Webhooks

**Problem:** No way for external systems to subscribe to ProPackHub events.

**Proposed Implementation:**
- Admin UI: Register webhook URLs per event type
- Events: quotation.approved, order.created, delivery.completed, customer.created
- Delivery: POST to registered URL with event payload + signature
- Retry logic: 3 attempts with exponential backoff
- Webhook log: Show delivery status, response codes, payload
- **Estimated effort:** 3-4 days

#### 14. Campaign Management

**Problem:** No mass email/communication to customer segments.

**Proposed Implementation:**
- Customer segment builder: Filter by country, product group, status, last order date
- Email template editor (HTML with merge fields)
- Send via existing emailService.js (add bulk queue)
- Track: sent, opened, replied
- Campaign history dashboard
- **Estimated effort:** 5-6 days

#### 15. Feature Flags

**Problem:** No runtime toggle for features. Every change requires deployment.

**Proposed Implementation:**
- Database table: `feature_flags` (key, enabled, per_division, per_role, description)
- Admin UI: Toggle features on/off per division/role
- React hook: `useFeatureFlag('flag_name')` returns boolean
- Server middleware: `requireFeature('flag_name')` on routes
- **Estimated effort:** 2 days

---

### B4. Tier 4 — Quality & Compliance

#### 16. i18n / Multi-language Support

**Problem:** All UI text is hardcoded English. Limits adoption in multi-lingual markets.

**Proposed Implementation:**
- Install `react-i18next` + `i18next`
- Extract all UI strings to translation JSON files
- Default: English. Add Arabic, French as needed
- Language selector in user profile settings
- Server-side: Notification/email templates with language variants
- **Estimated effort:** 5-7 days (extraction is the bulk of work)

#### 17. Full Lot Traceability

**Problem:** Sample numbers exist but no forward/backward traceability chain for food safety recalls.

**Proposed Implementation:**
- Traceability chain: Raw material lot → Production batch → Finished goods → Customer delivery
- Database: `traceability_links` (source_type, source_id, target_type, target_id)
- UI: Traceability tree view — click any node to see upstream/downstream chain
- Recall simulation: "If material lot X is contaminated, which customers received it?"
- **Estimated effort:** 4-5 days

#### 18. Regulatory Audit Module

**Problem:** Food safety certs captured in packaging profile, but no audit schedule, corrective action tracking, or compliance dashboard.

**Proposed Implementation:**
- Audit calendar: Schedule internal/external audits (FSSC 22000, BRC, HACCP)
- Finding tracker: Log non-conformities, assign corrective actions, track closure
- Document control: Version-controlled compliance documents
- Dashboard: Audit status, open findings, overdue actions
- **Estimated effort:** 5-6 days

#### 19. Accessibility (a11y)

**Problem:** No ARIA attributes, screen reader support, or focus management.

**Proposed Implementation:**
- Add `aria-label`, `aria-describedby`, `role` attributes to interactive elements
- Keyboard focus management for modals and drawers
- Color contrast checks (WCAG AA minimum)
- Skip-to-content link
- Form error announcements for screen readers
- **Estimated effort:** 3-4 days (incremental per module)

#### 20. Knowledge Base / Help System

**Problem:** No contextual help, guided tours, or onboarding for new users.

**Proposed Implementation:**
- In-app help panel: `?` icon on each page linking to relevant docs
- Onboarding tour: First-login walkthrough using `react-joyride`
- Role-based tours: Sales rep tour vs Manager tour vs QC tour
- Help center: Searchable FAQ/articles (can be static initially)
- **Estimated effort:** 3-4 days

---

### B5. UX Quick Wins

Low-effort, high-impact improvements.

| # | Enhancement | Current State | Proposed Improvement | Effort |
|---|-------------|---------------|----------------------|--------|
| 1 | **Skeleton screens** | Only SalesCockpit uses Skeleton, rest uses `Spin` spinner | Replace spinners with content-shaped skeleton placeholders in all list/detail views | 1-2 days |
| 2 | **Global breadcrumbs** | Only in CustomerDetail | Add app-wide breadcrumb bar: Module → Section → Record | 1 day |
| 3 | **Undo on delete** | Uses Popconfirm for confirmation | Add "Undo" toast after delete (soft-delete with 10s recovery window) | 1-2 days |
| 4 | **Drag & drop uploads** | Basic file input for attachments | Add drag-and-drop zone in inquiry detail, quotation attachments | 0.5 days |
| 5 | **Inline table editing** | All editing via modals/forms | Enable inline editing for quick field updates (status, priority, assigned user) | 2-3 days |
| 6 | **Recent items** | No history tracking | Show last 10 viewed items in header dropdown for quick navigation | 1 day |
| 7 | **Saved filters** | Table filters reset on navigation | Let users save and name filter presets per table/view | 1-2 days |
| 8 | **Bulk status update** | Only bulk assign customers exists | Add multi-select checkboxes + bulk status change in inquiry board, job card list | 1-2 days |
| 9 | **Onboarding tour** | None | First-login guided tour highlighting key features per role (using react-joyride) | 1-2 days |
| 10 | **Mobile bottom nav** | Desktop sidebar only | On mobile viewport, show bottom tab bar: Home, Customers, Pipeline, Notifications, Profile | 1-2 days |

---

### B6. Architecture Enhancements

These improve code quality, testability, and long-term maintainability.

| # | Enhancement | Detail | Effort |
|---|-------------|--------|--------|
| 1 | **Extract business logic into services** | Move estimation formulas, deal sync mapping, RBAC checks, sequence generation, notification logic out of route handlers into `server/services/` modules. This makes them importable and testable. **This is the #1 prerequisite for fixing the fake test problem.** | 3-4 days |
| 2 | **Add Jest coverage config** | Add `collectCoverage: true`, `coverageThreshold: { global: { branches: 50, functions: 50, lines: 50 } }`, `coverageDirectory: 'server/coverage'` to `jest.config.js`. Fail CI if coverage drops. | 0.5 days |
| 3 | **API versioning** | All routes are unversioned (`/api/auth`). Add `/api/v1/` prefix. When breaking changes are needed, create `/api/v2/` while keeping v1 alive. | 1 day |
| 4 | **Request validation middleware** | Use `joi` or `zod` schemas to validate request bodies before they hit route handlers. Central validation = fewer bugs, consistent error responses. | 2-3 days |
| 5 | **Centralize DB pool management** | Replace 8+ independent pools with a single `PoolManager` class that has per-tenant isolation but shared connection limits. Prevents the 160+ connection explosion. | 1-2 days |
| 6 | **Add service worker for PWA** | `manifest.json` exists. Add `vite-plugin-pwa` with workbox for offline caching of static assets and recent data. | 1-2 days |
| 7 | **Upgrade to WebSocket** | SSE (Server-Sent Events) is one-directional. WebSocket enables bi-directional real-time features like live collaboration or typing indicators on shared records. | 2-3 days |
| 8 | **Add E2E test framework** | Add Playwright for browser-based end-to-end testing. Start with critical paths: login → view customer → create inquiry → submit quotation. | 2-3 days |

---

## Part C — Current Feature Inventory

### What Already Exists (Strengths)

| Category | Features |
|----------|----------|
| **CRM** | Customer management, contact management, deal pipeline (Kanban), prospect lifecycle, activity logging (calls/meetings/tasks), packaging profile, notes, risk alerts, churn prediction (AI), analytics, reports, budget entry, product groups, sales rep management, customer map view (Leaflet + clustering + heatmap), quick-log FAB, daily activity summary |
| **MES Pre-Sales** | Inquiry capture → QC → Estimation → Quotation → Proforma → Customer PO → Job Card → Procurement → Pre-prod samples → Clearance → Delivery feedback. Full 11-step pipeline with audit trail |
| **QC** | QC dashboard, sample analysis, CSE approval workflow (with public link), NCR management, equipment registry, test templates, batch analysis |
| **Production** | Job flow tracker, department dashboard, job card PDF generation |
| **Estimation** | Material layers, operations, overhead, margins, actuals comparison, estimation queue |
| **Procurement** | Purchase requisitions, supplier purchase orders, stock receipts |
| **Analytics / Dashboard** | 60+ dashboard components, P&L analysis, margin analysis, manufacturing costs, budget vs actual waterfall, sales by country/customer/rep/product group, KPI executive summary, AI learning dashboard |
| **Settings** | 12-tab settings panel: periods, master data, themes (4 themes + custom), user permissions, employees (+ bulk import), territories, authorization rules, organization, database backup, divisions, deployment, org chart |
| **People / Access** | User profile, audit log, roles & permissions, org chart, sales team manager, territory manager, unified user-employee records |
| **Notifications** | Dual system: polling-based bell (admin) + SSE real-time streaming (MES). SLA breach auto-alerts |
| **Integrations** | Oracle ERP sync (with VPN), email (nodemailer SMTP), PDF export (Puppeteer), Excel export (ExcelJS) |
| **Infrastructure** | Docker + docker-compose, K8s readiness probes, Prometheus metrics, Sentry error tracking, rate limiting, request logging, caching middleware, Swagger API docs, PM2 process management |
| **Multi-tenant** | Platform admin with company management, tenant metrics, plan management |

### Common Features Checklist

| Feature | Status |
|---------|--------|
| User profile / password change | ✅ Exists |
| Audit trail / activity log | ✅ Exists |
| Export to Excel/PDF | ✅ Exists |
| Dashboard analytics / KPIs | ✅ Exists (extensive) |
| Notifications (real-time) | ✅ Exists (SSE) |
| File upload / document management | ✅ Exists |
| Email integration | ✅ Exists |
| Approval workflows | ✅ Exists (CSE, quotation, PR) |
| Dark mode / theming | ✅ Exists (4 themes + custom) |
| Print-friendly views | ✅ Exists |
| Data import (CSV/Excel) | ✅ Exists |
| Bulk operations | ✅ Exists (partial) |
| Duplicate detection | ✅ Exists (AI suggestions) |
| SLA tracking | ✅ Exists |
| Sales forecasting | ✅ Exists |
| Swagger API docs | ✅ Exists |
| Search (table-level) | ✅ Exists |
| Global search (cross-module) | ❌ Missing |
| Calendar / scheduling | ❌ Missing |
| i18n / Multi-language | ❌ Missing |
| Keyboard shortcuts | ❌ Missing |
| Offline PWA | ⚠️ Partial (manifest only) |
| Mobile-specific views | ⚠️ Partial (responsive grid only) |
| Custom fields | ❌ Missing |
| Workflow automation builder | ⚠️ Partial (coded only) |
| Webhooks | ❌ Missing |
| Campaign management | ❌ Missing |
| Contract management | ❌ Missing |
| Lead scoring | ❌ Missing |
| Customer portal | ⚠️ Partial (CSE only) |
| Knowledge base | ❌ Missing |
| Feature flags | ❌ Missing |
| Accessibility (a11y) | ❌ Missing |
| Production scheduling / Gantt | ❌ Missing |
| Full lot traceability | ⚠️ Partial (samples only) |
| Inventory management | ⚠️ Partial (receipts only) |
| Supplier master | ⚠️ Partial (SPOs only) |

---

## Part D — Recommended Execution Order

### Phase 1: Fix What's Broken (1-2 days)

| Priority | Task | Effort | Status |
|----------|------|--------|--------|
| P0 | Fix notification signatures in `orders.js`, `proforma.js`, `preprod.js`, `procurement.js` (6 calls) | 30 min | **✅ FIXED Mar 5** |
| P0 | Fix `parseFloat(undefined) ?? fallback` NaN bug in `quotations.js` | 15 min | **✅ FIXED Mar 5** |
| P0 | Delete dead code: `sequenceGenerator.js`, `mesNotificationService.js`, old `qc.js` | 15 min | **✅ DELETED** |
| P0 | Fix hardcoded JWT secret fallback — crash if missing | 15 min | Pending |
| P1 | Add login rate limiting (`express-rate-limit`) | 1 hour | Pending |
| P1 | Set JWT expiry to 24h / 7d refresh | 30 min | Pending |
| P1 | Add `compression` middleware | 15 min | Pending |
| P1 | Reduce JSON body limit to 1MB | 5 min | Pending |
| P1 | Add `statement_timeout` to DB config | 5 min | Pending |
| P1 | Remove `initial_password` column usage | 1 hour | Pending |

### Phase 2: Fix Test Foundation (3-5 days)

| Priority | Task | Effort |
|----------|------|--------|
| P1 | Extract business logic into service modules | 3 days |
| P1 | Rewrite 8 unit/integration tests to import real services | 2 days |
| P2 | Add Jest coverage configuration with thresholds | 0.5 days |
| P3 | Rewrite property tests to import real modules | 1 day |

### Phase 3: Quick-Win Enhancements (5-7 days)

| Priority | Task | Effort |
|----------|------|--------|
| P1 | Global search bar | 3-4 days |
| P2 | Keyboard shortcuts | 2 days |
| P2 | Skeleton screens (replace spinners) | 1-2 days |
| P2 | Global breadcrumbs | 1 day |
| P2 | Mobile bottom navigation | 1-2 days |
| P2 | Add error boundaries per module | 0.5 days |
| P2 | Axios timeout + interceptors | 0.5 days |

### Phase 4: High-Impact Features (10-15 days)

| Priority | Task | Effort |
|----------|------|--------|
| P2 | Calendar view for activities | 2-3 days |
| P2 | Inventory levels & reorder alerts | 4-5 days |
| P2 | Supplier master & vendor rating | 3-4 days |
| P3 | Production Gantt chart | 5-7 days |
| P3 | Feature flags system | 2 days |

### Phase 5: Advanced Features (15-25 days)

| Priority | Task | Effort |
|----------|------|--------|
| P3 | Offline PWA with service worker | 3-4 days |
| P3 | Customer self-service portal | 5-7 days |
| P3 | Contract management | 3-4 days |
| P3 | Lead scoring | 2-3 days |
| P3 | Webhooks | 3-4 days |
| P4 | i18n / multi-language | 5-7 days |
| P4 | Full lot traceability | 4-5 days |
| P4 | Visual workflow builder | 7-10 days |
| P4 | Campaign management | 5-6 days |
| P4 | Custom fields framework | 5-6 days |
| P4 | Accessibility (a11y) | 3-4 days |
| P4 | Regulatory audit module | 5-6 days |
| P4 | Knowledge base | 3-4 days |

---

### Total Estimated Effort

| Phase | Days | Cumulative |
|-------|------|------------|
| Phase 1: Fix Broken | 1-2 | 1-2 |
| Phase 2: Fix Tests | 3-5 | 4-7 |
| Phase 3: Quick Wins | 5-7 | 9-14 |
| Phase 4: High-Impact | 10-15 | 19-29 |
| Phase 5: Advanced | 15-25 | 34-54 |

**Recommended MVP scope (Phases 1-3): ~2 weeks**

---

*This document was generated from a full application audit. All file references, line numbers, and findings were verified against the codebase as of March 4, 2026.*
