# ProPack CRM — Comprehensive Audit v2
### Against: CRM Complete Plan + Pre-Azure Groundwork + Bug Fix List
**Date:** 2026-03-07 | **Files audited:** 69 JSX/CSS/JS components

---

## Executive Summary

All 8 previously reported bugs are fixed. Major new features (Field Visit Planner, My Day rebuild, Email groundwork) are functionally present. However this audit identifies **6 new bugs**, **2 duplicate/dead-code issues**, **3 missing lifecycle features critical to the field visit flow**, and **11 design/UX gaps** that prevent this from being production-grade. The most critical issues are the missing trip status lifecycle (a trip created in planning can never be formally started or completed through the UI) and the HTML5 drag-and-drop in FieldVisitStopList which does not work on mobile at all — a major problem for a feature explicitly specified as mobile-primary.

---

## ✅ All 8 Previously Reported Bugs — Confirmed Fixed

| Bug | Fix Verified |
|---|---|
| FieldVisitMap Leaflet top-level import (Vite crash) | `import('leaflet')` dynamic in useEffect with cancel guard + `cancelled` flag preventing double-init ✅ |
| MyDaySchedule: no pulsing NOW divider | NOW divider injected at correct time index, amber pulse CSS in CRM.css ✅ |
| MyDaySchedule: no inline hover actions | Log / Held ✓ / Done ✓ / Snooze / Reschedule buttons with opacity hover-reveal via CSS ✅ |
| MyDayKPIBar: missing Revenue MTD | 6th KPI card with `revenueMtd` / `revenueTargetMtd`, target-based progress bar ✅ |
| MyDayPriorityActions: email rules 6 & 7 missing | `unread_email: cyan` + `awaiting_reply: purple` in TYPE_STYLE ✅ |
| MyDayNotifications: no unread dot | `<Badge dot color="blue" />` rendered when `!n.is_read` ✅ |
| MyDayCustomerHealth: no quick-action buttons | Phone / Mail / Note icon buttons, all three props wired in MyDayDashboard ✅ |
| "Log a Call" navigates instead of modal | Opens `CallCreateModal` with `quickCallCustomerId` state, loadData on close ✅ |

---

## 🔴 New Bugs

### Bug 1 — FieldVisitStopList.jsx: HTML5 native drag — completely broken on mobile
**Severity: Critical**

**File:** `FieldVisitStopList.jsx` lines 219–222

```jsx
draggable
onDragStart={() => onDragStart(idx)}
onDragOver={(e) => e.preventDefault()}
onDrop={() => onDrop(idx)}
```

The plan explicitly specified `@dnd-kit/sortable` for drag-and-drop. The agent used native HTML5 drag attributes instead. Native HTML5 drag events (`dragstart`, `dragover`, `drop`) **do not fire on touch screens** — iOS and Android completely ignore them. Since `FieldVisitInTrip.jsx` is specified as mobile-primary (and correctly uses `isMobile` breakpoints and `minHeight: 44` tap targets), a rep in the field who needs to reorder stops **cannot do so at all on their phone**. This is a critical gap for the core field visit use case.

**Fix:** Install `@dnd-kit/core` and `@dnd-kit/sortable` and rewrite the sortable list:

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

```jsx
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const SortableStop = ({ stop, ...props }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stop.local_id || stop.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return <div ref={setNodeRef} style={style} {...attributes} {...listeners}>{/* stop content */}</div>;
};

// In parent:
<DndContext collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
  if (active.id !== over?.id) {
    setStops(prev => arrayMove(prev, prev.findIndex(s => (s.local_id || s.id) === active.id), prev.findIndex(s => (s.local_id || s.id) === over.id)));
  }
}}>
  <SortableContext items={stops.map(s => s.local_id || s.id)} strategy={verticalListSortingStrategy}>
    {stops.map((s, idx) => <SortableStop key={s.local_id || s.id} stop={s} {...} />)}
  </SortableContext>
</DndContext>
```

---

