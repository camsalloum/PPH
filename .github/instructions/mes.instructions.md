---
description: "Use when working on MES module: pre-sales inquiries, QC lab, job cards, production flow, procurement, NCR, estimation, quotations."
applyTo: ["src/components/MES/**", "server/routes/mes/**"]
---
# MES Module Context

## Status: Active Development
MES is the newest module — not all features are production-stable.

## Structure
- **Frontend**: `src/components/MES/` — subfolders: `PreSales/`, `QC/`, `Flow/`, `shared/`, plus `WorkflowLandingPage`
- **Backend routes**: `server/routes/mes/flow.js` + `server/routes/mes/presales/` (30 route files)
- **Presales routes** include: inquiries, quotations, quotation-approval, samples, qc, qc-analysis, qc-inbox, qc-cse, estimation, jobCards, procurement, proforma, customerPO, orders, ncr, pipeline, analytics, prospects, equipment, templates, lookups, activities, attachments, checks, cse, preprod

## Key Tables (all in `fp_database`)
- `mes_presales_inquiries` — inquiry/RFQ tracking
- `mes_presales_samples` — sample management for QC
- `mes_workflow_phases` — workflow phase definitions
- `mes_job_tracker` — job card tracking
- `mes_job_phases` — phase execution within jobs
- `mes_job_activity_log` — activity audit trail

## Workflow
1. **Pre-Sales Inquiry** → customer inquiry/RFQ registered
2. **Estimation** → specs, material calc, cost estimation
3. **Quotation** → generated from estimation, approval workflow
4. **Sample/QC** → sample created, QC lab analysis, pass/fail
5. **Job Card** → production job tracking through phases
6. **Procurement** → material ordering for approved jobs
7. **NCR** → non-conformance reporting during production

## Key Patterns
- MES roles: `QC_ROLES` (quality_control, qc_manager, qc_lab), `PRODUCTION_ROLES` (production_manager, operator), `ACCOUNTS_ROLES` (accounts_manager, accountant)
- MES-only users skip MIS/CRM providers on login (auth-token guards in providers)
- Shared UI components in `src/components/MES/shared/`

## History
- See `docs/_backup/MES_IMPLEMENTATION_PROGRESS.md`, `PRESALES_QC_MASTER_PLAN.md`
