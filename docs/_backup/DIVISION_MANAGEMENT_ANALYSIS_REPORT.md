# 📊 Division Management Analysis Report
**Date**: November 23, 2025  
**Analysis**: Deep dive into division lifecycle (creation/deletion)  
**Purpose**: Define what to delete and what to create for division management

---

## 🏗️ Current Architecture

### Database Structure Overview
The system uses **TWO PostgreSQL databases**:

1. **`fp_database`** - Main data storage (ALL divisions share this)
2. **`fp_auth_database`** - Authentication & user management

### Key Finding: SHARED DATABASE ARCHITECTURE
**All divisions (FP, SB, TF, HCM) use the SAME database (`fp_database`) with division-specific TABLES**

---

## 📁 Division-Specific Tables (One per Division)

### Pattern: `{code}_data_excel` tables
Each division has its own dedicated table for operational data.

> **Important:** The division codes shown in the table below (`FP`, `SB`, `TF`, `HCM`) are **examples used for documentation**.  
> Your live system uses the divisions defined in `company_settings.divisions` in the auth database (for example, currently only `FP` and `HC`).

| Division | Table Name | Status | Location |
|----------|------------|--------|----------|
| **FP** | `fp_data_excel` | ✅ Example active | fp_database |
| **SB** | `sb_data_excel` | ✅ Example created | fp_database |
| **TF** | `tf_data_excel` | ✅ Example created | fp_database |
| **HCM** | `hcm_data_excel` | ✅ Example created | fp_database |

**Table Structure** (identical for all divisions):
```sql
CREATE TABLE {division}_data_excel (
    id BIGSERIAL PRIMARY KEY,
    sourcesheet TEXT NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    type TEXT NOT NULL,  -- 'Actual', 'Budget', 'Forecast'
    salesrepname TEXT,
    customername TEXT,
    countryname TEXT,
    productgroup TEXT NOT NULL,
    material TEXT,
    process TEXT,
    values_type TEXT NOT NULL,  -- 'KGS', 'Amount'
    values NUMERIC,
    updatedat TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
```

**Created by**: `server/scripts/create-missing-division-tables.sql`

---

## 📊 Shared Tables with Division Column

These tables are **SHARED** across all divisions, using a `division` column to separate data:

### In `fp_database` (Main Database)

| Table Name | Division Column | Purpose | Data Scope |
|------------|----------------|---------|------------|
| `product_group_pricing_rounding` | `division VARCHAR(10)` | Product pricing by division/year | Division-specific pricing |
| `division_customer_merge_rules` | `division VARCHAR(100)` | Customer merge rules | Division-specific rules |
| `merge_rule_suggestions` | `division VARCHAR(100)` | AI merge suggestions | Division-specific |
| `database_upload_log` | `division VARCHAR(100)` | Upload tracking | Division-specific logs |
| `merge_rule_notifications` | `division VARCHAR(100)` | Admin notifications | Division-specific |
| `customer_similarity_cache` | `division VARCHAR(100)` | AI cache | Division-specific |
| `sales_rep_budget` | `division VARCHAR(50)` | Sales rep budgets | Division-specific budgets |
| `sales_rep_budget_draft` | `division VARCHAR(50)` | Budget drafts | Division-specific drafts |
| `merge_rule_rejections` | `division VARCHAR(50)` | Rejection feedback | Division-specific |

### In `fp_auth_database` (Authentication Database)

| Table Name | Division Column | Purpose | Data Scope |
|------------|----------------|---------|------------|
| `user_divisions` | `division VARCHAR(50)` | User-division access | User permissions per division |
| `user_sales_rep_access` | `division VARCHAR(50)` | Sales rep access | Division-specific access |
| `user_preferences` | `default_division VARCHAR(50)` | Default division | User preference |

---

## 🔍 Division-Agnostic Tables

These tables have **NO division column** and are shared globally:

### Master Data Tables (FP-specific, but referenced by other divisions)
| Table Name | Purpose | Notes |
|------------|---------|-------|
| `fp_material_percentages` | Material percentage configs | **Currently FP only** - may need division prefix |
| `fp_master_config` | Master configuration | **Currently FP only** - may need division prefix |

### Authentication Tables (Global)
| Table Name | Purpose |
|------------|---------|
| `users` | User accounts |
| `user_sessions` | Active sessions |
| `global_default_preferences` | System defaults |
| `company_settings` | Company info (logo, name, divisions array) |

### Reference Tables (Global)
| Table Name | Purpose |
|------------|---------|
| `global_config` | System-wide configuration |
| `customer_merge_rules` | **Legacy** - replaced by `division_customer_merge_rules` |

---

## ❌ WHAT TO DELETE When Division is Removed

### 🎯 Current Implementation Status: ✅ COMPLETE

When an admin deletes a division (e.g., "PP" or "IP"), the backend **CASCADE DELETES**:

### 1️⃣ In `fp_auth_database` (3 operations)
```sql
-- Remove user assignments to this division
DELETE FROM user_divisions WHERE division = '{code}';

-- Clear users who had this as default division
UPDATE user_preferences SET default_division = NULL WHERE default_division = '{code}';

-- Remove sales rep access for this division
DELETE FROM user_sales_rep_access WHERE division = '{code}';
```

