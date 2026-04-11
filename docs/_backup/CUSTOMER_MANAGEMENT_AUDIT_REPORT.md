# CUSTOMER MANAGEMENT SYSTEM - AUDIT REPORT
Date: January 16, 2026

## 🚨 CRITICAL ISSUES FOUND

### 1. **DATA SOURCE MISMATCH** ⚠️ CRITICAL
**Problem:** AI scan was querying OLD table `fp_data_excel` instead of current unified tables
- `fp_data_excel` has 26,010 records with 300 customers NOT in `fp_actualcommon`
- AI suggestions were based on outdated/incorrect data
- Examples of ghost customers: "Weathermaker Limited", "Al Ain Farms For Livestockmasakin Area"

**Status:** ✅ FIXED in CustomerMergingAI.js
- Changed from `fp_data_excel` → `fp_actualcommon`
- Removed obsolete query filters (division parameter, is_budget, budget_type)

**Action Required:**
1. ✅ Server restart needed to apply code fix
2. 🔄 Run "Purge Rules" to clear old suggestions based on fp_data_excel
3. 🔄 Run "Scan Customers" to regenerate suggestions from correct tables

---

### 2. **ORPHANED CUSTOMER DATA** ⚠️ HIGH PRIORITY
**Problem:** 348 customers exist in `fp_actualcommon` but NOT in `fp_customer_unified`
- Source table has 614 unique customers
- Unified table only has 566 customers
- 348 customers (57%) are missing from the master customer table!

**Impact:**
- These customers won't appear in customer management UI properly
- Merge rules can't be created for missing customers
- Reporting and analytics are incomplete

**Affected Customers (sample):**
- 050telecom (Mobile Solutions)
- 4u Readymade Garments
- 6th Street General Trading Llc
- A'Saffa Foods Saog
- Abu Dhabi Polymers Co.(Borouge)
+ 343 more...

**Root Cause:** `fp_customer_unified` table not being synced properly from `fp_actualcommon`

---

### 3. **INCONSISTENT MERGE STATE** ⚠️ MEDIUM PRIORITY
**Problem:** 20 customers have `is_merged=false` BUT have `original_names` array populated
- This is a data integrity violation
- These customers were previously merged but their flags weren't updated correctly

**Affected Customers:**
1. **Weathermaker Fze** → has original_names: ['Weathermaker Limited']
2. Sarl Conaagral → 2 merged names
3. Mai Dubai → 1 merged name
4. National Food Industries Llc → 1 merged name
5. Cosmoplast Ind Co Llc (Trade) → 1 merged name
6. Miscellaneous Customer → 4+ merged names
7. Coca-Cola Al Ahlia Beverages → 1 merged name
8. Dubai Refreshment (Psc) → 1 merged name
9. Technical Aluminium Foil Company → 4+ merged names
10. Oman Refreshment Co, Ltd. → 1 merged name
... +10 more

**Expected State:**
- If `original_names` has values → `is_merged` should be `true`
- If `is_merged=false` → `original_names` should be `null` or empty

---

### 4. **INVALID AI SUGGESTIONS** ⚠️ HIGH PRIORITY
**Problem:** 61 pending AI suggestions reference customers that DON'T EXIST in `fp_actualcommon`
- These are suggestions generated from the old `fp_data_excel` table
- Users will get errors if they try to approve these suggestions

**Examples:**
- ID 471: "Al Ain Farms For Livestockmasakin Area" (NOT in actualcommon)
- ID 472: "Al Douri Food Industries Llcdip 2" (NOT in actualcommon)
- ID 473: "Al Fakher Tobacco Factory - Fzegate 2, Ajman Freezone" (NOT in actualcommon)
- ID 475: "Al Rayan Plant For Dairy Companybasra" (NOT in actualcommon)
+ 57 more invalid suggestions

**Impact:**
- Cannot be approved (will fail database constraints)
- Cluttering the UI with invalid data
- Confusing users with non-existent customers

---

### 5. **OLD TABLE STILL EXISTS** ⚠️ LOW PRIORITY (CLEANUP)
**Problem:** `fp_data_excel` table still exists in database
- Has 26,010 records
- 300 customers that don't exist in current system
- Could cause confusion for developers
- Wasting database storage

**Recommendation:** Archive and drop after verifying all queries use new tables

---

## 📋 ACTION PLAN TO FIX

### Immediate Actions (Priority 1)

1. **✅ COMPLETED: Fix AI Scan Source**
   - Fixed CustomerMergingAI.js to query `fp_actualcommon` instead of `fp_data_excel`
   - Next: Restart Node.js server

2. **🔄 Clear Invalid AI Suggestions**
   ```bash
   # In UI: Click "Purge Rules" button
   # This will delete all 61 invalid suggestions
   ```

3. **🔄 Regenerate AI Suggestions**
   ```bash
   # In UI: Click "Scan Customers" button
   # This will generate new suggestions from correct tables
   ```

### Critical Data Fixes (Priority 2)

