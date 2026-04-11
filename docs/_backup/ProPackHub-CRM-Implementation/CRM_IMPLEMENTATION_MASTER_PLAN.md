# 🎯 FLEXIBLE PACKAGING CRM - MASTER IMPLEMENTATION PLAN
## Strategic Roadmap for IPD 10-12 Project Evolution

**Created:** December 27, 2025  
**Author:** GitHub Copilot (Claude Opus 4.5)  
**Project:** IPD 10-12 → FlexPack CRM/ERP  
**Based on Analysis of:** Odoo 19.0, ERPNext, flex-pack-crm-prompt.md, flex_pack_erp_guide.txt

---

## 📋 EXECUTIVE SUMMARY

### Current State Assessment
Your IPD 10-12 project is a **mature sales analytics and budget dashboard** with:
- ✅ User authentication & role-based access control
- ✅ Product groups (PgCombine) with materials & processes
- ✅ Sales data by sales rep, customer, country, product group
- ✅ Budget management with approval workflows
- ✅ AI learning for predictions (customer behavior, churn, CLV)
- ✅ Multi-division support (FP, HC)
- ✅ Reporting & export capabilities

### What's Missing for Full CRM/ERP
- ❌ Lead capture and qualification
- ❌ Opportunity/pipeline management
- ❌ Sample request workflow
- ❌ Technical Data Sheet (TDS) generation
- ❌ Quotation engine with costing
- ❌ Production order integration
- ❌ Quality control tracking
- ❌ Customer portal

### Recommended Approach: **HYBRID EVOLUTION**
Rather than starting from scratch, we leverage your existing infrastructure and ADD CRM capabilities incrementally. This is smarter than Odoo/ERPNext because:
1. You already have customer data flowing
2. Product groups are defined
3. AI infrastructure exists
4. User/permission system is in place

---

## 🏗️ ARCHITECTURE DECISION

### Option A: Separate Modules (RECOMMENDED ✅)
```
IPD 10-12 (Existing)
├── Dashboard Module (keep)
├── Budget Module (keep)
├── Reports Module (keep)
├── Analytics Module (keep)
│
└── NEW: CRM Module (add)
    ├── Leads
    ├── Opportunities
    ├── Samples
    ├── Quotations
    ├── TDS/Specifications
    └── Production Orders
```

### Option B: Full Rewrite (NOT Recommended)
Would require 6+ months, high risk, loss of existing functionality.

---

## 📊 FLEXIBLE PACKAGING INDUSTRY CONTEXT

### Understanding the Business Flow
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLEXIBLE PACKAGING SALES CYCLE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. INQUIRY          2. SAMPLE           3. APPROVAL        4. ORDER       │
│  ┌─────────┐        ┌─────────┐         ┌─────────┐       ┌─────────┐      │
│  │ Customer│───────▶│Technical│────────▶│Customer │──────▶│Production│     │
│  │ Contact │        │ Review  │         │ Approval│       │   Order  │     │
│  └─────────┘        └─────────┘         └─────────┘       └─────────┘      │
│       │                  │                   │                 │            │
│       ▼                  ▼                   ▼                 ▼            │
│  Lead/Prospect     Sample Request      Quotation Sent    Job Order         │
│  Qualification     QC Analysis         Negotiation       TDS Generated     │
│  Requirements      Feasibility         Price Agreement   Production        │
│  Capture           Costing             Approval          Delivery          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### What Makes Flex-Pack Unique
1. **Complex Products** - Multi-layer structures (3-11 layers), each with specific materials
2. **Technical Specifications** - OTR, WVTR, tensile strength, seal strength, barrier properties
3. **Pre-production Assets** - Cylinders, plates, inks must be prepared before production
4. **Sample-Driven Sales** - Customer must approve samples before bulk orders
5. **Cost Complexity** - Materials + Setup (cylinders/plates) + Machine hours + Wastage

### Your Product Groups (Already in PgCombine)
Based on your codebase, you have product groups like:
- Pouches (Stand-up, 3-side seal, center seal)
- Roll Stock (laminated, printed)
- Bags (wicket, carry bags)
- Labels & Wrappers
- Specialty (retort, high barrier)

---

## 🎯 IMPLEMENTATION PRIORITY MATRIX

### Priority Framework
| Priority | Criteria | Modules |
|----------|----------|---------|
| P0 | Foundation - Everything depends on this | Customer Master, Contact Management |
| P1 | Revenue Generation - Direct sales impact | Opportunities, Quotations |
| P2 | Differentiation - Industry-specific | Samples, TDS, Specifications |
| P3 | Optimization - Efficiency gains | Production Orders, QC Integration |
| P4 | Scale - Growth enablers | Customer Portal, Automation |

---

## 📅 PHASED IMPLEMENTATION PLAN

## PHASE 0: FOUNDATION PREPARATION (Week 1-2)
**Goal:** Prepare infrastructure without disrupting current system

### P0-1: Customer Master Enhancement
**Why First:** You already have customers in `fp_data_excel.customername`. We need to promote this to a proper master table.

