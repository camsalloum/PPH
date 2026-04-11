# Pre-Sales Full Lifecycle — Deep Plan
## From SAR Submit → QC → Estimation → Quotation → Pre-prod Sample → Production → Delivery → Approval → PI → Full Production

> **Date:** 2026-03-01  
> **Context:** Sales rep submits SAR → needs a CLEAR, simple dashboard to track every step until full production order  
> **Status:** Sprints 1-5.1 COMPLETE. 21-stage pipeline, quotations, pre-prod samples, proforma invoices, soft-delete, stage_changed_at, lost/on_hold from any active stage.  
> **Problem:** Current Inquiry Board is a flat kanban with 7 generic columns (New / In Progress / Registered / Qualified / Converted / Lost / On Hold). Once presales finishes, the inquiry "disappears" from sales rep's view. There is no visibility into estimation, quotation, pre-production sample, customer approval, PI, or full production. The UX will become complex and un-user-friendly with many inquiries at different stages.  
> **Goal:** One unified "My Inquiries" tracker for the sales rep — like a parcel delivery tracker where each inquiry shows EXACTLY which step it's on.

---

## Part 1: The Real Business Flow (Your Words → System Steps)

```
SALES REP                  QC LAB               ESTIMATION        MANAGEMENT         PRODUCTION
─────────                  ──────               ──────────        ──────────         ──────────
1. Submit SAR ──────────►  2. Analyse sample
                           3. CSE Report ──────►
                           4. QC+Prod Mgr
                              Approve CSE ─────► 
                                                 5. Cost estimation
                                                    calculated ───►
                                                                   6. Quotation
                                                                      created
7. Sales rep receives ◄────────────────────────────────────────────── quotation
8. Negotiate price
   with customer
9. Customer APPROVES ──►                                                           10. Pre-production
   price                                                                               sample made
11. Sales rep sends ◄──────────────────────────────────────────────────────────── sample to customer
12. Customer tests on
    machine
13. Customer APPROVES ──►                                                          
    sample quality
14. Sales rep sends ───►   (optional re-test)
    approval to QC
15. Sales rep sends
    PI (Proforma Invoice)
    to customer
16. Customer confirms ──►
    PI / PO received
17. Pass to production ──────────────────────────────────────────────────────────► 18. Full production
                                                                                  19. QC final check
20. Sales rep informed ◄──────────────────────────────────────────────────────────  ready for dispatch
    coordinates with
    Sales Coordinator
21. Delivery / Logistics
22. Post-delivery feedback
```

---

## Part 2: Current State vs. What's Needed

### What EXISTS today (built & working — code-verified 2026-03-01)

| Step | Status | Where |
|------|--------|-------|
| 1. Submit SAR (inquiry + samples + attachments) | ✅ Built | `InquiryCapture.jsx` → `POST /inquiries` + `/samples` + `/submit-to-qc` |
| 2. QC receives sample, fills analysis form | ✅ Built | `QCDashboard.jsx` → `QCSampleAnalysis.jsx` |
| 3. CSE report auto-generated | ✅ Built | `POST /qc/analyses/:id/submit` → creates CSE |
| 4. QC Manager + Production Manager approve CSE | ✅ Built | `CSEApprovalPage.jsx` → `POST /cse/:id/approve` |
| 5. General inquiry (no SAR) | ✅ Built (Sprint 5) | `inquiry_type = 'general'` → skips SAR, enters at `new_inquiry` stage |
| 6. My Pipeline dashboard | ✅ Built (Sprint 3) | `MyPipeline.jsx` → `GET /pipeline/stages` + `GET /pipeline/stats` |
| 7. Quotation CRUD + versioning | ✅ Built (Sprint 4) | `QuotationPanel.jsx` → `quotations.js` API |
| 8. Pre-prod sample tracking | ✅ Built (Sprint 5) | `PreprodSamplePanel.jsx` → `preprod.js` API |
| 9. Proforma Invoice module | ✅ Built (Sprint 5) | `ProformaPanel.jsx` → `proforma.js` API |
| 10. Stage transitions (16 manual) | ✅ Built (Sprint 5.1) | `pipeline.js` MANUAL_TRANSITIONS — lost/on_hold from every active stage |
| 11. Soft-delete + audit trail | ✅ Built (Sprint 5.1) | `deleted_at`, `deleted_by`, `deleted_by_name` columns |
| 12. stage_changed_at tracking | ✅ Built (Sprint 5.1) | 22 update points across 8 backend files |
| 13-17. PO Validation, Full Registration, Credit | ❌ NOT BUILT | Planned Sprint 6 |
| 18-22. Production handoff, Dispatch, Delivery | ❌ NOT BUILT | Planned Sprint 6-7 |

