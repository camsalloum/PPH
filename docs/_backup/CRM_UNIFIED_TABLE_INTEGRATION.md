# CRM Integration with fp_customer_unified

**Date:** January 2, 2026  
**Status:** ✅ IMPLEMENTED - Ready for Testing

## Summary

The CRM module has been updated to use the new `fp_customer_unified` table instead of the legacy `fp_customer_master` table. This provides:

1. **Accurate Sales Data**: Direct link to aggregated metrics from `fp_data_excel`
2. **Sales Rep Grouping**: Automatic sales rep group assignment
3. **Access Control**: Sales reps see only their customers, admins see all
4. **Better Performance**: Pre-aggregated totals and transaction dates

## Changes Made

### 1. Customer List Endpoint (`GET /api/crm/customers`)

**File:** `server/routes/crm/index.js`

**Old Behavior:**
- Queried `fp_customer_master`
- No access control
- Joined with `fp_data_excel` for last order date (slow)

**New Behavior:**
- Queries `fp_customer_unified`
- **Access Control:**
  - `admin` / `sales_manager`: See ALL customers
  - `sales_rep`: See only customers where:
    - `primary_sales_rep_name` matches their name, OR
    - `sales_rep_group_name` matches their name
- Uses pre-aggregated fields:
  - `total_amount_all_time`
  - `total_kgs_all_time`
  - `first_transaction_date`
  - `last_transaction_date`
  - `transaction_years`

**Response Fields:**
```json
{
  "id": 1,
  "customer_code": "FP-CUST-00001",
  "customer_name": "Customer Name",
  "customer_type": "Company",
  "country": "UAE",
  "city": "Dubai",
  "sales_rep": "Sofiane Salah",
  "sales_rep_group_name": "Sofiane & Team",
  "is_active": true,
  "is_merged": false,
  "total_amount_all_time": 1500000.50,
  "total_kgs_all_time": 50000.25,
  "first_transaction_date": "2020-01-15",
  "last_transaction_date": "2025-12-20",
  "last_order_date": "2025-12-20",
  "transaction_years": [2020, 2021, 2022, 2023, 2024, 2025],
  "created_at": "2026-01-01T10:00:00Z",
  "updated_at": "2026-01-02T14:30:00Z"
}
```

### 2. Countries Endpoint (`GET /api/crm/customers/countries`)

**Old:** Queried `fp_data_excel` + `fp_customer_master`  
**New:** Queries `fp_customer_unified.primary_country`

### 3. Lookups Endpoint (`GET /api/crm/lookups`)

**Old:** Queried `fp_customer_master` for existing values  
**New:** Queries `fp_customer_unified` for existing values

### 4. Map Endpoint (`GET /api/crm/customers/map`)

**Old:** Queried `fp_customer_master`  
**New:** Queries `fp_customer_unified` with:
- `primary_country` instead of `country`
- `display_name` instead of `customer_name`
- Includes `sales_rep_group_name`

### 5. Detail Endpoint (`GET /api/crm/customers/:id`)

**Old:** Queried `fp_customer_master WHERE id = $1`  
**New:** Queries `fp_customer_unified WHERE customer_id = $1`

## Testing Instructions

### Test 1: Admin Login - See All Customers

1. Login as admin user
2. Navigate to CRM → Customers
3. **Expected Result:**
   - See all 563 customers
   - Each customer shows:
     - Sales rep name
     - Sales rep group name
     - Total sales amount
     - Last order date
     - Transaction years

### Test 2: Sales Rep Login - See Only Own Customers

1. Login as sales rep (e.g., "Sofiane Salah")
2. Navigate to CRM → Customers
3. **Expected Result:**
   - See only customers where:
     - `primary_sales_rep_name = "Sofiane Salah"`, OR
     - `sales_rep_group_name = "Sofiane & Team"` (includes Mouhcine, Olivier)
   - Other sales reps' customers are NOT visible

### Test 3: Filtering & Sorting

1. Login as admin
2. Test filters:
   - **Search**: Type customer name or code
   - **Country**: Select a country from dropdown
   - **Active Status**: Toggle active/inactive
3. Test sorting:
   - **Last Order**: Newest orders first (default)
   - **Name**: Alphabetical
   - **Country**: Grouped by country
4. **Expected Result:**
   - Filters work correctly
   - Sorting persists across pages
   - Pagination works

### Test 4: Customer Detail View

1. Click on any customer
2. **Expected Result:**
   - All customer fields from `fp_customer_unified` displayed
   - Pre-aggregated metrics visible:
     - Total amount all time
     - Total KGS all time
     - First transaction date
     - Last transaction date
     - Array of transaction years

### Test 5: Map View

1. Navigate to CRM → Customer Map
2. **Expected Result:**
   - Customers with `latitude` and `longitude` show on map
   - Clicking marker shows customer details
   - Sales rep group name visible

## Access Control Implementation

**Required in `req.user` (set by auth middleware):**
- `role`: 'admin' | 'sales_manager' | 'sales_rep'
- `salesRepName`: Name of the sales rep (for filtering)
- `name`: Full name (fallback if salesRepName not set)

**Current Implementation in `server/routes/crm/index.js`:**
```javascript
const userRole = req.user?.role || 'sales_rep';
const userSalesRep = req.user?.salesRepName || req.user?.name;

// ACCESS CONTROL: Sales reps see only their customers
if (userRole !== 'admin' && userRole !== 'sales_manager' && userSalesRep) {
  whereConditions.push(`(cu.primary_sales_rep_name = $${paramIndex} OR cu.sales_rep_group_name ILIKE $${paramIndex})`);
  params.push(userSalesRep);
  paramIndex++;
}
```

## Database Migration Status

**Required Migrations:**
- ✅ 300: `fp_customer_unified` table created
- ✅ 307: Sales rep FK columns added
- ⚠️ 310: Product group columns added (optional for CRM)
- ⚠️ 311: Auto-sync triggers (optional for CRM)

**Verify migrations are applied:**
```sql
-- Check table exists
SELECT COUNT(*) FROM fp_customer_unified;

-- Check sales rep columns exist (migration 307)
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'fp_customer_unified' 
  AND column_name IN ('primary_sales_rep_id', 'sales_rep_group_id', 'sales_rep_group_name');
```

## Known Issues / Todos

1. **Auth Middleware**: Ensure `req.user` is properly set by authentication middleware
2. **Frontend Update**: Update frontend API calls to handle new response structure
3. **Migration Check**: Verify migrations 300, 307 are applied before testing
4. **Performance**: Monitor query performance with 563 customers (should be fast due to indexes)

## Rollback Plan

If issues are found, rollback by reverting `server/routes/crm/index.js`:

```bash
git checkout HEAD -- server/routes/crm/index.js
```

Or update queries to use `fp_customer_master` instead of `fp_customer_unified`.

## Next Steps

1. Test with admin login
2. Test with sales rep login
3. Monitor performance
4. Update frontend if needed
5. Once stable, update other modules (Dashboard, Analytics, Reports)
