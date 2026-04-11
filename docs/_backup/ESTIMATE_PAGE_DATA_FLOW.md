# ESTIMATE PAGE DATA FLOW ANALYSIS

**Date:** January 12, 2026

---

## 🎯 THE ISSUE YOU REPORTED

"Some years are showing estimate where already full year available data."

Example from screenshot:
- 2025 FY Estimate - Shows as "Estimate" but 2025 should have ACTUAL data
- 2024, 2023, 2022, 2021, 2020, 2019 - All showing as FY Estimate

**The Question:** Which table is this page linked to?

---

## 📊 ANSWER: DATA SOURCES & FLOW

### The Main Table: `fp_data_excel`

**NOT `fp_actualcommon`!**

The Estimate page queries **`fp_data_excel`** table directly!

```
Estimate Page (EstimateTab.jsx)
    ↓
API: GET /api/aebf/actual?division=FP&types=Actual,Estimate
    ↓
Route: server/routes/aebf/actual.js
    ↓
Query Table: fp_data_excel
    ↓
Filter: WHERE division='FP' AND type IN ('Actual', 'Estimate')
```

### Table Structure of `fp_data_excel`

This is a **UNIFIED TABLE** that stores BOTH Actual AND Estimate data!

**Key Columns:**
```
id              - Unique record ID
division        - Division code (FP, HC, etc.)
year            - Year (2019-2026)
month           - Month number (1-12)
type            - 'Actual' OR 'Estimate' ← THIS IS THE KEY!
salesrepname    - Sales rep name
customername    - Customer name
countryname     - Country name
productgroup    - Product group
values_type     - 'AMOUNT', 'KGS', or 'MORM'
values          - The numerical value
sourcesheet     - 'Oracle', 'Calculated', etc.
uploaded_by     - User who uploaded/calculated
updated_at      - Last update timestamp
```

---

## 🔄 HOW ESTIMATE DATA GETS INTO `fp_data_excel`

### Step 1: User Clicks "Create Estimate"

In EstimateTab.jsx, user selects:
- Year (e.g., 2026)
- Months to estimate (e.g., [7, 8, 9, 10, 11, 12])
- (Optional) Custom percentage override

### Step 2: System Calculates Estimate

Backend route: `POST /api/aebf/calculate-estimate`

```javascript
// budget.js line 424-525
// 1. Get actual data from base period months
//    Example: Months [1,2,3,4,5,6] contain actual data
// 2. Calculate total by dimension (salesrep, customer, country, product group)
// 3. Calculate proportion for each dimension
// 4. Apply proportion to full-year estimate total
```

**Example:**
```
Base Period: Months 1-6 (Jan-Jun) = ACTUAL data
- Total AMOUNT in base period = 1,000,000 AED
- Commercial Items Plain AMOUNT = 200,000 AED (20% of total)
- Proportion = 200,000 / 1,000,000 = 0.2 (20%)

Estimate Year: 2026 (Months 7-12)
- User enters: 2,000,000 AED for full year estimate
- Commercial Items Plain estimate = 2,000,000 × 0.2 = 400,000 AED
```

### Step 3: System Saves Estimate to `fp_data_excel`

Backend route: `POST /api/aebf/save-estimate`

```javascript
// budget.js line 535-650
// 1. Delete existing estimate records for year + selected months
// 2. Insert new calculated estimate records
// 3. SET type = 'Estimate' for all inserted records
```

**SQL INSERT Example:**
```sql
INSERT INTO fp_data_excel (
  division, year, month, type, salesrepname, customername, 
  countryname, productgroup, values_type, values, uploaded_by
) VALUES 
  ('FP', 2026, 7, 'Estimate', 'John Doe', 'ABC Beverages',
   'United Arab Emirates', 'Commercial Items Plain', 'AMOUNT', 400000, 'admin@company.com'),
  ('FP', 2026, 7, 'Estimate', 'John Doe', 'ABC Beverages',
   'United Arab Emirates', 'Commercial Items Plain', 'KGS', 50000, 'admin@company.com'),
  ('FP', 2026, 7, 'Estimate', 'John Doe', 'ABC Beverages',
   'United Arab Emirates', 'Commercial Items Plain', 'MORM', 200000, 'admin@company.com'),
  ...
```

---

## 🔴 THE ROOT PROBLEM: Why "2025 FY Estimate" shows as Estimate when it has full year actual data

### Issue Diagnosis

The EstimateTab displays data from `fp_data_excel` where:

```
SELECT type, COUNT(*) as count, MIN(month), MAX(month), COUNT(DISTINCT month) as distinct_months
FROM fp_data_excel
WHERE division = 'FP' AND year = 2025
GROUP BY type;
```

**Possible Scenarios:**

1. **Scenario A: Mixed data in same year**
   ```
   type     | count | min_month | max_month | distinct_months
   ──────────────────────────────────────────────────────────
   Actual   | 8000  |    1      |    12     |      12        (All 12 months actual)
   Estimate | 2400  |    1      |    12     |      12        (Also all 12 months estimate)
   ```
   **Problem:** Both exist! System is showing the `type='Estimate'` records instead of `type='Actual'`

2. **Scenario B: Only Estimate in database**
   ```
   type     | count | min_month | max_month | distinct_months
   ──────────────────────────────────────────────────────────
   Estimate | 8400  |    1      |    12     |      12        (All 12 months)
   ```
   **Problem:** Actual data was deleted or never inserted into `fp_data_excel`

3. **Scenario C: Incomplete coverage**
   ```
   type     | count | min_month | max_month | distinct_months
   ──────────────────────────────────────────────────────────
   Actual   | 2000  |    1      |    6      |      6         (Only Jan-Jun)
   Estimate | 6400  |    7      |    12     |      6         (Only Jul-Dec estimate)
   ```
   **Problem:** Only first 6 months are actual; rest are estimate (which is normal)

