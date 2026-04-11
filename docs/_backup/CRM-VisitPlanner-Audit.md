# CRM Visit Planner — Full Audit Report

**Scope:** All 72 files in the CRM module, with deep focus on the visit-planner subsystem  
(`FieldVisitPlanner`, `FieldVisitMap`, `FieldVisitLegForm`, `FieldVisitChecklistPanel`,  
`FieldVisitDetail`, `FieldVisitInTrip`, `FieldVisitList`, `FieldVisitRouteView`, `FieldVisitReport`, `FieldVisitKPIPanel`, `FieldVisitApprovalCard`)

---

## 🔴 Bugs (Confirmed)

---

### Bug 1 — `autoGeocodeStop` never sets `coordinates_persist_status`

**File:** `FieldVisitPlanner.jsx` (line 930–944)  
**Severity:** High — blocks users from saving trips

When a stop is added via the "Draft from Customers/Prospects" modal and the entity record lacks GPS data, `autoGeocodeStop` fires and resolves coordinates via the geocode API. The problem: it only sets `latitude` and `longitude`, never `coordinates_persist_status`.

```js
// BUG: no coordinates_persist_status update
updateStop(idx, { latitude: parseFloat(best.lat), longitude: parseFloat(best.lng) });
```

`hasResolvedStopCoordinates` requires `coordinates_persist_status === 'saved'` for any entity-linked stop. So even after auto-geocoding successfully, the stop remains flagged as "unresolved GPS." The orange alert persists, `unresolvedGpsCount` stays > 0, and the **Save Trip button stays disabled**.

**Fix:** After geocode resolves, call `persistStopCoordinates` and set the status — or at minimum prompt the user to confirm the auto-resolved pin before marking it saved.

---

### Bug 2 — `applyGeocode` casts `lng` but not `lat`

**File:** `FieldVisitPlanner.jsx` (lines 959–965)

```js
const applyGeocode = (result) => {
  updateStop(geocodingIdx, {
    latitude: result.lat,          // ← raw value, could be a string from API
    longitude: parseFloat(result.lng), // ← correctly parsed
```

`result.lat` is stored as whatever the geocode API returns (likely a string). This will silently store a string value in state, causing `hasValidCoordinates(lat, lng)` to pass (`Number("24.123")` is finite) but downstream operations doing arithmetic on lat will produce unexpected results if they don't re-cast.

**Fix:** `latitude: parseFloat(result.lat)`

---

### Bug 3 — `optimizeRoute` silently corrupts stop order when stops lack coordinates

**File:** `FieldVisitPlanner.jsx` (lines 667–699)  
**Severity:** Medium — data integrity issue

Inside `optimizeGroup`, `bestIdx` is initialized to `0` and `best` to `Infinity`. When the current stop has no coordinates, the `forEach` returns early on every candidate — `best` stays Infinity and `bestIdx` stays `0`. The first remaining stop is then always chosen as "nearest."

```js
let bestIdx = 0, best = Infinity;
remaining.forEach((c, i) => {
  if (!hasCoord(cur) || !hasCoord(c)) return; // ← skips all; bestIdx stays 0
  ...
});
ordered.push(remaining.splice(bestIdx, 1)[0]); // always splices index 0
```

In a mixed group (some stops with coords, some without), this produces an incorrect ordering without any warning to the user. The success toast `"Route optimized (nearest-neighbor per day)."` fires unconditionally.

**Fix:** Track whether any distance was computed in the loop. If none was, preserve the stop's current position rather than defaulting to index 0.

---

### Bug 4 — Review step stop badge numbers show filtered index, not original order

**File:** `FieldVisitPlanner.jsx` (lines 1950–1970)  
**Severity:** Medium — misleading UI

When `reviewShowUnsavedOnly` is toggled on in Step 2:

```js
(reviewShowUnsavedOnly
  ? stops.filter(s => !hasResolvedStopCoordinates(s))
  : stops
).map((s, idx) => {
  ...
  <Badge count={idx + 1} ... />  // ← relative to filtered array
```

If original stops are `[1, 2, 3, 4, 5]` and only stops 3 and 5 are unresolved, they render with badges showing `#1` and `#2` instead of `#3` and `#5`. This makes it impossible to correlate the issue list with the stop editor in Step 1.

**Fix:**
```js
const originalIdx = stops.indexOf(s);
<Badge count={originalIdx + 1} ... />
```

---

### Bug 5 — `FieldVisitRouteView` uses deprecated static `message` API

**File:** `FieldVisitRouteView.jsx` (line 2)  
**Severity:** Low — silent failures possible in strict antd App contexts

