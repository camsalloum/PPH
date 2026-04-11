# UNIFIED DATA RELINKING PLAN

## 📋 OVERVIEW

This document describes the migration of query sources from raw tables to unified views/tables.

### Architecture Reminder
```
RAW TABLES (Write only by processors)
├── fp_data_excel           ← Excel uploads (actual sales)
├── fp_sales_rep_budget     ← Budget uploads
└── Processed by divisionMergeRules.js
            ↓
UNIFIED TABLES/VIEWS (Read only by application)
├── fp_customer_unified     ← 565 customers
├── fp_budget_customer_unified ← 91 budget customers
├── fp_sales_rep_unified    ← 51 sales reps
├── fp_product_group_unified ← Product groups
└── vw_unified_sales_complete ← Master view with ALL data
```

### ⚠️ DO NOT TOUCH
- `server/routes/divisionMergeRules.js` - This is the PROCESSOR
- `server/services/Enhencemnts/CustomerMergingAI-*.js` - AI merge processors

---

## 📊 RELINKING TASKS

### TASK 1: ProductPerformanceService.js
**File:** `server/database/ProductPerformanceService.js`  
**Purpose:** Product performance data for KPI dashboard  
**Status:** 🔲 Pending

**Current (manual joins):**
```sql
FROM fp_data_excel d
INNER JOIN fp_raw_product_groups rpg ON LOWER(TRIM(d.productgroup)) = LOWER(TRIM(rpg.raw_product_group))
LEFT JOIN fp_item_group_overrides igo ON LOWER(TRIM(d.itemgroupdescription)) = LOWER(TRIM(igo.item_group_description))
INNER JOIN fp_material_percentages mp ON LOWER(TRIM(COALESCE(igo.pg_combine, rpg.pg_combine))) = LOWER(TRIM(mp.product_group))
```

**New (unified view):**
```sql
FROM vw_unified_sales_complete
WHERE year = $1 AND month = ANY($2) AND UPPER(data_type) = $3
  AND pg_combine IS NOT NULL
  AND LOWER(pg_combine) NOT IN (excluded_categories)
```

**Benefits:**
- Simpler query (no manual joins)
- Consistent with unified architecture
- Already has material, process, pg_combine resolved

**Lines to update:** 97, 220, 299

---

### TASK 2: ProductGroupDataService.js
**File:** `server/database/ProductGroupDataService.js`  
**Purpose:** Product group metrics and aggregations  
**Status:** 🔲 Pending

**Lines to update:** 102, 202, 304, 378, 466

**Current:** Queries `fp_data_excel` with joins to product group tables  
**New:** Use `vw_unified_sales_complete` which already has pg_combine, material, process

---

### TASK 3a: GeographicDistributionService.js ✅
**File:** `server/database/GeographicDistributionService.js`  
**Purpose:** Geographic distribution data for KPI dashboard  
**Status:** ✅ COMPLETED

**Changes made:**
- Added `getColumnMappings()` method for FP vs other divisions
- Updated `getTableName()` to return `vw_unified_sales_complete` for FP
- Changed column mappings: `countryname` → `country`, `type` → `data_type`
- Added `values::numeric` cast for proper aggregation

**Lines updated:** 25-50 (new methods), 77-119 (queries)

---

### TASK 3b: CustomerInsightsService.js ✅
**File:** `server/database/CustomerInsightsService.js`  
**Purpose:** Customer insights with merge rules for KPI dashboard  
**Status:** ✅ COMPLETED

**Changes made:**
- Updated `getTableNames()` helper to return unified view for FP
- Added column mappings: `customername` → `customer_name`, `type` → `data_type`
- Updated `getRawCustomerData()` to use dynamic column names
- Added `values::numeric` cast

**Lines updated:** 14-32 (helper), 92-147 (queries)

---

### TASK 4: fpDataService.js (Partial)
**File:** `server/database/fpDataService.js`  
**Purpose:** Main FP dashboard data service  
**Status:** 🔲 Pending

**Note:** This is a large file (1000+ lines). Need to analyze each query:
- Some queries need transaction-level data → Keep using raw tables
- Some queries just need aggregates → Can use unified views

