# ProPackHub CRM + MES Full Test Plan

**Date:** March 6, 2026  
**Scope:** End-to-end closed-loop testing — from sales rep morning login through full production cycle  
**Approach:** Walk through every feature as a sales rep, testing real CRUD operations  

---

## Changes & Fixes Log

> All UI/UX issues and code changes discovered during testing are logged here in order.

| # | Date | Area | File(s) | Change |
|---|------|------|---------|--------|
| 1 | 2026-03-06 | Navigation | `CRMWorklist.jsx` | Added **← Back to Home** button at top of Worklist page |
| 2 | 2026-03-06 | Navigation | `CRMModule.jsx` | Removed Worklist from top-level tab nav (was redundant) |
| 3 | 2026-03-06 | Navigation | `CRMHomePage.jsx`, `CRM.css` | Added dashed **Worklist →** button to Home quick bar |
| 4 | 2026-03-06 | Home Quick Bar | `CRMHomePage.jsx` | Fixed 4 quick-bar buttons: were navigating to Worklist → now open **+Create modals** (+Task, +Meeting, +Call, +Deal) |
| 5 | 2026-03-06 | Task Modal | `TaskCreateModal.jsx` | **Due Date + Priority** moved to single row (no scroll) |
| 6 | 2026-03-06 | Task Modal | `TaskCreateModal.jsx` | Replaced separate Customer/Prospect dropdowns with **smart "Related To" segmented block** (None / Customer / Prospect / Not in list) |
| 7 | 2026-03-06 | Task Modal | `TaskCreateModal.jsx` | "Assign To" hidden by default; shown only as opt-in **"Assign to someone else"** checkbox for level 6+ users (`designation_level >= 6`) |
| 8 | 2026-03-06 | Meeting Modal | `MeetingCreateModal.jsx` | **Date + Duration** moved to single row; smart Related To block; notes rows reduced 3→2 |
| 9 | 2026-03-06 | Call Modal | `CallCreateModal.jsx` | **Direction + Date + Duration** on single row; smart Related To block; notes rows reduced 3→2 |
| 10 | 2026-03-06 | Deal Modal | `DealCreateModal.jsx` | **Stage + Expected Close** moved to single row; `Row`/`Col` imported |
| 11 | 2026-03-06 | Home Quick Bar | `CRMHomePage.jsx` | Removed **Log Activity** from quick bar — redundant with +Call; kept on Customer/Prospect detail pages only |
| 12 | 2026-03-06 | Layout / Responsive | `CRM.css`, `CRMHomePage.jsx` | **Full layout redesign**: quick bar buttons compact & left-aligned (no stretch), page `max-width: 1440px`, Activities/Calendar split 50/50, calendar cell height reduced 50→42px, `min-height` reduced 420→360px, tablet breakpoint added at 1100px |
| 13 | 2026-03-07 | Worklist | `CRMWorklist.jsx` | **Syntax fix**: extra closing brace `}}}` → `}}` on `rowClassName` prop caused Vite 500 — module failed to load |
| 14 | 2026-03-07 | Customer Detail | `CustomerDetail.jsx` | **Missing import**: added `FileTextOutlined` to `@ant-design/icons` import — was crashing page on render |
| 15 | 2026-03-07 | Worklist | `CRMWorklist.jsx` | **Code quality overhaul** (13 fixes): removed double status filtering (API+client), moved `PRIORITY_COLORS`/`STAGE_COLORS`/timeout to module scope, extracted `getAuthHeaders()`, `Set`-based default tracking, `useCallback` on `setTypeInUrl`, split `prefBusy` → `saveBusy`/`clearBusy`, keyboard accessibility on rows, contextual empty-state message, removed stale `started` status option |
| 16 | 2026-03-07 | CRM Module | `CRMModule.jsx`, `roleConstants.js` | **12-point code review overhaul**: (1) `getActiveTab()` → `useMemo(activeTab)` — prevents per-render flicker; (2) removed dead state `salesRepGroupId`, `salesRepInfo`, `stats.totalProducts`; (3) removed `FULL_ACCESS_ROLES` alias — use `CRM_FULL_ACCESS_ROLES` directly; (4) replaced 17-branch `handleTabChange` if/else with `TAB_ROUTES` lookup map; (5) broadened `isDetailPage` regex to cover `/customers|inquiries|prospects/\\d+`; (6) added `bootstrapReady` guard on PerformanceView routes — shows Spin while rep context loads; (7) `/crm/customers/map` route now renders `MyCustomersWithMap initialShowMap` for sales reps (was bare `CustomerMapView` without toggle); (8) extracted `getDesignationLabel` → shared `getRoleLabel(user)` + `ROLE_LABELS` map in `roleConstants.js`; (9) `getUserInitials` / `getDesignationLabel` → `useMemo` derived values; (10) removed unused imports `CRMDashboard`, `CRMBudgetEntry`; (11) added `Spin` to antd imports for bootstrap loading; (12) `MyCustomersWithMap` now accepts `initialShowMap` prop |
| 17 | 2026-03-07 | CRM Module / My Day | `CRMModule.jsx` | **Missing route**: `/crm/worklist` had no route — clicking "View all" on Open Tasks (My Day) or Worklist button (Home) caused white screen. Added `CRMWorklist` import and `<Route path="worklist">` + `activeTab` mapping for `/crm/worklist` → `home` tab |
| 18 | 2026-03-07 | My Day / Tasks | `MyDayDashboard.jsx` | **Disabled View button**: individual task "View" button was `disabled` when task had no linked customer/inquiry/prospect. Removed `disabled` — unlinked tasks now fall through to `/crm/worklist?type=tasks&highlight={id}` |
| 19 | 2026-03-07 | Worklist | `CRMWorklist.jsx` | **Missing highlight support**: URL `?highlight={id}` param was silently ignored — worklist never auto-opened the matching record's drawer. Added `highlightIdRef` + effect to auto-open drawer for highlighted record after data loads |
| 20 | 2026-03-07 | My Day / Tasks | `MyDayDashboard.jsx` | **Missing Overdue filter link**: "View all" on Open Tasks only went to `?status=open`. Added red "Overdue" link button (shown when overdue count > 0) that navigates to `?status=overdue` |
| 21 | 2026-03-07 | Server / Tasks | `server/routes/crm/tasks.js` | **Ignored `limit` param**: client sent `limit=20` but server had no LIMIT clause — returned all rows. Added safe LIMIT (clamped 1–500) to SQL query |
| 22 | 2026-03-07 | Server / My Day Summary | `server/routes/crm/dashboard.js` | **Overdue count mismatch**: summary used `NOW()` (timestamp precision) vs tasks endpoint using `CURRENT_DATE` (date precision) — counts could differ. Unified to `CURRENT_DATE` |
| 23 | 2026-03-07 | My Day / Dormant Customers | `server/routes/crm/customers.js`, `server/routes/crm/dashboard.js`, `src/components/CRM/MyDayDashboard.jsx` | **"Contacted" using wrong data source**: "Recently Contacted" and "Not Contacted 30+ Days" were based on `last_transaction_date` (financial orders from `mv_customer_last_txn`) — NOT actual CRM contact activity. A customer called today still appeared as dormant if they hadn't ordered recently. Fixed: (1) Both my-customers SQL queries (admin + sales rep) now compute `last_activity_date` via UNION ALL subquery across `crm_activities.activity_date`, `crm_calls.date_start`, `crm_meetings.date_start`; (2) Dashboard dormant count query updated to `COALESCE(GREATEST(MAX activities), lt.last_txn, cu.last_transaction_date)`; (3) Frontend already had correct `last_activity_date \|\| last_transaction_date` fallback — now works correctly with real data |
| 24 | 2026-03-07 | My Day / Phase 1 Kickoff | `server/routes/crm/dashboard.js`, `src/components/CRM/MyDayDashboard.jsx`, `src/components/CRM/MyDayKPIBar.jsx`, `src/components/CRM/MyDaySchedule.jsx` | **Phase 1 started (without Outlook hooks):** added new backend endpoint `GET /api/crm/my-day/schedule` (today timeline merging tasks/meetings/calls + optional overdue tasks), extended `GET /api/crm/my-day/summary` with actionable KPI fields (`callsToday`, `meetingsHeldToday`, `tasksCompletedToday`, `newInquiriesToday`, `dealsAdvancedWeek`), and wired initial My Day UI foundation with new KPI strip + Today Schedule component while preserving existing action cards and panels |
| 25 | 2026-03-07 | My Day / Phase 1 Build | `server/routes/crm/dashboard.js`, `src/components/CRM/MyDayDashboard.jsx`, `src/components/CRM/MyDayPriorityActions.jsx`, `src/components/CRM/MyDayCustomerHealth.jsx` | **Priority Actions + Customer Health delivered:** added `GET /api/crm/my-day/priority-actions` (Rules 1–5 baseline: cold deals, unanswered proposals, reorder window when `avg_reorder_cycle_days` exists, new uncontacted inquiries, overdue tasks) and `GET /api/crm/my-day/customer-health` (health status based on `last_activity_date` + open deal count/value). Added new My Day cards for both sections and wired contextual navigation actions from each row |
| 26 | 2026-03-07 | My Day / Data Polish | `server/routes/crm/dashboard.js` | **Post-test adjustments:** (1) Today Schedule no longer fabricates `00:00` for date-only tasks (`item_time` now null for tasks, UI shows no-time state), (2) priority-actions and customer-health filters now include sales-rep name/group-name fallback even when `group_id` exists, preventing empty panels when group mapping is stale/incomplete |
| 27 | 2026-03-07 | My Day / Phase 2a Integration | `server/routes/crm/dashboard.js`, `src/components/CRM/MyDayDashboard.jsx`, `src/components/CRM/MyDayNotifications.jsx`, `src/components/CRM/MyDayLookahead.jsx` | **Notifications + Lookahead integrated:** added `GET /api/crm/my-day/notifications`, `PATCH /api/crm/my-day/notifications/:id/read`, and `GET /api/crm/my-day/lookahead`; created new My Day cards for notifications and 3-day lookahead; wired dashboard loading, card rendering, mark-read flow, and contextual navigation from item type |
| 28 | 2026-03-07 | Worklist Drawer / Phase 2a | `src/components/CRM/WorklistDetailDrawer.jsx` | **Drawer action surface expanded:** added deal stage progress stepper with forward-stage confirmations (`Popconfirm`), standardized close-reason selection for won/lost transitions, and introduced "Log Outcome" section for held calls/meetings with result selection, outcome notes, and optional auto-creation of a follow-up task (`POST /api/crm/tasks`) |
| 29 | 2026-03-07 | My Day / Email Queue UI | `src/components/CRM/MyDayEmailQueue.jsx`, `src/components/CRM/MyDayDashboard.jsx` | **Phase 2b scaffold (UI):** added `MyDayEmailQueue` card with due/unread/awaiting counters and draft actions (`Send via Outlook`, `Mark Sent`, `Edit`, `Skip Today`), wired to dashboard data loading and refresh-safe status updates |
| 30 | 2026-03-07 | CRM / Email Draft APIs | `server/routes/crm/email-drafts.js`, `server/routes/crm/index.js`, `server/routes/crm/dashboard.js` | **Phase 2b scaffold (backend):** added CRUD endpoints for `crm_email_drafts` and mounted router; added `GET /api/crm/my-day/email-summary` with table-existence guards for pre-migration environments so My Day remains stable before Outlook/email tables are fully deployed |
| 31 | 2026-03-07 | Deploy to VPS / Migration Targeting | `server/routes/deployment.js`, `server/services/migrationRunner.js` | **Critical deploy-path fix:** migration target parser now correctly recognizes multi-token DB targets (`fp_database`, `ip_auth_database`, `propackhub_platform`) and legacy short targets (`fp`, `ip`, `platform`), ensuring app-settings "Deploy to VPS" actually applies matching migrations instead of silently skipping them |
| 32 | 2026-03-07 | DB Migration / Email Foundation | `migrations/sql/20260307_001_fp_database_crm_email_foundation.up.sql`, `migrations/sql/20260307_001_fp_database_crm_email_foundation.down.sql` | **Phase 2b schema foundation added:** created reversible migration pair for `crm_outlook_connections`, `crm_email_templates`, `crm_email_drafts`, `crm_emails`, `crm_email_attachments` plus indexes and safety headers so deployment migration step can apply automatically on VPS |
| 33 | 2026-03-07 | Outlook OAuth Backend | `server/services/outlookTokenCrypto.js`, `server/services/outlookAuthService.js`, `server/routes/auth.js` | **Outlook connection flow implemented:** added AES-256-GCM token encryption/decryption helpers, signed OAuth state token validation, token exchange/profile fetch/upsert logic, status/disconnect handlers, and auth routes `GET /api/auth/outlook/connect`, `GET /api/auth/outlook/callback`, `GET /api/auth/outlook/status`, `DELETE /api/auth/outlook/disconnect` |
| 34 | 2026-03-07 | CRM Emails API + Activity Dedup | `server/routes/crm/emails.js`, `server/routes/crm/index.js`, `migrations/sql/20260307_002_fp_database_crm_activities_email_dedup.up.sql`, `migrations/sql/20260307_002_fp_database_crm_activities_email_dedup.down.sql` | **Email CRUD/send/reply baseline:** added `GET /emails`, `GET /emails/:id`, `GET /emails/unread-count`, `PATCH /emails/:id`, `POST /emails/send`, `POST /emails/:id/reply` with Graph send flow + `crm_emails` persistence and email activity logging; added `crm_activities.source/source_ref_id` + unique dedup index for conflict-safe email activity inserts |
| 35 | 2026-03-07 | My Day / Outlook Connect UX | `server/routes/crm/dashboard.js`, `src/components/CRM/MyDayEmailQueue.jsx`, `src/components/CRM/MyDayDashboard.jsx` | **Queue-to-Outlook wiring:** `email-summary` now returns `outlookConnected`; queue card shows connect warning/CTA when disconnected; dashboard now opens OAuth popup via `/api/auth/outlook/connect`, listens for callback `postMessage`, then auto-refreshes My Day data; fixed settings fallback path from `/crm/settings` to `/settings` |
| 36 | 2026-03-07 | Settings / Outlook Connection | `src/components/settings/OutlookConnectSettings.jsx`, `src/components/settings/Settings.jsx` | **Outlook settings tab added:** introduced dedicated Settings tab (`Outlook Email`) for connect/disconnect/status refresh, including migration-not-ready guard messaging and popup-based OAuth initiation via backend connect endpoint |
| 37 | 2026-03-07 | Priority Rules 6/7 + Template Seed | `server/routes/crm/dashboard.js`, `src/components/CRM/MyDayDashboard.jsx`, `migrations/sql/20260307_003_fp_database_crm_email_templates_seed.up.sql`, `migrations/sql/20260307_003_fp_database_crm_email_templates_seed.down.sql` | **Email intelligence enabled:** `/my-day/priority-actions` now includes Rule 6 (unread inbound >4h) and Rule 7 (outbound awaiting reply >48h) when `crm_emails` exists; frontend routes those actions to Outlook settings; seeded 8 standard email templates through reversible migration pair |
| 38 | 2026-03-07 | Field Visit Planner / Phase 3 Foundation | `migrations/sql/20260307_004_fp_database_crm_field_trips_foundation.up.sql`, `migrations/sql/20260307_004_fp_database_crm_field_trips_foundation.down.sql`, `server/routes/crm/field-trips.js`, `server/routes/crm/index.js`, `src/components/CRM/CRMModule.jsx`, `src/components/CRM/MyDayDashboard.jsx`, `src/components/CRM/MyDayFieldVisitBanner.jsx`, `src/components/CRM/FieldVisitList.jsx`, `src/components/CRM/FieldVisitPlanner.jsx`, `src/components/CRM/FieldVisitDetail.jsx`, `src/components/CRM/FieldVisitRouteView.jsx` | **Field Visits launched end-to-end (v1):** added deploy-safe schema for `crm_field_trips` and `crm_field_trip_stops`, implemented full `/api/crm/field-trips*` route family (trip CRUD, stop CRUD/reorder, route preview, report HTML, stop-complete auto-creating meeting + optional follow-up task), mounted CRM router, added new sales-rep `Field Visits` tab/routes, My Day `Plan a Visit` CTA + upcoming trip banner, and first working trip list/planner/detail/route UI flow |
| 39 | 2026-03-07 | Customer Detail / Field Visits + Reorder Rule Input | `server/routes/crm/field-trips.js`, `src/components/CRM/CustomerFieldVisits.jsx`, `src/components/CRM/CustomerDetail.jsx` | **Customer-level field-visit visibility added:** `/api/crm/field-trips` now supports `customerId`/`prospectId` filtering via stop linkage; Customer Detail now includes a `Field Visits` card listing linked trips with direct open actions; added editable `Avg. Reorder Cycle (days)` field to customer business details so Rule 3 (`reorder_window`) can be managed from the detail page |
| 40 | 2026-03-07 | Field Visit Map + In-Trip + My Day Visit Merge | `src/components/CRM/FieldVisitMap.jsx`, `src/components/CRM/FieldVisitRouteView.jsx`, `src/components/CRM/FieldVisitInTrip.jsx`, `src/components/CRM/FieldVisitDetail.jsx`, `src/components/CRM/CRMModule.jsx`, `server/routes/crm/dashboard.js`, `src/components/CRM/MyDaySchedule.jsx` | **Phase 3 advancement:** replaced basic route list with interactive Leaflet route preview (numbered stop markers, route polyline toggle, day filter, nearest-neighbor optimization with persisted reorder, itinerary export), added mobile-oriented In-Trip mode route (`/crm/visits/:id/in-trip`) with one-tap outcome logging (`visited/no_show/postponed`) and optional follow-up creation on visited completion, and extended `/api/crm/my-day/schedule` to merge today’s field-trip stops as `visit` timeline items so travel-day plans surface directly in My Day |
| 41 | 2026-03-07 | Customer Detail Email Thread + Home Active Trip CTA | `src/components/CRM/CustomerEmailThread.jsx`, `src/components/CRM/CustomerDetail.jsx`, `src/components/CRM/CRMHomePage.jsx`, `src/components/CRM/CRM.css` | **Email visibility + field execution shortcut:** added a customer-scoped email thread panel with filtering (`all/inbound/outbound/unread`), read/unread toggles, compose/reply actions backed by `/api/crm/emails*`, and linked it into Customer Detail; enhanced Home quick bar with dynamic `Visit Planner`/`In-Trip` action that detects active/upcoming field trips and deep-links reps into live route execution |
| 42 | 2026-03-07 | My Day De-dup Cleanup | `src/components/CRM/MyDayDashboard.jsx` | **No-duplication contract enforced:** removed legacy duplicated My Day blocks (old action counters, duplicate task/inquiry/customer lists, and extra activity feed) and their redundant fetch paths; retained only the new action-execution layout (KPI strip, today schedule, priority actions, customer health, notifications, lookahead, email queue, and field-visit banner) to avoid overlap with Home and previous My Day sections |
| 43 | 2026-03-07 | Field Visit Report UI + Routing | `src/components/CRM/FieldVisitReport.jsx`, `src/components/CRM/CRMModule.jsx`, `src/components/CRM/FieldVisitDetail.jsx` | **Phase 3 report surface delivered:** added dedicated trip report page (`/crm/visits/:id/report`) consuming existing backend report endpoint, included KPI summary cards and rendered HTML preview with download option, and wired a `Trip Report` action from visit detail header for direct access |
| 44 | 2026-03-07 | Field Visit Planner / Stop Editor + Briefs | `src/components/CRM/FieldVisitPlanner.jsx`, `src/components/CRM/FieldVisitStopList.jsx` | **Planner depth upgrade delivered:** replaced basic stop rows with enhanced stop list editor (drag-drop reorder, up/down fallback, customer/prospect pickers, visit date/time/duration, stop objectives, route optimization), added pre-visit brief loader per stop with resilient API fan-out (customer detail, sales history, active deals, open tasks, packaging profile; prospect notes/deals/tasks fallback), and kept trip save payload compatible with existing backend stop schema |
| 45 | 2026-03-07 | Field Visit In-Trip Execution Upgrade | `src/components/CRM/FieldVisitInTrip.jsx` | **In-trip speed and visibility improved:** added live execution KPIs (visited/no-show/postponed/pending), next-stop hint card, smart stop fallback (today stops first, then pending stops), one-tap map launch (coordinates/address), arrival timestamp logging (`arrival_at`) via stop patch, and stronger outcome modal with datepicker-based follow-up due date validation and backend-safe date formatting |
| 46 | 2026-03-07 | Customer Detail / Field Visits Actionability | `src/components/CRM/CustomerFieldVisits.jsx` | **Customer trip linkage upgraded:** added stop-level outcome visibility (latest visit date, outcome status, outcome notes preview, customer stop count per trip) and implemented `Add to Existing Trip` modal flow that appends the current customer as a new stop into planning/confirmed trips via field-trip stop API |
| 47 | 2026-03-07 | Prospects Geolocation + Picker | `src/components/CRM/MyProspects.jsx`, `src/components/CRM/ProspectLocationPicker.jsx`, `server/routes/crm/prospects.js`, `migrations/sql/20260307_005_fp_database_fp_prospects_location_fields.up.sql`, `migrations/sql/20260307_005_fp_database_fp_prospects_location_fields.down.sql` | **Phase 4 location readiness implemented:** added prospect map picker flow in prospect drawer (`Set Location`), created reusable `ProspectLocationPicker`, added backend endpoint `PATCH /api/crm/prospects/:id/location`, expanded `/api/crm/my-prospects` to include location fields with legacy-schema fallback, and introduced reversible migration for `fp_prospects` latitude/longitude/city/state/address fields + index |
| 48 | 2026-03-07 | My Day Progressive Loading / Performance | `src/components/CRM/MyDayDashboard.jsx` | **Phase 4 load behavior improved:** removed blocking full-page spinner and switched to section-level progressive rendering with parallel API requests, per-panel loading states (KPI, schedule, priority, health, notifications, lookahead, email, trip banner), and explicit refresh action so first content appears earlier while slower endpoints continue loading |
| 49 | 2026-03-07 | Field Visit Planner / Draft Stop Seeding | `src/components/CRM/FieldVisitPlanner.jsx` | **Planner step-1 gap closed:** added `Draft from My Customers` and `Draft from Prospects` actions with multi-select modal, auto-created stop records with entity linkage and location snapshot, duplicate-stop guard, placeholder-stop replacement behavior, and token retrieval aligned to BUG-05 runtime header pattern |
| 50 | 2026-03-07 | Customer Detail / Add-Stop Data Hydration | `src/components/CRM/CustomerFieldVisits.jsx` | **Trip stop quality improved:** when adding current customer to an existing trip, the stop payload now includes customer latitude/longitude and address snapshot from customer detail endpoint so route preview and optimization have coordinate-rich data immediately |
| 51 | 2026-03-07 | Field Visit In-Trip / Structured Outcomes | `src/components/CRM/FieldVisitInTrip.jsx` | **Step-4 execution form depth improved:** added explicit dropdowns for `Visit Result` (Positive/Neutral/Needs Follow-up/No Answer), `No Show Reason`, and `Postpone Reason`; values are persisted in backend-compatible manner by enriching `outcome_notes`, while preserving existing visited/no-show/postponed status and follow-up task flow |
| 52 | 2026-03-07 | Build QA / Ant Icon Export Fix | `src/components/CRM/CustomerEmailThread.jsx` | **Integration build blocker resolved:** replaced unsupported `ReplyOutlined` import with available icon export to restore Vite production build path after QA run surfaced export failure from `@ant-design/icons` package |
| 53 | 2026-03-07 | Field Trip Status Auto-Completion | `server/routes/crm/field-trips.js` | **Post-trip completion rule enforced:** added backend auto-transition so trips with `return_date` in the past and status in `confirmed`/`in_progress` are set to `completed` before list/detail reads, matching plan requirement that post-trip summary state auto-triggers after trip end |
| 54 | 2026-03-07 | Planner Draft Scope by Trip Country | `src/components/CRM/FieldVisitPlanner.jsx` | **Step-1 drafting improved:** draft-stop modal now supports trip-country scoped selection with toggle (`Country scope`), using current form country to filter both customer and prospect candidate lists so reps can seed relevant stops faster for territory-specific trips |
| 55 | 2026-03-07 | Route View Runtime Stability Fix | `src/components/CRM/FieldVisitRouteView.jsx` | **Continuation QA runtime fix:** resolved `idToStop is not defined` path in day-filter optimization branch by introducing scoped ID map for filtered day stops, preventing runtime failure when optimizing a single day |
| 56 | 2026-03-07 | Planner Route Optimization Ordering | `src/components/CRM/FieldVisitPlanner.jsx` | **Per-day optimization refined:** route optimizer now supports 2-stop optimization threshold, processes visit-date groups in chronological order, and keeps undated stops as final group to avoid accidental cross-day sequencing drift |
| 57 | 2026-03-07 | Home Visit Planner Route Fix | `src/components/CRM/CRMHomePage.jsx` | **Quick action navigation corrected:** Home quick bar `Visit Planner` CTA now points to existing route `/crm/visits/new` (instead of invalid `/crm/visits/planner`), preserving in-trip deep link behavior when an active trip exists |
| 58 | 2026-03-07 | My Day Trip Banner Prioritization | `src/components/CRM/MyDayDashboard.jsx` | **Field-visit integration tightened:** trip banner now selects highest-relevance trip for reps by ranking active in-window trips first, then in-window confirmed/planning trips, then only starts-within-7-days trips; removes noisy banner selection from arbitrary first upcoming record |
| 59 | 2026-03-07 | Field Visit List / Report Shortcut | `src/components/CRM/FieldVisitList.jsx` | **Post-trip workflow access improved:** added direct `Report` action per trip row in Field Visits list so reps/managers can open summary/report output without navigating through trip detail first |
| 60 | 2026-03-07 | Worklist Drawer / Attendee Management | `src/components/CRM/WorklistDetailDrawer.jsx` | **Meeting action surface completed:** attendee section now supports inline `Add Attendee` (name/email) with duplicate guard and immediate PATCH save to meeting record, while preserving existing attendee tag display and compact drawer flow |
| 57 | 2026-03-07 | My Day Field Visit Banner Context | `src/components/CRM/MyDayFieldVisitBanner.jsx` | **Travel-day context improved:** banner now shows country flag emoji fallback, start/end date context, and human timing chips (`Starts in N days`, `Starts today`, `N days left`) to make active/upcoming trip urgency clear without duplicating Home content |
| 55 | 2026-03-07 | Home Runtime Crash Fix (`pickActiveTrip`) | `src/components/CRM/CRMHomePage.jsx` | **Hotfix:** resolved `ReferenceError: Cannot access 'pickActiveTrip' before initialization` by removing self-referential callback dependency and wiring `loadData` to depend on `pickActiveTrip`, restoring CRM Home rendering |
| 56 | 2026-03-07 | Route Optimization by Day | `src/components/CRM/FieldVisitRouteView.jsx` | **Multi-day routing behavior corrected:** when optimizing with `All Days` filter, stops are now optimized per `visit_date` bucket independently (instead of mixing cross-day), preserving day grouping and producing itinerary-safe stop order updates |
| 54 | 2026-03-07 | Planner Route Optimization / Multi-day Respect | `src/components/CRM/FieldVisitPlanner.jsx` | **Optimization behavior aligned with trip-day logic:** nearest-neighbor reordering now runs independently per `visit_date` group (with undated stops isolated), preserving day sequencing while improving stop order quality inside each day rather than flattening all stops into one global route |
| 61 | 2026-03-07 | My Day x Field Visit Rule Completion | `server/routes/crm/dashboard.js`, `src/components/CRM/MyDayCustomerHealth.jsx` | **Integration rules finalized:** `/api/crm/my-day/customer-health` now returns `visiting_today` by joining today's active/in-window trip stops for the logged-in rep, UI now renders teal `Visiting Today` badge per customer row, and `/api/crm/my-day/priority-actions` now suppresses reorder-window nudges for customers already scheduled on today's trip stops to reduce dormant-style action noise during travel days |
| 62 | 2026-03-07 | Email Draft Queue / Real Send Flow | `server/routes/crm/emails.js`, `src/components/CRM/MyDayDashboard.jsx` | **Phase 2b send-path completion:** added `POST /api/crm/emails/drafts/:id/send` to send existing drafts through Outlook Graph, persist outbound records in `crm_emails`, auto-mark draft status to `sent` with `sent_graph_msg_id`, and log CRM activity; My Day Email Queue `Send via Outlook` now calls this endpoint (instead of only patching draft status), while `Mark Sent` remains manual fallback |
| 63 | 2026-03-07 | Email Templates API Surface | `server/routes/crm/email-templates.js`, `server/routes/crm/index.js` | **Phase 2b template endpoints completed:** added `GET /api/crm/email-templates`, `POST /api/crm/email-templates`, `GET /api/crm/email-templates/:id/preview`, `PUT /api/crm/email-templates/:id`, and `DELETE /api/crm/email-templates/:id` with owner/shared visibility rules, variable-aware preview rendering, template usage count bump on preview, and mounted router into CRM API index |
| 64 | 2026-03-07 | Shared Email Thread View Wiring | `src/components/CRM/EmailThreadView.jsx`, `src/components/CRM/CustomerDetail.jsx` | **Email UI modularity improved:** added shared `EmailThreadView` wrapper component (customer-thread backed, future-ready for prospect/inquiry adapters) and switched Customer Detail email section to use it, aligning implementation with plan file structure while preserving existing customer thread behavior |
| 65 | 2026-03-07 | Compose Modal + My Day Integration | `src/components/CRM/EmailComposeModal.jsx`, `src/components/CRM/MyDayDashboard.jsx` | **Phase 2b compose surface delivered:** added reusable `EmailComposeModal` with template picker, variable inputs, template preview/apply, recipient/CC inputs, due-date support, `Send` (`POST /api/crm/emails/send`) and `Save Draft` (`POST /api/crm/email-drafts`) actions; wired My Day Email Queue `Compose` button to open modal directly and auto-refresh dashboard after send/draft |
| 66 | 2026-03-07 | Priority Actions Snooze (24h) | `server/routes/crm/dashboard.js`, `src/components/CRM/MyDayPriorityActions.jsx`, `src/components/CRM/MyDayDashboard.jsx` | **Plan 7.1 snooze rule implemented:** added `POST /api/crm/my-day/priority-actions/:id/snooze` storing per-user snooze keys in `auth.user_preferences.theme_settings.my_day_priority_snooze` with 24h expiry; priority feed now filters active snoozes before ranking/limit; My Day Priority card now exposes `Snooze 24h` action and refreshes panel after snoozing |
| 67 | 2026-03-07 | Outlook Webhook Receiver (Phase 3b) | `server/routes/webhooks.js`, `server/config/express.js` | **Optional webhook migration started:** added `/api/webhooks/outlook` with Graph validation-token GET handler and POST notification receiver that returns `202` immediately, then processes notifications asynchronously (`setImmediate`) with optional `clientState` validation (`OUTLOOK_WEBHOOK_CLIENT_STATE`); mounted route under `/api/webhooks` |
| 68 | 2026-03-07 | Webhook Subscription on Connect | `server/services/outlookAuthService.js`, `server/routes/auth.js` | **Phase 3b follow-up:** added Graph subscription creation helper that persists `webhook_subscription_id` and `webhook_subscription_expiry` into `crm_outlook_connections`; OAuth callback now attempts subscription creation after token/profile upsert (non-blocking warning if webhook env is not configured) |
| 69 | 2026-03-07 | Webhook Renewal Cron (12h) | `server/jobs/outlookWebhookRenewalJob.js`, `server/index.js` | **Phase 3b renewal loop implemented:** added renewal job that finds active Outlook connections with missing/soon-expiring subscriptions (<=24h), refreshes access token, recreates webhook subscription, and logs results; scheduled cron run every 12 hours at startup |
| 70 | 2026-03-07 | Outlook Delta Sync Service + Polling Jobs | `server/services/outlookSyncService.js`, `server/jobs/outlookSyncJob.js` | **Webhook migration support completed:** added delta-based Outlook mailbox sync service (`/me/mailFolders('Inbox')/messages/delta`) that upserts inbound emails into `crm_emails`, maintains `delta_link`, and updates `last_synced_at`; added polling job split by connection mode to support webhook-first operation |
| 71 | 2026-03-07 | Polling Migration Strategy (Primary + Safety Net) | `server/index.js` | **Phase 3b items 59/60 implemented:** startup now schedules primary polling every 10 minutes for non-webhook connections and hourly safety-net polling for webhook-enabled connections, preserving resilience while migrating active users to webhook notifications |
| 72 | 2026-03-07 | Webhook-Triggered Delta Sync Activation | `server/routes/webhooks.js` | **Phase 3b operationalized:** Outlook webhook POST handler now validates `clientState`, maps incoming `subscriptionId` values to active `crm_outlook_connections.user_id`, and triggers bounded async delta sync (`syncOutlookMailbox`) per affected user after returning immediate `202`, replacing previous log-only placeholder behavior |
| 73 | 2026-03-07 | My Day Email Summary `top_unread` | `server/routes/crm/dashboard.js`, `src/components/CRM/MyDayEmailQueue.jsx` | **Plan 7.1 response alignment:** `/api/crm/my-day/email-summary` now returns `topUnread` (max 3 unread inbound previews with `id`, `subject`, `from_email`, `age_hours`) and My Day Email Queue now displays the compact `Top unread` preview strip above due drafts for quicker triage |
| 74 | 2026-03-07 | Email Detail Lazy Hydration (Graph) | `server/routes/crm/emails.js` | **Plan 12.8 depth enhancement:** `GET /api/crm/emails/:id` now lazily fetches Graph message detail when `body_html` is missing (`body`, preview, recipients, read/importance/hasAttachments), persists refreshed values to `crm_emails`, fetches/stores attachment metadata in `crm_email_attachments` (deduped by `email_id + graph_attach_id`), and returns payload with `attachments` array |
| 75 | 2026-03-07 | Webhook Migration Job (Active Connections) | `server/jobs/outlookWebhookMigrationJob.js`, `server/index.js` | **Phase 3b migration completion:** added migration job to convert active Outlook connections without `webhook_subscription_id` into webhook-enabled mode by creating subscriptions in batch; scheduled every 6 hours and triggered once after startup to progressively migrate legacy polling-only connections |
| 76 | 2026-03-07 | Template Preview POST Compatibility | `server/routes/crm/email-templates.js` | **Plan 12.9 contract alignment:** added `POST /api/crm/email-templates/:id/preview` accepting JSON body variables for substitution (in addition to existing GET query-based preview), with shared visibility checks and template use-count update |
| 77 | 2026-03-07 | In-Trip Mobile UX Hardening | `src/components/CRM/FieldVisitInTrip.jsx` | **Mobile-critical plan alignment:** upgraded in-trip action surface with responsive large touch targets (`>=44px` style) on small screens, flexible action wrapping, adaptive modal width for mobile, and clearer select labels/options for outcome/follow-up/priority to improve field execution speed on phones |
| 78 | 2026-03-07 | Graph Rate-Limit Backoff (Delta Sync) | `server/services/outlookSyncService.js` | **Reliability hardening:** added retry/backoff wrapper for Graph calls in Outlook delta sync with support for `Retry-After` header parsing (seconds/date), exponential backoff, and retry on `429`/`5xx` responses to reduce sync failures under Graph throttling |
| 79 | 2026-03-07 | Graph Rate-Limit Backoff (Emails Routes) | `server/routes/crm/emails.js` | **Reliability hardening:** added shared Graph retry/backoff helper to CRM email routes and applied it to message create/send, message-detail fetch, and attachment-list fetch calls; now respects `Retry-After` and retries on `429`/`5xx` for more resilient send/read flows |
| 80 | 2026-03-07 | Shared Template Permission Hardening | `server/routes/crm/email-templates.js` | **Access-control fix:** restricted shared template edit/delete operations to elevated roles (`admin/manager/sales_manager/sales_coordinator`), while keeping personal-template ownership rules for reps; prevents non-admin users from mutating global shared templates |
| 81 | 2026-03-07 | Email Matching Service + Sync Linking | `server/services/emailMatchingService.js`, `server/services/outlookSyncService.js` | **Plan step 26 implemented:** added `emailMatchingService` with ordered matching logic (exact customer email → contact email → domain match with generic-domain exclusions → prospect email) and wired inbox delta sync to persist `customer_id`, `prospect_id`, and `match_confidence` on inbound `crm_emails` inserts instead of defaulting all matches to `none` |
| 82 | 2026-03-07 | Polling Concurrency + Batch Gap Controls | `server/jobs/outlookSyncJob.js` | **Plan step 27 alignment:** updated polling execution from sequential to batched processing with `max 3` concurrent mailbox syncs and enforced `2s` delay between batches, while preserving per-user error isolation and sync metrics summary |
| 83 | 2026-03-07 | Initial Sync Scope Guard (30-Day Window) | `server/services/outlookSyncService.js` | **Plan gap closed:** first-time Outlook inbox delta sync now starts with a 30-day `receivedDateTime` filter to avoid full-history import on connect, with one-time automatic fallback to unfiltered delta when Graph rejects the filter expression |
| 84 | 2026-03-07 | Sent Items Sync for Outbound Tracking | `server/services/outlookSyncService.js` | **Plan step 25 depth completion:** added recent `SentItems` import during sync (30-day scoped with fallback), persisted outbound messages into `crm_emails` (`direction='outbound'`), and applied recipient-based CRM matching so thread context and awaiting-reply analytics include sent-mail history |
| 85 | 2026-03-07 | My Day UX + Map SSR Bugfix Pack | `src/components/CRM/FieldVisitMap.jsx`, `src/components/CRM/MyDaySchedule.jsx`, `src/components/CRM/MyDayCustomerHealth.jsx`, `src/components/CRM/MyDayKPIBar.jsx`, `src/components/CRM/MyDayPriorityActions.jsx`, `src/components/CRM/MyDayNotifications.jsx`, `src/components/CRM/MyDayDashboard.jsx`, `src/components/CRM/CRM.css` | **Critical UI parity fixes:** moved Leaflet + CSS loading to runtime dynamic import (SSR-safe), added pulsing `NOW` divider and inline schedule action buttons, added customer health quick actions (call/email/note), added 6th KPI (`Revenue MTD`) with target-based progress logic, mapped email priority rule styles, rendered unread notification dot via `is_read`, and switched `Log a Call` from navigation to opening `CallCreateModal` in-place |
| 86 | 2026-03-07 | Pre-Azure Groundwork + Deployment-Wired Migration | `migrations/sql/20260307_006_fp_database_pre_azure_groundwork.up.sql`, `migrations/sql/20260307_006_fp_database_pre_azure_groundwork.down.sql`, `server/routes/auth.js`, `server/services/outlookAuthService.js`, `server/utils/tokenEncryption.js`, `server/.env.example`, `.env.example`, `src/components/settings/OutlookConnectSettings.jsx`, `server/package.json` | **Ground floor implemented before Azure registration:** added idempotent schema-extension migration for Outlook/email compatibility fields (picked up automatically by Settings deployment migration pipeline via filename target), added shared token encryption utility path, exposed `azure_configured` in Outlook status, made connect/callback return graceful pre-registration behavior (`503`/redirect), updated Outlook settings UI to show pending Azure state, documented required env keys in examples, and added backend Azure/Graph package dependencies for zero-friction activation later |
| 87 | 2026-03-07 | EmailThreadView Adapter Completion | `src/components/CRM/EntityEmailThread.jsx`, `src/components/CRM/EmailThreadView.jsx` | **Plan closure for thread modularity:** replaced prospect/inquiry Alert stub with fully working email thread adapter using existing CRM email APIs (`GET /emails`, `POST /emails/send`, `POST /emails/:id/reply`, `PATCH /emails/:id`) and entity-aware filtering/linking for prospect/inquiry contexts |
| 88 | 2026-03-07 | My Day KPI Target Backend Completion | `server/routes/crm/dashboard.js`, `src/components/CRM/MyDayDashboard.jsx` | **Plan closure for KPI realism:** `/api/crm/my-day/summary` now returns computed `revenueMtd` and `revenueTargetMtd` (with safe fallbacks), plus explicit KPI target fields (`callsTargetToday`, `meetingsTargetToday`, `tasksTargetToday`, `inquiriesTargetToday`, `dealsAdvancedTargetWeek`) sourced from preferences/defaults; My Day now consumes these values for target-based progress rendering |

