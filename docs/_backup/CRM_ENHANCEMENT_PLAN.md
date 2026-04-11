# CRM Enhancement Plan — Inspired by EspoCRM

## 1. Current State (Our CRM)

### What We Have
- **Customers** — `fp_customer_unified` (1254 records, auto-synced from ERP/Oracle)
- **Contacts** — `fp_customer_contacts` (per-customer contact people)
- **Prospects** — `fp_prospects` (pre-customer leads)
- **Deals** — `crm_deals` (pipeline with stages)
- **Tasks** — `crm_tasks` (follow-ups with due dates, assignee)
- **Activities** — `crm_activities` (call, email, visit, note, meeting, whatsapp)
- **Notes** — `crm_notes` (free-text notes on customers/prospects)
- **Technical Briefs** — `crm_technical_briefs` (packaging specs)
- **Packaging Profile** — `crm_customer_packaging_profile`
- **Pre-Sales Inquiries** — `mes_presales_inquiries` (MES Stage 1)
- **Analytics** — engagement scores, dormancy alerts, conversion rates
- **Notifications** — daily digest emails, task assignment alerts
- **Map View** — customer locations with pin confirmation

### What Works Well
- Deep ERP integration (live transaction data, sales history, budget tracking)
- Sales rep group-based access control
- Pre-sales inquiry pipeline tied to MES manufacturing flow
- Budget achievement tracking per rep group
- Product group analytics from actual sales data

### What's Missing or Weak
- No calendar/scheduling for meetings and calls
- No email integration (no send/receive from CRM)
- No lead capture from web forms
- Tasks are basic (no recurring, no reminders, no collaborators)
- No document management
- Activity logging is manual-only (no auto-tracking)
- No campaign/mass email functionality
- Dashboard is action-counter focused but lacks scheduling context
- No "Cases" / support ticket concept
- Prospect-to-Customer conversion is not formalized

---

## 2. EspoCRM Feature Analysis

### Core Entities
| EspoCRM Entity | Purpose | Our Equivalent |
|---|---|---|
| Account | Company/organization | `fp_customer_unified` ✅ |
| Contact | Person at an account | `fp_customer_contacts` ✅ |
| Lead | Unqualified prospect | `fp_prospects` (partial) |
| Opportunity | Deal/sales pipeline | `crm_deals` ✅ |
| Task | Follow-up action item | `crm_tasks` ✅ |
| Call | Phone call log with duration | `crm_activities` (type=call, no duration) |
| Meeting | Scheduled meeting with attendees | `crm_activities` (type=meeting, no scheduling) |
| Case | Support ticket/issue | ❌ Not implemented |
| Campaign | Mass email/marketing | ❌ Not implemented |
| Document | File attachments | ❌ Not implemented |
| KnowledgeBase | Internal articles | ❌ Not implemented |
| Email | Integrated email | ❌ Not implemented |

### Key EspoCRM Patterns Worth Adopting

#### A. Lead Conversion Flow
EspoCRM has a formal Lead → Account + Contact + Opportunity conversion:
- Lead status: New → Assigned → In Process → Converted / Recycled / Dead
- On conversion, creates Account, Contact, and optionally Opportunity in one action
- All linked meetings, calls, emails transfer to the new Account/Contact
- Duplicate detection during conversion

**Our gap**: Prospects exist but there's no formal "convert to customer" flow. Prospects and customers are separate tables with no migration path.

#### B. Meetings & Calls as First-Class Entities
EspoCRM treats Meetings and Calls as separate entities with:
- Start/end time, duration
- Attendees (contacts + users)
- Status: Planned → Held / Not Held
- Reminders (popup + email, configurable minutes before)
- Calendar integration
- Acceptance status per attendee (Accepted, Tentative, Declined)
- Direction (inbound/outbound for calls)

**Our gap**: We log activities after the fact. No scheduling, no reminders, no attendee tracking.

#### C. Activity Stream
Every entity has a "Stream" — a timeline of:
- Field changes (audited fields)
- Notes/posts by users
- Related record creation (e.g., "Opportunity created")
- Email associations
- Status changes

**Our gap**: We have `ActivityFeed` but it only shows manually logged activities. No automatic change tracking.

#### D. Task System
EspoCRM tasks have:
- Status: Not Started → Started → Completed / Canceled / Deferred
- Priority: Low, Normal, High, Urgent
- Parent link (polymorphic — can be linked to Account, Contact, Opportunity, Lead, Case)
- Collaborators (multiple users)
- Reminders
- Date start + date end (not just due date)
- Calendar integration

**Our gap**: Tasks are basic — open/completed, single assignee, no reminders, no start date.

