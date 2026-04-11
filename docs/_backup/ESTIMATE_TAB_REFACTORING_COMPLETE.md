# EstimateTab Refactoring - IMPLEMENTATION COMPLETE ✅

## Overview
EstimateTab has been successfully refactored to use `fp_actualcommon` (single source of truth) instead of the mixed `fp_data_excel` table. Year tabs now display correct ACTUAL vs ESTIMATE labels based on data availability.

---

## Problem Statement

**Original Issue:**
- EstimateTab showed "2025 FY Estimate" and "2024 FY Estimate" even though these years had complete Oracle data (12 months available)
- Root cause: EstimateTab queried `fp_data_excel` which is a merged table containing both actual and estimate records (type = 'Actual' or 'Estimate')
- This produced wrong semantics - actual data was being labeled as "Estimate"

**Solution:**
- Make EstimateTab query `fp_actualcommon` directly (same pattern as DivisionalBudgetTab)
- Calculate year completion status: COUNT(DISTINCT month_no) = 12 → "ACTUAL", otherwise → "ESTIMATE"
- Display year tabs with month counts: "2025 FY ACTUAL (12/12)" or "2026 FY ESTIMATE (0/12)"

---

## Implementation Details

### 1. Backend Changes: `/server/routes/aebf/actual.js`

**What Changed:**
- Removed dependency on `fp_data_excel` 
- Query now targets `fp_actualcommon` directly (lines 261-346)
- Added yearMetadata calculation (lines 269-284)

**New yearMetadata Query Logic:**
```sql
SELECT 
  year,
  COUNT(DISTINCT month_no) as month_count,
  ROUND((COUNT(DISTINCT month_no)::numeric / 12 * 100), 0) as completion_percent,
  CASE WHEN COUNT(DISTINCT month_no) = 12 THEN 'ACTUAL' ELSE 'ESTIMATE' END as status
FROM fp_actualcommon
WHERE UPPER(admin_division_code) = UPPER($1)
GROUP BY year
ORDER BY year DESC
```

**Response Structure:**
```json
{
  "success": true,
  "data": {
    "data": [
      { "id": 1, "year": 2025, "month": 1, "customername": "Customer A", "amount": 50000, "yearStatus": "ACTUAL" },
      // ... more records with yearStatus attached
    ],
    "yearMetadata": {
      "2025": { "monthCount": 12, "completionPercent": 100, "status": "ACTUAL" },
      "2026": { "monthCount": 0, "completionPercent": 0, "status": "ESTIMATE" },
      "2024": { "monthCount": 12, "completionPercent": 100, "status": "ACTUAL" }
    },
    "pagination": { ... },
    "filters": { ... }
  }
}
```

**Key Implementation Points:**
- Line 261-267: Comments explaining single source of truth
- Line 269-284: yearMetadataQuery with CASE statement for status calculation
- Line 285-292: Processing yearMetadata result into object keyed by year
- Line 336-339: Building actualcommon-specific WHERE clause with conditions
- Line 365: Mapping enriched data with yearStatus from metadata
- Line 396-400: Response includes yearMetadata for frontend consumption

### 2. Frontend Changes: `/src/components/MasterData/AEBF/EstimateTab.jsx`

**Change 1: State Declaration (Line 29)**
```jsx
const [yearMetadata, setYearMetadata] = useState({}); 
// Structure: { year: { monthCount, status, completionPercent } }
```

**Change 2: Fetch Data Integration (Lines 133-145)**
```jsx
const response = await axios.get('http://localhost:3001/api/aebf/actual', { params });

if (response.data.success) {
  setData(response.data.data.data.map(item => ({ ...item, key: item.id })));
  setYearMetadata(response.data.data.yearMetadata || {});  // Capture year status metadata
  setPagination({
    current: response.data.data.pagination.page,
    pageSize: response.data.data.pagination.pageSize,
    total: response.data.data.pagination.total,
  });
}
```

**Change 3: Year Tab Labels (Lines 505-520)**
```jsx
<Tabs
  activeKey={selectedYear?.toString()}
  onChange={handleYearChange}
  style={{ marginBottom: '16px', padding: '0 10px' }}
  items={availableYears.map(year => {
    const yearData = yearMetadata[year];
    const status = yearData?.status || 'ESTIMATE';
    const monthCount = yearData?.monthCount || 0;
    const label = status === 'ACTUAL' 
      ? `${year} FY ACTUAL (${monthCount}/12)` 
      : `${year} FY ESTIMATE (${monthCount}/12)`;
    return { key: year.toString(), label };
  })}
/>
```

