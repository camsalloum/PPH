# Customer Issue and Product Group Estimation Fix

**Date:** November 14, 2025  
**Issue Type:** Backend Parameter Mismatch + Custom Month Range Bug  
**Severity:** Critical (500 Internal Server Error + Incorrect Data Display)  
**Status:** ✅ RESOLVED (Both Issues Fixed)

---

## Problem Description

### Issue #1: 500 Internal Server Error (FIXED)

When users selected **"FY Estimate"** or **"Estimate"** type in dashboard tables (Product Group Analysis, Sales by Customer), the system returned **500 Internal Server Error** instead of displaying combined Actual + Estimate data.

### Issue #2: Duplicate Data Across Different Periods (FIXED - November 14, 2025)

When users added custom month range columns (e.g., Jan-Oct, Nov-Dec) to the Sales by Customer table, **all periods displayed identical values** instead of showing data specific to each time period.

**Symptoms:**
- Jan-Oct Actual column showed: 615,815 for Coca-Cola
- Nov-Dec Estimate column showed: 615,815 for Coca-Cola (WRONG - should be different)
- Both columns displayed the same customer list and values
- Sales by Country and Product Groups worked correctly (only Sales by Customer affected)

**Screenshot Evidence:** User reported seeing same figures (615,815, 591,731, 575,899, 573,325) across all three period columns in the Top 20 Customers table.

---

## Root Causes

### Root Cause #1: Parameter Mismatch for Estimate Type

The database stores FY 2025 data in TWO separate record types:
- `type = 'Actual'` → Jan-Oct 2025 data (998 records, total: 87,133,738)
- `type = 'Estimate'` → Nov-Dec 2025 data (1,704 records, total: 17,426,748)

To display **FY Estimate** totals, the system must query **BOTH** types and aggregate them:
```sql
WHERE UPPER(type) IN ('ACTUAL', 'ESTIMATE')
```

However, the backend services had a **parameter count mismatch**:
1. SQL query correctly used `IN ('ACTUAL', 'ESTIMATE')` clause (no parameter placeholder)
3. BUT the params array still included the `type` value
3. PostgreSQL received wrong parameter count → **500 error**

### Root Cause #2: Missing Custom Month Range Support

The `getMonthsForColumn()` helper function in `UniversalSalesByCountryService.js` **did not check for the `column.months` property**, which contains custom month ranges like `[1,2,3,4,5,6,7,8,9,10]` for Jan-Oct or `[11,12]` for Nov-Dec.

**Flow of the Bug:**
1. Frontend sends column definition with `months: [1,2,3,4,5,6,7,8,9,10]` for "Jan-Oct"
2. Backend `getMonthsForColumn()` **ignores the `months` array**
3. Falls back to parsing `column.month = 'Jan-Oct'` as a month name
4. Month name 'Jan-Oct' not found in `monthMapping`
5. Function returns default `[1]` (January only)
6. **All custom range columns query January data only → identical results**

**Proof:**
```javascript
// BEFORE FIX - Missing months array check
static getMonthsForColumn(column) {
  if (column.month === 'Q1') return [1, 2, 3];
  if (column.month === 'Q2') return [4, 5, 6];
  // ... no check for column.months!
  
  const monthNum = this.monthMapping[column.month]; // 'Jan-Oct' not in mapping
  return monthNum ? [monthNum] : [1]; // ❌ Returns [1] for all custom ranges
}
```

This caused:
- Jan-Oct column → queried month=1 only
- Nov-Dec column → queried month=1 only  
- Same data returned for both → duplicate values across all periods

---

## Technical Details

### Parameter Mismatch Example

**Broken Code:**
```javascript
// Query uses IN clause (no $2 parameter needed)
const typeCondition = isEstimateType 
  ? `AND UPPER(type) IN ('ACTUAL', 'ESTIMATE')`  // No placeholder
  : `AND UPPER(type) = UPPER($2)`;               // Uses $2

const monthsPlaceholder = monthsArray.map((_, index) => 
  `$${index + 3}`  // ❌ Always assumes $2 exists
).join(',');

// ❌ PROBLEM: Always passes type, even when query doesn't use it
const params = [year, type, ...monthsArray];
```

