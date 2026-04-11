# Raw Materials Sync UI - Correct Location

## ✅ Correct Location
**Path**: Master Data → Product Groups → Raw Materials (first tab)

**Navigation**:
1. Click "Master Data" in main menu
2. Click "Product Groups" tab
3. Click "🧪 Raw Materials" (first sub-tab)

## UI Components

### Page Header
- **Title**: "🧪 Raw Materials Data"
- **Subtitle**: "Oracle view: HAP111.XL_FPRMAVERAGES_PMD_111"

### Sync Button
- **Text**: "Sync RM Data"
- **Color**: Blue (primary)
- **Icon**: ReloadOutlined
- **Position**: Top right of page header

### Stats Tags (next to button)
- Total rows count
- Divisions count
- Item groups count

### Last Sync Tag
- Shows last sync time and row count
- Green color with checkmark

### Progress Indicator (when syncing)
- Light blue background
- Shows phase text or row count
- Shows elapsed time

### Data Table
- **Columns**: CATEGORY, CATLINEDESC, ITEMGROUP, MAINDESCRIPTION
- **Pagination**: 50 rows per page
- **Sorting**: Available on CATEGORY and ITEMGROUP
- **Size**: Small (compact)

## Tab Order in Product Groups

1. **🧪 Raw Materials** ← NEW (RM sync + data table)
2. **📦 Raw Product Groups** (existing)
3. **📊 Material Percentages** (existing)
4. **💹 Product Group Pricing** (existing)

## Files Created/Modified

### New Files
- `src/components/dashboard/RawMaterials.jsx` - Main component
- `src/components/dashboard/RawMaterials.css` - Styling

### Modified Files
- `src/components/dashboard/ProductGroupMasterData.jsx` - Added Raw Materials tab
- `src/components/MasterData/AEBF/ActualTab.jsx` - Removed RM sync (was in wrong place)

## API Endpoints Used
- `POST /api/rm-sync/sync` - Start sync
- `GET /api/rm-sync/progress` - Poll progress
- `GET /api/rm-sync/data?limit=1000` - Fetch table data
- `GET /api/rm-sync/stats` - Get statistics
- `GET /api/rm-sync/last-sync` - Get last sync info

## Testing Steps
1. Navigate to Master Data → Product Groups
2. Click "🧪 Raw Materials" tab (should be first)
3. Click "Sync RM Data" button
4. Watch progress indicator
5. Verify table populates with data
6. Check columns: CATEGORY, CATLINEDESC, ITEMGROUP, MAINDESCRIPTION

---

**Status**: ✅ Complete  
**Date**: February 10, 2026  
**Location**: Correct (Product Groups → Raw Materials tab)
