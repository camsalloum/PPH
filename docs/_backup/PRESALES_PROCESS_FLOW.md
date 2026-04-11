# Pre-Sales Process Flow — Inquiry to QC Analysis & CSE Approval

> **Module:** MES Pre-Sales → QC Analysis → CSE Approval → Quotation → Pre-Prod → PI → Production → Delivery  
> **Division:** Flexible Packaging (FP)  
> **Last Updated:** 2026-03-01  
> **Status:** Production-ready — Sprints 1-5.1 complete. Full 21-stage lifecycle with pipeline, quotations, pre-prod samples, proforma invoices, soft-delete, stage_changed_at, lost/on_hold from any active stage.

---

## 1. Overview

The Pre-Sales module manages the lifecycle of a customer inquiry from first contact through QC analysis and CSE approval. It covers five phases:

| Phase | Name | Purpose | Status |
|-------|------|---------|--------|
| **Phase 1** | Inquiry & Registration | Capture inquiry, register samples, attach documents | ✅ Built |
| **Phase 2** | Sample Submission & QC Receipt | Submit samples to QC Lab, receive and begin testing | ✅ Built |
| **Phase 3** | QC Analysis & CSE Generation | Full analysis form, test parameters, generate CSE document | ✅ Built |
| **Phase 4** | CSE Approval Workflow | QC Manager → Production Manager sequential approval | ✅ Built |
| **Phase 5** | Pre-Sales Clearance | Admin signs off that pre-sales is complete (API role enforcement enforced) | ✅ Built |

> **What comes AFTER pre-sales:** Quotation → Order Confirmation → MOQ & Material Check → Production → Delivery. MOQ and Material checks are **not** part of Pre-Sales — they belong in the Pre-Production phase (Phase 7 on the MES workflow).

> **Detailed implementation plan:** See [QC_SAMPLE_EVALUATION_PLAN.md](QC_SAMPLE_EVALUATION_PLAN.md) for the full technical spec covering access control, QC dashboard, analysis forms, CSE workflow, database schema, and notifications.

### Implementation Reality Check (Code-Verified)

| Marker | Meaning |
|--------|---------|
| ✅ | Implemented in code and working |
| 🔲 | Planned only (not implemented yet) |
| ⚠ | Mismatch / risk between documentation and current code |

**⚠ Current mismatches to note before implementation:**
1. **✅ CRM access control fixed (2026-02-25)** — `/crm/*` now has role guard (sales roles only); other roles are redirected to `/mes`.
2. **✅ Module selector filtering fixed (2026-02-25)** — module cards are now role-based (`MIS`, `CRM`, `MES` visibility by role).
3. **✅ Pre-sales clearance authorization fixed (2026-02-25)** — backend `PATCH /inquiries/:id/clearance` now enforces `admin` role.
4. **✅ Notification system implemented (2026-02-25)** — MES bell + notification API now handle SAR/CSE workflow events.
5. **✅ Status flow (2026-03-01)** — `LOST` and `ON_HOLD` are fully implemented in pipeline. Lost is reachable from any non-terminal stage (⛔ guarded: blocked if active quotations exist). On_hold can resume to new_inquiry / sar_pending / estimation / quoted / negotiating.

### 2026-02-25/26 Hotfix Recap (Implemented)

1. **✅ User → Employee auto-provisioning enforced**
     - New user creation now auto-creates linked employee profile.
     - `users.employee_id` is set at creation time.
     - `employee_divisions` is auto-populated from assigned/default user divisions.
     - Invalid designation/access-level mapping now fails fast (no silent fallback).

2. **✅ Legacy visibility issue fixed (QC employee not appearing)**
     - Root cause identified: missing `employee_divisions` mapping caused division-filter exclusion.
     - Data backfill applied and employee creation flow hardened to inherit divisions from linked user when omitted.

3. **✅ QC scope tightened in MES Pre-Sales + landing**
     - QC role checks expanded to include `quality_control`, `qc_manager`, and `qc_lab` where applicable.
     - QC workflow landing is constrained to QC-relevant stage context (Sample & QC Review).

4. **✅ Department-aware MES lock for QC users**
     - MES access/profile classification now uses role + designation + employee department.
     - QC-department users default to QC context and are blocked from full cross-department workflow scope.
     - Hardening applied at MES route entry and workflow profile derivation (not only visual filtering).

---

## 2. Actors / Roles

