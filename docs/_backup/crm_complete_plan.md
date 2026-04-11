**ProPack CRM**

**Complete Enhancement Plan**

My Day · Home · Field Visit Planner · Outlook Email Integration

**Prepared for: Development Agent**

**CRM type:** B2B Flexible Packaging --- GCC / Middle East

**Source files:** CRMHomePage · MyDayDashboard · CRMModule · CRMWorklist · WorklistDetailDrawer · CustomerDetail

**Sections:** 13 + Email Integration (7 sub-sections) + Master Build Order

**Table of Contents**

  -------- ------------------------------------------------------- ----------
  **1**    Current State Audit                                     3

  **2**    Page Ownership Map --- No Duplication Contract          4

  **3**    MyDayDashboard --- Full Overhaul                        5

  **4**    Email Draft Queue                                       8

  **5**    Field Visit Planner (New Module)                        9

  **6**    My Day × Field Visit Integration                        13

  **7**    Backend API --- My Day & Field Visits                   14

  **8**    New Component Files                                     16

  **9**    Map Implementation Detail                               17

  **10**   WorklistDetailDrawer Enhancements                       18

  **11**   CustomerDetail Enhancements                             19

  **12**   Outlook / Email Integration                             20

  **13**   Master Build Order (All Phases)                         30

  **14**   Critical Reminders --- Agent Rules                      32
  -------- ------------------------------------------------------- ----------

**1. Current State Audit**

Before building anything, understand precisely what each existing page owns --- to prevent any duplication.

**1.1 CRMHomePage.jsx**

  -----------------------------------------------------------------------------------------------------------------------
  **Component**           **Specification**
  ----------------------- -----------------------------------------------------------------------------------------------
  **Quick Create Bar**    \+ Task \| + Meeting \| + Call \| + Deal \| Worklist → buttons

  **My Activities**       Merged flat list of tasks + meetings + calls sorted by date. Multi-day scope, NOT today-only.

  **Mini Calendar**       Month-view grid with coloured event dots. Navigation arrows. NOT a time schedule.

  **My Leads**            Prospect list with approval status, source, country, created date.

  **Deal Pipeline**       Stage pill bars + open deal count + AED value total. \"Full View →\" link.

  **Modals**              TaskCreateModal, MeetingCreateModal, CallCreateModal, DealCreateModal --- all wired here.
  -----------------------------------------------------------------------------------------------------------------------

**1.2 MyDayDashboard.jsx**

  -----------------------------------------------------------------------------------------------------------------
  **Component**                **Specification**
  ---------------------------- ------------------------------------------------------------------------------------
  **Counter cards**            Overdue Tasks, Inquiries Awaiting Action, Not Contacted 30+ Days. Click-to-scroll.

  **Tasks panel**              Open tasks sorted by due date. View / navigate to linked record.

  **Inquiries panel**          Inquiries needing response with stage tag and age.

  **Recently Contacted**       Last 5 customers with activity in past 30 days.

  **Not Contacted 30+ Days**   Dormant customers sorted by staleness.

  **Activity Feed**            Today\'s feed via \<ActivityFeed\> component.
  -----------------------------------------------------------------------------------------------------------------

**1.3 The Gap --- What Is Missing**

**My Day is currently reactive --- it shows problems but does not guide action or support field work.**

-   Time-anchored TODAY schedule with a live NOW indicator

-   KPI scorecard vs daily/monthly targets

-   Smart priority actions engine (cold deals, unanswered proposals, reorder windows)

-   Customer health panel with colour-coded last-contact indicators

-   Notification / activity feed scoped to the rep

-   3-day lookahead with closing deals and deadlines

-   Email draft queue and Outlook send integration

-   Field Visit Planner --- geo-clustered route planning for country/city visits

-   Travel plan with customer stops, hotel, visa, objectives

-   Pre-visit brief per customer and post-visit outcome logging

-   Interactive geo-location map with route planning

**2. Page Ownership Map --- No Duplication Contract**

This is the binding contract for what lives where. Build strictly to this. Cross-link between pages instead of duplicating.

  -----------------------------------------------------------------------------------------------------------------
  **HOME --- CRMHomePage.jsx**                           **MY DAY --- MyDayDashboard.jsx**
  ------------------------------------------------------ ----------------------------------------------------------
  Multi-day activities list (tasks + meetings + calls)   Time-anchored TODAY schedule with live NOW line

  Month calendar grid (event dots, navigation)           3-day lookahead (closes, deadlines, upcoming meetings)

  My Leads / Prospect list                               Customer health panel (colour-coded by last contact)

  Deal pipeline snapshot (stage bars + totals)           Smart priority actions (cold deals, proposals, reorders)

  Quick Create buttons (Task, Meeting, Call, Deal)       KPI scorecard vs daily/monthly targets

  Modals for creation                                    Notification / activity feed scoped to rep

  ---                                                    Email summary + draft queue

  ---                                                    Field Visit Planner & Travel Plan

  ---                                                    Inline quick log call / quick log meeting outcome
  -----------------------------------------------------------------------------------------------------------------

**3. MyDayDashboard --- Full Overhaul**

Replace the current 4-row grid with a structured two-column layout. Preserve existing counter cards and list panels. All sections below are additive.

**3.1 Page Header + KPI Scorecard**

**P1 Build First**

-   Personalised greeting: \"Good morning, \[Name\]\" + today\'s date as eyebrow text

-   Sub-line: overdue count (red bold) + today\'s activity count, dynamically computed

-   \"Log a Call\" primary CTA button (amber) in header --- opens CallCreateModal pre-wired

-   \"Plan a Visit\" secondary button --- opens FieldVisitPlanner (Phase 3)

-   KPI scorecard: 6 metric cards in a horizontal row, each with coloured top border:

    -   Calls Today vs target --- from /api/crm/calls?date_from=today&status=held

    -   Meetings Held Today --- from /api/crm/meetings?date_from=today&status=held

    -   Tasks Completed Today --- from /api/crm/tasks?completed_today=true

    -   New Inquiries Today --- from /api/crm/my-day/summary

    -   Deals Advanced This Week --- stage_changed_this_week param on deals endpoint

    -   Revenue MTD vs monthly target --- from /api/crm/sales-report or budget endpoint

-   Each card: label (all-caps 11px), large number in accent colour, target sub-text, thin progress bar

**3.2 Time-Anchored Today Schedule (Left Column)**

**P1 Build First**

-   NOT the same as the activities list on Home. This shows ONLY today\'s items as a visual time schedule.

