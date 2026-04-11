# Database Indexing Audit Report

**Date:** November 21, 2025
**Database:** fp_database (PostgreSQL)
**Auditor:** System Analysis

---

## Executive Summary

✅ **Overall Status:** Database has **extensive indexing** in place
📊 **Total Indexes Found:** 35 indexes across 5 tables
✅ **Constraints:** 9 check constraints properly enforced on fp_data_excel
⚠️ **Missing Indexes:** 3 recommended indexes not yet applied

---

## Table-by-Table Breakdown

### 1. fp_data_excel (Main Table) - 18 Indexes

#### ✅ Performance Indexes (Applied)
- **idx_fp_data_sales_rep_performance** - Sales rep dashboard queries
  - Columns: `(salesrepname, productgroup, values_type, year, month, type)`

- **idx_fp_data_customer_performance** - Customer dashboard queries
  - Columns: `(salesrepname, customername, year, month, type)`

- **idx_fp_data_product_group_performance** - Product group lookups
  - Columns: `(salesrepname, productgroup)`
  - Filter: `WHERE productgroup IS NOT NULL AND productgroup != ''`

- **idx_fp_data_country_performance** - Country-based queries
  - Columns: `(salesrepname, countryname, year, month, type)`
  - Filter: `WHERE countryname IS NOT NULL AND countryname != ''`

- **idx_fp_data_values_performance** - Aggregation queries (SUM operations)
  - Columns: `(salesrepname, values_type, type, values)`
  - Filter: `WHERE values IS NOT NULL`

#### ✅ HTML Budget Form Indexes (Applied)
- **idx_fp_html_budget_customers** - HTML budget customer queries
  - Columns: `(division, year, type, salesrepname, customername, countryname, productgroup, month)`
  - Filter: `WHERE type = 'Actual' AND values_type = 'KGS'`

- **idx_fp_budget_insert** - Budget insert/update operations
  - Columns: `(division, year, month, type, salesrepname, customername, countryname, productgroup, values_type)`
  - Filter: `WHERE type = 'Budget'`

- **idx_fp_actual_sales_rep_customer** - Actual sales lookups
  - Columns: `(division, year, type, salesrepname, customername, countryname, productgroup, month, values_type)`
  - Filter: `WHERE type = 'Actual' AND customername IS NOT NULL AND TRIM(customername) != ''`

#### ✅ Legacy/General Indexes (Applied)
- **fp_data_excel_pkey** - Primary key on `id` (UNIQUE)
- **ix_fp_data_composite** - `(division, type, year, month)`
- **ix_fp_data_customer** - `(customername)`
- **ix_fp_data_division** - `(division)`
- **ix_fp_data_excel_customer** - `(customername)` (duplicate?)
- **ix_fp_data_excel_period** - `(year, month)`
- **ix_fp_data_sourcesheet** - `(sourcesheet)`
- **ix_fp_data_type** - `(type)`
- **ix_fp_data_updated_at** - `(updated_at DESC)`
- **ix_fp_data_values_type** - `(values_type)`

#### ⚠️ Missing Indexes (Recommended)
The following indexes are defined in SQL scripts but **NOT YET APPLIED**:

1. **idx_fp_data_pricing_averages** (from [create-product-pricing-indexes.sql](server/scripts/create-product-pricing-indexes.sql:6))
   - Purpose: Product pricing average calculations
   - Columns: `(year, type, productgroup, values_type)`
   - Filter: `WHERE productgroup IS NOT NULL AND TRIM(productgroup) != ''`
   - **Impact:** May slow down Product Group Pricing feature queries

2. **idx_fp_customer_salesrep_recent** (from [create-customer-salesrep-indexes.sql](server/scripts/create-customer-salesrep-indexes.sql:5))
   - Purpose: Customer-sales rep mapping queries
   - Columns: `(division, customername, year DESC, month DESC)`
   - Filter: `WHERE salesrepname IS NOT NULL AND customername IS NOT NULL AND customername <> '' AND values_type ILIKE 'AMOUNT'`
   - **Impact:** May slow down `/api/customer-sales-rep-mapping` endpoint

