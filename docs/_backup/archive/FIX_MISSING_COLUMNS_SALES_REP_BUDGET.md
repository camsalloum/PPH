# Fix: Missing Material and Process Columns in Sales Rep Budget Table

## Issue

When importing a sales rep budget via HTML, the following error occurred:

```
❌ Error importing budget HTML: error: column "material" of relation "fp_sales_rep_budget" does not exist
```

## Root Cause

The `fp_sales_rep_budget` table was created with an older schema that didn't include the `material` and `process` columns. These columns are required for the budget import functionality.

## Solution

Added a function `ensureSalesRepBudgetColumns()` that:
1. Checks if the `material` and `process` columns exist in the sales rep budget table
2. Adds them automatically if they're missing
3. Also checks and adds `uploaded_filename` column if missing
4. Only runs once per division (tracked in a Set)

## Implementation

### New Function Added

**Location**: `server/routes/aebf.js` (after line 2086)

```javascript
/**
 * Ensure sales rep budget table has material and process columns
 */
async function ensureSalesRepBudgetColumns(division = 'FP') {
  const divisionCode = (division || 'FP').split('-')[0].toUpperCase();
  const divisionLower = divisionCode.toLowerCase();

  if (salesRepBudgetColumnsVerified.has(divisionCode)) return;

  try {
    const divisionPool = getPoolForDivision(division);
    const tableName = `${divisionLower}_sales_rep_budget`;

    // Check if columns exist and add them if missing
    // ... (adds material, process, uploaded_filename columns)
    
    salesRepBudgetColumnsVerified.add(divisionCode);
    console.log(`✅ Sales rep budget table columns verified for ${divisionCode}`);
  } catch (error) {
    console.error(`⚠️ Error verifying sales rep budget columns for ${divisionCode}:`, error.message);
    // Don't throw - allow query to proceed
  }
}
```

### Integration Points

The function is called automatically before budget imports:

1. **HTML Import Endpoint** (`POST /api/aebf/import-budget-html`)
   - Called before starting the import transaction
   - Ensures columns exist before attempting INSERT

2. **Live Submission Endpoint** (`POST /api/aebf/save-html-budget`)
   - Called before saving the budget
   - Ensures columns exist before attempting INSERT

## Columns Added

The function ensures these columns exist in the table:

1. **`material`** - VARCHAR(255) DEFAULT ''
   - Stores material type (e.g., "PE", "Non PE")
   - Looked up from `{division}_material_percentages` table by product group

2. **`process`** - VARCHAR(255) DEFAULT ''
   - Stores process type (e.g., "Printed", "Unprinted")
   - Looked up from `{division}_material_percentages` table by product group

3. **`uploaded_filename`** - VARCHAR(500)
   - Stores the filename of the uploaded HTML file
   - Used for tracking and audit purposes

## Migration

For existing tables, the function will automatically add the missing columns. The ALTER TABLE statements use `IF NOT EXISTS` to be safe:

```sql
ALTER TABLE public.fp_sales_rep_budget 
ADD COLUMN IF NOT EXISTS material VARCHAR(255) DEFAULT '';

ALTER TABLE public.fp_sales_rep_budget 
ADD COLUMN IF NOT EXISTS process VARCHAR(255) DEFAULT '';

ALTER TABLE public.fp_sales_rep_budget 
ADD COLUMN IF NOT EXISTS uploaded_filename VARCHAR(500);
```

## Testing

To verify the fix:

1. Try importing a sales rep budget HTML file
2. Check server logs for: `✅ Sales rep budget table columns verified for FP`
3. Verify that materials and processes are populated in the database records

## Notes

- The function is idempotent (safe to call multiple times)
- It only checks once per division (cached in Set)
- If column addition fails, it logs a warning but doesn't crash
- This ensures backward compatibility with existing tables

## Related Files

- `server/routes/aebf.js` - Added `ensureSalesRepBudgetColumns()` function
- `server/services/salesRepBudgetService.js` - Uses material/process columns in INSERT queries
- `server/scripts/create-sales-rep-budget-table.sql` - Reference schema with all columns








