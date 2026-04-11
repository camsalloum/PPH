# MES — Manufacturing Execution System
## Implementation Progress Tracker
**Project:** Interplast – Flexible Packaging  
**Division:** FP  
**Started:** February 19, 2026  
**Last Updated:** February 19, 2026 — Session 3

---

## 📋 Overview

The MES module covers the complete **17-phase flexible packaging production workflow**, broken into 5 major stages:

| Stage | Phases | Status |
|-------|--------|---------|
| **Stage 1 — Pre-Sales** | 1–5 (Inquiry → Registration → Tech Spec → MOQ → Material Check) | ✅ Complete |
| **Stage 2 — Quotation & Order** | 6–8 | ⏳ Pending |
| **Stage 3 — Pre-Production** | 9–10 (parallel) | ⏳ Pending |
| **Stage 4 — Production & QC** | 11–14 (critical gates) | ⏳ Pending |
| **Stage 5 — Delivery & Close** | 15–17 | ⏳ Pending |

---

## 🏗 Architecture Decision

- **MES WorkflowLandingPage** → visual reference layer (read-only, all 17 phases)
- **CRM Module** → functional data layer (each stage has interactive forms + tracking)
- **Pre-Sales = CRM Inquiries sub-module** — each sales rep sees only their own inquiries; Admins/Managers see all
- **Sales reps identified by `sales_rep_groups.group_name`** (fp_database, division = FP)

### Sales Rep Groups (Interplast FP)

| ID | Group Name |
|----|------------|
| 13 | Alfred Barakat |
| 14 | Christopher Dela Cruz |
| 4 | James & Rania |
| 15 | Lokeshwaran Dhandapani |
| 16 | Mohamed Adel |
| 17 | Mohamed Fawzi |
| 5 | Narek Koroukian |
| 2 | Others |
| 18 | Rahil Asif |
| 1 | Riad & Nidal |
| 3 | Sofiane & Team |
| 6 | Sojy & Direct Sale |
| 20 | Ziad Al Houseini |

### Access Control — Roles
| Role value | Who | CRM Access |
|---|---|---|
| `admin` | Admin | Full — all reps, all data |
| `manager` | GM / Divisional Manager | Full — all reps, all data |
| `sales_manager` | Sales Manager | Full — all reps, all data |
| `sales_coordinator` | Sales Coordinator | Full — all reps, all data |
| `sales_rep` / others | Sales Representative | Own group only |

**Enforced on:** `GET /customers`, `GET /customers/map`, `GET /customers/:id`, `GET /customers/:id/sales-history`, `GET /prospects`, `GET /prospects/metrics`, all Pre-Sales APIs.

---

## ✅ Stage 1 — Pre-Sales

### Phase 1: Customer Inquiry / RFQ Capture

| Component | File | Status | Tested |
|-----------|------|--------|--------|
| DB Table: `mes_presales_inquiries` | `server/migrations/mes-presales-001-inquiries.js` | ✅ Done | ⬜ |
| DB: `fp_prospects` enriched (migration 002) | `server/migrations/mes-presales-002-prospects-unify.js` | ✅ Done | ⬜ |
| API: GET /api/mes/presales/inquiries | `server/routes/mes/presales.js` | ✅ Done | ⬜ |
| API: POST /api/mes/presales/inquiries | `server/routes/mes/presales.js` | ✅ Done | ⬜ |
| API: GET /api/mes/presales/inquiries/:id | `server/routes/mes/presales.js` | ✅ Done | ⬜ |
| API: PATCH /api/mes/presales/inquiries/:id/status | `server/routes/mes/presales.js` | ✅ Done | ⬜ |
| API: POST /api/mes/presales/inquiries/:id/prospect | `server/routes/mes/presales.js` | ✅ Done | ⬜ |
| API: PATCH /api/mes/presales/prospects/:id | `server/routes/mes/presales.js` | ✅ Done | ⬜ |
| API: PATCH /api/mes/presales/prospects/:id/approve | `server/routes/mes/presales.js` | ✅ Done | ⬜ |
| API: PATCH /api/mes/presales/prospects/:id/reject | `server/routes/mes/presales.js` | ✅ Done | ⬜ |
| API: GET /api/mes/presales/sales-reps | `server/routes/mes/presales.js` | ✅ Done | ⬜ |
| Frontend: NewCustomerModal (4-field) | `src/components/MES/PreSales/NewCustomerModal.jsx` | ✅ Done | ⬜ |
| Frontend: InquiryCapture (3-step wizard) | `src/components/MES/PreSales/InquiryCapture.jsx` | ✅ Done | ⬜ |
| Frontend: InquiryBoard (Kanban) | `src/components/MES/PreSales/InquiryBoard.jsx` | ✅ Done | ⬜ |
| Frontend: InquiryDetail | `src/components/MES/PreSales/InquiryDetail.jsx` | ✅ Done | ⬜ |
| CRM: Inquiries tab wired | `src/components/CRM/CRMModule.jsx` | ✅ Done | ⬜ |
| MES: Phase 1–5 clickable (→ /crm/inquiries) | `src/components/MES/WorkflowLandingPage.jsx` | ✅ Done | ⬜ |

