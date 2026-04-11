# CRM-MES Sales Pipeline Integration — Final Implementation Plan

> **Date:** 2026-03-04  
> **Source:** Consolidated from Master Plan v3, Spec Requirements, PreSales Lifecycle Plan, CRM Enhancement Plan  
> **Scope:** Complete the end-to-end sales pipeline from Opportunity → Delivery → Close  
> **Principle:** Small tasks, small files, test everything, no data loss, phased deployment

---

## Current State Summary

### What's BUILT and WORKING

| Module | What Exists | Status |
|--------|-------------|--------|
| **CRM Core** | Customers, Contacts, Prospects, Deals (5 stages), Tasks, Activities, Notes, Technical Briefs, Packaging Profile | ✅ 11 phases complete |
| **CRM v2 Overhaul** | SalesCockpit, MyDayDashboard, Route split, Activity canonicalisation, Health badges, Budget pace | ✅ Phase 0-2 done, Phase 3 partial |
| **MES PreSales** | 21-stage inquiry lifecycle, SAR→QC→CSE→Clearance→Quotation→PreProd→Proforma | ✅ Sprints 1-5.1 done |
| **MES PreSales Pipeline** | MyPipeline dashboard, stage badges, manual transitions, soft-delete, stage_changed_at | ✅ Built |
| **CRM↔MES Link** | Activity auto-logging (inquiry/quotation/proforma), CustomerInquiries in CRM, Deal-Inquiry FK | ✅ Phase 7 done |
| **Analytics** | Leaderboard, Deal funnel, Cycle time, Revenue forecast, Engagement scores | ✅ Phase 9 done |
| **Notifications** | SSE in-app, Email (daily digest, task assignment, deal closed, prospect status) | ✅ Phase 8 done |

### What's NOT BUILT (Gaps)

| ID | Gap | Priority | Source |
|----|-----|----------|--------|
| G-01 | Quotation submit/reject/revise + `mes_quotation_approvals` audit table | CRITICAL | Req §1, Master Plan |
| G-02 | Quotation PDF DRAFT watermark + approver name | HIGH | Req §2, Master Plan |
| G-03 | Negotiation versioning: `parent_quotation_id`, `version_number`, negotiation round | HIGH | Req §3, Master Plan |
| G-04 | Customer PO capture: `mes_customer_purchase_orders` table + ±5% validation | CRITICAL | Req §4, Master Plan |
| G-05 | Job Card creation: `mes_job_cards` table + BOM + routes + UI | CRITICAL | Req §5, Master Plan |
| G-06 | Material procurement: PR → Manager approve → Supplier PO → Receipt | CRITICAL | Req §6, Master Plan |
| G-07 | CRM Deal ↔ Inquiry bidirectional auto-sync (stage mapping) | CRITICAL | Req §7 |
| G-08 | Full Pipeline Dashboard (funnel, cycle times, stalled items, revenue forecast) | HIGH | Req §8, Master Plan |
| G-09 | Dispatch fields: `transporter_name`, `awb_number` on deliver endpoint | HIGH | Req §9, Master Plan |
| G-10 | Customer delivery feedback: `mes_delivery_feedback` table | MEDIUM | Req §9, Master Plan |
| G-11 | SLA breach scheduled job + OVERDUE badge in QC | HIGH | Master Plan |
| G-12 | CustomerInquiries.jsx: live stage + New Inquiry CTA | MEDIUM | Master Plan |
| G-13 | Lead Assignment: Assign-to-Rep button (management only) | HIGH | Master Plan |
| G-14 | Task Allocation: Assign-to field in task form (management only) | HIGH | Master Plan |
| G-15 | MES production flow linked to Job Card (inquiry_stage auto-updates) | HIGH | Req §5, Master Plan |
| G-16 | QC product group → estimation pre-population flow | CRITICAL | Req §12, New |
| G-17 | Full Flexible Packaging Estimation Calculator (material layers, operations, multi-unit pricing, actuals comparison) | CRITICAL | Req §13, FLEXIBLE_PACKAGING_ESTIMATION_CALCULATOR.md |
| G-18 | Material master data API for estimation dropdowns | HIGH | Req §13, New |
| G-19 | Estimation product group defaults table (default layers + processes per product group) | HIGH | Req §12, New |

### Known Bugs to Fix First

| ID | Bug | File | Fix |
|----|-----|------|-----|
| BUG-01 | CSE notification status string wrong (`pending_qc` → `pending_qc_manager`) | `cse.js` line 189 | Change one string |
| BUG-02 | QCScanPage has result submission that bypasses QC workflow | `QCScanPage.jsx` | Remove submit block, add "Open Analysis Form" link |
| BUG-03 | Template product_group filter not applied in SQL | `templates.js` | Add WHERE clause with product_group param |
| BUG-04 | QC inbox shows all divisions (no FP filter) | `qc.js` GET /qc/inbox | Add division filter |
| BUG-05 | Double notification on sample status change | `samples.js` PATCH /:id/status | Remove duplicate notifyQCSamplesReceived |
| ISS-01 | Sales rep not notified when QC analysis complete | `qc.js` POST /analyses/:id/submit | Add notifyUsers after CSE creation |
| ISS-02 | Clearance role check blocks sales_manager with level 6+ | `inquiries.js` PATCH /clearance | Replace with isManagement() |

---

## Role-Based Access Control Matrix

| Tier | Roles | Level | Sees | Can Do |
|------|-------|-------|------|--------|
| MANAGEMENT (Tier 1) | admin, manager, sales_manager, sales_coordinator | ≥ 6 | All teams, all customers, all inquiries, all tasks, all QC, all jobs | Approve quotations, create job cards, full pipeline dashboard, assign leads/tasks, cross-team reports |
| SALES REP (Tier 2) | sales_rep, sales_executive | < 6 | Own customers, own inquiries, own tasks, own pipeline | Create inquiries, log activities, submit quotations for approval, capture PO, record dispatch |
| QC MANAGER (Tier 1) | qc_manager + level ≥ 6 | ≥ 6 | All QC samples, all CSEs | Approve/reject CSE, assign QC tasks |
| QC ANALYST (Tier 2) | quality_control, qc_lab | < 6 | Assigned samples, own analyses | Perform analysis, submit results |
| PRODUCTION MGR (Tier 1) | production_manager + level ≥ 6 | ≥ 6 | All job cards, all production jobs | Create/approve job cards, advance MES phases |
| PROCUREMENT (Tier 2) | stores_keeper, procurement | any | Own department PRs and POs | Raise PR, create supplier PO, confirm receipt |

### Access Control Functions

| Function | Logic | Used In |
|----------|-------|---------|
| `isManagement(user)` | FULL_ACCESS_ROLES.includes(role) && level >= 6 | All routes — data scoping |
| `isAdminOrMgmt(user)` | ['admin','manager','sales_manager'].includes(role) | Approval gates |
| `canApproveQuotation(user)` | isAdminOrMgmt(user) | quotations.js approve/reject |
| `canCreateJobCard(user)` | ['admin','manager','production_manager','sales_manager'].includes(role) | jobCards.js |
| `canApproveMaterial(user)` | ['admin','procurement','stores_keeper'].includes(role) | materialOrders.js |
| `buildRepScopeWhere(user, p)` | isManagement → no filter; else → sales_rep_group_id=$p | All list queries |

---

## Implementation Phases


### Phase 0 — Critical Bug Fixes (Days 1-2)

**Goal:** Fix all 7 bugs + 2 issues. No new features until done. One PR per fix.