-   Merge tasks (due_date=today), meetings (date_start=today), calls (date_start=today)

-   Sort strictly ascending by time. Null times placed at end-of-day.

-   Insert a pulsing \"NOW\" divider at the current clock position (amber dot, animated)

-   Overdue items from yesterday float to the top with red chip

-   Each item: time (DM Mono), coloured spine dot, title, type chip, customer name, duration

-   Hover reveals inline action buttons: Log / Held ✓ / Done ✓ / Snooze / Reschedule

-   Active (happening now) item: amber-tinted card background

-   Completed items: dimmed text + light strikethrough

**3.3 Priority Actions (Left Column, Below Schedule)**

**P1 Build First**

-   Max 7 items, server-side ranked. Source: /api/crm/my-day/priority-actions

-   Rule 1 --- COLD DEAL: rep\'s deals with last_activity_date \> 14 days, stage ∈ {qualified, proposal, negotiation}

-   Rule 2 --- UNANSWERED PROPOSAL: inquiries in stage \"proposal_sent\" \> 3 days, no logged call or meeting since

-   Rule 3 --- REORDER WINDOW: customer with avg_reorder_cycle_days where (today − last_order_date) ≥ cycle × 0.9

-   Rule 4 --- NEW UNCONTACTED INQUIRY: assigned to rep, status=new, no activity within 24 hours

-   Rule 5 --- OVERDUE TASKS: due_date \< today AND status ≠ completed, capped at 3 items

-   Rule 6 --- UNREAD EMAIL: inbound from matched customer, unread \> 4 hours (Phase 2b)

-   Rule 7 --- AWAITING REPLY: outbound email, no inbound reply in same thread within 48h (Phase 2b)

-   Each item: icon pip, title, description, age label, contextual action buttons per type

-   Snooze: removes item for 24h, stored in user_preferences

**3.4 Customer Health Panel (Right Column)**

**P1 Build First**

-   Top 6--8 active customers sorted by health urgency: red → amber → green

-   GREEN: last_activity_date within 7 days

-   AMBER: last_activity_date 8--30 days ago

-   RED: last_activity_date \> 30 days ago or never contacted

-   Each row: coloured avatar, customer name, open deals + value, health badge (dot + days)

-   Hover: 3 quick-action buttons --- 📞 Log Call, ✉ Email Draft, 📝 Add Note (pre-filled with customer)

-   \"Visiting Today\" badge in teal if customer is a stop on today\'s field trip

**3.5 Activity Feed / Notifications (Right Column)**

**P2 Build Second**

-   Source: /api/crm/my-day/notifications --- max 6 items with \"See all\" link

-   Types: customer replied to proposal (green Reply badge), new inquiry assigned (blue New badge), deal stalled alert (red Alert badge), manager approval (grey Info badge)

-   Unread items: blue dot on right edge

**3.6 3-Day Lookahead (Right Column)**

**P2 Build Second**

-   Events for next 3--5 days: meetings, deal close dates, high-priority task deadlines

-   Each item: small date block (day + month abbrev), event name, sub-text, coloured type badge

-   Does NOT duplicate the calendar on Home --- it is a focused action list, not a month grid

**4. Email Draft Queue**

**P2 Build Second**

Tracks emails the rep needs to send today. Unified with the Outlook send flow in Section 12.

**4.1 Database Schema --- crm_email_drafts**

  ---------------------------------------------------------------------------------------------
  **Component**              **Specification**
  -------------------------- ------------------------------------------------------------------
  **id**                     UUID primary key

  **rep_id**                 FK → users.id

  **to_customer_id**         FK → customers.id (nullable)

  **to_prospect_id**         FK → prospects.id (nullable)

  **inquiry_id**             FK → inquiries.id (nullable)

  **to_emails**              JSONB \[{email, name}\] --- for multi-recipient

  **cc_emails**              JSONB

  **subject**                VARCHAR(255)

  **body_html**              TEXT --- full HTML body for Outlook send

  **body_notes**             TEXT --- rep\'s intent notes if not composing full HTML

  **template_id**            FK → crm_email_templates.id (nullable)

  **due_by**                 DATE --- when this should be sent

  **status**                 ENUM: pending / sent / cancelled

  **graph_draft_id**         Graph draft message ID (created on Outlook before sending)

  **sent_graph_msg_id**      Message ID after successful Graph send

  **send_via**               ENUM: outlook / smtp --- defaults to outlook if rep is connected

  **created_at / sent_at**   Timestamps
  ---------------------------------------------------------------------------------------------

**4.2 UI on My Day --- MyDayEmailQueue.jsx**

-   Compact card on right column, below Notifications

-   Header: \"Emails to Send Today\" + count badge + \"Compose\" button

-   Each row: recipient name + subject + linked inquiry number + due time

-   Action buttons per row: \"Send via Outlook\" / \"Mark Sent\" / \"Edit\" / \"Skip Today\"

-   \"Mark Sent\" or \"Send via Outlook\" creates an Activity log entry linked to the customer

**5. Field Visit Planner --- New Module**

**The most impactful new feature for a B2B packaging sales rep covering GCC and international territories.**

CustomerDetail already stores lat/lng via CustomerLocationPicker --- this module builds the route planning layer on top of it.

**5.1 Where It Lives**

-   New tab in CRMModule for sales reps: value=\"visits\", label=\"Field Visits\", icon=\<EnvironmentOutlined\>

-   Routes: /crm/visits (list), /crm/visits/new (plan), /crm/visits/:id (detail), /crm/visits/:id/route (map)

-   Surfaced on My Day: \"Upcoming Field Visits\" card + \"Plan a Visit\" CTA in page header

**5.2 Database Schema**

**Table: crm_field_trips**

  ------------------------------------------------------------------------------------------------
  **Component**                 **Specification**
  ----------------------------- ------------------------------------------------------------------
  **id**                        UUID

  **rep_id**                    FK → users.id

  **title**                     VARCHAR --- e.g. \"Riyadh Run --- June 2025\"

  **country**                   VARCHAR

  **cities**                    JSON array of cities

  **departure_date**            DATE

  **return_date**               DATE

  **status**                    ENUM: planning / confirmed / in_progress / completed / cancelled

  **travel_notes**              TEXT --- visa, hotel, flight info

  **objectives**                TEXT --- overall trip goals

  **created_at / updated_at**   Timestamps
  ------------------------------------------------------------------------------------------------

