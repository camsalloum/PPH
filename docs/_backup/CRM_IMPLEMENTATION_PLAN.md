# FlexPack CRM - Complete Implementation Plan

## 📋 Executive Summary

This document outlines a comprehensive implementation plan for transforming the current basic CRM module into a full-featured Customer Relationship Management system for FlexPack Industries. The implementation is divided into phases, with each phase building upon the previous one.

**Current State:** Basic customer list with sales history lookup
**Target State:** Full CRM with Leads, Opportunities, Quotations, Samples, Activities, and comprehensive reporting
**Last Updated:** January 3, 2026

---

## 🎨 STYLING GUIDELINES

### ⚠️ CSS Best Practices
- **Always use separate CSS files** - NOT inline styles
- Main CSS file: `src/components/CRM/CRM.css`
- Use CSS class naming convention: `crm-{component}-{element}`
- Reserve inline styles ONLY for dynamic values (colors from data, computed widths)

See `CRM_FRONTEND_IMPLEMENTATION_GUIDE.md` for detailed CSS class reference.

---

## 🏗️ Architecture Overview

### Technology Stack
- **Frontend:** React 18 + Ant Design 5 + Recharts
- **Backend:** Node.js + Express.js
- **Database:** PostgreSQL
- **Authentication:** JWT tokens
- **Real-time:** Socket.io (future)

### Role-Based Access
| Role | Dashboard | Access Level |
|------|-----------|--------------|
| Admin | AdminCRMDashboard | Full access - all data, all users |
| Management | AdminCRMDashboard | Full read, limited edit on own team |
| Sales Rep | CRMDashboard | Personal data only (my customers, my leads, etc.) |

---

## 🗂️ Navigation Structure (Left Sidebar)

```
📊 CRM Module
├── 📈 Dashboard
│   ├── Overview (KPIs, Charts)
│   ├── Analytics (Funnel, Radar, Segments)
│   └── Reports (Monthly, Export)
│
├── 👥 CUSTOMERS
│   ├── All Customers
│   ├── My Customers (Sales Rep)
│   ├── Customer Map
│   ├── Customer Segments
│   └── Import/Export
│
├── ⚡ LEADS
│   ├── All Leads
│   ├── My Leads
│   ├── New Lead
│   ├── Lead Scoring
│   └── Lead Sources
│
├── 💼 OPPORTUNITIES
│   ├── Pipeline View
│   ├── Kanban Board
│   ├── My Opportunities
│   ├── New Opportunity
│   └── Won/Lost Analysis
│
├── 📝 QUOTATIONS
│   ├── All Quotations
│   ├── My Quotations
│   ├── Create Quotation
│   ├── Templates
│   └── Pricing Rules
│
├── 🧪 SAMPLES
│   ├── Sample Requests
│   ├── In Production
│   ├── Pending Approval
│   ├── New Sample Request
│   └── Sample History
│
├── 📅 ACTIVITIES
│   ├── Calendar View
│   ├── My Tasks
│   ├── Team Tasks
│   ├── Calls Log
│   ├── Emails Log
│   └── Meetings
│
├── 📦 PRODUCTS
│   ├── Product Groups
│   ├── Product Catalog
│   ├── Pricing
│   └── Specifications
│
├── 📊 REPORTS
│   ├── Sales Reports
│   ├── Pipeline Reports
│   ├── Activity Reports
│   ├── Team Performance
│   └── Custom Reports
│
└── ⚙️ SETTINGS (Admin)
    ├── CRM Settings
    ├── Lead Sources
    ├── Pipeline Stages
    ├── Activity Types
    └── Email Templates
```

---

## 🗄️ Database Schema - New Tables

### 1. Lead Management