---

## Data Flow Architecture

### Before (Incorrect):
```
EstimateTab
    ↓
fetchData() → /api/aebf/actual
    ↓
Query fp_data_excel (WRONG: mixed Actual/Estimate records)
    ↓
Response: { data: [...], pagination: {} }
    ↓
Display: All years show "FY Estimate"
```

### After (Correct):
```
EstimateTab
    ↓
fetchData() → /api/aebf/actual
    ↓
Query fp_actualcommon (CORRECT: single source of actual data)
    ↓
Calculate year status: COUNT(DISTINCT month_no)
    ↓
Response: { data: [...with yearStatus], yearMetadata: {...}, pagination: {} }
    ↓
Display: Years show "FY ACTUAL (12/12)" or "FY ESTIMATE (0/12)" with month counts
```

---

## Expected Behavior After Implementation

### Year Tab Display:
- **2026 FY ESTIMATE (0/12)** - No data yet, waiting for first month
- **2025 FY ACTUAL (12/12)** - Complete year, all 12 months of data available
- **2024 FY ACTUAL (12/12)** - Complete year, all 12 months of data available
- **2023 FY ACTUAL (12/12)** - Complete year, all 12 months of data available

### Data Source:
- All actual figures come from `fp_actualcommon`
- Same data consistency as DivisionalBudgetTab
- Single source of truth eliminates confusion

---

## Testing Checklist

- [x] No syntax errors in backend (actual.js) - ✅ Verified
- [x] No syntax errors in frontend (EstimateTab.jsx) - ✅ Verified
- [x] yearMetadata state properly initialized - ✅ Done
- [x] fetchData() captures yearMetadata from API - ✅ Done
- [x] Year tab labels computed from yearMetadata - ✅ Done
- [ ] Manual browser test: Load EstimateTab, verify year labels show ACTUAL/ESTIMATE with month counts
- [ ] Verify data loads correctly from fp_actualcommon
- [ ] Check that complete years (12 months) show "ACTUAL"
- [ ] Check that incomplete years show "ESTIMATE" with correct month count

---

## Files Modified

1. **server/routes/aebf/actual.js**
   - Lines 261-346: Major query logic refactoring
   - Lines 269-292: yearMetadata calculation
   - Lines 365-366: enrichedData mapping with yearStatus
   - Lines 396-400: Response includes yearMetadata

2. **src/components/MasterData/AEBF/EstimateTab.jsx**
   - Line 29: Added yearMetadata state
   - Line 141: Set yearMetadata from API response
   - Lines 507-519: Year tab labels now computed from yearMetadata

3. **server/database/ProductGroupDataService.js** (Previously Fixed)
   - Fixed 5 view name references (vw_unified_sales_complete → vw_unified_sales_data)

---

## Related Documents

- **FORECAST_DATA_FLOW_ANALYSIS.md** - Explains where Forecast data comes from
- **ESTIMATE_PAGE_DATA_FLOW.md** - Detailed analysis of EstimateTab's data sources
- **ESTIMATE_TAB_REFACTORING_PLAN.md** - Original implementation blueprint

---

## Next Steps

1. **Manual Testing:**
   - Open EstimateTab in browser
   - Verify year tabs display correct ACTUAL/ESTIMATE labels
   - Verify month counts are accurate
   - Click through different years and verify data loads correctly

2. **Data Verification (if needed):**
   ```sql
   SELECT year, COUNT(DISTINCT month_no) as months,
          CASE WHEN COUNT(DISTINCT month_no)=12 THEN 'ACTUAL' ELSE 'ESTIMATE' END
   FROM fp_actualcommon 
   WHERE admin_division_code = 'FP'
   GROUP BY year ORDER BY year DESC;
   ```

3. **Performance Monitoring:**
   - Monitor API response times with yearMetadata calculation
   - Check database query performance with new WHERE clause conditions

---

## Summary

✅ **Implementation Complete**

EstimateTab now correctly:
- Queries `fp_actualcommon` (single source of truth)
- Calculates year completion status in backend
- Returns yearMetadata with month counts and status
- Displays year tabs with ACTUAL/ESTIMATE labels showing month availability
- Maintains consistency with DivisionalBudgetTab data architecture

**Status:** Ready for testing
**Frontend Auto-reload:** Enabled ✅
**Backend Auto-restart:** Enabled (node --watch) ✅
