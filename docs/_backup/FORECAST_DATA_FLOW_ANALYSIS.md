# Forecast/Estimate Data Flow Analysis & Plan

**Date:** January 12, 2026  
**Status:** Analysis Only (No Changes Made Yet)

---

## 🎯 CURRENT SITUATION: WHERE DO FIGURES COME FROM?

### AEBF Module - 4 Data Sources

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           AEBF Module Structure                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  BudgetTab.jsx (Frontend)                                              │
│  ├─ ActualTab: Shows historical actual data from Oracle                │
│  ├─ EstimateTab: Shows estimate data projection                        │
│  ├─ BudgetTab: Shows approved budget for planning                      │
│  ├─ ForecastTab: Shows forecast for Base +1, +2, +3 years              │
│  └─ PL & Reports                                                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 DATA SOURCE MAPPING

### 1. **ACTUAL DATA** (ActualTab)
**Table:** `fp_actualcommon` (or division_actualcommon)  
**Columns:** 
- `pgcombine` - Product Group
- `admin_division_code` - Denormalized division code (FP, HC, etc.)
- `month_no` - Month number (1-12)
- `amount` - Sales amount
- `qty_kgs` - Quantity in KGS
- `morm` - Margin over raw material
- `year` - Data year

**Flow:**
```
Oracle ERP → Excel Export → import-excel-to-raw-fast.js → fp_raw_data
                                                              ↓
                                                    Trigger: sync_raw_to_actualcommon()
                                                              ↓
                                                       fp_actualcommon
                                                              ↓
                                                       ActualTab displays
```

**Query in divisional.js (lines 108-175):**
```sql
SELECT a.pgcombine, a.month_no, 'AMOUNT'/'KGS'/'MORM', SUM(value)
FROM fp_actualcommon a
LEFT JOIN fp_product_group_exclusions e -- Exclude certain product groups
WHERE admin_division_code = 'FP' AND year = 2025
GROUP BY pgcombine, month_no
```

---

### 2. **ESTIMATE DATA** (EstimateTab / ForecastTab Base)
**API Call:** `/api/product-groups/fp?year=2025&months=[1..12]&type=ESTIMATE`  
**Service:** `ProductGroupDataService.getProductGroupsData()`  
**Query Source:** `vw_unified_sales_data` (NOT fp_actualcommon!)

**THE PROBLEM - Key Distinction:**
- ActualTab queries: `fp_actualcommon` directly
- EstimateTab/ForecastTab query: `vw_unified_sales_data` view (which combines multiple sources)

**Where Estimate Data Comes From:**
```
vw_unified_sales_data combines:
├─ fp_actualcommon (ACTUAL records where type='ACTUAL')
├─ fp_estimate_unified (where type='ESTIMATE')  ← Actually is queried
└─ fp_forecast_unified (where type='FORECAST')  ← If using FORECAST type

ForecastTab.jsx calls:
└─ fetchEstimateData(year) calls:
    └─ GET /api/product-groups/fp?year=2025&months=[1..12]&type=ESTIMATE
        └─ ProductGroupDataService.getProductGroupsData()
            └─ Query vw_unified_sales_data
                WHERE type IN ('ACTUAL', 'ESTIMATE')
                AND year = 2025
```

**The Query (ProductGroupDataService.js, line 104):**
```sql
SELECT INITCAP(LOWER(pg_combine)) as productgroup,
       SUM(CASE WHEN values_type = 'KGS' THEN values::numeric ELSE 0 END) as kgs,
       SUM(CASE WHEN values_type = 'AMOUNT' THEN values::numeric ELSE 0 END) as sales,
       SUM(CASE WHEN values_type = 'MORM' THEN values::numeric ELSE 0 END) as morm
FROM vw_unified_sales_data
WHERE year = 2025 AND month IN (1..12)
      AND UPPER(type) IN ('ACTUAL', 'ESTIMATE')
      AND pg_combine IS NOT NULL
GROUP BY pg_combine
```

---

### 3. **BUDGET DATA** (BudgetTab)
**Table (2025+):** `fp_budget_unified`  
**Table (pre-2025):** `fp_divisional_budget` (for divisional budgets)

**Flow in BudgetTab:**
```
Frontend BudgetTab.jsx
    ↓
fetchDivisionalHtmlTableData()
    ↓
POST /api/aebf/divisional-html-budget-data
    ↓
server/routes/aebf/divisional.js (getDivisionalBudgetInfo)
    ↓
Queries:
├─ Get Actual data from fp_actualcommon (for comparison)
├─ Get Pricing from fp_product_group_master (asp_round, morm_round)
└─ Get Budget data from fp_budget_unified (for budgetYear)
    ↓
Returns:
├─ tableData - Actual data by product group
├─ pricingData - Pricing for calculations
├─ budgetData - Existing budget values
└─ budgetDataDetailed - Stored Amount/MoRM from DB
```

