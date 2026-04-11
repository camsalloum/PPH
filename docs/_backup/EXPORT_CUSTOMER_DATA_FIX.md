# Sales Dashboard Export - Customer Data Mismatch Fix

## Problem
The export report shows different customer figures than the live dashboard for:
- Customer Sales - Volume (MT) Comparison
- Customer Sales - Sales Comparison

The issue is that customer names are being duplicated in the export, causing incorrect totals.

## Root Cause Analysis

### Data Flow in Live Tables
1. **CustomersKgsTable.jsx** and **CustomersAmountTable.jsx**:
   - Fetch data directly from `/api/sales-by-customer-db` endpoint
   - Apply case-insensitive customer name normalization
   - Apply division-wide merge rules from database
   - Dispatch `customersKgsTable:dataReady` and `customersAmountTable:dataReady` events with processed data

### Data Flow in Export
1. **SalesRepReport.jsx**:
   - Fetches customer data separately via `fetchCustomerDashboardData` and `fetchCustomerAmountData`
   - Applies merge rules
   - Passes pre-processed data to **SalesRepHTMLExport.jsx**
   
2. **SalesRepHTMLExport.jsx**:
   - Receives customer data as props
   - Generates HTML tables from this data
   - **PROBLEM**: The data might not match what the live tables show due to:
     - Different timing of data fetches
     - Different merge rule application
     - Potential race conditions
     - Case sensitivity differences

## Solution Implemented

### 1. Event-Based Data Capture
Added event listeners in `SalesRepHTMLExport.jsx` to capture the EXACT data that the live tables are displaying:

```javascript
const [liveCustomerKgsData, setLiveCustomerKgsData] = useState(null);
const [liveCustomerAmountData, setLiveCustomerAmountData] = useState(null);

React.useEffect(() => {
  const handleCustomerKgsData = (event) => {
    setLiveCustomerKgsData(event.detail?.rows || []);
  };
  
  const handleCustomerAmountData = (event) => {
    setLiveCustomerAmountData(event.detail?.rows || []);
  };
  
  window.addEventListener('customersKgsTable:dataReady', handleCustomerKgsData);
  window.addEventListener('customersAmountTable:dataReady', handleCustomerAmountData);
  
  return () => {
    window.removeEventListener('customersKgsTable:dataReady', handleCustomerKgsData);
    window.removeEventListener('customersAmountTable:dataReady', handleCustomerAmountData);
  };
}, []);
```

### 2. Prioritize Live Data in Export
Modified `generatePageContent` to use live table data when available:

```javascript
const generatePageContent = (logoBase64) => {
  // Use live table data if available, otherwise fall back to props
  const exportCustomerData = liveCustomerKgsData || customerData;
  const exportCustomerAmountData = liveCustomerAmountData || customerAmountData;
  
  // ... rest of the function uses exportCustomerData and exportCustomerAmountData
}
```

### 3. Added Debug Logging
Added comprehensive logging to track data flow:
- When live data is captured from events
- When export is generated
- Which data source is being used (live vs props)
- Sample customer data for verification

## Benefits

1. **Exact Match**: Export now shows EXACTLY what the user sees in the live tables
2. **No Duplicates**: Uses the same deduplicated and merged data as live tables
3. **Consistent Merge Rules**: Same merge rule application as live tables
4. **Real-time Accuracy**: Captures the most recent data state
5. **Visual Feedback**: Export button shows a green indicator when live data is captured

## Visual Indicators

The export button now provides visual feedback:
- **Green button with ✓ and green dot**: Live data captured, export will match live tables exactly
- **Gray button**: Using cached/props data, may not match live tables perfectly
- **Tooltip**: Hover over button to see data source status

## Testing Steps

1. Open Sales Dashboard for a sales rep
2. Wait for customer tables to load completely
3. **Look for the green indicator dot** on the Export Report button (top-right corner)
4. Verify the customer names and totals in the live tables
5. Click "Export Report" button (should show ✓ if live data captured)
6. Open the exported HTML file
7. Navigate to the "Customers" tab
8. Compare the customer names and totals with the live dashboard
9. Check browser console for debug logs showing data capture

## Expected Console Logs

When working correctly, you should see:
```
📊 EXPORT - Captured LIVE Customer KGS data: { rowCount: X, sampleRows: [...] }
💰 EXPORT - Captured LIVE Customer Amount data: { rowCount: Y, sampleRows: [...] }
📤 EXPORT - Using customer data: { usingLiveKgsData: true, usingLiveAmountData: true, ... }
```

## Fallback Behavior