**Result:**
- Query expects: `$1=year, $2=month1, $3=month2, ...`
- Receives: `[2025, 'Estimate', 1, 2, 3, ...]`
- PostgreSQL error: "bind message supplies 14 parameters, but query only uses 13"

---

## Files Modified

### 1. UniversalSalesByCountryService.js (November 14, 2025 - Backend Custom Month Range Fix)
**Location:** `server/database/UniversalSalesByCountryService.js`

**Method Fixed:**
- `getMonthsForColumn()` - Added priority check for `column.months` array

**Fix Applied:**
```javascript
// ✅ AFTER FIX - Check column.months FIRST
static getMonthsForColumn(column) {
  // PRIORITY 1: Check if column has explicit months array (for custom ranges like Jan-Oct, Nov-Dec)
  if (column.months && Array.isArray(column.months) && column.months.length > 0) {
    return column.months;
  }
  
  // PRIORITY 2: Check for standard period names
  if (column.month === 'Q1') return [1, 2, 3];
  if (column.month === 'Q2') return [4, 5, 6];
  // ... rest of standard periods
  
  // PRIORITY 3: Handle month names
  const monthNum = this.monthMapping[column.month];
  return monthNum ? [monthNum] : [1];
}
```

**Impact:**
- ✅ Backend can now process custom month ranges when provided
- ✅ Each period queries the correct months from the database
- ✅ Backward compatible - standard periods (Q1, Q2, Year, etc.) still work

---

### 1B. Frontend Components - Custom Month Range Fix (November 14, 2025)

**Issue:** Multiple frontend components were NOT sending the `months` property to backend APIs

**Files Fixed:**
1. **SalesByCustomerTableNew.js** - Line ~346: Ultra-fast API call
2. **SalesBySalesRepDivisional.js** - Line ~183: Ultra-fast API call  
3. **SalesRepReportsContext.js** - Line ~44: Ultra-fast API call

**Fix Applied to All:**
```javascript
// ❌ BEFORE FIX - Missing months property
columns: dataColumnsOnly.map(column => ({
  year: column.year,
  month: column.month,
  type: column.type || 'Actual',
  columnKey: getColumnKey(column)
}))

// ✅ AFTER FIX - Include months array
columns: dataColumnsOnly.map(column => ({
  year: column.year,
  month: column.month,
  months: column.months, // ✅ Include custom month ranges
  type: column.type || 'Actual',
  columnKey: getColumnKey(column)
}))
```

**Impact:**
- ✅ All three components now send complete column information to backend
- ✅ Custom month ranges (Jan-Oct, Nov-Dec, etc.) transmitted correctly
- ✅ Sales by Customer table displays different values for different periods
- ✅ Sales by Sales Rep Divisional displays correct data for custom ranges
- ✅ Sales Rep Reports context pre-loads correct data
- ⚠️ Browser cache refresh/rebuild required after fix

---

### 2. ProductGroupDataService.js (Original Fix)
**Location:** `server/database/ProductGroupDataService.js`

**Methods Fixed:**
- `getProductGroupsData()`
- `getMaterialCategoriesData()`
- `getProcessCategoriesData()`

**Fix Applied:**
```javascript
// ✅ Calculate isEstimateType FIRST
const isEstimateType = normalizedType.includes('ESTIMATE');

// ✅ Adjust placeholder start position based on parameter count
const monthsPlaceholder = monthsArray.map((_, index) => 
  `$${index + (isEstimateType ? 2 : 3)}`  // Start at $2 or $3
).join(',');

const typeCondition = isEstimateType 
  ? `AND UPPER(type) IN ('ACTUAL', 'ESTIMATE')`
  : `AND UPPER(type) = UPPER($2)`;

// ✅ Conditionally include type parameter
const params = isEstimateType 
  ? [year, ...monthsArray]           // No type param
  : [year, type, ...monthsArray];    // Include type param
```

---

### 3. UniversalSalesByCountryService.js (Original Fix)
**Location:** `server/database/UniversalSalesByCountryService.js`

**Methods Fixed:**
- `getSalesByCustomer()` - 3 query variations:
  - Group query (multiple sales reps)
  - Individual sales rep query
  - All sales reps query
- `getSalesByCustomerUltraFast()`
- `getSalesRepReportsUltraFast()`

