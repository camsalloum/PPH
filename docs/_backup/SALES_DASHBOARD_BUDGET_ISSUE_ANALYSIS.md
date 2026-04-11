# Sales Dashboard Budget Issue - FIXED

**Date:** February 4, 2026  
**Issue:** Budget 2026 not appearing in Sales Dashboard KPI Summary for "Riad & Nidal" Q1 2026  
**Status:** ✅ FIXED

---

## Problem Summary

When viewing **Q1 2026** period in Sales Dashboard:
- ❌ Budget Achievement showed "No budget" 
- ✅ Expected: Show Q1 2026 Budget vs Q1 2026 Actual

---

## Root Cause

**File:** `src/components/reports/SalesRepReport.jsx` (line 517)

The code was **incorrectly looking for a FULL YEAR budget column** instead of matching the selected period:

```javascript
// OLD CODE (WRONG):
// Find the index of the full-year budget column for the same year
const yearBudgetIndex = columnOrder.findIndex(col => {
  const isBudget = normalizedType === 'BUDGET';
  const sameYear = col.year === basePeriod.year;
  const isYearByMonth = ['year', 'fy'].includes(col.month.toLowerCase());
  const isFullRange = Array.isArray(col.months) && col.months.length >= 12;
  return isBudget && sameYear && (isYearByMonth || isFullRange);
});
```

**Problem:** When viewing Q1 2026:
- `basePeriod` = Q1 2026 (months: [1,2,3])
- Code looked for budget with 12+ months or month='year'
- Q1 Budget column (months: [1,2,3]) didn't match
- Result: `yearBudgetIndex = -1` → "No budget"

---

## Solution Applied

**Changed logic to:**
1. **First:** Look for budget column matching the SAME PERIOD (Q1, Q2, etc.)
2. **Fallback:** If no matching period found, use full-year budget

```javascript
// NEW CODE (CORRECT):
// Find budget column that matches the current period
let yearBudgetIndex = columnOrder.findIndex(col => {
  const isBudget = normalizedType === 'BUDGET';
  const sameYear = col.year === basePeriod.year;
  
  // Check if it's the same period
  const samePeriod = col.month === basePeriod.month;
  
  // Check if months arrays match
  const sameMonths = Array.isArray(col.months) && Array.isArray(basePeriod.months) &&
    col.months.length === basePeriod.months.length &&
    col.months.every((m, i) => m === basePeriod.months[i]);
  
  return isBudget && sameYear && (samePeriod || sameMonths);
});

// Fallback to full-year budget if no matching period
if (yearBudgetIndex === -1) {
  yearBudgetIndex = columnOrder.findIndex(col => {
    // ... full year logic ...
  });
}
```

---

## Expected Behavior Now

### Q1 2026 Selected:
- ✅ Shows: **Q1 2026 Budget Achievement** = (Q1 Actual / Q1 Budget) × 100%
- ✅ Aggregates: Jan + Feb + Mar (months 1,2,3)

### Q2 2026 Selected:
- ✅ Shows: **Q2 2026 Budget Achievement** = (Q2 Actual / Q2 Budget) × 100%
- ✅ Aggregates: Apr + May + Jun (months 4,5,6)

### Full Year 2026 Selected:
- ✅ Shows: **FY 2026 Budget Achievement** = (FY Actual / FY Budget) × 100%
- ✅ Aggregates: All 12 months

---

## Database Query (Unchanged)

**Table:** `fp_budget_unified`

**Filters:**
```sql
WHERE division_code = 'FP'
  AND budget_year = 2026
  AND budget_type = 'SALES_REP'
  AND sales_rep_group_name = 'Riad & Nidal'
  AND is_budget = true
  AND month_no IN (1, 2, 3)  -- For Q1
```

The database query was already correct - it aggregates based on the period's months. The bug was only in the **column detection logic** in the frontend.

---

## Testing

To verify the fix works:
1. Open Sales Dashboard
2. Select "Riad & Nidal" sales rep
3. Select "Q1 2026" period
4. Check KPI Summary section
5. ✅ Should now show budget achievement percentage (not "No budget")

---

## What is "fp-pl"?

**fp-pl = FlexPack Profit & Loss**
- `PLDataContext.jsx` provides P&L financial data
- Used in divisional dashboards
- NOT related to this sales dashboard budget issue