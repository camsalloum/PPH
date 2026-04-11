# QC Sample Evaluation — Full Implementation Plan

> **Module:** MES Pre-Sales → QC Analysis → CSE Approval  
> **Date:** 2026-02-25  
> **Status:** Executed through Phase E (A-E complete)  
> **Scope:** Access control fix, QC inbox, analysis forms, CSE workflow, approvals, notifications

---

## 0. Problem Statement

### What's broken today

| Issue | Detail |
|-------|--------|
| **QC Lab sees Sales dashboard** | A `quality_control` user logs in → lands on CRM → sees "Overview, My Report, Budget, My Customers, My Prospects, My Map" — none of these are relevant |
| **No QC inbox** | QC has no landing page. The only way to find samples is to physically scan a QR code. No list of pending work. |
| **No analysis forms** | QC can click "Mark as Received" / "Start Testing" / submit pass/fail — but there's no structured test form (what tests? what results? what instruments?) |
| **No CSE document** | After QC tests, there's no Customer Sample Evaluation report generated |
| **No approval workflow** | QC Manager + Production Manager don't review/approve the CSE before it reaches Sales |
| **No role-based module access** | Routes are open to any authenticated user. QC, Production, Finance users all see the same CRM |

### Current roles in the system (from `roles` table)

| Role | Department | Should see |
|------|-----------|------------|
| `admin` | Management | Everything |
| `manager` | Management | Everything |
| `sales_manager` | Sales | MIS + CRM + MES |
| `sales_coordinator` | Sales | CRM + MES |
| `sales_rep` | Sales | CRM (sales tabs) + MES (pre-sales) |
| `sales_executive` | Sales | CRM (sales tabs) + MES (pre-sales) |
| `quality_control` | Manufacturing | **MES only** → QC Dashboard |
| `production_manager` | Manufacturing | **MES only** → Production view + CSE approval |
| `operator` | Manufacturing | MES only (future) |
| `logistics_manager` | Stores & Logistics | MES only (future) |
| `stores_keeper` | Stores & Logistics | MES only (future) |
| `accounts_manager` | Finance | MES only (future) |
| `accountant` | Finance | MES only (future) |

---

## 1. Access Control Fix

### 1A. Module Selector — role-based module visibility

**File:** `src/components/modules/ModuleSelector.jsx`

```
SALES_ROLES  = ['admin','manager','sales_manager','sales_coordinator','sales_rep','sales_executive']
QC_ROLES     = ['admin','manager','quality_control']
PROD_ROLES   = ['admin','manager','production_manager','operator']

Module visibility:
  MIS  → admin, manager, sales_manager, sales_coordinator
  CRM  → SALES_ROLES only
  MES  → everyone (but they see different dashboards inside)
```

### 1B. CRM route guard

**File:** `src/App.jsx` — add `requiredRole` to the CRM route:

```jsx
<Route path="/crm/*" element={
  <ProtectedRoute requiredRole={SALES_ROLES} roleRedirectTo="/mes">
    <CRMModule />
  </ProtectedRoute>
}>
```

QC/Production/Finance users who try `/crm` → auto-redirect to `/mes`.

### 1C. MES landing page — department-aware

**File:** `src/components/MES/WorkflowLandingPage.jsx`

When a `quality_control` user opens `/mes`:
- Show the **QC Dashboard** (new component) instead of the 17-phase workflow diagram
- Quick links: "QC Inbox", "Pending Analyses", "Completed Evaluations"

When `production_manager` opens `/mes`:
- Show production-relevant dashboard with CSE approval queue

When `sales_*` opens `/mes`:
- Current behavior: workflow + pre-sales module

### 1D. Auto-redirect on login

**File:** `src/contexts/AuthContext.jsx` or `src/App.jsx`

After login, redirect based on department:
```
Sales roles        → /crm
quality_control    → /mes/qc
production_manager → /mes
admin/manager      → /modules (choose)
```

---

## 2. QC Dashboard & Inbox

### New component: `src/components/MES/QC/QCDashboard.jsx`

This is the **home page** for QC Lab users. Accessible at `/mes/qc`.

#### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  🔬 QC Lab Dashboard                          [username] ⚙ │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  STATS ROW                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Pending  │  │ Received │  │ Testing  │  │Completed │   │
│  │  Receipt  │  │  Today   │  │ In Prog  │  │ This Wk  │   │
│  │    5      │  │    3     │  │    2     │  │    12    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                             │
│  ┌─ INBOX: PENDING RECEIPT ──────────────────────────────┐  │
│  │ SMP-FP-2026-00041  │ Customer ABC  │ Shrink Film      │  │
│  │ Submitted: 25 Feb  │ Priority: HIGH│ [Mark Received]  │  │
│  ├────────────────────┼───────────────┼──────────────────┤  │
│  │ SMP-FP-2026-00042  │ Customer ABC  │ Labels           │  │
│  │ Submitted: 25 Feb  │ Priority: HIGH│ [Mark Received]  │  │
│  ├────────────────────┼───────────────┼──────────────────┤  │
│  │ SMP-FP-2026-00039  │ Customer XYZ  │ Pouches          │  │
│  │ Submitted: 24 Feb  │ Priority: NORM│ [Mark Received]  │  │
│  └────────────────────┴───────────────┴──────────────────┘  │
│                                                             │
│  ┌─ IN PROGRESS ─────────────────────────────────────────┐  │
│  │ SMP-FP-2026-00035  │ Testing  │ [Open Analysis Form]  │  │
│  │ SMP-FP-2026-00037  │ Received │ [Start Testing]       │  │
│  └────────────────────┴──────────┴───────────────────────┘  │
│                                                             │
│  ┌─ RECENTLY COMPLETED ──────────────────────────────────┐  │
│  │ SMP-FP-2026-00030  │ PASS  │ CSE Pending Approval     │  │
│  │ SMP-FP-2026-00028  │ FAIL  │ CSE Approved             │  │
│  └────────────────────┴───────┴──────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

#### Key features

1. **Inbox table** — All samples with `status = sent_to_qc` (sorted by priority, then date)
2. **In Progress** — Samples with `status IN (received_by_qc, testing)`
3. **Recently Completed** — Last 20 samples with `status IN (tested, approved, rejected)` + CSE status
4. **Stats cards** — Counts by status for current QC user
5. **Click any row** → opens `/mes/qc/samples/:sampleId` (the analysis page)
6. **Batch receive** — Checkbox select multiple → "Mark All Received" button

### New route in MES index: `/mes/qc`

**File:** `src/components/MES/index.jsx`

```jsx
const QCDashboard = React.lazy(() => import('./QC/QCDashboard'));
const QCSampleAnalysis = React.lazy(() => import('./QC/QCSampleAnalysis'));

<Route path="qc" element={<QCDashboard />} />
<Route path="qc/samples/:sampleId" element={<QCSampleAnalysis />} />
<Route path="qc/scan/:sampleNumber" element={<QCScanPage />} />  // existing
```

---

## 3. Backend: QC Inbox API

### New endpoint: `GET /api/mes/presales/qc/inbox`

**File:** `server/routes/mes/presales.js`

```
Query params:
  ?status=sent_to_qc,received_by_qc,testing  (comma-separated, default: sent_to_qc)
  ?priority=high
  ?page=1&limit=50

Response: {
  success: true,
  data: [
    {
      id, sample_number, inquiry_number, customer_name, customer_country,
      product_group, sample_type, description, status, priority,
      created_at, created_by_name,     // who registered
      submitted_at,                     // when sent to QC
      received_at, received_by_qc_name,
      inquiry_id,
      attachment_count,                 // number of TDS/spec files
      cse_status                        // null | 'draft' | 'submitted' | 'approved' | 'rejected'
    }
  ],
  pagination: { page, limit, total }
}
```

### New endpoint: `GET /api/mes/presales/qc/stats`

Returns counts: `{ pending_receipt, received, testing, completed_today, completed_this_week }`

### New endpoint: `POST /api/mes/presales/qc/batch-receive`

Body: `{ sample_ids: [1, 2, 3] }`  
Marks all as `received_by_qc` in one transaction.

---

## 4. Sample Analysis Form

### New component: `src/components/MES/QC/QCSampleAnalysis.jsx`

Route: `/mes/qc/samples/:sampleId`