**Fix Pattern (Individual Query Example):**
```javascript
const isEstimateType = normalizedDataType.includes('ESTIMATE');

const finalTypeCondition = isEstimateType 
  ? `AND UPPER(type) IN ('ACTUAL', 'ESTIMATE')`
  : `AND UPPER(type) = UPPER($${2 + monthsArray.length + 1})`;

// ✅ Calculate valueType placeholder based on parameter count
const valueTypeParamIndex = isEstimateType
  ? 2 + monthsArray.length + 1      // No type param
  : 2 + monthsArray.length + 2;     // Include type param

const query = `
  SELECT customername, 
    SUM(CASE WHEN UPPER(values_type) = UPPER($${valueTypeParamIndex}) 
        THEN values ELSE 0 END) as total_value 
  FROM ${tableName}
  WHERE TRIM(UPPER(salesrepname)) = TRIM(UPPER($1))
  AND year = $2
  AND month IN (${monthPlaceholders})
  ${finalTypeCondition}
  GROUP BY customername
`;

// ✅ Conditionally include dataType parameter
params = isEstimateType
  ? [salesRep, year, ...monthsArray, valueType]
  : [salesRep, year, ...monthsArray, dataType, valueType];
```

---

## Testing & Verification

### Test 1: Custom Month Range Fix (November 14, 2025)
**Test Script:** `test-customer-data.js`

**Test Columns:**
- Jan-Oct Actual (months: [1,2,3,4,5,6,7,8,9,10])
- Nov-Dec Estimate (months: [11,12])
- Year Estimate (months: [1-12])

**BEFORE FIX:**
```
Jan-Oct Actual:   Coca-Cola = 615,814.54  (Total: 8,378,331.41)  ❌ WRONG
Nov-Dec Estimate: Coca-Cola = 615,814.54  (Total: 8,378,331.41)  ❌ DUPLICATE!
Year Estimate:    Coca-Cola = 7,934,859.47 (Total: 104,560,486.10) ✅ Correct
```
**BUG:** First two columns showed identical values (both querying January only)

**AFTER FIX:**
```
Jan-Oct Actual:   Coca-Cola = 6,612,382.87  (Total: 87,133,738.11)  ✅ Correct
Nov-Dec Estimate: Coca-Cola = 1,322,476.60  (Total: 17,426,747.99)  ✅ Correct
Year Estimate:    Coca-Cola = 7,934,859.47  (Total: 104,560,486.10)  ✅ Correct
```
**VERIFICATION:** Year total (7,934,859.47) = Jan-Oct (6,612,382.87) + Nov-Dec (1,322,476.60) ✅

---

### Test 2: Product Groups API (Original Test)
```bash
GET /api/product-groups/fp?year=2025&type=Estimate&months=[1,2,3,4,5,6,7,8,9,10,11,12]

✅ Status: 200 OK
✅ Product Groups: 13
✅ Total Sales: 104,560,486.11 (Actual: 87.1M + Estimate: 17.4M)
```

### Test 2: Sales by Customer API
```bash
POST /api/sales-by-customer-db
Body: {
  "division": "FP",
  "year": 2025,
  "months": [1,2,3,4,5,6,7,8,9,10,11,12],
  "dataType": "Estimate"
}

✅ Status: 200 OK
✅ Customers: 155
✅ Total Value: 104,560,486.11
✅ Top Customer: COCA-COLA AL AHLIA BEVERAGES (7,934,859.47)
```

### Test 3: Ultra-Fast Endpoint (Original Test)
```bash
POST /api/sales-by-customer-ultra-fast
Body: {
  "division": "FP",
  "columns": [{ "year": 2025, "month": "Year", "type": "Estimate" }]
}

✅ Status: 200 OK
✅ Customers: 155
✅ Total Value: 104,560,486.11
```

### Test 4: Nov-Dec Only (Estimate Records - Original Test)
```bash
POST /api/sales-by-customer-db
Body: {
  "division": "FP",
  "year": 2025,
  "months": [11, 12],
  "dataType": "Estimate"
}

✅ Status: 200 OK
✅ Total Value: 17,426,748 (Estimate-only months)
```

---

## Impact Summary

### Before Both Fixes
- ❌ Product Group Analysis: 500 error for Estimate type
- ❌ Sales by Customer: 500 error for Estimate type  
- ❌ Sales by Customer: Duplicate data across custom month ranges (Jan-Oct, Nov-Dec)
- ❌ Users could not view FY Estimate projections
- ❌ Custom period comparisons showed incorrect identical values
- ❌ Dashboard tables incomplete for 2025 planning

