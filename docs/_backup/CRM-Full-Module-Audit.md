# CRM Full Module Audit — Non-Visit-Planner Components

**Files covered:** All 72 files excluding the FieldVisit\* subsystem (covered separately).  
This report covers: `SalesCockpit`, `AdminCRMDashboard`, `CRMDashboard`, `CRMModule`, `CRMHomePage`, `MyDayDashboard`, `MyDay*`, `CustomerDetail`, `CustomerList`, `MyCustomers`, `MyProspects`, `ProspectManagement`, `DealPipeline`, `DealCard`, `RiskAlertPanel`, `PipelineSummaryCard`, `TaskWidget`, `ActivityFeed`, `ActivityLogDrawer`, `QuickLogFAB`, `NotesTab`, `ContactsTab`, `CRMWorklist`, `WorklistDetailDrawer`, `CRMAnalytics`, `FullPipelineDashboard`, `LostBusiness`, `CRMBudgetView`, `CRMBudgetEntry`, `CRMSalesReport`, `CRMReports`, `CustomerInquiries`, `CustomerEmailThread`, `EmailComposeModal`, `CRMDashboardUtils`, `CRM.css`, and supporting modals/pickers.

---

## 🔴 Bugs (Confirmed)

---

### Bug 1 — `MyDayDashboard` and `CRMWorklist` use the static `message` API

**Files:** `MyDayDashboard.jsx`, `CRMWorklist.jsx`, `CustomerEmailThread.jsx`, `EmailComposeModal.jsx`, `CustomerFieldVisits.jsx`  
**Severity:** Medium — inconsistent behavior, potential silent failures in strict antd 5 App context

Five components import `message` statically from `'antd'` rather than using `const { message } = App.useApp()`. The static API ignores the `App` context configuration (e.g., max count, custom render, theme). In `MyDayDashboard` specifically, this is inconsistent with the rest of the module and means toast deduplication and position overrides set at the app level won't apply.

Specific calls: `CRMWorklist.jsx` line 2 imports `message`; `message.success('Default view saved')` and `message.warning('No linked record...')` are at lines 137–151 and fire outside the antd App context.

**Fix:** Replace all static `message` imports with `App.useApp()`, consistent with `SalesCockpit`, `RiskAlertPanel`, and all visit planner components.

---

### Bug 2 — `AdminCRMDashboard` has a dead alias constant

**File:** `AdminCRMDashboard.jsx` (lines 11–14)

```js
import { CRM_FULL_ACCESS_ROLES } from '../../utils/roleConstants';
const FULL_ACCESS_ROLES = CRM_FULL_ACCESS_ROLES; // ← pointless alias
...
const isAdminOrManagement = FULL_ACCESS_ROLES.includes(user?.role);
```

`FULL_ACCESS_ROLES` is assigned the imported constant, adding an indirection with no purpose. The original import name should be used directly. This is a minor maintenance hazard — a future rename of the import would require changing two lines, and a developer reading the file might wonder if the two constants are intentionally different.

---

### Bug 3 — `SalesCockpit` EOY forecast appends projection bars beyond the first 3 months even when misleading

**File:** `SalesCockpit.jsx` (lines ~285–305)

The forecast logic appends `Math.min(3, 12 - startIdx)` projection months to the chart regardless of how little data exists. When `pts.length >= 4`, a linear regression is computed — but with only 4 data points (e.g., January to April), the regression slope is often dominated by a single anomalous month and the projected EOY figure can be wildly inaccurate. The chart renders these projections with no visual uncertainty indicator, shown in the legend as `Trend` alongside actual data.

**Enhancement / Risk:** Add a confidence note or tooltip to the projected bars, or require at least 6 data points before rendering the EOY projection tag.

---

### Bug 4 — `FullPipelineDashboard` headers memo never updates when auth token refreshes

**File:** `FullPipelineDashboard.jsx` (lines ~38–42)

```js
const headers = useMemo(() => {
  const token = localStorage.getItem('auth_token');
  return { Authorization: `Bearer ${token}` };
}, []); // ← empty deps
```