| Task | File(s) | Accept Criterion | Closes |
|------|---------|-------------------|--------|
| P0-01: Fix CSE notification status string | `server/routes/mes/presales/cse.js` | Production Manager receives SSE after QC Manager approves CSE | BUG-01 |
| P0-02: Remove result submission from QCScanPage | `src/components/MES/PreSales/QCScanPage.jsx` | QR scan page shows only "Open Analysis Form" link | BUG-02 |
| P0-03: Fix template product_group filter | `server/routes/mes/presales/templates.js` | Correct template loads for BOPP, PET, PA/PE separately | BUG-03 |
| P0-04: Add division filter to QC inbox | `server/routes/mes/presales/qc.js` | FP QC inbox shows only FP samples | BUG-04 |
| P0-05: Remove double notification on sample patch | `server/routes/mes/presales/samples.js` | Single email on batch submit, none on individual patch | BUG-05 |
| P0-06: Notify sales rep on QC analysis complete | `server/routes/mes/presales/qc.js` | Sales rep receives SSE after analysis submitted | ISS-01 |
| P0-07: Fix clearance role check | `server/routes/mes/presales/inquiries.js` | sales_manager with level 6 can grant clearance | ISS-02 |

**Verification checklist after Phase 0:**
- Login as sales rep with group_id ≠ 1 → confirm only own customers visible
- Submit samples as rep → QC Manager approves CSE → Production Manager receives SSE
- QR scan sample URL → confirm NO submit result button, only "Open Analysis Form" link
- Server logs show no ReferenceError
- FP QC inbox shows only FP division samples
- Individual sample PATCH generates one email, not two
- sales_manager with designation_level=6 can grant clearance


---

### Phase 1 — Quotation Approval Workflow + QC Notifications (Week 1)

**Goal:** Enforce quotation approval before sending to customer. Add SLA breach detection. Upgrade CustomerInquiries.  
**Closes:** G-01, G-02, G-03, G-11, G-12, G-13  
**Req Coverage:** Requirements 1, 2, 3, 10 (partial), 11 (partial)

#### P1-1: Quotation Approval Backend

| Task | Details | File |
|------|---------|------|
| P1-1a | Migration: add `parent_quotation_id`, `version_number` to `mes_quotations`. Create `mes_quotation_approvals` table (action, actor_id, actor_name, timestamp, notes) | `server/migrations/mes-presales-012-quotation-workflow.js` |
| P1-1b | `POST /quotations/:id/submit` — set status → `pending_approval`, insert approval record, notify all Sales Managers | `server/routes/mes/presales/quotation-approval.js` (NEW, ~120 lines) |
| P1-1c | `POST /quotations/:id/approve` — set status → `approved`, record approver, notify submitting rep | `quotation-approval.js` |
| P1-1d | `POST /quotations/:id/reject` — set status → `rejected`, store reason, notify rep | `quotation-approval.js` |
| P1-1e | `POST /quotations/:id/request-revision` — set status → `draft`, store revision notes, notify rep | `quotation-approval.js` |
| P1-1f | `GET /quotations/:id/approval-history` — return full approval trail | `quotation-approval.js` |
| P1-1g | Enforce: block "Send to Customer" unless status = `approved` | `server/routes/mes/presales/quotations.js` (edit send endpoint) |
| P1-1h | `POST /quotations/:id/create-revision` — create new quotation with `parent_quotation_id`, increment `version_number`, set status `draft` | `quotation-approval.js` |


#### P1-2: Quotation PDF Enhancement

| Task | Details | File |
|------|---------|------|
| P1-2a | Add diagonal "DRAFT — NOT FOR CUSTOMER" watermark when quotation status ≠ `approved` | `server/services/presalesPdfService.js` |
| P1-2b | Add approver name + approval date on PDF when quotation is approved | `presalesPdfService.js` |
| P1-2c | Format all monetary values with currency symbol + 2 decimal places | `presalesPdfService.js` |

#### P1-3: Negotiation Versioning UI

| Task | Details | File |
|------|---------|------|
| P1-3a | `NegotiationTimeline.jsx` — vertical timeline showing all quotation versions, counter-offers, manager decisions | NEW component |
| P1-3b | Add negotiation timeline tab to InquiryDetail when inquiry has multiple quotation versions | `InquiryDetail/index.jsx` |
| P1-3c | Show margin impact calculation: (counter_offer - cost) / counter_offer × 100 | `NegotiationTimeline.jsx` |

#### P1-4: SLA Breach Detection

| Task | Details | File |
|------|---------|------|
| P1-4a | Migration: add `sent_to_qc_at` column to `mes_presales_inquiries` + index | `server/migrations/mes-presales-017-sla-tracking.js` |
| P1-4b | `server/jobs/slaBreachChecker.js` — runs every 30 min, finds samples where `sent_to_qc_at` + SLA hours < NOW() and no analysis submitted | NEW file |
| P1-4c | Add OVERDUE badge to QCDashboard for breached samples | `QCDashboard.jsx` |
| P1-4d | Wire slaBreachChecker into cron schedule in `server/index.js` | `server/index.js` |


#### P1-5: CustomerInquiries Upgrade + Lead Assignment

| Task | Details | File |
|------|---------|------|
| P1-5a | CustomerInquiries.jsx: show live `inquiry_stage` badge, phase stepper, days-in-stage, "New Inquiry" CTA | `src/components/CRM/CustomerInquiries.jsx` |
| P1-5b | Add "Assign to Rep" button on ProspectManagement (management only) | `src/components/CRM/ProspectManagement.jsx` |
| P1-5c | Add "Assign to Rep" button on CustomerList (management only) | `src/components/CRM/CustomerList.jsx` |
| P1-5d | Backend: `PATCH /api/crm/prospects/:id/assign` and `PATCH /api/crm/customers/:id/assign` | `server/routes/crm/prospects.js`, `server/routes/crm/customers.js` |
| P1-5e | SSE notification to assigned rep on lead assignment | Notification service |

**Verification checklist after Phase 1:**
- Sales rep submits quotation → manager receives in-app notification with quotation details
- Manager rejects quotation with reason → rep receives notification + rejection_reason visible
- Manager requests revision → quotation back to draft, revision_notes visible in approval history
- Draft quotation PDF shows diagonal DRAFT watermark
- Approved quotation PDF shows approver name
- QC sample with SLA breach shows red OVERDUE badge in QCDashboard
- Management assigns lead via "Assign to Rep" → assigned rep receives SSE notification

---

### Phase 2 — Deal Sync + Customer PO + Dispatch (Week 2)

**Goal:** Bidirectional CRM-MES sync, formal PO capture, dispatch tracking, delivery feedback.  
**Closes:** G-04, G-07, G-09, G-10, G-14  
**Req Coverage:** Requirements 4, 7, 9, 10 (partial), 11 (partial)


#### P2-1: CRM Deal ↔ MES Inquiry Bidirectional Sync

| Task | Details | File |
|------|---------|------|
| P2-1a | `server/services/dealSyncService.js` — `syncDealFromInquiry(inquiryId, newStage, client)` function | NEW file (~80 lines) |
| P2-1b | Stage mapping: `estimation/quoted` → deal `negotiation`; `order_confirmed` → deal `won` (close reason: "PO confirmed via [number]"); `lost` → deal `lost` (with inquiry loss reason) | Inside dealSyncService |
| P2-1c | Migration: add `note` + `source` columns to `crm_deal_stage_history` | `server/migrations/crm-015-deal-sync.js` |
| P2-1d | Call `syncDealFromInquiry()` in `pipeline.js` on every stage advance | `server/routes/mes/presales/pipeline.js` |
| P2-1e | `GET /api/crm/deals/:id/unified-timeline` — merge `crm_activities` + `mes_presales_activity_log` for linked inquiry, sorted by timestamp DESC | `server/routes/crm/deals.js` |
| P2-1f | "Link to Existing Inquiry" action on Deal detail — associates deal with unlinked inquiry for same customer | `server/routes/crm/deals.js` |
| P2-1g | Show inquiry_stage badge on DealCard when deal has linked inquiry | `src/components/CRM/DealCard.jsx` |

#### P2-2: Customer PO Capture