### Inquiry Flow Logic
```
Sales Rep logs inquiry
      │
      ├── Source: Manager Tip | Customer Visit | Website | Exhibition
      │           Phone/WhatsApp/Email | Referral | Prospect List | Other
      │
      ▼
Customer Type?
      ├── NEW Company         → Fill Customer Registration mini-form (pending Manager approval)
      ├── EXISTING Customer   → Search from fp_customer_master
      └── FROM PROSPECT list  → Select from my prospects (budget customers)
      │
      ▼
Inquiry Details: Product Group(s) | Estimated Qty | Notes | Priority
      │
      ▼
Status: New → In Progress → Customer Registered → Qualified → Converted / Lost / On Hold
```

### Inquiry Status Kanban Columns
| Column | Color | Description |
|--------|-------|-------------|
| 🆕 New | Blue | Just logged, no action taken |
| 🔄 In Progress | Orange | Rep working on it |
| 📋 Registered | Purple | Customer registration submitted/approved |
| ✅ Qualified | Green | All pre-sales checks passed |
| 🏆 Converted | Teal | Became a Sales Order |
| ❌ Lost | Red | Not won |
| ⏸ On Hold | Grey | Paused |

### DB Tables / Schema
```sql
-- fp_database (division = 'FP', tenant = Interplast Flexible Packaging)
mes_presales_inquiries          -- inquiry records (has prospect_id FK → fp_prospects)
fp_prospects                    -- single source of truth for all prospects
                                -- enriched by migration 002 with:
                                --   mobile_number, telephone_number, contact_name, contact_email
                                --   source ('budget'|'inquiry'|'direct')
                                --   approval_status ('pending'|'approved'|'rejected')
                                --   approved_by, approved_at, rejection_reason
-- (mes_presales_customer_registrations was dropped in migration 002)
```

### New Customer Flow ("New Company" path)
```
Sales Rep selects "New Company" in wizard Step 1
      → "Register New Company Details" button opens NewCustomerModal
      → 4 fields: Company Name*, Country (dropdown), Mobile*, Telephone
      → Saved locally in wizard formData as new_prospect object
      → On wizard submit → POST /api/mes/presales/inquiries
          includes new_prospect → atomically creates fp_prospects record
          (source='inquiry', approval_status='pending') + links prospect_id
      → In InquiryDetail → Prospect panel shows 4 fields
      → Admin clicks Approve → prospect_approval_status='approved' + inquiry → 'qualified'
```

---

## ⏳ Stage 2 — Quotation & Order
*Not started yet*

---

## ⏳ Stage 3 — Pre-Production
*Not started yet*

---

## ⏳ Stage 4 — Production & QC
*Not started yet*

---

## ⏳ Stage 5 — Delivery & Close
*Not started yet*

---

## 📝 Change Log

| Date | Version | Change |
|------|---------|--------|
| 2026-02-19 | v0.1 | MES implementation tracker created |
| 2026-02-19 | v0.2 | Stage 1 Phase 1 DB + API + InquiryCapture + InquiryBoard built |
| 2026-02-19 | v0.3 | InquiryDetail + CSS + index.jsx complete; wired into CRM as Pre-Sales tab |
| 2026-02-19 | v0.4 | MES WorkflowLandingPage: PRE-SALES swimlane + detail panel → /crm/inquiries clickable |
| 2026-02-19 | v0.5 | CRM tabs responsive (fluid, scroll on tablet/mobile, icons-only on small screens) |
| 2026-02-19 | v0.6 | Full access control audit: added FULL_ACCESS_ROLES, secured /customers/map, /customers/:id, /customers/:id/sales-history (all missing authenticate), /prospects + /prospects/metrics server-side filtering. Fixed non-existent 'management' role across all files. |
| 2026-02-19 | v0.7 | Migration 002 run: enriched fp_prospects with mobile_number, telephone_number, contact_name, contact_email, source, approval_status fields; added prospect_id FK to mes_presales_inquiries; dropped mes_presales_customer_registrations (redundant with fp_prospects). |
| 2026-02-19 | v0.8 | New Customer modal flow implemented: NewCustomerModal.jsx created (4 fields, country dropdown from /api/countries/list); InquiryCapture wizard uses modal for 'new' customer type; presales.js API refactored to prospect endpoints (POST /inquiries/:id/prospect, PATCH /prospects/:id, /approve, /reject); InquiryDetail prospect panel replaces old registration panel. |
