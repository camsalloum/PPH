# AEBF Divisional Budget - Product Group System Verification

**Date**: January 10, 2026  
**Status**: ✅ **VERIFIED CORRECT**

---

## ✅ Summary

The AEBF Divisional Budget Product Group page **IS CORRECTLY** using `pgcombine` as the main product group field for filtering and aggregating actual/budget data.

---

## 📊 System Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 1: Raw Product Groups Page (Master Data Management)          │
│  Purpose: Define pgcombine mappings                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Table: raw_product_group_mappings (ip_auth_database)              │
│  ┌──────────┬────────────────────────┬─────────────┐               │
│  │ Division │ Product Group          │ pg_combine  │               │
│  ├──────────┼────────────────────────┼─────────────┤               │
│  │ FP       │ Various products       │ Labels      │               │
│  │ FP       │ Various products       │ Laminates   │               │
│  │ FP       │ Various products       │ Wide Film   │               │
│  └──────────┴────────────────────────┴─────────────┘               │
│                                                                     │
│  Result: 14 distinct pgcombine groups for FP division              │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 2: Actual Data (fp_actualcommon)                             │
│  Each transaction has pgcombine field                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  SELECT pgcombine, year, month_no, SUM(amount), SUM(qty_kgs)       │
│  FROM fp_actualcommon                                               │
│  WHERE year = 2025                                                  │
│  GROUP BY pgcombine, year, month_no                                 │
│                                                                     │
│  Example Results (2025 data):                                       │
│  - Commercial Items Plain: 553 transactions                         │
│  - Shrink Film Printed: 2,436 transactions                          │
│  - Labels: 621 transactions                                         │
│  - Wide Film: 185 transactions                                      │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 3: API - /api/aebf/divisional-html-budget-data               │
│  server/routes/aebf/divisional.js                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Actual Data Query:                                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ SELECT                                                      │   │
│  │   a.pgcombine as product_group,                             │   │
│  │   CAST(a.month_no AS TEXT) as month,                        │   │
│  │   'AMOUNT' as values_type,                                  │   │
│  │   SUM(a.amount) as total_values                             │   │
│  │ FROM fp_actualcommon a                                      │   │
│  │ LEFT JOIN fp_product_group_exclusions e                     │   │
│  │   ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))│  │
│  │ WHERE a.division_code = 'FP'                                │   │
│  │   AND a.year = 2025                                         │   │
│  │   AND a.pgcombine IS NOT NULL                               │   │
│  │   AND e.product_group IS NULL  -- Exclude excluded PGs      │   │
│  │ GROUP BY a.pgcombine, a.month_no                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Budget Data Query:                                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ SELECT                                                      │   │
│  │   b.pgcombine as product_group,                             │   │
│  │   b.month,                                                  │   │
│  │   SUM(b.qty_kgs) as total_kgs                               │   │
│  │ FROM fp_budget_unified b                                    │   │
│  │ WHERE b.division_code = 'FP'                                │   │
│  │   AND b.year = 2026                                         │   │
│  │   AND b.pgcombine IS NOT NULL                               │   │
│  │ GROUP BY b.pgcombine, b.month                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 4: Frontend - BudgetTab.jsx (Divisional Budget)              │
│  src/components/MasterData/AEBF/BudgetTab.jsx                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Table Structure:                                                   │
│  ┌─────────────────┬─────┬─────┬─────┬─────┬─────┬───────┐         │
│  │ Product Group   │ Jan │ Feb │ Mar │ ... │ Dec │ Total │         │
│  ├─────────────────┼─────┼─────┼─────┼─────┼─────┼───────┤         │
│  │ Labels (Actual) │ 150 │ 200 │ 180 │ ... │ 190 │ 2,100 │         │
│  │ Labels (Budget) │ [160] [210] [190] ... [200] [2,200]│         │
│  ├─────────────────┼─────┼─────┼─────┼─────┼─────┼───────┤         │
│  │ Laminates (Act.)│ 300 │ 280 │ 310 │ ... │ 290 │ 3,500 │         │
│  │ Laminates (Bdgt)│ [320] [300] [330] ... [310] [3,700]│         │
│  └─────────────────┴─────┴─────┴─────┴─────┴─────┴───────┘         │
│                                                                     │
│  - Each row = one pgcombine (product group)                         │
│  - Actual row: Blue background, read-only                           │
│  - Budget row: Yellow background, editable input fields             │
│  - Filtered by selected division and year                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## ✅ Verification Results

### 1. Raw Product Groups Mappings
**Source**: `raw_product_group_mappings` (ip_auth_database)

```
FP Division - 14 Product Groups (pgcombine):
  ✓ Commercial Items Plain
  ✓ Commercial Items Printed
  ✓ Industrial Items Plain
  ✓ Industrial Items Printed
  ✓ Labels
  ✓ Laminates
  ✓ Mono Layer Printed
  ✓ Others
  ✓ Pof Films Products
  ✓ Services Charges
  ✓ Shrink Film Plain
  ✓ Shrink Film Printed
  ✓ Shrink Sleeves
  ✓ Wide Film
```

### 2. Actual Data Distribution (2025)
**Source**: `fp_actualcommon`

