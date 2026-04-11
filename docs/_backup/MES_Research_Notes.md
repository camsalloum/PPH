# FlexPack MES — Research & Design Notes

> **Date:** 2025 | **Project:** FP_OPW_v4_Compact.html  
> **Scope:** Order Processing Workflow for Flexible Packaging MES Landing Page

---

## 1. MES Industry Standards Research

### ISA-95 (IEC 62264) — Manufacturing Enterprise Systems

MES operates at **Level 3** of the ISA-95 automation pyramid:

| Level | Name | Examples |
|-------|------|----------|
| **4** | Business Planning & Logistics | ERP, CRM, SCM |
| **3** | Manufacturing Operations (MES) | Scheduling, dispatching, quality, tracking |
| **2** | Monitoring & Supervision | SCADA, HMI |
| **1** | Sensing & Manipulation | PLCs, sensors |
| **0** | Physical Process | Machines, conveyors |

ISA-95 defines **four main operations management areas:**
1. **Production Operations** — scheduling, dispatching, execution, data collection
2. **Quality Operations** — testing, certification, deviation management
3. **Inventory/Logistics Operations** — material movement, tracking, storage
4. **Maintenance Operations** — preventive/corrective maintenance, calibration

### MESA International — 11 Core MES Functions

| # | Function | FlexPack Mapping |
|---|----------|-----------------|
| 1 | Resource Allocation & Status | Machine allocation, capacity planning |
| 2 | Operations/Detail Scheduling | Job sequencing, delivery date commitments |
| 3 | Dispatching Production Units | WO/Job Card creation, material issuance |
| 4 | Document Control | SOPs, TDS, artwork files, plate records |
| 5 | Data Collection/Acquisition | Production data (speed, waste, downtime) |
| 6 | Labor Management | Shift handover, operator assignment |
| 7 | Quality Management | 6 quality gates, IPrQC/ILmQC/ISlQC/IHSQC, COA, COC |
| 8 | Process Management | Print → Laminate → Slit → Heat Seal routing |
| 9 | Maintenance Management | Preventive scheduling, breakdown response |
| 10 | Product Tracking & Genealogy | Batch tracking, FIFO, plate ownership |
| 11 | Performance Analysis | Waste reconciliation, yield, cost variance |

### Commercial MES Systems Researched

- **Sistrade MES** — Portuguese MES/ERP for packaging & printing industry. Covers production planning, shop floor data collection, quality management, traceability. Specifically designed for flexible packaging, labels, corrugated.
- **Esko Automation Engine** — Prepress automation for packaging. Artwork management, plate preparation, color management, proofing workflows.
- **Aptean** — MES for process manufacturing. Shop floor execution, quality, maintenance, track & trace.
- **SAP ME/MII** — Enterprise-grade MES. ISA-95 compliant. Production execution, quality, genealogy.

---

## 2. Flexible Packaging Production Process — Deep Analysis

### Complete 17-Phase Workflow (from FP_OPW_v3_Complete.html)

#### Phase 1: Customer Inquiry & Sample Receipt
- **Department:** Sales
- **Process:** Receive RFQ via email/phone/visit. Collect product requirements, physical sample, design file, or TDS.
- **Forms:** RFQ

#### Phase 2: Customer Registration & Credit Check
- **Department:** Sales + Accounts
- **Process:** New customer registration (business details, tax certs, bank info). Credit check, credit limit establishment, payment terms.
- **Trigger:** Only for new customers
- **Forms:** Customer Registration Form, Credit Application

#### Phase 3: Technical Specification Review
- **Department:** QC + Prepress
- **Process:** Physical sample analysis (CSE form). Review/create TDS: substrate, barrier, print quality, dimensions, seal strength. Artwork/design review: color count, process feasibility, plate requirements. Plate count & production needs assessment.
- **Forms:** CSE, TDS

#### Phase 4: MOQ Verification
- **Department:** Sales + Estimation
- **Process:** Verify customer quantity against MOQ calculated from complexity, setup costs, roll sizes, production efficiency.
- **Decision:** Meets MOQ → proceed | Below MOQ → negotiate or premium | Rejected → lost

#### Phase 5: Material Availability Check
- **Department:** Procurement
- **Process:** Check stock vs custom material needs. Verify supplier availability & lead times.

