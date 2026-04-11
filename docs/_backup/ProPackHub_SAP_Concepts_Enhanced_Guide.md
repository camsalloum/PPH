# SAP Concepts Enhanced — ProPackHub Implementation Reference

> **Document Purpose**: This guide documents how ProPackHub SaaS implements and enhances proven SAP S/4HANA production planning concepts — specifically adapted for flexible packaging manufacturers and any manufacturing tenant.
>
> **Key Principle**: SAP S/4HANA is the conceptual backbone (MRP, BOM, costing variants, variance analysis, process orders). ProPackHub takes those battle-tested concepts and reimplements them as a modern, touch-first, multi-tenant SaaS web application — without SAP's complexity, licensing cost, or implementation timeline.
>
> **Source Material**:
> - Production Planning with SAP S/4HANA — Jawad Akhtar (Rheinwerk, 985pp)
> - Mastering SAP S/4HANA 1709 — Nitin Gupta (Packt, 617pp)
> - W&H VAREX II Blown Film Extrusion Blueprint (PE Blown Film BOM, Costing & Variance Concept)
> - ProPackHub Source Code v26.2 (React + Express + PostgreSQL)
>
> **Version**: 2.0 | March 2026
> **Platform**: ProPackHub SaaS — Multi-tenant manufacturing ERP/MES/CRM

---

## TABLE OF CONTENTS

