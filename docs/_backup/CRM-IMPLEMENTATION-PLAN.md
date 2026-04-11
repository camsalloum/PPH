# CRM Audit — Implementation Plan

**Created:** March 10, 2026  
**Source:** `CRM-VisitPlanner-Audit.md` (31 findings) + `CRM-Full-Module-Audit.md` (42 findings) = **73 total**  
**Approach:** Fix in 5 phases, ordered by risk and user impact. Each item references the audit file and finding number.

---

## Phase 1 — Backend Security (P0 / P1) 🔴

> **Goal:** Close all authorization and injection gaps. No feature work until these are shipped.

| # | Audit Ref | File | Task | Effort |
|---|-----------|------|------|--------|
| 1.1 | Full#Bug6 | `server/routes/crm/customers.js` (L489) | Replace `.includes()` substring name match with exact `=` match or compare by `assigned_rep_id`. Currently rep "Al" can access "Albert Group" customers. | S |
| 1.2 | Full#Bug8 | `server/routes/crm/tasks.js` PATCH (L145) | Add `WHERE user_id = $N` ownership clause. Currently any authenticated user can modify any task. | S |
| 1.3 | Full#Bug7 | `server/routes/crm/lost-business.js` POST (L80) | Add customer ownership check before INSERT — verify `customer.assigned_rep = userId` or user is admin. | S |
| 1.4 | Full#Bug9 | `server/routes/crm/contacts.js` POST/PATCH/DELETE | Add customer ownership verification on all three operations. Currently any rep can CRUD any customer's contacts. | M |
| 1.5 | Full#Bug10 | `server/routes/crm/contacts.js`, `notes.js` DELETE | Add `created_by` check — only the author or admin can delete a note/contact. | S |
| 1.6 | VP#Bug7 | `server/routes/crm/field-trips.js` PATCH (L522) | Add `VALID_TRANSITIONS` map. Block invalid status jumps (e.g., planning → completed). | S |
| 1.7 | Full#Bug11 | `server/routes/crm/tasks.js` GET (L126) | Replace string-concat LIMIT with parameterized `$N`. Already mitigated by `parseInt` but violates secure coding standards. | S |
| 1.8 | VP#Bug8 | `server/routes/crm/field-trips.js` POST (L293) | Add `stops.length <= 50` guard to prevent resource exhaustion on trip creation. | S |

**Estimated effort:** 1–2 days  
**Testing:** Write integration tests for each endpoint verifying that unauthorized access returns 403.

---

## Phase 2 — Data Integrity & Silent Failures 🟠

> **Goal:** Fix bugs that cause wrong data, silent corruption, or blocked workflows.

