# 📊 Data Architecture Analysis & Migration Plan

**Document Created:** December 31, 2025  
**Status:** Analysis Complete - Quick Fix Applied  
**Full Migration:** Pending (Estimated 2-4 weeks)

---

## 1. Executive Summary

### Current Problem
The CRM module has **inconsistent customer data** across different pages:
- **CustomerList** shows 2 Iraq customers
- **CustomerMapView** shows only 1 Iraq customer

### Root Cause
Different pages query customer data using **different approaches**:
- Some query `fp_customer_master` directly
- Others query `fp_data_excel` first, then match by name

### Quick Fix Applied
Modified `/api/crm/my-customers/map` to use `EXISTS` subquery ensuring all customers in master table appear if they have sales data.

---

## 2. Current Data Architecture

### 2.1 Database Tables Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              fp_database                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────┐     ┌─────────────────────────┐                    │
│  │   fp_data_excel         │     │   fp_customer_master    │                    │
│  │   (Sales Transactions)  │     │   (Customer Master)     │                    │
│  ├─────────────────────────┤     ├─────────────────────────┤                    │
│  │ • customername (TEXT)   │────►│ • id (SERIAL PK)        │                    │
│  │ • salesrepname (TEXT)   │     │ • customer_code         │                    │
│  │ • countryname (TEXT)    │     │ • customer_name (TEXT)  │                    │
│  │ • productgroup (TEXT)   │     │ • country (TEXT)        │                    │
│  │ • year, month           │     │ • sales_rep (TEXT)      │                    │
│  │ • values, values_type   │     │ • is_active             │                    │
│  │ • division              │     │ • latitude, longitude   │                    │
│  └─────────────────────────┘     │ • pin_confirmed         │                    │
│           │                      └─────────────────────────┘                    │
│           │                                                                      │
│           │ Name Matching (case-insensitive)                                    │
│           ▼                                                                      │
│  ┌─────────────────────────────────────────┐                                    │
│  │   fp_division_customer_merge_rules      │                                    │
│  ├─────────────────────────────────────────┤                                    │
│  │ • merged_customer_name                  │                                    │
│  │ • original_customers (JSONB array)      │                                    │
│  │ • is_active                             │                                    │
│  └─────────────────────────────────────────┘                                    │
│                                                                                  │
│  ┌─────────────────────────┐     ┌─────────────────────────┐                    │
│  │   fp_sales_rep_budget   │     │   fp_divisional_budget  │                    │
│  ├─────────────────────────┤     ├─────────────────────────┤                    │
│  │ • salesrepname (TEXT)   │     │ • Division-level        │                    │
│  │ • customername (TEXT)   │     │   aggregations          │                    │
│  │ • countryname (TEXT)    │     │                         │                    │
│  │ • productgroup (TEXT)   │     │                         │                    │
│  │ • year, month, values   │     │                         │                    │
│  └─────────────────────────┘     └─────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                            ip_auth_database                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────┐     ┌─────────────────────────┐                    │
│  │   employees             │     │   crm_sales_reps (VIEW) │                    │
│  ├─────────────────────────┤     ├─────────────────────────┤                    │
│  │ • id                    │────►│ • employee_id           │                    │
│  │ • full_name             │     │ • full_name             │                    │
│  │ • user_id               │     │ • user_id               │                    │
│  │ • group_members[]       │     │ • type (GROUP/INDIV)    │                    │
│  │ • designation_id        │     │ • group_members[]       │                    │
│  └─────────────────────────┘     └─────────────────────────┘                    │
│                                                                                  │
│  ┌─────────────────────────┐     ┌─────────────────────────┐                    │
│  │   master_countries      │     │   country_aliases       │                    │
│  ├─────────────────────────┤     ├─────────────────────────┤                    │
│  │ • id                    │     │ • country_id (FK)       │                    │
│  │ • country_name          │     │ • alias                 │                    │
│  │ • latitude, longitude   │     │                         │                    │
│  │ • region                │     │                         │                    │
│  └─────────────────────────┘     └─────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 The Core Problem: Text-Based Linking