If for any reason the live table events are not captured (e.g., tables haven't loaded yet), the export will fall back to using the props data. This ensures the export always works, even if not perfectly synchronized.

## Files Modified

1. `src/components/dashboard/SalesRepHTMLExport.jsx`:
   - Added state for live table data
   - Added event listeners
   - Modified `generatePageContent` to use live data
   - Updated `generatePerformanceDashboard` signature
   - Added debug logging

## Related Files (No Changes Needed)

- `src/components/reports/CustomersKgsTable.jsx` - Already dispatches events
- `src/components/reports/CustomersAmountTable.jsx` - Already dispatches events
- `src/components/reports/SalesRepReport.jsx` - Still provides fallback data via props


## Data Flow Diagram

### Before Fix (Mismatched Data)
```
┌─────────────────────────────────────────────────────────────┐
│                    Sales Dashboard                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │ CustomersKgsTable│         │CustomersAmountTbl│          │
│  │                  │         │                  │          │
│  │ Fetches from API │         │ Fetches from API │          │
│  │ Applies merges   │         │ Applies merges   │          │
│  │ Shows: 50 rows   │         │ Shows: 50 rows   │          │
│  └──────────────────┘         └──────────────────┘          │
│         ↓                              ↓                     │
│    LIVE DATA                      LIVE DATA                  │
│    (Correct)                      (Correct)                  │
│                                                               │
│  ┌──────────────────────────────────────────────┐           │
│  │         Export Button                         │           │
│  │  Uses: SalesRepReport props data             │           │
│  │  (Fetched separately, different timing)      │           │
│  │  Shows: 55 rows (DUPLICATES!)                │           │
│  └──────────────────────────────────────────────┘           │
│         ↓                                                     │
│    EXPORT DATA                                                │
│    (WRONG - Has duplicates)                                   │
└─────────────────────────────────────────────────────────────┘
```

### After Fix (Matched Data)
```
┌─────────────────────────────────────────────────────────────┐
│                    Sales Dashboard                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │ CustomersKgsTable│         │CustomersAmountTbl│          │
│  │                  │         │                  │          │
│  │ Fetches from API │         │ Fetches from API │          │
│  │ Applies merges   │         │ Applies merges   │          │
│  │ Shows: 50 rows   │         │ Shows: 50 rows   │          │
│  └────────┬─────────┘         └────────┬─────────┘          │
│           │                            │                     │
│           │ Dispatches Event           │ Dispatches Event    │
│           │ 'customersKgsTable:        │ 'customersAmountTbl:│
│           │  dataReady'                │  dataReady'         │
│           │                            │                     │
│           └────────────┬───────────────┘                     │
│                        ↓                                      │
│  ┌──────────────────────────────────────────────┐           │
│  │         Export Button                         │           │
│  │  ✓ Listens to events                         │           │
│  │  ✓ Captures LIVE table data                  │           │
│  │  ✓ Uses: liveCustomerKgsData (50 rows)       │           │
│  │  ✓ Shows green indicator when captured       │           │
│  └──────────────────────────────────────────────┘           │
│         ↓                                                     │
│    EXPORT DATA                                                │
│    (CORRECT - Exact match with live tables)                   │
└─────────────────────────────────────────────────────────────┘
```

## Key Differences

| Aspect | Before Fix | After Fix |
|--------|-----------|-----------|
| Data Source | Props from SalesRepReport | Live table events |
| Timing | Separate fetch (race condition) | Real-time capture |
| Merge Rules | Applied separately | Same as live tables |
| Customer Count | 55 (duplicates) | 50 (correct) |
| Accuracy | ❌ Mismatched | ✅ Exact match |
| Visual Feedback | None | Green indicator |

## Technical Implementation Details

### Event Payload Structure
```javascript
{
  detail: {
    rows: [
      {
        name: "Customer Name",
        customerName: "Customer Name", // Alias for compatibility
        rawValues: [1000, 2000, 3000, ...] // Values for each period
      },
      // ... more customers
    ],
    columnOrder: [...], // Period definitions
    rep: "Sales Rep Name"
  }
}
```

### State Management
```javascript
// In SalesRepHTMLExport component
const [liveCustomerKgsData, setLiveCustomerKgsData] = useState(null);
const [liveCustomerAmountData, setLiveCustomerAmountData] = useState(null);

// Event listeners capture data when tables finish processing
useEffect(() => {
  window.addEventListener('customersKgsTable:dataReady', handleKgsData);
  window.addEventListener('customersAmountTable:dataReady', handleAmountData);
  return () => {
    window.removeEventListener('customersKgsTable:dataReady', handleKgsData);
    window.removeEventListener('customersAmountTable:dataReady', handleAmountData);
  };
}, []);
```

### Export Logic
```javascript
const generatePageContent = (logoBase64) => {
  // Prioritize live data, fallback to props
  const exportCustomerData = liveCustomerKgsData || customerData;
  const exportCustomerAmountData = liveCustomerAmountData || customerAmountData;
  
  // Use exportCustomerData for all customer-related exports
  // This ensures consistency with live tables
}
```
