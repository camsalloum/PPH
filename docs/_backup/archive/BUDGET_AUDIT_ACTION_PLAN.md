# BUDGET SYSTEM COMPREHENSIVE AUDIT REPORT & ACTION PLAN

## Executive Summary

After a thorough audit of the entire budget flow (HTML Export → Bulk Import → Database Storage → Data Display), I've identified **5 critical issues** that prevent proper data storage and display.

---

## AUDIT FINDINGS

### 1. **Sales Rep Name Case Inconsistency** ⚠️ CRITICAL

**Problem**: Sales rep names are stored with inconsistent casing:
- Christopher Dela Cruz is stored as `"CHRISTOPHER DELA CRUZ"` (ALL CAPS) - from HTML file
- Narek Koroukian is stored as `"Narek Koroukian"` (Proper Case)

**Root Cause**: The HTML export uses `formData.salesRep` which comes from the frontend dropdown. If the user selected value was uppercase, it stays uppercase.

**Impact**: When displaying data in "All Sales Reps" view, names appear inconsistently (some ALL CAPS, some Proper Case).

**Evidence**:
```
[bulk_import] "CHRISTOPHER DELA CRUZ" - ALL CAPS
[bulk_import] "Narek Koroukian" - Mixed Case
[sales_rep_budget] "CHRISTOPHER DELA CRUZ" - ALL CAPS  
[sales_rep_budget] "Narek Koroukian" - Mixed Case
```

---

### 2. **Customer Names Not Matching** ⚠️ CRITICAL

**Problem**: Test customers like "df" and "f" don't exist in actual sales data, so they won't match when the system tries to display budget data.

**Evidence**:
```
"Capricorn Bakery Llcdubai Investments Park" - ✅ EXISTS (18 matches)
"df" - ❌ NOT FOUND (0 matches)
"f" - ❌ NOT FOUND (0 matches)
"Mai Dubai" - ✅ EXISTS (201 matches)
```

**Impact**: Budget-only customers (new customers added in HTML form) should still appear in the frontend table, but the matching logic may fail due to case sensitivity.

---

### 3. **Budget Data Not Showing in Frontend** ⚠️ CRITICAL

**Problem**: The budget query DOES return data (4 records verified), but the frontend may not be displaying it correctly.

**Root Cause Analysis**:
The frontend builds budget keys like: `${row.customer}|${row.country}|${row.productGroup}|${month}`

But it iterates over `response.data.data` (which is the actual sales data). If a budget customer doesn't exist in actual data, the budget won't be displayed.

**However**, the backend DOES add budget-only customers to the data array (lines 2399-2422 in aebf.js), so they should appear.

**Likely Issue**: Case mismatch between:
- Budget: `"CHRISTOPHER DELA CRUZ"|"df"|"Azerbaijan"|"Industrial Items Plain"`  
- Data array: Looking for match with `toLowerCase()` comparison

---

### 4. **Missing Proper Case Normalization in Bulk Import** ⚠️ MEDIUM

**Problem**: When data is saved from HTML files to database, names are saved as-is without normalization.

**Affected Files**:
- `server/routes/aebf.js` - bulk-import endpoint (line 7955)
- `server/routes/aebf.js` - bulk-finalize endpoint (line 8274)

**Current Behavior**:
```javascript
// In bulk-import:
await client.query(`INSERT INTO fp_budget_bulk_import ... VALUES ($1, $2, $3, ...)`,
  [batchId, division, salesRep, ...]);  // salesRep is saved as-is
```

**Expected Behavior**: Should normalize salesRep to Proper Case before saving.

---

### 5. **Budget Display Key Mismatch** ⚠️ MEDIUM

**Problem**: The budgetMap key format may not match how the frontend looks up values.

**Backend builds key** (line 2391):
```javascript
const key = `${budgetCustomer}|${budgetCountry}|${budgetProductGroup}|${row.month}`;
```

**Frontend lookup** (BudgetTab.js line 1238):
```javascript
const key = `${row.customer}|${row.country}|${row.productGroup}|${month}`;
const backendValue = budgetDataFromBackend[key];
```

