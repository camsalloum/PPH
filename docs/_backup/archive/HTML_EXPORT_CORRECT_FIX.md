# HTML Export Correct Fix - Match Live Version

## Problem Analysis

The exported HTML currently has a DIFFERENT structure than the live version:

### Current Export (WRONG):
- 4 rows per customer:
  1. Actual MT (blue)
  2. Budget MT (yellow)
  3. Actual Amount (green) ← WRONG - should not be here
  4. Budget Amount (light yellow) ← WRONG - should not be here
- Footer: 2 total rows (MT only)

### Live Version (CORRECT):
- 2 rows per customer:
  1. Actual MT (blue)
  2. Budget MT (yellow)
- Footer: 4 total rows:
  1. Total Actual (MT)
  2. Total Budget (MT)
  3. Total Actual (Amount) ← Amount ONLY in footer
  4. Total Budget (Amount) ← Amount ONLY in footer

## Solution

Keep customer rows with ONLY MT data (2 rows), and add Amount calculations to footer totals only.

## Changes Needed

### 1. Keep Customer Rows Simple (2 rows only)
- Row 1: Actual MT (blue) - `rowspan="2"`
- Row 2: Budget MT (yellow)
- NO Amount rows in customer section

### 2. Add Amount Totals to Footer
- Calculate monthly Amount totals: `MT * 1000 * sellingPrice`
- Add 2 new footer rows:
  - Total Actual (Amount) - green background
  - Total Budget (Amount) - light yellow background

### 3. Update Legend
- Remove Amount indicators from legend (only show MT)
- Amount is calculated automatically, not entered by user

## Implementation

The fix should:
1. Remove the 4-row structure from customer rows
2. Keep `rowspan="2"` for customer/country/product columns
3. Calculate Amount totals in footer based on MT totals × pricing
4. Add proper styling for Amount footer rows
5. Remove Amount row CSS from customer rows

This matches the live version exactly where users only enter MT values, and Amount is calculated automatically in the footer.
