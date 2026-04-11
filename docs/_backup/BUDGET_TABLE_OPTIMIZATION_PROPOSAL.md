# Budget Table Structure Analysis & Optimization Proposal

## Executive Summary

The `fp_budget_unified` table contains **84 columns**, but analysis shows:
- **13 columns are ALWAYS NULL** (never used for budget data)
- **2 columns are DUPLICATES** (year vs budget_year)
- **~40 columns are ERP/Oracle-specific** and irrelevant for budget planning

**Impact:** 
- 180 records recently saved used wrong division_name ("FP" instead of "Flexible Packaging Division")
- Massive bloat makes queries slower and schema confusing
- Developers waste time understanding which columns are relevant

---

## Detailed Analysis

### 1. ALWAYS NULL Columns (Never Used in Budget)
These 13 columns are **always empty** in budget records and serve no purpose:

```
✗ invoice_date          - Only relevant for actual invoices from Oracle
✗ invoice_no            - Only relevant for actual invoices from Oracle  
✗ transaction_type      - Only relevant for actual transactions
✗ customer_code         - Not used (customer_name is used instead)
✗ contact_name          - Customer contact details (not needed for budget)
✗ address_1             - Customer address (not needed for budget)
✗ credit_limit          - Financial customer data (not needed for budget)
✗ payment_terms         - Payment conditions (not needed for budget)
✗ item_code             - Oracle item codes (not needed for budget)
✗ selection_code        - Oracle selection codes (irrelevant for budget)
✗ machine_no            - Production machine numbers (irrelevant for budget)
✗ erp_row_id            - Oracle ERP row identifier (not applicable to budget)
✗ sync_source           - Data sync metadata (not applicable to budget)
```

**Recommendation:** **DELETE these 13 columns** from fp_budget_unified.

---

### 2. DUPLICATE Year Columns

**Problem:** Table has BOTH `year` and `budget_year`:
- `year`: Used in 89.8% of records (1,584 out of 1,764)
- `budget_year`: Used in 100% of records (1,764 out of 1,764)

**Why Duplication Exists:**
The table was designed to hold BOTH actual data (from Oracle, uses `year`) AND budget data (uses `budget_year`). However, this creates confusion.

**Current Usage:**
```sql
-- Sales Rep Budgets use BOTH:
year = 2025 (for pricing reference)
budget_year = 2026 (the actual budget year)

-- Divisional Budgets use ONLY budget_year:
year = NULL
budget_year = 2026
```

**Recommendation:** 
- **KEEP:** `budget_year` (primary year field)
- **DELETE:** `year` column
- **REASONING:** Budget records should only reference one year. If pricing needs a different year, that should be handled in the pricing tables, not stored redundantly.

---

### 3. Unnecessary Customer Detail Columns

These customer-related columns are **excessive** for budget planning:

```
Questionable Columns:
- customer_title        (e.g., "Mr.", "Dr." - not needed for budget)
- financial_customer    (financial system reference - not needed)
- first_ran_date        (when customer was first added - irrelevant)
- contact_position      (e.g., "Manager" - not needed for budget)
- contact_dept          (e.g., "Sales" - not needed for budget)
- contact_tel           (phone number - not needed for budget)
- contact_mobile        (mobile number - not needed for budget)
- contact_email         (email - not needed for budget)
- address_2             (secondary address - not needed for budget)
- post_box              (PO Box - not needed for budget)
- phone                 (duplicate of contact_tel)
- building              (building name - not needed for budget)
- payment_code          (payment method code - not needed for budget)
- payment_days          (payment terms in days - not needed for budget)
- delivery_terms        (delivery conditions - not needed for budget)
```