**Table: crm_field_trip_stops**

  ---------------------------------------------------------------------------------
  **Component**              **Specification**
  -------------------------- ------------------------------------------------------
  **id**                     UUID

  **trip_id**                FK → crm_field_trips.id

  **stop_order**             INTEGER --- sequence in route

  **stop_type**              ENUM: customer / prospect / supplier / other

  **customer_id**            FK → customers.id (nullable)

  **prospect_id**            FK → prospects.id (nullable)

  **visit_date**             DATE

  **visit_time**             TIME (nullable)

  **duration_mins**          INTEGER

  **latitude / longitude**   DECIMAL --- from CustomerLocationPicker or geocoded

  **address_snapshot**       TEXT --- cached for offline display

  **objectives**             TEXT --- goals for this specific stop

  **pre_visit_notes**        TEXT --- auto-populated from customer history

  **outcome_notes**          TEXT --- filled after visit

  **outcome_status**         ENUM: visited / no_show / postponed / cancelled

  **follow_ups_created**     BOOLEAN

  **meeting_id**             FK → meetings.id --- auto-created on stop completion
  ---------------------------------------------------------------------------------

**5.3 Component: FieldVisitPlanner.jsx --- 5 Steps**

**Step 1 --- Trip Setup Form**

-   Fields: title, country (from COUNTRY_REGIONS map in CustomerDetail), cities, departure, return date, travel notes (hotel / flight / visa)

-   \"Draft from My Customers\" --- popup of rep\'s customers filtered by country, checkbox to add as stops

-   \"Draft from Prospects\" --- same for prospects

-   Selected stops auto-populate with name, address, and coordinates from customer record

**Step 2 --- Stop List Editor (FieldVisitStopList.jsx)**

-   Drag-and-drop reorder using \@dnd-kit/sortable (lighter than react-beautiful-dnd)

-   Each stop card: stop number, name, visit date/time selector, duration, objectives textarea

-   \"Optimise Route\" button --- runs nearest-neighbour greedy algorithm client-side, updates stop_order

-   Add custom stop (hotel, exhibition, supplier)

-   Pre-Visit Brief section per stop (auto-populated from customer record):

    -   Last 3 orders: product type, quantity, date

    -   Open deals and their stage

    -   Last meeting/call notes

    -   Open tasks linked to this customer

    -   Packaging profile summary from PackagingProfile component

**Step 3 --- Interactive Map View (FieldVisitMap.jsx)**

**P1 Core of the Feature**

-   Library: react-leaflet with OpenStreetMap tiles (free, no API key)

-   Check CustomerLocationPicker --- if it uses Google Maps, use same key for consistency

-   Numbered pins per stop, colour-coded: customer=blue, prospect=amber, supplier=purple, other=grey

-   Click pin → popup: customer name, visit time, objectives, \"Open Customer →\" button

-   Route line: L.Polyline connecting stops in order (straight lines, no routing API needed)

-   Optional: leaflet-routing-machine for driving route if budget allows

-   Day filter for multi-day trips --- show/hide stops by day

-   Controls: zoom to fit all pins, satellite toggle, route line toggle

-   \"Export Route\" generates plain-text day-by-day itinerary

**Step 4 --- In-Trip Mode (FieldVisitInTrip.jsx)**

**P2 Mobile-Critical**

-   When trip status=in_progress AND today is within trip dates, My Day shows an \"Active Field Visit\" amber banner

-   Simplified view: today\'s stops only, large tap targets, minimal text

-   \"I\'m Here\" → marks stop as visited, records arrival time, opens outcome form

-   Outcome form: notes, result dropdown (Positive / Neutral / Needs Follow-up / No Answer), quick task creation

-   \"I\'m Here\" auto-creates a CRM meeting record (status=held, linked to customer, outcome notes)

-   \"No Show\" / \"Postpone\" buttons with reason dropdown

**Step 5 --- Post-Trip Summary (FieldVisitReport.jsx)**

-   Auto-triggers when return_date has passed --- trip moves to status=completed

-   Summary: stops visited vs planned, outcomes, follow-up tasks created, deals advanced during trip

-   \"Generate Trip Report\" → structured HTML/PDF summary for manager

**5.4 Route Optimisation Algorithm**

-   Nearest-neighbour greedy algorithm --- sufficient for 3--10 stops per day:

    -   Start from first stop (or hotel location if provided)

    -   At each step, find closest unvisited stop by Haversine distance

    -   Return reordered array, update stop_order via PUT /api/crm/field-trips/:id/stops/reorder

-   Optimise per-day independently for multi-day trips (respect fixed-date stops)

-   Do NOT use Google Maps Directions API for optimisation --- too costly. Greedy is accurate enough.

**5.5 Coordinate Data Strategy**

-   CustomerDetail already has CustomerLocationPicker --- lat/lng exist on customer records

-   Prospects: add lat/lng fields to prospects table + ProspectLocationPicker modal (copy CustomerLocationPicker)

-   Fallback: Nominatim geocoding (free OpenStreetMap): GET https://nominatim.openstreetmap.org/search?q={address}&format=json

-   Cache geocoding result in stop\'s lat/lng fields --- runs once only

-   No coordinates at all: pin at city centre using country→default coordinates lookup

**6. My Day × Field Visit Integration**

Field visits and My Day must be tightly integrated so the rep\'s daily view is enriched on travel days.

-   If trip is active or starts within 7 days: show \"Upcoming Field Visit\" card on My Day right column

-   Card: trip title, country flag emoji, dates, stop count, \"View Route\" button

-   On a field visit day: Today\'s Schedule auto-includes today\'s stops as VISIT entries (purple dot, planned time)

-   Priority Actions suppresses dormant customer alerts for customers in today\'s trip stops

-   Customer Health badge shows \"Visiting Today\" in teal for customers in today\'s trip

-   \"Plan a Visit\" CTA added to My Day header alongside \"Log a Call\"

**7. Backend API Endpoints**

All follow existing /api/crm/\* convention. Auth: Bearer token from localStorage (BUG-05 pattern).

