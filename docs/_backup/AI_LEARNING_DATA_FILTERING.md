# AI Learning Data Filtering Architecture

**Created:** December 28, 2025  
**Updated By:** GitHub Copilot

## Overview

This document describes the **3-layer data filtering architecture** that must be applied to all queries throughout the IPD project. The AI Learning services have been updated to use this filtering consistently.

---

## The 3 Filtering Layers

### Layer 1: Product Group Resolution (PGCombine)

**Raw Data:** `productgroup` column in `fp_data_excel` contains raw product group names  
**Resolution:** Must JOIN with mapping tables to get the canonical `PGCombine` value

```
Flow: Raw ProductGroup → fp_raw_product_groups → PGCombine
      Optional Override: ItemGroupDescription → fp_item_group_overrides → Override PGCombine
```

**Tables Involved:**
- `fp_raw_product_groups`: Maps raw_product_group → pg_combine
- `fp_item_group_overrides`: Individual item overrides (takes precedence)
- `fp_material_percentages`: **Source of truth** for valid PGCombines

**Exclusion Rules:**
- `is_unmapped = true` → Excluded
- `pg_combine IS NULL` → Excluded
- `pg_combine = 'Raw Materials'` → Excluded
- `pg_combine = 'Not in PG'` → Excluded
- `pg_combine = 'Services Charges'` → Special handling (no volume)

**SQL Pattern:**
```sql
SELECT 
  COALESCE(igo.pg_combine, rpg.pg_combine) as product_group,
  ...
FROM fp_data_excel d
INNER JOIN fp_raw_product_groups rpg 
  ON LOWER(TRIM(d.productgroup)) = LOWER(TRIM(rpg.raw_product_group))
  AND (rpg.is_unmapped IS NULL OR rpg.is_unmapped = FALSE)
LEFT JOIN fp_item_group_overrides igo
  ON LOWER(TRIM(d.itemgroupdescription)) = LOWER(TRIM(igo.item_group_description))
WHERE COALESCE(igo.pg_combine, rpg.pg_combine) IS NOT NULL
  AND LOWER(TRIM(COALESCE(igo.pg_combine, rpg.pg_combine))) NOT IN ('raw materials', 'not in pg')
```

---

### Layer 2: Sales Rep Resolution (Canonical Names)

**Raw Data:** `salesrepname` column contains various spellings/aliases  
**Resolution:** Resolve to canonical name using alias mapping

```
Flow: Raw Name → sales_rep_aliases → sales_rep_master → Canonical Name
```

**Tables Involved:**
- `sales_rep_master`: Contains canonical_name
- `sales_rep_aliases`: Maps alias_name → sales_rep_id → canonical_name

**Additional Grouping:**
- `sales_rep_groups` + `sales_rep_group_members`: Logical groupings (treat as ONE entity)

**Resolution Methods:**

1. **CASE Expression (preferred for small alias sets):**
```sql
-- Built by salesRepResolver.buildResolutionSQL()
CASE 
  WHEN LOWER(TRIM(salesrepname)) = 'ali hassan' THEN 'Ali Hassan'
  WHEN LOWER(TRIM(salesrepname)) = 'a. hassan' THEN 'Ali Hassan'
  ELSE TRIM(salesrepname) 
END as salesrep_name
```

2. **JOIN Method (for larger sets):**
```sql
LEFT JOIN sales_rep_aliases sra ON LOWER(TRIM(d.salesrepname)) = LOWER(sra.alias_name)
LEFT JOIN sales_rep_master srm ON sra.sales_rep_id = srm.id
SELECT COALESCE(srm.canonical_name, TRIM(d.salesrepname)) as salesrep_name
```

---

### Layer 3: Customer Resolution (Merge Rules)

**Raw Data:** `customername` column contains various spellings/subsidiary names  
**Resolution:** Resolve to merged customer name

```
Flow: Raw Name → division_customer_merge_rules → Merged Customer Name
```

**Table:** `{division}_division_customer_merge_rules`
- `merged_customer`: The canonical merged name
- `customer_group`: Array of all names that should be merged

**Resolution Method (CASE Expression):**
```sql
CASE 
  WHEN LOWER(TRIM(customername)) = 'acme corp' THEN 'ACME Corporation'
  WHEN LOWER(TRIM(customername)) = 'acme llc' THEN 'ACME Corporation'
  ELSE TRIM(customername) 
END as customer_name
```

---

## Using DataFilteringHelper

The `server/services/DataFilteringHelper.js` utility provides all necessary SQL building blocks:

### Quick Usage Examples

```javascript
const DataFilteringHelper = require('./DataFilteringHelper');

// Get table names
const tables = DataFilteringHelper.getTableNames('FP');

// Get product group SQL
const pg = DataFilteringHelper.getProductGroupSQL('FP');
// pg.joins - JOIN clauses
// pg.pgCombineExpr - Expression for resolved PGCombine
// pg.filterCondition - WHERE condition to exclude invalid PGs

// Get sales rep resolution expression
const salesRepExpr = DataFilteringHelper.getSalesRepResolutionExpr('d.salesrepname');

// Get customer merge resolution (async)
const customerExpr = await DataFilteringHelper.buildCustomerResolutionSQL('FP', 'd.customername');

// Complete filtered query helper
const data = await DataFilteringHelper.getFilteredSalesData('FP', 2025, 6);
```

---

## Services Updated

The following services now use the 3-layer filtering:

### DataCaptureService (Foundation)
- `captureDivisionMetrics()` - Uses all 3 filters
- `captureAllSalesRepMetrics()` - Uses PGCombine + canonical sales rep names
- `captureAllCustomerMetrics()` - Uses PGCombine + merged customer names
- `captureAllProductMetrics()` - Uses PGCombine only

### Learning Services (Read from behavior history)
These read from behavior history tables populated by DataCaptureService:
- `DivisionLearningService` - Seasonality, thresholds
- `SalesRepLearningService` - Clustering, patterns
- `CustomerLearningService` - Churn prediction, segmentation

### Direct Query Services
These query `_data_excel` directly and now apply filters:
- `ProductLearningService` - Lifecycle, velocity, cross-sell, seasonality
- `PLLearningService` - Margins, cost anomalies, predictions, product mix

---

## Critical Notes

1. **INNER JOIN vs LEFT JOIN:** Always use INNER JOIN with `fp_raw_product_groups` to exclude unmapped products

2. **Case Sensitivity:** All comparisons use `LOWER(TRIM(...))` for consistency

3. **Cache Loading:** `salesRepResolver` loads aliases at server startup - call `loadAliasCache(pool)` in index.js

4. **Performance:** Customer merge resolution builds a CASE expression per query - consider caching for high-frequency operations

5. **Valid PGCombines Only:** When strict filtering is needed, JOIN with `fp_material_percentages` to ensure only valid product groups are included

---

## UI Pages Using This Data

The following UI pages rely on properly filtered data:

- **Divisional Reports** - Product group aggregations
- **Sales Rep Performance** - Per-rep metrics with alias resolution
- **Customer Analytics** - Customer-level metrics with merge rules
- **P&L Reports** - Financial calculations excluding unmapped products
- **Budget vs Actual** - Comparisons using canonical entities
- **AI Learning Dashboard** - All AI insights

---

## Testing

After modifying any AI Learning service, verify:

1. Raw product groups like "HDPE INJECTION" appear as their PGCombine ("HDPE")
2. Sales rep aliases are consolidated under canonical names
3. Merged customers show combined data
4. "Raw Materials" and unmapped products are excluded
5. Totals match the divisional reports (which already apply these filters)