### UX Design Decisions
- **"Not in list"** option in Related To: free-text company/contact name is prepended to the notes field as `Related to: <name>` — no orphan records, no data loss
- **Assign To** permission: `user.designation_level >= 6` (Senior Manager and above). Field is `d.level` from the `designations` table, already returned in auth response as `user.designation_level`
- **Worklist** is a power-user view, not a primary nav destination — lives in Home quick bar

---

## Test Summary

| Phase | Tests | Focus |
|-------|-------|-------|
| A | 10 | CRM Morning Routine (Home, Dashboard, My Day) |
| B | 8 | Prospect & Customer Management |
| C | 7 | CRM Activities (Tasks, Meetings, Calls, Notes) |
| D | 5 | Deal Pipeline & Opportunity Management |
| E | 5 | Inquiry Creation (SAR Request) |
| F | 8 | QC Workflow (Receive → Analyse → CSE) |
| G | 5 | CSE Approval Chain |
| H | 6 | Estimation Module |
| I | 7 | Quotation Workflow |
| J | 5 | Pre-Production Samples |
| K | 4 | Proforma Invoice & Customer PO |
| L | 5 | Job Card & Production Handoff |
| M | 5 | Procurement Chain |
| N | 4 | Delivery, Feedback & Close |
| O | 6 | Worklist, Analytics & Reports |
| **Total** | **90** | |