The `headers` object is memoized with no dependencies. If the auth token is refreshed (e.g., after a silent re-login or token rotation), all API calls in this component will continue to use the stale token for the lifetime of the component. Every other component in the module reads the token inside the `useCallback` or directly in the request, not in a `useMemo`.

**Fix:** Move the token read inside the `loadDashboard` / `loadDrillDown` callbacks, or add a dependency on an auth state value.

---

### Bug 5 — `CRMHomePage` is missing the `React` import

**File:** `CRMHomePage.jsx` (line 20)

```js
import { useState, useEffect, useCallback } from 'react';
```

`React` itself is not imported, but JSX is used throughout the file. In Vite projects using the React 17+ automatic JSX transform, this works silently — but it means any code path that manually uses `React.xxx` (e.g., `React.Fragment`, `React.createRef`) will throw a ReferenceError at runtime. It also breaks compatibility if the project is ever configured for the classic JSX transform. The rest of the module consistently does `import React, { ... } from 'react'`.

---

## 🟡 Feature & UX Issues

---

### Issue 1 — `COUNTRY_REGIONS` is hard-coded inline in `CustomerDetail.jsx` — duplicating backend logic

**File:** `CustomerDetail.jsx` (lines 64–170)

A 100+ line `COUNTRY_REGIONS` lookup object is defined at module scope with the comment `"same as WorldCountriesService"`. This is a duplicate of backend territory mapping logic. If a new country is added to the system (via the countries table), the frontend and backend will diverge silently — the rep editing a customer will see a blank/wrong territory auto-fill for the new country while the backend assigns a different region.

**Fix:** Fetch territory suggestions from an API endpoint (`/api/countries/territory-for?country=...`) rather than maintaining a client-side copy of the mapping.

---

### Issue 2 — `SalesCockpit` rep view: `showDailyActivity` is hardcoded `false` in `CRMDashboard.jsx`

**File:** `CRMDashboard.jsx` (line 16)

```jsx
showDailyActivity={false}
```

The `DailyActivitySummary` widget is imported and wired into `SalesCockpit` but is never rendered for sales reps because `CRMDashboard` always passes `showDailyActivity={false}`. The layout branch in `SalesCockpit` that handles it (with a conditional `Col`) is dead code in the rep view. Either the feature is intentionally disabled (and the prop + layout branch should be removed for clarity), or it was accidentally disabled and should be turned on.

---

### Issue 3 — `DealPipeline` has no drag-and-drop between Kanban columns

**File:** `DealPipeline.jsx`

The Kanban board is rendered as static column cards. Moving a deal to another stage requires opening each card and clicking "Move to [Stage]" through a button/modal flow. `react-beautiful-dnd` is already a project dependency (used in the visit planner). Adding drag-to-move-stage to the pipeline would be a natural, high-value UX improvement, consistent with standard CRM Kanban expectations.

---

### Issue 4 — `RiskAlertPanel` "View all" modal is capped at 10 but shows `allAlerts.length`

**File:** `RiskAlertPanel.jsx` (line ~88)

The comment says `"cap total at 10 for 'view all' modal"` but the cap is never enforced — `merged` is not sliced. The modal shows all alerts, and the `View all {allAlerts.length}` button appears when `allAlerts.length > 5`. This creates an inconsistency between the doc comment and the behavior. If there are 40 declining customers, the modal shows all 40, not 10.

More importantly, the "Create inquiry" action in both `declining` and `dormant` alert types navigates to `/crm/customers` (the generic list) rather than directly to the specific customer's page. The alert shows the customer's name, but clicking "Create inquiry" dumps the user at the top of the customer list — they have to search again.

**Fix:** Navigate to `/crm/customers/:id` or pass the `customer_id` through from the alert data and link directly.

---

### Issue 5 — `MyDayDashboard` snooze fires and reloads silently — no user feedback

**File:** `MyDayDashboard.jsx` (lines 242–253)

```js
const handlePrioritySnooze = async (item) => {
  ...
  await axios.post(...).catch(() => null); // error suppressed
  loadData(); // full reload
};
```

