# EstimateTab Refactoring Plan - Data Source Migration

**Date:** January 12, 2026  
**Objective:** Fix EstimateTab to show "ACTUAL" for complete years and "ESTIMATE" for incomplete years

---

## 🎯 CURRENT PROBLEM

**Wrong Behavior:**
```
2025 → Shows "2025 FY Estimate"  ❌ (Should be "ACTUAL" - has 12 months)
2024 → Shows "2024 FY Estimate"  ❌ (Should be "ACTUAL" - has 12 months)
2026 → Shows "2026 FY Estimate"  ✓ (Correct - incomplete data)
```

**Root Cause:**
- EstimateTab queries `fp_data_excel` (mixed Actual/Estimate records)
- Doesn't check if year is complete (12 months)
- Always shows whatever `type` value is in database

---

## ✅ DESIRED BEHAVIOR

```
Logic: Query fp_actualcommon (single source of truth)
       Count distinct months per year
       If count = 12  → Display as "YYYY ACTUAL"
       If count < 12  → Display as "YYYY ESTIMATE"

Result for screenshot:
2026 FY Estimate  ✓ (< 12 months, incomplete)
2025 FY ACTUAL    ✓ (12 months, complete)
2024 FY ACTUAL    ✓ (12 months, complete)
2023 FY ACTUAL    ✓ (12 months, complete)
2022 FY ACTUAL    ✓ (12 months, complete)
2021 FY ACTUAL    ✓ (12 months, complete)
2020 FY ACTUAL    ✓ (12 months, complete)
2019 FY ACTUAL    ✓ (12 months, complete)
```

---

## 🔄 CHANGES REQUIRED

### Change 1: Backend API Endpoint
**File:** `server/routes/aebf/actual.js`

**Current Logic:**
```javascript
// Line 120-125
const params = {
  division: selectedDivision,
  types: 'Actual,Estimate',  // ← Fetches BOTH from fp_data_excel
  page, pageSize
};
```

**New Logic Needed:**
```
New endpoint: GET /api/aebf/actual/with-year-status
Parameters:
  - division (FP, HC)
  - page, pageSize
  - year (optional)
  - search (optional)

Response includes:
  - all actual records from fp_actualcommon
  - PLUS: year completion status for each record
    {
      data: [
        { ...record, yearStatus: 'ACTUAL' or 'ESTIMATE' },
        ...
      ],
      yearMetadata: {
        2026: { completionPercent: 0, monthCount: 0, status: 'ESTIMATE' },
        2025: { completionPercent: 100, monthCount: 12, status: 'ACTUAL' },
        ...
      }
    }
```

### Change 2: Frontend Data Fetching
**File:** `src/components/MasterData/AEBF/EstimateTab.jsx`

**Current (Wrong):**
```jsx
// Line 73-74
const params = {
  types: 'Actual,Estimate',  // ← Gets mixed from fp_data_excel
};
const response = await axios.get('/api/aebf/actual', { params });
```

**New (Correct):**
```jsx
// Use new endpoint that returns fp_actualcommon with year status
const response = await axios.get('/api/aebf/actual/with-year-status', { params });

// Get year metadata for labels
const yearMetadata = response.data.data.yearMetadata;  // { year: { status, monthCount } }
```

### Change 3: Year Tab Display
**File:** `src/components/MasterData/AEBF/EstimateTab.jsx`

**Current (Wrong):**
```jsx
// Line 700+ (somewhere in render)
{availableYears.map(year => (
  <TabPane tab={`${year} FY Estimate`} key={year} />
))}
```

**New (Correct):**
```jsx
{availableYears.map(year => {
  const yearStatus = yearMetadata?.[year]?.status || 'ESTIMATE';
  const label = yearStatus === 'ACTUAL' 
    ? `${year} FY ACTUAL`
    : `${year} FY Estimate`;
  return <TabPane tab={label} key={year} />;
})}
```

### Change 4: Year Summary Display
**File:** `src/components/MasterData/AEBF/EstimateTab.jsx`

**Current (Wrong):**
```jsx
// Shows summary from fp_data_excel (mixed records)
// May show "2025 FY Estimate" with 104M amount
```

**New (Correct):**
```jsx
// Shows summary from fp_actualcommon (actual data only)
// Always shows actual data + month count indicator
// Example:
// "2025 FY ACTUAL (12/12 months)"
// "2026 FY ESTIMATE (0/12 months - can create estimate)"
```