**PART 1 — FOUNDATION**
1. [What ProPackHub Is](#1-what-propackhub-is)
2. [SAP → ProPackHub Concept Map](#2-sap--propackhub-concept-map)
3. [Multi-Tenant Architecture](#3-multi-tenant-architecture)
4. [Role-Based Access Model](#4-role-based-access-model)

**PART 2 — MASTER DATA**
5. [Item Master (≡ SAP Material Master)](#5-item-master--sap-material-master)
6. [Recipe / Formula (≡ SAP BOM + Routing)](#6-recipe--formula--sap-bom--routing)
7. [Machine (≡ SAP Work Center / Resource)](#7-machine--sap-work-center--resource)
8. [Material Master (Raw Material Pricing)](#8-material-master-raw-material-pricing)
9. [Process Rates (≡ SAP Activity Types / KP26)](#9-process-rates--sap-activity-types--kp26)

**PART 3 — TWO-PHASE COST ENGINE**
10. [The Two-Phase Concept — From SAP to ProPackHub](#10-the-two-phase-concept--from-sap-to-propackhub)
11. [Phase 1: Pre-Sale Estimation (≡ SAP CK11N / ZQT1)](#11-phase-1-pre-sale-estimation--sap-ck11n--zqt1)
12. [Phase 2: Production Actuals (≡ SAP Process Order + KKS2)](#12-phase-2-production-actuals--sap-process-order--kks2)
13. [Variance Engine (≡ SAP CO-PC Variance Categories)](#13-variance-engine--sap-co-pc-variance-categories)
14. [Costing Formulas — All Departments](#14-costing-formulas--all-departments)

**PART 4 — PRE-SALES WORKFLOW**
15. [Pre-Sales Pipeline (≡ SAP SD + CO-PA)](#15-pre-sales-pipeline--sap-sd--co-pa)
16. [QC Sample Workflow (≡ SAP QM + CSE)](#16-qc-sample-workflow--sap-qm--cse)
17. [Quotation & Negotiation (≡ SAP SD Quotation)](#17-quotation--negotiation--sap-sd-quotation)
18. [Job Card (≡ SAP Production Order)](#18-job-card--sap-production-order)
19. [Procurement Flow (≡ SAP MM / PR / PO)](#19-procurement-flow--sap-mm--pr--po)

**PART 5 — PRODUCTION EXECUTION**
20. [17-Phase Job Flow (≡ SAP PP-PI Process Order Lifecycle)](#20-17-phase-job-flow--sap-pp-pi-process-order-lifecycle)
21. [Department Operations](#21-department-operations)
22. [MRP / Auto-Planning (≡ SAP MRP Live)](#22-mrp--auto-planning--sap-mrp-live)

**PART 6 — CRM & MIS**
23. [CRM Module (≡ SAP CRM + CO-PA)](#23-crm-module--sap-crm--co-pa)
24. [MIS / Analytics (≡ SAP MIS + SAC)](#24-mis--analytics--sap-mis--sac)

**PART 7 — IMPLEMENTATION**
25. [Database Schema Reference](#25-database-schema-reference)
26. [API Routes Reference](#26-api-routes-reference)
27. [Implementation Roadmap](#27-implementation-roadmap)
28. [Coding Rules & Standards](#28-coding-rules--standards)

---

# PART 1 — FOUNDATION

## 1. What ProPackHub Is

ProPackHub is a **multi-tenant SaaS manufacturing platform** with three fully integrated pillars:

| Pillar | Purpose | SAP Equivalent |
|--------|---------|----------------|
| **CRM** | Prospects → Customers → Deals → Inquiries → full sales pipeline with field visits, tasks, and analytics | SAP CRM + SD |
| **MES** | Pre-sales QC → Estimation → Quotation → Job Card → Production (17 phases) → Dispatch | SAP PP-PI + CO-PC + QM |
| **MIS** | AEBF (Actual/Estimate/Budget/Forecast) → P&L → Analytics → Oracle sync | SAP BW + SAC + CO-PA |

### What Makes ProPackHub Different from SAP

| Dimension | SAP S/4HANA | ProPackHub |
|-----------|-------------|------------|
| **Deployment** | On-premise or private cloud, complex infrastructure | SaaS, any browser, zero infrastructure |
| **UX** | SAP GUI (transaction codes, screen variants) | React web app, touch-first, role-aware |
| **Implementation** | 6–18 months, SAP consultants required | Weeks, guided setup wizard |
| **Licensing** | Per-module, per-user, expensive | SaaS subscription per tenant |
| **Customization** | ABAP development, transport system | React components, Node.js routes |
| **Data model** | MARA, MARC, MARD (100+ tables for materials) | Clean PostgreSQL schema, schema-per-tenant |
| **Costing** | CK11N, CKMLCP, KKS2 — separate transactions | Single EstimationCalculator UI with live formulas |
| **Multi-tenant** | SAP Client concept (limited) | Full schema-per-tenant PostgreSQL isolation |

### Who Uses ProPackHub

ProPackHub is sold to **manufacturing companies** as a SaaS subscription. Each company is a **tenant** with its own isolated database schema, users, and data. The platform is designed primarily for flexible packaging manufacturers but applies to any process/discrete manufacturing operation.

**Tenant example**: A flexible packaging company running extrusion, printing, lamination, coating, slitting, and bag-making departments would use ProPackHub to manage their entire commercial and production workflow — from the first customer inquiry to final delivery.

> ⚠️ **Important**: ProPackHub is the product. Any company name referenced in examples is a tenant. No specific company is embedded in the platform.

---

## 2. SAP → ProPackHub Concept Map

This table is the master reference for understanding how every SAP concept maps to ProPackHub's implementation.

| SAP Concept | SAP Transaction | ProPackHub Equivalent | PPH Location |
|-------------|-----------------|----------------------|--------------|
| **Material Master** | MM01/MM02 | Item Master | Master Data → Items |
| **Bill of Materials** | CS01/CS02 | Recipe Material Rows | MES → Estimation → Material Table |
| **Routing / Master Recipe** | CA01 / C201 | Recipe Operation Rows | MES → Estimation → Operation Table |
| **Work Center / Resource** | CR01 / CRC1 | Machine | Master Data → Machines |
| **Production Version** | MM02 WS tab | SKU Configuration | Master Data → SKU Config |
| **Costing Variant ZSTD (MAP)** | OKN0 | STANDARD cost profile | Estimation → Price Profile |
| **Costing Variant ZQT1 (Market)** | OKN0 | QUOTATION cost profile | Estimation → Price Profile |
| **Moving Average Price (MAP)** | MM03 Accounting | Item MAP Price (auto-updated) | Item Master → Costing → MAP |
| **Market Reference Price** | MR21 / ME12 | Item Market Ref Price (manual) | Item Master → Costing → Market Ref |
| **Standard Price Release** | CK24 | Period Cost Release | Costing → Period Release |
| **Product Cost Estimate** | CK11N | Estimation Run | MES → Estimation Calculator |
| **Cost Estimate Itemisation** | CK13N | Estimation Detail View | MES → Estimation → Material + Operation Tables |
| **Sales Order Cost Estimate** | OVZG/OVZI ZD1 | Estimation linked to Inquiry | Estimation auto-linked to Inquiry |
| **Quotation (SD)** | VA21 | Quotation Panel | MES → Inquiry Detail → Quotation |
| **Sales Order (SD)** | VA01 | Customer Order (via Customer PO) | MES → Inquiry Detail → Customer PO |
| **Process Order** | COR1 | Job Card | MES → Job Card |
| **Goods Issue (MIGO 261)** | MIGO | Material Issue to Job | MES → Job Card → Material BOM |
| **Confirmation (CORS)** | CORS / CO11N | Phase Confirmation | MES → Flow → Phase Advance |
| **Goods Receipt (MIGO 101)** | MIGO | Output Receipt | MES → Flow → Final Phase |
| **Variance Calculation** | KKS2 | Estimation vs Actuals | MES → Estimation → Actuals Panel |
| **Order Settlement** | CO88 | Job Settlement | MES → Job Card Close |
| **CO-PA Profitability** | KE30 | Win/Loss Analytics | MES → Analytics |
| **Material Ledger** | CKMLCP | Actual Cost Ledger | Costing → Period Actuals |
| **Batch Management** | MSC1N | Roll / Lot Tracking | Production → Rolls |
| **MRP Live** | MD01N | Auto-Planning Engine | Planning → MRP |
| **Stock/Requirements List** | MD04 | Material Availability Check | Job Card → Material BOM Status |
| **QM Inspection** | QA01 | QC Sample Analysis | MES → QC → Sample Analysis |
| **CSE / Usage Decision** | QA11 | CSE Report (dual approval) | MES → QC → CSE Approval |
| **NCR / Non-Conformance** | QM → NCR | NCR Management | MES → QC → NCR |
| **Purchase Requisition** | ME51N | Purchase Requisition | MES → Procurement → PR |
| **Purchase Order** | ME21N | Supplier Purchase Order | MES → Procurement → SPO |
| **Goods Receipt (MM)** | MIGO 101 | Stock Receipt | MES → Procurement → Receipt |
| **CO-CCA Cost Centre** | KP26 | Machine Hourly Rate | Master Data → Machines → Rate |
| **SD Requirement Class ZD1** | OVZG | Direct Sale Route (inquiry_stage) | Inquiry stage = quotation flow |
| **SD Requirement Class ZD2** | OVZG | In-house Route | Internal job without CO-PA posting |
| **SOP (Standard)** | MC81 | Demand Forecast | Planning → Forecasts |
| **SOP Transfer to Demand Mgmt** | MC75 | Forecast → PIR → Job creation | Planning → MRP auto-plan |
| **AEBF (Actual/Estimate/Budget/Forecast)** | SAP BW/CO | AEBF Module | MIS → AEBF Tabs |
| **P&L Report** | S_ALR_87013127 | P&L Dashboard | MIS → P&L |

---

## 3. Multi-Tenant Architecture

### How It Works

ProPackHub uses **schema-per-tenant** PostgreSQL isolation:

```
ProPackHub Platform DB (propackhub_platform)
  └── system.tenants — tenant registry
  └── system.subscriptions — billing

Tenant Schema: tenant_{tenant_code}
  └── All CRM tables (crm_*)
  └── All MES tables (mes_*)
  └── All AEBF tables (fp_*)
  └── All users, settings, master data
```

### Tenant Provisioning

When a new manufacturing company subscribes:
1. New record in `system.tenants`
2. New PostgreSQL schema created: `tenant_{code}`
3. All migrations run in new schema
4. Seed data populated (product groups, QC test library, costing defaults)
5. Admin user created, welcome email sent

### URL Routing

Each tenant accesses via subdomain: `{tenant}.propackhub.com`  
JWT tokens include `tenant_id` claim — all queries scoped to tenant schema.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React (Vite), Ant Design, React Router v6 |
| **Backend** | Node.js, Express.js |
| **Database** | PostgreSQL 14+ (schema-per-tenant) |
| **Auth** | JWT (15min access + 60-day refresh, HTTP-only cookie) |
| **Cache** | Redis (optional) |
| **Real-time** | SSE (Server-Sent Events) for notifications |
| **File Storage** | S3-compatible (attachments, PDFs, QR labels) |
| **Deployment** | Nginx reverse proxy, load balanced Node.js instances |

---

## 4. Role-Based Access Model

ProPackHub enforces two tiers of access. The gate condition is:
`role ∈ FULL_ACCESS_ROLES AND designation_level ≥ 6`

### Role Definitions (from `src/utils/roleConstants.js`)

```javascript
// Roles with access to CRM / Sales module
SALES_ROLES = ['admin','manager','sales_manager','sales_coordinator','sales_rep','sales_executive']

// Roles whose primary home is MES (no CRM, no MIS dashboard)
MES_ONLY_ROLES = ['quality_control','qc_manager','qc_lab','production_manager',
                  'operator','logistics_manager','stores_keeper','accounts_manager','accountant']

// Roles with full cross-team visibility (Tier 1 Management)
CRM_FULL_ACCESS_ROLES = ['admin','manager','sales_manager','sales_coordinator']

// Roles with MIS / Dashboard access (minimum level 6)
MIS_ROLES = ['admin','manager','sales_manager','sales_coordinator']
MIS_MIN_LEVEL = 6

// Department-specific role groups
QC_ROLES = ['quality_control','qc_manager','qc_lab']
PRODUCTION_ROLES = ['production_manager','operator']
ACCOUNTS_ROLES = ['accounts_manager','accountant']
LOGISTICS_ROLES = ['logistics_manager','stores_keeper']
```

### Access Tier Matrix

| Tier | Roles | Level | Sees | Can Do |
|------|-------|-------|------|--------|
| **MANAGEMENT (Tier 1)** | admin, manager, sales_manager, sales_coordinator | ≥ 6 | All teams, all customers, all inquiries, full pipeline | Approve quotations, assign leads, create job cards, grant clearance |
| **SALES REP (Tier 2)** | sales_rep, sales_executive | < 6 | Own customers, own inquiries, own pipeline | Create inquiries, submit quotations for approval, capture PO, record dispatch |
| **QC MANAGER (Tier 1)** | qc_manager + level ≥ 6 | ≥ 6 | All QC samples all divisions, CSE queue, NCR list | Approve/reject CSE, assign QC tasks, view full QC dashboard |
| **QC ANALYST (Tier 2)** | quality_control, qc_lab | any | Samples assigned to them or in QC inbox | Perform analysis, submit results, cannot approve CSE |
| **PRODUCTION MGR (Tier 1)** | production_manager + level ≥ 6 | ≥ 6 | All job cards, all production jobs, MES flow board | Create/approve job cards, advance MES phases, assign operators |
| **PROCUREMENT** | stores_keeper, procurement | any | PRs and POs for own department | Raise PR, create SPO, confirm stock receipt |
| **ADMIN (Super)** | admin | any | Everything system-wide | All actions including user management and system config |

### Role Check Helpers

**Backend** (`server/routes/mes/presales/_helpers.js` + `server/services/crmAccessControl.js`):

```javascript
isManagement(user)          // FULL_ACCESS_ROLES.includes(role) && level >= 6
isAdminOrMgmt(user)         // ['admin','manager','sales_manager'].includes(role)
canApproveQuotation(user)   // isAdminOrMgmt(user)
canCreateJobCard(user)      // ['admin','manager','production_manager','sales_manager']
canApproveMaterial(user)    // ['admin','procurement','stores_keeper']
canAccessQCDashboard(user)  // role in QC_ROLES or department ILIKE '%qc%'
canApproveQCStage(user)     // ['admin','manager','qc_manager']
buildRepScopeWhere(user,p)  // isManagement → no filter; else → sales_rep_group_id=$p
```

**Frontend** (`src/utils/roleChecks.js`):
```javascript
isManagement(user)   // Controls rep filter visibility, cross-team data
isQCUser(user)       // Checks role + designation + department
getRoleLabel(user)   // Human-friendly role label (uses designation if set)
```

### MES Department Configuration (from `WorkflowLandingPage.jsx`)

The MES WorkflowLandingPage maps users to departments:
```javascript
DEPTS = {
  sales, qc, prepress, estimation, procurement,
  production, inkhead, maintenance, accounts, logistics
}
```

Each department has its own color theme and quick-link tiles. Users are routed to their relevant MES sections based on role.

---

# PART 2 — MASTER DATA

## 5. Item Master (≡ SAP Material Master)

In SAP, the Material Master (MM01) is the central record for all materials with views for MRP, costing, work scheduling, etc. ProPackHub's **Item Master** consolidates all relevant fields into a single, clean data structure.

### Item Types (≡ SAP Material Types)

| PPH Item Type | SAP Equivalent | Description | Example |
|---------------|----------------|-------------|---------|
| `raw_resin` | ROH | Polymer resin, externally purchased | LLDPE, LDPE, mLLDPE, BOPP |
| `raw_ink` | ROH | Printing ink, varnish, lacquer | Flexo Cyan, Gravure Yellow |
| `raw_adhesive` | ROH | Lamination / coating adhesive | PU adhesive, HSL lacquer |
| `raw_packaging` | ROH | Cores, stretch film, corner protectors | 3-inch paper cores |
| `raw_solvent` | ROH | Solvent for ink or adhesive | Ethyl Acetate, MEK, IPA |
| `semi_extruded` | HALB | Extruded film roll (unprocessed) | PE Shrink Film 25mic 1200mm |
| `semi_printed` | HALB | Printed roll (pending further processing) | BOPP Printed Roll |
| `semi_laminated` | HALB | Laminated structure | PET/PE Laminate |
| `semi_coated` | HALB | Coated roll | HSL-Coated BOPP |
| `semi_slit` | HALB | Slit roll at final width | 200mm Slit Roll |
| `fg_roll` | FERT | Finished good roll sold as-is | FFS Film 40mic 1500mm |
| `fg_bag` | FERT | Finished bag / pouch | Stand-Up Pouch 200×300mm |

### Item Master Key Fields

```sql
CREATE TABLE mes_item_master (
  id SERIAL PRIMARY KEY,
  item_code VARCHAR(50) UNIQUE NOT NULL,    -- Unique SKU code
  item_name VARCHAR(255) NOT NULL,          -- Commercial description
  item_type VARCHAR(50) NOT NULL,           -- From types above
  product_group VARCHAR(100),               -- Commercial grouping (≡ SAP Material Group)

  -- Units (≡ SAP Alternative UoM)
  base_uom VARCHAR(10) DEFAULT 'KG',
  density_g_cm3 DECIMAL(8,4),              -- For SQM/LM conversions
  micron_thickness DECIMAL(8,2),           -- Film thickness
  width_mm DECIMAL(10,2),                  -- Film width

  -- Costing (≡ SAP Accounting 1 view)
  price_control VARCHAR(3) DEFAULT 'MAP',  -- MAP or STD (≡ SAP V or S)
  standard_price DECIMAL(12,4),            -- Released standard cost/kg (≡ SAP Standard Price)
  map_price DECIMAL(12,4),                 -- Moving average price (auto-updated on receipt)
  market_ref_price DECIMAL(12,4),          -- Manual market price (≡ SAP Planned Price 1)
  market_price_date DATE,                  -- Last update date for market ref price
  last_po_price DECIMAL(12,4),             -- Most recent PO price

  -- MRP (≡ SAP MRP 1/2 views)
  mrp_type VARCHAR(10) DEFAULT 'PD',       -- PD, ROP, NONE
  reorder_point DECIMAL(12,2),
  safety_stock_kg DECIMAL(12,2),
  procurement_type VARCHAR(10),            -- INTERNAL or EXTERNAL
  planned_lead_time_days INT,
  lot_size_rule VARCHAR(5) DEFAULT 'EX',   -- EX, FX, MB, WB
  fixed_lot_size_kg DECIMAL(12,2),
  assembly_scrap_pct DECIMAL(5,2),

  -- Classification (≡ SAP Batch Classification)
  subcategory VARCHAR(100),               -- For grouping in UI selects
  solid_pct DECIMAL(5,2),                 -- For ink/adhesive: solid content %
  waste_pct DECIMAL(5,2),                 -- Default waste factor

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Unit Conversion Formulas (≡ SAP Alternative UoM Conversion)

```javascript
// Weight to SQM:
SQM = (kg × 1,000,000) / (micron × density_g_per_cm3 × 1000)

// Weight to Linear Meters:
LM = (SQM × 1000) / width_mm

// Weight to Rolls (approximate):
ROL = kg / avg_roll_weight_kg

// SQM per KG (key conversion used in estimation):
sqmPerKg = 1000 / totalGSM
// where totalGSM = sum of (micron × density) for all substrate layers
```

### Price Resolution Logic (≡ SAP Valuation Variant Lookup Sequence)

**STANDARD profile** (≡ SAP ZSTD — for period standard cost):
1. MAP Price (current moving average — auto-updated on every stock receipt)
2. Standard Price (fallback if MAP is zero — new material not yet received)
3. Last PO Price (last resort)

**QUOTATION profile** (≡ SAP ZQT1 — for commercial quotations):
1. Market Reference Price (manually maintained by procurement team, monthly)
2. MAP Price (fallback if Market Ref not maintained or outdated)
3. Last PO Price (last resort)

> This is a direct implementation of the SAP two-costing-variant concept from the W&H VAREX II extrusion blueprint. The principle is identical: never use a single price source — have a priority sequence so the system always finds a non-zero price.

---

## 6. Recipe / Formula (≡ SAP BOM + Routing)

In SAP, the BOM (CS01) defines what materials to consume, and the Routing (CA01) or Master Recipe (C201) defines how to produce them. ProPackHub combines both into a single **Recipe** object that is built interactively through the EstimationCalculator.

### Recipe: Material Rows (≡ SAP BOM Items)

Each row in the Material Table represents one layer or consumable:

| PPH Field | SAP Equivalent | Description |
|-----------|----------------|-------------|
| `type` | Item Category | `substrate` (L=Stock item), `ink` (N=Non-stock), `adhesive` |
| `materialName` | Component Material | Selected from Item Master |
| `micron` | Thickness characteristic | Film thickness in microns |
| `density` | Density characteristic | g/cm³ — for GSM calculation |
| `solidPct` | Solid content % | For inks/adhesives only |
| `costPerKg` | Material price | From MAP or Market Ref |
| `wastePct` | Component Scrap % | ≡ SAP BOM Component Scrap % |
| **GSM (calculated)** | Derived field | `Substrate: micron × density` / `Ink/Adhesive: (solidPct × micron) / 100` |
| **Cost/M² (calculated)** | Cost per SQM | `(GSM × costPerKg / 1000) × (1 + wastePct/100)` |
| **Est. Kg (calculated)** | Component quantity | `(orderKgs × rowGSM / totalGSM) × (1 + wastePct/100)` |
| **Layer % (calculated)** | BOM weight split | `rowGSM / totalGSM × 100` |

### Recipe: Operation Rows (≡ SAP Routing Operations / Master Recipe Phases)

Each enabled operation represents a production department process:

| Process Name | SAP Equivalent | Speed Unit | Notes |
|---|---|---|---|
| Extrusion | Work Center BLOWN_FILM | Kgs/Hr | Calculates LDPE kg through line |
| Printing | Work Center FLEXO/GRAVURE | Mtr/Min | Based on order meters |
| Rewinding | Work Center REWIND | Mtr/Min | Same as printing meters |
| Lamination 1/2/3 | Resource LAMINATOR | Mtr/Min | Multiple laminators |
| Slitting | Work Center SLITTER | Mtr/Min | Based on order meters |
| Sleeving | Work Center SLEEVE | Mtr/Min | × numUps |
| Sleeve Doctoring | Work Center DOCTOR | Mtr/Min | Sleeve correction |
| Pouch Making | Work Center POUCH | Pcs/Min | Based on pieces |

**Operation cost formula**:
```javascript
// Machine Hours = (Order Length / Speed) + Setup Hours
// For Kgs/Hr (Extrusion): totalHrs = setupHrs + (ldpeKgs / speed)
// For Mtr/Min (Printing/Lami/Slitting): totalHrs = setupHrs + (orderMeters / speed) / 60
// For Pcs/Min (Pouch): totalHrs = setupHrs + (orderKpcs × 1000 / speed) / 60

processCost = totalHrs × costPerHr
```

### Product Dimensions (≡ SAP Material Characteristics)

For **Roll / Sleeve** products:
- Reel Width (mm), Cut Off (mm), Extra Trim (mm), Number of Ups

For **Bag / Pouch** products:
- Open Height (mm), Open Width (mm), Extra Trim (mm), Number of Ups

**Piece calculations**:
```javascript
// For Roll/Sleeve:
piecesPerKg = (lmPerKg × 1000 / cutOff) × numUps

// For Bag/Pouch:
sheetArea = (openHeight × openWidth) / 1,000,000  // m²
piecesPerKg = (sqmPerKg / sheetArea) × numUps

gramsPerPiece = 1000 / piecesPerKg
```

---

## 7. Machine (≡ SAP Work Center / Resource)

```sql
CREATE TABLE mes_machines (
  id SERIAL PRIMARY KEY,
  machine_code VARCHAR(50) UNIQUE NOT NULL,   -- e.g. EXT-001, GRV-001
  machine_name VARCHAR(255) NOT NULL,
  department VARCHAR(100),                    -- extrusion, printing, lamination, etc.
  machine_type VARCHAR(100),                  -- BLOWN_FILM, FLEXO, GRAVURE, SLITTER, etc.

  -- Capacity (≡ SAP Work Center Capacity)
  max_web_width_mm DECIMAL(10,2),
  number_of_colors INT,
  standard_speed DECIMAL(10,2),               -- m/min or kg/hr
  speed_unit VARCHAR(20),                     -- Mtr/Min, Kgs/Hr, Pcs/Min

  -- Costing (≡ SAP KP26 Activity Type Planning)
  hourly_rate DECIMAL(10,2),                  -- USD per machine hour
  setup_cost DECIMAL(10,2),                   -- Fixed cost per job setup

  -- Waste factors
  setup_waste_pct DECIMAL(5,2) DEFAULT 3.0,
  running_waste_pct DECIMAL(5,2) DEFAULT 2.0,

  -- Assignment (≡ SAP Cost Centre)
  cost_centre_code VARCHAR(50),

  status VARCHAR(50) DEFAULT 'operational',
  is_active BOOLEAN DEFAULT true
);
```

**Standard machine defaults** (seeded per tenant):

| Code | Name | Type | Speed | Rate |
|------|------|------|-------|------|
| GRV-001 | Gravure Press 8-Color | Printing/Gravure | 250 m/min | $200/hr |
| FLX-001 | CI Flexo 8-Color | Printing/Flexo | 350 m/min | $180/hr |
| LAM-001 | Solventless Laminator | Lamination/SL | 400 m/min | $130/hr |
| LAM-002 | Dry Laminator | Lamination/Dry | 300 m/min | $120/hr |
| SLT-001 | Slitter Rewinder | Slitting | 500 m/min | $80/hr |
| PCH-001 | 3-Side Seal Pouch | Pouch Making | 80 pcs/min | $100/hr |
| PCH-002 | Stand-Up Pouch | Pouch Making | 50 pcs/min | $120/hr |
| EXT-001 | Blown Film Extruder | Extrusion | 200 kg/hr | $120/hr |

---

## 8. Material Master (Raw Material Pricing)

The raw material master stores all consumables with pricing and physical properties. This directly implements the SAP raw material pricing concept from the extrusion blueprint.

```sql
CREATE TABLE mes_raw_materials (
  id SERIAL PRIMARY KEY,
  material_code VARCHAR(50) UNIQUE NOT NULL,
  material_name VARCHAR(255) NOT NULL,
  material_category VARCHAR(100),     -- substrate, ink, adhesive, solvent, packaging
  material_type VARCHAR(100),         -- PET, BOPP, PE, LLDPE, mLLDPE, ALU, etc.
  subcategory VARCHAR(100),           -- For UI grouping

  -- Physical
  density DECIMAL(8,4),               -- g/cm³
  standard_thickness_micron DECIMAL(8,2),
  solid_pct DECIMAL(5,2),             -- For inks/adhesives

  -- Pricing (≡ SAP Accounting 1 + Costing 1 views)
  standard_cost_per_kg DECIMAL(10,4), -- Released standard (≡ SAP Standard Price S)
  map_price DECIMAL(10,4),            -- Moving average (≡ SAP MAP / Price Control V)
  market_ref_price DECIMAL(10,4),     -- Spot market price (≡ SAP Planned Price 1)
  last_purchase_price DECIMAL(10,4),
  price_effective_date DATE,

  -- Waste default
  waste_pct DECIMAL(5,2) DEFAULT 3.0,

  is_active BOOLEAN DEFAULT true
);
```

**Seeded material library** (flexible packaging):

| Code | Material | Category | Density | Cost/kg |
|------|----------|----------|---------|---------|
| PET-12 | PET Film 12μ | Substrate/PET | 1.40 | $2.50 |
| BOPP-20 | BOPP Film 20μ | Substrate/BOPP | 0.91 | $1.80 |
| LLDPE-50 | LLDPE Sealant 50μ | Substrate/PE | 0.92 | $1.70 |
| NY-15 | Nylon Film 15μ | Substrate/PA | 1.14 | $4.50 |
| ALU-7 | Aluminum Foil 7μ | Substrate/ALU | 2.70 | $8.50 |
| CPP-25 | CPP Film 25μ | Substrate/PP | 0.90 | $1.90 |
| ADH-SF | Solvent-Free Adhesive | Adhesive/PU | 1.10 | $6.00 |
| INK-PU | PU Ink Base | Ink/PU | 1.00 | $15.00 |
| INK-WB | Water-Based Ink | Ink/WB | 1.00 | $10.00 |
| SOLV-EA | Ethyl Acetate | Solvent | — | $1.20/L |
| PKG-CORE | 3-inch Paper Core | Packaging | — | $0.45/pc |

---

## 9. Process Rates (≡ SAP Activity Types / KP26)

Process rates define the machine hourly cost and standard speed — equivalent to SAP's activity type planning (KP26) where the cost centre rate is set at period start.

```sql
CREATE TABLE mes_process_rates (
  id SERIAL PRIMARY KEY,
  process_code VARCHAR(50) UNIQUE NOT NULL,
  process_name VARCHAR(255) NOT NULL,
  process_type VARCHAR(100),      -- Printing, Lamination, Slitting, Pouch_Making, Extrusion
  hourly_rate DECIMAL(10,2),      -- Machine hour rate (≡ SAP KP26 activity price)
  setup_cost DECIMAL(10,2),       -- Per-job fixed setup
  min_order_charge DECIMAL(10,2),
  standard_speed DECIMAL(10,2),   -- meters/min or pcs/min or kgs/hr
  speed_unit VARCHAR(20),
  setup_waste_pct DECIMAL(5,2) DEFAULT 3.0,
  running_waste_pct DECIMAL(5,2) DEFAULT 2.0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

> **SAP Parallel**: In SAP, the rate per machine hour is maintained in KP26 (Enter Activity Type Planning) at the start of each period. In ProPackHub, this is the `hourly_rate` field updated monthly by the production/finance team. The EstimationCalculator uses this rate in real-time: `processCost = totalHrs × costPerHr`.

---

# PART 3 — TWO-PHASE COST ENGINE

## 10. The Two-Phase Concept — From SAP to ProPackHub

The two-phase cost management concept comes directly from SAP S/4HANA CO-PC (Product Costing) as documented in the W&H VAREX II extrusion blueprint. ProPackHub implements this concept **natively** in its estimation engine — applied to ALL production departments, not just extrusion.

### The SAP Origin

In SAP S/4HANA:
- **Phase 1**: A cost estimate (CK11N) is run before production using either the ZSTD costing variant (MAP prices) or ZQT1 variant (market reference prices). This produces the standard cost used for quotations.
- **Phase 2**: When production runs, a Process Order (PP-PI) captures actual goods issues and confirmed hours. At period end, variance calculation (KKS2) compares planned vs actual and categorizes differences into Price Variance (PRV), Quantity Variance (QTV), Resource Usage Variance (RUV).

### How ProPackHub Implements This

```
PHASE 1 — PRE-SALE ESTIMATION
  Trigger  : Customer inquiry created (MES → Inquiries → New)
  Component: EstimationCalculator.jsx
  Route    : /mes/estimation/:inquiryId
  Storage  : mes_quotations.estimation_data (JSONB snapshot)
  Output   : Cost per kg / SQM / LM / Kpcs / Roll — drives quotation price

                    ↓ (Inquiry advances through QC → Clearance → Quotation → PO)

PHASE 2 — PRODUCTION ACTUALS
  Trigger  : inquiry_stage IN ('in_production','ready_dispatch','delivered','closed')
  Component: EstimationActuals.jsx (embedded in EstimationCalculator)
  Route    : PATCH /api/mes/presales/estimations/:id/actuals
  Storage  : estimation_data.actuals JSONB
  Output   : Actual GSM vs Estimated GSM, Actual Hours vs Estimated Hours,
             RM Cost Diff%, Operation Cost Diff%, Total Cost Diff%
```

### Why Two Phases Apply to ALL Departments

The extrusion blueprint explicitly states: *"The shift from estimation to production introduces two key changes: component resolution (product-group level → actual grade) and price resolution (reference price → actual GR price)."*

This principle is **universal** across every production step:

| Department | Phase 1 — Estimation | Phase 2 — Actual |
|---|---|---|
| **Extrusion** | Layer formula × MAP or Market Ref (product group level LLDPE, LDPE, mLLDPE) | Actual grade × actual GR price (e.g., "Sabic LL 1001 KW") |
| **Printing** | Ink coverage × ink price per color + substrate transfer price | Actual ink consumed per container weight diff |
| **Lamination** | Adhesive GSM × adhesive price + substrate transfer costs | Actual coating weight per gravimetric test |
| **Coating** | Lacquer g/m² × lacquer price + substrate transfer | Actual coating weight verified by in-line measurement |
| **Slitting** | Transfer price + machine hours based on order width | Actual yield loss + actual speed variance |
| **Bag Making** | Film per bag × transfer price + fitments per piece | Actual film consumed + actual rejection rate |

In ProPackHub's EstimationCalculator, the **same material table and operation table** handles all departments. The user selects which operations are enabled (Extrusion, Printing, Lamination 1/2/3, Slitting, Pouch Making) — creating a single unified two-phase cost model for any product regardless of how many processes it goes through.

---

## 11. Phase 1: Pre-Sale Estimation (≡ SAP CK11N / ZQT1)

### Trigger and Access

The EstimationCalculator is accessible at:
- Route: `/mes/estimation/:inquiryId`
- Entry: From EstimationQueue (`/mes/estimation`) or from InquiryDetail
- Access: admin, sales_manager, sales_coordinator (estimation role)

### Data Flow

```
1. Load inquiry (customer, product group, inquiry number)
2. Load material master (grouped by type: substrate, ink, adhesive)
3. Load existing estimation (if re-opening saved estimate)
4. If no existing: auto-load product group defaults
   → default_material_layers (pre-configured layers per product group)
   → default_processes (enabled operations + speeds)
   → default_dimensions
5. User configures material rows and operations
6. All calculations run client-side in React state (real-time, no API call needed)
7. Save: POST /api/mes/presales/estimations → stores estimation_data JSONB
8. Create Quotation: saves estimation → creates mes_quotations record
```

### Full JSONB Payload Structure (estimation_data)

```json
{
  "header": {
    "productType": "roll | sleeve | bag_pouch",
    "orderQty": 5000,
    "qtyUnit": "Kg | Kpcs | SQM",
    "remarks": "Customer notes",
    "customerName": "...",
    "inquiryNumber": "INQ-FP-2026-00123"
  },
  "dimensions": {
    "reelWidth": 1000,
    "cutOff": 300,
    "extraTrim": 10,
    "numUps": 1,
    "openHeight": 200,
    "openWidth": 150
  },
  "materials": [
    {
      "key": "row-0",
      "type": "substrate",
      "materialName": "LLDPE Grade A",
      "solidPct": null,
      "micron": 25,
      "density": 0.92,
      "costPerKg": 1.42,
      "wastePct": 3.0
    }
  ],
  "operations": [
    {
      "key": "op-0",
      "processName": "Printing",
      "enabled": true,
      "speed": 150,
      "speedUnit": "Mtr/Min",
      "setupHrs": 0.5,
      "costPerHr": 180,
      "totalHrs": 3.2,
      "processCost": 576.00
    }
  ],
  "summary": {
    "totalMicron": 95,
    "totalGSM": 87.4,
    "totalCostPerSqm": 0.1245,
    "filmDensity": 0.9200,
    "sqmPerKg": 11.44,
    "printFilmWidth": 1.010,
    "lmPerKg": 11.33,
    "piecesPerKg": 37.77,
    "gramsPerPiece": 26.47
  },
  "totalCost": {
    "rawMaterialCost": 1.425,
    "markupPct": 15,
    "platesCost": 0.035,
    "deliveryCost": 0.020,
    "operationCost": 0.259,
    "perKg": { "rawMaterialCost": 1.425, "operationCost": 0.259, "salePrice": 1.978 },
    "perKpcs": 52.41,
    "perSqm": 0.1729,
    "perLm": 0.1748,
    "perRoll500": 87.40
  },
  "actuals": null
}
```

### Calculation Engine (from EstimationCalculator.jsx)

**Summary Calculations**:
```javascript
// Total GSM = sum of per-layer GSM
totalGSM = sum(
  substrate: micron × density,
  ink/adhesive: (solidPct × micron) / 100
)

// Film density (weighted average)
filmDensity = totalGSM / totalMicron

// SQM per KG = 1000 / totalGSM
sqmPerKg = 1000 / totalGSM

// Print film width in meters (reel width + extra trim)
printFilmWidth = (reelWidth + extraTrim) / 1000

// Linear meters per KG
lmPerKg = sqmPerKg / printFilmWidth

// Pieces per KG (Roll/Sleeve):
piecesPerKg = (lmPerKg × 1000 / cutOff) × numUps

// Pieces per KG (Bag/Pouch):
sheetArea = (openHeight × openWidth) / 1,000,000
piecesPerKg = (sqmPerKg / sheetArea) × numUps
```

**Per-material Cost/M²**:
```javascript
// Substrate:
gsm = micron × density
costPerSqm = (gsm × costPerKg / 1000) × (1 + wastePct/100)

// Ink / Adhesive:
gsm = (solidPct × micron) / 100
costPerSqm = (micron × costPerKg / 1000) × (1 + wastePct/100)
```

**Total Cost**:
```javascript
rawMaterialCostPerKg = totalCostPerSqm × sqmPerKg
rmWithMarkup = rawMaterialCostPerKg × (1 + markupPct/100)
platesPerKg = platesCost / orderQty
deliveryPerKg = deliveryCost / orderQty
opCostPerKg = totalOperationCost / orderQty

salePricePerKg = rmWithMarkup + platesPerKg + deliveryPerKg + opCostPerKg
```

**Multi-unit Output Grid** (from EstimationTotalCost.jsx):
| Unit | Formula |
|------|---------|
| Per Kg | Direct calculation |
| Per 1,000 pcs | `perKg × 1000 / piecesPerKg` |
| Per SQM | `perKg / sqmPerKg` |
| Per LM | `perKg / lmPerKg` |
| Per Roll (500 LM) | `perLm × 500` |

---

## 12. Phase 2: Production Actuals (≡ SAP Process Order + KKS2)

### Trigger

The Actuals panel (EstimationActuals.jsx) automatically appears in the EstimationCalculator when:
```javascript
['in_production','ready_dispatch','delivered','closed'].includes(inquiry.inquiry_stage)
```

This mirrors SAP's behavior where actual costs are only visible after the Process Order is released and production begins.

### What Gets Recorded

**1. Final Output (Kgs)**
- Actual quantity produced vs. estimated order quantity
- Output Diff % = `(actual - estimated) / estimated × 100`

**2. Material Actuals Table**
For each material row from Phase 1:

| Column | Source | SAP Equivalent |
|--------|--------|----------------|
| Est. GSM | From Phase 1 estimation | Planned component quantity |
| Actual GSM | Operator entry (post-production) | Actual GI quantity |
| GSM Diff % | Auto-calculated | Quantity Variance (QTV) |
| Est. Cost/M² | From Phase 1 estimation | Standard cost |
| Actual Cost/M² | Operator entry (actual price paid) | Actual MAP at GI time |
| Cost Diff % | Auto-calculated | Price Variance (PRV) |

**3. Operation Actuals Table**
For each enabled operation:

| Column | Source | SAP Equivalent |
|--------|--------|----------------|
| Est. Hrs | From Phase 1 operation calculation | Standard machine hours |
| Actual Hrs | Operator entry | Confirmed hours (CO11N) |
| Hrs Diff % | Auto-calculated | Machine Hour Variance |
| Est. Cost | From Phase 1 | Standard activity cost |
| Actual Cost | Operator entry | Actual activity cost |
| Cost Diff % | Auto-calculated | Resource Usage Variance (RUV) |

### Actuals API

```javascript
PATCH /api/mes/presales/estimations/:id/actuals

// Payload:
{
  finalOutputKgs: 4850,
  materials: [
    { actualGsm: 86.2, actualCostM2: 0.1280 },  // row 0
    { actualGsm: 12.5, actualCostM2: 0.0185 }   // row 1
  ],
  operations: [
    { actualHrs: 3.8, actualCost: 684.00 },  // Printing
    { actualHrs: 1.1, actualCost: 88.00 }    // Slitting
  ]
}
```

### Variance Display

Color-coded diff tags (from EstimationActuals.jsx):
- `diff > 0`: Red + ↑ (actual exceeded estimate — cost overrun)
- `diff < 0`: Green + ↓ (actual below estimate — favorable)
- `diff = 0`: Neutral

Summary cards:
- **RM Cost Diff** — raw material cost variance
- **Operation Cost Diff** — machine/labor cost variance
- **Total Cost Diff** — overall variance (≡ SAP total order variance before settlement)

---

## 13. Variance Engine (≡ SAP CO-PC Variance Categories)

### SAP Variance Categories → ProPackHub

| SAP Code | SAP Name | ProPackHub Equivalent | Calculation |
|---|---|---|---|
| **PRV** | Price Variance | Material Cost Diff | `(actualCostM2 - estCostM2) / estCostM2 × 100` |
| **QTV** | Quantity Variance | Material GSM Diff | `(actualGsm - estGsm) / estGsm × 100` |
| **RUV** | Resource Usage Variance | Operation Hours Diff | `(actualHrs - estHrs) / estHrs × 100` |
| **MCV** | Machine Cost Variance | Operation Cost Diff | `(actualCost - estCost) / estCost × 100` |
| **OHV** | Output Variance | Final Output Diff | `(actualOutput - estOutput) / estOutput × 100` |

### Business Questions Answered

Directly from the W&H VAREX II extrusion blueprint (applied to all departments):

1. **Price Variance**: Did we pay more or less for raw materials than the price assumed at quotation time?
2. **Quantity/Yield Variance**: Did the production run consume more or less raw material than the BOM called for?
3. **Mix Variance**: Did the actual material used differ from the recipe (e.g., more expensive grade substituted)?

### Period-End Settlement (≡ SAP CO88 + CKMLCP)

```
Month-End Sequence:
1. Close all completed jobs (inquiry_stage = 'closed')
2. Calculate variances for all closed estimations
3. Aggregate by product group and department
4. Roll up actual costs: Extrusion → Printing → Lamination → Slitting → Bag Making
5. Update standard prices for next period (Period Cost Release)
6. Close period — freeze actual costs
```

---

## 14. Costing Formulas — All Departments

### Department 1: Extrusion (Blown Film)

**Layer Structure** (from W&H VAREX II 3-layer die):

| Layer | Fixed Split | Typical Materials |
|-------|------------|------------------|
| A — Outer | 25% | LLDPE, LDPE-Heavy, Slip (Erucamide), Antiblock (SiO₂) |
| B — Core | 50% | LLDPE, LDPE-Medium, mLLDPE, Antioxidant, PPA, UV Stabilizer |
| C — Inner Seal | 25% | mLLDPE, LLDPE, Slip (Oleamide), Antiblock Combo |

**In ProPackHub Material Table**: Each resin is a `substrate` row with:
- Micron = layer thickness (e.g., A: 6.25μ, B: 12.5μ, C: 6.25μ for 25μ total)
- Density = resin density (LLDPE: 0.92, mLLDPE: 0.92, LDPE: 0.92)
- Layer % auto-calculated = confirms 25/50/25 split

**Operation**: Extrusion enabled, speed in Kgs/Hr:
```
Machine Hours = setupHrs + (ldpeKgs / speed)
// ldpeKgs = sum of LDPE/LLDPE substrate kg for the order quantity
```

**Packaging components** (added as separate material rows):
- Type: `substrate`, Material: Core 3-inch, Cost per piece / converted to per kg

### Department 2: Printing (Flexo / Gravure)

**Ink Cost Formula**:
```
Ink GSM per color = solidPct × micronThickness / 100
// Typical: solidPct=100%, micron=3-5 (solid coverage) or 1.5-2 (text/line)

Ink rows in material table: type='ink', solidPct=coverage%, micron=ink_film_thickness
CostPerSqm = (micron × costPerKg / 1000) × (1 + wastePct/100)
```

**Substrate**: The printed substrate (BOPP, PET, or extruded film) is the first row — type `substrate`.

**Plate / Cylinder Amortization**:
```
platesCost = totalPlateCost / expectedRuns
// Entered as lump sum in EstimationTotalCost.jsx → distributed per kg
```

**Operation**: Printing enabled, speed in Mtr/Min.

### Department 3: Lamination

**Adhesive Cost Formula**:
```
Adhesive GSM (dry) = applicationWeight  // typically 1.5-3.0 g/m²
Adhesive GSM (wet) = dryWeight / solidsContent%

// In material table: type='adhesive'
// solidPct = solids content % of adhesive
// micron = wet application thickness
// CostPerSqm = (micron × costPerKg / 1000) × (1 + wastePct/100)
```

**Substrate rows**: Both outer and inner substrates as `substrate` rows.

**Bond lines**: One adhesive row per lamination bond line.

**Operations**: Lamination 1 (and 2, 3 for triplex/quadplex) enabled, speed in Mtr/Min.

### Department 4: Coating (Heat Seal Lacquer)

**Lacquer Cost Formula**:
```
HSL dry weight = 1.5-5.0 g/m²
HSL wet weight = dryWeight / solidsContent%

// In material table: type='adhesive' (same formula as adhesive)
// solidPct = HSL solids content %
// micron = wet coat thickness equivalent
// CostPerSqm = (micron × costPerKg / 1000) × (1 + wastePct/100)
```

**Operations**: Lamination 1 (coating pass) enabled, speed in Mtr/Min.

### Department 5: Slitting

**Key principle**: Slitting is a **conversion-only** process. No new materials consumed — only yield loss.

**In ProPackHub**:
- Material table: Only the input master roll as one `substrate` row
- wastePct on that row = edge trim % (typically 1-3%)
- Operation: Slitting enabled, speed in Mtr/Min

**Width-based cost allocation**:
```
InputKgsForThisWidth = totalInputKgs × (slitWidth / masterWidth)
YieldLoss = InputKgs × trimWastePct / 100
CostPerKgSlit = (inputRollCost + slittingOpCost) / goodOutputKgs
```

### Department 6: Bag Making / Pouching

**Film per bag formula**:
```javascript
// Roll/Sleeve mode — for bags made from roll:
piecesPerKg = (lmPerKg × 1000 / cutOff) × numUps
// cutOff = bag length in mm (includes seal allowance)
// numUps = bags across web width

filmPerBag_kg = 1000 / piecesPerKg
```

**Fitments** (zipper, spout, valve) — added as separate `substrate` rows:
- materialName: "Zipper Tape" / "Spout 13mm"
- micron = 0 (use costPerKg as costPerPiece / kgPerPiece)
- wastePct = fitment waste %

**Operation**: Pouch Making enabled, speed in Pcs/Min:
```
totalHrs = setupHrs + (orderKpcs × 1000 / speed) / 60
```

---

# PART 4 — PRE-SALES WORKFLOW

## 15. Pre-Sales Pipeline (≡ SAP SD + CO-PA)

ProPackHub's pre-sales workflow maps directly to SAP SD (Sales & Distribution) plus CO-PA (Profitability Analysis). Every step has a direct SAP parallel.

### The 39-Step Complete Pipeline

The pipeline runs from first prospect contact to closed order. Key stages and their SAP equivalents:

| Step | PPH Stage | SAP Equivalent | Module |
|------|-----------|----------------|--------|
| 1 | Prospect created | Lead in CRM | CRM |
| 2 | Technical Brief captured | Customer Requirements | SD |
| 3 | Deal created | Opportunity | CRM |
| 4 | Prospect → Customer | Customer Master (XD01) | SD/MM |
| 5 | Inquiry created (3-step wizard) | Sales Inquiry (VA11) | SD |
| 6 | Samples registered + TDS uploaded | Sample Management | QM |
| 7 | SAR printed with QR label | Sample Analysis Request | QM |
| 8 | Samples submitted to QC lab | Inspection Lot creation | QM |
| 9 | QC inbox batch receive | Inspection lot receive | QM |
| 10 | QR scan → full analysis form | QA transaction navigate | QM |
| 11 | QC analysis completed | Usage Decision | QM |
| 12 | CSE auto-generated | Inspection Report | QM |
| 13 | QC Manager approves CSE (Stage 1) | QM approval workflow | QM |
| 14 | Production Manager approves CSE (Stage 2) | CO approval | CO |
| 15 | Pre-sales clearance granted | Release for Quotation | SD |
| 16 | MOQ check | Minimum Order Quantity check | SD |
| 17 | Material availability check | ATP check / MD04 | PP/MRP |
| 18 | Estimation: unit price calculated | CK11N / ZQT1 estimate | CO-PC |
| 19 | Quotation created (draft) | Quotation (VA21) | SD |
| 20 | Sales Rep submits quotation for approval | Internal approval | SD |
| 21 | Manager approves quotation | Quotation release | SD |
| 22 | Quotation sent to customer | Output: quotation print | SD |
| 23 | Customer response: accept/reject/counter | Customer feedback | SD |
| 24 | Counter: create revision | Quotation revision | SD |
| 25 | Manager approves revised quotation | — | SD |
| 26 | Customer accepts final quotation | Quotation → Order intent | SD |
| 27 | Proforma Invoice created and sent | Pro Forma Invoice | SD |
| 28 | Customer PO captured | Sales Order (VA01) | SD |
| 29 | Pre-production sample | Pre-production sample | QM |
| 30 | Customer approves pre-prod sample | Final approval | QM |
| 31 | Job Card created | Production Order (CO01) | PP |
| 32 | Job Card approved | Production Order Release | PP |
| 33 | Material PR auto-created if not in stock | Purchase Requisition (ME51N) | MM |
| 34 | PR approved → Supplier PO → sent | Purchase Order (ME21N) | MM |
| 35 | Materials received | Goods Receipt (MIGO 101) | MM |
| 36 | Production phases 1-17 | Process Order execution | PP-PI |
| 37 | Dispatch with transporter + AWB | Outbound Delivery (VL01N) | SD |
| 38 | Customer feedback captured | Customer satisfaction | CRM |
| 39 | Inquiry closed → Deal marked Won | Sales Order closed, CO-PA | CO-PA |

### Inquiry Stage Flow

```
new → in_progress → sample_qc → clearance → estimation → 
quoted → negotiating → price_accepted → order_confirmed → 
in_production → ready_dispatch → delivered → closed
```

### Inquiry Number Format

`INQ-FP-YYYY-NNNNN` (e.g., INQ-FP-2026-00123)

The prefix can be customized per tenant (FP for flexible packaging, HC for health care, etc.)

---

## 16. QC Sample Workflow (≡ SAP QM + CSE)

### Architecture

The QC workflow is **fully built and production-ready** (as confirmed by the PreSales QC Workflow Audit). It includes:

- SAR (Sample Analysis Request) printing with QR codes
- Real-time SSE notifications to QC lab
- SLA tracking (24-hour QC manager review deadline)
- Full analysis form with multi-reading statistics
- CSE (Customer Sample Evaluation) with dual-approval chain
- Public share link for customer review
- NCR (Non-Conformance Report) management

### Database Tables

```sql
mes_presales_samples          -- Sample registrations (SMP-FP-YYYY-XXXXX)
mes_qc_analyses               -- Full QC analysis records with test results
mes_qc_test_results           -- Per-parameter readings (multiple readings/parameter)
mes_cse_reports               -- CSE reports (CSE-FP-YYYY-XXXXX) with dual approval
mes_cse_revisions             -- Audit trail of all CSE actions
mes_qc_equipment_used         -- Calibrated equipment log per parameter
mes_presales_attachments      -- TDS, artwork, QC evidence files
```

### Standard QC Test Library (seeded per tenant)

| Test Code | Test Name | Category | Method | Unit |
|-----------|-----------|----------|--------|------|
| THICK-001 | Total Thickness | Physical | ASTM D374 | μm |
| TENSILE-MD | Tensile Strength MD | Physical | ASTM D882 | MPa |
| TENSILE-TD | Tensile Strength TD | Physical | ASTM D882 | MPa |
| ELONG-MD | Elongation at Break MD | Physical | ASTM D882 | % |
| COF-001 | Coefficient of Friction | Optical | ASTM D1894 | μ |
| HAZE-001 | Haze | Optical | ASTM D1003 | % |
| OTR-001 | Oxygen Transmission Rate | Barrier | ASTM D3985 | cc/m²/day |
| WVTR-001 | Water Vapor Trans. Rate | Barrier | ASTM F1249 | g/m²/day |
| SEAL-001 | Seal Strength | Seal | ASTM F88 | N/15mm |
| BURST-001 | Burst Pressure | Seal | ASTM F1140 | kPa |
| PRINT-ADH | Print Adhesion | Print | ASTM D3359 | Rating |
| COLOR-DE | Color Delta E | Print | ISO 12647 | ΔE |

### CSE Approval Chain (≡ SAP Usage Decision dual-approval)

```
QC Analyst submits analysis
        ↓
CSE auto-generated (status: pending_qc_manager)
        ↓
QC Manager reviews → Approve / Reject / Request Revision
        ↓ (on approve)
status: pending_production → Production Manager notified
        ↓
Production Manager → Final Approve / Reject
        ↓ (on approve)
Sample status: approved → Sales Rep notified
        ↓
Inquiry phase auto-advances to 'clearance'
```

### Known Bugs (Fix Before New Features)

| Bug | File | Fix |
|-----|------|-----|
| BUG-01: Production Manager never notified | `cse.js:189` | Change `'pending_qc'` → `'pending_qc_manager'` |
| BUG-02: QCScanPage bypasses CSE workflow | `QCScanPage.jsx` | Remove result submission; show "Open Analysis Form" button |
| BUG-03: Template product_group filter ignored | `templates.js` | Add product_group WHERE clause to SQL |
| BUG-04: QC inbox shows all divisions | `qc.js GET /inbox` | Add `AND i.division = 'FP'` (or parameterize) |
| BUG-05: Double email notification | `samples.js PATCH` | Remove notification block from individual PATCH |

---

## 17. Quotation & Negotiation (≡ SAP SD Quotation)

### Quotation Database

```sql
mes_quotations (
  id, inquiry_id, estimation_id,
  quote_number,        -- QT-FP-YYYY-NNNNN
  version_number,      -- For revisions (1, 2, 3...)
  parent_quotation_id, -- Links revisions to original
  negotiation_round,   -- Round counter (0, 1, 2...)
  status,              -- draft → pending_approval → approved → sent → 
                       -- under_negotiation → accepted → rejected → expired → superseded
  estimation_data,     -- JSONB snapshot of full cost calculation
  submitted_by, submitted_at,
  approved_by, approved_at,
  rejected_by, rejected_at, rejection_reason,
  revision_notes,
  customer_response_date, customer_response_notes,
  sent_at, sent_to_emails, opened_at
)

mes_quotation_approvals (  -- Audit trail
  id, quotation_id, action, actor_id, actor_name, notes, created_at
  -- action: 'submitted' | 'approved' | 'rejected' | 'revision_requested'
)
```

### Approval Workflow (Phase 1 deliverable)

```
Sales Rep creates draft quotation (estimation_data JSONB auto-populated)
        ↓
POST /quotations/:id/submit → status: pending_approval
    → Notifies all isAdminOrMgmt users (SSE + email)
        ↓
Manager: POST /quotations/:id/approve → status: approved
      OR POST /quotations/:id/reject → status: rejected (rep notified with reason)
      OR POST /quotations/:id/request-revision → back to draft (rep notified with notes)
        ↓
POST /quotations/:id/send → status: sent (GUARD: must be approved first)
        ↓
Customer responds: accept / reject / counter
POST /quotations/:id/customer-response
        ↓ (if counter)
POST /quotations/:id/create-revision → new quotation record (version_number+1)
```

### PDF Generation

- **DRAFT watermark**: Diagonal red "DRAFT — NOT FOR CUSTOMER" on unapproved quotations
- **Approved footer**: "Approved by: [name] on [date]"
- Company logo + branded header
- Full itemised cost breakdown from estimation_data JSONB

### Negotiation Timeline (NegotiationTimeline.jsx)

Vertical timeline showing all quotation versions with:
- Original price vs revised price per version
- Customer counter-offers
- Manager decisions with notes
- negotiation_round badge

---

## 18. Job Card (≡ SAP Production Order CO01)

### Job Card Database

```sql
mes_job_cards (
  id, job_card_number,   -- JC-FP-YYYY-NNNNN
  inquiry_id, quotation_id, customer_po_id, cse_id,
  product_name, product_group,
  run_quantity, quantity_unit,     -- e.g., 5000, 'Kgs'
  delivery_date,
  material_requirements JSONB,     -- BOM: [{material_name, spec, required_qty,
                                   --  unit, available_qty, status, pr_id, po_id}]
  print_colors INT,
  substrate VARCHAR(255),
  dimensions VARCHAR(100),
  special_instructions TEXT,
  status,    -- draft → pending_approval → approved → in_production → completed → cancelled
  mes_job_id,           -- Links to mes_jobs (17-phase flow)
  approved_by, approved_at,
  created_by, created_at
)
```

### Auto-Population from Estimation

When creating a job card from an approved inquiry:
- `product_name` ← inquiry product_name
- `substrate` ← from estimation materials (first substrate row)
- `dimensions` ← from estimation dimensions
- `run_quantity` ← from accepted quotation
- `delivery_date` ← from customer PO requested_delivery_date
- `material_requirements` ← from material availability check (mes_presales_material_checks)
- `print_colors` ← from estimation operations (Printing enabled → color count)

### Job Card Approval → MES Job Creation

```
POST /job-cards/:id/approve (canCreateJobCard + isManagement required)
        ↓
1. Insert mes_jobs record (links job card to 17-phase flow)
2. Set inquiry_stage = 'in_production'
3. Call dealSyncService.syncDealFromInquiry → deal.stage = 'in_production'
4. Notify all production departments + Sales Rep (SSE)
```

### Job Card PDF (JobCardPDF.jsx)

A4 printable job card with:
- Company logo and job card number
- Customer name and delivery date
- Product specifications table
- Material BOM table with availability status
- Print parameters (colors, substrate, dimensions)
- Two signature blocks: Production Manager + QC Manager

---

## 19. Procurement Flow (≡ SAP MM: PR → PO → GR)

### Database Tables

```sql
mes_purchase_requisitions (
  id, pr_number,          -- PR-FP-YYYY-NNNNN
  job_card_id,
  items JSONB,            -- [{material_name, spec, required_qty, unit, estimated_price}]
  total_estimated_value,
  status,    -- draft → pending_approval → approved → partially_ordered → fully_ordered
  requested_by, approved_by, approved_at
)

mes_supplier_purchase_orders (
  id, po_number,          -- SPO-FP-YYYY-NNNNN
  pr_id, supplier_name,
  items JSONB,            -- [{material_name, qty, unit_price, total}]
  total_amount, currency,
  expected_delivery_date, actual_delivery_date,
  status,    -- draft → pending_approval → approved → sent → acknowledged → received → cancelled
  created_by, approved_by
)

mes_stock_receipts (
  id, supplier_po_id,
  received_by, received_date,
  items JSONB,            -- [{material_name, qty_ordered, qty_received, unit}]
  notes
)
```

### Auto-PR Creation

When a Job Card BOM has `not_available` lines:
→ System auto-creates a `mes_purchase_requisitions` record
→ Notifies Procurement Manager + Manager (SSE)

### Flow

```
Job Card BOM: material status = not_available
        ↓ (auto-trigger)
PR created → Procurement Manager + Manager notified
        ↓
Manager approves PR → Procurement team notified
        ↓
Supplier PO created by procurement → Manager approves → SPO sent to supplier
        ↓
Storekeeper records receipt (mes_stock_receipts)
        ↓
BOM lines updated: not_available → available
All BOM available? → Job Card material_status = confirmed
        ↓
Production Manager + Sales Rep notified
```

### Naming Convention (no conflicts)

- `mes_customer_purchase_orders` — customer's formal PO document confirming the sale
- `mes_purchase_requisitions` — internal request for materials to procurement
- `mes_supplier_purchase_orders` — PO raised to external material suppliers

---

# PART 5 — PRODUCTION EXECUTION

## 20. 17-Phase Job Flow (≡ SAP PP-PI Process Order Lifecycle)

### Overview

The MES Flow module (`/mes/flow`) tracks every job through 17 production phases across 5 stage groups. This is the ProPackHub equivalent of the SAP PP-PI Process Order lifecycle (COR1 → CORS → MIGO 101).

### 5 Stage Groups × 17 Phases

```
Stage Group 1: PRE-SALES (phases 1-4)
  01. Inquiry Created
  02. QC Sample Submitted
  03. QC Cleared / CSE Approved
  04. Estimation & Quotation

Stage Group 2: QUOTATION & ORDER (phases 5-8)
  05. Quotation Sent
  06. Customer PO Received
  07. Pre-Production Sample Approved
  08. Job Card Approved

Stage Group 3: PRE-PRODUCTION (phases 9-11)
  09. Material Procurement
  10. Prepress / Artwork Approval
  11. Machine Scheduling

Stage Group 4: PRODUCTION & QC (phases 12-15)
  12. Printing / Processing
  13. Lamination / Coating
  14. Slitting / Finishing
  15. Final QC Inspection

Stage Group 5: DELIVERY & CLOSE (phases 16-17)
  16. Packing & Dispatch
  17. Delivered & Closed
```

### Stage Configuration (from JobFlowTracker.jsx)

```javascript
STAGE_CONFIG = {
  presales:      { label: 'Pre-Sales',        color: '#1976D2' },
  quotation:     { label: 'Quotation & Order', color: '#388E3C' },
  preproduction: { label: 'Pre-Production',   color: '#F57C00' },
  production:    { label: 'Production & QC',  color: '#E65100' },
  delivery:      { label: 'Delivery & Close', color: '#689F38' },
}
```

### Department Configuration (from JobFlowTracker.jsx)

```javascript
DEPT_CONFIG = {
  sales:       'Sales',
  qc:          'QC',
  prepress:    'Prepress',
  estimation:  'Estimation',
  procurement: 'Procurement',
  production:  'Production',
  inkhead:     'Ink Head',
  maintenance: 'Maintenance',
  accounts:    'Accounts',
  logistics:   'Logistics',
}
```

### mes_jobs Database Table

```sql
CREATE TABLE mes_jobs (
  id SERIAL PRIMARY KEY,
  job_number VARCHAR(50) UNIQUE NOT NULL,    -- JOB-FP-YYYY-NNNNN
  job_card_id INT REFERENCES mes_job_cards(id),
  inquiry_id INT REFERENCES mes_presales_inquiries(id),

  -- Current position in flow
  current_phase INT DEFAULT 1,               -- 1-17
  current_stage VARCHAR(50),                 -- presales/quotation/preproduction/production/delivery
  current_department VARCHAR(50),

  -- Status
  status VARCHAR(50) DEFAULT 'active',       -- active, paused, completed, cancelled

  -- Routing (which phases apply to this job)
  routing JSONB,
  -- [{ phase: 12, name: "Printing", dept: "production", machine: "GRV-001",
  --    status: "completed", started_at, completed_at, operator_id, notes }]

  -- Progress
  phases_completed INT DEFAULT 0,

  -- Dates
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  due_date DATE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phase advance log
CREATE TABLE mes_job_phase_log (
  id SERIAL PRIMARY KEY,
  job_id INT REFERENCES mes_jobs(id),
  phase_number INT NOT NULL,
  phase_name VARCHAR(100),
  department VARCHAR(50),
  action VARCHAR(30),       -- 'start' | 'complete' | 'pause' | 'hand_off'
  actor_id INT,
  actor_name VARCHAR(255),
  notes TEXT,
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Phase Advance → Inquiry Stage Sync (Phase 5 deliverable)

When flow.js advances a phase:
```javascript
// server/routes/mes/flow.js — POST /jobs/:id/advance-phase
1. Update current_phase in mes_jobs
2. Update inquiry_stage in mes_presales_inquiries:
   - Phases < final production: inquiry_stage = 'in_production'
   - Final production phase: inquiry_stage = 'ready_dispatch'
3. Call dealSyncService.syncDealFromInquiry()
4. Notify sales rep: SSE notification with phase name
```

### JobFlowTracker Views (from `src/components/MES/Flow/JobFlowTracker.jsx`)

**Job List View** (default):
- All active jobs with phase progress bar
- Filter by status, department, due date
- Color-coded by stage group
- Due date indicators (overdue = red)

**Job Detail View**:
- Full phase timeline with department badges
- Activity log per phase
- File attachments per phase
- Hand-off action: advances to next phase + notifies next department
- Comment thread per phase

---

## 21. Department Operations

### Extrusion Operations

The extrusion department produces extruded film rolls. In the context of the 17-phase flow:

- **Phase**: Production (phase 12 or as configured in routing)
- **Department**: Production
- **Machine**: Blown Film Extruder (EXT-001)
- **Output**: Extruded film rolls — each gets a unique Roll ID
- **Two-phase link**: Estimation was done at product-group level; in production, specific grade is confirmed

**Key production data per run**:
- Actual output kg (vs estimated)
- Layer A/B/C consumption (vs recipe)
- Machine hours (vs standard hours from operation table)
- Roll assignments: each roll gets Roll ID with net weight, width, length

### Printing Operations

- **Phase**: Production (Printing phase in routing)
- **Department**: Production + Ink Head (ink preparation)
- **Key data**: Actual ink consumed per color (container weight difference), press speed, registration quality
- **Two-phase link**: Estimated ink GSM per color vs actual consumption

### Lamination Operations

- **Phase**: Production (Lamination phase in routing)
- **Department**: Production
- **Key data**: Adhesive mix batch (Part A + Part B + Solvent weights), actual coat weight, bond strength test result, curing room tracking
- **Two-phase link**: Estimated adhesive g/m² vs actual

### Coating Operations

- **Phase**: Production (Coating phase in routing)
- **Department**: Production
- **Key data**: Lacquer viscosity log, coat weight per roll, seal strength test, solvent recovery
- **Two-phase link**: Estimated lacquer g/m² vs actual

### Slitting Operations

- **Phase**: Production (Slitting/Finishing phase in routing)
- **Department**: Production
- **Key data**: Slit pattern (widths × lanes), trim waste weight per job, actual yield
- **Two-phase link**: Estimated yield loss % vs actual trim waste

### Bag Making Operations

- **Phase**: Production (Finishing phase in routing)
- **Department**: Production
- **Key data**: Bags per minute (actual vs standard), reject count by category, seal strength per batch
- **Two-phase link**: Estimated film per bag vs actual consumption

---

## 22. MRP / Auto-Planning (≡ SAP MRP Live)

### Concept

SAP MRP Live (MD01N) processes all demands and generates procurement proposals. ProPackHub's Auto-Planning Engine does the equivalent — checking PIRs (Planned Independent Requirements) and open inquiries to suggest job creation and procurement.

### Planning Logic

```
Demand Sources:
  → mes_presales_inquiries (active orders)
  → mes_forecasts (demand forecasts)
  → Reorder points (raw material stock alerts)

Supply Sources:
  → mes_stock_receipts (incoming materials)
  → mes_supplier_purchase_orders (open POs)
  → mes_job_cards (production in progress)

Net Requirements:
  requiredQty - (stockOnHand + openPOs + inProductionQty)
  If > 0: create Purchase Requisition or suggest Job Card
```

### Material Availability Check (≡ SAP MD04 Stock/Requirements List)

When a Job Card is created, the BOM material check:
```javascript
// For each material in material_requirements JSONB:
availableQty = currentStock - reservedQty
status = availableQty >= requiredQty ? 'available' : 'not_available'
// not_available triggers PR auto-creation
```

### Reorder Alerts (≡ SAP MRP Exception Messages)

```sql
CREATE TABLE mes_stock_alerts (
  id SERIAL PRIMARY KEY,
  alert_type VARCHAR(50),
  -- 'low_stock' | 'overstock' | 'expiring_soon' | 'slow_moving'
  material_id INT,
  current_qty DECIMAL(18,4),
  threshold_qty DECIMAL(18,4),
  expiry_date DATE,
  status VARCHAR(20) DEFAULT 'active',
  -- 'active' | 'acknowledged' | 'resolved'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

# PART 6 — CRM & MIS

## 23. CRM Module (≡ SAP CRM + CO-PA)

### CRM Routes (from CRMModule.jsx)

```
/crm/my-day         → MyDayDashboard (personal daily view)
/crm/worklist       → CRMWorklist (task list + activities)
/crm/customers      → CustomerList (all customers — management) / MyCustomers (rep)
/crm/customers/:id  → CustomerDetail (contacts, inquiries, timeline, analytics)
/crm/prospects      → ProspectManagement / MyProspects
/crm/pipeline       → DealPipeline (Kanban deal stages)
/crm/inquiries      → InquiryBoard (Kanban inquiry stages)
/crm/visits         → FieldVisitPlanner (field visit management)
/crm/analytics      → CRMAnalytics (conversion, performance)
/crm/reports        → CRMSalesReport (sales reports)
/crm/budget         → CRMBudgetView/Entry (budget vs actual)
/crm/overview       → SalesCockpit (full overview — management)
/crm/lost-business  → LostBusiness (lost deal analysis)
```

### CRM Key Tables

```sql
-- Prospects (pre-customer leads)
fp_prospects (id, company_name, contact_name, source, status, assigned_rep_id,
              technical_brief JSONB, created_at)

-- Customers (converted prospects + existing customers)
fp_customer_unified (id, company_name, customer_code, sales_rep_group_id,
                     industry, credit_limit, rating, is_active)

-- Contacts
crm_contacts (id, customer_id, full_name, role, email, phone,
              can_approve_samples, can_place_orders)

-- Deals
crm_deals (id, customer_id, inquiry_id, title, stage, value,
           probability, expected_close_date, sales_rep_id)

-- Activities
crm_activities (id, customer_id, activity_type, subject, notes,
                scheduled_at, completed_at, created_by)

-- Field Visits
crm_field_visits (id, sales_rep_id, trip_date, status,
                  planned_customers JSONB, actual_customers JSONB,
                  expenses JSONB, report_url)
```

### Deal-Inquiry Bidirectional Sync (dealSyncService.js — Phase 2)

When an inquiry advances stage, the linked CRM deal automatically updates:

```javascript
// Stage mapping: inquiry_stage → deal.stage
estimation / quoted / negotiating → 'negotiation'
order_confirmed / in_production / ready_dispatch / delivered → 'won'
lost → 'lost'
```

### Management vs Rep View

**Management (isManagement = true)**:
- Tabs: Overview (SalesCockpit), All Customers, Prospects (all reps), Deals Pipeline (all), Inquiries (all + rep filter), Team, Analytics, Reports, Budget
- Full Pipeline Dashboard: funnel chart, cycle times, stalled items, revenue forecast
- Can assign leads to reps
- Can allocate tasks to reps
- Cross-rep activity feed with rep name badge

**Sales Rep (isManagement = false)**:
- Tabs: My Day, My Customers, My Prospects, My Pipeline, My Performance
- All data pre-scoped to own sales_rep_group_id
- No rep filter dropdown
- No assign-to-rep controls

### Full Pipeline Dashboard (FullPipelineDashboard.jsx — Phase 5)

For management only (`/crm/overview`):

- **Funnel Chart**: opportunity → technical_assessment → estimation_quotation → order_processing → production → delivery
- **Cycle Times**: average days per phase from stage_changed_at timestamps
- **Stalled Items**: inquiries where stage_changed_at < NOW() - 7 days
- **Revenue Forecast**: SUM(accepted quotation values) at order_confirmed+ stages
- **Phase Drill**: click funnel phase → filtered inquiry list

---

## 24. MIS / Analytics (≡ SAP BW + SAC + CO-PA)

### AEBF Module (Actual / Estimate / Budget / Forecast)

The MIS module is the most advanced analytics layer — equivalent to SAP's combination of BW (data warehouse) + CO-PA (profitability) + SAC (Analytics Cloud).

```
/dashboard          → Main MIS dashboard (management only, level ≥ 6)

AEBF Tabs:
  Actual Tab        → Actual sales data (from Oracle ERP sync or manual entry)
  Estimate Tab      → Sales estimates for current period
  Budget Tab        → Annual budget by rep / product group / customer
  Forecast Tab      → Rolling forecast based on pipeline
  ForecastPL Tab    → P&L forecast
  BudgetPL Tab      → Budget vs actual P&L
```

### Oracle ERP Integration

For tenants with existing ERP systems, ProPackHub syncs actual sales data:
```
POST /api/fp/sync-oracle-excel   → Sync actual data from Oracle ERP
GET  /api/fp/sync-oracle-excel/progress → SSE real-time sync progress
```

### AEBF Data Model

```sql
-- Actuals (from Oracle sync or manual entry)
fp_actuals (
  id, year, month, division,
  sales_rep_group_id, customer_id, product_group_id,
  actual_kg, actual_revenue, actual_gp,
  data_source   -- 'oracle_sync' | 'manual'
)

-- Budget
fp_budget (
  id, year, month, division,
  sales_rep_group_id, customer_id, product_group_id,
  budget_kg, budget_revenue, budget_gp,
  version INT DEFAULT 1
)

-- Forecast
fp_forecast (
  id, year, month, division,
  sales_rep_group_id, customer_id, product_group_id,
  forecast_kg, forecast_revenue, forecast_gp,
  confidence_pct
)
```

### P&L Reporting

```
/api/pl/*     → P&L endpoints
/api/aebf/*   → AEBF data endpoints

Key reports:
  Budget vs Actual by rep / product group / period
  Revenue forecast based on pipeline value
  Win rate by rep, product group, customer segment
  Customer lifetime value analysis
  Lost business analysis by reason
```

### AI Learning System

ProPackHub includes an AI Learning Service (`AILearningService.js`) that:
- Learns from historical data patterns (seasonality, customer behavior)
- Provides smart suggestions for quotation pricing
- Identifies at-risk customers based on activity patterns
- Forecasts revenue based on pipeline conversion rates

---

# PART 7 — IMPLEMENTATION

## 25. Database Schema Reference

### Schema Organization

All tables follow these prefixes within the tenant schema:

| Prefix | Module | Example |
|--------|--------|---------|
| `mes_presales_*` | MES Pre-Sales | `mes_presales_inquiries` |
| `mes_qc_*` | MES QC | `mes_qc_analyses` |
| `mes_job_*` | MES Job Cards | `mes_job_cards` |
| `mes_*` | MES General | `mes_jobs`, `mes_quotations` |
| `crm_*` | CRM | `crm_deals`, `crm_activities` |
| `fp_*` | MIS/AEBF | `fp_actuals`, `fp_budget` |

### Current Migration Sequence

```
Main sequence: 001 → 319 (319 migrations total)
CRM sequence: crm-001 → crm-013 (to be extended to crm-015)
MES Pre-Sales: mes-presales-001 → mes-presales-011 (to be extended)
```

### Pending Migrations (from Master Plan v3)

| Migration | Purpose | Priority |
|-----------|---------|----------|
| crm-014-rep-scope-fix | Populate sales_rep_group_id for all active reps | P0 |
| mes-presales-012-quotation-workflow | Parent quotation ID, version, approvals table | P1 |
| mes-presales-013-customer-po | mes_customer_purchase_orders table | P2 |
| mes-presales-014-dispatch-feedback | transporter/AWB fields, delivery feedback | P2 |
| crm-015-deal-sync | Note + source columns on crm_deal_stage_history | P2 |
| mes-presales-015-job-cards | mes_job_cards table | P3 |
| mes-presales-016-procurement | PR, SPO, stock receipts tables | P4 |
| mes-presales-017-sla-tracking | sent_to_qc_at column + SLA index | P1 |

### Key Table: mes_presales_inquiries

The central table for the entire pre-sales workflow:

```sql
mes_presales_inquiries (
  id SERIAL PRIMARY KEY,
  inquiry_number VARCHAR(50) UNIQUE,    -- INQ-FP-YYYY-NNNNN
  customer_id INT,
  customer_name VARCHAR(255),
  sales_rep_group_id INT,               -- Scoping for rep-level access
  division VARCHAR(20) DEFAULT 'FP',
  product_group VARCHAR(100),
  product_name VARCHAR(255),
  quantity DECIMAL(18,2),
  quantity_unit VARCHAR(20),
  source VARCHAR(50),    -- exhibition, visit, whatsapp, referral, email
  priority VARCHAR(10),  -- high, medium, normal, low

  -- Stage tracking (≡ SAP inquiry_stage in SD)
  presales_phase VARCHAR(50),           -- inquiry, sample_qc, clearance, estimation, etc.
  inquiry_stage VARCHAR(50),            -- detailed stage for UI
  stage_changed_at TIMESTAMPTZ,        -- For cycle time calculation

  -- Pre-sales flags
  presales_cleared BOOLEAN DEFAULT false,
  clearance_granted_by INT,
  clearance_granted_at TIMESTAMPTZ,

  -- Dispatch
  transporter_name VARCHAR(255),        -- Phase 2 addition
  awb_number VARCHAR(100),
  dispatch_date DATE,
  expected_delivery_date DATE,

  -- Audit
  created_by INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

### Key Table: mes_quotations

```sql
mes_quotations (
  id SERIAL PRIMARY KEY,
  quote_number VARCHAR(50) UNIQUE,      -- QT-FP-YYYY-NNNNN
  inquiry_id INT,
  estimation_id INT,                    -- Links to saved estimation

  -- Versioning (≡ SAP quotation revision)
  version_number INT DEFAULT 1,
  parent_quotation_id INT,              -- NULL for original
  negotiation_round INT DEFAULT 0,

  -- Status workflow
  status VARCHAR(30),
  -- draft → pending_approval → approved → sent → under_negotiation →
  -- accepted → rejected → expired → superseded

  -- Approval
  submitted_by INT, submitted_at TIMESTAMPTZ,
  approved_by INT, approved_at TIMESTAMPTZ,
  rejected_by INT, rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  revision_notes TEXT,

  -- The full estimation snapshot
  estimation_data JSONB,    -- Complete Phase 1 calculation payload

  -- Commercial
  total_amount DECIMAL(18,2),
  currency VARCHAR(3) DEFAULT 'USD',
  valid_until DATE,
  payment_terms VARCHAR(100),
  delivery_terms VARCHAR(100),

  -- Customer tracking
  sent_at TIMESTAMPTZ, sent_to_emails TEXT[],
  customer_response_date TIMESTAMPTZ,
  customer_response_notes TEXT,

  created_by INT, created_at TIMESTAMPTZ DEFAULT NOW()
)
```

---

## 26. API Routes Reference

### MES Pre-Sales Routes

```
=== INQUIRIES ===
POST   /api/mes/presales/inquiries                  Create inquiry
GET    /api/mes/presales/inquiries                  List (scoped by role)
GET    /api/mes/presales/inquiries/:id              Get inquiry detail
PATCH  /api/mes/presales/inquiries/:id              Update inquiry
POST   /api/mes/presales/inquiries/:id/submit-to-qc Batch submit samples to QC
PATCH  /api/mes/presales/inquiries/:id/clearance    Grant/revoke pre-sales clearance
POST   /api/mes/presales/inquiries/:id/recall       Recall samples from QC

=== SAMPLES ===
POST   /api/mes/presales/inquiries/:id/samples      Register sample
POST   /api/mes/presales/samples/:id/sar            Generate SAR PDF
PATCH  /api/mes/presales/samples/:id/status         Update sample status
GET    /api/mes/presales/samples/by-number/:num     Lookup by QR scan number

=== QC ===
GET    /api/mes/presales/qc/inbox                   QC inbox (division-filtered)
POST   /api/mes/presales/qc/analyses                Create/save analysis
POST   /api/mes/presales/qc/analyses/:id/submit     Submit analysis → auto-generate CSE
POST   /api/mes/presales/cse/:id/approve            QC Manager or Prod Manager approval

=== TEMPLATES ===
GET    /api/mes/presales/qc/templates               QC templates (product_group filtered)

=== ESTIMATIONS ===
POST   /api/mes/presales/estimations                Save estimation
GET    /api/mes/presales/estimations                List (by inquiry_id)
GET    /api/mes/presales/estimation/defaults        Load product group defaults
POST   /api/mes/presales/estimations/:id/create-quotation  Create quotation from estimation
PATCH  /api/mes/presales/estimations/:id/actuals    Save Phase 2 actuals

=== MATERIALS ===
GET    /api/mes/presales/materials                  Material master (grouped by type)

=== QUOTATIONS ===
POST   /api/mes/presales/quotations                 Create quotation
GET    /api/mes/presales/quotations/:id             Get quotation
POST   /api/mes/presales/quotations/:id/submit      Submit for approval
POST   /api/mes/presales/quotations/:id/approve     Manager approves
POST   /api/mes/presales/quotations/:id/reject      Manager rejects
POST   /api/mes/presales/quotations/:id/request-revision  Request revision
POST   /api/mes/presales/quotations/:id/create-revision   Create new version
POST   /api/mes/presales/quotations/:id/send        Send to customer (must be approved)
POST   /api/mes/presales/quotations/:id/customer-response  Record response
GET    /api/mes/presales/quotations/:id/approval-history   Audit trail

=== CUSTOMER PO ===
POST   /api/mes/presales/customer-po                Capture customer PO
GET    /api/mes/presales/customer-po/:id            Get customer PO

=== JOB CARDS ===
POST   /api/mes/presales/job-cards                  Create job card
GET    /api/mes/presales/job-cards                  List (role-scoped)
GET    /api/mes/presales/job-cards/:id              Get job card
PATCH  /api/mes/presales/job-cards/:id              Update (draft only)
POST   /api/mes/presales/job-cards/:id/approve      Approve → creates mes_job
PATCH  /api/mes/presales/job-cards/:id/material-status  Update BOM line status

=== PROCUREMENT ===
POST   /api/mes/presales/purchase-requisitions              Create PR
POST   /api/mes/presales/purchase-requisitions/:id/approve  Approve PR
POST   /api/mes/presales/supplier-purchase-orders           Create SPO
POST   /api/mes/presales/supplier-purchase-orders/:id/approve  Approve SPO
POST   /api/mes/presales/supplier-purchase-orders/:id/send  Send to supplier
POST   /api/mes/presales/stock-receipts                     Record receipt

=== FLOW ===
GET    /api/mes/jobs                                List active jobs
GET    /api/mes/jobs/:id                            Get job with phases
POST   /api/mes/jobs/:id/advance-phase              Advance to next phase
POST   /api/mes/jobs/:id/log-activity               Log phase activity
POST   /api/mes/jobs/:id/upload-attachment          Upload phase attachment
```

### CRM Routes

```
=== CUSTOMERS ===
POST   /api/crm/customers          Create customer
GET    /api/crm/customers          List (role-scoped: management=all, rep=own)
GET    /api/crm/customers/:id      Get customer + contacts + timeline
PATCH  /api/crm/customers/:id      Update customer

=== DEALS ===
POST   /api/crm/deals              Create deal
GET    /api/crm/deals              List deals (scoped)
PATCH  /api/crm/deals/:id/stage    Advance deal stage
GET    /api/crm/deals/:id/unified-timeline  Merged CRM + MES activity timeline

=== ACTIVITIES ===
POST   /api/crm/activities         Log activity (call, meeting, email, visit)
GET    /api/crm/activities         List activities (scoped)

=== TASKS ===
POST   /api/crm/tasks              Create task (assigned_to for management)
GET    /api/crm/tasks              List (mine=true for reps)

=== PIPELINE DASHBOARD ===
GET    /api/crm/pipeline-dashboard  Full funnel (management only)
  → Returns: funnel_counts, avg_cycle_times, stalled_items, revenue_forecast
```

---

## 27. Implementation Roadmap

### Phase 0: Critical Bug Fixes (Day 1-2) — BLOCKS EVERYTHING

All bugs must be resolved before any new feature work begins. Each fix is a separate PR.

| Task | File | Fix | Effort |
|------|------|-----|--------|
| P0-01: Fix $${paramIndex} SQL | crm/customers.js, prospects.js, dashboard.js | `= ${p}` → `= $${p}` | 15 min |
| P0-02: Fix salesRep.full_name | crm/customers.js | `.full_name` → `.fullName` | 5 sec |
| P0-03: resolveRepGroup() direct ID | crmService.js | Use direct ID lookup, fuzzy fallback | 2 hrs |
| BUG-01: CSE notification dead branch | cse.js:189 | `'pending_qc'` → `'pending_qc_manager'` | 5 min |
| BUG-02: QCScanPage bypasses CSE | QCScanPage.jsx | Remove submit; add "Open Analysis Form" button | 2 hrs |
| BUG-03: Template filter ignored | templates.js | Add product_group WHERE clause | 30 min |
| BUG-04: QC inbox missing division | qc.js GET /inbox | Add `AND i.division = $N` | 15 min |
| BUG-05: Double notification | samples.js PATCH | Remove notification from PATCH | 30 min |
| ISS-01: No rep notification on QC | qc.js POST /submit | Add notifyUsers to inquiry owner | 1 hr |
| ISS-02: Clearance admin-only | inquiries.js PATCH /clearance | `isAdminOrMgmt()` instead of `admin` only | 30 min |

**Verification**: Run Phase 0 checklist before any Phase 1 work.

---

### Phase 1: Quotation Workflow + QC Notifications (Week 1)

**P1-1: Quotation Submit/Reject/Revise Endpoints**
- POST `/quotations/:id/submit` — draft → pending_approval, notifies managers
- POST `/quotations/:id/reject` — manager only, stores rejection_reason
- POST `/quotations/:id/request-revision` — manager only, back to draft
- PATCH `/quotations/:id/send` — GUARD: must be approved status
- GET `/quotations/:id/approval-history`
- Run: `mes-presales-012-quotation-workflow` migration

**P1-2: Quotation PDF Enhancements**
- DRAFT watermark (diagonal red) on unapproved
- Approver name in footer when approved
- Company logo + branded header

**P1-3: Quotation Negotiation Versioning**
- POST `/quotations/:id/create-revision` — clones with parent_quotation_id
- NegotiationTimeline.jsx — vertical timeline of all versions

**P1-4: SLA Breach Scheduled Job**
- `server/jobs/slaBreachChecker.js` — runs every 30 min
- Query overdue QC analyses → notify qc_manager + manager
- QCDashboard: red OVERDUE badge

**P1-5: CustomerInquiries.jsx Full Integration**
- Live inquiry_stage badge with color coding
- PhaseStepperCard: 6-macro-phase horizontal stepper
- "New Inquiry" CTA with customer pre-filled
- Management: cross-rep inquiries for this customer

**P1-6: Management Lead Assignment**
- "Assign to Rep" button on ProspectManagement + CustomerList
- Modal: dropdown of active reps
- SSE notification to newly assigned rep

---

### Phase 2: Deal Sync + Customer PO + Dispatch (Week 2)

**P2-1: CRM Deal ↔ Inquiry Auto-Sync** (dealSyncService.js)
- syncDealFromInquiry() called from pipeline.js, proforma.js, quotations.js
- Deal card shows inquiry_stage badge
- Unified timeline: merged CRM + MES events per deal

**P2-2: Customer PO Capture** (customerPO.js)
- `mes-presales-013-customer-po` migration
- ±5% value validation: show warning (not block) if PO value deviates
- On success: inquiry_stage → order_confirmed, deal → won

**P2-3: Dispatch Fields**
- transporter_name + awb_number + dispatch_date on deliver endpoint
- Customer contact notification email with tracking

**P2-4: Delivery Feedback**
- `mes-presales-014-dispatch-feedback` migration
- Star rating widget (1-5) + feedback text + reorder_likelihood

**P2-5: Task Allocation Management → Reps**
- assigned_to field on tasks
- "Assigned by [name]" badge in TaskWidget
- SSE notification to assigned user

---

### Phase 3: Job Card + Estimation UI + Quotation PDF (Weeks 3-4)

**P3-1+2: Job Card Backend + UI**
- `mes-presales-015-job-cards` migration
- Full CRUD + approve endpoint
- JobCardForm.jsx, JobCardPanel.jsx, JobCardList.jsx
- JobCardPDF.jsx: A4 printable with specs, BOM, signature blocks

**P3-3: Estimation UI — Dedicated Estimator View**
- EstimationQueue.jsx (already built) — shows inquiries at estimation/cse_approved stage
- EstimationCalculator.jsx (already built) — full cost calculation
- EstimationActuals.jsx (already built) — Phase 2 actuals
- Add `estimation_data` JSONB column to mes_quotations (if not exists)

---

### Phase 4: Material Procurement Flow (Week 5)

**P4-1+2: Procurement Backend + UI**
- `mes-presales-016-procurement` migration
- Full PR → approve → SPO → approve → send → receipt chain
- Auto-PR when Job Card BOM has not_available lines
- ProcurementDashboard.jsx for management overview

---

### Phase 5: Pipeline Dashboard + MES Flow Link (Weeks 6-7)

**P5-1: Full Pipeline Dashboard**
- FullPipelineDashboard.jsx (already exists)
- New backend endpoint: GET /api/crm/pipeline-dashboard
- Recharts FunnelChart, CycleTime bars, StalledItems table, Revenue forecast card

**P5-2: MES Flow Engine linked to Job Card**
- Job Card approve → mes_job created
- Flow phase advance → inquiry_stage auto-updates
- Sales rep notified on each phase advance

**P5-3: QC Enhancements**
- FP-specific parameter presets (thickness, tensile, COF, seal, OTR, MVTR)
- Solvent retention auto-warning for food-contact films > 10 mg/m²
- CSE PDF: logo + signature block
- Sample disposition: retain/return/dispose

---

### Phase 6: Refactoring + Test Coverage (Weeks 8-9)

**P6-1: Route File Size Enforcement** (max 300 lines)

| File | Current Lines | Split Into |
|------|--------------|-----------|
| qc.js | ~420 | qc-inbox.js, qc-analysis.js |
| proforma.js | ~480 | proforma.js, orders.js |
| quotations.js | ~450 | quotations.js, quotation-approval.js |
| inquiries.js | ~520 | inquiries-core.js, inquiries-clearance.js, inquiries-admin.js |

**P6-2: Shared Helpers**
- `buildRepScopeWhere(user, paramIndex)` — replace all inline rep-scoping WHERE clauses
- `generateSequenceNumber(prefix, sequenceName, client)` — replace duplicated numbering
- `standardNotify(inquiryId, eventType, extraData, client)` — wraps all notification calls

**P6-3: Test Coverage** (target ≥ 80%)
- Unit tests: crmAccessControl, quotationApproval, dealSync, customerPO, jobCard, procurement
- Integration tests: quotationWorkflow, customerPOFlow, jobCardFlow, procurementFlow, RBAC routes
- E2E tests: fullSalesCycle, managementPipeline, qcWorkflow, procurementChain, roleIsolation

---

## 28. Coding Rules & Standards

These rules apply to every file, every commit in ProPackHub.

| Rule | Detail |
|------|--------|
| **Small files** | Every route file ≤ 300 lines. Split when approaching limit. No God files. |
| **Small PRs** | Each PR = one atomic change. Never mix a bug fix with a new feature. |
| **Parameterised queries** | ALWAYS use `$1`, `$2` placeholders. NEVER interpolate `${}` into SQL strings. |
| **Transactions** | All writes touching >1 table: `BEGIN / COMMIT / ROLLBACK`. On any error: `ROLLBACK` before returning 500. |
| **Role checks** | ALWAYS import from `roleChecks.js` (frontend) or `_helpers.js` (backend). Never hardcode role strings inline. |
| **Scoped queries** | ALWAYS use `buildRepScopeWhere()` for any query listing customers, inquiries, tasks, or deals. |
| **Notifications** | Every status change affecting another person MUST fire an SSE notification. No silent stage transitions. |
| **SSE labels** | Every new notification type must be added to `MESNotificationBell.jsx` `typeLabel` map before PR merge. |
| **CSS naming** | CRM: `.crm-{component}-{element}` in `CRM.css`. MES: `.presales-{component}-{element}` in `PresalesInquiries.css`. |
| **Soft delete** | Never DELETE or destructive UPDATE without soft-delete (`is_deleted` flag) or explicit user confirmation. |
| **Audit trail** | All presales state changes: `logActivity()`. All CRM mutations: `logAudit()`. All deal stage changes: insert `crm_deal_stage_history`. |
| **Error responses** | All errors return `{ success: false, error: '<message>' }`. All 403s log the attempt. All 500s log full stack. |
| **Test before ship** | Before marking any task done: (1) happy path, (2) missing field → 400, (3) wrong role → 403, (4) `npm test`. |
| **No data loss** | No migration runs DELETE or DROP without soft-delete migration first. Keep all data. |
| **Migration numbering** | CRM: `crm-014`, `crm-015`… MES: `mes-presales-012`… Never reuse a number. |
| **Generic naming** | Never hardcode tenant company names. Use generic terms: "the tenant", "manufacturing company". |

### Complete Notification Map

| Event | Trigger | Channel | Recipients | Status |
|-------|---------|---------|-----------|--------|
| Samples submitted to QC | POST /submit-to-qc | Email + SSE | QC Lab, QC Mgr, Manager | ✅ Built |
| QC analysis complete → CSE | POST /analyses/:id/submit | SSE | QC roles | ✅ Built |
| QC analysis → Rep notified | POST /analyses/:id/submit | SSE | Sales Rep (owner) | ⚠️ ISS-01 |
| QC Mgr approved → Prod Mgr | POST /cse/:id/approve | SSE | Production Mgr, Manager | ⚠️ BUG-01 |
| Prod Mgr final approval → Rep | POST /cse/:id/approve | SSE | Sales Rep | ✅ Built |
| Pre-sales clearance | PATCH /clearance | SSE | Sales Rep | ✅ Built |
| SLA breach | Job every 30 min | SSE | QC Mgr, Manager | ❌ Phase 1 |
| Quotation submitted for approval | POST /submit | SSE + Email | All Sales Managers | ❌ Phase 1 |
| Quotation approved | POST /approve | SSE | Sales Rep | ✅ Built |
| Quotation rejected | POST /reject | SSE | Sales Rep (submitter) | ❌ Phase 1 |
| Lead assigned to rep | PATCH /prospects/:id | SSE | Assigned Sales Rep | ❌ Phase 1 |
| Task assigned to rep | POST /tasks | SSE | Assigned user | ❌ Phase 2 |
| Customer PO captured | POST /customer-po | SSE + Email | Sales Mgr, Prod Mgr, Procurement | ❌ Phase 2 |
| Dispatch with tracking | POST /deliver | Email | Customer contact, Sales Rep | ❌ Phase 2 |
| Job Card created | POST /job-cards | SSE | Prod Mgr, Manager, Storekeeper | ❌ Phase 3 |
| Job Card approved | POST /job-cards/:id/approve | SSE | All production depts, Sales Rep | ❌ Phase 3 |
| Material not in stock → PR | BOM check | SSE | Procurement Mgr, Manager | ❌ Phase 4 |
| PR approved | POST /pr/:id/approve | SSE | Procurement team | ❌ Phase 4 |
| Materials fully received | POST /stock-receipts | SSE | Prod Mgr, Manager, Sales Rep | ❌ Phase 4 |
| Production phase advance | POST /jobs/:id/advance | SSE | Sales Rep | ❌ Phase 5 |

---

## Appendix: SAP Transaction Quick Reference → ProPackHub Equivalent

| SAP Transaction | Purpose | ProPackHub Equivalent |
|-----------------|---------|----------------------|
| MM01/MM02 | Create/Change Material Master | Master Data → Item Master |
| CS01/CS02 | Create/Change BOM | Estimation → Material Table (inline) |
| CA01/C201 | Create Routing / Master Recipe | Estimation → Operation Table (inline) |
| CK11N | Product Cost Estimate | MES → Estimation Calculator |
| CK13N | Display Cost Estimate | Estimation → View saved estimate |
| CK24 | Release Standard Price | Costing → Period Release |
| OKN0 | Costing Variant Config | Estimation → Price Profile (STANDARD/QUOTATION) |
| MR21 | Update Material Price | Item Master → Costing → Update Market Ref |
| COR1 | Create Process Order | MES → Job Card Create |
| CORS | Confirm Process Order | MES → Flow → Phase Confirmation |
| MIGO-261 | Goods Issue | MES → Job Card → Material Issue |
| MIGO-101 | Goods Receipt | MES → Flow → Final Phase Receipt |
| KKS2 | Variance Calculation | Estimation → Actuals Panel (auto-calculated) |
| CO88 | Collective Order Settlement | MES → Period Close → Job Settlement |
| KE30 | CO-PA Profitability Report | MES → Win/Loss Analytics |
| VA21 | Create Quotation | MES → Inquiry → Quotation Panel |
| VA01 | Create Sales Order | MES → Inquiry → Customer PO Panel |
| ME51N | Purchase Requisition | MES → Procurement → PR |
| ME21N | Purchase Order | MES → Procurement → Supplier PO |
| MD04 | Stock/Requirements List | MES → Job Card → Material BOM Status |
| MD01N | MRP Live | Planning → Auto-Planning Engine |
| CM01 | Work Center Load | Master Data → Machine Capacity |
| KP26 | Activity Type Planning | Master Data → Machine → Hourly Rate |
| CKMLCP | Material Ledger Close | MES → Period Actual Cost Close |

---

*Document compiled from: SAP S/4HANA Production Planning (Jawad Akhtar, 985pp) + Mastering SAP S/4HANA 1709 (Nitin Gupta, 617pp) + W&H VAREX II Extrusion Blueprint + ProPackHub Source Code v26.2*

*Version 2.0 | March 2026 | ProPackHub SaaS Platform*

