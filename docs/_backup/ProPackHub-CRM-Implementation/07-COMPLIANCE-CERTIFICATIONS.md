# ProPackHub - Phase 7: Compliance & Certifications

**Implementation Phase:** 7 (Weeks 39-42)  
**Priority:** Medium-High  
**Dependencies:** QC (02), Production (05), Inventory (05)

---

## TABLE OF CONTENTS

1. [Certificate of Analysis (COA)](#1-certificate-of-analysis-coa)
2. [Batch Traceability](#2-batch-traceability)
3. [FDA Compliance](#3-fda-compliance)
4. [Food Safety Certifications](#4-food-safety-certifications)
5. [Customer Compliance Documents](#5-customer-compliance-documents)
6. [Audit Management](#6-audit-management)
7. [API Specifications](#7-api-specifications)

---

## 1. CERTIFICATE OF ANALYSIS (COA)

### 1.1 COA Generation System

```sql
-- COA Templates (per product group)
CREATE TABLE coa_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code VARCHAR(50) UNIQUE NOT NULL,
  template_name VARCHAR(255) NOT NULL,
  
  -- Applicable to
  product_group_id UUID REFERENCES product_groups(id),
  product_group_name VARCHAR(255),
  
  -- Template Structure
  sections JSONB NOT NULL,
  -- [
  --   {
  --     section: "Product Information",
  --     fields: ["product_code", "product_name", "lot_number", "production_date"]
  --   },
  --   {
  --     section: "Physical Properties",
  --     tests: [
  --       {test_code: "THICK-001", show_spec: true, show_method: true},
  --       {test_code: "TENSILE-MD", show_spec: true, show_method: true}
  --     ]
  --   },
  --   {
  --     section: "Barrier Properties",
  --     tests: ["OTR-001", "WVTR-001"]
  --   },
  --   {
  --     section: "Compliance Statement",
  --     text: "This product complies with FDA 21 CFR 175.300..."
  --   }
  -- ]
  
  -- Header/Footer
  header_text TEXT,
  footer_text TEXT,
  compliance_statements JSONB,
  
  -- Branding
  show_logo BOOLEAN DEFAULT true,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- COA Documents (generated)
CREATE TABLE coa_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coa_number VARCHAR(50) UNIQUE NOT NULL,  -- COA-2025-0001
  
  -- Reference
  work_order_id UUID REFERENCES work_orders(id),
  production_order_id UUID REFERENCES production_orders(id),
  qc_analysis_id UUID REFERENCES qc_analyses(id),
  
  -- Product
  product_id UUID REFERENCES products(id),
  product_code VARCHAR(50),
  product_name VARCHAR(255),
  
  -- Customer
  customer_id UUID REFERENCES customers(id),
  customer_name VARCHAR(255),
  
  -- Lot Info
  lot_number VARCHAR(50) NOT NULL,
  batch_number VARCHAR(50),
  production_date DATE,
  expiry_date DATE,
  
  -- Quantity
  quantity DECIMAL(18,4),
  quantity_unit VARCHAR(20),
  
  -- Template Used
  template_id UUID REFERENCES coa_templates(id),
  
  -- Test Results (snapshot)
  test_results JSONB NOT NULL,
  -- [
  --   {
  --     test_code: "THICK-001",
  --     test_name: "Total Thickness",
  --     specification: "89 ± 5 μ",
  --     method: "ASTM D374",
  --     result: "88.5 μ",
  --     status: "PASS"
  --   },
  --   ...
  -- ]
  
  -- Structure (snapshot)
  structure_details JSONB,
  
  -- Compliance Statements
  compliance_statements JSONB,
  -- ["FDA 21 CFR 175.300", "EU 10/2011", "Halal Certified"]
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft',
  -- draft, pending_approval, approved, issued, superseded, cancelled
  
  -- Approval
  approved_by UUID,
  approved_by_name VARCHAR(255),
  approved_at TIMESTAMP,
  
  -- Issue
  issued_date DATE,
  issued_to VARCHAR(255),
  
  -- PDF
  pdf_url TEXT,
  
  -- Validity
  valid_until DATE,
  
  -- Version
  version INT DEFAULT 1,
  supersedes_coa_id UUID REFERENCES coa_documents(id),
  
  notes TEXT,
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_coa_lot ON coa_documents(lot_number);
CREATE INDEX idx_coa_customer ON coa_documents(customer_id);
CREATE INDEX idx_coa_product ON coa_documents(product_id);

-- COA Distribution Log
CREATE TABLE coa_distribution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coa_id UUID REFERENCES coa_documents(id),
  
  -- Distribution
  distribution_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  distribution_method VARCHAR(50),  -- email, portal, physical
  
  -- Recipient
  recipient_email VARCHAR(255),
  recipient_name VARCHAR(255),
  
  -- For email
  email_sent BOOLEAN DEFAULT false,
  email_opened BOOLEAN DEFAULT false,
  email_opened_at TIMESTAMP,
  
  -- For physical
  courier_name VARCHAR(100),
  tracking_number VARCHAR(100),
  
  sent_by UUID,
  notes TEXT
);
```

---

## 2. BATCH TRACEABILITY

### 2.1 Complete Forward & Backward Tracing

```sql
-- Traceability Master (central registry)
CREATE TABLE traceability_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identifier
  entity_type VARCHAR(50) NOT NULL,
  -- raw_material_lot, wip_lot, finished_goods_lot, roll, pouch_batch
  entity_id UUID NOT NULL,
  lot_number VARCHAR(50) NOT NULL,
  
  -- Product/Material
  material_id UUID REFERENCES raw_materials(id),
  product_id UUID REFERENCES products(id),
  
  -- Dates
  created_date DATE NOT NULL,
  expiry_date DATE,
  
  -- Quantity
  initial_qty DECIMAL(18,4),
  current_qty DECIMAL(18,4),
  unit VARCHAR(20),
  
  -- Source
  source_type VARCHAR(50),  -- po, production, conversion
  source_reference VARCHAR(100),
  supplier_id UUID REFERENCES suppliers(id),
  
  -- Status
  status VARCHAR(50) DEFAULT 'active',
  -- active, consumed, shipped, expired, blocked, recalled
  
  -- Recall flag
  is_recalled BOOLEAN DEFAULT false,
  recall_id UUID,
  
  UNIQUE(entity_type, lot_number)
);

CREATE INDEX idx_trace_lot ON traceability_registry(lot_number);
CREATE INDEX idx_trace_type ON traceability_registry(entity_type);

-- Traceability Links (parent-child relationships)
CREATE TABLE traceability_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Parent (input)
  parent_entity_type VARCHAR(50) NOT NULL,
  parent_lot_number VARCHAR(50) NOT NULL,
  
  -- Child (output)
  child_entity_type VARCHAR(50) NOT NULL,
  child_lot_number VARCHAR(50) NOT NULL,
  
  -- Quantity consumed
  quantity_used DECIMAL(18,4),
  unit VARCHAR(20),
  
  -- Process
  process_type VARCHAR(100),  -- lamination, printing, slitting, pouch_making
  work_order_id UUID REFERENCES work_orders(id),
  operation_id UUID REFERENCES work_order_operations(id),
  
  -- Timestamp
  linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(parent_lot_number, child_lot_number)
);

CREATE INDEX idx_trace_link_parent ON traceability_links(parent_lot_number);
CREATE INDEX idx_trace_link_child ON traceability_links(child_lot_number);

-- Traceability functions
CREATE OR REPLACE FUNCTION trace_forward(p_lot_number VARCHAR)
RETURNS TABLE (
  level INT,
  lot_number VARCHAR,
  entity_type VARCHAR,
  product_material VARCHAR,
  qty_used DECIMAL,
  process VARCHAR,
  created_date DATE
) AS $$
WITH RECURSIVE forward_trace AS (
  -- Base: starting lot
  SELECT 
    0 as level,
    tr.lot_number,
    tr.entity_type,
    COALESCE(rm.material_name, p.product_name) as product_material,
    tr.current_qty as qty_used,
    'START' as process,
    tr.created_date
  FROM traceability_registry tr
  LEFT JOIN raw_materials rm ON rm.id = tr.material_id
  LEFT JOIN products p ON p.id = tr.product_id
  WHERE tr.lot_number = p_lot_number
  
  UNION ALL
  
  -- Recursive: follow links forward
  SELECT 
    ft.level + 1,
    tl.child_lot_number,
    tr.entity_type,
    COALESCE(rm.material_name, p.product_name),
    tl.quantity_used,
    tl.process_type,
    tr.created_date
  FROM forward_trace ft
  JOIN traceability_links tl ON tl.parent_lot_number = ft.lot_number
  JOIN traceability_registry tr ON tr.lot_number = tl.child_lot_number
  LEFT JOIN raw_materials rm ON rm.id = tr.material_id
  LEFT JOIN products p ON p.id = tr.product_id
  WHERE ft.level < 10  -- Prevent infinite loops
)
SELECT * FROM forward_trace ORDER BY level;
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION trace_backward(p_lot_number VARCHAR)
RETURNS TABLE (
  level INT,
  lot_number VARCHAR,
  entity_type VARCHAR,
  product_material VARCHAR,
  qty_used DECIMAL,
  process VARCHAR,
  supplier VARCHAR,
  created_date DATE
) AS $$
WITH RECURSIVE backward_trace AS (
  -- Base: starting lot
  SELECT 
    0 as level,
    tr.lot_number,
    tr.entity_type,
    COALESCE(rm.material_name, p.product_name) as product_material,
    tr.current_qty as qty_used,
    'START' as process,
    s.company_name as supplier,
    tr.created_date
  FROM traceability_registry tr
  LEFT JOIN raw_materials rm ON rm.id = tr.material_id
  LEFT JOIN products p ON p.id = tr.product_id
  LEFT JOIN suppliers s ON s.id = tr.supplier_id
  WHERE tr.lot_number = p_lot_number
  
  UNION ALL
  
  -- Recursive: follow links backward
  SELECT 
    bt.level + 1,
    tl.parent_lot_number,
    tr.entity_type,
    COALESCE(rm.material_name, p.product_name),
    tl.quantity_used,
    tl.process_type,
    s.company_name,
    tr.created_date
  FROM backward_trace bt
  JOIN traceability_links tl ON tl.child_lot_number = bt.lot_number
  JOIN traceability_registry tr ON tr.lot_number = tl.parent_lot_number
  LEFT JOIN raw_materials rm ON rm.id = tr.material_id
  LEFT JOIN products p ON p.id = tr.product_id
  LEFT JOIN suppliers s ON s.id = tr.supplier_id
  WHERE bt.level < 10
)
SELECT * FROM backward_trace ORDER BY level;
$$ LANGUAGE SQL;

-- Product Recalls
CREATE TABLE product_recalls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recall_number VARCHAR(50) UNIQUE NOT NULL,  -- RECALL-2025-0001
  
  -- Recall Type
  recall_class VARCHAR(20),  -- Class_I, Class_II, Class_III
  recall_type VARCHAR(50),  -- voluntary, mandatory
  
  -- Scope
  affected_lot_numbers TEXT[],
  affected_products TEXT[],
  affected_customers TEXT[],
  
  -- Dates
  recall_date DATE DEFAULT CURRENT_DATE,
  discovery_date DATE,
  
  -- Reason
  reason TEXT NOT NULL,
  root_cause TEXT,
  health_hazard_evaluation TEXT,
  
  -- Quantity
  total_qty_affected DECIMAL(18,4),
  qty_in_warehouse DECIMAL(18,4),
  qty_shipped DECIMAL(18,4),
  qty_recovered DECIMAL(18,4),
  
  -- Status
  status VARCHAR(50) DEFAULT 'initiated',
  -- initiated, notification_sent, in_progress, completed, closed
  
  -- Notifications
  customers_notified BOOLEAN DEFAULT false,
  notification_date TIMESTAMP,
  regulatory_notified BOOLEAN DEFAULT false,
  regulatory_notification_date TIMESTAMP,
  
  -- Actions
  corrective_actions TEXT,
  preventive_actions TEXT,
  
  -- Closure
  closed_date DATE,
  closure_notes TEXT,
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Recall Actions Log
CREATE TABLE recall_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recall_id UUID REFERENCES product_recalls(id),
  
  action_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  action_type VARCHAR(50),
  -- customer_notification, warehouse_hold, shipment_stop, 
  -- customer_return, disposal, regulatory_report
  
  lot_number VARCHAR(50),
  customer_id UUID REFERENCES customers(id),
  
  action_details TEXT,
  qty_affected DECIMAL(18,4),
  
  completed BOOLEAN DEFAULT false,
  completed_date TIMESTAMP,
  
  performed_by UUID
);
```

---

## 3. FDA COMPLIANCE

### 3.1 FDA Documentation

```sql
-- FDA Compliance Documents
CREATE TABLE fda_compliance_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_code VARCHAR(50) UNIQUE NOT NULL,
  
  -- Type
  document_type VARCHAR(100) NOT NULL,
  -- food_contact_declaration, fcn_letter, 21_cfr_175_300_statement,
  -- migration_test_report, extraction_study
  
  -- Applicability
  material_id UUID REFERENCES raw_materials(id),
  product_id UUID REFERENCES products(id),
  product_group_id UUID REFERENCES product_groups(id),
  
  -- Document
  title VARCHAR(255),
  description TEXT,
  
  -- Regulation Reference
  cfr_reference VARCHAR(100),  -- "21 CFR 175.300"
  applicable_conditions TEXT,  -- "Up to 100°C for 2 hours"
  
  -- Validity
  issue_date DATE,
  expiry_date DATE,
  
  -- Source
  issued_by VARCHAR(255),  -- Supplier, Lab, Internal
  lab_name VARCHAR(255),
  test_report_number VARCHAR(100),
  
  -- Document File
  document_url TEXT,
  
  -- Status
  status VARCHAR(50) DEFAULT 'valid',  -- valid, expired, superseded
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- FDA Statements (pre-defined compliance statements)
CREATE TABLE fda_compliance_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_code VARCHAR(50) UNIQUE NOT NULL,
  
  -- Regulation
  regulation VARCHAR(100) NOT NULL,  -- "21 CFR 175.300", "21 CFR 177.1520"
  
  -- Statement Text
  statement_text TEXT NOT NULL,
  
  -- Applicability
  applicable_materials TEXT[],  -- ['PE', 'PP', 'PET']
  applicable_conditions JSONB,
  -- {max_temperature_c: 100, max_time_hours: 2, food_types: ["aqueous", "acidic"]}
  
  -- Document Reference
  reference_document TEXT,
  
  is_active BOOLEAN DEFAULT true
);

-- Seed FDA Statements
INSERT INTO fda_compliance_statements (statement_code, regulation, statement_text, applicable_materials) VALUES
('FDA-175-300-A', '21 CFR 175.300', 
 'This product complies with FDA 21 CFR 175.300 for adhesives used in food contact applications. The adhesive is suitable for use in contact with aqueous and fatty foods at temperatures up to 100°C.',
 ARRAY['Adhesive']),
('FDA-177-1520-PE', '21 CFR 177.1520',
 'This polyethylene film complies with FDA 21 CFR 177.1520 for olefin polymers. It is suitable for food contact applications under Conditions of Use C through G.',
 ARRAY['PE', 'LDPE', 'LLDPE', 'HDPE']),
('FDA-177-1630-NY', '21 CFR 177.1630',
 'This nylon film complies with FDA 21 CFR 177.1630 for nylon resins. It is suitable for repeated use food contact applications.',
 ARRAY['NY', 'PA', 'Nylon']);

-- Migration Testing Records
CREATE TABLE migration_test_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_number VARCHAR(50) UNIQUE NOT NULL,  -- MIG-2025-0001
  
  -- Product/Material
  product_id UUID REFERENCES products(id),
  material_id UUID REFERENCES raw_materials(id),
  lot_number VARCHAR(50),
  
  -- Test Details
  test_type VARCHAR(100),  -- overall_migration, specific_migration
  simulant_used VARCHAR(100),  -- 3% acetic acid, 10% ethanol, olive oil, etc.
  test_conditions VARCHAR(255),  -- "40°C for 10 days"
  
  -- Results
  overall_migration_result DECIMAL(10,4),  -- mg/dm² or mg/kg
  overall_migration_limit DECIMAL(10,4),
  overall_migration_unit VARCHAR(20),
  overall_migration_pass BOOLEAN,
  
  specific_migrations JSONB,
  -- [
  --   {substance: "Lead", result: 0.01, limit: 0.1, unit: "mg/kg", pass: true},
  --   {substance: "Cadmium", result: 0.005, limit: 0.1, unit: "mg/kg", pass: true}
  -- ]
  
  -- Lab Details
  lab_name VARCHAR(255),
  lab_accreditation VARCHAR(100),
  test_report_number VARCHAR(100),
  test_date DATE,
  report_date DATE,
  report_url TEXT,
  
  -- Conclusion
  conclusion VARCHAR(50),  -- compliant, non_compliant
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. FOOD SAFETY CERTIFICATIONS

### 4.1 Certification Management

```sql
-- Company Certifications
CREATE TABLE company_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_code VARCHAR(50) UNIQUE NOT NULL,
  
  -- Certification Type
  certification_type VARCHAR(100) NOT NULL,
  -- ISO_9001, ISO_14001, ISO_22000, FSSC_22000, BRC, SQF, HACCP, 
  -- Halal, Kosher, Organic, SEDEX, GFSI
  
  certification_name VARCHAR(255),
  
  -- Certification Body
  certifying_body VARCHAR(255),
  accreditation_body VARCHAR(255),
  
  -- Scope
  scope TEXT,
  applicable_sites TEXT[],
  
  -- Dates
  initial_certification_date DATE,
  current_issue_date DATE,
  expiry_date DATE,
  
  -- Certificate
  certificate_number VARCHAR(100),
  certificate_url TEXT,
  
  -- Status
  status VARCHAR(50) DEFAULT 'valid',
  -- valid, expiring_soon, expired, suspended, withdrawn
  
  -- Surveillance
  last_audit_date DATE,
  next_audit_date DATE,
  audit_frequency VARCHAR(50),  -- annual, semi_annual
  
  -- Alerts
  renewal_reminder_days INT DEFAULT 90,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Certification Audit Records
CREATE TABLE certification_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  certification_id UUID REFERENCES company_certifications(id),
  
  -- Audit Type
  audit_type VARCHAR(50),  -- initial, surveillance, recertification, unannounced
  
  -- Schedule
  planned_date DATE,
  actual_date DATE,
  
  -- Auditor
  auditor_name VARCHAR(255),
  auditor_company VARCHAR(255),
  
  -- Results
  status VARCHAR(50) DEFAULT 'scheduled',
  -- scheduled, in_progress, completed, passed, failed, conditional
  
  findings_summary JSONB,
  -- {
  --   major_ncs: 0,
  --   minor_ncs: 2,
  --   observations: 3,
  --   positives: 5
  -- }
  
  audit_score DECIMAL(5,2),
  grade VARCHAR(10),  -- A, B, C, D (for BRC/SQF)
  
  -- Actions Required
  corrective_actions_required BOOLEAN DEFAULT false,
  ca_due_date DATE,
  ca_submitted BOOLEAN DEFAULT false,
  ca_accepted BOOLEAN DEFAULT false,
  
  -- Report
  report_url TEXT,
  
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- HACCP Plans
CREATE TABLE haccp_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code VARCHAR(50) UNIQUE NOT NULL,  -- HACCP-001
  
  plan_name VARCHAR(255),
  
  -- Scope
  product_groups TEXT[],
  processes TEXT[],
  
  -- Version Control
  version INT DEFAULT 1,
  effective_date DATE,
  review_date DATE,
  
  -- HACCP Team
  team_leader VARCHAR(255),
  team_members JSONB,
  
  -- Process Flow
  process_flow_diagram_url TEXT,
  
  -- Hazard Analysis
  hazard_analysis JSONB,
  -- [
  --   {
  --     step: "Raw Material Receipt",
  --     hazards: ["Biological - pathogens", "Chemical - migration"],
  --     control_measures: ["Supplier approval", "COA verification"],
  --     is_ccp: false
  --   }
  -- ]
  
  -- CCPs
  ccps JSONB,
  -- [
  --   {
  --     ccp_number: 1,
  --     step: "Metal Detection",
  --     hazard: "Physical - metal fragments",
  --     critical_limits: "Fe: 2.0mm, Non-Fe: 2.5mm, SS: 3.5mm",
  --     monitoring: "Every 30 minutes verification",
  --     corrective_action: "Reject batch, recalibrate detector"
  --   }
  -- ]
  
  -- Status
  status VARCHAR(50) DEFAULT 'active',
  
  approved_by UUID,
  approved_date DATE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- CCP Monitoring Records
CREATE TABLE ccp_monitoring_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  haccp_plan_id UUID REFERENCES haccp_plans(id),
  ccp_number INT,
  
  -- Monitoring
  monitoring_date DATE,
  monitoring_time TIME,
  shift VARCHAR(20),
  
  -- Results
  parameter_checked VARCHAR(255),
  critical_limit VARCHAR(100),
  actual_value VARCHAR(100),
  within_limit BOOLEAN,
  
  -- Deviation
  deviation_occurred BOOLEAN DEFAULT false,
  deviation_description TEXT,
  corrective_action_taken TEXT,
  
  -- Verification
  verified_by UUID,
  verification_date TIMESTAMP,
  
  monitored_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. CUSTOMER COMPLIANCE DOCUMENTS

### 5.1 Customer Document Requirements

```sql
-- Customer Compliance Requirements
CREATE TABLE customer_compliance_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  customer_id UUID REFERENCES customers(id),
  
  -- Requirement
  document_type VARCHAR(100) NOT NULL,
  -- coa_per_shipment, coa_per_lot, annual_coa, 
  -- fda_statement, eu_declaration, halal_certificate,
  -- kosher_certificate, allergen_statement, gmo_statement
  
  description TEXT,
  
  -- Frequency
  frequency VARCHAR(50),  -- per_shipment, per_lot, annual, on_request
  
  -- Mandatory
  is_mandatory BOOLEAN DEFAULT true,
  
  -- Template (if specific format required)
  customer_template_url TEXT,
  
  -- Auto-generate
  auto_generate BOOLEAN DEFAULT false,
  
  effective_from DATE,
  effective_to DATE,
  
  notes TEXT,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Compliance Document Requests
CREATE TABLE compliance_document_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number VARCHAR(50) UNIQUE NOT NULL,  -- CDR-2025-0001
  
  -- Customer
  customer_id UUID REFERENCES customers(id),
  customer_name VARCHAR(255),
  requested_by_contact_id UUID REFERENCES customer_contacts(id),
  
  -- Request
  document_type VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- Reference
  order_id UUID,
  product_id UUID REFERENCES products(id),
  lot_numbers TEXT[],
  
  -- Dates
  request_date DATE DEFAULT CURRENT_DATE,
  required_by DATE,
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  -- pending, in_progress, completed, cancelled
  
  -- Response
  document_urls JSONB DEFAULT '[]',
  completed_date DATE,
  completed_by UUID,
  
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Regulatory Declarations
CREATE TABLE regulatory_declarations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  declaration_code VARCHAR(50) UNIQUE NOT NULL,
  
  -- Type
  declaration_type VARCHAR(100) NOT NULL,
  -- eu_10_2011, fda_food_contact, reach_rohs, prop_65,
  -- bpa_free, phthalate_free, allergen_statement
  
  declaration_name VARCHAR(255),
  
  -- Applicability
  applicable_products TEXT[],  -- Product codes or 'ALL'
  applicable_materials TEXT[],
  
  -- Statement
  declaration_text TEXT NOT NULL,
  
  -- Supporting Documents
  supporting_documents JSONB,
  -- [{type: "Test Report", url: "...", valid_until: "2026-12-31"}]
  
  -- Validity
  issue_date DATE,
  valid_until DATE,
  
  -- Approval
  approved_by VARCHAR(255),
  approved_date DATE,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed common declarations
INSERT INTO regulatory_declarations (declaration_code, declaration_type, declaration_name, declaration_text) VALUES
('DECL-EU-10-2011', 'eu_10_2011', 'EU Regulation 10/2011 Compliance',
 'We hereby declare that the products supplied are manufactured in compliance with EU Regulation 10/2011 on plastic materials and articles intended to come into contact with food. The products meet the overall migration limit of 10 mg/dm² and all applicable specific migration limits.'),
('DECL-BPA-FREE', 'bpa_free', 'BPA-Free Declaration',
 'We hereby confirm that the products supplied do not contain Bisphenol A (BPA) as an intentionally added substance. The products are manufactured using BPA-free raw materials.'),
('DECL-ALLERGEN', 'allergen_statement', 'Allergen Statement',
 'The products supplied are manufactured in a facility that does not process any of the 14 major allergens listed in EU Regulation 1169/2011. There is no risk of cross-contamination with allergens.');
```

---

## 6. AUDIT MANAGEMENT

### 6.1 Customer & Regulatory Audits

```sql
-- Audit Schedule
CREATE TABLE audit_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_code VARCHAR(50) UNIQUE NOT NULL,  -- AUD-2025-0001
  
  -- Audit Type
  audit_type VARCHAR(100) NOT NULL,
  -- customer_audit, regulatory_audit, internal_audit, supplier_audit
  
  -- Auditing Party
  auditor_type VARCHAR(50),  -- customer, certification_body, regulatory, internal
  auditor_company VARCHAR(255),
  auditor_names TEXT[],
  
  -- For Customer Audits
  customer_id UUID REFERENCES customers(id),
  
  -- Schedule
  planned_date DATE NOT NULL,
  planned_duration_days INT DEFAULT 1,
  actual_date DATE,
  
  -- Scope
  audit_scope TEXT,
  areas_to_audit TEXT[],  -- ['Production', 'QC Lab', 'Warehouse', 'Documentation']
  standards_covered TEXT[],  -- ['BRC', 'FSSC 22000']
  
  -- Status
  status VARCHAR(50) DEFAULT 'scheduled',
  -- scheduled, confirmed, in_progress, completed, postponed, cancelled
  
  -- Logistics
  audit_agenda_url TEXT,
  accommodation_arranged BOOLEAN DEFAULT false,
  escort_assigned VARCHAR(255),
  
  -- Pre-audit
  pre_audit_documents_sent BOOLEAN DEFAULT false,
  pre_audit_questionnaire_completed BOOLEAN DEFAULT false,
  
  notes TEXT,
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit Findings
CREATE TABLE audit_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID REFERENCES audit_schedule(id),
  
  finding_number INT NOT NULL,
  
  -- Classification
  finding_type VARCHAR(50) NOT NULL,
  -- critical_nc, major_nc, minor_nc, observation, positive, improvement_opportunity
  
  -- Details
  clause_reference VARCHAR(100),  -- "4.11.1" (BRC clause)
  area_department VARCHAR(100),
  finding_description TEXT NOT NULL,
  objective_evidence TEXT,
  
  -- Root Cause (if NC)
  root_cause TEXT,
  
  -- Corrective Action
  corrective_action_required BOOLEAN DEFAULT false,
  corrective_action TEXT,
  preventive_action TEXT,
  responsible_person VARCHAR(255),
  target_date DATE,
  
  -- Status
  status VARCHAR(50) DEFAULT 'open',
  -- open, action_submitted, verified, closed
  
  -- Verification
  action_evidence TEXT,
  verified_by UUID,
  verified_date DATE,
  verification_notes TEXT,
  
  -- Attachments
  photos JSONB DEFAULT '[]',
  documents JSONB DEFAULT '[]',
  
  UNIQUE(audit_id, finding_number)
);

-- Audit Reports
CREATE TABLE audit_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID REFERENCES audit_schedule(id),
  
  -- Report Details
  report_date DATE,
  
  -- Summary
  executive_summary TEXT,
  
  findings_summary JSONB,
  -- {
  --   critical_nc: 0,
  --   major_nc: 1,
  --   minor_nc: 3,
  --   observations: 5,
  --   positives: 8
  -- }
  
  -- Scores (if applicable)
  audit_score DECIMAL(5,2),
  grade VARCHAR(10),
  
  -- Conclusion
  conclusion VARCHAR(50),  -- passed, conditional, failed
  recommendation TEXT,
  
  -- Next Audit
  next_audit_due DATE,
  
  -- Report File
  report_url TEXT,
  
  -- Acknowledgment
  acknowledged_by UUID,
  acknowledged_date TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 7. API SPECIFICATIONS

### Compliance Routes

```
=== COA ===
POST   /coa/templates                      Create COA template
GET    /coa/templates                      List templates
POST   /coa                                Generate COA
GET    /coa                                List COAs
GET    /coa/:id                            Get COA details
GET    /coa/:id/pdf                        Download PDF
POST   /coa/:id/approve                    Approve COA
POST   /coa/:id/send                       Send to customer
GET    /coa/by-lot/:lotNumber              Get COA by lot number

=== TRACEABILITY ===
GET    /traceability/:lotNumber            Get lot details
GET    /traceability/:lotNumber/forward    Trace forward
GET    /traceability/:lotNumber/backward   Trace backward
GET    /traceability/:lotNumber/full       Full traceability tree

=== RECALLS ===
POST   /recalls                            Initiate recall
GET    /recalls                            List recalls
GET    /recalls/:id                        Get recall details
PUT    /recalls/:id                        Update recall
GET    /recalls/:id/affected-lots          Get affected lots
POST   /recalls/:id/actions                Log recall action

=== FDA COMPLIANCE ===
GET    /fda/documents                      List FDA documents
POST   /fda/documents                      Add FDA document
GET    /fda/statements                     Get FDA statements
POST   /fda/migration-tests                Add migration test

=== CERTIFICATIONS ===
GET    /certifications                     List company certifications
POST   /certifications                     Add certification
PUT    /certifications/:id                 Update certification
GET    /certifications/:id/audits          Get audit history
POST   /certifications/:id/audits          Add audit record

=== HACCP ===
GET    /haccp/plans                        List HACCP plans
GET    /haccp/plans/:id                    Get plan details
POST   /haccp/ccp-records                  Log CCP monitoring
GET    /haccp/ccp-records                  Get CCP records

=== CUSTOMER COMPLIANCE ===
GET    /customer-compliance/:customerId    Get customer requirements
POST   /compliance-requests                Create document request
GET    /compliance-requests                List requests
PUT    /compliance-requests/:id            Update request status

=== AUDITS ===
POST   /audits/schedule                    Schedule audit
GET    /audits/schedule                    List scheduled audits
GET    /audits/:id                         Get audit details
POST   /audits/:id/findings                Add finding
PUT    /audits/:id/findings/:fid           Update finding
POST   /audits/:id/report                  Create audit report
```

---

## AGENT IMPLEMENTATION PROMPT

```
Create Compliance & Certification modules for ProPackHub:

CONTEXT:
- Flexible packaging for food requires strict compliance
- Must generate COAs with test results
- Full lot traceability for recalls
- Manage food safety certifications

COMPLIANCE MODULE:
1. COA Generation
   - Templates per product group
   - Pull test results from QC
   - PDF generation
   - Distribution tracking

2. Batch Traceability
   - Link raw materials → WIP → finished goods
   - Forward trace (RM to customer)
   - Backward trace (customer complaint to RM)
   - Recall management

3. FDA Compliance
   - Store FDA statements per material
   - Migration test records
   - Compliance declarations

4. Certifications
   - Company certifications (ISO, BRC, FSSC)
   - Audit records and findings
   - HACCP plans and CCP monitoring

DATABASE: Use schemas from 07-COMPLIANCE-CERTIFICATIONS.md
```

---

*Continues to 08-ARTWORK-MANAGEMENT.md...*