```sql
-- =============================================
-- TABLE: crm_leads
-- Purpose: Track potential customers from first contact
-- =============================================
CREATE TABLE crm_leads (
    id SERIAL PRIMARY KEY,
    lead_number VARCHAR(20) UNIQUE NOT NULL,  -- AUTO: LEAD-2026-00001
    
    -- Lead Info
    company_name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    contact_title VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    mobile VARCHAR(50),
    website VARCHAR(255),
    
    -- Address
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    postal_code VARCHAR(20),
    
    -- Lead Classification
    lead_source VARCHAR(50),        -- website, referral, trade_show, cold_call, email_campaign
    lead_source_detail VARCHAR(255), -- Specific campaign/referrer name
    industry VARCHAR(100),          -- food_beverage, personal_care, industrial, agriculture
    company_size VARCHAR(50),       -- small, medium, large, enterprise
    annual_revenue_range VARCHAR(50),
    
    -- Lead Scoring
    lead_score INTEGER DEFAULT 0,   -- 0-100 based on scoring rules
    lead_temperature VARCHAR(20) DEFAULT 'cold', -- cold, warm, hot
    lead_rating VARCHAR(5),         -- A, B, C, D
    
    -- Status Tracking
    status VARCHAR(30) DEFAULT 'new', -- new, contacted, qualified, unqualified, converted, lost
    status_reason VARCHAR(255),
    
    -- Assignment
    assigned_to VARCHAR(100),       -- Sales Rep name
    assigned_date TIMESTAMP,
    
    -- Interest
    interested_products TEXT[],     -- Array of product groups
    estimated_annual_volume DECIMAL(15,2),
    estimated_volume_unit VARCHAR(20), -- KG, MT, etc.
    estimated_deal_value DECIMAL(15,2),
    currency VARCHAR(3) DEFAULT 'AED',
    
    -- Next Action
    next_action VARCHAR(255),
    next_action_date DATE,
    
    -- Conversion
    converted_to_customer_id INTEGER REFERENCES fp_customer_unified(customer_id),
    converted_to_opportunity_id INTEGER,
    converted_date TIMESTAMP,
    converted_by VARCHAR(100),
    
    -- Metadata
    notes TEXT,
    tags TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    is_deleted BOOLEAN DEFAULT FALSE
);

-- Lead Source Configuration
CREATE TABLE crm_lead_sources (
    id SERIAL PRIMARY KEY,
    source_name VARCHAR(100) NOT NULL,
    source_type VARCHAR(50),        -- online, offline, referral, marketing
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0
);

-- Lead Scoring Rules
CREATE TABLE crm_lead_scoring_rules (
    id SERIAL PRIMARY KEY,
    rule_name VARCHAR(100) NOT NULL,
    field_name VARCHAR(100),        -- company_size, industry, country, etc.
    field_value VARCHAR(255),
    score_points INTEGER,           -- Points to add/subtract
    is_active BOOLEAN DEFAULT TRUE
);
```

### 2. Opportunity Management

```sql
-- =============================================
-- TABLE: crm_opportunities
-- Purpose: Track potential deals through sales pipeline
-- =============================================
CREATE TABLE crm_opportunities (
    id SERIAL PRIMARY KEY,
    opportunity_number VARCHAR(20) UNIQUE NOT NULL, -- OPP-2026-00001
    opportunity_name VARCHAR(255) NOT NULL,
    
    -- Related Records
    customer_id INTEGER REFERENCES fp_customer_unified(customer_id),
    lead_id INTEGER REFERENCES crm_leads(id),
    contact_id INTEGER REFERENCES crm_contacts(id),
    
    -- Opportunity Details
    description TEXT,
    opportunity_type VARCHAR(50),   -- new_business, existing_business, renewal
    
    -- Pipeline Stage
    stage VARCHAR(50) NOT NULL,     -- prospecting, qualification, proposal, negotiation, closed_won, closed_lost
    stage_changed_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    probability INTEGER DEFAULT 10, -- 0-100%
    
    -- Value
    amount DECIMAL(15,2),
    currency VARCHAR(3) DEFAULT 'AED',
    expected_revenue DECIMAL(15,2), -- amount * probability
    
    -- Products
    product_groups TEXT[],
    estimated_quantity DECIMAL(15,2),
    quantity_unit VARCHAR(20),
    
    -- Timeline
    expected_close_date DATE,
    actual_close_date DATE,
    
    -- Assignment
    owner VARCHAR(100),             -- Primary sales rep
    team_members TEXT[],            -- Supporting team
    
    -- Competition
    competitors TEXT[],
    competitive_position VARCHAR(50), -- strong, moderate, weak
    
    -- Win/Loss
    close_reason VARCHAR(255),
    close_notes TEXT,
    lost_to_competitor VARCHAR(255),
    
    -- Metadata
    tags TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    is_deleted BOOLEAN DEFAULT FALSE
);

-- Opportunity Products (Line Items)
CREATE TABLE crm_opportunity_products (
    id SERIAL PRIMARY KEY,
    opportunity_id INTEGER REFERENCES crm_opportunities(id) ON DELETE CASCADE,
    product_group_id INTEGER,
    product_name VARCHAR(255),
    description TEXT,
    quantity DECIMAL(15,2),
    unit VARCHAR(20),
    unit_price DECIMAL(15,2),
    discount_percent DECIMAL(5,2) DEFAULT 0,
    total_amount DECIMAL(15,2),
    notes TEXT
);

-- Pipeline Stage Configuration
CREATE TABLE crm_pipeline_stages (
    id SERIAL PRIMARY KEY,
    stage_name VARCHAR(100) NOT NULL,
    stage_key VARCHAR(50) UNIQUE NOT NULL,
    probability INTEGER DEFAULT 0,
    display_order INTEGER,
    color VARCHAR(20),
    is_won BOOLEAN DEFAULT FALSE,
    is_lost BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE
);

-- Insert default pipeline stages
INSERT INTO crm_pipeline_stages (stage_name, stage_key, probability, display_order, color, is_won, is_lost) VALUES
('Prospecting', 'prospecting', 10, 1, '#1890ff', FALSE, FALSE),
('Qualification', 'qualification', 25, 2, '#13c2c2', FALSE, FALSE),
('Needs Analysis', 'needs_analysis', 40, 3, '#52c41a', FALSE, FALSE),
('Proposal', 'proposal', 60, 4, '#faad14', FALSE, FALSE),
('Negotiation', 'negotiation', 80, 5, '#722ed1', FALSE, FALSE),
('Closed Won', 'closed_won', 100, 6, '#52c41a', TRUE, FALSE),
('Closed Lost', 'closed_lost', 0, 7, '#f5222d', FALSE, TRUE);
```