---

## PHASE A — CRM Morning Routine

> **Role: Sales Rep** logs in. First thing they see.

### A1 — CRM Home Page Loads
- **Navigate:** CRM → Home tab
- **Verify:**
  - [ ] Quick Actions bar visible: +Task, +Meeting, +Call, +Deal, Log Activity
  - [ ] My Activities section loads (merged tasks/meetings/calls)
  - [ ] Mini Calendar renders with event dots for today/upcoming
  - [ ] My Leads section shows prospects
  - [ ] Deal Pipeline snapshot shows current deals by stage
- **Component:** `CRMHomePage.jsx`
- **API:** `GET /api/crm/my-day/summary`, `GET /api/crm/tasks`, `GET /api/crm/meetings`, `GET /api/crm/calls`

### A2 — My Day Dashboard Counters
- **Navigate:** CRM → My Day tab
- **Verify:**
  - [ ] Tasks due today count is correct
  - [ ] Meetings today count is correct
  - [ ] Calls scheduled count is correct  
  - [ ] Open deals count is correct
- **Component:** `MyDayDashboard.jsx`
- **API:** `GET /api/crm/my-day/summary`

### A3 — Personal Dashboard (Overview)
- **Navigate:** CRM → Overview tab
- **Verify:**
  - [ ] KPI cards load: Revenue YTD, Kgs YTD, Margin %, Active Customers
  - [ ] Sales trend chart renders
  - [ ] Product mix pie chart renders
  - [ ] Top customers table loads
  - [ ] Year selector works (switch to 2025, data changes)
