# COMPREHENSIVE DATA SYSTEM AUDIT

**Created:** January 2, 2026  
**Last Updated:** February 5, 2026  
**Project:** IPDashboard / ProPackHub  
**Purpose:** Complete audit of all data grouping/mapping/merging systems

---

## 📊 EXECUTIVE SUMMARY

This audit documents **ALL** data transformation, mapping, and grouping systems in the IPD 10-12 project. The system has a complex data architecture with multiple layers of grouping applied before data reaches dashboards.

### Key Findings:
- ✅ **Unified Tables System** (NEW) - Migrations 300-307 created unified tables as SSOT
- ⚠️ **Dashboard endpoints still use legacy queries** - Not yet fully migrated to unified tables
- ⚠️ **Multiple data sources** - Some modules still query directly from `fp_data_excel`
- ✅ **Dynamic sync functions exist** - `sync_unified_data()` auto-updates unified tables
- ✅ **Oracle sync fixed** (Feb 5, 2026) - Fixed pg_combine column reference in sync function

---

## 1. PRODUCT GROUP SYSTEM

### 1.1 Core Tables

| Table | Location | Records | Purpose |
|-------|----------|---------|---------|
| `fp_raw_product_groups` | fp_database | 18 | Maps raw PG names → PGCombine (columns: raw_product_group, pg_combine, is_unmapped) |
| `fp_material_percentages` | fp_database | 13 | Defines 13 standard PGCombine groups with Material/Process |
| `crm_product_groups` | fp_database | 13 | CRM-focused product group view |
| `fp_item_group_overrides` | fp_database | ~varies | Override mappings for specific item descriptions |
| `fp_product_group_unified` | fp_database | ~18 | NEW: Unified product group master |
| `fp_raw_oracle` | fp_database | varies | Oracle ERP data with productgroup column |
| `fp_actualcommon` | fp_database | varies | Synced actual data with pgcombine column |

**IMPORTANT:** Oracle sync function uses `fp_raw_product_groups.pg_combine` (not product_group) to map raw product names to standard groups. Fixed Feb 5, 2026.

### 1.2 Product Group Mapping Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ RAW DATA: fp_data_excel.productgroup (e.g., "Shrink Film", "Laminates")     │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Check fp_item_group_overrides (itemgroupdescription → pg_combine)   │
│         - If match found, use override pg_combine                           │
│         - If no match, continue to Step 2                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Lookup fp_raw_product_groups (raw_product_group → pg_combine)       │
│         - Matches by LOWER(TRIM(productgroup)) = LOWER(TRIM(raw_product_group))
│         - is_unmapped = false required for inclusion                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Get Material/Process from fp_material_percentages                   │
│         - pg_combine → material (PE, Non PE, Others)                        │
│         - pg_combine → process (Plain, Printed, Others)                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ DISPLAY: 13 Standard Product Groups (PGCombine)                             │
│  1. Commercial Items Plain      (PE Plain)                                  │
│  2. Commercial Items Printed    (PE Printed)                                │
│  3. Industrial Items Plain      (PE Plain)                                  │
│  4. Industrial Items Printed    (PE Printed)                                │
│  5. Laminates                   (Non PE Printed)                            │
│  6. Mono Layer Printed          (Non PE Printed)                            │
│  7. Services Charges            (Others Others)                             │
│  8. Shrink Film Plain           (PE Plain)                                  │
│  9. Shrink Film Printed         (PE Printed)                                │
│ 10. Shrink Sleeves              (Non PE Printed)                            │
│ 11. Wide Film                   (PE Plain)                                  │
│ 12. Wrap Around Label           (Non PE Printed)                            │
│ 13. Others                      (Others Others)                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Key Service Files

| File | Purpose |
|------|---------|
| [server/services/productGroupService.js](../server/services/productGroupService.js) | Central product group resolution service |
| [server/services/DataFilteringHelper.js](../server/services/DataFilteringHelper.js) | SQL builder for PG filtering |
| [server/database/ProductGroupDataService.js](../server/database/ProductGroupDataService.js) | Product group data queries |
| [server/database/ProductPerformanceService.js](../server/database/ProductPerformanceService.js) | Product performance metrics |

