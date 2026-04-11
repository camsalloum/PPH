# Sales Rep Budget: Material & Process Lookup Fix

## Issue Identified

The HTML import endpoint for sales rep budgets was using **duplicated inline code** for material/process lookup instead of using the centralized service functions. This created inconsistency between:

1. **Live Submission** (`/save-html-budget`) - Uses centralized `saveLiveSalesRepBudget()` service function
2. **HTML Import** (`/import-budget-html`) - Was using inline lookup code

Both should use the **same lookup logic** by product group.

## Key Insight

**Materials and processes are determined by PRODUCT GROUP ONLY**, not by customer/country combination. The sales rep budget has additional columns (customer, country) compared to divisional budget, but the material/process lookup is still based on product group.

## Changes Made

### 1. Exported Centralized Functions from Service

**File**: `server/services/salesRepBudgetService.js`

Exported the lookup functions to make them reusable:
```javascript
module.exports = {
  saveLiveSalesRepBudget,
  fetchMaterialProcessMap,    // ✅ Now exported
  fetchPricingMap,             // ✅ Now exported  
  normalizeProductGroupKey     // ✅ Now exported
};
```

### 2. Updated HTML Import Endpoint

**File**: `server/routes/aebf.js` - `/import-budget-html` endpoint

**Before** (Lines 5004-5053):
- Inline SQL query for material/process lookup
- Inline SQL query for pricing lookup
- Used `.toLowerCase()` directly (inconsistent normalization)
- Duplicated logic

**After**:
```javascript
// Use centralized lookup functions (same as live submission)
const divisionCode = extractDivisionCode(metadata.division);
const pricingYear = metadata.budgetYear - 1;

const materialProcessMap = await fetchMaterialProcessMap(client, divisionCode);
const pricingMap = await fetchPricingMap(client, metadata.division, divisionCode, pricingYear);
```

**Key improvements**:
- ✅ Uses centralized `fetchMaterialProcessMap()` function
- ✅ Uses centralized `fetchPricingMap()` function
- ✅ Uses centralized `normalizeProductGroupKey()` for consistent normalization
- ✅ Same logic as live submission endpoint
- ✅ Removed code duplication

### 3. Consistent Product Group Normalization

Both endpoints now use `normalizeProductGroupKey()` which:
- Trims whitespace
- Converts to lowercase
- Handles null/undefined safely

This ensures consistent lookup matching even if product group names have slight variations.

## How Materials & Processes Are Added

### For Sales Rep Budgets

1. **Lookup Source**: `{division}_material_percentages` table (e.g., `fp_material_percentages`)
2. **Lookup Key**: Product Group (case-insensitive, normalized)
3. **Applied To**: All 3 records per entry (KGS, Amount, MoRM)
4. **Storage**: `{division}_sales_rep_budget` table

### Lookup Process

```javascript
// 1. Fetch material/process map from material_percentages table
const materialProcessMap = await fetchMaterialProcessMap(client, divisionCode);
// Result: { "flexible packaging": { material: "LDPE", process: "Extrusion" }, ... }

// 2. For each budget record, lookup by product group
const productGroupKey = normalizeProductGroupKey(record.productGroup);
const materialProcess = materialProcessMap[productGroupKey] || { material: '', process: '' };

// 3. Apply to all 3 records (KGS, Amount, MoRM)
// - KGS record: uses materialProcess.material, materialProcess.process
// - Amount record: uses materialProcess.material, materialProcess.process  
// - MoRM record: uses materialProcess.material, materialProcess.process
```

### Important Notes

- **Customer and Country columns** are stored in the budget records but **do NOT affect** material/process lookup
- Material/process is **looked up by product group only**
- Same product group = same material/process, regardless of customer or country
- This is consistent with divisional budgets (which don't have customer/country columns)

## Endpoints Using This Logic

### 1. Live Submission
- **Endpoint**: `POST /api/aebf/save-html-budget`
- **Service**: `saveLiveSalesRepBudget()` 
- **Uses**: `fetchMaterialProcessMap()`, `fetchPricingMap()`, `normalizeProductGroupKey()`

### 2. HTML Import
- **Endpoint**: `POST /api/aebf/import-budget-html`
- **Service**: Now uses `fetchMaterialProcessMap()`, `fetchPricingMap()`, `normalizeProductGroupKey()`
- **Previously**: Inline duplicated code ❌
- **Now**: Centralized functions ✅

### 3. Divisional Budgets
- **Endpoint**: `POST /api/aebf/save-divisional-budget` or `POST /api/aebf/import-divisional-budget-html`
- **Service**: `saveDivisionalBudget()` in `divisionalBudgetService.js`
- **Uses**: Same lookup pattern by product group (no customer/country columns)

## Verification

Both sales rep budget methods now:
- ✅ Use the same material/process lookup function
- ✅ Use the same product group normalization
- ✅ Apply materials/processes to all 3 record types (KGS, Amount, MoRM)
- ✅ Lookup by product group only (customer/country don't affect lookup)

## Files Modified

1. `server/services/salesRepBudgetService.js`
   - Exported `fetchMaterialProcessMap`
   - Exported `fetchPricingMap`
   - Exported `normalizeProductGroupKey`

2. `server/routes/aebf.js`
   - Updated imports to include centralized functions
   - Refactored `/import-budget-html` endpoint to use centralized functions
   - Removed inline duplicate lookup code
   - Updated normalization to use `normalizeProductGroupKey()`

## Testing Recommendations

1. Test HTML import with various product groups
2. Verify materials/processes are correctly populated in database
3. Compare HTML import vs live submission results
4. Test with product groups that have slight name variations (spaces, case differences)








