# HTML Export - Actual Amount Fix

## Issue
The **Total Actual Amount** row was being calculated from `MT × Price` instead of using the actual Amount data from the database.

## Root Cause
The query to fetch actual sales data only retrieved `KGS` (MT values) but not `AMOUNT` values from the `fp_data_excel` table.

## Solution

### 1. Updated SQL Query to Include Amount (Line 2288-2310)

**Before:**
```sql
SELECT
  TRIM(customername) as customer,
  TRIM(countryname) as country,
  TRIM(productgroup) as productgroup,
  month,
  SUM(CASE WHEN UPPER(values_type) = 'KGS' THEN values ELSE 0 END) / 1000.0 as mt_value
FROM public.fp_data_excel
WHERE ...
```

**After:**
```sql
SELECT
  TRIM(customername) as customer,
  TRIM(countryname) as country,
  TRIM(productgroup) as productgroup,
  month,
  SUM(CASE WHEN UPPER(values_type) = 'KGS' THEN values ELSE 0 END) / 1000.0 as mt_value,
  SUM(CASE WHEN UPPER(values_type) = 'AMOUNT' THEN values ELSE 0 END) as amount_value  -- ✅ ADDED
FROM public.fp_data_excel
WHERE ...
```

### 2. Updated Data Structure to Store Actual Amount (Lines 2329-2356)

**Before:**
```javascript
customerMap[key] = {
  customer: displayCustomerName,
  country: row.country,
  productGroup: row.productgroup,
  monthlyActual: {},  // Only MT values
};
```

**After:**
```javascript
customerMap[key] = {
  customer: displayCustomerName,
  country: row.country,
  productGroup: row.productgroup,
  monthlyActual: {},        // MT values
  monthlyActualAmount: {},  // ✅ ADDED - Amount values from DB
};

// Store both MT and Amount
customerMap[key].monthlyActual[row.month] = existingMtValue + (parseFloat(row.mt_value) || 0);
customerMap[key].monthlyActualAmount[row.month] = existingAmountValue + (parseFloat(row.amount_value) || 0);
```

### 3. Updated Total Calculation to Use Database Amount (Lines 2577-2587)

**Before:**
```javascript
tableData.forEach(row => {
  const productGroup = (row.productGroup || '').toLowerCase();
  const sellingPrice = pricingMap[productGroup] || 0;
  
  for (let month = 1; month <= 12; month++) {
    const mtValue = row.monthlyActual?.[month] || 0;
    monthlyActualTotals[month] += mtValue;
    // ❌ WRONG: Calculating from MT × Price
    monthlyActualAmountTotals[month] += mtValue * 1000 * sellingPrice;
  }
});
```

**After:**
```javascript
tableData.forEach(row => {
  for (let month = 1; month <= 12; month++) {
    const mtValue = row.monthlyActual?.[month] || 0;
    const amountValue = row.monthlyActualAmount?.[month] || 0;  // ✅ From DB
    monthlyActualTotals[month] += mtValue;
    // ✅ CORRECT: Using actual Amount from database
    monthlyActualAmountTotals[month] += amountValue;
  }
});
```

## Complete Footer Structure (After All Fixes)

The HTML export now has **5 footer rows** with correct data sources:

| Row # | Label | Data Source | Calculation |
|-------|-------|-------------|-------------|
| 1 | Total Actual (MT) | Database | Sum of actual KGS ÷ 1000 |
| 2 | **Total Actual Amount (Currency SVG)** | **Database** ✅ | **Sum of actual AMOUNT** |
| 3 | Total Budget (MT) | User Input | Sum of budget MT entries |
| 4 | Total Budget Amount (Currency SVG) | Calculated | Budget MT × 1000 × Price |
| 5 | Total MoRM (Currency SVG) | Calculated | Budget MT × 1000 × MoRM |

## Key Differences

### Actual vs Budget Calculations

**Actual Data (Rows 1-2):**
- ✅ Both MT and Amount come **directly from database**
- ✅ Reflects real sales transactions
- ✅ No calculation needed

**Budget Data (Rows 3-5):**
- ✅ MT comes from user input
- ✅ Amount and MoRM are **calculated** from MT × Pricing
- ✅ Uses pricing table for calculations

## Why This Matters

1. **Accuracy**: Actual Amount reflects real transaction values, not estimated calculations
2. **Price Variations**: Real sales may have different prices than the pricing table (discounts, negotiations, etc.)
3. **Data Integrity**: Preserves the actual financial data from the source system

## Testing Checklist

After server restart, verify:

- [ ] Clear browser cache (Ctrl + Shift + Delete)
- [ ] Hard refresh (Ctrl + Shift + R)
- [ ] Export HTML form
- [ ] Check footer has 5 rows:
  - [ ] Total Actual (MT) - shows actual sales volume
  - [ ] **Total Actual Amount (Currency SVG)** - shows actual revenue from DB ✅
  - [ ] Total Budget (MT) - shows budget volume
  - [ ] Total Budget Amount (Currency SVG) - calculated from budget
  - [ ] Total MoRM (Currency SVG) - calculated margin
- [ ] Verify Actual Amount values match database records
- [ ] Verify Actual Amount ≠ (Actual MT × Price) if there were price variations

## Files Modified

- `server/routes/aebf.js`:
  - Line 2288-2310: Added `amount_value` to SQL query
  - Line 2329-2356: Added `monthlyActualAmount` to data structure
  - Line 2577-2587: Changed to use database Amount instead of calculation

## Related Fixes

1. `HTML_EXPORT_CORRECT_FIX.md` - Footer row order fix
2. `HTML_EXPORT_MORM_ROW_ADDED.md` - MoRM row addition
3. **This document** - Actual Amount from database fix

## Status

✅ **COMPLETE** - Actual Amount now comes from database instead of calculation

---

**Date:** January 2025  
**Modified By:** BLACKBOXAI  
**Issue:** Total Actual Amount was calculated instead of using database values  
**Resolution:** Updated query to fetch AMOUNT, store it, and use it in totals