### 1.4 SQL Pattern Used Throughout

```sql
-- Standard pattern for product group resolution (used in ~20+ locations)
SELECT COALESCE(igo.pg_combine, rpg.pg_combine) as product_group
FROM fp_data_excel d
INNER JOIN fp_raw_product_groups rpg 
  ON LOWER(TRIM(d.productgroup)) = LOWER(TRIM(rpg.raw_product_group))
  AND (rpg.is_unmapped IS NULL OR rpg.is_unmapped = FALSE)
LEFT JOIN fp_item_group_overrides igo 
  ON LOWER(TRIM(d.itemgroupdescription)) = LOWER(TRIM(igo.item_group_description))
WHERE COALESCE(igo.pg_combine, rpg.pg_combine) IS NOT NULL
  AND LOWER(TRIM(COALESCE(igo.pg_combine, rpg.pg_combine))) NOT IN ('raw materials', 'not in pg', 'services charges')
```

### 1.5 Hardcoded Exclusions

**Location:** `server/services/DataFilteringHelper.js` Line 81

```javascript
const filterCondition = `${pgCombineExpr} IS NOT NULL AND LOWER(TRIM(${pgCombineExpr})) NOT IN ('raw materials', 'not in pg', 'services charges')`;
```

**Location:** `server/utils/divisionalHtmlExport.js` Lines 179-220

- "Services Charges" has special handling (Amount = MoRM)
- Displayed separately from other product groups

---

## 2. CUSTOMER MERGING SYSTEM

### 2.1 Core Tables

| Table | Location | Records | Purpose |
|-------|----------|---------|---------|
| `fp_division_customer_merge_rules` | fp_database | ~76 | Customer merge rules with JSONB arrays |
| `fp_customer_master` | fp_database | 577 | Customer master data |
| `fp_customer_unified` | fp_database | ~563 | NEW: Unified customer SSOT |

### 2.2 Customer Merge Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ RAW DATA: fp_data_excel.customername (e.g., "Al Manhal Water Factory Co.")  │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Lookup fp_division_customer_merge_rules                             │
│         - Check if customername IN original_customers (JSONB array)         │
│         - If found, use merged_customer_name                                │
│         - If not found, use original customername                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ DISPLAY: Merged customer name with asterisk (*) suffix if merged            │
│          Example: "Al Manhal Water Factory*"                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Merge Rule Table Structure

```sql
CREATE TABLE fp_division_customer_merge_rules (
  id SERIAL PRIMARY KEY,
  division VARCHAR(20),
  merged_customer_name VARCHAR(500),    -- Canonical display name
  original_customers JSONB,              -- Array of variations
  rule_source VARCHAR(50),               -- 'AI_SUGGESTED' or 'MANUAL'
  confidence_score DECIMAL(3,2),
  status VARCHAR(20),                    -- 'ACTIVE', 'PENDING', 'REJECTED'
  is_active BOOLEAN DEFAULT TRUE,
  master_customer_code VARCHAR(50)       -- Link to fp_customer_master
);
```

### 2.4 Key Service Files

| File | Purpose |
|------|---------|
| [server/routes/divisionMergeRules.js](../server/routes/divisionMergeRules.js) | Full merge rules CRUD API (~2748 lines) |
| [server/services/CustomerMergingAI.js](../server/services/CustomerMergingAI.js) | AI-powered merge suggestions |
| [server/services/CustomerMasterService.js](../server/services/CustomerMasterService.js) | Customer master management |
| [server/database/CustomerMergeRulesService.js](../server/database/CustomerMergeRulesService.js) | Merge rules database operations |

### 2.5 Unified Customer Table (NEW)

```sql
-- Migration 300: fp_customer_unified
CREATE TABLE fp_customer_unified (
  customer_id SERIAL PRIMARY KEY,
  customer_code VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(500) NOT NULL,
  normalized_name VARCHAR(500) NOT NULL,  -- UPPER, trimmed for matching
  
  is_merged BOOLEAN DEFAULT FALSE,
  merged_into_id INTEGER REFERENCES fp_customer_unified(customer_id),
  original_names TEXT[],                   -- All merged names
  
  primary_sales_rep_name VARCHAR(200),
  primary_country VARCHAR(100),
  total_amount_all_time DECIMAL(18,2),
  -- ... more fields
);
```