| Role | System Role | Department | Capabilities |
|------|-------------|------------|--------------|
| **Sales Rep** | `sales_rep`, `sales_executive` (legacy: `user`) | Sales | Create inquiry, register samples, attach files, submit to QC, print SAR, recall samples |
| **Sales Coordinator** | `sales_coordinator` | Sales | Same as Sales Rep + view all team data |
| **Sales Manager** | `sales_manager` | Sales | Same as Coordinator + view all team data |
| **Manager / Admin** | `manager`, `admin` | Management | Full control: approve prospects, grant clearance, change phases |
| **QC Lab Technician** | `quality_control` | Manufacturing | Receive samples, fill analysis form, submit evaluations |
| **QC Manager** | `quality_control` (designated) | Manufacturing | Review & approve CSE reports, request revisions |
| **Production Manager** | `production_manager` | Manufacturing | Second-level CSE approval for production feasibility |

> **Access control (implemented):** Sales roles → CRM + MES. QC/Production/Finance roles are blocked from CRM and redirected to MES. QC-specific dashboards/routes are active.

---

## 3. Detailed Step-by-Step Flow

### STEP 1 — Create Inquiry

**Who:** Sales Rep (or Coordinator)  
**Where:** `/crm/inquiries/new` → Inquiry Capture Wizard (3-step form)

The wizard collects:
- **Step 1:** Customer information (name, type: new/existing/prospect, country, contact)
- **Step 2:** Inquiry details (product groups, source, priority, notes)
- **Step 3:** Sample requirements (sample type: physical/digital/both, notes)

**Result:**
- New inquiry created with status `new` and presales_phase `inquiry`
- Inquiry number generated: `INQ-FP-2026-XXXXX`
- If customer type is "new", a prospect record is created for company registration

---

### STEP 2 — Register Samples

**Who:** Sales Rep  
**Where:** Inquiry Detail page → Samples section → `+ Add New Sample`  
**When available:** Only while presales_phase is `inquiry` (before submission to QC)

For each sample, the rep fills in:
| Field | Required | Example |
|-------|----------|---------|
| Product Group | Yes | "Shrink Film Plain", "Labels" (fetched from `crm_product_groups` DB table) |
| Sample Type | Yes | Physical / Digital Proof / Both (Radio buttons) |
| Est. Quantity | No | 5,000 |
| Unit | No | Kgs, Kpcs, SQM, LM |
| Description / Notes | No | "24x24 pack, matte finish" |
| **Attached Files** | No | TDS, Artwork, Email, Specification, Sample Photo |

**File attachments during registration:**
- The registration form includes a file upload section
- User selects file type (TDS, Artwork, Email, Specification, Sample Photo, Other) then attaches the file
- Multiple files can be added per sample before clicking "Add New Sample"
- Files are stored in `uploads/inquiry-attachments/` and linked to the sample via `sample_id`

**Result per sample:**
- Sample number generated: `SMP-FP-2026-XXXXX`
- Status: `registered`
- QR code generated (links to `/mes/qc/scan/{sample_number}`)
- QR modal auto-opens for immediate label printing

**The rep can register multiple samples** before proceeding. Each sample appears as a card showing:
- Sample number, product group, type, status, quantity
- Attached files (with type tags: TDS, Artwork, etc.)

**Delete sample:** Before submission, registered samples can be deleted (trash icon with confirmation). Deleting a sample also removes its attachments.

---

### STEP 3 — Submit All Samples to QC

**Who:** Sales Rep  
**Where:** Inquiry Detail page → big blue "Submit X Sample(s) to QC Lab" button  
**Prerequisite:** At least 1 sample must be registered

This is a **batch operation** — ALL registered samples are submitted at once.

**What happens on submission:**
1. All `registered` samples → status changes to `sent_to_qc`
2. Inquiry status: `new` → `in_progress` (if still new)
3. Inquiry presales_phase: `inquiry` → `sample_qc`
4. Email notification sent to QC Lab (`fbqclab@interplast-uae.com`) and QC Manager (`faiyaz@interplast-uae.com`)
5. Activity logged: "Submitted to QC"

**After submission:**
- The `+ Add New Sample` button **disappears** (samples are locked)
- User can **view** all submitted samples (read-only)
- Delete button disappears (samples cannot be deleted after submission)
- `Recall Samples` button appears (to pull back before QC starts processing)

---

### STEP 4 — Print SAR Form

**Who:** Sales Rep  
**Where:** Inquiry Detail page → each sample card → `Print SAR` button  
**When available:** Always available for physical or both-type samples (before and after submission)

