# Sales Rep Display with Merge Rules Implementation

## Overview
Implemented sales rep display in Sales by Customer page that:
1. Uses merge rules from Master Data > Customer Merging
2. Selects the most recent year's sales rep when a customer has multiple sales reps
3. Properly handles merged customers

## Changes Made

### Backend (`server/server.js`)
**Endpoint**: `GET /api/customer-sales-rep-mapping`

**Key Features**:
- Fetches active merge rules from `division_customer_merge_rules` table
- Queries database to get customer-sales rep mappings with most recent year/month
- Applies merge rules to assign sales reps to merged customers
- Returns mapping with metadata about merged assignments

**SQL Query Logic**:
- Groups by customer, sales_rep, year, month
- Uses `ROW_NUMBER()` with `ORDER BY year DESC, month DESC, total_value DESC`
- Selects only the most recent entry (rn = 1) for each customer

**Merge Rule Application**:
- For each merge rule, finds sales reps from all original customers
- Selects the entry with the most recent year/month
- Creates a mapping entry for the merged customer name

### Frontend (`src/components/dashboard/SalesByCustomerTableNew.js`)

**Function**: `fetchSalesRepMapping()`
- Calls the API endpoint
- Stores mappings in normalized format for fast lookup
- Logs merged assignment count

**Function**: `getCustomerSalesRep(customerLabel)`
- Handles merged customers (ending with `*`)
- First tries direct lookup (backend precomputed merged entries)
- Falls back to deriving from merge rules + original customers
- Sorts by most recent year/month when multiple sales reps exist

## How It Works

1. **Page Load**: When Sales by Customer page loads:
   - Fetches merge rules from Master Data
   - Calls `/api/customer-sales-rep-mapping` API
   - Stores mappings in `customerSalesRepMap` state

2. **Display**: For each customer row:
   - Calls `getCustomerSalesRep(customerLabel)`
   - Returns the sales rep name
   - Displays in the "Sales Rep Names" column

3. **Merged Customers**: For customers ending with `*`:
   - Removes asterisk to get merged name
   - Looks up in mapping (backend precomputed)
   - If not found, derives from merge rule's original customers
   - Selects sales rep with most recent year/month

## Testing

### Check Console Logs
When you load the Sales by Customer page, you should see:
```
✅ Loaded X sales rep mappings (Y merged assignments)
```

When the API is called, backend logs:
```
🔍 Getting customer-sales rep mapping for division: FP
📋 Step 1: Fetching merge rules for division: FP
✅ Found X active merge rules
📋 Step 2: Querying fp_data_excel for customer-sales rep mappings...
✅ Found X raw customer-sales rep mappings
📋 Step 3: Applying X merge rules to determine sales reps...
  ✅ Merged "Customer Name" -> Sales Rep: Rep Name (Year: 2024, Month: 12)
✅ Customer-sales rep mapping ready: X customers (Y merged overrides applied)
```

### Verify in Browser
1. Open Sales by Customer page
2. Check browser console for API calls
3. Verify sales rep names appear in the "Sales Rep Names" column
4. For merged customers (ending with `*`), verify sales rep is from most recent year

### Test API Directly
```bash
curl "http://localhost:3001/api/customer-sales-rep-mapping?division=FP"
```

Should return JSON with:
- `success: true`
- `data`: Object with customer names as keys, sales rep info as values
- `meta.mergedAssignments`: Number of merged customers that got sales rep assignments

## Troubleshooting

### If sales reps don't appear:
1. Check browser console for errors
2. Verify API endpoint is being called
3. Check backend logs for SQL errors
4. Verify merge rules exist in `division_customer_merge_rules` table

### If merged customers show "N/A":
1. Check if merge rules have original customers with sales rep data
2. Verify original customer names match exactly (case-insensitive)
3. Check backend logs for merge rule application messages

### If wrong sales rep is shown:
1. Verify the database has correct year/month data
2. Check that the SQL query is selecting the most recent entry
3. Verify merge rules are correctly configured

## Database Indexes

For optimal performance, ensure these indexes exist:
- `(customername, salesrepname, year, month)` - for fast customer-sales rep lookups
- `(division, customername)` - for division filtering
- `(year, month)` - for date sorting

See `server/scripts/create-customer-salesrep-indexes.sql` for index creation script.

## Next Steps

1. **Restart server** to pick up changes
2. **Load Sales by Customer page** and verify sales reps appear
3. **Check console logs** to verify API is working
4. **Test with merged customers** to ensure correct sales rep selection