### 2️⃣ In `fp_database` - Division-Specific Table
```sql
-- Drop the entire division table (if exists)
DROP TABLE IF EXISTS {code}_data_excel CASCADE;
```

### 3️⃣ In `fp_database` - Shared Tables with Division Column (9 tables)
```sql
-- Delete division-specific data from shared tables
DELETE FROM product_group_pricing_rounding WHERE division = '{code}';
DELETE FROM division_customer_merge_rules WHERE division = '{code}';
DELETE FROM merge_rule_suggestions WHERE division = '{code}';
DELETE FROM database_upload_log WHERE division = '{code}';
DELETE FROM merge_rule_notifications WHERE division = '{code}';
DELETE FROM customer_similarity_cache WHERE division = '{code}';
DELETE FROM sales_rep_budget WHERE division = '{code}';
DELETE FROM sales_rep_budget_draft WHERE division = '{code}';
DELETE FROM merge_rule_rejections WHERE division = '{code}';
```

### 📋 Impact Summary Before Deletion
The system shows:
- Number of affected users
- Users with this as default division
- Count of data records in division table
- Count of budget/pricing records

**Total: 3 auth operations + 1 table drop + 9 data deletions = 13 database operations**

**Transaction Safety**: All wrapped in BEGIN/COMMIT/ROLLBACK for atomicity

---

## ✅ WHAT TO CREATE When New Division is Added

### 🎯 Current Implementation Status: ⚠️ INCOMPLETE (Only logs message)

When an admin creates a new division (e.g., "PP - Plastic Products"), the system should:

### 1️⃣ Create Division-Specific Table in `fp_database`
```sql
CREATE TABLE IF NOT EXISTS {code}_data_excel (
    id BIGSERIAL PRIMARY KEY,
    sourcesheet TEXT NOT NULL,
    year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    type TEXT NOT NULL,
    salesrepname TEXT,
    customername TEXT,
    countryname TEXT,
    productgroup TEXT NOT NULL,
    material TEXT,
    process TEXT,
    values_type TEXT NOT NULL,
    values NUMERIC,
    updatedat TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_{code}_data_excel_country ON {code}_data_excel(countryname);
CREATE INDEX IF NOT EXISTS idx_{code}_data_excel_sales_rep ON {code}_data_excel(salesrepname);
CREATE INDEX IF NOT EXISTS idx_{code}_data_excel_year_month ON {code}_data_excel(year, month);
CREATE INDEX IF NOT EXISTS idx_{code}_data_excel_type ON {code}_data_excel(type);
CREATE INDEX IF NOT EXISTS idx_{code}_data_excel_product ON {code}_data_excel(productgroup);
CREATE INDEX IF NOT EXISTS idx_{code}_data_excel_customer ON {code}_data_excel(customername);
CREATE INDEX IF NOT EXISTS idx_{code}_data_excel_values ON {code}_data_excel(values_type);

-- Add table comment
COMMENT ON TABLE {code}_data_excel IS '{name} division sales data imported from Excel';
```

### 2️⃣ NO Need to Create Shared Tables
The following tables **already exist** and will automatically support the new division via their `division` column:

✅ `product_group_pricing_rounding` - Ready  
✅ `division_customer_merge_rules` - Ready  
✅ `merge_rule_suggestions` - Ready  
✅ `database_upload_log` - Ready  
✅ `merge_rule_notifications` - Ready  
✅ `customer_similarity_cache` - Ready  
✅ `sales_rep_budget` - Ready  
✅ `sales_rep_budget_draft` - Ready  
✅ `merge_rule_rejections` - Ready  
✅ `user_divisions` - Ready  
✅ `user_sales_rep_access` - Ready  

### 3️⃣ Update Company Settings
```sql
-- Update divisions array in company_settings
UPDATE company_settings 
SET setting_value = $1  -- New divisions JSON array
WHERE setting_key = 'divisions';
```

### 4️⃣ Optional: Create Division-Specific Master Data Tables
**Decision Needed**: Should each division have its own material percentages?

**Option A**: Keep FP-only (current)
- `fp_material_percentages` remains FP-specific
- Other divisions use default percentages

**Option B**: Create per-division (recommended for full isolation)
```sql
CREATE TABLE IF NOT EXISTS {code}_material_percentages (
  id SERIAL PRIMARY KEY,
  product_group VARCHAR(255) NOT NULL,
  pe_percentage DECIMAL(5,2) DEFAULT 0,
  bopp_percentage DECIMAL(5,2) DEFAULT 0,
  pet_percentage DECIMAL(5,2) DEFAULT 0,
  alu_percentage DECIMAL(5,2) DEFAULT 0,
  paper_percentage DECIMAL(5,2) DEFAULT 0,
  pvc_pet_percentage DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_group)
);

CREATE TABLE IF NOT EXISTS {code}_master_config (
  id SERIAL PRIMARY KEY,
  config_key VARCHAR(255) NOT NULL UNIQUE,
  config_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Option C**: Add division column to existing tables (hybrid approach)
```sql
ALTER TABLE fp_material_percentages 
ADD COLUMN IF NOT EXISTS division VARCHAR(10) DEFAULT 'FP';