### 3. Quotation Management

```sql
-- =============================================
-- TABLE: crm_quotations
-- Purpose: Formal price quotes to customers
-- =============================================
CREATE TABLE crm_quotations (
    id SERIAL PRIMARY KEY,
    quotation_number VARCHAR(30) UNIQUE NOT NULL, -- QT-2026-00001
    revision_number INTEGER DEFAULT 1,
    
    -- Related Records
    customer_id INTEGER REFERENCES fp_customer_unified(customer_id),
    opportunity_id INTEGER REFERENCES crm_opportunities(id),
    contact_id INTEGER REFERENCES crm_contacts(id),
    
    -- Quotation Details
    quotation_date DATE DEFAULT CURRENT_DATE,
    valid_until DATE,
    subject VARCHAR(255),
    description TEXT,
    
    -- Pricing
    subtotal DECIMAL(15,2) DEFAULT 0,
    discount_amount DECIMAL(15,2) DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'AED',
    
    -- Terms
    payment_terms VARCHAR(255),
    delivery_terms VARCHAR(255),
    incoterm VARCHAR(20),           -- FOB, CIF, EXW, etc.
    lead_time_days INTEGER,
    minimum_order_quantity DECIMAL(15,2),
    moq_unit VARCHAR(20),
    
    -- Status
    status VARCHAR(30) DEFAULT 'draft', -- draft, sent, viewed, accepted, rejected, expired, revised
    status_date TIMESTAMP,
    sent_date TIMESTAMP,
    sent_via VARCHAR(20),           -- email, whatsapp, courier
    viewed_date TIMESTAMP,
    response_date TIMESTAMP,
    rejection_reason TEXT,
    
    -- Assignment
    prepared_by VARCHAR(100),
    approved_by VARCHAR(100),
    approval_date TIMESTAMP,
    
    -- PDF
    pdf_url VARCHAR(500),
    
    -- Metadata
    notes TEXT,
    internal_notes TEXT,
    tags TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    is_deleted BOOLEAN DEFAULT FALSE
);

-- Quotation Line Items
CREATE TABLE crm_quotation_items (
    id SERIAL PRIMARY KEY,
    quotation_id INTEGER REFERENCES crm_quotations(id) ON DELETE CASCADE,
    line_number INTEGER,
    
    -- Product
    product_group_id INTEGER,
    product_name VARCHAR(255) NOT NULL,
    description TEXT,
    specifications TEXT,
    
    -- Quantity & Pricing
    quantity DECIMAL(15,2),
    unit VARCHAR(20),               -- KG, MT, PCS, etc.
    unit_price DECIMAL(15,4),
    discount_percent DECIMAL(5,2) DEFAULT 0,
    line_total DECIMAL(15,2),
    
    -- Delivery
    delivery_date DATE,
    
    -- Notes
    notes TEXT
);

-- Quotation Templates
CREATE TABLE crm_quotation_templates (
    id SERIAL PRIMARY KEY,
    template_name VARCHAR(100) NOT NULL,
    description TEXT,
    header_html TEXT,
    footer_html TEXT,
    terms_text TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE
);
```