3. **idx_fp_salesrep_customer_recent** (from [create-customer-salesrep-indexes.sql](server/scripts/create-customer-salesrep-indexes.sql:13))
   - Purpose: Sales rep validation and reverse lookups
   - Columns: `(division, salesrepname, year DESC, month DESC)`
   - Filter: `WHERE salesrepname IS NOT NULL AND salesrepname <> '' AND values_type ILIKE 'AMOUNT'`
   - **Impact:** May slow down sales rep validation queries

---

### 2. sb_data_excel (SB Division) - 5 Indexes

✅ **Applied Indexes:**
- **sb_data_excel_pkey** - Primary key on `id` (UNIQUE)
- **idx_sb_data_excel_country** - `(countryname)`
- **idx_sb_data_excel_sales_rep** - `(salesrepname)`
- **idx_sb_data_excel_type** - `(type)`
- **idx_sb_data_excel_year_month** - `(year, month)`

⚠️ **Missing:**
- No pricing averages index (idx_sb_data_pricing_averages)
- No years_actual index (idx_sb_data_years_actual)

---

### 3. tf_data_excel (TF Division) - 5 Indexes

✅ **Applied Indexes:**
- **tf_data_excel_pkey** - Primary key on `id` (UNIQUE)
- **idx_tf_data_excel_country** - `(countryname)`
- **idx_tf_data_excel_sales_rep** - `(salesrepname)`
- **idx_tf_data_excel_type** - `(type)`
- **idx_tf_data_excel_year_month** - `(year, month)`

⚠️ **Missing:**
- No pricing averages index (idx_tf_data_pricing_averages)
- No years_actual index (idx_tf_data_years_actual)

---

### 4. hcm_data_excel (HCM Division) - 5 Indexes

✅ **Applied Indexes:**
- **hcm_data_excel_pkey** - Primary key on `id` (UNIQUE)
- **idx_hcm_data_excel_country** - `(countryname)`
- **idx_hcm_data_excel_sales_rep** - `(salesrepname)`
- **idx_hcm_data_excel_type** - `(type)`
- **idx_hcm_data_excel_year_month** - `(year, month)`

⚠️ **Missing:**
- No pricing averages index (idx_hcm_data_pricing_averages)
- No years_actual index (idx_hcm_data_years_actual)

---

### 5. product_group_pricing_rounding - 2 Indexes

✅ **Applied Indexes:**
- **product_group_pricing_rounding_pkey** - Primary key on `id` (UNIQUE)
- **uniq_division_year_product_group** - Unique constraint on `(division, year, product_group)`

⚠️ **Missing:**
- No lookup index (idx_product_pricing_rounding_lookup)

---

## Database Constraints (fp_data_excel)

### ✅ Applied Constraints (9 total)

| Constraint Name | Type | Purpose |
|----------------|------|---------|
| `chk_year_range` | CHECK | Year between 2019-2050 |
| `chk_month_range` | CHECK | Month between 1-12 |
| `chk_values_type` | CHECK | Values_type in ('AMOUNT', 'KGS', 'MORM') - case insensitive |
| `chk_type_enum` | CHECK | Type in ('ACTUAL', 'BUDGET', 'ESTIMATE', 'FORECAST') - case insensitive |
| `chk_division_enum` | CHECK | Division in ('FP', 'SB', 'TF', 'HCM') - case insensitive |
| `chk_customername_not_empty` | CHECK | Customername is not null and not empty |
| `fp_data_excel_month_check` | CHECK | Month between 1-12 (legacy duplicate) |
| `fp_data_excel_year_check` | CHECK | Year between 2000-2100 (legacy duplicate) |
| `fp_data_excel_pkey` | PRIMARY KEY | Unique ID constraint |

**Note:** Some duplicate constraints exist (month_check, year_check) with slightly different ranges. This is not harmful but could be consolidated.

---

## Index Coverage Analysis