4. **Sync Missing Customers to Unified Table**
   ```sql
   -- Run this migration to populate fp_customer_unified from fp_actualcommon
   INSERT INTO fp_customer_unified (
     display_name,
     normalized_name,
     primary_country,
     countries,
     primary_sales_rep_name,
     sales_reps,
     division,
     global_status
   )
   SELECT DISTINCT
     customer_name as display_name,
     UPPER(TRIM(customer_name)) as normalized_name,
     (SELECT country FROM fp_actualcommon WHERE customer_name = a.customer_name GROUP BY country ORDER BY COUNT(*) DESC LIMIT 1) as primary_country,
     ARRAY(SELECT DISTINCT country FROM fp_actualcommon WHERE customer_name = a.customer_name) as countries,
     (SELECT sales_rep_name FROM fp_actualcommon WHERE customer_name = a.customer_name GROUP BY sales_rep_name ORDER BY COUNT(*) DESC LIMIT 1) as primary_sales_rep_name,
     ARRAY(SELECT DISTINCT sales_rep_name FROM fp_actualcommon WHERE customer_name = a.customer_name) as sales_reps,
     'FP' as division,
     'ACTIVE' as global_status
   FROM fp_actualcommon a
   WHERE customer_name IS NOT NULL
   AND customer_name NOT IN (
     SELECT display_name FROM fp_customer_unified
     UNION
     SELECT unnest(original_names) FROM fp_customer_unified WHERE original_names IS NOT NULL
   )
   ON CONFLICT (normalized_name, division) DO NOTHING;
   ```

5. **Fix Inconsistent Merge States**
   ```sql
   -- Weathermaker Fze should either:
   -- Option A: Remove original_names (if merge was rejected/reverted)
   UPDATE fp_customer_unified 
   SET original_names = NULL 
   WHERE display_name = 'Weathermaker Fze' 
   AND is_merged = false;

   -- OR Option B: Set is_merged = true (if merge was successful)
   -- (Check with business team which is correct)
   
   -- Apply to all 20 customers:
   UPDATE fp_customer_unified 
   SET original_names = NULL 
   WHERE is_merged = false 
   AND original_names IS NOT NULL 
   AND array_length(original_names, 1) > 0;
   ```

### Optional Cleanup (Priority 3)

6. **Archive and Drop Old Table**
   ```sql
   -- Export for backup first
   COPY fp_data_excel TO '/backup/fp_data_excel_20260116.csv' CSV HEADER;
   
   -- Then drop
   DROP TABLE IF EXISTS fp_data_excel;
   ```

7. **Create Sync Function** (Future-proof)
   ```sql
   -- Create function to auto-sync new customers from actualcommon to customer_unified
   CREATE OR REPLACE FUNCTION sync_customer_unified_from_actual()
   RETURNS TRIGGER AS $$
   BEGIN
     INSERT INTO fp_customer_unified (display_name, normalized_name, division, global_status)
     VALUES (NEW.customer_name, UPPER(TRIM(NEW.customer_name)), 'FP', 'ACTIVE')
     ON CONFLICT (normalized_name, division) DO NOTHING;
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;

   CREATE TRIGGER trigger_sync_customer_unified
   AFTER INSERT ON fp_actualcommon
   FOR EACH ROW
   EXECUTE FUNCTION sync_customer_unified_from_actual();
   ```

---

## ✅ VERIFICATION CHECKLIST

After applying fixes, verify:

- [ ] Server restarted with new CustomerMergingAI.js code
- [ ] All 61 invalid AI suggestions cleared
- [ ] New scan generates suggestions only for customers in fp_actualcommon
- [ ] No "customer not found" errors when viewing suggestions
- [ ] fp_customer_unified has 614 customers (matching actualcommon)
- [ ] Weathermaker suggestion no longer appears (only exists in actualcommon once)
- [ ] All customers with original_names have is_merged=true

---

## 🎯 EXPECTED OUTCOME

After all fixes:
- ✅ AI scans only real customers from current data (fp_actualcommon + fp_budget_unified)
- ✅ All customers in actualcommon exist in customer_unified
- ✅ No data integrity violations (merge state consistent)
- ✅ No invalid/ghost AI suggestions
- ✅ System uses correct unified tables throughout
- ✅ "Weathermaker Limited" suggestion disappears (not in actualcommon)

---

## 📊 CURRENT STATE SUMMARY

| Metric | Current | Expected | Status |
|--------|---------|----------|--------|
| AI Scan Source | fp_data_excel | fp_actualcommon | ✅ FIXED |
| Customers in actualcommon | 614 | 614 | ✅ |
| Customers in customer_unified | 566 | 614 | ❌ Missing 348 |
| Invalid AI suggestions | 61 | 0 | ❌ Need purge |
| Inconsistent merge states | 20 | 0 | ❌ Need fix |
| Active merge rules | 0 | 0 | ✅ |

---

## 🔍 ROOT CAUSE ANALYSIS

The system was using **two parallel data structures**:

1. **OLD Structure (pre-migration):**
   - `fp_data_excel` → Raw transaction data
   - Used by AI scan, merge suggestions

2. **NEW Structure (current):**
   - `fp_actualcommon` → Unified actual data
   - `fp_budget_unified` → Unified budget data
   - Used by UI, reporting

**The Problem:** AI was still looking at OLD structure while UI showed NEW structure.

**The Fix:** Updated AI to query NEW structure (fp_actualcommon + fp_budget_unified).

---

## 📝 NEXT STEPS

1. **Restart server** to apply CustomerMergingAI.js fix
2. **Purge all suggestions** in UI
3. **Run new scan** to regenerate from correct tables
4. **Run SQL migrations** to sync missing customers
5. **Fix merge state inconsistencies** 
6. **Verify** Weathermaker issue is resolved
7. **Optional:** Drop old fp_data_excel table after verification