- **Component:** `CRMDashboard.jsx` → `SalesCockpit.jsx`
- **API:** `GET /api/crm/my-stats`

### A4 — Quick Log Activity (FAB)
- **Navigate:** CRM → Home → click "Log Activity" button
- **Action:** Log a WhatsApp activity for an existing customer
- **Verify:**
  - [ ] ActivityLogDrawer opens
  - [ ] Activity type selector: call, visit, whatsapp, email, follow_up
  - [ ] Customer/Prospect dropdown populated
  - [ ] Duration field works
  - [ ] Outcome note textarea  
  - [ ] Submit → success toast → appears in activity feed
- **Component:** `ActivityLogDrawer.jsx`, `QuickLogFAB.jsx`
- **API:** `POST /api/crm/activities`

### A5 — Quick Create Task from Home
- **Navigate:** CRM → Home → click "+Task" quick action
- **Action:** Create a task "Follow up with Acme Corp"
- **Verify:**
  - [ ] TaskCreateModal opens
  - [ ] Title, Due Date (required), Description, Priority fields
  - [ ] Customer/Prospect link dropdown
  - [ ] Assignee dropdown (can assign to self or others)
  - [ ] Submit → task appears in worklist
- **Component:** `TaskCreateModal.jsx`
- **API:** `POST /api/crm/tasks`