### ✅ Well-Indexed Features:
1. **Sales Rep Dashboard** - Excellent coverage
2. **Customer Dashboard** - Excellent coverage
3. **HTML Budget Form** - Excellent coverage
4. **Country-based queries** - Good coverage
5. **Product group lookups** - Good coverage
6. **General filtering** - Adequate coverage

### ⚠️ Potentially Under-Indexed Features:
1. **Product Group Pricing** - Missing pricing averages indexes on all 4 division tables
2. **Customer-Sales Rep Mapping** - Missing specialized recent-data indexes
3. **Year filtering for ACTUAL data** - Missing years_actual indexes on SB, TF, HCM tables

---

## Performance Impact Assessment

### Current State: **GOOD** ✅
- Core features (dashboards, budgets) have proper indexes
- Query performance should be acceptable for most operations
- Primary key and basic filters well-indexed

### Potential Issues: **MINOR** ⚠️
- Product pricing calculations may be slower than optimal
- Customer-sales rep mapping might show latency with large datasets
- Division-specific queries (SB, TF, HCM) lack pricing optimization

---

## Recommendations

### Priority 1: Apply Missing Product Pricing Indexes
Run this script to add pricing indexes:
```bash
psql -U postgres -d fp_database -f server/scripts/create-product-pricing-indexes.sql
```

**Benefit:** Faster product pricing calculations across all divisions

### Priority 2: Apply Customer-Sales Rep Mapping Indexes
Run this script to add customer mapping indexes:
```bash
psql -U postgres -d fp_database -f server/scripts/create-customer-salesrep-indexes.sql
```

**Benefit:** Faster customer-sales rep mapping queries (especially after large uploads)

### Priority 3: Clean Up Duplicate Constraints
Consider consolidating duplicate year/month constraints:
- Keep `chk_year_range` (2019-2050) and drop `fp_data_excel_year_check`
- Keep `chk_month_range` (1-12) and drop `fp_data_excel_month_check`

**Benefit:** Cleaner schema, slightly faster constraint checking

### Priority 4: Review Index Usage
After applying missing indexes, run this query to see which indexes are actually used:
```sql
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

This will help identify unused indexes that could be dropped.

---

## Index Scripts Available

| Script File | Status | Purpose |
|------------|--------|---------|
| [add-performance-indexes.sql](server/scripts/add-performance-indexes.sql) | ✅ Applied | Sales rep dashboard performance |
| [create-product-pricing-indexes.sql](server/scripts/create-product-pricing-indexes.sql) | ⚠️ Partial | Product pricing queries (FP missing, SB/TF/HCM missing) |
| [create-customer-salesrep-indexes.sql](server/scripts/create-customer-salesrep-indexes.sql) | ❌ Not Applied | Customer-sales rep mapping |
| [add-html-budget-indexes.sql](server/scripts/add-html-budget-indexes.sql) | ✅ Applied | HTML budget form |
| [database-constraints-step2.sql](src/components/MasterData/AEBF/database-constraints-step2.sql) | ✅ Applied | Data validation constraints |

---

## Verification Commands

### Check Index Usage Stats
```sql
SELECT indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename = 'fp_data_excel'
ORDER BY idx_scan DESC;
```

### Check Index Size
```sql
SELECT indexname,
       pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE tablename = 'fp_data_excel'
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Explain Query Performance
```sql
EXPLAIN ANALYZE
SELECT SUM(values)
FROM fp_data_excel
WHERE salesrepname = 'Abraham Mathew'
  AND productgroup = 'BEVERAGES'
  AND year = 2024;
```

---

## Conclusion

**Overall Assessment:** The database has **strong indexing** for core features. A few recommended indexes remain unapplied, which should be added to optimize specific features like product pricing and customer-sales rep mapping.

**Action Required:**
1. Apply [create-product-pricing-indexes.sql](server/scripts/create-product-pricing-indexes.sql)
2. Apply [create-customer-salesrep-indexes.sql](server/scripts/create-customer-salesrep-indexes.sql)
3. Monitor query performance after applying indexes

**Estimated Time:** 5-10 minutes to apply all missing indexes