### What the Sales Rep sees today

- **Inquiry Board** (kanban): New → In Progress → Registered → Qualified → Converted → Lost → On Hold
- **Inquiry Detail page**: Shows phases, samples, attachments, clearance section
- After CSE is approved and clearance granted → inquiry goes to "Converted" column → **dead end**
- No quotation, no negotiation tracker, no pre-prod sample tracker, no PI, no production status

### The Problem for Sales Rep with Many Inquiries

If a sales rep has 30+ active inquiries at different stages:
- Some waiting for QC
- Some waiting for estimation
- Some with quotation sent to customer
- Some with pre-production sample being made
- Some approved, waiting for PI
- Some in full production

**The kanban board becomes useless** — most pile up in "In Progress" or "Converted" with no way to tell them apart.

---

## Part 3: UX Design — Simple "My Pipeline" Tracker

### Design Philosophy (learned from reference apps)

From **Twenty CRM**: Position-based kanban with activity timeline per card  
From **ERPNext**: Sales Stage + Probability tracking, structured lost reasons  
From **Dolibarr**: 6-stage proposal machine with audit fields on each transition  
From **iDempiere**: Document lifecycle with immutable completed state  
From **Metafresh**: RFQ lifecycle with event dispatcher

### The Solution: Replace the 7-column Kanban with a STAGE-BASED PIPELINE

Instead of generic statuses (New, In Progress, Qualified...), use **business-meaningful stages** that the sales rep actually thinks in:

```
┌─────────┐    ┌──────────┐    ┌──────────┐    ┌───────────┐    ┌─────────┐    ┌──────────┐    ┌───────────┐    ┌──────────┐
│   SAR   │ ►  │  QC IN   │ ►  │   CSE    │ ►  │ESTIMATION │ ►  │ QUOTED  │ ►  │PRE-PROD  │ ►  │   ORDER   │ ►  │DELIVERED │
│ PENDING │    │ PROGRESS │    │ APPROVED │    │  READY    │    │         │    │ SAMPLE   │    │CONFIRMED │    │          │
└─────────┘    └──────────┘    └──────────┘    └───────────┘    └─────────┘    └──────────┘    └───────────┘    └──────────┘
     │              │               │                │              │               │               │               │
   0 days        2-3 days        1-2 days          3-5 days       varies          5-10 days       varies          varies
```

### Sales Rep Dashboard — "My Pipeline" View