#### Phase 6: Cost Estimation
- **Department:** Estimation + Prepress
- **Process:** Calculate material costs (substrate, adhesives, inks, 5-15% waste), plate costs (new engraving vs existing), production costs (setup, running, labor, finishing), overhead & profit margin.
- **Forms:** Cost Estimation Sheet

#### Phase 7: Quotation & Negotiation
- **Department:** Sales
- **Process:** Prepare formal quotation with price breakdown, lead time, payment terms, 30-day validity, T&C. Negotiate pricing, quantity discounts, payment terms, delivery schedule.
- **Forms:** Quotation / PI

#### Phase 8: PO/SO Generation
- **Department:** Sales + Accounts
- **Process:** Receive & verify customer PO. Confirm payment terms (advance for new customers). Generate internal SO → triggers material procurement + artwork + scheduling.
- **Forms:** PO, PI, SO

#### Phase 9: Material Procurement
- **Department:** Procurement (Material Planning + Store Keeper + Purchasing)
- **Process:** MRP calculation → stock verification (FIFO) → PR generation → PO to suppliers → material receipt (GRN) → raw material QC (verify COA, test physical properties).
- **Quality Gate:** Raw Material QC Approval
- **Forms:** PR, PO, GRN, COA

#### Phase 10: Artwork & Plate Preparation
- **Department:** Prepress (Manager + Designers) + Sales + QC
- **Process:** 
  - Artwork file receipt & validation (AI/PDF/EPS, ≥300 DPI, CMYK/spot)
  - Color separation & design processing (trapping, registration, barcode, mirror for flexo)
  - Proof generation (soft/hard proof)
  - Customer artwork approval (critical gate)
  - Plate-ready file generation (1-bit TIFF per color)
  - Plate engraving (external vendor, 3-5 day lead)
  - Plate QC inspection
- **Repeat Order Shortcut:** Skip artwork, retrieve existing plates from storage
- **Quality Gates:** Artwork Approval, Plate QC
- **Forms:** Artwork Proof, Approval Form, Plate Order Sheet

**NOTE:** Phases 9 and 10 run in PARALLEL after SO confirmation.

#### Phase 11: Production Planning & Scheduling
- **Department:** Production Manager
- **Process:** Job sequencing (delivery priority, material availability, plate readiness, machine capacity, color changeover optimization). Machine allocation. Delivery date commitment.
- **Forms:** WO, JC (Job Card)

#### Phase 12: Ink Preparation
- **Department:** Ink Head / Ink Room + QC
- **Process:** Color specification review (Pantone/brand). Ink formulation & custom mixing. Spectrophotometer color matching. Ink quality testing (viscosity, strength, tack, adhesion, drying speed, rub resistance). Drawdown preparation. QC approval (Delta E tolerance).
- **Quality Gate:** Ink Color Approval
- **Forms:** Ink Recipe Card

#### Phase 13: Production Execution (CRITICAL PHASE)
- **Department:** Production + Ink Dispenser + QC + Sales + Maintenance
- **Sub-steps:**
  1. **Machine Setup & Plate Mounting** — plates on cylinders, anilox rollers, substrate threading, tension/speed
  2. **Ink Loading** — fill pans per station, verify sequence, check viscosity
  3. **Mechanical Test** — test print on waste material, adjust registration/pressure/ink
  4. **⚑ PPS / FAI Production** — First 50-100m on actual material. ALL colors & finishing. **MANDATORY — cannot proceed without PPS approval**
  5. **⚑ PPS / FAI Inspection** — QC inspects vs proof: visual, color (spectro), print quality, dimensions, seal strength. FAI report generated
  6. **⚑ Customer PPS Approval** — Physical sample sent to customer. **Approval REQUIRED before full production**
  7. **Full Production Run** — full quantity, hourly monitoring, GMP compliance
  8. **In-Process QC** — every 30-60 min: color consistency, registration, dimensions
  9. **Waste Reconciliation** — material consumed, actual vs expected waste, scrap by type
  10. **Plate Cleaning & Storage** — demount, clean, inspect, photograph, store
- **Quality Gates:** PPS/FAI QC Approval, Customer PPS Approval, In-Process Monitoring
- **Forms:** PPS Sample, FAI Report, IPrQC, ILmQC, ISlQC, IHSQC, JC, Maintenance Log