**7.1 My Day --- New & Extended Endpoints**

  --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Component**                                          **Specification**
  ------------------------------------------------------ -------------------------------------------------------------------------------------------------------------------------------------------
  **GET /api/crm/my-day/summary**                        EXTEND: add calls_today, meetings_today, tasks_completed_today, new_inquiries_today, deals_advanced_week, revenue_mtd, revenue_target_mtd

  **GET /api/crm/my-day/schedule**                       NEW: today-scoped tasks+meetings+calls merged by time. Param: include_overdue=true for yesterday\'s items

  **GET /api/crm/my-day/priority-actions**               NEW: max 7 rule-ranked alerts. Response: \[{type, entity_id, title, description, age_days, action_label}\]. Snoozed excluded.

  **POST /api/crm/my-day/priority-actions/:id/snooze**   NEW: snooze for 24h, stored in user_preferences as snooze:{type}:{entity_id}

  **GET /api/crm/my-day/customer-health**                NEW: rep\'s customers with last_activity_date, health_status, open_deal_count, open_deal_value. Sort: red first.

  **GET /api/crm/my-day/lookahead**                      NEW: events for next 5 days --- meetings, closing deals, urgent tasks. Param: days=5

  **GET /api/crm/my-day/notifications**                  NEW: up to 20 rep-scoped notifications. Fields: type, title, body, entity_id, is_read, created_at

  **PATCH /api/crm/my-day/notifications/:id/read**       NEW: mark notification as read

  **GET /api/crm/my-day/email-summary**                  NEW: unread_from_customers, awaiting_reply, emails_today, top_unread (max 3 previews)
  --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**7.2 Email Draft Queue**

  ---------------------------------------------------------------------------------------------------------------------------------------------------------
  **Component**                          **Specification**
  -------------------------------------- ------------------------------------------------------------------------------------------------------------------
  **GET /api/crm/email-drafts**          Rep\'s drafts. Param: due_today=true

  **POST /api/crm/email-drafts**         Create draft. Body: {to_customer_id, to_emails, subject, body_html, body_notes, due_by, inquiry_id, template_id}

  **PATCH /api/crm/email-drafts/:id**    Update: status, body, recipients

  **DELETE /api/crm/email-drafts/:id**   Delete draft
  ---------------------------------------------------------------------------------------------------------------------------------------------------------

**7.3 Field Visit Planner**

  ----------------------------------------------------------------------------------------------------------------------------------------
  **Component**                                              **Specification**
  ---------------------------------------------------------- -----------------------------------------------------------------------------
  **GET /api/crm/field-trips**                               Rep\'s trips. Params: status, upcoming=true

  **POST /api/crm/field-trips**                              Create trip

  **GET /api/crm/field-trips/:id**                           Trip + all stops with customer/prospect details

  **PATCH /api/crm/field-trips/:id**                         Update header. Status transitions: planning→confirmed→in_progress→completed

  **DELETE /api/crm/field-trips/:id**                        Delete (planning status only)

  **POST /api/crm/field-trips/:id/stops**                    Add stop

  **PUT /api/crm/field-trips/:id/stops/reorder**             Reorder stops. Body: \[{id, stop_order}\]

  **PATCH /api/crm/field-trips/:id/stops/:stopId**           Update stop (outcome, notes, status)

  **DELETE /api/crm/field-trips/:id/stops/:stopId**          Remove stop

  **POST /api/crm/field-trips/:id/stops/:stopId/complete**   Mark visited. Auto-creates meeting record.

  **GET /api/crm/field-trips/:id/route-preview**             Returns stops with coordinates. Routing done client-side.

  **GET /api/crm/field-trips/:id/report**                    Returns trip summary as HTML string
  ----------------------------------------------------------------------------------------------------------------------------------------

**8. New Component Files**

All in /src/components/CRM/. Add new CSS classes to CRM.css --- do not refactor existing ones.

**8.1 New Files to Create**

  --------------------------------------------------------------------------------------------------------------------------
  **Component**                    **Specification**
  -------------------------------- -----------------------------------------------------------------------------------------
  **MyDaySchedule.jsx**            Time-anchored timeline. Props: date, onLogCall, onLogMeeting, onCompleteTask

  **MyDayKPIBar.jsx**              Horizontal KPI scorecard. Props: targets. Source: /my-day/summary

  **MyDayPriorityActions.jsx**     Priority action stack. Props: onAction. Source: /my-day/priority-actions

  **MyDayCustomerHealth.jsx**      Customer health panel. Props: onQuickCall, onQuickNote. Source: /my-day/customer-health

  **MyDayNotifications.jsx**       Notification feed. Props: limit. Source: /my-day/notifications

  **MyDayLookahead.jsx**           3-day lookahead card. Props: days. Source: /my-day/lookahead

  **MyDayEmailQueue.jsx**          Email draft queue card. Props: onAdd. Source: /email-drafts?due_today=true

  **MyDayFieldVisitBanner.jsx**    Active/upcoming trip banner. Links to /crm/visits/:id/route

  **EmailComposeModal.jsx**        Full compose modal with template selector. Replaces EmailDraftModal.

  **EmailDraftModal.jsx**          Lightweight draft-only modal (no Outlook required). Fallback.

  **EmailThreadView.jsx**          Threaded email view for CustomerDetail and InquiryDetail

  **OutlookConnectSettings.jsx**   OAuth connect/disconnect UI for rep settings

  **FieldVisitPlanner.jsx**        Main trip planner --- 5-step stepper

  **FieldVisitStopList.jsx**       Drag-and-drop stop editor with pre-visit brief

  **FieldVisitMap.jsx**            react-leaflet map with numbered pins, route line, day filter

  **FieldVisitInTrip.jsx**         Mobile-friendly in-trip mode with outcome logging

  **FieldVisitReport.jsx**         Post-trip summary view with export

  **FieldVisitList.jsx**           List of all trips with status badges, New Trip CTA
  --------------------------------------------------------------------------------------------------------------------------

**8.2 Files to Modify**

  ---------------------------------------------------------------------------------------------------------------------------------------------------
  **Component**                  **Specification**
  ------------------------------ --------------------------------------------------------------------------------------------------------------------
  **MyDayDashboard.jsx**         Replace row grid with 2-column layout. Import all new sub-components. Preserve counter cards.

  **CRMModule.jsx**              Add \"visits\" tab. Add Route path=\"visits/\*\". Update getActiveTab(). Add \"email-settings\" to settings route.

  **CustomerDetail.jsx**         Add \"Emails\" tab (EmailThreadView). Add \"Field Visits\" tab. Add avg_reorder_cycle_days to edit form.

  **WorklistDetailDrawer.jsx**   Add Log Outcome section for calls/meetings. Add deal stage stepper. Add loss reason dropdown.

  **CRMHomePage.jsx**            No structural changes. Add \"Active Trip\" indicator to Quick Actions Bar if a trip is in_progress.
  ---------------------------------------------------------------------------------------------------------------------------------------------------