### Bug 2 — FieldVisitDetail.jsx: followup_due uses plain `<Input>` not `<DatePicker>`
**Severity: Medium**

**File:** `FieldVisitDetail.jsx` line 237

```jsx
<Form.Item name="followup_due" label="Task Due Date" rules={[{ required: true }]}>
  <Input placeholder="YYYY-MM-DD" />
</Form.Item>
```

User must type the exact date string. If they type `15/03/2026` or `March 15` instead of `2026-03-15`, the `due_date` field sent to the API is wrong and silently stored as a bad value. `DatePicker` is already used in the same codebase (`FieldVisitPlanner.jsx`) for all other date fields.

**Fix:**
```jsx
import { DatePicker } from 'antd';
// ...
<Form.Item name="followup_due" label="Task Due Date" rules={[{ required: true }]}>
  <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
</Form.Item>
// Then in onFinish, format: dayjs(values.followup_due).format('YYYY-MM-DD')
```

---

### Bug 3 — FieldVisitRouteView.jsx: Map pin click navigates to wrong destination
**Severity: Medium**

**File:** `FieldVisitRouteView.jsx` line 219

```jsx
onOpenStop={(stop) => navigate(`/crm/visits/${id}`)}
```

Clicking any pin on the map navigates back to the trip detail — regardless of which customer or prospect the stop is for. The plan specified that the map popup should contain an "Open Customer →" link going to the customer's detail page. Currently the pins are decorative-only in terms of navigation.

**Fix:** Pass the stop's entity link:
```jsx
onOpenStop={(stop) => {
  if (stop.customer_id) navigate(`/crm/customers/${stop.customer_id}`);
  else if (stop.prospect_id) navigate(`/crm/prospects/${stop.prospect_id}`);
  else navigate(`/crm/visits/${id}`);
}}
```

Also update the Leaflet popup HTML in `FieldVisitMap.jsx` to include an action hint (the `onOpenStop` fires on marker click, which is correct, but the popup content currently has no visual "click to open" indicator).

---

### Bug 4 — MyDayFieldVisitBanner.jsx: No "Go In-Trip" shortcut for active trips
**Severity: Medium**

**File:** `MyDayFieldVisitBanner.jsx`

The banner shows "Open" and "View Route" buttons. When `trip.status === 'in_progress'`, the rep's primary action should be "Continue In-Trip" — going directly to the mobile-optimised in-trip mode where they can mark stops as visited. This is the single most important button for a rep who is actively on a trip. It's missing.

**Fix:** Add a conditional button:
```jsx
{trip.status === 'in_progress' && (
  <Button type="primary" size="small" icon={<EnvironmentOutlined />} onClick={onGoInTrip}>
    Continue In-Trip
  </Button>
)}
```
Wire `onGoInTrip={() => navigate('/crm/visits/${upcomingTrip.id}/in-trip')}` in `MyDayDashboard.jsx`.

---

### Bug 5 — FieldVisitDetail.jsx / FieldVisitList.jsx: Trip status lifecycle has no UI controls
**Severity: High — core workflow broken**

A trip is created by `FieldVisitPlanner.jsx` with `status: 'planning'`. The plan defines a lifecycle:
```
planning → confirmed → in_progress → completed
```

Neither `FieldVisitList` nor `FieldVisitDetail` has any buttons to advance the trip status. A rep can:
- See the status displayed as text ✅
- Open In-Trip mode (which bypasses the status check entirely) ✅
- Never formally confirm, start, or complete a trip ❌

The `MyDayFieldVisitBanner` correctly filters for `['planning', 'confirmed', 'in_progress']` trips but the status is always stuck at `planning` because there is no way to change it. The My Day banner will always show "Upcoming Field Visit" never "Active Field Visit" unless a backend sets the status separately.