| # | Audit Ref | File | Task | Effort |
|---|-----------|------|------|--------|
| 2.1 | VP#Bug1 | `FieldVisitPlanner.jsx` (L930) | After `autoGeocodeStop` resolves, call `persistStopCoordinates` and set `coordinates_persist_status: 'saved'`. Currently blocks trip saving for auto-geocoded stops. | M |
| 2.2 | VP#Bug2 | `FieldVisitPlanner.jsx` (L959) | Add `parseFloat(result.lat)` — currently only `lng` is cast. | S |
| 2.3 | VP#Bug3 | `FieldVisitPlanner.jsx` (L667) | In `optimizeGroup`, track whether any distance was computed. If not, preserve original position instead of defaulting to index 0. | M |
| 2.4 | VP#Bug4 | `FieldVisitPlanner.jsx` (L1950) | Fix review step badge: use `stops.indexOf(s) + 1` instead of filtered `idx + 1`. | S |
| 2.5 | VP#Issue8 | `FieldVisitPlanner.jsx` (L830) | Move `autoGeocodeStop` calls outside `setStops` callback. Use `useEffect` or `setTimeout(…, 0)` to avoid nested setState. | M |
| 2.6 | VP#Bug11 | `FieldVisitPlanner.jsx` | Add `beforeunload` handler when `stops.length > 0` to prevent silent data loss on back-nav/refresh. | S |
| 2.7 | VP#Bug9 | `FieldVisitInTrip.jsx` (L97) | Use UTC-normalized date comparison or `dayjs.utc()` for today's stops filter to fix timezone mismatch. | S |
| 2.8 | VP#Bug10 | `FieldVisitInTrip.jsx` `markArrived` | Validate `stop.visit_date === today` before allowing check-in. Add same check in backend POST `/check-in`. | S |
| 2.9 | VP#Issue12 | `FieldVisitMap.jsx` | Extract shared `hasValidCoordinates()` to `fieldVisitUtils.js`. Use in both Map and Planner to eliminate legacy-placeholder mismatch. | S |
| 2.10 | Full#Bug1 | Multiple files | Replace `import { message } from 'antd'` with `const { message } = App.useApp()` in `FieldVisitRouteView.jsx`, `CRMBudgetEntry.jsx`, and any other offenders. | S |
| 2.11 | Full#Bug2 | `AdminCRMDashboard.jsx` (L155) | Add null guard: `const repIds = (selectedReps \|\| []).map(...)`. | S |
| 2.12 | Full#Bug3 | `CRMHomePage.jsx` (L41) | Wrap `.toFixed(1)` call: `{Number(r.probability) ? (r.probability * 100).toFixed(1) : '0'}%`. | S |
| 2.13 | Full#Bug4 | `SalesCockpit.jsx` (L286) | Replace `.startOf('month')` with `.endOf('month').add(1,'day')` to fix month-boundary date comparison. | S |
| 2.14 | Full#Bug5 | `FieldVisitList.jsx` | Remove dead `total` / `setTotal` state. Either implement server-side pagination or document the 100-record cap. | S |

**Estimated effort:** 2–3 days  
**Testing:** For each fix, create a minimal reproduction scenario and verify the corrected behavior.

---

## Phase 3 — UX & Logic Issues 🟡

> **Goal:** Fix user-facing confusion, validation gaps, and workflow rough edges.

| # | Audit Ref | File | Task | Effort |
|---|-----------|------|------|--------|
| 3.1 | VP#Issue3 | `FieldVisitPlanner.jsx` | Reset `checklist` to `[]` when `tripType` changes to prevent hybrid local/international checklists. | S |
| 3.2 | VP#Issue4 | `FieldVisitPlanner.jsx` (L1574) | Wrap `optimizeRoute` in `modal.confirm()` with undo support (keep pre-optimize state copy). | S |
| 3.3 | VP#Issue7 | `FieldVisitPlanner.jsx` (L350) | Replace synchronous `canAdvance()` with `form.validateFields(['departure_date','return_date'])` in Next button handler. | S |
| 3.4 | VP#Issue2 | `FieldVisitLegForm.jsx` | Add `arr_datetime > dep_datetime` validator using Form `dependencies`. | S |
| 3.5 | VP#Issue5 | `FieldVisitPlanner.jsx` (L1627) | Add click-outside handler or ✕ button to dismiss map search results overlay. | S |
| 3.6 | VP#Issue11 | `FieldVisitInTrip.jsx` | Add "All Stops" tab alongside today's view, so stops without `visit_date` are visible. | M |
| 3.7 | VP#Issue1 | `FieldVisitPlanner.jsx` (L910) | Replace full prospect list fetch with `/api/crm/prospects/:id` direct lookup for pre-visit brief. | S |
| 3.8 | VP#Issue9 | `FieldVisitPlanner.jsx` `loadTemplate` | On template load, validate all `customer_id`/`prospect_id` against current lists. Alert user about missing entities. | M |
| 3.9 | VP#Issue13 | `FieldVisitKPIPanel.jsx` (L30) | Replace falsy check with `cost_per_visit != null ?` to correctly display zero values. | S |
| 3.10 | Full#Issue4 | `RiskAlertPanel.jsx` | Fix "Create inquiry" to navigate to `/crm/customers/:id` instead of generic list. | S |
| 3.11 | Full#Issue5 | `MyDayDashboard.jsx` (L242) | Add `message.success` / `message.error` feedback on snooze. Optimistically remove item before reload. | S |
| 3.12 | Full#Issue6 | `CustomerDetail.jsx` (L340) | Replace substring `includes()` for territory lookup with exact-match map. | S |
| 3.13 | Full#Issue7 | `CRMAnalytics.jsx` | Add "Quarter" and "YTD" options to leaderboard period selector. | M |
| 3.14 | Full#Issue16 | `CRMAnalytics.jsx` (L218) | Guard null probability: `v != null ? Math.round(v * 100) + '%' : '—'`. | S |
| 3.15 | Full#Issue17 | `EmailComposeModal.jsx` (L111) | Add email regex validation for each comma-separated recipient. | S |
| 3.16 | Full#Issue18 | `SalesCockpit.jsx` (L434) | Document or fix month-boundary limitation in atRiskCustomers heuristic. | S |
| 3.17 | Full#Issue13 | `DealPipeline.jsx` | Replace hardcoded `AED` with `useCurrency()` context. | S |
| 3.18 | Full#Issue14 | `ActivityFeed.jsx` | Set `dayjs` locale week start to Monday, or rename bucket to "Last 7 Days". | S |