---

## 📊 BACKEND IMPLEMENTATION PLAN

### New Route: `GET /api/aebf/actual/with-year-status`

**Location:** `server/routes/aebf/actual.js` (add new route)

**Implementation:**

```javascript
/**
 * GET /actual/with-year-status
 * Fetch actual data from fp_actualcommon with year completion status
 * Shows "ACTUAL" for complete years (12 months), "ESTIMATE" for incomplete
 */
router.get('/actual/with-year-status', 
  queryLimiter, 
  cacheMiddleware({ ttl: CacheTTL.MEDIUM }), 
  paginationHelper,
  validationRules.getActual, 
  asyncHandler(async (req, res) => {
  
  const { division, page = 1, pageSize = 100, year, search, sortBy = 'year', sortOrder = 'desc' } = req.query;
  
  const divisionPool = getPoolForDivision(division);
  const tables = getTableNames(division);
  
  // Step 1: Get year completion metadata
  const yearMetadataQuery = `
    SELECT 
      year,
      COUNT(DISTINCT month) as month_count,
      ROUND((COUNT(DISTINCT month)::numeric / 12 * 100), 0) as completion_percent,
      CASE WHEN COUNT(DISTINCT month) = 12 THEN 'ACTUAL' ELSE 'ESTIMATE' END as status
    FROM ${tables.actualcommon}
    WHERE UPPER(admin_division_code) = UPPER($1)
    GROUP BY year
    ORDER BY year DESC
  `;
  
  const yearMetadataResult = await divisionPool.query(yearMetadataQuery, [division]);
  
  // Build metadata object: { 2025: { monthCount: 12, status: 'ACTUAL' }, ... }
  const yearMetadata = {};
  yearMetadataResult.rows.forEach(row => {
    yearMetadata[row.year] = {
      monthCount: row.month_count,
      completionPercent: row.completion_percent,
      status: row.status
    };
  });
  
  // Step 2: Get actual data (from fp_actualcommon, NOT fp_data_excel!)
  let conditions = ['UPPER(a.admin_division_code) = UPPER($1)'];
  const params = [division];
  let paramIndex = 2;
  
  if (year) {
    conditions.push(`a.year = $${paramIndex}`);
    params.push(parseInt(year));
    paramIndex++;
  }
  
  if (search) {
    const searchPattern = `%${search.toUpperCase()}%`;
    conditions.push(`(
      UPPER(a.customername) LIKE $${paramIndex} OR
      UPPER(a.countryname) LIKE $${paramIndex} OR
      UPPER(a.pgcombine) LIKE $${paramIndex} OR
      UPPER(a.salesrepname) LIKE $${paramIndex}
    )`);
    params.push(searchPattern);
    paramIndex++;
  }
  
  const whereClause = conditions.join(' AND ');
  
  // Sorting
  const validSortFields = ['year', 'month_no', 'amount', 'qty_kgs', 'morm', 'customername', 'countryname'];
  const sortField = validSortFields.includes(sortBy) ? `a.${sortBy}` : 'a.year';
  const sortDirection = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  
  // Count query
  const countQuery = `
    SELECT COUNT(*) as total
    FROM ${tables.actualcommon} a
    WHERE ${whereClause}
  `;
  const countResult = await divisionPool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);
  
  // Data query - use fp_actualcommon (actual data source)
  const limit = Math.min(parseInt(pageSize) || 100, 1000);
  const offset = (parseInt(page) - 1) * limit;
  
  const dataQuery = `
    SELECT 
      a.id, a.year, a.month_no as month, a.customername, a.countryname,
      a.pgcombine as productgroup, a.material, a.process,
      a.salesrepname, a.amount, a.qty_kgs, a.morm,
      'Actual' as type, 'Oracle' as sourcesheet
    FROM ${tables.actualcommon} a
    WHERE ${whereClause}
    ORDER BY ${sortField} ${sortDirection}
    LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
  `;
  
  params.push(limit, offset);
  const dataResult = await divisionPool.query(dataQuery, params);
  
  // Attach year status to each record
  const enrichedData = dataResult.rows.map(row => ({
    ...row,
    yearStatus: yearMetadata[row.year]?.status || 'ESTIMATE'
  }));
  
  successResponse(res, {
    data: enrichedData,
    yearMetadata: yearMetadata,  // ← Send year status info to frontend
    pagination: {
      page: parseInt(page),
      pageSize: limit,
      total: total
    }
  });
}));
```

