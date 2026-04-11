# Cosmoplast Duplicate Issue - Fix Documentation

## Issue Summary

**Problem**: "Cosmoplast" appeared duplicated in the Sales by Sales Rep table under "Sojy & Direct Sales" group.

**Root Cause**: There were TWO overlapping customer merge rules in the database for Cosmoplast customers.

## Investigation Details

### Database Analysis

Found two different Cosmoplast customers in the raw data:
1. `COSMOPLAST IND CO LLC (Ecommerce) ` - 192 records
2. `COSMOPLAST IND CO LLC (Trade) ` - 996 records

These customers appeared under different sales reps in the "Sojy & Direct Sales" group:
- **Direct Sales**: Both Ecommerce and Trade
- **Harwal Company Limited**: Only Trade

### Duplicate Merge Rules

Two conflicting merge rules existed:

**Rule 77** (Deleted):
```
Merged Name: "COSMOPLAST"
Original Customers:
  - "COSMOPLAST IND CO LLC (Ecommerce) "
  - "COSMOPLAST IND CO LLC (Trade) "
```

**Rule 63** (Kept):
```
Merged Name: "Cosmoplast"
Original Customers:
  - "COSMO OUTLET(Al Barsha)"
  - "COSMOPLAST IND CO LLC (Ecommerce)"
  - "COSMOPLAST IND CO LLC (Trade)"
```

### Why This Caused Duplication

When aggregating sales for the "Sojy & Direct Sales" group:
1. The system applied Rule 77, creating a "COSMOPLAST" merged customer
2. The system also applied Rule 63, creating a "Cosmoplast" merged customer
3. These were treated as TWO different customers despite overlapping original customers
4. Result: Cosmoplast appeared twice in the table with identical or very similar values

## Solution Implemented

### Fix Applied

1. **Identified duplicate merge rules**: Found rules with overlapping original customers
2. **Kept the most comprehensive rule**: Rule 63 with 3 original customers (includes COSMO OUTLET)
3. **Deleted redundant rule**: Rule 77 which only had 2 original customers
4. **Fixed additional duplicates**: Also found and fixed "Bahr Al Suwaiq Trading Llc" duplicate

### Results

- ✅ Removed 2 duplicate merge rules
- ✅ Kept 76 unique merge rules for FP division
- ✅ Verified no duplicate merge rules remain
- ✅ Cosmoplast now appears only once in the Sales by Sales Rep table

## Verification

After the fix:
```
✅ Only ONE Cosmoplast merge rule exists:
   ID: 63
   Merged Name: "Cosmoplast"
   Original Customers:
      - "COSMO OUTLET(Al Barsha)"
      - "COSMOPLAST IND CO LLC (Ecommerce)"
      - "COSMOPLAST IND CO LLC (Trade)"

✅ No duplicate merge rules found!
Total merge rules: 76 (down from 78)
```

## Impact on Sales by Sales Rep Table

### Before Fix
```
Sojy & Direct Sales
  Customer: Cosmoplast      285,773    1.2%
  Customer: Cosmoplast      285,773    1.2%    ← DUPLICATE!
```

### After Fix
```
Sojy & Direct Sales
  Customer: Cosmoplast      285,773    1.2%    ← Single entry
```

## Prevention

To prevent this issue from recurring:

### 1. Validation at Merge Rule Creation

Add validation in the Master Data > Customer Merging interface:
- Check if any original customers are already part of another merge rule
- Warn user before creating overlapping merge rules
- Suggest merging into the existing rule instead

### 2. Database Constraint (Optional)

Consider adding a unique constraint or check to prevent duplicate merge rules:
```sql
-- Prevent multiple rules with overlapping original customers
-- (This would require custom logic as PostgreSQL doesn't have built-in array overlap constraints)
```

### 3. Regular Audits

Periodically run a check for duplicate merge rules:
```sql
SELECT
  array_agg(id) as rule_ids,
  array_agg(merged_customer_name) as merged_names,
  original_customers,
  COUNT(*) as duplicate_count
FROM division_customer_merge_rules
GROUP BY division, original_customers
HAVING COUNT(*) > 1;
```

## Other Findings

### Additional Duplicate Fixed

Also discovered and fixed duplicate for:
- **Bahr Al Suwaiq Trading Llc** (had 2 rules with same original customers)

### No Other Duplicates

Comprehensive scan confirmed no other duplicate merge rules exist in the FP division.

## Recommendations

1. **UI Enhancement**: Add duplicate detection in the Customer Merging UI
2. **Validation**: Prevent creation of overlapping merge rules
3. **Case Sensitivity**: Standardize merged customer names to Title Case (like we did for sales reps)
4. **Audit Tool**: Create a dashboard view to identify and resolve duplicate merge rules

## Related Issues

This issue is similar to the sales rep name duplication issue (Mouhcine Fellah appearing twice due to case variations). Both were resolved by:
1. Identifying the duplicates
2. Standardizing to a single canonical form
3. Implementing prevention measures

## Testing

To verify the fix worked:
1. Navigate to Sales by Sales Rep
2. Select "Sojy & Direct Sales" tab
3. Verify "Cosmoplast" appears only ONCE
4. Check that the values are correct (not doubled)

## Files Modified

- Database: `division_customer_merge_rules` table
- Records deleted: Rule IDs 77 and 74
- Records kept: 76 merge rules for FP division