**NOT a horizontal kanban** (too many columns). Instead: **a filterable list/table with color-coded stage badges** + **summary cards at top**.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  MY PIPELINE                                           [+ New SAR]  [Filters ▼] │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐│
│  │ 🟡 5    │  │ 🔵 3    │  │ 🟢 2    │  │ 🟠 4    │  │ 🟣 1    │  │ ⚫ 2    ││
│  │SAR/QC   │  │Estimate │  │ Quoted  │  │Negotiate│  │Pre-Prod │  │In Prod  ││
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘│
│                                                                                  │
│  ─── REQUIRING MY ACTION ──────────────────────────────────────────────────────│
│  │ INQ-FP-2026-00015  │ Carrefour SA     │ Shrink Film │ 💬 QUOTED → AWAITING  │
│  │                    │                   │             │    CUSTOMER RESPONSE   │
│  │ INQ-FP-2026-00022  │ Spinneys LLC     │ Labels      │ ✅ PRE-PROD SAMPLE    │
│  │                    │                   │             │    READY → SEND TO     │
│  │                    │                   │             │    CUSTOMER            │
│  ─── IN PROGRESS (no action needed) ──────────────────────────────────────────│
│  │ INQ-FP-2026-00018  │ ADNOC Foods      │ Pouches     │ 🔄 QC TESTING (2/3    │
│  │                    │                   │             │    samples done)       │
│  │ INQ-FP-2026-00019  │ Emirates Snacks  │ Film Plain  │ 🔄 ESTIMATION IN      │
│  │                    │                   │             │    PROGRESS            │
│  ─── COMPLETED ────────────────────────────────────────────────────────────────│
│  │ INQ-FP-2026-00010  │ Al Islami Foods  │ Pouches     │ ✅ DELIVERED           │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Key UX principles:**
1. **"Requiring My Action" on top** — sales rep sees what THEY need to do NOW
2. **"In Progress" below** — things happening in other departments, no action needed
3. **One-line stage badge** — color + icon + short text, not a full kanban column
4. **Click any row → detail page** with the full phase stepper + action buttons

### Inquiry Detail — Phase Stepper (Already Exists, Needs More Steps)

The existing `PhaseStepperCard` component shows the current phase as a horizontal stepper. This needs to be extended from 5 phases (Pre-Sales only) to the full lifecycle:

```
[SAR ✅] → [QC ✅] → [CSE ✅] → [Estimation] → [Quotation] → [Negotiate] → [Pre-Prod Sample] → [Order] → [Production] → [Delivery]
                                    ▲ YOU ARE HERE
```

Each step shows: ✅ done / 🔄 in progress / ⬜ upcoming / ❌ rejected/blocked

---

## Part 4: Implementation Plan — Priority Order

### Sprint 1: Fix What's Broken NOW (1-2 days)

**Goal:** Make the existing SAR → QC → CSE flow work end-to-end with zero bugs.

| # | Task | File(s) | Status |
|---|------|---------|--------|
| S1-01 | ✅ Fix samples.js INSERT column mismatch (8 cols, 10 params) | `server/routes/mes/presales/samples.js` | ✅ DONE |
| S1-02 | ✅ Fix InquiryCapture auto-call `/submit-to-qc` after wizard | `src/components/MES/PreSales/InquiryCapture.jsx` | ✅ DONE |
| S1-03 | Verify SSE notification delivery to QC on SAR submit | `server/routes/notifications.js` + `MESNotificationBell.jsx` | Verify after server restart |
| S1-04 | Verify QC Dashboard shows new SAR in "Pending Receipt" | `QCDashboard.jsx` fetches `status=sent_to_qc` | Verify after S1-01/02 |
| S1-05 | Test complete flow: Submit SAR → QC Receive → Analysis → CSE → Approve | Full flow test | Manual test |
| S1-06 | Fix any bugs found in S1-05 | TBD | TBD |

### Sprint 2: Extend the Inquiry Lifecycle Model (2-3 days)

**Goal:** Add the post-presales stages to the database + backend. No frontend yet.

| # | Task | Details |
|---|------|---------|
| S2-01 | ✅ Add new `inquiry_stage` column to `mes_presales_inquiries` | New enum: `new_inquiry`, `sar_pending`, `qc_in_progress`, `qc_received`, `cse_pending`, `cse_approved`, `estimation`, `quoted`, `negotiating`, `price_accepted`, `preprod_sample`, `preprod_sent`, `sample_approved`, `pi_sent`, `order_confirmed`, `in_production`, `ready_dispatch`, `delivered`, `closed`, `lost`, `on_hold` (21 stages) | ✅ DONE |
| S2-02 | ✅ Create `mes_quotations` table | `id, quotation_number, inquiry_id, estimation_data (JSONB), unit_price, total_price, currency, valid_until, status (draft/sent/accepted/rejected/expired), sent_at, customer_response, customer_response_at, approved_by, notes` |
| S2-03 | ✅ Create `mes_preprod_samples` table | `id, inquiry_id, quotation_id, sample_number, status (requested/in_production/ready/sent_to_customer/approved/rejected), production_notes, customer_feedback, approved_at` |
| S2-04 | ✅ Create `mes_proforma_invoices` table | `id, pi_number, inquiry_id, quotation_id, amount, currency, status (draft/sent/confirmed), customer_po_number, confirmed_at` |
| S2-05 | ✅ Add lifecycle API routes | `PATCH /inquiries/:id/stage` — advance to next stage with validation |
| S2-06 | ✅ Add stage-transition notifications | Each stage change → in-app + email to relevant roles |
| S2-07 | ✅ Migration script for all new tables | Single migration file with all DDL |