**9. Map Implementation --- Technical Detail**

**CRITICAL DECISION: Check CustomerLocationPicker first.**

If CustomerLocationPicker uses Google Maps API, use the same key for FieldVisitMap to avoid dual dependencies. If it uses a plain input, use Leaflet.

**9.1 Leaflet.js (Recommended Default)**

  -------------------------------------------------------------------------------------------------------------------------------------
  **Component**           **Specification**
  ----------------------- -------------------------------------------------------------------------------------------------------------
  **npm packages**        leaflet, react-leaflet, \@react-leaflet/core --- optionally leaflet-routing-machine

  **Base tiles**          OpenStreetMap: https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png --- free, no key

  **Premium tiles**       Mapbox tiles with token --- use mapbox/streets-v12 style for polished look

  **Markers**             L.DivIcon with custom HTML for numbered coloured pins (number = stop_order)

  **Route line**          L.Polyline connecting stops in order --- straight lines, works offline, no API cost

  **Driving route**       leaflet-routing-machine if needed --- uses OSRM (free open-source routing)

  **Clustering**          leaflet.markercluster if many stops in same city

  **Popup**               Custom HTML: customer name, visit time, objectives, \"Open\" button

  **Bounds**              map.fitBounds(allCoordinates) on mount so all pins visible

  **Vite / SSR**          Import Leaflet dynamically inside useEffect. Add import \'leaflet/dist/leaflet.css\' in the component only.

  **Mobile scroll**       Disable scrollWheelZoom on mobile to prevent accidental zoom while scrolling page
  -------------------------------------------------------------------------------------------------------------------------------------

**10. WorklistDetailDrawer --- Targeted Enhancements**

The drawer is already well-built. These additions make it the rep\'s primary action surface without navigating away.

**10.1 Log Outcome (Calls and Meetings)**

**P2 Build Second**

-   When type=calls or meetings AND status=held: show \"Log Outcome\" section

-   Fields: outcome textarea, result dropdown (Positive / Neutral / Needs Follow-up / No Answer)

-   Optional follow-up task checkbox: shows quick task form (title + due date) if checked

-   Save: PATCH call/meeting AND optionally POST new task in one sequence

**10.2 Deal Stage Stepper**

**P2 Build Second**

-   When type=deals: show horizontal stage stepper above details

-   Stages: interest → qualified → proposal → negotiation → won / lost

-   Clicking a future stage shows Popconfirm before advancing

-   Moving to \"lost\" requires loss reason dropdown: Pricing / Competition / Requirement Mismatch / No Budget / Other

**10.3 Attendee Management (Meetings)**

-   \"Add Attendee\" inline button --- appends to attendees array and saves via PATCH

-   Show attendee names with avatar icons

**11. CustomerDetail --- Targeted Enhancements**

**11.1 Emails Tab (Phase 2b)**

**P2 Build Second**

-   New \"Emails\" tab in CustomerDetail tab bar

-   Shows all crm_emails where customer_id = this customer, grouped by conversation thread

-   Filter bar: All / Inbound / Outbound / With Attachments / Unread

-   Search: subject + body_preview

-   \"Send Email\" CTA opens EmailComposeModal pre-filled with customer

**11.2 Field Visits Tab (Phase 3)**

**P3 Build Third**

-   Shows all field trips that included this customer as a stop

-   Each row: trip title, visit date, outcome status badge, outcome notes preview

-   \"Add to a Trip\" button --- modal to select an existing planning trip and add this customer as a stop

**11.3 Avg Reorder Cycle Field**

**P3 Build Third**

-   Add avg_reorder_cycle_days: editable number input in CustomerDetail edit form

-   Label: \"Avg. Reorder Cycle (days)\" --- shown in customer header stats if set

-   Drives Priority Actions Rule 3. Without this field, the reorder rule cannot fire.

**12. Outlook / Email Integration**

**This section incorporates and significantly extends the agent\'s initial email proposal, correcting 10 critical gaps.**

**12.1 Scrutiny of the Initial Proposal**

The agent\'s summary was directionally correct. The following gaps would have caused production failures:

  ------------------------------------------------------------------------------------------------------------------------------------------------------
  **Component**                       **Specification**
  ----------------------------------- ------------------------------------------------------------------------------------------------------------------
  **Refresh token encryption**        MISSING. Storing OAuth tokens in plaintext is a critical vulnerability. AES-256-GCM required.

  **Silent token refresh logic**      MISSING. Access tokens expire in 60 min. Without silent refresh, sync silently breaks for all reps after 1 hour.

  **Webhook renewal mechanism**       MENTIONED but not solved. Subscriptions expire every 3 days. A renewal cron job is required.

  **Graph API rate limiting**         MISSING. No throttle-handling strategy. With 10 reps polling, 429s will occur without backoff.

  **Email deduplication key**         MISSING. Overlapping cron runs create duplicate email records without a DB unique constraint.

  **Email-to-customer matching**      VAGUE. Exact + domain + contact matching logic with generic domain exclusions is required.

  **Attachment handling**             MISSING. Packaging reps routinely receive PDF specs and signed POs by email.

  **Compose UI and templates**        MISSING. No CRM compose modal, no template system, no inquiry-to-email linkage.

  **Email draft queue unification**   MISSING. The draft queue from the main plan was not connected to Outlook send.

  **First sync scoping**              MISSING. Without a startDate limit on first sync, the entire inbox history is imported.

  **Webhook 202 response**            MISSING. Graph will retry if handler takes \>3s. Must queue and return 202 immediately.

  **State parameter validation**      MISSING. OAuth state forgery possible without validating state on callback.
  ------------------------------------------------------------------------------------------------------------------------------------------------------

**12.2 Architecture Decision**

**Use polling for Phase 1 (every 10 minutes), migrate to webhooks in Phase 3b.**

-   Reason: webhooks require public HTTPS + reliable renewal cron. Polling is sufficient for B2B where response times are measured in hours.

-   Polling interval: 10 minutes. Concurrency: max 3 mailboxes simultaneously with 2s gap between batches.

**12.3 Token Security Model**

**All refresh tokens and access tokens must be encrypted at rest using AES-256-GCM.**