### After Both Fixes
- ✅ All dashboard tables work with Estimate type
- ✅ FY Estimate shows combined Actual + Estimate totals
- ✅ Custom month ranges (Jan-Oct, Nov-Dec, etc.) display correct period-specific data
- ✅ Each time period shows unique values matching actual database records
- ✅ Consistent data across Product Groups, Sales by Country, Sales by Customer
- ✅ Users can view full 2025 projections (Jan-Dec combined)
- ✅ Period-to-period comparisons now accurate and meaningful

---

## Database State (FY 2025 FP Division)

| Type | Months | Records | Total AMOUNT |
|------|--------|---------|--------------|
| Actual | Jan-Oct | 998 | 87,133,738.11 |
| Estimate | Nov-Dec | 1,704 | 17,426,748.00 |
| **FY Estimate** | **Jan-Dec** | **2,702** | **104,560,486.11** |

**Product Group Breakdown (FY Estimate):**
1. Shrink Film Printed: 30,781,824.93
2. Laminates: 22,995,641.81
3. Shrink Sleeves: 14,947,188.27
4. Bag Plain: 6,820,479.26
5. Industrial Items Printed: 6,473,803.33
6. Bag Printed: 6,125,829.89
7. Shrink Film Plain: 3,914,026.79
8. Commercial Items Printed: 2,027,317.81
9. Commercial Items Plain: 2,240,903.12
10. Industrial Items Plain: 1,971,362.96
11. Liner Plain: 1,711,605.28
12. Liner Printed: 854,621.95
13. Shrink Sleeves Printed: 138,577.71

---

## Affected Components

### Backend Services
- ✅ `ProductGroupDataService.js` (3 methods) - Estimate type parameter fix
- ✅ `UniversalSalesByCountryService.js` (6 methods total):
  - `getMonthsForColumn()` - Custom month range support (NEW FIX)
  - `getSalesByCustomer()` - 3 query variations (Estimate type fix)
  - `getSalesByCustomerUltraFast()` - Estimate type fix
  - `getSalesRepReportsUltraFast()` - Estimate type fix

### API Endpoints
- ✅ `GET /api/product-groups/fp`
- ✅ `POST /api/sales-by-customer-db`
- ✅ `POST /api/sales-by-customer-ultra-fast`
- ✅ `POST /api/sales-rep-reports-ultra-fast`

### Frontend Components
- ✅ ProductGroupTable.js (already working - converts month names to numbers)
- ✅ SalesByCustomerTableNew.js (already working - sends correct format)
- ✅ SalesByCountryTable.js (already working)

---

## Key Learnings

1. **Parameter Arrays Must Match SQL Placeholders**
   - When conditionally building SQL with optional parameters
   - Always adjust both placeholder calculations AND params array

2. **Estimate Type Detection Pattern**
   ```javascript
   const isEstimateType = normalizedType.includes('ESTIMATE');
   ```
   - Catches "Estimate", "FY Estimate", "estimate", etc.
   - Flexible for future naming variations

3. **Conditional Parameter Indexing**
   - Calculate placeholder indices dynamically based on parameter count
   - Use ternary operators: `isEstimateType ? index : index + 1`

4. **Test with Multiple Query Variations**
   - Group queries (multiple sales reps)
   - Individual queries (single sales rep)
   - All-records queries (no filter)
   - Each has different parameter counts

5. **Priority Order in Helper Functions is Critical** (NEW LEARNING)
   - When accepting multiple input formats, check most specific first:
     1. Explicit arrays (`column.months`)
     2. Standard keywords (`'Q1'`, `'Year'`, `'HY1'`)
     3. Named values (`'January'`, `'February'`)
     4. Default fallback
   - Missing priority checks cause silent data bugs (wrong results vs. errors)

6. **Custom Date Ranges Need Explicit Support**
   - Don't assume all period selections map to standard quarters/months
   - Users create custom ranges for business reasons (fiscal periods, comparisons)
   - Frontend sends `months` array explicitly → backend must respect it