```js
import { ..., message } from 'antd'; // ← static API
```

All other CRM components use `const { message } = App.useApp()`. The static API bypasses the antd `App` context, meaning message config (duration, maxCount, etc.) set at the app level won't apply here, and in some versions of antd 5 this will throw a warning or fail silently.

**Fix:** Replace with `App.useApp()` pattern consistent with the rest of the module.

---

### Bug 6 — `FieldVisitList` has dead `total` state, pagination total is always 0

**File:** `FieldVisitList.jsx` (lines 52–53, 72)

`total` is initialized to `0` and `setTotal` is never called. The Pagination component correctly uses `total={filteredItems.length}` so rendering is fine, but the `total` state variable and `setTotal` are completely unused — a leftover from an incomplete server-side pagination refactor. More importantly, the API call always fetches `limit: 100`, meaning trips 101+ are silently excluded.

**Fix:** Either implement proper server-side pagination with page/limit params, or remove the dead state variables and document the 100-record ceiling clearly.

---

## 🟡 Feature & UX Issues

---

### Issue 1 — Pre-visit brief for prospects fetches the entire prospect list

**File:** `FieldVisitPlanner.jsx` (lines 910–921)

```js
const prospRes = await axios.get(`${API_BASE}/api/crm/my-prospects`, { headers: getAuthHeaders() });
const p = (prospRes.data?.data?.prospects || []).find(p => Number(p.id) === Number(stop.prospect_id));
```

This fetches the full prospect list to find one record. If a rep has hundreds of prospects, this is an unnecessary payload on every "Pre-Visit Brief" click for a prospect stop. A direct `/api/crm/prospects/:id` endpoint should be used instead.

---

### Issue 2 — `FieldVisitLegForm` has no arrival-before-departure validation

**File:** `FieldVisitLegForm.jsx`

The leg form accepts `dep_datetime` and `arr_datetime` as free DatePicker values with no cross-field validation. A user can set an arrival time before departure (e.g. overnight flights from a different timezone, or simple data entry errors) with no warning. The `Form.Item` for arrival doesn't use `dependencies` or a custom validator.

**Fix:** Add a validator on `arr_datetime` that checks `> dep_datetime` when both are set.

---

### Issue 3 — Checklist state is not reset when trip type changes

**File:** `FieldVisitPlanner.jsx` / `FieldVisitChecklistPanel.jsx`

When a user fills in a local checklist (e.g., checks "Car keys", "Sample kit"), then switches `trip_type` to `international`, the `checklist` state in the planner isn't cleared. The `FieldVisitChecklistPanel` renders the international defaults but `checklist` still contains the local checked items persisted in parent state. If the user saves without re-checking international items, the saved checklist will be a hybrid of local/international items.

**Fix:** Reset `checklist` to `[]` in the `useEffect` that responds to `tripType` changes, or clearly separate local vs international checklists into distinct state slices.

---

### Issue 4 — No confirmation dialog before `optimizeRoute`

**File:** `FieldVisitPlanner.jsx` (line 1574)

Clicking "Optimize" immediately and destructively reorders all stops. There is no undo. If the user has already manually arranged stops for a specific reason (e.g., priority customers first regardless of geography), a single mis-click destroys that order.

**Fix:** Wrap in `modal.confirm(...)` with a clear warning that the current order will be replaced. Alternatively, keep a shadow copy of the pre-optimize state for one-level undo.

---

### Issue 5 — Map search results panel has no close/dismiss mechanism

**File:** `FieldVisitPlanner.jsx` (lines 1627–1650)

The search results dropdown appears as an `position: absolute` overlay on the map. The only ways to close it are:
1. Search again and get 0 results
2. Clear the input field (via the `allowClear` × button, which also clears results)

There is no explicit close button or click-outside handler (`useEffect` + `document.addEventListener`). If the user opens the results, doesn't need any of them, and wants to return to map interaction, the overlay blocks the map markers underneath.

---

### Issue 6 — `FieldVisitLegForm` has no leg reordering

**File:** `FieldVisitLegForm.jsx`

Stops have drag-and-drop reordering via `react-beautiful-dnd`. Transport legs have no equivalent — legs can only be added at the bottom or deleted. For multi-leg international trips with return segments, users who enter legs out of order must delete and re-create them.

---

### Issue 7 — `canAdvance()` in Step 0 doesn't validate return ≥ departure

**File:** `FieldVisitPlanner.jsx` (lines ~350–360)

```js
const canAdvance = () => {
  if (step === 0) {
    const vals = form.getFieldsValue(true);
    return Boolean(vals.title && vals.country_code && vals.departure_date && vals.return_date);
  }
  ...
```