### 4. Sample Management

```sql
-- =============================================
-- TABLE: crm_samples
-- Purpose: Track product sample requests and status
-- =============================================
CREATE TABLE crm_samples (
    id SERIAL PRIMARY KEY,
    sample_number VARCHAR(20) UNIQUE NOT NULL, -- SMP-2026-00001
    
    -- Related Records
    customer_id INTEGER REFERENCES fp_customer_unified(customer_id),
    lead_id INTEGER REFERENCES crm_leads(id),
    opportunity_id INTEGER REFERENCES crm_opportunities(id),
    contact_id INTEGER REFERENCES crm_contacts(id),
    quotation_id INTEGER REFERENCES crm_quotations(id),
    
    -- Sample Details
    request_date DATE DEFAULT CURRENT_DATE,
    product_group_id INTEGER,
    product_name VARCHAR(255) NOT NULL,
    product_specifications TEXT,
    sample_type VARCHAR(50),        -- standard, custom, trial
    quantity DECIMAL(10,2),
    quantity_unit VARCHAR(20),
    
    -- Purpose
    purpose VARCHAR(100),           -- evaluation, testing, approval, presentation
    end_use_application VARCHAR(255),
    
    -- Status Workflow
    status VARCHAR(30) DEFAULT 'requested', 
    -- requested -> approved -> in_production -> ready -> shipped -> delivered -> feedback_received
    status_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Approval
    approval_required BOOLEAN DEFAULT TRUE,
    approved_by VARCHAR(100),
    approval_date TIMESTAMP,
    rejection_reason TEXT,
    
    -- Production
    production_started DATE,
    production_completed DATE,
    production_notes TEXT,
    
    -- Shipping
    shipping_date DATE,
    shipping_method VARCHAR(50),
    tracking_number VARCHAR(100),
    carrier VARCHAR(100),
    shipping_cost DECIMAL(10,2),
    
    -- Delivery
    estimated_delivery DATE,
    actual_delivery DATE,
    delivery_confirmed_by VARCHAR(100),
    
    -- Feedback
    feedback_received BOOLEAN DEFAULT FALSE,
    feedback_date DATE,
    feedback_rating INTEGER,        -- 1-5
    feedback_comments TEXT,
    sample_approved_for_order BOOLEAN,
    
    -- Follow-up
    follow_up_date DATE,
    follow_up_notes TEXT,
    
    -- Cost Tracking
    sample_cost DECIMAL(10,2),
    is_chargeable BOOLEAN DEFAULT FALSE,
    charge_amount DECIMAL(10,2),
    
    -- Assignment
    requested_by VARCHAR(100),      -- Sales rep
    handled_by VARCHAR(100),        -- Production coordinator
    
    -- Metadata
    priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
    tags TEXT[],
    notes TEXT,
    internal_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    is_deleted BOOLEAN DEFAULT FALSE
);

-- Sample Attachments (images, specs)
CREATE TABLE crm_sample_attachments (
    id SERIAL PRIMARY KEY,
    sample_id INTEGER REFERENCES crm_samples(id) ON DELETE CASCADE,
    file_name VARCHAR(255),
    file_type VARCHAR(50),
    file_url VARCHAR(500),
    file_size INTEGER,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uploaded_by VARCHAR(100)
);
```

### 5. Activity Management