**Budget needs ONLY:**
- `customer_name` (who we're selling to)
- `country` (where they're located)

**Recommendation:** **DELETE these 16 customer detail columns**.

---

### 4. Unnecessary Product/Item Detail Columns

These product-related columns are **Oracle ERP artifacts**:

```
Oracle-Specific Columns (Not Needed for Budget):
- item_code             (Oracle item code - not used)
- item_desc             (Oracle item description - not used)
- item_group_code       (Oracle grouping - not used)
- item_group_desc       (Oracle grouping description - not used)
- product_type          (redundant with pgcombine)
- subgroup              (fine-grained grouping - not used)
- weight                (item weight - not relevant for budget planning)
- unit_desc             (unit of measure - always KGS for budget)
- selection_code_desc   (Oracle selection description - not used)
- title_code            (Oracle title code - not used)
- title_name            (Oracle title name - not used)
- business_partner_type (Oracle BP type - not relevant)
- qty_storage_units     (warehouse units - not used)
- qty_delivered         (delivered quantity - not used, budget uses qty_kgs)
```

**Budget needs ONLY:**
- `pgcombine` (product group - e.g., "Commercial Items Plain")
- `qty_kgs` (quantity in kilograms)

**Recommendation:** **DELETE these 14 product detail columns**.

---

### 5. Unnecessary Machine/Manufacturing Columns

These columns are **production-specific** and irrelevant for budget:

```
✗ machine_name          - Which machine produced the item (not needed for budget)
✗ machine_no            - Machine number (not needed for budget)
```

**Recommendation:** **DELETE these 2 columns**.

---

### 6. ERP Sync Metadata Columns

These columns track **Oracle ERP synchronization**:

```
- last_sync_date        (when Oracle data was last synced)
- erp_sync_timestamp    (ERP sync timestamp)
- erp_last_modified     (when ERP record was modified)
- erp_extra_data        (JSONB - extra ERP data)
```

**Reality:** Budget data is **manually entered**, not synced from Oracle.

**Recommendation:** **DELETE these 4 ERP sync columns** (only keep for fp_actualcommon).

---

## Proposed Optimized Schema

### **KEEP (29 Essential Columns):**

#### Core Identifiers (3)
```sql
✓ id                    - Primary key
✓ division_name         - Full division name (e.g., "Flexible Packaging Division")
✓ division_code         - Division code (e.g., "FP")
```

#### Time Period (3)
```sql
✓ budget_year           - Budget year (e.g., 2026)
✓ month                 - Month name (e.g., "January")
✓ month_no              - Month number (1-12)
```

#### Budget Classification (5)
```sql
✓ sales_rep_name        - Sales rep (NULL for divisional budgets)
✓ customer_name         - Customer (NULL for divisional budgets)
✓ country               - Country (NULL for divisional budgets)
✓ sales_rep_group_id    - Sales rep group ID
✓ sales_rep_group_name  - Sales rep group name
```

#### Product (1)
```sql
✓ pgcombine             - Product group (e.g., "Commercial Items Plain")
```

#### Financial Metrics (6)
```sql
✓ qty_kgs               - Quantity in kilograms
✓ amount                - Sales amount
✓ material_value        - Material cost
✓ op_value              - Operation cost
✓ total_value           - Total cost
✓ morm                  - Margin over raw material
✓ margin_over_total     - Margin percentage
```

#### Budget Management (6)
```sql
✓ is_budget             - Flag: true for budget records
✓ budget_status         - Status: draft/approved
✓ budget_version        - Version: v1, v2, etc.
✓ budget_notes          - Notes/comments
✓ created_by            - Who created the budget
✓ reviewed_by           - Who reviewed/approved
```

#### Material/Process (2)
```sql
✓ material              - Material type (e.g., "LDPE")
✓ process               - Process type (e.g., "Extrusion")
```

#### Audit/Tracking (3)
```sql
✓ created_at            - When record was created
✓ updated_at            - When record was last updated
✓ reviewed_at           - When budget was reviewed
```

---

### **DELETE (55 Columns):**

#### Year Duplication (1)
```
✗ year                  - Duplicate of budget_year
```

#### Invoice/Transaction (3)
```
✗ invoice_date
✗ invoice_no
✗ transaction_type
```

#### Customer Details (16)
```
✗ customer_title
✗ customer_code
✗ financial_customer
✗ first_ran_date
✗ contact_name
✗ contact_position
✗ contact_dept
✗ contact_tel
✗ contact_mobile
✗ contact_email
✗ address_1
✗ address_2
✗ post_box
✗ phone
✗ building
✗ credit_limit
✗ payment_code
✗ payment_terms
✗ payment_days
✗ delivery_terms
```

#### Product/Item Details (14)
```
✗ item_code
✗ item_desc
✗ item_group_code
✗ item_group_desc
✗ product_type
✗ product_group         (replaced by pgcombine)
✗ subgroup
✗ weight
✗ unit_desc
✗ selection_code
✗ selection_code_desc
✗ title_code
✗ title_name
✗ business_partner_type
✗ qty_storage_units
✗ qty_delivered
```

#### Machine/Manufacturing (2)
```
✗ machine_no
✗ machine_name
```

#### ERP Sync (5)
```
✗ sync_source
✗ last_sync_date
✗ erp_row_id
✗ erp_sync_timestamp
✗ erp_last_modified
✗ erp_extra_data
```

#### Miscellaneous (4)
```
✗ subdivision           (not used)
✗ admin_division_code   (redundant with division_code)
✗ company_code          (can be derived from division)
✗ uploaded_filename     (not critical)
✗ uploaded_at           (not critical)
```

---

## Implementation Plan

### Phase 1: Backup & Analysis (Day 1)
```bash
# 1. Full database backup
pg_dump -h localhost -U postgres fp_database > backup_before_cleanup.sql

# 2. Export current budget data
COPY (SELECT * FROM fp_budget_unified WHERE is_budget = true) 
TO '/path/to/budget_export.csv' CSV HEADER;

# 3. Document all views/functions that use these columns
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_definition LIKE '%fp_budget_unified%';
```

### Phase 2: Create Optimized Table (Day 2)
```sql
-- Create new optimized table
CREATE TABLE fp_budget_unified_v2 (
  -- Core Identifiers
  id SERIAL PRIMARY KEY,
  division_name VARCHAR NOT NULL,
  division_code VARCHAR NOT NULL,
  
  -- Time Period
  budget_year INTEGER NOT NULL,
  month VARCHAR,
  month_no INTEGER,
  
  -- Budget Classification
  sales_rep_name VARCHAR,
  customer_name VARCHAR,
  country VARCHAR,
  sales_rep_group_id INTEGER,
  sales_rep_group_name VARCHAR,
  
  -- Product
  pgcombine VARCHAR,
  
  -- Financial Metrics
  qty_kgs NUMERIC,
  amount NUMERIC,
  material_value NUMERIC,
  op_value NUMERIC,
  total_value NUMERIC,
  morm NUMERIC,
  margin_over_total NUMERIC,
  
  -- Budget Management
  is_budget BOOLEAN DEFAULT true,
  budget_status VARCHAR DEFAULT 'draft',
  budget_version VARCHAR DEFAULT 'v1',
  budget_notes TEXT,
  created_by VARCHAR,
  reviewed_by VARCHAR,
  
  -- Material/Process
  material VARCHAR,
  process VARCHAR,
  
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_budget_v2_year ON fp_budget_unified_v2(budget_year);
CREATE INDEX idx_budget_v2_division ON fp_budget_unified_v2(division_code);
CREATE INDEX idx_budget_v2_status ON fp_budget_unified_v2(budget_status);
CREATE INDEX idx_budget_v2_salesrep ON fp_budget_unified_v2(sales_rep_name);
```

### Phase 3: Migrate Data (Day 2)
```sql
INSERT INTO fp_budget_unified_v2 (
  division_name, division_code, budget_year, month, month_no,
  sales_rep_name, customer_name, country, sales_rep_group_id, sales_rep_group_name,
  pgcombine, qty_kgs, amount, material_value, op_value, total_value, morm, margin_over_total,
  is_budget, budget_status, budget_version, budget_notes, created_by, reviewed_by,
  material, process, created_at, updated_at, reviewed_at
)
SELECT 
  division_name, division_code, budget_year, month, month_no,
  sales_rep_name, customer_name, country, sales_rep_group_id, sales_rep_group_name,
  pgcombine, qty_kgs, amount, material_value, op_value, total_value, morm, margin_over_total,
  is_budget, budget_status, budget_version, budget_notes, created_by, reviewed_by,
  material, process, created_at, updated_at, reviewed_at
FROM fp_budget_unified
WHERE is_budget = true;

-- Verify record count
SELECT COUNT(*) FROM fp_budget_unified WHERE is_budget = true;  -- Should be 1764
SELECT COUNT(*) FROM fp_budget_unified_v2;  -- Should match
```

### Phase 4: Update Code (Day 3)
```javascript
// Update all INSERT statements in:
// - server/routes/budget-draft.js
// - server/routes/aebf/divisional.js
// - Any other files that INSERT into fp_budget_unified

// Example update:
INSERT INTO fp_budget_unified_v2 (
  division_name, division_code, budget_year, month, month_no,
  pgcombine, qty_kgs, budget_status, is_budget,
  created_at, updated_at, created_by
) VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system')
```

### Phase 5: Testing (Day 4)
- Test divisional budget save
- Test sales rep budget save
- Test budget retrieval/display
- Test budget approval workflow
- Test budget vs actual comparison reports

### Phase 6: Cutover (Day 5)
```sql
-- Rename tables
ALTER TABLE fp_budget_unified RENAME TO fp_budget_unified_old;
ALTER TABLE fp_budget_unified_v2 RENAME TO fp_budget_unified;

-- Drop old table after 1 week of successful operation
-- DROP TABLE fp_budget_unified_old;
```

---

## Expected Benefits

### 1. Performance
- **84 columns → 29 columns** (65% reduction)
- Faster queries (less data to scan)
- Smaller indexes
- Reduced storage footprint

### 2. Clarity
- Clear distinction between budget and actual data
- No confusion about which columns to use
- Easier for new developers to understand

### 3. Maintainability
- Less technical debt
- Fewer bugs from using wrong columns
- Cleaner API responses

### 4. Data Integrity
- No more null invoice fields in budget data
- Proper year handling (single source of truth)
- Consistent division naming

---

## Risk Assessment

### Low Risk
- Old table can be kept as backup
- Migration is straightforward (simple INSERT ... SELECT)
- Only affects budget records (not actual data from Oracle)

### Mitigation
- Full backup before starting
- Test thoroughly on dev/staging first
- Keep old table for 1-2 weeks before dropping
- Rollback plan: Rename tables back

---

## Conclusion

The current `fp_budget_unified` table is **bloated with 55 unnecessary columns** that serve no purpose for budget planning. These columns are artifacts from copying the structure of `fp_actualcommon` (which imports Oracle ERP data).

**Recommendation:** Implement the optimized 29-column schema to:
- Eliminate confusion (year vs budget_year)
- Remove unused invoice/transaction fields
- Improve query performance
- Simplify development and maintenance

**Timeline:** 5 days with proper testing and rollback capability.

**Priority:** High - current structure causes data quality issues (wrong division_name) and developer confusion.
