# ProPackHub - Phase 6: Supplier & Procurement Management

**Implementation Phase:** 6 (Weeks 33-38)  
**Priority:** High  
**Dependencies:** Inventory (05), Materials Master (01)

---

## TABLE OF CONTENTS

1. [Supplier Master](#1-supplier-master)
2. [Supplier Qualification](#2-supplier-qualification)
3. [Purchase Requisitions](#3-purchase-requisitions)
4. [Purchase Orders](#4-purchase-orders)
5. [Goods Receipt (GRN)](#5-goods-receipt-grn)
6. [Supplier Performance](#6-supplier-performance)
7. [Price Agreements](#7-price-agreements)
8. [API Specifications](#8-api-specifications)

---

## 1. SUPPLIER MASTER

### 1.1 Supplier Tables

```sql
-- Supplier Master
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_code VARCHAR(50) UNIQUE NOT NULL,  -- SUP-0001
  
  -- Company Info
  company_name VARCHAR(255) NOT NULL,
  trade_name VARCHAR(255),
  
  -- Classification
  supplier_type VARCHAR(50),  -- manufacturer, trader, distributor
  supplier_category VARCHAR(100),  -- film, adhesive, ink, consumables, services
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  -- pending, qualified, approved, preferred, suspended, blacklisted
  
  -- Contact
  primary_contact_name VARCHAR(255),
  primary_email VARCHAR(255),
  primary_phone VARCHAR(50),
  website VARCHAR(255),
  
  -- Address
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  country_code VARCHAR(3),
  country_name VARCHAR(100),
  
  -- Financial
  payment_terms VARCHAR(50),  -- Net 30, Net 60, Advance
  currency_code VARCHAR(3) DEFAULT 'USD',
  tax_id VARCHAR(50),
  credit_limit DECIMAL(18,2),
  
  -- Bank Details
  bank_name VARCHAR(255),
  bank_account VARCHAR(100),
  bank_swift VARCHAR(50),
  bank_iban VARCHAR(50),
  
  -- Certifications
  certifications TEXT[],  -- ['ISO 9001', 'ISO 14001', 'FDA Registered']
  certification_expiry JSONB,
  -- {"ISO 9001": "2025-12-31", "FDA": "2026-06-30"}
  
  -- Rating
  quality_rating DECIMAL(3,2),  -- 1.00 - 5.00
  delivery_rating DECIMAL(3,2),
  service_rating DECIMAL(3,2),
  overall_rating DECIMAL(3,2),
  
  -- Metadata
  approved_by UUID,
  approved_date DATE,
  notes TEXT,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_suppliers_status ON suppliers(status);
CREATE INDEX idx_suppliers_category ON suppliers(supplier_category);

-- Supplier Contacts
CREATE TABLE supplier_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  
  -- Contact Info
  contact_name VARCHAR(255) NOT NULL,
  job_title VARCHAR(100),
  department VARCHAR(100),  -- Sales, Quality, Accounts, Logistics
  
  -- Communication
  email VARCHAR(255),
  phone VARCHAR(50),
  mobile VARCHAR(50),
  
  -- Role
  is_primary BOOLEAN DEFAULT false,
  is_sales_contact BOOLEAN DEFAULT false,
  is_quality_contact BOOLEAN DEFAULT false,
  is_accounts_contact BOOLEAN DEFAULT false,
  
  notes TEXT,
  is_active BOOLEAN DEFAULT true
);

-- Supplier Addresses (multiple delivery/billing)
CREATE TABLE supplier_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  
  address_type VARCHAR(50),  -- head_office, factory, warehouse
  address_name VARCHAR(255),
  
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  country_code VARCHAR(3),
  
  is_default BOOLEAN DEFAULT false
);

-- Supplier-Material Link (which materials from which supplier)
CREATE TABLE supplier_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  material_id UUID REFERENCES raw_materials(id) ON DELETE CASCADE,
  
  -- Supplier's Reference
  supplier_material_code VARCHAR(100),
  supplier_material_name VARCHAR(255),
  
  -- Pricing
  unit_price DECIMAL(10,4),
  currency_code VARCHAR(3) DEFAULT 'USD',
  price_per VARCHAR(20) DEFAULT 'KG',
  min_order_qty DECIMAL(18,4),
  price_valid_from DATE,
  price_valid_to DATE,
  
  -- Lead Time
  lead_time_days INT,
  
  -- Preference
  is_preferred BOOLEAN DEFAULT false,
  preference_rank INT,  -- 1 = first choice
  
  -- Quality
  quality_approved BOOLEAN DEFAULT false,
  last_quality_check DATE,
  
  notes TEXT,
  
  UNIQUE(supplier_id, material_id)
);
```

---

## 2. SUPPLIER QUALIFICATION

### 2.1 Qualification Process

```sql
-- Supplier Qualification Checklist
CREATE TABLE supplier_qualification_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- For which category
  supplier_category VARCHAR(100) NOT NULL,  -- film, adhesive, ink
  
  -- Checklist Items
  checklist_items JSONB NOT NULL,
  -- [
  --   {id: 1, item: "ISO 9001 Certificate", required: true, category: "documentation"},
  --   {id: 2, item: "Product Specifications", required: true, category: "documentation"},
  --   {id: 3, item: "Sample Approval", required: true, category: "quality"},
  --   {id: 4, item: "Plant Audit", required: false, category: "audit"},
  --   {id: 5, item: "Credit Check", required: true, category: "financial"}
  -- ]
  
  is_active BOOLEAN DEFAULT true
);

-- Supplier Qualification Records
CREATE TABLE supplier_qualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qualification_number VARCHAR(50) UNIQUE NOT NULL,  -- SQ-2025-0001
  
  supplier_id UUID REFERENCES suppliers(id),
  
  -- Checklist Used
  checklist_id UUID REFERENCES supplier_qualification_checklist(id),
  
  -- Completed Items
  completed_items JSONB,
  -- [
  --   {id: 1, item: "ISO 9001 Certificate", completed: true, date: "2025-01-15", 
  --    document_url: "/docs/...", notes: "Valid until 2026-12"},
  --   {id: 2, item: "Sample Approval", completed: true, date: "2025-01-20",
  --    sample_number: "SMPL-2025-001", result: "approved"}
  -- ]
  
  -- Status
  status VARCHAR(50) DEFAULT 'in_progress',
  -- in_progress, pending_approval, approved, rejected
  
  -- Dates
  started_date DATE DEFAULT CURRENT_DATE,
  target_date DATE,
  completed_date DATE,
  
  -- Approval
  recommendation VARCHAR(50),  -- approve, reject, conditional
  conditions TEXT,
  approved_by UUID,
  approved_date DATE,
  
  -- Score
  qualification_score DECIMAL(5,2),  -- Out of 100
  
  notes TEXT,
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Supplier Audits
CREATE TABLE supplier_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_number VARCHAR(50) UNIQUE NOT NULL,  -- AUDIT-2025-0001
  
  supplier_id UUID REFERENCES suppliers(id),
  
  -- Audit Type
  audit_type VARCHAR(50),  -- initial, periodic, follow_up, surprise
  
  -- Schedule
  planned_date DATE NOT NULL,
  actual_date DATE,
  
  -- Auditors
  lead_auditor VARCHAR(255),
  audit_team TEXT[],
  
  -- Scope
  audit_scope TEXT,
  areas_audited TEXT[],  -- ['Quality System', 'Production', 'Warehouse', 'Documentation']
  
  -- Results
  status VARCHAR(50) DEFAULT 'scheduled',
  -- scheduled, in_progress, completed, cancelled
  
  findings JSONB,
  -- [
  --   {type: "major", area: "Production", finding: "No SOP for lamination", 
  --    corrective_action: "Develop SOP", due_date: "2025-02-28"},
  --   {type: "minor", area: "Warehouse", finding: "FIFO not followed strictly"}
  -- ]
  
  major_findings INT DEFAULT 0,
  minor_findings INT DEFAULT 0,
  observations INT DEFAULT 0,
  
  -- Score
  audit_score DECIMAL(5,2),  -- Out of 100
  audit_grade VARCHAR(10),  -- A, B, C, D, F
  
  -- Recommendation
  recommendation VARCHAR(50),  -- approve, conditional, re-audit, reject
  conditions TEXT,
  
  -- Report
  report_url TEXT,
  
  completed_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. PURCHASE REQUISITIONS

### 3.1 Internal Purchase Requests

```sql
-- Purchase Requisitions
CREATE TABLE purchase_requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_number VARCHAR(50) UNIQUE NOT NULL,  -- PR-2025-0001
  
  -- Requester
  requested_by UUID NOT NULL,
  requested_by_name VARCHAR(255),
  department VARCHAR(100),
  
  -- Dates
  request_date DATE DEFAULT CURRENT_DATE,
  required_date DATE NOT NULL,
  
  -- Source
  source_type VARCHAR(50),  -- manual, reorder_alert, work_order
  source_reference VARCHAR(100),  -- Alert ID or WO number
  work_order_id UUID REFERENCES work_orders(id),
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft',
  -- draft, submitted, approved, rejected, converted, cancelled
  
  -- Approval
  requires_approval BOOLEAN DEFAULT true,
  approved_by UUID,
  approved_date TIMESTAMP,
  rejection_reason TEXT,
  
  -- Urgency
  priority VARCHAR(20) DEFAULT 'normal',  -- critical, high, normal, low
  
  -- Conversion
  converted_to_po BOOLEAN DEFAULT false,
  po_number VARCHAR(50),
  
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Purchase Requisition Items
CREATE TABLE purchase_requisition_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id UUID REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
  line_number INT NOT NULL,
  
  -- Material
  material_id UUID REFERENCES raw_materials(id),
  material_code VARCHAR(50),
  material_name VARCHAR(255),
  
  -- Quantity
  requested_qty DECIMAL(18,4) NOT NULL,
  approved_qty DECIMAL(18,4),
  unit VARCHAR(20) DEFAULT 'KG',
  
  -- Preferred Supplier
  preferred_supplier_id UUID REFERENCES suppliers(id),
  
  -- Estimated Cost
  estimated_unit_price DECIMAL(10,4),
  estimated_total DECIMAL(18,4),
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  -- pending, approved, rejected, ordered
  
  notes TEXT,
  
  UNIQUE(pr_id, line_number)
);

-- PR Approval Workflow
CREATE TABLE pr_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id UUID REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
  
  -- Approver
  approver_id UUID NOT NULL,
  approver_name VARCHAR(255),
  approval_level INT,  -- 1, 2, 3...
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',  -- pending, approved, rejected
  
  -- Decision
  decision_date TIMESTAMP,
  comments TEXT,
  
  -- Delegation
  delegated_from UUID,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. PURCHASE ORDERS

### 4.1 Purchase Order Management

```sql
-- Purchase Orders
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number VARCHAR(50) UNIQUE NOT NULL,  -- PO-2025-0001
  
  -- Supplier
  supplier_id UUID REFERENCES suppliers(id) NOT NULL,
  supplier_name VARCHAR(255),
  supplier_contact_id UUID REFERENCES supplier_contacts(id),
  
  -- Source
  pr_id UUID REFERENCES purchase_requisitions(id),
  
  -- Dates
  po_date DATE DEFAULT CURRENT_DATE,
  required_date DATE NOT NULL,
  expected_delivery_date DATE,
  
  -- Delivery
  delivery_address_id UUID,
  delivery_instructions TEXT,
  shipping_method VARCHAR(100),
  incoterms VARCHAR(20),  -- EXW, FOB, CIF, DDP
  
  -- Currency & Payment
  currency_code VARCHAR(3) DEFAULT 'USD',
  exchange_rate DECIMAL(10,6) DEFAULT 1,
  payment_terms VARCHAR(100),
  
  -- Amounts
  subtotal DECIMAL(18,2) DEFAULT 0,
  discount_amount DECIMAL(18,2) DEFAULT 0,
  tax_amount DECIMAL(18,2) DEFAULT 0,
  shipping_amount DECIMAL(18,2) DEFAULT 0,
  total_amount DECIMAL(18,2) DEFAULT 0,
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft',
  -- draft, pending_approval, approved, sent, confirmed, 
  -- partially_received, fully_received, closed, cancelled
  
  -- Approval
  requires_approval BOOLEAN DEFAULT true,
  approved_by UUID,
  approved_date TIMESTAMP,
  
  -- Sending
  sent_date TIMESTAMP,
  sent_by UUID,
  sent_to_email VARCHAR(255),
  supplier_confirmation_date TIMESTAMP,
  supplier_reference VARCHAR(100),  -- Supplier's order reference
  
  -- PDF
  pdf_url TEXT,
  
  -- Terms
  terms_and_conditions TEXT,
  
  notes TEXT,
  internal_notes TEXT,
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_po_status ON purchase_orders(status);
CREATE INDEX idx_po_date ON purchase_orders(po_date);

-- Purchase Order Items
CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  line_number INT NOT NULL,
  
  -- Material
  material_id UUID REFERENCES raw_materials(id),
  material_code VARCHAR(50),
  material_name VARCHAR(255),
  
  -- Supplier's Reference
  supplier_material_code VARCHAR(100),
  
  -- Specifications
  specifications TEXT,
  
  -- Quantity
  ordered_qty DECIMAL(18,4) NOT NULL,
  received_qty DECIMAL(18,4) DEFAULT 0,
  pending_qty DECIMAL(18,4) GENERATED ALWAYS AS (ordered_qty - received_qty) STORED,
  unit VARCHAR(20) DEFAULT 'KG',
  
  -- Pricing
  unit_price DECIMAL(10,4) NOT NULL,
  discount_pct DECIMAL(5,2) DEFAULT 0,
  tax_pct DECIMAL(5,2) DEFAULT 0,
  line_total DECIMAL(18,4),
  
  -- Delivery
  required_date DATE,
  promised_date DATE,
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  -- pending, partially_received, fully_received, cancelled
  
  -- For roll materials
  roll_specifications JSONB,
  -- {width_mm: 1050, core_id_mm: 76, max_roll_weight_kg: 500}
  
  notes TEXT,
  
  UNIQUE(po_id, line_number)
);

-- PO Amendments
CREATE TABLE po_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  
  amendment_number INT NOT NULL,
  amendment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- What changed
  change_type VARCHAR(50),  -- quantity, price, date, add_item, cancel_item
  change_description TEXT NOT NULL,
  
  -- Before/After
  changes_detail JSONB,
  -- {field: "ordered_qty", item_line: 1, old_value: 1000, new_value: 1500}
  
  -- Reason
  reason TEXT,
  
  -- Approval
  approved_by UUID,
  approved_date TIMESTAMP,
  
  -- Supplier Confirmation
  supplier_confirmed BOOLEAN DEFAULT false,
  supplier_confirmed_date TIMESTAMP,
  
  created_by UUID,
  
  UNIQUE(po_id, amendment_number)
);
```

---

## 5. GOODS RECEIPT (GRN)

### 5.1 Receiving & Inspection

```sql
-- Goods Receipt Note
CREATE TABLE goods_receipt_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_number VARCHAR(50) UNIQUE NOT NULL,  -- GRN-2025-0001
  
  -- Source
  po_id UUID REFERENCES purchase_orders(id),
  po_number VARCHAR(50),
  supplier_id UUID REFERENCES suppliers(id),
  
  -- Receipt Details
  receipt_date DATE DEFAULT CURRENT_DATE,
  receipt_time TIME DEFAULT CURRENT_TIME,
  
  -- Delivery Info
  delivery_note_number VARCHAR(100),  -- Supplier's DN
  invoice_number VARCHAR(100),
  vehicle_number VARCHAR(50),
  driver_name VARCHAR(255),
  
  -- Received By
  received_by UUID NOT NULL,
  received_by_name VARCHAR(255),
  
  -- Location
  warehouse_id UUID REFERENCES warehouses(id),
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending_inspection',
  -- pending_inspection, inspection_in_progress, approved, rejected, 
  -- partially_approved, closed
  
  -- Inspection
  inspection_required BOOLEAN DEFAULT true,
  inspected_by UUID,
  inspection_date TIMESTAMP,
  
  -- Overall Result
  overall_result VARCHAR(50),  -- accepted, rejected, conditional
  
  -- Documents
  delivery_note_url TEXT,
  photos JSONB DEFAULT '[]',
  
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_grn_po ON goods_receipt_notes(po_id);
CREATE INDEX idx_grn_date ON goods_receipt_notes(receipt_date);

-- GRN Items
CREATE TABLE grn_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id UUID REFERENCES goods_receipt_notes(id) ON DELETE CASCADE,
  
  -- PO Reference
  po_item_id UUID REFERENCES purchase_order_items(id),
  
  -- Material
  material_id UUID REFERENCES raw_materials(id),
  material_code VARCHAR(50),
  material_name VARCHAR(255),
  
  -- Ordered vs Received
  ordered_qty DECIMAL(18,4),
  received_qty DECIMAL(18,4) NOT NULL,
  accepted_qty DECIMAL(18,4),
  rejected_qty DECIMAL(18,4) DEFAULT 0,
  unit VARCHAR(20),
  
  -- Lot Info
  lot_number VARCHAR(50),
  batch_number VARCHAR(50),
  supplier_batch VARCHAR(50),
  manufacturing_date DATE,
  expiry_date DATE,
  
  -- Roll Details (for film)
  number_of_rolls INT,
  roll_details JSONB,
  -- [
  --   {roll_id: "R001", width: 1050, weight: 450, core_id: 76},
  --   {roll_id: "R002", width: 1050, weight: 480, core_id: 76}
  -- ]
  
  -- Inspection
  inspection_status VARCHAR(50) DEFAULT 'pending',
  -- pending, passed, failed, conditional
  
  inspection_results JSONB,
  -- {
  --   thickness: {spec: "12±1", actual: 12.2, result: "pass"},
  --   width: {spec: "1050±2", actual: 1049, result: "pass"},
  --   appearance: {result: "pass", notes: "Clear, no defects"}
  -- }
  
  coa_received BOOLEAN DEFAULT false,
  coa_number VARCHAR(100),
  coa_url TEXT,
  
  -- Rejection
  rejection_reason TEXT,
  rejection_photos JSONB DEFAULT '[]',
  
  -- Storage Location
  warehouse_id UUID REFERENCES warehouses(id),
  location_code VARCHAR(50),
  
  notes TEXT
);

-- GRN to Inventory Link (auto-creates inventory on approval)
CREATE OR REPLACE FUNCTION create_inventory_from_grn()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.inspection_status = 'passed' AND OLD.inspection_status != 'passed' THEN
    INSERT INTO raw_material_inventory (
      material_id, material_code, material_name,
      warehouse_id, location_code,
      lot_number, batch_number, supplier_batch,
      received_date, manufacturing_date, expiry_date,
      received_qty, current_qty, unit,
      qc_status, coa_number,
      supplier_id, po_number, grn_number,
      unit_cost
    )
    SELECT 
      NEW.material_id, NEW.material_code, NEW.material_name,
      NEW.warehouse_id, NEW.location_code,
      NEW.lot_number, NEW.batch_number, NEW.supplier_batch,
      CURRENT_DATE, NEW.manufacturing_date, NEW.expiry_date,
      NEW.accepted_qty, NEW.accepted_qty, NEW.unit,
      'approved', NEW.coa_number,
      g.supplier_id, g.po_number, g.grn_number,
      poi.unit_price
    FROM goods_receipt_notes g
    JOIN purchase_order_items poi ON poi.id = NEW.po_item_id
    WHERE g.id = NEW.grn_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_inventory_from_grn
  AFTER UPDATE ON grn_items
  FOR EACH ROW
  EXECUTE FUNCTION create_inventory_from_grn();

-- Supplier Returns (for rejected materials)
CREATE TABLE supplier_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number VARCHAR(50) UNIQUE NOT NULL,  -- SR-2025-0001
  
  -- Source
  grn_id UUID REFERENCES goods_receipt_notes(id),
  supplier_id UUID REFERENCES suppliers(id),
  
  -- Return Date
  return_date DATE DEFAULT CURRENT_DATE,
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  -- pending, shipped, received_by_supplier, credit_received, closed
  
  -- Reason
  return_reason TEXT NOT NULL,
  
  -- Value
  total_value DECIMAL(18,4),
  
  -- Credit Note
  credit_note_number VARCHAR(100),
  credit_note_amount DECIMAL(18,4),
  credit_note_date DATE,
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Return Items
CREATE TABLE supplier_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID REFERENCES supplier_returns(id) ON DELETE CASCADE,
  
  material_id UUID REFERENCES raw_materials(id),
  material_code VARCHAR(50),
  lot_number VARCHAR(50),
  
  return_qty DECIMAL(18,4) NOT NULL,
  unit VARCHAR(20),
  unit_cost DECIMAL(10,4),
  total_value DECIMAL(18,4),
  
  reason TEXT
);
```

---

## 6. SUPPLIER PERFORMANCE

### 6.1 Performance Tracking

```sql
-- Supplier Performance Metrics
CREATE TABLE supplier_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES suppliers(id),
  
  -- Period
  period_type VARCHAR(20),  -- monthly, quarterly, yearly
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Delivery Performance
  total_orders INT DEFAULT 0,
  on_time_deliveries INT DEFAULT 0,
  late_deliveries INT DEFAULT 0,
  early_deliveries INT DEFAULT 0,
  delivery_score DECIMAL(5,2),  -- %
  
  avg_days_early_late DECIMAL(5,2),
  
  -- Quality Performance
  total_qty_received DECIMAL(18,4) DEFAULT 0,
  qty_accepted DECIMAL(18,4) DEFAULT 0,
  qty_rejected DECIMAL(18,4) DEFAULT 0,
  quality_score DECIMAL(5,2),  -- % accepted
  
  -- Issue count
  quality_issues INT DEFAULT 0,
  major_issues INT DEFAULT 0,
  minor_issues INT DEFAULT 0,
  
  -- Quantity Accuracy
  qty_ordered DECIMAL(18,4),
  qty_delivered DECIMAL(18,4),
  quantity_accuracy DECIMAL(5,2),  -- %
  
  -- Response Metrics
  avg_quote_response_days DECIMAL(5,2),
  avg_issue_resolution_days DECIMAL(5,2),
  
  -- Pricing
  price_competitiveness_score DECIMAL(5,2),  -- Compared to market
  
  -- Overall
  overall_score DECIMAL(5,2),  -- Weighted average
  grade VARCHAR(10),  -- A, B, C, D, F
  
  -- Recommendation
  recommendation VARCHAR(50),  -- preferred, approved, probation, remove
  
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(supplier_id, period_type, period_start)
);

-- Supplier Issues/NCRs
CREATE TABLE supplier_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_number VARCHAR(50) UNIQUE NOT NULL,  -- SI-2025-0001
  
  supplier_id UUID REFERENCES suppliers(id),
  
  -- Reference
  grn_id UUID REFERENCES goods_receipt_notes(id),
  po_id UUID REFERENCES purchase_orders(id),
  
  -- Issue Type
  issue_type VARCHAR(50),  -- quality, delivery, documentation, quantity, packaging
  severity VARCHAR(20),  -- critical, major, minor
  
  -- Details
  issue_date DATE DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  
  -- Material
  material_id UUID REFERENCES raw_materials(id),
  lot_number VARCHAR(50),
  affected_qty DECIMAL(18,4),
  
  -- Impact
  production_impact BOOLEAN DEFAULT false,
  customer_impact BOOLEAN DEFAULT false,
  financial_impact DECIMAL(18,4),
  
  -- Status
  status VARCHAR(50) DEFAULT 'open',
  -- open, acknowledged, investigating, corrective_action, closed
  
  -- Supplier Response
  notified_date TIMESTAMP,
  acknowledged_date TIMESTAMP,
  supplier_response TEXT,
  
  -- Corrective Action
  corrective_action TEXT,
  preventive_action TEXT,
  target_close_date DATE,
  actual_close_date DATE,
  
  -- Verification
  verified_by UUID,
  verification_date TIMESTAMP,
  verification_notes TEXT,
  
  -- Attachments
  photos JSONB DEFAULT '[]',
  documents JSONB DEFAULT '[]',
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Supplier Scorecard View
CREATE VIEW supplier_scorecard AS
SELECT 
  s.id as supplier_id,
  s.supplier_code,
  s.company_name,
  s.supplier_category,
  s.status,
  
  -- Latest Performance
  sp.overall_score,
  sp.grade,
  sp.delivery_score,
  sp.quality_score,
  
  -- Issues
  (SELECT COUNT(*) FROM supplier_issues si 
   WHERE si.supplier_id = s.id AND si.status = 'open') as open_issues,
  
  -- PO Stats
  (SELECT COUNT(*) FROM purchase_orders po 
   WHERE po.supplier_id = s.id AND po.po_date >= CURRENT_DATE - INTERVAL '12 months') as pos_12m,
  
  (SELECT COALESCE(SUM(total_amount), 0) FROM purchase_orders po 
   WHERE po.supplier_id = s.id AND po.po_date >= CURRENT_DATE - INTERVAL '12 months') as spend_12m,
  
  sp.recommendation
  
FROM suppliers s
LEFT JOIN LATERAL (
  SELECT * FROM supplier_performance 
  WHERE supplier_id = s.id 
  ORDER BY period_end DESC 
  LIMIT 1
) sp ON true
WHERE s.is_active = true;
```

---

## 7. PRICE AGREEMENTS

### 7.1 Contracts & Blanket Orders

```sql
-- Price Agreements / Contracts
CREATE TABLE price_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_number VARCHAR(50) UNIQUE NOT NULL,  -- PA-2025-0001
  
  supplier_id UUID REFERENCES suppliers(id),
  
  -- Type
  agreement_type VARCHAR(50),  -- blanket_order, price_contract, consignment
  
  -- Validity
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft',
  -- draft, pending_approval, active, expired, cancelled
  
  -- Terms
  currency_code VARCHAR(3) DEFAULT 'USD',
  payment_terms VARCHAR(100),
  delivery_terms VARCHAR(100),
  
  -- Blanket Order Limits
  total_value_limit DECIMAL(18,4),
  used_value DECIMAL(18,4) DEFAULT 0,
  remaining_value DECIMAL(18,4) GENERATED ALWAYS AS (total_value_limit - used_value) STORED,
  
  -- Approval
  approved_by UUID,
  approved_date TIMESTAMP,
  
  -- Document
  contract_document_url TEXT,
  
  notes TEXT,
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Price Agreement Items
CREATE TABLE price_agreement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID REFERENCES price_agreements(id) ON DELETE CASCADE,
  
  material_id UUID REFERENCES raw_materials(id),
  material_code VARCHAR(50),
  material_name VARCHAR(255),
  
  -- Pricing
  unit_price DECIMAL(10,4) NOT NULL,
  price_unit VARCHAR(20) DEFAULT 'KG',
  
  -- Quantity Tiers (optional)
  price_tiers JSONB,
  -- [
  --   {min_qty: 1, max_qty: 999, price: 2.50},
  --   {min_qty: 1000, max_qty: 4999, price: 2.40},
  --   {min_qty: 5000, max_qty: null, price: 2.30}
  -- ]
  
  -- Blanket Qty
  agreed_qty DECIMAL(18,4),
  ordered_qty DECIMAL(18,4) DEFAULT 0,
  remaining_qty DECIMAL(18,4) GENERATED ALWAYS AS (agreed_qty - ordered_qty) STORED,
  
  -- Lead Time
  lead_time_days INT,
  
  notes TEXT
);

-- Price History Tracking
CREATE TABLE material_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  material_id UUID REFERENCES raw_materials(id),
  supplier_id UUID REFERENCES suppliers(id),
  
  -- Price
  old_price DECIMAL(10,4),
  new_price DECIMAL(10,4),
  currency_code VARCHAR(3),
  price_unit VARCHAR(20),
  
  -- Change
  change_pct DECIMAL(5,2),
  change_reason VARCHAR(255),
  
  -- Source
  source_type VARCHAR(50),  -- po, agreement, quote, market_update
  source_reference VARCHAR(100),
  
  effective_date DATE NOT NULL,
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_price_history_material ON material_price_history(material_id, effective_date);
```

---

## 8. API SPECIFICATIONS

### Supplier & Procurement Routes

```
=== SUPPLIERS ===
POST   /suppliers                          Create supplier
GET    /suppliers                          List suppliers
GET    /suppliers/:id                      Get supplier details
PUT    /suppliers/:id                      Update supplier
GET    /suppliers/:id/performance          Get performance metrics
GET    /suppliers/:id/issues               Get supplier issues
GET    /suppliers/scorecard                Get all supplier scorecards

=== SUPPLIER CONTACTS ===
POST   /suppliers/:id/contacts             Add contact
GET    /suppliers/:id/contacts             List contacts
PUT    /suppliers/:id/contacts/:cid        Update contact

=== SUPPLIER MATERIALS ===
POST   /suppliers/:id/materials            Link material to supplier
GET    /suppliers/:id/materials            Get supplier materials
PUT    /suppliers/:id/materials/:mid       Update pricing/preferences

=== QUALIFICATION ===
POST   /supplier-qualifications            Start qualification
GET    /supplier-qualifications/:id        Get qualification status
PUT    /supplier-qualifications/:id        Update checklist items
POST   /supplier-qualifications/:id/approve Approve supplier

=== AUDITS ===
POST   /supplier-audits                    Schedule audit
GET    /supplier-audits/:id                Get audit details
PUT    /supplier-audits/:id                Update audit results

=== PURCHASE REQUISITIONS ===
POST   /purchase-requisitions              Create PR
GET    /purchase-requisitions              List PRs
GET    /purchase-requisitions/:id          Get PR details
POST   /purchase-requisitions/:id/submit   Submit for approval
POST   /purchase-requisitions/:id/approve  Approve PR
POST   /purchase-requisitions/:id/convert  Convert to PO

=== PURCHASE ORDERS ===
POST   /purchase-orders                    Create PO
GET    /purchase-orders                    List POs
GET    /purchase-orders/:id                Get PO details
PUT    /purchase-orders/:id                Update PO
POST   /purchase-orders/:id/approve        Approve PO
POST   /purchase-orders/:id/send           Send to supplier
GET    /purchase-orders/:id/pdf            Download PDF
POST   /purchase-orders/:id/amend          Create amendment

=== GOODS RECEIPT ===
POST   /goods-receipts                     Create GRN
GET    /goods-receipts                     List GRNs
GET    /goods-receipts/:id                 Get GRN details
POST   /goods-receipts/:id/inspect         Record inspection
POST   /goods-receipts/:id/approve         Approve GRN

=== SUPPLIER RETURNS ===
POST   /supplier-returns                   Create return
GET    /supplier-returns/:id               Get return details
PUT    /supplier-returns/:id               Update status

=== SUPPLIER ISSUES ===
POST   /supplier-issues                    Log issue
GET    /supplier-issues                    List issues
GET    /supplier-issues/:id                Get issue details
PUT    /supplier-issues/:id                Update issue
POST   /supplier-issues/:id/close          Close issue

=== PRICE AGREEMENTS ===
POST   /price-agreements                   Create agreement
GET    /price-agreements                   List agreements
GET    /price-agreements/:id               Get agreement details
PUT    /price-agreements/:id               Update agreement
```

---

## AGENT IMPLEMENTATION PROMPT

```
Create Supplier & Procurement modules for ProPackHub:

CONTEXT:
- Flexible packaging uses many raw materials (films, adhesives, inks)
- Need full supplier lifecycle: qualification → ordering → receiving → performance
- Must track supplier quality performance and pricing

SUPPLIER MODULE:
1. Supplier Master
   - Company info, contacts, addresses
   - Classification by material category
   - Bank details for payments

2. Qualification Process
   - Checklist-based qualification
   - Sample approval tracking
   - Audit scheduling and findings

3. Performance Tracking
   - Delivery on-time %
   - Quality acceptance %
   - Issue/NCR tracking
   - Supplier scorecard

PROCUREMENT MODULE:
1. Purchase Requisitions
   - Internal request workflow
   - Approval hierarchy
   - Auto-generate from reorder alerts

2. Purchase Orders
   - Multi-line orders
   - Amendment tracking
   - PDF generation
   - Status tracking

3. Goods Receipt (GRN)
   - Inspection workflow
   - Lot number assignment
   - Auto-create inventory on approval
   - Supplier returns for rejects

4. Price Agreements
   - Contracts with validity
   - Quantity-based pricing tiers
   - Price history tracking

DATABASE: Use schemas from 06-SUPPLIER-PROCUREMENT.md
```

---

*Continues to 07-COMPLIANCE-CERTIFICATIONS.md...*