---

## 3. SALES REP GROUPING SYSTEM

### 3.1 Core Tables

| Table | Location | Records | Purpose |
|-------|----------|---------|---------|
| `sales_rep_groups` | fp_database | 14 | Group definitions |
| `sales_rep_group_members` | fp_database | 51 | Member assignments |
| `fp_sales_rep_unified` | fp_database | 51 | NEW: Unified sales rep SSOT |

### 3.2 Sales Rep Group Structure

```sql
-- sales_rep_groups
CREATE TABLE sales_rep_groups (
  id SERIAL PRIMARY KEY,
  group_name VARCHAR(200) NOT NULL,
  division VARCHAR(10),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- sales_rep_group_members
CREATE TABLE sales_rep_group_members (
  id SERIAL PRIMARY KEY,
  group_id INTEGER REFERENCES sales_rep_groups(id),
  member_name VARCHAR(200) NOT NULL,
  sales_rep_id INTEGER
);
```

### 3.3 Current Group Definitions

| Group Name | Members |
|------------|---------|
| Sojy & Hisham & Direct Sales | Sojy Jose Ukken, Mohammed Hisham, Tinu Sam, Direct Sales, Direct Sales F&B, Harwal Company Limited, (Blank) |
| Sofiane & Team | Sofiane Salah, Mouhcine Fellah, Olivier Baharian |
| Riad & Nidal | Riad Al Zier, Nidal Hanan |
| Narek Koroukian | Narek Koroukian, Salil Punnilath |
| James & Rania | James Kassab, James Kassab(Rania), Rania, Rania Sleem |
| Others | 25+ inactive/historical sales reps |

### 3.4 Sales Rep Resolution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ RAW DATA: fp_data_excel.salesrepname (e.g., "Mohammed Hisham")              │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Lookup sales_rep_group_members                                      │
│         - Match UPPER(TRIM(salesrepname)) = UPPER(TRIM(member_name))        │
│         - Get group_id                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Lookup sales_rep_groups                                             │
│         - Get group_name for display                                        │
│         - If ungrouped, use original salesrepname                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ DISPLAY: Group name or individual name                                      │
│          Example: "Sojy & Hisham & Direct Sales"                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.5 Key Service Files

