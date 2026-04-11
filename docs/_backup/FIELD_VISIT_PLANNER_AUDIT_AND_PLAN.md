# Field Visit Planner - Audit and Implementation Plan

> **Generated:** March 17, 2026
> **Status:** Ready for Approval
> **Estimated Time:** 14-15 hours total

---

## Executive Summary

The Field Visit Planner is a sophisticated module for planning customer/prospect visit trips with GPS integration, route optimization, expense tracking, and approval workflows. This audit identified **4 critical bugs** and **4 missing features** that need implementation.

| Category | Status | Critical Issues |
|----------|--------|-----------------|
| Backend API | Partially Working | 2 issues |
| Frontend Components | Partially Working | 3 issues |
| Database Design | Bug Found | 1 issue |
| Workflow Logic | Incomplete | 2 issues |

---

## User Concept vs Current Implementation

| Phase | User Expectation | Current Status |
|-------|-----------------|----------------|
| 1. Draft/Planning | User starts planning, auto-saves, can stop and resume anytime | Partially Working |
| 2. Resume Editing | Click on saved trip -> continue planning | BUG - Opens read-only detail |
| 3. Submit Approval | Manager defined in org structure approves | Working |
| 4. Trip Execution | Real-time updates, add/remove stops, notes during travel | Working (partial) |
| 5. Close Trip | Submit travel report -> Manager reviews -> Close | Partially Working |
| 6. Duplicate Trip | Clone for future trips with new dates | Working |

---

## Critical Bugs Found

### BUG #1: Resume Planning Does NOT Work

**Current Behavior:**
- User clicks on a draft/planning trip in the list
- Navigates to `/crm/visits/:id` (FieldVisitDetail.jsx)
- Problem: This is a READ-ONLY view, not the planner!

**Evidence:**
```javascript
// FieldVisitList.jsx line ~180
<Card hoverable onClick={() => navigate(`/crm/visits/${trip.id}`)}>
```

**Fix Required:**
- Add route `/crm/visits/:id/edit` in App.jsx
- Modify FieldVisitPlanner to accept `:id` param and load existing trip
- Change FieldVisitList to navigate to edit route for draft/planning trips

**Files to Modify:**
- src/App.jsx
- src/components/CRM/FieldVisitPlanner.jsx
- src/components/CRM/FieldVisitList.jsx
- src/components/CRM/FieldVisitDetail.jsx

---

### BUG #2: Database Constraint Missing `location` Stop Type

**Migration SQL:**
```sql
CHECK (stop_type IN ('customer', 'prospect', 'supplier', 'other'))
```

**Backend Code:**
```javascript
const validStopTypes = ['customer', 'prospect', 'location'];
```

**Impact:** Database will REJECT `location` stops with constraint violation error!

**Fix Required:**
```sql
ALTER TABLE crm_field_trip_stops
DROP CONSTRAINT crm_field_trip_stops_stop_type_check;

ALTER TABLE crm_field_trip_stops
ADD CONSTRAINT crm_field_trip_stops_stop_type_check
CHECK (stop_type IN ('customer', 'prospect', 'supplier', 'location', 'other'));
```

---

### BUG #3: Auto-Save Creates Orphan Drafts

**Problem:**
- Auto-save runs every 30 seconds
- Creates a NEW draft trip even if user is editing existing trip
- `editingTripIdRef` is not set correctly when resuming

**Evidence:**
```javascript
// FieldVisitPlanner.jsx line 818
if (currentId) {
  // Update existing
} else {
  // Creates NEW draft!
  payload.status = 'draft';
  const res = await axios.post(`${API_BASE}/api/crm/field-trips`, payload, ...);
}
```

**Fix Required:**
- When loading a trip via `resumeTrip()`, set `editingTripId` correctly
- Ensure `formSnapshotRef` is populated with existing trip data
- Auto-save should UPDATE existing trip, not CREATE new

---

### BUG #4: My Trips Button is Duplicate

**Current State:**
- Header has "My Trips" button (opens modal with previous trips)
- Main list BELOW shows ALL trips
- Redundant UI

**Fix Options:**
1. Remove "My Trips" modal from header entirely
2. OR change it to "Resume Draft" with filtered list of incomplete trips only

---

## Missing Features

### MISSING #1: Edit Route for Planner

**Current Routes:**
- `/crm/visits/new` -> Planner (new trip)
- `/crm/visits/:id` -> Detail (read-only)
- MISSING: `/crm/visits/:id/edit` -> Does NOT exist!