```sql
-- =============================================
-- TABLE: crm_activities
-- Purpose: Track all customer interactions
-- =============================================
CREATE TABLE crm_activities (
    id SERIAL PRIMARY KEY,
    activity_number VARCHAR(20),    -- ACT-2026-00001
    
    -- Activity Type
    activity_type VARCHAR(30) NOT NULL, -- call, email, meeting, task, note, visit
    
    -- Related Records (polymorphic)
    related_to_type VARCHAR(30),    -- customer, lead, opportunity, quotation, sample
    related_to_id INTEGER,
    customer_id INTEGER REFERENCES fp_customer_unified(customer_id),
    lead_id INTEGER REFERENCES crm_leads(id),
    opportunity_id INTEGER REFERENCES crm_opportunities(id),
    contact_id INTEGER REFERENCES crm_contacts(id),
    
    -- Activity Details
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    location VARCHAR(255),
    
    -- Scheduling
    start_datetime TIMESTAMP,
    end_datetime TIMESTAMP,
    all_day BOOLEAN DEFAULT FALSE,
    duration_minutes INTEGER,
    
    -- Status
    status VARCHAR(30) DEFAULT 'planned', -- planned, in_progress, completed, cancelled
    completed_at TIMESTAMP,
    outcome VARCHAR(100),           -- successful, no_answer, rescheduled, etc.
    outcome_notes TEXT,
    
    -- Assignment
    assigned_to VARCHAR(100),
    participants TEXT[],            -- Other attendees
    
    -- Reminders
    reminder_enabled BOOLEAN DEFAULT FALSE,
    reminder_datetime TIMESTAMP,
    reminder_sent BOOLEAN DEFAULT FALSE,
    
    -- Call Specific
    call_direction VARCHAR(10),     -- inbound, outbound
    call_duration_seconds INTEGER,
    phone_number VARCHAR(50),
    call_recording_url VARCHAR(500),
    
    -- Email Specific
    email_from VARCHAR(255),
    email_to TEXT[],
    email_cc TEXT[],
    email_subject VARCHAR(255),
    email_body TEXT,
    email_opened BOOLEAN,
    email_opened_at TIMESTAMP,
    
    -- Meeting Specific
    meeting_type VARCHAR(50),       -- in_person, video, phone
    meeting_link VARCHAR(500),
    meeting_notes TEXT,
    
    -- Task Specific
    priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
    due_date DATE,
    
    -- Metadata
    tags TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    is_deleted BOOLEAN DEFAULT FALSE
);

-- Activity Types Configuration
CREATE TABLE crm_activity_types (
    id SERIAL PRIMARY KEY,
    type_key VARCHAR(30) UNIQUE NOT NULL,
    type_name VARCHAR(100) NOT NULL,
    icon VARCHAR(50),
    color VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER
);

INSERT INTO crm_activity_types (type_key, type_name, icon, color, display_order) VALUES
('call', 'Phone Call', 'phone', '#13c2c2', 1),
('email', 'Email', 'mail', '#1890ff', 2),
('meeting', 'Meeting', 'calendar', '#722ed1', 3),
('task', 'Task', 'check-circle', '#52c41a', 4),
('visit', 'Site Visit', 'environment', '#fa8c16', 5),
('note', 'Note', 'file-text', '#8c8c8c', 6);
```

### 6. Contact Management (Extended)

```sql
-- =============================================
-- TABLE: crm_contacts
-- Purpose: Individual contacts at customer companies
-- =============================================
CREATE TABLE crm_contacts (
    id SERIAL PRIMARY KEY,
    
    -- Related Customer
    customer_id INTEGER REFERENCES fp_customer_unified(customer_id),
    lead_id INTEGER REFERENCES crm_leads(id),
    
    -- Personal Info
    salutation VARCHAR(10),         -- Mr., Mrs., Ms., Dr.
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    full_name VARCHAR(255) GENERATED ALWAYS AS (
        CASE WHEN last_name IS NOT NULL 
             THEN first_name || ' ' || last_name 
             ELSE first_name 
        END
    ) STORED,
    
    -- Job Info
    job_title VARCHAR(100),
    department VARCHAR(100),
    reports_to INTEGER REFERENCES crm_contacts(id),
    
    -- Contact Details
    email VARCHAR(255),
    email_secondary VARCHAR(255),
    phone_office VARCHAR(50),
    phone_mobile VARCHAR(50),
    phone_direct VARCHAR(50),
    whatsapp VARCHAR(50),
    linkedin_url VARCHAR(255),
    
    -- Address (if different from company)
    address_line1 VARCHAR(255),
    city VARCHAR(100),
    country VARCHAR(100),
    
    -- Preferences
    preferred_contact_method VARCHAR(20), -- email, phone, whatsapp
    preferred_language VARCHAR(20),
    timezone VARCHAR(50),
    best_time_to_contact VARCHAR(100),
    do_not_call BOOLEAN DEFAULT FALSE,
    do_not_email BOOLEAN DEFAULT FALSE,
    
    -- Role in Sales
    is_decision_maker BOOLEAN DEFAULT FALSE,
    is_primary_contact BOOLEAN DEFAULT FALSE,
    influence_level VARCHAR(20),    -- high, medium, low
    relationship_status VARCHAR(30), -- prospect, active, champion, detractor
    
    -- Birthday/Anniversary
    birthday DATE,
    anniversary DATE,
    
    -- Social
    interests TEXT,
    notes TEXT,
    
    -- Photo
    photo_url VARCHAR(500),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    tags TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    is_deleted BOOLEAN DEFAULT FALSE
);
```

### 7. Customer Extensions