```sql
-- New table: customer_master
CREATE TABLE IF NOT EXISTS customer_master (
  customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code VARCHAR(50) UNIQUE NOT NULL,  -- Auto-generated: CUS-2025-0001
  
  -- Basic Info
  company_name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),  -- For UI display
  short_name VARCHAR(100),
  
  -- Classification
  customer_type VARCHAR(50) DEFAULT 'Prospect',  -- Prospect, Active, Inactive, Churned
  customer_category VARCHAR(50),  -- Direct, Distributor, Converter, End User
  industry VARCHAR(100),  -- FMCG, Pharma, F&B, Industrial
  market_segment VARCHAR(100),  -- Snacks, Beverages, Personal Care, etc.
  
  -- Territory & Assignment
  country VARCHAR(100),
  region VARCHAR(100),
  territory VARCHAR(100),
  assigned_salesrep VARCHAR(255),  -- Links to your existing salesrep data
  assigned_salesrep_id UUID,  -- Optional FK to employees
  
  -- Financial
  credit_limit DECIMAL(18,2) DEFAULT 0,
  payment_terms VARCHAR(100),
  currency VARCHAR(10) DEFAULT 'AED',
  
  -- Contact (Primary)
  primary_contact_name VARCHAR(255),
  primary_email VARCHAR(255),
  primary_phone VARCHAR(50),
  
  -- Address
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  
  -- Business Data
  annual_revenue DECIMAL(18,2),
  employee_count VARCHAR(50),
  website VARCHAR(255),
  
  -- Status & Tracking
  lead_source VARCHAR(100),  -- Website, Referral, Exhibition, Cold Call
  lead_date DATE,
  conversion_date DATE,
  is_active BOOLEAN DEFAULT true,
  tags TEXT[],  -- ['key_account', 'food_grade', 'high_barrier']
  
  -- Integration with existing data
  legacy_customer_names TEXT[],  -- Array of names from fp_data_excel for matching
  data_source VARCHAR(50) DEFAULT 'manual',  -- manual, import, excel_sync
  
  -- Metadata
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Search optimization
  search_vector TSVECTOR
);

-- Contacts table
CREATE TABLE IF NOT EXISTS customer_contacts (
  contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customer_master(customer_id),
  
  -- Contact Details
  salutation VARCHAR(20),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  full_name VARCHAR(255) GENERATED ALWAYS AS (
    COALESCE(salutation || ' ', '') || first_name || ' ' || last_name
  ) STORED,
  job_title VARCHAR(100),
  department VARCHAR(100),
  
  -- Communication
  email VARCHAR(255),
  phone VARCHAR(50),
  mobile VARCHAR(50),
  whatsapp VARCHAR(50),
  
  -- Permissions
  is_primary BOOLEAN DEFAULT false,
  can_approve_samples BOOLEAN DEFAULT false,
  can_approve_quotes BOOLEAN DEFAULT false,
  can_place_orders BOOLEAN DEFAULT false,
  receives_invoices BOOLEAN DEFAULT false,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  preferred_language VARCHAR(10) DEFAULT 'en',
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer addresses (for multi-location)
CREATE TABLE IF NOT EXISTS customer_addresses (
  address_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customer_master(customer_id),
  address_type VARCHAR(50),  -- Billing, Shipping, Plant
  address_name VARCHAR(255),
  is_default BOOLEAN DEFAULT false,
  
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  country VARCHAR(100),
  
  contact_person VARCHAR(255),
  contact_phone VARCHAR(50),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_customer_master_code ON customer_master(customer_code);
CREATE INDEX idx_customer_master_salesrep ON customer_master(assigned_salesrep);
CREATE INDEX idx_customer_master_type ON customer_master(customer_type);
CREATE INDEX idx_customer_master_search ON customer_master USING GIN(search_vector);
CREATE INDEX idx_customer_contacts_customer ON customer_contacts(customer_id);
CREATE INDEX idx_customer_addresses_customer ON customer_addresses(customer_id);
```

### P0-2: Data Migration Script
**Migrate existing customers from fp_data_excel:**

```javascript
// server/scripts/migrate-customers-to-master.js
const migrateCustomers = async () => {
  // Get unique customers from existing data
  const existingCustomers = await pool.query(`
    SELECT DISTINCT 
      customername,
      salesrepname,
      country
    FROM fp_data_excel 
    WHERE customername IS NOT NULL 
      AND customername != ''
    ORDER BY customername
  `);
  
  for (const customer of existingCustomers.rows) {
    // Generate customer code
    const code = await generateCustomerCode();
    
    // Insert into customer_master
    await pool.query(`
      INSERT INTO customer_master (
        customer_code, company_name, display_name,
        customer_type, assigned_salesrep, country,
        legacy_customer_names, data_source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'excel_sync')
      ON CONFLICT (customer_code) DO NOTHING
    `, [
      code,
      customer.customername,
      customer.customername,
      'Active Customer',  // They have sales data, so they're active
      customer.salesrepname,
      customer.country,
      [customer.customername]  // Store original name for matching
    ]);
  }
};
```

### P0-3: Customer UI Integration
**Location:** `src/components/MasterData/CustomerMaster.jsx`

```jsx
// New component for Customer Master management
// Tabs: Overview | Contacts | Addresses | History | Analytics
```

---

## PHASE 1: CRM CORE (Weeks 3-6)
**Goal:** Lead and Opportunity management

### P1-1: Lead Management