**Queries to potentially migrate:**
| Line | Query Purpose | Migrate? |
|------|--------------|----------|
| 337 | Get distinct customers | ✅ Use fp_customer_unified |
| 857 | Get distinct countries | ✅ Use master_countries |
| 961 | Get distinct sales reps | ✅ Use fp_sales_rep_unified |
| 38, 70, 146, etc. | Transaction data | ❌ Keep raw (needs month/year detail) |

---

### TASK 4: unified.js (Metadata)
**File:** `server/routes/unified.js`  
**Purpose:** Unified data API metadata endpoint  
**Status:** 🔲 Pending

**Lines:** 753-755

**Current:**
```sql
(SELECT COUNT(*) FROM fp_data_excel) AS transaction_count,
(SELECT ARRAY_AGG(DISTINCT year ORDER BY year) FROM fp_data_excel) AS available_years,
(SELECT ARRAY_AGG(DISTINCT countryname ORDER BY countryname) FROM fp_data_excel) AS available_countries
```

**New:**
```sql
(SELECT COUNT(*) FROM vw_unified_sales_complete) AS transaction_count,
(SELECT ARRAY_AGG(DISTINCT year ORDER BY year) FROM vw_unified_sales_complete) AS available_years,
(SELECT ARRAY_AGG(DISTINCT country ORDER BY country) FROM vw_unified_sales_complete WHERE country IS NOT NULL) AS available_countries
```

---

### TASK 5: crm/index.js (Fallback)
**File:** `server/routes/crm/index.js`  
**Purpose:** CRM customer data (fallback for sales rep lookup)  
**Status:** 🔲 Pending

**Line:** 629

**Current:** Fallback query to `fp_data_excel` when `primary_sales_rep_name` is NULL  
**Analysis:** If `refresh_unified_stats()` is working correctly, `primary_sales_rep_name` should always be populated. This fallback may no longer be needed.

**Action:** Review and potentially remove fallback, or keep as safety net

---

### TASK 6: fp_database_config.js
**File:** `server/database/fp_database_config.js`  
**Purpose:** Dynamic data queries for FP  
**Status:** 🔲 Pending

**Lines:** 80, 125, 143, 166

**Analysis needed:** Check what these queries are used for

---

## 📈 PROGRESS TRACKER

| # | Task | File | Status | Tested |
|---|------|------|--------|--------|
| 1 | ProductPerformanceService | ProductPerformanceService.js | ✅ Done | ✅ |
| 2 | ProductGroupDataService | ProductGroupDataService.js | ✅ Done | ✅ |
| 3a | GeographicDistributionService | GeographicDistributionService.js | ✅ Done | ✅ |
| 3b | CustomerInsightsService | CustomerInsightsService.js | ✅ Done | ✅ |
| 4 | fpDataService (partial) | fpDataService.js | 🔲 | 🔲 |
| 5 | unified.js metadata | unified.js | 🔲 | 🔲 |
| 6 | CRM fallback | crm/index.js | 🔲 | 🔲 |
| 7 | fp_database_config | fp_database_config.js | 🔲 | 🔲 |

---

## 🧪 TESTING CHECKLIST

After each task:
1. Start servers: `START-SERVERS.cmd`
2. Open dashboard in browser
3. Check the specific KPI card/feature that uses the updated service
4. Verify data matches previous values
5. Check console for errors

---

## 📅 CHANGE LOG

| Date | Task | Status |
|------|------|--------|
| 2026-01-04 | Created plan | ✅ |
| 2026-01-04 | Task 1: ProductPerformanceService.js - 3 queries migrated to vw_unified_sales_complete | ✅ |
| 2026-01-04 | Task 2: ProductGroupDataService.js - 5 queries migrated to vw_unified_sales_complete | ✅ |
| 2026-01-04 | Task 3a: GeographicDistributionService.js - 2 queries migrated, added column mappings | ✅ |
| 2026-01-04 | Task 3b: CustomerInsightsService.js - 2 queries migrated, updated getTableNames() helper | ✅ |
| | | |