### A6 — Quick Create Meeting from Home
- **Navigate:** CRM → Home → click "+Meeting" quick action
- **Action:** Schedule a meeting for today 2pm
- **Verify:**
  - [ ] MeetingCreateModal opens
  - [ ] Name, Date/Time (required), Duration, Location fields
  - [ ] Customer/Prospect/Deal link fields
  - [ ] Attendees field
  - [ ] Reminders field
  - [ ] Submit → meeting appears in calendar dots + worklist
- **Component:** `MeetingCreateModal.jsx`
- **API:** `POST /api/crm/meetings`

### A7 — Quick Create Call from Home
- **Navigate:** CRM → Home → click "+Call" quick action
- **Action:** Log an outbound call
- **Verify:**
  - [ ] CallCreateModal opens
  - [ ] Name, Date/Time (required), Duration, Direction (inbound/outbound)
  - [ ] Phone number field
  - [ ] Customer/Prospect/Deal link fields
  - [ ] Outcome note
  - [ ] Submit → call appears in worklist
- **Component:** `CallCreateModal.jsx`
- **API:** `POST /api/crm/calls`

### A8 — Quick Create Deal from Home
- **Navigate:** CRM → Home → click "+Deal" quick action
- **Action:** Create a new deal opportunity
- **Verify:**
  - [ ] DealCreateModal opens with 3-source selection
  - [ ] See Phase D for full deal testing
- **Component:** `DealCreateModal.jsx`

### A9 — Notification Badge
- **Verify:**
  - [ ] SSE connection established (check browser devtools → EventSource)
  - [ ] Notification count badge updates on new events
  - [ ] Click notification → navigates to relevant record

### A10 — CRM Theme/Preferences
- **Verify:**
  - [ ] Theme preferences saved: `PUT /api/auth/preferences` fires on load
  - [ ] No console errors on page load (check for 500s, 404s)

---

## PHASE B — Prospect & Customer Management

### B1 — View My Prospects
- **Navigate:** CRM → My Prospects tab
- **Verify:**
  - [ ] KPI cards: Total / Active / Converted counts
  - [ ] Status tab filtering: All / Active
  - [ ] Year selector works
  - [ ] Prospect list loads with correct columns
- **Component:** `MyProspects.jsx`
- **API:** `GET /api/crm/my-prospects`

### B2 — Add New Prospect
- **Navigate:** My Prospects → "+ Add Prospect" button
- **Action:** Add "Test Packaging Co" as a new prospect
- **Data:**
  - Customer Name: "Test Packaging Co"
  - Country: UAE
  - Source: customer_visit
  - Notes: "Met at Dubai exhibition"
  - Competitor notes: "Currently buying from XYZ"
- **Verify:**
  - [ ] Modal opens with all required fields
  - [ ] Source dropdown: customer_visit, phone_call, whatsapp, email, exhibition, referral, manager_tip, online, other
  - [ ] Submit → prospect appears in list with status "active"
  - [ ] Toast notification shows success
- **API:** `POST /api/crm/prospects`

### B3 — View Prospect Detail
- **Navigate:** Click on "Test Packaging Co" row
- **Verify:**
  - [ ] Drawer opens with full prospect info
  - [ ] Notes tab available (empty initially)
  - [ ] Status update buttons visible
  - [ ] Delete button visible
  - [ ] Convert button visible

### B4 — Add Note to Prospect
- **Action:** In prospect drawer → Notes tab → Add note
- **Data:** "Interested in stand-up pouches for snacks. 50,000 pcs/month."
- **Verify:**
  - [ ] Note saved and displays with timestamp + author
  - [ ] Can edit own note
  - [ ] Can delete own note
- **API:** `POST /api/crm/notes`, `GET /api/crm/notes`