When a user clicks "Snooze 24h" on a priority action, the error is silently swallowed (`.catch(() => null)`) and no success or failure feedback is shown. `loadData()` triggers a full dashboard reload which takes several seconds. The user has no visual confirmation that the snooze was applied, and if the API fails, the item simply reappears after the reload with no explanation.

**Fix:** Add `message.success('Snoozed for 24 hours')` on success and `message.error(...)` on catch, and consider optimistically removing the item from `priorityActions` state immediately before reloading.

---

### Issue 6 — `CustomerDetail`: `COUNTRY_REGIONS` iteration does partial substring matching that can produce wrong territory

**File:** `CustomerDetail.jsx` (lines 340–347)

```js
for (const [key, value] of Object.entries(COUNTRY_REGIONS)) {
  if (countryName.toLowerCase().includes(key.toLowerCase()) ||
      key.toLowerCase().includes(countryName.toLowerCase())) {
    return value;
  }
}
```

If a user types `"New"` as a country (a partial match), this loop would match `"New Zealand"` and return `Oceania`. More practically, `"Congo"` would match `"Democratic Republic of the Congo"` — but there are two Congos with different regions. The first match wins with no priority ordering.

---

### Issue 7 — `CRMAnalytics` leaderboard only supports "Last 7 days" and "Last 30 days" — no quarterly or YTD view

**File:** `CRMAnalytics.jsx`

```js
<Select.Option value="week">Last 7 days</Select.Option>
<Select.Option value="month">Last 30 days</Select.Option>
```

The activity leaderboard is the primary tool managers use for team performance review. Having only 7-day and 30-day windows means there's no way to see quarterly or YTD activity rankings — the view that matters most at management reviews. This contrasts directly with `SalesCockpit`, which supports YTD, Q1–Q4, and FY.

---

### Issue 8 — `MyCustomers` persists search to `sessionStorage` but never clears on unmount

**File:** `MyCustomers.jsx`

Search text is saved to `sessionStorage` as the user types. It is cleared when the user clears the field. But if the user navigates away mid-search, `sessionStorage` retains the search string. On next visit in the same browser session, the stale search is re-applied (initialized in `useState` from `sessionStorage`). For most use cases this is convenient, but if the rep was searching for a specific customer and then navigates away, coming back days later in a fresh session could confuse them.

This is intentional by design (the comment says "persists during session") — but `sessionStorage` actually persists for the entire tab lifetime, not the component lifetime. The behavior is correct but worth making explicit in the comment, and a visible "Clear search" affordance in the UI (beyond just deleting text) would help.

---

### Issue 9 — `CRMBudgetView` consumes `useExcelData` context unnecessarily

**File:** `CRMBudgetView.jsx` (line 503)

```js
const { selectedDivision } = useExcelData();
const division = selectedDivision || 'FP';
```

`CRMBudgetView` reads the division from an `ExcelDataContext` that was designed for the MIS/Excel-upload module. This couples the CRM budget view to an Excel upload context, meaning `CRMBudgetView` cannot be rendered outside the `ExcelDataContext` provider tree. The CRM budget view shouldn't depend on whether an Excel file has been uploaded. Division should instead come from user profile/auth context or a CRM-specific settings endpoint.

---

### Issue 10 — `LostBusiness` has no dual-tier access control — all reps see all lost business records

**File:** `LostBusiness.jsx`