```sql
-- Leads table
CREATE TABLE IF NOT EXISTS crm_leads (
  lead_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_number VARCHAR(50) UNIQUE NOT NULL,  -- LEAD-2025-0001
  
  -- Lead Source
  lead_source VARCHAR(100),  -- Website, Exhibition, Referral, Cold Call, Email
  source_details TEXT,
  campaign_id UUID,
  
  -- Company Information
  company_name VARCHAR(255),
  industry VARCHAR(100),
  estimated_annual_revenue DECIMAL(18,2),
  employee_count VARCHAR(50),
  website VARCHAR(255),
  
  -- Contact Person
  contact_name VARCHAR(255),
  contact_title VARCHAR(100),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  contact_mobile VARCHAR(50),
  
  -- Location
  country VARCHAR(100),
  city VARCHAR(100),
  territory VARCHAR(100),
  
  -- Qualification
  qualification_status VARCHAR(50) DEFAULT 'Unqualified',  -- Unqualified, Qualified, Disqualified
  qualified_by UUID,
  qualified_date DATE,
  disqualification_reason TEXT,
  
  -- Assignment
  assigned_to VARCHAR(255),  -- Sales rep name (matches your existing data)
  assigned_to_id UUID,
  assigned_date DATE,
  
  -- Scoring (AI Integration)
  lead_score INT DEFAULT 0,  -- 0-100
  score_factors JSONB,
  
  -- Requirements (Flex-Pack Specific)
  interested_products TEXT[],  -- ['Stand-up Pouches', 'Roll Stock']
  product_groups TEXT[],  -- Links to your pgcombine
  estimated_volume VARCHAR(100),  -- Monthly KG requirement
  estimated_value DECIMAL(18,2),
  
  -- Pipeline
  stage VARCHAR(50) DEFAULT 'New',  -- New, Contacted, Meeting Scheduled, Requirement Gathered, Sample Requested, Converted, Lost
  probability INT DEFAULT 10,
  expected_close_date DATE,
  
  -- Status
  status VARCHAR(50) DEFAULT 'Open',  -- Open, Converted, Lost, Disqualified
  lost_reason VARCHAR(255),
  converted_to_customer_id UUID,
  converted_to_opportunity_id UUID,
  
  -- Notes
  description TEXT,
  requirements TEXT,
  
  -- Metadata
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lead Activities
CREATE TABLE IF NOT EXISTS crm_lead_activities (
  activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES crm_leads(lead_id),
  
  activity_type VARCHAR(50),  -- Call, Email, Meeting, Visit, Note
  activity_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  subject VARCHAR(255),
  description TEXT,
  outcome VARCHAR(100),
  next_action TEXT,
  next_action_date DATE,
  
  performed_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### P1-2: Opportunity/Pipeline Management

```sql
-- Opportunities (derived from Leads or direct)
CREATE TABLE IF NOT EXISTS crm_opportunities (
  opportunity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_number VARCHAR(50) UNIQUE NOT NULL,  -- OPP-2025-0001
  
  -- Source
  lead_id UUID REFERENCES crm_leads(lead_id),
  customer_id UUID REFERENCES customer_master(customer_id),
  
  -- Basic Info
  opportunity_name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Classification
  opportunity_type VARCHAR(50),  -- New Business, Repeat, Upsell, Cross-sell
  priority VARCHAR(20) DEFAULT 'Medium',  -- Low, Medium, High, Critical
  
  -- Pipeline
  stage VARCHAR(50) DEFAULT 'Qualification',
  /* Stages:
     1. Qualification - Understanding requirements
     2. Sample Request - Customer wants sample
     3. Sample Production - Making the sample
     4. Sample Approval - Waiting for customer approval
     5. Quotation - Preparing/sent quotation
     6. Negotiation - Price/terms negotiation
     7. Proposal - Final proposal submitted
     8. Closed Won - Order received
     9. Closed Lost - Lost to competitor/cancelled
  */
  probability INT,  -- Auto-calculated based on stage
  
  -- Value
  estimated_revenue DECIMAL(18,2),
  estimated_volume DECIMAL(18,2),  -- KG
  estimated_orders_per_year INT,
  currency VARCHAR(10) DEFAULT 'AED',
  
  -- Timeline
  expected_close_date DATE,
  actual_close_date DATE,
  
  -- Products (Flex-Pack Specific)
  product_groups TEXT[],
  products JSONB,  -- [{productGroup, structure, dimensions, qty}]
  
  -- Assignment
  assigned_to VARCHAR(255),
  assigned_to_id UUID,
  sales_team VARCHAR(100),
  
  -- Competition
  competitors TEXT[],
  competitive_status VARCHAR(100),
  
  -- Result
  status VARCHAR(50) DEFAULT 'Open',  -- Open, Won, Lost
  won_reason TEXT,
  lost_reason VARCHAR(255),
  lost_reason_details TEXT,
  
  -- Related Records
  sample_ids UUID[],
  quotation_ids UUID[],
  order_ids UUID[],
  
  -- Metadata
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stage configuration
CREATE TABLE IF NOT EXISTS crm_opportunity_stages (
  stage_id SERIAL PRIMARY KEY,
  stage_name VARCHAR(100) NOT NULL,
  stage_order INT NOT NULL,
  probability INT DEFAULT 10,
  is_won BOOLEAN DEFAULT false,
  is_lost BOOLEAN DEFAULT false,
  color VARCHAR(20),
  description TEXT
);

-- Insert default stages
INSERT INTO crm_opportunity_stages (stage_name, stage_order, probability, color) VALUES
('Qualification', 1, 10, '#9CA3AF'),
('Sample Request', 2, 20, '#3B82F6'),
('Sample Production', 3, 35, '#6366F1'),
('Sample Approval', 4, 50, '#8B5CF6'),
('Quotation', 5, 60, '#F59E0B'),
('Negotiation', 6, 75, '#F97316'),
('Proposal', 7, 85, '#22C55E'),
('Closed Won', 8, 100, '#16A34A'),
('Closed Lost', 9, 0, '#EF4444');
```

### P1-3: Pipeline UI Components

```
src/components/CRM/
├── index.jsx                    // CRM module entry
├── LeadManagement/
│   ├── LeadList.jsx            // Filterable table with lead scoring
│   ├── LeadForm.jsx            // Create/Edit lead
│   ├── LeadDetail.jsx          // Full lead view with timeline
│   ├── LeadConvert.jsx         // Convert to opportunity/customer
│   └── LeadImport.jsx          // Bulk import from Excel
├── OpportunityManagement/
│   ├── PipelineBoard.jsx       // Kanban board (like Odoo)
│   ├── OpportunityList.jsx     // Table view
│   ├── OpportunityForm.jsx     // Create/Edit
│   ├── OpportunityDetail.jsx   // Full view with samples, quotes
│   └── PipelineAnalytics.jsx   // Conversion funnel, velocity
├── common/
│   ├── ActivityTimeline.jsx    // Activity log component
│   ├── StageProgress.jsx       // Stage indicator
│   └── CustomerPicker.jsx      // Customer selection dropdown
```

---

## PHASE 2: SAMPLE & TDS MODULE (Weeks 7-10)
**Goal:** The heart of flex-pack CRM - sample workflow

### P2-1: Sample Request & Management

```sql
-- Sample Requests
CREATE TABLE IF NOT EXISTS crm_samples (
  sample_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_number VARCHAR(50) UNIQUE NOT NULL,  -- SMP-2025-0001
  
  -- Source
  opportunity_id UUID REFERENCES crm_opportunities(opportunity_id),
  customer_id UUID REFERENCES customer_master(customer_id),
  
  -- Sample Type
  sample_type VARCHAR(50),  -- New Development, Re-trial, Modification, Competitive
  sample_purpose TEXT,
  
  -- Product Details (FLEX-PACK SPECIFIC)
  product_group VARCHAR(100),  -- From your pgcombine
  product_name VARCHAR(255),
  
  -- Structure Definition
  structure_type VARCHAR(50),  -- Laminate, Co-extruded, Mono
  total_layers INT,
  structure_code VARCHAR(100),  -- e.g., "PET/PE/AL/PE/PE"
  structure_details JSONB,  -- Detailed layer breakdown
  /*
  structure_details example:
  {
    "layers": [
      {"layer": 1, "material": "PET", "thickness": 12, "function": "Print", "supplier": "ABC"},
      {"layer": 2, "material": "Adhesive", "thickness": 3, "function": "Bonding", "type": "Solventless"},
      {"layer": 3, "material": "AL", "thickness": 7, "function": "Barrier"},
      {"layer": 4, "material": "Adhesive", "thickness": 3, "function": "Bonding"},
      {"layer": 5, "material": "PE", "thickness": 60, "function": "Sealant"}
    ],
    "totalThickness": 85,
    "totalGSM": 95
  }
  */
  
  -- Dimensions
  width_mm DECIMAL(10,2),
  length_mm DECIMAL(10,2),  -- For pouches: gusset
  gusset_mm DECIMAL(10,2),
  finished_size VARCHAR(100),  -- "200x300+50g mm"
  
  -- Printing
  print_type VARCHAR(50),  -- Surface, Reverse, Both
  print_colors INT,
  print_colors_details TEXT,  -- "CMYK + 2 Pantone"
  pantone_codes TEXT[],
  artwork_status VARCHAR(50),  -- Not Received, Received, Approved
  artwork_files TEXT[],  -- File URLs
  
  -- Features
  features TEXT[],  -- ['Zipper', 'Spout', 'Hang Hole', 'Tear Notch', 'Euro Slot']
  special_requirements TEXT,
  
  -- Quantity
  sample_quantity INT,
  sample_unit VARCHAR(20),  -- Pcs, Meters, KG
  
  -- Workflow Status
  status VARCHAR(50) DEFAULT 'Pending',
  /*
    Pending - Awaiting review
    Feasibility Check - Technical reviewing
    Approved for Production - Ready to make
    In Production - Being made
    QC Testing - Quality testing
    Ready for Dispatch - Complete, awaiting shipment
    Dispatched - Sent to customer
    Customer Evaluation - At customer
    Approved - Customer approved
    Rejected - Customer rejected
    Revision Required - Needs modification
  */
  
  -- Assignment
  assigned_to VARCHAR(255),  -- Sales rep
  technical_assigned_to VARCHAR(255),  -- Technical person
  qc_assigned_to VARCHAR(255),  -- QC person
  
  -- Timeline
  received_date DATE,
  required_by DATE,
  feasibility_date DATE,
  production_start_date DATE,
  production_end_date DATE,
  dispatch_date DATE,
  customer_response_date DATE,
  
  -- Results
  feasibility_result VARCHAR(50),  -- Feasible, Not Feasible, Needs Modification
  feasibility_notes TEXT,
  customer_feedback TEXT,
  approval_status VARCHAR(50),  -- Approved, Rejected, Conditional
  rejection_reason TEXT,
  
  -- Costing
  estimated_cost DECIMAL(18,2),
  actual_cost DECIMAL(18,2),
  cost_breakdown JSONB,
  
  -- Files
  specification_files TEXT[],
  sample_photos TEXT[],
  test_reports TEXT[],
  
  -- Metadata
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sample Specifications (detailed technical specs)
CREATE TABLE IF NOT EXISTS crm_sample_specifications (
  spec_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id UUID REFERENCES crm_samples(sample_id),
  
  category VARCHAR(100),  -- Physical, Barrier, Mechanical, Print, Seal
  parameter VARCHAR(100),
  target_value VARCHAR(100),
  tolerance VARCHAR(50),
  unit VARCHAR(50),
  test_method VARCHAR(100),
  is_critical BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert common specs templates
-- Physical Properties
INSERT INTO crm_sample_specifications (sample_id, category, parameter, target_value, tolerance, unit, test_method, is_critical)
SELECT NULL, 'Physical', 'Total Thickness', '', '±5%', 'micron', 'ASTM D2103', true;

-- Sample QC Results
CREATE TABLE IF NOT EXISTS crm_sample_qc_results (
  result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id UUID REFERENCES crm_samples(sample_id),
  spec_id UUID REFERENCES crm_sample_specifications(spec_id),
  
  tested_value VARCHAR(100),
  pass_fail VARCHAR(20),  -- Pass, Fail, Marginal
  notes TEXT,
  tested_by VARCHAR(255),
  tested_date DATE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### P2-2: Technical Data Sheet (TDS) Generator

```sql
-- TDS Templates
CREATE TABLE IF NOT EXISTS tds_templates (
  template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_group VARCHAR(100),
  template_name VARCHAR(255),
  template_data JSONB,  -- Section definitions
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Generated TDS Documents
CREATE TABLE IF NOT EXISTS tds_documents (
  tds_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tds_number VARCHAR(50) UNIQUE NOT NULL,  -- TDS-2025-0001
  
  -- Source
  sample_id UUID REFERENCES crm_samples(sample_id),
  opportunity_id UUID REFERENCES crm_opportunities(opportunity_id),
  customer_id UUID REFERENCES customer_master(customer_id),
  
  -- Product Info
  product_name VARCHAR(255),
  product_group VARCHAR(100),
  
  -- Structure
  structure_details JSONB,
  
  -- Specifications
  specifications JSONB,
  
  -- Printing Parameters
  printing_params JSONB,
  /*
  {
    "printType": "Reverse",
    "colors": 8,
    "printProcess": "Gravure",
    "cylinderLPI": 150,
    "inkType": "Solvent-based NC",
    "printSpeed": "150-200 m/min"
  }
  */
  
  -- Lamination Parameters
  lamination_params JSONB,
  
  -- Slitting Parameters
  slitting_params JSONB,
  
  -- Converting Parameters (for pouches)
  converting_params JSONB,
  
  -- Machine Settings
  machine_settings JSONB,
  
  -- Quality Standards
  quality_standards JSONB,
  
  -- Version Control
  version INT DEFAULT 1,
  parent_tds_id UUID,
  version_notes TEXT,
  
  -- Status
  status VARCHAR(50) DEFAULT 'Draft',  -- Draft, Active, Superseded
  
  -- Approvals
  prepared_by VARCHAR(255),
  prepared_date DATE,
  reviewed_by VARCHAR(255),
  reviewed_date DATE,
  approved_by VARCHAR(255),
  approved_date DATE,
  
  -- Files
  pdf_url TEXT,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### P2-3: Sample UI Components

```
src/components/CRM/SampleManagement/
├── SampleList.jsx              // All samples with filters
├── SampleForm.jsx              // Create/Edit with structure builder
├── SampleDetail.jsx            // Full sample view
├── SampleWorkflow.jsx          // Workflow status stepper
├── StructureBuilder.jsx        // Visual layer builder
├── SpecificationTable.jsx      // Editable spec grid
├── QCResultEntry.jsx           // QC result input
├── TDSGenerator.jsx            // Auto-generate TDS
└── TDSPreview.jsx              // PDF preview
```

---

## PHASE 3: QUOTATION & COSTING (Weeks 11-14)
**Goal:** Professional quotation with flex-pack costing logic

### P3-1: Costing Engine

```sql
-- Material Master (for costing)
CREATE TABLE IF NOT EXISTS material_master (
  material_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_code VARCHAR(50) UNIQUE NOT NULL,
  
  material_name VARCHAR(255) NOT NULL,
  material_category VARCHAR(100),  -- Film, Adhesive, Ink, Accessory, Packaging
  material_type VARCHAR(100),
  
  -- For Films
  density DECIMAL(10,4),  -- g/cm³
  
  -- Pricing
  unit VARCHAR(20),  -- KG, MTR, PC
  standard_price DECIMAL(18,4),
  currency VARCHAR(10) DEFAULT 'AED',
  price_valid_until DATE,
  
  -- Supplier
  primary_supplier VARCHAR(255),
  lead_time_days INT,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Costing Formulas
CREATE TABLE IF NOT EXISTS costing_formulas (
  formula_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_group VARCHAR(100),
  formula_name VARCHAR(255),
  formula_type VARCHAR(50),  -- Material, Setup, Machine, Overhead
  
  calculation_method TEXT,  -- Formula description
  formula_expression TEXT,  -- Actual formula: "width * length * gsm * price / 1000"
  
  parameters JSONB,  -- Required parameters
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Quotations
CREATE TABLE IF NOT EXISTS crm_quotations (
  quotation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number VARCHAR(50) UNIQUE NOT NULL,  -- QT-2025-0001
  
  -- Source
  opportunity_id UUID REFERENCES crm_opportunities(opportunity_id),
  sample_id UUID REFERENCES crm_samples(sample_id),
  customer_id UUID REFERENCES customer_master(customer_id),
  
  -- Basic Info
  quotation_date DATE DEFAULT CURRENT_DATE,
  validity_days INT DEFAULT 30,
  validity_date DATE,
  
  -- Version Control
  version INT DEFAULT 1,
  parent_quotation_id UUID,
  revision_reason TEXT,
  
  -- Currency
  currency VARCHAR(10) DEFAULT 'AED',
  exchange_rate DECIMAL(10,4) DEFAULT 1,
  
  -- Terms
  payment_terms VARCHAR(255),
  delivery_terms VARCHAR(255),
  incoterm VARCHAR(50),  -- EXW, FOB, CIF, etc.
  
  -- Totals
  subtotal DECIMAL(18,2),
  discount_type VARCHAR(20),  -- Percentage, Fixed
  discount_value DECIMAL(18,2),
  discount_amount DECIMAL(18,2),
  tax_rate DECIMAL(5,2) DEFAULT 5,
  tax_amount DECIMAL(18,2),
  total_amount DECIMAL(18,2),
  
  -- MOQ & Lead Time
  moq_kg DECIMAL(18,2),
  lead_time_days INT,
  
  -- Status
  status VARCHAR(50) DEFAULT 'Draft',
  /* Draft, Sent, Customer Review, Under Negotiation, 
     Revised, Approved, Rejected, Expired, Converted */
  
  sent_date DATE,
  sent_by UUID,
  
  -- Result
  won_date DATE,
  lost_date DATE,
  lost_reason VARCHAR(255),
  
  -- Related
  order_id UUID,  -- If converted to order
  
  -- Notes
  internal_notes TEXT,
  customer_notes TEXT,  -- Printed on quotation
  terms_conditions TEXT,
  
  -- Files
  pdf_url TEXT,
  attachments TEXT[],
  
  -- Approvals
  requires_approval BOOLEAN DEFAULT false,
  approval_status VARCHAR(50),
  approved_by UUID,
  approved_date DATE,
  
  -- Metadata
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Quotation Items
CREATE TABLE IF NOT EXISTS crm_quotation_items (
  item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID REFERENCES crm_quotations(quotation_id),
  
  item_number INT,
  
  -- Product Details
  product_group VARCHAR(100),
  product_name VARCHAR(255),
  structure_code VARCHAR(100),
  structure_details JSONB,
  
  -- Dimensions
  width_mm DECIMAL(10,2),
  length_mm DECIMAL(10,2),
  
  -- Quantity & Pricing
  quantity DECIMAL(18,2),
  quantity_unit VARCHAR(20),  -- KG, MTR, PCS
  
  unit_price DECIMAL(18,4),
  amount DECIMAL(18,2),
  
  -- Cost Breakdown
  material_cost DECIMAL(18,4),
  ink_cost DECIMAL(18,4),
  cylinder_cost DECIMAL(18,4),
  plate_cost DECIMAL(18,4),
  machine_cost DECIMAL(18,4),
  wastage_cost DECIMAL(18,4),
  overhead_cost DECIMAL(18,4),
  total_cost DECIMAL(18,4),
  margin_pct DECIMAL(5,2),
  
  cost_breakdown JSONB,  -- Detailed breakdown
  
  -- Quantity Price Tiers
  price_tiers JSONB,
  /*
  [
    {"minQty": 500, "maxQty": 999, "price": 45.00},
    {"minQty": 1000, "maxQty": 2499, "price": 42.00},
    {"minQty": 2500, "maxQty": null, "price": 40.00}
  ]
  */
  
  -- One-time Costs
  cylinder_setup_cost DECIMAL(18,2),
  plate_setup_cost DECIMAL(18,2),
  die_cost DECIMAL(18,2),
  
  -- Specifications Reference
  sample_id UUID,
  tds_id UUID,
  
  -- Notes
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Quotation Negotiations
CREATE TABLE IF NOT EXISTS crm_quotation_negotiations (
  negotiation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID REFERENCES crm_quotations(quotation_id),
  
  negotiation_date DATE,
  customer_request TEXT,
  our_response TEXT,
  
  requested_price DECIMAL(18,4),
  offered_price DECIMAL(18,4),
  
  outcome VARCHAR(50),  -- Accepted, Counter Offered, Rejected, Pending
  
  negotiated_by VARCHAR(255),
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### P3-2: Costing Calculation Service

```javascript
// server/services/CostingService.js
class CostingService {
  /**
   * Calculate material cost for laminate structure
   */
  async calculateMaterialCost(structureDetails, width, length) {
    let totalMaterialCost = 0;
    
    for (const layer of structureDetails.layers) {
      const material = await this.getMaterial(layer.material);
      if (!material) continue;
      
      // GSM calculation: thickness (micron) * density
      const gsm = layer.thickness * material.density;
      
      // Area in m²
      const areaM2 = (width / 1000) * (length / 1000);
      
      // Weight in KG
      const weightKg = areaM2 * gsm / 1000;
      
      // Cost
      const cost = weightKg * material.standard_price;
      totalMaterialCost += cost;
    }
    
    return totalMaterialCost;
  }
  
  /**
   * Calculate ink cost
   */
  async calculateInkCost(printColors, coverage, areaM2) {
    const INK_GSM_PER_COLOR = 1.5;  // Average ink GSM
    const INK_PRICE_PER_KG = 25;    // Average ink price
    
    const inkWeight = (areaM2 * INK_GSM_PER_COLOR * printColors * coverage) / 1000;
    return inkWeight * INK_PRICE_PER_KG;
  }
  
  /**
   * Calculate cylinder cost (amortized)
   */
  calculateCylinderCost(cylinderCount, cylinderPrice, amortizationQty) {
    const totalCylinderCost = cylinderCount * cylinderPrice;
    return totalCylinderCost / amortizationQty;  // Per unit
  }
  
  /**
   * Full costing calculation
   */
  async calculateQuotationCosting(quotationItem) {
    const structure = quotationItem.structure_details;
    const width = quotationItem.width_mm;
    const length = quotationItem.length_mm;
    const quantity = quotationItem.quantity;
    
    // Material costs
    const materialCost = await this.calculateMaterialCost(structure, width, length);
    
    // Ink costs
    const inkCost = await this.calculateInkCost(
      quotationItem.print_colors || 4,
      0.3,  // 30% coverage
      (width / 1000) * (length / 1000)
    );
    
    // Wastage (typically 5-10%)
    const wastagePct = this.getWastagePct(quotationItem.product_group);
    const wastage = (materialCost + inkCost) * wastagePct;
    
    // Cylinder/Plate costs (setup, amortized over quantity)
    const cylinderCost = this.calculateCylinderCost(
      quotationItem.print_colors || 4,
      2500,  // Price per cylinder
      quantity
    );
    
    // Machine cost (time-based)
    const machineCost = await this.calculateMachineCost(quotationItem);
    
    // Overhead (typically 8-12%)
    const subtotal = materialCost + inkCost + wastage + cylinderCost + machineCost;
    const overhead = subtotal * 0.10;
    
    const totalCost = subtotal + overhead;
    
    return {
      material_cost: materialCost,
      ink_cost: inkCost,
      wastage_cost: wastage,
      cylinder_cost: cylinderCost,
      machine_cost: machineCost,
      overhead_cost: overhead,
      total_cost: totalCost,
      suggested_price: totalCost * 1.20,  // 20% margin
      cost_breakdown: {
        materials: this.formatMaterialBreakdown(structure),
        ink: inkCost,
        wastage: { pct: wastagePct * 100, amount: wastage },
        setup: cylinderCost * quantity,
        machine: machineCost,
        overhead: { pct: 10, amount: overhead }
      }
    };
  }
}
```

### P3-3: Quotation UI Components

```
src/components/CRM/QuotationManagement/
├── QuotationList.jsx           // All quotations
├── QuotationForm.jsx           // Create/Edit
├── QuotationDetail.jsx         // Full view
├── CostingCalculator.jsx       // Interactive costing
├── PriceTierEditor.jsx         // Quantity-based pricing
├── QuotationPDFPreview.jsx     // PDF preview
├── QuotationNegotiation.jsx    // Negotiation history
└── QuotationApproval.jsx       // Approval workflow
```

---

## PHASE 4: PRODUCTION INTEGRATION (Weeks 15-18)
**Goal:** Connect to production workflow

### P4-1: Production Order from Quotation

```sql
-- Production Orders
CREATE TABLE IF NOT EXISTS production_orders (
  order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(50) UNIQUE NOT NULL,  -- PO-2025-0001
  
  -- Source
  quotation_id UUID REFERENCES crm_quotations(quotation_id),
  customer_id UUID REFERENCES customer_master(customer_id),
  
  -- Order Info
  order_date DATE DEFAULT CURRENT_DATE,
  required_date DATE,
  promised_date DATE,
  
  -- Product
  product_group VARCHAR(100),
  product_name VARCHAR(255),
  tds_id UUID REFERENCES tds_documents(tds_id),
  
  -- Quantity
  order_quantity DECIMAL(18,2),
  quantity_unit VARCHAR(20),
  
  -- Status
  status VARCHAR(50) DEFAULT 'Pending',
  /* Pending, Scheduled, Materials Ready, In Production, 
     QC Check, Packing, Ready to Ship, Dispatched, Delivered */
  
  -- Progress
  production_start_date DATE,
  production_end_date DATE,
  actual_quantity DECIMAL(18,2),
  rejected_quantity DECIMAL(18,2),
  
  -- Costing (actual)
  actual_material_cost DECIMAL(18,2),
  actual_conversion_cost DECIMAL(18,2),
  actual_total_cost DECIMAL(18,2),
  
  -- Delivery
  dispatch_date DATE,
  delivery_date DATE,
  delivery_note_number VARCHAR(50),
  
  -- Invoice
  invoice_number VARCHAR(50),
  invoice_date DATE,
  invoice_amount DECIMAL(18,2),
  payment_status VARCHAR(50),
  
  -- Metadata
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔌 INTEGRATION WITH EXISTING SYSTEM

### Database Connection Points

```javascript
// How CRM tables connect to your existing data

// 1. Customer linking
customer_master.legacy_customer_names <---> fp_data_excel.customername

// 2. Sales Rep linking
customer_master.assigned_salesrep <---> fp_data_excel.salesrepname
crm_leads.assigned_to <---> users.full_name / employees.name

// 3. Product Group linking
crm_samples.product_group <---> fp_data_excel.productgroup (pgcombine)
crm_quotation_items.product_group <---> fp_data_excel.productgroup

// 4. AI Integration (existing tables)
fp_customer_behavior_history <---> customer_master
fp_customer_churn_predictions <---> customer_master
fp_customer_lifetime_value <---> customer_master
```

### UI Navigation Updates

```jsx
// src/App.jsx - Add CRM route
<Route path="/crm/*" element={<CRMModule />} />

// src/components/common/Sidebar.jsx - Add CRM menu
{
  key: 'crm',
  icon: <UsersIcon />,
  label: 'CRM',
  children: [
    { key: 'crm-dashboard', label: 'Dashboard', path: '/crm' },
    { key: 'crm-leads', label: 'Leads', path: '/crm/leads' },
    { key: 'crm-opportunities', label: 'Pipeline', path: '/crm/opportunities' },
    { key: 'crm-samples', label: 'Samples', path: '/crm/samples' },
    { key: 'crm-quotations', label: 'Quotations', path: '/crm/quotations' },
    { key: 'crm-customers', label: 'Customers', path: '/crm/customers' },
  ]
}
```

---

## 📊 COMPARISON: YOUR APPROACH VS ODOO/ERPNEXT

| Aspect | Odoo | ERPNext | Your System (Recommended) |
|--------|------|---------|---------------------------|
| **Lead Model** | Generic crm.lead | Generic Lead doctype | **Flex-pack focused** with product groups, structure types |
| **Sample Workflow** | ❌ None | ❌ None | **✅ Full sample lifecycle** - key differentiator |
| **TDS Generation** | ❌ Manual | ❌ Manual | **✅ Auto-generated** from sample specs |
| **Costing** | Basic | Basic | **✅ Flex-pack specific** - layers, cylinders, wastage |
| **Integration** | Requires modules | Requires apps | **✅ Native** - uses your existing data |
| **AI/ML** | Limited | Limited | **✅ Leverage existing** AI learning tables |

---

## 📦 DELIVERABLES BY PHASE

### Phase 0 (Weeks 1-2)
- [ ] Customer Master migration script
- [ ] customer_master table created
- [ ] customer_contacts table created
- [ ] CustomerMaster.jsx component
- [ ] Customer API routes

### Phase 1 (Weeks 3-6)
- [ ] crm_leads table
- [ ] crm_opportunities table
- [ ] Lead management UI
- [ ] Pipeline Kanban board
- [ ] Lead conversion workflow
- [ ] Opportunity analytics

### Phase 2 (Weeks 7-10)
- [ ] crm_samples table
- [ ] Sample specifications system
- [ ] Structure builder component
- [ ] QC result entry
- [ ] TDS generator
- [ ] PDF generation

### Phase 3 (Weeks 11-14)
- [ ] material_master table
- [ ] Costing engine
- [ ] crm_quotations table
- [ ] Quotation builder UI
- [ ] Price tier management
- [ ] Quotation PDF generation
- [ ] Negotiation tracking

### Phase 4 (Weeks 15-18)
- [ ] production_orders table
- [ ] Order creation from quotation
- [ ] Production status tracking
- [ ] Delivery management

---

## 🚀 QUICK START COMMANDS

```bash
# 1. Create migration for Phase 0
cd server
node scripts/create-crm-tables.js

# 2. Run customer migration
node scripts/migrate-customers-to-master.js

# 3. Create CRM components folder
mkdir -p ../src/components/CRM/{LeadManagement,OpportunityManagement,SampleManagement,QuotationManagement}

# 4. Add CRM routes to server
# server/routes/crm/index.js
```

---

## 🎯 SUCCESS METRICS

After full implementation, measure:

1. **Lead Conversion Rate:** % of leads that become customers
2. **Sample Approval Rate:** % of samples approved first time
3. **Quotation Win Rate:** % of quotes converted to orders
4. **Time to Quote:** Days from sample approval to quotation sent
5. **Pipeline Value:** Total value of opportunities by stage
6. **Customer Acquisition Cost:** Marketing spend / new customers
7. **Sales Rep Performance:** Leads, samples, quotes, orders per rep

---

## 📋 AGENT HANDOFF INSTRUCTIONS

**For the next agent implementing Phase 0:**

1. Create `server/migrations/100_create_crm_foundation.sql` with:
   - customer_master table
   - customer_contacts table  
   - customer_addresses table
   - Required indexes

2. Create `server/routes/crm/customers.js` with:
   - GET /customers - list with filters
   - GET /customers/:id - single customer
   - POST /customers - create
   - PUT /customers/:id - update
   - POST /customers/:id/contacts - add contact

3. Create `src/components/CRM/CustomerMaster.jsx` with:
   - Table view of customers
   - Search and filter
   - Create/Edit modal
   - Contact management tab

4. Update `src/components/common/Sidebar.jsx` to add CRM menu

5. Create migration script to import existing customers from fp_data_excel

**Key files to reference:**
- [server/database/fpDataService.js](server/database/fpDataService.js) - For data patterns
- [server/routes/customerMaster.js](server/routes/customerMaster.js) - If exists, for API patterns
- [src/components/MasterData/](src/components/MasterData/) - For UI patterns

---

## 🏁 CONCLUSION

This plan provides a **strategic, incremental approach** to adding CRM capabilities to your existing IPD 10-12 project. Rather than replacing what works, we're building on your solid foundation.

**Key advantages of this plan:**
1. ✅ No disruption to existing functionality
2. ✅ Leverages your existing customer/product/user data
3. ✅ Industry-specific features (samples, TDS, costing)
4. ✅ Integrates with your AI learning system
5. ✅ Clear phases with measurable deliverables
6. ✅ Can be implemented incrementally

**Recommended immediate next steps:**
1. Review this plan with stakeholders
2. Start Phase 0 with customer master migration
3. Build Phase 1 CRM core (leads + opportunities)
4. Expand to samples and quotations

This plan is designed to beat any alternative because it's **custom-tailored to flexible packaging**, **builds on your existing work**, and provides a **clear, executable roadmap**.

---

*Document prepared by GitHub Copilot (Claude Opus 4.5) - December 27, 2025*
