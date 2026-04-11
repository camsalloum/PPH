# Budget 2026 Bug Fixes Recap - January 28, 2026

## Overview

This document summarizes all bugs identified and fixed during the Budget 2026 workflow debugging session on January 28, 2026.

---

## Bug #1: Sales Rep Name vs Sales Rep Group Name Confusion

### Problem
Queries for budget data were using `sales_rep_name` column, but in `fp_budget_unified` table:
- `sales_rep_name` column is **EMPTY** (no data)
- `sales_rep_group_name` column contains the actual sales rep/group names

This caused budget data to not appear in the UI when filtering by sales rep.

### Root Cause
Budget data is stored with group names in `sales_rep_group_name`, not individual names in `sales_rep_name`. The queries were filtering on the wrong column.

### Database Schema Reality
| Table | sales_rep_name | sales_rep_group_name |
|-------|---------------|---------------------|
| `fp_actualcommon` | Has individual names | Has group names |
| `fp_budget_unified` | **EMPTY** | Has group names |

### Fix Applied
Updated all budget queries in `server/database/UniversalSalesByCountryService.js` to use `sales_rep_group_name` instead of `sales_rep_name`:

**Before:**
```sql
WHERE UPPER(sales_rep_name) = UPPER($1)
```

**After:**
```sql
WHERE UPPER(sales_rep_group_name) = UPPER($1)
```

### Files Modified
- `server/database/UniversalSalesByCountryService.js` - Multiple query functions

---

## Bug #2: Budget Type Filter Using Wrong Value

### Problem
Budget queries were filtering by `budget_type = 'BUDGET'` but the actual data uses `budget_type = 'SALES_REP'`.

### Root Cause
When sales rep budgets are imported via HTML import, they are stored with `budget_type = 'SALES_REP'`, not `'BUDGET'`.

### Budget Type Values in Database
| budget_type | Description |
|-------------|-------------|
| `SALES_REP` | Sales rep individual budgets (from HTML import) |
| `ESTIMATE` | Estimate data |
| `BULK_IMPORT` | Management allocation data |

### Fix Applied
Updated budget queries to filter by correct budget_type:

**Before:**
```sql
WHERE UPPER(budget_type) = 'BUDGET'
```

**After:**
```sql
WHERE UPPER(budget_type) = 'SALES_REP'
```

### Files Modified
- `server/database/UniversalSalesByCountryService.js` - Budget query functions

---

## Bug #3: Duplicate Customers in UI (Case Sensitivity Issue)

### Problem
Same customers appeared twice in the Sales Dashboard UI:
- "Kabour Brothers (Hermanos)" - from ACTUAL data
- "Kabour Brothers (hermanos)" - from BUDGET data

- "Al Manhal Water Factory, W.L.L" - from ACTUAL data  
- "Al Manhal Water Factory, W.l.l" - from BUDGET data

### Root Cause Analysis

#### Data Flow Investigation
```
Oracle ERP: "KABOUR BROTHERS (HERMANOS)" (ALL CAPS)
    ↓
fp_raw_oracle: "KABOUR BROTHERS (HERMANOS)"
    ↓ (INITCAP transformation)
fp_actualcommon: "Kabour Brothers (Hermanos)" ✅
    ↓
HTML Export: "Kabour Brothers (Hermanos)" ✅
    ↓ (sales rep adds budget numbers)
HTML Import: "Kabour Brothers (Hermanos)" ✅
    ↓ (toProperCase function applied - BUG!)
fp_budget_unified: "Kabour Brothers (hermanos)" ❌
```

#### The Bug: `toProperCase` Function
The `toProperCase` function had a faulty regex that didn't capitalize after parentheses `(` or periods `.`:

**Buggy Code:**
```javascript
const toProperCase = (str) => {
  if (!str) return '';
  return str.toLowerCase().replace(/(?:^|\s|[-/])\w/g, (match) => match.toUpperCase());
};
```

This regex only capitalizes after:
- Start of string `^`
- Whitespace `\s`
- Hyphen or slash `[-/]`

**Missing:** Parentheses `(` and periods `.`

So:
- `"Kabour Brothers (Hermanos)"` → lowercase → `"kabour brothers (hermanos)"` → regex → `"Kabour Brothers (hermanos)"` ❌
- `"Al Manhal Water Factory, W.L.L"` → lowercase → `"al manhal water factory, w.l.l"` → regex → `"Al Manhal Water Factory, W.l.l"` ❌

### Fix Applied

#### Solution A (Initial): Fixed the regex
Added `(` and `.` to the character class:
```javascript
.replace(/(?:^|\s|[-/(.])\w/g, (match) => match.toUpperCase());
```