| File | Purpose |
|------|---------|
| [server/routes/database.js](../server/routes/database.js#L660-L765) | Sales rep groups CRUD API |
| [server/services/salesRepGroupsService.js](../server/services/salesRepGroupsService.js) | Groups service |
| [server/services/DataFilteringHelper.js](../server/services/DataFilteringHelper.js#L147-L170) | SQL builder for SR filtering |

---

## 4. COUNTRY SYSTEM

### 4.1 Core Tables

| Table | Location | Purpose |
|-------|----------|---------|
| `master_countries` | ip_auth_database | Country reference with codes, currencies, regions |
| `country_aliases` | ip_auth_database | Country name variations |

### 4.2 Country Table Structure

```sql
-- master_countries (from migration 005)
CREATE TABLE master_countries (
  id SERIAL PRIMARY KEY,
  country_name VARCHAR(100) NOT NULL UNIQUE,
  country_code_2 VARCHAR(2),           -- ISO 2-letter
  country_code_3 VARCHAR(3),           -- ISO 3-letter
  region VARCHAR(100),                 -- GCC, MENA, etc.
  currency_code VARCHAR(10),
  currency_name VARCHAR(100),
  currency_symbol VARCHAR(10),
  display_order INTEGER,
  is_active BOOLEAN DEFAULT TRUE
);

-- country_aliases (for name variations)
CREATE TABLE country_aliases (
  id SERIAL PRIMARY KEY,
  country_id INTEGER REFERENCES master_countries(id),
  alias_name VARCHAR(100) NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE
);
```

### 4.3 Key Service Files

| File | Purpose |
|------|---------|
| [server/routes/countries.js](../server/routes/countries.js) | Countries CRUD API |
| [server/database/WorldCountriesService.js](../server/database/WorldCountriesService.js) | Country data service |

### 4.4 Hardcoded Country Mappings

**Location:** `src/contexts/CurrencyContext.jsx` Lines 117-186

```javascript
// Fallback currency mapping (hardcoded for better unicode support)
const currencyMapping = {
  'UAE': { code: 'AED', symbol: 'د.إ' },
  'Saudi Arabia': { code: 'SAR', symbol: 'ر.س' },
  'Oman': { code: 'OMR', symbol: 'ر.ع.' },
  // ... more countries
};
```

---

## 5. DASHBOARD COMPONENTS

### 5.1 Component List

| Component | Location | Data Source |
|-----------|----------|-------------|
| Dashboard.jsx | Main container | Routes to sub-dashboards |
| DivisionalDashboardLanding.jsx | Divisional KPIs | Multiple API endpoints |
| KPIExecutiveSummary.jsx | Executive KPIs | AEBF API, P&L API |
| SalesVolumeDetail.jsx | Sales volume charts | Sales data API |
| MarginAnalysisDetail.jsx | Margin analysis | P&L API |
| ProductGroupDetail.jsx | Product groups table | `/api/fp/*` endpoints |
| SalesRepDetail.jsx | Sales by reps | `/api/sales-rep-complete-data` |
| SalesCustomerDetail.jsx | Sales by customers | `/api/database/*` endpoints |
| SalesCountryDetail.jsx | Sales by country | `/api/database/sales-by-country-db` |
| AILearningDashboard.jsx | AI learning status | `/api/ai-learning/*` |

### 5.2 Data Flow for Divisional Dashboard

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ User selects: Division = "FP", Period = "2025 FY Actual"                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ FilterContext.jsx provides column configuration                             │
│ - Years: 2020-2030 (HARDCODED in FilterContext.jsx:111)                    │
│ - Periods: FY, HY1, HY2, Q1-Q4, Months (HARDCODED)                         │
│ - Types: Actual, Estimate, Budget, Forecast (HARDCODED)                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ SalesBySalesRepDivisional.jsx / SalesByCustomerTableNew.jsx                │
│ - Calls API endpoints with division, year, months, type                    │
│ - Applies PG resolution (via service queries)                              │
│ - Applies customer merging (via service queries)                           │
│ - Applies sales rep grouping (via service queries)                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. API ENDPOINTS

### 6.1 Key Data Endpoints

| Endpoint | File | Purpose | Tables Used |
|----------|------|---------|-------------|
| `POST /api/sales-rep-complete-data` | salesData.js:164 | Complete sales rep data | fp_data_excel, sales_rep_groups, fp_raw_product_groups |
| `POST /api/database/sales-by-country-db` | database.js:99 | Sales by country | fp_data_excel, fp_raw_product_groups |
| `POST /api/database/sales-by-customer-ultra-fast` | database.js:560 | Fast customer sales | fp_data_excel, merge_rules |
| `GET /api/sales-rep-groups-universal` | database.js:650 | All sales rep groups | sales_rep_groups, sales_rep_group_members |
| `GET /api/fp/product-groups` | fp.js | Product groups list | fp_raw_product_groups, fp_material_percentages |
| `GET /api/customer-master/:division/customers` | customerMaster.js | Customer master | fp_customer_master |

### 6.2 Unified API Endpoints (NEW)

| Endpoint | File | Purpose | Tables Used |
|----------|------|---------|-------------|
| `POST /api/unified/sync` | unified.js:20 | Sync all unified tables | All unified tables |
| `POST /api/unified/rebuild` | unified.js:50 | Full rebuild | All unified tables |
| `POST /api/unified/sync-merges` | unified.js:72 | Sync customer merges | fp_customer_unified |
| `POST /api/unified/sync-sales-rep-groups` | unified.js:97 | Sync SR groups | fp_sales_rep_unified |
| `GET /api/unified/customers` | unified.js:201 | Unified customers | fp_customer_unified |
| `GET /api/unified/sales-reps` | unified.js:306 | Unified sales reps | fp_sales_rep_unified |
| `GET /api/unified/product-groups` | unified.js:402 | Unified PGs | fp_product_group_unified |
| `GET /api/unified/sales` | unified.js:500 | Unified sales data | vw_unified_sales_data |

---

## 7. UNIFIED TABLE ARCHITECTURE (NEW)

### 7.1 Migration Files

| Migration | Purpose | Status |
|-----------|---------|--------|
| 300_create_unified_customer.sql | fp_customer_unified | ✅ Applied |
| 301_create_unified_sales_rep.sql | fp_sales_rep_unified | ✅ Applied |
| 302_create_unified_product_group.sql | fp_product_group_unified | ✅ Applied |
| 303_create_unified_views.sql | Aggregation views | ✅ Applied |
| 304_create_sync_functions.sql | Sync functions | ✅ Applied |
| 305_complete_dynamic_sync.sql | Dynamic sync | ✅ Applied |
| 306_dynamic_division_currency.sql | Division/currency support | ✅ Applied |
| 307_customer_sales_rep_fk.sql | Customer-SR relationships | ✅ Applied |

### 7.2 Key Sync Functions

```sql
-- Main sync function (call after data upload)
SELECT * FROM sync_unified_data();

-- Individual sync functions
SELECT * FROM sync_customers_to_unified();
SELECT * FROM sync_sales_reps_to_unified();
SELECT * FROM sync_product_groups_to_unified();
SELECT * FROM sync_customer_merges_to_unified();
SELECT * FROM sync_sales_rep_groups_to_unified();

-- Full rebuild (drops and recreates)
SELECT * FROM rebuild_unified_data();
```

### 7.3 Target Architecture (SSOT)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RAW DATA LAYER                                       │
│  fp_data_excel (25,722 rows) - Primary sales data source                    │
│  fp_sales_rep_budget (0 rows) - Budget allocations                          │
│  fp_divisional_budget (876 rows) - Division-level budget                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ sync_unified_data()
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       UNIFIED MASTER TABLES                                  │
├───────────────────────┬───────────────────────┬─────────────────────────────┤
│  fp_customer_unified  │  fp_sales_rep_unified │  fp_product_group_unified   │
│  - customer_id        │  - sales_rep_id       │  - pg_id                    │
│  - display_name       │  - display_name       │  - display_name             │
│  - is_merged          │  - group_id           │  - pg_combined              │
│  - primary_sales_rep  │  - group_name         │  - material                 │
│  - total_amount       │  - total_amount       │  - process                  │
└───────────────────────┴───────────────────────┴─────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       AGGREGATION VIEWS                                      │
│  vw_unified_sales_data - Pre-computed sales with resolved entities          │
│  mv_product_group_period_summary - Materialized view for fast queries       │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         API LAYER                                            │
│  /api/unified/* endpoints - Single source of truth                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌───────────────────────┬───────────────────────┬─────────────────────────────┤
│      Dashboard        │        AEBF           │         CRM                 │
│   (All components)    │   (Budget module)     │   (Customer module)         │
└───────────────────────┴───────────────────────┴─────────────────────────────┘
```

---

## 8. HARDCODED VALUES AUDIT

### 8.1 FilterContext.jsx

| Line | Type | Value | Recommendation |
|------|------|-------|----------------|
| 111 | Years | 2020-2030 | Move to company_settings |
| 114 | Periods | FY, HY1, HY2, Q1-Q4, Months | OK (standard) |
| 119 | Types | Actual, Estimate, Budget, Forecast | OK (standard) |

### 8.2 DataFilteringHelper.js

| Line | Type | Value | Recommendation |
|------|------|-------|----------------|
| 81 | PG Exclusions | 'raw materials', 'not in pg', 'services charges' | Move to fp_raw_product_groups.is_excluded |

### 8.3 CurrencyContext.jsx

| Line | Type | Value | Recommendation |
|------|------|-------|----------------|
| 117-186 | Currency Symbols | Hardcoded mapping | Merge with master_countries |
| 330-350 | Country List | Hardcoded fallback | Use master_countries as primary |

### 8.4 divisionalHtmlExport.js

| Line | Type | Value | Recommendation |
|------|------|-------|----------------|
| 190 | Services Charges | Special handling | Move to product group config |

---

## 9. CURRENT VS TARGET STATE

### 9.1 Current State (January 2026)

| Module | Data Source | Uses Unified Tables? |
|--------|-------------|---------------------|
| Divisional Dashboard | UniversalSalesByCountryService | ❌ No (queries fp_data_excel directly) |
| Sales by Customer | database.js endpoints | ❌ No (queries fp_data_excel + merge rules) |
| Sales by Sales Rep | salesData.js endpoints | ❌ No (queries fp_data_excel + groups) |
| Sales by Country | UniversalSalesByCountryService | ❌ No (queries fp_data_excel) |
| Product Groups | ProductGroupDataService | ❌ No (queries fp_raw_product_groups) |
| AEBF Budget | aebf/*.js routes | ❌ No (queries budget tables directly) |
| CRM | crm/*.js routes | ⚠️ Partial (uses fp_customer_master) |
| AI Learning | *LearningService.js | ❌ No (queries fp_data_excel) |

### 9.2 Target State

| Module | Data Source | Notes |
|--------|-------------|-------|
| All Dashboards | /api/unified/sales | Pre-computed, already merged |
| Customer Data | /api/unified/customers | Single source |
| Sales Rep Data | /api/unified/sales-reps | Already grouped |
| Product Groups | /api/unified/product-groups | Already resolved |
| AEBF Budget | Continue using budget tables | Budget is separate |

---

## 10. MIGRATION ROADMAP

### Phase 1: ✅ COMPLETE - Unified Tables Created
- Created fp_customer_unified, fp_sales_rep_unified, fp_product_group_unified
- Created sync functions and triggers
- Data auto-syncs on upload

### Phase 2: 🔄 IN PROGRESS - API Migration
- [ ] Update UniversalSalesByCountryService to use unified tables
- [ ] Update database.js endpoints to use unified tables
- [ ] Update salesData.js endpoints to use unified tables

### Phase 3: ⏳ PENDING - Frontend Migration
- [ ] Update dashboard components to use /api/unified/* endpoints
- [ ] Remove hardcoded values from FilterContext
- [ ] Use master_countries for all country data

### Phase 4: ⏳ PENDING - Cleanup
- [ ] Remove legacy queries
- [ ] Update documentation
- [ ] Add data validation

---

## 11. QUICK REFERENCE

### Sync After Data Upload
```bash
# Option 1: API
POST /api/unified/sync

# Option 2: SQL
SELECT * FROM sync_unified_data();
```

### Check Unified Table Status
```sql
SELECT 
  (SELECT COUNT(*) FROM fp_customer_unified) AS customers,
  (SELECT COUNT(*) FROM fp_sales_rep_unified) AS sales_reps,
  (SELECT COUNT(*) FROM fp_product_group_unified) AS product_groups;
```

### Key SQL Patterns
```sql
-- Product Group Resolution
SELECT COALESCE(igo.pg_combine, rpg.pg_combine) as product_group
FROM fp_data_excel d
INNER JOIN fp_raw_product_groups rpg ON LOWER(d.productgroup) = LOWER(rpg.raw_product_group)
LEFT JOIN fp_item_group_overrides igo ON LOWER(d.itemgroupdescription) = LOWER(igo.item_group_description)

-- Customer Merge Resolution
SELECT COALESCE(mr.merged_customer_name, d.customername) as customer
FROM fp_data_excel d
LEFT JOIN fp_division_customer_merge_rules mr 
  ON mr.is_active = true AND d.customername = ANY(mr.original_customers)

-- Sales Rep Group Resolution
SELECT COALESCE(srg.group_name, d.salesrepname) as sales_rep
FROM fp_data_excel d
LEFT JOIN sales_rep_group_members srgm ON UPPER(d.salesrepname) = UPPER(srgm.member_name)
LEFT JOIN sales_rep_groups srg ON srgm.group_id = srg.id
```

---

**Document Generated:** January 2, 2026  
**Total Files Analyzed:** ~150+  
**Key Tables Documented:** 15+  
**API Endpoints Documented:** 25+