```
🔴 PROBLEM: All relationships use TEXT matching, not Foreign Keys!

┌─────────────────────────────────────────────────────────────────┐
│                    TEXT-BASED RELATIONSHIPS                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  fp_data_excel.customername ←─TEXT─→ fp_customer_master.name    │
│  fp_data_excel.salesrepname ←─TEXT─→ employees.full_name        │
│  fp_data_excel.countryname  ←─TEXT─→ master_countries.name      │
│  fp_customer_master.country ←─TEXT─→ master_countries.name      │
│  fp_customer_master.sales_rep ←TEXT→ employees.full_name        │
│                                                                  │
│  CONSEQUENCES:                                                   │
│  • "Al Hayat Co" ≠ "Al-Hayat Company" (name variations)         │
│  • Case sensitivity issues ("RIAD" vs "Riad")                   │
│  • Spaces and trimming issues                                   │
│  • No referential integrity                                      │
│  • Data can get out of sync                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. How Different Pages Query Data

### 3.1 CustomerList.jsx (`/api/crm/customers`)

```javascript
// DIRECT query to fp_customer_master
SELECT cm.*, sales_stats.last_order_period
FROM fp_customer_master cm
LEFT JOIN (
  SELECT LOWER(TRIM(customername)) as customer_key, MAX(year*100+month) as last_order_period
  FROM fp_data_excel
  GROUP BY LOWER(TRIM(customername))
) sales_stats ON LOWER(TRIM(cm.customer_name)) = sales_stats.customer_key
WHERE cm.country = $country AND cm.is_active = $is_active
```

**Result:** Shows ALL customers in fp_customer_master ✅

### 3.2 CustomerMapView.jsx (`/api/crm/my-customers/map`) - BEFORE FIX

```javascript
// INDIRECT query - goes through fp_data_excel first
Step 1: Get sales rep name from crm_sales_reps
Step 2: Get customer NAMES from fp_data_excel WHERE salesrepname = $rep
Step 3: Apply merge rules to get canonical names
Step 4: Match names against fp_customer_master