**Estimated effort:** 3–4 days  
**Testing:** Manual QA pass through each affected screen.

---

## Phase 4 — Code Quality & Cleanup 🟢

> **Goal:** Remove dead code, reduce duplication, enforce consistency.

| # | Audit Ref | File | Task | Effort |
|---|-----------|------|------|--------|
| 4.1 | VP#Issue10 / Full#Issue19 | `FieldVisitStopList.jsx` | Delete confirmed dead file. Remove from `index.js` exports. | S |
| 4.2 | Full#CQ12 | Multiple files | Extract duplicated JWT decode (`atob(token.split('.')[1])`) into a shared `useCurrentUser()` hook. Update `FieldVisitList`, `FieldVisitDetail`, `CustomerDetail`. | M |
| 4.3 | Full#CQ5 | `CRMHomePage.jsx` | Extract inline `MiniCalendar` (~80 lines) to its own component file. | S |
| 4.4 | Full#CQ4 | `CustomerDetail.jsx` | Move `COUNTRY_REGIONS` map to `src/constants/regions.js`. | S |
| 4.5 | VP#CQ1 | `FieldVisitPlanner.jsx` | Fix `geocodeAddress` signature (takes no args but is called with one). | S |
| 4.6 | VP#CQ4 | `FieldVisitPlanner.jsx` | Replace `Date.now()` local_id generation with `crypto.randomUUID()`. | S |
| 4.7 | VP#CQ5 | `FieldVisitPlanner.jsx` / `FieldVisitMap.jsx` | Unify `GMAP_LIBS_FVP` / `LIBRARIES` into a single shared constant. | S |
| 4.8 | VP#CQ7 | `FieldVisitPlanner.jsx` | Map-click handler hardcodes `stop_type: 'prospect'` — should default to `'custom'` or let user choose. | S |
| 4.9 | Full#CQ9 | `LostBusiness.jsx` | Add debounce (300ms) to search/filter `useEffect` to prevent API calls on every keystroke. | S |
| 4.10 | Full#CQ8 | `CRMWorklist.jsx` | Cache `loadDefaultPreference` results to avoid duplicate API calls on tab switch. | S |
| 4.11 | Full#CQ11 | `CRMAnalytics.jsx` | Fix leaderboard `#` column — use rank from data, not render index `i + 1`. | S |
| 4.12 | Full#Issue9 | `CRMBudgetView.jsx` (L503) | Decouple from `useExcelData()` context — read division from user profile or CRM settings. | M |
| 4.13 | Full#Issue10 | `LostBusiness.jsx` | Add rep-scoping to lost business list (same dual-tier pattern as CustomerList). | M |
| 4.14 | Full#Issue11 | `FullPipelineDashboard.jsx` | Show loading overlay on drill-down table during fetch to prevent stale data flash. | S |
| 4.15 | Full#Issue2 | `SalesCockpit.jsx` / `CRMDashboard.jsx` | Either enable `DailyActivitySummary` for reps or remove the dead prop + layout branch. | S |

**Estimated effort:** 2–3 days  
**Testing:** Verify no regressions via existing test suite + visual QA.

---

## Phase 5 — New Features 💡

> **Goal:** High-value UX improvements. Implement after all bugs are resolved.