**Budget Query (divisional.js, lines 290-350):**
```sql
SELECT b.pgcombine, b.month_no, 
       SUM(b.qty_kgs) as total_kgs,
       SUM(b.amount) as total_amount,    -- Stored values
       SUM(b.morm) as total_morm         -- Stored values
FROM fp_budget_unified b
WHERE budget_year = 2026 AND division_code = 'FP'
GROUP BY pgcombine, month_no
```

---

### 4. **FORECAST DATA** (ForecastTab Base +1, +2, +3)
**API Calls:**
- Base: `/api/product-groups/fp?year=2025&type=ESTIMATE` → Estimate data
- Base +1: `/api/forecast-sales/FP/2026` → Stored forecast from database
- Base +2, +3: User input (KGS, Sls/Kg, RM/kg)

**Forecast Query (forecastSales.js, line 40-60):**
```sql
SELECT product_group, kgs, sls_per_kg, rm_per_kg, sales, morm_per_kg, morm
FROM fp_forecast_sales
WHERE year = 2026 AND division = 'FP'
ORDER BY product_group
```

---

## 🔴 THE ROOT CAUSE OF 500 ERRORS

**Issue:** ForecastTab.fetchEstimateData() calls `/api/product-groups/fp?year=2025&...&type=ESTIMATE`

**Backend Endpoint:** `server/routes/productGroups.js` → `ProductGroupDataService.getProductGroupsData()`

**What Was Broken:**
```javascript
// Lines 104, 204, 306, 379, 469 in ProductGroupDataService.js
FROM vw_unified_sales_complete  ❌ WRONG VIEW NAME (doesn't exist!)
```

**Should Be:**
```javascript
FROM vw_unified_sales_data  ✅ CORRECT VIEW NAME
```

**Why?** 
- View was renamed in earlier migration but 5 queries still referenced old name
- PostgreSQL throws: "relation 'vw_unified_sales_complete' does not exist"
- HTTP 500 error returned to frontend
- ForecastTab fails to load any data

---

## 📋 COMPLETE DATA FLOW DIAGRAM

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         COMPLETE AEBF DATA FLOW                                  │
└──────────────────────────────────────────────────────────────────────────────────┘

1. ACTUAL DATA PATH
   ─────────────────
   Oracle ERP (HAP111.XL_FPSALESVSCOST_FULL)
        ↓
   Manual Excel Export (FPSALESVSCOST_FULL.xlsx)
        ↓
   /api/fp/sync-oracle-excel (import-excel-to-raw-fast.js)
        ↓
   fp_raw_data (Raw Oracle data, UPPERCASE)
        ↓
   Trigger: after_fp_raw_data_change → sync_raw_to_actualcommon()
        ↓
   fp_actualcommon (Cleaned, INITCAP, with admin_division_code)
        ↓
   BudgetTab → ActualTab displays
   BudgetTab → BudgetTab uses for comparison/calculation
   BudgetTab → DivisionalTab queries this table

2. ESTIMATE DATA PATH
   ──────────────────
   Estimate records (type='ESTIMATE') - stored in vw_unified_sales_data
        ↓
   ForecastTab.fetchEstimateData()
        ↓
   GET /api/product-groups/fp?year=2025&months=[...] &type=ESTIMATE
        ↓
   ProductGroupDataService.getProductGroupsData()
        ↓
   Query vw_unified_sales_data (view combines multiple sources)
        ↓
   ForecastTab displays as "Base" (current year estimate)

3. FORECAST DATA PATH
   ──────────────────
   fp_forecast_sales table (user input or calculated)
        ↓
   ForecastTab.fetchSavedForecast()
        ↓
   GET /api/forecast-sales/FP/2026 (Base +1)
   GET /api/forecast-sales/FP/2027 (Base +2)
   GET /api/forecast-sales/FP/2028 (Base +3)
        ↓
   forecastSales.js routes
        ↓
   ForecastTab displays Forecast years data

4. BUDGET DATA PATH
   ────────────────
   BudgetTab shows divisional budget
        ↓
   POST /api/aebf/divisional-html-budget-data
        ↓
   divisional.js route:
        ├─ Query fp_actualcommon (for actual year display)
        ├─ Query fp_product_group_master (for pricing)
        ├─ Query fp_budget_unified (for stored budget)
        └─ Query fp_product_group_exclusions (to exclude certain PGs)
        ↓
   Returns:
   ├─ tableData (actual by PG for year 2025)
   ├─ pricingData (asp_round, morm_round for calculations)
   ├─ budgetData (stored budget values)
   └─ budgetDataDetailed (stored Amount/MoRM from DB)
        ↓
   BudgetTab processes and displays

5. PRICING DATA PATH
   ─────────────────
   fp_product_group_master table
   ├─ asp_actual, morm_actual (calculated from fp_actualcommon)
   ├─ asp_round, morm_round (user-entered for planning)
   └─ Refreshed nightly via materialized view
        ↓
   divisional.js queries for pricing
        ↓
   Sent to frontend for calculations:
   ├─ Amount = MT × 1000 × asp_round
   └─ MoRM = MT × 1000 × morm_round