```sql
-- =============================================
-- Extend existing fp_customer_unified with CRM fields
-- =============================================
ALTER TABLE fp_customer_unified ADD COLUMN IF NOT EXISTS 
    customer_type VARCHAR(30) DEFAULT 'customer'; -- prospect, customer, partner, competitor

ALTER TABLE fp_customer_unified ADD COLUMN IF NOT EXISTS 
    industry VARCHAR(100);

ALTER TABLE fp_customer_unified ADD COLUMN IF NOT EXISTS 
    company_size VARCHAR(50);

ALTER TABLE fp_customer_unified ADD COLUMN IF NOT EXISTS 
    annual_revenue_range VARCHAR(50);

ALTER TABLE fp_customer_unified ADD COLUMN IF NOT EXISTS 
    website VARCHAR(255);

ALTER TABLE fp_customer_unified ADD COLUMN IF NOT EXISTS 
    linkedin_url VARCHAR(255);

ALTER TABLE fp_customer_unified ADD COLUMN IF NOT EXISTS 
    customer_since DATE;

ALTER TABLE fp_customer_unified ADD COLUMN IF NOT EXISTS 
    account_tier VARCHAR(20); -- platinum, gold, silver, bronze

ALTER TABLE fp_customer_unified ADD COLUMN IF NOT EXISTS 
    credit_limit DECIMAL(15,2);

ALTER TABLE fp_customer_unified ADD COLUMN IF NOT EXISTS 
    payment_terms VARCHAR(50);

ALTER TABLE fp_customer_unified ADD COLUMN IF NOT EXISTS 
    tags TEXT[];

ALTER TABLE fp_customer_unified ADD COLUMN IF NOT EXISTS 
    notes TEXT;

-- Customer Segments
CREATE TABLE crm_customer_segments (
    id SERIAL PRIMARY KEY,
    segment_name VARCHAR(100) NOT NULL,
    segment_key VARCHAR(50) UNIQUE,
    description TEXT,
    color VARCHAR(20),
    criteria_json JSONB,            -- Dynamic filter criteria
    is_dynamic BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE
);
```

### 8. Supporting Tables