**Fix — add to FieldVisitDetail header:**
```jsx
const handleTripStatus = async (newStatus) => {
  const token = localStorage.getItem('auth_token');
  const headers = { Authorization: `Bearer ${token}` };
  await axios.patch(`${API_BASE}/api/crm/field-trips/${id}`, { status: newStatus }, { headers });
  loadDetail();
};

// Buttons based on current status:
{trip.status === 'planning' && (
  <Button onClick={() => handleTripStatus('confirmed')}>Confirm Trip</Button>
)}
{trip.status === 'confirmed' && (
  <Button type="primary" onClick={() => handleTripStatus('in_progress')}>Start Trip</Button>
)}
{trip.status === 'in_progress' && (
  <Button onClick={() => handleTripStatus('completed')}>Complete Trip</Button>
)}
{!['completed', 'cancelled'].includes(trip.status) && (
  <Popconfirm title="Cancel this trip?" onConfirm={() => handleTripStatus('cancelled')}>
    <Button danger>Cancel</Button>
  </Popconfirm>
)}
```

---

### Bug 6 — FieldVisitDetail.jsx: "Complete" button enabled regardless of trip status
**Severity: Medium**

The stop "Complete" action button is always visible even when the trip is in `planning` status. A rep can log outcomes for stops on a trip that hasn't started yet, creating misleading activity records.

**Fix:** Disable or hide the Complete button when `trip.status` is not `in_progress`:
```jsx
<Button
  key="complete"
  type="link"
  icon={<CheckCircleOutlined />}
  disabled={trip.status !== 'in_progress'}
  title={trip.status !== 'in_progress' ? 'Start the trip first' : undefined}
  onClick={...}
>
  Complete
</Button>
```

---

## 🟡 Duplicate / Dead Code

### Duplicate 1 — CustomerEmailThread.jsx is now redundant dead code
**Severity: Medium-High**

`CustomerEmailThread.jsx` (344 lines) and `EntityEmailThread.jsx` (354 lines) are near-identical implementations. Both have the same functions: `parseRecipients`, `recipientsToText`, `getHeaders`, `loadEmails`, `filteredEmails`, `onToggleRead`, `onSendCompose`, `onOpenReply`, `onSendReply`. The only difference is `EntityEmailThread` accepts `customerId | prospectId | inquiryId` while `CustomerEmailThread` only accepts `customerId`.

`EmailThreadView.jsx` correctly routes prospects and inquiries to `EntityEmailThread`, but **still routes customers to `CustomerEmailThread`** instead of `EntityEmailThread`. This means `CustomerEmailThread` is now a dead-end fork that will diverge from `EntityEmailThread` over time.

**Fix:** In `EmailThreadView.jsx`, replace:
```jsx
if (customerId) {
  return <CustomerEmailThread customerId={customerId} />;
}
```
with:
```jsx
if (customerId) {
  return <EntityEmailThread customerId={customerId} title="Email Thread" />;
}
```
Then **delete `CustomerEmailThread.jsx`** entirely. One 354-line component replaces two.

---

### Duplicate 2 — index.js exports only 8 of 69 components
**Severity: Low-Medium**

`index.js` exports only the original 8 CRM components. All 61 new components — including `MyDayDashboard`, `FieldVisitPlanner`, `EmailComposeModal`, `EntityEmailThread`, `WorklistDetailDrawer`, `TaskWidget`, `DealPipeline` — are not exported from the module index. Any code that imports from `'./CRM'` or `'../CRM'` will not find any new components.

**Fix:** Add exports for all new components. At minimum the ones likely to be imported from outside the CRM folder:
```js
export { default as MyDayDashboard } from './MyDayDashboard';
export { default as FieldVisitPlanner } from './FieldVisitPlanner';
export { default as FieldVisitList } from './FieldVisitList';
export { default as EmailComposeModal } from './EmailComposeModal';
export { default as EntityEmailThread } from './EntityEmailThread';
export { default as WorklistDetailDrawer } from './WorklistDetailDrawer';
export { default as TaskWidget } from './TaskWidget';
export { default as DealPipeline } from './DealPipeline';
export { default as OutlookConnectSettings } from './OutlookConnectSettings';
```

---

## ❌ Still Missing (From Plan)