// Problem: If customer exists in master but name not in fp_data_excel → MISSING!
```

**Result:** Shows ONLY customers with exact name match ❌

### 3.3 MyCustomers.jsx (`/api/crm/my-customers`)

Same indirect approach as map - has same problem.

---

## 4. Impact Analysis

### 4.1 Files Using `fp_data_excel` (17+ files)

| File | Purpose | Risk if Changed |
|------|---------|-----------------|
| `server/routes/actual.js` | Actual data CRUD | 🔴 CRITICAL |
| `server/routes/budget.js` | Budget retrieval | 🔴 CRITICAL |
| `server/routes/budget-html.js` | HTML export | 🔴 CRITICAL |
| `server/routes/crm/index.js` | CRM customer data | 🔴 CRITICAL |
| `server/database/fp-data.js` | Core FP service | 🔴 CRITICAL |
| `server/database/universal-data.js` | Dashboard data | 🔴 CRITICAL |

### 4.2 Files Using `fp_customer_master` (20+ files)

| File | Purpose | Risk if Changed |
|------|---------|-----------------|
| `server/routes/crm/index.js` | All CRM CRUD | 🔴 CRITICAL |
| `server/routes/customer-master.js` | Customer management | 🔴 CRITICAL |
| `server/database/fp-data.js` | Customer lists | 🔴 CRITICAL |

### 4.3 Files Using `salesrepname` field (100+ locations)

| Area | Files | Impact |
|------|-------|--------|
| Dashboard | 15+ | All sales aggregations |
| Budget | 10+ | Budget entries by rep |
| Reports | 12+ | Executive summaries |
| AI/ML | 6+ | Learning services |

### 4.4 React Components Affected

| Component | Purpose | Risk |
|-----------|---------|------|
| `CustomerList.jsx` | Customer list view | 🔴 CRITICAL |
| `MyCustomers.jsx` | Sales rep's customers | 🔴 CRITICAL |
| `CustomerMapView.jsx` | Customer map | 🔴 CRITICAL |
| `CustomerDetail.jsx` | Customer details | 🔴 CRITICAL |
| `CRMDashboard.jsx` | CRM dashboard | 🔴 CRITICAL |
| `SalesRepReports.jsx` | Sales rep reports | 🔴 CRITICAL |
| `BudgetEntryPage.jsx` | Budget entry | 🔴 CRITICAL |

---

## 5. Quick Fix Applied

### 5.1 Change Made

Modified `/api/crm/my-customers/map` endpoint to use `EXISTS` subquery:

```javascript
// NEW APPROACH - Uses fp_customer_master as source of truth
// but validates customer has sales data for the sales rep
const result = await pool.query(`
  SELECT DISTINCT cm.* 
  FROM fp_customer_master cm
  WHERE cm.is_active = true
  AND EXISTS (
    SELECT 1 FROM fp_data_excel de 
    WHERE LOWER(TRIM(de.customername)) = LOWER(TRIM(cm.customer_name))
    AND UPPER(TRIM(de.salesrepname)) IN (${salesRepPlaceholders})
  )
  ${countryFilter}
  ${typeFilter}
  ORDER BY cm.customer_name
`, params);
```

### 5.2 Why This Works

- Queries `fp_customer_master` directly (single source of truth)
- Uses `EXISTS` to verify customer has sales data for the rep
- No name list building - avoids name mismatch issues
- Consistent with how CustomerList queries data

---

## 6. Full Migration Plan (Future)

### Phase 1: Create Proper Master Tables (Week 1)

```sql
-- 1. Create master_salesreps table with name variations
CREATE TABLE master_salesreps (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id),
  user_id INTEGER REFERENCES users(id),
  full_name VARCHAR(255) NOT NULL,
  name_variations JSONB DEFAULT '[]',  -- All known variations
  type VARCHAR(20) DEFAULT 'INDIVIDUAL',
  group_member_ids INTEGER[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Create proper master_customers table
CREATE TABLE master_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code VARCHAR(50) UNIQUE NOT NULL,
  customer_name VARCHAR(500) NOT NULL,
  name_variations JSONB DEFAULT '[]',
  country_id INTEGER REFERENCES master_countries(id),
  sales_rep_id INTEGER REFERENCES master_salesreps(id),
  customer_type VARCHAR(50) DEFAULT 'Company',
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  pin_confirmed BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Create customer name lookup table
CREATE TABLE customer_name_map (
  id SERIAL PRIMARY KEY,
  raw_name VARCHAR(500) NOT NULL,
  raw_name_lower VARCHAR(500) NOT NULL,
  customer_id UUID REFERENCES master_customers(id),
  source VARCHAR(50),
  UNIQUE(raw_name_lower)
);
CREATE INDEX idx_customer_name_map_lower ON customer_name_map(raw_name_lower);
```

### Phase 2: Data Migration Script (Week 1-2)

1. Extract all unique sales rep names from `fp_data_excel`
2. Match to employees and create `master_salesreps` entries
3. Extract all unique customer names
4. Apply merge rules and create `master_customers` entries
5. Build `customer_name_map` lookup table

### Phase 3: Update Endpoints (Week 2-3)

1. Create unified customer query service
2. Update all CRM endpoints to use new tables
3. Update dashboard queries
4. Update budget queries
5. Extensive testing

### Phase 4: Add Sync Triggers (Week 3)

```sql
-- Auto-resolve new sales data to customer IDs
CREATE TRIGGER trg_resolve_sales_customer
BEFORE INSERT ON fp_data_excel
FOR EACH ROW
EXECUTE FUNCTION resolve_sales_customer();
```

---

## 7. Correct Architecture (Target State)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         TARGET DATA ARCHITECTURE                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ master_countries│     │ master_salesreps│     │ master_products │
│                 │     │                 │     │                 │
│ • id (PK)       │     │ • id (PK)       │     │ • id (PK)       │
│ • country_name  │     │ • full_name     │     │ • pg_combine    │
│ • lat/lng       │     │ • user_id (FK)  │     │ • material      │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │ FK                    │ FK                    │ FK
         ▼                       ▼                       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           master_customers                                        │
│  • id (UUID, PK)                                                                  │
│  • country_id (FK → master_countries)      ← ID, not text!                       │
│  • sales_rep_id (FK → master_salesreps)    ← ID, not text!                       │
└──────────────────────────────────────────────────────────────────────────────────┘
         │ FK (customer_id)
         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              sales_transactions                                   │
│  • customer_id (FK → master_customers)     ← ID reference!                       │
│  • sales_rep_id (FK → master_salesreps)    ← ID reference!                       │
│  • country_id (FK → master_countries)      ← ID reference!                       │
│  • product_id (FK → master_products)       ← ID reference!                       │
└──────────────────────────────────────────────────────────────────────────────────┘

BENEFITS:
✅ Single source of truth for all pages
✅ Foreign key constraints ensure data integrity
✅ No name matching issues
✅ Faster queries with indexed IDs
✅ Easy to handle name variations
```

---

## 8. Testing Checklist (For Full Migration)

### Before Migration
- [ ] Backup all databases
- [ ] Document current customer counts per sales rep
- [ ] Document current country coverage
- [ ] Screenshot all dashboards

### After Migration
- [ ] Verify customer counts match
- [ ] Test all CRM pages (list, map, detail)
- [ ] Test dashboard charts
- [ ] Test budget entry/export
- [ ] Test reports generation
- [ ] Test AI/ML services
- [ ] Performance testing

---

## 9. Files Modified by Quick Fix

| File | Change |
|------|--------|
| `server/routes/crm/index.js` | Modified `/my-customers/map` endpoint |

---

## 10. Related Documentation

- [CRM Implementation Guide](./CRM_FRONTEND_IMPLEMENTATION_GUIDE.md)
- [Database Setup](./DATABASE_SETUP.md)
- [Customer Merging System](./CUSTOMER_MERGING_SYSTEM_README.md)

---

**Document Author:** GitHub Copilot  
**Last Updated:** December 31, 2025
