# Field Visit Planner — Final Implementation Plan

> **Generated:** March 18, 2026
> **Based On:** FIELD_VISIT_PLANNER_AUDIT_AND_PLAN.md + CRM-VisitPlanner-Audit.md + Full Source Code Verification
> **Status:** ✅ ALL PHASES IMPLEMENTED AND VERIFIED (March 18, 2026)
> **Priority:** P0 → P1 → P2 → P3

---

## Implementation Status Update (March 18, 2026)

### All Phases Complete

- ✅ **Phase 0** — Critical Bug Fixes: All 6 tasks verified
- ✅ **Phase 1** — Resume/Edit Flow: All 5 tasks verified
- ✅ **Phase 2** — Auto-Save & State Management: All 3 tasks verified
- ✅ **Phase 3** — In-Trip Stop Management: All 7 tasks verified
- ✅ **Phase 4** — Trip Closure & Report Workflow: All 2 tasks verified
- ✅ **Phase 5** — UI/UX Improvements: All 7 tasks verified
- ✅ **Phase 6** — Trip Duplication: Task verified + fixed (now uses backend clone + navigate)

### Post-Verification Fixes Applied (March 18, 2026)

- ✅ `cloneFromTrip` in FieldVisitPlanner.jsx rewritten: now calls backend `POST /clone` + navigates to `/crm/visits/:newId/edit` (was client-side clone)
- ✅ Backend clone endpoint: added `destination_countries` column (was missing for international trips)
- ✅ Backend clone stops: added `stop_country`, `custom_label`, `transport_to_next` columns (were missing)
- ✅ FieldVisitList: added "Duplicate" button on completed/cancelled/confirmed/in-progress trip cards

### Completed in Code

- ✅ Resume/edit route implemented: `/crm/visits/:id/edit`
- ✅ Draft/planning trips now open planner edit flow from list and detail
- ✅ Clone now redirects directly to edit flow (backend clone + navigate)
- ✅ Travel report approval auto-completes trip (backend)
- ✅ Status transitions hardened in PATCH and PUT full-save endpoints
- ✅ Trip completion is blocked unless travel report is approved (backend)
- ✅ In-trip editing added: add stop, reorder stops, delete stop, inline stop notes autosave
- ✅ In-trip day filtering added: Today / Pending / All / specific dates
- ✅ Server-side check-in date validation added (today ±1 day)
- ✅ Trip list restructured into Continue Planning / Active & Upcoming / Past Trips
- ✅ Detail view status timeline added
- ✅ Planner autosave improved: per-change debounced autosave + interval autosave
- ✅ Planner route optimization now shows confirmation dialogs
- ✅ Jest open-handle warnings fixed (`setInterval(...).unref()` on 3 recurring timers)
- ✅ Manager assignment enforcement implemented for approval review (mapped manager only)
- ✅ Approval submit guard added when no manager assignment exists for rep
- ✅ Audit entries added for blocked approval submit/review guard events
- ✅ Manager inbox endpoint implemented: `/api/crm/field-trips/pending-my-approval`
- ✅ Manager inbox UX added in trips list + "My Approval Queue" toggle
- ✅ Field Visits tab badge added for manager pending approvals
- ✅ Travel-report status chips + quick action buttons added on trip list cards
- ✅ Duplicate button added to trip list cards (completed/cancelled/confirmed/in-progress)
- ✅ API-level guard suite added and stabilized: `server/tests/fieldTripGuards.test.js`

### Authorization Fix — designation_level Enforcement (March 18, 2026)

**Bug:** Users with manager-role names (e.g. `sales_coordinator` at level 5) could see "All Reps" filter and access all reps' trips. Only `designation_level >= 6` should grant manager-level access.

**Root cause:** `isManager` checks in frontend and `FULL_ACCESS_ROLES.includes(role)` in backend checked role name only, ignoring the user's designation level.

**Fixes applied:**
- ✅ **JWT token** (`authService.js`): Added `designation_level` to access token payload (login + refresh flows)
- ✅ **Auth middleware** (`middleware/auth.js`): Added `designation_level` to `req.user` extraction
- ✅ **Backend** (`field-trips.js`): Added `hasFullAccess(user)` helper — `admin` always passes; other manager roles require `designation_level >= 6`. All 9 `FULL_ACCESS_ROLES.includes()` calls replaced.
- ✅ **FieldVisitList.jsx**: `isManager` now checks `role === 'admin' || (managerRole && level >= 6)`
- ✅ **FieldVisitDetail.jsx**: Same fix applied
- ✅ **FieldVisitTravelReport.jsx**: Same fix applied
- ✅ **FieldVisitPlanner.jsx**: Already had correct level check (no change needed)

### Verified

- ✅ `crm-lifecycle` integration suite: **32/32 tests passed**
- ✅ Consolidated CRM suite (`crm-lifecycle` + `fieldTripGuards`): **34/34 tests passed**
- ✅ `fieldTripGuards` suite: **2/2 tests passed**
- ✅ `--detectOpenHandles`: no blocking open-handle report from the previously flagged timers
- ✅ Changed files diagnostics: no reported code errors
- ✅ All 7 phases code-verified against plan specs (March 18, 2026)

---

## Handoff Checklist for Next Agent

### A) Final Functional QA (must execute manually)

1. **Resume planning flow**
  - Create draft trip
  - Open from list → must go to `/crm/visits/:id/edit`
  - Wait >30 seconds and edit fields/stops
  - Confirm no duplicate draft is created

2. **Approval and closure flow**
  - Submit planning trip for approval
  - Manager approves trip → status must become `confirmed`
  - Start trip → status `in_progress`
  - Submit travel report, manager approves report
  - Trip must auto-transition to `completed`

3. **In-trip live edit flow**
  - In `in_progress`, add new stop
  - Reorder stop up/down and refresh page
  - Delete a stop and refresh page
  - Enter notes in inline textarea and blur
  - Confirm notes persist

4. **Check-in rule**
  - Try check-in on a stop with far-future date
  - Expect API rejection message

5. **Trip list UX**
  - Confirm sections display correctly by status
  - Confirm draft/planning cards route to edit
  - Confirm completed cards route to detail

### B) Remaining Work (not yet fully implemented)

1. **E2E expansion for full lifecycle (optional hardening)**
  - Baseline Playwright lifecycle spec is added (`tests/e2e/field-visit-lifecycle.spec.js`) and is env-gated
  - Expand it to full draft→resume→approval→in-trip edits→report approval→completed in a seeded/stable test environment

2. **Final manual UAT pass**
  - Execute checklist in section A on representative data and manager mappings
  - Capture screenshots/video and sign off workflow with business owner

### C) Coding Guardrails for Next Agent

- Do not remove `unref()` on long-running intervals used by backend services/routes
- Keep status transition logic consistent between:
  - `PATCH /field-trips/:id`
  - `PUT /field-trips/:id/full`