### Missing 1 — OutlookConnectSettings.jsx not built
The pre-azure groundwork document specified this component must be built now so it shows a "Coming Soon" state until Azure credentials are pasted. It is still absent from the codebase. Without it, `handleConnectOutlook` in `MyDayDashboard.jsx` has nowhere to navigate the user for connection management.

**Build as specified in pre-azure groundwork document.** The component:
- Calls `GET /api/auth/outlook/status` on load
- Shows "Coming Soon" with info alert when `azure_configured: false`
- Shows "Connect Outlook" button when configured but not connected
- Shows "Disconnect" + last synced when active
- Auto-activates when 3 env vars are added — zero code changes needed

---

### Missing 2 — FieldVisitList: no status filter or date range filter
The visit list loads all 100 trips in a flat list with no filtering. After 20+ trips this becomes unusable. A professional CRM field visit module needs:
- Status filter: All / Planning / Confirmed / In Progress / Completed / Cancelled
- Date range filter: upcoming / past 30 days / this month
- Country/region filter (especially relevant for GCC multi-country reps)

---

### Missing 3 — My Day Dashboard: Email Queue row is half-width with no right panel
The Email Queue is in a `<Col xs={24} lg={12}>` row but the right `<Col>` is empty. This leaves a blank half of the screen on desktop. The plan specified the right column should contain the full email queue (or alternatively this row should be full-width). Either fill the right column with the "3-Day Lookahead" (currently placed above in its own row) or make the email queue full-width.

---

## ⚠️ Design & UX Gaps

### UX 1 — MyDayKPIBar: Revenue MTD shows full number, overflows on small cards
`AED ${n.toLocaleString()}` for `revenueMtd` can produce "AED 1,234,567" — 13 characters that overflow a `lg={4}` card. All other KPI values are small integers. The currency card needs abbreviated formatting:

```js
const formatValue = (value, type) => {
  const n = safeNumber(value);
  if (type === 'currency') {
    if (n >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `AED ${(n / 1_000).toFixed(0)}K`;
    return `AED ${n}`;
  }
  return n.toLocaleString();
};
```

---

### UX 2 — MyDaySchedule: "Snooze" and "Reschedule" are identical actions
Both `snooze` and `reschedule` in `handleScheduleAction` in `MyDayDashboard.jsx` navigate to the worklist highlight URL — they do exactly the same thing. Having two buttons with different labels that do the same thing confuses reps. Per the plan, "Snooze" for priority actions means a server-side 24h suppress. For schedule items it should either be removed, or properly implemented as a 30-minute "remind me later" by rescheduling the item's time +30 mins. At minimum, remove the "Snooze" button from schedule items to avoid the duplication.

---

### UX 3 — FieldVisitStopList brief panel: "No brief data yet" on unloaded stops
```jsx
if (!brief) return <Text type="secondary">No brief data yet.</Text>;
```
The default state before a brief has been loaded reads as "No data" — which implies there's nothing to show. It should guide the rep:
```jsx
if (!brief) return (
  <Text type="secondary" style={{ fontStyle: 'italic' }}>
    Click "Load Brief" to see last orders, open deals, and packaging profile for this stop.
  </Text>
);
```

---

### UX 4 — FieldVisitDetail: stops are not sorted by stop_order
`trip.stops` from the API is rendered directly with `.dataSource={trip.stops}`. If the API returns stops in insertion order or random order, the list won't match the planned visit sequence. Always sort before rendering:
```jsx
const sortedStops = [...(trip.stops || [])].sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0));
```

---

### UX 5 — FieldVisitList: no "in-trip" shortcut for active trips
`FieldVisitList` shows all trips with "Route", "Report", "Open" buttons. When a trip is `in_progress`, the primary action should be "Continue →" navigating directly to `/crm/visits/${trip.id}/in-trip`. Currently the rep must Open → then click In-Trip Mode — two extra taps while in the field.

**Fix:** Add conditional action:
```jsx
trip.status === 'in_progress' && (
  <Button key="in-trip" type="primary" size="small" onClick={() => navigate(`/crm/visits/${trip.id}/in-trip`)}>
    Continue
  </Button>
)
```

