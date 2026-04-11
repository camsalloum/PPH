# 🗄️ CRM DATABASE FOUNDATION - COMPLETE
## Backend Data Layer Implementation

**Completed:** December 28, 2025  
**Status:** ✅ READY FOR FRONTEND  
**Next Phase:** CRM Frontend Implementation

---

## 📋 EXECUTIVE SUMMARY

The CRM database foundation is now complete with three core entities:

| Entity | Table/View | Records | Location | Sync |
|--------|-----------|---------|----------|------|
| **Sales Reps** | `crm_sales_reps` (VIEW) | 6 active | `ip_auth_database` | Dynamic |
| **Customers** | `fp_customer_master` | 572 | `fp_database` | Auto-trigger |
| **Products** | `crm_product_groups` | 13 | `fp_database` | Auto-trigger |

---

## 1️⃣ SALES REPS: `crm_sales_reps` VIEW

### Location
- **Database:** `ip_auth_database`
- **Type:** VIEW (dynamic, always fresh)

### Eligibility Rule
```
Employee Active + Has User Account + designation.department = 'Sales'
```

### Current Active CRM Users (6)

| Name | Type | Group Members |
|------|------|---------------|
| Christopher | Individual | - |
| Narek | Individual | - |
| Rahil | Individual | - |
| Riad | Group | Riad, Nidal |
| Sofiane | Group | Sofiane, Mouath, Kevin |
| Sojy | Group | Sojy, Hisham, Direct Sales |

### VIEW Definition
```sql
CREATE OR REPLACE VIEW crm_sales_reps AS
SELECT 
    e.id as employee_id,
    CONCAT(e.first_name, ' ', e.last_name) as full_name,
    u.id as user_id,
    u.email,
    d.title as designation,
    d.department,
    COALESCE(
        (SELECT string_agg(m.member_name, ', ' ORDER BY m.member_name)
         FROM fp_database.public.sales_rep_group_members m
         WHERE m.group_id = (
             SELECT g.id FROM fp_database.public.sales_rep_groups g 
             WHERE g.group_name ILIKE e.first_name || '%' 
                OR g.group_name ILIKE e.last_name || '%'
             LIMIT 1
         )),
        'Individual'
    ) as group_members,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM fp_database.public.sales_rep_groups g 
            WHERE g.group_name ILIKE e.first_name || '%' 
               OR g.group_name ILIKE e.last_name || '%'
        ) THEN 'Group'
        ELSE 'Individual'
    END as type
FROM employees e
JOIN users u ON e.user_id = u.id
JOIN designations d ON e.designation_id = d.id
WHERE e.is_active = true 
  AND u.id IS NOT NULL
  AND LOWER(d.department) = 'sales';
```

### Script
- **File:** `server/scripts/create-crm-view.js`

---

## 2️⃣ CUSTOMERS: `fp_customer_master`

### Location
- **Database:** `fp_database`
- **Type:** TABLE with auto-sync triggers

### Statistics
- **Total Customers:** 572
- **From Actual Sales (fp_data_excel):** 563
- **From Budget Data:** 91
- **Deduplicated via Merge Rules:** Automatic

### Table Structure

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `customer_code` | VARCHAR(50) | Unique code (FP-CUST-2025-XXXXX) |
| `customer_name` | VARCHAR(255) | Display name (merged name if applicable) |
| `original_customers` | JSONB | Array of original names before merge |
| `country` | VARCHAR(100) | Primary country |
| `countries` | JSONB | All countries for this customer |
| `sales_rep` | VARCHAR(255) | Assigned sales rep |
| `sales_reps` | JSONB | All reps who sold to this customer |
| `first_transaction_date` | DATE | First known transaction |
| `last_transaction_date` | DATE | Most recent transaction |
| `total_transactions` | INTEGER | Count of transactions |
| `data_source` | VARCHAR(50) | 'actual', 'budget', 'both' |
| `is_active` | BOOLEAN | Active status |
| `created_at` | TIMESTAMP | Record creation |
| `updated_at` | TIMESTAMP | Last update |

### Auto-Sync Triggers

1. **`trg_sync_customer_excel`** - Fires on INSERT to `fp_data_excel`
2. **`trg_sync_customer_budget`** - Fires on INSERT to `fp_sales_rep_budget`

### Sync Logic
- Checks `fp_division_customer_merge_rules` for merged customers
- Uses JSONB `?` operator for array membership
- Generates unique customer codes
- Preserves merge relationships in `original_customers`

### Scripts
- **Setup:** `server/scripts/setup-customer-sync.js`
- **Analysis:** `server/scripts/analyze-customer-sources.js`

---

## 3️⃣ PRODUCTS: `crm_product_groups`

### Location
- **Database:** `fp_database`
- **Type:** TABLE with auto-sync trigger

### Statistics
- **Total Product Groups:** 13
- **Source:** `fp_material_percentages` (Material Percentages page)

### Current Product Groups

| ID | Product Group | Material | Process |
|----|---------------|----------|---------|
| 1 | Commercial Items Plain | PE | Plain |
| 2 | Commercial Items Printed | PE | Printed |
| 3 | Industrial Items Plain | PE | Plain |
| 4 | Industrial Items Printed | PE | Printed |
| 5 | Laminates | Non PE | Printed |
| 6 | Mono Layer Printed | Non PE | Printed |
| 7 | Services Charges | Others | Others |
| 8 | Shrink Film Plain | PE | Plain |
| 9 | Shrink Film Printed | PE | Printed |
| 10 | Shrink Sleeves | Non PE | Printed |
| 11 | Wide Film | PE | Plain |
| 12 | Wrap Around Label | Non PE | Printed |
| 13 | Others | Others | Others |