```sql
-- =============================================
-- Notes (Comments on any record)
-- =============================================
CREATE TABLE crm_notes (
    id SERIAL PRIMARY KEY,
    related_to_type VARCHAR(30) NOT NULL,
    related_to_id INTEGER NOT NULL,
    note_text TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- Attachments (Files on any record)
-- =============================================
CREATE TABLE crm_attachments (
    id SERIAL PRIMARY KEY,
    related_to_type VARCHAR(30) NOT NULL,
    related_to_id INTEGER NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50),
    file_size INTEGER,
    file_url VARCHAR(500),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uploaded_by VARCHAR(100)
);

-- =============================================
-- Tags
-- =============================================
CREATE TABLE crm_tags (
    id SERIAL PRIMARY KEY,
    tag_name VARCHAR(50) UNIQUE NOT NULL,
    tag_color VARCHAR(20),
    usage_count INTEGER DEFAULT 0
);

-- =============================================
-- Email Templates
-- =============================================
CREATE TABLE crm_email_templates (
    id SERIAL PRIMARY KEY,
    template_name VARCHAR(100) NOT NULL,
    template_type VARCHAR(50),      -- follow_up, quotation, sample_confirmation, etc.
    subject VARCHAR(255),
    body_html TEXT,
    body_text TEXT,
    variables TEXT[],               -- Available merge fields
    is_active BOOLEAN DEFAULT TRUE,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- Audit Log
-- =============================================
CREATE TABLE crm_audit_log (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INTEGER NOT NULL,
    action VARCHAR(20) NOT NULL,    -- create, update, delete
    field_name VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    changed_by VARCHAR(100),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45)
);

-- =============================================
-- Dashboard Widgets (User customization)
-- =============================================
CREATE TABLE crm_dashboard_widgets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    widget_type VARCHAR(50),
    widget_config JSONB,
    position_x INTEGER,
    position_y INTEGER,
    width INTEGER,
    height INTEGER,
    is_visible BOOLEAN DEFAULT TRUE
);

-- =============================================
-- Report Definitions (Saved reports)
-- =============================================
CREATE TABLE crm_saved_reports (
    id SERIAL PRIMARY KEY,
    report_name VARCHAR(100) NOT NULL,
    report_type VARCHAR(50),
    filters JSONB,
    columns TEXT[],
    group_by TEXT[],
    sort_by VARCHAR(100),
    created_by VARCHAR(100),
    is_shared BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 📡 API Endpoints

### Leads API
```
GET    /api/crm/leads              - List leads (with filters)
GET    /api/crm/leads/:id          - Get lead details
POST   /api/crm/leads              - Create new lead
PUT    /api/crm/leads/:id          - Update lead
DELETE /api/crm/leads/:id          - Delete lead (soft)
POST   /api/crm/leads/:id/convert  - Convert lead to customer/opportunity
GET    /api/crm/leads/stats        - Lead statistics
```

### Opportunities API
```
GET    /api/crm/opportunities           - List opportunities
GET    /api/crm/opportunities/:id       - Get opportunity details
POST   /api/crm/opportunities           - Create opportunity
PUT    /api/crm/opportunities/:id       - Update opportunity
DELETE /api/crm/opportunities/:id       - Delete opportunity
PUT    /api/crm/opportunities/:id/stage - Update stage
GET    /api/crm/opportunities/pipeline  - Pipeline view data
GET    /api/crm/opportunities/stats     - Statistics
```

### Quotations API
```
GET    /api/crm/quotations              - List quotations
GET    /api/crm/quotations/:id          - Get quotation details
POST   /api/crm/quotations              - Create quotation
PUT    /api/crm/quotations/:id          - Update quotation
DELETE /api/crm/quotations/:id          - Delete quotation
POST   /api/crm/quotations/:id/send     - Send quotation (email)
POST   /api/crm/quotations/:id/revise   - Create revision
GET    /api/crm/quotations/:id/pdf      - Generate PDF
```

### Samples API
```
GET    /api/crm/samples                 - List samples
GET    /api/crm/samples/:id             - Get sample details
POST   /api/crm/samples                 - Create sample request
PUT    /api/crm/samples/:id             - Update sample
PUT    /api/crm/samples/:id/status      - Update status
POST   /api/crm/samples/:id/feedback    - Record feedback
GET    /api/crm/samples/stats           - Statistics
```

### Activities API
```
GET    /api/crm/activities              - List activities
GET    /api/crm/activities/:id          - Get activity details
POST   /api/crm/activities              - Create activity
PUT    /api/crm/activities/:id          - Update activity
PUT    /api/crm/activities/:id/complete - Mark complete
GET    /api/crm/activities/calendar     - Calendar view
GET    /api/crm/activities/tasks        - Task list
```

### Contacts API
```
GET    /api/crm/contacts                - List contacts
GET    /api/crm/contacts/:id            - Get contact details
POST   /api/crm/contacts                - Create contact
PUT    /api/crm/contacts/:id            - Update contact
DELETE /api/crm/contacts/:id            - Delete contact
```

### Dashboard & Reports API
```
GET    /api/crm/dashboard/overview      - Dashboard KPIs
GET    /api/crm/dashboard/charts        - Chart data
GET    /api/crm/reports/sales           - Sales reports
GET    /api/crm/reports/pipeline        - Pipeline reports
GET    /api/crm/reports/activity        - Activity reports
POST   /api/crm/reports/export          - Export report
```

---

## 📱 Frontend Components Structure

```
src/components/CRM/
├── Dashboard/
│   ├── AdminCRMDashboard.jsx       ✅ DONE
│   ├── CRMDashboard.jsx            ✅ DONE
│   ├── DashboardCharts.jsx
│   └── DashboardWidgets.jsx
│
├── Customers/
│   ├── CustomerList.jsx            ✅ EXISTS
│   ├── CustomerDetail.jsx          ✅ EXISTS
│   ├── CustomerForm.jsx
│   ├── CustomerMap.jsx             ✅ EXISTS
│   └── CustomerSegments.jsx
│
├── Leads/
│   ├── LeadList.jsx
│   ├── LeadDetail.jsx
│   ├── LeadForm.jsx
│   ├── LeadScoring.jsx
│   └── LeadConvert.jsx
│
├── Opportunities/
│   ├── OpportunityList.jsx
│   ├── OpportunityDetail.jsx
│   ├── OpportunityForm.jsx
│   ├── OpportunityKanban.jsx
│   └── PipelineView.jsx
│
├── Quotations/
│   ├── QuotationList.jsx
│   ├── QuotationDetail.jsx
│   ├── QuotationForm.jsx
│   ├── QuotationPDF.jsx
│   └── QuotationTemplates.jsx
│
├── Samples/
│   ├── SampleList.jsx
│   ├── SampleDetail.jsx
│   ├── SampleForm.jsx
│   └── SampleWorkflow.jsx
│
├── Activities/
│   ├── ActivityList.jsx
│   ├── ActivityForm.jsx
│   ├── ActivityCalendar.jsx
│   ├── TaskList.jsx
│   └── ActivityTimeline.jsx
│
├── Contacts/
│   ├── ContactList.jsx
│   ├── ContactDetail.jsx
│   └── ContactForm.jsx
│
├── Reports/
│   ├── SalesReport.jsx
│   ├── PipelineReport.jsx
│   ├── ActivityReport.jsx
│   └── CustomReport.jsx
│
├── Settings/
│   ├── CRMSettings.jsx
│   ├── PipelineStages.jsx
│   ├── LeadSources.jsx
│   └── EmailTemplates.jsx
│
└── common/
    ├── RelatedList.jsx
    ├── ActivityWidget.jsx
    ├── NotesWidget.jsx
    └── AttachmentsWidget.jsx