---

### UX 6 — FieldVisitPlanner: loadPreVisitBrief makes 5 API calls per stop simultaneously
For a trip with 8 stops where the rep clicks "Load Brief" on all of them, that's 40 concurrent API calls. This will hit rate limits or cause server strain. The brief loading is already triggered manually per-stop which is good, but there's no debounce or loading queue.

**Recommendation:** Add a small delay and cap concurrent brief loads:
```js
// Simple guard: if already loading >3 briefs, queue the next one
const activeLoads = Object.values(briefLoadingByStop).filter(Boolean).length;
if (activeLoads >= 3) {
  message.info('Please wait for current briefs to finish loading.');
  return;
}
```

---

### UX 7 — FieldVisitMap: Leaflet CSS loaded via dynamic import — may cause FOUC
```js
await import('leaflet/dist/leaflet.css');
```
Dynamically importing CSS in a useEffect means the map renders without its styles for a brief moment (flash of unstyled content — map tiles appear but markers look wrong, controls unstyled). In Vite this typically works but some build configs defer CSS. The safer pattern for Vite is to add Leaflet CSS to the global stylesheet entry point once:

```css
/* In your global index.css or App.css — not inside a component */
@import 'leaflet/dist/leaflet.css';
```
Then remove the dynamic CSS import from `FieldVisitMap.jsx`. The JS should remain dynamic.

---

### UX 8 — MyDayDashboard: Schedule actions "Log" navigates away — loses My Day context
When a rep taps "Log" on a call in the schedule, `handleScheduleAction` navigates to `/crm/worklist?type=calls&highlight=...`. This takes them completely out of My Day. For a mobile rep trying to quickly mark 3 calls done before 9am, this is disruptive. The inline "Done ✓" and "Held ✓" work correctly (they patch in place). "Log" should ideally open the `ActivityLogDrawer` or `CallCreateModal` inline rather than routing away.

---

### UX 9 — EmailComposeModal: template variables sent as query params (GET /preview)
```js
axios.get(`/api/crm/email-templates/${id}/preview`, { params: templateVariables })
```
If `body_html` contains large content or if variable values are long (e.g., a paragraph of "next_steps"), query string length can exceed browser URL limits (~2000 chars in some proxies). Should be a POST:
```js
axios.post(`/api/crm/email-templates/${id}/preview`, { variables: templateVariables })
```
Update the backend route stub accordingly (change from GET to POST in `emailTemplates.js`).

---

### UX 10 — FieldVisitReport: download is HTML file, not PDF
```js
a.download = `field-trip-${id}-report.html`;
```
A professional field visit report sent to management should be a PDF. The HTML download is a reasonable interim solution but should be noted as a TODO. When the backend `/report` endpoint is built, it should return either a PDF blob or an HTML string that the frontend converts using `window.print()` into a print-ready PDF.

---

### UX 11 — CRMModule: Admin view has 13 tabs on one row — will overflow on smaller screens
The admin `tabOptions` array has 13 tab entries. On a 1280px screen with typical tab widths, this will overflow the single-row tab bar and be cut off. The Ant Design `Segmented` component used here has no built-in overflow scroll.

**Fix options:**
- Group secondary admin tabs (Analytics, Pipeline, Map, Products, Team) under a "More ▾" dropdown
- Or switch to a scrollable tab container: `<Tabs type="card" tabBarStyle={{ overflowX: 'auto' }} />`

---

## 📋 Recommended Action Order

### This sprint (blockers):

1. **Replace HTML5 DnD with @dnd-kit/sortable in FieldVisitStopList** — mobile stop reordering is completely broken
2. **Add trip status lifecycle buttons to FieldVisitDetail** — planning → confirmed → in_progress → completed
3. **Add "Continue In-Trip" to FieldVisitFieldVisitBanner and FieldVisitList** for `in_progress` trips
4. **Delete CustomerEmailThread.jsx** — route EmailThreadView customer branch to EntityEmailThread. 344 lines of dead code eliminated.
5. **Fix FieldVisitDetail followup_due: Input → DatePicker**
6. **Fix map pin click in FieldVisitRouteView** to navigate to customer/prospect, not back to trip