This SHOULD work if names match exactly, but case sensitivity could cause issues.

---

## ACTION PLAN

### PHASE 1: Fix Name Normalization (High Priority)

#### Task 1.1: Normalize Sales Rep Names in Bulk Import
**File**: `server/routes/aebf.js`
**Lines**: ~7985-8000

```javascript
// ADD: Helper function at top of bulk-import endpoint
const toProperCase = (str) => {
  if (!str) return '';
  return str.toLowerCase().replace(/(?:^|\s|[-/])\w/g, (match) => match.toUpperCase());
};

// CHANGE: Normalize salesRep when processing files
const normalizedSalesRep = toProperCase(salesRep);
// Use normalizedSalesRep in INSERT query
```

#### Task 1.2: Normalize Sales Rep Names in Bulk Finalize
**File**: `server/routes/aebf.js`
**Lines**: ~8295-8340

```javascript
// CHANGE: When inserting to fp_sales_rep_budget
const normalizedSalesRep = toProperCase(record.sales_rep);
// Use normalizedSalesRep in INSERT query
```

#### Task 1.3: Normalize Customer Names
**File**: `server/routes/aebf.js`

Customer names from HTML (like "Capricorn Bakery Llcdubai Investments Park") should also be normalized for consistent display.

---

### PHASE 2: Fix Existing Data in Database

#### Task 2.1: Run Migration Script to Fix Sales Rep Names
```sql
-- Fix sales rep names in fp_sales_rep_budget
UPDATE fp_sales_rep_budget
SET salesrepname = INITCAP(salesrepname)
WHERE salesrepname = UPPER(salesrepname);

-- Fix sales rep names in fp_budget_bulk_import  
UPDATE fp_budget_bulk_import
SET sales_rep = INITCAP(sales_rep)
WHERE sales_rep = UPPER(sales_rep);
```

---

### PHASE 3: Verify Data Display Logic

#### Task 3.1: Debug Budget Data Display
Add console logging to verify:
1. Budget query returns expected data ✅ (verified working)
2. budgetMap is populated correctly
3. Budget-only customers are added to data array
4. Frontend receives and displays budgetMap values

#### Task 3.2: Ensure Case-Insensitive Matching
When adding budget-only customers, the comparison uses `.toLowerCase()` which is correct. But ensure the customerKey split is handled correctly.

---

### PHASE 4: Testing Checklist

1. [ ] Export HTML for a sales rep (Christopher)
2. [ ] Add new customer in HTML form
3. [ ] Save Final
4. [ ] Upload to Bulk Import
5. [ ] Verify data in fp_budget_bulk_import has Proper Case names
6. [ ] Click "Submit to Final"
7. [ ] Verify data in fp_sales_rep_budget has Proper Case names
8. [ ] Go to "All Sales Reps" view
9. [ ] Verify budget values appear in Budget columns
10. [ ] Verify new customers appear in the table

---

## IMMEDIATE FIXES REQUIRED

### Fix 1: Normalize Sales Rep in bulk-import (save to fp_budget_bulk_import)
### Fix 2: Normalize Sales Rep in bulk-finalize (save to fp_sales_rep_budget)
### Fix 3: Run SQL to fix existing data
### Fix 4: Test end-to-end flow

---

## Files to Modify

1. **`server/routes/aebf.js`**:
   - Line ~7985: Add toProperCase in bulk-import
   - Line ~8295: Add toProperCase in bulk-finalize
   
2. **Database**:
   - Run migration to fix existing names

---

## Summary

The core issue is **name normalization inconsistency**. The system stores names exactly as they appear in the HTML file, which depends on how the sales rep was selected in the frontend dropdown. 

The fix is to:
1. Always normalize names to Proper Case when saving to database
2. Fix existing data with a migration script
3. Ensure the display logic handles both cases gracefully

This will ensure all sales rep names and customer names are stored consistently, enabling proper matching and display in the frontend.