#### Solution B (Final - Cleaner): Removed unnecessary transformation
Since the data from HTML export is already correctly normalized from `fp_actualcommon`, there's no need to re-transform it. Changed to just trim whitespace:

**Before:**
```javascript
const normalizedCustomer = toProperCase(record.customer);
const normalizedCountry = toProperCase(record.country);
const normalizedProductGroup = toProperCase(record.productGroup);
```

**After:**
```javascript
// Trust the data from export - it's already normalized from fp_actualcommon
const customerName = (record.customer || '').trim();
const countryName = (record.country || '').trim();
const productGroupName = (record.productGroup || '').trim();
```

### Database Fix
Corrected existing incorrect data:
```sql
UPDATE fp_budget_unified 
SET customer_name = 'Kabour Brothers (Hermanos)'
WHERE LOWER(customer_name) = LOWER('Kabour Brothers (hermanos)');
-- Fixed 5 rows

UPDATE fp_budget_unified 
SET customer_name = 'Al Manhal Water Factory, W.L.L'
WHERE LOWER(customer_name) = LOWER('Al Manhal Water Factory, W.l.l');
-- Fixed 3 rows
```

### Additional Safety: Query-Level Normalization
Also added `INITCAP(LOWER(...))` to all customer name SELECT queries as a safety measure to ensure consistent display regardless of stored case:

```sql
SELECT INITCAP(LOWER(MIN(TRIM(customer_name)))) as customername
```

### Files Modified
- `server/services/salesRepBudgetService.js` - Removed toProperCase for import data
- `server/database/UniversalSalesByCountryService.js` - Added INITCAP normalization to queries
- `server/utils/normalization.js` - Fixed toProperCase regex (for other uses)
- `server/utils/salesRepHtmlExport.js` - Fixed toProperCase regex
- `server/utils/salesRepHtmlExport_v1.js` - Fixed toProperCase regex
- `server/utils/managementAllocationHtmlExport.js` - Fixed toProperCase regex

---

## Summary of All Changes

### Database Changes
| Change | Rows Affected |
|--------|---------------|
| Fixed "Kabour Brothers (hermanos)" → "Kabour Brothers (Hermanos)" | 5 rows |
| Fixed "Al Manhal Water Factory, W.l.l" → "Al Manhal Water Factory, W.L.L" | 3 rows |

### Code Changes

#### `server/database/UniversalSalesByCountryService.js`
- Changed `sales_rep_name` → `sales_rep_group_name` for budget queries
- Changed `budget_type = 'BUDGET'` → `budget_type = 'SALES_REP'`
- Added `INITCAP(LOWER(MIN(TRIM(customer_name))))` for consistent customer name display

#### `server/services/salesRepBudgetService.js`
- Removed `toProperCase()` transformation for customer/country/product group during import
- Now trusts data from export (already normalized from fp_actualcommon)

#### `server/utils/*.js` (Multiple files)
- Fixed `toProperCase` regex to handle parentheses and periods (for other use cases)

---

## Key Learnings

### 1. Column Naming Matters
`fp_budget_unified` uses `sales_rep_group_name` for all sales rep data, while `fp_actualcommon` has both `sales_rep_name` (individual) and `sales_rep_group_name` (group). Always verify which column contains data.

### 2. Don't Over-Normalize
Data that's already normalized shouldn't be re-normalized. The HTML export uses data from `fp_actualcommon` which is already correct - re-applying `toProperCase` during import caused case inconsistencies.

### 3. PostgreSQL INITCAP vs JavaScript toProperCase
PostgreSQL's `INITCAP` capitalizes after ANY non-alphanumeric character. JavaScript's custom `toProperCase` only handled specific characters. For consistency, either:
- Use SQL-level normalization with `INITCAP`
- Or trust already-normalized data and don't re-transform

### 4. Budget Type Values
The `budget_type` column in `fp_budget_unified` uses specific values:
- `'SALES_REP'` - Not `'BUDGET'`
- `'ESTIMATE'` - Estimate data
- `'BULK_IMPORT'` - Management allocation

---

## Testing Verification

After fixes, the Sales Dashboard should show:
- ✅ No duplicate customers
- ✅ Budget data appearing for selected sales reps
- ✅ Correct totals matching between Product Groups and Customers tabs
- ✅ Customer names matching between ACTUAL and BUDGET columns

---

## Related Documentation
- `PROJECT_CONTEXT.md` - Main project context
- `docs/BUDGET-UNIFIED-MIGRATION-RECAP.md` - Budget table structure
- `docs/AI_LEARNING_DIVISIONAL_SALESREP_CUSTOMER_PRODUCTGROUP.md` - Data relationships

---

*Document created: January 28, 2026*
*Author: Development Team*