The return date's `validator` (which rejects `return < departure`) only fires during `form.validateFields()`, not in this guard. So `canAdvance()` returns `true` even with an invalid date pair, allowing the user to advance to Step 1 with broken dates. The error is only surfaced at final save via `onSave → form.validateFields()`.

**Fix:** Call `form.validateFields(['departure_date', 'return_date'])` (async) in the Next button handler rather than relying on the synchronous `canAdvance()` check.

---

### Issue 8 — `autoGeocodeStop` is called with a stale index after `setStops`

**File:** `FieldVisitPlanner.jsx` (lines 830–840)

In `addDraftStops`, after `setStops(prev => {...})`, `autoGeocodeStop` is called with `offset + i` computed inside the `setStops` callback:

```js
setStops((prev) => {
  ...
  created.forEach((s, i) => {
    ...
    autoGeocodeStop(offset + i, geocodeHints[i]); // ← called inside setState callback
  });
  return newStops;
});
```

`autoGeocodeStop` calls `updateStop` which calls `setStops` again. Calling `setStops` inside another `setStops` callback is not supported in React and will cause unexpected state merge behavior. The inner `setStops` call from `updateStop` may operate on stale state.

**Fix:** Schedule the geocode calls outside the `setStops` callback using `setTimeout(..., 0)` or a `useEffect` triggered by stop count change (matching the pattern already used in `handleCreateProspect`).

---

### Issue 9 — Template loading doesn't resolve entity names; silently produces blank stops

**File:** `FieldVisitPlanner.jsx` (`loadTemplate`)

When a template is loaded, stop customer/prospect IDs are restored but names are not stored in the template. Stop cards rely on `customerMap.has(stop.customer_id)` to show a name. If the customer was reassigned, deleted, or the rep no longer has access to it, the stop card shows a blank name with no warning. The unresolved GPS count may also be artificially elevated.

**Suggestion:** When loading a template, validate that all `customer_id` / `prospect_id` values exist in the current `customers` / `prospects` lists, and alert the user about any mismatches.

---

### Issue 10 — `FieldVisitStopList.jsx` appears to be dead / orphaned code

**File:** `FieldVisitStopList.jsx`

The `FieldVisitStopList` component exists as a standalone file with its own drag-and-drop stop rendering, brief loading, and customer/prospect maps logic. However, `FieldVisitPlanner.jsx` implements all stop-list logic inline rather than delegating to this component. It is unclear whether `FieldVisitStopList` is imported anywhere or is a leftover from a refactor that was never cleaned up.

**Recommendation:** Audit imports across the module. If unused, delete. If intended as a replacement, complete the extraction refactor and delete the inline logic from the planner.

---

### Issue 11 — `FieldVisitInTrip` shows only today's stops with no way to view all

**File:** `FieldVisitInTrip.jsx`

```js
const todayStops = useMemo(() => {
  const today = dayjs().format('YYYY-MM-DD');
  return sortedStops.filter((s) => s.visit_date === today);
}, [sortedStops]);
```

If a stop has no `visit_date` assigned (which is allowed by the planner), it will never appear in `todayStops`. Stops from other days are also not reachable from the in-trip view. There should be a toggle or tab to see all trip stops, not just today's.

---

### Issue 12 — `FieldVisitMap` uses a weaker `hasValidCoordinates` than the planner

**File:** `FieldVisitMap.jsx` (vs `FieldVisitPlanner.jsx`)

Planner's version checks for three conditions:
```js
if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
if (Math.abs(nLat) < 0.0001 && Math.abs(nLng) < 0.0001) return false;
if (Math.abs(nLat - 24.0) < 0.0001 && Math.abs(nLng - 53.999) < 0.0001) return false;
```

`FieldVisitMap.jsx` only guards against `null` and `0,0` — it is missing the legacy placeholder check. It will render a marker at the legacy placeholder pin `(24.0, 53.999)` used in old imports, while the planner treats the same coordinate as invalid and shows the orange location warning. This causes the map to show a pin for a stop that the planner considers unresolved — confusing the user.

**Fix:** Share a single `hasValidCoordinates` utility function (e.g., in a `fieldVisitUtils.js` file) used by both components.

---

## 🟢 Minor / Code Quality