+-------------------------------------------------------------------------------------------------------------------------------+
| // Environment variable required:                                                                                             |
|                                                                                                                               |
| // OUTLOOK_TOKEN_ENCRYPTION_KEY = openssl rand -hex 32                                                                        |
|                                                                                                                               |
| const crypto = require(\'crypto\');                                                                                           |
|                                                                                                                               |
| const ALGO = \'aes-256-gcm\';                                                                                                 |
|                                                                                                                               |
| const KEY = Buffer.from(process.env.OUTLOOK_TOKEN_ENCRYPTION_KEY, \'hex\');                                                   |
|                                                                                                                               |
| function encryptToken(plaintext) {                                                                                            |
|                                                                                                                               |
| const iv = crypto.randomBytes(16);                                                                                            |
|                                                                                                                               |
| const cipher = crypto.createCipheriv(ALGO, KEY, iv);                                                                          |
|                                                                                                                               |
| const enc = Buffer.concat(\[cipher.update(plaintext, \'utf8\'), cipher.final()\]);                                            |
|                                                                                                                               |
| return JSON.stringify({ iv: iv.toString(\'hex\'), tag: cipher.getAuthTag().toString(\'hex\'), data: enc.toString(\'hex\') }); |
|                                                                                                                               |
| }                                                                                                                             |
+-------------------------------------------------------------------------------------------------------------------------------+

**12.4 Database Schema**

**Table: crm_outlook_connections**

  -----------------------------------------------------------------------------------------------------
  **Component**                     **Specification**
  --------------------------------- -------------------------------------------------------------------
  **user_id (UNIQUE)**              FK → users.id ON DELETE CASCADE. One connection per rep.

  **microsoft_account_id**          Azure AD object ID

  **email_address**                 The mailbox email address

  **access_token_enc**              AES-256-GCM encrypted access token

  **refresh_token_enc**             AES-256-GCM encrypted refresh token

  **token_expires_at**              TIMESTAMPTZ --- check before every Graph call

  **delta_link**                    Graph delta query link --- key to incremental sync (not optional)

  **last_synced_at**                TIMESTAMPTZ

  **connection_status**             ENUM: active / expired / revoked / error

  **error_message**                 Last sync error string

  **webhook_subscription_id**       Graph subscription ID (Phase 3b)

  **webhook_subscription_expiry**   TIMESTAMPTZ --- renewal cron checks this
  -----------------------------------------------------------------------------------------------------

**Table: crm_emails**

  ------------------------------------------------------------------------------------------------------------------------------------------
  **Component**                                        **Specification**
  ---------------------------------------------------- -------------------------------------------------------------------------------------
  **graph_message_id**                                 Graph message ID --- UNIQUE(rep_user_id, graph_message_id) deduplication constraint

  **graph_conversation_id**                            Thread ID --- groups emails into conversations

  **internet_message_id**                              RFC 5322 Message-ID --- cross-mailbox dedup for forwarded emails

  **customer_id / prospect_id / inquiry_id**           CRM linkage FKs (nullable)

  **match_confidence**                                 ENUM: exact / domain / contact / manual / none

  **direction**                                        ENUM: inbound / outbound

  **subject / body_preview / body_html**               body_html stored on-demand only (fetch via Graph when opened)

  **from_email / from_name / to_emails / cc_emails**   JSONB arrays for recipients

  **received_at / sent_at**                            Timestamps

  **is_read / importance / has_attachments**           State fields

  **crm_status**                                       ENUM: captured / replied / archived / ignored

  **is_hidden**                                        Rep-controlled --- hides email from CRM view without deleting activity
  ------------------------------------------------------------------------------------------------------------------------------------------

**Table: crm_email_attachments**

  -----------------------------------------------------------------------------------------------------------------------
  **Component**                               **Specification**
  ------------------------------------------- ---------------------------------------------------------------------------
  **email_id**                                FK → crm_emails.id ON DELETE CASCADE

  **graph_attach_id**                         Graph attachment ID --- used for on-demand content fetch

  **filename**                                VARCHAR(255)

  **content_type / size_bytes / is_inline**   Metadata fields

  **content_base64**                          Nullable --- only fetched on demand or for packaging-relevant PDFs \< 5MB
  -----------------------------------------------------------------------------------------------------------------------

**Table: crm_email_templates**

  --------------------------------------------------------------------------------------------------------------------
  **Component**             **Specification**
  ------------------------- ------------------------------------------------------------------------------------------
  **name / category**       Template name and category (proposal / follow_up / quotation / intro / reorder_reminder)

  **subject / body_html**   Template content with {{variable}} placeholders

  **variables**             JSONB \[{key, label, default}\]

  **is_shared**             BOOLEAN --- visible to all reps or private

  **use_count**             INTEGER --- analytics on most-used templates
  --------------------------------------------------------------------------------------------------------------------

**12.5 Azure App Registration (One-Time)**

-   Go to portal.azure.com → Azure AD → App Registrations → New Registration

-   Name: \"ProPack CRM\". Supported accounts: Any org + personal Microsoft accounts

-   Redirect URI: https://your-crm.com/api/auth/outlook/callback (Web type)

-   API Permissions --- Delegated: Mail.Read, Mail.ReadWrite, Mail.Send, offline_access, User.Read

-   Grant admin consent in the tenant (required for Mail scopes in most M365 orgs)

-   Environment variables: OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, OUTLOOK_TENANT_ID (use \"common\"), OUTLOOK_REDIRECT_URI, OUTLOOK_TOKEN_ENCRYPTION_KEY

**12.6 Key Backend Services**

**outlookAuthService.js**

-   getAuthUrl(state): Generates Microsoft consent URL. state = rep\'s user_id (validated on callback).

-   exchangeCodeForTokens(code): Called in /callback route. Stores encrypted tokens.

-   refreshAccessToken(encryptedRefreshToken): Silent refresh. Updates DB. Marks connection expired on failure.

**ensureOutlookToken middleware**

-   Called before every Graph API operation. Checks token_expires_at minus 5-minute buffer.

-   If valid: decrypts and returns access token. If expired: calls silent refresh, updates DB, returns new token.

-   On refresh failure: sets connection_status=\'expired\', throws OUTLOOK_TOKEN_EXPIRED --- caught by callers.

**outlookSyncService.js --- Delta Query (MANDATORY)**

-   Uses Graph delta queries --- fetches only NEW/CHANGED messages since last sync. Not optional.

-   Saves delta_link after each cycle. Next sync starts from that link --- no full-mailbox fetch.

-   First sync: set startDate = 30 days ago. Do NOT sync full inbox history on connect.

-   Also syncs Sent Items folder for outbound tracking.

**emailMatchingService.js**

-   Match order: 1) Exact email match in customer.email, 2) Contact match in crm_contacts, 3) Domain match against customer website, 4) Prospect email match

-   Generic domain exclusion list: gmail.com, yahoo.com, hotmail.com, outlook.com, live.com, icloud.com, msn.com

-   No match: email stored with match_confidence=\'none\'. Rep can manually link via UI.

**outlookSyncJob.js --- Cron**

-   Runs every 10 minutes: \*/10 \* \* \* \*

-   Fetches all active connections ordered by last_synced_at ASC (oldest first)

-   Max 3 concurrent mailbox syncs + 2s gap between batches (rate limit protection)

-   On 429 response: log warning, skip, retry on next cycle. Exponential backoff for large backlogs.

**crm_activities deduplication (REQUIRED schema change)**

-   Add columns to crm_activities: source VARCHAR(50), source_ref_id VARCHAR(500)

-   Add unique index: UNIQUE(source, source_ref_id) WHERE source IS NOT NULL

-   Insert email activities with ON CONFLICT DO NOTHING --- prevents duplicate activity records

**12.7 OAuth API Endpoints**

  -----------------------------------------------------------------------------------------------------------------------------
  **Component**                             **Specification**
  ----------------------------------------- -----------------------------------------------------------------------------------
  **GET /api/auth/outlook/connect**         Generates auth URL. State = user_id. Client opens in popup/redirect.

  **GET /api/auth/outlook/callback**        Exchanges code. Validates state param (CSRF protection). Stores encrypted tokens.

  **GET /api/auth/outlook/status**          Returns {connected, email, status, last_synced_at} for current rep.

  **DELETE /api/auth/outlook/disconnect**   Revokes Graph tokens, deletes connection row. Preserves historical crm_emails.
  -----------------------------------------------------------------------------------------------------------------------------

**12.8 Email CRUD & Send Endpoints**

  ---------------------------------------------------------------------------------------------------------------------------------------
  **Component**                              **Specification**
  ------------------------------------------ --------------------------------------------------------------------------------------------
  **GET /api/crm/emails**                    Params: customer_id, prospect_id, inquiry_id, direction, is_read, limit, offset

  **GET /api/crm/emails/:id**                Full record including body_html (fetched from Graph if not cached) and attachments list

  **GET /api/crm/emails/unread-count**       Returns {count: N} --- used by My Day badge

  **PATCH /api/crm/emails/:id**              Fields: is_read, crm_status, is_hidden, customer_id, prospect_id, inquiry_id (manual link)

  **POST /api/crm/emails/send**              Sends via Graph API using rep\'s mailbox. Creates crm_emails + crm_activities records.

  **POST /api/crm/emails/:id/reply**         Reply in-thread (preserves conversationId). Creates new crm_emails record.

  **POST /api/crm/emails/drafts/:id/send**   Sends existing draft via Outlook. Updates draft status to sent.
  ---------------------------------------------------------------------------------------------------------------------------------------

**12.9 Template Endpoints**

  ----------------------------------------------------------------------------------------------------------------------
  **Component**                                  **Specification**
  ---------------------------------------------- -----------------------------------------------------------------------
  **GET /api/crm/email-templates**               Returns shared + rep\'s own templates

  **POST /api/crm/email-templates**              Create template

  **GET /api/crm/email-templates/:id/preview**   Render template with variable substitution. Body: {variables: {\...}}

  **PUT /api/crm/email-templates/:id**           Update template

  **DELETE /api/crm/email-templates/:id**        Delete template
  ----------------------------------------------------------------------------------------------------------------------

**12.10 Standard Email Templates to Seed at Launch**

  -----------------------------------------------------------------------------------------------------------------------------------------
  **Component**                      **Specification**
  ---------------------------------- ------------------------------------------------------------------------------------------------------
  **Initial Introduction**           intro --- {{customer_name}}, {{rep_name}}, {{company_name}}

  **Inquiry Acknowledgement**        follow_up --- {{customer_name}}, {{inquiry_number}}, {{product_type}}

  **Quotation / Proposal Cover**     proposal --- {{customer_name}}, {{inquiry_number}}, {{validity_days}}, {{total_value}}, {{currency}}

  **Technical Spec Request**         proposal --- {{customer_name}}, {{product_description}}

  **Follow-up: No Reply (5 days)**   follow_up --- {{customer_name}}, {{inquiry_number}}, {{rep_name}}

  **Reorder Reminder**               reorder_reminder --- {{customer_name}}, {{last_order_date}}, {{product_type}}

  **Meeting Confirmation**           intro --- {{customer_name}}, {{meeting_date}}, {{meeting_time}}, {{location}}

  **Post-Visit Thank You**           follow_up --- {{customer_name}}, {{visit_date}}, {{next_steps}}
  -----------------------------------------------------------------------------------------------------------------------------------------

**12.11 Phase 3b --- Webhook Migration (Optional)**

-   Build POST /api/webhooks/outlook --- Graph notification receiver

-   Handler MUST return 202 Accepted immediately, then queue processing asynchronously

-   If synchronous DB writes: Microsoft retries after 3s, causing duplicate processing

-   Build outlookWebhookRenewalJob --- cron runs every 12 hours, renews subscriptions expiring within 24h

-   Keep polling as hourly safety-net fallback after migrating to webhooks

**13. Master Build Order --- All Phases**

Follow this sequence strictly. Each phase deployed and tested before the next begins.

**Phase 1 --- My Day Rebuild**

Duration: 1--2 weeks

1.  Extend /api/crm/my-day/summary with KPI fields

2.  Create /api/crm/my-day/schedule endpoint

3.  Build MyDayKPIBar.jsx

4.  Build MyDaySchedule.jsx --- timeline with pulsing NOW indicator

5.  Create /api/crm/my-day/priority-actions endpoint with rules engine (Rules 1--5)

6.  Build MyDayPriorityActions.jsx

7.  Create /api/crm/my-day/customer-health endpoint

8.  Build MyDayCustomerHealth.jsx

9.  Rebuild MyDayDashboard.jsx composing all new sub-components into 2-column layout

10. TEST: Home and My Day show completely different data --- zero duplication

**Phase 2a --- Notifications + Lookahead**

Duration: 3--4 days

11. Create /api/crm/my-day/notifications endpoint (rule-based, no push needed yet)

12. Build MyDayNotifications.jsx

13. Create /api/crm/my-day/lookahead endpoint

14. Build MyDayLookahead.jsx

15. Add Log Outcome section to WorklistDetailDrawer for calls/meetings

16. Add deal stage stepper to WorklistDetailDrawer

**Phase 2b --- Email Draft Queue + Outlook Integration**

Duration: 2.5 weeks

17. Azure App Registration --- one-time setup, set all env vars

18. Create DB tables: crm_outlook_connections, crm_emails, crm_email_attachments, crm_email_templates

19. Add source/source_ref_id to crm_activities with unique index

20. Extend crm_email_drafts table with new columns

21. Build outlookAuthService.js + AES-256-GCM token encryption helpers

22. Build /api/auth/outlook/connect, /callback, /status, /disconnect endpoints

23. TEST: Full OAuth consent flow --- connect → store encrypted tokens → disconnect

24. Build ensureOutlookToken middleware with silent refresh + expiry handling

25. Build outlookSyncService.js using delta queries

26. Build emailMatchingService.js with exact + contact + domain matching

27. Build outlookSyncJob.js cron (10 min interval, max 3 concurrent, rate limit backoff)

28. TEST: Live sync against test mailbox --- emails land with correct customer matches, activities created

29. Build read API endpoints: GET /emails, /emails/:id, /emails/unread-count, PATCH /emails/:id

30. Build OutlookConnectSettings.jsx --- wire to CRM settings

31. Build EmailThreadView.jsx --- add Emails tab to CustomerDetail

32. Build /api/crm/my-day/email-summary endpoint

33. Build MyDayEmailQueue.jsx + wire email rules 6 & 7 into priority-actions engine

34. Seed 8 standard email templates

35. Build EmailComposeModal.jsx with template selector

36. Build POST /emails/send + POST /emails/:id/reply endpoints

37. TEST: Compose → send → appears in Outlook Sent → captured back in CRM → activity logged → thread in CustomerDetail

**Phase 3 --- Field Visit Planner**

Duration: 2--3 weeks

38. Create crm_field_trips + crm_field_trip_stops tables

39. Build all field trip CRUD API endpoints

40. Build FieldVisitList.jsx --- list view + New Trip CTA

41. Build FieldVisitPlanner.jsx Step 1 --- trip setup form

42. Build FieldVisitStopList.jsx --- drag-and-drop editor + pre-visit brief

43. Install react-leaflet. Build FieldVisitMap.jsx --- pins, popups, route line

44. Implement nearest-neighbour route optimisation algorithm

45. Build FieldVisitInTrip.jsx --- mobile-friendly in-trip mode

46. Build FieldVisitReport.jsx --- post-trip summary + export

47. Add \"visits\" tab + routes to CRMModule.jsx

48. Build MyDayFieldVisitBanner.jsx --- integrate with My Day

49. Add Field Visits tab to CustomerDetail.jsx

50. Add avg_reorder_cycle_days field to CustomerDetail edit form

51. TEST: Plan trip → optimise route → view map → mark stops visited → auto-creates meeting records → post-trip report

**Phase 4 --- Polish + Deal Enhancements**

Duration: 3--4 days

52. Prospect lat/lng fields + ProspectLocationPicker (copy of CustomerLocationPicker)

53. Loss reason dropdown in WorklistDetailDrawer

54. Full QA all phases end-to-end

55. Performance test: 8 API calls on My Day load --- all via Promise.all, progressive loading skeletons

**Phase 3b --- Webhook Migration (Optional)**

Duration: 1 week. Only begin after Phase 4 is stable.

56. Build /api/webhooks/outlook --- returns 202 immediately, queues processing async

57. Build webhook subscription creation on Outlook connect

58. Build outlookWebhookRenewalJob (every 12h, renew if expiring within 24h)

59. Migrate all active connections from polling to webhooks

60. Keep hourly polling as safety-net fallback

**14. Critical Reminders --- Agent Rules**

These rules apply to every file in this project. No exceptions.

**No Duplication Between Pages**

**This is the single most important constraint in the entire plan.**

-   Home = planning overview + creation hub. My Day = action execution + field intelligence.

-   If a feature exists on Home, My Day cross-links to it. Never re-implements it.

-   The activities list, month calendar, leads list, and pipeline snapshot on Home must not be copied to My Day.

**Auth Token Pattern (BUG-05)**

-   Every axios call: const token = localStorage.getItem(\'auth_token\') INSIDE the callback function.

-   Never close over the token in a useCallback dependency --- it will go stale.

-   This pattern is documented as BUG-05 in the existing codebase. All new components must follow it.

**Error Handling Pattern**

-   Every axios call: .catch(() =\> ({ data: { data: fallback } }))

-   One failed endpoint must never crash the entire My Day dashboard.

-   Use the Promise.all pattern with individual catches from MyDayDashboard.jsx loadData as the model.

**Performance --- My Day**

-   My Day will make 6--8 API calls on load. Use Promise.all() for all non-dependent calls.

-   Render a loading skeleton per section (not a full-page Spin) so content appears progressively.

-   KPI bar + schedule + priority actions are highest priority --- load these before right-column panels.

**Shared Modals --- Never Re-Declare**

-   TaskCreateModal, MeetingCreateModal, CallCreateModal, DealCreateModal exist in CRMHomePage.jsx.

-   Do NOT re-declare in MyDayDashboard.jsx. Import and reuse the same components.

-   Pass pre-filled props where context exists (e.g. customer_id pre-filled from Customer Health panel click).

**Email Security --- Non-Negotiable**

-   Refresh tokens and access tokens are NEVER stored in plaintext. AES-256-GCM encryption mandatory.

-   OUTLOOK_TOKEN_ENCRYPTION_KEY must be in secrets manager --- not .env file in the repository.

-   Delta queries are not optional. Full-mailbox polling from scratch will hit rate limits and grow forever.

-   First sync: 30-day window only. Never import full inbox history on first connect.

-   OAuth callback: validate state parameter against real user_id to prevent CSRF.

-   Webhook handler: must return 202 Accepted within 3 seconds. Queue processing async.

**Leaflet + Vite**

-   Leaflet has SSR issues with Vite. Import Leaflet dynamically inside useEffect or use React.lazy.

-   import \'leaflet/dist/leaflet.css\' in the FieldVisitMap component file only --- not globally.

**Mobile Responsiveness**

-   My Day 2-column layout: stack to single column on screens \< 768px.

-   FieldVisitInTrip.jsx is primarily used on mobile --- large tap targets, minimal text input, no tables.

-   FieldVisitMap.jsx: disable scrollWheelZoom on mobile, offer full-height drawer on small screens.

End of Complete Enhancement Plan · ProPack CRM · All Sections Combined
