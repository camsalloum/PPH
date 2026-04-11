# UNIFIED DATA SOURCE - COMPREHENSIVE IMPLEMENTATION PLAN

**Document Created:** January 1, 2026  
**Project:** IPDashboard / ProPackHub  
**Status:** ✅ PHASE 1 COMPLETE, PHASE 2 COMPLETE  
**Last Updated:** January 1, 2026

---

## 🎯 KEY PRINCIPLE: DYNAMIC DATA SYSTEM

**IMPORTANT:** This system is **100% DYNAMIC** - nothing is hardcoded!

When you upload new raw data to `fp_data_excel`:
1. New customers → Auto-added to `fp_customer_unified`
2. New sales reps → Auto-added to `fp_sales_rep_unified`
3. New product groups → Auto-added to `fp_product_group_unified`
4. All aggregations → Auto-updated
5. Materialized views → Auto-refreshed

**How to sync after data upload:**
```sql
-- Option 1: SQL
SELECT * FROM sync_unified_data();

-- Option 2: API
POST /api/unified/sync
```

**How to fully rebuild (start fresh):**
```sql
SELECT * FROM rebuild_unified_data();
```

---

## 📋 TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Target Architecture](#3-target-architecture)
4. [Implementation Phases](#4-implementation-phases)
5. [Phase 1: Master Tables Foundation](#5-phase-1-master-tables-foundation)
6. [Phase 2: Aggregation Views](#6-phase-2-aggregation-views)
7. [Phase 3: API Unification](#7-phase-3-api-unification)
8. [Phase 4: Frontend Integration](#8-phase-4-frontend-integration)
9. [Testing Procedures](#9-testing-procedures)
10. [Rollback Plan](#10-rollback-plan)

---

## 1. EXECUTIVE SUMMARY

### The Problem
The current system has **fragmented data sources** causing:
- ❌ Inconsistent customer names across modules
- ❌ Different sales rep groupings in different pages
- ❌ Product groups not unified (18 raw → 13 standard)
- ❌ Merge rules not synced to customer master
- ❌ Dashboard, AEBF, and CRM use different queries
- ❌ Excel files still used in some components

### The Solution
Create a **Single Source of Truth (SSOT)** architecture:
```
┌─────────────────────────────────────────────────────────────────────┐
│                     UNIFIED DATA LAYER                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │ fp_customer     │    │ fp_sales_rep    │    │ fp_product_     │  │
│  │ _unified        │    │ _unified        │    │ group_unified   │  │
│  │ (Master Table)  │    │ (Master Table)  │    │ (Master Table)  │  │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘  │
│           │                      │                      │           │
│           └──────────────────────┼──────────────────────┘           │
│                                  │                                   │
│                    ┌─────────────▼─────────────┐                    │
│                    │ vw_unified_sales_data     │                    │
│                    │ (Aggregation View)        │                    │
│                    └─────────────┬─────────────┘                    │
│                                  │                                   │
│              ┌───────────────────┼───────────────────┐              │
│              │                   │                   │              │
│         ┌────▼────┐         ┌────▼────┐         ┌────▼────┐        │
│         │Dashboard│         │  AEBF   │         │   CRM   │        │
│         └─────────┘         └─────────┘         └─────────┘        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Benefits
✅ One customer = One record (with merge history)  
✅ One sales rep = One group assignment  
✅ One product group = One material/process combo  
✅ Aggregated amounts/kgs/morm pre-computed  
✅ All modules share the same data  
✅ Budget imports auto-link to masters  

---

## 2. CURRENT STATE ANALYSIS

### 2.1 Data Inventory (as of January 1, 2026)

| Table | Records | Purpose | Status |
|-------|---------|---------|--------|
| `fp_data_excel` | 25,722 | Raw sales data (Actual) | ✅ Primary Source |
| `fp_customer_master` | 577 | CRM customer data | ⚠️ Not synced with merges |
| `fp_sales_rep_budget` | 0 | Sales rep budget allocation | 🔄 Cleaned |
| `fp_division_customer_merge_rules` | 0 | Merge rules | 🔄 Cleaned |
| `sales_rep_groups` | 14 | Sales rep grouping | ✅ Complete |
| `sales_rep_group_members` | 51 | Group membership | ✅ 100% coverage |
| `fp_material_percentages` | 13 | Product group materials | ✅ Complete |
| `fp_raw_product_groups` | 18 | PG mapping | ⚠️ 1 unmapped |
| `fp_divisional_budget` | 876 | Division-level budget | ✅ Working |

### 2.2 Entity Counts

| Entity | In Data | Mapped | Gap |
|--------|---------|--------|-----|
| Customers | 563 | 577 (master) | 14 extra in master |
| Sales Reps | 51 | 51 (groups) | ✅ 0 |
| Product Groups | 18 | 17 (mapped) | ⚠️ 1 unmapped |
| Countries | 34 | - | Need master |

### 2.3 Current Data Flow (BROKEN)

```
┌─────────────────────────────────────────────────────────────────────┐
│ CURRENT STATE - FRAGMENTED                                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  fp_data_excel ──┬─────────────────────────────────────→ Dashboard  │
│                  │                                                   │
│                  ├──→ fp_customer_master (NOT SYNCED) ──→ CRM       │
│                  │                                                   │
│                  └──→ fp_sales_rep_budget ──────────────→ AEBF      │
│                                                                      │
│  ⚠️ PROBLEMS:                                                       │
│  • Merge rules in separate table, not applied everywhere            │
│  • Customer names TEXT-matched (case issues)                        │
│  • Sales rep names TEXT-matched (case issues)                       │
│  • Product groups not normalized                                    │
│  • No foreign keys = no referential integrity                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. TARGET ARCHITECTURE

### 3.1 Unified Master Tables

We will create **THREE master dimension tables** that serve as the SSOT:

#### 3.1.1 `fp_customer_unified` (NEW)
```sql
CREATE TABLE fp_customer_unified (
  customer_id SERIAL PRIMARY KEY,
  customer_code VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(500) NOT NULL,
  normalized_name VARCHAR(500) NOT NULL,  -- UPPER, trimmed, for matching
  
  -- Merge status
  is_active BOOLEAN DEFAULT TRUE,
  is_merged BOOLEAN DEFAULT FALSE,
  merged_into_id INTEGER REFERENCES fp_customer_unified(customer_id),
  original_names TEXT[],  -- All names that were merged
  
  -- Sales rep assignment
  primary_sales_rep_id INTEGER REFERENCES fp_sales_rep_unified(sales_rep_id),
  
  -- Geography
  primary_country VARCHAR(100),
  countries TEXT[],
  
  -- Aggregated metrics (computed)
  total_amount_all_time DECIMAL(18,2),
  total_kgs_all_time DECIMAL(18,2),
  total_morm_all_time DECIMAL(18,2),
  first_transaction_date DATE,
  last_transaction_date DATE,
  transaction_years INTEGER[],
  
  -- CRM fields
  customer_type VARCHAR(50),
  industry VARCHAR(100),
  credit_limit DECIMAL(15,2),
  payment_terms VARCHAR(50),
  primary_contact VARCHAR(200),
  email VARCHAR(200),
  phone VARCHAR(50),
  
  -- Map fields
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  pin_confirmed BOOLEAN DEFAULT FALSE,
  
  -- Audit
  division VARCHAR(10) DEFAULT 'FP',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast name matching
CREATE INDEX idx_customer_normalized ON fp_customer_unified(normalized_name);
CREATE INDEX idx_customer_sales_rep ON fp_customer_unified(primary_sales_rep_id);
CREATE INDEX idx_customer_active ON fp_customer_unified(is_active, is_merged);
```

#### 3.1.2 `fp_sales_rep_unified` (NEW)
```sql
CREATE TABLE fp_sales_rep_unified (
  sales_rep_id SERIAL PRIMARY KEY,
  sales_rep_code VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  normalized_name VARCHAR(200) NOT NULL,  -- UPPER, trimmed
  
  -- Grouping
  group_id INTEGER REFERENCES sales_rep_groups(id),
  group_name VARCHAR(200),
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Aggregated metrics (computed)
  total_amount_all_time DECIMAL(18,2),
  total_kgs_all_time DECIMAL(18,2),
  customer_count INTEGER,
  country_count INTEGER,
  
  -- Contact
  email VARCHAR(200),
  phone VARCHAR(50),
  
  -- Audit
  division VARCHAR(10) DEFAULT 'FP',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sales_rep_normalized ON fp_sales_rep_unified(normalized_name);
CREATE INDEX idx_sales_rep_group ON fp_sales_rep_unified(group_id);
```

#### 3.1.3 `fp_product_group_unified` (NEW)
```sql
CREATE TABLE fp_product_group_unified (
  pg_id SERIAL PRIMARY KEY,
  pg_code VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  normalized_name VARCHAR(200) NOT NULL,
  
  -- Material/Process from fp_material_percentages
  material VARCHAR(50),  -- PE, Non PE, Others
  process VARCHAR(50),   -- Plain, Printed, Others
  pg_combined VARCHAR(100),  -- "PE Printed", "Non PE Plain", etc.
  
  -- Raw names that map to this group
  raw_names TEXT[],
  
  -- Pricing (from fp_product_group_pricing)
  default_selling_price DECIMAL(18,4),
  default_morm DECIMAL(18,4),
  
  -- Aggregated metrics
  total_amount_all_time DECIMAL(18,2),
  total_kgs_all_time DECIMAL(18,2),
  
  -- Audit
  division VARCHAR(10) DEFAULT 'FP',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_pg_normalized ON fp_product_group_unified(normalized_name);
CREATE INDEX idx_pg_combined ON fp_product_group_unified(pg_combined);
```

### 3.2 Aggregation View

```sql
CREATE OR REPLACE VIEW vw_unified_sales_data AS
SELECT 
  -- Period
  d.year,
  d.month,
  d.type,
  d.values_type,
  
  -- Customer (resolved)
  c.customer_id,
  c.customer_code,
  c.display_name AS customer_name,
  COALESCE(cm.display_name, c.display_name) AS merged_customer_name,
  COALESCE(cm.customer_id, c.customer_id) AS effective_customer_id,
  c.is_merged,
  
  -- Sales Rep (resolved)
  sr.sales_rep_id,
  sr.display_name AS sales_rep_name,
  sr.group_id AS sales_rep_group_id,
  sr.group_name AS sales_rep_group,
  
  -- Product Group (resolved)
  pg.pg_id,
  pg.display_name AS product_group,
  pg.material,
  pg.process,
  pg.pg_combined,
  
  -- Geography
  d.countryname AS country,
  
  -- Values
  d.values,
  
  -- Source
  d.id AS source_row_id,
  d.sourcesheet

FROM fp_data_excel d

-- Join to Customer
LEFT JOIN fp_customer_unified c 
  ON UPPER(TRIM(d.customername)) = c.normalized_name
  
-- If merged, get parent customer
LEFT JOIN fp_customer_unified cm 
  ON c.merged_into_id = cm.customer_id

-- Join to Sales Rep
LEFT JOIN fp_sales_rep_unified sr 
  ON UPPER(TRIM(d.salesrepname)) = sr.normalized_name

-- Join to Product Group
LEFT JOIN fp_product_group_unified pg 
  ON UPPER(TRIM(d.productgroup)) = pg.normalized_name
  OR UPPER(TRIM(d.productgroup)) = ANY(SELECT UPPER(TRIM(unnest(pg.raw_names))));
```

### 3.3 Pre-Aggregated Summary Tables

For performance, create materialized views with pre-computed aggregations:

```sql
-- Customer summary by period
CREATE MATERIALIZED VIEW mv_customer_period_summary AS
SELECT 
  effective_customer_id,
  merged_customer_name,
  year,
  type,
  SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS total_amount,
  SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS total_kgs,
  SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS total_morm,
  ARRAY_AGG(DISTINCT country) AS countries,
  ARRAY_AGG(DISTINCT product_group) AS product_groups
FROM vw_unified_sales_data
GROUP BY effective_customer_id, merged_customer_name, year, type;

-- Sales Rep summary by period
CREATE MATERIALIZED VIEW mv_sales_rep_period_summary AS
SELECT 
  sales_rep_id,
  sales_rep_name,
  sales_rep_group_id,
  sales_rep_group,
  year,
  type,
  SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS total_amount,
  SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS total_kgs,
  SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS total_morm,
  COUNT(DISTINCT effective_customer_id) AS customer_count,
  ARRAY_AGG(DISTINCT country) AS countries
FROM vw_unified_sales_data
GROUP BY sales_rep_id, sales_rep_name, sales_rep_group_id, sales_rep_group, year, type;

-- Product Group summary by period
CREATE MATERIALIZED VIEW mv_product_group_period_summary AS
SELECT 
  pg_id,
  product_group,
  material,
  process,
  pg_combined,
  year,
  type,
  SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS total_amount,
  SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS total_kgs,
  SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS total_morm
FROM vw_unified_sales_data
GROUP BY pg_id, product_group, material, process, pg_combined, year, type;

-- Country summary by period
CREATE MATERIALIZED VIEW mv_country_period_summary AS
SELECT 
  country,
  year,
  type,
  SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS total_amount,
  SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS total_kgs,
  SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS total_morm,
  COUNT(DISTINCT effective_customer_id) AS customer_count,
  COUNT(DISTINCT sales_rep_id) AS sales_rep_count
FROM vw_unified_sales_data
GROUP BY country, year, type;
```

---

## 4. IMPLEMENTATION PHASES

### Overview

| Phase | Duration | Focus | Dependencies |
|-------|----------|-------|--------------|
| 1 | Week 1 | Master Tables Foundation | None |
| 2 | Week 2 | Aggregation Views & Triggers | Phase 1 |
| 3 | Week 3 | API Unification | Phase 2 |
| 4 | Week 4-5 | Frontend Integration | Phase 3 |
| 5 | Week 6 | Testing & Cleanup | Phase 4 |

---

## 5. PHASE 1: MASTER TABLES FOUNDATION

### 5.1 Step-by-Step Implementation

#### Step 1.1: Create Customer Unified Table

**File:** `migrations/300_create_unified_customer.sql`

```sql
-- Step 1.1.1: Create the table
CREATE TABLE IF NOT EXISTS fp_customer_unified (
  customer_id SERIAL PRIMARY KEY,
  customer_code VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(500) NOT NULL,
  normalized_name VARCHAR(500) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  is_merged BOOLEAN DEFAULT FALSE,
  merged_into_id INTEGER,
  original_names TEXT[],
  primary_sales_rep_id INTEGER,
  primary_country VARCHAR(100),
  countries TEXT[],
  total_amount_all_time DECIMAL(18,2) DEFAULT 0,
  total_kgs_all_time DECIMAL(18,2) DEFAULT 0,
  total_morm_all_time DECIMAL(18,2) DEFAULT 0,
  first_transaction_date DATE,
  last_transaction_date DATE,
  transaction_years INTEGER[],
  customer_type VARCHAR(50),
  industry VARCHAR(100),
  credit_limit DECIMAL(15,2),
  payment_terms VARCHAR(50),
  primary_contact VARCHAR(200),
  email VARCHAR(200),
  phone VARCHAR(50),
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  pin_confirmed BOOLEAN DEFAULT FALSE,
  division VARCHAR(10) DEFAULT 'FP',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Step 1.1.2: Create indexes
CREATE INDEX IF NOT EXISTS idx_cust_unified_norm ON fp_customer_unified(normalized_name);
CREATE INDEX IF NOT EXISTS idx_cust_unified_active ON fp_customer_unified(is_active, is_merged);

-- Step 1.1.3: Populate from fp_data_excel
INSERT INTO fp_customer_unified (
  customer_code,
  display_name,
  normalized_name,
  primary_country,
  countries,
  total_amount_all_time,
  total_kgs_all_time,
  total_morm_all_time,
  first_transaction_date,
  last_transaction_date,
  transaction_years
)
SELECT 
  'FP-CUST-' || LPAD(ROW_NUMBER() OVER (ORDER BY customername)::TEXT, 5, '0'),
  customername,
  UPPER(TRIM(customername)),
  (SELECT countryname FROM fp_data_excel e2 
   WHERE e2.customername = d.customername 
   GROUP BY countryname ORDER BY COUNT(*) DESC LIMIT 1),
  ARRAY_AGG(DISTINCT countryname),
  SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END),
  SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END),
  SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END),
  MIN(MAKE_DATE(year, month, 1)),
  MAX(MAKE_DATE(year, month, 1)),
  ARRAY_AGG(DISTINCT year ORDER BY year)
FROM fp_data_excel d
GROUP BY customername
ON CONFLICT (customer_code) DO NOTHING;

-- Step 1.1.4: Copy CRM data from fp_customer_master
UPDATE fp_customer_unified cu
SET 
  customer_type = cm.customer_type,
  industry = cm.industry,
  credit_limit = cm.credit_limit,
  payment_terms = cm.payment_terms,
  primary_contact = cm.primary_contact,
  email = cm.email,
  phone = cm.phone,
  latitude = cm.latitude,
  longitude = cm.longitude,
  pin_confirmed = cm.pin_confirmed
FROM fp_customer_master cm
WHERE cu.normalized_name = UPPER(TRIM(cm.customer_name));
```

**Testing Step 1.1:**
```sql
-- Verify count
SELECT COUNT(*) FROM fp_customer_unified;  -- Should be ~563

-- Verify no duplicates
SELECT normalized_name, COUNT(*) 
FROM fp_customer_unified 
GROUP BY normalized_name HAVING COUNT(*) > 1;  -- Should be 0 rows

-- Verify aggregations
SELECT customer_code, display_name, total_amount_all_time, countries
FROM fp_customer_unified
ORDER BY total_amount_all_time DESC LIMIT 5;
```

#### Step 1.2: Create Sales Rep Unified Table

**File:** `migrations/301_create_unified_sales_rep.sql`

```sql
-- Step 1.2.1: Create the table
CREATE TABLE IF NOT EXISTS fp_sales_rep_unified (
  sales_rep_id SERIAL PRIMARY KEY,
  sales_rep_code VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  normalized_name VARCHAR(200) NOT NULL,
  group_id INTEGER,
  group_name VARCHAR(200),
  is_active BOOLEAN DEFAULT TRUE,
  total_amount_all_time DECIMAL(18,2) DEFAULT 0,
  total_kgs_all_time DECIMAL(18,2) DEFAULT 0,
  customer_count INTEGER DEFAULT 0,
  country_count INTEGER DEFAULT 0,
  email VARCHAR(200),
  phone VARCHAR(50),
  division VARCHAR(10) DEFAULT 'FP',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Step 1.2.2: Create indexes
CREATE INDEX IF NOT EXISTS idx_sr_unified_norm ON fp_sales_rep_unified(normalized_name);
CREATE INDEX IF NOT EXISTS idx_sr_unified_group ON fp_sales_rep_unified(group_id);

-- Step 1.2.3: Populate from fp_data_excel + sales_rep_group_members
INSERT INTO fp_sales_rep_unified (
  sales_rep_code,
  display_name,
  normalized_name,
  group_id,
  group_name,
  total_amount_all_time,
  total_kgs_all_time,
  customer_count,
  country_count
)
SELECT 
  'FP-SR-' || LPAD(ROW_NUMBER() OVER (ORDER BY d.salesrepname)::TEXT, 3, '0'),
  d.salesrepname,
  UPPER(TRIM(d.salesrepname)),
  srg.id,
  srg.group_name,
  SUM(CASE WHEN d.values_type = 'AMOUNT' THEN d.values ELSE 0 END),
  SUM(CASE WHEN d.values_type = 'KGS' THEN d.values ELSE 0 END),
  COUNT(DISTINCT d.customername),
  COUNT(DISTINCT d.countryname)
FROM fp_data_excel d
LEFT JOIN sales_rep_group_members srgm ON UPPER(TRIM(d.salesrepname)) = UPPER(TRIM(srgm.member_name))
LEFT JOIN sales_rep_groups srg ON srgm.group_id = srg.id
GROUP BY d.salesrepname, srg.id, srg.group_name
ON CONFLICT (sales_rep_code) DO NOTHING;
```

**Testing Step 1.2:**
```sql
-- Verify count
SELECT COUNT(*) FROM fp_sales_rep_unified;  -- Should be 51

-- Verify all have groups
SELECT display_name, group_name 
FROM fp_sales_rep_unified 
WHERE group_id IS NULL;  -- Should be 0 rows

-- Verify aggregations
SELECT sales_rep_code, display_name, group_name, total_amount_all_time
FROM fp_sales_rep_unified
ORDER BY total_amount_all_time DESC LIMIT 10;
```

#### Step 1.3: Create Product Group Unified Table

**File:** `migrations/302_create_unified_product_group.sql`

```sql
-- Step 1.3.1: Create the table
CREATE TABLE IF NOT EXISTS fp_product_group_unified (
  pg_id SERIAL PRIMARY KEY,
  pg_code VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  normalized_name VARCHAR(200) NOT NULL,
  material VARCHAR(50),
  process VARCHAR(50),
  pg_combined VARCHAR(100),
  raw_names TEXT[],
  default_selling_price DECIMAL(18,4),
  default_morm DECIMAL(18,4),
  total_amount_all_time DECIMAL(18,2) DEFAULT 0,
  total_kgs_all_time DECIMAL(18,2) DEFAULT 0,
  division VARCHAR(10) DEFAULT 'FP',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Step 1.3.2: Populate from fp_material_percentages + fp_data_excel
INSERT INTO fp_product_group_unified (
  pg_code,
  display_name,
  normalized_name,
  material,
  process,
  pg_combined,
  raw_names,
  total_amount_all_time,
  total_kgs_all_time
)
SELECT 
  'FP-PG-' || LPAD(ROW_NUMBER() OVER (ORDER BY mp.product_group)::TEXT, 2, '0'),
  mp.product_group,
  UPPER(TRIM(mp.product_group)),
  mp.material,
  mp.process,
  mp.material || ' ' || mp.process,
  ARRAY_AGG(DISTINCT d.productgroup),
  COALESCE(SUM(CASE WHEN d.values_type = 'AMOUNT' THEN d.values ELSE 0 END), 0),
  COALESCE(SUM(CASE WHEN d.values_type = 'KGS' THEN d.values ELSE 0 END), 0)
FROM fp_material_percentages mp
LEFT JOIN fp_data_excel d ON UPPER(TRIM(d.productgroup)) = UPPER(TRIM(mp.product_group))
GROUP BY mp.product_group, mp.material, mp.process
ON CONFLICT (pg_code) DO NOTHING;

-- Add unmapped "Raw Materials" as Others
INSERT INTO fp_product_group_unified (
  pg_code, display_name, normalized_name, material, process, pg_combined, raw_names, is_active
)
VALUES (
  'FP-PG-99', 'Raw Materials', 'RAW MATERIALS', 'Others', 'Others', 'Others Others', 
  ARRAY['Raw Materials', 'raw materials'], TRUE
)
ON CONFLICT (pg_code) DO NOTHING;
```

**Testing Step 1.3:**
```sql
-- Verify count
SELECT COUNT(*) FROM fp_product_group_unified;  -- Should be 13-14

-- Verify all have material/process
SELECT display_name, material, process, pg_combined
FROM fp_product_group_unified;

-- Verify aggregations
SELECT pg_code, display_name, pg_combined, total_amount_all_time
FROM fp_product_group_unified
ORDER BY total_amount_all_time DESC;
```

---

## 6. PHASE 2: AGGREGATION VIEWS

### 6.1 Create Unified Sales View

**File:** `migrations/303_create_unified_views.sql`

```sql
-- Main unified view
CREATE OR REPLACE VIEW vw_unified_sales_data AS
SELECT 
  d.id AS source_row_id,
  d.year,
  d.month,
  d.type,
  d.values_type,
  d.values,
  d.countryname AS country,
  d.sourcesheet,
  
  -- Customer (resolved via normalized name)
  c.customer_id,
  c.customer_code,
  c.display_name AS customer_name,
  c.is_merged,
  CASE 
    WHEN c.is_merged AND cm.customer_id IS NOT NULL THEN cm.customer_id
    ELSE c.customer_id
  END AS effective_customer_id,
  CASE 
    WHEN c.is_merged AND cm.customer_id IS NOT NULL THEN cm.display_name
    ELSE c.display_name
  END AS effective_customer_name,
  
  -- Sales Rep (resolved)
  sr.sales_rep_id,
  sr.sales_rep_code,
  sr.display_name AS sales_rep_name,
  sr.group_id AS sales_rep_group_id,
  sr.group_name AS sales_rep_group,
  
  -- Product Group (resolved)
  pg.pg_id,
  pg.pg_code,
  pg.display_name AS product_group,
  pg.material,
  pg.process,
  pg.pg_combined

FROM fp_data_excel d

LEFT JOIN fp_customer_unified c 
  ON UPPER(TRIM(d.customername)) = c.normalized_name
  
LEFT JOIN fp_customer_unified cm 
  ON c.merged_into_id = cm.customer_id

LEFT JOIN fp_sales_rep_unified sr 
  ON UPPER(TRIM(d.salesrepname)) = sr.normalized_name

LEFT JOIN fp_product_group_unified pg 
  ON UPPER(TRIM(d.productgroup)) = pg.normalized_name;
```

### 6.2 Create Materialized Summaries

```sql
-- Customer period summary (for dashboard)
CREATE MATERIALIZED VIEW mv_customer_summary AS
SELECT 
  effective_customer_id,
  effective_customer_name,
  year,
  type,
  country,
  sales_rep_group,
  SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS amount,
  SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS kgs,
  SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS morm
FROM vw_unified_sales_data
GROUP BY effective_customer_id, effective_customer_name, year, type, country, sales_rep_group;

CREATE INDEX idx_mv_cust_year ON mv_customer_summary(year, type);
CREATE INDEX idx_mv_cust_id ON mv_customer_summary(effective_customer_id);

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_summary;
  -- Add other MVs here
END;
$$ LANGUAGE plpgsql;
```

**Testing Phase 2:**
```sql
-- Test unified view
SELECT COUNT(*) FROM vw_unified_sales_data;  -- Should = fp_data_excel count

-- Test joins working
SELECT 
  COUNT(*) AS total,
  COUNT(customer_id) AS with_customer,
  COUNT(sales_rep_id) AS with_sales_rep,
  COUNT(pg_id) AS with_product_group
FROM vw_unified_sales_data;
-- All should be equal or very close

-- Test aggregation
SELECT effective_customer_name, year, amount, kgs
FROM mv_customer_summary
WHERE year = 2025
ORDER BY amount DESC LIMIT 10;
```

---

## 7. PHASE 3: API UNIFICATION

### 7.1 Create Unified Data Service

**File:** `server/services/UnifiedDataService.js`

```javascript
import { getDivisionPool } from '../database/divisionDatabaseManager.js';
import logger from '../utils/logger.js';

class UnifiedDataService {
  
  /**
   * Get all customers with aggregations
   */
  async getCustomers(division, { year, includeInactive = false } = {}) {
    const pool = getDivisionPool(division);
    
    let query = `
      SELECT 
        c.customer_id,
        c.customer_code,
        c.display_name,
        c.is_merged,
        c.is_active,
        c.primary_country,
        c.countries,
        c.total_amount_all_time,
        c.total_kgs_all_time,
        c.last_transaction_date,
        COALESCE(s.amount, 0) AS year_amount,
        COALESCE(s.kgs, 0) AS year_kgs
      FROM fp_customer_unified c
      LEFT JOIN mv_customer_summary s ON c.customer_id = s.effective_customer_id
    `;
    
    const params = [];
    const conditions = [];
    
    if (!includeInactive) {
      conditions.push('c.is_active = true');
      conditions.push('c.is_merged = false');
    }
    
    if (year) {
      conditions.push(`s.year = $${params.length + 1}`);
      params.push(year);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY c.display_name';
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get sales by customer with period comparison
   */
  async getSalesByCustomer(division, { periods, salesRepGroup } = {}) {
    const pool = getDivisionPool(division);
    
    // Build dynamic columns for each period
    const periodColumns = periods.map((p, i) => `
      SUM(CASE WHEN year = ${p.year} AND type = '${p.type}' 
          THEN CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END 
          ELSE 0 END) AS period_${i}_amount,
      SUM(CASE WHEN year = ${p.year} AND type = '${p.type}' 
          THEN CASE WHEN values_type = 'KGS' THEN values ELSE 0 END 
          ELSE 0 END) AS period_${i}_kgs
    `).join(',\n');
    
    let query = `
      SELECT 
        effective_customer_name AS customer_name,
        sales_rep_group,
        ${periodColumns}
      FROM vw_unified_sales_data
      WHERE 1=1
    `;
    
    if (salesRepGroup) {
      query += ` AND sales_rep_group = '${salesRepGroup}'`;
    }
    
    query += `
      GROUP BY effective_customer_name, sales_rep_group
      ORDER BY effective_customer_name
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  /**
   * Get sales by sales rep
   */
  async getSalesBySalesRep(division, { year, type = 'Actual' } = {}) {
    const pool = getDivisionPool(division);
    
    const query = `
      SELECT 
        sr.sales_rep_code,
        sr.display_name AS sales_rep_name,
        sr.group_name AS sales_rep_group,
        SUM(CASE WHEN v.values_type = 'AMOUNT' THEN v.values ELSE 0 END) AS amount,
        SUM(CASE WHEN v.values_type = 'KGS' THEN v.values ELSE 0 END) AS kgs,
        SUM(CASE WHEN v.values_type = 'MORM' THEN v.values ELSE 0 END) AS morm,
        COUNT(DISTINCT v.effective_customer_id) AS customer_count
      FROM fp_sales_rep_unified sr
      LEFT JOIN vw_unified_sales_data v ON sr.sales_rep_id = v.sales_rep_id
        AND v.year = $1 AND v.type = $2
      WHERE sr.is_active = true
      GROUP BY sr.sales_rep_code, sr.display_name, sr.group_name
      ORDER BY sr.group_name, sr.display_name
    `;
    
    const result = await pool.query(query, [year, type]);
    return result.rows;
  }

  /**
   * Get sales by product group
   */
  async getSalesByProductGroup(division, { year, type = 'Actual' } = {}) {
    const pool = getDivisionPool(division);
    
    const query = `
      SELECT 
        pg.pg_code,
        pg.display_name AS product_group,
        pg.material,
        pg.process,
        pg.pg_combined,
        SUM(CASE WHEN v.values_type = 'AMOUNT' THEN v.values ELSE 0 END) AS amount,
        SUM(CASE WHEN v.values_type = 'KGS' THEN v.values ELSE 0 END) AS kgs,
        SUM(CASE WHEN v.values_type = 'MORM' THEN v.values ELSE 0 END) AS morm
      FROM fp_product_group_unified pg
      LEFT JOIN vw_unified_sales_data v ON pg.pg_id = v.pg_id
        AND v.year = $1 AND v.type = $2
      WHERE pg.is_active = true
      GROUP BY pg.pg_code, pg.display_name, pg.material, pg.process, pg.pg_combined
      ORDER BY pg.display_name
    `;
    
    const result = await pool.query(query, [year, type]);
    return result.rows;
  }

  /**
   * Get sales by country
   */
  async getSalesByCountry(division, { year, type = 'Actual' } = {}) {
    const pool = getDivisionPool(division);
    
    const query = `
      SELECT 
        country,
        SUM(CASE WHEN values_type = 'AMOUNT' THEN values ELSE 0 END) AS amount,
        SUM(CASE WHEN values_type = 'KGS' THEN values ELSE 0 END) AS kgs,
        SUM(CASE WHEN values_type = 'MORM' THEN values ELSE 0 END) AS morm,
        COUNT(DISTINCT effective_customer_id) AS customer_count,
        COUNT(DISTINCT sales_rep_id) AS sales_rep_count
      FROM vw_unified_sales_data
      WHERE year = $1 AND type = $2
      GROUP BY country
      ORDER BY amount DESC
    `;
    
    const result = await pool.query(query, [year, type]);
    return result.rows;
  }

  /**
   * Merge customers
   */
  async mergeCustomers(division, targetCustomerId, sourceCustomerIds, mergedByUser) {
    const pool = getDivisionPool(division);
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Mark source customers as merged
      for (const sourceId of sourceCustomerIds) {
        await client.query(`
          UPDATE fp_customer_unified
          SET 
            is_merged = true,
            merged_into_id = $1,
            updated_at = NOW()
          WHERE customer_id = $2
        `, [targetCustomerId, sourceId]);
        
        // Get original names for target
        const source = await client.query(
          'SELECT display_name FROM fp_customer_unified WHERE customer_id = $1',
          [sourceId]
        );
        
        // Add to target's original_names
        await client.query(`
          UPDATE fp_customer_unified
          SET original_names = ARRAY_APPEND(COALESCE(original_names, ARRAY[]::TEXT[]), $1)
          WHERE customer_id = $2
        `, [source.rows[0].display_name, targetCustomerId]);
      }
      
      // Refresh materialized view
      await client.query('REFRESH MATERIALIZED VIEW mv_customer_summary');
      
      await client.query('COMMIT');
      
      logger.info(`Merged ${sourceCustomerIds.length} customers into ${targetCustomerId}`);
      return { success: true };
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export default new UnifiedDataService();
```

### 7.2 Create Unified API Routes

**File:** `server/routes/unified.js`

```javascript
import express from 'express';
import UnifiedDataService from '../services/UnifiedDataService.js';
import logger from '../utils/logger.js';

const router = express.Router();

// GET /api/unified/customers
router.get('/customers', async (req, res) => {
  try {
    const { division = 'FP', year, includeInactive } = req.query;
    const customers = await UnifiedDataService.getCustomers(division, {
      year: year ? parseInt(year) : undefined,
      includeInactive: includeInactive === 'true'
    });
    res.json({ success: true, data: customers });
  } catch (error) {
    logger.error('Error fetching customers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/unified/sales-by-customer
router.get('/sales-by-customer', async (req, res) => {
  try {
    const { division = 'FP', periods, salesRepGroup } = req.query;
    const sales = await UnifiedDataService.getSalesByCustomer(division, {
      periods: JSON.parse(periods || '[]'),
      salesRepGroup
    });
    res.json({ success: true, data: sales });
  } catch (error) {
    logger.error('Error fetching sales by customer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/unified/sales-by-sales-rep
router.get('/sales-by-sales-rep', async (req, res) => {
  try {
    const { division = 'FP', year, type } = req.query;
    const sales = await UnifiedDataService.getSalesBySalesRep(division, {
      year: parseInt(year),
      type
    });
    res.json({ success: true, data: sales });
  } catch (error) {
    logger.error('Error fetching sales by sales rep:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/unified/sales-by-product-group
router.get('/sales-by-product-group', async (req, res) => {
  try {
    const { division = 'FP', year, type } = req.query;
    const sales = await UnifiedDataService.getSalesByProductGroup(division, {
      year: parseInt(year),
      type
    });
    res.json({ success: true, data: sales });
  } catch (error) {
    logger.error('Error fetching sales by product group:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/unified/sales-by-country
router.get('/sales-by-country', async (req, res) => {
  try {
    const { division = 'FP', year, type } = req.query;
    const sales = await UnifiedDataService.getSalesByCountry(division, {
      year: parseInt(year),
      type
    });
    res.json({ success: true, data: sales });
  } catch (error) {
    logger.error('Error fetching sales by country:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/unified/merge-customers
router.post('/merge-customers', async (req, res) => {
  try {
    const { division = 'FP', targetCustomerId, sourceCustomerIds } = req.body;
    const result = await UnifiedDataService.mergeCustomers(
      division,
      targetCustomerId,
      sourceCustomerIds,
      req.user?.username || 'system'
    );
    res.json(result);
  } catch (error) {
    logger.error('Error merging customers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

---

## 8. PHASE 4: FRONTEND INTEGRATION

### 8.1 Module-by-Module Migration

#### 8.1.1 Dashboard - Sales by Customer

**Current:** Uses `/api/sales-by-customer-ultra-fast` with merge rules applied inline
**New:** Uses `/api/unified/sales-by-customer`

**File:** `src/components/dashboard/SalesByCustomerTableNew.js`

```javascript
// BEFORE
const fetchData = async () => {
  const response = await fetch('/api/sales-by-customer-ultra-fast', {
    method: 'POST',
    body: JSON.stringify({ periods, division })
  });
  // Manual merge rule application...
};

// AFTER
const fetchData = async () => {
  const params = new URLSearchParams({
    division,
    periods: JSON.stringify(periods),
    salesRepGroup: selectedGroup
  });
  const response = await fetch(`/api/unified/sales-by-customer?${params}`);
  const { data } = await response.json();
  // Data already has merged customers resolved!
  setCustomerData(data);
};
```

#### 8.1.2 Dashboard - Sales by Sales Rep

**File:** `src/components/dashboard/SalesBySalesRepDivisional.js`

```javascript
// AFTER
const fetchData = async () => {
  const response = await fetch(
    `/api/unified/sales-by-sales-rep?division=${division}&year=${year}&type=${type}`
  );
  const { data } = await response.json();
  // Data already has groups resolved!
  setSalesRepData(data);
};
```

#### 8.1.3 CRM - Customer List

**File:** `src/components/crm/CustomerList.jsx`

```javascript
// AFTER
const fetchCustomers = async () => {
  const response = await fetch(
    `/api/unified/customers?division=${division}&year=${currentYear}&includeInactive=${showInactive}`
  );
  const { data } = await response.json();
  setCustomers(data);
};
```

#### 8.1.4 AEBF - Budget Tab

The budget system needs to use unified customer IDs when saving:

**File:** `src/components/MasterData/AEBF/BudgetTab.jsx`

```javascript
// When importing budget, validate against unified customers
const validateBudgetImport = async (budgetData) => {
  const response = await fetch('/api/unified/customers?division=FP');
  const { data: validCustomers } = await response.json();
  
  const customerMap = new Map(
    validCustomers.map(c => [c.display_name.toUpperCase(), c.customer_id])
  );
  
  const invalidCustomers = [];
  for (const row of budgetData) {
    const customerId = customerMap.get(row.customerName.toUpperCase());
    if (!customerId) {
      invalidCustomers.push(row.customerName);
    } else {
      row.customer_id = customerId;  // Link to unified customer
    }
  }
  
  return { invalidCustomers };
};
```

---

## 9. TESTING PROCEDURES

### 9.1 Database Testing

Run after each migration step:

```bash
# Create test script
node scripts/test-unified-data.js
```

**File:** `scripts/test-unified-data.js`

```javascript
const { Pool } = require('pg');
const pool = new Pool({ 
  host: 'localhost', 
  port: 5432, 
  database: 'fp_database', 
  user: 'postgres', 
  password: '654883' 
});

async function test() {
  console.log('\n=== UNIFIED DATA TESTS ===\n');
  
  // Test 1: Customer count matches
  const custCount = await pool.query(`
    SELECT 
      (SELECT COUNT(DISTINCT customername) FROM fp_data_excel) as excel_count,
      (SELECT COUNT(*) FROM fp_customer_unified WHERE is_merged = false) as unified_count
  `);
  const c = custCount.rows[0];
  console.log(`✅ Customer Count: Excel=${c.excel_count}, Unified=${c.unified_count}`);
  
  // Test 2: Sales rep count matches
  const srCount = await pool.query(`
    SELECT 
      (SELECT COUNT(DISTINCT salesrepname) FROM fp_data_excel) as excel_count,
      (SELECT COUNT(*) FROM fp_sales_rep_unified) as unified_count
  `);
  const sr = srCount.rows[0];
  console.log(`✅ Sales Rep Count: Excel=${sr.excel_count}, Unified=${sr.unified_count}`);
  
  // Test 3: Total amounts match
  const amounts = await pool.query(`
    SELECT 
      (SELECT SUM(values) FROM fp_data_excel WHERE values_type = 'AMOUNT') as excel_sum,
      (SELECT SUM(values) FROM vw_unified_sales_data WHERE values_type = 'AMOUNT') as view_sum
  `);
  const a = amounts.rows[0];
  const amountMatch = Math.abs(a.excel_sum - a.view_sum) < 1;
  console.log(`${amountMatch ? '✅' : '❌'} Amount Sum: Excel=${a.excel_sum}, View=${a.view_sum}`);
  
  // Test 4: All customers have valid join
  const orphans = await pool.query(`
    SELECT COUNT(*) as count
    FROM vw_unified_sales_data
    WHERE customer_id IS NULL
  `);
  const noOrphans = orphans.rows[0].count === '0';
  console.log(`${noOrphans ? '✅' : '❌'} Orphan Customers: ${orphans.rows[0].count}`);
  
  // Test 5: All sales reps have groups
  const noGroup = await pool.query(`
    SELECT COUNT(*) as count
    FROM fp_sales_rep_unified
    WHERE group_id IS NULL
  `);
  const allGrouped = noGroup.rows[0].count === '0';
  console.log(`${allGrouped ? '✅' : '❌'} Sales Reps without Group: ${noGroup.rows[0].count}`);
  
  await pool.end();
}

test().catch(console.error);
```

### 9.2 Module Testing Checklist

#### Dashboard Tests
| Test | Page | Steps | Expected Result |
|------|------|-------|-----------------|
| T-D1 | Sales by Customer | 1. Open Dashboard 2. Select FP 3. Generate data | Customers display with correct amounts |
| T-D2 | Sales by Sales Rep | 1. Open Sales Rep card 2. Check group totals | Groups show correct aggregations |
| T-D3 | Sales by Country | 1. Open Country card 2. Verify totals | All 34 countries with correct amounts |
| T-D4 | Sales by Product Group | 1. Open PG card 2. Check material/process | All 13 PGs with material/process columns |
| T-D5 | Merged Customers | 1. Merge 2 customers 2. Refresh dashboard | Merged customer shows combined total |

#### AEBF Tests
| Test | Page | Steps | Expected Result |
|------|------|-------|-----------------|
| T-A1 | Budget Import | 1. Import HTML budget 2. Check customers | All customers link to unified IDs |
| T-A2 | Budget View | 1. View budget by customer 2. Check names | Merged customers show single row |
| T-A3 | Delete Budget | 1. Delete budget 2. Verify cleanup | No orphan budget records |

#### CRM Tests
| Test | Page | Steps | Expected Result |
|------|------|-------|-----------------|
| T-C1 | Customer List | 1. Open CRM 2. List customers | 563 active customers displayed |
| T-C2 | Customer Map | 1. Open map view 2. Check pins | All customers with coords show pins |
| T-C3 | My Customers | 1. Login as sales rep 2. View my customers | Only assigned customers shown |
| T-C4 | Customer Merge | 1. Merge customers 2. Check CRM list | Merged customer disappears from list |

#### Customer Merging Tests
| Test | Page | Steps | Expected Result |
|------|------|-------|-----------------|
| T-M1 | AI Suggestions | 1. Generate suggestions 2. Approve one | Customer merged in unified table |
| T-M2 | Manual Merge | 1. Create manual rule 2. Verify | Both tables updated |
| T-M3 | Undo Merge | 1. Delete merge rule 2. Check customer | is_merged reset to false |

---

## 10. ROLLBACK PLAN

If issues arise, rollback steps for each phase:

### Phase 1 Rollback
```sql
-- Remove unified tables (data backed up in original tables)
DROP TABLE IF EXISTS fp_customer_unified CASCADE;
DROP TABLE IF EXISTS fp_sales_rep_unified CASCADE;
DROP TABLE IF EXISTS fp_product_group_unified CASCADE;
```

### Phase 2 Rollback
```sql
-- Remove views
DROP VIEW IF EXISTS vw_unified_sales_data CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_customer_summary CASCADE;
```

### Phase 3 Rollback
```bash
# Revert API routes in server/index.js
# Comment out: app.use('/api/unified', unifiedRoutes);
```

### Phase 4 Rollback
```bash
# Revert frontend changes via git
git checkout src/components/dashboard/*.js
git checkout src/components/crm/*.jsx
```

---

## 📋 QUICK REFERENCE: FILE LOCATIONS

| Component | File | Purpose |
|-----------|------|---------|
| Migration 300 | `migrations/300_create_unified_customer.sql` | Customer master |
| Migration 301 | `migrations/301_create_unified_sales_rep.sql` | Sales rep master |
| Migration 302 | `migrations/302_create_unified_product_group.sql` | Product group master |
| Migration 303 | `migrations/303_create_unified_views.sql` | Views & MVs |
| Service | `server/services/UnifiedDataService.js` | Business logic |
| Routes | `server/routes/unified.js` | API endpoints |
| Test Script | `scripts/test-unified-data.js` | Validation |

---

## ✅ NEXT STEPS

1. **Review this plan** - Confirm the architecture meets your needs
2. **Start Phase 1** - Run migration 300 first, test, then proceed
3. **Test each step** - Run test script after each migration
4. **Update frontend gradually** - One component at a time

**Ready to begin Phase 1?** Let me know and I'll create the migration files!