ALTER TABLE fp_material_percentages
DROP CONSTRAINT IF EXISTS fp_material_percentages_product_group_key;

ALTER TABLE fp_material_percentages
ADD CONSTRAINT unique_division_product_group UNIQUE (division, product_group);
```

---

## 🔧 Implementation Recommendations

### Phase 1: Complete Deletion Logic ✅ DONE
- [x] CASCADE DELETE from all 13 locations
- [x] Impact checking before deletion
- [x] Transaction-based operations
- [x] Frontend confirmation dialog

### Phase 2: Implement Creation Logic ⚠️ NEEDS WORK
- [ ] Create `{code}_data_excel` table with indexes
- [ ] Verify shared tables support new division
- [ ] Update company settings with new division
- [ ] Optional: Create division-specific master data tables
- [ ] Add validation for division code format (2-4 uppercase letters)
- [ ] Add validation for duplicate division codes

### Phase 3: Testing & Validation
- [ ] Test division creation with various codes
- [ ] Test division deletion with data
- [ ] Test division deletion without data
- [ ] Verify all indexes created properly
- [ ] Performance testing with multiple divisions

---

## 📝 Code Changes Needed

### File: `server/routes/settings.js`

**Current Code** (Lines 318-323):
```javascript
// Handle new divisions - CREATE STRUCTURE
for (const newDiv of addedDivisions) {
  console.log(`Creating structure for new division: ${newDiv.code}`);
  console.log(`Division ${newDiv.code} (${newDiv.name}) is ready to use existing table structures`);
}
```

**Recommended Implementation**:
```javascript
// Handle new divisions - CREATE STRUCTURE
for (const newDiv of addedDivisions) {
  console.log(`Creating structure for new division: ${newDiv.code}`);
  
  // Validate division code format
  if (!/^[A-Z]{2,4}$/.test(newDiv.code)) {
    throw new Error(`Invalid division code: ${newDiv.code}. Must be 2-4 uppercase letters.`);
  }
  
  const tableName = `${newDiv.code.toLowerCase()}_data_excel`;
  
  // Create division-specific data table
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id BIGSERIAL PRIMARY KEY,
      sourcesheet TEXT NOT NULL,
      year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
      month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
      type TEXT NOT NULL,
      salesrepname TEXT,
      customername TEXT,
      countryname TEXT,
      productgroup TEXT NOT NULL,
      material TEXT,
      process TEXT,
      values_type TEXT NOT NULL,
      values NUMERIC,
      updatedat TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
    
    COMMENT ON TABLE ${tableName} IS '${newDiv.name} division sales data imported from Excel';
  `;
  
  await pool.query(createTableSQL);
  console.log(`✅ Created table: ${tableName}`);
  
  // Create indexes
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_${tableName}_country ON ${tableName}(countryname)`,
    `CREATE INDEX IF NOT EXISTS idx_${tableName}_sales_rep ON ${tableName}(salesrepname)`,
    `CREATE INDEX IF NOT EXISTS idx_${tableName}_year_month ON ${tableName}(year, month)`,
    `CREATE INDEX IF NOT EXISTS idx_${tableName}_type ON ${tableName}(type)`,
    `CREATE INDEX IF NOT EXISTS idx_${tableName}_product ON ${tableName}(productgroup)`,
    `CREATE INDEX IF NOT EXISTS idx_${tableName}_customer ON ${tableName}(customername)`,
    `CREATE INDEX IF NOT EXISTS idx_${tableName}_values ON ${tableName}(values_type)`
  ];
  
  for (const indexSQL of indexes) {
    await pool.query(indexSQL);
  }
  
  console.log(`✅ Created indexes for: ${tableName}`);
  console.log(`✅ Division ${newDiv.code} (${newDiv.name}) is ready!`);
}
```

---

## 🎯 Summary

### Current Status
| Operation | Status | Coverage |
|-----------|--------|----------|
| **Deletion** | ✅ Complete | 13 operations across 2 databases |
| **Creation** | ⚠️ Incomplete | Only logs message, doesn't create table |

### What's Missing
1. Table creation for new divisions (`{code}_data_excel`)
2. Index creation for performance
3. Validation of division code format
4. Decision on master data tables (FP-only vs per-division)

### Recommended Next Steps
1. Implement table creation logic in `server/routes/settings.js`
2. Test with a new division (e.g., "PP")
3. Verify table structure matches existing divisions
4. Update frontend to show "Creating..." status during division addition
5. Add error handling for duplicate division codes

---

## 🔒 Database Transaction Safety

Both operations should be wrapped in transactions:

```javascript
await client.query('BEGIN');
try {
  // DELETE or CREATE operations here
  await client.query('COMMIT');
  console.log('✅ Transaction committed');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('❌ Transaction rolled back:', error);
  throw error;
}
```

This ensures:
- All operations succeed or all fail (atomicity)
- No partial division creation/deletion
- Database integrity maintained

---

**Report Completed**: Ready for implementation of creation logic.