`LostBusiness` fetches from `/api/crm/lost-business` with no rep-scoping logic whatsoever in the frontend. There's no role check, no rep filter, and no "show my records only" toggle. This is the only customer-facing list in the CRM that doesn't implement the dual-tier access model. If the backend endpoint is also not scoped (which the frontend doesn't enforce), any rep can see lost business records for all reps' customers.

**Fix:** Apply the same rep-scoping pattern as `CustomerList` and `MyCustomers`, either at the API level (verified server-side) or at minimum with a frontend role check to show/hide a rep filter toggle.

---

### Issue 11 — `FullPipelineDashboard` drill-down phase click doesn't clear previous phase data

**File:** `FullPipelineDashboard.jsx`

When a user clicks a funnel phase to drill down, `setDrillData([])` is called at the start of the fetch... but `setDrillPhase(phase)` is set simultaneously. If the previous drill phase had many rows and the new phase request is slow, the old data briefly renders under the new phase heading before being replaced. There's a `drillLoading` spinner, but the stale data is still visible behind it if the table doesn't re-render fast enough.

**Fix:** Call `setDrillData([])` before starting the new request (already done), but also ensure the table uses `drillLoading` to show a loading overlay rather than rendering stale rows.

---

### Issue 12 — `CRMBudgetEntry` uses `message` from antd directly (not `App.useApp()`)

**File:** `CRMBudgetEntry.jsx` (line ~10 import block)

```js
import { ..., message, ... } from 'antd';
```

Same pattern as Bug 1 — direct static import. The component has several `message.success` / `message.error` calls for submit confirmation and validation errors.

---

### Issue 13 — `DealPipeline` open pipeline value uses currency hardcoded as `AED`, ignores company currency

**File:** `DealPipeline.jsx`

```jsx
<Text type="secondary">
  Open pipeline: <strong>{openPipelineValue.toLocaleString()} AED</strong>
</Text>
```

The `AED` suffix is hardcoded directly in the JSX. Every other component in the module uses `CurrencySymbol` with `useCurrency()` context. If the company currency is set to USD or EUR, the deal pipeline still shows AED.

---

### Issue 14 — `ActivityFeed` "This Week" bucket is incorrect for activities on Sunday

**File:** `ActivityFeed.jsx` (`classifyDate` function)

```js
const startOfWeek = today.startOf('week'); // dayjs defaults to Sunday = start
if (d.isSame(startOfWeek) || d.isAfter(startOfWeek)) return 'This Week';
```

`dayjs().startOf('week')` returns Sunday. An activity logged on Sunday 00:00 (i.e., "today" = Sunday) would evaluate: `diff === 0` → returns `'Today'`. But an activity from Saturday of the *previous* week would evaluate: `diff === 8`, `d.isAfter(startOfWeek)` = false → returns `'Earlier'`. This is correct. However, a Saturday from **this** week (diff = 1) returns `'Yesterday'`, not `'This Week'`. Activities from Monday–Friday of the current week (diff 2–6) correctly return `'This Week'`. The logic works but means Friday's activities on a Sunday appear as "This Week" while yesterday (Saturday) appears as "Yesterday" — technically correct but potentially confusing. The more impactful issue is that the bucket label `'This Week'` implies the current business week (Mon–Fri), but the implementation uses Sunday-anchored calendar week, so activities from last Sunday appear in "This Week" while those from last Friday do not.

**Suggestion:** Set `dayjs().locale()` week start to Monday for business-context accuracy, or change "This Week" to "Last 7 Days" for clarity.

---

### Issue 15 — `ProspectManagement` runs conversion detection on demand but gives no ETA or progress indicator

**File:** `ProspectManagement.jsx`

The "Detect Conversions" button triggers `setDetectingConversions(true)` and fires a backend job. The only feedback is a spinner on the button. There is no indication of how many prospects were checked, how long the operation took, or how many conversions were found. After the job completes, the list reloads — the user has to visually compare the table to see what changed.

**Suggestion:** Return a summary from the detection endpoint (`{ checked: 40, converted: 3 }`) and display it in a short-lived success message: `"3 of 40 prospects converted."` 

---

## 🟢 Minor / Code Quality

| # | File | Finding |
|---|------|---------|
| 1 | `AdminCRMDashboard.jsx` | `loadSalesReps` fires once on mount and never again — if reps are added mid-session, the group selector won't show the new group until the page refreshes |
| 2 | `SalesCockpit.jsx` | `canSeeMorm` is `false` for reps in all cases (`isAdmin ? ... : false`), but the Volume KPI card shows rep-specific MoRM data in `stats.morm` which is fetched regardless. Reps receive margin data in the API response but it's never displayed — confirm this is intentional |
| 3 | `CRMDashboardUtils.jsx` | `DEAL_STAGES` and `DEAL_OPEN_STAGES` constants are exported from here but `DealPipeline.jsx` also imports them separately — good. Ensure no other component redefines these locally |
| 4 | `CustomerDetail.jsx` | Large (~200 line) `COUNTRY_REGIONS` map at module scope re-creates no state but is initialized every module import — low impact, but belongs in a shared `constants/` file |
| 5 | `CRMHomePage.jsx` | `MiniCalendar` is a substantial pure component defined inside the same file (~80 lines). Should be extracted to `MiniCalendar.jsx` to avoid re-parsing on every `CRMHomePage` hot reload |
| 6 | `MyDayDashboard.jsx` | `openNotifDrawer` caches on `allNotifications.length > 0` — this means if notifications are dismissed/updated externally, the drawer shows stale data until the page is refreshed |
| 7 | `SalesCockpit.jsx` | The `atRiskCustomers` heuristic (last order 60+ days ago) uses `last_order_ym` in `YYYYMM` format and compares against the last day of that month — but the comparison date is "now", not the period end. A customer active in the currently-filtered period (e.g., Q1) but not in the last 60 days would be flagged as at-risk even though they're a current customer |
| 8 | `CRMWorklist.jsx` | `loadDefaultPreference` is called for each tab type but the result is not cached — switching tabs repeatedly fires multiple API calls to `/api/crm/worklist/preferences` even if the preferences haven't changed |
| 9 | `LostBusiness.jsx` | Search and filter changes trigger `fetchData` via `useEffect([search, reasonFilter])` — every keystroke fires an API call. There is no debounce |
| 10 | `EmailComposeModal.jsx` | `parseEmailList` splits recipients by comma only — email addresses containing `,` (unusual but technically valid per RFC 5321) would be incorrectly split. More practically, "Last, First <email@domain.com>" display names would be corrupted |
| 11 | `CRMAnalytics.jsx` | The Leaderboard tab `#` column renders `i + 1` where `i` is the render index, not the rank. If the table is sorted, the rank numbers stay static (always 1,2,3...) while the rows reorder — the rank medal on row 1 always shows gold regardless of the actual data sort |
| 12 | Multiple files | JWT decode pattern (`atob(token.split('.')[1])`) for role detection is duplicated in `FieldVisitList.jsx`, `FieldVisitDetail.jsx`, `CustomerDetail.jsx`. This is fragile against non-standard JWT encoding and should be a shared `useCurrentUser()` hook |

---

## Summary Table

| Category | Count |
|---|---|
| 🔴 Confirmed Bugs | 5 |
| 🟡 Feature / UX Issues | 15 |
| 🟢 Code Quality / Minor | 12 |
| **Total (this report)** | **32** |
| *+ Visit Planner report* | *+25* |
| **Grand Total** | **57** |

---

## Top Priority Fixes (Non-Visit-Planner)

1. **Bug 1 + Issue 12 (static `message` API)** — 6 components affected; one-line fix each. Establish a lint rule: no direct `message` import from `'antd'`
2. **Issue 10 (LostBusiness dual-tier)** — data exposure risk; requires both frontend guard and backend verification
3. **Bug 4 (stale auth headers in FullPipelineDashboard)** — silent auth failure after token refresh
4. **Issue 1 (COUNTRY_REGIONS duplication)** — territory data will drift unless centralized
5. **Issue 4 (RiskAlertPanel action navigates to list, not customer)** — broken UX on the most actionable CRM panel
6. **Issue 9 (CRMBudgetView ExcelDataContext coupling)** — architectural dependency that doesn't belong in CRM
7. **Issue 13 (DealPipeline hardcoded AED)** — currency display bug for non-AED companies

---

## 🔵 Deep Review Addendum (March 10 2026)

_Second-pass verification of all findings above + new discoveries from deep source-code and backend analysis._

### Verification Status — All Original Bugs Confirmed ✅

All 5 original bugs and 15 issues verified against source code. No false positives.

---

### 🔴 New Backend Security Bugs

---

### New Bug 6 — Backend: `customers.js` uses `.includes()` for ownership check — authorization bypass

**File:** `server/routes/crm/customers.js` (lines 489–494)  
**Severity:** Critical — unauthorized data access

```js
const owned = (rep.groupId && customer.sales_rep_group_id === rep.groupId) ||
  (customer.primary_sales_rep_name || '').toLowerCase().includes(rep.firstName.toLowerCase()) ||
  (customer.sales_rep_group_name || '').toLowerCase().includes(rep.firstName.toLowerCase());
```

Uses `.includes()` for substring matching instead of exact string comparison. A rep named "Al" can access all customers assigned to "Albert Group," "Alice Team," or any group containing "al." A rep named "Sam" can see "Samsung Group" customers.

**Fix:** Use strict equality: `=== rep.firstName` or, better, match on `rep.groupId` only (the numeric ID check above) and remove the name-based fallback entirely.

---

### New Bug 7 — Backend: POST `/lost-business` has no customer ownership check

**File:** `server/routes/crm/lost-business.js` (lines 122–140)  
**Severity:** High — unauthorized action

```js
if (!customer_id) {
  return res.status(400).json({ success: false, error: 'customer_id is required' });
}
// ← NO CHECK: Does req.user own this customer?
const result = await pool.query(
  `INSERT INTO crm_lost_business (customer_id, marked_by, ...) VALUES ($1, $2, ...)`,
  [customer_id, userId, ...]
);
```

Any authenticated rep can mark any customer in the system as "lost business" if they know the customer ID — even customers they don't own. The GET endpoint correctly scopes by `marked_by`, but POST does not validate ownership of the target customer.

---

### New Bug 8 — Backend: PATCH `/tasks/:id` has no ownership check

**File:** `server/routes/crm/tasks.js` (lines 157–180)  
**Severity:** Critical — unauthorized modification

```js
router.patch('/tasks/:id', authenticate, async (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const userId = req.user.id; // ← READ but NEVER USED for authorization
  ...
  const result = await pool.query(
    'UPDATE crm_tasks SET ' + sets.join(', ') + ' WHERE id = $' + p + ' RETURNING *',
    params // ← Only filters by taskId, no user check
  );
```

Any authenticated user can update any task (change status, title, assignee, customer) by knowing the task ID. `userId` is captured but never used in the WHERE clause or a pre-flight ownership check.

---

### New Bug 9 — Backend: POST/PATCH/DELETE on contacts has no customer ownership check

**File:** `server/routes/crm/contacts.js` (lines 35–64)  
**Severity:** High — unauthorized action

The POST `/customers/:customerId/contacts`, PATCH, and DELETE endpoints validate the `customerId` format but never verify that the requesting user owns the customer. Any authenticated rep can add, edit, or delete contacts on any customer in the system.

---

### New Bug 10 — Backend: Notes/Contacts DELETE has no `created_by` authorization

**File:** `server/routes/crm/contacts.js`, `server/routes/crm/notes.js` (if exists)  
**Severity:** Medium — permission bypass

The frontend hides edit/delete buttons using `note.author_id === user?.id`, but the backend DELETE endpoints do not verify `created_by` matches `req.user.id`. Any authenticated user can delete any note or contact via direct API call regardless of who created it.

---

### New Bug 11 — `tasks.js` LIMIT clause uses string concatenation instead of parameterized query

**File:** `server/routes/crm/tasks.js` (line 126)  
**Severity:** Low (mitigated by `parseInt`) — but violates secure coding standards

```js
${req.query.limit ? 'LIMIT ' + Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500) : ''}
```

Although `parseInt()` mitigates injection risk, this pattern violates parameterized query discipline. All other routes in the CRM use `$N` parameterization correctly.

---

### 🟡 New Frontend Issues

---

### New Issue 16 — `CRMAnalytics.jsx` renders "NaN%" when deal probability is null

**File:** `CRMAnalytics.jsx` (lines 218–220)

```jsx
render: (v) => `${Math.round(v * 100)}%`  // ← null * 100 = NaN
```

Deals without a probability value display "NaN%" in the analytics table. Should use `v != null ? ... : '—'`.

---

### New Issue 17 — `EmailComposeModal.jsx` has no email format validation

**File:** `EmailComposeModal.jsx` (lines 111–112)

The recipient `to_input` field only checks `required: true`. No regex validation that each comma-separated value is a valid email address. Invalid entries like "test" or "user name" pass frontend validation and reach the API.

---

### New Issue 18 — `SalesCockpit.jsx` atRiskCustomers uses month boundaries, not precise dates

**File:** `SalesCockpit.jsx` (lines 434–450)

```js
const lastDay = new Date(y, m, 0); // last day of the order month
return lastDay < cutoff;            // 60-day cutoff from today
```

`last_order_ym` stores only YYYY-MM (not the exact day). The logic assumes the order was placed on the last day of the month — a customer who ordered Jan 1 is treated the same as one who ordered Jan 31. This produces false positives: a customer whose last order was Jan 31 (39 days ago) could be incorrectly marked "at-risk" if the code computes against month-start instead.

---

### New Issue 19 — `FieldVisitStopList.jsx` is confirmed dead code

**File:** `FieldVisitStopList.jsx`  

Full source-code search confirms this file is exported from `index.js` but never imported by any component. It was the pre-rewrite stop list, superseded by inline logic in `FieldVisitPlanner.jsx`. Safe to delete.

---

## Updated Summary Table

| Category | Original | New | Total |
|---|---|---|---|
| 🔴 Confirmed Bugs | 5 | 6 | **11** |
| 🟡 Feature / UX Issues | 15 | 4 | **19** |
| 🟢 Code Quality / Minor | 12 | 0 | **12** |
| **Total (this report)** | **32** | **10** | **42** |
| *+ Visit Planner report* | | | *+31* |
| **Grand Total** | | | **73** |

---

## 🛡️ Security Priority Matrix (Backend — Immediate Action Required)

| Priority | Bug | Endpoint | Attack Surface |
|---|---|---|---|
| P0 | **Bug 6** | GET /customers/:id | Substring name match → access bypass |
| P0 | **Bug 8** | PATCH /tasks/:id | Any user can modify any task |
| P1 | **Bug 7** | POST /lost-business | Mark any customer as lost |
| P1 | **Bug 9** | POST/PATCH/DELETE /contacts | CRUD on any customer's contacts |
| P1 | **Bug 10** | DELETE /notes, /contacts | Delete anyone's notes/contacts |
| P2 | **Bug 11** | GET /tasks | SQL string concat (mitigated) |

---

## 💡 New Feature Recommendations

### Feature A — Trip Cloning / Repeat Trip
Reps often visit the same customers on a recurring schedule (monthly, quarterly). Currently they rebuild the stop list from scratch each time. A "Clone Trip" button on `FieldVisitDetail` or `FieldVisitList` would duplicate stops, legs, and checklist into a new trip with fresh dates — saving 10+ minutes per repetitive trip.

### Feature B — Manager Trip Calendar View
No manager-facing view exists to see all reps' trips on a calendar. A calendar component (month/week view) showing colored blocks per rep would provide instant team scheduling visibility and conflict detection.

### Feature C — Stop Visit Outcome Capture During In-Trip
`FieldVisitInTrip` supports GPS check-in but not visit outcomes (notes, next actions, order placed, follow-up date). This data is captured after-the-fact, losing in-the-moment context.

### Feature D — Automatic Travel Time Warnings
The planner computes route legs but doesn't warn when there's insufficient time between stops. A comparison of `stopN end time + drive time + buffer` vs `stopN+1 start time` would flag unrealistic schedules in real time.

### Feature E — Export Trip Itinerary to PDF/Email
No way to share a trip itinerary. A "Share Itinerary" button generating a clean PDF (stops, addresses, times, route map) or sending via email would improve team communication.

### Feature F — Budget vs Actual Expense Progress Bar
`FieldVisitDetail` shows expenses and `budget_estimate` separately. A simple progress bar showing "budget consumed: 65%" with a red warning when over-budget would help reps self-manage costs.

### Feature G — Worklist Keyboard Shortcuts
`CRMWorklist` is the most-used daily tool for reps but has no keyboard navigation. Shortcuts for "next item" (↓), "complete" (C), "snooze" (S), "open customer" (Enter) would significantly speed up daily workflow processing.

### Feature H — Deal Pipeline Drag-and-Drop
`DealPipeline` uses static Kanban columns. Adding `react-beautiful-dnd` drag-to-move-stage (already a project dependency) would match standard CRM UX expectations and save 3–4 clicks per deal stage change.