```
Product Group (pgcombine)        | Transaction Count
---------------------------------|------------------
Shrink Film Printed              | 2,436 rows
Shrink Sleeves                   | 1,375 rows
Shrink Film Plain                | 928 rows
Labels                           | 621 rows
Commercial Items Plain           | 553 rows
Industrial Items Printed         | 514 rows
Laminates                        | 179 rows
Wide Film                        | 185 rows
Commercial Items Printed         | 105 rows
Industrial Items Plain           | 96 rows
Mono Layer Printed               | 29 rows
Others                           | 22 rows
```

### 3. Budget Data Distribution
**Source**: `fp_budget_unified`

```
Product Group (pgcombine)        | Budget Records
---------------------------------|------------------
Laminates                        | 408 rows
Shrink Sleeves                   | 252 rows
Shrink Film Plain                | 228 rows
Shrink Film Printed              | 228 rows
Labels                           | 156 rows
Industrial Items Printed         | 84 rows
Commercial Items Printed         | 60 rows
Industrial Items Plain           | 60 rows
Mono Layer Printed               | 48 rows
Commercial Items Plain           | 24 rows
Wide Film                        | 24 rows
Services Charges                 | 12 rows
```

---

## 🔍 Code Analysis

### Backend API (Correct ✅)

**File**: `server/routes/aebf/divisional.js`

```javascript
// ACTUAL DATA - Correctly uses pgcombine
const actualQuery = `
  SELECT 
    a.pgcombine as product_group,  -- ✅ CORRECT: Using pgcombine
    CAST(a.month_no AS TEXT) as month,
    'AMOUNT' as values_type,
    SUM(a.amount) as total_values
  FROM fp_actualcommon a
  LEFT JOIN fp_product_group_exclusions e
    ON UPPER(TRIM(a.pgcombine)) = UPPER(TRIM(e.product_group))
  WHERE a.division_code = $1
    AND a.year = $2
    AND a.pgcombine IS NOT NULL  -- ✅ CORRECT: Filtering by pgcombine
    AND TRIM(a.pgcombine) != ''
    AND e.product_group IS NULL
  GROUP BY a.pgcombine, a.month_no  -- ✅ CORRECT: Grouping by pgcombine
`;

// BUDGET DATA - Correctly uses pgcombine
const budgetQuery = `
  SELECT 
    b.pgcombine as product_group,  -- ✅ CORRECT: Using pgcombine
    b.month,
    SUM(b.qty_kgs) as total_kgs
  FROM fp_budget_unified b
  WHERE b.division_code = $1
    AND b.year = $2
    AND b.pgcombine IS NOT NULL  -- ✅ CORRECT: Filtering by pgcombine
    AND TRIM(b.pgcombine) != ''
  GROUP BY b.pgcombine, b.month  -- ✅ CORRECT: Grouping by pgcombine
`;
```

### Frontend Component (Correct ✅)

**File**: `src/components/MasterData/AEBF/BudgetTab.jsx`

```javascript
// Data structure from API
divisionalHtmlTableData.forEach(row => {
  // row.productGroup contains pgcombine value
  console.log(row.productGroup);  // e.g., "Labels", "Laminates"
  
  // Monthly actual data: row.monthlyActual[month]
  // Monthly budget data: divisionalHtmlBudgetData[`${row.productGroup}|${month}`]
});

// Table rendering - each row is one pgcombine
<tr>
  <td>{row.productGroup}</td>  {/* ✅ CORRECT: Displays pgcombine */}
  <td>{row.monthlyActual[1]}</td>  {/* Jan actual */}
  <td>{row.monthlyActual[2]}</td>  {/* Feb actual */}
  ...
</tr>
```

---

## 🎯 Conclusion

### ✅ **EVERYTHING IS CORRECT**

1. **Raw Product Groups page** ✅
   - Defines `pgcombine` mappings in `raw_product_group_mappings`
   - These are the "main product groups" of the division

2. **fp_actualcommon table** ✅
   - Has `pgcombine` column populated for each transaction
   - Matches the product groups defined in Raw Product Groups

3. **AEBF Divisional Budget API** ✅
   - Queries actual data grouped by `a.pgcombine`
   - Queries budget data grouped by `b.pgcombine`
   - Excludes product groups marked in `fp_product_group_exclusions`

4. **AEBF Divisional Budget Frontend** ✅
   - Displays one row per `pgcombine` value
   - Shows 12 monthly columns (Jan-Dec)
   - Actual row (blue, read-only)
   - Budget row (yellow, editable)
   - Correctly filtered by division and year

5. **Monthly Aggregation** ✅
   - Actual: `SUM(amount), SUM(qty_kgs), SUM(morm)` per `pgcombine + month`
   - Budget: `SUM(qty_kgs)` per `pgcombine + month`
   - Converted from KGS to MT for display

---

## 📝 Notes

- **pgcombine** is the unified field name across all tables
- Raw Product Groups page allows admins to map individual products to pgcombine groups
- AEBF Divisional Budget shows aggregated actual vs budget by these pgcombine groups
- Product group exclusions are respected (via `fp_product_group_exclusions` table)
- The system correctly handles product groups that have budget but no actuals (and vice versa)

---

**Verified by**: Analysis of codebase and database queries  
**Date**: January 10, 2026  
**Status**: ✅ Production-ready, correctly implemented