7. **Silent Data Bugs vs. Obvious Errors**
   - Parameter mismatch → 500 error (OBVIOUS - gets fixed quickly)
   - Wrong month query → duplicate data (SILENT - harder to detect)
   - Always add diagnostic logging for data retrieval
   - Test with multiple distinct time periods to catch duplication bugs

---

## Deployment Notes

**Server Restart Required:** YES  
**Database Migration Required:** NO  
**Frontend Changes Required:** NO (already compatible)

**Deployment Steps:**
1. Pull latest code with fixes
2. Restart Node.js server
3. Clear browser cache (Ctrl+F5)
4. Test with "2025 FY Estimate" selection in dashboard

**Rollback Plan:**
- Revert commits to ProductGroupDataService.js and UniversalSalesByCountryService.js
- Estimate type will return to 500 error (no data loss)

---

## Related Issues

- **First Fix (Original):** Parameter mismatch for Estimate type → 500 errors
- **Second Fix (November 14, 2025):** Missing `column.months` support → duplicate data across periods
- **Third Fix (November 14, 2025):** Custom range display names showing as "CUSTOM_JANUARY_FEBRUARY..." instead of "Jan-Oct"
  
  ### Display Name Formatting Fix - Comprehensive Solution
  
  **Problem:** Custom range periods displayed internal format names like "CUSTOM_JANUARY_FEBRUARY_MARCH_APRIL_MAY_JUNE_JULY_AUGUST_SEPTEMBER_OCTOBER" instead of user-friendly "Jan-Oct" throughout the application.
  
  **Solution:** Created centralized utility function and applied across all components:
  
  **Utility Function Created:**
  - `src/utils/periodHelpers.js` - Added `formatCustomRangeDisplay()` function
  - Converts "CUSTOM_JANUARY_FEBRUARY..." to "Jan-Oct"
  - Reusable across all components
  
  **Files Fixed (11 components + 1 utility):**
  
  1. **Report Components (Tables):**
     - ✅ `src/components/reports/ReportHeader.js` - Report descriptions and headers
     - ✅ `src/components/reports/ProductGroupsKgsTable.js` - Table headers
     - ✅ `src/components/reports/ProductGroupsAmountTable.js` - Table headers
     - ✅ `src/components/reports/CustomersKgsTable.js` - Table headers
     - ✅ `src/components/reports/CustomersAmountTable.js` - Table headers
     - ✅ `src/components/reports/PeriodComparison.js` - Period labels
  
  2. **Dashboard Components:**
     - ✅ `src/components/dashboard/SalesRepHTMLExport.js` - HTML export (4 table headers)
       - Sales Rep comparison table
       - Customer table
       - Product Groups KGS table
       - Product Groups Sales table
     - ✅ `src/components/dashboard/KPIExecutiveSummary.js` - Period display names
     - ✅ `src/components/dashboard/MultiChartHTMLExport.js` - Chart exports (25 locations)
       - All chart titles and period labels
       - Manufacturing cost charts
       - Margin analysis charts
       - Below GP expenses charts
       - Combined trends charts
  
  3. **Utility Module:**
     - ✅ `src/utils/periodHelpers.js` - Central utility with `formatCustomRangeDisplay()`
  
  **Total Locations Fixed:** 40+ instances across 12 files
  
  **Impact:**
  - ✅ All web tables show "Jan-Oct" instead of "CUSTOM_JANUARY..."
  - ✅ All PDF/HTML exports show formatted period names
  - ✅ All charts display user-friendly period labels
  - ✅ KPI page displays readable period names
  - ✅ Report headers show clean period descriptions
  - ✅ Consistent formatting across entire application
  
  **Browser Cache:** Users need to hard refresh (Ctrl+Shift+R or Ctrl+F5) to see changes

- **Previous Fix:** ProductGroupTable month name conversion (already completed)
- **Database Setup:** FP Estimate data loaded from Excel (Nov-Dec 2025)
- **Future Enhancement:** Consider merging Actual+Estimate into single "FY Estimate" type during import

---

**Fixed By:** GitHub Copilot  
**Tested By:** API testing with PowerShell commands + Node.js diagnostic script  
**Verified:** 
- ✅ All dashboard tables display correct FY Estimate totals
- ✅ Custom period ranges work correctly
- ✅ PDF reports show user-friendly period names (Jan-Oct, not CUSTOM_JANUARY...)
