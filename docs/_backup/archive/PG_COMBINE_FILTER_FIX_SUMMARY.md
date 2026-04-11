# PG_COMBINE Filter Implementation Summary

## Issue
The "Sales by Sales Reps" table was showing Total Sales of **96,864,344** instead of the correct **~95,794,000**.

The difference (~1,034,026) was caused by **Raw Materials** product group being included in aggregations despite being marked as `is_unmapped = true` in `fp_raw_product_groups`.

## Root Cause
Multiple SQL queries in `UniversalSalesByCountryService.js` were aggregating `AMOUNT` values directly from `fp_data_excel` without joining to `fp_raw_product_groups` to filter out unmapped product groups.

## Solution
Added the pg_combine filter pattern from `productGroupService` to all queries that aggregate sales amounts:

```javascript
// Get filter components
const pgJoins = productGroupService.buildResolutionJoins(division, 'd');
const pgFilter = productGroupService.buildExclusionFilter(division);

// SQL pattern
SELECT SUM(...) as total
FROM ${tableName} d
${pgJoins}           -- INNER JOIN rpg + LEFT JOIN igo
WHERE ...
AND ${pgFilter}      -- COALESCE filter for valid pg_combine
```

## Methods Fixed in UniversalSalesByCountryService.js

### 1. `getSalesRepDivisionalUltraFast()` (lines 121-168)
- **Purpose**: Powers "Sales by Sales Reps" table
- **Fix**: Added pgJoins and pgFilter to non-budget query branch

### 2. `getSalesByCustomerUltraFast()` (lines 244-284)
- **Purpose**: Powers "Sales by Customer" table in divisional dashboard  
- **Fix**: Added pgJoins and pgFilter to non-budget query branch

### 3. `getSalesRepReportsUltraFast()` (lines 468-506)
- **Purpose**: Powers sales rep reports with productGroup, customer, valueType breakdown
- **Fix**: Added pgJoins and pgFilter; now returns resolved pg_combine instead of raw productgroup

### 4. `getSalesByCountry()` - all 3 variants (lines 877-962)
- Group members variant
- Individual sales rep variant  
- All sales reps variant
- **Fix**: All three branches now use pgJoins and pgFilter

### 5. `getSalesByCountryAmountByYear()` (lines 970-998)
- **Purpose**: Get country sales for a specific year
- **Fix**: Added pgJoins and pgFilter

### 6. `getSalesByCustomer()` - all 3 variants (lines 1047-1140)
- Group members variant
- Individual sales rep variant
- All sales reps variant
- **Fix**: All three branches now use pgJoins and pgFilter

### 7. `getSalesRepProductGroupUltraFast()` (lines 1463-1590)
- **Purpose**: Powers product group breakdown tables
- **Fix**: Non-budget branch now uses pgJoins and pgFilter

### 8. `getSalesRepCustomerUltraFast()` (lines 1797-1830)
- **Purpose**: Powers customer breakdown for sales reps
- **Fix**: Non-budget branch now uses pgJoins and pgFilter

## Verification Results

| Year | WITHOUT Filter | WITH Filter | Excluded |
|------|----------------|-------------|----------|
| 2025 | 96,827,989.98 | **95,793,963.50** | 1,034,026.48 |
| 2024 | 92,204,927.69 | **91,206,479.72** | 998,447.97 |

The ~1M difference is **Raw Materials** which is correctly marked as `is_unmapped = true` in `fp_raw_product_groups`.

## Files Modified
1. `server/database/UniversalSalesByCountryService.js` - 8 methods updated

## Note on Budget Queries
Budget table queries (fp_sales_rep_budget, fp_divisional_budget) were NOT modified because:
1. Budget data is validated during upload
2. Budget tables only contain valid pg_combine values
3. Filtering would be redundant and add unnecessary complexity

## Testing
After server restart, the "Sales by Sales Reps" total should show ~95.8M (for 2025) instead of ~96.8M.

---
*Generated: 2024-12-24*
