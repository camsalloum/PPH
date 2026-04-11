# DATA ARCHITECTURE CLEANUP PLAN
## Single Source of Truth for All Entities

**Generated:** January 1, 2026

---

## CURRENT STATE ANALYSIS

### 1. CUSTOMERS
| Table | Rows | Purpose | Status |
|-------|------|---------|--------|
| `fp_customer_master` | 577 | Main customer master | ✅ KEEP - Single Source of Truth |
| `fp_division_customer_merge_rules` | 79 | AI merge rules (original_customers JSONB → master_customer_code) | ✅ KEEP |
| `fp_customer_merge_rules` | 0 | OLD merge rules | ❌ DELETE - Empty, redundant |
| `fp_customer_aliases` | 146 | Customer aliases | ⚠️ REVIEW - May overlap with merge rules |
| `fp_merge_rule_suggestions` | 104 | AI pending suggestions | ✅ KEEP |
| `fp_merge_rule_rejections` | 18 | Rejected suggestions | ✅ KEEP |

**Source Data:**
- `fp_data_excel`: 563 unique customer names (raw)
- `fp_sales_rep_budget`: 124 unique customer names (raw)

### 2. SALES REPS  
| Table | Rows | Purpose | Status |
|-------|------|---------|--------|
| `sales_rep_master` | 51 | Main sales rep master | ✅ KEEP - Single Source of Truth |
| `sales_rep_groups` | 6 | Group definitions | ✅ KEEP |
| `sales_rep_group_members` | 43 | Group membership | ✅ KEEP |
| `sales_rep_aliases` | 0 | Aliases | ❌ DELETE - Empty |

**Source Data:**
- `fp_data_excel`: 51 unique sales rep names
- `fp_sales_rep_budget`: 9 unique sales rep names

**⚠️ INTEGRITY ISSUE:** 8 sales reps in data NOT in any group!

### 3. PRODUCT GROUPS
| Table | Rows | Purpose | Status |
|-------|------|---------|--------|
| `fp_raw_product_groups` | 18 | Maps raw → pg_combine | ✅ KEEP - Single Source of Truth |
| `fp_item_group_overrides` | 2 | Item-level overrides | ✅ KEEP |
| `crm_product_groups` | 13 | Final 13 unified groups | ✅ KEEP |

**Source Data:**
- `fp_data_excel`: 18 unique raw product groups
- Mapped to: 13 unified pg_combine groups

**⚠️ INTEGRITY ISSUE:** "Raw Materials" not mapped!

### 4. COUNTRIES
| Source | Count | Status |
|--------|-------|--------|
| `fp_data_excel` | 34 | Source |
| `fp_customer_master` | 33 | Master |

**Note:** Country comes from customer's transactions, stored in `fp_customer_master.country`

---

## RECOMMENDED ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                    SOURCE DATA TABLES                            │
│  ┌─────────────────┐    ┌───────────────────────┐               │
│  │ fp_data_excel   │    │ fp_sales_rep_budget   │               │
│  │ (Actual Sales)  │    │ (Budget Data)         │               │
│  └────────┬────────┘    └───────────┬───────────┘               │
│           │                         │                            │
│           ▼                         ▼                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              TRANSFORMATION LAYER                        │    │
│  │                                                          │    │
│  │  ┌──────────────────────────────────────────────────┐   │    │
│  │  │ CUSTOMER RESOLUTION                               │   │    │
│  │  │ 1. Check fp_division_customer_merge_rules         │   │    │
│  │  │    (original_customers JSONB → master_customer)   │   │    │
│  │  │ 2. Map to fp_customer_master                      │   │    │
│  │  └──────────────────────────────────────────────────┘   │    │
│  │                                                          │    │
│  │  ┌──────────────────────────────────────────────────┐   │    │
│  │  │ SALES REP RESOLUTION                              │   │    │
│  │  │ 1. Check sales_rep_group_members                  │   │    │
│  │  │    (member_name → group_id)                       │   │    │
│  │  │ 2. Map to sales_rep_groups                        │   │    │
│  │  └──────────────────────────────────────────────────┘   │    │
│  │                                                          │    │
│  │  ┌──────────────────────────────────────────────────┐   │    │
│  │  │ PRODUCT GROUP RESOLUTION                          │   │    │
│  │  │ 1. Check fp_item_group_overrides (item level)     │   │    │
│  │  │ 2. Fallback fp_raw_product_groups (product level) │   │    │
│  │  │ 3. Result: pg_combine (13 unified groups)         │   │    │
│  │  └──────────────────────────────────────────────────┘   │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              MASTER TABLES (Single Source of Truth)      │    │
│  │                                                          │    │
│  │  ┌────────────────────┐  ┌────────────────────┐         │    │
│  │  │ fp_customer_master │  │ sales_rep_master   │         │    │
│  │  │ - customer_code    │  │ - id               │         │    │
│  │  │ - customer_name    │  │ - name             │         │    │
│  │  │ - country          │  │ - email            │         │    │
│  │  │ - is_active        │  │ - is_active        │         │    │
│  │  │ - is_merged        │  │                    │         │    │
│  │  └────────────────────┘  └────────────────────┘         │    │
│  │                                                          │    │
│  │  ┌────────────────────┐  ┌────────────────────┐         │    │
│  │  │ crm_product_groups │  │ (country derived   │         │    │
│  │  │ - product_group    │  │  from customers)   │         │    │
│  │  │ - material (PE/Non)│  │                    │         │    │
│  │  │ - process (P/Pr)   │  │                    │         │    │
│  │  └────────────────────┘  └────────────────────┘         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              UNIFIED OUTPUT (Dashboard, CRM, Reports)    │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## IMMEDIATE FIXES NEEDED

