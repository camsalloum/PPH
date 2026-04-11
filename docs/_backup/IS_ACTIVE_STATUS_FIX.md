# Customer is_active Status Fix

## Issue Identified

The `is_active` flag in `fp_customer_master` was incorrect for **31.5%** of customers (53 out of 168 marked "active").

### Root Cause
1. **Sync Trigger Bug**: The `trigger_sync_customer()` function ALWAYS sets `is_active = true` when creating new customers
2. **One-Time Migration**: The `add_pin_tracking_fields.js` migration only ran ONCE to calculate is_active
3. **No Recurring Update**: There was no mechanism to recalculate is_active based on recent transactions

### Business Rule
A customer should be **"active"** if they have transactions in the **last 12 months** from the current date.

## Fix Applied

### 1. Immediate Data Fix
Ran `server/scripts/fix-is-active-status.js` which:
- Reset all customers to inactive
- Marked customers with **direct transactions** in last 12 months as active (115 customers)
- Marked **merged customers** whose original_customers have recent transactions as active (46 customers)

**Result**: 161 active, 416 inactive (was 168 active with 53 incorrect)

### 2. Created PostgreSQL Function
Created `recalculate_customer_active_status()` function that can be called:
```sql
SELECT * FROM recalculate_customer_active_status();
```

### 3. Added Admin API Endpoint
```
POST /api/admin/recalculate-customer-status
```
Requires admin authentication. Returns:
```json
{
  "success": true,
  "stats": {
    "totalCustomers": 577,
    "active": 161,
    "inactive": 416
  }
}
```

### 4. Auto-Recalculation After Data Import
Modified `server/routes/aebf/actual.js` to automatically call `recalculate_customer_active_status()` after successful Excel data imports.

## Files Changed/Created

| File | Action | Purpose |
|------|--------|---------|
| `server/scripts/fix-is-active-status.js` | Created | One-time fix script |
| `server/scripts/create-is-active-function.js` | Created | Creates PostgreSQL function |
| `server/routes/admin.js` | Modified | Added recalculate endpoint |
| `server/routes/aebf/actual.js` | Modified | Auto-recalculate after import |

## Riad Group After Fix

| Country | Active Customers |
|---------|------------------|
| United Arab Emirates | 6 |
| Yemen | 3 |
| Kingdom Of Saudi Arabia | 3 |
| **Iraq** | **2** |
| Bahrain | 1 |
| Syrian Arab Republic | 1 |
| Sudan | 1 |
| Jordan | 1 |

## Usage

### Manual Recalculation (Admin UI)
Call the admin endpoint to force recalculation.

### Scheduled Recalculation (Optional)
If pg_cron is installed:
```sql
SELECT cron.schedule('monthly-customer-status', '0 0 1 * *', 
  'SELECT recalculate_customer_active_status()');
```

### Via Node.js Script
```bash
cd server
node scripts/fix-is-active-status.js
```

---
*Fix applied: January 2025*