This is the **full analysis form** that QC fills out during testing. It replaces the simple pass/fail on QCScanPage.

#### Page layout

```
┌───────────────────────────────────────────────────────────────────────┐
│  ← Back to QC Inbox                                                   │
│                                                                       │
│  SMP-FP-2026-00041               Status: TESTING                      │
│  Customer: ABC Corp │ Product: Shrink Film │ Inquiry: INQ-FP-2026-001 │
│                                                                       │
│  ┌── PROGRESS ──────────────────────────────────────────────────────┐ │
│  │ Registered → Sent to QC → ✅ Received → 🔵 Testing → Evaluated │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌── SAMPLE INFO (read-only) ───────────────────────────────────────┐ │
│  │ Product Group: Shrink Film Plain                                  │ │
│  │ Sample Type: Physical                                             │ │
│  │ Description: 24x24 pouch, matte finish, 80 micron                │ │
│  │ Submitted by: Ahmed (Sales) on 25 Feb 2026                       │ │
│  │ Received by: Dr. Faiyaz on 25 Feb 2026 14:30                    │ │
│  │                                                                   │ │
│  │ 📎 Attached Files                                                 │ │
│  │   [TDS] product-spec.pdf  │  [Artwork] design-v2.ai              │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌── QC ANALYSIS FORM ─────────────────────────────────────────────┐  │
│  │                                                                  │  │
│  │  Test Category     [Physical Properties ▼]                       │  │
│  │                                                                  │  │
│  │  ┌─ TEST PARAMETERS ─────────────────────────────────────────┐  │  │
│  │  │ Parameter        │ Spec/Target  │ Result   │ Status       │  │  │
│  │  ├──────────────────┼──────────────┼──────────┼──────────────┤  │  │
│  │  │ Thickness (μm)   │ 80 ± 5       │ [___]    │ [PASS/FAIL]  │  │  │
│  │  │ Width (mm)       │ 610 ± 2      │ [___]    │ [PASS/FAIL]  │  │  │
│  │  │ Tensile Strength │ > 25 MPa     │ [___]    │ [PASS/FAIL]  │  │  │
│  │  │ Elongation (%)   │ > 300%       │ [___]    │ [PASS/FAIL]  │  │  │
│  │  │ Haze (%)         │ < 5%         │ [___]    │ [PASS/FAIL]  │  │  │
│  │  │ COF              │ 0.2-0.4      │ [___]    │ [PASS/FAIL]  │  │  │
│  │  │ [+ Add Parameter]                                         │  │  │
│  │  └───────────────────────────────────────────────────────────┘  │  │
│  │                                                                  │  │
│  │  Visual Inspection   [PASS ▼]                                    │  │
│  │  Print Quality       [N/A ▼]                                     │  │
│  │  Seal Strength       [___] N/15mm    [PASS/FAIL]                 │  │
│  │                                                                  │  │
│  │  ┌─ OBSERVATIONS ────────────────────────────────────────────┐  │  │
│  │  │                                                            │  │  │
│  │  │ [Multi-line text area for QC notes...]                     │  │  │
│  │  │                                                            │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  │                                                                  │  │
│  │  📎 Upload Test Evidence (photos, charts, certificates)          │  │
│  │     [+ Add File]                                                 │  │
│  │                                                                  │  │
│  │  Overall Result:  ◉ PASS  ○ FAIL  ○ CONDITIONAL                  │  │
│  │                                                                  │  │
│  │  Recommendation:                                                 │  │
│  │  [Text area: recommendations for production / customer]          │  │
│  │                                                                  │  │
│  │           [Save Draft]    [Submit Analysis & Generate CSE]       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

#### Form sections

| Section | Fields | Notes |
|---------|--------|-------|
| **Test Category** | Dropdown: Physical Properties, Print Quality, Seal Integrity, Optical Properties, Chemical/Migration, Custom | Drives which standard parameters are pre-filled |
| **Test Parameters** | Dynamic rows: Parameter Name, Specification/Target, Test Result, Pass/Fail per row | QC can add/remove rows. Common parameters pre-filled by category. |
| **Visual Inspection** | Dropdown: Pass / Fail / N/A | Quick check |
| **Print Quality** | Dropdown: Pass / Fail / N/A | If sample has print |
| **Seal Strength** | Numeric input + unit + pass/fail | If applicable |
| **Observations** | TextArea | Free notes |
| **Test Evidence** | File upload (photos, charts) | Stored as attachments with type `qc_evidence` |
| **Overall Result** | Radio: PASS / FAIL / CONDITIONAL | Required before submit |
| **Recommendation** | TextArea | Recommendations for production feasibility |

#### Actions

| Button | Effect |
|--------|--------|
| **Save Draft** | Saves analysis data to DB without changing sample status. QC can come back later. |
| **Submit Analysis & Generate CSE** | Validates form → saves → changes sample status to `tested` → generates CSE document → triggers approval workflow |

---

## 5. Database: New Tables

### 5A. `mes_qc_analyses` — QC analysis data

```sql
CREATE TABLE IF NOT EXISTS mes_qc_analyses (
  id              SERIAL PRIMARY KEY,
  sample_id       INTEGER NOT NULL REFERENCES mes_presales_samples(id),
  inquiry_id      INTEGER NOT NULL REFERENCES mes_presales_inquiries(id),

  -- Test category
  test_category   VARCHAR(100),          -- 'physical', 'print', 'seal', 'optical', 'chemical', 'custom'

  -- Dynamic test parameters (flexible schema)
  test_parameters JSONB DEFAULT '[]',    -- [{name, spec, result, unit, status: 'pass'|'fail'|'na'}]

  -- Quick checks
  visual_inspection   VARCHAR(20),       -- 'pass', 'fail', 'na'
  print_quality       VARCHAR(20),       -- 'pass', 'fail', 'na'
  seal_strength_value DECIMAL(10,2),
  seal_strength_unit  VARCHAR(20) DEFAULT 'N/15mm',
  seal_strength_status VARCHAR(20),      -- 'pass', 'fail', 'na'

  -- Summary
  observations    TEXT,
  overall_result  VARCHAR(20),           -- 'pass', 'fail', 'conditional'
  recommendation  TEXT,

  -- Status
  status          VARCHAR(20) DEFAULT 'draft',  -- 'draft', 'submitted'
  
  -- Audit
  analyzed_by     INTEGER,
  analyzed_by_name VARCHAR(255),
  started_at      TIMESTAMP,
  submitted_at    TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);