| # | File | Finding |
|---|------|---------|
| 1 | `FieldVisitPlanner.jsx` | `geocodeAddress` signature takes no args but is called as `geocodeAddress(geocodeQuery)` in two places — harmless but misleading |
| 2 | `FieldVisitPlanner.jsx` | `etaChain` computes `lateMins` for on-time stops too — tooltip could say "3min late" but `isLate: false` because within the 5-min tolerance window; the two values are inconsistent |
| 3 | `FieldVisitLegForm.jsx` | `booking_ref` field is shared across `flight` and `train` modes; switching mode preserves the previous booking ref silently |
| 4 | `FieldVisitPlanner.jsx` | `createStop()` generates `local_id` with `Date.now()` — when called synchronously in a tight loop (e.g. template load), two stops generated in the same millisecond differ only by `Math.random()` which is fine, but this is fragile; use `crypto.randomUUID()` instead |
| 5 | `FieldVisitPlanner.jsx` | `GMAP_LIBS_FVP = ['marker']` in Planner and `LIBRARIES = ['marker']` in Map — both call `useJsApiLoader` with the same script id `'google-map-script'`, which deduplicates fine, but the constant values should be shared from a single `const` |
| 6 | `FieldVisitList.jsx` | `userRole` is derived via JWT decode inline in the component body, identical pattern repeated in `FieldVisitDetail.jsx` — should be extracted to a shared `useCurrentUser()` hook |
| 7 | `FieldVisitPlanner.jsx` | The map click handler for "Add stop at this location?" hardcodes `stop_type: 'prospect'` — clicks on clearly-customer areas always create a "Prospect/Lead" stop, which is unexpected |

---

## Summary Table

| Category | Count |
|---|---|
| 🔴 Confirmed Bugs | 6 |
| 🟡 Feature / UX Issues | 12 |
| 🟢 Code Quality / Minor | 7 |
| **Total** | **25** |

---

## Priority Fix Order

1. **Bug 1** (autoGeocodeStop / persist_status) — blocks trip saving entirely for auto-geocoded stops  
2. **Bug 3** (optimizeRoute corruption) — silently produces wrong ordering  
3. **Bug 4** (badge index in review) — causes user confusion at the final save screen  
4. **Issue 8** (setState inside setState) — React anti-pattern, potential state corruption  
5. **Bug 2** (lat not parsed to float) — data type inconsistency  
6. **Issue 3** (checklist not reset on trip type change) — saves incorrect checklist data  
7. **Issue 12** (hasValidCoordinates mismatch) — map shows marker where planner shows warning  
8. **Bug 5** (static message API) — maintenance / silent failure risk  
9. All remaining issues — UX improvements and code quality cleanup  

---

## 🔵 Deep Review Addendum (March 10 2026)

_Second-pass verification of all findings above + new discoveries from deep source-code analysis._

### Verification Status — All Original Bugs Confirmed ✅

All 6 original bugs and 12 issues verified against source code at their stated line numbers. No false positives.

---

### New Bug 7 — Backend: No status-transition validation on PATCH /field-trips/:id

**File:** `server/routes/crm/field-trips.js` (lines 522–560)  
**Severity:** High — workflow bypass

```js
const allowedStatus = ['planning', 'confirmed', 'in_progress', 'completed', 'cancelled'];
if (status !== undefined) {
  if (!allowedStatus.includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status transition' });
  }
  sets.push(`status = $${p++}`);
  params.push(status);
}
```

The check only ensures the new status is in the allowed list — it never checks the **current** status. A trip in `planning` can jump directly to `completed`, bypassing `confirmed` and `in_progress` steps. The frontend shows status-specific buttons, but a direct API call bypasses this entirely. Approval workflows and manager sign-offs are circumvented.

**Fix:** Add a `VALID_TRANSITIONS` map and compare `current.status → new status`:
```js
const VALID_TRANSITIONS = {
  planning:    ['confirmed', 'cancelled'],
  confirmed:   ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed:   [],
  cancelled:   ['planning'],
};
if (!VALID_TRANSITIONS[current.status]?.includes(status)) {
  return res.status(400).json({ success: false, error: `Cannot transition from ${current.status} to ${status}` });
}
```

---

### New Bug 8 — Backend: No maximum stop count per trip

**File:** `server/routes/crm/field-trips.js` (lines 293–330, 630–660)  
**Severity:** Medium — resource exhaustion

The POST /field-trips endpoint and POST /:id/stops endpoint accept an `Array` of stops with no size limit. A malicious or buggy client could send a trip with thousands of stops, causing:
- Excessive database inserts in a single transaction
- Large Google Maps API payloads when computing route geometry
- Frontend render performance degradation

**Fix:** Validate `stops.length <= 50` (or a reasonable ceiling) before insertion.

---

### New Bug 9 — `FieldVisitInTrip` timezone mismatch in today's stops filter