#### E. Opportunity Pipeline
EspoCRM opportunities have:
- Stages: Prospecting → Qualification → Proposal → Negotiation → Closed Won / Lost
- Probability auto-mapped per stage (10%, 20%, 50%, 80%, 100%, 0%)
- Weighted amount (amount × probability)
- Close date
- Contact roles on opportunities
- Lead source tracking
- Reports: by stage, by lead source, sales pipeline, sales by month

**Our gap**: We have `crm_deals` with stages but no probability mapping, no weighted pipeline, no lead source tracking.

#### F. Dashboard Dashlets
EspoCRM dashboard is widget-based:
- Activities (upcoming meetings/calls)
- Calendar (week/month view)
- Tasks (my open tasks)
- Opportunities by Stage (funnel chart)
- Opportunities by Lead Source (pie chart)
- Sales by Month (bar chart)
- Sales Pipeline (weighted forecast)
- Leads (my assigned leads)
- Cases (open support cases)

**Our gap**: My Day dashboard shows counters + lists but no calendar, no pipeline visualization, no forecast.

---

## 3. Enhancement Priorities

### Priority 1 — Meetings & Calls (High Impact, Medium Effort)
Transform activity logging from "after the fact" to "schedule and track":

**New table: `crm_meetings`**
- id, name/subject, date_start, date_end, duration_minutes
- status: planned | held | not_held | canceled
- description, location
- account_id (FK → fp_customer_unified)
- assigned_user_id, created_by
- direction (for calls: inbound/outbound)
- type: meeting | call | visit
- parent_type, parent_id (polymorphic: customer, prospect, deal)
- reminders (JSONB array: [{type: 'popup'|'email', minutes: 15}])

**New table: `crm_meeting_attendees`**
- meeting_id, attendee_type (user|contact), attendee_id
- acceptance_status: none | accepted | tentative | declined

**UI Changes:**
- Add "Schedule Meeting" and "Log Call" buttons to My Day dashboard
- Calendar view (week/month) showing scheduled meetings
- Meeting detail with attendee list and acceptance tracking
- Auto-create activity record when meeting status changes to "held"

### Priority 2 — Enhanced Tasks (High Impact, Low Effort)
Upgrade the task system:

- Add `status` options: not_started | started | completed | canceled | deferred
- Add `date_start` alongside `due_date`
- Add `priority`: low | normal | high | urgent (we have low/medium/high, add urgent)
- Add `reminders` JSONB column
- Add `collaborators` — link table for multiple users on a task
- Add `parent_type` + `parent_id` for polymorphic linking (customer, prospect, deal, meeting)
- Add "Add Task" button directly on My Day dashboard
- Show tasks in calendar view

### Priority 3 — Prospect Conversion Flow (High Impact, Medium Effort)
Formalize the Lead → Customer pipeline:

**Prospect status enhancement:**
- New → Contacted → Qualified → Proposal Sent → Converted / Lost / Recycled
- On "Convert": create `fp_customer_unified` record + optional `crm_deals` record
- Transfer all activities, tasks, notes to the new customer
- Track conversion source (website, exhibition, referral, cold call, etc.)
- Duplicate detection against existing customers

**UI Changes:**
- Prospect detail page with conversion button
- Conversion wizard: pre-fill customer fields from prospect data
- Conversion history tracking

### Priority 4 — Opportunity/Deal Pipeline Enhancement (Medium Impact, Low Effort)
Upgrade `crm_deals` to match EspoCRM's Opportunity model:

- Add `probability` column (auto-set from stage)
- Add `amount_weighted` computed column (amount × probability / 100)
- Add `lead_source` enum
- Add `contact_id` FK (primary contact on the deal)
- Stage probability mapping:
  - Prospecting: 10%, Qualification: 20%, Proposal: 50%
  - Negotiation: 80%, Closed Won: 100%, Closed Lost: 0%
- Pipeline forecast dashlet (sum of weighted amounts by stage)
- Sales pipeline chart on admin dashboard

### Priority 5 — Document Management (Medium Impact, Medium Effort)
Add file attachment support:

**New table: `crm_documents`**
- id, name, description, type (proposal|contract|spec_sheet|other)
- file_path, file_size, mime_type
- parent_type, parent_id (customer, prospect, deal, meeting)
- folder_id (optional categorization)
- created_by, created_at

**UI Changes:**
- Documents tab on customer detail
- Drag-and-drop upload
- Link documents to deals, meetings, technical briefs

### Priority 6 — Activity Stream Auto-Tracking (Medium Impact, Medium Effort)
Add automatic change tracking like EspoCRM's Stream:

- Track field changes on key entities (customer, deal, prospect)
- Auto-log: "Deal stage changed from Proposal to Negotiation by Riad"
- Auto-log: "Customer status changed from active to dormant"
- Show in unified timeline on customer detail page
- Configurable: which fields to audit per entity