### Table Structure

| Column | Type | Description |
|--------|------|-------------|
| **Synced Fields** |||
| `id` | SERIAL | Primary key |
| `source_id` | INTEGER | Links to fp_material_percentages |
| `product_group` | VARCHAR(255) | PGCombine name (UNIQUE) |
| `material` | VARCHAR(100) | PE, Non PE, Others |
| `process` | VARCHAR(100) | Plain, Printed, Others |
| **CRM Control** |||
| `is_active` | BOOLEAN | Enable/disable for CRM |
| `display_order` | INTEGER | Sort order in dropdowns |
| `description` | TEXT | Product description for sales |
| **Order Constraints** |||
| `min_order_qty` | NUMERIC(10,2) | Minimum order quantity |
| `min_order_value` | NUMERIC(12,2) | Minimum order value (USD) |
| `lead_time_days` | INTEGER | Typical production lead time |
| **Sales Parameters** |||
| `commission_rate` | NUMERIC(5,2) | Sales commission % |
| `monthly_target` | NUMERIC(14,2) | Monthly sales target |
| `target_margin_pct` | NUMERIC(5,2) | Target margin % |
| `price_floor` | NUMERIC(12,2) | Minimum selling price |
| **Notes** |||
| `sales_notes` | TEXT | Notes for sales team |
| `internal_notes` | TEXT | Internal notes |
| **Timestamps** |||
| `created_at` | TIMESTAMP | Record creation |
| `updated_at` | TIMESTAMP | Last update |
| `synced_at` | TIMESTAMP | Last sync from source |

### Auto-Sync Trigger
- **`trg_material_percentages_to_crm`** - Fires on INSERT/UPDATE/DELETE to `fp_material_percentages`
- DELETE = soft delete (sets `is_active = false`)

### Scripts
- **Setup:** `server/scripts/setup-crm-product-groups.js`
- **Analysis:** `server/scripts/analyze-product-groups.js`

---

## 🔗 DATABASE RELATIONSHIP DIAGRAM

```
ip_auth_database                              fp_database
┌──────────────────────┐                     ┌──────────────────────────┐
│ users                │                     │ fp_data_excel            │
│ employees            │                     │ (Actual Sales Data)      │
│ designations         │                     └─────────────┬────────────┘
└──────────┬───────────┘                                   │
           │                                               │ TRIGGER
           ▼                                               ▼
┌──────────────────────┐                     ┌──────────────────────────┐
│ crm_sales_reps       │◄────────────────────│ fp_customer_master       │
│ (VIEW)               │    sales_rep        │ (572 customers)          │
│ 6 active users       │                     └──────────────────────────┘
└──────────────────────┘                                   ▲
                                                           │ TRIGGER
                                             ┌─────────────┴────────────┐
                                             │ fp_sales_rep_budget      │
                                             │ (Budget Data)            │
                                             └──────────────────────────┘

┌──────────────────────┐                     ┌──────────────────────────┐
│ fp_material_         │───── TRIGGER ──────▶│ crm_product_groups       │
│ percentages          │                     │ (13 products)            │
│ (Source of Truth)    │                     │ + CRM parameters         │
└──────────────────────┘                     └──────────────────────────┘
```

---

## 📁 SCRIPTS CREATED

| Script | Purpose |
|--------|---------|
| `server/scripts/analyze-crm-data.js` | Initial CRM data analysis |
| `server/scripts/check-crm-active-users.js` | User analysis |
| `server/scripts/check-crm-eligibility.js` | Eligibility check v1 |
| `server/scripts/check-crm-eligibility-v2.js` | Using employees table |
| `server/scripts/check-crm-final.js` | Using designation.department |
| `server/scripts/create-crm-view.js` | Creates crm_sales_reps VIEW |
| `server/scripts/analyze-customer-sources.js` | Customer source analysis |
| `server/scripts/setup-customer-sync.js` | Customer sync with triggers |
| `server/scripts/analyze-product-groups.js` | Product groups analysis |
| `server/scripts/setup-crm-product-groups.js` | Product groups table + trigger |

---

## ✅ READY FOR FRONTEND

### API Endpoints Needed

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/crm/sales-reps` | GET | List CRM-eligible sales reps |
| `/api/crm/customers` | GET | List customers with filters |
| `/api/crm/customers/:id` | GET | Single customer details |
| `/api/crm/products` | GET | List product groups |
| `/api/crm/products/:id` | GET/PUT | Get/update product details |

### Frontend Components Needed

1. **CRM Dashboard** - Overview with KPIs
2. **Sales Reps List** - View active sales team
3. **Customer List** - Searchable customer directory
4. **Product Groups** - Manage CRM product settings
5. **Customer 360** - Full customer view with history

---

## 🚀 NEXT PHASE: FRONTEND IMPLEMENTATION

### Suggested Order

1. **CRM Route & Navigation** - Add CRM menu item
2. **CRM Dashboard** - Summary cards, recent activity
3. **Customer List** - Table with search, filters
4. **Customer Detail** - 360° view with sales history
5. **Product Groups Admin** - Edit CRM parameters
6. **Sales Rep Directory** - Team view

### Technology Stack
- React (existing)
- Material UI / existing styling
- React Query for data fetching
- Same auth system as existing app

---

**Document Version:** 1.0  
**Last Updated:** December 28, 2025  
**Author:** GitHub Copilot (Claude Opus 4.5)