### Next sprint (UX polish):

7. Fix Revenue MTD number abbreviation in KPIBar
8. Remove duplicate "Snooze" from schedule items (or implement properly)
9. Fix FieldVisitStopList brief empty state message
10. Sort trip.stops by stop_order in FieldVisitDetail
11. Add status filter + "Continue" shortcut to FieldVisitList
12. Build OutlookConnectSettings.jsx (already fully specified in pre-azure groundwork doc)
13. Move Leaflet CSS to global stylesheet entry point
14. Fix EmailComposeModal template preview to POST not GET
15. Add FieldVisitDetail stop Complete button disabled state when trip not in_progress
16. Update index.js to export all new components

---

## ✅ What Is Working Correctly (Verified)

| Area | Verdict |
|---|---|
| BUG-05 token pattern | ✅ `localStorage.getItem('auth_token')` inside every callback throughout all files |
| Promise.all() parallel loading in MyDayDashboard | ✅ 9 requests fire in parallel with per-section progressive loading |
| `.catch(() => fallback)` error isolation | ✅ No single API failure crashes My Day |
| Leaflet dynamic import + cancel guard | ✅ Correct pattern, cancels if component unmounts before Leaflet loads |
| Nearest-neighbour route optimisation | ✅ Per-day bucket grouping + undated stops at end + haversine distance in RouteView |
| Pre-visit brief loading (5 API calls per stop) | ✅ Promise.allSettled() so partial failures don't break the brief |
| FieldVisitInTrip mobile-primary | ✅ isMobile breakpoints, minHeight: 44 tap targets, responsive modal width |
| WorklistDetailDrawer deal stage stepper | ✅ Linear stage progression, forward-only move buttons, LOSS_REASON_OPTIONS dropdown |
| WorklistDetailDrawer attendee add | ✅ Add attendee by name/email, PATCH to API |
| MyDayCustomerHealth "Visiting Today" teal badge | ✅ `cust.visiting_today` from API |
| MyDayFieldVisitBanner flag emoji + timing text | ✅ ISO2 lookup + correct days-to-start / days-left calculation |
| MyDayPriorityActions snooze → POST to API | ✅ `POST /api/crm/my-day/priority-actions/:id/snooze` |
| CustomerDetail: Emails tab, Field Visits tab, avg_reorder_cycle_days | ✅ All three added correctly |
| EmailThreadView prospect/inquiry routing | ✅ Now routes to EntityEmailThread with entity-scoped params |
| EntityEmailThread multi-entity support | ✅ customerId / prospectId / inquiryId, correct useMemo requestParams |
| FieldVisitPlanner draft-from-customers modal | ✅ Country scoping toggle, duplicate detection, lat/lng copied from customer |
| FieldVisitRouteView route optimise + export itinerary | ✅ Per-day bucket optimisation, TXT export with coordinates |
| MyDaySchedule NOW divider position logic | ✅ Correctly handles all-overdue (divider at top), all-future (divider at bottom), mixed |
| CRM.css hover-reveal schedule actions | ✅ `opacity: 0` → `opacity: 1` on `.myday-schedule-item:hover` |
| Page ownership contract (Home vs My Day) | ✅ No duplication — Home has multi-day lists, My Day has today-only schedule |
| ProspectLocationPicker | ✅ Clean wrapper around CustomerLocationPicker, no code duplication |
| FieldVisitInTrip outcome modal | ✅ visit/no_show/postponed/cancelled with conditional reason dropdowns |
| FieldVisitDetail follow-up task creation | ✅ Conditional form renders on followUp=true, passed as `follow_up_task` object |
| FieldVisitMap responsive scroll wheel | ✅ `scrollWheelZoom.disable()` on mobile via `window.innerWidth <= 768` |
| MyDayDashboard pickMyDayTrip rank logic | ✅ in_progress=0, in-window=1, starts-within-7-days=2, correct sort |