### Sprint 3: Sales Rep "My Pipeline" Dashboard (3-4 days) — ✅ DONE

**Goal:** Replace the flat kanban with a stage-aware pipeline view.

| # | Task | Details | Status |
|---|------|---------|--------|
| S3-01 | ✅ Create `MyPipeline.jsx` component | Summary stat cards (count per stage) + grouped list | ✅ DONE |
| S3-02 | ✅ Backend: `GET /api/mes/presales/pipeline/*` | Stages, stats, manual transitions API | ✅ DONE |
| S3-03 | ✅ Stage badge component | Color-coded pill component | ✅ DONE |
| S3-04 | ✅ "Action Required" logic | Server-side: determine if sales rep needs action based on stage | ✅ DONE |
| S3-05 | ✅ Update `WorkflowLandingPage` Phase 1 actions | Link to `MyPipeline` | ✅ DONE |
| S3-06 | ✅ Keep `InquiryBoard` kanban | Still accessible as alternate view | ✅ DONE |

### Sprint 4: Quotation & Estimation Flow (3-4 days) — ✅ DONE

**Goal:** After CSE approved → estimation happens → quotation generated → sales rep sends to customer.

| # | Task | Details | Status |
|---|------|---------|--------|
| S4-01 | ✅ Estimation entry form | Simple form: material cost, process cost, overhead, margin → auto-calculate unit price | ✅ DONE |
| S4-02 | ✅ Quotation generation | From estimation → create quotation with prices, validity, terms | ✅ DONE |
| S4-03 | Quotation PDF | Printable quotation document with company branding | 🔲 Planned |
| S4-04 | Quotation approval flow | Manager reviews price/margin before sending to customer | 🔲 Planned |
| S4-05 | ✅ Customer response tracking | Sales rep marks: Accepted / Rejected / Counter-offer / No Response | ✅ DONE |
| S4-06 | ✅ Auto-advance stage | On "Accepted" → move to `price_accepted` stage | ✅ DONE |

### Sprint 5: Pre-Production Sample & Customer Approval (2-3 days) — ✅ DONE

**Goal:** After price approved → pre-production sample made → customer tests → approves.

| # | Task | Details | Status |
|---|------|---------|--------|
| S5-01 | ✅ Pre-production sample request | Sales rep triggers "Request Pre-Prod Sample" → notification to production | ✅ DONE |
| S5-02 | ✅ Production marks sample ready | Production updates status → notification to sales rep | ✅ DONE |
| S5-03 | ✅ Sales rep sends sample to customer | Mark as "Sent to Customer" with tracking info | ✅ DONE |
| S5-04 | ✅ Customer approval capture | Sales rep records: Approved / Rejected / Revision needed + notes | ✅ DONE |
| S5-05 | ✅ On approval → PI stage | Auto-advance to PI/Order stage | ✅ DONE |
| S5-06 | Revision loop | If rejected → can request new pre-prod sample | 🔲 Planned |

### Sprint 5.1: Bug Fix Sprint (1 day) — ✅ DONE

**Goal:** Fix 6 bugs identified from reference app study (Twenty CRM + ERPNext analysis).