```

---

## 🎯 DATA SOURCE TABLES SUMMARY

| Component | Data Source | Table | Key Columns | Purpose |
|-----------|-------------|-------|------------|---------|
| **Actual** | Oracle | `fp_actualcommon` | pgcombine, month_no, amount, qty_kgs, morm, admin_division_code | Historical actual data |
| **Budget** | User Input | `fp_budget_unified` | pgcombine, month_no, qty_kgs, amount, morm, budget_year | Approved budget for planning |
| **Estimate** | System | `vw_unified_sales_data` (view) | pg_combine, month, values_type, values, type | Current year estimate projection |
| **Forecast** | User Input | `fp_forecast_sales` | product_group, year, kgs, sls_per_kg, rm_per_kg, sales, morm | Future years forecast |
| **Pricing** | Calculated | `fp_product_group_master` | product_group, asp_round, morm_round, year | Per-kg pricing for calculations |
| **Exclusions** | Config | `fp_product_group_exclusions` | product_group, division_code | Product groups to exclude from view |

---

## 🔧 WHAT'S ALREADY FIXED (Jan 12)

✅ **ProductGroupDataService.js** - 5 view name references corrected:
- Line 104: `getProductGroupsData()` 
- Line 204: `getMaterialCategoriesData()`
- Line 306: `getProcessCategoriesData()`
- Line 379: `getAllProductGroups()`
- Line 469: Data validation query

All changed from: `vw_unified_sales_complete` → `vw_unified_sales_data`

---

## 📋 UNDERSTANDING THE NEW FLOW - KEY INSIGHTS

### Insight 1: Three Different Data Source Patterns
```
ActualTab:     Queries fp_actualcommon directly
               Uses admin_division_code for filtering
               Excludes services charges via LEFT JOIN

EstimateTab:   Queries vw_unified_sales_data (unified view)
               Includes ACTUAL + ESTIMATE records
               Different filtering logic

BudgetTab:     Combines THREE sources:
               ├─ fp_actualcommon (for actual year display)
               ├─ fp_product_group_master (for pricing)
               └─ fp_budget_unified (for stored budget)
               Uses UPSERT to handle updates
```

### Insight 2: Pricing Calculation Logic
```
For 2025 Budget:
  pricingYear = 2025 (same year - legacy behavior)
  
For 2026+ Budget:
  pricingYear = budgetYear - 1  (use previous year pricing)
  Example: 2026 budget uses 2025 pricing
```

### Insight 3: Budget Year Resolution
```
If user doesn't specify budget year:
  1st choice:  Same year as actual year (if exists)
  2nd choice:  Actual year + 1
  3rd choice:  Latest available budget year
```

### Insight 4: Services Charges Special Handling
```
Services Charges:
  ├─ Excluded from regular product group queries (no KGS)
  ├─ Fetched separately (only AMOUNT + MORM)
  ├─ Displayed in separate row in UI
  └─ No KGS/MT value
```

---

## 🚀 PROPOSED FIX/ENHANCEMENT PLAN

### Phase 1: Verify Fix (DONE ✅)
- [x] Fix ProductGroupDataService.js view references (5 locations)
- [x] Server will auto-reload with node --watch

### Phase 2: Test (PENDING)
1. Reload ForecastTab in browser
2. Check if Estimate data loads without 500 errors
3. Verify forecast years (2027, 2028) data loads
4. Check if all product groups appear

### Phase 3: Investigate Other Issues (IF ANY)
If ForecastTab still has issues after Phase 1-2:
1. Check what actual structure is in `vw_unified_sales_data` view
2. Verify estimate/forecast data actually exists in database
3. Check if view references correct tables
4. May need to add migration to populate estimate data

### Phase 4: Data Consistency Check (OPTIONAL)
1. Compare fp_actualcommon vs vw_unified_sales_data for same year
2. Verify admin_division_code is populated for all divisions
3. Check if forecast years have data or if they're empty

---

## ❓ QUESTIONS FOR YOU

1. **Did the fix work?** Can you reload the Forecast tab and see if the 500 errors are gone?

2. **What happens now when you load Forecast tab?**
   - Does it load estimate data?
   - Do forecast years show data?
   - Are there empty product groups?

3. **Expected behavior for ForecastTab:**
   - Base (2025): Should show estimate data from vw_unified_sales_data
   - Base +1 (2026): Should query fp_forecast_sales table
   - Base +2, +3: User input fields only

4. **Do you see data in:**
   - fp_estimate_unified table?
   - fp_forecast_sales table?
   - Or are they empty and need to be populated?

---

## 📌 KEY TAKEAWAY

The ForecastTab uses a DIFFERENT data flow than ActualTab:
- **ActualTab** → direct query to `fp_actualcommon`
- **ForecastTab (Estimate)** → query to `vw_unified_sales_data` view
- **ForecastTab (Forecast)** → query to `fp_forecast_sales` table

The fix addressed the view name error, but the real question is: **Does the data actually exist in these tables/views?**