### Priority 7 — Calendar View (Medium Impact, Medium Effort)
Add a calendar component to the CRM:

- Week and month views
- Show: scheduled meetings, task due dates, deal close dates
- Color-coded by type (meeting=blue, task=orange, deal=green)
- Click to create new meeting/task
- Drag to reschedule
- Filter by: my items, team items, all

### Priority 8 — Reminders System (Low Impact, Low Effort)
Add reminder notifications:

- Browser push notifications for upcoming meetings/tasks
- Email reminders (configurable: 15min, 30min, 1hr, 1day before)
- In-app notification bell with unread count
- Reminder preferences per user

---

## 4. Implementation Phases

### Phase 1 (Quick Wins — 1-2 weeks)
- Enhanced tasks (Priority 2): add status options, priority upgrade, date_start, "Add Task" on My Day
- Deal pipeline probability mapping (Priority 4): add probability + weighted amount
- Add "Schedule Meeting" / "Log Call" quick actions to My Day dashboard

### Phase 2 (Core Features — 2-3 weeks)
- Meetings & Calls as first-class entities (Priority 1)
- Calendar view (Priority 7)
- Prospect conversion flow (Priority 3)

### Phase 3 (Polish — 1-2 weeks)
- Activity stream auto-tracking (Priority 6)
- Document management (Priority 5)
- Reminders system (Priority 8)

---

## 5. My Day Dashboard Redesign

Current layout is counter-focused. Proposed redesign inspired by EspoCRM dashlets:

```
┌─────────────────────────────────────────────────────────────┐
│  Row 1: Action Counters (keep existing 3 cards)             │
│  [Overdue Tasks] [Inquiries Awaiting] [Dormant 30+ Days]    │
├─────────────────────────────────────────────────────────────┤
│  Row 2: Today's Schedule + Tasks                            │
│  ┌─────────────────────┐  ┌──────────────────────────────┐  │
│  │ Today's Meetings     │  │ Open Tasks                   │  │
│  │ 09:00 Call - ABC Co  │  │ ☐ Follow up on quote (HIGH)  │  │
│  │ 11:00 Visit - XYZ    │  │ ☐ Send samples (NORMAL)      │  │
│  │ 14:30 Meeting - DEF  │  │ ☐ Update pricing (LOW)       │  │
│  │ [+ Schedule Meeting] │  │ [+ Add Task]                 │  │
│  └─────────────────────┘  └──────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  Row 3: Pipeline Snapshot + Customer Quick List             │
│  ┌─────────────────────┐  ┌──────────────────────────────┐  │
│  │ My Pipeline          │  │ Not Contacted 30+ Days       │  │
│  │ Prospecting: 3 deals│  │ Customer A - 45 days ago     │  │
│  │ Proposal: 2 deals   │  │ Customer B - 38 days ago     │  │
│  │ Negotiation: 1 deal │  │ Customer C - 32 days ago     │  │
│  │ Total: $125K weighted│  │                              │  │
│  └─────────────────────┘  └──────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  Row 4: Activity Feed (keep existing)                       │
└─────────────────────────────────────────────────────────────┘
```

Key changes:
- "Today's Meetings" replaces the empty "Open Tasks" card when no tasks exist
- Pipeline snapshot gives the rep a quick view of their deals
- Quick action buttons: "+ Schedule Meeting", "+ Add Task", "+ Log Call"
- Recently Contacted moves to a secondary view (less actionable)

---

## 6. Data Model Summary

### New Tables
| Table | Purpose | FK Relations |
|---|---|---|
| `crm_meetings` | Scheduled meetings/calls/visits | → customer, prospect, deal, user |
| `crm_meeting_attendees` | Meeting participants | → meeting, user/contact |
| `crm_task_collaborators` | Multi-user task assignment | → task, user |
| `crm_documents` | File attachments | → customer, prospect, deal |
| `crm_audit_log` | Field change tracking | → any entity (polymorphic) |

### Modified Tables
| Table | Changes |
|---|---|
| `crm_tasks` | + date_start, + reminders (JSONB), + parent_type/parent_id, status enum expansion |
| `crm_deals` | + probability, + amount_weighted, + lead_source, + contact_id |
| `fp_prospects` | + status enum expansion, + conversion_date, + converted_customer_id |

---

## 7. What NOT to Adopt from EspoCRM

- **Campaign/Mass Email** — not relevant for our B2B packaging sales model
- **Knowledge Base** — overkill for our team size
- **Portal/Customer Portal** — not needed, customers don't self-serve
- **Target Lists** — marketing automation we don't need
- **Workflow Engine** — our business logic is simpler, hooks + cron jobs suffice
- **Custom Entity Builder** — we have a fixed domain model, no need for dynamic entities