The SAR (Sample Analysis Request) is a **printed A4 form** that includes:
- Company logo + name (loaded from company settings) + "Sample Analysis Request" title
- Inline QR code (scan to open QC receive page)
- Customer name, inquiry number, inquiry date, country, sales rep, priority
- Sample number (large, prominent)
- Product group, sample type
- Description / notes section
- "Printed by: [user name] on [date]" line
- Footer: sample number, inquiry number, ProPack Hub branding

**Not included in SAR print:** estimated quantity, signatures, attached files list, QC lab fields

**Physical workflow:**
1. Sales Rep prints SAR form for each physical sample
2. SAR form is attached to the physical sample
3. Physical sample + SAR form are sent to QC Lab together
4. QC Lab scans the QR code on the SAR → opens `/mes/qc/scan/{sample_number}` → clicks "Mark as Received"

---

### STEP 5 — Recall Samples (Optional)

**Who:** Sales Rep  
**Where:** Inquiry Detail page → `Recall Samples` button  
**When available:** Only when presales_phase is `sample_qc` AND no sample has advanced beyond `sent_to_qc` (QC hasn't started processing)

**Use case:** The rep needs to:
- Add more samples to the inquiry
- Modify existing samples
- Add/change attached files

**What happens on recall:**
1. All `sent_to_qc` samples → status reverts to `registered`
2. Inquiry presales_phase: `sample_qc` → `inquiry`
3. Inquiry status stays `in_progress` (work has already started)
4. `+ Add New Sample` button reappears
5. Activity logged: "Samples Recalled from QC"

**After recall, the rep can:**
- Register additional samples
- (Future: edit existing samples)
- Re-submit all samples to QC again

**Cannot recall if:** QC has already changed any sample's status to `received_by_qc`, `testing`, `tested`, `approved`, or `rejected`.

---

### STEP 6 — QC Receives Samples

**Who:** QC Lab Technician / QC Manager  
**Where:** QR scan → `/mes/qc/scan/{sample_number}` (QCScanPage component)

QC workflow per sample:

| Step | Status Change | Who |
|------|---------------|-----|
| Receive delivery | `sent_to_qc` → `received_by_qc` | QC Lab |
| Start testing | `received_by_qc` → `testing` | QC Lab |
| Complete tests | `testing` → `tested` | QC Lab |
| Submit result | Submit QC result (PASS/FAIL/CONDITIONAL + notes) | QC Lab |
| Final status | `tested` → `approved` or `rejected` | QC Lab/Manager |

**QC result submission** includes:
- Result: `pass` / `fail` / `conditional`
- QC Notes (observations, test data)

**Auto-advancement:**  
When **all samples** in the inquiry have a final status (`approved`, `rejected`, or `tested`), the inquiry presales_phase automatically advances to `clearance`.

> **Note:** Step 6 is the quick receive/test workflow. Steps 7-9 are the implemented full analysis + CSE approval workflow used for structured evaluation.

---

### STEP 7 — QC Analysis Form (✅ Implemented)

**Who:** QC Lab Technician  
**Where:** `/mes/qc/samples/:sampleId` (`QCSampleAnalysis`)  
**When available:** After sample is received (`received_by_qc` or `testing`)

This is the **full analysis form** that replaces the simple pass/fail on QCScanPage. QC fills in structured test data:

| Section | Fields | Notes |
|---------|--------|-------|
| **Test Category** | Dropdown: Physical Properties, Print Quality, Seal Integrity, Optical Properties, Chemical/Migration, Custom | Drives which standard parameters are pre-filled |
| **Test Parameters** | Dynamic rows: Parameter Name, Specification/Target, Test Result, Pass/Fail per row | QC can add/remove rows. Common params pre-filled by category. |
| **Visual Inspection** | Dropdown: Pass / Fail / N/A | Quick check |
| **Print Quality** | Dropdown: Pass / Fail / N/A | If sample has print |
| **Seal Strength** | Numeric input + unit + pass/fail | If applicable |
| **Observations** | TextArea | Free notes |
| **Test Evidence** | File upload (photos, charts) | Stored as attachments with type `qc_evidence` |
| **Overall Result** | Radio: PASS / FAIL / CONDITIONAL | Required before submit |
| **Recommendation** | TextArea | Recommendations for production feasibility |

**Actions:**

| Button | Effect |
|--------|--------|
| **Save Draft** | Saves analysis data to DB without changing sample status. QC can come back later. |
| **Submit Analysis & Generate CSE** | Validates form → saves → sample status → `tested` → CSE document auto-generated → approval workflow starts |

---

### STEP 8 — CSE Generation (✅ Implemented)

**Who:** System (automatic)  
**Trigger:** QC submits analysis form (Step 7)

On analysis submission:
1. CSE (Customer Sample Evaluation) report auto-generated: `CSE-FP-2026-XXXXX`
2. CSE contains a snapshot of: customer info, sample details, all test parameters & results, observations, recommendation, overall result
3. CSE status set to `pending_qc_manager`
4. In-app notification sent to QC Manager
5. Email notification sent to QC Manager
6. Activity logged: "CSE generated, pending QC Manager approval"

---

### STEP 9 — CSE Approval Workflow (✅ Implemented)

**Who:** QC Manager → Production Manager (sequential)  
**Where:** `/mes/qc/cse/:cseId` (CSEApprovalPage) and `/mes/approvals` (CSEApprovalQueue)

The CSE goes through a **two-level sequential approval**:

#### Level 1 — QC Manager Review

| Action | Effect |
|--------|--------|
| **Approve** | CSE status → `pending_production`. Notification sent to Production Manager. |
| **Reject** | CSE status → `rejected`. Notification sent to QC Lab analyst. Inquiry does not advance. |
| **Request Revision** | CSE status → `revision_requested`. Notification sent to QC Lab. Analyst revises and resubmits. |

#### Level 2 — Production Manager Review

| Action | Effect |
|--------|--------|
| **Approve** | CSE status → `approved`. Sample status → `approved`. Notification sent to Sales Rep. |
| **Reject** | CSE status → `rejected`. Notification sent to QC Lab. |
| **Request Revision** | CSE status → `revision_requested`. Notification sent to QC Lab. |

**CSE Approval Flow:**
```
pending_qc_manager ──► pending_production ──► approved
        │                      │                  │
        ├──► rejected          ├──► rejected      └──► 🔔 Sales Rep notified
        └──► revision_requested└──► revision_requested
                    │                      │
                    └── QC Lab revises ─────┘
```

**Auto-advancement:** When all samples in the inquiry have an approved CSE, the inquiry presales_phase automatically advances to `clearance`.

---

### STEP 10 — Pre-Sales Clearance

**Who:** Admin only (UI + API enforced)  
**Where:** Inquiry Detail page → Pre-Sales Clearance section  
**When visible:** presales_phase is `clearance` or `cleared`

The clearance panel shows:
- Summary: X/Y samples passed QC
- "Grant Pre-Sales Clearance" button (admin only)

**What happens on clearance:**
1. `presales_cleared` = TRUE
2. `clearance_by` and `clearance_at` recorded
3. Inquiry presales_phase → `cleared`
4. Inquiry status → `converted`
5. Activity logged: "Pre-Sales Cleared"

**After clearance:** The inquiry is ready to move to the **Quotation** phase (Phase 4) in the MES workflow.

**Revoke clearance:** Admin can revoke clearance, which sets phase back to `clearance` and status stays unchanged.

**✅ Security:** Backend route `PATCH /api/mes/presales/inquiries/:id/clearance` now enforces admin-only access.

---

## 4. Status Flow Diagram

```
┌─────────┐    Submit to QC    ┌─────────────┐    (auto)     ┌───────────┐    Clearance    ┌───────────┐
│   NEW   │ ─────────────────► │ IN_PROGRESS │ ────────────► │ QUALIFIED │ ─────────────► │ CONVERTED │
└─────────┘                    └─────────────┘                └───────────┘                └───────────┘
     │                              │    ▲                         │                            
     │  Put On Hold                 │    │ Resume                  │                            
     ▼                              ▼    │                         │                            
┌─────────┐                    ┌─────────┐                         │                            
│ ON_HOLD │ ◄──────────────    │ ON_HOLD │                         │                            
└─────────┘                    └─────────┘                         │                            
     │                              │                              │                            
     │         Mark Lost            │         Mark Lost            │    Mark Lost               
     ▼                              ▼                              ▼                            
┌────────────────────────────────────────────────────────────────────┐                          
│                              LOST                                  │                          
└────────────────────────────────────────────────────────────────────┘                          
```

> **⚠ Note:** `ON_HOLD` and `LOST` are currently backend-supported inquiry statuses; corresponding action buttons are not currently present in the InquiryDetail UI.

## 5. Presales Phase Flow

```
inquiry ──► sample_qc ──► qc_analysis ──► cse_approval ──► clearance ──► cleared
   ▲              │           (planned)      (planned)
   └──── recall ──┘   (only if QC hasn't started processing)
```

> **Currently built:** inquiry → sample_qc → clearance → cleared (analysis/CSE steps will be inserted between sample_qc and clearance)

---

## 6. Sample Status Flow

```
                                                   ┌──► approved ──► (CSE generated)
registered ──► sent_to_qc ──► received_by_qc ──► testing ──► tested ─┤
                   │                                                   └──► rejected
                   │
              ◄── recall (back to registered)
```

**Planned CSE status flow per sample (after `tested`):**
```
tested ──► CSE pending_qc_manager ──► CSE pending_production ──► CSE approved ──► sample approved
                    │                          │
                    ├──► CSE rejected           ├──► CSE rejected
                    └──► revision_requested     └──► revision_requested
```

---

## 7. Email & In-App Notifications

### Current (built)

| Trigger | Recipients | Channel | Content |
|---------|------------|---------|---------|
| Submit to QC (batch) | QC Lab + QC Manager | Email | Inquiry details, all sample numbers, attached files |
| Individual sample to QC | QC Lab + QC Manager | Email | Same (legacy, kept for backward compat) |

### Planned (🔲)

| Trigger | Recipients | Channel | Content |
|---------|------------|---------|---------|
| SAR submitted to QC | All `quality_control` users | In-app 🔔 + Email | Inquiry + sample list, link to QC inbox |
| QC submits analysis → CSE generated | QC Manager | In-app 🔔 + Email | CSE number, sample summary, link to approval page |
| QC Manager approves CSE | Production Manager | In-app 🔔 + Email | CSE number, link to approval page |
| Production Manager approves CSE | Sales Rep (inquiry creator) | In-app 🔔 + Email | CSE approved, link to view CSE & proceed |
| CSE rejected | QC Lab analyst | In-app 🔔 + Email | Rejection reason, link to sample analysis |
| CSE revision requested | QC Lab analyst | In-app 🔔 + Email | Revision notes, link to revise analysis |

> **In-app notifications (planned):** Bell icon in header with unread badge, dropdown panel with recent notifications, polling every 30s. See [QC_SAMPLE_EVALUATION_PLAN.md § 7](QC_SAMPLE_EVALUATION_PLAN.md) for full spec.

**Dev mode:** When `SMTP_DEV_MODE=true`, emails use Ethereal (fake SMTP) and log preview URLs.

---

## 8. API Routes Summary

### Inquiry Management
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/mes/presales/inquiries` | Create inquiry |
| GET | `/api/mes/presales/inquiries/:id` | Get inquiry with samples, attachments, prospect |
| PATCH | `/api/mes/presales/inquiries/:id/status` | Change inquiry status |
| PATCH | `/api/mes/presales/inquiries/:id/presales-phase` | Manual phase change |
| PATCH | `/api/mes/presales/inquiries/:id/clearance` | Grant/revoke clearance |

### Sample Management
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/mes/presales/inquiries/:id/samples` | Register a sample |
| GET | `/api/mes/presales/inquiries/:id/samples` | List samples |
| DELETE | `/api/mes/presales/samples/:id` | Delete sample (only if status=registered) |
| PATCH | `/api/mes/presales/samples/:id/status` | Change sample status |
| PATCH | `/api/mes/presales/samples/:id/qc-result` | Submit QC result |
| GET | `/api/mes/presales/samples/by-number/:num` | Look up by sample number (QR scan) |

### Batch Operations
| Method | Route | Purpose |
|--------|-------|---------|
| **POST** | `/api/mes/presales/inquiries/:id/submit-to-qc` | **Batch submit all registered samples** |
| **POST** | `/api/mes/presales/inquiries/:id/recall` | **Recall samples back from QC** |

### Attachments
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/mes/presales/inquiries/:id/attachments` | Upload file (with optional `sample_id`) |
| GET | `/api/mes/presales/inquiries/:id/attachments` | List attachments |
| DELETE | `/api/mes/presales/inquiries/:id/attachments/:attId` | Delete attachment |

### Prospect Management  
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/mes/presales/inquiries/:id/prospect` | Register prospect |
| PATCH | `/api/mes/presales/prospects/:id` | Update prospect |
| PATCH | `/api/mes/presales/prospects/:id/approve` | Approve prospect |
| PATCH | `/api/mes/presales/prospects/:id/reject` | Reject prospect |

### QC Inbox & Analysis (✅ Implemented)
| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| GET | `/api/mes/presales/qc/inbox` | List samples for QC (filterable by status) | `quality_control`, `admin`, `manager` |
| GET | `/api/mes/presales/qc/stats` | QC dashboard stats (counts by status) | `quality_control`, `admin`, `manager` |
| POST | `/api/mes/presales/qc/batch-receive` | Mark multiple samples as received | `quality_control`, `admin`, `manager` |
| GET | `/api/mes/presales/qc/analyses/:sampleId` | Get analysis for a sample | `quality_control`, `admin` |
| POST | `/api/mes/presales/qc/analyses` | Create/save analysis draft | `quality_control` |
| PATCH | `/api/mes/presales/qc/analyses/:id` | Update analysis draft | `quality_control` |
| POST | `/api/mes/presales/qc/analyses/:id/submit` | Submit analysis → generate CSE | `quality_control` |

### CSE Approval (✅ Implemented)
| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| GET | `/api/mes/presales/cse` | List CSE reports (filterable) | Any authenticated |
| GET | `/api/mes/presales/cse/:id` | Get single CSE with full details | Any authenticated |
| POST | `/api/mes/presales/cse/:id/approve` | Approve CSE (QC Mgr or Prod Mgr) | `quality_control`, `production_manager`, `admin` |
| POST | `/api/mes/presales/cse/:id/reject` | Reject CSE | `quality_control`, `production_manager`, `admin` |
| POST | `/api/mes/presales/cse/:id/request-revision` | Send back to QC Lab | `quality_control`, `production_manager`, `admin` |
| GET | `/api/mes/presales/cse/:id/pdf` | Generate CSE PDF | Any authenticated |

### Notifications (✅ Implemented)
| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| GET | `/api/notifications` | Get current user's notifications (paginated) | Any authenticated |
| GET | `/api/notifications/unread-count` | Unread badge count | Any authenticated |
| PATCH | `/api/notifications/:id/read` | Mark one as read | Any authenticated |
| POST | `/api/notifications/mark-all-read` | Mark all as read | Any authenticated |

---

## 9. Database Tables

### Current (built)

| Table | Purpose |
|-------|---------|
| `mes_presales_inquiries` | Main inquiry record (status, phase, clearance, etc.) |
| `mes_presales_samples` | Samples linked to inquiries |
| `inquiry_attachments` | Files (TDS, artwork, etc.) linked to inquiry and optionally to a specific sample |
| `fp_prospects` | New company prospect records |
| `mes_presales_activity_log` | Audit trail of all actions |
| `mes_quotations` | Quotation records per inquiry (version control, status, customer response) |
| `mes_preprod_samples` | Pre-production sample tracking per inquiry/quotation |
| `mes_proforma_invoices` | Proforma Invoice records linked to quotations |

### Implemented (2026-02-25)

| Table | Purpose |
|-------|---------|
| `mes_qc_analyses` | Full analysis data per sample: test category, dynamic test parameters (JSONB), visual/print/seal checks, observations, overall result, recommendation, draft/submitted status |
| `mes_cse_reports` | CSE documents: CSE number, snapshot of test results, approval chain (QC Manager status/notes, Production Manager status/notes), final status |
| `mes_notifications` | In-app notification system: user_id, type, title, message, link, reference_type/id, is_read, created_at |

### Added columns (2026-03-01 Bug Fix Sprint 5.1)

| Column | Table | Purpose |
|--------|-------|--------|
| `inquiry_stage` | `mes_presales_inquiries` | 21-value stage tracking (replaces generic status for pipeline) |
| `inquiry_type` | `mes_presales_inquiries` | `sar` or `general` — SAR is optional for general inquiries |
| `contact_name` | `mes_presales_inquiries` | Direct contact person at customer |
| `estimated_value` | `mes_presales_inquiries` | Deal value for pipeline analytics |
| `stage_changed_at` | `mes_presales_inquiries` | Timestamp of last stage change — used for accurate days-in-stage (not updated_at) |
| `deleted_at` | `mes_presales_inquiries` | Soft-delete timestamp (NULL = active) |
| `deleted_by` | `mes_presales_inquiries` | User ID who deleted |
| `deleted_by_name` | `mes_presales_inquiries` | Display name of deleter |

> **Full schema definitions:** See [QC_SAMPLE_EVALUATION_PLAN.md § 5](QC_SAMPLE_EVALUATION_PLAN.md) for complete CREATE TABLE statements with all columns.

---

## 10. Key UI Components

### Current (built)

| Component | File | Purpose |
|-----------|------|---------|
| InquiryBoard | `src/components/MES/PreSales/InquiryBoard.jsx` | Kanban board view of all inquiries |
| InquiryCapture | `src/components/MES/PreSales/InquiryCapture.jsx` | 3-step wizard to create new inquiry |
| InquiryDetail | `src/components/MES/PreSales/InquiryDetail.jsx` | Full detail view with samples, attachments, SAR print, clearance |
| QCScanPage | `src/components/MES/PreSales/QCScanPage.jsx` | QR code landing page for QC to receive/test samples |
| QCDashboard | `src/components/MES/QC/QCDashboard.jsx` | QC inbox landing page (`/mes/qc`) with stats, pending receipt queue, in-progress, and recently completed samples |
| NewCustomerModal | `src/components/MES/PreSales/NewCustomerModal.jsx` | Modal for registering new customer details |
| WorkflowLandingPage | `src/components/MES/WorkflowLandingPage.jsx` | MES workflow overview (15 phases) |

### Implemented (2026-02-25)

| Component | File | Purpose |
|-----------|------|---------|
| QCDashboard | `src/components/MES/QC/QCDashboard.jsx` | QC landing page with inbox, stats, in-progress, completed sections |
| QCSampleAnalysis | `src/components/MES/QC/QCSampleAnalysis.jsx` | Full analysis form for a single sample (test parameters, evidence, result) |
| CSEApprovalPage | `src/components/MES/QC/CSEApprovalPage.jsx` | View + approve/reject a CSE report |
| CSEApprovalQueue | `src/components/MES/QC/CSEApprovalQueue.jsx` | Table of pending CSE approvals for current approver |
| CSEDocument | `src/components/MES/QC/CSEDocument.jsx` | Printable CSE document (like SAR but with test results & approvals) |
| MESNotificationBell | `src/components/common/MESNotificationBell.jsx` | MES workflow notification bell using `/api/notifications` endpoints |

### Implemented backend files

| File | Purpose |
|------|---------|
| `server/routes/notifications.js` | Notification CRUD API endpoints |
| `server/services/notificationService.js` | In-app notification creation + querying |
| `server/migrations/mes-qc-001-analysis-cse.js` | Migration: `mes_qc_analyses`, `mes_cse_reports` tables |
| `server/migrations/mes-qc-002-notifications.js` | Migration: `mes_notifications` table |

### Implemented file modifications

| File | Change |
|------|--------|
| `src/components/modules/ModuleSelector.jsx` | Role-based module visibility (hide CRM for non-sales) |
| `src/App.jsx` | CRM route requires sales role; add role redirects |
| `src/components/MES/index.jsx` | Add QC routes: `/qc`, `/qc/samples/:id`, `/qc/cse/:id`, `/approvals` |
| `server/config/express.js` | Register notification routes |
| `server/routes/mes/presales.js` | Trigger in-app notifications on SAR submission |

### Implemented (Sprint 5 CRM Phase 1 + Sprint 5.1 Bug Fixes — 2026-03-01)

| Component / File | Purpose |
|------------------|--------|
| `MyPipeline.jsx` | Sales rep pipeline dashboard — 21-stage pipeline view with summary cards, days-in-stage |
| `QuotationPanel.jsx` | Quotation CRUD panel per inquiry |
| `PreprodSamplePanel.jsx` | Pre-production sample tracking panel |
| `ProformaPanel.jsx` | Proforma Invoice panel |
| `server/routes/mes/presales/pipeline.js` | Pipeline API: stages, stats, manual transitions (16 entries) |
| `server/routes/mes/presales/quotations.js` | Quotation CRUD + stage advancement |
| `server/routes/mes/presales/preprod.js` | Pre-prod sample CRUD + stage advancement |
| `server/routes/mes/presales/proforma.js` | Proforma Invoice CRUD + stage advancement |
| `server/routes/mes/presales/activities.js` | Activity log with pagination (BUG-D fix) |
| `server/routes/mes/presales/inquiries.js` | Soft-delete (BUG-B), stage inside txn (BUG-A), lost guard (ISS-18) |

---

## 11. Business Rules

### Current (built)

1. **Samples are locked after submission** — No new samples can be added, and no samples can be deleted, once "Submit to QC" is clicked
2. **Recall is only possible before QC starts** — If any sample has moved past `sent_to_qc`, recall is blocked
3. **Clearance requires admin (UI)** — Only `admin` role can grant/revoke pre-sales clearance from InquiryDetail
4. **Auto-phase advancement** — QC completion of all samples automatically moves phase to `clearance`
5. **Clearance auto-converts** — Granting clearance sets inquiry status to `converted`
6. **SAR printing is always available** — Print SAR button shows for physical/both-type samples at any stage (before and after submission)
7. **Files are attached per-sample during registration** — TDS, artwork, email correspondence, specifications, photos (no separate "General Attachments" section)
8. **QR codes link to QC scan page** — Each sample has a unique QR code; QC scans it to open the receive/test page
9. **Delete sample only before submission** — Registered samples can be deleted (with attachments); once submitted, deletion is blocked

### Implemented (2026-02-25)

10. **CSE requires full analysis** — A CSE can only be generated when the analysis form is fully submitted (not draft)
11. **Sequential approval** — Production Manager cannot approve/reject until QC Manager has approved
12. **Revision resets to QC Lab** — Requesting revision sends CSE back to the QC analyst for editing and resubmission
13. **CSE approval advances sample** — Only after both QC Manager and Production Manager approve does the sample reach `approved` status
14. **Access control (implemented)** — CRM module is restricted to Sales roles; QC/Production/Finance roles are redirected to MES
15. **Auto-redirect on login (implemented)** — Users are redirected by role (Sales → CRM, MES roles → MES, Admin/Manager → module selector)
16. **Notification on every transition** — Every workflow state change triggers both in-app notification and email
17. **CSE is immutable after approval** — Once both managers approve, the CSE document cannot be edited

18. **Clearance API is admin-enforced** — Backend route validates role (not frontend-only)

### Implemented (Sprint 5.1 Bug Fix — 2026-03-01)

19. **Soft-delete (BUG-B)** — Inquiries are never hard-deleted. DELETE sets `deleted_at`, `deleted_by`, `deleted_by_name`. All queries filter `deleted_at IS NULL`.
20. **Stage inside transaction (BUG-A)** — `inquiry_stage` SET is inside the DB transaction (before COMMIT), not fire-and-forget after.
21. **stage_changed_at tracking (BUG-E)** — All 22 stage-change points across 8 backend files set `stage_changed_at = NOW()`. Days-in-stage uses `COALESCE(stage_changed_at, updated_at)` for accuracy.
22. **Lost from any active stage (BUG-F)** — All 15 active stages can transition to `lost` and `on_hold`. On_hold can resume to 5 targets.
23. **Lost guard (ISS-18)** — Cannot mark inquiry as `lost` if active quotations exist (status != rejected/expired). Returns 400 with specific error message.
24. **Paginated activities (BUG-D)** — `GET /inquiries/:id/activities` accepts `?page=1&limit=50` to avoid loading thousands of records.
25. **21 pipeline stages** — Including `new_inquiry` (#0) and `qc_received` (#2.5) for general inquiries and QC batch-receive.

---

## 12. Implementation Phases

| Phase | Scope | Estimate |
|-------|-------|----------|
| **A** | Access control: fix ModuleSelector, CRM route guard, login redirect, clearance API auth | ✅ Completed (2026-02-25) |
| **B** | QC Dashboard + Inbox: migration, inbox API, QCDashboard component | ✅ Core delivered (2026-02-25), integration polish ongoing |
| **C** | Analysis Form: analysis CRUD endpoints, QCSampleAnalysis component | ✅ Completed (2026-02-25) |
| **D** | CSE + Approval: CSE generation, approval endpoints, approval UI | ✅ Completed (2026-02-25) |
| **E** | Notification System: notifications table, service, API, bell component | ✅ Completed (2026-02-25) |
| **F** | Polish: CSE PDF, activity logs, Sales Rep CSE view, end-to-end testing | 🔲 Planned |
| **G** | CRM Phase 1: SAR optional, contact/deal-value fields, activity logging, pipeline, quotations, pre-prod samples, proforma invoices, new_inquiry stage | ✅ Completed (Sprint 5, 2026-03-09–03-12) |
| **H** | Bug Fix Sprint: soft-delete, stage_changed_at, stage inside txn, lost from any stage, lost guard, paginated activities | ✅ Completed (Sprint 5.1, 2026-03-01) |

**Total estimate: ~5-7 days** (Phases A-E). Phases G+H added ~4 days.

> **Full implementation details:** See [QC_SAMPLE_EVALUATION_PLAN.md](QC_SAMPLE_EVALUATION_PLAN.md) for complete specs including database schemas, component layouts, API contracts, and CSE document layout.