**Required:**
1. Add route in App.jsx
2. Modify FieldVisitPlanner.jsx to accept `:id` param
3. Call `resumeTrip(id)` on mount if `:id` present

---

### MISSING #2: Stop Editing During Trip

**User Expectation:** "While traveling, user can change sequence, add customers"

**Current State:**
- FieldVisitInTrip.jsx allows marking stops complete
- Cannot ADD new stops mid-trip
- Cannot REORDER stops mid-trip
- Cannot DELETE stops mid-trip

**Fix Required:**
- Add UI to add/reorder stops during in-trip mode
- Backend already supports these operations

---

### MISSING #3: Trip Closure Workflow

**User Expectation:** "Trip closes when report submitted and approved by manager"

**Current State:** Partial
- Travel report exists (FieldVisitTravelReport.jsx)
- Manager can review/approve/reject
- Trip status NOT auto-set to `completed` after report approval

**Fix Required:**
```javascript
// In backend field-trips.js review-approval endpoint
if (decision === 'approved') {
  await pool.query(
    `UPDATE crm_field_trips SET status = 'completed' WHERE id = $1`,
    [tripId]
  );
}
```

---

## Working Features (No Changes Needed)

| Feature | Status | Location |
|---------|--------|----------|
| Auto-save every 30s | Working | FieldVisitPlanner.jsx:800-830 |
| GPS Check-in | Working | FieldVisitInTrip.jsx:140-180 |
| Manager Approval | Working | FieldVisitApprovalCard.jsx |
| Stop Outcomes | Working | FieldVisitInTrip.jsx:200-280 |
| Travel Report | Working | FieldVisitTravelReport.jsx |
| Expense Tracking | Working | Multi-currency with FX conversion |
| Clone Trip | Working | Backend /clone endpoint |
| PDF Export | Working | FieldVisitItineraryExport.js |
| Route Optimization | Working | Nearest-neighbor algorithm |
| Per-Stop Notes | Working | 8+ fields per stop |

---

## Implementation Plan

### PHASE 1: Fix Resume/Edit Flow (HIGH PRIORITY)

**Files to Modify:**
- src/App.jsx - Add route `/crm/visits/:id/edit`
- src/components/CRM/FieldVisitPlanner.jsx - Accept `:id` param, load existing trip
- src/components/CRM/FieldVisitList.jsx - Navigate to edit for draft/planning
- src/components/CRM/FieldVisitDetail.jsx - Add "Edit Trip" button

**Estimated Time:** 2-3 hours

---

### PHASE 2: Fix Database Constraint (CRITICAL)

**Action Required:**
Create migration file: `server/migrations/crm-021-fix-stop-type-constraint.js`

**Estimated Time:** 30 minutes

---

### PHASE 3: Fix Auto-Save for Existing Trips

**Files to Modify:**
- src/components/CRM/FieldVisitPlanner.jsx - Fix editingTripId initialization

**Estimated Time:** 1-2 hours

---

### PHASE 4: Enable In-Trip Stop Editing

**Files to Modify:**
- src/components/CRM/FieldVisitInTrip.jsx - Add stop management UI

**Estimated Time:** 3-4 hours

---

### PHASE 5: Complete Trip Closure Workflow

**Files to Modify:**
- server/routes/crm/field-trips.js - Set status to completed on report approval

**Estimated Time:** 1-2 hours

---

### PHASE 6: UI/UX Improvements

**Changes:**
1. Remove or repurpose "My Trips" button
2. Add "Continue Planning" buttons on trip cards
3. Add workflow status timeline in detail view

**Estimated Time:** 2-3 hours

---

## Priority and Time Estimates

| Priority | Phase | Issue | Est. Time |
|----------|-------|-------|-----------|
| P0 | Phase 2 | Database constraint crash | 30 min |
| P0 | Phase 1 | Resume planning broken | 3 hours |
| P1 | Phase 3 | Auto-save duplicates | 2 hours |
| P1 | Phase 5 | Trip closure incomplete | 2 hours |
| P2 | Phase 4 | In-trip stop editing | 4 hours |
| P2 | Phase 6 | UI/UX improvements | 3 hours |

**Total Estimated Time:** 14-15 hours

---

## Approval Checklist

Please confirm which phases to implement:

- [ ] Phase 1: Fix Resume/Edit Flow
- [ ] Phase 2: Fix Database Constraint
- [ ] Phase 3: Fix Auto-Save
- [ ] Phase 4: Enable In-Trip Stop Editing
- [ ] Phase 5: Complete Trip Closure Workflow
- [ ] Phase 6: UI/UX Improvements

**Or approve all with:** "Proceed with all phases"