### B5 — View My Customers
- **Navigate:** CRM → My Customers tab
- **Verify:**
  - [ ] Customer list loads (filtered to sales rep's group)
  - [ ] Search works
  - [ ] Map toggle available
- **Component:** `MyCustomers.jsx`
- **API:** `GET /api/crm/my-customers`

### B6 — Customer Detail Page
- **Navigate:** Click on any customer
- **Verify:**
  - [ ] Profile section: company info, contact, address
  - [ ] Contacts tab: list of contacts with CRUD
  - [ ] Sales History tab: transaction records
  - [ ] Deals tab: linked deals
  - [ ] Notes tab: notes CRUD
  - [ ] Activities tab: activity feed
  - [ ] Technical Briefs tab
  - [ ] Inquiries tab: linked MES inquiries
- **Component:** `CustomerDetail.jsx`

### B7 — Add Customer Contact
- **Navigate:** Customer Detail → Contacts tab → Add Contact
- **Action:** Add a new contact person
- **Data:** Name: "John Smith", Designation: "Procurement Manager", Email, Phone, WhatsApp, Primary: Yes
- **Verify:**
  - [ ] ContactFormModal opens
  - [ ] All fields available
  - [ ] If set as primary → previous primary unflagged
  - [ ] Saved → appears in contacts list
- **API:** `POST /api/crm/customers/:id/contacts`

### B8 — Customer Map View
- **Navigate:** CRM → My Customers → toggle Map view
- **Verify:**
  - [ ] Leaflet map renders
  - [ ] Customer pins appear at correct locations
  - [ ] Click pin → shows customer info
  - [ ] Filter by country/type works
- **Component:** `CustomerMapView.jsx`
- **API:** `GET /api/crm/my-customers/map`

---

## PHASE C — CRM Activities (Tasks, Meetings, Calls, Notes)

### C1 — Create Task with Assignment
- **Navigate:** CRM → Worklist → Tasks tab → create new task
- **Action:** Create task "Prepare quotation for Test Packaging Co" 
- **Data:** Priority: high, Due: tomorrow, Assign to: self, Link to: prospect
- **Verify:**
  - [ ] Task created → appears in worklist
  - [ ] Status: open
  - [ ] Linked record shows prospect name
- **API:** `POST /api/crm/tasks`

### C2 — Complete a Task
- **Navigate:** Worklist → Tasks → find the task → update status
- **Action:** Mark task as "completed"
- **Verify:**
  - [ ] Status changes to completed
  - [ ] Task moves to "completed" filter
  - [ ] Completed count updates in My Day
- **API:** `PATCH /api/crm/tasks/:id`

### C3 — Reschedule Meeting
- **Navigate:** Worklist → Meetings → find scheduled meeting
- **Action:** Change status from "planned" to "held", update notes
- **Verify:**
  - [ ] Status drop-down works: planned, held, not_held, canceled
  - [ ] Updated timestamp reflects change
- **API:** `PATCH /api/crm/meetings/:id`

### C4 — Log Call Outcome
- **Navigate:** Worklist → Calls → find scheduled call
- **Action:** Mark as "held", add outcome note
- **Verify:**
  - [ ] Status changes
  - [ ] Outcome note saved
  - [ ] Direction (inbound/outbound) shows correctly
- **API:** `PATCH /api/crm/calls/:id`

### C5 — Worklist Keyboard Shortcuts
- **Navigate:** Worklist page
- **Verify:**
  - [ ] Alt+1 → Tasks tab
  - [ ] Alt+2 → Meetings tab
  - [ ] Alt+3 → Calls tab
  - [ ] Alt+4 → Deals tab
  - [ ] / → focuses search field

### C6 — Save Worklist Default Preferences
- **Action:** In Tasks tab, set filter to "overdue" → click Save Default
- **Verify:**
  - [ ] Preference saved
  - [ ] Reload page → Tasks tab opens with "overdue" pre-selected
  - [ ] Clear Default → reverts to "all"
- **API:** `PUT /api/crm/worklist/preferences/tasks`, `GET /api/crm/worklist/preferences`

### C7 — Worklist Deep Linking
- **Action:** Copy URL with params: `/crm/worklist?type=meetings&status=planned`
- **Verify:**
  - [ ] Opening URL → Meetings tab selected, "planned" filter active

---

## PHASE D — Deal Pipeline & Opportunity Management

### D1 — Create Deal from Existing Customer
- **Navigate:** CRM → Pipeline or Home → "+Deal"
- **Action:** Create deal linked to existing customer
- **Data:**
  - Source: "Existing Customer" → select from dropdown
  - Name: "Stand-up Pouches Q2 2026"
  - Stage: Interest & Data Collection
  - Value: 50,000 AED
  - Expected Close: 2026-06-30
  - Notes: "Initial discussion about pouches"
- **Verify:**
  - [ ] 3-source selector visible (Customer / Prospect / New Company)
  - [ ] Customer dropdown searchable and populated
  - [ ] Currency dropdown linked to system currencies
  - [ ] Stage defaults to "Interest & Data Collection"
  - [ ] Deal created → appears in Pipeline kanban under "Interest" column
- **API:** `POST /api/crm/deals`

### D2 — Create Deal from Prospect
- **Navigate:** "+Deal" → select "From Prospect Pipeline"
- **Action:** Link deal to "Test Packaging Co" prospect
- **Verify:**
  - [ ] Prospect dropdown populated with active prospects
  - [ ] Deal created with prospect_id (no customer_id)
  - [ ] Pipeline card shows prospect name
- **API:** `POST /api/crm/deals` (with prospect_id)

### D3 — Create Deal as New Company
- **Navigate:** "+Deal" → select "New Company"
- **Action:** Enter new company details
- **Verify:**
  - [ ] Company name + country fields appear
  - [ ] Submit creates prospect first, then deal linked to prospect_id
  - [ ] New prospect appears in My Prospects

### D4 — Move Deal Through Stages
- **Navigate:** Pipeline kanban → click stage tags on a deal card
- **Action:** Move deal: Interest → Sample Analysis → Quotation → Sample Approval → Confirmed
- **Verify:**
  - [ ] Each stage move updates the card position in kanban
  - [ ] Stage tag color changes per stage
  - [ ] Days-to-close counter updates
  - [ ] On move to "Confirmed" → close reason modal appears
  - [ ] On move to "Lost" → close reason modal appears
  - [ ] Stage history recorded in timeline
  - [ ] Pipeline value AED total recalculates
- **API:** `PATCH /api/crm/deals/:id`

### D5 — Deal Unified Timeline
- **Navigate:** Click on a deal that's linked to an inquiry
- **Verify:**
  - [ ] Unified timeline shows merged CRM activities + MES stage changes
  - [ ] Chronological order
  - [ ] Activity types have icons/colors
- **API:** `GET /api/crm/deals/:id/unified-timeline`

---

## PHASE E — Inquiry Creation (SAR Request)

> **Scenario:** Sales rep receives product samples from prospect and needs QC analysis

### E1 — Create New Inquiry (SAR)
- **Navigate:** MES → Pre-Sales → "+ New Inquiry" (or InquiryCapture)
- **Action:** Create inquiry for "Test Packaging Co"
- **Data:**
  - Source: customer_visit
  - Customer: select from list OR create new
  - Product groups: select applicable
  - Inquiry type: SAR
  - Priority: normal
  - Product description, packaging type, dimensions
- **Verify:**
  - [ ] InquiryCapture wizard opens
  - [ ] Source selection available (manager_tip, customer_visit, website, etc.)
  - [ ] Customer search + new customer option
  - [ ] Product group multi-select
  - [ ] Auto-generated inquiry number (INQ-FP-YYYY-NNNNN)
  - [ ] Initial stage: `new_inquiry` or `sar_pending`
  - [ ] Inquiry appears in pipeline board
- **Component:** `InquiryCapture.jsx`
- **API:** `POST /api/mes/presales/inquiries`

### E2 — View Inquiry Detail
- **Navigate:** Click on the inquiry in pipeline board
- **Verify:**
  - [ ] InquiryInfoCard shows: inquiry number, customer, product, stage, priority
  - [ ] PhaseStepperCard shows lifecycle stages (21 steps)
  - [ ] Tabs/sections visible: Samples, Quotation, Prospect, Activities, etc.
  - [ ] CRM Activity panel available
- **Component:** `InquiryDetail/index.jsx`

### E3 — Register Samples for SAR
- **Navigate:** Inquiry Detail → Samples section
- **Action:** Register 2 samples
- **Data:** Sample description for each, product group
- **Verify:**
  - [ ] "Register Sample" button available
  - [ ] Auto-generated sample number (SAR-FP-NNNN or similar)
  - [ ] Sample appears with status: `registered`
  - [ ] Can register multiple samples
  - [ ] Can delete a sample (only while status = registered)
- **Component:** `SamplesSection.jsx`
- **API:** `POST /api/mes/presales/inquiries/:id/samples`

### E4 — Submit Samples to QC
- **Navigate:** Samples section → "Submit to QC" button
- **Verify:**
  - [ ] Batch submit sends all registered samples
  - [ ] Sample statuses change to `sent_to_qc`
  - [ ] Inquiry stage advances to `qc_in_progress`
  - [ ] QC team receives notification (email + in-app)
  - [ ] PhaseStepperCard updates
- **API:** `POST /api/mes/presales/inquiries/:id/submit-to-qc`

### E5 — Log CRM Activity on Inquiry
- **Navigate:** Inquiry Detail → CRM Activity tab
- **Action:** Log a "customer visit" activity
- **Verify:**
  - [ ] Activity form with type, outcome, next action date
  - [ ] Outcome options: interested, follow_up, not_interested, sample_requested, quote_requested
  - [ ] Activity appears in timeline
  - [ ] Activity counts update in CRM dashboard
- **Component:** `CrmActivityPanel.jsx`
- **API:** `POST /api/mes/presales/inquiries/:id/activities`

---

## PHASE F — QC Workflow

> **Role switch:** QC Inspector receives samples, tests, and submits analysis

### F1 — QC Dashboard & Inbox
- **Navigate:** MES → QC → Dashboard
- **Verify:**
  - [ ] Stats cards: Pending Receipt, Received, Testing, Completed Today, Completed Week
  - [ ] Inbox table lists samples by status
  - [ ] Priority sorting works
  - [ ] Pagination works
- **Component:** `QCDashboard.jsx`
- **API:** `GET /api/mes/presales/qc/inbox`, `GET /api/mes/presales/qc/stats`

### F2 — Batch Receive Samples
- **Navigate:** QC Dashboard → select samples → "Batch Receive"
- **Action:** Receive both samples from test inquiry
- **Verify:**
  - [ ] Multi-select checkboxes work
  - [ ] Batch receive changes status: `sent_to_qc` → `received_by_qc`
  - [ ] Inquiry stage advances to `qc_received`
  - [ ] Sales rep notified of receipt
  - [ ] SLA timer starts (24hr to test)
  - [ ] `sent_to_qc_at` timestamp recorded
- **API:** `POST /api/mes/presales/qc/batch-receive`

### F3 — QC Barcode Scanner
- **Navigate:** MES → QC → Barcode Scanner
- **Action:** Enter sample number manually (or scan)
- **Verify:**
  - [ ] Sample looked up by number
  - [ ] Sample details displayed
  - [ ] Can navigate to analysis form
- **Component:** `QCScanPage.jsx`
- **API:** `GET /api/mes/presales/samples/by-number/:sampleNumber`

### F4 — Create QC Analysis (Sample 1)
- **Navigate:** QC Dashboard → click sample → Analysis form
- **Action:** Fill in test analysis for Sample 1
- **Data:**
  - Test category: physical
  - Test parameters: add rows (name, spec, result, unit, method, min/max)
  - Visual inspection: notes
  - Print quality: OK
  - Seal strength: value, unit, status
  - Observations
  - Equipment used (link to calibrated equipment)
- **Verify:**
  - [ ] Analysis form loads with all sections
  - [ ] Can add multiple test parameter rows
  - [ ] Equipment dropdown shows calibrated equipment
  - [ ] Auto-save draft works
  - [ ] Sample status changes to `testing`
- **Component:** `QCSampleAnalysis.jsx`
- **API:** `POST /api/mes/presales/qc/analyses`

### F5 — Batch Analysis (Sample 2)
- **Navigate:** QC Dashboard → Batch Analysis
- **Action:** Create analysis for Sample 2 using batch modal
- **Verify:**
  - [ ] BatchAnalysisModal opens
  - [ ] Can set shared parameters for multiple samples
  - [ ] Individual overrides possible
- **Component:** `BatchAnalysisModal.jsx`
- **API:** `POST /api/mes/presales/qc/batch-analyses`

### F6 — Submit QC Analysis
- **Navigate:** Sample analysis form → Submit button
- **Action:** Submit completed analysis (overall result: pass)
- **Verify:**
  - [ ] Overall result dropdown: pass / fail / conditional
  - [ ] Recommendation text
  - [ ] Submit → sample status changes to `tested`
  - [ ] CSE report auto-generated
  - [ ] Inquiry stage advances to `cse_pending`
  - [ ] Solvent retention auto-warning if >10 mg/m² (food-contact check)
  - [ ] QC managers + sales rep notified
- **API:** `POST /api/mes/presales/qc/analyses/:id/submit`

### F7 — QC Template Management
- **Navigate:** QC → Test Templates (admin)
- **Action:** Create a template for "Laminated Pouches" product group
- **Verify:**
  - [ ] Template CRUD works
  - [ ] Can define pre-set test parameters per product group
  - [ ] Template applied when creating analysis for matching product
- **Component:** `QCTemplateAdmin.jsx`
- **API:** `POST /api/mes/presales/qc/templates`

### F8 — QC Equipment Management
- **Navigate:** QC → Equipment (admin)
- **Action:** Add a piece of lab equipment
- **Data:** Name, Model, Serial #, Last calibration date, Next calibration date
- **Verify:**
  - [ ] Equipment CRUD works
  - [ ] Calibration status displayed (overdue warning if past next date)
  - [ ] Equipment linkable to analyses
- **Component:** `EquipmentAdminModal.jsx`
- **API:** `POST /api/mes/presales/qc/equipment`

---

## PHASE G — CSE Approval Chain

> **Two-stage approval:** QC Manager → Production Manager

### G1 — CSE Approval Queue
- **Navigate:** MES → QC → CSE Approval Queue
- **Verify:**
  - [ ] List of CSE reports pending approval
  - [ ] Status filter: pending_qc_manager / pending_production / approved / rejected
  - [ ] Click → opens full CSE detail
- **Component:** `CSEApprovalQueue.jsx`
- **API:** `GET /api/mes/presales/cse`

### G2 — QC Manager Approves CSE
- **Role:** QC Manager
- **Navigate:** CSE detail page → Approve button
- **Verify:**
  - [ ] Full CSE report visible: test parameters, results, analysis data
  - [ ] Comments section available
  - [ ] Can add internal comment  
  - [ ] Approve → status changes to `pending_production`
  - [ ] Production manager notified
  - [ ] Alternative: Reject → back to draft, Request Revision → sample back to testing
- **Component:** `CSEApprovalPage.jsx`
- **API:** `POST /api/mes/presales/cse/:id/approve`

### G3 — Production Manager Approves CSE
- **Role:** Production Manager
- **Navigate:** CSE detail → Approve
- **Verify:**
  - [ ] Can view full test data
  - [ ] Approve → final_status: `approved`
  - [ ] Inquiry stage advances to `cse_approved`
  - [ ] Public share link auto-generated
  - [ ] Sales rep notified of approval
- **API:** `POST /api/mes/presales/cse/:id/approve` (second stage)

### G4 — CSE Public Share Link
- **Action:** Copy public share link → open in incognito browser
- **Verify:**
  - [ ] Public CSE page loads without authentication
  - [ ] All test data visible
  - [ ] Share link has expiry
  - [ ] Can revoke share link
- **Component:** `PublicCSEView.jsx`
- **API:** `GET /api/mes/presales/public/cse/:token`

### G5 — CSE Comments & Revision History
- **Navigate:** CSE detail → Comments tab
- **Verify:**
  - [ ] Can add comments (threaded replies)
  - [ ] Internal comments visible to management only
  - [ ] Revision history shows audit trail
  - [ ] Can delete own comment
- **API:** `GET/POST /api/mes/presales/cse/:id/comments`, `GET /api/mes/presales/cse/:id/revisions`

---

## PHASE H — Estimation Module

> **Stage: cse_approved → estimation**

### H1 — Open Estimation Calculator
- **Navigate:** Inquiry Detail → Estimation section (or Estimation Queue)
- **Verify:**
  - [ ] EstimationCalculator loads
  - [ ] Material master loaded (grouped: inks, adhesives, substrates, coatings)
  - [ ] Product group defaults loaded  
  - [ ] Inquiry dimensions pre-filled if available
- **Component:** `EstimationCalculator.jsx`
- **API:** `GET /api/mes/presales/materials`, `GET /api/mes/presales/estimation/defaults`

### H2 — Material Layer Input
- **Navigate:** Estimation → Materials tab
- **Action:** Add material layers (substrate, ink, adhesive, coating)
- **Data:** For each: material selection, cost_per_kg, solid_pct, waste_pct
- **Verify:**
  - [ ] Material table rows can be added/removed
  - [ ] Material dropdown populated from master
  - [ ] Cost auto-calculated per layer
  - [ ] Waste % affects total
- **Component:** `EstimationMaterialTable.jsx`

### H3 — Operation/Process Costs
- **Navigate:** Estimation → Operations tab
- **Action:** Add process costs: printing, lamination, slitting, pouching
- **Verify:**
  - [ ] Operation rows can be added/removed
  - [ ] Process cost per unit calculated
  - [ ] All standard operations available
- **Component:** `EstimationOperationTable.jsx`

### H4 — Estimation Summary & Total
- **Navigate:** Estimation → Summary
- **Verify:**
  - [ ] Total material cost calculated
  - [ ] Total operation cost calculated
  - [ ] Delivery cost field
  - [ ] Markup % → sale price auto-calculated
  - [ ] Cost breakdown visible
  - [ ] Cost per kg and cost per unit
- **Component:** `EstimationSummary.jsx`, `EstimationTotalCost.jsx`

### H5 — Save Estimation
- **Action:** Save the estimation
- **Verify:**
  - [ ] Estimation saved → inquiry stage advances to `estimation`
  - [ ] Can edit and re-save
  - [ ] "Create Quotation" button appears
- **API:** `POST /api/mes/presales/estimations`

### H6 — Estimation Queue
- **Navigate:** Estimation Queue view
- **Verify:**
  - [ ] Lists inquiries that need estimation (cse_approved stage)
  - [ ] Click → opens estimation calculator
- **Component:** `EstimationQueue.jsx`

---

## PHASE I — Quotation Workflow

### I1 — Create Quotation from Estimation
- **Navigate:** Estimation view → "Create Quotation" button
- **Verify:**
  - [ ] Quotation created with values extracted from estimation
  - [ ] Unit price, total price calculated
  - [ ] Status: draft
- **API:** `POST /api/mes/presales/estimations/:id/create-quotation`

### I2 — Edit Draft Quotation
- **Navigate:** Inquiry Detail → Quotation panel
- **Action:** Edit quotation: adjust validity period, payment terms, notes
- **Verify:**
  - [ ] All fields editable in draft status
  - [ ] Material cost, process cost, overhead, margin visible
  - [ ] Unit price and total recalculate on change
- **Component:** `QuotationPanel.jsx`
- **API:** `PATCH /api/mes/presales/quotations/:id`

### I3 — Submit Quotation for Approval
- **Action:** Click "Submit for Approval"
- **Verify:**
  - [ ] Status changes to `pending_approval`
  - [ ] Sales manager / admin notified
  - [ ] Fields become read-only
- **API:** `POST /api/mes/presales/quotations/:id/submit`

### I4 — Manager Approves Quotation
- **Role:** Sales Manager
- **Navigate:** Quotation → Approve
- **Verify:**
  - [ ] Full quotation detail visible
  - [ ] Approve → status: `approved`, sales rep notified
  - [ ] Reject → status: `rejected`, with reason
  - [ ] Request Revision → back to `draft`
  - [ ] Approval history audit trail accessible
- **API:** `POST /api/mes/presales/quotations/:id/approve`

### I5 — Send Quotation to Customer
- **Role:** Sales Rep
- **Navigate:** Quotation panel → "Send to Customer"
- **Verify:**
  - [ ] Only available after approval
  - [ ] Inquiry stage advances to `quoted`
  - [ ] PhaseStepperCard updates
- **API:** `POST /api/mes/presales/quotations/:id/send`

### I6 — Record Customer Response (Accept)
- **Action:** Record customer acceptance
- **Verify:**
  - [ ] Response options: accepted, rejected, counter_offer, no_response
  - [ ] If accepted → stage: `price_accepted`
  - [ ] If counter_offer → stage: `negotiating`
  - [ ] If rejected → stage: `lost`
- **API:** `POST /api/mes/presales/quotations/:id/customer-response`

### I7 — Quotation Revision (Counter Offer) 
- **Action:** If customer counter-offered → create revision
- **Verify:**
  - [ ] New quotation version created
  - [ ] Previous version preserved
  - [ ] Revision counter incremented
  - [ ] NegotiationTimeline shows version chain with pricing changes
  - [ ] Re-submit for approval → send revised quotation
- **API:** `POST /api/mes/presales/quotations/:id/create-revision`
- **Component:** `NegotiationTimeline.jsx`

---

## PHASE J — Pre-Production Samples

> **Stage: price_accepted → preprod_sample** (optional but common in packaging)

### J1 — Request Pre-Production Sample
- **Navigate:** Inquiry Detail → Pre-prod Sample panel
- **Action:** Request pre-production sample
- **Verify:**
  - [ ] Request form available
  - [ ] Inquiry stage: `preprod_sample`
  - [ ] Sample record created with status
- **Component:** `PreprodSamplePanel.jsx`
- **API:** `POST /api/mes/presales/preprod-samples`

### J2 — Update Pre-prod Status
- **Action:** Production updates status through lifecycle
- **Verify:**
  - [ ] Status flow: requested → in_production → ready → sent_to_customer → customer_testing
  - [ ] Each status change recorded
  - [ ] Steps/progress indicator updates
- **API:** `PATCH /api/mes/presales/preprod-samples/:id/status`

### J3 — Send Sample to Customer
- **Action:** Mark as sent to customer
- **Verify:**
  - [ ] Stage: `preprod_sent`
  - [ ] Customer contact info displayed

### J4 — Customer Approves Pre-prod Sample
- **Action:** Record customer approval
- **Verify:**
  - [ ] Customer response: approved / rejected
  - [ ] If approved → stage: `sample_approved`
  - [ ] If rejected → can request new sample
- **API:** `POST /api/mes/presales/preprod-samples/:id/customer-response`

### J5 — Skip Pre-prod (Direct to PI)
- **Verify:**
  - [ ] If customer doesn't need pre-prod sample, can advance directly to PI

---

## PHASE K — Proforma Invoice & Customer PO

### K1 — Create Proforma Invoice (PI)
- **Navigate:** Inquiry Detail → Proforma panel
- **Action:** Generate PI from approved quotation
- **Verify:**
  - [ ] Auto-generated PI number (PI-FP-NNNN)
  - [ ] Values pulled from quotation
  - [ ] PI record created
- **Component:** `ProformaPanel.jsx`
- **API:** `POST /api/mes/presales/proforma-invoices`

### K2 — Send PI to Customer
- **Action:** Mark PI as sent
- **Verify:**
  - [ ] PI status: sent
  - [ ] Inquiry stage: `pi_sent`
- **API:** `POST /api/mes/presales/proforma-invoices/:id/send`

### K3 — Capture Customer PO
- **Navigate:** Inquiry Detail → Customer PO panel
- **Action:** Enter PO details received from customer
- **Data:** PO number, PO date, PO value, delivery address
- **Verify:**
  - [ ] PO form available
  - [ ] ±5% deviation warning if PO value differs from quotation
  - [ ] PO captured → inquiry stage: `order_confirmed`
  - [ ] CRM deal auto-synced (stage update)
- **Component:** `CustomerPOPanel.jsx`
- **API:** `POST /api/mes/presales/customer-po`

### K4 — PI Cancellation
- **Action:** Test PI cancel flow
- **Verify:**
  - [ ] Can cancel a PI
  - [ ] Status updates to cancelled
- **API:** `POST /api/mes/presales/proforma-invoices/:id/cancel`

---

## PHASE L — Job Card & Production Handoff

### L1 — Create Job Card
- **Navigate:** Inquiry Detail → Job Card section (only available at `order_confirmed`)
- **Action:** Create job card
- **Verify:**
  - [ ] Auto-populates: product specs (from CSE), quantity (from quotation), delivery date (from PO)
  - [ ] BOM (Bill of Materials) table editable
  - [ ] Material requirements listed
  - [ ] Job card status: `draft`
- **Component:** `JobCardForm.jsx`, `JobCardPanel.jsx`
- **API:** `POST /api/mes/presales/job-cards`

### L2 — Edit Job Card
- **Action:** Adjust quantities, add material requirements
- **Verify:**
  - [ ] Can add/remove BOM rows
  - [ ] Product specs editable
  - [ ] Material requirements reflect estimation data
- **API:** `PATCH /api/mes/presales/job-cards/:id`

### L3 — Approve Job Card → Creates MES Production Job
- **Action:** Approve the job card
- **Verify:**
  - [ ] MES production job created (mes_job_tracker)
  - [ ] All 17 workflow phases created (mes_job_phases)
  - [ ] Phase 1 = active, rest = pending
  - [ ] Inquiry stage: `in_production`
  - [ ] CRM deal synced
  - [ ] Job card link to production job established
- **API:** `POST /api/mes/presales/job-cards/:id/approve`

### L4 — Job Card PDF Export
- **Action:** Export job card as PDF
- **Verify:**
  - [ ] PDF generates with all specs, BOM, customer info
  - [ ] Printable layout
- **Component:** `JobCardPDF.jsx`

### L5 — Job Card List View
- **Navigate:** Job Card List
- **Verify:**
  - [ ] Lists all job cards for rep group
  - [ ] Filter by status, date range
  - [ ] Click → opens detail
- **Component:** `JobCardList.jsx`
- **API:** `GET /api/mes/presales/job-cards`

---

## PHASE M — Procurement Chain

### M1 — Create Purchase Requisition from Job Card
- **Navigate:** Inquiry Detail → Procurement panel
- **Action:** Create PR from job card BOM
- **Verify:**
  - [ ] PR created with material lines from BOM
  - [ ] Status: pending
  - [ ] Job card material_status: partially_ordered
- **Component:** `PurchaseRequisitionForm.jsx`
- **API:** `POST /api/mes/presales/purchase-requisitions`

### M2 — Manager Approves PR
- **Role:** Manager
- **Action:** Approve the purchase requisition
- **Verify:**
  - [ ] PR status: approved
  - [ ] Procurement/stores notified
- **API:** `POST /api/mes/presales/purchase-requisitions/:id/approve`

### M3 — Create Supplier Purchase Order
- **Action:** Create SPO from approved PR
- **Data:** Supplier name, line items, expected delivery date
- **Verify:**
  - [ ] SPO created and linked to PR
  - [ ] Material status: ordered
- **Component:** `SupplierPurchaseOrderForm.jsx`
- **API:** `POST /api/mes/presales/supplier-purchase-orders`

### M4 — Record Stock Receipt
- **Action:** Record goods received from supplier
- **Verify:**
  - [ ] Received quantities tracked
  - [ ] Partial vs full fulfillment
  - [ ] When all received → material_status: available
  - [ ] Production manager notified
- **Component:** `StockReceiptForm.jsx`
- **API:** `POST /api/mes/presales/stock-receipts`

### M5 — Procurement Dashboard
- **Navigate:** Procurement Dashboard
- **Verify:**
  - [ ] Stats: PR counts, SPO counts, overdue deliveries
  - [ ] Recent stock receipts listed
  - [ ] Pending actions highlighted
- **Component:** `ProcurementDashboard.jsx`
- **API:** `GET /api/mes/presales/procurement/dashboard`

---

## PHASE N — Delivery, Feedback & Close

### N1 — Production Ready for Dispatch
- **Action:** Mark inquiry as `ready_dispatch`
- **Verify:**
  - [ ] Stage: ready_dispatch
  - [ ] Sales rep notified
- **API:** `POST /api/mes/presales/orders/:inquiryId/ready-dispatch`

### N2 — Mark as Delivered
- **Action:** Record delivery details
- **Data:** Tracking number, delivery date
- **Verify:**
  - [ ] Stage: delivered
  - [ ] Delivery info recorded
- **API:** `POST /api/mes/presales/orders/:inquiryId/deliver`

### N3 — Delivery Feedback
- **Navigate:** Inquiry Detail → Delivery Feedback panel
- **Action:** Record customer feedback
- **Verify:**
  - [ ] Feedback form: quality rating, delivery rating, comments
  - [ ] Feedback saved
- **Component:** `DeliveryFeedbackPanel.jsx`

### N4 — Close Inquiry
- **Action:** Close the full inquiry lifecycle
- **Verify:**
  - [ ] Stage: closed
  - [ ] Inquiry locked (no more edits)
  - [ ] CRM deal synced to "Confirmed"
  - [ ] Full audit trail available
  - [ ] Estimation actuals can be entered (post-production)
- **API:** `POST /api/mes/presales/orders/:inquiryId/close`

---

## PHASE O — Worklist, Analytics & Reports

### O1 — CRM Analytics Dashboard (Admin)
- **Navigate:** CRM → Analytics tab
- **Verify:**
  - [ ] Activity Leaderboard: rep ranking by activity count
  - [ ] Deal Funnel: stage conversion counts
  - [ ] Cycle Time: average days between stages
  - [ ] Revenue Forecast: weighted pipeline value
  - [ ] Engagement Scores: customer scores
- **Component:** `CRMAnalytics.jsx`
- **API:** `GET /api/crm/analytics/*`

### O2 — Pipeline Board
- **Navigate:** MES → Pre-Sales → Pipeline
- **Verify:**
  - [ ] Kanban columns for all 21 stages
  - [ ] Each card shows: inquiry#, customer, product group, days-in-stage
  - [ ] Drag or click to transition stages
  - [ ] Pipeline stats (count per stage)
- **Component:** `InquiryBoard.jsx`, `MyPipeline.jsx`
- **API:** `GET /api/mes/presales/pipeline`

### O3 — QC SLA Overview
- **Navigate:** MES → QC → SLA Overview
- **Verify:**
  - [ ] SLA status: breached / warning / ok
  - [ ] Sample SLA: 4hr receive, 24hr test
  - [ ] CSE SLA: 24hr per approval stage
- **API:** `GET /api/mes/presales/qc/sla-overview`

### O4 — Win/Loss Analytics
- **Navigate:** MES → Pre-Sales → Win/Loss Analytics
- **Verify:**
  - [ ] Lost reason breakdown (by category, competitor)
  - [ ] Win/loss ratios
- **Component:** `WinLossAnalytics.jsx`
- **API:** `GET /api/mes/presales/analytics/lost-reasons`

### O5 — Bulk Operations (Admin)
- **Verify:**
  - [ ] Bulk assign customers to rep group
  - [ ] Auto-close stale deals (90+ days)
  - [ ] Export deals to Excel
  - [ ] Export activities to Excel
  - [ ] Import contacts from CSV
- **API:** `POST /api/crm/bulk/*`

### O6 — NCR Management (QC)
- **Navigate:** QC → NCR Management
- **Verify:**
  - [ ] Create NCR linked to sample/inquiry
  - [ ] Auto-generated NCR number
  - [ ] Status flow: open → investigating → resolved → closed
  - [ ] Severity levels
  - [ ] Root cause + corrective action fields
  - [ ] Stats dashboard
- **Component:** `NCRManagement.jsx`
- **API:** `GET/POST/PATCH /api/mes/presales/ncr`

---

## Quick Reference — Stage Flow Map

```
                          CRM DEAL PIPELINE
    ┌─────────────────────────────────────────────────────┐
    │ Interest → Sample Analysis → Quotation →            │
    │ Sample Approval → Confirmed / Lost                  │
    └─────────────────────────────────────────────────────┘

                      MES INQUIRY PIPELINE (21 stages)
    ┌─────────────────────────────────────────────────────┐
    │ new_inquiry → sar_pending → qc_in_progress →        │
    │ qc_received → cse_pending → cse_approved →          │
    │ estimation → quoted → negotiating →                  │
    │ price_accepted → preprod_sample → preprod_sent →     │
    │ sample_approved → pi_sent → order_confirmed →        │
    │ in_production → ready_dispatch → delivered → closed  │
    │                                  └→ lost / on_hold   │
    └─────────────────────────────────────────────────────┘

                        QC SAMPLE STATUS
    ┌─────────────────────────────────────────────────────┐
    │ registered → sent_to_qc → received_by_qc →          │
    │ testing → tested → approved / rejected               │
    └─────────────────────────────────────────────────────┘

                     CSE APPROVAL CHAIN
    ┌─────────────────────────────────────────────────────┐
    │ draft → pending_qc_manager → pending_production →    │
    │ approved / rejected                                  │
    └─────────────────────────────────────────────────────┘

                   QUOTATION WORKFLOW
    ┌─────────────────────────────────────────────────────┐
    │ draft → pending_approval → approved →                │
    │ sent → customer_accepted / counter_offer / rejected  │
    └─────────────────────────────────────────────────────┘
```

---

## Test Execution Order

Execute phases **A → O sequentially**. Each phase builds on data created in the previous one. The test prospect "Test Packaging Co" flows through the entire lifecycle:

1. **A** — Login, see dashboard, create quick actions
2. **B** — Register "Test Packaging Co" as prospect  
3. **C** — Create tasks/meetings/calls linked to it
4. **D** — Create deal for "Test Packaging Co"
5. **E** — Create inquiry (SAR), register samples
6. **F** — QC receives, tests, submits analysis
7. **G** — QC Manager + Production Manager approve CSE
8. **H** — Estimation done for the inquiry
9. **I** — Quotation created, approved, sent, customer accepts
10. **J** — Pre-prod sample produced and approved by customer
11. **K** — PI sent, customer PO captured
12. **L** — Job card created, approved → production job
13. **M** — Procurement: PR → SPO → Stock Receipt
14. **N** — Dispatch, deliver, feedback, close
15. **O** — Verify analytics, reports, SLA reflect all data