- Preserve stop reorder API payload compatibility (`array` and `{ items }`)
- Avoid nested state updates (`setState` inside another `setState` callback)


---

## Concept Summary (What the Module Must Do)

The Field Visit Planner allows a sales rep to:
1. **Plan** a customer visit trip (multi-day, multi-stop, local or international)
2. **Pause and Resume** at any point — every input auto-saves  
3. **Submit for Approval** — the manager (defined in admin/settings org structure) approves or rejects
4. **Execute the Trip** — real-time updates: reorder stops, add new customers/locations, take notes per stop, mark each stop as visited
5. **Close the Trip** — submit a travel report with meeting notes and outcomes → manager reviews → only after approval can the trip be marked "completed"
6. **Duplicate** — clone a completed trip for a future trip, changing dates and customers

---

## Architecture Reference

| Layer | Tech | Key Files |
|-------|------|-----------|
| Frontend | React 18 + Vite + Ant Design 5 | `src/components/CRM/FieldVisit*.jsx` |
| Routing | react-router-dom v7 | `src/components/CRM/CRMModule.jsx` (lines 507-514) |
| Backend | Express 4.18 + PostgreSQL 14 | `server/routes/crm/field-trips.js` |
| State | Local useState + auto-save to API | `FieldVisitPlanner.jsx` (editingTripIdRef) |
| Maps | Google Maps API (useJsApiLoader) | `FieldVisitMap.jsx`, `FieldVisitPlanner.jsx` |

### Current Routes (CRMModule.jsx lines 507-514)
```
/crm/visits              → FieldVisitList
/crm/visits/new          → FieldVisitPlanner
/crm/visits/:id          → FieldVisitDetail
/crm/visits/:id/route    → FieldVisitRouteView
/crm/visits/:id/in-trip  → FieldVisitInTrip
/crm/visits/:id/report   → FieldVisitReport
/crm/visits/:id/travel-report → FieldVisitTravelReport
```

### All Files to Modify
```
src/components/CRM/CRMModule.jsx          — Add edit route
src/components/CRM/FieldVisitPlanner.jsx  — Major: accept :id, fix auto-save, fix geocode bugs, add beforeunload
src/components/CRM/FieldVisitList.jsx     — Redesign: remove duplication, add "Continue Planning" action
src/components/CRM/FieldVisitDetail.jsx   — Add "Edit Trip" button for draft/planning, enforce closure rules
src/components/CRM/FieldVisitInTrip.jsx   — Add stop management (add/reorder/delete), fix timezone, fix check-in validation
src/components/CRM/FieldVisitMap.jsx      — Share hasValidCoordinates from fieldVisitUtils
src/components/CRM/fieldVisitUtils.js     — Add shared hasValidCoordinates function
server/routes/crm/field-trips.js          — Fix status transitions, fix travel-report→completed, fix stop_type constraint
```

---

## PHASE 0: Critical Bug Fixes (Must Do First) ✅ DONE

### TASK 0.1 — Fix `autoGeocodeStop` Setting Premature `coordinates_persist_status`

**File:** `src/components/CRM/FieldVisitPlanner.jsx`
**Bug:** `autoGeocodeStop` (line ~1650) sets `coordinates_persist_status: 'saved'` immediately after geocoding, but the coordinates haven't actually been persisted to the customer/prospect entity record yet. This means the orange GPS warning disappears prematurely, and if the user saves, the customer's entity record still has no coordinates.

**Current Code (line ~1650):**
```javascript
updateStop(idx, { latitude: lat, longitude: lng, coordinates_persist_status: 'saved' });
```

**Fix:** Change to `'auto_resolved'` so the system knows coords exist but haven't been persisted to the entity. The "Save Trip" button should NOT be blocked by auto-resolved coords — only by truly missing coords (null lat/lng). The orange warning should change to a softer info-blue for auto-resolved stops.

```javascript
updateStop(idx, { latitude: lat, longitude: lng, coordinates_persist_status: 'auto_resolved' });
```

**Also update `hasResolvedStopCoordinates`** to accept both `'saved'` and `'auto_resolved'`:
```javascript
const hasResolvedStopCoordinates = (stop) => {
  if (!hasValidCoordinates(stop.latitude, stop.longitude)) return false;
  // Entity-linked stops require coordinates to be at least auto-resolved
  if (stop.customer_id || stop.prospect_id) {
    return ['saved', 'auto_resolved'].includes(stop.coordinates_persist_status);
  }
  return true; // location stops just need valid coords
};
```

**Also update the review step (Step 2)** to show different badge colors:
- `null` → red "No GPS"
- `'auto_resolved'` → blue "GPS auto-resolved (not saved to entity)"
- `'saved'` → green "GPS confirmed"

**Test:** Create a trip → add a customer with no GPS → verify auto-geocode fires → verify orange warning changes to blue info → verify Save button is enabled → verify trip saves successfully.

---

### TASK 0.2 — Fix `applyGeocode` Not Parsing `lat` to Float

**File:** `src/components/CRM/FieldVisitPlanner.jsx` (line ~959)
**Bug:** `result.lat` is stored as a raw string from the geocode API, while `result.lng` is correctly parsed with `parseFloat()`.

**Current Code:**
```javascript
const applyGeocode = (result) => {
  updateStop(geocodingIdx, {
    latitude: result.lat,               // ← BUG: string
    longitude: parseFloat(result.lng),   // ← correct
```

**Fix:**
```javascript
    latitude: parseFloat(result.lat),
    longitude: parseFloat(result.lng),
```

**Test:** Open a trip → geocode a stop → inspect state → confirm both lat and lng are numbers, not strings.

---

### TASK 0.3 — Fix `optimizeRoute` Silent Corruption When Stops Lack Coordinates

**File:** `src/components/CRM/FieldVisitPlanner.jsx` (line ~1369)
**Bug:** In `optimizeGroup`, when no distance can be computed (current or candidate stop lacks coordinates), `bestIdx` stays `0` and the first remaining stop is always picked. This silently corrupts the order.

**Current Code:**
```javascript
if (!anyDistanceComputed) bestIdx = 0;
ordered.push(remaining.splice(bestIdx, 1)[0]);
```

**Fix:** When no distance can be computed, preserve the stop's original position by just popping the first remaining element (which is already in its original relative order). But more importantly, add a confirmation dialog BEFORE optimizing AND show a warning if any stops lack coordinates:

```javascript
// Before calling optimizeGroup, check for missing coords
const stopsWithoutCoords = stops.filter(s => !hasValidCoordinates(s.latitude, s.longitude));
if (stopsWithoutCoords.length > 0) {
  modal.confirm({
    title: 'Some stops have no GPS coordinates',
    content: `${stopsWithoutCoords.length} stop(s) don't have coordinates. Route optimization may be inaccurate for these stops. They will keep their relative position.`,
    okText: 'Optimize Anyway',
    cancelText: 'Cancel',
    onOk: () => doOptimize(),
  });
} else {
  modal.confirm({
    title: 'Optimize Route?',
    content: 'This will reorder your stops using nearest-neighbor algorithm. Your current order will be replaced.',
    okText: 'Optimize',
    onOk: () => doOptimize(),
  });
}
```

In the `optimizeGroup` function itself, when no distance can be computed, leave the stop in place (it's already at `bestIdx = 0` in remaining, which is equivalent to preserving relative order):
```javascript
// This is already the correct behavior for preserving order when no distance computed.
// Just don't show misleading success message:
if (!anyDistanceComputed) {
  // Just take next in line — preserves original relative position
}
```

Add a more informative toast at the end:
```javascript
if (stopsWithoutCoords.length > 0) {
  message.warning(`Route optimized. ${stopsWithoutCoords.length} stop(s) without coordinates kept in relative position.`);
} else {
  message.success('Route optimized (nearest-neighbor per day).');
}
```

**Test:** Create a trip with 5 stops, 2 without coordinates → optimize → verify the 2 without coords maintain their relative order → verify the 3 with coords are reordered by proximity.

---

### TASK 0.4 — Add `beforeunload` Guard to Prevent Accidental Data Loss

**File:** `src/components/CRM/FieldVisitPlanner.jsx`
**Bug:** No protection against accidental browser navigation (back, refresh, link click). User can lose 10+ minutes of planning work.

**Fix:** Add this `useEffect` near the other effects (after the auto-save effect):

```javascript
// Warn user before leaving if they have unsaved changes
useEffect(() => {
  if (stops.length === 0 && !form.isFieldsTouched()) return;
  const handler = (e) => {
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}, [stops.length, form]);
```

**Note:** Do NOT use `useBlocker` from react-router for now — it requires careful integration with the auto-save flow. The `beforeunload` handler covers browser-level navigation. In-app navigation (react-router) is less of a risk because the planner occupies the full page.

**Test:** Add a stop → try to refresh browser → verify the "Leave site?" confirmation dialog appears.

---

### TASK 0.5 — Fix Backend Status-Transition Bypass

**File:** `server/routes/crm/field-trips.js` (PATCH /field-trips/:id endpoint, line ~522)
**Bug:** The backend only validates that the new status is in the allowed list, but doesn't check the current status. Any status can transition to any other status via direct API call, bypassing the approval workflow entirely.

**Current Code:**
```javascript
const allowedStatus = ['planning', 'confirmed', 'in_progress', 'completed', 'cancelled'];
if (status !== undefined) {
  if (!allowedStatus.includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status transition' });
  }
```

**Fix:** Add valid transitions map and enforce it:
```javascript
const VALID_TRANSITIONS = {
  draft:          ['planning', 'cancelled'],
  planning:       ['pending_approval', 'confirmed', 'cancelled'],
  pending_approval: ['confirmed', 'planning', 'cancelled'],
  confirmed:      ['planning', 'in_progress', 'cancelled'],
  in_progress:    ['completed', 'cancelled'],
  completed:      [],  // terminal
  cancelled:      ['planning'],
};

if (status !== undefined) {
  // Fetch current status first
  const currentRow = await pool.query('SELECT status FROM crm_field_trips WHERE id = $1', [tripId]);
  if (!currentRow.rows.length) return res.status(404).json({ success: false, error: 'Trip not found' });
  const currentStatus = currentRow.rows[0].status;
  
  if (!VALID_TRANSITIONS[currentStatus]?.includes(status)) {
    return res.status(400).json({ 
      success: false, 
      error: `Cannot transition from '${currentStatus}' to '${status}'` 
    });
  }
}
```

**Special rule for `completed`:** Only allow transition to `completed` if the travel report exists and is approved:
```javascript
if (status === 'completed') {
  const reportRow = await pool.query(
    'SELECT status FROM crm_travel_reports WHERE trip_id = $1',
    [tripId]
  );
  if (!reportRow.rows.length || reportRow.rows[0].status !== 'approved') {
    return res.status(400).json({ 
      success: false, 
      error: 'Trip cannot be completed until travel report is submitted and approved by manager' 
    });
  }
}
```

**Test:** 
1. Try PATCH /field-trips/:id with status='completed' on a 'planning' trip → expect 400
2. Try the valid transition planning→confirmed → expect 200
3. Try completing a trip without approved travel report → expect 400

---

### TASK 0.6 — Fix Travel Report Approval NOT Setting Trip to Completed

**File:** `server/routes/crm/field-trips.js` (PATCH /field-trips/:id/travel-report/review, line ~1484)
**Bug:** When a manager approves the travel report, only `crm_travel_reports.status` is updated to 'approved'. The `crm_field_trips.status` is NOT updated. The user concept says: "the trip is closed when he comes back and submit his report to the manager" — meaning report approval should trigger trip completion.

**Current Code (only updates report, not trip):**
```javascript
const result = await pool.query(
  `UPDATE crm_travel_reports SET status = $1, manager_comments = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW() WHERE trip_id = $4 RETURNING *`,
  [status, manager_comments || null, req.user.id, tripId]
);
```

**Fix:** After updating the report, also update the trip status to `completed`:
```javascript
const result = await pool.query(
  `UPDATE crm_travel_reports SET status = $1, manager_comments = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW() WHERE trip_id = $4 RETURNING *`,
  [status, manager_comments || null, req.user.id, tripId]
);

if (!result.rows.length) return res.status(404).json({ success: false, error: 'Travel report not found' });

// If approved → automatically complete the trip
if (status === 'approved') {
  await pool.query(
    `UPDATE crm_field_trips SET status = 'completed', updated_at = NOW() WHERE id = $1 AND status = 'in_progress'`,
    [tripId]
  );
}

res.json({ success: true, data: result.rows[0] });
```

**Test:** Submit a travel report → manager approves → verify trip status changes to 'completed' automatically.

---

## PHASE 1: Resume/Edit Flow (Core Feature) ✅ DONE

### TASK 1.1 — Add Edit Route to CRMModule.jsx

**File:** `src/components/CRM/CRMModule.jsx` (lines 507-514)

**Add this route** after the `visits/new` route:
```jsx
<Route path="visits/:id/edit" element={<FieldVisitPlanner />} />
```

The full route block should now be:
```jsx
<Route path="visits" element={<FieldVisitList />} />
<Route path="visits/new" element={<FieldVisitPlanner />} />
<Route path="visits/:id/edit" element={<FieldVisitPlanner />} />
<Route path="visits/:id" element={<FieldVisitDetail />} />
<Route path="visits/:id/route" element={<FieldVisitRouteView />} />
<Route path="visits/:id/in-trip" element={<FieldVisitInTrip />} />
<Route path="visits/:id/report" element={<FieldVisitReport />} />
<Route path="visits/:id/travel-report" element={<FieldVisitTravelReport />} />
```

**Test:** Navigate to `/crm/visits/123/edit` → verify FieldVisitPlanner renders.

---

### TASK 1.2 — Make FieldVisitPlanner Accept `:id` Param and Auto-Load Trip

**File:** `src/components/CRM/FieldVisitPlanner.jsx`

**Add `useParams` import and usage:**
```javascript
import { useParams, useNavigate } from 'react-router-dom';

// Inside component:
const { id: routeTripId } = useParams();
const navigate = useNavigate();
```

**Add a `useEffect` to auto-load the trip when `:id` is present:**
```javascript
// Load trip for editing when navigated to /crm/visits/:id/edit
useEffect(() => {
  if (routeTripId && !editingTripId) {
    resumeTrip(parseInt(routeTripId, 10));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [routeTripId]);
```

**Place this effect** after the `resumeTrip` function definition and after the customers/prospects data has loaded. Important: the `resumeTrip` function already exists and works correctly — it calls `setEditingTripId(tripId)` at line ~1204. The only missing piece is invoking it when navigating to the edit route.

**Edge case:** If customers/prospects haven't loaded yet when `resumeTrip` runs, the stop names may not resolve. Add a guard:
```javascript
useEffect(() => {
  if (routeTripId && !editingTripId && customers.length > 0) {
    resumeTrip(parseInt(routeTripId, 10));
  }
}, [routeTripId, customers.length]);
```

**Test:** Navigate to `/crm/visits/5/edit` → verify trip #5 loads into the planner → verify all form fields populated → verify stops loaded → verify editingTripId is set → verify auto-save updates (not creates).

---

### TASK 1.3 — Add "Continue Planning" Button to FieldVisitList Trip Cards

**File:** `src/components/CRM/FieldVisitList.jsx`

**For draft/planning status trips, add a "Continue Planning" button** that navigates to `/crm/visits/:id/edit`:

In the card actions area (where Delete button is shown for draft/planning), add:
```jsx
{['draft', 'planning'].includes(tripStatus) && (
  <Button 
    size="small" 
    type="primary" 
    icon={<EditOutlined />} 
    onClick={(e) => { e.stopPropagation(); navigate(`/crm/visits/${trip.id}/edit`); }}
  >
    Continue Planning
  </Button>
)}
```

**Also change the card `onClick` behavior** for draft/planning trips to go to edit instead of detail:
```javascript
<Card
  hoverable
  onClick={() => {
    if (['draft', 'planning'].includes(trip.status)) {
      navigate(`/crm/visits/${trip.id}/edit`);
    } else {
      navigate(`/crm/visits/${trip.id}`);
    }
  }}
>
```

**Test:** 
1. View trip list → see draft trip → click card → verify navigates to planner with trip loaded
2. View trip list → see completed trip → click card → verify navigates to detail view

---

### TASK 1.4 — Add "Edit Trip" Button to FieldVisitDetail for Draft/Planning Trips

**File:** `src/components/CRM/FieldVisitDetail.jsx`

**In the header actions area** (where status-specific buttons are), add an Edit button for draft/planning:
```jsx
{['draft', 'planning'].includes(trip.status) && (
  <Button 
    type="primary" 
    icon={<EditOutlined />} 
    onClick={() => navigate(`/crm/visits/${trip.id}/edit`)}
  >
    Edit Trip
  </Button>
)}
```

Make sure `EditOutlined` is imported from `@ant-design/icons`.

**Test:** Open detail for a draft trip → see "Edit Trip" button → click → verify navigates to planner with trip loaded.

---

### TASK 1.5 — Remove "My Trips" Duplication from Planner Header

**File:** `src/components/CRM/FieldVisitPlanner.jsx`

**Problem:** The "My Trips" button in the planner header opens a modal showing ALL previous trips with Resume/Duplicate/Delete actions. This is functionally redundant with `FieldVisitList.jsx` which shows the same trips with the same actions.

**Fix:** Replace "My Trips" button with a **"Back to Trip List"** link and a **"Load from a Previous Trip"** button (for duplication only):

1. Remove the `showPrevTripsModal` modal entirely, OR
2. Repurpose it: rename to "Load from Previous Trip" and only show the Duplicate action (not Resume — because Resume now uses the edit route)

**Recommended approach — Option 2:**
- Rename button: `"My Trips"` → `"Load from Previous Trip"` 
- In the modal, remove the "Resume" button (now handled via `/crm/visits/:id/edit`)
- Keep "Duplicate" button (useful for creating new trips from templates)
- Keep "Delete" for draft trips
- Add "Back to All Trips" button in the planner header that navigates to `/crm/visits`

```jsx
<Space>
  <Button onClick={() => navigate('/crm/visits')} icon={<ArrowLeftOutlined />}>All Trips</Button>
  <Button onClick={loadPreviousTrips} icon={<CopyOutlined />}>Load from Previous Trip</Button>
</Space>
```

**Test:** Open planner → verify "All Trips" button → click → navigates to trip list. Verify "Load from Previous Trip" → opens modal → only Duplicate and Delete actions shown.

---

## PHASE 2: Auto-Save & State Management Fixes ✅ DONE

### TASK 2.1 — Fix Auto-Save Creating Orphan Drafts When Editing an Existing Trip

**File:** `src/components/CRM/FieldVisitPlanner.jsx` (autoSaveTrip function, line ~1083)

**Problem:** When the planner is opened at `/crm/visits/:id/edit`, the `resumeTrip` function sets `editingTripId` via `setEditingTripId(tripId)` at line ~1204. However, there's a race condition: the auto-save timer (30s interval) may fire BEFORE `resumeTrip` completes. If `editingTripIdRef.current` is still `null` at that moment, auto-save creates a NEW draft instead of updating the existing trip.

**Fix:** Add a loading guard to auto-save:
```javascript
const isLoadingTripRef = useRef(false);

// In resumeTrip, wrap the entire function:
const resumeTrip = async (tripId) => {
  isLoadingTripRef.current = true;
  try {
    // ... existing resumeTrip logic ...
    setEditingTripId(tripId);
  } finally {
    isLoadingTripRef.current = false;
  }
};

// In autoSaveTrip, add guard:
const autoSaveTrip = useCallback(async () => {
  if (isLoadingTripRef.current) return; // Don't auto-save while loading
  // ... rest of existing logic ...
}, [/* deps */]);
```

**Also:** When navigating to `/crm/visits/:id/edit`, immediately set `editingTripIdRef.current = parseInt(routeTripId)` before `resumeTrip` completes:
```javascript
useEffect(() => {
  if (routeTripId && !editingTripId && customers.length > 0) {
    // Pre-set the ID to prevent auto-save from creating a new draft
    editingTripIdRef.current = parseInt(routeTripId, 10);
    resumeTrip(parseInt(routeTripId, 10));
  }
}, [routeTripId, customers.length]);
```

**Test:** Open a draft trip for editing → wait 30+ seconds → verify NO new draft is created → verify the original trip is updated.

---

### TASK 2.2 — Fix `addDraftStops` Calling `autoGeocodeStop` Inside `setStops` Callback

**File:** `src/components/CRM/FieldVisitPlanner.jsx` (line ~835)
**Bug:** `autoGeocodeStop` (which calls `updateStop` → `setStops`) is called inside another `setStops` callback. Nested `setStops` calls are a React anti-pattern that can cause stale state.

**Current Code (approximate):**
```javascript
setStops((prev) => {
  // ... build newStops ...
  created.forEach((s, i) => {
    autoGeocodeStop(offset + i, geocodeHints[i]);  // ← calls setStops inside setStops
  });
  return newStops;
});
```

**Fix:** Move the geocode calls outside the `setStops` callback using `setTimeout(..., 0)`:
```javascript
setStops((prev) => {
  // ... build newStops ...
  // Schedule geocode calls for after this setState completes
  setTimeout(() => {
    created.forEach((s, i) => {
      autoGeocodeStop(offset + i, geocodeHints[i]);
    });
  }, 0);
  return newStops;
});
```

**Alternative (more robust):** Use a `useEffect` that watches for newly-added stops that need geocoding. Add a `needsGeocode` flag to stops:
```javascript
useEffect(() => {
  stops.forEach((s, idx) => {
    if (s._needsGeocode && s._geocodeHints) {
      autoGeocodeStop(idx, s._geocodeHints);
      updateStop(idx, { _needsGeocode: false, _geocodeHints: undefined });
    }
  });
}, [stops]);
```

**The `setTimeout` approach is simpler and sufficient.** Use that.

**Test:** Add 3 customers from the "Draft from Customers" modal where 2 have no GPS → verify all 3 stops appear → verify the 2 trigger auto-geocode → verify coordinates resolve → no console React warnings.

---

### TASK 2.3 — Fix Checklist State Not Resetting When Trip Type Changes

**File:** `src/components/CRM/FieldVisitPlanner.jsx`
**Bug:** When user fills in a local checklist then switches `trip_type` to international, the old checklist items persist in state.

**Fix:** Add a `useEffect` watching `tripType`:
```javascript
const tripType = Form.useWatch('trip_type', form);

useEffect(() => {
  // Reset checklist when trip type changes to prevent hybrid checklist
  setChecklist([]);
}, [tripType]);
```

**Test:** Fill local checklist → switch to international → verify checklist is empty → verify international defaults appear.

---

## PHASE 3: In-Trip Stop Management ✅ DONE

### TASK 3.1 — Add "Add Stop" Button to FieldVisitInTrip

**File:** `src/components/CRM/FieldVisitInTrip.jsx`

**User need:** "While traveling he may change the sequence, add new customers or location"

**Add a floating action button** or a header button to add a new stop:

```jsx
<Button 
  type="primary" 
  icon={<PlusOutlined />} 
  onClick={() => setShowAddStopModal(true)}
>
  Add Stop
</Button>
```

**Add Stop Modal** — a simplified version of the planner's stop creation:
```jsx
<Modal title="Add Stop to Trip" open={showAddStopModal} onOk={handleAddStop} onCancel={() => setShowAddStopModal(false)}>
  <Form form={addStopForm} layout="vertical">
    <Form.Item name="stop_type" label="Type" initialValue="customer">
      <Select options={[
        { value: 'customer', label: 'Customer' },
        { value: 'prospect', label: 'Prospect' },
        { value: 'location', label: 'Location' },
      ]} />
    </Form.Item>
    <Form.Item name="customer_id" label="Customer" dependencies={['stop_type']}>
      {/* Show customer select when stop_type=customer, prospect select when stop_type=prospect, free text when location */}
    </Form.Item>
    <Form.Item name="visit_date" label="Visit Date">
      <DatePicker />
    </Form.Item>
    <Form.Item name="objectives" label="Notes">
      <Input.TextArea rows={3} />
    </Form.Item>
  </Form>
</Modal>
```

**Backend call:** Use existing `POST /api/crm/field-trips/:id/stops` which already supports adding individual stops.

**After adding:** Refresh the stops list to show the new stop.

**Test:** Start a trip → mark "in_progress" → open in-trip view → click "Add Stop" → select a customer → save → verify new stop appears in the list.

---

### TASK 3.2 — Add Stop Reordering to FieldVisitInTrip

**File:** `src/components/CRM/FieldVisitInTrip.jsx`

**Add simple up/down reorder buttons** on each stop card (simpler than drag-and-drop for mobile use during travel):

```jsx
<Space>
  <Button 
    size="small" 
    icon={<ArrowUpOutlined />} 
    disabled={idx === 0}
    onClick={() => reorderStop(stop.id, idx - 1)}
  />
  <Button 
    size="small" 
    icon={<ArrowDownOutlined />} 
    disabled={idx === visibleStops.length - 1}
    onClick={() => reorderStop(stop.id, idx + 1)}
  />
</Space>
```

**`reorderStop` function:**
```javascript
const reorderStop = async (stopId, newIndex) => {
  const currentOrder = [...sortedStops];
  const fromIdx = currentOrder.findIndex(s => s.id === stopId);
  const [moved] = currentOrder.splice(fromIdx, 1);
  currentOrder.splice(newIndex, 0, moved);
  
  const reorderedIds = currentOrder.map(s => s.id);
  try {
    await axios.put(`${API_BASE}/api/crm/field-trips/${id}/stops/reorder`, 
      { stop_ids: reorderedIds }, 
      { headers: getAuthHeaders() }
    );
    loadTrip(); // Refresh
    message.success('Stop order updated');
  } catch {
    message.error('Failed to reorder');
  }
};
```

**Backend:** The `PUT /field-trips/:id/stops/reorder` endpoint already exists and works.

**Test:** Open in-trip view → move stop #3 up → verify new order persists after refresh.

---

### TASK 3.3 — Add Per-Stop Notes During Trip Execution

**File:** `src/components/CRM/FieldVisitInTrip.jsx`

**Current state:** The outcome form has a notes field, but it's only shown when marking a stop as visited/completed. Users need to add notes during or after meetings — even days later from their hotel.

**Add a persistent notes section** on each stop card:
```jsx
<Input.TextArea 
  placeholder="Meeting notes..."
  defaultValue={stop.outcome_notes || ''}
  onBlur={(e) => saveStopNotes(stop.id, e.target.value)}
  autoSize={{ minRows: 2, maxRows: 6 }}
/>
```

**`saveStopNotes` function — auto-save on blur:**
```javascript
const saveStopNotes = async (stopId, notes) => {
  try {
    await axios.patch(
      `${API_BASE}/api/crm/field-trips/${id}/stops/${stopId}`,
      { outcome_notes: notes },
      { headers: getAuthHeaders() }
    );
    // Silent save — no toast for better UX during note-taking
  } catch {
    message.error('Failed to save notes');
  }
};
```

**Backend:** The `PATCH /field-trips/:id/stops/:stopId` endpoint already supports updating `outcome_notes`.

**Test:** Open in-trip → expand a stop → type notes → click away (blur) → refresh page → verify notes persisted.

---

### TASK 3.4 — Add Per-Stop "Done" Confirmation

**File:** `src/components/CRM/FieldVisitInTrip.jsx`

**User need:** "Each location in the trip there should be a confirmation that it is done (trip ongoing status)"

**The existing check-in + outcome system partially covers this.** Enhance by showing a clear visual indicator:

For each stop, show a status progression:
```
🔲 Planned → 📍 Checked In → ✅ Visited (Done) → 📝 Notes Added
```

**Render as a mini Steps component (Ant Design):**
```jsx
<Steps size="small" current={getStopProgress(stop)} items={[
  { title: 'Planned' },
  { title: 'Arrived', description: stop.check_in_timestamp ? dayjs(stop.check_in_timestamp).format('HH:mm') : '' },
  { title: 'Done', description: stop.outcome_status === 'visited' ? '✓' : '' },
  { title: 'Notes', description: stop.outcome_notes ? '✓' : '' },
]} />
```

**Test:** Check in at a stop → mark as visited → add notes → verify all 4 steps show as completed.

---

### TASK 3.5 — Fix Timezone Mismatch in Today's Stops Filter

**File:** `src/components/CRM/FieldVisitInTrip.jsx` (line ~97)
**Bug:** `dayjs().format('YYYY-MM-DD')` uses browser local timezone, but `visit_date` may be stored as UTC date string. For users in UTC+ timezones late at night, today's stops may not match.

**Fix:** Compare using `dayjs` date comparison instead of string equality:
```javascript
const todayStops = useMemo(() => {
  const today = dayjs().startOf('day');
  return sortedStops.filter((s) => {
    if (!s.visit_date) return false;
    return dayjs(s.visit_date).isSame(today, 'day');
  });
}, [sortedStops]);
```

`dayjs.isSame(today, 'day')` handles timezone-aware comparison correctly.

**Test:** Verify in a UTC+4 timezone at 11:30 PM that today's stops still appear correctly.

---

### TASK 3.6 — Fix Check-In Allowing GPS Check-In for Wrong Day's Stops

**File:** `src/components/CRM/FieldVisitInTrip.jsx` and `server/routes/crm/field-trips.js`
**Bug:** `markArrived()` posts a GPS check-in for any stop regardless of its scheduled date. A rep can check in to a stop scheduled 5 days from now.

**Fix (backend validation):** In the `POST /field-trips/:id/stops/:stopId/check-in` handler, add:
```javascript
// Verify stop's visit_date is today (with 1-day tolerance for timezone differences)
const stopRow = await pool.query('SELECT visit_date FROM crm_field_trip_stops WHERE id = $1', [stopId]);
if (stopRow.rows.length && stopRow.rows[0].visit_date) {
  const visitDate = dayjs(stopRow.rows[0].visit_date);
  const now = dayjs();
  if (Math.abs(visitDate.diff(now, 'day')) > 1) {
    return res.status(400).json({ 
      success: false, 
      error: 'Can only check in to stops scheduled for today or tomorrow' 
    });
  }
}
```

**Test:** Try to check in to a stop scheduled for next week → expect error message.

---

### TASK 3.7 — Allow Viewing All Days' Stops (Not Just Today)

**File:** `src/components/CRM/FieldVisitInTrip.jsx`

**Current:** There's already a `showAllStops` toggle. But stops without `visit_date` are NEVER shown in the today view.

**Fix:** If a stop has no `visit_date`, include it in the "today" view as an unscheduled stop:
```javascript
const todayStops = useMemo(() => {
  const today = dayjs().startOf('day');
  return sortedStops.filter((s) => {
    if (!s.visit_date) return true; // Show unscheduled stops always
    return dayjs(s.visit_date).isSame(today, 'day');
  });
}, [sortedStops]);
```

**Add a day-selector** (Segmented control) at the top to quickly switch between trip days:
```jsx
const tripDays = useMemo(() => {
  const dates = [...new Set(sortedStops.map(s => s.visit_date).filter(Boolean))].sort();
  return dates;
}, [sortedStops]);

<Segmented
  value={selectedDay || 'today'}
  options={[
    { label: 'Today', value: 'today' },
    ...tripDays.map(d => ({ label: dayjs(d).format('DD MMM'), value: d })),
    { label: 'All', value: 'all' },
  ]}
  onChange={(val) => setSelectedDay(val)}
/>
```

**Test:** Multi-day trip → open in-trip → verify day selector shows all trip dates → switch days → verify correct stops shown.

---

## PHASE 4: Trip Closure & Report Workflow ✅ DONE

### TASK 4.1 — Enforce Trip Closure Only After Report Approval

**File:** `src/components/CRM/FieldVisitDetail.jsx`

**Problem:** Currently, the "Complete Trip" button is shown for all `in_progress` trips regardless of whether a travel report has been submitted and approved. This violates the user concept: "the trip is closed when he comes back and submit his report to the manager."

**Fix:** Remove the "Complete Trip" button from FieldVisitDetail (since completion is now triggered automatically by travel report approval — see TASK 0.6). Replace with:
```jsx
{trip.status === 'in_progress' && (
  <>
    {/* Check if travel report exists and its status */}
    {!travelReport && (
      <Button type="primary" onClick={() => navigate(`/crm/visits/${trip.id}/travel-report`)}>
        Submit Travel Report
      </Button>
    )}
    {travelReport?.status === 'submitted' && (
      <Tag color="processing">Travel Report Under Review</Tag>
    )}
    {travelReport?.status === 'approved' && (
      <Tag color="success">Trip Completed</Tag>
    )}
    {travelReport?.status === 'rejected' && (
      <Button onClick={() => navigate(`/crm/visits/${trip.id}/travel-report`)}>
        Revise Travel Report
      </Button>
    )}
  </>
)}
```

**Load travel report status** in the `loadDetail()` function:
```javascript
const [travelReport, setTravelReport] = useState(null);

const loadDetail = async () => {
  // ... existing trip load ...
  // Also load travel report status
  try {
    const reportRes = await axios.get(`${API_BASE}/api/crm/field-trips/${id}/travel-report`, { headers: getHeaders() });
    setTravelReport(reportRes.data?.data || null);
  } catch { /* no report yet */ }
};
```

**Test:** 
1. In-progress trip with no report → see "Submit Travel Report" button
2. After submitting report → see "Under Review" tag
3. After manager approves report → trip auto-completes → verify status is 'completed'

---

### TASK 4.2 — Add Trip Status Timeline to Detail View

**File:** `src/components/CRM/FieldVisitDetail.jsx`

**Add a visual workflow timeline** showing where the trip is in its lifecycle:

```jsx
<Steps 
  current={getStatusStep(trip.status)} 
  style={{ marginBottom: 24 }}
  items={[
    { title: 'Planning', description: trip.status === 'planning' ? 'Current' : '' },
    { title: 'Approval', description: trip.status === 'pending_approval' ? 'Waiting' : trip.approved_at ? dayjs(trip.approved_at).format('DD MMM') : '' },
    { title: 'Confirmed', description: trip.status === 'confirmed' ? 'Ready' : '' },
    { title: 'In Progress', description: trip.status === 'in_progress' ? 'Traveling' : '' },
    { title: 'Report', description: travelReport?.status === 'submitted' ? 'Under Review' : travelReport?.status === 'approved' ? 'Approved' : '' },
    { title: 'Completed', description: trip.status === 'completed' ? dayjs(trip.updated_at).format('DD MMM') : '' },
  ]}
/>
```

**Helper:**
```javascript
const getStatusStep = (status) => {
  const steps = ['planning', 'pending_approval', 'confirmed', 'in_progress', 'report', 'completed'];
  return steps.indexOf(status === 'in_progress' && travelReport ? 'report' : status);
};
```

**Test:** Open a confirmed trip detail → see timeline with "Confirmed" step highlighted.

---

## PHASE 5: UI/UX Improvements ✅ DONE

### TASK 5.1 — Fix Review Step Badge Numbering in Filtered View

**File:** `src/components/CRM/FieldVisitPlanner.jsx` (line ~3657)
**Bug:** When `reviewShowUnsavedOnly` filter is active, badges show filtered index (1, 2) instead of original index (3, 5).

**Fix:** Use `stops.indexOf(s)` to get the original index:
```javascript
.map((s, filteredIdx) => {
  const originalIdx = stops.indexOf(s);
  // Use originalIdx + 1 for badge number
  return (
    <Badge count={originalIdx + 1} ... />
  );
})
```

**Test:** Create 5 stops, 2 without GPS → toggle filter → verify badges show original stop numbers (e.g., #3 and #5, not #1 and #2).

---

### TASK 5.2 — Share `hasValidCoordinates` Between Map and Planner

**File:** `src/components/CRM/fieldVisitUtils.js`

**Add the full `hasValidCoordinates` function:**
```javascript
export const hasValidCoordinates = (lat, lng) => {
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
  if (Math.abs(nLat) < 0.0001 && Math.abs(nLng) < 0.0001) return false;
  // Legacy placeholder check (old imports used 24.0, 53.999)
  if (Math.abs(nLat - 24.0) < 0.0001 && Math.abs(nLng - 53.999) < 0.0001) return false;
  return true;
};
```

**Update imports in:**
- `FieldVisitPlanner.jsx` — replace inline `hasValidCoordinates` with `import { hasValidCoordinates } from './fieldVisitUtils'`
- `FieldVisitMap.jsx` — replace inline version with shared import
- `FieldVisitInTrip.jsx` — if it has its own version

**Test:** Add a stop with coordinates (24.0, 53.999) → verify both planner AND map treat it as invalid.

---

### TASK 5.3 — Fix `canAdvance()` Not Validating Return Date ≥ Departure Date

**File:** `src/components/CRM/FieldVisitPlanner.jsx` (line ~2075)

**Fix:** Change the Next button handler for Step 0 to use async validation:
```javascript
const handleNext = async () => {
  if (step === 0) {
    try {
      await form.validateFields(['title', 'country_code', 'departure_date', 'return_date']);
      // Also validate destination_countries for international trips
      const vals = form.getFieldsValue(true);
      if (vals.trip_type === 'international' && (!vals.destination_countries || vals.destination_countries.length === 0)) {
        message.warning('Please select destination countries for international trips');
        return;
      }
    } catch {
      message.warning('Please fill in all required fields');
      return;
    }
  }
  if (step === 1 && stops.length === 0) {
    message.warning('Please add at least one stop');
    return;
  }
  setStep(step + 1);
};
```

**Replace the Next button's `disabled` prop:**
```jsx
// Old: disabled={!canAdvance()}
// New: use the handleNext function which does async validation
<Button type="primary" onClick={handleNext}>Next</Button>
```

**Test:** Set departure date to March 20, return date to March 15 → click Next → expect form validation error → fix dates → click Next → expect advance to Step 1.

---

### TASK 5.4 — Fix `FieldVisitList` Dead `total` State Variable

**File:** `src/components/CRM/FieldVisitList.jsx` (line ~52)

**Fix:** Remove unused `total` and `setTotal` state variables. This is a minor cleanup.

**Test:** Verify no console errors after removal.

---

### TASK 5.5 — Improve FieldVisitList Layout (Remove Trips Duplication)

**File:** `src/components/CRM/FieldVisitList.jsx`

**Problem:** The trip list shows ALL trips in the main area. There's no clear separation between the user's incomplete trips (which need attention) and completed/archived trips.

**Fix:** Add sections to the list view:

```jsx
{/* Section 1: Incomplete Trips (needs action) */}
{incompletTrips.length > 0 && (
  <>
    <Title level={5}>Continue Planning</Title>
    <Row gutter={[16, 16]}>
      {incompleteTrips.map(trip => (
        <Col key={trip.id} xs={24} sm={12} lg={8}>
          <TripCard trip={trip} onClick={() => navigate(`/crm/visits/${trip.id}/edit`)} />
        </Col>
      ))}
    </Row>
    <Divider />
  </>
)}

{/* Section 2: Active/Upcoming Trips */}
<Title level={5}>Active & Upcoming Trips</Title>
<Row gutter={[16, 16]}>
  {activeTrips.map(/* ... */)}
</Row>

{/* Section 3: Completed Trips */}
<Title level={5}>Past Trips</Title>
{/* ... */}
```

**Where:**
```javascript
const incompleteTrips = filteredItems.filter(t => ['draft', 'planning'].includes(t.status));
const activeTrips = filteredItems.filter(t => ['pending_approval', 'confirmed', 'in_progress'].includes(t.status));
const completedTrips = filteredItems.filter(t => ['completed', 'cancelled'].includes(t.status));
```

**Test:** View trip list → verify three clear sections → verify draft trips appear in "Continue Planning" → clicking navigates to planner.

---

### TASK 5.6 — Add Confirmation Dialog Before Route Optimization

**File:** `src/components/CRM/FieldVisitPlanner.jsx` (line ~1574)

**Already covered in TASK 0.3** — the `modal.confirm()` wrapping. Ensure it's implemented there.

---

### TASK 5.7 — Fix `FieldVisitRouteView` Using Static `message` API

**File:** `src/components/CRM/FieldVisitRouteView.jsx` (line 2)

**Fix:** Replace:
```javascript
import { ..., message } from 'antd';
```
With:
```javascript
import { App } from 'antd';
// Inside component:
const { message } = App.useApp();
```

**Test:** Open route view → verify no antd warnings in console.

---

## PHASE 6: Trip Duplication Enhancement ✅ DONE

### TASK 6.1 — Verify and Enhance Clone Functionality

**File:** `server/routes/crm/field-trips.js` (POST /field-trips/:id/clone)

**Current state:** Clone endpoint exists and works. Creates a new trip with today's date, planning status, and copies stops (without outcomes) and legs (without dates).

**Enhancement needed:** After cloning, the user should be navigated to `/crm/visits/:newId/edit` to immediately start editing the cloned trip.

**Frontend fix** (in FieldVisitList.jsx or wherever the clone button is):
```javascript
const handleClone = async (tripId) => {
  try {
    const res = await axios.post(
      `${API_BASE}/api/crm/field-trips/${tripId}/clone`,
      {},
      { headers: getAuthHeaders() }
    );
    const newTripId = res.data?.data?.id;
    message.success('Trip duplicated! Opening for editing...');
    navigate(`/crm/visits/${newTripId}/edit`);
  } catch {
    message.error('Failed to duplicate trip');
  }
};
```

**Test:** Open a completed trip → click Duplicate → verify new trip opens in planner → verify all stops copied → verify dates are today → verify status is planning.

---

## Execution Order Summary

| Order | Task | Priority | Files Changed |
|-------|------|----------|---------------|
| 1 | TASK 0.1 | P0 | FieldVisitPlanner.jsx |
| 2 | TASK 0.2 | P0 | FieldVisitPlanner.jsx |
| 3 | TASK 0.3 | P0 | FieldVisitPlanner.jsx |
| 4 | TASK 0.4 | P0 | FieldVisitPlanner.jsx |
| 5 | TASK 0.5 | P0 | field-trips.js (backend) |
| 6 | TASK 0.6 | P0 | field-trips.js (backend) |
| 7 | TASK 1.1 | P0 | CRMModule.jsx |
| 8 | TASK 1.2 | P0 | FieldVisitPlanner.jsx |
| 9 | TASK 1.3 | P0 | FieldVisitList.jsx |
| 10 | TASK 1.4 | P0 | FieldVisitDetail.jsx |
| 11 | TASK 1.5 | P1 | FieldVisitPlanner.jsx |
| 12 | TASK 2.1 | P1 | FieldVisitPlanner.jsx |
| 13 | TASK 2.2 | P1 | FieldVisitPlanner.jsx |
| 14 | TASK 2.3 | P1 | FieldVisitPlanner.jsx |
| 15 | TASK 3.1 | P1 | FieldVisitInTrip.jsx |
| 16 | TASK 3.2 | P1 | FieldVisitInTrip.jsx |
| 17 | TASK 3.3 | P1 | FieldVisitInTrip.jsx |
| 18 | TASK 3.4 | P1 | FieldVisitInTrip.jsx |
| 19 | TASK 3.5 | P1 | FieldVisitInTrip.jsx |
| 20 | TASK 3.6 | P1 | FieldVisitInTrip.jsx + field-trips.js |
| 21 | TASK 3.7 | P1 | FieldVisitInTrip.jsx |
| 22 | TASK 4.1 | P1 | FieldVisitDetail.jsx |
| 23 | TASK 4.2 | P2 | FieldVisitDetail.jsx |
| 24 | TASK 5.1 | P1 | FieldVisitPlanner.jsx |
| 25 | TASK 5.2 | P2 | fieldVisitUtils.js, FieldVisitMap.jsx, FieldVisitPlanner.jsx |
| 26 | TASK 5.3 | P1 | FieldVisitPlanner.jsx |
| 27 | TASK 5.4 | P3 | FieldVisitList.jsx |
| 28 | TASK 5.5 | P2 | FieldVisitList.jsx |
| 29 | TASK 5.7 | P3 | FieldVisitRouteView.jsx |
| 30 | TASK 6.1 | P2 | FieldVisitList.jsx |

---

## Agent Coding Instructions

The implementing agent MUST follow these rules to avoid bugs:

### React / Frontend Rules
1. **NEVER call `setStops` inside another `setStops` callback.** Use `setTimeout(..., 0)` to schedule nested state updates.
2. **ALWAYS use `parseFloat()` when reading API values** for latitude/longitude. Never trust the API to return a number type.
3. **ALWAYS use `dayjs(...).isSame(other, 'day')` for date comparisons**, never string equality (`===`) for dates. This avoids timezone issues.
4. **When filtering arrays and showing indices**, always use `originalArray.indexOf(item)` to get the original index, not the `(item, idx)` from `.map()` on the filtered array.
5. **When adding `useEffect` dependencies**, include only the actual triggers. Use `// eslint-disable-next-line react-hooks/exhaustive-deps` when intentionally omitting deps (e.g., `resumeTrip` function in the load-on-mount effect).
6. **Use `App.useApp()` for antd message/notification/modal**, never the static import `import { message } from 'antd'`. Check existing patterns in the file.
7. **Test each task independently** before moving to the next. Don't batch multiple changes without verifying each works.
8. **Always add `e.stopPropagation()`** on buttons inside clickable cards to prevent the card click from also firing.
9. **Use `crypto.randomUUID()`** for generating unique IDs, not `Date.now()`.
10. **DO NOT break existing working features.** Before modifying a function, read its callers. After modifying, verify all callers still work.

### Backend Rules
1. **ALWAYS validate status transitions** using the `VALID_TRANSITIONS` map. Never trust the frontend to send valid transitions.
2. **ALWAYS validate array lengths** for stops/legs (max 50 stops per trip, max 20 legs per trip).
3. **Use transactions (`BEGIN`/`COMMIT`/`ROLLBACK`)** when updating multiple tables (e.g., trip + report status).
4. **Return proper HTTP status codes**: 400 for validation errors, 403 for auth errors, 404 for not found.
5. **The `PUT /field-trips/:id/full` endpoint** is the atomic full-replace used by auto-save. Never break this endpoint — it's the backbone of the auto-save system.

### Testing Checklist (Verify After Each Phase)
- [ ] Can create a new trip from scratch → save → verify in DB
- [ ] Can navigate to `/crm/visits/:id/edit` → trip loads → auto-save updates (not creates new)
- [ ] Draft trip in list → click → opens planner (not detail view)
- [ ] Completed trip in list → click → opens detail view
- [ ] Auto-save fires every 30s → updates existing trip → no orphan drafts
- [ ] Browser refresh while editing → beforeunload warning shown
- [ ] Route optimization with mixed GPS stops → correct order + warning toast
- [ ] Submit for approval → manager approves → status = confirmed
- [ ] Start trip → in-trip view → add stop → reorder → add notes → all persisted
- [ ] Mark all stops visited → submit travel report → manager approves → trip auto-completes
- [ ] Clone completed trip → new trip opens in planner → dates reset to today
- [ ] Status transition bypass via API → 400 error returned
- [ ] Check-in for wrong day's stop → 400 error returned