| # | Bug ID | Fix | Status |
|---|--------|-----|--------|
| BF-01 | BUG-A | Stage SET moved inside DB transaction (before COMMIT) | ✅ DONE |
| BF-02 | BUG-B | Soft-delete: DELETE → sets `deleted_at`, `deleted_by`, `deleted_by_name`. All queries filter `deleted_at IS NULL` | ✅ DONE |
| BF-03 | BUG-D | Paginated activities: `GET /inquiries/:id/activities?page=1&limit=50` | ✅ DONE |
| BF-04 | BUG-E | `stage_changed_at` column added. 22 stage-change points across 8 files now set `stage_changed_at = NOW()`. Pipeline uses `COALESCE(stage_changed_at, updated_at)` | ✅ DONE |
| BF-05 | BUG-F | Lost/on_hold from ANY active stage (16 MANUAL_TRANSITIONS entries). On_hold resumes to 5 targets | ✅ DONE |
| BF-06 | ISS-18 | Lost guard: cannot mark lost if active quotations exist (status != rejected/expired) | ✅ DONE |

**DB columns added:** `stage_changed_at`, `deleted_at`, `deleted_by`, `deleted_by_name`  
**Files modified:** inquiries.js, pipeline.js, activities.js, qc.js, cse.js, quotations.js, preprod.js, proforma.js, samples.js

### Sprint 6: PI, Order Confirmation & Production Handoff (2-3 days)

**Goal:** PI sent → customer confirms → pass to full production.

| # | Task | Details |
|---|------|---------|
| S6-01 | PI generation | Create PI from quotation data, customer PO reference |
| S6-02 | PI PDF | Printable PI with line items, terms, bank details |
| S6-03 | Customer PO confirmation | Sales rep enters customer PO number → order confirmed |
| S6-04 | Production handoff | "Pass to Production" button → creates production job (links to existing MES flow module) |
| S6-05 | Production progress visibility | Sales rep can see production status on their pipeline |

### Sprint 7: Delivery & Feedback (1-2 days)

**Goal:** Production complete → dispatch → delivery → post-delivery feedback.

| # | Task | Details |
|---|------|---------|
| S7-01 | Ready for dispatch notification | Production marks complete → sales rep + coordinator notified |
| S7-02 | Delivery tracking | Basic: mark as dispatched, delivery date, AWB/tracking number |
| S7-03 | Post-delivery feedback | Optional customer feedback capture |
| S7-04 | Close inquiry | Mark lifecycle complete |

---

## Part 5: Database Schema for New Tables

### inquiry_stage enum (add to mes_presales_inquiries)

```sql
-- Add stage column (keeps existing status column for backward compat)
ALTER TABLE mes_presales_inquiries 
  ADD COLUMN IF NOT EXISTS inquiry_stage VARCHAR(30) DEFAULT 'sar_pending';

-- Stage values and their meaning:
-- sar_pending        → SAR submitted, waiting for QC
-- qc_in_progress     → QC is analysing/testing
-- cse_pending        → CSE generated, awaiting approval
-- cse_approved       → CSE approved by QC Mgr + Prod Mgr
-- estimation         → Estimation dept calculating costs
-- quoted             → Quotation sent to sales rep / customer
-- negotiating        → Customer price negotiation in progress
-- price_accepted     → Customer accepted the price
-- preprod_sample     → Pre-production sample being made
-- preprod_sent       → Pre-prod sample sent to customer
-- sample_approved    → Customer approved sample quality
-- pi_sent            → Proforma Invoice sent
-- order_confirmed    → Customer PO received, order confirmed
-- in_production      → Full production in progress
-- ready_dispatch     → Production complete, ready to ship
-- delivered          → Delivered to customer
-- closed             → Lifecycle complete
-- lost               → Inquiry lost (at any stage)
-- on_hold            → Paused (at any stage)
```

### Auto-Advancement Rules