---

## 📊 DATA FLOW COMPARISON

### For ActualTab (Shows actual data)
```
Oracle ERP (HAP111.XL_FPSALESVSCOST_FULL)
    ↓ (Manual Excel export)
Excel File (FPSALESVSCOST_FULL.xlsx)
    ↓ (Upload)
POST /api/fp/sync-oracle-excel
    ↓ (import-excel-to-raw-fast.js)
fp_raw_data (Raw Oracle records)
    ↓ (Trigger: sync_raw_to_actualcommon)
fp_actualcommon (Cleaned, transformed)
    ↓ (Also imported to fp_data_excel)
fp_data_excel with type='Actual'
    ↓ (Query for display)
ActualTab shows complete 12 months
```

### For EstimateTab (Shows both actual + estimate)
```
Calculated from Actual base period (Months 1-6)
    ↓ (User selects estimate months: 7-12)
POST /api/aebf/calculate-estimate
    ↓ (System calculates by dimension + proportion)
Calculated data
    ↓ (User approves)
POST /api/aebf/save-estimate
    ↓ (Insert with type='Estimate')
fp_data_excel with type='Estimate'
    ↓ (Query for display - BOTH Actual+Estimate)
EstimateTab shows: months 1-6 (Actual) + 7-12 (Estimate)
```

---

## 🎯 THE REAL ISSUE: Query Logic

The EstimateTab query does:

```javascript
// EstimateTab.jsx line 120
const params = {
  division: selectedDivision,
  types: 'Actual,Estimate',  // ← Fetch BOTH types!
  year: selectedYear
};
GET /api/aebf/actual?division=FP&types=Actual,Estimate&year=2025
```

Backend converts to SQL:

```sql
SELECT * FROM fp_data_excel
WHERE division = 'FP' 
  AND year = 2025 
  AND type IN ('Actual', 'Estimate')  -- ← Gets BOTH!
```

**Problem:** If both exist for the same month, which one does the frontend display?

Looking at EstimateTab.jsx line 116-135:
```jsx
// Fetch data for "Estimate" page
const fetchData = async (page = 1, pageSize = 50, searchFilter = null) => {
  const params = {
    division: selectedDivision,
    types: 'Actual,Estimate',  // Fetch both Actual and Estimate data
    ...
  };
  
  const response = await axios.get('http://localhost:3001/api/aebf/actual', { params });
  // Returns mixed Actual + Estimate records
  // Frontend doesn't distinguish - just displays all
};
```

---

## 🔧 THE REAL DATA FLOW ISSUE

**Question: Why does 2025 show "FY Estimate" when it has full year actual data?**

**Answer depends on what's in the database:**

### Query to verify:
```sql
-- Check what data exists for 2025
SELECT 
  type,
  COUNT(*) as record_count,
  COUNT(DISTINCT month) as months_with_data,
  MIN(month) as first_month,
  MAX(month) as last_month,
  ARRAY_AGG(DISTINCT month ORDER BY month) as months
FROM fp_data_excel
WHERE division = 'FP' AND year = 2025
GROUP BY type
ORDER BY type;
```

**Expected Result (for full year actual):**
```
type    | record_count | months_with_data | first_month | last_month | months
────────────────────────────────────────────────────────────────────────────
Actual  | 8400         | 12               | 1           | 12         | [1..12]
```

**Actual Result (if showing as estimate):**
```
type    | record_count | months_with_data | first_month | last_month | months
────────────────────────────────────────────────────────────────────────────
Actual  | 0            | 0                | NULL        | NULL       | NULL
Estimate| 8400         | 12               | 1           | 12         | [1..12]
```

---

## ✅ SUMMARY TABLE

| Component | Table | Where Actual Comes From | Where Estimate Comes From |
|-----------|-------|------------------------|--------------------------|
| ActualTab | fp_data_excel | Oracle via import | N/A (not shown) |
| EstimateTab | fp_data_excel | Oracle via import | Calculated + user-approved |
| BudgetTab | fp_data_excel + fp_budget_unified | Oracle + user input | N/A |
| ForecastTab | vw_unified_sales_data + fp_forecast_sales | View + user input | User input |

---

## 🎯 YOUR NEXT STEPS

1. **Verify data in database:**
   ```sql
   SELECT type, COUNT(*), COUNT(DISTINCT month), COUNT(DISTINCT year)
   FROM fp_data_excel
   WHERE division = 'FP'
   GROUP BY type
   ORDER BY type;
   ```

2. **Check specific year 2025:**
   ```sql
   SELECT type, month, COUNT(*) as records
   FROM fp_data_excel
   WHERE division = 'FP' AND year = 2025
   GROUP BY type, month
   ORDER BY type, month;
   ```

3. **Check if Oracle data is in table:**
   ```sql
   SELECT COUNT(*), type, sourcesheet
   FROM fp_data_excel
   WHERE division = 'FP' AND year = 2025
   GROUP BY type, sourcesheet;
   ```

4. **Check if 2025 was imported to fp_data_excel:**
   - Oracle import goes to fp_raw_data → fp_actualcommon → **Is it also inserted to fp_data_excel?**

---

## 🚨 CRITICAL QUESTION FOR YOU

**Is the Oracle data (from the import script) being inserted into BOTH tables?**

1. `fp_actualcommon` ← For divisional data
2. `fp_data_excel` ← For AEBF page data (Actual/Estimate/Budget/Forecast)

**Or is there a missing migration/trigger** that copies data from fp_actualcommon → fp_data_excel?

This is the key to understanding why the EstimateTab shows "Estimate" when full year actual should be available!

