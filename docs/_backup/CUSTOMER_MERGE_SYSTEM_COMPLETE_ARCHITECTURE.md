# CUSTOMER MERGE SYSTEM - COMPLETE ARCHITECTURE & SYNCHRONIZATION

**Created:** January 1, 2026  
**Status:** PRODUCTION READY - Fully Synchronized  

---

## 🎯 EXECUTIVE SUMMARY

The Customer Merge System has **THREE layers** that must stay synchronized:

1. **Merge Rules** (`fp_division_customer_merge_rules`) - The source of truth for which customers should be merged
2. **Customer Master** (`fp_customer_master`) - The master customer database with `is_merged` flag
3. **Sales Data** (`fp_data_excel`) - The raw transaction data (read-only for merge purposes)

**CRITICAL CONCEPT:** The `is_merged` flag in `customer_master` MUST match the active merge rules. This synchronization was **missing** and has now been **implemented**.

---

## 🔍 PROBLEM IDENTIFIED & FIXED

### **The Problem (Before Fix)**
```
User deletes merge rule for "Zulal Water Factory"
   ↓
fp_division_customer_merge_rules.is_active = false  ✅ UPDATED
   ↓
fp_customer_master.is_merged = true  ❌ NOT UPDATED (ORPHANED!)
   ↓
Frontend shows "Zulal Water Factory" as STILL MERGED ❌
```

### **The Solution (After Fix)**
```
User deletes merge rule
   ↓
1. Set merge rule is_active = false
2. Find all customer names in original_customers array
3. UPDATE customer_master SET is_merged = false WHERE customer_name IN (...)
   ↓
Frontend correctly shows customer as NOT MERGED ✅
```

---

## 📊 SYSTEM ARCHITECTURE

### **1. Merge Rules Table** (`fp_division_customer_merge_rules`)

| Column | Type | Purpose |
|--------|------|---------|
| `id` | SERIAL | Primary key |
| `merged_customer_name` | VARCHAR | The canonical name to use |
| `original_customers` | JSONB | Array of customer name variations |
| `is_active` | BOOLEAN | Whether this rule is active (soft delete) |
| `status` | VARCHAR | 'ACTIVE', 'PENDING', 'REJECTED' |
| `master_customer_code` | VARCHAR | FK to customer_master (optional) |

**Example:**
```json
{
  "id": 10,
  "merged_customer_name": "Al Manhal Water Factory",
  "original_customers": [
    "Al Manhal Water Factory Co. Ltd Wll",
    "Al Manhal Water Factory, W.L.L",
    "Al Manhal Water Factory"
  ],
  "is_active": true,
  "status": "ACTIVE",
  "master_customer_code": "FP-CUST-2025-00110"
}
```

### **2. Customer Master Table** (`fp_customer_master`)

| Column | Type | Purpose |
|--------|------|---------|
| `customer_code` | VARCHAR | Unique code (PK) |
| `customer_name` | VARCHAR | Customer name |
| `is_merged` | BOOLEAN | **CRITICAL:** Shows if customer is part of a merge |
| `merged_into_code` | VARCHAR | Points to parent customer if merged |

**Synchronization Rule:**
```sql
is_merged = true  ⟺  customer_name exists in an ACTIVE merge rule's original_customers
is_merged = false ⟺  customer_name does NOT exist in any ACTIVE merge rule
```

### **3. Sales Data Table** (`fp_data_excel`)

Contains raw transactions with `customername` field. This is **read-only** for merge purposes.

---

## 🔄 SYNCHRONIZATION POINTS

The system now automatically synchronizes at these points:

| Action | Endpoint | Synchronization |
|--------|----------|-----------------|
| **Approve AI suggestion** | `POST /api/division-merge-rules/suggestions/:id/approve` | ✅ Marks customers as merged |
| **Edit & approve suggestion** | `POST /api/division-merge-rules/suggestions/:id/edit-approve` | ✅ Marks customers as merged |
| **Create manual rule** | `POST /api/division-merge-rules/rules/manual` | ✅ Marks customers as merged |
| **Delete merge rule** | `DELETE /api/division-merge-rules/rules/:id` | ✅ Un-merges customers |
| **Manual sync script** | `node server/scripts/sync-customer-merge-status.js` | ✅ Full audit & fix |

---

## 🛠️ CODE IMPLEMENTATION

### **1. Delete Rule with Sync** ([divisionMergeRules.js:1699](server/routes/divisionMergeRules.js#L1699))

```javascript
router.delete('/rules/:id', async (req, res) => {
  // Get rule details before deleting
  const rule = await divisionPool.query(`
    SELECT original_customers FROM fp_division_customer_merge_rules WHERE id = $1
  `, [id]);
  
  const originalCustomers = rule.rows[0]?.original_customers || [];
  
  // Deactivate merge rule
  await divisionPool.query(`
    UPDATE fp_division_customer_merge_rules SET is_active = false WHERE id = $1
  `, [id]);
  
  // CRITICAL: Un-merge all customers
  for (const customerName of originalCustomers) {
    await divisionPool.query(`
      UPDATE fp_customer_master
      SET is_merged = false, merged_into_code = NULL
      WHERE LOWER(TRIM(customer_name)) = LOWER(TRIM($1))
    `, [customerName]);
  }
  
  logger.info(`Rule #${id} deleted and ${originalCustomers.length} customers un-merged`);
});
```

### **2. Approve Suggestion with Sync** ([divisionMergeRules.js:670](server/routes/divisionMergeRules.js#L670))

```javascript
router.post('/suggestions/:id/approve', async (req, res) => {
  // ... create merge rule ...
  
  // CRITICAL: Mark all customers as merged
  for (const customerName of originalCustomers) {
    await client.query(`
      UPDATE fp_customer_master
      SET is_merged = true, merged_into_code = $1, updated_at = NOW()
      WHERE LOWER(TRIM(customer_name)) = LOWER(TRIM($2))
    `, [masterCustomerCode, customerName]);
  }
  
  logger.info(`Marked ${originalCustomers.length} customers as merged`);
});
```

### **3. Manual Sync Script** ([sync-customer-merge-status.js](server/scripts/sync-customer-merge-status.js))

**Purpose:** Audit and fix any out-of-sync customers (run after bulk operations or as maintenance)

**Usage:**
```bash
node server/scripts/sync-customer-merge-status.js fp
```

**What it does:**
1. Gets all customers currently marked as `is_merged = true`
2. Gets all customer names in ACTIVE merge rules
3. **Un-merges** customers that are marked as merged but have no active rule
4. **Merges** customers that should be merged but aren't marked

**Output Example:**
```
Customers to UN-MERGE: 30
  - Zulal Water Factory (FP-CUST-2025-00133)
  - Al Ghadeer Mineral Water (FP-CUST-2025-00093)
  ...

