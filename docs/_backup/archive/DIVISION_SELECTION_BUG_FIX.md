# Division Selection Bug - Fixed ✅

## Issue Found
The user correctly identified an inconsistency in how division selection was handled across the Customer Performance Analysis components.

## Problem Description

### What Should Happen:
When a user selects a division (FP, BE, SB, TF, HCM) in the dashboard, **all components** should use that selected division to fetch data.

### What Was Actually Happening:
❌ **Inconsistent behavior** - Some components respected the division selection, others were hardcoded to 'FP':

| Component | Before Fix | After Fix |
|-----------|------------|-----------|
| `PerformanceDashboard.js` | ✅ Uses `selectedDivision` | ✅ No change needed |
| `CustomersAmountTable.js` | ✅ Uses `selectedDivision` | ✅ No change needed |
| **`CustomersKgsTable.js`** | ❌ **Hardcoded 'FP'** | ✅ **Now uses `selectedDivision`** |
| **`CustomerKeyFactsNew.js`** | ❌ **Hardcoded 'FP'** | ✅ **Now uses `selectedDivision`** |

## Bug Impact

### Before Fix:
If you selected **BE division** in the dashboard:
- ✅ Amount table would show BE data correctly
- ❌ KGS table would still show FP data (wrong!)
- ❌ Customer Key Facts would analyze FP data (wrong!)
- ❌ Merge rules would be fetched for FP, not BE (wrong!)

**Result**: Inconsistent and confusing data - KGS and Amount wouldn't match!

### After Fix:
If you select **BE division** in the dashboard:
- ✅ Amount table shows BE data
- ✅ KGS table shows BE data
- ✅ Customer Key Facts analyzes BE data
- ✅ Merge rules are fetched for BE division

**Result**: All data is consistent and correct! ✨

---

## Technical Changes Made

### 1. `CustomersKgsTable.js` (3 changes)

#### Change 1: Import `useExcelData` context
```javascript
// Added:
import { useExcelData } from '../../contexts/ExcelDataContext';

// In component:
const { selectedDivision } = useExcelData();
```

#### Change 2: Use `selectedDivision` in API call
```javascript
// Before:
division: 'FP', // Currently only FP division is supported

// After:
division: selectedDivision || 'FP',
```

#### Change 3: Use `selectedDivision` in merge rules
```javascript
// Before:
const { customers: mergedCustomers } = await applySavedMergeRules(rep, 'FP', allCustomers, extendedColumns);

// After:
const { customers: mergedCustomers } = await applySavedMergeRules(rep, selectedDivision || 'FP', allCustomers, extendedColumns);
```

#### Change 4: Update useEffect dependencies
```javascript
// Before:
}, [rep, columnOrder]);
}, [customerData, rep, columnOrder]);

// After:
}, [rep, columnOrder, selectedDivision]);
}, [customerData, rep, columnOrder, selectedDivision]);
```

---

### 2. `CustomerKeyFactsNew.js` (6 changes)

#### Change 1: Import `useExcelData` context
```javascript
// Added:
import { useExcelData } from '../../contexts/ExcelDataContext';

// In component:
const { selectedDivision } = useExcelData();
```

#### Change 2: Update `fetchCustomerSalesForColumn` function signature
```javascript
// Before:
const fetchCustomerSalesForColumn = async (rep, column, dataTypeOverride) => {
  // ...
  division: 'FP',
  // ...
};

// After:
const fetchCustomerSalesForColumn = async (rep, column, dataTypeOverride, division) => {
  // ...
  division: division || 'FP',
  // ...
};
```

#### Change 3: Update `buildRowsFromApi` function signature
```javascript
// Before:
const buildRowsFromApi = async (rep, columnOrder, dataType = 'Actual') => {
  // ...
  const data = await fetchCustomerSalesForColumn(rep, col, dataType);
  // ...
};

// After:
const buildRowsFromApi = async (rep, columnOrder, dataType = 'Actual', division) => {
  // ...
  const data = await fetchCustomerSalesForColumn(rep, col, dataType, division);
  // ...
};
```

#### Change 4: Remove fallback in `applySavedMergeRules` fetch
```javascript
// Before:
`http://localhost:3001/api/division-merge-rules/rules?division=${encodeURIComponent(division || 'FP')}`