| Task | Details | File |
|------|---------|------|
| P2-2a | Migration: create `mes_customer_purchase_orders` table (po_number, po_date, inquiry_id, quotation_id, po_value, delivery_address, requested_delivery_date, po_document_path, status) | `server/migrations/mes-presales-013-customer-po.js` |
| P2-2b | `POST /customer-po` — capture PO, validate ±5% against quotation total (warn, don't block), advance inquiry to `order_confirmed` | `server/routes/mes/presales/customerPO.js` (NEW) |
| P2-2c | `GET /customer-po?inquiry_id=N` — list POs for inquiry | `customerPO.js` |
| P2-2d | PO document upload as inquiry attachment with type `purchase_order` | `customerPO.js` |
| P2-2e | Notify Sales Manager + Production Manager + Procurement on PO capture | Notification service |
| P2-2f | `CustomerPOPanel.jsx` — PO capture form + status display on InquiryDetail | NEW component |


#### P2-3: Dispatch Fields + Delivery Feedback

| Task | Details | File |
|------|---------|------|
| P2-3a | Migration: add `transporter_name`, `awb_number`, `dispatch_date`, `expected_delivery_date` to inquiries or orders table. Create `mes_delivery_feedback` table (inquiry_id, satisfaction_rating 1-5, feedback_text, reorder_likelihood) | `server/migrations/mes-presales-014-dispatch-feedback.js` |
| P2-3b | "Mark Dispatched" action on `ready_dispatch` inquiries — captures transporter, AWB, expected delivery date → advances to `delivered` | `server/routes/mes/presales/proforma.js` (edit deliver endpoint) |
| P2-3c | Email customer contact with tracking details on dispatch | Notification service |
| P2-3d | "Capture Feedback" action on `delivered` inquiries — star rating + text + reorder likelihood | `proforma.js` (new endpoint) |
| P2-3e | `DeliveryFeedbackPanel.jsx` — feedback form on InquiryDetail | NEW component |
| P2-3f | "Close Inquiry" action → advance to `closed`, set status `converted`, sync deal to `won` if not already | `proforma.js` |

#### P2-4: Task Allocation Enhancement

| Task | Details | File |
|------|---------|------|
| P2-4a | Add `assigned_to` field to task creation (management only) | `server/routes/crm/tasks.js` |
| P2-4b | Scope task list: reps see own + assigned-to-them; management sees all | `tasks.js` |
| P2-4c | Show "Assigned by [name]" badge on TaskWidget | `src/components/CRM/TaskWidget.jsx` |
| P2-4d | Add "Assign To" rep selector in TaskCreateModal (management only) | `src/components/CRM/TaskCreateModal.jsx` |

**Verification checklist after Phase 2:**
- Inquiry advances to `quoted` → linked crm_deal.stage updates to `negotiation`
- Inquiry advances to `order_confirmed` → linked deal.stage = `won`, close reason = "PO confirmed via [number]"
- Capture PO with value 12% higher than quotation total → yellow warning banner shown (not blocked)
- Capture PO with correct value → inquiry_stage → `order_confirmed`
- Mark dispatch with transporter + AWB → customer contact receives tracking email
- Management task assigned to rep → rep sees it in TaskWidget with "Assigned by [name]" badge


---

### Phase 3 — Job Card + Estimation Calculator + Quotation PDF (Weeks 3-4)

**Goal:** Job Card full CRUD with BOM, full flexible packaging estimation calculator with product group defaults, quotation PDF generation.  
**Closes:** G-05, G-16, G-17, G-18, G-19  
**Req Coverage:** Requirements 2 (complete), 5, 12, 13

#### P3-1: Job Card Backend

| Task | Details | File |
|------|---------|------|
| P3-1a | Migration: create `mes_job_cards` table (job_number auto JC-FP-{YEAR}-{NNNNN}, inquiry_id FK, customer_name, product_specs JSONB, quantity, required_delivery_date, material_requirements JSONB as BOM, material_status, status: draft/approved/in_production/completed, approved_by, approved_at) | `server/migrations/mes-presales-015-job-cards.js` |
| P3-1b | `POST /job-cards` — create from `order_confirmed` inquiry, auto-populate specs from inquiry + CSE report, auto-populate BOM from material checks | `server/routes/mes/presales/jobCards.js` (NEW, ~200 lines) |
| P3-1c | `GET /job-cards` — list with filters (status, date range). Management sees all, rep sees own inquiries' cards | `jobCards.js` |
| P3-1d | `GET /job-cards/:id` — full detail with BOM, specs, status | `jobCards.js` |
| P3-1e | `PATCH /job-cards/:id` — update BOM, specs, delivery date (draft only) | `jobCards.js` |
| P3-1f | `POST /job-cards/:id/approve` — set status `approved`, create `mes_jobs` entry (link to existing MES flow), advance inquiry to `in_production`, notify all production depts + sales rep | `jobCards.js` |
| P3-1g | Role check: only `canCreateJobCard(user)` can create/approve | `jobCards.js` |

#### P3-2: Job Card UI

| Task | Details | File |
|------|---------|------|
| P3-2a | `JobCardForm.jsx` — create/edit form with BOM table (material, qty required, qty available, status) | NEW component |
| P3-2b | `JobCardPanel.jsx` — tab on InquiryDetail showing job card status, BOM, progress. "Create Job Card" button when inquiry at `order_confirmed` | NEW component |
| P3-2c | `JobCardPDF.jsx` — A4 printable using jsPDF. Header with logo, job number, customer, delivery date. Specs table. BOM table. Print parameters. Two signature blocks (Production Manager / QC) | NEW component |
| P3-2d | `JobCardList.jsx` — management view at `/mes/job-cards`. Table: JC Number, Inquiry, Customer, Status, Delivery Date, Material Status. Filters: status, date range | NEW component |
| P3-2e | Add route for JobCardList in `src/components/MES/index.jsx` | `MES/index.jsx` |


#### P3-3: QC Product Group → Estimation Flow

| Task | Details | File |
|------|---------|------|
| P3-3a | Migration: create `mes_estimation_product_defaults` table (product_group FK, default_material_layers JSONB, default_processes JSONB, default_dimensions JSONB). Create `mes_material_master` table (id, category: substrate/ink/adhesive, subcategory, name, solid_pct, density, cost_per_kg, waste_pct, is_active) | `server/migrations/mes-presales-018-estimation-module.js` |
| P3-3b | Migration: `ALTER TABLE mes_quotations ADD COLUMN IF NOT EXISTS estimation_data JSONB` | Part of mes-presales-018 |
| P3-3c | Seed `mes_estimation_product_defaults` with FP product groups: BOPP (12μm PET + 20μm BOPP + adhesive + ink), PET (12μm PET + PE + adhesive), PA/PE (15μm Nylon + PE + adhesive), CPP (25μm CPP mono), LDPE (various gauges). Each with default enabled processes | `server/migrations/mes-presales-018-estimation-module.js` |
| P3-3d | `GET /api/mes/presales/materials` — returns material master grouped by category (Substrate/Ink/Adhesive) with subcategories and properties (solid%, density, cost/kg, waste%) | `server/routes/mes/presales/estimation.js` (NEW) |
| P3-3e | `GET /api/mes/presales/estimation/defaults?product_group=X` — returns default material layers, processes, and dimensions for a product group | `estimation.js` |
| P3-3f | Ensure CSE report carries `product_group` from sample → when inquiry transitions to `estimation`, product group is available for estimation pre-population | Verify in `qc.js` CSE creation |

#### P3-4: Flexible Packaging Estimation Calculator

| Task | Details | File |
|------|---------|------|
| P3-4a | `EstimationQueue.jsx` — lists inquiries at `estimation` or `cse_approved` stage. Shows product group badge, customer, days-in-stage. Management sees all; rep sees own | NEW component |
| P3-4b | `EstimationCalculator.jsx` — main calculator component. Sections: Project Header (customer, job, product type, order qty, units), Product Dimensions (conditional Roll/Sleeve/Pouch tables), Raw Material Cost Table (dynamic rows), Raw Material Summary, Operation Cost, Total Cost Table, Remarks. All calculations client-side in real-time | NEW component (~500 lines, split into sub-components) |
| P3-4c | `EstimationMaterialTable.jsx` — dynamic raw material rows. Each row: Type select (Substrate/Ink/Adhesive), Material select (from API), Solid%, Micron, Density, Total GSM (calc), Cost/Kg, Waste%, Cost/M² (calc), Est. Kg (calc), Layer% (calc). Add/remove rows. Solvent-mix row at bottom | NEW sub-component |
| P3-4d | `EstimationOperationTable.jsx` — 10 process rows (Extrusion, Printing, Rewinding, Lam 1-3, Slitting, Sleeving, Doctoring, Pouch Making). Each: checkbox, speed, setup hours, total hours (calc), cost/hr, process cost (calc). Process-specific hour formulas (Kgs/Hr, Mtr/Min, Pcs/Min) | NEW sub-component |
| P3-4e | `EstimationTotalCost.jsx` — cost grid: Raw Material Cost, Markup%, Plates/Cylinders, Delivery, Operation Cost, Sale Price. Five unit rows: Per Kg, Per Kpcs, Per SQM, Per LM, Per Roll 500 LM. All derived from Per Kg using conversion factors | NEW sub-component |
| P3-4f | `EstimationSummary.jsx` — aggregate fields: Film Density, Total Micron, Total GSM, Total Cost/M², Pieces/Kg, Grams/Piece, SQM/Kg, Print Film Width, LM/Kg. Zipper section (Bag/Pouch only). Roll After Slitting section | NEW sub-component |
| P3-4g | `POST /api/mes/presales/estimations` — save estimation data (full JSONB snapshot). `GET /api/mes/presales/estimations?inquiry_id=N` — retrieve saved estimation | `estimation.js` |
| P3-4h | "Create Quotation" button on completed estimation → saves estimation_data as JSONB on mes_quotations, creates draft quotation with calculated sale price, advances inquiry to `quoted` | `estimation.js` |
| P3-4i | Auto-populate estimation from product group defaults when opening calculator for an inquiry (material layers, enabled processes, dimensions from `mes_estimation_product_defaults`) | `EstimationCalculator.jsx` |
| P3-4j | Add routes for EstimationQueue and EstimationCalculator in `src/components/MES/index.jsx` | `MES/index.jsx` |

#### P3-5: Actual vs Estimation (Post-Production)

| Task | Details | File |
|------|---------|------|
| P3-5a | `EstimationActuals.jsx` — post-production comparison section. Final Output (Kgs) input. Material actuals table (mirrors estimation rows, user enters actual consumption). Operation actuals table (mirrors enabled processes, user enters actual hours) | NEW sub-component |
| P3-5b | Calculated fields: Actual RM Cost/Kg, RM Difference%, Actual Op Cost/Kg, Op Difference%, Estimated vs Actual margins, Cost Difference% | Inside `EstimationActuals.jsx` |
| P3-5c | Cost allocation charts (Chart.js horizontal bar): Raw Material % breakdown, Operation % breakdown. Auto-update when actuals change | Inside `EstimationActuals.jsx` |
| P3-5d | `PATCH /api/mes/presales/estimations/:id/actuals` — save actual consumption data alongside the estimation | `estimation.js` |

**Verification checklist after Phase 3:**
- Production Manager creates job card from `order_confirmed` inquiry → BOM pre-populated
- Job card approved → `mes_jobs` entry created, inquiry_stage = `in_production`, all production depts notified
- Print job card PDF → A4 renders correctly with specs, BOM, signature blocks
- QC sample with product_group=BOPP → CSE carries product_group → estimation pre-populates BOPP default layers
- Estimator opens `/mes/estimation` → selects inquiry → calculator loads with product group defaults
- Change Micron on a substrate row → Total GSM, Cost/M², Est. Kg, Layer%, all summary fields recalculate instantly
- Enter all costs → "Create Quotation" → quotation created with estimation_data JSONB, inquiry advances to `quoted`
- Post-production: enter actuals → difference% and margin calculations display correctly
- Material master API returns categories with subcategories and properties

---

### Phase 4 — Material Procurement Flow (Week 5)

**Goal:** Full procurement chain: PR auto-created from BOM → Manager approve → Supplier PO → Receipt → Job confirmed.  
**Closes:** G-06  
**Req Coverage:** Requirement 6

#### P4-1: Procurement Backend

| Task | Details | File |
|------|---------|------|
| P4-1a | Migration: create `mes_purchase_requisitions` (pr_number PR-FP-{YEAR}-{NNNNN}, job_card_id FK, material_details JSONB, status: pending/approved/rejected, approved_by), `mes_supplier_purchase_orders` (po_number SPO-FP-{YEAR}-{NNNNN}, pr_id FK, supplier_name, unit_prices JSONB, expected_delivery, status: draft/approved/sent/received), `mes_stock_receipts` (spo_id FK, received_quantities JSONB, received_by, received_at) | `server/migrations/mes-presales-016-procurement.js` |
| P4-1b | `POST /purchase-requisitions` — auto-created when Job Card BOM has `not_available` lines. Also manually creatable by procurement role. Notify procurement manager + manager | `server/routes/mes/presales/procurement.js` (NEW, ~300 lines) |
| P4-1c | `POST /purchase-requisitions/:id/approve` — manager role. Status → `approved`. Notify procurement team | `procurement.js` |
| P4-1d | `POST /supplier-purchase-orders` — procurement role. Linked to approved PR | `procurement.js` |
| P4-1e | `POST /supplier-purchase-orders/:id/approve` — manager role. Notify procurement to send to supplier | `procurement.js` |
| P4-1f | `POST /supplier-purchase-orders/:id/send` — status → `sent`. Optionally email supplier | `procurement.js` |
| P4-1g | `POST /stock-receipts` — stores_keeper role. Records received quantities. Updates job card BOM lines. If all BOM lines received: job card material_status → `available`. Notify production manager | `procurement.js` |


#### P4-2: Procurement UI

| Task | Details | File |
|------|---------|------|
| P4-2a | `ProcurementPanel.jsx` — tab on InquiryDetail (visible after job card created). Shows PR status, PO status, expected delivery. "Raise PR" button (procurement role only) | NEW component |
| P4-2b | `PurchaseRequisitionForm.jsx` — create/edit PR. Auto-populates from job card BOM `not_available` lines | NEW component |
| P4-2c | `SupplierPurchaseOrderForm.jsx` — create PO from approved PR. Select supplier, set unit prices, expected delivery | NEW component |
| P4-2d | `StockReceiptForm.jsx` — storekeeper form. Lists PO lines. Input received quantities. Submit | NEW component |
| P4-2e | `ProcurementDashboard.jsx` — management only at `/mes/procurement`. Open PRs, POs awaiting approval, pending deliveries, overdue receipts | NEW component |
| P4-2f | Add routes for ProcurementDashboard in `src/components/MES/index.jsx` | `MES/index.jsx` |

**Verification checklist after Phase 4:**
- Job card BOM has `not_available` line → PR auto-created → Procurement Manager notified
- Manager approves PR → Procurement team notified
- Supplier PO created → Manager approves → marked sent
- Storekeeper records full receipt → all BOM lines available → Job confirmed → Production Manager notified → Sales Rep notified

---

### Phase 5 — Pipeline Dashboard + MES Link + QC Enhancements (Weeks 6-7)

**Goal:** Full pipeline visible to management, MES production flow linked to job card, QC enhancements.  
**Closes:** G-08, G-15  
**Req Coverage:** Requirements 5 (complete), 8, 10 (complete)

#### P5-1: Full Pipeline Dashboard (Management Only)

| Task | Details | File |
|------|---------|------|
| P5-1a | Backend: `GET /api/crm/pipeline-dashboard` — returns funnel_counts (6 phases from CRM deals + MES inquiries), avg_cycle_times (from stage_changed_at), stalled_items (stage_changed_at < NOW() - 7 days), revenue_forecast (SUM of accepted quotation values at order_confirmed+) | `server/routes/crm/dashboard.js` (new endpoint) |
| P5-1b | `GET /api/crm/pipeline-dashboard?phase=X` — drill-down: individual inquiry list for clicked phase | `dashboard.js` |
| P5-1c | `FullPipelineDashboard.jsx` — Recharts FunnelChart for phase counts. CycleTimeBar chart. StalledItemsTable with deep link to inquiry. RevenueForecastCard | NEW component |
| P5-1d | Add Full Pipeline Dashboard tab in CRMModule (management only) | `src/components/CRM/CRMModule.jsx` |


#### P5-2: MES Flow Engine Linked to Job Card

| Task | Details | File |
|------|---------|------|
| P5-2a | In `POST /job-cards/:id/approve`: after inserting into `mes_jobs`, set `mes_jobs.job_card_id` and `mes_jobs.inquiry_id` | `server/routes/mes/presales/jobCards.js` |
| P5-2b | In `mes/flow.js` advance-phase handler: on each phase advance, update `mes_presales_inquiries.inquiry_stage` to `in_production` (for phases < dispatch) or `ready_dispatch` (for final production phase) | `server/routes/mes/flow.js` |
| P5-2c | SSE notification to sales rep on each production phase advance: "Production update: [job_number] advanced to [phase_name]" | `flow.js` |

#### P5-3: QC Enhancements

| Task | Details | File |
|------|---------|------|
| P5-3a | ENH-01: FP-specific parameter presets in QCTemplateAdmin — BOPP, PET, PA/PE, CPP with parameters: thickness, tensile MD/TD, elongation, COF, ΔE colour, ink adhesion, seal strength, OTR, MVTR | `QCTemplateAdmin.jsx` |
| P5-3b | ENH-02: Solvent retention auto-warning — if solvent_retention > 10 mg/m² AND food-contact → flag `cse.has_safety_warning = TRUE` | `qc.js` POST /analyses/:id/submit |
| P5-3c | ENH-03: CSE PDF — add company logo + signature block (QC Manager + Production Manager) | `presalesPdfService.js` |
| P5-3d | ENH-04: Sample disposition — add `disposition` column (retain/return/dispose) to `mes_presales_samples`. Add selector in QCSampleAnalysis | `QCSampleAnalysis.jsx`, `samples.js` |

**Verification checklist after Phase 5:**
- Full Pipeline Dashboard shows correct funnel counts from live data
- Stalled items list shows inquiries stuck > 7 days with correct days_in_stage
- Revenue forecast matches SUM of accepted quotations at order_confirmed+ stages
- Production phase advance (flow.js) updates inquiry_stage and notifies sales rep

---

### Phase 6 — Refactoring + Test Coverage (Weeks 8-9)

**Goal:** Clean codebase, route splitting, dead code removal, comprehensive test suite.

#### P6-1: Route File Size Enforcement (≤300 lines per file)

| Current File | Lines | Split Into |
|-------------|-------|------------|
| `server/routes/mes/presales/qc.js` | ~420 | `qc-inbox.js`, `qc-analysis.js`, `qc-cse.js` |
| `server/routes/mes/presales/proforma.js` | ~480 | `proforma.js` (PI), `orders.js` (dispatch/deliver/feedback/close) |
| `server/routes/mes/presales/quotations.js` | ~450 | `quotations.js` (CRUD + PDF), `quotation-approval.js` (submit/approve/reject) |
| `server/routes/mes/presales/inquiries.js` | ~520 | `inquiries-core.js` (CRUD + stage), `inquiries-clearance.js` (clearance + MOQ), `inquiries-admin.js` (stats + management) |


#### P6-2: Shared Helpers Consolidation

| Helper | Location | Replaces |
|--------|----------|----------|
| `buildRepScopeWhere(user, paramIndex)` | `server/services/crmAccessControl.js` | Every inline rep-scoping WHERE clause |
| `generateSequenceNumber(prefix, sequenceName, client)` | `server/utils/sequenceGenerator.js` | Duplicated numbering logic in quotations, jobCards, procurement |
| `standardNotify(inquiryId, eventType, extraData, client)` | `server/services/mesNotificationService.js` | Wraps notifyUsers + notifyRoleUsers + logActivity in one call |

#### P6-3: Frontend Dead Code Removal

- Remove AdminCRMDashboard.jsx / CRMDashboard.jsx inline duplication (both delegate to SalesCockpit now)
- Remove dead `recentActivities` state in MyDayDashboard.jsx
- Remove dead `getCustomerSearchNames()` in crm/customers.js
- Remove unused http/https imports in crm/ routes
- Consolidate inline role checks: replace all `['admin','manager'].includes(user?.role)` with imported `roleChecks.js` functions

#### P6-4: Test Suite

| Test File | Type | Covers |
|-----------|------|--------|
| `crmAccessControl.test.js` | Unit | buildRepScopeWhere, isManagement — rep vs manager scoping, level boundary |
| `quotationApproval.test.js` | Unit | submit/approve/reject/revise state machine — invalid transitions, duplicates |
| `dealSync.test.js` | Unit | syncDealFromInquiry — each stage mapping, already-won skip, missing FK |
| `customerPO.test.js` | Unit | ±5% validation — exact match, 4.9%, 5.1%, no PO value |
| `jobCard.test.js` | Unit | BOM auto-population, number generation — empty BOM, partial availability |
| `procurement.test.js` | Unit | PR→PO→receipt chain — full receipt, partial receipt, triggers job confirm |
| `slaBreachChecker.test.js` | Unit | Overdue detection — overdue, due in future, already-submitted skipped |
| `quotationWorkflow.test.js` | Integration | Draft → submit → approve → send → customer response → revision → approve |
| `customerPOFlow.test.js` | Integration | price_accepted → capture PO → order_confirmed → deal syncs to won |
| `jobCardFlow.test.js` | Integration | order_confirmed → create job card → approve → mes_job → in_production |
| `procurementFlow.test.js` | Integration | BOM not_available → auto-PR → approve → SPO → receive → available |
| `dealInquirySync.test.js` | Integration | Create deal → link inquiry → advance stages → verify deal stage |
| `rbacRoutes.test.js` | Integration | Each restricted endpoint returns 403 for wrong role, 200 for correct |
| `fullSalesCycle.test.js` | E2E | Prospect → Inquiry → QC → Clearance → Quotation → PO → Job Card → Dispatch → Close |

**Verification checklist after Phase 6 (Regression):**
- All Phase 0 verification checklist items still pass
- All API endpoints return expected data after route splitting
- No inline role checks remain in components (all use roleChecks.js)
- No CSS file has rules for components outside its designated scope
- `npm test` returns 0 failures


---

## Complete Notification Map

| Event | Trigger | Channel | Recipients | Status |
|-------|---------|---------|------------|--------|
| Samples submitted to QC | POST /submit-to-qc | Email + SSE | QC Lab, QC Mgr, Manager | ✅ Built |
| QC analysis complete → CSE | POST /analyses/:id/submit | SSE | QC roles | ✅ Built |
| QC analysis complete → Rep | POST /analyses/:id/submit | SSE | Sales Rep (owner) | ⚠️ ISS-01 → Phase 0 |
| QC Mgr approved → Prod Mgr | POST /cse/:id/approve | SSE | Production Mgr, Manager | ⚠️ BUG-01 → Phase 0 |
| Prod Mgr final approval → Rep | POST /cse/:id/approve | SSE | Sales Rep | ✅ Built |
| Clearance granted | PATCH /clearance | SSE | Sales Rep | ✅ Built |
| SLA breach | Job every 30 min | SSE | QC Mgr, Manager | ❌ Phase 1 |
| Quotation submitted for approval | POST /quotations/:id/submit | SSE + Email | All Sales Managers | ❌ Phase 1 |
| Quotation approved | POST /quotations/:id/approve | SSE | Sales Rep | ✅ Built |
| Quotation rejected | POST /quotations/:id/reject | SSE | Sales Rep (submitter) | ❌ Phase 1 |
| Lead assigned to rep | PATCH /prospects/:id or /customers/:id | SSE | Assigned Sales Rep | ❌ Phase 1 |
| Task assigned to rep | POST /tasks | SSE | Assigned user | ❌ Phase 2 |
| PO confirmed (Proforma) | POST /proforma/:id/confirm | SSE | Production Mgr, Manager | ✅ Built |
| Customer PO captured | POST /customer-po | SSE + Email | Sales Mgr, Prod Mgr, Procurement | ❌ Phase 2 |
| Dispatch with tracking | POST /orders/:id/deliver | Email | Customer contact, Sales Rep | ❌ Phase 2 |
| Job Card created | POST /job-cards | SSE | Production Mgr, Manager, Storekeeper | ❌ Phase 3 |
| Job Card approved | POST /job-cards/:id/approve | SSE | All production depts, Sales Rep | ❌ Phase 3 |
| Material not in stock → PR | BOM check on job card | SSE | Procurement Mgr, Manager | ❌ Phase 4 |
| PR approved | POST /purchase-requisitions/:id/approve | SSE | Procurement team | ❌ Phase 4 |
| SPO approved | POST /supplier-pos/:id/approve | SSE + Email | Procurement, Supplier | ❌ Phase 4 |
| Materials fully received | POST /stock-receipts | SSE | Production Mgr, Manager, Sales Rep | ❌ Phase 4 |
| Production phase advance | POST /mes/jobs/:id/advance | SSE | Sales Rep | ❌ Phase 5 |
| Pre-prod sample sent | PATCH /preprod-samples/:id/status | SSE | Sales Rep | ✅ Built |
| Pre-prod sample approved | POST /preprod-samples/:id/customer-response | SSE | Production, Manager | ✅ Built |


---

## Complete File Inventory

### Files to EDIT (Bug Fixes + Enhancements)

| File | Phase | Change Summary |
|------|-------|----------------|
| `server/routes/mes/presales/cse.js` | P0 | Fix BUG-01: `pending_qc` → `pending_qc_manager` |
| `server/routes/mes/presales/qc.js` | P0, P1 | Fix BUG-04 division filter, add ISS-01 rep notification, SLA breach endpoint |
| `server/routes/mes/presales/samples.js` | P0 | Fix BUG-05 double notification |
| `server/routes/mes/presales/inquiries.js` | P0 | Fix ISS-02 clearance role check |
| `server/routes/mes/presales/templates.js` | P0 | Fix BUG-03 product_group filter |
| `server/routes/mes/presales/quotations.js` | P1, P3 | Enforce approved-only send, add estimation_data |
| `server/routes/mes/presales/pipeline.js` | P2 | Call dealSyncService on stage advance |
| `server/routes/mes/presales/proforma.js` | P2 | Add transporter/AWB, customer notification, feedback endpoint |
| `server/routes/mes/presales/index.js` | P2-P4 | Mount customerPO.js, jobCards.js, procurement.js routers |
| `server/routes/mes/flow.js` | P5 | Call dealSyncService + update inquiry_stage on phase advance |
| `server/routes/crm/customers.js` | P1 | Add "Assign to Rep" endpoint |
| `server/routes/crm/prospects.js` | P1 | Add "Assign to Rep" endpoint |
| `server/routes/crm/dashboard.js` | P5 | Add /pipeline-dashboard endpoint |
| `server/routes/crm/deals.js` | P2 | Add /unified-timeline, "link-inquiry" action |
| `server/routes/crm/tasks.js` | P2 | Add assigned_to field, scope by assignment |
| `server/services/presalesPdfService.js` | P1, P3 | DRAFT watermark, approver name, CSE logo + signature |
| `server/services/crmAccessControl.js` | P0, P6 | Add buildRepScopeWhere(), isManagement() exported |
| `server/routes/mes/presales/_helpers.js` | P0 | Add isManagement(), canCreateJobCard(), canApproveMaterial() |
| `server/jobs/crmDailyDigest.js` | P1 | Add SLA breach check call |
| `server/index.js` | P1 | Wire slaBreachChecker cron |
| `src/components/MES/PreSales/QCScanPage.jsx` | P0 | Remove result submission, add "Open Analysis Form" link |
| `src/components/CRM/CustomerInquiries.jsx` | P1 | Live stage, phase stepper, New Inquiry CTA |
| `src/components/CRM/CRMModule.jsx` | P1, P5 | Add Full Pipeline Dashboard tab (management only) |
| `src/components/CRM/DealCard.jsx` | P2 | Show inquiry_stage badge |
| `src/components/CRM/TaskCreateModal.jsx` | P2 | Add "Assign To" rep selector (management only) |
| `src/components/CRM/TaskWidget.jsx` | P2 | Show "Assigned by [name]" badge |
| `src/components/CRM/ProspectManagement.jsx` | P1 | Add "Assign to Rep" button (management only) |
| `src/components/MES/PreSales/InquiryDetail/index.jsx` | P1-P4 | Add tabs: CustomerPOPanel, JobCardPanel, ProcurementPanel, DeliveryFeedbackPanel |
| `src/components/MES/QC/QCDashboard.jsx` | P1 | Add OVERDUE badge |
| `src/components/MES/QC/QCSampleAnalysis.jsx` | P5 | Add disposition selector |
| `src/components/MES/QC/QCTemplateAdmin.jsx` | P5 | Add FP-specific parameter presets |
| `src/components/MES/index.jsx` | P3-P4 | Add routes for JobCardList, EstimationQueue, ProcurementDashboard |
| `src/utils/roleChecks.js` | P0, P1 | Add isManagement(), canCreateJobCard() exports |


### Files to CREATE (New Components and Services)

| File | Phase | Purpose |
|------|-------|---------|
| `server/migrations/mes-presales-012-quotation-workflow.js` | P1 | parent_quotation_id, version_number, mes_quotation_approvals table |
| `server/migrations/mes-presales-013-customer-po.js` | P2 | mes_customer_purchase_orders table |
| `server/migrations/mes-presales-014-dispatch-feedback.js` | P2 | transporter/AWB columns, mes_delivery_feedback table |
| `server/migrations/crm-015-deal-sync.js` | P2 | note + source columns on crm_deal_stage_history |
| `server/migrations/mes-presales-015-job-cards.js` | P3 | mes_job_cards table |
| `server/migrations/mes-presales-016-procurement.js` | P4 | mes_purchase_requisitions, mes_supplier_purchase_orders, mes_stock_receipts |
| `server/migrations/mes-presales-017-sla-tracking.js` | P1 | sent_to_qc_at column, SLA index |
| `server/routes/mes/presales/quotation-approval.js` | P1 | submit/reject/revise/approval-history endpoints |
| `server/routes/mes/presales/customerPO.js` | P2 | Customer PO capture CRUD |
| `server/routes/mes/presales/jobCards.js` | P3 | Job Card CRUD + approve + material-status |
| `server/routes/mes/presales/procurement.js` | P4 | PR / SPO / receipt endpoints |
| `server/services/dealSyncService.js` | P2 | syncDealFromInquiry() function |
| `server/services/mesNotificationService.js` | P6 | standardNotify() wrapper function |
| `server/utils/sequenceGenerator.js` | P6 | generateSequenceNumber() shared utility |
| `server/jobs/slaBreachChecker.js` | P1 | 30-min interval SLA breach detector |
| `src/components/MES/PreSales/NegotiationTimeline.jsx` | P1 | Vertical timeline of quotation versions |
| `src/components/MES/PreSales/InquiryDetail/CustomerPOPanel.jsx` | P2 | Customer PO capture form + status |
| `src/components/MES/PreSales/InquiryDetail/DeliveryFeedbackPanel.jsx` | P2 | Delivery feedback star rating form |
| `src/components/MES/PreSales/JobCardForm.jsx` | P3 | Job card create/edit form with BOM table |
| `src/components/MES/PreSales/JobCardPanel.jsx` | P3 | Job card status tab on InquiryDetail |
| `src/components/MES/PreSales/JobCardPDF.jsx` | P3 | jsPDF printable job card A4 |
| `src/components/MES/PreSales/JobCardList.jsx` | P3 | Management view of all job cards |
| `src/components/MES/PreSales/EstimationQueue.jsx` | P3 | Queue of inquiries awaiting estimation |
| `src/components/MES/PreSales/EstimationCalculator.jsx` | P3 | Main estimation calculator — project header, dimensions, material table, operations, total cost |
| `src/components/MES/PreSales/EstimationMaterialTable.jsx` | P3 | Dynamic raw material rows with Type/Material/GSM/Cost calculations |
| `src/components/MES/PreSales/EstimationOperationTable.jsx` | P3 | 10 manufacturing process rows with hours and cost calculations |
| `src/components/MES/PreSales/EstimationTotalCost.jsx` | P3 | Multi-unit pricing grid (Per Kg, Kpcs, SQM, LM, Roll) |
| `src/components/MES/PreSales/EstimationSummary.jsx` | P3 | Aggregate fields: Film Density, Total Micron, Pieces/Kg, etc. |
| `src/components/MES/PreSales/EstimationActuals.jsx` | P3 | Post-production actual vs estimated comparison with charts |
| `server/routes/mes/presales/estimation.js` | P3 | Estimation CRUD, material master API, product group defaults API |
| `server/migrations/mes-presales-018-estimation-module.js` | P3 | mes_estimation_product_defaults, mes_material_master tables, estimation_data column |
| `src/components/MES/PreSales/InquiryDetail/ProcurementPanel.jsx` | P4 | PR/PO status tab on InquiryDetail |
| `src/components/MES/PreSales/PurchaseRequisitionForm.jsx` | P4 | Create/edit PR |
| `src/components/MES/PreSales/SupplierPurchaseOrderForm.jsx` | P4 | Create PO from approved PR |
| `src/components/MES/PreSales/StockReceiptForm.jsx` | P4 | Storekeeper receipt confirmation |
| `src/components/MES/PreSales/ProcurementDashboard.jsx` | P4 | Management procurement overview |
| `src/components/CRM/FullPipelineDashboard.jsx` | P5 | Funnel, cycle times, stalled items, revenue forecast |


---

## New Database Tables Summary

| Table | Phase | Key Columns | FK Relations |
|-------|-------|-------------|--------------|
| `mes_quotation_approvals` | P1 | quotation_id, action (submitted/approved/rejected/revision_requested), actor_id, actor_name, timestamp, notes | → mes_quotations |
| `mes_customer_purchase_orders` | P2 | po_number, po_date, inquiry_id, quotation_id, po_value, delivery_address, requested_delivery_date, po_document_path, status | → mes_presales_inquiries, → mes_quotations |
| `mes_delivery_feedback` | P2 | inquiry_id, satisfaction_rating (1-5), feedback_text, reorder_likelihood (yes/maybe/no) | → mes_presales_inquiries |
| `mes_job_cards` | P3 | job_number (JC-FP-YEAR-NNNNN), inquiry_id, customer_name, product_specs (JSONB), quantity, required_delivery_date, material_requirements (JSONB BOM), material_status, status, approved_by | → mes_presales_inquiries |
| `mes_purchase_requisitions` | P4 | pr_number (PR-FP-YEAR-NNNNN), job_card_id, material_details (JSONB), status, approved_by | → mes_job_cards |
| `mes_supplier_purchase_orders` | P4 | po_number (SPO-FP-YEAR-NNNNN), pr_id, supplier_name, unit_prices (JSONB), expected_delivery, status | → mes_purchase_requisitions |
| `mes_stock_receipts` | P4 | spo_id, received_quantities (JSONB), received_by, received_at | → mes_supplier_purchase_orders |
| `mes_estimation_product_defaults` | P3 | product_group (FK to crm_product_groups), default_material_layers (JSONB), default_processes (JSONB), default_dimensions (JSONB) | → crm_product_groups |
| `mes_material_master` | P3 | id, category (substrate/ink/adhesive), subcategory, name, solid_pct, density, cost_per_kg, waste_pct, is_active | — |

### Modified Tables

| Table | Phase | Changes |
|-------|-------|---------|
| `mes_quotations` | P1, P3 | + parent_quotation_id, + version_number, + estimation_data (JSONB) |
| `mes_presales_inquiries` | P1, P2 | + sent_to_qc_at, + transporter_name, + awb_number, + dispatch_date, + expected_delivery_date |
| `mes_presales_samples` | P5 | + disposition (retain/return/dispose) |
| `crm_deal_stage_history` | P2 | + note, + source |

---

## End-to-End Workflow Reference (39 Steps)

| # | Stage | Actor | System | Notification To |
|---|-------|-------|--------|-----------------|
| 1 | Prospect created | Sales Rep | CRM: fp_prospects | — |
| 2 | Technical Brief captured | Sales Rep | CRM: crm_technical_briefs | — |
| 3 | Deal created & linked to prospect | Sales Rep | CRM: crm_deals | — |
| 4 | Prospect approved → convert to Customer | Sales Manager | CRM: fp_customer_unified | Sales Rep |
| 5 | Inquiry created (3-step wizard) | Sales Rep | MES: mes_presales_inquiries | — |
| 6 | TDS / samples uploaded | Sales Rep | MES: mes_presales_samples | — |
| 7 | SAR printed with QR label | Sales Rep | MES: SAR PDF | — |
| 8 | Batch samples submitted to QC | Sales Rep | MES: status → sent_to_qc | QC Lab, QC Mgr, Manager |
| 9 | QC inbox: batch receive samples | QC Analyst | MES: status → qc_received | — |
| 10 | QR scan → Open full analysis form | QC Analyst | MES: redirect | — |
| 11 | Full QC analysis completed | QC Analyst | MES: mes_qc_analyses | Sales Rep |
| 12 | CSE auto-generated | System | MES: mes_cse_reports | — |
| 13 | QC Manager approves CSE | QC Manager | MES: cse → qc_manager_approved | Prod Mgr, Manager |
| 14 | Production Manager final approval | Prod Manager | MES: cse → approved | Sales Rep |
| 15 | Pre-sales clearance granted | Sales Manager (level 6+) | MES: presales_cleared = true | Sales Rep |
| 16 | MOQ check completed | Management | MES: mes_presales_moq_checks | — |
| 17 | Material availability check | Management | MES: mes_presales_material_checks | — |
| 18 | Estimation: unit price calculated | Estimator / Sales Mgr | MES: estimation_data | — |
| 19 | Quotation created (draft) | Sales Rep / Estimator | MES: mes_quotations → draft | — |
| 20 | Sales Rep submits quotation for approval | Sales Rep | MES: → pending_approval | All Sales Managers |
| 21 | Manager approves quotation | Sales Manager | MES: → approved | Sales Rep |
| 22 | Quotation sent to customer | Sales Rep | MES: → sent | — |
| 23 | Customer response: accepted/rejected/counter | Sales Rep records | MES: → accepted/rejected/counter_offer | — |
| 24 | If counter: escalate to manager, create revision | Sales Rep | MES: new quotation with parent_quotation_id | Sales Manager |
| 25 | Manager approves revised quotation | Sales Manager | MES: revised → approved | Sales Rep |
| 26 | Customer accepts final quotation | Sales Rep | MES: inquiry → price_accepted | — |
| 27 | Proforma Invoice created and sent | Sales Rep | MES: mes_proforma_invoices | Customer (email) |
| 28 | Customer PO captured | Sales Rep | MES: mes_customer_purchase_orders | Sales Mgr, Prod Mgr, Procurement |
| 29 | Pre-production sample requested + sent | Sales Rep / Production | MES: mes_preprod_samples | Sales Rep |
| 30 | Customer approves pre-prod sample | Sales Rep records | MES: preprod → approved | Production, Manager |
| 31 | Job Card created from confirmed inquiry | Prod Manager | MES: mes_job_cards | All production, Sales Rep |
| 32 | Job Card approved | Prod Manager (level 6+) | MES: mes_jobs created, inquiry → in_production | All production, Sales Rep |
| 33 | If material not in stock → PR auto-created | System | MES: mes_purchase_requisitions | Procurement, Manager |
| 34 | PR approved → Supplier PO created → sent | Manager, Procurement | MES: mes_supplier_purchase_orders | Procurement, Supplier |
| 35 | Materials received | Storekeeper | MES: mes_stock_receipts, BOM updated | Prod Mgr, Sales Rep |
| 36 | Production phases 1-17 (prepress → dispatch) | Production Operators | MES: mes_jobs phases | Sales Rep (each advance) |
| 37 | Dispatch with transporter + AWB | Production / Logistics | MES: inquiry → delivered | Sales Rep, Customer contact |
| 38 | Customer feedback captured | Sales Rep | MES: mes_delivery_feedback | — |
| 39 | Inquiry closed → Deal marked Won | Sales Rep | MES: → closed; CRM: deal → won | — |


---

## Sprint Schedule

| Week | Phase | Tasks | Output |
|------|-------|-------|--------|
| Week 1 — Days 1-2 | Phase 0 | P0-01 → P0-07 (all 7 bug fixes, one PR each) | All critical bugs resolved, zero wrong-data risk |
| Week 1 — Days 3-5 | Phase 1 (Part 1) | P1-1: quotation submit/reject/revise, P1-2: PDF watermark, P1-3: versioning | Quotation workflow enforced end-to-end |
| Week 1 — Days 4-5 | Phase 1 (Part 2) | P1-4: SLA breach job, P1-5: CustomerInquiries, Lead assignment | Notifications live, management can assign leads |
| Week 2 | Phase 2 | P2-1: Deal sync, P2-2: Customer PO, P2-3: Dispatch fields, P2-4: Task allocation | Bidirectional sync live, PO captured, dispatch tracked |
| Weeks 3-5 | Phase 3 | P3-1+2: Job Card backend + UI, P3-3: QC→Estimation flow + product defaults, P3-4: Full Estimation Calculator (10 sub-tasks), P3-5: Actual vs Estimation | Job Card working, full estimation calculator with material master, product group defaults, multi-unit pricing |
| Week 6 | Phase 4 | P4-1: Procurement backend, P4-2: Procurement UI | Full material procurement chain live |
| Weeks 7-8 | Phase 5 | P5-1: Pipeline Dashboard, P5-2: MES flow link, P5-3: QC enhancements | Full pipeline visible to management, loop complete |
| Weeks 9-10 | Phase 6 | P6-1-P6-4: Refactoring, test suite, verification regression run | Clean codebase, test coverage, all checklists pass |

**Total: 10 weeks from Phase 0 kickoff to Phase 6 completion.**

**Parallel tracks:** After Phase 0, Phases 1 and 2 can overlap if two developers are available. Phase 3 depends on Phase 2 (needs Customer PO table). Phase 4 depends on Phase 3 (needs Job Card table). Phase 5 depends on Phase 4.

---

## Coding Rules — Every File, Every Commit

| Rule | Detail |
|------|--------|
| Small files | Every route file ≤ 300 lines. Split when approaching limit. No God files. |
| Small PRs | Each PR = one atomic change. Never mix a bug fix with a new feature. |
| Parameterised queries | ALWAYS use $1, $2 placeholders. NEVER interpolate ${} into SQL. NEVER concatenate SQL. |
| Transactions | All writes touching >1 table: BEGIN / COMMIT / ROLLBACK. On any error: ROLLBACK before returning 500. |
| Role checks | ALWAYS import from roleChecks.js (frontend) or _helpers.js (backend). Never hardcode role strings inline. |
| Scoped queries | ALWAYS use buildRepScopeWhere() helper. Never write the WHERE rep filter inline. |
| Notifications | Every status change affecting another person MUST fire a notification. No silent stage transitions. |
| SSE labels | Every new notification type must be added to MESNotificationBell.jsx typeLabel map before merge. |
| CSS naming | CRM: `.crm-{component}-{element}` in CRM.css. MES: `.presales-{component}-{element}` in PresalesInquiries.css. No inline styles except dynamic values. |
| Soft delete | Never DELETE or destructive UPDATE without soft-delete flag or explicit user confirmation. |
| Audit trail | All presales state changes: call logActivity(). All CRM mutations: call logAudit(). All deal stage changes: insert crm_deal_stage_history. |
| Error responses | All errors return `{ success: false, error: '<message>' }`. All 403s log the attempt. All 500s log full stack trace. |
| Test before ship | Before marking any task done: (1) happy path, (2) missing required field → 400, (3) unauthorised role → 403, (4) run npm test. |
| No data loss | No migration runs DELETE or DROP without explicit soft-delete migration first. |
| Migration numbering | CRM: crm-014, crm-015... MES: mes-presales-012, mes-presales-013... Never reuse a number. |
| FK convention | FK to `fp_customer_unified` uses `customer_id` (the PK), not `id`. |

---

## What NOT to Build (Scope Control)

| Feature | Reason to Skip |
|---------|---------------|
| Full costing engine with BOM | Too complex — start with manual estimation entry |
| Automated quotation from ERP | Use simple quotation form first |
| Customer portal / self-service | Not needed — sales rep handles all customer interaction |
| Multi-currency costing | Use AED/USD only for now |
| Workflow automation engine | Overkill — hardcoded stage transitions are simpler and less buggy |
| Visual workflow builder | Not needed — fixed pipeline stages |
| Campaign/Mass Email | Not relevant for B2B packaging sales |
| Knowledge Base | Overkill for team size |

---

## Comparison: Requirements Doc vs Master Plan v3

| Topic | Requirements Doc (Spec) | Master Plan v3 | Final Plan |
|-------|------------------------|----------------|------------|
| Quotation Approval | Req 1: 10 acceptance criteria | Phase 1: P1-1 (8 tasks) | ✅ Merged — all criteria covered in P1-1 |
| Quotation PDF | Req 2: 5 criteria | Phase 1: P1-2 (watermark + approver) | ✅ Merged — P1-2 covers all |
| Negotiation | Req 3: 7 criteria | Phase 1: P1-3 (versioning + timeline) | ✅ Merged — P1-3 covers all |
| Customer PO | Req 4: 7 criteria | Phase 2: P2-2 (PO capture + ±5%) | ✅ Merged — P2-2 covers all |
| Job Card | Req 5: 7 criteria | Phase 3: P3-1+2 (full CRUD + BOM + PDF) | ✅ Merged — P3-1/2 covers all |
| Material Ordering | Req 6: 7 criteria | Phase 4: P4-1+2 (PR→PO→receipt chain) | ✅ Merged — P4-1/2 covers all |
| CRM-MES Sync | Req 7: 8 criteria | Phase 2: P2-1 (dealSyncService) | ✅ Merged — P2-1 covers all |
| Pipeline Dashboard | Req 8: 6 criteria | Phase 5: P5-1 (funnel + cycle times) | ✅ Merged — P5-1 covers all |
| Delivery Tracking | Req 9: 7 criteria | Phase 2: P2-3 (dispatch + feedback) | ✅ Merged — P2-3 covers all |
| Notifications | Req 10: 5 criteria | Notification map (24 events) | ✅ Merged — full map in this doc |
| RBAC | Req 11: 5 criteria | Role matrix (7 tiers) + 6 functions | ✅ Merged — matrix + functions in this doc |
| Bug Fixes | Not in Req Doc | Phase 0: 7 bugs + 2 issues | ✅ Added as Phase 0 |
| SLA Breach | Not in Req Doc | Phase 1: P1-4 | ✅ Added |
| Lead Assignment | Not in Req Doc | Phase 1: P1-5 | ✅ Added |
| Task Allocation | Not in Req Doc | Phase 2: P2-4 | ✅ Added |
| Estimation UI | Not in Req Doc | Phase 3: P3-3 | ✅ Added |
| QC Enhancements | Not in Req Doc | Phase 5: P5-3 (4 items) | ✅ Added |
| QC Product Group → Estimation | Req 12: 7 criteria | Phase 3: P3-3 (6 tasks) | ✅ Merged — P3-3 covers all |
| Estimation Calculator | Req 13: 17 criteria | Phase 3: P3-4 (10 tasks) + P3-5 (4 tasks) | ✅ Merged — P3-4/5 covers all |
| Route Splitting | Not in Req Doc | Phase 6: P6-1 (4 files) | ✅ Added |
| Test Suite | Not in Req Doc | Phase 6: P6-4 (14 test files) | ✅ Added |

---

*This document is the single source of truth for the PPH-26.2 CRM-MES Pipeline Integration. All PRs reference phase and task numbers from this document.*

*Last updated: 2026-03-04 | Owner: Development Lead | Review cycle: end of each phase*