---

## 🎨 FRONTEND IMPLEMENTATION PLAN

### Update 1: Fetch with Year Status
**File:** `src/components/MasterData/AEBF/EstimateTab.jsx`

```javascript
// Add state for year metadata
const [yearMetadata, setYearMetadata] = useState({});

// Update fetchData to use new endpoint
const fetchData = async (page = 1, pageSize = 50, searchFilter = null) => {
  // ... validation ...
  
  // Use NEW endpoint instead of old one
  const response = await axios.get(
    'http://localhost:3001/api/aebf/actual/with-year-status',  // ← NEW
    { params }
  );
  
  if (response.data.success) {
    setData(response.data.data.data);
    setYearMetadata(response.data.data.yearMetadata);  // ← Store metadata
    // ... handle pagination ...
  }
};
```

### Update 2: Display Year Tabs with Status
**File:** `src/components/MasterData/AEBF/EstimateTab.jsx`

```jsx
// In the render section where tabs are created
const renderYearTabs = () => {
  return availableYears.map(year => {
    const metadata = yearMetadata[year];
    const label = metadata?.status === 'ACTUAL' 
      ? `${year} FY ACTUAL`
      : `${year} FY Estimate`;
    
    const monthInfo = metadata 
      ? ` (${metadata.monthCount}/12 months)`
      : '';
    
    return (
      <Tabs.TabPane 
        tab={`${label}${monthInfo}`} 
        key={year}
      >
        {selectedYear === year && (
          <YearContent year={year} metadata={metadata} />
        )}
      </Tabs.TabPane>
    );
  });
};
```

### Update 3: Show Completion Status in UI
**File:** `src/components/MasterData/AEBF/EstimateTab.jsx`

```jsx
// Add indicator showing year status
const renderYearStatusIndicator = (year) => {
  const metadata = yearMetadata[year];
  if (!metadata) return null;
  
  if (metadata.status === 'ACTUAL') {
    return (
      <Tag color="green">
        COMPLETE - {metadata.monthCount}/12 months available
      </Tag>
    );
  } else {
    return (
      <Tag color="orange">
        INCOMPLETE - {metadata.monthCount}/12 months
        Can create estimate for months {getIncompleteMonths(metadata)}
      </Tag>
    );
  }
};
```

---

## 📋 SUMMARY OF CHANGES

| Component | Current | New |
|-----------|---------|-----|
| **Data Source** | `fp_data_excel` (mixed records) | `fp_actualcommon` (actual only) |
| **Year Label** | Always "2025 FY Estimate" | "2025 FY ACTUAL" if 12 months, else "FY Estimate" |
| **Data Filtering** | `types: 'Actual,Estimate'` | Only `type='Actual'` from fp_actualcommon |
| **Metadata** | None | yearMetadata: { monthCount, status, completionPercent } |
| **Endpoint** | `/api/aebf/actual` | `/api/aebf/actual/with-year-status` |
| **Month Indicator** | None | Shows "(12/12)" or "(0/12)" next to year |

---

## 🚀 IMPLEMENTATION CHECKLIST

### Backend
- [ ] Create new route `/api/aebf/actual/with-year-status` in `server/routes/aebf/actual.js`
- [ ] Query `fp_actualcommon` (not `fp_data_excel`)
- [ ] Calculate year metadata (month count, status)
- [ ] Return enriched data + metadata

### Frontend  
- [ ] Update EstimateTab to call new endpoint
- [ ] Add `yearMetadata` state
- [ ] Update year tab labels to show "ACTUAL" vs "ESTIMATE"
- [ ] Show month count indicator (e.g., "12/12 months")
- [ ] Update "Create Estimate" button logic (only for incomplete years)

### Validation
- [ ] Verify 2025-2019 show as "ACTUAL"
- [ ] Verify 2026 shows as "ESTIMATE"
- [ ] Check month counts match `fp_actualcommon`
- [ ] Ensure estimate creation only allowed for incomplete years

---

## ❓ QUESTIONS FOR YOU

1. Should we keep the old `/api/aebf/actual` endpoint or replace it?
2. Should EstimateTab only show years from `fp_actualcommon` or also allow custom years?
3. When user clicks "Create Estimate" for a year, should it:
   - Replace existing estimate data?
   - Or only fill gaps (incomplete months)?