#### Phase 14: Final QC & Packaging
- **Department:** QC + Logistics
- **Process:** Sample from multiple rolls/boxes. Test color, print quality, dimensions, seal strength, packaging integrity, qty verification. Generate COC & COA.
- **Quality Gate:** Final QC Approval
- **Decision:** Pass → packaging & FG inventory | Fail → quarantine → investigate → rework
- **Forms:** COC, COA, DN, Packing List

#### Phase 15: Invoicing
- **Department:** Accounts
- **Process:** Invoice referencing SO & PO, actual delivered qty, attach DN & COC.
- **Forms:** Invoice

#### Phase 16: Delivery & Logistics
- **Department:** Logistics
- **Process:** Carrier selection, delivery scheduling, shipping docs, dispatch & tracking, delivery confirmation (signed DN).
- **Forms:** Shipping Docs, Signed DN

#### Phase 17: Post-Delivery & Feedback
- **Department:** Sales + QC
- **Process:** Customer follow-up, satisfaction check, complaint handling (resolved / RMA / rework), plate storage for reuse, order archive & close.
- **Forms:** RMA (if complaint)

---

## 3. Form & Document Inventory

### QC Forms (from workspace files)

| Abbreviation | Full Name | Products | Purpose |
|-------------|-----------|----------|---------|
| **COA** | Certificate of Analysis | LAM, LID, WAL | Certifies material/product meets specs |
| **CSE** | Customer Sample Evaluation | LAM, LID, WAL | Physical analysis of customer sample |
| **IHSQC** | In-Process Heat Seal QC | LID only | QC during heat seal operation |
| **ILmQC** | In-Process Lamination QC | LAM, LID | QC during lamination operation |
| **IPrQC** | In-Process Printing QC | LAM, LID, WAL | QC during printing operation |
| **ISlQC** | In-Process Slitting QC | LAM, LID, WAL | QC during slitting operation |
| **Job Card** | Job Card | LID only | Production routing & tracking |
| **SOP** | Standard Operating Procedure | LAM, LID, WAL | Process instructions |

### Product Lines & Form Availability

| Form | LAM | LID | WAL |
|------|-----|-----|-----|
| COA | ✓ | ✓ | ✓ |
| CSE | ✓ | ✓ | ✓ |
| IHSQC | ✗ | ✓ | ✗ |
| ILmQC | ✓ | ✓ | ✗ |
| IPrQC | ✓ | ✓ | ✓ |
| ISlQC | ✓ | ✓ | ✓ |
| Job Card | ✗ | ✓ | ✗ |
| SOP | ✓ | ✓ | ✓ |

**Key Observations:**
- IHSQC only exists for LID (lid products require heat sealing)
- ILmQC absent for WAL (wall products may not require lamination)
- Job Card only exists for LID (most complex product with all operations)

---

## 4. Complete Abbreviation Reference

| Code | Full Name | Type | Workflow Stage |
|------|-----------|------|---------------|
| RFQ | Request for Quotation | Document | Pre-Sales |
| CSE | Customer Sample Evaluation | QC Form | Pre-Sales |
| TDS | Technical Data Sheet | QC Document | Pre-Sales |
| MOQ | Minimum Order Quantity | Threshold | Pre-Sales |
| PI | Proforma Invoice | Financial | Quotation |
| PO | Purchase Order | Document | Quotation / Procurement |
| SO | Sales Order | Document | Order Confirmation |
| MRP | Material Requirement Planning | Process | Procurement |
| PR | Purchase Requisition | Document | Procurement |
| GRN | Goods Receipt Note | Document | Material Receipt |
| COA | Certificate of Analysis | QC Form | Material QC / Final QC |
| FIFO | First In First Out | Method | Warehouse |
| WO | Work Order | Production Form | Scheduling |
| JC | Job Card | Production Form | Production |
| PPS | Pre-Production Sample | QC Gate | Production (Critical) |
| FAI | First Article Inspection | QC Form | Production |
| IPrQC | In-Process Printing QC | QC Form | Printing |
| ILmQC | In-Process Lamination QC | QC Form | Lamination |
| ISlQC | In-Process Slitting QC | QC Form | Slitting |
| IHSQC | In-Process Heat Seal QC | QC Form | Heat Seal |
| COC | Certificate of Conformance | QC Document | Final QC |
| DN | Delivery Note | Logistics Form | Delivery |
| RMA | Return Material Authorization | Document | Complaints |
| GMP | Good Manufacturing Practices | Standard | All Production |
| SOP | Standard Operating Procedure | Document | All Stages |