### 1. Customer Merging Logic Bug (CRITICAL)
**Current Issue:** Query uses `COALESCE(merged_stats, direct_stats)` but browser shows cached old data.

**Root Cause:** The `is_merged` flag on `fp_customer_master` wasn't being set properly when merge rules were created.

**Fixed:** Audit script now ensures:
- If `fp_division_customer_merge_rules.master_customer_code` points to a customer → that customer must have `is_merged = true`
- If customer has `is_merged = true` → must have an active merge rule pointing to it

### 2. Missing Sales Rep Groups
**Issue:** 8 sales reps in `fp_data_excel` are NOT in `sales_rep_group_members`:
- Abraham Mathew
- Lokeshwaran Dhandapani
- Mohamed Fawzi
- Christopher Dela Cruz
- Rahil Asif
- Mohamed Adel
- Alfred Barakat
- Ziad Al Houseini

**Fix:** Add these to sales_rep_groups (either as individuals or assign to existing groups)

### 3. Unmapped Product Group
**Issue:** "Raw Materials" in `fp_data_excel` is not mapped in `fp_raw_product_groups`

**Fix:** Add mapping row for "Raw Materials" → appropriate pg_combine

### 4. Redundant Tables to Clean Up
- `fp_customer_merge_rules` (EMPTY) - Safe to drop
- `sales_rep_aliases` (EMPTY) - Safe to drop
- `transaction_similarity_cache` (EMPTY) - Safe to drop  
- `fp_customer_similarity_cache` (EMPTY) - Safe to drop

### 5. `fp_customer_aliases` Review
**Issue:** Has 146 rows but may overlap with merge rules functionality.
**Action:** Review if still needed or migrate to merge rules.

---

## QUERY CONSISTENCY RULES

### For ALL Dashboard/Report Queries:

#### Customer Resolution
```sql
-- Step 1: Get canonical customer name
SELECT 
  COALESCE(mr.merged_customer_name, de.customername) as customer_name,
  COALESCE(cm.customer_code, NULL) as customer_code
FROM fp_data_excel de
LEFT JOIN fp_division_customer_merge_rules mr 
  ON mr.is_active = true
  AND LOWER(TRIM(de.customername)) = ANY(
    SELECT LOWER(TRIM(value::text)) FROM jsonb_array_elements_text(mr.original_customers)
  )
LEFT JOIN fp_customer_master cm 
  ON cm.customer_code = mr.master_customer_code
```

#### Sales Rep Resolution
```sql
-- Step 1: Get group name for sales rep
SELECT 
  COALESCE(srg.group_name, de.salesrepname) as sales_rep_display
FROM fp_data_excel de
LEFT JOIN sales_rep_group_members srgm 
  ON LOWER(TRIM(srgm.member_name)) = LOWER(TRIM(de.salesrepname))
LEFT JOIN sales_rep_groups srg 
  ON srg.group_id = srgm.group_id
```

#### Product Group Resolution
```sql
-- Step 1: Get unified pg_combine
SELECT 
  COALESCE(igo.pg_combine, rpg.pg_combine, de.productgroup) as product_group
FROM fp_data_excel de
LEFT JOIN fp_item_group_overrides igo 
  ON LOWER(TRIM(igo.item_group_description)) = LOWER(TRIM(de.itemgroupdescription))
LEFT JOIN fp_raw_product_groups rpg 
  ON LOWER(TRIM(rpg.raw_product_group)) = LOWER(TRIM(de.productgroup))
  AND rpg.is_unmapped = false
```

---

## SINGLE SOURCE OF TRUTH SUMMARY

| Entity | Master Table | Transformation Table | Resolution Key |
|--------|--------------|----------------------|----------------|
| **Customer** | `fp_customer_master` | `fp_division_customer_merge_rules` | `master_customer_code` |
| **Sales Rep** | `sales_rep_master` | `sales_rep_groups` + `sales_rep_group_members` | `group_id` |
| **Product Group** | `crm_product_groups` | `fp_raw_product_groups` + `fp_item_group_overrides` | `pg_combine` |
| **Country** | (derived from customer) | N/A | `fp_customer_master.country` |

---

## RECOMMENDED CACHING STRATEGY

Create `UnifiedDataService.js` as described in architecture doc to:
1. Cache all merge rules at startup
2. Cache all sales rep groups at startup  
3. Cache all product group mappings at startup
4. Apply transformations in-memory (fast)
5. Invalidate cache when rules change

This eliminates the repeated subqueries that slow down dashboard loads.