**File:** `FieldVisitInTrip.jsx` (lines 97–98)  
**Severity:** Medium — wrong stops shown for reps in non-UTC timezones

```js
const today = dayjs().format('YYYY-MM-DD'); // ← client local timezone
return sortedStops.filter((s) => s.visit_date === today); // ← server stored date
```

`dayjs()` uses the browser's local timezone. If a rep is in UAE (UTC+4) and it's 11:30 PM, `dayjs().format('YYYY-MM-DD')` is already "March 11" while the server stored the stop as "March 10." The filter returns zero matches and the rep sees no stops. This affects all reps outside UTC but is worst for late-evening usage in UTC+ timezones.

---

### New Bug 10 — `FieldVisitInTrip` allows check-in for stops not scheduled today

**File:** `FieldVisitInTrip.jsx` `markArrived` function (lines 89–99)  
**Severity:** Medium — false GPS records

The `markArrived()` function calls POST `/check-in` for any stop the user clicks on, with no validation that the stop's `visit_date` matches today. A rep can GPS-check-in to a stop scheduled 5 days from now, generating a false check-in timestamp and location. Neither frontend nor backend validates `stop.visit_date === today`.

---

### New Bug 11 — No unsaved-data guard on browser navigation

**File:** `FieldVisitPlanner.jsx`  
**Severity:** High — silent data loss

The planner has no `beforeunload` handler and no `useBlocker` from react-router. A user who spends 10 minutes adding stops, resolving GPS coordinates, and organizing their trip can lose everything with a single browser back-press, accidental link click, or browser refresh. Other complex form components in the project (e.g., `ForecastPLTab.jsx`) correctly implement `beforeunload`.

**Fix:**
```js
useEffect(() => {
  if (stops.length === 0) return;
  const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}, [stops.length]);
```

---

### New Issue 13 — `FieldVisitKPIPanel` falsy check on cost_per_visit hides zero values

**File:** `FieldVisitKPIPanel.jsx` (lines 30–40)

```js
value={cost_per_visit ? parseFloat(cost_per_visit).toLocaleString(...) : '—'}
```

If `cost_per_visit` is `0` (zero expenses divided by visited stops), the falsy `?` evaluates false and shows `"—"` instead of `"0"`. This misleads users into thinking the metric hasn't been calculated yet. Use `cost_per_visit != null ?` instead.

---

## Updated Summary Table

| Category | Original | New | Total |
|---|---|---|---|
| 🔴 Confirmed Bugs | 6 | 5 | **11** |
| 🟡 Feature / UX Issues | 12 | 1 | **13** |
| 🟢 Code Quality / Minor | 7 | 0 | **7** |
| **Total** | **25** | **6** | **31** |

---

## 💡 New Feature Recommendations

### Feature A — Trip Cloning / Repeat Trip
Reps often visit the same customers on a recurring schedule (monthly, quarterly). Currently they rebuild the stop list from scratch each time. A "Clone Trip" button on `FieldVisitDetail` or `FieldVisitList` would duplicate stops, legs, and checklist into a new trip with fresh dates — saving 10+ minutes per repetitive trip.

### Feature B — Manager Trip Calendar View
No manager-facing view exists to see all reps' trips on a calendar. Currently managers must open each rep's trip list individually. A calendar component (month/week view) showing colored blocks per rep with trip date ranges would provide instant team scheduling visibility and conflict detection.

### Feature C — Stop Visit Outcome Capture During In-Trip
`FieldVisitInTrip` currently only supports GPS check-in. It doesn't allow the rep to record visit outcomes (notes, next actions, order placed, follow-up date) in the field. This data is captured after-the-fact in `FieldVisitDetail`, losing the context of the moment.

### Feature D — Automatic Travel Time Warnings
The planner computes route legs between stops but doesn't warn when there's insufficient time between a stop's end time and the next stop's start time (considering drive time + buffer). A simple comparison of `stopN.visit_time + stopN.duration_mins + routeLeg.durationSec + bufferMins` vs `stopN+1.visit_time` would flag unrealistic schedules.

### Feature E — Export Trip Itinerary to PDF/Email
No way exists to share a trip itinerary with a manager or colleague. A "Share Itinerary" button that generates a clean PDF (title, dates, stops with addresses/times, route map snapshot) or sends it via email would improve communication and record-keeping.

### Feature F — Budget vs Actual Expense Comparison Widget
`FieldVisitDetail` shows expenses and `budget_estimate` separately but never compares them. A simple progress bar (budget consumed: 65%) or a red warning when expenses exceed the budget estimate would help reps self-manage trip costs.