```
sample registered + submit-to-qc       → sar_pending   ──► qc_in_progress
all samples tested + CSE generated      → qc_in_progress ──► cse_pending
CSE approved (both managers)            → cse_pending    ──► cse_approved
estimation created                      → cse_approved   ──► estimation
quotation created                       → estimation     ──► quoted
customer accepts price                  → quoted/negotiating ──► price_accepted
pre-prod sample requested               → price_accepted ──► preprod_sample
pre-prod sample sent to customer        → preprod_sample  ──► preprod_sent
customer approves sample                → preprod_sent    ──► sample_approved
PI sent                                 → sample_approved ──► pi_sent
customer PO received                    → pi_sent         ──► order_confirmed
production job created                  → order_confirmed ──► in_production
production complete                     → in_production   ──► ready_dispatch
delivered                               → ready_dispatch  ──► delivered
feedback captured                       → delivered       ──► closed
```

---

## Part 6: What Makes This Plan Different from Past Attempts

### Previous Problems:
1. ❌ Built QC features without testing the basic submit flow
2. ❌ Inquiry Board was designed for CRM pipeline, not manufacturing workflow
3. ❌ No concept of "what comes after presales" in the codebase
4. ❌ Sales rep has no visibility beyond Phase 3
5. ❌ Each bug fix broke something else (qty removal broke sample INSERT)

### This Plan's Safeguards:
1. ✅ **Sprint 1 = zero new features** — just fix & verify the existing flow E2E
2. ✅ **Sprint 2 = backend only** — add DB tables + API, no frontend (can't break UI)
3. ✅ **Sprint 3 = new component** — `MyPipeline.jsx` is additive, doesn't touch existing code
4. ✅ **Each sprint is independently testable** — you can stop after any sprint and it still works
5. ✅ **Existing InquiryBoard kept** — it works for its purpose, just add MyPipeline alongside
6. ✅ **Stage column is separate from status** — doesn't break any existing queries
7. ✅ **Auto-advancement happens in backend** — frontend just reads the stage, can't corrupt it

---

## Part 7: Effort Estimate

| Sprint | Scope | Days | Cumulative | Status |
|--------|-------|------|-----------|--------|
| S1 | Fix & verify existing flow | 1 | 1 | ✅ Done |
| S2 | DB schema + lifecycle API | 2 | 3 | ✅ Done |
| S3 | My Pipeline dashboard | 3 | 6 | ✅ Done |
| S4 | Quotation & Estimation | 3 | 9 | ✅ Done |
| S5 | Pre-prod sample + PI + CRM Phase 1 | 2 | 11 | ✅ Done |
| S5.1 | Bug Fix Sprint (soft-delete, stage_changed_at, lost guard) | 1 | 12 | ✅ Done |
| S6 | PI & Production handoff | 2 | 14 | 🔲 Planned |
| S7 | Delivery & Close | 1 | 15 | 🔲 Planned |
| **Total** | **Full lifecycle** | **15 days** | | |

**Recommended approach:** Complete Sprint 1-3 first (6 days). This gives you:
- Working SAR → QC → CSE flow
- Sales rep "My Pipeline" dashboard with stage tracking
- A solid foundation to build Sprints 4-7 on

---

## Part 8: What NOT to Build (Scope Control)

| Feature | Reason to Skip for Now |
|---------|----------------------|
| Full costing engine with BOM | Too complex — start with manual estimation entry |
| Automated quotation from ERP | Use simple quotation form first |
| Customer portal / self-service | Not needed — sales rep handles all customer interaction |
| Multi-currency costing | Use AED/USD only for now |
| Workflow automation engine (H-001) | Overkill — hardcoded stage transitions are simpler and less buggy |
| Visual workflow builder (from Twenty) | Not needed — fixed pipeline stages |
| Declarative notification rules (from ERPNext) | Overkill — hardcoded notifications per stage |

---

## Part 9: Questions Before Starting

1. **Estimation:** Is there already a cost estimation spreadsheet/tool used offline? If yes, we can match its format in the web form.
2. **Quotation template:** Do you have an existing quotation PDF format? If yes, share it so we replicate it.
3. **PI template:** Same question for Proforma Invoice.
4. **Pre-prod sample:** Does every inquiry require a pre-production sample, or only some? (Should it be optional?)
5. **Customer approval:** Is the customer approval always verbal (via sales rep), or do they send a written approval (email/document)?