---

## 5. Department Structure (10 Departments)

1. **Sales** — Customer interface, RFQ, quotation, PO/SO, PPS approval coordination, complaints
2. **QC** — Sample evaluation, TDS, material QC, plate QC, ink approval, PPS/FAI, in-process QC, final QC, COA/COC
3. **Prepress** — Artwork, color separation, proofing, plate files, plate engraving coordination, plate storage
4. **Estimation** — Cost calculation, pricing, MOQ support, change order impact
5. **Procurement** — MRP, stock management, purchasing, GRN, FIFO, material issuance
6. **Production** — Scheduling, job cards, machine setup, PPS manufacturing, full run, waste, plate cleaning
7. **Ink Head / Ink Room** — Ink formulation, color matching, viscosity testing, recipe documentation
8. **Maintenance** — Preventive maintenance, breakdown response, calibration, spare parts
9. **Accounts / Finance** — Credit check, payment terms, PI, invoicing, collections, job costing
10. **Logistics** — FG inventory, packaging, DN, carrier coordination, shipping, delivery tracking, RMA

---

## 6. Quality Gates (6 Total)

| # | Gate | Stage | Department | Failure Action |
|---|------|-------|------------|----------------|
| 1 | Raw Material QC | Pre-Production | QC | Return & re-procure |
| 2 | Plate QC | Pre-Production | Prepress + QC | Reject & re-engrave |
| 3 | Ink Color Approval | Pre-Production | QC | Remix ink |
| 4 | PPS / FAI Approval | Production | QC → Customer | Re-run PPS |
| 5 | In-Process Monitoring | Production | QC | Alert & adjust |
| 6 | Final QC | Post-Production | QC | Quarantine / rework |

---

## 7. Critical Process Rules

1. **Artwork Before Plates** — Customer must approve artwork proof before plate engraving begins
2. **PPS / FAI is Mandatory** — Both QC and customer must approve PPS before full production. No exceptions
3. **Parallel Processing** — After SO, artwork and material procurement run simultaneously
4. **Repeat Order Shortcut** — Reuse existing plates & TDS, skip artwork/engraving
5. **FIFO Compliance** — Strict FIFO for all material issuance
6. **Change Orders** — Formal change order with price/timeline impact assessment required
7. **Job Sequencing** — Based on delivery date, material availability, color changeover efficiency, machine capacity

---

## 8. Industry Certifications

| Category | Certifications |
|----------|---------------|
| Quality | ISO 9001:2015, GMP |
| Food Safety | FSSC 22000, ISO 22000, HACCP, FDA, EU 10/2011 |
| Packaging | BRC Global Standard, Food Contact Certificates |
| Social/Ethical | SEDEX/SMETA, SA 8000, ETI |
| Environmental | ISO 14001, Carbon Footprint |

---

## 9. Design Decisions for v4

### Inspiration Sources
- **QuickBooks Home Page** — Swim-lane workflow with connected clickable nodes grouped by entity
- **Sistrade MES** — Clean dashboard, production tracking, quality management modules
- **ISA-95** — Level 3 structure: Production + Quality + Logistics + Maintenance

### Layout Choices
- **Pipeline Navigation** — horizontal stage bar (QuickBooks-style) for quick jump
- **Collapsible Stage Cards** — each with department chips + process table + mini Mermaid diagram
- **Process Tables** — 5-column layout (Icon | Step | Department | Actions | Forms)
- **Visual Quality Gates** — red gate badges (⚑) inline with form badges
- **Decision Rows** — pink background with left border to highlight branch points
- **PPS Highlighting** — yellow background on PPS rows (Steps 4.4–4.6) as the most critical gate
- **Reference Sections** — collapsible: Departments (10 cards), Process Rules, Abbreviations (table), Certifications

### Size Comparison
| Version | Lines | Content |
|---------|-------|---------|
| v3 (Complete) | 2,419 | Full detailed 17-phase document |
| Mermaid (Offline) | 708 | Single large flowchart |
| **v4 (Compact)** | **1,537** | **MES dashboard — 36% smaller than v3** |

### Technical Stack
- Pure HTML + CSS (no frameworks)
- Mermaid.js (local `mermaid.min.js`) for flowcharts
- 5 mini Mermaid diagrams (one per stage) — kept simple to avoid rendering issues
- CSS custom properties for department color system
- Responsive design (mobile + print support)
- No external dependencies