```

---

## 🚀 Implementation Phases

### Phase 1: Foundation (Week 1-2) ✅ MOSTLY DONE
- [x] Enhanced Dashboard with Charts
- [x] Tabbed Interface (Overview/Analytics/Reports)
- [x] Date Range Selector
- [x] Role-based Dashboard views
- [ ] Create database tables (Contacts, Activities)
- [ ] Basic Contact management

### Phase 2: Lead Management (Week 3-4)
- [ ] Create Leads table
- [ ] Lead list with filters
- [ ] Lead form (create/edit)
- [ ] Lead scoring rules
- [ ] Lead conversion workflow
- [ ] Lead sources configuration

### Phase 3: Opportunity Management (Week 5-6)
- [ ] Create Opportunities table
- [ ] Pipeline stages configuration
- [ ] Opportunity list view
- [ ] Kanban board view
- [ ] Opportunity detail with products
- [ ] Win/Loss tracking

### Phase 4: Quotation Management (Week 7-8)
- [ ] Create Quotations tables
- [ ] Quotation form with line items
- [ ] Quotation PDF generation
- [ ] Email integration
- [ ] Quotation templates
- [ ] Pricing rules

### Phase 5: Sample Management (Week 9-10)
- [ ] Create Samples table
- [ ] Sample request form
- [ ] Sample workflow automation
- [ ] Sample tracking
- [ ] Feedback collection
- [ ] Sample reports

### Phase 6: Activity Management (Week 11-12)
- [ ] Create Activities table
- [ ] Activity forms (Call, Email, Meeting, Task)
- [ ] Calendar view
- [ ] Task management
- [ ] Activity reminders
- [ ] Activity reports

### Phase 7: Reports & Analytics (Week 13-14)
- [ ] Sales reports
- [ ] Pipeline reports
- [ ] Activity reports
- [ ] Custom report builder
- [ ] Export functionality (PDF, Excel)
- [ ] Scheduled reports

### Phase 8: Polish & Integration (Week 15-16)
- [ ] Email integration
- [ ] Document management
- [ ] Mobile optimization
- [ ] Performance optimization
- [ ] User training documentation
- [ ] Go-live preparation

---

## 🔐 Security Considerations

1. **Row-Level Security**
   - Sales reps see only their assigned records
   - Management sees team records
   - Admin sees all records

2. **Field-Level Security**
   - Sensitive fields (pricing, margins) restricted by role

3. **Audit Trail**
   - All changes logged with user, timestamp, old/new values

4. **API Security**
   - JWT authentication
   - Rate limiting
   - Input validation

---

## 📊 Key Metrics & KPIs

### Sales Metrics
- Total Revenue (YTD, MTD, QTD)
- Average Deal Size
- Sales by Product Group
- Sales by Region
- Sales by Sales Rep

### Pipeline Metrics
- Total Pipeline Value
- Pipeline by Stage
- Win Rate
- Conversion Rate
- Average Sales Cycle

### Activity Metrics
- Calls Made
- Emails Sent
- Meetings Conducted
- Tasks Completed
- Response Time

### Customer Metrics
- Total Customers
- New Customers
- Customer Retention
- Customer Lifetime Value
- Net Promoter Score

---

## 📝 Next Steps

1. **Review this plan** with stakeholders
2. **Prioritize features** based on business needs
3. **Create database migration** for Phase 1 tables
4. **Build API endpoints** incrementally
5. **Develop frontend components** with demo data first
6. **Connect to real data** progressively
7. **Test thoroughly** with real users
8. **Deploy** in stages

---

*Document Version: 1.0*
*Last Updated: January 3, 2026*
*Author: CRM Development Team*
