# Settings Restructure + Raw Materials to MES + Industry 4.0 Compliance Plan

> **Version:** 1.3  
> **Date:** 2026-03-29  
> **Author:** GitHub Copilot  
> **Status:** Implementation Complete (Phases 1-8 Delivered; operational monitoring continues; backend PDF endpoint and advanced QC matrix-driven parameter visibility intentionally deferred)  
> **Compliance Target:** Industry 4.0 / Quality 4.0 / IEC 62264 (ISA-95)
> **Execution Tracker:** ✅ Phase 1 | ✅ Phase 2 | ✅ Phase 3 | ✅ Phase 4 | ✅ Phase 5 | ✅ Phase 6 | ✅ Phase 7 | ✅ Phase 8

> **QC Reference:** `docs/QC Inspection Matrix.docx` — authoritative source for all test parameters, spec limits, and inspection levels  
> **Schema Review:** `docs/qc_rm_schema_gap_map.svg` — visual gap analysis between QC matrix and plan schema

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Industry 4.0 Gap Analysis](#3-industry-40-gap-analysis)
4. [Target Architecture](#4-target-architecture)
5. [Phase 1: Settings Restructure](#5-phase-1-settings-restructure)
6. [Phase 2: Department Consolidation](#6-phase-2-department-consolidation)
7. [Phase 3: Raw Materials to MES with Role-Based Views](#7-phase-3-raw-materials-to-mes-with-role-based-views)
8. [Phase 4: QC Incoming Raw Material Workflow](#8-phase-4-qc-incoming-raw-material-workflow)
9. [Phase 5: In-App Notification System](#9-phase-5-in-app-notification-system)
10. [Phase 6: Digital Certificate & Compliance System](#10-phase-6-digital-certificate--compliance-system)
11. [Phase 7: Backend Access Control Hardening](#11-phase-7-backend-access-control-hardening)
12. [Phase 8: Navigation & UX Updates](#12-phase-8-navigation--ux-updates)
13. [Industry 4.0 Compliance Matrix](#13-industry-40-compliance-matrix)
14. [Database Schema Summary](#14-database-schema-summary)
15. [File Inventory](#15-file-inventory)
16. [Verification Checklist](#16-verification-checklist)
17. [Decisions Log](#17-decisions-log)
18. [Future Roadmap](#18-future-roadmap)

---

## 1. Executive Summary

### Problem

Settings is a monolithic dumping ground containing 8 tabs with 20+ screens. Master data management, module-specific workflows, and admin tools are all mixed under one route with binary access control (admin vs all). Raw Materials — critical to Production, QC, Procurement, and Stores — is buried inside Settings → Master Data → Product Groups, visible only to admins.

The QC Inspection Matrix (authoritative document) defines **16 distinct material groups** with group-specific test parameters, 3 tester levels (Operator / QC Technician / QC Lab), conditional ranges, and inspection levels — none of which are reflected in the current system.

### Solution

1. **Move Master Data** out of Settings → distribute to owning modules (RM→MES, Customers→CRM, Sales Reps→CRM, AEBF→MIS)
2. **Raw Materials in MES** with role-based views per department (Production, QC, Procurement, Stores & Logistics)
3. **Full QC incoming RM workflow** aligned with the QC Inspection Matrix — new RM synced → auto-create QC sample → assign to lab → test (with 3-tier tester model: operator dock checks, QC technician, QC lab) → pass/fail/conditional → digital certificate
4. **16 material groups** from the QC Inspection Matrix (not generic categories), each with group-specific parameters, spec limits, inspection levels (L1/L2/conditional), and frequency rules
5. **Supplier tier system** — tier_1 (Preferred) / tier_2 (Approved) / tier_3 (Probationary) / suspended, driving sampling frequency and quality monitoring with KF water content trend alerts
6. **In-app notification system** leveraging existing `mes_notifications` + SSE infrastructure
7. **Digital certificates** (COA/COC) — in-system records with PDF export, full traceability, audit trail, verification-token-based public verification (no certificate number enumeration)
8. **Industry 4.0 compliance** — batch traceability, equipment linkage, SPC readiness, digital twin data model

### User Decisions

| Decision | Choice |
|----------|--------|
| RM access model | Role-based views (each department sees tailored UI) |
| QC RM testing | Full workflow (auto-create sample on sync → assign → test → verdict) |
| Settings scope | Keep Admin + Deploy + Backup inside Settings; move only Master Data |
| Test parameters | Admin-configurable from the start (per material type), sourced from QC Inspection Matrix |
| Material groups | 16 groups per QC Inspection Matrix (not generic categories) |
| Tester model | 3-tier: Operator (dock), QC Technician, QC Lab — per the QC Matrix |
| Supplier quality | Tier system with automated KF trend monitoring |
| Certificates | In-system digital records + PDF export; token-based public verification |
| Notifications | In-app notifications for new RM (future: email via Outlook) |
| Departments | Stores+Warehouse+Logistics = one; R&D+Lab+QA+QC = one; Planning under Production |

---

## 2. Current State Analysis

### 2.1 Current Settings Structure

```
Settings (current — 8 tabs, 20+ screens)
├── Company Info ─────────── admin only
│   └── Division Management, CRM Recipients, Company Details
├── Period Configuration ─── all users (dashboard column config)
├── Master Data ──────────── admin only  ← PROBLEM
│   ├── Product Groups (4 sub-tabs)
│   │   ├── Raw Materials ← should be in MES
│   │   ├── Raw Product Groups
│   │   ├── Material Percentages
│   │   └── Product Group Pricing
│   ├── Sales Rep Management ← should be in CRM
│   ├── Country Reference ← should be in Company Info
│   ├── AEBF Data ← should be in MIS
│   ├── Customer Management ← should be in CRM
│   └── System Workflow ← documentation, not a setting
├── Appearance ──────────── all users
├── Outlook Email ────────── all users
├── Database Backup ──────── admin only
├── Admin ────────────────── admin only
│   ├── Employees
│   ├── User Management
│   ├── Org Chart
│   ├── Territories
│   ├── Authorization Rules
│   └── Org Settings (Departments, Designations, Branches)
└── Deploy to VPS ────────── admin + localhost only
```

### 2.2 Current Access Control Model

```
All Authenticated Users
├── Period Configuration (personal dashboard preference)
├── Appearance (personal theme choice)
├── Outlook Email (personal integration)
└── MES (all users — role filtering inside dept views)

Admin Only (binary gate)
├── Company Info + Division Management
├── ALL Master Data (6 tabs → no dept-level access)
├── Database Backup
├── Admin (all 6 sub-tabs)
└── Deploy to VPS (localhost only)

Special Access
└── Raw Materials (admin OR production_manager OR level ≥ 6)
```

### 2.3 Current Infrastructure Assets (Reusable)

| Capability | Status | Implementation |
|------------|--------|---------------|
| QC Sample Workflow | ✅ Full | 7-step pipeline: registered → sent_to_qc → received_by_qc → testing → tested → approved/rejected |
| Test Parameters | ✅ Flexible | Category presets + JSONB + product-group-specific templates |
| Equipment Registry | ✅ Full | 8 instruments seeded, calibration tracking, usage-linking per analysis |
| CSE Dual-Approval | ✅ Full | QC Manager → Production Manager with comments & revision history |
| NCR Management | ✅ Full | Root cause → corrective/preventive actions → verification → close |
| 17-Phase Job Flow | ✅ Full | Phase engine with quality gates at phases 13 & 14 |
| Audit Trail | ✅ Full | `mes_job_activity_log` with 10 action types, who/when/from/to |
| In-App Notifications | ✅ Full | `mes_notifications` table + SSE real-time push + MESNotificationBell |
| Email Notifications | ✅ Full | SMTP (emailService.js) + QC-specific notify functions |
| PDF Generation | ✅ Full | jsPDF (client-side CSE reports) + Puppeteer (server-side dashboard exports) |
| Attachment System | ✅ Full | `mes_job_attachments` supports COA, COC, test_report types |

---

## 3. Industry 4.0 Gap Analysis

Industry 4.0 (Smart Manufacturing) and Quality 4.0 require:

| Principle | Current State | Gap | Plan |
|-----------|--------------|-----|------|
| **Digital Traceability** | Jobs tracked by SO#/WO#, phase-level audit trail | ❌ No batch/lot-level tracking for raw materials | Phase 4: `qc_rm_incoming` with batch_number, qc_lot_id, grn_reference |
| **Automated Quality Gates** | Manual QC trigger after presales sample | ❌ No automatic QC trigger on RM receipt | Phase 4: Auto-create QC sample on RM sync |
| **Real-Time Visibility** | SSE notifications + 30s auto-refresh in QC | ⚠️ Limited to QC dept, not cross-department | Phase 5: Expand notification system to all RM-interacting departments |
| **Equipment-Test Linkage** | `mes_analysis_equipment` links equipment → analysis | ⚠️ Only for presales samples, not incoming RM | Phase 4: Reuse pattern for RM QC testing |
| **Digital Certificates** | CSE PDF export with approval stamps | ❌ No in-system certificate record (COA/COC) | Phase 6: Digital certificate model with lifecycle |
| **SPC Readiness** | JSONB test results stored | ⚠️ No statistical trending, no control charts | Phase 6: Store numerical results for future SPC integration |
| **Supplier Quality** | Supplier name tracked on procurement | ❌ No supplier quality scoring or tier system | Phase 4: Supplier tier system + KF water content trend monitoring |
| **Calibration Compliance** | Equipment calibration_due field exists | ⚠️ No enforcement (can test with overdue equipment) | Phase 4: Warn/block testing with overdue equipment |
| **Paperless Workflow** | Digital forms + JSONB + PDF exports | ⚠️ COA/COC not digitally tracked in system | Phase 6: Full digital certificate lifecycle |
| **Interoperability** | Oracle ERP sync for sales data | ⚠️ RM sync exists but no GRN/PO linkage | Phase 4: Link RM incoming to GRN reference |

---

## 4. Target Architecture

### 4.1 Target Settings Structure

```
Settings (slimmed — 7 tabs)
├── Company Info ─────────── admin only
│   └── + Country Reference (moved from Master Data)
├── Period Configuration ─── all users
├── Appearance ──────────── all users
├── Outlook Email ────────── all users
├── Admin ────────────────── admin only (6 sub-tabs unchanged)
├── Database Backup ──────── admin only
└── Deploy to VPS ────────── admin + localhost
```

### 4.2 Target Module Distribution

```
CRM Module (expanded)
├── ... existing 76 components ...
├── Customer Management (from Settings Master Data)
└── Sales Rep Management (from Settings Master Data)

MIS Module (expanded)
├── ... existing dashboards ...
└── AEBF Data Management (from Settings Master Data)

MES Module (expanded)
├── Flow (17-phase tracker)
├── PreSales (inquiries, quotations, estimation)
├── QC (existing + new incoming RM workflow)
│   ├── QC Dashboard (existing)
│   ├── Sample Analysis (existing)
│   ├── CSE Approval (existing)
│   ├── NCR Management (existing)
│   └── Incoming RM Testing (NEW — auto-triggered by sync)
└── Raw Materials (NEW section — role-based views)
    ├── Admin View → sync + config + full dashboard
    ├── Production View → usage + availability + planning
    ├── Quality & Lab View → incoming RM queue + test results
    ├── Procurement View → supply + cost + reorder
    └── Stores & Logistics View → stock + receiving + dispatch
```

### 4.3 Target Access Matrix

| Feature | Admin | Manager L6+ | Production | QC/Lab | Procurement | Stores/Logistics | Operator (Dock) | Sales Rep |
|---------|-------|-------------|-----------|---------|-------------|-----------------|-----------------|-----------|
| **RM Sync Trigger** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **RM Config (groups, pricing, %)** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **RM Dashboard (full)** | ✅ | ✅ (read) | — | — | — | — | ❌ | ❌ |
| **RM Usage/Availability** | ✅ | ✅ | ✅ | — | — | — | ❌ | ❌ |
| **RM Incoming QC Queue** | ✅ | ✅ (read) | — | ✅ | — | — | ❌ | ❌ |
| **RM QC Dock-Level Tests** | — | — | — | ✅ | — | — | ✅ | ❌ |
| **RM QC Lab Tests** | — | — | — | ✅ | — | — | ❌ | ❌ |
| **RM QC Verdict** | — | — | — | ✅ (QC Mgr) | — | — | ❌ | ❌ |
| **RM Supply/Cost** | ✅ | ✅ | — | — | ✅ | — | ❌ | ❌ |
| **RM Stock/Receiving** | ✅ | ✅ | — | — | — | ✅ | ❌ | ❌ |
| **RM Test Parameters Config** | ✅ | — | — | ✅ (QC Mgr) | — | — | ❌ | ❌ |
| **Supplier Tier Management** | ✅ | — | — | ✅ (QC Mgr) | — | — | ❌ | ❌ |
| **Digital Certificates** | ✅ (all) | ✅ (read) | ✅ (read) | ✅ (create) | ✅ (read) | ✅ (read) | ❌ | ❌ |
| **Customer Mgmt (CRM)** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Sales Rep Mgmt (CRM)** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **AEBF Data (MIS)** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Settings: Company Info** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Settings: Periods** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Settings: Appearance** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Settings: Admin** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 5. Phase 1: Settings Restructure

**Goal:** Remove Master Data tab from Settings, redistribute to correct modules.

### Step 1.1: Remove Master Data Tab from Settings.jsx

- **File:** `src/components/settings/Settings.jsx`
- **Action:** Remove "Master Data" from the `TABS` array/config, remove the lazy import of `MasterDataSettings`, remove the tab panel rendering case
- **Redirect:** If URL has `?tab=masterdata`, redirect to `/mes/raw-materials` (or show a "moved" notice)

**Implementation note (2026-03-28):** Added legacy query handling in `src/components/settings/Settings.jsx` so `/settings?tab=masterdata` now redirects directly to `/mes/raw-materials`, and `/settings?tab=countries` opens Company Info with Country Reference expanded.

### Step 1.2: Move Country Reference into Company Info

- **File:** `src/components/settings/Settings.jsx`
- **Action:** Add a "Country Reference" collapsible section or sub-tab within the Company Info tab content
- **Reuse:** Import `CountryReference` component from `MasterData/` and render below company details
- **Access:** Admin only (already the case)

### Step 1.3: Move System Workflow to Help Area

- **File:** Create `src/components/common/HelpPanel.jsx`
- **Action:** `ProjectWorkflow` component becomes accessible via a help icon in the app header
- **Pattern:** Follow the `MESNotificationBell` pattern in the AppBar/Header component:
  - Add a `HelpOutline` MUI icon button in the header toolbar, positioned next to the notification bell
  - Click opens a **slide-out drawer** (not modal) from the right side with the workflow documentation
  - Existing reference: see how `MESNotificationBell` is injected into the header bar and wired to state
- **Access:** All authenticated users (it's documentation)

### Step 1.4: Retire MasterDataSettings.jsx

- **File:** `src/components/settings/MasterDataSettings.jsx`
- **Action:** Keep file but mark as deprecated with redirect logic pointing to new locations:
  - Product Groups → `/mes/raw-materials`
  - Sales Rep → CRM admin
  - Country → Settings Company Info
  - AEBF → MIS area
  - Customer → CRM admin
  - System Workflow → Help panel

### Step 1.5: Update Settings Tab Order

- **File:** `src/components/settings/Settings.jsx`
- **Final tabs (7):**
  1. Company Info (admin) — now includes Country Reference
  2. Period Configuration (all)
  3. Appearance (all)
  4. Outlook Email (all)
  5. Admin (admin) — 6 sub-tabs unchanged
  6. Database Backup (admin)
  7. Deploy to VPS (admin + localhost)
- **Update sessionStorage keys** if tab indices change

---

## 6. Phase 2: Department Consolidation

**Goal:** Align MES departments with actual organizational structure.

### Step 2.1: Consolidate Stores + Warehouse + Logistics

- **File:** `src/components/MES/WorkflowLandingPage.jsx`
- **Action:** Merge into single department: **"Stores & Logistics"**
- **Department config:**
  ```
  key: 'stores_logistics'
  label: 'Stores & Logistics'
  icon: warehouse icon
  roles: [logistics_manager, stores_keeper, warehouse_manager]
  color: existing logistics color
  ```
- **Update `ROLE_DEPT_MAP`:**
  ```
  logistics_manager  → 'stores_logistics'
  stores_keeper      → 'stores_logistics'
  warehouse_manager  → 'stores_logistics'
  ```
- **Responsibilities:** Receiving, storage, dispatch, stock management, inventory, GRN processing

### Step 2.2: Expand QC to "Quality & Lab"

- **File:** `src/components/MES/WorkflowLandingPage.jsx`
- **Action:** Rename QC department to **"Quality & Lab"**
- **Department config:**
  ```
  key: 'quality_lab'
  label: 'Quality & Lab'
  icon: existing QC icon
  roles: [quality_control, qc_manager, qc_lab, rd_engineer, lab_technician]
  ```
- **Update `ROLE_DEPT_MAP`:**
  ```
  quality_control → 'quality_lab'
  qc_manager      → 'quality_lab'
  qc_lab          → 'quality_lab'
  rd_engineer     → 'quality_lab'
  lab_technician  → 'quality_lab'
  ```
- **Quick links:** Existing QC links + new "Incoming RM" link
- **Responsibilities:** Incoming QC, process QC, final QC, R&D testing, lab analysis, NCR, equipment calibration

### Step 2.3: Add Planning Under Production

- **File:** `src/components/MES/WorkflowLandingPage.jsx`
- **Action:** Extend Production department to include Planning functions
- **Roles:** Add `production_planner` to Production dept roles
- **Quick links:** Add "Production Planning" link alongside existing Flow/Dept links
- **Responsibilities:** Production scheduling, capacity planning, material requirements planning

### Step 2.4: Update roleConstants.js

- **File:** `src/utils/roleConstants.js`
- **New/updated constants:**
  ```javascript
  // Consolidated department role groups
  export const WAREHOUSE_LOGISTICS_ROLES = ['logistics_manager', 'stores_keeper', 'warehouse_manager'];
  export const QC_LAB_ROLES = ['quality_control', 'qc_manager', 'qc_lab', 'rd_engineer', 'lab_technician'];
  export const PLANNING_ROLES = ['production_planner', 'production_manager'];

  // Operator dock-level roles (visual checks, dimensional, no lab equipment)
  export const OPERATOR_DOCK_ROLES = ['operator', 'production_operator', 'stores_keeper'];

  // Expanded RM access (all departments that interact with raw materials)
  export const RAW_MATERIALS_VIEW_ROLES = [
    'admin', 'manager', 'production_manager', 'production_planner',
    'quality_control', 'qc_manager', 'qc_lab', 'rd_engineer', 'lab_technician',
    'procurement', 'logistics_manager', 'stores_keeper', 'warehouse_manager',
    'operator', 'production_operator'
  ];

  // RM config (sync, pricing, groups) — restricted
  export const RAW_MATERIALS_ADMIN_ROLES = ['admin'];

  // QC testing roles (can create/submit lab test results)
  export const QC_TESTING_ROLES = ['quality_control', 'qc_manager', 'qc_lab', 'lab_technician'];

  // QC verdict roles (can approve/reject)
  export const QC_VERDICT_ROLES = ['qc_manager', 'admin'];
  ```

### Step 2.5: Database — Add New Roles

- **Migration:** New SQL migration to insert roles into `users` role enum or lookup table
- **New roles to register:** `warehouse_manager`, `rd_engineer`, `lab_technician`, `production_planner`, `production_operator`
- **Update:** `server/routes/auth.js` or role validation to accept new role strings

---

## 7. Phase 3: Raw Materials to MES with Role-Based Views

**Goal:** Make Raw Materials accessible in MES with department-appropriate views.

### Step 3.1: Create MES Raw Materials Route

- **File:** `src/App.jsx`
- **Action:** Add route `/mes/raw-materials` → `RawMaterialsRouter`
- **Access:** `RAW_MATERIALS_VIEW_ROLES` + managers level ≥ 6

### Step 3.2: Create Raw Materials Router Component

- **New file:** `src/components/MES/RawMaterials/RawMaterialsRouter.jsx`
- **Logic:**
  1. Read user role + designation level from `AuthContext`
  2. Map role to department view:
     - `admin` → AdminRMView
     - `manager/sales_manager` (L6+) → ManagerRMView (read-only full dashboard)
     - `production_manager/production_planner/operator` → ProductionRMView
     - `quality_control/qc_manager/qc_lab/rd_engineer/lab_technician` → QCIncomingRMView
     - `procurement/store_keeper` (procurement context) → ProcurementRMView
     - `logistics_manager/stores_keeper/warehouse_manager` → StoresRMView
  3. Render appropriate view with shared data provider

### Step 3.3: Create Shared RM Data Provider

- **New file:** `src/components/MES/RawMaterials/RawMaterialsContext.jsx`
- **Purpose:** Single data layer for all RM views — avoids duplicate API calls
- **Provides:** RM inventory data, sync status, product groups, pricing, company timezone
- **APIs:** Reuses existing `/api/{division}/master-data/raw-product-groups/combined`, RM sync endpoints

### Step 3.4: Build Admin RM View

- **New file:** `src/components/MES/RawMaterials/views/AdminRMView.jsx`
- **Content:** Full current `RawMaterials.jsx` functionality:
  - Sync trigger button
  - Full dashboard (all material categories)
  - Product group management
  - Material percentage configuration
  - Pricing management
  - Last sync timestamp in company timezone

### Step 3.5: Build Production RM View

- **New file:** `src/components/MES/RawMaterials/views/ProductionRMView.jsx`
- **Content:**
  - Material availability dashboard (stock levels per category)
  - Consumption trends (charts: usage over time)
  - BOM linkage — which materials are needed for active jobs
  - Low-stock alerts (below reorder point)
  - Material planning integration (link to active job cards)
- **Read-only:** No sync or config capabilities
- **Industry 4.0:** Real-time stock visibility for production planning

### Step 3.6: Build QC Incoming RM View

- **New file:** `src/components/MES/RawMaterials/views/QCIncomingRMView.jsx`
- **Content:** See Phase 4 below (full QC workflow integration)
- **Shows:** Pending RM test queue, assigned tests, completed tests, certificates issued

### Step 3.7: Build Procurement RM View

- **New file:** `src/components/MES/RawMaterials/views/ProcurementRMView.jsx`
- **Content:**
  - Stock levels with reorder point indicators
  - Pricing trends (average cost per material over time)
  - Supplier quality history (pass/fail rates per supplier — from QC data)
  - Supplier tier information (tier_1/tier_2/tier_3/suspended)
  - Pending orders / expected deliveries
  - Cost analysis (actual vs. budgeted material cost)
- **Industry 4.0:** Supplier quality scoring for data-driven procurement decisions

### Step 3.8: Build Stores & Logistics RM View

- **New file:** `src/components/MES/RawMaterials/views/StoresRMView.jsx`
- **Content:**
  - Current stock levels (by category, location)
  - Receiving log (recent RM arrivals with batch info)
  - Storage allocation (if applicable)
  - Dispatch records (RM sent to production)
  - FIFO compliance indicators
- **Industry 4.0:** Receiving validation — confirm batch matches PO quantity

### Step 3.9: Build Manager Read-Only View

- **New file:** `src/components/MES/RawMaterials/views/ManagerRMView.jsx`
- **Content:** Same as Admin view but with sync/config buttons hidden
- **Read-only:** Full dashboard visibility, no write operations

---

## 8. Phase 4: QC Incoming Raw Material Workflow

**Goal:** When new RM is synced, automatically create a QC inspection record. QC department tests, records results, and issues pass/fail verdict with digital certificate.

**Industry 4.0 compliance:** Full batch traceability, equipment linkage, SPC-ready numerical storage, supplier quality tracking with tier system.

### Step 4.1: Database Schema — Core Tables

**Migration file:** `migrations/sql/YYYYMMDD_001_qc_rm_incoming.up.sql`

#### Table: `qc_rm_incoming` (Incoming RM Inspection Record)

```sql
id                    SERIAL PRIMARY KEY
rm_sync_id            INTEGER                -- FK to fp_actualrmdata (nullable for manual entry)
material_code         VARCHAR(50) NOT NULL
material_name         VARCHAR(200) NOT NULL
material_type         VARCHAR(50)            -- One of 16 QC Matrix groups (see seed data)
batch_number          VARCHAR(100)           -- Supplier's declared batch/lot number (external)
qc_lot_id             VARCHAR(50) UNIQUE     -- Internal QC lot: QC-YYYY-MM-{MaterialCode}-{SEQ}
grn_reference         VARCHAR(100)           -- Goods Receipt Note number (ERP linkage)
po_reference          VARCHAR(100)           -- Purchase Order reference
supplier_name         VARCHAR(200)
supplier_code         VARCHAR(50)
received_date         DATE NOT NULL
quantity              DECIMAL(12,3) NOT NULL
unit                  VARCHAR(20) NOT NULL   -- kg, m, pcs, etc.
storage_location      VARCHAR(100)           -- Warehouse/bay assignment
qc_status             VARCHAR(20) NOT NULL DEFAULT 'pending'
                      -- pending → assigned → in_progress → passed | failed | conditional | on_hold
assigned_to           INTEGER                -- FK to users
assigned_to_name      VARCHAR(200)
assigned_date         TIMESTAMPTZ
started_at            TIMESTAMPTZ
completed_at          TIMESTAMPTZ
tested_by             INTEGER                -- FK to users
tested_by_name        VARCHAR(200)
verdict_by            INTEGER                -- QC Manager who gave final verdict
verdict_by_name       VARCHAR(200)
verdict_at            TIMESTAMPTZ
verdict_notes         TEXT
conditional_restriction TEXT                 -- Required when verdict = 'conditional'.
                                             -- E.g. "Lamination only, not food contact" or "Dry products only"
certificate_id        INTEGER                -- FK to qc_certificates (after pass)
priority              VARCHAR(10) DEFAULT 'normal'  -- low, normal, high, urgent
source                VARCHAR(20) DEFAULT 'oracle_sync'  -- oracle_sync | manual | regrind
division              VARCHAR(10) NOT NULL DEFAULT 'FP'
created_at            TIMESTAMPTZ DEFAULT NOW()
updated_at            TIMESTAMPTZ DEFAULT NOW()
```

**`qc_lot_id` generation (server-side):**
- Format: `QC-{YYYY}-{MM}-{MaterialCodePrefix}-{4-digit SEQ per month}`
- Example: `QC-2026-03-EA-0047`
- `batch_number` = supplier's declared batch/lot (external reference)
- `qc_lot_id` = auto-generated internal QC tracking ID (replaces the ambiguous `lot_number`)

**Indexes:**
- `idx_qc_rm_incoming_status` ON (qc_status)
- `idx_qc_rm_incoming_material` ON (material_code)
- `idx_qc_rm_incoming_batch` ON (batch_number)
- `idx_qc_rm_incoming_supplier` ON (supplier_code)
- `idx_qc_rm_incoming_assigned` ON (assigned_to)
- `idx_qc_rm_incoming_division_date` ON (division, received_date DESC)
- `idx_qc_rm_incoming_qc_lot` ON (qc_lot_id)

**Partial unique index (required for ON CONFLICT in auto-create logic):**
```sql
CREATE UNIQUE INDEX idx_qc_rm_incoming_sync_id
  ON qc_rm_incoming (rm_sync_id)
  WHERE rm_sync_id IS NOT NULL;
```
Manual entries have `rm_sync_id = NULL`, so the partial index allows multiple NULLs while enforcing uniqueness for Oracle-synced records.

**Verdict constraint:** The verdict endpoint MUST reject `conditional` verdict if `conditional_restriction` is empty/null.

#### Table: `qc_rm_test_parameters` (Admin-Configurable Test Specs per Material Type)

```sql
id                    SERIAL PRIMARY KEY
material_type         VARCHAR(50) NOT NULL   -- One of 16 QC Matrix groups
parameter_name        VARCHAR(100) NOT NULL  -- e.g., "Melt Flow Index", "Density", "Viscosity"
parameter_code        VARCHAR(50)            -- Machine-readable code for SPC integration
display_order         INTEGER DEFAULT 0
unit                  VARCHAR(30)            -- g/10min, g/cm³, cP, etc.
test_method           VARCHAR(100)           -- ASTM D1238, ISO 1133, etc. (Industry 4.0: method traceability)
equipment_category    VARCHAR(50)            -- Maps to mes_qc_equipment.category for auto-suggestion
inspection_level      VARCHAR(10) NOT NULL DEFAULT 'L1'  -- L1 | L2 | conditional
tested_by_role        VARCHAR(20)            -- operator | qc_technician | qc_lab
frequency             VARCHAR(50)            -- Every Roll, Every Lot, Every 5th Roll, etc.
applies_to_subtype    VARCHAR(100)           -- NULL = all sub-types; e.g. 'HS Grades', 'MET ONLY'
process_impact        TEXT                   -- production failure mode text from QC matrix
conditional_min       DECIMAL(12,4)          -- lower bound of conditional (⚠️) range
conditional_max       DECIMAL(12,4)          -- upper bound of conditional (⚠️) range
conditional_action    TEXT                   -- what to do when result is in conditional band
min_value             DECIMAL(12,4)          -- Specification lower limit
max_value             DECIMAL(12,4)          -- Specification upper limit
target_value          DECIMAL(12,4)          -- Ideal/nominal value (SPC: center line)
is_critical           BOOLEAN DEFAULT false  -- Critical-to-Quality parameter (Industry 4.0: CTQ)
is_required           BOOLEAN DEFAULT true
is_active             BOOLEAN DEFAULT true
created_by            INTEGER
updated_at            TIMESTAMPTZ DEFAULT NOW()
created_at            TIMESTAMPTZ DEFAULT NOW()
```

**Unique constraint:** `UNIQUE(material_type, parameter_name)`

> **Seed data source:** The QC Inspection Matrix.docx is the **authoritative source**. Baseline seed data is implemented in `migrations/sql/20260620_001_fp_database_qc_rm_seed_data.up.sql` and can be expanded with additional matrix rows while preserving the same 8 extended columns (inspection_level, tested_by_role, frequency, applies_to_subtype, process_impact, conditional_min, conditional_max, conditional_action).

**Seed data — 16 QC Matrix material groups:**

| # | Material Type | Key Parameters | Key Methods |
|---|--------------|----------------|-------------|
| 1 | Resins | MFI, Density, Moisture, Ash, Tensile | ASTM D1238, ISO 1183 |
| 2 | BOPP Film | Thickness (5-point), Width, Yield, COF Static/Kinetic, Tensile MD/TD, Elongation, Haze, Gloss, Dyne Level, Moisture (KF) | ASTM D2103, D1894, D882, D1003 |
| 3 | CPP Film | Thickness, Width, Seal Strength, COF, Haze, Gloss, Dyne Level | ASTM D882, F88 |
| 4 | PET Film | Thickness, Width, Tensile MD/TD, Elongation, Haze, Shrinkage, Dyne Level | ASTM D882, D2732 |
| 5 | PE Film | Thickness, Width, Dart Impact, Tear MD/TD, Tensile, Elongation, Haze | ASTM D1709, D1922, D882 |
| 6 | PA Film (Nylon) | Thickness, Width, Tensile, Elongation, Moisture (KF), O2 Transmission | ASTM D882, F1927 |
| 7 | PVC Shrink Film | Thickness, Width, Shrinkage MD/TD, Tensile, Haze | ASTM D2732, D882 |
| 8 | Aluminium Foil | Thickness (caliper), Width, Pinhole Count, Wettability, Tensile | ASTM B209, D4541 |
| 9 | Paper & Foil Laminates | Basis Weight, Thickness, Bond Strength, Moisture, Printability | TAPPI T410, T411 |
| 10 | Adhesives | Viscosity, Solid Content, pH, Bond Strength, Open Time, Pot Life | ASTM D2196, ISO 3251 |
| 11 | Masterbatch & Additives | Active Content, Moisture, Particle Size, Dispersion, MFI Carrier Check | Per additive spec |
| 12 | Solvents & Chemicals | Purity, pH, Specific Gravity, Flash Point, Water Content (KF), Colour | Various per chemical |
| 13 | Heat Seal Lacquer | Viscosity, Solid Content, Seal Strength, Adhesion, Clarity | ASTM D2196, F88 |
| 14 | Tapes | Adhesion Strength, Thickness, Shore Hardness, Elongation | ASTM D3330 |
| 15 | Packing Materials | Thickness, Tensile Strength, Burst Strength, Tear Resistance | ASTM D882, D774 |
| 16 | Regrind / PIR | MFI, Contamination (visual), Colour Consistency, Moisture, Food Contact Eligibility | ASTM D1238, FDA 21 CFR |

#### Table: `qc_rm_test_results` (Individual Test Measurements)

```sql
id                    SERIAL PRIMARY KEY
incoming_id           INTEGER NOT NULL       -- FK to qc_rm_incoming
parameter_id          INTEGER NOT NULL       -- FK to qc_rm_test_parameters
replicate_number      INTEGER DEFAULT 1      -- measurement replicate index (1, 2, 3...)
measurement_point     VARCHAR(50)            -- e.g., "Left edge", "Center", "Right edge", "Roll 5", "Roll 10"
measured_value        DECIMAL(12,4)          -- Numerical result (SPC-ready)
measured_text         VARCHAR(200)           -- Non-numerical result (e.g., "Clear, no visible defects")
pass_fail             VARCHAR(15) NOT NULL   -- pass | fail | marginal | not_tested
equipment_id          INTEGER                -- FK to mes_qc_equipment (Industry 4.0: equipment linkage)
equipment_code        VARCHAR(50)            -- Denormalized for reporting
test_conditions       VARCHAR(200)           -- e.g., "23°C, 50% RH" (Industry 4.0: environment tracking)
tested_by             INTEGER NOT NULL       -- FK to users
tested_at             TIMESTAMPTZ DEFAULT NOW()
notes                 TEXT
```

**Note:** Several QC matrix tests require **multiple measurements per parameter per lot** (e.g., thickness at 5 points across width, dyne level every 5th roll). The `replicate_number` and `measurement_point` columns support this. Avg/min/max are computed at reporting time from replicate measurements.

**Indexes:**
- `idx_qc_rm_results_incoming` ON (incoming_id)
- `idx_qc_rm_results_parameter` ON (parameter_id)
- `idx_qc_rm_results_incoming_param` ON (incoming_id, parameter_id) — **non-unique**, for lookups

**No UNIQUE constraint** on (incoming_id, parameter_id) — replicates are expected.

#### Table: `qc_rm_activity_log` (Audit Trail — Industry 4.0 Compliance)

```sql
id                    SERIAL PRIMARY KEY
incoming_id           INTEGER NOT NULL       -- FK to qc_rm_incoming
action                VARCHAR(30) NOT NULL   -- created, assigned, started, results_recorded,
                                             -- verdict_passed, verdict_failed, verdict_conditional,
                                             -- certificate_issued, reopened, comment, calibration_warning
from_status           VARCHAR(20)
to_status             VARCHAR(20)
performed_by          INTEGER NOT NULL       -- FK to users
performed_by_name     VARCHAR(200) NOT NULL
details               TEXT
metadata              JSONB                  -- Extensible: reason codes, environmental data
created_at            TIMESTAMPTZ DEFAULT NOW()
```

**Index:** `idx_qc_rm_activity_incoming` ON (incoming_id, created_at DESC)

#### Table: `qc_supplier_tiers` (Supplier Quality Tier System)

```sql
CREATE TABLE qc_supplier_tiers (
  id                SERIAL PRIMARY KEY,
  supplier_code     VARCHAR(50) NOT NULL UNIQUE,
  supplier_name     VARCHAR(200),
  tier              VARCHAR(20) NOT NULL DEFAULT 'tier_2',  -- tier_1 (Preferred) | tier_2 (Approved) | tier_3 (Probationary) | suspended
  tier_reason       TEXT,                                   -- reason for current tier
  tier_assigned_at  TIMESTAMPTZ DEFAULT NOW(),
  tier_assigned_by  INTEGER,                                -- FK to users
  review_due_date   DATE,
  pass_rate_90d     DECIMAL(5,2),                           -- calculated: pass rate over rolling 90 days
  total_lots_tested INTEGER DEFAULT 0,
  last_ncr_date     DATE,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
```

**Tier semantics:**
- `tier_1` (Preferred) — reduced sampling frequency, track record of consistent quality
- `tier_2` (Approved) — standard sampling, default for all known suppliers
- `tier_3` (Probationary) — 100% inspection, recent NCRs or quality issues
- `suspended` — material from this supplier not accepted until review

**Seed:** All known suppliers default to `tier_2`. QC Manager promotes/demotes manually based on NCR history and pass rates.

**Tier-driven sampling:** tier_1 = reduced sampling, tier_2 = standard, tier_3 = 100% inspection. Sampling frequency displayed on QC Incoming RM form.

### Step 4.2: Backend API — QC Incoming RM Routes

**New file:** `server/routes/mes/qc-incoming-rm.js`

| Method | Endpoint | Purpose | Access |
|--------|----------|---------|--------|
| GET | `/api/mes/qc/incoming-rm` | List incoming RM (filter: status, material_type, date, supplier, assigned_to) | RAW_MATERIALS_VIEW_ROLES |
| GET | `/api/mes/qc/incoming-rm/:id` | Detail with test results + activity log | RAW_MATERIALS_VIEW_ROLES |
| GET | `/api/mes/qc/incoming-rm/stats` | Dashboard stats (pending, in_progress, passed, failed counts) | RAW_MATERIALS_VIEW_ROLES |
| GET | `/api/mes/qc/incoming-rm/supplier-quality` | Supplier pass/fail rates + KF trend alerts (see below) | Procurement + QC + Admin |
| POST | `/api/mes/qc/incoming-rm` | Manual entry (for RM not from Oracle sync, or regrind with `source: 'regrind'`) | QC_TESTING_ROLES + Admin |
| POST | `/api/mes/qc/incoming-rm/:id/assign` | Assign to lab user | QC_VERDICT_ROLES |
| POST | `/api/mes/qc/incoming-rm/:id/start` | Begin testing (set in_progress) | QC_TESTING_ROLES |
| POST | `/api/mes/qc/incoming-rm/:id/results/dock` | Submit dock-level results (visual, dimensional). Access: OPERATOR_DOCK_ROLES + QC_TESTING_ROLES | OPERATOR_DOCK_ROLES + QC_TESTING_ROLES |
| POST | `/api/mes/qc/incoming-rm/:id/results/lab` | Submit lab test results (equipment + method required). Access: QC_TESTING_ROLES only | QC_TESTING_ROLES |
| POST | `/api/mes/qc/incoming-rm/:id/verdict` | Pass/fail/conditional decision (conditional requires conditional_restriction) | QC_VERDICT_ROLES |
| POST | `/api/mes/qc/incoming-rm/:id/reopen` | Reopen for re-testing | QC_VERDICT_ROLES |
| GET | `/api/mes/qc/rm-parameters` | List test parameters (filter by material_type) | All RM roles |
| POST | `/api/mes/qc/rm-parameters` | Create parameter | Admin + QC Manager |
| PUT | `/api/mes/qc/rm-parameters/:id` | Update parameter | Admin + QC Manager |
| DELETE | `/api/mes/qc/rm-parameters/:id` | Soft-delete (is_active=false) | Admin |
| GET | `/api/mes/qc/supplier-tiers` | List all supplier tiers | QC + Procurement + Admin |
| PUT | `/api/mes/qc/supplier-tiers/:code` | Update supplier tier (promote/demote) | QC_VERDICT_ROLES (QC Manager + Admin) |

**Dock vs Lab result submission:**
- The parameter's `tested_by_role` field determines which endpoint accepts it:
  - `tested_by_role = 'operator'` → accepted by `/results/dock`
  - `tested_by_role = 'qc_technician'` or `'qc_lab'` → accepted by `/results/lab` only
- Dock-level tests: visual checks, width, weight, core ID (no lab equipment needed)
- Lab tests: MFI, COF, seal tests, etc. (specialized equipment required)

**Supplier quality endpoint — KF water content trend monitoring:**

The `GET /api/mes/qc/incoming-rm/supplier-quality` endpoint includes:
- Rolling 3-lot window trend analysis for KF (Karl Fischer) water content by supplier + material type
- If water content shows increasing trend over 3 consecutive lots → flag for increased sampling
- Implementation: computed at query time using window functions over `qc_rm_test_results` joined with `qc_rm_test_parameters` WHERE `parameter_code = 'KF_WATER'`
- Response includes: `kf_trend_alerts: [{ supplier, material_type, trend: 'increasing', last_3_values: [...] }]`

**Middleware for all routes:**
- `authenticate` (JWT validation)
- `requireAnyRole(RAW_MATERIALS_VIEW_ROLES)` or specific role per endpoint
- Division validation (`['FP','HC']`)
- Rate limiting

### Step 4.3: Auto-Create QC Records on RM Sync

**File:** `server/routes/rm-sync/` (existing sync completion handler)

**Logic after successful RM sync:**
1. Query newly synced materials (compare `fp_actualrmdata` before/after sync or use sync batch ID)
2. For each new/changed material:
   ```sql
   INSERT INTO qc_rm_incoming (
     rm_sync_id, material_code, material_name, material_type,
     received_date, quantity, unit, qc_status, qc_lot_id, division
   ) VALUES (...)
   ON CONFLICT (rm_sync_id) DO NOTHING  -- Uses partial unique index idx_qc_rm_incoming_sync_id
   ```
   The `ON CONFLICT (rm_sync_id)` clause relies on the partial unique index `idx_qc_rm_incoming_sync_id` defined in Step 4.1.
3. Generate `qc_lot_id` server-side: `QC-{YYYY}-{MM}-{MaterialCodePrefix}-{4-digit SEQ per month}`
4. Log activity: `action='created', details='Auto-created from RM sync'`
5. **Trigger notification** to QC department (Phase 5)

**Batch detection logic:**
- If `batch_number` is available in Oracle data → use it
- If not → leave `batch_number` NULL (supplier batch is external — we don't fabricate it)
- `qc_lot_id` is always auto-generated (internal tracking)
- Link to `grn_reference` if available in sync data

**Implementation note (2026-03-28):** Enhanced `server/routes/rmSync.js` auto-create flow to extract supplier/batch/GRN/PO metadata from dynamic Oracle payload keys (`to_jsonb(fp_actualrmdata)`), seed `qc_supplier_tiers` as `tier_2` during sync, and include authenticated role guards on RM sync read/status routes.

### Step 4.4: Equipment Calibration Enforcement (Industry 4.0)

**File:** `server/routes/mes/qc-incoming-rm.js` — in the results submission endpoints (both dock and lab)

**Logic:**
1. When test results include `equipment_id`, check `mes_qc_equipment.calibration_due`
2. If `calibration_due < TODAY`:
   - Return warning: `"Equipment {code} calibration overdue since {date}. Results flagged."`
   - Still allow submission but mark result with `metadata: { calibration_warning: true }`
   - Log in activity: `action='calibration_warning'`
3. Frontend displays calibration status badge on equipment selection

### Step 4.5: Frontend — QC Incoming RM Component

**New file:** `src/components/MES/QC/QCIncomingRM.jsx`

**Implementation note (2026-03-28):** Implemented in `src/components/MES/RawMaterials/views/QCIncomingRMView.jsx` with integrated queue, detail drawer, regrind entry, supplier quality monitoring panel, tier update actions, replicate/measurement-point capture, and optional test-condition capture (stored in result metadata).

**UI Layout:**
1. **Header stats bar:** Pending (badge), In Progress, Passed Today, Failed Today
2. **Filter bar:** Status dropdown, Material Type, Date Range, Supplier, Assigned To
3. **Main table:** Incoming RM list with columns:
   - Material Code, Material Name, Type, Batch#, QC Lot ID, Supplier
   - Received Date, Quantity, Status (color-coded badge)
   - Assigned To, Priority
   - Actions: Assign, Start Test, View Results, Verdict
4. **Detail drawer/modal:** Opens on row click:
   - Material info header (with supplier tier badge)
   - Test parameters auto-grouped by `inspection_level`:
     - **L1** parameters shown by default (always tested)
     - **L2** parameters in an expandable section (secondary tests)
     - **Conditional** parameters shown only when `applies_to_subtype` matches the material's sub-type
   - Parameters sectioned by `tested_by_role`:
     - **Top section:** Operator dock checks (visual, dimensional) — accessible to OPERATOR_DOCK_ROLES
     - **Middle section:** QC Technician tests (dyne, thickness, caliper)
     - **Bottom section:** QC Lab tests (MFI, COF, seal tests — specialized equipment)
   - **Multi-point measurement UI:** For parameters with frequency like "5 points across width", render N input fields in a row with `measurement_point` labels (e.g., "Left edge", "Center-left", "Center", "Center-right", "Right edge")
   - Equipment selection per parameter (dropdown from `mes_qc_equipment`)
   - Numerical input fields with spec limits shown (red/green/amber validation for conditional ranges)
   - Verdict section (QC Manager only): Pass / Fail / Conditional + notes + conditional_restriction (required for conditional)
   - Activity timeline (audit trail)
   - Certificate generation button (after pass)

**Implementation scope note (2026-03-29):** Current production UI remains role-based (operator dock vs qc_technician/qc_lab sections). Full dynamic visibility/grouping by `inspection_level` and `applies_to_subtype` is intentionally deferred to a later phase.

### Step 4.6: Frontend — Test Parameters Admin

**New file:** `src/components/MES/QC/QCTestParametersAdmin.jsx`

**Implementation note (2026-03-28):** Implemented in `src/components/MES/RawMaterials/views/QCParameterAdminPanel.jsx` and embedded inside the QC incoming workflow screen with role-gated create/edit/deactivate actions.

**UI:**
- Material type selector (tabs or dropdown — all 16 QC Matrix groups)
- Parameter CRUD table per material type with columns:
  - Name, Code, Unit, Test Method, Min, Target, Max, CTQ flag, Required flag, Active flag
  - **New columns:** Inspection Level (L1/L2/conditional), Frequency, Tested By Role (operator/qc_technician/qc_lab), Applies To Subtype, Conditional Min/Max/Action, Process Impact
  - Add/Edit/Delete (soft) with confirmation
  - Drag-and-drop reorder (display_order)
- Equipment category auto-suggestion per parameter
- Import/export parameter templates (Excel)

**Access:** Admin + QC Manager (qc_manager role)

### Step 4.7: Regrind / PIR Workflow

**Goal:** Regrind is INTERNAL material — it never comes from Oracle sync, always manual entry.

**Entry point:**
- Dedicated **"Log Regrind Batch"** button in both:
  - Production RM View (`ProductionRMView.jsx`)
  - QC Incoming RM view (`QCIncomingRM.jsx`)
- Creates a `qc_rm_incoming` record with `source: 'regrind'` and `material_type: 'Regrind / PIR'`

**Manual entry API:** `POST /api/mes/qc/incoming-rm` with `source: 'regrind'` flag in the request body.

**9 tests per QC matrix (seeded in `qc_rm_test_parameters` for material_type = 'Regrind / PIR'):**

| # | Parameter | Level | Tested By | Method |
|---|-----------|-------|-----------|--------|
| 1 | MFI (Melt Flow Index) | L1 | qc_lab | ASTM D1238 |
| 2 | Contamination (visual) | L1 | operator | Visual inspection |
| 3 | Colour Consistency (visual) | L1 | operator | Visual comparison to standard |
| 4 | Moisture Content | L1 | qc_lab | Karl Fischer / oven method |
| 5 | Gel Count | L2 | qc_lab | Film blow test + count |
| 6 | Odour | L1 | operator | Organoleptic |
| 7 | Film Blow Test | L2 | qc_technician | Blow test line |
| 8 | Density | L2 | qc_lab | ASTM D792 |
| 9 | Food Contact Eligibility | L1 | qc_lab | FDA 21 CFR evaluation |

**Critical constraint — Food Contact Eligibility:**
- This is the CRITICAL test for regrind batches
- If the regrind origin is **unknown** OR from **printed material**, the verdict endpoint MUST:
  - **Block** `passed` verdict for food-contact usage
  - **Force** `conditional` verdict with restriction: `"Non-food-contact use only"`
- The `conditional_restriction` field (on `qc_rm_incoming`) captures this
- Implementation: verdict endpoint checks `material_type = 'Regrind / PIR'` AND food_contact_eligibility result → enforces conditional if not explicitly cleared

---

## 9. Phase 5: In-App Notification System

**Goal:** Notify relevant departments when new RM arrives for QC testing. Leverages existing `mes_notifications` table + SSE infrastructure.

### Step 5.1: Expand Notification Triggers

**File:** `server/services/emailService.js` + new notification helper

**New notification events:**

| Event | Recipients | Channel | Message |
|-------|-----------|---------|---------|
| New RM synced | QC department (all QC_LAB_ROLES) | In-app + SSE | "New raw material received: {material_name} (Batch: {batch}). QC inspection required." |
| RM assigned to you | Specific QC user | In-app + SSE | "RM inspection assigned: {material_name} (Batch: {batch})" |
| QC verdict: Passed | Stores & Logistics, Procurement, Production | In-app | "RM approved: {material_name} (Batch: {batch}). Ready for production use." |
| QC verdict: Failed | Stores & Logistics, Procurement | In-app | "RM rejected: {material_name} (Batch: {batch}). Do not use. See QC report." |
| QC verdict: Conditional | Production Manager, Procurement | In-app | "RM conditional approval: {material_name} (Batch: {batch}). Restriction: {conditional_restriction}" |
| Certificate issued | All RM departments | In-app | "COA issued for {material_name} (Batch: {batch}). Certificate #{cert_number}" |
| Equipment calibration due | QC Manager | In-app (daily check) | "Equipment {code} calibration due in {N} days" |
| KF trend alert | QC Manager, Procurement | In-app | "Increasing moisture trend for {supplier} {material_type} over last 3 lots" |

### Step 5.2: Notification Helper Service

**New file:** `server/services/rmNotificationService.js`

**Implementation note (2026-03-28):** Implemented `server/services/rmNotificationService.js` and integrated triggers in `server/routes/rmSync.js` and `server/routes/mes/qc-incoming-rm.js` for new RM sync/manual entry, assignment, verdict outcomes, calibration warnings, and KF trend alerts.

**Functions:**
- `notifyNewRMReceived(incomingRecord)` — inserts notifications for all QC users
- `notifyRMAssigned(incomingRecord, assignedUserId)` — single user notification
- `notifyRMVerdict(incomingRecord, verdict)` — department-based notification
- `notifyCertificateIssued(incomingRecord, certificateRecord)` — all RM departments
- `notifyKFTrendAlert(alertData)` — KF moisture trend alerts to QC Manager + Procurement
- Uses existing `mes_notifications` table + `sseManager.broadcast()` for real-time push

### Step 5.3: Email Notifications (Future Extension)

**File:** `server/services/emailService.js`

**Future additions (not blocking, can be phased):**
- `notifyQCNewRMByEmail(incomingRecord)` — email to `QC_LAB_EMAIL` env var
- `notifyRMVerdictByEmail(incomingRecord, verdict)` — email to department heads
- Reuse existing nodemailer + SMTP infrastructure
- Template: HTML email with material details, batch info, action link

---

## 10. Phase 6: Digital Certificate & Compliance System

**Goal:** QC pass → auto-generate digital Certificate of Analysis (COA) that lives IN the system as a first-class record, with PDF export. Full traceability, revision history, digital signatures.

**Industry 4.0 compliance:** Digital paperless certificates, full audit trail, SPC-ready data storage, equipment linkage, enumeration-proof public verification.

### Step 6.1: Database Schema — Certificate Tables

**Implementation note (2026-03-28):** Added migration pair `migrations/sql/20260619_001_fp_database_qc_certificates.up.sql` and `.down.sql` with `qc_certificates`, `qc_certificate_revisions`, `qc_cert_seq`, and `qc_rm_incoming.certificate_id` linkage.

**Certificate number sequence (race-condition-proof):**

```sql
CREATE SEQUENCE qc_cert_seq START 1;
-- Usage in certificate insert:
-- certificate_number = 'COA-' || division || '-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' || LPAD(nextval('qc_cert_seq')::TEXT, 5, '0')
```

Using a PostgreSQL SEQUENCE prevents race conditions when two concurrent requests try to issue certificates simultaneously (vs. app-side number generation with MAX+1).

#### Table: `qc_certificates` (Digital Certificate Record)

```sql
id                    SERIAL PRIMARY KEY
certificate_number    VARCHAR(50) NOT NULL UNIQUE  -- COA-FP-2026-00042 (via qc_cert_seq)
verification_token    VARCHAR(32) NOT NULL UNIQUE  -- crypto.randomBytes(16).toString('hex')
certificate_type      VARCHAR(20) NOT NULL         -- COA (Analysis) | COC (Conformance) | COT (Testing)
incoming_id           INTEGER NOT NULL             -- FK to qc_rm_incoming
material_code         VARCHAR(50) NOT NULL
material_name         VARCHAR(200) NOT NULL
material_type         VARCHAR(50)
batch_number          VARCHAR(100)
qc_lot_id             VARCHAR(50)
supplier_name         VARCHAR(200)
supplier_code         VARCHAR(50)
division              VARCHAR(10) NOT NULL DEFAULT 'FP'
-- Test Summary
test_summary          JSONB NOT NULL               -- Snapshot of all test results at time of issuance
parameters_tested     INTEGER NOT NULL             -- Count of parameters tested
parameters_passed     INTEGER NOT NULL             -- Count that passed
overall_result        VARCHAR(20) NOT NULL         -- passed | conditional
conditions            TEXT                         -- Conditions for conditional approval
-- Dates
received_date         DATE NOT NULL
tested_date           DATE NOT NULL
issued_date           DATE NOT NULL DEFAULT CURRENT_DATE
valid_until           DATE                         -- Optional expiry
-- Signatories (Digital Signatures — Industry 4.0)
tested_by             INTEGER NOT NULL             -- FK to users
tested_by_name        VARCHAR(200) NOT NULL
approved_by           INTEGER NOT NULL             -- FK to users (QC Manager)
approved_by_name      VARCHAR(200) NOT NULL
approved_at           TIMESTAMPTZ NOT NULL
-- Lifecycle
status                VARCHAR(20) NOT NULL DEFAULT 'active'
                      -- active | superseded | revoked | expired
revision_number       INTEGER NOT NULL DEFAULT 1
supersedes_id         INTEGER                      -- FK to self (previous version)
revoked_by            INTEGER
revoked_at            TIMESTAMPTZ
revocation_reason     TEXT
-- Metadata
pdf_path              VARCHAR(500)                 -- Path to generated PDF (optional)
metadata              JSONB                        -- Extensible: environmental conditions, equipment list
created_at            TIMESTAMPTZ DEFAULT NOW()
updated_at            TIMESTAMPTZ DEFAULT NOW()
```

**`verification_token`:** 32-character hex string generated via `crypto.randomBytes(16).toString('hex')`. Used for public verification URLs instead of the predictable certificate number. This prevents enumeration attacks — an attacker cannot guess valid verification URLs by incrementing certificate numbers.

**Indexes:**
- `idx_qc_cert_number` ON (certificate_number)
- `idx_qc_cert_token` ON (verification_token)
- `idx_qc_cert_incoming` ON (incoming_id)
- `idx_qc_cert_batch` ON (batch_number)
- `idx_qc_cert_material` ON (material_code)
- `idx_qc_cert_supplier` ON (supplier_code)
- `idx_qc_cert_status` ON (status)

#### Table: `qc_certificate_revisions` (Revision History — Industry 4.0 Audit)

```sql
id                    SERIAL PRIMARY KEY
certificate_id        INTEGER NOT NULL             -- FK to qc_certificates
revision_number       INTEGER NOT NULL
action                VARCHAR(30) NOT NULL         -- issued | revised | superseded | revoked | expired
test_summary_snapshot JSONB                        -- Full state at revision
actor_id              INTEGER NOT NULL
actor_name            VARCHAR(200) NOT NULL
reason                TEXT
created_at            TIMESTAMPTZ DEFAULT NOW()
```

### Step 6.2: Backend API — Certificate Routes

**New file:** `server/routes/mes/qc-certificates.js`

**Implementation note (2026-03-28):** Implemented certificate endpoints in `server/routes/mes/qc-certificates.js`, mounted in `server/config/express.js`, and added shared issuance/revision/revoke logic in `server/services/qcCertificateService.js`.

| Method | Endpoint | Purpose | Access |
|--------|----------|---------|--------|
| GET | `/api/mes/qc/certificates` | List certificates (filter: type, material, supplier, status, date) | All RM roles |
| GET | `/api/mes/qc/certificates/:id` | Certificate detail + revision history | All RM roles |
| GET | `/api/mes/qc/certificates/:id/pdf` | Reserved payload endpoint (backend file generation deferred; UI uses client-side PDF export) | All RM roles |
| POST | `/api/mes/qc/certificates` | Issue certificate (from approved incoming) | QC_VERDICT_ROLES |
| POST | `/api/mes/qc/certificates/:id/revise` | Create new revision | QC_VERDICT_ROLES |
| POST | `/api/mes/qc/certificates/:id/revoke` | Revoke certificate | Admin + QC Manager |
| GET | `/api/mes/qc/certificates/verify/:verificationToken` | Public verification endpoint (for external parties) — uses opaque token, not certificate number | Public (no auth) |

### Step 6.3: Auto-Issue Certificate on QC Pass

**File:** `server/routes/mes/qc-incoming-rm.js` — in the verdict endpoint

**Implementation note (2026-03-28):** Auto-issue is wired in the verdict endpoint for `passed` and `conditional` outcomes using `issueCertificateForIncoming` and emits certificate-issued notifications.

**Logic when verdict = 'passed' or 'conditional':**
1. Create `qc_certificates` record:
   - Certificate number via PG SEQUENCE: `'COA-' || division || '-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' || LPAD(nextval('qc_cert_seq')::TEXT, 5, '0')`
   - Generate `verification_token`: `crypto.randomBytes(16).toString('hex')`
   - Snapshot all test results from `qc_rm_test_results` into `test_summary` JSONB
   - Set signatories: tested_by + approved_by (verdict user)
2. Link back: `UPDATE qc_rm_incoming SET certificate_id = {new_cert_id}`
3. Log in `qc_certificate_revisions`: action='issued'
4. Log in `qc_rm_activity_log`: action='certificate_issued'
5. Trigger notification to all RM departments (Phase 5)

### Step 6.4: Certificate PDF Generation

**Implementation note (2026-03-28):** Added client-side COA PDF utility `src/utils/generateCOAPdf.js` (jsPDF + jspdf-autotable) and wired PDF download action in `src/components/MES/RawMaterials/views/QCCertificatePanel.jsx`.

**Decision note (2026-03-29):** Keep client-side PDF generation as the active production behavior. Backend file-generation via `GET /api/mes/qc/certificates/:id/pdf` is intentionally deferred.

**New file:** `src/utils/generateCOAPdf.js`

**PDF Layout (using jsPDF + jspdf-autotable):**

```
┌─────────────────────────────────────────────────────────┐
│  [Company Logo]     CERTIFICATE OF ANALYSIS             │
│                     Certificate No: COA-FP-2026-00042   │
│                     Date: 2026-03-28                    │
│                     Revision: 1                         │
├─────────────────────────────────────────────────────────┤
│  Material: Polyethylene Film (LDPE)                     │
│  Code: RM-PE-001                                        │
│  Batch: SUP-2026-A001 | QC Lot: QC-2026-03-PE-0047     │
│  Supplier: ABC Polymers LLC                             │
│  GRN: GRN-2026-0042 | PO: PO-2026-0103                │
│  Received: 2026-03-28 | Tested: 2026-03-28             │
├─────────────────────────────────────────────────────────┤
│  TEST RESULTS                                           │
│  ┌──────────────┬──────┬────────┬─────────┬──────────┐  │
│  │ Parameter    │ Unit │ Spec   │ Result  │ Status   │  │
│  ├──────────────┼──────┼────────┼─────────┼──────────┤  │
│  │ Thickness    │ μm   │ 25±2   │ 25.3    │ PASS     │  │
│  │ Tensile MD   │ MPa  │ ≥20    │ 23.5    │ PASS     │  │
│  │ Haze         │ %    │ ≤8     │ 4.2     │ PASS     │  │
│  │ COF Static   │ -    │ 0.2-0.4│ 0.31    │ PASS     │  │
│  └──────────────┴──────┴────────┴─────────┴──────────┘  │
│                                                         │
│  Overall Result: PASSED (4/4 parameters)                │
│  Equipment Used: EQ-TG-001, EQ-TST-001, EQ-HZ-001     │
│  Test Conditions: 23°C, 50% RH (ASTM standard)        │
├─────────────────────────────────────────────────────────┤
│  DIGITAL SIGNATURES                                     │
│                                                         │
│  Tested by: Ahmed Al Farsi           Date: 2026-03-28  │
│  Role: QC Lab Technician                               │
│                                                         │
│  Approved by: Sarah Chen             Date: 2026-03-28  │
│  Role: QC Manager                                      │
│                                                         │
│  Verify: propackhub.com/verify/a3f9b2c1e4d7...         │
├─────────────────────────────────────────────────────────┤
│  This is a digitally generated certificate.             │
│  ProPackHub Quality Management System v26.4             │
└─────────────────────────────────────────────────────────┘
```

**Note:** The verification URL uses the opaque `verification_token`, NOT the certificate number. The human-readable certificate number (COA-FP-2026-00042) is displayed on the PDF for reference, but the verification link uses the token to prevent enumeration.

### Step 6.5: Frontend — Certificate Viewer & Browser

**New file:** `src/components/MES/QC/CertificateBrowser.jsx`

**UI:**
- Certificate list table: Number, Type, Material, Batch, QC Lot, Supplier, Status, Date, Actions
- Filter: type, status, material, supplier, date range
- Detail view: Full certificate with all test results + revision history timeline
- Actions: Download PDF, Revise, Revoke (QC Manager), Share verification link (token-based URL)
- Status badges: Active (green), Superseded (yellow), Revoked (red), Expired (gray)

**Implementation note (2026-03-28):** Delivered via `src/components/MES/RawMaterials/views/QCCertificatePanel.jsx` (embedded in RM QC workspace) with list/search filters, detail drawer, PDF export, and complete revise/revoke actions wired to certificate APIs.

### Step 6.6: Public Verification Endpoint

**File:** `server/routes/mes/qc-certificates.js`

**Endpoint:** `GET /api/mes/qc/certificates/verify/:verificationToken`
- No authentication required (used by external parties / customers)
- Lookup by `verification_token` (opaque 32-char hex), **not** by certificate number
- Returns: certificate_number, material_name, batch_number, overall_result, issued_date, status, tested_by_name, approved_by_name
- Does NOT return: full test results (proprietary), verification_token (already known to caller)
- Rate limited: 10 requests/minute per IP
- Example URL: `propackhub.com/verify/a3f9b2c1e4d78a6b...` instead of `propackhub.com/verify/COA-FP-2026-00042`

---

## 11. Phase 7: Backend Access Control Hardening

### Step 7.1: Create requireAnyRole Middleware

**Implementation note (2026-03-28):** Added shared middleware `server/middleware/requireAnyRole.js` with OR semantics (`roles OR minLevel`) and optional `minLevelRoles` filtering.

**New file:** `server/middleware/requireAnyRole.js`

```javascript
// Usage: requireAnyRole(['admin', 'qc_manager'], { minLevel: 6 })
// Semantics: OR — user passes if they have ANY of the listed roles OR their designation_level >= minLevel
// This is intentionally OR, not AND. A QC Manager at level 4 still passes via role match.
// If both roles and minLevel are provided, either condition is sufficient.
```

### Step 7.2: Apply Role Guards to All RM Routes

**Implementation note (2026-03-28):** Applied shared role guards in `server/routes/rmSync.js`, `server/routes/mes/qc-incoming-rm.js`, and `server/routes/mes/qc-certificates.js`, including authenticated access for RM sync endpoints.

| Route Group | Middleware |
|------------|-----------|
| RM sync trigger | `requireAnyRole(RAW_MATERIALS_ADMIN_ROLES)` |
| RM config (groups, pricing, %) | `requireAnyRole(RAW_MATERIALS_ADMIN_ROLES)` |
| RM data/dashboard | `requireAnyRole(RAW_MATERIALS_VIEW_ROLES, { minLevel: 6 })` |
| QC incoming list/detail | `requireAnyRole(RAW_MATERIALS_VIEW_ROLES)` |
| QC incoming assign | `requireAnyRole(QC_VERDICT_ROLES)` |
| QC dock-level results | `requireAnyRole([...OPERATOR_DOCK_ROLES, ...QC_TESTING_ROLES])` |
| QC lab results | `requireAnyRole(QC_TESTING_ROLES)` |
| QC incoming verdict | `requireAnyRole(QC_VERDICT_ROLES)` |
| Test parameters CRUD | `requireAnyRole(['admin', 'qc_manager'])` |
| Supplier tiers list | `requireAnyRole([...QC_TESTING_ROLES, 'procurement', 'admin'])` |
| Supplier tiers update | `requireAnyRole(QC_VERDICT_ROLES)` |
| Certificate list/detail/PDF | `requireAnyRole(RAW_MATERIALS_VIEW_ROLES)` |
| Certificate create/revise/revoke | `requireAnyRole(QC_VERDICT_ROLES)` |
| Certificate verify (public) | No auth (rate limited, token-based) |

### Step 7.3: Apply Role Guards to Moved Master Data

**Implementation note (2026-03-28):** Added authentication + senior-role guards for moved master-data backends in `server/routes/customerMaster.js`, `server/routes/salesReps.js`, and `server/routes/aebf/index.js`; also corrected country admin write guards in `server/routes/countries.js` to use `requireAnyRole(['admin'])`.

| Route Group | Middleware |
|------------|-----------|
| Customer Management | `requireAnyRole(CRM_FULL_ACCESS_ROLES)` |
| Sales Rep Management | `requireAnyRole(CRM_FULL_ACCESS_ROLES)` |
| AEBF Data | `requireAnyRole(MIS_ROLES, { minLevel: 6 })` |
| Country Reference | `requireAnyRole(['admin'])` |

---

## 12. Phase 8: Navigation & UX Updates

### Step 8.1: Update MES WorkflowLandingPage

**Implementation note (2026-03-28):** Updated `src/components/MES/WorkflowLandingPage.jsx` quick links for Incoming RM queue, QC test parameters, QC certificates, supplier quality/tier view, and regrind logging path.

- **File:** `src/components/MES/WorkflowLandingPage.jsx`
- **Add "Raw Materials" section** — new card with department-specific quick links:
  - Admin: "RM Dashboard", "Sync RM", "Configure"
  - Production: "Material Availability", "Usage Dashboard", "Log Regrind Batch"
  - QC: "Incoming RM Queue", "Test Parameters", "Certificates", "Supplier Tiers"
  - Procurement: "Stock Levels", "Supplier Quality"
  - Stores: "Receiving", "Current Stock"
- **Update department configs** for consolidated departments (Steps 2.1–2.3)

### Step 8.2: Update CRM Navigation

**Implementation note (2026-03-28):** Added CRM management navigation in `src/components/CRM/CRMModule.jsx` with a new `Management` tab/route (`/crm/management`) for admin/management users, combining Customer Management and Sales Rep Management views.

- **File:** CRM navigation component (likely `src/components/CRM/CRMModule.jsx` or similar)
- **Add "Management" sub-nav** visible to `CRM_FULL_ACCESS_ROLES`:
  - Customer Management → `CustomerMerging.jsx`
  - Sales Rep Management → `SalesRepManagement`

### Step 8.3: Update MIS Navigation

**Implementation note (2026-03-28):** Added AEBF management entry in `src/components/dashboard/Dashboard.jsx` as a dedicated home card (`AEBF Management`) and view route to existing `AEBFTab`.

- **File:** MIS/Dashboard area navigation
- **Add "AEBF Management"** link accessible to `MIS_ROLES` level ≥ 6
- Reuses existing `AEBFTab` component

### Step 8.4: Update Module Selector

**Implementation note (2026-03-28):** Updated MES card description text in `src/components/modules/ModuleSelector.jsx` to reflect Raw Materials + Quality & Lab scope.

- **File:** `src/components/modules/ModuleSelector.jsx`
- **Update MES card description** to mention "Raw Materials, Production Flow, Quality & Lab"
- No new homepage module cards needed

### Step 8.5: Update App.jsx Routes

- **File:** `src/App.jsx`
- **Add routes:**
  - `/mes/raw-materials` → `RawMaterialsRouter`
  - `/mes/qc/incoming-rm` → `QCIncomingRM`
  - `/mes/qc/test-parameters` → `QCTestParametersAdmin`
  - `/mes/qc/certificates` → `CertificateBrowser`
- **Add role guards** using `ProtectedRoute` with appropriate role arrays

**Implementation note (2026-03-28):** Added MES route aliases in `src/components/MES/index.jsx` for `/mes/qc/incoming-rm`, `/mes/qc/test-parameters`, and `/mes/qc/certificates` routed into the RM QC workspace.

---

## Parallelization Notes

The 8 phases have the following dependency graph. Independent phases can be developed in parallel by different developers.

| Phase | Can Start | Depends On | Notes |
|-------|-----------|------------|-------|
| **Phase 1** (Settings restructure) | Immediately | — | Different files from all other phases |
| **Phase 2** (Department consolidation) | Immediately | — | Different files from Phase 1; can run in parallel |
| **Phase 3** (RM Views frontend) | After Phase 2 | Phase 2 | Needs consolidated department keys and role constants |
| **Phase 4** (QC workflow DB + backend) | Immediately | — | Database + backend only; can start in parallel with Phases 1-3 |
| **Phase 5** (Notifications) | After Phase 4 | Phase 4 | Needs `incoming_id` records to notify about |
| **Phase 6** (Certificates) | After Phase 4 | Phase 4 | Needs verdict to trigger certificate generation |
| **Phase 7** (Access control) | Immediately | — | Middleware is standalone; can start in parallel with everything |
| **Phase 8** (Navigation) | After Phases 1-3 | Phases 1, 2, 3 | Needs new routes and components to exist |

**Recommended parallel tracks:**
- **Track A:** Phase 1 → Phase 8 (frontend settings + nav)
- **Track B:** Phase 2 → Phase 3 (departments + RM views)
- **Track C:** Phase 4 → Phase 5 → Phase 6 (QC backend pipeline)
- **Track D:** Phase 7 (standalone middleware, merge last)

---

## 13. Industry 4.0 Compliance Matrix

| Industry 4.0 Principle | Implementation | Status |
|------------------------|---------------|--------|
| **Digital Traceability** | Every RM batch tracked from receipt → QC → certificate → production usage. `batch_number`, `qc_lot_id`, `grn_reference`, `po_reference` fields. Full activity log per incoming record. | Planned |
| **Equipment Linkage** | Test results linked to specific equipment via `equipment_id`. Reuses existing `mes_qc_equipment` with calibration tracking. Calibration overdue warnings during testing. | Planned |
| **Automated Quality Gates** | RM sync auto-creates QC incoming records. No manual step between receiving and QC queue. Quality status gates material entry into production. | Planned |
| **Real-Time Visibility** | SSE notifications for new RM, assignment, and verdicts. Department-specific dashboards with live data. Cross-department visibility of QC status. | Planned |
| **SPC Readiness** | `measured_value` stored as DECIMAL for all numerical tests. `target_value`, `min_value`, `max_value` per parameter. `parameter_code` for machine-readable identification. Multi-point replicate storage for statistical analysis. Ready for control chart generation. | Planned |
| **Digital Certificates** | In-system COA/COC records with revision history, digital signatures, and PDF export. Token-based public verification endpoint (enumeration-proof). | Planned |
| **Supplier Quality Management** | Supplier tier system (tier_1/tier_2/tier_3/suspended) with tier-driven sampling frequency. KF water content trend monitoring with rolling 3-lot window. Pass/fail rates from QC data. | Planned |
| **Supplier Tier Management** | `qc_supplier_tiers` table with tier history, pass rate tracking, NCR linkage. Tiers drive sampling: tier_1 = reduced, tier_2 = standard, tier_3 = 100%. QC Manager promotes/demotes based on data. | Planned |
| **Paperless Workflow** | Complete digital flow: sync → auto-create → assign → test → verdict → certificate. No paper forms required. Attachment system for supporting documents. | Planned |
| **Audit Trail** | `qc_rm_activity_log` tracks every action with timestamp, actor, from/to status. `qc_certificate_revisions` tracks certificate lifecycle. | Planned |
| **Interoperability** | Oracle ERP sync for material data. GRN/PO reference fields for ERP linkage. REST API for all operations. Public verification API (token-based). | Planned |
| **Role-Based Access** | Granular role matrix: 7 access levels including operator dock-level, separate config vs. view vs. test vs. verdict permissions. Server-side enforcement via middleware. | Planned |
| **CTQ Parameters** | `is_critical` flag on test parameters. Critical-to-Quality parameters highlighted in UI and certificates. Failure of CTQ parameter auto-flags batch. | Planned |
| **Environmental Tracking** | `test_conditions` field per test result (temperature, humidity). Enables environmental impact analysis on results. | Planned |
| **FIFO Enforcement** | Stores view shows received_date for FIFO compliance. QC status gates material availability. | Planned |
| **Calibration Compliance** | Equipment calibration_due checked before test submission. Overdue equipment flagged in results and on certificate. | Planned |
| **3-Tier Tester Model** | Tests assigned by role: Operator (dock), QC Technician, QC Lab. Separate submission endpoints enforce role-appropriate testing. | Planned |

### Existing Assets Already Industry 4.0 Compliant

- 17-phase workflow with `mes_job_activity_log` (10 action types)
- Equipment registry with calibration tracking (8 instruments seeded)
- NCR system (root cause → corrective → preventive → verification)
- CSE dual-approval workflow with revision history
- Attachment system supporting COA, COC, test_report types

---

## 14. Database Schema Summary

### New Tables (8)

| Table | Database | Purpose | Rows Estimate |
|-------|----------|---------|--------------|
| `qc_rm_incoming` | fp_database | Incoming RM inspection records | 500-2000/year |
| `qc_rm_test_parameters` | fp_database | Admin-configurable test specs (16 material groups) | 200-500 parameters |
| `qc_rm_test_results` | fp_database | Individual test measurements (with replicates) | 5000-25000/year |
| `qc_rm_activity_log` | fp_database | Audit trail for RM QC | 5000-20000/year |
| `qc_certificates` | fp_database | Digital COA/COC records | 500-2000/year |
| `qc_certificate_revisions` | fp_database | Certificate revision history | 500-3000/year |
| `qc_supplier_tiers` | fp_database | Supplier quality tier tracking | 50-200 suppliers |

### New Sequences (1)

| Sequence | Database | Purpose |
|----------|----------|---------|
| `qc_cert_seq` | fp_database | Race-condition-proof certificate number generation |

### Modified Tables

No existing tables modified — all new tables are additive.

### New Roles (5)

`warehouse_manager`, `rd_engineer`, `lab_technician`, `production_planner`, `production_operator`

---

## 15. File Inventory

### New Files (~28)

**Frontend Components:**
- `src/components/MES/RawMaterials/RawMaterialsRouter.jsx`
- `src/components/MES/RawMaterials/RawMaterialsContext.jsx`
- `src/components/MES/RawMaterials/views/AdminRMView.jsx`
- `src/components/MES/RawMaterials/views/ManagerRMView.jsx`
- `src/components/MES/RawMaterials/views/ProductionRMView.jsx`
- `src/components/MES/RawMaterials/views/QCIncomingRMView.jsx`
- `src/components/MES/RawMaterials/views/ProcurementRMView.jsx`
- `src/components/MES/RawMaterials/views/StoresRMView.jsx`
- `src/components/MES/QC/QCIncomingRM.jsx`
- `src/components/MES/QC/QCTestParametersAdmin.jsx`
- `src/components/MES/QC/CertificateBrowser.jsx`
- `src/utils/generateCOAPdf.js`
- `src/components/common/HelpPanel.jsx`

**Backend:**
- `server/routes/mes/qc-incoming-rm.js`
- `server/routes/mes/qc-certificates.js`
- `server/services/rmNotificationService.js`
- `server/middleware/requireAnyRole.js`

**Migrations:**
- `migrations/sql/20260618_001_fp_database_qc_incoming_rm_workflow.up.sql` — creates `qc_rm_incoming`, `qc_rm_test_parameters`, `qc_rm_test_results`, `qc_rm_activity_log`, `qc_supplier_tiers`, indexes, and partial unique index on `rm_sync_id`
- `migrations/sql/20260618_001_fp_database_qc_incoming_rm_workflow.down.sql`
- `migrations/sql/20260619_001_fp_database_qc_certificates.up.sql` — creates `qc_cert_seq`, `qc_certificates` (with `verification_token`), `qc_certificate_revisions`, and incoming-certificate linkage
- `migrations/sql/20260619_001_fp_database_qc_certificates.down.sql`
- `migrations/sql/20260620_001_fp_database_qc_rm_seed_data.up.sql` — seeds 16 QC Matrix material groups, all 9 Regrind/PIR tests, and supplier tier baseline (`tier_2`)
- `migrations/sql/20260620_001_fp_database_qc_rm_seed_data.down.sql`

> **Note:** The QC Inspection Matrix.docx is the authoritative source. The current baseline seed is in `migrations/sql/20260620_001_fp_database_qc_rm_seed_data.up.sql`; extend it as needed so every matrix test row is represented with all 8 extended columns: `inspection_level`, `tested_by_role`, `frequency`, `applies_to_subtype`, `process_impact`, `conditional_min`, `conditional_max`, `conditional_action`.

### Modified Files (~15)

| File | Change |
|------|--------|
| `src/components/settings/Settings.jsx` | Remove Master Data tab, add Country Reference to Company Info, reorder tabs |
| `src/components/settings/MasterDataSettings.jsx` | Deprecate with redirect logic |
| `src/components/MES/WorkflowLandingPage.jsx` | Add RM section, update dept configs, consolidate departments |
| `src/utils/roleConstants.js` | Add new role groups (including OPERATOR_DOCK_ROLES), expand RM access constants |
| `src/App.jsx` | Add /mes/raw-materials, /mes/qc/* routes |
| `src/components/modules/ModuleSelector.jsx` | Update MES card description |
| `server/routes/rm-sync/` | Hook for auto-creating QC records on sync (uses partial unique index) |
| `server/routes/rmSync.js` | Enrich auto-created QC records with supplier/batch/GRN/PO metadata and tier seeding |
| `server/routes/mes/qc-incoming-rm.js` | Auto-infer pass/fail/conditional status from specs and store test-condition metadata |
| `server/routes/mes/presales/index.js` | Register new QC incoming RM + supplier tier routes |
| `src/components/MES/RawMaterials/views/QCIncomingRMView.jsx` | Replicate + measurement-point capture, supplier tier badge, test-condition inputs |
| `src/components/MES/RawMaterials/views/QCSupplierQualityPanel.jsx` | Tier-based sampling guidance display |
| `src/components/MES/RawMaterials/views/ProcurementRMView.jsx` | Embed supplier quality/tier panel for procurement users |
| `src/components/MES/RawMaterials/views/QCCertificatePanel.jsx` | Add revise workflow UI and API integration |
| CRM navigation component | Add Management sub-nav |
| MIS/Dashboard navigation | Add AEBF Management link |
| Header/AppBar component | Add HelpPanel (HelpOutline icon, slide-out drawer — MESNotificationBell pattern) |

---

## 16. Verification Checklist

### Settings Restructure
- [x] Master Data tab removed from Settings
- [x] Country Reference accessible from Company Info
- [x] System Workflow accessible from Help area (slide-out drawer via HelpOutline icon, MESNotificationBell pattern)
- [x] Settings shows only: Company Info, Period Config, Appearance, Outlook, Admin, Backup, Deploy
- [x] All existing Settings functionality preserved (no data loss)

### Department Consolidation
- [x] "Stores & Logistics" appears as single department in MES
- [x] "Quality & Lab" appears as expanded department in MES
- [x] Planning links visible under Production
- [x] New roles (`warehouse_manager`, `rd_engineer`, `lab_technician`, `production_planner`, `production_operator`) work in auth system

### Raw Materials Access
- [x] Admin: full sync + config in MES → Raw Materials
- [x] Production Manager: usage/availability view in MES → Raw Materials
- [x] QC Manager: incoming RM queue + testing in MES → Raw Materials
- [x] Procurement: supply/cost view in MES → Raw Materials
- [x] Stores/Logistics: stock/receiving view in MES → Raw Materials
- [x] Manager L6+: read-only full dashboard in MES → Raw Materials
- [x] Sales Rep: CANNOT see Raw Materials at all
- [x] Server-side role guards enforced on ALL RM endpoints

### QC Incoming RM Workflow
- [x] RM sync → auto-creates pending QC records (via partial unique index on rm_sync_id)
- [x] QC sees new RM in incoming queue with auto-generated qc_lot_id
- [x] QC Manager can assign to lab technician
- [x] Tester can start test, select equipment, enter results
- [x] Multi-point measurement supported (replicate_number + measurement_point for 5-point thickness, etc.)
- [x] Pass/fail auto-calculated from spec limits (including conditional range checks)
- [x] QC Manager can give verdict (pass/fail/conditional)
- [x] Conditional verdict REQUIRES conditional_restriction text (server-side enforced)
- [x] Equipment calibration checked during testing
- [x] Full audit trail logged for all actions

### Operator Dock-Level Tests
- [x] Operator/production_operator/stores_keeper roles can submit dock-level results via `/results/dock`
- [x] Lab results restricted to QC_TESTING_ROLES via `/results/lab`
- [x] `tested_by_role` on parameter determines which endpoint accepts it
- [ ] Full dynamic UI behavior for `inspection_level` + `applies_to_subtype` filtering is deferred (current behavior stays role-based)

### Regrind / PIR Workflow
- [x] "Log Regrind Batch" button visible in Production RM View and QC Incoming view
- [x] Manual entry creates `qc_rm_incoming` with `source: 'regrind'`
- [x] All 9 regrind tests seeded in parameters (MFI, Contamination, Colour, Moisture, Gel Count, Odour, Film Blow, Density, Food Contact)
- [x] Food contact eligibility: verdict endpoint blocks `passed` for unknown/printed-origin regrind, forces `conditional` with "Non-food-contact use only"

### Supplier Tiers
- [x] `qc_supplier_tiers` table seeded with all known suppliers as tier_2
- [x] QC Manager can promote/demote supplier tiers via API
- [x] Tier displayed on QC Incoming RM form and Procurement view
- [x] Tier drives sampling frequency display

### KF Trend Alerts
- [x] Supplier quality endpoint returns `kf_trend_alerts` array
- [x] Rolling 3-lot window analysis for KF water content by supplier + material
- [x] Increasing trends flagged for increased sampling

### Notifications
- [x] QC notified (in-app + SSE) when new RM synced
- [x] Specific user notified when RM assigned to them
- [x] All RM departments notified on QC verdict
- [x] Certificate issuance notified to all RM departments
- [x] KF trend alerts sent to QC Manager + Procurement

### Digital Certificates
- [x] Certificate auto-created on QC pass
- [x] Certificate number generated via PostgreSQL SEQUENCE (race-condition-proof)
- [x] Verification token (32-char hex) generated and stored per certificate
- [x] Test results snapshot stored in certificate
- [x] PDF export with company branding, test table, digital signatures, token-based verification URL
- [ ] Backend file-generation for `GET /api/mes/qc/certificates/:id/pdf` is deferred (current production uses client-side PDF export)
- [x] Certificate revision workflow (revise, revoke)
- [x] Public verification endpoint uses `verification_token` (NOT certificate number)
- [x] Certificate number enumeration not possible via public endpoint
- [x] Certificate browser UI with filter/search

### Industry 4.0
- [x] Batch/qc_lot_id tracking on all incoming RM
- [x] 16 QC Matrix material groups seeded (not 8 generic)
- [x] Equipment-test linkage recorded
- [x] Calibration warnings for overdue equipment
- [x] SPC-ready numerical storage (DECIMAL values + spec limits + replicates)
- [x] CTQ parameters flagged
- [x] Environmental conditions recorded
- [x] GRN/PO references linked
- [x] Complete audit trail on all QC actions

### CRM & MIS
- [x] Customer Management accessible from CRM admin area
- [x] Sales Rep Management accessible from CRM admin area
- [x] AEBF Data accessible from MIS area
- [x] All moved features have correct role guards

---

## 17. Decisions Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Settings keeps Admin + Deploy + Backup | User preference — admin tools are system operations, belong together |
| 2 | Stores + Warehouse + Logistics = one department | User request — these are one organizational unit in Interplast |
| 3 | R&D + Lab + QA + QC = one "Quality & Lab" department | User request — lab testing and quality are one team |
| 4 | Planning under Production | User request — production planners work within the production dept |
| 5 | Country Reference moves to Company Info | Countries are company-level config, not module-specific master data |
| 6 | System Workflow → Help/About | It's documentation, not a setting |
| 7 | Test parameters admin-configurable from day 1 | User requirement — different material types need different test specs |
| 8 | Digital certificates in-system + PDF export | User requirement — certificates must live in system (not just PDF files) for Industry 4.0 |
| 9 | In-app notifications first, email later | Existing infrastructure supports in-app + SSE; email is a future extension |
| 10 | Public certificate verification endpoint | Industry 4.0 requirement — external parties can verify certificate authenticity |
| 11 | New roles added (5) rather than overloading existing | Clean separation of responsibilities, avoids permission confusion |
| 12 | All new tables in fp_database | Business data belongs in fp_database; auth DB only for auth/config |
| 13 | 16 QC Matrix material groups (not 8 generic) | QC Inspection Matrix.docx defines 16 specific groups with distinct parameter sets. Generic categories would lose critical test specificity (e.g., BOPP vs CPP vs PET films have different parameters). |
| 14 | Replicate measurements for multi-point tests | QC Matrix requires thickness at 5 points across width, dyne every 5th roll, etc. A UNIQUE(incoming_id, parameter_id) constraint would block this. Replicates stored with measurement_point labels; avg/min/max computed at reporting time. |
| 15 | PostgreSQL SEQUENCE for certificate numbers | App-side MAX+1 generation has race conditions under concurrent requests. A database sequence guarantees uniqueness without application-level locking. |
| 16 | Verification token for certificate enumeration protection | Certificate numbers (COA-FP-2026-00042) are sequential and predictable. Public verification uses an opaque 32-char hex token instead, preventing enumeration of valid certificates by external parties. |
| 17 | Regrind is always manual entry (never Oracle sync) | Regrind is internal material generated from production waste. Has dedicated workflow with food-contact eligibility as critical gate. Source field distinguishes regrind from synced RM. |
| 18 | Keep certificate PDF generation client-side for now | Existing `generateCOAPdf.js` flow is stable in production and already used by the certificate panel. Backend file-generation endpoint remains intentionally deferred. |
| 19 | Keep current QC Incoming parameter visibility behavior | Current role-based dock/lab sections are sufficient for now. Advanced inspection_level and subtype-driven filtering will be delivered in a later phase. |

---

## 18. Future Roadmap

Items deliberately excluded from this plan but noted for future implementation:

### Short-Term (Next 1-2 Sprints)
- **Email notifications for RM events** — extend existing SMTP/Outlook integration
- **SPC control charts** — use stored numerical data (including replicates) to generate X-bar, R-chart, Cp/Cpk
- **Supplier quality scorecard** — aggregate pass/fail data + tier history into supplier rating dashboard
- **Automated tier promotion/demotion** — auto-suggest tier changes based on rolling pass rate thresholds
- **Backend certificate PDF endpoint** — implement server-side file-generation for `/api/mes/qc/certificates/:id/pdf`
- **QC matrix-driven parameter visibility** — implement `inspection_level` and `applies_to_subtype` dynamic filtering/grouping in QC Incoming UI

### Medium-Term (Next Quarter)
- **Batch-level production traceability** — link `qc_rm_incoming.qc_lot_id` through production phases to finished goods
- **Material Requirements Planning (MRP)** — Production planning view with BOM-based material demand calculation
- **Automated reorder alerts** — When stock falls below reorder point, auto-create procurement request
- **QC mobile interface** — Responsive/PWA QC testing for tablet use on factory floor (especially dock-level operator tests)

### Long-Term (Industry 4.0 Full Stack)
- **IoT sensor integration** — Auto-capture test measurements from connected instruments
- **Digital twin** — Real-time material flow visualization through factory
- **AI-powered quality prediction** — Predict QC outcomes from material/supplier/environmental data
- **Blockchain traceability** — Immutable audit trail for regulatory compliance
- **ERP bidirectional sync** — Push QC results back to Oracle ERP

---

> **End of Plan Document**  
> Version 1.3 — Implementation completed with final verification checklist evidence, RM sync auto-QC enrichment, seed data migration, supplier-tier sampling guidance, and certificate revision workflow.  
> 2026-03-29 decision captured: keep client-side PDF generation and current role-based QC parameter visibility; advanced enhancements deferred to roadmap.  
> Operational monitoring continues in normal release cycle.