Customers to MERGE: 4
  - Harwal Container Mfg Llc (FP-CUST-2025-00654) -> FP-CUST-2025-00138
  ...

SYNC COMPLETE
Un-merged: 30 customers
Merged: 4 customers
Total changes: 34
```

---

## 🎬 DATA FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER ACTION: Delete Merge Rule               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│   DELETE /api/division-merge-rules/rules/55                     │
│   division = FP                                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Get Rule Details                                        │
│ ─────────────────────────                                       │
│ SELECT original_customers FROM fp_division_customer_merge_rules │
│ WHERE id = 55                                                   │
│                                                                 │
│ Result: ["Zulal Water Factory", "Zulal Water Factory2nd..."]   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Deactivate Merge Rule                                  │
│ ──────────────────────────                                      │
│ UPDATE fp_division_customer_merge_rules                         │
│ SET is_active = false                                           │
│ WHERE id = 55                                                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Un-merge Customers in Customer Master (NEW!)           │
│ ────────────────────────────────────────────────                │
│ FOR EACH customer_name IN original_customers:                  │
│   UPDATE fp_customer_master                                     │
│   SET is_merged = false, merged_into_code = NULL               │
│   WHERE LOWER(TRIM(customer_name)) = LOWER(TRIM(name))         │
│                                                                 │
│ Updates:                                                        │
│   - "Zulal Water Factory" → is_merged = false                  │
│   - "Zulal Water Factory2nd..." → is_merged = false            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Return Success                                         │
│ ──────────────────────                                          │
│ {                                                               │
│   "success": true,                                              │
│   "message": "Rule deleted and customers un-merged",            │
│   "unmergedCustomerNames": 2                                    │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## ✅ VERIFICATION

After the fix, Zulal Water Factory status:

**Before Fix:**
```json
{
  "merge_rule": { "is_active": false },
  "customer_master": { "is_merged": true },  ❌ WRONG!
  "frontend_display": "MERGED"  ❌ WRONG!
}
```

**After Fix:**
```json
{
  "merge_rule": { "is_active": false },
  "customer_master": { "is_merged": false },  ✅ CORRECT!
  "frontend_display": "NOT MERGED"  ✅ CORRECT!
}
```

**Sync Log:**
```
✓ Un-merged: Zulal Water Factory (FP-CUST-2025-00133)
✓ Un-merged: 30 customers total
```

---

## 📋 MAINTENANCE CHECKLIST

### **Daily/Weekly:**
- ✅ No action needed - synchronization is automatic

### **After Bulk Operations:**
```bash
# Run sync script to audit and fix any discrepancies
node server/scripts/sync-customer-merge-status.js fp
```

### **After Database Restore:**
```bash
# Full sync recommended
node server/scripts/sync-customer-merge-status.js fp
```

### **Troubleshooting:**
If a customer shows as merged but shouldn't be:
1. Check if merge rule exists: `SELECT * FROM fp_division_customer_merge_rules WHERE original_customers::text ILIKE '%customer_name%'`
2. If rule is inactive (`is_active = false`), run sync script
3. If rule is active but shouldn't be, delete it via API (auto-syncs)

---

## 🧪 TESTING

### **Test Case 1: Delete Merge Rule**
```bash
# Before
curl http://localhost:3001/api/customer-master/FP/customers?search=Zulal
# Response: is_merged: true

# Delete rule
curl -X DELETE http://localhost:3001/api/division-merge-rules/rules/55?division=FP

# After  
curl http://localhost:3001/api/customer-master/FP/customers?search=Zulal
# Response: is_merged: false  ✅
```

### **Test Case 2: Approve AI Suggestion**
```bash
# Approve suggestion
curl -X POST http://localhost:3001/api/division-merge-rules/suggestions/10/approve

# Check customer master
curl http://localhost:3001/api/customer-master/FP/customers?search=CustomerName
# Response: is_merged: true  ✅
```

### **Test Case 3: Manual Sync**
```bash
node server/scripts/sync-customer-merge-status.js fp
# Output: 
# Un-merged: 30 customers
# Merged: 4 customers
# Total changes: 34
```

---

## 🎯 KEY TAKEAWAYS

1. **`is_merged` flag MUST be synchronized** with active merge rules
2. **ALL CRUD operations on merge rules** now automatically sync customer master
3. **Manual sync script available** for audit and bulk fixes
4. **Zulal Water Factory issue FIXED** - properly un-merged after rule deletion
5. **System is now "smart"** - maintains referential integrity automatically

---

**STATUS:** ✅ PRODUCTION READY - All synchronization points implemented and tested