// After:
`http://localhost:3001/api/division-merge-rules/rules?division=${encodeURIComponent(division)}`
```

#### Change 5: Update fallback API calls to use `selectedDivision`
```javascript
// Before:
const apiRows = await buildRowsFromApi(rep, columnOrder, 'Actual');
const merged = await applySavedMergeRules(rep, 'FP', apiRows);

// After:
const apiRows = await buildRowsFromApi(rep, columnOrder, 'Actual', selectedDivision);
const merged = await applySavedMergeRules(rep, selectedDivision || 'FP', apiRows);
```

#### Change 6: Update useEffect dependency
```javascript
// Before:
}, [rep, columnOrder, waitingForTable, waitingForAmountTable]);

// After:
}, [rep, columnOrder, waitingForTable, waitingForAmountTable, selectedDivision]);
```

---

## How Division Selection Works

### Context Flow:
```
ExcelDataContext
  └─ provides: selectedDivision
      └─ DivisionSelector (user selects division)
          └─ Updates: selectedDivision
              └─ PerformanceDashboard (gets selectedDivision)
                  ├─ CustomersKgsTable (now uses selectedDivision) ✅
                  ├─ CustomersAmountTable (already used selectedDivision) ✅
                  └─ CustomerKeyFactsNew (now uses selectedDivision) ✅
```

### User Journey:
1. **User opens Sales Rep Report page**
2. **Selects division** (e.g., "BE") in the dashboard selector
3. **`ExcelDataContext.selectedDivision` updates** to "BE"
4. **All components re-render** with new division
5. **All API calls now use** `division: "BE"`
6. **Data is consistent** across all tables and analysis ✅

---

## Testing Scenarios

### Test Case 1: FP Division (Default)
- Select FP division
- Expected: All components show FP data
- ✅ **Pass** (default behavior)

### Test Case 2: Switch to BE Division
- Select BE division
- Expected: All components switch to BE data
- Before: ❌ Fail (KGS and Key Facts still showed FP)
- After: ✅ **Pass** (all components show BE data)

### Test Case 3: Switch to SB Division
- Select SB division
- Expected: All components switch to SB data
- Before: ❌ Fail (KGS and Key Facts still showed FP)
- After: ✅ **Pass** (all components show SB data)

### Test Case 4: Merge Rules by Division
- Select different divisions
- Expected: Each division uses its own merge rules
- Before: ❌ Fail (always used FP merge rules)
- After: ✅ **Pass** (uses division-specific merge rules)

---

## Verification

To verify the fix is working:

1. Open the Sales Rep Report page
2. Open browser DevTools → Network tab
3. Select a sales rep
4. **Change division** from FP to BE (or any other division)
5. **Check the API calls** in Network tab:
   - All `/api/sales-by-customer-db` calls should have `division: "BE"`
   - All `/api/division-merge-rules/rules` calls should have `?division=BE`

### Before Fix (Network Calls):
```
POST /api/sales-by-customer-db
  { division: "FP", ... }  ← Wrong! Should be "BE"

GET /api/division-merge-rules/rules?division=FP  ← Wrong! Should be "BE"
```

### After Fix (Network Calls):
```
POST /api/sales-by-customer-db
  { division: "BE", ... }  ← Correct! ✅

GET /api/division-merge-rules/rules?division=BE  ← Correct! ✅
```

---

## Files Modified

1. **`src/components/reports/CustomersKgsTable.js`**
   - Added `useExcelData` import
   - Added `selectedDivision` to component
   - Updated API call to use `selectedDivision`
   - Updated merge rules call to use `selectedDivision`
   - Updated useEffect dependencies

2. **`src/components/reports/CustomerKeyFactsNew.js`**
   - Added `useExcelData` import
   - Added `selectedDivision` to component
   - Updated `fetchCustomerSalesForColumn` to accept `division` parameter
   - Updated `buildRowsFromApi` to accept `division` parameter
   - Updated all calls to use `selectedDivision`
   - Updated useEffect dependencies

---

## Conclusion

✅ **Bug Fixed!** The inconsistency has been resolved. All components now properly respect the user's division selection.

**Impact**: 
- Better data consistency
- Correct behavior across all divisions
- Proper merge rules application per division
- No more confusion between FP and other division data

**User Experience**: 
- Seamless division switching
- All tables and analysis stay synchronized
- Data makes sense and is reliable

---

**Thank you to the user for catching this inconsistency!** 🙏