```

### 5B. `mes_cse_reports` — Customer Sample Evaluation

```sql
CREATE TABLE IF NOT EXISTS mes_cse_reports (
  id              SERIAL PRIMARY KEY,
  cse_number      VARCHAR(50) UNIQUE NOT NULL,    -- CSE-FP-2026-00001
  sample_id       INTEGER NOT NULL REFERENCES mes_presales_samples(id),
  inquiry_id      INTEGER NOT NULL REFERENCES mes_presales_inquiries(id),
  analysis_id     INTEGER NOT NULL REFERENCES mes_qc_analyses(id),

  -- CSE content (snapshot of analysis + inquiry for the report)
  customer_name   VARCHAR(255),
  product_group   VARCHAR(255),
  sample_number   VARCHAR(50),
  inquiry_number  VARCHAR(50),
  test_summary    JSONB,                          -- snapshot of test params & results
  overall_result  VARCHAR(20),                    -- 'pass', 'fail', 'conditional'
  observations    TEXT,
  recommendation  TEXT,

  -- Approval workflow
  status          VARCHAR(30) DEFAULT 'pending_qc_manager',
  -- Statuses: pending_qc_manager → pending_production → approved / rejected → sent_to_sales

  -- QC Manager approval
  qc_manager_status     VARCHAR(20),              -- 'approved', 'rejected', 'revision_requested'
  qc_manager_notes      TEXT,
  qc_manager_user_id    INTEGER,
  qc_manager_name       VARCHAR(255),
  qc_manager_acted_at   TIMESTAMP,

  -- Production Manager approval
  prod_manager_status   VARCHAR(20),              -- 'approved', 'rejected', 'revision_requested'
  prod_manager_notes    TEXT,
  prod_manager_user_id  INTEGER,
  prod_manager_name     VARCHAR(255),
  prod_manager_acted_at TIMESTAMP,

  -- Final
  final_status    VARCHAR(20),                    -- 'approved', 'rejected'
  completed_at    TIMESTAMP,

  -- Audit
  created_by      INTEGER,
  created_by_name VARCHAR(255),
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);
```

### 5C. `mes_notifications` — In-app notification system

```sql
CREATE TABLE IF NOT EXISTS mes_notifications (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL,               -- recipient
  type            VARCHAR(50) NOT NULL,            -- 'sar_submitted', 'cse_pending_approval', 'cse_approved', 'cse_rejected', etc.
  title           VARCHAR(255) NOT NULL,
  message         TEXT,
  link            VARCHAR(500),                    -- deep link: /mes/qc/samples/42, /mes/approvals/cse/5
  reference_type  VARCHAR(50),                     -- 'sample', 'cse', 'inquiry'
  reference_id    INTEGER,
  is_read         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread ON mes_notifications(user_id, is_read) WHERE NOT is_read;
```

---

## 6. CSE Approval Workflow

### Flow diagram

```
QC Lab submits analysis
        │
        ▼
   ┌─────────────────┐
   │  CSE Generated   │  status: pending_qc_manager
   │  CSE-FP-2026-001 │
   └────────┬────────┘
            │  🔔 Notify QC Manager
            ▼
   ┌─────────────────┐
   │  QC Manager      │  Reviews test data + observations
   │  Review          │
   └───┬─────────┬───┘
       │         │
    Approve    Reject / Request Revision
       │         │
       │         └──► 🔔 Notify QC Lab → revise & resubmit
       │
       ▼  status: pending_production
   ┌─────────────────┐
   │  Production Mgr  │  Reviews feasibility + recommendation
   │  Review          │
   └───┬─────────┬───┘
       │         │
    Approve    Reject / Request Revision
       │         │
       │         └──► 🔔 Notify QC Lab → revise & resubmit
       │
       ▼  status: approved (or rejected)
   ┌─────────────────┐
   │  CSE Complete    │
   │  final_status    │
   └────────┬────────┘
            │  🔔 Notify Sales Rep who submitted the SAR
            ▼
   ┌─────────────────┐
   │  Sales Rep gets  │  Can view CSE, download PDF, proceed to next steps
   │  notification    │
   └─────────────────┘
```

### Approval page: `src/components/MES/QC/CSEApprovalPage.jsx`

Route: `/mes/qc/cse/:cseId`

Shown to QC Manager and Production Manager. Contains:
- CSE header (customer, product, sample number)
- Full test results summary (read-only)
- Observations & recommendation (read-only)
- Attached evidence files
- **Action section**: Approve / Reject / Request Revision + Notes textarea

### Approval queue: `src/components/MES/QC/CSEApprovalQueue.jsx`

Route: `/mes/approvals`

Table of CSE reports awaiting the current user's approval. Filtered by:
- QC Manager sees `status = pending_qc_manager`
- Production Manager sees `status = pending_production`

---

## 7. Notification System

### 7A. Backend: notification service

**New file:** `server/services/notificationService.js`

```js
// Core functions:
createNotification({ userId, type, title, message, link, referenceType, referenceId })
getUnreadCount(userId)
getNotifications(userId, { page, limit, unreadOnly })
markAsRead(notificationId, userId)
markAllAsRead(userId)

// High-level helpers:
notifySARSubmitted(inquiry, samples, recipientUserIds)
notifyCSEReadyForApproval(cse, recipientUserId, approverRole)
notifyCSEApproved(cse, salesRepUserId)
notifyCSERejected(cse, qcLabUserId, rejectorName, notes)
notifyCSERevisionRequested(cse, qcLabUserId, requestorName, notes)
```

### 7B. Backend: notification API routes

**New file:** `server/routes/notifications.js`

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/notifications` | Get current user's notifications (paginated) |
| GET | `/api/notifications/unread-count` | Get unread count (for badge) |
| PATCH | `/api/notifications/:id/read` | Mark one as read |
| POST | `/api/notifications/mark-all-read` | Mark all as read |

### 7C. Frontend: notification bell

**New component:** `src/components/common/NotificationBell.jsx`

- Bell icon in the header (CRM header + MES header)
- Badge with unread count
- Click → dropdown panel showing recent notifications
- Each notification: icon + title + time + click → navigate to `link`
- "Mark all as read" button
- Polls every 30 seconds (or use SSE later)

### 7D. When notifications fire

| Event | Recipients | Type | Link |
|-------|-----------|------|------|
| Sales submits SAR (samples to QC) | All users with role `quality_control` | `sar_submitted` | `/mes/qc` |
| QC submits analysis → CSE generated | QC Manager user(s) | `cse_pending_approval` | `/mes/qc/cse/{id}` |
| QC Manager approves CSE | Production Manager user(s) | `cse_pending_approval` | `/mes/qc/cse/{id}` |
| Production Manager approves CSE | Sales Rep who created the inquiry | `cse_approved` | `/mes/qc/cse/{id}` |
| QC Manager / Prod Manager rejects | QC Lab user who did the analysis | `cse_rejected` | `/mes/qc/samples/{id}` |
| Revision requested | QC Lab user who did the analysis | `cse_revision_requested` | `/mes/qc/samples/{id}` |

### 7E. Email notifications (parallel to in-app)

Every in-app notification also triggers an email (via existing `emailService`). The email contains:
- Subject matching the notification title
- HTML body with details + direct link button
- Dev mode: Ethereal preview URL logged

---

## 8. API Routes — Complete New Endpoints

### QC Inbox & Analysis

| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| GET | `/api/mes/presales/qc/inbox` | List samples for QC (filterable by status) | `quality_control`, `admin` |
| GET | `/api/mes/presales/qc/stats` | QC dashboard stats | `quality_control`, `admin` |
| POST | `/api/mes/presales/qc/batch-receive` | Mark multiple samples as received | `quality_control`, `admin` |
| GET | `/api/mes/presales/qc/analyses/:sampleId` | Get analysis for a sample | `quality_control`, `admin` |
| POST | `/api/mes/presales/qc/analyses` | Create/save analysis draft | `quality_control` |
| PATCH | `/api/mes/presales/qc/analyses/:id` | Update analysis draft | `quality_control` |
| POST | `/api/mes/presales/qc/analyses/:id/submit` | Submit analysis → generate CSE | `quality_control` |

### CSE Approval

| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| GET | `/api/mes/presales/cse` | List CSE reports (filterable) | Any authenticated |
| GET | `/api/mes/presales/cse/:id` | Get single CSE with full details | Any authenticated |
| POST | `/api/mes/presales/cse/:id/approve` | Approve CSE (QC Mgr or Prod Mgr) | `quality_control`, `production_manager`, `admin` |
| POST | `/api/mes/presales/cse/:id/reject` | Reject CSE | `quality_control`, `production_manager`, `admin` |
| POST | `/api/mes/presales/cse/:id/request-revision` | Send back to QC Lab | `quality_control`, `production_manager`, `admin` |
| GET | `/api/mes/presales/cse/:id/pdf` | Generate CSE PDF | Any authenticated |

### Notifications

| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| GET | `/api/notifications` | Get notifications | Any authenticated |
| GET | `/api/notifications/unread-count` | Unread badge count | Any authenticated |
| PATCH | `/api/notifications/:id/read` | Mark read | Any authenticated |
| POST | `/api/notifications/mark-all-read` | Mark all read | Any authenticated |

---

## 9. Frontend Components — Full List

### New files to create

| File | Purpose |
|------|---------|
| `src/components/MES/QC/QCDashboard.jsx` | QC landing page with inbox, stats, in-progress, completed |
| `src/components/MES/QC/QCSampleAnalysis.jsx` | Full analysis form for a single sample |
| `src/components/MES/QC/CSEApprovalPage.jsx` | View + approve/reject a CSE report |
| `src/components/MES/QC/CSEApprovalQueue.jsx` | Table of pending CSE approvals |
| `src/components/MES/QC/CSEDocument.jsx` | CSE document view (printable) |
| `src/components/common/NotificationBell.jsx` | Notification bell + dropdown |
| `server/services/notificationService.js` | In-app notification CRUD |
| `server/routes/notifications.js` | Notification API endpoints |
| `server/routes/mes/qc.js` | QC inbox, analysis, CSE API endpoints |
| `server/migrations/mes-qc-001-analysis-cse.js` | New tables migration |

### Files to modify

| File | Change |
|------|--------|
| `src/components/modules/ModuleSelector.jsx` | Role-based module visibility |
| `src/App.jsx` | CRM route requires sales role; add role redirects |
| `src/components/MES/index.jsx` | Add QC routes (`/qc`, `/qc/samples/:id`, `/qc/cse/:id`, `/approvals`) |
| `src/components/CRM/CRMModule.jsx` | (Already protected by route guard in App.jsx) |
| `server/server.js` | Register notification routes + qc routes |
| `server/routes/mes/presales.js` | Trigger notifications on SAR submission |

---

## 10. Complete Process Flow — End to End

```
SALES REP                         QC LAB                      QC MANAGER              PROD MANAGER              SALES REP
─────────                         ──────                      ──────────              ────────────              ─────────

1. Create Inquiry
2. Register Samples
3. Attach TDS/Artwork
4. Print SAR forms
5. Submit to QC ──────────► 🔔 Notification appears
                              in QC Dashboard inbox
                              + Email sent
                                    │
                           6. Mark as Received
                              (scan QR or click inbox)
                                    │
                           7. Start Testing
                                    │
                           8. Fill Analysis Form
                              - Test parameters
                              - Visual inspection
                              - Observations
                              - Upload evidence
                              - Overall result
                              - Recommendation
                                    │
                           9. Submit Analysis
                              → CSE auto-generated ──► 🔔 CSE ready
                                                        for review
                                                           │
                                                    10. Review CSE
                                                        Approve ──────► 🔔 CSE ready
                                                        or Reject           for review
                                                        or Revise              │
                                                                        11. Review CSE
                                                                            Approve ──────► 🔔 CSE Approved!
                                                                            or Reject          │
                                                                            or Revise   12. View CSE
                                                                                            Download PDF
                                                                                            Proceed to
                                                                                            next steps
                                                                                            (quotation etc.)
```

---

## 11. Implementation Order (Phases)

### Phase A — Access Control (Foundation) — ✅ Completed (2026-02-25)

1. ✅ ModuleSelector updated: role-based module visibility
2. ✅ Route guard added on `/crm/*` in `App.jsx` (sales roles only, redirect others to `/mes`)
3. ✅ Login redirect updated by role (`Login.jsx`)
4. ✅ Backend security hardening: clearance API now admin-only (`PATCH /inquiries/:id/clearance`)
5. ✅ MES workflow links aligned to `/mes/inquiries` to avoid CRM dependency for non-sales roles

### Phase B — QC Dashboard + Inbox — ✅ Core Delivered (2026-02-25)

1. ✅ Migration file created: `server/migrations/mes-qc-001-analysis-cse.js` (`mes_qc_analyses`, `mes_cse_reports`, CSE sequence)
2. ✅ Backend APIs implemented in `server/routes/mes/presales.js`:
  - `GET /api/mes/presales/qc/inbox`
  - `GET /api/mes/presales/qc/stats`
  - `POST /api/mes/presales/qc/batch-receive`
3. ✅ Frontend dashboard implemented: `src/components/MES/QC/QCDashboard.jsx`
4. ✅ Routing wired:
  - `/mes/qc` dashboard route added
  - QC role default MES landing now opens QC dashboard

**Remaining before closing Phase B completely:**
- Run migration in target environments
- Add role-specific guard for `/mes/qc` route (currently protected by API + auth, not explicit route role guard)
- Optional UI refinements (filters/pagination controls)

### Phase C — Analysis Form — ✅ Completed (2026-02-25)

1. ✅ Backend analysis endpoints implemented (`GET/POST/PATCH /qc/analyses`, `POST /qc/analyses/:id/submit`)
2. ✅ Frontend `QCSampleAnalysis.jsx` implemented and routed (`/mes/qc/samples/:sampleId`)
3. ✅ Save draft + submit flow implemented
4. ✅ Dynamic test parameter rows and category presets implemented

### Phase D — CSE Generation + Approval — ✅ Completed (2026-02-25)

1. ✅ Backend CSE generation on analysis submit implemented
2. ✅ Backend approval/reject/revision endpoints implemented (`/cse/:id/approve|reject|request-revision`)
3. ✅ Frontend `CSEApprovalPage.jsx` implemented
4. ✅ Frontend `CSEApprovalQueue.jsx` implemented
5. 🔄 CSE printable/PDF remains in Phase F

### Phase E — Notification System — ✅ Completed (2026-02-25)

1. ✅ Migration created and executed: `mes-qc-002-notifications.js`
2. ✅ Backend service implemented: `server/services/notificationService.js`
3. ✅ Notification routes implemented and mounted: `server/routes/notifications.js`, `server/config/express.js`
4. ✅ Frontend MES bell implemented: `src/components/common/MESNotificationBell.jsx`
5. ✅ Workflow notifications wired into SAR submit and CSE lifecycle in `server/routes/mes/presales.js`
6. ✅ Existing email path retained in parallel where already available

### Phase F — Polish & Integration — ~0.5 day

1. CSE PDF generation (printable HTML like SAR)
2. Activity log entries for all new actions
3. Sales Rep view of CSE results in InquiryDetail
4. Final testing end-to-end

**Total estimate: ~5-7 days**

---

## 12. CSE Document Layout (Print)

```
┌─────────────────────────────────────────────────────────────┐
│  [LOGO]  Company Name                                       │
│          Flexible Packaging Division                        │
│                                                             │
│          CUSTOMER SAMPLE EVALUATION                         │
│          CSE-FP-2026-00001                     [QR CODE]    │
│          Date: 25 Feb 2026                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Customer:     ABC Corporation                              │
│  Country:      United Arab Emirates                         │
│  Inquiry:      INQ-FP-2026-00123                           │
│  Sample:       SMP-FP-2026-00041                           │
│  Product Group: Shrink Film Plain                           │
│  Sample Type:  Physical                                     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  TEST RESULTS                                               │
│                                                             │
│  Parameter        │ Specification │ Result  │ Status        │
│  ─────────────────┼───────────────┼─────────┼───────────    │
│  Thickness (μm)   │ 80 ± 5        │ 82      │ ✅ PASS      │
│  Width (mm)       │ 610 ± 2       │ 611     │ ✅ PASS      │
│  Tensile Strength │ > 25 MPa      │ 28.3    │ ✅ PASS      │
│  Elongation (%)   │ > 300%        │ 342     │ ✅ PASS      │
│  Haze (%)         │ < 5%          │ 3.2     │ ✅ PASS      │
│  COF              │ 0.2-0.4       │ 0.31    │ ✅ PASS      │
│                                                             │
│  Visual Inspection:  PASS                                   │
│  Print Quality:      N/A                                    │
│  Seal Strength:      12.5 N/15mm — PASS                    │
│                                                             │
│  OVERALL RESULT:  ████ PASS ████                           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  OBSERVATIONS                                               │
│  Sample meets all required specifications. Film clarity     │
│  is excellent. Recommended for production.                  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  RECOMMENDATION                                             │
│  Proceed with production. Standard settings applicable.     │
│  No special tooling required.                               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  APPROVALS                                                  │
│                                                             │
│  QC Analyst:          Dr. Faiyaz        25 Feb 2026        │
│  QC Manager:          Mr. Hassan        25 Feb 2026  ✅    │
│  Production Manager:  Mr. Khalid        26 Feb 2026  ✅    │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  CSE-FP-2026-00001 │ ProPack Hub │ Confidential            │
└─────────────────────────────────────────────────────────────┘
```

---

## 13. Summary

| What | Current State | Target State |
|------|---------------|--------------|
| Module access | Everyone sees CRM + MES | Sales → CRM+MES, QC → MES/QC, Prod → MES/Prod |
| QC landing page | None (blank or Sales cockpit) | QC Dashboard with inbox, stats, actions |
| Sample analysis | 3 buttons: Receive/Test/Pass-Fail | Full form: parameters, evidence, observations |
| CSE document | Does not exist | Auto-generated from analysis, printable, with QR |
| Approval workflow | Does not exist | QC Lab → QC Manager → Production Manager → Sales Rep |
| Notifications | Email only on SAR submit | In-app bell + email on every workflow transition |
| Sales Rep feedback | No visibility into QC progress | Notification when CSE approved + view CSE in inquiry |