| # | Audit Ref | Feature | Files | Description | Effort |
|---|-----------|---------|-------|-------------|--------|
| 5.1 | VP#FeatureA | Trip Cloning | `FieldVisitList.jsx`, `FieldVisitDetail.jsx`, backend `field-trips.js` | "Clone Trip" button duplicates stops, legs, checklist into a new trip with blank dates. | L |
| 5.2 | VP#FeatureB | Manager Trip Calendar | `FieldTripCalendar.jsx`, backend `fromDate`/`toDate` params + `rep_name` join | ✅ DONE — Ant Design Calendar with colored trip blocks per day, rep legend, month nav. Route `/crm/calendar`. | L |
| 5.3 | VP#FeatureC | In-Trip Outcome Capture | `FieldVisitInTrip.jsx`, backend PATCH | After check-in, show quick form: notes, outcome type, follow-up date, order placed checkbox. | M |
| 5.4 | VP#FeatureD | Travel Time Warnings | `FieldVisitPlanner.jsx` | Compare `stop[n].end + drive_time + buffer` vs `stop[n+1].start`. Show warning badge on conflicts. | M |
| 5.5 | VP#FeatureE | Export Itinerary to PDF | `FieldVisitItineraryExport.js` | ✅ DONE — jsPDF + autoTable: header, trip info, objectives, stops, legs, expenses with totals, travel notes, page footers. PDF button in FieldVisitDetail. | L |
| 5.6 | VP#FeatureF | Budget vs Actual Widget | `FieldVisitDetail.jsx` | Progress bar showing `expenses / budget_estimate` with color coding (green/amber/red). | S |
| 5.7 | Full#FeatureG | Worklist Keyboard Shortcuts | `CRMWorklist.jsx` | ↓/↑ navigate, C = complete, S = snooze, Enter = open customer. `useHotkeys` or native `keydown`. | M |
| 5.8 | Full#FeatureH | Deal Pipeline Drag & Drop | `DealPipeline.jsx` | Add `react-beautiful-dnd` to Kanban columns. On drop, PATCH deal stage via API. | M |
| 5.9 | Full#Issue3 | Deal Pipeline Drag & Drop | `DealPipeline.jsx` | _(same as 5.8 — consolidates Issue 3 and Feature H)_ | — |
| 5.10 | Full#Issue15 | Prospect Conversion Summary | `ProspectManagement.jsx`, backend | Return `{ checked, converted }` from detection endpoint. Show summary message. | S |

**Estimated effort:** 2–3 weeks for all features.

---

## Effort Key

| Code | Meaning |
|------|---------|
| S | Small — < 1 hour, single file, straightforward |
| M | Medium — 1–4 hours, may touch 2–3 files or need testing |
| L | Large — 4+ hours, new component/endpoint, needs design decisions |

---

## Execution Order Summary

```
Phase 1 (Security)     ████████  8 items   — Do first, no exceptions
Phase 2 (Data/Bugs)    ██████████████  14 items  — Core bug fixes
Phase 3 (UX/Logic)     ██████████████████  18 items  — User-facing fixes
Phase 4 (Cleanup)      ███████████████  15 items  — Code quality
Phase 5 (Features)     ██████████  10 items  — New capabilities
                       ─────────────────────────
                       Total: 65 action items (73 findings, some merged)
```

---

## How to Track Progress

Mark items as done by changing the `#` column to ✅:

```
| ✅ | Full#Bug6 | customers.js | Fixed .includes() auth bypass | S |
```

---

## Dependencies & Risks

1. **Phase 1.1 (customers.js auth)** may break existing queries if reps rely on partial name matching — verify with production query logs before deploying.
2. **Phase 2.1 (autoGeocodeStop)** requires understanding the full geocode → persist → save flow — test with real Google Maps API responses.
3. **Phase 4.2 (useCurrentUser hook)** touches 3+ files — coordinate with any in-flight PRs on those files.
4. **Phase 5.1–5.2 (Trip Clone / Calendar)** need database schema decisions (e.g., `cloned_from_trip_id` column).
5. **Phase 5.5 (PDF Export)** needs a PDF library decision (`jspdf`, `@react-pdf/renderer`, or server-side `puppeteer`).
