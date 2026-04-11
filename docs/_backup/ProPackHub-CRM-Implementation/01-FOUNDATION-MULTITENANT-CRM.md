# ProPackHub - Flexible Packaging SaaS Platform
## Complete CRM Implementation Master Plan

**Document Version:** 1.0  
**Date:** December 28, 2025  
**Platform:** ProPackHub (SaaS Multi-Tenant)  
**First Customer:** Interplast - FP Division (Flexible Packaging)

---

## TABLE OF CONTENTS

1. [Platform Overview](#1-platform-overview)
2. [Architecture - Multi-Tenant SaaS](#2-architecture---multi-tenant-saas)
3. [Current State Analysis](#3-current-state-analysis)
4. [Implementation Priority Matrix](#4-implementation-priority-matrix)
5. [Phase 1: Foundation & Multi-Tenancy](#phase-1-foundation--multi-tenancy-weeks-1-4)
6. [Phase 2: CRM Core Modules](#phase-2-crm-core-modules-weeks-5-10)
7. [Phase 3: Sample & QC Workflow](#phase-3-sample--qc-workflow-weeks-11-16)
8. [Phase 4: Costing & Quotation Engine](#phase-4-costing--quotation-engine-weeks-17-22)
9. [Phase 5: Production Integration](#phase-5-production-integration-weeks-23-28)
10. [Phase 6: Analytics & AI](#phase-6-analytics--ai-weeks-29-32)
11. [Database Schema - Complete](#database-schema---complete)
12. [API Specifications](#api-specifications)
13. [Deployment Strategy](#deployment-strategy)

---

## 1. PLATFORM OVERVIEW

### What is ProPackHub?

**ProPackHub** is a cloud-based SaaS platform specifically designed for the **flexible packaging industry**. It provides end-to-end business management from customer inquiry to product delivery, with specialized modules for:

- Customer Relationship Management (CRM)
- Sample Development & QC Analysis
- Cost Estimation & Quotation
- Technical Data Sheet (TDS) Generation
- Production Planning & Execution
- Quality Control & Compliance

### Target Market

| Segment | Description |
|---------|-------------|
| **Primary** | Flexible packaging manufacturers (pouches, roll stock, labels, bags) |
| **Secondary** | Converters, laminators, printing companies |
| **Tertiary** | Packaging material suppliers, ink manufacturers |

### Business Model

```
┌─────────────────────────────────────────────────────────────┐
│                    ProPackHub SaaS                          │
├─────────────────────────────────────────────────────────────┤
│  Subscription Tiers:                                        │
│  ├── Starter    : Up to 5 users, 1 business unit           │
│  ├── Professional: Up to 25 users, 3 business units        │
│  ├── Enterprise : Unlimited users, unlimited BUs           │
│  └── Custom     : On-premise + Cloud hybrid                │
├─────────────────────────────────────────────────────────────┤
│  Per-Module Pricing (Add-ons):                              │
│  ├── Advanced Analytics & AI                                │
│  ├── Multi-Currency & Multi-Language                        │
│  ├── API Access for Integration                             │
│  └── White-Label Branding                                   │
└─────────────────────────────────────────────────────────────┘
```

### Current Development Status

| Component | Status | Notes |
|-----------|--------|-------|
| Authentication & Users | ✅ Complete | JWT, roles, sessions |
| Dashboard Framework | ✅ Complete | React + Vite |
| Product Groups (pgcombine) | ✅ Complete | FP division data |
| Sales Data Analytics | ✅ Complete | Multi-dimensional |
| Budget Management | ✅ Complete | Sales rep budgets |
| AI Learning Engine | ✅ Complete | Predictions, patterns |
| Customer Master | 🔶 Partial | Analytics only, no CRM |
| CRM Module | ❌ Not Started | THIS PLAN |
| Sample Management | ❌ Not Started | THIS PLAN |
| Quotation Engine | ❌ Not Started | THIS PLAN |
| TDS Generator | ❌ Not Started | THIS PLAN |
| Production Module | ❌ Not Started | Future |

---

## 2. ARCHITECTURE - MULTI-TENANT SAAS

### Multi-Tenancy Model

ProPackHub uses a **Schema-per-Tenant** approach for data isolation with shared application infrastructure:

```
┌─────────────────────────────────────────────────────────────────┐
│                    ProPackHub Application                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Shared Application Layer                     │   │
│  │  React Frontend │ Express Backend │ Common Services       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Tenant Resolution Middleware                 │   │
│  │  (subdomain: interplast.propackhub.com → tenant_id)      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌─────────────┬─────────────┬─────────────┬────────────────┐   │
│  │  Interplast │  Company B  │  Company C  │   Company N    │   │
│  │   Schema    │   Schema    │   Schema    │    Schema      │   │
│  │             │             │             │                │   │
│  │ - customers │ - customers │ - customers │  - customers   │   │
│  │ - samples   │ - samples   │ - samples   │  - samples     │   │
│  │ - quotes    │ - quotes    │ - quotes    │  - quotes      │   │
│  │ - products  │ - products  │ - products  │  - products    │   │
│  └─────────────┴─────────────┴─────────────┴────────────────┘   │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Shared/System Schema                         │   │
│  │  - tenants, subscriptions, billing, system_config        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Login Flow

```
User visits: https://propackhub.com
                    │
                    ▼
        ┌───────────────────┐
        │   Landing Page    │
        │  "Select Company" │
        └─────────┬─────────┘
                  │
    ┌─────────────┼─────────────┐
    ▼             ▼             ▼
┌─────────┐ ┌─────────┐ ┌─────────────┐
│Interplast│ │Company B│ │ New Signup  │
└────┬────┘ └────┬────┘ └──────┬──────┘
     │           │              │
     ▼           ▼              ▼
┌─────────────────────┐   ┌───────────────┐
│interplast.propackhub│   │ Trial Signup  │
│       .com          │   │ Create Tenant │
└──────────┬──────────┘   └───────────────┘
           │
           ▼
    ┌─────────────┐
    │  Login Page │
    │ Email/Pass  │
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │  Dashboard  │
    │ (Tenant DB) │
    └─────────────┘
```

### Tech Stack (Updated for SaaS)

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React 18, Vite, Ant Design | SPA Dashboard |
| **Backend** | Node.js, Express 5 | REST API |
| **Database** | PostgreSQL 15+ | Multi-schema tenancy |
| **Cache** | Redis | Session, tenant cache |
| **Auth** | JWT + Refresh Tokens | Stateless auth |
| **Files** | S3/Azure Blob | Tenant-isolated storage |
| **Search** | PostgreSQL FTS / Elasticsearch | Full-text search |
| **Realtime** | Socket.io | Notifications |
| **Queue** | Bull/Redis | Background jobs |

---

## 3. CURRENT STATE ANALYSIS

### Existing Assets to Leverage

Based on the current codebase analysis, ProPackHub already has:

#### ✅ Product Groups (pgcombine) - READY
```javascript
// Already defined in: server/database/ProductGroupDataService.js
// Product groups available: Pouches, Roll Stock, Labels, Bags, etc.
// With: Material types, Process categories, KGS, Sales, MoRM metrics
```

**Recommendation:** Use existing product groups as the foundation for:
- TDS templates (one per product group)
- Cost estimation formulas (per product group)
- Sample specifications (per product group)

#### ✅ Customer Analytics - READY
```sql
-- Already exists in: ai_learning_tables.sql
fp_customer_behavior_history
fp_customer_segments
fp_customer_churn_predictions
fp_customer_lifetime_value
```

**Recommendation:** Extend with CRM operational tables while keeping analytics.

#### ✅ Sales Rep Structure - READY
```javascript
// Sales reps, territories, hierarchies already defined
// Budget management per sales rep exists
```

**Recommendation:** Link CRM customers/opportunities to sales reps.

#### ❌ Missing CRM Components
- Lead/Prospect management
- Sample request workflow
- Quotation system
- QC analysis module
- TDS generation
- Production order handoff

---

## 4. IMPLEMENTATION PRIORITY MATRIX

### Priority Assessment for Flexible Packaging CRM

| Priority | Module | Business Value | Technical Dependency | Recommended Order |
|----------|--------|----------------|---------------------|-------------------|
| 🔴 P0 | Multi-Tenant Foundation | Critical | None | Week 1-2 |
| 🔴 P0 | Customer Master (CRM) | Critical | Multi-Tenant | Week 3-4 |
| 🔴 P0 | Product Catalog + TDS | Critical | Product Groups exist | Week 5-6 |
| 🟠 P1 | Lead/Inquiry Management | High | Customer Master | Week 7-8 |
| 🟠 P1 | Sample Request System | High | Product Catalog | Week 9-10 |
| 🟠 P1 | QC Analysis Module | High | Sample System | Week 11-13 |
| 🟠 P1 | Cost Estimation Engine | High | Product Catalog, QC | Week 14-16 |
| 🟡 P2 | Quotation Generator | High | Cost Estimation | Week 17-19 |
| 🟡 P2 | Negotiation & Approval | Medium | Quotation | Week 20-21 |
| 🟢 P3 | Production Order | Medium | Quotation Approved | Week 22-24 |
| 🟢 P3 | Customer Portal | Nice-to-have | All CRM | Week 25-27 |
| 🟢 P3 | Advanced Analytics | Nice-to-have | All Modules | Week 28-32 |

### Your Decision Point: Where to Start?

Based on your question about **"product groups already defined in pgcombine, shall I proceed and make TDS for each, the costing or estimation part, or shall I start from the basic CRM and reach"**:

#### **RECOMMENDED APPROACH: Hybrid Path**

```
START HERE (Foundation already exists)
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│ PHASE 1: Multi-Tenant + Customer Master (Weeks 1-4)       │
│ Why: CRM needs customers first. Multi-tenant for SaaS.    │
└───────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│ PHASE 2: Product Catalog + TDS Templates (Weeks 5-6)      │
│ Why: You have pgcombine. Extend to full product specs     │
│      and create TDS templates per product group.          │
│ LEVERAGE: Existing product groups become product catalog  │
└───────────────────────────────────────────────────────────┘
        │
        ├──────────────────────────────────────┐
        ▼                                      ▼
┌─────────────────────────┐    ┌─────────────────────────────┐
│ PHASE 3A: Sample/QC     │    │ PHASE 3B: Cost Estimation   │
│ (Weeks 7-13)            │    │ (Weeks 14-16)               │
│ For new customer flow   │    │ For pricing capability      │
└─────────────────────────┘    └─────────────────────────────┘
        │                                      │
        └──────────────────┬───────────────────┘
                           ▼
┌───────────────────────────────────────────────────────────┐
│ PHASE 4: Quotation System (Weeks 17-22)                   │
│ Combines: Product + Specs + Costing → Quote               │
└───────────────────────────────────────────────────────────┘
```

---

## PHASE 1: FOUNDATION & MULTI-TENANCY (Weeks 1-4)

### Week 1-2: Multi-Tenant Infrastructure

#### 1.1 Tenant Management Schema

```sql
-- System schema (shared across all tenants)
CREATE SCHEMA IF NOT EXISTS system;

-- Tenants table
CREATE TABLE system.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_code VARCHAR(50) UNIQUE NOT NULL,  -- 'interplast', 'company-b'
  company_name VARCHAR(255) NOT NULL,
  subdomain VARCHAR(100) UNIQUE NOT NULL,   -- 'interplast' for interplast.propackhub.com
  
  -- Subscription
  subscription_tier VARCHAR(50) DEFAULT 'starter',  -- starter, professional, enterprise
  subscription_status VARCHAR(20) DEFAULT 'trial',  -- trial, active, suspended, cancelled
  trial_ends_at TIMESTAMP,
  subscription_ends_at TIMESTAMP,
  
  -- Limits
  max_users INT DEFAULT 5,
  max_business_units INT DEFAULT 1,
  
  -- Settings
  timezone VARCHAR(50) DEFAULT 'UTC',
  currency_code VARCHAR(3) DEFAULT 'USD',
  date_format VARCHAR(20) DEFAULT 'YYYY-MM-DD',
  
  -- Branding (for white-label)
  logo_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#1890ff',
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

-- Tenant admins (can manage tenant settings)
CREATE TABLE system.tenant_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES system.tenants(id),
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  is_super_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Interplast as first tenant
INSERT INTO system.tenants (tenant_code, company_name, subdomain, subscription_tier, subscription_status)
VALUES ('interplast', 'Interplast Industries', 'interplast', 'enterprise', 'active');
```

#### 1.2 Tenant Middleware

```javascript
// server/middleware/tenantResolver.js
const { pool } = require('../database/config');

const tenantCache = new Map();  // Use Redis in production

async function resolveTenant(req, res, next) {
  try {
    // Extract subdomain from host
    const host = req.get('host');
    let subdomain = 'interplast';  // Default for development
    
    if (host.includes('.propackhub.com')) {
      subdomain = host.split('.')[0];
    } else if (req.headers['x-tenant-id']) {
      subdomain = req.headers['x-tenant-id'];
    }
    
    // Check cache
    if (tenantCache.has(subdomain)) {
      req.tenant = tenantCache.get(subdomain);
      return next();
    }
    
    // Query tenant
    const result = await pool.query(
      'SELECT * FROM system.tenants WHERE subdomain = $1 AND is_active = true',
      [subdomain]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    const tenant = result.rows[0];
    tenantCache.set(subdomain, tenant);
    req.tenant = tenant;
    
    // Set schema search path for this request
    await pool.query(`SET search_path TO tenant_${tenant.tenant_code}, public`);
    
    next();
  } catch (error) {
    console.error('Tenant resolution error:', error);
    res.status(500).json({ error: 'Tenant resolution failed' });
  }
}

module.exports = tenantResolver;
```

### Week 3-4: Customer Master (CRM Foundation)

#### 1.3 Customer Tables

```sql
-- Within tenant schema (e.g., tenant_interplast)
CREATE SCHEMA IF NOT EXISTS tenant_interplast;
SET search_path TO tenant_interplast;

-- Customer Master
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code VARCHAR(50) UNIQUE NOT NULL,  -- Auto-generated: CUST-2025-0001
  
  -- Company Information
  company_name VARCHAR(255) NOT NULL,
  trade_name VARCHAR(255),  -- DBA name if different
  industry VARCHAR(100),    -- Food & Beverage, Pharmaceuticals, etc.
  
  -- Customer Type & Status
  customer_type VARCHAR(50) DEFAULT 'prospect',  -- prospect, active, inactive, blocked
  account_type VARCHAR(50) DEFAULT 'direct',     -- direct, distributor, agent
  
  -- Assignment
  sales_rep_id UUID,  -- FK to users
  sales_rep_name VARCHAR(255),  -- Denormalized for performance
  territory VARCHAR(100),
  
  -- Financial
  credit_limit DECIMAL(18,2) DEFAULT 0,
  payment_terms VARCHAR(50),  -- Net 30, Net 60, etc.
  currency_code VARCHAR(3) DEFAULT 'USD',
  tax_id VARCHAR(50),
  
  -- Classification
  customer_rating VARCHAR(10),  -- A, B, C, D
  annual_potential DECIMAL(18,2),
  
  -- Source
  lead_source VARCHAR(100),  -- Website, Referral, Trade Show, etc.
  
  -- Metadata
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  
  -- Search optimization
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(company_name, '') || ' ' || coalesce(trade_name, '') || ' ' || coalesce(customer_code, ''))
  ) STORED
);

CREATE INDEX idx_customers_search ON customers USING GIN(search_vector);
CREATE INDEX idx_customers_sales_rep ON customers(sales_rep_id);
CREATE INDEX idx_customers_type ON customers(customer_type);

-- Customer Contacts
CREATE TABLE customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Contact Info
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  full_name VARCHAR(255) GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  job_title VARCHAR(100),
  department VARCHAR(100),
  
  -- Communication
  email VARCHAR(255),
  phone VARCHAR(50),
  mobile VARCHAR(50),
  whatsapp VARCHAR(50),
  
  -- Role Flags
  is_primary BOOLEAN DEFAULT false,
  can_approve_samples BOOLEAN DEFAULT false,
  can_approve_quotes BOOLEAN DEFAULT false,
  can_place_orders BOOLEAN DEFAULT false,
  receives_invoices BOOLEAN DEFAULT false,
  
  -- Preferences
  preferred_language VARCHAR(10) DEFAULT 'en',
  communication_preference VARCHAR(20) DEFAULT 'email',  -- email, phone, whatsapp
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

-- Customer Addresses
CREATE TABLE customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  
  address_type VARCHAR(20) NOT NULL,  -- billing, shipping, plant
  address_name VARCHAR(100),  -- "Main Office", "Dubai Warehouse"
  
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100),
  postal_code VARCHAR(20),
  country_code VARCHAR(3) NOT NULL,
  country_name VARCHAR(100),
  
  -- Coordinates (for delivery routing)
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  is_default BOOLEAN DEFAULT false,
  delivery_instructions TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer Interactions (Activity Log)
CREATE TABLE customer_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES customer_contacts(id),
  
  interaction_type VARCHAR(50) NOT NULL,  -- call, email, meeting, visit, note
  interaction_date TIMESTAMP NOT NULL,
  subject VARCHAR(255),
  description TEXT,
  outcome VARCHAR(100),  -- positive, neutral, negative, follow_up_required
  
  -- Follow-up
  next_action VARCHAR(255),
  next_action_date DATE,
  
  -- Attachments
  attachments JSONB DEFAULT '[]',
  
  -- Metadata
  created_by UUID,
  created_by_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_interactions_customer ON customer_interactions(customer_id);
CREATE INDEX idx_interactions_date ON customer_interactions(interaction_date DESC);
```

---

## PHASE 2: CRM CORE MODULES (Weeks 5-10)

### Week 5-6: Product Catalog & TDS Templates

#### 2.1 Product Catalog (Extends pgcombine)

```sql
-- Product Groups (master data - extends existing pgcombine)
CREATE TABLE product_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_code VARCHAR(50) UNIQUE NOT NULL,  -- From pgcombine: 'POUCH', 'ROLLSTOCK', etc.
  group_name VARCHAR(255) NOT NULL,
  
  -- Classification
  category VARCHAR(100),  -- Flexible Packaging, Labels, etc.
  subcategory VARCHAR(100),
  
  -- Default specifications
  default_structure JSONB,  -- Default layer configuration
  common_applications TEXT[],  -- ['Food', 'Pharma', 'Industrial']
  
  -- Pricing defaults
  default_markup_pct DECIMAL(5,2) DEFAULT 20.00,
  
  -- TDS Template reference
  tds_template_id UUID,
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed from existing pgcombine data
INSERT INTO product_groups (group_code, group_name, category, common_applications)
SELECT DISTINCT 
  UPPER(REPLACE(productgroup, ' ', '_')) as group_code,
  productgroup as group_name,
  'Flexible Packaging' as category,
  CASE 
    WHEN productgroup ILIKE '%pouch%' THEN ARRAY['Food', 'Beverages', 'Pet Food']
    WHEN productgroup ILIKE '%roll%' THEN ARRAY['VFFS', 'HFFS', 'Flow Wrap']
    WHEN productgroup ILIKE '%bag%' THEN ARRAY['Industrial', 'Agriculture', 'Retail']
    WHEN productgroup ILIKE '%label%' THEN ARRAY['Beverages', 'Personal Care', 'Food']
    ELSE ARRAY['General']
  END as common_applications
FROM fp_data_excel 
WHERE productgroup IS NOT NULL 
GROUP BY productgroup;

-- Products (specific customer products)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code VARCHAR(50) UNIQUE NOT NULL,  -- PRD-2025-0001
  product_name VARCHAR(255) NOT NULL,
  
  -- Classification
  product_group_id UUID REFERENCES product_groups(id),
  customer_id UUID REFERENCES customers(id),  -- NULL for generic products
  
  -- Structure Definition
  structure_type VARCHAR(50),  -- Duplex, Triplex, 3-Layer, 5-Layer, etc.
  total_thickness_micron DECIMAL(8,2),
  structure_definition JSONB,  -- Detailed layer-by-layer structure
  
  -- Dimensions
  width_mm DECIMAL(10,2),
  length_mm DECIMAL(10,2),
  gusset_mm DECIMAL(10,2),
  
  -- Printing
  printing_type VARCHAR(50),  -- Flexo, Gravure, Digital
  printing_colors INT,
  pantone_codes TEXT[],
  
  -- Features
  features JSONB,  -- {zipper: true, spout: false, tear_notch: true, ...}
  
  -- Certifications
  certifications TEXT[],  -- ['FDA', 'EU 10/2011', 'Halal', 'Kosher']
  
  -- Costing (summary)
  base_cost_per_kg DECIMAL(10,4),
  base_cost_per_unit DECIMAL(10,4),
  
  -- Metadata
  is_template BOOLEAN DEFAULT false,  -- Generic product for quoting
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product Structure Layers
CREATE TABLE product_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  
  layer_number INT NOT NULL,  -- 1 = outermost, n = innermost
  layer_function VARCHAR(50),  -- Print, Barrier, Seal, Tie, etc.
  
  -- Material
  material_code VARCHAR(50),
  material_name VARCHAR(100),
  material_type VARCHAR(50),  -- PET, BOPP, PE, PA, EVOH, etc.
  
  -- Specifications
  thickness_micron DECIMAL(8,2),
  gsm DECIMAL(8,2),  -- Grams per square meter
  
  -- Treatment
  surface_treatment VARCHAR(50),  -- Corona, Chemical, Metallized
  
  UNIQUE(product_id, layer_number)
);
```

#### 2.2 Technical Data Sheet (TDS) Generator

```sql
-- TDS Templates (one per product group)
CREATE TABLE tds_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_group_id UUID REFERENCES product_groups(id),
  template_name VARCHAR(255) NOT NULL,
  template_version INT DEFAULT 1,
  
  -- Template structure
  sections JSONB NOT NULL,  -- Defines sections and fields
  
  -- Example sections structure:
  -- {
  --   "sections": [
  --     {"id": "structure", "title": "Structure Details", "fields": [...]},
  --     {"id": "printing", "title": "Printing Specifications", "fields": [...]},
  --     {"id": "physical", "title": "Physical Properties", "fields": [...]},
  --     {"id": "barrier", "title": "Barrier Properties", "fields": [...]},
  --     {"id": "machine", "title": "Machine Settings", "fields": [...]}
  --   ]
  -- }
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TDS Documents (generated for specific products/orders)
CREATE TABLE tds_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tds_number VARCHAR(50) UNIQUE NOT NULL,  -- TDS-2025-0001
  
  -- References
  product_id UUID REFERENCES products(id),
  order_id UUID,  -- Will reference sales_orders later
  
  -- Content
  structure_details JSONB,  -- Layer-by-layer details
  printing_specs JSONB,     -- Colors, registration, plate specs
  physical_properties JSONB, -- Thickness, tensile, elongation
  barrier_properties JSONB,  -- OTR, WVTR, etc.
  machine_settings JSONB,    -- Recommended machine parameters
  qc_checkpoints JSONB,      -- Required quality checks
  
  -- Calculations (auto-filled)
  total_gsm DECIMAL(10,2),
  estimated_yield_per_kg DECIMAL(10,2),
  
  -- Approval
  status VARCHAR(20) DEFAULT 'draft',  -- draft, pending_approval, approved
  approved_by UUID,
  approved_at TIMESTAMP,
  
  -- PDF
  pdf_url TEXT,
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Week 7-8: Lead/Inquiry Management

```sql
-- Leads (Pre-customer inquiries)
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_number VARCHAR(50) UNIQUE NOT NULL,  -- LEAD-2025-0001
  
  -- Company Info
  company_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  website VARCHAR(255),
  
  -- Location
  city VARCHAR(100),
  country_code VARCHAR(3),
  country_name VARCHAR(100),
  
  -- Industry & Size
  industry VARCHAR(100),
  company_size VARCHAR(50),  -- 1-10, 11-50, 51-200, 201-500, 500+
  annual_packaging_spend DECIMAL(18,2),
  
  -- Lead Details
  lead_source VARCHAR(100),  -- Website, Trade Show, Referral, Cold Call
  lead_source_detail TEXT,   -- Which trade show, who referred, etc.
  
  -- Interest
  product_interest TEXT[],   -- Product groups interested in
  inquiry_description TEXT,
  required_quantity VARCHAR(100),
  required_by_date DATE,
  
  -- Status & Pipeline
  status VARCHAR(50) DEFAULT 'new',  
  -- new, contacted, qualified, sample_requested, quotation_sent, negotiating, won, lost
  
  -- Scoring
  lead_score INT DEFAULT 50,  -- 0-100
  score_factors JSONB,
  
  -- Assignment
  assigned_to UUID,
  assigned_to_name VARCHAR(255),
  
  -- Conversion
  converted_to_customer_id UUID REFERENCES customers(id),
  converted_at TIMESTAMP,
  lost_reason VARCHAR(255),
  
  -- Metadata
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_assigned ON leads(assigned_to);

-- Inquiries (Specific product inquiries - can come from leads or existing customers)
CREATE TABLE inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_number VARCHAR(50) UNIQUE NOT NULL,  -- INQ-2025-0001
  
  -- Source
  lead_id UUID REFERENCES leads(id),
  customer_id UUID REFERENCES customers(id),
  -- Either lead_id OR customer_id should be set
  
  -- Product Requirements
  product_group_id UUID REFERENCES product_groups(id),
  product_description TEXT NOT NULL,
  
  -- Specifications
  structure_requirement TEXT,  -- Customer's description of structure
  dimensions_text VARCHAR(255),  -- e.g., "200mm x 300mm + 50mm gusset"
  printing_requirement TEXT,
  special_requirements TEXT,
  
  -- Quantity & Timeline
  quantity_per_month DECIMAL(18,2),
  quantity_unit VARCHAR(20),  -- KG, PCS, ROLLS
  required_by DATE,
  contract_duration_months INT,
  
  -- Status
  status VARCHAR(50) DEFAULT 'new',
  -- new, under_review, feasible, sample_requested, quoted, negotiating, won, lost
  
  -- Feasibility Assessment
  is_feasible BOOLEAN,
  feasibility_notes TEXT,
  feasibility_checked_by UUID,
  feasibility_checked_at TIMESTAMP,
  
  -- Attachments (customer specs, samples, etc.)
  attachments JSONB DEFAULT '[]',
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Week 9-10: Sample Request System

```sql
-- Sample Requests
CREATE TABLE sample_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_number VARCHAR(50) UNIQUE NOT NULL,  -- SMPL-2025-0001
  
  -- Source
  inquiry_id UUID REFERENCES inquiries(id),
  customer_id UUID REFERENCES customers(id),
  
  -- Product Definition
  product_group_id UUID REFERENCES product_groups(id),
  product_name VARCHAR(255),
  
  -- Structure
  structure_type VARCHAR(50),
  structure_details JSONB,  -- Layer definitions
  total_thickness_micron DECIMAL(8,2),
  
  -- Dimensions
  width_mm DECIMAL(10,2),
  length_mm DECIMAL(10,2),
  gusset_mm DECIMAL(10,2),
  
  -- Printing
  printing_type VARCHAR(50),
  number_of_colors INT,
  artwork_status VARCHAR(50),  -- pending, received, approved
  artwork_files JSONB DEFAULT '[]',
  
  -- Features
  features JSONB,
  special_requirements TEXT,
  
  -- Sample Quantity
  sample_quantity INT NOT NULL,
  sample_unit VARCHAR(20) DEFAULT 'PCS',
  
  -- Status & Workflow
  status VARCHAR(50) DEFAULT 'draft',
  -- draft, pending_approval, approved, in_production, qc_testing, completed, delivered, customer_approved, customer_rejected
  
  -- Internal Approval (before production)
  internal_approval_status VARCHAR(50),
  internal_approved_by UUID,
  internal_approved_at TIMESTAMP,
  internal_approval_notes TEXT,
  
  -- Production
  production_status VARCHAR(50),
  production_started_at TIMESTAMP,
  production_completed_at TIMESTAMP,
  production_notes TEXT,
  
  -- QC Assignment
  qc_assigned_to UUID,
  qc_assigned_to_name VARCHAR(255),
  
  -- Customer Feedback
  customer_feedback_status VARCHAR(50),  -- pending, approved, conditional, rejected
  customer_feedback_date TIMESTAMP,
  customer_feedback_notes TEXT,
  customer_requested_changes TEXT,
  
  -- Costs
  estimated_cost DECIMAL(18,2),
  actual_cost DECIMAL(18,2),
  
  -- Timeline
  requested_date DATE,
  promised_date DATE,
  delivered_date DATE,
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sample Specifications (QC parameters)
CREATE TABLE sample_specifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id UUID REFERENCES sample_requests(id) ON DELETE CASCADE,
  
  parameter_category VARCHAR(100),  -- Physical, Barrier, Print, Seal
  parameter_name VARCHAR(100) NOT NULL,
  
  target_value VARCHAR(100),
  min_value DECIMAL(18,4),
  max_value DECIMAL(18,4),
  unit VARCHAR(50),
  test_method VARCHAR(100),  -- ASTM D882, ISO 527, etc.
  
  is_critical BOOLEAN DEFAULT false,
  
  UNIQUE(sample_id, parameter_name)
);
```

---

## PHASE 3: SAMPLE & QC WORKFLOW (Weeks 11-16)

*Continued in PROPACKHUB_CRM_MASTER_PLAN_PART2.md*

---

## Quick Reference: Module Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│                    MODULE DEPENDENCY GRAPH                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Multi-Tenant ──────┬──────────────────────────────────────────▶│
│       │             │                                            │
│       ▼             ▼                                            │
│  Customers ◀───── Users/Auth                                     │
│       │                                                          │
│       ├─────────────────────────┐                               │
│       ▼                         ▼                                │
│     Leads ──────────────▶ Inquiries                             │
│                               │                                  │
│  Product Groups ◀─────────────┤                                 │
│  (pgcombine) ▲                │                                 │
│       │      │                ▼                                  │
│       │      └────────── Samples ──────────▶ QC Analysis        │
│       │                       │                     │           │
│       ▼                       │                     ▼           │
│  TDS Templates               │            Recommendations       │
│       │                       │                     │           │
│       │                       ▼                     │           │
│       └─────────────▶ Cost Estimation ◀─────────────┘           │
│                            │                                     │
│                            ▼                                     │
│                       Quotations                                 │
│                            │                                     │
│                            ▼                                     │
│                   Negotiations/Approvals                         │
│                            │                                     │
│                            ▼                                     │
│                    Production Orders                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Next Steps

1. **Review this document** and confirm the priority order
2. **Start Phase 1** - Multi-tenant infrastructure
3. **See Part 2** for detailed QC, Costing, and Quotation modules

---

*Document continues in Part 2...*
